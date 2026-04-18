// ============================================================
// analytics.rm_* read-model summaries — READ-ONLY list endpoints.
// One endpoint per rm_* table using a whitelist to keep SQL safe.
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import { ListRmSummaryQuerySchema, RM_SUMMARY_KINDS } from "@workspace/api-zod/analytics";
import { authMiddleware } from "../../middleware/auth";
import {
  db,
  sql,
  type SQL,
  parseQuery,
  sendDbError,
  buildSafeWhere,
  buildSafeOrderByFragment,
  safeLimit,
  safeOffset,
  buildListResponse,
  safeDateParam,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

// table name whitelist — keys match api path segments
const RM_TABLES: Record<(typeof RM_SUMMARY_KINDS)[number], string> = {
  executive: "analytics.rm_executive_summary",
  operations: "analytics.rm_operations_summary",
  procurement: "analytics.rm_procurement_summary",
  finance: "analytics.rm_finance_summary",
  workforce: "analytics.rm_workforce_summary",
  ai: "analytics.rm_ai_summary",
};

const ALLOWED_ORDER = new Set(["id", "created_at", "updated_at", "snapshot_at"]);

async function listRmSummary(kind: (typeof RM_SUMMARY_KINDS)[number], req: Request, res: Response) {
  const q = parseQuery(ListRmSummaryQuerySchema, req, res);
  if (!q) return;
  const table = RM_TABLES[kind];
  if (!table) return res.status(404).json({ error: "read-model לא ידוע" });
  try {
    const conditions: SQL[] = [];
    const from = safeDateParam(q.from_date);
    const to = safeDateParam(q.to_date);
    if (from) conditions.push(sql`coalesce(created_at, now()) >= ${from}`);
    if (to) conditions.push(sql`coalesce(created_at, now()) <= ${to}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from ${sql.raw(table)} ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from ${sql.raw(table)} ${where}`,
    );
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({
      ...buildListResponse(rowsRes.rows ?? [], total, limit, offset),
      rows: rowsRes.rows ?? [],
      total,
      limit,
      offset,
      kind,
    });
  } catch (err) {
    sendDbError(res, err, `rm-summaries:${kind}:list`);
  }
}

router.get("/executive", (req, res) => listRmSummary("executive", req, res));
router.get("/operations", (req, res) => listRmSummary("operations", req, res));
router.get("/procurement", (req, res) => listRmSummary("procurement", req, res));
router.get("/finance", (req, res) => listRmSummary("finance", req, res));
router.get("/workforce", (req, res) => listRmSummary("workforce", req, res));
router.get("/ai", (req, res) => listRmSummary("ai", req, res));

// kind param style — /:kind
router.get("/:kind", (req, res) => {
  const kind = String(req.params.kind || "") as (typeof RM_SUMMARY_KINDS)[number];
  if (!RM_SUMMARY_KINDS.includes(kind)) {
    return res.status(400).json({ error: "סוג read-model לא תקין" });
  }
  return listRmSummary(kind, req, res);
});

export default router;
