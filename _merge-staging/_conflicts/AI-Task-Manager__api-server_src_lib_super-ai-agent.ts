import { pool } from "@workspace/db";
import { VAT_RATE } from "../constants";
import { executeTool } from "../routes/kobi/tools";
import { KOBI_SYSTEM_PROMPT, KOBI_TOOLS_SCHEMA } from "../routes/kobi/system-prompt";
import { getProjectMemory, getRecentMessages, saveMessage, autoExtractMemory, saveMemory } from "../routes/kobi/memory";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import ExcelJS from "exceljs";

const ROOT = join(process.cwd(), "../..");

export interface AgentConfig {
  model: string;
  maxToolLoops: number;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export const DEFAULT_CONFIG: AgentConfig = {
  model: "claude-sonnet-4-20250514",
  maxToolLoops: 15,
  temperature: 0.3,
  maxTokens: 8192,
  timeoutMs: 180000,
};

export const TOOL_CATEGORIES = {
  file_ops: {
    label: "ניהול קבצים",
    tools: ["read_file", "write_file", "edit_file", "delete_file", "list_files", "search_files"],
    description: "קריאה, כתיבה, עריכה, מחיקה, סריקה וחיפוש בקבצי הפרויקט",
  },
  database: {
    label: "מסד נתונים",
    tools: ["run_sql", "db_schema", "create_table", "add_field", "data_operations", "stream_data"],
    description: "שאילתות SQL, סכמה, יצירת טבלאות, הוספת שדות, פעולות נתונים",
  },
  erp_core: {
    label: "ליבת ERP",
    tools: ["erp_query", "manage_module", "manage_menu", "create_page", "create_api_route"],
    description: "שאילתות ERP, ניהול מודולים, תפריטים, דפים ונתיבי API",
  },
  business: {
    label: "עסקי",
    tools: ["financial_calc", "customer_service", "inventory_check", "workflow_trigger"],
    description: "חישובים פיננסיים, שירות לקוחות, מלאי, תהליכים עסקיים",
  },
  reporting: {
    label: "דיווח וייצוא",
    tools: ["report_generator", "export_report", "erp_insights"],
    description: "יצירת דוחות, ייצוא CSV/Excel/JSON, תובנות עסקיות",
  },
  system: {
    label: "מערכת",
    tools: ["system_health", "analyze_code", "api_test", "run_command", "task_queue", "deploy_check"],
    description: "בריאות מערכת, ניתוח קוד, בדיקות API, פקודות, משימות, מוכנות",
  },
  data_mgmt: {
    label: "ניהול נתונים",
    tools: ["data_validator", "bulk_update", "backup_restore", "import_data"],
    description: "אימות, עדכון המוני, גיבוי/שחזור, יבוא מקבצים",
  },
  admin: {
    label: "ניהול",
    tools: ["user_management", "notification_send", "smart_fix"],
    description: "ניהול משתמשים, התראות, תיקון אוטומטי",
  },
  automation: {
    label: "אוטומציה",
    tools: ["scheduler", "automation_trigger", "agent_status"],
    description: "תזמון משימות cron, טריגרים אוטומטיים, סטטוס סוכן",
  },
  dev_agent: {
    label: "סוכן פיתוח",
    tools: ["build_feature", "package_manager", "git_ops", "analyze_image"],
    description: "בניית פיצ'ר end-to-end, ניהול חבילות, Git, ניתוח תמונות Vision",
  },
} as const;

export const TOTAL_TOOLS = Object.values(TOOL_CATEGORIES).reduce((sum, cat) => sum + cat.tools.length, 0);

export function getToolCategory(toolName: string): string {
  for (const [key, cat] of Object.entries(TOOL_CATEGORIES)) {
    if ((cat.tools as readonly string[]).includes(toolName)) return cat.label;
  }
  return "כללי";
}

export function getToolsList(): { name: string; category: string }[] {
  const result: { name: string; category: string }[] = [];
  for (const cat of Object.values(TOOL_CATEGORIES)) {
    for (const tool of cat.tools) {
      result.push({ name: tool, category: cat.label });
    }
  }
  return result;
}

export interface AgentTask {
  id?: number;
  type: string;
  payload: Record<string, any>;
  schedule?: string;
  status?: string;
  result?: string;
  created_at?: string;
}

export interface ScheduledJob {
  id: string;
  name: string;
  cron: string;
  action: string;
  params: Record<string, any>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

const scheduledJobs: Map<string, ScheduledJob & { timer?: ReturnType<typeof setInterval> }> = new Map();

export async function ensureSchedulerTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_scheduled_jobs (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      cron VARCHAR(100) NOT NULL,
      action VARCHAR(100) NOT NULL,
      params JSONB DEFAULT '{}',
      enabled BOOLEAN DEFAULT true,
      last_run TIMESTAMPTZ,
      next_run TIMESTAMPTZ,
      last_result TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

function parseCronToMs(cron: string): number | null {
  const presets: Record<string, number> = {
    "@every_1m": 60000,
    "@every_5m": 300000,
    "@every_15m": 900000,
    "@every_30m": 1800000,
    "@every_1h": 3600000,
    "@every_6h": 21600000,
    "@every_12h": 43200000,
    "@daily": 86400000,
    "@weekly": 604800000,
  };
  if (presets[cron]) return presets[cron];

  const match = cron.match(/^@every_(\d+)(s|m|h|d)$/);
  if (match) {
    const n = parseInt(match[1]);
    const unit = match[2];
    if (unit === "s") return n * 1000;
    if (unit === "m") return n * 60000;
    if (unit === "h") return n * 3600000;
    if (unit === "d") return n * 86400000;
  }
  return null;
}

export async function scheduleJob(job: Omit<ScheduledJob, "id">): Promise<{ result: string }> {
  await ensureSchedulerTable();

  const res = await pool.query(
    `INSERT INTO agent_scheduled_jobs (name, cron, action, params, enabled) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [job.name, job.cron, job.action, JSON.stringify(job.params), job.enabled]
  );
  const id = String(res.rows[0].id);

  const intervalMs = parseCronToMs(job.cron);
  if (!intervalMs) return { result: `⚠️ תזמון "${job.cron}" לא מוכר. פורמטים: @every_5m, @every_1h, @daily, @weekly` };

  const timer = setInterval(async () => {
    try {
      const toolResult = await executeTool(job.action, job.params);
      await pool.query(
        `UPDATE agent_scheduled_jobs SET last_run = NOW(), last_result = $1, updated_at = NOW() WHERE id = $2`,
        [toolResult.result || toolResult.error || "", id]
      );
    } catch (e: any) {
      await pool.query(
        `UPDATE agent_scheduled_jobs SET last_run = NOW(), last_result = $1, updated_at = NOW() WHERE id = $2`,
        [`שגיאה: ${e.message}`, id]
      );
    }
  }, intervalMs);

  scheduledJobs.set(id, { ...job, id, timer });

  return { result: `✅ משימה מתוזמנת "${job.name}" נוצרה\n⏰ תזמון: ${job.cron} (כל ${intervalMs / 1000} שניות)\n🔧 פעולה: ${job.action}\n🆔 מזהה: ${id}` };
}

export async function listScheduledJobs(): Promise<{ result: string }> {
  await ensureSchedulerTable();
  const res = await pool.query("SELECT * FROM agent_scheduled_jobs ORDER BY created_at DESC");
  if (res.rows.length === 0) return { result: "אין משימות מתוזמנות" };

  const lines = res.rows.map(r =>
    `${r.enabled ? "🟢" : "🔴"} #${r.id} ${r.name} | ${r.cron} | ${r.action} | ריצה אחרונה: ${r.last_run ? new Date(r.last_run).toLocaleString("he-IL") : "טרם"}`
  );
  return { result: `📋 **${res.rows.length} משימות מתוזמנות**:\n${lines.join("\n")}` };
}

export async function toggleScheduledJob(id: string, enabled: boolean): Promise<{ result: string }> {
  await pool.query("UPDATE agent_scheduled_jobs SET enabled = $1, updated_at = NOW() WHERE id = $2", [enabled, id]);
  const job = scheduledJobs.get(id);
  if (job?.timer && !enabled) {
    clearInterval(job.timer);
    job.timer = undefined;
  }
  return { result: `${enabled ? "🟢 הופעל" : "🔴 הושבת"} משימה #${id}` };
}

export async function deleteScheduledJob(id: string): Promise<{ result: string }> {
  const job = scheduledJobs.get(id);
  if (job?.timer) clearInterval(job.timer);
  scheduledJobs.delete(id);
  await pool.query("DELETE FROM agent_scheduled_jobs WHERE id = $1", [id]);
  return { result: `🗑️ משימה #${id} נמחקה` };
}

export interface AutomationTrigger {
  event: string;
  condition?: string;
  action: string;
  params: Record<string, any>;
}

const automationTriggers: Map<string, AutomationTrigger & { id: string }> = new Map();

export async function ensureTriggersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_triggers (
      id SERIAL PRIMARY KEY,
      event VARCHAR(200) NOT NULL,
      condition_expr TEXT,
      action VARCHAR(100) NOT NULL,
      params JSONB DEFAULT '{}',
      enabled BOOLEAN DEFAULT true,
      fire_count INTEGER DEFAULT 0,
      last_fired TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function registerTrigger(trigger: AutomationTrigger): Promise<{ result: string }> {
  await ensureTriggersTable();
  const res = await pool.query(
    `INSERT INTO agent_triggers (event, condition_expr, action, params) VALUES ($1, $2, $3, $4) RETURNING id`,
    [trigger.event, trigger.condition || null, trigger.action, JSON.stringify(trigger.params)]
  );
  const id = String(res.rows[0].id);
  automationTriggers.set(id, { ...trigger, id });
  return { result: `✅ טריגר #${id} נרשם\n📌 אירוע: ${trigger.event}\n🔧 פעולה: ${trigger.action}${trigger.condition ? `\n🔍 תנאי: ${trigger.condition}` : ""}` };
}

export async function fireTrigger(event: string, data: Record<string, any> = {}): Promise<{ result: string }> {
  await ensureTriggersTable();
  const triggers = await pool.query(
    "SELECT * FROM agent_triggers WHERE event = $1 AND enabled = true",
    [event]
  );
  if (triggers.rows.length === 0) return { result: `אין טריגרים לאירוע "${event}"` };

  const results: string[] = [];
  for (const t of triggers.rows) {
    try {
      const params = { ...t.params, ...data };
      const toolResult = await executeTool(t.action, params);
      await pool.query(
        "UPDATE agent_triggers SET fire_count = fire_count + 1, last_fired = NOW() WHERE id = $1",
        [t.id]
      );
      results.push(`✅ טריגר #${t.id} (${t.action}): ${(toolResult.result || "").slice(0, 100)}`);
    } catch (e: any) {
      results.push(`❌ טריגר #${t.id}: ${e.message}`);
    }
  }
  return { result: `🔔 אירוע "${event}" — ${results.length} טריגרים:\n${results.join("\n")}` };
}

export async function listTriggers(): Promise<{ result: string }> {
  await ensureTriggersTable();
  const res = await pool.query("SELECT * FROM agent_triggers ORDER BY created_at DESC");
  if (res.rows.length === 0) return { result: "אין טריגרים" };

  const lines = res.rows.map(r =>
    `${r.enabled ? "🟢" : "🔴"} #${r.id} ${r.event} → ${r.action} | הפעלות: ${r.fire_count}`
  );
  return { result: `📋 **${res.rows.length} טריגרים**:\n${lines.join("\n")}` };
}

const AGENT_MIN_TOOL_DELAY_MS = 600;
const AGENT_RATE_LIMIT_COOLDOWN_MS = 15000;
let agentLastCallTime = 0;
let agentConsecutiveRateLimits = 0;

async function agentThrottledSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function agentWaitForRateLimit(): Promise<void> {
  const now = Date.now();
  const baseDelay = agentConsecutiveRateLimits > 0
    ? AGENT_MIN_TOOL_DELAY_MS + (agentConsecutiveRateLimits * 2000)
    : AGENT_MIN_TOOL_DELAY_MS;
  const elapsed = now - agentLastCallTime;
  if (elapsed < baseDelay) {
    await agentThrottledSleep(baseDelay - elapsed);
  }
  agentLastCallTime = Date.now();
}

async function fetchClaudeAgentWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5
): Promise<Response> {
  const backoffs = [2000, 5000, 12000, 25000, 45000];
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffs[attempt - 1] || 45000;
      console.log(`[KobiAgent] Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
      await agentThrottledSleep(delay);
    }
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        agentConsecutiveRateLimits = Math.max(0, agentConsecutiveRateLimits - 1);
        return response;
      }
      const status = response.status;
      if ((status === 429 || status === 502 || status === 503 || status === 529) && attempt < maxRetries) {
        if (status === 429) agentConsecutiveRateLimits++;
        const retryAfterHeader = response.headers.get("retry-after");
        const baseWait = retryAfterHeader ? parseInt(retryAfterHeader) * 1000 : backoffs[attempt] || 45000;
        const jitter = Math.random() * 2000;
        const waitMs = baseWait + jitter + (status === 429 ? AGENT_RATE_LIMIT_COOLDOWN_MS : 0);
        console.log(`[KobiAgent] Status ${status}, waiting ${Math.round(waitMs)}ms before retry`);
        await agentThrottledSleep(waitMs);
        agentLastCallTime = 0;
        continue;
      }
      return response;
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        const delay = backoffs[attempt] || 45000;
        console.log(`[KobiAgent] Network error, retrying after ${delay}ms: ${e.message}`);
        await agentThrottledSleep(delay);
        continue;
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

const HEAVY_TASK_KEYWORDS = ["בדיקת מערכת", "דשבורד", "dashboard", "KPI", "ניתוח מלא", "full check", "system check", "ניתוח", "דוח מלא"];

function isHeavyTask(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return HEAVY_TASK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

interface AgentAnthropicConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
}

function getAgentAnthropicConfigs(): AgentAnthropicConfig[] {
  const configs: AgentAnthropicConfig[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    configs.push({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
      label: "Anthropic Direct",
    });
  }
  if (process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
    configs.push({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseUrl: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      model: "claude-sonnet-4-6",
      label: "Replit Proxy",
    });
  }
  if (configs.length === 0) {
    configs.push({ apiKey: "", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-20250514", label: "None" });
  }
  return configs;
}

export interface TaskPhase {
  phase: number;
  name: string;
  status: "pending" | "running" | "completed" | "partial";
  toolsUsed: string[];
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

export async function runAutonomousTask(prompt: string, userId: string = "system"): Promise<{ result: string; toolsUsed: string[]; phases?: TaskPhase[] }> {
  const configs = getAgentAnthropicConfigs();
  if (!configs[0].apiKey) throw new Error("ANTHROPIC_API_KEY לא מוגדר");

  let activeConfigIndex = 0;
  let config = configs[0];

  const memory = await getProjectMemory(userId);
  const systemPrompt = KOBI_SYSTEM_PROMPT + (memory || "");

  const heavy = isHeavyTask(prompt);
  const maxLoops = heavy ? 30 : 15;

  const messages: any[] = [{ role: "user", content: prompt }];
  const toolsUsed: string[] = [];
  let loops = 0;

  const makePhases = (): TaskPhase[] => [
    { phase: 1, name: "איסוף נתונים", status: "pending", toolsUsed: [] },
    { phase: 2, name: "ניתוח ועיבוד", status: "pending", toolsUsed: [] },
    { phase: 3, name: "הצגת תוצאות", status: "pending", toolsUsed: [] },
  ];

  let phases: TaskPhase[] = heavy ? makePhases() : [];
  let currentPhase = 0;
  const BUDGET_PRESSURE_THRESHOLD = Math.max(4, Math.floor(maxLoops * 0.4));

  while (loops < maxLoops) {
    if (phases.length === 0 && loops >= BUDGET_PRESSURE_THRESHOLD) {
      phases = makePhases();
      currentPhase = 1;
      phases[0].status = "completed";
      phases[0].completedAt = Date.now();
      phases[1].status = "running";
      phases[1].startedAt = Date.now();
      console.log(`[runAutonomousTask] Phased mode activated at loop ${loops} due to budget pressure`);
    }

    await agentWaitForRateLimit();

    const remaining = maxLoops - loops;
    let budgetHint = "";
    if (remaining <= 3 && loops > 1) {
      budgetHint = `\n\n⚠️ [מערכת: נותרו ${remaining} סבבי כלים. סכם את התוצאות וסיים.]`;
    } else if (remaining <= 8 && loops > 3) {
      budgetHint = `\n\n[מערכת: נותרו ${remaining} סבבי כלים מתוך ${maxLoops}. אחד שאילתות SQL ככל האפשר.]`;
    }

    const requestBody = {
      model: config.model,
      max_tokens: DEFAULT_CONFIG.maxTokens,
      system: systemPrompt + budgetHint,
      messages,
      tools: KOBI_TOOLS_SCHEMA,
    };

    let response = await fetchClaudeAgentWithRetry(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      const isBillingOrLimit = errText.includes("credit balance") || errText.includes("billing") ||
        errText.includes("rate_limit") || errText.includes("overloaded") || errText.includes("UNSUPPORTED_MODEL");
      if (isBillingOrLimit && activeConfigIndex < configs.length - 1) {
        activeConfigIndex++;
        config = configs[activeConfigIndex];
        console.log(`[KobiAgent] Switching to ${config.label} after ${response.status}`);
        response = await fetchClaudeAgentWithRetry(`${config.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ ...requestBody, model: config.model }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) {
          const err2 = await response.text();
          throw new Error(`Claude API (${config.label}): ${response.status} ${err2.slice(0, 300)}`);
        }
      } else {
        throw new Error(`Claude API: ${response.status} ${errText.slice(0, 300)}`);
      }
    }

