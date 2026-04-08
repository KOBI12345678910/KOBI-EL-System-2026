// ============================================================
// WhatsApp Business AI Engine - מנוע AI לוואטסאפ עסקי
// אינטגרציית וואטסאפ עסקי עם AI למכירות, שירות לקוחות,
// תיאום מדידות והתקנות
// ============================================================

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// POST /init - יצירת טבלאות ונתוני התחלה
// ============================================================
router.post("/init", async (_req: Request, res: Response) => {
  try {
    // יצירת טבלת שיחות וואטסאפ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id SERIAL PRIMARY KEY,
        conversation_id VARCHAR(100) UNIQUE,
        phone_number VARCHAR(20),
        contact_name VARCHAR(255),
        contact_type VARCHAR(30) DEFAULT 'unknown',
        lead_id INTEGER,
        customer_id INTEGER,
        assigned_agent_id INTEGER,
        assigned_agent_name VARCHAR(255),
        ai_mode VARCHAR(30) DEFAULT 'auto',
        last_message_at TIMESTAMPTZ,
        messages_count INTEGER DEFAULT 0,
        unread_count INTEGER DEFAULT 0,
        sentiment VARCHAR(20) DEFAULT 'neutral',
        tags JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'active',
        source VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת הודעות וואטסאפ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES whatsapp_conversations(id),
        direction VARCHAR(10),
        sender_name VARCHAR(255),
        message_type VARCHAR(20) DEFAULT 'text',
        content TEXT,
        media_url TEXT,
        template_name VARCHAR(100),
        ai_generated BOOLEAN DEFAULT false,
        ai_confidence NUMERIC(3,2),
        ai_intent VARCHAR(50),
        ai_entities JSONB DEFAULT '{}',
        delivered BOOLEAN DEFAULT false,
        read_at TIMESTAMPTZ,
        replied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת תבניות הודעות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id SERIAL PRIMARY KEY,
        template_name VARCHAR(100) UNIQUE,
        template_name_he VARCHAR(255),
        category VARCHAR(30),
        language VARCHAR(10) DEFAULT 'he',
        content TEXT,
        variables JSONB DEFAULT '[]',
        buttons JSONB DEFAULT '[]',
        approved BOOLEAN DEFAULT false,
        usage_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת כללי AI
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_ai_rules (
        id SERIAL PRIMARY KEY,
        rule_name VARCHAR(255),
        rule_name_he VARCHAR(255),
        trigger_type VARCHAR(30),
        trigger_condition JSONB DEFAULT '{}',
        action_type VARCHAR(30),
        action_config JSONB DEFAULT '{}',
        bot_type VARCHAR(30),
        priority INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT true,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת אינדקסים לביצועים מיטביים
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON whatsapp_conversations(phone_number);
      CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON whatsapp_conversations(status);
      CREATE INDEX IF NOT EXISTS idx_wa_conv_ai_mode ON whatsapp_conversations(ai_mode);
      CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned ON whatsapp_conversations(assigned_agent_id);
      CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON whatsapp_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_wa_msg_direction ON whatsapp_messages(direction);
      CREATE INDEX IF NOT EXISTS idx_wa_msg_intent ON whatsapp_messages(ai_intent);
      CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON whatsapp_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_wa_tmpl_category ON whatsapp_templates(category);
      CREATE INDEX IF NOT EXISTS idx_wa_rules_trigger ON whatsapp_ai_rules(trigger_type);
      CREATE INDEX IF NOT EXISTS idx_wa_rules_bot ON whatsapp_ai_rules(bot_type);
    `);

    // זריעת 15 תבניות הודעות בעברית
    const templates = [
      {
        name: "welcome",
        name_he: "ברוכים הבאים",
        category: "sales",
        content: "שלום {{1}}! 👋 ברוכים הבאים לטכנוקולוזי. איך נוכל לעזור לך היום?",
        variables: '["contact_name"]',
        buttons: '[{"type":"reply","title":"הצעת מחיר"},{"type":"reply","title":"שירות לקוחות"}]',
      },
      {
        name: "price_request_response",
        name_he: "תגובה לבקשת מחיר",
        category: "sales",
        content: "שלום {{1}}, תודה על פנייתך! קיבלנו את בקשתך להצעת מחיר עבור {{2}}. נציג שלנו יחזור אליך תוך {{3}} שעות עם הצעה מפורטת.",
        variables: '["contact_name","product_type","hours"]',
        buttons: '[]',
      },
      {
        name: "meeting_confirmation",
        name_he: "אישור פגישה",
        category: "appointment",
        content: "שלום {{1}}, הפגישה שלך אושרה! 📅\nתאריך: {{2}}\nשעה: {{3}}\nכתובת: {{4}}\nנציג: {{5}}\nנשמח לראותך!",
        variables: '["contact_name","date","time","address","agent_name"]',
        buttons: '[{"type":"reply","title":"אישור"},{"type":"reply","title":"שינוי מועד"}]',
      },
      {
        name: "measurement_scheduling",
        name_he: "תיאום מדידה",
        category: "appointment",
        content: "שלום {{1}}, נרצה לתאם מדידה עבור {{2}}. 📏\nהמועדים הזמינים:\n{{3}}\nאנא בחר/י מועד מועדף.",
        variables: '["contact_name","project_type","available_dates"]',
        buttons: '[{"type":"reply","title":"מועד 1"},{"type":"reply","title":"מועד 2"},{"type":"reply","title":"מועד אחר"}]',
      },
      {
        name: "installation_scheduling",
        name_he: "תיאום התקנה",
        category: "appointment",
        content: "שלום {{1}}, שמחים לעדכן שהמוצרים שלך מוכנים להתקנה! 🔧\nפרויקט: {{2}}\nמועד מוצע: {{3}}\nזמן משוער: {{4}} שעות\nצוות: {{5}}",
        variables: '["contact_name","project_name","date","duration","team"]',
        buttons: '[{"type":"reply","title":"מאשר"},{"type":"reply","title":"מועד חלופי"}]',
      },
      {
        name: "payment_reminder",
        name_he: "תזכורת תשלום",
        category: "payment",
        content: "שלום {{1}}, תזכורת ידידותית: 💳\nחשבונית מס׳ {{2}} בסך {{3}} ₪\nתאריך פירעון: {{4}}\nלנוחיותך, ניתן לשלם בקישור: {{5}}",
        variables: '["contact_name","invoice_number","amount","due_date","payment_link"]',
        buttons: '[{"type":"url","title":"לתשלום","url":"{{5}}"}]',
      },
      {
        name: "followup",
        name_he: "מעקב",
        category: "followup",
        content: "שלום {{1}}, רצינו לבדוק איך הולך! 😊\nשלחנו לך הצעת מחיר עבור {{2}} בתאריך {{3}}.\nהאם יש שאלות נוספות? נשמח לעזור.",
        variables: '["contact_name","product","quote_date"]',
        buttons: '[{"type":"reply","title":"מעוניין"},{"type":"reply","title":"לא כרגע"},{"type":"reply","title":"שאלה"}]',
      },
      {
        name: "satisfaction_survey",
        name_he: "סקר שביעות רצון",
        category: "service",
        content: "שלום {{1}}, סיימנו את הפרויקט {{2}}! 🌟\nנשמח לשמוע את דעתך:\nאיך היית מדרג/ת את השירות שלנו מ-1 עד 5?\n1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣",
        variables: '["contact_name","project_name"]',
        buttons: '[{"type":"reply","title":"5 - מצוין"},{"type":"reply","title":"4 - טוב"},{"type":"reply","title":"3 - בסדר"}]',
      },
      {
        name: "quote_sent",
        name_he: "הצעת מחיר נשלחה",
        category: "sales",
        content: "שלום {{1}}, הצעת המחיר שלך מוכנה! 📄\nמס׳ הצעה: {{2}}\nסה״כ: {{3}} ₪\nתוקף: {{4}}\nההצעה צורפה כקובץ PDF. נשמח לענות על כל שאלה.",
        variables: '["contact_name","quote_number","total","valid_until"]',
        buttons: '[{"type":"reply","title":"מאשר הצעה"},{"type":"reply","title":"יש שאלות"}]',
      },
      {
        name: "contract_ready",
        name_he: "חוזה מוכן",
        category: "sales",
        content: "שלום {{1}}, החוזה עבור {{2}} מוכן לחתימה! ✍️\nסכום: {{3}} ₪\nאנא עיין/י בחוזה המצורף ואשר/י.\nצוות טכנוקולוזי",
        variables: '["contact_name","project_name","amount"]',
        buttons: '[{"type":"reply","title":"מאשר וחותם"},{"type":"reply","title":"נדרש שינוי"}]',
      },
      {
        name: "project_update",
        name_he: "עדכון פרויקט",
        category: "notification",
        content: "שלום {{1}}, עדכון לגבי הפרויקט {{2}}: 🏗️\nשלב נוכחי: {{3}}\nאחוז השלמה: {{4}}%\nצפי סיום: {{5}}\nנעדכן אותך בכל שלב.",
        variables: '["contact_name","project_name","current_phase","completion","eta"]',
        buttons: '[]',
      },
      {
        name: "delivery_notice",
        name_he: "הודעת משלוח",
        category: "notification",
        content: "שלום {{1}}, המשלוח שלך בדרך! 🚛\nפרויקט: {{2}}\nזמן הגעה משוער: {{3}}\nנהג: {{4}}, טלפון: {{5}}\nאנא וודא/י שיש גישה למקום.",
        variables: '["contact_name","project_name","eta","driver_name","driver_phone"]',
        buttons: '[{"type":"reply","title":"מאשר קבלה"},{"type":"call","title":"התקשר לנהג","phone":"{{5}}"}]',
      },
      {
        name: "thank_you",
        name_he: "תודה",
        category: "followup",
        content: "שלום {{1}}, תודה רבה על שבחרת בטכנוקולוזי! 🙏\nאנו מעריכים את האמון שלך.\nלכל שאלה או בקשה עתידית - אנחנו כאן בשבילך.\nצוות טכנוקולוזי",
        variables: '["contact_name"]',
        buttons: '[]',
      },
      {
        name: "holiday_greeting",
        name_he: "ברכת חג",
        category: "marketing",
        content: "{{1}} שלום! 🎉\nצוות טכנוקולוזי מאחל לך {{2}}!\n{{3}}\nחג שמח! 🌟",
        variables: '["contact_name","holiday_name","special_offer"]',
        buttons: '[]',
      },
      {
        name: "referral_request",
        name_he: "בקשת המלצה",
        category: "marketing",
        content: "שלום {{1}}, שמחנו לעבוד איתך על {{2}}! 🌟\nאם נהנית מהשירות, נשמח אם תמליץ/י עלינו לחברים ומשפחה.\nכל לקוח שיגיע בהמלצתך - {{3}} הנחה לשניכם! 🎁",
        variables: '["contact_name","project_name","discount_percent"]',
        buttons: '[{"type":"reply","title":"שלחו לי קישור"},{"type":"reply","title":"אשמח להמליץ"}]',
      },
    ];

    for (const t of templates) {
      await pool.query(
        `INSERT INTO whatsapp_templates (template_name, template_name_he, category, content, variables, buttons, approved)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (template_name) DO NOTHING`,
        [t.name, t.name_he, t.category, t.content, t.variables, t.buttons]
      );
    }

    // זריעת 10 כללי AI
    const aiRules = [
      {
        name: "Auto Welcome New Lead",
        name_he: "ברכה אוטומטית לליד חדש",
        trigger_type: "new_lead",
        trigger_condition: '{}',
        action_type: "send_template",
        action_config: '{"template":"welcome"}',
        bot_type: "sales_bot",
        priority: 1,
      },
      {
        name: "Price Request Auto Response",
        name_he: "תגובה אוטומטית לבקשת מחיר",
        trigger_type: "intent",
        trigger_condition: '{"intent":"price_request"}',
        action_type: "ai_respond",
        action_config: '{"response_type":"price_info","include_catalog":true}',
        bot_type: "sales_bot",
        priority: 2,
      },
      {
        name: "Schedule Measurement",
        name_he: "תיאום מדידה אוטומטי",
        trigger_type: "intent",
        trigger_condition: '{"intent":"schedule_meeting","keywords":["מדידה","למדוד","מודד"]}',
        action_type: "schedule_meeting",
        action_config: '{"meeting_type":"measurement","suggest_slots":3}',
        bot_type: "measurement_bot",
        priority: 2,
      },
      {
        name: "Complaint Escalation",
        name_he: "הסלמת תלונות",
        trigger_type: "intent",
        trigger_condition: '{"intent":"complaint","sentiment":"negative"}',
        action_type: "escalate",
        action_config: '{"notify":"manager","priority":"high","create_ticket":true}',
        bot_type: "service_bot",
        priority: 1,
      },
      {
        name: "No Response Follow-up 24h",
        name_he: "מעקב אחרי 24 שעות ללא תגובה",
        trigger_type: "no_response",
        trigger_condition: '{"hours":24}',
        action_type: "send_template",
        action_config: '{"template":"followup"}',
        bot_type: "sales_bot",
        priority: 5,
      },
      {
        name: "Order Status Inquiry",
        name_he: "בירור סטטוס הזמנה",
        trigger_type: "intent",
        trigger_condition: '{"intent":"order_status","keywords":["הזמנה","סטטוס","מתי","איפה"]}',
        action_type: "ai_respond",
        action_config: '{"lookup":"orders","response_type":"status_update"}',
        bot_type: "service_bot",
        priority: 3,
      },
      {
        name: "Payment Inquiry",
        name_he: "בירור תשלום",
        trigger_type: "intent",
        trigger_condition: '{"intent":"payment","keywords":["תשלום","חשבונית","לשלם","מחיר"]}',
        action_type: "ai_respond",
        action_config: '{"lookup":"invoices","response_type":"payment_info"}',
        bot_type: "service_bot",
        priority: 3,
      },
      {
        name: "Urgent Message Alert",
        name_he: "התראה על הודעה דחופה",
        trigger_type: "intent",
        trigger_condition: '{"intent":"urgent","keywords":["דחוף","חירום","מיידי","בהקדם"]}',
        action_type: "notify_manager",
        action_config: '{"channels":["sms","email"],"priority":"critical"}',
        bot_type: "service_bot",
        priority: 1,
      },
      {
        name: "Installation Schedule Request",
        name_he: "בקשת תיאום התקנה",
        trigger_type: "intent",
        trigger_condition: '{"intent":"schedule_meeting","keywords":["התקנה","להתקין","מתקין"]}',
        action_type: "schedule_meeting",
        action_config: '{"meeting_type":"installation","suggest_slots":3,"require_approval":true}',
        bot_type: "installation_bot",
        priority: 2,
      },
      {
        name: "Lead Status Change Notification",
        name_he: "התראה על שינוי סטטוס ליד",
        trigger_type: "status_change",
        trigger_condition: '{"from":"new","to":"qualified"}',
        action_type: "assign_agent",
        action_config: '{"assign_by":"round_robin","notify_agent":true}',
        bot_type: "sales_bot",
        priority: 3,
      },
    ];

    for (const r of aiRules) {
      await pool.query(
        `INSERT INTO whatsapp_ai_rules (rule_name, rule_name_he, trigger_type, trigger_condition, action_type, action_config, bot_type, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [r.name, r.name_he, r.trigger_type, r.trigger_condition, r.action_type, r.action_config, r.bot_type, r.priority]
      );
    }

    res.json({
      success: true,
      message: "טבלאות וואטסאפ AI נוצרו בהצלחה, 15 תבניות ו-10 כללי AI נזרעו",
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת טבלאות וואטסאפ:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /webhook - קבלת הודעות נכנסות מוואטסאפ, זיהוי כוונה אוטומטי
// ============================================================
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const { phone_number, contact_name, message_type, content, media_url, source } = req.body;

    // חיפוש או יצירת שיחה קיימת
    let convResult = await pool.query(
      `SELECT * FROM whatsapp_conversations WHERE phone_number = $1 AND status = 'active' LIMIT 1`,
      [phone_number]
    );

    let conversationId: number;
    if (convResult.rows.length === 0) {
      // יצירת שיחה חדשה
      const newConv = await pool.query(
        `INSERT INTO whatsapp_conversations (conversation_id, phone_number, contact_name, source, last_message_at, messages_count, unread_count)
         VALUES ($1, $2, $3, $4, NOW(), 1, 1)
         RETURNING *`,
        [`wa_${Date.now()}_${phone_number}`, phone_number, contact_name || "לא ידוע", source || "webhook"]
      );
      conversationId = newConv.rows[0].id;
    } else {
      conversationId = convResult.rows[0].id;
      // עדכון שיחה קיימת
      await pool.query(
        `UPDATE whatsapp_conversations
         SET last_message_at = NOW(), messages_count = messages_count + 1, unread_count = unread_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [conversationId]
      );
    }

    // זיהוי כוונה אוטומטי על בסיס מילות מפתח
    let detectedIntent = "general";
    let confidence = 0.5;
    const lowerContent = (content || "").toLowerCase();

    if (/מחיר|עלות|כמה עולה|הצעת מחיר|תמחור/.test(lowerContent)) {
      detectedIntent = "price_request";
      confidence = 0.85;
    } else if (/תלונה|בעיה|תקלה|לא תקין|שבור|נזק/.test(lowerContent)) {
      detectedIntent = "complaint";
      confidence = 0.8;
    } else if (/פגישה|לתאם|מדידה|התקנה|מועד/.test(lowerContent)) {
      detectedIntent = "schedule_meeting";
      confidence = 0.82;
    } else if (/הזמנה|סטטוס|מתי מגיע|איפה ההזמנה/.test(lowerContent)) {
      detectedIntent = "order_status";
      confidence = 0.78;
    } else if (/תשלום|חשבונית|לשלם|העברה בנקאית/.test(lowerContent)) {
      detectedIntent = "payment";
      confidence = 0.8;
    } else if (/דחוף|חירום|מיידי|בהקדם/.test(lowerContent)) {
      detectedIntent = "urgent";
      confidence = 0.9;
    }

    // שמירת ההודעה
    const msgResult = await pool.query(
      `INSERT INTO whatsapp_messages (conversation_id, direction, sender_name, message_type, content, media_url, ai_intent, ai_confidence, ai_entities)
       VALUES ($1, 'inbound', $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [conversationId, contact_name || "לא ידוע", message_type || "text", content, media_url, detectedIntent, confidence, "{}"]
    );

    // עדכון סנטימנט השיחה
    let sentiment = "neutral";
    if (/תודה|מעולה|אדיר|שמח|מרוצה/.test(lowerContent)) sentiment = "positive";
    if (/תלונה|בעיה|מאוכזב|גרוע|נורא/.test(lowerContent)) sentiment = "negative";

    await pool.query(
      `UPDATE whatsapp_conversations SET sentiment = $1, updated_at = NOW() WHERE id = $2`,
      [sentiment, conversationId]
    );

    // הפעלת כללי AI מתאימים
    const matchingRules = await pool.query(
      `SELECT * FROM whatsapp_ai_rules
       WHERE is_active = true
       AND (trigger_type = 'intent' AND trigger_condition->>'intent' = $1)
       OR (trigger_type = 'new_lead' AND $2 = true)
       ORDER BY priority ASC`,
      [detectedIntent, convResult.rows.length === 0]
    );

    const triggeredActions: any[] = [];
    for (const rule of matchingRules.rows) {
      triggeredActions.push({
        rule_id: rule.id,
        rule_name: rule.rule_name_he,
        action_type: rule.action_type,
        action_config: rule.action_config,
      });
      // עדכון מונה הצלחות
      await pool.query(
        `UPDATE whatsapp_ai_rules SET success_count = success_count + 1 WHERE id = $1`,
        [rule.id]
      );
    }

    res.json({
      success: true,
      message: "הודעה נקלטה בהצלחה",
      data: {
        conversation_id: conversationId,
        message: msgResult.rows[0],
        detected_intent: detectedIntent,
        confidence,
        sentiment,
        triggered_rules: triggeredActions,
        is_new_conversation: convResult.rows.length === 0,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בקליטת הודעת וואטסאפ:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /send - שליחת הודעה למספר טלפון
// ============================================================
router.post("/send", async (req: Request, res: Response) => {
  try {
    const { conversation_id, phone_number, content, message_type, sender_name, ai_generated } = req.body;

    let convId = conversation_id;

    // אם לא סופק מזהה שיחה, חיפוש לפי מספר טלפון
    if (!convId && phone_number) {
      const conv = await pool.query(
        `SELECT id FROM whatsapp_conversations WHERE phone_number = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [phone_number]
      );
      if (conv.rows.length > 0) {
        convId = conv.rows[0].id;
      } else {
        // יצירת שיחה חדשה
        const newConv = await pool.query(
          `INSERT INTO whatsapp_conversations (conversation_id, phone_number, contact_name, source, last_message_at, messages_count)
           VALUES ($1, $2, 'לא ידוע', 'outbound', NOW(), 1)
           RETURNING id`,
          [`wa_out_${Date.now()}_${phone_number}`, phone_number]
        );
        convId = newConv.rows[0].id;
      }
    }

    // שמירת ההודעה היוצאת
    const msgResult = await pool.query(
      `INSERT INTO whatsapp_messages (conversation_id, direction, sender_name, message_type, content, ai_generated, delivered)
       VALUES ($1, 'outbound', $2, $3, $4, $5, true)
       RETURNING *`,
      [convId, sender_name || "מערכת", message_type || "text", content, ai_generated || false]
    );

    // עדכון שיחה
    await pool.query(
      `UPDATE whatsapp_conversations SET last_message_at = NOW(), messages_count = messages_count + 1, updated_at = NOW() WHERE id = $1`,
      [convId]
    );

    res.json({
      success: true,
      message: "ההודעה נשלחה בהצלחה",
      data: msgResult.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בשליחת הודעה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /send-template - שליחת הודעת תבנית עם משתנים
// ============================================================
router.post("/send-template", async (req: Request, res: Response) => {
  try {
    const { conversation_id, phone_number, template_name, variables, sender_name } = req.body;

    // שליפת התבנית
    const tmplResult = await pool.query(
      `SELECT * FROM whatsapp_templates WHERE template_name = $1 AND status = 'active'`,
      [template_name]
    );

    if (tmplResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה" });
    }

    const template = tmplResult.rows[0];

    // החלפת משתנים בתוכן
    let finalContent = template.content;
    if (variables && Array.isArray(variables)) {
      variables.forEach((val: string, idx: number) => {
        finalContent = finalContent.replace(`{{${idx + 1}}}`, val);
      });
    }

    // חיפוש או יצירת שיחה
    let convId = conversation_id;
    if (!convId && phone_number) {
      const conv = await pool.query(
        `SELECT id FROM whatsapp_conversations WHERE phone_number = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [phone_number]
      );
      if (conv.rows.length > 0) {
        convId = conv.rows[0].id;
      }
    }

    // שמירת ההודעה
    const msgResult = await pool.query(
      `INSERT INTO whatsapp_messages (conversation_id, direction, sender_name, message_type, content, template_name, ai_generated, delivered)
       VALUES ($1, 'outbound', $2, 'template', $3, $4, false, true)
       RETURNING *`,
      [convId, sender_name || "מערכת", finalContent, template_name]
    );

    // עדכון מונה שימוש בתבנית
    await pool.query(
      `UPDATE whatsapp_templates SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
      [template.id]
    );

    // עדכון שיחה
    if (convId) {
      await pool.query(
        `UPDATE whatsapp_conversations SET last_message_at = NOW(), messages_count = messages_count + 1, updated_at = NOW() WHERE id = $1`,
        [convId]
      );
    }

    res.json({
      success: true,
      message: "הודעת תבנית נשלחה בהצלחה",
      data: {
        message: msgResult.rows[0],
        template_used: template.template_name_he,
        final_content: finalContent,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליחת תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /conversations - רשימת כל השיחות עם סינון
// ============================================================
router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const { status, ai_mode, assigned_agent_id, sentiment, search, contact_type, source, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `SELECT * FROM whatsapp_conversations WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      query += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (ai_mode) {
      query += ` AND ai_mode = $${paramIdx++}`;
      params.push(ai_mode);
    }
    if (assigned_agent_id) {
      query += ` AND assigned_agent_id = $${paramIdx++}`;
      params.push(assigned_agent_id);
    }
    if (sentiment) {
      query += ` AND sentiment = $${paramIdx++}`;
      params.push(sentiment);
    }
    if (contact_type) {
      query += ` AND contact_type = $${paramIdx++}`;
      params.push(contact_type);
    }
    if (source) {
      query += ` AND source = $${paramIdx++}`;
      params.push(source);
    }
    if (search) {
      query += ` AND (contact_name ILIKE $${paramIdx} OR phone_number ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    // ספירה כוללת
    const countResult = await pool.query(
      query.replace("SELECT *", "SELECT COUNT(*)"),
      params
    );

    query += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת שיחות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /conversations/:id - שיחה מלאה עם הודעות
// ============================================================
router.get("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const convResult = await pool.query(
      `SELECT * FROM whatsapp_conversations WHERE id = $1`,
      [id]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "שיחה לא נמצאה" });
    }

    // שליפת כל ההודעות בשיחה
    const messagesResult = await pool.query(
      `SELECT * FROM whatsapp_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    // איפוס הודעות שלא נקראו
    await pool.query(
      `UPDATE whatsapp_conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        conversation: convResult.rows[0],
        messages: messagesResult.rows,
        total_messages: messagesResult.rows.length,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת שיחה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /conversations/:id/assign - הקצאת שיחה לנציג
// ============================================================
router.post("/conversations/:id/assign", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agent_id, agent_name } = req.body;

    const result = await pool.query(
      `UPDATE whatsapp_conversations
       SET assigned_agent_id = $1, assigned_agent_name = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [agent_id, agent_name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "שיחה לא נמצאה" });
    }

    res.json({
      success: true,
      message: `השיחה הוקצתה לנציג ${agent_name}`,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בהקצאת שיחה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /conversations/:id/set-mode - שינוי מצב AI
// ============================================================
router.post("/conversations/:id/set-mode", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ai_mode } = req.body;

    const validModes = ["auto", "assisted", "manual", "sales_bot", "service_bot", "measurement_bot", "installation_bot"];
    if (!validModes.includes(ai_mode)) {
      return res.status(400).json({ success: false, error: `מצב AI לא תקין. מצבים אפשריים: ${validModes.join(", ")}` });
    }

    const result = await pool.query(
      `UPDATE whatsapp_conversations SET ai_mode = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [ai_mode, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "שיחה לא נמצאה" });
    }

    res.json({
      success: true,
      message: `מצב AI שונה ל-${ai_mode}`,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בשינוי מצב AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /ai-suggestions/:conversationId - AI מציע תגובה על בסיס היסטוריית שיחה
// ============================================================
router.get("/ai-suggestions/:conversationId", async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    // שליפת השיחה
    const convResult = await pool.query(
      `SELECT * FROM whatsapp_conversations WHERE id = $1`,
      [conversationId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "שיחה לא נמצאה" });
    }

    // שליפת ההודעות האחרונות
    const messagesResult = await pool.query(
      `SELECT * FROM whatsapp_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [conversationId]
    );

    const lastMessage = messagesResult.rows[0];
    const conversation = convResult.rows[0];
    const intent = lastMessage?.ai_intent || "general";

    // הצעות תגובה על בסיס כוונה
    const suggestions: any[] = [];

    switch (intent) {
      case "price_request":
        suggestions.push(
          { text: `שלום ${conversation.contact_name}, אשמח לספק לך הצעת מחיר. האם תוכל/י לפרט איזה מוצר מעניין אותך?`, confidence: 0.9 },
          { text: `תודה על הפנייה! אעביר את הבקשה למחלקת מכירות ונחזור אליך תוך שעות ספורות עם הצעה מפורטת.`, confidence: 0.85 },
          { text: `נשמח לסייע! לצורך הצעת מחיר מדויקת, נצטרך לתאם מדידה. האם יש לך מועד מועדף?`, confidence: 0.8 }
        );
        break;
      case "complaint":
        suggestions.push(
          { text: `שלום ${conversation.contact_name}, מצטערים לשמוע על הבעיה. אנחנו כאן כדי לפתור את זה. האם תוכל/י לתאר מה קרה?`, confidence: 0.9 },
          { text: `אנו מתנצלים על אי הנוחות. פתחתי עבורך פנייה ואחד הטכנאים שלנו ייצור איתך קשר בהקדם.`, confidence: 0.85 },
          { text: `מבין/ה את התסכול. בוא/י נפתור את זה ביחד. אעביר את הפנייה שלך לצוות השירות בעדיפות גבוהה.`, confidence: 0.8 }
        );
        break;
      case "schedule_meeting":
        suggestions.push(
          { text: `בוודאי! מתי נוח לך? יש לנו מועדים פנויים בימים הקרובים.`, confidence: 0.9 },
          { text: `נשמח לתאם! איזה סוג פגישה - מדידה או ייעוץ? ובאיזה אזור?`, confidence: 0.85 }
        );
        break;
      case "order_status":
        suggestions.push(
          { text: `שלום ${conversation.contact_name}, אבדוק עבורך את סטטוס ההזמנה. האם יש לך מספר הזמנה?`, confidence: 0.9 },
          { text: `אני בודק/ת את המערכת כרגע. רגע אחד ואעדכן אותך.`, confidence: 0.85 }
        );
        break;
      case "payment":
        suggestions.push(
          { text: `שלום ${conversation.contact_name}, אשמח לעזור בנושא התשלום. האם יש לך מספר חשבונית?`, confidence: 0.9 },
          { text: `ניתן לשלם בהעברה בנקאית, כרטיס אשראי או צ'קים. איזה אופן תשלום מעדיף/ה?`, confidence: 0.85 }
        );
        break;
      case "urgent":
        suggestions.push(
          { text: `שלום ${conversation.contact_name}, קיבלנו את הפנייה הדחופה שלך. מטפלים בזה מיד!`, confidence: 0.95 },
          { text: `אנו מטפלים בבקשתך בעדיפות עליונה. נציג בכיר ייצור איתך קשר בדקות הקרובות.`, confidence: 0.9 }
        );
        break;
      default:
        suggestions.push(
          { text: `שלום ${conversation.contact_name}, תודה על הפנייה! איך אוכל לעזור?`, confidence: 0.7 },
          { text: `שלום! קיבלנו את הודעתך. נציג שלנו יחזור אליך בהקדם.`, confidence: 0.65 }
        );
    }

    // חיפוש תבניות רלוונטיות
    const relevantTemplates = await pool.query(
      `SELECT * FROM whatsapp_templates WHERE status = 'active' AND approved = true ORDER BY usage_count DESC LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        conversation_id: conversationId,
        last_intent: intent,
        sentiment: conversation.sentiment,
        suggestions,
        relevant_templates: relevantTemplates.rows,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בהצעת AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /ai-auto-respond/:conversationId - AI מגיב אוטומטית
// ============================================================
router.post("/ai-auto-respond/:conversationId", async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    // בדיקה שהשיחה במצב אוטומטי
    const convResult = await pool.query(
      `SELECT * FROM whatsapp_conversations WHERE id = $1`,
      [conversationId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "שיחה לא נמצאה" });
    }

    const conversation = convResult.rows[0];
    if (conversation.ai_mode === "manual") {
      return res.status(400).json({ success: false, error: "השיחה במצב ידני - AI לא יכול להגיב" });
    }

    // שליפת ההודעה האחרונה
    const lastMsgResult = await pool.query(
      `SELECT * FROM whatsapp_messages WHERE conversation_id = $1 AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    );

    if (lastMsgResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: "אין הודעות נכנסות בשיחה" });
    }

    const lastMsg = lastMsgResult.rows[0];
    const intent = lastMsg.ai_intent || "general";

    // יצירת תגובה AI מבוססת כוונה
    let aiResponse = "";
    let confidence = 0.7;

    switch (intent) {
      case "price_request":
        aiResponse = `שלום ${conversation.contact_name}, תודה על פנייתך! נשמח לספק לך הצעת מחיר. נציג שלנו ייצור איתך קשר בהקדם עם פרטים מלאים.`;
        confidence = 0.88;
        break;
      case "complaint":
        aiResponse = `שלום ${conversation.contact_name}, מצטערים לשמוע. פתחנו עבורך פנייה דחופה ומנהל שירות ייצור איתך קשר בהקדם.`;
        confidence = 0.85;
        break;
      case "schedule_meeting":
        aiResponse = `שלום ${conversation.contact_name}, נשמח לתאם! אנא שלח/י לנו את הכתובת ונחזור אליך עם מועדים זמינים.`;
        confidence = 0.82;
        break;
      case "order_status":
        aiResponse = `שלום ${conversation.contact_name}, אנחנו בודקים את סטטוס ההזמנה שלך. נעדכן אותך בהקדם.`;
        confidence = 0.8;
        break;
      case "payment":
        aiResponse = `שלום ${conversation.contact_name}, לגבי נושא התשלום - נציג מחלקת הכספים ייצור איתך קשר. ניתן גם לשלם דרך הקישור שנשלח אליך.`;
        confidence = 0.8;
        break;
      case "urgent":
        aiResponse = `שלום ${conversation.contact_name}, קיבלנו את הפנייה הדחופה. צוות שלנו מטפל בזה ברגע זה. נציג בכיר ייצור איתך קשר בדקות הקרובות.`;
        confidence = 0.92;
        break;
      default:
        aiResponse = `שלום ${conversation.contact_name}, תודה על ההודעה! קיבלנו את פנייתך ונציג ייצור איתך קשר בהקדם.`;
        confidence = 0.65;
    }

    // שמירת תגובת AI
    const msgResult = await pool.query(
      `INSERT INTO whatsapp_messages (conversation_id, direction, sender_name, message_type, content, ai_generated, ai_confidence, ai_intent, delivered)
       VALUES ($1, 'outbound', 'AI Bot', 'text', $2, true, $3, $4, true)
       RETURNING *`,
      [conversationId, aiResponse, confidence, intent]
    );

    // עדכון שיחה
    await pool.query(
      `UPDATE whatsapp_conversations SET last_message_at = NOW(), messages_count = messages_count + 1, updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    res.json({
      success: true,
      message: "AI הגיב בהצלחה",
      data: {
        response: msgResult.rows[0],
        intent,
        confidence,
        mode: conversation.ai_mode,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בתגובת AI אוטומטית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /analytics - סטטיסטיקות הודעות
// ============================================================
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = req.query;
    let dateFilter = "";
    const params: any[] = [];

    if (from_date && to_date) {
      dateFilter = `AND created_at BETWEEN $1 AND $2`;
      params.push(from_date, to_date);
    }

    // סה"כ הודעות נשלחו/התקבלו
    const totalMessages = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound') as total_sent,
        COUNT(*) FILTER (WHERE direction = 'inbound') as total_received,
        COUNT(*) FILTER (WHERE ai_generated = true) as ai_generated,
        COUNT(*) FILTER (WHERE ai_generated = false OR ai_generated IS NULL) as human_sent,
        COUNT(*) as total
       FROM whatsapp_messages WHERE 1=1 ${dateFilter}`,
      params
    );

    // זמני תגובה ממוצעים
    const responseTimes = await pool.query(
      `SELECT
        AVG(EXTRACT(EPOCH FROM (m2.created_at - m1.created_at))) / 60 as avg_response_minutes
       FROM whatsapp_messages m1
       JOIN whatsapp_messages m2 ON m1.conversation_id = m2.conversation_id
       WHERE m1.direction = 'inbound' AND m2.direction = 'outbound'
       AND m2.created_at > m1.created_at
       AND m2.id = (
         SELECT MIN(id) FROM whatsapp_messages
         WHERE conversation_id = m1.conversation_id
         AND direction = 'outbound'
         AND created_at > m1.created_at
       )`
    );

    // התפלגות כוונות
    const intentDistribution = await pool.query(
      `SELECT ai_intent, COUNT(*) as count
       FROM whatsapp_messages
       WHERE direction = 'inbound' AND ai_intent IS NOT NULL ${dateFilter}
       GROUP BY ai_intent ORDER BY count DESC`
    );

    // שביעות רצון (סנטימנט)
    const satisfactionStats = await pool.query(
      `SELECT sentiment, COUNT(*) as count
       FROM whatsapp_conversations
       WHERE status = 'active'
       GROUP BY sentiment`
    );

    res.json({
      success: true,
      data: {
        messages: totalMessages.rows[0],
        avg_response_time_minutes: parseFloat(responseTimes.rows[0]?.avg_response_minutes || "0").toFixed(1),
        intent_distribution: intentDistribution.rows,
        sentiment_distribution: satisfactionStats.rows,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת אנליטיקות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /templates - רשימת כל התבניות
// ============================================================
router.get("/templates", async (req: Request, res: Response) => {
  try {
    const { category, status, approved, search } = req.query;
    let query = `SELECT * FROM whatsapp_templates WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (category) {
      query += ` AND category = $${paramIdx++}`;
      params.push(category);
    }
    if (status) {
      query += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (approved !== undefined) {
      query += ` AND approved = $${paramIdx++}`;
      params.push(approved === "true");
    }
    if (search) {
      query += ` AND (template_name ILIKE $${paramIdx} OR template_name_he ILIKE $${paramIdx} OR content ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    query += ` ORDER BY usage_count DESC, created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת תבניות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /templates - יצירת תבנית חדשה
// ============================================================
router.post("/templates", async (req: Request, res: Response) => {
  try {
    const { template_name, template_name_he, category, language, content, variables, buttons } = req.body;

    const result = await pool.query(
      `INSERT INTO whatsapp_templates (template_name, template_name_he, category, language, content, variables, buttons)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [template_name, template_name_he, category, language || "he", content, JSON.stringify(variables || []), JSON.stringify(buttons || [])]
    );

    res.json({
      success: true,
      message: "תבנית נוצרה בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PUT /templates/:id - עדכון תבנית
// ============================================================
router.put("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { template_name_he, category, language, content, variables, buttons, approved, status } = req.body;

    const result = await pool.query(
      `UPDATE whatsapp_templates
       SET template_name_he = COALESCE($1, template_name_he),
           category = COALESCE($2, category),
           language = COALESCE($3, language),
           content = COALESCE($4, content),
           variables = COALESCE($5, variables),
           buttons = COALESCE($6, buttons),
           approved = COALESCE($7, approved),
           status = COALESCE($8, status),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [template_name_he, category, language, content, variables ? JSON.stringify(variables) : null, buttons ? JSON.stringify(buttons) : null, approved, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה" });
    }

    res.json({
      success: true,
      message: "תבנית עודכנה בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בעדכון תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /templates/:id - שליפת תבנית בודדת
// ============================================================
router.get("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM whatsapp_templates WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /ai-rules - רשימת כללי AI
// ============================================================
router.get("/ai-rules", async (req: Request, res: Response) => {
  try {
    const { trigger_type, bot_type, is_active } = req.query;
    let query = `SELECT * FROM whatsapp_ai_rules WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (trigger_type) {
      query += ` AND trigger_type = $${paramIdx++}`;
      params.push(trigger_type);
    }
    if (bot_type) {
      query += ` AND bot_type = $${paramIdx++}`;
      params.push(bot_type);
    }
    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIdx++}`;
      params.push(is_active === "true");
    }

    query += ` ORDER BY priority ASC, created_at DESC`;
    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    console.error("שגיאה בשליפת כללי AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /ai-rules - יצירת כלל AI חדש
// ============================================================
router.post("/ai-rules", async (req: Request, res: Response) => {
  try {
    const { rule_name, rule_name_he, trigger_type, trigger_condition, action_type, action_config, bot_type, priority, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO whatsapp_ai_rules (rule_name, rule_name_he, trigger_type, trigger_condition, action_type, action_config, bot_type, priority, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [rule_name, rule_name_he, trigger_type, JSON.stringify(trigger_condition || {}), action_type, JSON.stringify(action_config || {}), bot_type, priority || 5, notes]
    );

    res.json({ success: true, message: "כלל AI נוצר בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה ביצירת כלל AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PUT /ai-rules/:id - עדכון כלל AI
// ============================================================
router.put("/ai-rules/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rule_name, rule_name_he, trigger_type, trigger_condition, action_type, action_config, bot_type, priority, is_active, notes } = req.body;

    const result = await pool.query(
      `UPDATE whatsapp_ai_rules
       SET rule_name = COALESCE($1, rule_name),
           rule_name_he = COALESCE($2, rule_name_he),
           trigger_type = COALESCE($3, trigger_type),
           trigger_condition = COALESCE($4, trigger_condition),
           action_type = COALESCE($5, action_type),
           action_config = COALESCE($6, action_config),
           bot_type = COALESCE($7, bot_type),
           priority = COALESCE($8, priority),
           is_active = COALESCE($9, is_active),
           notes = COALESCE($10, notes)
       WHERE id = $11
       RETURNING *`,
      [rule_name, rule_name_he, trigger_type, trigger_condition ? JSON.stringify(trigger_condition) : null, action_type, action_config ? JSON.stringify(action_config) : null, bot_type, priority, is_active, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כלל AI לא נמצא" });
    }

    res.json({ success: true, message: "כלל AI עודכן בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בעדכון כלל AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /ai-rules/:id - שליפת כלל AI בודד
// ============================================================
router.get("/ai-rules/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM whatsapp_ai_rules WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כלל AI לא נמצא" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת כלל AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /unread - כל השיחות שלא נקראו
// ============================================================
router.get("/unread", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM whatsapp_conversations
       WHERE unread_count > 0 AND status = 'active'
       ORDER BY last_message_at DESC`
    );

    res.json({
      success: true,
      data: result.rows,
      total_unread_conversations: result.rows.length,
      total_unread_messages: result.rows.reduce((sum: number, r: any) => sum + (r.unread_count || 0), 0),
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת הודעות שלא נקראו:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /dashboard - לוח בקרה ראשי
// ============================================================
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // שיחות היום
    const todayConversations = await pool.query(
      `SELECT
        COUNT(*) as total_today,
        COUNT(*) FILTER (WHERE ai_mode IN ('auto','sales_bot','service_bot','measurement_bot','installation_bot')) as ai_handled,
        COUNT(*) FILTER (WHERE ai_mode IN ('manual','assisted')) as human_handled
       FROM whatsapp_conversations
       WHERE DATE(created_at) = CURRENT_DATE`
    );

    // זמן תגובה ממוצע היום
    const avgResponseTime = await pool.query(
      `SELECT
        AVG(EXTRACT(EPOCH FROM (m2.created_at - m1.created_at))) / 60 as avg_minutes
       FROM whatsapp_messages m1
       JOIN whatsapp_messages m2 ON m1.conversation_id = m2.conversation_id
       WHERE m1.direction = 'inbound' AND m2.direction = 'outbound'
       AND DATE(m1.created_at) = CURRENT_DATE
       AND m2.created_at > m1.created_at
       AND m2.id = (
         SELECT MIN(id) FROM whatsapp_messages
         WHERE conversation_id = m1.conversation_id
         AND direction = 'outbound'
         AND created_at > m1.created_at
       )`
    );

    // כוונות מובילות היום
    const topIntents = await pool.query(
      `SELECT ai_intent, COUNT(*) as count
       FROM whatsapp_messages
       WHERE direction = 'inbound' AND ai_intent IS NOT NULL AND DATE(created_at) = CURRENT_DATE
       GROUP BY ai_intent ORDER BY count DESC LIMIT 5`
    );

    // התפלגות סנטימנט
    const sentimentDist = await pool.query(
      `SELECT sentiment, COUNT(*) as count
       FROM whatsapp_conversations
       WHERE status = 'active'
       GROUP BY sentiment`
    );

    // הודעות שלא נקראו
    const unreadCount = await pool.query(
      `SELECT COALESCE(SUM(unread_count), 0) as total_unread FROM whatsapp_conversations WHERE status = 'active'`
    );

    res.json({
      success: true,
      data: {
        today: todayConversations.rows[0],
        avg_response_time_minutes: parseFloat(avgResponseTime.rows[0]?.avg_minutes || "0").toFixed(1),
        top_intents: topIntents.rows,
        sentiment_distribution: sentimentDist.rows,
        total_unread: parseInt(unreadCount.rows[0]?.total_unread || "0"),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בלוח הבקרה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /bulk-send - שליחת תבנית למספר אנשי קשר
// ============================================================
router.post("/bulk-send", async (req: Request, res: Response) => {
  try {
    const { template_name, contacts, variables_map } = req.body;

    // שליפת התבנית
    const tmplResult = await pool.query(
      `SELECT * FROM whatsapp_templates WHERE template_name = $1 AND status = 'active' AND approved = true`,
      [template_name]
    );

    if (tmplResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה או לא מאושרת" });
    }

    const template = tmplResult.rows[0];
    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      try {
        // החלפת משתנים ספציפיים לאיש קשר
        let finalContent = template.content;
        const vars = variables_map?.[contact.phone_number] || contact.variables || [];
        if (Array.isArray(vars)) {
          vars.forEach((val: string, idx: number) => {
            finalContent = finalContent.replace(`{{${idx + 1}}}`, val);
          });
        }

        // חיפוש או יצירת שיחה
        let convResult = await pool.query(
          `SELECT id FROM whatsapp_conversations WHERE phone_number = $1 AND status = 'active' LIMIT 1`,
          [contact.phone_number]
        );

        let convId: number;
        if (convResult.rows.length === 0) {
          const newConv = await pool.query(
            `INSERT INTO whatsapp_conversations (conversation_id, phone_number, contact_name, source, last_message_at, messages_count)
             VALUES ($1, $2, $3, 'bulk_send', NOW(), 1)
             RETURNING id`,
            [`wa_bulk_${Date.now()}_${contact.phone_number}`, contact.phone_number, contact.name || "לא ידוע"]
          );
          convId = newConv.rows[0].id;
        } else {
          convId = convResult.rows[0].id;
          await pool.query(
            `UPDATE whatsapp_conversations SET last_message_at = NOW(), messages_count = messages_count + 1, updated_at = NOW() WHERE id = $1`,
            [convId]
          );
        }

        // שמירת הודעה
        await pool.query(
          `INSERT INTO whatsapp_messages (conversation_id, direction, sender_name, message_type, content, template_name, delivered)
           VALUES ($1, 'outbound', 'מערכת - שליחה המונית', 'template', $2, $3, true)`,
          [convId, finalContent, template_name]
        );

        successCount++;
        results.push({ phone: contact.phone_number, status: "sent" });
      } catch (err: any) {
        failCount++;
        results.push({ phone: contact.phone_number, status: "failed", error: err.message });
      }
    }

    // עדכון מונה שימוש בתבנית
    await pool.query(
      `UPDATE whatsapp_templates SET usage_count = usage_count + $1, updated_at = NOW() WHERE id = $2`,
      [successCount, template.id]
    );

    res.json({
      success: true,
      message: `שליחה המונית הושלמה: ${successCount} נשלחו, ${failCount} נכשלו`,
      data: {
        total_contacts: contacts.length,
        success_count: successCount,
        fail_count: failCount,
        details: results,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליחה המונית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /agent-performance - ביצועי נציגים
// ============================================================
router.get("/agent-performance", async (req: Request, res: Response) => {
  try {
    // הודעות לכל נציג
    const agentMessages = await pool.query(
      `SELECT
        c.assigned_agent_id,
        c.assigned_agent_name,
        COUNT(DISTINCT c.id) as total_conversations,
        COALESCE(SUM(c.messages_count), 0) as total_messages,
        COUNT(*) FILTER (WHERE c.sentiment = 'positive') as positive_conversations,
        COUNT(*) FILTER (WHERE c.sentiment = 'negative') as negative_conversations,
        COUNT(*) FILTER (WHERE c.sentiment = 'neutral') as neutral_conversations
       FROM whatsapp_conversations c
       WHERE c.assigned_agent_id IS NOT NULL
       GROUP BY c.assigned_agent_id, c.assigned_agent_name
       ORDER BY total_conversations DESC`
    );

    // זמן תגובה ממוצע לכל נציג
    const agentResponseTimes = await pool.query(
      `SELECT
        c.assigned_agent_id,
        c.assigned_agent_name,
        AVG(EXTRACT(EPOCH FROM (m2.created_at - m1.created_at))) / 60 as avg_response_minutes
       FROM whatsapp_messages m1
       JOIN whatsapp_messages m2 ON m1.conversation_id = m2.conversation_id
       JOIN whatsapp_conversations c ON m1.conversation_id = c.id
       WHERE m1.direction = 'inbound' AND m2.direction = 'outbound'
       AND c.assigned_agent_id IS NOT NULL
       AND m2.created_at > m1.created_at
       AND m2.id = (
         SELECT MIN(id) FROM whatsapp_messages
         WHERE conversation_id = m1.conversation_id
         AND direction = 'outbound'
         AND created_at > m1.created_at
       )
       GROUP BY c.assigned_agent_id, c.assigned_agent_name`
    );

    // מיזוג הנתונים
    const performanceMap: Record<number, any> = {};
    for (const row of agentMessages.rows) {
      performanceMap[row.assigned_agent_id] = {
        ...row,
        avg_response_minutes: "N/A",
        satisfaction_score: row.total_conversations > 0
          ? ((row.positive_conversations / row.total_conversations) * 100).toFixed(1) + "%"
          : "N/A",
      };
    }
    for (const row of agentResponseTimes.rows) {
      if (performanceMap[row.assigned_agent_id]) {
        performanceMap[row.assigned_agent_id].avg_response_minutes = parseFloat(row.avg_response_minutes || "0").toFixed(1);
      }
    }

    res.json({
      success: true,
      data: Object.values(performanceMap),
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת ביצועי נציגים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ייצוא ברירת מחדל של הראוטר
export default router;
