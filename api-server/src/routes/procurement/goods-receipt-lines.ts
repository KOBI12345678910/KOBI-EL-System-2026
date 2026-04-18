// procurement.goods_receipt_lines — read-only queries
import { Router, type IRouter } from "express";
import { pool, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/goods-receipt-lines", async (req, res) => {
  try {
    const goods_receipt_id = req.query.goods_receipt_id as string | undefined;
    const params: any[] = [];
    const where: string[] = ["1=1"];
    if (goods_receipt_id) { params.push(goods_receipt_id); where.push(`goods_receipt_id = $${params.length}`); }
    const r = await pool.query(
      `SELECT * FROM procurement.goods_receipt_lines WHERE ${where.join(" AND ")} ORDER BY goods_receipt_id, line_number LIMIT 1000`,
      params,
    );
    res.json({ rows: r.rows });
  } catch (err) { sendDbError(res, err); }
});

router.get("/goods-receipts/:id/lines", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.goods_receipt_lines WHERE goods_receipt_id = $1 ORDER BY line_number", [req.params.id]);
    res.json({ rows: r.rows });
  } catch (err) { sendDbError(res, err); }
});

export default router;
