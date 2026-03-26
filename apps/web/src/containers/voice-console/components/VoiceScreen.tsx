import { formatReasoningEffort, getVoiceHeadline, getVoiceSubline } from '../lib/helpers';
import { FaceOrb } from './FaceOrb';
import type {
  AudioState,
  CodexSettingsResponse,
  VoiceCommandOption,
  VoiceSessionState,
  VoiceSettingsResponse,
  VoiceState
} from '../lib/types';

interface VoiceScreenProps {
  audio: AudioState | null;
  codexSettings: CodexSettingsResponse | null;
  voiceSettings: VoiceSettingsResponse | null;
  voiceSession: VoiceSessionState | null;
  voiceState: VoiceState;
  pendingCommandTitle: string | null;
  pendingCommandPrompt: string | null;
  pendingCommandOptions: VoiceCommandOption[];
  onApplyCommandOption: (option: VoiceCommandOption) => void;
  onDismissCommandOptions: () => void;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceScreen({
  audio,
  codexSettings,
  voiceSettings,
  voiceSession,
  voiceState,
  pendingCommandTitle,
  pendingCommandPrompt,
  pendingCommandOptions,
  onApplyCommandOption,
  onDismissCommandOptions,
  onStart,
  onStop
}: VoiceScreenProps) {
  const isDesktopAudio = audio?.platform === 'darwin';
  const phases = [
    { id: 'listening', label: 'Listening' },
    { id: 'thinking', label: 'Thinking' },
    { id: 'speaking', label: 'Speaking' }
  ] as const;
  const currentTranscriptLabel =
    voiceSession?.phase === 'thinking' || voiceSession?.phase === 'speaking'
      ? 'Assistant draft'
      : 'Live transcript';
  const currentTranscript = voiceSession?.liveTranscript || 'Waiting for live speech...';
  const lastTranscript = voiceSession?.lastTranscript || 'No completed voice turn yet.';

  return (
    <section className="screen voice-screen">
      <div className="voice-layout">
        <section className="voice-stage-card">
          <div className="voice-stage-copy">
            <p className="section-kicker">Voice session</p>
            <h2>{getVoiceHeadline(voiceState)}</h2>
            <p>
              {getVoiceSubline(
                audio ?? fallbackAudioState,
                voiceState,
                voiceSession?.liveTranscript ?? '',
                voiceSession?.error
              )}
            </p>
            <div className="voice-phase-rail">
              {phases.map((phase) => (
                <div
                  key={phase.id}
                  className={`voice-phase-pill ${voiceSession?.phase === phase.id ? 'active' : ''}`}
                >
                  {phase.label}
                </div>
              ))}
            </div>
          </div>

          <div className="voice-stage-visual">
            <FaceOrb voiceState={voiceState} large />
            <div className="voice-live-grid">
              <div className={`voice-transcript-card phase-${voiceSession?.phase ?? 'idle'}`}>
                <span className="metric-label">{currentTranscriptLabel}</span>
                <p className="voice-transcript-line">{currentTranscript}</p>
              </div>
              <div className="voice-transcript-card voice-transcript-card-muted">
                <span className="metric-label">Last completed turn</span>
                <p className="voice-transcript-line">{lastTranscript}</p>
              </div>
            </div>
          </div>

          <div className="action-row">
            <button
              className="button-primary"
              disabled={Boolean(voiceSession?.active) || !audio?.available}
              onClick={onStart}
              type="button"
            >
              {voiceState === 'error' ? 'Retry voice chat' : 'Start voice chat'}
            </button>
            <button
              className="button-secondary"
              disabled={!voiceSession?.active}
              onClick={onStop}
              type="button"
            >
              End voice chat
            </button>
            <span className="section-chip pending">
              {audio?.speechEngine ?? 'Voice output unavailable'}
            </span>
            {voiceSession?.error ? <span className="section-chip rejected">{voiceSession.error}</span> : null}
          </div>
        </section>

        {pendingCommandOptions.length > 0 ? (
          <section className="content-card voice-command-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Voice command</span>
                <strong>{pendingCommandTitle ?? 'Choose an option'}</strong>
              </div>
              <button className="toolbar-button" onClick={onDismissCommandOptions} type="button">
                Dismiss
              </button>
            </div>
            <p className="voice-command-copy">
              {pendingCommandPrompt ?? 'Pick the next action from the options below.'}
            </p>
            <div className="voice-command-options">
              {pendingCommandOptions.map((option) => (
                <button
                  key={option.id}
                  className="voice-command-option"
                  onClick={() => onApplyCommandOption(option)}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="metrics-grid">
          <article className="metric-card">
            <span className="metric-label">Input</span>
            <strong>{audio?.inputDeviceLabel ?? 'Waiting for active device'}</strong>
            <p>
              {isDesktopAudio
                ? 'Uses the active macOS input device and follows hardware changes while the session is live.'
                : 'Uses whatever the browser currently exposes as the active input device.'}
            </p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Output</span>
            <strong>{audio?.speechEngine ?? 'Unavailable'}</strong>
            <p>
              Kokoro-backed replies when available, with browser speech synthesis only as a fallback.
            </p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Speech engines</span>
            <strong>{audio?.transcriptionEngine ?? 'Unavailable'} / {audio?.speechEngine ?? 'Unavailable'}</strong>
            <p>Runs speech recognition and voice synthesis locally on your machine when available.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Session policy</span>
            <strong>
              Voice replies enabled / {voiceSettings?.settings.autoResumeAfterReply ? 'Auto-resume on' : 'Manual resume'}
            </strong>
            <p>
              Silence: {voiceSettings?.settings.silenceWindowMs ?? 800}ms. STT model: {voiceSettings?.settings.transcriptionModel === 'multilingual-small' ? 'multilingual small' : 'default'}.
            </p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Codex model</span>
            <strong>
              {codexSettings?.settings.model ?? 'Using Codex default'} / {formatReasoningEffort(codexSettings?.settings.reasoningEffort)} reasoning
            </strong>
            <p>
              Change the active model by voice or from Settings. Your global Codex CLI config stays untouched.
            </p>
          </article>
          {voiceSession?.error ? (
            <article className="metric-card metric-card-error">
              <span className="metric-label">Last voice error</span>
              <strong>{voiceSession.error}</strong>
              <p>
                {isDesktopAudio
                  ? 'Check microphone access, the local Whisper setup, or fallback-provider logs in the desktop runtime.'
                  : 'Check browser microphone permissions and speech recognition availability.'}
              </p>
            </article>
          ) : null}
        </section>
      </div>
    </section>
  );
}

const fallbackAudioState: AudioState = {
  platform: 'browser',
  available: false,
  inputDeviceLabel: null,
  outputDeviceLabel: null,
  transcriptionEngine: 'Unavailable',
  speechEngine: 'Unavailable',
  lastCheckedAt: null,
  error: null
};
