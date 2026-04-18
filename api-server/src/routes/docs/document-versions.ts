// ============================================================
// docs.document_versions CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateDocumentVersionSchema,
  UpdateDocumentVersionSchema,
  ListDocumentVersionsQuerySchema,
} from "@workspace/api-zod/docs";
import { authMiddleware } from "../../middleware/auth";
import {
  pool, parseBody, parseQuery, parseParamId,
  buildInsert, buildUpdate, sendDbError,
  buildSafeOrderBy, safeLimit, safeOffset,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED_ORDER = new Set(["id","document_id","version_number","is_current","created_at","updated_at"]);

router.get("/document-versions", async (req, res) => {
  const q = parseQuery(ListDocumentVersionsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted,false) = false"];
    const params: unknown[] = [];
    if (q.document_id !== undefined) { params.push(q.document_id); where.push(`document_id = $${params.length}`); }
    if (q.is_current !== undefined)  { params.push(q.is_current);  where.push(`is_current = $${params.length}`); }
    const orderBy = buildSafeOrderBy(q.order_by, q.order_dir, ALLOWED_ORDER, "id");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);
    const whereText = `WHERE ${where.join(" AND ")}`;
    const rows = await pool.query(`SELECT * FROM docs.document_versions ${whereText} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
    const count = await pool.query(`SELECT count(*)::bigint AS total FROM docs.document_versions ${whereText}`, params);
    res.json({ rows: rows.rows, total: Number(count.rows[0]?.total ?? 0), limit, offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/document-versions/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("SELECT * FROM docs.document_versions WHERE id = $1", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/document-versions", async (req, res) => {
  const data = parseBody(CreateDocumentVersionSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("docs.document_versions", { ...data, created_by: req.userId ?? null });
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/document-versions/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  const data = parseBody(UpdateDocumentVersionSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("docs.document_versions", { ...data, updated_by: req.userId ?? null }, "id", id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/document-versions/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("UPDATE docs.document_versions SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
