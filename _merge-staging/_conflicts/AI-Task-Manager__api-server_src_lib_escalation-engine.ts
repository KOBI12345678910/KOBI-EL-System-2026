import { backgroundPool } from "@workspace/db";
import { createNotificationForRole } from "./notification-service";
import { sendSlackEscalationAlert } from "./slack-service";
import { logger } from "./logger";

const WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0";

interface RuntimeSettings {
  slackWebhookUrl: string;
  whatsappPhoneId: string;
  whatsappToken: string;
  whatsappRecipient: string;
  overdueDays: number;
}

async function loadSettingsFromDb(): Promise<Partial<RuntimeSettings>> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const result = await client.query(
      `SELECT key, value FROM system_settings WHERE key IN (
        'escalation_slack_webhook_url',
        'escalation_whatsapp_recipient',
        'escalation_whatsapp_phone_id',
        'escalation_whatsapp_token',
        'escalation_overdue_days'
      )`
    );
    const rows = (result.rows || []) as Array<{ key: string; value: string }>;
    const settings: Partial<RuntimeSettings> = {};
    for (const row of rows) {
      if (row.key === "escalation_slack_webhook_url" && row.value) settings.slackWebhookUrl = row.value;
      if (row.key === "escalation_whatsapp_recipient" && row.value) settings.whatsappRecipient = row.value;
      if (row.key === "escalation_whatsapp_phone_id" && row.value) settings.whatsappPhoneId = row.value;
      if (row.key === "escalation_whatsapp_token" && row.value) settings.whatsappToken = row.value;
      if (row.key === "escalation_overdue_days" && row.value) settings.overdueDays = parseInt(row.value, 10) || 30;
    }
    return settings;
  } catch {
    return {};
  } finally {
    client?.release();
  }
}

async function getEscalationSettings(): Promise<RuntimeSettings> {
  const dbSettings = await loadSettingsFromDb();
  return {
    slackWebhookUrl: dbSettings.slackWebhookUrl || process.env.ESCALATION_SLACK_WEBHOOK_URL || "",
    whatsappPhoneId: dbSettings.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || "",
    whatsappToken: dbSettings.whatsappToken || process.env.WHATSAPP_TOKEN || "",
    whatsappRecipient: dbSettings.whatsappRecipient || process.env.WHATSAPP_RECIPIENT || "",
    overdueDays: dbSettings.overdueDays ?? parseInt(process.env.ESCALATION_OVERDUE_DAYS || "30", 10),
  };
}

interface OverdueInvoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  balance_due: number;
  due_date: string;
  days_overdue: number;
  currency?: string;
}

export async function getOverdueInvoices(overdueDays: number = 30): Promise<OverdueInvoice[]> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const result = await client.query(
      `SELECT id, invoice_number, customer_name,
               COALESCE(balance_due, 0) as balance_due,
               due_date,
               (CURRENT_DATE - due_date::date)::int as days_overdue,
               COALESCE(currency, 'ILS') as currency
        FROM accounts_receivable
        WHERE status NOT IN ('paid', 'cancelled', 'voided', 'written_off')
          AND due_date IS NOT NULL
          AND due_date::date <= CURRENT_DATE - ($1 || ' days')::interval
          AND COALESCE(balance_due, 0) > 0
        ORDER BY days_overdue DESC, balance_due DESC
        LIMIT 50`,
      [overdueDays]
    );
    return (result.rows || []) as unknown as OverdueInvoice[];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[EscalationEngine] Failed to query overdue invoices:", { error: msg });
    return [];
  } finally {
    client?.release();
  }
}

async function sendWhatsAppEscalation(
  invoice: OverdueInvoice,
  settings: RuntimeSettings,
): Promise<{ success: boolean; error?: string }> {
  if (!settings.whatsappPhoneId || !settings.whatsappToken || !settings.whatsappRecipient) {
    return { success: false, error: "WhatsApp credentials not configured" };
  }

  const currency = invoice.currency || "ILS";
  const symbol = currency === "ILS" ? "₪" : currency;
  const message =
    `🚨 *התראת חשבונית באיחור חריף*\n\n` +
    `חשבונית: *${invoice.invoice_number}*\n` +
    `לקוח: *${invoice.customer_name}*\n` +
    `יתרת חוב: *${symbol}${Number(invoice.balance_due).toLocaleString()}*\n` +
    `ימי איחור: *${invoice.days_overdue}*`;

  const url = `${WHATSAPP_API_BASE}/${settings.whatsappPhoneId}/messages`;
  const recipient = settings.whatsappRecipient.replace(/[^0-9]/g, "");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.whatsappToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: { body: message },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}

export interface EscalationRunResult {
  found: number;
  notificationsCreated: number;
  slackSent: number;
  whatsappSent: number;
  errors: string[];
  skipped: number;
}

