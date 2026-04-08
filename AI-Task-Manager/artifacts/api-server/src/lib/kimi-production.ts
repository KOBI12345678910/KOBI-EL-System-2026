import { KimiClient, getKimiClient, type KimiError } from "./kimi-client";
import { CircuitBreaker } from "./kimi-circuit-breaker";
import { KimiQueue, type QueueTask } from "./kimi-queue";
import { KimiMonitor } from "./kimi-monitor";
import { callWithFallback } from "./kimi-fallback";
import { SYSTEM_PROMPTS, extractJSON, buildPrompt } from "./kimi-prompt-engine";
import { ERP_SYSTEM_KNOWLEDGE } from "./kimi-system-knowledge";
import { detectTaskType, getExamplesForTaskType } from "./kimi-examples";
import {
  initErpFunctions,
  assessOrderRisk,
  naturalToSQL,
  generateReport,
  debugError,
} from "./kimi-erp-functions";
import { pool } from "@workspace/db";

const CONFIG = {
  model: "kimi-k2.5",
  timeoutMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 1_000,
  maxTokens: 16384,
  temperature: 1,
  debug: process.env.NODE_ENV === "development",
};

const client = getKimiClient({
  model: CONFIG.model,
  timeoutMs: CONFIG.timeoutMs,
  maxRetries: CONFIG.maxRetries,
  retryDelayMs: CONFIG.retryDelayMs,
  maxTokens: CONFIG.maxTokens,
  temperature: CONFIG.temperature,
  debug: CONFIG.debug,
});

const breaker = new CircuitBreaker(5, 60_000, 2, (from, to) => {
  console.log(`[Circuit] ${from} → ${to}`);
  if (to === "OPEN") queue.pause();
  if (to === "CLOSED") queue.resume();
});

const queue = new KimiQueue();
const monitor = new KimiMonitor();

queue.setExecutor(async (task: QueueTask) => {
  return breaker.call(async () => {
    const start = Date.now();
    const chosenModel = task.model ?? CONFIG.model;
    try {
      const result = task.model !== undefined
        ? await client.chat({
            messages: [
              { role: "system", content: task.systemPrompt },
              { role: "user", content: task.userMessage },
            ],
            model: task.model,
            temperature: task.temperature,
          })
        : await client.ask(task.userMessage, task.systemPrompt);

      monitor.record({
        id: task.id,
        ts: start,
        durationMs: Date.now() - start,
        ok: true,
        model: chosenModel,
      });
      return result;
    } catch (err) {
      const e = err as KimiError;
      monitor.record({
        id: task.id,
        ts: start,
        durationMs: Date.now() - start,
        ok: false,
        errorType: e.type,
        model: chosenModel,
      });
      throw err;
    }
  });
});

monitor.onAlert((alert) => {
  console.error(`[KIMI ALERT] [${alert.type}]: ${alert.message}`);
});

queue.on("failed", (id: string, err: unknown) =>
  console.error(`[Queue] משימה ${id} נכשלה:`, err)
);
queue.on("retry", (id: string, n: number, delay: number) =>
  console.warn(`[Queue] משימה ${id} ניסיון ${n} בעוד ${delay}ms`)
);

export function selectModel(prompt: string, systemPrompt?: string): string {
  const promptLen = prompt.length;
  const sysLen = systemPrompt?.length ?? 0;
  const lowerPrompt = prompt.toLowerCase();

  if (
    promptLen + sysLen > 20_000 ||
    lowerPrompt.includes("מסמך ארוך") ||
    lowerPrompt.includes("long document")
  ) {
    return "moonshot-v1-128k";
  }

  const isCodeOrAnalysisPersona =
    systemPrompt === SYSTEM_PROMPTS.coder ||
    systemPrompt === SYSTEM_PROMPTS.analyst ||
    systemPrompt === SYSTEM_PROMPTS.error_analyst;

  if (
    isCodeOrAnalysisPersona ||
    lowerPrompt.includes("קוד") ||
    lowerPrompt.includes("code") ||
    lowerPrompt.includes("ניתוח מעמיק") ||
    lowerPrompt.includes("deep analysis") ||
    lowerPrompt.includes("sql") ||
    promptLen + sysLen > 4_000
  ) {
    return "moonshot-v1-32k";
  }

  return "moonshot-v1-8k";
}

