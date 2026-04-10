/**
 * BASH44 Intelligence Platform — Seed Data
 *
 * Registers the default:
 *   - Decision rules
 *   - Action handlers
 *   - Profit models
 *   - Causal links (dependency graph for the whole company)
 *   - Seed entities across all modules (live demo company picture)
 *   - Initial KPIs
 */

import { realtimePlatform, type ModuleKey } from "./realtime-platform-engine";
import { intelligencePlatform } from "./intelligence-engines";

let seeded = false;

export function seedIntelligencePlatform() {
  if (seeded) return;
  seeded = true;

  registerProfitModels();
  registerActionHandlers();
  registerDecisionRules();
  registerCausalLinks();
  registerInitialEntities();
  registerInitialKpis();
  startHeartbeatSimulator();
}

// ════════════════════════════════════════════════════════════════
// PROFIT MODELS
// ════════════════════════════════════════════════════════════════

function registerProfitModels() {
  intelligencePlatform.profit.registerModel({
    entityType: "lead",
    avgRevenue: 25000,
    avgCostRatio: 0.08,
    marginPercent: 92,
  });
  intelligencePlatform.profit.registerModel({
    entityType: "quote",
    avgRevenue: 45000,
    avgCostRatio: 0.68,
    marginPercent: 32,
  });
  intelligencePlatform.profit.registerModel({
    entityType: "order",
    avgRevenue: 65000,
    avgCostRatio: 0.70,
    marginPercent: 30,
  });
  intelligencePlatform.profit.registerModel({
    entityType: "project",
    avgRevenue: 180000,
    avgCostRatio: 0.72,
    marginPercent: 28,
  });
  intelligencePlatform.profit.registerModel({
    entityType: "invoice",
    avgRevenue: 35000,
    avgCostRatio: 0,
    marginPercent: 100,
  });
  intelligencePlatform.profit.registerModel({
    entityType: "production_order",
    avgRevenue: 50000,
    avgCostRatio: 0.75,
    marginPercent: 25,
  });
}

// ════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ════════════════════════════════════════════════════════════════

function registerActionHandlers() {
  // For the demo these handlers are stubs that simulate execution.
  // In production they would call actual module APIs.

  intelligencePlatform.execution.registerHandler("recover_stockout", async (params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `הוזמן מלאי חירום ל-${decision.entityId}`,
      data: { orderCreated: true, qty: params["qty"] ?? 100 },
    };
  });

  intelligencePlatform.execution.registerHandler("escalate_supplier_delay", async (params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `הועברה התראת עיכוב לספק ${params["supplierName"] ?? decision.entityId}`,
      data: { notified: true },
    };
  });

  intelligencePlatform.execution.registerHandler("reroute_production", async (_params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `ייצור ${decision.entityId} הועבר לקו חלופי`,
      data: { newLine: "line-B" },
    };
  });

  intelligencePlatform.execution.registerHandler("offer_discount_to_close", async (params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `הוצעה הנחה של ${params["discountPct"] ?? 5}% על ${decision.entityId}`,
      data: { discountOffered: params["discountPct"] ?? 5 },
    };
  });

  intelligencePlatform.execution.registerHandler("trigger_collection_call", async (_params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `נוצרה משימת גבייה עבור ${decision.entityId}`,
      data: { taskCreated: true, assignee: "finance-team" },
    };
  });

  intelligencePlatform.execution.registerHandler("approve_quote_fast", async (_params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `הצעת מחיר ${decision.entityId} אושרה אוטומטית`,
      data: { approved: true },
    };
  });

  intelligencePlatform.execution.registerHandler("reassign_technician", async (params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `הטכנאי הועבר לקריאה ${decision.entityId}`,
      data: { newTech: params["technicianId"] },
    };
  });

  intelligencePlatform.execution.registerHandler("auto_pay_critical_invoice", async (params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `חשבונית ${decision.entityId} שולמה אוטומטית`,
      data: { paid: true, amount: params["amount"] },
    };
  });

  intelligencePlatform.execution.registerHandler("escalate_project_risk", async (_params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `פרויקט ${decision.entityId} הועלה למנהל פרויקטים בכיר`,
      data: { escalated: true },
    };
  });

  intelligencePlatform.execution.registerHandler("notify_customer", async (params, decision) => {
    await new Promise(r => setTimeout(r, 50));
    return {
      success: true,
      message: `נשלחה הודעה ללקוח על ${decision.entityId}`,
      data: { notificationSent: true, channel: params["channel"] ?? "email" },
    };
  });
}

