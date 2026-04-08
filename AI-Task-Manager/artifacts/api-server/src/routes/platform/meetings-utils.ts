import { db } from "@workspace/db";
import { integrationConnectionsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { buildAuthHeaders } from "../../lib/integration-runtime";

async function getWhatsAppConnection() {
  const connections = await db
    .select()
    .from(integrationConnectionsTable)
    .where(
      and(
        eq(integrationConnectionsTable.isActive, true),
        sql`${integrationConnectionsTable.slug} IN ('whatsapp', 'whatsapp-api')`,
      ),
    );
  return connections.length > 0 ? connections[0] : null;
}

export async function sendWhatsAppMessage(phone: string, messageBody: string): Promise<{ success: boolean; error?: string }> {
  const conn = await getWhatsAppConnection();
  if (!conn) {
    return { success: false, error: "No WhatsApp integration configured." };
  }

  const authConfig = (conn.authConfig as Record<string, any>) || {};
  const phoneNumberId = authConfig.phoneNumberId;
  if (!phoneNumberId) {
    return { success: false, error: "WhatsApp integration is missing phoneNumberId configuration." };
  }

  const headers = buildAuthHeaders(conn);
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const url = `${conn.baseUrl.replace(/\/$/, "")}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "text",
    text: { body: messageBody },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errBody = await response.text();
    return { success: false, error: `WhatsApp API error: ${response.status} - ${errBody}` };
  }

  return { success: true };
}

export async function sendMeetingWhatsAppReminder(phone: string, data: Record<string, any>, label: string, startDate: string) {
  const reminderMsg = [
    `⏰ *תזכורת פגישה*`,
    ``,
    `*${data.title || "פגישה"}*`,
    `מתחילה בעוד ${label}`,
    `🕐 ${startDate}`,
    data.location ? `📍 ${data.location}` : "",
    data.video_link ? `🔗 ${data.video_link}` : "",
  ].filter(Boolean).join("\n");

  return sendWhatsAppMessage(phone, reminderMsg);
}
