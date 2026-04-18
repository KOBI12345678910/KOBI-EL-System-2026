// ============================================================
// Intelligence domain — API aggregator (15 models)
// Mount in parent with: router.use('/api/intelligence', intelligenceRouter)
// ============================================================
import { Router, type IRouter } from "express";
import aiInsightsRouter from "./ai-insights";
import anomalyCasesRouter from "./anomaly-cases";
import decisionRecommendationsRouter from "./decision-recommendations";
import forecastModelsRouter from "./forecast-models";
import trendSignalsRouter from "./trend-signals";
import seasonalityPatternsRouter from "./seasonality-patterns";
import qualityScoresRouter from "./quality-scores";
import agentRegistryRouter from "./agent-registry";
import agentJobsRouter from "./agent-jobs";
import modelRegistryRouter from "./model-registry";
import modelExecutionsRouter from "./model-executions";
import recommendationFeedbackRouter from "./recommendation-feedback";
import anomalyFeedbackRouter from "./anomaly-feedback";
import promptTemplatesRouter from "./prompt-templates";
import orchestrationFlowsRouter from "./orchestration-flows";

const intelligenceRouter: IRouter = Router();

intelligenceRouter.use(aiInsightsRouter);
intelligenceRouter.use(anomalyCasesRouter);
intelligenceRouter.use(decisionRecommendationsRouter);
intelligenceRouter.use(forecastModelsRouter);
intelligenceRouter.use(trendSignalsRouter);
intelligenceRouter.use(seasonalityPatternsRouter);
intelligenceRouter.use(qualityScoresRouter);
intelligenceRouter.use(agentRegistryRouter);
intelligenceRouter.use(agentJobsRouter);
intelligenceRouter.use(modelRegistryRouter);
intelligenceRouter.use(modelExecutionsRouter);
intelligenceRouter.use(recommendationFeedbackRouter);
intelligenceRouter.use(anomalyFeedbackRouter);
intelligenceRouter.use(promptTemplatesRouter);
intelligenceRouter.use(orchestrationFlowsRouter);

// Meta health endpoint
intelligenceRouter.get("/__intelligence-health", (_req, res) => {
  res.json({
    ok: true,
    domain: "intelligence",
    models: 15,
    models_list: [
      "ai_insights", "anomaly_cases", "decision_recommendations", "forecast_models",
      "trend_signals", "seasonality_patterns", "quality_scores",
      "agent_registry", "agent_jobs", "model_registry", "model_executions",
      "recommendation_feedback", "anomaly_feedback",
      "prompt_templates", "orchestration_flows",
    ],
    generated: "2026-04-18",
  });
});

export default intelligenceRouter;