// ════════════════════════════════════════════════════════════════
// DECISION RULES
// ════════════════════════════════════════════════════════════════

function registerDecisionRules() {
  // 1. Stockout prevention
  intelligencePlatform.decisions.registerRule({
    id: "rule.stockout.prevent",
    name: "מניעת חוסר מלאי קריטי",
    description: "כשמלאי יורד מתחת לסף — הזמנה אוטומטית",
    category: "inventory",
    triggerEventTypes: ["stock.low", "stock.critical", "stock.depleted"],
    triggerModules: ["inventory"],
    condition: (event, ctx) => {
      const qty = (event.newState?.["qty"] as number) ?? 0;
      const threshold = (event.newState?.["reorderPoint"] as number) ?? 10;
      return qty <= threshold;
    },
    score: (event, ctx) => {
      const impact = event.financialImpact ?? 10000;
      return Math.min(100, 60 + Math.log10(impact) * 5);
    },
    action: {
      actionType: "recover_stockout",
      targetModule: "procurement",
      params: { qty: 100 },
      autoExecutable: true,
      maxFinancialImpact: 50000,
      dailyLimit: 20,
    },
    enabled: true,
  });

  // 2. Supplier delay escalation
  intelligencePlatform.decisions.registerRule({
    id: "rule.supplier.delay.escalate",
    name: "אסקלציה של עיכוב ספק",
    description: "כשספק מאחר בהספקה — התראה אוטומטית לרכש",
    category: "procurement",
    triggerEventTypes: ["supplier.delivery.late", "supplier.delivery.missed"],
    triggerSeverity: ["warning", "critical", "blocker"],
    condition: () => true,
    score: (event) => (event.severity === "critical" ? 85 : 65),
    action: {
      actionType: "escalate_supplier_delay",
      targetModule: "suppliers",
      params: {},
      autoExecutable: true,
      dailyLimit: 50,
    },
    enabled: true,
  });

  // 3. Production rerouting on line failure
  intelligencePlatform.decisions.registerRule({
    id: "rule.production.reroute",
    name: "ניתוב ייצור בכשל קו",
    description: "כשקו ייצור נכשל — העברה אוטומטית לקו חלופי",
    category: "production",
    triggerEventTypes: ["production.line.failed", "production.line.stopped"],
    triggerSeverity: ["critical", "blocker"],
    condition: () => true,
    score: () => 90,
    action: {
      actionType: "reroute_production",
      targetModule: "production",
      params: {},
      autoExecutable: false, // requires approval
      maxFinancialImpact: 100000,
    },
    enabled: true,
  });

  // 4. Quote closing boost
  intelligencePlatform.decisions.registerRule({
    id: "rule.quote.close.boost",
    name: "דחיפת סגירת הצעת מחיר",
    description: "הצעה שעומדת לפוג — הצעת הנחה אוטומטית",
    category: "sales",
    triggerEventTypes: ["quote.expiring", "quote.stale"],
    triggerModules: ["quotes"],
    condition: (event) => {
      const daysLeft = (event.newState?.["daysToExpiry"] as number) ?? 0;
      return daysLeft <= 3 && daysLeft >= 0;
    },
    score: (event) => {
      const value = (event.newState?.["value"] as number) ?? 0;
      return Math.min(100, 50 + value / 1000);
    },
    action: {
      actionType: "offer_discount_to_close",
      targetModule: "sales",
      params: { discountPct: 5 },
      autoExecutable: false,
      maxFinancialImpact: 30000,
    },
    enabled: true,
  });

  // 5. Overdue invoice collection
  intelligencePlatform.decisions.registerRule({
    id: "rule.invoice.overdue.collect",
    name: "גבייה אוטומטית של חשבונית באיחור",
    description: "חשבונית באיחור של 30+ ימים — יצירת משימת גבייה",
    category: "finance",
    triggerEventTypes: ["invoice.overdue", "payment.missed"],
    triggerModules: ["billing", "payments"],
    condition: (event) => {
      const daysOverdue = (event.newState?.["daysOverdue"] as number) ?? 0;
      return daysOverdue >= 30;
    },
    score: (event) => {
      const amount = (event.newState?.["amount"] as number) ?? 0;
      return Math.min(100, 40 + amount / 1000);
    },
    action: {
      actionType: "trigger_collection_call",
      targetModule: "billing",
      params: {},
      autoExecutable: true,
      dailyLimit: 100,
    },
    enabled: true,
  });

  // 6. Fast quote approval for trusted customers
  intelligencePlatform.decisions.registerRule({
    id: "rule.quote.auto.approve",
    name: "אישור מהיר של הצעת מחיר",
    description: "הצעת מחיר קטנה ללקוח מדורג גבוה — אישור אוטומטי",
    category: "sales",
    triggerEventTypes: ["quote.created"],
    condition: (event) => {
      const value = (event.newState?.["value"] as number) ?? 0;
      const customerTier = (event.newState?.["customerTier"] as string) ?? "standard";
      return value <= 20000 && customerTier === "gold";
    },
    score: () => 70,
    action: {
      actionType: "approve_quote_fast",
      targetModule: "quotes",
      params: {},
      autoExecutable: true,
      dailyLimit: 50,
    },
    enabled: true,
  });

  // 7. Project risk escalation
  intelligencePlatform.decisions.registerRule({
    id: "rule.project.risk.escalate",
    name: "אסקלציה של סיכון פרויקט",
    description: "פרויקט בסיכון גבוה — העברה למנהל פרויקטים בכיר",
    category: "projects",
    triggerEventTypes: ["project.risk.high", "project.deadline.approaching"],
    triggerSeverity: ["warning", "critical"],
    condition: (event) => {
      const risk = (event.newState?.["riskLevel"] as string) ?? "low";
      return risk === "high" || risk === "critical";
    },
    score: (event) => (event.severity === "critical" ? 95 : 75),
    action: {
      actionType: "escalate_project_risk",
      targetModule: "projects",
      params: {},
      autoExecutable: false,
      maxFinancialImpact: 200000,
    },
    enabled: true,
  });

  // 8. Service escalation for VIP customers
  intelligencePlatform.decisions.registerRule({
    id: "rule.service.vip.escalate",
    name: "העברת טכנאי ללקוח VIP",
    description: "תקלה אצל לקוח VIP — טכנאי בכיר",
    category: "service",
    triggerEventTypes: ["incident.opened", "service.call"],
    triggerModules: ["service"],
    condition: (event) => {
      const vip = (event.newState?.["vipCustomer"] as boolean) ?? false;
      return vip;
    },
    score: () => 80,
    action: {
      actionType: "reassign_technician",
      targetModule: "service",
      params: { technicianId: "senior-1" },
      autoExecutable: true,
      dailyLimit: 30,
    },
    enabled: true,
  });

  // 9. Critical invoice auto-pay
  intelligencePlatform.decisions.registerRule({
    id: "rule.invoice.critical.autopay",
    name: "תשלום אוטומטי של חשבונית קריטית",
    description: "ספק קריטי עם תשלום מתקרב — תשלום מוקדם",
    category: "finance",
    triggerEventTypes: ["invoice.due.soon"],
    condition: (event) => {
      const supplierCritical = (event.newState?.["supplierCritical"] as boolean) ?? false;
      const amount = (event.newState?.["amount"] as number) ?? 0;
      return supplierCritical && amount <= 50000;
    },
    score: () => 75,
    action: {
      actionType: "auto_pay_critical_invoice",
      targetModule: "payments",
      params: {},
      autoExecutable: false,
      maxFinancialImpact: 50000,
      requiresRole: ["finance_manager"],
    },
    enabled: true,
  });

  // 10. Customer notification on delay
  intelligencePlatform.decisions.registerRule({
    id: "rule.customer.notify.delay",
    name: "יידוע לקוח על עיכוב",
    description: "פרויקט לקוח מעוכב — הודעה פרו-אקטיבית",
    category: "crm",
    triggerEventTypes: ["project.delayed", "delivery.delayed"],
    condition: () => true,
    score: (event) => (event.severity === "critical" ? 85 : 55),
    action: {
      actionType: "notify_customer",
      targetModule: "crm",
      params: { channel: "email" },
      autoExecutable: true,
      dailyLimit: 100,
    },
    enabled: true,
  });
}

