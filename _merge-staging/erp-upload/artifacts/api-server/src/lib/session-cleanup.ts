import { cleanExpiredSessions } from "./auth";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export function startSessionCleanup() {
  async function run() {
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

  run();
  setInterval(run, CLEANUP_INTERVAL_MS);
}
