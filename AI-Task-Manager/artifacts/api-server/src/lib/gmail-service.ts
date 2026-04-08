import { db } from "@workspace/db";
import { integrationConnectionsTable, integrationMessagesTable, integrationSyncLogsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveEntityByEmail } from "./entity-linker";

interface GmailConfig {
  username: string;
  password: string;
  fromName?: string;
  oauthToken?: string;
}

interface SendEmailParams {
  connectionId: number;
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  cc?: string;
  bcc?: string;
  entityType?: string;
  entityId?: number;
  entityName?: string;
  redactBodyInLog?: boolean;
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

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePayload {
  headers: GmailMessageHeader[];
  body?: { data?: string };
  parts?: Array<{ mimeType: string; body?: { data?: string } }>;
}

interface GmailApiMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePayload;
  internalDate?: string;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\x00]/g, "").trim();
}

function validateEmail(email: string): boolean {
  return /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(email.trim());
}

function getConfig(conn: ConnectionRecord): GmailConfig {
  const authConfig = conn.authConfig as Record<string, string>;
  if (!authConfig.username) throw new Error("Gmail username not configured");
  if (!authConfig.password && !authConfig.token) throw new Error("Gmail app password or OAuth token not configured");
  return {
    username: authConfig.username,
    password: authConfig.password,
    fromName: authConfig.fromName,
    oauthToken: authConfig.token,
  };
}

function isOAuthMode(conn: ConnectionRecord): boolean {
  const authConfig = conn.authConfig as Record<string, string>;
  if (authConfig.authMethod === "oauth") return true;
  if (authConfig.authMethod === "smtp") return false;
  return !!authConfig.token && conn.authMethod === "oauth";
}

export async function sendGmailMessage(params: SendEmailParams): Promise<SendResult> {
  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(and(
      eq(integrationConnectionsTable.id, params.connectionId),
      eq(integrationConnectionsTable.isActive, true),
    ));
  if (!conn) return { success: false, error: "Gmail connection not found or inactive" };

  if (!validateEmail(params.to)) {
    return { success: false, error: "Invalid recipient email address" };
  }
  if (params.cc && !params.cc.split(",").every(e => validateEmail(e.trim()))) {
    return { success: false, error: "Invalid CC email address" };
  }

  const typedConn = conn as unknown as ConnectionRecord;
  const config = getConfig(typedConn);

  if (isOAuthMode(typedConn)) {
    return sendViaGmailApi(config, params, typedConn.id);
  }

  return sendViaSmtp(config, params, typedConn.id);
}

