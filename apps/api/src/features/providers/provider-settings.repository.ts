import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';
import { logger } from '../../lib/logger.js';
import type { AssistantProviderId } from '../../types.js';

export interface ProviderConnectionRecord {
  connected: boolean;
  connectedAt: string | null;
}

export interface ProviderConnectionState {
  activeProviderId: AssistantProviderId | null;
  connections: Record<AssistantProviderId, ProviderConnectionRecord>;
}

const preferenceKey = 'assistant.providers';
let inMemoryFallback: ProviderConnectionState = getDefaultState();

export class ProviderSettingsRepository {
  async get(): Promise<ProviderConnectionState> {
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

      return normalizeState(result.rows[0]?.value);
    } catch (error) {
      if (isMissingPreferencesTableError(error)) {
        logger.warn('assistant.provider.preferences_table_missing', {
          table: 'app_preferences'
        });
        return inMemoryFallback;
      }

      throw error;
    }
  }

  async save(state: ProviderConnectionState) {
    if (!isDatabaseConfigured()) {
      inMemoryFallback = normalizeState(state);
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
        [preferenceKey, JSON.stringify(normalizeState(state))]
      );
    } catch (error) {
      if (isMissingPreferencesTableError(error)) {
        logger.warn('assistant.provider.preferences_table_missing_on_save', {
          table: 'app_preferences'
        });
        inMemoryFallback = normalizeState(state);
        return;
      }

      throw error;
    }
  }
}

function getDefaultState(): ProviderConnectionState {
  return {
    activeProviderId: null,
    connections: {
      codex: {
        connected: false,
        connectedAt: null
      },
      claude: {
        connected: false,
        connectedAt: null
      }
    }
  };
}

function normalizeProviderId(value: unknown): AssistantProviderId | null {
  return value === 'codex' || value === 'claude' ? value : null;
}

function normalizeConnectionRecord(value: unknown): ProviderConnectionRecord {
  return {
    connected: Boolean(value && typeof value === 'object' && 'connected' in value && value.connected === true),
    connectedAt:
      value && typeof value === 'object' && 'connectedAt' in value && typeof value.connectedAt === 'string'
        ? value.connectedAt
        : null
  };
}

function normalizeState(value: unknown): ProviderConnectionState {
  const defaultState = getDefaultState();

  if (!value || typeof value !== 'object') {
    return defaultState;
  }

  const legacyActiveProvider = 'activeProvider' in value ? normalizeProviderId(value.activeProvider) : null;
  const activeProviderId =
    ('activeProviderId' in value ? normalizeProviderId(value.activeProviderId) : null) ?? legacyActiveProvider;
  const connectionsValue =
    'connections' in value && value.connections && typeof value.connections === 'object'
      ? value.connections
      : {};

  const normalized: ProviderConnectionState = {
    activeProviderId,
    connections: {
      codex: normalizeConnectionRecord((connectionsValue as Record<string, unknown>).codex),
      claude: normalizeConnectionRecord((connectionsValue as Record<string, unknown>).claude)
    }
  };

  if (legacyActiveProvider && !normalized.connections[legacyActiveProvider].connected) {
    normalized.connections[legacyActiveProvider] = {
      connected: true,
      connectedAt: null
    };
  }

  if (normalized.activeProviderId && !normalized.connections[normalized.activeProviderId].connected) {
    normalized.activeProviderId = null;
  }

  return normalized;
}

function isMissingPreferencesTableError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42P01');
}
