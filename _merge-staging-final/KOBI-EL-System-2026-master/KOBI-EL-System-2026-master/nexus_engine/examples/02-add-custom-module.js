// Example 2: add a custom module — tracks a specific KPI and fires alerts
//
// Run: node examples/02-add-custom-module.js

const { NexusEngine } = require("../nexus-engine.js");

// Custom module: tracks "daily_revenue_ils" and alerts if it drops > 20%
const RevenueWatchdog = {
  name: "revenue_watchdog",
  description: "Watches daily revenue and raises alerts on drops > 20%",
  async run(state, brain, alerts) {
    const history = state.get("modules.revenue_watchdog.history") || [];
    // Stub: use a random-ish value for the demo
    const today = Math.round(12000 + Math.random() * 6000);
    history.push({ date: new Date().toISOString(), value: today });
    if (history.length > 30) history.shift();

    if (history.length >= 2) {
      const prev = history[history.length - 2].value;
      const dropPct = ((prev - today) / prev) * 100;
      if (dropPct > 20) {
        alerts.addAlert(
          "warning",
          "Revenue drop detected",
          `Daily revenue dropped ${dropPct.toFixed(1)}% from ${prev} to ${today} ILS`,
          { prev, today, dropPct }
        );
      } else if (dropPct < -20) {
        alerts.addAlert(
          "success",
          "Revenue spike detected",
          `Daily revenue up ${(-dropPct).toFixed(1)}% from ${prev} to ${today} ILS`,
          { prev, today }
        );
      }
    }

    state.update("modules.revenue_watchdog.history", history);
    state.update("modules.revenue_watchdog.latest", today);
  },
};

async function main() {
  const engine = new NexusEngine();
  await engine.init();

  // Register the custom module
  engine.modules.register("revenue_watchdog", RevenueWatchdog);

  // Run 3 cycles manually to show it working
  for (let i = 0; i < 3; i++) {
    await engine.runCycle();
  }

  console.log("\nRevenue history:", engine.state.get("modules.revenue_watchdog.history"));
  console.log("Alerts raised:", engine.alerts.alerts.length);

  engine.isRunning = false;
}

main().catch(console.error);
