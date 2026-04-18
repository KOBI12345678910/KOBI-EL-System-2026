import { spawn } from "child_process";
import { runCommand } from "./terminalTool";
import { readFile, writeFile } from "./fileTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

// ═══════════════════════════════════════════
// 1. LLM CACHE
// ═══════════════════════════════════════════

interface CacheEntry {
  response: any;
  timestamp: number;
  tokens: number;
  hits: number;
}

const llmCacheMap = new Map<string, CacheEntry>();
const LLM_CACHE_MAX = 500;
const LLM_CACHE_TTL = 30 * 60 * 1000;

function makeCacheKey(system: string, messages: any[]): string {
  const raw = system + JSON.stringify(messages);
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `llm_${Math.abs(hash).toString(36)}`;
}

export function llmCacheGet(system: string, messages: any[]): any | null {
  const key = makeCacheKey(system, messages);
  const entry = llmCacheMap.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > LLM_CACHE_TTL) {
    llmCacheMap.delete(key);
    return null;
  }
  entry.hits++;
  return entry.response;
}

export function llmCacheSet(system: string, messages: any[], response: any, tokens: number): void {
  const key = makeCacheKey(system, messages);
  if (llmCacheMap.size >= LLM_CACHE_MAX) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [k, v] of llmCacheMap) {
      if (v.timestamp < oldestTime) { oldestTime = v.timestamp; oldestKey = k; }
    }
    if (oldestKey) llmCacheMap.delete(oldestKey);
  }
  llmCacheMap.set(key, { response, timestamp: Date.now(), tokens, hits: 0 });
}

// ═══════════════════════════════════════════
// 2. PARALLEL EXECUTOR
// ═══════════════════════════════════════════

const MAX_CONCURRENCY = 5;
let runningCount = 0;
const taskQueue: Array<{ fn: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }> = [];

function processParallelQueue(): void {
  while (taskQueue.length > 0 && runningCount < MAX_CONCURRENCY) {
    const task = taskQueue.shift();
    if (!task) break;
    runningCount++;
    task.fn()
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => { runningCount--; processParallelQueue(); });
  }
}

export function runParallel<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    taskQueue.push({ fn, resolve, reject });
    processParallelQueue();
  });
}

export function runParallelAll<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(fns.map((fn) => runParallel(fn)));
}

// ═══════════════════════════════════════════
// 3. FAST COMMAND — with cache
// ═══════════════════════════════════════════

const commandCache = new Map<string, { output: string; timestamp: number }>();
const CMD_CACHE_TTL = 5000;

export async function fastExec(params: {
  command: string;
  cwd?: string;
  timeout?: number;
  cache?: boolean;
}): Promise<{ success: boolean; stdout: string; stderr: string; duration: number }> {
  const startTime = Date.now();

  if (params.cache !== false) {
    const cached = commandCache.get(params.command);
    if (cached && Date.now() - cached.timestamp < CMD_CACHE_TTL) {
      return { success: true, stdout: cached.output, stderr: "", duration: 0 };
    }
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    const proc = spawn("bash", ["-c", params.command], {
      cwd: params.cwd || WORKSPACE,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill("SIGKILL"); } catch {}
    }, params.timeout || 30000);

    proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      clearTimeout(timer);
      const result = {
        success: code === 0 && !killed,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - startTime,
      };
      if (result.success && params.cache !== false) {
        commandCache.set(params.command, { output: result.stdout, timestamp: Date.now() });
      }
      resolve(result);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, stdout, stderr: err.message, duration: Date.now() - startTime });
    });
  });
}

