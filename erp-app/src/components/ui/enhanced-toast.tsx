// Retired 2026-04-29 (Agent 221). The canonical toast layer is now Sonner, mounted in App.tsx.
// `showEnhancedToast` and `dismissToast` forward to Sonner; `EnhancedToastContainer` is a no-op
// because Sonner's <Toaster /> is rendered globally.
import { toast as sonnerToast } from "sonner";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface EnhancedToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  actions?: ToastAction[];
  progress?: boolean;
}

export function showEnhancedToast(opts: EnhancedToastOptions) {
  const fn =
    opts.type === "error" ? sonnerToast.error
    : opts.type === "warning" ? sonnerToast.warning
    : opts.type === "success" ? sonnerToast.success
    : sonnerToast.info;

  return fn(opts.title, {
    description: opts.message,
    duration: opts.duration ?? 5000,
    action: opts.actions?.[0]
      ? { label: opts.actions[0].label, onClick: opts.actions[0].onClick }
      : undefined,
  });
}

export function dismissToast(id: string | number) {
  sonnerToast.dismiss(id);
}

// Superseded by the global Sonner <Toaster /> rendered in App.tsx. Keep as a no-op
// so any legacy callers that mount this container do not crash during migration.
export function EnhancedToastContainer() {
  return null;
}
