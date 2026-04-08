import { backgroundPool } from "@workspace/db";

let _dbAlive = false;
let _lastCheck = 0;
const CHECK_INTERVAL = 60_000;

export async function isDbAlive(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastCheck < CHECK_INTERVAL) return _dbAlive;
  _lastCheck = now;
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    await client.query("SELECT 1");
    _dbAlive = true;
  } catch {
    _dbAlive = false;
  } finally {
    client?.release();
  }
  return _dbAlive;
}

export function getDbStatus(): boolean {
  return _dbAlive;
}

export function setDbAlive(v: boolean) {
  _dbAlive = v;
}