    const data = await response.json() as any;

    if (data.stop_reason === "end_turn" || !data.content) {
      const textBlock = data.content?.find((b: any) => b.type === "text");
      if (phases.length > 0 && phases[currentPhase]) {
        phases[currentPhase].status = "completed";
        phases[currentPhase].completedAt = Date.now();
      }
      return { result: textBlock?.text || "בוצע", toolsUsed, phases: phases.length > 0 ? phases : undefined };
    }

    messages.push({ role: "assistant", content: data.content });

    const toolUseBlocks = data.content.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      const textBlock = data.content.find((b: any) => b.type === "text");
      if (phases.length > 0 && phases[currentPhase]) {
        phases[currentPhase].status = "completed";
        phases[currentPhase].completedAt = Date.now();
      }
      return { result: textBlock?.text || "בוצע", toolsUsed, phases: phases.length > 0 ? phases : undefined };
    }

    if (phases.length > 0) {
      const phaseIdx = Math.min(Math.floor(loops / Math.ceil(maxLoops / 3)), phases.length - 1);
      if (phaseIdx !== currentPhase) {
        if (phases[currentPhase]) {
          phases[currentPhase].status = "completed";
          phases[currentPhase].completedAt = Date.now();
          const completedSummary = `פאזה ${phases[currentPhase].phase} (${phases[currentPhase].name}) הושלמה. כלים: ${phases[currentPhase].toolsUsed.join(", ") || "ללא"}`;
          await saveMemory(userId, "פאזות משימה", `פאזה ${phases[currentPhase].phase}`, completedSummary, 4, 0).catch(() => {});
        }
        currentPhase = phaseIdx;
      }
      if (phases[currentPhase]) {
        phases[currentPhase].status = "running";
        if (!phases[currentPhase].startedAt) phases[currentPhase].startedAt = Date.now();
      }
    }

