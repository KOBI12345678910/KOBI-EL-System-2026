// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 7/8
// SOCIAL MEDIA + COMPETITOR SPY + CASH PREDICTOR + EMPLOYEE WELLNESS
// + ENERGY TRACKER + LEGAL DOCS + MULTI-CURRENCY + SEASONAL DEMAND
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, Brain, Memory, uid, now, today, save, load, shekel, agorot, daysAgo, log } = require("./paradigm-part1");
const path = require("path");

// ═══════════════════════════════════════
// SOCIAL MEDIA AUTOPILOT
// ═══════════════════════════════════════

class SocialMediaModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "ads", "social.json");
    this.data = load(this.file, {
      posts: [],
      scheduled: [],
      platforms: {
        facebook: { connected: false, pageId: null, pageName: "טכנו כל עוזי", followers: 0 },
        instagram: { connected: false, accountId: null, handle: "@technokoluzi", followers: 0 },
        googleBusiness: { connected: false, locationId: null, reviews: 0, avgRating: 0 },
        linkedin: { connected: false, companyId: null, followers: 0 },
        tiktok: { connected: false, handle: null, followers: 0 },
      },
      contentCalendar: [],
      hashtags: {
        primary: ["#מעקות", "#מעקות_ברזל", "#מעקות_אלומיניום", "#שערים", "#גדרות", "#פרגולות", "#טכנו_כל_עוזי", "#עבודות_מתכת"],
        secondary: ["#שיפוצים", "#עיצוב_הבית", "#בית_פרטי", "#מרפסת", "#גינה", "#תל_אביב", "#ישראל", "#80_שנה"],
        trending: [],
      },
      analytics: { totalPosts: 0, totalReach: 0, totalEngagement: 0, avgEngagementRate: 0 },
      config: {
        autoPost: false,
        postsPerWeek: { facebook: 4, instagram: 5, googleBusiness: 2 },
        bestTimes: {
          facebook: ["10:00", "13:00", "19:00"],
          instagram: ["08:00", "12:00", "18:00", "21:00"],
        },
        contentMix: { projects: 40, tips: 20, behindScenes: 15, testimonials: 15, promotions: 10 },
      },
    });
  }
  save() { save(this.file, this.data); }

  async generatePost(projectData, type = "project_showcase") {
    log("SOCIAL", `📱 מייצר פוסט: ${type}...`);

    const result = await this.brain.thinkJSON(`
אתה מנהל סושיאל AI של טכנו כל עוזי — 80 שנות מצוינות בעבודות מתכת.

═══ סוג פוסט: ${type} ═══
${type === "project_showcase" ? `פרויקט שהושלם: ${JSON.stringify(projectData)}` : ""}
${type === "tip" ? "טיפ מקצועי לקהל" : ""}
${type === "behind_scenes" ? "מאחורי הקלעים במפעל" : ""}
${type === "testimonial" ? `ביקורת לקוח: ${JSON.stringify(projectData)}` : ""}
${type === "promotion" ? `מבצע: ${JSON.stringify(projectData)}` : ""}
${type === "recruitment" ? `גיוס: ${JSON.stringify(projectData)}` : ""}

═══ קו העריכה ═══
- טון: מקצועי אבל חם ואנושי
- הדגש תמיד: 80 שנה, 3 דורות, איכות, אחריות 10 שנים
- תמונות: Before/After, תהליך עבודה, צוות
- CTA: "רוצים גם? מדידה חינם! 📏 WhatsApp: 050-XXX"
- Emoji: כן, אבל לא מוגזם
- אורך: Facebook 3-5 שורות, Instagram 2-3 + hashtags

═══ כללים פסיכולוגיים ═══
1. Social Proof: "עוד לקוח מרוצה", "פרויקט #3,247"
2. Storytelling: ספר סיפור, לא רק תמונה
3. FOMO: "רק 3 תורים פנויים החודש"
4. Visual First: התמונה הכי חשובה
5. Engagement: שאל שאלה, בקש תגובה

תחזיר JSON:
{
  "facebook": {
    "text": "טקסט הפוסט (3-5 שורות + CTA)",
    "imageDescription": "תיאור התמונה הרצויה",
    "cta": "Call to action",
    "bestTime": "שעה מומלצת",
    "boostRecommendation": {"budget": 0, "audience": "...", "duration": 0}
  },
  "instagram": {
    "caption": "טקסט (2-3 שורות + hashtags)",
    "hashtags": ["#..."],
    "imageDescription": "...",
    "reelIdea": "רעיון ל-Reel אם רלוונטי",
    "bestTime": "..."
  },
  "googleBusiness": {
    "update": "טקסט עדכון (2 שורות)",
    "category": "offer/update/event"
  },
  "contentType": "${type}",
  "targetAudience": "...",
  "estimatedReach": 0,
  "estimatedEngagement": 0,
  "a_b_variant": {
    "alternativeText": "גרסה B לבדיקה",
    "hypothesis": "מה בודקים"
  }
}`);

    if (result) {
      const post = {
        id: `POST-${uid()}`,
        type,
        content: result,
        projectData,
        status: "draft",
        platforms: [],
        metrics: { reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0, leads: 0 },
        createdAt: now(), publishedAt: null,
      };
      this.data.posts.push(post);
      this.data.analytics.totalPosts++;
      this.save();
      log("SOCIAL", `✅ פוסט נוצר: ${post.id}`, "SUCCESS");
    }

    return result;
  }

  async generateContentCalendar(weeks = 4) {
    log("SOCIAL", `📅 מייצר לוח תוכן ל-${weeks} שבועות...`);

    const result = await this.brain.thinkJSON(`
צור לוח תוכן לסושיאל של טכנו כל עוזי ל-${weeks} שבועות.

תמהיל תוכן: ${JSON.stringify(this.data.config.contentMix)}
פוסטים בשבוע: Facebook ${this.data.config.postsPerWeek.facebook}, Instagram ${this.data.config.postsPerWeek.instagram}
שעות מומלצות: ${JSON.stringify(this.data.config.bestTimes)}

═══ סוגי תוכן ═══
1. Projects (40%): פרויקטים שהושלמו — Before/After, תהליך
2. Tips (20%): טיפים מקצועיים — "איך לבחור מעקה?", "מתי לצבוע?"
3. Behind Scenes (15%): מאחורי הקלעים — ריתוך, צביעה, צוות
4. Testimonials (15%): ביקורות לקוחות
5. Promotions (10%): מבצעים, הנחות, אירועים

═══ אירועים רלוונטיים ═══
- חגים ישראליים (פסח, סוכות = שיפוצים)
- עונות (אביב = פיק שיפוצים)
- ימים מיוחדים (יום העצמאות, ט"ו בשבט)

תחזיר JSON:
{
  "calendar": [{
    "week": 1,
    "posts": [{
      "day": "ראשון/שני/...",
      "date": "YYYY-MM-DD",
      "platform": "facebook/instagram/both",
      "type": "project/tip/behind_scenes/testimonial/promotion",
      "title": "כותרת קצרה",
      "description": "מה הפוסט",
      "time": "HH:MM",
      "priority": "high/medium/low",
      "contentIdeas": "רעיון מפורט"
    }]
  }],
  "themes": ["נושא חודשי 1"],
  "specialDates": [{"date": "...", "event": "...", "postIdea": "..."}],
  "kpiTargets": {"weeklyReach": 0, "weeklyEngagement": 0, "monthlyLeads": 0}
}`);

    if (result) {
      this.data.contentCalendar = result.calendar || [];
      this.save();
      log("SOCIAL", `✅ לוח תוכן: ${(result.calendar || []).reduce((s, w) => s + (w.posts || []).length, 0)} פוסטים מתוכננים`, "SUCCESS");
    }

    return result;
  }

  async analyzePerformance() {
    return await this.brain.thinkJSON(`
נתח ביצועי סושיאל:
פלטפורמות: ${JSON.stringify(this.data.platforms)}
סה"כ פוסטים: ${this.data.analytics.totalPosts}
Reach: ${this.data.analytics.totalReach}
Engagement: ${this.data.analytics.totalEngagement}

פוסטים אחרונים: ${JSON.stringify(this.data.posts.slice(-10).map(p => ({
  type: p.type, status: p.status, metrics: p.metrics, date: p.publishedAt || p.createdAt,
})))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "engagementRate": 0,
  "bestPerformingType": "...",
  "worstPerformingType": "...",
  "bestDay": "...",
  "bestTime": "...",
  "followerGrowth": 0,
  "contentRecommendations": [{"type": "...", "reason": "...", "frequency": "..."}],
  "competitorBenchmark": "...",
  "viralPotential": [{"idea": "...", "expectedReach": 0}],
  "automatedActions": [{"action": "...", "reason": "...", "priority": "..."}],
  "kpis": {"avgReach": 0, "avgEngagement": 0, "leadsFromSocial": 0, "costPerLead": 0}
}`);
  }
}

