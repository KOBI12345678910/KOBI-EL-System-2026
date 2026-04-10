// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 3/4
// PRICING + QUALITY + NOTIFICATIONS + ANALYTICS + SWARM + ADVERSARIAL
// + DREAM + META-LEARNING + GOALS
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, Brain, Memory, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");

// ═══════════════════════════════════════
// PRICING MODULE — תמחור והצעות מחיר
// ═══════════════════════════════════════

class PricingModule {
  constructor(brain, memory, bom) {
    this.brain = brain;
    this.memory = memory;
    this.bom = bom;
    this.file = path.join(CONFIG.DIR, "pricing", "state.json");
    this.data = load(this.file, {
      priceList: [],
      discountPolicies: [
        { name: "פרויקט גדול (מעל 20 מטר)", condition: "meters > 20", discount: 5, type: "percent" },
        { name: "לקוח חוזר", condition: "returning_customer", discount: 7, type: "percent" },
        { name: "הפניה מלקוח", condition: "referral", discount: 5, type: "percent" },
        { name: "תשלום מזומן/העברה מיידית", condition: "immediate_payment", discount: 3, type: "percent" },
        { name: "הזמנה משולבת (2+ מוצרים)", condition: "combo_order", discount: 8, type: "percent" },
        { name: "עונה חלשה (דצמבר-ינואר)", condition: "low_season", discount: 10, type: "percent" },
      ],
      competitorPrices: [
        { competitor: "מעקות ישראל", product: "מעקה ברזל", pricePerMeter: 75000, updated: now(), quality: "medium" },
        { competitor: "א.ב מסגרות", product: "מעקה ברזל", pricePerMeter: 65000, updated: now(), quality: "low" },
        { competitor: "פרגולות VIP", product: "פרגולה אלומיניום", pricePerMeter: 120000, updated: now(), quality: "high" },
        { competitor: "אלומיניום פלוס", product: "מעקה אלומיניום", pricePerMeter: 85000, updated: now(), quality: "medium" },
      ],
      quotes: [],
      dynamicRules: [
        { name: "High Demand Surcharge", condition: "pending_projects > 15", adjustment: 5, type: "percent_increase", active: true },
        { name: "Rush Fee", condition: "deadline < 7_days", adjustment: 15, type: "percent_increase", active: true },
        { name: "Distance Surcharge", condition: "distance > 30km", adjustment: 500, type: "fixed_per_meter", active: true },
        { name: "Height Premium", condition: "floor > 5", adjustment: 8, type: "percent_increase", active: true },
        { name: "Weekend Work", condition: "friday_installation", adjustment: 20, type: "percent_increase", active: true },
      ],
      conversionTracking: { quoted: 0, won: 0, lost: 0, expired: 0 },
    });
  }
  save() { save(this.file, this.data); }

  async generateQuote(data) {
    const template = this.bom.getTemplateByType(data.projectType);
    if (!template) {
      log("PRICING", `❌ אין תבנית BOM לסוג: ${data.projectType}`, "ERROR");
      return null;
    }

    const meters = data.meters || 1;
    const bom = this.bom.generateBOM(template.id, meters, data.projectId);
    if (!bom) return null;

    // חישוב הנחות אוטומטיות
    let totalDiscount = 0;
    const appliedDiscounts = [];

    for (const policy of this.data.discountPolicies) {
      let applies = false;
      if (policy.condition === "meters > 20" && meters > 20) applies = true;
      if (policy.condition === "returning_customer" && data.returningCustomer) applies = true;
      if (policy.condition === "referral" && data.referral) applies = true;
      if (policy.condition === "immediate_payment" && data.immediatePayment) applies = true;
      if (policy.condition === "combo_order" && data.comboOrder) applies = true;
      if (policy.condition === "low_season") {
        const month = new Date().getMonth();
        if (month === 11 || month === 0) applies = true;
      }

      if (applies) {
        const discountAmount = policy.type === "percent" ?
          Math.round(bom.sellingPrice * policy.discount / 100) :
          policy.discount;
        totalDiscount += discountAmount;
        appliedDiscounts.push({ name: policy.name, discount: policy.discount, type: policy.type, amount: discountAmount });
      }
    }

    // Dynamic pricing adjustments
    let surcharge = 0;
    const appliedSurcharges = [];
    for (const rule of this.data.dynamicRules.filter(r => r.active)) {
      let applies = false;
      if (rule.condition === "deadline < 7_days" && data.rushOrder) applies = true;
      if (rule.condition === "floor > 5" && (data.floor || 0) > 5) applies = true;
      if (rule.condition === "friday_installation" && data.fridayWork) applies = true;
      if (rule.condition === "distance > 30km" && data.distanceKm > 30) applies = true;

      if (applies) {
        const surchargeAmount = rule.type === "percent_increase" ?
          Math.round(bom.sellingPrice * rule.adjustment / 100) :
          rule.adjustment * meters;
        surcharge += surchargeAmount;
        appliedSurcharges.push({ name: rule.name, amount: surchargeAmount });
      }
    }

    // Max discount cap: 15%
    const maxDiscount = Math.round(bom.sellingPrice * 0.15);
    totalDiscount = Math.min(totalDiscount, maxDiscount);

    const afterDiscount = bom.sellingPrice - totalDiscount + surcharge;
    const vat = vatOf(afterDiscount);

    const quote = {
      id: `QUO-${uid()}`, bomId: bom.id, status: "draft",
      projectId: data.projectId || null,
      leadId: data.leadId || null,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || "",
      customerEmail: data.customerEmail || "",
      customerAddress: data.customerAddress || "",
      projectType: data.projectType,
      projectDescription: data.projectDescription || "",
      meters,
      floor: data.floor || 0,
      color: data.color || "",
      style: data.style || "",
      specialRequirements: data.specialRequirements || [],

      // עלויות
      materialCost: bom.materialCost,
      laborCost: bom.laborCost,
      overheadCost: bom.overheadCost,
      totalCost: bom.totalCost,
      basePrice: bom.sellingPrice,
      margin: bom.margin,

      // הנחות
      discounts: appliedDiscounts,
      totalDiscount,
      surcharges: appliedSurcharges,
      totalSurcharge: surcharge,

      // סופי
      subtotal: afterDiscount,
      vat, total: afterDiscount + vat,
      pricePerMeter: meters > 0 ? Math.round(afterDiscount / meters) : afterDiscount,
      pricePerMeterWithVat: meters > 0 ? Math.round((afterDiscount + vat) / meters) : afterDiscount + vat,

      // תנאים
      validUntil: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      paymentTerms: data.paymentTerms || "40% מקדמה, 60% בסיום",
      deliveryTime: data.deliveryTime || `${template.laborPerMeter > 0 ? Math.ceil(meters * template.laborPerMeter / 8) + 7 : 14} ימי עבודה`,
      warranty: "10 שנות אחריות על שלד, 2 שנות אחריות על צבע וגימור",
      includes: [
        "ייצור מותאם אישית",
        "הובלה והתקנה מקצועית",
        "צביעה בצבע לבחירתכם",
        "אחריות 10 שנים",
        "מדידה חינם",
      ],
      excludes: [
        "עבודות בנייה/חציבה",
        "חיבור חשמלי (בשערים חשמליים)",
        "היתרים ורישיונות (אם נדרש)",
      ],
      notes: data.notes || "",

      // AI
      competitorComparison: null,
      winProbability: null,
      suggestedNegotiationRange: null,

      // tracking
      sentAt: null, viewedAt: null, respondedAt: null,
      followUps: [],
      createdAt: now(),
    };

    this.data.quotes.push(quote);
    this.data.conversionTracking.quoted++;
    this.save();

    log("PRICING", `📋 הצעת מחיר: ${quote.id} — ${quote.projectType} — ${meters}מ' — ₪${shekel(quote.total)} (כולל מע"מ) — ₪${shekel(quote.pricePerMeterWithVat)}/מ'`);
    if (appliedDiscounts.length > 0) log("PRICING", `  💸 הנחות: ${appliedDiscounts.map(d => d.name).join(", ")} — סה"כ ₪${shekel(totalDiscount)}`);
    if (appliedSurcharges.length > 0) log("PRICING", `  📈 תוספות: ${appliedSurcharges.map(s => s.name).join(", ")} — סה"כ ₪${shekel(surcharge)}`);

    return quote;
  }

