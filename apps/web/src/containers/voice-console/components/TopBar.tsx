import type { AssistantProviderId, SystemResponse, StatusResponse } from '../lib/types';
import type { DesktopRuntimeStatus } from '../../../desktop-shell';

interface TopBarProps {
  status: StatusResponse | null;
  system: SystemResponse | null;
  desktopRuntime: DesktopRuntimeStatus | null;
  displayName: string | null;
  onboardingStep?: 1 | 2 | 3;
  assistantReady: boolean;
  busyLabel: string;
  error: string;
  onSwitchProvider: (providerId: AssistantProviderId) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onDisconnect: () => void;
}

export function TopBar({
  status,
  system,
  desktopRuntime,
  displayName,
  onboardingStep = 1,
  assistantReady,
  busyLabel,
  error,
  onSwitchProvider,
  onRefresh,
  onOpenSettings,
  onDisconnect
}: TopBarProps) {
  const workspaceLabel = status?.workspace.projectName ?? 'Pick a project folder to begin';
  const workspaceMode = status?.workspace.writeAccessEnabled
    ? 'Changes require approval'
    : 'Advisory mode';
  const activeProvider = status?.assistantProviders.activeProvider ?? null;
  const authLabel = activeProvider?.authMode
    ? `${activeProvider.name} via ${activeProvider.authMode}`
    : activeProvider?.name ?? 'No provider connected';
  const greetingName = displayName?.trim() || null;
  const onboardingTitle =
    greetingName && onboardingStep > 1 ? `Welcome, ${greetingName}` : 'Set up VOCOD';
  const onboardingSubtitle =
    onboardingStep === 1 ? 'Pick the name you want VOCOD to use.' : '';

  return (
    <header className="topbar">
      <div className="topbar-left">
        {assistantReady ? (
          <div className="topbar-workspace">
            <strong>{greetingName ? `Welcome, ${greetingName}` : workspaceLabel}</strong>
            <small>{greetingName ? workspaceLabel : workspaceMode}</small>
            {greetingName ? <small>{workspaceMode}</small> : null}
          </div>
        ) : (
          <div className="topbar-workspace topbar-workspace-auth">
            <strong>{onboardingTitle}</strong>
            {onboardingSubtitle ? <small>{onboardingSubtitle}</small> : null}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <div className="topbar-status-group">
          {assistantReady && desktopRuntime ? (
            <div className={`topbar-pill ${desktopRuntime.apiReachable ? 'ok' : 'warn'}`}>
              <span className="pill-dot" />
              {desktopRuntime.apiOwner === 'electron'
                ? `Local runtime ${desktopRuntime.apiPhase}`
                : desktopRuntime.apiOwner === 'external'
                  ? 'Attached to local runtime'
                  : desktopRuntime.apiError ?? 'Desktop runtime unavailable'}
            </div>
          ) : null}
          {assistantReady ? (
            <div className="topbar-meta">
              <span>{authLabel}</span>
              {status?.assistantProviders.providers.length ? (
                <select
                  value={status.assistantProviders.activeProviderId ?? ''}
                  onChange={(event) => onSwitchProvider(event.target.value as AssistantProviderId)}
                >
                  {status.assistantProviders.providers
                    .filter((provider) => provider.appConnected)
                    .map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="topbar-controls">
          {busyLabel ? <div className="topbar-pill info">{busyLabel}</div> : null}
          {error ? <div className="topbar-pill error">{error}</div> : null}
          {assistantReady ? (
            <>
              <button className="toolbar-button" onClick={onRefresh} type="button">
                Refresh
              </button>
              <button className="toolbar-button" onClick={onOpenSettings} type="button">
                Settings
              </button>
              <button className="toolbar-button danger" onClick={onDisconnect} type="button">
                Disconnect {activeProvider?.name ? activeProvider.name.split(' ').pop() : ''}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
