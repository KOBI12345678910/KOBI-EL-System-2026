/**
 * BASH44 Data Platform Core — API Routes
 *
 * Production-grade endpoints for:
 *  - Ingestion (POST records, webhooks)
 *  - Raw store browsing
 *  - Quarantine management
 *  - Canonical entities
 *  - Event store (timeline, replay)
 *  - State store (live entity state)
 *  - Ontology objects
 *  - Lineage
 *  - Schema registry
 *  - Pipeline metrics / observability
 *  - Live company snapshot
 *  - AI context packets
 */

import { Router, type Request, type Response } from "express";
import { dataPlatform, type RawRecord } from "../lib/data-platform-core";
import { seedDataPlatform } from "../lib/data-platform-seed";

seedDataPlatform();

const router = Router();

// ─── Live Snapshot ────────────────────────────────────────────
router.get("/snapshot", (_req: Request, res: Response) => {
  res.json({ ok: true, snapshot: dataPlatform.liveSnapshot.build() });
});

// ─── Ingestion Endpoints ──────────────────────────────────────
router.post("/ingest/:pipelineName", async (req: Request, res: Response) => {
  try {
    const pipelineName = req.params["pipelineName"]!;
    const body = req.body as { records?: Partial<RawRecord>[] } | undefined;
    const records: RawRecord[] = (body?.records ?? []).map((r, i) => ({
      recordId: r.recordId ?? `raw_api_${Date.now()}_${i}`,
      tenantId: r.tenantId ?? "tenant_techno",
      sourceId: r.sourceId ?? "api",
      sourceRecordId: r.sourceRecordId ?? `api_${Date.now()}_${i}`,
      schemaName: r.schemaName ?? "unknown",
      schemaVersion: r.schemaVersion ?? "1.0",
      payload: r.payload ?? {},
      ingestedAt: new Date(),
      correlationId: r.correlationId,
    }));
    const result = await dataPlatform.ingestBatch(pipelineName, records);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Webhook ingestion — generic entry point for external systems
router.post("/webhook/:sourceId", async (req: Request, res: Response) => {
  try {
    const sourceId = req.params["sourceId"]!;
    const payload = req.body as Record<string, unknown>;
    const raw: RawRecord = {
      recordId: `raw_webhook_${Date.now()}`,
      tenantId: (payload["tenantId"] as string) ?? "tenant_techno",
      sourceId,
      sourceRecordId: (payload["id"] as string) ?? `webhook_${Date.now()}`,
      schemaName: (payload["schema"] as string) ?? "generic_event",
      schemaVersion: (payload["schema_version"] as string) ?? "1.0",
      payload,
      ingestedAt: new Date(),
      correlationId: (payload["correlation_id"] as string) ?? undefined,
    };
    const result = await dataPlatform.ingest(`webhook_${sourceId}`, raw);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// ─── Raw Store ────────────────────────────────────────────────
router.get("/raw", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  const sourceId = req.query["sourceId"] as string | undefined;
  const records = sourceId
    ? dataPlatform.rawStore.bySource(sourceId, limit)
    : dataPlatform.rawStore.recent(limit);
  res.json({ ok: true, records, count: dataPlatform.rawStore.count() });
});

// ─── Quarantine ───────────────────────────────────────────────
router.get("/quarantine", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  res.json({
    ok: true,
    records: dataPlatform.quarantineStore.recent(limit),
    count: dataPlatform.quarantineStore.count(),
    byStatus: dataPlatform.quarantineStore.countByStatus(),
  });
});

router.post("/quarantine/:recordId/release", (req: Request, res: Response) => {
  const ok = dataPlatform.quarantineStore.release(req.params["recordId"]!);
  res.json({ ok });
});

router.post("/quarantine/:recordId/discard", (req: Request, res: Response) => {
  const ok = dataPlatform.quarantineStore.discard(req.params["recordId"]!);
  res.json({ ok });
});

// ─── Canonical Entities ───────────────────────────────────────
router.get("/canonical", (req: Request, res: Response) => {
  const type = req.query["type"] as string | undefined;
  const records = type
    ? dataPlatform.canonicalStore.byType(type)
    : dataPlatform.canonicalStore.all();
  res.json({ ok: true, records, count: records.length });
});

router.get("/canonical/:id", (req: Request, res: Response) => {
  const record = dataPlatform.canonicalStore.get(req.params["id"]!);
  if (!record) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, record });
});

// ─── Event Store (timeline, replay) ───────────────────────────
router.get("/events", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  res.json({ ok: true, events: dataPlatform.eventStore.recent(limit), count: dataPlatform.eventStore.count() });
});

router.get("/events/entity/:id", (req: Request, res: Response) => {
  const limit = Math.min(200, Number(req.query["limit"] ?? 50));
  res.json({ ok: true, events: dataPlatform.eventStore.recentForEntity(req.params["id"]!, limit) });
});

router.get("/events/replay/:id", (req: Request, res: Response) => {
  const from = req.query["from"] ? new Date(String(req.query["from"])) : undefined;
  const to = req.query["to"] ? new Date(String(req.query["to"])) : undefined;
  res.json({ ok: true, events: dataPlatform.eventStore.replay(req.params["id"]!, from, to) });
});

// ─── State Store ──────────────────────────────────────────────
router.get("/states", (req: Request, res: Response) => {
  const type = req.query["type"] as string | undefined;
  const states = type ? dataPlatform.stateStore.byType(type) : dataPlatform.stateStore.all();
  res.json({ ok: true, states, count: states.length });
});

router.get("/states/at-risk", (_req: Request, res: Response) => {
  res.json({ ok: true, states: dataPlatform.stateStore.atRisk() });
});

router.get("/states/:id", (req: Request, res: Response) => {
  const state = dataPlatform.stateStore.get(req.params["id"]!);
  if (!state) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, state });
});