async function sendViaGmailApi(
  config: GmailConfig,
  params: SendEmailParams,
  connectionId: number,
): Promise<SendResult> {
  if (!config.oauthToken) {
    return { success: false, error: "OAuth token required for Gmail API mode" };
  }

  const from = config.fromName
    ? `"${sanitizeHeaderValue(config.fromName)}" <${sanitizeHeaderValue(config.username)}>`
    : sanitizeHeaderValue(config.username);

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasHtml = !!params.bodyHtml;

  let mime = `From: ${from}\r\n`;
  mime += `To: ${sanitizeHeaderValue(params.to)}\r\n`;
  if (params.cc) mime += `Cc: ${sanitizeHeaderValue(params.cc)}\r\n`;
  if (params.bcc) mime += `Bcc: ${sanitizeHeaderValue(params.bcc)}\r\n`;
  mime += `Subject: =?UTF-8?B?${Buffer.from(sanitizeHeaderValue(params.subject)).toString("base64")}?=\r\n`;
  mime += `MIME-Version: 1.0\r\n`;

  if (hasHtml) {
    mime += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\n`;
    mime += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
    mime += `${params.body}\r\n\r\n`;
    mime += `--${boundary}\r\n`;
    mime += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
    mime += `${params.bodyHtml}\r\n\r\n`;
    mime += `--${boundary}--`;
  } else {
    mime += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
    mime += params.body;
  }

  const raw = Buffer.from(mime).toString("base64url");

  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.oauthToken}`,
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json() as { id?: string; error?: { message: string } };

    if (!response.ok) {
      const errorMsg = data?.error?.message || `HTTP ${response.status}`;
      await logEmail(params, connectionId, "failed", undefined, errorMsg);
      return { success: false, error: errorMsg };
    }

    await logEmail(params, connectionId, "sent", data.id);
    return { success: true, messageId: data.id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await logEmail(params, connectionId, "failed", undefined, errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function sendViaSmtp(
  config: GmailConfig,
  params: SendEmailParams,
  connectionId: number,
): Promise<SendResult> {
  try {
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: config.username,
        pass: config.password,
      },
    });

    const from = config.fromName
      ? `"${sanitizeHeaderValue(config.fromName)}" <${sanitizeHeaderValue(config.username)}>`
      : sanitizeHeaderValue(config.username);

    const info = await transporter.sendMail({
      from,
      to: sanitizeHeaderValue(params.to),
      cc: params.cc ? sanitizeHeaderValue(params.cc) : undefined,
      bcc: params.bcc ? sanitizeHeaderValue(params.bcc) : undefined,
      subject: sanitizeHeaderValue(params.subject),
      text: params.body,
      html: params.bodyHtml,
    });

    await logEmail(params, connectionId, "sent", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await logEmail(params, connectionId, "failed", undefined, errorMsg);
    return { success: false, error: `SMTP error: ${errorMsg}` };
  }
}

export async function syncGmailInbox(
  connectionId: number,
  maxResults: number = 20,
): Promise<{ fetched: number; errors: string[] }> {
  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(eq(integrationConnectionsTable.id, connectionId));
  if (!conn) return { fetched: 0, errors: ["Connection not found"] };

  const typedConn = conn as unknown as ConnectionRecord;

  if (!isOAuthMode(typedConn)) {
    return { fetched: 0, errors: ["Gmail inbox sync requires OAuth mode. SMTP mode does not support reading inbox."] };
  }

  const config = getConfig(typedConn);
  if (!config.oauthToken) {
    return { fetched: 0, errors: ["OAuth token required for inbox sync"] };
  }

  let fetched = 0;
  const errors: string[] = [];

  try {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`;
    const listRes = await fetch(listUrl, {
      headers: { "Authorization": `Bearer ${config.oauthToken}` },
      signal: AbortSignal.timeout(30000),
    });

    if (!listRes.ok) {
      const err = await listRes.json() as { error?: { message: string } };
      return { fetched: 0, errors: [err?.error?.message || `HTTP ${listRes.status}`] };
    }

    const listData = await listRes.json() as GmailListResponse;
    const messageIds = listData.messages || [];

    for (const msgRef of messageIds) {
      try {
        const existing = await db.select().from(integrationMessagesTable)
          .where(and(
            eq(integrationMessagesTable.externalId, msgRef.id),
            eq(integrationMessagesTable.connectionId, connectionId),
          ))
          .limit(1);

        if (existing.length > 0) continue;

        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`;
        const msgRes = await fetch(msgUrl, {
          headers: { "Authorization": `Bearer ${config.oauthToken}` },
          signal: AbortSignal.timeout(15000),
        });

        if (!msgRes.ok) continue;

        const msgData = await msgRes.json() as GmailApiMessage;
        const headers = msgData.payload?.headers || [];

        const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        const from = getHeader("From");
        const to = getHeader("To");
        const subject = getHeader("Subject");
        const date = getHeader("Date");

        let body = msgData.snippet || "";
        if (msgData.payload?.body?.data) {
          body = Buffer.from(msgData.payload.body.data, "base64url").toString("utf-8");
        } else if (msgData.payload?.parts) {
          const textPart = msgData.payload.parts.find(p => p.mimeType === "text/plain");
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
          }
        }

        let bodyHtml: string | undefined;
        if (msgData.payload?.parts) {
          const htmlPart = msgData.payload.parts.find(p => p.mimeType === "text/html");
          if (htmlPart?.body?.data) {
            bodyHtml = Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
          }
        }

        const isInbound = !from.includes(config.username);

        const lookupAddress = isInbound ? from : to;
        const entityMatch = await resolveEntityByEmail(lookupAddress);

        await db.insert(integrationMessagesTable).values({
          connectionId,
          channel: "gmail",
          direction: isInbound ? "inbound" : "outbound",
          externalId: msgRef.id,
          fromAddress: from,
          toAddress: to,
          subject,
          body: body.slice(0, 10000),
          bodyHtml: bodyHtml?.slice(0, 50000),
          status: "received",
          entityType: entityMatch?.entityType,
          entityId: entityMatch?.entityId,
          entityName: entityMatch?.entityName,
          metadata: { threadId: msgRef.threadId, labelIds: msgData.labelIds, date },
          sentAt: date ? new Date(date) : (msgData.internalDate ? new Date(parseInt(msgData.internalDate)) : new Date()),
        });
        fetched++;
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : "Failed to fetch message");
      }
    }

    await db.update(integrationConnectionsTable)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(integrationConnectionsTable.id, connectionId));

  } catch (e: unknown) {
    errors.push(e instanceof Error ? e.message : "Failed to sync inbox");
  }

  return { fetched, errors };
}

