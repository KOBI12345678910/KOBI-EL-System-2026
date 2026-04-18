import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface NavigatorWithUAData extends Navigator {
  userAgentData?: { platform?: string };
}

export function getModifierKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  const uaData = (navigator as NavigatorWithUAData).userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? "";
  return platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl";
}

let _refreshingToken: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  if (_refreshingToken) return _refreshingToken;
  _refreshingToken = (async () => {
    try {
      const token = localStorage.getItem("erp_token");
      if (!token) {
        console.warn("[refreshToken] no token in storage — cannot refresh");
        return null;
      }
      console.info("[refreshToken] attempting session refresh via refresh-session endpoint");
      const refreshController = new AbortController();
      const refreshTimeoutId = setTimeout(() => {
        console.warn("[refreshToken] refresh-session request timed out after", FETCH_TIMEOUT_MS, "ms");
        refreshController.abort();
      }, FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch("/api/auth/refresh-session", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          signal: refreshController.signal,
        });
      } finally {
        clearTimeout(refreshTimeoutId);
      }
      if (!res.ok) {
        console.error("[refreshToken] refresh-session returned", res.status, "— session cannot be refreshed");
        return null;
      }
      console.info("[refreshToken] session refreshed successfully");
      return token;
    } catch (err) {
      console.error("[refreshToken] unexpected error:", err);
      return null;
    } finally {
      _refreshingToken = null;
    }
  })();
  return _refreshingToken;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const OFFLINE_READ_PATTERNS: [RegExp, () => Promise<unknown>][] = [];

export function registerOfflineReadFallback(pattern: RegExp, getter: () => Promise<unknown>): void {
  OFFLINE_READ_PATTERNS.push([pattern, getter]);
}

async function getOfflineFallbackResponse(url: string): Promise<Response | null> {
  for (const [pattern, getter] of OFFLINE_READ_PATTERNS) {
    if (pattern.test(url)) {
      try {
        const data = await getter();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Offline-Cache": "true" },
        });
      } catch {
        return null;
      }
    }
  }
  return null;
}

let _enqueueOfflineMutation: ((url: string, method: string, body?: unknown) => Promise<void>) | null = null;

export function registerOfflineMutationQueue(fn: (url: string, method: string, body?: unknown) => Promise<void>): void {
  _enqueueOfflineMutation = fn;
}

const FETCH_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 30_000;
export const STREAMING_URL_PATTERNS = ["/kobi/chat/stream", "/kobi/claude/stream"];

export class NetworkTimeoutError extends Error {
  readonly url?: string;
  constructor(url?: string) {
    super("הבקשה נכשלה עקב timeout");
    this.name = "NetworkTimeoutError";
    this.url = url;
  }
}

function isStreamingUrl(url: string): boolean {
  return STREAMING_URL_PATTERNS.some(p => url.includes(p));
}

function getTimeoutMs(url: string): number | null {
  if (isStreamingUrl(url)) return null;
  if (url.includes("/auth/login") || url.includes("/auth/mfa-login") || url.includes("/auth/refresh")) return AUTH_TIMEOUT_MS;
  return FETCH_TIMEOUT_MS;
}

