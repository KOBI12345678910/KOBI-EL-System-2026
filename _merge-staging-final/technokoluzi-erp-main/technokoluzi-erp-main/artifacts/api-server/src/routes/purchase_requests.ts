import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// סניטציה של שמות עמודות - מניעת SQL injection דרך שמות שדות
const sanitizeColumnName = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, "");

router.get("/purchase-requests", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM purchase_requests ORDER BY id DESC LIMIT 200");
    res.json(result.rows);
  } catch (err: any) {
    // שגיאה בשליפת בקשות רכש
    console.error("Error fetching purchase_requests:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.get("/purchase-requests/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query("SELECT * FROM purchase_requests WHERE id = $1", [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא / Not found" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    // שגיאה בשליפת בקשת רכש לפי מזהה
    console.error("Error fetching purchase_request by id:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.post("/purchase-requests", async (req, res) => {
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
    const result = await pool.query(`INSERT INTO purchase_requests (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    // שגיאה ביצירת בקשת רכש
    console.error("Error creating purchase_request:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.put("/purchase-requests/:id", async (req, res) => {
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
    const result = await pool.query(`UPDATE purchase_requests SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
    if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא לעדכון / Not found for update" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    // שגיאה בעדכון בקשת רכש
    console.error("Error updating purchase_request:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

router.delete("/purchase-requests/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await pool.query("DELETE FROM purchase_requests WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err: any) {
    // שגיאה במחיקת בקשת רכש
    console.error("Error deleting purchase_request:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

export default router;
