import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { VoiceSettingsService } from './voice-settings.service.js';

interface AssemblyAiUploadResponse {
  upload_url?: string;
  error?: string;
}

interface AssemblyAiTranscriptCreateResponse {
  id?: string;
  error?: string;
}

interface AssemblyAiTranscriptPollResponse {
  status?: string;
  text?: string;
  error?: string;
}

interface WhisperServerResponse {
  text?: string;
  error?: string;
}

interface VoiceTranscriptionResult {
  provider: string;
  transcript: string;
  fallbackUsed: boolean;
  warnings: string[];
}

interface TranscriptionRuntimeConfig {
  provider: 'whisper-local' | 'moonshine-local';
  modelPath: string;
  languageCode: string;
  modelProfile: 'default' | 'multilingual-small' | 'moonshine-base' | 'moonshine-tiny';
  multilingualAvailable: boolean;
  moonshineModelName: string | null;
  warnings?: string[];
}

interface SttProvider {
  readonly name: string;
  initialize(config?: TranscriptionRuntimeConfig): Promise<void>;
  shutdown(): Promise<void>;
  transcribe(buffer: Buffer, mimeType: string, config?: TranscriptionRuntimeConfig): Promise<string>;
}

const ASSEMBLY_AI_BASE_URL = 'https://api.assemblyai.com/v2';
const VOICE_MODEL_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

class AssemblyAiSttProvider implements SttProvider {
  readonly name = 'assemblyai';

  async initialize() {}
  async shutdown() {}

  async transcribe(buffer: Buffer, mimeType: string) {
    const uploadUrl = await this.uploadAudio(buffer, mimeType);
    const transcriptId = await this.createTranscript(uploadUrl);
    return this.pollTranscript(transcriptId);
  }

