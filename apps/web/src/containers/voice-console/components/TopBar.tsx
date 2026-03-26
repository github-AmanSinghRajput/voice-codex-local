import type { SystemResponse, StatusResponse } from '../lib/types';
import type { DesktopRuntimeStatus } from '../../../desktop-shell';

interface TopBarProps {
  status: StatusResponse | null;
  system: SystemResponse | null;
  desktopRuntime: DesktopRuntimeStatus | null;
  codexReady: boolean;
  busyLabel: string;
  error: string;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export function TopBar({
  status,
  system,
  desktopRuntime,
  codexReady,
  busyLabel,
  error,
  onRefresh,
  onOpenSettings,
  onLogout
}: TopBarProps) {
  const workspaceLabel = status?.workspace.projectName ?? 'Pick a project folder to begin';
  const workspaceMode = status?.workspace.writeAccessEnabled
    ? 'Changes require approval'
    : 'Advisory mode';
  const authLabel = status?.codexStatus.authMode
    ? `Connected via ${status.codexStatus.authMode}`
    : 'Codex connected';

  return (
    <header className="topbar">
      <div className="topbar-left">
        {codexReady ? (
          <div className="topbar-workspace">
            <strong>{workspaceLabel}</strong>
            <small>{workspaceMode}</small>
          </div>
        ) : (
          <div className="topbar-workspace topbar-workspace-auth">
            <strong>Connect Codex to continue into your local coding workspace</strong>
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <div className="topbar-status-group">
          {desktopRuntime ? (
            <div className={`topbar-pill ${desktopRuntime.apiReachable ? 'ok' : 'warn'}`}>
              <span className="pill-dot" />
              {desktopRuntime.apiOwner === 'electron'
                ? `Local runtime ${desktopRuntime.apiPhase}`
                : desktopRuntime.apiOwner === 'external'
                  ? 'Attached to local runtime'
                  : desktopRuntime.apiError ?? 'Desktop runtime unavailable'}
            </div>
          ) : null}
          {codexReady ? (
            <div className="topbar-meta">
              <span>{authLabel}</span>
            </div>
          ) : null}
        </div>
        <div className="topbar-controls">
          {busyLabel ? <div className="topbar-pill info">{busyLabel}</div> : null}
          {error ? <div className="topbar-pill error">{error}</div> : null}
          <button className="toolbar-button" onClick={onRefresh} type="button">
            Refresh
          </button>
          {codexReady ? (
            <>
              <button className="toolbar-button" onClick={onOpenSettings} type="button">
                Settings
              </button>
              <button className="toolbar-button danger" onClick={onLogout} type="button">
                Logout
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
