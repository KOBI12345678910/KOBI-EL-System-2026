import { createHmac } from "crypto";
import { db } from "@workspace/db";
import { integrationConnectionsTable, integrationMessagesTable, integrationSyncLogsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { resolveEntityByPhone } from "./entity-linker";

interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  businessAccountId?: string;
}

interface SendMessageParams {
  connectionId: number;
  to: string;
  message: string;
  entityType?: string;
  entityId?: number;
  entityName?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface ConnectionRecord {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  serviceType: string;
  baseUrl: string;
  authMethod: string;
  authConfig: Record<string, unknown>;
  defaultHeaders: Record<string, unknown>;
  isActive: boolean;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; caption?: string };
          document?: { id: string; filename?: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

const WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0";

export function verifyWhatsAppSignature(
  rawBody: string | Buffer,
  signature: string,
  appSecret: string,
): boolean {
  if (!signature || !appSecret) return false;
  const expectedSig = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  return `sha256=${expectedSig}` === signature;
}

function getConfig(conn: ConnectionRecord): WhatsAppConfig {
  const authConfig = conn.authConfig as Record<string, string>;
  if (!authConfig.token) throw new Error("WhatsApp API token not configured");
  if (!authConfig.phoneNumberId) throw new Error("WhatsApp Phone Number ID not configured");
  return {
    token: authConfig.token,
    phoneNumberId: authConfig.phoneNumberId,
    businessAccountId: authConfig.businessAccountId,
  };
}

export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendResult> {
  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(and(
      eq(integrationConnectionsTable.id, params.connectionId),
      eq(integrationConnectionsTable.isActive, true),
    ));
  if (!conn) return { success: false, error: "WhatsApp connection not found or inactive" };

  const typedConn = conn as unknown as ConnectionRecord;
  const config = getConfig(typedConn);
  const url = `${WHATSAPP_API_BASE}/${config.phoneNumberId}/messages`;

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: params.to.replace(/[^0-9]/g, ""),
    type: "text",
    text: { body: params.message },
  };

  if (params.templateName) {
    body.type = "template";
    body.template = {
      name: params.templateName,
      language: { code: "he" },
      ...(params.templateParams && {
        components: [{
          type: "body",
          parameters: Object.values(params.templateParams).map(v => ({ type: "text", text: v })),
        }],
      }),
    };
    delete body.text;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json() as { messages?: Array<{ id: string }>; error?: { message: string } };

    if (!response.ok) {
      const errorMsg = data?.error?.message || `HTTP ${response.status}`;
      await logMessage(params, typedConn.id, "failed", undefined, errorMsg);
      return { success: false, error: errorMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    await logMessage(params, typedConn.id, "sent", messageId);

    return { success: true, messageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await logMessage(params, typedConn.id, "failed", undefined, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Log inbound activity to crm_activities and notify the assigned rep
async function notifyAssignedRep(entityType: string, entityId: number, entityName: string, messageBody: string, channel: string): Promise<void> {
  try {
    // Log activity
    await db.execute(sql`
      INSERT INTO crm_activities (entity_type, entity_id, activity_type, description, channel, direction, created_at)
      VALUES (${entityType}, ${entityId}, 'message_received', ${`הודעת ${channel} נכנסת מ-${entityName}: ${messageBody.slice(0, 200)}`}, ${channel}, 'inbound', NOW())
      ON CONFLICT DO NOTHING
    `).catch(() => {});

    // Find assigned rep (leads: assigned_to; customers: account_manager — may be user ID or username)
    let repRef: string | number | null = null;
    if (entityType === "lead") {
      const rows = await db.execute(sql`SELECT assigned_to FROM crm_leads WHERE id = ${entityId} LIMIT 1`).catch(() => null);
      repRef = (rows?.rows as any[])?.[0]?.assigned_to ?? null;
    } else if (entityType === "customer") {
      const rows = await db.execute(sql`SELECT account_manager FROM customers WHERE id = ${entityId} LIMIT 1`).catch(() => null);
      repRef = (rows?.rows as any[])?.[0]?.account_manager ?? null;
    }

    if (repRef) {
      const repId = typeof repRef === "number" || (typeof repRef === "string" && /^\d+$/.test(repRef)) ? Number(repRef) : null;
      const repUsername = repId ? null : String(repRef);
      await db.execute(repId
        ? sql`INSERT INTO notifications (user_id, type, title, message, is_read, created_at) SELECT u.id, 'inbound_message', ${'הודעת ' + channel + ' נכנסת'}, ${`הודעה נכנסת מ-${entityName}: ${messageBody.slice(0, 100)}`}, FALSE, NOW() FROM users u WHERE u.id = ${repId} LIMIT 1`
        : sql`INSERT INTO notifications (user_id, type, title, message, is_read, created_at) SELECT u.id, 'inbound_message', ${'הודעת ' + channel + ' נכנסת'}, ${`הודעה נכנסת מ-${entityName}: ${messageBody.slice(0, 100)}`}, FALSE, NOW() FROM users u WHERE u.username = ${repUsername} LIMIT 1`
      ).catch(() => {});
    }
  } catch {
    // Silent — non-critical path
  }
}

export async function processWhatsAppWebhook(
  payload: WhatsAppWebhookPayload,
  connectionId: number,
): Promise<{ processed: number; errors: string[] }> {
  let processed = 0;
  const errors: string[] = [];

  if (payload.object !== "whatsapp_business_account") {
    return { processed: 0, errors: ["Invalid webhook payload: not a WhatsApp Business event"] };
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const messages = value.messages || [];
      const statuses = value.statuses || [];

      for (const msg of messages) {
        try {
          const senderName = value.contacts?.[0]?.profile?.name;
          let body = "";

          if (msg.type === "text" && msg.text?.body) {
            body = msg.text.body;
          } else if (msg.type === "image") {
            body = msg.image?.caption || "[תמונה]";
          } else if (msg.type === "document") {
            body = msg.document?.filename || "[מסמך]";
          } else {
            body = `[${msg.type}]`;
          }

          const entityMatch = await resolveEntityByPhone(msg.from);

          await db.insert(integrationMessagesTable).values({
            connectionId,
            channel: "whatsapp",
            direction: "inbound",
            externalId: msg.id,
            fromAddress: msg.from,
            toAddress: value.metadata?.display_phone_number || "",
            body,
            status: "received",
            entityType: entityMatch?.entityType,
            entityId: entityMatch?.entityId,
            entityName: entityMatch?.entityName || senderName,
            metadata: { type: msg.type, timestamp: msg.timestamp },
            sentAt: new Date(parseInt(msg.timestamp) * 1000),
          });

          // Log CRM activity and notify assigned rep if entity is matched
          if (entityMatch?.entityType && entityMatch?.entityId) {
            notifyAssignedRep(entityMatch.entityType, entityMatch.entityId, entityMatch.entityName || senderName || msg.from, body, "whatsapp").catch(() => {});
          }

          processed++;
        } catch (e: unknown) {
          errors.push(e instanceof Error ? e.message : "Failed to process message");
        }
      }

      for (const status of statuses) {
        try {
          const existing = await db.select().from(integrationMessagesTable)
            .where(eq(integrationMessagesTable.externalId, status.id))
            .limit(1);

          if (existing.length > 0) {
            const updates: Record<string, Date | string> = { status: status.status };
            if (status.status === "delivered") updates.deliveredAt = new Date(parseInt(status.timestamp) * 1000);
            if (status.status === "read") updates.readAt = new Date(parseInt(status.timestamp) * 1000);

            await db.update(integrationMessagesTable)
              .set(updates as Record<string, unknown>)
              .where(eq(integrationMessagesTable.id, existing[0].id));
          }
        } catch (e: unknown) {
          errors.push(e instanceof Error ? e.message : "Failed to process status");
        }
      }
    }
  }

  return { processed, errors };
}

export async function testWhatsAppConnection(connectionId: number): Promise<{ success: boolean; message: string }> {
  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(eq(integrationConnectionsTable.id, connectionId));
  if (!conn) return { success: false, message: "Connection not found" };

  try {
    const typedConn = conn as unknown as ConnectionRecord;
    const config = getConfig(typedConn);
    const url = `${WHATSAPP_API_BASE}/${config.phoneNumberId}`;

    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${config.token}` },
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json() as { verified_name?: string; error?: { message: string } };

    await db.insert(integrationSyncLogsTable).values({
      connectionId,
      direction: "test",
      status: response.ok ? "completed" : "failed",
      recordsProcessed: 0,
      recordsFailed: 0,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      details: { responseTime: 0, verified: data?.verified_name },
    });

    if (response.ok) {
      await db.update(integrationConnectionsTable)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(integrationConnectionsTable.id, connectionId));
      return { success: true, message: `חיבור תקין — ${data?.verified_name || "WhatsApp Business"}` };
    }
    return { success: false, message: `שגיאה: ${data?.error?.message || response.statusText}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: `שגיאת חיבור: ${msg}` };
  }
}

export interface OrderConfirmationParams {
  connectionId: number;
  to: string;
  templateName?: string;
  orderNumber: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  currency?: string;
}

export interface DeliveryUpdateParams {
  connectionId: number;
  to: string;
  templateName?: string;
  orderNumber: string;
  status: string;
  estimatedDate?: string;
  trackingLink?: string;
}

export interface PaymentReminderParams {
  connectionId: number;
  to: string;
  templateName?: string;
  invoiceNumber: string;
  customerName: string;
  amountDue: number;
  dueDate: string;
  paymentLink?: string;
  currency?: string;
}

export async function sendOrderConfirmation(params: OrderConfirmationParams): Promise<SendResult> {
  const itemsText = params.items
    .map(item => `• ${item.name} × ${item.quantity} — ${params.currency || "₪"}${item.price.toFixed(2)}`)
    .join("\n");
  const currency = params.currency || "₪";

  const message = [
    `✅ *אישור הזמנה #${params.orderNumber}*`,
    ``,
    `שלום ${params.customerName},`,
    `הזמנתך התקבלה בהצלחה!`,
    ``,
    `*פרטי ההזמנה:*`,
    itemsText,
    ``,
    `*סה"כ לתשלום: ${currency}${params.total.toFixed(2)}*`,
  ].join("\n");

  if (params.templateName) {
    return sendWhatsAppMessage({
      connectionId: params.connectionId,
      to: params.to,
      message,
      templateName: params.templateName,
      templateParams: {
        order_number: params.orderNumber,
        customer_name: params.customerName,
        total: `${currency}${params.total.toFixed(2)}`,
      },
    });
  }

  return sendWhatsAppMessage({
    connectionId: params.connectionId,
    to: params.to,
    message,
  });
}

export async function sendDeliveryUpdate(params: DeliveryUpdateParams): Promise<SendResult> {
  const STATUS_LABELS: Record<string, string> = {
    shipped: "נשלח",
    in_transit: "בדרך",
    out_for_delivery: "בדרך אליך",
    delivered: "נמסר",
    delayed: "עיכוב",
  };

  const statusLabel = STATUS_LABELS[params.status] || params.status;

  const lines = [
    `🚚 *עדכון משלוח — הזמנה #${params.orderNumber}*`,
    ``,
    `סטטוס: *${statusLabel}*`,
  ];

  if (params.estimatedDate) {
    lines.push(`תאריך משוער: ${params.estimatedDate}`);
  }

  if (params.trackingLink) {
    lines.push(``, `🔗 מעקב אחר המשלוח: ${params.trackingLink}`);
  }

  const message = lines.join("\n");

  if (params.templateName) {
    return sendWhatsAppMessage({
      connectionId: params.connectionId,
      to: params.to,
      message,
      templateName: params.templateName,
      templateParams: {
        order_number: params.orderNumber,
        status: statusLabel,
        estimated_date: params.estimatedDate || "",
        tracking_link: params.trackingLink || "",
      },
    });
  }

  return sendWhatsAppMessage({
    connectionId: params.connectionId,
    to: params.to,
    message,
  });
}

export async function sendPaymentReminder(params: PaymentReminderParams): Promise<SendResult> {
  const currency = params.currency || "₪";
  const lines = [
    `💰 *תזכורת תשלום — חשבונית #${params.invoiceNumber}*`,
    ``,
    `שלום ${params.customerName},`,
    ``,
    `סכום לתשלום: *${currency}${params.amountDue.toFixed(2)}*`,
    `תאריך פירעון: *${params.dueDate}*`,
  ];

  if (params.paymentLink) {
    lines.push(``, `💳 לתשלום מקוון: ${params.paymentLink}`);
  }

  lines.push(``, `לשאלות ניתן לפנות אלינו.`);

  const message = lines.join("\n");

  if (params.templateName) {
    return sendWhatsAppMessage({
      connectionId: params.connectionId,
      to: params.to,
      message,
      templateName: params.templateName,
      templateParams: {
        invoice_number: params.invoiceNumber,
        customer_name: params.customerName,
        amount_due: `${currency}${params.amountDue.toFixed(2)}`,
        due_date: params.dueDate,
        payment_link: params.paymentLink || "",
      },
    });
  }

  return sendWhatsAppMessage({
    connectionId: params.connectionId,
    to: params.to,
    message,
  });
}

async function logMessage(
  params: SendMessageParams,
  connectionId: number,
  status: string,
  externalId?: string,
  error?: string,
) {
  await db.insert(integrationMessagesTable).values({
    connectionId,
    channel: "whatsapp",
    direction: "outbound",
    externalId,
    toAddress: params.to,
    body: params.message,
    status,
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    metadata: error ? { error } : {},
    sentAt: status === "sent" ? new Date() : undefined,
  });
}