// ═══════════════════════════════════════
// COMPETITOR SPY MODULE
// ═══════════════════════════════════════

class CompetitorSpyModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "analytics", "competitors.json");
    this.data = load(this.file, {
      competitors: [
        {
          id: uid(), name: "מעקות ישראל", website: "maakotyisrael.co.il",
          products: ["מעקות ברזל", "מעקות אלומיניום", "שערים"],
          estimatedRevenue: 0, estimatedEmployees: 15, estimatedAdBudget: 0,
          strengths: ["מחירים תחרותיים", "שיווק אגרסיבי"],
          weaknesses: ["איכות בינונית", "אין אחריות ארוכה", "חברה חדשה"],
          pricing: { railingIron: 65000, railingAluminum: 80000 },
          onlinePresence: { website: true, facebook: true, instagram: true, google_ads: true },
          lastChecked: null, threatLevel: "high", trend: "growing",
          intelligence: [],
        },
        {
          id: uid(), name: "א.ב מסגרות", website: null,
          products: ["מעקות ברזל", "שערים", "גדרות"],
          estimatedRevenue: 0, estimatedEmployees: 8,
          strengths: ["מחירים נמוכים", "עבודה מהירה"],
          weaknesses: ["איכות נמוכה", "אין אתר", "אין אחריות", "עסק קטן"],
          pricing: { railingIron: 55000 },
          onlinePresence: { website: false, facebook: true, instagram: false, google_ads: false },
          lastChecked: null, threatLevel: "medium", trend: "stable",
          intelligence: [],
        },
        {
          id: uid(), name: "פרגולות VIP", website: "pergolot-vip.co.il",
          products: ["פרגולות אלומיניום", "מעקות אלומיניום", "הצללות"],
          estimatedRevenue: 0, estimatedEmployees: 12,
          strengths: ["מותג חזק", "מיקוד בפרגולות", "שיווק טוב"],
          weaknesses: ["מחירים גבוהים", "לא עושים ברזל", "זמני אספקה ארוכים"],
          pricing: { pergolaAluminum: 120000 },
          onlinePresence: { website: true, facebook: true, instagram: true, google_ads: true },
          lastChecked: null, threatLevel: "medium", trend: "growing",
          intelligence: [],
        },
        {
          id: uid(), name: "אלומיניום פלוס", website: "aluminiumplus.co.il",
          products: ["חלונות אלומיניום", "דלתות אלומיניום", "מעקות אלומיניום"],
          estimatedRevenue: 0, estimatedEmployees: 20,
          strengths: ["מומחיות אלומיניום", "מפעל גדול", "ותק"],
          weaknesses: ["לא עושים ברזל", "שירות לקוחות בינוני", "יקרים"],
          pricing: { railingAluminum: 85000, windowAluminum: 60000 },
          onlinePresence: { website: true, facebook: true, instagram: false, google_ads: true },
          lastChecked: null, threatLevel: "medium", trend: "stable",
          intelligence: [],
        },
        // נדל"ן
        {
          id: uid(), name: "Israel Sotheby's", website: "sothebysrealty.co.il",
          products: ["נדל\"ן יוקרה תל אביב"],
          estimatedRevenue: 0, estimatedEmployees: 50, estimatedAdBudget: 1200000,
          strengths: ["מותג עולמי", "רשת בינלאומית", "תקציב שיווק ענק"],
          weaknesses: ["יקרים מאוד", "לא אישי", "בירוקרטיה"],
          pricing: {},
          onlinePresence: { website: true, facebook: true, instagram: true, google_ads: true, youtube: true },
          lastChecked: null, threatLevel: "high", trend: "stable",
          intelligence: [],
        },
      ],
      reports: [],
      priceComparisons: [],
      marketShare: {},
      alerts: [],
    });
  }
  save() { save(this.file, this.data); }

  async gatherIntelligence(competitorId) {
    const comp = this.data.competitors.find(c => c.id === competitorId);
    if (!comp) return null;

    log("SPY", `🔍 מרגל אחרי: ${comp.name}...`);

    const result = await this.brain.thinkJSON(`
אתה יחידת מודיעין תחרותי של טכנו כל עוזי.
אסוף מידע על: ${comp.name}

═══ מה ידוע ═══
${JSON.stringify(comp)}

═══ מה לבדוק (סימולציה — בפרודקשן: web scraping + API) ═══
1. **אתר**: האם השתנה? מוצרים חדשים? מחירים?
2. **Google Ads**: האם מפרסמים? מילות מפתח? מודעות?
3. **Facebook/Instagram**: פעילות? תגובות? ביקורות?
4. **Google Reviews**: ציון? ביקורות חדשות? תלונות?
5. **מחירים**: האם השתנו? מבצעים? הנחות?
6. **מוצרים חדשים**: הוסיפו שירותים? הסירו?
7. **עובדים**: מגייסים? פיטורים? מנהלים חדשים?
8. **שותפויות**: שותפים חדשים? ספקים?

תחזיר JSON:
{
  "competitor": "${comp.name}",
  "checkedAt": "${now()}",
  "findings": [{
    "category": "pricing/products/marketing/reputation/staff/strategy",
    "finding": "...",
    "significance": "high/medium/low",
    "actionRequired": true,
    "suggestedResponse": "..."
  }],
  "pricingUpdate": {"product": "...", "oldPrice": 0, "newPrice": 0, "change": "..."},
  "threatLevelChange": "increased/stable/decreased",
  "newThreatLevel": "critical/high/medium/low",
  "opportunities": ["הזדמנות שנוצרה מהמתחרה"],
  "counterStrategies": [{
    "strategy": "...",
    "implementation": "...",
    "cost": 0,
    "expectedImpact": "...",
    "timeline": "..."
  }],
  "marketTrend": "...",
  "customerSentiment": {"positive": 0, "negative": 0, "topComplaint": "..."}
}`);

    if (result) {
      comp.lastChecked = now();
      comp.intelligence.push({ ...result, t: now() });
      comp.intelligence = comp.intelligence.slice(-20);

      if (result.threatLevelChange === "increased") {
        comp.threatLevel = result.newThreatLevel || comp.threatLevel;
        log("SPY", `🚨 ${comp.name}: רמת איום עלתה ל-${comp.threatLevel}!`, "WARN");
        this.memory.add("alerts", { type: "competitor_threat_increased", competitor: comp.name, level: comp.threatLevel });
      }

      for (const finding of (result.findings || []).filter(f => f.significance === "high")) {
        log("SPY", `  ⚠️ ${finding.category}: ${finding.finding}`, "WARN");
      }

      this.save();
    }

    return result;
  }

  async compareMarket() {
    log("SPY", "📊 השוואת שוק מלאה...");

    return await this.brain.thinkJSON(`
השווה את טכנו כל עוזי מול כל המתחרים:

═══ אנחנו ═══
שם: טכנו כל עוזי
ותק: 80 שנה
עובדים: 30
מוצרים: ${CONFIG.BUSINESS.techno.products.join(", ")}
USPs: 80 שנה, 3 דורות, אחריות 10 שנים, מדידה חינם
מחירים: מעקה ברזל ~₪200-350/מ', אלומיניום ~₪300-500/מ'

═══ מתחרים ═══
${JSON.stringify(this.data.competitors.map(c => ({
  name: c.name, products: c.products, employees: c.estimatedEmployees,
  strengths: c.strengths, weaknesses: c.weaknesses,
  pricing: c.pricing, threat: c.threatLevel, trend: c.trend,
})))}

תחזיר JSON:
{
  "marketOverview": "סיכום שוק 3-4 שורות",
  "ourPosition": "leader/challenger/follower/niche",
  "marketShare": {"estimated": 0, "trend": "growing/stable/shrinking"},
  "competitiveAdvantages": [{"advantage": "...", "sustainability": "high/medium/low", "threat": "..."}],
  "competitiveDisadvantages": [{"disadvantage": "...", "impact": "...", "fix": "..."}],
  "pricePositioning": {"position": "premium/mid/budget", "justification": "..."},
  "differentiationScore": 0-100,
  "emergingThreats": [{"threat": "...", "timeline": "...", "preparation": "..."}],
  "opportunities": [{"opportunity": "...", "reason": "...", "action": "...", "expectedRevenue": 0}],
  "strategicRecommendations": [{
    "recommendation": "...",
    "rationale": "...",
    "investment": 0,
    "expectedROI": 0,
    "timeline": "...",
    "priority": "critical/high/medium/low"
  }],
  "moatAnalysis": {
    "currentMoat": "...",
    "moatStrength": 0-100,
    "howToStrengthen": ["..."]
  }
}`);
  }

  async analyze() {
    return await this.brain.thinkJSON(`
נתח מודיעין תחרותי:
מתחרים במעקב: ${this.data.competitors.length}
${JSON.stringify(this.data.competitors.map(c => ({
  name: c.name, threat: c.threatLevel, trend: c.trend,
  lastChecked: c.lastChecked ? daysAgo(c.lastChecked) + " ימים" : "אף פעם",
  intelligenceCount: c.intelligence.length,
})))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "mostDangerous": {"name": "...", "reason": "...", "action": "..."},
  "recentChanges": [{"competitor": "...", "change": "...", "impact": "..."}],
  "marketTrend": "...",
  "recommendations": ["..."],
  "automatedActions": [{"action": "...", "competitor": "...", "priority": "..."}]
}`);
  }
}

