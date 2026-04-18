import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";
const CACHE_DIR = path.join(WORKSPACE, ".agent", "llm-cache");
const METRICS_FILE = path.join(WORKSPACE, ".agent", "perf-metrics.json");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface CacheEntry {
  hash: string;
  prompt: string;
  response: any;
  createdAt: string;
  ttl: number;
  hitCount: number;
  tokens?: number;
  latencyMs?: number;
}

interface ToolMetric {
  name: string;
  totalCalls: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  errors: number;
  lastCall: string;
}

interface PerfMetrics {
  toolMetrics: Record<string, ToolMetric>;
  cacheHits: number;
  cacheMisses: number;
  totalLLMCalls: number;
  totalLLMMs: number;
  avgLLMMs: number;
  totalToolCalls: number;
  totalToolMs: number;
  parallelBatches: number;
  tokensSaved: number;
  startedAt: string;
}

let metrics: PerfMetrics = {
  toolMetrics: {},
  cacheHits: 0,
  cacheMisses: 0,
  totalLLMCalls: 0,
  totalLLMMs: 0,
  avgLLMMs: 0,
  totalToolCalls: 0,
  totalToolMs: 0,
  parallelBatches: 0,
  tokensSaved: 0,
  startedAt: new Date().toISOString(),
};

function loadMetrics() {
  try {
    if (fs.existsSync(METRICS_FILE)) {
      metrics = JSON.parse(fs.readFileSync(METRICS_FILE, "utf-8"));
    }
  } catch {}
}

