import { formatReasoningEffort } from '../lib/helpers';
import type {
  CodexSettingsResponse,
  ConsolePreferences,
  StatusResponse,
  SystemResponse,
  VoiceSettingsResponse
} from '../lib/types';

interface SettingsDrawerProps {
  open: boolean;
  preferences: ConsolePreferences;
  codexSettings: CodexSettingsResponse | null;
  status: StatusResponse | null;
  system: SystemResponse | null;
  voiceSettings: VoiceSettingsResponse | null;
  onPreferenceChange: <Key extends keyof ConsolePreferences>(
    key: Key,
    value: ConsolePreferences[Key]
  ) => void;
  onVoiceSettingChange: (
    key: keyof VoiceSettingsResponse['settings'],
    value: VoiceSettingsResponse['settings'][keyof VoiceSettingsResponse['settings']]
  ) => void;
  onCodexSettingChange: (
    key: keyof CodexSettingsResponse['settings'],
    value: CodexSettingsResponse['settings'][keyof CodexSettingsResponse['settings']]
  ) => void;
  onClose: () => void;
}

export function SettingsDrawer({
  open,
  preferences,
  codexSettings,
  status,
  system,
  voiceSettings,
  onPreferenceChange,
  onVoiceSettingChange,
  onCodexSettingChange,
  onClose
}: SettingsDrawerProps) {
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
                  <span>Transcription model</span>
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
            </div>
          </section>

          <section className="content-card">
            <div className="card-head">
              <div>
                <span className="metric-label">Codex execution</span>
                <strong>App-local model overrides</strong>
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
                <span>Source</span>
                <strong>{codexSettings?.source ?? 'default'}</strong>
              </div>
            </div>
          </section>

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
                <span>Codex auth</span>
                <strong>{system?.auth.codexAuth ?? 'Local CLI session'}</strong>
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
