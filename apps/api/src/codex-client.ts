import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ChatMessage, DiffSummary, PendingApproval, WorkspaceState } from './types.js';
import { logger } from './lib/logger.js';
import { getRootDir } from './store.js';
import type { CodexSettingsService } from './features/codex/codex-settings.service.js';

const execFileAsync = promisify(execFile);
let codexSettingsService: CodexSettingsService | null = null;

export function initCodexClient(settings: CodexSettingsService) {
  codexSettingsService = settings;
}

export type CodexErrorKind = 'auth' | 'rate_limit' | 'service' | 'unknown';

export class CodexClientError extends Error {
  readonly kind: CodexErrorKind;
  readonly friendlyMessage: string;

  constructor(kind: CodexErrorKind, message: string, friendlyMessage: string) {
    super(message);
    this.name = 'CodexClientError';
    this.kind = kind;
    this.friendlyMessage = friendlyMessage;
  }
}

function classifyCodexError(error: unknown): CodexClientError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (/not logged in|login|auth|unauthorized|401|forbidden|403|session expired/i.test(lower)) {
    return new CodexClientError(
      'auth',
      message,
      'Your Codex session needs reconnecting. Run the login command to continue.'
    );
  }

  if (/rate.?limit|too many requests|429|quota|throttl/i.test(lower)) {
    return new CodexClientError(
      'rate_limit',
      message,
      'Codex is rate limited right now. Give it a moment and try again.'
    );
  }

  if (/timeout|timed out|econnrefused|econnreset|enotfound|network|socket/i.test(lower)) {
    return new CodexClientError(
      'service',
      message,
      'Codex is not responding right now. Check your connection and try again.'
    );
  }

  return new CodexClientError(
    'unknown',
    message,
    'Something went wrong with Codex. Try again or check the logs.'
  );
}

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
}

const systemPrompt = [
  'You are Codex Voice Buddy, a sharp coding assistant.',
  'Respond as if you are speaking to one engineer live.',
  'Be concise, practical, and technically strong.',
  'Prefer short explanations, direct recommendations, and code-minded reasoning.',
  'When the user asks for implementation advice, answer like a senior engineer.',
  'When you are about to propose code changes, first explain clearly what you plan to change and why.',
  'Describe the changes in plain spoken English — which files, what modifications, and the reasoning.',
  'Your explanation will be spoken aloud to the developer, so keep it natural and conversational.',
  'After proposing changes that require approval, tell the developer to review the diff and approve or reject.'
].join(' ');

function getCodexCommand() {
  return process.env.CODEX_COMMAND ?? 'codex';
}

function normalizeStatusText(output: string) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('WARNING:'))
    .join('\n')
    .trim();
}

