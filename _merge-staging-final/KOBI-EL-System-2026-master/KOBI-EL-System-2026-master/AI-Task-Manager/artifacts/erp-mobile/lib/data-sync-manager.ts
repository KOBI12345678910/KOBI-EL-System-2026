import { Platform } from "react-native";

import * as api from "@/lib/api";
import { apiRequest } from "@/lib/api";
import * as offlineDb from "@/lib/offline-db";

export interface SyncProfile {
  key: string;
  label: string;
  fetcher: (since?: string | null) => Promise<Record<string, unknown>[]>;
  upserter: (data: Record<string, unknown>[]) => Promise<{ synced: number; conflicts: number }>;
  intervalMs: number;
  priority: number;
}

export interface SyncProgress {
  currentProfile: string;
  currentLabel: string;
  totalProfiles: number;
  completedProfiles: number;
  status: "idle" | "syncing" | "error" | "complete";
  error?: string;
  conflictsDetected: number;
  failedProfiles: string[];
}

type SyncListener = (progress: SyncProgress) => void;

const listeners = new Set<SyncListener>();
let currentProgress: SyncProgress = {
  currentProfile: "",
  currentLabel: "",
  totalProfiles: 0,
  completedProfiles: 0,
  status: "idle",
  conflictsDetected: 0,
  failedProfiles: [],
};

const profileTimers = new Map<string, ReturnType<typeof setInterval>>();

function notify(progress: SyncProgress) {
  currentProgress = progress;
  listeners.forEach((fn) => fn(progress));
}

export function subscribeSyncProgress(fn: SyncListener): () => void {
  listeners.add(fn);
  fn(currentProgress);
  return () => { listeners.delete(fn); };
}

export function getSyncProgress(): SyncProgress {
  return currentProgress;
}

function compressPayload(data: Record<string, unknown>[]): Record<string, unknown>[] {
  return data.map((item) => {
    const compressed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (v !== null && v !== undefined && v !== "") {
        compressed[k] = v;
      }
    }
    return compressed;
  });
}

const MOBILE_PAGE_SIZE = 50;
const MOBILE_MAX_PAGES = 200;

