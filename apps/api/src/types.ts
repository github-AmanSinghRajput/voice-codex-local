export type ChatRole = 'user' | 'assistant';
export type ChatSource = 'voice' | 'text';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: ChatSource;
}

export interface LogStore {
  messages: ChatMessage[];
}

export interface WorkspaceState {
  projectRoot: string | null;
  projectName: string | null;
  isGitRepo: boolean;
  writeAccessEnabled: boolean;
  secretPolicy: string[];
}

export interface PendingApproval {
  id: string;
  createdAt: string;
  projectRoot: string;
  userRequest: string;
  title: string;
  summary: string;
  tasks: string[];
  agents: string[];
}

export interface DiffFileBlock {
  filePath: string;
  diff: string;
}

export interface DiffSummary {
  isGitRepo: boolean;
  changedFiles: string[];
  files: DiffFileBlock[];
}

export interface AudioBridgeState {
  platform: string;
  available: boolean;
  inputDeviceLabel: string | null;
  outputDeviceLabel: string | null;
  transcriptionEngine: string;
  speechEngine: string;
  lastCheckedAt: string | null;
  error: string | null;
}

export type VoiceSessionPhase = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceSessionState {
  active: boolean;
  phase: VoiceSessionPhase;
  liveTranscript: string;
  lastTranscript: string | null;
  silenceWindowMs: number;
  transport: 'native-macos' | 'unsupported';
  error: string | null;
}

export interface RuntimeState {
  workspace: WorkspaceState;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  audio: AudioBridgeState;
  voiceSession: VoiceSessionState;
}
