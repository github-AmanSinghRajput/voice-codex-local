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
  redactedFiles?: string[];
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

export type AssistantProviderId = 'codex' | 'claude';

export interface AssistantProviderStatus {
  id: AssistantProviderId;
  name: string;
  installed: boolean;
  loggedIn: boolean;
  appConnected: boolean;
  connectedAt: string | null;
  accountLabel: string | null;
  authMode: string | null;
  statusText: string;
  loginCommand: string;
  logoutCommand: string | null;
  canSwitchAccount: boolean;
}

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  quality: 'default' | 'enhanced' | 'premium';
}

export type TranscriptionModelProfile =
  | 'default'
  | 'multilingual-small'
  | 'moonshine-base'
  | 'moonshine-tiny';
export type VoiceQualityProfile = 'low_memory' | 'balanced' | 'demo';
export type VoiceNoiseMode = 'normal' | 'focused' | 'noisy_room';

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

export type VoiceNarrationMode = 'narrated' | 'silent_progress' | 'muted';
export type AppTheme = 'dark' | 'light';

export interface AppSettings {
  displayName: string | null;
  theme: AppTheme;
  welcomedAt: string | null;
}

export interface VoiceSettings {
  silenceWindowMs: number;
  voiceLocale: string;
  autoResumeAfterReply: boolean;
  transcriptionLanguageCode: string;
  transcriptionModel: TranscriptionModelProfile;
  ttsVoice: string;
  narrationMode: VoiceNarrationMode;
  qualityProfile: VoiceQualityProfile;
  noiseMode: VoiceNoiseMode;
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

export interface ClaudeModelOption {
  slug: string;
  displayName: string;
  description: string;
  suggestedForDiscussion: boolean;
}

export interface ClaudeSettings {
  model: string | null;
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
  activeProviderId: AssistantProviderId | null;
  workspace: WorkspaceState;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  audio: AudioBridgeState;
  voiceSession: VoiceSessionState;
}
