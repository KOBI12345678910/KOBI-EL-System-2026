// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 9
// FINANCIAL & STRATEGIC INTELLIGENCE
// Profitability · Cash Predictor · MultiCurrency · What-If · Negotiation · Compliance
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");
const fs = require("fs");

["profitability", "cashpredict", "currency", "whatif", "negotiation", "compliance"].forEach(d => {
  const p = path.join(CONFIG.DIR, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ═══════════════════════════════════════
// PROFITABILITY ENGINE — Real per-project margin
// ═══════════════════════════════════════

class ProfitabilityEngine {
  constructor(brain, memory, modules) {
    this.brain = brain;
    this.memory = memory;
    this.modules = modules; // { erp, hr, finance }
    this.file = path.join(CONFIG.DIR, "profitability", "state.json");
    this.data = load(this.file, {
      reports: [],
      benchmarks: {
        railing_iron:        { targetMargin: 0.35, avgHoursPerMeter: 2.5 },
        railing_aluminum:    { targetMargin: 0.38, avgHoursPerMeter: 2.0 },
        railing_glass:       { targetMargin: 0.40, avgHoursPerMeter: 3.0 },
        gate_electric_sliding: { targetMargin: 0.32, avgHoursPerMeter: 0 },
        pergola_aluminum:    { targetMargin: 0.36, avgHoursPerMeter: 3.5 },
      },
      losingProjects: [],
    });
  }
  save() { save(this.file, this.data); }

  computeProjectProfit(projectId) {
    const project = this.modules.erp?.data?.projects?.find(p => p.id === projectId);
    if (!project) return null;

    // Real costs
    const materials = project.costs?.actualMaterials || project.costs?.estimatedMaterials || 0;
    const labor = project.costs?.actualLabor || project.costs?.estimatedLabor || 0;
    const overhead = project.costs?.actualOverhead || project.costs?.estimatedOverhead || 0;
    const totalCost = materials + labor + overhead;

    // Revenue
    const revenue = project.costs?.afterDiscount || project.costs?.quoted || 0;
    const profit = revenue - totalCost;
    const marginPercent = revenue > 0 ? profit / revenue : 0;

    const benchmark = this.data.benchmarks[project.type];
    const meetsBenchmark = benchmark ? marginPercent >= benchmark.targetMargin : null;

    const report = {
      id: uid(),
      projectId: project.id,
      projectName: project.name,
      type: project.type,
      revenue, materials, labor, overhead, totalCost,
      profit, marginPercent: Number(marginPercent.toFixed(3)),
      benchmark: benchmark?.targetMargin || null,
      meetsBenchmark,
      status: profit >= 0 ? "profitable" : "loss",
      createdAt: now(),
    };

    this.data.reports.push(report);
    this.data.reports = this.data.reports.slice(-500);

    if (profit < 0) {
      this.data.losingProjects.push(report);
      this.memory.add("mistakes", { type: "losing_project", projectId: project.id, loss: -profit });
      log("PROFIT", `❌ הפסד: ${project.name} — ₪${shekel(-profit)}`, "ERROR");
    } else if (benchmark && marginPercent < benchmark.targetMargin) {
      log("PROFIT", `⚠️  מרווח נמוך: ${project.name} — ${(marginPercent * 100).toFixed(1)}% (יעד ${(benchmark.targetMargin * 100).toFixed(0)}%)`, "WARN");
    }

    this.save();
    return report;
  }

  getAverageMarginByType() {
    const byType = {};
    for (const r of this.data.reports) {
      if (!byType[r.type]) byType[r.type] = { count: 0, totalMargin: 0 };
      byType[r.type].count++;
      byType[r.type].totalMargin += r.marginPercent;
    }
    const result = {};
    for (const [k, v] of Object.entries(byType)) {
      result[k] = v.count > 0 ? Number((v.totalMargin / v.count).toFixed(3)) : 0;
    }
    return result;
  }

  getWorstProjects(limit = 10) {
    return [...this.data.reports]
      .sort((a, b) => a.marginPercent - b.marginPercent)
      .slice(0, limit);
  }
}

// ═══════════════════════════════════════
// CASH COLLECTION PREDICTOR — When will each customer pay?
// ═══════════════════════════════════════

class CashCollectionPredictor {
  constructor(brain, memory, finance) {
    this.brain = brain;
    this.memory = memory;
    this.finance = finance;
    this.file = path.join(CONFIG.DIR, "cashpredict", "state.json");
    this.data = load(this.file, {
      customerProfiles: {},
      forecasts: [],
    });
  }
  save() { save(this.file, this.data); }

  updateCustomerProfile(customerName, paymentDays) {
    if (!this.data.customerProfiles[customerName]) {
      this.data.customerProfiles[customerName] = { payments: [], avgDaysToPayment: 30, reliability: "unknown" };
    }
    const p = this.data.customerProfiles[customerName];
    p.payments.push({ days: paymentDays, t: now() });
    p.payments = p.payments.slice(-20);
    p.avgDaysToPayment = Math.round(p.payments.reduce((s, x) => s + x.days, 0) / p.payments.length);

    if (p.avgDaysToPayment <= 15) p.reliability = "excellent";
    else if (p.avgDaysToPayment <= 30) p.reliability = "good";
    else if (p.avgDaysToPayment <= 60) p.reliability = "average";
    else p.reliability = "poor";

    this.save();
    return p;
  }

  predictCashflow(daysAhead = 90) {
    const invoices = this.finance?.data?.invoices?.filter(i => i.status !== "paid" && i.status !== "cancelled") || [];

    const forecast = {
      days: daysAhead,
      totalExpected: 0,
      byWeek: {},
      byCustomer: [],
      generatedAt: now(),
    };

    for (const inv of invoices) {
      const profile = this.data.customerProfiles[inv.customerName] || { avgDaysToPayment: 30 };
      const dueDate = new Date(inv.dueDate);
      const expectedDate = new Date(dueDate.getTime() + (profile.avgDaysToPayment - 30) * 86400000);

      const daysFromNow = Math.ceil((expectedDate.getTime() - Date.now()) / 86400000);
      if (daysFromNow > daysAhead) continue;

      const weekNum = Math.max(0, Math.ceil(daysFromNow / 7));
      if (!forecast.byWeek[`week${weekNum}`]) forecast.byWeek[`week${weekNum}`] = 0;
      forecast.byWeek[`week${weekNum}`] += inv.total || 0;
      forecast.totalExpected += inv.total || 0;

      forecast.byCustomer.push({
        customer: inv.customerName,
        amount: inv.total,
        invoiceNumber: inv.number,
        expectedDate: expectedDate.toISOString().split("T")[0],
        confidence: profile.payments?.length >= 3 ? 0.85 : 0.5,
      });
    }

    this.data.forecasts.push(forecast);
    this.data.forecasts = this.data.forecasts.slice(-50);
    this.save();
    log("CASH-PRED", `💰 חיזוי תזרים ${daysAhead} ימים: ₪${shekel(forecast.totalExpected)}`);
    return forecast;
  }
}

// ═══════════════════════════════════════
// MULTI-CURRENCY — USD/EUR/GBP for international RE
// ═══════════════════════════════════════

class MultiCurrency {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "currency", "state.json");
    this.data = load(this.file, {
      base: "ILS",
      rates: {
        ILS: 1.00,
        USD: 0.272,    // 1 ILS = 0.272 USD (~3.68 ILS/USD)
        EUR: 0.250,    // 1 ILS = 0.250 EUR (~4.00 ILS/EUR)
        GBP: 0.215,    // 1 ILS = 0.215 GBP
        CHF: 0.245,
      },
      lastUpdated: now(),
      history: [],
    });
  }
  save() { save(this.file, this.data); }

  convert(amountAgorot, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amountAgorot;
    const fromRate = this.data.rates[fromCurrency];
    const toRate = this.data.rates[toCurrency];
    if (!fromRate || !toRate) return null;

    // Convert via base (ILS)
    const inBaseAgorot = Math.round(amountAgorot / fromRate);
    return Math.round(inBaseAgorot * toRate);
  }

  formatPrice(amountAgorot, currency = "ILS") {
    const symbols = { ILS: "₪", USD: "$", EUR: "€", GBP: "£", CHF: "CHF " };
    const value = (amountAgorot / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${symbols[currency] || currency}${value}`;
  }

  updateRate(currency, rateVsILS) {
    this.data.history.push({
      currency, oldRate: this.data.rates[currency],
      newRate: rateVsILS, t: now(),
    });
    this.data.history = this.data.history.slice(-200);
    this.data.rates[currency] = rateVsILS;
    this.data.lastUpdated = now();
    this.save();
    log("CURRENCY", `💱 ${currency} updated: 1 ILS = ${rateVsILS} ${currency}`);
  }

  getMultiCurrencyPrice(amountAgorot, baseCurrency = "ILS") {
    const result = {};
    for (const cur of Object.keys(this.data.rates)) {
      const converted = this.convert(amountAgorot, baseCurrency, cur);
      result[cur] = { amount: converted, formatted: this.formatPrice(converted, cur) };
    }
    return result;
  }
}

// ═══════════════════════════════════════
// WHAT-IF SIMULATOR — Scenario modeling
// ═══════════════════════════════════════

class WhatIfSimulator {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "whatif", "state.json");
    this.data = load(this.file, { simulations: [] });
  }
  save() { save(this.file, this.data); }

  async simulate(scenario, currentState) {
    log("WHAT-IF", `🔮 סימולציה: ${scenario.substring(0, 60)}...`);

    const result = await this.brain.thinkJSON(`
אתה What-If Simulator של טכנו כל עוזי + קובי אלקיים נדל"ן.
מודל את התרחיש המוצע.

═══ מצב נוכחי ═══
${JSON.stringify(currentState, null, 2)}

═══ תרחיש לסימולציה ═══
${scenario}

נתח השפעות בכל המישורים:
1. השפעה כלכלית (הכנסות, הוצאות, רווח, תזרים)
2. השפעה תפעולית (קיבולת, איכות, זמני אספקה)
3. השפעה על אנשים (עובדים, מורל, גיוס)
4. השפעה על לקוחות (שביעות רצון, שימור)
5. השפעה תחרותית (מיצוב, מתחרים)
6. סיכונים נסתרים
7. הזדמנויות נלוות

תחזיר JSON:
{
  "scenarioSummary": "תקציר",
  "feasibility": 0.0-1.0,
  "impactsByDomain": {
    "financial": {"revenue": 0, "expenses": 0, "profit": 0, "margin": 0, "cashflow": "...", "details": "..."},
    "operational": {"capacity": "...", "delivery": "...", "quality": "...", "details": "..."},
    "people": {"morale": "...", "hiring": 0, "training": "...", "details": "..."},
    "customer": {"satisfaction": "...", "retention": "...", "newAcquisition": 0, "details": "..."},
    "competitive": {"position": "...", "competitorReaction": "...", "details": "..."}
  },
  "shortTermImpact": "0-3 חודשים",
  "mediumTermImpact": "3-12 חודשים",
  "longTermImpact": "1-3 שנים",
  "risks": [{"risk": "...", "probability": 0.0-1.0, "mitigation": "..."}],
  "hiddenOpportunities": ["..."],
  "implementationCost": 0,
  "expectedROI": 0,
  "paybackPeriodMonths": 0,
  "recommendation": "do_it/dont_do_it/modify_first/wait_and_see",
  "modifications": ["שינוי 1"],
  "successConditions": ["תנאי 1"],
  "failureScenarios": ["..."],
  "confidence": 0.0-1.0
}`);

    if (result) {
      const sim = { id: `SIM-${uid()}`, scenario, result, t: now() };
      this.data.simulations.push(sim);
      this.data.simulations = this.data.simulations.slice(-100);
      this.save();
      log("WHAT-IF", `🔮 המלצה: ${result.recommendation} (ROI ${result.expectedROI}%, payback ${result.paybackPeriodMonths}m)`);
    }
    return result;
  }
}

// ═══════════════════════════════════════
// SUPPLIER NEGOTIATION AI — Strategic vendor management
// ═══════════════════════════════════════

class SupplierNegotiationAI {
  constructor(brain, memory, erp) {
    this.brain = brain;
    this.memory = memory;
    this.erp = erp;
    this.file = path.join(CONFIG.DIR, "negotiation", "state.json");
    this.data = load(this.file, {
      analyses: [],
      strategies: [],
      negotiationHistory: [],
    });
  }
  save() { save(this.file, this.data); }

  async analyzeSupplier(supplierId) {
    const supplier = this.erp?.data?.suppliers?.find(s => s.id === supplierId);
    if (!supplier) return null;

    const ourPOs = this.erp.data.purchaseOrders.filter(p => p.supplierId === supplierId);
    const totalValue = ourPOs.reduce((s, p) => s + (p.total || 0), 0);

    const analysis = await this.brain.thinkJSON(`
אתה מומחה רכש של טכנו כל עוזי. נתח את הספק והמלץ על אסטרטגיית מו"מ.

═══ הספק ═══
שם: ${supplier.name}
ותק: ${daysAgo(supplier.createdAt)} ימים
דירוג: ${supplier.rating || 3}/5
תנאי תשלום: ${supplier.paymentTerms}
זמן אספקה: ${supplier.leadTimeDays} ימים
ביצועים: ${JSON.stringify(supplier.performance)}

═══ העבודה איתו ═══
מספר הזמנות: ${ourPOs.length}
ערך כולל: ₪${shekel(totalValue)}
ממוצע להזמנה: ₪${shekel(ourPOs.length > 0 ? Math.round(totalValue / ourPOs.length) : 0)}

תחזיר JSON:
{
  "supplierTier": "strategic/preferred/transactional/probation",
  "negotiatingPower": "high/medium/low",
  "leverage": ["נקודת מנוף 1"],
  "vulnerabilities": ["נקודת חולשה שלהם"],
  "recommendedApproach": "collaborative/competitive/integrative",
  "primaryAsks": [{"ask": "...", "priority": 0, "expectedAnswer": "..."}],
  "concessionsToOffer": ["ויתור 1"],
  "redLines": ["קו אדום שלא חוצים"],
  "alternativeSuppliers": [{"name": "...", "advantage": "..."}],
  "expectedSavings": 0,
  "expectedSavingsPercent": 0,
  "negotiationScript": "פתיחה / טיעון מרכזי / סגירה",
  "timing": "now/end_of_quarter/contract_renewal",
  "successProbability": 0.0-1.0,
  "fallbackPlan": "אם המו\\"מ נכשל"
}`);

    if (analysis) {
      this.data.analyses.push({
        supplierId, supplierName: supplier.name,
        analysis, t: now(),
      });
      this.data.analyses = this.data.analyses.slice(-100);
      this.save();
      log("NEGOTIATE", `🤝 ${supplier.name}: ${analysis.recommendedApproach} (חיסכון צפוי ${analysis.expectedSavingsPercent}%)`);
    }
    return analysis;
  }
}

// ═══════════════════════════════════════
// COMPLIANCE MODULE — Israeli regulations + business licenses
// ═══════════════════════════════════════

class ComplianceModule {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "compliance", "state.json");
    this.data = load(this.file, {
      requirements: [
        { id: "r1", name: "רישיון עסק", category: "license", authority: "עיריית תל אביב", status: "active", expiresAt: "2026-12-31", renewalDeadlineDays: 60 },
        { id: "r2", name: "ביטוח אחריות מקצועית", category: "insurance", authority: "מגדל ביטוח", status: "active", expiresAt: "2026-08-31", renewalDeadlineDays: 30, coverage: agorot(500000000) },
        { id: "r3", name: "ביטוח רכב מסחרי", category: "insurance", authority: "כלל ביטוח", status: "active", expiresAt: "2026-10-15", renewalDeadlineDays: 30 },
        { id: "r4", name: "אישור ת\"י 1142 — מעקות", category: "standard", authority: "מכון התקנים", status: "active", expiresAt: "2027-03-01", renewalDeadlineDays: 90 },
        { id: "r5", name: "אישור ת\"י 1201 — שערים חשמליים", category: "standard", authority: "מכון התקנים", status: "active", expiresAt: "2027-05-15", renewalDeadlineDays: 90 },
        { id: "r6", name: "בדיקת בטיחות שנתית במפעל", category: "safety", authority: "משרד העבודה", status: "active", expiresAt: "2026-09-01", renewalDeadlineDays: 30 },
        { id: "r7", name: "אישור הולכת חומרים מסוכנים (צבעים)", category: "permit", authority: "המשרד להגנת הסביבה", status: "active", expiresAt: "2026-11-30", renewalDeadlineDays: 45 },
        { id: "r8", name: "רישיון מלגזה לעובדים", category: "training", authority: "משרד העבודה", status: "active", expiresAt: "2026-07-20", renewalDeadlineDays: 30 },
        { id: "r9", name: "אישור מעסיק לפיצויים (סעיף 14)", category: "hr", authority: "משרד הכלכלה", status: "active", expiresAt: "2027-12-31", renewalDeadlineDays: 60 },
        { id: "r10", name: "דוח שנתי למשרדי ממשלה", category: "reporting", authority: "רשות המסים", status: "active", expiresAt: "2026-04-30", renewalDeadlineDays: 14 },
      ],
      audits: [],
      violations: [],
    });
  }
  save() { save(this.file, this.data); }

  checkExpirations() {
    const now_ = Date.now();
    const upcoming = [];

    for (const req of this.data.requirements) {
      if (req.status !== "active") continue;
      const expiresAt = new Date(req.expiresAt).getTime();
      const daysToExpiry = Math.ceil((expiresAt - now_) / 86400000);

      if (daysToExpiry < 0) {
        req.status = "expired";
        upcoming.push({ ...req, daysToExpiry, severity: "critical" });
        log("COMPLIANCE", `🚨 פג תוקף: ${req.name}`, "ERROR");
        this.memory.add("alerts", { type: "compliance_expired", requirement: req.name });
      } else if (daysToExpiry <= req.renewalDeadlineDays) {
        upcoming.push({ ...req, daysToExpiry, severity: daysToExpiry <= 7 ? "high" : "medium" });
        if (daysToExpiry <= 7) {
          log("COMPLIANCE", `⚠️  ${req.name}: ${daysToExpiry} ימים לפג תוקף`, "WARN");
        }
      }
    }

    this.save();
    return upcoming;
  }

  recordAudit(data) {
    const audit = {
      id: `AUDIT-${uid()}`,
      type: data.type,
      authority: data.authority,
      auditor: data.auditor,
      date: data.date || today(),
      result: data.result || "pending", // pass, fail, conditional
      findings: data.findings || [],
      correctiveActions: data.correctiveActions || [],
      nextAuditDate: data.nextAuditDate || null,
      createdAt: now(),
    };
    this.data.audits.push(audit);
    this.save();
    log("COMPLIANCE", `📋 ביקורת ${audit.type}: ${audit.result}`);
    return audit;
  }

  recordViolation(data) {
    const v = {
      id: uid(),
      type: data.type,
      severity: data.severity || "medium",
      description: data.description,
      regulation: data.regulation,
      reportedBy: data.reportedBy,
      status: "open",
      correctiveAction: null,
      fineAmount: data.fineAmount || 0,
      createdAt: now(),
    };
    this.data.violations.push(v);
    this.memory.add("mistakes", { type: "compliance_violation", description: data.description });
    this.save();
    log("COMPLIANCE", `🚨 הפרה: ${v.description}`, "ERROR");
    return v;
  }

  getComplianceScore() {
    const total = this.data.requirements.length;
    const active = this.data.requirements.filter(r => r.status === "active").length;
    const openViolations = this.data.violations.filter(v => v.status === "open").length;
    const score = Math.round((active / total) * 100) - (openViolations * 10);
    return clamp(score, 0, 100);
  }
}

// ═══════════════════════════════════════
// EXPORT PART 9
// ═══════════════════════════════════════

module.exports = {
  ProfitabilityEngine,
  CashCollectionPredictor,
  MultiCurrency,
  WhatIfSimulator,
  SupplierNegotiationAI,
  ComplianceModule,
};