  private async uploadAudio(buffer: Buffer, mimeType: string) {
    const response = await fetch(`${ASSEMBLY_AI_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        authorization: env.assemblyAiApiKey,
        'content-type': mimeType || 'application/octet-stream'
      },
      body: new Uint8Array(buffer)
    });

    const body = (await response.json()) as AssemblyAiUploadResponse;
    if (!response.ok || !body.upload_url) {
      throw new AppError(
        502,
        body.error || 'AssemblyAI audio upload failed.',
        'ASSEMBLYAI_UPLOAD_FAILED'
      );
    }

    return body.upload_url;
  }

  private async createTranscript(uploadUrl: string) {
    const transcriptRequest: Record<string, unknown> = {
      audio_url: uploadUrl,
      speech_models: ['universal-3-pro', 'universal-2'],
      punctuate: true,
      format_text: true,
      speaker_labels: env.transcriptionSpeakerLabels
    };

    if (env.transcriptionLanguageCode.trim().toLowerCase() === 'auto') {
      transcriptRequest.language_detection = true;
    } else {
      transcriptRequest.language_code = env.transcriptionLanguageCode;
    }

    const response = await fetch(`${ASSEMBLY_AI_BASE_URL}/transcript`, {
      method: 'POST',
      headers: {
        authorization: env.assemblyAiApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(transcriptRequest)
    });

    const body = (await response.json()) as AssemblyAiTranscriptCreateResponse;
    if (!response.ok || !body.id) {
      throw new AppError(
        502,
        body.error || 'AssemblyAI transcript creation failed.',
        'ASSEMBLYAI_CREATE_FAILED'
      );
    }

    return body.id;
  }

  private async pollTranscript(transcriptId: string) {
    const startedAt = Date.now();
    const timeoutMs = 180_000;

    while (Date.now() - startedAt < timeoutMs) {
      const response = await fetch(`${ASSEMBLY_AI_BASE_URL}/transcript/${transcriptId}`, {
        headers: {
          authorization: env.assemblyAiApiKey
        }
      });

      const body = (await response.json()) as AssemblyAiTranscriptPollResponse;
      if (!response.ok) {
        throw new AppError(
          502,
          body.error || 'AssemblyAI transcript polling failed.',
          'ASSEMBLYAI_POLL_FAILED'
        );
      }

      if (body.status === 'completed') {
        return body.text ?? '';
      }

      if (body.status === 'error') {
        throw new AppError(
          502,
          body.error || 'AssemblyAI transcription failed.',
          'ASSEMBLYAI_TRANSCRIPT_FAILED'
        );
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 2500);
      });
    }

    throw new AppError(504, 'AssemblyAI transcription timed out.', 'ASSEMBLYAI_TIMEOUT');
  }
}

class WhisperWarmServerProvider implements SttProvider {
  readonly name = 'whisper-local';

  private process: ChildProcess | null = null;
  private startupPromise: Promise<void> | null = null;
  private currentConfigKey: string | null = null;

  async initialize(config?: TranscriptionRuntimeConfig) {
    if (!config) {
      throw new Error('Whisper runtime config is required for initialization.');
    }

    await this.ensureServer(config);
  }

  async shutdown() {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }
    this.process = null;
    this.startupPromise = null;
    this.currentConfigKey = null;
  }

  async transcribe(buffer: Buffer, mimeType: string, config?: TranscriptionRuntimeConfig) {
    if (!config) {
      throw new Error('Whisper runtime config is required for transcription.');
    }

    await this.ensureServer(config);

    const extension = inferAudioExtension(mimeType);
    const file = new File([new Uint8Array(buffer)], `turn${extension}`, {
      type: mimeType || 'application/octet-stream'
    });
    const form = new FormData();
    form.append('file', file);
    form.append('response_format', 'json');
    form.append('temperature', '0.0');
    form.append('temperature_inc', '0.2');
    form.append('no_language_probabilities', 'true');

    if (config.languageCode.trim().toLowerCase() === 'auto') {
      form.append('language', 'auto');
      form.append('detect_language', 'true');
    } else {
      form.append('language', config.languageCode);
    }

    const response = await fetch(this.getInferenceUrl(), {
      method: 'POST',
      body: form
    });

    const body = (await response.json()) as WhisperServerResponse;
    if (!response.ok) {
      throw new AppError(
        502,
        body.error || 'Whisper local server transcription failed.',
        'WHISPER_SERVER_FAILED'
      );
    }

    return body.text?.trim() ?? '';
  }

  private ensureServer(config: TranscriptionRuntimeConfig) {
    const nextConfigKey = JSON.stringify({
      modelPath: config.modelPath
    });

    if (this.process && this.currentConfigKey && this.currentConfigKey !== nextConfigKey) {
      const restartPromise = this.shutdown().then(() => this.startServer(config, nextConfigKey));
      this.startupPromise = restartPromise.catch((error) => {
        this.startupPromise = null;
        throw error;
      });
      return this.startupPromise;
    }

    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this.startServer(config, nextConfigKey).catch((error) => {
      this.startupPromise = null;
      throw error;
    });
    return this.startupPromise;
  }

  private async startServer(config: TranscriptionRuntimeConfig, configKey: string) {
    logger.info('voice.transcription.whisper_server.starting', {
      modelPath: config.modelPath,
      languageCode: config.languageCode,
      modelProfile: config.modelProfile,
      port: env.whisperServerPort
    });

    const whisperRoot = path.dirname(path.dirname(config.modelPath));
    const binaryPath = path.join(whisperRoot, 'build', 'bin', 'whisper-server');

    const child = spawn(
      binaryPath,
      [
        '--host',
        '127.0.0.1',
        '--port',
        String(env.whisperServerPort),
        '--convert',
        '-ng',
        '-nt',
        '-m',
        config.modelPath,
        '-l',
        config.languageCode.trim().toLowerCase() === 'auto'
          ? 'auto'
          : config.languageCode
      ],
      {
        cwd: whisperRoot,
        env: {
          ...process.env
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    this.process = child;

    if (!child.stdout || !child.stderr) {
      throw new Error('Whisper server process did not expose stdout/stderr pipes.');
    }

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on('line', (line) => {
      logger.info('voice.transcription.whisper_server.stdout', {
        line
      });
    });

    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on('line', (line) => {
      logger.warn('voice.transcription.whisper_server.stderr', {
        line
      });
    });

    child.on('close', (code, signal) => {
      logger.warn('voice.transcription.whisper_server.closed', {
        code,
        signal
      });
      this.process = null;
      this.startupPromise = null;
      this.currentConfigKey = null;
    });

    await waitForEndpoint(this.getBaseUrl(), 30_000);
    this.currentConfigKey = configKey;

    logger.info('voice.transcription.whisper_server.ready', {
      baseUrl: this.getBaseUrl(),
      modelPath: config.modelPath,
      languageCode: config.languageCode
    });
  }

  private getBaseUrl() {
    return `http://127.0.0.1:${env.whisperServerPort}`;
  }

  private getInferenceUrl() {
    return `${this.getBaseUrl()}/inference`;
  }
}

interface MoonshineWorkerResponse {
  id: string | null;
  ok: boolean;
  transcript?: string;
  error?: string;
  type?: string;
}

class MoonshineWarmWorkerProvider implements SttProvider {
  readonly name = 'moonshine-local';

