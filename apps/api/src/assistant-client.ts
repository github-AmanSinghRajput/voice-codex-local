import path from 'node:path';
import {
  collectGitDiff,
  decideWriteIntent as decideCodexWriteIntent,
  executeApprovedWrite as executeCodexApprovedWrite,
  generateAssistantReply as generateCodexReply,
  getCodexStatus,
  initCodexClient,
  revertProtectedGitChanges,
  streamAssistantReply as streamCodexReply
} from './codex-client.js';
import {
  decideClaudeWriteIntent,
  executeClaudeApprovedWrite,
  generateClaudeReply,
  getClaudeStatus,
  initClaudeClient,
  streamClaudeReply
} from './claude-client.js';
import { getRootDir } from './store.js';
import { logger } from './lib/logger.js';
import { getRuntimeState, setActiveProviderId } from './runtime.js';
import type {
  AssistantProviderId,
  AssistantProviderStatus,
  ChatMessage,
  PendingApproval,
  WorkspaceState
} from './types.js';
import type { CodexSettingsService } from './features/codex/codex-settings.service.js';
import type { ClaudeSettingsService } from './features/claude/claude-settings.service.js';
import { ProviderSettingsService } from './features/providers/provider-settings.service.js';

export type AssistantErrorKind = 'auth' | 'rate_limit' | 'service' | 'unknown';

export class AssistantClientError extends Error {
  readonly kind: AssistantErrorKind;
  readonly friendlyMessage: string;

  constructor(kind: AssistantErrorKind, message: string, friendlyMessage: string) {
    super(message);
    this.name = 'AssistantClientError';
    this.kind = kind;
    this.friendlyMessage = friendlyMessage;
  }
}

export { AssistantClientError as CodexClientError };

interface WriteDecision {
  intent: 'reply' | 'propose_write';
  assistant_text: string;
  proposal_title: string;
  proposal_summary: string;
  tasks: string[];
  agents: string[];
}

interface StreamReplyOptions {
  voiceTurnId?: string;
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
  onActivityUpdate?: (activity: string) => void;
}

interface CodingAssistantProvider {
  id: AssistantProviderId;
  name: string;
  loginCommand: string;
  logoutCommand: string | null;
  checkStatus(): Promise<AssistantProviderStatus>;
  generateReply(
    userText: string,
    history: ChatMessage[],
    workspace: WorkspaceState,
    options?: { voiceTurnId?: string }
  ): Promise<{ text: string }>;
  streamReply(
    userText: string,
    history: ChatMessage[],
    workspace: WorkspaceState,
    options?: StreamReplyOptions
  ): Promise<{ text: string }>;
  decideWriteIntent(
    userText: string,
    history: ChatMessage[],
    workspace: WorkspaceState,
    options?: { voiceTurnId?: string }
  ): Promise<WriteDecision>;
  executeApprovedWrite(
    approval: PendingApproval,
    history: ChatMessage[],
    workspace: WorkspaceState,
    options?: { voiceTurnId?: string }
  ): Promise<{ text: string }>;
}

let providerSettingsService: ProviderSettingsService | null = null;

const providers: Record<AssistantProviderId, CodingAssistantProvider> = {
  codex: {
    id: 'codex',
    name: 'OpenAI Codex',
    loginCommand: 'codex login --device-auth',
    logoutCommand: 'codex logout',
    async checkStatus() {
      const status = await getCodexStatus();
      return {
        id: 'codex',
        name: 'OpenAI Codex',
        loginCommand: 'codex login --device-auth',
        logoutCommand: 'codex logout',
        canSwitchAccount: true,
        appConnected: false,
        connectedAt: null,
        ...status
      };
    },
    generateReply: generateCodexReply,
    streamReply: streamCodexReply,
    decideWriteIntent: decideCodexWriteIntent,
    executeApprovedWrite: executeCodexApprovedWrite
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude Code',
    loginCommand: 'claude auth login',
    logoutCommand: 'claude auth logout',
    async checkStatus() {
      const status = await getClaudeStatus();
      return {
        id: 'claude',
        name: 'Anthropic Claude Code',
        loginCommand: 'claude auth login',
        logoutCommand: 'claude auth logout',
        canSwitchAccount: true,
        appConnected: false,
        connectedAt: null,
        ...status
      };
    },
    generateReply: generateClaudeReply,
    streamReply: streamClaudeReply,
    decideWriteIntent: decideClaudeWriteIntent,
    executeApprovedWrite: executeClaudeApprovedWrite
  }
};

export function initAssistantClient(
  codexSettings: CodexSettingsService,
  claudeSettings: ClaudeSettingsService,
  nextProviderSettingsService: ProviderSettingsService
) {
  initCodexClient(codexSettings);
  initClaudeClient(claudeSettings);
  providerSettingsService = nextProviderSettingsService;
}

export async function getAssistantStatuses() {
  const statuses = await Promise.all([providers.codex.checkStatus(), providers.claude.checkStatus()]);
  const providerState = await providerSettingsService?.getState();
  return hydrateProviderStatuses(statuses, providerState ?? null);
}

export async function getAssistantState() {
  const providerState = await providerSettingsService?.getState();
  const statuses = hydrateProviderStatuses(
    await Promise.all([providers.codex.checkStatus(), providers.claude.checkStatus()]),
    providerState ?? null
  );
  const activeProviderId = resolveActiveProviderId(
    providerState?.activeProviderId ?? getRuntimeState().activeProviderId,
    statuses
  );
  const activeProvider = statuses.find((status) => status.id === activeProviderId) ?? null;
  setActiveProviderId(activeProviderId);

  return {
    activeProviderId,
    activeProvider,
    providers: statuses
  };
}

