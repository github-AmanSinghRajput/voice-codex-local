import type { AssistantProviderId } from '../../types.js';
import type { ProviderConnectionState } from './provider-settings.repository.js';
import { ProviderSettingsRepository } from './provider-settings.repository.js';

export class ProviderSettingsService {
  constructor(private readonly repository: ProviderSettingsRepository = new ProviderSettingsRepository()) {}

  getState() {
    return this.repository.get();
  }

  async connectProvider(providerId: AssistantProviderId) {
    const current = await this.repository.get();
    const next: ProviderConnectionState = {
      ...current,
      activeProviderId: current.activeProviderId ?? providerId,
      connections: {
        ...current.connections,
        [providerId]: {
          connected: true,
          connectedAt: new Date().toISOString()
        }
      }
    };
    await this.repository.save(next);
    return next;
  }

  async disconnectProvider(providerId: AssistantProviderId) {
    const current = await this.repository.get();
    const next: ProviderConnectionState = {
      ...current,
      activeProviderId: current.activeProviderId === providerId ? null : current.activeProviderId,
      connections: {
        ...current.connections,
        [providerId]: {
          connected: false,
          connectedAt: null
        }
      }
    };
    await this.repository.save(next);
    return next;
  }

  async setActiveProviderPreference(providerId: AssistantProviderId | null) {
    const current = await this.repository.get();
    const next: ProviderConnectionState = {
      ...current,
      activeProviderId: providerId
    };
    await this.repository.save(next);
    return providerId;
  }
}
