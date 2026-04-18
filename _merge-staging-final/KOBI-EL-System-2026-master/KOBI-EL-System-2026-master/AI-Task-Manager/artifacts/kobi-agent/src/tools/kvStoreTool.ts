import * as fs from "fs";
import * as path from "path";
import { writeFile } from "./fileTool";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const KV_FILE = path.join(WORKSPACE_DIR, ".agent", "kv-store.json");

let store: Record<string, { value: any; expiresAt?: number; createdAt: string; updatedAt: string }> = {};
let saveDebounceTimer: NodeJS.Timeout | undefined;

function loadStore() { try { if (fs.existsSync(KV_FILE)) store = JSON.parse(fs.readFileSync(KV_FILE, "utf-8")); } catch {} }
function saveStore() { const dir = path.dirname(KV_FILE); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(KV_FILE, JSON.stringify(store, null, 2)); }
function debounceSave() { if (saveDebounceTimer) clearTimeout(saveDebounceTimer); saveDebounceTimer = setTimeout(() => saveStore(), 500); }
function isExpired(entry: { expiresAt?: number }): boolean { return !!(entry.expiresAt && Date.now() > entry.expiresAt); }
function cleanExpired() { for (const k of Object.keys(store)) { if (isExpired(store[k])) delete store[k]; } }

loadStore();

