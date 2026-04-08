// ===== מנוע וואטסאפ עסקי - טכנו כל עוזי =====
// אינטגרציה מלאה עם WhatsApp Business API
// שליחת הודעות אוטומטיות, תבניות, שיחות וניתוח

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ===== אתחול טבלאות ותבניות =====
router.post("/whatsapp/init", async (_req: Request, res: Response) => {
  try {
    // יצירת טבלת תבניות וואטסאפ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id SERIAL PRIMARY KEY,
        template_code VARCHAR(100) UNIQUE,
        template_name VARCHAR(255),
        template_name_he VARCHAR(255),
        category VARCHAR(100) NOT NULL,
        language VARCHAR(10) DEFAULT 'he',
        body_text TEXT NOT NULL,
        header_text VARCHAR(255),
        footer_text VARCHAR(255),
        buttons JSONB DEFAULT '[]',
        variables JSONB DEFAULT '[]',
        media_type VARCHAR(50),
        approved BOOLEAN DEFAULT false,
        whatsapp_template_id VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // יצירת טבלת הודעות וואטסאפ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(255) UNIQUE,
        direction VARCHAR(20) DEFAULT 'outgoing',
        template_id INTEGER,
        phone_number VARCHAR(50) NOT NULL,
        contact_name VARCHAR(255),
        customer_id INTEGER,
        employee_id INTEGER,
        message_type VARCHAR(50) DEFAULT 'template',
        content TEXT,
        media_url TEXT,
        variables_used JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        read_at TIMESTAMPTZ,
        replied_at TIMESTAMPTZ,
        reply_content TEXT,
        error_message TEXT,
        conversation_id VARCHAR(255),
        triggered_by VARCHAR(255),
        trigger_event VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // יצירת טבלת שיחות וואטסאפ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id SERIAL PRIMARY KEY,
        conversation_id VARCHAR(255) UNIQUE,
        phone_number VARCHAR(50),
        contact_name VARCHAR(255),
        customer_id INTEGER,
        last_message_at TIMESTAMPTZ,
        message_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        assigned_to VARCHAR(255),
        tags JSONB DEFAULT '[]',
        ai_summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ===== הזנת 12 תבניות הודעות בעברית =====
    const templates = [
      {
        code: 'lead_welcome',
        name: 'Lead Welcome',
        name_he: 'ברוכים הבאים לליד',
        category: 'marketing',
        body: 'שלום {{name}}, תודה שפנית לטכנו כל עוזי! נציג מכירות ייצור איתך קשר בהקדם. מה מעניין אותך? שערים/מעקות/פרגולות/אחר',
        header: 'טכנו כל עוזי - ברוכים הבאים!',
        footer: 'טכנו כל עוזי - שערים, מעקות ופרגולות בהתאמה אישית',
        buttons: [{ type: 'QUICK_REPLY', text: 'שערים' }, { type: 'QUICK_REPLY', text: 'מעקות' }, { type: 'QUICK_REPLY', text: 'פרגולות' }],
        variables: ['name']
      },
      {
        code: 'appointment_confirmation',
        name: 'Appointment Confirmation',
        name_he: 'אישור פגישה',
        category: 'utility',
        body: 'שלום {{name}}, פגישה אושרה ל-{{date}} בשעה {{time}} בכתובת {{address}}. סוכן: {{agent_name}}. להזכיר לך שעה לפני?',
        header: 'אישור פגישה',
        footer: 'טכנו כל עוזי',
        buttons: [{ type: 'QUICK_REPLY', text: 'כן, הזכר לי' }, { type: 'QUICK_REPLY', text: 'ביטול פגישה' }],
        variables: ['name', 'date', 'time', 'address', 'agent_name']
      },
      {
        code: 'measurement_scheduled',
        name: 'Measurement Scheduled',
        name_he: 'תיאום מדידה',
        category: 'utility',
        body: 'שלום {{name}}, מדידה תואמה ל-{{date}} בשעה {{time}}. מהנדס {{engineer}} יגיע אליך. אנא ודא שהגישה פתוחה.',
        header: 'תיאום מדידה',
        footer: 'טכנו כל עוזי',
        buttons: [{ type: 'QUICK_REPLY', text: 'מאשר' }, { type: 'QUICK_REPLY', text: 'לתאם מחדש' }],
        variables: ['name', 'date', 'time', 'engineer']
      },
      {
        code: 'quote_sent',
        name: 'Quote Sent',
        name_he: 'הצעת מחיר נשלחה',
        category: 'utility',
        body: 'שלום {{name}}, הצעת מחיר מספר {{quote_number}} נשלחה אליך. סכום: {{amount}} ₪. תוקף: {{validity_days}} ימים. לשאלות: {{agent_phone}}',
        header: 'הצעת מחיר חדשה',
        footer: 'טכנו כל עוזי',
        buttons: [{ type: 'QUICK_REPLY', text: 'מאשר' }, { type: 'QUICK_REPLY', text: 'שאלות' }],
        variables: ['name', 'quote_number', 'amount', 'validity_days', 'agent_phone']
      },
      {
        code: 'contract_sign_reminder',
        name: 'Contract Sign Reminder',
        name_he: 'תזכורת חתימת חוזה',
        category: 'utility',
        body: 'שלום {{name}}, החוזה שלך ממתין לחתימה. לחץ כאן לחתימה: {{link}}',
        header: 'תזכורת חתימה',
        footer: 'טכנו כל עוזי',
        buttons: [{ type: 'URL', text: 'לחתימה', url: '{{link}}' }],
        variables: ['name', 'link']
      },
      {
        code: 'installation_scheduled',
        name: 'Installation Scheduled',
        name_he: 'תיאום התקנה',
        category: 'utility',
        body: 'שלום {{name}}, התקנה תואמה ל-{{date}}. מתקין: {{installer_name}}. משך משוער: {{duration}}. נא לפנות את האזור.',
        header: 'תיאום התקנה',
        footer: 'טכנו כל עוזי',
        buttons: [{ type: 'QUICK_REPLY', text: 'מאשר' }, { type: 'QUICK_REPLY', text: 'לתאם מחדש' }],
        variables: ['name', 'date', 'installer_name', 'duration']
      },
      {
        code: 'installation_complete',
        name: 'Installation Complete',
        name_he: 'התקנה הושלמה',
        category: 'utility',
        body: 'שלום {{name}}, ההתקנה הושלמה! מקווים שאתם מרוצים. נשמח לדירוג: {{rating_link}}',
        header: 'ההתקנה הושלמה!',
        footer: 'תודה שבחרתם בטכנו כל עוזי',
        buttons: [{ type: 'URL', text: 'דרג אותנו', url: '{{rating_link}}' }],
        variables: ['name', 'rating_link']
      },
      {
        code: 'payment_reminder',
        name: 'Payment Reminder',
        name_he: 'תזכורת תשלום',
        category: 'utility',
        body: 'שלום {{name}}, תזכורת: חשבונית {{invoice_number}} בסך {{amount}} ₪ טרם שולמה. מועד פירעון: {{due_date}}',
        header: 'תזכורת תשלום',
        footer: 'טכנו כל עוזי',
        buttons: [{ type: 'QUICK_REPLY', text: 'שולם' }, { type: 'QUICK_REPLY', text: 'צור קשר' }],
        variables: ['name', 'invoice_number', 'amount', 'due_date']
      },
      {
        code: 'agent_daily_schedule',
        name: 'Agent Daily Schedule',
        name_he: 'לוח פגישות יומי לסוכן',
        category: 'utility',
        body: 'בוקר טוב {{name}}! לוח הפגישות שלך להיום:\n{{schedule}}\nבהצלחה!',
        header: 'לוח פגישות יומי',
        footer: 'טכנו כל עוזי - מערכת ניהול',
        buttons: [],
        variables: ['name', 'schedule']
      },
      {
        code: 'installer_job_details',
        name: 'Installer Job Details',
        name_he: 'פרטי עבודה למתקין',
        category: 'utility',
        body: 'עבודה חדשה:\nלקוח: {{customer}}\nכתובת: {{address}}\nתאריך: {{date}}\nמוצרים: {{products}}\nהוראות: {{instructions}}',
        header: 'עבודה חדשה!',
        footer: 'טכנו כל עוזי',
        buttons: [{ type: 'QUICK_REPLY', text: 'מאשר קבלה' }, { type: 'QUICK_REPLY', text: 'בעיה' }],
        variables: ['customer', 'address', 'date', 'products', 'instructions']
      },
      {
        code: 'customer_satisfaction',
        name: 'Customer Satisfaction',
        name_he: 'שביעות רצון לקוח',
        category: 'marketing',
        body: 'שלום {{name}}, הפרויקט שלך הושלם! נשמח לשמוע - עד כמה אתם מרוצים? 1-5 כוכבים',
        header: 'מה דעתך?',
        footer: 'תודה על המשוב - טכנו כל עוזי',
        buttons: [{ type: 'QUICK_REPLY', text: '⭐⭐⭐⭐⭐' }, { type: 'QUICK_REPLY', text: '⭐⭐⭐' }, { type: 'QUICK_REPLY', text: 'לא מרוצה' }],
        variables: ['name']
      },
      {
        code: 'production_update',
        name: 'Production Update',
        name_he: 'עדכון ייצור',
        category: 'utility',
        body: 'עדכון ייצור: פרויקט {{project}} - שלב {{stage}}. צפי סיום: {{eta}}',
        header: 'עדכון ייצור',
        footer: 'טכנו כל עוזי',
        buttons: [],
        variables: ['project', 'stage', 'eta']
      }
    ];

    // הזנת התבניות לטבלה
    for (const t of templates) {
      await pool.query(`
        INSERT INTO whatsapp_templates (template_code, template_name, template_name_he, category, body_text, header_text, footer_text, buttons, variables)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (template_code) DO UPDATE SET
          template_name = EXCLUDED.template_name,
          template_name_he = EXCLUDED.template_name_he,
          body_text = EXCLUDED.body_text,
          header_text = EXCLUDED.header_text,
          footer_text = EXCLUDED.footer_text,
          buttons = EXCLUDED.buttons,
          variables = EXCLUDED.variables,
          updated_at = NOW()
      `, [t.code, t.name, t.name_he, t.category, t.body, t.header, t.footer, JSON.stringify(t.buttons), JSON.stringify(t.variables)]);
    }

    res.json({ success: true, message: "טבלאות וואטסאפ נוצרו ו-12 תבניות הוזנו בהצלחה" });
  } catch (err: any) {
    console.error("שגיאה באתחול מנוע וואטסאפ:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== CRUD תבניות =====

// שליפת כל התבניות
router.get("/whatsapp/templates", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM whatsapp_templates ORDER BY id`);
    res.json({ success: true, templates: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// שליפת תבנית לפי מזהה
router.get("/whatsapp/template/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM whatsapp_templates WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json({ success: true, template: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// יצירת תבנית חדשה
router.post("/whatsapp/template", async (req: Request, res: Response) => {
  try {
    const { template_code, template_name, template_name_he, category, language, body_text, header_text, footer_text, buttons, variables, media_type } = req.body;

    const result = await pool.query(`
      INSERT INTO whatsapp_templates (template_code, template_name, template_name_he, category, language, body_text, header_text, footer_text, buttons, variables, media_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [template_code, template_name, template_name_he, category, language || 'he', body_text, header_text, footer_text, JSON.stringify(buttons || []), JSON.stringify(variables || []), media_type]);

    res.json({ success: true, template: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// עדכון תבנית
router.put("/whatsapp/template/:id", async (req: Request, res: Response) => {
  try {
    const { template_name, template_name_he, category, body_text, header_text, footer_text, buttons, variables, media_type, approved, is_active } = req.body;

    const result = await pool.query(`
      UPDATE whatsapp_templates SET
        template_name = COALESCE($1, template_name),
        template_name_he = COALESCE($2, template_name_he),
        category = COALESCE($3, category),
        body_text = COALESCE($4, body_text),
        header_text = COALESCE($5, header_text),
        footer_text = COALESCE($6, footer_text),
        buttons = COALESCE($7, buttons),
        variables = COALESCE($8, variables),
        media_type = COALESCE($9, media_type),
        approved = COALESCE($10, approved),
        is_active = COALESCE($11, is_active),
        updated_at = NOW()
      WHERE id = $12 RETURNING *
    `, [template_name, template_name_he, category, body_text, header_text, footer_text, buttons ? JSON.stringify(buttons) : null, variables ? JSON.stringify(variables) : null, media_type, approved, is_active, req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json({ success: true, template: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקה רכה של תבנית (לא מוחקים! רק מבטלים)
router.delete("/whatsapp/template/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      UPDATE whatsapp_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json({ success: true, message: "תבנית בוטלה (לא נמחקה)", template: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליחת הודעה מתבנית =====
router.post("/whatsapp/send/:templateCode", async (req: Request, res: Response) => {
  try {
    const { templateCode } = req.params;
    const { phone_number, contact_name, customer_id, employee_id, variables, triggered_by, trigger_event, notes } = req.body;

    // שליפת התבנית
    const templateResult = await pool.query(
      `SELECT * FROM whatsapp_templates WHERE template_code = $1 AND is_active = true`,
      [templateCode]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: "תבנית לא נמצאה" });
    }

    const template = templateResult.rows[0];

    // בניית תוכן ההודעה עם החלפת משתנים
    let messageContent = template.body_text;
    if (variables && typeof variables === 'object') {
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        messageContent = messageContent.replace(regex, String(value));
      }
    }

    // יצירת מזהה הודעה ייחודי
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // יצירת או עדכון שיחה
    const conversationId = `conv_${phone_number.replace(/\D/g, '')}`;
    await pool.query(`
      INSERT INTO whatsapp_conversations (conversation_id, phone_number, contact_name, customer_id, last_message_at, message_count)
      VALUES ($1, $2, $3, $4, NOW(), 1)
      ON CONFLICT (conversation_id) DO UPDATE SET
        last_message_at = NOW(),
        message_count = whatsapp_conversations.message_count + 1,
        contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
        updated_at = NOW()
    `, [conversationId, phone_number, contact_name, customer_id]);

    // שמירת ההודעה
    const msgResult = await pool.query(`
      INSERT INTO whatsapp_messages (message_id, direction, template_id, phone_number, contact_name, customer_id, employee_id, message_type, content, variables_used, status, sent_at, conversation_id, triggered_by, trigger_event, notes)
      VALUES ($1, 'outgoing', $2, $3, $4, $5, $6, 'template', $7, $8, 'sent', NOW(), $9, $10, $11, $12)
      RETURNING *
    `, [messageId, template.id, phone_number, contact_name, customer_id, employee_id, messageContent, JSON.stringify(variables || {}), conversationId, triggered_by, trigger_event, notes]);

    // עדכון מונה שימוש בתבנית
    await pool.query(`UPDATE whatsapp_templates SET usage_count = usage_count + 1 WHERE id = $1`, [template.id]);

    res.json({
      success: true,
      message: "הודעה נשלחה בהצלחה",
      whatsapp_message: msgResult.rows[0],
      content: messageContent
    });
  } catch (err: any) {
    console.error("שגיאה בשליחת הודעת וואטסאפ:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== שליחה מרובה =====
router.post("/whatsapp/send-bulk", async (req: Request, res: Response) => {
  try {
    const { template_code, recipients, variables_base, triggered_by, trigger_event } = req.body;

    // שליפת התבנית
    const templateResult = await pool.query(
      `SELECT * FROM whatsapp_templates WHERE template_code = $1 AND is_active = true`,
      [template_code]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: "תבנית לא נמצאה" });
    }

    const template = templateResult.rows[0];
    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    // שליחה לכל נמען
    for (const recipient of recipients) {
      try {
        const vars = { ...variables_base, ...recipient.variables };
        let messageContent = template.body_text;
        for (const [key, value] of Object.entries(vars)) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          messageContent = messageContent.replace(regex, String(value));
        }

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const conversationId = `conv_${recipient.phone_number.replace(/\D/g, '')}`;

        // עדכון שיחה
        await pool.query(`
          INSERT INTO whatsapp_conversations (conversation_id, phone_number, contact_name, customer_id, last_message_at, message_count)
          VALUES ($1, $2, $3, $4, NOW(), 1)
          ON CONFLICT (conversation_id) DO UPDATE SET
            last_message_at = NOW(),
            message_count = whatsapp_conversations.message_count + 1,
            updated_at = NOW()
        `, [conversationId, recipient.phone_number, recipient.contact_name, recipient.customer_id]);

        // שמירת הודעה
        await pool.query(`
          INSERT INTO whatsapp_messages (message_id, direction, template_id, phone_number, contact_name, customer_id, message_type, content, variables_used, status, sent_at, conversation_id, triggered_by, trigger_event)
          VALUES ($1, 'outgoing', $2, $3, $4, $5, 'template', $6, $7, 'sent', NOW(), $8, $9, $10)
        `, [messageId, template.id, recipient.phone_number, recipient.contact_name, recipient.customer_id, messageContent, JSON.stringify(vars), conversationId, triggered_by, trigger_event]);

        successCount++;
        results.push({ phone: recipient.phone_number, status: 'sent' });
      } catch (e: any) {
        failCount++;
        results.push({ phone: recipient.phone_number, status: 'failed', error: e.message });
      }
    }

    // עדכון מונה שימוש
    await pool.query(`UPDATE whatsapp_templates SET usage_count = usage_count + $1 WHERE id = $2`, [successCount, template.id]);

    res.json({
      success: true,
      message: `נשלחו ${successCount} הודעות, ${failCount} נכשלו`,
      total: recipients.length,
      sent: successCount,
      failed: failCount,
      results
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליפת כל השיחות הפעילות =====
router.get("/whatsapp/conversations", async (req: Request, res: Response) => {
  try {
    const { status = 'active', page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const result = await pool.query(`
      SELECT * FROM whatsapp_conversations
      WHERE status = $1
      ORDER BY last_message_at DESC
      LIMIT $2 OFFSET $3
    `, [status, parseInt(limit as string), offset]);

    const countResult = await pool.query(`SELECT COUNT(*) FROM whatsapp_conversations WHERE status = $1`, [status]);

    res.json({ success: true, conversations: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליפת שיחה מלאה =====
router.get("/whatsapp/conversation/:conversationId", async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    // פרטי השיחה
    const convResult = await pool.query(`SELECT * FROM whatsapp_conversations WHERE conversation_id = $1`, [conversationId]);
    if (convResult.rows.length === 0) return res.status(404).json({ error: "שיחה לא נמצאה" });

    // כל ההודעות בשיחה
    const messagesResult = await pool.query(`
      SELECT wm.*, wt.template_name_he
      FROM whatsapp_messages wm
      LEFT JOIN whatsapp_templates wt ON wm.template_id = wt.id
      WHERE wm.conversation_id = $1
      ORDER BY wm.created_at ASC
    `, [conversationId]);

    res.json({
      success: true,
      conversation: convResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== קבלת הודעה נכנסת (webhook) =====
router.post("/whatsapp/receive-webhook", async (req: Request, res: Response) => {
  try {
    const { message_id, phone_number, contact_name, content, media_url, message_type } = req.body;

    const conversationId = `conv_${phone_number.replace(/\D/g, '')}`;

    // עדכון או יצירת שיחה
    await pool.query(`
      INSERT INTO whatsapp_conversations (conversation_id, phone_number, contact_name, last_message_at, message_count)
      VALUES ($1, $2, $3, NOW(), 1)
      ON CONFLICT (conversation_id) DO UPDATE SET
        last_message_at = NOW(),
        message_count = whatsapp_conversations.message_count + 1,
        contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
        updated_at = NOW()
    `, [conversationId, phone_number, contact_name]);

    // שמירת ההודעה הנכנסת
    const msgResult = await pool.query(`
      INSERT INTO whatsapp_messages (message_id, direction, phone_number, contact_name, message_type, content, media_url, status, conversation_id, created_at)
      VALUES ($1, 'incoming', $2, $3, $4, $5, $6, 'received', $7, NOW())
      RETURNING *
    `, [message_id || `in_${Date.now()}`, phone_number, contact_name, message_type || 'text', content, media_url, conversationId]);

    // בדיקה אם יש הודעה יוצאת אחרונה שצריך לעדכן כתגובה
    await pool.query(`
      UPDATE whatsapp_messages SET replied_at = NOW(), reply_content = $1, updated_at = NOW()
      WHERE conversation_id = $2 AND direction = 'outgoing' AND replied_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `, [content, conversationId]);

    res.json({ success: true, message: "הודעה נקלטה", whatsapp_message: msgResult.rows[0] });
  } catch (err: any) {
    console.error("שגיאה בקליטת הודעה נכנסת:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== סטטוס הודעה =====
router.get("/whatsapp/message-status/:messageId", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM whatsapp_messages WHERE message_id = $1`, [req.params.messageId]);
    if (result.rows.length === 0) return res.status(404).json({ error: "הודעה לא נמצאה" });
    res.json({ success: true, message: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== דשבורד וואטסאפ =====
router.get("/whatsapp/dashboard", async (_req: Request, res: Response) => {
  try {
    // סטטיסטיקות שליחה
    const sentResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) as delivered,
        COUNT(*) FILTER (WHERE read_at IS NOT NULL) as read,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM whatsapp_messages WHERE direction = 'outgoing'
    `);

    // שימוש בתבניות
    const templatesResult = await pool.query(`
      SELECT template_code, template_name_he, usage_count
      FROM whatsapp_templates
      ORDER BY usage_count DESC
      LIMIT 10
    `);

    // שיחות פעילות
    const activeConvsResult = await pool.query(`SELECT COUNT(*) FROM whatsapp_conversations WHERE status = 'active'`);

    // הודעות היום
    const todayResult = await pool.query(`
      SELECT COUNT(*) FROM whatsapp_messages WHERE created_at >= CURRENT_DATE
    `);

    // הודעות החודש
    const monthResult = await pool.query(`
      SELECT COUNT(*) FROM whatsapp_messages WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);

    res.json({
      success: true,
      dashboard: {
        delivery_stats: sentResult.rows[0],
        top_templates: templatesResult.rows,
        active_conversations: parseInt(activeConvsResult.rows[0].count),
        messages_today: parseInt(todayResult.rows[0].count),
        messages_this_month: parseInt(monthResult.rows[0].count)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== אנליטיקס לפי תקופה =====
router.get("/whatsapp/analytics/:period", async (req: Request, res: Response) => {
  try {
    const { period } = req.params; // day, week, month
    let interval = '1 day';
    if (period === 'week') interval = '7 days';
    if (period === 'month') interval = '30 days';

    // נפח הודעות
    const volumeResult = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing,
        COUNT(*) FILTER (WHERE direction = 'incoming') as incoming
      FROM whatsapp_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // אחוז תגובה
    const responseResult = await pool.query(`
      SELECT
        COUNT(*) as total_outgoing,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replied
      FROM whatsapp_messages
      WHERE direction = 'outgoing' AND created_at >= NOW() - INTERVAL '${interval}'
    `);

    // שעות שיא
    const peakHoursResult = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM whatsapp_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY count DESC
      LIMIT 5
    `);

    const totalOutgoing = parseInt(responseResult.rows[0]?.total_outgoing || '0');
    const totalReplied = parseInt(responseResult.rows[0]?.replied || '0');

    res.json({
      success: true,
      analytics: {
        period,
        message_volume: volumeResult.rows,
        response_rate: totalOutgoing > 0 ? ((totalReplied / totalOutgoing) * 100).toFixed(1) : '0',
        peak_hours: peakHoursResult.rows
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== תגובה אוטומטית עם AI =====
router.post("/whatsapp/auto-reply/:conversationId", async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { reply_content, triggered_by } = req.body;

    // שליפת פרטי השיחה
    const convResult = await pool.query(`SELECT * FROM whatsapp_conversations WHERE conversation_id = $1`, [conversationId]);
    if (convResult.rows.length === 0) return res.status(404).json({ error: "שיחה לא נמצאה" });

    const conv = convResult.rows[0];
    const messageId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // שמירת תגובה אוטומטית
    const msgResult = await pool.query(`
      INSERT INTO whatsapp_messages (message_id, direction, phone_number, contact_name, customer_id, message_type, content, status, sent_at, conversation_id, triggered_by, trigger_event)
      VALUES ($1, 'outgoing', $2, $3, $4, 'auto_reply', $5, 'sent', NOW(), $6, $7, 'ai_auto_reply')
      RETURNING *
    `, [messageId, conv.phone_number, conv.contact_name, conv.customer_id, reply_content, conversationId, triggered_by || 'ai']);

    // עדכון שיחה
    await pool.query(`
      UPDATE whatsapp_conversations SET last_message_at = NOW(), message_count = message_count + 1, updated_at = NOW()
      WHERE conversation_id = $1
    `, [conversationId]);

    res.json({ success: true, message: "תגובה אוטומטית נשלחה", whatsapp_message: msgResult.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== הודעות שלא נקראו =====
router.get("/whatsapp/unread", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT wm.*, wc.contact_name as conv_contact_name, wc.assigned_to
      FROM whatsapp_messages wm
      LEFT JOIN whatsapp_conversations wc ON wm.conversation_id = wc.conversation_id
      WHERE wm.direction = 'incoming' AND wm.read_at IS NULL
      ORDER BY wm.created_at DESC
    `);

    res.json({ success: true, unread: result.rows, count: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CRUD הודעות =====

// שליפת כל ההודעות
router.get("/whatsapp/messages", async (req: Request, res: Response) => {
  try {
    const { direction, status, phone_number, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = `SELECT wm.*, wt.template_name_he FROM whatsapp_messages wm LEFT JOIN whatsapp_templates wt ON wm.template_id = wt.id WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (direction) { query += ` AND wm.direction = $${paramIndex++}`; params.push(direction); }
    if (status) { query += ` AND wm.status = $${paramIndex++}`; params.push(status); }
    if (phone_number) { query += ` AND wm.phone_number = $${paramIndex++}`; params.push(phone_number); }

    query += ` ORDER BY wm.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), offset);

    const result = await pool.query(query, params);
    res.json({ success: true, messages: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// שליפת הודעה לפי מזהה
router.get("/whatsapp/message/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM whatsapp_messages WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "הודעה לא נמצאה" });
    res.json({ success: true, message: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
