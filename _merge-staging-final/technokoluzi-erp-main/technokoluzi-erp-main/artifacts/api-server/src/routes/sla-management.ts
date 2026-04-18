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
  catch (e: any) { console.error("SLA-Management query error:", e.message); return []; }
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

// ========== INIT TABLES ==========
router.post("/init-tables", async (_req, res) => {
  await q(`CREATE TABLE IF NOT EXISTS sla_definitions (
    id SERIAL PRIMARY KEY,
    sla_name VARCHAR(300) NOT NULL,
    description TEXT,
    module VARCHAR(50) DEFAULT 'support',
    metric_type VARCHAR(50) DEFAULT 'response_time',
    target_value NUMERIC(12,2) NOT NULL,
    target_unit VARCHAR(20) DEFAULT 'hours',
    warning_threshold NUMERIC(12,2),
    breach_threshold NUMERIC(12,2),
    escalation_levels JSONB DEFAULT '[]'::jsonb,
    penalty_amount NUMERIC(12,2) DEFAULT 0,
    penalty_type VARCHAR(30) DEFAULT 'fixed',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'active',
    applies_to JSONB DEFAULT '[]'::jsonb,
    business_hours_only BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS sla_assignments (
    id SERIAL PRIMARY KEY,
    sla_id INTEGER REFERENCES sla_definitions(id),
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    entity_name VARCHAR(300),
    assigned_by VARCHAR(200),
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    custom_target_value NUMERIC(12,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS sla_breaches_log (
    id SERIAL PRIMARY KEY,
    sla_id INTEGER REFERENCES sla_definitions(id),
    assignment_id INTEGER REFERENCES sla_assignments(id),
    breach_type VARCHAR(30) DEFAULT 'breach',
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    entity_name VARCHAR(300),
    expected_value NUMERIC(12,2),
    actual_value NUMERIC(12,2),
    severity VARCHAR(20) DEFAULT 'medium',
    escalation_level INTEGER DEFAULT 0,
    escalated_to VARCHAR(200),
    resolution_status VARCHAR(30) DEFAULT 'open',
    resolution_notes TEXT,
    resolved_by VARCHAR(200),
    resolved_at TIMESTAMP,
    penalty_applied NUMERIC(12,2) DEFAULT 0,
    breach_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS sla_escalation_rules (
    id SERIAL PRIMARY KEY,
    sla_id INTEGER REFERENCES sla_definitions(id),
    level INTEGER DEFAULT 1,
    trigger_after_minutes INTEGER DEFAULT 60,
    trigger_percentage NUMERIC(5,2),
    notify_roles JSONB DEFAULT '[]'::jsonb,
    notify_users JSONB DEFAULT '[]'::jsonb,
    action_type VARCHAR(50) DEFAULT 'notification',
    action_config JSONB DEFAULT '{}'::jsonb,
    auto_reassign BOOLEAN DEFAULT false,
    reassign_to VARCHAR(200),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  res.json({ success: true, message: "SLA Management tables initialized" });
});

// ========== SLA DEFINITIONS CRUD ==========
router.get("/definitions", async (_req, res) => {
  res.json(await q(`SELECT d.*,
    (SELECT COUNT(*) FROM sla_assignments WHERE sla_id=d.id AND status='active') as active_assignments,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE sla_id=d.id AND resolution_status='open') as open_breaches
  FROM sla_definitions d ORDER BY d.created_at DESC`));
});

router.get("/definitions/:id", async (req, res) => {
  const row = await qOne(`SELECT * FROM sla_definitions WHERE id=${parseInt(req.params.id)}`);
  if (!row) return res.status(404).json({ error: "SLA definition not found" });
  res.json(row);
});

router.post("/definitions", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO sla_definitions (sla_name, description, module, metric_type, target_value, target_unit, warning_threshold, breach_threshold, escalation_levels, penalty_amount, penalty_type, priority, status, applies_to, business_hours_only)
    VALUES (${s(d.sla_name)}, ${s(d.description)}, '${d.module || 'support'}', '${d.metric_type || 'response_time'}', ${d.target_value || 0}, '${d.target_unit || 'hours'}', ${d.warning_threshold || 'NULL'}, ${d.breach_threshold || 'NULL'}, ${sJson(d.escalation_levels)}, ${d.penalty_amount || 0}, '${d.penalty_type || 'fixed'}', '${d.priority || 'medium'}', '${d.status || 'active'}', ${sJson(d.applies_to)}, ${d.business_hours_only !== false})`);
  const row = await qOne(`SELECT * FROM sla_definitions ORDER BY id DESC LIMIT 1`);
  res.json(row);
});

