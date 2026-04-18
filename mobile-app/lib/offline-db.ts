import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

const DB_NAME = "erp_offline.db";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (Platform.OS === "web") {
    throw new Error("SQLite not supported on web");
  }
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await runMigrations(db);
  return db;
}

async function runMigrations(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);
  `);

  const row = await database.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_version WHERE id = 1"
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        data_type TEXT PRIMARY KEY,
        last_synced_at TEXT,
        last_server_timestamp TEXT,
        record_count INTEGER DEFAULT 0,
        size_bytes INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_customers (
        id INTEGER PRIMARY KEY,
        name TEXT,
        company_name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        tax_id TEXT,
        status TEXT DEFAULT 'active',
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT,
        is_dirty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_products (
        id INTEGER PRIMARY KEY,
        item_number TEXT,
        item_name TEXT,
        category TEXT,
        unit TEXT,
        cost_per_unit INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT,
        is_dirty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_price_lists (
        id INTEGER PRIMARY KEY,
        name TEXT,
        product_id INTEGER,
        price_agorot INTEGER DEFAULT 0,
        currency TEXT DEFAULT 'ILS',
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT,
        is_dirty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_work_orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT,
        product_name TEXT,
        status TEXT,
        priority TEXT,
        quantity INTEGER DEFAULT 0,
        planned_start TEXT,
        planned_end TEXT,
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT,
        is_dirty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_inventory (
        id INTEGER PRIMARY KEY,
        item_name TEXT,
        item_number TEXT,
        category TEXT,
        quantity_on_hand INTEGER DEFAULT 0,
        reorder_point INTEGER DEFAULT 0,
        warehouse_location TEXT,
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT,
        is_dirty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS conflict_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        local_data TEXT,
        server_data TEXT,
        resolution TEXT DEFAULT 'server_wins',
        resolved_at TEXT DEFAULT (datetime('now')),
        reviewed INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pending_mutations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mutation_type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'POST',
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        retry_count INTEGER DEFAULT 0,
        last_error TEXT
      );

      UPDATE schema_version SET version = 1, updated_at = datetime('now') WHERE id = 1;
    `);
  }

  if (currentVersion < 2) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS offline_wms_pick_lists (
        id INTEGER PRIMARY KEY,
        list_number TEXT,
        order_number TEXT,
        customer_name TEXT,
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'pending',
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT DEFAULT (datetime('now')),
        is_dirty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_wms_count_tasks (
        id INTEGER PRIMARY KEY,
        zone TEXT,
        location_code TEXT,
        description TEXT,
        item_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        assigned_date TEXT,
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT DEFAULT (datetime('now')),
        is_dirty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS offline_wms_putaway (
        id INTEGER PRIMARY KEY,
        receipt_id INTEGER,
        receipt_number TEXT,
        item_code TEXT,
        item_description TEXT,
        barcode TEXT,
        quantity REAL DEFAULT 0,
        unit TEXT,
        suggested_location TEXT,
        status TEXT DEFAULT 'pending',
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT DEFAULT (datetime('now')),
        is_dirty INTEGER DEFAULT 0
      );

      UPDATE schema_version SET version = 2, updated_at = datetime('now') WHERE id = 1;
    `);
  }

  if (currentVersion < 3) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS offline_purchase_orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT,
        supplier_id INTEGER,
        supplier_name TEXT,
        status TEXT DEFAULT 'open',
        data_json TEXT,
        server_updated_at TEXT,
        local_updated_at TEXT DEFAULT (datetime('now')),
        is_dirty INTEGER DEFAULT 0
      );

      UPDATE schema_version SET version = 3, updated_at = datetime('now') WHERE id = 1;
    `);
  }

  if (currentVersion < 4) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_gps_pings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        battery_level REAL,
        speed REAL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      UPDATE schema_version SET version = 4, updated_at = datetime('now') WHERE id = 1;
    `);
  }
}

export async function getLastServerTimestamp(dataType: string): Promise<string | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ last_server_timestamp: string | null }>(
    "SELECT last_server_timestamp FROM sync_meta WHERE data_type = ?",
    [dataType]
  );
  return row?.last_server_timestamp ?? null;
}

export async function upsertWithConflictDetection(
  tableName: string, dataType: string, records: Record<string, unknown>[],
  getKey: (r: Record<string, unknown>) => number,
  buildValues: (r: Record<string, unknown>) => [string, unknown[]]
): Promise<{ synced: number; conflicts: number }> {
  const database = await getDb();
  let conflicts = 0;

  for (const serverRecord of records) {
    const recordId = getKey(serverRecord);
    const serverTs = String(serverRecord.updated_at || serverRecord.created_at || "");

    const existing = await database.getFirstAsync<{ data_json: string; is_dirty: number; local_updated_at: string | null }>(
      `SELECT data_json, is_dirty, local_updated_at FROM ${tableName} WHERE id = ?`,
      [recordId]
    );

    if (existing && existing.is_dirty === 1) {
      await logConflict(dataType, recordId, JSON.parse(existing.data_json), serverRecord, "server_wins");
      conflicts++;
    }

    const [sql, params] = buildValues(serverRecord);
    await database.runAsync(sql, [...params, serverTs, 0] as (string | number | null)[]);
  }

  const countRow = await database.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM ${tableName}`
  );
  const totalSize = JSON.stringify(records).length;

  let maxTs: string | null = null;
  for (const r of records) {
    const ts = String(r.updated_at || r.created_at || "");
    if (ts && (!maxTs || ts > maxTs)) maxTs = ts;
  }

  await database.runAsync(
    `INSERT OR REPLACE INTO sync_meta (data_type, last_synced_at, last_server_timestamp, record_count, size_bytes)
     VALUES (?, datetime('now'), ?, ?, ?)`,
    [dataType, maxTs, countRow?.cnt ?? records.length, totalSize]
  );

  return { synced: records.length, conflicts };
}

