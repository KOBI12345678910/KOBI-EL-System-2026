import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

let _refreshingToken: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  if (_refreshingToken) return _refreshingToken;
  _refreshingToken = (async () => {
    try {
      const username = localStorage.getItem("erp_username") || "admin";
      const password = localStorage.getItem("erp_password") || "admin123";
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("erp_token", data.token);
        return data.token as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      _refreshingToken = null;
    }
  })();
  return _refreshingToken;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("erp_token");
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !url.includes("/auth/login")) {
    const newToken = await refreshToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(url, { ...options, headers });
    }
  }
  return res;
}

export async function authJson(url: string, options: RequestInit = {}) {
  const res = await authFetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "שגיאת שרת" }));
    throw new Error(data.error || `שגיאה ${res.status}`);
  }
  return res.json();
}