async function fetchAllPagesMobile(
  buildUrl: (page: number, limit: number) => string,
  extractItems: (json: unknown) => Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MOBILE_MAX_PAGES) {
    try {
      const json = await apiRequest<unknown>(buildUrl(page, MOBILE_PAGE_SIZE));
      const rows = extractItems(json);
      results.push(...rows);
      if (rows.length < MOBILE_PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch {
      break;
    }
  }

  if (page > MOBILE_MAX_PAGES) {
    console.warn(`[mobile-sync] reached MOBILE_MAX_PAGES limit (${MOBILE_MAX_PAGES}), sync may be incomplete`);
  }

  return results;
}

const SYNC_PROFILES: SyncProfile[] = [
  {
    key: "products",
    label: "מוצרים",
    fetcher: async (since) => {
      const sinceParam = since ? `&updated_after=${encodeURIComponent(since)}` : "";
      const items = await fetchAllPagesMobile(
        (page, limit) => `/field-ops/product-catalog?limit=${limit}&page=${page}${sinceParam}`,
        (json) => {
          const res = json as { products?: Record<string, unknown>[] };
          return Array.isArray(res) ? res : (res?.products || []);
        }
      );
      return compressPayload(items);
    },
    upserter: offlineDb.upsertProducts,
    intervalMs: 15 * 60 * 1000,
    priority: 1,
  },
  {
    key: "customers",
    label: "לקוחות",
    fetcher: async (since) => {
      const sinceParam = since ? `&updated_after=${encodeURIComponent(since)}` : "";
      const items = await fetchAllPagesMobile(
        (page, limit) => `/customers?limit=${limit}&page=${page}${sinceParam}`,
        (json) => {
          const res = json as { data?: Record<string, unknown>[] };
          return Array.isArray(res) ? res : (res?.data || []);
        }
      );
      return compressPayload(items);
    },
    upserter: offlineDb.upsertCustomers,
    intervalMs: 30 * 60 * 1000,
    priority: 2,
  },
  {
    key: "work_orders",
    label: "הזמנות עבודה",
    fetcher: async (since) => {
      const res = await api.getWorkOrders({ limit: 200, since: since || undefined });
      const items = Array.isArray(res) ? res : [];
      return compressPayload(items);
    },
    upserter: offlineDb.upsertWorkOrders,
    intervalMs: 10 * 60 * 1000,
    priority: 3,
  },
  {
    key: "inventory",
    label: "מלאי",
    fetcher: async (since) => {
      const res = await api.getRawMaterials({ limit: 500, since: since || undefined });
      const items = Array.isArray(res) ? res : [];
      return compressPayload(items);
    },
    upserter: offlineDb.upsertInventory,
    intervalMs: 20 * 60 * 1000,
    priority: 4,
  },
  {
    key: "price_lists",
    label: "מחירונים",
    fetcher: async (since) => {
      const res = await api.getProductCatalog({ limit: 500, since: since || undefined });
      const products = res.products || [];
      return compressPayload(products.map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.item_name,
        product_id: p.id,
        price_agorot: Number(p.cost_per_unit || 0),
        currency: "ILS",
        updated_at: p.updated_at || p.created_at,
      })));
    },
    upserter: offlineDb.upsertPriceLists,
    intervalMs: 60 * 60 * 1000,
    priority: 5,
  },
  {
    key: "wms_pick_lists",
    label: "רשימות ליקוט",
    fetcher: async () => {
      try {
        const res = await api.getWMSPickLists({ status: "pending", limit: 100 });
        const items = (Array.isArray(res) ? res : ((res as { pickLists?: unknown[] })?.pickLists || [])) as Record<string, unknown>[];
        return compressPayload(items);
      } catch {
        return [];
      }
    },
    upserter: offlineDb.upsertWmsPickLists,
    intervalMs: 10 * 60 * 1000,
    priority: 6,
  },
  {
    key: "wms_count_tasks",
    label: "משימות ספירה",
    fetcher: async () => {
      try {
        const res = await api.getCountTasks({ status: "pending" });
        const items = (Array.isArray(res) ? res : ((res as { tasks?: unknown[] })?.tasks || [])) as Record<string, unknown>[];
        return compressPayload(items);
      } catch {
        return [];
      }
    },
    upserter: offlineDb.upsertWmsCountTasks,
    intervalMs: 20 * 60 * 1000,
    priority: 7,
  },
  {
    key: "wms_putaway",
    label: "פעולות אחסון",
    fetcher: async () => {
      try {
        const res = await api.getPutawayAssignments({ status: "pending" });
        const items = (Array.isArray(res) ? res : ((res as { assignments?: unknown[] })?.assignments || [])) as Record<string, unknown>[];
        return compressPayload(items);
      } catch {
        return [];
      }
    },
    upserter: offlineDb.upsertWmsPutaway,
    intervalMs: 15 * 60 * 1000,
    priority: 8,
  },
  {
    key: "purchase_orders",
    label: "הזמנות רכש",
    fetcher: async () => {
      try {
        const res = await apiRequest<Record<string, unknown>[]>("/warehouse-intelligence/purchase-orders?status=open&limit=200").catch(() => null);
        if (!res || !Array.isArray(res)) return [];
        return compressPayload(res as Record<string, unknown>[]);
      } catch {
        return [];
      }
    },
    upserter: offlineDb.upsertPurchaseOrders,
    intervalMs: 30 * 60 * 1000,
    priority: 9,
  },
];