export async function upsertCustomers(customers: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_customers", "customers", customers,
    (c) => Number(c.id),
    (c) => [
      `INSERT OR REPLACE INTO offline_customers (id, name, company_name, email, phone, address, tax_id, status, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(c.id), String(c.name || ""), String(c.company_name || c.companyName || ""),
       String(c.email || ""), String(c.phone || ""), String(c.address || ""),
       String(c.tax_id || c.taxId || ""), String(c.status || "active"), JSON.stringify(c)]
    ]
  );
}

export async function upsertProducts(products: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_products", "products", products,
    (p) => Number(p.id),
    (p) => [
      `INSERT OR REPLACE INTO offline_products (id, item_number, item_name, category, unit, cost_per_unit, status, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(p.id), String(p.item_number || ""), String(p.item_name || ""),
       String(p.category || ""), String(p.unit || ""), Number(p.cost_per_unit || 0),
       String(p.status || "active"), JSON.stringify(p)]
    ]
  );
}

export async function upsertPriceLists(items: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_price_lists", "price_lists", items,
    (p) => Number(p.id),
    (p) => [
      `INSERT OR REPLACE INTO offline_price_lists (id, name, product_id, price_agorot, currency, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(p.id), String(p.name || ""), Number(p.product_id || 0),
       Number(p.price_agorot || p.price || 0), String(p.currency || "ILS"), JSON.stringify(p)]
    ]
  );
}

export async function upsertWorkOrders(orders: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_work_orders", "work_orders", orders,
    (o) => Number(o.id),
    (o) => [
      `INSERT OR REPLACE INTO offline_work_orders (id, order_number, product_name, status, priority, quantity, planned_start, planned_end, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(o.id), String(o.order_number || ""), String(o.product_name || ""),
       String(o.status || ""), String(o.priority || ""), Number(o.quantity || 0),
       String(o.planned_start || ""), String(o.planned_end || ""), JSON.stringify(o)]
    ]
  );
}

export async function upsertInventory(items: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_inventory", "inventory", items,
    (i) => Number(i.id),
    (i) => [
      `INSERT OR REPLACE INTO offline_inventory (id, item_name, item_number, category, quantity_on_hand, reorder_point, warehouse_location, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(i.id), String(i.item_name || i.name || ""), String(i.item_number || ""),
       String(i.category || ""), Number(i.quantity_on_hand || i.quantity || 0),
       Number(i.reorder_point || 0), String(i.warehouse_location || i.location || ""),
       JSON.stringify(i)]
    ]
  );
}

export async function searchOfflineCustomers(query: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    `SELECT data_json FROM offline_customers WHERE name LIKE ? OR company_name LIKE ? OR phone LIKE ? LIMIT 50`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function searchOfflineProducts(query: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    `SELECT data_json FROM offline_products WHERE item_name LIKE ? OR item_number LIKE ? OR category LIKE ? LIMIT 50`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function searchOfflineInventory(query: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    `SELECT data_json FROM offline_inventory WHERE item_name LIKE ? OR item_number LIKE ? OR category LIKE ? LIMIT 50`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function getOfflineWorkOrders(status?: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const q = status
    ? "SELECT data_json FROM offline_work_orders WHERE status = ? ORDER BY id DESC LIMIT 100"
    : "SELECT data_json FROM offline_work_orders ORDER BY id DESC LIMIT 100";
  const rows = await database.getAllAsync<{ data_json: string }>(q, status ? [status] : []);
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function getOfflinePriceLists(): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM offline_price_lists ORDER BY id LIMIT 500"
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function addPendingMutation(type: string, endpoint: string, method: string, payload: unknown) {
  const database = await getDb();
  await database.runAsync(
    "INSERT INTO pending_mutations (mutation_type, endpoint, method, payload) VALUES (?, ?, ?, ?)",
    [type, endpoint, method, JSON.stringify(payload)]
  );
}

export async function getPendingMutations(): Promise<{ id: number; mutation_type: string; endpoint: string; method: string; payload: string; retry_count: number }[]> {
  const database = await getDb();
  return database.getAllAsync(
    "SELECT id, mutation_type, endpoint, method, payload, retry_count FROM pending_mutations ORDER BY id ASC LIMIT 50"
  );
}

export async function removePendingMutation(id: number) {
  const database = await getDb();
  await database.runAsync("DELETE FROM pending_mutations WHERE id = ?", [id]);
}

export async function incrementMutationRetry(id: number, error: string) {
  const database = await getDb();
  await database.runAsync(
    "UPDATE pending_mutations SET retry_count = retry_count + 1, last_error = ? WHERE id = ?",
    [error, id]
  );
}

export async function getPendingMutationCount(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM pending_mutations"
  );
  return row?.cnt ?? 0;
}

export async function logConflict(
  dataType: string, recordId: number,
  localData: unknown, serverData: unknown, resolution: string
) {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO conflict_log (data_type, record_id, local_data, server_data, resolution) VALUES (?, ?, ?, ?, ?)`,
    [dataType, recordId, JSON.stringify(localData), JSON.stringify(serverData), resolution]
  );
}

