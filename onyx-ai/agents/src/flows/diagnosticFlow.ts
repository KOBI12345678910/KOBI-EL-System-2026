import { readFile, writeFile, deleteFile } from "../tools/fileTool";
import { searchCode } from "../tools/searchTool";
import { runCommand } from "../tools/terminalTool";
import { analyzeAndFix } from "../agent/errorHandler";
import { AgentMemory } from "../agent/memory";
import { createSnapshot, restoreSnapshot, listSnapshots } from "../tools/snapshotTool";
import { queryLogs } from "../tools/logViewerTool";
import { typeCheck } from "../tools/lintTool";
import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { learnFromMistake } from "../tools/cognitiveTool";

export interface DiagnosticReport {
  id: string;
  problem: string;
  severity: "critical" | "high" | "medium" | "low";
  rootCause: string;
  affectedFiles: string[];
  errorChain: Array<{
    file: string;
    line?: number;
    error: string;
    type: "syntax" | "runtime" | "logic" | "dependency" | "config" | "data" | "network" | "permission";
  }>;
  fixes: Array<{
    description: string;
    file: string;
    type: "edit" | "create" | "delete" | "command" | "config";
    applied: boolean;
    details: any;
  }>;
  status: "diagnosing" | "fixing" | "verifying" | "resolved" | "unresolved";
  duration: number;
}

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

async function collectSymptoms(log: (msg: string) => void): Promise<string[]> {
  const symptoms: string[] = [];

  const buildResult = await runCommand({ command: "pnpm run build 2>&1 | tail -50", timeout: 60000 });
  if (buildResult.stderr && buildResult.stderr.length > 0) {
    symptoms.push(`BUILD ERROR:\n${buildResult.stderr || buildResult.stdout}`);
  }

  const tsResult = await typeCheck();
  if (tsResult.errors && tsResult.errors.length > 0) {
    symptoms.push(`TS ERRORS (${tsResult.errors.length}):\n${tsResult.errors.slice(0, 10).map((e: any) => `${e.file}:${e.line}: ${e.message}`).join("\n")}`);
  }

  const recentLogs = await queryLogs({ level: ["error", "fatal"], limit: 20 });
  if (recentLogs.entries && recentLogs.entries.length > 0) {
    symptoms.push(`RECENT ERRORS:\n${recentLogs.entries.map((l: any) => `${l.timestamp} ${l.message}`).join("\n")}`);
  }

  const serverCheck = await runCommand({
    command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "NO_SERVER"',
    timeout: 5000,
  });
  if (serverCheck.stdout.includes("NO_SERVER") || serverCheck.stdout === "000") {
    symptoms.push("SERVER: Not running or not responding");
  } else if (parseInt(serverCheck.stdout) >= 500) {
    symptoms.push(`SERVER: Returning HTTP ${serverCheck.stdout}`);
  }

  const depsCheck = await runCommand({ command: "pnpm ls --depth=0 2>&1 | grep -iE 'MISSING|ERR' | head -10", timeout: 15000 });
  if (depsCheck.stdout.trim()) symptoms.push(`DEPS:\n${depsCheck.stdout}`);

  const diskCheck = await runCommand({ command: "df -h / | tail -1 | awk '{print $5}'", timeout: 3000 });
  const diskUsage = parseInt(diskCheck.stdout.trim()) || 0;
  if (diskUsage > 90) symptoms.push(`DISK: ${diskUsage}% used — critically low`);

  log(`  Found ${symptoms.length} symptoms`);
  return symptoms;
}

async function aiAnalyze(problem: string, symptoms: string[]): Promise<any> {
  const memory = new AgentMemory(WORKSPACE);
  const projectContext = memory.getProjectContext();

  const response = await callLLM({
    system: `You are an expert software debugger. Analyze symptoms and find root cause.

Respond with JSON:
{
  "severity": "critical|high|medium|low",
  "rootCause": "detailed explanation",
  "errorChain": [
    { "file": "path", "line": null, "error": "desc", "type": "syntax|runtime|logic|dependency|config|data|network|permission" }
  ],
  "affectedFiles": ["paths"],
  "fixes": [
    {
      "order": 1,
      "description": "what to do",
      "type": "edit|create|delete|command|config",
      "file": "path",
      "details": {},
      "risk": "low|medium|high"
    }
  ],
  "verificationSteps": ["how to verify"]
}

For edit fixes: details = { search: "find this", replace: "with this" }
For command fixes: details = { command: "run this" }
For create fixes: details = { content: "file content" }
For config fixes: details = { key: "value" }`,
    messages: [{
      role: "user",
      content: `Problem: ${problem}\n\nProject Context:\n${projectContext}\n\nSymptoms:\n${symptoms.join("\n\n---\n\n")}`,
    }],
    maxTokens: 4096,
  });

  return extractJSON(extractTextContent(response.content));
}

