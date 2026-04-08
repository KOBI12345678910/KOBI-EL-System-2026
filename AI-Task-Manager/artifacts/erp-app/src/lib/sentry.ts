import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENV = import.meta.env.MODE || "development";

export function initSentry() {
  if (!SENTRY_DSN) {
    if (ENV === "production") {
      console.warn("[Sentry] VITE_SENTRY_DSN is not set — error reporting is disabled in production.");
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENV,
    tracesSampleRate: ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  });
}

export function setSentryUser(userId: number, username: string, role: string) {
  if (!SENTRY_DSN) return;
  Sentry.setUser({ id: String(userId), username, role });
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

export { Sentry };
