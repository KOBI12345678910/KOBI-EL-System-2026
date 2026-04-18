// Shared list-page helpers for execution-domain pages
import type { ReactNode } from "react";

export type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

export function renderCell<T>(row: T, col: Column<T>): ReactNode {
  if (col.render) return col.render(row);
  const v = (row as Record<string, unknown>)[col.key as string];
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "✓" : "—";
  if (v instanceof Date) return v.toLocaleDateString("he-IL");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    try { return new Date(v).toLocaleDateString("he-IL"); } catch { /* noop */ }
  }
  return String(v);
}

export function formatHebrewDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("he-IL"); } catch { return iso; }
}

export function formatCurrencyILS(value: number | null | undefined): string {
  if (value == null) return "—";
  return `₪${Number(value).toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

export const STATE_COLORS: Record<string, string> = {
  draft: "bg-gray-400",
  planning: "bg-blue-400",
  in_progress: "bg-amber-500",
  on_hold: "bg-yellow-400",
  completed: "bg-emerald-500",
  closed: "bg-gray-600",
  open: "bg-blue-400",
  backlog: "bg-gray-400",
  review: "bg-purple-400",
  done: "bg-emerald-500",
  blocked: "bg-red-500",
  cancelled: "bg-gray-500",
  approved: "bg-cyan-500",
  qa: "bg-indigo-500",
  released: "bg-emerald-600",
  scheduled: "bg-blue-300",
  on_site: "bg-amber-400",
  en_route: "bg-cyan-400",
  resolved: "bg-emerald-500",
  verified: "bg-emerald-600",
};
