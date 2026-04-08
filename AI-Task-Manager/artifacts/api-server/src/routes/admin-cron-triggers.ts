import { Router } from "express";
import { requireSuperAdmin } from "../lib/permission-middleware";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename_cjs = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_cjs = typeof __dirname !== "undefined" ? __dirname : path.dirname(__filename_cjs);
const SCRIPTS_DIR = path.resolve(__dirname_cjs, "..", "..", "scripts");

const router = Router();

async function runBackup(): Promise<{ success: boolean; message: string; durationSec?: number }> {
  const script = path.join(SCRIPTS_DIR, "backup-db.sh");
  let backupId: number | null = null;

  try {
    const result = await db.execute(sql.raw(
      `INSERT INTO system_backups (backup_type, status, location, triggered_by, started_at) VALUES ('database','in_progress','local','admin',NOW()) RETURNING id`
    ));
    const firstRow = result.rows?.[0] as Record<string, unknown> | undefined;
    backupId = typeof firstRow?.id === "number" ? firstRow.id : null;
  } catch { /* ignore if table not ready */ }

  return new Promise((resolve) => {
    const startTime = Date.now();
    execFile("bash", [script], { env: process.env }, async (err, stdout, stderr) => {
      const durationSec = Math.round((Date.now() - startTime) / 1000);
      if (err) {
        logger.error("admin_backup_failed", { error: err.message, stderr });
        if (backupId) {
          await db.execute(sql.raw(
            `UPDATE system_backups SET status='failed', duration_seconds=${durationSec}, completed_at=NOW() WHERE id=${backupId}`
          )).catch(() => {/* ignore */});
        }
        resolve({ success: false, message: `גיבוי נכשל: ${err.message}`, durationSec });
      } else {
        logger.info("admin_backup_succeeded", { output: stdout.trim(), durationSec });
        if (backupId) {
          await db.execute(sql.raw(
            `UPDATE system_backups SET status='completed', duration_seconds=${durationSec}, completed_at=NOW() WHERE id=${backupId}`
          )).catch(() => {/* ignore */});
        }
        resolve({ success: true, message: "גיבוי הושלם בהצלחה", durationSec });
      }
    });
  });
}

async function runPaymentReminders(): Promise<{ success: boolean; count: number; message: string }> {
  const result = await db.execute(sql.raw(`
    SELECT id, customer_name, invoice_number, total_amount, due_date
    FROM customer_invoices
    WHERE status NOT IN ('paid', 'cancelled')
      AND due_date < NOW()
      AND (deleted_at IS NULL OR deleted_at > NOW())
    LIMIT 50
  `));
  const overdue = result.rows as Array<Record<string, unknown>>;

  for (const inv of overdue) {
    await db.execute(sql.raw(`
      INSERT INTO notifications (type, title, message, priority, category, created_at)
      VALUES ('overdue_invoice', 'חשבונית פגת תוקף', 'חשבונית ${String(inv.invoice_number || "")} מלקוח ${String(inv.customer_name || "")} פגת תוקף', 'high', 'finance', NOW())
      ON CONFLICT DO NOTHING
    `)).catch(() => {/* ignore */});
  }
  logger.info("admin_payment_reminders_triggered", { count: overdue.length });
  return { success: true, count: overdue.length, message: `נשלחו ${overdue.length} תזכורות תשלום` };
}

async function runLowStockCheck(): Promise<{ success: boolean; count: number; message: string }> {
  const result = await db.execute(sql.raw(`
    SELECT id, material_name, current_stock, reorder_point, unit
    FROM raw_materials
    WHERE current_stock IS NOT NULL
      AND reorder_point IS NOT NULL
      AND CAST(current_stock AS numeric) <= CAST(reorder_point AS numeric)
      AND (deleted_at IS NULL OR deleted_at > NOW())
    LIMIT 50
  `));
  const lowItems = result.rows as Array<Record<string, unknown>>;

  for (const item of lowItems) {
    await db.execute(sql.raw(`
      INSERT INTO notifications (type, title, message, priority, category, created_at, metadata)
      VALUES ('low_stock', 'מלאי נמוך', 'חומר גלם ${String(item.material_name || "")} — מלאי נוכחי: ${String(item.current_stock || 0)} ${String(item.unit || "")}', 'high', 'inventory', NOW(), '{"materialId": ${Number(item.id || 0)}}')
      ON CONFLICT DO NOTHING
    `)).catch(() => {/* ignore */});
  }
  logger.info("admin_low_stock_check_triggered", { count: lowItems.length });
  return { success: true, count: lowItems.length, message: `נמצאו ${lowItems.length} פריטים עם מלאי נמוך` };
}

