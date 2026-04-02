export class BaseApiService {
  constructor(
    protected readonly baseUrl: string,
    private readonly apiAuthToken: string | null = null
  ) {}

  protected createHeaders(headers?: HeadersInit) {
    const nextHeaders = new Headers(headers);
    if (this.apiAuthToken) {
      nextHeaders.set('x-vocod-local-auth', this.apiAuthToken);
    }
    return nextHeaders;
  }

  protected async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.createHeaders(init?.headers)
    });
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
