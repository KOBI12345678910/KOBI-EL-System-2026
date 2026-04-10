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
  check("QualityModule (part 3)", typeof P.QualityModule === "function");
  check("NotificationModule (part 3)", typeof P.NotificationModule === "function");
  check("AnalyticsModule (part 3)", typeof P.AnalyticsModule === "function");
  check("Swarm (part 3)", typeof P.Swarm === "function");
  check("Adversarial (part 3)", typeof P.Adversarial === "function");
  check("Dream (part 3)", typeof P.Dream === "function");
  check("MetaLearner (part 3)", typeof P.MetaLearner === "function");
  check("Goals (part 3)", typeof P.Goals === "function");
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
  const c1 = fin.addCheck({ type: "received", number: "12345", amount: P.agorot(10000), payer: "לקוח" });
  check("addCheck", c1 && c1.id);
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

group("11. PricingModule — quote generation + discounts + tracking", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const bom = new P.BOMModule(brain, memory);
  const pricing = new P.PricingModule(brain, memory, bom);
  check("has 6 discount policies", pricing.data.discountPolicies.length === 6);
  check("has 5 dynamic rules", pricing.data.dynamicRules.length === 5);
  check("has 4 competitor prices", pricing.data.competitorPrices.length === 4);
  check("conversionTracking initialized", pricing.data.conversionTracking.quoted === 0);
  check("getConversionRate returns '0' initially", pricing.getConversionRate() === "0");
});

group("12. QualityModule — inspections + defects + warranties + feedback + NPS", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const q = new P.QualityModule(brain, memory);
  check("has 4 standards", q.data.standards.length === 4);
  check("has 5 checklists", Object.keys(q.data.checklists).length === 5);
  check("measurement checklist has 5 items", q.data.checklists.measurement.length === 5);
  const insp = q.createInspection({ projectId: "PRJ-test", type: "final", inspector: "עוזי" });
  check("createInspection", insp && insp.id.startsWith("QC-"));
  check("inspection has checklist populated", insp.checklist.length > 0);
  const completed = q.completeInspection(insp.id, { overallScore: 5, checklist: insp.checklist.map(c => ({ id: c.id, checked: true })) });
  check("completeInspection", completed && completed.status === "completed");
  const def = q.reportDefect({ projectId: "PRJ-test", type: "cosmetic", severity: "minor", description: "scratch" });
  check("reportDefect", def && def.id.startsWith("DEF-"));
  const fixed = q.fixDefect(def.id, { resolution: "touched up", fixCost: P.agorot(50) });
  check("fixDefect", fixed && fixed.status === "fixed");
  const w = q.addWarranty({ customerName: "Test", productType: "railing_iron" });
  check("addWarranty", w && w.id.startsWith("WAR-"));
  check("structural warranty 10 years", w.structuralWarranty.years === 10);
  check("finish warranty 2 years", w.finishWarranty.years === 2);
  const claim = q.addWarrantyClaim(w.id, { description: "rust", type: "repair" });
  check("addWarrantyClaim", claim && claim.id);
  const fb1 = q.addFeedback({ customerName: "Test", overallScore: 5, recommendation: 10, comment: "מעולה" });
  check("addFeedback", fb1 && fb1.id);
  const fb2 = q.addFeedback({ customerName: "Test2", overallScore: 4, recommendation: 9 });
  const fb3 = q.addFeedback({ customerName: "Test3", overallScore: 3, recommendation: 6 });
  const nps = q.getNPS();
  check("getNPS calculates promoters - detractors", typeof nps === "number");
  const dr = q.getDefectRate();
  check("getDefectRate returns string percent", typeof dr === "string");
});

