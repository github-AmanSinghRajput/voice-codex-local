import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getRootDir } from './store.js';

const execFileAsync = promisify(execFile);

export interface AudioBridgeInfo {
  available: boolean;
  inputDeviceLabel: string | null;
  outputDeviceLabel: string | null;
  error: string | null;
}

interface AudioBridgeEvent {
  type: 'ready' | 'partial' | 'final' | 'error';
  transcript?: string;
  inputDeviceLabel?: string | null;
  message?: string;
}

interface ListenTurnOptions {
  silenceWindowMs: number;
  locale: string;
  signal?: AbortSignal;
  onReady?: (inputDeviceLabel: string | null) => void;
  onPartial?: (transcript: string) => void;
}

interface SpeakTextOptions {
  voice?: string;
  rate?: number;
}

export interface ActiveSpeechPlayback {
  stop: () => void;
  done: Promise<void>;
}

const bridgeSourceFile = path.join(getRootDir(), 'native', 'macos-audio-bridge', 'main.swift');
const bridgeBinaryFile = path.join(getRootDir(), 'native', 'bin', 'macos-audio-bridge');
const swiftModuleCacheDir = path.join(getRootDir(), 'native', '.swift-module-cache');

function assertMacos() {
  if (process.platform !== 'darwin') {
    throw new Error('Native audio bridge currently supports macOS only.');
  }
}

async function ensureBridgeBinary() {
  assertMacos();

  const sourceStats = await fs.stat(bridgeSourceFile);
  await fs.mkdir(path.dirname(bridgeBinaryFile), { recursive: true });
  await fs.mkdir(swiftModuleCacheDir, { recursive: true });

  let shouldBuild = false;
  try {
    const binaryStats = await fs.stat(bridgeBinaryFile);
    shouldBuild = binaryStats.mtimeMs < sourceStats.mtimeMs;
  } catch {
    shouldBuild = true;
  }

  if (!shouldBuild) {
    return bridgeBinaryFile;
  }

  await execFileAsync(
    'swiftc',
    [
      bridgeSourceFile,
      '-o',
      bridgeBinaryFile,
      '-module-cache-path',
      swiftModuleCacheDir,
      '-framework',
      'AVFoundation',
      '-framework',
      'Speech'
    ],
    {
      cwd: getRootDir(),
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 8
    }
  );

  return bridgeBinaryFile;
}

function parseLastJsonObject(buffer: string) {
  const lines = buffer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Native audio bridge returned no data.');
  }

  return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
}

export async function getAudioBridgeInfo(): Promise<AudioBridgeInfo> {
  if (process.platform !== 'darwin') {
    return {
      available: false,
      inputDeviceLabel: null,
      outputDeviceLabel: null,
      error: 'Native audio bridge currently supports macOS only.'
    };
  }

  try {
    const binary = await ensureBridgeBinary();
    const { stdout } = await execFileAsync(binary, ['devices'], {
      cwd: getRootDir(),
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });

    const payload = parseLastJsonObject(stdout);
    return {
      available: true,
      inputDeviceLabel:
        typeof payload.inputDeviceLabel === 'string' ? payload.inputDeviceLabel : null,
      outputDeviceLabel:
        typeof payload.outputDeviceLabel === 'string' ? payload.outputDeviceLabel : null,
      error: null
    };
  } catch (error) {
    return {
      available: false,
      inputDeviceLabel: null,
      outputDeviceLabel: null,
      error: error instanceof Error ? error.message : 'Unable to initialize native audio bridge.'
    };
  }
}

export async function listenForSpeechTurn(options: ListenTurnOptions) {
  const binary = await ensureBridgeBinary();

  return new Promise<{ transcript: string; inputDeviceLabel: string | null }>((resolve, reject) => {
    const child = spawn(
      binary,
      [
        'listen',
        '--silence-ms',
        String(options.silenceWindowMs),
        '--locale',
        options.locale
      ],
      {
        cwd: getRootDir(),
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let finalTranscript = '';
    let inputDeviceLabel: string | null = null;
    let settled = false;

    const settleError = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(message));
    };

    const settleSuccess = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        transcript: finalTranscript.trim(),
        inputDeviceLabel
      });
    };

    const parseStdout = () => {
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        let event: AudioBridgeEvent;
        try {
          event = JSON.parse(line) as AudioBridgeEvent;
        } catch {
          continue;
        }

        if (event.type === 'ready') {
          inputDeviceLabel = event.inputDeviceLabel ?? null;
          options.onReady?.(inputDeviceLabel);
          continue;
        }

        if (event.type === 'partial') {
          options.onPartial?.(event.transcript?.trim() ?? '');
          continue;
        }

        if (event.type === 'final') {
          finalTranscript = event.transcript?.trim() ?? '';
          continue;
        }

        if (event.type === 'error') {
          settleError(event.message ?? 'Native speech capture failed.');
          child.kill('SIGTERM');
          return;
        }
      }
    };

    const abortHandler = () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    };

    options.signal?.addEventListener('abort', abortHandler, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      parseStdout();
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk;
    });

    child.on('error', (error) => {
      settleError(error.message);
    });

    child.on('close', (code, signal) => {
      options.signal?.removeEventListener('abort', abortHandler);
      parseStdout();

      if (settled) {
        return;
      }

      if (options.signal?.aborted) {
        settleSuccess();
        return;
      }

      if (code === 0 || signal === 'SIGTERM') {
        settleSuccess();
        return;
      }

      settleError(stderrBuffer.trim() || 'Native speech capture exited unexpectedly.');
    });
  });
}

export function speakThroughSystem(text: string, options: SpeakTextOptions = {}): ActiveSpeechPlayback {
  const args: string[] = [];

  if (options.voice) {
    args.push('-v', options.voice);
  }

  if (typeof options.rate === 'number' && Number.isFinite(options.rate)) {
    args.push('-r', String(options.rate));
  }

  args.push(text);

  const child = spawn('/usr/bin/say', args, {
    cwd: getRootDir(),
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let stderrBuffer = '';

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderrBuffer += chunk;
  });

  return {
    stop: () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    },
    done: new Promise<void>((resolve, reject) => {
      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code, signal) => {
        if (code === 0 || signal === 'SIGTERM') {
          resolve();
          return;
        }

        reject(new Error(stderrBuffer.trim() || 'Speech playback failed.'));
      });
    })
  };
}
