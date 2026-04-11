// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — MAIN ENTRY POINT
// Wires the 4 parts together and exposes them as a single public API.
// ════════════════════════════════════════════════════════════════════════════════
//
// Structure:
//   paradigm-part1.js   ← CONFIG · Brain · Memory · ERPModule · CRMModule · utilities
//   paradigm-part2.js   ← BOMModule · HRModule · FinanceModule · OpsModule
//   paradigm-part3.js   ← PricingModule · QualityModule · NotificationModule · AnalyticsModule
//                         Swarm · Adversarial · Dream · MetaLearner · Goals
//   paradigm-part4.js   ← ParadigmEngine (7-phase orchestrator)
//   paradigm-part5.js   ← GrowthEngine · CompetitiveIntel · IntegrationsHub · InternationalRealEstate
//   paradigm-part6.js   ← SupplyChainAI · TemporalIntelligence · DocumentAI · DashboardServer
//   paradigm-part7.js   ← AutomationEngine · SmartScheduler · SLAMonitor · CrossSellEngine · WarrantyProactive
//   paradigm-part8.js   ← FleetGPS · PhotoAI · KnowledgeBaseAI · PredictiveMaintenance · EmployeeWellness
//   paradigm-part9.js   ← ProfitabilityEngine · CashCollectionPredictor · MultiCurrency · WhatIfSimulator
//                         SupplierNegotiationAI · ComplianceModule
//   paradigm-part10.js  ← DocumentGenerator · LegalDocAI · VoiceAI · ConversationMemory
//                         SocialMediaAutopilot · ReferralProgram · CustomerPortal
//
// Usage:
//   node paradigm-engine.js                                          # run the full autonomous loop
//   node -e "require('./paradigm-engine.js').ParadigmEngine"         # programmatic access
//   npm test                                                         # smoke test in stub mode
//   PARADIGM_DASHBOARD_PORT=7400 node paradigm-engine.js             # custom dashboard port
// ════════════════════════════════════════════════════════════════════════════════

const part1 = require("./paradigm-part1");
const part2 = require("./paradigm-part2");
const part3 = require("./paradigm-part3");
const part4 = require("./paradigm-part4");
const part5 = require("./paradigm-part5");
const part6 = require("./paradigm-part6");
const part7 = require("./paradigm-part7");
const part8 = require("./paradigm-part8");
const part9 = require("./paradigm-part9");
const part10 = require("./paradigm-part10");

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
  QualityModule: part3.QualityModule,
  NotificationModule: part3.NotificationModule,
  AnalyticsModule: part3.AnalyticsModule,

  // ── Cognitive layer (Part 3) ──
  Swarm: part3.Swarm,
  Adversarial: part3.Adversarial,
  Dream: part3.Dream,
  MetaLearner: part3.MetaLearner,
  Goals: part3.Goals,

  // ── Orchestrator (Part 4) ──
  ParadigmEngine: part4.ParadigmEngine,

  // ── Mega Expansion (Part 5) ──
  GrowthEngine: part5.GrowthEngine,
  CompetitiveIntel: part5.CompetitiveIntel,
  IntegrationsHub: part5.IntegrationsHub,
  InternationalRealEstate: part5.InternationalRealEstate,

  // ── Mega Expansion (Part 6) ──
  SupplyChainAI: part6.SupplyChainAI,
  TemporalIntelligence: part6.TemporalIntelligence,
  DocumentAI: part6.DocumentAI,
  DashboardServer: part6.DashboardServer,

  // ── Automation Workflows (Part 7) ──
  AutomationEngine: part7.AutomationEngine,
  SmartScheduler: part7.SmartScheduler,
  SLAMonitor: part7.SLAMonitor,
  CrossSellEngine: part7.CrossSellEngine,
  WarrantyProactive: part7.WarrantyProactive,

  // ── Field Intelligence (Part 8) ──
  FleetGPS: part8.FleetGPS,
  PhotoAI: part8.PhotoAI,
  KnowledgeBaseAI: part8.KnowledgeBaseAI,
  PredictiveMaintenance: part8.PredictiveMaintenance,
  EmployeeWellness: part8.EmployeeWellness,

  // ── Financial Strategic (Part 9) ──
  ProfitabilityEngine: part9.ProfitabilityEngine,
  CashCollectionPredictor: part9.CashCollectionPredictor,
  MultiCurrency: part9.MultiCurrency,
  WhatIfSimulator: part9.WhatIfSimulator,
  SupplierNegotiationAI: part9.SupplierNegotiationAI,
  ComplianceModule: part9.ComplianceModule,

  // ── Communication & Content (Part 10) ──
  DocumentGenerator: part10.DocumentGenerator,
  LegalDocAI: part10.LegalDocAI,
  VoiceAI: part10.VoiceAI,
  ConversationMemory: part10.ConversationMemory,
  SocialMediaAutopilot: part10.SocialMediaAutopilot,
  ReferralProgram: part10.ReferralProgram,
  CustomerPortal: part10.CustomerPortal,

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
