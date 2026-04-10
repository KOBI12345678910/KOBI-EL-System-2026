// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 4/4
// SWARM + ADVERSARIAL + DREAM + META-LEARN + GOALS + ORCHESTRATOR
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, Brain, Memory, ERPModule, CRMModule, MASTER_SYSTEM_PROMPT, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const { BOMModule, HRModule, FinanceModule, OpsModule } = require("./paradigm-part2");
const { PricingModule, MarketingModule, QualityModule, NotificationModule, AnalyticsModule } = require("./paradigm-part3");
const path = require("path");

// ═══════════════════════════════════════
// SWARM COUNCIL — 7 C-level Agents
// ═══════════════════════════════════════

const AGENT_ROLES = {
  ceo: {
    name: "CEO",
    perspective: "אסטרטגיה, חזון, טווח ארוך, מותג, מוניטין, בעלי עניין",
    priorities: ["צמיחה ארוכת טווח", "מוניטין", "ערך למותג", "קיימות עסקית"],
    systemPrompt: "אתה המנכ\"ל של טכנו כל עוזי + קובי אלקיים נדל\"ן. חשוב אסטרטגית. חזון 5-10 שנים. מה משרת את העסק לטווח הארוך?",
  },
  coo: {
    name: "COO",
    perspective: "תפעול, יעילות, ביצועים, שרשרת אספקה, איכות, אנשי צוות",
    priorities: ["לוח זמנים", "איכות", "יעילות", "בטיחות", "פרודוקטיביות"],
    systemPrompt: "אתה מנהל התפעול. חשוב על איך לבצע — האם יש לנו יכולת? האם נעמוד בלוחות זמנים? מה הסיכונים התפעוליים?",
  },
  cfo: {
    name: "CFO",
    perspective: "כסף, תזרים, סיכון, דוחות, רווחיות, מיסוי",
    priorities: ["תזרים חיובי", "מרווחים", "ROI", "הפחתת סיכון", "ציות מס"],
    systemPrompt: "אתה סמנכ\"ל כספים. חשוב על מספרים. מה העלות? מה הרווח? מה ה-ROI? מה הסיכון הפיננסי?",
  },
  cmo: {
    name: "CMO",
    perspective: "שיווק, מותג, לקוחות, תחרות, ערך ללקוח",
    priorities: ["רכישת לקוחות", "CAC/LTV", "מיצוב מותג", "נאמנות", "הפניות"],
    systemPrompt: "אתה סמנכ\"ל שיווק. חשוב על הלקוחות — מה יגרום להם לבחור בנו? איך להצטיין מעל התחרות? איך למקסם ערך?",
  },
  cto: {
    name: "CTO",
    perspective: "טכנולוגיה, אוטומציה, דאטה, חדשנות, מערכות",
    priorities: ["אוטומציה", "דיוק דאטה", "סקלביליות", "אבטחה", "חדשנות"],
    systemPrompt: "אתה סמנכ\"ל טכנולוגיה. מה אפשר לאוטמט? איפה נתונים חסרים? מה צריך להיבנות? מה חדש בטכנולוגיה?",
  },
  chro: {
    name: "HR Director",
    perspective: "אנשים, תרבות, מוטיבציה, גיוס, שימור, כישורים",
    priorities: ["שימור עובדים טובים", "פרודוקטיביות", "מורל", "הכשרה", "צמיחה"],
    systemPrompt: "אתה מנהל משאבי אנוש. חשוב על העובדים — האם יש לנו את האנשים הנכונים? איך להניע אותם? מה חסר בכישורים?",
  },
  cro: {
    name: "Risk Manager",
    perspective: "סיכונים, ציות, אסונות, משפט, ביטוח",
    priorities: ["מניעה", "תגובה מהירה", "ציות רגולטורי", "חוסן עסקי"],
    systemPrompt: "אתה מנהל סיכונים. מה יכול להשתבש? מה ההשלכות הגרועות ביותר? האם אנחנו מוגנים משפטית? האם אנחנו עומדים ברגולציה?",
  },
};

