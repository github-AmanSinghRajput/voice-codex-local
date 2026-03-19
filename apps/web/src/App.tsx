import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type ChatRole = 'user' | 'assistant';
type MessageSource = 'voice' | 'text';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
type ScreenId = 'workspace' | 'voice' | 'terminal' | 'review';

interface MessageEntry {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: MessageSource;
}

interface WorkspaceState {
  projectRoot: string | null;
  projectName: string | null;
  isGitRepo: boolean;
  writeAccessEnabled: boolean;
  secretPolicy: string[];
}

interface PendingApproval {
  id: string;
  createdAt: string;
  projectRoot: string;
  userRequest: string;
  title: string;
  summary: string;
  tasks: string[];
  agents: string[];
}

interface DiffFileBlock {
  filePath: string;
  diff: string;
}

interface DiffSummary {
  isGitRepo: boolean;
  changedFiles: string[];
  files: DiffFileBlock[];
}

interface StatusResponse {
  codexStatus: {
    installed: boolean;
    loggedIn: boolean;
    authMode: string | null;
    statusText: string;
  };
  workspace: WorkspaceState;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  audio: {
    platform: string;
    available: boolean;
    inputDeviceLabel: string | null;
    outputDeviceLabel: string | null;
    transcriptionEngine: string;
    speechEngine: string;
    lastCheckedAt: string | null;
    error: string | null;
  };
  voiceSession: {
    active: boolean;
    phase: 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';
    liveTranscript: string;
    lastTranscript: string | null;
    silenceWindowMs: number;
    transport: 'native-macos' | 'unsupported';
    error: string | null;
  };
}

interface ReplyResponse {
  type: 'reply';
  userMessage: MessageEntry;
  assistantMessage: MessageEntry;
}

interface ApprovalRequiredResponse {
  type: 'approval_required';
  userMessage: MessageEntry;
  assistantMessage: MessageEntry;
  pendingApproval: PendingApproval;
}