export function selectTemperature(systemPrompt?: string): number {
  if (!systemPrompt) return 0.3;

  if (
    systemPrompt === SYSTEM_PROMPTS.json_analyst ||
    systemPrompt === SYSTEM_PROMPTS.coder
  ) {
    return 0.0;
  }

  if (systemPrompt === SYSTEM_PROMPTS.analyst) {
    return 0.3;
  }

  const lower = systemPrompt.toLowerCase();
  if (lower.includes("יצירתי") || lower.includes("creative")) {
    return 0.7;
  }

  return 0.3;
}

function isComplexPrompt(prompt: string): boolean {
  return (
    prompt.length > 500 ||
    (prompt.includes("?") && prompt.split("?").length > 2) ||
    /\b(נתח|analyze|compare|השווה|תכנן|plan|מדוע|why|הסבר|explain)\b/i.test(prompt)
  );
}

function isLongResponse(text: string): boolean {
  return text.length > 200;
}

async function rawAsk(
  prompt: string,
  opts: {
    system?: string;
    priority?: "high" | "normal" | "low";
    model?: string;
    temperature?: number;
  } = {}
): Promise<string> {
  const systemContent = opts.system ?? SYSTEM_PROMPTS.general;

  try {
    return await queue.enqueue({
      systemPrompt: systemContent,
      userMessage: prompt,
      priority: opts.priority ?? "normal",
      model: opts.model,
      temperature: opts.temperature,
    });
  } catch (err) {
    console.warn("[Kimi] ראשי נכשל, מנסה fallback...");
    const { result } = await callWithFallback(
      [
        { role: "system", content: systemContent },
        { role: "user", content: prompt },
      ],
      { temperature: opts.temperature }
    );
    return result;
  }
}

let _erpStatsCache: { value: string; expiresAt: number } | null = null;
const ERP_STATS_TTL_MS = 30_000;

async function fetchDynamicERPStats(): Promise<string> {
  const now = Date.now();
  if (_erpStatsCache && now < _erpStatsCache.expiresAt) {
    return _erpStatsCache.value;
  }

  try {
    const pgClient = await pool.connect();
    try {
      const result = await pgClient.query<{ name: string; count: string }>(`
        SELECT 'active_orders' AS name, COUNT(*)::text AS count
          FROM sales_orders WHERE status NOT IN ('cancelled', 'closed', 'delivered')
        UNION ALL
        SELECT 'low_stock_items', COUNT(*)::text
          FROM raw_materials WHERE current_stock < min_stock_level
        UNION ALL
        SELECT 'pending_approvals', COUNT(*)::text
          FROM approval_requests WHERE status = 'pending'
        UNION ALL
        SELECT 'open_work_orders', COUNT(*)::text
          FROM production_work_orders WHERE status IN ('pending', 'in_progress')
      `);

      const stats = Object.fromEntries(result.rows.map((r) => [r.name, r.count]));
      const value = `\n[נתונים דינמיים — ${new Date().toLocaleString("he-IL")}]: הזמנות פעילות: ${stats.active_orders ?? "?"} | פריטי מלאי נמוך: ${stats.low_stock_items ?? "?"} | אישורים ממתינים: ${stats.pending_approvals ?? "?"} | פקודות ייצור פתוחות: ${stats.open_work_orders ?? "?"}`;
      _erpStatsCache = { value, expiresAt: now + ERP_STATS_TTL_MS };
      return value;
    } finally {
      pgClient.release();
    }
  } catch {
    return _erpStatsCache?.value ?? "";
  }
}

async function injectERPContext(
  systemPrompt: string,
  skipContext = false
): Promise<string> {
  if (skipContext) return systemPrompt;

  const staticContext = ERP_SYSTEM_KNOWLEDGE.slice(0, 2000);
  const dynamicStats = await fetchDynamicERPStats();
  const contextBlock = `\n\n---\n[הקשר ERP]\n${staticContext}${dynamicStats}\n---`;
  return systemPrompt + contextBlock;
}

async function thinkThenAnswer(
  prompt: string,
  opts: { system?: string; priority?: "high" | "normal" | "low"; model?: string; temperature?: number } = {}
): Promise<string> {
  const thinkPrompt = `חשוב שלב אחרי שלב (בתוך <think>...</think>), ואז ענה על:

${prompt}

חשוב: כתוב את הניתוח בתוך <think> ואז את התשובה הסופית בלבד לאחר </think>.`;

  const raw = await rawAsk(thinkPrompt, opts);
  const afterThink = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return afterThink || raw;
}

