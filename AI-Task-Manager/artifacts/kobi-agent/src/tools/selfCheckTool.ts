import * as fs from "fs";
import * as path from "path";
import { runCommand } from "./terminalTool";
import { readFile, writeFile } from "./fileTool";
import type { ToolDef } from "../llm/client";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn" | "fixed";
  message: string;
  details?: string;
  autoFixed?: boolean;
  duration: number;
}

interface FullCheckReport {
  timestamp: string;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  autoFixed: number;
  checks: CheckResult[];
  overallStatus: "healthy" | "degraded" | "broken";
  totalDuration: number;
}

async function execCmd(cmd: string, timeout = 15000): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const r = await runCommand({ command: cmd, timeout, cwd: WORKSPACE });
  return { stdout: r.stdout || "", stderr: r.stderr || "", success: r.success };
}

async function checkFileStructure(): Promise<CheckResult> {
  const start = Date.now();
  const requiredDirs = ["src", "src/agent", "src/tools", "src/llm", "src/flows", "src/core", "src/ws", "src/ui"];
  const requiredFiles = [
    "src/index.ts", "src/agent/core.ts", "src/agent/planner.ts", "src/agent/executor.ts",
    "src/agent/errorHandler.ts", "src/agent/memory.ts", "src/llm/client.ts", "src/llm/prompts.ts",
    "src/llm/parser.ts", "src/core/speed.ts", "src/core/brain.ts", "src/ws/socket.ts",
    "src/ui/index.html", "package.json", "tsconfig.json",
  ];
  const missingDirs: string[] = [];
  const missingFiles: string[] = [];

  for (const dir of requiredDirs) {
    const fullPath = path.join(WORKSPACE, dir);
    if (!fs.existsSync(fullPath)) {
      missingDirs.push(dir);
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(WORKSPACE, file))) missingFiles.push(file);
  }

  if (missingFiles.length > 0) {
    return { name: "file-structure", status: missingDirs.length > 0 ? "fixed" : "fail", message: `Missing ${missingFiles.length} files: ${missingFiles.slice(0, 5).join(", ")}`, details: missingFiles.join("\n"), autoFixed: missingDirs.length > 0, duration: Date.now() - start };
  }
  return { name: "file-structure", status: "pass", message: `${requiredDirs.length} dirs, ${requiredFiles.length} files OK`, duration: Date.now() - start };
}

async function checkPackageJson(): Promise<CheckResult> {
  const start = Date.now();
  const pkgPath = path.join(WORKSPACE, "package.json");
  if (!fs.existsSync(pkgPath)) {
    await execCmd("npm init -y", 10000);
    return { name: "package-json", status: "fixed", message: "Created package.json", autoFixed: true, duration: Date.now() - start };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const issues: string[] = [];
    pkg.scripts = pkg.scripts || {};
    if (!pkg.scripts.dev) { pkg.scripts.dev = "tsx watch src/index.ts"; issues.push("Added dev script"); }
    if (!pkg.scripts.build) { pkg.scripts.build = "tsc"; issues.push("Added build script"); }
    if (!pkg.scripts.start) { pkg.scripts.start = "node dist/index.js"; issues.push("Added start script"); }

    const requiredDeps = ["@anthropic-ai/sdk", "express", "ws", "dotenv", "uuid"];
    const missingDeps = requiredDeps.filter(d => !pkg.dependencies?.[d] && !pkg.devDependencies?.[d]);

    if (issues.length > 0) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    if (missingDeps.length > 0) {
      await execCmd(`npm install ${missingDeps.join(" ")}`, 120000);
      return { name: "package-json", status: "fixed", message: `Installed ${missingDeps.length} missing deps`, autoFixed: true, duration: Date.now() - start };
    }
    if (issues.length > 0) return { name: "package-json", status: "fixed", message: issues.join("; "), autoFixed: true, duration: Date.now() - start };
    return { name: "package-json", status: "pass", message: `${Object.keys(pkg.dependencies || {}).length} deps OK`, duration: Date.now() - start };
  } catch (err: any) {
    return { name: "package-json", status: "fail", message: `Invalid JSON: ${err.message}`, duration: Date.now() - start };
  }
}

