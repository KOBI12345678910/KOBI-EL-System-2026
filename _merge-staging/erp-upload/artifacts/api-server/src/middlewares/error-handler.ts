import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function globalErrorHandler(
  err: Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = err.status || err.statusCode || 500;

  const logPath = path.join(__dirname, "../../logs/error.log");
  let errorCode = "UNHANDLED_ERROR";
  if (err.name === "ValidationError") errorCode = "VALIDATION_ERROR";
  else if (err.name === "SequelizeDatabaseError" || err.name === "QueryFailedError") errorCode = "DB_ERROR";

  const logLine = `[${new Date().toISOString()}] ${errorCode} ${req.method} ${req.originalUrl} ${status} ${err.message}\n`;
  fs.appendFile(logPath, logLine, e => { if (e) console.error("Error log write failed", e); });

  logger.error(errorCode.toLowerCase(), {
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    status,
  });

  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message,
    errorCode,
  });
}