group("13. NotificationModule — notify + unread + summary", () => {
  const memory = new P.Memory();
  const n = new P.NotificationModule(memory); // Note: only takes memory
  check("has default channels", typeof n.data.channels === "object");
  check("has 3-level escalation policy", n.data.escalationPolicy.length === 3);
  const notice = n.notify({ level: "warning", title: "Test", message: "Test message", target: "קובי" });
  check("notify returns notification", notice && notice.id);
  check("notification unread by default", notice.read === false);
  const critical = n.notify({ level: "critical", title: "URGENT", message: "crisis" });
  check("critical notification created", critical.level === "critical");
  check("getUnread has 2", n.getUnread().length === 2);
  check("getCritical has 1", n.getCritical().length === 1);
  n.markRead(notice.id);
  check("markRead works", n.getUnread().length === 1);
  n.markActioned(critical.id);
  check("markActioned works", n.getCritical().length === 0);
  const summary = n.getSummary();
  check("getSummary returns object", typeof summary === "object" && typeof summary.total === "number");
});

group("14. AnalyticsModule — takeSnapshot across all modules", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const bom = new P.BOMModule(brain, memory);
  const modules = {
    erp: new P.ERPModule(brain, memory),
    crm: new P.CRMModule(brain, memory),
    bom: bom,
    hr: new P.HRModule(brain, memory),
    finance: new P.FinanceModule(brain, memory),
    ops: new P.OpsModule(brain, memory),
    pricing: new P.PricingModule(brain, memory, bom),
    quality: new P.QualityModule(brain, memory),
    notifications: new P.NotificationModule(memory),
    brain: brain,
  };
  const an = new P.AnalyticsModule(brain, memory, modules);
  const snap = an.takeSnapshot();
  check("takeSnapshot returns object", snap && typeof snap.t === "string");
  check("snap.erp populated", !!snap.erp);
  check("snap.crm populated", !!snap.crm);
  check("snap.hr populated", !!snap.hr);
  check("snap.finance populated", !!snap.finance);
  check("snap.ops populated", !!snap.ops);
  check("snap.pricing populated", !!snap.pricing);
  check("snap.quality populated", !!snap.quality);
  check("snap.brain populated", !!snap.brain);
  check("snap.notifications populated", !!snap.notifications);
  check("snapshot persisted", an.data.snapshots.length === 1);
});

group("15. Swarm — 7-agent debate layer", () => {
  const brain = new P.Brain();
  const swarm = new P.Swarm(brain);
  check("has 7 agents", swarm.agents.length === 7);
  const roles = swarm.agents.map(a => a.role);
  check("has CEO — קובי", roles.some(r => r.includes("CEO")));
  check("has COO — דימה", roles.some(r => r.includes("COO")));
  check("has CFO", roles.some(r => r.includes("CFO")));
  check("has CMO", roles.some(r => r.includes("CMO")));
  check("has CTO", roles.some(r => r.includes("CTO")));
  check("has HR — קורין", roles.some(r => r.includes("HR")));
  check("has Risk Manager", roles.some(r => r.includes("Risk")));
  check("debate method exists", typeof swarm.debate === "function");
  check("debateHistory initialized", Array.isArray(swarm.debateHistory));
});

group("16. Adversarial + Dream + MetaLearner", () => {
  const brain = new P.Brain();
  const adv = new P.Adversarial(brain);
  const dream = new P.Dream(brain);
  const meta = new P.MetaLearner(brain);
  check("Adversarial instantiable", adv && typeof adv.attack === "function");
  check("Adversarial has stressTest", typeof adv.stressTest === "function");
  check("Adversarial attacks array", Array.isArray(adv.attacks));
  check("Dream instantiable", dream && typeof dream.dream === "function");
  check("Dream dreams array", Array.isArray(dream.dreams));
  check("MetaLearner instantiable", meta && typeof meta.evaluate === "function");
  check("MetaLearner has strategies array", Array.isArray(meta.data.strategies));
  check("MetaLearner has learningCurve array", Array.isArray(meta.data.learningCurve));
});

