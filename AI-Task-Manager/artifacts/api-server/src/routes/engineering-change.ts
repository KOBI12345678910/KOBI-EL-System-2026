import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Engineering-Change query error:", e.message); return []; }
}

async function qOne(query: string) {
  const rows = await q(query);
  return rows[0] || null;
}

function s(v: any): string {
  return v !== undefined && v !== null && v !== "" ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
}

function sJson(v: any): string {
  if (!v) return "'[]'::jsonb";
  const str = typeof v === "string" ? v : JSON.stringify(v);
  return `'${str.replace(/'/g, "''")}'::jsonb`;
}

async function nextEcrNum(): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `ECR${year}-%`;
  try {
    const r = await db.execute(sql.raw(`SELECT ecr_number FROM engineering_change_requests WHERE ecr_number LIKE '${pattern}' ORDER BY id DESC LIMIT 1`));
    const last = (r.rows[0] as any)?.ecr_number;
    const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
    return `ECR${year}-${String(seq).padStart(4, "0")}`;
  } catch {
    return `ECR${year}-${String(Date.now()).slice(-4)}`;
  }
}

async function nextEcoNum(): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `ECO${year}-%`;
  try {
    const r = await db.execute(sql.raw(`SELECT eco_number FROM engineering_change_orders WHERE eco_number LIKE '${pattern}' ORDER BY id DESC LIMIT 1`));
    const last = (r.rows[0] as any)?.eco_number;
    const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
    return `ECO${year}-${String(seq).padStart(4, "0")}`;
  } catch {
    return `ECO${year}-${String(Date.now()).slice(-4)}`;
  }
}

// ========== INIT TABLES ==========
router.post("/init-tables", async (_req, res) => {
  await q(`CREATE TABLE IF NOT EXISTS engineering_change_requests (
    id SERIAL PRIMARY KEY,
    ecr_number VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'design',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(30) DEFAULT 'draft',
    requested_by VARCHAR(200),
    assigned_to VARCHAR(200),
    affected_items JSONB DEFAULT '[]'::jsonb,
    impact_analysis TEXT,
    approval_chain JSONB DEFAULT '[]'::jsonb,
    implementation_date DATE,
    cost_impact NUMERIC(12,2) DEFAULT 0,
    risk_level VARCHAR(20) DEFAULT 'low',
    reason TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS engineering_change_orders (
    id SERIAL PRIMARY KEY,
    eco_number VARCHAR(30) UNIQUE NOT NULL,
    ecr_id INTEGER REFERENCES engineering_change_requests(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'design',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(30) DEFAULT 'draft',
    assigned_to VARCHAR(200),
    affected_items JSONB DEFAULT '[]'::jsonb,
    implementation_plan TEXT,
    implementation_date DATE,
    completion_date DATE,
    cost_impact NUMERIC(12,2) DEFAULT 0,
    verification_method TEXT,
    verification_result VARCHAR(30),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS ecr_impact_analysis (
    id SERIAL PRIMARY KEY,
    ecr_id INTEGER REFERENCES engineering_change_requests(id),
    category VARCHAR(100),
    description TEXT,
    severity VARCHAR(20) DEFAULT 'medium',
    affected_departments JSONB DEFAULT '[]'::jsonb,
    cost_estimate NUMERIC(12,2) DEFAULT 0,
    time_estimate_days INTEGER DEFAULT 0,
    risk_assessment TEXT,
    mitigation_plan TEXT,
    analyzed_by VARCHAR(200),
    analyzed_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS ecr_approvals (
    id SERIAL PRIMARY KEY,
    ecr_id INTEGER REFERENCES engineering_change_requests(id),
    eco_id INTEGER REFERENCES engineering_change_orders(id),
    approver_name VARCHAR(200),
    approver_role VARCHAR(100),
    approval_status VARCHAR(20) DEFAULT 'pending',
    comments TEXT,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  res.json({ success: true, message: "Engineering change tables initialized" });
});

// ========== ECR CRUD ==========
router.get("/ecr", async (_req, res) => {
  res.json(await q(`SELECT * FROM engineering_change_requests ORDER BY created_at DESC, id DESC`));
});

router.get("/ecr/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as draft,
    COUNT(*) FILTER (WHERE status='submitted') as submitted,
    COUNT(*) FILTER (WHERE status='under_review') as under_review,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='rejected') as rejected,
    COUNT(*) FILTER (WHERE status='implemented') as implemented,
    COUNT(*) FILTER (WHERE status='closed') as closed,
    COUNT(*) FILTER (WHERE status IN ('submitted','under_review')) as pending_approval,
    COUNT(*) FILTER (WHERE status='implemented' AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', NOW())) as implemented_this_month,
    COUNT(*) FILTER (WHERE priority='critical') as critical_count,
    COUNT(*) FILTER (WHERE priority='high') as high_count,
    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN status IN ('implemented','closed') THEN updated_at ELSE NOW() END) - created_at) / 86400), 0) as avg_processing_days,
    COALESCE(SUM(cost_impact), 0) as total_cost_impact
  FROM engineering_change_requests`);
  res.json(rows[0] || {});
});

