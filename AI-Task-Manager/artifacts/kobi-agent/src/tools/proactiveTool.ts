import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, listFiles } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

interface Suggestion {
  type: "security" | "performance" | "quality" | "ux" | "maintenance" | "feature";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  autoFixable: boolean;
  fix?: string;
}

export async function proactiveScan(params: {
  path?: string;
}): Promise<{ success: boolean; output: string; suggestions: Suggestion[] }> {
  console.log("\n🔮 סריקה פרואקטיבית...");
  const basePath = params.path || WORKSPACE;
  const suggestions: Suggestion[] = [];

  const packageJson = await readFile({ path: `${basePath}/package.json` });
  if (packageJson.success && packageJson.output) {
    const pkg = JSON.parse(packageJson.output);

    if (!pkg.scripts?.lint) suggestions.push({
      type: "quality", severity: "warning", title: "חסר linter",
      description: "אין הגדרת lint בpackage.json — מומלץ להוסיף ESLint",
      autoFixable: true, fix: "npm install -D eslint",
    });

    if (!pkg.scripts?.test) suggestions.push({
      type: "quality", severity: "warning", title: "חסרים טסטים",
      description: "אין הגדרת test בpackage.json",
      autoFixable: false,
    });

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!deps["helmet"] && deps["express"]) suggestions.push({
      type: "security", severity: "critical", title: "חסר Helmet",
      description: "אפליקציית Express בלי helmet — חשיפה לXSS, clickjacking",
      autoFixable: true, fix: "npm install helmet",
    });

    if (!deps["rate-limiter-flexible"] && !deps["express-rate-limit"]) suggestions.push({
      type: "security", severity: "warning", title: "חסר Rate Limiting",
      description: "אין הגנת rate limiting — חשיפה לDDoS",
      autoFixable: true, fix: "npm install express-rate-limit",
    });
  }

  const envFile = await readFile({ path: `${basePath}/.env` });
  if (envFile.success && envFile.output) {
    if (envFile.output.includes("password") || envFile.output.includes("secret")) {
      const gitignore = await readFile({ path: `${basePath}/.gitignore` });
      if (!gitignore.success || !gitignore.output?.includes(".env")) {
        suggestions.push({
          type: "security", severity: "critical", title: ".env לא ב-gitignore",
          description: "קובץ .env עם סיסמאות לא מוגן מgit",
          autoFixable: true, fix: "echo '.env' >> .gitignore",
        });
      }
    }
  }

  const tsconfig = await readFile({ path: `${basePath}/tsconfig.json` });
  if (tsconfig.success && tsconfig.output) {
    const config = JSON.parse(tsconfig.output);
    if (!config.compilerOptions?.strict) suggestions.push({
      type: "quality", severity: "warning", title: "TypeScript לא strict",
      description: "strict mode כבוי — יותר באגים פוטנציאליים",
      autoFixable: true,
    });
  }

  const critical = suggestions.filter(s => s.severity === "critical");
  const warnings = suggestions.filter(s => s.severity === "warning");
  const info = suggestions.filter(s => s.severity === "info");

  const icon = (s: Suggestion) => s.severity === "critical" ? "🔴" : s.severity === "warning" ? "🟡" : "🔵";
  const lines = [
    `🔮 סריקה פרואקטיבית — ${suggestions.length} המלצות:`,
    `  🔴 קריטי: ${critical.length} | 🟡 אזהרה: ${warnings.length} | 🔵 מידע: ${info.length}`,
    "",
    ...suggestions.map(s => `${icon(s)} [${s.type}] ${s.title}\n   ${s.description}${s.autoFixable ? " (ניתן לתיקון אוטומטי)" : ""}`),
  ];

  return { success: true, output: lines.join("\n"), suggestions };
}

