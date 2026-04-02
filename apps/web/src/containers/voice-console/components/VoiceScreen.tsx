import { formatReasoningEffort, getVoiceHeadline, getVoiceSubline } from '../lib/helpers';
import { FaceOrb } from './FaceOrb';
import type {
  AudioState,
  CodexSettingsResponse,
  VoiceCommandOption,
  VoiceNarrationMode,
  VoiceSessionState,
  VoiceSettingsResponse,
  VoiceState
} from '../lib/types';

interface VoiceScreenProps {
  activeProviderName: string;
  audio: AudioState | null;
  busyLabel: string;
  codexSettings: CodexSettingsResponse | null;
  showCodexSettings: boolean;
  spokenReplyPreview?: string;
  streamedTranscriptOverride?: string;
  voiceSettings: VoiceSettingsResponse | null;
  voiceSession: VoiceSessionState | null;
  voiceState: VoiceState;
  voiceActivity: string | null;
  recentVoiceActivities: string[];
  narrationMode: VoiceNarrationMode;
  pendingCommandTitle: string | null;
  pendingCommandPrompt: string | null;
  pendingCommandOptions: VoiceCommandOption[];
  onApplyCommandOption: (option: VoiceCommandOption) => void;
  onDismissCommandOptions: () => void;
  onToggleMute: () => void;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceScreen({
  audio,
  busyLabel,
  codexSettings,
  showCodexSettings,
  spokenReplyPreview,
  streamedTranscriptOverride,
  voiceSession,
  voiceState,
  voiceActivity,
  recentVoiceActivities,
  narrationMode,
  pendingCommandTitle,
  pendingCommandPrompt,
  pendingCommandOptions,
  onApplyCommandOption,
  onDismissCommandOptions,
  onToggleMute,
  onStart,
  onStop
}: VoiceScreenProps) {
  const isDesktopAudio = audio?.platform === 'darwin';
  const currentTranscriptLabel =
    voiceSession?.phase === 'thinking' || voiceSession?.phase === 'speaking'
      ? 'AI response'
      : 'Your voice';
  const currentTranscript =
    (voiceSession?.phase === 'speaking' && spokenReplyPreview
      ? spokenReplyPreview
      : streamedTranscriptOverride || voiceSession?.liveTranscript) || 'Waiting for live speech...';
  const lastTranscript = voiceSession?.lastTranscript || 'No completed voice turn yet.';
  const activeActivity = voiceActivity ?? recentVoiceActivities[0] ?? null;

  function getStatusLabel() {
    if (voiceActivity) return voiceActivity;
    if (busyLabel) return busyLabel;
    if (voiceSession?.phase === 'listening') return 'Listening...';
    if (voiceSession?.phase === 'thinking') return 'Working on it...';
    if (voiceSession?.phase === 'speaking') return 'Speaking...';
    if (voiceSession?.phase === 'starting') return 'Starting up...';
    if (voiceSession?.phase === 'error') return 'Something went wrong';
    return 'Ready when you are';
  }

  return (
    <section className="screen voice-screen">
      <div className="voice-layout">
        <section className="voice-stage-card">
          <div className="voice-stage-intro">
            <div className="voice-stage-copy voice-stage-copy-centered">
              <p className="section-kicker">Voice session</p>
              <h2>{getVoiceHeadline(voiceState)}</h2>
              <p>
                {getVoiceSubline(
                  audio ?? fallbackAudioState,
                  voiceState,
                  streamedTranscriptOverride ?? voiceSession?.liveTranscript ?? '',
                  voiceSession?.error
                )}
              </p>
            </div>
          </div>

          <div className="voice-stage-visual">
            <FaceOrb voiceState={voiceState} large />
            <div className={`voice-status-badge phase-${voiceSession?.phase ?? 'idle'}`}>
              <span className="voice-status-dot" />
              <span className="voice-status-text">{getStatusLabel()}</span>
            </div>
          </div>

          <div className="voice-live-grid">
            <div className={`voice-transcript-card voice-transcript-card-primary phase-${voiceSession?.phase ?? 'idle'}`}>
              <div className="voice-card-head">
                <span className="metric-label">{currentTranscriptLabel}</span>
                <span className={`section-chip ${voiceSession?.active ? 'approved' : ''}`}>
                  {voiceSession?.active ? 'Live' : 'Standby'}
                </span>
              </div>
              <p className="voice-transcript-line voice-transcript-clamped">{currentTranscript}</p>
            </div>

            {activeActivity ? (
              <div className={`voice-transcript-card voice-activity-card phase-${voiceSession?.phase ?? 'idle'}`}>
                <span className="metric-label">What it&apos;s doing</span>
                <p className="voice-activity-current">{activeActivity}</p>
                {recentVoiceActivities.length > 1 ? (
                  <div className="voice-activity-log">
                    {recentVoiceActivities.slice(1, 4).map((activity, index) => (
                      <span className="voice-activity-item" key={`${activity}-${index}`}>
                        {activity}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="voice-transcript-card voice-transcript-card-muted voice-transcript-card-hint">
                <span className="metric-label">Session flow</span>
                <p className="voice-transcript-line">
                  Listen, think, speak. You can interrupt while the assistant is talking.
                </p>
              </div>
            )}

            <div className="voice-transcript-card voice-transcript-card-muted">
              <span className="metric-label">Last message</span>
              <p className="voice-transcript-line voice-transcript-clamped">{lastTranscript}</p>
            </div>
          </div>

          {voiceSession?.error ? (
            <div className="voice-error-banner">
              <span className="metric-label">Voice issue</span>
              <strong>{voiceSession.error}</strong>
              <p>
                {isDesktopAudio
                  ? 'Check microphone permissions, local speech services, or the desktop runtime logs.'
                  : 'Check browser microphone permissions and speech-recognition availability.'}
              </p>
            </div>
          ) : null}

          <div className="action-row voice-action-row">
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
            <button className="button-secondary" onClick={onToggleMute} type="button">
              {narrationMode === 'muted' ? 'Unmute voice' : 'Mute voice'}
            </button>
            <span className={`section-chip ${narrationMode === 'muted' ? 'rejected' : 'approved'}`}>
              {narrationMode === 'muted'
                ? 'Voice muted'
                : narrationMode === 'silent_progress'
                  ? 'Voice replies on'
                  : 'Narrated mode'}
            </span>
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