router.get("/ecr/:id", async (req, res) => {
  const row = await qOne(`SELECT * FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`);
  if (!row) return res.status(404).json({ error: "ECR not found" });
  res.json(row);
});

router.post("/ecr", async (req, res) => {
  const d = req.body;
  const num = await nextEcrNum();
  const user = (req as any).user;
  await q(`INSERT INTO engineering_change_requests (ecr_number, title, description, type, priority, status, requested_by, assigned_to, affected_items, impact_analysis, approval_chain, implementation_date, cost_impact, risk_level, reason, notes)
    VALUES ('${num}', ${s(d.title)}, ${s(d.description)}, '${d.type || 'design'}', '${d.priority || 'medium'}', 'draft', ${s(d.requested_by || user?.fullName || user?.email)}, ${s(d.assigned_to)}, ${sJson(d.affected_items)}, ${s(d.impact_analysis)}, ${sJson(d.approval_chain)}, ${d.implementation_date ? `'${d.implementation_date}'` : 'NULL'}, ${d.cost_impact || 0}, '${d.risk_level || 'low'}', ${s(d.reason)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM engineering_change_requests WHERE ecr_number='${num}'`))[0]);
});

router.put("/ecr/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  if (d.title !== undefined) sets.push(`title=${s(d.title)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.type) sets.push(`type='${d.type}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.assigned_to !== undefined) sets.push(`assigned_to=${s(d.assigned_to)}`);
  if (d.affected_items) sets.push(`affected_items=${sJson(d.affected_items)}`);
  if (d.impact_analysis !== undefined) sets.push(`impact_analysis=${s(d.impact_analysis)}`);
  if (d.approval_chain) sets.push(`approval_chain=${sJson(d.approval_chain)}`);
  if (d.implementation_date) sets.push(`implementation_date='${d.implementation_date}'`);
  if (d.cost_impact !== undefined) sets.push(`cost_impact=${d.cost_impact}`);
  if (d.risk_level) sets.push(`risk_level='${d.risk_level}'`);
  if (d.reason !== undefined) sets.push(`reason=${s(d.reason)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length > 0) await q(`UPDATE engineering_change_requests SET ${sets.join(", ")} WHERE id=${parseInt(req.params.id)}`);
  res.json((await q(`SELECT * FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`))[0]);
});

router.delete("/ecr/:id", async (req, res) => {
  await q(`DELETE FROM ecr_approvals WHERE ecr_id=${parseInt(req.params.id)}`);
  await q(`DELETE FROM ecr_impact_analysis WHERE ecr_id=${parseInt(req.params.id)}`);
  await q(`DELETE FROM engineering_change_orders WHERE ecr_id=${parseInt(req.params.id)}`);
  await q(`DELETE FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== ECR WORKFLOW ==========
router.post("/ecr/:id/submit", async (req, res) => {
  await q(`UPDATE engineering_change_requests SET status='submitted', updated_at=NOW() WHERE id=${parseInt(req.params.id)} AND status='draft'`);
  const ecr = await qOne(`SELECT * FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`);
  if (!ecr) return res.status(404).json({ error: "ECR not found" });
  res.json(ecr);
});

router.post("/ecr/:id/approve", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  await q(`INSERT INTO ecr_approvals (ecr_id, approver_name, approver_role, approval_status, comments, approved_at)
    VALUES (${parseInt(req.params.id)}, ${s(d.approver_name || user?.fullName || user?.email)}, ${s(d.approver_role)}, 'approved', ${s(d.comments)}, NOW())`);
  await q(`UPDATE engineering_change_requests SET status='approved', updated_at=NOW() WHERE id=${parseInt(req.params.id)}`);
  res.json(await qOne(`SELECT * FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`));
});

router.post("/ecr/:id/reject", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  await q(`INSERT INTO ecr_approvals (ecr_id, approver_name, approver_role, approval_status, comments, approved_at)
    VALUES (${parseInt(req.params.id)}, ${s(d.approver_name || user?.fullName || user?.email)}, ${s(d.approver_role)}, 'rejected', ${s(d.comments)}, NOW())`);
  await q(`UPDATE engineering_change_requests SET status='rejected', updated_at=NOW() WHERE id=${parseInt(req.params.id)}`);
  res.json(await qOne(`SELECT * FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`));
});

