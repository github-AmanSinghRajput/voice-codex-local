import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import type { ChatMessage, PendingApproval, WorkspaceState } from './types.js';
import type { ClaudeSettingsService } from './features/claude/claude-settings.service.js';
import { logger } from './lib/logger.js';
import { getRootDir } from './store.js';

let claudeSettingsService: ClaudeSettingsService | null = null;

export function initClaudeClient(settings: ClaudeSettingsService) {
  claudeSettingsService = settings;
}

type ClaudeErrorKind = 'auth' | 'rate_limit' | 'service' | 'unknown';

export class ClaudeClientError extends Error {
  readonly kind: ClaudeErrorKind;
  readonly friendlyMessage: string;

  constructor(kind: ClaudeErrorKind, message: string, friendlyMessage: string) {
    super(message);
    this.name = 'ClaudeClientError';
    this.kind = kind;
    this.friendlyMessage = friendlyMessage;
  }
}

interface StreamReplyOptions {
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
  onActivityUpdate?: (activity: string) => void;
}

function execClaudeCommand(args: string[], cwd: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(
      getClaudeCommand(),
      args,
      {
        cwd,
        env: process.env,
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 12
      },
      (error, stdout, stderr) => {
        if (error) {
          const nextError = error as Error & { stdout?: string; stderr?: string };
          nextError.stdout = typeof stdout === 'string' ? stdout : String(stdout ?? '');
          nextError.stderr = typeof stderr === 'string' ? stderr : String(stderr ?? '');
          reject(nextError);
          return;
        }

        resolve({
          stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
          stderr: typeof stderr === 'string' ? stderr : String(stderr ?? '')
        });
      }
    );

    child.stdin?.end();
  });
}

