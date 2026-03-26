import { AuthRepository } from './auth.repository.js';
import type { AppOperator } from '../users/user.service.js';

interface CodexStatusSnapshot {
  loggedIn: boolean;
  authMode: string | null;
}

export class AuthService {
  constructor(private readonly repository: AuthRepository = new AuthRepository()) {}

  private lastCodexSnapshot: string | null = null;
  private operator: AppOperator | null = null;

  setOperator(operator: AppOperator | null) {
    this.operator = operator;
  }

  async syncCodexCliSession(status: CodexStatusSnapshot) {
    const snapshot = JSON.stringify({
      loggedIn: status.loggedIn,
      authMode: status.authMode ?? null
    });

    if (snapshot === this.lastCodexSnapshot) {
      return;
    }

    if (!status.loggedIn) {
      await this.repository.clearProviderSession('codex_cli');
      this.lastCodexSnapshot = snapshot;
      return;
    }

    await this.repository.replaceProviderSession({
      userId: this.operator?.id ?? null,
      provider: 'codex_cli',
      providerSubject: status.authMode ?? 'configured',
      accessScope: ['voice_chat', 'workspace_review']
    });
    this.lastCodexSnapshot = snapshot;
  }

  async listTrackedSessions(limit = 10) {
    return this.repository.listSessions(limit);
  }

  async getStatus() {
    const sessions = await this.listTrackedSessions(5);

    return {
      operator: this.operator,
      codexAuth: 'local_cli_session',
      productAuth: 'planned_google_oauth_for_notes',
      trackedSessions: sessions,
      note: 'Codex auth and future app auth should remain separate concerns.'
    };
  }
}
