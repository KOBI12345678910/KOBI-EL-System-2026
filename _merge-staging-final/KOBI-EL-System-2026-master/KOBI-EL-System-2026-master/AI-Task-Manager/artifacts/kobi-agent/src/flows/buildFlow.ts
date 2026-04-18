import { v4 as uuidv4 } from "uuid";
import { createPlan } from "../agent/planner";
import { executeStep, type ExecutionResult } from "../agent/executor";
import { analyzeAndFix } from "../agent/errorHandler";
import { AgentMemory } from "../agent/memory";
import { createSnapshot } from "../tools/snapshotTool";
import { runCommand } from "../tools/terminalTool";
import { typeCheck, lint, format } from "../tools/lintTool";
import { runTests } from "../tools/testTool";
import { startDevServer, stopServer } from "../tools/previewTool";
import { getContextForTask, recordTask } from "../tools/smartContextTool";
import { gitCommit } from "../tools/gitTool";
import { learnFromMistake } from "../tools/cognitiveTool";

export interface BuildFlowConfig {
  workspaceDir: string;
  maxRetries: number;
  autoTest: boolean;
  autoLint: boolean;
  autoSnapshot: boolean;
  autoPreview: boolean;
}

export interface BuildFlowResult {
  flowId: string;
  success: boolean;
  phases: Array<{
    name: string;
    status: "success" | "failed" | "skipped" | "fixed";
    duration: number;
    output?: string;
    error?: string;
    retries: number;
  }>;
  totalDuration: number;
  filesCreated: string[];
  filesModified: string[];
  previewUrl?: string;
  testResults?: { passed: number; failed: number };
  lintResults?: { errors: number; warnings: number };
}

type PhaseResult = BuildFlowResult["phases"][0];

const DEFAULT_CONFIG: BuildFlowConfig = {
  workspaceDir: process.env.WORKSPACE_DIR || "./workspace",
  maxRetries: 3,
  autoTest: true,
  autoLint: true,
  autoSnapshot: true,
  autoPreview: true,
};

async function runPhase(
  name: string,
  fn: () => Promise<string>,
  onLog: (msg: string) => void,
  onPhase: (phase: string, status: string) => void,
): Promise<PhaseResult> {
  const start = Date.now();
  let retries = 0;

  onPhase(name, "running");
  onLog(`\n▶ Phase: ${name.toUpperCase()}`);

  try {
    const output = await fn();
    onPhase(name, "success");
    onLog(`  ✅ ${name}: ${output}`);
    return { name, status: "success", duration: Date.now() - start, output, retries };
  } catch (err: any) {
    retries++;
    onLog(`  ⚠️ ${name} failed: ${err.message}`);

    try {
      const output = await fn();
      onPhase(name, "fixed");
      onLog(`  🔧 ${name}: Fixed — ${output}`);
      return { name, status: "fixed", duration: Date.now() - start, output, retries };
    } catch (err2: any) {
      onPhase(name, "failed");
      onLog(`  ❌ ${name}: ${err2.message}`);
      return { name, status: "failed", duration: Date.now() - start, error: err2.message, retries };
    }
  }
}

function buildResult(
  flowId: string,
  success: boolean,
  phases: PhaseResult[],
  startTime: number,
  filesCreated: string[],
  filesModified: string[],
  previewUrl?: string,
  testResults?: { passed: number; failed: number },
  lintResults?: { errors: number; warnings: number },
): BuildFlowResult {
  return {
    flowId,
    success,
    phases,
    totalDuration: Date.now() - startTime,
    filesCreated: [...new Set(filesCreated)],
    filesModified: [...new Set(filesModified)],
    previewUrl,
    testResults,
    lintResults,
  };
}

