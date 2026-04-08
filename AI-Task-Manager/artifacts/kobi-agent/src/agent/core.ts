import { v4 as uuidv4 } from "uuid";
import { callLLM, callLLMStream, type LLMMessage, type ContentBlock, type ToolDef } from "../llm/client";
import { SYSTEM_PROMPT } from "../llm/prompts";
import { planTask, createPlan, revisePlan, type Step, type Plan } from "./planner";
import { executeStep, executeTool, cleanup, type ExecutionResult, type StepDef } from "./executor";
import { analyzeError, analyzeAndFix, isRetryable } from "./errorHandler";
import {
  createSession, updateSession, addStepResult, saveSessionToDB,
  type AgentContext, type StepResult,
} from "./memory";
import { AgentMemory } from "./memory";
import { orchestrate as multiAgentOrchestrate } from "./orchestrator";
import { createSnapshot } from "../tools/snapshotTool";
import { getContextForTask as getSmartContext, recordTask as recordSmartTask } from "../tools/smartContextTool";
import { FILE_TOOLS } from "../tools/fileTool";
import { TERMINAL_TOOLS } from "../tools/terminalTool";
import { SEARCH_TOOLS } from "../tools/searchTool";
import { PACKAGE_TOOLS } from "../tools/packageTool";
import { GIT_TOOLS } from "../tools/gitTool";
import { DB_TOOLS } from "../tools/dbTool";
import { BROWSER_TOOLS } from "../tools/browserTool";
import { DEPLOY_TOOLS } from "../tools/deployTool";
import { PREVIEW_TOOLS } from "../tools/previewTool";
import { TEST_TOOLS } from "../tools/testTool";
import { LINT_TOOLS } from "../tools/lintTool";
import { ENV_TOOLS } from "../tools/envTool";
import { SCAFFOLD_TOOLS } from "../tools/scaffoldTool";
import { SNAPSHOT_TOOLS } from "../tools/snapshotTool";
import { DOCGEN_TOOLS } from "../tools/docgenTool";
import { PERFORMANCE_TOOLS } from "../tools/performanceTool";
import { NETWORK_TOOLS } from "../tools/networkTool";
import { WATCHER_TOOLS } from "../tools/watcherTool";
import { TASK_QUEUE_TOOLS } from "../tools/taskQueueTool";
import { CODE_REVIEW_TOOLS } from "../tools/codeReviewTool";
import { DEPENDENCY_TOOLS } from "../tools/dependencyTool";
import { ORCHESTRATOR_TOOLS } from "./orchestrator";
import { SELF_HEAL_TOOLS } from "../tools/selfHealTool";
import { AI_ARCHITECT_TOOLS } from "../tools/aiArchitectTool";
import { FULLSTACK_GENERATOR_TOOLS } from "../tools/fullStackGeneratorTool";
import { I18N_TOOLS } from "../tools/i18nTool";
import { SEO_TOOLS } from "../tools/seoTool";
import { A11Y_TOOLS } from "../tools/a11yTool";
import { COLLAB_TOOLS } from "../tools/realtimeCollabTool";
import { SMART_CONTEXT_TOOLS } from "../tools/smartContextTool";
import { MIGRATION_TOOLS } from "../tools/migrationTool";
import { CONVERSATION_TOOLS } from "../tools/conversationTool";
import { DEBUGGER_TOOLS } from "../tools/debuggerTool";
import { DATABASE_GUI_TOOLS } from "../tools/databaseGUITool";
import { LOG_VIEWER_TOOLS } from "../tools/logViewerTool";
import { API_GEN_TOOLS } from "../tools/apiGenTool";
import { CRON_TOOLS } from "../tools/cronTool";
import { FEATURE_FLAGS_TOOLS } from "../tools/featureFlagsTool";
import { PLUGIN_SYSTEM_TOOLS } from "../tools/pluginSystemTool";
import { PROCESS_MANAGER_TOOLS } from "../tools/processManagerTool";
import { AI_COMMIT_TOOLS } from "../tools/aiCommitTool";
import { MERGE_CONFLICT_TOOLS } from "../tools/mergeConflictTool";
import { REFACTORING_TOOLS } from "../tools/refactoringTool";
import { IMAGE_OPTIMIZATION_TOOLS } from "../tools/imageOptimizationTool";
import { EMAIL_TEMPLATE_TOOLS } from "../tools/emailTemplateTool";
import { QUEUE_SYSTEM_TOOLS } from "../tools/queueSystemTool";
import { CACHE_TOOLS } from "../tools/cacheTool";
import { SEARCH_ENGINE_TOOLS } from "../tools/searchEngineTool";
import { RATE_LIMIT_TOOLS } from "../tools/rateLimitTool";
import { FILE_UPLOAD_TOOLS } from "../tools/fileUploadTool";
import { SSE_TOOLS } from "../tools/sseTool";
import { KV_STORE_TOOLS } from "../tools/kvStoreTool";
import { FORM_BUILDER_TOOLS } from "../tools/formBuilderTool";
import { DATA_GRID_TOOLS } from "../tools/dataGridTool";
import { ANALYTICS_TOOLS } from "../tools/analyticsTool";
import { PDF_TOOLS } from "../tools/pdfTool";
import { NOTIFICATION_TOOLS } from "../tools/notificationTool";
import { UI_GEN_TOOLS } from "../tools/uiGenTool";
import { SECURITY_TOOLS } from "../tools/securityTool";
import { VISION_TOOLS } from "../tools/visionTool";
import { RESPONSE_SPEED_TOOLS, selectRelevantTools, recordToolMetric, recordLLMCall, compressPromptHistory, truncateToolResults, parallelExecuteTools, cacheGet, cacheSet } from "../tools/responseSpeedTool";
import { COGNITIVE_TOOLS } from "../tools/cognitiveTool";
import { BUILD_FLOW_TOOLS } from "../flows/buildFlow";
import { DIAGNOSTIC_FLOW_TOOLS } from "../flows/diagnosticFlow";
import { DATA_FLOW_TOOLS } from "../flows/dataFlow";
import { REALTIME_FLOW_TOOLS } from "../flows/realtimeFlow";
import { QUALITY_GATE_TOOLS } from "../flows/qualityGateFlow";
import { UPGRADE_FLOW_TOOLS } from "../flows/upgradeFlow";
import { PARALLEL_AGENT_TOOLS } from "../flows/parallelAgentFlow";
import { BROWSER_TEST_TOOLS } from "../tools/browserTestTool";
import { AGENT_SPAWNER_TOOLS } from "../tools/agentSpawnerTool";
import { DESIGN_CANVAS_TOOLS } from "../tools/designCanvasTool";
import { CONNECTORS_TOOLS } from "../tools/connectorsTool";
import { WEB_SEARCH_BUILD_TOOLS } from "../tools/webSearchBuildTool";
import { SERVERLESS_TOOLS } from "../tools/serverlessTool";
import { INTEGRATIONS_TOOLS } from "../tools/integrationsTool";
import { TOKEN_TRACKER_TOOLS } from "../tools/tokenTrackerTool";
import { AGENT_MODE_TOOLS } from "../tools/agentModeTool";
import { PLAN_MODE_TOOLS } from "../tools/planModeTool";
import { CHECKPOINT_TOOLS } from "../tools/checkpointTool";
import { CONTENT_GEN_TOOLS } from "../tools/contentGenTool";
import { MCP_TOOLS } from "../tools/mcpTool";
import { CODE_OPTIMIZE_TOOLS } from "../tools/codeOptimizeTool";
import { EXTENDED_THINKING_TOOLS } from "../tools/extendedThinkingTool";
import { MULTI_MODEL_ROUTER_TOOLS } from "../tools/multiModelRouterTool";
import { CONTEXT_MANAGER_TOOLS } from "../tools/contextManagerTool";
import { LEARNING_ENGINE_TOOLS } from "../tools/learningEngineTool";
import { CODE_GRAPH_TOOLS } from "../tools/codeGraphTool";
import { AUTO_RECOVERY_TOOLS } from "../tools/autoRecoveryTool";
import { PROACTIVE_TOOLS } from "../tools/proactiveTool";
import { STREAMING_TOOLS } from "../tools/streamingTool";
import { DIFF_PATCH_TOOLS } from "../tools/diffPatchTool";
import { FIGMA_IMPORT_TOOLS } from "../tools/figmaImportTool";
import { MOBILE_DEPLOY_TOOLS } from "../tools/mobileDeployTool";
import { AUDIO_TOOLS } from "../tools/audioTool";
import { RULES_SYNC_TOOLS } from "../tools/rulesSyncTool";
import { HOTFIX_FLOW_TOOLS } from "../flows/hotfixFlow";
import { HEALTH_DASHBOARD_TOOLS } from "../tools/healthDashboardTool";
import { DATA_WAREHOUSE_TOOLS } from "../tools/dataWarehouseTool";
import { REQUEST_QUEUE_TOOLS_EXT } from "../tools/requestQueueTool";
import { AGENT_MODE_TOOLS as AGENT_MODE_TOOLS_V2 } from "../agent/agentModes";
import { PLAN_MODE_TOOLS as PLAN_MODE_TOOLS_V2 } from "../flows/planModeFlow";
import { SPEED_ENGINE_TOOLS } from "../tools/speedEngineTool";
import { BRAIN_TOOLS } from "../tools/brainTool";
import { SELF_CHECK_TOOLS } from "../tools/selfCheckTool";
import type { WebSocketBroadcast } from "../ws/socket";

