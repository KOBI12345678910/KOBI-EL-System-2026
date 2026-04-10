// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 3/4
// PRICING + MARKETING + QUALITY + NOTIFICATIONS + ANALYTICS
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, Brain, Memory, ensure, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");

// Ensure subdirectories that Part 1 doesn't pre-create
["marketing"].forEach(d => ensure(path.join(CONFIG.DIR, d)));

// ═══════════════════════════════════════
// PRICING MODULE — Autonomous Price Optimization
// ═══════════════════════════════════════

class PricingModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "pricing", "state.json");
    this.data = load(this.file, {
      quotes: [],
      priceBook: {},
      discountPolicy: {
        maxDiscountPercent: 12,
        volumeDiscounts: [
          { minAmount: 2000000, percent: 3 },    // ₪20,000+ → 3%
          { minAmount: 5000000, percent: 5 },    // ₪50,000+ → 5%
          { minAmount: 10000000, percent: 8 },   // ₪100,000+ → 8%
          { minAmount: 20000000, percent: 10 },  // ₪200,000+ → 10%
        ],
        repeatCustomer: 5,    // +5% for repeat customers
        referralCredit: 3,    // +3% for referral source
        seasonalBoost: 0,     // +0..5% seasonal
        cashPayment: 2,       // +2% for full cash up-front
      },
      competitorIntel: {
        "מעקות ישראל":   { tier: "premium", typical: { railing_iron: 0.95, railing_aluminum: 1.00 } },
        "א.ב מסגרות":    { tier: "mid",     typical: { railing_iron: 0.88, gate_entry: 0.90 } },
        "פרגולות VIP":   { tier: "premium", typical: { pergola_aluminum: 1.05 } },
        "אלומיניום פלוס":{ tier: "mid",     typical: { railing_aluminum: 0.92, window_aluminum: 0.95 } },
      },
      winHistory: { won: 0, lost: 0, total: 0 },
      avgMargin: 0,
      marginTarget: 35,
    });
  }
  save() { save(this.file, this.data); }

  async generateQuote(data) {
    const quote = {
      id: `QT-${uid()}`,
      number: `${new Date().getFullYear()}-Q${(this.data.quotes.length + 1).toString().padStart(4, "0")}`,
      status: "draft",
      customer: {
        name: data.customerName || "",
        phone: data.customerPhone || "",
        email: data.customerEmail || "",
        address: data.address || "",
        city: data.city || "",
        isRepeat: data.isRepeat || false,
        fromReferral: data.fromReferral || false,
      },
      projectId: data.projectId || null,
      leadId: data.leadId || null,
      projectType: data.projectType || "",
      items: (data.items || []).map(i => ({
        id: uid(),
        description: i.description || "",
        qty: i.qty || 1,
        unit: i.unit || "unit",
        unitPrice: i.unitPrice || 0,
        discount: i.discount || 0,
        totalBeforeVat: Math.round((i.qty || 1) * (i.unitPrice || 0) - (i.discount || 0)),
      })),
      subtotal: 0,
      discountAmount: 0,
      discountPercent: 0,
      afterDiscount: 0,
      vat: 0,
      total: 0,
      marginPercent: 0,
      estimatedCost: data.estimatedCost || 0,
      validUntil: data.validUntil || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      paymentTerms: data.paymentTerms || "50% מקדמה, 50% בסיום",
      deliveryWeeks: data.deliveryWeeks || 3,
      warrantyYears: data.warrantyYears || 10,
      notes: data.notes || "",
      aiReasoning: null,
      winProbability: 0.5,
      createdAt: now(),
      sentAt: null, decidedAt: null,
    };

    quote.subtotal = quote.items.reduce((s, i) => s + i.totalBeforeVat, 0);

    // חישוב הנחה אוטומטית
    let discountPercent = 0;
    const pol = this.data.discountPolicy;
    for (const tier of pol.volumeDiscounts) {
      if (quote.subtotal >= tier.minAmount) discountPercent = Math.max(discountPercent, tier.percent);
    }
    if (data.isRepeat) discountPercent += pol.repeatCustomer;
    if (data.fromReferral) discountPercent += pol.referralCredit;
    if (data.cashPayment) discountPercent += pol.cashPayment;
    discountPercent += pol.seasonalBoost;
    discountPercent = clamp(discountPercent, 0, pol.maxDiscountPercent);

    quote.discountPercent = discountPercent;
    quote.discountAmount = Math.round(quote.subtotal * discountPercent / 100);
    quote.afterDiscount = quote.subtotal - quote.discountAmount;
    quote.vat = vatOf(quote.afterDiscount);
    quote.total = addVat(quote.afterDiscount);
    quote.marginPercent = quote.estimatedCost > 0
      ? Math.round(((quote.afterDiscount - quote.estimatedCost) / quote.afterDiscount) * 100)
      : 0;

    // AI reasoning
    quote.aiReasoning = await this.brain.thinkJSON(`
אתה מנהל Pricing של טכנו כל עוזי. נתח את ההצעה הזו.

═══ ההצעה ═══
לקוח: ${quote.customer.name} — ${quote.customer.city}
סוג: ${quote.projectType}
${quote.items.length} פריטים
Subtotal: ₪${shekel(quote.subtotal)}
הנחה: ${discountPercent}% (₪${shekel(quote.discountAmount)})
אחרי הנחה: ₪${shekel(quote.afterDiscount)}
מע"מ: ₪${shekel(quote.vat)}
סה"כ: ₪${shekel(quote.total)}
עלות משוערת: ₪${shekel(quote.estimatedCost)}
מרווח: ${quote.marginPercent}%
תקף עד: ${quote.validUntil}
אספקה: ${quote.deliveryWeeks} שבועות

═══ היסטוריית זכיות ═══
${JSON.stringify(this.data.winHistory)}
ממוצע מרווח: ${this.data.avgMargin}%
יעד מרווח: ${this.data.marginTarget}%

תחזיר JSON:
{
  "competitiveAnalysis": "ניתוח התחרות לסוג הפרויקט הזה",
  "valueProposition": "מה הערך המיוחד שמבדל אותנו",
  "negotiationRoom": 0,
  "winProbability": 0.0-1.0,
  "riskFactors": ["..."],
  "recommendation": "send_as_is/increase_price/lower_price/split_offer",
  "talkingPoints": ["נקודה 1", "נקודה 2", "נקודה 3"],
  "upsellOpportunities": ["הצעה 1"],
  "followUpStrategy": "...",
  "counterOfferPreparation": "אם הלקוח יתווכח — מה להציע"
}`);

    quote.winProbability = quote.aiReasoning?.winProbability || 0.5;

    this.data.quotes.push(quote);
    this.save();
    log("PRICING", `💰 הצעה: ${quote.number} — ${quote.customer.name} — ₪${shekel(quote.total)} (מרווח ${quote.marginPercent}%)`);
    return quote;
  }

  markQuoteSent(quoteId) {
    const q = this.data.quotes.find(x => x.id === quoteId);
    if (!q) return null;
    q.status = "sent";
    q.sentAt = now();
    this.save();
    return q;
  }

  markQuoteWon(quoteId, finalAmount = null) {
    const q = this.data.quotes.find(x => x.id === quoteId);
    if (!q) return null;
    q.status = "won";
    q.decidedAt = now();
    if (finalAmount) q.total = finalAmount;
    this.data.winHistory.won++;
    this.data.winHistory.total++;
    this.memory.add("successes", { type: "quote_won", number: q.number, amount: q.total, customer: q.customer.name });
    log("PRICING", `🏆 זכייה: ${q.number} — ₪${shekel(q.total)}`, "SUCCESS");
    this.save();
    return q;
  }

  markQuoteLost(quoteId, reason) {
    const q = this.data.quotes.find(x => x.id === quoteId);
    if (!q) return null;
    q.status = "lost";
    q.lostReason = reason;
    q.decidedAt = now();
    this.data.winHistory.lost++;
    this.data.winHistory.total++;
    this.memory.add("mistakes", { type: "quote_lost", number: q.number, amount: q.total, reason });
    log("PRICING", `😞 הפסד: ${q.number} — ${reason}`, "WARN");
    this.save();
    return q;
  }

  getWinRate() {
    return this.data.winHistory.total > 0
      ? (this.data.winHistory.won / this.data.winHistory.total * 100).toFixed(1) + "%"
      : "N/A";
  }

  async analyze() {
    const recent = this.data.quotes.slice(-30);
    const sent = recent.filter(q => q.status === "sent").length;
    const won = recent.filter(q => q.status === "won").length;
    const lost = recent.filter(q => q.status === "lost").length;
    const avgAmount = recent.length > 0
      ? recent.reduce((s, q) => s + q.total, 0) / recent.length
      : 0;

    return await this.brain.thinkJSON(`
אתה מנהל Pricing אוטונומי של טכנו כל עוזי.
נתח את אסטרטגיית התמחור.

═══ נתונים ═══
סה"כ הצעות: ${this.data.quotes.length}
30 אחרונות: שולחו ${sent}, זכו ${won}, הפסידו ${lost}
אחוז זכייה כללי: ${this.getWinRate()}
הצעה ממוצעת: ₪${shekel(Math.round(avgAmount))}

הפסדים אחרונים: ${JSON.stringify(recent.filter(q => q.status === "lost").slice(-5).map(q => ({
  number: q.number, type: q.projectType, amount: shekel(q.total), reason: q.lostReason,
})))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "...",
  "winRateAnalysis": {
    "current": 0, "benchmark": 0, "trend": "rising/stable/falling",
    "recommendations": ["..."]
  },
  "priceCompetitiveness": [{
    "projectType": "...", "ourPrice": 0, "competitorAvg": 0,
    "positioning": "premium/parity/discount", "recommendation": "..."
  }],
  "discountAnalysis": {
    "averageDiscount": 0, "tooHigh": false, "optimizationPotential": "..."
  },
  "lossReasons": [{
    "reason": "...", "frequency": 0, "mitigation": "..."
  }],
  "priceRecommendations": [{
    "projectType": "...", "action": "raise/lower/segment/bundle",
    "amount": 0, "reason": "..."
  }],
  "upsellOpportunities": [{
    "currentItem": "...", "upsellTo": "...", "uplift": 0
  }]
}`);
  }
}