group("17. Goals — 10 business objectives", () => {
  const brain = new P.Brain();
  const goals = new P.Goals(brain);
  check("has 10 default goals", goals.goals.length === 10);
  check("g1 = 100 לידים ביום", goals.goals[0].id === "g1" && goals.goals[0].target === 100);
  check("g7 = revenue target in agorot", goals.goals[6].id === "g7" && goals.goals[6].target === 500000000);
  check("g10 = אפס תאונות עבודה", goals.goals[9].id === "g10" && goals.goals[9].target === 0);
  check("each goal has owner", goals.goals.every(g => !!g.owner));
  check("each goal has category", goals.goals.every(g => !!g.category));
  check("each goal has deadline", goals.goals.every(g => !!g.deadline));
  check("each goal has history array", goals.goals.every(g => Array.isArray(g.history)));
  goals.update("g1", 25);
  check("update adds to history", goals.goals[0].history.length === 1);
  check("update sets current", goals.goals[0].current === 25);
});

group("18. ParadigmEngine — main orchestrator", () => {
  const engine = new P.ParadigmEngine();

  // Core wiring
  check("engine has brain", engine.brain instanceof P.Brain);
  check("engine has memory", engine.memory instanceof P.Memory);

  // Business modules (8)
  check("engine has ERP", engine.erp instanceof P.ERPModule);
  check("engine has CRM", engine.crm instanceof P.CRMModule);
  check("engine has BOM", engine.bom instanceof P.BOMModule);
  check("engine has HR", engine.hr instanceof P.HRModule);
  check("engine has Finance", engine.finance instanceof P.FinanceModule);
  check("engine has Ops", engine.ops instanceof P.OpsModule);
  check("engine has Pricing", engine.pricing instanceof P.PricingModule);
  check("engine has Quality", engine.quality instanceof P.QualityModule);

  // Support modules
  check("engine has Notifications", engine.notifications instanceof P.NotificationModule);
  check("engine has Analytics", engine.analytics instanceof P.AnalyticsModule);

  // Intelligence modules (5)
  check("engine has Swarm", engine.swarm instanceof P.Swarm);
  check("engine has Adversarial", engine.adversarial instanceof P.Adversarial);
  check("engine has Dream", engine.dream instanceof P.Dream);
  check("engine has MetaLearner", engine.metaLearner instanceof P.MetaLearner);
  check("engine has Goals", engine.goals instanceof P.Goals);

  // Engine state
  check("engine.cycle = 0", engine.cycle === 0);
  check("engine.running = false", engine.running === false);
  check("engine.startTime = null", engine.startTime === null);
  check("engine.healthScore = 100", engine.healthScore === 100);
  check("engine.cycleHistory is array", Array.isArray(engine.cycleHistory));
  check("engine.cycleHistory empty initially", engine.cycleHistory.length === 0);

  // The 7 phase methods + runCycle + start
  check("engine.perceive is async function", typeof engine.perceive === "function");
  check("engine.comprehend is async function", typeof engine.comprehend === "function");
  check("engine.validate is async function", typeof engine.validate === "function");
  check("engine.trackGoals is async function", typeof engine.trackGoals === "function");
  check("engine.evolve is async function", typeof engine.evolve === "function");
  check("engine.report is async function", typeof engine.report === "function");
  check("engine.housekeeping is async function", typeof engine.housekeeping === "function");
  check("engine.runCycle is async function", typeof engine.runCycle === "function");
  check("engine.start is async function", typeof engine.start === "function");

  // Analytics was handed the full module bag at construction
  check("analytics.modules.erp === engine.erp", engine.analytics.modules.erp === engine.erp);
  check("analytics.modules.crm === engine.crm", engine.analytics.modules.crm === engine.crm);
  check("analytics.modules.brain === engine.brain", engine.analytics.modules.brain === engine.brain);
  check("analytics.modules.notifications === engine.notifications", engine.analytics.modules.notifications === engine.notifications);

  // Pricing was handed BOM at construction
  check("pricing.bom === engine.bom", engine.pricing.bom === engine.bom);
});

console.log(`\n\x1b[36m═══════════════════════════════════════════\x1b[0m`);
console.log(`\x1b[${failed === 0 ? '32' : '31'}m  Passed: ${passed}  Failed: ${failed}\x1b[0m`);
console.log(`\x1b[36m═══════════════════════════════════════════\x1b[0m\n`);

// Cleanup
try { fsNode.unlinkSync(stubPath); } catch {}

process.exit(failed === 0 ? 0 : 1);