  async enrichQuoteWithAI(quoteId) {
    const quote = this.data.quotes.find(q => q.id === quoteId);
    if (!quote) return null;

    const enrichment = await this.brain.thinkJSON(`
אתה מומחה תמחור אוטונומי של טכנו כל עוזי.
תעשיר הצעת מחיר עם ניתוח תחרותי ואסטרטגיית משא ומתן.

═══ הצעת המחיר ═══
סוג: ${quote.projectType}
מטרים: ${quote.meters}
מחיר למטר (כולל מע"מ): ₪${shekel(quote.pricePerMeterWithVat)}
סה"כ: ₪${shekel(quote.total)}
מרווח: ${quote.margin}%
לקוח: ${quote.customerName}
עיר: ${quote.customerAddress}
הנחות: ${JSON.stringify(quote.discounts)}

═══ מחירי מתחרים ═══
${JSON.stringify(this.data.competitorPrices)}

═══ היסטוריית הצעות (אחרונות) ═══
${JSON.stringify(this.data.quotes.filter(q => q.projectType === quote.projectType).slice(-10).map(q => ({
  meters: q.meters, pricePerMeter: shekel(q.pricePerMeter), status: q.status, discount: shekel(q.totalDiscount),
})))}

תחזיר JSON:
{
  "competitorComparison": {
    "ourPricePerMeter": 0,
    "marketAvg": 0,
    "cheapest": {"competitor": "...", "price": 0},
    "mostExpensive": {"competitor": "...", "price": 0},
    "ourPosition": "cheapest/below_avg/average/above_avg/most_expensive",
    "valueProposition": "למה שווה לשלם יותר אצלנו"
  },
  "winProbability": 0.0-1.0,
  "winFactors": ["גורם 1"],
  "loseFactors": ["גורם 1"],
  "suggestedNegotiationRange": {
    "walkAway": 0,
    "target": 0,
    "anchor": 0,
    "maxDiscount": 0,
    "strategy": "..."
  },
  "objectionHandling": [
    {"objection": "יקר מדי", "response": "..."},
    {"objection": "המתחרה זול יותר", "response": "..."},
    {"objection": "צריך לחשוב על זה", "response": "..."},
    {"objection": "אין תקציב עכשיו", "response": "..."}
  ],
  "closingTechniques": ["טכניקת סגירה 1"],
  "upsellSuggestions": [{"product": "...", "reason": "...", "additionalRevenue": 0}],
  "followUpPlan": {
    "day1": "...",
    "day3": "...",
    "day7": "...",
    "day14": "..."
  }
}`);

    if (enrichment) {
      quote.competitorComparison = enrichment.competitorComparison;
      quote.winProbability = enrichment.winProbability;
      quote.suggestedNegotiationRange = enrichment.suggestedNegotiationRange;
      quote.aiEnrichment = enrichment;
      this.save();
    }

    return enrichment;
  }

  markQuoteWon(quoteId) {
    const q = this.data.quotes.find(x => x.id === quoteId);
    if (!q) return null;
    q.status = "won";
    q.wonAt = now();
    this.data.conversionTracking.won++;
    this.save();
    log("PRICING", `🏆 הצעה נסגרה: ${q.id} — ₪${shekel(q.total)}`, "SUCCESS");
    this.memory.add("successes", { type: "quote_won", quoteId, amount: q.total, projectType: q.projectType, meters: q.meters });
    return q;
  }

  markQuoteLost(quoteId, reason) {
    const q = this.data.quotes.find(x => x.id === quoteId);
    if (!q) return null;
    q.status = "lost";
    q.lostAt = now();
    q.lostReason = reason;
    this.data.conversionTracking.lost++;
    this.save();
    log("PRICING", `❌ הצעה אבדה: ${q.id} — ${reason}`, "WARN");
    this.memory.add("mistakes", { type: "quote_lost", quoteId, reason, amount: q.total, projectType: q.projectType });
    return q;
  }

  getConversionRate() {
    const t = this.data.conversionTracking;
    const total = t.won + t.lost;
    return total > 0 ? (t.won / total * 100).toFixed(1) : "0";
  }

  async analyze() {
    const recentQuotes = this.data.quotes.slice(-20);
    const convRate = this.getConversionRate();

    return await this.brain.thinkJSON(`
נתח תמחור:
הצעות: ${this.data.quotes.length}
שיעור המרה: ${convRate}%
ממוצע: won=${this.data.conversionTracking.won}, lost=${this.data.conversionTracking.lost}
מדיניות הנחות: ${this.data.discountPolicies.length} כללים
מחירי מתחרים: ${JSON.stringify(this.data.competitorPrices)}

הצעות אחרונות: ${JSON.stringify(recentQuotes.map(q => ({
  type: q.projectType, meters: q.meters, total: shekel(q.total),
  perMeter: shekel(q.pricePerMeter), margin: q.margin + "%",
  discount: shekel(q.totalDiscount), status: q.status,
  winProb: q.winProbability,
})))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "conversionRate": 0,
  "avgDealSize": 0,
  "priceCompetitiveness": {
    "position": "above/at/below market",
    "recommendation": "..."
  },
  "marginHealth": {
    "avgMargin": 0, "trend": "...",
    "byProduct": [{"product": "...", "margin": 0, "recommendation": "..."}]
  },
  "discountAnalysis": {
    "avgDiscountPercent": 0,
    "topDiscountReasons": ["..."],
    "recommendation": "..."
  },
  "lostAnalysis": {
    "topReasons": [{"reason": "...", "count": 0, "recommendation": "..."}],
    "recoverableQuotes": [{"quoteId": "...", "strategy": "..."}]
  },
  "pricingRecommendations": [{
    "product": "...", "currentPrice": 0, "suggestedPrice": 0,
    "reason": "...", "expectedImpact": "..."
  }],
  "automatedActions": [{"action": "...", "reason": "...", "priority": "..."}]
}`);
  }
}

// ═══════════════════════════════════════
// QUALITY MODULE — איכות ואחריות
// ═══════════════════════════════════════

class QualityModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "quality", "state.json");
    this.data = load(this.file, {
      inspections: [],
      defects: [],
      standards: [
        { id: "s1", name: "ת\"י 1139 — מעקות בטיחות", requirement: "גובה מינימלי 105 ס\"מ, מרווח בין חלקים עד 10 ס\"מ", applies: ["railing_iron", "railing_aluminum", "railing_glass"] },
        { id: "s2", name: "ת\"י 23 — צבע ובציפוי", requirement: "עובי ציפוי מינימלי 80 מיקרון, עמידות UV", applies: ["railing_iron", "gate_electric_sliding", "fence_iron"] },
        { id: "s3", name: "ת\"י 1142 — שערים חשמליים", requirement: "מנגנון בטיחות, פוטוסל, עצירה אוטומטית", applies: ["gate_electric_sliding"] },
        { id: "s4", name: "ת\"י 1099 — אלומיניום", requirement: "עמידות קורוזיה, אנודייז/צבע אבקתי", applies: ["railing_aluminum", "pergola_aluminum", "window_aluminum"] },
      ],
      customerFeedback: [],
      warranties: [],
      checklists: {
        measurement: ["בדיקת מידות", "צילום מצב קיים", "בדיקת גישה למנוף/סולם", "אישור לקוח על מיקום", "בדיקת חשמל (שערים)"],
        production: ["בדיקת חומרים לפני ייצור", "בדיקת ריתוכים", "בדיקת ישרות ויושר", "בדיקת גימור שטח", "בדיקת צבע/ציפוי"],
        preInstall: ["בדיקת חומרים שהגיעו", "בדיקת כלי עבודה", "בדיקת ציוד בטיחות", "אישור לקוח על מועד", "בדיקת גישה לאתר"],
        installation: ["בדיקת יושר ופלס", "בדיקת חיזוקים ועיגון", "בדיקת יציבות (מטען)", "בדיקת בטיחות ילדים (מרווחים)", "ניקיון אתר"],
        final: ["בדיקת מידות סופית", "בדיקת גימור וצבע", "בדיקת פונקציונליות (שערים)", "בדיקת בטיחות", "תיעוד צילומי", "חתימת לקוח"],
      },
    });
  }
  save() { save(this.file, this.data); }

  createInspection(data) {
    const type = data.type || "final";
    const insp = {
      id: `QC-${uid()}`, projectId: data.projectId || null,
      type, // measurement, production, pre_install, installation, final
      inspector: data.inspector || "system",
      date: data.date || today(),
      status: "pending",
      checklist: (this.data.checklists[type] || this.data.checklists.final).map((item, i) => ({
        id: i, item, checked: false, notes: "", photo: null,
      })),
      overallScore: null, // 1-5
      defectsFound: [],
      photos: [],
      notes: data.notes || "",
      standardsChecked: this.data.standards.filter(s =>
        data.projectType ? s.applies.includes(data.projectType) : true
      ).map(s => ({ ...s, compliant: null, notes: "" })),
      customerPresent: data.customerPresent || false,
      createdAt: now(), completedAt: null,
    };
    this.data.inspections.push(insp);
    this.save();
    log("QUALITY", `🔍 בדיקת איכות: ${insp.id} — ${type} — פרויקט ${data.projectId || "N/A"}`);
    return insp;
  }

  completeInspection(inspId, data) {
    const insp = this.data.inspections.find(x => x.id === inspId);
    if (!insp) return null;
    insp.status = "completed";
    insp.completedAt = now();
    insp.overallScore = data.overallScore || 0;
    if (data.checklist) {
      for (const item of data.checklist) {
        const ci = insp.checklist.find(c => c.id === item.id);
        if (ci) { ci.checked = item.checked; ci.notes = item.notes || ""; }
      }
    }
    if (data.defectsFound) insp.defectsFound = data.defectsFound;
    if (data.notes) insp.notes = data.notes;

    const passRate = insp.checklist.filter(c => c.checked).length / insp.checklist.length;

    if (passRate < 0.8 || insp.overallScore < 3) {
      log("QUALITY", `⚠️ בדיקה נכשלה: ${insp.id} (${(passRate * 100).toFixed(0)}%, ציון ${insp.overallScore}/5)`, "WARN");
      this.memory.add("alerts", { type: "quality_fail", inspId: insp.id, score: insp.overallScore, passRate });
    } else {
      log("QUALITY", `✅ בדיקה עברה: ${insp.id} (${(passRate * 100).toFixed(0)}%, ציון ${insp.overallScore}/5)`, "SUCCESS");
    }

    this.save();
    return insp;
  }

  reportDefect(data) {
    const defect = {
      id: `DEF-${uid()}`,
      projectId: data.projectId || null,
      inspectionId: data.inspectionId || null,
      type: data.type || "cosmetic", // structural, cosmetic, functional, safety, dimensional
      severity: data.severity || "minor", // critical, major, minor, cosmetic
      description: data.description || "",
      location: data.location || "",
      rootCause: data.rootCause || "",
      photos: data.photos || [],
      reportedBy: data.reportedBy || "system",
      assignedTo: data.assignedTo || null,
      status: "open", // open, in_progress, fixed, verified, closed, wont_fix
      resolution: null,
      fixCost: 0,
      customerImpact: data.customerImpact || "none", // none, minor_delay, major_delay, rework, replacement
      createdAt: now(), fixedAt: null, verifiedAt: null,
    };
    this.data.defects.push(defect);
    this.save();

    if (defect.severity === "critical" || defect.severity === "major") {
      log("QUALITY", `🚨 פגם ${defect.severity}: ${defect.description}`, defect.severity === "critical" ? "ERROR" : "WARN");
      this.memory.add("alerts", { type: "defect", severity: defect.severity, description: defect.description });
    } else {
      log("QUALITY", `📝 פגם ${defect.severity}: ${defect.description}`);
    }

    return defect;
  }

  fixDefect(defectId, data = {}) {
    const d = this.data.defects.find(x => x.id === defectId);
    if (!d) return null;
    d.status = "fixed";
    d.resolution = data.resolution || "";
    d.fixCost = data.fixCost || 0;
    d.fixedAt = now();
    d.fixedBy = data.fixedBy || "system";
    this.save();
    return d;
  }

  addWarranty(data) {
    const startDate = data.startDate || today();
    const endDate10 = new Date(startDate);
    endDate10.setFullYear(endDate10.getFullYear() + 10);
    const endDate2 = new Date(startDate);
    endDate2.setFullYear(endDate2.getFullYear() + 2);

    const w = {
      id: `WAR-${uid()}`,
      projectId: data.projectId || null,
      customerId: data.customerId || null,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || "",
      address: data.address || "",
      productType: data.productType || "",
      structuralWarranty: { start: startDate, end: endDate10.toISOString().split("T")[0], years: 10 },
      finishWarranty: { start: startDate, end: endDate2.toISOString().split("T")[0], years: 2 },
      terms: [
        "אחריות 10 שנים על שלד ומבנה",
        "אחריות 2 שנים על צבע וגימור",
        "לא כולל נזק מכוון או שימוש לא סביר",
        "לא כולל נזק מתנאי מזג אוויר קיצוניים",
        "שירות תיקון תוך 7 ימי עבודה",
      ],
      claims: [],
      status: "active",
      createdAt: now(),
    };
    this.data.warranties.push(w);
    this.save();
    log("QUALITY", `🛡️ אחריות: ${w.id} — ${w.customerName} — ${w.productType} — עד ${endDate10.toISOString().split("T")[0]}`);
    return w;
  }

  addWarrantyClaim(warrantyId, data) {
    const w = this.data.warranties.find(x => x.id === warrantyId);
    if (!w) return null;
    const claim = {
      id: uid(), description: data.description || "",
      type: data.type || "repair", // repair, replacement, cosmetic
      severity: data.severity || "minor",
      status: "open",
      scheduledDate: data.scheduledDate || null,
      cost: 0, coveredByWarranty: true,
      createdAt: now(), resolvedAt: null,
    };

    // בדוק אם באחריות
    const structEnd = new Date(w.structuralWarranty.end);
    const finishEnd = new Date(w.finishWarranty.end);
    const claimDate = new Date();

    if (claim.type === "cosmetic" && claimDate > finishEnd) {
      claim.coveredByWarranty = false;
      log("QUALITY", `⚠️ תביעת אחריות מחוץ לתקופה (צבע/גימור)`, "WARN");
    }
    if ((claim.type === "repair" || claim.type === "replacement") && claimDate > structEnd) {
      claim.coveredByWarranty = false;
    }

    w.claims.push(claim);
    this.save();
    log("QUALITY", `📋 תביעת אחריות: ${w.customerName} — ${claim.description} (${claim.coveredByWarranty ? "באחריות" : "חוץ אחריות"})`);
    return claim;
  }

  addFeedback(data) {
    const fb = {
      id: uid(), projectId: data.projectId || null,
      customerName: data.customerName || "",
      overallScore: data.overallScore || 0, // 1-5
      categories: {
        quality: data.quality || 0,
        timeliness: data.timeliness || 0,
        communication: data.communication || 0,
        cleanliness: data.cleanliness || 0,
        value: data.value || 0,
      },
      recommendation: data.recommendation || null, // 1-10 NPS
      comment: data.comment || "",
      wouldRecommend: data.wouldRecommend || null,
      source: data.source || "direct", // direct, google, facebook, phone
      createdAt: now(),
    };
    this.data.customerFeedback.push(fb);
    this.save();

    if (fb.overallScore <= 2) {
      log("QUALITY", `😡 משוב שלילי: ${fb.customerName} — ${fb.overallScore}/5 — "${fb.comment}"`, "ERROR");
      this.memory.add("alerts", { type: "negative_feedback", customer: fb.customerName, score: fb.overallScore, comment: fb.comment });
    } else if (fb.overallScore >= 4) {
      log("QUALITY", `😊 משוב חיובי: ${fb.customerName} — ${fb.overallScore}/5`, "SUCCESS");
      this.memory.add("successes", { type: "positive_feedback", customer: fb.customerName, score: fb.overallScore });
    }

    return fb;
  }

  getNPS() {
    const scores = this.data.customerFeedback.filter(f => f.recommendation).map(f => f.recommendation);
    if (scores.length === 0) return null;
    const promoters = scores.filter(s => s >= 9).length;
    const detractors = scores.filter(s => s <= 6).length;
    return Math.round((promoters - detractors) / scores.length * 100);
  }

  getDefectRate() {
    const total = this.data.inspections.filter(i => i.status === "completed").length;
    const withDefects = this.data.inspections.filter(i => i.status === "completed" && i.defectsFound.length > 0).length;
    return total > 0 ? (withDefects / total * 100).toFixed(1) : "0";
  }

  async analyze() {
    const nps = this.getNPS();
    const defectRate = this.getDefectRate();
    const openDefects = this.data.defects.filter(d => d.status === "open" || d.status === "in_progress");
    const activeWarranties = this.data.warranties.filter(w => w.status === "active");

    return await this.brain.thinkJSON(`
נתח איכות:
בדיקות: ${this.data.inspections.length} (${this.data.inspections.filter(i => i.status === "completed").length} הושלמו)
אחוז פגמים: ${defectRate}%
פגמים פתוחים: ${openDefects.length}
NPS: ${nps !== null ? nps : "אין מספיק נתונים"}
אחריות פעילה: ${activeWarranties.length}
תביעות אחריות: ${activeWarranties.reduce((s, w) => s + w.claims.length, 0)}
משובים: ${this.data.customerFeedback.length}

פגמים אחרונים: ${JSON.stringify(openDefects.slice(-5).map(d => ({ type: d.type, severity: d.severity, desc: d.description })))}
משובים אחרונים: ${JSON.stringify(this.data.customerFeedback.slice(-5).map(f => ({ score: f.overallScore, nps: f.recommendation, comment: f.comment?.substring(0, 50) })))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "defectAnalysis": {
    "rate": 0, "trend": "improving/stable/worsening",
    "topTypes": [{"type": "...", "count": 0, "recommendation": "..."}],
    "rootCauses": ["..."],
    "preventiveActions": ["..."]
  },
  "customerSatisfaction": {
    "avgScore": 0, "nps": 0, "trend": "...",
    "topComplaints": ["..."],
    "topPraises": ["..."]
  },
  "warrantyHealth": {
    "activePolicies": 0, "openClaims": 0, "claimRate": 0,
    "costOfClaims": 0, "recommendation": "..."
  },
  "standardsCompliance": {"compliant": true, "issues": ["..."]},
  "trainingNeeds": [{"area": "...", "target": "...", "priority": "..."}],
  "automatedActions": [{"action": "...", "reason": "...", "priority": "..."}],
  "kpis": {"defectRate": 0, "nps": 0, "avgInspectionScore": 0, "reworkRate": 0, "warrantyCostRate": 0, "firstTimePassRate": 0}
}`);
  }
}