router.post("/ecr/:id/implement", async (req, res) => {
  await q(`UPDATE engineering_change_requests SET status='implemented', updated_at=NOW() WHERE id=${parseInt(req.params.id)} AND status='approved'`);
  res.json(await qOne(`SELECT * FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`));
});

router.post("/ecr/:id/close", async (req, res) => {
  await q(`UPDATE engineering_change_requests SET status='closed', updated_at=NOW() WHERE id=${parseInt(req.params.id)} AND status='implemented'`);
  res.json(await qOne(`SELECT * FROM engineering_change_requests WHERE id=${parseInt(req.params.id)}`));
});

// ========== ECO CRUD ==========
router.get("/eco", async (_req, res) => {
  res.json(await q(`SELECT e.*, r.ecr_number, r.title as ecr_title FROM engineering_change_orders e LEFT JOIN engineering_change_requests r ON e.ecr_id = r.id ORDER BY e.created_at DESC`));
});

router.get("/eco/:id", async (req, res) => {
  const row = await qOne(`SELECT e.*, r.ecr_number, r.title as ecr_title FROM engineering_change_orders e LEFT JOIN engineering_change_requests r ON e.ecr_id = r.id WHERE e.id=${parseInt(req.params.id)}`);
  if (!row) return res.status(404).json({ error: "ECO not found" });
  res.json(row);
});

router.post("/eco", async (req, res) => {
  const d = req.body;
  const num = await nextEcoNum();
  await q(`INSERT INTO engineering_change_orders (eco_number, ecr_id, title, description, type, priority, status, assigned_to, affected_items, implementation_plan, implementation_date, cost_impact, verification_method, notes)
    VALUES ('${num}', ${d.ecr_id || 'NULL'}, ${s(d.title)}, ${s(d.description)}, '${d.type || 'design'}', '${d.priority || 'medium'}', 'draft', ${s(d.assigned_to)}, ${sJson(d.affected_items)}, ${s(d.implementation_plan)}, ${d.implementation_date ? `'${d.implementation_date}'` : 'NULL'}, ${d.cost_impact || 0}, ${s(d.verification_method)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM engineering_change_orders WHERE eco_number='${num}'`))[0]);
});

