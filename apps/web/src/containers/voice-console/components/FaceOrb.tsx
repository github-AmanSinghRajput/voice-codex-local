import { getVoiceStateLabel } from '../lib/diff';
import type { VoiceState } from '../lib/types';

interface FaceOrbProps {
  voiceState: VoiceState;
  large?: boolean;
}

export function FaceOrb({ voiceState, large = false }: FaceOrbProps) {
  return (
    <div className={`face-orb ${voiceState} ${large ? 'face-orb-large' : ''}`}>
      <span className="face-orb-ring face-orb-ring-outer" />
      <span className="face-orb-ring face-orb-ring-mid" />
      <span className="face-orb-ring face-orb-ring-inner" />
      <span className="face-orb-core" />
      <div className="face-orb-eyes" aria-hidden="true">
        <span className="face-orb-eye" />
        <span className="face-orb-eye" />
      </div>
      <div className="face-orb-mouth" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <span className="face-orb-state">{getVoiceStateLabel(voiceState)}</span>
    </div>
  );
}
