import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");

interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  source?: string;
  stackTrace?: string;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 10000;

function normalizeLevel(level: string): LogEntry["level"] {
  const l = level.toLowerCase();
  if (l.includes("fatal") || l.includes("critical")) return "fatal";
  if (l.includes("err")) return "error";
  if (l.includes("warn")) return "warn";
  if (l.includes("debug") || l.includes("trace") || l.includes("verbose")) return "debug";
  return "info";
}

function parseLogLine(line: string, source?: string): LogEntry | null {
  if (!line.trim()) return null;

  try {
    const json = JSON.parse(line);
    return { timestamp: json.timestamp || json.time || new Date().toISOString(), level: normalizeLevel(json.level || json.severity || "info"), message: json.message || json.msg || line, source: source || json.service || json.source };
  } catch {}

  const bracketMatch = line.match(/\[(\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*Z?)\]\s*\[(\w+)\]\s*(.*)/);
  if (bracketMatch) return { timestamp: bracketMatch[1], level: normalizeLevel(bracketMatch[2]), message: bracketMatch[3], source };

  const spaceMatch = line.match(/(\d{4}[-/]\d{2}[-/]\d{2}\s\d{2}:\d{2}:\d{2})\s+(DEBUG|INFO|WARN|ERROR|FATAL)\s+(.*)/i);
  if (spaceMatch) return { timestamp: spaceMatch[1], level: normalizeLevel(spaceMatch[2]), message: spaceMatch[3], source };

  if (line.match(/^\s+at\s+/) || line.match(/^Error:/)) return { timestamp: new Date().toISOString(), level: "error", message: line, source, stackTrace: line };

  let detectedLevel: LogEntry["level"] = "info";
  if (/\b(error|ERR|Error)\b/i.test(line)) detectedLevel = "error";
  else if (/\b(warn|WARNING|Warn)\b/i.test(line)) detectedLevel = "warn";
  else if (/\b(debug|DEBUG)\b/i.test(line)) detectedLevel = "debug";

  return { timestamp: new Date().toISOString(), level: detectedLevel, message: line, source };
}

function addLog(entry: LogEntry) {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
}

export async function parseLogFile(params: { filePath: string }): Promise<{ success: boolean; output: string; entries?: LogEntry[] }> {
  const fullPath = path.isAbsolute(params.filePath) ? params.filePath : path.join(WORKSPACE_DIR, params.filePath);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const entries: LogEntry[] = [];
    for (const line of content.split("\n")) {
      const entry = parseLogLine(line, params.filePath);
      if (entry) { entries.push(entry); addLog(entry); }
    }
    return { success: true, output: `Parsed ${entries.length} log entries from ${params.filePath}`, entries };
  } catch (e: any) {
    return { success: false, output: `Failed to parse log file: ${e.message}` };
  }
}

export async function queryLogs(params: { level?: string[]; source?: string; search?: string; from?: string; to?: string; limit?: number }): Promise<{ success: boolean; output: string; entries?: LogEntry[] }> {
  let results = [...logs];

  if (params.level?.length) results = results.filter(l => params.level!.includes(l.level));
  if (params.source) results = results.filter(l => l.source?.toLowerCase().includes(params.source!.toLowerCase()));
  if (params.search) { const s = params.search.toLowerCase(); results = results.filter(l => l.message.toLowerCase().includes(s)); }
  if (params.from) results = results.filter(l => l.timestamp >= params.from!);
  if (params.to) results = results.filter(l => l.timestamp <= params.to!);

  const limited = results.slice(-(params.limit || 100));
  return { success: true, output: limited.map(l => `[${l.level.toUpperCase()}] ${l.timestamp} ${l.source ? `(${l.source}) ` : ""}${l.message}`).join("\n") || "No logs match the filter.", entries: limited };
}

export async function getLogStats(): Promise<{ success: boolean; output: string; stats?: any }> {
  const byLevel: Record<string, number> = {};
  for (const log of logs) byLevel[log.level] = (byLevel[log.level] || 0) + 1;

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const errorsLast5Min = logs.filter(l => l.level === "error" && l.timestamp >= fiveMinAgo).length;

  const stats = { total: logs.length, byLevel, errorsLast5Min };
  return { success: true, output: `Log Stats:\n- Total: ${stats.total}\n- By level: ${JSON.stringify(byLevel)}\n- Errors (last 5min): ${errorsLast5Min}`, stats };
}

export async function captureOutput(params: { data: string; stream?: string }): Promise<{ success: boolean; output: string }> {
  const lines = params.data.split("\n").filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const entry = parseLogLine(line, params.stream === "stderr" ? "stderr" : "stdout");
    if (entry) { addLog(entry); count++; }
  }
  return { success: true, output: `Captured ${count} log entries from ${params.stream || "stdout"}` };
}

export async function clearLogs(): Promise<{ success: boolean; output: string }> {
  const count = logs.length;
  logs.length = 0;
  return { success: true, output: `Cleared ${count} log entries` };
}

export async function tailLogFile(params: { filePath: string; lines?: number }): Promise<{ success: boolean; output: string; entries?: LogEntry[] }> {
  const fullPath = path.isAbsolute(params.filePath) ? params.filePath : path.join(WORKSPACE_DIR, params.filePath);
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const allLines = content.split("\n").filter(Boolean);
    const tailLines = allLines.slice(-(params.lines || 50));
    const entries: LogEntry[] = [];
    for (const line of tailLines) {
      const entry = parseLogLine(line, params.filePath);
      if (entry) entries.push(entry);
    }
    return { success: true, output: entries.map(l => `[${l.level.toUpperCase()}] ${l.message}`).join("\n"), entries };
  } catch (e: any) {
    return { success: false, output: `Failed to tail log: ${e.message}` };
  }
}

export const LOG_VIEWER_TOOLS = [
  { name: "parse_log_file", description: "Parse a log file and add entries to the log buffer. Supports JSON logs, bracket format, and plain text.", input_schema: { type: "object" as const, properties: { filePath: { type: "string", description: "Path to log file (relative to workspace or absolute)" } }, required: ["filePath"] as string[] } },
  { name: "query_logs", description: "Query the log buffer with filters: level, source, search text, time range, limit", input_schema: { type: "object" as const, properties: { level: { type: "array", items: { type: "string", enum: ["debug", "info", "warn", "error", "fatal"] }, description: "Filter by log levels" }, source: { type: "string" }, search: { type: "string", description: "Search text in messages" }, from: { type: "string", description: "ISO timestamp start" }, to: { type: "string", description: "ISO timestamp end" }, limit: { type: "number" } }, required: [] as string[] } },
  { name: "get_log_stats", description: "Get log statistics: total count, breakdown by level, recent errors", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "capture_output", description: "Capture process stdout/stderr output into the log buffer", input_schema: { type: "object" as const, properties: { data: { type: "string" }, stream: { type: "string", enum: ["stdout", "stderr"] } }, required: ["data"] as string[] } },
  { name: "clear_logs", description: "Clear all entries from the log buffer", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "tail_log_file", description: "Read the last N lines of a log file (like tail -n)", input_schema: { type: "object" as const, properties: { filePath: { type: "string" }, lines: { type: "number", description: "Number of lines from end (default 50)" } }, required: ["filePath"] as string[] } },
];