export async function runEscalation(overrideDays?: number): Promise<EscalationRunResult> {
  const settings = await getEscalationSettings();
  const overdueDays = overrideDays ?? settings.overdueDays;

  logger.info("[EscalationEngine] Starting escalation run", { overdueDays });

  const invoices = await getOverdueInvoices(overdueDays);
  const result: EscalationRunResult = {
    found: invoices.length,
    notificationsCreated: 0,
    slackSent: 0,
    whatsappSent: 0,
    errors: [],
    skipped: 0,
  };

  for (const inv of invoices) {
    const dedupeKey = `escalation_${overdueDays}d_${inv.id}`;

    try {
      const notifications = await createNotificationForRole("מנהל כספים", {
        type: "overdue_invoice_escalation",
        title: `אסקלציה: חשבונית ${inv.invoice_number} — ${inv.days_overdue} ימי איחור`,
        message: `חשבונית ${inv.invoice_number} של ${inv.customer_name} — יתרה: ₪${Number(inv.balance_due).toLocaleString()} — ${inv.days_overdue} ימים באיחור`,
        priority: "critical",
        category: "anomaly",
        actionUrl: "/finance/ar",
        metadata: {
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          customerName: inv.customer_name,
          balanceDue: Number(inv.balance_due),
          daysOverdue: inv.days_overdue,
        },
        dedupeKey,
      });

      const createdCount = Array.isArray(notifications)
        ? notifications.filter(Boolean).length
        : notifications ? 1 : 0;

      if (createdCount === 0) {
        result.skipped++;
        continue;
      }

      result.notificationsCreated += createdCount;

      if (settings.slackWebhookUrl) {
        const slackResult = await sendSlackEscalationAlert(settings.slackWebhookUrl, {
          invoiceNumber: inv.invoice_number,
          customerName: inv.customer_name,
          balanceDue: Number(inv.balance_due),
          daysOverdue: inv.days_overdue,
          currency: inv.currency,
        });
        if (slackResult.success) {
          result.slackSent++;
        } else {
          result.errors.push(`Slack failed for invoice ${inv.invoice_number}: ${slackResult.error}`);
        }
      }

      const waResult = await sendWhatsAppEscalation(inv, settings);
      if (waResult.success) {
        result.whatsappSent++;
      } else if (waResult.error && !waResult.error.includes("not configured")) {
        result.errors.push(`WhatsApp failed for invoice ${inv.invoice_number}: ${waResult.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Error processing invoice ${inv.id}: ${msg}`);
      logger.error("[EscalationEngine] Error processing invoice", { invoiceId: inv.id, error: msg });
    }
  }

  logger.info("[EscalationEngine] Escalation run completed", {
    found: result.found,
    notificationsCreated: result.notificationsCreated,
    slackSent: result.slackSent,
    whatsappSent: result.whatsappSent,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return result;
}

export interface ServerHealthEscalationParams {
  checkType: string;
  status: string;
  consecutiveFailures: number;
  alertMessage: string;
  details?: Record<string, unknown>;
}

export async function runServerHealthEscalation(params: ServerHealthEscalationParams): Promise<void> {
  const settings = await getEscalationSettings();
  const { checkType, status, consecutiveFailures, alertMessage, details } = params;

  const dedupeKey = `server_health_escalation_${checkType}_${Math.floor(Date.now() / (4 * 60 * 60 * 1000))}`;

  await createNotificationForRole("מנהל מערכת", {
    type: "server_health_escalation",
    title: `ESCALATION: Server health '${checkType}' failing for ${consecutiveFailures} consecutive checks`,
    message: alertMessage,
    priority: "critical",
    category: "system",
    dedupeKey,
    metadata: { checkType, status, consecutiveFailures, ...details },
  });

  if (settings.slackWebhookUrl) {
    sendSlackEscalationAlert(settings.slackWebhookUrl, {
      invoiceNumber: "",
      customerName: `[Server Health] ${checkType}`,
      balanceDue: 0,
      daysOverdue: consecutiveFailures,
      customText: `*ESCALATION — Server Health Check Failed*\nCheck: ${checkType}\n${alertMessage}`,
      priority: "critical",
    }).catch((err) => {
      logger.warn("[EscalationEngine] Slack server-health escalation failed", {
        checkType,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  logger.info("[EscalationEngine] Server health escalation triggered", {
    checkType,
    status,
    consecutiveFailures,
  });
}

let cronScheduled = false;

export function startEscalationCron() {
  if (cronScheduled) return;
  cronScheduled = true;

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  const runWithLogging = () => {
    runEscalation().catch(err => {
      logger.error("[EscalationEngine] Cron run error:", { error: err instanceof Error ? err.message : String(err) });
    });
  };

  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(8, 0, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const msUntilFirstRun = nextRun.getTime() - now.getTime();
  logger.info("[EscalationEngine] Scheduling daily escalation cron", {
    firstRunAt: nextRun.toISOString(),
    msUntilFirstRun,
  });

  setTimeout(() => {
    runWithLogging();
    setInterval(runWithLogging, TWENTY_FOUR_HOURS);
  }, msUntilFirstRun);
}
