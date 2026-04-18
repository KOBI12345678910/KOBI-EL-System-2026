// ============================================================
// analytics.drilldown_paths CRUD
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateDrilldownPathSchema,
  UpdateDrilldownPathSchema,
  ListDrilldownPathsQuerySchema,
} from "@workspace/api-zod/analytics";
import { authMiddleware } from "../../middleware/auth";
import {
  db,
  sql,
  type SQL,
  parseBody,
  parseQuery,
  parseUuidId,
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
  "path_code",
  "from_entity",
  "to_entity",
  "created_at",
  "updated_at",
]);
const ALLOWED_UPDATE_COLS = new Set([
  "path_code",
  "path_label_he",
  "from_entity",
  "to_entity",
  "link_field",
  "filter_template",
  "is_active",
  "notes",
  "metadata",
  "record_code",
  "updated_by",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListDrilldownPathsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q)
      conditions.push(
        sql`(path_code ILIKE ${"%" + q.q + "%"} OR path_label_he ILIKE ${"%" + q.q + "%"})`,
      );
    if (q.from_entity) conditions.push(sql`from_entity = ${q.from_entity}`);
    if (q.to_entity) conditions.push(sql`to_entity = ${q.to_entity}`);
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(
      q.order_by,
      q.order_dir,
      ALLOWED_ORDER_BY,
      "path_code",
      "asc",
    );
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.drilldown_paths ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.drilldown_paths ${where}`,
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
    sendDbError(res, err, "drilldown-paths:list");
  }
});

router.get("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`select * from analytics.drilldown_paths where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "מסלול drilldown לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "drilldown-paths:get");
  }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateDrilldownPathSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.drilldown_paths
        (path_code, path_label_he, from_entity, to_entity, link_field, filter_template,
         is_active, notes, metadata, created_by, updated_by)
      values
        (${d.path_code}, ${d.path_label_he ?? null}, ${d.from_entity}, ${d.to_entity},
         ${d.link_field ?? null}, ${jsonbParam(d.filter_template ?? {})}::jsonb,
         ${d.is_active ?? true}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "drilldown-paths:create");
  }
});

router.put("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const d = parseBody(UpdateDrilldownPathSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.filter_template !== undefined) updates.filter_template = jsonbParam(d.filter_template);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.drilldown_paths set ${fragment}, updated_at = now() where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "מסלול drilldown לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "drilldown-paths:update");
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update analytics.drilldown_paths
         set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now()
       where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "מסלול drilldown לא נמצא" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "drilldown-paths:delete");
  }
});

export default router;