// ═══════════════════════════════════════
// NOTIFICATIONS MODULE
// ═══════════════════════════════════════

class NotificationModule {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "notifications", "state.json");
    this.data = load(this.file, {
      notifications: [],
      channels: { console: true, log: true, whatsapp: false, email: false, sms: false },
      rules: [],
      escalationPolicy: [
        { level: 1, target: "system", delay: 0 },
        { level: 2, target: "דימה", delay: 30 },
        { level: 3, target: "קובי", delay: 60 },
      ],
    });
  }
  save() { save(this.file, this.data); }

  notify(data) {
    const n = {
      id: uid(),
      level: data.level || "info",
      title: data.title || "",
      message: data.message || "",
      module: data.module || "system",
      target: data.target || "all",
      channel: data.channel || "console",
      actionRequired: data.actionRequired || false,
      actionUrl: data.actionUrl || null,
      relatedId: data.relatedId || null,
      read: false, actioned: false,
      createdAt: now(),
    };
    this.data.notifications.push(n);
    this.data.notifications = this.data.notifications.slice(-1000);
    this.save();

    const icons = { critical: "🚨", warning: "⚠️", info: "ℹ️", success: "✅" };
    const levels = { critical: "ERROR", warning: "WARN", info: "INFO", success: "SUCCESS" };
    log("NOTIFY", `${icons[n.level] || "📢"} [${n.target}] ${n.title}: ${n.message}`, levels[n.level] || "INFO");

    return n;
  }

  getUnread() { return this.data.notifications.filter(n => !n.read); }
  getCritical() { return this.data.notifications.filter(n => n.level === "critical" && !n.actioned); }
  markRead(id) { const n = this.data.notifications.find(x => x.id === id); if (n) { n.read = true; this.save(); } }
  markActioned(id) { const n = this.data.notifications.find(x => x.id === id); if (n) { n.actioned = true; this.save(); } }

  getSummary() {
    const unread = this.getUnread();
    return {
      total: unread.length,
      critical: unread.filter(n => n.level === "critical").length,
      warning: unread.filter(n => n.level === "warning").length,
      info: unread.filter(n => n.level === "info").length,
      success: unread.filter(n => n.level === "success").length,
    };
  }
}

