import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import type {
  AudioBridgeState,
  TranscriptionLanguageOption,
  TranscriptionModelOption,
  VoiceOption,
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
  transcriptionModel: env.whisperMultilingualModelPath ? 'multilingual-small' : 'default',
  ttsVoice: env.kokoroVoice
};

interface UpdateVoiceSettingsInput {
  silenceWindowMs?: number;
  voiceLocale?: string;
  autoResumeAfterReply?: boolean;
  transcriptionLanguageCode?: string;
  transcriptionModel?: VoiceSettings['transcriptionModel'];
  ttsVoice?: string;
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
    const nextSettings = sanitizeVoiceSettings(
      {
        ...current,
        ...input
      },
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
    const useMultilingualModel =
      settings.transcriptionModel === 'multilingual-small' && Boolean(multilingualModelPath);
    const languageDowngraded =
      !useMultilingualModel && settings.transcriptionLanguageCode === 'auto';
    const languageCode = useMultilingualModel
      ? settings.transcriptionLanguageCode
      : languageDowngraded
        ? 'en'
        : settings.transcriptionLanguageCode;

    return {
      modelPath: useMultilingualModel ? multilingualModelPath ?? env.whisperModelPath : env.whisperModelPath,
      languageCode,
      modelProfile: useMultilingualModel ? ('multilingual-small' as const) : ('default' as const),
      multilingualAvailable: Boolean(multilingualModelPath),
      warnings: languageDowngraded
        ? ['Auto language detection requires the multilingual model. Falling back to English.']
        : []
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
  const silenceWindowMs = clampNumber(settings.silenceWindowMs, 700, 5000, defaultVoiceSettings.silenceWindowMs);
  const voiceLocale = typeof settings.voiceLocale === 'string' && settings.voiceLocale.trim()
    ? settings.voiceLocale.trim()
    : defaultVoiceSettings.voiceLocale;
  const transcriptionLanguageCode = sanitizeTranscriptionLanguageCode(settings.transcriptionLanguageCode);
  const transcriptionModel =
    settings.transcriptionModel === 'multilingual-small' ? 'multilingual-small' : 'default';
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
    ttsVoice
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

function sanitizeTranscriptionLanguageCode(value: unknown) {
  if (typeof value !== 'string') {
    return defaultVoiceSettings.transcriptionLanguageCode;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultVoiceSettings.transcriptionLanguageCode;
  }

  return normalized;
}

async function getTranscriptionModelOptions(): Promise<TranscriptionModelOption[]> {
  const multilingualModelPath = await findMultilingualWhisperModelPath();

  return [
    {
      id: 'default',
      label: 'Default STT model',
      description: 'Uses the primary Whisper model configured for this app.',
      available: Boolean(env.whisperModelPath)
    },
    {
      id: 'multilingual-small',
      label: 'Whisper small multilingual',
      description: multilingualModelPath
        ? 'Uses a multilingual Whisper small model with auto language detection support.'
        : 'Configure WHISPER_MULTILINGUAL_MODEL_PATH to enable local multilingual Whisper.',
      available: Boolean(multilingualModelPath)
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