export async function runFullSync(): Promise<void> {
  if (Platform.OS === "web") return;
  if (currentProgress.status === "syncing") return;

  const total = SYNC_PROFILES.length;
  let totalConflicts = 0;
  const failedProfiles: string[] = [];
  notify({ currentProfile: "", currentLabel: "", totalProfiles: total, completedProfiles: 0, status: "syncing", conflictsDetected: 0, failedProfiles: [] });

  const sorted = [...SYNC_PROFILES].sort((a, b) => a.priority - b.priority);
  let completed = 0;

  for (const profile of sorted) {
    notify({
      currentProfile: profile.key,
      currentLabel: profile.label,
      totalProfiles: total,
      completedProfiles: completed,
      status: "syncing",
      conflictsDetected: totalConflicts,
      failedProfiles,
    });
    try {
      const lastTs = await offlineDb.getLastServerTimestamp(profile.key);
      const data = await profile.fetcher(lastTs);
      if (data.length > 0) {
        const result = await profile.upserter(data);
        totalConflicts += result.conflicts;
      }
    } catch (err) {
      console.warn(`[DataSync] Failed to sync ${profile.key}:`, err);
      failedProfiles.push(profile.key);
    }
    completed++;
  }

  const finalStatus = failedProfiles.length > 0
    ? (failedProfiles.length === total ? "error" : "complete")
    : "complete";

  notify({
    currentProfile: "",
    currentLabel: "",
    totalProfiles: total,
    completedProfiles: completed,
    status: finalStatus,
    conflictsDetected: totalConflicts,
    failedProfiles,
    error: failedProfiles.length > 0 ? `נכשלו: ${failedProfiles.join(", ")}` : undefined,
  });
  setTimeout(() => {
    if (currentProgress.status === "complete" || currentProgress.status === "error") {
      notify({ ...currentProgress, status: "idle" });
    }
  }, 5000);
}

export async function syncProfile(key: string): Promise<void> {
  if (Platform.OS === "web") return;
  const profile = SYNC_PROFILES.find((p) => p.key === key);
  if (!profile) return;

  notify({
    currentProfile: profile.key,
    currentLabel: profile.label,
    totalProfiles: 1,
    completedProfiles: 0,
    status: "syncing",
    conflictsDetected: 0,
    failedProfiles: [],
  });

  try {
    const lastTs = await offlineDb.getLastServerTimestamp(profile.key);
    const data = await profile.fetcher(lastTs);
    let conflicts = 0;
    if (data.length > 0) {
      const result = await profile.upserter(data);
      conflicts = result.conflicts;
    }
    notify({
      currentProfile: "",
      currentLabel: "",
      totalProfiles: 1,
      completedProfiles: 1,
      status: "complete",
      conflictsDetected: conflicts,
      failedProfiles: [],
    });
  } catch (err) {
    notify({
      currentProfile: profile.key,
      currentLabel: profile.label,
      totalProfiles: 1,
      completedProfiles: 0,
      status: "error",
      error: String(err),
      conflictsDetected: 0,
      failedProfiles: [profile.key],
    });
  }
}

export async function flushPendingMutations(): Promise<{ flushed: number; failed: number }> {
  if (Platform.OS === "web") return { flushed: 0, failed: 0 };
  const mutations = await offlineDb.getPendingMutations();
  let flushed = 0;
  let failed = 0;

  for (const mut of mutations) {
    if (mut.retry_count >= 5) {
      failed++;
      continue;
    }
    try {
      await api.apiRequest(mut.endpoint, {
        method: mut.method,
        body: mut.payload,
      });
      await offlineDb.removePendingMutation(mut.id);
      flushed++;
    } catch (err) {
      await offlineDb.incrementMutationRetry(mut.id, String(err));
      failed++;
    }
  }

  return { flushed, failed };
}

function scheduleProfile(profile: SyncProfile) {
  if (profileTimers.has(profile.key)) return;
  const timer = setInterval(async () => {
    try {
      const lastTs = await offlineDb.getLastServerTimestamp(profile.key);
      const data = await profile.fetcher(lastTs);
      if (data.length > 0) {
        await profile.upserter(data);
      }
    } catch (err) {
      console.warn(`[DataSync] Periodic sync failed for ${profile.key}:`, err);
    }
  }, profile.intervalMs);
  profileTimers.set(profile.key, timer);
}

export function startPeriodicSync() {
  if (Platform.OS === "web") return;
  for (const profile of SYNC_PROFILES) {
    scheduleProfile(profile);
  }
  setTimeout(() => {
    runFullSync().catch(() => {});
  }, 5000);
}

export function stopPeriodicSync() {
  for (const [, timer] of profileTimers) {
    clearInterval(timer);
  }
  profileTimers.clear();
}

export function getSyncProfiles(): SyncProfile[] {
  return SYNC_PROFILES;
}
