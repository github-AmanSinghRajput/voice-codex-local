import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import type {
  AudioBridgeState,
  TranscriptionLanguageOption,
  TranscriptionModelOption,
  VoiceOption,
  VoiceNoiseMode,
  VoiceNarrationMode,
  VoiceQualityProfile,
  VoiceSettings,
  VoiceSettingsCapabilities
} from '../../types.js';
import { listAvailableKokoroVoices } from '../tts/kokoro-voices.js';
import { VoiceSettingsRepository } from './voice-settings.repository.js';

const defaultVoiceSettings: VoiceSettings = {
  silenceWindowMs: 800,
  voiceLocale: env.voiceLocale,
  autoResumeAfterReply: true,
  transcriptionLanguageCode: env.transcriptionLanguageCode,
  transcriptionModel: getInitialTranscriptionModel(),
  ttsVoice: env.kokoroVoice,
  narrationMode: 'silent_progress',
  qualityProfile: 'demo',
  noiseMode: 'focused'
};

interface UpdateVoiceSettingsInput {
  silenceWindowMs?: number;
  voiceLocale?: string;
  autoResumeAfterReply?: boolean;
  transcriptionLanguageCode?: string;
  transcriptionModel?: VoiceSettings['transcriptionModel'];
  ttsVoice?: string;
  narrationMode?: VoiceNarrationMode;
  qualityProfile?: VoiceQualityProfile;
  noiseMode?: VoiceNoiseMode;
}

export class VoiceSettingsService {
  constructor(private readonly repository: VoiceSettingsRepository = new VoiceSettingsRepository()) {}

  async getSettings() {
    const [persisted, voices, transcriptionModels] = await Promise.all([
      this.repository.get(),
      getVoiceOptions(),
      getTranscriptionModelOptions()
    ]);
    const settings = mergeVoiceSettings(persisted, voices);

    return {
      settings,
      capabilities: buildCapabilities(voices),
      options: {
        voices,
        transcriptionModels,
        transcriptionLanguages: getTranscriptionLanguageOptions()
      }
    };
  }

  async updateSettings(input: UpdateVoiceSettingsInput) {
    const [persisted, voices, transcriptionModels] = await Promise.all([
      this.repository.get(),
      getVoiceOptions(),
      getTranscriptionModelOptions()
    ]);
    const current = mergeVoiceSettings(persisted, voices);
    const draft = {
      ...current,
      ...input
    };

    if (input.qualityProfile) {
      const profileDefaults = getVoiceProfileDefaults(input.qualityProfile);
      if (input.silenceWindowMs === undefined) {
        draft.silenceWindowMs = profileDefaults.silenceWindowMs;
      }
      if (input.transcriptionLanguageCode === undefined) {
        draft.transcriptionLanguageCode = profileDefaults.transcriptionLanguageCode;
      }
      if (input.transcriptionModel === undefined) {
        draft.transcriptionModel = profileDefaults.transcriptionModel;
      }
    }

    const nextSettings = sanitizeVoiceSettings(
      draft,
      voices
    );

    await this.repository.save(nextSettings);

    return {
      settings: nextSettings,
      capabilities: buildCapabilities(voices),
      options: {
        voices,
        transcriptionModels,
        transcriptionLanguages: getTranscriptionLanguageOptions()
      }
    };
  }

  async getResolvedSettings() {
    const [persisted, voices] = await Promise.all([this.repository.get(), getVoiceOptions()]);
    return mergeVoiceSettings(persisted, voices);
  }

  async buildSettingsPayload(audio: AudioBridgeState) {
    const payload = await this.getSettings();

    return {
      ...payload,
      currentDevices: {
        inputLabel: audio.inputDeviceLabel,
        outputLabel: audio.outputDeviceLabel
      }
    };
  }

