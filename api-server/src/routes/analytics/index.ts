// ============================================================
// Analytics domain — API aggregator (9 modules)
// Mount in parent with: router.use('/api/analytics', analyticsRouter)
//
// This router is the NEW canonical analytics surface. Legacy flat-file
// routes (analytics-engine.ts, business-analytics.ts, dashboard-kpi.ts,
// dashboard-stats.ts) are left untouched — they remain mounted on their
// original paths and can be retired in a future phase.
// ============================================================
import { Router, type IRouter } from "express";

import dashboardsRouter from "./dashboards";
import dashboardWidgetsRouter from "./dashboard-widgets";
import reportsRouter from "./reports";
import kpiDefinitionsRouter from "./kpi-definitions";
import kpiSnapshotsRouter from "./kpi-snapshots";
import drilldownPathsRouter from "./drilldown-paths";
import readModelInvalidationsRouter from "./read-model-invalidations";
import customMetricsRouter from "./custom-metrics";
import rmSummariesRouter from "./rm-summaries";

const analyticsRouter: IRouter = Router();

analyticsRouter.use("/dashboards", dashboardsRouter);
analyticsRouter.use("/dashboard-widgets", dashboardWidgetsRouter);
analyticsRouter.use("/reports", reportsRouter);
analyticsRouter.use("/kpi-definitions", kpiDefinitionsRouter);
analyticsRouter.use("/kpi-snapshots", kpiSnapshotsRouter);
analyticsRouter.use("/drilldown-paths", drilldownPathsRouter);
analyticsRouter.use("/read-model-invalidations", readModelInvalidationsRouter);
analyticsRouter.use("/custom-metrics", customMetricsRouter);
analyticsRouter.use("/rm-summaries", rmSummariesRouter);

// Meta health endpoint
analyticsRouter.get("/__analytics-health", (_req, res) => {
  res.json({
    ok: true,
    domain: "analytics",
    modules: 9,
    modules_list: [
      "dashboards",
      "dashboard-widgets",
      "reports",
      "kpi-definitions",
      "kpi-snapshots",
      "drilldown-paths",
      "read-model-invalidations",
      "custom-metrics",
      "rm-summaries",
    ],
    generated: "2026-04-18",
  });
});

export default analyticsRouter;
