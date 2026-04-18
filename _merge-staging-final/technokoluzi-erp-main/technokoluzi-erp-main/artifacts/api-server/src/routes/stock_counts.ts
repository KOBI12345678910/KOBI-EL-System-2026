import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// סניטציה של שמות עמודות - מניעת SQL injection דרך שמות שדות
const sanitizeColumnName = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, "");

router.get("/stock-counts", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM stock_counts ORDER BY id DESC LIMIT 200");
    res.json(result.rows);
  } catch (err: any) {
    // שגיאה בשליפת ספירות מלאי
    console.error("Error fetching stock_counts:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.get("/stock-counts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query("SELECT * FROM stock_counts WHERE id = $1", [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא / Not found" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    // שגיאה בשליפת ספירת מלאי לפי מזהה
    console.error("Error fetching stock_count by id:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.post("/stock-counts", async (req, res) => {
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
    const result = await pool.query(`INSERT INTO stock_counts (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    // שגיאה ביצירת ספירת מלאי
    console.error("Error creating stock_count:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.put("/stock-counts/:id", async (req, res) => {
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
    const result = await pool.query(`UPDATE stock_counts SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
    if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא לעדכון / Not found for update" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    // שגיאה בעדכון ספירת מלאי
    console.error("Error updating stock_count:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.delete("/stock-counts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await pool.query("DELETE FROM stock_counts WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err: any) {
    // שגיאה במחיקת ספירת מלאי
    console.error("Error deleting stock_count:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

export default router;