  private worker: ChildProcessWithoutNullStreams | null = null;
  private startupPromise: Promise<void> | null = null;
  private readyPromise: Promise<void> | null = null;
  private currentConfigKey: string | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: string) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  async initialize(config?: TranscriptionRuntimeConfig) {
    if (!config || !config.moonshineModelName) {
      throw new Error('Moonshine runtime config is required for initialization.');
    }

    await this.ensureWorker(config);
  }

  async shutdown() {
    if (this.worker && !this.worker.killed) {
      this.worker.kill('SIGTERM');
    }
    this.worker = null;
    this.startupPromise = null;
    this.readyPromise = null;
    this.currentConfigKey = null;
  }

  async transcribe(buffer: Buffer, mimeType: string, config?: TranscriptionRuntimeConfig) {
    if (!config || !config.moonshineModelName) {
      throw new Error('Moonshine runtime config is required for transcription.');
    }

    await this.ensureWorker(config);
    const worker = this.worker;
    if (!worker || !worker.stdin) {
      throw new Error('Moonshine worker is unavailable.');
    }

    const extension = inferAudioExtension(mimeType);
    const tempFilePath = path.join(os.tmpdir(), `vocod-moonshine-${crypto.randomUUID()}${extension}`);
    await fs.writeFile(tempFilePath, buffer);

    try {
      const requestId = crypto.randomUUID();

      const modelName = config.moonshineModelName;
      return await new Promise<string>((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject });
        worker.stdin.write(
          `${JSON.stringify({
            id: requestId,
            audio_path: tempFilePath,
            model: modelName
          })}\n`
        );
      });
    } finally {
      await fs.rm(tempFilePath, { force: true });
    }
  }

  private ensureWorker(config: TranscriptionRuntimeConfig) {
    const nextConfigKey = JSON.stringify({
      moonshineModelName: config.moonshineModelName
    });

    if (this.worker && this.currentConfigKey && this.currentConfigKey !== nextConfigKey) {
      const restartPromise = this.shutdown().then(() => this.startWorker(config, nextConfigKey));
      this.startupPromise = restartPromise.catch((error) => {
        this.startupPromise = null;
        throw error;
      });
      return this.startupPromise;
    }

    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this.startWorker(config, nextConfigKey).catch((error) => {
      this.startupPromise = null;
      throw error;
    });
    return this.startupPromise;
  }

  private async startWorker(config: TranscriptionRuntimeConfig, configKey: string) {
    const modelName = config.moonshineModelName ?? env.moonshineModel;
    logger.info('voice.transcription.moonshine_worker.starting', {
      model: modelName
    });

    const child = spawn('/bin/zsh', ['-lc', env.moonshineWorkerCommand], {
      env: {
        ...process.env,
        MOONSHINE_MODEL: modelName
      },
      stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams;

    this.worker = child;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Moonshine worker did not become ready in time.'));
      }, 45_000);

      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };

      child.once('error', onError);

      const output = readline.createInterface({ input: child.stdout });
      output.on('line', (line) => {
        let payload: MoonshineWorkerResponse;
        try {
          payload = JSON.parse(line) as MoonshineWorkerResponse;
        } catch {
          logger.warn('voice.transcription.moonshine_worker.stdout.unparsed', { line });
          return;
        }

        if (payload.type === 'ready') {
          child.removeListener('error', onError);
          logger.info('voice.transcription.moonshine_worker.ready', {
            model: modelName
          });
          onReady();
          return;
        }

        if (!payload.id) {
          return;
        }

        const pending = this.pending.get(payload.id);
        if (!pending) {
          return;
        }

        this.pending.delete(payload.id);

        if (!payload.ok) {
          pending.reject(new Error(payload.error ?? 'Moonshine transcription failed.'));
          return;
        }

        pending.resolve(payload.transcript?.trim() ?? '');
      });
    });

    const errorOutput = readline.createInterface({ input: child.stderr });
    errorOutput.on('line', (line) => {
      logger.warn('voice.transcription.moonshine_worker.stderr', { line });
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      logger.warn('voice.transcription.moonshine_worker.closed', {
        code,
        signal
      });

      for (const pending of this.pending.values()) {
        pending.reject(new Error('Moonshine worker closed before completing transcription.'));
      }

      this.pending.clear();
      this.worker = null;
      this.startupPromise = null;
      this.readyPromise = null;
      this.currentConfigKey = null;
    });

    await this.readyPromise;
    this.currentConfigKey = configKey;
  }
}