// ═══════════════════════════════════════
// MARKETING MODULE — Campaigns + Ads + SEO
// ═══════════════════════════════════════

class MarketingModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "marketing", "state.json");
    this.data = load(this.file, {
      campaigns: [],
      ads: [],
      seoTopics: [],
      socialPosts: [],
      landingPages: [],
      channels: {
        google_ads:    { enabled: true,  monthlyBudget: 500000,  spent: 0, leads: 0, cpl: 0, roi: 0 },
        facebook_ads:  { enabled: true,  monthlyBudget: 300000,  spent: 0, leads: 0, cpl: 0, roi: 0 },
        instagram:     { enabled: true,  monthlyBudget: 150000,  spent: 0, leads: 0, cpl: 0, roi: 0 },
        tiktok:        { enabled: false, monthlyBudget: 0,       spent: 0, leads: 0, cpl: 0, roi: 0 },
        seo_organic:   { enabled: true,  monthlyBudget: 200000,  spent: 0, leads: 0, cpl: 0, roi: 0 },
        whatsapp_ads:  { enabled: true,  monthlyBudget: 100000,  spent: 0, leads: 0, cpl: 0, roi: 0 },
        email_marketing:{enabled: true,  monthlyBudget: 50000,   spent: 0, leads: 0, cpl: 0, roi: 0 },
      },
      stats: {
        totalSpent: 0, totalLeads: 0, totalConversions: 0,
        avgCPL: 0, avgCPA: 0, blendedROI: 0,
      },
    });
  }
  save() { save(this.file, this.data); }

  createCampaign(data) {
    const c = {
      id: `CMP-${uid()}`,
      name: data.name,
      channel: data.channel || "google_ads",
      objective: data.objective || "lead_generation",
      budget: data.budget || 0,
      spent: 0,
      startDate: data.startDate || today(),
      endDate: data.endDate || null,
      status: "active",
      targeting: {
        locations: data.locations || ["תל אביב", "מרכז"],
        ageRange: data.ageRange || "30-65",
        interests: data.interests || [],
        languages: data.languages || ["he"],
      },
      creatives: data.creatives || [],
      keywords: data.keywords || [],
      results: { impressions: 0, clicks: 0, leads: 0, conversions: 0, revenue: 0, ctr: 0, cpc: 0, cpl: 0, roas: 0 },
      createdAt: now(),
    };
    this.data.campaigns.push(c);
    this.save();
    log("MKT", `📣 קמפיין: ${c.name} — ${c.channel} — ₪${shekel(c.budget)}`);
    return c;
  }

  recordAdSpend(campaignId, amount, results = {}) {
    const c = this.data.campaigns.find(x => x.id === campaignId);
    if (!c) return null;
    c.spent += amount;
    c.results.impressions += results.impressions || 0;
    c.results.clicks += results.clicks || 0;
    c.results.leads += results.leads || 0;
    c.results.conversions += results.conversions || 0;
    c.results.revenue += results.revenue || 0;

    if (c.results.clicks > 0) c.results.ctr = c.results.clicks / (c.results.impressions || 1);
    if (c.results.leads > 0) c.results.cpl = Math.round(c.spent / c.results.leads);
    if (c.spent > 0 && c.results.revenue > 0) c.results.roas = (c.results.revenue / c.spent).toFixed(2);

    // עדכון ערוץ
    const ch = this.data.channels[c.channel];
    if (ch) {
      ch.spent += amount;
      ch.leads += results.leads || 0;
      if (ch.leads > 0) ch.cpl = Math.round(ch.spent / ch.leads);
      if (ch.spent > 0) ch.roi = ((results.revenue || 0) / amount).toFixed(2);
    }

    this.data.stats.totalSpent += amount;
    this.data.stats.totalLeads += results.leads || 0;
    this.data.stats.totalConversions += results.conversions || 0;
    if (this.data.stats.totalLeads > 0) this.data.stats.avgCPL = Math.round(this.data.stats.totalSpent / this.data.stats.totalLeads);
    if (this.data.stats.totalConversions > 0) this.data.stats.avgCPA = Math.round(this.data.stats.totalSpent / this.data.stats.totalConversions);

    this.save();
    return c;
  }

  async generateSEOContent(topic, language = "he") {
    const content = await this.brain.thinkJSON(`
אתה כותב תוכן SEO מקצועי בעברית של טכנו כל עוזי.
עסק: 80 שנה בענף המתכת, עבודות ברזל/אלומיניום/זכוכית, תל אביב והמרכז.
יעד: לדרג גבוה בגוגל + להמיר מבקרים ללידים.

נושא: ${topic}
שפה: ${language}

תחזיר JSON:
{
  "title": "כותרת (60-70 תווים, SEO-optimized)",
  "metaDescription": "Meta description (150-160 תווים)",
  "h1": "H1 עיקרי",
  "slug": "url-slug",
  "targetKeywords": ["מילה 1", "מילה 2", "מילה 3"],
  "sections": [
    { "heading": "H2", "points": ["נקודה 1", "נקודה 2"], "wordCount": 200 }
  ],
  "callToAction": "CTA חזק",
  "internalLinks": ["דף 1", "דף 2"],
  "targetWordCount": 1200,
  "schemaType": "LocalBusiness/Article/Product",
  "estimatedMonthlySearches": 0,
  "competitionLevel": "low/medium/high",
  "winProbability": 0.0-1.0
}`);

    if (content) {
      this.data.seoTopics.push({ ...content, topic, language, createdAt: now(), status: "draft" });
      this.save();
      log("MKT", `🔍 SEO: ${content.title}`);
    }
    return content;
  }

  async analyze() {
    const activeCampaigns = this.data.campaigns.filter(c => c.status === "active");

    return await this.brain.thinkJSON(`
אתה CMO אוטונומי של טכנו כל עוזי + קובי אלקיים נדל"ן.
נתח את הביצועים השיווקיים.

═══ נתונים ═══
קמפיינים פעילים: ${activeCampaigns.length}
סה"כ הוצאה: ₪${shekel(this.data.stats.totalSpent)}
סה"כ לידים: ${this.data.stats.totalLeads}
CPL ממוצע: ₪${shekel(this.data.stats.avgCPL)}
CPA ממוצע: ₪${shekel(this.data.stats.avgCPA)}

ערוצים: ${JSON.stringify(this.data.channels)}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "...",
  "channelPerformance": [{
    "channel": "...", "spent": 0, "leads": 0, "cpl": 0, "roi": 0,
    "verdict": "scale_up/maintain/optimize/cut"
  }],
  "budgetReallocation": [{
    "from": "...", "to": "...", "amount": 0, "expectedImpact": "..."
  }],
  "contentGaps": ["נושאים חסרים"],
  "competitorInsights": ["תובנה 1"],
  "creativeFatigue": [{"campaign": "...", "signal": "...", "action": "..."}],
  "recommendations": ["..."]
}`);
  }
}

