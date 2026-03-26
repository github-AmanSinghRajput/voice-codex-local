export class BaseApiService {
  constructor(protected readonly baseUrl: string) {}

  protected async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const body = (await response.json()) as {
      error?: string;
      code?: string;
      details?: unknown;
    };

    if (!response.ok) {
      const details =
        body.details && typeof body.details === 'object'
          ? JSON.stringify(body.details)
          : typeof body.details === 'string'
            ? body.details
            : '';
      throw new Error(
        [body.error ?? 'Request failed.', details].filter(Boolean).join(' ')
      );
    }

    return body as T;
  }
}
