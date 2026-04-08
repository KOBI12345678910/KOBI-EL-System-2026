import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || "10", 10),
  min: parseInt(process.env.DB_POOL_MIN || "2", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: 20000,
  query_timeout: 20000,
});

pool.on("error", (err) => {
  const msg = err.message ?? "";
  if (msg.includes("timeout") || msg.includes("exhausted") || msg.includes("too many clients")) {
    console.error("[Pool] connection exhausted/error", err.message);
  } else {
    console.error("[DB Pool] Unexpected error on idle client:", err.message);
  }
});

export const backgroundPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  min: 0,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  keepAlive: false,
  statement_timeout: 5000,
  query_timeout: 5000,
});

backgroundPool.on("error", (err) => {
  console.error("[BG Pool] Unexpected error on idle client:", err.message);
});

const POOL_MONITOR_INTERVAL_MS = 60_000;
const POOL_WARN_WAITING_THRESHOLD = 3;

let _poolMonitorStarted = false;

export function startPoolMonitor(): void {
  if (_poolMonitorStarted) return;
  _poolMonitorStarted = true;
  const handle = setInterval(() => {
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const waiting = pool.waitingCount;
    const active = total - idle;
    const level = waiting >= POOL_WARN_WAITING_THRESHOLD ? "warn" : "info";
    const msg = `[DB Pool] total=${total} active=${active} idle=${idle} waiting=${waiting} max=${pool.options.max ?? "?"}`;
    if (level === "warn") {
      console.warn(msg);
    } else {
      console.log(msg);
    }
  }, POOL_MONITOR_INTERVAL_MS);
  if (handle.unref) handle.unref();
}

const CONNECTION_MAX_LIFETIME_MS = 10 * 60 * 1000;

interface ClientMeta { expired: boolean; timer: ReturnType<typeof setTimeout> }
const clientMeta = new WeakMap<pg.PoolClient, ClientMeta>();

pool.on("connect", (client) => {
  const meta: ClientMeta = { expired: false, timer: setTimeout(() => { meta.expired = true; }, CONNECTION_MAX_LIFETIME_MS) };
  if (meta.timer.unref) meta.timer.unref();
  clientMeta.set(client, meta);
  client.once("end", () => clearTimeout(meta.timer));
});

const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  return (
    ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EPIPE", "57P01", "08006", "08001", "08004"].includes(code) ||
    msg.includes("Connection terminated") ||
    msg.includes("connection timeout") ||
    msg.includes("Connection refused") ||
    msg.includes("remaining connection slots are reserved") ||
    msg.includes("sorry, too many clients already")
  );
}

export async function connectWithRetry(): Promise<pg.PoolClient> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      const client = await pool.connect();
      if (clientMeta.get(client)?.expired) {
        client.release(true);
        continue;
      }
      return client;
    } catch (err) {
      lastErr = err;
      if (!isConnectionError(err) || attempt === RECONNECT_MAX_ATTEMPTS) {
        throw err;
      }
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timeout") || msg.includes("exhausted") || msg.includes("too many clients")) {
        console.error("[Pool] connection exhausted/error", msg);
      }
      console.warn(
        `[DB Pool] connect attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS} failed (${msg}), retrying in ${delay}ms`
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr ?? new Error("[DB Pool] max retry attempts exceeded");
}

export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./retry";
export * from "./circuit-breaker";
