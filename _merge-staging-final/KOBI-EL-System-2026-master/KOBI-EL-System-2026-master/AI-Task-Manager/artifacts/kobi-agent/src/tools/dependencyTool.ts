import { runCommand } from "./terminalTool";
import { searchFiles, searchContent } from "./searchTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

export async function checkOutdated(): Promise<{ success: boolean; output: string; deps?: any[] }> {
  const result = await runCommand({ command: "npm outdated --json 2>/dev/null", timeout: 30000 });
  const deps: any[] = [];
  try {
    const data = JSON.parse(result.stdout);
    for (const [name, info] of Object.entries(data) as any[]) {
      deps.push({ name, version: info.current || "unknown", latest: info.latest, outdated: info.current !== info.latest, type: info.type === "devDependencies" ? "dev" : "prod" });
    }
  } catch {}
  const output = deps.length === 0 ? "All dependencies up to date" : deps.map(d => `${d.name}: ${d.version} → ${d.latest} (${d.type})`).join("\n");
  return { success: true, output, deps };
}

export async function checkVulnerabilities(): Promise<{ success: boolean; output: string; result?: any }> {
  const cmdResult = await runCommand({ command: "npm audit --json 2>/dev/null", timeout: 30000 });
  try {
    const data = JSON.parse(cmdResult.stdout);
    const vuln = data.metadata?.vulnerabilities || {};
    const details: any[] = [];
    if (data.vulnerabilities) {
      for (const [name, info] of Object.entries(data.vulnerabilities) as any[]) {
        details.push({ name, severity: info.severity || "unknown", title: info.via?.[0]?.title || "Unknown", url: info.via?.[0]?.url || "" });
      }
    }
    const result = { total: vuln.total || 0, critical: vuln.critical || 0, high: vuln.high || 0, moderate: vuln.moderate || 0, low: vuln.low || 0, details };
    return { success: true, output: `Vulnerabilities: ${result.total} total (${result.critical} critical, ${result.high} high, ${result.moderate} moderate, ${result.low} low)`, result };
  } catch {
    return { success: true, output: "No vulnerabilities found", result: { total: 0, critical: 0, high: 0, moderate: 0, low: 0, details: [] } };
  }
}

export async function fixVulnerabilities(): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: "npm audit fix", timeout: 60000 });
  return { success: result.success, output: result.stdout + result.stderr };
}

export async function findUnusedDeps(): Promise<{ success: boolean; output: string; unused?: string[] }> {
  const unused: string[] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_DIR, "package.json"), "utf-8"));
    const deps = Object.keys(pkg.dependencies || {});
    for (const dep of deps) {
      const results = await searchContent({ query: dep, filePattern: "**/*.{ts,tsx,js,jsx}", maxResults: 1 });
      if (!results.matches || results.matches.length === 0) unused.push(dep);
    }
  } catch {}
  return { success: true, output: unused.length === 0 ? "No unused dependencies" : `Unused: ${unused.join(", ")}`, unused };
}

export async function findCircularDeps(): Promise<{ success: boolean; output: string; cycles?: any[] }> {
  const result = await runCommand({ command: "npx madge --circular --extensions ts,tsx,js,jsx src/ 2>/dev/null", timeout: 30000 });
  const cycles: Array<{ cycle: string[] }> = [];
  for (const line of result.stdout.split("\n").filter(Boolean)) {
    if (line.includes("->") || line.includes("→")) {
      const parts = line.split(/->|→/).map(p => p.trim());
      if (parts.length > 1) cycles.push({ cycle: parts });
    }
  }
  return { success: true, output: cycles.length === 0 ? "No circular dependencies" : `Found ${cycles.length} circular dependencies:\n${cycles.map(c => c.cycle.join(" → ")).join("\n")}`, cycles };
}

export async function updateDependency(params: { name: string; version?: string }): Promise<{ success: boolean; output: string }> {
  const target = params.version ? `${params.name}@${params.version}` : `${params.name}@latest`;
  const result = await runCommand({ command: `npm install ${target}`, timeout: 60000 });
  return { success: result.success, output: result.stdout + result.stderr };
}

export const DEPENDENCY_TOOLS = [
  { name: "check_outdated", description: "Check for outdated npm dependencies", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "check_vulnerabilities", description: "Run npm audit to find security vulnerabilities", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "fix_vulnerabilities", description: "Auto-fix npm audit vulnerabilities", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "find_unused_deps", description: "Find unused npm dependencies in the project", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "find_circular_deps", description: "Find circular dependencies in the codebase", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "update_dependency", description: "Update a specific dependency to latest or a specific version", input_schema: { type: "object" as const, properties: { name: { type: "string" }, version: { type: "string" } }, required: ["name"] as string[] } },
];