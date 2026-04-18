// ============================================================
// analytics.dashboard_boards (+ dashboard_definitions alias)
// CRUD + attach widget + export
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateDashboardSchema,
  UpdateDashboardSchema,
  ListDashboardsQuerySchema,
  AttachWidgetSchema,
  ExportDashboardSchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "board_code", "board_name", "created_at", "updated_at"]);
// Note: dashboard_boards legacy column for active flag is `active` (not `is_active`).
const ALLOWED_UPDATE_COLS = new Set([
  "board_code",
  "board_name",
  "description",
  "active",
  "metadata",
  "record_code",
  "notes",
  "updated_by",
]);

// LIST
router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListDashboardsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q)
      conditions.push(
        sql`(board_code ILIKE ${"%" + q.q + "%"} OR board_name ILIKE ${"%" + q.q + "%"})`,
      );
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "id");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.dashboard_boards ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.dashboard_boards ${where}`,
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
    sendDbError(res, err, "dashboards:list");
  }
});

// READ (with widgets)
router.get("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  try {
    const b = await db.execute(
      sql`select * from analytics.dashboard_boards where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (b.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "דשבורד לא נמצא" });
    const w = await db.execute(sql`
      select bw.id, bw.title, bw.width_units, bw.height_units, bw.order_index, bw.config_payload,
             w.id as widget_id, w.widget_code, w.widget_name, w.data_source_type, w.data_source_ref
        from analytics.dashboard_board_widgets bw
        join analytics.dashboard_widgets w on w.id = bw.widget_id
       where bw.board_id = ${id} and coalesce(bw.active, true) = true
       order by bw.order_index asc, bw.id asc
    `);
    res.json({ ...row, widgets: w.rows ?? [] });
  } catch (err) {
    sendDbError(res, err, "dashboards:get");
  }
});

// CREATE
router.post("/", async (req, res) => {
  const d = parseBody(CreateDashboardSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.dashboard_boards
        (board_code, board_name, description, active, metadata, created_by, updated_by)
      values
        (${d.board_code}, ${d.board_name}, ${d.description ?? null},
         ${d.is_active ?? true}, ${jsonbParam(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "dashboards:create");
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(UpdateDashboardSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const { is_active, ...rest } = d;
    const updates: Record<string, unknown> = { ...rest, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (is_active !== undefined) updates.active = is_active;
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.dashboard_boards set ${fragment}, updated_at = now() where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "דשבורד לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "dashboards:update");
  }
});

// SOFT DELETE
router.delete("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update analytics.dashboard_boards
         set is_deleted = true, active = false, updated_by = ${uid}, updated_at = now()
       where id = ${id} returning id
    `);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "דשבורד לא נמצא" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "dashboards:delete");
  }
});

// ATTACH WIDGET
router.post("/:id/widgets", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(AttachWidgetSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.dashboard_board_widgets
        (board_id, widget_id, title, width_units, height_units, order_index, config_payload,
         created_by, updated_by)
      values
        (${id}, ${d.widget_id}, ${d.title}, ${d.width_units ?? 4}, ${d.height_units ?? 2},
         ${d.order_index ?? 0}, ${jsonbParam(d.config_payload ?? {})}::jsonb,
         ${uid}, ${uid})
      on conflict (board_id, widget_id) do update
        set title = excluded.title,
            width_units = excluded.width_units,
            height_units = excluded.height_units,
            order_index = excluded.order_index,
            config_payload = excluded.config_payload,
            updated_by = ${uid},
            updated_at = now()
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "dashboards:attach-widget");
  }
});

// EXPORT (CSV/PDF) — enqueues a report-run style record
router.post("/:id/export", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(ExportDashboardSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.report_runs
        (report_id, status, parameters, requested_by, metadata)
      select gen_random_uuid(), 'queued',
             ${jsonbParam({ board_id: id, filters: d.filters, format: d.format })}::jsonb,
             ${uid},
             ${jsonbParam({ source: "dashboard-export", board_id: id, format: d.format })}::jsonb
      returning id, status, created_at
    `);
    const row = (r.rows ?? [])[0];
    res.status(202).json({
      success: true,
      export: row,
      format: d.format,
      message: "ייצוא הדשבורד נשלח לעיבוד",
    });
  } catch (err) {
    sendDbError(res, err, "dashboards:export");
  }
});

export default router;