export async function getUnreviewedConflicts(): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  return database.getAllAsync(
    "SELECT * FROM conflict_log WHERE reviewed = 0 ORDER BY resolved_at DESC LIMIT 50"
  );
}

export async function markConflictReviewed(id: number) {
  const database = await getDb();
  await database.runAsync("UPDATE conflict_log SET reviewed = 1 WHERE id = ?", [id]);
}

export async function getSyncMetaAll(): Promise<Record<string, { lastSyncedAt: string | null; lastServerTimestamp: string | null; recordCount: number; sizeBytes: number }>> {
  const database = await getDb();
  const rows = await database.getAllAsync<{
    data_type: string; last_synced_at: string | null; last_server_timestamp: string | null; record_count: number; size_bytes: number
  }>("SELECT * FROM sync_meta");
  const result: Record<string, { lastSyncedAt: string | null; lastServerTimestamp: string | null; recordCount: number; sizeBytes: number }> = {};
  for (const r of rows) {
    result[r.data_type] = {
      lastSyncedAt: r.last_synced_at,
      lastServerTimestamp: r.last_server_timestamp,
      recordCount: r.record_count,
      sizeBytes: r.size_bytes,
    };
  }
  return result;
}

export async function getStorageUsage(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ total: number }>(
    "SELECT COALESCE(SUM(size_bytes), 0) as total FROM sync_meta"
  );
  return row?.total ?? 0;
}

export async function upsertWmsPickLists(items: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_wms_pick_lists", "wms_pick_lists", items,
    (i) => Number(i.id),
    (i) => [
      `INSERT OR REPLACE INTO offline_wms_pick_lists (id, list_number, order_number, customer_name, priority, status, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(i.id), String(i.list_number || i.listNumber || ""), String(i.order_number || i.orderNumber || ""),
       String(i.customer_name || i.customerName || ""), String(i.priority || "normal"),
       String(i.status || "pending"), JSON.stringify(i)]
    ]
  );
}

export async function getOfflineWmsPickLists(status?: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    status
      ? `SELECT data_json FROM offline_wms_pick_lists WHERE status = ? ORDER BY id DESC LIMIT 100`
      : `SELECT data_json FROM offline_wms_pick_lists ORDER BY id DESC LIMIT 100`,
    status ? [status] : []
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function upsertWmsCountTasks(items: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_wms_count_tasks", "wms_count_tasks", items,
    (i) => Number(i.id),
    (i) => [
      `INSERT OR REPLACE INTO offline_wms_count_tasks (id, zone, location_code, description, item_count, status, assigned_date, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(i.id), String(i.zone || ""), String(i.location_code || i.locationCode || ""),
       String(i.description || ""), Number(i.item_count || i.itemCount || 0),
       String(i.status || "pending"), String(i.assigned_date || i.assignedDate || ""), JSON.stringify(i)]
    ]
  );
}