export async function testGmailConnection(connectionId: number): Promise<{ success: boolean; message: string }> {
  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(eq(integrationConnectionsTable.id, connectionId));
  if (!conn) return { success: false, message: "Connection not found" };

  try {
    const typedConn = conn as unknown as ConnectionRecord;
    const config = getConfig(typedConn);

    if (isOAuthMode(typedConn)) {
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { "Authorization": `Bearer ${config.oauthToken}` },
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json() as { emailAddress?: string; error?: { message: string } };

      await db.insert(integrationSyncLogsTable).values({
        connectionId,
        direction: "test",
        status: response.ok ? "completed" : "failed",
        recordsProcessed: 0,
        recordsFailed: 0,
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
        details: { email: data?.emailAddress, method: "oauth" },
      });

      if (response.ok) {
        await db.update(integrationConnectionsTable)
          .set({ lastSyncAt: new Date(), updatedAt: new Date() })
          .where(eq(integrationConnectionsTable.id, connectionId));
        return { success: true, message: `חיבור תקין — ${data?.emailAddress || "Gmail"}` };
      }
      return { success: false, message: `שגיאה: ${data?.error?.message || response.statusText}` };
    }

    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: config.username, pass: config.password },
    });

    await transporter.verify();

    await db.insert(integrationSyncLogsTable).values({
      connectionId,
      direction: "test",
      status: "completed",
      recordsProcessed: 0,
      recordsFailed: 0,
      details: { method: "smtp", email: config.username },
    });

    await db.update(integrationConnectionsTable)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(integrationConnectionsTable.id, connectionId));

    return { success: true, message: `חיבור SMTP תקין — ${config.username}` };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await db.insert(integrationSyncLogsTable).values({
      connectionId,
      direction: "test",
      status: "failed",
      recordsProcessed: 0,
      recordsFailed: 0,
      errorMessage: errorMsg,
    });
    return { success: false, message: `שגיאת חיבור: ${errorMsg}` };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendWelcomeEmail(params: {
  username: string;
  password: string;
  email: string;
  fullName: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!params.email) return { success: true };

  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(and(
      eq(integrationConnectionsTable.serviceType, "gmail"),
      eq(integrationConnectionsTable.isActive, true),
    ))
    .limit(1);

  if (!conn) {
    console.log("sendWelcomeEmail: No active Gmail connection found, skipping welcome email");
    return { success: false, error: "No active Gmail connection" };
  }

  const systemUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.APP_URL || "";

  const safeName = escapeHtml(params.fullName);
  const safeUsername = escapeHtml(params.username);
  const safePassword = escapeHtml(params.password);

  const subject = "ברוך הבא למערכת הניהול";

  const bodyText = `שלום ${params.fullName},\n\nחשבון המשתמש שלך נוצר בהצלחה.\n\nשם משתמש: ${params.username}\nסיסמה: ${params.password}\n\nקישור למערכת: ${systemUrl}\n\nמומלץ להתחבר ולשנות את הסיסמה בהקדם.\n\nבהצלחה!`;

  const bodyHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">מערכת הניהול</h1>
            <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">ברוך הבא לצוות!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;">שלום ${safeName} 👋</h2>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">חשבון המשתמש שלך נוצר בהצלחה במערכת. להלן פרטי הכניסה שלך:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">שם משתמש</span><br>
                  <strong style="color:#1e293b;font-size:16px;">${safeUsername}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <span style="color:#64748b;font-size:13px;">סיסמה</span><br>
                  <strong style="color:#1e293b;font-size:16px;direction:ltr;unicode-bidi:embed;">${safePassword}</strong>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr>
                <td style="background:#1e40af;border-radius:8px;">
                  <a href="${systemUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">כניסה למערכת</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">מומלץ לשנות את הסיסמה לאחר הכניסה הראשונה</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">הודעה זו נשלחה אוטומטית ממערכת הניהול</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const result = await sendGmailMessage({
    connectionId: conn.id,
    to: params.email,
    subject,
    body: bodyText,
    bodyHtml,
    redactBodyInLog: true,
  });

  if (!result.success) {
    console.log(`sendWelcomeEmail: Failed to send to ${params.email}: ${result.error}`);
  }

  return { success: result.success, error: result.error };
}