// ═══════════════════════════════════════
// QUALITY MODULE — QC + Warranties + Complaints
// ═══════════════════════════════════════

class QualityModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "quality", "state.json");
    this.data = load(this.file, {
      inspections: [], defects: [], warranties: [], complaints: [], returns: [],
      standards: {
        railing_iron: ["ת\"י 1142", "גובה ≥105 ס\"מ", "מרווח ≤10 ס\"מ", "ללא חלודה", "ריתוכים מלאים"],
        railing_aluminum: ["ת\"י 1142", "ללא שריטות", "צבע אבקה אחיד"],
        railing_glass: ["ת\"י 1142", "זכוכית מחוסמת + למינציה", "מלחציים בטוחים"],
        gate_electric_sliding: ["ת\"י 1201", "פוטוסל חובה", "נורית הבזק", "הארקה"],
        gate_entry: ["צירים כבדים", "מנעול איכותי", "סוגר אוטומטי"],
        fence_iron: ["עמודים יציבים", "יסודות בטון", "מרווחים אחידים"],
        pergola_aluminum: ["עמידות רוח 100+ קמ\"ש", "ניקוז", "חיבורים חזקים"],
        door_iron: ["בידוד תרמי", "מנעול רב-נקודתי", "איטום"],
        window_aluminum: ["זכוכית תרמית", "אטמים", "פתיחה חלקה"],
        bars: ["מוטות מלאים", "חיבורים חזקים", "ללא פתחים מעל 12 ס\"מ"],
      },
      kpis: { defectRate: 0, firstTimeRightPercent: 0, warrantyClaimRate: 0, customerSatisfaction: 0, nps: 0 },
    });
  }
  save() { save(this.file, this.data); }

  createInspection(data) {
    const i = {
      id: `QC-${uid()}`, status: "pending",
      projectId: data.projectId || null,
      stage: data.stage || "pre_delivery", // incoming_materials, in_production, pre_delivery, post_installation, warranty_check
      inspector: data.inspector || "",
      checkedAt: null,
      checklist: data.checklist || [],
      result: null, // pass, fail, conditional
      defects: [],
      photos: data.photos || [],
      notes: data.notes || "",
      signedOff: false,
      createdAt: now(),
    };
    this.data.inspections.push(i);
    this.save();
    log("QA", `🔍 בדיקה: ${i.id} — שלב: ${i.stage}`);
    return i;
  }

  completeInspection(inspId, data) {
    const i = this.data.inspections.find(x => x.id === inspId);
    if (!i) return null;
    i.status = "completed";
    i.result = data.result || "pass";
    i.checkedAt = now();
    i.defects = data.defects || [];
    i.notes = data.notes || i.notes;
    i.signedOff = data.result === "pass";

    for (const d of (data.defects || [])) {
      this.reportDefect({ ...d, projectId: i.projectId, inspectionId: i.id });
    }

    this.save();
    log("QA", `${i.result === "pass" ? "✅" : "❌"} בדיקה ${inspId}: ${i.result}`);
    return i;
  }

  reportDefect(data) {
    const d = {
      id: `DEF-${uid()}`,
      projectId: data.projectId || null,
      inspectionId: data.inspectionId || null,
      type: data.type || "cosmetic", // cosmetic, structural, functional, safety, dimensional
      severity: data.severity || "minor", // critical, major, minor, cosmetic
      description: data.description || "",
      location: data.location || "",
      rootCause: data.rootCause || "unknown",
      correctiveAction: data.correctiveAction || "",
      preventiveAction: data.preventiveAction || "",
      assignedTo: data.assignedTo || null,
      status: "open",
      photos: data.photos || [],
      estimatedCost: data.cost || 0,
      actualCost: 0,
      createdAt: now(),
      resolvedAt: null,
    };
    this.data.defects.push(d);
    this.memory.add("mistakes", { type: "defect", defectType: d.type, severity: d.severity, projectId: d.projectId });
    this.save();

    const icon = d.severity === "critical" ? "🚨" : d.severity === "major" ? "⚠️" : "ℹ️";
    log("QA", `${icon} פגם: ${d.type}/${d.severity} — ${d.description}`, d.severity === "critical" ? "ERROR" : "WARN");
    return d;
  }

  resolveDefect(defectId, data) {
    const d = this.data.defects.find(x => x.id === defectId);
    if (!d) return null;
    d.status = "resolved";
    d.resolvedAt = now();
    d.resolutionNotes = data.notes || "";
    d.rootCause = data.rootCause || d.rootCause;
    d.actualCost = data.actualCost || 0;
    this.save();
    return d;
  }

  createWarranty(data) {
    const w = {
      id: `WAR-${uid()}`,
      projectId: data.projectId || null,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || "",
      address: data.address || "",
      projectType: data.projectType || "",
      startDate: data.startDate || today(),
      endDate: data.endDate || new Date(Date.now() + 10 * 365 * 86400000).toISOString().split("T")[0],
      durationYears: data.durationYears || 10,
      coverage: data.coverage || ["material_defects", "workmanship", "structural_integrity"],
      exclusions: data.exclusions || ["normal_wear", "misuse", "extreme_weather", "third_party_damage"],
      status: "active",
      claims: [],
      createdAt: now(),
    };
    this.data.warranties.push(w);
    this.save();
    log("QA", `🛡️ אחריות: ${w.customerName} — ${w.durationYears} שנים`);
    return w;
  }

  fileWarrantyClaim(warrantyId, data) {
    const w = this.data.warranties.find(x => x.id === warrantyId);
    if (!w) return null;
    const claim = {
      id: `CLM-${uid()}`,
      date: data.date || today(),
      description: data.description || "",
      status: "open",
      cost: 0,
      resolution: null,
      createdAt: now(),
    };
    w.claims.push(claim);
    this.memory.add("mistakes", { type: "warranty_claim", warrantyId: w.id });
    this.save();
    log("QA", `📋 תביעת אחריות: ${w.customerName} — ${data.description}`, "WARN");
    return claim;
  }

  recordComplaint(data) {
    const c = {
      id: `CMP-${uid()}`,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || "",
      projectId: data.projectId || null,
      channel: data.channel || "phone", // phone, email, whatsapp, in_person, review_site
      category: data.category || "general", // quality, delay, price, communication, behavior, other
      severity: data.severity || "medium",
      description: data.description || "",
      desiredResolution: data.desiredResolution || "",
      status: "open",
      assignedTo: null,
      resolution: null,
      satisfactionAfter: null,
      createdAt: now(),
      resolvedAt: null,
    };
    this.data.complaints.push(c);
    this.memory.add("mistakes", { type: "complaint", category: c.category });
    this.save();

    const icon = c.severity === "high" ? "🚨" : "⚠️";
    log("QA", `${icon} תלונה: ${c.customerName} — ${c.category}`, "WARN");
    return c;
  }

  calculateKPIs() {
    const totalInsp = this.data.inspections.length || 1;
    const passedInsp = this.data.inspections.filter(i => i.result === "pass").length;
    const totalDef = this.data.defects.length;
    const criticalDef = this.data.defects.filter(d => d.severity === "critical" || d.severity === "major").length;
    const activeWarranties = this.data.warranties.filter(w => w.status === "active").length || 1;
    const totalClaims = this.data.warranties.reduce((s, w) => s + (w.claims?.length || 0), 0);
    const openComplaints = this.data.complaints.filter(c => c.status === "open").length;
    const totalComplaints = this.data.complaints.length;

    this.data.kpis = {
      defectRate: totalInsp > 0 ? Math.round((criticalDef / totalInsp) * 1000) / 10 : 0,
      firstTimeRightPercent: Math.round((passedInsp / totalInsp) * 100),
      warrantyClaimRate: Math.round((totalClaims / activeWarranties) * 1000) / 10,
      customerSatisfaction: totalComplaints === 0 ? 100 : Math.max(0, Math.round(100 - (openComplaints / Math.max(1, totalComplaints)) * 100)),
      nps: 0, // calculated separately
    };
    this.save();
    return this.data.kpis;
  }

  async analyze() {
    const kpis = this.calculateKPIs();
    const openDefects = this.data.defects.filter(d => d.status === "open");
    const openComplaints = this.data.complaints.filter(c => c.status === "open");

    return await this.brain.thinkJSON(`
אתה מנהל איכות אוטונומי של טכנו כל עוזי.

═══ נתונים ═══
בדיקות: ${this.data.inspections.length}
פגמים: ${this.data.defects.length} (${openDefects.length} פתוחים)
אחריות פעילה: ${this.data.warranties.filter(w => w.status === "active").length}
תלונות: ${this.data.complaints.length} (${openComplaints.length} פתוחות)

KPIs:
- First Time Right: ${kpis.firstTimeRightPercent}%
- Defect Rate: ${kpis.defectRate}%
- Warranty Claim Rate: ${kpis.warrantyClaimRate}%
- Customer Satisfaction: ${kpis.customerSatisfaction}%

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "...",
  "qualityTrend": "improving/stable/declining",
  "rootCauseAnalysis": [{
    "pattern": "...", "frequency": 0, "rootCause": "...", "recommendation": "..."
  }],
  "preventiveActions": [{
    "action": "...", "targetArea": "...", "expectedImpact": "..."
  }],
  "trainingNeeds": [{
    "skill": "...", "audience": "...", "priority": "..."
  }],
  "processImprovements": [{"process": "...", "change": "...", "benefit": "..."}]
}`);
  }
}