function execClaudeCommandWithStdin(args: string[], cwd: string, stdinData: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(
      getClaudeCommand(),
      args,
      {
        cwd,
        env: process.env,
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 12
      },
      (error, stdout, stderr) => {
        if (error) {
          const nextError = error as Error & { stdout?: string; stderr?: string };
          nextError.stdout = typeof stdout === 'string' ? stdout : String(stdout ?? '');
          nextError.stderr = typeof stderr === 'string' ? stderr : String(stderr ?? '');
          reject(nextError);
          return;
        }

        resolve({
          stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
          stderr: typeof stderr === 'string' ? stderr : String(stderr ?? '')
        });
      }
    );

    if (child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

function getClaudeCommand() {
  return process.env.CLAUDE_COMMAND ?? 'claude';
}

async function getExecutionOverrides() {
  return claudeSettingsService?.getExecutionOverrides() ?? Promise.resolve({ model: null });
}

function normalizeStatusText(output: string) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractAccountLabelFromObject(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directCandidates = [
    record.email,
    record.account,
    record.username,
    record.user,
    record.displayName,
    record.name
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const nestedCandidates = [record.account, record.user, record.session];
  for (const nested of nestedCandidates) {
    const nestedLabel = extractAccountLabelFromObject(nested);
    if (nestedLabel) {
      return nestedLabel;
    }
  }

  return null;
}

function extractAccountLabel(statusText: string, parsed: unknown) {
  const structured = extractAccountLabelFromObject(parsed);
  if (structured) {
    return structured;
  }

  const emailMatch = statusText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch?.[0]) {
    return emailMatch[0];
  }

  const explicitLabelPatterns = [
    /logged in as[:\s]+(.+)$/im,
    /account[:\s]+(.+)$/im,
    /user[:\s]+(.+)$/im
  ];

  for (const pattern of explicitLabelPatterns) {
    const match = statusText.match(pattern);
    const label = match?.[1]?.trim();
    if (label) {
      return label;
    }
  }

  return null;
}

function classifyClaudeError(error: unknown) {
  const message = extractClaudeErrorMessage(error);
  const lower = message.toLowerCase();

  if (/you'?ve hit your limit|usage limit|resets\s+\d/i.test(lower)) {
    return new ClaudeClientError(
      'rate_limit',
      message,
      message
    );
  }

  if (/not logged in|login|auth|unauthorized|forbidden|session expired/i.test(lower)) {
    return new ClaudeClientError(
      'auth',
      message,
      'Your Claude Code session needs reconnecting. Run the login command to continue.'
    );
  }

  if (/rate.?limit|too many requests|quota|throttl/i.test(lower)) {
    return new ClaudeClientError(
      'rate_limit',
      message,
      'Claude Code is rate limited right now. Give it a moment and try again.'
    );
  }

  if (/timeout|timed out|econnrefused|econnreset|enotfound|network|socket/i.test(lower)) {
    return new ClaudeClientError(
      'service',
      message,
      'Claude Code is not responding right now. Check your connection and try again.'
    );
  }

  return new ClaudeClientError(
    'unknown',
    message,
    'Something went wrong with Claude Code. Try again or check the logs.'
  );
}

function extractClaudeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const detailCandidates = [
    (error as { stderr?: unknown }).stderr,
    (error as { stdout?: unknown }).stdout,
    error.message
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeStatusText(value))
    .filter(Boolean);

  for (const candidate of detailCandidates) {
    const lines = candidate
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('Warning: no stdin data received in 3s'));

    const limitLineIndex = lines.findIndex((line) => /you'?ve hit your limit/i.test(line));
    if (limitLineIndex >= 0) {
      return lines.slice(limitLineIndex, limitLineIndex + 2).join(' ').trim();
    }

    const usefulLine = lines.find(
      (line) => !line.startsWith('Command failed:') && !line.startsWith('Error:')
    );
    if (usefulLine) {
      return usefulLine;
    }
  }

  return error.message;
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

const systemPrompt = [
  'You are VOCOD Voice Buddy, a sharp coding assistant.',
  'Respond as if you are speaking to one engineer live.',
  'Be concise, practical, and technically strong.',
  'Prefer short explanations, direct recommendations, and code-minded reasoning.',
  'When the user asks for implementation advice, answer like a senior engineer.',
  'When you are about to propose code changes, first explain clearly what you plan to change and why.',
  'Describe the changes in plain spoken English — which files, what modifications, and the reasoning.',
  'Your explanation will be spoken aloud to the developer, so keep it natural and conversational.',
  'After proposing changes that require approval, tell the developer to review the diff and approve or reject.'
].join(' ');

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

async function assertClaudeReady() {
  const status = await getClaudeStatus();
  if (!status.installed) {
    throw new ClaudeClientError(
      'service',
      'Claude Code CLI is not installed on this machine.',
      'Claude Code is not installed on this machine. Install it first to continue.'
    );
  }

  if (!status.loggedIn) {
    throw new ClaudeClientError(
      'auth',
      'Claude Code CLI is not logged in.',
      'Your Claude Code session needs reconnecting. Run the login command to continue.'
    );
  }
}

export async function getClaudeStatus() {
  try {
    const { stdout, stderr } = await execClaudeCommand(['auth', 'status'], getRootDir());
    const raw = [stdout, stderr].filter(Boolean).join('\n');
    const normalized = normalizeStatusText(raw);
    const parsed = tryParseJson(normalized);
    const authMode =
      parsed && typeof parsed === 'object' && 'authType' in parsed
        ? String((parsed as { authType?: unknown }).authType ?? '')
        : null;

    const loggedIn = !/not authenticated|not logged in|no account/i.test(normalized);
    return {
      installed: true,
      loggedIn,
      accountLabel: loggedIn ? extractAccountLabel(normalized, parsed) : null,
      authMode: loggedIn ? (authMode || 'configured') : null,
      statusText: loggedIn ? (normalized || 'Claude Code connected.') : 'Claude Code is installed but not logged in.'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to determine Claude Code login status.';
    if (/ENOENT/.test(message)) {
      return {
        installed: false,
        loggedIn: false,
        accountLabel: null,
        authMode: null,
        statusText: 'Claude Code CLI is not installed on this machine.'
      };
    }

    const isAuthFailure = /not logged in|not authenticated|unauthorized|auth/i.test(message);
    return {
      installed: !/ENOENT|EACCES|permission denied/i.test(message),
      loggedIn: false,
      accountLabel: null,
      authMode: null,
      statusText: isAuthFailure ? 'Ready to connect Claude Code.' : message
    };
  }
}

export async function logoutClaude() {
  await execClaudeCommand(['auth', 'logout'], getRootDir());
}

export async function generateClaudeReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  await assertClaudeReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const startedAt = Date.now();
  const text = await runClaudePrompt({
    cwd,
    prompt: buildReadOnlyPrompt(userText, history, workspace),
    allowedTools: 'Read'
  });

  logger.info('claude.prompt.completed', {
    operation: 'generate_reply',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: text.length
  });

  return { text };
}

export async function streamClaudeReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: StreamReplyOptions
) {
  await assertClaudeReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const startedAt = Date.now();
  const prompt = buildReadOnlyPrompt(userText, history, workspace);

  try {
    const text = await runClaudePromptStream({
      cwd,
      prompt,
      allowedTools: 'Read',
      signal: options?.signal,
      onTextSnapshot: options?.onTextSnapshot,
      onActivityUpdate: options?.onActivityUpdate
    });

    logger.info('claude.prompt.completed', {
      operation: 'stream_reply',
      durationMs: Date.now() - startedAt,
      projectName: path.basename(cwd),
      promptLength: userText.length,
      responseLength: text.length
    });

    return { text };
  } catch (error) {
    logger.error('claude.stream.failed', {
      operation: 'stream_reply',
      durationMs: Date.now() - startedAt,
      projectName: path.basename(cwd),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function runClaudePromptStream(options: {
  cwd: string;
  prompt: string;
  allowedTools: string;
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
  onActivityUpdate?: (activity: string) => void;
}) {
  return new Promise<string>((resolve, reject) => {
    const baseArgs = [
      '--print',
      '-',
      '--output-format',
      'stream-json',
      '--verbose',
      '--allowedTools',
      options.allowedTools
    ];

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;
    let latestText = '';
    let finalText = '';
    let emittedInitialActivity = false;
    let abortListener: (() => void) | null = null;
    let child: ReturnType<typeof spawn> | null = null;

    const cleanup = () => {
      if (abortListener && options.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
      child?.stdout?.removeAllListeners();
      child?.stderr?.removeAllListeners();
      child?.removeAllListeners();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const resolveOnce = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleLine = (line: string) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      if (message.type === 'assistant') {
        if (typeof message.error === 'string' && message.error) {
          rejectOnce(classifyClaudeError(new Error(message.error)));
          child?.kill('SIGTERM');
          return;
        }

        if (!emittedInitialActivity) {
          emittedInitialActivity = true;
          options.onActivityUpdate?.('Thinking through the request');
        }

        const msg = message.message as { content?: Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }> } | undefined;
        if (msg?.content) {
          for (const block of msg.content) {
            if (block.type === 'tool_use' && typeof block.name === 'string') {
              const activity = describeClaudeActivity(
                block.name,
                block.input ?? {},
                options.cwd
              );
              options.onActivityUpdate?.(activity);
            }
          }

          const textParts = msg.content
            .filter((c) => c.type === 'text' && typeof c.text === 'string')
            .map((c) => c.text ?? '');
          const combined = textParts.join('').trim();
          if (combined && combined !== latestText) {
            latestText = combined;
            options.onTextSnapshot?.(latestText);
          }
        }
        return;
      }

      if (message.type === 'result') {
        if (message.is_error === true) {
          const errorText = typeof message.result === 'string' ? message.result : 'Claude returned an error.';
          rejectOnce(classifyClaudeError(new Error(errorText)));
          child?.kill('SIGTERM');
          return;
        }
        const resultText = typeof message.result === 'string' ? message.result.trim() : '';
        finalText = resultText || latestText;
        if (finalText && finalText !== latestText) {
          options.onTextSnapshot?.(finalText);
        }
        child?.kill('SIGTERM');
        if (!finalText) {
          rejectOnce(new Error('Claude completed the turn but returned no text.'));
        } else {
          resolveOnce(finalText);
        }
        return;
      }
    };

    const attachChild = (nextChild: ReturnType<typeof spawn>) => {
      child = nextChild;

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        while (true) {
          const newlineIndex = stdoutBuffer.indexOf('\n');
          if (newlineIndex < 0) break;
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          if (line) handleLine(line);
        }
      });

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        stderrBuffer += chunk;
      });

      child.once('error', (error) => rejectOnce(error));

      child.once('exit', (code, signal) => {
        if (settled) return;
        if (options.signal?.aborted) {
          rejectOnce(new Error('Claude stream aborted.'));
          return;
        }

        const trailingLine = stdoutBuffer.trim();
        if (trailingLine) {
          handleLine(trailingLine);
        }

        if (settled) {
          return;
        }

        if (code === 0) {
          const text = (finalText || latestText).trim();
          if (text) {
            resolveOnce(text);
            return;
          }
        }

        const exitDetail =
          stderrBuffer.trim() ||
          `Claude exited before completing (${code ?? signal ?? 'unknown'}).`;
        rejectOnce(classifyClaudeError(new Error(exitDetail)));
      });

      if (options.signal) {
        abortListener = () => {
          try { child?.kill('SIGTERM'); } catch {}
          setTimeout(() => { try { child?.kill('SIGKILL'); } catch {} }, 3000).unref();
          rejectOnce(new Error('Claude stream aborted.'));
        };
        if (options.signal.aborted) {
          abortListener();
          return;
        }
        options.signal.addEventListener('abort', abortListener, { once: true });
      }

      nextChild.stdin?.write(options.prompt);
      nextChild.stdin?.end();
    };

    void getExecutionOverrides()
      .then((executionSettings) => {
        const args = [...baseArgs];
        if (executionSettings?.model) {
          args.push('--model', executionSettings.model);
        }

        attachChild(
          spawn(getClaudeCommand(), args, {
            cwd: options.cwd,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe']
          })
        );
      })
      .catch((error) => rejectOnce(classifyClaudeError(error)));
  });
}

export async function decideClaudeWriteIntent(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  await assertClaudeReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const startedAt = Date.now();
  const schema = {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['reply', 'propose_write'] },
      assistant_text: { type: 'string' },
      proposal_title: { type: 'string' },
      proposal_summary: { type: 'string' },
      tasks: { type: 'array', items: { type: 'string' } },
      agents: { type: 'array', items: { type: 'string' } }
    },
    required: ['intent', 'assistant_text', 'proposal_title', 'proposal_summary', 'tasks', 'agents'],
    additionalProperties: false
  };
  const raw = await runClaudePrompt({
    cwd,
    prompt: buildWriteDecisionPrompt(userText, history, workspace),
    allowedTools: 'Read',
    outputSchema: schema
  });

  logger.info('claude.prompt.completed', {
    operation: 'decide_write_intent',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: raw.length
  });

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    intent: parsed.intent === 'propose_write' ? 'propose_write' as const : 'reply' as const,
    assistant_text: typeof parsed.assistant_text === 'string' ? parsed.assistant_text : '',
    proposal_title: typeof parsed.proposal_title === 'string' ? parsed.proposal_title : '',
    proposal_summary: typeof parsed.proposal_summary === 'string' ? parsed.proposal_summary : '',
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter((t): t is string => typeof t === 'string') : [],
    agents: Array.isArray(parsed.agents) ? parsed.agents.filter((a): a is string => typeof a === 'string') : []
  };
}

