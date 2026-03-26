import path from 'node:path';
import dotenv from 'dotenv';
import { getRootDir } from '../store.js';

dotenv.config({ path: path.join(getRootDir(), '.env') });

function getNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
}

function assertOneOf(value: string, fieldName: string, validValues: string[]) {
  if (!validValues.includes(value)) {
    throw new Error(`${fieldName} must be one of ${validValues.join(', ')}. Received: ${value}`);
  }
}

export const env = {
  appEnv: process.env.APP_ENV ?? 'development',
  port: getNumber(process.env.API_PORT, 8787),
  allowedOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  voiceLocale: process.env.VOICE_LOCALE ?? 'en-US',
  codexModel: process.env.CODEX_MODEL?.trim() || '',
  codexReasoningEffort: process.env.CODEX_REASONING_EFFORT?.trim() || '',
  sttProvider: process.env.STT_PROVIDER ?? 'none',
  sttFallbackProvider: process.env.STT_FALLBACK_PROVIDER ?? 'none',
  whisperModelPath: process.env.WHISPER_MODEL_PATH?.trim() || '',
  whisperMultilingualModelPath: process.env.WHISPER_MULTILINGUAL_MODEL_PATH?.trim() || '',
  whisperServerPort: getNumber(process.env.WHISPER_SERVER_PORT, 8791),
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY?.trim() || '',
  transcriptionLanguageCode: process.env.TRANSCRIPTION_LANGUAGE_CODE?.trim() || 'en',
  transcriptionSpeakerLabels: getBoolean(process.env.ASSEMBLYAI_SPEAKER_DIARIZATION, false),
  ttsProvider: process.env.TTS_PROVIDER ?? 'none',
  kokoroCommand: process.env.KOKORO_COMMAND?.trim() || '',
  kokoroWorkerCommand: process.env.KOKORO_WORKER_COMMAND?.trim() || '',
  kokoroVoice: process.env.KOKORO_VOICE?.trim() || 'af_heart',
  kokoroLangCode: process.env.KOKORO_LANG_CODE?.trim() || 'a',
  kokoroSpeed: getNumber(process.env.KOKORO_SPEED, 1),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  databaseSsl: getBoolean(process.env.DATABASE_SSL, false),
  queueProvider: process.env.QUEUE_PROVIDER ?? 'inline',
  emailProvider: process.env.EMAIL_PROVIDER ?? 'none',
  vectorProvider: process.env.VECTOR_PROVIDER ?? 'none',
  ragProvider: process.env.RAG_PROVIDER ?? 'none',
  ocrProvider: process.env.OCR_PROVIDER ?? 'none'
};

export function validateEnv() {
  const validEnvironments = new Set(['development', 'test', 'production']);
  const providerValues = ['none', 'inline', 'redis'];
  const integrationValues = ['none', 'postgres', 'provider'];

  if (!validEnvironments.has(env.appEnv)) {
    throw new Error(`APP_ENV must be one of development, test, production. Received: ${env.appEnv}`);
  }

  if (!env.allowedOrigin.trim()) {
    throw new Error('CORS_ORIGIN must not be empty.');
  }

  try {
    new URL(env.allowedOrigin);
  } catch {
    throw new Error(`CORS_ORIGIN must be a valid absolute URL. Received: ${env.allowedOrigin}`);
  }

  if (env.port <= 0) {
    throw new Error(`API_PORT must be a positive number. Received: ${env.port}`);
  }

  if (env.kokoroSpeed <= 0) {
    throw new Error(`KOKORO_SPEED must be a positive number. Received: ${env.kokoroSpeed}`);
  }

  if (env.codexReasoningEffort) {
    assertOneOf(env.codexReasoningEffort, 'CODEX_REASONING_EFFORT', ['minimal', 'low', 'medium', 'high', 'xhigh']);
  }

  assertOneOf(env.queueProvider, 'QUEUE_PROVIDER', providerValues);
  assertOneOf(env.sttProvider, 'STT_PROVIDER', ['none', 'assemblyai', 'whisper-local']);
  assertOneOf(env.sttFallbackProvider, 'STT_FALLBACK_PROVIDER', ['none', 'assemblyai']);
  assertOneOf(env.ttsProvider, 'TTS_PROVIDER', ['none', 'kokoro', 'piper']);
  assertOneOf(env.emailProvider, 'EMAIL_PROVIDER', ['none', 'resend', 'sendgrid']);
  assertOneOf(env.vectorProvider, 'VECTOR_PROVIDER', integrationValues);
  assertOneOf(env.ragProvider, 'RAG_PROVIDER', ['none', 'postgres']);
  assertOneOf(env.ocrProvider, 'OCR_PROVIDER', ['none', 'textract', 'vision']);

  if (env.appEnv === 'production' && !env.databaseUrl) {
    throw new Error('DATABASE_URL is required in production.');
  }

  if (env.sttProvider === 'assemblyai' && !env.assemblyAiApiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is required when STT_PROVIDER=assemblyai.');
  }

  if (env.sttProvider === 'whisper-local' && !env.whisperModelPath) {
    throw new Error('WHISPER_MODEL_PATH is required when STT_PROVIDER=whisper-local.');
  }

  if (env.whisperServerPort <= 0) {
    throw new Error(`WHISPER_SERVER_PORT must be a positive number. Received: ${env.whisperServerPort}`);
  }

  if (env.sttFallbackProvider === 'assemblyai' && !env.assemblyAiApiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is required when STT_FALLBACK_PROVIDER=assemblyai.');
  }

  if (env.ttsProvider === 'kokoro' && !env.kokoroWorkerCommand) {
    throw new Error('KOKORO_WORKER_COMMAND is required when TTS_PROVIDER=kokoro.');
  }

  if (env.databaseUrl) {
    try {
      const parsed = new URL(env.databaseUrl);
      if (!parsed.protocol.startsWith('postgres')) {
        throw new Error('DATABASE_URL must use a postgres:// or postgresql:// URL.');
      }
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `DATABASE_URL is invalid. ${error.message}`
          : 'DATABASE_URL is invalid.'
      );
    }
  }
}
