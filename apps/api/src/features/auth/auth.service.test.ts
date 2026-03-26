import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from './auth.service.js';

class AuthRepositoryStub {
  clearCalls: string[] = [];
  replaceCalls: Array<{
    userId?: string | null;
    provider: string;
    providerSubject?: string | null;
    accessScope?: string[];
  }> = [];

  async replaceProviderSession(input: {
    userId?: string | null;
    provider: string;
    providerSubject?: string | null;
    accessScope?: string[];
  }) {
    this.replaceCalls.push(input);
  }

  async clearProviderSession(provider: string) {
    this.clearCalls.push(provider);
  }

  async listSessions() {
    return [];
  }
}

test('AuthService syncs codex session once per unique snapshot', async () => {
  const repository = new AuthRepositoryStub();
  const service = new AuthService(repository as never);

  service.setOperator({
    id: 'user-1',
    email: 'local@example.test',
    displayName: 'Aman',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await service.syncCodexCliSession({
    loggedIn: true,
    authMode: 'ChatGPT'
  });

  await service.syncCodexCliSession({
    loggedIn: true,
    authMode: 'ChatGPT'
  });

  assert.equal(repository.replaceCalls.length, 1);
  assert.equal(repository.replaceCalls[0]?.provider, 'codex_cli');
  assert.equal(repository.replaceCalls[0]?.userId, 'user-1');
});

test('AuthService clears codex session when logged out', async () => {
  const repository = new AuthRepositoryStub();
  const service = new AuthService(repository as never);

  await service.syncCodexCliSession({
    loggedIn: false,
    authMode: null
  });

  assert.deepEqual(repository.clearCalls, ['codex_cli']);
});
