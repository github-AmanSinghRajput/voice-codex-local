import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import type { Response } from 'express';
import { getAudioBridgeInfo, listenForSpeechTurn, speakThroughSystem } from './audio-bridge.js';
import {
  clearLogs,
  getRootDir,
  readLogs
} from './store.js';
import {
  clearPendingApproval,
  createPendingApproval,
  getPendingApproval,
  getRuntimeState,
  getWorkspaceState,
  resetVoiceSessionState,
  setAudioState,
  setLastDiff,
  setProjectRoot,
  setVoiceSessionState,
  setWriteAccessEnabled
} from './runtime.js';
import {
  collectGitDiff,
  decideWriteIntent,
  executeApprovedWrite,
  generateAssistantReply,
  getCodexStatus,
  logoutCodex
} from './codex-client.js';
import type { ChatMessage, ChatSource, PendingApproval } from './types.js';
import { appendMessages } from './store.js';

dotenv.config({ path: path.join(getRootDir(), '.env') });

const app = express();
app.set('etag', false);
const port = Number(process.env.API_PORT ?? 8787);
const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const silenceWindowMs = 2000;
const voiceLocale = process.env.VOICE_LOCALE ?? 'en-US';
const systemVoice = process.env.SYSTEM_VOICE?.trim() || undefined;
const systemVoiceRate = Number(process.env.SYSTEM_VOICE_RATE ?? 190);

let activeVoiceRunId = 0;
let listenAbortController: AbortController | null = null;
let currentPlayback: ReturnType<typeof speakThroughSystem> | null = null;
const eventClients = new Set<Response>();

app.use(
  cors({
    origin: allowedOrigin
  })
);
app.use(express.json({ limit: '2mb' }));

function broadcastEvent(type: string, payload: unknown) {
  const line = `data: ${JSON.stringify({ type, payload })}\n\n`;
  for (const client of eventClients) {
    client.write(line);
  }
}

function emitVoiceSnapshot() {
  const runtime = getRuntimeState();
  broadcastEvent('voice_state', {
    audio: runtime.audio,
    voiceSession: runtime.voiceSession
  });
}

function emitChatAppend(messages: ChatMessage[]) {
  broadcastEvent('chat_append', { messages });
}

function emitStatusRefresh() {
  broadcastEvent('status_refresh', {});
}

function toChatMessage(role: ChatMessage['role'], text: string, source: ChatSource) {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    source,
    createdAt: new Date().toISOString()
  } satisfies ChatMessage;
}

async function refreshAudioState() {
  const info = await getAudioBridgeInfo();
  setAudioState({
    available: info.available,
    inputDeviceLabel: info.inputDeviceLabel,
    outputDeviceLabel: info.outputDeviceLabel ?? 'System Default Output',
    error: info.error
  });
  emitVoiceSnapshot();
}

async function processChatTurn(text: string, source: ChatSource) {
  const workspace = getWorkspaceState();
  const history = (await readLogs()).messages;
  const userMessage = toChatMessage('user', text, source);

  if (!workspace.writeAccessEnabled || !workspace.projectRoot) {
    const assistantReply = await generateAssistantReply(text, history, workspace);
    const assistantMessage = toChatMessage('assistant', assistantReply.text, source);
    await appendMessages([userMessage, assistantMessage]);

    return {
      type: 'reply' as const,
      userMessage,
      assistantMessage
    };
  }

  const decision = await decideWriteIntent(text, history, workspace);

  if (decision.intent === 'reply') {
    const assistantMessage = toChatMessage('assistant', decision.assistant_text, source);
    await appendMessages([userMessage, assistantMessage]);

    return {
      type: 'reply' as const,
      userMessage,
      assistantMessage
    };
  }

  const approval = createPendingApproval({
    projectRoot: workspace.projectRoot,
    userRequest: text,
    title: decision.proposal_title || 'Approved coding task',
    summary: decision.proposal_summary || decision.assistant_text,
    tasks: decision.tasks,
    agents: decision.agents
  });

  const assistantMessage = toChatMessage('assistant', decision.assistant_text, source);
  await appendMessages([userMessage, assistantMessage]);

  return {
    type: 'approval_required' as const,
    userMessage,
    assistantMessage,
    pendingApproval: approval
  };
}

