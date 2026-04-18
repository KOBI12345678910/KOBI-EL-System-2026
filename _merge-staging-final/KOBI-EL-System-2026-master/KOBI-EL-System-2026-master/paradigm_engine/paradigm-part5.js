// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 5
// GROWTH + COMPETITIVE INTEL + INTEGRATIONS + INTERNATIONAL REAL ESTATE
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");
const fs = require("fs");

// Ensure subdirectories Part 1's DIRS doesn't create
["growth", "competitive", "integrations", "international", "dashboard", "temporal", "supplychain"].forEach(d => {
  const p = path.join(CONFIG.DIR, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ═══════════════════════════════════════
// GROWTH ENGINE — שיווק דיגיטלי ואוטומציה
// ═══════════════════════════════════════

class GrowthEngine {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "growth", "state.json");
    this.data = load(this.file, {
      campaigns: [],
      channels: {
        google_ads:    { enabled: true,  monthlyBudget: 500000,  spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
        facebook_ads:  { enabled: true,  monthlyBudget: 300000,  spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
        instagram:     { enabled: true,  monthlyBudget: 200000,  spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
        tiktok:        { enabled: false, monthlyBudget: 0,       spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
        linkedin:      { enabled: true,  monthlyBudget: 150000,  spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
        seo_organic:   { enabled: true,  monthlyBudget: 300000,  spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
        whatsapp_ads:  { enabled: true,  monthlyBudget: 100000,  spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
        email_drip:    { enabled: true,  monthlyBudget: 50000,   spent: 0, leads: 0, cpl: 0, roas: 0, impressions: 0, clicks: 0, ctr: 0 },
      },
      seoContent: [],
      socialPosts: [],
      landingPages: [],
      audiences: {
        "homeowners_tlv":    { size: 85000, cpc: 850, avgConversion: 0.025, description: "בעלי בתים פרטיים ת\"א + מרכז" },
        "luxury_investors":  { size: 12000, cpc: 2500, avgConversion: 0.018, description: "משקיעי נדל\"ן יוקרה בינלאומיים" },
        "commercial_builders": { size: 4500, cpc: 1800, avgConversion: 0.035, description: "קבלני בניה + מהנדסי ביצוע" },
        "architects":        { size: 8500, cpc: 1200, avgConversion: 0.042, description: "אדריכלים ומעצבי פנים" },
      },
      keywords: [
        { term: "מעקות ברזל", volume: 2400, difficulty: 45, position: null, cpc: 850 },
        { term: "מעקות אלומיניום", volume: 1900, difficulty: 42, position: null, cpc: 780 },
        { term: "מעקות זכוכית", volume: 1600, difficulty: 48, position: null, cpc: 920 },
        { term: "שער חשמלי", volume: 3200, difficulty: 52, position: null, cpc: 1050 },
        { term: "פרגולות אלומיניום", volume: 2800, difficulty: 55, position: null, cpc: 1180 },
        { term: "מסגריה בתל אביב", volume: 880, difficulty: 38, position: null, cpc: 650 },
        { term: "luxury apartments tel aviv", volume: 3600, difficulty: 68, position: null, cpc: 4200 },
        { term: "tel aviv real estate investment", volume: 2100, difficulty: 65, position: null, cpc: 3800 },
        { term: "appartement tel aviv", volume: 850, difficulty: 45, position: null, cpc: 2400 },
      ],
      stats: { totalSpent: 0, totalLeads: 0, totalConversions: 0, avgCPL: 0, avgCPA: 0, blendedROAS: 0 },
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
        audiences: data.audiences || ["homeowners_tlv"],
        locations: data.locations || ["תל אביב", "רמת גן", "גבעתיים"],
        ageRange: data.ageRange || "30-65",
        interests: data.interests || [],
        languages: data.languages || ["he"],
        excludeAudiences: data.excludeAudiences || [],
      },
      creatives: data.creatives || [],
      keywords: data.keywords || [],
      landingPageUrl: data.landingPageUrl || null,
      results: {
        impressions: 0, clicks: 0, leads: 0, conversions: 0,
        revenue: 0, ctr: 0, cpc: 0, cpl: 0, cpa: 0, roas: 0, qualityScore: null,
      },
      createdAt: now(),
    };
    this.data.campaigns.push(c);
    this.save();
    log("GROWTH", `📣 קמפיין: ${c.name} — ${c.channel} — ₪${shekel(c.budget)}`);
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

    if (c.results.impressions > 0) c.results.ctr = c.results.clicks / c.results.impressions;
    if (c.results.clicks > 0) c.results.cpc = Math.round(c.spent / c.results.clicks);
    if (c.results.leads > 0) c.results.cpl = Math.round(c.spent / c.results.leads);
    if (c.results.conversions > 0) c.results.cpa = Math.round(c.spent / c.results.conversions);
    if (c.spent > 0 && c.results.revenue > 0) c.results.roas = Number((c.results.revenue / c.spent).toFixed(2));

    // עדכון ערוץ
    const ch = this.data.channels[c.channel];
    if (ch) {
      ch.spent += amount;
      ch.leads += results.leads || 0;
      ch.impressions += results.impressions || 0;
      ch.clicks += results.clicks || 0;
      if (ch.impressions > 0) ch.ctr = ch.clicks / ch.impressions;
      if (ch.leads > 0) ch.cpl = Math.round(ch.spent / ch.leads);
      if (amount > 0 && results.revenue) ch.roas = Number((results.revenue / amount).toFixed(2));
    }

    // עדכון סטטיסטיקות כלליות
    this.data.stats.totalSpent += amount;
    this.data.stats.totalLeads += results.leads || 0;
    this.data.stats.totalConversions += results.conversions || 0;
    if (this.data.stats.totalLeads > 0) this.data.stats.avgCPL = Math.round(this.data.stats.totalSpent / this.data.stats.totalLeads);
    if (this.data.stats.totalConversions > 0) this.data.stats.avgCPA = Math.round(this.data.stats.totalSpent / this.data.stats.totalConversions);

    this.save();
    return c;
  }

  async generateSEOContent(topic, options = {}) {
    const language = options.language || "he";
    const biz = options.biz || "techno";

    const content = await this.brain.thinkJSON(`
אתה כותב תוכן SEO מקצועי של ${biz === "techno" ? "טכנו כל עוזי (מתכת, 80 שנה, ת\"א)" : "קובי אלקיים נדל\"ן (יוקרה בינלאומי)"}.
מטרה: לדרג גבוה בגוגל + להמיר מבקרים ללידים.

נושא: ${topic}
שפה: ${language === "he" ? "עברית" : language === "en" ? "English" : "Français"}

תחזיר JSON:
{
  "title": "כותרת (60-70 תווים, SEO-optimized)",
  "metaDescription": "Meta description (150-160 תווים)",
  "h1": "H1 עיקרי",
  "slug": "url-slug",
  "targetKeywords": ["מילה 1", "מילה 2", "מילה 3"],
  "sections": [
    { "heading": "H2 כותרת", "keyPoints": ["נקודה 1", "נקודה 2"], "wordCount": 200, "keywords": [] }
  ],
  "callToAction": "CTA חזק",
  "internalLinks": [{"text": "טקסט קישור", "url": "..."}],
  "externalSources": [{"text": "טקסט קישור", "url": "..."}],
  "targetWordCount": 1200,
  "schemaType": "LocalBusiness/Article/Product",
  "estimatedMonthlySearches": 0,
  "competitionLevel": "low/medium/high",
  "winProbability": 0.0-1.0,
  "expectedRankingMonths": 3,
  "conversionElements": ["טופס ליד", "סרטון", "גלריה"]
}`);

    if (content) {
      this.data.seoContent.push({ ...content, topic, language, biz, status: "draft", createdAt: now() });
      this.save();
      log("GROWTH", `🔍 SEO: ${content.title} (${language})`);
    }
    return content;
  }

  async generateSocialPost(data) {
    const post = await this.brain.thinkJSON(`
אתה מנהל סושיאל מדיה של ${data.biz === "realestate" ? "קובי אלקיים נדל\"ן" : "טכנו כל עוזי"}.
צור פוסט עבור ${data.platform || "facebook"}.

נושא: ${data.topic}
קהל יעד: ${data.audience || "homeowners_tlv"}
שפה: ${data.language || "he"}
מטרה: ${data.goal || "lead_generation"}

תחזיר JSON:
{
  "platform": "${data.platform || "facebook"}",
  "content": "תוכן הפוסט",
  "hashtags": ["#מסגריה", "#תלאביב"],
  "mediaType": "image/video/carousel",
  "mediaDescription": "תיאור המדיה שצריך להפיק",
  "cta": "קריאה לפעולה",
  "bestTimeToPost": "שעה + יום",
  "expectedReach": 0,
  "expectedEngagement": 0,
  "targetAudiences": ["${data.audience || "homeowners_tlv"}"]
}`);

    if (post) {
      this.data.socialPosts.push({ ...post, status: "draft", topic: data.topic, createdAt: now() });
      this.save();
      log("GROWTH", `📱 ${post.platform}: ${post.content?.substring(0, 50) || "draft"}...`);
    }
    return post;
  }

  getBestChannel() {
    const channels = Object.entries(this.data.channels)
      .filter(([_, c]) => c.enabled && c.leads > 0)
      .sort((a, b) => (b[1].roas || 0) - (a[1].roas || 0));
    return channels.length > 0 ? { name: channels[0][0], ...channels[0][1] } : null;
  }

  getWorstChannel() {
    const channels = Object.entries(this.data.channels)
      .filter(([_, c]) => c.enabled && c.spent > 10000)
      .sort((a, b) => (a[1].roas || 0) - (b[1].roas || 0));
    return channels.length > 0 ? { name: channels[0][0], ...channels[0][1] } : null;
  }

  async analyze() {
    const activeCampaigns = this.data.campaigns.filter(c => c.status === "active");
    const best = this.getBestChannel();
    const worst = this.getWorstChannel();

    return await this.brain.thinkJSON(`
אתה CMO אוטונומי של טכנו כל עוזי + קובי אלקיים נדל"ן.
נתח את ביצועי השיווק והצע אופטימיזציות.

═══ נתונים ═══
קמפיינים פעילים: ${activeCampaigns.length}
סה"כ הוצאה: ₪${shekel(this.data.stats.totalSpent)}
סה"כ לידים: ${this.data.stats.totalLeads}
CPL ממוצע: ₪${shekel(this.data.stats.avgCPL)}

ערוצים: ${JSON.stringify(this.data.channels)}
ערוץ מוביל: ${best?.name || "N/A"}
ערוץ חלש: ${worst?.name || "N/A"}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "summary": "...",
  "channelPerformance": [{
    "channel": "...", "verdict": "scale_up/maintain/optimize/cut",
    "recommendation": "...", "budgetChange": 0
  }],
  "budgetReallocation": [{"from": "...", "to": "...", "amount": 0, "expectedImpact": "..."}],
  "creativeFatigue": [{"campaign": "...", "signal": "...", "action": "..."}],
  "contentGaps": ["..."],
  "keywordOpportunities": [{"keyword": "...", "volume": 0, "difficulty": 0, "priority": "..."}],
  "audienceInsights": [{"audience": "...", "insight": "..."}]
}`);
  }
}

// ═══════════════════════════════════════
// COMPETITIVE INTELLIGENCE
// ═══════════════════════════════════════

class CompetitiveIntel {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "competitive", "state.json");
    this.data = load(this.file, {
      competitors: [
        {
          id: "c1", name: "מעקות ישראל", domain: "maakotisrael.co.il",
          tier: "premium", founded: 1995, employees: 25, estimatedRevenue: agorot(8000000),
          strengths: ["מותג מוכר", "איכות גבוהה", "אחריות 15 שנה"],
          weaknesses: ["מחיר גבוה", "זמן אספקה ארוך"],
          marketShare: 0.18, priceIndex: 1.05,
          products: ["מעקות ברזל", "מעקות אלומיניום"],
          channels: ["google_ads", "facebook", "seo"],
          lastChecked: null,
        },
        {
          id: "c2", name: "א.ב מסגרות", domain: "abmetalworks.co.il",
          tier: "mid", founded: 2008, employees: 12, estimatedRevenue: agorot(3500000),
          strengths: ["מחיר אטרקטיבי", "זמן אספקה מהיר"],
          weaknesses: ["איכות בינונית", "אחריות קצרה"],
          marketShare: 0.09, priceIndex: 0.85,
          products: ["מעקות ברזל", "שערים", "גדרות"],
          channels: ["facebook", "whatsapp"],
          lastChecked: null,
        },
        {
          id: "c3", name: "פרגולות VIP", domain: "pergolasvip.co.il",
          tier: "premium", founded: 2014, employees: 18, estimatedRevenue: agorot(6500000),
          strengths: ["מומחיות בפרגולות", "עיצוב מתקדם"],
          weaknesses: ["התמחות צרה", "מחיר גבוה מאוד"],
          marketShare: 0.12, priceIndex: 1.15,
          products: ["פרגולות אלומיניום"],
          channels: ["instagram", "google_ads", "seo"],
          lastChecked: null,
        },
        {
          id: "c4", name: "אלומיניום פלוס", domain: "aluplus.co.il",
          tier: "mid", founded: 2002, employees: 22, estimatedRevenue: agorot(5200000),
          strengths: ["מגוון רחב", "שירות טוב"],
          weaknesses: ["ללא התמחות במעקות ברזל"],
          marketShare: 0.15, priceIndex: 0.95,
          products: ["חלונות אלומיניום", "מעקות אלומיניום", "דלתות"],
          channels: ["google_ads", "seo", "offline"],
          lastChecked: null,
        },
        {
          id: "c5", name: "Israel Sotheby's", domain: "sothebysrealty.co.il",
          tier: "luxury", founded: 2010, employees: 35, estimatedRevenue: agorot(25000000),
          strengths: ["מותג בינלאומי", "רשת סוכנים", "נכסי יוקרה"],
          weaknesses: ["עמלות גבוהות", "מיקוד רק ביוקרה"],
          marketShare: 0.22, priceIndex: 1.25,
          products: ["luxury_apartments", "penthouses", "villas"],
          channels: ["international", "print", "referrals"],
          biz: "realestate",
          lastChecked: null,
        },
      ],
      priceTracking: [],
      contentTracking: [],
      adTracking: [],
      alerts: [],
    });
  }
  save() { save(this.file, this.data); }

  updateCompetitor(id, updates) {
    const c = this.data.competitors.find(x => x.id === id);
    if (!c) return null;
    Object.assign(c, updates);
    c.lastChecked = now();
    this.save();
    return c;
  }

  trackPriceChange(competitorId, product, oldPrice, newPrice) {
    const change = {
      id: uid(),
      competitorId,
      competitor: this.data.competitors.find(c => c.id === competitorId)?.name,
      product,
      oldPrice,
      newPrice,
      changePercent: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice * 100).toFixed(1) : 0,
      direction: newPrice > oldPrice ? "increase" : "decrease",
      detectedAt: now(),
    };
    this.data.priceTracking.push(change);
    this.data.priceTracking = this.data.priceTracking.slice(-200);

    if (Math.abs(Number(change.changePercent)) > 10) {
      this.data.alerts.push({
        type: "significant_price_change",
        severity: "high",
        competitor: change.competitor,
        product, changePercent: change.changePercent,
        t: now(),
      });
      this.memory.add("alerts", { type: "competitor_price", ...change });
      log("INTEL", `📊 ${change.competitor} שינה מחיר ${product}: ${change.changePercent}%`, "WARN");
    }

    this.save();
    return change;
  }

  getMarketLeader() {
    return [...this.data.competitors].sort((a, b) => (b.marketShare || 0) - (a.marketShare || 0))[0];
  }

  getCheapestCompetitor() {
    return [...this.data.competitors].sort((a, b) => (a.priceIndex || 1) - (b.priceIndex || 1))[0];
  }

  async analyzeCompetitor(competitorId) {
    const c = this.data.competitors.find(x => x.id === competitorId);
    if (!c) return null;

    return await this.brain.thinkJSON(`
נתח את המתחרה ${c.name} של טכנו כל עוזי.

═══ המתחרה ═══
${JSON.stringify(c, null, 2)}

═══ מהלך ═══
1. איך לנצל את החולשות שלהם?
2. איך להתגונן מפני החוזקות שלהם?
3. אילו לקוחות יכולים "לגנוב" מהם?
4. מה האסטרטגיה המיטבית מולם?

תחזיר JSON:
{
  "swotAnalysis": {
    "ourStrengths": ["..."],
    "ourWeaknesses": ["..."],
    "opportunities": ["..."],
    "threats": ["..."]
  },
  "counterStrategy": "אסטרטגיית נגד כללית",
  "weaknessesToExploit": [{"weakness": "...", "howToExploit": "..."}],
  "strengthsToMirror": [{"strength": "...", "howToAdopt": "..."}],
  "priceStrategy": "premium_above/match/undercut",
  "positioningAngle": "איך למקם את עצמנו מולם",
  "contentToCreate": ["כותרת תוכן 1"],
  "adCampaignIdea": "רעיון קמפיין",
  "customersToTarget": ["פלח לקוחות"],
  "winProbability": 0.0-1.0
}`);
  }

  async analyze() {
    const topCompetitors = this.data.competitors.slice(0, 5);
    const recentPriceChanges = this.data.priceTracking.slice(-10);
    const recentAlerts = this.data.alerts.slice(-10);

    return await this.brain.thinkJSON(`
אתה ראש מודיעין עסקי של טכנו כל עוזי + קובי אלקיים נדל"ן.
נתח את הנוף התחרותי.

═══ מתחרים ═══
${JSON.stringify(topCompetitors.map(c => ({
  name: c.name, tier: c.tier, marketShare: c.marketShare,
  priceIndex: c.priceIndex, strengths: c.strengths, weaknesses: c.weaknesses,
})))}

═══ שינויי מחירים אחרונים ═══
${JSON.stringify(recentPriceChanges)}

═══ התראות ═══
${JSON.stringify(recentAlerts)}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "marketPosition": "leader/challenger/follower/niche",
  "ourMarketShare": 0,
  "biggestThreat": {"competitor": "...", "reason": "...", "response": "..."},
  "bestOpportunity": {"competitor": "...", "reason": "...", "action": "..."},
  "competitiveAdvantages": ["יתרון 1"],
  "competitiveDisadvantages": ["חיסרון 1"],
  "recommendedMoves": [{"move": "...", "impact": "...", "effort": "..."}],
  "priceWarRisk": 0.0-1.0,
  "marketTrends": ["מגמה 1"]
}`);
  }
}

// ═══════════════════════════════════════
// INTEGRATIONS HUB — WhatsApp, Email, SMS, Calendar
// ═══════════════════════════════════════

class IntegrationsHub {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "integrations", "state.json");
    this.data = load(this.file, {
      connectors: {
        whatsapp_business: { enabled: false, status: "disconnected", apiKey: null, phoneId: null, messagesSent: 0, messagesReceived: 0 },
        twilio_sms:        { enabled: false, status: "disconnected", accountSid: null, authToken: null, messagesSent: 0 },
        sendgrid:          { enabled: false, status: "disconnected", apiKey: null, emailsSent: 0, bounces: 0 },
        google_calendar:   { enabled: false, status: "disconnected", clientId: null, eventsCreated: 0 },
        gmail:             { enabled: false, status: "disconnected", clientId: null, threadsRead: 0 },
        hubspot_crm:       { enabled: false, status: "disconnected", apiKey: null, contactsSynced: 0 },
        meta_business:     { enabled: false, status: "disconnected", accessToken: null, leadsImported: 0 },
        google_ads_api:    { enabled: false, status: "disconnected", developerToken: null, campaignsManaged: 0 },
        linkedin_sales:    { enabled: false, status: "disconnected", accessToken: null, searchesPerformed: 0 },
        stripe:            { enabled: false, status: "disconnected", apiKey: null, paymentsProcessed: 0 },
        docusign:          { enabled: false, status: "disconnected", apiKey: null, documentsSigned: 0 },
        zapier_webhook:    { enabled: false, status: "disconnected", webhookUrl: null, triggersSent: 0 },
      },
      webhooks: [],
      syncLog: [],
      errors: [],
    });
  }
  save() { save(this.file, this.data); }

  configureConnector(name, credentials) {
    const c = this.data.connectors[name];
    if (!c) return null;
    Object.assign(c, credentials);
    c.enabled = true;
    c.status = "connected";
    c.connectedAt = now();
    this.save();
    log("INTEGRATIONS", `🔌 ${name} חובר`);
    return c;
  }

  disconnectConnector(name) {
    const c = this.data.connectors[name];
    if (!c) return null;
    c.enabled = false;
    c.status = "disconnected";
    c.disconnectedAt = now();
    this.save();
    return c;
  }

  async sendWhatsApp(to, message, templateName = null) {
    const c = this.data.connectors.whatsapp_business;
    if (!c.enabled) {
      this.data.syncLog.push({ type: "whatsapp_send_skipped", to, reason: "not_connected", t: now() });
      log("INTEGRATIONS", `⚠️  WhatsApp לא מחובר — לא נשלח ל-${to}`, "WARN");
      return { success: false, reason: "not_connected" };
    }
    // In production: integrate with WhatsApp Business Cloud API
    c.messagesSent++;
    this.data.syncLog.push({ type: "whatsapp_sent", to, templateName, t: now() });
    this.save();
    log("INTEGRATIONS", `💬 WhatsApp → ${to}: ${(message || templateName || "").substring(0, 40)}...`);
    return { success: true, messageId: uid() };
  }

  async sendSMS(to, message) {
    const c = this.data.connectors.twilio_sms;
    if (!c.enabled) return { success: false, reason: "not_connected" };
    c.messagesSent++;
    this.data.syncLog.push({ type: "sms_sent", to, t: now() });
    this.save();
    log("INTEGRATIONS", `📱 SMS → ${to}`);
    return { success: true, messageId: uid() };
  }

  async sendEmail(to, subject, body, from = null) {
    const c = this.data.connectors.sendgrid;
    if (!c.enabled) return { success: false, reason: "not_connected" };
    c.emailsSent++;
    this.data.syncLog.push({ type: "email_sent", to, subject, t: now() });
    this.save();
    log("INTEGRATIONS", `📧 Email → ${to}: ${subject}`);
    return { success: true, messageId: uid() };
  }

  async createCalendarEvent(data) {
    const c = this.data.connectors.google_calendar;
    if (!c.enabled) return { success: false, reason: "not_connected" };
    c.eventsCreated++;
    this.data.syncLog.push({ type: "calendar_event", title: data.title, start: data.start, t: now() });
    this.save();
    log("INTEGRATIONS", `📅 Calendar: ${data.title} ב-${data.start}`);
    return { success: true, eventId: uid() };
  }

  registerWebhook(data) {
    const wh = {
      id: uid(),
      source: data.source,
      event: data.event,
      url: data.url,
      secret: data.secret || null,
      active: true,
      triggers: 0,
      lastTriggered: null,
      createdAt: now(),
    };
    this.data.webhooks.push(wh);
    this.save();
    log("INTEGRATIONS", `🔔 Webhook נרשם: ${wh.source}/${wh.event}`);
    return wh;
  }

  getConnectedCount() {
    return Object.values(this.data.connectors).filter(c => c.enabled).length;
  }

  getStatus() {
    return {
      totalConnectors: Object.keys(this.data.connectors).length,
      connected: this.getConnectedCount(),
      webhooks: this.data.webhooks.length,
      recentSyncs: this.data.syncLog.slice(-10).length,
      errors: this.data.errors.length,
    };
  }
}

// ═══════════════════════════════════════
// INTERNATIONAL REAL ESTATE — נדל"ן בינלאומי
// ═══════════════════════════════════════

class InternationalRealEstate {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "international", "state.json");
    this.data = load(this.file, {
      properties: [
        {
          id: "p1", location: "תל אביב", neighborhood: "רוטשילד",
          type: "luxury_penthouse", rooms: 5, sqm: 220, sqmBalcony: 80,
          floor: "גג", buildingFloors: 18, yearBuilt: 2021,
          price: agorot(1800000000), pricePerSqm: agorot(8180000),
          currency: "ILS", altPriceUSD: 490000000, altPriceEUR: 460000000,
          status: "available", exclusivity: "exclusive",
          features: ["ג'קוזי", "בריכה פרטית", "נוף לים", "חניה ×2", "מרפסת ענק", "מעלית שבת", "חדר כושר"],
          description: { he: "", en: "", fr: "" },
          photos: [], videos: [], virtualTour: null,
          listings: { yad2: false, madlan: false, onmap: false, international: true },
          viewCount: 0, inquiries: 0,
        },
        {
          id: "p2", location: "חולון", neighborhood: "ח-300",
          type: "apartment", rooms: 4, sqm: 105, sqmBalcony: 12,
          floor: 5, buildingFloors: 10, yearBuilt: 2019,
          price: agorot(315000000), pricePerSqm: agorot(3000000),
          currency: "ILS", altPriceUSD: 86000000, altPriceEUR: 80000000,
          status: "available", exclusivity: "non_exclusive",
          features: ["ממ\"ד", "חניה", "מחסן", "מעלית", "מעלית שבת"],
          description: { he: "", en: "", fr: "" },
          photos: [], videos: [], virtualTour: null,
          listings: { yad2: true, madlan: true, onmap: true, international: false },
          viewCount: 0, inquiries: 0,
        },
        {
          id: "p3", location: "טבריה", neighborhood: "קריית שמואל",
          type: "investment_apartment", rooms: 3, sqm: 78, sqmBalcony: 8,
          floor: 3, buildingFloors: 8, yearBuilt: 2020,
          price: agorot(145000000), pricePerSqm: agorot(1860000),
          currency: "ILS", altPriceUSD: 40000000, altPriceEUR: 37000000,
          status: "available", exclusivity: "exclusive",
          features: ["נוף לכנרת", "ממ\"ד", "חניה", "תשואה 4.2%"],
          description: { he: "", en: "", fr: "" },
          photos: [], videos: [], virtualTour: null,
          listings: { yad2: true, madlan: false, onmap: false, international: true },
          viewCount: 0, inquiries: 0,
          investment: { expectedMonthlyRent: agorot(550000), annualYield: 0.042 },
        },
        {
          id: "p4", location: "יהוד", neighborhood: "יהוד מונוסון",
          type: "apartment", rooms: 5, sqm: 135, sqmBalcony: 22,
          floor: 7, buildingFloors: 8, yearBuilt: 2022,
          price: agorot(385000000), pricePerSqm: agorot(2850000),
          currency: "ILS", altPriceUSD: 105000000, altPriceEUR: 98000000,
          status: "available", exclusivity: "non_exclusive",
          features: ["ממ\"ד", "חניה ×2", "מחסן", "מעלית שבת", "סוכה"],
          description: { he: "", en: "", fr: "" },
          photos: [], videos: [], virtualTour: null,
          listings: { yad2: true, madlan: true, onmap: true, international: false },
          viewCount: 0, inquiries: 0,
        },
      ],
      internationalLeads: [],
      showings: [],
      offers: [],
      transactions: [],
      markets: {
        IL: { language: "he", primaryChannels: ["yad2", "madlan", "facebook"], buyers: "locals" },
        EN: { language: "en", primaryChannels: ["sothebys", "zillow", "linkedin"], buyers: "international_investors_us_uk" },
        FR: { language: "fr", primaryChannels: ["seloger", "facebook_fr", "whatsapp"], buyers: "french_speaking_diaspora" },
      },
    });
  }
  save() { save(this.file, this.data); }

  addProperty(data) {
    const p = {
      id: `PROP-${uid()}`,
      location: data.location, neighborhood: data.neighborhood || "",
      type: data.type || "apartment",
      rooms: data.rooms || 3, sqm: data.sqm || 0, sqmBalcony: data.sqmBalcony || 0,
      floor: data.floor || 1, buildingFloors: data.buildingFloors || 0,
      yearBuilt: data.yearBuilt || null,
      price: data.price || 0, pricePerSqm: data.sqm > 0 ? Math.round(data.price / data.sqm) : 0,
      currency: data.currency || "ILS",
      status: "available", exclusivity: data.exclusivity || "non_exclusive",
      features: data.features || [],
      description: { he: "", en: "", fr: "" },
      photos: data.photos || [], videos: [], virtualTour: null,
      listings: { yad2: false, madlan: false, onmap: false, international: false },
      viewCount: 0, inquiries: 0,
      createdAt: now(),
    };
    this.data.properties.push(p);
    this.save();
    log("INTL-RE", `🏠 נכס: ${p.location}, ${p.rooms} חד', ${p.sqm}מ\"ר — ₪${shekel(p.price)}`);
    return p;
  }

  async generateListingContent(propertyId, language) {
    const p = this.data.properties.find(x => x.id === propertyId);
    if (!p) return null;

    const content = await this.brain.thinkJSON(`
אתה כותב תוכן שיווקי של קובי אלקיים נדל"ן ליוקרה בינלאומי.
צור תיאור נכס ב${language === "he" ? "עברית" : language === "en" ? "English" : "Français"}.

═══ הנכס ═══
${JSON.stringify(p, null, 2)}

קהל יעד:
- he: ישראלים מקומיים
- en: משקיעים בינלאומיים (ארה"ב, בריטניה, קנדה)
- fr: קהל דובר צרפתית (צרפת, בלגיה, מרוקו, שוויץ)

תחזיר JSON:
{
  "title": "כותרת מושכת",
  "tagline": "תת-כותרת",
  "heroDescription": "פסקה ראשונה שקורעת מסך (3-4 שורות)",
  "keyHighlights": ["נקודה מרכזית 1"],
  "detailedDescription": "תיאור מלא (300-500 מילים)",
  "investmentAngle": "למה זה השקעה חכמה (למשקיעים)",
  "lifestyleAngle": "איך החיים כאן (לתושבים)",
  "locationPitch": "למה המיקום הזה מדהים",
  "callToAction": "קריאה לפעולה",
  "targetAudience": "פלח יעד ספציפי",
  "seoKeywords": ["..."],
  "estimatedMonthlyViews": 0
}`);

    if (content) {
      p.description[language] = content.detailedDescription;
      this.save();
    }
    return content;
  }

  addInternationalLead(data) {
    const l = {
      id: `INTL-LEAD-${uid()}`,
      name: data.name,
      email: data.email,
      phone: data.phone || "",
      country: data.country || "US",
      language: data.language || "en",
      propertyInterest: data.propertyInterest || null,
      budget: data.budget || 0,
      budgetCurrency: data.budgetCurrency || "USD",
      buyerType: data.buyerType || "investor", // investor, primary_residence, vacation_home
      timeframe: data.timeframe || "6_months",
      financingNeeded: data.financingNeeded || false,
      source: data.source || "website",
      status: "new",
      interactions: [],
      createdAt: now(),
    };
    this.data.internationalLeads.push(l);
    this.save();
    log("INTL-RE", `🌍 ליד בינלאומי: ${l.name} (${l.country}) — ${l.language.toUpperCase()} — $${(l.budget / 1000).toFixed(0)}K`);
    return l;
  }

  scheduleShowing(data) {
    const s = {
      id: `SHOW-${uid()}`,
      propertyId: data.propertyId,
      leadId: data.leadId || null,
      customerName: data.customerName,
      customerCountry: data.customerCountry || "IL",
      scheduledAt: data.scheduledAt,
      type: data.type || "in_person", // in_person, virtual_tour, video_call
      agent: data.agent || "קובי אלקיים",
      language: data.language || "he",
      duration: data.duration || 60,
      status: "scheduled",
      notes: data.notes || "",
      createdAt: now(),
    };
    this.data.showings.push(s);

    const prop = this.data.properties.find(p => p.id === data.propertyId);
    if (prop) prop.inquiries++;

    this.save();
    log("INTL-RE", `📅 סיור: ${s.customerName} — ${s.scheduledAt} (${s.type}, ${s.language})`);
    return s;
  }

  recordOffer(data) {
    const o = {
      id: `OFFER-${uid()}`,
      propertyId: data.propertyId,
      leadId: data.leadId || null,
      buyerName: data.buyerName,
      amount: data.amount,
      currency: data.currency || "ILS",
      conditions: data.conditions || [],
      financing: data.financing || null,
      status: "pending", // pending, accepted, counter, rejected, withdrawn
      expiresAt: data.expiresAt || null,
      createdAt: now(),
    };
    this.data.offers.push(o);
    this.save();
    log("INTL-RE", `💼 הצעה: ${o.buyerName} — ${o.currency} ${shekel(o.amount)}`);
    return o;
  }

  getAvailableProperties(filters = {}) {
    return this.data.properties.filter(p => {
      if (p.status !== "available") return false;
      if (filters.location && p.location !== filters.location) return false;
      if (filters.minPrice && p.price < filters.minPrice) return false;
      if (filters.maxPrice && p.price > filters.maxPrice) return false;
      if (filters.rooms && p.rooms !== filters.rooms) return false;
      if (filters.type && p.type !== filters.type) return false;
      return true;
    });
  }

  getPortfolioValue() {
    return this.data.properties
      .filter(p => p.status === "available")
      .reduce((sum, p) => sum + (p.price || 0), 0);
  }

  async analyze() {
    const available = this.data.properties.filter(p => p.status === "available").length;
    const activeLeads = this.data.internationalLeads.filter(l => l.status !== "closed" && l.status !== "lost").length;
    const portfolioValue = this.getPortfolioValue();

    return await this.brain.thinkJSON(`
נתח נדל"ן בינלאומי של קובי אלקיים:
נכסים זמינים: ${available}
שווי תיק: ₪${shekel(portfolioValue)}
לידים בינלאומיים פעילים: ${activeLeads}
שווקים: IL + EN + FR

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "portfolioHealth": {"value": 0, "diversification": "...", "recommendation": "..."},
  "marketAnalysis": {
    "IL": {"demand": "...", "recommendation": "..."},
    "EN": {"demand": "...", "recommendation": "..."},
    "FR": {"demand": "...", "recommendation": "..."}
  },
  "hottestProperty": {"id": "...", "reason": "..."},
  "priceRecommendations": [{"propertyId": "...", "action": "hold/raise/lower", "reason": "..."}],
  "marketingPriorities": ["..."],
  "leadConversionTips": ["..."]
}`);
  }
}

// ═══════════════════════════════════════
// EXPORT PART 5
// ═══════════════════════════════════════

module.exports = {
  GrowthEngine,
  CompetitiveIntel,
  IntegrationsHub,
  InternationalRealEstate,
};
