export type ScreenId = 'workspace' | 'voice' | 'terminal' | 'shell' | 'review' | 'memory' | 'notes' | 'vibemusic';
export type ChatRole = 'user' | 'assistant';
export type MessageSource = 'voice' | 'text';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface MessageEntry {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: MessageSource;
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

export interface AudioState {
  platform: string;
  available: boolean;
  inputDeviceLabel: string | null;
  outputDeviceLabel: string | null;
  transcriptionEngine: string;
  speechEngine: string;
  lastCheckedAt: string | null;
  error: string | null;
}

export interface VoiceSessionState {
  active: boolean;
  phase: 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';
  liveTranscript: string;
  lastTranscript: string | null;
  silenceWindowMs: number;
  transport: 'browser-webspeech' | 'desktop-media' | 'unsupported';
  error: string | null;
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

export interface VoiceSettingsResponse {
  settings: VoiceSettings;
  capabilities: VoiceSettingsCapabilities;
  options: {
    voices: VoiceOption[];
    transcriptionModels: TranscriptionModelOption[];
    transcriptionLanguages: TranscriptionLanguageOption[];
  };
  currentDevices: {
    inputLabel: string | null;
    outputLabel: string | null;
  };
}

export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

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

export interface CodexSettingsResponse {
  settings: CodexSettings;
  source: 'app' | 'environment' | 'global' | 'default';
  options: {
    models: CodexModelOption[];
  };
}

export interface ClaudeSettingsResponse {
  settings: ClaudeSettings;
  source: 'app' | 'default';
  options: {
    models: ClaudeModelOption[];
  };
}

export interface CodexStatus {
  installed: boolean;
  loggedIn: boolean;
  authMode: string | null;
  statusText: string;
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

export interface AssistantProvidersState {
  activeProviderId: AssistantProviderId | null;
  activeProvider: AssistantProviderStatus | null;
  providers: AssistantProviderStatus[];
}

export interface DatabaseStatus {
  configured: boolean;
  reachable: boolean;
  message: string;
}

export interface StatusResponse {
  codexStatus: CodexStatus;
  assistantProviders: AssistantProvidersState;
  appSettings: AppSettings;
  workspace: WorkspaceState;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  audio: AudioState;
  voiceSession: VoiceSessionState;
  system: {
    database: DatabaseStatus;
  };
}

export interface SystemResponse {
  environment: string;
  database: DatabaseStatus;
  providers: {
    tts: string;
    queue: string;
    email: string;
    vector: string;
    rag: string;
    ocr: string;
  };
  recommendations: Record<string, string>;
  auth: {
    operator: {
      id: string;
      email: string | null;
      displayName: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
    codexAuth: string;
    productAuth: string;
    trackedSessions: AuthSessionEntry[];
    note: string;
  };
}

export interface ReplyResponse {
  type: 'reply';
  userMessage: MessageEntry;
  assistantMessage: MessageEntry;
}

export interface ApprovalRequiredResponse {
  type: 'approval_required';
  userMessage: MessageEntry;
  assistantMessage: MessageEntry;
  pendingApproval: PendingApproval;
}

export type ChatStreamEvent =
  | {
      type: 'started';
      userMessage: MessageEntry;
      assistantMessage: MessageEntry;
    }
  | {
      type: 'delta';
      assistantMessage: MessageEntry;
    }
  | {
      type: 'activity';
      activity: string;
    }
  | {
      type: 'completed';
      result: ReplyResponse | ApprovalRequiredResponse;
    }
  | {
      type: 'error';
      error: string;
    };

export interface SetWorkspaceResponse {
  workspace: WorkspaceState;
}

export interface VoiceSessionResponse {
  ok: boolean;
  voiceSession: VoiceSessionState;
}

export interface ClearResponse {
  ok: boolean;
  assistantProviders?: AssistantProvidersState;
}

export interface VoiceTranscriptionResponse {
  provider: string;
  transcript: string;
  fallbackUsed: boolean;
  warnings: string[];
}

export interface TtsSynthesisResponse {
  provider: string;
  available: boolean;
  audioBase64: string | null;
  mimeType: string | null;
  error: string | null;
}

export type VoiceCommandScreen = 'voice' | 'workspace' | 'review' | 'terminal';

export type VoiceCommandAction =
  | {
      type: 'set_codex_model';
      model: string;
      reasoningEffort: CodexReasoningEffort | null;
    }
  | {
      type: 'set_claude_model';
      model: string;
    };

export interface VoiceCommandOption {
  id: string;
  label: string;
  description: string;
  action: VoiceCommandAction;
}

export type VoiceCommandResolveResponse =
  | {
      status: 'no_match';
    }
  | {
      status: 'handled';
      userMessage: MessageEntry;
      assistantMessage: MessageEntry;
      suggestedScreen?: VoiceCommandScreen;
    }
  | {
      status: 'options_required';
      userMessage: MessageEntry;
      assistantMessage: MessageEntry;
      commandTitle: string;
      commandPrompt: string;
      options: VoiceCommandOption[];
      suggestedScreen?: VoiceCommandScreen;
    };

export interface VoiceCommandApplyResponse {
  ok: boolean;
  assistantMessage: MessageEntry;
  suggestedScreen?: VoiceCommandScreen;
}

export interface LogsResponse {
  messages: MessageEntry[];
}

export interface ApprovalResponse {
  ok: boolean;
  assistantMessage: MessageEntry;
  diff?: DiffSummary;
}

export interface NoteEntry {
  id: string;
  title: string;
  body: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotesResponse {
  notes: NoteEntry[];
}

export interface CreateNoteInput {
  title: string;
  body: string;
  source?: string;
  chunks?: string[];
}

export interface CreateNoteResponse {
  note: {
    id: string;
  } | null;
}

export interface ApprovalHistoryEntry {
  id: string;
  workspaceId: string | null;
  conversationSessionId: string | null;
  taskTitle: string;
  taskSummary: string;
  approved: boolean;
  reviewedAt: string;
}

export interface ApprovalHistoryResponse {
  approvals: ApprovalHistoryEntry[];
}

export interface AuthSessionEntry {
  id: string;
  provider: string;
  providerSubject: string | null;
  accessScope: string[];
  createdAt: string;
  expiresAt: string | null;
}

export interface AuthSessionsResponse {
  sessions: AuthSessionEntry[];
}

export interface DiffRow {
  leftLineNumber: number | null;
  leftText: string;
  leftKind: 'context' | 'remove' | 'empty';
  rightLineNumber: number | null;
  rightText: string;
  rightKind: 'context' | 'add' | 'empty';
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  contextLabel: string;
  rows: DiffRow[];
}

export interface ParsedFileDiff {
  hunks: DiffHunk[];
  stats: { additions: number; deletions: number };
}

export interface VoiceEventPayload {
  type: 'voice_state' | 'chat_append' | 'status_refresh';
  payload: unknown;
}

export interface MessageGroup {
  id: string;
  role: ChatRole;
  source: MessageSource;
  createdAt: string;
  messages: MessageEntry[];
}

export interface ConsolePreferences {
  defaultScreen: Extract<ScreenId, 'workspace' | 'voice' | 'terminal'>;
  transcriptDensity: 'comfortable' | 'compact';
  motionMode: 'full' | 'reduced';
}
