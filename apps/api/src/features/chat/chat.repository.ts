import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';
import { getWorkspaceState } from '../../runtime.js';
import type { ChatMessage } from '../../types.js';

interface PersistedSession {
  id: string;
  workspaceId: string | null;
}

export class ChatRepository {
  private session: PersistedSession | null = null;

  async listRecentMessages(limit = 120): Promise<ChatMessage[]> {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const pool = getDatabasePool();
    const session = await this.resolveSession();
    if (!session) {
      return [];
    }

    const result = await pool.query<{
      id: string;
      role: ChatMessage['role'];
      source: ChatMessage['source'];
      content: string;
      created_at: Date;
    }>(
      `
        SELECT id, role, source, content, created_at
        FROM conversation_messages
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [session.id, limit]
    );

    return result.rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      source: row.source,
      text: row.content,
      createdAt: row.created_at.toISOString()
    }));
  }

  async appendMessages(messages: ChatMessage[]) {
    if (!isDatabaseConfigured() || messages.length === 0) {
      return;
    }

    const session = await this.ensureSession();
    await withTransaction(async (client) => {
      for (const message of messages) {
        await client.query(
          `
            INSERT INTO conversation_messages (id, session_id, role, source, content, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [message.id, session.id, message.role, message.source, message.text, message.createdAt]
        );
      }
    });
  }

  async clearMessages() {
    if (!isDatabaseConfigured()) {
      return;
    }

    const pool = getDatabasePool();
    const session = await this.resolveSession();
    if (!session) {
      return;
    }

    await withTransaction(async (client) => {
      await client.query('DELETE FROM conversation_messages WHERE session_id = $1', [session.id]);
      await client.query('DELETE FROM conversation_sessions WHERE id = $1', [session.id]);
    });

    this.session = null;
  }

  async getActiveSessionId() {
    const session = await this.resolveSession();
    return session?.id ?? null;
  }

  private async ensureSession() {
    if (this.session) {
      const workspaceId = getWorkspaceState().id ?? null;
      if (this.session.workspaceId === workspaceId) {
        return this.session;
      }
    }

    const pool = getDatabasePool();
    const workspaceId = getWorkspaceState().id ?? null;
    const result = await pool.query<{ id: string }>(
      `
        INSERT INTO conversation_sessions (workspace_id)
        VALUES ($1)
        RETURNING id
      `
      ,
      [workspaceId]
    );

    this.session = {
      id: result.rows[0].id,
      workspaceId
    };

    return this.session;
  }

  private async resolveSession() {
    if (this.session) {
      return this.session;
    }

    const pool = getDatabasePool();
    const result = await pool.query<{ id: string }>(
      `
        SELECT id, workspace_id
        FROM conversation_sessions
        WHERE workspace_id IS NOT DISTINCT FROM $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [getWorkspaceState().id ?? null]
    );

    if (result.rowCount === 0) {
      return null;
    }

    this.session = {
      id: result.rows[0].id,
      workspaceId: getWorkspaceState().id ?? null
    };

    return this.session;
  }
}
