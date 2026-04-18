import { Router, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createNotification } from "../lib/notification-service";

const router = Router();

const q = async (query: any) => {
  try { const r = await db.execute(query); return r.rows || []; }
  catch(e) { console.error("[CRM-Sales-Pipeline]", e); return []; }
};

async function nextSeq(prefix: string, table: string): Promise<string> {
  const r = await pool.query(`SELECT COUNT(*)::int as c FROM ${table}`);
  const c = (r.rows[0]?.c || 0) + 1;
  return `${prefix}-${String(c).padStart(4, "0")}`;
}

function clean(d: any): any {
  const o = { ...d };
  for (const k in o) { if (o[k] === "" || o[k] === undefined) o[k] = null; }
  delete o.id; delete o.created_at; delete o.updated_at;
  return o;
}

// ======================== STAGE PROBABILITY (CONFIGURABLE) ========================

async function getConfiguredStageProbabilities(): Promise<Record<string, number>> {
  const defaults: Record<string, number> = {
    lead: 10, qualified: 25, proposal: 50, negotiation: 75, won: 100, lost: 0
  };
  try {
    const r = await pool.query(`SELECT stage_key, probability FROM crm_pipeline_stages WHERE probability IS NOT NULL`);
    if (r.rows.length === 0) return defaults;
    const map: Record<string, number> = { ...defaults };
    for (const row of r.rows) { map[row.stage_key] = Number(row.probability); }
    return map;
  } catch { return defaults; }
}

router.get("/sales/stage-probabilities", async (_req: Request, res: Response) => {
  const r = await pool.query(`SELECT stage_key, label, sort_order, probability, is_won, is_lost FROM crm_pipeline_stages ORDER BY sort_order`);
  if (r.rows.length === 0) {
    res.json([
      { stage_key: "lead", label: "ליד", probability: 10, sort_order: 1, is_won: false, is_lost: false },
      { stage_key: "qualified", label: "מוסמך", probability: 25, sort_order: 2, is_won: false, is_lost: false },
      { stage_key: "proposal", label: "הצעה", probability: 50, sort_order: 3, is_won: false, is_lost: false },
      { stage_key: "negotiation", label: 'מו"מ', probability: 75, sort_order: 4, is_won: false, is_lost: false },
      { stage_key: "won", label: "נסגר", probability: 100, sort_order: 5, is_won: true, is_lost: false },
      { stage_key: "lost", label: "אבוד", probability: 0, sort_order: 6, is_won: false, is_lost: true },
    ]);
  } else { res.json(r.rows); }
});