function saveMetrics() {
  try {
    const dir = path.dirname(METRICS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
  } catch {}
}

loadMetrics();

function hashPrompt(system: string, messages: any[]): string {
  const content = JSON.stringify({ system, messages });
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function cacheGet(params: { system: string; messages: any[] }): Promise<{ success: boolean; output: string; cached?: boolean; response?: any }> {
  ensureCacheDir();
  const hash = hashPrompt(params.system, params.messages);
  const cachePath = path.join(CACHE_DIR, `${hash}.json`);

  if (!fs.existsSync(cachePath)) {
    metrics.cacheMisses++;
    saveMetrics();
    return { success: true, output: "Cache miss", cached: false };
  }

  try {
    const entry: CacheEntry = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const age = Date.now() - new Date(entry.createdAt).getTime();
    if (age > entry.ttl) {
      fs.unlinkSync(cachePath);
      metrics.cacheMisses++;
      saveMetrics();
      return { success: true, output: "Cache expired", cached: false };
    }

    entry.hitCount++;
    fs.writeFileSync(cachePath, JSON.stringify(entry));
    metrics.cacheHits++;
    saveMetrics();
    return { success: true, output: `Cache hit (${entry.hitCount} hits)`, cached: true, response: entry.response };
  } catch {
    metrics.cacheMisses++;
    saveMetrics();
    return { success: true, output: "Cache read error", cached: false };
  }
}

export async function cacheSet(params: { system: string; messages: any[]; response: any; ttl?: number; latencyMs?: number }): Promise<{ success: boolean; output: string }> {
  ensureCacheDir();
  const hash = hashPrompt(params.system, params.messages);
  const cachePath = path.join(CACHE_DIR, `${hash}.json`);

  const entry: CacheEntry = {
    hash,
    prompt: JSON.stringify(params.messages).slice(0, 200),
    response: params.response,
    createdAt: new Date().toISOString(),
    ttl: params.ttl || 3600000,
    hitCount: 0,
    latencyMs: params.latencyMs,
  };

  fs.writeFileSync(cachePath, JSON.stringify(entry));
  return { success: true, output: `Cached response (hash: ${hash}, TTL: ${entry.ttl}ms)` };
}

export async function cacheClear(params: { olderThanMs?: number }): Promise<{ success: boolean; output: string }> {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith(".json"));
  let removed = 0;
  const cutoff = params.olderThanMs ? Date.now() - params.olderThanMs : 0;

  for (const file of files) {
    const filePath = path.join(CACHE_DIR, file);
    try {
      if (params.olderThanMs) {
        const entry: CacheEntry = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (new Date(entry.createdAt).getTime() < cutoff) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } else {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch { fs.unlinkSync(filePath); removed++; }
  }

  return { success: true, output: `Cleared ${removed} cache entries` };
}

export async function getCacheStats(params: {}): Promise<{ success: boolean; output: string }> {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith(".json"));
  let totalSize = 0;
  let totalHits = 0;
  let oldest = Date.now();
  let newest = 0;

  for (const file of files) {
    try {
      const filePath = path.join(CACHE_DIR, file);
      const stat = fs.statSync(filePath);
      totalSize += stat.size;
      const entry: CacheEntry = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      totalHits += entry.hitCount;
      const ts = new Date(entry.createdAt).getTime();
      if (ts < oldest) oldest = ts;
      if (ts > newest) newest = ts;
    } catch {}
  }

  const hitRate = (metrics.cacheHits + metrics.cacheMisses) > 0
    ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(1)
    : "0";

  const lines = [
    "## סטטיסטיקות קאש LLM",
    "",
    `📦 רשומות: ${files.length}`,
    `💾 גודל: ${(totalSize / 1024).toFixed(1)}KB`,
    `🎯 פגיעות: ${metrics.cacheHits}`,
    `❌ החטאות: ${metrics.cacheMisses}`,
    `📊 אחוז פגיעה: ${hitRate}%`,
    `🔄 סה"כ פגיעות ברשומות: ${totalHits}`,
    files.length > 0 ? `📅 טווח: ${new Date(oldest).toLocaleDateString("he-IL")} — ${new Date(newest).toLocaleDateString("he-IL")}` : "",
  ];

  return { success: true, output: lines.join("\n") };
}

export function recordToolMetric(toolName: string, durationMs: number, success: boolean) {
  if (!metrics.toolMetrics[toolName]) {
    metrics.toolMetrics[toolName] = {
      name: toolName, totalCalls: 0, totalMs: 0, avgMs: 0, minMs: Infinity, maxMs: 0, errors: 0, lastCall: "",
    };
  }
  const m = metrics.toolMetrics[toolName];
  m.totalCalls++;
  m.totalMs += durationMs;
  m.avgMs = m.totalMs / m.totalCalls;
  m.minMs = Math.min(m.minMs, durationMs);
  m.maxMs = Math.max(m.maxMs, durationMs);
  if (!success) m.errors++;
  m.lastCall = new Date().toISOString();

  metrics.totalToolCalls++;
  metrics.totalToolMs += durationMs;
  saveMetrics();
}

export function recordLLMCall(durationMs: number) {
  metrics.totalLLMCalls++;
  metrics.totalLLMMs += durationMs;
  metrics.avgLLMMs = metrics.totalLLMMs / metrics.totalLLMCalls;
  saveMetrics();
}

export function recordParallelBatch() {
  metrics.parallelBatches++;
  saveMetrics();
}

export async function getPerformanceMetrics(params: {}): Promise<{ success: boolean; output: string }> {
  loadMetrics();
  const uptime = Date.now() - new Date(metrics.startedAt).getTime();

  const topSlowest = Object.values(metrics.toolMetrics)
    .filter(m => m.totalCalls > 0)
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  const topCalled = Object.values(metrics.toolMetrics)
    .filter(m => m.totalCalls > 0)
    .sort((a, b) => b.totalCalls - a.totalCalls)
    .slice(0, 10);

  const topErrors = Object.values(metrics.toolMetrics)
    .filter(m => m.errors > 0)
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 5);

  const lines = [
    "## 📊 מדדי ביצועים — קובי AI",
    "",
    `⏱️ זמן פעילות: ${(uptime / 1000 / 60).toFixed(0)} דקות`,
    "",
    "### LLM",
    `🧠 קריאות LLM: ${metrics.totalLLMCalls}`,
    `⏱️ זמן ממוצע: ${metrics.avgLLMMs.toFixed(0)}ms`,
    `⏱️ זמן כולל: ${(metrics.totalLLMMs / 1000).toFixed(1)}s`,
    "",
    "### כלים",
    `🔧 קריאות כלים: ${metrics.totalToolCalls}`,
    `⏱️ זמן כולל: ${(metrics.totalToolMs / 1000).toFixed(1)}s`,
    `🔀 batches מקביליים: ${metrics.parallelBatches}`,
    "",
    "### קאש",
    `🎯 פגיעות: ${metrics.cacheHits}`,
    `❌ החטאות: ${metrics.cacheMisses}`,
    `💾 טוקנים שנחסכו: ~${metrics.tokensSaved}`,
    "",
    "### 🐢 10 כלים האיטיים ביותר (ממוצע)",
    ...topSlowest.map(m => `  ${m.name}: ${m.avgMs.toFixed(0)}ms (×${m.totalCalls})`),
    "",
    "### 🔥 10 כלים הנקראים ביותר",
    ...topCalled.map(m => `  ${m.name}: ×${m.totalCalls} (${(m.totalMs / 1000).toFixed(1)}s total)`),
    "",
    ...(topErrors.length > 0 ? [
      "### ⚠️ כלים עם שגיאות",
      ...topErrors.map(m => `  ${m.name}: ${m.errors} שגיאות מתוך ${m.totalCalls} קריאות`),
    ] : []),
  ];

  return { success: true, output: lines.join("\n") };
}

export async function resetPerformanceMetrics(params: {}): Promise<{ success: boolean; output: string }> {
  metrics = {
    toolMetrics: {},
    cacheHits: 0,
    cacheMisses: 0,
    totalLLMCalls: 0,
    totalLLMMs: 0,
    avgLLMMs: 0,
    totalToolCalls: 0,
    totalToolMs: 0,
    parallelBatches: 0,
    tokensSaved: 0,
    startedAt: new Date().toISOString(),
  };
  saveMetrics();
  return { success: true, output: "Performance metrics reset" };
}

export async function getSlowestTools(params: { limit?: number }): Promise<{ success: boolean; output: string }> {
  loadMetrics();
  const limit = params.limit || 20;
  const tools = Object.values(metrics.toolMetrics)
    .filter(m => m.totalCalls > 0)
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, limit);

  if (tools.length === 0) return { success: true, output: "אין עדיין מדדים" };

  const lines = tools.map((m, i) => {
    const bar = "█".repeat(Math.min(Math.round(m.avgMs / 100), 30));
    return `${i + 1}. ${m.name}: ${m.avgMs.toFixed(0)}ms avg | ${m.minMs.toFixed(0)}ms min | ${m.maxMs.toFixed(0)}ms max | ×${m.totalCalls} ${bar}`;
  });

  return { success: true, output: `## 🐢 כלים לפי זמן תגובה ממוצע\n\n${lines.join("\n")}` };
}

