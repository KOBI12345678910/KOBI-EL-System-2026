import * as Sentry from "@sentry/node";
import { logger } from "./logger";

const SENTRY_DSN = process.env.SENTRY_DSN;
const NODE_ENV = process.env.NODE_ENV || "development";

export function initSentry() {
  if (!SENTRY_DSN) {
    logger.info("sentry_disabled", { reason: "SENTRY_DSN not configured" });
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,
    tracesSampleRate: NODE_ENV === "production" ? 0.2 : 1.0,
    sendDefaultPii: false,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
  });

  logger.startup("sentry_initialized", { environment: NODE_ENV });
}

export function setSentryUser(userId: number, role: string) {
  if (!SENTRY_DSN) return;
  Sentry.setUser({ id: String(userId), role });
}

export function clearSentryUser() {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function setupSentryErrorHandler(app: import("express").Express) {
  if (!SENTRY_DSN) return;
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