// ═══════════════════════════════════════════
// 4. BATCH FILE OPERATIONS
// ═══════════════════════════════════════════

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export async function batchReadFiles(params: { paths: string[] }): Promise<{ success: boolean; output: string; files?: Map<string, string> }> {
  console.log(`\n📂 קריאת ${params.paths.length} קבצים במקביל...`);
  const results = new Map<string, string>();
  const command = params.paths.map(f => `printf '===FILE:%s===\\n' ${shellEscape(f)} && cat ${shellEscape(f)} 2>/dev/null || echo "FILE_NOT_FOUND"`).join(" && ");

  const result = await fastExec({ command, timeout: 10000 });
  if (!result.success) return { success: false, output: `❌ שגיאה בקריאת קבצים: ${result.stderr}` };

  const parts = result.stdout.split(/===FILE:(.+?)===/);
  for (let i = 1; i < parts.length; i += 2) {
    const path = parts[i];
    const content = parts[i + 1]?.trim();
    if (content && content !== "FILE_NOT_FOUND") {
      results.set(path, content);
    }
  }

  return {
    success: true,
    output: `📂 נקראו ${results.size}/${params.paths.length} קבצים`,
    files: results,
  };
}

export async function batchWriteFiles(params: { files: Array<{ path: string; content: string }> }): Promise<{ success: boolean; output: string }> {
  console.log(`\n📝 כתיבת ${params.files.length} קבצים במקביל...`);
  let written = 0;

  const commands = params.files.map(f => {
    const dir = f.path.substring(0, f.path.lastIndexOf("/"));
    const escaped = f.content.replace(/'/g, "'\\''");
    return `mkdir -p ${shellEscape(dir)} && printf '%s' '${escaped}' > ${shellEscape(f.path)}`;
  });

  for (let i = 0; i < commands.length; i += 5) {
    const batch = commands.slice(i, i + 5).join(" && ");
    const result = await fastExec({ command: batch, timeout: 10000 });
    if (result.success) written += Math.min(5, commands.length - i);
  }

  return { success: true, output: `📝 נכתבו ${written}/${params.files.length} קבצים` };
}

export async function batchCheckExists(params: { paths: string[] }): Promise<{ success: boolean; output: string }> {
  const command = params.paths.map(p => `test -e ${shellEscape(p)} && printf 'EXISTS:%s\\n' ${shellEscape(p)} || printf 'MISSING:%s\\n' ${shellEscape(p)}`).join(" && ");
  const result = await fastExec({ command, timeout: 5000, cache: true });

  const exists: string[] = [];
  const missing: string[] = [];
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("EXISTS:")) exists.push(line.slice(7));
    else if (line.startsWith("MISSING:")) missing.push(line.slice(8));
  }

  return {
    success: true,
    output: `✅ קיימים: ${exists.length} | ❌ חסרים: ${missing.length}\n${missing.length > 0 ? `  חסרים: ${missing.join(", ")}` : ""}`,
  };
}

// ═══════════════════════════════════════════
// 5. STEP OPTIMIZER
// ═══════════════════════════════════════════

const completedSteps = new Set<string>();

function stepKey(type: string, details: any): string {
  return `${type}:${JSON.stringify(details || {})}`.slice(0, 200);
}

export async function checkStepNeeded(params: { type: string; details: any }): Promise<{ success: boolean; output: string; skip: boolean }> {
  const key = stepKey(params.type, params.details);
  if (completedSteps.has(key)) {
    return { success: true, output: `⏭️ דילוג — צעד כבר בוצע: ${params.type}`, skip: true };
  }
  return { success: true, output: `▶️ צעד נדרש: ${params.type}`, skip: false };
}

export async function markStepCompleted(params: { type: string; details: any }): Promise<{ success: boolean; output: string }> {
  completedSteps.add(stepKey(params.type, params.details));
  return { success: true, output: `✅ צעד סומן כהושלם: ${params.type}` };
}

export async function resetStepOptimizer(params: {}): Promise<{ success: boolean; output: string }> {
  const count = completedSteps.size;
  completedSteps.clear();
  return { success: true, output: `🔄 אופסו ${count} צעדים` };
}

// ═══════════════════════════════════════════
// 6. SPEED STATS
// ═══════════════════════════════════════════

export async function getSpeedStats(params: {}): Promise<{ success: boolean; output: string }> {
  let cacheHits = 0;
  let savedTokens = 0;
  for (const [, entry] of llmCacheMap) {
    cacheHits += entry.hits;
    savedTokens += entry.hits * entry.tokens;
  }

  const lines = [
    `🚀 מנוע מהירות:`,
    `  LLM Cache: ${llmCacheMap.size} entries | ${cacheHits} hits | ${savedTokens.toLocaleString()} tokens saved`,
    `  Command Cache: ${commandCache.size} entries`,
    `  Parallel Queue: ${taskQueue.length} pending | ${runningCount} running`,
    `  Step Optimizer: ${completedSteps.size} completed steps`,
  ];

  return { success: true, output: lines.join("\n") };
}