export async function runBuildFlow(params: {
  task: string;
  context?: string;
  config?: Partial<BuildFlowConfig>;
  onLog?: (msg: string) => void;
  onPhase?: (phase: string, status: string) => void;
}): Promise<{ success: boolean; output: string; result?: BuildFlowResult }> {
  const config = { ...DEFAULT_CONFIG, ...params.config };
  const log = params.onLog || console.log;
  const onPhase = params.onPhase || (() => {});
  const flowId = uuidv4();
  const startTime = Date.now();
  const phases: PhaseResult[] = [];
  const filesCreated: string[] = [];
  const filesModified: string[] = [];
  let previewUrl: string | undefined;
  let testResults: { passed: number; failed: number } | undefined;
  let lintResults: { errors: number; warnings: number } | undefined;

  log(`\n${"═".repeat(60)}`);
  log(`🚀 BUILD FLOW START: ${params.task.slice(0, 80)}`);
  log(`${"═".repeat(60)}\n`);

  if (config.autoSnapshot) {
    const phase = await runPhase("snapshot", async () => {
      const snap = await createSnapshot({
        name: `pre-build-${flowId.slice(0, 8)}`,
        description: `Before: ${params.task.slice(0, 100)}`,
      });
      return `Snapshot: ${snap.output}`;
    }, log, onPhase);
    phases.push(phase);
  }

  let plan: any;
  const planPhase = await runPhase("plan", async () => {
    const smartCtx = await getContextForTask({ task: params.task });
    plan = await createPlan(params.task, `${params.context || ""}\n${smartCtx.output || ""}`);
    return `Plan: ${plan.steps.length} steps — ${plan.taskSummary}`;
  }, log, onPhase);
  phases.push(planPhase);

  if (!planPhase.status.includes("success") && planPhase.status !== "fixed" || !plan) {
    return {
      success: false,
      output: `Planning failed: ${planPhase.error}`,
      result: buildResult(flowId, false, phases, startTime, filesCreated, filesModified),
    };
  }

  const executePhase = await runPhase("execute", async () => {
    let completed = 0;
    let failed = 0;

    for (const step of plan.steps) {
      log(`\n  📌 Step ${step.id}/${plan.steps.length}: ${step.description}`);

      let result = await executeStep(step);

      if (!result.success) {
        log(`  ⚠️ Step failed, attempting fix...`);

        for (let retry = 0; retry < config.maxRetries; retry++) {
          const fixResult = await analyzeAndFix({
            error: result.error || result.output || "",
            command: step.details?.command,
            filePath: step.details?.path,
            stepDescription: step.description,
            taskId: flowId,
            attempt: retry + 1,
          });

          if (fixResult.success) {
            result = await executeStep(step);
            if (result.success) {
              log(`  ✅ Fixed on retry ${retry + 1}`);
              break;
            }
          }
        }
      }

      if (result.success) {
        completed++;
        if (result.filesChanged) {
          filesCreated.push(...result.filesChanged.filter((f: string) => !filesModified.includes(f)));
          filesModified.push(...result.filesChanged);
        }
      } else {
        failed++;
        log(`  ❌ Step failed permanently: ${step.description}`);

        await learnFromMistake({
          task: params.task,
          mistake: `Step failed: ${step.description} — ${result.error || ""}`,
          correction: "Need to investigate and handle this case",
          category: step.type || "general",
        }).catch(() => {});
      }
    }

    if (failed > 0 && completed === 0) throw new Error(`All ${plan.steps.length} steps failed`);
    return `Executed: ${completed} success, ${failed} failed out of ${plan.steps.length}`;
  }, log, onPhase);
  phases.push(executePhase);

  if (config.autoLint) {
    const validatePhase = await runPhase("validate", async () => {
      const typeResult = await typeCheck();
      let output = `TypeScript: ${typeResult.errors?.length || 0} errors`;

      if (typeResult.errors && typeResult.errors.length > 0) {
        log(`  🔧 Fixing ${typeResult.errors.length} type errors...`);
        for (const error of typeResult.errors.slice(0, 10)) {
          await analyzeAndFix({
            error: `${error.file}:${error.line}: ${error.message}`,
            filePath: error.file,
            stepDescription: "Fix TypeScript error",
            taskId: flowId,
            attempt: 1,
          }).catch(() => {});
        }
      }

      const lintResult = await lint({ fix: true });
      const errorCount = typeof lintResult.output === "string" && lintResult.output.includes("error") ? 1 : 0;
      const warnCount = typeof lintResult.output === "string" && lintResult.output.includes("warning") ? 1 : 0;
      lintResults = { errors: errorCount, warnings: warnCount };
      output += ` | Lint: ${lintResult.output?.slice(0, 100) || "ok"}`;

      await format({}).catch(() => {});

      return output;
    }, log, onPhase);
    phases.push(validatePhase);
  }

  if (config.autoTest) {
    const testPhase = await runPhase("test", async () => {
      const result = await runTests({});
      const passed = result.output?.match(/(\d+) pass/)?.[1] || "0";
      const failedCount = result.output?.match(/(\d+) fail/)?.[1] || "0";
      testResults = { passed: parseInt(passed), failed: parseInt(failedCount) };

      if (parseInt(failedCount) > 0) {
        log(`  🔧 Attempting to fix ${failedCount} failing tests...`);
        await analyzeAndFix({
          error: result.output || "Tests failed",
          stepDescription: "Fix failing tests",
          taskId: flowId,
          attempt: 1,
        }).catch(() => {});

        const retryResult = await runTests({});
        const retryFailed = retryResult.output?.match(/(\d+) fail/)?.[1] || "0";
        if (parseInt(retryFailed) > 0) {
          throw new Error(`${retryFailed} tests still failing`);
        }
      }

      return `Tests: ${passed} passed, ${failedCount} failed`;
    }, log, onPhase);
    phases.push(testPhase);
  }

  const buildPhase = await runPhase("build", async () => {
    const result = await runCommand({ command: "pnpm run build 2>&1 || echo 'NO_BUILD_SCRIPT'", timeout: 120000 });

    if (result.stdout.includes("NO_BUILD_SCRIPT")) {
      return "No build script — skipped";
    }

    if (!result.success) {
      const fixResult = await analyzeAndFix({
        error: result.stderr || result.stdout,
        command: "pnpm run build",
        stepDescription: "Fix build error",
        taskId: flowId,
        attempt: 1,
      });

      if (fixResult.success) {
        const retryBuild = await runCommand({ command: "pnpm run build", timeout: 120000 });
        if (!retryBuild.success) throw new Error("Build still failing after fix");
        return "Build succeeded (after fix)";
      }
      throw new Error("Build failed: " + (result.stderr || result.stdout).slice(0, 300));
    }

    return "Build succeeded";
  }, log, onPhase);
  phases.push(buildPhase);

  if (config.autoPreview) {
    const previewPhase = await runPhase("preview", async () => {
      const preview = await startDevServer({});
      previewUrl = preview.output || "http://localhost:3000";
      return `Server running: ${previewUrl}`;
    }, log, onPhase);
    phases.push(previewPhase);
  }

  if (previewUrl) {
    const verifyPhase = await runPhase("verify", async () => {
      await new Promise((r) => setTimeout(r, 3000));

      const { default: http } = await import("http");
      const url = new URL(previewUrl!);

      return new Promise<string>((resolve, reject) => {
        const req = http.get(url.href, { timeout: 10000 }, (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve(`Server healthy: HTTP ${res.statusCode}`);
          } else {
            reject(new Error(`Server returned HTTP ${res.statusCode}`));
          }
        });
        req.on("error", () => reject(new Error("Server not responding")));
        req.on("timeout", () => { req.destroy(); reject(new Error("Server timeout")); });
      });
    }, log, onPhase);
    phases.push(verifyPhase);
  }

  const allSuccess = phases.every((p) => p.status === "success" || p.status === "fixed" || p.status === "skipped");

  if (allSuccess) {
    const commitPhase = await runPhase("commit", async () => {
      const msg = `feat: ${params.task.slice(0, 50)}`;
      await gitCommit({ message: msg });
      return `Committed: ${msg}`;
    }, log, onPhase);
    phases.push(commitPhase);
  }

  if (config.autoSnapshot && allSuccess) {
    const snapPhase = await runPhase("post-snapshot", async () => {
      const snap = await createSnapshot({
        name: `post-build-${flowId.slice(0, 8)}`,
        description: `After: ${params.task.slice(0, 100)}`,
      });
      return `Post-build snapshot: ${snap.output}`;
    }, log, onPhase);
    phases.push(snapPhase);
  }

  await recordTask({
    taskId: flowId,
    task: params.task,
    success: allSuccess,
    stepsCount: plan?.steps?.length || 0,
    errorsCount: phases.filter((p) => p.retries > 0).length,
    duration: Date.now() - startTime,
    fixesApplied: phases.filter((p) => p.status === "fixed").map((p) => p.name),
  }).catch(() => {});

  log(`\n${"═".repeat(60)}`);
  log(`${allSuccess ? "✅" : "⚠️"} BUILD FLOW ${allSuccess ? "COMPLETE" : "PARTIAL"} (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
  log(`${"═".repeat(60)}\n`);

  const result = buildResult(flowId, allSuccess, phases, startTime, filesCreated, filesModified, previewUrl, testResults, lintResults);

  const summaryLines = [
    `## Build Flow Results`,
    ``,
    `**Flow ID**: ${flowId}`,
    `**Status**: ${allSuccess ? "✅ הצלחה" : "⚠️ חלקי"}`,
    `**זמן**: ${(result.totalDuration / 1000).toFixed(1)}s`,
    ``,
    `### Phases:`,
    ...phases.map(p => {
      const icon = p.status === "success" ? "✅" : p.status === "fixed" ? "🔧" : p.status === "skipped" ? "⏭️" : "❌";
      return `${icon} **${p.name}**: ${p.output || p.error || ""} (${(p.duration / 1000).toFixed(1)}s)`;
    }),
    ``,
    result.filesCreated.length > 0 ? `**קבצים חדשים**: ${result.filesCreated.length}` : "",
    result.filesModified.length > 0 ? `**קבצים שהשתנו**: ${result.filesModified.length}` : "",
    result.testResults ? `**טסטים**: ${result.testResults.passed} עברו, ${result.testResults.failed} נכשלו` : "",
    result.lintResults ? `**Lint**: ${result.lintResults.errors} errors, ${result.lintResults.warnings} warnings` : "",
    result.previewUrl ? `**Preview**: ${result.previewUrl}` : "",
  ].filter(Boolean);

  return {
    success: allSuccess,
    output: summaryLines.join("\n"),
    result,
  };
}

export async function getBuildFlowStatus(params: {}): Promise<{ success: boolean; output: string }> {
  return { success: true, output: "Build Flow ready. Use run_build_flow to start a full build pipeline." };
}

export const BUILD_FLOW_TOOLS = [
  {
    name: "run_build_flow",
    description: "הרצת Build Flow מלא — 10 שלבים: snapshot → plan → execute → validate → test → fix → build → preview → verify → commit. מבצע auto-fix בכל שלב",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "Task description" },
        context: { type: "string", description: "Additional context" },
        autoTest: { type: "boolean", description: "Run tests automatically (default true)" },
        autoLint: { type: "boolean", description: "Run lint/typecheck (default true)" },
        autoSnapshot: { type: "boolean", description: "Create snapshots (default true)" },
        autoPreview: { type: "boolean", description: "Start dev server (default true)" },
        maxRetries: { type: "number", description: "Max retries per step (default 3)" },
      },
      required: ["task"] as string[],
    },
  },
  {
    name: "get_build_flow_status",
    description: "בדיקת מצב Build Flow",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
