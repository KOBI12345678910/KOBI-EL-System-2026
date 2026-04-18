// docs.document_signature_requests CRUD + record-signature business endpoint
import { Router, type IRouter } from "express";
import {
  CreateSignatureRequestSchema, UpdateSignatureRequestSchema, ListSignatureRequestsQuerySchema,
  RecordSignatureSchema,
} from "@workspace/api-zod/docs";
import { authMiddleware } from "../../middleware/auth";
import {
  pool, parseBody, parseQuery, parseParamId,
  buildInsert, buildUpdate, sendDbError,
  buildSafeOrderBy, safeLimit, safeOffset,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED_ORDER = new Set(["id","document_id","status","sent_at","completed_at","created_at","updated_at"]);

router.get("/signature-requests", async (req, res) => {
  const q = parseQuery(ListSignatureRequestsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted,false) = false"]; const params: unknown[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`request_number ILIKE $${params.length}`); }
    if (q.document_id !== undefined) { params.push(q.document_id); where.push(`document_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    const orderBy = buildSafeOrderBy(q.order_by, q.order_dir, ALLOWED_ORDER, "id");
    const limit = safeLimit(q.limit, 500); const offset = safeOffset(q.offset);
    const whereText = `WHERE ${where.join(" AND ")}`;
    const rows = await pool.query(`SELECT * FROM docs.document_signature_requests ${whereText} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
    const count = await pool.query(`SELECT count(*)::bigint AS total FROM docs.document_signature_requests ${whereText}`, params);
    res.json({ rows: rows.rows, total: Number(count.rows[0]?.total ?? 0), limit, offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/signature-requests/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("SELECT * FROM docs.document_signature_requests WHERE id = $1", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/signature-requests", async (req, res) => {
  const data = parseBody(CreateSignatureRequestSchema, req, res); if (!data) return;
  try {
    const q = buildInsert("docs.document_signature_requests", { ...data, created_by: req.userId ?? null });
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/signature-requests/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  const data = parseBody(UpdateSignatureRequestSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("docs.document_signature_requests", { ...data, updated_by: req.userId ?? null }, "id", id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/signature-requests/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("UPDATE docs.document_signature_requests SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// BUSINESS: record a single signature (increments signed_count, flips status when complete)
router.post("/signature-requests/:id/record-signature", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  const data = parseBody(RecordSignatureSchema, req, res); if (!data) return;
  try {
    const cur = await pool.query("SELECT * FROM docs.document_signature_requests WHERE id = $1", [id]);
    if (!cur.rowCount) return res.status(404).json({ error: "לא נמצא" });
    const row = cur.rows[0];
    const newSigned = Number(row.signed_count ?? 0) + 1;
    let newStatus: string = row.status;
    let completedAt: string | null = null;
    if (newSigned >= Number(row.total_signers ?? 1)) {
      newStatus = "signed";
      completedAt = new Date().toISOString();
    } else if (newSigned > 0) {
      newStatus = "partially_signed";
    }
    const upd = await pool.query(
      `UPDATE docs.document_signature_requests
         SET signed_count = $1, status = $2, completed_at = COALESCE($3, completed_at),
             updated_at = NOW(), updated_by = $4,
             metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{last_signer}',
                                  to_jsonb($5::text))
       WHERE id = $6
       RETURNING *`,
      [newSigned, newStatus, completedAt, req.userId ?? null, data.signer_name, id],
    );
    if (newStatus === "signed") {
      await pool.query(
        `UPDATE docs.documents SET signature_status = 'signed', updated_at = NOW() WHERE id = $1`,
        [row.document_id],
      );
    }
    res.json(upd.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

export default router;
