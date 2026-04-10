/**
 * BASH44 Real-Time Operational Intelligence Platform — API Routes
 *
 * All endpoints for:
 *  - Live company snapshot
 *  - Event stream (pull + SSE)
 *  - Entity states
 *  - Causal graph
 *  - Decisions
 *  - Executions
 *  - Learning outcomes
 *  - Profit intelligence
 *  - AI Brain reasoning
 *  - Manual event publish (for module integration + testing)
 */

import { Router, type Request, type Response } from "express";
import { realtimePlatform, type UnifiedEvent, type ModuleKey } from "../lib/realtime-platform-engine";
import { intelligencePlatform } from "../lib/intelligence-engines";
import { seedIntelligencePlatform } from "../lib/intelligence-seed";

// Ensure seed runs on first import
seedIntelligencePlatform();

const router = Router();

// ────────────────────────────────────────────────────────────────
// COMPANY SNAPSHOT — the live picture of everything
// ────────────────────────────────────────────────────────────────
router.get("/snapshot", (_req: Request, res: Response) => {
  const snapshot = realtimePlatform.Snapshot.company();
  res.json({ ok: true, snapshot });
});

router.get("/snapshot/pulse", (req: Request, res: Response) => {
  const minutes = Math.min(240, Number(req.query["minutes"] ?? 60));
  res.json({
    ok: true,
    pulse: realtimePlatform.Pulse.snapshot(),
    history: realtimePlatform.Pulse.history(minutes),
  });
});

// ────────────────────────────────────────────────────────────────
// EVENTS
// ────────────────────────────────────────────────────────────────
router.get("/events", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  const module = req.query["module"] as ModuleKey | undefined;
  const severity = req.query["severity"] as string | undefined;
  const entityType = req.query["entityType"] as string | undefined;
  const entityId = req.query["entityId"] as string | undefined;

  let events = realtimePlatform.Events.recent(limit);
  if (module) events = events.filter(e => e.sourceModule === module);
  if (severity) events = events.filter(e => e.severity === severity);
  if (entityType && entityId) {
    events = events.filter(e => e.entityType === entityType && e.entityId === entityId);
  }
  res.json({ ok: true, events, count: events.length });
});

router.get("/events/critical", (_req: Request, res: Response) => {
  res.json({ ok: true, events: realtimePlatform.Events.critical(50) });
});

