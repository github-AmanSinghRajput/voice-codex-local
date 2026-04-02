import type { ClaudeModelOption, ClaudeSettings } from '../../types.js';
import { ClaudeSettingsRepository } from './claude-settings.repository.js';

export interface ClaudeSettingsPayload {
  settings: ClaudeSettings;
  source: 'app' | 'default';
  options: {
    models: ClaudeModelOption[];
  };
}

const knownClaudeModels: ClaudeModelOption[] = [
  {
    slug: 'default',
    displayName: 'Default',
    description: 'Uses the model Claude Code recommends for this account.',
    suggestedForDiscussion: false
  },
  {
    slug: 'haiku',
    displayName: 'Haiku',
    description: 'Fast and lower-cost for lightweight discussion, planning, and quick questions.',
    suggestedForDiscussion: true
  },
  {
    slug: 'sonnet',
    displayName: 'Sonnet',
    description: 'Best daily coding balance for edits, review, and general development work.',
    suggestedForDiscussion: false
  },
  {
    slug: 'sonnet[1m]',
    displayName: 'Sonnet 1M',
    description: 'Best for long sessions and large-context codebases.',
    suggestedForDiscussion: false
  },
  {
    slug: 'opus',
    displayName: 'Opus',
    description: 'Highest reasoning depth for harder technical problems and tricky refactors.',
    suggestedForDiscussion: false
  }
] as const;

export class ClaudeSettingsService {
  constructor(private readonly repository: ClaudeSettingsRepository = new ClaudeSettingsRepository()) {}

  async getSettings(): Promise<ClaudeSettingsPayload> {
    const appSettings = await this.repository.get();
    const settings = sanitizeClaudeSettings(appSettings);
    return {
      settings,
      source: appSettings?.model ? 'app' : 'default',
      options: {
        models: [...knownClaudeModels]
      }
    };
  }

  async updateSettings(input: Partial<ClaudeSettings>): Promise<ClaudeSettingsPayload> {
    const current = await this.getSettings();
    const nextSettings = sanitizeClaudeSettings({
      ...current.settings,
      ...input
    });
    await this.repository.save(nextSettings);

    return {
      settings: nextSettings,
      source: 'app',
      options: current.options
    };
  }

  async getExecutionOverrides(): Promise<ClaudeSettings> {
    const payload = await this.getSettings();
    return payload.settings;
  }
}

function sanitizeClaudeSettings(input: Partial<ClaudeSettings> | null | undefined): ClaudeSettings {
  const model = typeof input?.model === 'string' ? input.model.trim() : '';
  return {
    model: model || null
  };
}
