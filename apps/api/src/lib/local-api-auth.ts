import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRootDir } from '../store.js';

const tokenFileName = '.local-api-auth-token';

export const localApiAuthHeader = 'x-vocod-local-auth';

export function getLocalApiTokenFilePath() {
  return path.join(getRootDir(), tokenFileName);
}

export async function resolveLocalApiAuthToken(explicitToken?: string | null) {
  const normalized = explicitToken?.trim();
  if (normalized) {
    return normalized;
  }

  const tokenFilePath = getLocalApiTokenFilePath();
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

export function matchesLocalApiAuthToken(
  candidate: string | null | undefined,
  expectedToken: string
) {
  if (!candidate?.trim()) {
    return false;
  }

  const received = Buffer.from(candidate.trim());
  const expected = Buffer.from(expectedToken);
  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, expected);
}