export async function getOfflineWmsCountTasks(status?: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    status
      ? `SELECT data_json FROM offline_wms_count_tasks WHERE status = ? ORDER BY id DESC LIMIT 100`
      : `SELECT data_json FROM offline_wms_count_tasks ORDER BY id DESC LIMIT 100`,
    status ? [status] : []
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function upsertWmsPutaway(items: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_wms_putaway", "wms_putaway", items,
    (i) => Number(i.id),
    (i) => [
      `INSERT OR REPLACE INTO offline_wms_putaway (id, receipt_id, receipt_number, item_code, item_description, barcode, quantity, unit, suggested_location, status, data_json, server_updated_at, is_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(i.id), Number(i.receipt_id || i.receiptId || 0), String(i.receipt_number || i.receiptNumber || ""),
       String(i.item_code || i.itemCode || ""), String(i.item_description || i.itemDescription || ""),
       String(i.barcode || ""), Number(i.quantity || 0), String(i.unit || ""),
       String(i.suggested_location || i.suggestedLocation || ""), String(i.status || "pending"), JSON.stringify(i)]
    ]
  );
}

export async function getOfflineWmsPutaway(status?: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    status
      ? `SELECT data_json FROM offline_wms_putaway WHERE status = ? ORDER BY id DESC LIMIT 100`
      : `SELECT data_json FROM offline_wms_putaway ORDER BY id DESC LIMIT 100`,
    status ? [status] : []
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function upsertPurchaseOrders(items: Record<string, unknown>[]) {
  return upsertWithConflictDetection("offline_purchase_orders", "purchase_orders", items,
    (item) => Number(item.id),
    (item) => [
      `INSERT OR REPLACE INTO offline_purchase_orders (id, order_number, supplier_id, supplier_name, status, data_json, server_updated_at, is_dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(item.id), item.order_number ?? item.orderNumber ?? null, Number(item.supplier_id ?? item.supplierId ?? 0) || null, item.supplier_name ?? item.supplierName ?? null, item.status ?? "open", JSON.stringify(item)]
    ]
  );
}

export async function searchOfflinePurchaseOrders(query: string): Promise<Record<string, unknown>[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data_json: string }>(
    `SELECT data_json FROM offline_purchase_orders WHERE order_number LIKE ? OR supplier_name LIKE ? ORDER BY id DESC LIMIT 50`,
    [`%${query}%`, `%${query}%`]
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

export async function getOfflinePurchaseOrderById(orderId: number): Promise<Record<string, unknown> | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ data_json: string }>(
    `SELECT data_json FROM offline_purchase_orders WHERE id = ? LIMIT 1`,
    [orderId]
  );
  return row ? JSON.parse(row.data_json) : null;
}

const VALID_TABLES = [
  "offline_customers", "offline_products", "offline_price_lists",
  "offline_work_orders", "offline_inventory",
  "offline_wms_pick_lists", "offline_wms_count_tasks", "offline_wms_putaway",
  "offline_purchase_orders",
] as const;

export async function markRecordDirty(tableName: string, recordId: number) {
  if (!VALID_TABLES.includes(tableName as typeof VALID_TABLES[number])) return;
  const database = await getDb();
  await database.runAsync(
    `UPDATE ${tableName} SET is_dirty = 1 WHERE id = ?`,
    [recordId]
  );
}

export interface PendingGpsPing {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  battery_level: number | null;
  speed: number | null;
  timestamp: string;
}

export async function addPendingGpsPing(ping: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  battery_level?: number | null;
  speed?: number | null;
  timestamp: string;
}): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "INSERT INTO pending_gps_pings (latitude, longitude, accuracy, battery_level, speed, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
    [ping.latitude, ping.longitude, ping.accuracy ?? null, ping.battery_level ?? null, ping.speed ?? null, ping.timestamp]
  );
}

export async function getPendingGpsPings(): Promise<PendingGpsPing[]> {
  const database = await getDb();
  return database.getAllAsync<PendingGpsPing>(
    "SELECT id, latitude, longitude, accuracy, battery_level, speed, timestamp FROM pending_gps_pings ORDER BY id ASC LIMIT 100"
  );
}

export async function removePendingGpsPing(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync("DELETE FROM pending_gps_pings WHERE id = ?", [id]);
}

export async function getPendingGpsPingCount(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM pending_gps_pings"
  );
  return row?.cnt ?? 0;
}

export async function clearAllOfflineData() {
  const database = await getDb();
  await database.execAsync(`
    DELETE FROM offline_customers;
    DELETE FROM offline_products;
    DELETE FROM offline_price_lists;
    DELETE FROM offline_work_orders;
    DELETE FROM offline_inventory;
    DELETE FROM offline_wms_pick_lists;
    DELETE FROM offline_wms_count_tasks;
    DELETE FROM offline_wms_putaway;
    DELETE FROM offline_purchase_orders;
    DELETE FROM sync_meta;
    DELETE FROM conflict_log;
    DELETE FROM pending_mutations;
    DELETE FROM pending_gps_pings;
  `);
}
