import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ───── AUTO-CREATE TABLES ───── */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_performance_daily (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      agent_name VARCHAR(200) NOT NULL,
      date DATE NOT NULL,
      leads_received INTEGER DEFAULT 0,
      leads_contacted INTEGER DEFAULT 0,
      meetings_scheduled INTEGER DEFAULT 0,
      meetings_completed INTEGER DEFAULT 0,
      quotes_sent INTEGER DEFAULT 0,
      deals_closed INTEGER DEFAULT 0,
      deals_lost INTEGER DEFAULT 0,
      total_revenue NUMERIC(15,2) DEFAULT 0,
      total_commission NUMERIC(15,2) DEFAULT 0,
      avg_response_time_min INTEGER DEFAULT 0,
      calls_outgoing INTEGER DEFAULT 0,
      calls_incoming INTEGER DEFAULT 0,
      calls_missed INTEGER DEFAULT 0,
      calls_returned INTEGER DEFAULT 0,
      avg_call_duration_sec INTEGER DEFAULT 0,
      total_talk_time_sec INTEGER DEFAULT 0,
      location_updates INTEGER DEFAULT 0,
      quotes_with_discount INTEGER DEFAULT 0,
      discount_avg_pct REAL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_call_stats (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      call_date DATE NOT NULL,
      call_type VARCHAR(20) CHECK (call_type IN ('outgoing','incoming','missed','returned')),
      duration_sec INTEGER DEFAULT 0,
      customer_name VARCHAR(300),
      customer_phone VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_conversion_funnel (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      period VARCHAR(30) NOT NULL,
      leads_total INTEGER DEFAULT 0,
      leads_to_contact_pct REAL DEFAULT 0,
      contact_to_meeting_pct REAL DEFAULT 0,
      meeting_to_quote_pct REAL DEFAULT 0,
      quote_to_close_pct REAL DEFAULT 0,
      overall_conversion_pct REAL DEFAULT 0,
      avg_deal_size NUMERIC(15,2) DEFAULT 0,
      pipeline_value NUMERIC(15,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_alerts (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      alert_type VARCHAR(30) CHECK (alert_type IN ('no_followup','missed_calls','low_conversion','high_discount','location_mismatch','inactive')),
      severity VARCHAR(10) CHECK (severity IN ('info','warning','critical')),
      message TEXT NOT NULL,
      acknowledged BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function init() { if (!tablesReady) { await ensureTables(); tablesReady = true; } }

/* ───── SEED DEMO DATA ───── */
async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM agent_performance_daily");
  if (Number(rows[0].cnt) > 0) return;

  const agents = [
    { id: 1, name: "יוסי כהן" },
    { id: 2, name: "שרה לוי" },
    { id: 3, name: "דוד מזרחי" },
    { id: 4, name: "רחל אברהם" },
    { id: 5, name: "אלון גולדשטיין" },
  ];

  for (const a of agents) {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-03-${String(d).padStart(2, "0")}`;
      const lr = 5 + Math.floor(Math.random() * 15);
      const lc = Math.floor(lr * (0.6 + Math.random() * 0.3));
      const ms = Math.floor(lc * (0.3 + Math.random() * 0.3));
      const mc = Math.floor(ms * (0.6 + Math.random() * 0.3));
      const qs = Math.floor(mc * (0.5 + Math.random() * 0.4));
      const dc = Math.floor(qs * (0.2 + Math.random() * 0.3));
      const dl = Math.floor(qs * 0.1);
      const rev = dc * (8000 + Math.floor(Math.random() * 40000));
      const comm = Math.floor(rev * 0.05);
      const co = 8 + Math.floor(Math.random() * 20);
      const ci = 3 + Math.floor(Math.random() * 10);
      const cm = Math.floor(Math.random() * 4);
      const cr = Math.min(cm, Math.floor(Math.random() * 3));

      await pool.query(
        `INSERT INTO agent_performance_daily
          (agent_id, agent_name, date, leads_received, leads_contacted, meetings_scheduled, meetings_completed,
           quotes_sent, deals_closed, deals_lost, total_revenue, total_commission, avg_response_time_min,
           calls_outgoing, calls_incoming, calls_missed, calls_returned, avg_call_duration_sec, total_talk_time_sec,
           location_updates, quotes_with_discount, discount_avg_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [a.id, a.name, date, lr, lc, ms, mc, qs, dc, dl, rev, comm,
         5 + Math.floor(Math.random() * 55), co, ci, cm, cr,
         120 + Math.floor(Math.random() * 300), (co + ci) * (120 + Math.floor(Math.random() * 200)),
         Math.floor(Math.random() * 8), Math.floor(qs * 0.3), 2 + Math.random() * 12]
      );
    }

    // funnel
    await pool.query(
      `INSERT INTO agent_conversion_funnel (agent_id, period, leads_total, leads_to_contact_pct, contact_to_meeting_pct, meeting_to_quote_pct, quote_to_close_pct, overall_conversion_pct, avg_deal_size, pipeline_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [a.id, "2026-03", 80 + Math.floor(Math.random() * 120),
       65 + Math.random() * 25, 35 + Math.random() * 30, 40 + Math.random() * 30, 20 + Math.random() * 30,
       5 + Math.random() * 15, 15000 + Math.floor(Math.random() * 35000), 200000 + Math.floor(Math.random() * 800000)]
    );
  }

  // alerts
  const alertTypes = ["no_followup", "missed_calls", "low_conversion", "high_discount", "location_mismatch", "inactive"] as const;
  const severities = ["info", "warning", "critical"] as const;
  const messages = [
    "לא בוצע מעקב ללידים מ-3 ימים אחרונים",
    "5 שיחות שלא נענו היום",
    "אחוז המרה מתחת ל-10% החודש",
    "הנחה ממוצעת מעל 15% — נדרש אישור",
    "מיקום לא עודכן מזה 6 שעות",
    "לא היה פעיל ביומיים האחרונים",
  ];

  for (let i = 0; i < 8; i++) {
    const ai = agents[Math.floor(Math.random() * agents.length)];
    const ti = Math.floor(Math.random() * alertTypes.length);
    await pool.query(
      `INSERT INTO agent_alerts (agent_id, alert_type, severity, message) VALUES ($1,$2,$3,$4)`,
      [ai.id, alertTypes[ti], severities[Math.floor(Math.random() * severities.length)], messages[ti]]
    );
  }
}

/* ───── ENDPOINTS ───── */

// GET daily metrics
router.get("/agent-performance/daily/:agentId", async (req, res) => {
  try {
    await init();
    const { agentId } = req.params;
    const from = (req.query.from as string) || "2026-03-01";
    const to = (req.query.to as string) || "2026-03-31";
    const { rows } = await pool.query(
      `SELECT * FROM agent_performance_daily WHERE agent_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date`,
      [agentId, from, to]
    );
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET conversion funnel
router.get("/agent-performance/funnel/:agentId", async (req, res) => {
  try {
    await init();
    const period = (req.query.period as string) || "2026-03";
    const { rows } = await pool.query(
      `SELECT * FROM agent_conversion_funnel WHERE agent_id=$1 AND period=$2 ORDER BY id DESC LIMIT 1`,
      [req.params.agentId, period]
    );
    res.json({ data: rows[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET call statistics
router.get("/agent-performance/calls/:agentId", async (req, res) => {
  try {
    await init();
    const { rows } = await pool.query(
      `SELECT call_type, COUNT(*) as cnt, COALESCE(AVG(duration_sec),0) as avg_dur, COALESCE(SUM(duration_sec),0) as total_dur
       FROM agent_call_stats WHERE agent_id=$1 GROUP BY call_type`,
      [req.params.agentId]
    );
    // also aggregate from daily
    const { rows: daily } = await pool.query(
      `SELECT SUM(calls_outgoing) as outgoing, SUM(calls_incoming) as incoming, SUM(calls_missed) as missed,
              SUM(calls_returned) as returned, AVG(avg_call_duration_sec) as avg_dur, SUM(total_talk_time_sec) as total_talk
       FROM agent_performance_daily WHERE agent_id=$1`,
      [req.params.agentId]
    );
    res.json({ detailed: rows, summary: daily[0] || {} });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET rankings
router.get("/agent-performance/rankings", async (_req, res) => {
  try {
    await init(); await seedIfEmpty();
    const { rows } = await pool.query(`
      SELECT agent_id, agent_name,
        SUM(deals_closed) as total_deals, SUM(total_revenue) as total_revenue,
        SUM(total_commission) as total_commission, SUM(leads_received) as total_leads,
        SUM(meetings_completed) as total_meetings, SUM(quotes_sent) as total_quotes,
        AVG(avg_response_time_min)::int as avg_response,
        CASE WHEN SUM(quotes_sent)>0 THEN ROUND(SUM(deals_closed)::numeric/SUM(quotes_sent)*100,1) ELSE 0 END as close_rate,
        SUM(calls_outgoing + calls_incoming) as total_calls,
        SUM(calls_missed) as total_missed
      FROM agent_performance_daily
      GROUP BY agent_id, agent_name
      ORDER BY total_revenue DESC
    `);
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET comparison
router.get("/agent-performance/comparison", async (req, res) => {
  try {
    await init();
    const ids = ((req.query.agents as string) || "").split(",").map(Number).filter(Boolean);
    if (ids.length < 2) return res.status(400).json({ error: "נדרשים לפחות 2 סוכנים" });
    const { rows } = await pool.query(`
      SELECT agent_id, agent_name,
        SUM(deals_closed) as total_deals, SUM(total_revenue) as total_revenue,
        SUM(total_commission) as total_commission, SUM(leads_received) as total_leads,
        SUM(meetings_completed) as total_meetings, SUM(quotes_sent) as total_quotes,
        AVG(avg_response_time_min)::int as avg_response,
        CASE WHEN SUM(quotes_sent)>0 THEN ROUND(SUM(deals_closed)::numeric/SUM(quotes_sent)*100,1) ELSE 0 END as close_rate,
        AVG(discount_avg_pct)::real as avg_discount
      FROM agent_performance_daily WHERE agent_id = ANY($1)
      GROUP BY agent_id, agent_name ORDER BY total_revenue DESC
    `, [ids]);
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET alerts
router.get("/agent-performance/alerts", async (_req, res) => {
  try {
    await init();
    const { rows } = await pool.query(
      `SELECT * FROM agent_alerts WHERE acknowledged=false ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC`
    );
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST acknowledge alert
router.post("/agent-performance/alerts/:id/acknowledge", async (req, res) => {
  try {
    await init();
    await pool.query(`UPDATE agent_alerts SET acknowledged=true WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST record daily stats
router.post("/agent-performance/record-daily", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO agent_performance_daily
        (agent_id, agent_name, date, leads_received, leads_contacted, meetings_scheduled, meetings_completed,
         quotes_sent, deals_closed, deals_lost, total_revenue, total_commission, avg_response_time_min,
         calls_outgoing, calls_incoming, calls_missed, calls_returned, avg_call_duration_sec, total_talk_time_sec,
         location_updates, quotes_with_discount, discount_avg_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [b.agent_id, b.agent_name, b.date, b.leads_received||0, b.leads_contacted||0,
       b.meetings_scheduled||0, b.meetings_completed||0, b.quotes_sent||0, b.deals_closed||0,
       b.deals_lost||0, b.total_revenue||0, b.total_commission||0, b.avg_response_time_min||0,
       b.calls_outgoing||0, b.calls_incoming||0, b.calls_missed||0, b.calls_returned||0,
       b.avg_call_duration_sec||0, b.total_talk_time_sec||0, b.location_updates||0,
       b.quotes_with_discount||0, b.discount_avg_pct||0]
    );
    res.json({ data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET dashboard (top KPIs, rankings, funnel, alerts)
router.get("/agent-performance/dashboard", async (_req, res) => {
  try {
    await init(); await seedIfEmpty();

    // KPIs this month
    const { rows: kpi } = await pool.query(`
      SELECT SUM(deals_closed) as total_deals, SUM(total_revenue) as total_revenue,
        SUM(total_commission) as total_commission, SUM(leads_received) as total_leads,
        SUM(meetings_completed) as total_meetings, SUM(quotes_sent) as total_quotes,
        SUM(calls_outgoing+calls_incoming) as total_calls, SUM(calls_missed) as total_missed,
        AVG(avg_response_time_min)::int as avg_response
      FROM agent_performance_daily WHERE date >= date_trunc('month', CURRENT_DATE)
    `);

    // top 5 agents
    const { rows: top } = await pool.query(`
      SELECT agent_id, agent_name, SUM(total_revenue) as revenue, SUM(deals_closed) as deals
      FROM agent_performance_daily WHERE date >= date_trunc('month', CURRENT_DATE)
      GROUP BY agent_id, agent_name ORDER BY revenue DESC LIMIT 5
    `);

    // funnels
    const { rows: funnels } = await pool.query(`
      SELECT * FROM agent_conversion_funnel ORDER BY id DESC LIMIT 10
    `);

    // alerts
    const { rows: alerts } = await pool.query(
      `SELECT * FROM agent_alerts WHERE acknowledged=false ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 10`
    );

    res.json({ kpi: kpi[0], topAgents: top, funnels, alerts });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
