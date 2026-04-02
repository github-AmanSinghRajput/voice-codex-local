import type { WorkspaceState } from '../lib/types';

interface WorkspaceScreenProps {
  activeProviderName: string;
  projectInput: string;
  workspace: WorkspaceState | null;
  canBrowseProjectFolder: boolean;
  isResetting: boolean;
  onProjectInputChange: (value: string) => void;
  onBrowseProjectFolder: () => void;
  onSaveProject: () => void;
  onToggleWriteAccess: (enabled: boolean) => void;
  onResetApp: () => void;
}

export function WorkspaceScreen({
  activeProviderName,
  projectInput,
  workspace,
  canBrowseProjectFolder,
  isResetting,
  onProjectInputChange,
  onBrowseProjectFolder,
  onSaveProject,
  onToggleWriteAccess,
  onResetApp
}: WorkspaceScreenProps) {
  return (
    <section className="screen workspace-screen">
      <div className="section-head">
        <div>
          <p className="section-kicker">Workspace</p>
          <h2>Choose the folder {activeProviderName} is allowed to work inside.</h2>
          <p>
            Until you select a folder, {activeProviderName} can chat with you but should not inspect project files.
          </p>
        </div>
        <div className="section-chip-group">
          <span className="section-chip">
            {workspace?.projectRoot ? 'folder selected' : 'no folder selected'}
          </span>
          <span className="section-chip">
            {workspace?.writeAccessEnabled ? 'changes require approval' : 'changes off'}
          </span>
        </div>
      </div>

      <div className="workspace-layout">
        <section className="content-card primary-card">
          <label className="field-block" htmlFor="project-root">
            <span>Project folder</span>
            <div className="field-row">
              <input
                id="project-root"
                value={projectInput}
                onChange={(event) => onProjectInputChange(event.target.value)}
                placeholder="/absolute/path/to/your/project"
              />
              <button
                className="button-secondary"
                disabled={!canBrowseProjectFolder}
                onClick={onBrowseProjectFolder}
                type="button"
              >
                Browse
              </button>
              <button className="button-primary" onClick={onSaveProject} type="button">
                Connect folder
              </button>
            </div>
          </label>

          <div className="action-row">
            <button
              className={workspace?.writeAccessEnabled ? 'button-secondary danger' : 'button-secondary'}
              disabled={!workspace?.projectRoot}
              onClick={() => onToggleWriteAccess(!workspace?.writeAccessEnabled)}
              type="button"
            >
              {workspace?.writeAccessEnabled ? 'Turn off file changes' : 'Allow approved file changes'}
            </button>
          </div>
        </section>

        <section className="metrics-grid">
          <article className="metric-card">
            <span className="metric-label">Connected folder</span>
            <strong>{workspace?.projectRoot ?? 'No folder connected yet'}</strong>
            <p>Once selected, {activeProviderName} should stay scoped to this folder only.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Protected secrets</span>
            <strong>{workspace?.secretPolicy.length ? workspace.secretPolicy.slice(0, 3).join(', ') : 'Select a folder to see the active policy'}</strong>
            <p>Secret-like files stay outside normal coding operations.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Change policy</span>
            <strong>{workspace?.writeAccessEnabled ? 'Approved edits enabled' : 'Chat and advice only'}</strong>
            <p>No file changes are automatic. Every edit still requires explicit approval.</p>
          </article>
        </section>
      </div>

      <section className="content-card workspace-danger-zone">
        <div className="workspace-danger-copy">
          <span className="warning-ribbon">Warning</span>
          <div>
            <h3>Reset VOCOD</h3>
            <p>
              This clears chat history, notes, approvals, saved workspace, voice settings, app preferences, and
              app-level provider connections. It does not run system-wide Codex or Claude logout commands.
            </p>
          </div>
        </div>

        <button className="button-secondary danger" disabled={isResetting} onClick={onResetApp} type="button">
          {isResetting ? 'Resetting…' : 'Reset everything'}
        </button>
      </section>
    </section>
  );
}