async function sendViaEnvSmtp(
  to: string,
  subject: string,
  bodyText: string,
  bodyHtml: string,
): Promise<SendResult> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return { success: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD env vars not configured" };
  }
  try {
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: gmailPass },
    });
    const fromName = process.env.GMAIL_FROM_NAME || "טכנו-כל עוזי ERP";
    const info = await transporter.sendMail({
      from: `"${fromName}" <${gmailUser}>`,
      to,
      subject,
      text: bodyText,
      html: bodyHtml,
    });
    console.log(`[EnvSMTP] Email sent to ${to}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[EnvSMTP] Failed to send to ${to}: ${msg}`);
    return { success: false, error: msg };
  }
}

function buildPasswordResetEmailContent(params: {
  fullName: string;
  username: string;
  newPassword: string;
  resetLink?: string;
}) {
  const safeName = escapeHtml(params.fullName);
  const safeUsername = escapeHtml(params.username);

  const isResetLink = !!params.resetLink || params.newPassword.startsWith("http");
  const resetLink = params.resetLink || (isResetLink ? params.newPassword : "");
  const safeResetLink = escapeHtml(resetLink);
  const systemUrl = process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "#");

  const subject = "איפוס סיסמה - מערכת טכנו-כל עוזי";

  const bodyText = isResetLink
    ? `שלום ${params.fullName},\n\nקיבלנו בקשה לאיפוס הסיסמה עבור שם המשתמש: ${params.username}\n\nלחץ על הקישור הבא לאיפוס הסיסמה:\n${resetLink}\n\nהקישור תקף לשעה אחת בלבד.\nאם לא ביקשת איפוס סיסמה, התעלם מהודעה זו.\n\nבהצלחה!`
    : `שלום ${params.fullName},\n\nהסיסמה שלך אופסה.\n\nשם משתמש: ${params.username}\nסיסמה חדשה: ${params.newPassword}\n\nמומלץ לשנות את הסיסמה לאחר הכניסה.\n\nבהצלחה!`;

  const bodyHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">איפוס סיסמה</h1>
            <p style="margin:8px 0 0;color:#fef3c7;font-size:14px;">טכנו-כל עוזי</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;">שלום ${safeName} 👋</h2>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">${isResetLink ? "קיבלנו בקשה לאיפוס הסיסמה שלך. לחץ על הכפתור להגדרת סיסמה חדשה:" : "הסיסמה שלך אופסה. להלן פרטי הכניסה החדשים שלך:"}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;${isResetLink ? "" : "border-bottom:1px solid #e2e8f0;"}">
                  <span style="color:#64748b;font-size:13px;">שם משתמש</span><br>
                  <strong style="color:#1e293b;font-size:16px;">${safeUsername}</strong>
                </td>
              </tr>
              ${isResetLink ? "" : `<tr>
                <td style="padding:16px 20px;">
                  <span style="color:#64748b;font-size:13px;">סיסמה חדשה</span><br>
                  <strong style="color:#1e293b;font-size:16px;direction:ltr;unicode-bidi:embed;">${escapeHtml(params.newPassword)}</strong>
                </td>
              </tr>`}
            </table>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr>
                <td style="background:#d97706;border-radius:8px;">
                  <a href="${safeResetLink || escapeHtml(systemUrl)}" style="display:inline-block;padding:14px 36px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">${isResetLink ? "איפוס סיסמה" : "כניסה למערכת"}</a>
                </td>
              </tr>
            </table>
            ${isResetLink ? `<p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">הקישור תקף לשעה אחת בלבד</p>` : `<p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">מומלץ לשנות את הסיסמה לאחר הכניסה</p>`}
            <p style="margin:12px 0 0;color:#94a3b8;font-size:13px;text-align:center;">אם לא ביקשת איפוס סיסמה, התעלם מהודעה זו.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">הודעה זו נשלחה אוטומטית ממערכת טכנו-כל עוזי</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, bodyText, bodyHtml };
}

