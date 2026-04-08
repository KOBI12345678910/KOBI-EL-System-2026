interface SlackSendResult {
  success: boolean;
  error?: string;
}

export async function sendSlackWebhookMessage(
  webhookUrl: string,
  text: string,
  attachments?: Array<Record<string, unknown>>,
): Promise<SlackSendResult> {
  if (!webhookUrl || !webhookUrl.startsWith("https://hooks.slack.com/")) {
    return { success: false, error: "Invalid Slack webhook URL" };
  }

  try {
    const body: Record<string, unknown> = { text };
    if (attachments && attachments.length > 0) {
      body.attachments = attachments;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

export async function sendSlackEscalationAlert(
  webhookUrl: string,
  invoice: {
    invoiceNumber: string;
    customerName: string;
    balanceDue: number;
    daysOverdue: number;
    currency?: string;
    customText?: string;
    priority?: string;
    actionUrl?: string;
  },
): Promise<SlackSendResult> {
  let text: string;
  let attachments: Array<Record<string, unknown>>;

  if (invoice.customText) {
    text = invoice.customText;
    const color = invoice.priority === "critical" ? "#dc2626"
      : invoice.priority === "high" ? "#f59e0b"
      : "#3b82f6";
    attachments = [
      {
        color,
        text: invoice.actionUrl ? `<${invoice.actionUrl}|פתח במערכת>` : undefined,
        footer: "מערכת ERP",
        ts: Math.floor(Date.now() / 1000),
      },
    ];
  } else {
    const currency = invoice.currency || "ILS";
    const symbol = currency === "ILS" ? "₪" : currency;
    text = `:rotating_light: *התראת חשבונית באיחור חריף*\n` +
      `חשבונית *${invoice.invoiceNumber}* של לקוח *${invoice.customerName}* ` +
      `— יתרת חוב: *${symbol}${Number(invoice.balanceDue).toLocaleString()}* — ` +
      `*${invoice.daysOverdue} ימי איחור*`;

    attachments = [
      {
        color: "#dc2626",
        fields: [
          { title: "חשבונית", value: invoice.invoiceNumber, short: true },
          { title: "לקוח", value: invoice.customerName, short: true },
          { title: "יתרת חוב", value: `${symbol}${Number(invoice.balanceDue).toLocaleString()}`, short: true },
          { title: "ימי איחור", value: String(invoice.daysOverdue), short: true },
        ],
        footer: "מערכת ERP — מנוע אסקלציה אוטומטית",
        ts: Math.floor(Date.now() / 1000),
      },
    ];
  }

  return sendSlackWebhookMessage(webhookUrl, text, attachments);
}