export function selectRelevantTools(task: string, allTools: Array<{ name: string; description: string; input_schema: any }>): Array<{ name: string; description: string; input_schema: any }> {
  const taskLower = task.toLowerCase();

  const CATEGORIES: Record<string, string[]> = {
    file: ["file", "read", "write", "create", "edit", "delete", "directory", "path"],
    terminal: ["terminal", "command", "run", "execute", "shell", "bash", "npm", "pnpm"],
    git: ["git", "commit", "branch", "push", "pull", "merge", "diff", "stash"],
    db: ["database", "sql", "query", "table", "schema", "migration", "db", "postgres"],
    search: ["search", "find", "grep", "locate", "חפש"],
    deploy: ["deploy", "build", "production", "publish"],
    test: ["test", "spec", "assert", "בדיקה"],
    lint: ["lint", "format", "prettier", "eslint"],
    scaffold: ["scaffold", "generate", "create", "template", "boilerplate"],
    network: ["http", "fetch", "api", "request", "url", "curl", "network"],
    security: ["security", "auth", "cors", "helmet", "csrf", "sanitize", "אבטחה"],
    vision: ["image", "screenshot", "ocr", "photo", "picture", "analyze_image", "תמונה", "צילום"],
    ui: ["component", "ui", "react", "form", "grid", "modal", "button", "ממשק"],
    cache: ["cache", "redis", "מטמון"],
    perf: ["performance", "speed", "optimize", "benchmark", "ביצועים", "מהירות"],
    i18n: ["translate", "i18n", "language", "תרגום", "שפה"],
    notification: ["notification", "alert", "email", "sms", "push", "התראה"],
    pdf: ["pdf", "document", "report", "דוח", "מסמך"],
    orchestrator: ["orchestrate", "agent", "parallel", "multi-agent", "סוכן", "מקביל"],
  };

  const matchedCategories = new Set<string>();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    for (const kw of keywords) {
      if (taskLower.includes(kw)) {
        matchedCategories.add(cat);
        break;
      }
    }
  }

  const alwaysInclude = ["file", "terminal", "search"];
  for (const cat of alwaysInclude) matchedCategories.add(cat);

  const TOOL_CATEGORY_MAP: Record<string, string> = {};
  for (const tool of allTools) {
    const name = tool.name.toLowerCase();
    const desc = tool.description.toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORIES)) {
      for (const kw of keywords) {
        if (name.includes(kw) || desc.includes(kw)) {
          TOOL_CATEGORY_MAP[tool.name] = cat;
          break;
        }
      }
      if (TOOL_CATEGORY_MAP[tool.name]) break;
    }
  }

  const selected = allTools.filter(tool => {
    const cat = TOOL_CATEGORY_MAP[tool.name];
    if (!cat) return true;
    return matchedCategories.has(cat);
  });

  const MAX_TOOLS = 80;
  if (selected.length > MAX_TOOLS) {
    const priorityTools = selected.filter(t => {
      const cat = TOOL_CATEGORY_MAP[t.name];
      return cat && matchedCategories.has(cat);
    });
    const remaining = selected.filter(t => !priorityTools.includes(t));
    return [...priorityTools, ...remaining.slice(0, MAX_TOOLS - priorityTools.length)];
  }

  metrics.tokensSaved += (allTools.length - selected.length) * 50;
  return selected;
}

