import pkg from "pg";
const { Pool } = pkg;
import { drizzle } from "drizzle-orm/node-postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export { pool, db };
export default db;

export async function withCircuitBreaker<T>(
  fnOrLabel: (() => Promise<T>) | string,
  fnOrOptions?: (() => Promise<T>) | { maxFailures?: number; resetTimeMs?: number },
  options?: { maxFailures?: number; resetTimeMs?: number }
): Promise<T> {
  let fn: () => Promise<T>;
  if (typeof fnOrLabel === "string") {
    fn = fnOrOptions as () => Promise<T>;
  } else {
    fn = fnOrLabel;
  }
  return fn();
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  optionsOrRetries?: number | { label?: string; maxAttempts?: number; baseDelayMs?: number; retries?: number; delayMs?: number },
  delayMsArg?: number
): Promise<T> {
  let retries = 3;
  let delayMs = 1000;
  if (typeof optionsOrRetries === "number") {
    retries = optionsOrRetries;
    if (delayMsArg !== undefined) delayMs = delayMsArg;
  } else if (optionsOrRetries && typeof optionsOrRetries === "object") {
    retries = optionsOrRetries.maxAttempts ?? optionsOrRetries.retries ?? 3;
    delayMs = optionsOrRetries.baseDelayMs ?? optionsOrRetries.delayMs ?? 1000;
  }
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("withRetry exhausted");
}

export async function connectWithRetry(retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    let client: any = null;
    try {
      client = await pool.connect();
      await client.query("SELECT 1");
      return;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000));
    } finally {
      if (client) client.release();
    }
  }
  throw new Error("Failed to connect to database");
}