class SwarmCouncil {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "agents", "debates.json");
    this.debates = load(this.file, []);
  }
  save() { save(this.file, this.debates); }

  async debate(situation, options = null, context = {}) {
    log("SWARM", `🎭 דיון: ${situation.substring(0, 80)}...`, "SWARM");

    const debate = {
      id: `DBT-${uid()}`,
      situation,
      options: options || [],
      context,
      rounds: [],
      finalDecision: null,
      dissent: [],
      createdAt: now(),
    };

    // Round 1 — independent opening statements
    const opening = {};
    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      const res = await this.brain.thinkJSON(`
${role.systemPrompt}

═══ המצב ═══
${situation}
${options ? `\nאפשרויות:\n${JSON.stringify(options)}` : ""}
${Object.keys(context).length > 0 ? `\nקונטקסט:\n${JSON.stringify(context)}` : ""}

אתה חושב כמו אדם בתפקיד הזה. אל תהיה מאוזן — דחוף את נקודת המבט שלך.

תחזיר JSON:
{
  "agent": "${role.name}",
  "position": "2-3 משפטים — העמדה שלך",
  "reasoning": "הסבר מפורט",
  "concerns": ["דאגה 1", "דאגה 2"],
  "requiredData": ["מידע חסר"],
  "preferredOption": "האפשרות המועדפת",
  "rejectedOptions": ["אפשרות שדוחה"],
  "conditions": ["תנאי להסכמה"],
  "confidence": 0.0-1.0
}`, role.systemPrompt);
      opening[key] = res;
    }
    debate.rounds.push({ round: 1, type: "opening", statements: opening });

    // Round 2 — cross-examination
    const debated = {};
    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      const others = Object.entries(opening)
        .filter(([k, _]) => k !== key)
        .map(([k, s]) => `${AGENT_ROLES[k].name}: ${s?.position || "—"}`)
        .join("\n");

      const res = await this.brain.thinkJSON(`
${role.systemPrompt}

═══ המצב ═══
${situation}

═══ העמדה שלך (סבב 1) ═══
${opening[key]?.position || "—"}

═══ עמדות האחרים ═══
${others}

עם המידע החדש — האם אתה משנה עמדה? עם מי מסכים? עם מי לא? מה הפשרה?

תחזיר JSON:
{
  "updatedPosition": "...",
  "changed": true/false,
  "agreesWith": ["שם"],
  "disagreesWith": ["שם"],
  "counterArgument": "טיעון נגד מישהו ספציפי",
  "compromise": "פשרה אפשרית",
  "confidence": 0.0-1.0
}`, role.systemPrompt);
      debated[key] = res;
    }
    debate.rounds.push({ round: 2, type: "cross_examination", statements: debated });

    // Round 3 — synthesis by a meta arbiter
    const synthesis = await this.brain.thinkJSON(`
אתה בורר מומחה. קראת דיון של 7 מומחים C-level.

═══ המצב ═══
${situation}
${options ? `\nאפשרויות:\n${JSON.stringify(options)}` : ""}

═══ עמדות פתיחה ═══
${Object.entries(opening).map(([k, s]) => `${AGENT_ROLES[k].name}: ${s?.position || "—"}`).join("\n")}

═══ עמדות אחרי דיון ═══
${Object.entries(debated).map(([k, s]) => `${AGENT_ROLES[k].name}: ${s?.updatedPosition || "—"}`).join("\n")}

תפקידך: לסנתז את כל נקודות המבט להחלטה אחת מיטבית. לא הכי פופולרית — הכי נכונה.
לזהות Consensus / Dissent / Unresolved.

תחזיר JSON:
{
  "consensus": ["נקודות שכולם מסכימים"],
  "dissent": [{"agent": "...", "disagreement": "..."}],
  "winningOption": "...",
  "reasoning": "הסבר מפורט",
  "tradeoffs": [{"gain": "...", "loss": "..."}],
  "implementation": ["שלב 1", "שלב 2", "שלב 3"],
  "monitoringPlan": ["מה לעקוב אחריו"],
  "fallbackPlan": "אם זה לא עובד — מה עושים",
  "confidence": 0.0-1.0,
  "recommendedAction": "הפעולה הספציפית לבצע עכשיו"
}`);

    debate.finalDecision = synthesis;
    debate.dissent = synthesis?.dissent || [];
    this.debates.push(debate);
    this.debates = this.debates.slice(-100);
    this.save();

    this.memory.add("decisions", {
      type: "swarm_debate",
      situation: situation.substring(0, 200),
      decision: synthesis?.recommendedAction || "pending",
      confidence: synthesis?.confidence || 0,
    });
    this.memory.stat("totalDebates");

    log("SWARM", `🎯 החלטה: ${synthesis?.recommendedAction?.substring(0, 60) || "—"} (conf ${synthesis?.confidence || 0})`, "SWARM");
    return debate;
  }
}