interface DiffRow {
  leftLineNumber: number | null;
  leftText: string;
  leftKind: 'context' | 'remove' | 'empty';
  rightLineNumber: number | null;
  rightText: string;
  rightKind: 'context' | 'add' | 'empty';
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function getVoiceStateLabel(voiceState: VoiceState) {
  if (voiceState === 'listening') {
    return 'Listening for your next turn';
  }

  if (voiceState === 'thinking') {
    return 'Waiting on Codex';
  }

  if (voiceState === 'speaking') {
    return 'Codex is speaking';
  }

  return 'Session idle';
}

function pairDiffRows(
  removals: Array<{ lineNumber: number; text: string }>,
  additions: Array<{ lineNumber: number; text: string }>
) {
  const rows: DiffRow[] = [];
  const count = Math.max(removals.length, additions.length);

  for (let index = 0; index < count; index += 1) {
    const removal = removals[index];
    const addition = additions[index];
    rows.push({
      leftLineNumber: removal?.lineNumber ?? null,
      leftText: removal?.text ?? '',
      leftKind: removal ? 'remove' : 'empty',
      rightLineNumber: addition?.lineNumber ?? null,
      rightText: addition?.text ?? '',
      rightKind: addition ? 'add' : 'empty'
    });
  }

  return rows;
}

function parseDiffRows(diff: string) {
  const lines = diff.split('\n');
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let removals: Array<{ lineNumber: number; text: string }> = [];
  let additions: Array<{ lineNumber: number; text: string }> = [];

  const flushPairs = () => {
    if (removals.length === 0 && additions.length === 0) {
      return;
    }

    rows.push(...pairDiffRows(removals, additions));
    removals = [];
    additions = [];
  };

  for (const line of lines) {
    if (
      !line ||
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    if (line.startsWith('@@')) {
      flushPairs();
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
      continue;
    }

    if (line.startsWith('-')) {
      removals.push({
        lineNumber: oldLine,
        text: line.slice(1)
      });
      oldLine += 1;
      continue;
    }

    if (line.startsWith('+')) {
      additions.push({
        lineNumber: newLine,
        text: line.slice(1)
      });
      newLine += 1;
      continue;
    }

    flushPairs();
    if (line.startsWith(' ')) {
      rows.push({
        leftLineNumber: oldLine,
        leftText: line.slice(1),
        leftKind: 'context',
        rightLineNumber: newLine,
        rightText: line.slice(1),
        rightKind: 'context'
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  flushPairs();
  return rows;
}

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [textInput, setTextInput] = useState('');
  const [projectInput, setProjectInput] = useState('');
  const [error, setError] = useState('');
  const [busyLabel, setBusyLabel] = useState('');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('workspace');
  const eventSourceRef = useRef<EventSource | null>(null);

  const codexReady = Boolean(status?.codexStatus.loggedIn);
  const voiceChatActive = Boolean(status?.voiceSession.active);
  const liveTranscript = status?.voiceSession.liveTranscript ?? '';
  const voiceState: VoiceState =
    status?.voiceSession.phase === 'listening' || status?.voiceSession.phase === 'starting'
      ? 'listening'
      : status?.voiceSession.phase === 'speaking'
        ? 'speaking'
        : status?.voiceSession.phase === 'thinking'
          ? 'thinking'
          : 'idle';

  const navItems = useMemo(
    () => [
      {
        id: 'workspace' as const,
        label: 'Workspace',
        hint: status?.workspace.projectName ?? 'Select project',
        badge: status?.workspace.writeAccessEnabled ? 'write' : 'read'
      },
      {
        id: 'voice' as const,
        label: 'Voice',
        hint: voiceChatActive ? 'Live session open' : 'Ready to listen',
        badge: voiceChatActive ? 'live' : null
      },
      {
        id: 'terminal' as const,
        label: 'Terminal',
        hint: `${messages.length} messages`,
        badge: null
      },
      {
        id: 'review' as const,
        label: 'Review',
        hint: status?.pendingApproval
          ? 'Approval waiting'
          : status?.lastDiff?.changedFiles.length
            ? `${status.lastDiff.changedFiles.length} files changed`
            : 'No pending review',
        badge: status?.pendingApproval ? 'pending' : null
      }
    ],
    [
      messages.length,
      status?.lastDiff?.changedFiles.length,
      status?.pendingApproval,
      status?.workspace.projectName,
      status?.workspace.writeAccessEnabled,
      voiceChatActive
    ]
  );

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    if (status?.workspace.projectRoot) {
      setProjectInput(status.workspace.projectRoot);
    }
  }, [status?.workspace.projectRoot]);

  useEffect(() => {
    if (!codexReady) {
      return;
    }

    if (status?.pendingApproval) {
      setActiveScreen('review');
      return;
    }

    if (!status?.workspace.projectRoot) {
      setActiveScreen('workspace');
      return;
    }
  }, [codexReady, status?.pendingApproval, status?.workspace.projectRoot]);

  useEffect(() => {
    if (codexReady) {
      void loadLogs();
    } else {
      setMessages([]);
    }
  }, [codexReady]);

  useEffect(() => {
    if (status?.voiceSession.error) {
      setError(status.voiceSession.error);
    }
  }, [status?.voiceSession.error]);

  useEffect(() => {
    if (!codexReady) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const eventSource = new EventSource(`${apiBase}/api/voice/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: 'voice_state' | 'chat_append' | 'status_refresh';
          payload: unknown;
        };

        if (payload.type === 'voice_state') {
          const next = payload.payload as Pick<StatusResponse, 'audio' | 'voiceSession'>;
          setStatus((current) =>
            current
              ? {
                  ...current,
                  audio: next.audio,
                  voiceSession: next.voiceSession
                }
              : current
          );
          return;
        }

        if (payload.type === 'chat_append') {
          const next = payload.payload as { messages: MessageEntry[] };
          setMessages((current) => [...current, ...next.messages]);
          return;
        }

        void loadStatus();
      } catch {
        void loadStatus();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
    };

    return () => {
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };
  }, [codexReady]);

  async function api<T>(path: string, init?: RequestInit) {
    const response = await fetch(`${apiBase}${path}`, init);
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error ?? 'Request failed.');
    }

    return body as T;
  }

  async function loadStatus() {
    try {
      const nextStatus = await api<StatusResponse>('/api/status', {
        cache: 'no-store'
      });
      setStatus(nextStatus);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to reach the API.');
    }
  }

  async function loadLogs() {
    try {
      const body = await api<{ messages: MessageEntry[] }>('/api/logs');
      setMessages(body.messages);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load logs.');
    }
  }

  async function sendMessage(message: string, source: MessageSource) {
    const body = await api<ReplyResponse | ApprovalRequiredResponse>('/api/chat/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, source })
    });

    setMessages((current) => [...current, body.userMessage, body.assistantMessage]);

    if (body.type === 'approval_required') {
      await loadStatus();
      return {
        approvalRequired: true
      };
    }

    return {
      approvalRequired: false
    };
  }

  async function beginVoiceSession() {
    if (voiceChatActive) {
      return;
    }

    setError('');
    setActiveScreen('voice');

    try {
      await api<{ ok: boolean }>('/api/voice/session/start', {
        method: 'POST'
      });
      await loadStatus();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to start voice session.'
      );
    }
  }

  async function stopVoiceSession() {
    try {
      await api<{ ok: boolean }>('/api/voice/session/stop', {
        method: 'POST'
      });
      await loadStatus();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to stop voice session.'
      );
    }
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!textInput.trim()) {
      return;
    }

    setBusyLabel('Sending text to Codex...');

    try {
      const result = await sendMessage(textInput, 'text');
      setTextInput('');
      setBusyLabel('');

      if (result.approvalRequired) {
        setActiveScreen('review');
      } else {
        setActiveScreen('terminal');
      }
    } catch (requestError) {
      setBusyLabel('');
      setError(requestError instanceof Error ? requestError.message : 'Text chat failed.');
    }
  }

  async function handleProjectSave() {
    if (!projectInput.trim()) {
      return;
    }

    setBusyLabel('Setting project root...');

    try {
      await api<{ workspace: WorkspaceState }>('/api/workspace/project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectRoot: projectInput })
      });
      await loadStatus();
      setBusyLabel('');
    } catch (requestError) {
      setBusyLabel('');
      setError(requestError instanceof Error ? requestError.message : 'Unable to set project root.');
    }
  }

  async function handleWriteAccessToggle(enabled: boolean) {
    setBusyLabel(enabled ? 'Granting write approval mode...' : 'Revoking write approval mode...');

    try {
      await api<{ workspace: WorkspaceState }>('/api/workspace/write-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
      });
      await loadStatus();
      setBusyLabel('');
    } catch (requestError) {
      setBusyLabel('');
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to change write access.'
      );
    }
  }

  async function handleLogout() {
    await stopVoiceSession();
    setBusyLabel('Logging out of Codex...');

    try {
      await api<{ ok: boolean }>('/api/codex/logout', {
        method: 'POST'
      });
      await loadStatus();
      setBusyLabel('');
    } catch (requestError) {
      setBusyLabel('');
      setError(requestError instanceof Error ? requestError.message : 'Unable to log out.');
    }
  }

  async function handleClearChat() {
    await stopVoiceSession();
    setBusyLabel('Clearing chat history...');

    try {
      await api<{ ok: boolean }>('/api/logs', {
        method: 'DELETE'
      });
      setMessages([]);
      await loadStatus();
      setBusyLabel('');
      setError('');
    } catch (requestError) {
      setBusyLabel('');
      setError(requestError instanceof Error ? requestError.message : 'Unable to clear chat.');
    }
  }

  async function handleApproveChange() {
    if (!status?.pendingApproval) {
      return;
    }

    setBusyLabel('Applying approved changes...');

    try {
      const body = await api<{
        ok: boolean;
        assistantMessage: MessageEntry;
        diff: DiffSummary;
      }>(`/api/approvals/${status.pendingApproval.id}/approve`, {
        method: 'POST'
      });

      setMessages((current) => [...current, body.assistantMessage]);
      await loadStatus();
      setBusyLabel('');
    } catch (requestError) {
      setBusyLabel('');
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to apply approved changes.'
      );
    }
  }

  async function handleRejectChange() {
    if (!status?.pendingApproval) {
      return;
    }

    setBusyLabel('Rejecting write request...');

    try {
      const body = await api<{ ok: boolean; assistantMessage: MessageEntry }>(
        `/api/approvals/${status.pendingApproval.id}/reject`,
        {
          method: 'POST'
        }
      );

      setMessages((current) => [...current, body.assistantMessage]);
      await loadStatus();
      setBusyLabel('');
    } catch (requestError) {
      setBusyLabel('');
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to reject pending changes.'
      );
    }
  }

  function renderOnboarding() {
    return (
      <div className="launchpad">
        <section className="launch-hero panel">
          <div className="launch-copy">
            <p className="eyebrow">Voice codex operator</p>
            <h1>Production-grade flow starts with a clean connection ritual.</h1>
            <p className="lede">
              Connect Codex first. After that, the interface becomes a focused workstation with
              separate setup, voice, terminal, and review views instead of one overloaded page.
            </p>
            <div className="launch-checklist">
              <div className="check-item">
                <span>01</span>
                <p>Run `codex login --device-auth` in terminal</p>
              </div>
              <div className="check-item">
                <span>02</span>
                <p>Complete browser sign-in and return here</p>
              </div>
              <div className="check-item">
                <span>03</span>
                <p>Refresh status to unlock the workspace</p>
              </div>
            </div>
            <div className="hero-actions">
              <button className="primary" onClick={() => void loadStatus()}>
                Refresh Codex status
              </button>
              <div className={`status-pill ${codexReady ? 'online' : 'offline'}`}>
                <span className="status-dot" />
                {status?.codexStatus.statusText ?? 'Waiting for local Codex session'}
              </div>
            </div>
          </div>

          <div className="launch-visual">
            <div className={`voice-orb ${voiceState}`}>
              <span className="orb-ring ring-one" />
              <span className="orb-ring ring-two" />
              <span className="orb-ring ring-three" />
              <span className="orb-core" />
              <div className="voice-eyes" aria-hidden="true">
                <span className="eye left" />
                <span className="eye right" />
              </div>
              <div className="voice-bars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="connect-terminal">
              <div className="terminal-window chrome-shell">
                <div className="terminal-toolbar">
                  <div className="traffic-lights">
                    <span className="traffic red" />
                    <span className="traffic yellow" />
                    <span className="traffic green" />
                  </div>
                  <span className="toolbar-title">codex-login</span>
                </div>
                <div className="terminal-body">
                  <p>
                    <span className="prompt">$</span> codex login --device-auth
                  </p>
                  <p className="terminal-muted">Finish the browser flow and press refresh in the app.</p>
                  <p className="terminal-success">{status?.codexStatus.statusText || 'No active session yet.'}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderWorkspaceScreen() {
    return (
      <section className="content-stack">
        <section className="panel workspace-panel elevated">
          <div className="panel-header">
            <h2>Workspace Setup</h2>
            <span>
              {status?.workspace.projectName
                ? `${status.workspace.projectName}${status.workspace.isGitRepo ? ' • git repo' : ''}`
                : 'No project selected'}
            </span>
          </div>
          <div className="workspace-controls">
            <label className="path-field">
              <span>Project root path</span>
              <input
                value={projectInput}
                onChange={(event) => setProjectInput(event.target.value)}
                placeholder="/absolute/path/to/project"
              />
            </label>
            <button className="secondary" onClick={() => void handleProjectSave()}>
              Set project
            </button>
            <button
              className={status?.workspace.writeAccessEnabled ? 'ghost danger' : 'ghost'}
              disabled={!status?.workspace.projectRoot}
              onClick={() => void handleWriteAccessToggle(!status?.workspace.writeAccessEnabled)}
            >
              {status?.workspace.writeAccessEnabled ? 'Revoke file changes' : 'Allow file changes'}
            </button>
            <button className="ghost" onClick={() => void handleClearChat()}>
              Clear chat
            </button>
          </div>

          <div className="workspace-grid-compact">
            <div className="setup-card">
              <span className="setup-label">Current mode</span>
              <strong>{status?.workspace.writeAccessEnabled ? 'Approval-gated write mode' : 'Read-only advisory mode'}</strong>
              <p>
                File edits are never automatic. Even in write mode, Codex must first propose a task
                and wait for your approval.
              </p>
            </div>
            <div className="setup-card">
              <span className="setup-label">Safety boundary</span>
              <strong>Manual project selection only</strong>
              <p>
                The app does not auto-scan your machine. Codex only operates against the project
                root you set here.
              </p>
            </div>
            <div className="setup-card">
              <span className="setup-label">Blocked secrets</span>
              <strong>{status?.workspace.secretPolicy.slice(0, 3).join(', ') ?? 'Policy not loaded'}</strong>
              <p>Secret-like files stay outside the normal coding path and are not intended targets.</p>
            </div>
          </div>
        </section>
      </section>
    );
  }

  function renderVoiceScreen() {
    return (
      <section className="content-stack">
        <section className="voice-screen panel elevated">
          <div className="voice-screen-copy">
            <p className="eyebrow">Voice Session</p>
            <h2>Machine-level audio, continuous conversation.</h2>
            <p>
              The backend now listens through your Mac&apos;s current default input device, waits for
              2 seconds of silence, sends the turn to Codex, speaks the reply through system output,
              then returns to listening.
            </p>
            <div className="setup-grid compact">
              <div className="setup-card">
                <span className="setup-label">Input device</span>
                <strong>{status?.audio.inputDeviceLabel ?? 'Waiting for native audio bridge'}</strong>
                <p>Uses the active macOS input, including built-in mic, wired headset, or Bluetooth.</p>
              </div>
              <div className="setup-card">
                <span className="setup-label">Output path</span>
                <strong>{status?.audio.outputDeviceLabel ?? 'System default output'}</strong>
                <p>
                  Replies play through the machine output selected by macOS, not the browser tab.
                </p>
              </div>
              <div className="setup-card">
                <span className="setup-label">Transcription engine</span>
                <strong>{status?.audio.transcriptionEngine ?? 'Native engine unavailable'}</strong>
                <p>{status?.audio.error ?? 'Native macOS speech capture is active for better clarity.'}</p>
              </div>
            </div>
            <div className="button-row">
              <button
                className="primary large"
                disabled={voiceChatActive || !status?.audio.available}
                onClick={() => void beginVoiceSession()}
              >
                Start voice chat
              </button>
              <button
                className="secondary large"
                disabled={!voiceChatActive}
                onClick={() => void stopVoiceSession()}
              >
                End voice chat
              </button>
            </div>
          </div>

          <div className="voice-stage focus">
            <div className={`voice-orb ${voiceState}`}>
              <span className="orb-ring ring-one" />
              <span className="orb-ring ring-two" />
              <span className="orb-ring ring-three" />
              <span className="orb-core" />
              <div className="voice-eyes" aria-hidden="true">
                <span className="eye left" />
                <span className="eye right" />
              </div>
              <div className="voice-bars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <p className="voice-state-label">{getVoiceStateLabel(voiceState)}</p>
            <p className="voice-state-subtle">
              {voiceChatActive
                ? 'Live call mode is active. Pause naturally and the backend will finalize the turn.'
                : status?.audio.available
                  ? 'Session is idle until you start voice chat.'
                  : 'Native audio bridge is unavailable until backend audio access is ready.'}
            </p>
          </div>
        </section>

        <section className="panel transcript-preview-panel">
          <div className="panel-header">
            <h2>Live Transcript</h2>
            <span>{voiceChatActive ? 'Streaming current turn' : 'Waiting for next turn'}</span>
          </div>
          <div className="transcript-preview terminal-card">
            <span>Current spoken turn</span>
            <strong>{liveTranscript || 'Your current spoken question will appear here in real time.'}</strong>
          </div>
        </section>
      </section>
    );
  }

  function renderTerminalScreen() {
    return (
      <section className="content-stack">
        <section className="panel terminal-shell elevated">
          <div className="terminal-window mac-terminal">
            <div className="terminal-toolbar">
              <div className="traffic-lights">
                <span className="traffic red" />
                <span className="traffic yellow" />
                <span className="traffic green" />
              </div>
              <span className="toolbar-title">
                {status?.workspace.projectName ? `${status.workspace.projectName} — codex-session` : 'codex-session'}
              </span>
            </div>

            <div className="terminal-body">
              <div className="terminal-log">
                {messages.length === 0 ? (
                  <div className="empty-state terminal-empty">
                    No conversation yet. Start with voice or type a prompt below.
                  </div>
                ) : (
                  messages.map((message) => (
                    <article className={`terminal-entry ${message.role}`} key={message.id}>
                      <div className="terminal-prefix">
                        <span className="terminal-role">{message.role === 'user' ? 'user@voice-codex' : 'codex@operator'}</span>
                        <span className="terminal-time">{formatDate(message.createdAt)}</span>
                      </div>
                      <pre>{message.text}</pre>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>

          <form className="terminal-composer" onSubmit={(event) => void handleTextSubmit(event)}>
            <label className="composer-label">
              <span className="prompt">$</span>
              <textarea
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                placeholder="Type a coding question, or describe a change you want Codex to propose."
              />
            </label>
            <div className="composer-actions">
              <button className="secondary" disabled={!textInput.trim()} type="submit">
                Send to Codex
              </button>
            </div>
          </form>
        </section>
      </section>
    );
  }

  function renderReviewScreen() {
    return (
      <section className="content-stack">
        {status?.pendingApproval ? (
          <section className="panel approval-panel elevated">
            <div className="panel-header">
              <h2>Write Approval Required</h2>
              <span>{formatDate(status.pendingApproval.createdAt)}</span>
            </div>
            <div className="approval-hero">
              <div className="approval-summary">
                <span className="setup-label">Proposed task</span>
                <h3>{status.pendingApproval.title}</h3>
                <p>{status.pendingApproval.summary}</p>
              </div>
              <div className="approval-agents">
                <span className="setup-label">Suggested mini agents</span>
                <strong>
                  {status.pendingApproval.agents.length > 0
                    ? status.pendingApproval.agents.join(', ')
                    : 'generalist codex'}
                </strong>
              </div>
            </div>
            <div className="task-list">
              {status.pendingApproval.tasks.map((task, index) => (
                <div className="task-item" key={`${status.pendingApproval?.id}-${index}`}>
                  <span>{index + 1}</span>
                  <p>{task}</p>
                </div>
              ))}
            </div>
            <div className="button-row">
              <button className="primary large" onClick={() => void handleApproveChange()}>
                Approve and apply changes
              </button>
              <button className="secondary large" onClick={() => void handleRejectChange()}>
                Reject changes
              </button>
            </div>
          </section>
        ) : null}

        <section className="panel diff-panel elevated">
          <div className="panel-header">
            <h2>Change Review</h2>
            <span>
              {status?.lastDiff?.changedFiles.length
                ? `${status.lastDiff.changedFiles.length} files changed`
                : 'No recent diff'}
            </span>
          </div>

          {status?.lastDiff && status.lastDiff.changedFiles.length > 0 ? (
            <>
              <div className="diff-file-list">
                {status.lastDiff.changedFiles.map((filePath) => (
                  <span className="file-chip" key={filePath}>
                    {filePath}
                  </span>
                ))}
              </div>

              {status.lastDiff.files.map((file) => (
                <section className="diff-file" key={file.filePath}>
                  <header className="diff-file-header">{file.filePath}</header>
                  <div className="diff-grid">
                    <div className="diff-column-title">Before</div>
                    <div className="diff-column-title">After</div>
                    {parseDiffRows(file.diff).map((row, index) => (
                      <div className="diff-row" key={`${file.filePath}-${index}`}>
                        <div className={`diff-cell ${row.leftKind}`}>
                          <span className="line-number">{row.leftLineNumber ?? ''}</span>
                          <code>{row.leftText}</code>
                        </div>
                        <div className={`diff-cell ${row.rightKind}`}>
                          <span className="line-number">{row.rightLineNumber ?? ''}</span>
                          <code>{row.rightText}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <div className="empty-state">No approved file changes yet. When Codex edits code, the diff review will appear here.</div>
          )}
        </section>
      </section>
    );
  }

  function renderMainScreen() {
    if (activeScreen === 'workspace') {
      return renderWorkspaceScreen();
    }

    if (activeScreen === 'voice') {
      return renderVoiceScreen();
    }

    if (activeScreen === 'review') {
      return renderReviewScreen();
    }

    return renderTerminalScreen();
  }

  return (
    <div className="shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      {!codexReady ? (
        renderOnboarding()
      ) : (
        <div className="operator-shell">
          <aside className="operator-sidebar panel">
            <div className="sidebar-brand">
              <p className="eyebrow">Voice Codex</p>
              <strong>Operator Console</strong>
              <span>{status?.codexStatus.statusText ?? 'Connected session'}</span>
            </div>

            <nav className="sidebar-nav">
              {navItems.map((item) => (
                <button
                  className={`nav-card ${activeScreen === item.id ? 'active' : ''}`}
                  key={item.id}
                  onClick={() => setActiveScreen(item.id)}
                >
                  <div className="nav-copy">
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </div>
                  {item.badge ? <em>{item.badge}</em> : null}
                </button>
              ))}
            </nav>

            <div className="sidebar-footer">
              <div className={`status-pill ${status?.workspace.writeAccessEnabled ? 'warning' : 'online'}`}>
                <span className="status-dot" />
                {status?.workspace.writeAccessEnabled ? 'Write proposals enabled' : 'Read-only safe mode'}
              </div>
              <button className="ghost" onClick={() => void handleLogout()}>
                Logout Codex
              </button>
            </div>
          </aside>

          <main className="operator-main">
            <section className="topbar panel">
              <div className="topbar-copy">
                <h2>
                  {activeScreen === 'workspace' && 'Project Workspace'}
                  {activeScreen === 'voice' && 'Voice Session'}
                  {activeScreen === 'terminal' && 'Terminal Conversation'}
                  {activeScreen === 'review' && 'Approval and Diff Review'}
                </h2>
                <p>
                  {activeScreen === 'workspace' &&
                    'Choose the one project root Codex is allowed to work against and control write permissions here.'}
                  {activeScreen === 'voice' &&
                    'Start one call-style conversation and let Codex listen, think, speak, and resume.'}
                  {activeScreen === 'terminal' &&
                    'Use a proper terminal-style transcript and a dedicated command composer for text prompts.'}
                  {activeScreen === 'review' &&
                    'Approve file changes explicitly and inspect the resulting git-style diff side by side.'}
                </p>
              </div>
              <div className="topbar-actions">
              <div className={`status-pill ${voiceChatActive ? 'online' : 'offline'}`}>
                  <span className="status-dot" />
                  {voiceChatActive ? 'Voice live' : 'Voice idle'}
                </div>
                <div className={`status-pill ${status?.audio.available ? 'online' : 'warning'}`}>
                  <span className="status-dot" />
                  {status?.audio.available ? 'Native audio ready' : 'Native audio unavailable'}
                </div>
                <div className={`status-pill ${status?.pendingApproval ? 'warning' : 'online'}`}>
                  <span className="status-dot" />
                  {status?.pendingApproval ? 'Approval waiting' : 'No pending write task'}
                </div>
              </div>
            </section>

            {error ? <div className="banner error">{error}</div> : null}
            {busyLabel ? <div className="banner busy">{busyLabel}</div> : null}

            {renderMainScreen()}
          </main>
        </div>
      )}
    </div>
  );
}