export async function parallelExecuteTools(params: {
  tools: Array<{ name: string; params: any }>;
  executor: (name: string, params: any) => Promise<any>;
}): Promise<{ success: boolean; output: string; results: Array<{ name: string; result: any; durationMs: number }> }> {
  const startTime = Date.now();
  recordParallelBatch();

  const promises = params.tools.map(async (tool) => {
    const toolStart = Date.now();
    try {
      const result = await params.executor(tool.name, tool.params);
      const duration = Date.now() - toolStart;
      recordToolMetric(tool.name, duration, result?.success !== false);
      return { name: tool.name, result, durationMs: duration };
    } catch (err: any) {
      const duration = Date.now() - toolStart;
      recordToolMetric(tool.name, duration, false);
      return { name: tool.name, result: { success: false, error: err.message }, durationMs: duration };
    }
  });

  const results = await Promise.all(promises);
  const totalMs = Date.now() - startTime;
  const sequentialMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const saved = sequentialMs - totalMs;

  return {
    success: true,
    output: `Parallel execution: ${results.length} tools in ${totalMs}ms (saved ~${saved}ms vs sequential)`,
    results,
  };
}

export function compressPromptHistory(messages: Array<{ role: string; content: any }>, maxMessages: number = 20): Array<{ role: string; content: any }> {
  if (messages.length <= maxMessages) return messages;

  const first = messages.slice(0, 2);
  const recent = messages.slice(-maxMessages + 2);

  const skipped = messages.length - first.length - recent.length;
  const summary = {
    role: "user" as const,
    content: `[${skipped} הודעות קודמות קוצרו לחיסכון בטוקנים]`,
  };

  return [...first, summary, ...recent];
}

export function truncateToolResults(result: any, maxLength: number = 8000): string {
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + `\n...[קוצר — ${str.length - maxLength} תווים נוספים]`;
}

export const RESPONSE_SPEED_TOOLS = [
  {
    name: "cache_llm_get",
    description: "בדיקת קאש תגובות LLM — חוסך קריאות כפולות",
    input_schema: { type: "object" as const, properties: { system: { type: "string" }, messages: { type: "array", items: { type: "object" } } }, required: ["system", "messages"] as string[] },
  },
  {
    name: "cache_llm_set",
    description: "שמירת תגובת LLM בקאש",
    input_schema: { type: "object" as const, properties: { system: { type: "string" }, messages: { type: "array", items: { type: "object" } }, response: { type: "object" }, ttl: { type: "number", description: "TTL in ms (default 1hr)" }, latencyMs: { type: "number" } }, required: ["system", "messages", "response"] as string[] },
  },
  {
    name: "cache_llm_clear",
    description: "ניקוי קאש LLM",
    input_schema: { type: "object" as const, properties: { olderThanMs: { type: "number", description: "Clear entries older than X ms" } }, required: [] as string[] },
  },
  {
    name: "cache_llm_stats",
    description: "סטטיסטיקות קאש LLM — פגיעות, החטאות, גודל",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_performance_metrics",
    description: "מדדי ביצועים מלאים — זמני LLM, כלים, קאש, batches",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "reset_performance_metrics",
    description: "איפוס מדדי ביצועים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_slowest_tools",
    description: "רשימת הכלים האיטיים ביותר — לאופטימיזציה",
    input_schema: { type: "object" as const, properties: { limit: { type: "number", description: "Number of tools to show (default 20)" } }, required: [] as string[] },
  },
];