async function applyFix(fix: any, log: (msg: string) => void): Promise<boolean> {
  log(`\n  Fix ${fix.order}: ${fix.description}`);

  try {
    switch (fix.type) {
      case "edit": {
        if (!fix.file) return false;
        const content = await readFile({ path: fix.file });
        if (!content.success || !content.output) return false;

        if (fix.details?.search && fix.details?.replace !== undefined) {
          if (content.output.includes(fix.details.search)) {
            const newContent = content.output.replace(fix.details.search, fix.details.replace);
            await writeFile({ path: fix.file, content: newContent });
            log(`    ✅ Edited ${fix.file}`);
            return true;
          }
        }

        const editResponse = await callLLM({
          system: "Apply the described edit. Respond with ONLY the complete new file content, no markdown fences.",
          messages: [{
            role: "user",
            content: `File ${fix.file}:\n\`\`\`\n${content.output}\n\`\`\`\n\nEdit: ${fix.description}`,
          }],
          maxTokens: 8192,
        });
        let edited = extractTextContent(editResponse.content);
        edited = edited.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
        await writeFile({ path: fix.file, content: edited });
        log(`    ✅ AI-edited ${fix.file}`);
        return true;
      }

      case "command": {
        if (!fix.details?.command) return false;
        const result = await runCommand({ command: fix.details.command, timeout: 60000 });
        log(`    ${result.success ? "✅" : "⚠️"} ${fix.details.command}`);
        return result.success;
      }

      case "create": {
        if (!fix.file || !fix.details?.content) return false;
        await writeFile({ path: fix.file, content: fix.details.content });
        log(`    ✅ Created ${fix.file}`);
        return true;
      }

      case "delete": {
        if (!fix.file) return false;
        await deleteFile({ path: fix.file });
        log(`    ✅ Deleted ${fix.file}`);
        return true;
      }

      case "config": {
        if (!fix.file || !fix.details) return false;
        const content = await readFile({ path: fix.file });
        if (!content.success || !content.output) return false;
        try {
          const config = JSON.parse(content.output);
          Object.assign(config, fix.details);
          await writeFile({ path: fix.file, content: JSON.stringify(config, null, 2) });
          log(`    ✅ Updated config ${fix.file}`);
          return true;
        } catch {
          log(`    ⚠️ Could not parse config ${fix.file}`);
          return false;
        }
      }
    }
  } catch (err: any) {
    log(`    ❌ Fix failed: ${err.message}`);
  }
  return false;
}

async function verifyFixes(log: (msg: string) => void): Promise<boolean> {
  let allGood = true;

  const buildResult = await runCommand({ command: "pnpm run build 2>&1 | tail -5", timeout: 60000 });
  if (!buildResult.success) {
    log("  ❌ Build still failing");
    allGood = false;
  } else {
    log("  ✅ Build passes");
  }

  const tsResult = await typeCheck();
  const tsErrors = tsResult.errors?.length || 0;
  if (tsErrors > 0) {
    log(`  ⚠️ ${tsErrors} TypeScript errors remain`);
    allGood = false;
  } else {
    log("  ✅ TypeScript clean");
  }

  const serverCheck = await runCommand({
    command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "NO_SERVER"',
    timeout: 5000,
  });
  const status = serverCheck.stdout.trim();
  if (status === "200" || status === "304") {
    log("  ✅ Server responding");
  } else if (status !== "NO_SERVER") {
    log(`  ⚠️ Server: HTTP ${status}`);
  }

  return allGood;
}

