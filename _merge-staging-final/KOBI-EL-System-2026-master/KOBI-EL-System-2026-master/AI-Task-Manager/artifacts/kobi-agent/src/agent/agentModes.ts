export type AgentMode = "auto" | "plan" | "code" | "chat" | "debug" | "review";

interface ModeConfig {
  autoApprove: boolean;
  maxTokens: number;
  temperature: number;
  streamResponses: boolean;
  allowFileWrite: boolean;
  allowTerminal: boolean;
  allowGit: boolean;
  requireConfirmation: boolean;
}

const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  auto: {
    autoApprove: true, maxTokens: 16000, temperature: 0.3,
    streamResponses: true, allowFileWrite: true, allowTerminal: true, allowGit: true, requireConfirmation: false,
  },
  plan: {
    autoApprove: false, maxTokens: 8000, temperature: 0.5,
    streamResponses: true, allowFileWrite: false, allowTerminal: false, allowGit: false, requireConfirmation: true,
  },
  code: {
    autoApprove: true, maxTokens: 16000, temperature: 0.2,
    streamResponses: true, allowFileWrite: true, allowTerminal: true, allowGit: true, requireConfirmation: false,
  },
  chat: {
    autoApprove: true, maxTokens: 4000, temperature: 0.7,
    streamResponses: true, allowFileWrite: false, allowTerminal: false, allowGit: false, requireConfirmation: false,
  },
  debug: {
    autoApprove: true, maxTokens: 16000, temperature: 0.1,
    streamResponses: true, allowFileWrite: true, allowTerminal: true, allowGit: false, requireConfirmation: false,
  },
  review: {
    autoApprove: false, maxTokens: 8000, temperature: 0.3,
    streamResponses: true, allowFileWrite: false, allowTerminal: true, allowGit: false, requireConfirmation: true,
  },
};

const COST_ESTIMATES: Record<string, { tokens: number; minutes: number; cost: number }> = {
  simple: { tokens: 2000, minutes: 1, cost: 0.01 },
  medium: { tokens: 8000, minutes: 5, cost: 0.05 },
  complex: { tokens: 30000, minutes: 15, cost: 0.20 },
  major: { tokens: 80000, minutes: 45, cost: 0.60 },
};

let currentMode: AgentMode = "auto";
const featureFlags: Record<string, boolean> = {
  streaming: true,
  autoCheckpoint: true,
  selfHeal: true,
  proactiveAnalysis: false,
  multiModel: false,
};

export async function getAgentMode(params: {}): Promise<{ success: boolean; output: string }> {
  const config = MODE_CONFIGS[currentMode];
  return {
    success: true,
    output: `🤖 מצב נוכחי: ${currentMode}\n  autoApprove: ${config.autoApprove}\n  maxTokens: ${config.maxTokens}\n  temperature: ${config.temperature}\n  fileWrite: ${config.allowFileWrite}\n  terminal: ${config.allowTerminal}\n  git: ${config.allowGit}`,
  };
}

export async function setAgentMode(params: { mode: string }): Promise<{ success: boolean; output: string }> {
  const mode = params.mode as AgentMode;
  if (!MODE_CONFIGS[mode]) {
    return { success: false, output: `❌ מצב לא חוקי: ${mode}. אפשרויות: ${Object.keys(MODE_CONFIGS).join(", ")}` };
  }
  currentMode = mode;
  return { success: true, output: `✅ מצב שונה ל-${mode}` };
}

export async function toggleAgentFeature(params: { feature: string; value?: boolean }): Promise<{ success: boolean; output: string }> {
  const val = params.value !== undefined ? params.value : !featureFlags[params.feature];
  featureFlags[params.feature] = val;
  return { success: true, output: `✅ ${params.feature}: ${val ? "מופעל" : "כבוי"}` };
}

export async function estimateTaskCost(params: { complexity?: string }): Promise<{ success: boolean; output: string }> {
  const complexity = params.complexity || "medium";
  const est = COST_ESTIMATES[complexity] || COST_ESTIMATES["medium"];
  return {
    success: true,
    output: `📊 הערכה (${complexity}):\n  טוקנים: ~${est.tokens}\n  זמן: ~${est.minutes} דקות\n  עלות: ~$${est.cost}`,
  };
}

export function getModeConfig(): ModeConfig { return MODE_CONFIGS[currentMode]; }
export function getCurrentMode(): AgentMode { return currentMode; }
export function getFeatureFlags(): Record<string, boolean> { return { ...featureFlags }; }

export const AGENT_MODE_TOOLS = [
  {
    name: "get_agent_mode",
    description: "הצגת מצב הסוכן הנוכחי — auto/plan/code/chat/debug/review",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "set_agent_mode",
    description: "שינוי מצב הסוכן — auto/plan/code/chat/debug/review",
    input_schema: {
      type: "object" as const,
      properties: { mode: { type: "string" as const, enum: ["auto", "plan", "code", "chat", "debug", "review"] } },
      required: ["mode"] as string[],
    },
  },
  {
    name: "toggle_agent_feature",
    description: "הפעלה/כיבוי פיצ׳ר — streaming, autoCheckpoint, selfHeal, proactiveAnalysis, multiModel",
    input_schema: {
      type: "object" as const,
      properties: {
        feature: { type: "string" as const },
        value: { type: "boolean" as const },
      },
      required: ["feature"] as string[],
    },
  },
  {
    name: "estimate_task_cost",
    description: "הערכת עלות משימה — simple/medium/complex/major",
    input_schema: {
      type: "object" as const,
      properties: { complexity: { type: "string" as const, enum: ["simple", "medium", "complex", "major"] } },
      required: [] as string[],
    },
  },
];