  async getResolvedTranscriptionConfig() {
    const settings = await this.getResolvedSettings();
    const multilingualModelPath = await findMultilingualWhisperModelPath();
    const moonshineAvailable = Boolean(env.moonshineWorkerCommand);
    const wantsMoonshine =
      settings.transcriptionModel === 'moonshine-base' || settings.transcriptionModel === 'moonshine-tiny';

    if (wantsMoonshine && moonshineAvailable) {
      return {
        provider: 'moonshine-local' as const,
        modelPath: '',
        languageCode:
          settings.transcriptionLanguageCode === 'auto' ? 'en' : settings.transcriptionLanguageCode,
        modelProfile: settings.transcriptionModel,
        multilingualAvailable: true,
        warnings:
          settings.transcriptionLanguageCode === 'auto'
            ? ['Moonshine is currently tuned for English in this app. Falling back to English.']
            : [],
        moonshineModelName:
          settings.transcriptionModel === 'moonshine-tiny' ? 'moonshine/tiny' : env.moonshineModel
      };
    }

    const useMultilingualModel =
      settings.transcriptionModel === 'multilingual-small' && Boolean(multilingualModelPath);
    const languageDowngraded =
      !useMultilingualModel && settings.transcriptionLanguageCode === 'auto';
    const warnings: string[] = [];

    if (wantsMoonshine && !moonshineAvailable) {
      warnings.push('Moonshine is not configured. Falling back to Whisper.');
    }

    if (languageDowngraded) {
      warnings.push('Auto language detection requires the multilingual model. Falling back to English.');
    }

    return {
      provider: 'whisper-local' as const,
      modelPath: useMultilingualModel ? multilingualModelPath ?? env.whisperModelPath : env.whisperModelPath,
      languageCode: useMultilingualModel
        ? settings.transcriptionLanguageCode
        : languageDowngraded
          ? 'en'
          : settings.transcriptionLanguageCode,
      modelProfile: useMultilingualModel ? ('multilingual-small' as const) : ('default' as const),
      multilingualAvailable: Boolean(multilingualModelPath),
      warnings,
      moonshineModelName: null
    };
  }
}

function mergeVoiceSettings(
  persisted: Partial<VoiceSettings> | null | undefined,
  voices: VoiceOption[]
): VoiceSettings {
  return sanitizeVoiceSettings(
    {
      ...defaultVoiceSettings,
      ...persisted
    },
    voices
  );
}

function sanitizeVoiceSettings(settings: Partial<VoiceSettings>, voices: VoiceOption[]): VoiceSettings {
  const qualityProfile = sanitizeQualityProfile(settings.qualityProfile);
  const noiseMode = sanitizeNoiseMode(settings.noiseMode);
  const profileDefaults = getVoiceProfileDefaults(qualityProfile);
  const silenceWindowMs = clampNumber(
    settings.silenceWindowMs,
    700,
    5000,
    profileDefaults.silenceWindowMs
  );
  const voiceLocale = typeof settings.voiceLocale === 'string' && settings.voiceLocale.trim()
    ? settings.voiceLocale.trim()
    : defaultVoiceSettings.voiceLocale;
  const transcriptionLanguageCode = sanitizeTranscriptionLanguageCode(
    settings.transcriptionLanguageCode,
    profileDefaults.transcriptionLanguageCode
  );
  const transcriptionModel =
    sanitizeTranscriptionModel(settings.transcriptionModel, profileDefaults.transcriptionModel);
  const narrationMode = sanitizeNarrationMode(settings.narrationMode);
  const fallbackVoice = voices[0]?.id ?? defaultVoiceSettings.ttsVoice;
  const requestedVoice =
    typeof settings.ttsVoice === 'string' && settings.ttsVoice.trim()
      ? settings.ttsVoice.trim()
      : fallbackVoice;
  const ttsVoice =
    voices.length === 0 || voices.some((voice) => voice.id === requestedVoice)
      ? requestedVoice
      : fallbackVoice;

  return {
    silenceWindowMs,
    voiceLocale,
    autoResumeAfterReply: settings.autoResumeAfterReply ?? defaultVoiceSettings.autoResumeAfterReply,
    transcriptionLanguageCode,
    transcriptionModel,
    ttsVoice,
    narrationMode,
    qualityProfile,
    noiseMode
  };
}

function buildCapabilities(voices: VoiceOption[]): VoiceSettingsCapabilities {
  return {
    deviceSelection: false,
    voiceSelection: env.ttsProvider === 'kokoro' && voices.length > 0,
    interruption: true
  };
}

