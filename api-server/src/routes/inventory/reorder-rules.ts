// inventory.reorder_rules CRUD + POST /trigger
import { Router, type IRouter } from "express";
import {
  CreateReorderRuleSchema,
  UpdateReorderRuleSchema,
  ListReorderRulesQuerySchema,
  TriggerReorderRulesSchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "material_id", "warehouse_id", "status", "min_qty", "reorder_qty", "created_at", "updated_at"]);

router.get("/reorder-rules", async (req, res) => {
  const q = parseQuery(ListReorderRulesQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "id"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.reorder_rules WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.reorder_rules WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/reorder-rules/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.reorder_rules WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/reorder-rules", async (req, res) => {
  const data = parseBody(CreateReorderRuleSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.reorder_rules", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/reorder-rules/:id", async (req, res) => {
  const data = parseBody(UpdateReorderRuleSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.reorder_rules", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/reorder-rules/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.reorder_rules SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// POST /reorder-rules/trigger — evaluate active rules, return PO suggestions
router.post("/reorder-rules/trigger", async (req, res) => {
  const data = parseBody(TriggerReorderRulesSchema, req, res); if (!data) return;
  try {
    const where: string[] = ["r.status = 'active'", "coalesce(r.is_deleted, false) = false"];
    const params: any[] = [];
    if (data.warehouse_id !== undefined && data.warehouse_id !== null) {
      params.push(data.warehouse_id);
      where.push(`(r.warehouse_id = $${params.length} OR r.warehouse_id IS NULL)`);
    }
    if (data.material_ids && data.material_ids.length > 0) {
      params.push(data.material_ids);
      where.push(`r.material_id = ANY($${params.length}::bigint[])`);
    }

    const sql = `
      SELECT r.*,
             coalesce(i.on_hand_qty, 0)   AS on_hand_qty,
             coalesce(i.available_qty, 0) AS available_qty,
             m.name                       AS material_name,
             m.material_code              AS material_code
        FROM inventory.reorder_rules r
        JOIN inventory.materials m ON m.id = r.material_id
        LEFT JOIN inventory.inventory i
          ON i.material_id = r.material_id
         AND (r.warehouse_id IS NULL OR i.warehouse_id = r.warehouse_id)
       WHERE ${where.join(" AND ")}
    `;
    const r = await pool.query(sql, params);
    const suggestions = r.rows
      .filter((row: any) => Number(row.available_qty) <= Number(row.min_qty))
      .map((row: any) => ({
        rule_id: row.id,
        material_id: row.material_id,
        material_code: row.material_code,
        material_name: row.material_name,
        warehouse_id: row.warehouse_id,
        preferred_supplier_id: row.preferred_supplier_id,
        on_hand_qty: Number(row.on_hand_qty),
        available_qty: Number(row.available_qty),
        min_qty: Number(row.min_qty),
        reorder_qty: Number(row.reorder_qty),
        lead_time_days: row.lead_time_days,
      }));

    if (!data.dry_run && suggestions.length > 0) {
      // Stamp last_triggered_at
      const ids = suggestions.map((s: any) => s.rule_id);
      await pool.query(
        "UPDATE inventory.reorder_rules SET last_triggered_at = NOW(), updated_at = NOW() WHERE id = ANY($1::bigint[])",
        [ids],
      );
    }

    res.json({
      evaluated: r.rows.length,
      suggestion_count: suggestions.length,
      suggestions,
      dry_run: data.dry_run,
      generated_at: new Date().toISOString(),
    });
  } catch (err) { sendDbError(res, err); }
});

export default router;
