import { formatReasoningEffort } from '../lib/helpers';
import type {
  AppSettings,
  AssistantProviderId,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  ConsolePreferences,
  StatusResponse,
  SystemResponse,
  VoiceSettingsResponse
} from '../lib/types';

interface SettingsDrawerProps {
  open: boolean;
  appSettings: AppSettings | null;
  preferences: ConsolePreferences;
  codexSettings: CodexSettingsResponse | null;
  claudeSettings: ClaudeSettingsResponse | null;
  status: StatusResponse | null;
  system: SystemResponse | null;
  voiceSettings: VoiceSettingsResponse | null;
  onPreferenceChange: <Key extends keyof ConsolePreferences>(
    key: Key,
    value: ConsolePreferences[Key]
  ) => void;
  onAppSettingChange: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void;
  onVoiceSettingChange: (
    key: keyof VoiceSettingsResponse['settings'],
    value: VoiceSettingsResponse['settings'][keyof VoiceSettingsResponse['settings']]
  ) => void;
  onCodexSettingChange: (
    key: keyof CodexSettingsResponse['settings'],
    value: CodexSettingsResponse['settings'][keyof CodexSettingsResponse['settings']]
  ) => void;
  onClaudeSettingChange: (
    key: keyof ClaudeSettingsResponse['settings'],
    value: ClaudeSettingsResponse['settings'][keyof ClaudeSettingsResponse['settings']]
  ) => void;
  onProviderChange: (providerId: AssistantProviderId) => void;
  onProviderDisconnect: (providerId: AssistantProviderId) => void;
  onClose: () => void;
}

