/**
 * BASH44 Data Fabric — API Routes
 */

import { Router, type Request, type Response } from "express";
import { dataFabric } from "../lib/data-fabric-engine";
import { seedDataFabric } from "../lib/data-fabric-seed";

seedDataFabric();

const router = Router();

// ─── Overview ──────────────────────────────────────────────────
router.get("/overview", (_req: Request, res: Response) => {
  res.json({ ok: true, overview: dataFabric.overview() });
});

// ─── Data Sources ──────────────────────────────────────────────
router.get("/sources", (req: Request, res: Response) => {
  const category = req.query["category"] as string | undefined;
  const type = req.query["type"] as string | undefined;
  let sources = dataFabric.connectors.all();
  if (category) sources = sources.filter(s => s.category === category);
  if (type) sources = sources.filter(s => s.sourceType === type);
  res.json({ ok: true, sources, health: dataFabric.connectors.health() });
});

router.get("/sources/:key", (req: Request, res: Response) => {
  const s = dataFabric.connectors.get(req.params["key"]!);
  if (!s) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, source: s });
});

// ─── Ingestion ─────────────────────────────────────────────────
router.get("/ingestion/jobs", (_req: Request, res: Response) => {
  res.json({ ok: true, jobs: dataFabric.ingestion.allJobs(), stats: dataFabric.ingestion.stats() });
});

router.post("/ingestion/jobs/:id/run", async (req: Request, res: Response) => {
  try {
    const run = await dataFabric.ingestion.runJob(Number(req.params["id"]));
    res.json({ ok: true, run });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/ingestion/runs", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  res.json({ ok: true, runs: dataFabric.ingestion.recentRuns(limit), stats: dataFabric.ingestion.stats() });
});

// ─── Datasets ──────────────────────────────────────────────────
router.get("/datasets", (req: Request, res: Response) => {
  const zone = req.query["zone"] as string | undefined;
  const domain = req.query["domain"] as string | undefined;
  let datasets = dataFabric.datasets.all();
  if (zone) datasets = datasets.filter(d => d.zone === zone);
  if (domain) datasets = datasets.filter(d => d.domain === domain);
  res.json({ ok: true, datasets, summary: dataFabric.datasets.summary() });
});

router.get("/datasets/:key", (req: Request, res: Response) => {
  const d = dataFabric.datasets.get(req.params["key"]!);
  if (!d) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, dataset: d });
});

// ─── Canonical Model ───────────────────────────────────────────
router.get("/canonical/entities", (_req: Request, res: Response) => {
  res.json({ ok: true, entities: dataFabric.canonical.allEntities() });
});

router.get("/canonical/entities/:key", (req: Request, res: Response) => {
  const e = dataFabric.canonical.getEntity(req.params["key"]!);
  if (!e) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, entity: e, mappings: dataFabric.canonical.mappingsForEntity(req.params["key"]!) });
});

// ─── Identity Resolution ───────────────────────────────────────
router.get("/identity/clusters", (req: Request, res: Response) => {
  const entity = req.query["entity"] as string | undefined;
  const clusters = entity
    ? dataFabric.identity.clustersForEntity(entity)
    : dataFabric.identity.allClusters();
  res.json({ ok: true, clusters, stats: dataFabric.identity.stats() });
});

// ─── Pipelines ─────────────────────────────────────────────────
router.get("/pipelines", (_req: Request, res: Response) => {
  res.json({ ok: true, pipelines: dataFabric.pipelines.all() });
});

router.get("/pipelines/:key", (req: Request, res: Response) => {
  const p = dataFabric.pipelines.get(req.params["key"]!);
  if (!p) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, pipeline: p });
});

router.post("/pipelines/:id/run", async (req: Request, res: Response) => {
  try {
    const result = await dataFabric.pipelines.run(Number(req.params["id"]));
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// ─── Lineage ───────────────────────────────────────────────────
router.get("/lineage", (_req: Request, res: Response) => {
  res.json({ ok: true, edges: dataFabric.lineage.allEdges(), summary: dataFabric.lineage.graphSummary() });
});

router.get("/lineage/downstream", (req: Request, res: Response) => {
  const type = req.query["type"] as string;
  const id = req.query["id"] as string;
  const depth = Math.min(5, Number(req.query["depth"] ?? 3));
  if (!type || !id) { res.status(400).json({ ok: false, error: "type and id required" }); return; }
  res.json({ ok: true, edges: dataFabric.lineage.downstream(type, id, depth) });
});

router.get("/lineage/upstream", (req: Request, res: Response) => {
  const type = req.query["type"] as string;
  const id = req.query["id"] as string;
  const depth = Math.min(5, Number(req.query["depth"] ?? 3));
  if (!type || !id) { res.status(400).json({ ok: false, error: "type and id required" }); return; }
  res.json({ ok: true, edges: dataFabric.lineage.upstream(type, id, depth) });
});

// ─── Quality ───────────────────────────────────────────────────
router.get("/quality/rules", (req: Request, res: Response) => {
  const dataset = req.query["dataset"] as string | undefined;
  const rules = dataset
    ? dataFabric.quality.rulesForDataset(dataset)
    : dataFabric.quality.allRules();
  res.json({ ok: true, rules, summary: dataFabric.quality.summary() });
});

router.get("/quality/results", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  res.json({ ok: true, results: dataFabric.quality.recentResults(limit), summary: dataFabric.quality.summary() });
});

// ─── Freshness ─────────────────────────────────────────────────
router.get("/freshness", (_req: Request, res: Response) => {
  const measurements = dataFabric.freshness.scanAll();
  res.json({ ok: true, measurements, summary: dataFabric.freshness.summary() });
});

// ─── Write-Back Actions ────────────────────────────────────────
router.get("/write-back", (_req: Request, res: Response) => {
  res.json({ ok: true, actions: dataFabric.writeBack.recent(100), pending: dataFabric.writeBack.pending() });
});

// ─── Change Events (CDC) ───────────────────────────────────────
router.get("/change-events", (req: Request, res: Response) => {
  const limit = Math.min(500, Number(req.query["limit"] ?? 100));
  const sourceId = req.query["sourceId"] ? Number(req.query["sourceId"]) : undefined;
  const events = sourceId
    ? dataFabric.changeEvents.bySource(sourceId, limit)
    : dataFabric.changeEvents.recent(limit);
  res.json({ ok: true, events, stats: dataFabric.changeEvents.stats() });
});

// ─── Data Products ─────────────────────────────────────────────
router.get("/products", (req: Request, res: Response) => {
  const domain = req.query["domain"] as string | undefined;
  const products = domain ? dataFabric.products.byDomain(domain) : dataFabric.products.all();
  res.json({ ok: true, products });
});

router.get("/products/:key", (req: Request, res: Response) => {
  const p = dataFabric.products.get(req.params["key"]!);
  if (!p) { res.status(404).json({ ok: false, error: "not found" }); return; }
  res.json({ ok: true, product: p });
});

export default router;
