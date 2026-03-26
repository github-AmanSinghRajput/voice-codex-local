import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';

interface ReplaceSessionInput {
  userId?: string | null;
  provider: string;
  providerSubject?: string | null;
  accessScope?: string[];
}

export class AuthRepository {
  async replaceProviderSession(input: ReplaceSessionInput) {
    if (!isDatabaseConfigured()) {
      return;
    }

    const pool = getDatabasePool();
    await pool.query('DELETE FROM app_sessions WHERE provider = $1', [input.provider]);
    await pool.query(
      `
        INSERT INTO app_sessions (user_id, provider, provider_subject, access_scope)
        VALUES ($1, $2, $3, $4)
      `,
      [input.userId ?? null, input.provider, input.providerSubject ?? null, input.accessScope ?? []]
    );
  }

  async clearProviderSession(provider: string) {
    if (!isDatabaseConfigured()) {
      return;
    }

    const pool = getDatabasePool();
    await pool.query('DELETE FROM app_sessions WHERE provider = $1', [provider]);
  }

  async listSessions(limit = 10) {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const pool = getDatabasePool();
    const result = await pool.query<{
      id: string;
      provider: string;
      provider_subject: string | null;
      access_scope: string[] | null;
      created_at: Date;
      expires_at: Date | null;
    }>(
      `
        SELECT id, provider, provider_subject, access_scope, created_at, expires_at
        FROM app_sessions
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      providerSubject: row.provider_subject,
      accessScope: row.access_scope ?? [],
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at?.toISOString() ?? null
    }));
  }
}
