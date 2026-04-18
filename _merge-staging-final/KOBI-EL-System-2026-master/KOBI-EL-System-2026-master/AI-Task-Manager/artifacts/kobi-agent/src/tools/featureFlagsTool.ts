import * as fs from "fs";
import * as path from "path";
import { writeFile } from "./fileTool";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const FLAGS_FILE = path.join(WORKSPACE_DIR, ".agent", "feature-flags.json");

interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  percentage?: number;
  userWhitelist?: string[];
  environments?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

const flags = new Map<string, FeatureFlag>();

function loadFlags() {
  try {
    if (fs.existsSync(FLAGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(FLAGS_FILE, "utf-8"));
      for (const [key, flag] of data) flags.set(key, flag);
    }
  } catch {}
}

function saveFlags() {
  const dir = path.dirname(FLAGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FLAGS_FILE, JSON.stringify(Array.from(flags.entries()), null, 2));
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

loadFlags();

export async function createFeatureFlag(params: { key: string; name: string; description: string; enabled?: boolean; percentage?: number; userWhitelist?: string[]; environments?: string[]; metadata?: Record<string, any> }): Promise<{ success: boolean; output: string }> {
  const flag: FeatureFlag = { key: params.key, name: params.name, description: params.description, enabled: params.enabled !== false, percentage: params.percentage, userWhitelist: params.userWhitelist, environments: params.environments, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: params.metadata };
  flags.set(params.key, flag);
  saveFlags();
  return { success: true, output: `Created feature flag "${params.name}" (${params.key})\nEnabled: ${flag.enabled}${flag.percentage !== undefined ? `\nRollout: ${flag.percentage}%` : ""}` };
}

export async function checkFeatureFlag(params: { key: string; userId?: string; environment?: string }): Promise<{ success: boolean; output: string }> {
  const flag = flags.get(params.key);
  if (!flag) return { success: false, output: `Flag "${params.key}" not found` };
  if (!flag.enabled) return { success: true, output: `Flag "${params.key}": DISABLED` };

  if (flag.environments?.length && params.environment) {
    if (!flag.environments.includes(params.environment)) return { success: true, output: `Flag "${params.key}": DISABLED (env "${params.environment}" not in [${flag.environments.join(", ")}])` };
  }

  if (flag.userWhitelist?.length && params.userId) {
    if (flag.userWhitelist.includes(params.userId)) return { success: true, output: `Flag "${params.key}": ENABLED (user whitelisted)` };
  }

  if (flag.percentage !== undefined && flag.percentage < 100) {
    if (params.userId) {
      const enabled = (hashString(`${params.key}:${params.userId}`) % 100) < flag.percentage;
      return { success: true, output: `Flag "${params.key}": ${enabled ? "ENABLED" : "DISABLED"} (${flag.percentage}% rollout, user hash)` };
    }
    return { success: true, output: `Flag "${params.key}": ${flag.percentage}% rollout (no user context)` };
  }

  return { success: true, output: `Flag "${params.key}": ENABLED` };
}

export async function toggleFeatureFlag(params: { key: string }): Promise<{ success: boolean; output: string }> {
  const flag = flags.get(params.key);
  if (!flag) return { success: false, output: `Flag "${params.key}" not found` };
  flag.enabled = !flag.enabled;
  flag.updatedAt = new Date().toISOString();
  saveFlags();
  return { success: true, output: `Flag "${params.key}" is now ${flag.enabled ? "ENABLED" : "DISABLED"}` };
}

export async function updateFeatureFlag(params: { key: string; name?: string; description?: string; enabled?: boolean; percentage?: number; userWhitelist?: string[]; environments?: string[] }): Promise<{ success: boolean; output: string }> {
  const flag = flags.get(params.key);
  if (!flag) return { success: false, output: `Flag "${params.key}" not found` };
  if (params.name !== undefined) flag.name = params.name;
  if (params.description !== undefined) flag.description = params.description;
  if (params.enabled !== undefined) flag.enabled = params.enabled;
  if (params.percentage !== undefined) flag.percentage = params.percentage;
  if (params.userWhitelist !== undefined) flag.userWhitelist = params.userWhitelist;
  if (params.environments !== undefined) flag.environments = params.environments;
  flag.updatedAt = new Date().toISOString();
  saveFlags();
  return { success: true, output: `Updated flag "${params.key}"` };
}

export async function deleteFeatureFlag(params: { key: string }): Promise<{ success: boolean; output: string }> {
  if (!flags.delete(params.key)) return { success: false, output: `Flag "${params.key}" not found` };
  saveFlags();
  return { success: true, output: `Deleted flag "${params.key}"` };
}

export async function listFeatureFlags(): Promise<{ success: boolean; output: string }> {
  const all = Array.from(flags.values());
  if (!all.length) return { success: true, output: "No feature flags defined" };
  return { success: true, output: all.map(f => `[${f.enabled ? "ON" : "OFF"}] ${f.key}: ${f.name}\n  ${f.description}${f.percentage !== undefined ? ` | Rollout: ${f.percentage}%` : ""}${f.environments?.length ? ` | Envs: ${f.environments.join(",")}` : ""}`).join("\n\n") };
}

export async function generateFlagSDK(): Promise<{ success: boolean; output: string }> {
  const flagData = Object.fromEntries(Array.from(flags.entries()).map(([key, flag]) => [key, { enabled: flag.enabled, percentage: flag.percentage }]));

  const code = `const FLAGS: Record<string, { enabled: boolean; percentage?: number }> = ${JSON.stringify(flagData, null, 2)};

export function isFeatureEnabled(key: string, userId?: string): boolean {
  const flag = FLAGS[key];
  if (!flag || !flag.enabled) return false;
  if (flag.percentage !== undefined && flag.percentage < 100 && userId) {
    let hash = 0;
    const str = key + ':' + userId;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return (Math.abs(hash) % 100) < flag.percentage;
  }
  return true;
}

export function getAllFlags(): Record<string, boolean> {
  return Object.fromEntries(Object.entries(FLAGS).map(([key, flag]) => [key, flag.enabled]));
}
`;

  await writeFile({ path: "src/lib/featureFlags.ts", content: code });
  return { success: true, output: `Generated client SDK → src/lib/featureFlags.ts\nFlags: ${Object.keys(flagData).join(", ") || "none"}` };
}

export const FEATURE_FLAGS_TOOLS = [
  { name: "create_feature_flag", description: "Create a feature flag with optional percentage rollout, user whitelist, and environment targeting", input_schema: { type: "object" as const, properties: { key: { type: "string", description: "Unique flag key (e.g. 'new_dashboard')" }, name: { type: "string" }, description: { type: "string" }, enabled: { type: "boolean" }, percentage: { type: "number", description: "Rollout percentage 0-100" }, userWhitelist: { type: "array", items: { type: "string" } }, environments: { type: "array", items: { type: "string" }, description: "e.g. ['production','staging']" }, metadata: { type: "object" } }, required: ["key", "name", "description"] as string[] } },
  { name: "check_feature_flag", description: "Check if a feature flag is enabled for a given user/environment context", input_schema: { type: "object" as const, properties: { key: { type: "string" }, userId: { type: "string" }, environment: { type: "string" } }, required: ["key"] as string[] } },
  { name: "toggle_feature_flag", description: "Toggle a feature flag on/off", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "update_feature_flag", description: "Update feature flag properties (name, description, percentage, whitelist, environments)", input_schema: { type: "object" as const, properties: { key: { type: "string" }, name: { type: "string" }, description: { type: "string" }, enabled: { type: "boolean" }, percentage: { type: "number" }, userWhitelist: { type: "array", items: { type: "string" } }, environments: { type: "array", items: { type: "string" } } }, required: ["key"] as string[] } },
  { name: "delete_feature_flag", description: "Delete a feature flag", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "list_feature_flags", description: "List all feature flags with their status", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_flag_sdk", description: "Generate a client-side TypeScript SDK for feature flags", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];