async function selfVerify(
  originalPrompt: string,
  response: string,
  opts: { system?: string; model?: string; temperature?: number } = {}
): Promise<string> {
  if (!isLongResponse(response)) return response;

  const verifyPrompt = `בדוק את התשובה הבאה לשאלה: "${originalPrompt.slice(0, 200)}"

תשובה לבדיקה:
${response}

אם התשובה נכונה ומלאה — החזר אותה כמות שהיא.
אם יש שגיאות עובדתיות, חישובים שגויים, או מידע חסר חשוב — תקן ושפר.
אל תוסיף מידע מיותר, רק תיקון ממשי אם נדרש.`;

  try {
    const corrected = await rawAsk(verifyPrompt, opts);
    return corrected || response;
  } catch {
    return response;
  }
}

async function decomposeAndExecute(
  prompt: string,
  opts: { system?: string; priority?: "high" | "normal" | "low"; model?: string; temperature?: number } = {}
): Promise<string> {
  const decomposePrompt = `פרק את המשימה הבאה לצעדים עצמאיים הניתנים לביצוע במקביל.
החזר JSON בלבד: { "steps": [{ "id": string, "task": string, "dependsOn": string[] }] }

משימה: ${prompt}`;

  const stepsRaw = await rawAsk(decomposePrompt, {
    system: SYSTEM_PROMPTS.task_manager,
    temperature: 0.0,
  });
  const parsed = extractJSON<{ steps: Array<{ id: string; task: string; dependsOn: string[] }> }>(stepsRaw);

  if (!parsed?.steps || parsed.steps.length <= 1) {
    return rawAsk(prompt, opts);
  }

  const independentSteps = parsed.steps.filter((s) => s.dependsOn.length === 0);
  const dependentSteps = parsed.steps.filter((s) => s.dependsOn.length > 0);

  const independentResults = await Promise.all(
    independentSteps.map((step) =>
      rawAsk(step.task, opts).then((r) => ({ id: step.id, result: r }))
    )
  );

  const allResults: Array<{ id: string; result: string }> = [...independentResults];

  for (const step of dependentSteps) {
    const depResults = step.dependsOn
      .map((depId) => allResults.find((r) => r.id === depId)?.result ?? "")
      .join("\n");
    const taskWithContext = `${step.task}\n\nתוצאות שלבים קודמים:\n${depResults}`;
    const result = await rawAsk(taskWithContext, opts);
    allResults.push({ id: step.id, result });
  }

  const aggregatePrompt = `סכם את תוצאות המשימות הבאות לתשובה אחת מגובשת ומקצועית:

${allResults.map((r, i) => `שלב ${i + 1}: ${r.result}`).join("\n\n")}`;

  return rawAsk(aggregatePrompt, opts);
}

