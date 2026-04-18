// ===================================================================
// ai-agents-system.ts
// מערכת סוכני AI לאוטומציה - ווטסאפ, שירות לקוחות, תיאום מדידות,
// תיאום התקנות ופקודות טרמינל
// ===================================================================

import { pool } from "@workspace/db";
import { Router, Request, Response } from "express";

// ===================================================================
// טיפוסים וממשקים
// ===================================================================

/** סוג סוכן AI */
type AgentType =
  | "sales_whatsapp"
  | "customer_service"
  | "measurement_coordinator"
  | "installation_coordinator"
  | "terminal_commander";

/** ערוץ תקשורת */
type ChannelType = "whatsapp" | "sms" | "email" | "telegram" | "web_chat";

/** סטטוס שיחה */
type ConversationStatus = "active" | "completed" | "transferred" | "failed";

/** הגדרת סוכן AI */
interface AIAgentConfig {
  id: number;
  agent_type: AgentType;
  agent_name: string;
  agent_name_he: string;
  model: string;
  system_prompt: string;
  tools: Record<string, any>;
  active: boolean;
  conversation_count: number;
  success_rate: number | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/** הודעה בשיחה */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  channel?: ChannelType;
  metadata?: Record<string, any>;
}

/** שיחה עם סוכן */
interface AIAgentConversation {
  id: number;
  agent_type: AgentType;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  channel: ChannelType;
  messages: ChatMessage[];
  outcome: string | null;
  appointment_date: string | null;
  assigned_salesperson: string | null;
  summary: string | null;
  sentiment: string | null;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

// ===================================================================
// הגדרות סוכנים - ברירת מחדל
// כל סוכן מקבל הנחיות מערכת, כלים זמינים והגדרות ספציפיות
// ===================================================================

const DEFAULT_AGENTS: Omit<AIAgentConfig, "id" | "conversation_count" | "success_rate" | "created_at" | "updated_at">[] = [
  {
    agent_type: "sales_whatsapp",
    agent_name: "Sales WhatsApp Bot",
    agent_name_he: "בוט מכירות ווטסאפ",
    model: "claude-opus-4-6",
    system_prompt: `אתה סוכן מכירות מקצועי בווטסאפ. התפקיד שלך:
- לברר את הצורך של הלקוח הפוטנציאלי
- לשאול שאלות מכוונות על סוג הפרויקט, תקציב, לוחות זמנים
- לסווג את רמת הרצינות של הליד (חם/פושר/קר)
- לתאם פגישת מכירות עם נציג מכירות אנושי
- לשלוח מידע ראשוני על החברה והשירותים
- תמיד להיות אדיב, מקצועי ולענות בעברית`,
    tools: {
      schedule_meeting: { description: "תיאום פגישת מכירות", params: ["date", "time", "salesperson"] },
      qualify_lead: { description: "סיווג ליד", params: ["score", "reason", "budget_range"] },
      send_brochure: { description: "שליחת חוברת מידע", params: ["type"] },
      create_lead: { description: "יצירת ליד חדש במערכת", params: ["name", "phone", "email", "source"] },
    },
    active: true,
    settings: { working_hours: { start: "08:00", end: "20:00" }, auto_reply_outside_hours: true, max_messages_before_transfer: 15, language: "he" },
  },
  {
    agent_type: "customer_service",
    agent_name: "Customer Service Bot",
    agent_name_he: "בוט שירות לקוחות",
    model: "claude-opus-4-6",
    system_prompt: `אתה נציג שירות לקוחות מקצועי. התפקיד שלך:
- לענות על שאלות לגבי סטטוס הזמנות ופרויקטים
- לטפל בתלונות ובעיות
- לפתוח כרטיסי תמיכה לבעיות מורכבות
- להעביר לנציג אנושי כשנדרש
- לספק מידע על אחריות, החזרות ומדיניות
- לנהל שיחה רגועה ומקצועית גם כשהלקוח כועס`,
    tools: {
      check_order_status: { description: "בדיקת סטטוס הזמנה", params: ["order_id"] },
      create_ticket: { description: "פתיחת כרטיס תמיכה", params: ["subject", "description", "priority"] },
      transfer_to_human: { description: "העברה לנציג אנושי", params: ["reason", "department"] },
      check_warranty: { description: "בדיקת אחריות", params: ["product_id", "purchase_date"] },
    },
    active: true,
    settings: { auto_create_ticket_after: 3, escalation_keywords: ["מנהל", "תלונה", "עורך דין", "משפטי"], language: "he" },
  },
  {
    agent_type: "measurement_coordinator",
    agent_name: "Measurement Coordinator",
    agent_name_he: "מתאם מדידות",
    model: "claude-opus-4-6",
    system_prompt: `אתה מתאם מדידות. התפקיד שלך:
- לתאם מועד מדידה בין המהנדס ללקוח
- לבדוק זמינות של המהנדס בלוח הזמנים
- לוודא שהלקוח מוכן למדידה (נגישות לאתר, נוכחות)
- לשלוח תזכורת יום לפני המדידה
- לטפל בשינויים וביטולים
- לעדכן את המערכת בתוצאות`,
    tools: {
      check_engineer_availability: { description: "בדיקת זמינות מהנדס", params: ["engineer_id", "date_range"] },
      schedule_measurement: { description: "תיאום מדידה", params: ["customer_id", "engineer_id", "date", "time", "address"] },
      send_reminder: { description: "שליחת תזכורת", params: ["contact_phone", "appointment_date"] },
      update_measurement_status: { description: "עדכון סטטוס מדידה", params: ["project_id", "status", "notes"] },
    },
    active: true,
    settings: { reminder_hours_before: 24, working_days: ["sunday", "monday", "tuesday", "wednesday", "thursday"], slot_duration_minutes: 90, language: "he" },
  },
  {
    agent_type: "installation_coordinator",
    agent_name: "Installation Coordinator",
    agent_name_he: "מתאם התקנות",
    model: "claude-opus-4-6",
    system_prompt: `אתה מתאם התקנות. התפקיד שלך:
- לתאם מועד התקנה בין צוות ההתקנה ללקוח
- לוודא שכל החומרים והציוד מוכנים
- לתאם הובלה אם נדרש
- לנהל לוח זמנים של צוותי התקנה
- לשלוח תזכורות ועדכונים
- לטפל בשינויים ובעיות בהתקנה`,
    tools: {
      check_team_availability: { description: "בדיקת זמינות צוות התקנה", params: ["team_id", "date_range"] },
      schedule_installation: { description: "תיאום התקנה", params: ["customer_id", "team_id", "date", "address", "duration_hours"] },
      check_materials_ready: { description: "בדיקת מוכנות חומרים", params: ["project_id"] },
      arrange_delivery: { description: "תיאום הובלה", params: ["from_warehouse", "to_address", "date"] },
      update_installation_status: { description: "עדכון סטטוס התקנה", params: ["project_id", "status", "notes", "photos"] },
    },
    active: true,
    settings: { reminder_hours_before: 48, max_installations_per_day: 3, require_material_check: true, language: "he" },
  },
  {
    agent_type: "terminal_commander",
    agent_name: "Terminal Commander",
    agent_name_he: "מפקד טרמינל",
    model: "claude-opus-4-6",
    system_prompt: `אתה סוכן ניהול מערכת חכם. התפקיד שלך:
- לבצע משימות ניהוליות על פי הוראות
- לפתור בעיות טכניות במערכת
- לעדכן נתונים בבסיס הנתונים
- לנהל משתמשים והרשאות
- לייצר דוחות ולנתח נתונים
- לבצע אוטומציות חוצות-מחלקות
- לאבחן ולתקן תקלות`,
    tools: {
      execute_query: { description: "הרצת שאילתת SQL", params: ["query", "params"] },
      update_record: { description: "עדכון רשומה", params: ["table", "id", "data"] },
      generate_report: { description: "יצירת דוח", params: ["report_type", "date_range", "filters"] },
      send_notification: { description: "שליחת התראה", params: ["channel", "recipient", "message"] },
      manage_user: { description: "ניהול משתמש", params: ["action", "user_id", "data"] },
    },
    active: true,
    settings: { require_confirmation_for_writes: true, max_query_timeout_seconds: 30, allowed_tables: ["*"], audit_all_actions: true, language: "he" },
  },
];

// ===================================================================
// אתחול מערכת הסוכנים
// ===================================================================

/** אתחול טבלאות ונתוני ברירת מחדל של סוכני AI */
export async function initAIAgents(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // טבלת הגדרות סוכנים
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agent_configs (
        id SERIAL PRIMARY KEY,
        agent_type VARCHAR(100) NOT NULL CHECK (agent_type IN ('sales_whatsapp', 'customer_service', 'measurement_coordinator', 'installation_coordinator', 'terminal_commander')),
        agent_name VARCHAR(255) NOT NULL,
        agent_name_he VARCHAR(255) NOT NULL,
        model VARCHAR(100) DEFAULT 'claude-opus-4-6',
        system_prompt TEXT NOT NULL,
        tools JSONB DEFAULT '{}',
        active BOOLEAN DEFAULT true,
        conversation_count INTEGER DEFAULT 0,
        success_rate NUMERIC(5,2),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(agent_type)
      );
    `);

    // טבלת שיחות סוכנים
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agent_conversations (
        id SERIAL PRIMARY KEY,
        agent_type VARCHAR(100) NOT NULL REFERENCES ai_agent_configs(agent_type),
        contact_name VARCHAR(500),
        contact_phone VARCHAR(50),
        contact_email VARCHAR(255),
        channel VARCHAR(50) DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms', 'email', 'telegram', 'web_chat')),
        messages JSONB DEFAULT '[]',
        outcome VARCHAR(255),
        appointment_date TIMESTAMPTZ,
        assigned_salesperson VARCHAR(255),
        summary TEXT,
        sentiment VARCHAR(50),
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'transferred', 'failed')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // אינדקסים לביצועים
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aac_agent_type ON ai_agent_configs(agent_type);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aconv_agent_type ON ai_agent_conversations(agent_type);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aconv_contact_phone ON ai_agent_conversations(contact_phone);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aconv_status ON ai_agent_conversations(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aconv_channel ON ai_agent_conversations(channel);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_aconv_created ON ai_agent_conversations(created_at DESC);`);

