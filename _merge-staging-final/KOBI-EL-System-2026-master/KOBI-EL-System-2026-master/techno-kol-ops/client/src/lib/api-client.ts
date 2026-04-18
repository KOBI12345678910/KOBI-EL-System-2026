/**
 * Centralized API client for techno-kol-ops.
 *
 * Features:
 * - Base URL from VITE_API_URL (fallback: current origin, then http://localhost:5000)
 * - API key from VITE_API_KEY or localStorage('tk_api_key')
 * - JWT bearer token from localStorage('tk_token')
 * - 401 response -> clears credentials and reloads the page
 * - 429 response -> shows a toast and resolves with a typed ApiRateLimitError
 * - Exponential backoff retry on transient network errors
 * - Typed error handling via ApiError subclasses
 *
 * Usage:
 *   import { api } from '@/lib/api-client';
 *   const orders = await api<WorkOrder[]>('/api/work-orders');
 *   await api('/api/orders', { method: 'POST', body: { clientId: '1' } });
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  /** Request body. Objects are JSON-serialized automatically. */
  body?: unknown;
  /** Extra headers merged onto the defaults. */
  headers?: Record<string, string>;
  /** Disable automatic auth header injection. Defaults to false. */
  skipAuth?: boolean;
  /** Disable automatic API-key header injection. Defaults to false. */
  skipApiKey?: boolean;
  /** Number of retry attempts on network failure. Defaults to 2. */
  retries?: number;
  /** Request timeout in ms. Defaults to 30_000. */
  timeoutMs?: number;
  /** Parse the response as this type. Defaults to 'json'. */
  responseType?: 'json' | 'text' | 'blob' | 'none';
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  url: string;

  constructor(message: string, status: number, url: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.data = data;
  }
}

export class ApiNetworkError extends ApiError {
  constructor(url: string, cause?: unknown) {
    super('Network error contacting API', 0, url, cause);
    this.name = 'ApiNetworkError';
  }
}

export class ApiTimeoutError extends ApiError {
  constructor(url: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, 0, url);
    this.name = 'ApiTimeoutError';
  }
}

export class ApiUnauthorizedError extends ApiError {
  constructor(url: string, data?: unknown) {
    super('Unauthorized — credentials cleared', 401, url, data);
    this.name = 'ApiUnauthorizedError';
  }
}

export class ApiRateLimitError extends ApiError {
  retryAfterMs: number;
  constructor(url: string, retryAfterMs: number, data?: unknown) {
    super(`Rate limited — retry in ${Math.round(retryAfterMs / 1000)}s`, 429, url, data);
    this.name = 'ApiRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

function getBaseUrl(): string {
  // Vite: import.meta.env.VITE_API_URL
  const fromEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) as
    | string
    | undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, '');
  // Fall back to window origin in browser, or local dev server
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:5000';
}

function getApiKey(): string | null {
  const fromEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_KEY) as
    | string
    | undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('tk_api_key');
  }
  return null;
}

function getAuthToken(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('tk_token');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Toast (soft dependency — no imports required)                       */
/* ------------------------------------------------------------------ */

type ToastLevel = 'info' | 'warning' | 'error';

function showToast(level: ToastLevel, message: string): void {
  try {
    // Dispatch a CustomEvent that any toast component (e.g. RealtimeToast) can subscribe to.
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tk:toast', { detail: { level, message, ts: Date.now() } })
      );
    }
  } catch {
    /* no-op — toast is best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* Credential helpers                                                  */
/* ------------------------------------------------------------------ */

function clearCredentialsAndReload(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('tk_token');
      localStorage.removeItem('tk_user');
      localStorage.removeItem('tk_api_key');
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    // Use location.reload instead of pushing a new URL so the app reboots cleanly.
    window.location.reload();
  }
}

/* ------------------------------------------------------------------ */
/* Core request                                                        */
/* ------------------------------------------------------------------ */

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

