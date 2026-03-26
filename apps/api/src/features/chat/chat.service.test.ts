import test from 'node:test';
import assert from 'node:assert/strict';
import type { PendingApproval, WorkspaceState } from '../../types.js';
import { ChatService } from './chat.service.js';

class ChatRepositoryStub {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
    source: 'voice' | 'text';
  }> = [];

  sessionId = 'session-1';

  async listRecentMessages() {
    return this.messages;
  }

  async appendMessages(messages: typeof this.messages) {
    this.messages.push(...messages);
  }

  async clearMessages() {
    this.messages = [];
  }

  async getActiveSessionId() {
    return this.sessionId;
  }
}

class ApprovalRepositoryStub {
  decisions: Array<Record<string, unknown>> = [];

  async recordDecision(input: Record<string, unknown>) {
    this.decisions.push(input);
  }
}

function createWorkspaceState(overrides?: Partial<WorkspaceState>): WorkspaceState {
  return {
    id: 'workspace-1',
    projectRoot: null,
    projectName: null,
    isGitRepo: false,
    writeAccessEnabled: false,
    secretPolicy: [],
    ...overrides
  };
}

function createChatRuntime(workspace: WorkspaceState) {
  let pendingApproval: PendingApproval | null = null;
  let lastDiff: unknown = null;

  return {
    getWorkspaceState: () => workspace,
    getPendingApproval: () => pendingApproval,
    createPendingApproval: (input: Omit<PendingApproval, 'id' | 'createdAt'>) => {
      pendingApproval = {
        id: 'approval-1',
        createdAt: new Date().toISOString(),
        ...input
      };
      return pendingApproval;
    },
    clearPendingApproval: () => {
      pendingApproval = null;
    },
    setLastDiff: (diff: unknown) => {
      lastDiff = diff;
      return diff;
    },
    getLastDiff: () => lastDiff
  };
}

test('ChatService returns a normal reply in read-only mode and persists both messages', async () => {
  const repository = new ChatRepositoryStub();
  const approvals = new ApprovalRepositoryStub();
  const runtime = createChatRuntime(createWorkspaceState());

  const service = new ChatService(repository as never, approvals as never, runtime as never, {
    generateAssistantReply: async () => ({ text: 'Read-only answer' }),
    streamAssistantReply: async () => ({ text: 'unused' }),
    decideWriteIntent: async () => {
      throw new Error('Should not decide write intent in read-only mode.');
    },
    executeApprovedWrite: async () => {
      throw new Error('Should not execute writes in read-only mode.');
    },
    collectGitDiff: async () => ({
      isGitRepo: false,
      changedFiles: [],
      files: []
    })
  });

  const result = await service.processTurn('Explain this code', 'text');

  assert.equal(result.type, 'reply');
  assert.equal(result.assistantMessage.text, 'Read-only answer');
  assert.equal(repository.messages.length, 2);
  assert.equal(repository.messages[0]?.role, 'user');
  assert.equal(repository.messages[1]?.role, 'assistant');
});

test('ChatService creates an approval when write intent is proposed', async () => {
  const repository = new ChatRepositoryStub();
  const approvals = new ApprovalRepositoryStub();
  const runtime = createChatRuntime(
    createWorkspaceState({
      projectRoot: '/tmp/project',
      projectName: 'project',
      isGitRepo: true,
      writeAccessEnabled: true
    })
  );

  const service = new ChatService(repository as never, approvals as never, runtime as never, {
    generateAssistantReply: async () => ({ text: 'unused' }),
    streamAssistantReply: async () => ({ text: 'unused' }),
    decideWriteIntent: async () => ({
      intent: 'propose_write',
      assistant_text: 'I need approval before editing files.',
      proposal_title: 'Refactor workspace picker',
      proposal_summary: 'Update the workspace picker flow.',
      tasks: ['Edit the picker UI', 'Update the API call'],
      agents: ['frontend', 'backend']
    }),
    executeApprovedWrite: async () => ({ text: 'unused' }),
    collectGitDiff: async () => ({
      isGitRepo: true,
      changedFiles: [],
      files: []
    })
  });

  const result = await service.processTurn('Refactor the workspace picker', 'voice');

  assert.equal(result.type, 'approval_required');
  assert.equal(result.pendingApproval.title, 'Refactor workspace picker');
  assert.equal(result.pendingApproval.projectRoot, '/tmp/project');
  assert.equal(repository.messages.length, 2);
});

test('ChatService records approval decisions with workspace and conversation linkage', async () => {
  const repository = new ChatRepositoryStub();
  const approvals = new ApprovalRepositoryStub();
  const runtime = createChatRuntime(
    createWorkspaceState({
      id: 'workspace-1',
      projectRoot: '/tmp/project',
      projectName: 'project',
      isGitRepo: true,
      writeAccessEnabled: true
    })
  );

  runtime.createPendingApproval({
    projectRoot: '/tmp/project',
    userRequest: 'Make the change',
    title: 'Apply UI change',
    summary: 'Update UI styles.',
    tasks: ['Edit CSS'],
    agents: ['frontend']
  });

  const service = new ChatService(repository as never, approvals as never, runtime as never, {
    generateAssistantReply: async () => ({ text: 'unused' }),
    streamAssistantReply: async () => ({ text: 'unused' }),
    decideWriteIntent: async () => ({
      intent: 'reply',
      assistant_text: 'unused',
      proposal_title: '',
      proposal_summary: '',
      tasks: [],
      agents: []
    }),
    executeApprovedWrite: async () => ({ text: 'Applied the UI change.' }),
    collectGitDiff: async () => ({
      isGitRepo: true,
      changedFiles: ['src/App.tsx'],
      files: [
        {
          filePath: 'src/App.tsx',
          diff: '@@'
        }
      ]
    })
  });

  const result = await service.approvePending('approval-1');

  assert.equal(result?.assistantMessage.text, 'Applied the UI change.');
  assert.equal(approvals.decisions.length, 1);
  assert.deepEqual(approvals.decisions[0], {
    workspaceId: 'workspace-1',
    conversationSessionId: 'session-1',
    taskTitle: 'Apply UI change',
    taskSummary: 'Update UI styles.',
    approved: true
  });
});
