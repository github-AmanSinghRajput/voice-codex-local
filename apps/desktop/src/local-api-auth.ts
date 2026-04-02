import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tokenFilePath = path.join(__dirname, '../../../.local-api-auth-token');

export async function resolveLocalApiAuthToken(explicitToken?: string | null) {
  const normalized = explicitToken?.trim();
  if (normalized) {
    return normalized;
  }

  try {
    const existing = (await fs.readFile(tokenFilePath, 'utf8')).trim();
    if (existing) {
      return existing;
    }
  } catch {
    // Generate a new token below.
  }

  const nextToken = crypto.randomBytes(32).toString('hex');
  await fs.writeFile(tokenFilePath, `${nextToken}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  return nextToken;
}