// ═══════════════════════════════════════
// ADVERSARIAL ENGINE — Red Team
// ═══════════════════════════════════════

class AdversarialEngine {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "agents", "adversarial.json");
    this.attacks = load(this.file, []);
  }
  save() { save(this.file, this.attacks); }

  async attack(decision, context = {}) {
    log("ADVERSARY", `⚔️ Red Team תוקף החלטה...`, "WARN");

    const attack = await this.brain.thinkJSON(`
אתה Red Team מקצועי. תפקידך: לקרוע את ההחלטה הזו לגזרים.
חפש חולשות. חפש Cognitive Biases. חפש Black Swans.
אל תהיה נחמד. תהיה אגרסיבי (בטוב).

═══ ההחלטה שנבדקת ═══
${JSON.stringify(decision, null, 2)}

═══ קונטקסט ═══
${JSON.stringify(context, null, 2)}

═══ מה לבדוק ═══

1. **Cognitive Biases** — איזו הטיה נפלנו בה?
   - Confirmation bias (חיפשנו רק ראיות שתומכות)
   - Availability bias (זכרנו רק דברים נוכחיים)
   - Anchoring (נתלינו באומדן ראשוני)
   - Sunk cost (התאהבנו בהשקעות קודמות)
   - Overconfidence (אנחנו בטוחים מדי)
   - Dunning-Kruger (לא יודעים מה שלא יודעים)
   - Groupthink (חשיבה קבוצתית)

2. **Black Swans** — מה הכי גרוע שיכול לקרות?
   - רגולציה חדשה
   - תחרות אגרסיבית
   - משבר כלכלי / מלחמה
   - אסון טבע
   - טעויות בביצוע
   - תגובת לקוחות לא צפויה
   - שינוי שער דולר / אינפלציה

3. **Goodhart's Law** — האם המטרה תעוות את ההתנהגות?
4. **Second-Order Effects** — מה ההשלכות של ההשלכות?
5. **Unintended Consequences** — מה יכול להתפקח לא נכון?
6. **Moral Hazard** — האם זה יוצר תמריצים רעים?
7. **Reversibility** — אם זה נכשל, האם ניתן לחזור?
8. **Counter-parties** — איך יגיבו לקוחות/ספקים/עובדים/מתחרים?

תחזיר JSON:
{
  "verdict": "accept/reject/modify",
  "confidence": 0.0-1.0,
  "detectedBiases": [{"bias": "...", "evidence": "...", "severity": "low/medium/high"}],
  "blackSwans": [{
    "scenario": "...", "probability": 0.0-1.0, "impact": "catastrophic/severe/moderate",
    "mitigationNeeded": "..."
  }],
  "secondOrderEffects": [{
    "firstOrder": "...", "secondOrder": "...", "thirdOrder": "..."
  }],
  "criticalWeaknesses": ["חולשה 1", "חולשה 2"],
  "betterAlternatives": [{"alternative": "...", "reason": "..."}],
  "requiredSafeguards": ["בטחון 1", "בטחון 2"],
  "killCriteria": ["תנאי להפסקה"],
  "scoreAfterAttack": 0-100
}`);

    this.attacks.push({ decision, attack, context, t: now() });
    this.attacks = this.attacks.slice(-100);
    this.save();

    if (attack?.detectedBiases?.length > 0) {
      this.memory.add("insights", {
        type: "bias_detected",
        biases: attack.detectedBiases.map(b => b.bias),
      });
    }

    log("ADVERSARY", `🛡️ פסק: ${attack?.verdict || "—"} (${attack?.scoreAfterAttack || 0}/100)`);
    return attack;
  }
}

