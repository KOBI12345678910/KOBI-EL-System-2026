import { Router, Request, Response, NextFunction } from "express";
import { runEscalation, getOverdueInvoices } from "../lib/escalation-engine";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  const permissions = req.permissions;

  if (!userId || !permissions) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }

  if (!permissions.isSuperAdmin) {
    res.status(403).json({ error: "גישה מוגבלת למנהלי מערכת בלבד" });
    return;
  }

  next();
}

const ESCALATION_SETTING_KEYS = [
  "escalation_slack_webhook_url",
  "escalation_whatsapp_recipient",
  "escalation_whatsapp_phone_id",
  "escalation_whatsapp_token",
  "escalation_overdue_days",
] as const;

type EscalationSettingKey = typeof ESCALATION_SETTING_KEYS[number];

async function getDbSettings(): Promise<Record<string, string>> {
  const result = await db.execute(
    sql`SELECT key, value FROM system_settings WHERE key IN (
      'escalation_slack_webhook_url',
      'escalation_whatsapp_recipient',
      'escalation_whatsapp_phone_id',
      'escalation_whatsapp_token',
      'escalation_overdue_days'
    )`
  );
  const settings: Record<string, string> = {};
  for (const row of (result.rows || []) as Array<{ key: string; value: string }>) {
    settings[row.key] = row.value;
  }
  return settings;
}

async function upsertDbSetting(key: EscalationSettingKey, value: string) {
  await db.execute(
    sql`INSERT INTO system_settings (key, value, updated_at)
        VALUES (${key}, ${value}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
  );
}

router.post("/finance/run-escalation", requireAdmin as any, async (req: Request, res: Response) => {
  try {
    const overrideDays = req.body?.overdueDays ? parseInt(String(req.body.overdueDays), 10) : undefined;
    logger.info("[Escalation] Manual run triggered", { userId: req.userId, overrideDays });
    const result = await runEscalation(overrideDays);
    res.json({
      success: true,
      message: `אסקלציה הושלמה: נמצאו ${result.found} חשבוניות, נשלחו ${result.notificationsCreated} התראות`,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[Escalation] Manual run failed", { error: msg });
    res.status(500).json({ error: msg });
  }
});

router.get("/finance/escalation-preview", requireAdmin as any, async (req: Request, res: Response) => {
  try {
    const overdueDays = req.query.overdueDays ? parseInt(String(req.query.overdueDays), 10) : 30;
    const invoices = await getOverdueInvoices(overdueDays);
    res.json({ invoices, count: invoices.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/finance/escalation-settings", requireAdmin as any, async (_req: Request, res: Response) => {
  try {
    const settings = await getDbSettings();

    const slackWebhook = settings["escalation_slack_webhook_url"] || process.env.ESCALATION_SLACK_WEBHOOK_URL || "";
    const whatsappRecipient = settings["escalation_whatsapp_recipient"] || process.env.WHATSAPP_RECIPIENT || "";
    const whatsappPhoneId = settings["escalation_whatsapp_phone_id"] || process.env.WHATSAPP_PHONE_ID || "";
    const whatsappToken = settings["escalation_whatsapp_token"] || process.env.WHATSAPP_TOKEN || "";
    const overdueDays = settings["escalation_overdue_days"] || process.env.ESCALATION_OVERDUE_DAYS || "30";

    res.json({
      slackWebhookUrl: slackWebhook ? slackWebhook.replace(/(?<=hooks\.slack\.com\/services\/[^/]+\/[^/]+\/).+/, "****") : "",
      slackConfigured: !!slackWebhook,
      whatsappRecipient: whatsappRecipient ? whatsappRecipient.replace(/(\d{3})\d+(\d{4})/, "$1****$2") : "",
      whatsappPhoneIdConfigured: !!whatsappPhoneId,
      whatsappTokenConfigured: !!whatsappToken,
      whatsappConfigured: !!(whatsappRecipient && whatsappPhoneId && whatsappToken),
      overdueDays: parseInt(overdueDays, 10) || 30,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.put("/finance/escalation-settings", requireAdmin as any, async (req: Request, res: Response) => {
  try {
    const { slackWebhookUrl, whatsappRecipient, whatsappPhoneId, whatsappToken, overdueDays } = req.body;

    if (overdueDays !== undefined) {
      const parsed = String(parseInt(String(overdueDays), 10) || 30);
      await upsertDbSetting("escalation_overdue_days", parsed);
      process.env.ESCALATION_OVERDUE_DAYS = parsed;
    }

    if (whatsappRecipient !== undefined) {
      const val = String(whatsappRecipient || "");
      await upsertDbSetting("escalation_whatsapp_recipient", val);
      process.env.WHATSAPP_RECIPIENT = val;
    }

    if (slackWebhookUrl !== undefined && !String(slackWebhookUrl).includes("****")) {
      const val = String(slackWebhookUrl || "");
      await upsertDbSetting("escalation_slack_webhook_url", val);
      if (val) process.env.ESCALATION_SLACK_WEBHOOK_URL = val;
    }

    if (whatsappPhoneId !== undefined && !String(whatsappPhoneId).includes("****")) {
      const val = String(whatsappPhoneId || "");
      await upsertDbSetting("escalation_whatsapp_phone_id", val);
      if (val) process.env.WHATSAPP_PHONE_ID = val;
    }

    if (whatsappToken !== undefined && !String(whatsappToken).includes("****")) {
      const val = String(whatsappToken || "");
      await upsertDbSetting("escalation_whatsapp_token", val);
      if (val) process.env.WHATSAPP_TOKEN = val;
    }

    res.json({ success: true, message: "הגדרות האסקלציה נשמרו" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
