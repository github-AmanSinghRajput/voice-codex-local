interface OnboardingScreenProps {
  codexStatusText: string;
  commandValue: string;
  onRefresh: () => void;
}

export function OnboardingScreen({
  codexStatusText,
  commandValue,
  onRefresh
}: OnboardingScreenProps) {
  const friendlyStatusText = getFriendlyCodexStatus(codexStatusText);

  return (
    <section className="screen onboarding-screen">
      <div className="hero-panel">
        <div className="hero-copy">
          <p className="hero-kicker">Connect the engine first</p>
          <h1>Connect Codex before the desktop console opens up.</h1>
          <p className="hero-lede">
            This app runs against your local Codex CLI session. Sign in once, refresh here, and the
            workspace, voice, terminal, and review surfaces unlock.
          </p>
          <ol className="hero-steps">
            <li>Run the Codex login command from terminal.</li>
            <li>Finish the OpenAI browser sign-in flow.</li>
            <li>Return here and hit refresh.</li>
          </ol>
          <div className="command-composer">
            <label htmlFor="codex-command">Suggested command</label>
            <div className="command-shell">
              <span>$</span>
              <div id="codex-command" className="command-static">
                {commandValue}
              </div>
            </div>
          </div>
          <div className="hero-actions">
            <button className="button-primary" onClick={onRefresh} type="button">
              Refresh Codex status
            </button>
            <div className="status-block">
              <span className="status-dot" />
              <strong>{friendlyStatusText}</strong>
            </div>
          </div>
        </div>

        <div className="hero-terminal">
          <div className="hero-terminal-chrome">
            <span />
            <span />
            <span />
          </div>
          <div className="hero-terminal-body">
            <p className="muted-line">Follow steps in your local terminal:</p>
            <p className="hero-terminal-line">
              <span className="prompt">$</span> {commandValue}
            </p>
            <p className="muted-line">[1/3] Open the given URL in your browser.</p>
            <p className="hero-terminal-line is-pulse">[2/3] Sign in to your OpenAI account there.</p>
            <p className="muted-line">
              [3/3] If prompted, enter the confirmation code shown in your terminal on the OpenAI page.
            </p>
            <p className="success-line">{friendlyStatusText}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function getFriendlyCodexStatus(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes('not logged in')) {
    return 'Ready to connect Codex.';
  }

  if (normalized.includes('enoent') || normalized.includes('not installed')) {
    return 'Codex CLI is not installed on this Mac.';
  }

  return value;
}