const ALL_TOOLS: ToolDef[] = [
  ...FILE_TOOLS, ...TERMINAL_TOOLS, ...SEARCH_TOOLS,
  ...PACKAGE_TOOLS, ...GIT_TOOLS, ...DB_TOOLS, ...BROWSER_TOOLS, ...DEPLOY_TOOLS, ...PREVIEW_TOOLS, ...TEST_TOOLS, ...LINT_TOOLS, ...ENV_TOOLS, ...SCAFFOLD_TOOLS, ...SNAPSHOT_TOOLS, ...DOCGEN_TOOLS, ...PERFORMANCE_TOOLS, ...NETWORK_TOOLS, ...WATCHER_TOOLS, ...TASK_QUEUE_TOOLS, ...CODE_REVIEW_TOOLS, ...DEPENDENCY_TOOLS, ...ORCHESTRATOR_TOOLS, ...SELF_HEAL_TOOLS, ...AI_ARCHITECT_TOOLS, ...FULLSTACK_GENERATOR_TOOLS, ...I18N_TOOLS, ...SEO_TOOLS, ...A11Y_TOOLS, ...COLLAB_TOOLS, ...SMART_CONTEXT_TOOLS, ...MIGRATION_TOOLS, ...CONVERSATION_TOOLS, ...DEBUGGER_TOOLS, ...DATABASE_GUI_TOOLS, ...LOG_VIEWER_TOOLS, ...API_GEN_TOOLS, ...CRON_TOOLS, ...FEATURE_FLAGS_TOOLS, ...PLUGIN_SYSTEM_TOOLS, ...PROCESS_MANAGER_TOOLS,
  ...AI_COMMIT_TOOLS, ...MERGE_CONFLICT_TOOLS, ...REFACTORING_TOOLS, ...IMAGE_OPTIMIZATION_TOOLS, ...EMAIL_TEMPLATE_TOOLS, ...QUEUE_SYSTEM_TOOLS, ...CACHE_TOOLS, ...SEARCH_ENGINE_TOOLS, ...RATE_LIMIT_TOOLS, ...FILE_UPLOAD_TOOLS, ...SSE_TOOLS, ...KV_STORE_TOOLS, ...FORM_BUILDER_TOOLS, ...DATA_GRID_TOOLS, ...ANALYTICS_TOOLS, ...PDF_TOOLS, ...NOTIFICATION_TOOLS, ...UI_GEN_TOOLS, ...SECURITY_TOOLS, ...VISION_TOOLS, ...RESPONSE_SPEED_TOOLS, ...COGNITIVE_TOOLS, ...BUILD_FLOW_TOOLS, ...DIAGNOSTIC_FLOW_TOOLS, ...DATA_FLOW_TOOLS, ...REALTIME_FLOW_TOOLS, ...QUALITY_GATE_TOOLS, ...UPGRADE_FLOW_TOOLS, ...PARALLEL_AGENT_TOOLS, ...BROWSER_TEST_TOOLS, ...AGENT_SPAWNER_TOOLS, ...DESIGN_CANVAS_TOOLS, ...CONNECTORS_TOOLS, ...WEB_SEARCH_BUILD_TOOLS, ...SERVERLESS_TOOLS, ...INTEGRATIONS_TOOLS, ...TOKEN_TRACKER_TOOLS, ...AGENT_MODE_TOOLS, ...PLAN_MODE_TOOLS, ...CHECKPOINT_TOOLS, ...CONTENT_GEN_TOOLS, ...MCP_TOOLS, ...CODE_OPTIMIZE_TOOLS,
  ...EXTENDED_THINKING_TOOLS, ...MULTI_MODEL_ROUTER_TOOLS, ...CONTEXT_MANAGER_TOOLS, ...LEARNING_ENGINE_TOOLS, ...CODE_GRAPH_TOOLS, ...AUTO_RECOVERY_TOOLS, ...PROACTIVE_TOOLS, ...STREAMING_TOOLS, ...DIFF_PATCH_TOOLS, ...FIGMA_IMPORT_TOOLS, ...MOBILE_DEPLOY_TOOLS, ...AUDIO_TOOLS, ...RULES_SYNC_TOOLS, ...HOTFIX_FLOW_TOOLS, ...HEALTH_DASHBOARD_TOOLS, ...DATA_WAREHOUSE_TOOLS, ...REQUEST_QUEUE_TOOLS_EXT, ...AGENT_MODE_TOOLS_V2, ...PLAN_MODE_TOOLS_V2, ...SPEED_ENGINE_TOOLS, ...BRAIN_TOOLS, ...SELF_CHECK_TOOLS,
];