// ═══════════════════════════════════════
// CASH COLLECTION PREDICTOR
// ═══════════════════════════════════════

class CashPredictorModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "finance", "cash-predictor.json");
    this.data = load(this.file, {
      predictions: [],
      customerProfiles: [],
      accuracy: { predicted: 0, actual: 0, hits: 0, misses: 0 },
    });
  }
  save() { save(this.file, this.data); }

  async predictCollections(invoices, customerHistory) {
    log("CASH", "🔮 מנבא תזרים מזומנים...");

    const result = await this.brain.thinkJSON(`
אתה מנוע חיזוי תזרים מזומנים של טכנו כל עוזי.
נבא מתי כל לקוח ישלם.

═══ חשבוניות פתוחות ═══
${JSON.stringify(invoices.map(i => ({
  number: i.number, customer: i.customerName, amount: shekel(i.total),
  dueDate: i.dueDate, daysSinceSent: i.sentAt ? daysAgo(i.sentAt) : "N/A",
  daysOverdue: i.dueDate && new Date(i.dueDate) < new Date() ? daysAgo(i.dueDate) : 0,
  reminders: (i.reminders || []).length,
})))}

═══ היסטוריית לקוחות ═══
${JSON.stringify(customerHistory)}

═══ כללים ישראליים ═══
1. "שוטף + 30" = בדרך כלל 35-40 יום בפועל
2. לקוחות פרטיים משלמים מהר יותר מעסקיים
3. סכומים גדולים = תשלום איטי יותר
4. אחרי תזכורת = 70% משלמים תוך שבוע
5. חגים = עיכוב 1-2 שבועות
6. חודש ינואר = תקופה קשה (אחרי חגים)

לכל חשבונית:
1. מתי צפוי לשלם?
2. מה הסיכוי שישלם בזמן?
3. מה הסיכוי שלא ישלם בכלל?
4. מה הפעולה הנדרשת?

תחזיר JSON:
{
  "predictions": [{
    "invoiceNumber": "...",
    "customer": "...",
    "amount": 0,
    "dueDate": "...",
    "predictedPaymentDate": "...",
    "onTimeProbability": 0.0-1.0,
    "latePaymentProbability": 0.0-1.0,
    "defaultProbability": 0.0-1.0,
    "predictedDaysLate": 0,
    "riskLevel": "low/medium/high/critical",
    "recommendedAction": "wait/reminder_sms/reminder_call/formal_letter/legal",
    "recommendedActionDate": "...",
    "collectionStrategy": "..."
  }],
  "cashflowForecast": {
    "next7days": 0,
    "next14days": 0,
    "next30days": 0,
    "next60days": 0,
    "next90days": 0,
    "confidence": 0.0-1.0
  },
  "atRiskAmount": 0,
  "totalExpectedCollections": 0,
  "criticalActions": [{"invoice": "...", "action": "...", "deadline": "...", "reason": "..."}],
  "customerSegmentation": {
    "reliable": [{"customer": "...", "avgPaymentDays": 0}],
    "slowPayers": [{"customer": "...", "avgPaymentDays": 0, "action": "..."}],
    "riskCustomers": [{"customer": "...", "reason": "...", "exposure": 0, "action": "..."}]
  }
}`);

    if (result) {
      this.data.predictions.push({ ...result, t: now() });
      this.data.predictions = this.data.predictions.slice(-50);
      this.save();
      log("CASH", `✅ חיזוי: 7 ימים ₪${shekel(result.cashflowForecast?.next7days || 0)} | 30 ימים ₪${shekel(result.cashflowForecast?.next30days || 0)} | At Risk ₪${shekel(result.atRiskAmount || 0)}`, "SUCCESS");
    }

    return result;
  }
}

