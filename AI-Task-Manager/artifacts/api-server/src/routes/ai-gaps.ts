import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_agents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      agent_type VARCHAR(50) DEFAULT 'backend',
      system_prompt TEXT,
      core_rules JSONB DEFAULT '[]',
      tasks JSONB DEFAULT '[]',
      model_id INTEGER,
      execution_count INTEGER DEFAULT 0,
      avg_execution_time DECIMAL(10,2) DEFAULT 0,
      success_rate DECIMAL(5,4) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_lead_scores (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER,
      score DECIMAL(5,2) DEFAULT 0,
      score_breakdown JSONB DEFAULT '{}',
      predicted_conversion_rate DECIMAL(5,4) DEFAULT 0,
      predicted_deal_value INTEGER DEFAULT 0,
      confidence_level DECIMAL(5,4) DEFAULT 0,
      model_version VARCHAR(20),
      scoring_date TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_call_analyses (
      id SERIAL PRIMARY KEY,
      call_id INTEGER,
      transcript TEXT,
      sentiment_score DECIMAL(5,2) DEFAULT 0,
      key_phrases JSONB DEFAULT '[]',
      action_items JSONB DEFAULT '[]',
      customer_intent VARCHAR(30) DEFAULT 'other',
      urgency_level INTEGER DEFAULT 1,
      summary TEXT,
      language VARCHAR(10) DEFAULT 'he',
      duration_seconds INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_predictions (
      id SERIAL PRIMARY KEY,
      prediction_type VARCHAR(30) NOT NULL,
      target_entity VARCHAR(100),
      target_id INTEGER,
      predicted_value DECIMAL(15,2) DEFAULT 0,
      confidence_interval_low DECIMAL(15,2) DEFAULT 0,
      confidence_interval_high DECIMAL(15,2) DEFAULT 0,
      prediction_date DATE DEFAULT CURRENT_DATE,
      horizon_days INTEGER DEFAULT 30,
      model_version VARCHAR(20),
      actual_value DECIMAL(15,2),
      accuracy_score DECIMAL(5,4),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_chatbot_config (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      model VARCHAR(100),
      temperature DECIMAL(3,2) DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2000,
      system_prompt TEXT,
      knowledge_base_ids JSONB DEFAULT '[]',
      active_channels JSONB DEFAULT '[]',
      response_language VARCHAR(10) DEFAULT 'he',
      auto_escalation_rules JSONB DEFAULT '{}',
      working_hours JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_logs (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(50),
      model_id INTEGER,
      user_id INTEGER,
      request_data JSONB DEFAULT '{}',
      response_data JSONB DEFAULT '{}',
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      error TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      contract_number VARCHAR(20) UNIQUE,
      title VARCHAR(300) NOT NULL,
      contract_type VARCHAR(30) DEFAULT 'customer',
      party_type VARCHAR(30) DEFAULT 'customer',
      party_id INTEGER,
      party_name VARCHAR(200),
      start_date DATE,
      end_date DATE,
      renewal_date DATE,
      auto_renew BOOLEAN DEFAULT false,
      value INTEGER DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'ILS',
      payment_schedule JSONB DEFAULT '[]',
      terms TEXT,
      special_conditions TEXT,
      status VARCHAR(30) DEFAULT 'draft',
      signed_date DATE,
      signed_by VARCHAR(200),
      document_url VARCHAR(500),
      reminders JSONB DEFAULT '[]',
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS approval_workflows (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      entity_type VARCHAR(100),
      conditions JSONB DEFAULT '{}',
      steps JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS decision_models (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      model_type VARCHAR(30) DEFAULT 'pricing',
      parameters JSONB DEFAULT '{}',
      weights JSONB DEFAULT '{}',
      threshold_values JSONB DEFAULT '{}',
      result_history JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export { ensureTables as ensureAiGapsTables };

router.get("/ai-agents", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ai_agents WHERE is_active=true ORDER BY name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/ai-agents", async (req, res) => {
  try {
    const { name, agent_type, system_prompt, core_rules, tasks, model_id } = req.body;
    const result = await pool.query(
      `INSERT INTO ai_agents (name, agent_type, system_prompt, core_rules, tasks, model_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, agent_type || 'backend', system_prompt, core_rules || [], tasks || [], model_id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/ai-lead-scores", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ai_lead_scores ORDER BY scoring_date DESC LIMIT 100");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/ai-call-analyses", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ai_call_analyses ORDER BY created_at DESC LIMIT 100");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/ai-predictions", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ai_predictions ORDER BY created_at DESC LIMIT 100");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/ai-chatbot-config", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ai_chatbot_config ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/ai-chatbot-config", async (req, res) => {
  try {
    const { name, model, temperature, max_tokens, system_prompt, response_language } = req.body;
    const result = await pool.query(
      `INSERT INTO ai_chatbot_config (name, model, temperature, max_tokens, system_prompt, response_language)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, model, temperature || 0.7, max_tokens || 2000, system_prompt, response_language || 'he']
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/ai-logs", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT 200");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/contracts", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM contracts WHERE is_active=true ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/contracts", async (req, res) => {
  try {
    const { contract_number, title, contract_type, party_type, party_id, party_name, start_date, end_date, value, terms, special_conditions, notes } = req.body;
    const num = contract_number || `CON-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO contracts (contract_number, title, contract_type, party_type, party_id, party_name, start_date, end_date, value, terms, special_conditions, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [num, title, contract_type || 'customer', party_type || 'customer', party_id, party_name, start_date, end_date, value || 0, terms, special_conditions, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/contracts/:id", async (req, res) => {
  try {
    const { title, status, end_date, renewal_date, auto_renew, value, terms, notes } = req.body;
    const result = await pool.query(
      `UPDATE contracts SET title=$1, status=$2, end_date=$3, renewal_date=$4, auto_renew=$5, value=$6, terms=$7, notes=$8, updated_at=NOW() WHERE id=$9 RETURNING *`,
      [title, status, end_date, renewal_date, auto_renew, value, terms, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/contracts/:id", async (req, res) => {
  try {
    await pool.query("UPDATE contracts SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/approval-workflows", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM approval_workflows WHERE is_active=true ORDER BY name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/approval-workflows", async (req, res) => {
  try {
    const { name, entity_type, conditions, steps } = req.body;
    const result = await pool.query(
      `INSERT INTO approval_workflows (name, entity_type, conditions, steps)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, entity_type, conditions || {}, steps || []]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/decision-models", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM decision_models WHERE is_active=true ORDER BY name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/decision-models", async (req, res) => {
  try {
    const { name, model_type, parameters, weights, threshold_values } = req.body;
    const result = await pool.query(
      `INSERT INTO decision_models (name, model_type, parameters, weights, threshold_values)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, model_type || 'pricing', parameters || {}, weights || {}, threshold_values || {}]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
