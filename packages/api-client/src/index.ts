export type ApiClientOptions = {
  baseUrl: string;
  /** When set, requests send a bearer token and do not use cookies. */
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
};

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public body: {
      code?: string;
      messageKey?: string;
      fields?: { path: string; messageKey: string }[];
      traceId?: string;
    },
  ) {
    super(body.messageKey ?? 'errors.generic');
  }
}

export function createApiClient(options: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const token = options.getAccessToken?.() ?? null;
    headers.set('x-sahana-client', token ? 'mobile' : 'web');
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${options.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: token ? 'omit' : 'include',
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as ApiClientError['body']) : {};
    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized?.();
      throw new ApiClientError(response.status, body);
    }
    return body as T;
  }

  return { request };
}
