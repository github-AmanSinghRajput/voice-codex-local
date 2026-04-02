import { isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';

const resetStatements = [
  'DELETE FROM note_chunks',
  'DELETE FROM notes',
  'DELETE FROM approval_events',
  'DELETE FROM conversation_messages',
  'DELETE FROM conversation_sessions',
  'DELETE FROM app_sessions',
  'DELETE FROM workspaces',
  'DELETE FROM app_preferences'
] as const;

export class AppResetService {
  async resetPersistedData() {
    if (!isDatabaseConfigured()) {
      return;
    }

    await withTransaction(async (client) => {
      for (const statement of resetStatements) {
        try {
          await client.query(statement);
        } catch (error) {
          if (isMissingRelationError(error)) {
            continue;
          }

          throw error;
        }
      }
    });
  }
}

function isMissingRelationError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42P01');
}
