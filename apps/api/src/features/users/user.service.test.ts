import test from 'node:test';
import assert from 'node:assert/strict';
import { UserService } from './user.service.js';

class UserRepositoryStub {
  input: { email: string; displayName: string } | null = null;

  async upsertLocalOperator(input: { email: string; displayName: string }) {
    this.input = input;

    return {
      id: 'user-1',
      email: input.email,
      displayName: input.displayName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

test('UserService creates a local operator identity from system user context', async () => {
  const previousUser = process.env.USER;
  const previousUserName = process.env.USER_NAME;
  process.env.USER = 'Aman Singh';
  process.env.USER_NAME = 'Aman';

  try {
    const repository = new UserRepositoryStub();
    const service = new UserService(repository as never);

    const operator = await service.initializeLocalOperator();

    assert.equal(operator?.email, 'local+aman-singh@voice-codex.local');
    assert.equal(operator?.displayName, 'Aman');
    assert.deepEqual(repository.input, {
      email: 'local+aman-singh@voice-codex.local',
      displayName: 'Aman'
    });
  } finally {
    process.env.USER = previousUser;
    process.env.USER_NAME = previousUserName;
  }
});
