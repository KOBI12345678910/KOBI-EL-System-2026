import { entityCreate } from "@/lib/entity-api";

/**
 * Telegram Bot Integration
 * Sends notifications for SLA breaches and new leads
 */

interface EventLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: unknown;
}

interface Lead {
  id: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  source?: string;
  sales_status?: string;
  sla_deadline?: string;
  sla_status?: string;
  owner_user_id?: string;
  created_date?: string;
}

interface User {
  id: string;
}

export async function sendTelegramNotification(
  chatId: string,
  message: string
): Promise<void> {
  // Send via n8n webhook to Telegram Bot API
  await entityCreate<EventLog>("event-logs", {
    event_type: "lead.telegram.notify_requested",
    entity_type: "System",
    entity_id: "telegram_bot",
    payload: {
      chat_id: chatId,
      message,
    },
  });
}

/**
 * SLA Breach Notification
 */
export async function notifySLABreach(
  lead: Lead,
  managerChatId: string
): Promise<void> {
  const leadName =
    lead.company_name || `${lead.first_name} ${lead.last_name}`;
  const message = `
\u{1F6A8} *\u05D4\u05EA\u05E8\u05D0\u05EA SLA*

\u05D4\u05DC\u05D9\u05D3 *${leadName}* \u05E2\u05D1\u05E8 SLA breach!

\u{1F4CA} \u05E1\u05D8\u05D8\u05D5\u05E1: ${lead.sales_status}
\u23F0 SLA: ${lead.sla_deadline}
\u{1F464} \u05D0\u05D7\u05E8\u05D0\u05D9: ${lead.owner_user_id}

[\u05DC\u05D7\u05E5 \u05DC\u05E4\u05EA\u05D9\u05D7\u05D4](#)
  `.trim();

  await sendTelegramNotification(managerChatId, message);
}

/**
 * New Lead Notification
 */
export async function notifyNewLead(
  lead: Lead,
  teamChatId: string
): Promise<void> {
  const leadName =
    lead.company_name || `${lead.first_name} ${lead.last_name}`;
  const message = `
\u{1F195} *\u05DC\u05D9\u05D3 \u05D7\u05D3\u05E9 \u05E0\u05DB\u05E0\u05E1 \u05DC\u05DE\u05E2\u05E8\u05DB\u05EA*

\u05E9\u05DD: *${leadName}*
\u{1F4DE} \u05D8\u05DC\u05E4\u05D5\u05DF: ${lead.phone}
\u{1F4E7} \u05D0\u05D9\u05DE\u05D9\u05D9\u05DC: ${lead.email || "\u05DC\u05D0 \u05E6\u05D5\u05D9\u05DF"}
\u{1F3AF} \u05DE\u05E7\u05D5\u05E8: ${lead.source}

[\u05DC\u05D7\u05E5 \u05DC\u05D8\u05D9\u05E4\u05D5\u05DC](#)
  `.trim();

  await sendTelegramNotification(teamChatId, message);
}

/**
 * Hook to enable Telegram notifications in lead card
 */
export function useTelegramNotifications(lead: Lead | null, _user: User | null): void {
  // Listen for SLA status changes
  if (lead?.sla_status === "breached") {
    // Notify manager
    const MANAGER_CHAT_ID = process.env.TELEGRAM_MANAGER_CHAT_ID;
    if (MANAGER_CHAT_ID) {
      notifySLABreach(lead, MANAGER_CHAT_ID);
    }
  }

  // Listen for new leads
  if (lead?.sales_status === "new_lead") {
    const timeSinceCreation =
      Date.now() - new Date(lead.created_date || "").getTime();
    if (timeSinceCreation < 60000) {
      // Less than 1 minute old
      const TEAM_CHAT_ID = process.env.TELEGRAM_TEAM_CHAT_ID;
      if (TEAM_CHAT_ID) {
        notifyNewLead(lead, TEAM_CHAT_ID);
      }
    }
  }
}
