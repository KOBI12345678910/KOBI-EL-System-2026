import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_customers (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      customer_name VARCHAR(200) NOT NULL,
      email VARCHAR(200) UNIQUE NOT NULL,
      phone VARCHAR(50),
      password_hash VARCHAR(500) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active','suspended','pending')),
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_sessions (
      id SERIAL PRIMARY KEY,
      portal_customer_id INTEGER REFERENCES portal_customers(id) ON DELETE CASCADE,
      token VARCHAR(500) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_messages (
      id SERIAL PRIMARY KEY,
      portal_customer_id INTEGER REFERENCES portal_customers(id) ON DELETE CASCADE,
      direction VARCHAR(30) DEFAULT 'customer_to_company' CHECK (direction IN ('customer_to_company','company_to_customer')),
      subject VARCHAR(300),
      message TEXT,
      attachments JSONB DEFAULT '[]',
      read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS portal_document_access (
      id SERIAL PRIMARY KEY,
      portal_customer_id INTEGER REFERENCES portal_customers(id) ON DELETE CASCADE,
      document_type VARCHAR(50) CHECK (document_type IN ('quote','invoice','contract','delivery_note','measurement','installation_report','warranty')),
      document_id INTEGER,
      title VARCHAR(300),
      url TEXT,
      requires_signature BOOLEAN DEFAULT false,
      signed BOOLEAN DEFAULT false,
      signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
ensureTables().catch(console.error);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "technokoluzi_portal_salt").digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

interface PortalCustomer {
  id: number;
  customer_id: number | null;
  customer_name: string;
  email: string;
  phone: string | null;
  status: string;
}

interface PortalAuthRequest extends Request {
  portalCustomer?: PortalCustomer;
}

async function requirePortalAuth(req: PortalAuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות לפורטל" }); return; }

  const { rows } = await pool.query(
    `SELECT pc.* FROM portal_customers pc
     JOIN portal_sessions ps ON ps.portal_customer_id = pc.id
     WHERE ps.token = $1 AND ps.expires_at > NOW() AND pc.status = 'active'`,
    [token]
  );
  if (!rows[0]) { res.status(401).json({ error: "הסשן פג תוקף, נא להתחבר מחדש" }); return; }
  req.portalCustomer = rows[0];
  next();
}

// ─── 18-Step Pipeline Definition ──────────────────────────────────────────────
const PIPELINE_STEPS = [
  { step: 1, name: "פנייה ראשונית", icon: "phone" },
  { step: 2, name: "תיאום מדידה", icon: "calendar" },
  { step: 3, name: "מדידה בשטח", icon: "ruler" },
  { step: 4, name: "הכנת הצעת מחיר", icon: "file-text" },
  { step: 5, name: "אישור הצעה", icon: "check-circle" },
  { step: 6, name: "חתימת חוזה", icon: "pen" },
  { step: 7, name: "קבלת מקדמה", icon: "credit-card" },
  { step: 8, name: "הזמנת חומרים", icon: "package" },
  { step: 9, name: "קבלת חומרים", icon: "truck" },
  { step: 10, name: "חיתוך וייצור", icon: "scissors" },
  { step: 11, name: "ריתוך והרכבה", icon: "wrench" },
  { step: 12, name: "צביעה/ציפוי", icon: "paintbrush" },
  { step: 13, name: "בקרת איכות", icon: "shield-check" },
  { step: 14, name: "תיאום התקנה", icon: "calendar-check" },
  { step: 15, name: "התקנה בשטח", icon: "hammer" },
  { step: 16, name: "בדיקה סופית", icon: "clipboard-check" },
  { step: 17, name: "חשבונית סופית", icon: "receipt" },
  { step: 18, name: "אחריות ושירות", icon: "heart" },
];

// ─── Endpoints ────────────────────────────────────────────────────────────────

// Register
router.post("/portal/customers/register", async (req: Request, res: Response) => {
  try {
    const { customer_name, email, phone, password, customer_id } = req.body;
    if (!email || !password || !customer_name) {
      res.status(400).json({ error: "נדרש שם, אימייל וסיסמה" }); return;
    }
    const existing = await pool.query("SELECT id FROM portal_customers WHERE email = $1", [email]);
    if (existing.rows[0]) { res.status(409).json({ error: "אימייל כבר רשום במערכת" }); return; }

    const hash = hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO portal_customers (customer_name, email, phone, password_hash, customer_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
      [customer_name, email, phone || null, hash, customer_id || null]
    );
    res.json({ ok: true, customer: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Login
router.post("/portal/customers/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "נדרש אימייל וסיסמה" }); return; }

    const hash = hashPassword(password);
    const { rows } = await pool.query(
      "SELECT * FROM portal_customers WHERE email = $1 AND password_hash = $2",
      [email, hash]
    );
    if (!rows[0]) { res.status(401).json({ error: "אימייל או סיסמה שגויים" }); return; }
    if (rows[0].status !== "active") { res.status(403).json({ error: "החשבון אינו פעיל" }); return; }

    const token = generateToken();
    const ip = req.ip || req.socket.remoteAddress || "";
    await pool.query(
      `INSERT INTO portal_sessions (portal_customer_id, token, expires_at, ip_address)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', $3)`,
      [rows[0].id, token, ip]
    );
    await pool.query("UPDATE portal_customers SET last_login = NOW() WHERE id = $1", [rows[0].id]);

    res.json({
      ok: true,
      token,
      customer: { id: rows[0].id, customer_name: rows[0].customer_name, email: rows[0].email, phone: rows[0].phone },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// My Projects (linked by customer_id to projects table)
router.get("/portal/my-projects", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const cid = req.portalCustomer!.customer_id;
    if (!cid) { res.json([]); return; }

    // Try to get projects from entity_records with type 'projects'
    const { rows } = await pool.query(
      `SELECT id, data, status, created_at FROM entity_records
       WHERE entity_type = 'projects' AND (data->>'customer_id')::int = $1
       ORDER BY created_at DESC`,
      [cid]
    );
    const projects = rows.map((r: any) => ({
      id: r.id,
      name: r.data?.project_name || r.data?.name || `פרויקט #${r.id}`,
      status: r.status || r.data?.status || "active",
      current_step: r.data?.pipeline_step || 1,
      pipeline: PIPELINE_STEPS,
      address: r.data?.address || "",
      created_at: r.created_at,
    }));
    res.json(projects);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// My Quotes
router.get("/portal/my-quotes", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const { rows } = await pool.query(
      `SELECT * FROM portal_document_access
       WHERE portal_customer_id = $1 AND document_type = 'quote'
       ORDER BY created_at DESC`,
      [custId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// My Invoices
router.get("/portal/my-invoices", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const { rows } = await pool.query(
      `SELECT * FROM portal_document_access
       WHERE portal_customer_id = $1 AND document_type = 'invoice'
       ORDER BY created_at DESC`,
      [custId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// My Documents
router.get("/portal/my-documents", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const { rows } = await pool.query(
      `SELECT * FROM portal_document_access
       WHERE portal_customer_id = $1
       ORDER BY created_at DESC`,
      [custId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Send message
router.post("/portal/messages", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const { subject, message, attachments } = req.body;
    if (!message) { res.status(400).json({ error: "נדרשת הודעה" }); return; }

    const { rows } = await pool.query(
      `INSERT INTO portal_messages (portal_customer_id, direction, subject, message, attachments)
       VALUES ($1, 'customer_to_company', $2, $3, $4) RETURNING *`,
      [custId, subject || "", message, JSON.stringify(attachments || [])]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get messages
router.get("/portal/messages", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const { rows } = await pool.query(
      `SELECT * FROM portal_messages WHERE portal_customer_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [custId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Sign document
router.post("/portal/sign-document/:docId", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const docId = parseInt(req.params.docId);
    const { rows } = await pool.query(
      `UPDATE portal_document_access SET signed = true, signed_at = NOW()
       WHERE id = $1 AND portal_customer_id = $2 AND requires_signature = true
       RETURNING *`,
      [docId, custId]
    );
    if (!rows[0]) { res.status(404).json({ error: "מסמך לא נמצא או לא דורש חתימה" }); return; }
    res.json({ ok: true, document: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Project status (pipeline view)
router.get("/portal/project-status/:projectId", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const cid = req.portalCustomer!.customer_id;
    const projectId = parseInt(req.params.projectId);

    const { rows } = await pool.query(
      `SELECT id, data, status, created_at FROM entity_records
       WHERE id = $1 AND entity_type = 'projects' AND (data->>'customer_id')::int = $2`,
      [projectId, cid]
    );
    if (!rows[0]) { res.status(404).json({ error: "פרויקט לא נמצא" }); return; }

    const currentStep = rows[0].data?.pipeline_step || 1;
    res.json({
      project: {
        id: rows[0].id,
        name: rows[0].data?.project_name || rows[0].data?.name || `פרויקט #${rows[0].id}`,
        status: rows[0].status,
        current_step: currentStep,
      },
      pipeline: PIPELINE_STEPS.map(s => ({
        ...s,
        status: s.step < currentStep ? "completed" : s.step === currentStep ? "current" : "pending",
      })),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Service Request
router.post("/portal/service-request", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const { project_id, issue_type, description, urgency, preferred_date } = req.body;
    if (!description) { res.status(400).json({ error: "נדרש תיאור הבעיה" }); return; }

    const { rows } = await pool.query(
      `INSERT INTO portal_messages (portal_customer_id, direction, subject, message, attachments)
       VALUES ($1, 'customer_to_company', $2, $3, $4) RETURNING *`,
      [
        custId,
        `בקשת שירות: ${issue_type || "כללי"}`,
        description,
        JSON.stringify({ type: "service_request", project_id, issue_type, urgency, preferred_date }),
      ]
    );
    res.json({ ok: true, request: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Dashboard
router.get("/portal/dashboard", requirePortalAuth as any, async (req: PortalAuthRequest, res: Response) => {
  try {
    const custId = req.portalCustomer!.id;
    const cid = req.portalCustomer!.customer_id;

    const [msgResult, docResult, unreadResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM portal_messages WHERE portal_customer_id = $1", [custId]),
      pool.query("SELECT COUNT(*) as count FROM portal_document_access WHERE portal_customer_id = $1", [custId]),
      pool.query("SELECT COUNT(*) as count FROM portal_messages WHERE portal_customer_id = $1 AND direction = 'company_to_customer' AND read = false", [custId]),
    ]);

    let projectCount = 0;
    let activeProjects: any[] = [];
    if (cid) {
      const projResult = await pool.query(
        `SELECT id, data, status, created_at FROM entity_records
         WHERE entity_type = 'projects' AND (data->>'customer_id')::int = $1
         ORDER BY created_at DESC LIMIT 5`,
        [cid]
      );
      projectCount = projResult.rows.length;
      activeProjects = projResult.rows.map((r: any) => ({
        id: r.id,
        name: r.data?.project_name || r.data?.name || `פרויקט #${r.id}`,
        status: r.status,
        current_step: r.data?.pipeline_step || 1,
        step_name: PIPELINE_STEPS[(r.data?.pipeline_step || 1) - 1]?.name || "",
      }));
    }

    const unsignedDocs = await pool.query(
      "SELECT COUNT(*) as count FROM portal_document_access WHERE portal_customer_id = $1 AND requires_signature = true AND signed = false",
      [custId]
    );

    res.json({
      customer: {
        name: req.portalCustomer!.customer_name,
        email: req.portalCustomer!.email,
      },
      stats: {
        total_messages: parseInt(msgResult.rows[0].count),
        total_documents: parseInt(docResult.rows[0].count),
        unread_messages: parseInt(unreadResult.rows[0].count),
        pending_signatures: parseInt(unsignedDocs.rows[0].count),
        active_projects: projectCount,
      },
      recent_projects: activeProjects,
      pipeline_steps: PIPELINE_STEPS,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
