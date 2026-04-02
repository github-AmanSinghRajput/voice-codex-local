import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';
import { logger } from '../../lib/logger.js';
import type { ClaudeSettings } from '../../types.js';

const preferenceKey = 'claude.settings';
let inMemoryFallback: ClaudeSettings | null = null;

export class ClaudeSettingsRepository {
  async get(): Promise<Partial<ClaudeSettings> | null> {
    if (!isDatabaseConfigured()) {
      return inMemoryFallback;
    }

    try {
      const pool = getDatabasePool();
      const result = await pool.query<{ value: Partial<ClaudeSettings> }>(
        `
          SELECT value
          FROM app_preferences
          WHERE preference_key = $1
        `,
        [preferenceKey]
      );

      return result.rows[0]?.value ?? null;
    } catch (error) {
      if (isMissingPreferencesTableError(error)) {
        logger.warn('claude.settings.preferences_table_missing', {
          table: 'app_preferences'
        });
        return null;
      }

      throw error;
    }
  }

  async save(settings: ClaudeSettings) {
    if (!isDatabaseConfigured()) {
      inMemoryFallback = settings;
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
        [preferenceKey, JSON.stringify(settings)]
      );
    } catch (error) {
      if (isMissingPreferencesTableError(error)) {
        logger.warn('claude.settings.preferences_table_missing_on_save', {
          table: 'app_preferences'
        });
        return;
      }

      throw error;
    }
  }
}

function isMissingPreferencesTableError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42P01');
}