function showSessionExpiredBanner(): void {
  const BANNER_ID = "erp-session-expired-banner";
  if (document.getElementById(BANNER_ID)) return;
  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.setAttribute("dir", "rtl");
  Object.assign(banner.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    zIndex: "999999",
    background: "#ef4444",
    color: "#fff",
    textAlign: "center",
    padding: "14px 20px",
    fontSize: "15px",
    fontWeight: "600",
    fontFamily: "inherit",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    letterSpacing: "0.01em",
  });
  banner.textContent = "החיבור שלך פג, אנא התחבר מחדש";
  document.body.appendChild(banner);
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const token = localStorage.getItem("erp_token");
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (!navigator.onLine && WRITE_METHODS.has(method) && _enqueueOfflineMutation) {
    let body: unknown;
    try {
      body = options.body ? JSON.parse(options.body as string) : undefined;
    } catch {
      body = options.body;
    }
    await _enqueueOfflineMutation(url, method, body);
    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }

  const timeoutMs = getTimeoutMs(url);
  const controller = timeoutMs !== null ? new AbortController() : null;
  let _timedOut = false;
  const timeoutId = controller && timeoutMs !== null
    ? setTimeout(() => { _timedOut = true; controller.abort(); }, timeoutMs)
    : null;

  const signal = controller ? controller.signal : options.signal;

  const fetchWithTimeout = (fetchUrl: string, fetchOptions: RequestInit): Promise<Response> => {
    if (isStreamingUrl(fetchUrl)) {
      return fetch(fetchUrl, { ...fetchOptions, signal: options.signal ?? undefined })
        .catch(err => {
          if (err instanceof TypeError) _dispatchNetworkError(err as Error);
          throw err;
        });
    }
    const retryController = new AbortController();
    let _retryTimedOut = false;
    const retryTimeoutId = setTimeout(() => { _retryTimedOut = true; retryController.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(fetchUrl, { ...fetchOptions, signal: retryController.signal })
      .then(res => { clearTimeout(retryTimeoutId); return res; })
      .catch(err => {
        clearTimeout(retryTimeoutId);
        if (err instanceof DOMException && err.name === "AbortError" && _retryTimedOut) {
          const timeoutErr = new NetworkTimeoutError(fetchUrl);
          _dispatchNetworkError(timeoutErr);
          throw timeoutErr;
        }
        if (err instanceof TypeError) _dispatchNetworkError(err as Error);
        throw err;
      });
  };

  try {
    const res = await fetch(url, { ...options, headers, signal: signal ?? undefined });
    if (timeoutId) clearTimeout(timeoutId);
    if (res.status === 401 && !url.includes("/auth/login") && !url.includes("/auth/refresh-session")) {
      console.warn("[authFetch] 401 received for", url, "— attempting token refresh");
      const newToken = await refreshToken();
      if (newToken) {
        console.info("[authFetch] token refreshed successfully, retrying", url);
        headers.set("Authorization", `Bearer ${newToken}`);
        return fetchWithTimeout(url, { ...options, headers });
      }
      console.error("[authFetch] token refresh failed for", url, "— session expired");
      localStorage.removeItem("erp_token");
      localStorage.removeItem("token");
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
      if (!window.location.pathname.includes("/login")) {
        showSessionExpiredBanner();
        window.dispatchEvent(new CustomEvent("erp:auth:logout"));
        setTimeout(() => {
          window.location.href = base + "/login";
        }, 2500);
      }
      return res;
    }
    return res;
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      if (_timedOut) {
        const timeoutErr = new NetworkTimeoutError(url);
        _dispatchNetworkError(timeoutErr);
        throw timeoutErr;
      }
      throw err;
    }
    if (!navigator.onLine) {
      if (WRITE_METHODS.has(method) && _enqueueOfflineMutation) {
        let body: unknown;
        try {
          body = options.body ? JSON.parse(options.body as string) : undefined;
        } catch {
          body = options.body;
        }
        await _enqueueOfflineMutation(url, method, body);
        return new Response(JSON.stringify({ queued: true, offline: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }

      const fallback = await getOfflineFallbackResponse(url);
      if (fallback) return fallback;
    }
    if (err instanceof TypeError) {
      _dispatchNetworkError(err as Error);
    }
    throw err;
  }
}

type NetworkErrorListener = (err: Error) => void;
const _networkErrorListeners: NetworkErrorListener[] = [];

export function addNetworkErrorListener(fn: NetworkErrorListener): () => void {
  _networkErrorListeners.push(fn);
  return () => {
    const idx = _networkErrorListeners.indexOf(fn);
    if (idx > -1) _networkErrorListeners.splice(idx, 1);
  };
}

function _dispatchNetworkError(err: Error): void {
  _networkErrorListeners.forEach(fn => {
    try { fn(err); } catch { /* ignore */ }
  });
}

export async function authJson(url: string, options: RequestInit = {}) {
  const res = await authFetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "שגיאת שרת" }));
    throw new Error(data.error || `שגיאה ${res.status}`);
  }
  return res.json();
}

export async function authJsonList<T = unknown>(url: string, options: RequestInit = {}): Promise<T[]> {
  const res = await authFetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "שגיאת שרת" }));
    throw new Error(data.error || `שגיאה ${res.status}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : (json?.data || []);
}

export function validateIsraeliID(id: string): boolean {
  const cleaned = id.replace(/\D/g, "");
  if (cleaned.length !== 9) return false;
  
  const digits = cleaned.split("").map(Number);
  const weights = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let product = digits[i] * weights[i];
    if (product > 9) product = Math.floor(product / 10) + (product % 10);
    sum += product;
  }
  
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return digits[8] === expectedCheckDigit;
}

export function validateIsraeliPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length !== 10) return false;

  if (cleaned.startsWith("05")) {
    return /^05\d{8}$/.test(cleaned);
  } else if (cleaned.startsWith("07")) {
    return /^07\d{8}$/.test(cleaned);
  } else if (cleaned.startsWith("0")) {
    return /^0[2-4789]\d{7}$/.test(cleaned);
  }
  return false;
}

export function formatAgorot(agorot: number | null | undefined): string {
  if (!agorot) return "₪0.00";
  const shekel = agorot / 100;
  return "₪" + shekel.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shekelToAgorot(shekel: number | string): number {
  const num = typeof shekel === "string" ? parseFloat(shekel) : shekel;
  return Math.round(num * 100);
}

export function agorotToShekel(agorot: number): number {
  return agorot / 100;
}

export function calculateVAT(amountAgorot: number): number {
  return Math.round(amountAgorot * 18 / 100);
}

export function calculateTotalWithVAT(amountAgorot: number): number {
  return amountAgorot + calculateVAT(amountAgorot);
}
