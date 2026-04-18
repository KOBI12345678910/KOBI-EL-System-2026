// Shared helpers for intelligence pages
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

export const API_BASE = "/api/intelligence";

export async function apiGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const r = await authFetch(url.pathname + url.search);
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return r.json();
}

export async function apiSend<T = any>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: any,
): Promise<T> {
  const r = await authFetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => r.statusText);
    throw new Error(`${method} ${path} failed: ${r.status} — ${txt}`);
  }
  return r.json();
}

export function useList<T = any>(
  queryKey: (string | number | boolean | undefined)[],
  path: string,
  params?: Record<string, any>,
) {
  return useQuery({
    queryKey,
    queryFn: () => apiGet<{ rows: T[]; limit: number; offset: number; total?: number }>(path, params),
  });
}

export function useDetail<T = any>(queryKey: (string | number | undefined)[], path: string, enabled = true) {
  return useQuery({ queryKey, queryFn: () => apiGet<T>(path), enabled });
}

export function useActionMutation<T = any>(
  path: string,
  method: "POST" | "PUT" | "DELETE" = "POST",
  invalidateKey?: readonly unknown[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: any) => apiSend<T>(method, path, body),
    onSuccess: () => { if (invalidateKey) qc.invalidateQueries({ queryKey: invalidateKey as any }); },
  });
}

export function StatusBadge({ state }: { state?: string | null }) {
  if (!state) return null;
  const tone: Record<string, string> = {
    generated: "bg-blue-200 text-blue-900",
    published: "bg-indigo-200 text-indigo-900",
    acknowledged: "bg-amber-200 text-amber-900",
    actioned: "bg-emerald-200 text-emerald-900",
    dismissed: "bg-gray-300 text-gray-900",
    open: "bg-red-200 text-red-900",
    investigating: "bg-orange-200 text-orange-900",
    resolved: "bg-emerald-200 text-emerald-900",
    false_positive: "bg-gray-300 text-gray-900",
    pending: "bg-yellow-200 text-yellow-900",
    accepted: "bg-green-200 text-green-900",
    rejected: "bg-red-200 text-red-900",
    expired: "bg-gray-300 text-gray-900",
    queued: "bg-gray-200 text-gray-800",
    running: "bg-blue-300 text-blue-900",
    completed: "bg-emerald-200 text-emerald-900",
    complete: "bg-emerald-200 text-emerald-900",
    failed: "bg-red-200 text-red-900",
    draft: "bg-gray-200 text-gray-800",
    active: "bg-green-200 text-green-900",
    paused: "bg-amber-200 text-amber-900",
    healthy: "bg-green-200 text-green-900",
  };
  const key = state.toString().toLowerCase();
  const cls = tone[key] ?? "bg-gray-100 text-gray-800";
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{state}</span>;
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="search"
      dir="rtl"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "חיפוש…"}
      className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
    />
  );
}

export function Pagination({
  offset, limit, total, onChange,
}: {
  offset: number; limit: number; total?: number; onChange: (nextOffset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = total ? Math.max(1, Math.ceil(total / limit)) : undefined;
  return (
    <div className="flex items-center gap-2 text-sm" dir="rtl">
      <button className="rounded border px-2 py-1 disabled:opacity-40" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>הקודם</button>
      <span>עמוד {page}{totalPages ? ` / ${totalPages}` : ""}</span>
      <button className="rounded border px-2 py-1 disabled:opacity-40" disabled={!!total && offset + limit >= total} onClick={() => onChange(offset + limit)}>הבא</button>
    </div>
  );
}

export function useSearchState(defaults: { q?: string; state?: string; limit?: number } = {}) {
  const [q, setQ] = useState(defaults.q ?? "");
  const [state, setState] = useState(defaults.state ?? "");
  const [offset, setOffset] = useState(0);
  const limit = defaults.limit ?? 50;
  return { q, setQ, state, setState, offset, setOffset, limit };
}

export function formatDate(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("he-IL"); } catch { return s; }
}

export function Loading() { return <div className="p-6 text-center text-gray-500" dir="rtl">טוען…</div>; }
export function ErrorBox({ err }: { err: unknown }) {
  const msg = (err as any)?.message ?? String(err);
  return <div className="p-6 text-red-700 bg-red-50 rounded" dir="rtl">שגיאה: {msg}</div>;
}
export function EmptyBox({ label }: { label?: string }) {
  return <div className="p-8 text-center text-gray-500" dir="rtl">{label ?? "אין נתונים להצגה"}</div>;
}

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {actions}
    </div>
  );
}