export async function diagnoseAndFix(params: {
  problem: string;
  onLog?: (msg: string) => void;
  onPhase?: (phase: string, status: string) => void;
}): Promise<{ success: boolean; output: string; report?: DiagnosticReport }> {
  const log = params.onLog || console.log;
  const onPhase = params.onPhase || (() => {});
  const startTime = Date.now();

  const report: DiagnosticReport = {
    id: `diag_${Date.now()}`,
    problem: params.problem,
    severity: "medium",
    rootCause: "",
    affectedFiles: [],
    errorChain: [],
    fixes: [],
    status: "diagnosing",
    duration: 0,
  };

  log(`\n${"═".repeat(60)}`);
  log(`🔬 DIAGNOSTIC FLOW: ${params.problem.slice(0, 80)}`);
  log(`${"═".repeat(60)}`);

  onPhase("collect-symptoms", "running");
  log("\n📋 Step 1: Collecting symptoms...");
  const symptoms = await collectSymptoms(log);
  onPhase("collect-symptoms", "done");

  onPhase("ai-analysis", "running");
  log("\n🧠 Step 2: AI analyzing root cause...");
  const analysis = await aiAnalyze(params.problem, symptoms);
  if (!analysis) {
    report.status = "unresolved";
    report.rootCause = "Could not analyze the problem";
    report.duration = Date.now() - startTime;
    return { success: false, output: "AI analysis failed — could not determine root cause", report };
  }

  report.severity = analysis.severity;
  report.rootCause = analysis.rootCause;
  report.errorChain = analysis.errorChain || [];
  report.affectedFiles = analysis.affectedFiles || [];
  onPhase("ai-analysis", "done");

  log(`  Root cause: ${report.rootCause.slice(0, 120)}`);
  log(`  Severity: ${report.severity}`);
  log(`  Fixes planned: ${analysis.fixes?.length || 0}`);

  onPhase("backup", "running");
  log("\n💾 Step 3: Creating backup...");
  await createSnapshot({
    name: `pre-fix-${report.id.slice(0, 8)}`,
    description: `Before fixing: ${params.problem.slice(0, 100)}`,
  });
  onPhase("backup", "done");

  report.status = "fixing";
  onPhase("apply-fixes", "running");
  log("\n🔧 Step 4: Applying fixes...");

  for (const fix of (analysis.fixes || []).sort((a: any, b: any) => a.order - b.order)) {
    const applied = await applyFix(fix, log);
    report.fixes.push({
      description: fix.description,
      file: fix.file || "",
      type: fix.type,
      applied,
      details: fix.details,
    });
  }
  onPhase("apply-fixes", "done");

  report.status = "verifying";
  onPhase("verify", "running");
  log("\n✅ Step 5: Verifying fixes...");
  const verified = await verifyFixes(log);
  onPhase("verify", "done");

  if (!verified) {
    log("\n⚠️ Some issues remain. Checking if situation is worse...");
    const newBuild = await runCommand({ command: "pnpm run build 2>&1 | grep -ic 'error' || echo '0'", timeout: 30000 });
    const newErrors = parseInt(newBuild.stdout.trim()) || 0;

    if (newErrors > 10 && symptoms.length < 3) {
      onPhase("rollback", "running");
      log("  🔄 Situation worse — rolling back...");
      const snaps = await listSnapshots();
      if (snaps.snapshots && snaps.snapshots.length > 0) {
        await restoreSnapshot({ snapshot_id: snaps.snapshots[0].id });
      }
      report.status = "unresolved";
      onPhase("rollback", "done");
    }

    await learnFromMistake({
      task: params.problem,
      mistake: `Diagnostic failed. Root cause: ${report.rootCause}. ${report.fixes.filter(f => !f.applied).length} fixes failed.`,
      correction: "Need deeper analysis or different approach",
      category: "diagnostic",
    }).catch(() => {});
  }

  report.status = verified ? "resolved" : "unresolved";
  report.duration = Date.now() - startTime;

  log(`\n${"═".repeat(60)}`);
  log(`${report.status === "resolved" ? "✅" : "⚠️"} DIAGNOSTIC ${report.status.toUpperCase()} (${(report.duration / 1000).toFixed(1)}s)`);
  log(`${"═".repeat(60)}\n`);

  const summaryLines = [
    `## Diagnostic Report`,
    ``,
    `**ID**: ${report.id}`,
    `**בעיה**: ${report.problem}`,
    `**חומרה**: ${report.severity}`,
    `**סטטוס**: ${report.status === "resolved" ? "✅ נפתר" : "⚠️ לא נפתר"}`,
    `**גורם שורש**: ${report.rootCause}`,
    `**זמן**: ${(report.duration / 1000).toFixed(1)}s`,
    ``,
    `### שרשרת שגיאות:`,
    ...report.errorChain.map(e => `- **${e.file}**${e.line ? `:${e.line}` : ""}: ${e.error} (${e.type})`),
    ``,
    `### תיקונים:`,
    ...report.fixes.map(f => `${f.applied ? "✅" : "❌"} ${f.description} (${f.type}: ${f.file})`),
  ];

  return { success: report.status === "resolved", output: summaryLines.join("\n"), report };
}

