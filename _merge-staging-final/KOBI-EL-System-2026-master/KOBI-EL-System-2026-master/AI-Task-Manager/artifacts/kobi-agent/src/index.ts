import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { config } from "dotenv";
import { Agent, AgentConfig, runAgent } from "./agent/core";
import { executeTool, getAvailableTools } from "./agent/executor";
import { listSessions, getSession } from "./agent/memory";
import { AgentWebSocket, initWebSocket, broadcast, getClientCount } from "./ws/socket";
import { initCollabWebSocket } from "./tools/realtimeCollabTool";
import { addTask, cancelTask, getTaskStatus, listTasks, getQueueStats, clearQueue } from "./tools/taskQueueTool";
import { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot, diffSnapshot } from "./tools/snapshotTool";
import { getEnvVars, setEnvVar, removeEnvVar } from "./tools/envTool";
import { runCommand } from "./tools/terminalTool";
import { readFile, writeFile, listFiles } from "./tools/fileTool";
import { initRequestQueue, enqueueRequest, getQueue, getCurrent, getQueueStats as getRequestQueueStats, cancelQueuedRequest } from "./tools/requestQueueTool";
import { getAgentMode, setAgentMode, toggleAgentFeature, estimateTaskCost, getCurrentMode, getFeatureFlags } from "./agent/agentModes";
import { createPlan, getPlan, approvePlanTask, rejectPlanTask, modifyPlanTask } from "./flows/planModeFlow";
import { getFullHealth, getQuickStatus, checkServicesHealth } from "./tools/healthDashboardTool";
import { selfCheckFull, selfCheckQuick } from "./tools/selfCheckTool";
import { recordTokenUsage, getTokenStats, getRecentTokenUsage } from "./tools/tokenTrackerTool";
import { createCheckpoint, getTimeline, timeTravelTo, compareToCheckpoint } from "./tools/checkpointTool";
import { getRules, updateRules, setCustomRule } from "./tools/rulesSyncTool";
import { hotfix } from "./flows/hotfixFlow";
import { stopAllWatchers } from "./tools/watcherTool";
import { orchestrate as multiAgentOrchestrate, agentDiscussion } from "./agent/orchestrator";
import { startSelfHealing, stopSelfHealing, getSelfHealStatus, runAllChecksNow } from "./tools/selfHealTool";
import { analyzeProject, getAgentStats } from "./tools/smartContextTool";

config();

const PORT = parseInt(process.env.PORT || "3000", 10);
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

const app = express();
app.use(express.json({ limit: "50mb" }));

app.use(express.static(path.join(__dirname, "../src/ui")));

const server = http.createServer(app);

const wsServer = initWebSocket(server);
initCollabWebSocket(server);

const agentConfig: AgentConfig = {
  workspaceDir: WORKSPACE_DIR,
  maxRetries: parseInt(process.env.MAX_RETRIES || "5", 10),
  maxSteps: parseInt(process.env.MAX_STEPS || "50", 10),
};

const agent = new Agent(agentConfig);

agent.onEvent((event) => {
  wsServer.broadcast(event);
  if (event.type === "log") {
    console.log(event.data.message);
  } else if (event.type === "status") {
    console.log(`\n[${event.data.status.toUpperCase()}] ${event.data.message}`);
  } else if (event.type === "complete") {
    console.log(`\n${event.data.summary}`);
  }
});

app.get("/", (_req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, "../src/ui/index.html"), "utf-8");
    res.type("html").send(html);
  } catch {
    res.type("html").send("<h1>קובי Agent</h1><p>UI not found</p>");
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health", async (_req, res) => {
  const statsResult = await getAgentStats();
  const healStatus = await getSelfHealStatus();
  const queueStats = await getQueueStats();
  res.json({
    status: "ok",
    agent: "kobi",
    version: "3.0.0",
    uptime: process.uptime(),
    workspace: WORKSPACE_DIR,
    wsClients: getClientCount(),
    tools: getAvailableTools().length,
    memory: process.memoryUsage(),
    queue: queueStats.stats,
    learning: statsResult.stats,
    selfHeal: healStatus.statuses,
  });
});

