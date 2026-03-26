import {
  getRuntimeState,
  resetVoiceSessionState,
  setAudioState,
  setVoiceSessionState
} from '../../runtime.js';
import type { EventBus } from '../../lib/event-bus.js';
import { logger } from '../../lib/logger.js';
import type { TtsService } from '../tts/tts.service.js';
import type { VoiceTranscriptionService } from './transcription.service.js';
import type { VoiceSettingsService } from './voice-settings.service.js';

interface VoiceSessionDependencies {
  eventBus: EventBus;
  ttsService: TtsService;
  voiceTranscriptionService: VoiceTranscriptionService;
  voiceSettingsService: VoiceSettingsService;
}

export class VoiceSessionService {
  constructor(private readonly dependencies: VoiceSessionDependencies) {}

  async refreshAudioState() {
    const runtime = getRuntimeState();
    setAudioState({
      available: process.platform === 'darwin',
      platform: process.platform,
      transcriptionEngine: describeSttEngine(),
      speechEngine: runtime.audio.speechEngine,
      error: process.platform === 'darwin' ? null : 'Desktop voice capture currently supports macOS only.'
    });
    logger.info('voice.audio_state.refreshed', {
      available: getRuntimeState().audio.available,
      inputDeviceLabel: getRuntimeState().audio.inputDeviceLabel,
      outputDeviceLabel: getRuntimeState().audio.outputDeviceLabel,
      error: getRuntimeState().audio.error
    });
    this.emitVoiceState();
  }

  getStatus() {
    const runtime = getRuntimeState();
    return {
      audio: runtime.audio,
      voiceSession: runtime.voiceSession
    };
  }

  async start() {
    const settings = await this.dependencies.voiceSettingsService.getResolvedSettings();
    const runtime = getRuntimeState();

    if (runtime.voiceSession.active) {
      logger.info('voice.session.start.ignored', {
        reason: 'already_active'
      });
      return runtime.voiceSession;
    }

    logger.info('voice.session.started', {
      silenceWindowMs: settings.silenceWindowMs,
      locale: settings.voiceLocale,
      transport: 'desktop-media'
    });
    setVoiceSessionState({
      active: true,
      phase: 'starting',
      liveTranscript: '',
      error: null,
      silenceWindowMs: settings.silenceWindowMs,
      transport: process.platform === 'darwin' ? 'desktop-media' : 'unsupported'
    });
    this.emitVoiceState();

    try {
      await Promise.all([
        this.dependencies.voiceTranscriptionService.warmup(),
        this.dependencies.ttsService.warmup()
      ]);
      return getRuntimeState().voiceSession;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to warm voice services.';
      logger.error('voice.session.start.failed', {
        error: message
      });
      resetVoiceSessionState('error');
      setVoiceSessionState({
        transport: process.platform === 'darwin' ? 'desktop-media' : 'unsupported',
        error: message
      });
      this.emitVoiceState();
      throw error;
    }
  }

  stop() {
    logger.info('voice.session.stop.requested');
    this.dependencies.voiceTranscriptionService.beginIdleCooldown();
    this.dependencies.ttsService.beginIdleCooldown();
    resetVoiceSessionState('idle');
    setVoiceSessionState({
      transport: process.platform === 'darwin' ? 'desktop-media' : 'unsupported'
    });
    this.emitVoiceState();
    return getRuntimeState().voiceSession;
  }

  interrupt() {
    const runtime = getRuntimeState();

    if (!runtime.voiceSession.active) {
      logger.info('voice.session.interrupt.ignored', {
        active: runtime.voiceSession.active,
        phase: runtime.voiceSession.phase
      });
      return runtime.voiceSession;
    }

    logger.info('voice.session.interrupt.completed', {
      transport: runtime.voiceSession.transport
    });
    setVoiceSessionState({
      active: true,
      phase: 'listening',
      liveTranscript: '',
      error: null,
      transport: process.platform === 'darwin' ? 'desktop-media' : 'unsupported'
    });
    this.emitVoiceState();
    return getRuntimeState().voiceSession;
  }

  private emitVoiceState() {
    const runtime = getRuntimeState();
    this.dependencies.eventBus.emit({
      type: 'voice_state',
      payload: {
        audio: runtime.audio,
        voiceSession: runtime.voiceSession
      }
    });
  }
}

function describeSttEngine() {
  if (process.platform !== 'darwin') {
    return 'Unavailable';
  }

  const provider = (process.env.STT_PROVIDER ?? 'none').trim();
  if (provider === 'whisper-local') {
    return 'Desktop media capture + whisper.cpp';
  }

  if (provider === 'assemblyai') {
    return 'Desktop media capture + AssemblyAI';
  }

  return 'Desktop media capture + STT provider';
}