async function getVoiceOptions() {
  if (env.ttsProvider !== 'kokoro') {
    return [] as VoiceOption[];
  }

  return listAvailableKokoroVoices();
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

function sanitizeTranscriptionLanguageCode(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function sanitizeTranscriptionModel(
  value: unknown,
  fallback: VoiceSettings['transcriptionModel']
) {
  if (
    value === 'default' ||
    value === 'multilingual-small' ||
    value === 'moonshine-base' ||
    value === 'moonshine-tiny'
  ) {
    return value;
  }

  return fallback;
}

function sanitizeNarrationMode(value: unknown): VoiceNarrationMode {
  if (value === 'silent_progress' || value === 'muted') {
    return value;
  }

  return 'narrated';
}

function sanitizeQualityProfile(value: unknown): VoiceQualityProfile {
  if (value === 'low_memory' || value === 'balanced') {
    return value;
  }

  return 'demo';
}

function sanitizeNoiseMode(value: unknown): VoiceNoiseMode {
  if (value === 'normal' || value === 'noisy_room') {
    return value;
  }

  return 'focused';
}

function getVoiceProfileDefaults(qualityProfile: VoiceQualityProfile) {
  const multilingualAvailable = Boolean(env.whisperMultilingualModelPath);
  const moonshineAvailable = Boolean(env.moonshineWorkerCommand);

  if (qualityProfile === 'low_memory') {
    return {
      silenceWindowMs: 700,
      transcriptionLanguageCode: 'en',
      transcriptionModel: moonshineAvailable ? ('moonshine-tiny' as const) : ('default' as const)
    };
  }

  if (qualityProfile === 'balanced') {
    return {
      silenceWindowMs: 850,
      transcriptionLanguageCode: moonshineAvailable ? 'en' : multilingualAvailable ? 'auto' : 'en',
      transcriptionModel: moonshineAvailable
        ? ('moonshine-base' as const)
        : multilingualAvailable
          ? ('multilingual-small' as const)
          : ('default' as const)
    };
  }

  return {
    silenceWindowMs: 1000,
    transcriptionLanguageCode: moonshineAvailable ? 'en' : multilingualAvailable ? 'auto' : 'en',
    transcriptionModel: moonshineAvailable
      ? ('moonshine-base' as const)
      : multilingualAvailable
        ? ('multilingual-small' as const)
        : ('default' as const)
  };
}

async function getTranscriptionModelOptions(): Promise<TranscriptionModelOption[]> {
  const multilingualModelPath = await findMultilingualWhisperModelPath();
  const moonshineAvailable = Boolean(env.moonshineWorkerCommand);

  return [
    {
      id: 'default',
      label: 'Whisper English',
      description: 'Uses the primary local Whisper model configured for this app.',
      available: Boolean(env.whisperModelPath)
    },
    {
      id: 'multilingual-small',
      label: 'Whisper multilingual',
      description: multilingualModelPath
        ? 'Uses the local multilingual Whisper model with auto language detection support.'
        : 'Configure WHISPER_MULTILINGUAL_MODEL_PATH to enable local multilingual Whisper.',
      available: Boolean(multilingualModelPath)
    },
    {
      id: 'moonshine-base',
      label: 'Moonshine base',
      description: moonshineAvailable
        ? 'Low-latency local Moonshine transcription tuned for realtime voice.'
        : 'Configure MOONSHINE_WORKER_COMMAND to enable local Moonshine transcription.',
      available: moonshineAvailable
    },
    {
      id: 'moonshine-tiny',
      label: 'Moonshine tiny',
      description: moonshineAvailable
        ? 'Lighter Moonshine model for lower memory use and fast turn-around.'
        : 'Configure MOONSHINE_WORKER_COMMAND to enable local Moonshine transcription.',
      available: moonshineAvailable
    }
  ];
}

function getTranscriptionLanguageOptions(): TranscriptionLanguageOption[] {
  return [
    { code: 'auto', label: 'Auto detect' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'Hindi' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'ja', label: 'Japanese' }
  ];
}

async function findMultilingualWhisperModelPath() {
  const candidates = [
    env.whisperMultilingualModelPath,
    env.whisperModelPath
      ? path.join(path.dirname(env.whisperModelPath), 'ggml-small.bin')
      : ''
  ]
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function getInitialTranscriptionModel(): VoiceSettings['transcriptionModel'] {
  if (env.moonshineWorkerCommand) {
    return 'moonshine-base';
  }

  if (env.whisperMultilingualModelPath) {
    return 'multilingual-small';
  }

  return 'default';
}
