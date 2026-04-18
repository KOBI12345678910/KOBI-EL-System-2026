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
  catch (e: any) { console.error("Agent-Orchestration query error:", e.message); return []; }
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS ai_agents (
    id SERIAL PRIMARY KEY,
    agent_key VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    mission TEXT,
    allowed_tools JSONB DEFAULT '[]'::jsonb,
    read_scope JSONB DEFAULT '[]'::jsonb,
    write_scope JSONB DEFAULT '[]'::jsonb,
    max_autonomy_level VARCHAR(32) DEFAULT 'advisory' CHECK (max_autonomy_level IN ('advisory','draft','auto_low','auto_high')),
    confidence_threshold REAL DEFAULT 0.8,
    status VARCHAR(32) DEFAULT 'draft' CHECK (status IN ('draft','active','paused','retired')),
    owner VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS ai_agent_executions (
    id SERIAL PRIMARY KEY,
    agent_id INT REFERENCES ai_agents(id) ON DELETE CASCADE,
    trigger_event VARCHAR(255),
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB DEFAULT '{}'::jsonb,
    actions_taken JSONB DEFAULT '[]'::jsonb,
    confidence_score REAL,
    status VARCHAR(32) DEFAULT 'running' CHECK (status IN ('running','completed','failed','rolled_back')),
    human_review_required BOOLEAN DEFAULT false,
    reviewed_by VARCHAR(255),
    duration_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS ai_agent_policies (
    id SERIAL PRIMARY KEY,
    agent_id INT REFERENCES ai_agents(id) ON DELETE CASCADE,
    policy_type VARCHAR(64) CHECK (policy_type IN ('data_access','action_limit','approval_required')),
    policy_rule JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS ai_agent_incidents (
    id SERIAL PRIMARY KEY,
    agent_id INT REFERENCES ai_agents(id) ON DELETE CASCADE,
    execution_id INT REFERENCES ai_agent_executions(id) ON DELETE SET NULL,
    incident_type VARCHAR(64) CHECK (incident_type IN ('hallucination','wrong_action','policy_breach','error')),
    severity VARCHAR(32) DEFAULT 'medium',
    description TEXT,
    resolution TEXT,
    status VARCHAR(32) DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

let tablesReady = false;
router.use(async (_req: Request, _res: Response, next: NextFunction) => {
  if (!tablesReady) { await ensureTables(); tablesReady = true; }
  next();
});

const s = (v: any) => v != null ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => v != null && v !== "" ? Number(v) : "NULL";
const j = (v: any) => v != null ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : "'{}'::jsonb";

// ========== AGENTS CRUD ==========
router.get("/agents", async (_req, res) => {
  res.json(await q(`SELECT * FROM ai_agents ORDER BY created_at DESC`));
});

router.get("/agents/dashboard", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const stats = await q(`SELECT
    (SELECT COUNT(*) FROM ai_agents WHERE status='active') as active_agents,
    (SELECT COUNT(*) FROM ai_agent_executions WHERE created_at::date = '${today}') as executions_today,
    (SELECT COUNT(*) FROM ai_agent_incidents WHERE status IN ('open','investigating')) as open_incidents,
    (SELECT COALESCE(AVG(confidence_score), 0) FROM ai_agent_executions WHERE status='completed' AND created_at::date = '${today}') as avg_confidence,
    (SELECT COUNT(*) FROM ai_agent_executions WHERE status='running') as running_now,
    (SELECT COUNT(*) FROM ai_agent_executions WHERE human_review_required=true AND reviewed_by IS NULL) as pending_review
  `);
  res.json(stats[0] || {});
});

router.get("/agents/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM ai_agents WHERE id=${Number(req.params.id)}`);
  if (!rows.length) return res.status(404).json({ error: "סוכן לא נמצא" });
  res.json(rows[0]);
});

router.post("/agents", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO ai_agents (agent_key, name, description, mission, allowed_tools, read_scope, write_scope, max_autonomy_level, confidence_threshold, status, owner)
    VALUES (${s(d.agent_key)}, ${s(d.name)}, ${s(d.description)}, ${s(d.mission)}, ${j(d.allowed_tools)}, ${j(d.read_scope)}, ${j(d.write_scope)}, ${s(d.max_autonomy_level || 'advisory')}, ${n(d.confidence_threshold) || 0.8}, ${s(d.status || 'draft')}, ${s(d.owner)})`);
  const rows = await q(`SELECT * FROM ai_agents WHERE agent_key=${s(d.agent_key)}`);
  res.json(rows[0]);
});

router.put("/agents/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.mission !== undefined) sets.push(`mission=${s(d.mission)}`);
  if (d.allowed_tools) sets.push(`allowed_tools=${j(d.allowed_tools)}`);
  if (d.read_scope) sets.push(`read_scope=${j(d.read_scope)}`);
  if (d.write_scope) sets.push(`write_scope=${j(d.write_scope)}`);
  if (d.max_autonomy_level) sets.push(`max_autonomy_level=${s(d.max_autonomy_level)}`);
  if (d.confidence_threshold != null) sets.push(`confidence_threshold=${n(d.confidence_threshold)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.owner) sets.push(`owner=${s(d.owner)}`);
  if (!sets.length) return res.status(400).json({ error: "אין שדות לעדכון" });
  await q(`UPDATE ai_agents SET ${sets.join(",")} WHERE id=${Number(req.params.id)}`);
  res.json((await q(`SELECT * FROM ai_agents WHERE id=${Number(req.params.id)}`))[0]);
});

router.delete("/agents/:id", async (req, res) => {
  await q(`DELETE FROM ai_agents WHERE id=${Number(req.params.id)}`);
  res.json({ success: true });
});

// ========== AGENT EXECUTION ==========
router.post("/agents/:id/execute", async (req, res) => {
  const agentId = Number(req.params.id);
  const agent = (await q(`SELECT * FROM ai_agents WHERE id=${agentId}`))[0] as any;
  if (!agent) return res.status(404).json({ error: "סוכן לא נמצא" });
  if (agent.status !== "active") return res.status(400).json({ error: "הסוכן אינו פעיל" });

  const d = req.body;
  const startTime = Date.now();

  // Simulate execution - in production this would trigger the actual AI agent
  const confidence = Math.random() * 0.4 + 0.6; // 0.6-1.0
  const needsReview = confidence < (agent.confidence_threshold || 0.8);
  const duration = Date.now() - startTime;

  await q(`INSERT INTO ai_agent_executions (agent_id, trigger_event, input_data, output_data, actions_taken, confidence_score, status, human_review_required, duration_ms)
    VALUES (${agentId}, ${s(d.trigger_event)}, ${j(d.input_data)}, ${j(d.output_data || {result: 'executed'})}, ${j(d.actions_taken || [])}, ${confidence.toFixed(3)}, 'completed', ${needsReview}, ${duration})`);

  const exec = await q(`SELECT * FROM ai_agent_executions WHERE agent_id=${agentId} ORDER BY id DESC LIMIT 1`);
  res.json(exec[0]);
});

router.get("/agents/:id/executions", async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(await q(`SELECT * FROM ai_agent_executions WHERE agent_id=${Number(req.params.id)} ORDER BY created_at DESC LIMIT ${limit}`));
});