// ─── Ontology Objects ─────────────────────────────────────────
router.get("/ontology", (req: Request, res: Response) => {
  const type = req.query["type"] as string | undefined;
  const objects = type ? dataPlatform.ontologyStore.byType(type) : dataPlatform.ontologyStore.all();
  res.json({ ok: true, objects, count: objects.length });
});

router.get("/ontology/:id", (req: Request, res: Response) => {
  const obj = dataPlatform.ontologyStore.get(req.params["id"]!);
  if (!obj) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, object: obj });
});

// ─── Lineage ──────────────────────────────────────────────────
router.get("/lineage", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 200));
  res.json({ ok: true, records: dataPlatform.lineageStore.recent(limit), count: dataPlatform.lineageStore.count() });
});

router.get("/lineage/canonical/:id", (req: Request, res: Response) => {
  res.json({ ok: true, records: dataPlatform.lineageStore.forCanonical(req.params["id"]!) });
});

router.get("/lineage/pipeline/:name", (req: Request, res: Response) => {
  res.json({ ok: true, records: dataPlatform.lineageStore.forPipeline(req.params["name"]!, 200) });
});

// ─── Schema Registry ──────────────────────────────────────────
router.get("/schemas", (_req: Request, res: Response) => {
  res.json({ ok: true, schemas: dataPlatform.schemaRegistry.all() });
});

router.get("/schemas/:name", (req: Request, res: Response) => {
  const versions = dataPlatform.schemaRegistry.versionsOf(req.params["name"]!);
  res.json({ ok: true, versions });
});

router.get("/schemas/:name/:version", (req: Request, res: Response) => {
  const schema = dataPlatform.schemaRegistry.get(req.params["name"]!, req.params["version"]!);
  if (!schema) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, schema });
});

// ─── Pipeline Metrics / Observability ─────────────────────────
router.get("/pipelines/metrics", (_req: Request, res: Response) => {
  res.json({ ok: true, metrics: dataPlatform.observability.all() });
});

router.get("/pipelines/metrics/:name", (req: Request, res: Response) => {
  const metrics = dataPlatform.observability.get(req.params["name"]!);
  if (!metrics) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, metrics });
});

// ─── AI Context Builder ───────────────────────────────────────
router.get("/ai-context/entity/:id", (req: Request, res: Response) => {
  const context = dataPlatform.aiContextBuilder.buildEntityContext(req.params["id"]!);
  res.json({ ok: true, context });
});

router.get("/ai-context/situation", (_req: Request, res: Response) => {
  res.json({ ok: true, context: dataPlatform.aiContextBuilder.buildSituationContext() });
});

export default router;
