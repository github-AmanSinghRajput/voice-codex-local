import { AuthRepository } from './auth.repository.js';
import type { AppOperator } from '../users/user.service.js';

interface ProviderStatusSnapshot {
  loggedIn: boolean;
  authMode: string | null;
}

export class AuthService {
  constructor(private readonly repository: AuthRepository = new AuthRepository()) {}

  private lastProviderSnapshots = new Map<string, string>();
  private operator: AppOperator | null = null;

  setOperator(operator: AppOperator | null) {
    this.operator = operator;
  }

  async syncCliSession(provider: 'codex' | 'claude', status: ProviderStatusSnapshot) {
    const snapshot = JSON.stringify({
      loggedIn: status.loggedIn,
      authMode: status.authMode ?? null
    });
    const sessionProvider = provider === 'claude' ? 'claude_cli' : 'codex_cli';

    if (snapshot === this.lastProviderSnapshots.get(sessionProvider)) {
      return;
    }

    if (!status.loggedIn) {
      await this.repository.clearProviderSession(sessionProvider);
      this.lastProviderSnapshots.set(sessionProvider, snapshot);
      return;
    }

    await this.repository.replaceProviderSession({
      userId: this.operator?.id ?? null,
      provider: sessionProvider,
      providerSubject: status.authMode ?? 'configured',
      accessScope: ['voice_chat', 'workspace_review']
    });
    this.lastProviderSnapshots.set(sessionProvider, snapshot);
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
      note: 'CLI provider auth and future app auth should remain separate concerns.'
    };
  }
}
