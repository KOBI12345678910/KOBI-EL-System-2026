// docs.knowledge_cards CRUD + generate-from-document business endpoint
import { Router, type IRouter } from "express";
import {
  CreateKnowledgeCardSchema, UpdateKnowledgeCardSchema, ListKnowledgeCardsQuerySchema,
} from "@workspace/api-zod/docs";
import { authMiddleware } from "../../middleware/auth";
import {
  pool, parseBody, parseQuery, parseParamId,
  buildInsert, buildUpdate, sendDbError,
  buildSafeOrderBy, safeLimit, safeOffset,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED_ORDER = new Set(["id","title","category","confidence_score","created_at","updated_at"]);

router.get("/knowledge-cards", async (req, res) => {
  const q = parseQuery(ListKnowledgeCardsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted,false) = false"]; const params: unknown[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(title ILIKE $${params.length} OR summary ILIKE $${params.length})`); }
    if (q.category) { params.push(q.category); where.push(`category = $${params.length}`); }
    if (q.source_document_id !== undefined) { params.push(q.source_document_id); where.push(`source_document_id = $${params.length}`); }
    const orderBy = buildSafeOrderBy(q.order_by, q.order_dir, ALLOWED_ORDER, "id");
    const limit = safeLimit(q.limit, 500); const offset = safeOffset(q.offset);
    const whereText = `WHERE ${where.join(" AND ")}`;
    const rows = await pool.query(`SELECT * FROM docs.knowledge_cards ${whereText} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
    const count = await pool.query(`SELECT count(*)::bigint AS total FROM docs.knowledge_cards ${whereText}`, params);
    res.json({ rows: rows.rows, total: Number(count.rows[0]?.total ?? 0), limit, offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/knowledge-cards/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("SELECT * FROM docs.knowledge_cards WHERE id = $1", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/knowledge-cards", async (req, res) => {
  const data = parseBody(CreateKnowledgeCardSchema, req, res); if (!data) return;
  try {
    const q = buildInsert("docs.knowledge_cards", { ...data, created_by: req.userId ?? null });
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/knowledge-cards/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  const data = parseBody(UpdateKnowledgeCardSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("docs.knowledge_cards", { ...data, updated_by: req.userId ?? null }, "id", id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/knowledge-cards/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("UPDATE docs.knowledge_cards SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// BUSINESS: generate a knowledge card from a source document
// Draws title/summary from the document header + most recent ocr_results row.
router.post("/knowledge-cards/generate-from-document/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const doc = await pool.query("SELECT * FROM docs.documents WHERE id = $1", [id]);
    if (!doc.rowCount) return res.status(404).json({ error: "מסמך לא נמצא" });
    const d = doc.rows[0];
    const ocr = await pool.query(
      "SELECT extracted_text, confidence_score FROM docs.ocr_results WHERE document_id = $1 ORDER BY processed_at DESC LIMIT 1",
      [id],
    );
    const text: string | null = ocr.rows[0]?.extracted_text ?? null;
    const summary = text ? text.slice(0, 600) : (d.notes ?? null);
    const body = req.body as { category?: string; tags?: string[] } | undefined;

    const insert = await pool.query(
      `INSERT INTO docs.knowledge_cards
         (title, summary, source_document_id, category, tags, content, confidence_score, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING *`,
      [
        d.filename ?? `Document ${d.document_number}`,
        summary,
        id,
        body?.category ?? d.document_type ?? "other",
        body?.tags ?? null,
        JSON.stringify({ source: "generate-from-document", document_number: d.document_number }),
        ocr.rows[0]?.confidence_score ?? null,
        req.userId ?? null,
      ],
    );
    res.status(201).json(insert.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

export default router;
