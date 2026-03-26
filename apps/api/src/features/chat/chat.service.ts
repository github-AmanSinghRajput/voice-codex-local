import crypto from 'node:crypto';
import {
  clearPendingApproval,
  createPendingApproval,
  getPendingApproval,
  getWorkspaceState,
  setLastDiff
} from '../../runtime.js';
import {
  collectGitDiff,
  decideWriteIntent,
  executeApprovedWrite,
  generateAssistantReply,
  streamAssistantReply
} from '../../codex-client.js';
import type {
  ChatMessage,
  ChatSource,
  DiffSummary,
  PendingApproval
} from '../../types.js';
import { ApprovalRepository } from '../approvals/approval.repository.js';
import { ChatRepository } from './chat.repository.js';

interface ReplyResult {
  type: 'reply';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

interface ApprovalRequiredResult {
  type: 'approval_required';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  pendingApproval: PendingApproval;
}

export type ChatTurnResult = ReplyResult | ApprovalRequiredResult;

interface ChatRuntimeAdapter {
  getWorkspaceState: typeof getWorkspaceState;
  getPendingApproval: typeof getPendingApproval;
  createPendingApproval: typeof createPendingApproval;
  clearPendingApproval: typeof clearPendingApproval;
  setLastDiff: typeof setLastDiff;
}

interface CodexCorrelationOptions {
  voiceTurnId?: string;
}

interface StreamTurnCallbacks {
  onStarted?: (payload: { userMessage: ChatMessage; assistantMessage: ChatMessage }) => void;
  onDelta?: (payload: { assistantMessage: ChatMessage }) => void;
}

interface ChatCodexAdapter {
  collectGitDiff: typeof collectGitDiff;
  decideWriteIntent: typeof decideWriteIntent;
  executeApprovedWrite: typeof executeApprovedWrite;
  generateAssistantReply: typeof generateAssistantReply;
  streamAssistantReply: typeof streamAssistantReply;
}

const defaultRuntimeAdapter: ChatRuntimeAdapter = {
  getWorkspaceState,
  getPendingApproval,
  createPendingApproval,
  clearPendingApproval,
  setLastDiff
};

const defaultCodexAdapter: ChatCodexAdapter = {
  collectGitDiff,
  decideWriteIntent,
  executeApprovedWrite,
  generateAssistantReply,
  streamAssistantReply
};

export class ChatService {
  constructor(
    private readonly repository: ChatRepository = new ChatRepository(),
    private readonly approvalRepository: ApprovalRepository = new ApprovalRepository(),
    private readonly runtime: ChatRuntimeAdapter = defaultRuntimeAdapter,
    private readonly codex: ChatCodexAdapter = defaultCodexAdapter
  ) {}

  private toChatMessage(role: ChatMessage['role'], text: string, source: ChatSource): ChatMessage {
    return {
      id: crypto.randomUUID(),
      role,
      text,
      source,
      createdAt: new Date().toISOString()
    };
  }

  async processTurn(text: string, source: ChatSource, correlation?: CodexCorrelationOptions): Promise<ChatTurnResult> {
    const userMessage = this.toChatMessage('user', text, source);
    return this.processTurnWithUserMessage(text, source, userMessage, correlation);
  }

  async streamTurn(
    text: string,
    source: ChatSource,
    callbacks?: StreamTurnCallbacks,
    correlation?: CodexCorrelationOptions,
    signal?: AbortSignal
  ): Promise<ChatTurnResult> {
    const workspace = this.runtime.getWorkspaceState();
    const history = await this.readConversationHistory();
    const userMessage = this.toChatMessage('user', text, source);

    if (workspace.writeAccessEnabled && workspace.projectRoot && looksLikeWriteRequest(text)) {
      const stubAssistant = this.toChatMessage('assistant', '', source);
      callbacks?.onStarted?.({ userMessage, assistantMessage: stubAssistant });
      return this.processTurnWithUserMessage(text, source, userMessage, correlation, history, workspace);
    }

    const assistantMessage = this.toChatMessage('assistant', '', source);
    callbacks?.onStarted?.({ userMessage, assistantMessage });

    const assistantReply = await this.codex.streamAssistantReply(text, history, workspace, {
      signal,
      voiceTurnId: correlation?.voiceTurnId,
      onTextSnapshot: (snapshotText) => {
        assistantMessage.text = snapshotText;
        callbacks?.onDelta?.({
          assistantMessage: { ...assistantMessage }
        });
      }
    });

    assistantMessage.text = assistantReply.text;
    await this.persistMessages([userMessage, assistantMessage]);

    return {
      type: 'reply',
      userMessage,
      assistantMessage
    };
  }

