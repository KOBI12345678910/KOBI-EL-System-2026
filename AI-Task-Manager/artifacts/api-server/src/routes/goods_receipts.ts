import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/goods-receipts", async (_req, res) => {
  const result = await pool.query("SELECT * FROM goods_receipts ORDER BY id DESC LIMIT 200");
  res.json(result.rows);
});

router.get("/goods-receipts/:id", async (req, res) => {
  const id = String(req.params.id);
  const result = await pool.query("SELECT * FROM goods_receipts WHERE id = $1", [id]);
  if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא" }); return; }
  res.json(result.rows[0]);
});

router.post("/goods-receipts", async (req, res) => {
  const data = req.body;
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(`INSERT INTO goods_receipts (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals);
  res.status(201).json(result.rows[0]);
});

router.put("/goods-receipts/:id", async (req, res) => {
  const id = String(req.params.id);
  const data = req.body;
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  vals.push(id);
  const result = await pool.query(`UPDATE goods_receipts SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
  res.json(result.rows[0]);
});

router.delete("/goods-receipts/:id", async (req, res) => {
  const id = String(req.params.id);
  await pool.query("DELETE FROM goods_receipts WHERE id = $1", [id]);
  res.json({ success: true });
});

export default router;