const MAX_STEPS = 50;
const MAX_FIX_ATTEMPTS = 3;
const MAX_TOOL_LOOPS = 30;

export interface AgentOptions {
  broadcast?: WebSocketBroadcast;
  maxSteps?: number;
  mode?: "plan" | "auto" | "chat";
}

export interface AgentConfig {
  workspaceDir: string;
  maxRetries: number;
  maxSteps: number;
}

export interface AgentEvent {
  type: "status" | "step_start" | "step_complete" | "step_failed" | "log" | "plan" | "error" | "complete";
  taskId: string;
  data: any;
  timestamp: Date;
}

export type EventHandler = (event: AgentEvent) => void;

export class Agent {
  private config: AgentConfig;
  private memory: AgentMemory;
  private eventHandlers: EventHandler[] = [];
  private isRunning = false;
  private currentTaskId: string | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.memory = new AgentMemory(config.workspaceDir);
  }

  onEvent(handler: EventHandler) {
    this.eventHandlers.push(handler);
  }

  private emit(event: AgentEvent) {
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch {}
    }
  }

  async executeTask(task: string, context?: string): Promise<{
    taskId: string;
    success: boolean;
    summary: string;
    results: StepResult[];
  }> {
    const taskId = uuidv4();
    this.currentTaskId = taskId;
    this.isRunning = true;

    const ctx = createSession(task);

    try {
      this.emit({ type: "status", taskId, data: { status: "planning", message: "Creating execution plan..." }, timestamp: new Date() });

      let plan: Plan;
      try {
        plan = await createPlan(task, context);
      } catch (err: any) {
        this.emit({ type: "error", taskId, data: { message: `Planning failed: ${err.message}` }, timestamp: new Date() });
        return { taskId, success: false, summary: `Planning failed: ${err.message}`, results: [] };
      }

      this.emit({ type: "plan", taskId, data: { plan }, timestamp: new Date() });

      this.emit({ type: "status", taskId, data: { status: "executing", message: `Executing ${plan.steps.length} steps...`, totalSteps: plan.steps.length }, timestamp: new Date() });

      const completedSteps: number[] = [];
      let totalStepsExecuted = 0;
      let currentPlan = plan;

      for (let i = 0; i < currentPlan.steps.length; i++) {
        if (!this.isRunning) break;
        if (totalStepsExecuted >= this.config.maxSteps) {
          this.emit({ type: "error", taskId, data: { message: `Max steps (${this.config.maxSteps}) reached` }, timestamp: new Date() });
          break;
        }

        const step = currentPlan.steps[i];
        totalStepsExecuted++;

        const depsOk = step.dependsOn.every((depId) => completedSteps.includes(depId));
        if (!depsOk) {
          this.emit({ type: "step_failed", taskId, data: { stepId: step.id, reason: "Dependencies not met" }, timestamp: new Date() });
          continue;
        }

        this.emit({ type: "step_start", taskId, data: { stepId: step.id, description: step.description, type: step.type, progress: `${i + 1}/${currentPlan.steps.length}` }, timestamp: new Date() });

        const startTime = Date.now();
        let result = await executeStep(step as unknown as StepDef);

        if (!result.success) {
          let fixed = false;

          for (let retry = 1; retry <= this.config.maxRetries; retry++) {
            this.emit({ type: "status", taskId, data: { status: "fixing", message: `Fixing error (attempt ${retry}/${this.config.maxRetries})...` }, timestamp: new Date() });

            const fixResult = await analyzeAndFix({
              error: result.error || result.output || "",
              command: step.details?.command,
              filePath: step.details?.path,
              stepDescription: step.description,
              taskId,
              attempt: retry,
            });

            if (fixResult.success) {
              result = await executeStep(step as unknown as StepDef);
              if (result.success) { fixed = true; break; }
            }
          }

          if (!fixed) {
            this.emit({ type: "status", taskId, data: { status: "replanning", message: "Revising execution plan..." }, timestamp: new Date() });

            try {
              const revisedPlan = await revisePlan(
                currentPlan,
                completedSteps,
                { id: step.id, error: result.error || result.output || "" },
                task,
              );

              const newSteps = revisedPlan.steps.filter((s) => !completedSteps.includes(s.id));
              if (newSteps.length > 0) {
                currentPlan = { ...revisedPlan, steps: newSteps };
                i = -1;
                this.emit({ type: "plan", taskId, data: { plan: currentPlan, revised: true }, timestamp: new Date() });
                continue;
              }
            } catch {}
          }
        }

        const stepResult: StepResult = {
          stepId: String(step.id),
          action: step.type,
          description: step.description,
          status: result.success ? "completed" : "failed",
          result: result.result,
          error: result.error,
          startTime,
          endTime: Date.now(),
        };
        addStepResult(ctx.sessionId, stepResult);

        if (result.success) completedSteps.push(step.id);

        this.emit({ type: result.success ? "step_complete" : "step_failed", taskId, data: { stepId: step.id, result: stepResult, progress: `${completedSteps.length}/${currentPlan.steps.length}` }, timestamp: new Date() });
      }

      const allResults = ctx.steps;
      const successCount = allResults.filter((r) => r.status === "completed").length;
      const failCount = allResults.filter((r) => r.status === "failed").length;
      const success = failCount === 0;

      updateSession(ctx.sessionId, { status: success ? "completed" : "failed" });
      await saveSessionToDB(ctx);

      const summary = `Task ${success ? "completed" : "partially completed"}: ${successCount}/${allResults.length} steps succeeded, ${failCount} failed.`;

      this.emit({ type: "complete", taskId, data: { success, summary, results: allResults }, timestamp: new Date() });

      return { taskId, success, summary, results: allResults };
    } catch (err: any) {
      updateSession(ctx.sessionId, { status: "failed" });
      await saveSessionToDB(ctx);
      return { taskId, success: false, summary: `Fatal error: ${err.message}`, results: ctx.steps };
    } finally {
      this.isRunning = false;
      this.currentTaskId = null;
    }
  }

  async executeTaskAdvanced(task: string, options?: {
    useMultiAgent?: boolean;
    autoSnapshot?: boolean;
    context?: string;
  }): Promise<{
    taskId: string;
    success: boolean;
    summary: string;
    results: StepResult[];
  }> {
    const taskId = uuidv4();
    this.currentTaskId = taskId;
    this.isRunning = true;
    const startTime = Date.now();

    try {
      if (options?.autoSnapshot) {
        this.emit({ type: "status", taskId, data: { status: "snapshot", message: "Creating checkpoint..." }, timestamp: new Date() });
        await createSnapshot({ name: `pre-task-${taskId.slice(0, 8)}`, description: `Before: ${task.slice(0, 100)}` });
      }

      const smartCtxResult = await getSmartContext({ task });
      const fullContext = `${smartCtxResult.output || ""}\n${options?.context || ""}`;

      let result;

      if (options?.useMultiAgent) {
        this.emit({ type: "status", taskId, data: { status: "multi-agent", message: "Activating specialist agents..." }, timestamp: new Date() });
        const multiResult = await multiAgentOrchestrate({ task });

        this.emit({ type: "status", taskId, data: { status: "executing", message: "Executing multi-agent plan..." }, timestamp: new Date() });
        result = await this.executeTask(task, (multiResult.output || "") + "\n\n" + fullContext);
      } else {
        result = await this.executeTask(task, fullContext);
      }

      await recordSmartTask({
        taskId,
        task,
        success: result.success,
        stepsCount: result.results.length,
        errorsCount: result.results.filter((r) => r.status === "failed").length,
        duration: Date.now() - startTime,
        fixesApplied: [],
      });

      if (options?.autoSnapshot && result.success) {
        await createSnapshot({ name: `post-task-${taskId.slice(0, 8)}`, description: `After: ${task.slice(0, 100)}` });
      }

      return result;
    } catch (err: any) {
      if (options?.autoSnapshot) {
        this.emit({ type: "error", taskId, data: { message: `Task failed: ${err.message}. Snapshot available for rollback.` }, timestamp: new Date() });
      }
      throw err;
    } finally {
      this.isRunning = false;
      this.currentTaskId = null;
    }
  }

  stop() {
    this.isRunning = false;
    cleanup();
  }

  getProjectContext(): string {
    return this.memory.getProjectContext();
  }
}