export async function sendPasswordResetEmail(params: {
  email: string;
  fullName: string;
  username: string;
  newPassword: string;
  resetLink?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!params.email) return { success: false, error: "No email provided" };

  const { subject, bodyText, bodyHtml } = buildPasswordResetEmailContent(params);

  const [conn] = await db.select().from(integrationConnectionsTable)
    .where(and(
      eq(integrationConnectionsTable.serviceType, "gmail"),
      eq(integrationConnectionsTable.isActive, true),
    ))
    .limit(1);

  if (conn) {
    const result = await sendGmailMessage({
      connectionId: conn.id,
      to: params.email,
      subject,
      body: bodyText,
      bodyHtml,
      redactBodyInLog: true,
    });
    if (result.success) return { success: true };
    console.log(`sendPasswordResetEmail: Gmail connection failed (${result.error}), trying env SMTP...`);
  }

  const envResult = await sendViaEnvSmtp(params.email, subject, bodyText, bodyHtml);
  if (!envResult.success) {
    console.log(`sendPasswordResetEmail: All methods failed for ${params.email}: ${envResult.error}`);
  }
  return { success: envResult.success, error: envResult.error };
}

async function logEmail(
  params: SendEmailParams,
  connectionId: number,
  status: string,
  externalId?: string,
  error?: string,
) {
  await db.insert(integrationMessagesTable).values({
    connectionId,
    channel: "gmail",
    direction: "outbound",
    externalId,
    fromAddress: undefined,
    toAddress: params.to,
    subject: params.subject,
    body: params.redactBodyInLog ? "[תוכן רגיש הוסתר]" : params.body,
    bodyHtml: params.redactBodyInLog ? undefined : params.bodyHtml,
    status,
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    metadata: error ? { error, cc: params.cc, bcc: params.bcc } : { cc: params.cc, bcc: params.bcc },
    sentAt: status === "sent" ? new Date() : undefined,
  });
}
