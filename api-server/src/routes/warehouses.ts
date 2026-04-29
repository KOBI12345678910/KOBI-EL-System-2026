import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { validateSession } from "../lib/auth";

const router: IRouter = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
router.use(requireAuth as any);

// B-SEC-SQL: explicit allowlist of writable columns. Adding a column requires
// adding it here. PK and timestamps are excluded — DB defaults manage them.
const WAREHOUSE_ALLOWED_COLUMNS = new Set<string>([
  "name", "code", "warehouse_type", "address", "manager_id",
  "capacity", "current_utilization", "notes", "is_active",
]);
const WAREHOUSE_BLOCKED_ON_UPDATE = new Set<string>(["id", "created_at", "updated_at"]);

function pickWarehouseColumns(body: Record<string, unknown>, opts: { isUpdate: boolean }): { keys: string[]; vals: unknown[] } {
  const keys: string[] = [];
  const vals: unknown[] = [];
  for (const k of Object.keys(body)) {
    if (opts.isUpdate && WAREHOUSE_BLOCKED_ON_UPDATE.has(k)) {
      throw new Error(`Field not updatable: ${k}`);
    }
    if (!WAREHOUSE_ALLOWED_COLUMNS.has(k)) {
      throw new Error(`Forbidden column: ${k}`);
    }
    keys.push(k);
    vals.push(body[k]);
  }
  return { keys, vals };
}

router.get("/warehouses", async (_req, res) => {
  const result = await pool.query("SELECT * FROM warehouses ORDER BY id DESC LIMIT 200");
  res.json(result.rows);
});

router.get("/warehouses/:id", async (req, res) => {
  const id = String(req.params.id);
  const result = await pool.query("SELECT * FROM warehouses WHERE id = $1", [id]);
  if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא" }); return; }
  res.json(result.rows[0]);
});

router.post("/warehouses", async (req, res) => {
  let keys: string[]; let vals: unknown[];
  try { ({ keys, vals } = pickWarehouseColumns(req.body || {}, { isUpdate: false })); }
  catch (err: any) { res.status(400).json({ error: err.message }); return; }
  if (keys.length === 0) { res.status(400).json({ error: "אין שדות לשמירה" }); return; }
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(`INSERT INTO warehouses (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals);
  res.status(201).json(result.rows[0]);
});

router.put("/warehouses/:id", async (req, res) => {
  const id = String(req.params.id);
  let keys: string[]; let vals: unknown[];
  try { ({ keys, vals } = pickWarehouseColumns(req.body || {}, { isUpdate: true })); }
  catch (err: any) { res.status(400).json({ error: err.message }); return; }
  if (keys.length === 0) { res.status(400).json({ error: "אין שדות לעדכון" }); return; }
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  vals.push(id);
  const result = await pool.query(`UPDATE warehouses SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
  res.json(result.rows[0]);
});

router.delete("/warehouses/:id", async (req, res) => {
  const id = String(req.params.id);
  await pool.query("DELETE FROM warehouses WHERE id = $1", [id]);
  res.json({ success: true });
});

export default router;