app.post("/api/task", async (req, res) => {
  const { task, context } = req.body;
  if (!task || typeof task !== "string") {
    return res.status(400).json({ error: "Missing 'task' field" });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 New Task: ${task}`);
  console.log(`${"=".repeat(60)}`);

  try {
    const result = await agent.executeTask(task, context);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/task/advanced", async (req, res) => {
  const { task, context, useMultiAgent, autoSnapshot } = req.body;
  if (!task || typeof task !== "string") {
    return res.status(400).json({ error: "Missing 'task' field" });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 Advanced Task: ${task}`);
  console.log(`   Multi-Agent: ${!!useMultiAgent} | Auto-Snapshot: ${!!autoSnapshot}`);
  console.log(`${"=".repeat(60)}`);

  try {
    const result = await agent.executeTaskAdvanced(task, { useMultiAgent, autoSnapshot, context });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/multi-agent", async (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "Missing task" });
  try {
    const result = await multiAgentOrchestrate({ task, onLog: (msg: string) => console.log(msg) });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/build-flow", async (req, res) => {
  const { task, context, autoTest, autoLint, autoSnapshot, autoPreview, maxRetries } = req.body;
  if (!task) return res.status(400).json({ error: "Missing task" });

  const logs: string[] = [];
  const phases: Array<{ phase: string; status: string }> = [];

  try {
    const { runBuildFlow } = await import("./flows/buildFlow");
    const result = await runBuildFlow({
      task,
      context,
      config: {
        autoTest: autoTest !== false,
        autoLint: autoLint !== false,
        autoSnapshot: autoSnapshot !== false,
        autoPreview: autoPreview !== false,
        maxRetries: maxRetries || 3,
      },
      onLog: (msg: string) => { logs.push(msg); console.log(msg); },
      onPhase: (phase: string, status: string) => { phases.push({ phase, status }); },
    });
    res.json({ ...result, logs, phases });
  } catch (err: any) {
    res.status(500).json({ error: err.message, logs, phases });
  }
});

app.post("/api/diagnostic", async (req, res) => {
  const { problem } = req.body;
  if (!problem) return res.status(400).json({ error: "Missing problem" });

  const logs: string[] = [];
  const phases: Array<{ phase: string; status: string }> = [];

  try {
    const { diagnoseAndFix } = await import("./flows/diagnosticFlow");
    const result = await diagnoseAndFix({
      problem,
      onLog: (msg: string) => { logs.push(msg); console.log(msg); },
      onPhase: (phase: string, status: string) => { phases.push({ phase, status }); },
    });
    res.json({ ...result, logs, phases });
  } catch (err: any) {
    res.status(500).json({ error: err.message, logs, phases });
  }
});

app.post("/api/diagnostic/quick-fix", async (req, res) => {
  const { error } = req.body;
  if (!error) return res.status(400).json({ error: "Missing error" });
  try {
    const { quickFix } = await import("./flows/diagnosticFlow");
    const result = await quickFix({ error });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/diagnostic/recover-server", async (req, res) => {
  const { port } = req.body;
  try {
    const { recoverServer } = await import("./flows/diagnosticFlow");
    const result = await recoverServer({ port });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/flow/model", async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "Missing description" });
  try {
    const { createModel } = await import("./flows/dataFlow");
    const result = await createModel({ description });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/flow/model/:name/field", async (req, res) => {
  const modelName = String(req.params.name);
  const { fieldName, fieldType, required, unique, defaultValue } = req.body;
  if (!fieldName || !fieldType) return res.status(400).json({ error: "Missing fieldName or fieldType" });
  try {
    const { addField } = await import("./flows/dataFlow");
    const result = await addField({ modelName, fieldName, fieldType, required, unique, defaultValue });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/flow/model/:name/seed", async (req, res) => {
  const modelName = String(req.params.name);
  try {
    const { seedModel } = await import("./flows/dataFlow");
    const result = await seedModel({ modelName, count: req.body.count });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/flow/model/:name/cleanup", async (req, res) => {
  const modelName = String(req.params.name);
  try {
    const { cleanupData } = await import("./flows/dataFlow");
    const result = await cleanupData({ modelName, ...req.body });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/flow/quality-gate", async (req, res) => {
  try {
    const { runQualityGates } = await import("./flows/qualityGateFlow");
    const result = await runQualityGates(req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/flow/upgrade", async (req, res) => {
  try {
    const { upgradeAll } = await import("./flows/upgradeFlow");
    const result = await upgradeAll(req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/realtime/channels", async (_req, res) => {
  try {
    const { getRealtimeChannels } = await import("./flows/realtimeFlow");
    const result = await getRealtimeChannels({});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/realtime/history/:channel", async (req, res) => {
  const channel = String(req.params.channel);
  try {
    const { getRealtimeHistory } = await import("./flows/realtimeFlow");
    const result = await getRealtimeHistory({ channel, limit: parseInt(String(req.query.limit || "50")) });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/multi-agent/discuss", async (req, res) => {
  const { topic, agents } = req.body;
  if (!topic) return res.status(400).json({ error: "Missing topic" });
  try {
    const result = await agentDiscussion({ topic, agents: agents || [] });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/self-heal/start", async (_req, res) => {
  try {
    const result = await startSelfHealing({
      onLog: (msg) => console.log(`[SelfHeal] ${msg}`),
      onAlert: (alert) => {
        console.log(`[ALERT:${alert.severity}] ${alert.message}`);
        wsServer.broadcast({ type: "alert", taskId: "system", data: alert, timestamp: new Date() });
      },
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/self-heal/stop", async (_req, res) => {
  const result = await stopSelfHealing();
  res.json(result);
});

app.get("/api/self-heal/status", async (_req, res) => {
  const result = await getSelfHealStatus();
  res.json(result);
});

app.post("/api/self-heal/check", async (_req, res) => {
  try {
    const result = await runAllChecksNow();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stats", async (_req, res) => {
  const result = await getAgentStats();
  res.json(result);
});

app.post("/api/analyze", async (_req, res) => {
  try {
    const result = await analyzeProject();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stop", (_req, res) => {
  agent.stop();
  res.json({ success: true, message: "Agent stopped" });
});

app.get("/api/context", (_req, res) => {
  res.json({ context: agent.getProjectContext() });
});

app.post("/api/agent/run", async (req, res) => {
  const { task, mode } = req.body;
  if (!task) return res.status(400).json({ error: "task is required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    broadcast(data);
  };

  try {
    const result = await runAgent(task, { broadcast: send, mode: mode || "auto" });
    send({ type: "done", ...result });
  } catch (e: any) {
    send({ type: "error", message: e.message });
  }
  res.end();
});

app.post("/api/agent/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    broadcast(data);
  };

  try {
    const result = await runAgent(message, { broadcast: send, mode: "chat" });
    send({ type: "done", ...result });
  } catch (e: any) {
    send({ type: "error", message: e.message });
  }
  res.end();
});

app.post("/api/vision/analyze", async (req, res) => {
  const { base64, mediaType, prompt, imagePath, url, mode } = req.body;
  try {
    let result;
    if (base64) {
      const { analyzeImageFromBase64 } = await import("./tools/visionTool");
      result = await analyzeImageFromBase64({ base64, mediaType, prompt });
    } else if (url) {
      const { analyzeImageFromURL } = await import("./tools/visionTool");
      result = await analyzeImageFromURL({ url, prompt });
    } else if (imagePath) {
      if (mode === "ocr") {
        const { extractTextFromImage } = await import("./tools/visionTool");
        result = await extractTextFromImage({ imagePath });
      } else if (mode === "ui") {
        const { analyzeUIScreenshot } = await import("./tools/visionTool");
        result = await analyzeUIScreenshot({ imagePath });
      } else if (mode === "document") {
        const { analyzeDocument } = await import("./tools/visionTool");
        result = await analyzeDocument({ imagePath });
      } else if (mode === "chart") {
        const { analyzeChartOrDiagram } = await import("./tools/visionTool");
        result = await analyzeChartOrDiagram({ imagePath });
      } else if (mode === "error") {
        const { analyzeErrorScreenshot } = await import("./tools/visionTool");
        result = await analyzeErrorScreenshot({ imagePath });
      } else if (mode === "alt") {
        const { describeImageForAlt } = await import("./tools/visionTool");
        result = await describeImageForAlt({ imagePath });
      } else {
        const { analyzeImage } = await import("./tools/visionTool");
        result = await analyzeImage({ imagePath, prompt });
      }
    } else {
      return res.status(400).json({ error: "Provide base64, url, or imagePath" });
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/vision/compare", async (req, res) => {
  const { imagePaths, prompt } = req.body;
  if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length < 2) {
    return res.status(400).json({ error: "Provide at least 2 imagePaths" });
  }
  try {
    const { compareImages } = await import("./tools/visionTool");
    const result = await compareImages({ imagePaths, prompt });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/tool/execute", async (req, res) => {
  const { tool, params } = req.body;
  if (!tool) return res.status(400).json({ error: "tool is required" });
  const result = await executeTool(tool, params || {});
  res.json(result);
});

app.get("/api/tools", (_req, res) => {
  res.json({ tools: getAvailableTools() });
});

app.get("/api/sessions", (_req, res) => {
  const sessions = listSessions().map(s => ({
    sessionId: s.sessionId,
    taskId: s.taskId,
    status: s.status,
    stepsTotal: s.steps.length,
    stepsCompleted: s.steps.filter(st => st.status === "completed").length,
    stepsFailed: s.steps.filter(st => st.status === "failed").length,
    durationMs: Date.now() - s.startTime,
    startTime: new Date(s.startTime).toISOString(),
  }));
  res.json({ sessions });
});

app.get("/api/sessions/:id", (req, res) => {
  const session = getSession(String(req.params.id));
  if (!session) return res.status(404).json({ error: "session not found" });
  res.json(session);
});

app.post("/api/queue/add", async (req, res) => {
  const { task, context, priority, dependsOn } = req.body;
  const result = await addTask({ task, context, priority, dependsOn });
  res.json(result);
});

app.get("/api/queue", async (_req, res) => {
  const [tasks, stats] = await Promise.all([listTasks(), getQueueStats()]);
  res.json({ tasks: tasks.tasks, stats: stats.stats });
});

app.get("/api/queue/:id", async (req, res) => {
  const result = await getTaskStatus({ task_id: String(req.params.id) });
  if (!result.success) return res.status(404).json({ error: result.output });
  res.json(result);
});

app.delete("/api/queue/:id", async (req, res) => {
  const result = await cancelTask({ task_id: String(req.params.id) });
  res.json(result);
});

app.delete("/api/queue", async (_req, res) => {
  const result = await clearQueue();
  res.json(result);
});

app.post("/api/snapshot", async (req, res) => {
  const { name, description } = req.body;
  const result = await createSnapshot({ name: name || "manual", description });
  res.json(result);
});

app.get("/api/snapshots", async (_req, res) => {
  const result = await listSnapshots();
  res.json(result);
});

app.post("/api/snapshot/:id/restore", async (req, res) => {
  const result = await restoreSnapshot({ snapshot_id: String(req.params.id) });
  res.json(result);
});

app.delete("/api/snapshot/:id", async (req, res) => {
  const result = await deleteSnapshot({ snapshot_id: String(req.params.id) });
  res.json(result);
});

app.get("/api/snapshot/:id/diff", async (req, res) => {
  const result = await diffSnapshot({ snapshot_id: String(req.params.id) });
  res.json(result);
});

app.get("/api/env", async (_req, res) => {
  const result = await getEnvVars();
  res.json(result);
});

app.post("/api/env", async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Missing key" });
  const result = await setEnvVar({ key, value });
  res.json(result);
});

app.delete("/api/env/:key", async (req, res) => {
  const result = await removeEnvVar({ key: String(req.params.key) });
  res.json(result);
});

app.get("/api/files", async (req, res) => {
  const dir = (req.query.path as string) || ".";
  const result = await listFiles({ path: dir });
  res.json(result);
});

app.get("/api/files/read", async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "Missing path" });
  const result = await readFile({ path: filePath });
  res.json(result);
});

app.post("/api/files/write", async (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: "Missing path" });
  const result = await writeFile({ path: filePath, content });
  res.json(result);
});

app.post("/api/terminal", async (req, res) => {
  const { command, timeout, cwd } = req.body;
  if (!command) return res.status(400).json({ error: "Missing command" });
  const result = await runCommand({ command, timeout, cwd });
  res.json(result);
});

app.get("/api/ports", async (_req, res) => {
  const result = await runCommand({ command: "ss -tlnp 2>/dev/null | grep LISTEN || netstat -tlnp 2>/dev/null | grep LISTEN", timeout: 5000 });
  res.json({ success: true, output: result.stdout });
});

app.post("/api/ports/:port/kill", async (req, res) => {
  const port = String(req.params.port);
  const result = await runCommand({ command: `fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null`, timeout: 5000 });
  res.json({ success: true, output: `Killed processes on port ${port}` });
});

server.listen(PORT, "0.0.0.0", () => {
  const toolCount = getAvailableTools().length;
  console.log(`
╔════════════════════════════════════════════════╗
║            🤖 KOBI AGENT v3.0.0               ║
║                                                ║
║  API:        http://localhost:${String(PORT).padEnd(18)}║
║  WebSocket:  ws://localhost:${String(PORT).padEnd(15)}/ws ║
║  UI:         http://localhost:${String(PORT).padEnd(18)}║
║  Workspace:  ${WORKSPACE_DIR.padEnd(33)}║
║  Tools:      ${String(toolCount).padEnd(33)}║
║                                                ║
║  Modules: File | Terminal | Git | DB | Search  ║
║    Deploy | Test | Lint | Preview | Snapshot   ║
║    Queue | Env | DocGen | Performance          ║
║    Network | Scaffold | CodeReview | Watcher   ║
║    Dependencies | TaskQueue | Orchestrator     ║
║    SelfHeal | AIArchitect | FullStackGen       ║
║    I18n | SEO | A11y | Collab | SmartCtx       ║
║    Migration | Conversation | Debugger         ║
║    DatabaseGUI | LogViewer | APIGen | Cron     ║
║    FeatureFlags | PluginSystem | ProcessMgr    ║
║    AICommit | MergeConflict | Refactoring     ║
║    ImageOpt | EmailTemplate | QueueSystem     ║
║    Cache | SearchEngine | RateLimit           ║
║    FileUpload | SSE | KVStore | FormBuilder   ║
║    DataGrid | Analytics | PDF | Notification  ║
║    UIGen (Monaco/Terminal/FileTree/Diff/etc)  ║
║    Security | Vision | Speed | Cognitive       ║
║    BuildFlow (10-phase auto pipeline)         ║
║    DiagnosticFlow (auto debug & fix & recover)║
║    DataFlow (model/seed/pipeline/integrity)   ║
║    RealtimeFlow (WS pub/sub 8 channels)      ║
║    QualityGate (7-gate weighted scoring)     ║
║    UpgradeFlow (safe dep upgrades+rollback)  ║
║    ParallelAgent (Kanban + parallel exec)    ║
║    BrowserTest (Playwright + periodic)       ║
║    AgentSpawner (create/deploy sub-agents)   ║
║    DesignCanvas (variants/pages/mobile)      ║
║    Connectors (19 services: Stripe,Slack..)  ║
║    WebSearch (solutions/docs/packages)       ║
║    Serverless (Lambda/Worker/K8s/Terraform)  ║
║    Integrations (Stripe/Sentry/Search/PDF)   ║
║    TokenTracker (usage/cost/stats/estimate)  ║
║    AgentMode (lite/economy/power/turbo/max)  ║
║    PlanMode (plan/approve/reject/execute)    ║
║    Checkpoint (auto/timeline/time-travel)   ║
║    ContentGen (slides/animation/dashboard)  ║
║    MCP (connect/call/generate MCP servers)  ║
║    CodeOptimize (analyze/quick-optimize)    ║
║    ExtendedThinking (deep/architect/debug)  ║
║    MultiModelRouter (smart model selection) ║
║    ContextManager (smart context/compress)  ║
║    LearningEngine (learn/recall/patterns)   ║
║    CodeGraph (deps/dead-code/impact)        ║
║    AutoRecovery (self-heal/watch/recover)   ║
║    Proactive (scan/suggest/health-check)    ║
║    Streaming (generate/code/explain)        ║
║    DiffPatch (smart-diff/multi-edit/revert) ║
║    FigmaImport (figma/json/react/tailwind)  ║
║    MobileDeploy (expo/eas/build/push)       ║
║    Audio (transcribe/TTS/voice-chat)        ║
║    RulesSync (rules/context/init/custom)    ║
║    HotfixFlow (emergency fix/rollback)      ║
║    HealthDashboard (system/services/metrics) ║
║    DataWarehouse (snowflake/bigquery/databricks)║
║    RequestQueue (enqueue/status/cancel)       ║
║    AgentModes (auto/plan/code/chat/debug)     ║
║    PlanMode (create/approve/reject/modify)    ║
║    SpeedEngine (cache/parallel/batch/optimizer)║
║    Brain (think/learn/remember/persist)       ║
║    SelfCheck (20 automated system checks)    ║
╚════════════════════════════════════════════════╝
  `);
});

// ═══ AGENT MODE ROUTES ═══
app.get("/api/mode", (_req, res) => {
  res.json({ mode: getCurrentMode(), features: getFeatureFlags() });
});

app.post("/api/mode", (req, res) => {
  const result = setAgentMode({ mode: req.body.mode });
  res.json(result);
});

app.post("/api/mode/feature", (req, res) => {
  const result = toggleAgentFeature({ feature: req.body.feature, value: req.body.value });
  res.json(result);
});

app.post("/api/mode/estimate", (req, res) => {
  const result = estimateTaskCost({ complexity: req.body.complexity || "medium" });
  res.json(result);
});

// ═══ REQUEST QUEUE ROUTES ═══
app.post("/api/chat", async (req, res) => {
  const result = enqueueRequest({ message: req.body.message, priority: req.body.priority, context: req.body.context });
  res.json(result);
});

app.get("/api/chat/queue", (_req, res) => {
  res.json({ queue: getQueue(), current: getCurrent(), stats: getRequestQueueStats() });
});

app.delete("/api/chat/queue/:id", (req, res) => {
  const result = cancelQueuedRequest({ id: String(req.params.id) });
  res.json(result);
});

// ═══ PLAN MODE ROUTES ═══
app.post("/api/plan", async (req, res) => {
  const result = await createPlan({ task: req.body.task });
  res.json(result);
});

app.get("/api/plan", (_req, res) => {
  const result = getPlan({});
  res.json(result);
});

app.post("/api/plan/approve", (req, res) => {
  const result = approvePlanTask({ taskId: req.body.taskId });
  res.json(result);
});

app.post("/api/plan/reject", (req, res) => {
  const result = rejectPlanTask({ taskId: req.body.taskId, reason: req.body.reason });
  res.json(result);
});

app.post("/api/plan/modify", (req, res) => {
  const result = modifyPlanTask({ taskId: req.body.taskId, changes: req.body.changes });
  res.json(result);
});

// ═══ CHECKPOINT ROUTES ═══
app.get("/api/timeline", async (_req, res) => {
  const result = await getTimeline({});
  res.json(result);
});

app.post("/api/timeline/travel", async (req, res) => {
  const result = await timeTravelTo({ checkpointId: req.body.checkpointId });
  res.json(result);
});

app.get("/api/timeline/:id/diff", async (req, res) => {
  const result = await compareToCheckpoint({ checkpointId: String(req.params.id) });
  res.json(result);
});

app.post("/api/checkpoint", async (req, res) => {
  const result = await createCheckpoint({ trigger: "manual", description: req.body.description });
  res.json(result);
});

// ═══ HOTFIX ROUTES ═══
app.post("/api/flow/hotfix", async (req, res) => {
  const result = await hotfix({ issue: req.body.issue });
  res.json(result);
});

// ═══ RULES ROUTES ═══
app.get("/api/rules", async (_req, res) => {
  const result = await getRules({});
  res.json(result);
});

app.put("/api/rules", async (req, res) => {
  const result = await updateRules(req.body);
  res.json(result);
});

app.post("/api/rules/custom", async (req, res) => {
  const result = await setCustomRule({ key: req.body.key, value: req.body.value });
  res.json(result);
});

// ═══ TOKEN TRACKING ROUTES ═══
app.get("/api/tokens", async (_req, res) => {
  const result = await getTokenStats({});
  res.json(result);
});

app.get("/api/tokens/recent", async (req, res) => {
  const result = await getRecentTokenUsage({ limit: parseInt(req.query.limit as string) || 50 });
  res.json(result);
});

// ═══ HEALTH DASHBOARD ROUTES ═══
app.get("/api/dashboard/health", async (_req, res) => {
  const result = await getFullHealth({});
  const statusCode = result.health?.status === "critical" ? 503 : 200;
  res.status(statusCode).json(result);
});

app.get("/api/dashboard/health/quick", async (_req, res) => {
  const result = await getQuickStatus({});
  res.json(result);
});

app.get("/api/dashboard/health/services", async (_req, res) => {
  const result = await checkServicesHealth({});
  res.json(result);
});

app.post("/api/self-check", async (_req, res) => {
  const report = await selfCheckFull({ checks: _req.body?.checks });
  res.json(report);
});

app.get("/api/self-check/quick", async (_req, res) => {
  const result = await selfCheckQuick({} as Record<string, never>);
  res.json(result);
});

console.log("\n🔍 Running startup self-check...");
selfCheckQuick({} as Record<string, never>).then(result => {
  if (result.status === "issues_found") {
    console.warn("⚠️  System has some issues — run POST /api/self-check for full report.");
  } else {
    console.log("✅ System healthy — ready to go!");
  }
}).catch(() => {});

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  agent.stop();
  stopAllWatchers();
  server.close();
  process.exit(0);
});