export class VoiceTranscriptionService {
  private readonly providers = this.createProviders();
  private readonly voiceSettingsService = new VoiceSettingsService();
  private cooldownTimer: NodeJS.Timeout | null = null;
  private activeRequests = 0;
  private persistentWarmup = false;

  async initialize() {}

  async shutdown() {
    this.persistentWarmup = false;
    this.clearCooldownTimer();
    await this.shutdownProviders('service_shutdown');
  }

  async warmup() {
    this.clearCooldownTimer();
    const config = await this.voiceSettingsService.getResolvedTranscriptionConfig();
    const primaryProvider = this.getPrimaryProvider(config);
    if (!primaryProvider) {
      return;
    }
    await primaryProvider.initialize(config);
    this.scheduleCooldown('warmup');
  }

  async enablePersistentWarmup() {
    this.persistentWarmup = true;
    this.clearCooldownTimer();
    const config = await this.voiceSettingsService.getResolvedTranscriptionConfig();
    const primaryProvider = this.getPrimaryProvider(config);
    if (!primaryProvider) {
      return;
    }
    await primaryProvider.initialize(config);
  }

  disablePersistentWarmup() {
    this.persistentWarmup = false;
    this.scheduleCooldown('persistent_release');
  }

  beginIdleCooldown() {
    this.scheduleCooldown('session_idle');
  }