router.put("/definitions/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  if (d.sla_name !== undefined) sets.push(`sla_name=${s(d.sla_name)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.module) sets.push(`module='${d.module}'`);
  if (d.metric_type) sets.push(`metric_type='${d.metric_type}'`);
  if (d.target_value !== undefined) sets.push(`target_value=${d.target_value}`);
  if (d.target_unit) sets.push(`target_unit='${d.target_unit}'`);
  if (d.warning_threshold !== undefined) sets.push(`warning_threshold=${d.warning_threshold}`);
  if (d.breach_threshold !== undefined) sets.push(`breach_threshold=${d.breach_threshold}`);
  if (d.escalation_levels) sets.push(`escalation_levels=${sJson(d.escalation_levels)}`);
  if (d.penalty_amount !== undefined) sets.push(`penalty_amount=${d.penalty_amount}`);
  if (d.penalty_type) sets.push(`penalty_type='${d.penalty_type}'`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.applies_to) sets.push(`applies_to=${sJson(d.applies_to)}`);
  if (d.business_hours_only !== undefined) sets.push(`business_hours_only=${d.business_hours_only}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length > 0) await q(`UPDATE sla_definitions SET ${sets.join(", ")} WHERE id=${parseInt(req.params.id)}`);
  res.json(await qOne(`SELECT * FROM sla_definitions WHERE id=${parseInt(req.params.id)}`));
});

router.delete("/definitions/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await q(`DELETE FROM sla_escalation_rules WHERE sla_id=${id}`);
  await q(`DELETE FROM sla_breaches_log WHERE sla_id=${id}`);
  await q(`DELETE FROM sla_assignments WHERE sla_id=${id}`);
  await q(`DELETE FROM sla_definitions WHERE id=${id}`);
  res.json({ success: true });
});

// ========== SLA ASSIGNMENTS ==========
router.get("/assignments", async (_req, res) => {
  res.json(await q(`SELECT a.*, d.sla_name, d.module, d.metric_type, d.target_value, d.target_unit
    FROM sla_assignments a JOIN sla_definitions d ON a.sla_id = d.id ORDER BY a.created_at DESC`));
});

router.post("/assignments", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  await q(`INSERT INTO sla_assignments (sla_id, entity_type, entity_id, entity_name, assigned_by, start_date, end_date, status, custom_target_value, notes)
    VALUES (${d.sla_id}, ${s(d.entity_type)}, ${s(d.entity_id)}, ${s(d.entity_name)}, ${s(d.assigned_by || user?.fullName || user?.email)}, '${d.start_date || new Date().toISOString().slice(0,10)}', ${d.end_date ? `'${d.end_date}'` : 'NULL'}, '${d.status || 'active'}', ${d.custom_target_value || 'NULL'}, ${s(d.notes)})`);
  res.json(await qOne(`SELECT * FROM sla_assignments ORDER BY id DESC LIMIT 1`));
});

router.put("/assignments/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.end_date) sets.push(`end_date='${d.end_date}'`);
  if (d.custom_target_value !== undefined) sets.push(`custom_target_value=${d.custom_target_value}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (sets.length > 0) await q(`UPDATE sla_assignments SET ${sets.join(", ")} WHERE id=${parseInt(req.params.id)}`);
  res.json(await qOne(`SELECT * FROM sla_assignments WHERE id=${parseInt(req.params.id)}`));
});

