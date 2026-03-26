import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNavigationHints,
  getSuggestedScreen,
  getVoiceState,
  groupMessages,
  mergeUniqueMessages
} from './helpers';
import type { MessageEntry, StatusResponse } from './types';

function createStatus(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    codexStatus: {
      installed: true,
      loggedIn: true,
      authMode: 'ChatGPT',
      statusText: 'Logged in'
    },
    workspace: {
      id: 'workspace-1',
      projectRoot: '/tmp/project',
      projectName: 'project',
      isGitRepo: true,
      writeAccessEnabled: false,
      secretPolicy: ['.env']
    },
    pendingApproval: null,
    lastDiff: null,
    audio: {
      platform: 'darwin',
      available: true,
      inputDeviceLabel: 'MacBook Pro Microphone',
      outputDeviceLabel: null,
      transcriptionEngine: 'Desktop media capture + STT provider',
      speechEngine: 'Disabled',
      lastCheckedAt: null,
      error: null
    },
    voiceSession: {
      active: false,
      phase: 'idle',
      liveTranscript: '',
      lastTranscript: null,
      silenceWindowMs: 2000,
      transport: 'desktop-media',
      error: null
    },
    system: {
      database: {
        configured: true,
        reachable: true,
        message: 'healthy'
      }
    },
    ...overrides
  };
}

test('getSuggestedScreen returns workspace when Codex is not logged in', () => {
  const result = getSuggestedScreen(
    createStatus({
      codexStatus: {
        installed: true,
        loggedIn: false,
        authMode: null,
        statusText: 'Not logged in'
      }
    }),
    'terminal'
  );

  assert.equal(result, 'workspace');
});

test('getSuggestedScreen returns review when approval is pending', () => {
  const result = getSuggestedScreen(
    createStatus({
      pendingApproval: {
        id: 'approval-1',
        createdAt: new Date().toISOString(),
        projectRoot: '/tmp/project',
        userRequest: 'Update API',
        title: 'Update API',
        summary: 'Change the API',
        tasks: ['Edit route'],
        agents: ['backend']
      }
    }),
    'voice'
  );

  assert.equal(result, 'review');
});

test('buildNavigationHints matches visible launch surfaces only', () => {
  const messages: MessageEntry[] = [
    {
      id: 'message-1',
      role: 'user',
      text: 'Hello',
      createdAt: new Date().toISOString(),
      source: 'text'
    }
  ];

  const hints = buildNavigationHints('terminal', createStatus(), messages);

  assert.deepEqual(
    hints.map((hint) => hint.id),
    ['workspace', 'voice', 'terminal', 'shell', 'review', 'notes', 'vibemusic']
  );
  assert.equal(hints.find((hint) => hint.id === 'terminal')?.hint, '1 turns logged');
});

test('groupMessages clusters adjacent messages from same actor and source', () => {
  const createdAt = new Date('2026-03-22T10:00:00.000Z').toISOString();
  const messages: MessageEntry[] = [
    { id: '1', role: 'user', text: 'first', createdAt, source: 'voice' },
    {
      id: '2',
      role: 'user',
      text: 'second',
      createdAt: new Date('2026-03-22T10:01:00.000Z').toISOString(),
      source: 'voice'
    },
    {
      id: '3',
      role: 'assistant',
      text: 'reply',
      createdAt: new Date('2026-03-22T10:02:00.000Z').toISOString(),
      source: 'voice'
    }
  ];

  const groups = groupMessages(messages);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].messages.length, 2);
  assert.equal(groups[1].messages.length, 1);
});

test('mergeUniqueMessages preserves one copy of each message id', () => {
  const createdAt = new Date('2026-03-22T10:00:00.000Z').toISOString();
  const existing: MessageEntry[] = [
    { id: '1', role: 'user', text: 'first', createdAt, source: 'text' }
  ];
  const incoming: MessageEntry[] = [
    { id: '1', role: 'user', text: 'first', createdAt, source: 'text' },
    {
      id: '2',
      role: 'assistant',
      text: 'reply',
      createdAt: new Date('2026-03-22T10:00:01.000Z').toISOString(),
      source: 'text'
    }
  ];

  const merged = mergeUniqueMessages(existing, incoming);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, '1');
  assert.equal(merged[1].id, '2');
});

test('getVoiceState surfaces backend error phase explicitly', () => {
  const state = getVoiceState(
    createStatus({
      voiceSession: {
        active: false,
        phase: 'error',
        liveTranscript: '',
        lastTranscript: null,
        silenceWindowMs: 2000,
        transport: 'desktop-media',
        error: 'Microphone permission was denied.'
      }
    })
  );

  assert.equal(state, 'error');
});
