import os from 'node:os';
import { UserRepository } from './user.repository.js';

export interface AppOperator {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

function sanitizeIdentifier(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export class UserService {
  constructor(private readonly repository: UserRepository = new UserRepository()) {}

  async initializeLocalOperator(): Promise<AppOperator | null> {
    const systemUsername = process.env.USER?.trim() || os.userInfo().username.trim() || 'operator';
    const displayName = process.env.USER_NAME?.trim() || systemUsername;
    const email = `local+${sanitizeIdentifier(systemUsername)}@voice-codex.local`;

    return this.repository.upsertLocalOperator({
      email,
      displayName
    });
  }
}
