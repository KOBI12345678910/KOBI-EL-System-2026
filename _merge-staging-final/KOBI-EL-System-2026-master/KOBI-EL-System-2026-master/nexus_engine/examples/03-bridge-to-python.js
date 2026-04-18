// Example 3: bridge to the Python enterprise_palantir_core platform
//
// Prerequisites:
//   cd enterprise_palantir_core
//   FORCE_SEED=true uvicorn app.main:app --host 127.0.0.1 --port 8000 &
//
// Then run: node examples/03-bridge-to-python.js

const { NexusEngine } = require("../nexus-engine.js");
const { PalantirBridge, PalantirSyncModule } = require("../bridge/python-platform-bridge.js");

async function main() {
  const engine = new NexusEngine();
  await engine.init();
  engine.modules.register("palantir_sync", PalantirSyncModule);

  // Direct bridge usage
  const bridge = new PalantirBridge();

  console.log("\n[1/6] Health check against Python platform...");
  const health = await bridge.healthCheck();
  if (health.error) {
    console.log("  ✗ Not reachable:", health.error);
    console.log("  (Start it with: cd enterprise_palantir_core && uvicorn app.main:app --host 127.0.0.1 --port 8000)");
    engine.isRunning = false;
    return;
  }
  console.log("  ✓ Connected:", health.app);

  console.log("\n[2/6] Command center snapshot...");
  const snapshot = await bridge.getSnapshot();
  if (snapshot.error) {
    console.log("  ✗", snapshot.error);
  } else {
    console.log(`  ✓ Overall health: ${snapshot.overall_health_score} | Objects: ${snapshot.total_objects} | At-risk: ${snapshot.at_risk_entities}`);
  }

  console.log("\n[3/6] Company P&L...");
  const pl = await bridge.getCompanyPL();
  if (!pl.error) {
    console.log(`  ✓ Revenue: ₪${pl.total_revenue_ils.toLocaleString()} | Profit: ₪${pl.gross_profit_ils.toLocaleString()} | Margin: ${pl.gross_margin_pct}%`);
  }

  console.log("\n[4/6] Risk leaderboard...");
  const risk = await bridge.getRiskLeaderboard();
  if (!risk.error) {
    console.log(`  ✓ Total scored: ${risk.total_entities_scored} | Critical: ${risk.critical_count} | High: ${risk.high_count}`);
  }

  console.log("\n[5/6] Anomalies...");
  const anomalies = await bridge.getAnomalies();
  if (!anomalies.error) {
    console.log(`  ✓ ${Array.isArray(anomalies) ? anomalies.length : 0} anomalies detected`);
  }

  console.log("\n[6/6] Run Python AI operator tick...");
  const tick = await bridge.runPythonOperatorTick();
  if (!tick.error) {
    console.log(`  ✓ Tick ${tick.tick_id} done in ${tick.duration_ms}ms | decisions: ${tick.decisions_made}`);
  }

  // Run a Nexus cycle — the palantir_sync module will pull everything again
  console.log("\n[Nexus cycle with bridge module]");
  await engine.runCycle();

  console.log("\nBridge sync status:", engine.state.get("modules.palantir_sync.status"));
  console.log("Last Palantir snapshot:", engine.state.get("modules.palantir_sync.last_snapshot"));

  engine.isRunning = false;
}

main().catch(console.error);
