import type { AppSettings } from '../../types.js';
import { AppSettingsRepository } from './app-settings.repository.js';

export class AppSettingsService {
  private readonly repository = new AppSettingsRepository();

  async getSettings() {
    return this.repository.get();
  }

  async updateSettings(input: Partial<AppSettings>) {
    const current = await this.repository.get();
    const next = sanitizeAppSettings({
      ...current,
      ...input
    });
    await this.repository.save(next);
    return next;
  }
}

function sanitizeAppSettings(input: Partial<AppSettings>): AppSettings {
  const trimmedName =
    typeof input.displayName === 'string' ? input.displayName.trim().slice(0, 48) : null;

  return {
    displayName: trimmedName || null,
    theme: input.theme === 'light' ? 'light' : 'dark',
    welcomedAt: typeof input.welcomedAt === 'string' && input.welcomedAt.trim() ? input.welcomedAt : null
  };
}
