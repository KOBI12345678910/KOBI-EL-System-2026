export interface TokenUsage {
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: Date;
  taskId?: string;
  phase?: string;
}

const usageHistory: TokenUsage[] = [];
let totalCost = 0;
let totalTokens = 0;

const pricing: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

export function recordTokenUsage(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  taskId?: string;
  phase?: string;
}): TokenUsage {
  const p = pricing[params.model] || { input: 3, output: 15 };
  const cost = (params.inputTokens * p.input + params.outputTokens * p.output) / 1_000_000;

  const usage: TokenUsage = {
    requestId: `req_${Date.now()}`,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    totalTokens: params.inputTokens + params.outputTokens,
    cost,
    timestamp: new Date(),
    taskId: params.taskId,
    phase: params.phase,
  };

  usageHistory.push(usage);
  totalCost += cost;
  totalTokens += usage.totalTokens;
  return usage;
}

export async function getTokenStats(params: {}): Promise<{
  success: boolean;
  output: string;
  stats: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    avgTokensPerRequest: number;
    avgCostPerRequest: number;
    byModel: Record<string, { requests: number; tokens: number; cost: number }>;
    byTask: Record<string, { requests: number; tokens: number; cost: number }>;
    last24h: { tokens: number; cost: number; requests: number };
  };
}> {
  const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {};
  const byTask: Record<string, { requests: number; tokens: number; cost: number }> = {};
  const dayAgo = Date.now() - 86400000;
  const last24h = { tokens: 0, cost: 0, requests: 0 };

  for (const u of usageHistory) {
    if (!byModel[u.model]) byModel[u.model] = { requests: 0, tokens: 0, cost: 0 };
    byModel[u.model].requests++;
    byModel[u.model].tokens += u.totalTokens;
    byModel[u.model].cost += u.cost;

    if (u.taskId) {
      if (!byTask[u.taskId]) byTask[u.taskId] = { requests: 0, tokens: 0, cost: 0 };
      byTask[u.taskId].requests++;
      byTask[u.taskId].tokens += u.totalTokens;
      byTask[u.taskId].cost += u.cost;
    }

    if (u.timestamp.getTime() > dayAgo) {
      last24h.tokens += u.totalTokens;
      last24h.cost += u.cost;
      last24h.requests++;
    }
  }

  const stats = {
    totalRequests: usageHistory.length,
    totalTokens,
    totalCost: Math.round(totalCost * 10000) / 10000,
    avgTokensPerRequest: usageHistory.length > 0 ? Math.round(totalTokens / usageHistory.length) : 0,
    avgCostPerRequest: usageHistory.length > 0 ? Math.round((totalCost / usageHistory.length) * 10000) / 10000 : 0,
    byModel,
    byTask,
    last24h: { ...last24h, cost: Math.round(last24h.cost * 10000) / 10000 },
  };

  const lines = [
    `סה"כ בקשות: ${stats.totalRequests}`,
    `סה"כ טוקנים: ${stats.totalTokens.toLocaleString()}`,
    `עלות כוללת: $${stats.totalCost}`,
    `ממוצע טוקנים/בקשה: ${stats.avgTokensPerRequest.toLocaleString()}`,
    `ממוצע עלות/בקשה: $${stats.avgCostPerRequest}`,
    `\n24 שעות אחרונות: ${last24h.requests} בקשות, ${last24h.tokens.toLocaleString()} טוקנים, $${last24h.cost}`,
  ];

  for (const [model, data] of Object.entries(byModel)) {
    lines.push(`\nמודל ${model}: ${data.requests} בקשות, ${data.tokens.toLocaleString()} טוקנים, $${Math.round(data.cost * 10000) / 10000}`);
  }

  return { success: true, output: lines.join("\n"), stats };
}

export async function estimateTokenCost(params: {
  task: string;
}): Promise<{ success: boolean; output: string; estimatedTokens: number; estimatedCost: number }> {
  const words = params.task.split(/\s+/).length;
  const isComplex = params.task.includes("full") || params.task.includes("complete") || params.task.includes("entire");
  const multiplier = isComplex ? 8 : 4;
  const estimatedTokens = words * 100 * multiplier;
  const p = pricing["claude-sonnet-4-20250514"];
  const estimatedCost = (estimatedTokens * 0.6 * p.input + estimatedTokens * 0.4 * p.output) / 1_000_000;
  const rounded = Math.round(estimatedCost * 10000) / 10000;

  return {
    success: true,
    output: `הערכה למשימה: ~${estimatedTokens.toLocaleString()} טוקנים, ~$${rounded}`,
    estimatedTokens,
    estimatedCost: rounded,
  };
}

export async function getRecentTokenUsage(params: {
  limit?: number;
}): Promise<{ success: boolean; output: string; usage: TokenUsage[] }> {
  const limit = params.limit || 50;
  const recent = usageHistory.slice(-limit);

  const lines = recent.map(u =>
    `[${u.timestamp.toISOString().slice(11, 19)}] ${u.model} — ${u.totalTokens.toLocaleString()} tokens ($${Math.round(u.cost * 10000) / 10000})${u.taskId ? ` [${u.taskId}]` : ""}`
  );

  return {
    success: true,
    output: lines.length > 0 ? lines.join("\n") : "אין שימוש מתועד",
    usage: recent,
  };
}

export async function resetTokenStats(params: {}): Promise<{ success: boolean; output: string }> {
  const prevTotal = usageHistory.length;
  usageHistory.length = 0;
  totalCost = 0;
  totalTokens = 0;
  return { success: true, output: `נמחקו ${prevTotal} רשומות. המונים אופסו.` };
}

export const TOKEN_TRACKER_TOOLS = [
  {
    name: "get_token_stats",
    description: "סטטיסטיקות שימוש בטוקנים — סה\"כ, לפי מודל, לפי משימה, 24 שעות אחרונות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "estimate_token_cost",
    description: "הערכת עלות טוקנים למשימה לפני ביצוע",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "תיאור המשימה להערכה" },
      },
      required: ["task"] as string[],
    },
  },
  {
    name: "get_recent_token_usage",
    description: "הצגת שימוש אחרון בטוקנים — רשימת בקשות עם עלויות",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "מספר רשומות אחרונות (ברירת מחדל: 50)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "reset_token_stats",
    description: "איפוס כל סטטיסטיקות הטוקנים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
