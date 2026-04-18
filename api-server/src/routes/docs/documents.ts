// ============================================================
// docs.documents CRUD + business endpoints
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateDocumentSchema,
  UpdateDocumentSchema,
  ListDocumentsQuerySchema,
} from "@workspace/api-zod/docs";
import { authMiddleware } from "../../middleware/auth";
import {
  pool,
  parseBody,
  parseQuery,
  parseParamId,
  buildInsert,
  buildUpdate,
  sendDbError,
  buildSafeOrderBy,
  safeLimit,
  safeOffset,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id",
  "document_number",
  "filename",
  "document_type",
  "status",
  "created_at",
  "updated_at",
]);

// LIST
router.get("/documents", async (req, res) => {
  const q = parseQuery(ListDocumentsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted,false) = false"];
    const params: unknown[] = [];
    if (q.q) {
      params.push(`%${q.q}%`);
      const p = `$${params.length}`;
      where.push(`(filename ILIKE ${p} OR document_number ILIKE ${p} OR original_filename ILIKE ${p})`);
    }
    if (q.status)             { params.push(q.status);             where.push(`status = $${params.length}`); }
    if (q.document_type)      { params.push(q.document_type);      where.push(`document_type = $${params.length}`); }
    if (q.parent_entity_type) { params.push(q.parent_entity_type); where.push(`parent_entity_type = $${params.length}`); }
    if (q.parent_entity_id !== undefined) { params.push(q.parent_entity_id); where.push(`parent_entity_id = $${params.length}`); }
    if (q.classification_status) { params.push(q.classification_status); where.push(`classification_status = $${params.length}`); }
    if (q.ocr_status)         { params.push(q.ocr_status);         where.push(`ocr_status = $${params.length}`); }

    const orderBy = buildSafeOrderBy(q.order_by, q.order_dir, ALLOWED_ORDER, "id");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const whereText = `WHERE ${where.join(" AND ")}`;
    const dataSql = `SELECT * FROM docs.documents ${whereText} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const countSql = `SELECT count(*)::bigint AS total FROM docs.documents ${whereText}`;
    const rows = await pool.query(dataSql, [...params, limit, offset]);
    const count = await pool.query(countSql, params);
    res.json({ rows: rows.rows, total: Number(count.rows[0]?.total ?? 0), limit, offset });
  } catch (err) { sendDbError(res, err); }
});

// READ
router.get("/documents/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("SELECT * FROM docs.documents WHERE id = $1", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// CREATE
router.post("/documents", async (req, res) => {
  const data = parseBody(CreateDocumentSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("docs.documents", { ...data, created_by: req.userId ?? null });
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// UPDATE
router.put("/documents/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  const data = parseBody(UpdateDocumentSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("docs.documents", { ...data, updated_by: req.userId ?? null }, "id", id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// SOFT DELETE
router.delete("/documents/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query(
      "UPDATE docs.documents SET is_deleted = true, status = 'deleted', updated_at = NOW() WHERE id = $1 RETURNING id",
      [id],
    );
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// BUSINESS: classify document (records a classification_run + updates status)
router.post("/documents/:id/classify", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const body = req.body as { classifier_name?: string; predicted_category?: string; confidence?: number } | undefined;
    const r = await pool.query(
      `INSERT INTO docs.classification_runs
         (document_id, classifier_name, predicted_category, confidence, status, completed_at, created_by)
       VALUES ($1, $2, $3, $4, 'complete', NOW(), $5)
       RETURNING *`,
      [id, body?.classifier_name ?? "default", body?.predicted_category ?? null, body?.confidence ?? null, req.userId ?? null],
    );
    if (body?.predicted_category) {
      await pool.query(
        `UPDATE docs.documents SET classification_status = $1, updated_at = NOW() WHERE id = $2`,
        [body.predicted_category, id],
      );
    }
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// BUSINESS: create a signature request for a document
router.post("/documents/:id/request-signature", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const body = req.body as {
      provider?: string;
      signer_names?: string[];
      signer_emails?: string[];
      total_signers?: number;
      expires_at?: string;
    } | undefined;
    const totalSigners = body?.total_signers ?? body?.signer_emails?.length ?? 1;
    const reqNumber = `SIGREQ-${Date.now()}-${id}`;
    const r = await pool.query(
      `INSERT INTO docs.document_signature_requests
         (request_number, document_id, provider, status, signer_names, signer_emails, total_signers, expires_at, created_by)
       VALUES ($1, $2, $3, 'sent', $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        reqNumber,
        id,
        body?.provider ?? null,
        body?.signer_names ?? null,
        body?.signer_emails ?? null,
        totalSigners,
        body?.expires_at ?? null,
        req.userId ?? null,
      ],
    );
    await pool.query(
      `UPDATE docs.documents SET signature_status = 'sent', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

export default router;