// ═══════════════════════════════════════
// DREAM ENGINE — Creative Synthesis
// ═══════════════════════════════════════

class DreamEngine {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "dreams", "journal.json");
    this.dreams = load(this.file, []);
  }
  save() { save(this.file, this.dreams); }

  async dream() {
    log("DREAM", `💭 נכנס למצב חלום...`, "DREAM");

    const summary = this.memory.getSummary();
    const patterns = this.memory.get("patterns", 10);
    const successes = this.memory.get("successes", 10);
    const mistakes = this.memory.get("mistakes", 10);
    const insights = this.memory.get("insights", 10);

    const dream = await this.brain.thinkJSON(`
אתה במצב חלום. התנתק מהנוכחי. תחבר דברים לא קשורים. תראה תבניות נסתרות.
תחשוב על מה שאנחנו לא יודעים שאנחנו לא יודעים (unknown unknowns).
תעשה אנלוגיות מטבע, פיזיקה, מוזיקה, אומנות לחימה, רפואה, ביולוגיה.
תיצור השראה — לא חייב להיות פרקטי ב-100%.

═══ מצב הזיכרון ═══
${JSON.stringify(summary, null, 2)}

═══ תבניות אחרונות ═══
${JSON.stringify(patterns, null, 2)}

═══ הצלחות ═══
${JSON.stringify(successes, null, 2)}

═══ טעויות ═══
${JSON.stringify(mistakes, null, 2)}

═══ תובנות ═══
${JSON.stringify(insights, null, 2)}

תחזיר JSON:
{
  "dream": "תיאור החלום — דימויים, רעיונות, קישורים מפתיעים",
  "hiddenPatterns": [{
    "pattern": "...", "evidence": "...", "whyMatters": "..."
  }],
  "unknownUnknowns": ["דברים שאפילו לא שאלנו עליהם"],
  "crossDomainAnalogies": [{
    "fromDomain": "nature/physics/music/military/medicine/biology",
    "analogy": "...",
    "application": "איך להחיל על העסק"
  }],
  "creativeIdeas": [{
    "idea": "...",
    "originality": "1-10",
    "feasibility": "1-10",
    "impact": "1-10",
    "firstStep": "איך לבדוק זאת"
  }],
  "questionToExplore": "שאלה חשובה שלא שאלנו",
  "emergentStrategy": "אסטרטגיה שעולה מתוך ניתוח החלום",
  "insightOfTheNight": "תובנה אחת חשובה שעלתה"
}`);

    if (dream) {
      this.dreams.push({ ...dream, _id: uid(), _t: now() });
      this.dreams = this.dreams.slice(-200);
      this.save();
      this.memory.add("insights", { type: "dream", insight: dream.insightOfTheNight });
      this.memory.stat("totalDreams");
      log("DREAM", `💡 תובנה: ${dream.insightOfTheNight?.substring(0, 80) || "—"}`, "DREAM");
    }
    return dream;
  }
}

// ═══════════════════════════════════════
// META LEARNER — Learning How to Learn
// ═══════════════════════════════════════

