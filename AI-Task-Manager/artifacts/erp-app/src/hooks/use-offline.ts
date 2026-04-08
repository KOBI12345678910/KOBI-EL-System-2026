import { useState, useEffect } from "react";
import { SyncStatus, subscribeSyncStatus } from "@/lib/sync-manager";
import { getSyncQueueCount } from "@/lib/offline-db";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}

export function useSyncStatus(): { status: SyncStatus; pendingCount: number } {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getSyncQueueCount().then(setPendingCount).catch(() => {});
    const unsub = subscribeSyncStatus((s, count) => {
      setStatus(s);
      setPendingCount(count);
    });
    return unsub;
  }, []);

  return { status, pendingCount };
}
