import { pool } from "@workspace/db";

let _dbAlive = false;
let _lastCheck = 0;
const CHECK_INTERVAL = 10_000;

export async function isDbAlive(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastCheck < CHECK_INTERVAL) return _dbAlive;
  _lastCheck = now;
  try {
    const result = await Promise.race([
      pool.query("SELECT 1"),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    _dbAlive = !!result;
  } catch {
    _dbAlive = false;
  }
  return _dbAlive;
}

export function getDbStatus(): boolean {
  return _dbAlive;
}

export function setDbAlive(v: boolean) {
  _dbAlive = v;
}