router.post("/agents/:id/pause", async (req, res) => {
  await q(`UPDATE ai_agents SET status='paused' WHERE id=${Number(req.params.id)} AND status='active'`);
  res.json((await q(`SELECT * FROM ai_agents WHERE id=${Number(req.params.id)}`))[0]);
});

router.post("/agents/:id/resume", async (req, res) => {
  await q(`UPDATE ai_agents SET status='active' WHERE id=${Number(req.params.id)} AND status='paused'`);
  res.json((await q(`SELECT * FROM ai_agents WHERE id=${Number(req.params.id)}`))[0]);
});

// ========== POLICIES CRUD ==========
router.get("/agents/:id/policies", async (req, res) => {
  res.json(await q(`SELECT * FROM ai_agent_policies WHERE agent_id=${Number(req.params.id)} ORDER BY id DESC`));
});

router.post("/agents/:id/policies", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO ai_agent_policies (agent_id, policy_type, policy_rule) VALUES (${Number(req.params.id)}, ${s(d.policy_type)}, ${j(d.policy_rule)})`);
  res.json((await q(`SELECT * FROM ai_agent_policies WHERE agent_id=${Number(req.params.id)} ORDER BY id DESC LIMIT 1`))[0]);
});

router.put("/policies/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.policy_type) sets.push(`policy_type=${s(d.policy_type)}`);
  if (d.policy_rule) sets.push(`policy_rule=${j(d.policy_rule)}`);
  if (!sets.length) return res.status(400).json({ error: "אין שדות" });
  await q(`UPDATE ai_agent_policies SET ${sets.join(",")} WHERE id=${Number(req.params.id)}`);
  res.json((await q(`SELECT * FROM ai_agent_policies WHERE id=${Number(req.params.id)}`))[0]);
});

router.delete("/policies/:id", async (req, res) => {
  await q(`DELETE FROM ai_agent_policies WHERE id=${Number(req.params.id)}`);
  res.json({ success: true });
});

// ========== INCIDENTS CRUD ==========
router.get("/incidents", async (_req, res) => {
  res.json(await q(`SELECT i.*, a.name as agent_name FROM ai_agent_incidents i LEFT JOIN ai_agents a ON i.agent_id=a.id ORDER BY i.created_at DESC`));
});

router.post("/incidents", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO ai_agent_incidents (agent_id, execution_id, incident_type, severity, description, resolution, status)
    VALUES (${n(d.agent_id)}, ${n(d.execution_id)}, ${s(d.incident_type)}, ${s(d.severity || 'medium')}, ${s(d.description)}, ${s(d.resolution)}, ${s(d.status || 'open')})`);
  res.json((await q(`SELECT * FROM ai_agent_incidents ORDER BY id DESC LIMIT 1`))[0]);
});

router.put("/incidents/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.incident_type) sets.push(`incident_type=${s(d.incident_type)}`);
  if (d.severity) sets.push(`severity=${s(d.severity)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.resolution !== undefined) sets.push(`resolution=${s(d.resolution)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (!sets.length) return res.status(400).json({ error: "אין שדות" });
  await q(`UPDATE ai_agent_incidents SET ${sets.join(",")} WHERE id=${Number(req.params.id)}`);
  res.json((await q(`SELECT * FROM ai_agent_incidents WHERE id=${Number(req.params.id)}`))[0]);
});

router.delete("/incidents/:id", async (req, res) => {
  await q(`DELETE FROM ai_agent_incidents WHERE id=${Number(req.params.id)}`);
  res.json({ success: true });
});

export default router;
