import { readFile, writeFile } from "./fileTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

function parseEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function envToString(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => {
      const needsQuotes = value.includes(" ") || value.includes("#") || value.includes("=");
      return `${key}=${needsQuotes ? `"${value}"` : value}`;
    })
    .join("\n") + "\n";
}

export async function getEnvVars(params: { file?: string } = {}): Promise<{ success: boolean; output: string; vars?: Record<string, string> }> {
  const filePath = params.file || ".env";
  const result = await readFile({ path: filePath });
  if (!result.success) return { success: false, output: `Cannot read ${filePath}` };
  const vars = parseEnvContent(result.output || "");
  return { success: true, output: Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n"), vars };
}

export async function setEnvVar(params: { key: string; value: string; file?: string }): Promise<{ success: boolean; output: string }> {
  const filePath = params.file || ".env";
  const result = await readFile({ path: filePath });
  const env = result.success ? parseEnvContent(result.output || "") : {};
  env[params.key] = params.value;
  const writeResult = await writeFile({ path: filePath, content: envToString(env) });
  return { success: writeResult.success, output: `Set ${params.key} in ${filePath}` };
}

export async function removeEnvVar(params: { key: string; file?: string }): Promise<{ success: boolean; output: string }> {
  const filePath = params.file || ".env";
  const result = await readFile({ path: filePath });
  if (!result.success) return { success: false, output: `Cannot read ${filePath}` };
  const env = parseEnvContent(result.output || "");
  delete env[params.key];
  const writeResult = await writeFile({ path: filePath, content: envToString(env) });
  return { success: writeResult.success, output: `Removed ${params.key} from ${filePath}` };
}

export async function generateEnvExample(params: { file?: string } = {}): Promise<{ success: boolean; output: string }> {
  const filePath = params.file || ".env";
  const result = await readFile({ path: filePath });
  if (!result.success) return { success: false, output: `Cannot read ${filePath}` };
  const env = parseEnvContent(result.output || "");
  const example = Object.entries(env)
    .map(([key, value]) => {
      const sensitive = ["key", "secret", "password", "token", "api"].some(s => key.toLowerCase().includes(s));
      return `${key}=${sensitive ? "your_value_here" : value}`;
    })
    .join("\n") + "\n";
  const writeResult = await writeFile({ path: ".env.example", content: example });
  return { success: writeResult.success, output: "Generated .env.example" };
}

export async function validateEnv(params: {
  schema: Record<string, { required?: boolean; type?: string; default?: string }>;
  file?: string;
}): Promise<{ success: boolean; output: string; missing?: string[]; invalid?: string[] }> {
  const filePath = params.file || ".env";
  const result = await readFile({ path: filePath });
  const env = result.success ? parseEnvContent(result.output || "") : {};
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [key, rules] of Object.entries(params.schema)) {
    const value = env[key];
    if (!value && rules.required && !rules.default) { missing.push(key); continue; }
    const actual = value || rules.default;
    if (actual && rules.type) {
      switch (rules.type) {
        case "number": if (isNaN(Number(actual))) invalid.push(`${key} should be a number`); break;
        case "boolean": if (!["true", "false", "1", "0"].includes(actual.toLowerCase())) invalid.push(`${key} should be boolean`); break;
        case "url": try { new URL(actual); } catch { invalid.push(`${key} should be a URL`); } break;
      }
    }
  }

  const valid = missing.length === 0 && invalid.length === 0;
  return { success: valid, output: valid ? "All env vars valid" : `Missing: ${missing.join(", ")} | Invalid: ${invalid.join(", ")}`, missing, invalid };
}

export async function generateEnvTypes(params: { file?: string } = {}): Promise<{ success: boolean; output: string }> {
  const filePath = params.file || ".env";
  const result = await readFile({ path: filePath });
  if (!result.success) return { success: false, output: `Cannot read ${filePath}` };
  const env = parseEnvContent(result.output || "");
  let types = `declare namespace NodeJS {\n  interface ProcessEnv {\n`;
  for (const key of Object.keys(env)) types += `    ${key}: string;\n`;
  types += `  }\n}\n`;
  const writeResult = await writeFile({ path: "env.d.ts", content: types });
  return { success: writeResult.success, output: "Generated env.d.ts" };
}

export async function ensureGitignore(): Promise<{ success: boolean; output: string }> {
  const gitignorePath = path.join(WORKSPACE_DIR, ".gitignore");
  let content = "";
  if (fs.existsSync(gitignorePath)) content = fs.readFileSync(gitignorePath, "utf-8");
  const required = [".env", ".env.local", ".env.*.local"];
  const missing = required.filter(e => !content.includes(e));
  if (missing.length > 0) {
    content += "\n# Environment variables\n" + missing.join("\n") + "\n";
    fs.writeFileSync(gitignorePath, content);
  }
  return { success: true, output: missing.length > 0 ? `Added ${missing.join(", ")} to .gitignore` : ".gitignore already up to date" };
}

export const ENV_TOOLS = [
  { name: "get_env_vars", description: "Read all environment variables from .env file", input_schema: { type: "object" as const, properties: { file: { type: "string" } }, required: [] as string[] } },
  { name: "set_env_var", description: "Set an environment variable in .env file", input_schema: { type: "object" as const, properties: { key: { type: "string" }, value: { type: "string" }, file: { type: "string" } }, required: ["key", "value"] as string[] } },
  { name: "remove_env_var", description: "Remove an environment variable from .env file", input_schema: { type: "object" as const, properties: { key: { type: "string" }, file: { type: "string" } }, required: ["key"] as string[] } },
  { name: "generate_env_example", description: "Generate .env.example with sensitive values masked", input_schema: { type: "object" as const, properties: { file: { type: "string" } }, required: [] as string[] } },
  { name: "validate_env", description: "Validate environment variables against a schema", input_schema: { type: "object" as const, properties: { schema: { type: "object" }, file: { type: "string" } }, required: ["schema"] as string[] } },
  { name: "generate_env_types", description: "Generate TypeScript type declarations for env vars", input_schema: { type: "object" as const, properties: { file: { type: "string" } }, required: [] as string[] } },
  { name: "ensure_gitignore", description: "Ensure .env files are in .gitignore", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];