router.put("/eco/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  if (d.title !== undefined) sets.push(`title=${s(d.title)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.type) sets.push(`type='${d.type}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.assigned_to !== undefined) sets.push(`assigned_to=${s(d.assigned_to)}`);
  if (d.affected_items) sets.push(`affected_items=${sJson(d.affected_items)}`);
  if (d.implementation_plan !== undefined) sets.push(`implementation_plan=${s(d.implementation_plan)}`);
  if (d.implementation_date) sets.push(`implementation_date='${d.implementation_date}'`);
  if (d.completion_date) sets.push(`completion_date='${d.completion_date}'`);
  if (d.cost_impact !== undefined) sets.push(`cost_impact=${d.cost_impact}`);
  if (d.verification_method !== undefined) sets.push(`verification_method=${s(d.verification_method)}`);
  if (d.verification_result) sets.push(`verification_result='${d.verification_result}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length > 0) await q(`UPDATE engineering_change_orders SET ${sets.join(", ")} WHERE id=${parseInt(req.params.id)}`);
  res.json((await q(`SELECT * FROM engineering_change_orders WHERE id=${parseInt(req.params.id)}`))[0]);
});

router.delete("/eco/:id", async (req, res) => {
  await q(`DELETE FROM ecr_approvals WHERE eco_id=${parseInt(req.params.id)}`);
  await q(`DELETE FROM engineering_change_orders WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== IMPACT ANALYSIS ==========
router.get("/ecr/:id/impact", async (req, res) => {
  res.json(await q(`SELECT * FROM ecr_impact_analysis WHERE ecr_id=${parseInt(req.params.id)} ORDER BY id DESC`));
});

router.post("/ecr/:id/impact", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  await q(`INSERT INTO ecr_impact_analysis (ecr_id, category, description, severity, affected_departments, cost_estimate, time_estimate_days, risk_assessment, mitigation_plan, analyzed_by)
    VALUES (${parseInt(req.params.id)}, ${s(d.category)}, ${s(d.description)}, '${d.severity || 'medium'}', ${sJson(d.affected_departments)}, ${d.cost_estimate || 0}, ${d.time_estimate_days || 0}, ${s(d.risk_assessment)}, ${s(d.mitigation_plan)}, ${s(d.analyzed_by || user?.fullName || user?.email)})`);
  res.json(await q(`SELECT * FROM ecr_impact_analysis WHERE ecr_id=${parseInt(req.params.id)} ORDER BY id DESC`));
});

router.delete("/impact/:id", async (req, res) => {
  await q(`DELETE FROM ecr_impact_analysis WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== APPROVALS ==========
router.get("/ecr/:id/approvals", async (req, res) => {
  res.json(await q(`SELECT * FROM ecr_approvals WHERE ecr_id=${parseInt(req.params.id)} ORDER BY created_at DESC`));
});

router.get("/approvals/pending", async (_req, res) => {
  res.json(await q(`SELECT a.*, r.ecr_number, r.title as ecr_title FROM ecr_approvals a JOIN engineering_change_requests r ON a.ecr_id = r.id WHERE a.approval_status='pending' ORDER BY a.created_at ASC`));
});

// ========== DASHBOARD ==========
router.get("/dashboard", async (_req, res) => {
  const stats = await qOne(`SELECT
    COUNT(*) as total_ecrs,
    COUNT(*) FILTER (WHERE status IN ('draft','submitted','under_review')) as open_ecrs,
    COUNT(*) FILTER (WHERE status IN ('submitted','under_review')) as pending_approval,
    COUNT(*) FILTER (WHERE status='implemented' AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', NOW())) as implemented_this_month,
    COUNT(*) FILTER (WHERE priority='critical' AND status NOT IN ('closed','rejected')) as critical_open,
    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN status IN ('implemented','closed') THEN updated_at ELSE NOW() END) - created_at) / 86400)::INTEGER, 0) as avg_processing_days,
    COALESCE(SUM(cost_impact) FILTER (WHERE status='implemented' AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', NOW())), 0) as month_cost_impact
  FROM engineering_change_requests`);

  const byType = await q(`SELECT type, COUNT(*) as count FROM engineering_change_requests WHERE status NOT IN ('closed','rejected') GROUP BY type ORDER BY count DESC`);
  const byPriority = await q(`SELECT priority, COUNT(*) as count FROM engineering_change_requests WHERE status NOT IN ('closed','rejected') GROUP BY priority`);
  const recentEcrs = await q(`SELECT id, ecr_number, title, type, priority, status, requested_by, created_at FROM engineering_change_requests ORDER BY created_at DESC LIMIT 10`);

  res.json({ stats: stats || {}, byType, byPriority, recentEcrs });
});

export default router;
