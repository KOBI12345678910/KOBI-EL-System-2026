import { Router } from "express";
import {
  CreateSavedFilterSchema, UpdateSavedFilterSchema, ListSavedFiltersQuerySchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "filter_name", "entity_type", "created_at", "updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListSavedFiltersQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.user_id) c.push(sql`user_id = ${q.user_id}`);
    if (q.entity_type) c.push(sql`entity_type = ${q.entity_type}`);
    if (q.is_shared !== undefined) c.push(sql`is_shared = ${q.is_shared}`);
    if (q.q) c.push(sql`filter_name ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.saved_filters", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "saved-filters:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateSavedFilterSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.saved_filters (user_id, entity_type, filter_name, filter_json, is_shared, is_default, created_at, updated_at)
      values (${d.user_id}, ${d.entity_type}, ${d.filter_name}, ${JSON.stringify(d.filter_json ?? {})}::jsonb,
              ${d.is_shared ?? false}, ${d.is_default ?? false}, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_saved_filters", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "saved-filters:create"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`delete from governance.saved_filters where id = ${id} returning id`);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "פילטר לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_saved_filters", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "saved-filters:delete"); }
});

export default router;
