import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";

interface ModelProfile {
  id: string;
  name: string;
  speed: "fast" | "medium" | "slow";
  quality: "basic" | "good" | "excellent" | "best";
  costPer1MTokens: { input: number; output: number };
  maxTokens: number;
  bestFor: string[];
}

const MODELS: ModelProfile[] = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Haiku 4.5",
    speed: "fast",
    quality: "basic",
    costPer1MTokens: { input: 0.8, output: 4 },
    maxTokens: 4096,
    bestFor: ["simple fixes", "formatting", "renaming", "small edits", "quick answers"],
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Sonnet 4",
    speed: "medium",
    quality: "excellent",
    costPer1MTokens: { input: 3, output: 15 },
    maxTokens: 8192,
    bestFor: ["code generation", "debugging", "refactoring", "architecture", "complex tasks"],
  },
  {
    id: "claude-opus-4-20250514",
    name: "Opus 4",
    speed: "slow",
    quality: "best",
    costPer1MTokens: { input: 15, output: 75 },
    maxTokens: 8192,
    bestFor: ["critical decisions", "security audit", "complex architecture", "research", "novel problems"],
  },
];

let routingHistory: Array<{ task: string; model: string; success: boolean; duration: number }> = [];

function classifyTask(task: string): { complexity: "simple" | "medium" | "complex" | "critical"; category: string } {
  const lower = task.toLowerCase();

  if (lower.match(/fix typo|rename|format|add comment|change color|update text|simple/))
    return { complexity: "simple", category: "quick-fix" };

  if (lower.match(/security|audit|critical|production|payment|auth|encryption|compliance/))
    return { complexity: "critical", category: "security" };

  if (lower.match(/architect|design system|migrate|rewrite|full.?stack|entire|complex|scale/))
    return { complexity: "complex", category: "architecture" };

  if (lower.match(/build|create|implement|add feature|generate|refactor|debug|test/))
    return { complexity: "medium", category: "development" };

  return { complexity: "medium", category: "general" };
}

export async function routeToModel(params: {
  task: string;
  forceModel?: string;
}): Promise<{ success: boolean; output: string; selectedModel: string; reasoning: string }> {
  if (params.forceModel) {
    const model = MODELS.find(m => m.id === params.forceModel || m.name.toLowerCase().includes(params.forceModel!.toLowerCase()));
    if (model) return { success: true, output: `מודל נכפה: ${model.name}`, selectedModel: model.id, reasoning: "נבחר ידנית" };
  }

  const classification = classifyTask(params.task);

  let selected: ModelProfile;
  let reasoning: string;

  switch (classification.complexity) {
    case "simple":
      selected = MODELS[0];
      reasoning = `משימה פשוטה (${classification.category}) — Haiku מספיק ומהיר x10`;
      break;
    case "critical":
      selected = MODELS[2];
      reasoning = `משימה קריטית (${classification.category}) — Opus לדיוק מקסימלי`;
      break;
    case "complex":
      selected = MODELS[1];
      reasoning = `משימה מורכבת (${classification.category}) — Sonnet מאזן איכות/מחיר`;
      break;
    default:
      selected = MODELS[1];
      reasoning = `משימה סטנדרטית (${classification.category}) — Sonnet`;
  }

  const successRate = routingHistory.filter(h => h.model === selected.id);
  const rate = successRate.length > 0 ? successRate.filter(h => h.success).length / successRate.length : 1;
  if (rate < 0.5 && classification.complexity !== "simple") {
    const upgrade = MODELS.find(m => MODELS.indexOf(m) > MODELS.indexOf(selected));
    if (upgrade) {
      reasoning += ` (שודרג מ-${selected.name} בגלל שיעור הצלחה נמוך: ${Math.round(rate * 100)}%)`;
      selected = upgrade;
    }
  }

  return {
    success: true,
    output: `🤖 מודל: ${selected.name} | סיבה: ${reasoning} | עלות: $${selected.costPer1MTokens.input}/$${selected.costPer1MTokens.output} per 1M`,
    selectedModel: selected.id,
    reasoning,
  };
}

export async function recordRoutingResult(params: {
  task: string;
  model: string;
  success: boolean;
  durationMs: number;
}): Promise<{ success: boolean; output: string }> {
  routingHistory.push({
    task: params.task,
    model: params.model,
    success: params.success,
    duration: params.durationMs,
  });
  if (routingHistory.length > 1000) routingHistory = routingHistory.slice(-500);
  return { success: true, output: `תוצאה נרשמה: ${params.success ? "✅" : "❌"} ${params.model} (${params.durationMs}ms)` };
}

export async function getRoutingStats(params: {}): Promise<{ success: boolean; output: string }> {
  if (routingHistory.length === 0) return { success: true, output: "אין היסטוריית routing" };

  const byModel = new Map<string, { total: number; success: number; avgDuration: number }>();
  for (const h of routingHistory) {
    const entry = byModel.get(h.model) || { total: 0, success: 0, avgDuration: 0 };
    entry.total++;
    if (h.success) entry.success++;
    entry.avgDuration = (entry.avgDuration * (entry.total - 1) + h.duration) / entry.total;
    byModel.set(h.model, entry);
  }

  const lines = [`📊 סטטיסטיקות routing (${routingHistory.length} בקשות):\n`];
  for (const [model, stats] of byModel) {
    const rate = Math.round((stats.success / stats.total) * 100);
    lines.push(`  ${model}: ${stats.total} בקשות, ${rate}% הצלחה, ${Math.round(stats.avgDuration)}ms ממוצע`);
  }

  return { success: true, output: lines.join("\n") };
}

export async function listAvailableModels(params: {}): Promise<{ success: boolean; output: string }> {
  const lines = MODELS.map(m =>
    `${m.name} (${m.id})\n  מהירות: ${m.speed} | איכות: ${m.quality} | עלות: $${m.costPer1MTokens.input}/$${m.costPer1MTokens.output} per 1M\n  מתאים ל: ${m.bestFor.join(", ")}`
  );
  return { success: true, output: `מודלים זמינים:\n\n${lines.join("\n\n")}` };
}

export const MULTI_MODEL_ROUTER_TOOLS = [
  {
    name: "route_to_model",
    description: "בחירת מודל AI אוטומטית לפי סוג המשימה — חוסך עלות, מקסם איכות",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "תיאור המשימה" },
        forceModel: { type: "string", description: "כפיית מודל ספציפי (אופציונלי)" },
      },
      required: ["task"] as string[],
    },
  },
  {
    name: "record_routing_result",
    description: "רישום תוצאת routing — לשיפור בחירת מודל עתידית",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string" }, model: { type: "string" },
        success: { type: "boolean" }, durationMs: { type: "number" },
      },
      required: ["task", "model", "success", "durationMs"] as string[],
    },
  },
  {
    name: "get_routing_stats",
    description: "סטטיסטיקות routing — הצלחה לפי מודל, זמנים, עלויות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "list_available_models",
    description: "רשימת מודלי AI זמינים — מהירות, איכות, עלות, התאמה",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
