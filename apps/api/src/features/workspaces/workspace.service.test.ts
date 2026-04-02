import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeState, WorkspaceState } from '../../types.js';
import { WorkspaceService } from './workspace.service.js';

function createWorkspaceRuntime(initialWorkspace?: Partial<WorkspaceState>) {
  const runtime: RuntimeState = {
    activeProviderId: 'codex',
    workspace: {
      id: null,
      projectRoot: null,
      projectName: null,
      isGitRepo: false,
      writeAccessEnabled: false,
      secretPolicy: [],
      ...initialWorkspace
    },
    pendingApproval: null,
    lastDiff: null,
    audio: {
      platform: 'darwin',
      available: true,
      inputDeviceLabel: null,
      outputDeviceLabel: null,
      transcriptionEngine: 'test',
      speechEngine: 'test',
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
    }
  };

  return {
    getRuntimeState: () => runtime,
    setProjectRoot: async (projectRoot: string) => {
      runtime.workspace = {
        ...runtime.workspace,
        projectRoot,
        projectName: 'voice-codex-local',
        isGitRepo: true
      };
      return runtime.workspace;
    },
    setWorkspaceState: (nextState: Partial<Omit<WorkspaceState, 'secretPolicy'>>) => {
      runtime.workspace = {
        ...runtime.workspace,
        ...nextState
      };
      return runtime.workspace;
    },
    setWriteAccessEnabled: (enabled: boolean) => {
      runtime.workspace.writeAccessEnabled = enabled;
      return runtime.workspace;
    },
    validateProjectRoot: async (rootPath: string) => ({
      projectRoot: rootPath,
      projectName: 'restored-project',
      isGitRepo: true
    })
  };
}

class WorkspaceRepositoryStub {
  latestWorkspace:
    | {
        id: string;
        root_path: string;
        write_access_enabled: boolean;
      }
    | null = null;

  upsertCalls: Array<{
    name: string;
    rootPath: string;
    writeAccessEnabled: boolean;
  }> = [];

  async findLatestWorkspace() {
    return this.latestWorkspace;
  }

  async upsertWorkspace(input: { name: string; rootPath: string; writeAccessEnabled: boolean }) {
    this.upsertCalls.push(input);
    return {
      id: `workspace-${this.upsertCalls.length}`,
      name: input.name,
      root_path: input.rootPath,
      write_access_enabled: input.writeAccessEnabled,
      updated_at: new Date()
    };
  }
}

test('WorkspaceService restores the latest persisted workspace on initialize', async () => {
  const repository = new WorkspaceRepositoryStub();
  repository.latestWorkspace = {
    id: 'workspace-1',
    root_path: '/tmp/project',
    write_access_enabled: true
  };

  const runtime = createWorkspaceRuntime();
  const service = new WorkspaceService(repository as never, runtime as never);

  const workspace = await service.initialize();

  assert.equal(workspace.id, 'workspace-1');
  assert.equal(workspace.projectRoot, '/tmp/project');
  assert.equal(workspace.projectName, 'restored-project');
  assert.equal(workspace.writeAccessEnabled, true);
});

test('WorkspaceService persists selected project roots', async () => {
  const repository = new WorkspaceRepositoryStub();
  const runtime = createWorkspaceRuntime();
  const service = new WorkspaceService(repository as never, runtime as never);

  const workspace = await service.selectProjectRoot('/tmp/workspace-a');

  assert.equal(workspace.projectRoot, '/tmp/workspace-a');
  assert.equal(repository.upsertCalls.length, 1);
  assert.deepEqual(repository.upsertCalls[0], {
    name: 'voice-codex-local',
    rootPath: '/tmp/workspace-a',
    writeAccessEnabled: false
  });
  assert.equal(runtime.getRuntimeState().workspace.id, 'workspace-1');
});

test('WorkspaceService persists write access changes for the active workspace', async () => {
  const repository = new WorkspaceRepositoryStub();
  const runtime = createWorkspaceRuntime({
    id: 'workspace-1',
    projectRoot: '/tmp/workspace-a',
    projectName: 'voice-codex-local',
    isGitRepo: true,
    writeAccessEnabled: false
  });
  const service = new WorkspaceService(repository as never, runtime as never);

  const workspace = await service.updateWriteAccess(true);

  assert.equal(workspace.writeAccessEnabled, true);
  assert.equal(repository.upsertCalls.length, 1);
  assert.deepEqual(repository.upsertCalls[0], {
    name: 'voice-codex-local',
    rootPath: '/tmp/workspace-a',
    writeAccessEnabled: true
  });
});
