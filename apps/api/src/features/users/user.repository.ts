import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';

interface UserRecord {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export class UserRepository {
  async upsertLocalOperator(input: { email: string; displayName: string }) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const pool = getDatabasePool();
    const result = await pool.query<{
      id: string;
      email: string | null;
      display_name: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        INSERT INTO app_users (email, display_name)
        VALUES ($1, $2)
        ON CONFLICT (email)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          updated_at = NOW()
        RETURNING id, email, display_name, created_at, updated_at
      `,
      [input.email, input.displayName]
    );

    return this.toRecord(result.rows[0] ?? null);
  }

  private toRecord(
    row:
      | {
          id: string;
          email: string | null;
          display_name: string | null;
          created_at: Date;
          updated_at: Date;
        }
      | null
  ): UserRecord | null {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }
}