// ═══════════════════════════════════════
// ANALYTICS MODULE
// ═══════════════════════════════════════

class AnalyticsModule {
  constructor(brain, memory, modules) {
    this.brain = brain;
    this.memory = memory;
    this.modules = modules;
    this.file = path.join(CONFIG.DIR, "analytics", "state.json");
    this.data = load(this.file, { snapshots: [], reports: [] });
  }
  save() { save(this.file, this.data); }

  takeSnapshot() {
    const s = {
      t: now(),
      erp: {
        projects: this.modules.erp.data.projects.length,
        activeProjects: this.modules.erp.data.projects.filter(p => !["completed", "cancelled", "lost", "warranty"].includes(p.status)).length,
        stockValue: this.modules.erp.getStockValue(),
        lowStock: this.modules.erp.getLowStockItems().length,
        openPOs: this.modules.erp.data.purchaseOrders.filter(p => !["received", "cancelled"].includes(p.status)).length,
        openWOs: this.modules.erp.data.workOrders.filter(w => !["completed", "cancelled"].includes(w.status)).length,
      },
      crm: {
        leads: this.modules.crm.data.leads.length,
        pipeline: this.modules.crm.getPipelineSummary(),
        pipelineValue: this.modules.crm.getPipelineValue(),
        hotLeads: this.modules.crm.getHotLeads().length,
        coldLeads: this.modules.crm.getColdLeads().length,
        sourceStats: this.modules.crm.getSourceStats(),
      },
      hr: {
        headcount: this.modules.hr.getHeadcount(),
        salaryCost: this.modules.hr.getTotalSalaryCost(),
        pendingLeaves: this.modules.hr.data.leaves.filter(l => l.status === "pending").length,
      },
      finance: {
        cashflow: this.modules.finance.data.cashflow,
        pnl: this.modules.finance.getMonthlyPnL(),
        ytd: this.modules.finance.getYTDSummary(),
        overdue: this.modules.finance.getOverdueInvoices().length,
        vatBalance: this.modules.finance.data.taxes.vatBalance,
      },
      ops: {
        pendingMeasurements: this.modules.ops.getPendingMeasurements().length,
        pendingInstallations: this.modules.ops.getPendingInstallations().length,
        openIncidents: this.modules.ops.getOpenIncidents().length,
        vehicles: this.modules.ops.data.vehicles.length,
      },
      pricing: {
        totalQuotes: this.modules.pricing.data.quotes.length,
        conversionRate: this.modules.pricing.getConversionRate(),
      },
      quality: {
        nps: this.modules.quality.getNPS(),
        defectRate: this.modules.quality.getDefectRate(),
        openDefects: this.modules.quality.data.defects.filter(d => d.status === "open").length,
        activeWarranties: this.modules.quality.data.warranties.filter(w => w.status === "active").length,
      },
      brain: this.modules.brain.getStats(),
      memory: this.memory.getSummary(),
      notifications: this.modules.notifications.getSummary(),
    };
    this.data.snapshots.push(s);
    this.data.snapshots = this.data.snapshots.slice(-365);
    this.save();
    return s;
  }

  async generateExecutiveReport() {
    const snapshot = this.takeSnapshot();

    return await this.brain.thinkJSON(`
אתה מנהל אנליטיקס אוטונומי. צור דוח מנהלים מקיף.

═══ SNAPSHOT ═══
${JSON.stringify(snapshot, null, 2)}

═══ זיכרון ═══
הצלחות אחרונות: ${JSON.stringify(this.memory.get("successes", 5))}
טעויות אחרונות: ${JSON.stringify(this.memory.get("mistakes", 5))}
תובנות: ${JSON.stringify(this.memory.get("insights", 5))}
התראות: ${JSON.stringify(this.memory.get("alerts", 5))}

תחזיר JSON:
{
  "executiveSummary": "סיכום מנהלים 4-6 שורות — מה חשוב לדעת עכשיו",
  "overallScore": 0-100,
  "moduleScores": {"erp": 0, "crm": 0, "hr": 0, "finance": 0, "ops": 0, "pricing": 0, "quality": 0},
  "topPriorities": [{"title": "...", "urgency": "critical/high/medium", "impact": "...", "owner": "קובי/דימה/עוזי/קורין/system", "deadline": "..."}],
  "wins": [{"what": "...", "impact": "...", "lesson": "..."}],
  "risks": [{"risk": "...", "probability": 0.0-1.0, "impact": "catastrophic/severe/moderate/minor", "mitigation": "...", "owner": "..."}],
  "kpis": {
    "revenue": {"current": 0, "target": 0, "trend": "..."},
    "profit": {"current": 0, "target": 0, "trend": "..."},
    "leads": {"current": 0, "target": 0, "trend": "..."},
    "conversionRate": {"current": 0, "target": 0, "trend": "..."},
    "avgDealSize": {"current": 0, "target": 0},
    "nps": {"current": 0, "target": 0},
    "deliveryOnTime": {"current": 0, "target": 0},
    "defectRate": {"current": 0, "target": 0}
  },
  "forecast": {
    "next30days": "...",
    "next90days": "...",
    "yearEnd": "...",
    "confidence": 0.0-1.0
  },
  "aiRecommendations": [{
    "recommendation": "...",
    "expectedImpact": "...",
    "effort": "low/medium/high",
    "priority": "critical/high/medium/low",
    "owner": "...",
    "deadline": "..."
  }],
  "anomalies": ["חריגה 1"],
  "trendsToWatch": ["מגמה 1"]
}`);
  }
}

// ═══════════════════════════════════════
// SWARM — נחיל 7 סוכנים
// ═══════════════════════════════════════

