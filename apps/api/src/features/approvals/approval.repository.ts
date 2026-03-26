import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';

interface RecordApprovalInput {
  workspaceId?: string | null;
  conversationSessionId?: string | null;
  taskTitle: string;
  taskSummary: string;
  approved: boolean;
}

export class ApprovalRepository {
  async recordDecision(input: RecordApprovalInput) {
    if (!isDatabaseConfigured()) {
      return;
    }

    const pool = getDatabasePool();
    await pool.query(
      `
        INSERT INTO approval_events (workspace_id, conversation_session_id, task_title, task_summary, approved)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        input.workspaceId ?? null,
        input.conversationSessionId ?? null,
        input.taskTitle,
        input.taskSummary,
        input.approved
      ]
    );
  }

  async findWorkspaceIdByRootPath(rootPath: string) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const pool = getDatabasePool();
    const result = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM workspaces
        WHERE root_path = $1
        LIMIT 1
      `,
      [rootPath]
    );

    return result.rows[0]?.id ?? null;
  }

  async listRecent(limit = 20) {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const pool = getDatabasePool();
    const result = await pool.query<{
      id: string;
      workspace_id: string | null;
      conversation_session_id: string | null;
      task_title: string;
      task_summary: string;
      approved: boolean;
      reviewed_at: Date;
    }>(
      `
        SELECT id, workspace_id, conversation_session_id, task_title, task_summary, approved, reviewed_at
        FROM approval_events
        ORDER BY reviewed_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      conversationSessionId: row.conversation_session_id,
      taskTitle: row.task_title,
      taskSummary: row.task_summary,
      approved: row.approved,
      reviewedAt: row.reviewed_at.toISOString()
    }));
  }
}