async function checkNodeModules(): Promise<CheckResult> {
  const start = Date.now();
  const nmPath = path.join(WORKSPACE, "node_modules");
  if (!fs.existsSync(nmPath)) {
    const r = await execCmd("npm install", 180000);
    return { name: "node-modules", status: r.success ? "fixed" : "fail", message: r.success ? "Installed dependencies" : "npm install failed", autoFixed: r.success, duration: Date.now() - start };
  }
  const r = await execCmd("npm ls --depth=0 2>&1 | grep -c 'MISSING\\|ERR'", 30000);
  const errorCount = parseInt(r.stdout.trim()) || 0;
  if (errorCount > 0) {
    await execCmd("rm -rf node_modules package-lock.json && npm install", 180000);
    return { name: "node-modules", status: "fixed", message: `Reinstalled ${errorCount} broken deps`, autoFixed: true, duration: Date.now() - start };
  }
  return { name: "node-modules", status: "pass", message: "Dependencies intact", duration: Date.now() - start };
}

async function checkTsConfig(): Promise<CheckResult> {
  const start = Date.now();
  const tscPath = path.join(WORKSPACE, "tsconfig.json");
  if (!fs.existsSync(tscPath)) {
    fs.writeFileSync(tscPath, JSON.stringify({
      compilerOptions: { target: "ES2022", module: "commonjs", lib: ["ES2022"], outDir: "./dist", rootDir: "./src", strict: true, esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, resolveJsonModule: true, declaration: true, sourceMap: true },
      include: ["src/**/*"], exclude: ["node_modules", "dist"],
    }, null, 2));
    return { name: "tsconfig", status: "fixed", message: "Created tsconfig.json", autoFixed: true, duration: Date.now() - start };
  }
  try {
    JSON.parse(fs.readFileSync(tscPath, "utf-8"));
    return { name: "tsconfig", status: "pass", message: "Valid", duration: Date.now() - start };
  } catch (err: any) {
    return { name: "tsconfig", status: "fail", message: `Invalid: ${err.message}`, duration: Date.now() - start };
  }
}

async function checkTypeScript(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("npx tsc --noEmit 2>&1 | tail -20", 60000);
  const errorLines = r.stdout.split("\n").filter(l => l.includes("error TS"));
  if (errorLines.length === 0 && r.success) {
    return { name: "typescript", status: "pass", message: "0 errors", duration: Date.now() - start };
  }
  if (errorLines.length > 0) {
    let fixed = 0;
    for (const line of errorLines.slice(0, 20)) {
      const fileMatch = line.match(/^(.+?)\(\d+,\d+\):/);
      const errorMatch = line.match(/error TS(\d+):/);
      if (!fileMatch || !errorMatch) continue;
      const errorCode = errorMatch[1];
      if (errorCode === "2307") {
        const moduleMatch = line.match(/Cannot find module '([^']+)'/);
        if (moduleMatch && !moduleMatch[1].startsWith(".")) {
          const installR = await execCmd(`npm install ${moduleMatch[1]} 2>/dev/null || npm install @types/${moduleMatch[1]} -D 2>/dev/null`, 30000);
          if (installR.success) fixed++;
        }
      }
      if (errorCode === "7016") {
        const modMatch = line.match(/'([^']+)'/);
        if (modMatch) { await execCmd(`npm install -D @types/${modMatch[1]} 2>/dev/null`, 15000); fixed++; }
      }
    }
    if (fixed > 0) return { name: "typescript", status: "fixed", message: `${errorLines.length} errors, auto-fixed ${fixed}`, details: errorLines.slice(0, 10).join("\n"), autoFixed: true, duration: Date.now() - start };
    return { name: "typescript", status: errorLines.length > 10 ? "fail" : "warn", message: `${errorLines.length} type errors`, details: errorLines.slice(0, 10).join("\n"), duration: Date.now() - start };
  }
  return { name: "typescript", status: "warn", message: "Compilation issues", details: r.stderr, duration: Date.now() - start };
}