    // זריעת סוכנים - רק אם הטבלה ריקה
    const { rows: existing } = await client.query("SELECT COUNT(*) as cnt FROM ai_agent_configs");
    if (parseInt(existing[0].cnt) === 0) {
      for (const agent of DEFAULT_AGENTS) {
        await client.query(
          `INSERT INTO ai_agent_configs (agent_type, agent_name, agent_name_he, model, system_prompt, tools, active, settings)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [agent.agent_type, agent.agent_name, agent.agent_name_he, agent.model, agent.system_prompt, JSON.stringify(agent.tools), agent.active, JSON.stringify(agent.settings)]
        );
      }
      console.log("[ai-agents] זרעו 5 סוכני AI ברירת מחדל");
    }

    await client.query("COMMIT");
    console.log("[ai-agents] אתחול מערכת סוכני AI הושלם בהצלחה");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[ai-agents] שגיאה באתחול:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ===================================================================
// פונקציות ליבה
// ===================================================================

/**
 * עיבוד הודעה נכנסת - ניתוב לסוכן המתאים ויצירת/עדכון שיחה
 * מקבל ערוץ, מספר שולח, תוכן ההודעה ובאופציונלי סוג סוכן ספציפי
 */
export async function processIncomingMessage(
  channel: ChannelType,
  from: string,
  message: string,
  agentTypeOverride?: AgentType
): Promise<{ reply: string; conversationId: number; agentType: AgentType }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // חיפוש שיחה פעילה קיימת לאיש הקשר הזה
    const { rows: existingConvs } = await client.query(
      `SELECT c.*, a.system_prompt, a.tools, a.model, a.settings
       FROM ai_agent_conversations c
       JOIN ai_agent_configs a ON c.agent_type = a.agent_type
       WHERE c.contact_phone = $1 AND c.channel = $2 AND c.status = 'active'
       ORDER BY c.updated_at DESC
       LIMIT 1`,
      [from, channel]
    );

    let conversationId: number;
    let agentType: AgentType;
    let systemPrompt: string;
    let currentMessages: ChatMessage[];

    if (existingConvs.length > 0 && !agentTypeOverride) {
      // שיחה קיימת - המשך
      const conv = existingConvs[0];
      conversationId = conv.id;
      agentType = conv.agent_type;
      systemPrompt = conv.system_prompt;
      currentMessages = Array.isArray(conv.messages) ? conv.messages : [];
    } else {
      // שיחה חדשה - ניתוב אוטומטי או ידני
      agentType = agentTypeOverride || routeToAgent(message, channel);

      // שליפת הגדרות הסוכן
      const { rows: agentRows } = await client.query(
        "SELECT * FROM ai_agent_configs WHERE agent_type = $1 AND active = true",
        [agentType]
      );
      if (agentRows.length === 0) {
        throw new Error(`סוכן מסוג ${agentType} לא נמצא או לא פעיל`);
      }
      systemPrompt = agentRows[0].system_prompt;

      // יצירת שיחה חדשה
      const { rows: newConv } = await client.query(
        `INSERT INTO ai_agent_conversations (agent_type, contact_phone, channel, messages, status)
         VALUES ($1, $2, $3, '[]', 'active')
         RETURNING id`,
        [agentType, from, channel]
      );
      conversationId = newConv[0].id;
      currentMessages = [];

      // עדכון מונה שיחות בסוכן
      await client.query(
        "UPDATE ai_agent_configs SET conversation_count = conversation_count + 1, updated_at = NOW() WHERE agent_type = $1",
        [agentType]
      );
    }

    // הוספת הודעת המשתמש
    const userMessage: ChatMessage = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
      channel,
    };
    currentMessages.push(userMessage);

    // יצירת תשובת הסוכן
    // כאן בעתיד יתחבר ל-API של מודל השפה - כרגע תשובה מבוססת כללים
    const reply = generateAgentReply(agentType, message, currentMessages, systemPrompt);

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
    };
    currentMessages.push(assistantMessage);

    // ניתוח סנטימנט פשוט
    const sentiment = analyzeSentiment(message);

    // עדכון השיחה
    await client.query(
      `UPDATE ai_agent_conversations
       SET messages = $1, sentiment = $2, updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(currentMessages), sentiment, conversationId]
    );

    await client.query("COMMIT");

    return { reply, conversationId, agentType };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[ai-agents] שגיאה בעיבוד הודעה:", err);
    throw err;
  } finally {
    client.release();
  }
}