export async function clearSpeedCaches(params: {}): Promise<{ success: boolean; output: string }> {
  const llmSize = llmCacheMap.size;
  const cmdSize = commandCache.size;
  llmCacheMap.clear();
  commandCache.clear();
  completedSteps.clear();
  return { success: true, output: `🧹 נוקו: ${llmSize} LLM cache + ${cmdSize} command cache + step optimizer` };
}

export async function runParallelTasks(params: { commands: string[] }): Promise<{ success: boolean; output: string }> {
  console.log(`\n⚡ הרצת ${params.commands.length} פקודות במקביל...`);
  const startTime = Date.now();

  const results = await runParallelAll(
    params.commands.map(cmd => () => fastExec({ command: cmd, timeout: 30000 }))
  );

  const succeeded = results.filter(r => r.success).length;
  const totalDuration = Date.now() - startTime;

  const lines = [
    `⚡ ${succeeded}/${params.commands.length} הצליחו (${totalDuration}ms)`,
    ...results.map((r, i) => `  ${r.success ? "✅" : "❌"} [${r.duration}ms] ${params.commands[i].slice(0, 60)}`),
  ];

  return { success: true, output: lines.join("\n") };
}

export const SPEED_ENGINE_TOOLS = [
  {
    name: "fast_exec",
    description: "הרצת פקודה מהירה עם cache — מהירה יותר מ-runCommand",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" as const, description: "הפקודה" },
        cwd: { type: "string" as const, description: "תיקיית עבודה" },
        timeout: { type: "number" as const, description: "timeout (ms)" },
        cache: { type: "boolean" as const, description: "האם לשמור ב-cache" },
      },
      required: ["command"] as string[],
    },
  },
  {
    name: "batch_read_files",
    description: "קריאת מספר קבצים בפקודה אחת — מהירה פי 5",
    input_schema: {
      type: "object" as const,
      properties: { paths: { type: "array" as const, items: { type: "string" as const }, description: "רשימת נתיבים" } },
      required: ["paths"] as string[],
    },
  },
  {
    name: "batch_write_files",
    description: "כתיבת מספר קבצים בפקודה אחת — מהירה פי 5",
    input_schema: {
      type: "object" as const,
      properties: {
        files: { type: "array" as const, items: { type: "object" as const, properties: { path: { type: "string" as const }, content: { type: "string" as const } }, required: ["path", "content"] as string[] } },
      },
      required: ["files"] as string[],
    },
  },
  {
    name: "batch_check_exists",
    description: "בדיקת קיום מספר קבצים בפקודה אחת",
    input_schema: {
      type: "object" as const,
      properties: { paths: { type: "array" as const, items: { type: "string" as const } } },
      required: ["paths"] as string[],
    },
  },
  {
    name: "run_parallel_tasks",
    description: "הרצת מספר פקודות במקביל — חוסכת זמן",
    input_schema: {
      type: "object" as const,
      properties: { commands: { type: "array" as const, items: { type: "string" as const } } },
      required: ["commands"] as string[],
    },
  },
  {
    name: "check_step_needed",
    description: "בדיקה אם צעד כבר בוצע — דילוג חכם",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string" as const, description: "סוג הצעד" },
        details: { type: "object" as const, description: "פרטי הצעד" },
      },
      required: ["type"] as string[],
    },
  },
  {
    name: "mark_step_completed",
    description: "סימון צעד כהושלם — למנוע כפילויות",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string" as const },
        details: { type: "object" as const },
      },
      required: ["type"] as string[],
    },
  },
  {
    name: "get_speed_stats",
    description: "סטטיסטיקות מנוע המהירות — cache, parallel, optimizer",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "clear_speed_caches",
    description: "ניקוי כל ה-caches — LLM, commands, steps",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "reset_step_optimizer",
    description: "איפוס מעקב צעדים — מאפשר הרצה מחדש",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
