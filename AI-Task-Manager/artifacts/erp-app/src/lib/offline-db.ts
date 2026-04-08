import { openDB, DBSchema, IDBPDatabase } from "idb";

interface ERPOfflineDB extends DBSchema {
  customers: {
    key: number;
    value: {
      id: number;
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      cachedAt: number;
      [key: string]: unknown;
    };
    indexes: { "by-name": string };
  };
  products: {
    key: number;
    value: {
      id: number;
      name: string;
      sku?: string;
      price?: number;
      cachedAt: number;
      [key: string]: unknown;
    };
    indexes: { "by-sku": string };
  };
  priceLists: {
    key: number;
    value: {
      id: number;
      name: string;
      currency?: string;
      cachedAt: number;
      [key: string]: unknown;
    };
  };
  syncQueue: {
    key: number;
    value: {
      id?: number;
      url: string;
      method: string;
      body?: string;
      headers?: Record<string, string>;
      timestamp: number;
      retries: number;
      tag: string;
    };
    autoIncrement: true;
  };
  meta: {
    key: string;
    value: {
      key: string;
      value: unknown;
      updatedAt: number;
    };
  };
}

const DB_NAME = "erp-offline-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ERPOfflineDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ERPOfflineDB>> {
  if (!dbPromise) {
    try {
      dbPromise = openDB<ERPOfflineDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("customers")) {
            const customerStore = db.createObjectStore("customers", { keyPath: "id" });
            customerStore.createIndex("by-name", "name");
          }
          if (!db.objectStoreNames.contains("products")) {
            const productStore = db.createObjectStore("products", { keyPath: "id" });
            productStore.createIndex("by-sku", "sku");
          }
          if (!db.objectStoreNames.contains("priceLists")) {
            db.createObjectStore("priceLists", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("syncQueue")) {
            db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
          }
          if (!db.objectStoreNames.contains("meta")) {
            db.createObjectStore("meta", { keyPath: "key" });
          }
        },
      });
    } catch (err) {
      dbPromise = null;
      return Promise.reject(err);
    }
  }
  return dbPromise!
}

export async function cacheCustomers(customers: ERPOfflineDB["customers"]["value"][]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("customers", "readwrite");
  const now = Date.now();
  for (const customer of customers) {
    await tx.store.put({ ...customer, cachedAt: now });
  }
  await tx.done;
  await setMeta("customers_last_sync", Date.now());
}

export async function getCachedCustomers(): Promise<ERPOfflineDB["customers"]["value"][]> {
  const db = await getDB();
  return db.getAll("customers");
}

export async function cacheProducts(products: ERPOfflineDB["products"]["value"][]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("products", "readwrite");
  const now = Date.now();
  for (const product of products) {
    await tx.store.put({ ...product, cachedAt: now });
  }
  await tx.done;
  await setMeta("products_last_sync", Date.now());
}

export async function getCachedProducts(): Promise<ERPOfflineDB["products"]["value"][]> {
  const db = await getDB();
  return db.getAll("products");
}

export async function cachePriceLists(priceLists: ERPOfflineDB["priceLists"]["value"][]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("priceLists", "readwrite");
  const now = Date.now();
  for (const pl of priceLists) {
    await tx.store.put({ ...pl, cachedAt: now });
  }
  await tx.done;
  await setMeta("priceLists_last_sync", Date.now());
}

export async function getCachedPriceLists(): Promise<ERPOfflineDB["priceLists"]["value"][]> {
  const db = await getDB();
  return db.getAll("priceLists");
}

export async function addToSyncQueue(entry: Omit<ERPOfflineDB["syncQueue"]["value"], "id">): Promise<void> {
  const db = await getDB();
  await db.add("syncQueue", entry);
}

export async function getSyncQueue(): Promise<ERPOfflineDB["syncQueue"]["value"][]> {
  const db = await getDB();
  return db.getAll("syncQueue");
}

export async function removeSyncQueueItem(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", id);
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count("syncQueue");
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value, updatedAt: Date.now() });
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await getDB();
  const record = await db.get("meta", key);
  return record?.value;
}