// ═══════════════════════════════════════
// EMPLOYEE WELLNESS MODULE
// ═══════════════════════════════════════

class WellnessModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "hr", "wellness.json");
    this.data = load(this.file, {
      assessments: [],
      wellnessScores: [],
      burnoutIndicators: [],
      interventions: [],
      config: {
        overtimeAlertHours: 10, // שעות נוספות בשבוע
        absenceAlertDays: 3, // חיסורים בחודש
        lateAlertCount: 4, // איחורים בחודש
        vacationGap: 90, // ימים ללא חופש = סימן שחיקה
        checkFrequency: 7, // ימים בין בדיקות
      },
    });
  }
  save() { save(this.file, this.data); }

  async assessEmployee(employee, attendanceData, performanceData) {
    log("WELLNESS", `❤️ מעריך רווחת: ${employee.name}...`);

    const result = await this.brain.thinkJSON(`
אתה מערכת רווחת עובדים אוטונומית.
הערך את מצבו של העובד וזהה סימני שחיקה.

═══ עובד ═══
שם: ${employee.name}
תפקיד: ${employee.role}
מחלקה: ${employee.department}
ותק: ${daysAgo(employee.startDate)} ימים (${(daysAgo(employee.startDate) / 365).toFixed(1)} שנים)
שכר: ₪${shekel(employee.salary?.base || 0)}

═══ נוכחות (30 ימים אחרונים) ═══
${JSON.stringify(attendanceData)}

═══ ביצועים ═══
${JSON.stringify(performanceData)}

═══ סימני שחיקה לבדוק ═══
1. **שעות נוספות** — מעל ${this.data.config.overtimeAlertHours} שעות/שבוע
2. **חיסורים** — מעל ${this.data.config.absenceAlertDays}/חודש (עלייה פתאומית)
3. **איחורים** — מעל ${this.data.config.lateAlertCount}/חודש (שינוי מדפוס)
4. **חופשה** — לא לקח חופש ${this.data.config.vacationGap}+ ימים
5. **ביצועים** — ירידה באיכות/מהירות
6. **תלונות** — תלונות לקוחות על העובד
7. **יחסים** — קונפליקטים עם צוות
8. **בטיחות** — אירועי בטיחות שקשורים לעובד
9. **שינויים פתאומיים** — שינוי התנהגות חריג

═══ הקשר ישראלי ═══
- עובדי מפעל מתכת: עבודה פיזית קשה, חום, רעש
- תקופת קיץ = חום קיצוני = עומס פיזי
- מילואים = לחץ אישי + חוסר בכוח אדם
- חגים = לחץ הזמנות + משמרות

תחזיר JSON:
{
  "wellnessScore": 0-100,
  "burnoutRisk": "none/low/medium/high/critical",
  "burnoutIndicators": [{
    "indicator": "...",
    "severity": "mild/moderate/severe",
    "trend": "improving/stable/worsening",
    "evidence": "..."
  }],
  "stressors": ["מקור לחץ 1"],
  "positiveFactors": ["גורם חיובי 1"],
  "recommendations": [{
    "action": "...",
    "type": "immediate/short_term/long_term",
    "owner": "manager/hr/employee",
    "priority": "high/medium/low",
    "expectedImpact": "..."
  }],
  "conversation": {
    "shouldHaveConversation": true,
    "with": "דימה/קורין/קובי",
    "topic": "...",
    "approach": "...",
    "doNotSay": ["..."]
  },
  "retentionRisk": 0.0-1.0,
  "retentionActions": ["פעולה 1"],
  "workloadAssessment": "underloaded/balanced/overloaded/critical",
  "physicalHealth": {
    "concerns": ["..."],
    "recommendations": ["..."]
  }
}`);

    if (result) {
      this.data.assessments.push({ employeeId: employee.id, name: employee.name, ...result, t: now() });
      this.data.wellnessScores.push({ employeeId: employee.id, score: result.wellnessScore, t: now() });

      if (result.burnoutRisk === "high" || result.burnoutRisk === "critical") {
        this.data.burnoutIndicators.push({ employeeId: employee.id, name: employee.name, risk: result.burnoutRisk, indicators: result.burnoutIndicators, t: now() });
        log("WELLNESS", `🚨 ${employee.name}: סיכון שחיקה ${result.burnoutRisk}!`, "ERROR");
        this.memory.add("alerts", { type: "burnout_risk", employee: employee.name, risk: result.burnoutRisk });
      }

      if (result.retentionRisk > 0.6) {
        log("WELLNESS", `⚠️ ${employee.name}: סיכון עזיבה ${(result.retentionRisk * 100).toFixed(0)}%`, "WARN");
        this.memory.add("alerts", { type: "retention_risk", employee: employee.name, risk: result.retentionRisk });
      }

      this.save();
    }

    return result;
  }

  getAverageWellness() {
    if (this.data.wellnessScores.length === 0) return 0;
    const recent = this.data.wellnessScores.slice(-30);
    return Math.round(recent.reduce((s, w) => s + w.score, 0) / recent.length);
  }

  async analyze() {
    return await this.brain.thinkJSON(`
נתח רווחת עובדים:
ציון ממוצע: ${this.getAverageWellness()}/100
הערכות: ${this.data.assessments.length}
סיכוני שחיקה: ${this.data.burnoutIndicators.length}
התערבויות: ${this.data.interventions.length}

הערכות אחרונות: ${JSON.stringify(this.data.assessments.slice(-10).map(a => ({
  name: a.name, wellness: a.wellnessScore, burnout: a.burnoutRisk, retention: a.retentionRisk,
})))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "avgWellness": 0,
  "trend": "improving/stable/declining",
  "atRiskEmployees": [{"name": "...", "risk": "...", "action": "..."}],
  "organizationalHealth": "...",
  "recommendations": ["..."],
  "kpis": {"avgWellness": 0, "burnoutRate": 0, "turnoverPrediction": 0, "engagementScore": 0}
}`);
  }
}