function parseRetryAfter(headerValue: string | null): number {
  if (!headerValue) return 5_000;
  const asNumber = Number(headerValue);
  if (!Number.isNaN(asNumber)) return Math.max(1000, asNumber * 1000);
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) return Math.max(1000, asDate - Date.now());
  return 5_000;
}

async function parseResponse<T>(
  res: Response,
  responseType: ApiRequestOptions['responseType']
): Promise<T> {
  switch (responseType) {
    case 'text':
      return (await res.text()) as unknown as T;
    case 'blob':
      return (await res.blob()) as unknown as T;
    case 'none':
      return undefined as unknown as T;
    case 'json':
    default: {
      const text = await res.text();
      if (!text) return undefined as unknown as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }
  }
}

/**
 * Main API function. Returns parsed body, or throws an ApiError subclass.
 *
 * @example
 *   const user = await api<User>('/api/me');
 *   await api('/api/orders', { method: 'POST', body: { clientId: 1 } });
 */
export async function api<T = unknown>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    body,
    headers = {},
    skipAuth = false,
    skipApiKey = false,
    retries = DEFAULT_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseType = 'json',
    method,
    ...rest
  } = options;

  const url = buildUrl(path);

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  // API key
  if (!skipApiKey) {
    const apiKey = getApiKey();
    if (apiKey) finalHeaders['X-API-Key'] = apiKey;
  }

  // JWT
  if (!skipAuth) {
    const token = getAuthToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Body serialization
  let finalBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (
      typeof body === 'string' ||
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof ArrayBuffer ||
      body instanceof URLSearchParams
    ) {
      finalBody = body as BodyInit;
    } else {
      finalHeaders['Content-Type'] ||= 'application/json';
      finalBody = JSON.stringify(body);
    }
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...rest,
        method: method ?? (finalBody ? 'POST' : 'GET'),
        headers: finalHeaders,
        body: finalBody,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // 401 — clear + reload
      if (res.status === 401) {
        let payload: unknown;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        showToast('error', 'פג תוקף ההתחברות — מתחבר מחדש');
        clearCredentialsAndReload();
        throw new ApiUnauthorizedError(url, payload);
      }

      // 429 — backoff toast
      if (res.status === 429) {
        const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'));
        let payload: unknown;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        showToast(
          'warning',
          `השרת עמוס — נסה שוב בעוד ${Math.ceil(retryAfterMs / 1000)} שניות`
        );
        throw new ApiRateLimitError(url, retryAfterMs, payload);
      }

      if (!res.ok) {
        let payload: unknown;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        const message =
          (payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : res.statusText) || `HTTP ${res.status}`;
        throw new ApiError(message, res.status, url, payload);
      }

      return await parseResponse<T>(res, responseType);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      // Don't retry business errors
      if (err instanceof ApiError && !(err instanceof ApiNetworkError)) {
        throw err;
      }

      if ((err as { name?: string })?.name === 'AbortError') {
        lastError = new ApiTimeoutError(url, timeoutMs);
      } else if (!(err instanceof ApiError)) {
        lastError = new ApiNetworkError(url, err);
      }

      if (attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new ApiError('Unknown API error', 0, url);
}

/* ------------------------------------------------------------------ */
/* Convenience verb helpers                                            */
/* ------------------------------------------------------------------ */

export const apiGet = <T = unknown>(path: string, options?: ApiRequestOptions) =>
  api<T>(path, { ...options, method: 'GET' });

export const apiPost = <T = unknown>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
) => api<T>(path, { ...options, method: 'POST', body });

export const apiPut = <T = unknown>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
) => api<T>(path, { ...options, method: 'PUT', body });

export const apiPatch = <T = unknown>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
) => api<T>(path, { ...options, method: 'PATCH', body });

export const apiDelete = <T = unknown>(path: string, options?: ApiRequestOptions) =>
  api<T>(path, { ...options, method: 'DELETE' });

export const apiClient = {
  api,
  get: apiGet,
  post: apiPost,
  put: apiPut,
  patch: apiPatch,
  delete: apiDelete,
  getBaseUrl,
  getApiKey,
  getAuthToken,
};

export default apiClient;