export function SettingsDrawer({
  open,
  appSettings,
  preferences,
  codexSettings,
  claudeSettings,
  status,
  system,
  voiceSettings,
  onAppSettingChange,
  onPreferenceChange,
  onVoiceSettingChange,
  onCodexSettingChange,
  onClaudeSettingChange,
  onProviderChange,
  onProviderDisconnect,
  onClose
}: SettingsDrawerProps) {
  const activeProvider = status?.assistantProviders.activeProvider ?? null;
  const connectedProviders = status?.assistantProviders.providers.filter((provider) => provider.appConnected) ?? [];
  const codexConnected = Boolean(
    status?.assistantProviders.providers.some((provider) => provider.id === 'codex' && provider.appConnected)
  );
  const claudeConnected = Boolean(
    status?.assistantProviders.providers.some((provider) => provider.id === 'claude' && provider.appConnected)
  );
  const activeCodexModel = codexSettings?.settings.model ?? 'Use Codex default';
  const activeClaudeModel = claudeSettings?.settings.model ?? 'Use Claude default';

  return (
    <aside className={`settings-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="settings-drawer-backdrop" onClick={onClose} />
      <div className="settings-drawer-panel">
        <div className="settings-head">
          <div>
            <p className="section-kicker">Settings</p>
            <h2>Voice and operator controls</h2>
          </div>
          <button className="toolbar-button" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="settings-grid">
          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">App profile</span>
                <strong>Identity and appearance</strong>
              </div>
            </div>
            <div className="settings-list">
              <label className="settings-control">
                <span>What should VOCOD call you?</span>
                <input
                  maxLength={48}
                  type="text"
                  value={appSettings?.displayName ?? ''}
                  onChange={(event) => onAppSettingChange('displayName', event.target.value)}
                  placeholder="Aman"
                />
              </label>

              <label className="settings-control">
                <span>Theme</span>
                <select
                  value={appSettings?.theme ?? 'dark'}
                  onChange={(event) =>
                    onAppSettingChange('theme', event.target.value as AppSettings['theme'])
                  }
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
            </div>
          </section>

          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Assistant provider</span>
                <strong>App-managed provider access</strong>
              </div>
            </div>
            <div className="settings-list">
              <label className="settings-control">
                <span>Active provider</span>
                <select
                  value={status?.assistantProviders.activeProviderId ?? 'codex'}
                  onChange={(event) => onProviderChange(event.target.value as AssistantProviderId)}
                  disabled={connectedProviders.length === 0}
                >
                  {connectedProviders.length > 0 ? (
                    connectedProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))
                  ) : (
                    <option value="codex">Connect a provider first</option>
                  )}
                </select>
              </label>

              {(status?.assistantProviders.providers ?? []).map((provider) => (
                <div className="settings-item" key={provider.id}>
                  <span>{provider.name}</span>
                  <strong>
                    {provider.appConnected
                      ? 'Connected'
                      : provider.loggedIn
                        ? 'Ready to connect'
                        : provider.installed
                          ? 'Login required'
                          : 'Not installed'}
                  </strong>
                  {provider.appConnected ? (
                    <button
                      className="toolbar-button"
                      onClick={() => onProviderDisconnect(provider.id)}
                      type="button"
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Audio path</span>
                <strong>Current native routing</strong>
              </div>
            </div>
            <div className="settings-list">
              <div className="settings-item">
                <span>Input device</span>
                <strong>{status?.audio.inputDeviceLabel ?? 'System default input'}</strong>
              </div>
              <div className="settings-item">
                <span>Output device</span>
                <strong>{status?.audio.outputDeviceLabel ?? 'Speech output disabled'}</strong>
              </div>
              <div className="settings-item">
                <span>Speech engines</span>
                <strong>
                  {status?.audio.transcriptionEngine ?? 'Unavailable'} /{' '}
                  {status?.audio.speechEngine ?? 'Unavailable'}
                </strong>
              </div>
              <div className="settings-item">
                <span>Silence window</span>
                <strong>{status?.voiceSession.silenceWindowMs ?? 800}ms</strong>
              </div>
            </div>
          </section>

          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Voice controls</span>
                <strong>Native session preferences</strong>
              </div>
            </div>
            <div className="settings-list">
              <div className="settings-subgroup">
                <span className="metric-label">Routing</span>
                <label className="settings-control">
                  <span>Input device</span>
                  <select disabled value={voiceSettings?.currentDevices.inputLabel ?? 'System default input'}>
                    <option>{voiceSettings?.currentDevices.inputLabel ?? 'System default input'}</option>
                  </select>
                </label>
              </div>

              <div className="settings-subgroup">
                <span className="metric-label">Speech</span>
                <label className="settings-control">
                  <span>Voice quality profile</span>
                  <select
                    value={voiceSettings?.settings.qualityProfile ?? 'demo'}
                    onChange={(event) =>
                      onVoiceSettingChange(
                        'qualityProfile',
                        event.target.value as VoiceSettingsResponse['settings']['qualityProfile']
                      )
                    }
                  >
                    <option value="demo">Demo quality</option>
                    <option value="balanced">Balanced</option>
                    <option value="low_memory">Low memory</option>
                  </select>
                </label>

                <label className="settings-control">
                  <span>Noise filtering</span>
                  <select
                    value={voiceSettings?.settings.noiseMode ?? 'focused'}
                    onChange={(event) =>
                      onVoiceSettingChange(
                        'noiseMode',
                        event.target.value as VoiceSettingsResponse['settings']['noiseMode']
                      )
                    }
                  >
                    <option value="focused">Focused voice</option>
                    <option value="normal">Normal room</option>
                    <option value="noisy_room">Noisy room</option>
                  </select>
                </label>

                <label className="settings-control">
                  <span>Locale</span>
                  <select
                    value={voiceSettings?.settings.voiceLocale ?? 'en-US'}
                    onChange={(event) => onVoiceSettingChange('voiceLocale', event.target.value)}
                  >
                    <option value="en-US">English (US)</option>
                    <option value="en-IN">English (India)</option>
                    <option value="hi-IN">Hindi (India)</option>
                  </select>
                </label>

                <label className="settings-control">
                  <span>Reply voice</span>
                  <select
                    disabled={(voiceSettings?.options.voices.length ?? 0) === 0}
                    value={voiceSettings?.settings.ttsVoice ?? ''}
                    onChange={(event) => onVoiceSettingChange('ttsVoice', event.target.value)}
                  >
                    {(
                      voiceSettings?.options.voices.length
                        ? voiceSettings.options.voices
                        : [{ id: '', name: 'No local Kokoro voices found', language: '', quality: 'default' as const }]
                    ).map((option) => (
                      <option disabled={!option.id} key={option.id || 'none'} value={option.id}>
                        {option.language ? `${option.name} · ${option.language}` : option.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-control">
                  <span>Activity narration</span>
                  <select
                    value={voiceSettings?.settings.narrationMode ?? 'narrated'}
                    onChange={(event) =>
                      onVoiceSettingChange(
                        'narrationMode',
                        event.target.value as VoiceSettingsResponse['settings']['narrationMode']
                      )
                    }
                  >
                    <option value="narrated">Narrated</option>
                    <option value="silent_progress">Silent progress</option>
                    <option value="muted">Muted</option>
                  </select>
                </label>

                <label className="settings-control">
                  <span>Transcription engine</span>
                  <select
                    value={voiceSettings?.settings.transcriptionModel ?? 'default'}
                    onChange={(event) =>
                      onVoiceSettingChange(
                        'transcriptionModel',
                        event.target.value as VoiceSettingsResponse['settings']['transcriptionModel']
                      )
                    }
                  >
                    {(voiceSettings?.options.transcriptionModels ?? []).map((option) => (
                      <option disabled={!option.available} key={option.id} value={option.id}>
                        {option.label}{option.available ? '' : ' (configure model path)'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-control">
                  <span>Transcription language</span>
                  <select
                    value={voiceSettings?.settings.transcriptionLanguageCode ?? 'en'}
                    onChange={(event) =>
                      onVoiceSettingChange('transcriptionLanguageCode', event.target.value)
                    }
                  >
                    {(voiceSettings?.options.transcriptionLanguages ?? []).map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-control">
                  <span>Silence window</span>
                  <select
                    value={String(voiceSettings?.settings.silenceWindowMs ?? 800)}
                    onChange={(event) =>
                      onVoiceSettingChange('silenceWindowMs', Number(event.target.value))
                    }
                  >
                    <option value="700">0.7s</option>
                    <option value="800">0.8s</option>
                    <option value="1000">1.0s</option>
                    <option value="1500">1.5s</option>
                    <option value="2000">2.0s</option>
                    <option value="2500">2.5s</option>
                    <option value="3000">3.0s</option>
                  </select>
                </label>
              </div>

              <div className="settings-subgroup">
                <span className="metric-label">Session behavior</span>
                <label className="settings-control checkbox-control">
                  <span>Auto-resume listening after reply</span>
                  <input
                    checked={voiceSettings?.settings.autoResumeAfterReply ?? true}
                    onChange={(event) => onVoiceSettingChange('autoResumeAfterReply', event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>

              <div className="settings-item">
                <span>Current input</span>
                <strong>{voiceSettings?.currentDevices.inputLabel ?? 'System default input'}</strong>
              </div>

              <div className="settings-item">
                <span>Output path</span>
                <strong>
                  Warm local Kokoro ({voiceSettings?.options.voices.find((voice) => voice.id === voiceSettings?.settings.ttsVoice)?.name ?? voiceSettings?.settings.ttsVoice ?? 'default'}) with browser fallback
                </strong>
              </div>

              <div className="settings-item">
                <span>Speech mode</span>
                <strong>
                  {voiceSettings?.settings.narrationMode === 'muted'
                    ? 'Text only'
                    : voiceSettings?.settings.narrationMode === 'silent_progress'
                      ? 'Reply only'
                      : 'Narrated progress'}
                </strong>
              </div>
            </div>
          </section>

          {codexConnected ? (
            <section className="content-card">
              <div className="card-head">
                <div>
                  <span className="metric-label">Model overrides</span>
                  <strong>OpenAI Codex execution preferences</strong>
                </div>
              </div>
              <div className="settings-list">
                <label className="settings-control">
                  <span>Model</span>
                  <select
                    value={codexSettings?.settings.model ?? ''}
                    onChange={(event) => onCodexSettingChange('model', event.target.value || null)}
                  >
                    <option value="">Use Codex default</option>
                    {(codexSettings?.options.models ?? []).map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-control">
                  <span>Reasoning effort</span>
                  <select
                    value={codexSettings?.settings.reasoningEffort ?? ''}
                    onChange={(event) =>
                      onCodexSettingChange(
                        'reasoningEffort',
                        (event.target.value || null) as CodexSettingsResponse['settings']['reasoningEffort']
                      )
                    }
                  >
                    <option value="">Use model default</option>
                    {(
                      codexSettings?.options.models.find(
                        (option) => option.slug === codexSettings?.settings.model
                      )?.supportedReasoningEfforts ?? []
                    ).map((option) => (
                      <option key={option.effort} value={option.effort}>
                        {formatReasoningEffort(option.effort)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="settings-item">
                  <span>Applies when</span>
                  <strong>
                    {activeProvider?.id === 'codex'
                      ? 'Codex is active right now'
                      : `${activeProvider?.name ?? 'Another provider'} is active right now`}
                  </strong>
                </div>

                <div className="settings-item">
                  <span>Current model</span>
                  <strong>{activeCodexModel}</strong>
                </div>

                <div className="settings-item">
                  <span>Source</span>
                  <strong>{codexSettings?.source ?? 'default'}</strong>
                </div>

                <div className="settings-item">
                  <span>Voice shortcut</span>
                  <strong>Say “Hey VOCOD, list available models.”</strong>
                </div>
              </div>
            </section>
          ) : null}

          {claudeConnected ? (
            <section className="content-card">
              <div className="card-head">
                <div>
                  <span className="metric-label">Model overrides</span>
                  <strong>Claude Code execution preferences</strong>
                </div>
              </div>
              <div className="settings-list">
                <label className="settings-control">
                  <span>Model</span>
                  <select
                    value={claudeSettings?.settings.model ?? ''}
                    onChange={(event) => onClaudeSettingChange('model', event.target.value || null)}
                  >
                    <option value="">Use Claude default</option>
                    {(claudeSettings?.options.models ?? []).map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.displayName}{option.suggestedForDiscussion ? ' · suggested for discussion' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="settings-item">
                  <span>Suggested low-token discussion model</span>
                  <strong>
                    {claudeSettings?.options.models.find((option) => option.suggestedForDiscussion)?.displayName ??
                      'Haiku'}
                  </strong>
                </div>

                <div className="settings-item">
                  <span>Current model</span>
                  <strong>{activeClaudeModel}</strong>
                </div>

                <div className="settings-item">
                  <span>Source</span>
                  <strong>{claudeSettings?.source ?? 'default'}</strong>
                </div>

                <div className="settings-item">
                  <span>Voice shortcut</span>
                  <strong>Say “Hey VOCOD, list available models.”</strong>
                </div>
              </div>
            </section>
          ) : null}

          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Console preferences</span>
                <strong>Local UI behavior</strong>
              </div>
            </div>
            <div className="settings-list">
              <label className="settings-control">
                <span>Default ready screen</span>
                <select
                  value={preferences.defaultScreen}
                  onChange={(event) =>
                    onPreferenceChange('defaultScreen', event.target.value as ConsolePreferences['defaultScreen'])
                  }
                >
                  <option value="voice">Voice</option>
                  <option value="terminal">Terminal</option>
                  <option value="workspace">Workspace</option>
                </select>
              </label>

              <label className="settings-control">
                <span>Transcript density</span>
                <select
                  value={preferences.transcriptDensity}
                  onChange={(event) =>
                    onPreferenceChange(
                      'transcriptDensity',
                      event.target.value as ConsolePreferences['transcriptDensity']
                    )
                  }
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>

              <label className="settings-control">
                <span>Motion mode</span>
                <select
                  value={preferences.motionMode}
                  onChange={(event) =>
                    onPreferenceChange('motionMode', event.target.value as ConsolePreferences['motionMode'])
                  }
                >
                  <option value="full">Full</option>
                  <option value="reduced">Reduced</option>
                </select>
              </label>
            </div>
          </section>

          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Operator</span>
                <strong>{system?.auth.operator?.displayName ?? 'Local operator'}</strong>
              </div>
            </div>
            <div className="settings-list">
              <div className="settings-item">
                <span>Connected assistants</span>
                <strong>
                  {connectedProviders.length > 0
                    ? connectedProviders.map((provider) => provider.name).join(', ')
                    : 'No provider connected'}
                </strong>
              </div>
              <div className="settings-item">
                <span>Tracked CLI sessions</span>
                <strong>{system?.auth.trackedSessions.length ?? 0}</strong>
              </div>
            </div>
          </section>

          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Voice capabilities</span>
                <strong>Current feature status</strong>
              </div>
            </div>
            <div className="settings-capability-row">
              <span className={`section-chip ${voiceSettings?.capabilities.interruption ? 'approved' : 'pending'}`}>
                interruption
              </span>
              <span className={`section-chip ${voiceSettings?.capabilities.deviceSelection ? 'approved' : 'pending'}`}>
                device selection
              </span>
              <span className={`section-chip ${voiceSettings?.capabilities.voiceSelection ? 'approved' : 'pending'}`}>
                voice selection
              </span>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
