import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuthMw } from "../lib/require-auth-mw";

const router: IRouter = Router();
router.use(requireAuthMw as any);

// B-SEC-SQL: explicit allowlist of writable supplier columns. Sources: seed-fix.sql,
// seed-factory-data.sql, factory-seed.ts. Add columns here only after a Drizzle
// migration adds them to the table. PK and timestamps are excluded.
const SUPPLIER_ALLOWED_COLUMNS = new Set<string>([
  "supplier_number", "supplier_name", "name", "contact_person", "phone", "mobile",
  "email", "address", "city", "country", "country_code", "category", "supply_type",
  "supplier_type", "payment_terms", "lead_time_days", "vat_number", "status",
  "activity_field", "material_types", "currency", "credit_days", "rating",
  "quality_rating", "delivery_rating", "price_rating", "quality_score",
  "delivery_score", "on_time_delivery_pct", "preferred_supplier", "is_active",
  "notes", "tax_id", "bank_account", "website",
]);
const SUPPLIER_BLOCKED_ON_UPDATE = new Set<string>(["id", "created_at", "updated_at"]);

function pickSupplierColumns(body: Record<string, unknown>, opts: { isUpdate: boolean; dropEmpty?: boolean }): { keys: string[]; vals: unknown[] } {
  const keys: string[] = [];
  const vals: unknown[] = [];
  for (const k of Object.keys(body)) {
    if (opts.isUpdate && SUPPLIER_BLOCKED_ON_UPDATE.has(k)) {
      throw new Error(`Field not updatable: ${k}`);
    }
    if (!SUPPLIER_ALLOWED_COLUMNS.has(k)) {
      throw new Error(`Forbidden column: ${k}`);
    }
    const v = body[k];
    if (opts.dropEmpty && (v === undefined || v === "")) continue;
    keys.push(k);
    vals.push(v === "" ? null : v);
  }
  return { keys, vals };
}

router.get("/suppliers", async (req, res) => {
  try {
    const { search, status, category } = req.query;
    let q = "SELECT * FROM suppliers WHERE 1=1";
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (supplier_name ILIKE $${params.length} OR supplier_number ILIKE $${params.length} OR city ILIKE $${params.length} OR contact_person ILIKE $${params.length})`;
    }
    if (status && status !== "all") {
      params.push(status);
      q += ` AND status = $${params.length}`;
    }
    if (category && category !== "all") {
      params.push(category);
      q += ` AND category = $${params.length}`;
    }
    q += " ORDER BY id DESC LIMIT 500";
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/suppliers/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query("SELECT * FROM suppliers WHERE id = $1", [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/suppliers", async (req, res) => {
  try {
    const { keys, vals } = pickSupplierColumns(req.body || {}, { isUpdate: false, dropEmpty: true });
    if (keys.length === 0) return res.status(400).json({ message: "אין שדות לשמירה" });
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const result = await pool.query(`INSERT INTO suppliers (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
      return res.status(409).json({ message: "מספר ספק כבר קיים" });
    }
    res.status(400).json({ message: err.message });
  }
});

router.put("/suppliers/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const { keys, vals } = pickSupplierColumns(req.body || {}, { isUpdate: true });
    if (keys.length === 0) return res.status(400).json({ message: "אין שדות לעדכון" });
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    vals.push(id);
    const result = await pool.query(`UPDATE suppliers SET ${sets}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, vals);
    if (result.rows.length === 0) return res.status(404).json({ message: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await pool.query("DELETE FROM suppliers WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/suppliers/:id/rating", async (req, res) => {
  try {
    const id = String(req.params.id);
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: "דירוג חייב להיות בין 1 ל-5" });
    const result = await pool.query("UPDATE suppliers SET rating = $1, updated_at = NOW() WHERE id = $2 RETURNING *", [rating, id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/suppliers/:id/contacts", async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query("SELECT * FROM supplier_contacts WHERE supplier_id = $1 ORDER BY id ASC", [id]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/suppliers/:id/contacts", async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);
    const { contactName, role, phone, mobile, email, notes } = req.body;
    if (!contactName) return res.status(400).json({ message: "שם איש קשר נדרש" });
    const result = await pool.query(
      "INSERT INTO supplier_contacts (supplier_id, contact_name, role, phone, mobile, email, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [supplierId, contactName, role || null, phone || null, mobile || null, email || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/supplier-contacts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const { contactName, role, phone, mobile, email, notes } = req.body;
    const result = await pool.query(
      "UPDATE supplier_contacts SET contact_name=$1, role=$2, phone=$3, mobile=$4, email=$5, notes=$6, updated_at=NOW() WHERE id=$7 RETURNING *",
      [contactName, role || null, phone || null, mobile || null, email || null, notes || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.delete("/supplier-contacts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await pool.query("DELETE FROM supplier_contacts WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/suppliers/:id/documents", async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query("SELECT * FROM supplier_documents WHERE supplier_id = $1 ORDER BY id DESC", [id]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/suppliers/:id/performance", async (req, res) => {
  try {
    const id = String(req.params.id);
    const perf = await pool.query("SELECT * FROM supplier_performance WHERE supplier_id = $1 ORDER BY evaluation_date DESC LIMIT 10", [id]);
    const orders = await pool.query(
      `SELECT COUNT(*) as total_orders,
        SUM(CASE WHEN status IN ('התקבל במלואו','התקבל חלקית') THEN 1 ELSE 0 END) as delivered_orders,
        SUM(total_amount::numeric) as total_spend,
        AVG(total_amount::numeric) as avg_order_value,
        COUNT(CASE WHEN expected_delivery IS NOT NULL AND (
          CASE WHEN status = 'התקבל במלואו' THEN created_at > expected_delivery::timestamp ELSE NOW() > expected_delivery::timestamp END
        ) THEN 1 END) as late_orders
      FROM purchase_orders WHERE supplier_id = $1`,
      [id]
    );
    const supplier = await pool.query("SELECT rating, quality_rating, delivery_rating, price_rating, on_time_delivery_pct FROM suppliers WHERE id = $1", [id]);
    res.json({
      performanceHistory: perf.rows,
      orderStats: orders.rows[0],
      currentRatings: supplier.rows[0] || {},
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/suppliers/:id/purchase-history", async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await pool.query(
      "SELECT * FROM purchase_orders WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 50",
      [id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
