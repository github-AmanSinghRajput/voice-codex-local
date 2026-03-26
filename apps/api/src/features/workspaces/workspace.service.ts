import { logger } from '../../lib/logger.js';
import {
  getRuntimeState,
  setProjectRoot,
  setWorkspaceState,
  setWriteAccessEnabled,
  validateProjectRoot
} from '../../runtime.js';
import { WorkspaceRepository } from './workspace.repository.js';

interface WorkspaceRuntimeAdapter {
  getRuntimeState: typeof getRuntimeState;
  setProjectRoot: typeof setProjectRoot;
  setWorkspaceState: typeof setWorkspaceState;
  setWriteAccessEnabled: typeof setWriteAccessEnabled;
  validateProjectRoot: typeof validateProjectRoot;
}

const defaultRuntimeAdapter: WorkspaceRuntimeAdapter = {
  getRuntimeState,
  setProjectRoot,
  setWorkspaceState,
  setWriteAccessEnabled,
  validateProjectRoot
};

export class WorkspaceService {
  constructor(
    private readonly repository: WorkspaceRepository = new WorkspaceRepository(),
    private readonly runtime: WorkspaceRuntimeAdapter = defaultRuntimeAdapter
  ) {}

  async initialize() {
    const latest = await this.repository.findLatestWorkspace();
    if (!latest) {
      return this.runtime.getRuntimeState().workspace;
    }

    try {
      const validated = await this.runtime.validateProjectRoot(latest.root_path);
      this.runtime.setWorkspaceState({
        id: latest.id,
        projectRoot: validated.projectRoot,
        projectName: validated.projectName,
        isGitRepo: validated.isGitRepo,
        writeAccessEnabled: latest.write_access_enabled
      });
    } catch (error) {
      logger.warn('workspace.restore_failed', {
        rootPath: latest.root_path,
        message: error instanceof Error ? error.message : 'Unable to restore workspace.'
      });
    }

    return this.runtime.getRuntimeState().workspace;
  }

  async selectProjectRoot(projectRoot: string) {
    const workspace = await this.runtime.setProjectRoot(projectRoot);
    const persisted = await this.repository.upsertWorkspace({
      name: workspace.projectName ?? 'Workspace',
      rootPath: workspace.projectRoot ?? projectRoot,
      writeAccessEnabled: workspace.writeAccessEnabled
    });
    if (persisted) {
      this.runtime.setWorkspaceState({
        id: persisted.id
      });
    }
    return workspace;
  }

  async updateWriteAccess(enabled: boolean) {
    const workspace = this.runtime.setWriteAccessEnabled(enabled);
    if (workspace.projectRoot && workspace.projectName) {
      const persisted = await this.repository.upsertWorkspace({
        name: workspace.projectName,
        rootPath: workspace.projectRoot,
        writeAccessEnabled: workspace.writeAccessEnabled
      });
      if (persisted) {
        this.runtime.setWorkspaceState({
          id: persisted.id
        });
      }
    }
    return workspace;
  }
}