// ═══════════════════════════════════════
// NOTIFICATION MODULE — Multi-channel
// ═══════════════════════════════════════

class NotificationModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "notifications", "state.json");
    this.data = load(this.file, {
      queue: [], sent: [], failed: [],
      templates: {
        lead_new: "שלום {name}! קיבלנו את הפנייה שלך. ניצור איתך קשר תוך 24 שעות. טכנו כל עוזי 🛠️",
        measurement_reminder: "תזכורת: מדידה מחר {time} ב-{address}. {measurer} יגיע. 03-XXXXXXX",
        quote_sent: "שלום {name}, הצעת מחיר {number} בסך ₪{total} נשלחה. תקפה עד {validUntil}.",
        installation_scheduled: "שלום {name}, ההתקנה מתוכננת ל-{date}. הצוות יגיע בין {timeStart}-{timeEnd}.",
        installation_complete: "שלום {name}, ההתקנה הושלמה 🎉 תודה על האמון! אחריות 10 שנים פעילה.",
        invoice_sent: "שלום {name}, חשבונית {number} ע\"ס ₪{total} נשלחה. לתשלום עד {dueDate}.",
        payment_reminder: "שלום {name}, תזכורת: חשבונית {number} באיחור של {daysOverdue} ימים. ₪{amount}.",
        warranty_reminder: "שלום {name}, האחריות על {project} תסתיים בעוד חודש.",
        follow_up: "שלום {name}, רצינו לוודא שהכל בסדר עם ה{project}. מוזמן להתקשר בכל שאלה.",
      },
      channels: {
        whatsapp: { enabled: true, priority: 1, dailyLimit: 500, sent: 0 },
        sms:      { enabled: true, priority: 2, dailyLimit: 200, sent: 0 },
        email:    { enabled: true, priority: 3, dailyLimit: 1000, sent: 0 },
        push:     { enabled: false, priority: 4, dailyLimit: 0,    sent: 0 },
      },
      stats: { total: 0, delivered: 0, failed: 0, clicked: 0 },
    });
  }
  save() { save(this.file, this.data); }

  render(templateKey, vars) {
    const tpl = this.data.templates[templateKey];
    if (!tpl) return null;
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }

  enqueue(data) {
    const n = {
      id: `NOT-${uid()}`,
      channel: data.channel || "whatsapp",
      to: data.to,
      toName: data.toName || "",
      template: data.template || null,
      vars: data.vars || {},
      message: data.message || (data.template ? this.render(data.template, data.vars || {}) : ""),
      priority: data.priority || "normal",
      scheduledAt: data.scheduledAt || now(),
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      leadId: data.leadId || null,
      projectId: data.projectId || null,
      createdAt: now(),
    };
    this.data.queue.push(n);
    this.save();
    log("NOTIFY", `📨 ${n.channel} → ${n.toName || n.to}`);
    return n;
  }

  async processQueue() {
    const ready = this.data.queue.filter(n =>
      n.status === "queued" && new Date(n.scheduledAt).getTime() <= Date.now()
    );
    for (const n of ready) {
      n.status = "sending";
      n.attempts++;
      try {
        // TODO: integrate real providers (Twilio, WhatsApp Business, SendGrid)
        n.status = "sent";
        n.sentAt = now();
        this.data.sent.push(n);
        this.data.queue = this.data.queue.filter(x => x.id !== n.id);
        this.data.stats.total++;
        this.data.stats.delivered++;
        const ch = this.data.channels[n.channel];
        if (ch) ch.sent++;
      } catch (e) {
        if (n.attempts >= n.maxAttempts) {
          n.status = "failed";
          n.error = e.message;
          this.data.failed.push(n);
          this.data.queue = this.data.queue.filter(x => x.id !== n.id);
          this.data.stats.failed++;
        } else {
          n.status = "queued";
          n.scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        }
      }
    }
    this.save();
  }

  resetDailyCounters() {
    for (const ch of Object.values(this.data.channels)) ch.sent = 0;
    this.save();
  }
}

