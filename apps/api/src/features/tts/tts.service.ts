import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { VoiceSettingsService } from '../voice/voice-settings.service.js';
import { deriveKokoroVoiceLangCode } from './kokoro-voices.js';

export interface TtsSynthesisResult {
  provider: string;
  available: boolean;
  audioBase64: string | null;
  mimeType: string | null;
  error: string | null;
}

interface TtsProvider {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  synthesize(text: string): Promise<TtsSynthesisResult>;
}

const VOICE_MODEL_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

class NoneTtsProvider implements TtsProvider {
  async initialize() {}
  async shutdown() {}

  async synthesize(): Promise<TtsSynthesisResult> {
    return {
      provider: 'none',
      available: false,
      audioBase64: null,
      mimeType: null,
      error: null
    };
  }
}

interface KokoroWorkerResponse {
  id: string | null;
  ok: boolean;
  audio_base64?: string;
  mime_type?: string;
  error?: string;
  type?: string;
}

class WarmKokoroTtsProvider implements TtsProvider {
  private readonly voiceSettingsService = new VoiceSettingsService();
  private worker: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: TtsSynthesisResult) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private startupPromise: Promise<void> | null = null;
  private readyPromise: Promise<void> | null = null;

  async initialize() {
    await this.ensureWorker();
  }

  async shutdown() {
    if (this.worker && !this.worker.killed) {
      this.worker.kill('SIGTERM');
    }
    this.worker = null;
    this.startupPromise = null;
    this.readyPromise = null;
  }

  async synthesize(text: string): Promise<TtsSynthesisResult> {
    await this.ensureWorker();
    const voiceSettings = await this.voiceSettingsService.getResolvedSettings();
    const selectedVoice = voiceSettings.ttsVoice?.trim() || env.kokoroVoice;

    const worker = this.worker;
    if (!worker) {
      return {
        provider: 'kokoro',
        available: false,
        audioBase64: null,
        mimeType: null,
        error: 'Kokoro worker is unavailable.'
      };
    }

    const requestId = crypto.randomUUID();

    return new Promise<TtsSynthesisResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });

      worker.stdin.write(
        `${JSON.stringify({
          id: requestId,
          text,
          voice: selectedVoice,
          lang_code: deriveKokoroVoiceLangCode(selectedVoice, env.kokoroLangCode),
          speed: env.kokoroSpeed
        })}\n`
      );
    });
  }

  private async ensureWorker() {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this.startWorker();
    return this.startupPromise;
  }

  private async startWorker() {
    logger.info('voice.tts.worker.starting', {
      provider: 'kokoro'
    });

    const child = spawn('/bin/zsh', ['-lc', env.kokoroWorkerCommand], {
      env: {
        ...process.env
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.worker = child;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Kokoro worker did not become ready in time.'));
      }, 30_000);

      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };

      child.once('error', onError);
      child.once('spawn', () => undefined);

      const output = readline.createInterface({ input: child.stdout });
      output.on('line', (line) => {
        let payload: KokoroWorkerResponse;
        try {
          payload = JSON.parse(line) as KokoroWorkerResponse;
        } catch {
          logger.warn('voice.tts.worker.stdout.unparsed', {
            provider: 'kokoro',
            line
          });
          return;
        }

        if (payload.type === 'ready') {
          child.removeListener('error', onError);
          logger.info('voice.tts.worker.ready', {
            provider: 'kokoro'
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
          pending.resolve({
            provider: 'kokoro',
            available: false,
            audioBase64: null,
            mimeType: null,
            error: payload.error ?? 'Kokoro worker synthesis failed.'
          });
          return;
        }

        pending.resolve({
          provider: 'kokoro',
          available: true,
          audioBase64: payload.audio_base64 ?? null,
          mimeType: payload.mime_type ?? 'audio/wav',
          error: null
        });
      });
    });

    const errorOutput = readline.createInterface({ input: child.stderr });
    errorOutput.on('line', (line) => {
      logger.warn('voice.tts.worker.stderr', {
        provider: 'kokoro',
        line
      });
    });

    child.on('error', (error) => {
      logger.error('voice.tts.worker.failed', {
        provider: 'kokoro',
        error: error.message
      });
    });

    child.on('close', (code, signal) => {
      logger.warn('voice.tts.worker.closed', {
        provider: 'kokoro',
        code,
        signal
      });

      for (const pending of this.pending.values()) {
        pending.reject(new Error('Kokoro worker closed before completing synthesis.'));
      }

      this.pending.clear();
      this.worker = null;
      this.startupPromise = null;
      this.readyPromise = null;
    });

    await this.readyPromise;
  }
}

export class TtsService {
  private readonly provider: TtsProvider;
  private readonly legacyOutputDir = path.join(process.cwd(), 'data', 'generated-audio');
  private cooldownTimer: NodeJS.Timeout | null = null;
  private activeRequests = 0;
  private persistentWarmup = false;

  constructor() {
    this.provider = this.createProvider();
  }

  async initialize() {
    await fs.rm(this.legacyOutputDir, { recursive: true, force: true });
  }

  async shutdown() {
    this.persistentWarmup = false;
    this.clearCooldownTimer();
    await this.provider.shutdown();
  }

  async warmup() {
    this.clearCooldownTimer();
    await this.provider.initialize();
    this.scheduleCooldown('warmup');
  }

  async enablePersistentWarmup() {
    this.persistentWarmup = true;
    this.clearCooldownTimer();
    await this.provider.initialize();
  }

  disablePersistentWarmup() {
    this.persistentWarmup = false;
    this.scheduleCooldown('persistent_release');
  }

  beginIdleCooldown() {
    this.scheduleCooldown('session_idle');
  }

  async synthesize(text: string) {
    if (!text.trim()) {
      return {
        provider: env.ttsProvider,
        available: false,
        audioBase64: null,
        mimeType: null,
        error: 'Missing text for synthesis.'
      } satisfies TtsSynthesisResult;
    }

    this.clearCooldownTimer();
    this.activeRequests += 1;

    try {
      await this.provider.initialize();
      return await this.provider.synthesize(text);
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.scheduleCooldown('request_complete');
    }
  }

  private createProvider(): TtsProvider {
    if (env.ttsProvider === 'kokoro') {
      return new WarmKokoroTtsProvider();
    }

    return new NoneTtsProvider();
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

    logger.info('voice.tts.provider.cooldown', {
      provider: env.ttsProvider,
      reason
    });
    await this.provider.shutdown();
  }
}
