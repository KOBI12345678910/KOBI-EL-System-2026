import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_suppliers (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER,
      supplier_name VARCHAR(200) NOT NULL,
      email VARCHAR(200) UNIQUE NOT NULL,
      phone VARCHAR(50),
      password_hash VARCHAR(500) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active','suspended','pending')),
      last_login TIMESTAMPTZ,
      categories JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_supplier_sessions (
      id SERIAL PRIMARY KEY,
      portal_supplier_id INTEGER REFERENCES portal_suppliers(id) ON DELETE CASCADE,
      token VARCHAR(500) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_po_confirmations (
      id SERIAL PRIMARY KEY,
      portal_supplier_id INTEGER REFERENCES portal_suppliers(id) ON DELETE CASCADE,
      po_id INTEGER,
      po_number VARCHAR(100),
      items JSONB DEFAULT '[]',
      total_amount NUMERIC(14,2),
      status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','partially_confirmed','rejected')),
      confirmed_delivery_date DATE,
      notes TEXT,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_supplier_documents (
      id SERIAL PRIMARY KEY,
      portal_supplier_id INTEGER REFERENCES portal_suppliers(id) ON DELETE CASCADE,
      document_type VARCHAR(50) CHECK (document_type IN ('price_list','catalog','certificate','insurance','invoice','delivery_note')),
      title VARCHAR(300),
      file_url TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      status VARCHAR(30) DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected'))
    );
  `);
}
ensureTables().catch(console.error);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "technokoluzi_supplier_salt").digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

interface PortalSupplier {
  id: number;
  supplier_id: number | null;
  supplier_name: string;
  email: string;
  phone: string | null;
  status: string;
  categories: any;
}

interface SupplierAuthRequest extends Request {
  portalSupplier?: PortalSupplier;
}

async function requireSupplierAuth(req: SupplierAuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות לפורטל ספקים" }); return; }

  const { rows } = await pool.query(
    `SELECT ps.* FROM portal_suppliers ps
     JOIN portal_supplier_sessions pss ON pss.portal_supplier_id = ps.id
     WHERE pss.token = $1 AND pss.expires_at > NOW() AND ps.status = 'active'`,
    [token]
  );
  if (!rows[0]) { res.status(401).json({ error: "הסשן פג תוקף, נא להתחבר מחדש" }); return; }
  req.portalSupplier = rows[0];
  next();
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// Register
router.post("/supplier-portal/register", async (req: Request, res: Response) => {
  try {
    const { supplier_name, email, phone, password, supplier_id, categories } = req.body;
    if (!email || !password || !supplier_name) {
      res.status(400).json({ error: "נדרש שם ספק, אימייל וסיסמה" }); return;
    }
    const existing = await pool.query("SELECT id FROM portal_suppliers WHERE email = $1", [email]);
    if (existing.rows[0]) { res.status(409).json({ error: "אימייל כבר רשום במערכת" }); return; }

    const hash = hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO portal_suppliers (supplier_name, email, phone, password_hash, supplier_id, categories, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING *`,
      [supplier_name, email, phone || null, hash, supplier_id || null, JSON.stringify(categories || [])]
    );
    res.json({ ok: true, supplier: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Login
router.post("/supplier-portal/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "נדרש אימייל וסיסמה" }); return; }

    const hash = hashPassword(password);
    const { rows } = await pool.query(
      "SELECT * FROM portal_suppliers WHERE email = $1 AND password_hash = $2",
      [email, hash]
    );
    if (!rows[0]) { res.status(401).json({ error: "אימייל או סיסמה שגויים" }); return; }
    if (rows[0].status !== "active") { res.status(403).json({ error: "החשבון אינו פעיל" }); return; }

    const token = generateToken();
    const ip = req.ip || req.socket.remoteAddress || "";
    await pool.query(
      `INSERT INTO portal_supplier_sessions (portal_supplier_id, token, expires_at, ip_address)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', $3)`,
      [rows[0].id, token, ip]
    );
    await pool.query("UPDATE portal_suppliers SET last_login = NOW() WHERE id = $1", [rows[0].id]);

    res.json({
      ok: true,
      token,
      supplier: { id: rows[0].id, supplier_name: rows[0].supplier_name, email: rows[0].email },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// My Orders (POs)
router.get("/supplier-portal/my-orders", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;
    const { rows } = await pool.query(
      `SELECT * FROM portal_po_confirmations WHERE portal_supplier_id = $1 ORDER BY created_at DESC`,
      [sid]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Confirm PO
router.post("/supplier-portal/confirm-po/:poId", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;
    const poId = parseInt(req.params.poId);
    const { status, confirmed_delivery_date, notes } = req.body;

    const validStatuses = ["confirmed", "partially_confirmed", "rejected"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "סטטוס לא תקין. ניתן: confirmed, partially_confirmed, rejected" }); return;
    }

    const { rows } = await pool.query(
      `UPDATE portal_po_confirmations
       SET status = $1, confirmed_delivery_date = $2, notes = $3, confirmed_at = NOW()
       WHERE id = $4 AND portal_supplier_id = $5
       RETURNING *`,
      [status, confirmed_delivery_date || null, notes || null, poId, sid]
    );
    if (!rows[0]) { res.status(404).json({ error: "הזמנת רכש לא נמצאה" }); return; }
    res.json({ ok: true, po: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Update Delivery Date
router.post("/supplier-portal/update-delivery-date/:poId", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;
    const poId = parseInt(req.params.poId);
    const { confirmed_delivery_date, notes } = req.body;
    if (!confirmed_delivery_date) { res.status(400).json({ error: "נדרש תאריך אספקה" }); return; }

    const { rows } = await pool.query(
      `UPDATE portal_po_confirmations
       SET confirmed_delivery_date = $1, notes = COALESCE($2, notes)
       WHERE id = $3 AND portal_supplier_id = $4
       RETURNING *`,
      [confirmed_delivery_date, notes, poId, sid]
    );
    if (!rows[0]) { res.status(404).json({ error: "הזמנת רכש לא נמצאה" }); return; }
    res.json({ ok: true, po: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Upload Invoice
router.post("/supplier-portal/upload-invoice", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;
    const { title, file_url, po_id } = req.body;
    if (!file_url) { res.status(400).json({ error: "נדרש קישור לקובץ" }); return; }

    const { rows } = await pool.query(
      `INSERT INTO portal_supplier_documents (portal_supplier_id, document_type, title, file_url)
       VALUES ($1, 'invoice', $2, $3) RETURNING *`,
      [sid, title || `חשבונית - ${new Date().toLocaleDateString("he-IL")}`, file_url]
    );
    res.json({ ok: true, document: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Upload Document
router.post("/supplier-portal/upload-document", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;
    const { document_type, title, file_url } = req.body;
    if (!file_url || !document_type) { res.status(400).json({ error: "נדרש סוג מסמך וקישור לקובץ" }); return; }

    const validTypes = ["price_list", "catalog", "certificate", "insurance", "invoice", "delivery_note"];
    if (!validTypes.includes(document_type)) {
      res.status(400).json({ error: "סוג מסמך לא תקין" }); return;
    }

    const { rows } = await pool.query(
      `INSERT INTO portal_supplier_documents (portal_supplier_id, document_type, title, file_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sid, document_type, title || document_type, file_url]
    );
    res.json({ ok: true, document: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Payment Status
router.get("/supplier-portal/payment-status", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;
    // Get confirmed POs with amounts
    const { rows } = await pool.query(
      `SELECT id, po_number, total_amount, status, confirmed_delivery_date, confirmed_at, created_at
       FROM portal_po_confirmations WHERE portal_supplier_id = $1
       ORDER BY created_at DESC`,
      [sid]
    );

    const totalConfirmed = rows.filter((r: any) => r.status === "confirmed").reduce((sum: number, r: any) => sum + parseFloat(r.total_amount || 0), 0);
    const totalPending = rows.filter((r: any) => r.status === "pending").reduce((sum: number, r: any) => sum + parseFloat(r.total_amount || 0), 0);

    res.json({
      orders: rows,
      summary: { total_confirmed: totalConfirmed, total_pending: totalPending, total_orders: rows.length },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Report Issue
router.post("/supplier-portal/report-issue", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;
    const { po_id, issue_type, description } = req.body;
    if (!description) { res.status(400).json({ error: "נדרש תיאור הבעיה" }); return; }

    // Store as a supplier document entry with type metadata
    const { rows } = await pool.query(
      `INSERT INTO portal_supplier_documents (portal_supplier_id, document_type, title, file_url, status)
       VALUES ($1, 'delivery_note', $2, $3, 'pending_review') RETURNING *`,
      [
        sid,
        `דיווח בעיה: ${issue_type || "כללי"}`,
        JSON.stringify({ issue_type, description, po_id, reported_at: new Date().toISOString() }),
      ]
    );
    res.json({ ok: true, issue: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Dashboard
router.get("/supplier-portal/dashboard", requireSupplierAuth as any, async (req: SupplierAuthRequest, res: Response) => {
  try {
    const sid = req.portalSupplier!.id;

    const [posResult, docsResult, pendingResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM portal_po_confirmations WHERE portal_supplier_id = $1", [sid]),
      pool.query("SELECT COUNT(*) as count FROM portal_supplier_documents WHERE portal_supplier_id = $1", [sid]),
      pool.query("SELECT COUNT(*) as count FROM portal_po_confirmations WHERE portal_supplier_id = $1 AND status = 'pending'", [sid]),
    ]);

    const recentPOs = await pool.query(
      `SELECT * FROM portal_po_confirmations WHERE portal_supplier_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [sid]
    );

    const recentDocs = await pool.query(
      `SELECT * FROM portal_supplier_documents WHERE portal_supplier_id = $1 ORDER BY uploaded_at DESC LIMIT 5`,
      [sid]
    );

    res.json({
      supplier: {
        name: req.portalSupplier!.supplier_name,
        email: req.portalSupplier!.email,
        categories: req.portalSupplier!.categories,
      },
      stats: {
        total_pos: parseInt(posResult.rows[0].count),
        total_documents: parseInt(docsResult.rows[0].count),
        pending_confirmations: parseInt(pendingResult.rows[0].count),
      },
      recent_pos: recentPOs.rows,
      recent_documents: recentDocs.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