    const toolResults: any[] = [];
    for (const toolBlock of toolUseBlocks) {
      toolsUsed.push(toolBlock.name);
      if (phases.length > 0 && phases[currentPhase]) {
        phases[currentPhase].toolsUsed.push(toolBlock.name);
      }
      const toolResult = await executeTool(toolBlock.name, toolBlock.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: toolResult.error || toolResult.result || "",
      });
    }

    messages.push({ role: "user", content: toolResults });
    loops++;
  }

  if (phases.length > 0 && phases[currentPhase]) {
    phases[currentPhase].status = "partial";
    const partialSummary = `פאזה ${phases[currentPhase].phase} (${phases[currentPhase].name}) נקטעה. כלים: ${phases[currentPhase].toolsUsed.join(", ") || "ללא"}`;
    await saveMemory(userId, "פאזות משימה", `פאזה ${phases[currentPhase].phase} — חלקית`, partialSummary, 4, 0).catch(() => {});
  }

  if (phases.length > 0) {
    const phaseSummary = phases.map(p => `פאזה ${p.phase} (${p.name}): ${p.status}`).join(", ");
    await saveMemory(userId, "פאזות משימה", "סיכום ריצה", phaseSummary, 5, 0).catch(() => {});
  }

  const finalTextBlock = messages.slice().reverse().find(m => m.role === "assistant")
    ?.content?.find?.((b: any) => b.type === "text");
  const pendingPhases = phases.filter(p => p.status === "pending").map(p => p.name);
  const continueHint = pendingPhases.length > 0
    ? `\n\n[נדרש המשך: כתוב "המשך" להמשיך. שלבים שנותרו: ${pendingPhases.join(", ")}.]`
    : `\n\n[נדרש המשך: הושלמו ${loops} מתוך ${maxLoops} סבבים. יש להמשיך בשיחה.]`;
  const partialResult = finalTextBlock?.text
    ? `${finalTextBlock.text}${continueHint}`
    : `⚠️ הגעתי למקסימום loops — הפסקתי${continueHint}`;

  return { result: partialResult, toolsUsed, phases: phases.length > 0 ? phases : undefined };
}

export async function getAgentStatus(): Promise<Record<string, any>> {
  const toolsList = getToolsList();
  let dbStatus = "unknown";
  let tableCount = 0;
  try {
    const r = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
    tableCount = parseInt(r.rows[0].count);
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  let scheduledCount = 0;
  let triggerCount = 0;
  try {
    const sj = await pool.query("SELECT count(*) FROM agent_scheduled_jobs WHERE enabled = true");
    scheduledCount = parseInt(sj.rows[0].count);
  } catch {}
  try {
    const tr = await pool.query("SELECT count(*) FROM agent_triggers WHERE enabled = true");
    triggerCount = parseInt(tr.rows[0].count);
  } catch {}

  return {
    agent: "קובי-AI — מנהל מערכת ERP טכנו-כל-עוזי",
    model: DEFAULT_CONFIG.model,
    total_tools: TOTAL_TOOLS,
    categories: Object.entries(TOOL_CATEGORIES).map(([k, v]) => ({
      key: k,
      label: v.label,
      description: v.description,
      tools_count: v.tools.length,
      tools: [...v.tools],
    })),
    database: { status: dbStatus, tables: tableCount },
    automation: { scheduled_jobs: scheduledCount, triggers: triggerCount },
    config: DEFAULT_CONFIG,
  };
}

export interface ImportResult {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: string[];
  table: string;
}

export async function importData(input: {
  action: string;
  file_path?: string;
  file_content?: string;
  table_name?: string;
  format?: string;
  column_mapping?: Record<string, string>;
  skip_header?: boolean;
  delimiter?: string;
  on_conflict?: string;
}): Promise<{ result: string }> {
  const { action, file_path, file_content, table_name, column_mapping, delimiter, on_conflict } = input;

  switch (action) {
    case "csv_import": {
      if (!table_name) throw new Error("table_name נדרש");
      let csvText = "";
      if (file_path) {
        const fullPath = join(ROOT, file_path.replace(/\.\./g, ""));
        if (!existsSync(fullPath)) throw new Error(`קובץ לא נמצא: ${file_path}`);
        csvText = readFileSync(fullPath, "utf-8");
      } else if (file_content) {
        csvText = file_content;
      } else {
        throw new Error("file_path או file_content נדרש");
      }

      const sep = delimiter || ",";
      const lines = csvText.split("\n").filter(l => l.trim());
      if (lines.length < 2) return { result: "אין נתונים לייבוא" };

      const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ""));
      const mappedHeaders = headers.map(h => column_mapping?.[h] || h);

      let imported = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const vals = parseCsvLine(lines[i], sep);
          if (vals.length !== headers.length) {
            errors.push(`שורה ${i + 1}: מספר עמודות לא תואם`);
            continue;
          }

          const cols = mappedHeaders.map(c => `"${c}"`).join(", ");
          const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(", ");
          let sql = `INSERT INTO ${table_name} (${cols}) VALUES (${placeholders})`;
          if (on_conflict === "update") {
            const updates = mappedHeaders.map(c => `"${c}" = EXCLUDED."${c}"`).join(", ");
            sql += ` ON CONFLICT DO UPDATE SET ${updates}`;
          } else if (on_conflict === "skip") {
            sql += ` ON CONFLICT DO NOTHING`;
          }

          await pool.query(sql, vals);
          imported++;
        } catch (e: any) {
          errors.push(`שורה ${i + 1}: ${e.message}`);
          if (errors.length > 20) break;
        }
      }

      const errorMsg = errors.length > 0 ? `\n⚠️ שגיאות: ${errors.slice(0, 5).join("; ")}` : "";
      return { result: `✅ יובאו ${imported} שורות מתוך ${lines.length - 1} ל-${table_name}${errorMsg}` };
    }

    case "excel_import": {
      if (!table_name || !file_path) throw new Error("table_name ו-file_path נדרשים");
      const fullPath = join(ROOT, file_path.replace(/\.\./g, ""));
      if (!existsSync(fullPath)) throw new Error(`קובץ לא נמצא: ${file_path}`);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(fullPath);
      const worksheet = workbook.worksheets[0];
      const headers: string[] = [];
      const data: Record<string, any>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        const vals = (row.values as any[]).slice(1).map((v: any) => (v === null || v === undefined ? "" : (typeof v === "object" && v.text ? v.text : v)));
        if (rowNumber === 1) {
          headers.push(...vals.map(String));
        } else {
          const obj: Record<string, any> = {};
          headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
          data.push(obj);
        }
      });

      if (data.length === 0) return { result: "אין נתונים בקובץ" };

      let imported = 0;
      const errors: string[] = [];

      for (let i = 0; i < data.length; i++) {
        try {
          const row = data[i];
          const keys = Object.keys(row);
          const mappedKeys = keys.map(k => column_mapping?.[k] || k);
          const cols = mappedKeys.map(c => `"${c}"`).join(", ");
          const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
          const vals = keys.map(k => row[k]);

          let sql = `INSERT INTO ${table_name} (${cols}) VALUES (${placeholders})`;
          if (on_conflict === "skip") sql += ` ON CONFLICT DO NOTHING`;

          await pool.query(sql, vals);
          imported++;
        } catch (e: any) {
          errors.push(`שורה ${i + 2}: ${e.message}`);
          if (errors.length > 20) break;
        }
      }

      const errorMsg = errors.length > 0 ? `\n⚠️ ${errors.length} שגיאות` : "";
      return { result: `✅ יובאו ${imported} שורות מתוך ${data.length} מ-Excel ל-${table_name}${errorMsg}` };
    }

    case "json_import": {
      if (!table_name) throw new Error("table_name נדרש");
      let jsonData: any[];
      if (file_path) {
        const fullPath = join(ROOT, file_path.replace(/\.\./g, ""));
        const content = readFileSync(fullPath, "utf-8");
        jsonData = JSON.parse(content);
      } else if (file_content) {
        jsonData = JSON.parse(file_content);
      } else {
        throw new Error("file_path או file_content נדרש");
      }
      if (!Array.isArray(jsonData)) jsonData = [jsonData];

      let imported = 0;
      const errors: string[] = [];

      for (let i = 0; i < jsonData.length; i++) {
        try {
          const row = jsonData[i];
          const keys = Object.keys(row);
          const mappedKeys = keys.map(k => column_mapping?.[k] || k);
          const cols = mappedKeys.map(c => `"${c}"`).join(", ");
          const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
          const vals = keys.map(k => row[k]);

          await pool.query(`INSERT INTO ${table_name} (${cols}) VALUES (${placeholders})`, vals);
          imported++;
        } catch (e: any) {
          errors.push(`רשומה ${i + 1}: ${e.message}`);
          if (errors.length > 20) break;
        }
      }

      return { result: `✅ יובאו ${imported} רשומות JSON ל-${table_name}` };
    }

    case "analyze_file": {
      if (!file_path) throw new Error("file_path נדרש");
      const fullPath = join(ROOT, file_path.replace(/\.\./g, ""));
      if (!existsSync(fullPath)) throw new Error(`קובץ לא נמצא: ${file_path}`);

      const ext = file_path.split(".").pop()?.toLowerCase();
      if (ext === "csv") {
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n").filter(l => l.trim());
        const headers = lines[0].split(delimiter || ",").map(h => h.trim());
        const sampleRows = lines.slice(1, 4).map(l => l.split(delimiter || ",").map(v => v.trim()));
        return { result: `📄 קובץ CSV:\n📊 ${lines.length - 1} שורות\n📋 עמודות: ${headers.join(", ")}\n🔍 דוגמה:\n${sampleRows.map(r => r.join(" | ")).join("\n")}` };
      } else if (ext === "xlsx" || ext === "xls") {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(fullPath);
        const sheets = workbook.worksheets.map(ws => ws.name);
        const worksheet = workbook.worksheets[0];
        const sheetHeaders: string[] = [];
        let dataRowCount = 0;
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            sheetHeaders.push(...(row.values as any[]).slice(1).map((v: any) => (v === null || v === undefined ? "" : String(typeof v === "object" && v.text ? v.text : v))));
          } else {
            dataRowCount++;
          }
        });
        return { result: `📄 קובץ Excel:\n📑 גליונות: ${sheets.join(", ")}\n📊 ${dataRowCount} שורות\n📋 עמודות: ${sheetHeaders.join(", ")}` };
      } else if (ext === "json") {
        const content = readFileSync(fullPath, "utf-8");
        const parsed = JSON.parse(content);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const keys = arr.length > 0 ? Object.keys(arr[0]) : [];
        return { result: `📄 קובץ JSON:\n📊 ${arr.length} רשומות\n📋 שדות: ${keys.join(", ")}` };
      }
      return { result: `סוג קובץ "${ext}" לא נתמך. נתמכים: csv, xlsx, xls, json` };
    }

    default:
      return { result: `פעולה "${action}" לא מוכרת. פעולות: csv_import, excel_import, json_import, analyze_file` };
  }
}