// ═══════════════════════════════════════
// ENERGY & UTILITY TRACKER
// ═══════════════════════════════════════

class EnergyModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "ops", "energy.json");
    this.data = load(this.file, {
      readings: [],
      bills: [],
      equipment: [
        { name: "רתכת MIG 350A", power: 12, hoursPerDay: 6, category: "welding" },
        { name: "רתכת TIG 250A", power: 8, hoursPerDay: 3, category: "welding" },
        { name: "משחזת גדולה 230מ\"מ", power: 2.4, hoursPerDay: 4, count: 5, category: "grinding" },
        { name: "משחזת קטנה 125מ\"מ", power: 1.2, hoursPerDay: 3, count: 8, category: "grinding" },
        { name: "מברגת אימפקט", power: 0.8, hoursPerDay: 2, count: 6, category: "tools" },
        { name: "מקדחה עמודית", power: 1.5, hoursPerDay: 2, category: "drilling" },
        { name: "מסור פס", power: 3, hoursPerDay: 1, category: "cutting" },
        { name: "מכונת כיפוף", power: 4, hoursPerDay: 1.5, category: "bending" },
        { name: "מדחס אוויר", power: 7.5, hoursPerDay: 8, category: "compressor" },
        { name: "תאורת מפעל", power: 5, hoursPerDay: 10, category: "lighting" },
        { name: "מיזוג אוויר", power: 15, hoursPerDay: 8, category: "hvac" },
        { name: "מחשבים + משרד", power: 2, hoursPerDay: 10, category: "office" },
      ],
      config: {
        electricityRate: 65, // אגורות/קוט"ש (IEC תעריף עסקי)
        peakRate: 85, // תעריף שיא
        offPeakRate: 45, // תעריף שפל
        peakHours: { start: "17:00", end: "22:00" },
        monthlyBudget: 1500000, // ₪15,000
      },
      stats: { totalKwh: 0, totalCost: 0 },
    });
  }
  save() { save(this.file, this.data); }

  calculateDailyConsumption() {
    let total = 0;
    for (const eq of this.data.equipment) {
      const count = eq.count || 1;
      total += eq.power * eq.hoursPerDay * count;
    }
    return Math.round(total * 10) / 10; // kWh
  }

  calculateMonthlyCost() {
    const dailyKwh = this.calculateDailyConsumption();
    const monthlyKwh = dailyKwh * 22; // 22 ימי עבודה
    const avgRate = this.data.config.electricityRate;
    return Math.round(monthlyKwh * avgRate);
  }

  addBill(data) {
    const bill = {
      id: uid(),
      period: data.period || today().substring(0, 7),
      kwh: data.kwh || 0,
      amount: data.amount || 0,
      peakKwh: data.peakKwh || 0,
      offPeakKwh: data.offPeakKwh || 0,
      powerFactor: data.powerFactor || 0.95,
      date: data.date || today(),
      t: now(),
    };
    this.data.bills.push(bill);
    this.data.stats.totalKwh += bill.kwh;
    this.data.stats.totalCost += bill.amount;
    this.save();
    log("ENERGY", `⚡ חשבון חשמל: ${bill.period} — ${bill.kwh} kWh — ₪${shekel(bill.amount)}`);
    return bill;
  }

  async optimize() {
    const dailyKwh = this.calculateDailyConsumption();
    const monthlyCost = this.calculateMonthlyCost();

    return await this.brain.thinkJSON(`
אפטם צריכת חשמל של מפעל מתכת:

═══ ציוד ═══
${JSON.stringify(this.data.equipment)}

═══ צריכה ═══
יומי: ${dailyKwh} kWh
חודשי (אומדן): ${Math.round(dailyKwh * 22)} kWh
עלות חודשית (אומדן): ₪${shekel(monthlyCost)}
תקציב: ₪${shekel(this.data.config.monthlyBudget)}

═══ חשבונות אחרונים ═══
${JSON.stringify(this.data.bills.slice(-6))}

═══ תעריפים ═══
רגיל: ${this.data.config.electricityRate} אג'/kWh
שיא (${this.data.config.peakHours.start}-${this.data.config.peakHours.end}): ${this.data.config.peakRate} אג'/kWh
שפל: ${this.data.config.offPeakRate} אג'/kWh

תחזיר JSON:
{
  "currentConsumption": {"daily": 0, "monthly": 0, "cost": 0},
  "topConsumers": [{"equipment": "...", "percent": 0, "kwhMonth": 0, "cost": 0}],
  "savings": [{
    "suggestion": "...",
    "method": "timing/equipment/behavior/solar/LED/inverter",
    "monthlySaving": 0,
    "investment": 0,
    "paybackMonths": 0,
    "co2Reduction": 0,
    "difficulty": "easy/medium/hard"
  }],
  "peakShifting": {
    "currentPeakUsage": 0,
    "shiftableLoad": 0,
    "potentialSaving": 0,
    "recommendation": "..."
  },
  "solarPotential": {
    "roofArea": "...",
    "estimatedCapacity": 0,
    "annualGeneration": 0,
    "annualSaving": 0,
    "investment": 0,
    "paybackYears": 0,
    "recommendation": "..."
  },
  "totalPotentialSaving": 0,
  "percentSaving": 0,
  "priority": [{"action": "...", "saving": 0, "effort": "low/medium/high"}]
}`);
  }
}

