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

router.use("/whatsapp", requireAuth as any);

// ── Auto-create tables (static SQL — no user input) ──
async function ensureTables() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(32) NOT NULL,
      customer_name VARCHAR(255),
      customer_id INT,
      agent_type VARCHAR(32) DEFAULT 'ai_sales' CHECK (agent_type IN ('ai_sales','ai_service','ai_measurement','ai_installation','human')),
      current_intent VARCHAR(48) DEFAULT 'general' CHECK (current_intent IN ('new_lead','quote_request','service_request','measurement_schedule','installation_schedule','general')),
      status VARCHAR(24) DEFAULT 'active' CHECK (status IN ('active','waiting','resolved','escalated')),
      assigned_agent_id INT,
      lead_id INT,
      project_id INT,
      messages_count INT DEFAULT 0,
      last_message_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
      direction VARCHAR(12) NOT NULL CHECK (direction IN ('inbound','outbound')),
      sender_type VARCHAR(12) NOT NULL CHECK (sender_type IN ('customer','ai','agent')),
      content TEXT,
      message_type VARCHAR(16) DEFAULT 'text' CHECK (message_type IN ('text','image','document','location','button')),
      media_url TEXT,
      ai_intent_detected VARCHAR(64),
      ai_confidence REAL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id SERIAL PRIMARY KEY,
      template_name VARCHAR(128) NOT NULL,
      category VARCHAR(32) DEFAULT 'welcome' CHECK (category IN ('welcome','followup','measurement_confirm','installation_confirm','payment_reminder','feedback','marketing')),
      content TEXT NOT NULL,
      variables JSONB DEFAULT '[]'::jsonb,
      language VARCHAR(8) DEFAULT 'he',
      status VARCHAR(16) DEFAULT 'draft' CHECK (status IN ('draft','approved','active')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS whatsapp_ai_config (
      id SERIAL PRIMARY KEY,
      agent_type VARCHAR(32) NOT NULL UNIQUE CHECK (agent_type IN ('ai_sales','ai_service','ai_measurement','ai_installation')),
      system_prompt TEXT,
      enabled BOOLEAN DEFAULT true,
      escalation_threshold REAL DEFAULT 0.3,
      max_messages_before_escalate INT DEFAULT 10,
      business_hours_only BOOLEAN DEFAULT false
    );
  `));
}
ensureTables().catch(e => console.error("whatsapp-hub table init error:", e));

interface QRow { [key: string]: unknown }

// Static-only query helper (no user input allowed)
async function q(query: string): Promise<QRow[]> {
  try {
    const r = await db.execute(sql.raw(query));
    return (r.rows || []) as QRow[];
  } catch (e: any) {
    console.error("whatsapp-hub query error:", e.message);
    throw e; // propagate instead of silently returning []
  }
}

// Parameterized query helper — safe for user input
async function qp(query: ReturnType<typeof sql>): Promise<QRow[]> {
  try {
    const r = await db.execute(query);
    return (r.rows || []) as QRow[];
  } catch (e: any) {
    console.error("whatsapp-hub parameterized query error:", e.message);
    throw e;
  }
}

// Allowlists for enum validation
const VALID_STATUSES = new Set(['active', 'waiting', 'resolved', 'escalated']);
const VALID_AGENT_TYPES = new Set(['ai_sales', 'ai_service', 'ai_measurement', 'ai_installation', 'human']);
const VALID_INTENTS = new Set(['new_lead', 'quote_request', 'service_request', 'measurement_schedule', 'installation_schedule', 'general']);
const VALID_MSG_TYPES = new Set(['text', 'image', 'document', 'location', 'button']);

// ── Conversations ──
router.get("/whatsapp/conversations", async (req: Request, res: Response) => {
  try {
    const { status, agent_type, intent } = req.query;

    // Validate against allowlists — reject unknown values
    if (status && !VALID_STATUSES.has(String(status))) {
      res.status(400).json({ error: "ערך status לא תקין" }); return;
    }
    if (agent_type && !VALID_AGENT_TYPES.has(String(agent_type))) {
      res.status(400).json({ error: "ערך agent_type לא תקין" }); return;
    }
    if (intent && !VALID_INTENTS.has(String(intent))) {
      res.status(400).json({ error: "ערך intent לא תקין" }); return;
    }

    // Build parameterized query using drizzle sql template
    const rows = await qp(sql`
      SELECT c.*,
        (SELECT content FROM whatsapp_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM whatsapp_conversations c
      WHERE 1=1
        ${status ? sql`AND c.status = ${String(status)}` : sql``}
        ${agent_type ? sql`AND c.agent_type = ${String(agent_type)}` : sql``}
        ${intent ? sql`AND c.current_intent = ${String(intent)}` : sql``}
      ORDER BY c.last_message_at DESC
      LIMIT 200
    `);
    res.json({ conversations: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/whatsapp/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "id לא תקין" }); return; }
    const rows = await qp(sql`
      SELECT * FROM whatsapp_messages
      WHERE conversation_id = ${id}
      ORDER BY created_at ASC
    `);
    res.json({ messages: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Send message ──
router.post("/whatsapp/send", async (req: Request, res: Response) => {
  try {
    const { conversation_id, content, message_type, media_url } = req.body;
    if (!conversation_id || !content) { res.status(400).json({ error: "conversation_id and content required" }); return; }
    const convId = parseInt(String(conversation_id), 10);
    if (isNaN(convId) || convId <= 0) { res.status(400).json({ error: "conversation_id לא תקין" }); return; }
    const msgType = VALID_MSG_TYPES.has(String(message_type)) ? String(message_type) : 'text';
    const mediaUrl = media_url ? String(media_url) : null;

    const rows = await qp(sql`
      INSERT INTO whatsapp_messages (conversation_id, direction, sender_type, content, message_type, media_url)
      VALUES (${convId}, 'outbound', 'agent', ${String(content)}, ${msgType}, ${mediaUrl})
      RETURNING *
    `);
    await qp(sql`UPDATE whatsapp_conversations SET messages_count = messages_count + 1, last_message_at = NOW() WHERE id = ${convId}`);
    res.json({ message: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Webhook (receive inbound) ──
router.post("/whatsapp/webhook", async (req: Request, res: Response) => {
  try {
    const { phone_number, customer_name, content, message_type, media_url } = req.body;
    if (!phone_number || !content) { res.status(400).json({ error: "phone_number and content required" }); return; }
    const msgType = VALID_MSG_TYPES.has(String(message_type)) ? String(message_type) : 'text';
    const mediaUrl = media_url ? String(media_url) : null;
    const phone = String(phone_number).slice(0, 32); // enforce max length
    const custName = customer_name ? String(customer_name).slice(0, 255) : null;

    // Find or create conversation
    const convRows = await qp(sql`
      SELECT id FROM whatsapp_conversations
      WHERE phone_number = ${phone} AND status IN ('active','waiting')
      LIMIT 1
    `);
    let convId: number;
    if (convRows.length > 0) {
      convId = Number(convRows[0].id);
    } else {
      const newConv = await qp(sql`
        INSERT INTO whatsapp_conversations (phone_number, customer_name, agent_type, current_intent, status)
        VALUES (${phone}, ${custName}, 'ai_sales', 'new_lead', 'active')
        RETURNING id
      `);
      convId = Number(newConv[0].id);
    }
    await qp(sql`
      INSERT INTO whatsapp_messages (conversation_id, direction, sender_type, content, message_type, media_url)
      VALUES (${convId}, 'inbound', 'customer', ${String(content)}, ${msgType}, ${mediaUrl})
    `);
    await qp(sql`UPDATE whatsapp_conversations SET messages_count = messages_count + 1, last_message_at = NOW() WHERE id = ${convId}`);
    res.json({ conversation_id: convId, status: "received" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── AI Process message ──
router.post("/whatsapp/ai/process-message", async (req: Request, res: Response) => {
  try {
    const { conversation_id } = req.body;
    if (!conversation_id) { res.status(400).json({ error: "conversation_id required" }); return; }
    const convId = parseInt(String(conversation_id), 10);
    if (isNaN(convId) || convId <= 0) { res.status(400).json({ error: "conversation_id לא תקין" }); return; }

    const conv = await qp(sql`SELECT * FROM whatsapp_conversations WHERE id = ${convId}`);
    if (!conv.length) { res.status(404).json({ error: "Conversation not found" }); return; }
    const c = conv[0];
    const agentType = String(c.agent_type);

    if (!VALID_AGENT_TYPES.has(agentType)) { res.status(400).json({ error: "agent_type לא תקין" }); return; }

    const config = await qp(sql`SELECT * FROM whatsapp_ai_config WHERE agent_type = ${agentType} AND enabled = true`);
    if (!config.length) { res.json({ action: "no_ai_config", response: null }); return; }
    const cfg = config[0];
    const maxMsg = Number(cfg.max_messages_before_escalate) || 10;
    if (Number(c.messages_count) >= maxMsg) {
      await qp(sql`UPDATE whatsapp_conversations SET status = 'escalated', agent_type = 'human' WHERE id = ${convId}`);
      res.json({ action: "escalated", response: "השיחה הועברה לנציג אנושי" });
      return;
    }
    const lastMsg = await qp(sql`
      SELECT * FROM whatsapp_messages
      WHERE conversation_id = ${convId} AND direction = 'inbound'
      ORDER BY created_at DESC LIMIT 1
    `);
    const customerMsg = lastMsg.length ? String(lastMsg[0].content) : "";

    // Simulate AI intent detection + response
    let detectedIntent = "general";
    let confidence = 0.85;
    let aiResponse = "תודה על הפנייה! אחד מנציגנו יחזור אליך בהקדם.";
    const lower = customerMsg.toLowerCase();
    if (lower.includes("מחיר") || lower.includes("הצעה") || lower.includes("עלות")) {
      detectedIntent = "quote_request"; confidence = 0.92;
      aiResponse = "בשמחה! אשלח לך הצעת מחיר מפורטת. האם תוכל לשלוח את מידות החלון/הדלת?";
    } else if (lower.includes("מדידה") || lower.includes("מודד")) {
      detectedIntent = "measurement_schedule"; confidence = 0.90;
      aiResponse = "מצוין! אתאם עבורך מועד מדידה. מתי נוח לך? בבוקר או אחה\"צ?";
    } else if (lower.includes("התקנה") || lower.includes("מתקין")) {
      detectedIntent = "installation_schedule"; confidence = 0.88;
      aiResponse = "אתאם עבורך מועד התקנה. אנא שלח את מספר ההזמנה שלך.";
    } else if (lower.includes("תקלה") || lower.includes("בעיה") || lower.includes("שירות")) {
      detectedIntent = "service_request"; confidence = 0.87;
      aiResponse = "מצטערים לשמוע! אנא תאר את התקלה ונפתח עבורך קריאת שירות.";
    }

    // Save AI response — all values parameterized
    await qp(sql`
      INSERT INTO whatsapp_messages (conversation_id, direction, sender_type, content, message_type, ai_intent_detected, ai_confidence)
      VALUES (${convId}, 'outbound', 'ai', ${aiResponse}, 'text', ${detectedIntent}, ${confidence})
    `);
    await qp(sql`
      UPDATE whatsapp_conversations
      SET current_intent = ${detectedIntent}, messages_count = messages_count + 1, last_message_at = NOW()
      WHERE id = ${convId}
    `);
    res.json({ action: "responded", intent: detectedIntent, confidence, response: aiResponse });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Templates CRUD ──
router.get("/whatsapp/templates", async (_req: Request, res: Response) => {
  try {
    const rows = await q("SELECT * FROM whatsapp_templates ORDER BY created_at DESC");
    res.json({ templates: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/whatsapp/templates", async (req: Request, res: Response) => {
  try {
    const { template_name, category, content, variables, language } = req.body;
    if (!template_name || !content) { res.status(400).json({ error: "template_name and content required" }); return; }
    const validCategories = new Set(['welcome','followup','measurement_confirm','installation_confirm','payment_reminder','feedback','marketing']);
    const cat = validCategories.has(String(category)) ? String(category) : 'welcome';
    const lang = String(language || 'he').slice(0, 8);
    const vars = JSON.stringify(Array.isArray(variables) ? variables : []);

    const rows = await qp(sql`
      INSERT INTO whatsapp_templates (template_name, category, content, variables, language)
      VALUES (${String(template_name).slice(0,128)}, ${cat}, ${String(content)}, ${vars}::jsonb, ${lang})
      RETURNING *
    `);
    res.json({ template: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/whatsapp/templates/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "id לא תקין" }); return; }
    const { template_name, category, content, variables, language, status } = req.body;
    const validCategories = new Set(['welcome','followup','measurement_confirm','installation_confirm','payment_reminder','feedback','marketing']);
    const validStatuses = new Set(['draft','approved','active']);

    // Build parameterized update
    const updates: Array<ReturnType<typeof sql>> = [];
    if (template_name) updates.push(sql`template_name = ${String(template_name).slice(0,128)}`);
    if (category && validCategories.has(String(category))) updates.push(sql`category = ${String(category)}`);
    if (content) updates.push(sql`content = ${String(content)}`);
    if (variables) updates.push(sql`variables = ${JSON.stringify(Array.isArray(variables) ? variables : [])}::jsonb`);
    if (language) updates.push(sql`language = ${String(language).slice(0,8)}`);
    if (status && validStatuses.has(String(status))) updates.push(sql`status = ${String(status)}`);

    if (!updates.length) { res.status(400).json({ error: "No fields to update" }); return; }

    // Join updates
    const setClauses = updates.reduce((acc, curr, i) => i === 0 ? curr : sql`${acc}, ${curr}`);
    const rows = await qp(sql`UPDATE whatsapp_templates SET ${setClauses} WHERE id = ${id} RETURNING *`);
    res.json({ template: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/whatsapp/templates/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "id לא תקין" }); return; }
    await qp(sql`DELETE FROM whatsapp_templates WHERE id = ${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── AI Config CRUD ──
router.get("/whatsapp/ai-config", async (_req: Request, res: Response) => {
  try {
    const rows = await q("SELECT * FROM whatsapp_ai_config ORDER BY agent_type");
    res.json({ configs: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/whatsapp/ai-config", async (req: Request, res: Response) => {
  try {
    const { agent_type, system_prompt, enabled, escalation_threshold, max_messages_before_escalate, business_hours_only } = req.body;
    if (!VALID_AGENT_TYPES.has(String(agent_type))) { res.status(400).json({ error: "agent_type לא תקין" }); return; }
    const rows = await qp(sql`
      INSERT INTO whatsapp_ai_config (agent_type, system_prompt, enabled, escalation_threshold, max_messages_before_escalate, business_hours_only)
      VALUES (
        ${String(agent_type)},
        ${system_prompt ? String(system_prompt) : null},
        ${enabled !== false},
        ${Number(escalation_threshold) || 0.3},
        ${Number(max_messages_before_escalate) || 10},
        ${Boolean(business_hours_only)}
      )
      ON CONFLICT (agent_type) DO UPDATE SET
        system_prompt = EXCLUDED.system_prompt,
        enabled = EXCLUDED.enabled,
        escalation_threshold = EXCLUDED.escalation_threshold,
        max_messages_before_escalate = EXCLUDED.max_messages_before_escalate,
        business_hours_only = EXCLUDED.business_hours_only
      RETURNING *
    `);
    res.json({ config: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/whatsapp/ai-config/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "id לא תקין" }); return; }
    const { system_prompt, enabled, escalation_threshold, max_messages_before_escalate, business_hours_only } = req.body;

    const updates: Array<ReturnType<typeof sql>> = [];
    if (system_prompt !== undefined) updates.push(sql`system_prompt = ${String(system_prompt)}`);
    if (enabled !== undefined) updates.push(sql`enabled = ${Boolean(enabled)}`);
    if (escalation_threshold !== undefined) updates.push(sql`escalation_threshold = ${Number(escalation_threshold)}`);
    if (max_messages_before_escalate !== undefined) updates.push(sql`max_messages_before_escalate = ${Number(max_messages_before_escalate)}`);
    if (business_hours_only !== undefined) updates.push(sql`business_hours_only = ${Boolean(business_hours_only)}`);

    if (!updates.length) { res.status(400).json({ error: "No fields" }); return; }
    const setClauses = updates.reduce((acc, curr, i) => i === 0 ? curr : sql`${acc}, ${curr}`);
    const rows = await qp(sql`UPDATE whatsapp_ai_config SET ${setClauses} WHERE id = ${id} RETURNING *`);
    res.json({ config: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/whatsapp/ai-config/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) { res.status(400).json({ error: "id לא תקין" }); return; }
    await qp(sql`DELETE FROM whatsapp_ai_config WHERE id = ${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard (static aggregation queries — no user input) ──
router.get("/whatsapp/dashboard", async (_req: Request, res: Response) => {
  try {
    const byStatus = await q(`SELECT status, COUNT(*)::int as count FROM whatsapp_conversations GROUP BY status`);
    const byAgent = await q(`SELECT agent_type, COUNT(*)::int as count FROM whatsapp_conversations GROUP BY agent_type`);
    const today = await q(`SELECT COUNT(*)::int as count FROM whatsapp_conversations WHERE created_at >= CURRENT_DATE`);
    const resolved = await q(`SELECT COUNT(*)::int as count FROM whatsapp_conversations WHERE status = 'resolved' AND agent_type LIKE 'ai_%'`);
    const total = await q(`SELECT COUNT(*)::int as count FROM whatsapp_conversations WHERE agent_type LIKE 'ai_%'`);
    const aiTotal = Number(total[0]?.count) || 1;
    const aiResolved = Number(resolved[0]?.count) || 0;
    const avgResp = await q(`
      SELECT AVG(EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)))::int as avg_seconds
      FROM whatsapp_messages m1
      JOIN whatsapp_messages m2 ON m2.conversation_id = m1.conversation_id AND m2.direction = 'outbound'
      WHERE m1.direction = 'inbound'
        AND m1.created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);
    res.json({
      conversations_by_status: byStatus,
      conversations_by_agent: byAgent,
      conversations_today: Number(today[0]?.count) || 0,
      ai_resolution_rate: Math.round((aiResolved / aiTotal) * 100),
      avg_response_seconds: Number(avgResp[0]?.avg_seconds) || 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
