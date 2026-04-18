import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.join(__dirname, "../../logs/request.log");

const LOG_BUFFER: string[] = [];
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 50;

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
    const responseTime = (sec * 1e3 + nano / 1e6).toFixed(1);
    LOG_BUFFER.push(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms\n`);
    if (LOG_BUFFER.length >= MAX_BUFFER_SIZE) flushLogs();
  });
  next();
}