class Swarm {
  constructor(brain) {
    this.brain = brain;
    this.agents = [
      { role: "CEO — קובי (מנכ\"ל)", personality: "אסטרטגי, חושב 5 שנים קדימה, מחפש הזדמנויות גדולות, מתמקד ב-ROI וצמיחה. שואל: 'מה יכפיל את העסק?'" },
      { role: "COO — דימה (תפעול)", personality: "פרקטי ויעיל, מתמקד בתהליכים ומשאבים, מחפש בזבוז ושיפור. שואל: 'איך עושים את זה יותר מהר ויותר טוב?'" },
      { role: "CFO (כספים)", personality: "שמרני וזהיר, Cash is King, מנהל סיכונים, מתמקד ברווחיות ותזרים. שואל: 'כמה זה עולה ומתי נראה תשואה?'" },
      { role: "CMO (שיווק)", personality: "יצירתי ואגרסיבי, מתמקד בצמיחת לידים ומכירות, חושב על מותג ותדמית. שואל: 'איך מביאים יותר לקוחות?'" },
      { role: "CTO (טכנולוגיה)", personality: "אוטומציה ודאטה, מתמקד ביעילות טכנולוגית, AI ואופטימיזציה. שואל: 'מה אפשר לאוטמט?'" },
      { role: "HR — קורין (משאבי אנוש)", personality: "אנשים קודם, מתמקד בשימור עובדים, תרבות ארגונית ורווחה. שואלת: 'מה הצוות צריך כדי להצליח?'" },
      { role: "Risk Manager (סיכונים)", personality: "פסימי בריא, מחפש מה יכול להשתבש, תמיד יש Plan B. שואל: 'מה הכי גרוע שיכול לקרות?'" },
    ];
    this.debateHistory = [];
  }

  async debate(topic, context) {
    log("SWARM", `🐝 פותח דיון: ${topic}`);
    const opinions = [];

    for (const agent of this.agents) {
      const prev = opinions.map(o => `${o.role}: ${o.opinion}`).join("\n");
      const res = await this.brain.thinkJSON(`
אתה ${agent.role} בטכנו כל עוזי + קובי אלקיים נדל"ן.
אישיות: ${agent.personality}

נושא לדיון: ${topic}
הקשר: ${JSON.stringify(context)}
${prev ? `\nדעות שכבר נאמרו:\n${prev}` : ""}

תן את דעתך הכנה. אם אתה לא מסכים עם אחרים — תגיד.
תחזיר JSON:
{
  "opinion": "דעתך (2-3 משפטים)",
  "confidence": 0.0-1.0,
  "keyPoint": "הנקודה הכי חשובה",
  "recommendation": "מה לעשות",
  "risk": "מה הסיכון",
  "disagreeWith": "עם מי אתה לא מסכים ולמה (או null)"
}`,
        `אתה ${agent.role}. ${agent.personality}. מפעל מתכת 30 עובדים + נדל"ן יוקרה. JSON בלבד.`
      );
      if (res) opinions.push({ role: agent.role, ...res });
    }

    // סינתזה
    const synthesis = await this.brain.thinkJSON(`
סכם דיון בין 7 מנהלים בכירים:
${JSON.stringify(opinions, null, 2)}

נושא: ${topic}

תחזיר JSON:
{
  "finalDecision": "ההחלטה הסופית (2-3 משפטים)",
  "consensusLevel": 0.0-1.0,
  "keyArguments": [{"for": "...", "against": "..."}],
  "majorDisagreement": "מי לא הסכים ולמה",
  "risks": ["סיכון 1"],
  "nextSteps": [{"step": "...", "owner": "...", "deadline": "..."}],
  "successMetrics": ["מדד הצלחה 1"],
  "reviewDate": "מתי לבדוק שוב"
}`);

    const result = synthesis || { finalDecision: "לא הושגה הסכמה", consensusLevel: 0 };

    const debate = { id: uid(), topic, opinions, result, t: now() };
    this.debateHistory.push(debate);
    this.debateHistory = this.debateHistory.slice(-50);
    save(path.join(CONFIG.DIR, "debates", `${debate.id}.json`), debate);

    log("SWARM", `🐝 החלטה (${(result.consensusLevel * 100).toFixed(0)}% הסכמה): ${result.finalDecision}`, "DECISION");
    return result;
  }
}

// ═══════════════════════════════════════
// ADVERSARIAL — תקיפה עצמית
// ═══════════════════════════════════════

class Adversarial {
  constructor(brain) {
    this.brain = brain;
    this.attacks = [];
  }

  async attack(decision) {
    log("ADVERSARIAL", "🔴 Red Team מתחיל תקיפה...");

    const result = await this.brain.thinkJSON(`
אתה RED TEAM — תוקף החלטות. תפקידך למצוא כל חולשה אפשרית.
ההחלטה: ${JSON.stringify(decision)}

תקוף מ-8 זוויות:

1. **Cognitive Biases** — אילו הטיות חשיבה השפיעו?
   - Confirmation Bias: האם חיפשנו רק מה שמאשר?
   - Anchoring: האם נתפסנו למספר ראשון?
   - Sunk Cost: האם ממשיכים בגלל שכבר השקענו?
   - Survivorship Bias: האם מסתכלים רק על הצלחות?
   - Dunning-Kruger: האם מעריכים יתר את היכולות?

2. **Missing Data** — מה לא נלקח בחשבון? מה לא יודעים?

3. **Black Swan** — מה אם קורה משהו קיצוני? מלחמה? מיתון? רגולציה?

4. **Adversarial** — מה אם המתחרה עושה בדיוק ההפך? מגיב אגרסיבית?

5. **Second Order Effects** — מה ההשלכות של ההשלכות? אפקט פרפר?

6. **Goodhart's Law** — האם מאפטמים מטריקה במקום מטרה אמיתית?

7. **Simpson's Paradox** — האם הנתונים המצטברים מטעים? האם בקבוצות משנה התמונה הפוכה?

8. **Temporal** — האם ההחלטה נכונה לעכשיו אבל לא ל-6 חודשים?

תחזיר JSON:
{
  "vulnerabilities": [{
    "type": "cognitive_bias/missing_data/black_swan/adversarial/second_order/goodharts/simpsons/temporal",
    "bias": "שם ההטיה הספציפית (אם רלוונטי)",
    "description": "תיאור הפגיעות",
    "severity": "critical/high/medium/low",
    "probability": 0.0-1.0,
    "impact": "מה יקרה אם הפגיעות מנוצלת",
    "mitigation": "מה לעשות כדי להגן"
  }],
  "overallRisk": 0.0-1.0,
  "recommendation": "approve/modify/reject",
  "improvedDecision": "ההחלטה המשופרת שמתחשבת בפגיעויות",
  "monitoringPlan": ["מה לעקוב אחריו כדי לזהות בעיות מוקדם"],
  "killSwitch": "באיזה מצב להפסיק הכל ולחשוב מחדש"
}`);

    if (result) {
      this.attacks.push({ decision, result, t: now() });
      this.attacks = this.attacks.slice(-100);

      const criticals = (result.vulnerabilities || []).filter(v => v.severity === "critical");
      if (criticals.length > 0) {
        log("ADVERSARIAL", `🚨 ${criticals.length} פגיעויות קריטיות!`, "ERROR");
        for (const v of criticals) {
          log("ADVERSARIAL", `  💀 ${v.type}: ${v.description}`, "ERROR");
        }
      }

      log("ADVERSARIAL", `🔴 סיכון כללי: ${(result.overallRisk * 100).toFixed(0)}% — המלצה: ${result.recommendation}`);
    }

    return result;
  }

