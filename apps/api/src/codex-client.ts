import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ChatMessage, DiffSummary, PendingApproval, WorkspaceState } from './types.js';
import { getRootDir } from './store.js';

const execFileAsync = promisify(execFile);

interface WriteDecision {
  intent: 'reply' | 'propose_write';
  assistant_text: string;
  proposal_title: string;
  proposal_summary: string;
  tasks: string[];
  agents: string[];
}

const systemPrompt = [
  'You are Codex Voice Buddy, a sharp coding assistant.',
  'Respond as if you are speaking to one engineer live.',
  'Be concise, practical, and technically strong.',
  'Prefer short explanations, direct recommendations, and code-minded reasoning.',
  'When the user asks for implementation advice, answer like a senior engineer.'
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

  const model = process.env.CODEX_MODEL?.trim();
  if (model) {
    args.push('--model', model);
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

async function assertCodexReady() {
  const codexStatus = await getCodexStatus();
  if (!codexStatus.installed) {
    throw new Error('Codex CLI is not installed on this machine.');
  }

  if (!codexStatus.loggedIn) {
    throw new Error('Codex CLI is not logged in. Run `codex login --device-auth` and sign in.');
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
  workspace: WorkspaceState
) {
  await assertCodexReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const text = await runCodexPrompt({
    cwd,
    sandbox: 'read-only',
    prompt: buildReadOnlyPrompt(userText, history, workspace)
  });

  return { text };
}

export async function decideWriteIntent(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  await assertCodexReady();
  const cwd = workspace.projectRoot ?? getRootDir();
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
  workspace: WorkspaceState
) {
  await assertCodexReady();
  const text = await runCodexPrompt({
    cwd: approval.projectRoot,
    sandbox: 'workspace-write',
    prompt: buildWriteExecutionPrompt(approval, history, workspace)
  });

  return { text };
}