// ═══════════════════════════════════════
// ANALYTICS MODULE — Cross-module Intelligence
// ═══════════════════════════════════════

class AnalyticsModule {
  constructor(brain, memory, modules) {
    this.brain = brain;
    this.memory = memory;
    this.modules = modules; // { erp, crm, bom, hr, finance, ops, pricing, marketing, quality }
    this.file = path.join(CONFIG.DIR, "analytics", "state.json");
    this.data = load(this.file, {
      snapshots: [],
      reports: [],
      trends: {},
      kpiHistory: [],
      insights: [],
    });
  }
  save() { save(this.file, this.data); }

  takeSnapshot() {
    const m = this.modules;
    const snap = {
      id: `SNAP-${uid()}`,
      t: now(),
      erp: m.erp ? {
        totalProjects: m.erp.data.projects.length,
        activeProjects: m.erp.data.projects.filter(p => !["completed", "cancelled", "lost"].includes(p.status)).length,
        inventoryItems: m.erp.data.inventory.length,
        openPOs: m.erp.data.purchaseOrders?.filter(p => !["received", "cancelled"].includes(p.status)).length || 0,
        openWOs: m.erp.data.workOrders?.filter(w => !["completed", "cancelled"].includes(w.status)).length || 0,
      } : null,
      crm: m.crm ? {
        totalLeads: m.crm.data.leads.length,
        pipeline: Object.fromEntries(Object.entries(m.crm.data.pipeline || {}).map(([k, v]) => [k, (v || []).length])),
        activeDeals: m.crm.data.deals?.filter(d => d.status === "open").length || 0,
      } : null,
      bom: m.bom ? {
        templates: m.bom.data.templates.length,
        activeBOMs: m.bom.data.activeBOMs.length,
      } : null,
      hr: m.hr ? {
        activeEmployees: m.hr.getActiveEmployees().length,
        openPositions: m.hr.data.recruitment.openPositions.filter(p => p.status === "open").length,
        pendingLeaves: m.hr.data.leaves.filter(l => l.status === "pending").length,
      } : null,
      finance: m.finance ? {
        cashflowBalance: m.finance.data.cashflow.balance,
        overdueInvoices: m.finance.getOverdueInvoices().length,
        vatBalance: m.finance.data.taxes.vatBalance,
        monthlyPnL: m.finance.getMonthlyPnL(),
      } : null,
      ops: m.ops ? {
        pendingMeasurements: m.ops.getPendingMeasurements().length,
        pendingInstallations: m.ops.getPendingInstallations().length,
        openIncidents: m.ops.getOpenIncidents().length,
      } : null,
      pricing: m.pricing ? {
        totalQuotes: m.pricing.data.quotes.length,
        winRate: m.pricing.getWinRate(),
      } : null,
      marketing: m.marketing ? {
        campaigns: m.marketing.data.campaigns.length,
        totalLeads: m.marketing.data.stats.totalLeads,
        avgCPL: m.marketing.data.stats.avgCPL,
      } : null,
      quality: m.quality ? {
        openDefects: m.quality.data.defects.filter(d => d.status === "open").length,
        openComplaints: m.quality.data.complaints.filter(c => c.status === "open").length,
        kpis: m.quality.data.kpis,
      } : null,
    };
    this.data.snapshots.push(snap);
    this.data.snapshots = this.data.snapshots.slice(-500);
    this.save();
    return snap;
  }

