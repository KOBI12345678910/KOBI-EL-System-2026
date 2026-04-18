import { addToSyncQueue, getSyncQueue, removeSyncQueueItem, cacheCustomers, cacheProducts, cachePriceLists, getMeta } from "./offline-db";
import { authFetch } from "./utils";

const BASE_URL = import.meta.env.BASE_URL || "/";

function apiUrl(path: string): string {
  const base = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  return `${base}${path}`;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

type SyncStatusListener = (status: SyncStatus, pendingCount: number) => void;

const listeners = new Set<SyncStatusListener>();
let currentStatus: SyncStatus = "idle";
let pendingCount = 0;

export function subscribeSyncStatus(listener: SyncStatusListener): () => void {
  listeners.add(listener);
  listener(currentStatus, pendingCount);
  return () => listeners.delete(listener);
}

function notifyListeners(status: SyncStatus, count: number) {
  currentStatus = status;
  pendingCount = count;
  listeners.forEach((l) => l(status, count));
}

export async function enqueueMutation(url: string, method: string, body?: unknown, headers?: Record<string, string>): Promise<void> {
  await addToSyncQueue({
    url,
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers,
    timestamp: Date.now(),
    retries: 0,
    tag: "erp-sync",
  });
  const queue = await getSyncQueue();
  notifyListeners("idle", queue.length);
}

export async function flushSyncQueue(): Promise<{ success: number; failed: number }> {
  const queue = await getSyncQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  notifyListeners("syncing", queue.length);

  let success = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const response = await authFetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...(item.headers || {}),
        },
        body: item.body,
      });

      if (response.ok) {
        if (item.id !== undefined) {
          await removeSyncQueueItem(item.id);
        }
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  const remaining = await getSyncQueue();
  notifyListeners(failed > 0 ? "error" : "synced", remaining.length);

  return { success, failed };
}

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const PAGE_SIZE = 50;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let hasSyncedOnce = false;
let hasVisitedDataHungryRoute = false;

export const DATA_HUNGRY_ROUTES = [
  "/crm",
  "/sales",
  "/finance",
  "/procurement",
  "/inventory",
  "/production",
  "/raw-materials",
];

export function isDataHungryRoute(pathname: string): boolean {
  return DATA_HUNGRY_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export function triggerSyncForModule(): void {
  hasVisitedDataHungryRoute = true;
  if (!navigator.onLine) return;
  if (hasSyncedOnce) return;
  hasSyncedOnce = true;
  syncCriticalData().catch(() => {});
}

const MAX_PAGES = 200;

async function streamPages<T>(
  baseUrl: string,
  since: string | undefined,
  onPage: (rows: T[]) => Promise<void>
): Promise<void> {
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES) {
    const sinceParam = since ? `&updated_after=${encodeURIComponent(since)}` : "";
    const url = `${baseUrl}?limit=${PAGE_SIZE}&page=${page}${sinceParam}`;
    try {
      const res = await authFetch(apiUrl(url));
      if (!res.ok) break;
      const json = await res.json();
      const rows: T[] = Array.isArray(json) ? json : (json?.data ?? []);
      if (rows.length > 0) {
        await onPage(rows);
      }
      if (rows.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch {
      break;
    }
  }

  if (page > MAX_PAGES) {
    console.warn(`[sync] ${baseUrl}: reached MAX_PAGES limit (${MAX_PAGES}), sync may be incomplete`);
  }
}

function toIsoSince(ts: unknown): string | undefined {
  if (typeof ts === "number" && ts > 0) {
    return new Date(ts).toISOString();
  }
  return undefined;
}

async function syncEntity<T>(
  baseUrl: string,
  sinceKey: string,
  cacheFunc: (rows: T[]) => Promise<void>
): Promise<void> {
  const since = toIsoSince(await getMeta(sinceKey));
  await streamPages<T>(baseUrl, since, cacheFunc);
}

export async function syncCriticalData(): Promise<void> {
  if (!navigator.onLine) return;

  try {
    await Promise.allSettled([
      syncEntity("/api/customers", "customers_last_sync", cacheCustomers),
      syncEntity("/api/products", "products_last_sync", cacheProducts),
      syncEntity("/api/price-lists", "priceLists_last_sync", cachePriceLists),
    ]);
  } catch {
  }
}

function scheduleIdleSync(callback: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => callback(), { timeout: 15000 });
  } else {
    setTimeout(callback, 10000);
  }
}

export function startPeriodicSync(): void {
  if (syncIntervalId) return;

  scheduleIdleSync(() => {
    if (hasSyncedOnce || !hasVisitedDataHungryRoute) return;
    hasSyncedOnce = true;
    syncCriticalData().catch(() => {});
  });

  window.addEventListener("online", async () => {
    await flushSyncQueue();
    await syncCriticalData();
  });

  let syncRunning = false;
  syncIntervalId = setInterval(async () => {
    if (!navigator.onLine || document.hidden || syncRunning) return;
    syncRunning = true;
    try { await syncCriticalData(); } finally { syncRunning = false; }
  }, SYNC_INTERVAL_MS);
}

export function stopPeriodicSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}
