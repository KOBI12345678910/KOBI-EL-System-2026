import { Router } from "express";
import { Signatures } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";

const router = Router();
router.use(requireExecutionAuth);

router.get("/", asyncHandler(async (req, res) => {
  const q = validate(Signatures.ListSignaturesQuerySchema, req.query, res);
  if (!q) return;
  const filters: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q.entity_type) { filters.push(`entity_type = $${i++}`); params.push(q.entity_type); }
  if (q.entity_id)   { filters.push(`entity_id = $${i++}`);   params.push(q.entity_id); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await query(
    `SELECT * FROM execution.signatures ${where} ORDER BY signed_at DESC LIMIT $${i++} OFFSET $${i}`,
    [...params, q.limit, q.offset]
  );
  res.json({ data: rows });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const rows = await query(`SELECT * FROM execution.signatures WHERE id = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: "Signature not found" }); return; }
  res.json({ data: rows[0] });
}));

router.post("/", asyncHandler(async (req, res) => {
  const v = validate(Signatures.CreateSignatureSchema, req.body, res);
  if (!v) return;
  const rows = await query(
    `INSERT INTO execution.signatures (entity_type, entity_id, signer_name, signer_role, signed_at, signature_payload, document_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
    [v.entity_type, v.entity_id, v.signer_name, v.signer_role, v.signed_at,
      JSON.stringify(v.signature_payload ?? {}), v.document_id, v.notes]
  );
  await audit(req, "execution.signatures", (rows[0] as { id: number }).id, "INSERT", null, rows[0]);
  res.status(201).json({ data: rows[0] });
}));

export default router;
