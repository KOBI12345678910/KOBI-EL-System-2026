import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";

interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

function requireAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

import { db } from "@workspace/db";
import {
  integrationMessagesTable,
  integrationTemplatesTable,
  integrationConnectionsTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { sendWhatsAppMessage, testWhatsAppConnection, processWhatsAppWebhook, verifyWhatsAppSignature } from "../../lib/whatsapp-service";
import { sendGmailMessage, testGmailConnection, syncGmailInbox } from "../../lib/gmail-service";
import { sendSmsMessage, testSmsConnection } from "../../lib/sms-service";
import { sendTelegramMessage, testTelegramConnection, processTelegramWebhook } from "../../lib/telegram-service";

const router: IRouter = Router();

const SendMessageBody = z.object({
  connectionId: z.number().optional().nullable(),
  channel: z.enum(["whatsapp", "gmail", "sms", "telegram"]),
  to: z.string().min(1),
  subject: z.string().optional(),
  message: z.string().min(1),
  bodyHtml: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.number().optional(),
  entityName: z.string().optional(),
  templateName: z.string().optional(),
  templateParams: z.record(z.string(), z.string()).optional(),
});

const TemplateBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  channel: z.enum(["whatsapp", "gmail", "sms", "telegram"]),
  subject: z.string().optional(),
  body: z.string().min(1),
  bodyHtml: z.string().optional(),
  variables: z.array(z.string()).optional(),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

interface ZodValidationError {
  issues?: unknown[];
  message?: string;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

function isZodError(err: unknown): err is ZodValidationError {
  return typeof err === "object" && err !== null && "issues" in err && Array.isArray((err as ZodValidationError).issues);
}

router.post("/platform/messaging/send", requireAuthenticated, async (req, res) => {
  try {
    const body = SendMessageBody.parse(req.body);

    if (body.channel === "whatsapp") {
      if (!body.connectionId) {
        return res.status(503).json({
          success: false,
          error: "WhatsApp אינו מוגדר — יש להוסיף חיבור WhatsApp Business בהגדרות האינטגרציות.",
          errorCode: "WHATSAPP_NOT_CONFIGURED",
        });
      }
      const result = await sendWhatsAppMessage({
        connectionId: body.connectionId,
        to: body.to,
        message: body.message,
        entityType: body.entityType,
        entityId: body.entityId,
        entityName: body.entityName,
        templateName: body.templateName,
        templateParams: body.templateParams,
      });
      return res.json(result);
    }

    if (body.channel === "gmail") {
      if (!body.connectionId) {
        return res.status(503).json({
          success: false,
          error: "Gmail אינו מוגדר — יש להוסיף חיבור Gmail בהגדרות האינטגרציות.",
          errorCode: "GMAIL_NOT_CONFIGURED",
        });
      }
      const result = await sendGmailMessage({
        connectionId: body.connectionId,
        to: body.to,
        subject: body.subject || "(ללא נושא)",
        body: body.message,
        bodyHtml: body.bodyHtml,
        cc: body.cc,
        bcc: body.bcc,
        entityType: body.entityType,
        entityId: body.entityId,
        entityName: body.entityName,
      });
      return res.json(result);
    }

    if (body.channel === "sms") {
      if (!body.connectionId) {
        return res.status(503).json({
          success: false,
          error: "ערוץ SMS אינו מוגדר — יש להגדיר ספק SMS (כגון Twilio) בהגדרות האינטגרציות.",
          errorCode: "SMS_NOT_CONFIGURED",
        });
      }
      const result = await sendSmsMessage({
        connectionId: body.connectionId,
        to: body.to,
        message: body.message,
        entityType: body.entityType,
        entityId: body.entityId,
        entityName: body.entityName,
      });
      return res.json(result);
    }

    if (body.channel === "telegram") {
      if (!body.connectionId) {
        return res.status(503).json({
          success: false,
          error: "Telegram אינו מוגדר — יש להגדיר בוט Telegram בהגדרות האינטגרציות.",
          errorCode: "TELEGRAM_NOT_CONFIGURED",
        });
      }
      const result = await sendTelegramMessage({
        connectionId: body.connectionId,
        chatId: body.to,
        message: body.message,
        entityType: body.entityType,
        entityId: body.entityId,
        entityName: body.entityName,
      });
      return res.json(result);
    }

    res.status(400).json({ success: false, error: "Unsupported channel" });
  } catch (err: unknown) {
    if (isZodError(err)) return res.status(400).json({ error: "Validation error", details: (err as ZodValidationError).issues });
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.post("/platform/messaging/test/:connectionId", requireAuthenticated, async (req, res) => {
  try {
    const connectionId = Number(req.params.connectionId);
    const [conn] = await db.select().from(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, connectionId));
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const slug = conn.slug;
    let result;

    if (slug === "whatsapp" || slug === "whatsapp-api") {
      result = await testWhatsAppConnection(connectionId);
    } else if (slug === "gmail") {
      result = await testGmailConnection(connectionId);
    } else if (slug === "sms" || slug === "twilio" || slug === "nexmo" || slug === "vonage") {
      result = await testSmsConnection(connectionId);
    } else if (slug === "telegram" || slug === "telegram-bot") {
      result = await testTelegramConnection(connectionId);
    } else {
      result = { success: false, message: "No messaging test available for this integration type" };
    }

    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: getErrorMessage(err) });
  }
});

router.post("/platform/messaging/webhook/whatsapp/:connectionId", async (req, res) => {
  try {
    const connectionId = Number(req.params.connectionId);
    if (isNaN(connectionId)) {
      return res.status(400).json({ error: "Invalid connection ID" });
    }

    const [conn] = await db.select().from(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, connectionId));
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const authConfig = conn.authConfig as Record<string, string>;
    const appSecret = authConfig.appSecret;

    if (appSecret) {
      const signature = req.headers["x-hub-signature-256"] as string;
      const rawBody = (req as WebhookRequest).rawBody;
      if (!rawBody || !signature || !verifyWhatsAppSignature(rawBody, signature, appSecret)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    const result = await processWhatsAppWebhook(req.body, connectionId);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.get("/platform/messaging/webhook/whatsapp/:connectionId", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && challenge) {
    const connectionId = Number(req.params.connectionId);
    const [conn] = await db.select().from(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.id, connectionId));

    if (conn) {
      const authConfig = conn.authConfig as Record<string, string>;
      if (authConfig.verifyToken === token) {
        return res.status(200).send(challenge);
      }
    }
    return res.status(403).send("Forbidden");
  }
  res.status(400).send("Bad Request");
});

router.post("/platform/messaging/webhook/telegram/:connectionId", async (req, res) => {
  try {
    const connectionId = Number(req.params.connectionId);
    if (isNaN(connectionId)) {
      return res.status(400).json({ error: "Invalid connection ID" });
    }

    const result = await processTelegramWebhook(req.body, connectionId);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.post("/platform/messaging/sync/gmail/:connectionId", requireAuthenticated, async (req, res) => {
  try {
    const connectionId = Number(req.params.connectionId);
    if (isNaN(connectionId)) {
      return res.status(400).json({ error: "Invalid connection ID" });
    }

    const maxResults = Math.min(Number(req.query.maxResults) || 20, 50);
    const result = await syncGmailInbox(connectionId, maxResults);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.get("/platform/messaging/messages", requireAuthenticated, async (req, res) => {
  try {
    const { entityType, entityId, channel, connectionId, limit: limitParam } = req.query;
    const limit = Math.min(Number(limitParam) || 50, 200);

    let query = db.select().from(integrationMessagesTable)
      .orderBy(desc(integrationMessagesTable.createdAt))
      .limit(limit);

    if (entityType && entityId) {
      query = db.select().from(integrationMessagesTable)
        .where(and(
          eq(integrationMessagesTable.entityType, String(entityType)),
          eq(integrationMessagesTable.entityId, Number(entityId)),
        ))
        .orderBy(desc(integrationMessagesTable.createdAt))
        .limit(limit);
    } else if (connectionId) {
      query = db.select().from(integrationMessagesTable)
        .where(eq(integrationMessagesTable.connectionId, Number(connectionId)))
        .orderBy(desc(integrationMessagesTable.createdAt))
        .limit(limit);
    } else if (channel) {
      query = db.select().from(integrationMessagesTable)
        .where(eq(integrationMessagesTable.channel, String(channel)))
        .orderBy(desc(integrationMessagesTable.createdAt))
        .limit(limit);
    }

    const messages = await query;
    res.json(messages);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.get("/platform/messaging/messages/:id", requireAuthenticated, async (req, res) => {
  try {
    const [msg] = await db.select().from(integrationMessagesTable)
      .where(eq(integrationMessagesTable.id, Number(req.params.id)));
    if (!msg) return res.status(404).json({ error: "Message not found" });
    res.json(msg);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.get("/platform/messaging/activity-log", requireAuthenticated, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const messages = await db.select().from(integrationMessagesTable)
      .orderBy(desc(integrationMessagesTable.createdAt))
      .limit(limit);
    res.json(messages);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.get("/platform/messaging/templates", requireAuthenticated, async (_req, res) => {
  try {
    const templates = await db.select().from(integrationTemplatesTable)
      .orderBy(desc(integrationTemplatesTable.createdAt));
    res.json(templates);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.post("/platform/messaging/templates", requireAuthenticated, async (req, res) => {
  try {
    const body = TemplateBody.parse(req.body);
    const [template] = await db.insert(integrationTemplatesTable).values(body).returning();
    res.status(201).json(template);
  } catch (err: unknown) {
    if (isZodError(err)) return res.status(400).json({ error: "Validation error", details: (err as ZodValidationError).issues });
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.put("/platform/messaging/templates/:id", requireAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = TemplateBody.partial().parse(req.body);
    const [template] = await db.update(integrationTemplatesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(integrationTemplatesTable.id, id))
      .returning();
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.delete("/platform/messaging/templates/:id", requireAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(integrationTemplatesTable).where(eq(integrationTemplatesTable.id, id));
    res.status(204).send();
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.get("/platform/messaging/hub-status", requireAuthenticated, async (_req, res) => {
  try {
    const connections = await db.select().from(integrationConnectionsTable)
      .orderBy(desc(integrationConnectionsTable.createdAt));

    const messagingConnections = connections.filter(c =>
      ["whatsapp", "whatsapp-api", "gmail", "sms", "twilio", "nexmo", "vonage", "telegram", "telegram-bot"].includes(c.slug)
    );

    const messageCounts = await db.select().from(integrationMessagesTable)
      .orderBy(desc(integrationMessagesTable.createdAt))
      .limit(1000);

    const stats: Record<string, { total: number; sent: number; received: number; failed: number; lastSent?: string }> = {};
    for (const msg of messageCounts) {
      if (!stats[msg.channel]) stats[msg.channel] = { total: 0, sent: 0, received: 0, failed: 0 };
      stats[msg.channel].total++;
      if (msg.status === "sent") stats[msg.channel].sent++;
      if (msg.status === "received") stats[msg.channel].received++;
      if (msg.status === "failed") stats[msg.channel].failed++;
      if (!stats[msg.channel].lastSent && msg.sentAt) {
        stats[msg.channel].lastSent = msg.sentAt.toISOString();
      }
    }

    const SLUG_TO_CHANNEL: Record<string, string> = {
      "whatsapp": "whatsapp",
      "whatsapp-api": "whatsapp",
      "gmail": "email",
      "sms": "sms",
      "twilio": "sms",
      "nexmo": "sms",
      "vonage": "sms",
      "telegram": "telegram",
      "telegram-bot": "telegram",
    };

    res.json({
      connections: messagingConnections.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        isActive: c.isActive,
        lastSyncAt: c.lastSyncAt,
        channel: SLUG_TO_CHANNEL[c.slug] ?? c.slug,
      })),
      stats,
      totalMessages: messageCounts.length,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.get("/messaging/notification-rules", requireAuthenticated, async (req: Request, res: Response) => {
  try {
    const { pool } = await import("@workspace/db");
    const { rows } = await pool.query(`SELECT * FROM notification_routing_rules ORDER BY id`);
    res.json({ rules: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.post("/messaging/notification-rules", requireAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      notification_type, category, role_name, user_id,
      channel_in_app, channel_email, channel_whatsapp,
      min_priority_in_app, min_priority_email, min_priority_whatsapp,
      is_active, description, rule_name, event_type,
    } = req.body;
    const { pool } = await import("@workspace/db");
    const { rows } = await pool.query(
      `INSERT INTO notification_routing_rules (notification_type, category, role_name, user_id, channel_in_app, channel_email, channel_whatsapp, min_priority_in_app, min_priority_email, min_priority_whatsapp, is_active, description, rule_name, event_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [notification_type ?? "*", category ?? "system", role_name ?? null, user_id ?? null,
       channel_in_app ?? true, channel_email ?? false, channel_whatsapp ?? false,
       min_priority_in_app ?? "low", min_priority_email ?? "high", min_priority_whatsapp ?? "critical",
       is_active ?? true, description ?? null, rule_name ?? null, event_type ?? null]
    );
    res.status(201).json({ rule: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

const NOTIFICATION_RULE_ALLOWED_COLUMNS = new Set([
  "notification_type", "category", "role_name", "user_id",
  "channel_in_app", "channel_email", "channel_whatsapp",
  "min_priority_in_app", "min_priority_email", "min_priority_whatsapp",
  "is_active", "description", "rule_name", "event_type",
]);

router.patch("/messaging/notification-rules/:id", requireAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid rule ID" });

    const fields = req.body as Record<string, unknown>;
    const allowed = Object.entries(fields).filter(([k]) => NOTIFICATION_RULE_ALLOWED_COLUMNS.has(k));
    if (!allowed.length) return res.status(400).json({ error: "No valid fields to update" });

    const { pool } = await import("@workspace/db");
    const setClauses = allowed.map(([k], i) => `${k} = $${i + 2}`).join(", ");
    const values = allowed.map(([, v]) => v);

    const { rows } = await pool.query(
      `UPDATE notification_routing_rules SET ${setClauses}, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id, ...values]
    );
    if (!rows.length) return res.status(404).json({ error: "Rule not found" });
    res.json({ rule: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

router.delete("/messaging/notification-rules/:id", requireAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { pool } = await import("@workspace/db");
    await pool.query(`DELETE FROM notification_routing_rules WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

const SYSTEM_EVENTS = [
  { event: "order.created",        label: "הזמנה חדשה נוצרה",        defaultChannel: "whatsapp", category: "sales" },
  { event: "order.status_changed", label: "סטטוס הזמנה השתנה",       defaultChannel: "whatsapp", category: "sales" },
  { event: "order.overdue",        label: "הזמנה באיחור",             defaultChannel: "sms",       category: "sales" },
  { event: "payment.received",     label: "תשלום התקבל",             defaultChannel: "whatsapp", category: "finance" },
  { event: "payment.overdue",      label: "תשלום באיחור",            defaultChannel: "sms",       category: "finance" },
  { event: "production.completed", label: "ייצור הושלם",             defaultChannel: "whatsapp", category: "production" },
  { event: "delivery.scheduled",   label: "משלוח תוזמן",             defaultChannel: "whatsapp", category: "logistics" },
  { event: "supplier.invoice",     label: "חשבונית ספק התקבלה",      defaultChannel: "email",     category: "procurement" },
  { event: "employee.leave",       label: "בקשת חופשת עובד",         defaultChannel: "whatsapp", category: "hr" },
  { event: "inventory.low",        label: "מלאי נמוך - ספף הגעה",    defaultChannel: "whatsapp", category: "inventory" },
  { event: "quality.failed",       label: "בקרת איכות נכשלה",       defaultChannel: "whatsapp", category: "quality" },
  { event: "customer.inquiry",     label: "פנייה חדשה מלקוח",        defaultChannel: "whatsapp", category: "crm" },
];

router.get("/messaging/system-events", requireAuthenticated, async (_req: Request, res: Response) => {
  res.json({ events: SYSTEM_EVENTS });
});

export default router;
