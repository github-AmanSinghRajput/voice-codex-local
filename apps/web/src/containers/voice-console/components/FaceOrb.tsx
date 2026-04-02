import { getVoiceStateLabel } from '../lib/diff';
import type { VoiceState } from '../lib/types';

interface FaceOrbProps {
  voiceState: VoiceState;
  large?: boolean;
}

export function FaceOrb({ voiceState, large = false }: FaceOrbProps) {
  return (
    <div className={`voice-orb ${voiceState} ${large ? 'voice-orb-large' : ''}`}>
      <span className="voice-orb-backdrop" />
      <span className="voice-orb-glow voice-orb-glow-primary" />
      <span className="voice-orb-glow voice-orb-glow-secondary" />
      <div className="voice-orb-wavefield" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <span className={`voice-orb-wave voice-orb-wave-${index + 1}`} key={index}>
            <svg viewBox="0 0 320 96" preserveAspectRatio="none">
              <path d="M0 48 C24 48 24 20 48 20 S72 76 96 76 120 30 144 30 168 66 192 66 216 24 240 24 264 72 288 72 312 48 320 48" />
            </svg>
          </span>
        ))}
      </div>
      <span className="voice-orb-state">{getVoiceStateLabel(voiceState)}</span>
    </div>
  );
}