function parseCsvLine(line: string, sep: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

export async function handleSchedulerTool(input: {
  action: string;
  name?: string;
  cron?: string;
  tool_action?: string;
  params?: Record<string, any>;
  job_id?: string;
  enabled?: boolean;
}): Promise<{ result: string }> {
  switch (input.action) {
    case "create":
      if (!input.name || !input.cron || !input.tool_action) throw new Error("name, cron, tool_action נדרשים");
      return scheduleJob({ name: input.name, cron: input.cron, action: input.tool_action, params: input.params || {}, enabled: true });
    case "list":
      return listScheduledJobs();
    case "enable":
      if (!input.job_id) throw new Error("job_id נדרש");
      return toggleScheduledJob(input.job_id, true);
    case "disable":
      if (!input.job_id) throw new Error("job_id נדרש");
      return toggleScheduledJob(input.job_id, false);
    case "delete":
      if (!input.job_id) throw new Error("job_id נדרש");
      return deleteScheduledJob(input.job_id);
    default:
      return { result: `פעולה "${input.action}" לא מוכרת. פעולות: create, list, enable, disable, delete` };
  }
}

export async function handleTriggerTool(input: {
  action: string;
  event?: string;
  condition?: string;
  tool_action?: string;
  params?: Record<string, any>;
  data?: Record<string, any>;
  trigger_id?: string;
}): Promise<{ result: string }> {
  switch (input.action) {
    case "register":
      if (!input.event || !input.tool_action) throw new Error("event ו-tool_action נדרשים");
      return registerTrigger({ event: input.event, condition: input.condition, action: input.tool_action, params: input.params || {} });
    case "fire":
      if (!input.event) throw new Error("event נדרש");
      return fireTrigger(input.event, input.data || {});
    case "list":
      return listTriggers();
    case "delete":
      if (!input.trigger_id) throw new Error("trigger_id נדרש");
      await pool.query("DELETE FROM agent_triggers WHERE id = $1", [input.trigger_id]);
      automationTriggers.delete(input.trigger_id);
      return { result: `🗑️ טריגר #${input.trigger_id} נמחק` };
    default:
      return { result: `פעולה "${input.action}" לא מוכרת. פעולות: register, fire, list, delete` };
  }
}

const MODULE_TABLES: Record<string, string[]> = {
  sales: ["sales_customers", "customers", "sales_orders", "sales_order_items", "customer_invoices", "price_lists_ent"],
  finance: ["chart_of_accounts", "journal_entries", "general_ledger", "budgets", "bank_transactions"],
  procurement: ["suppliers", "purchase_orders", "purchase_order_items", "goods_receipts"],
  inventory: ["products", "stock_movements", "warehouses", "inventory_counts"],
  production: ["production_work_orders", "bom_headers", "bom_lines", "machines", "work_centers"],
  hr: ["employees", "departments", "attendance_records", "payroll_records"],
  projects: ["projects", "project_tasks", "project_resources", "project_budgets"],
  crm: ["crm_leads", "crm_opportunities", "crm_activities", "crm_campaigns"],
  marketing: ["marketing_campaigns", "marketing_analytics", "marketing_channels"],
  import_export: ["import_orders", "customs_clearances", "letters_of_credit", "shipment_tracking"],
  maintenance: ["maintenance_requests", "maintenance_schedules", "maintenance_assets"],
  quality: ["quality_inspections", "quality_standards", "quality_reports"],
  documents: ["documents", "document_folders", "document_files"],
  strategy: ["strategy_goals", "strategy_kpis", "strategy_initiatives"],
  supply_chain: ["supplier_evaluations", "supplier_contracts", "delivery_tracking"],
  platform: ["platform_modules", "module_entities", "entity_fields"],
  portal: ["external_portal_users", "portal_access_rules"],
  analytics: ["analytics_dashboards", "analytics_widgets"],
  product_dev: ["product_development", "product_specs", "product_versions"],
  pricing: ["pricing_rules", "pricing_tiers", "cost_calculations"],
  calendar: ["calendar_events", "calendar_categories"],
  integrations: ["integration_configs", "integration_logs"],
  ai_engine: ["kimi_agents", "kobi_sessions", "kobi_chat_logs", "kobi_memory"],
};

const MODULE_LINKS: Record<string, Record<string, { fromKey: string; toKey: string; toTable: string }>> = {
  sales: {
    finance: { fromKey: "id", toKey: "order_id", toTable: "customer_invoices" },
    inventory: { fromKey: "product_id", toKey: "id", toTable: "products" },
    crm: { fromKey: "customer_id", toKey: "customer_id", toTable: "crm_opportunities" },
  },
  procurement: {
    finance: { fromKey: "id", toKey: "purchase_order_id", toTable: "journal_entries" },
    inventory: { fromKey: "id", toKey: "receipt_id", toTable: "stock_movements" },
  },
  production: {
    inventory: { fromKey: "product_id", toKey: "id", toTable: "products" },
    procurement: { fromKey: "material_id", toKey: "product_id", toTable: "purchase_order_items" },
  },
  hr: {
    finance: { fromKey: "employee_id", toKey: "employee_id", toTable: "payroll_records" },
    projects: { fromKey: "id", toKey: "resource_id", toTable: "project_resources" },
  },
  crm: {
    sales: { fromKey: "customer_id", toKey: "customer_id", toTable: "sales_orders" },
    marketing: { fromKey: "campaign_id", toKey: "id", toTable: "marketing_campaigns" },
  },
};

interface BusinessFlow {
  name: string;
  description: string;
  fromModule: string;
  toModule: string;
  execute: (params: Record<string, any>) => Promise<{ result: string; created_id?: number }>;
}

const BUSINESS_FLOWS: BusinessFlow[] = [
  {
    name: "crm_lead_to_customer",
    description: "העברת ליד מ-CRM ללקוח חדש במכירות",
    fromModule: "crm",
    toModule: "sales",
    execute: async (params) => {
      const { lead_id } = params;
      if (!lead_id) return { result: "❌ נדרש lead_id" };

      const lead = await pool.query("SELECT * FROM crm_leads WHERE id = $1", [lead_id]);
      if (lead.rows.length === 0) return { result: `❌ ליד ${lead_id} לא נמצא` };
      const l = lead.rows[0];

      if (l.status === "converted") return { result: `⚠️ ליד ${lead_id} כבר הומר ללקוח` };

      const existParts: string[] = [];
      const existVals: any[] = [];
      let eIdx = 1;
      if (l.email) { existParts.push(`email = $${eIdx++}`); existVals.push(l.email); }
      if (l.phone) { existParts.push(`phone = $${eIdx++}`); existVals.push(l.phone); }
      const fullName = l.company || `${l.first_name || ""} ${l.last_name || ""}`.trim();
      if (fullName) { existParts.push(`name = $${eIdx++}`); existVals.push(fullName); }

      if (existParts.length > 0) {
        const existing = await pool.query(`SELECT id FROM sales_customers WHERE ${existParts.join(" OR ")} LIMIT 1`, existVals);
        if (existing.rows.length > 0) {
          return { result: `⚠️ לקוח קיים (ID: ${existing.rows[0].id}) עם אותו אימייל/טלפון/שם` };
        }
      }

      const custName = l.company || `${l.first_name || ""} ${l.last_name || ""}`.trim();
      const custNumber = `C-${Date.now().toString(36).toUpperCase()}`;
      const contactPerson = `${l.first_name || ""} ${l.last_name || ""}`.trim();

      const ins = await pool.query(
        `INSERT INTO sales_customers (name, email, phone, address, contact_person, source, status, customer_number, customer_type, city, country, website, industry, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING id`,
        [
          custName, l.email, l.phone, l.address, contactPerson,
          l.source || "CRM", "active", custNumber, "business",
          l.city, l.country, l.website, l.industry,
          `הומר מליד #${lead_id}. ${l.notes || ""}`,
        ]
      );
      const customerId = ins.rows[0].id;

      await pool.query(
        `INSERT INTO customers (name, email, phone, address, city, contact_person, source, status, customer_number, company_name, region, country, website, industry, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()) ON CONFLICT DO NOTHING`,
        [custName, l.email, l.phone, l.address, l.city, contactPerson, l.source || "CRM", "active", custNumber, l.company, l.region, l.country, l.website, l.industry, `הומר מליד #${lead_id}`]
      ).catch(() => {});

      await pool.query(
        "UPDATE crm_leads SET status = 'converted', conversion_date = NOW(), updated_at = NOW() WHERE id = $1",
        [lead_id]
      );

      return {
        result: `✅ **ליד → לקוח**\n` +
          `👤 ליד #${lead_id} (${l.first_name} ${l.last_name}) הומר ללקוח\n` +
          `🆔 לקוח חדש: #${customerId} — ${custName}\n` +
          `📋 מספר: ${custNumber}\n` +
          `📧 ${l.email || "—"} | 📱 ${l.phone || "—"}`,
        created_id: customerId,
      };
    },
  },
  {
    name: "crm_lead_to_order",
    description: "העברת ליד מ-CRM ישירות להזמנת מכירה",
    fromModule: "crm",
    toModule: "sales",
    execute: async (params) => {
      const { lead_id, products } = params;
      if (!lead_id) return { result: "❌ נדרש lead_id" };

      const lead = await pool.query("SELECT * FROM crm_leads WHERE id = $1", [lead_id]);
      if (lead.rows.length === 0) return { result: `❌ ליד ${lead_id} לא נמצא` };
      const l = lead.rows[0];

      let customerId: number | null = null;
      const searchParts: string[] = [];
      const searchVals: any[] = [];
      let paramIdx = 1;
      if (l.email) { searchParts.push(`email = $${paramIdx++}`); searchVals.push(l.email); }
      if (l.phone) { searchParts.push(`phone = $${paramIdx++}`); searchVals.push(l.phone); }
      const companyOrName = l.company || `${l.first_name || ""} ${l.last_name || ""}`.trim();
      if (companyOrName) { searchParts.push(`name = $${paramIdx++}`); searchVals.push(companyOrName); }

      if (searchParts.length > 0) {
        const existCust = await pool.query(`SELECT id FROM sales_customers WHERE ${searchParts.join(" OR ")} LIMIT 1`, searchVals);
        if (existCust.rows.length > 0) customerId = existCust.rows[0].id;
      }

      if (!customerId) {
        const custName = companyOrName || "לקוח חדש";
        const custNumber = `C-${Date.now().toString(36).toUpperCase()}`;
        const contactPerson = `${l.first_name || ""} ${l.last_name || ""}`.trim();
        const ins = await pool.query(
          `INSERT INTO sales_customers (name, email, phone, address, contact_person, source, status, customer_number, customer_type, city, country, website, industry, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()) RETURNING id`,
          [custName, l.email, l.phone, l.address, contactPerson, l.source || "CRM", "active", custNumber, "business", l.city, l.country, l.website, l.industry]
        );
        customerId = ins.rows[0].id;
      }

      const custData = await pool.query("SELECT name FROM sales_customers WHERE id = $1", [customerId]);
      const custName = custData.rows[0]?.name || companyOrName;
      const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;
      const estimatedVal = l.estimated_value ? Math.round(Number(l.estimated_value)) : 0;
      const taxAmt = Math.round(estimatedVal * VAT_RATE);
      const orderTotal = estimatedVal + taxAmt;

      const ord = await pool.query(
        `INSERT INTO sales_orders (order_number, customer_id, customer_name, order_date, status, subtotal, tax_amount, total, payment_status, notes, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING id`,
        [orderNumber, customerId, custName, "draft", estimatedVal, taxAmt, orderTotal, "pending", `מקור: ליד CRM #${lead_id}`]
      );
      const orderId = ord.rows[0].id;

      if (products && Array.isArray(products)) {
        for (const p of products) {
          const qty = p.quantity || 1;
          const price = p.price || 0;
          const total = qty * price;
          await pool.query(
            `INSERT INTO sales_order_items (order_id, product_id, product_name, quantity, unit_price, total_price, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
            [orderId, p.product_id || null, p.name || "פריט", qty, price, total]
          ).catch(() => {});
        }
      }

      await pool.query(
        "UPDATE crm_leads SET status = 'converted', conversion_date = NOW(), updated_at = NOW() WHERE id = $1",
        [lead_id]
      );

      return {
        result: `✅ **ליד → הזמנה**\n` +
          `👤 ליד #${lead_id} → לקוח #${customerId} (${custName})\n` +
          `📦 הזמנה חדשה: #${orderId} — ${orderNumber}\n` +
          `💰 סכום: ₪${estimatedVal.toLocaleString()}\n` +
          `📋 סטטוס: טיוטה`,
        created_id: orderId,
      };
    },
  },
  {
    name: "opportunity_to_order",
    description: "המרת הזדמנות CRM להזמנת מכירה",
    fromModule: "crm",
    toModule: "sales",
    execute: async (params) => {
      const { opportunity_id } = params;
      if (!opportunity_id) return { result: "❌ נדרש opportunity_id" };

      const opp = await pool.query("SELECT * FROM crm_opportunities WHERE id = $1", [opportunity_id]);
      if (opp.rows.length === 0) return { result: `❌ הזדמנות ${opportunity_id} לא נמצאה` };
      const o = opp.rows[0];

      if (o.stage === "won" || o.stage === "converted" || o.stage === "closed_won") return { result: `⚠️ הזדמנות ${opportunity_id} כבר הומרה` };

      let customerId = o.customer_id;
      let custName = o.customer_name || o.name || "";
      if (!customerId && custName) {
        const c = await pool.query("SELECT id, name FROM sales_customers WHERE name ILIKE $1 LIMIT 1", [`%${custName}%`]);
        if (c.rows.length > 0) { customerId = c.rows[0].id; custName = c.rows[0].name; }
      }
      if (!customerId && custName) {
        const custNumber = `C-${Date.now().toString(36).toUpperCase()}`;
        const ins = await pool.query(
          `INSERT INTO sales_customers (name, status, customer_number, customer_type, source, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING id`,
          [custName, "active", custNumber, "business", "CRM"]
        );
        customerId = ins.rows[0].id;
      }

      const orderNumber = `SO-${Date.now().toString(36).toUpperCase()}`;
      const val = o.value ? Math.round(Number(o.value)) : (o.estimated_amount ? Math.round(Number(o.estimated_amount)) : 0);
      const oppTaxAmt = Math.round(val * VAT_RATE);
      const oppTotal = val + oppTaxAmt;

      const ord = await pool.query(
        `INSERT INTO sales_orders (order_number, customer_id, customer_name, order_date, status, subtotal, tax_amount, total, payment_status, notes, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING id`,
        [orderNumber, customerId, custName, "draft", val, oppTaxAmt, oppTotal, "pending", `מקור: הזדמנות CRM #${opportunity_id} — ${o.name || ""}`]
      );

      await pool.query(
        "UPDATE crm_opportunities SET stage = 'closed_won', closed_date = NOW(), updated_at = NOW() WHERE id = $1",
        [opportunity_id]
      );

      return {
        result: `✅ **הזדמנות → הזמנה**\n` +
          `🎯 הזדמנות #${opportunity_id} (${o.name || ""}) → נסגרה כ-WON\n` +
          `📦 הזמנה: #${ord.rows[0].id} — ${orderNumber}\n` +
          `👤 לקוח: ${custName} (#${customerId || "—"})\n` +
          `💰 ₪${val.toLocaleString()}`,
        created_id: ord.rows[0].id,
      };
    },
  },
  {
    name: "order_to_production",
    description: "יצירת הוראת עבודה מהזמנת מכירה",
    fromModule: "sales",
    toModule: "production",
    execute: async (params) => {
      const { order_id, product_name, quantity } = params;
      if (!order_id) return { result: "❌ נדרש order_id" };
      const orderId = Number(order_id);
      if (!orderId || !Number.isFinite(orderId) || orderId < 1 || orderId === 99999 || orderId > 999999) return { result: `❌ מזהה הזמנה לא תקין: ${order_id}` };

      const order = await pool.query("SELECT * FROM sales_orders WHERE id = $1", [orderId]);
      if (order.rows.length === 0) {
        console.warn(`[super-ai-agent] הזמנה ${orderId} לא נמצאה`);
        return { result: `❌ הזמנה ${orderId} לא נמצאה` };
      }
      const o = order.rows[0];

      const woNumber = `WO-${Date.now().toString(36).toUpperCase()}`;
      const qty = quantity || 1;

      const wo = await pool.query(
        `INSERT INTO production_work_orders (order_number, product_name, sales_order_id, customer_name, planned_start, planned_end, quantity_planned, quantity_produced, status, priority, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,NOW(),NOW() + INTERVAL '7 days',$5,0,$6,$7,$8,NOW(),NOW()) RETURNING id`,
        [woNumber, product_name || "מוצר מהזמנה", order_id, o.customer_name, qty, "planned", o.priority || "normal", `הזמנת מכירה: ${o.order_number}`]
      );

      return {
        result: `✅ **הזמנה → ייצור**\n` +
          `📦 הזמנה #${order_id} (${o.order_number}) → הוראת עבודה\n` +
          `🏭 הוראת עבודה: #${wo.rows[0].id} — ${woNumber}\n` +
          `📊 כמות: ${qty}\n` +
          `👤 לקוח: ${o.customer_name}`,
        created_id: wo.rows[0].id,
      };
    },
  },
  {
    name: "order_to_purchase",
    description: "יצירת הזמנת רכש מהזמנת מכירה",
    fromModule: "sales",
    toModule: "procurement",
    execute: async (params) => {
      const { order_id, supplier_id } = params;
      if (!order_id) return { result: "❌ נדרש order_id" };
      const orderId = Number(order_id);
      if (!orderId || !Number.isFinite(orderId) || orderId < 1 || orderId === 99999 || orderId > 999999) return { result: `❌ מזהה הזמנה לא תקין: ${order_id}` };

      const order = await pool.query("SELECT * FROM sales_orders WHERE id = $1", [orderId]);
      if (order.rows.length === 0) {
        console.warn(`[super-ai-agent] הזמנה ${orderId} לא נמצאה`);
        return { result: `❌ הזמנה ${orderId} לא נמצאה` };
      }
      const o = order.rows[0];

      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

      let suppId = supplier_id;
      if (!suppId) {
        const firstSupp = await pool.query("SELECT id FROM suppliers LIMIT 1");
        suppId = firstSupp.rows[0]?.id || null;
      }
      if (suppId) {
        const suppExists = await pool.query("SELECT id FROM suppliers WHERE id = $1", [suppId]);
        if (suppExists.rows.length === 0) suppId = null;
      }

      const po = await pool.query(
        `INSERT INTO purchase_orders (order_number, supplier_id, status, order_date, expected_delivery, total_amount, notes, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW() + INTERVAL '14 days',$4,$5,NOW(),NOW()) RETURNING id`,
        [poNumber, suppId, "draft", o.total || 0, `מקור: הזמנת מכירה ${o.order_number} (#${order_id})`]
      );

      return {
        result: `✅ **מכירה → רכש**\n` +
          `📦 הזמנת מכירה #${order_id} (${o.order_number}) → הזמנת רכש\n` +
          `🛒 הזמנת רכש: #${po.rows[0].id} — ${poNumber}\n` +
          `💰 סכום: ₪${Number(o.total || 0).toLocaleString()}`,
        created_id: po.rows[0].id,
      };
    },
  },
  {
    name: "order_to_invoice",
    description: "יצירת חשבונית מהזמנת מכירה",
    fromModule: "sales",
    toModule: "finance",
    execute: async (params) => {
      const { order_id } = params;
      if (!order_id) return { result: "❌ נדרש order_id" };
      const orderId = Number(order_id);
      if (!orderId || !Number.isFinite(orderId) || orderId < 1 || orderId === 99999 || orderId > 999999) return { result: `❌ מזהה הזמנה לא תקין: ${order_id}` };

      const order = await pool.query("SELECT * FROM sales_orders WHERE id = $1", [orderId]);
      if (order.rows.length === 0) {
        console.warn(`[super-ai-agent] הזמנה ${orderId} לא נמצאה`);
        return { result: `❌ הזמנה ${orderId} לא נמצאה` };
      }
      const o = order.rows[0];

      const existing = await pool.query("SELECT id FROM customer_invoices WHERE reference_number = $1", [o.order_number]);
      if (existing.rows.length > 0) return { result: `⚠️ כבר קיימת חשבונית להזמנה ${order_id} (חשבונית #${existing.rows[0].id})` };

      const invNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      const subtotal = Number(o.subtotal || o.total || 0);
      const vatRate = 18;
      const vatAmount = Math.round(subtotal * vatRate / 100);
      const total = subtotal + vatAmount;

      const inv = await pool.query(
        `INSERT INTO customer_invoices (invoice_number, invoice_type, invoice_date, due_date, customer_name, customer_id_ref, reference_number, subtotal, before_vat, vat_rate, vat_amount, total_amount, amount_paid, status, notes, currency, created_at, updated_at)
         VALUES ($1,$2,NOW(),NOW() + INTERVAL '30 days',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING id`,
        [invNumber, "tax_invoice", o.customer_name, o.customer_id, o.order_number, subtotal, subtotal, vatRate, vatAmount, total, 0, "draft", `הזמנה: ${o.order_number} (#${order_id})`, o.currency || "ILS"]
      );

      return {
        result: `✅ **הזמנה → חשבונית**\n` +
          `📦 הזמנה #${order_id} (${o.order_number})\n` +
          `🧾 חשבונית: #${inv.rows[0].id} — ${invNumber}\n` +
          `💰 סכום: ₪${subtotal.toLocaleString()} + מע"מ 18% ₪${vatAmount.toLocaleString()} = ₪${total.toLocaleString()}\n` +
          `👤 ${o.customer_name}`,
        created_id: inv.rows[0].id,
      };
    },
  },
  {
    name: "production_to_inventory",
    description: "עדכון מלאי מייצור — הכנסת תוצרת למחסן",
    fromModule: "production",
    toModule: "inventory",
    execute: async (params) => {
      const { work_order_id, quantity, warehouse } = params;
      if (!work_order_id) return { result: "❌ נדרש work_order_id" };

      const wo = await pool.query("SELECT * FROM production_work_orders WHERE id = $1", [work_order_id]);
      if (wo.rows.length === 0) return { result: `❌ הוראת עבודה ${work_order_id} לא נמצאה` };
      const w = wo.rows[0];

      const qty = quantity || Number(w.quantity_produced) || Number(w.quantity_planned) || 1;

      let materialId: number | null = null;
      const prod = await pool.query("SELECT id FROM products WHERE product_name ILIKE $1 LIMIT 1", [`%${w.product_name}%`]);
      if (prod.rows.length > 0) materialId = prod.rows[0].id;

      const sm = await pool.query(
        `INSERT INTO stock_movements (movement_type, material_type, material_id, quantity, reference_type, reference_id, notes, performed_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
        ["production_in", "product", materialId, qty, "work_order", work_order_id, `הוראת עבודה: ${w.order_number} — ${w.product_name}`, null]
      );

      return {
        result: `✅ **ייצור → מלאי**\n` +
          `🏭 הוראת עבודה #${work_order_id} (${w.order_number})\n` +
          `📦 ${w.product_name} — ${qty} יח' נכנסו למלאי\n` +
          `🏪 מחסן: ${warehouse || "ראשי"}\n` +
          `🆔 תנועת מלאי: #${sm.rows[0].id}`,
        created_id: sm.rows[0].id,
      };
    },
  },
  {
    name: "purchase_to_inventory",
    description: "קליטת סחורה מהזמנת רכש למלאי",
    fromModule: "procurement",
    toModule: "inventory",
    execute: async (params) => {
      const { purchase_order_id, items, warehouse } = params;
      if (!purchase_order_id) return { result: "❌ נדרש purchase_order_id" };

      const po = await pool.query("SELECT * FROM purchase_orders WHERE id = $1", [purchase_order_id]);
      if (po.rows.length === 0) return { result: `❌ הזמנת רכש ${purchase_order_id} לא נמצאה` };
      const p = po.rows[0];

      const poItems = await pool.query("SELECT * FROM purchase_order_items WHERE purchase_order_id = $1", [purchase_order_id]);
      const itemsToProcess = items || poItems.rows;

      let received = 0;
      for (const item of itemsToProcess) {
        const qty = item.quantity || item.received_quantity || 1;
        await pool.query(
          `INSERT INTO stock_movements (movement_type, material_type, material_id, quantity, reference_type, reference_id, notes, performed_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
          ["purchase_in", "product", item.product_id || null, qty, "purchase_order", purchase_order_id, `הזמנת רכש: ${p.order_number} — ${item.product_name || item.description || "פריט"}`, null]
        ).catch(() => {});
        received++;
      }

      await pool.query("UPDATE purchase_orders SET status = 'received', received_date = NOW(), updated_at = NOW() WHERE id = $1", [purchase_order_id]);

      return {
        result: `✅ **רכש → מלאי**\n` +
          `🛒 הזמנת רכש #${purchase_order_id} (${p.order_number})\n` +
          `📦 ${received} פריטים נקלטו במחסן ${warehouse || "ראשי"}\n` +
          `📋 סטטוס הזמנה עודכן ל: received`,
      };
    },
  },
  {
    name: "invoice_to_payment",
    description: "רישום תשלום עבור חשבונית — העברה בנקאית / צ'ק / מזומן / כרטיס אשראי",
    fromModule: "finance",
    toModule: "finance",
    execute: async (params) => {
      const { invoice_id, amount, payment_method, reference, check_number, check_date, check_bank, credit_card_last4, notes } = params;
      if (!invoice_id) return { result: "❌ נדרש invoice_id" };

      const inv = await pool.query("SELECT * FROM customer_invoices WHERE id = $1", [invoice_id]);
      if (inv.rows.length === 0) return { result: `❌ חשבונית ${invoice_id} לא נמצאה` };
      const i = inv.rows[0];

      if (i.status === "paid" || i.status === "cancelled") return { result: `⚠️ חשבונית ${invoice_id} כבר ${i.status === "paid" ? "שולמה" : "בוטלה"}` };

      const totalAmount = Number(i.total_amount || 0);
      const alreadyPaid = Number(i.amount_paid || 0);
      const remaining = totalAmount - alreadyPaid;
      const payAmount = amount ? Math.min(Number(amount), remaining) : remaining;

      if (payAmount <= 0) return { result: `⚠️ אין יתרה לתשלום. סכום חשבונית: ₪${totalAmount.toLocaleString()}, שולם: ₪${alreadyPaid.toLocaleString()}` };

      const method = payment_method || "bank_transfer";
      const payNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;

      const cp = await pool.query(
        `INSERT INTO customer_payments (
          payment_number, payment_date, customer_name, customer_id, invoice_id, invoice_number,
          amount, payment_method, reference_number, status, currency,
          amount_in_ils, net_amount, receipt_type,
          notes, created_at, updated_at
        ) VALUES (
          $1, NOW(), $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, NOW(), NOW()
        ) RETURNING id`,
        [
          payNumber, i.customer_name || "", Number(i.customer_id_ref) || null, invoice_id, i.invoice_number || "",
          payAmount, method, reference || payNumber, "confirmed", i.currency || "ILS",
          payAmount, payAmount, "receipt",
          notes || `תשלום עבור חשבונית ${i.invoice_number}`,
        ]
      );
      const paymentId = cp.rows[0].id;

      if (check_number) {
        await pool.query(
          "UPDATE customer_payments SET check_number = $1, check_date = $2, check_bank = $3 WHERE id = $4",
          [check_number, check_date || null, check_bank || null, paymentId]
        ).catch(() => {});
      }
      if (credit_card_last4) {
        await pool.query(
          "UPDATE customer_payments SET credit_card_last4 = $1 WHERE id = $2",
          [credit_card_last4, paymentId]
        ).catch(() => {});
      }

      const newPaid = alreadyPaid + payAmount;
      const newStatus = newPaid >= totalAmount ? "paid" : "partial";

      const updateFields: string[] = [
        "amount_paid = $1",
        "status = $2",
        "payment_method = $3",
        "payment_date = NOW()",
        "payment_reference = $4",
        "collection_status = $5",
        "updated_at = NOW()",
      ];
      const updateVals: any[] = [newPaid, newStatus, method, reference || payNumber, newStatus === "paid" ? "collected" : "partial"];
      if (newStatus === "paid") {
        updateFields.push("paid_at = NOW()");
      }
      await pool.query(
        `UPDATE customer_invoices SET ${updateFields.join(", ")} WHERE id = $6`,
        [...updateVals, invoice_id]
      );

      const jeNumber = `JE-${Date.now().toString(36).toUpperCase()}`;
      const bankAccount = await pool.query("SELECT id, account_number, account_name FROM chart_of_accounts WHERE account_number = '1020' LIMIT 1");
      const custAccount = await pool.query("SELECT id, account_number, account_name FROM chart_of_accounts WHERE account_number = '1100' LIMIT 1");

      const bankAccId = bankAccount.rows[0]?.id || null;
      const bankAccName = bankAccount.rows[0]?.account_name || "בנק";
      const custAccId = custAccount.rows[0]?.id || null;
      const custAccName = custAccount.rows[0]?.account_name || "לקוחות";

      await pool.query(
        `INSERT INTO journal_entries (
          entry_number, entry_date, description, reference, entry_type,
          debit_account_id, debit_account_name, credit_account_id, credit_account_name,
          amount, currency, amount_ils, status, source_document, source_type,
          notes, created_at, updated_at
        ) VALUES (
          $1, NOW(), $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, NOW(), NOW()
        )`,
        [
          jeNumber, `קבלת תשלום — ${i.invoice_number} — ${i.customer_name}`,
          payNumber, "payment",
          bankAccId, bankAccName, custAccId, custAccName,
          payAmount, i.currency || "ILS", payAmount, "posted",
          i.invoice_number, "customer_payment",
          `חשבונית: ${i.invoice_number}, תשלום: ${payNumber}`,
        ]
      ).catch(() => {});

      await pool.query(
        `INSERT INTO general_ledger (
          entry_date, account_number, account_name, account_type, description,
          reference, source_document, source_type,
          debit_amount, credit_amount, currency, amount_ils,
          fiscal_year, fiscal_period, created_at
        ) VALUES
        (NOW(), $1, $2, 'asset', $3, $4, $5, 'payment', $6, 0, $7, $8, EXTRACT(YEAR FROM NOW())::int, EXTRACT(MONTH FROM NOW())::int, NOW()),
        (NOW(), $9, $10, 'asset', $3, $4, $5, 'payment', 0, $6, $7, $8, EXTRACT(YEAR FROM NOW())::int, EXTRACT(MONTH FROM NOW())::int, NOW())`,
        [
          bankAccount.rows[0]?.account_number || "1020", bankAccName,
          `קבלת תשלום — ${i.customer_name}`, payNumber, i.invoice_number,
          payAmount, i.currency || "ILS", payAmount,
          custAccount.rows[0]?.account_number || "1100", custAccName,
        ]
      ).catch(() => {});

      const methodHeb: Record<string, string> = {
        bank_transfer: "העברה בנקאית",
        check: "צ'ק",
        cash: "מזומן",
        credit_card: "כרטיס אשראי",
        wire: "העברה בנקאית",
      };

      return {
        result: `✅ **חשבונית → תשלום**\n` +
          `🧾 חשבונית #${invoice_id} (${i.invoice_number})\n` +
          `💳 תשלום: #${paymentId} — ${payNumber}\n` +
          `💰 סכום: ₪${payAmount.toLocaleString()} / ₪${totalAmount.toLocaleString()}\n` +
          `📋 אמצעי: ${methodHeb[method] || method}\n` +
          `${check_number ? `🏦 צ'ק: ${check_number} (${check_bank || ""})` : ""}\n` +
          `${credit_card_last4 ? `💳 כרטיס: ****${credit_card_last4}` : ""}\n` +
          `📊 סטטוס: ${newStatus === "paid" ? "שולמה במלואה ✅" : `תשלום חלקי — נותר ₪${(remaining - payAmount).toLocaleString()}`}\n` +
          `📒 פקודת יומן: ${jeNumber} (חובה: ${bankAccName}, זכות: ${custAccName})`,
        created_id: paymentId,
      };
    },
  },
];

async function logCrossModuleTransaction(data: {
  txId: string; flowName: string; fromModule: string; toModule: string;
  action: string; status: string; params: Record<string, any>;
  resultSummary: string; createdId?: number; durationMs: number; errorMessage?: string;
}): Promise<void> {
  try {
    const amount = data.params.amount || data.params.payAmount || null;
    await pool.query(
      `INSERT INTO cross_module_transactions
        (transaction_id, flow_name, from_module, to_module, action, status,
         source_entity_type, source_entity_id, target_entity_type, target_entity_id,
         amount, params, result_summary, duration_ms, error_message, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
      [
        data.txId, data.flowName, data.fromModule, data.toModule, data.action, data.status,
        data.fromModule, data.params.lead_id || data.params.order_id || data.params.opportunity_id || data.params.invoice_id || data.params.work_order_id || data.params.purchase_order_id || null,
        data.toModule, data.createdId || null,
        amount, JSON.stringify(data.params), data.resultSummary?.substring(0, 2000) || "",
        data.durationMs, data.errorMessage || null,
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, user_name, details, description, action_type, tags, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        `cross_module_${data.flowName}`,
        "cross_module_transaction",
        data.txId,
        "system",
        JSON.stringify({ flow: data.flowName, from: data.fromModule, to: data.toModule, params: data.params, created_id: data.createdId, duration_ms: data.durationMs, status: data.status }),
        data.resultSummary?.substring(0, 500) || data.errorMessage || "",
        data.status === "completed" ? "create" : "error",
        `cross-module,${data.flowName},${data.fromModule},${data.toModule}`,
      ]
    ).catch(() => {});
  } catch {}
}

export async function streamDataAcrossModules(input: {
  from_module: string;
  to_module: string;
  data?: Record<string, any>[];
  query?: string;
  transform?: string;
  action?: string;
  flow?: string;
  params?: Record<string, any>;
}): Promise<{ result: string; created_id?: number }> {
  const { from_module, to_module, data, query, transform, action = "transfer", flow, params: flowParams } = input;

  if (action === "list_modules") {
    const lines = Object.entries(MODULE_TABLES).map(([key, tables]) =>
      `📦 **${key}**: ${tables.join(", ")}`
    );
    return { result: `🏗️ **${Object.keys(MODULE_TABLES).length} מודולים זמינים**:\n${lines.join("\n")}` };
  }

  if (action === "list_links") {
    const lines: string[] = [];
    for (const [from, targets] of Object.entries(MODULE_LINKS)) {
      for (const [to, link] of Object.entries(targets)) {
        lines.push(`🔗 ${from} → ${to}: ${link.fromKey} → ${link.toTable}.${link.toKey}`);
      }
    }
    return { result: lines.length > 0 ? `🔗 **חיבורים בין מודולים**:\n${lines.join("\n")}` : "אין חיבורים מוגדרים" };
  }

  if (action === "list_transactions" || action === "history") {
    const limit = (input as any).limit || 20;
    const filterFlow = (input as any).flow_filter || null;
    let q = "SELECT transaction_id, flow_name, from_module, to_module, status, amount, duration_ms, result_summary, error_message, created_at FROM cross_module_transactions";
    const vals: any[] = [];
    if (filterFlow) { q += " WHERE flow_name = $1"; vals.push(filterFlow); }
    q += " ORDER BY created_at DESC LIMIT " + Math.min(limit, 100);

    const txs = await pool.query(q, vals);
    if (txs.rows.length === 0) return { result: "📋 אין עסקאות cross-module עדיין" };

    const lines = txs.rows.map((t: any) => {
      const ts = new Date(t.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
      const statusIcon = t.status === "completed" ? "✅" : "❌";
      const amountStr = t.amount ? ` | ₪${Number(t.amount).toLocaleString()}` : "";
      return `${statusIcon} **${t.transaction_id}** | ${t.flow_name} (${t.from_module}→${t.to_module}) | ${t.duration_ms}ms${amountStr} | ${ts}`;
    });

    const completed = txs.rows.filter((t: any) => t.status === "completed").length;
    const failed = txs.rows.filter((t: any) => t.status === "failed").length;

    return {
      result: `📋 **היסטוריית עסקאות cross-module** (${txs.rows.length} אחרונות)\n` +
        `✅ ${completed} הצליחו | ❌ ${failed} נכשלו\n\n${lines.join("\n")}`,
    };
  }

  if (action === "list_flows") {
    const lines = BUSINESS_FLOWS.map(f =>
      `🔄 **${f.name}** (${f.fromModule} → ${f.toModule}): ${f.description}`
    );
    return { result: `🔄 **${BUSINESS_FLOWS.length} תהליכים עסקיים זמינים**:\n${lines.join("\n")}` };
  }

  if (action === "flow" || flow) {
    const flowName = flow || from_module;
    const bf = BUSINESS_FLOWS.find(f => f.name === flowName);
    if (!bf) {
      const available = BUSINESS_FLOWS.map(f => f.name).join(", ");
      return { result: `❌ תהליך "${flowName}" לא נמצא. תהליכים זמינים: ${available}` };
    }

    const txId = `TX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const startTime = Date.now();
    try {
      const result = await bf.execute(flowParams || {});
      const durationMs = Date.now() - startTime;
      await logCrossModuleTransaction({
        txId, flowName: bf.name, fromModule: bf.fromModule, toModule: bf.toModule,
        action: "flow", status: "completed", params: flowParams || {},
        resultSummary: result.result, createdId: result.created_id, durationMs,
      });
      result.result += `\n\n📋 **מעקב**: ${txId} | ${durationMs}ms`;
      return result;
    } catch (e: any) {
      const durationMs = Date.now() - startTime;
      await logCrossModuleTransaction({
        txId, flowName: bf.name, fromModule: bf.fromModule, toModule: bf.toModule,
        action: "flow", status: "failed", params: flowParams || {},
        resultSummary: "", durationMs, errorMessage: e.message,
      });
      throw e;
    }
  }

  if (action === "analyze") {
    const fromTables = MODULE_TABLES[from_module];
    const toTables = MODULE_TABLES[to_module];
    if (!fromTables) return { result: `❌ מודול מקור "${from_module}" לא נמצא` };
    if (!toTables) return { result: `❌ מודול יעד "${to_module}" לא נמצא` };

    const link = MODULE_LINKS[from_module]?.[to_module];
    const counts: string[] = [];
    for (const t of fromTables) {
      try {
        const r = await pool.query(`SELECT count(*)::int AS cnt FROM ${t}`);
        counts.push(`  ${t}: ${r.rows[0]?.cnt || 0} רשומות`);
      } catch {
        counts.push(`  ${t}: ❌ לא נגיש`);
      }
    }

    const relevantFlows = BUSINESS_FLOWS.filter(f => f.fromModule === from_module && f.toModule === to_module);
    const flowLines = relevantFlows.length > 0
      ? `\n🔄 **תהליכים זמינים**:\n${relevantFlows.map(f => `  • ${f.name}: ${f.description}`).join("\n")}`
      : "";

    return {
      result: `📊 **ניתוח חיבור ${from_module} → ${to_module}**\n\n` +
        `📦 מקור (${from_module}):\n${counts.join("\n")}\n\n` +
        `🎯 יעד: ${toTables.join(", ")}\n` +
        (link ? `🔗 חיבור: ${link.fromKey} → ${link.toTable}.${link.toKey}` : `⚠️ אין חיבור ישיר מוגדר — ניתן להשתמש ב-query מותאם`) +
        flowLines,
    };
  }

  const fromTables = MODULE_TABLES[from_module];
  const toTables = MODULE_TABLES[to_module];
  if (!fromTables) return { result: `❌ מודול מקור "${from_module}" לא נמצא. מודולים: ${Object.keys(MODULE_TABLES).join(", ")}` };
  if (!toTables) return { result: `❌ מודול יעד "${to_module}" לא נמצא. מודולים: ${Object.keys(MODULE_TABLES).join(", ")}` };

  const autoFlow = BUSINESS_FLOWS.find(f => f.fromModule === from_module && f.toModule === to_module);
  if (autoFlow && flowParams) {
    return autoFlow.execute(flowParams);
  }

  let rows: Record<string, any>[] = [];

  if (data && data.length > 0) {
    rows = data;
  } else if (query) {
    const clean = query.trim().toUpperCase();
    if (!clean.startsWith("SELECT") && !clean.startsWith("WITH")) {
      return { result: "❌ query חייב להתחיל ב-SELECT" };
    }
    const result = await pool.query(query);
    rows = result.rows;
  } else {
    const mainTable = fromTables[0];
    const result = await pool.query(`SELECT * FROM ${mainTable} LIMIT 1000`);
    rows = result.rows;
  }

  if (rows.length === 0) return { result: "אין נתונים להעברה" };

  if (transform) {
    try {
      const fn = new Function("row", `return (${transform})(row)`);
      rows = rows.map((row: any) => fn(row));
    } catch (e: any) {
      return { result: `❌ שגיאה בטרנספורמציה: ${e.message}` };
    }
  }

  const targetTable = toTables[0];
  let inserted = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map(c => row[c]);
    const placeholders = cols.map((_, j) => `$${j + 1}`).join(", ");
    try {
      await pool.query(
        `INSERT INTO ${targetTable} (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals
      );
      inserted++;
    } catch (e: any) {
      if (errors.length < 5) errors.push(e.message);
    }
  }

  const errorMsg = errors.length > 0 ? `\n⚠️ שגיאות: ${errors.join("; ")}` : "";

  const txId = `TX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await logCrossModuleTransaction({
    txId, flowName: "generic_transfer", fromModule: from_module, toModule: to_module,
    action: "transfer", status: errors.length > 0 && inserted === 0 ? "failed" : "completed",
    params: { query: query?.substring(0, 200), rows_count: rows.length, target_table: targetTable },
    resultSummary: `${inserted}/${rows.length} רשומות הועברו → ${targetTable}`,
    durationMs: 0,
    errorMessage: errors.length > 0 ? errors[0] : undefined,
  });

  return {
    result: `✅ **העברת נתונים ${from_module} → ${to_module}**\n` +
      `📊 ${inserted}/${rows.length} רשומות הועברו → ${targetTable}${errorMsg}\n\n📋 **מעקב**: ${txId}`,
  };
}

export {
  executeTool,
  KOBI_SYSTEM_PROMPT,
  KOBI_TOOLS_SCHEMA,
  getProjectMemory,
  getRecentMessages,
  saveMessage,
  autoExtractMemory,
};