/** ניתוב אוטומטי של הודעה לסוכן המתאים על בסיס תוכן ההודעה וערוץ */
function routeToAgent(message: string, channel: ChannelType): AgentType {
  const lower = message.toLowerCase();

  // מילות מפתח למכירות
  const salesKeywords = ["מחיר", "הצעה", "עלות", "price", "quote", "הזמנה חדשה", "מעוניין", "רוצה לשמוע", "פגישה"];
  // מילות מפתח לשירות
  const serviceKeywords = ["תלונה", "בעיה", "תקלה", "complaint", "issue", "לא עובד", "שבור", "אחריות", "החזר"];
  // מילות מפתח למדידה
  const measurementKeywords = ["מדידה", "measure", "למדוד", "מהנדס", "תיאום מדידה"];
  // מילות מפתח להתקנה
  const installationKeywords = ["התקנה", "install", "הרכבה", "להתקין", "מתקין", "תיאום התקנה"];

  if (measurementKeywords.some((kw) => lower.includes(kw))) return "measurement_coordinator";
  if (installationKeywords.some((kw) => lower.includes(kw))) return "installation_coordinator";
  if (serviceKeywords.some((kw) => lower.includes(kw))) return "customer_service";
  // ברירת מחדל: מכירות
  return "sales_whatsapp";
}

