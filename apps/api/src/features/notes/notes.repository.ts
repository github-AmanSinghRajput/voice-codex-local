import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';

interface CreateNoteInput {
  title: string;
  body: string;
  source?: string;
  workspaceId?: string | null;
  ownerUserId?: string | null;
  chunks?: string[];
}

interface UpdateNoteInput {
  title: string;
  body: string;
  source?: string;
  chunks?: string[];
}

export class NotesRepository {
  async createNote(input: CreateNoteInput) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    return withTransaction(async (client) => {
      const noteResult = await client.query<{ id: string }>(
        `
          INSERT INTO notes (owner_user_id, workspace_id, title, body, source)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          input.ownerUserId ?? null,
          input.workspaceId ?? null,
          input.title,
          input.body,
          input.source ?? 'meeting'
        ]
      );

      const noteId = noteResult.rows[0].id;
      const chunks = input.chunks ?? [];

      for (const [index, chunk] of chunks.entries()) {
        await client.query(
          `
            INSERT INTO note_chunks (note_id, chunk_index, content)
            VALUES ($1, $2, $3)
          `,
          [noteId, index, chunk]
        );
      }

      return {
        id: noteId
      };
    });
  }

  async listRecentNotes(limit = 20) {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const pool = getDatabasePool();
    const result = await pool.query<{
      id: string;
      title: string;
      body: string;
      source: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        SELECT id, title, body, source, created_at, updated_at
        FROM notes
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      source: row.source,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  async updateNote(noteId: string, input: UpdateNoteInput) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    return withTransaction(async (client) => {
      const noteResult = await client.query<{ id: string }>(
        `
          UPDATE notes
          SET title = $2,
              body = $3,
              source = $4,
              updated_at = NOW()
          WHERE id = $1
          RETURNING id
        `,
        [noteId, input.title, input.body, input.source ?? 'meeting']
      );

      if (!noteResult.rows[0]?.id) {
        return null;
      }

      await client.query('DELETE FROM note_chunks WHERE note_id = $1', [noteId]);

      for (const [index, chunk] of (input.chunks ?? []).entries()) {
        await client.query(
          `
            INSERT INTO note_chunks (note_id, chunk_index, content)
            VALUES ($1, $2, $3)
          `,
          [noteId, index, chunk]
        );
      }

      return {
        id: noteId
      };
    });
  }

  async deleteNote(noteId: string) {
    if (!isDatabaseConfigured()) {
      return false;
    }

    const pool = getDatabasePool();
    const result = await pool.query(
      `
        DELETE FROM notes
        WHERE id = $1
      `,
      [noteId]
    );

    return (result.rowCount ?? 0) > 0;
  }
}
