import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

const __filename_cjs = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_cjs = typeof __dirname !== "undefined" ? __dirname : path.dirname(__filename_cjs);
const LOG_DIR = path.join(process.cwd(), "logs");const logPath = path.join(LOG_DIR, "request.log");

const LOG_BUFFER: string[] = [];
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 50;
const SLOW_REQUEST_THRESHOLD_MS = 2000;

function flushLogs() {
  if (LOG_BUFFER.length === 0) return;
  const batch = LOG_BUFFER.splice(0, LOG_BUFFER.length).join("");
  fs.appendFile(logPath, batch, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Request log error:", err.message);
    }
  });
}

setInterval(flushLogs, FLUSH_INTERVAL_MS).unref();

const SKIP_PATHS = new Set(["/healthz", "/api/healthz"]);

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (SKIP_PATHS.has(req.path)) return next();

  const start = process.hrtime();
  res.on("finish", () => {
    const [sec, nano] = process.hrtime(start);
    const responseTimeMs = sec * 1e3 + nano / 1e6;
    const responseTime = responseTimeMs.toFixed(1);
    const logLine = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms\n`;
    LOG_BUFFER.push(logLine);
    if (LOG_BUFFER.length >= MAX_BUFFER_SIZE) flushLogs();

    logger.info(`${req.method} ${req.path} → ${res.statusCode} in ${responseTime}ms`);

    if (responseTimeMs >= SLOW_REQUEST_THRESHOLD_MS) {
      logger.slowQuery(
        `${req.method} ${req.originalUrl}`,
        responseTimeMs,
        {
          status_code: res.statusCode,
          type: "slow_api_request",
        }
      );
    }
  });
  next();
}