class MetaLearner {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "agents", "meta.json");
    this.data = load(this.file, {
      learningRate: 0.15,
      explorationRatio: 0.25,
      overfittingRisk: 0.1,
      reviews: [],
      rules: [],
      experiments: [],
    });
  }
  save() { save(this.file, this.data); }

  async reflect() {
    log("META", `🧠 Meta-Learning...`);

    const summary = this.memory.getSummary();
    const decisions = this.memory.get("decisions", 20);
    const successes = this.memory.get("successes", 10);
    const mistakes = this.memory.get("mistakes", 10);

    const reflection = await this.brain.thinkJSON(`
אתה מטא-לומד. תפקידך: לא ללמוד על העסק — ללמוד איך אני לומד על העסק.
מה עובד בלמידה שלי? מה לא? מה לשפר?

═══ נתוני זיכרון ═══
${JSON.stringify(summary, null, 2)}

═══ החלטות אחרונות ═══
${decisions.length}
═══ הצלחות ═══
${successes.length}
═══ טעויות ═══
${mistakes.length}

═══ פרמטרים נוכחיים ═══
Learning Rate: ${this.data.learningRate}
Exploration Ratio: ${this.data.explorationRatio}
Overfitting Risk: ${this.data.overfittingRisk}

תחזיר JSON:
{
  "learningAssessment": "איך אני לומד — טוב/בינוני/רע",
  "patterns": {"whatWorks": ["..."], "whatDoesnt": ["..."]},
  "metaInsights": ["תובנות על הלמידה עצמה"],
  "suggestedAdjustments": {
    "learningRate": 0.0-1.0,
    "explorationRatio": 0.0-1.0,
    "reason": "..."
  },
  "newRules": [{
    "rule": "כלל חדש שנגזר מניסיון",
    "basedOn": "ראיה",
    "confidence": 0.0-1.0
  }],
  "overfittingRisk": 0.0-1.0,
  "blindSpots": ["איפה אני לא רואה"],
  "nextExperiment": "ניסוי להרצה"
}`);

    if (reflection) {
      if (reflection.suggestedAdjustments) {
        this.data.learningRate = clamp(reflection.suggestedAdjustments.learningRate || this.data.learningRate, 0.05, 0.5);
        this.data.explorationRatio = clamp(reflection.suggestedAdjustments.explorationRatio || this.data.explorationRatio, 0.1, 0.5);
      }
      this.data.overfittingRisk = reflection.overfittingRisk ?? this.data.overfittingRisk;
      if (reflection.newRules) {
        for (const r of reflection.newRules) {
          if (r.confidence > 0.7) this.data.rules.push({ ...r, t: now() });
        }
      }
      if (reflection.nextExperiment) {
        this.data.experiments.push({ experiment: reflection.nextExperiment, t: now(), status: "proposed" });
      }
      this.data.reviews.push({ ...reflection, _t: now() });
      this.data.reviews = this.data.reviews.slice(-50);
      this.save();
      this.memory.add("insights", { type: "meta_learning", assessment: reflection.learningAssessment });
      log("META", `🧠 LR=${this.data.learningRate.toFixed(2)} Explore=${this.data.explorationRatio.toFixed(2)} Overfit=${this.data.overfittingRisk.toFixed(2)}`);
    }
    return reflection;
  }
}

// ═══════════════════════════════════════
// GOAL MANAGER — 10 Business Objectives
// ═══════════════════════════════════════