  async transcribeAudio(buffer: Buffer, mimeType: string): Promise<VoiceTranscriptionResult> {
    if (buffer.length === 0) {
      throw new AppError(400, 'Voice audio payload was empty.', 'VOICE_AUDIO_EMPTY');
    }

    const transcriptionConfig = await this.voiceSettingsService.getResolvedTranscriptionConfig();
    const primaryProvider = this.getPrimaryProvider(transcriptionConfig);
    if (!primaryProvider) {
      throw new AppError(
        503,
        'Speech transcription provider is not configured.',
        'VOICE_STT_UNAVAILABLE'
      );
    }

    this.clearCooldownTimer();
    this.activeRequests += 1;
    const warnings: string[] = [...(transcriptionConfig.warnings ?? [])];
    const fallbackProvider = this.getFallbackProvider(primaryProvider.name);

    try {
      logger.info('voice.transcription.primary.started', {
        provider: primaryProvider.name,
        languageCode: transcriptionConfig.languageCode,
        modelProfile: transcriptionConfig.modelProfile,
        bytes: buffer.length,
        mimeType
      });
      const transcript = await primaryProvider.transcribe(buffer, mimeType, transcriptionConfig);
      logger.info('voice.transcription.primary.completed', {
        provider: primaryProvider.name,
        transcriptLength: transcript.length
      });
      return this.buildResult(primaryProvider.name, transcript, false, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transcription failure.';
      logger.error('voice.transcription.primary.failed', {
        provider: primaryProvider.name,
        error: message
      });

      if (!fallbackProvider || fallbackProvider.name === primaryProvider.name) {
        throw error;
      }

      warnings.push(`Primary STT provider failed: ${message}`);
      logger.warn('voice.transcription.fallback.started', {
        primaryProvider: primaryProvider.name,
        fallbackProvider: fallbackProvider.name,
        reason: message
      });

      try {
        const transcript = await fallbackProvider.transcribe(buffer, mimeType, transcriptionConfig);
        logger.info('voice.transcription.fallback.completed', {
          fallbackProvider: fallbackProvider.name,
          transcriptLength: transcript.length
        });
        return this.buildResult(fallbackProvider.name, transcript, true, warnings);
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback failure.';
        logger.error('voice.transcription.fallback.failed', {
          fallbackProvider: fallbackProvider.name,
          error: fallbackMessage
        });
        warnings.push(`Fallback STT provider failed: ${fallbackMessage}`);

        throw new AppError(
          502,
          `Primary STT failed (${message}). Fallback STT failed (${fallbackMessage}).`,
          'VOICE_STT_CHAIN_FAILED',
          { warnings }
        );
      }
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.scheduleCooldown('request_complete');
    }
  }

  private buildResult(
    provider: string,
    transcript: string,
    fallbackUsed: boolean,
    warnings: string[]
  ): VoiceTranscriptionResult {
    if (!transcript.trim()) {
      throw new AppError(422, 'No speech was detected in the recorded audio.', 'VOICE_TRANSCRIPT_EMPTY', {
        provider,
        fallbackUsed,
        warnings
      });
    }

    return {
      provider,
      transcript: transcript.trim(),
      fallbackUsed,
      warnings
    };
  }

  private createProviders() {
    return {
      assemblyai: new AssemblyAiSttProvider(),
      'whisper-local': new WhisperWarmServerProvider(),
      'moonshine-local': new MoonshineWarmWorkerProvider()
    } satisfies Record<'assemblyai' | 'whisper-local' | 'moonshine-local', SttProvider>;
  }

  private getPrimaryProvider(config: TranscriptionRuntimeConfig): SttProvider | null {
    if (config.provider === 'moonshine-local' && env.moonshineWorkerCommand) {
      return this.providers['moonshine-local'];
    }

    if (config.provider === 'whisper-local' && env.whisperModelPath) {
      return this.providers['whisper-local'];
    }

    if (env.sttProvider === 'assemblyai') {
      return this.providers.assemblyai;
    }

    return null;
  }

  private getFallbackProvider(primaryProviderName: string): SttProvider | null {
    if (primaryProviderName === 'moonshine-local' && env.whisperModelPath) {
      return this.providers['whisper-local'];
    }

    if (primaryProviderName === 'whisper-local' && env.moonshineWorkerCommand && env.sttFallbackProvider === 'moonshine-local') {
      return this.providers['moonshine-local'];
    }

    if (env.sttFallbackProvider === 'whisper-local' && env.whisperModelPath) {
      return this.providers['whisper-local'];
    }

    if (env.sttFallbackProvider === 'moonshine-local' && env.moonshineWorkerCommand) {
      return this.providers['moonshine-local'];
    }

    if (env.sttFallbackProvider === 'assemblyai') {
      return this.providers.assemblyai;
    }

    return null;
  }

  private clearCooldownTimer() {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  private scheduleCooldown(reason: string) {
    if (this.persistentWarmup) {
      return;
    }

    this.clearCooldownTimer();
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      void this.shutdownIfIdle(reason);
    }, VOICE_MODEL_IDLE_TIMEOUT_MS);
    this.cooldownTimer.unref?.();
  }

  private async shutdownIfIdle(reason: string) {
    if (this.activeRequests > 0) {
      this.scheduleCooldown('activity_in_progress');
      return;
    }

    await this.shutdownProviders(reason);
  }

  private async shutdownProviders(reason: string) {
    for (const provider of Object.values(this.providers)) {
      logger.info('voice.transcription.provider.cooldown', {
        provider: provider.name,
        reason
      });
      await provider.shutdown();
    }
  }
}

function inferAudioExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mp4')) {
    return '.m4a';
  }
  if (normalized.includes('wav')) {
    return '.wav';
  }
  if (normalized.includes('mpeg')) {
    return '.mp3';
  }
  if (normalized.includes('ogg')) {
    return '.ogg';
  }

  return '.webm';
}

async function waitForEndpoint(url: string, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(`Whisper server did not become ready within ${timeoutMs}ms.`);
}
