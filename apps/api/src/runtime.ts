import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from './config/env.js';
import { isSecretRelativePath } from './lib/path-security.js';
import type {
  AssistantProviderId,
  AudioBridgeState,
  DiffSummary,
  PendingApproval,
  RuntimeState,
  VoiceSessionPhase,
  WorkspaceState
} from './types.js';

const execFileAsync = promisify(execFile);

const secretPolicy = [
  '.env',
  '.env.local',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'id_rsa',
  'id_ed25519',
  '.aws/',
  '.npmrc',
  '.docker/config.json',
  'secrets/',
  'credentials/'
];

const runtimeState: RuntimeState = {
  activeProviderId: null,
  workspace: {
    id: null,
    projectRoot: null,
    projectName: null,
    isGitRepo: false,
    writeAccessEnabled: false,
    secretPolicy
  },
  pendingApproval: null,
  lastDiff: null,
  audio: {
    platform: process.platform,
    available: process.platform === 'darwin',
    inputDeviceLabel: null,
    outputDeviceLabel: null,
    transcriptionEngine: process.platform === 'darwin' ? 'Desktop media capture + STT provider' : 'Unavailable',
    speechEngine: 'TTS Provider / Browser Fallback',
    lastCheckedAt: null,
    error: process.platform === 'darwin' ? null : 'Desktop voice capture currently supports macOS only.'
  },
  voiceSession: {
    active: false,
    phase: 'idle',
    liveTranscript: '',
    lastTranscript: null,
    silenceWindowMs: 800,
    transport: process.platform === 'darwin' ? 'desktop-media' : 'unsupported',
    error: null
  }
};

function getProjectName(projectRoot: string) {
  return path.basename(projectRoot);
}

async function detectGitRepo(projectRoot: string) {
  try {
    await execFileAsync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    });
    return true;
  } catch {
    return false;
  }
}

function getAllowedWorkspaceRoots() {
  const configuredRoots = env.allowedWorkspaceRoots.length > 0 ? env.allowedWorkspaceRoots : [process.env.HOME ?? ''];

  return configuredRoots
    .map((value) => path.resolve(value))
    .filter(Boolean);
}

function isPathWithinAllowedRoots(resolvedPath: string, allowedRoots: string[]) {
  return allowedRoots.some((allowedRoot) => {
    const relative = path.relative(allowedRoot, resolvedPath);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
  });
}

export async function validateProjectRoot(inputPath: string) {
  const resolved = path.resolve(inputPath.trim());
  if (!path.isAbsolute(resolved)) {
    throw new Error('Project path must resolve to an absolute directory.');
  }

  if (resolved === '/' || resolved === path.resolve(process.env.HOME ?? '/')) {
    throw new Error('Select a specific project directory, not your filesystem root or home directory.');
  }

  const realProjectRoot = await fs.realpath(resolved);
  const allowedRoots = getAllowedWorkspaceRoots();
  if (!isPathWithinAllowedRoots(realProjectRoot, allowedRoots)) {
    throw new Error(
      `Selected project must stay within an approved workspace root: ${allowedRoots.join(', ')}.`
    );
  }

  const stats = await fs.stat(realProjectRoot);
  if (!stats.isDirectory()) {
    throw new Error('Selected project path is not a directory.');
  }

  const isGitRepo = await detectGitRepo(realProjectRoot);
  if (!isGitRepo) {
    throw new Error('Selected project must be a Git repository.');
  }

  return {
    projectRoot: realProjectRoot,
    projectName: getProjectName(realProjectRoot),
    isGitRepo
  };
}

export function getRuntimeState() {
  return runtimeState;
}

export function setActiveProviderId(activeProviderId: AssistantProviderId | null) {
  runtimeState.activeProviderId = activeProviderId;
  return runtimeState.activeProviderId;
}

export async function setProjectRoot(projectRoot: string) {
  const validated = await validateProjectRoot(projectRoot);
  setWorkspaceState(validated);
  runtimeState.pendingApproval = null;
  runtimeState.lastDiff = null;
  return runtimeState.workspace;
}

export function setWriteAccessEnabled(enabled: boolean) {
  runtimeState.workspace.writeAccessEnabled = enabled;
  if (!enabled) {
    runtimeState.pendingApproval = null;
  }
  return runtimeState.workspace;
}

export function setWorkspaceState(nextState: Partial<Omit<WorkspaceState, 'secretPolicy'>>) {
  runtimeState.workspace = {
    ...runtimeState.workspace,
    ...nextState
  };

  return runtimeState.workspace;
}

export function clearPendingApproval() {
  runtimeState.pendingApproval = null;
}

export function createPendingApproval(input: Omit<PendingApproval, 'id' | 'createdAt'>) {
  const approval: PendingApproval = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input
  };
  runtimeState.pendingApproval = approval;
  return approval;
}

export function getPendingApproval() {
  return runtimeState.pendingApproval;
}

export function setLastDiff(diff: DiffSummary | null) {
  runtimeState.lastDiff = diff;
  return runtimeState.lastDiff;
}

export function setAudioState(nextState: Partial<AudioBridgeState>) {
  runtimeState.audio = {
    ...runtimeState.audio,
    ...nextState,
    lastCheckedAt: new Date().toISOString()
  };
  return runtimeState.audio;
}

export function setVoiceSessionState(nextState: Partial<RuntimeState['voiceSession']>) {
  runtimeState.voiceSession = {
    ...runtimeState.voiceSession,
    ...nextState
  };
  return runtimeState.voiceSession;
}

export function resetVoiceSessionState(phase: VoiceSessionPhase = 'idle') {
  runtimeState.voiceSession = {
    ...runtimeState.voiceSession,
    active: false,
    phase,
    liveTranscript: '',
    error: phase === 'error' ? runtimeState.voiceSession.error : null
  };
  return runtimeState.voiceSession;
}

export function getWorkspaceState(): WorkspaceState {
  return runtimeState.workspace;
}

export function shouldProtectWorkspacePath(relativePath: string) {
  return isSecretRelativePath(relativePath);
}