// ═══════════════════════════════════════
// LEGAL DOCUMENT AI
// ═══════════════════════════════════════

class LegalModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "compliance", "legal.json");
    this.data = load(this.file, {
      documents: [],
      templates: [
        "employment_contract", "termination_letter", "warning_letter",
        "service_agreement", "subcontractor_agreement", "nda",
        "warranty_certificate", "demand_letter", "consent_form",
        "safety_declaration", "vehicle_use_agreement", "privacy_policy",
      ],
      compliance: {
        businessLicense: { status: "valid", expiryDate: null, lastRenewal: null },
        insurance: { liability: null, property: null, workers: null, vehicles: null },
        safetyTraining: { lastDate: null, nextDate: null, certified: [] },
        taxRegistration: { vat: true, incomeTax: true, nationalInsurance: true },
      },
      alerts: [],
    });
  }
  save() { save(this.file, this.data); }

  async generateLegalDocument(type, data) {
    log("LEGAL", `📜 מייצר מסמך משפטי: ${type}...`);

    const result = await this.brain.thinkJSON(`
אתה מערכת מסמכים משפטיים של טכנו כל עוזי בע"מ.
ייצר מסמך ${type} בהתאם לחוק הישראלי.

═══ סוג מסמך: ${type} ═══
═══ נתונים: ${JSON.stringify(data)} ═══

═══ פרטי העסק ═══
שם: טכנו כל עוזי בע"מ
ח.פ.: 51-XXXXXXX
כתובת: ריבל 37, תל אביב
בעלים: קובי אלקיים

═══ הנחיות משפטיות ═══
1. חוק חוזים ישראלי
2. חוק הגנת הצרכן
3. חוק זכויות עובדים (אם רלוונטי)
4. תקנות בטיחות בעבודה (אם רלוונטי)
5. חוק הגנת הפרטיות
6. שפה ברורה ופשוטה — עברית

═══ לפי סוג ═══
${type === "employment_contract" ? `
חוק עבודה ישראלי:
- תקופת ניסיון: עד 6 חודשים
- הודעה מוקדמת: לפי ותק
- שעות עבודה: 42 שעות/שבוע
- שעות נוספות: 125% ראשונות, 150% הבאות
- חופשה שנתית: לפי ותק
- דמי מחלה: 18 ימים/שנה
- פנסיה: 6.25% מעסיק + 6% עובד
- פיצויים: 8.33%
- ביטוח לאומי: 3.45%+7.66% מעסיק
` : ""}
${type === "service_agreement" ? `
- תיאור השירות בפירוט
- מחיר + מע"מ
- תנאי תשלום
- לוח זמנים
- אחריות
- ביטול
- סמכות שיפוט: בית משפט תל אביב
` : ""}
${type === "demand_letter" ? `
- מכתב התראה לפני הליך משפטי
- סכום החוב + ריבית + הוצאות
- ציון מועד אחרון לתשלום
- אזהרה מהליכים משפטיים
- בנימה מקצועית אך תקיפה
` : ""}

תחזיר JSON:
{
  "document": {
    "title": "...",
    "type": "${type}",
    "content": "תוכן המסמך המלא בעברית — פסקאות מלאות עם סעיפים ממוספרים",
    "date": "${today()}",
    "parties": [{"name": "...", "role": "..."}],
    "keyTerms": ["..."],
    "signatures": [{"name": "...", "title": "..."}]
  },
  "legalNotes": ["הערה משפטית 1"],
  "disclaimer": "מסמך זה נוצר ע\"י AI ואינו מהווה ייעוץ משפטי. מומלץ לבדוק עם עורך דין.",
  "relatedDocuments": ["מסמך קשור 1"],
  "expiryDate": "...",
  "reviewRequired": true
}`);

    if (result) {
      const doc = { id: `LEGAL-${uid()}`, type, ...result.document, data, legalNotes: result.legalNotes, createdAt: now() };
      this.data.documents.push(doc);
      this.save();
      log("LEGAL", `✅ ${type}: ${doc.title}`, "SUCCESS");
    }

    return result;
  }

  async checkCompliance() {
    return await this.brain.thinkJSON(`
בדוק עמידה ברגולציה:
${JSON.stringify(this.data.compliance)}
מסמכים: ${this.data.documents.length}
התראות: ${this.data.alerts.length}

תחזיר JSON:
{
  "status": "compliant/partial/non_compliant",
  "score": 0-100,
  "issues": [{"area": "...", "issue": "...", "severity": "critical/high/medium", "deadline": "...", "action": "..."}],
  "upcomingDeadlines": [{"what": "...", "date": "...", "action": "..."}],
  "missingDocuments": ["מסמך שחסר"],
  "recommendations": ["..."]
}`);
  }
}

