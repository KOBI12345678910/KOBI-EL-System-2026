import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

interface AuthRequest extends Request {
  user?: { id: number; username: string; role?: string };
}

const router = Router();

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user;
  next();
}

router.use("/call-analysis", requireAuth as any);

// ── Auto-create tables ──
async function ensureTables() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS call_recordings (
      id SERIAL PRIMARY KEY,
      call_id VARCHAR(64) UNIQUE,
      agent_id INT,
      agent_name VARCHAR(128),
      customer_phone VARCHAR(32),
      customer_name VARCHAR(255),
      direction VARCHAR(12) DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
      duration_seconds INT DEFAULT 0,
      recording_url TEXT,
      transcript_status VARCHAR(16) DEFAULT 'pending' CHECK (transcript_status IN ('pending','processing','completed','failed')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS call_transcripts (
      id SERIAL PRIMARY KEY,
      recording_id INT NOT NULL REFERENCES call_recordings(id) ON DELETE CASCADE,
      full_text TEXT,
      segments JSONB DEFAULT '[]'::jsonb,
      language VARCHAR(8) DEFAULT 'he',
      word_count INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS call_insights (
      id SERIAL PRIMARY KEY,
      recording_id INT NOT NULL REFERENCES call_recordings(id) ON DELETE CASCADE,
      sentiment_score REAL DEFAULT 0,
      sentiment_label VARCHAR(12) DEFAULT 'neutral' CHECK (sentiment_label IN ('positive','neutral','negative')),
      buy_intent_score REAL DEFAULT 0,
      objections JSONB DEFAULT '[]'::jsonb,
      commitments JSONB DEFAULT '[]'::jsonb,
      action_items JSONB DEFAULT '[]'::jsonb,
      key_topics JSONB DEFAULT '[]'::jsonb,
      quality_score INT DEFAULT 50,
      flags JSONB DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS call_alerts (
      id SERIAL PRIMARY KEY,
      recording_id INT NOT NULL REFERENCES call_recordings(id) ON DELETE CASCADE,
      agent_id INT,
      alert_type VARCHAR(32) CHECK (alert_type IN ('negative_sentiment','false_promise','pricing_below_cost','inappropriate','no_followup_scheduled')),
      severity VARCHAR(12) DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
      description TEXT,
      status VARCHAR(12) DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `));
}
ensureTables().catch(e => console.error("call-analysis table init error:", e));

interface QRow { [key: string]: unknown }
async function q(query: string): Promise<QRow[]> {
  try { const r = await db.execute(sql.raw(query)); return (r.rows || []) as QRow[]; }
  catch (e: any) { console.error("call-analysis query error:", e.message); return []; }
}

// ── Recordings CRUD ──
router.get("/call-analysis/recordings", async (req: Request, res: Response) => {
  try {
    const { status, agent_id, direction } = req.query;
    let where = "WHERE 1=1";
    if (status) where += ` AND r.transcript_status = '${status}'`;
    if (agent_id) where += ` AND r.agent_id = ${Number(agent_id)}`;
    if (direction) where += ` AND r.direction = '${direction}'`;
    const rows = await q(`
      SELECT r.*,
        i.sentiment_label, i.sentiment_score, i.buy_intent_score, i.quality_score
      FROM call_recordings r
      LEFT JOIN call_insights i ON i.recording_id = r.id
      ${where}
      ORDER BY r.created_at DESC LIMIT 200
    `);
    res.json({ recordings: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/call-analysis/recordings", async (req: Request, res: Response) => {
  try {
    const { call_id, agent_id, agent_name, customer_phone, customer_name, direction, duration_seconds, recording_url } = req.body;
    const rows = await q(`
      INSERT INTO call_recordings (call_id, agent_id, agent_name, customer_phone, customer_name, direction, duration_seconds, recording_url)
      VALUES ('${call_id||Date.now()}', ${agent_id||'NULL'}, ${agent_name ? `'${agent_name.replace(/'/g,"''")}'` : 'NULL'},
        ${customer_phone ? `'${customer_phone}'` : 'NULL'}, ${customer_name ? `'${customer_name.replace(/'/g,"''")}'` : 'NULL'},
        '${direction||'inbound'}', ${duration_seconds||0}, ${recording_url ? `'${recording_url}'` : 'NULL'})
      RETURNING *
    `);
    res.json({ recording: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/call-analysis/recordings/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM call_recordings WHERE id = ${Number(req.params.id)}`);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ recording: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Transcribe (simulate) ──
router.post("/call-analysis/:recordingId/transcribe", async (req: Request, res: Response) => {
  try {
    const rid = Number(req.params.recordingId);
    await q(`UPDATE call_recordings SET transcript_status = 'processing' WHERE id = ${rid}`);
    // Simulate transcription
    const agentName = (await q(`SELECT agent_name FROM call_recordings WHERE id = ${rid}`))[0]?.agent_name || "נציג";
    const custName = (await q(`SELECT customer_name FROM call_recordings WHERE id = ${rid}`))[0]?.customer_name || "לקוח";
    const segments = [
      { speaker: String(agentName), text: "שלום, כאן טכנוקולוזי, במה אוכל לעזור?", timestamp_sec: 0 },
      { speaker: String(custName), text: "שלום, אני מעוניין בהצעת מחיר לחלונות אלומיניום", timestamp_sec: 5 },
      { speaker: String(agentName), text: "בשמחה! כמה חלונות אתה צריך ומה המידות?", timestamp_sec: 12 },
      { speaker: String(custName), text: "שלושה חלונות, כל אחד 120 על 150", timestamp_sec: 20 },
      { speaker: String(agentName), text: "מצוין. אני מכין לך הצעה ושולח עד סוף היום", timestamp_sec: 28 },
      { speaker: String(custName), text: "תודה רבה, מחכה", timestamp_sec: 35 },
    ];
    const fullText = segments.map(s => `${s.speaker}: ${s.text}`).join("\n");
    const wordCount = fullText.split(/\s+/).length;
    await q(`
      INSERT INTO call_transcripts (recording_id, full_text, segments, word_count)
      VALUES (${rid}, '${fullText.replace(/'/g,"''")}', '${JSON.stringify(segments)}', ${wordCount})
      ON CONFLICT DO NOTHING
    `);
    await q(`UPDATE call_recordings SET transcript_status = 'completed' WHERE id = ${rid}`);
    res.json({ status: "completed", word_count: wordCount, segments_count: segments.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Analyze (generate insights) ──
router.post("/call-analysis/:recordingId/analyze", async (req: Request, res: Response) => {
  try {
    const rid = Number(req.params.recordingId);
    const transcript = await q(`SELECT * FROM call_transcripts WHERE recording_id = ${rid}`);
    if (!transcript.length) { res.status(400).json({ error: "Transcribe first" }); return; }
    const text = String(transcript[0].full_text || "");
    // Simulate AI analysis
    const hasPriceRequest = text.includes("מחיר") || text.includes("הצעה") || text.includes("עלות");
    const hasComplaint = text.includes("בעיה") || text.includes("תקלה") || text.includes("לא מרוצה");
    const sentimentScore = hasComplaint ? -0.4 : 0.6;
    const sentimentLabel = sentimentScore > 0.2 ? "positive" : sentimentScore < -0.2 ? "negative" : "neutral";
    const buyIntent = hasPriceRequest ? 0.78 : 0.35;
    const objections = hasPriceRequest ? [{ text: "לבדוק מחיר מול מתחרים", severity: "medium" }] : [];
    const commitments = [{ text: "לשלוח הצעת מחיר עד סוף היום", owner: "agent" }];
    const actionItems = [{ text: "הכנת הצעת מחיר", assignee: "agent", deadline: "today" }];
    const keyTopics = ["חלונות אלומיניום", "הצעת מחיר", "מידות"];
    const qualityScore = 82;
    const flags: string[] = [];
    await q(`
      INSERT INTO call_insights (recording_id, sentiment_score, sentiment_label, buy_intent_score, objections, commitments, action_items, key_topics, quality_score, flags)
      VALUES (${rid}, ${sentimentScore}, '${sentimentLabel}', ${buyIntent},
        '${JSON.stringify(objections)}', '${JSON.stringify(commitments)}', '${JSON.stringify(actionItems)}',
        '${JSON.stringify(keyTopics)}', ${qualityScore}, '${JSON.stringify(flags)}')
      ON CONFLICT DO NOTHING
    `);
    // Generate alerts if needed
    if (sentimentLabel === "negative") {
      await q(`INSERT INTO call_alerts (recording_id, agent_id, alert_type, severity, description) VALUES (${rid}, (SELECT agent_id FROM call_recordings WHERE id = ${rid}), 'negative_sentiment', 'high', 'שיחה עם סנטימנט שלילי - ${sentimentScore}')`);
    }
    res.json({ sentiment_label: sentimentLabel, sentiment_score: sentimentScore, buy_intent: buyIntent, quality_score: qualityScore, topics: keyTopics });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Get transcript / insights ──
router.get("/call-analysis/:recordingId/transcript", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM call_transcripts WHERE recording_id = ${Number(req.params.recordingId)}`);
    res.json({ transcript: rows[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/call-analysis/:recordingId/insights", async (req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM call_insights WHERE recording_id = ${Number(req.params.recordingId)}`);
    res.json({ insights: rows[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Search transcripts ──
router.get("/call-analysis/search", async (req: Request, res: Response) => {
  try {
    const keyword = String(req.query.q || "").replace(/'/g, "''");
    if (!keyword) { res.status(400).json({ error: "q parameter required" }); return; }
    const rows = await q(`
      SELECT t.recording_id, r.agent_name, r.customer_name, r.created_at, t.full_text,
        ts_headline('simple', t.full_text, plainto_tsquery('simple', '${keyword}'), 'MaxFragments=2, MaxWords=20') as highlight
      FROM call_transcripts t
      JOIN call_recordings r ON r.id = t.recording_id
      WHERE t.full_text ILIKE '%${keyword}%'
      ORDER BY r.created_at DESC LIMIT 50
    `);
    res.json({ results: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Alerts ──
router.get("/call-analysis/alerts", async (req: Request, res: Response) => {
  try {
    const { status, severity } = req.query;
    let where = "WHERE 1=1";
    if (status) where += ` AND a.status = '${status}'`;
    if (severity) where += ` AND a.severity = '${severity}'`;
    const rows = await q(`
      SELECT a.*, r.agent_name, r.customer_name
      FROM call_alerts a
      JOIN call_recordings r ON r.id = a.recording_id
      ${where}
      ORDER BY a.created_at DESC LIMIT 100
    `);
    res.json({ alerts: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/call-analysis/alerts/:id", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const rows = await q(`UPDATE call_alerts SET status = '${status}' WHERE id = ${Number(req.params.id)} RETURNING *`);
    res.json({ alert: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Agent stats ──
router.get("/call-analysis/agent-stats/:agentId", async (req: Request, res: Response) => {
  try {
    const aid = Number(req.params.agentId);
    const totalCalls = await q(`SELECT COUNT(*)::int as count, COALESCE(AVG(duration_seconds),0)::int as avg_duration FROM call_recordings WHERE agent_id = ${aid}`);
    const avgSentiment = await q(`SELECT AVG(i.sentiment_score) as avg_sentiment, AVG(i.quality_score)::int as avg_quality, AVG(i.buy_intent_score) as avg_buy_intent FROM call_insights i JOIN call_recordings r ON r.id = i.recording_id WHERE r.agent_id = ${aid}`);
    const alerts = await q(`SELECT alert_type, COUNT(*)::int as count FROM call_alerts WHERE agent_id = ${aid} GROUP BY alert_type`);
    res.json({
      total_calls: Number(totalCalls[0]?.count) || 0,
      avg_duration: Number(totalCalls[0]?.avg_duration) || 0,
      avg_sentiment: Number(avgSentiment[0]?.avg_sentiment) || 0,
      avg_quality: Number(avgSentiment[0]?.avg_quality) || 0,
      avg_buy_intent: Number(avgSentiment[0]?.avg_buy_intent) || 0,
      alerts_by_type: alerts,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard ──
router.get("/call-analysis/dashboard", async (_req: Request, res: Response) => {
  try {
    const total = await q(`SELECT COUNT(*)::int as count FROM call_recordings`);
    const today = await q(`SELECT COUNT(*)::int as count FROM call_recordings WHERE created_at >= CURRENT_DATE`);
    const avgQuality = await q(`SELECT AVG(quality_score)::int as avg FROM call_insights`);
    const sentDist = await q(`SELECT sentiment_label, COUNT(*)::int as count FROM call_insights GROUP BY sentiment_label`);
    const openAlerts = await q(`SELECT COUNT(*)::int as count FROM call_alerts WHERE status = 'open'`);
    const topAgents = await q(`
      SELECT r.agent_name, COUNT(*)::int as calls, AVG(i.quality_score)::int as avg_quality
      FROM call_recordings r LEFT JOIN call_insights i ON i.recording_id = r.id
      WHERE r.agent_name IS NOT NULL
      GROUP BY r.agent_name ORDER BY avg_quality DESC NULLS LAST LIMIT 10
    `);
    res.json({
      total_recordings: Number(total[0]?.count) || 0,
      recordings_today: Number(today[0]?.count) || 0,
      avg_quality_score: Number(avgQuality[0]?.avg) || 0,
      sentiment_distribution: sentDist,
      open_alerts: Number(openAlerts[0]?.count) || 0,
      top_agents: topAgents,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