export async function quickFix(params: {
  error: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`⚡ Quick fix: ${params.error.slice(0, 80)}`);

  const result = await analyzeAndFix({
    error: params.error,
    stepDescription: "Quick fix",
    taskId: `qf_${Date.now()}`,
    attempt: 1,
  });

  return { success: result.success, output: result.output };
}

export async function recoverServer(params: {
  port?: number;
}): Promise<{ success: boolean; output: string; url?: string }> {
  const port = params.port || 3000;
  console.log("\n🏥 SERVER RECOVERY FLOW");

  console.log("  1. Killing stuck processes...");
  await runCommand({ command: `kill -9 $(lsof -t -i:${port} -i:3001 -i:5173 -i:8000) 2>/dev/null || true`, timeout: 5000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log("  2. Checking dependencies...");
  const depsCheck = await runCommand({ command: "pnpm ls --depth=0 2>&1 | grep -c 'MISSING' || echo '0'", timeout: 15000 });
  if (parseInt(depsCheck.stdout.trim()) > 0) {
    console.log("  → Reinstalling dependencies...");
    await runCommand({ command: "pnpm install", timeout: 120000 });
  }

  console.log("  3. Checking environment...");
  const envCheck = await runCommand({ command: 'node -e "console.log(\'OK\')"', timeout: 5000 });
  if (!envCheck.success) {
    return { success: false, output: "Node.js environment broken" };
  }

  console.log("  4. Starting server...");
  await runCommand({ command: `PORT=${port} pnpm run dev &`, timeout: 5000 });

  console.log("  5. Waiting for server...");
  await new Promise(r => setTimeout(r, 8000));

  const healthCheck = await runCommand({
    command: `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port} 2>/dev/null || echo "NO_SERVER"`,
    timeout: 5000,
  });

  const status = parseInt(healthCheck.stdout.trim());
  const recovered = status >= 200 && status < 500;

  if (recovered) {
    console.log("  ✅ Server recovered!");
  } else {
    console.log("  ❌ Server still not responding, running diagnostics...");
    await diagnoseAndFix({ problem: "Server won't start — automatic recovery failed" });
  }

  return {
    success: recovered,
    url: recovered ? `http://localhost:${port}` : undefined,
    output: `Server status: HTTP ${status || "N/A"}`,
  };
}

export const DIAGNOSTIC_FLOW_TOOLS = [
  {
    name: "diagnose_and_fix",
    description: "אבחון מלא ותיקון אוטומטי — 6 שלבים: איסוף סימפטומים → ניתוח AI → גיבוי → תיקונים → אימות → rollback אם גרוע יותר",
    input_schema: {
      type: "object" as const,
      properties: {
        problem: { type: "string", description: "תיאור הבעיה" },
      },
      required: ["problem"] as string[],
    },
  },
  {
    name: "quick_fix",
    description: "תיקון מהיר לשגיאה ספציפית — ללא אבחון מלא",
    input_schema: {
      type: "object" as const,
      properties: {
        error: { type: "string", description: "הודעת השגיאה" },
      },
      required: ["error"] as string[],
    },
  },
  {
    name: "recover_server",
    description: "שחזור שרת — הריגת תהליכים תקועים, בדיקת תלויות, הפעלה מחדש, אבחון אוטומטי אם נכשל",
    input_schema: {
      type: "object" as const,
      properties: {
        port: { type: "number", description: "פורט השרת (ברירת מחדל: 3000)" },
      },
      required: [] as string[],
    },
  },
];