/** יצירת תשובת סוכן - מבוסס כללים (placeholder ל-LLM בעתיד) */
function generateAgentReply(
  agentType: AgentType,
  message: string,
  history: ChatMessage[],
  _systemPrompt: string
): string {
  const isFirstMessage = history.filter((m) => m.role === "user").length <= 1;

  switch (agentType) {
    case "sales_whatsapp":
      if (isFirstMessage) {
        return "שלום! תודה שפנית אלינו. אני הנציג הדיגיטלי שלנו. אשמח לעזור לך. ספר לי בבקשה - מה אתה מחפש? (חלונות/דלתות/פרגולות/אחר)";
      }
      if (message.includes("פגישה") || message.includes("לפגוש")) {
        return "מצוין! אשמח לתאם לך פגישה עם אחד מנציגי המכירות שלנו. אילו ימים ושעות נוחים לך?";
      }
      return "תודה על המידע! אספר את הפרטים לנציג המכירות שלנו שיחזור אליך בהקדם. האם יש עוד משהו שתרצה לשתף?";

    case "customer_service":
      if (isFirstMessage) {
        return "שלום! אני הנציג הדיגיטלי של מחלקת השירות. אשמח לעזור. מה הבעיה שאתה חווה?";
      }
      if (message.includes("מנהל") || message.includes("אנושי")) {
        return "אני מעביר אותך כעת לנציג אנושי. אנא המתן רגע. מספר הפנייה שלך הוא: CS-" + Date.now().toString().slice(-6);
      }
      return "הבנתי את הבעיה. פתחתי כרטיס טיפול ומישהו מהצוות שלנו יטפל בזה. האם יש עוד משהו שאוכל לעזור בו?";

    case "measurement_coordinator":
      if (isFirstMessage) {
        return "שלום! אני מתאם המדידות. אני כאן כדי לתאם את מועד המדידה בביתך. מתי נוח לך? (אנחנו עובדים ימים א-ה, 08:00-17:00)";
      }
      return "אני בודק את הזמינות של המהנדסים שלנו ואחזור אליך עם אישור מועד. האם יש העדפה לשעה מסוימת?";

    case "installation_coordinator":
      if (isFirstMessage) {
        return "שלום! אני מתאם ההתקנות. אני כאן כדי לתאם מועד התקנה. לפני שנקבע מועד - רק מוודא שכל החומרים מוכנים. רגע אחד...";
      }
      return "אני בודק את זמינות צוות ההתקנה ואחזור אליך. ההתקנה לוקחת בממוצע 4-6 שעות. נוח לך בבוקר או אחה״צ?";

    case "terminal_commander":
      return `קיבלתי את הפקודה: "${message}". מעבד... אנא המתן לתוצאה.`;

    default:
      return "תודה על פנייתך. אני מעבד את הבקשה שלך ואחזור אליך בהקדם.";
  }
}