export const Kimi = {
  async ask(
    prompt: string,
    opts: {
      system?: string;
      priority?: "high" | "normal" | "low";
      skipContext?: boolean;
      skipVerify?: boolean;
      useChainOfThought?: boolean;
    } = {}
  ): Promise<string> {
    const originalSystem = opts.system ?? SYSTEM_PROMPTS.general;

    const chosenModel = selectModel(prompt, originalSystem);
    const chosenTemp = selectTemperature(originalSystem);

    const taskType = detectTaskType(prompt, originalSystem);
    const examples = getExamplesForTaskType(taskType);

    const enrichedPrompt =
      examples.length && taskType !== "general"
        ? buildPrompt({ task: prompt, examples: examples.slice(0, 2) })
        : prompt;

    const enrichedSystem = await injectERPContext(
      originalSystem,
      opts.skipContext ?? false
    );

    const isCodeTask = originalSystem === SYSTEM_PROMPTS.coder;
    const isAnalysisTask =
      originalSystem === SYSTEM_PROMPTS.analyst ||
      taskType === "order_analysis" ||
      (opts.useChainOfThought ?? false);
    const isComplexRequest = isComplexPrompt(prompt);

    const shouldVerify =
      !(opts.skipVerify ?? false) &&
      (taskType === "order_analysis" || taskType === "error_debugging" || isAnalysisTask || isCodeTask);

    const shouldUseCoT =
      opts.useChainOfThought === true ||
      isAnalysisTask ||
      isComplexRequest;

    const callOpts = {
      system: enrichedSystem,
      priority: opts.priority,
      model: chosenModel,
      temperature: chosenTemp,
    };

    let result: string;

    if (shouldUseCoT) {
      result = await thinkThenAnswer(enrichedPrompt, callOpts);
    } else {
      result = await rawAsk(enrichedPrompt, callOpts);
    }

    if (shouldVerify) {
      result = await selfVerify(prompt, result, {
        system: enrichedSystem,
        model: chosenModel,
        temperature: chosenTemp,
      });
    }

    return result;
  },

  async askJSON<T = unknown>(
    prompt: string,
    opts: { system?: string; skipContext?: boolean } = {}
  ): Promise<T | null> {
    const originalSystem = opts.system ?? SYSTEM_PROMPTS.json_analyst;

    const chosenModel = selectModel(prompt, originalSystem);
    const enrichedSystem = await injectERPContext(
      originalSystem,
      opts.skipContext ?? false
    );

    const jsonCallOpts = { system: enrichedSystem, model: chosenModel, temperature: 0.0 };

    const raw = await rawAsk(prompt, jsonCallOpts);
    let result = extractJSON<T>(raw);

    if (result === null) {
      console.warn("[Kimi] JSON extraction failed, retrying with guidance...");
      const retryPrompt = `התשובה הקודמת לא הייתה JSON תקין. החזר ONLY JSON תקין ללא markdown, בלי הסבר, בלי backticks.

בקשה מקורית: ${prompt.slice(0, 500)}`;

      const raw2 = await rawAsk(retryPrompt, jsonCallOpts);
      result = extractJSON<T>(raw2);

      if (result === null) {
        console.warn("[Kimi] JSON extraction failed on retry 1, final retry...");
        const finalPrompt = `Return ONLY valid JSON. No explanation. No markdown. Just the JSON object or array.

Original request: ${prompt.slice(0, 300)}`;

        const raw3 = await rawAsk(finalPrompt, jsonCallOpts);
        result = extractJSON<T>(raw3);
      }
    }

    return result;
  },

  async task(opts: {
    prompt: string;
    system?: string;
    priority?: "high" | "normal" | "low";
    onSuccess?: (r: string) => Promise<void> | void;
    onError?: (e: unknown) => void;
    decompose?: boolean;
  }): Promise<string | null> {
    try {
      const originalSystem = opts.system ?? SYSTEM_PROMPTS.task_manager;
      const chosenModel = selectModel(opts.prompt, originalSystem);
      const chosenTemp = selectTemperature(originalSystem);

      let result: string;

      if (opts.decompose ?? isComplexPrompt(opts.prompt)) {
        result = await decomposeAndExecute(opts.prompt, {
          system: opts.system,
          priority: opts.priority,
          model: chosenModel,
          temperature: chosenTemp,
        });
      } else {
        result = await Kimi.ask(opts.prompt, {
          system: opts.system,
          priority: opts.priority,
        });
      }

      await opts.onSuccess?.(result);
      return result;
    } catch (e) {
      opts.onError?.(e);
      return null;
    }
  },

  async health() {
    const start = Date.now();
    try {
      await client.ask("OK", "Reply: OK");
      return {
        ok: true,
        latencyMs: Date.now() - start,
        circuit: breaker.getState(),
        queueSize: queue.size(),
        stats: monitor.stats(),
      };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: (e as KimiError).message,
        circuit: breaker.getState(),
        queueSize: queue.size(),
        stats: monitor.stats(),
      };
    }
  },

  status() {
    return {
      circuit: breaker.getState(),
      failures: breaker.getFailures(),
      queue: queue.stats(),
      available: breaker.isAvailable(),
      stats: monitor.stats(),
    };
  },

  erp: {
    assessOrderRisk,
    naturalToSQL,
    generateReport,
    debugError,
  },

  selectModel,
  selectTemperature,
};

initErpFunctions(
  (prompt, opts) => Kimi.ask(prompt, opts),
  (prompt, opts) => Kimi.askJSON(prompt, opts)
);

export { SYSTEM_PROMPTS, extractJSON, buildPrompt };
export default Kimi;