async function runEmployeeAlerts(): Promise<{ success: boolean; count: number; message: string }> {
  const result = await db.execute(sql.raw(`
    SELECT id, first_name, last_name, end_date
    FROM employees
    WHERE end_date IS NOT NULL
      AND end_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
      AND (deleted_at IS NULL OR deleted_at > NOW())
    LIMIT 20
  `));
  const expiring = result.rows as Array<Record<string, unknown>>;

  for (const emp of expiring) {
    await db.execute(sql.raw(`
      INSERT INTO notifications (type, title, message, priority, category, created_at)
      VALUES ('employee_contract_expiring', 'חוזה עובד פג תוקף בקרוב', 'עובד ${String(emp.first_name || "")} ${String(emp.last_name || "")} — חוזה פג ב-${String(emp.end_date || "")}', 'normal', 'hr', NOW())
      ON CONFLICT DO NOTHING
    `)).catch(() => {/* ignore */});
  }
  logger.info("admin_employee_alerts_triggered", { count: expiring.length });
  return { success: true, count: expiring.length, message: `נמצאו ${expiring.length} עובדים עם חוזים שפגים בקרוב` };
}

async function runSessionCleanup(): Promise<{ success: boolean; message: string }> {
  await db.execute(sql.raw(
    `DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '7 days'`
  )).catch(() => {/* ignore if table doesn't exist */});
  logger.info("admin_session_cleanup_triggered");
  return { success: true, message: "ניקוי סשנים הושלם" };
}

async function runNotificationCleanup(): Promise<{ success: boolean; count: number; message: string }> {
  const result = await db.execute(sql.raw(`
    UPDATE notifications
    SET deleted_at = NOW()
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND deleted_at IS NULL
  `));
  const count = result.rowCount ?? 0;
  logger.info("admin_notification_cleanup_triggered", { deleted: count });
  return { success: true, count, message: `הועברו לארכיון ${count} התראות ישנות` };
}

router.post("/admin/run-backup", requireSuperAdmin as any, async (_req, res) => {
  try {
    const result = await runBackup();
    res.json(result);
  } catch (err: any) {
    logger.error("admin_backup_error", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/run-payment-reminders", requireSuperAdmin as any, async (_req, res) => {
  try {
    const result = await runPaymentReminders();
    res.json(result);
  } catch (err: any) {
    logger.error("admin_payment_reminders_error", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/run-low-stock-check", requireSuperAdmin as any, async (_req, res) => {
  try {
    const result = await runLowStockCheck();
    res.json(result);
  } catch (err: any) {
    logger.error("admin_low_stock_check_error", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/run-employee-alerts", requireSuperAdmin as any, async (_req, res) => {
  try {
    const result = await runEmployeeAlerts();
    res.json(result);
  } catch (err: any) {
    logger.error("admin_employee_alerts_error", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/run-session-cleanup", requireSuperAdmin as any, async (_req, res) => {
  try {
    const result = await runSessionCleanup();
    res.json(result);
  } catch (err: any) {
    logger.error("admin_session_cleanup_error", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/admin/run-notification-cleanup", requireSuperAdmin as any, async (_req, res) => {
  try {
    const result = await runNotificationCleanup();
    res.json(result);
  } catch (err: any) {
    logger.error("admin_notification_cleanup_error", { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/admin/cron-status", requireSuperAdmin as any, async (_req, res) => {
  res.json({
    jobs: [
      { name: "db_backup", schedule: "0 2 * * *", description: "גיבוי מסד נתונים", triggerUrl: "/api/admin/run-backup" },
      { name: "payment_reminders", schedule: "0 9 * * 1-5", description: "תזכורות תשלום", triggerUrl: "/api/admin/run-payment-reminders" },
      { name: "low_stock_check", schedule: "0 */6 * * *", description: "בדיקת מלאי נמוך", triggerUrl: "/api/admin/run-low-stock-check" },
      { name: "employee_alerts", schedule: "0 8 * * 1", description: "התראות עובדים", triggerUrl: "/api/admin/run-employee-alerts" },
      { name: "session_cleanup", schedule: "0 3 * * *", description: "ניקוי סשנים", triggerUrl: "/api/admin/run-session-cleanup" },
      { name: "notification_cleanup", schedule: "30 3 * * *", description: "ארכוב התראות", triggerUrl: "/api/admin/run-notification-cleanup" },
    ],
    timezone: "Asia/Jerusalem",
    serverTime: new Date().toISOString(),
  });
});

export default router;