export async function executeClaudeApprovedWrite(
  approval: PendingApproval,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  await assertClaudeReady();
  const startedAt = Date.now();
  const text = await runClaudePrompt({
    cwd: approval.projectRoot,
    prompt: buildWriteExecutionPrompt(approval, history, workspace),
    allowedTools: 'Read,Edit,Bash'
  });

  logger.info('claude.prompt.completed', {
    operation: 'execute_approved_write',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(approval.projectRoot),
    taskCount: approval.tasks?.length ?? 0,
    responseLength: text.length
  });

  return { text };
}

async function runClaudePrompt(options: {
  cwd: string;
  prompt: string;
  allowedTools: string;
  outputSchema?: unknown;
}) {
  const args = [
    '--print',
    '-',
    '--allowedTools',
    options.allowedTools,
    '--output-format',
    'json'
  ];

  if (options.outputSchema) {
    args.push('--json-schema', JSON.stringify(options.outputSchema));
  }

  try {
    const executionSettings = await getExecutionOverrides();
    if (executionSettings?.model) {
      args.push('--model', executionSettings.model);
    }
    const { stdout } = await execClaudeCommandWithStdin(args, options.cwd, options.prompt);
    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error('Claude Code returned an empty response.');
    }

    if (options.outputSchema) {
      return JSON.stringify(extractClaudeJsonPayload(trimmed));
    }

    return extractClaudeText(trimmed);
  } catch (error) {
    throw classifyClaudeError(error);
  }
}