// ════════════════════════════════════════════════════════════════
// CAUSAL LINKS — the dependency graph of the whole company
// ════════════════════════════════════════════════════════════════

function registerCausalLinks() {
  // Supply chain
  realtimePlatform.Causal.addLink({
    fromEntityType: "supplier", fromEntityId: "sup-101",
    toEntityType: "purchase_order", toEntityId: "po-2001",
    linkType: "delivers_to", strength: 0.9, propagationDelayMs: 30_000,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "purchase_order", fromEntityId: "po-2001",
    toEntityType: "stock_item", toEntityId: "sku-5500",
    linkType: "replenishes", strength: 1, propagationDelayMs: 0,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "stock_item", fromEntityId: "sku-5500",
    toEntityType: "production_order", toEntityId: "prod-300",
    linkType: "consumes", strength: 0.95,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "production_order", fromEntityId: "prod-300",
    toEntityType: "project", toEntityId: "proj-77",
    linkType: "produces_for", strength: 1,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "project", fromEntityId: "proj-77",
    toEntityType: "installation", toEntityId: "inst-901",
    linkType: "scheduled_for", strength: 0.9,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "installation", fromEntityId: "inst-901",
    toEntityType: "invoice", toEntityId: "inv-3030",
    linkType: "triggers_billing", strength: 1,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "invoice", fromEntityId: "inv-3030",
    toEntityType: "cashflow_bucket", toEntityId: "cf-week-16",
    linkType: "affects_cashflow", strength: 1,
  });

  // Customer journey
  realtimePlatform.Causal.addLink({
    fromEntityType: "lead", fromEntityId: "lead-501",
    toEntityType: "quote", toEntityId: "quo-8801",
    linkType: "converts_to", strength: 0.8,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "quote", fromEntityId: "quo-8801",
    toEntityType: "order", toEntityId: "ord-4400",
    linkType: "becomes", strength: 0.85,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "order", fromEntityId: "ord-4400",
    toEntityType: "project", toEntityId: "proj-77",
    linkType: "initiates", strength: 1,
  });

  // Cross-module impacts
  realtimePlatform.Causal.addLink({
    fromEntityType: "supplier", fromEntityId: "sup-101",
    toEntityType: "project", toEntityId: "proj-77",
    linkType: "critical_dependency", strength: 0.7,
  });
  realtimePlatform.Causal.addLink({
    fromEntityType: "employee", fromEntityId: "emp-12",
    toEntityType: "project", toEntityId: "proj-77",
    linkType: "assigned_to", strength: 0.8,
  });
}

