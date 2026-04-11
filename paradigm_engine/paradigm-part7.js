// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 7
// AUTOMATION WORKFLOWS — Auto-Quote · Smart Scheduler · Payment Chaser ·
// SLA Monitor · Cross-Sell · Warranty Proactive · Auto-Purchase · Review Collector
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");
const fs = require("fs");

["automation", "schedules", "sla"].forEach(d => {
  const p = path.join(CONFIG.DIR, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ═══════════════════════════════════════
// AUTOMATION ENGINE — Workflow Orchestration
// Auto-Quote · Auto-Purchase · Payment Chaser · Review Collector
// ═══════════════════════════════════════

class AutomationEngine {
  constructor(brain, memory, modules) {
    this.brain = brain;
    this.memory = memory;
    this.modules = modules; // { erp, crm, bom, finance, pricing, integrations, notifications }
    this.file = path.join(CONFIG.DIR, "automation", "state.json");
    this.data = load(this.file, {
      workflows: [],
      executions: [],
      rules: {
        autoQuote:      { enabled: true, maxAmount: agorot(50000), responseTimeMinutes: 5 },
        autoPurchase:   { enabled: true, maxAmount: agorot(20000), requiresApprovalAbove: agorot(50000) },
        paymentChaser:  { enabled: true, day1: "sms", day7: "whatsapp", day14: "email_formal", day30: "legal_notice" },
        reviewCollector:{ enabled: true, delayDays: 7, channels: ["whatsapp", "email"] },
      },
      stats: { quotes: 0, purchases: 0, chases: 0, reviews: 0 },
    });
  }
  save() { save(this.file, this.data); }

  // ── AUTO-QUOTE: Lead → BOM → Quote → WhatsApp in under 5 minutes ──
  async autoQuoteFromLead(leadId) {
    if (!this.data.rules.autoQuote.enabled) return null;
    const lead = this.modules.crm?.data?.leads?.find(l => l.id === leadId);
    if (!lead || !lead.projectType) {
      log("AUTOMATE", `❌ AutoQuote: ליד לא נמצא או חסר projectType`, "WARN");
      return null;
    }

    const meters = lead.estimatedMeters || 5;
    const quote = await this.modules.pricing?.generateQuote({
      leadId: lead.id,
      customerName: lead.name,
      customerPhone: lead.phone,
      customerEmail: lead.email,
      customerAddress: lead.city || lead.address,
      projectType: lead.projectType,
      meters,
    });

    if (!quote) return null;

    // Block if above threshold (requires manual review)
    if (quote.total > this.data.rules.autoQuote.maxAmount) {
      log("AUTOMATE", `⚠️  AutoQuote: ${quote.id} מעל הסף — נדרש אישור ידני`, "WARN");
      this.modules.notifications?.notify({
        level: "warning",
        title: "הצעת מחיר אוטומטית מעל הסף",
        message: `${quote.id} — ₪${shekel(quote.total)} ל-${lead.name}. נדרש אישור.`,
        target: "קובי", actionRequired: true,
      });
      return { quote, status: "pending_approval" };
    }

    // Send via WhatsApp
    const message = `שלום ${lead.name}, הצעת מחיר עבור ${lead.projectType}: ₪${shekel(quote.total)} (כולל מע"מ). תקפה ל-14 ימים. לאישור: השב כן.`;
    await this.modules.integrations?.sendWhatsApp(lead.phone, message);

    this.data.stats.quotes++;
    this.recordExecution("auto_quote", { leadId, quoteId: quote.id, amount: quote.total });
    log("AUTOMATE", `⚡ AutoQuote: ${quote.id} → ${lead.name} (${lead.phone})`, "SUCCESS");
    return { quote, status: "sent" };
  }

  // ── AUTO-PURCHASE: Inventory below min → PO to cheapest supplier ──
  async autoPurchaseLowStock() {
    if (!this.data.rules.autoPurchase.enabled) return [];
    const lowStock = this.modules.erp?.getLowStockItems?.() || [];
    const orders = [];

    for (const item of lowStock) {
      if (!item.supplier) continue;
      const supplier = this.modules.erp.data.suppliers.find(s => s.name === item.supplier || s.id === item.supplier);
      if (!supplier) continue;

      const reorderQty = item.reorderQty || (item.maxQty - item.qty) || 50;
      const estimatedCost = reorderQty * (item.avgCost || item.costPerUnit || 0);

      // Skip if above auto-approval threshold
      if (estimatedCost > this.data.rules.autoPurchase.maxAmount) {
        log("AUTOMATE", `⚠️  AutoPurchase: ${item.name} מעל הסף — נדרש אישור`, "WARN");
        this.modules.notifications?.notify({
          level: "warning",
          title: "הזמנת רכש אוטומטית מעל הסף",
          message: `${item.name} × ${reorderQty} = ₪${shekel(estimatedCost)}`,
          target: "דימה", actionRequired: true,
        });
        continue;
      }

      const po = this.modules.erp.createPO({
        supplierId: supplier.id,
        supplierName: supplier.name,
        items: [{ inventoryItemId: item.id, name: item.name, qty: reorderQty, unit: item.unit, unitPrice: item.avgCost || item.costPerUnit }],
        urgency: item.qty <= 0 ? "urgent" : "normal",
        notes: `נוצר אוטומטית — מלאי ${item.qty}/${item.minQty}`,
      });

      this.modules.erp.approvePO(po.id, "auto_purchase_engine");
      this.modules.erp.sendPO(po.id);
      orders.push(po);
      this.data.stats.purchases++;
      this.recordExecution("auto_purchase", { itemId: item.id, poId: po.id, qty: reorderQty });
      log("AUTOMATE", `🛒 AutoPurchase: ${item.name} × ${reorderQty} מ-${supplier.name}`, "SUCCESS");
    }

    return orders;
  }

  // ── PAYMENT CHASER: Multi-stage dunning ──
  async runPaymentChaser() {
    if (!this.data.rules.paymentChaser.enabled) return [];
    const overdue = this.modules.finance?.getOverdueInvoices?.() || [];
    const actions = [];

    for (const inv of overdue) {
      const days = daysAgo(inv.dueDate + "T00:00:00Z");
      let action = null;

      if (days >= 30) action = { type: "legal_notice", channel: "email_formal", message: `התראה משפטית: חשבונית ${inv.number} באיחור של ${days} ימים. ₪${shekel(inv.total)}.` };
      else if (days >= 14) action = { type: "formal_email", channel: "email", message: `שלום ${inv.customerName}, חשבונית ${inv.number} באיחור של ${days} ימים. אנא הסדר תשלום.` };
      else if (days >= 7) action = { type: "whatsapp_reminder", channel: "whatsapp", message: `שלום ${inv.customerName}, תזכורת ידידותית: חשבונית ${inv.number} (₪${shekel(inv.total)}) באיחור.` };
      else if (days >= 1) action = { type: "sms_reminder", channel: "sms", message: `תזכורת: חשבונית ${inv.number} ע"ס ₪${shekel(inv.total)} ממתינה לתשלום.` };

      if (!action) continue;

      // Send via correct channel
      if (action.channel === "whatsapp") await this.modules.integrations?.sendWhatsApp(inv.customer?.phone || "", action.message);
      else if (action.channel === "sms") await this.modules.integrations?.sendSMS(inv.customer?.phone || "", action.message);
      else if (action.channel.startsWith("email")) await this.modules.integrations?.sendEmail(inv.customer?.email || "", `חשבונית ${inv.number}`, action.message);

      this.data.stats.chases++;
      this.recordExecution("payment_chase", { invoiceId: inv.id, days, action: action.type });
      actions.push({ invoice: inv.number, days, ...action });

      if (days >= 30) {
        this.modules.notifications?.notify({
          level: "critical",
          title: "חוב באיחור 30+ יום",
          message: `${inv.customerName} — ₪${shekel(inv.total)} (${days} ימים)`,
          target: "קובי", actionRequired: true,
        });
      }
    }

    return actions;
  }

  // ── REVIEW COLLECTOR: After completed installation → ask for Google review ──
  async collectReviews() {
    if (!this.data.rules.reviewCollector.enabled) return [];
    const installations = this.modules.ops?.data?.installations?.filter(i => i.status === "completed") || [];
    const reviewsToAsk = [];
    const delayMs = this.data.rules.reviewCollector.delayDays * 86400000;

    for (const inst of installations) {
      if (inst.reviewRequested) continue;
      if (!inst.completedAt) continue;
      if (Date.now() - new Date(inst.completedAt).getTime() < delayMs) continue;

      const reviewLink = "https://g.page/r/techno-kol-uzi/review"; // placeholder
      const message = `שלום ${inst.customerName}, חלפו ${this.data.rules.reviewCollector.delayDays} ימים מההתקנה. נשמח אם תוכל להשאיר ביקורת ב-Google: ${reviewLink}. תודה!`;

      await this.modules.integrations?.sendWhatsApp(inst.phone || "", message);
      inst.reviewRequested = true;
      inst.reviewRequestedAt = now();
      this.data.stats.reviews++;
      reviewsToAsk.push({ customer: inst.customerName, channel: "whatsapp" });
      this.recordExecution("review_request", { installationId: inst.id });
    }

    if (this.modules.ops) this.modules.ops.save();
    return reviewsToAsk;
  }

  recordExecution(type, payload) {
    this.data.executions.push({ id: uid(), type, payload, t: now() });
    this.data.executions = this.data.executions.slice(-500);
    this.save();
  }

  async runAll() {
    const results = {};
    try { results.purchases = await this.autoPurchaseLowStock(); } catch (e) { results.purchases = { error: e.message }; }
    try { results.chases = await this.runPaymentChaser(); } catch (e) { results.chases = { error: e.message }; }
    try { results.reviews = await this.collectReviews(); } catch (e) { results.reviews = { error: e.message }; }
    return results;
  }
}

// ═══════════════════════════════════════
// SMART SCHEDULER — Geographic optimization for Uzi's measurement runs
// ═══════════════════════════════════════

class SmartScheduler {
  constructor(brain, memory, ops) {
    this.brain = brain;
    this.memory = memory;
    this.ops = ops;
    this.file = path.join(CONFIG.DIR, "schedules", "smart.json");
    this.data = load(this.file, {
      cityCoords: {
        "תל אביב":     { lat: 32.0853, lng: 34.7818 },
        "רמת גן":      { lat: 32.0700, lng: 34.8235 },
        "גבעתיים":     { lat: 32.0717, lng: 34.8108 },
        "בני ברק":     { lat: 32.0838, lng: 34.8338 },
        "חולון":       { lat: 32.0117, lng: 34.7722 },
        "בת ים":       { lat: 32.0167, lng: 34.7500 },
        "הרצליה":      { lat: 32.1660, lng: 34.8430 },
        "רעננה":       { lat: 32.1853, lng: 34.8707 },
        "כפר סבא":     { lat: 32.1750, lng: 34.9070 },
        "פתח תקווה":  { lat: 32.0840, lng: 34.8878 },
        "ראשון לציון": { lat: 31.9730, lng: 34.8044 },
        "נתניה":       { lat: 32.3329, lng: 34.8597 },
        "חיפה":        { lat: 32.7940, lng: 34.9896 },
        "ירושלים":     { lat: 31.7683, lng: 35.2137 },
        "באר שבע":     { lat: 31.2520, lng: 34.7915 },
      },
      optimizedRuns: [],
    });
  }
  save() { save(this.file, this.data); }

  // Haversine distance in km
  distance(city1, city2) {
    const c1 = this.data.cityCoords[city1];
    const c2 = this.data.cityCoords[city2];
    if (!c1 || !c2) return 30; // default 30km if unknown
    const R = 6371;
    const dLat = (c2.lat - c1.lat) * Math.PI / 180;
    const dLng = (c2.lng - c1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(c1.lat * Math.PI / 180) * Math.cos(c2.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  optimizeDay(date = today(), startCity = "תל אביב") {
    const measurements = this.ops?.data?.measurements?.filter(m => m.date === date && m.status === "scheduled") || [];
    if (measurements.length === 0) return { date, route: [], totalKm: 0 };

    // Greedy nearest-neighbor route
    const route = [];
    let current = startCity;
    let totalKm = 0;
    const remaining = [...measurements];

    while (remaining.length > 0) {
      remaining.sort((a, b) => this.distance(current, a.city) - this.distance(current, b.city));
      const next = remaining.shift();
      const km = this.distance(current, next.city);
      totalKm += km;
      route.push({
        order: route.length + 1,
        time: next.time,
        customer: next.customerName,
        city: next.city,
        address: next.address,
        kmFromPrev: km,
        measurementId: next.id,
      });
      current = next.city;
    }

    // Return trip
    totalKm += this.distance(current, startCity);

    const optimized = {
      date, startCity, route, totalKm,
      estimatedDriveMinutes: Math.round(totalKm * 1.5), // ~40 km/h average urban
      estimatedFuelLiters: Math.round(totalKm * 0.08 * 10) / 10, // ~8L/100km
      estimatedFuelCost: Math.round(totalKm * 0.08 * 720), // ~₪7.20/L in agorot
      generatedAt: now(),
    };

    this.data.optimizedRuns.push(optimized);
    this.data.optimizedRuns = this.data.optimizedRuns.slice(-100);
    this.save();
    log("SCHEDULER", `🗺️  ${date}: ${route.length} מדידות · ${totalKm}ק"מ · ${optimized.estimatedDriveMinutes} דק' נסיעה · ₪${shekel(optimized.estimatedFuelCost)} דלק`);
    return optimized;
  }

  getEfficiencyScore(date = today()) {
    const run = this.data.optimizedRuns.find(r => r.date === date);
    if (!run) return null;
    const naive = run.route.length * 25; // assume 25km/visit if naive
    const efficiency = naive > 0 ? Math.max(0, 1 - (run.totalKm / naive)) : 0;
    return { date, totalKm: run.totalKm, naiveKm: naive, efficiency: Math.round(efficiency * 100) };
  }
}

// ═══════════════════════════════════════
// SLA MONITOR — Track service-level commitments
// ═══════════════════════════════════════

class SLAMonitor {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "sla", "state.json");
    this.data = load(this.file, {
      slas: [
        { id: "sla1", name: "Lead Response Time", metric: "minutes_to_first_contact", target: 120, unit: "minutes", priority: "critical" },
        { id: "sla2", name: "Quote Delivery", metric: "hours_to_quote", target: 24, unit: "hours", priority: "high" },
        { id: "sla3", name: "Project Delivery", metric: "days_to_delivery", target: 14, unit: "days", priority: "high" },
        { id: "sla4", name: "Warranty Fix Time", metric: "days_to_warranty_fix", target: 7, unit: "days", priority: "high" },
        { id: "sla5", name: "Customer Complaint Response", metric: "hours_to_complaint_response", target: 4, unit: "hours", priority: "critical" },
        { id: "sla6", name: "Invoice Sent After Delivery", metric: "days_invoice_after_delivery", target: 1, unit: "days", priority: "medium" },
      ],
      breaches: [],
      compliance: {},
    });
  }
  save() { save(this.file, this.data); }

  recordEvent(slaId, actualValue, context = {}) {
    const sla = this.data.slas.find(s => s.id === slaId);
    if (!sla) return null;

    const compliant = actualValue <= sla.target;
    const event = {
      id: uid(), slaId, slaName: sla.name,
      target: sla.target, actual: actualValue, unit: sla.unit,
      compliant, breachAmount: compliant ? 0 : actualValue - sla.target,
      context, t: now(),
    };

    if (!compliant) {
      this.data.breaches.push(event);
      this.data.breaches = this.data.breaches.slice(-200);
      log("SLA", `❌ ${sla.name}: ${actualValue}${sla.unit} (target ${sla.target}${sla.unit})`, "WARN");
      this.memory.add("alerts", { type: "sla_breach", sla: sla.name, actual: actualValue, target: sla.target });
    }

    if (!this.data.compliance[slaId]) this.data.compliance[slaId] = { total: 0, compliant: 0, rate: 1 };
    this.data.compliance[slaId].total++;
    if (compliant) this.data.compliance[slaId].compliant++;
    this.data.compliance[slaId].rate = this.data.compliance[slaId].compliant / this.data.compliance[slaId].total;

    this.save();
    return event;
  }

  getBreachRate(slaId) {
    const c = this.data.compliance[slaId];
    return c ? Math.round((1 - c.rate) * 100) : 0;
  }

  getOverallCompliance() {
    const all = Object.values(this.data.compliance);
    if (all.length === 0) return 100;
    return Math.round(all.reduce((s, c) => s + c.rate, 0) / all.length * 100);
  }
}

// ═══════════════════════════════════════
// CROSS-SELL ENGINE — Suggest related products
// ═══════════════════════════════════════

class CrossSellEngine {
  constructor(brain, memory, modules) {
    this.brain = brain;
    this.memory = memory;
    this.modules = modules;
    this.file = path.join(CONFIG.DIR, "automation", "crosssell.json");
    this.data = load(this.file, {
      affinityMap: {
        railing_iron:        ["fence_iron", "gate_entry", "bars"],
        railing_aluminum:    ["fence_iron", "gate_entry", "pergola_aluminum"],
        railing_glass:       ["pergola_aluminum", "window_aluminum", "door_iron"],
        gate_electric_sliding: ["fence_iron", "fence_decorative", "bars"],
        gate_entry:          ["fence_iron", "door_iron", "bars"],
        fence_iron:          ["gate_entry", "gate_electric_sliding", "railing_iron"],
        fence_decorative:    ["gate_entry", "pergola_aluminum"],
        pergola_aluminum:    ["railing_glass", "fence_decorative"],
        door_iron:           ["window_aluminum", "bars"],
        window_aluminum:     ["door_iron", "bars"],
        bars:                ["fence_iron", "door_iron"],
      },
      suggestions: [],
    });
  }
  save() { save(this.file, this.data); }

  suggest(customerId, currentProductType) {
    const related = this.data.affinityMap[currentProductType] || [];
    const suggestions = related.map(type => ({
      productType: type,
      reason: `לקוחות שקנו ${currentProductType} לעיתים קרובות מוסיפים גם ${type}`,
      estimatedValue: agorot(8000), // baseline placeholder
    }));

    const record = {
      id: uid(), customerId, currentProductType,
      suggestions, t: now(),
    };
    this.data.suggestions.push(record);
    this.data.suggestions = this.data.suggestions.slice(-300);
    this.save();
    return record;
  }

  async analyzeCustomerForCrossSell(customerName) {
    // Look up all projects for this customer
    const projects = this.modules.erp?.data?.projects?.filter(p => p.customer?.name === customerName) || [];
    if (projects.length === 0) return null;

    const types = [...new Set(projects.map(p => p.type))];
    const allRelated = new Set();
    for (const t of types) {
      (this.data.affinityMap[t] || []).forEach(r => {
        if (!types.includes(r)) allRelated.add(r);
      });
    }

    return {
      customer: customerName,
      currentProducts: types,
      suggestedProducts: [...allRelated],
      potentialRevenue: allRelated.size * agorot(10000),
    };
  }
}

// ═══════════════════════════════════════
// WARRANTY PROACTIVE — Annual checkup outreach
// ═══════════════════════════════════════

class WarrantyProactive {
  constructor(memory, modules) {
    this.memory = memory;
    this.modules = modules;
    this.file = path.join(CONFIG.DIR, "automation", "warranty-proactive.json");
    this.data = load(this.file, {
      checkups: [],
      stats: { sent: 0, responses: 0, issuesFound: 0, upsells: 0 },
    });
  }
  save() { save(this.file, this.data); }

  async runAnnualCheckups() {
    const warranties = this.modules.quality?.data?.warranties?.filter(w => w.status === "active") || [];
    const checkupsToRun = [];

    for (const w of warranties) {
      const startDate = new Date(w.structuralWarranty?.start || w.createdAt);
      const monthsSinceStart = (Date.now() - startDate.getTime()) / (30 * 86400000);
      const yearsSinceStart = Math.floor(monthsSinceStart / 12);

      // Check at month 11, 23, 35, etc. (annual)
      const monthInYear = Math.floor(monthsSinceStart) % 12;
      if (monthInYear !== 11) continue;

      const lastCheckup = this.data.checkups.find(c => c.warrantyId === w.id && c.year === yearsSinceStart + 1);
      if (lastCheckup) continue;

      const message = `שלום ${w.customerName}, חלפה שנה מההתקנה של ${w.productType}. נשמח לבדוק שהכל בסדר! האם נוח לנו לבוא לבדיקה שנתית חינמית?`;
      await this.modules.integrations?.sendWhatsApp(w.customerPhone || "", message);

      const checkup = {
        id: uid(),
        warrantyId: w.id,
        customerName: w.customerName,
        year: yearsSinceStart + 1,
        contactedAt: now(),
        status: "contacted",
      };
      this.data.checkups.push(checkup);
      this.data.stats.sent++;
      checkupsToRun.push(checkup);
      log("WAR-PROACTIVE", `🛡️  בדיקה שנתית: ${w.customerName} (שנה ${checkup.year})`);
    }

    this.save();
    return checkupsToRun;
  }
}

// ═══════════════════════════════════════
// EXPORT PART 7
// ═══════════════════════════════════════

module.exports = {
  AutomationEngine,
  SmartScheduler,
  SLAMonitor,
  CrossSellEngine,
  WarrantyProactive,
};