router.put("/sales/stage-probabilities", async (req: Request, res: Response) => {
  try {
    const { stages } = req.body;
    if (!Array.isArray(stages)) return res.status(400).json({ error: "stages array required" });
    for (const s of stages) {
      const probability = Math.min(100, Math.max(0, Number(s.probability ?? 0)));
      await pool.query(
        `UPDATE crm_pipeline_stages SET probability=$1 WHERE stage_key=$2`,
        [probability, s.stage_key]
      );
    }
    res.json({ success: true, updated: stages.length });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/stage-probabilities/:stageKey", async (req: Request, res: Response) => {
  try {
    const { stageKey } = req.params;
    const probability = Number(req.body.probability ?? 0);
    await db.execute(sql`UPDATE crm_pipeline_stages SET probability=${probability} WHERE stage_key=${stageKey}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== COMMISSION CALCULATION ENGINE ========================

async function calculateCommissionAmount(dealValue: number, repName: string | null): Promise<{
  ruleId: number | null; ruleName: string | null; rate: number; amount: number;
}> {
  const r = await pool.query(
    `SELECT * FROM sales_commission_rules WHERE status='active'
      AND (applies_to='all' OR applies_to=$1)
      AND min_deal_value <= $2
      AND (max_deal_value IS NULL OR max_deal_value >= $2)
      ORDER BY min_deal_value DESC LIMIT 1`,
    [repName || "all", dealValue]
  );

  if (r.rows.length === 0) return { ruleId: null, ruleName: null, rate: 0, amount: 0 };

  const rule = r.rows[0];
  let rate = Number(rule.rate || 0);
  let amount = 0;

  if (rule.rule_type === "tiered" && rule.tiers) {
    let tiers: { min: number; max?: number; rate: number }[] = [];
    try { tiers = typeof rule.tiers === "string" ? JSON.parse(rule.tiers) : rule.tiers; } catch {}
    let totalComm = 0;
    const sorted = tiers.slice().sort((a: any, b: any) => a.min - b.min);
    for (const tier of sorted) {
      const tierMax = tier.max ?? Infinity;
      const lower = Math.max(tier.min, 0);
      const upper = tierMax === Infinity ? dealValue : Math.min(tierMax, dealValue);
      if (upper <= lower) continue;
      totalComm += (upper - lower) * (Number(tier.rate) / 100);
    }
    amount = Math.round(totalComm);
    rate = dealValue > 0 ? (amount / dealValue) * 100 : 0;
  } else {
    amount = Math.round(dealValue * rate / 100);
  }

  return { ruleId: Number(rule.id), ruleName: rule.name, rate, amount };
}

async function autoCreateCommissionRecord(opportunityId: number): Promise<void> {
  try {
    const r = await pool.query(`SELECT * FROM crm_opportunities WHERE id=$1 LIMIT 1`, [opportunityId]);
    if (r.rows.length === 0) return;
    const opp = r.rows[0];
    if (opp.stage !== "won") return;

    const existing = await pool.query(
      `SELECT id FROM sales_commission_records WHERE opportunity_id=$1 LIMIT 1`,
      [opportunityId]
    );
    if (existing.rows.length > 0) return;

    const dealValue = Number(opp.value || 0);
    const repName = opp.assigned_rep || null;
    const { ruleId, ruleName, rate, amount } = await calculateCommissionAmount(dealValue, repName);

    await db.execute(sql`INSERT INTO sales_commission_records
      (rep_name, opportunity_id, opportunity_name, deal_value, commission_rate, commission_amount, rule_id, rule_name, status, closed_date, notes)
      VALUES (${repName}, ${opportunityId}, ${opp.name}, ${dealValue}, ${rate}, ${amount},
        ${ruleId}, ${ruleName}, ${"pending"}, NOW()::date, ${"חושב אוטומטית"})`);

    console.log(`[CommissionEngine] Auto-created commission: opp=${opportunityId}, rep=${repName}, amount=${amount}`);
  } catch (e) {
    console.error("[CommissionEngine] autoCreateCommissionRecord failed:", e);
  }
}

// ======================== NURTURE SEQUENCE EXECUTION ========================

/**
 * Ensure the nurture_executions table exists (called once on first trigger).
 */
let _nurtureTableReady = false;
async function ensureNurtureExecutionsTable(): Promise<void> {
  if (_nurtureTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_nurture_executions (
      id SERIAL PRIMARY KEY,
      sequence_id INTEGER NOT NULL,
      sequence_name TEXT,
      opportunity_id INTEGER NOT NULL,
      opportunity_name TEXT,
      rep_email TEXT,
      rep_name TEXT,
      step_index INTEGER NOT NULL DEFAULT 0,
      step_type TEXT NOT NULL DEFAULT 'email',
      step_subject TEXT,
      step_body TEXT,
      step_due_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      executed_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_nurture_exec_due ON sales_nurture_executions(status, step_due_at)`);
  _nurtureTableReady = true;
}

/**
 * When an opportunity enters a stage, find active nurture sequences for that stage
 * and schedule each step as a row in sales_nurture_executions with a computed due_at.
 */
async function triggerNurtureSequences(opportunityId: number, stage: string): Promise<void> {
  try {
    await ensureNurtureExecutionsTable();

    const seqResult = await pool.query(
      `SELECT * FROM sales_nurture_sequences WHERE trigger_stage=$1 AND status='active'`,
      [stage]
    );
    if (seqResult.rows.length === 0) return;

    const oppResult = await pool.query(
      `SELECT * FROM crm_opportunities WHERE id=$1 LIMIT 1`,
      [opportunityId]
    );
    if (oppResult.rows.length === 0) return;
    const opp = oppResult.rows[0];

    for (const seq of seqResult.rows) {
      const steps = typeof seq.steps === "string" ? JSON.parse(seq.steps || "[]") : (seq.steps || []);

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + Number(step.delay_days || 0));

        // Normalize step content across 'content', 'body', 'message' field names
        const stepContent = step.content || step.body || step.message || "";

        await pool.query(
          `INSERT INTO sales_nurture_executions
            (sequence_id, sequence_name, opportunity_id, opportunity_name, rep_name,
             step_index, step_type, step_subject, step_body, step_due_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
           ON CONFLICT DO NOTHING`,
          [
            seq.id, seq.name, opportunityId, opp.name, opp.assigned_rep,
            i, step.type || "email", step.subject || "", stepContent,
            dueAt.toISOString()
          ]
        );
      }

      console.log(`[NurtureEngine] Scheduled ${steps.length} steps for sequence '${seq.name}' on opp '${opp.name}' at stage '${stage}'`);
    }
  } catch (e) {
    console.error("[NurtureEngine] triggerNurtureSequences failed:", e);
  }
}

/**
 * Process pending nurture executions whose due_at has passed.
 * Called on a scheduled interval from startNurtureProcessor().
 */
async function processNurtureExecutions(): Promise<void> {
  try {
    await ensureNurtureExecutionsTable();
    const r = await pool.query(
      `SELECT * FROM sales_nurture_executions WHERE status='pending' AND step_due_at <= NOW() LIMIT 20`
    );
    for (const exec of r.rows) {
      try {
        const subject = exec.step_subject || "הודעה מרצף טיפוח";
        const body = exec.step_body || "";
        const oppName = exec.opportunity_name || `הזדמנות #${exec.opportunity_id}`;

        if (exec.step_type === "email" || exec.step_type === "notification") {
          // Create an in-app notification for the assigned rep
          await createNotification({
            type: "nurture_step",
            title: `[רצף טיפוח] ${subject}`,
            message: body ? `${oppName}: ${body.substring(0, 300)}` : oppName,
            priority: "normal",
            category: "task",
            actionUrl: `/sales/pipeline`,
            metadata: {
              opportunity_id: exec.opportunity_id,
              sequence_id: exec.sequence_id,
              sequence_name: exec.sequence_name,
              step_index: exec.step_index,
              step_type: exec.step_type,
            },
          });
        } else if (exec.step_type === "task") {
          // Create a collaboration task for the assigned rep
          const taskTitle = subject.substring(0, 250);
          const taskRef = `OPP-${exec.opportunity_id}`;
          await pool.query(
            `INSERT INTO collaboration_tasks (title, assignee, due_date, priority, entity_type, entity_ref, is_done, created_at)
             VALUES ($1, $2, $3::date, $4, $5, $6, false, NOW())`,
            [
              taskTitle,
              exec.rep_name || null,
              exec.step_due_at,
              "normal",
              "crm_opportunities",
              taskRef,
            ]
          );
          // Also fire an in-app notification about the task
          await createNotification({
            type: "nurture_task",
            title: `[משימה] ${taskTitle}`,
            message: body ? `${oppName}: ${body.substring(0, 300)}` : oppName,
            priority: "normal",
            category: "task",
            actionUrl: `/sales/pipeline`,
            metadata: { opportunity_id: exec.opportunity_id, sequence_name: exec.sequence_name },
          });
        }

        await pool.query(
          `UPDATE sales_nurture_executions SET status='executed', executed_at=NOW() WHERE id=$1`,
          [exec.id]
        );
        console.log(`[NurtureEngine] Executed ${exec.step_type} step #${exec.step_index} for opp=${exec.opportunity_id} (exec id=${exec.id})`);
      } catch (stepErr: any) {
        await pool.query(
          `UPDATE sales_nurture_executions SET status='error', error=$1 WHERE id=$2`,
          [String(stepErr?.message || stepErr), exec.id]
        );
      }
    }
  } catch (e) {
    console.error("[NurtureEngine] processNurtureExecutions failed:", e);
  }
}

/** Start background interval to process nurture steps every 5 minutes */
export function startNurtureProcessor(): void {
  setInterval(processNurtureExecutions, 15 * 60 * 1000);
  console.log("[NurtureEngine] Background processor started (every 15 min)");
}

// ======================== LEAD SCORING EVALUATION ========================

async function recalculateScore(opportunityId: number): Promise<number> {
  try {
    const [oppResult, ruleResult] = await Promise.all([
      pool.query(`SELECT * FROM crm_opportunities WHERE id=$1 LIMIT 1`, [opportunityId]),
      pool.query(`SELECT * FROM sales_scoring_rules WHERE status='active'`)
    ]);
    if (oppResult.rows.length === 0 || ruleResult.rows.length === 0) return 0;
    const opp = oppResult.rows[0];
    const rules = ruleResult.rows;

    let totalWeight = 0;
    let earned = 0;

    for (const rule of rules) {
      const weight = Number(rule.weight || 10);
      const maxScore = Number(rule.max_score || 10);
      const criteria = rule.criteria || "";
      totalWeight += weight;

      const parts = criteria.split(":");
      if (parts.length >= 3) {
        const [field, op, expected] = parts;
        const camel = field.replace(/_([a-z])/g, (_: string, g: string) => g.toUpperCase());
        const actual = String(opp[field] ?? opp[camel] ?? "");
        let match = false;
        if (op === "eq") match = actual === expected;
        else if (op === "neq") match = actual !== expected;
        else if (op === "gte") match = Number(actual) >= Number(expected);
        else if (op === "lte") match = Number(actual) <= Number(expected);
        else if (op === "gt") match = Number(actual) > Number(expected);
        else if (op === "lt") match = Number(actual) < Number(expected);
        else if (op === "contains") match = actual.toLowerCase().includes(expected.toLowerCase());
        else if (op === "notempty") match = actual.trim() !== "" && actual !== "null";
        if (match) earned += weight * (maxScore / 10);
      } else if (criteria === "has_email" && opp.email) earned += weight;
      else if (criteria === "has_phone" && opp.phone) earned += weight;
      else if (criteria === "has_value" && Number(opp.value || 0) > 0) earned += weight;
      else if (criteria === "has_close_date" && opp.expected_close_date) earned += weight;
    }

    const score = totalWeight > 0 ? Math.min(100, Math.round((earned / totalWeight) * 100)) : 0;
    await db.execute(sql`UPDATE crm_opportunities SET lead_score=${score}, updated_at=NOW() WHERE id=${opportunityId}`);
    return score;
  } catch (e) {
    console.error("[ScoringEngine] recalculateScore failed:", e);
    return 0;
  }
}

// ======================== SALES OPPORTUNITIES (pipeline) ========================
router.get("/sales/opportunities", async (req: Request, res: Response) => {
  try {
    const territory = req.query.territory as string | undefined;
    const assignedRep = req.query.assignedRep as string | undefined;
    const params: any[] = [];
    let where = "WHERE 1=1";
    if (territory) { params.push(territory); where += ` AND territory=$${params.length}`; }
    if (assignedRep) { params.push(assignedRep); where += ` AND assigned_rep=$${params.length}`; }
    const r = await pool.query(`SELECT * FROM crm_opportunities ${where} ORDER BY created_at DESC`, params);
    res.json(r.rows);
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/sales/opportunities/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE stage='won') as won,
    COUNT(*) FILTER(WHERE stage='lost') as lost,
    COALESCE(SUM(value),0) as pipeline_value,
    COALESCE(SUM(value * probability / 100),0) as weighted_value,
    COALESCE(AVG(probability) FILTER(WHERE stage NOT IN ('won','lost')),0) as avg_probability,
    CASE WHEN COUNT(*) FILTER(WHERE stage IN ('won','lost')) > 0
      THEN ROUND(COUNT(*) FILTER(WHERE stage='won')::numeric / COUNT(*) FILTER(WHERE stage IN ('won','lost')) * 100, 1)
      ELSE 0 END as win_rate,
    COUNT(*) FILTER(WHERE expected_close_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) as closing_soon,
    COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) FILTER(WHERE stage='won'), 0) as avg_days_to_close,
    COALESCE(AVG(lead_score) FILTER(WHERE stage NOT IN ('won','lost')), 0) as avg_lead_score
    FROM crm_opportunities`);
  res.json(r[0] || {});
});

router.post("/sales/opportunities", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextSeq("OPP", "crm_opportunities");
    const stageProbMap = await getConfiguredStageProbabilities();
    const stage = d.stage || "lead";
    const probability = d.probability ?? stageProbMap[stage] ?? 10;

    await db.execute(sql`INSERT INTO crm_opportunities
      (opportunity_number, name, customer_name, contact_name, email, phone, stage, value, probability, expected_close_date, assigned_rep, source, notes, territory)
      VALUES (${num}, ${d.name}, ${d.customerName}, ${d.contactName}, ${d.email}, ${d.phone},
        ${stage}, ${d.value || 0}, ${probability}, ${d.expectedCloseDate},
        ${d.assignedRep}, ${d.source}, ${d.notes}, ${d.territory || null})`);

    const inserted = await pool.query(`SELECT id FROM crm_opportunities WHERE opportunity_number=$1 LIMIT 1`, [num]);
    if (inserted.rows.length > 0) {
      const oppId = Number(inserted.rows[0].id);
      await recalculateScore(oppId);
      await triggerNurtureSequences(oppId, stage);
    }

    res.json({ success: true, opportunity_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const prevResult = await pool.query(`SELECT stage, probability FROM crm_opportunities WHERE id=$1 LIMIT 1`, [id]);
    const prev = prevResult.rows.length > 0 ? prevResult.rows[0] : {};
    const prevStage = prev.stage || null;

    // Preserve existing probability when not explicitly provided, and derive from stage when stage changes
    let probability: number;
    if (d.probability !== null && d.probability !== undefined) {
      probability = Number(d.probability);
    } else if (d.stage && d.stage !== prevStage) {
      const stageProbMap = await getConfiguredStageProbabilities();
      probability = stageProbMap[d.stage] ?? Number(prev.probability ?? 50);
    } else {
      probability = Number(prev.probability ?? 50);
    }

    await db.execute(sql`UPDATE crm_opportunities SET
      name=${d.name}, customer_name=${d.customerName}, contact_name=${d.contactName},
      email=${d.email}, phone=${d.phone}, stage=${d.stage}, value=${d.value || 0},
      probability=${probability}, expected_close_date=${d.expectedCloseDate},
      assigned_rep=${d.assignedRep}, source=${d.source}, notes=${d.notes}, territory=${d.territory || null},
      updated_at=NOW() WHERE id=${id}`);

    await recalculateScore(id);

    if (d.stage && d.stage !== prevStage) {
      if (d.stage === "won") await autoCreateCommissionRecord(id);
      await triggerNurtureSequences(id, d.stage);
    }

    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/opportunities/:id/stage", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { stage, probability: overrideProbability } = req.body;

    const prevResult = await pool.query(`SELECT stage FROM crm_opportunities WHERE id=$1 LIMIT 1`, [id]);
    const prevStage = prevResult.rows.length > 0 ? prevResult.rows[0].stage : null;

    const stageProbMap = await getConfiguredStageProbabilities();
    const prob = overrideProbability !== undefined ? Number(overrideProbability) : (stageProbMap[stage] ?? 50);

    await db.execute(sql`UPDATE crm_opportunities SET stage=${stage}, probability=${prob}, updated_at=NOW() WHERE id=${id}`);

    if (stage !== prevStage) {
      if (stage === "won") await autoCreateCommissionRecord(id);
      await triggerNurtureSequences(id, stage);
    }

    res.json({ success: true, probability: prob });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/opportunities/:id/recalculate-score", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const score = await recalculateScore(id);
    res.json({ success: true, score });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/opportunities/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_opportunities WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SALES TERRITORIES ========================
router.get("/sales/territories", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sales_territories ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/territories/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='active') as active_count,
    COALESCE(SUM(target_revenue),0) as total_target,
    COALESCE(SUM(actual_revenue),0) as total_actual,
    COALESCE(SUM(customer_count),0) as total_customers,
    COALESCE(SUM(lead_count),0) as total_leads,
    COUNT(DISTINCT assigned_rep) FILTER(WHERE assigned_rep IS NOT NULL) as reps_assigned
    FROM sales_territories`);
  res.json(r[0] || {});
});

