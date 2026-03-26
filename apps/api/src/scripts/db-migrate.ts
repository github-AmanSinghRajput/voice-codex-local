import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '../config/env.js';
import { getRootDir } from '../store.js';

const execFileAsync = promisify(execFile);

async function run() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const migrationsDir = path.join(getRootDir(), 'apps/api/database/postgres');
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const migrationFile = path.join(migrationsDir, file);
    await execFileAsync('psql', [env.databaseUrl, '-f', migrationFile], {
      cwd: getRootDir(),
      env: process.env,
      maxBuffer: 1024 * 1024 * 8
    });
  }
}

void run();
