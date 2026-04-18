import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { router } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

import * as api from "@/lib/api";
import { flushPendingMutations, runFullSync, subscribeSyncProgress, type SyncProgress } from "@/lib/data-sync-manager";
import { flushOfflineGpsPings } from "@/lib/background-location";
import * as offlineDb from "@/lib/offline-db";

interface SyncAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

type SyncHandler = (action: SyncAction) => Promise<void>;

interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  cachedData: Record<string, unknown>;
  setCachedData: (key: string, data: unknown) => void;
  getCachedData: <T>(key: string) => T | null;
  syncQueue: SyncAction[];
  addToSyncQueue: (action: Omit<SyncAction, "id" | "createdAt">) => void;
  clearSyncQueue: () => void;
  registerSyncHandler: (type: string, handler: SyncHandler) => void;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  syncProgress: SyncProgress;
  pendingMutationCount: number;
  triggerFullSync: () => Promise<void>;
  enqueueOfflineMutation: (type: string, endpoint: string, method: string, payload: unknown, dirtyTable?: string, dirtyRecordId?: number) => Promise<void>;
  searchOffline: (dataType: string, query: string) => Promise<Record<string, unknown>[]>;
}

const defaultSyncProgress: SyncProgress = {
  currentProfile: "",
  currentLabel: "",
  totalProfiles: 0,
  completedProfiles: 0,
  status: "idle",
  conflictsDetected: 0,
  failedProfiles: [],
};

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
  cachedData: {},
  setCachedData: () => {},
  getCachedData: () => null,
  syncQueue: [],
  addToSyncQueue: () => {},
  clearSyncQueue: () => {},
  registerSyncHandler: () => {},
  isSyncing: false,
  lastSyncAt: null,
  syncProgress: defaultSyncProgress,
  pendingMutationCount: 0,
  triggerFullSync: async () => {},
  enqueueOfflineMutation: async () => {},
  searchOffline: async () => [],
});

const CACHE_KEY = "@erp_offline_cache";
const SYNC_QUEUE_KEY = "@erp_sync_queue";

