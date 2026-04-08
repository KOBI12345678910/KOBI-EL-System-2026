import { useOnlineStatus, useSyncStatus } from "@/hooks/use-offline";
import { WifiOff, RefreshCw, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { flushSyncQueue } from "@/lib/sync-manager";
import { useState } from "react";

export function OfflineBanner() {
  const online = useOnlineStatus();
  const { status, pendingCount } = useSyncStatus();
  const [flushing, setFlushing] = useState(false);

  const handleSync = async () => {
    if (flushing || !online) return;
    setFlushing(true);
    await flushSyncQueue();
    setFlushing(false);
  };

  const showBanner = !online || pendingCount > 0 || status === "syncing" || status === "error";

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div
            className={`flex items-center justify-between gap-2 px-4 py-2 text-sm font-medium ${
              !online
                ? "bg-red-500/90 text-foreground"
                : status === "error"
                ? "bg-orange-500/90 text-foreground"
                : status === "syncing"
                ? "bg-blue-500/90 text-foreground"
                : "bg-yellow-500/90 text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              {!online ? (
                <WifiOff className="w-4 h-4 shrink-0" />
              ) : status === "syncing" ? (
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
              ) : status === "error" ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 shrink-0" />
              )}
              <span>
                {!online
                  ? "אין חיבור לאינטרנט — עובד במצב לא מקוון"
                  : status === "syncing"
                  ? "מסנכרן נתונים..."
                  : status === "error"
                  ? `שגיאת סנכרון — ${pendingCount} פעולות ממתינות`
                  : pendingCount > 0
                  ? `${pendingCount} פעולות ממתינות לסנכרון`
                  : ""}
              </span>
            </div>

            {online && pendingCount > 0 && status !== "syncing" && (
              <button
                onClick={handleSync}
                disabled={flushing}
                className="flex items-center gap-1 rounded bg-white/20 px-3 py-1 text-xs hover:bg-white/30 transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-3 h-3 ${flushing ? "animate-spin" : ""}`} />
                <span>סנכרן עכשיו</span>
              </button>
            )}

            {online && status === "synced" && pendingCount === 0 && (
              <div className="flex items-center gap-1 text-xs opacity-80">
                <CheckCircle className="w-3 h-3" />
                <span>סונכרן</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SyncStatusIndicator() {
  const online = useOnlineStatus();
  const { status, pendingCount } = useSyncStatus();

  if (online && status === "idle" && pendingCount === 0) {
    return null;
  }

  const icon = !online ? (
    <WifiOff className="w-3.5 h-3.5" />
  ) : status === "syncing" ? (
    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
  ) : status === "synced" ? (
    <CheckCircle className="w-3.5 h-3.5" />
  ) : pendingCount > 0 ? (
    <Clock className="w-3.5 h-3.5" />
  ) : null;

  const colorClass = !online
    ? "text-red-500"
    : status === "syncing"
    ? "text-blue-500"
    : status === "synced"
    ? "text-green-500"
    : "text-yellow-500";

  return (
    <div className={`flex items-center gap-1 text-xs ${colorClass}`} title={`${pendingCount} פעולות ממתינות`}>
      {icon}
      {pendingCount > 0 && <span className="tabular-nums">{pendingCount}</span>}
    </div>
  );
}
