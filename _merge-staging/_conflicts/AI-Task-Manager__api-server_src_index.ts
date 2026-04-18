import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cron from "node-cron";
import app, { deferredStartup } from "./app";
import { startScheduledTriggers } from "./lib/notification-service";
import { logger } from "./lib/logger";
import { ensureProductionIndexes } from "./lib/production-indexes";
import { seedKimiProvider } from "./lib/kimi-seed";
import { seedAiModels } from "./lib/ai-models-seed";
import { ensureAdminUser } from "./lib/admin-seed";
import { startSmartAlertsJob } from "./routes/ai-smart-alerts";
import { startPermitExpirationScheduler } from "./routes/hse-routes";
import { runStartupMigrations } from "./lib/startup-migrations";
import { ServerHealthMonitorService } from "./services/server-health-monitor";
import { pool, backgroundPool, connectWithRetry, startPoolMonitor } from "@workspace/db";
import type { QueryConfig, QueryResultRow } from "pg";
import { SLOW_QUERY_THRESHOLD_MS } from "./lib/logger";

const __filename_cjs = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_cjs = typeof __dirname !== "undefined" ? __dirname : path.dirname(__filename_cjs);
const SCRIPTS_DIR = path.resolve(__dirname_cjs, "..", "scripts");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

process.on("uncaughtException", (err) => {
  const code = (err as NodeJS.ErrnoException).code;
  logger.error("uncaught_exception", {
    error: err.message,
    stack: err.stack,
    code,
  });

  if (err.message?.includes("ENOMEM") || err.message?.includes("allocation failed")) {
    logger.error("fatal_oom_shutting_down");
    process.exit(1);
  }

  if (code === "EMFILE") {
    logger.error("fatal_emfile_too_many_open_files_shutting_down");
    process.exit(1);
  }

  if (code === "EADDRINUSE") {
    logger.error("fatal_eaddrinuse_port_in_use_shutting_down", { port });
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

function startMemoryMonitor() {
  const MEMORY_WARN_BYTES = 1.5 * 1024 * 1024 * 1024;
  setInterval(() => {
    const { rss } = process.memoryUsage();
    if (rss > MEMORY_WARN_BYTES) {
      logger.warn("high_memory_usage", {
        rss_mb: Math.round(rss / 1024 / 1024),
        threshold_mb: Math.round(MEMORY_WARN_BYTES / 1024 / 1024),
      });
    }
  }, 60_000).unref();
}

async function runDbBackupAndRecord() {
  const script = path.join(SCRIPTS_DIR, "backup-db.sh");
  logger.info("db_backup_scheduled_start");

  let backupId: number | null = null;
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const result = await client.query(
      `INSERT INTO system_backups (backup_type, status, location, triggered_by, started_at) VALUES ('database','in_progress','local','scheduler',NOW()) RETURNING id`
    );
    const firstRow = result.rows?.[0] as Record<string, unknown> | undefined;
    backupId = (typeof firstRow?.id === "number" ? firstRow.id : null);
  } catch { /* ignore if table not ready */ } finally {
    client?.release();
    client = undefined;
  }

  const startTime = Date.now();

  execFile("bash", [script], { env: process.env }, async (err, stdout, stderr) => {
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    let c: import("pg").PoolClient | undefined;
    try {
      c = await backgroundPool.connect();
      if (err) {
        logger.error("db_backup_failed", { error: err.message, stderr });
        if (backupId) {
          await c.query(
            `UPDATE system_backups SET status='failed', duration_seconds=$1, completed_at=NOW() WHERE id=$2`,
            [durationSec, backupId]
          ).catch(() => {});
        }
      } else {
        logger.info("db_backup_succeeded", { output: stdout.trim(), durationSec });
        if (backupId) {
          await c.query(
            `UPDATE system_backups SET status='completed', duration_seconds=$1, completed_at=NOW() WHERE id=$2`,
            [durationSec, backupId]
          ).catch(() => {});
        }
      }
    } catch { /* ignore */ } finally {
      c?.release();
    }
  });
}


async function runPaymentReminders(): Promise<void> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const result = await client.query(`
      SELECT id, customer_name, invoice_number, total_amount, due_date
      FROM customer_invoices
      WHERE status NOT IN ('paid', 'cancelled')
        AND due_date < NOW()
        AND (deleted_at IS NULL OR deleted_at > NOW())
      LIMIT 50
    `);
    const overdue = result.rows as Array<Record<string, unknown>>;
    if (overdue.length > 0) {
      for (const inv of overdue) {
        await client.query(`
          INSERT INTO notifications (type, title, message, priority, category, created_at)
          VALUES ('overdue_invoice', 'חשבונית פגת תוקף', $1, 'high', 'finance', NOW())
          ON CONFLICT DO NOTHING
        `, [`חשבונית ${String(inv.invoice_number || "")} מלקוח ${String(inv.customer_name || "")} פגת תוקף`])
          .catch(() => {});
      }
      logger.info("payment_reminders_sent", { count: overdue.length });
    }
  } catch (err: unknown) {
    logger.error("payment_reminders_failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    client?.release();
  }
}

async function runLowStockCheck(): Promise<void> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const result = await client.query(`
      SELECT id, material_name, current_stock, reorder_point, unit
      FROM raw_materials
      WHERE current_stock IS NOT NULL
        AND reorder_point IS NOT NULL
        AND CAST(current_stock AS numeric) <= CAST(reorder_point AS numeric)
        AND (deleted_at IS NULL OR deleted_at > NOW())
      LIMIT 50
    `);
    const lowItems = result.rows as Array<Record<string, unknown>>;
    if (lowItems.length > 0) {
      for (const item of lowItems) {
        await client.query(`
          INSERT INTO notifications (type, title, message, priority, category, created_at, metadata)
          VALUES ('low_stock', 'מלאי נמוך', $1, 'high', 'inventory', NOW(), $2)
          ON CONFLICT DO NOTHING
        `, [
          `חומר גלם ${String(item.material_name || "")} — מלאי נוכחי: ${String(item.current_stock || 0)} ${String(item.unit || "")}`,
          JSON.stringify({ materialId: Number(item.id || 0) }),
        ]).catch(() => {});
      }
      logger.info("low_stock_alerts_sent", { count: lowItems.length });
    }
  } catch (err: unknown) {
    logger.error("low_stock_check_failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    client?.release();
  }
}