async function speakAssistantReply(text: string) {
  currentPlayback?.stop();
  currentPlayback = speakThroughSystem(text, {
    voice: systemVoice,
    rate: Number.isFinite(systemVoiceRate) ? systemVoiceRate : undefined
  });
  setVoiceSessionState({
    phase: 'speaking',
    error: null
  });
  emitVoiceSnapshot();

  try {
    await currentPlayback.done;
  } finally {
    currentPlayback = null;
  }
}

function stopNativeVoiceSession() {
  activeVoiceRunId += 1;
  listenAbortController?.abort();
  listenAbortController = null;
  currentPlayback?.stop();
  currentPlayback = null;
  resetVoiceSessionState('idle');
  emitVoiceSnapshot();
}

async function runNativeVoiceLoop(runId: number) {
  while (getRuntimeState().voiceSession.active && activeVoiceRunId === runId) {
    try {
      listenAbortController = new AbortController();
      setVoiceSessionState({
        active: true,
        phase: 'listening',
        liveTranscript: '',
        error: null
      });
      emitVoiceSnapshot();

      const capture = await listenForSpeechTurn({
        silenceWindowMs,
        locale: voiceLocale,
        signal: listenAbortController.signal,
        onReady: (inputDeviceLabel) => {
          setAudioState({
            inputDeviceLabel,
            outputDeviceLabel: 'System Default Output',
            available: true,
            error: null
          });
          emitVoiceSnapshot();
        },
        onPartial: (transcript) => {
          setVoiceSessionState({
            active: true,
            phase: 'listening',
            liveTranscript: transcript
          });
          emitVoiceSnapshot();
        }
      });

      listenAbortController = null;

      if (!getRuntimeState().voiceSession.active || activeVoiceRunId !== runId) {
        return;
      }

      const transcript = capture.transcript.trim();
      setVoiceSessionState({
        active: true,
        phase: transcript ? 'thinking' : 'listening',
        liveTranscript: transcript,
        lastTranscript: transcript || getRuntimeState().voiceSession.lastTranscript,
        error: null
      });
      emitVoiceSnapshot();

      if (!transcript) {
        continue;
      }

      const result = await processChatTurn(transcript, 'voice');
      emitChatAppend([result.userMessage, result.assistantMessage]);
      emitStatusRefresh();

      await speakAssistantReply(result.assistantMessage.text);

      if (result.type === 'approval_required') {
        setVoiceSessionState({
          active: false,
          phase: 'idle',
          liveTranscript: '',
          error: null
        });
        emitVoiceSnapshot();
        return;
      }

      setVoiceSessionState({
        active: true,
        phase: 'listening',
        liveTranscript: ''
      });
      emitVoiceSnapshot();
    } catch (error) {
      if (activeVoiceRunId !== runId) {
        return;
      }

      setVoiceSessionState({
        active: false,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Native voice session failed.',
        liveTranscript: ''
      });
      emitVoiceSnapshot();
      return;
    }
  }
}

app.get('/api/status', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  const codexStatus = await getCodexStatus();
  const runtime = getRuntimeState();

  response.json({
    codexStatus,
    workspace: runtime.workspace,
    pendingApproval: runtime.pendingApproval,
    lastDiff: runtime.lastDiff,
    audio: runtime.audio,
    voiceSession: runtime.voiceSession
  });
});

app.get('/api/voice/events', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  eventClients.add(response);
  response.write(`data: ${JSON.stringify({
    type: 'voice_state',
    payload: {
      audio: getRuntimeState().audio,
      voiceSession: getRuntimeState().voiceSession
    }
  })}\n\n`);

  request.on('close', () => {
    eventClients.delete(response);
  });
});