class GoalManager {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "goals.json");
    this.goals = load(this.file, this._defaultGoals());
  }
  save() { save(this.file, this.goals); }

  _defaultGoals() {
    return [
      { id: "G1",  metric: "leads_per_day",          target: 8,        current: 0, unit: "leads",           horizon: "monthly",   priority: "critical", progress: 0 },
      { id: "G2",  metric: "monthly_revenue_agorot", target: 15000000, current: 0, unit: "agorot",          horizon: "monthly",   priority: "critical", progress: 0 },
      { id: "G3",  metric: "gross_margin_percent",   target: 35,       current: 0, unit: "percent",         horizon: "quarterly", priority: "high",     progress: 0 },
      { id: "G4",  metric: "customer_satisfaction",  target: 95,       current: 0, unit: "percent",         horizon: "quarterly", priority: "high",     progress: 0 },
      { id: "G5",  metric: "on_time_delivery",       target: 90,       current: 0, unit: "percent",         horizon: "monthly",   priority: "high",     progress: 0 },
      { id: "G6",  metric: "quote_win_rate",         target: 45,       current: 0, unit: "percent",         horizon: "monthly",   priority: "high",     progress: 0 },
      { id: "G7",  metric: "inventory_turnover",     target: 12,       current: 0, unit: "times_per_year",  horizon: "quarterly", priority: "medium",   progress: 0 },
      { id: "G8",  metric: "international_leads",    target: 30,       current: 0, unit: "leads",           horizon: "monthly",   priority: "high",     progress: 0 },
      { id: "G9",  metric: "avg_project_cycle_days", target: 14,       current: 0, unit: "days",            horizon: "monthly",   priority: "high",     progress: 0 },
      { id: "G10", metric: "defect_rate_percent",    target: 2,        current: 0, unit: "percent",         horizon: "quarterly", priority: "high",     progress: 0 },
    ];
  }

  update(id, current) {
    const g = this.goals.find(x => x.id === id);
    if (!g) return null;
    g.current = current;
    g.progress = g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0;
    g.lastUpdated = now();
    this.save();
    return g;
  }

  getStatus() {
    return this.goals.map(g => ({
      id: g.id, metric: g.metric,
      target: g.target, current: g.current,
      progress: g.progress,
      status: g.progress >= 100 ? "achieved" : g.progress >= 70 ? "on_track" : g.progress >= 40 ? "at_risk" : "off_track",
      priority: g.priority, horizon: g.horizon,
    }));
  }
}

// ═══════════════════════════════════════
// PARADIGM ENGINE — Main Orchestrator
// ═══════════════════════════════════════

class ParadigmEngine {
  constructor() {
    this.running = false;
    this.cycle = 0;
    this.startedAt = null;

    // Core
    this.brain = new Brain();
    this.memory = new Memory();

    // Business modules
    this.erp       = new ERPModule(this.brain, this.memory);
    this.crm       = new CRMModule(this.brain, this.memory);
    this.bom       = new BOMModule(this.brain, this.memory);
    this.hr        = new HRModule(this.brain, this.memory);
    this.finance   = new FinanceModule(this.brain, this.memory);
    this.ops       = new OpsModule(this.brain, this.memory);
    this.pricing   = new PricingModule(this.brain, this.memory);
    this.marketing = new MarketingModule(this.brain, this.memory);
    this.quality   = new QualityModule(this.brain, this.memory);
    this.notify    = new NotificationModule(this.brain, this.memory);
    this.analytics = new AnalyticsModule(this.brain, this.memory, {
      erp: this.erp, crm: this.crm, bom: this.bom, hr: this.hr,
      finance: this.finance, ops: this.ops, pricing: this.pricing,
      marketing: this.marketing, quality: this.quality,
    });

    // Cognitive layer
    this.swarm       = new SwarmCouncil(this.brain, this.memory);
    this.adversarial = new AdversarialEngine(this.brain, this.memory);
    this.dream       = new DreamEngine(this.brain, this.memory);
    this.meta        = new MetaLearner(this.brain, this.memory);

    // Goals
    this.goals = new GoalManager(this.memory);

    this._signalsRegistered = false;
  }

