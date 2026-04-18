import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, AlertTriangle, ShieldCheck, ClipboardList, Settings, GitBranch, X, Volume2, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useRealtimeAlerts, type RealtimeNotification } from "@/hooks/use-realtime-alerts";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  anomaly: AlertTriangle,
  task: ClipboardList,
  approval: ShieldCheck,
  system: Settings,
  workflow: GitBranch,
};

const PRIORITY_STYLES: Record<string, { bg: string; border: string; icon: string; title: string }> = {
  critical: { bg: "bg-red-500/10 backdrop-blur-xl", border: "border-red-500/50", icon: "text-red-400", title: "text-red-300" },
  high: { bg: "bg-orange-500/10 backdrop-blur-xl", border: "border-orange-500/40", icon: "text-orange-400", title: "text-orange-200" },
  normal: { bg: "bg-blue-500/10 backdrop-blur-xl", border: "border-blue-500/30", icon: "text-blue-400", title: "text-blue-200" },
  low: { bg: "bg-slate-500/10 backdrop-blur-xl", border: "border-slate-500/30", icon: "text-muted-foreground", title: "text-slate-200" },
};

interface ToastItem extends RealtimeNotification {
  toastId: string;
}

function playNotificationSound(priority: string) {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(priority === "critical" ? 880 : priority === "high" ? 660 : 440, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
    if (priority === "critical") {
      const oscillator2 = ctx.createOscillator();
      const gainNode2 = ctx.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(ctx.destination);
      oscillator2.type = "sine";
      oscillator2.frequency.setValueAtTime(1100, ctx.currentTime + 0.2);
      gainNode2.gain.setValueAtTime(0.15, ctx.currentTime + 0.2);
      gainNode2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      oscillator2.start(ctx.currentTime + 0.2);
      oscillator2.stop(ctx.currentTime + 0.6);
    }
  } catch {
    // AudioContext not available
  }
}

let toastCounter = 0;

export function AlertToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const queryClient = useQueryClient();
  const toastsRef = useRef<ToastItem[]>([]);
  toastsRef.current = toasts;

  const removeToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
  }, []);

  const handleAlert = useCallback((notification: RealtimeNotification) => {
    const toastId = `toast-${++toastCounter}`;
    const toastItem: ToastItem = { ...notification, toastId };

    setToasts(prev => {
      const updated = [toastItem, ...prev].slice(0, 5);
      return updated;
    });

    playNotificationSound(notification.priority);

    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    queryClient.invalidateQueries({ queryKey: ["notification-stats"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-page"] });

    const timeout = notification.priority === "critical" ? 10000 : notification.priority === "high" ? 7000 : 5000;
    setTimeout(() => removeToast(toastId), timeout);
  }, [queryClient, removeToast]);

  useRealtimeAlerts(handleAlert);

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          const styles = PRIORITY_STYLES[toast.priority] || PRIORITY_STYLES.normal;
          const CatIcon = CATEGORY_ICONS[toast.category] || Bell;

          return (
            <motion.div
              key={toast.toastId}
              initial={{ opacity: 0, x: -60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`pointer-events-auto w-80 rounded-xl border ${styles.bg} ${styles.border} shadow-2xl shadow-black/40 overflow-hidden`}
            >
              <div className="flex items-start gap-3 p-3.5">
                <div className={`mt-0.5 p-1.5 rounded-lg bg-card/10 flex-shrink-0`}>
                  <CatIcon className={`w-4 h-4 ${styles.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className={`text-sm font-semibold truncate ${styles.title}`}>
                      {toast.title}
                    </p>
                    {toast.priority === "critical" && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/30 text-red-300 border border-red-500/40 flex-shrink-0">
                        קריטי
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300/80 line-clamp-2">{toast.message}</p>
                  {toast.actionUrl && (
                    <Link
                      href={toast.actionUrl}
                      className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                      onClick={() => removeToast(toast.toastId)}
                    >
                      <ExternalLink className="w-3 h-3" />
                      עבור לרשומה
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.toastId)}
                  className="p-1 rounded-lg hover:bg-card/10 text-muted-foreground hover:text-slate-200 transition-colors flex-shrink-0 mt-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="h-0.5 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="flex items-center justify-between px-3.5 py-1.5">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  התראה חדשה
                </span>
                <span className="text-[10px] text-muted-foreground">עכשיו</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
