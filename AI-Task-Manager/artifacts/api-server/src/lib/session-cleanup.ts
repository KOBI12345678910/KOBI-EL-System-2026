import { cleanExpiredSessions } from "./auth";
import { logger } from "./logger";

export async function runSessionCleanupOnce(): Promise<void> {
  try {
    const count = await cleanExpiredSessions();
    if (count > 0) {
      logger.info("Cleaned expired sessions", { count });
    }
  } catch (err) {
    logger.error("Session cleanup failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function startSessionCleanup() {
  logger.info("session_cleanup_managed_by_daily_cron");
}