async function runEmployeeAlerts(): Promise<void> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const result = await client.query(`
      SELECT id, first_name, last_name, end_date
      FROM employees
      WHERE end_date IS NOT NULL
        AND end_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        AND (deleted_at IS NULL OR deleted_at > NOW())
      LIMIT 20
    `);
    const expiring = result.rows as Array<Record<string, unknown>>;
    if (expiring.length > 0) {
      for (const emp of expiring) {
        await client.query(`
          INSERT INTO notifications (type, title, message, priority, category, created_at)
          VALUES ('employee_contract_expiring', 'חוזה עובד פג תוקף בקרוב', $1, 'normal', 'hr', NOW())
          ON CONFLICT DO NOTHING
        `, [`עובד ${String(emp.first_name || "")} ${String(emp.last_name || "")} — חוזה פג ב-${String(emp.end_date || "")}`])
          .catch(() => {});
      }
      logger.info("employee_alerts_sent", { count: expiring.length });
    }
  } catch (err: unknown) {
    logger.error("employee_alerts_failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    client?.release();
  }
}

async function runSessionCleanup(): Promise<void> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    await client.query(`DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '7 days'`).catch(() => {});
    logger.info("session_cleanup_complete");
  } catch (err: unknown) {
    logger.error("session_cleanup_failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    client?.release();
  }
}

async function runNotificationCleanup(): Promise<void> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const result = await client.query(`
      UPDATE notifications
      SET deleted_at = NOW()
      WHERE created_at < NOW() - INTERVAL '90 days'
        AND deleted_at IS NULL
    `);
    logger.info("notification_cleanup_complete", { deleted: result.rowCount });
  } catch (err: unknown) {
    logger.error("notification_cleanup_failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    client?.release();
  }
}

function startAllCronJobs() {
  const TZ = "Asia/Jerusalem";

  // Daily backup at 02:00
  cron.schedule("0 2 * * *", () => runDbBackupAndRecord(), { timezone: TZ });

  // Session cleanup at 03:00
  cron.schedule("0 3 * * *", () => runSessionCleanup(), { timezone: TZ });

  // Notification archive/cleanup at 03:30
  cron.schedule("30 3 * * *", () => runNotificationCleanup(), { timezone: TZ });

  // Payment reminders at 09:00 Mon-Fri
  cron.schedule("0 9 * * 1-5", () => runPaymentReminders(), { timezone: TZ });

  // Low-stock check every 6 hours
  cron.schedule("0 */6 * * *", () => runLowStockCheck(), { timezone: TZ });

  // Employee alerts at 08:00 Mon
  cron.schedule("0 8 * * 1", () => runEmployeeAlerts(), { timezone: TZ });

  logger.info("all_cron_jobs_scheduled", {
    jobs: ["db_backup@02:00", "session_cleanup@03:00", "notification_cleanup@03:30", "payment_reminders@09:00(weekdays)", "low_stock@every6h", "employee_alerts@08:00(monday)"],
    timezone: TZ,
  });
}