app.post('/api/voice/session/start', async (_request, response) => {
  try {
    await refreshAudioState();
    const runtime = getRuntimeState();

    if (!runtime.audio.available) {
      response.status(400).json({
        error: runtime.audio.error ?? 'Native audio bridge is not available.'
      });
      return;
    }

    if (runtime.voiceSession.active) {
      response.json({
        ok: true,
        voiceSession: runtime.voiceSession
      });
      return;
    }

    activeVoiceRunId += 1;
    setVoiceSessionState({
      active: true,
      phase: 'starting',
      liveTranscript: '',
      error: null,
      silenceWindowMs
    });
    emitVoiceSnapshot();

    void runNativeVoiceLoop(activeVoiceRunId);

    response.json({
      ok: true,
      voiceSession: getRuntimeState().voiceSession
    });
  } catch (error) {
    setVoiceSessionState({
      active: false,
      phase: 'error',
      error: error instanceof Error ? error.message : 'Unable to start native voice session.'
    });
    emitVoiceSnapshot();

    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to start native voice session.'
    });
  }
});

app.post('/api/voice/session/stop', async (_request, response) => {
  stopNativeVoiceSession();
  response.json({
    ok: true,
    voiceSession: getRuntimeState().voiceSession
  });
});

app.post('/api/workspace/project', async (request, response) => {
  try {
    const projectRoot =
      typeof request.body.projectRoot === 'string' ? request.body.projectRoot.trim() : '';

    if (!projectRoot) {
      response.status(400).json({ error: 'Project path is required.' });
      return;
    }

    const workspace = await setProjectRoot(projectRoot);
    response.json({ workspace });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unable to set project root.'
    });
  }
});

app.post('/api/workspace/write-access', async (request, response) => {
  const enabled = Boolean(request.body.enabled);
  const workspace = setWriteAccessEnabled(enabled);
  response.json({ workspace });
});

app.post('/api/codex/logout', async (_request, response) => {
  try {
    stopNativeVoiceSession();
    await logoutCodex();
    setWriteAccessEnabled(false);
    clearPendingApproval();
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to log out of Codex.'
    });
  }
});

app.get('/api/logs', async (_request, response) => {
  const store = await readLogs();
  response.json({
    messages: store.messages.slice(-120)
  });
});

app.delete('/api/logs', async (_request, response) => {
  stopNativeVoiceSession();
  await clearLogs();
  setLastDiff(null);
  clearPendingApproval();
  emitStatusRefresh();
  response.json({
    ok: true
  });
});

app.post('/api/chat/text', async (request, response) => {
  try {
    const text = typeof request.body.message === 'string' ? request.body.message.trim() : '';
    const source: ChatSource = request.body.source === 'voice' ? 'voice' : 'text';

    if (!text) {
      response.status(400).json({ error: 'Message is required.' });
      return;
    }

    const result = await processChatTurn(text, source);
    emitStatusRefresh();

    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Text chat failed.'
    });
  }
});

app.post('/api/approvals/:approvalId/approve', async (request, response) => {
  try {
    const approval = getPendingApproval();
    if (!approval || approval.id !== request.params.approvalId) {
      response.status(404).json({ error: 'Pending approval not found.' });
      return;
    }

    const workspace = getWorkspaceState();
    const history = (await readLogs()).messages;
    const execution = await executeApprovedWrite(approval, history, workspace);
    const assistantMessage = toChatMessage('assistant', execution.text, 'text');
    await appendMessages([assistantMessage]);
    const diff = await collectGitDiff(approval.projectRoot);
    setLastDiff(diff);
    clearPendingApproval();
    emitStatusRefresh();

    response.json({
      ok: true,
      assistantMessage,
      diff
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to execute approved changes.'
    });
  }
});

app.post('/api/approvals/:approvalId/reject', async (request, response) => {
  const approval: PendingApproval | null = getPendingApproval();
  if (!approval || approval.id !== request.params.approvalId) {
    response.status(404).json({ error: 'Pending approval not found.' });
    return;
  }

  const assistantMessage = toChatMessage(
    'assistant',
    `Write request cancelled: ${approval.title}`,
    'text'
  );
  await appendMessages([assistantMessage]);
  clearPendingApproval();
  emitStatusRefresh();

  response.json({
    ok: true,
    assistantMessage
  });
});

app.listen(port, async () => {
  await refreshAudioState();
  console.log(`Voice Codex API listening on http://localhost:${port}`);
});
