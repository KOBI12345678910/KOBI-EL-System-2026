import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename_cjs = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_cjs = typeof __dirname !== "undefined" ? __dirname : path.dirname(__filename_cjs);

const LOG_DIR = path.join(__dirname_cjs, "../../logs");
const LOG_PATH = path.join(LOG_DIR, "error.log");

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (_e) {
  // ignore - directory may already exist
}

function isPoolExhaustedError(err: Error): boolean {
  const msg = err.message ?? "";
  return (
    msg.includes("timeout") &&
    (msg.includes("pool") || msg.includes("connection"))
  ) || msg.includes("Connection pool exhausted") || msg.includes("timeout exceeded when trying to connect");
}

export function globalErrorHandler(
  err: Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (isPoolExhaustedError(err)) {
    logger.error("[Pool] connection exhausted/error", {
      message: err.message,
      path: req.originalUrl,
      method: req.method,
    });
    if (!res.headersSent) {
      res.set("Retry-After", "3");
      res.status(503).json({ error: "Server busy, please retry", retryAfterMs: 3000 });
    }
    return;
  }

  const status = err.status || err.statusCode || 500;

  let errorCode = "UNHANDLED_ERROR";
  if (err.name === "ValidationError") errorCode = "VALIDATION_ERROR";
  else if (err.name === "SequelizeDatabaseError" || err.name === "QueryFailedError") errorCode = "DB_ERROR";

  const logLine = `[${new Date().toISOString()}] ${errorCode} ${req.method} ${req.originalUrl} ${status} ${err.message}\n`;
  fs.appendFile(LOG_PATH, logLine, e => { if (e) console.error("Error log write failed", e); });

  logger.error("unhandled_error", {
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    status,
  });

  if (res.headersSent) {
    return;
  }

  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message,
    errorCode,
  });
}
