// ============================================================
// analytics.dashboard_widgets CRUD
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateDashboardWidgetSchema,
  UpdateDashboardWidgetSchema,
  ListDashboardWidgetsQuerySchema,
} from "@workspace/api-zod/analytics";
import { authMiddleware } from "../../middleware/auth";
import {
  db,
  sql,
  type SQL,
  parseBody,
  parseQuery,
  parseIntId,
  sendDbError,
  getUserId,
  jsonbParam,
  buildSafeWhere,
  buildSafeOrderByFragment,
  buildSafeSetClause,
  safeLimit,
  safeOffset,
  buildListResponse,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER_BY = new Set([
  "id",
  "widget_code",
  "widget_name",
  "data_source_type",
  "created_at",
  "updated_at",
]);
// Note: dashboard_widgets legacy column for active flag is `active` (not `is_active`).
const ALLOWED_UPDATE_COLS = new Set([
  "widget_code",
  "widget_name",
  "data_source_type",
  "data_source_ref",
  "default_config",
  "active",
  "metadata",
  "record_code",
  "notes",
  "updated_by",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListDashboardWidgetsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q)
      conditions.push(
        sql`(widget_code ILIKE ${"%" + q.q + "%"} OR widget_name ILIKE ${"%" + q.q + "%"})`,
      );
    if (q.is_active !== undefined) conditions.push(sql`active = ${q.is_active}`);
    if (q.data_source_type) conditions.push(sql`data_source_type = ${q.data_source_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "id");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.dashboard_widgets ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.dashboard_widgets ${where}`,
    );
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({
      ...buildListResponse(rowsRes.rows ?? [], total, limit, offset),
      rows: rowsRes.rows ?? [],
      total,
      limit,
      offset,
    });
  } catch (err) {
    sendDbError(res, err, "dashboard-widgets:list");
  }
});

router.get("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`select * from analytics.dashboard_widgets where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "ווידג'ט לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "dashboard-widgets:get");
  }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateDashboardWidgetSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.dashboard_widgets
        (widget_code, widget_name, data_source_type, data_source_ref, default_config, active,
         metadata, created_by, updated_by)
      values
        (${d.widget_code}, ${d.widget_name}, ${d.data_source_type}, ${d.data_source_ref ?? null},
         ${jsonbParam(d.default_config ?? {})}::jsonb, ${d.is_active ?? true},
         ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "dashboard-widgets:create");
  }
});

router.put("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(UpdateDashboardWidgetSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const { is_active, ...rest } = d;
    const updates: Record<string, unknown> = { ...rest, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.default_config !== undefined) updates.default_config = jsonbParam(d.default_config);
    if (is_active !== undefined) updates.active = is_active;
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.dashboard_widgets set ${fragment}, updated_at = now() where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "ווידג'ט לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "dashboard-widgets:update");
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update analytics.dashboard_widgets
         set is_deleted = true, active = false, updated_by = ${uid}, updated_at = now()
       where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "ווידג'ט לא נמצא" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "dashboard-widgets:delete");
  }
});

export default router;