  async runCycle() {
    this.cycle++;
    const startTime = Date.now();
    log("ENGINE", `╔═══ CYCLE ${this.cycle} ═══╗`);

    try {
      // Stage 1 — PERCEIVE
      this.memory.conscious(0, `cycle ${this.cycle} start ${now()}`);
      const snapshot = this.analytics.takeSnapshot();
      this.memory.conscious(1, `perceived ${JSON.stringify({
        projects: snapshot.erp?.activeProjects,
        leads: snapshot.crm?.totalLeads,
        cash: snapshot.finance?.cashflowBalance,
      })}`);

      // Stage 2 — ANALYZE (rotating module per cycle)
      const analyzers = [
        { name: "ERP",       fn: () => this.erp.analyze() },
        { name: "CRM",       fn: () => this.crm.analyze() },
        { name: "BOM",       fn: () => this.bom.analyze() },
        { name: "HR",        fn: () => this.hr.analyze() },
        { name: "Finance",   fn: () => this.finance.analyze() },
        { name: "Ops",       fn: () => this.ops.analyze() },
        { name: "Pricing",   fn: () => this.pricing.analyze() },
        { name: "Marketing", fn: () => this.marketing.analyze() },
        { name: "Quality",   fn: () => this.quality.analyze() },
      ];
      const analyzer = analyzers[this.cycle % analyzers.length];
      log("ENGINE", `🔬 מנתח ${analyzer.name}...`);
      const analysis = await analyzer.fn();
      if (analysis) {
        this.memory.add("longTerm", { type: `analysis_${analyzer.name.toLowerCase()}`, analysis, cycle: this.cycle });
        this.memory.conscious(2, `${analyzer.name}: status=${analysis.status}, score=${analysis.score}`);
      }

      // Stage 3 — SCORE LEADS (every 3 cycles)
      if (this.cycle % 3 === 0 && typeof this.crm.scoreAllLeads === "function") {
        try { await this.crm.scoreAllLeads(); } catch {}
      }

      // Stage 4 — PROCESS NOTIFICATIONS
      await this.notify.processQueue();

      // Stage 5 — PREDICT (every 5 cycles)
      if (this.cycle % 5 === 0) {
        this.memory.conscious(3, `predicting next 7 days from ${this.memory.count("patterns")} patterns`);
      }

      // Stage 6 — DECIDE via SWARM (critical situations only)
      if (analysis && (analysis.status === "critical" || (analysis.score !== undefined && analysis.score < 50))) {
        log("ENGINE", `⚠️ מצב קריטי — מפעיל Swarm`, "WARN");
        const debate = await this.swarm.debate(
          `${analyzer.name} במצב ${analysis.status} (ציון ${analysis.score}). סיכום: ${analysis.summary || "—"}`,
          analysis.automatedActions?.map(a => a.action) || null,
          { module: analyzer.name, analysis }
        );

        if (debate?.finalDecision) {
          const attack = await this.adversarial.attack(debate.finalDecision, { analysis, module: analyzer.name });
          if (attack?.verdict === "reject") {
            log("ENGINE", `❌ Red Team דחה — לא מבצעים`, "ERROR");
          } else {
            this.memory.conscious(4, `swarm decision accepted: ${debate.finalDecision.recommendedAction}`);
            this.memory.add("decisions", {
              type: "accepted",
              action: debate.finalDecision.recommendedAction,
              confidence: debate.finalDecision.confidence,
              adversarialScore: attack?.scoreAfterAttack || 0,
            });
          }
        }
      }

      // Stage 7 — ADVERSARIAL SELF-TEST
      if (this.cycle % CONFIG.ADVERSARIAL_EVERY === 0) {
        const recent = this.memory.get("decisions", 1)[0];
        if (recent) await this.adversarial.attack(recent, { cycle: this.cycle });
      }

      // Stage 8 — DREAM
      if (this.cycle % CONFIG.DREAM_EVERY === 0) {
        await this.dream.dream();
      }

      // Stage 9 — META-LEARN
      if (this.cycle % CONFIG.META_LEARN_EVERY === 0) {
        await this.meta.reflect();
      }

      // Stage 10 — EXECUTIVE REPORT
      if (this.cycle % CONFIG.REPORT_EVERY === 0) {
        await this.analytics.generateExecutiveReport();
      }

      // Stage 11 — UPDATE GOALS
      this.goals.update("G2", snapshot.finance?.cashflowBalance || 0);
      this.goals.update("G1", Math.round((snapshot.crm?.totalLeads || 0) / Math.max(1, this.cycle)));

      // Finalize
      this.memory.stat("totalCycles");
      this.memory.conscious(5, `cycle ${this.cycle} done in ${Date.now() - startTime}ms`);

      log("ENGINE", `╚═══ CYCLE ${this.cycle} DONE (${Date.now() - startTime}ms) ═══╝`, "SUCCESS");
    } catch (e) {
      log("ENGINE", `❌ שגיאה ב-cycle ${this.cycle}: ${e.message}`, "ERROR");
      this.memory.add("mistakes", { type: "cycle_error", cycle: this.cycle, error: e.message });
    }
  }

