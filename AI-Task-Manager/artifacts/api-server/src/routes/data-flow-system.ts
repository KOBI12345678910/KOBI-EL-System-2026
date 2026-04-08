import { Router } from "express";
import { getDataFlowRegistry, getModuleDataSpec, getLifecycleChain } from "../lib/data-flow-registry";
import { getEnrichmentHistory, getEnrichmentStats } from "../lib/ai-enrichment-service";
import { getSyncHistory, getSyncStatus } from "../lib/cross-module-sync";
import { getFlowHistory, getFlowStats, getFlowDefinitions } from "../lib/data-flow-engine";

const router = Router();

router.get("/data-flow/registry", (_req, res) => {
  const registry = getDataFlowRegistry();
  res.json(registry);
});

router.get("/data-flow/lifecycle", (_req, res) => {
  const chain = getLifecycleChain();
  const registry = getDataFlowRegistry();
  const lifecycle = chain.map(nodeId => {
    const node = registry.nodes.find(n => n.id === nodeId);
    return node || { id: nodeId, name: nodeId };
  });
  res.json({ chain, nodes: lifecycle });
});

router.get("/data-flow/module/:nodeId", (req, res) => {
  const spec = getModuleDataSpec(req.params.nodeId);
  if (!spec) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  res.json(spec);
});

router.get("/data-flow/enrichment/history", (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json(getEnrichmentHistory(limit));
});

router.get("/data-flow/enrichment/stats", (_req, res) => {
  res.json(getEnrichmentStats());
});

router.get("/data-flow/sync/history", (_req, res) => {
  res.json(getSyncHistory());
});

router.get("/data-flow/sync/status", (_req, res) => {
  res.json(getSyncStatus());
});

router.get("/data-flow/pipelines", (_req, res) => {
  res.json(getFlowDefinitions());
});

router.get("/data-flow/pipelines/history", (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json(getFlowHistory(limit));
});

router.get("/data-flow/pipelines/stats", (_req, res) => {
  res.json(getFlowStats());
});

router.get("/data-flow/overview", (_req, res) => {
  const registry = getDataFlowRegistry();
  const syncStatus = getSyncStatus();
  const enrichmentStats = getEnrichmentStats();
  const pipelineStats = getFlowStats();
  const pipelineDefs = getFlowDefinitions();

  res.json({
    lifecycle: getLifecycleChain(),
    totalNodes: registry.nodes.length,
    totalEdges: registry.edges.length,
    totalPipelines: pipelineDefs.length,
    syncHandlers: syncStatus.handlers.length,
    activeSyncHandlers: syncStatus.handlers.filter(h => h.active).length,
    syncStatus: {
      totalSyncs: syncStatus.totalSyncs,
      recentSyncs: syncStatus.recentSyncs,
      successRate: syncStatus.successRate,
    },
    enrichmentStatus: {
      total: enrichmentStats.total,
      last24h: enrichmentStats.last24h,
      successRate: enrichmentStats.successRate,
      totalFieldsEnriched: enrichmentStats.totalFieldsEnriched,
    },
    pipelineStatus: {
      total: pipelineStats.total,
      last24h: pipelineStats.last24h,
      successRate: pipelineStats.successRate,
      totalRecords: pipelineStats.totalRecords,
    },
    categories: {
      crm: registry.nodes.filter(n => n.category === "crm").length,
      sales: registry.nodes.filter(n => n.category === "sales").length,
      engineering: registry.nodes.filter(n => n.category === "engineering").length,
      procurement: registry.nodes.filter(n => n.category === "procurement").length,
      inventory: registry.nodes.filter(n => n.category === "inventory").length,
      production: registry.nodes.filter(n => n.category === "production").length,
      logistics: registry.nodes.filter(n => n.category === "logistics").length,
      installation: registry.nodes.filter(n => n.category === "installation").length,
      finance: registry.nodes.filter(n => n.category === "finance").length,
      executive: registry.nodes.filter(n => n.category === "executive").length,
    },
  });
});

export default router;