export async function runAgent(
  task: string,
  options: AgentOptions = {},
): Promise<{ sessionId: string; status: string; summary: string; steps: StepResult[] }> {
  const broadcast = options.broadcast || (() => {});
  const ctx = createSession(task);

  broadcast({ type: "session_start", sessionId: ctx.sessionId, task });

  try {
    if (options.mode === "chat") {
      return await runChatMode(ctx, task, broadcast);
    }

    broadcast({ type: "status", status: "planning", message: "מתכנן את המשימה..." });
    updateSession(ctx.sessionId, { status: "planning" });

    const steps = await planTask(task);
    broadcast({
      type: "plan",
      steps: steps.map(s => ({ id: s.id, action: s.action, description: s.description })),
    });

    updateSession(ctx.sessionId, { status: "executing" });
    broadcast({ type: "status", status: "executing", message: `מבצע ${steps.length} צעדים...` });

    const results: ExecutionResult[] = [];
    const completedIds = new Set<string>();
    let fixAttempts = 0;

    for (let i = 0; i < Math.min(steps.length, options.maxSteps || MAX_STEPS); i++) {
      const step = steps[i];

      const unmetDeps = step.depends_on.filter(d => !completedIds.has(d));
      if (unmetDeps.length > 0) {
        const depResult: StepResult = {
          stepId: step.id, action: step.action, description: step.description,
          status: "skipped", error: `תלוי ב: ${unmetDeps.join(", ")}`,
        };
        addStepResult(ctx.sessionId, depResult);
        broadcast({ type: "step_skip", step: depResult });
        continue;
      }

      broadcast({ type: "step_start", stepId: step.id, action: step.action, description: step.description });

      const result = await executeStep(step);
      results.push(result);

      const stepResult: StepResult = {
        stepId: step.id,
        action: step.action,
        description: step.description,
        status: result.success ? "completed" : "failed",
        result: result.result,
        error: result.error,
        startTime: Date.now() - (result.durationMs || 0),
        endTime: Date.now(),
      };
      addStepResult(ctx.sessionId, stepResult);

      if (result.success) {
        completedIds.add(step.id);
        broadcast({ type: "step_complete", step: stepResult });
      } else {
        broadcast({ type: "step_fail", step: stepResult });

        if (fixAttempts < MAX_FIX_ATTEMPTS) {
          fixAttempts++;
          broadcast({ type: "status", status: "fixing", message: `מנסה לתקן (${fixAttempts}/${MAX_FIX_ATTEMPTS})...` });
          updateSession(ctx.sessionId, { status: "fixing" });

          const analysis = await analyzeError(step, result, results);
          broadcast({ type: "error_analysis", diagnosis: analysis.diagnosis });

          if (analysis.fixSteps.length > 0) {
            for (const fixStep of analysis.fixSteps) {
              broadcast({ type: "fix_step", stepId: fixStep.id, description: fixStep.description });
              const fixResult = await executeStep(fixStep);
              const fixStepResult: StepResult = {
                stepId: fixStep.id, action: fixStep.action, description: fixStep.description,
                status: fixResult.success ? "completed" : "failed",
                result: fixResult.result, error: fixResult.error,
              };
              addStepResult(ctx.sessionId, fixStepResult);
              broadcast({ type: fixResult.success ? "fix_success" : "fix_fail", step: fixStepResult });
            }

            if (isRetryable(result.error || "")) {
              i--;
              continue;
            }
          }

          if (!analysis.canContinue) {
            broadcast({ type: "status", status: "failed", message: `נעצר: ${analysis.diagnosis}` });
            break;
          }

          updateSession(ctx.sessionId, { status: "executing" });
        }
      }
    }

    const completed = ctx.steps.filter(s => s.status === "completed").length;
    const failed = ctx.steps.filter(s => s.status === "failed").length;
    const status = failed === 0 ? "completed" : completed > 0 ? "partial" : "failed";

    updateSession(ctx.sessionId, { status: status as any });
    await saveSessionToDB(ctx);

    const summary = `✅ ${completed} הצליחו | ❌ ${failed} נכשלו | סה"כ ${ctx.steps.length} צעדים | ${Date.now() - ctx.startTime}ms`;
    broadcast({ type: "session_complete", status, summary });

    return { sessionId: ctx.sessionId, status, summary, steps: ctx.steps };
  } catch (e: any) {
    updateSession(ctx.sessionId, { status: "failed" });
    await saveSessionToDB(ctx);
    broadcast({ type: "session_error", error: e.message });
    return { sessionId: ctx.sessionId, status: "failed", summary: `שגיאה: ${e.message}`, steps: ctx.steps };
  }
}