  private async processTurnWithUserMessage(
    text: string,
    source: ChatSource,
    userMessage: ChatMessage,
    correlation?: CodexCorrelationOptions,
    existingHistory?: ChatMessage[],
    existingWorkspace?: ReturnType<ChatRuntimeAdapter['getWorkspaceState']>
  ): Promise<ChatTurnResult> {
    const workspace = existingWorkspace ?? this.runtime.getWorkspaceState();
    const history = existingHistory ?? (await this.readConversationHistory());

    if (!workspace.writeAccessEnabled || !workspace.projectRoot) {
      const assistantReply = await this.codex.generateAssistantReply(text, history, workspace, correlation);
      const assistantMessage = this.toChatMessage('assistant', assistantReply.text, source);
      await this.persistMessages([userMessage, assistantMessage]);

      return {
        type: 'reply',
        userMessage,
        assistantMessage
      };
    }

    const decision = await this.codex.decideWriteIntent(text, history, workspace, correlation);

    if (decision.intent === 'reply') {
      const assistantMessage = this.toChatMessage('assistant', decision.assistant_text, source);
      await this.persistMessages([userMessage, assistantMessage]);

      return {
        type: 'reply',
        userMessage,
        assistantMessage
      };
    }

    const approval = this.runtime.createPendingApproval({
      projectRoot: workspace.projectRoot,
      userRequest: text,
      title: decision.proposal_title || 'Approved coding task',
      summary: decision.proposal_summary || decision.assistant_text,
      tasks: decision.tasks,
      agents: decision.agents
    });

    const assistantMessage = this.toChatMessage('assistant', decision.assistant_text, source);
    await this.persistMessages([userMessage, assistantMessage]);

    return {
      type: 'approval_required',
      userMessage,
      assistantMessage,
      pendingApproval: approval
    };
  }

  async approvePending(approvalId: string) {
    const approval = this.runtime.getPendingApproval();
    if (!approval || approval.id !== approvalId) {
      return null;
    }

    const workspace = this.runtime.getWorkspaceState();
    const history = await this.readConversationHistory();
    const execution = await this.codex.executeApprovedWrite(approval, history, workspace);
    const assistantMessage = this.toChatMessage('assistant', execution.text, 'text');
    await this.persistMessages([assistantMessage]);

    const diff = await this.codex.collectGitDiff(approval.projectRoot);
    this.runtime.setLastDiff(diff);
    this.runtime.clearPendingApproval();
    await this.approvalRepository.recordDecision({
      workspaceId: this.runtime.getWorkspaceState().id,
      conversationSessionId: await this.repository.getActiveSessionId(),
      taskTitle: approval.title,
      taskSummary: approval.summary,
      approved: true
    });

    return {
      assistantMessage,
      diff
    };
  }

  async rejectPending(approvalId: string) {
    const approval = this.runtime.getPendingApproval();
    if (!approval || approval.id !== approvalId) {
      return null;
    }

    const assistantMessage = this.toChatMessage(
      'assistant',
      `Write request cancelled: ${approval.title}`,
      'text'
    );
    await this.persistMessages([assistantMessage]);
    this.runtime.clearPendingApproval();
    await this.approvalRepository.recordDecision({
      workspaceId: this.runtime.getWorkspaceState().id,
      conversationSessionId: await this.repository.getActiveSessionId(),
      taskTitle: approval.title,
      taskSummary: approval.summary,
      approved: false
    });

    return {
      assistantMessage
    };
  }

  getPendingApproval(approvalId: string) {
    const approval = this.runtime.getPendingApproval();
    if (!approval || approval.id !== approvalId) {
      return null;
    }

    return approval;
  }

  clearDiff() {
    this.runtime.setLastDiff(null);
  }

  async readRecentMessages(limit = 120) {
    return this.repository.listRecentMessages(limit);
  }

  async clearConversationHistory() {
    await this.repository.clearMessages();
  }

  private async readConversationHistory() {
    return this.repository.listRecentMessages(120);
  }

  private async persistMessages(messages: ChatMessage[]) {
    await this.repository.appendMessages(messages);
  }
}

function looksLikeWriteRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const readPattern = /\b(explain|describe|show\s+me|what|why|how|tell\s+me|list|read|check)\b/;
  if (readPattern.test(normalized)) {
    return false;
  }

  const actionPattern =
    /\b(fix|implement|change|edit|modify|update|add|remove|delete|create|refactor|rename|install|scaffold|patch|apply)\b/;
  const targetPattern =
    /\b(code|file|files|component|screen|ui|api|backend|frontend|test|tests|bug|issue|feature|function|class|schema|migration|db|database|endpoint)\b/;

  return actionPattern.test(normalized) && targetPattern.test(normalized);
}
