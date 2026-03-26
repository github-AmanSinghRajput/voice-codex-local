import { navigationItems } from './constants';
import type {
  ApprovalHistoryEntry,
  AudioState,
  ConsolePreferences,
  MessageGroup,
  MessageEntry,
  PendingApproval,
  ScreenId,
  StatusResponse,
  VoiceState
} from './types';

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

export function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

export function getVoiceState(status: StatusResponse | null): VoiceState {
  if (status?.voiceSession.phase === 'error') {
    return 'error';
  }

  if (status?.voiceSession.phase === 'listening' || status?.voiceSession.phase === 'starting') {
    return 'listening';
  }

  if (status?.voiceSession.phase === 'speaking') {
    return 'speaking';
  }

  if (status?.voiceSession.phase === 'thinking') {
    return 'thinking';
  }

  return 'idle';
}

export function getVoiceHeadline(state: VoiceState) {
  if (state === 'error') {
    return 'Voice session needs attention';
  }

  if (state === 'listening') {
    return 'Listening to your next turn';
  }

  if (state === 'thinking') {
    return 'Reasoning on your request';
  }

  if (state === 'speaking') {
    return 'Codex is responding out loud';
  }

  return 'Voice session is standing by';
}

export function getVoiceSubline(
  audio: AudioState,
  state: VoiceState,
  liveTranscript: string,
  voiceError?: string | null
) {
  if (state === 'listening' && liveTranscript) {
    return liveTranscript;
  }

  if (voiceError) {
    return voiceError;
  }

  if (audio.error) {
    return audio.error;
  }

  return `${audio.transcriptionEngine} in, ${audio.speechEngine} out`;
}

export function buildNavigationHints(
  screenId: ScreenId,
  status: StatusResponse | null,
  messages: MessageEntry[]
) {
  return navigationItems.map((item) => {
    if (item.id === 'workspace') {
      return {
        ...item,
        hint: status?.workspace.projectName ?? 'Select project folder',
        badge: status?.workspace.writeAccessEnabled ? 'edits' : null,
        active: item.id === screenId
      };
    }

    if (item.id === 'voice') {
      return {
        ...item,
        hint: status?.voiceSession.active ? 'Live session active' : 'Ready to start',
        badge: status?.voiceSession.active ? 'live' : null,
        active: item.id === screenId
      };
    }

    if (item.id === 'terminal') {
      return {
        ...item,
        hint: `${messages.length} turns logged`,
        badge: null,
        active: item.id === screenId
      };
    }

    if (item.id === 'shell') {
      return {
        ...item,
        hint: status?.workspace.projectRoot ? 'Interactive shell' : 'Select project first',
        badge: null,
        active: item.id === screenId
      };
    }

    if (item.id === 'review') {
      return {
        ...item,
        hint: status?.pendingApproval
          ? 'Approval waiting'
          : status?.lastDiff?.changedFiles.length
            ? `${status.lastDiff.changedFiles.length} file changes`
            : 'No pending changes',
        badge: status?.pendingApproval ? 'pending' : null,
        active: item.id === screenId
      };
    }

    if (item.id === 'notes') {
      return {
        ...item,
        hint: 'Coming in v1.2',
        badge: 'soon',
        active: item.id === screenId
      };
    }

    if (item.id === 'vibemusic') {
      return {
        ...item,
        hint: 'Coming in v2.0',
        badge: 'soon',
        active: item.id === screenId
      };
    }

    return {
      ...item,
      hint: item.shortLabel,
      badge: null,
      active: item.id === screenId
    };
  });
}

export function getSuggestedScreen(
  status: StatusResponse | null,
  defaultScreen: ConsolePreferences['defaultScreen'] = 'voice'
): ScreenId {
  if (!status?.codexStatus.loggedIn) {
    return 'workspace';
  }

  if (!status.workspace.projectRoot) {
    return 'workspace';
  }

  if (status.pendingApproval) {
    return 'review';
  }

  return defaultScreen;
}

export function summarizeApproval(pendingApproval: PendingApproval | null) {
  if (!pendingApproval) {
    return 'No pending write requests.';
  }

  return `${pendingApproval.tasks.length} task${pendingApproval.tasks.length === 1 ? '' : 's'} queued for approval`;
}

export function getLatestApproval(approvals: ApprovalHistoryEntry[]) {
  return approvals[0] ?? null;
}

export function groupMessages(messages: MessageEntry[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const message of messages) {
    const previousGroup = groups.at(-1);
    const previousMessage = previousGroup?.messages.at(-1);
    const sameActor =
      previousGroup &&
      previousGroup.role === message.role &&
      previousGroup.source === message.source;
    const withinWindow =
      previousMessage &&
      Math.abs(new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime()) <
        4 * 60 * 1000;

    if (sameActor && withinWindow) {
      previousGroup.messages.push(message);
      continue;
    }

    groups.push({
      id: message.id,
      role: message.role,
      source: message.source,
      createdAt: message.createdAt,
      messages: [message]
    });
  }

  return groups;
}

export function mergeUniqueMessages(
  currentMessages: MessageEntry[],
  incomingMessages: MessageEntry[]
) {
  if (incomingMessages.length === 0) {
    return currentMessages;
  }

  const merged = new Map<string, MessageEntry>();

  for (const message of currentMessages) {
    merged.set(message.id, message);
  }

  for (const message of incomingMessages) {
    merged.set(message.id, message);
  }

  return [...merged.values()].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

const reasoningEffortLabels: Record<string, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High'
};

export function formatReasoningEffort(value: string | null | undefined) {
  if (!value) {
    return 'default';
  }
  return reasoningEffortLabels[value] ?? value;
}