// ════════════════════════════════════════════════════════════════
// INITIAL ENTITIES — seed a realistic live company picture
// ════════════════════════════════════════════════════════════════

function registerInitialEntities() {
  const entities: Array<{
    module: ModuleKey;
    entityType: string;
    entityId: string;
    entityLabel: string;
    status: string;
    risk: "none" | "low" | "medium" | "high" | "critical";
    value?: number;
    progress?: number;
  }> = [
    // CRM
    { module: "crm", entityType: "customer", entityId: "cust-001", entityLabel: "אלקו בע״מ", status: "active", risk: "none", value: 450000 },
    { module: "crm", entityType: "customer", entityId: "cust-002", entityLabel: "הפניקס בנייה", status: "active", risk: "low", value: 280000 },
    { module: "crm", entityType: "customer", entityId: "cust-003", entityLabel: "אלום פרו", status: "at_risk", risk: "medium", value: 190000 },
    { module: "crm", entityType: "lead", entityId: "lead-501", entityLabel: "ליד — מרכז מסחרי חיפה", status: "qualified", risk: "none", value: 320000 },
    { module: "crm", entityType: "lead", entityId: "lead-502", entityLabel: "ליד — מגדלי תל אביב", status: "nurturing", risk: "low", value: 180000 },

    // Sales / Quotes
    { module: "quotes", entityType: "quote", entityId: "quo-8801", entityLabel: "הצעה אלקו Q4", status: "sent", risk: "low", value: 125000 },
    { module: "quotes", entityType: "quote", entityId: "quo-8802", entityLabel: "הצעה פניקס", status: "draft", risk: "none", value: 85000 },
    { module: "quotes", entityType: "quote", entityId: "quo-8803", entityLabel: "הצעה בשינוי", status: "expiring", risk: "high", value: 210000 },

    // Orders
    { module: "orders", entityType: "order", entityId: "ord-4400", entityLabel: "הזמנה #4400 אלקו", status: "confirmed", risk: "none", value: 125000, progress: 0 },
    { module: "orders", entityType: "order", entityId: "ord-4401", entityLabel: "הזמנה #4401 פניקס", status: "in_progress", risk: "low", value: 85000, progress: 45 },

    // Projects
    { module: "projects", entityType: "project", entityId: "proj-77", entityLabel: "פרויקט — חזית אלומיניום אלקו", status: "in_progress", risk: "medium", value: 450000, progress: 62 },
    { module: "projects", entityType: "project", entityId: "proj-78", entityLabel: "פרויקט — מערכת זיגוג פניקס", status: "at_risk", risk: "high", value: 280000, progress: 38 },
    { module: "projects", entityType: "project", entityId: "proj-79", entityLabel: "פרויקט — מעטפת זכוכית", status: "delayed", risk: "critical", value: 650000, progress: 22 },

    // Procurement
    { module: "procurement", entityType: "purchase_order", entityId: "po-2001", entityLabel: "רכש — אלומיניום פרופיל", status: "delayed", risk: "high", value: 85000 },
    { module: "procurement", entityType: "purchase_order", entityId: "po-2002", entityLabel: "רכש — זכוכית טמפרד", status: "received", risk: "none", value: 45000 },
    { module: "procurement", entityType: "purchase_order", entityId: "po-2003", entityLabel: "רכש — אביזרי חיבור", status: "ordered", risk: "low", value: 22000 },

    // Suppliers
    { module: "suppliers", entityType: "supplier", entityId: "sup-101", entityLabel: "Hydro Aluminium", status: "delayed", risk: "high" },
    { module: "suppliers", entityType: "supplier", entityId: "sup-102", entityLabel: "Guardian Glass", status: "active", risk: "none" },
    { module: "suppliers", entityType: "supplier", entityId: "sup-103", entityLabel: "Schüco", status: "active", risk: "low" },

    // Inventory
    { module: "inventory", entityType: "stock_item", entityId: "sku-5500", entityLabel: "פרופיל אלומיניום 6060", status: "low", risk: "high", value: 12 },
    { module: "inventory", entityType: "stock_item", entityId: "sku-5501", entityLabel: "זכוכית 6mm", status: "ok", risk: "none", value: 450 },
    { module: "inventory", entityType: "stock_item", entityId: "sku-5502", entityLabel: "ידיות דלת", status: "critical", risk: "critical", value: 3 },

    // Production
    { module: "production", entityType: "production_order", entityId: "prod-300", entityLabel: "ייצור חזית אלקו", status: "in_progress", risk: "medium", value: 180000, progress: 55 },
    { module: "production", entityType: "production_order", entityId: "prod-301", entityLabel: "ייצור חלונות פניקס", status: "queued", risk: "low", value: 95000, progress: 0 },
    { module: "production", entityType: "production_line", entityId: "line-A", entityLabel: "קו ייצור A", status: "active", risk: "none" },
    { module: "production", entityType: "production_line", entityId: "line-B", entityLabel: "קו ייצור B", status: "maintenance", risk: "medium" },

    // Quality
    { module: "qc", entityType: "qc_inspection", entityId: "qc-11", entityLabel: "בדיקת איכות פרופיל", status: "passed", risk: "none" },
    { module: "qc", entityType: "qc_inspection", entityId: "qc-12", entityLabel: "בדיקת זיגוג", status: "failed", risk: "high" },

    // Logistics
    { module: "logistics", entityType: "delivery", entityId: "del-701", entityLabel: "משלוח אלקו", status: "scheduled", risk: "none" },
    { module: "logistics", entityType: "delivery", entityId: "del-702", entityLabel: "משלוח פניקס", status: "delayed", risk: "medium" },

    // Installations
    { module: "installations", entityType: "installation", entityId: "inst-901", entityLabel: "התקנה אלקו מגדל", status: "scheduled", risk: "low", progress: 0 },
    { module: "installations", entityType: "installation", entityId: "inst-902", entityLabel: "התקנה פניקס", status: "in_progress", risk: "none", progress: 70 },

    // Service
    { module: "service", entityType: "service_ticket", entityId: "tkt-501", entityLabel: "תקלה — דלת נתקעת", status: "open", risk: "low" },
    { module: "service", entityType: "service_ticket", entityId: "tkt-502", entityLabel: "תקלה — דליפת מים VIP", status: "open", risk: "high" },

    // Billing
    { module: "billing", entityType: "invoice", entityId: "inv-3030", entityLabel: "חשבונית אלקו 3030", status: "sent", risk: "none", value: 125000 },
    { module: "billing", entityType: "invoice", entityId: "inv-3031", entityLabel: "חשבונית פניקס", status: "overdue", risk: "high", value: 85000 },

    // Payments
    { module: "payments", entityType: "payment", entityId: "pay-7701", entityLabel: "תקבול אלקו", status: "received", risk: "none", value: 125000 },
    { module: "payments", entityType: "payment", entityId: "pay-7702", entityLabel: "תקבול פניקס", status: "overdue", risk: "high", value: 85000 },

    // Cashflow
    { module: "cashflow", entityType: "cashflow_bucket", entityId: "cf-week-16", entityLabel: "תזרים שבוע 16", status: "positive", risk: "low", value: 320000 },
    { module: "cashflow", entityType: "cashflow_bucket", entityId: "cf-week-17", entityLabel: "תזרים שבוע 17", status: "tight", risk: "medium", value: 180000 },

    // HR
    { module: "hr", entityType: "employee", entityId: "emp-12", entityLabel: "יוסי — מנהל ייצור", status: "active", risk: "none" },
    { module: "hr", entityType: "employee", entityId: "emp-13", entityLabel: "רונן — טכנאי בכיר", status: "active", risk: "none" },
    { module: "hr", entityType: "employee", entityId: "emp-14", entityLabel: "מיכל — רכש", status: "on_leave", risk: "low" },

    // AI
    { module: "ai", entityType: "ai_agent", entityId: "agent-1", entityLabel: "סוכן החלטות", status: "active", risk: "none" },
    { module: "ai", entityType: "ai_agent", entityId: "agent-2", entityLabel: "סוכן תחזיות", status: "active", risk: "none" },
  ];

  for (const e of entities) {
    realtimePlatform.State.upsert({
      entityType: e.entityType,
      entityId: e.entityId,
      entityLabel: e.entityLabel,
      module: e.module,
      currentStatus: e.status,
      riskLevel: e.risk,
      value: e.value,
      progress: e.progress,
      state: {
        status: e.status,
        label: e.entityLabel,
        value: e.value,
        progress: e.progress,
      },
    });
  }

  // Publish a few seed events to populate the event feed
  const now = Date.now();
  const seedEvents: Array<{ type: string; module: ModuleKey; entityType: string; entityId: string; label: string; severity: "info" | "success" | "warning" | "critical"; offsetMs: number }> = [
    { type: "lead.created", module: "crm", entityType: "lead", entityId: "lead-501", label: "ליד — מרכז מסחרי חיפה", severity: "info", offsetMs: -600_000 },
    { type: "quote.sent", module: "quotes", entityType: "quote", entityId: "quo-8801", label: "הצעה אלקו Q4", severity: "success", offsetMs: -540_000 },
    { type: "quote.expiring", module: "quotes", entityType: "quote", entityId: "quo-8803", label: "הצעה בשינוי", severity: "warning", offsetMs: -420_000 },
    { type: "order.created", module: "orders", entityType: "order", entityId: "ord-4400", label: "הזמנה #4400 אלקו", severity: "success", offsetMs: -380_000 },
    { type: "supplier.delivery.late", module: "suppliers", entityType: "supplier", entityId: "sup-101", label: "Hydro Aluminium", severity: "warning", offsetMs: -300_000 },
    { type: "stock.low", module: "inventory", entityType: "stock_item", entityId: "sku-5500", label: "פרופיל אלומיניום 6060", severity: "warning", offsetMs: -240_000 },
    { type: "stock.critical", module: "inventory", entityType: "stock_item", entityId: "sku-5502", label: "ידיות דלת", severity: "critical", offsetMs: -180_000 },
    { type: "project.risk.high", module: "projects", entityType: "project", entityId: "proj-79", label: "מעטפת זכוכית", severity: "critical", offsetMs: -120_000 },
    { type: "invoice.overdue", module: "billing", entityType: "invoice", entityId: "inv-3031", label: "חשבונית פניקס", severity: "warning", offsetMs: -60_000 },
    { type: "incident.opened", module: "service", entityType: "service_ticket", entityId: "tkt-502", label: "תקלה VIP", severity: "critical", offsetMs: -30_000 },
  ];

  for (const se of seedEvents) {
    realtimePlatform.publish({
      eventType: se.type,
      sourceModule: se.module,
      entityType: se.entityType,
      entityId: se.entityId,
      entityLabel: se.label,
      severity: se.severity,
      newState: { status: "triggered" },
      occurredAt: new Date(now + se.offsetMs),
    });
  }
}

