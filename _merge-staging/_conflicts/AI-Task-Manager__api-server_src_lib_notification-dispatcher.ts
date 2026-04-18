import { db } from "@workspace/db";
import { notificationRoutingRulesTable, notificationDeliveryLogTable } from "@workspace/db/schema";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { sendGmailMessage } from "./gmail-service";
import { sendWhatsAppMessage } from "./whatsapp-service";
import { sendSlackEscalationAlert } from "./slack-service";
import { sendSmsMessage } from "./sms-service";
import { sendTelegramMessage } from "./telegram-service";
import { integrationConnectionsTable } from "@workspace/db/schema";
import { notifyClients } from "./sse-manager";

const PRIORITY_LEVELS: Record<string, number> = {
  low: 0,
  normal: 1,
  medium: 1,
  high: 2,
  critical: 3,
};

function meetsMinPriority(priority: string, minPriority: string): boolean {
  return (PRIORITY_LEVELS[priority] ?? 1) >= (PRIORITY_LEVELS[minPriority] ?? 0);
}

function parseTimeToMinutes(timeStr: string, defaultHour: number): number {
  const parts = (timeStr || `${defaultHour}:00`).split(":");
  const h = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  const hour = Number.isNaN(h) ? defaultHour : h;
  const minute = Number.isNaN(m) ? 0 : m;
  return hour * 60 + minute;
}

function isInQuietHours(rule: { quietHoursEnabled: boolean; quietHoursFrom: string; quietHoursTo: string; quietHoursBypassPriority: string }, priority: string): boolean {
  if (!rule.quietHoursEnabled) return false;
  if (meetsMinPriority(priority, rule.quietHoursBypassPriority)) return false;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = parseTimeToMinutes(rule.quietHoursFrom, 22);
  const toMinutes = parseTimeToMinutes(rule.quietHoursTo, 8);
  if (fromMinutes > toMinutes) {
    return nowMinutes >= fromMinutes || nowMinutes < toMinutes;
  }
  return nowMinutes >= fromMinutes && nowMinutes < toMinutes;
}

interface DispatchParams {
  notificationId: number;
  type: string;
  title: string;
  message: string;
  priority: string;
  category: string;
  userId: number | null;
  actionUrl?: string | null;
}

async function getEscalationSlackWebhook(): Promise<string | null> {
  try {
    const key = "escalation_slack_webhook_url";
    const result = await db.execute(
      sql`SELECT value FROM system_settings WHERE key = ${key} LIMIT 1`
    );
    const rows = (result.rows || []) as Array<{ value: string }>;
    const dbVal = rows[0]?.value;
    return dbVal || process.env.ESCALATION_SLACK_WEBHOOK_URL || null;
  } catch {
    return process.env.ESCALATION_SLACK_WEBHOOK_URL || null;
  }
}

async function getActiveGmailConnectionId(): Promise<number | null> {
  const [conn] = await db
    .select({ id: integrationConnectionsTable.id })
    .from(integrationConnectionsTable)
    .where(
      and(
        eq(integrationConnectionsTable.serviceType, "gmail"),
        eq(integrationConnectionsTable.isActive, true)
      )
    )
    .limit(1);
  return conn?.id ?? null;
}

async function getActiveWhatsAppConnectionId(): Promise<number | null> {
  const [conn] = await db
    .select({ id: integrationConnectionsTable.id })
    .from(integrationConnectionsTable)
    .where(
      and(
        eq(integrationConnectionsTable.serviceType, "whatsapp"),
        eq(integrationConnectionsTable.isActive, true)
      )
    )
    .limit(1);
  return conn?.id ?? null;
}

async function getActiveSmsConnectionId(): Promise<number | null> {
  const [conn] = await db
    .select({ id: integrationConnectionsTable.id })
    .from(integrationConnectionsTable)
    .where(
      and(
        eq(integrationConnectionsTable.serviceType, "sms"),
        eq(integrationConnectionsTable.isActive, true)
      )
    )
    .limit(1);
  return conn?.id ?? null;
}

async function getActiveTelegramConnectionId(): Promise<number | null> {
  const [conn] = await db
    .select({ id: integrationConnectionsTable.id })
    .from(integrationConnectionsTable)
    .where(
      and(
        eq(integrationConnectionsTable.serviceType, "telegram"),
        eq(integrationConnectionsTable.isActive, true)
      )
    )
    .limit(1);
  return conn?.id ?? null;
}

