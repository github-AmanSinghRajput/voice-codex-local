import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';
import { logger } from '../../lib/logger.js';
import type { AppSettings, AppTheme } from '../../types.js';

const preferenceKey = 'app.settings';
let inMemoryFallback: AppSettings = getDefaultSettings();

export class AppSettingsRepository {
  async get(): Promise<AppSettings> {
    if (!isDatabaseConfigured()) {
      return inMemoryFallback;
    }

    try {
      const pool = getDatabasePool();
      const result = await pool.query<{ value: Record<string, unknown> }>(
        `
          SELECT value
          FROM app_preferences
          WHERE preference_key = $1
        `,
        [preferenceKey]
      );

      return normalizeAppSettings(result.rows[0]?.value);
    } catch (error) {
      if (isMissingPreferencesTableError(error)) {
        logger.warn('app.settings.preferences_table_missing', {
          table: 'app_preferences'
        });
        return inMemoryFallback;
      }

      throw error;
    }
  }

  async save(settings: AppSettings) {
    const normalized = normalizeAppSettings(settings);
    if (!isDatabaseConfigured()) {
      inMemoryFallback = normalized;
      return;
    }

    try {
      const pool = getDatabasePool();
      await pool.query(
        `
          INSERT INTO app_preferences (preference_key, value, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (preference_key)
          DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW()
        `,
        [preferenceKey, JSON.stringify(normalized)]
      );
    } catch (error) {
      if (isMissingPreferencesTableError(error)) {
        logger.warn('app.settings.preferences_table_missing_on_save', {
          table: 'app_preferences'
        });
        inMemoryFallback = normalized;
        return;
      }

      throw error;
    }
  }
}

function getDefaultSettings(): AppSettings {
  return {
    displayName: null,
    theme: 'dark',
    welcomedAt: null
  };
}

function normalizeTheme(value: unknown): AppTheme {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeDisplayName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 48) : null;
}

function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') {
    return getDefaultSettings();
  }

  const record = value as Record<string, unknown>;
  return {
    displayName: normalizeDisplayName(record.displayName),
    theme: normalizeTheme(record.theme),
    welcomedAt: typeof record.welcomedAt === 'string' ? record.welcomedAt : null
  };
}

function isMissingPreferencesTableError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42P01');
}