/** ניתוח סנטימנט בסיסי */
function analyzeSentiment(message: string): string {
  const lower = message.toLowerCase();
  const negativeWords = ["כועס", "מתוסכל", "נורא", "גרוע", "בעיה", "תלונה", "מאוכזב", "angry", "frustrated", "terrible"];
  const positiveWords = ["תודה", "מעולה", "אדיר", "מצוין", "שמח", "thanks", "great", "awesome", "happy"];

  const negCount = negativeWords.filter((w) => lower.includes(w)).length;
  const posCount = positiveWords.filter((w) => lower.includes(w)).length;

  if (negCount > posCount) return "negative";
  if (posCount > negCount) return "positive";
  return "neutral";
}

/** דשבורד סוכני AI - סטטיסטיקות כלליות */
export async function getAgentDashboard(): Promise<Record<string, any>> {
  const client = await pool.connect();
  try {
    // סטטיסטיקות כל סוכן
    const { rows: agents } = await client.query(`
      SELECT
        a.agent_type, a.agent_name, a.agent_name_he, a.active,
        a.conversation_count, a.success_rate, a.model,
        COUNT(c.id) FILTER (WHERE c.status = 'active') as active_conversations,
        COUNT(c.id) FILTER (WHERE c.status = 'completed') as completed_conversations,
        COUNT(c.id) FILTER (WHERE c.status = 'transferred') as transferred_conversations,
        COUNT(c.id) FILTER (WHERE c.status = 'failed') as failed_conversations,
        COUNT(c.id) as total_conversations
      FROM ai_agent_configs a
      LEFT JOIN ai_agent_conversations c ON a.agent_type = c.agent_type
      GROUP BY a.id, a.agent_type, a.agent_name, a.agent_name_he, a.active, a.conversation_count, a.success_rate, a.model
      ORDER BY a.agent_type
    `);

    // סיכום לפי ערוצים
    const { rows: byChannel } = await client.query(`
      SELECT channel, COUNT(*) as count, COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM ai_agent_conversations
      GROUP BY channel
      ORDER BY count DESC
    `);

    // סנטימנט כללי
    const { rows: sentimentBreakdown } = await client.query(`
      SELECT sentiment, COUNT(*) as count
      FROM ai_agent_conversations
      WHERE sentiment IS NOT NULL
      GROUP BY sentiment
    `);

    // שיחות אחרונות
    const { rows: recentConversations } = await client.query(`
      SELECT id, agent_type, contact_name, contact_phone, channel, sentiment, status, created_at
      FROM ai_agent_conversations
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // שיחות היום
    const { rows: todayStats } = await client.query(`
      SELECT
        COUNT(*) as total_today,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_today,
        COUNT(*) FILTER (WHERE status = 'active') as active_today
      FROM ai_agent_conversations
      WHERE created_at >= CURRENT_DATE
    `);

    return {
      agents,
      byChannel,
      sentimentBreakdown,
      recentConversations,
      todayStats: todayStats[0] || {},
      generatedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

/** שליפת היסטוריית שיחות לפי מספר טלפון */
export async function getConversationHistory(
  contactPhone: string
): Promise<AIAgentConversation[]> {
  const { rows } = await pool.query(
    `SELECT c.*, a.agent_name_he
     FROM ai_agent_conversations c
     JOIN ai_agent_configs a ON c.agent_type = a.agent_type
     WHERE c.contact_phone = $1
     ORDER BY c.created_at DESC`,
    [contactPhone]
  );
  return rows as AIAgentConversation[];
}

// ===================================================================
// Express Router - נתיבי API
// ===================================================================

export const aiAgentsRouter = Router();

// --- CRUD הגדרות סוכנים ---

/** שליפת כל הסוכנים */
aiAgentsRouter.get("/agents", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM ai_agent_configs ORDER BY agent_type");
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** שליפת סוכן ספציפי */
aiAgentsRouter.get("/agents/:agentType", async (req: Request, res: Response) => {
  try {
    const { agentType } = req.params;
    const { rows } = await pool.query("SELECT * FROM ai_agent_configs WHERE agent_type = $1", [agentType]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "סוכן לא נמצא" });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** יצירת סוכן חדש */
aiAgentsRouter.post("/agents", async (req: Request, res: Response) => {
  try {
    const { agent_type, agent_name, agent_name_he, model, system_prompt, tools, settings } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO ai_agent_configs (agent_type, agent_name, agent_name_he, model, system_prompt, tools, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [agent_type, agent_name, agent_name_he, model || "claude-opus-4-6", system_prompt, JSON.stringify(tools || {}), JSON.stringify(settings || {})]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** עדכון סוכן */
aiAgentsRouter.put("/agents/:agentType", async (req: Request, res: Response) => {
  try {
    const { agentType } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === "id" || key === "created_at" || key === "agent_type") continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(["tools", "settings"].includes(key) ? JSON.stringify(value) : value);
      idx++;
    }
    setClauses.push(`updated_at = NOW()`);
    values.push(agentType);

    const { rows } = await pool.query(
      `UPDATE ai_agent_configs SET ${setClauses.join(", ")} WHERE agent_type = $${idx} RETURNING *`,
      values
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** מחיקת/כיבוי סוכן */
aiAgentsRouter.delete("/agents/:agentType", async (req: Request, res: Response) => {
  try {
    const { agentType } = req.params;
    await pool.query("UPDATE ai_agent_configs SET active = false, updated_at = NOW() WHERE agent_type = $1", [agentType]);
    res.json({ success: true, message: "סוכן כובה" });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// --- CRUD שיחות ---

/** שליפת שיחות עם סינון */
aiAgentsRouter.get("/conversations", async (req: Request, res: Response) => {
  try {
    const { agent_type, status, channel, limit: queryLimit } = req.query;
    let query = `
      SELECT c.*, a.agent_name_he
      FROM ai_agent_conversations c
      JOIN ai_agent_configs a ON c.agent_type = a.agent_type
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (agent_type) {
      query += ` AND c.agent_type = $${idx}`;
      params.push(agent_type);
      idx++;
    }
    if (status) {
      query += ` AND c.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (channel) {
      query += ` AND c.channel = $${idx}`;
      params.push(channel);
      idx++;
    }

    const limitVal = Math.min(parseInt((queryLimit as string) || "50"), 200);
    query += ` ORDER BY c.updated_at DESC LIMIT ${limitVal}`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** שליפת שיחה ספציפית */
aiAgentsRouter.get("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT c.*, a.agent_name_he
       FROM ai_agent_conversations c
       JOIN ai_agent_configs a ON c.agent_type = a.agent_type
       WHERE c.id = $1`,
      [parseInt(id)]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "שיחה לא נמצאה" });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** עדכון שיחה (למשל סגירה, עדכון תוצאה) */
aiAgentsRouter.put("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === "id" || key === "created_at") continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(key === "messages" ? JSON.stringify(value) : value);
      idx++;
    }
    setClauses.push(`updated_at = NOW()`);
    values.push(parseInt(id));

    const { rows } = await pool.query(
      `UPDATE ai_agent_conversations SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** מחיקת שיחה */
aiAgentsRouter.delete("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM ai_agent_conversations WHERE id = $1", [parseInt(id)]);
    res.json({ success: true, message: "שיחה נמחקה" });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// --- נתיבים מתקדמים ---

/** עיבוד הודעה נכנסת - נקודת כניסה עיקרית */
aiAgentsRouter.post("/process-message", async (req: Request, res: Response) => {
  try {
    const { channel, from, message, agent_type } = req.body;

    if (!channel || !from || !message) {
      return res.status(400).json({ success: false, error: "חסרים שדות חובה: channel, from, message" });
    }

    const result = await processIncomingMessage(
      channel as ChannelType,
      from,
      message,
      agent_type as AgentType | undefined
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** דשבורד סוכני AI */
aiAgentsRouter.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await getAgentDashboard();
    res.json({ success: true, data: dashboard });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** היסטוריית שיחות לפי מספר טלפון */
aiAgentsRouter.get("/conversations/by-phone/:phone", async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const history = await getConversationHistory(phone);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default aiAgentsRouter;