async function checkImports(): Promise<CheckResult> {
  const start = Date.now();
  const findR = await execCmd("find src -name '*.ts' -not -path '*/node_modules/*' 2>/dev/null | head -100", 10000);
  const files = findR.stdout.split("\n").filter(Boolean);
  let totalImports = 0, brokenCount = 0;
  const brokenImports: string[] = [];

  for (const file of files) {
    const fullPath = path.join(WORKSPACE, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");
    const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      totalImports++;
      const importPath = match[1];
      const fileDir = path.dirname(fullPath);
      const resolvedBase = path.resolve(fileDir, importPath);
      const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
      const exists = extensions.some(ext => fs.existsSync(resolvedBase + ext)) || fs.existsSync(resolvedBase);
      if (!exists) { brokenCount++; brokenImports.push(`${file}: import "${importPath}" — NOT FOUND`); }
    }
  }

  if (brokenCount > 0) return { name: "imports", status: brokenCount > 10 ? "fail" : "warn", message: `${brokenCount}/${totalImports} imports broken`, details: brokenImports.slice(0, 20).join("\n"), duration: Date.now() - start };
  return { name: "imports", status: "pass", message: `${totalImports} imports OK`, duration: Date.now() - start };
}

async function checkEnvFile(): Promise<CheckResult> {
  const start = Date.now();
  const envPath = path.join(WORKSPACE, ".env");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `ANTHROPIC_API_KEY=\nPORT=3000\nWORKSPACE_DIR=./workspace\nMAX_RETRIES=5\nMAX_STEPS=50\nMODEL=claude-sonnet-4-20250514\nNODE_ENV=development\n`);
    return { name: "env-file", status: "fixed", message: "Created .env template — add your API key", autoFixed: true, duration: Date.now() - start };
  }
  const content = fs.readFileSync(envPath, "utf-8");
  if (!content.includes("ANTHROPIC_API_KEY") || content.includes("ANTHROPIC_API_KEY=\n") || content.includes("ANTHROPIC_API_KEY= ")) {
    return { name: "env-file", status: "warn", message: "ANTHROPIC_API_KEY is empty", duration: Date.now() - start };
  }
  return { name: "env-file", status: "pass", message: "Environment configured", duration: Date.now() - start };
}

async function checkAPIKey(): Promise<CheckResult> {
  const start = Date.now();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { name: "api-key", status: "fail", message: "ANTHROPIC_API_KEY not set", duration: Date.now() - start };
  if (!key.startsWith("sk-ant-")) return { name: "api-key", status: "warn", message: "API key format looks wrong (should start with sk-ant-)", duration: Date.now() - start };
  return { name: "api-key", status: "pass", message: "Key configured", duration: Date.now() - start };
}

