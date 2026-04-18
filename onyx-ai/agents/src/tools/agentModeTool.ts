export type AgentMode = "lite" | "economy" | "power" | "turbo" | "max";

export interface ModeConfig {
  name: string;
  description: string;
  model: string;
  maxTokens: number;
  maxSteps: number;
  maxRetries: number;
  maxDuration: number;
  autoTest: boolean;
  autoLint: boolean;
  autoOptimize: boolean;
  autoSnapshot: boolean;
  parallelAgents: boolean;
  webSearch: boolean;
  extendedThinking: boolean;
  costMultiplier: number;
}

export const AGENT_MODES: Record<AgentMode, ModeConfig> = {
  lite: {
    name: "Lite",
    description: "תיקונים מהירים, שינויים ויזואליים, פיצ'רים ממוקדים (10-60 שניות)",
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2048,
    maxSteps: 5,
    maxRetries: 1,
    maxDuration: 2,
    autoTest: false,
    autoLint: false,
    autoOptimize: false,
    autoSnapshot: false,
    parallelAgents: false,
    webSearch: false,
    extendedThinking: false,
    costMultiplier: 0.2,
  },
  economy: {
    name: "Economy",
    description: "חסכוני — מתאים למשימות סטנדרטיות",
    model: "claude-sonnet-4-20250514",
    maxTokens: 4096,
    maxSteps: 25,
    maxRetries: 3,
    maxDuration: 30,
    autoTest: true,
    autoLint: true,
    autoOptimize: false,
    autoSnapshot: true,
    parallelAgents: false,
    webSearch: true,
    extendedThinking: false,
    costMultiplier: 1,
  },
  power: {
    name: "Power",
    description: "מודל חזק — משימות מורכבות",
    model: "claude-sonnet-4-20250514",
    maxTokens: 8192,
    maxSteps: 50,
    maxRetries: 5,
    maxDuration: 60,
    autoTest: true,
    autoLint: true,
    autoOptimize: true,
    autoSnapshot: true,
    parallelAgents: true,
    webSearch: true,
    extendedThinking: true,
    costMultiplier: 2,
  },
  turbo: {
    name: "Turbo",
    description: "מהיר x2.5 — משימות גדולות במהירות",
    model: "claude-sonnet-4-20250514",
    maxTokens: 8192,
    maxSteps: 50,
    maxRetries: 3,
    maxDuration: 60,
    autoTest: true,
    autoLint: true,
    autoOptimize: true,
    autoSnapshot: true,
    parallelAgents: true,
    webSearch: true,
    extendedThinking: true,
    costMultiplier: 6,
  },
  max: {
    name: "Max",
    description: "ריצה ארוכה — פרויקטים מורכבים (200+ דקות)",
    model: "claude-sonnet-4-20250514",
    maxTokens: 8192,
    maxSteps: 200,
    maxRetries: 10,
    maxDuration: 200,
    autoTest: true,
    autoLint: true,
    autoOptimize: true,
    autoSnapshot: true,
    parallelAgents: true,
    webSearch: true,
    extendedThinking: true,
    costMultiplier: 4,
  },
};

let currentMode: AgentMode = "power";
let features = {
  webSearch: true,
  extendedThinking: false,
  appTesting: true,
  codeOptimizations: true,
};

export function getCurrentModeConfig(): ModeConfig {
  const base = { ...AGENT_MODES[currentMode] };
  base.webSearch = features.webSearch;
  base.extendedThinking = features.extendedThinking;
  base.autoTest = features.appTesting;
  base.autoOptimize = features.codeOptimizations;
  return base;
}

export async function setAgentMode(params: {
  mode: string;
}): Promise<{ success: boolean; output: string; config: ModeConfig }> {
  const mode = params.mode as AgentMode;
  if (!AGENT_MODES[mode]) {
    return { success: false, output: `מצב לא ידוע: ${params.mode}. אפשרויות: lite, economy, power, turbo, max`, config: getCurrentModeConfig() };
  }
  currentMode = mode;
  const config = getCurrentModeConfig();
  return {
    success: true,
    output: `מצב שונה ל-${config.name}: ${config.description}\nמודל: ${config.model} | מקסימום צעדים: ${config.maxSteps} | זמן מקסימלי: ${config.maxDuration} דק'`,
    config,
  };
}

