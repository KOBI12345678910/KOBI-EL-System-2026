// Compatibility shim for legacy callers of `useToast()` and `toast(...)`.
// Forwards to the single canonical Sonner toast layer mounted at App.tsx root.
// Eliminates the broken Radix reducer (TOAST_REMOVE_DELAY=1000000, TOAST_LIMIT=1).
// Agent 221 (2026-04-29) - Toast System Consolidation.
import { toast as sonnerToast, type ExternalToast } from "sonner";
import * as React from "react";

type LegacyVariant = "default" | "destructive" | "success" | "warning";

type LegacyToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: LegacyVariant;
  duration?: number;
  action?: { altText?: string; onClick?: () => void; label?: React.ReactNode } | React.ReactElement;
};

function normalizeTitle(t?: React.ReactNode): string {
  if (t == null) return "";
  if (typeof t === "string" || typeof t === "number") return String(t);
  // Sonner accepts ReactNode, so we pass through; fall back to empty string only for logging.
  return "";
}

export function toast(input: LegacyToastInput | string) {
  if (typeof input === "string") {
    return { id: String(sonnerToast(input)), dismiss: () => sonnerToast.dismiss(), update: () => {} };
  }
  const { title, description, variant = "default", duration } = input;
  const opts: ExternalToast = {
    description: description as ExternalToast["description"],
    duration: duration ?? 5000,
  };
  // Map Radix variant -> Sonner colored variant
  let id: string | number;
  if (variant === "destructive") id = sonnerToast.error((title as React.ReactNode) ?? "", opts);
  else if (variant === "success") id = sonnerToast.success((title as React.ReactNode) ?? "", opts);
  else if (variant === "warning") id = sonnerToast.warning((title as React.ReactNode) ?? "", opts);
  else id = sonnerToast((title as React.ReactNode) ?? normalizeTitle(description), opts);

  return {
    id: String(id),
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: LegacyToastInput) => {
      sonnerToast.dismiss(id);
      toast(next);
    },
  };
}

export function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
    toasts: [] as Array<{ id: string }>, // legacy compatibility (never populated; UI is in Sonner)
  };
}

export type Toast = LegacyToastInput;