  async stressTest(systemState) {
    return await this.brain.thinkJSON(`
Stress Test — צור 5 תרחישי קיצון למערכת:
${JSON.stringify(systemState)}

תרחישים:
1. Black Swan חיצוני (מגפה, מלחמה, רגולציה)
2. תרחיש מתחרה (מתחרה עם Budget x10, מתחרה שמעתיק)
3. תרחיש טכנולוגי (Google משנה Algorithm, API נופל)
4. תרחיש שוק (מיתון, ריבית 8%, קריסת נדל"ן)
5. תרחיש פנימי (עובד מפתח עוזב, תאונה, סכסוך)

תחזיר JSON:
{
  "scenarios": [{
    "name": "...", "description": "...",
    "probability": 0.0-1.0,
    "impact": "catastrophic/severe/moderate/minor",
    "preparedness": 0.0-1.0,
    "actionPlan": ["צעד 1"],
    "earlyWarningSignals": ["סימן 1"],
    "recoveryTime": "..."
  }],
  "weakestPoint": "...",
  "overallResilience": 0.0-1.0,
  "immediateActions": ["..."]
}`);
  }
}

// ═══════════════════════════════════════
// DREAM MODE — חשיבה יצירתית
// ═══════════════════════════════════════

class Dream {
  constructor(brain) {
    this.brain = brain;
    this.dreams = [];
  }

  async dream(recentMemories) {
    log("DREAM", "💤 נכנס למצב חלום — חשיבה יצירתית חופשית...", "DREAM");

    const result = await this.brain.thinkJSON(`
אתה במצב חלום — חשיבה חופשית ויצירתית ללא מגבלות.
העסק: טכנו כל עוזי (מתכת, 80 שנה) + קובי אלקיים נדל"ן (יוקרה בינלאומי).

זיכרונות אחרונים: ${JSON.stringify(recentMemories)}

במצב חלום, עשה את הדברים הבאים:

1. **חבר רעיונות לא קשורים** — מה הקשר בין מעקות ברזל לנדל"ן יוקרה? בין 80 שנות ניסיון לטכנולוגיה? בין מתכת לאמנות?

2. **אנלוגיות מתחומים אחרים**:
   - טבע/ביולוגיה: מה נמלים ילמדו אותנו על ניהול מפעל?
   - פיזיקה: אילו חוקי טבע רלוונטיים לעסק?
   - צבא: אילו אסטרטגיות ניצחון רלוונטיות?
   - מוזיקה: מה אפשר ללמוד מתזמורת?
   - רפואה: מה מערכת חיסון ילמדת אותנו?
   - ספורט: מה מאמן כדורגל ילמד אותנו?
   - אוכל: מה שף מישלן ילמד אותנו על איכות?

3. **שאלות שאף אחד לא שואל**:
   - מה אם הלקוח הוא לא מי שחושבים?
   - מה אם המוצר הכי רווחי הוא לא מעקות?
   - מה אם המתחרה הכי מסוכן הוא לא מסגריה אחרת?

4. **Unknown Unknowns** — מה שאנחנו לא יודעים שאנחנו לא יודעים?

5. **רעיון מטורף** — משהו שנשמע בלתי אפשרי אבל אם יעבוד — ישנה הכל.

תחזיר JSON:
{
  "dreamType": "creative_synthesis/pattern_discovery/paradigm_shift/wild_idea/cross_domain",
  "content": "תוכן החלום — 3-5 משפטים",
  "connections": ["קשר נסתר 1 שמצאת"],
  "analogies": [{"domain": "...", "insight": "...", "application": "..."}],
  "newQuestions": ["שאלה שאף אחד לא חשב לשאול"],
  "wildIdeas": ["רעיון מטורף 1"],
  "unknownUnknowns": ["מה שלא ידענו שלא ידענו"],
  "actionableInsight": "תובנה אחת קונקרטית שאפשר ליישם מחר בבוקר",
  "potentialRevenue": "כמה זה יכול להכניס אם יעבוד",
  "noveltyScore": 0.0-1.0,
  "feasibilityScore": 0.0-1.0
}`);

    if (result) {
      result.t = now();
      result.id = uid();
      this.dreams.push(result);
      this.dreams = this.dreams.slice(-50);
      save(path.join(CONFIG.DIR, "dreams", `${result.id}.json`), result);

      if (result.noveltyScore > 0.7) {
        log("DREAM", `🌟 רעיון חדשני (${(result.noveltyScore * 100).toFixed(0)}%): ${result.actionableInsight}`, "SUCCESS");
      }
      if (result.wildIdeas && result.wildIdeas.length > 0) {
        log("DREAM", `🤯 רעיון מטורף: ${result.wildIdeas[0]}`);
      }
    }

    return result;
  }
}

// ═══════════════════════════════════════
// META-LEARNING — למידה איך ללמוד
// ═══════════════════════════════════════

class MetaLearner {
  constructor(brain) {
    this.brain = brain;
    this.file = path.join(CONFIG.DIR, "metalearning.json");
    this.data = load(this.file, {
      strategies: [], experiments: [], findings: [],
      currentBestStrategy: null, learningCurve: [],
    });
  }
  save() { save(this.file, this.data); }

  async evaluate(decisions, outcomes) {
    log("META-LEARN", "🎓 מנתח את תהליך הלמידה עצמו...");

    const result = await this.brain.thinkJSON(`
אתה Meta-Learner — אתה לומד איך ללמוד טוב יותר.
תפקידך: לנתח את תהליך הלמידה של המערכת ולשפר אותו.

החלטות אחרונות: ${JSON.stringify(decisions)}
תוצאות/הצלחות: ${JSON.stringify(outcomes)}
אסטרטגיות למידה קודמות: ${JSON.stringify(this.data.strategies.slice(-5))}
עקומת למידה: ${JSON.stringify(this.data.learningCurve.slice(-20))}

נתח:
1. **Learning Rate** — באיזה קצב המערכת משתפרת? מאיצה? מאטה? Plateau?
2. **Exploration vs Exploitation** — האם מספיק מגלים דברים חדשים? או חוזרים על מה שעובד?
3. **Knowledge Transfer** — האם לקחים מתחום אחד מועברים לתחום אחר? (ERP→CRM? מתכת→נדל"ן?)
4. **Forgetting Curve** — האם שוכחים לקחים חשובים? האם טעויות חוזרות?
5. **Overfitting** — האם מתאימים יותר מדי לעבר? האם מתעלמים משינויים?
6. **Sample Efficiency** — כמה נתונים צריכים לפני שלומדים?
7. **Curriculum** — באיזה סדר כדאי ללמוד? מה הכי חשוב עכשיו?
8. **Feedback Loops** — האם יש לולאות משוב חיוביות/שליליות?

תחזיר JSON:
{
  "learningRate": "accelerating/stable/decelerating/plateau",
  "learningRateValue": 0.0-1.0,
  "explorationRatio": 0.0-1.0,
  "explorationRecommendation": "explore_more/balanced/exploit_more",
  "knowledgeTransferScore": 0.0-1.0,
  "knowledgeGaps": ["פער ידע 1"],
  "forgettingRisk": 0.0-1.0,
  "forgottenLessons": ["לקח שנשכח"],
  "overfittingRisk": 0.0-1.0,
  "overfittingSignals": ["סימן 1"],
  "improvedStrategy": "אסטרטגיית למידה חדשה ומשופרת",
  "whatToLearnNext": [{"topic": "...", "priority": "high/medium/low", "method": "..."}],
  "whatToForget": ["דבר שלא רלוונטי יותר"],
  "feedbackLoops": [{"type": "positive/negative", "description": "...", "recommendation": "..."}],
  "curriculumUpdate": [{"phase": 1, "focus": "...", "duration": "..."}],
  "metaInsight": "תובנה על תהליך הלמידה עצמו — משהו שלא ניתן לראות מבפנים",
  "selfAssessment": 0.0-1.0
}`);

    if (result) {
      this.data.strategies.push({ ...result, t: now() });
      this.data.strategies = this.data.strategies.slice(-50);
      this.data.currentBestStrategy = result.improvedStrategy;
      this.data.learningCurve.push({ t: now(), rate: result.learningRateValue, exploration: result.explorationRatio, selfAssessment: result.selfAssessment });
      this.save();

      log("META-LEARN", `📈 Learning Rate: ${result.learningRate} (${(result.learningRateValue * 100).toFixed(0)}%) | Exploration: ${(result.explorationRatio * 100).toFixed(0)}% | Overfitting Risk: ${(result.overfittingRisk * 100).toFixed(0)}%`);
      log("META-LEARN", `🎯 אסטרטגיה חדשה: ${result.improvedStrategy}`);
      if (result.metaInsight) log("META-LEARN", `💡 Meta-Insight: ${result.metaInsight}`, "AI");
    }

    return result;
  }
}