export async function kvSet(params: { key: string; value: any; ttl?: number }): Promise<{ success: boolean; output: string }> {
  store[params.key] = { value: params.value, expiresAt: params.ttl ? Date.now() + params.ttl * 1000 : undefined, createdAt: store[params.key]?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  debounceSave();
  return { success: true, output: `SET "${params.key}"${params.ttl ? ` (TTL: ${params.ttl}s)` : ""}` };
}

export async function kvGet(params: { key: string }): Promise<{ success: boolean; output: string }> {
  const entry = store[params.key];
  if (!entry) return { success: true, output: `"${params.key}": null` };
  if (isExpired(entry)) { delete store[params.key]; debounceSave(); return { success: true, output: `"${params.key}": expired` }; }
  return { success: true, output: `"${params.key}": ${JSON.stringify(entry.value)}` };
}

export async function kvDelete(params: { key: string }): Promise<{ success: boolean; output: string }> {
  if (!(params.key in store)) return { success: false, output: `"${params.key}" not found` };
  delete store[params.key];
  debounceSave();
  return { success: true, output: `Deleted "${params.key}"` };
}

export async function kvList(params: { prefix?: string }): Promise<{ success: boolean; output: string }> {
  cleanExpired();
  let keys = Object.keys(store);
  if (params.prefix) keys = keys.filter(k => k.startsWith(params.prefix!));
  if (!keys.length) return { success: true, output: "No keys found" };
  return { success: true, output: keys.map(k => { const e = store[k]; return `${k}: ${JSON.stringify(e.value).slice(0, 100)} (updated: ${e.updatedAt})`; }).join("\n") };
}

export async function kvClear(params?: { prefix?: string }): Promise<{ success: boolean; output: string }> {
  if (params?.prefix) {
    const keys = Object.keys(store).filter(k => k.startsWith(params.prefix!));
    for (const k of keys) delete store[k];
    saveStore();
    return { success: true, output: `Cleared ${keys.length} keys with prefix "${params.prefix}"` };
  }
  const count = Object.keys(store).length;
  store = {};
  saveStore();
  return { success: true, output: `Cleared ${count} keys` };
}

export async function kvIncrement(params: { key: string; by?: number }): Promise<{ success: boolean; output: string }> {
  const entry = store[params.key];
  const current = entry ? (typeof entry.value === "number" ? entry.value : 0) : 0;
  const newVal = current + (params.by || 1);
  store[params.key] = { value: newVal, createdAt: entry?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  debounceSave();
  return { success: true, output: `"${params.key}": ${newVal}` };
}

export async function kvDecrement(params: { key: string; by?: number }): Promise<{ success: boolean; output: string }> {
  return kvIncrement({ key: params.key, by: -(params.by || 1) });
}

export async function kvGetAll(): Promise<{ success: boolean; output: string }> {
  cleanExpired();
  const count = Object.keys(store).length;
  return { success: true, output: `KV Store: ${count} keys\n${JSON.stringify(store, null, 2).slice(0, 3000)}` };
}

export async function kvHas(params: { key: string }): Promise<{ success: boolean; output: string }> {
  const entry = store[params.key];
  if (!entry || isExpired(entry)) return { success: true, output: `"${params.key}": false` };
  return { success: true, output: `"${params.key}": true` };
}

export async function kvPush(params: { key: string; value: any }): Promise<{ success: boolean; output: string }> {
  const entry = store[params.key];
  const arr = (entry && !isExpired(entry) && Array.isArray(entry.value)) ? entry.value : [];
  arr.push(params.value);
  store[params.key] = { value: arr, createdAt: entry?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  debounceSave();
  return { success: true, output: `Pushed to "${params.key}" (length: ${arr.length})` };
}

export async function kvPop(params: { key: string }): Promise<{ success: boolean; output: string }> {
  const entry = store[params.key];
  if (!entry || isExpired(entry) || !Array.isArray(entry.value) || !entry.value.length) return { success: true, output: `"${params.key}": null (empty or not array)` };
  const val = entry.value.pop();
  store[params.key] = { ...entry, updatedAt: new Date().toISOString() };
  debounceSave();
  return { success: true, output: `Popped from "${params.key}": ${JSON.stringify(val)} (remaining: ${entry.value.length})` };
}

export async function kvEntries(params: { prefix?: string }): Promise<{ success: boolean; output: string }> {
  cleanExpired();
  let keys = Object.keys(store);
  if (params.prefix) keys = keys.filter(k => k.startsWith(params.prefix!));
  const entries = keys.map(k => [k, store[k].value]);
  return { success: true, output: JSON.stringify(Object.fromEntries(entries), null, 2).slice(0, 5000) };
}

export async function generateKVRoutes(): Promise<{ success: boolean; output: string }> {
  const BT = "`";
  const code = [
    "import * as fs from 'fs';",
    "import * as path from 'path';",
    "import { Router, Request, Response } from 'express';",
    "",
    "export class KVStore {",
    "  private data: Map<string, { value: any; expiresAt?: number }> = new Map();",
    "  private filePath: string;",
    "  private autoSave: boolean;",
    "  private saveTimer?: NodeJS.Timeout;",
    "",
    "  constructor(storePath: string, options?: { autoSave?: boolean }) {",
    "    this.filePath = storePath;",
    "    this.autoSave = options?.autoSave ?? true;",
    "    this.load();",
    "    if (this.autoSave) this.saveTimer = setInterval(() => this.save(), 5000);",
    "  }",
    "",
    "  get<T = any>(key: string): T | null {",
    "    const entry = this.data.get(key);",
    "    if (!entry) return null;",
    "    if (entry.expiresAt && Date.now() > entry.expiresAt) { this.data.delete(key); return null; }",
    "    return entry.value as T;",
    "  }",
    "",
    "  set(key: string, value: any, ttlSeconds?: number): void {",
    "    this.data.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });",
    "    if (this.autoSave) this.debounceSave();",
    "  }",
    "",
    "  delete(key: string): boolean {",
    "    const deleted = this.data.delete(key);",
    "    if (deleted && this.autoSave) this.debounceSave();",
    "    return deleted;",
    "  }",
    "",
    "  has(key: string): boolean { return this.get(key) !== null; }",
    "",
    "  keys(prefix?: string): string[] {",
    "    this.cleanExpired();",
    "    const allKeys = Array.from(this.data.keys());",
    "    return prefix ? allKeys.filter(k => k.startsWith(prefix)) : allKeys;",
    "  }",
    "",
    "  values(prefix?: string): any[] { return this.keys(prefix).map(k => this.get(k)); }",
    "  entries(prefix?: string): Array<[string, any]> { return this.keys(prefix).map(k => [k, this.get(k)]); }",
    "  size(): number { this.cleanExpired(); return this.data.size; }",
    "",
    "  clear(prefix?: string): number {",
    "    if (!prefix) { const c = this.data.size; this.data.clear(); this.save(); return c; }",
    "    let c = 0;",
    "    for (const key of this.keys(prefix)) { this.data.delete(key); c++; }",
    "    this.save();",
    "    return c;",
    "  }",
    "",
    "  increment(key: string, amount = 1): number {",
    "    const newVal = (this.get<number>(key) || 0) + amount;",
    "    this.set(key, newVal);",
    "    return newVal;",
    "  }",
    "",
    "  decrement(key: string, amount = 1): number { return this.increment(key, -amount); }",
    "",
    "  push(key: string, value: any): number {",
    "    const arr = this.get<any[]>(key) || [];",
    "    arr.push(value);",
    "    this.set(key, arr);",
    "    return arr.length;",
    "  }",
    "",
    "  pop(key: string): any {",
    "    const arr = this.get<any[]>(key);",
    "    if (!arr?.length) return null;",
    "    const val = arr.pop();",
    "    this.set(key, arr);",
    "    return val;",
    "  }",
    "",
    "  middleware() { return (req: any, _res: any, next: any) => { req.kv = this; next(); }; }",
    "",
    "  getRoutes(): Router {",
    "    const kv = this;",
    "    const router = Router();",
    "    router.get('/:key', (req: Request, res: Response) => {",
    "      const value = kv.get(req.params.key as string);",
    "      if (value === null) return res.status(404).json({ error: 'Not found' });",
    "      res.json({ key: req.params.key, value });",
    "    });",
    "    router.put('/:key', (req: Request, res: Response) => {",
    "      kv.set(req.params.key as string, req.body.value, req.body.ttl);",
    "      res.json({ success: true });",
    "    });",
    "    router.delete('/:key', (req: Request, res: Response) => {",
    "      res.json({ deleted: kv.delete(req.params.key as string) });",
    "    });",
    "    router.get('/', (req: Request, res: Response) => {",
    "      const prefix = req.query.prefix as string;",
    "      res.json({ keys: kv.keys(prefix), size: kv.size() });",
    "    });",
    "    return router;",
    "  }",
    "",
    "  private cleanExpired(): void {",
    "    const now = Date.now();",
    "    for (const [key, entry] of this.data) { if (entry.expiresAt && now > entry.expiresAt) this.data.delete(key); }",
    "  }",
    "",
    "  private save(): void {",
    "    const dir = path.dirname(this.filePath);",
    "    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });",
    "    fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.data.entries()), null, 2));",
    "  }",
    "",
    "  private load(): void {",
    "    try {",
    "      if (fs.existsSync(this.filePath)) {",
    "        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));",
    "        for (const [key, entry] of data) this.data.set(key, entry);",
    "        this.cleanExpired();",
    "      }",
    "    } catch {}",
    "  }",
    "",
    "  private saveDebounceTimer?: NodeJS.Timeout;",
    "  private debounceSave(): void {",
    "    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);",
    "    this.saveDebounceTimer = setTimeout(() => this.save(), 500);",
    "  }",
    "",
    "  destroy(): void {",
    "    if (this.saveTimer) clearInterval(this.saveTimer);",
    "    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);",
    "    this.save();",
    "  }",
    "}",
    "",
    "export const kv = new KVStore('./data/kv-store.json');",
  ].join("\n");
  await writeFile({ path: "src/kv/index.ts", content: code });
  return { success: true, output: "KV Store class generated → src/kv/index.ts\nFeatures: get/set/delete/has, TTL, prefix keys/values/entries, increment/decrement, push/pop (arrays), Express middleware + REST routes, auto-save with debounce, file persistence" };
}

export const KV_STORE_TOOLS = [
  { name: "kv_set", description: "Set a key-value pair with optional TTL", input_schema: { type: "object" as const, properties: { key: { type: "string" }, value: {}, ttl: { type: "number", description: "TTL in seconds" } }, required: ["key", "value"] as string[] } },
  { name: "kv_get", description: "Get a value by key", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "kv_delete", description: "Delete a key-value pair", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "kv_list", description: "List all keys, optionally filtered by prefix", input_schema: { type: "object" as const, properties: { prefix: { type: "string" } }, required: [] as string[] } },
  { name: "kv_clear", description: "Clear all key-value pairs, optionally by prefix", input_schema: { type: "object" as const, properties: { prefix: { type: "string" } }, required: [] as string[] } },
  { name: "kv_increment", description: "Increment a numeric value (atomic counter)", input_schema: { type: "object" as const, properties: { key: { type: "string" }, by: { type: "number", description: "Increment by (default 1)" } }, required: ["key"] as string[] } },
  { name: "kv_decrement", description: "Decrement a numeric value (atomic counter)", input_schema: { type: "object" as const, properties: { key: { type: "string" }, by: { type: "number", description: "Decrement by (default 1)" } }, required: ["key"] as string[] } },
  { name: "kv_get_all", description: "Get all key-value pairs with stats", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "kv_has", description: "Check if a key exists (respects TTL)", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "kv_push", description: "Push a value onto an array stored at key", input_schema: { type: "object" as const, properties: { key: { type: "string" }, value: {} }, required: ["key", "value"] as string[] } },
  { name: "kv_pop", description: "Pop a value from an array stored at key", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "kv_entries", description: "Get all key-value entries, optionally filtered by prefix", input_schema: { type: "object" as const, properties: { prefix: { type: "string" } }, required: [] as string[] } },
  { name: "generate_kv_routes", description: "Generate KV Store class with Express REST routes, middleware, TTL, push/pop, increment/decrement, file persistence", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];