async function getUserRoles(userId: number): Promise<string[]> {
  try {
    const result = await db.execute(
      sql`SELECT r.name FROM roles r INNER JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ${userId}`
    );
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows || [];
    return rows.map((row) => (row as Record<string, unknown>).name as string).filter(Boolean);
  } catch {
    return [];
  }
}

async function getUserTelegramChatId(userId: number): Promise<string | null> {
  const result = await db.execute(
    sql`SELECT telegram_chat_id FROM users WHERE id = ${userId} LIMIT 1`
  );
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows || [];
  const row = rows[0] as Record<string, unknown> | undefined;
  return (row?.telegram_chat_id as string) || null;
}

async function getUserContactInfo(userId: number): Promise<{ email: string | null; phone: string | null; name: string | null }> {
  const result = await db.execute(
    sql`SELECT email, phone, full_name FROM users WHERE id = ${userId} LIMIT 1`
  );
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows || [];
  const row = rows[0] as Record<string, unknown> | undefined;
  return {
    email: (row?.email as string) || null,
    phone: (row?.phone as string) || null,
    name: (row?.full_name as string) || null,
  };
}

async function logDelivery(params: {
  notificationId: number;
  channel: string;
  status: string;
  recipientUserId?: number | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(notificationDeliveryLogTable).values({
      notificationId: params.notificationId,
      channel: params.channel,
      status: params.status,
      recipientUserId: params.recipientUserId ?? null,
      recipientEmail: params.recipientEmail ?? null,
      recipientPhone: params.recipientPhone ?? null,
      errorMessage: params.errorMessage ?? null,
      sentAt: params.status === "sent" ? new Date() : null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.error("[Dispatcher] Failed to log delivery:", err);
  }
}

async function sendEmailNotification(
  notificationId: number,
  userId: number,
  title: string,
  message: string,
  actionUrl?: string | null
) {
  const gmailConnectionId = await getActiveGmailConnectionId();
  if (!gmailConnectionId) {
    await logDelivery({
      notificationId,
      channel: "email",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "No active Gmail connection",
    });
    return;
  }

  const contact = await getUserContactInfo(userId);
  if (!contact.email) {
    await logDelivery({
      notificationId,
      channel: "email",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "User has no email",
    });
    return;
  }

  const systemUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.APP_URL || "";

  const actionHtml = actionUrl
    ? `<p style="margin:24px 0 0;"><a href="${systemUrl}${actionUrl}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">עבור לרשומה</a></p>`
    : "";

  const bodyHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 40px;">
            <h1 style="margin:0;color:#fff;font-size:20px;">התראת מערכת</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <h2 style="margin:0 0 12px;color:#1e293b;font-size:18px;">${title}</h2>
            <p style="margin:0;color:#475569;font-size:15px;line-height:1.7;">${message}</p>
            ${actionHtml}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const result = await sendGmailMessage({
    connectionId: gmailConnectionId,
    to: contact.email,
    subject: `התראה: ${title}`,
    body: `${title}\n\n${message}${actionUrl ? `\n\nקישור: ${systemUrl}${actionUrl}` : ""}`,
    bodyHtml,
  });

  await logDelivery({
    notificationId,
    channel: "email",
    status: result.success ? "sent" : "failed",
    recipientUserId: userId,
    recipientEmail: contact.email,
    errorMessage: result.error ?? null,
  });
}

async function sendWhatsAppNotification(
  notificationId: number,
  userId: number,
  title: string,
  message: string,
  actionUrl?: string | null
) {
  const waConnectionId = await getActiveWhatsAppConnectionId();
  if (!waConnectionId) {
    await logDelivery({
      notificationId,
      channel: "whatsapp",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "No active WhatsApp connection",
    });
    return;
  }

  const contact = await getUserContactInfo(userId);
  if (!contact.phone) {
    await logDelivery({
      notificationId,
      channel: "whatsapp",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "User has no phone",
    });
    return;
  }

  const systemUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.APP_URL || "";

  const waMessage = `*${title}*\n\n${message}${actionUrl ? `\n\n${systemUrl}${actionUrl}` : ""}`;

  const result = await sendWhatsAppMessage({
    connectionId: waConnectionId,
    to: contact.phone,
    message: waMessage,
  });

  await logDelivery({
    notificationId,
    channel: "whatsapp",
    status: result.success ? "sent" : "failed",
    recipientUserId: userId,
    recipientPhone: contact.phone,
    errorMessage: result.error ?? null,
  });
}

async function sendSlackNotification(
  notificationId: number,
  title: string,
  message: string,
  priority: string,
  actionUrl?: string | null,
) {
  const webhookUrl = await getEscalationSlackWebhook();
  if (!webhookUrl) {
    await logDelivery({
      notificationId,
      channel: "slack",
      status: "skipped",
      errorMessage: "No Slack webhook configured",
    });
    return;
  }

  const result = await sendSlackEscalationAlert(webhookUrl, {
    invoiceNumber: "",
    customerName: title,
    balanceDue: 0,
    daysOverdue: 0,
    customText: `*${title}*\n${message}`,
    priority,
    actionUrl: actionUrl || undefined,
  });

  await logDelivery({
    notificationId,
    channel: "slack",
    status: result.success ? "sent" : "failed",
    errorMessage: result.error ?? null,
  });
}

async function sendSmsNotification(
  notificationId: number,
  userId: number,
  title: string,
  message: string,
) {
  const smsConnectionId = await getActiveSmsConnectionId();
  if (!smsConnectionId) {
    await logDelivery({
      notificationId,
      channel: "sms",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "No active SMS connection",
    });
    return;
  }

  const contact = await getUserContactInfo(userId);
  if (!contact.phone) {
    await logDelivery({
      notificationId,
      channel: "sms",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "User has no phone",
    });
    return;
  }

  const smsText = `${title}\n${message}`;
  const result = await sendSmsMessage({
    connectionId: smsConnectionId,
    to: contact.phone,
    message: smsText,
  });

  await logDelivery({
    notificationId,
    channel: "sms",
    status: result.success ? "sent" : "failed",
    recipientUserId: userId,
    recipientPhone: contact.phone,
    errorMessage: result.error ?? null,
  });
}

async function sendTelegramNotification(
  notificationId: number,
  userId: number,
  title: string,
  message: string,
  actionUrl?: string | null,
) {
  const telegramConnectionId = await getActiveTelegramConnectionId();
  if (!telegramConnectionId) {
    await logDelivery({
      notificationId,
      channel: "telegram",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "No active Telegram connection",
    });
    return;
  }

  const chatId = await getUserTelegramChatId(userId);
  if (!chatId) {
    await logDelivery({
      notificationId,
      channel: "telegram",
      status: "skipped",
      recipientUserId: userId,
      errorMessage: "User has no Telegram chat ID",
    });
    return;
  }

  const systemUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.APP_URL || "";

  const telegramMsg = `<b>${title}</b>\n\n${message}${actionUrl ? `\n\n<a href="${systemUrl}${actionUrl}">עבור לרשומה</a>` : ""}`;

  const result = await sendTelegramMessage({
    connectionId: telegramConnectionId,
    chatId,
    message: telegramMsg,
    parseMode: "HTML",
  });

  await logDelivery({
    notificationId,
    channel: "telegram",
    status: result.success ? "sent" : "failed",
    recipientUserId: userId,
    errorMessage: result.error ?? null,
  });
}

async function sendBrowserPushNotification(
  notificationId: number,
  userId: number,
  title: string,
  message: string,
  actionUrl?: string | null,
) {
  try {
    const { sendBrowserPush } = await import("./push-service");
    const systemUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.APP_URL || "";
    const result = await sendBrowserPush(userId, {
      title,
      body: message,
      url: actionUrl ? `${systemUrl}${actionUrl}` : systemUrl,
      tag: `notification-${notificationId}`,
    });
    await logDelivery({
      notificationId,
      channel: "browser_push",
      status: result.success ? "sent" : result.errors.length > 0 && result.sent === 0 ? "skipped" : "failed",
      recipientUserId: userId,
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
      metadata: { sent: result.sent, failed: result.failed },
    });
  } catch (err) {
    console.error("[Dispatcher] Browser push error:", err);
  }
}

async function sendMobilePushNotification(
  notificationId: number,
  userId: number,
  title: string,
  message: string,
  actionUrl?: string | null,
) {
  try {
    const { sendExpoPush } = await import("./push-service");
    const systemUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.APP_URL || "";
    const result = await sendExpoPush(userId, {
      title,
      body: message,
      url: actionUrl ? `${systemUrl}${actionUrl}` : systemUrl,
      tag: `notification-${notificationId}`,
    });
    await logDelivery({
      notificationId,
      channel: "mobile_push",
      status: result.success ? "sent" : result.errors.length > 0 && result.sent === 0 ? "skipped" : "failed",
      recipientUserId: userId,
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
      metadata: { sent: result.sent, failed: result.failed },
    });
  } catch (err) {
    console.error("[Dispatcher] Mobile push error:", err);
  }
}

export async function dispatchNotification(params: DispatchParams) {
  const { notificationId, type, title, message, priority, category, userId, actionUrl } = params;

  notifyClients({ notificationId, type, title, message, priority, category, userId, actionUrl });

  if (!userId) return;

  try {
    const rules = await db
      .select()
      .from(notificationRoutingRulesTable)
      .where(
        and(
          eq(notificationRoutingRulesTable.isActive, true),
          or(
            eq(notificationRoutingRulesTable.notificationType, type),
            eq(notificationRoutingRulesTable.notificationType, "*"),
            and(
              eq(notificationRoutingRulesTable.category, category),
              isNull(notificationRoutingRulesTable.notificationType)
            )
          )
        )
      );

    const userRoles = await getUserRoles(userId);

    const matchedRules = rules.filter(rule => {
      if (rule.userId !== null && rule.userId !== undefined) {
        return rule.userId === userId;
      }
      if (rule.roleName !== null && rule.roleName !== undefined && rule.roleName !== "") {
        return userRoles.includes(rule.roleName);
      }
      return true;
    });

    const shouldEmail = matchedRules.some(
      r => r.channelEmail && meetsMinPriority(priority, r.minPriorityEmail) && !isInQuietHours(r, priority)
    );
    const shouldWhatsapp = matchedRules.some(
      r => r.channelWhatsapp && meetsMinPriority(priority, r.minPriorityWhatsapp) && !isInQuietHours(r, priority)
    );
    const shouldSlack = matchedRules.some(
      r => r.channelSlack && meetsMinPriority(priority, r.minPrioritySlack) && !isInQuietHours(r, priority)
    );

    if (shouldEmail) {
      sendEmailNotification(notificationId, userId, title, message, actionUrl).catch(err =>
        console.error("[Dispatcher] Email send error:", err)
      );
    }

    if (shouldWhatsapp) {
      sendWhatsAppNotification(notificationId, userId, title, message, actionUrl).catch(err =>
        console.error("[Dispatcher] WhatsApp send error:", err)
      );
    }

    if (shouldSlack) {
      sendSlackNotification(notificationId, title, message, priority, actionUrl).catch(err =>
        console.error("[Dispatcher] Slack send error:", err)
      );
    }

    const shouldSms = matchedRules.some(
      r => r.channelSms && meetsMinPriority(priority, r.minPrioritySms) && !isInQuietHours(r, priority)
    );
    const shouldTelegram = matchedRules.some(
      r => r.channelTelegram && meetsMinPriority(priority, r.minPriorityTelegram) && !isInQuietHours(r, priority)
    );

    if (shouldSms) {
      sendSmsNotification(notificationId, userId, title, message).catch(err =>
        console.error("[Dispatcher] SMS send error:", err)
      );
    }

    if (shouldTelegram) {
      sendTelegramNotification(notificationId, userId, title, message, actionUrl).catch(err =>
        console.error("[Dispatcher] Telegram send error:", err)
      );
    }

    const shouldBrowserPush = matchedRules.some(
      r => (r as any).channelBrowserPush && meetsMinPriority(priority, (r as any).minPriorityBrowserPush || "normal") && !isInQuietHours(r, priority)
    );
    const shouldMobilePush = matchedRules.some(
      r => (r as any).channelMobilePush && meetsMinPriority(priority, (r as any).minPriorityMobilePush || "high") && !isInQuietHours(r, priority)
    );

    if (shouldBrowserPush) {
      sendBrowserPushNotification(notificationId, userId, title, message, actionUrl).catch(err =>
        console.error("[Dispatcher] Browser Push send error:", err)
      );
    }

    if (shouldMobilePush) {
      sendMobilePushNotification(notificationId, userId, title, message, actionUrl).catch(err =>
        console.error("[Dispatcher] Mobile Push send error:", err)
      );
    }
  } catch (err) {
    console.error("[Dispatcher] Error processing routing rules:", err);
  }
}
