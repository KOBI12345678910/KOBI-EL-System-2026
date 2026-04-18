import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertTriangle, Info, AlertCircle, ExternalLink, Undo2 } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  actions?: ToastAction[];
  progress?: boolean;
}

const TOAST_ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS: Record<ToastType, string> = {
  success: "border-emerald-500/30 bg-emerald-500/5",
  error: "border-red-500/30 bg-red-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

const TOAST_ICON_COLORS: Record<ToastType, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

const TOAST_PROGRESS_COLORS: Record<ToastType, string> = {
  success: "bg-emerald-500",
  error: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];
let idCounter = 0;

function notifyListeners() {
  toastListeners.forEach(fn => fn([...toasts]));
}

export function showEnhancedToast(opts: Omit<ToastItem, "id">) {
  const id = `toast-${++idCounter}-${Date.now()}`;
  const toast: ToastItem = { ...opts, id, duration: opts.duration ?? 5000 };
  toasts = [...toasts, toast];
  notifyListeners();

  if (toast.duration && toast.duration > 0) {
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      notifyListeners();
    }, toast.duration);
  }

  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notifyListeners();
}

function ToastProgressBar({ duration, type }: { duration: number; type: ToastType }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/20 rounded-b-xl overflow-hidden">
      <motion.div
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: duration / 1000, ease: "linear" }}
        className={`h-full ${TOAST_PROGRESS_COLORS[type]}`}
      />
    </div>
  );
}

function SingleToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const Icon = TOAST_ICONS[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative w-80 rounded-xl border shadow-xl backdrop-blur-sm ${TOAST_COLORS[toast.type]}`}
     
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 flex-shrink-0 ${TOAST_ICON_COLORS[toast.type]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{toast.title}</p>
          {toast.message && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{toast.message}</p>
          )}
          {toast.actions && toast.actions.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              {toast.actions.map((action, idx) => {
                const ActionIcon = action.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      action.onClick();
                      onDismiss(toast.id);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-card/30 hover:bg-card/50 text-foreground transition-colors border border-border/30"
                  >
                    {ActionIcon && <ActionIcon className="w-3 h-3" />}
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="p-1 rounded hover:bg-card/10 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {toast.progress !== false && toast.duration && toast.duration > 0 && (
        <ToastProgressBar duration={toast.duration} type={toast.type} />
      )}
    </motion.div>
  );
}

export function EnhancedToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (t: ToastItem[]) => setCurrentToasts(t);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  return (
    <div className="fixed top-20 left-6 z-[60] flex flex-col gap-2 pointer-events-none" style={{ maxHeight: "calc(100vh - 120px)" }}>
      <AnimatePresence mode="popLayout">
        {currentToasts.slice(-5).map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <SingleToast toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
