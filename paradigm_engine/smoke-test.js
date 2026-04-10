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
const stubPath = require("path").resolve(__dirname, "_stub_anthropic.js");

// Create the stub file
require("fs").writeFileSync(stubPath, `
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
  try { fn(); } catch (e) { console.log(`  \x1b[31m✗ CRASH:\x1b[0m ${e.message}`); failed++; }
}

const P = require("./paradigm-engine.js");

group("1. Module exports", () => {
  check("CONFIG exists", !!P.CONFIG);
  check("Brain class", typeof P.Brain === "function");
  check("Memory class", typeof P.Memory === "function");
  check("ERPModule", typeof P.ERPModule === "function");
  check("CRMModule", typeof P.CRMModule === "function");
  check("BOMModule", typeof P.BOMModule === "function");
  check("HRModule", typeof P.HRModule === "function");
  check("FinanceModule", typeof P.FinanceModule === "function");
  check("OpsModule", typeof P.OpsModule === "function");
  check("PricingModule", typeof P.PricingModule === "function");
  check("QualityModule", typeof P.QualityModule === "function");
  check("NotificationModule", typeof P.NotificationModule === "function");
  check("AnalyticsModule", typeof P.AnalyticsModule === "function");
  check("SwarmCouncil", typeof P.SwarmCouncil === "function");
  check("AdversarialEngine", typeof P.AdversarialEngine === "function");
  check("DreamEngine", typeof P.DreamEngine === "function");
  check("MetaLearner", typeof P.MetaLearner === "function");
  check("GoalManager", typeof P.GoalManager === "function");
  check("ParadigmEngine", typeof P.ParadigmEngine === "function");
  check("AGENT_ROLES has 7 agents", Object.keys(P.AGENT_ROLES).length === 7);
});

group("2. Utilities (currency math)", () => {
  check("agorot(100.50) = 10050", P.agorot(100.50) === 10050);
  check("shekel(10050) = '100.50'", P.shekel(10050) === "100.50");
  check("addVat(10000) = 11800", P.addVat(10000) === 11800);
  check("vatOf(10000) = 1800", P.vatOf(10000) === 1800);
  check("clamp(50, 0, 100) = 50", P.clamp(50, 0, 100) === 50);
  check("clamp(150, 0, 100) = 100", P.clamp(150, 0, 100) === 100);
  check("clamp(-10, 0, 100) = 0", P.clamp(-10, 0, 100) === 0);
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
  check("realestate has 3 markets", P.CONFIG.BUSINESS.realestate.markets.length === 3);
  check("realestate has 4 properties", P.CONFIG.BUSINESS.realestate.properties.length === 4);
});

group("4. Brain + Memory", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  check("Brain.calls = 0", brain.calls === 0);
  check("Brain.getStats()", typeof brain.getStats().calls === "number");
  check("Memory.add works", (() => { memory.add("shortTerm", { test: true }); return memory.count("shortTerm") > 0; })());
  check("Memory.conscious works", (() => { memory.conscious(0, "test"); return memory.data.consciousness.L0_raw.length > 0; })());
  check("Memory.getSummary", typeof memory.getSummary().counts === "object");
});

group("5. ERP Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const erp = new P.ERPModule(brain, memory);
  const p = erp.createProject({ name: "Test", customerName: "Kobi", type: "railing_iron" });
  check("createProject returns object with id", p && p.id && p.id.startsWith("PRJ-"));
  check("project status = new", p.status === "new");
  const moved = erp.moveProjectStatus(p.id, "measuring");
  check("valid transition new → measuring", moved && moved.status === "measuring");
  const invalid = erp.moveProjectStatus(p.id, "completed");
  check("invalid transition blocked", invalid === null);
  const item = erp.addInventoryItem({ name: "ברזל 40x40", qty: 100, minQty: 20, costPerUnit: P.agorot(32) });
  check("addInventoryItem", item && item.qty === 100);
  const updated = erp.updateStock(item.id, -10, "test");
  check("updateStock", updated && updated.qty === 90);
  const reserved = erp.reserveStock(item.id, 5, p.id);
  check("reserveStock", reserved && reserved.reservedQty === 5);
  check("availableQty = qty - reserved", reserved.availableQty === 85);
  const supplier = erp.addSupplier({ name: "Test Supplier", categories: ["ברזל"] });
  check("addSupplier", supplier && supplier.id);
  const po = erp.createPO({ supplierName: "Test Supplier", items: [{ name: "Iron", qty: 50, unitPrice: P.agorot(30) }] });
  check("createPO calculates total with VAT", po && po.total === P.addVat(P.agorot(30) * 50));
  const wo = erp.createWorkOrder({ description: "Build railing", estimatedHours: 8 });
  check("createWorkOrder", wo && wo.id.startsWith("WO-"));
});

group("6. CRM Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const crm = new P.CRMModule(brain, memory);
  const lead = crm.addLead({ name: "Test Customer", source: "Google Ads Search", projectType: "railing_iron", city: "תל אביב", estimatedValue: P.agorot(18000) });
  check("addLead returns lead", lead && lead.id && lead.id.startsWith("LEAD-"));
  check("lead initial score = 50", lead.score === 50);
  check("pipeline.new has 1", crm.data.pipeline.new.length === 1);
  const moved = crm.moveLead(lead.id, "contacted");
  check("moveLead", moved && moved.status === "contacted");
  check("pipeline.new empty", crm.data.pipeline.new.length === 0);
  check("pipeline.contacted has 1", crm.data.pipeline.contacted.length === 1);
  const interaction = crm.addInteraction(lead.id, { type: "call", result: "answered", sentiment: "positive" });
  check("addInteraction", interaction && interaction.id);
  check("lead has interaction", crm.data.leads[0].interactions.length === 1);
  const deal = crm.createDeal(lead.id, { amount: P.agorot(20000), description: "Railing + gate" });
  check("createDeal", deal && deal.id.startsWith("DEAL-"));
  const pipeline = crm.getPipelineSummary();
  check("pipeline summary", typeof pipeline === "object");
});

group("7. BOM Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const erp = new P.ERPModule(brain, memory);
  const bom = new P.BOMModule(brain, memory, erp);
  check("has 5 default templates", bom.data.templates.length === 5);
  check("railing_iron template exists", bom.getTemplate("railing_iron") !== undefined);
  check("gate_electric template exists", bom.getTemplate("gate_electric") !== undefined);
  const b = bom.createFromTemplate("railing_iron", 10);
  check("createFromTemplate returns BOM", b && b.id && b.id.startsWith("BOM-"));
  check("BOM has materials", b.materials.length > 0);
  check("BOM has labor", b.labor.length > 0);
  check("BOM sellPrice > 0", b.costs.sellPrice > 0);
  check("BOM sellPrice = subtotal + margin", b.costs.sellPrice === b.costs.subtotal + b.costs.margin);
  check("BOM totalWithVat correct", b.costs.totalWithVat === P.addVat(b.costs.sellPrice));
});

group("8. HR Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const hr = new P.HRModule(brain, memory);
  const emp = hr.addEmployee({ name: "Test Worker", role: "welder", department: "ייצור", monthlySalary: P.agorot(8500) });
  check("addEmployee", emp && emp.id.startsWith("EMP-"));
  check("hourly rate calculated", emp.hourlyRate > 0);
  const att = hr.recordAttendance(emp.id, { date: "2026-04-10", hoursWorked: 9, overtime: 1 });
  check("recordAttendance", att && att.id);
  const leave = hr.requestLeave(emp.id, { type: "vacation", startDate: "2026-04-20", endDate: "2026-04-22", days: 3, reason: "חופשה משפחתית" });
  check("requestLeave pending", leave && leave.status === "pending");
  const approved = hr.approveLeave(leave.id);
  check("approveLeave", approved && approved.status === "approved");
  check("vacation days updated", hr.data.employees[0].vacationDays.used === 3);
  const salary = hr.calculateMonthlySalary(emp.id, "2026-04");
  check("calculateMonthlySalary", salary && salary.grossSalary > 0);
  check("deductions calculated", salary && salary.deductions && salary.deductions.total > 0);
  check("net < gross", salary.netSalary < salary.grossSalary);
});

group("9. Finance Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const erp = new P.ERPModule(brain, memory);
  const crm = new P.CRMModule(brain, memory);
  const fin = new P.FinanceModule(brain, memory, erp, crm);
  const inv = fin.createInvoice({
    customerName: "Test Client", biz: "techno",
    items: [{ description: "Railing 10m", qty: 10, unitPrice: P.agorot(620) }],
  });
  check("createInvoice", inv && inv.number);
  check("invoice subtotal = qty*price", inv.subtotal === P.agorot(620) * 10);
  check("invoice VAT correct", inv.vat === P.vatOf(inv.subtotal));
  check("invoice total = subtotal + VAT", inv.total === P.addVat(inv.subtotal));
  check("outstanding = total initially", inv.outstanding === inv.total);
  const issued = fin.issueInvoice(inv.id);
  check("issueInvoice", issued && issued.status === "issued");
  const paid = fin.recordPayment(inv.id, { amount: inv.total, method: "bank_transfer" });
  check("recordPayment full", paid && paid.status === "paid");
  check("outstanding = 0 after full pay", paid.outstanding === 0);
  const exp = fin.createExpense({ category: "materials", description: "Iron bars", amount: P.agorot(5000) });
  check("createExpense", exp && exp.id);
  check("expense VAT calculated", exp.vatAmount === P.vatOf(P.agorot(5000)));
  const vat = fin.calculateVATReport("2026-04");
  check("VAT report", vat && vat.period === "2026-04");
});

group("10. Ops Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const erp = new P.ERPModule(brain, memory);
  const hr = new P.HRModule(brain, memory);
  const ops = new P.OpsModule(brain, memory, erp, hr);
  check("has 3 vehicles", ops.data.vehicles.length === 3);
  const m = ops.scheduleMeasurement({ customerName: "Test", address: "Dizengoff 1", scheduledAt: "2026-04-11T10:00:00Z" });
  check("scheduleMeasurement", m && m.id.startsWith("MSR-"));
  const done = ops.completeMeasurement(m.id, { measurements: { length: 12, height: 1.1 } });
  check("completeMeasurement", done && done.status === "completed");
  const inst = ops.scheduleInstallation({ projectId: "PRJ-test", customerName: "Test", scheduledDate: "2026-04-15", team: ["עובד 1", "עובד 2"] });
  check("scheduleInstallation", inst && inst.id.startsWith("INS-"));
  const veh = ops.assignVehicle("VEH-1", "EMP-test");
  check("assignVehicle", veh && veh.status === "in_use");
  const released = ops.releaseVehicle("VEH-1");
  check("releaseVehicle", released && released.status === "available");
  const inc = ops.reportIncident({ type: "near_miss", severity: "low", description: "Test" });
  check("reportIncident", inc && inc.id.startsWith("INC-"));
});

group("11. Quality Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const erp = new P.ERPModule(brain, memory);
  const q = new P.QualityModule(brain, memory, erp);
  const insp = q.createInspection({ projectId: "PRJ-test", stage: "pre_delivery", inspector: "Test Inspector" });
  check("createInspection", insp && insp.id.startsWith("QC-"));
  const def = q.reportDefect({ projectId: "PRJ-test", type: "cosmetic", severity: "minor", description: "Small scratch" });
  check("reportDefect", def && def.id.startsWith("DEF-"));
  const resolved = q.resolveDefect(def.id, { notes: "Touched up", actualCost: P.agorot(50) });
  check("resolveDefect", resolved && resolved.status === "resolved");
  const w = q.createWarranty({ projectId: "PRJ-test", customerName: "Test" });
  check("createWarranty", w && w.id.startsWith("WAR-"));
  check("warranty 10 years by default", w.durationYears === 10);
  const cmp = q.recordComplaint({ customerName: "Test", description: "Test complaint" });
  check("recordComplaint", cmp && cmp.id.startsWith("CMP-"));
  const kpis = q.calculateKPIs();
  check("calculateKPIs", typeof kpis === "object" && kpis.defectRate !== undefined);
});

group("12. Pricing Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const erp = new P.ERPModule(brain, memory);
  const bom = new P.BOMModule(brain, memory, erp);
  const pr = new P.PricingModule(brain, memory, erp, bom);
  check("priceBook has railing_iron", pr.data.priceBook.railing_iron !== undefined);
  check("discount policy exists", pr.data.discountPolicy.maxDiscountPercent === 0.12);
  check("volume discount tiers = 3", pr.data.discountPolicy.volumeDiscount.length === 3);
});

group("13. Notification Module", () => {
  const brain = new P.Brain();
  const memory = new P.Memory();
  const n = new P.NotificationModule(brain, memory);
  check("has 8+ templates", Object.keys(n.data.templates).length >= 8);
  const rendered = n.render("quote_sent", { name: "דוד", total: "12,345", validUntil: "2026-05-01" });
  check("render template substitutes vars", rendered && rendered.includes("דוד") && rendered.includes("12,345"));
  const q = n.enqueue({ channel: "whatsapp", to: "050-1234567", toName: "Test", template: "lead_new", vars: { name: "Test" } });
  check("enqueue", q && q.id.startsWith("NOT-"));
  check("queue has message", n.data.queue.length === 1);
});

group("14. Cognitive Layer", () => {
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
});

group("15. Goals", () => {
  const memory = new P.Memory();
  const goals = new P.GoalManager(memory);
  check("has 10 default goals", goals.goals.length === 10);
  check("G1 = leads_per_day", goals.goals[0].metric === "leads_per_day");
  const updated = goals.update("G1", 5);
  check("update goal", updated && updated.current === 5);
  check("progress calculated", updated.progress > 0);
  const status = goals.getStatus();
  check("getStatus returns array", Array.isArray(status) && status.length === 10);
});

group("16. ParadigmEngine Orchestrator", () => {
  const engine = new P.ParadigmEngine();
  check("engine has brain", engine.brain instanceof P.Brain);
  check("engine has memory", engine.memory instanceof P.Memory);
  check("engine has all 10 business modules", !!(engine.erp && engine.crm && engine.bom && engine.hr && engine.finance && engine.ops && engine.pricing && engine.quality && engine.notify && engine.analytics));
  check("engine has cognitive layer", !!(engine.swarm && engine.adversarial && engine.dream && engine.meta));
  check("engine has goals", engine.goals instanceof P.GoalManager);
  check("engine not running initially", engine.running === false);
  check("engine cycle = 0", engine.cycle === 0);
  const status = engine.getStatus();
  check("getStatus works", status && typeof status === "object" && status.cycle === 0);
});

console.log(`\n\x1b[36m═══════════════════════════════════════════\x1b[0m`);
console.log(`\x1b[${failed === 0 ? '32' : '31'}m  Passed: ${passed}  Failed: ${failed}\x1b[0m`);
console.log(`\x1b[36m═══════════════════════════════════════════\x1b[0m\n`);

// Cleanup
try { require("fs").unlinkSync(stubPath); } catch {}

process.exit(failed === 0 ? 0 : 1);
