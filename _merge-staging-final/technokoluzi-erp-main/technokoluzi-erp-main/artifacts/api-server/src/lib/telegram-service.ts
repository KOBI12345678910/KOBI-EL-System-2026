import { db } from "@workspace/db";
import { integrationMessagesTable, integrationConnectionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

interface SendTelegramParams {
  connectionId: number;
  chatId: string;
  message: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  entityType?: string;
  entityId?: number;
  entityName?: string;
}

interface TelegramResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

async function getConnectionConfig(connectionId: number) {
  const [conn] = await db
    .select()
    .from(integrationConnectionsTable)
    .where(eq(integrationConnectionsTable.id, connectionId));
  if (!conn) throw new Error("Telegram connection not found");
  return conn;
}

export async function sendTelegramMessage(params: SendTelegramParams): Promise<TelegramResult> {
  try {
    const conn = await getConnectionConfig(params.connectionId);
    const authConfig = conn.authConfig as Record<string, string>;
    const botToken = authConfig.botToken || authConfig.bot_token;

    if (!botToken) {
      return { success: false, error: "חסר Bot Token של Telegram" };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.message,
        parse_mode: params.parseMode || "HTML",
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    const success = data.ok === true;
    const result: TelegramResult = {
      success,
      messageId: success
        ? ((data.result as Record<string, unknown>)?.message_id as number)
        : undefined,
      error: success ? undefined : (data.description as string) || `Telegram error: ${response.status}`,
    };

    await db.insert(integrationMessagesTable).values({
      connectionId: params.connectionId,
      channel: "telegram",
      direction: "outgoing",
      fromAddress: "bot",
      toAddress: params.chatId,
      subject: null,
      body: params.message,
      status: result.success ? "sent" : "failed",
      externalId: result.messageId ? String(result.messageId) : null,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      entityName: params.entityName || null,
      sentAt: result.success ? new Date() : null,
      metadata: { error: result.error || null },
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown Telegram error";
    return { success: false, error };
  }
}

export async function sendTelegramPhoto(params: {
  connectionId: number;
  chatId: string;
  photoUrl: string;
  caption?: string;
}): Promise<TelegramResult> {
  try {
    const conn = await getConnectionConfig(params.connectionId);
    const authConfig = conn.authConfig as Record<string, string>;
    const botToken = authConfig.botToken || authConfig.bot_token;

    if (!botToken) {
      return { success: false, error: "חסר Bot Token של Telegram" };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        photo: params.photoUrl,
        caption: params.caption,
        parse_mode: "HTML",
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;
    return {
      success: data.ok === true,
      messageId: data.ok
        ? ((data.result as Record<string, unknown>)?.message_id as number)
        : undefined,
      error: data.ok ? undefined : (data.description as string),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function sendTelegramDocument(params: {
  connectionId: number;
  chatId: string;
  documentUrl: string;
  caption?: string;
}): Promise<TelegramResult> {
  try {
    const conn = await getConnectionConfig(params.connectionId);
    const authConfig = conn.authConfig as Record<string, string>;
    const botToken = authConfig.botToken || authConfig.bot_token;

    if (!botToken) {
      return { success: false, error: "חסר Bot Token של Telegram" };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        document: params.documentUrl,
        caption: params.caption,
        parse_mode: "HTML",
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;
    return {
      success: data.ok === true,
      error: data.ok ? undefined : (data.description as string),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function testTelegramConnection(connectionId: number): Promise<{ success: boolean; message: string }> {
  try {
    const conn = await getConnectionConfig(connectionId);
    const authConfig = conn.authConfig as Record<string, string>;
    const botToken = authConfig.botToken || authConfig.bot_token;

    if (!botToken) {
      return { success: false, message: "חסר Bot Token של Telegram" };
    }

    const url = `https://api.telegram.org/bot${botToken}/getMe`;
    const response = await fetch(url);
    const data = (await response.json()) as Record<string, unknown>;

    if (data.ok) {
      const bot = data.result as Record<string, unknown>;
      return {
        success: true,
        message: `חיבור תקין — בוט: @${bot.username} (${bot.first_name})`,
      };
    }
    return { success: false, message: (data.description as string) || "שגיאת חיבור Telegram" };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function processTelegramWebhook(
  body: Record<string, unknown>,
  connectionId: number
): Promise<{ processed: boolean }> {
  try {
    const message = body.message as Record<string, unknown> | undefined;
    if (!message) return { processed: false };

    const chat = message.chat as Record<string, unknown>;
    const from = message.from as Record<string, unknown>;
    const text = (message.text as string) || "";

    await db.insert(integrationMessagesTable).values({
      connectionId,
      channel: "telegram",
      direction: "incoming",
      fromAddress: String(from?.id || "unknown"),
      toAddress: String(chat?.id || ""),
      subject: null,
      body: text,
      status: "received",
      externalId: String(message.message_id || ""),
      sentAt: new Date((message.date as number) * 1000),
      metadata: {
        chatType: chat?.type,
        fromUsername: from?.username,
        fromName: `${from?.first_name || ""} ${from?.last_name || ""}`.trim(),
      },
    });

    return { processed: true };
  } catch (err) {
    console.error("[Telegram] Webhook processing error:", err);
    return { processed: false };
  }
}