// ════════════════════════════════════════════════════════════════
// INITIAL KPIs
// ════════════════════════════════════════════════════════════════

function registerInitialKpis() {
  const kpis: Array<{
    key: string; label: string; category: string; unit: string;
    current: number; target?: number; warning?: number; critical?: number;
  }> = [
    { key: "sales.mtd", label: "מכירות החודש", category: "sales", unit: "currency", current: 1_240_000, target: 1_500_000 },
    { key: "sales.pipeline", label: "פייפליין פתוח", category: "sales", unit: "currency", current: 3_800_000 },
    { key: "orders.open", label: "הזמנות פתוחות", category: "operations", unit: "count", current: 47 },
    { key: "quotes.pending", label: "הצעות ממתינות", category: "sales", unit: "count", current: 23 },
    { key: "projects.active", label: "פרויקטים פעילים", category: "operations", unit: "count", current: 18 },
    { key: "projects.at_risk", label: "פרויקטים בסיכון", category: "risk", unit: "count", current: 3, warning: 2, critical: 5 },
    { key: "production.oee", label: "OEE ייצור", category: "operations", unit: "percent", current: 82, target: 85 },
    { key: "inventory.stockouts", label: "חוסרי מלאי", category: "inventory", unit: "count", current: 2, warning: 1, critical: 5 },
    { key: "inventory.value", label: "ערך מלאי", category: "inventory", unit: "currency", current: 2_450_000 },
    { key: "cashflow.30d", label: "תזרים 30 יום", category: "finance", unit: "currency", current: 640_000 },
    { key: "ar.overdue", label: "גבייה באיחור", category: "finance", unit: "currency", current: 185_000, warning: 150_000, critical: 300_000 },
    { key: "ar.dso", label: "DSO (ימי גבייה)", category: "finance", unit: "days", current: 42, target: 35, warning: 45 },
    { key: "service.open", label: "קריאות שירות פתוחות", category: "service", unit: "count", current: 12 },
    { key: "service.sla.breach", label: "הפרות SLA", category: "service", unit: "count", current: 1, warning: 0, critical: 3 },
    { key: "hr.utilization", label: "ניצולת עובדים", category: "operations", unit: "percent", current: 78, target: 80 },
    { key: "decisions.pending", label: "החלטות ממתינות", category: "ai", unit: "count", current: 0 },
    { key: "ai.effectiveness", label: "אפקטיביות AI", category: "ai", unit: "percent", current: 85 },
  ];

  for (const k of kpis) {
    realtimePlatform.KPIs.set({
      kpiKey: k.key,
      kpiLabel: k.label,
      kpiCategory: k.category,
      unit: k.unit,
      currentValue: k.current,
      target: k.target,
      warningThreshold: k.warning,
      criticalThreshold: k.critical,
    });
  }
}

