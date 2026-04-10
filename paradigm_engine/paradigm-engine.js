// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — MAIN ENTRY POINT
// Wires the 4 parts together and exposes them as a single public API.
// ════════════════════════════════════════════════════════════════════════════════
//
// Structure:
//   paradigm-part1.js  ← CONFIG · Brain · Memory · ERPModule · CRMModule · utilities
//   paradigm-part2.js  ← BOMModule · HRModule · FinanceModule · OpsModule
//   paradigm-part3.js  ← PricingModule · MarketingModule · QualityModule · NotificationModule · AnalyticsModule
//   paradigm-part4.js  ← SwarmCouncil · AdversarialEngine · DreamEngine · MetaLearner · GoalManager · ParadigmEngine
//
// Usage:
//   node paradigm-engine.js                                          # run the full autonomous loop
//   node -e "require('./paradigm-engine.js').ParadigmEngine"         # programmatic access
//   npm test                                                         # 131-assertion smoke test in stub mode
// ════════════════════════════════════════════════════════════════════════════════

const part1 = require("./paradigm-part1");
const part2 = require("./paradigm-part2");
const part3 = require("./paradigm-part3");
const part4 = require("./paradigm-part4");

module.exports = {
  // ── Core (Part 1) ──
  CONFIG: part1.CONFIG,
  MASTER_SYSTEM_PROMPT: part1.MASTER_SYSTEM_PROMPT,
  Brain: part1.Brain,
  Memory: part1.Memory,
  ERPModule: part1.ERPModule,
  CRMModule: part1.CRMModule,
  cli: part1.cli,

  // ── Business modules (Parts 2 + 3) ──
  BOMModule: part2.BOMModule,
  HRModule: part2.HRModule,
  FinanceModule: part2.FinanceModule,
  OpsModule: part2.OpsModule,
  PricingModule: part3.PricingModule,
  MarketingModule: part3.MarketingModule,
  QualityModule: part3.QualityModule,
  NotificationModule: part3.NotificationModule,
  AnalyticsModule: part3.AnalyticsModule,

  // ── Cognitive layer (Part 4) ──
  AGENT_ROLES: part4.AGENT_ROLES,
  SwarmCouncil: part4.SwarmCouncil,
  AdversarialEngine: part4.AdversarialEngine,
  DreamEngine: part4.DreamEngine,
  MetaLearner: part4.MetaLearner,
  GoalManager: part4.GoalManager,
  ParadigmEngine: part4.ParadigmEngine,

  // ── Utilities (Part 1) ──
  uid: part1.uid,
  now: part1.now,
  today: part1.today,
  ensure: part1.ensure,
  save: part1.save,
  load: part1.load,
  agorot: part1.agorot,
  shekel: part1.shekel,
  addVat: part1.addVat,
  vatOf: part1.vatOf,
  clamp: part1.clamp,
  daysAgo: part1.daysAgo,
  log: part1.log,
};

// ════════════════════════════════════════════════════════════════
// Run if called directly
// ════════════════════════════════════════════════════════════════

if (require.main === module) {
  const engine = new part4.ParadigmEngine();
  engine.start().catch(err => {
    console.error("\x1b[31mFATAL:\x1b[0m", err);
    process.exit(1);
  });
}
