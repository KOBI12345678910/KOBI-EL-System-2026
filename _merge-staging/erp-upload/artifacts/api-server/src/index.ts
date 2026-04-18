import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app, { deferredStartup } from "./app";
import { startScheduledTriggers } from "./lib/notification-service";
import { logger } from "./lib/logger";
import { ensureProductionIndexes } from "./lib/production-indexes";
import { seedKimiProvider } from "./lib/kimi-seed";
import { seedAiModels } from "./lib/ai-models-seed";
import { ensureAdminUser } from "./lib/admin-seed";
import { startSmartAlertsJob } from "./routes/ai-smart-alerts";
import { runStartupMigrations } from "./lib/startup-migrations";
import { pool, connectWithRetry } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, "..", "scripts");

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

function runDbBackup() {
  const script = path.join(SCRIPTS_DIR, "backup-db.sh");
  execFile("bash", [script], { env: process.env }, (err, stdout, stderr) => {
    if (err) {
      logger.error("db_backup_failed", { error: err.message, stderr });
    } else {
      logger.info("db_backup_succeeded", { output: stdout.trim() });
    }
  });
}

function startDbBackupCron() {
  const now = new Date();
  const msUntilNextHour =
    (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
  setTimeout(() => {
    runDbBackup();
    setInterval(runDbBackup, 60 * 60 * 1000).unref();
  }, msUntilNextHour).unref();
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

const server = app.listen(port, () => {
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;
  logger.info("server_started", { port });

  startMemoryMonitor();
  startDbBackupCron();

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

    startScheduledTriggers();

    ensureAdminUser().catch((err: Error) =>
      logger.error("admin_seed_error", { error: err.message }),
    );

    seedKimiProvider().catch((err: Error) =>
      logger.error("kimi_seed_error", { error: err.message }),
    );

    seedAiModels().catch((err: Error) =>
      logger.error("ai_models_seed_error", { error: err.message }),
    );
  }, 3_000);

  setTimeout(() => {
    ensureProductionIndexes()
      .then(() => logger.info("production_indexes_ensured"))
      .catch((err: Error) =>
        logger.error("production_indexes_failed", { error: err.message }),
      );

    startSmartAlertsJob(6 * 60 * 60 * 1000);
  }, 30_000);
});

function gracefulShutdown(signal: string) {
  logger.info("graceful_shutdown_initiated", { signal });
  server.close(() => {
    logger.info("http_server_closed");
    pool.end().then(() => {
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