router.delete("/assignments/:id", async (req, res) => {
  await q(`DELETE FROM sla_assignments WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== BREACHES LOG ==========
router.get("/breaches", async (req, res) => {
  const statusFilter = req.query.status ? `AND b.resolution_status='${req.query.status}'` : "";
  const severityFilter = req.query.severity ? `AND b.severity='${req.query.severity}'` : "";
  res.json(await q(`SELECT b.*, d.sla_name, d.module, d.metric_type
    FROM sla_breaches_log b JOIN sla_definitions d ON b.sla_id = d.id
    WHERE 1=1 ${statusFilter} ${severityFilter}
    ORDER BY b.breach_at DESC`));
});

router.post("/breaches", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO sla_breaches_log (sla_id, assignment_id, breach_type, entity_type, entity_id, entity_name, expected_value, actual_value, severity, escalation_level, escalated_to, penalty_applied)
    VALUES (${d.sla_id}, ${d.assignment_id || 'NULL'}, '${d.breach_type || 'breach'}', ${s(d.entity_type)}, ${s(d.entity_id)}, ${s(d.entity_name)}, ${d.expected_value || 0}, ${d.actual_value || 0}, '${d.severity || 'medium'}', ${d.escalation_level || 0}, ${s(d.escalated_to)}, ${d.penalty_applied || 0})`);
  res.json(await qOne(`SELECT * FROM sla_breaches_log ORDER BY id DESC LIMIT 1`));
});

router.put("/breaches/:id/resolve", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  await q(`UPDATE sla_breaches_log SET resolution_status='resolved', resolution_notes=${s(d.resolution_notes)}, resolved_by=${s(d.resolved_by || user?.fullName || user?.email)}, resolved_at=NOW() WHERE id=${parseInt(req.params.id)}`);
  res.json(await qOne(`SELECT * FROM sla_breaches_log WHERE id=${parseInt(req.params.id)}`));
});

// ========== ESCALATION RULES ==========
router.get("/escalation-rules", async (req, res) => {
  const slaFilter = req.query.sla_id ? `WHERE e.sla_id=${parseInt(req.query.sla_id as string)}` : "";
  res.json(await q(`SELECT e.*, d.sla_name FROM sla_escalation_rules e JOIN sla_definitions d ON e.sla_id = d.id ${slaFilter} ORDER BY e.sla_id, e.level`));
});

router.post("/escalation-rules", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO sla_escalation_rules (sla_id, level, trigger_after_minutes, trigger_percentage, notify_roles, notify_users, action_type, action_config, auto_reassign, reassign_to, status)
    VALUES (${d.sla_id}, ${d.level || 1}, ${d.trigger_after_minutes || 60}, ${d.trigger_percentage || 'NULL'}, ${sJson(d.notify_roles)}, ${sJson(d.notify_users)}, '${d.action_type || 'notification'}', ${sJson(d.action_config)}, ${d.auto_reassign || false}, ${s(d.reassign_to)}, '${d.status || 'active'}')`);
  res.json(await qOne(`SELECT * FROM sla_escalation_rules ORDER BY id DESC LIMIT 1`));
});

router.put("/escalation-rules/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  if (d.level !== undefined) sets.push(`level=${d.level}`);
  if (d.trigger_after_minutes !== undefined) sets.push(`trigger_after_minutes=${d.trigger_after_minutes}`);
  if (d.trigger_percentage !== undefined) sets.push(`trigger_percentage=${d.trigger_percentage}`);
  if (d.notify_roles) sets.push(`notify_roles=${sJson(d.notify_roles)}`);
  if (d.notify_users) sets.push(`notify_users=${sJson(d.notify_users)}`);
  if (d.action_type) sets.push(`action_type='${d.action_type}'`);
  if (d.action_config) sets.push(`action_config=${sJson(d.action_config)}`);
  if (d.auto_reassign !== undefined) sets.push(`auto_reassign=${d.auto_reassign}`);
  if (d.reassign_to !== undefined) sets.push(`reassign_to=${s(d.reassign_to)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (sets.length > 0) await q(`UPDATE sla_escalation_rules SET ${sets.join(", ")} WHERE id=${parseInt(req.params.id)}`);
  res.json(await qOne(`SELECT * FROM sla_escalation_rules WHERE id=${parseInt(req.params.id)}`));
});

