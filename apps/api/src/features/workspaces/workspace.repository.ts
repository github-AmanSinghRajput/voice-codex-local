import { getDatabasePool, isDatabaseConfigured } from '../../db/client.js';

interface PersistWorkspaceInput {
  name: string;
  rootPath: string;
  writeAccessEnabled: boolean;
}

export class WorkspaceRepository {
  async upsertWorkspace(input: PersistWorkspaceInput) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const pool = getDatabasePool();
    const existing = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM workspaces
        WHERE root_path = $1
        LIMIT 1
      `,
      [input.rootPath]
    );

    if (existing.rowCount && existing.rows[0]) {
      const result = await pool.query<{
        id: string;
        name: string;
        root_path: string;
        write_access_enabled: boolean;
        updated_at: Date;
      }>(
        `
          UPDATE workspaces
          SET name = $2,
              write_access_enabled = $3,
              updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, root_path, write_access_enabled, updated_at
        `,
        [existing.rows[0].id, input.name, input.writeAccessEnabled]
      );

      return result.rows[0] ?? null;
    }

    const result = await pool.query<{
      id: string;
      name: string;
      root_path: string;
      write_access_enabled: boolean;
      updated_at: Date;
    }>(
      `
        INSERT INTO workspaces (name, root_path, write_access_enabled)
        VALUES ($1, $2, $3)
        RETURNING id, name, root_path, write_access_enabled, updated_at
      `,
      [input.name, input.rootPath, input.writeAccessEnabled]
    );

    return result.rows[0] ?? null;
  }

  async findLatestWorkspace() {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const pool = getDatabasePool();
    const result = await pool.query<{
      id: string;
      name: string;
      root_path: string;
      write_access_enabled: boolean;
      updated_at: Date;
    }>(
      `
        SELECT id, name, root_path, write_access_enabled, updated_at
        FROM workspaces
        ORDER BY updated_at DESC
        LIMIT 1
      `
    );

    return result.rows[0] ?? null;
  }

  async findByRootPath(rootPath: string) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const pool = getDatabasePool();
    const result = await pool.query<{
      id: string;
      name: string;
      root_path: string;
      write_access_enabled: boolean;
      updated_at: Date;
    }>(
      `
        SELECT id, name, root_path, write_access_enabled, updated_at
        FROM workspaces
        WHERE root_path = $1
        LIMIT 1
      `,
      [rootPath]
    );

    return result.rows[0] ?? null;
  }
}