function buildDefaultHandlers(): Map<string, SyncHandler> {
  const handlers = new Map<string, SyncHandler>();

  handlers.set("approval:approve", async (action) => {
    const { id, comments } = action.payload as { id: number; comments?: string };
    await api.approveRequest(id, typeof comments === "string" && comments ? comments : undefined);
  });

  handlers.set("approval:reject", async (action) => {
    const { id, comments } = action.payload as { id: number; comments?: string };
    await api.rejectRequest(id, typeof comments === "string" && comments ? comments : undefined);
  });

  handlers.set("field:visit_log", async (action) => {
    const p = action.payload as {
      customerName?: string;
      customerId?: number;
      notes?: string;
      photos?: string[];
      latitude?: number;
      longitude?: number;
      orderData?: Record<string, unknown>;
    };
    await api.createVisitLog(p);
  });

  handlers.set("field:production_report", async (action) => {
    const p = action.payload as {
      workOrderId?: number;
      type: string;
      quantityProduced?: number;
      reasonCode?: string;
      reasonText?: string;
      severity?: string;
      description?: string;
      photos?: string[];
    };
    await api.createProductionReport(p);
  });

  handlers.set("field:maintenance_update", async (action) => {
    const p = action.payload as { id: number; data: Record<string, unknown> };
    await api.updateMaintenanceOrder(p.id, p.data);
  });

  handlers.set("field:onsite_order", async (action) => {
    const p = action.payload as {
      customerId?: number;
      customerName?: string;
      items: { name: string; quantity: number; priceAgorot: number; productId?: number; itemNumber?: string }[];
      totalAgorot: number;
      notes?: string;
    };
    await api.createOnsiteOrder(p);
  });

  return handlers;
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({
    isConnected: true,
    isInternetReachable: true as boolean | null,
  });
  const [cachedData, setCachedDataState] = useState<Record<string, unknown>>({});
  const [syncQueue, setSyncQueue] = useState<SyncAction[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(defaultSyncProgress);
  const [pendingMutationCount, setPendingMutationCount] = useState(0);

  const prevConnected = useRef(true);
  const syncHandlers = useRef<Map<string, SyncHandler>>(buildDefaultHandlers());
  const syncQueueRef = useRef<SyncAction[]>([]);
  const isSyncingRef = useRef(false);

  syncQueueRef.current = syncQueue;

  useEffect(() => {
    const unsub = subscribeSyncProgress((progress) => {
      setSyncProgress(progress);
      if (
        (progress.status === "complete" || progress.status === "error") &&
        progress.conflictsDetected > 0
      ) {
        Alert.alert(
          "התנגשויות בסנכרון",
          `זוהו ${progress.conflictsDetected} התנגשויות בין נתונים מקומיים לשרת. פתח מסך סנכרון לפרטים.`,
          [
            { text: "סגור", style: "cancel" },
            { text: "פתח סנכרון", onPress: () => router.push("/sync-status" as never) },
          ]
        );
      }
    });
    return unsub;
  }, []);

  const refreshPendingCount = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const count = await offlineDb.getPendingMutationCount();
      setPendingMutationCount(count);
    } catch {}
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 30000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  const runQueue = useCallback(async () => {
    if (isSyncingRef.current) return;
    const queue = syncQueueRef.current;
    if (queue.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    const remaining: SyncAction[] = [];

    for (const action of queue) {
      const handler = syncHandlers.current.get(action.type);
      if (!handler) {
        remaining.push(action);
        continue;
      }
      try {
        await handler(action);
      } catch {
        remaining.push(action);
      }
    }

    setSyncQueue(remaining);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
    setLastSyncAt(new Date());
    setIsSyncing(false);
    isSyncingRef.current = false;
  }, []);

  useEffect(() => {
    (async () => {
      const cacheRaw = await AsyncStorage.getItem(CACHE_KEY);
      if (cacheRaw) {
        try { setCachedDataState(JSON.parse(cacheRaw)); } catch {}
      }

      const queueRaw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      if (queueRaw) {
        try {
          const q: SyncAction[] = JSON.parse(queueRaw);
          if (q.length > 0) {
            setSyncQueue(q);
            const netState = await NetInfo.fetch();
            if (netState.isConnected) {
              setTimeout(runQueue, 2000);
            }
          }
        } catch {}
      }

      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        flushOfflineGpsPings().catch(() => {});
      }
    })();
  }, [runQueue]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((netState) => {
      const connected = !!netState.isConnected;
      setState({
        isConnected: connected,
        isInternetReachable: netState.isInternetReachable,
      });

      if (connected && !prevConnected.current) {
        runQueue();
        flushPendingMutations()
          .then(() => refreshPendingCount())
          .catch(() => {});
        flushOfflineGpsPings().catch(() => {});
        runFullSync().catch(() => {});
      }
      prevConnected.current = connected;
    });
    return () => unsub();
  }, [runQueue, refreshPendingCount]);

  const setCachedData = useCallback((key: string, data: unknown) => {
    setCachedDataState((prev) => {
      const next = { ...prev, [key]: data };
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getCachedData = useCallback(<T,>(key: string): T | null => {
    return (cachedData[key] as T) ?? null;
  }, [cachedData]);

  const addToSyncQueue = useCallback((action: Omit<SyncAction, "id" | "createdAt">) => {
    const newAction: SyncAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    };
    setSyncQueue((prev) => {
      const next = [...prev, newAction];
      AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearSyncQueue = useCallback(() => {
    setSyncQueue([]);
    AsyncStorage.removeItem(SYNC_QUEUE_KEY);
    setLastSyncAt(new Date());
  }, []);

  const registerSyncHandler = useCallback((type: string, handler: SyncHandler) => {
    syncHandlers.current.set(type, handler);
  }, []);

  const triggerFullSync = useCallback(async () => {
    await runFullSync();
    await flushPendingMutations();
    await refreshPendingCount();
  }, [refreshPendingCount]);

  const enqueueOfflineMutation = useCallback(async (
    type: string, endpoint: string, method: string, payload: unknown,
    dirtyTable?: string, dirtyRecordId?: number
  ) => {
    if (Platform.OS === "web") return;
    await offlineDb.addPendingMutation(type, endpoint, method, payload);
    if (dirtyTable && dirtyRecordId != null) {
      await offlineDb.markRecordDirty(dirtyTable, dirtyRecordId);
    }
    await refreshPendingCount();
  }, [refreshPendingCount]);

  const searchOffline = useCallback(async (dataType: string, query: string): Promise<Record<string, unknown>[]> => {
    if (Platform.OS === "web") return [];
    switch (dataType) {
      case "customers": return offlineDb.searchOfflineCustomers(query);
      case "products": return offlineDb.searchOfflineProducts(query);
      case "inventory": return offlineDb.searchOfflineInventory(query);
      case "work_orders": return offlineDb.getOfflineWorkOrders(query || undefined);
      case "price_lists": return offlineDb.getOfflinePriceLists();
      default: return [];
    }
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        ...state,
        cachedData,
        setCachedData,
        getCachedData,
        syncQueue,
        addToSyncQueue,
        clearSyncQueue,
        registerSyncHandler,
        isSyncing,
        lastSyncAt,
        syncProgress,
        pendingMutationCount,
        triggerFullSync,
        enqueueOfflineMutation,
        searchOffline,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
