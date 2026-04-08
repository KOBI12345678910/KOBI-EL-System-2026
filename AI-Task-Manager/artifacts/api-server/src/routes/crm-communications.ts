import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "../lib/whatsapp-service";
import { sendGmailMessage } from "../lib/gmail-service";
import { sendSmsMessage } from "../lib/sms-service";
import { validateSession } from "../lib/auth";
import { fireCrmFollowupEvent } from "../lib/crm-followup-engine";

const router = Router();

// ── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

const q = async (query: ReturnType<typeof sql>) => {
  try {
    const r = await db.execute(query);
    return r.rows;
  } catch (e) {
    console.error("[CRM-Communications]", e);
    return [];
  }
};

async function ensureTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_followup_rules (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        trigger_type TEXT NOT NULL,
        trigger_event TEXT,
        trigger_entity TEXT NOT NULL DEFAULT 'lead',
        inaction_days INTEGER,
        delay_hours INTEGER NOT NULL DEFAULT 0,
        action_type TEXT NOT NULL,
        template_id INTEGER,
        custom_message TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        conditions JSONB NOT NULL DEFAULT '{}',
        tags TEXT[],
        run_count INTEGER NOT NULL DEFAULT 0,
        last_run_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_comm_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        channel TEXT NOT NULL,
        category TEXT,
        subject TEXT,
        body_he TEXT NOT NULL,
        body_en TEXT,
        variables JSONB NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        wa_template_name TEXT,
        wa_language TEXT DEFAULT 'he',
        meta_approved BOOLEAN NOT NULL DEFAULT FALSE,
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_followup_executions (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER REFERENCES crm_followup_rules(id) ON DELETE SET NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        entity_name TEXT,
        channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        scheduled_at TIMESTAMP NOT NULL,
        executed_at TIMESTAMP,
        message_id INTEGER,
        error TEXT,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_comm_analytics (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        channel TEXT NOT NULL,
        entity_type TEXT,
        rule_id INTEGER,
        sent INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0,
        opened INTEGER NOT NULL DEFAULT 0,
        replied INTEGER NOT NULL DEFAULT 0,
        converted INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_crm_followup_executions_entity ON crm_followup_executions(entity_type, entity_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_crm_followup_executions_pending ON crm_followup_executions(status, scheduled_at) WHERE status = 'pending'
    `);
  } catch (e) {
    console.error("[CRM-Communications] ensureTables error:", e);
  }
}

ensureTables().catch(console.error);

function applyMergeFields(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}|\[(\w+)\]/g, (match, p1, p2) => {
    const key = p1 || p2;
    return vars[key] || vars[key.toLowerCase()] || match;
  });
}

async function getActiveConnection(serviceType: string): Promise<number | null> {
  try {
    const rows = await db.execute(
      sql`SELECT id FROM integration_connections WHERE service_type = ${serviceType} AND is_active = TRUE LIMIT 1`
    );
    return (rows.rows as any[])[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ======================== FOLLOW-UP RULES ========================

router.get("/crm/followup-rules", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_followup_rules ORDER BY priority ASC, created_at DESC`);
  res.json(rows);
});

router.get("/crm/followup-rules/stats", async (_req: Request, res: Response) => {
  const rows = await q(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE is_active = TRUE) as active,
      COUNT(*) FILTER(WHERE trigger_type = 'event') as event_triggers,
      COUNT(*) FILTER(WHERE trigger_type = 'inaction') as inaction_triggers,
      COALESCE(SUM(run_count), 0) as total_runs
    FROM crm_followup_rules
  `);
  res.json(rows[0] || {});
});

router.post("/crm/followup-rules", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const rows = await q(sql`
      INSERT INTO crm_followup_rules (name, description, is_active, trigger_type, trigger_event, trigger_entity, inaction_days, delay_hours, action_type, template_id, custom_message, priority, conditions, tags)
      VALUES (
        ${d.name}, ${d.description ?? null}, ${d.isActive !== false},
        ${d.triggerType ?? 'event'}, ${d.triggerEvent ?? null},
        ${d.triggerEntity ?? 'lead'}, ${d.inactionDays ?? null},
        ${d.delayHours ?? 0}, ${d.actionType ?? 'whatsapp'},
        ${d.templateId ?? null}, ${d.customMessage ?? null},
        ${d.priority ?? 0},
        ${JSON.stringify(d.conditions ?? {})},
        ${d.tags ? JSON.stringify(d.tags) : null}
      ) RETURNING *
    `);
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/crm/followup-rules/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    await db.execute(sql`
      UPDATE crm_followup_rules SET
        name = ${d.name}, description = ${d.description ?? null},
        is_active = ${d.isActive !== false}, trigger_type = ${d.triggerType ?? 'event'},
        trigger_event = ${d.triggerEvent ?? null}, trigger_entity = ${d.triggerEntity ?? 'lead'},
        inaction_days = ${d.inactionDays ?? null}, delay_hours = ${d.delayHours ?? 0},
        action_type = ${d.actionType ?? 'whatsapp'}, template_id = ${d.templateId ?? null},
        custom_message = ${d.customMessage ?? null}, priority = ${d.priority ?? 0},
        conditions = ${JSON.stringify(d.conditions ?? {})},
        tags = ${d.tags ? JSON.stringify(d.tags) : null},
        updated_at = NOW()
      WHERE id = ${id}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/crm/followup-rules/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_followup_rules WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/crm/followup-rules/:id/toggle", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`
      UPDATE crm_followup_rules SET is_active = NOT is_active, updated_at = NOW() WHERE id = ${id}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Execute a follow-up rule manually for testing
router.post("/crm/followup-rules/:id/execute", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { entityType, entityId, entityName, phone, email } = req.body;

    const ruleRows = await q(sql`SELECT * FROM crm_followup_rules WHERE id = ${id}`);
    const rule = (ruleRows as any[])[0];
    if (!rule) return res.status(404).json({ error: "Rule not found" });

    let template: any = null;
    if (rule.template_id) {
      const tRows = await q(sql`SELECT * FROM crm_comm_templates WHERE id = ${rule.template_id}`);
      template = (tRows as any[])[0];
    }

    const mergeVars: Record<string, string> = {
      name: entityName || "",
      customerName: entityName || "",
      phone: phone || "",
      email: email || "",
    };

    const messageText = template
      ? applyMergeFields(template.body_he, mergeVars)
      : applyMergeFields(rule.custom_message || "", mergeVars);

    let success = false;
    let error: string | undefined;
    let messageId: string | undefined;

    if (rule.action_type === "whatsapp" && phone) {
      const connId = await getActiveConnection("whatsapp");
      if (connId) {
        const result = await sendWhatsAppMessage({
          connectionId: connId,
          to: phone,
          message: messageText,
          entityType,
          entityId,
          entityName,
          templateName: template?.wa_template_name,
        });
        success = result.success;
        error = result.error;
        messageId = result.messageId;
      } else {
        error = "No active WhatsApp connection";
      }
    } else if (rule.action_type === "email" && email) {
      const connId = await getActiveConnection("gmail");
      if (connId) {
        const result = await sendGmailMessage({
          connectionId: connId,
          to: email,
          subject: template?.subject || "עדכון",
          body: messageText,
          entityType,
          entityId,
          entityName,
        });
        success = result.success;
        error = result.error;
        messageId = result.messageId;
      } else {
        error = "No active Gmail connection";
      }
    } else if (rule.action_type === "sms" && phone) {
      const connId = await getActiveConnection("sms");
      if (connId) {
        const result = await sendSmsMessage({
          connectionId: connId,
          to: phone,
          message: messageText,
          entityType,
          entityId,
          entityName,
        });
        success = result.success;
        error = result.error;
        messageId = result.messageId;
      } else {
        error = "No active SMS connection";
      }
    } else {
      error = `No valid contact info for action type: ${rule.action_type}`;
    }

    await db.execute(sql`
      INSERT INTO crm_followup_executions (rule_id, entity_type, entity_id, entity_name, channel, status, scheduled_at, executed_at, metadata)
      VALUES (${id}, ${entityType}, ${entityId}, ${entityName ?? null}, ${rule.action_type}, ${success ? 'sent' : 'failed'}, NOW(), NOW(), ${JSON.stringify({ error, messageId })})
    `);

    if (success) {
      await db.execute(sql`UPDATE crm_followup_rules SET run_count = run_count + 1, last_run_at = NOW() WHERE id = ${id}`);
    }

    res.json({ success, error, messageId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== COMMUNICATION TEMPLATES ========================

router.get("/crm/comm-templates", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_comm_templates ORDER BY channel, name`);
  res.json(rows);
});

router.get("/crm/comm-templates/stats", async (_req: Request, res: Response) => {
  const rows = await q(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE is_active = TRUE) as active,
      COUNT(*) FILTER(WHERE channel = 'whatsapp') as whatsapp,
      COUNT(*) FILTER(WHERE channel = 'email') as email,
      COUNT(*) FILTER(WHERE channel = 'sms') as sms,
      COUNT(*) FILTER(WHERE meta_approved = TRUE) as meta_approved,
      COALESCE(SUM(usage_count), 0) as total_usage
    FROM crm_comm_templates
  `);
  res.json(rows[0] || {});
});

router.post("/crm/comm-templates", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const slug = d.slug || `tmpl-${Date.now()}`;
    const variables = Array.isArray(d.variables) ? d.variables : [];
    const rows = await q(sql`
      INSERT INTO crm_comm_templates (name, slug, channel, category, subject, body_he, body_en, variables, is_active, wa_template_name, wa_language, meta_approved)
      VALUES (
        ${d.name}, ${slug}, ${d.channel ?? 'whatsapp'}, ${d.category ?? null},
        ${d.subject ?? null}, ${d.bodyHe ?? d.body_he ?? ""},
        ${d.bodyEn ?? d.body_en ?? null}, ${JSON.stringify(variables)},
        ${d.isActive !== false}, ${d.waTemplateName ?? d.wa_template_name ?? null},
        ${d.waLanguage ?? 'he'}, ${d.metaApproved === true}
      ) RETURNING *
    `);
    res.json(rows[0]);
  } catch (e: any) {
    if (e.message?.includes("unique")) {
      res.status(409).json({ error: "Template with this slug already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.put("/crm/comm-templates/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    const variables = Array.isArray(d.variables) ? d.variables : [];
    await db.execute(sql`
      UPDATE crm_comm_templates SET
        name = ${d.name}, channel = ${d.channel ?? 'whatsapp'},
        category = ${d.category ?? null}, subject = ${d.subject ?? null},
        body_he = ${d.bodyHe ?? d.body_he ?? ""},
        body_en = ${d.bodyEn ?? d.body_en ?? null},
        variables = ${JSON.stringify(variables)},
        is_active = ${d.isActive !== false},
        wa_template_name = ${d.waTemplateName ?? d.wa_template_name ?? null},
        wa_language = ${d.waLanguage ?? 'he'},
        meta_approved = ${d.metaApproved === true},
        updated_at = NOW()
      WHERE id = ${id}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/crm/comm-templates/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_comm_templates WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Preview template with merge fields
router.post("/crm/comm-templates/:id/preview", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const vars = req.body.variables || {};
    const rows = await q(sql`SELECT * FROM crm_comm_templates WHERE id = ${id}`);
    const tmpl = (rows as any[])[0];
    if (!tmpl) return res.status(404).json({ error: "Template not found" });

    const preview = applyMergeFields(tmpl.body_he, vars);
    const previewEn = tmpl.body_en ? applyMergeFields(tmpl.body_en, vars) : null;
    res.json({ preview, previewEn, subject: tmpl.subject ? applyMergeFields(tmpl.subject, vars) : null });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== WHATSAPP CONVERSATIONS ========================

// Get all conversations (grouped by entity) — includes entity phone for outbound send
router.get("/crm/whatsapp/conversations", async (req: Request, res: Response) => {
  const { entityType } = req.query;
  const rows = await q(sql`
    SELECT
      im.entity_type,
      im.entity_id,
      im.entity_name,
      MAX(im.created_at) as last_message_at,
      COUNT(*) as message_count,
      COUNT(*) FILTER(WHERE im.direction = 'inbound' AND im.status != 'read') as unread_count,
      (SELECT im2.body FROM integration_messages im2
       WHERE im2.entity_type = im.entity_type AND im2.entity_id = im.entity_id AND im2.channel = 'whatsapp'
       ORDER BY im2.created_at DESC LIMIT 1) as last_message,
      (SELECT im2.direction FROM integration_messages im2
       WHERE im2.entity_type = im.entity_type AND im2.entity_id = im.entity_id AND im2.channel = 'whatsapp'
       ORDER BY im2.created_at DESC LIMIT 1) as last_direction,
      (SELECT im2.to_address FROM integration_messages im2
       WHERE im2.entity_type = im.entity_type AND im2.entity_id = im.entity_id
         AND im2.channel = 'whatsapp' AND im2.direction = 'outbound'
       ORDER BY im2.created_at DESC LIMIT 1) as entity_phone,
      (SELECT im2.from_address FROM integration_messages im2
       WHERE im2.entity_type = im.entity_type AND im2.entity_id = im.entity_id
         AND im2.channel = 'whatsapp' AND im2.direction = 'inbound'
       ORDER BY im2.created_at DESC LIMIT 1) as entity_inbound_phone
    FROM integration_messages im
    WHERE im.channel = 'whatsapp'
      AND im.entity_id IS NOT NULL
      ${entityType ? sql`AND im.entity_type = ${entityType as string}` : sql``}
    GROUP BY im.entity_type, im.entity_id, im.entity_name
    ORDER BY last_message_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

// Get messages for a specific entity (conversation view)
router.get("/crm/whatsapp/conversations/:entityType/:entityId", async (req: Request, res: Response) => {
  const { entityType, entityId } = req.params;
  const rows = await q(sql`
    SELECT
      im.*,
      ic.name as connection_name
    FROM integration_messages im
    LEFT JOIN integration_connections ic ON ic.id = im.connection_id
    WHERE im.channel = 'whatsapp'
      AND im.entity_type = ${entityType}
      AND im.entity_id = ${Number(entityId)}
    ORDER BY im.created_at ASC
    LIMIT 200
  `);
  res.json(rows);
});

// Send a WhatsApp message to an entity
router.post("/crm/whatsapp/send", async (req: Request, res: Response) => {
  try {
    const { to, message, entityType, entityId, entityName, templateId } = req.body;
    if (!to || !message) return res.status(400).json({ error: "Missing 'to' or 'message'" });

    const connId = await getActiveConnection("whatsapp");
    if (!connId) return res.status(503).json({ error: "No active WhatsApp connection configured" });

    let finalMessage = message;
    let templateName: string | undefined;

    if (templateId) {
      const tRows = await q(sql`SELECT * FROM crm_comm_templates WHERE id = ${Number(templateId)}`);
      const tmpl = (tRows as any[])[0];
      if (tmpl) {
        templateName = tmpl.wa_template_name;
        finalMessage = applyMergeFields(tmpl.body_he, req.body.variables || {});
      }
    }

    const result = await sendWhatsAppMessage({
      connectionId: connId,
      to,
      message: finalMessage,
      entityType,
      entityId,
      entityName,
      templateName,
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== UNIFIED COMMUNICATION TIMELINE ========================

router.get("/crm/timeline/:entityType/:entityId", async (req: Request, res: Response) => {
  const { entityType, entityId } = req.params;
  const id = Number(entityId);

  const rows = await q(sql`
    SELECT
      im.id,
      im.channel,
      im.direction,
      im.from_address,
      im.to_address,
      im.subject,
      im.body,
      im.status,
      im.sent_at,
      im.delivered_at,
      im.read_at,
      im.created_at,
      im.metadata,
      ic.name as connection_name
    FROM integration_messages im
    LEFT JOIN integration_connections ic ON ic.id = im.connection_id
    WHERE im.entity_type = ${entityType}
      AND im.entity_id = ${id}
    ORDER BY im.created_at DESC
    LIMIT 200
  `);

  res.json(rows);
});

router.get("/crm/timeline/:entityType/:entityId/stats", async (req: Request, res: Response) => {
  const { entityType, entityId } = req.params;
  const id = Number(entityId);

  const rows = await q(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE channel = 'whatsapp') as whatsapp,
      COUNT(*) FILTER(WHERE channel = 'gmail') as email,
      COUNT(*) FILTER(WHERE channel = 'sms') as sms,
      COUNT(*) FILTER(WHERE direction = 'inbound') as inbound,
      COUNT(*) FILTER(WHERE direction = 'outbound') as outbound,
      COUNT(*) FILTER(WHERE status = 'read') as read_count,
      MAX(created_at) as last_contact_at
    FROM integration_messages
    WHERE entity_type = ${entityType} AND entity_id = ${id}
  `);
  res.json(rows[0] || {});
});

// ======================== COMMUNICATION ANALYTICS ========================

router.get("/crm/comm-analytics", async (req: Request, res: Response) => {
  const { days = "30", channel } = req.query;
  const daysNum = Math.min(Number(days) || 30, 365);

  const channelFilter = channel && channel !== "all"
    ? sql`AND im.channel = ${channel as string}`
    : sql``;

  const rows = await q(sql`
    SELECT
      DATE(im.created_at) as date,
      im.channel,
      COUNT(*) as sent,
      COUNT(*) FILTER(WHERE im.status = 'delivered' OR im.delivered_at IS NOT NULL) as delivered,
      COUNT(*) FILTER(WHERE im.status = 'read' OR im.read_at IS NOT NULL) as opened,
      COUNT(*) FILTER(WHERE im.status = 'failed') as failed
    FROM integration_messages im
    WHERE im.direction = 'outbound'
      AND im.created_at >= NOW() - INTERVAL '1 day' * ${daysNum}
      ${channelFilter}
    GROUP BY DATE(im.created_at), im.channel
    ORDER BY date DESC
  `);

  res.json(rows);
});

router.get("/crm/comm-analytics/summary", async (req: Request, res: Response) => {
  const { days = "30" } = req.query;
  const daysNum = Math.min(Number(days) || 30, 365);

  // direction can be 'outbound' (WhatsApp) or 'outgoing' (SMS) — normalize with IS_OUTBOUND
  const rows = await q(sql`
    SELECT
      im.channel,
      COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing')) as total_sent,
      COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing') AND (im.status = 'delivered' OR im.delivered_at IS NOT NULL)) as delivered,
      COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing') AND (im.status = 'read' OR im.read_at IS NOT NULL)) as opened,
      COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing') AND im.status = 'failed') as failed,
      COUNT(*) FILTER(WHERE im.direction = 'inbound') as replies_received,
      CASE WHEN COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing')) > 0
        THEN ROUND(COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing') AND (im.status = 'read' OR im.read_at IS NOT NULL))::numeric / NULLIF(COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing')), 0) * 100, 1)
        ELSE 0 END as open_rate,
      CASE WHEN COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing')) > 0
        THEN ROUND(COUNT(*) FILTER(WHERE im.direction = 'inbound')::numeric / NULLIF(COUNT(*) FILTER(WHERE im.direction IN ('outbound','outgoing')), 0) * 100, 1)
        ELSE 0 END as response_rate
    FROM integration_messages im
    WHERE im.created_at >= NOW() - INTERVAL '1 day' * ${daysNum}
    GROUP BY im.channel
    ORDER BY total_sent DESC
  `);

  const totals = await q(sql`
    SELECT
      COUNT(*) FILTER(WHERE direction IN ('outbound','outgoing')) as total_outbound,
      COUNT(*) FILTER(WHERE direction = 'inbound') as total_inbound,
      COUNT(DISTINCT CONCAT(entity_type, '-', entity_id)) FILTER(WHERE entity_id IS NOT NULL) as unique_contacts,
      COUNT(*) FILTER(WHERE channel = 'whatsapp') as whatsapp_total,
      COUNT(*) FILTER(WHERE channel = 'gmail') as email_total,
      COUNT(*) FILTER(WHERE channel = 'sms') as sms_total
    FROM integration_messages
    WHERE created_at >= NOW() - INTERVAL '1 day' * ${daysNum}
  `);

  const followupStats = await q(sql`
    SELECT
      COUNT(*) as total_executions,
      COUNT(*) FILTER(WHERE status = 'sent') as successful,
      COUNT(*) FILTER(WHERE status = 'failed') as failed,
      COUNT(*) FILTER(WHERE status = 'pending') as pending
    FROM crm_followup_executions
    WHERE created_at >= NOW() - INTERVAL '1 day' * ${daysNum}
  `);

  // Conversion attribution: leads/customers that converted after receiving a follow-up
  const conversionAttribution = await q(sql`
    SELECT
      r.id as rule_id,
      r.name as rule_name,
      r.action_type as channel,
      COUNT(e.id) as total_sent,
      COUNT(DISTINCT CASE
        WHEN e.entity_type = 'lead' AND l.status = 'converted'
          AND l.updated_at > e.executed_at THEN e.entity_id
        ELSE NULL
      END) as conversions_lead,
      COUNT(DISTINCT CASE
        WHEN e.entity_type = 'customer'
          AND EXISTS (
            SELECT 1 FROM sales_orders so
            WHERE so.customer_id = e.entity_id AND so.created_at > e.executed_at
          ) THEN e.entity_id
        ELSE NULL
      END) as conversions_customer
    FROM crm_followup_executions e
    JOIN crm_followup_rules r ON r.id = e.rule_id
    LEFT JOIN crm_leads l ON l.id = e.entity_id AND e.entity_type = 'lead'
    WHERE e.status = 'sent'
      AND e.created_at >= NOW() - INTERVAL '1 day' * ${daysNum}
    GROUP BY r.id, r.name, r.action_type
    ORDER BY (COUNT(DISTINCT CASE WHEN e.entity_type = 'lead' AND l.status = 'converted' AND l.updated_at > e.executed_at THEN e.entity_id ELSE NULL END) +
              COUNT(DISTINCT CASE WHEN e.entity_type = 'customer' AND EXISTS (SELECT 1 FROM sales_orders so WHERE so.customer_id = e.entity_id AND so.created_at > e.executed_at) THEN e.entity_id ELSE NULL END)) DESC
    LIMIT 20
  `);

  res.json({
    byChannel: rows,
    totals: totals[0] || {},
    followupStats: followupStats[0] || {},
    conversionAttribution,
  });
});

// ======================== INBOUND MESSAGE ROUTING ========================

// Match incoming message to entity
router.post("/crm/inbound/route", async (req: Request, res: Response) => {
  try {
    const { phone, email, channel, body, externalId, connectionId } = req.body;

    let entityType: string | null = null;
    let entityId: number | null = null;
    let entityName: string | null = null;

    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, "");
      const leadRows = await q(sql`
        SELECT id, CONCAT(first_name, ' ', last_name) as name FROM crm_leads
        WHERE REGEXP_REPLACE(COALESCE(phone, whatsapp, ''), '[^0-9]', '', 'g') = ${cleanPhone}
        LIMIT 1
      `);
      if ((leadRows as any[]).length > 0) {
        const lead = (leadRows as any[])[0];
        entityType = "lead";
        entityId = lead.id;
        entityName = lead.name;
      } else {
        const custRows = await q(sql`
          SELECT id, name FROM customers
          WHERE REGEXP_REPLACE(COALESCE(phone, mobile, ''), '[^0-9]', '', 'g') = ${cleanPhone}
          LIMIT 1
        `);
        if ((custRows as any[]).length > 0) {
          const cust = (custRows as any[])[0];
          entityType = "customer";
          entityId = cust.id;
          entityName = cust.name;
        }
      }
    }

    if (!entityType && email) {
      const leadRows = await q(sql`SELECT id, CONCAT(first_name, ' ', last_name) as name FROM crm_leads WHERE LOWER(email) = LOWER(${email}) LIMIT 1`);
      if ((leadRows as any[]).length > 0) {
        const lead = (leadRows as any[])[0];
        entityType = "lead";
        entityId = lead.id;
        entityName = lead.name;
      }
    }

    // Store the inbound message linked to the matched entity
    let messageId: number | undefined;
    if (entityType && entityId && (body || externalId)) {
      try {
        const connId = connectionId || (await getActiveConnection(channel === "email" ? "gmail" : channel));
        const inserted = await db.execute(sql`
          INSERT INTO integration_messages (
            connection_id, channel, direction, from_address, to_address, body, status,
            external_id, entity_type, entity_id, entity_name, created_at
          ) VALUES (
            ${connId ?? null}, ${channel ?? 'whatsapp'}, 'inbound',
            ${phone || email || null}, NULL, ${body || null}, 'received',
            ${externalId || null}, ${entityType}, ${entityId}, ${entityName || null}, NOW()
          ) RETURNING id
        `);
        messageId = (inserted.rows as any[])[0]?.id;

        // Create activity log entry for the inbound message
        await db.execute(sql`
          INSERT INTO crm_activities (entity_type, entity_id, activity_type, description, channel, created_at)
          VALUES (${entityType}, ${entityId}, 'inbound_message', ${`הודעה נכנסת ב-${channel || 'whatsapp'}: ${(body || '').slice(0, 200)}`}, ${channel || 'whatsapp'}, NOW())
        `).catch(() => {}); // soft fail — table may not exist

        // Fire follow-up event to handle any inbound-triggered rules
        await fireCrmFollowupEvent("message_received", entityType, { id: entityId, name: entityName } as any);

        // Notify assigned rep (if any) via notification
        // leads: assigned_to; customers: account_manager (both may be user ID or username)
        const assignedRow = entityType === "lead"
          ? (await q(sql`SELECT assigned_to as rep FROM crm_leads WHERE id = ${entityId} LIMIT 1`))[0]
          : (await q(sql`SELECT account_manager as rep FROM customers WHERE id = ${entityId} LIMIT 1`))[0];
        const repRef = (assignedRow as any)?.rep;
        if (repRef) {
          const repId = typeof repRef === "number" || (typeof repRef === "string" && /^\d+$/.test(String(repRef))) ? Number(repRef) : null;
          const repUsername = repId ? null : String(repRef);
          await db.execute(repId
            ? sql`INSERT INTO notifications (user_id, type, title, message, is_read, created_at) SELECT u.id, 'inbound_message', ${`הודעה נכנסת מ-${entityName || 'לא ידוע'}`}, ${`התקבלה הודעת ${channel || 'whatsapp'}: ${(body || '').slice(0, 100)}`}, FALSE, NOW() FROM users u WHERE u.id = ${repId} LIMIT 1`
            : sql`INSERT INTO notifications (user_id, type, title, message, is_read, created_at) SELECT u.id, 'inbound_message', ${`הודעה נכנסת מ-${entityName || 'לא ידוע'}`}, ${`התקבלה הודעת ${channel || 'whatsapp'}: ${(body || '').slice(0, 100)}`}, FALSE, NOW() FROM users u WHERE u.username = ${repUsername} LIMIT 1`
          ).catch(() => {}); // soft fail
        }
      } catch (e) {
        console.error("[CRM-Communications] inbound message store error:", e);
      }
    }

    res.json({ entityType, entityId, entityName, matched: !!entityType, messageId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== WHATSAPP TEMPLATE MESSAGES ========================

const WA_TRANSACTIONAL_TEMPLATES = [
  {
    id: "order_confirmation",
    name: "אישור הזמנה",
    wa_template_name: "order_confirmation",
    category: "transactional",
    body_he: "שלום {{name}}, הזמנתך #{{orderNumber}} על סך {{amount}} אושרה! נעדכן אותך כשהיא תישלח. תודה שבחרת בנו! 🙏",
    body_en: "Hello {{name}}, your order #{{orderNumber}} for {{amount}} has been confirmed! We'll update you when it ships. Thank you! 🙏",
    variables: ["name", "orderNumber", "amount"],
  },
  {
    id: "delivery_update",
    name: "עדכון משלוח",
    wa_template_name: "delivery_update",
    category: "transactional",
    body_he: "שלום {{name}}, הזמנתך #{{orderNumber}} בדרך! מספר מעקב: {{trackingNumber}}. צפי הגעה: {{estimatedDate}} 🚚",
    body_en: "Hello {{name}}, your order #{{orderNumber}} is on its way! Tracking: {{trackingNumber}}. ETA: {{estimatedDate}} 🚚",
    variables: ["name", "orderNumber", "trackingNumber", "estimatedDate"],
  },
  {
    id: "payment_reminder",
    name: "תזכורת תשלום",
    wa_template_name: "payment_reminder",
    category: "transactional",
    body_he: "שלום {{name}}, תזכורת ידידותית — חשבונית #{{invoiceNumber}} על סך {{amount}} תפקע ב-{{dueDate}}. לתשלום: {{paymentLink}} 💳",
    body_en: "Hello {{name}}, friendly reminder — invoice #{{invoiceNumber}} for {{amount}} is due {{dueDate}}. Pay here: {{paymentLink}} 💳",
    variables: ["name", "invoiceNumber", "amount", "dueDate", "paymentLink"],
  },
  {
    id: "promotional_offer",
    name: "הצעה מיוחדת",
    wa_template_name: "promotional_offer",
    category: "marketing",
    body_he: "שלום {{name}}! 🎉 יש לנו הצעה מיוחדת עבורך — {{offerDescription}}. בתוקף עד {{expiryDate}}. לפרטים נוספים צור קשר!",
    body_en: "Hello {{name}}! 🎉 We have a special offer for you — {{offerDescription}}. Valid until {{expiryDate}}. Contact us for details!",
    variables: ["name", "offerDescription", "expiryDate"],
  },
];

router.get("/crm/whatsapp/templates", async (_req: Request, res: Response) => {
  const dbRows = await q(sql`SELECT * FROM crm_comm_templates WHERE channel = 'whatsapp' ORDER BY name`);
  const combined = [
    ...WA_TRANSACTIONAL_TEMPLATES.map(t => ({ ...t, source: "builtin", is_active: true })),
    ...(dbRows as any[]).map(t => ({ ...t, source: "custom" })),
  ];
  res.json(combined);
});

router.post("/crm/whatsapp/send-template", async (req: Request, res: Response) => {
  try {
    const { to, templateId, variables, entityType, entityId, entityName } = req.body;
    if (!to) return res.status(400).json({ error: "Missing 'to'" });

    const connId = await getActiveConnection("whatsapp");
    if (!connId) return res.status(503).json({ error: "No active WhatsApp connection configured" });

    const builtin = WA_TRANSACTIONAL_TEMPLATES.find(t => t.id === templateId);
    let message = "";
    let waTemplateName: string | undefined;

    if (builtin) {
      message = applyMergeFields(builtin.body_he, variables || {});
      waTemplateName = builtin.wa_template_name;
    } else {
      const tRows = await q(sql`SELECT * FROM crm_comm_templates WHERE id = ${Number(templateId)}`);
      const tmpl = (tRows as any[])[0];
      if (!tmpl) return res.status(404).json({ error: "Template not found" });
      message = applyMergeFields(tmpl.body_he, variables || {});
      waTemplateName = tmpl.wa_template_name;
    }

    const result = await sendWhatsAppMessage({
      connectionId: connId,
      to,
      message,
      entityType,
      entityId,
      entityName,
      templateName: waTemplateName,
      templateParams: variables,
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