async function checkExports(): Promise<CheckResult> {
  const start = Date.now();
  const keyExports = [
    { file: "src/agent/core.ts", expected: ["Agent", "AgentConfig"] },
    { file: "src/agent/memory.ts", expected: ["AgentMemory"] },
    { file: "src/core/speed.ts", expected: ["fastLLM", "fastExec", "ParallelExecutor"] },
    { file: "src/core/brain.ts", expected: ["Brain"] },
  ];
  const missing: string[] = [];
  for (const { file, expected } of keyExports) {
    const fullPath = path.join(WORKSPACE, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");
    for (const exp of expected) {
      if (!content.includes("export") || (!content.includes(`export class ${exp}`) && !content.includes(`export function ${exp}`) && !content.includes(`export async function ${exp}`) && !content.includes(`export interface ${exp}`) && !content.includes(`export { ${exp}`))) {
        missing.push(`${file}: missing export "${exp}"`);
      }
    }
  }
  if (missing.length > 0) return { name: "exports", status: "warn", message: `${missing.length} missing exports`, details: missing.join("\n"), duration: Date.now() - start };
  return { name: "exports", status: "pass", message: "All key exports present", duration: Date.now() - start };
}

async function checkCircularDeps(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("npx madge --circular --extensions ts src/ 2>/dev/null | head -20", 30000);
  if (r.stdout.trim() && !r.stdout.includes("No circular")) {
    const cycles = r.stdout.split("\n").filter(Boolean).length;
    return { name: "circular-deps", status: cycles > 5 ? "warn" : "pass", message: `${cycles} circular dependency chains`, details: r.stdout, duration: Date.now() - start };
  }
  return { name: "circular-deps", status: "pass", message: "No cycles", duration: Date.now() - start };
}

async function checkDuplicates(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("grep -rn 'export interface\\|export class\\|export function' src/ 2>/dev/null | awk -F'[ {(]' '{print $NF}' | sort | uniq -d | head -10", 10000);
  const dupes = r.stdout.trim().split("\n").filter(Boolean);
  if (dupes.length > 0) return { name: "duplicates", status: "warn", message: `${dupes.length} duplicate names: ${dupes.join(", ")}`, duration: Date.now() - start };
  return { name: "duplicates", status: "pass", message: "No duplicate exports", duration: Date.now() - start };
}

async function checkPorts(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("lsof -ti:3000 2>/dev/null", 3000);
  if (r.stdout.trim()) return { name: "ports", status: "warn", message: `Port 3000 in use (PID: ${r.stdout.trim()})`, duration: Date.now() - start };
  return { name: "ports", status: "pass", message: "Port 3000 available", duration: Date.now() - start };
}

async function checkDiskSpace(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("df -h / | tail -1 | awk '{print $5}'", 3000);
  const usage = parseInt(r.stdout.replace("%", "")) || 0;
  if (usage > 95) {
    await execCmd("npm cache clean --force 2>/dev/null; find /tmp -type f -mtime +1 -delete 2>/dev/null");
    return { name: "disk-space", status: "fixed", message: `Disk was ${usage}% full, cleaned`, autoFixed: true, duration: Date.now() - start };
  }
  if (usage > 85) return { name: "disk-space", status: "warn", message: `Disk ${usage}% full`, duration: Date.now() - start };
  return { name: "disk-space", status: "pass", message: `${usage}% used`, duration: Date.now() - start };
}

async function checkNodeVersion(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("node -v", 3000);
  const version = r.stdout.trim();
  const major = parseInt(version.replace("v", ""));
  if (major < 18) return { name: "node-version", status: "fail", message: `Node ${version} too old (need 18+)`, duration: Date.now() - start };
  return { name: "node-version", status: "pass", message: version, duration: Date.now() - start };
}

async function checkSyntax(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("find src -name '*.ts' -exec node -e 'try{require(\"typescript\").transpileModule(require(\"fs\").readFileSync(process.argv[1],\"utf-8\"),{});console.log(\"OK:\"+process.argv[1])}catch(e){console.log(\"ERR:\"+process.argv[1]+\":\"+e.message)}' {} \\; 2>/dev/null | grep '^ERR:' | head -10", 30000);
  const errors = r.stdout.split("\n").filter(l => l.startsWith("ERR:"));
  if (errors.length > 0) return { name: "syntax", status: "warn", message: `${errors.length} files with syntax issues`, details: errors.join("\n"), duration: Date.now() - start };
  return { name: "syntax", status: "pass", message: "All files valid", duration: Date.now() - start };
}

async function checkMissingTypes(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("npx tsc --noEmit 2>&1 | grep 'TS7016' | grep -oP \"'[^']+'\"|sort -u | head -10", 30000);
  const missingTypes = r.stdout.split("\n").filter(Boolean).map(t => t.replace(/'/g, ""));
  if (missingTypes.length > 0) {
    for (const mod of missingTypes) {
      await execCmd(`npm install -D @types/${mod} 2>/dev/null`, 15000);
    }
    return { name: "missing-types", status: "fixed", message: `Installed @types for: ${missingTypes.join(", ")}`, autoFixed: true, duration: Date.now() - start };
  }
  return { name: "missing-types", status: "pass", message: "No missing types", duration: Date.now() - start };
}

async function checkSecurity(): Promise<CheckResult> {
  const start = Date.now();
  const issues: string[] = [];

  const secretR = await execCmd("grep -rn 'sk-ant-\\|password\\s*=\\s*[\"\\x27][^\"\\x27]\\+' src/ 2>/dev/null | grep -v '.env' | grep -v 'process.env' | head -5", 10000);
  if (secretR.stdout.trim()) issues.push("Possible hardcoded secrets found");

  const gitignorePath = path.join(WORKSPACE, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, "utf-8");
    if (!gi.includes(".env")) { fs.appendFileSync(gitignorePath, "\n.env\n.env.local\n"); issues.push("Added .env to .gitignore"); }
  } else {
    fs.writeFileSync(gitignorePath, "node_modules/\ndist/\n.env\n.env.local\ncoverage/\n.next/\n.agent/\n");
    issues.push("Created .gitignore");
  }

  const auditR = await execCmd("npm audit --json 2>/dev/null | head -c 500", 15000);
  try {
    const audit = JSON.parse(auditR.stdout);
    const criticals = audit.metadata?.vulnerabilities?.critical || 0;
    if (criticals > 0) issues.push(`${criticals} critical vulnerabilities`);
  } catch {}

  if (issues.length > 0) return { name: "security", status: issues.some(i => i.includes("hardcoded")) ? "warn" : "fixed", message: issues.join("; "), autoFixed: issues.some(i => i.includes("Added") || i.includes("Created")), duration: Date.now() - start };
  return { name: "security", status: "pass", message: "No issues", duration: Date.now() - start };
}

async function checkBuild(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd("npx tsc --noEmit 2>&1 | grep -c 'error' || echo '0'", 60000);
  const errors = parseInt(r.stdout.trim()) || 0;
  if (errors === 0) return { name: "build", status: "pass", message: "Compiles without errors", duration: Date.now() - start };
  return { name: "build", status: errors > 20 ? "fail" : "warn", message: `${errors} compilation errors`, duration: Date.now() - start };
}

async function checkPermissions(): Promise<CheckResult> {
  const start = Date.now();
  const r = await execCmd(`test -w "${WORKSPACE}" && echo "OK" || echo "READONLY"`, 3000);
  if (r.stdout.includes("READONLY")) {
    await execCmd(`chmod -R 755 "${WORKSPACE}" 2>/dev/null`);
    return { name: "permissions", status: "fixed", message: "Fixed workspace permissions", autoFixed: true, duration: Date.now() - start };
  }
  return { name: "permissions", status: "pass", message: "Workspace writable", duration: Date.now() - start };
}

async function checkBrainFile(): Promise<CheckResult> {
  const start = Date.now();
  const brainDir = path.join(WORKSPACE, ".agent");
  if (!fs.existsSync(brainDir)) {
    fs.mkdirSync(brainDir, { recursive: true });
    return { name: "brain", status: "fixed", message: "Created .agent/ directory", autoFixed: true, duration: Date.now() - start };
  }
  const brainPath = path.join(brainDir, "brain.json");
  if (fs.existsSync(brainPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(brainPath, "utf-8"));
      const patterns = data.learnedPatterns?.length || 0;
      const decisions = data.decisions?.length || 0;
      return { name: "brain", status: "pass", message: `${patterns} patterns, ${decisions} decisions loaded`, duration: Date.now() - start };
    } catch {
      fs.writeFileSync(brainPath, JSON.stringify({ decisions: [], learnedPatterns: [], errorHistory: [], fileKnowledge: {} }));
      return { name: "brain", status: "fixed", message: "Reset corrupted brain.json", autoFixed: true, duration: Date.now() - start };
    }
  }
  return { name: "brain", status: "pass", message: "Brain directory ready", duration: Date.now() - start };
}

export async function selfCheckFull(params: { checks?: string[] }): Promise<FullCheckReport> {
  const startTime = Date.now();
  const checks: CheckResult[] = [];

  const allChecks: Record<string, () => Promise<CheckResult | CheckResult[]>> = {
    "file-structure": checkFileStructure,
    "package-json": checkPackageJson,
    "node-modules": checkNodeModules,
    "tsconfig": checkTsConfig,
    "typescript": checkTypeScript,
    "imports": checkImports,
    "env-file": checkEnvFile,
    "api-key": checkAPIKey,
    "exports": checkExports,
    "circular-deps": checkCircularDeps,
    "duplicates": checkDuplicates,
    "ports": checkPorts,
    "disk-space": checkDiskSpace,
    "node-version": checkNodeVersion,
    "syntax": checkSyntax,
    "missing-types": checkMissingTypes,
    "security": checkSecurity,
    "build": checkBuild,
    "permissions": checkPermissions,
    "brain": checkBrainFile,
  };

  const toRun = params.checks && params.checks.length > 0
    ? Object.entries(allChecks).filter(([k]) => params.checks!.includes(k))
    : Object.entries(allChecks);

  for (const [, fn] of toRun) {
    const result = await fn();
    if (Array.isArray(result)) checks.push(...result);
    else checks.push(result);
  }

  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const warnings = checks.filter(c => c.status === "warn").length;
  const autoFixed = checks.filter(c => c.status === "fixed").length;
  const overallStatus: FullCheckReport["overallStatus"] = failed > 3 ? "broken" : failed > 0 || warnings > 5 ? "degraded" : "healthy";

  return { timestamp: new Date().toISOString(), totalChecks: checks.length, passed, failed, warnings, autoFixed, checks, overallStatus, totalDuration: Date.now() - startTime };
}

export async function selfCheckQuick(_params: Record<string, never>): Promise<{ status: string; checks: CheckResult[] }> {
  const quickChecks = [checkAPIKey, checkEnvFile, checkNodeVersion, checkPorts, checkDiskSpace, checkBrainFile];
  const results: CheckResult[] = [];
  for (const fn of quickChecks) {
    results.push(await fn());
  }
  const failed = results.filter(c => c.status === "fail").length;
  return { status: failed > 0 ? "issues_found" : "ok", checks: results };
}

export async function selfCheckSingle(params: { check: string }): Promise<CheckResult> {
  const allChecks: Record<string, () => Promise<CheckResult | CheckResult[]>> = {
    "file-structure": checkFileStructure, "package-json": checkPackageJson, "node-modules": checkNodeModules,
    "tsconfig": checkTsConfig, "typescript": checkTypeScript, "imports": checkImports,
    "env-file": checkEnvFile, "api-key": checkAPIKey, "exports": checkExports,
    "circular-deps": checkCircularDeps, "duplicates": checkDuplicates, "ports": checkPorts,
    "disk-space": checkDiskSpace, "node-version": checkNodeVersion, "syntax": checkSyntax,
    "missing-types": checkMissingTypes, "security": checkSecurity, "build": checkBuild,
    "permissions": checkPermissions, "brain": checkBrainFile,
  };
  const fn = allChecks[params.check];
  if (!fn) return { name: params.check, status: "fail", message: `Unknown check: ${params.check}. Available: ${Object.keys(allChecks).join(", ")}`, duration: 0 };
  const result = await fn();
  return Array.isArray(result) ? result[0] : result;
}

export const SELF_CHECK_TOOLS: ToolDef[] = [
  {
    name: "self_check_full",
    description: "Run all 20 system health checks with auto-fix. Checks: file structure, package.json, node_modules, tsconfig, TypeScript compilation, imports, .env, API key, exports, circular deps, duplicates, ports, disk space, Node version, syntax, missing types, security, build, permissions, brain file. Auto-fixes issues when possible.",
    input_schema: {
      type: "object" as const,
      properties: {
        checks: { type: "array" as const, items: { type: "string" as const }, description: "Optional: specific checks to run (e.g. ['typescript', 'imports', 'security']). Leave empty for all." },
      },
      required: [],
    },
  },
  {
    name: "self_check_quick",
    description: "Quick health check — API key, .env, Node version, ports, disk, brain. Fast sanity check before starting work.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "self_check_single",
    description: "Run a single specific check. Available: file-structure, package-json, node-modules, tsconfig, typescript, imports, env-file, api-key, exports, circular-deps, duplicates, ports, disk-space, node-version, syntax, missing-types, security, build, permissions, brain.",
    input_schema: {
      type: "object" as const,
      properties: {
        check: { type: "string" as const, description: "The check to run" },
      },
      required: ["check"],
    },
  },
];