export async function setActiveAssistantProvider(providerId: AssistantProviderId) {
  const statuses = await getAssistantStatuses();
  const providerStatus = statuses.find((status) => status.id === providerId);
  if (!providerStatus?.installed) {
    throw new AssistantClientError(
      'service',
      `${providerId} is not installed.`,
      `${providerStatus?.name ?? providerId} is not installed on this machine yet.`
    );
  }

  if (!providerStatus.loggedIn) {
    throw new AssistantClientError(
      'auth',
      `${providerId} is not logged in.`,
      `${providerStatus.name} is not connected yet. Run the login command first.`
    );
  }

  if (!providerStatus.appConnected) {
    throw new AssistantClientError(
      'auth',
      `${providerId} is not connected in this app.`,
      `Connect ${providerStatus.name} from onboarding before switching to it here.`
    );
  }

  await providerSettingsService?.setActiveProviderPreference(providerId);
  setActiveProviderId(providerId);
  return getAssistantState();
}

export async function connectAssistantProvider(providerId: AssistantProviderId) {
  const statuses = await getAssistantStatuses();
  const providerStatus = statuses.find((status) => status.id === providerId);
  if (!providerStatus?.installed) {
    throw new AssistantClientError(
      'service',
      `${providerId} is not installed.`,
      `${providerStatus?.name ?? providerId} is not installed on this machine yet.`
    );
  }

  if (!providerStatus.loggedIn) {
    throw new AssistantClientError(
      'auth',
      `${providerId} is not logged in.`,
      `Login to ${providerStatus.name} first using ${providerStatus.loginCommand}.`
    );
  }

  await providerSettingsService?.connectProvider(providerId);
  const state = await getAssistantState();
  if (!state.activeProviderId) {
    await providerSettingsService?.setActiveProviderPreference(providerId);
    setActiveProviderId(providerId);
    return getAssistantState();
  }

  return state;
}

export async function disconnectAssistantProvider(providerId: AssistantProviderId) {
  await providerSettingsService?.disconnectProvider(providerId);
  setActiveProviderId(null);
  const statuses = await getAssistantStatuses();
  const nextActiveProviderId = resolveActiveProviderId(null, statuses);
  await providerSettingsService?.setActiveProviderPreference(nextActiveProviderId);
  setActiveProviderId(nextActiveProviderId);
  return getAssistantState();
}

export function getAssistantProviderName(providerId: AssistantProviderId | null | undefined) {
  if (providerId === 'claude') {
    return 'Claude Code';
  }

  return 'Codex';
}

export async function generateAssistantReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  const provider = await getActiveProvider();
  return provider.generateReply(userText, history, workspace, options);
}

export async function streamAssistantReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: StreamReplyOptions
) {
  const provider = await getActiveProvider();
  return provider.streamReply(userText, history, workspace, options);
}

export async function decideWriteIntent(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  const provider = await getActiveProvider();
  return provider.decideWriteIntent(userText, history, workspace, options);
}

export async function executeApprovedWrite(
  approval: PendingApproval,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  const provider = await getActiveProvider();
  return provider.executeApprovedWrite(approval, history, workspace, options);
}

export { collectGitDiff, revertProtectedGitChanges };

async function getActiveProvider() {
  const state = await getAssistantState();
  if (!state.activeProviderId || !state.activeProvider) {
    throw new AssistantClientError(
      'auth',
      'No assistant provider is connected in this app.',
      'Connect Codex or Claude Code from the onboarding screen before using the assistant.'
    );
  }

  const provider = providers[state.activeProviderId];
  if (!state.activeProvider?.installed) {
    throw new AssistantClientError(
      'service',
      `${provider.name} is not installed.`,
      `${provider.name} is not installed on this machine yet.`
    );
  }

  if (!state.activeProvider.loggedIn) {
    throw new AssistantClientError(
      'auth',
      `${provider.name} is not connected.`,
      `${provider.name} is not connected yet. Run ${state.activeProvider.loginCommand} first.`
    );
  }

  if (!state.activeProvider.appConnected) {
    throw new AssistantClientError(
      'auth',
      `${provider.name} is not connected in this app.`,
      `Connect ${provider.name} from the onboarding screen before using it here.`
    );
  }

  logger.info('assistant.provider.selected', {
    providerId: provider.id,
    providerName: provider.name,
    projectName: path.basename(getRootDir())
  });
  return provider;
}

function resolveActiveProviderId(
  preferredProviderId: AssistantProviderId | null | undefined,
  statuses: AssistantProviderStatus[]
): AssistantProviderId | null {
  const preferred =
    preferredProviderId && statuses.find((status) => status.id === preferredProviderId) ? preferredProviderId : null;

  if (preferred) {
    const preferredStatus = statuses.find((status) => status.id === preferred)!;
    if (preferredStatus.appConnected) {
      return preferred;
    }
  }

  const connected = statuses.find((status) => status.appConnected);
  if (connected) {
    return connected.id;
  }

  return null;
}

function hydrateProviderStatuses(
  statuses: AssistantProviderStatus[],
  providerState: Awaited<ReturnType<ProviderSettingsService['getState']>> | null
) {
  return statuses.map((status) => ({
    ...status,
    appConnected: providerState?.connections[status.id].connected ?? false,
    connectedAt: providerState?.connections[status.id].connectedAt ?? null
  }));
}
