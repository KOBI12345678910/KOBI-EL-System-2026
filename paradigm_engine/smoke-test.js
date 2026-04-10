// ════════════════════════════════════════════════════════════════
// PARADIGM v4.0 — Smoke Test (no API calls, no external deps)
// ════════════════════════════════════════════════════════════════

// Clean slate: wipe paradigm-data so the test starts fresh every run
const fsNode = require("fs");
const pathNode = require("path");
const dataDir = pathNode.resolve(__dirname, "paradigm-data");
try {
  if (fsNode.existsSync(dataDir)) fsNode.rmSync(dataDir, { recursive: true, force: true });
} catch {}

// Stub @anthropic-ai/sdk so the engine loads without the real package
const Module = require("module");
const origResolve = Module._resolveFilename;
const stubPath = pathNode.resolve(__dirname, "_stub_anthropic.js");

fsNode.writeFileSync(stubPath, `
class Anthropic {
  constructor(opts) { this.opts = opts || {}; this.messages = { create: async () => ({ content: [{ text: '{"status":"healthy","score":85,"summary":"stub"}' }], usage: { input_tokens: 0, output_tokens: 0 } }) }; }
}
module.exports = Anthropic;
module.exports.default = Anthropic;
`);

Module._resolveFilename = function (req, ...args) {
  if (req === "@anthropic-ai/sdk") return stubPath;
  return origResolve.call(this, req, ...args);
};

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${name}`); passed++; }
  else { console.log(`  \x1b[31m✗\x1b[0m ${name} ${extra}`); failed++; }
}
function group(title, fn) {
  console.log(`\n\x1b[36m${title}\x1b[0m`);
  try { fn(); } catch (e) { console.log(`  \x1b[31m✗ CRASH:\x1b[0m ${e.message}\n${e.stack}`); failed++; }
}

const P = require("./paradigm-engine.js");

group("1. Module exports — public API", () => {
  check("CONFIG exists", !!P.CONFIG);
  check("MASTER_SYSTEM_PROMPT", typeof P.MASTER_SYSTEM_PROMPT === "string");
  check("Brain class", typeof P.Brain === "function");
  check("Memory class", typeof P.Memory === "function");
  check("ERPModule (part 1)", typeof P.ERPModule === "function");
  check("CRMModule (part 1)", typeof P.CRMModule === "function");
  check("BOMModule (part 2)", typeof P.BOMModule === "function");
  check("HRModule (part 2)", typeof P.HRModule === "function");
  check("FinanceModule (part 2)", typeof P.FinanceModule === "function");
  check("OpsModule (part 2)", typeof P.OpsModule === "function");
  check("PricingModule (part 3)", typeof P.PricingModule === "function");
  check("MarketingModule (part 3)", typeof P.MarketingModule === "function");
  check("QualityModule (part 3)", typeof P.QualityModule === "function");
  check("NotificationModule (part 3)", typeof P.NotificationModule === "function");
  check("AnalyticsModule (part 3)", typeof P.AnalyticsModule === "function");
  check("AGENT_ROLES (part 4)", typeof P.AGENT_ROLES === "object" && Object.keys(P.AGENT_ROLES).length === 7);
  check("SwarmCouncil (part 4)", typeof P.SwarmCouncil === "function");
  check("AdversarialEngine (part 4)", typeof P.AdversarialEngine === "function");
  check("DreamEngine (part 4)", typeof P.DreamEngine === "function");
  check("MetaLearner (part 4)", typeof P.MetaLearner === "function");
  check("GoalManager (part 4)", typeof P.GoalManager === "function");
  check("ParadigmEngine (part 4)", typeof P.ParadigmEngine === "function");
});

group("2. Utilities (currency + math)", () => {
  check("agorot(100.50) = 10050", P.agorot(100.50) === 10050);
  check("shekel(10050) = '100.50'", P.shekel(10050) === "100.50");
  check("addVat(10000) = 11800", P.addVat(10000) === 11800);
  check("vatOf(10000) = 1800", P.vatOf(10000) === 1800);
  check("clamp(50, 0, 100) = 50", P.clamp(50, 0, 100) === 50);
  check("clamp(150, 0, 100) = 100", P.clamp(150, 0, 100) === 100);
  check("clamp(-10, 0, 100) = 0", P.clamp(-10, 0, 100) === 0);
  check("uid() returns string", typeof P.uid() === "string");
  check("now() returns ISO", typeof P.now() === "string" && P.now().includes("T"));
  check("today() is YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(P.today()));
});

group("3. CONFIG integrity", () => {
  check("techno name", P.CONFIG.BUSINESS.techno.name === "טכנו כל עוזי בע\"מ");
  check("techno employees = 30", P.CONFIG.BUSINESS.techno.employees === 30);
  check("techno has 14 products", P.CONFIG.BUSINESS.techno.products.length === 14);
  check("techno has 5 departments", P.CONFIG.BUSINESS.techno.departments.length === 5);
  check("techno CEO = קובי", P.CONFIG.BUSINESS.techno.keyPeople.ceo.name === "קובי");
  check("techno ops = דימה", P.CONFIG.BUSINESS.techno.keyPeople.ops.name === "דימה");
  check("techno field = עוזי", P.CONFIG.BUSINESS.techno.keyPeople.field.name === "עוזי");
  check("techno HR = קורין", P.CONFIG.BUSINESS.techno.keyPeople.hr.name === "קורין");
  check("realestate markets = 3", P.CONFIG.BUSINESS.realestate.markets.length === 3);
  check("realestate properties = 4", P.CONFIG.BUSINESS.realestate.properties.length === 4);
  check("CYCLE_MS = 60000", P.CONFIG.CYCLE_MS === 60000);
  check("DEBATE_ROUNDS = 3", P.CONFIG.DEBATE_ROUNDS === 3);
});

group("4. Brain + Memory", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  check("Brain.calls = 0", brain.calls === 0);
  check("Brain.getStats returns object", typeof brain.getStats() === "object");
  check("Memory.add works", (() => { memory.add("shortTerm", { test: true }); return memory.count("shortTerm") > 0; })());
  check("Memory.conscious L0", (() => { memory.conscious(0, "test"); return memory.data.consciousness.L0_raw.length > 0; })());
  check("Memory.getSummary", typeof memory.getSummary().counts === "object");
});

group("5. ERPModule — projects + inventory + PO + WO", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const erp = new P.ERPModule(brain, memory);
  const proj = erp.createProject({ name: "Test", customerName: "Kobi", type: "railing_iron", city: "תל אביב" });
  check("createProject", proj && proj.id.startsWith("PRJ-"));
  check("project.status = new", proj.status === "new");
  const moved = erp.moveProjectStatus(proj.id, "measuring");
  check("valid transition new→measuring", moved && moved.status === "measuring");
  const invalid = erp.moveProjectStatus(proj.id, "completed");
  check("invalid transition blocked", invalid === null);
  const item = erp.addInventoryItem({ name: "ברזל 40x40", qty: 100, minQty: 20, costPerUnit: P.agorot(32) });
  check("addInventoryItem", item && item.qty === 100);
  const stocked = erp.updateStock(item.id, -10, "test");
  check("updateStock", stocked && stocked.qty === 90);
  const reserved = erp.reserveStock(item.id, 5, proj.id);
  check("reserveStock", reserved && reserved.reservedQty === 5);
  check("availableQty = qty - reserved", reserved.availableQty === 85);
  const supplier = erp.addSupplier({ name: "Test Supplier", categories: ["ברזל"] });
  check("addSupplier", supplier && supplier.id);
  const po = erp.createPO({ supplierName: "Test Supplier", items: [{ name: "Iron", qty: 50, unitPrice: P.agorot(30) }] });
  check("createPO with VAT total", po && po.total === P.addVat(P.agorot(30) * 50));
  const wo = erp.createWorkOrder({ description: "Build railing", estimatedHours: 8 });
  check("createWorkOrder", wo && wo.id.startsWith("WO-"));
});

group("6. CRMModule — leads + pipeline + deals", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const crm = new P.CRMModule(brain, memory);
  const lead = crm.addLead({ name: "Test Customer", source: "Google Ads Search", projectType: "railing_iron", city: "תל אביב", estimatedValue: P.agorot(18000) });
  check("addLead", lead && lead.id.startsWith("LEAD-"));
  check("initial score = 50", lead.score === 50);
  check("pipeline.new +1", crm.data.pipeline.new.length === 1);
  const moved = crm.moveLead(lead.id, "contacted");
  check("moveLead", moved && moved.status === "contacted");
  check("pipeline.new empty", crm.data.pipeline.new.length === 0);
  check("pipeline.contacted has 1", crm.data.pipeline.contacted.length === 1);
  const interaction = crm.addInteraction(lead.id, { type: "call", result: "answered", sentiment: "positive" });
  check("addInteraction", interaction && interaction.id);
  const deal = crm.createDeal(lead.id, { amount: P.agorot(20000), description: "Railing + gate" });
  check("createDeal", deal && deal.id.startsWith("DEAL-"));
  check("pipeline summary", typeof crm.getPipelineSummary() === "object");
});

group("7. BOMModule — 11 templates + generateBOM", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const bom = new P.BOMModule(brain, memory);
  check("has 11 default templates", bom.data.templates.length === 11);
  check("railing_iron template", !!bom.getTemplateByType("railing_iron"));
  check("railing_aluminum template", !!bom.getTemplateByType("railing_aluminum"));
  check("railing_glass template", !!bom.getTemplateByType("railing_glass"));
  check("gate_electric_sliding template", !!bom.getTemplateByType("gate_electric_sliding"));
  check("gate_entry template", !!bom.getTemplateByType("gate_entry"));
  check("fence_iron template", !!bom.getTemplateByType("fence_iron"));
  check("fence_decorative template", !!bom.getTemplateByType("fence_decorative"));
  check("pergola_aluminum template", !!bom.getTemplateByType("pergola_aluminum"));
  check("door_iron template", !!bom.getTemplateByType("door_iron"));
  check("window_aluminum template", !!bom.getTemplateByType("window_aluminum"));
  check("bars template", !!bom.getTemplateByType("bars"));
  const tmpl = bom.getTemplateByType("railing_iron");
  const b = bom.generateBOM(tmpl.id, 10);
  check("generateBOM returns object", b && b.id.startsWith("BOM-"));
  check("BOM has items with cost", b.items.every(i => typeof i.totalCost === "number"));
  check("BOM materialCost > 0", b.materialCost > 0);
  check("BOM laborCost > 0", b.laborCost > 0);
  check("BOM totalCost = mat + labor + overhead", b.totalCost === b.materialCost + b.laborCost + b.overheadCost);
  check("BOM sellingPrice > totalCost", b.sellingPrice > b.totalCost);
  check("BOM totalWithVat = addVat(sellingPrice)", b.totalWithVat === P.addVat(b.sellingPrice));
  check("BOM pricePerMeter calculated", b.pricePerMeter > 0);
});

group("8. HRModule — employees + attendance + leaves + recruitment", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const hr = new P.HRModule(brain, memory);
  const emp = hr.addEmployee({ name: "Test Worker", role: "welder", department: "ייצור", baseSalary: P.agorot(8500) });
  check("addEmployee", emp && emp.id.startsWith("EMP-"));
  check("employee is active", emp.status === "active");
  check("leaveBalance initialized", emp.leaveBalance.annual === 12);
  const att = hr.recordAttendance(emp.id, "arrived");
  check("recordAttendance", att && att.empId === emp.id);
  const leave = hr.requestLeave(emp.id, { leaveType: "annual", startDate: "2026-04-20", endDate: "2026-04-22", reason: "family" });
  check("requestLeave", leave && leave.status === "pending" && leave.days === 3);
  const approved = hr.approveLeave(leave.id);
  check("approveLeave", approved && approved.status === "approved");
  check("annual leave deducted", hr.data.employees[0].leaveBalance.annual === 9);
  const pos = hr.openPosition({ title: "רתך בכיר", department: "ייצור", urgency: "high" });
  check("openPosition", pos && pos.id && pos.status === "open");
  const cand = hr.addCandidate(pos.id, { name: "מועמד", source: "referral" });
  check("addCandidate", cand && cand.id);
  check("candidate linked to position", hr.data.recruitment.openPositions[0].candidates.length === 1);
  const review = hr.recordPerformance(emp.id, { quality: 5, speed: 4, teamwork: 5, attendance: 5, initiative: 4, safety: 5 });
  check("recordPerformance", review && review.empId === emp.id);
  const warn = hr.issueWarning(emp.id, { type: "verbal", reason: "test" });
  check("issueWarning", warn && warn.type === "verbal");
  const headcount = hr.getHeadcount();
  check("getHeadcount", headcount.total === 1);
  check("getActiveEmployees", hr.getActiveEmployees().length === 1);
});

group("9. FinanceModule — invoices + transactions + P&L", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const fin = new P.FinanceModule(brain, memory);
  const inv = fin.createInvoice({
    customerName: "Test Client",
    items: [{ description: "Railing 10m", qty: 10, unitPrice: P.agorot(620) }],
  });
  check("createInvoice", inv && inv.number);
  check("invoice subtotal = qty*price", inv.subtotal === P.agorot(620) * 10);
  check("invoice VAT correct", inv.vat === P.vatOf(inv.afterDiscount));
  check("invoice total = afterDiscount + VAT", inv.total === inv.afterDiscount + inv.vat);
  check("AR entry created", fin.data.accounts.receivable.length === 1);
  check("invoice due date set", !!inv.dueDate);
  const sent = fin.sendInvoice(inv.id);
  check("sendInvoice", sent && sent.status === "sent");
  const paid = fin.markInvoicePaid(inv.id, { method: "transfer" });
  check("markInvoicePaid", paid && paid.status === "paid");
  check("cashflow.in > 0", fin.data.cashflow.in > 0);
  check("AR cleared after payment", fin.data.accounts.receivable.length === 0);
  const exp = fin.addExpense({ category: "materials", description: "Iron bars", amount: P.agorot(5000), vendor: "Supplier X" });
  check("addExpense", exp && exp.id.startsWith("EXP-"));
  check("expense transaction recorded", fin.data.transactions.some(t => t.type === "expense"));
  check("cashflow.out > 0", fin.data.cashflow.out > 0);
  const check1 = fin.addCheck({ type: "received", number: "12345", amount: P.agorot(10000), payer: "לקוח" });
  check("addCheck", check1 && check1.id);
  const pnl = fin.getMonthlyPnL();
  check("getMonthlyPnL returns object", pnl && typeof pnl.income === "number");
  const ytd = fin.getYTDSummary();
  check("getYTDSummary", ytd && ytd.year);
  check("getOverdueInvoices returns array", Array.isArray(fin.getOverdueInvoices()));
});

group("10. OpsModule — measurements + installations + vehicles", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const ops = new P.OpsModule(brain, memory);
  check("serviceAreas has 15 cities", ops.data.serviceAreas.length === 15);
  const m = ops.scheduleMeasurement({ customerName: "Test", address: "Dizengoff 1", city: "תל אביב", date: "2026-04-11", time: "10:00" });
  check("scheduleMeasurement", m && m.id.startsWith("MEAS-"));
  check("schedule has entry", ops.data.schedule.length === 1);
  const done = ops.completeMeasurement(m.id, { measurements: { totalLength: 12 } });
  check("completeMeasurement", done && done.status === "completed");
  const inst = ops.scheduleInstallation({ customerName: "Test", address: "Rothschild 5", city: "תל אביב", date: "2026-04-15", team: ["עובד 1", "עובד 2"] });
  check("scheduleInstallation", inst && inst.id.startsWith("INST-"));
  const started = ops.startInstallation(inst.id);
  check("startInstallation", started && started.status === "in_progress");
  const finished = ops.completeInstallation(inst.id, { customerSignature: "ok" });
  check("completeInstallation", finished && finished.status === "completed");
  const v = ops.addVehicle({ plateNumber: "12-345-67", type: "van" });
  check("addVehicle", v && v.plateNumber === "12-345-67");
  const inc = ops.reportIncident({ type: "safety", severity: "low", description: "near miss" });
  check("reportIncident", inc && inc.id.startsWith("INC-"));
  check("getPendingMeasurements", Array.isArray(ops.getPendingMeasurements()));
  check("getPendingInstallations", Array.isArray(ops.getPendingInstallations()));
  check("getOpenIncidents has 1", ops.getOpenIncidents().length === 1);
  const sched = ops.getScheduleForDate("2026-04-11");
  check("getScheduleForDate", Array.isArray(sched));
  const week = ops.getScheduleForWeek("2026-04-10");
  check("getScheduleForWeek skips Saturday", week.every(d => new Date(d.date).getDay() !== 6));
});

group("11. PricingModule — quotes + discounts + win tracking", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const pr = new P.PricingModule(brain, memory);
  check("discount policy maxDiscount = 12", pr.data.discountPolicy.maxDiscountPercent === 12);
  check("volume discount tiers = 4", pr.data.discountPolicy.volumeDiscounts.length === 4);
  check("competitorIntel has 4 competitors", Object.keys(pr.data.competitorIntel).length === 4);
  check("initial winHistory = 0/0/0", pr.data.winHistory.total === 0);
  check("winRate N/A when empty", pr.getWinRate() === "N/A");
});

group("12. MarketingModule — campaigns + channels", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const mk = new P.MarketingModule(brain, memory);
  check("7 channels configured", Object.keys(mk.data.channels).length === 7);
  check("google_ads enabled", mk.data.channels.google_ads.enabled === true);
  check("tiktok disabled by default", mk.data.channels.tiktok.enabled === false);
  const c = mk.createCampaign({ name: "Spring Sale", channel: "google_ads", budget: P.agorot(5000) });
  check("createCampaign", c && c.id.startsWith("CMP-"));
  const spent = mk.recordAdSpend(c.id, P.agorot(100), { impressions: 1000, clicks: 50, leads: 5 });
  check("recordAdSpend", spent && spent.spent === P.agorot(100));
  check("results.clicks updated", spent.results.clicks === 50);
  check("cpl calculated", spent.results.cpl > 0);
});

group("13. QualityModule — inspections + defects + warranties", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const q = new P.QualityModule(brain, memory);
  check("has 10 standards", Object.keys(q.data.standards).length === 10);
  const insp = q.createInspection({ projectId: "PRJ-test", stage: "pre_delivery", inspector: "Test" });
  check("createInspection", insp && insp.id.startsWith("QC-"));
  const completed = q.completeInspection(insp.id, { result: "pass" });
  check("completeInspection", completed && completed.status === "completed");
  const def = q.reportDefect({ projectId: "PRJ-test", type: "cosmetic", severity: "minor", description: "scratch" });
  check("reportDefect", def && def.id.startsWith("DEF-"));
  const resolved = q.resolveDefect(def.id, { notes: "fixed", actualCost: P.agorot(50) });
  check("resolveDefect", resolved && resolved.status === "resolved");
  const w = q.createWarranty({ customerName: "Test", projectType: "railing_iron" });
  check("createWarranty", w && w.id.startsWith("WAR-"));
  check("warranty 10 years default", w.durationYears === 10);
  const claim = q.fileWarrantyClaim(w.id, { description: "rust" });
  check("fileWarrantyClaim", claim && claim.id.startsWith("CLM-"));
  const cmp = q.recordComplaint({ customerName: "Test", category: "quality", description: "delay" });
  check("recordComplaint", cmp && cmp.id.startsWith("CMP-"));
  const kpis = q.calculateKPIs();
  check("calculateKPIs", typeof kpis === "object" && typeof kpis.defectRate === "number");
});

group("14. NotificationModule — templates + queue", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const n = new P.NotificationModule(brain, memory);
  check("has 9 templates", Object.keys(n.data.templates).length === 9);
  check("4 channels", Object.keys(n.data.channels).length === 4);
  const rendered = n.render("quote_sent", { name: "דוד", number: "2026-Q0001", total: "12,345", validUntil: "2026-05-01" });
  check("render substitutes vars", rendered && rendered.includes("דוד") && rendered.includes("12,345"));
  const q = n.enqueue({ channel: "whatsapp", to: "050-1234567", toName: "Test", template: "lead_new", vars: { name: "Test" } });
  check("enqueue", q && q.id.startsWith("NOT-"));
  check("queue has message", n.data.queue.length === 1);
  n.resetDailyCounters();
  check("resetDailyCounters", n.data.channels.whatsapp.sent === 0);
});

group("15. AnalyticsModule — snapshots across all modules", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const mods = {
    erp: new P.ERPModule(brain, memory),
    crm: new P.CRMModule(brain, memory),
    bom: new P.BOMModule(brain, memory),
    hr: new P.HRModule(brain, memory),
    finance: new P.FinanceModule(brain, memory),
    ops: new P.OpsModule(brain, memory),
    pricing: new P.PricingModule(brain, memory),
    marketing: new P.MarketingModule(brain, memory),
    quality: new P.QualityModule(brain, memory),
  };
  const an = new P.AnalyticsModule(brain, memory, mods);
  const snap = an.takeSnapshot();
  check("takeSnapshot", snap && snap.id.startsWith("SNAP-"));
  check("snap has erp section", !!snap.erp);
  check("snap has crm section", !!snap.crm);
  check("snap has bom section", !!snap.bom);
  check("snap has hr section", !!snap.hr);
  check("snap has finance section", !!snap.finance);
  check("snap has ops section", !!snap.ops);
  check("snap has pricing section", !!snap.pricing);
  check("snap has marketing section", !!snap.marketing);
  check("snap has quality section", !!snap.quality);
  check("snapshot persisted", an.data.snapshots.length === 1);
});

group("16. Cognitive layer — Swarm + Adversarial + Dream + Meta", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const swarm = new P.SwarmCouncil(brain, memory);
  const adv = new P.AdversarialEngine(brain, memory);
  const dream = new P.DreamEngine(brain, memory);
  const meta = new P.MetaLearner(brain, memory);
  check("SwarmCouncil instantiable", swarm && typeof swarm.debate === "function");
  check("AdversarialEngine instantiable", adv && typeof adv.attack === "function");
  check("DreamEngine instantiable", dream && typeof dream.dream === "function");
  check("MetaLearner instantiable", meta && typeof meta.reflect === "function");
  check("MetaLearner default LR = 0.15", meta.data.learningRate === 0.15);
  check("AGENT_ROLES has CEO", !!P.AGENT_ROLES.ceo);
  check("AGENT_ROLES has COO", !!P.AGENT_ROLES.coo);
  check("AGENT_ROLES has CFO", !!P.AGENT_ROLES.cfo);
  check("AGENT_ROLES has CMO", !!P.AGENT_ROLES.cmo);
  check("AGENT_ROLES has CTO", !!P.AGENT_ROLES.cto);
  check("AGENT_ROLES has CHRO", !!P.AGENT_ROLES.chro);
  check("AGENT_ROLES has CRO", !!P.AGENT_ROLES.cro);
});

group("17. Goals", () => {
  const memory = new P.Memory();
  const goals = new P.GoalManager(memory);
  check("has 10 default goals", goals.goals.length === 10);
  check("G1 = leads_per_day", goals.goals[0].metric === "leads_per_day");
  check("G2 = monthly_revenue_agorot", goals.goals[1].metric === "monthly_revenue_agorot");
  check("G10 = defect_rate_percent", goals.goals[9].metric === "defect_rate_percent");
  const updated = goals.update("G1", 5);
  check("update goal", updated && updated.current === 5);
  check("progress calculated", updated.progress > 0);
  const status = goals.getStatus();
  check("getStatus returns array of 10", Array.isArray(status) && status.length === 10);
});

group("18. ParadigmEngine — main orchestrator", () => {
  const engine = new P.ParadigmEngine();
  check("engine has brain", engine.brain instanceof P.Brain);
  check("engine has memory", engine.memory instanceof P.Memory);
  check("engine has ERP", engine.erp instanceof P.ERPModule);
  check("engine has CRM", engine.crm instanceof P.CRMModule);
  check("engine has BOM", engine.bom instanceof P.BOMModule);
  check("engine has HR", engine.hr instanceof P.HRModule);
  check("engine has Finance", engine.finance instanceof P.FinanceModule);
  check("engine has Ops", engine.ops instanceof P.OpsModule);
  check("engine has Pricing", engine.pricing instanceof P.PricingModule);
  check("engine has Marketing", engine.marketing instanceof P.MarketingModule);
  check("engine has Quality", engine.quality instanceof P.QualityModule);
  check("engine has Notifications", engine.notify instanceof P.NotificationModule);
  check("engine has Analytics", engine.analytics instanceof P.AnalyticsModule);
  check("engine has Swarm", engine.swarm instanceof P.SwarmCouncil);
  check("engine has Adversarial", engine.adversarial instanceof P.AdversarialEngine);
  check("engine has Dream", engine.dream instanceof P.DreamEngine);
  check("engine has Meta", engine.meta instanceof P.MetaLearner);
  check("engine has Goals", engine.goals instanceof P.GoalManager);
  check("engine.cycle = 0", engine.cycle === 0);
  check("engine.running = false", engine.running === false);
  const status = engine.getStatus();
  check("getStatus returns object", status && typeof status === "object");
  check("getStatus.cycle = 0", status.cycle === 0);
  check("getStatus.modules has all 9 business modules", Object.keys(status.modules).length === 9);
});

console.log(`\n\x1b[36m═══════════════════════════════════════════\x1b[0m`);
console.log(`\x1b[${failed === 0 ? '32' : '31'}m  Passed: ${passed}  Failed: ${failed}\x1b[0m`);
console.log(`\x1b[36m═══════════════════════════════════════════\x1b[0m\n`);

// Cleanup
try { fsNode.unlinkSync(stubPath); } catch {}

process.exit(failed === 0 ? 0 : 1);
