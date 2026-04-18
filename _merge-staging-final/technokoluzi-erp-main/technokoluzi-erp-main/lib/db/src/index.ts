import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export { pool };
export async function connectWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { await pool.query("SELECT 1"); return; }
    catch (e) { if (i === retries - 1) throw e; await new Promise(r => setTimeout(r, 2000)); }
  }
}
