// ============================================================
// analytics.kpi_snapshots — list + create + soft delete
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateKpiSnapshotSchema,
  UpdateKpiSnapshotSchema,
  ListKpiSnapshotsQuerySchema,
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
  safeDateParam,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER_BY = new Set([
  "id",
  "kpi_name",
  "snapshot_date",
  "created_at",
  "value",
]);
const ALLOWED_UPDATE_COLS = new Set([
  "kpi_name",
  "snapshot_date",
  "value",
  "target_value",
  "comparison_result",
  "dimensions",
  "notes",
  "metadata",
  "record_code",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListKpiSnapshotsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`kpi_name ILIKE ${"%" + q.q + "%"}`);
    if (q.kpi_name) conditions.push(sql`kpi_name = ${q.kpi_name}`);
    const from = safeDateParam(q.from_date);
    const to = safeDateParam(q.to_date);
    if (from) conditions.push(sql`snapshot_date >= ${from}`);
    if (to) conditions.push(sql`snapshot_date <= ${to}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(
      q.order_by,
      q.order_dir,
      ALLOWED_ORDER_BY,
      "snapshot_date",
    );
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.kpi_snapshots ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.kpi_snapshots ${where}`,
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
    sendDbError(res, err, "kpi-snapshots:list");
  }
});

router.get("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`select * from analytics.kpi_snapshots where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "סנאפשוט לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "kpi-snapshots:get");
  }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateKpiSnapshotSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.kpi_snapshots
        (kpi_name, snapshot_date, value, target_value, comparison_result, dimensions, notes,
         metadata, created_by)
      values
        (${d.kpi_name}, ${d.snapshot_date}, ${d.value}, ${d.target_value ?? null},
         ${d.comparison_result ?? null}, ${jsonbParam(d.dimensions ?? {})}::jsonb,
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "kpi-snapshots:create");
  }
});

router.put("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(UpdateKpiSnapshotSchema, req, res);
  if (!d) return;
  try {
    const updates: Record<string, unknown> = { ...d };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.dimensions !== undefined) updates.dimensions = jsonbParam(d.dimensions);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.kpi_snapshots set ${fragment} where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "סנאפשוט לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "kpi-snapshots:update");
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(sql`
      update analytics.kpi_snapshots set is_deleted = true where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "סנאפשוט לא נמצא" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "kpi-snapshots:delete");
  }
});

export default router;