function extractClaudeText(raw: string) {
  const parsed = tryParseJson(raw);
  if (!parsed) {
    return raw.trim();
  }

  if (typeof parsed === 'string') {
    return parsed.trim();
  }

  const fromObject = getObjectText(parsed);
  if (fromObject) {
    return fromObject;
  }

  return raw.trim();
}

function extractClaudeJsonPayload(raw: string) {
  const parsed = tryParseJson(raw);
  if (parsed && typeof parsed === 'object') {
    if ('result' in parsed && typeof parsed.result === 'object' && parsed.result) {
      return parsed.result;
    }
    return parsed;
  }

  throw new Error('Claude Code did not return structured JSON output.');
}

function getObjectText(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const directTextKeys = ['result', 'text', 'message', 'content'];
  for (const key of directTextKeys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (Array.isArray((value as Record<string, unknown>).content)) {
    const text = ((value as Record<string, unknown>).content as unknown[])
      .map((item) => getObjectText(item))
      .filter((item): item is string => Boolean(item))
      .join(' ')
      .trim();

    if (text) {
      return text;
    }
  }

  if ('result' in value) {
    return getObjectText((value as Record<string, unknown>).result);
  }

  if ('message' in value && typeof (value as Record<string, unknown>).message === 'object') {
    return getObjectText((value as Record<string, unknown>).message);
  }

  if ('delta' in value && typeof (value as Record<string, unknown>).delta === 'object') {
    return getObjectText((value as Record<string, unknown>).delta);
  }

  return null;
}

export function describeClaudeActivity(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string
): string {
  switch (toolName) {
    case 'Read': {
      const filePath = typeof input.file_path === 'string' ? input.file_path : '';
      return `Reading ${displayClaudePath(filePath, cwd)}`;
    }
    case 'Edit': {
      const filePath = typeof input.file_path === 'string' ? input.file_path : '';
      return `Editing ${displayClaudePath(filePath, cwd)}`;
    }
    case 'Write': {
      const filePath = typeof input.file_path === 'string' ? input.file_path : '';
      return `Writing ${displayClaudePath(filePath, cwd)}`;
    }
    case 'Bash': {
      const command = typeof input.command === 'string' ? input.command.trim() : '';
      if (!command) {
        return 'Running a command';
      }
      const summary = command.split(/\s+/).slice(0, 3).join(' ');
      return `Running ${summary}`;
    }
    case 'Glob': {
      const pattern = typeof input.pattern === 'string' ? input.pattern.trim() : '';
      return pattern ? `Scanning for ${pattern}` : 'Scanning for files';
    }
    case 'Grep': {
      const pattern = typeof input.pattern === 'string' ? input.pattern.trim() : '';
      return pattern ? `Searching for ${pattern}` : 'Searching for related code';
    }
    case 'WebSearch': {
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      return query ? `Searching the web for ${query}` : 'Searching the web';
    }
    case 'WebFetch': {
      const url = typeof input.url === 'string' ? input.url.trim() : '';
      try {
        const hostname = new URL(url).hostname;
        return `Fetching ${hostname}`;
      } catch {
        return 'Fetching a web resource';
      }
    }
    case 'Agent':
      return 'Delegating to sub-agent';
    default:
      return `Using ${toolName}`;
  }
}

function displayClaudePath(targetPath: string, cwd: string) {
  const trimmed = targetPath.trim();
  if (!trimmed) {
    return 'the workspace';
  }

  if (!path.isAbsolute(trimmed)) {
    return trimmed;
  }

  const relativePath = path.relative(cwd, trimmed);
  if (!relativePath || relativePath.startsWith('..')) {
    return 'a file outside the project';
  }

  return relativePath;
}

function tryParseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
