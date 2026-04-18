import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// סניטציה של שמות עמודות - מניעת SQL injection דרך שמות שדות
const sanitizeColumnName = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, "");

router.get("/goods-receipts", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM goods_receipts ORDER BY id DESC LIMIT 200");
    res.json(result.rows);
  } catch (err: any) {
    // שגיאה בשליפת קבלות סחורה
    console.error("Error fetching goods_receipts:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.get("/goods-receipts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query("SELECT * FROM goods_receipts WHERE id = $1", [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא / Not found" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    // שגיאה בשליפת קבלת סחורה לפי מזהה
    console.error("Error fetching goods_receipt by id:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.post("/goods-receipts", async (req, res) => {
  try {
    const data = req.body;
    // ולידציה - בדיקה שהגוף לא ריק
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      res.status(400).json({ error: "Request body is empty / גוף הבקשה ריק" });
      return;
    }
    const keys = Object.keys(data).map(sanitizeColumnName);
    const vals = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const result = await pool.query(`INSERT INTO goods_receipts (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    // שגיאה ביצירת קבלת סחורה
    console.error("Error creating goods_receipt:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.put("/goods-receipts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const data = req.body;
    // ולידציה - בדיקה שהגוף לא ריק
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      res.status(400).json({ error: "Request body is empty / גוף הבקשה ריק" });
      return;
    }
    const keys = Object.keys(data).map(sanitizeColumnName);
    const vals = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    vals.push(id);
    const result = await pool.query(`UPDATE goods_receipts SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
    if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא לעדכון / Not found for update" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    // שגיאה בעדכון קבלת סחורה
    console.error("Error updating goods_receipt:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.delete("/goods-receipts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await pool.query("DELETE FROM goods_receipts WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err: any) {
    // שגיאה במחיקת קבלת סחורה
    console.error("Error deleting goods_receipt:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

export default router;