router.post("/events", (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<UnifiedEvent>;
    if (!body.eventType || !body.sourceModule || !body.entityType || !body.entityId) {
      res.status(400).json({ ok: false, error: "missing required fields" });
      return;
    }
    const event = realtimePlatform.publish({
      eventType: body.eventType,
      sourceModule: body.sourceModule,
      entityType: body.entityType,
      entityId: body.entityId,
      entityLabel: body.entityLabel,
      severity: body.severity ?? "info",
      newState: body.newState ?? null,
      previousState: body.previousState ?? null,
      delta: body.delta ?? null,
      financialImpact: body.financialImpact ?? null,
      businessImpact: body.businessImpact,
      metadata: body.metadata,
      tags: body.tags,
    });
    res.json({ ok: true, event });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Server-Sent Events stream — live updates to the browser
router.get("/events/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Send recent events on connect
  const recent = realtimePlatform.Events.recent(20);
  for (const e of recent.reverse()) {
    res.write(`data: ${JSON.stringify({ type: "event", event: e })}\n\n`);
  }

  // Send current snapshot header
  const snapshot = realtimePlatform.Snapshot.company();
  res.write(`data: ${JSON.stringify({ type: "snapshot", snapshot })}\n\n`);

  // Subscribe to bus
  const unsubEvent = realtimePlatform.Bus.subscribeAll((event) => {
    try {
      res.write(`data: ${JSON.stringify({ type: "event", event })}\n\n`);
    } catch {}
  });

  // Periodic snapshot push every 10s
  const snapInterval = setInterval(() => {
    try {
      const s = realtimePlatform.Snapshot.company();
      res.write(`data: ${JSON.stringify({ type: "snapshot", snapshot: s })}\n\n`);
    } catch {}
  }, 10_000);

  // Heartbeat every 20s
  const hbInterval = setInterval(() => {
    try { res.write(": hb\n\n"); } catch {}
  }, 20_000);

  req.on("close", () => {
    unsubEvent();
    clearInterval(snapInterval);
    clearInterval(hbInterval);
    try { res.end(); } catch {}
  });
});

// ────────────────────────────────────────────────────────────────
// ENTITY STATES
// ────────────────────────────────────────────────────────────────
router.get("/entities", (req: Request, res: Response) => {
  const module = req.query["module"] as ModuleKey | undefined;
  const needsAttention = req.query["needsAttention"] === "true";
  let states = realtimePlatform.State.all();
  if (module) states = states.filter(s => s.module === module);
  if (needsAttention) states = states.filter(s => s.needsAttention);
  res.json({ ok: true, entities: states, count: states.length });
});

router.get("/entities/needing-attention", (_req: Request, res: Response) => {
  res.json({ ok: true, entities: realtimePlatform.State.needingAttention() });
});

router.get("/entities/:type/:id", (req: Request, res: Response) => {
  const state = realtimePlatform.State.get(req.params["type"]!, req.params["id"]!);
  if (!state) {
    res.status(404).json({ ok: false, error: "entity not found" });
    return;
  }
  res.json({ ok: true, entity: state });
});

router.get("/entities/:type/:id/events", (req: Request, res: Response) => {
  const events = realtimePlatform.Events.forEntity(req.params["type"]!, req.params["id"]!);
  res.json({ ok: true, events });
});

// ────────────────────────────────────────────────────────────────
// CAUSAL GRAPH
// ────────────────────────────────────────────────────────────────
router.get("/causal/:type/:id/downstream", (req: Request, res: Response) => {
  const depth = Math.min(5, Number(req.query["depth"] ?? 3));
  const chain = realtimePlatform.Causal.propagate(req.params["type"]!, req.params["id"]!, "warning", depth);
  res.json({ ok: true, chain, total: chain.length });
});

router.get("/causal/:type/:id/upstream", (req: Request, res: Response) => {
  const depth = Math.min(5, Number(req.query["depth"] ?? 3));
  const causes = realtimePlatform.Causal.traceCauses(req.params["type"]!, req.params["id"]!, depth);
  res.json({ ok: true, causes, total: causes.length });
});

router.get("/causal/impact-chains", (_req: Request, res: Response) => {
  res.json({ ok: true, chains: realtimePlatform.Causal.recentImpactChains(30) });
});

// ────────────────────────────────────────────────────────────────
// KPIs
// ────────────────────────────────────────────────────────────────
router.get("/kpis", (req: Request, res: Response) => {
  const category = req.query["category"] as string | undefined;
  const kpis = category
    ? realtimePlatform.KPIs.byCategory(category)
    : realtimePlatform.KPIs.all();
  res.json({ ok: true, kpis });
});

router.get("/kpis/:key", (req: Request, res: Response) => {
  const kpi = realtimePlatform.KPIs.get(req.params["key"]!);
  if (!kpi) {
    res.status(404).json({ ok: false, error: "KPI not found" });
    return;
  }
  res.json({ ok: true, kpi });
});

// ────────────────────────────────────────────────────────────────
// ALERTS
// ────────────────────────────────────────────────────────────────
router.get("/alerts", (req: Request, res: Response) => {
  const onlyOpen = req.query["status"] === "open";
  const critical = req.query["severity"] === "critical";
  let alerts = onlyOpen || critical ? realtimePlatform.Alerts.open() : realtimePlatform.Alerts.open();
  if (critical) alerts = alerts.filter(a => a.severity === "critical" || a.severity === "blocker");
  res.json({ ok: true, alerts });
});

router.post("/alerts/:key/acknowledge", (req: Request, res: Response) => {
  const a = realtimePlatform.Alerts.acknowledge(req.params["key"]!);
  res.json({ ok: true, alert: a });
});

router.post("/alerts/:key/resolve", (req: Request, res: Response) => {
  const a = realtimePlatform.Alerts.resolve(req.params["key"]!);
  res.json({ ok: true, alert: a });
});

// ────────────────────────────────────────────────────────────────
// DECISIONS
// ────────────────────────────────────────────────────────────────
router.get("/decisions", (req: Request, res: Response) => {
  const priority = req.query["priority"] as string | undefined;
  const pending = req.query["pending"] === "true";
  let decisions = pending ? intelligencePlatform.decisions.pending() : intelligencePlatform.decisions.recent(100);
  if (priority) decisions = decisions.filter(d => d.priority === priority);
  res.json({ ok: true, decisions, count: decisions.length });
});

router.get("/decisions/pending", (_req: Request, res: Response) => {
  res.json({ ok: true, decisions: intelligencePlatform.decisions.pending() });
});

router.get("/decisions/:id", (req: Request, res: Response) => {
  const d = intelligencePlatform.decisions.byId(Number(req.params["id"]));
  if (!d) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, decision: d });
});

