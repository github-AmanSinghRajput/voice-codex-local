import AVFoundation
import Foundation
import Speech

struct JsonLineEmitter {
    static func send(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let text = String(data: data, encoding: .utf8) else {
            return
        }

        FileHandle.standardOutput.write(Data((text + "\n").utf8))
    }
}

final class SpeechTurnRecorder {
    private let silenceWindowMs: Int
    private let localeIdentifier: String
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var latestTranscript = ""
    private var lastVoiceAt = Date()
    private var detectedSpeech = false
    private var hasStopped = false
    private let threshold: Float = 0.015
    private let queue = DispatchQueue(label: "voice-codex.audio-bridge")

    init(silenceWindowMs: Int, localeIdentifier: String) {
        self.silenceWindowMs = silenceWindowMs
        self.localeIdentifier = localeIdentifier
    }

    func start() {
        requestSpeechAccess { [weak self] granted, errorMessage in
            guard let self else {
                exit(1)
            }

            if let errorMessage {
                JsonLineEmitter.send(["type": "error", "message": errorMessage])
                exit(1)
            }

            if !granted {
                JsonLineEmitter.send(["type": "error", "message": "Speech recognition permission was denied."])
                exit(1)
            }

            do {
                try self.beginCapture()
            } catch {
                JsonLineEmitter.send(["type": "error", "message": error.localizedDescription])
                exit(1)
            }
        }
    }

    private func requestSpeechAccess(completion: @escaping (Bool, String?) -> Void) {
        if #available(macOS 10.15, *) {
            SFSpeechRecognizer.requestAuthorization { status in
                switch status {
                case .authorized:
                    completion(true, nil)
                case .denied:
                    completion(false, nil)
                case .restricted:
                    completion(false, "Speech recognition is restricted on this machine.")
                case .notDetermined:
                    completion(false, "Speech recognition permission is not determined yet.")
                @unknown default:
                    completion(false, "Speech recognition is unavailable.")
                }
            }
            return
        }

        completion(false, "Speech recognition requires a newer macOS version.")
    }

    private func beginCapture() throws {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
            throw NSError(domain: "VoiceCodexAudioBridge", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Unable to create speech recognizer for locale \(localeIdentifier)."
            ])
        }

        if !recognizer.isAvailable {
            throw NSError(domain: "VoiceCodexAudioBridge", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Speech recognizer is not available right now."
            ])
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if #available(macOS 13.0, *) {
            request.addsPunctuation = true
        }
        if #available(macOS 13.0, *), recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.recognitionRequest?.append(buffer)
            self.processAudioLevel(buffer: buffer)
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }

            if let result {
                let transcript = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                if !transcript.isEmpty && transcript != self.latestTranscript {
                    self.latestTranscript = transcript
                    JsonLineEmitter.send(["type": "partial", "transcript": transcript])
                    self.detectedSpeech = true
                    self.lastVoiceAt = Date()
                }
            }

            if let error {
                if self.hasStopped {
                    return
                }

                JsonLineEmitter.send(["type": "error", "message": error.localizedDescription])
                self.stopAndExit(code: 1)
            }
        }

        audioEngine.prepare()
        try audioEngine.start()

        let inputDevice = AVCaptureDevice.default(for: .audio)?.localizedName
        JsonLineEmitter.send([
            "type": "ready",
            "inputDeviceLabel": inputDevice ?? NSNull()
        ])

        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }

            if self.hasStopped {
                timer.invalidate()
                return
            }

            let elapsedMs = Int(Date().timeIntervalSince(self.lastVoiceAt) * 1000)
            if self.detectedSpeech && elapsedMs >= self.silenceWindowMs {
                timer.invalidate()
                self.stopAndExit(code: 0)
            }
        }
    }

    private func processAudioLevel(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else {
            return
        }

        let frameLength = Int(buffer.frameLength)
        if frameLength == 0 {
            return
        }

        let samples = channelData[0]
        var sum: Float = 0

        for index in 0..<frameLength {
            sum += fabsf(samples[index])
        }

        let average = sum / Float(frameLength)

        queue.async {
            if average > self.threshold {
                self.detectedSpeech = true
                self.lastVoiceAt = Date()
            }
        }
    }

    private func stopAndExit(code: Int32) {
        if hasStopped {
            exit(code)
        }

        hasStopped = true
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.finish()

        JsonLineEmitter.send([
            "type": "final",
            "transcript": latestTranscript
        ])

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            exit(code)
        }
    }
}

func runDevicesCommand() {
    let inputDevice = AVCaptureDevice.default(for: .audio)?.localizedName
    JsonLineEmitter.send([
        "inputDeviceLabel": inputDevice ?? NSNull(),
        "outputDeviceLabel": "System Default Output"
    ])
}

func argumentValue(flag: String, in arguments: [String], fallback: String) -> String {
    guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else {
        return fallback
    }

    return arguments[index + 1]
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    JsonLineEmitter.send(["type": "error", "message": "Missing command."])
    exit(1)
}

switch arguments[1] {
case "devices":
    runDevicesCommand()
case "listen":
    let silenceWindowMs = Int(argumentValue(flag: "--silence-ms", in: arguments, fallback: "2000")) ?? 2000
    let localeIdentifier = argumentValue(flag: "--locale", in: arguments, fallback: "en-US")
    let recorder = SpeechTurnRecorder(silenceWindowMs: silenceWindowMs, localeIdentifier: localeIdentifier)
    recorder.start()
    RunLoop.main.run()
default:
    JsonLineEmitter.send(["type": "error", "message": "Unsupported command."])
    exit(1)
}
