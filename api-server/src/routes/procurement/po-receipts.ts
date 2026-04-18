// procurement.po_receipts (legacy alias view over goods_receipts)
import { Router, type IRouter } from "express";
import { ListPoReceiptsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseQuery, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/po-receipts", async (req, res) => {
  const q = parseQuery(ListPoReceiptsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.po_id) { params.push(q.po_id); where.push(`po_id = $${params.length}`); }
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.po_receipts WHERE ${where.join(" AND ")} ORDER BY receipt_date DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/po-receipts/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.po_receipts WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

export default router;