async function runChatMode(
  ctx: AgentContext,
  task: string,
  broadcast: WebSocketBroadcast,
): Promise<{ sessionId: string; status: string; summary: string; steps: StepResult[] }> {
  const messages: LLMMessage[] = [
    { role: "user", content: task },
  ];

  const relevantTools = selectRelevantTools(task, ALL_TOOLS);
  broadcast({ type: "perf", message: `🎯 ${relevantTools.length}/${ALL_TOOLS.length} כלים רלוונטיים נבחרו` });

  let loops = 0;
  let finalText = "";

  while (loops < MAX_TOOL_LOOPS) {
    loops++;

    const compressedMessages = compressPromptHistory(messages, 30) as LLMMessage[];

    const cached = await cacheGet({ system: SYSTEM_PROMPT, messages: compressedMessages });
    let response;

    if (cached.cached && cached.response) {
      response = cached.response;
      broadcast({ type: "perf", message: "⚡ תגובה מקאש" });
    } else {
      const llmStart = Date.now();
      response = await callLLM({
        system: SYSTEM_PROMPT,
        messages: compressedMessages,
        tools: relevantTools,
      });
      const llmMs = Date.now() - llmStart;
      recordLLMCall(llmMs);
      broadcast({ type: "perf", message: `🧠 LLM: ${llmMs}ms` });

      const textOnly = response.content.filter((b: ContentBlock) => b.type === "text");
      if (textOnly.length > 0 && response.stopReason === "end_turn") {
        await cacheSet({ system: SYSTEM_PROMPT, messages: compressedMessages, response, latencyMs: llmMs, ttl: 1800000 });
      }
    }

    const textBlocks = response.content.filter((b: ContentBlock): b is ContentBlock & { type: "text" } => b.type === "text");
    const toolBlocks = response.content.filter((b: ContentBlock): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use");

    for (const tb of textBlocks) {
      if (tb.text) {
        finalText += tb.text;
        broadcast({ type: "text", content: tb.text });
      }
    }

    if (toolBlocks.length === 0 || response.stopReason === "end_turn") {
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: ContentBlock[] = [];

    if (toolBlocks.length > 1) {
      broadcast({ type: "perf", message: `🔀 ${toolBlocks.length} כלים במקביל...` });

      for (const tc of toolBlocks) {
        broadcast({ type: "tool_call", name: tc.name, input: tc.input });
      }

      const parallelResult = await parallelExecuteTools({
        tools: toolBlocks.map((tc: ContentBlock) => ({ name: tc.name!, params: tc.input })),
        executor: executeTool,
      });

      broadcast({ type: "perf", message: parallelResult.output });

      for (let j = 0; j < toolBlocks.length; j++) {
        const tc = toolBlocks[j];
        const pr = parallelResult.results[j];
        broadcast({ type: "tool_result", name: tc.name, result: pr.result });

        const stepResult: StepResult = {
          stepId: `tool_${loops}_${tc.name}`,
          action: tc.name!,
          description: JSON.stringify(tc.input).substring(0, 100),
          status: pr.result?.success !== false ? "completed" : "failed",
          result: pr.result,
        };
        addStepResult(ctx.sessionId, stepResult);

        toolResults.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: truncateToolResults(pr.result, 12000),
        });
      }
    } else {
      for (const tc of toolBlocks) {
        broadcast({ type: "tool_call", name: tc.name, input: tc.input });
        const toolStart = Date.now();
        const result = await executeTool(tc.name!, tc.input);
        const toolMs = Date.now() - toolStart;
        recordToolMetric(tc.name!, toolMs, result?.success !== false);
        broadcast({ type: "tool_result", name: tc.name, result });
        broadcast({ type: "perf", message: `🔧 ${tc.name}: ${toolMs}ms` });

        const stepResult: StepResult = {
          stepId: `tool_${loops}_${tc.name}`,
          action: tc.name!,
          description: JSON.stringify(tc.input).substring(0, 100),
          status: result.success !== false ? "completed" : "failed",
          result,
        };
        addStepResult(ctx.sessionId, stepResult);

        toolResults.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: truncateToolResults(result, 12000),
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  updateSession(ctx.sessionId, { status: "completed" });
  await saveSessionToDB(ctx);

  return {
    sessionId: ctx.sessionId,
    status: "completed",
    summary: finalText || "בוצע",
    steps: ctx.steps,
  };
}