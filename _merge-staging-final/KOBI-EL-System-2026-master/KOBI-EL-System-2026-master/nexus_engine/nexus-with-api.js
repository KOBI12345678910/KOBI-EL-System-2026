// ══════════════════════════════════════════════════════════════════
// NEXUS WITH API — orchestrator that starts the engine + HTTP server
// + loads ALL advanced modules + connects to the Python platform
// ══════════════════════════════════════════════════════════════════
//
// Use this as the main entry point in production:
//   node nexus-with-api.js
//
// What it does:
//   1. Creates the NexusEngine
//   2. Registers all 10 advanced modules (ads, competitor, seo, leads, etc.)
//   3. Registers the palantir_sync bridge module
//   4. Starts the HTTP API server on port 3030 (or process.env.NEXUS_PORT)
//   5. Starts the autonomous cycle loop
//
// Now NEXUS is:
//   - Self-driving (autonomous cycles)
//   - Observable (HTTP dashboard on :3030)
//   - Multi-business (Techno-Kol Uzi + Elkayam)
//   - Integrated (bridges to the Python enterprise_palantir_core)
//   - Extensible (drop files in ./modules/ to add new capabilities)

const { NexusEngine, Logger } = require("./nexus-engine.js");
const { startHttpServer } = require("./api/http-server.js");
const { PalantirSyncModule } = require("./bridge/python-platform-bridge.js");

// Advanced modules
const GoogleAdsOptimizer = require("./modules/google-ads-optimizer.js");
const CompetitorIntel = require("./modules/competitor-intel.js");
const SeoContentGenerator = require("./modules/seo-content-generator.js");
const LeadScorer = require("./modules/lead-scorer.js");
const CashflowForecaster = require("./modules/cashflow-forecaster.js");
const MarketTrendAnalyzer = require("./modules/market-trend-analyzer.js");
const MultiLanguageTranslator = require("./modules/multi-language-translator.js");
const CalendarOrchestrator = require("./modules/calendar-orchestrator.js");
const DocumentExtractor = require("./modules/document-extractor.js");
const CrisisResponsePlanner = require("./modules/crisis-response-planner.js");

async function main() {
  Logger.info("BOOT", "═══════════════════════════════════════════");
  Logger.info("BOOT", "   NEXUS AUTONOMOUS ENGINE — FULL STACK");
  Logger.info("BOOT", "   (engine + API + 10 modules + bridge)");
  Logger.info("BOOT", "═══════════════════════════════════════════");

  const engine = new NexusEngine();

  // Initialize first (registers built-in modules)
  await engine.init();

  // Register the 10 advanced modules
  engine.modules.register("google_ads_optimizer", GoogleAdsOptimizer);
  engine.modules.register("competitor_intel", CompetitorIntel);
  engine.modules.register("seo_content_generator", SeoContentGenerator);
  engine.modules.register("lead_scorer", LeadScorer);
  engine.modules.register("cashflow_forecaster", CashflowForecaster);
  engine.modules.register("market_trend_analyzer", MarketTrendAnalyzer);
  engine.modules.register("multi_language_translator", MultiLanguageTranslator);
  engine.modules.register("calendar_orchestrator", CalendarOrchestrator);
  engine.modules.register("document_extractor", DocumentExtractor);
  engine.modules.register("crisis_response_planner", CrisisResponsePlanner);

  // Register the Python platform bridge
  engine.modules.register("palantir_sync", PalantirSyncModule);

  Logger.success("BOOT", `Registered ${engine.modules.modules.size} modules total`);

  // Start the HTTP API server
  const port = Number(process.env.NEXUS_PORT) || 3030;
  startHttpServer(engine, port);

  // Run the autonomous cycle loop
  Logger.info("BOOT", "Starting autonomous cycle loop...");
  await engine.runCycle();

  engine.interval = setInterval(async () => {
    if (engine.isRunning) {
      await engine.runCycle();
    }
  }, require("./nexus-engine.js").CONFIG.CYCLE_INTERVAL_MS);

  // Graceful shutdown
  process.on("SIGINT", () => engine.shutdown());
  process.on("SIGTERM", () => engine.shutdown());

  Logger.success("BOOT", "NEXUS is running. Open http://localhost:" + port + "/dashboard.html");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