router.post("/decisions/:id/approve", async (req: Request, res: Response) => {
  const userId = (req.body?.userId as string) ?? "system";
  const result = await intelligencePlatform.approveAndExecute(Number(req.params["id"]), userId);
  res.json({ ok: true, ...result });
});

router.post("/decisions/:id/reject", (req: Request, res: Response) => {
  const userId = (req.body?.userId as string) ?? "system";
  const d = intelligencePlatform.decisions.reject(Number(req.params["id"]), userId);
  res.json({ ok: true, decision: d });
});

router.get("/decisions-rules/list", (_req: Request, res: Response) => {
  const rules = intelligencePlatform.decisions.allRules().map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    triggerEventTypes: r.triggerEventTypes,
    actionType: r.action.actionType,
    autoExecutable: r.action.autoExecutable,
    enabled: r.enabled,
  }));
  res.json({ ok: true, rules });
});

// ────────────────────────────────────────────────────────────────
// EXECUTIONS
// ────────────────────────────────────────────────────────────────
router.get("/executions", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  res.json({
    ok: true,
    executions: intelligencePlatform.execution.recent(limit),
    stats: intelligencePlatform.execution.stats(),
  });
});

router.get("/executions/stats", (_req: Request, res: Response) => {
  res.json({ ok: true, stats: intelligencePlatform.execution.stats() });
});

// ────────────────────────────────────────────────────────────────
// LEARNING
// ────────────────────────────────────────────────────────────────
router.get("/learning/stats", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ruleStats: intelligencePlatform.learning.allStats(),
    accuracy: intelligencePlatform.learning.predictionAccuracy(),
    suggestions: intelligencePlatform.learning.suggestRuleAdjustments(),
  });
});

router.get("/learning/records", (req: Request, res: Response) => {
  const limit = Math.min(200, Number(req.query["limit"] ?? 50));
  res.json({
    ok: true,
    records: intelligencePlatform.learning.recentRecords(limit),
  });
});

// ────────────────────────────────────────────────────────────────
// PROFIT INTELLIGENCE
// ────────────────────────────────────────────────────────────────
router.get("/profit/summary", (_req: Request, res: Response) => {
  res.json({ ok: true, summary: intelligencePlatform.profit.summary() });
});

router.get("/profit/entity/:type/:id", (req: Request, res: Response) => {
  const value = Number(req.query["value"] ?? 10000);
  const impact = intelligencePlatform.profit.computeEntityProfit(req.params["type"]!, req.params["id"]!, value);
  res.json({ ok: true, impact });
});

// ────────────────────────────────────────────────────────────────
// AI BRAIN — reasoning over live state
// ────────────────────────────────────────────────────────────────
router.get("/brain/situation", (_req: Request, res: Response) => {
  res.json({ ok: true, analysis: intelligencePlatform.brain.analyzeSituation() });
});

router.get("/brain/forecast", (_req: Request, res: Response) => {
  res.json({ ok: true, predictions: intelligencePlatform.brain.forecastNext() });
});

router.get("/brain/explain/:type/:id", (req: Request, res: Response) => {
  const explanation = intelligencePlatform.brain.explainEntity(req.params["type"]!, req.params["id"]!);
  res.json({ ok: true, explanation });
});

// ────────────────────────────────────────────────────────────────
// MODULE HEARTBEATS
// ────────────────────────────────────────────────────────────────
router.get("/heartbeats", (_req: Request, res: Response) => {
  res.json({ ok: true, heartbeats: realtimePlatform.Heartbeats.all() });
});

export default router;