// ═══════════════════════════════════════
// MULTI-CURRENCY MODULE
// ═══════════════════════════════════════

class MultiCurrencyModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "finance", "currency.json");
    this.data = load(this.file, {
      rates: { USD: 365, EUR: 398, GBP: 462, CHF: 412, CAD: 270 }, // אגורות ל-1 יחידה
      rateHistory: [],
      transactions: [],
      exposure: { USD: 0, EUR: 0, GBP: 0 },
      hedging: [],
      config: { autoUpdate: true, hedgingEnabled: false, markupPercent: 2 },
    });
  }
  save() { save(this.file, this.data); }

  convert(amount, from, to = "ILS") {
    if (from === to) return amount;
    if (from === "ILS" && this.data.rates[to]) return Math.round(amount / this.data.rates[to] * 100);
    if (to === "ILS" && this.data.rates[from]) return Math.round(amount * this.data.rates[from] / 100);
    return null;
  }

  createForeignQuote(data) {
    const ilsAmount = data.amountILS || 0;
    const currency = data.currency || "USD";
    const rate = this.data.rates[currency] || 365;
    const markup = this.data.config.markupPercent;
    const adjustedRate = Math.round(rate * (1 - markup / 100));
    const foreignAmount = Math.round(ilsAmount / adjustedRate * 100);

    const quote = {
      id: uid(), amountILS: ilsAmount,
      currency, rate, adjustedRate, markup,
      foreignAmount,
      displayAmount: `${(foreignAmount / 100).toFixed(0)} ${currency}`,
      ilsEquivalent: `₪${shekel(ilsAmount)}`,
      validHours: 24,
      createdAt: now(),
    };
    this.data.transactions.push(quote);
    this.save();
    log("CURRENCY", `💱 ${quote.displayAmount} (₪${shekel(ilsAmount)}) — rate: ${rate/100} + ${markup}% markup`);
    return quote;
  }

  async analyzeExposure() {
    return await this.brain.thinkJSON(`
נתח חשיפה מטבעית:
שערים: ${JSON.stringify(this.data.rates)}
חשיפה: ${JSON.stringify(this.data.exposure)}
עסקאות: ${this.data.transactions.length}

תחזיר JSON:
{
  "totalExposure": 0,
  "riskLevel": "low/medium/high",
  "currencyForecast": [{"currency": "USD", "direction": "up/stable/down", "confidence": 0.0-1.0}],
  "hedgingRecommendation": "...",
  "pricingRecommendation": "...",
  "markupOptimization": {"current": 0, "suggested": 0, "reason": "..."}
}`);
  }
}

// ═══════════════════════════════════════
// SEASONAL DEMAND PREDICTOR
// ═══════════════════════════════════════

