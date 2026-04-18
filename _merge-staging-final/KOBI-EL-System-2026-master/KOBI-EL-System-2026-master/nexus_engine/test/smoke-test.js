// ══════════════════════════════════════════════════════════════════
// SMOKE TEST — בדיקה מהירה שהמנוע עולה + פועל ב-stub mode
// ══════════════════════════════════════════════════════════════════
//
// Runs in stub mode (no ANTHROPIC_API_KEY required) and verifies:
//   1. StateManager loads + saves + get with dot-notation
//   2. Logger writes without crashing
//   3. AIBrain.think() returns a stub response
//   4. AIBrain.makeDecision() returns a parsed JSON object
//   5. GoalManager loads default goals + updates milestones
//   6. AlertSystem.addAlert() stores alerts correctly
//   7. ModuleManager.runAll() runs built-in modules
//   8. NexusEngine.init() + one runCycle() complete without error
//   9. extractJSON() handles mixed-content responses
//
// Run: node test/smoke-test.js
// Exit code: 0 = all passed, 1 = any failure

const path = require("path");

// Ensure we're running without a real API key so stub mode kicks in
delete process.env.ANTHROPIC_API_KEY;
process.env.NEXUS_DATA_DIR = path.join(__dirname, "..", "nexus-data-test");
process.env.NEXUS_CYCLE_MS = "5000";

const {
  NexusEngine,
  StateManager,
  AIBrain,
  GoalManager,
  AlertSystem,
  ModuleManager,
  Logger,
  extractJSON,
} = require("../nexus-engine.js");

// Simple assert helper
let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? " — " + detail : ""}`);
  }
}

async function runTests() {
  console.log("\n[SMOKE TEST] NEXUS Engine v1.0\n");

  // ─── Test 1: StateManager ─────────────────────────────────
  console.log("Test 1: StateManager");
  const state = new StateManager();
  assert("load() returns object", typeof state.state === "object");
  assert("initial totalCycles is 0", state.state.totalCycles === 0);

  state.update("totalCycles", 5);
  assert("update() writes value", state.get("totalCycles") === 5);

  state.update("nested.deep.value", "hello");
  assert("update() with dot notation creates nested", state.get("nested.deep.value") === "hello");

  // Critical bug fix verification — falsy values
  state.update("zero_value", 0);
  state.update("false_value", false);
  state.update("empty_string", "");
  assert("get() handles 0 correctly", state.get("zero_value") === 0);
  assert("get() handles false correctly", state.get("false_value") === false);
  assert("get() handles empty string correctly", state.get("empty_string") === "");

  state.addMemory("shortTerm", { type: "test", data: "smoke" });
  assert("addMemory() works",
    (state.get("memory.shortTerm") || []).length > 0);

  // ─── Test 2: Logger ───────────────────────────────────────
  console.log("\nTest 2: Logger");
  const entry = Logger.info("TEST", "smoke test message", { key: "value" });
  assert("Logger.info returns entry", entry && entry.level === "INFO");
  Logger.warn("TEST", "warning message");
  Logger.error("TEST", "error message (expected)");
  Logger.success("TEST", "success message");
  Logger.ai("TEST", "ai message");
  Logger.decision("TEST", "decision message");
  assert("All log levels work without crashing", true);

  // ─── Test 3: extractJSON() ───────────────────────────────
  console.log("\nTest 3: extractJSON (JSON-from-mixed-content)");
  assert('direct JSON', extractJSON('{"a":1}')?.a === 1);
  assert('markdown-fenced JSON', extractJSON('```json\n{"a":2}\n```')?.a === 2);
  assert('JSON with prose before', extractJSON('Sure, here is the JSON: {"a":3}')?.a === 3);
  assert('JSON with prose after', extractJSON('{"a":4}\n\nHope this helps!')?.a === 4);
  assert('JSON in fence without json tag', extractJSON('```\n{"a":5}\n```')?.a === 5);
  assert('array format', extractJSON('[1,2,3]').length === 3);
  assert('null for invalid', extractJSON("not json here") === null);

  // ─── Test 4: AIBrain stub mode ───────────────────────────
  console.log("\nTest 4: AIBrain (stub mode)");
  const brain = new AIBrain(state);
  const thought = await brain.think("What should we do?");
  assert("think() returns a string in stub mode", typeof thought === "string" && thought.length > 0);

  const decision = await brain.makeDecision(
    { situation: "test" },
    ["option_a", "option_b"],
  );
  assert("makeDecision returns object with decision", decision && typeof decision.decision === "string");
  assert("makeDecision has confidence", decision && typeof decision.confidence === "number");

  const analysis = await brain.analyze({ data: "test" }, "analyze this");
  assert("analyze returns object with findings", analysis && Array.isArray(analysis.findings));

  // ─── Test 5: GoalManager ─────────────────────────────────
  console.log("\nTest 5: GoalManager");
  const goals = new GoalManager(state, brain);
  assert("loaded default goals", goals.goals.length >= 4);
  assert("goals have id + title + target", goals.goals.every(g => g.id && g.title && g.target));

  // Update a goal and check milestone
  goals.updateGoal("g1", 30);
  const g1 = goals.goals.find(g => g.id === "g1");
  assert("milestone at 25 reached after updating to 30",
    g1.milestones.find(m => m.target === 25)?.reached === true);

  // ─── Test 6: AlertSystem ─────────────────────────────────
  console.log("\nTest 6: AlertSystem");
  const alerts = new AlertSystem(state);
  alerts.addAlert("info", "Test alert", "This is a test");
  alerts.addAlert("critical", "Critical test", "Critical test");
  assert("addAlert stored", alerts.alerts.length === 2);
  assert("getUnacknowledged returns 2", alerts.getUnacknowledged().length === 2);

  // ─── Test 7: ModuleManager ───────────────────────────────
  console.log("\nTest 7: ModuleManager");
  const modules = new ModuleManager(state, brain, alerts);
  let ran = false;
  modules.register("test_module", { run: async () => { ran = true; } });
  await modules.runAll();
  assert("registered module ran", ran === true);

  // ─── Test 8: Full NexusEngine cycle ──────────────────────
  console.log("\nTest 8: NexusEngine init + cycle");
  const engine = new NexusEngine();
  await engine.init();
  assert("engine.isRunning after init", engine.isRunning === true);
  assert("engine has 4+ built-in modules", engine.modules.modules.size >= 4);

  await engine.runCycle();
  assert("runCycle completed",
    (engine.state.get("totalCycles") || 0) > 0);
  assert("runCycle set lastCycleAt",
    engine.state.get("lastCycleAt") !== null);

  // Stop engine without calling process.exit
  engine.isRunning = false;
  if (engine.interval) clearInterval(engine.interval);

  // ─── Summary ─────────────────────────────────────────────
  console.log(`\n[SMOKE TEST] Results: \x1b[32m${passed} passed\x1b[0m, ${failed > 0 ? '\x1b[31m' : ''}${failed} failed\x1b[0m`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ": " + f.detail : ""}`));
    process.exit(1);
  }

  // Cleanup test data dir
  try {
    const fs = require("fs");
    const dir = process.env.NEXUS_DATA_DIR;
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {}

  console.log("\n\x1b[32mALL SMOKE TESTS PASSED\x1b[0m\n");
  process.exit(0);
}

runTests().catch(err => {
  console.error("\x1b[31mSMOKE TEST CRASHED:\x1b[0m", err);
  process.exit(2);
});