async function verifyDbConnectivity(maxAttempts: number, delayMs: number): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client: import("pg").PoolClient | undefined;
    try {
      client = await connectWithRetry();
      await client.query("SELECT 1");
      logger.info("db_connectivity_verified", { attempt });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("db_connectivity_attempt_failed", { attempt, maxAttempts, error: msg });
      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    } finally {
      client?.release();
    }
  }
  logger.error("db_connectivity_failed_after_retries", { maxAttempts });
  return false;
}

function instrumentDbPool() {
  const originalQuery = pool.query.bind(pool);

  function timedQuery<R extends QueryResultRow = QueryResultRow>(
    queryTextOrConfig: string | QueryConfig<unknown[]>,
    values?: unknown[],
  ): Promise<import("pg").QueryResult<R>> {
    const start = Date.now();
    const queryText =
      typeof queryTextOrConfig === "string"
        ? queryTextOrConfig
        : queryTextOrConfig.text;
    const promise = (
      values !== undefined
        ? originalQuery(queryTextOrConfig as string, values)
        : originalQuery(queryTextOrConfig)
    ) as Promise<import("pg").QueryResult<R>>;
    return promise.then((result) => {
      const durationMs = Date.now() - start;
      if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
        logger.slowQuery(queryText, durationMs, { rows: result.rowCount ?? 0 });
      }
      return result;
    });
  }

  pool.query = timedQuery as unknown as typeof pool.query;
}

const server = app.listen(port, () => {
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;
  instrumentDbPool();
  logger.info("server_started", { port });

  startMemoryMonitor();
  startPoolMonitor();
  startAllCronJobs();

  setTimeout(async () => {
    const connected = await verifyDbConnectivity(3, 2000);
    if (!connected) {
      logger.error("db_not_available_startup_exiting");
      process.exit(1);
    }

    try {
      await runStartupMigrations();
      await deferredStartup();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("startup_sequence_error", { error: msg });
    }

    const parsedInterval = parseInt(process.env["HEALTH_MONITOR_INTERVAL_MS"] ?? "120000", 10);
    const healthMonitorIntervalMs = Number.isNaN(parsedInterval) || parsedInterval < 1000 ? 120_000 : parsedInterval;
    const healthMonitor = ServerHealthMonitorService.getInstance({ intervalMs: healthMonitorIntervalMs });
    healthMonitor.start();

    const stagger = () => Math.floor(Math.random() * 30_000);

    setTimeout(() => startScheduledTriggers(), stagger());

    setTimeout(() => {
      ensureAdminUser().catch((err: Error) =>
        logger.error("admin_seed_error", { error: err.message }),
      );
    }, stagger());

    setTimeout(() => {
      seedKimiProvider().catch((err: Error) =>
        logger.error("kimi_seed_error", { error: err.message }),
      );
    }, stagger());

    setTimeout(() => {
      seedAiModels().catch((err: Error) =>
        logger.error("ai_models_seed_error", { error: err.message }),
      );
    }, stagger());
  }, 3_000);

  setTimeout(() => {
    ensureProductionIndexes()
      .then(() => logger.info("production_indexes_ensured"))
      .catch((err: Error) =>
        logger.error("production_indexes_failed", { error: err.message }),
      );

    const stagger = () => Math.floor(Math.random() * 30_000);
    setTimeout(() => startSmartAlertsJob(6 * 60 * 60 * 1000), stagger());
    setTimeout(() => startPermitExpirationScheduler(), stagger());
  }, 30_000);
});

function gracefulShutdown(signal: string) {
  logger.info("graceful_shutdown_initiated", { signal });
  ServerHealthMonitorService.getInstance().stop();
  server.close(() => {
    logger.info("http_server_closed");
    Promise.all([pool.end(), backgroundPool.end()]).then(() => {
      logger.info("db_pool_closed");
      process.exit(0);
    }).catch(() => process.exit(1));
  });
  setTimeout(() => {
    logger.error("graceful_shutdown_timeout_forcing_exit");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
