import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import * as path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const SLOW_QUERY_THRESHOLD_MS = 2000;
const currentLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json(),
);

const appLogger = createLogger({
  level: currentLevel,
  format: jsonFormat,
  transports: [
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "app-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "10m",
      maxFiles: "5d",
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "errors-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "10m",
      maxFiles: "14d",
      level: "error",
    }),
  ],
});

const slowQueryLogger = createLogger({
  level: "warn",
  format: jsonFormat,
  transports: [
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "slow-queries-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "10m",
      maxFiles: "7d",
    }),
  ],
});

const criticalLogger = createLogger({
  level: "error",
  format: jsonFormat,
  transports: [
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "critical-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "10m",
      maxFiles: "30d",
    }),
  ],
});

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    appLogger.debug(message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    appLogger.info(message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    appLogger.warn(message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    appLogger.error(message, meta);
  },

  slowQuery(query: string, durationMs: number, meta?: Record<string, unknown>) {
    if (durationMs < SLOW_QUERY_THRESHOLD_MS) return;
    const entry = {
      query: query.slice(0, 300),
      duration_ms: durationMs,
      threshold_ms: SLOW_QUERY_THRESHOLD_MS,
      ...meta,
    };
    appLogger.warn("slow_query_detected", entry);
    slowQueryLogger.warn("slow_query_detected", entry);
  },

  critical(message: string, meta?: Record<string, unknown>) {
    const entry = { critical: true, ...meta };
    appLogger.error(message, entry);
    criticalLogger.error(message, entry);
  },

  apiError(method: string, apiPath: string, statusCode: number, error: unknown, userId?: number) {
    appLogger.error("api_error", {
      method,
      path: apiPath,
      status_code: statusCode,
      error: error instanceof Error ? error.message : String(error),
      user_id: userId,
    });
  },

  startup(message: string, meta?: Record<string, unknown>) {
    appLogger.info(message, { phase: "startup", ...meta });
  },
};

export { SLOW_QUERY_THRESHOLD_MS };