export async function suggestFeatures(params: {
  projectDescription?: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n💡 מציע פיצ'רים...");

  const packageJson = await readFile({ path: `${WORKSPACE}/package.json` });
  const routes = await listFiles({ path: `${WORKSPACE}/src/routes`, recursive: true });
  const components = await listFiles({ path: `${WORKSPACE}/src/components`, recursive: true });

  const context = [
    params.projectDescription || "",
    packageJson.success ? `package.json: ${packageJson.output?.slice(0, 500)}` : "",
    routes.success ? `Routes: ${routes.output?.slice(0, 500)}` : "",
    components.success ? `Components: ${components.output?.slice(0, 500)}` : "",
  ].filter(Boolean).join("\n");

  const response = await callLLM({
    system: `You are a product manager analyzing a project. Suggest 5-10 features that would add the most value.
For each feature provide: name, description, estimated effort (hours), impact (1-10), priority.
Sort by priority. Respond in Hebrew. Return JSON array.`,
    messages: [{ role: "user", content: context }],
    maxTokens: 2048,
  });

  return { success: true, output: `💡 הצעות פיצ'רים:\n${extractTextContent(response.content)}` };
}

export async function healthCheck(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n🏥 בדיקת בריאות מערכת...");

  const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string }> = [];

  const tsc = await runCommand({ command: `cd ${WORKSPACE} && npx tsc --noEmit 2>&1 | head -5`, timeout: 30000 });
  const tsErrors = tsc.stderr && tsc.stderr.includes("error") ? "fail" : "pass";
  checks.push({ name: "TypeScript", status: tsErrors as "pass" | "fail", detail: tsErrors === "pass" ? "אפס שגיאות" : tsc.stderr.slice(0, 100) });

  const disk = await runCommand({ command: "df -h . | tail -1", timeout: 5000 });
  const diskUsage = disk.stdout.match(/(\d+)%/);
  const diskPercent = diskUsage ? parseInt(diskUsage[1]) : 0;
  checks.push({ name: "דיסק", status: diskPercent > 90 ? "fail" : diskPercent > 70 ? "warn" : "pass", detail: `${diskPercent}% בשימוש` });

  const mem = await runCommand({ command: "free -m | head -2 | tail -1", timeout: 5000 });
  checks.push({ name: "זיכרון", status: "pass", detail: mem.stdout.trim().slice(0, 60) });

  const git = await runCommand({ command: `cd ${WORKSPACE} && git status --short 2>/dev/null | wc -l`, timeout: 5000 });
  const uncommitted = parseInt(git.stdout.trim()) || 0;
  checks.push({ name: "Git", status: uncommitted > 20 ? "warn" : "pass", detail: `${uncommitted} קבצים לא committed` });

  const icon = (s: string) => s === "pass" ? "✅" : s === "warn" ? "⚠️" : "❌";
  const lines = checks.map(c => `${icon(c.status)} ${c.name}: ${c.detail}`);
  const overall = checks.some(c => c.status === "fail") ? "❌ בעיות" : checks.some(c => c.status === "warn") ? "⚠️ אזהרות" : "✅ תקין";

  return { success: true, output: `🏥 בריאות מערכת: ${overall}\n\n${lines.join("\n")}` };
}

export const PROACTIVE_TOOLS = [
  {
    name: "proactive_scan",
    description: "סריקה פרואקטיבית — מוצא בעיות לפני שהן קורות (security, performance, quality)",
    input_schema: {
      type: "object" as const,
      properties: { path: { type: "string", description: "נתיב לסריקה" } },
      required: [] as string[],
    },
  },
  {
    name: "suggest_features",
    description: "הצעת פיצ'רים — AI מנתח את הפרויקט ומציע שיפורים בסדר עדיפות",
    input_schema: {
      type: "object" as const,
      properties: { projectDescription: { type: "string" } },
      required: [] as string[],
    },
  },
  {
    name: "health_check",
    description: "בדיקת בריאות — TypeScript, דיסק, זיכרון, Git, יציבות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