  async generateExecutiveReport() {
    const snap = this.takeSnapshot();
    const last10 = this.data.snapshots.slice(-10);

    const report = await this.brain.thinkJSON(`
אתה אנליסט עסקי בכיר של טכנו כל עוזי + קובי אלקיים נדל"ן.
הפק דוח מנהלים שבועי.

═══ Snapshot נוכחי ═══
${JSON.stringify(snap, null, 2)}

═══ טרנדים (10 Snapshots אחרונים) ═══
${JSON.stringify(last10.map(s => ({
  t: s.t,
  projects: s.erp?.activeProjects,
  leads: s.crm?.totalLeads,
  cash: s.finance?.cashflowBalance,
  overdue: s.finance?.overdueInvoices,
})))}

תחזיר JSON:
{
  "executiveSummary": "2-3 משפטים",
  "overallHealth": 0-100,
  "status": "healthy/warning/critical",
  "keyMetrics": {
    "revenueMTD": 0, "profitMTD": 0,
    "pipelineValue": 0, "cashPosition": 0
  },
  "winsOfTheWeek": ["..."],
  "concernsOfTheWeek": ["..."],
  "trendAnalysis": {
    "projects": "rising/stable/falling",
    "leads": "rising/stable/falling",
    "cash": "rising/stable/falling",
    "quality": "rising/stable/falling"
  },
  "criticalActions": [{
    "action": "...", "owner": "...", "deadline": "...", "impact": "..."
  }],
  "opportunities": [{
    "opportunity": "...", "estimatedValue": 0, "effort": "low/medium/high"
  }],
  "weeklyForecast": {
    "expectedClosures": 0, "expectedRevenue": 0,
    "expectedExpenses": 0, "expectedNetCash": 0
  },
  "strategicRecommendations": ["..."]
}`);

    if (report) {
      this.data.reports.push({ ...report, _id: uid(), _t: now() });
      this.data.reports = this.data.reports.slice(-100);
      this.save();
    }
    return report;
  }
}

// ═══════════════════════════════════════
// EXPORT PART 3
// ═══════════════════════════════════════

module.exports = { PricingModule, MarketingModule, QualityModule, NotificationModule, AnalyticsModule };
