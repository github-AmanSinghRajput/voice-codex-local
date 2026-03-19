import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
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
  workspace: {
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
    outputDeviceLabel: 'System Default Output',
    transcriptionEngine: process.platform === 'darwin' ? 'Apple Speech Framework' : 'Unavailable',
    speechEngine: process.platform === 'darwin' ? 'macOS say' : 'Unavailable',
    lastCheckedAt: null,
    error: process.platform === 'darwin' ? null : 'Native audio bridge currently supports macOS only.'
  },
  voiceSession: {
    active: false,
    phase: 'idle',
    liveTranscript: '',
    lastTranscript: null,
    silenceWindowMs: 2000,
    transport: process.platform === 'darwin' ? 'native-macos' : 'unsupported',
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

export async function validateProjectRoot(inputPath: string) {
  const resolved = path.resolve(inputPath.trim());
  if (!path.isAbsolute(resolved)) {
    throw new Error('Project path must resolve to an absolute directory.');
  }

  if (resolved === '/' || resolved === path.resolve(process.env.HOME ?? '/')) {
    throw new Error('Select a specific project directory, not your filesystem root or home directory.');
  }

  const stats = await fs.stat(resolved);
  if (!stats.isDirectory()) {
    throw new Error('Selected project path is not a directory.');
  }

  return {
    projectRoot: resolved,
    projectName: getProjectName(resolved),
    isGitRepo: await detectGitRepo(resolved)
  };
}

export function getRuntimeState() {
  return runtimeState;
}

export async function setProjectRoot(projectRoot: string) {
  const validated = await validateProjectRoot(projectRoot);
  runtimeState.workspace.projectRoot = validated.projectRoot;
  runtimeState.workspace.projectName = validated.projectName;
  runtimeState.workspace.isGitRepo = validated.isGitRepo;
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