// ═══════════════════════════════════════
// GOALS — יעדים עסקיים
// ═══════════════════════════════════════

class Goals {
  constructor(brain) {
    this.brain = brain;
    this.file = path.join(CONFIG.DIR, "goals.json");
    this.goals = load(this.file, [
      { id: "g1", biz: "techno", title: "100 לידים ביום", target: 100, current: 0, unit: "לידים/יום", priority: "critical", category: "growth", status: "active", owner: "CMO", deadline: "2026-07-01", milestones: [25, 50, 75, 100], history: [] },
      { id: "g2", biz: "techno", title: "ROAS מעל 8x", target: 8, current: 0, unit: "x", priority: "high", category: "efficiency", status: "active", owner: "CMO", deadline: "2026-08-01", milestones: [4, 6, 7, 8], history: [] },
      { id: "g3", biz: "techno", title: "CPA מתחת ל-₪25", target: 25, current: 100, unit: "₪", priority: "high", category: "efficiency", status: "active", owner: "CMO", deadline: "2026-08-01", milestones: [60, 45, 35, 25], history: [] },
      { id: "g4", biz: "realestate", title: "50 לידים בינלאומיים/חודש", target: 50, current: 0, unit: "לידים/חודש", priority: "high", category: "expansion", status: "active", owner: "CMO", deadline: "2026-09-01", milestones: [10, 25, 40, 50], history: [] },
      { id: "g5", biz: "techno", title: "זמן אספקה מתחת ל-14 יום", target: 14, current: 30, unit: "ימים", priority: "medium", category: "operations", status: "active", owner: "COO", deadline: "2026-09-01", milestones: [25, 20, 17, 14], history: [] },
      { id: "g6", biz: "both", title: "NPS מעל 70", target: 70, current: 0, unit: "NPS", priority: "medium", category: "quality", status: "active", owner: "COO", deadline: "2026-12-01", milestones: [30, 50, 60, 70], history: [] },
      { id: "g7", biz: "techno", title: "מחזור שנתי ₪5M+", target: 500000000, current: 0, unit: "אגורות/שנה", priority: "critical", category: "revenue", status: "active", owner: "CEO", deadline: "2026-12-31", milestones: [125000000, 250000000, 375000000, 500000000], history: [] },
      { id: "g8", biz: "both", title: "30 עובדים פעילים", target: 30, current: 0, unit: "עובדים", priority: "medium", category: "hr", status: "active", owner: "HR", deadline: "2026-09-01", milestones: [20, 25, 28, 30], history: [] },
      { id: "g9", biz: "techno", title: "Margin מעל 35%", target: 35, current: 0, unit: "%", priority: "high", category: "profitability", status: "active", owner: "CFO", deadline: "2026-09-01", milestones: [25, 28, 32, 35], history: [] },
      { id: "g10", biz: "techno", title: "אפס תאונות עבודה", target: 0, current: 0, unit: "תאונות", priority: "critical", category: "safety", status: "active", owner: "COO", deadline: "2026-12-31", milestones: [], history: [] },
    ]);
  }
  save() { save(this.file, this.goals); }

  update(goalId, value) {
    const g = this.goals.find(x => x.id === goalId);
    if (!g) return;
    const prev = g.current;
    g.current = value;
    g.history.push({ v: value, prev, t: now() });

    // בדיקת milestones
    for (const ms of g.milestones) {
      const reached = g.unit === "₪" || g.unit === "ימים" ?
        value <= ms && prev > ms :
        value >= ms && prev < ms;
      if (reached) {
        log("GOALS", `🎯 Milestone: ${g.title} = ${ms}${g.unit}!`, "SUCCESS");
      }
    }

    // בדיקת השגת יעד
    const achieved = g.unit === "₪" || g.unit === "ימים" || g.unit === "תאונות" ?
      value <= g.target :
      value >= g.target;
    if (achieved && g.status === "active") {
      g.status = "achieved";
      g.achievedAt = now();
      log("GOALS", `🏆 יעד הושג: ${g.title}!`, "SUCCESS");
    }

    this.save();
  }

  async evaluate() {
    return await this.brain.thinkJSON(`
הערך 10 יעדים עסקיים:
${JSON.stringify(this.goals.map(g => ({
  id: g.id, title: g.title, target: g.target, current: g.current,
  unit: g.unit, priority: g.priority, category: g.category,
  owner: g.owner, deadline: g.deadline, status: g.status,
  progress: g.history.length > 0 ? g.history.slice(-3) : [],
  daysToDeadline: g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null,
})))}

לכל יעד, בדוק:
- האם בכיוון? מהו הקצב הנדרש?
- מה חוסם? מה הצעד הבא?
- האם היעד ריאלי? צריך עדכון?
- מי אחראי? האם עושה מספיק?

תחזיר JSON:
{
  "overallHealth": "healthy/warning/critical",
  "evaluations": [{
    "goalId": "...",
    "status": "on_track/at_risk/behind/achieved/needs_revision",
    "progressPercent": 0,
    "currentPace": "ahead/on_pace/behind_pace/stalled",
    "requiredPace": "...",
    "blockers": ["..."],
    "nextAction": "...",
    "actionOwner": "...",
    "actionDeadline": "...",
    "adjustedPlan": "...",
    "estimatedCompletion": "...",
    "confidence": 0.0-1.0,
    "riskLevel": "high/medium/low"
  }],
  "crossGoalDependencies": [{"goal1": "...", "goal2": "...", "dependency": "...", "recommendation": "..."}],
  "resourceConflicts": ["..."],
  "priorityAdjustments": [{"goalId": "...", "currentPriority": "...", "suggestedPriority": "...", "reason": "..."}]
}`);
  }
}

// ═══════════════════════════════════════
// EXPORT PART 3
// ═══════════════════════════════════════

module.exports = {
  PricingModule, QualityModule, NotificationModule, AnalyticsModule,
  Swarm, Adversarial, Dream, MetaLearner, Goals,
};