class SeasonalModule {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "analytics", "seasonal.json");
    this.data = load(this.file, {
      historicalData: [],
      predictions: [],
      seasons: {
        peak: { months: [3, 4, 5, 8, 9, 10], multiplier: 1.3, description: "אביב + סתיו = שיא שיפוצים" },
        normal: { months: [2, 6, 7, 11], multiplier: 1.0, description: "רגיל" },
        low: { months: [0, 1], multiplier: 0.6, description: "חורף = שפל" },
      },
      events: [
        { name: "פסח", month: 3, week: 3, impact: 1.28, type: "holiday", leadTimeDays: 14, description: "שיא שיפוצים לפני פסח" },
        { name: "אחרי חופש גדול", month: 8, week: 2, impact: 1.35, type: "seasonal", leadTimeDays: 7, description: "חזרה מחופש = תוכניות שיפוצים" },
        { name: "סוכות", month: 9, week: 2, impact: 1.15, type: "holiday", leadTimeDays: 21, description: "סוכות = פרגולות" },
        { name: "ראש השנה", month: 8, week: 4, impact: 1.10, type: "holiday", leadTimeDays: 14, description: "שנה חדשה = תוכניות חדשות" },
        { name: "חנוכה/חג המולד", month: 11, week: 3, impact: 0.85, type: "holiday", leadTimeDays: 0, description: "חופשות = פחות עבודה" },
        { name: "בחירות", month: null, week: null, impact: 0.85, type: "event", leadTimeDays: 14, description: "חוסר ודאות = דחיית החלטות" },
        { name: "גל חום", month: 7, week: 2, impact: 0.75, type: "weather", leadTimeDays: 3, description: "חום = פחות עבודה + פחות חיפושים" },
        { name: "גשם ראשון", month: 10, week: 3, impact: 1.20, type: "weather", leadTimeDays: 3, description: "גשם = חלודה = חיפושי מעקות" },
        { name: "שישי בוקר", month: null, week: null, impact: 1.15, type: "weekly", leadTimeDays: 0, description: "Peak decision making" },
        { name: "מבצע בנקאי", month: null, week: null, impact: 1.22, type: "market", leadTimeDays: 7, description: "מבצע משכנתאות = רכישות + שיפוצים" },
      ],
    });
  }
  save() { save(this.file, this.data); }

  getCurrentSeasonMultiplier() {
    const month = new Date().getMonth();
    if (this.data.seasons.peak.months.includes(month)) return this.data.seasons.peak.multiplier;
    if (this.data.seasons.low.months.includes(month)) return this.data.seasons.low.multiplier;
    return this.data.seasons.normal.multiplier;
  }

  getUpcomingEvents(daysAhead = 30) {
    const now_ = new Date();
    const upcoming = [];
    for (const event of this.data.events) {
      if (event.month === null) continue;
      const eventDate = new Date(now_.getFullYear(), event.month, (event.week || 1) * 7);
      const daysUntil = Math.ceil((eventDate - now_) / 86400000);
      if (daysUntil >= -7 && daysUntil <= daysAhead) {
        upcoming.push({ ...event, daysUntil, preparationDeadline: daysUntil - event.leadTimeDays });
      }
    }
    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  async predict(horizonDays = 90) {
    log("SEASONAL", `🌤️ חיזוי ביקוש ל-${horizonDays} ימים...`);
    const upcoming = this.getUpcomingEvents(horizonDays);
    const currentMultiplier = this.getCurrentSeasonMultiplier();

    const result = await this.brain.thinkJSON(`
אתה מנוע חיזוי ביקוש עונתי של טכנו כל עוזי + קובי אלקיים נדל"ן.

═══ מצב נוכחי ═══
חודש: ${new Date().getMonth() + 1}
עונה: ${currentMultiplier > 1.1 ? "שיא" : currentMultiplier < 0.8 ? "שפל" : "רגיל"}
מכפיל עונתי: ${currentMultiplier}

═══ אירועים קרובים ═══
${JSON.stringify(upcoming)}

═══ נתונים היסטוריים (סימולציה) ═══
הנח: 20 לידים/יום בממוצע, ₪15,000 ממוצע עסקה, 15% שיעור המרה

═══ גורמים ═══
1. עונתיות: מרץ-מאי ואוגוסט-אוקטובר = שיא
2. חגים: לפני פסח/ראש השנה = spike
3. מזג אוויר: גשם = חיפושי חלודה/מעקות
4. כלכלה: ריבית, מדד דירות
5. שוק נדל"ן: עליית מחירים = שיפוצים

חזה לכל שבוע:
1. ביקוש צפוי (לידים/יום)
2. הכנסה צפויה
3. כוח אדם נדרש
4. מלאי נדרש
5. תקציב פרסום מומלץ

תחזיר JSON:
{
  "currentSeason": "peak/normal/low",
  "seasonMultiplier": 0,
  "weeklyForecast": [{
    "week": 1,
    "startDate": "...",
    "expectedLeads": 0,
    "expectedRevenue": 0,
    "demandLevel": "very_high/high/normal/low/very_low",
    "events": ["..."],
    "staffingNeed": 0,
    "inventoryAlert": ["חומר שצריך להזמין"],
    "adBudgetMultiplier": 0,
    "confidence": 0.0-1.0
  }],
  "peakPeriods": [{"start": "...", "end": "...", "reason": "...", "preparation": ["..."]}],
  "lowPeriods": [{"start": "...", "end": "...", "reason": "...", "opportunity": "..."}],
  "staffingPlan": {
    "currentHeadcount": 30,
    "peakNeed": 0,
    "lowNeed": 0,
    "recommendation": "...",
    "tempStaffNeeded": 0,
    "tempStaffWhen": "..."
  },
  "inventoryPlan": {
    "preOrderMaterials": [{"material": "...", "quantity": "...", "orderBy": "...", "reason": "..."}],
    "totalPreOrderCost": 0
  },
  "budgetPlan": {
    "monthlyAdBudgets": [{"month": "...", "budget": 0, "multiplier": 0, "reason": "..."}],
    "totalAnnualBudget": 0
  },
  "revenueForcast": {
    "next30days": 0,
    "next90days": 0,
    "annual": 0,
    "confidence": 0.0-1.0
  },
  "actionItems": [{
    "action": "...",
    "deadline": "...",
    "reason": "...",
    "priority": "critical/high/medium/low",
    "owner": "..."
  }]
}`);

    if (result) {
      this.data.predictions.push({ horizonDays, ...result, t: now() });
      this.data.predictions = this.data.predictions.slice(-20);
      this.save();
      log("SEASONAL", `✅ חיזוי: 30d ₪${shekel(result.revenueForcast?.next30days || 0)} | 90d ₪${shekel(result.revenueForcast?.next90days || 0)} | Annual ₪${shekel(result.revenueForcast?.annual || 0)}`, "SUCCESS");
    }

    return result;
  }
}

// ═══════════════════════════════════════
// EXPORT PART 7
// ═══════════════════════════════════════

module.exports = {
  SocialMediaModule, CompetitorSpyModule, CashPredictorModule,
  WellnessModule, EnergyModule, LegalModule,
  MultiCurrencyModule, SeasonalModule,
};
