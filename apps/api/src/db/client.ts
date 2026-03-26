import { Pool } from 'pg';
import { env } from '../config/env.js';

let pool: Pool | null = null;

function createPool() {
  return new Pool({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

export function isDatabaseConfigured() {
  return Boolean(env.databaseUrl);
}

export function getDatabasePool() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function checkDatabaseConnection() {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      reachable: false,
      message: 'DATABASE_URL is not configured.'
    };
  }

  try {
    const client = await getDatabasePool().connect();
    try {
      await client.query('select 1');
      return {
        configured: true,
        reachable: true,
        message: 'Postgres connection healthy.'
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      message: error instanceof Error ? error.message : 'Postgres connection failed.'
    };
  }
}

export async function closeDatabasePool() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}
