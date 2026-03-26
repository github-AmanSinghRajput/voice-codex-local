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
  id: string | null;
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

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  quality: 'default' | 'enhanced' | 'premium';
}

export type TranscriptionModelProfile = 'default' | 'multilingual-small';

export interface TranscriptionModelOption {
  id: TranscriptionModelProfile;
  label: string;
  description: string;
  available: boolean;
}

export interface TranscriptionLanguageOption {
  code: string;
  label: string;
}

export interface VoiceSettings {
  silenceWindowMs: number;
  voiceLocale: string;
  autoResumeAfterReply: boolean;
  transcriptionLanguageCode: string;
  transcriptionModel: TranscriptionModelProfile;
  ttsVoice: string;
}

export interface VoiceSettingsCapabilities {
  deviceSelection: boolean;
  voiceSelection: boolean;
  interruption: boolean;
}

export type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface CodexReasoningOption {
  effort: CodexReasoningEffort;
  description: string;
}

export interface CodexModelOption {
  slug: string;
  displayName: string;
  description: string;
  defaultReasoningEffort: CodexReasoningEffort | null;
  supportedReasoningEfforts: CodexReasoningOption[];
}

export interface CodexSettings {
  model: string | null;
  reasoningEffort: CodexReasoningEffort | null;
}

export type VoiceSessionPhase = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceSessionState {
  active: boolean;
  phase: VoiceSessionPhase;
  liveTranscript: string;
  lastTranscript: string | null;
  silenceWindowMs: number;
  transport: 'desktop-media' | 'browser-webspeech' | 'unsupported';
  error: string | null;
}

export interface RuntimeState {
  workspace: WorkspaceState;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  audio: AudioBridgeState;
  voiceSession: VoiceSessionState;
}