router.get("/sales/territories/:id/opportunities", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const terResult = await pool.query(`SELECT * FROM sales_territories WHERE id=$1 LIMIT 1`, [id]);
    if (terResult.rows.length === 0) return res.status(404).json({ error: "טריטוריה לא נמצאה" });
    const territory = terResult.rows[0];
    const r = await pool.query(
      `SELECT * FROM crm_opportunities WHERE
        (assigned_rep=$1 OR territory=$2)
        AND stage NOT IN ('won','lost') ORDER BY created_at DESC`,
      [territory.assigned_rep || "", territory.name || ""]
    );
    res.json({ territory, opportunities: r.rows });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/territories", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextSeq("TER", "sales_territories");
    await db.execute(sql`INSERT INTO sales_territories
      (territory_number, name, description, type, region, country, cities, zip_codes,
       assigned_rep, manager, status, target_revenue, actual_revenue, customer_count, lead_count, notes)
      VALUES (${num}, ${d.name}, ${d.description}, ${d.type || 'geographic'}, ${d.region}, ${d.country},
        ${d.cities}, ${d.zipCodes}, ${d.assignedRep}, ${d.manager}, ${d.status || 'active'},
        ${d.targetRevenue || 0}, ${d.actualRevenue || 0}, ${d.customerCount || 0}, ${d.leadCount || 0}, ${d.notes})`);
    res.json({ success: true, territory_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/territories/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sales_territories SET
      name=${d.name}, description=${d.description}, type=${d.type}, region=${d.region},
      country=${d.country}, cities=${d.cities}, zip_codes=${d.zipCodes},
      assigned_rep=${d.assignedRep}, manager=${d.manager}, status=${d.status},
      target_revenue=${d.targetRevenue || 0}, actual_revenue=${d.actualRevenue || 0},
      customer_count=${d.customerCount || 0}, lead_count=${d.leadCount || 0},
      notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/territories/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_territories WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== COMMISSION RULES ========================
router.get("/sales/commission-rules", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sales_commission_rules ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/sales/commission-rules/calculate", async (req: Request, res: Response) => {
  try {
    const { dealValue, repName } = req.body;
    const result = await calculateCommissionAmount(Number(dealValue || 0), repName || null);
    res.json(result);
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/commission-rules", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextSeq("COM", "sales_commission_rules");
    await db.execute(sql`INSERT INTO sales_commission_rules
      (rule_number, name, description, rule_type, rate, tiers, applies_to, min_deal_value, max_deal_value, status, effective_from, effective_to, notes)
      VALUES (${num}, ${d.name}, ${d.description}, ${d.ruleType || 'flat_percent'}, ${d.rate || 0},
        ${JSON.stringify(d.tiers || [])}, ${d.appliesTo || 'all'}, ${d.minDealValue || 0},
        ${d.maxDealValue}, ${d.status || 'active'}, ${d.effectiveFrom}, ${d.effectiveTo}, ${d.notes})`);
    res.json({ success: true, rule_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/commission-rules/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sales_commission_rules SET
      name=${d.name}, description=${d.description}, rule_type=${d.ruleType},
      rate=${d.rate || 0}, tiers=${JSON.stringify(d.tiers || [])}, applies_to=${d.appliesTo},
      min_deal_value=${d.minDealValue || 0}, max_deal_value=${d.maxDealValue},
      status=${d.status}, effective_from=${d.effectiveFrom}, effective_to=${d.effectiveTo},
      notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/commission-rules/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_commission_rules WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== COMMISSION RECORDS ========================
router.get("/sales/commission-records", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sales_commission_records ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/commission-records/summary", async (_req: Request, res: Response) => {
  const r = await pool.query(`SELECT
    rep_name,
    COUNT(*)::int as deals,
    COALESCE(SUM(deal_value),0)::numeric as total_deal_value,
    COALESCE(SUM(commission_amount),0)::numeric as total_commission,
    COALESCE(AVG(commission_rate),0)::numeric as avg_rate,
    COUNT(*) FILTER(WHERE status='paid')::int as paid_count,
    COUNT(*) FILTER(WHERE status='pending')::int as pending_count,
    COALESCE(SUM(commission_amount) FILTER(WHERE status='paid'),0)::numeric as paid_amount,
    COALESCE(SUM(commission_amount) FILTER(WHERE status='pending'),0)::numeric as pending_amount
    FROM sales_commission_records
    GROUP BY rep_name ORDER BY total_commission DESC`);
  res.json(r.rows);
});

router.post("/sales/commission-records", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    let rate = Number(d.commissionRate || 0);
    let amount = Number(d.commissionAmount || 0);
    if (amount === 0 && d.dealValue > 0) {
      const calc = await calculateCommissionAmount(Number(d.dealValue), d.repName || null);
      rate = calc.rate;
      amount = calc.amount;
      d.ruleId = d.ruleId || calc.ruleId;
      d.ruleName = d.ruleName || calc.ruleName;
    }
    await db.execute(sql`INSERT INTO sales_commission_records
      (rep_name, opportunity_id, opportunity_name, deal_value, commission_rate, commission_amount, rule_id, rule_name, status, closed_date, notes)
      VALUES (${d.repName}, ${d.opportunityId}, ${d.opportunityName}, ${d.dealValue || 0},
        ${rate}, ${amount}, ${d.ruleId}, ${d.ruleName},
        ${d.status || 'pending'}, ${d.closedDate}, ${d.notes})`);
    res.json({ success: true, commission_amount: amount, commission_rate: rate });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/commission-records/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sales_commission_records SET
      rep_name=${d.repName}, opportunity_name=${d.opportunityName}, deal_value=${d.dealValue || 0},
      commission_rate=${d.commissionRate || 0}, commission_amount=${d.commissionAmount || 0},
      status=${d.status}, paid_date=${d.paidDate}, notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/commission-records/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_commission_records WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SALES SCORING RULES ========================
router.get("/sales/scoring-rules", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sales_scoring_rules ORDER BY weight DESC`);
  res.json(rows);
});

router.post("/sales/scoring-rules", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextSeq("SCR", "sales_scoring_rules");
    await db.execute(sql`INSERT INTO sales_scoring_rules
      (rule_number, name, criteria, weight, max_score, description, status)
      VALUES (${num}, ${d.name}, ${d.criteria}, ${d.weight || 10}, ${d.maxScore || 10}, ${d.description}, ${d.status || 'active'})`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/scoring-rules/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sales_scoring_rules SET
      name=${d.name}, criteria=${d.criteria}, weight=${d.weight || 10}, max_score=${d.maxScore || 10},
      description=${d.description}, status=${d.status}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/scoring-rules/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_scoring_rules WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/scoring-rules/recalculate-all", async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`SELECT id FROM crm_opportunities WHERE stage NOT IN ('won','lost')`);
    let updated = 0;
    for (const row of r.rows) {
      await recalculateScore(Number(row.id));
      updated++;
    }
    res.json({ success: true, updated });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== NURTURE SEQUENCES ========================
router.get("/sales/nurture-sequences", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sales_nurture_sequences ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/nurture-executions", async (req: Request, res: Response) => {
  try {
    await ensureNurtureExecutionsTable();
    const status = req.query.status as string | undefined;
    const params: any[] = [];
    let where = "";
    if (status) { params.push(status); where = `WHERE status=$1`; }
    const r = await pool.query(
      `SELECT * FROM sales_nurture_executions ${where} ORDER BY step_due_at ASC LIMIT 100`,
      params
    );
    res.json(r.rows);
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/nurture-executions/process", async (_req: Request, res: Response) => {
  try {
    await processNurtureExecutions();
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/nurture-sequences", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextSeq("NUR", "sales_nurture_sequences");
    const steps = Array.isArray(d.steps) ? d.steps : [];
    await db.execute(sql`INSERT INTO sales_nurture_sequences
      (sequence_number, name, description, trigger_stage, status, steps, total_steps)
      VALUES (${num}, ${d.name}, ${d.description}, ${d.triggerStage}, ${d.status || 'active'},
        ${JSON.stringify(steps)}, ${steps.length})`);
    res.json({ success: true, sequence_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/nurture-sequences/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const steps = Array.isArray(d.steps) ? d.steps : [];
    await db.execute(sql`UPDATE sales_nurture_sequences SET
      name=${d.name}, description=${d.description}, trigger_stage=${d.triggerStage},
      status=${d.status}, steps=${JSON.stringify(steps)}, total_steps=${steps.length},
      updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/nurture-sequences/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_nurture_sequences WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SALES FORECAST (with accuracy comparison) ========================
router.get("/sales/forecast", async (req: Request, res: Response) => {
  const period = (req.query.period as string) || "monthly";
  let dateTrunc = "month";
  if (period === "weekly") dateTrunc = "week";
  else if (period === "quarterly") dateTrunc = "quarter";

  // Whitelist-validated dateTrunc (only 'week'|'month'|'quarter' can reach here)
  const [forecastR, summaryR, wonHistoryR, accuracyR] = await Promise.all([
    pool.query(`SELECT
      DATE_TRUNC('${dateTrunc}', expected_close_date) as period,
      COUNT(*)::int as deal_count,
      COALESCE(SUM(value),0)::numeric as total_value,
      COALESCE(SUM(value * probability / 100),0)::numeric as weighted_value,
      COALESCE(AVG(probability),0)::numeric as avg_probability,
      COALESCE(SUM(value * probability / 100) * 0.8,0)::numeric as low_estimate,
      COALESCE(SUM(value),0)::numeric as high_estimate
      FROM crm_opportunities
      WHERE stage NOT IN ('won','lost')
        AND expected_close_date IS NOT NULL
        AND expected_close_date >= CURRENT_DATE
      GROUP BY period ORDER BY period LIMIT 12`),
    pool.query(`SELECT
      COALESCE(SUM(value),0)::numeric as total_pipeline,
      COALESCE(SUM(value * probability / 100),0)::numeric as weighted_pipeline,
      COUNT(*)::int as active_deals,
      COALESCE(AVG(probability),0)::numeric as avg_probability,
      COUNT(*) FILTER(WHERE stage='won')::int as won_this_period,
      COALESCE(SUM(value) FILTER(WHERE stage='won'),0)::numeric as won_value
      FROM crm_opportunities WHERE stage NOT IN ('lost')`),
    pool.query(`SELECT
      DATE_TRUNC('${dateTrunc}', updated_at) as period,
      COUNT(*)::int as deals_won,
      COALESCE(SUM(value),0)::numeric as revenue_won
      FROM crm_opportunities
      WHERE stage = 'won'
      GROUP BY period ORDER BY period DESC LIMIT 12`),
    // Forecast accuracy: compare weighted forecast from prior periods to actual won value
    pool.query(`SELECT
      DATE_TRUNC('${dateTrunc}', expected_close_date) as forecast_period,
      COALESCE(SUM(value * probability / 100),0)::numeric as forecasted_weighted,
      COALESCE(SUM(value),0)::numeric as forecasted_total,
      COALESCE(SUM(CASE WHEN stage='won' THEN value ELSE 0 END),0)::numeric as actual_won,
      COUNT(*) FILTER(WHERE stage='won')::int as won_count,
      COUNT(*)::int as total_count,
      CASE WHEN COALESCE(SUM(value * probability / 100),0) > 0
        THEN ROUND(COALESCE(SUM(CASE WHEN stage='won' THEN value ELSE 0 END),0) /
                   COALESCE(SUM(value * probability / 100),0) * 100, 1)
        ELSE NULL END as accuracy_pct
      FROM crm_opportunities
      WHERE expected_close_date < CURRENT_DATE
        AND expected_close_date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY forecast_period ORDER BY forecast_period DESC LIMIT 12`)
  ]);

  res.json({
    forecast: forecastR.rows,
    summary: summaryR.rows[0] || {},
    wonHistory: wonHistoryR.rows,
    forecastAccuracy: accuracyR.rows
  });
});

// ======================== SALES ANALYTICS ========================
router.get("/sales/analytics", async (_req: Request, res: Response) => {
  const [funnelR, dealSizesR, velocityR, winLossR, repPerfR, winLossReasonsR] = await Promise.all([
    pool.query(`SELECT stage,
      COUNT(*)::int as count,
      COALESCE(SUM(value),0)::numeric as total_value,
      COALESCE(SUM(value * probability / 100),0)::numeric as weighted_value
      FROM crm_opportunities GROUP BY stage ORDER BY
      CASE stage WHEN 'lead' THEN 1 WHEN 'qualified' THEN 2 WHEN 'proposal' THEN 3
        WHEN 'negotiation' THEN 4 WHEN 'won' THEN 5 WHEN 'lost' THEN 6 ELSE 7 END`),
    pool.query(`SELECT
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
      COALESCE(AVG(value),0)::numeric as avg_deal_size,
      COUNT(*)::int as deal_count
      FROM crm_opportunities WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month ORDER BY month`),
    pool.query(`SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) FILTER(WHERE stage='won'),0)::numeric as avg_days_to_close,
      COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) FILTER(WHERE stage='lost'),0)::numeric as avg_days_lost,
      COUNT(*) FILTER(WHERE stage='won')::int as won_count,
      COUNT(*) FILTER(WHERE stage='lost')::int as lost_count,
      COUNT(*) FILTER(WHERE stage NOT IN ('won','lost'))::int as active_count,
      COALESCE(AVG(lead_score) FILTER(WHERE stage='won'),0)::numeric as avg_score_won,
      COALESCE(AVG(lead_score) FILTER(WHERE stage='lost'),0)::numeric as avg_score_lost
      FROM crm_opportunities`),
    pool.query(`SELECT stage, source,
      COUNT(*) FILTER(WHERE stage='won')::int as won,
      COUNT(*) FILTER(WHERE stage='lost')::int as lost,
      COUNT(*) FILTER(WHERE stage NOT IN ('won','lost'))::int as active,
      COALESCE(SUM(value) FILTER(WHERE stage='won'),0)::numeric as won_value,
      COALESCE(SUM(value) FILTER(WHERE stage='lost'),0)::numeric as lost_value
      FROM crm_opportunities GROUP BY stage, source`),
    pool.query(`SELECT assigned_rep as rep_name,
      COUNT(*)::int as total_deals,
      COUNT(*) FILTER(WHERE stage='won')::int as won_deals,
      COUNT(*) FILTER(WHERE stage='lost')::int as lost_deals,
      COALESCE(SUM(value) FILTER(WHERE stage='won'),0)::numeric as won_value,
      COALESCE(SUM(value),0)::numeric as pipeline_value,
      COALESCE(AVG(value),0)::numeric as avg_deal_size,
      COALESCE(AVG(lead_score),0)::numeric as avg_lead_score,
      CASE WHEN COUNT(*) FILTER(WHERE stage IN ('won','lost')) > 0
        THEN ROUND(COUNT(*) FILTER(WHERE stage='won')::numeric / COUNT(*) FILTER(WHERE stage IN ('won','lost')) * 100, 1)
        ELSE 0 END as win_rate
      FROM crm_opportunities WHERE assigned_rep IS NOT NULL
      GROUP BY assigned_rep ORDER BY won_value DESC`),
    pool.query(`SELECT
      outcome, reason_category,
      COUNT(*)::int as count,
      COALESCE(AVG(deal_value),0)::numeric as avg_deal_value,
      COALESCE(SUM(deal_value),0)::numeric as total_deal_value
      FROM crm_win_loss_reasons
      GROUP BY outcome, reason_category ORDER BY count DESC LIMIT 20`)
  ]);

  res.json({
    funnel: funnelR.rows,
    dealSizes: dealSizesR.rows,
    velocity: velocityR.rows[0] || {},
    winLoss: winLossR.rows,
    repPerformance: repPerfR.rows,
    winLossReasons: winLossReasonsR.rows
  });
});

// ======================== WIN/LOSS REASONS ========================
router.get("/sales/win-loss-reasons", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_win_loss_reasons ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/sales/win-loss-reasons", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    await db.execute(sql`INSERT INTO crm_win_loss_reasons
      (opportunity_id, opportunity_name, outcome, reason, reason_category, competitor, deal_value, rep_name, stage_lost, notes)
      VALUES (${d.opportunityId}, ${d.opportunityName}, ${d.outcome}, ${d.reason},
        ${d.reasonCategory}, ${d.competitor}, ${d.dealValue || 0}, ${d.repName}, ${d.stageLost}, ${d.notes})`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/win-loss-reasons/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_win_loss_reasons WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== LEAD CAPTURE — PUBLIC WEB FORM ========================
// Mounted at /webhook/lead-capture to bypass CSRF/origin checks (public endpoint)
router.post("/webhook/lead-capture", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const num = `LED-WEB-${Date.now()}`;
    await db.execute(sql`INSERT INTO crm_leads
      (lead_number, first_name, last_name, company, phone, email, source, status, priority, notes, estimated_value)
      VALUES (${num}, ${d.firstName || d.first_name || ""}, ${d.lastName || d.last_name || ""},
        ${d.company || ""}, ${d.phone || ""}, ${d.email || ""},
        ${d.source || "אתר"}, ${"new"}, ${"medium"}, ${d.notes || d.message || ""}, ${d.estimatedValue || 0})
      ON CONFLICT (lead_number) DO NOTHING`);
    res.json({ success: true, message: "ליד התקבל בהצלחה" });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// Legacy alias for backward compat (internal use only — goes through CSRF so safe)
router.post("/public/lead-capture", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const num = `LED-WEB-${Date.now()}`;
    await db.execute(sql`INSERT INTO crm_leads
      (lead_number, first_name, last_name, company, phone, email, source, status, priority, notes, estimated_value)
      VALUES (${num}, ${d.firstName || d.first_name || ""}, ${d.lastName || d.last_name || ""},
        ${d.company || ""}, ${d.phone || ""}, ${d.email || ""},
        ${d.source || "אתר"}, ${"new"}, ${"medium"}, ${d.notes || d.message || ""}, ${d.estimatedValue || 0})
      ON CONFLICT (lead_number) DO NOTHING`);
    res.json({ success: true, message: "ליד התקבל בהצלחה" });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== LEAD CAPTURE — MANUAL PHONE/EMAIL ========================
router.post("/leads/capture", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const source = d.source || "phone";
    const validSources = ["phone", "email", "referral", "walk-in", "website", "social", "event", "cold-call"];
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: `מקור לא תקין. ערכים אפשריים: ${validSources.join(", ")}` });
    }
    if (!d.phone && !d.email) {
      return res.status(400).json({ error: "נדרש מספר טלפון או כתובת אימייל" });
    }
    const num = `LED-${source.toUpperCase()}-${Date.now()}`;
    await db.execute(sql`INSERT INTO crm_leads
      (lead_number, first_name, last_name, company, phone, email, source, status, priority, notes, estimated_value, assigned_to)
      VALUES (${num}, ${d.firstName || d.first_name || ""}, ${d.lastName || d.last_name || ""},
        ${d.company || ""}, ${d.phone || ""}, ${d.email || ""},
        ${source}, ${"new"}, ${d.priority || "medium"},
        ${d.notes || ""}, ${d.estimatedValue || 0}, ${d.assignedTo || null})
      ON CONFLICT (lead_number) DO NOTHING`);

    if (Number(d.estimatedValue || 0) > 0 && d.createOpportunity) {
      const oppNum = await nextSeq("OPP", "crm_opportunities");
      const stageProbMap = await getConfiguredStageProbabilities();
      await db.execute(sql`INSERT INTO crm_opportunities
        (opportunity_number, name, customer_name, contact_name, phone, email, stage, value, probability, source, assigned_rep, notes)
        VALUES (${oppNum}, ${`ליד מ-${source}: ${d.firstName || ""} ${d.lastName || ""}`.trim()},
          ${d.company || `${d.firstName || ""} ${d.lastName || ""}`.trim()},
          ${`${d.firstName || ""} ${d.lastName || ""}`.trim()},
          ${d.phone || ""}, ${d.email || ""},
          ${"lead"}, ${d.estimatedValue || 0}, ${stageProbMap["lead"] ?? 10}, ${source},
          ${d.assignedTo || null}, ${d.notes || "נוצר מתהליך לכידת ליד"})`);
      return res.json({ success: true, lead_number: num, opportunity_created: true });
    }

    res.json({ success: true, lead_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== LEAD CAPTURE — INBOUND EMAIL PARSING ========================
/**
 * Webhook endpoint for inbound email-to-lead conversion.
 * Mounted at /webhook/email-inbound — bypasses CSRF/origin checks.
 * Accepts parsed email payloads (JSON or form-data) from providers:
 *   - SendGrid Inbound Parse, Mailgun, Postmark, SparkPost, etc.
 * Normalizes sender name/email/phone from body, creates a CRM lead with source='email'.
 */
router.post("/webhook/email-inbound", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Support multiple inbound email provider formats
    const from: string = body.from || body.sender || body.envelope?.from || "";
    const subject: string = body.subject || "";
    const text: string = body.text || body.body_plain || body.stripped_text || "";
    const html: string = body.html || body.body_html || "";

    // Parse sender name/email from "Name <email@domain>" format
    const fromMatch = from.match(/^(.*?)\s*<([^>]+)>$/);
    const senderEmail = fromMatch ? fromMatch[2].trim() : from.trim();
    const senderNameRaw = fromMatch ? fromMatch[1].trim() : "";
    const [firstName, ...lastParts] = senderNameRaw.split(" ");
    const lastName = lastParts.join(" ");

    // Extract phone from email body using regex (Israeli mobile formats)
    const phoneMatch = (text || html).match(/(?:0[5-9][0-9]-?\d{3}-?\d{4}|(?:\+972)[0-9\-]{8,12})/);
    const phone = phoneMatch ? phoneMatch[0] : "";

    // Extract company from email domain (heuristic)
    const emailDomain = senderEmail.split("@")[1] || "";
    const companyFromDomain = emailDomain && !["gmail.com","yahoo.com","hotmail.com","walla.co.il","012.net.il"].includes(emailDomain)
      ? emailDomain.replace(/\.(com|co\.il|il|net|org)$/, "")
      : "";

    if (!senderEmail) {
      return res.status(400).json({ error: "כתובת שולח חסרה" });
    }

    const num = `LED-EMAIL-${Date.now()}`;
    const notes = [
      subject ? `נושא: ${subject}` : "",
      text ? `תוכן: ${text.substring(0, 500)}` : ""
    ].filter(Boolean).join("\n");

    await db.execute(sql`INSERT INTO crm_leads
      (lead_number, first_name, last_name, company, phone, email, source, status, priority, notes, estimated_value)
      VALUES (${num}, ${firstName || ""}, ${lastName || ""}, ${companyFromDomain},
        ${phone}, ${senderEmail}, ${"email"}, ${"new"}, ${"medium"}, ${notes}, ${0})
      ON CONFLICT (lead_number) DO NOTHING`);

    console.log(`[LeadCapture] Inbound email lead created: ${num} from ${senderEmail}`);
    res.json({ success: true, lead_number: num, email: senderEmail });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