router.delete("/escalation-rules/:id", async (req, res) => {
  await q(`DELETE FROM sla_escalation_rules WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== COMPLIANCE REPORTS ==========
router.get("/compliance", async (_req, res) => {
  const overall = await qOne(`SELECT
    (SELECT COUNT(*) FROM sla_definitions WHERE status='active') as active_slas,
    (SELECT COUNT(*) FROM sla_assignments WHERE status='active') as active_assignments,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE resolution_status='open') as open_breaches,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW())) as breaches_this_month,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW()) AND severity='critical') as critical_breaches_month,
    (SELECT COALESCE(SUM(penalty_applied),0) FROM sla_breaches_log WHERE DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW())) as penalties_this_month
  `);

  const byModule = await q(`SELECT d.module, COUNT(*) as total_slas,
    COUNT(*) FILTER (WHERE d.status='active') as active,
    (SELECT COUNT(*) FROM sla_breaches_log b WHERE b.sla_id = ANY(ARRAY_AGG(d.id)) AND b.resolution_status='open') as open_breaches
  FROM sla_definitions d GROUP BY d.module`);

  const complianceRate = await q(`SELECT d.id, d.sla_name, d.module,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE sla_id=d.id AND DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW())) as month_breaches,
    CASE WHEN (SELECT COUNT(*) FROM sla_assignments WHERE sla_id=d.id AND status='active') > 0
      THEN ROUND(100.0 - ((SELECT COUNT(*) FROM sla_breaches_log WHERE sla_id=d.id AND DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW()))::NUMERIC / GREATEST((SELECT COUNT(*) FROM sla_assignments WHERE sla_id=d.id AND status='active'), 1)) * 100, 1)
      ELSE 100.0 END as compliance_rate
  FROM sla_definitions d WHERE d.status='active' ORDER BY compliance_rate ASC`);

  res.json({ overall: overall || {}, byModule, complianceRate });
});

// ========== DASHBOARD ==========
router.get("/dashboard", async (_req, res) => {
  const stats = await qOne(`SELECT
    (SELECT COUNT(*) FROM sla_definitions WHERE status='active') as active_slas,
    (SELECT ROUND(
      CASE WHEN (SELECT COUNT(*) FROM sla_assignments WHERE status='active') > 0
        THEN 100.0 - ((SELECT COUNT(*) FROM sla_breaches_log WHERE DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW()))::NUMERIC / GREATEST((SELECT COUNT(*) FROM sla_assignments WHERE status='active'), 1)) * 100
        ELSE 100.0 END
    , 1)) as compliance_rate,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW())) as breaches_this_month,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE resolution_status='open') as open_breaches,
    (SELECT COUNT(*) FROM sla_breaches_log WHERE severity='critical' AND resolution_status='open') as critical_open,
    (SELECT COALESCE(SUM(penalty_applied),0) FROM sla_breaches_log WHERE DATE_TRUNC('month', breach_at) = DATE_TRUNC('month', NOW())) as penalties_this_month,
    (SELECT COUNT(*) FROM sla_escalation_rules WHERE status='active') as active_rules
  `);

  const recentBreaches = await q(`SELECT b.*, d.sla_name, d.module FROM sla_breaches_log b JOIN sla_definitions d ON b.sla_id = d.id ORDER BY b.breach_at DESC LIMIT 10`);
  const byModule = await q(`SELECT module, COUNT(*) as count FROM sla_definitions WHERE status='active' GROUP BY module`);
  const bySeverity = await q(`SELECT severity, COUNT(*) as count FROM sla_breaches_log WHERE resolution_status='open' GROUP BY severity`);

  res.json({ stats: stats || {}, recentBreaches, byModule, bySeverity });
});

export default router;