  _banner() {
    const banner = `
\x1b[36m╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║        ██████╗  █████╗ ██████╗  █████╗ ██████╗ ██╗ ██████╗ ███╗   ███╗       ║
║        ██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗██║██╔════╝ ████╗ ████║       ║
║        ██████╔╝███████║██████╔╝███████║██║  ██║██║██║  ███╗██╔████╔██║       ║
║        ██╔═══╝ ██╔══██║██╔══██╗██╔══██║██║  ██║██║██║   ██║██║╚██╔╝██║       ║
║        ██║     ██║  ██║██║  ██║██║  ██║██████╔╝██║╚██████╔╝██║ ╚═╝ ██║       ║
║        ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝ ╚═╝     ╚═╝       ║
║                                                                              ║
║                  AUTONOMOUS BUSINESS OS  ·  v4.0                             ║
║                  טכנו כל עוזי  +  קובי אלקיים נדל"ן                          ║
║                                                                              ║
║  11 Modules · 7 C-Level Agents · Adversarial · Dream · Meta · 10 Goals       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m
`;
    console.log(banner);
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = now();

    this._banner();
    log("ENGINE", `🚀 PARADIGM v4.0 מתחיל...`, "SUCCESS");
    log("ENGINE", `⚙️  Cycle interval: ${CONFIG.CYCLE_MS / 1000}s`);
    log("ENGINE", `🧠 Brain: ${CONFIG.MODEL}`);
    log("ENGINE", `📊 Business modules: ERP, CRM, BOM, HR, Finance, Ops, Pricing, Marketing, Quality, Notify, Analytics`);
    log("ENGINE", `🎭 Cognitive layer: Swarm(7), Adversarial, Dream, Meta, Goals(${this.goals.goals.length})`);

    if (!this._signalsRegistered) {
      this._signalsRegistered = true;
      const shutdown = (sig) => {
        log("ENGINE", `📴 ${sig} — עוצר בצורה בטוחה...`, "WARN");
        this.running = false;
        try {
          this.memory.save();
          this.erp.save(); this.crm.save(); this.bom.save(); this.hr.save();
          this.finance.save(); this.ops.save(); this.pricing.save();
          this.marketing.save(); this.quality.save(); this.notify.save();
          this.analytics.save(); this.goals.save();
        } catch {}
        process.exit(0);
      };
      process.on("SIGINT",  () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    }

    // Main loop
    while (this.running) {
      await this.runCycle();
      await new Promise(r => setTimeout(r, CONFIG.CYCLE_MS));
    }
  }

  getStatus() {
    return {
      running: this.running,
      cycle: this.cycle,
      startedAt: this.startedAt,
      brain: this.brain.getStats(),
      memory: this.memory.getSummary(),
      goals: this.goals.getStatus(),
      modules: {
        erp: this.erp.data.projects.length,
        crm: this.crm.data.leads.length,
        bom: this.bom.data.activeBOMs.length,
        hr: this.hr.data.employees.length,
        finance: this.finance.data.invoices.length,
        ops: this.ops.data.measurements.length,
        pricing: this.pricing.data.quotes.length,
        marketing: this.marketing.data.campaigns.length,
        quality: this.quality.data.inspections.length,
      },
      debates: this.swarm.debates.length,
      dreams: this.dream.dreams.length,
    };
  }
}

// ═══════════════════════════════════════
// EXPORT PART 4
// ═══════════════════════════════════════

module.exports = {
  AGENT_ROLES,
  SwarmCouncil,
  AdversarialEngine,
  DreamEngine,
  MetaLearner,
  GoalManager,
  ParadigmEngine,
};