// ════════════════════════════════════════════════════════════════
// HEARTBEAT SIMULATOR — generates periodic events to keep the picture live
// ════════════════════════════════════════════════════════════════

function startHeartbeatSimulator() {
  const eventTypes: Array<{
    type: string; module: ModuleKey; entityType: string; entityId: string; label: string; severity: "info" | "success" | "warning" | "critical";
  }> = [
    { type: "stock.checked", module: "inventory", entityType: "stock_item", entityId: "sku-5501", label: "זכוכית 6mm", severity: "info" },
    { type: "production.heartbeat", module: "production", entityType: "production_line", entityId: "line-A", label: "קו ייצור A", severity: "info" },
    { type: "delivery.enroute", module: "logistics", entityType: "delivery", entityId: "del-701", label: "משלוח אלקו", severity: "info" },
    { type: "cashflow.update", module: "cashflow", entityType: "cashflow_bucket", entityId: "cf-week-16", label: "תזרים שבוע 16", severity: "info" },
    { type: "ai.recommendation.created", module: "ai", entityType: "ai_agent", entityId: "agent-1", label: "סוכן החלטות", severity: "info" },
  ];

  let idx = 0;
  setInterval(() => {
    const ev = eventTypes[idx % eventTypes.length]!;
    realtimePlatform.publish({
      eventType: ev.type,
      sourceModule: ev.module,
      entityType: ev.entityType,
      entityId: ev.entityId,
      entityLabel: ev.label,
      severity: ev.severity,
      newState: { status: "heartbeat" },
    });
    idx++;
  }, 15_000).unref?.();
}