export async function getAgentMode(params: {}): Promise<{ success: boolean; output: string; mode: AgentMode; config: ModeConfig; features: typeof features }> {
  const config = getCurrentModeConfig();
  const lines = [
    `מצב נוכחי: ${config.name} (${currentMode})`,
    `תיאור: ${config.description}`,
    `מודל: ${config.model}`,
    `מקסימום טוקנים: ${config.maxTokens} | צעדים: ${config.maxSteps} | ניסיונות: ${config.maxRetries}`,
    `זמן מקסימלי: ${config.maxDuration} דקות`,
    `\nפיצ'רים:`,
    `  חיפוש אינטרנט: ${features.webSearch ? "✅" : "❌"}`,
    `  חשיבה מורחבת: ${features.extendedThinking ? "✅" : "❌"}`,
    `  בדיקות אוטומטיות: ${features.appTesting ? "✅" : "❌"}`,
    `  אופטימיזציית קוד: ${features.codeOptimizations ? "✅" : "❌"}`,
  ];
  return { success: true, output: lines.join("\n"), mode: currentMode, config, features: { ...features } };
}

export async function toggleAgentFeature(params: {
  feature: string;
  enabled?: boolean;
}): Promise<{ success: boolean; output: string }> {
  const validFeatures = ["webSearch", "extendedThinking", "appTesting", "codeOptimizations"];
  if (!validFeatures.includes(params.feature)) {
    return { success: false, output: `פיצ'ר לא ידוע: ${params.feature}. אפשרויות: ${validFeatures.join(", ")}` };
  }
  const key = params.feature as keyof typeof features;
  features[key] = params.enabled !== undefined ? params.enabled : !features[key];
  return { success: true, output: `${params.feature}: ${features[key] ? "✅ מופעל" : "❌ מכובה"}` };
}

export async function estimateModeCost(params: {
  complexity: string;
}): Promise<{ success: boolean; output: string; tokens: number; cost: number; duration: string }> {
  const complexity = params.complexity as "simple" | "medium" | "complex";
  if (!["simple", "medium", "complex"].includes(complexity)) {
    return { success: false, output: `רמת מורכבות לא ידועה: ${params.complexity}. אפשרויות: simple, medium, complex`, tokens: 0, cost: 0, duration: "" };
  }
  const config = getCurrentModeConfig();
  const baseTokens = { simple: 5000, medium: 25000, complex: 80000 }[complexity];
  const tokens = baseTokens * config.costMultiplier;
  const costPer1M = config.model.includes("haiku") ? 4.8 : 18;
  const cost = (tokens * costPer1M) / 1_000_000;
  const minutes = { simple: 1, medium: 5, complex: 15 }[complexity] * (config.costMultiplier > 3 ? 0.4 : 1);
  const result = { tokens: Math.round(tokens), cost: Math.round(cost * 1000) / 1000, duration: `~${Math.round(minutes)} דק'` };

  return {
    success: true,
    output: `הערכה (${config.name}, ${complexity}): ~${result.tokens.toLocaleString()} טוקנים, $${result.cost}, ${result.duration}`,
    ...result,
  };
}

export async function listAgentModes(params: {}): Promise<{ success: boolean; output: string }> {
  const lines = Object.entries(AGENT_MODES).map(([key, cfg]) => {
    const active = key === currentMode ? " ← נוכחי" : "";
    return `${cfg.name} (${key})${active}: ${cfg.description} | מודל: ${cfg.model} | צעדים: ${cfg.maxSteps}`;
  });
  return { success: true, output: lines.join("\n") };
}

export const AGENT_MODE_TOOLS = [
  {
    name: "set_agent_mode",
    description: "שינוי מצב עבודה — lite (מהיר), economy (חסכוני), power (חזק), turbo (מהיר x2.5), max (ריצה ארוכה)",
    input_schema: {
      type: "object" as const,
      properties: {
        mode: { type: "string", description: "lite, economy, power, turbo, max" },
      },
      required: ["mode"] as string[],
    },
  },
  {
    name: "get_agent_mode",
    description: "הצגת מצב עבודה נוכחי + פיצ'רים פעילים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "toggle_agent_feature",
    description: "הפעלה/כיבוי פיצ'ר — webSearch, extendedThinking, appTesting, codeOptimizations",
    input_schema: {
      type: "object" as const,
      properties: {
        feature: { type: "string", description: "webSearch, extendedThinking, appTesting, codeOptimizations" },
        enabled: { type: "boolean", description: "true להפעלה, false לכיבוי (אופציונלי — בלי ערך = toggle)" },
      },
      required: ["feature"] as string[],
    },
  },
  {
    name: "estimate_mode_cost",
    description: "הערכת עלות לפי מצב ומורכבות (simple/medium/complex)",
    input_schema: {
      type: "object" as const,
      properties: {
        complexity: { type: "string", description: "simple, medium, complex" },
      },
      required: ["complexity"] as string[],
    },
  },
  {
    name: "list_agent_modes",
    description: "הצגת כל מצבי העבודה הזמינים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
