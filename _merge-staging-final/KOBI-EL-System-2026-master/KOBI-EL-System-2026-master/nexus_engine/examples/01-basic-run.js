// Example 1: basic NEXUS run — just start the engine
//
// Run: node examples/01-basic-run.js

const { NexusEngine } = require("../nexus-engine.js");

async function main() {
  const engine = new NexusEngine();
  await engine.init();

  // Run one cycle manually
  await engine.runCycle();

  // Show what we learned
  console.log("\nSTATE:");
  console.log("  totalCycles:", engine.state.get("totalCycles"));
  console.log("  totalDecisions:", engine.state.get("totalDecisions"));
  console.log("  totalImprovements:", engine.state.get("totalImprovements"));
  console.log("  modulesRegistered:", engine.modules.modules.size);
  console.log("  goalsActive:", engine.goals.goals.filter(g => g.status === "active").length);

  // Don't call shutdown (it calls process.exit) — just stop the interval
  engine.isRunning = false;
}

main().catch(console.error);
