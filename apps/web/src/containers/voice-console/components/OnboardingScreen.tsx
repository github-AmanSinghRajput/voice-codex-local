import { useEffect, useRef, useState } from 'react';
import type { AppSettings, AssistantProviderId, AssistantProviderStatus } from '../lib/types';
import { BrandLogo } from './BrandLogo';

interface OnboardingScreenProps {
  appSettings: AppSettings | null;
  step: 1 | 2 | 3;
  selectedProviderId: AssistantProviderId | null;
  providers: AssistantProviderStatus[];
  onConnectProvider: (providerId: AssistantProviderId) => void;
  onRefresh: () => void;
  onSaveDisplayName: (displayName: string) => void;
  onSelectProvider: (providerId: AssistantProviderId) => void;
  onContinueToInstructions: () => void;
  onBackToProviderChoice: () => void;
  onBackToName: () => void;
}

export function OnboardingScreen({
  appSettings,
  step,
  selectedProviderId,
  providers,
  onConnectProvider,
  onRefresh,
  onSaveDisplayName,
  onSelectProvider,
  onContinueToInstructions,
  onBackToProviderChoice,
  onBackToName
}: OnboardingScreenProps) {
  const [displayNameInput, setDisplayNameInput] = useState(appSettings?.displayName ?? '');
  const [typedWelcome, setTypedWelcome] = useState('');
  const [showSwitchAccountGuide, setShowSwitchAccountGuide] = useState(false);
  const stableDisplayNameRef = useRef(appSettings?.displayName?.trim() ?? '');
  const lastAnimatedWelcomeRef = useRef<string | null>(null);

  useEffect(() => {
    setDisplayNameInput(appSettings?.displayName ?? '');
  }, [appSettings?.displayName]);

  useEffect(() => {
    const nextDisplayName = appSettings?.displayName?.trim() ?? '';
    if (nextDisplayName) {
      stableDisplayNameRef.current = nextDisplayName;
    }
  }, [appSettings?.displayName]);

  useEffect(() => {
    setShowSwitchAccountGuide(false);
  }, [selectedProviderId, step]);

  useEffect(() => {
    if (step !== 2) {
      setTypedWelcome('');
      return;
    }

    const displayName = appSettings?.displayName?.trim() || stableDisplayNameRef.current;
    if (!displayName) {
      setTypedWelcome('');
      return;
    }

    const target = `Welcome, ${displayName}`;
    if (lastAnimatedWelcomeRef.current === target) {
      setTypedWelcome(target);
      return;
    }

    lastAnimatedWelcomeRef.current = target;
    setTypedWelcome('');
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setTypedWelcome(target.slice(0, index));
      if (index >= target.length) {
        setTypedWelcome(target);
        window.clearInterval(interval);
      }
    }, 18);

    return () => {
      window.clearInterval(interval);
    };
  }, [appSettings?.displayName, step]);

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null;

  return (
    <section className="screen onboarding-screen">
      <div className={`onboarding-shell content-card onboarding-step-${step}`}>
        <div className="onboarding-progress">
          {[1, 2, 3].map((progressStep) => (
            <div
              className={`onboarding-progress-step ${progressStep <= step ? 'active' : ''}`}
              key={progressStep}
            >
              <span>{progressStep}</span>
            </div>
          ))}
        </div>

        <div className="onboarding-stage">
          <div className="onboarding-copy">
            <BrandLogo subtitle="Voice-first coding assistant" />
            {step === 1 ? (
              <>
                <p className="hero-kicker">Step 1</p>
                <h1>What would you like VOCOD to call you?</h1>
                <p className="hero-lede">This stays local to the app and you can change it later.</p>
                <label className="settings-control onboarding-name-control">
                  <span>Your name</span>
                  <input
                    autoFocus
                    maxLength={48}
                    placeholder="Jake Gyllenhaal"
                    type="text"
                    value={displayNameInput}
                    onChange={(event) => setDisplayNameInput(event.target.value)}
                  />
                </label>
                <div className="hero-actions">
                  <button
                    className="button-primary"
                    disabled={!displayNameInput.trim()}
                    onClick={() => onSaveDisplayName(displayNameInput)}
                    type="button"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : step === 2 ? (
              <>
                <p className="hero-kicker">Step 2</p>
                <p className="onboarding-typed-welcome" aria-live="polite">
                  {typedWelcome}
                </p>
                <h1>Pick the assistant you want to start with.</h1>
                <p className="hero-lede">Choose one now. You can add the other later.</p>
                <div className="onboarding-provider-grid compact">
                  {providers.map((provider) => (
                    <button
                      className={`onboarding-provider-select ${selectedProviderId === provider.id ? 'active' : ''}`}
                      key={provider.id}
                      onClick={() => onSelectProvider(provider.id)}
                      type="button"
                    >
                      <span className="metric-label">
                        {provider.id === 'codex' ? 'OpenAI' : 'Anthropic'}
                      </span>
                      <strong>{provider.name}</strong>
                      {selectedProviderId === provider.id ? (
                        <span className="onboarding-provider-selected">Selected</span>
                      ) : null}
                      <small>{getProviderCardSummary(provider)}</small>
                    </button>
                  ))}
                </div>
                <div className="hero-actions">
                  <button className="button-ghost" onClick={onBackToName} type="button">
                    Back
                  </button>
                  <button
                    className="button-primary"
                    disabled={!selectedProviderId}
                    onClick={onContinueToInstructions}
                    type="button"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : selectedProvider ? (
              <>
                <p className="hero-kicker">Step 3</p>
                <h1>Connect {selectedProvider.name} to finish setup.</h1>
                <p className="hero-lede">{getFriendlyProviderStatus(selectedProvider)}</p>
                <div className="onboarding-connect-layout">
                  <article className="onboarding-connect-card onboarding-connect-card-primary">
                    <div className="card-head onboarding-connect-head">
                      <div>
                        <span className="metric-label">
                          {selectedProvider.id === 'codex' ? 'OpenAI' : 'Anthropic'}
                        </span>
                        <strong>{selectedProvider.name}</strong>
                        <p className="onboarding-connect-caption">
                          {selectedProvider.id === 'codex'
                            ? 'Use your local OpenAI Codex CLI session inside VOCOD.'
                            : 'Use your local Claude Code CLI session inside VOCOD.'}
                        </p>
                      </div>
                      <span
                        className={`section-chip ${
                          selectedProvider.appConnected
                            ? 'approved'
                            : selectedProvider.loggedIn
                              ? 'pending'
                              : 'rejected'
                        }`}
                      >
                        {getProviderConnectionStateLabel(selectedProvider)}
                      </span>
                    </div>

                    {selectedProvider.loggedIn && !showSwitchAccountGuide ? (
                      <div className="onboarding-account-detected">
                        <span className="metric-label">Detected on this Mac</span>
                        <strong>{selectedProvider.accountLabel ?? 'Signed-in local session detected'}</strong>
                        <p>
                          VOCOD found an existing {selectedProvider.name} session on this machine. Continue with this
                          account, or switch accounts first and then come back here.
                        </p>
                      </div>
                    ) : null}

                    {(!selectedProvider.loggedIn || showSwitchAccountGuide) && (
                      <div className="onboarding-command-stack">
                        {showSwitchAccountGuide && selectedProvider.logoutCommand ? (
                          <div className="onboarding-command-card">
                            <span className="metric-label">Switch account first</span>
                            <div className="onboarding-command-row">
                              <span className="prompt">$</span>
                              <code>{selectedProvider.logoutCommand}</code>
                            </div>
                          </div>
                        ) : null}

                        <div className="onboarding-command-card">
                          <span className="metric-label">{showSwitchAccountGuide ? 'Sign in again' : 'Login command'}</span>
                          <div className="onboarding-command-row">
                            <span className="prompt">$</span>
                            <code>{selectedProvider.loginCommand}</code>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="hero-actions onboarding-connect-actions">
                      <button
                        className="button-ghost"
                        onClick={onBackToProviderChoice}
                        type="button"
                      >
                        Back
                      </button>
                      <button className="button-secondary" onClick={onRefresh} type="button">
                        Check again
                      </button>
                      {selectedProvider.loggedIn && !selectedProvider.appConnected && selectedProvider.canSwitchAccount ? (
                        <button
                          className="button-secondary"
                          onClick={() => setShowSwitchAccountGuide((current) => !current)}
                          type="button"
                        >
                          {showSwitchAccountGuide ? 'Use detected account' : 'Use a different account'}
                        </button>
                      ) : null}
                      <button
                        className="button-primary"
                        disabled={!selectedProvider.loggedIn || selectedProvider.appConnected}
                        onClick={() => onConnectProvider(selectedProvider.id)}
                        type="button"
                      >
                        {getConnectButtonLabel(selectedProvider, showSwitchAccountGuide)}
                      </button>
                    </div>
                  </article>

                  <article className="onboarding-connect-card">
                    <span className="metric-label">What to do</span>
                    <ol className="onboarding-connect-steps">
                      {getProviderConnectSteps(selectedProvider, showSwitchAccountGuide).map((stepText) => (
                        <li key={stepText}>{stepText}</li>
                      ))}
                    </ol>
                    <p className="onboarding-connect-note">
                      {getProviderConnectNote(selectedProvider, appSettings?.displayName ?? null, showSwitchAccountGuide)}
                    </p>
                  </article>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function getProviderCardSummary(provider: AssistantProviderStatus) {
  if (provider.appConnected) {
    return 'Already connected in VOCOD';
  }

  if (provider.loggedIn) {
    return 'CLI ready to connect';
  }

  if (provider.installed) {
    return 'Needs local login first';
  }

  return 'Install the CLI first';
}

function getFriendlyProviderStatus(provider: AssistantProviderStatus) {
  const normalized = provider.statusText.toLowerCase();

  if (!provider.installed || normalized.includes('enoent') || normalized.includes('not installed')) {
    return `${provider.name} is not installed on this Mac yet. Install it first, then return here and refresh.`;
  }

  if (!provider.loggedIn || normalized.includes('not logged in')) {
    return `Run the login command below, finish the browser sign-in flow, then come back and press Refresh.`;
  }

  if (!provider.appConnected) {
    if (provider.accountLabel) {
      return `${provider.name} is already signed in on this Mac as ${provider.accountLabel}. Continue with this account, or switch to a different one first.`;
    }

    return `${provider.name} is already signed in on this Mac. Continue with this account, or switch to a different one first.`;
  }

  return `${provider.name} is connected and ready inside VOCOD.`;
}

function getProviderConnectionStateLabel(provider: AssistantProviderStatus) {
  if (provider.appConnected) {
    return 'Connected';
  }

  if (provider.loggedIn) {
    return 'Ready to connect';
  }

  if (provider.installed) {
    return 'Login required';
  }

  return 'Not installed';
}

function getConnectButtonLabel(provider: AssistantProviderStatus, showSwitchAccountGuide: boolean) {
  if (provider.appConnected) {
    return 'Connected';
  }

  if (!provider.loggedIn) {
    return provider.installed ? 'Login required' : 'Install first';
  }

  if (showSwitchAccountGuide) {
    return 'Login first';
  }

  return `Continue with ${provider.id === 'claude' ? 'Claude' : 'Codex'}`;
}

function getProviderConnectSteps(provider: AssistantProviderStatus, showSwitchAccountGuide: boolean) {
  if (!provider.installed) {
    return [
      `Install ${provider.name} on this Mac.`,
      'Return here and press Check again.',
      'Finish by connecting it inside VOCOD.'
    ];
  }

  if (!provider.loggedIn) {
    return [
      'Run the login command in Terminal.',
      'Complete the browser sign-in flow.',
      'Come back here and press Check again.'
    ];
  }

  if (showSwitchAccountGuide && provider.logoutCommand) {
    return [
      `Run ${provider.logoutCommand} in Terminal.`,
      `Sign back in with ${provider.loginCommand}.`,
      'Return here, press Check again, then continue with the newly detected account.'
    ];
  }

  if (!provider.appConnected) {
    return [
      provider.accountLabel
        ? `${provider.name} is already signed in as ${provider.accountLabel}.`
        : `${provider.name} is already signed in on this Mac.`,
      'Press Continue to let VOCOD use this account.',
      'You can add the other provider later in Settings.'
    ];
  }

  return [
    `${provider.name} is connected to VOCOD.`,
    'Your workspace unlocks automatically after setup.',
    'You can switch providers anytime later.'
  ];
}

function getProviderConnectNote(
  provider: AssistantProviderStatus,
  displayName: string | null,
  showSwitchAccountGuide: boolean
) {
  const firstName = displayName?.trim().split(/\s+/)[0];
  if (provider.appConnected) {
    return firstName ? `You are ready to go, ${firstName}.` : 'You are ready to go.';
  }

  if (showSwitchAccountGuide) {
    return 'VOCOD does not change system accounts itself. Switch accounts in the CLI first, then come back and reconnect here.';
  }

  if (provider.loggedIn) {
    return 'VOCOD only connects to the session already signed in on this machine. It does not copy or store your provider credentials.';
  }

  return 'VOCOD only uses providers you explicitly connect here. Nothing is auto-enabled.';
}