function buildConversation(history: ChatMessage[]) {
  return history
    .slice(-12)
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.text}`)
    .join('\n');
}

function workspaceLine(workspace: WorkspaceState) {
  if (!workspace.projectRoot) {
    return 'No project root selected. General assistant mode only.';
  }

  return `Selected workspace: ${workspace.projectRoot}`;
}

function buildReadOnlyPrompt(userText: string, history: ChatMessage[], workspace: WorkspaceState) {
  const conversation = buildConversation(history);

  return [
    systemPrompt,
    '',
    workspaceLine(workspace),
    `Write access enabled: ${workspace.writeAccessEnabled ? 'yes' : 'no'}.`,
    `Never read or edit files that look like secrets. Blocked patterns: ${workspace.secretPolicy.join(', ')}.`,
    'Operate in advisory/read-only mode only.',
    '',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `Latest user message:\n${userText}`,
    '',
    'Respond directly to the latest user message.'
  ]
    .filter(Boolean)
    .join('\n');
}

function buildWriteDecisionPrompt(userText: string, history: ChatMessage[], workspace: WorkspaceState) {
  const conversation = buildConversation(history);

  return [
    systemPrompt,
    '',
    workspaceLine(workspace),
    `Write access enabled: ${workspace.writeAccessEnabled ? 'yes' : 'no'}.`,
    `Never read or edit files that look like secrets. Blocked patterns: ${workspace.secretPolicy.join(', ')}.`,
    'You are deciding whether the latest user request should remain a normal reply or become a write proposal requiring approval.',
    'Return reply only if the request can be satisfied without changing files or running project-changing commands.',
    'Return propose_write if the request asks for code changes, file edits, tests that may modify state, scaffolding, setup changes, or any action that should be approved first.',
    'When returning propose_write, your assistant_text MUST be a clear spoken explanation of what you plan to change.',
    'Describe which files will be modified, what the changes are, and why — as if you are explaining to a colleague in person.',
    'End your explanation by asking the developer to review the diff and approve it before you proceed.',
    '',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `Latest user message:\n${userText}`
  ]
    .filter(Boolean)
    .join('\n');
}

function buildWriteExecutionPrompt(approval: PendingApproval, history: ChatMessage[], workspace: WorkspaceState) {
  const conversation = buildConversation(history);

  return [
    systemPrompt,
    '',
    `Execute the approved write task inside this project root only: ${approval.projectRoot}`,
    `Project name: ${workspace.projectName ?? path.basename(approval.projectRoot)}`,
    `Do not read or modify secret-like files. Blocked patterns: ${workspace.secretPolicy.join(', ')}.`,
    'Make the requested code changes now.',
    'After making changes, respond with a concise summary of what changed, any tests run, and any follow-up risk.',
    '',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `Approved task title:\n${approval.title}`,
    '',
    `Approved task summary:\n${approval.summary}`,
    '',
    `Concrete tasks:\n${approval.tasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}`,
    '',
    `Original user request:\n${approval.userRequest}`
  ]
    .filter(Boolean)
    .join('\n');
}

async function runCodexCommand(args: string[], cwd: string) {
  return execFileAsync(getCodexCommand(), args, {
    cwd,
    env: process.env,
    timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024 * 12
  });
}

async function runCodexPrompt(options: {
  cwd: string;
  sandbox: 'read-only' | 'workspace-write';
  prompt: string;
  outputSchema?: unknown;
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-codex-'));
  const outputFile = path.join(tempDir, 'last-message.txt');
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    options.sandbox,
    '--color',
    'never',
    '-C',
    options.cwd,
    '--output-last-message',
    outputFile
  ];

  const executionSettings = codexSettingsService ? await codexSettingsService.getExecutionOverrides() : null;
  if (executionSettings?.model) {
    args.push('-c', `model=${executionSettings.model}`);
  }

  if (executionSettings?.reasoningEffort) {
    args.push('-c', `model_reasoning_effort=${executionSettings.reasoningEffort}`);
  }

  let schemaFile: string | null = null;
  if (options.outputSchema) {
    schemaFile = path.join(tempDir, 'schema.json');
    await fs.writeFile(schemaFile, JSON.stringify(options.outputSchema, null, 2), 'utf8');
    args.push('--output-schema', schemaFile);
  }

  args.push(options.prompt);

  try {
    await runCodexCommand(args, options.cwd);
    const raw = (await fs.readFile(outputFile, 'utf8')).trim();
    if (!raw) {
      throw new Error('Codex returned an empty response.');
    }
    return raw;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function getExecutionOverrides() {
  return codexSettingsService?.getExecutionOverrides() ?? Promise.resolve(null);
}

function createAbortError() {
  const error = new Error('Codex stream aborted.');
  error.name = 'AbortError';
  return error;
}

async function runCodexPromptStream(options: {
  cwd: string;
  prompt: string;
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
}) {
  const executionSettings = await getExecutionOverrides();

  return new Promise<string>((resolve, reject) => {
    const args = ['app-server', '--listen', 'stdio://'];
    const child = spawn(getCodexCommand(), args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;
    let requestId = 0;
    let threadId: string | null = null;
    let finalText = '';
    let latestText = '';
    let abortListener: (() => void) | null = null;

    const cleanup = () => {
      if (abortListener && options.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.removeAllListeners();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const resolveOnce = (value: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const send = (message: Record<string, unknown>) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    };

    const startTurn = (nextThreadId: string) => {
      const params: Record<string, unknown> = {
        threadId: nextThreadId,
        input: [
          {
            type: 'text',
            text: options.prompt,
            text_elements: []
          }
        ],
        cwd: options.cwd,
        approvalPolicy: 'never',
        sandboxPolicy: {
          type: 'readOnly',
          access: { type: 'fullAccess' },
          networkAccess: false
        }
      };

      if (executionSettings?.model) {
        params.model = executionSettings.model;
      }

      if (executionSettings?.reasoningEffort) {
        params.effort = executionSettings.reasoningEffort;
      }

      send({
        id: ++requestId,
        method: 'turn/start',
        params
      });
    };

    const handleLine = (line: string) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      if (typeof message.id === 'number' && 'error' in message) {
        const errorBody = message.error;
        const errorMessage =
          errorBody && typeof errorBody === 'object' && 'message' in errorBody
            ? String((errorBody as { message?: unknown }).message ?? 'Codex stream failed.')
            : 'Codex stream failed.';
        rejectOnce(new Error(errorMessage));
        child.kill('SIGTERM');
        return;
      }

      if (message.id === 1 && 'result' in message) {
        send({ method: 'initialized' });

        const params: Record<string, unknown> = {
          cwd: options.cwd,
          approvalPolicy: 'never',
          sandbox: 'read-only',
          experimentalRawEvents: false,
          persistExtendedHistory: false
        };

        if (executionSettings?.model) {
          params.model = executionSettings.model;
        }

        send({
          id: ++requestId,
          method: 'thread/start',
          params
        });
        return;
      }

      if (message.id === 2 && 'result' in message) {
        const result = message.result;
        if (!result || typeof result !== 'object') {
          rejectOnce(new Error('Codex app-server did not return a thread.'));
          child.kill('SIGTERM');
          return;
        }

        const resultThreadId =
          (result as { thread?: { id?: string } }).thread?.id?.trim?.() ?? '';
        if (!resultThreadId) {
          rejectOnce(new Error('Codex app-server returned an invalid thread id.'));
          child.kill('SIGTERM');
          return;
        }

        threadId = resultThreadId;
        startTurn(resultThreadId);
        return;
      }

      if (message.method === 'item/agentMessage/delta') {
        const params = message.params as { threadId?: string; delta?: string } | undefined;
        if (!params || params.threadId !== threadId || typeof params.delta !== 'string') {
          return;
        }

        latestText += params.delta;
        options.onTextSnapshot?.(latestText);
        return;
      }

      if (message.method === 'item/completed') {
        const params = message.params as { item?: { type?: string; text?: string } } | undefined;
        if (params?.item?.type === 'agentMessage' && typeof params.item.text === 'string') {
          finalText = params.item.text;
          if (finalText !== latestText) {
            latestText = finalText;
            options.onTextSnapshot?.(latestText);
          }
        }
        return;
      }

      if (message.method === 'turn/completed') {
        child.kill('SIGTERM');
        const result = (finalText || latestText).trim();
        if (!result) {
          rejectOnce(new Error('Codex completed the turn but returned no text.'));
        } else {
          resolveOnce(result);
        }
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      while (true) {
        const newlineIndex = stdoutBuffer.indexOf('\n');
        if (newlineIndex < 0) {
          break;
        }
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }
        handleLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk;
    });

    child.once('error', (error) => {
      rejectOnce(error);
    });

    child.once('exit', (code, signal) => {
      if (settled) {
        return;
      }

      if (options.signal?.aborted) {
        rejectOnce(createAbortError());
        return;
      }

      const stderrText = stderrBuffer.trim();
      rejectOnce(
        new Error(
          stderrText ||
            `Codex app-server exited before completing the reply (${code ?? signal ?? 'unknown'}).`
        )
      );
    });

    if (options.signal) {
      abortListener = () => {
        try { child.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 3000).unref();
        rejectOnce(createAbortError());
      };

      if (options.signal.aborted) {
        abortListener();
        return;
      }

      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    send({
      id: ++requestId,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'voice-codex-api',
          title: 'Voice Codex API',
          version: '0.1.0'
        },
        capabilities: {
          experimentalApi: true
        }
      }
    });
  });
}

async function assertCodexReady() {
  const codexStatus = await getCodexStatus();
  if (!codexStatus.installed) {
    throw new CodexClientError(
      'service',
      'Codex CLI is not installed on this machine.',
      'Codex is not installed on this machine. Install it first to continue.'
    );
  }

  if (!codexStatus.loggedIn) {
    throw new CodexClientError(
      'auth',
      'Codex CLI is not logged in.',
      'Your Codex session needs reconnecting. Run the login command to continue.'
    );
  }
}

export async function getCodexStatus() {
  try {
    const { stdout, stderr } = await execFileAsync(getCodexCommand(), ['login', 'status'], {
      cwd: getRootDir(),
      env: process.env,
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });

    const statusText = normalizeStatusText([stdout, stderr].filter(Boolean).join('\n'));
    const loggedIn = /logged in/i.test(statusText);
    const authModeMatch = statusText.match(/Logged in using (.+)$/i);

    return {
      installed: true,
      loggedIn,
      authMode: authModeMatch?.[1]?.trim() ?? (loggedIn ? 'Configured' : null),
      statusText
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to determine Codex login status.';

    return {
      installed: !/ENOENT/.test(message),
      loggedIn: false,
      authMode: null,
      statusText: message
    };
  }
}

export async function logoutCodex() {
  await runCodexCommand(['logout'], getRootDir());
}

export async function generateAssistantReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertCodexReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const startedAt = Date.now();
  const text = await runCodexPrompt({
    cwd,
    sandbox: 'read-only',
    prompt: buildReadOnlyPrompt(userText, history, workspace)
  });
  logger.info('codex.prompt.completed', {
    operation: 'generate_reply',
    sandbox: 'read-only',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: text.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return { text };
}

export async function streamAssistantReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: StreamReplyOptions
) {
  await assertCodexReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const startedAt = Date.now();
  let text: string;
  try {
    text = await runCodexPromptStream({
      cwd,
      prompt: buildReadOnlyPrompt(userText, history, workspace),
      signal: options?.signal,
      onTextSnapshot: options?.onTextSnapshot
    });
  } catch (error) {
    const classified = error instanceof CodexClientError ? error : classifyCodexError(error);
    logger.error('codex.stream.failed', {
      operation: 'stream_reply',
      errorKind: classified.kind,
      durationMs: Date.now() - startedAt,
      projectName: path.basename(cwd),
      error: classified.message,
      ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
    });
    throw classified;
  }

  logger.info('codex.prompt.completed', {
    operation: 'stream_reply',
    sandbox: 'read-only',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: text.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return { text };
}

export async function decideWriteIntent(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertCodexReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const startedAt = Date.now();
  const schema = {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['reply', 'propose_write']
      },
      assistant_text: {
        type: 'string'
      },
      proposal_title: {
        type: 'string'
      },
      proposal_summary: {
        type: 'string'
      },
      tasks: {
        type: 'array',
        items: {
          type: 'string'
        }
      },
      agents: {
        type: 'array',
        items: {
          type: 'string'
        }
      }
    },
    required: ['intent', 'assistant_text', 'proposal_title', 'proposal_summary', 'tasks', 'agents'],
    additionalProperties: false
  };

  const raw = await runCodexPrompt({
    cwd,
    sandbox: 'read-only',
    prompt: buildWriteDecisionPrompt(userText, history, workspace),
    outputSchema: schema
  });
  logger.info('codex.prompt.completed', {
    operation: 'decide_write_intent',
    sandbox: 'read-only',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: raw.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return JSON.parse(raw) as WriteDecision;
}

async function readGitStatus(projectRoot: string) {
  const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'status', '--porcelain'], {
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 4
  });

  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

async function buildUntrackedFileDiff(projectRoot: string, filePath: string) {
  try {
    const absoluteFile = path.join(projectRoot, filePath);
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--no-index', '--', '/dev/null', absoluteFile],
      {
        cwd: projectRoot,
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 4
      }
    );

    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message) {
      const anyError = error as { stdout?: string };
      return anyError.stdout ?? '';
    }
    return '';
  }
}

export async function collectGitDiff(projectRoot: string): Promise<DiffSummary> {
  try {
    await execFileAsync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], {
      timeout: 20000,
      maxBuffer: 1024 * 1024
    });
  } catch {
    return {
      isGitRepo: false,
      changedFiles: [],
      files: []
    };
  }

  const statusLines = await readGitStatus(projectRoot);
  const changedFiles = statusLines
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  const files: DiffSummary['files'] = [];

  for (const line of statusLines) {
    const statusCode = line.slice(0, 2);
    const filePath = line.slice(3).trim();

    if (!filePath) {
      continue;
    }

    if (statusCode === '??') {
      const diff = await buildUntrackedFileDiff(projectRoot, filePath);
      files.push({
        filePath,
        diff
      });
      continue;
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', projectRoot, 'diff', '--no-ext-diff', '--', filePath],
        {
          timeout: 20000,
          maxBuffer: 1024 * 1024 * 4
        }
      );

      files.push({
        filePath,
        diff: stdout
      });
    } catch {
      files.push({
        filePath,
        diff: ''
      });
    }
  }

  return {
    isGitRepo: true,
    changedFiles,
    files
  };
}

export async function executeApprovedWrite(
  approval: PendingApproval,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertCodexReady();
  const startedAt = Date.now();
  const text = await runCodexPrompt({
    cwd: approval.projectRoot,
    sandbox: 'workspace-write',
    prompt: buildWriteExecutionPrompt(approval, history, workspace)
  });
  logger.info('codex.prompt.completed', {
    operation: 'execute_approved_write',
    sandbox: 'workspace-write',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(approval.projectRoot),
    taskCount: approval.tasks.length,
    responseLength: text.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return { text };
}
