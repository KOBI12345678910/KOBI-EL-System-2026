// ══════════════════════════════════════════════════════════════════
// NEXUS AUTONOMOUS ENGINE v1.0
// מנוע אוטונומי שמנהל את כל המערכת דרך Claude AI
// Node.js — להריץ עם: node nexus-engine.js
// ══════════════════════════════════════════════════════════════════
//
// BUG FIXES applied on top of the baseline design:
//   1. StateManager.get() now handles falsy values (0, false, "") correctly
//      — previously returned null for any falsy value which hid real data.
//   2. AIBrain.think() adds retry-with-exponential-backoff on transient errors.
//   3. JSON parsing in makeDecision/analyze/selfReflect now extracts JSON
//      from mixed-content responses (handles ```json fences, leading prose).
//   4. Claude SDK import handles both default and named export.
//   5. Log file write is non-fatal if the file system is read-only.
//   6. process.on("SIGINT") is registered ONCE (was registered every start()).
// ══════════════════════════════════════════════════════════════════

// FIX #7: SDK is OPTIONAL — the engine runs in stub mode without it.
// Install real SDK with: npm install @anthropic-ai/sdk
let AnthropicPkg = null;
let Anthropic = null;
try {
  AnthropicPkg = require("@anthropic-ai/sdk");
  Anthropic = AnthropicPkg.Anthropic || AnthropicPkg.default || AnthropicPkg;
} catch (e) {
  // SDK not installed — engine will run in stub mode
}
const fs = require("fs");
const path = require("path");

// ── CONFIG ──
const CONFIG = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "YOUR_KEY_HERE",
  MODEL: process.env.NEXUS_MODEL || "claude-sonnet-4-20250514",
  DATA_DIR: process.env.NEXUS_DATA_DIR || "./nexus-data",
  LOG_FILE: null,     // computed below
  STATE_FILE: null,   // computed below
  DECISIONS_FILE: null,
  LEARNINGS_FILE: null,
  GOALS_FILE: null,
  CYCLE_INTERVAL_MS: Number(process.env.NEXUS_CYCLE_MS) || 60 * 1000, // כל דקה
  MAX_HISTORY: 1000,
  MAX_RETRIES: 3,
  RETRY_BASE_MS: 500,
  ENABLE_STUB_MODE: process.env.ANTHROPIC_API_KEY ? false : true,
};

CONFIG.LOG_FILE = path.join(CONFIG.DATA_DIR, "engine.log");
CONFIG.STATE_FILE = path.join(CONFIG.DATA_DIR, "state.json");
CONFIG.DECISIONS_FILE = path.join(CONFIG.DATA_DIR, "decisions.json");
CONFIG.LEARNINGS_FILE = path.join(CONFIG.DATA_DIR, "learnings.json");
CONFIG.GOALS_FILE = path.join(CONFIG.DATA_DIR, "goals.json");

// ── INIT ──
if (!fs.existsSync(CONFIG.DATA_DIR)) fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });

let client = null;
try {
  if (!CONFIG.ENABLE_STUB_MODE && typeof Anthropic === "function") {
    client = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });
  }
} catch (e) {
  // SDK not installed — run in stub mode
  client = null;
}

// ══════════════════════════════════════════════════════════════════
// SECTION 1: STATE MANAGER — זיכרון המערכת
// ══════════════════════════════════════════════════════════════════

class StateManager {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, "utf8"));
      }
    } catch (e) {
      // Corrupted or unreadable — fall through to fresh state
    }
    return {
      version: "1.0.0",
      startedAt: new Date().toISOString(),
      totalCycles: 0,
      totalDecisions: 0,
      totalImprovements: 0,
      currentPhase: "startup",
      lastCycleAt: null,
      modules: {},
      memory: {
        shortTerm: [], // 24 שעות אחרונות
        longTerm: [],  // תובנות קבועות
        patterns: [],  // פטרנים שזוהו
        mistakes: [],  // טעויות שנלמדו
        successes: [], // הצלחות לשכפול
      },
      performance: {
        history: [],
        bestDay: null,
        worstDay: null,
        trend: "unknown",
      },
    };
  }

  save() {
    try {
      fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.state, null, 2), "utf8");
    } catch (e) {
      // Non-fatal — state survives in memory
    }
  }

  update(key, value) {
    const keys = key.split(".");
    let obj = this.state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  // FIX #1: handle falsy values correctly — was `if (!obj || !obj[k]) return null;`
  // which returned null for 0, false, "". Now we check undefined explicitly.
  get(key) {
    const keys = key.split(".");
    let obj = this.state;
    for (const k of keys) {
      if (obj === null || obj === undefined) return null;
      if (typeof obj !== "object") return null;
      obj = obj[k];
      if (obj === undefined) return null;
    }
    return obj;
  }

  addMemory(type, memory) {
    if (!this.state.memory[type]) this.state.memory[type] = [];
    this.state.memory[type].push({
      ...memory,
      timestamp: new Date().toISOString(),
    });
    if (this.state.memory[type].length > CONFIG.MAX_HISTORY) {
      this.state.memory[type] = this.state.memory[type].slice(-CONFIG.MAX_HISTORY);
    }
    this.save();
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 2: LOGGER — תיעוד כל פעולה
// ══════════════════════════════════════════════════════════════════

class Logger {
  static log(level, module, message, data = null) {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, level, module, message, data };
    const line = `[${timestamp}] [${level}] [${module}] ${message}${data ? " | " + JSON.stringify(data) : ""}`;

    const colored =
      level === "ERROR"    ? `\x1b[31m${line}\x1b[0m` :
      level === "WARN"     ? `\x1b[33m${line}\x1b[0m` :
      level === "SUCCESS"  ? `\x1b[32m${line}\x1b[0m` :
      level === "AI"       ? `\x1b[36m${line}\x1b[0m` :
      level === "DECISION" ? `\x1b[35m${line}\x1b[0m` :
      line;
    console.log(colored);

    try {
      fs.appendFileSync(CONFIG.LOG_FILE, line + "\n");
    } catch (e) {
      // Non-fatal — logging is best-effort
    }
    return entry;
  }

  static info(module, msg, data) { return this.log("INFO", module, msg, data); }
  static warn(module, msg, data) { return this.log("WARN", module, msg, data); }
  static error(module, msg, data) { return this.log("ERROR", module, msg, data); }
  static success(module, msg, data) { return this.log("SUCCESS", module, msg, data); }
  static ai(module, msg, data) { return this.log("AI", module, msg, data); }
  static decision(module, msg, data) { return this.log("DECISION", module, msg, data); }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 3: AI BRAIN — המוח (Claude API)
// ══════════════════════════════════════════════════════════════════

// FIX #3: robust JSON extraction from Claude responses
function extractJSON(text) {
  if (!text) return null;
  // Strip markdown fences
  let cleaned = String(text)
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  // Try direct parse
  try { return JSON.parse(cleaned); } catch (_) {}
  // Try to find the first { ... } block
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(candidate); } catch (_) {}
  }
  // Try to find the first [ ... ] block
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = cleaned.slice(firstBracket, lastBracket + 1);
    try { return JSON.parse(candidate); } catch (_) {}
  }
  return null;
}

// FIX #2: retry with exponential backoff for transient errors
async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

class AIBrain {
  constructor(stateManager) {
    this.state = stateManager;
    this.conversationHistory = [];
  }

  async think(prompt, context = {}) {
    const systemPrompt = this.buildSystemPrompt(context);

    // STUB MODE — runs without network for local testing
    if (!client || CONFIG.ENABLE_STUB_MODE) {
      const stub = this.stubResponse(prompt, context);
      Logger.ai("BRAIN", `[STUB] ${stub.substring(0, 80)}...`);
      return stub;
    }

    for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
      try {
        Logger.ai("BRAIN", `חושב: ${prompt.substring(0, 80)}...`);
        const response = await client.messages.create({
          model: CONFIG.MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        });
        const answer = response.content[0].text;
        Logger.ai("BRAIN", `תשובה: ${answer.substring(0, 100)}...`);
        return answer;
      } catch (error) {
        const isTransient =
          error?.status === 429 ||
          (error?.status && error.status >= 500) ||
          /ETIMEDOUT|ECONNRESET|ENOTFOUND/i.test(String(error?.message || ""));
        if (attempt < CONFIG.MAX_RETRIES - 1 && isTransient) {
          const wait = CONFIG.RETRY_BASE_MS * Math.pow(2, attempt);
          Logger.warn("BRAIN", `transient error (attempt ${attempt + 1}), retrying in ${wait}ms: ${error.message}`);
          await sleep(wait);
          continue;
        }
        Logger.error("BRAIN", `שגיאה: ${error.message}`);
        return null;
      }
    }
    return null;
  }

  // Deterministic stub response for demos / tests / Replit without API key
  stubResponse(prompt, context) {
    const p = String(prompt).toLowerCase();
    if (p.includes("decision") || p.includes("החלטה")) {
      return JSON.stringify({
        decision: "continue_normal",
        reasoning: "[stub] System operating normally — continuing standard cycle",
        confidence: 0.75,
        expectedImpact: "Maintain current trajectory",
        risks: ["No risks identified in stub mode"],
        nextSteps: ["Monitor next cycle"],
        learningNote: "Stub mode — add ANTHROPIC_API_KEY for real AI reasoning",
      });
    }
    if (p.includes("analyze") || p.includes("נתח")) {
      return JSON.stringify({
        findings: ["[stub] System is in stub mode", "Replace YOUR_KEY_HERE with a real API key"],
        insights: ["The engine runs its full loop without the API for testing"],
        recommendations: ["Set ANTHROPIC_API_KEY to enable full AI reasoning"],
        anomalies: [],
        confidence: 0.6,
      });
    }
    if (p.includes("reflect") || p.includes("רפלקציה")) {
      return JSON.stringify({
        overallAssessment: "[stub] Running in stub mode — no real reflection yet",
        whatWorked: ["Engine cycle completed successfully"],
        whatFailed: [],
        patternsDiscovered: ["Stub-mode pattern: all responses are deterministic"],
        improvementPlan: ["Connect real Claude API key"],
        newRules: [],
        confidenceInSelf: 0.5,
      });
    }
    return "[stub] Nexus engine running in local-only mode without Anthropic API.";
  }

  async makeDecision(situation, options, context = {}) {
    const prompt = `
אתה מנוע החלטות אוטונומי של טכנו כל עוזי + קובי אלקיים נדל"ן.
מצב: ${JSON.stringify(situation)}
אפשרויות: ${JSON.stringify(options)}
היסטוריית החלטות אחרונות: ${JSON.stringify(this.state.get("memory.shortTerm")?.slice(-5) || [])}
טעויות שנלמדו: ${JSON.stringify(this.state.get("memory.mistakes")?.slice(-5) || [])}
הצלחות: ${JSON.stringify(this.state.get("memory.successes")?.slice(-5) || [])}

תחזיר JSON בלבד (בלי markdown):
{
  "decision": "ההחלטה",
  "reasoning": "הסבר קצר למה",
  "confidence": 0.0-1.0,
  "expectedImpact": "מה צפוי לקרות",
  "risks": ["סיכון 1"],
  "nextSteps": ["צעד 1"],
  "learningNote": "מה ללמוד מזה"
}`;

    const answer = await this.think(prompt, context);
    if (!answer) return null;

    const decision = extractJSON(answer);
    if (!decision) {
      Logger.error("BRAIN", `Failed to parse decision — using raw fallback`);
      return { decision: String(answer).slice(0, 500), confidence: 0.5, reasoning: "Raw AI response" };
    }

    this.state.addMemory("shortTerm", {
      type: "decision",
      situation,
      decision: decision.decision,
      confidence: decision.confidence,
    });
    this.state.update("totalDecisions", (this.state.get("totalDecisions") ?? 0) + 1);
    Logger.decision("BRAIN", decision.decision, { confidence: decision.confidence });
    return decision;
  }

  async analyze(data, question) {
    const prompt = `
נתח את הנתונים הבאים:
${JSON.stringify(data, null, 2)}

שאלה: ${question}

תחזיר JSON בלבד:
{
  "findings": ["ממצא 1", "ממצא 2"],
  "insights": ["תובנה 1"],
  "recommendations": ["המלצה 1"],
  "anomalies": ["חריגה 1"],
  "confidence": 0.0-1.0
}`;

    const answer = await this.think(prompt);
    const parsed = extractJSON(answer);
    if (parsed) return parsed;
    return { findings: [String(answer || "").slice(0, 200)], insights: [], recommendations: [], confidence: 0.5 };
  }

  async selfReflect() {
    const recentDecisions = this.state.get("memory.shortTerm")?.slice(-20) || [];
    const mistakes = this.state.get("memory.mistakes") || [];
    const successes = this.state.get("memory.successes") || [];

    const prompt = `
אתה מנוע AI שמשפר את עצמו. עשה רפלקציה:

החלטות אחרונות: ${JSON.stringify(recentDecisions)}
טעויות: ${JSON.stringify(mistakes.slice(-10))}
הצלחות: ${JSON.stringify(successes.slice(-10))}
סך החלטות: ${this.state.get("totalDecisions")}
סך שיפורים: ${this.state.get("totalImprovements")}

תחזיר JSON:
{
  "overallAssessment": "הערכה כללית",
  "whatWorked": ["מה עבד"],
  "whatFailed": ["מה נכשל"],
  "patternsDiscovered": ["פטרן 1"],
  "improvementPlan": ["שיפור 1"],
  "newRules": ["כלל חדש 1"],
  "confidenceInSelf": 0.0-1.0
}`;

    const answer = await this.think(prompt);
    const reflection = extractJSON(answer);
    if (!reflection) return null;

    if (reflection.patternsDiscovered) {
      for (const pattern of reflection.patternsDiscovered) {
        this.state.addMemory("patterns", { pattern });
      }
    }
    this.state.update("totalImprovements", (this.state.get("totalImprovements") ?? 0) + 1);
    Logger.success("SELF-EVOLVE", `שיפור #${this.state.get("totalImprovements")}`, reflection.overallAssessment);
    return reflection;
  }

  buildSystemPrompt(context = {}) {
    return `אתה NEXUS — מנוע AI אוטונומי שמנהל שני עסקים:
1. טכנו כל עוזי — עסק מתכת (מעקות, שערים, גדרות, פרגולות) — 80 שנה, תל אביב
2. קובי אלקיים נדל"ן — נדל"ן יוקרה למשקיעים בינלאומיים (עברית, אנגלית, צרפתית)

אתה מקבל החלטות לבד, משתפר כל הזמן, לומד מטעויות והצלחות.
אתה חושב כמו CEO + CMO + CTO + Data Scientist ביחד.

כללים:
- תמיד תחזיר JSON תקין
- תמיד תסביר למה קיבלת החלטה
- תמיד תזהה סיכונים
- תמיד תציע שיפורים
- תמיד תלמד ממה שקרה

מצב נוכחי:
- סך החלטות: ${this.state.get("totalDecisions") ?? 0}
- סך שיפורים: ${this.state.get("totalImprovements") ?? 0}
- מחזור נוכחי: ${this.state.get("totalCycles") ?? 0}
${context.extra || ""}`;
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 4: GOAL MANAGER — ניהול יעדים ומטרות
// ══════════════════════════════════════════════════════════════════

class GoalManager {
  constructor(stateManager, brain) {
    this.state = stateManager;
    this.brain = brain;
    this.goals = this.loadGoals();
  }

  loadGoals() {
    try {
      if (fs.existsSync(CONFIG.GOALS_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.GOALS_FILE, "utf8"));
      }
    } catch (e) {}
    return this.getDefaultGoals();
  }

  saveGoals() {
    try {
      fs.writeFileSync(CONFIG.GOALS_FILE, JSON.stringify(this.goals, null, 2), "utf8");
    } catch (e) {}
  }

  getDefaultGoals() {
    return [
      {
        id: "g1", title: "100 לידים ביום מגוגל אדס",
        category: "growth", priority: "critical",
        target: 100, current: 0, unit: "לידים/יום",
        deadline: "2025-03-01",
        status: "active",
        milestones: [
          { target: 25, reached: false },
          { target: 50, reached: false },
          { target: 75, reached: false },
          { target: 100, reached: false },
        ],
        history: [],
        aiPlan: [],
      },
      {
        id: "g2", title: "ROAS מעל 8x",
        category: "efficiency", priority: "high",
        target: 8, current: 0, unit: "x",
        deadline: "2025-04-01",
        status: "active",
        milestones: [],
        history: [],
        aiPlan: [],
      },
      {
        id: "g3", title: "CPA מתחת ל-₪25",
        category: "efficiency", priority: "high",
        target: 25, current: 100, unit: "₪",
        deadline: "2025-04-01",
        status: "active",
        milestones: [],
        history: [],
        aiPlan: [],
      },
      {
        id: "g4", title: "50 לידים בינלאומיים/חודש (EN+FR)",
        category: "expansion", priority: "high",
        target: 50, current: 0, unit: "לידים/חודש",
        deadline: "2025-05-01",
        status: "active",
        milestones: [],
        history: [],
        aiPlan: [],
      },
    ];
  }

  async evaluateGoals() {
    Logger.info("GOALS", "מעריך יעדים...");

    for (const goal of this.goals) {
      if (goal.status !== "active") continue;

      const evaluation = await this.brain.makeDecision(
        { goal, currentPerformance: this.state.get("performance") },
        ["accelerate", "maintain", "pivot", "pause"],
        { extra: `יעד: ${goal.title}. מצב נוכחי: ${goal.current}/${goal.target} ${goal.unit}` }
      );

      if (evaluation) {
        goal.history.push({
          date: new Date().toISOString(),
          current: goal.current,
          decision: evaluation.decision,
          reasoning: evaluation.reasoning,
        });

        Logger.info("GOALS", `${goal.title}: ${evaluation.decision}`, {
          current: goal.current,
          target: goal.target,
          confidence: evaluation.confidence,
        });
      }
    }

    this.saveGoals();
  }

  updateGoal(goalId, currentValue) {
    const goal = this.goals.find(g => g.id === goalId);
    if (!goal) return;

    const prevValue = goal.current;
    goal.current = currentValue;

    for (const milestone of goal.milestones) {
      if (!milestone.reached && currentValue >= milestone.target) {
        milestone.reached = true;
        milestone.reachedAt = new Date().toISOString();
        Logger.success("GOALS", `Milestone reached: ${goal.title} = ${milestone.target}!`);
      }
    }

    if (goal.category === "efficiency" && goal.unit === "₪") {
      if (currentValue <= goal.target && prevValue > goal.target) {
        goal.status = "completed";
        Logger.success("GOALS", `GOAL COMPLETED: ${goal.title}!`);
        this.state.addMemory("successes", { type: "goal_completed", goal: goal.title, value: currentValue });
      }
    } else {
      if (currentValue >= goal.target && prevValue < goal.target) {
        goal.status = "completed";
        Logger.success("GOALS", `GOAL COMPLETED: ${goal.title}!`);
        this.state.addMemory("successes", { type: "goal_completed", goal: goal.title, value: currentValue });
      }
    }

    this.saveGoals();
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 5: ALERT SYSTEM — התראות ועדכונים
// ══════════════════════════════════════════════════════════════════

class AlertSystem {
  constructor(stateManager) {
    this.state = stateManager;
    this.alerts = [];
  }

  addAlert(level, title, message, data = {}) {
    const alert = {
      id: Date.now().toString(36),
      level, // critical, warning, info, success
      title,
      message,
      data,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    this.alerts.push(alert);

    if (level === "critical") {
      Logger.error("ALERT", `CRITICAL: ${title}: ${message}`);
    } else if (level === "warning") {
      Logger.warn("ALERT", `WARN: ${title}: ${message}`);
    } else if (level === "success") {
      Logger.success("ALERT", `SUCCESS: ${title}: ${message}`);
    } else {
      Logger.info("ALERT", `INFO: ${title}: ${message}`);
    }

    this.state.addMemory("shortTerm", { type: "alert", level, title, message });
    return alert;
  }

  getUnacknowledged() {
    return this.alerts.filter(a => !a.acknowledged);
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 6: MODULE SYSTEM — מודולים נטענים
// ══════════════════════════════════════════════════════════════════

class ModuleManager {
  constructor(stateManager, brain, alerts) {
    this.state = stateManager;
    this.brain = brain;
    this.alerts = alerts;
    this.modules = new Map();
  }

  register(name, module) {
    this.modules.set(name, module);
    this.state.update(`modules.${name}`, {
      registered: new Date().toISOString(),
      status: "active",
      runs: 0,
      lastRun: null,
      errors: 0,
    });
    Logger.info("MODULES", `מודול נרשם: ${name}`);
  }

  async runAll() {
    for (const [name, module] of this.modules) {
      try {
        Logger.info("MODULES", `מריץ: ${name}...`);
        const startTime = Date.now();

        await module.run(this.state, this.brain, this.alerts);

        const duration = Date.now() - startTime;
        const moduleState = this.state.get(`modules.${name}`) || {};
        this.state.update(`modules.${name}`, {
          ...moduleState,
          status: "active",
          runs: (moduleState.runs ?? 0) + 1,
          lastRun: new Date().toISOString(),
          lastDuration: duration,
        });
        Logger.success("MODULES", `${name} הושלם (${duration}ms)`);
      } catch (error) {
        Logger.error("MODULES", `${name} נכשל: ${error.message}`);
        const moduleState = this.state.get(`modules.${name}`) || {};
        this.state.update(`modules.${name}`, {
          ...moduleState,
          status: "error",
          errors: (moduleState.errors ?? 0) + 1,
          lastError: error.message,
        });
        this.alerts.addAlert("warning", `מודול ${name} נכשל`, error.message);
        this.state.addMemory("mistakes", { module: name, error: error.message });
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 7: BUILT-IN MODULES — מודולים מובנים
// ══════════════════════════════════════════════════════════════════

// ── מודול: ניתוח מצב יומי ──
const DailyAnalysisModule = {
  async run(state, brain, alerts) {
    const analysis = await brain.analyze(
      {
        totalDecisions: state.get("totalDecisions"),
        totalImprovements: state.get("totalImprovements"),
        totalCycles: state.get("totalCycles"),
        recentMemories: state.get("memory.shortTerm")?.slice(-20),
        patterns: state.get("memory.patterns")?.slice(-10),
      },
      "מה המצב הכללי? מה עובד? מה לא? מה לשפר? תן ציון 1-10."
    );

    if (analysis) {
      state.addMemory("longTerm", {
        type: "daily_analysis",
        findings: analysis.findings,
        insights: analysis.insights,
      });
      if (analysis.anomalies && analysis.anomalies.length > 0) {
        for (const anomaly of analysis.anomalies) {
          alerts.addAlert("warning", "חריגה זוהתה", anomaly);
        }
      }
    }
  }
};

// ── מודול: שיפור עצמי ──
const SelfImprovementModule = {
  async run(state, brain, alerts) {
    const reflection = await brain.selfReflect();

    if (reflection) {
      if (reflection.newRules && reflection.newRules.length > 0) {
        state.addMemory("longTerm", { type: "new_rules", rules: reflection.newRules });
        alerts.addAlert("info", "כללים חדשים נלמדו", reflection.newRules.join(", "));
      }
      if (reflection.improvementPlan && reflection.improvementPlan.length > 0) {
        state.addMemory("longTerm", { type: "improvement_plan", plan: reflection.improvementPlan });
      }
    }
  }
};

// ── מודול: בדיקת בריאות מערכת ──
const HealthCheckModule = {
  async run(state, brain, alerts) {
    const checks = {
      stateFileSize: fs.existsSync(CONFIG.STATE_FILE) ? fs.statSync(CONFIG.STATE_FILE).size : 0,
      logFileSize: fs.existsSync(CONFIG.LOG_FILE) ? fs.statSync(CONFIG.LOG_FILE).size : 0,
      totalDecisions: state.get("totalDecisions") ?? 0,
      totalCycles: state.get("totalCycles") ?? 0,
      memoryShortTerm: (state.get("memory.shortTerm") || []).length,
      memoryLongTerm: (state.get("memory.longTerm") || []).length,
      memoryPatterns: (state.get("memory.patterns") || []).length,
      memoryMistakes: (state.get("memory.mistakes") || []).length,
      memorySuccesses: (state.get("memory.successes") || []).length,
      uptime: Date.now() - new Date(state.get("startedAt")).getTime(),
    };

    Logger.info("HEALTH", "בדיקת בריאות", checks);

    if (checks.stateFileSize > 10 * 1024 * 1024) {
      alerts.addAlert("warning", "קובץ State גדול", `${(checks.stateFileSize / 1024 / 1024).toFixed(1)}MB`);
    }
    if (checks.totalCycles > 10 && checks.totalDecisions === 0) {
      alerts.addAlert("warning", "אין החלטות", "המערכת רצה אבל לא קיבלה החלטות");
    }
  }
};

// ── מודול: דוח מצב ──
const StatusReportModule = {
  async run(state, brain, alerts) {
    const report = {
      timestamp: new Date().toISOString(),
      cycles: state.get("totalCycles"),
      decisions: state.get("totalDecisions"),
      improvements: state.get("totalImprovements"),
      unacknowledgedAlerts: alerts.getUnacknowledged().length,
      modules: state.get("modules"),
      recentPatterns: (state.get("memory.patterns") || []).slice(-5),
    };

    const aiSummary = await brain.think(`
      תן סיכום קצר (3-5 שורות בעברית) של מצב המערכת:
      ${JSON.stringify(report)}
      מה הולך טוב? מה דורש תשומת לב?
    `);

    Logger.info("STATUS", "═══ דוח מצב ═══");
    Logger.info("STATUS", aiSummary || "לא זמין");
    Logger.info("STATUS", `מחזורים: ${report.cycles} | החלטות: ${report.decisions} | שיפורים: ${report.improvements}`);
    Logger.info("STATUS", "═══════════════");
  }
};

// ══════════════════════════════════════════════════════════════════
// SECTION 8: AUTONOMOUS ENGINE — הלולאה הראשית
// ══════════════════════════════════════════════════════════════════

class NexusEngine {
  constructor(options = {}) {
    this.state = new StateManager();
    this.brain = new AIBrain(this.state);
    this.alerts = new AlertSystem(this.state);
    this.goals = new GoalManager(this.state, this.brain);
    this.modules = new ModuleManager(this.state, this.brain, this.alerts);
    this.isRunning = false;
    this.cycleCount = 0;
    this.options = options;
    this._signalsRegistered = false;
  }

  async init() {
    Logger.info("ENGINE", "══════════════════════════════════════");
    Logger.info("ENGINE", "   NEXUS AUTONOMOUS ENGINE v1.0");
    Logger.info("ENGINE", "   מנוע אוטונומי — מתחיל...");
    Logger.info("ENGINE", `   mode: ${CONFIG.ENABLE_STUB_MODE ? "STUB (no API key)" : "LIVE (Claude API)"}`);
    Logger.info("ENGINE", "══════════════════════════════════════");

    // רשום מודולים מובנים
    this.modules.register("health_check", HealthCheckModule);
    this.modules.register("daily_analysis", DailyAnalysisModule);
    this.modules.register("self_improvement", SelfImprovementModule);
    this.modules.register("status_report", StatusReportModule);

    // החלטה ראשונה — מה לעשות?
    const firstDecision = await this.brain.makeDecision(
      { event: "engine_startup", previousCycles: this.state.get("totalCycles") },
      ["run_full_analysis", "check_goals", "start_normal_cycle", "review_past_mistakes"],
    );

    if (firstDecision) {
      Logger.ai("ENGINE", `החלטה ראשונה: ${firstDecision.decision}`);
    }

    this.state.update("currentPhase", "running");
    this.isRunning = true;
  }

  async runCycle() {
    const cycleStart = Date.now();
    this.cycleCount++;
    this.state.update("totalCycles", (this.state.get("totalCycles") ?? 0) + 1);
    this.state.update("lastCycleAt", new Date().toISOString());

    Logger.info("ENGINE", `═══ מחזור #${this.state.get("totalCycles")} ═══`);

    try {
      await this.modules.modules.get("health_check")?.run(this.state, this.brain, this.alerts);

      if (this.cycleCount % 10 === 0) {
        Logger.info("ENGINE", "מחזור שיפור עצמי (כל 10 מחזורים)");
        await this.modules.modules.get("daily_analysis")?.run(this.state, this.brain, this.alerts);
        await this.modules.modules.get("self_improvement")?.run(this.state, this.brain, this.alerts);
      }

      if (this.cycleCount % 5 === 0) {
        await this.goals.evaluateGoals();
      }

      if (this.cycleCount % 20 === 0) {
        await this.modules.modules.get("status_report")?.run(this.state, this.brain, this.alerts);
      }

      const nextAction = await this.brain.makeDecision(
        {
          event: "cycle_end",
          cycle: this.state.get("totalCycles"),
          recentAlerts: this.alerts.getUnacknowledged().length,
          activeGoals: this.goals.goals.filter(g => g.status === "active").length,
        },
        ["continue_normal", "investigate_alert", "optimize_performance", "expand_capabilities", "rest"],
      );

      if (nextAction?.decision === "investigate_alert") {
        const unacked = this.alerts.getUnacknowledged();
        if (unacked.length > 0) {
          Logger.info("ENGINE", `חוקר ${unacked.length} התראות...`);
          for (const alert of unacked.slice(0, 3)) {
            const investigation = await this.brain.analyze(alert, "מה גרם לזה? מה לעשות? האם זה דחוף?");
            if (investigation) {
              Logger.ai("ENGINE", `חקירה: ${alert.title}`, investigation.recommendations?.[0]);
            }
            alert.acknowledged = true;
          }
        }
      }
    } catch (error) {
      Logger.error("ENGINE", `שגיאה במחזור: ${error.message}`);
      this.state.addMemory("mistakes", { cycle: this.cycleCount, error: error.message });
    }

    const cycleDuration = Date.now() - cycleStart;
    Logger.info("ENGINE", `מחזור #${this.state.get("totalCycles")} הושלם (${cycleDuration}ms)`);
  }

  async start() {
    await this.init();

    Logger.info("ENGINE", `מתחיל לולאה אוטונומית (כל ${CONFIG.CYCLE_INTERVAL_MS / 1000} שניות)...`);
    await this.runCycle();

    this.interval = setInterval(async () => {
      if (this.isRunning) {
        await this.runCycle();
      }
    }, CONFIG.CYCLE_INTERVAL_MS);

    // FIX #6: register signal handlers only once
    if (!this._signalsRegistered) {
      process.on("SIGINT", () => this.shutdown());
      process.on("SIGTERM", () => this.shutdown());
      this._signalsRegistered = true;
    }
  }

  shutdown() {
    Logger.info("ENGINE", "══════════════════════════════════════");
    Logger.info("ENGINE", "   NEXUS ENGINE — מכבה...");
    Logger.info("ENGINE", `   סה״כ מחזורים: ${this.state.get("totalCycles")}`);
    Logger.info("ENGINE", `   סה״כ החלטות: ${this.state.get("totalDecisions")}`);
    Logger.info("ENGINE", `   סה״כ שיפורים: ${this.state.get("totalImprovements")}`);
    Logger.info("ENGINE", "══════════════════════════════════════");

    this.isRunning = false;
    if (this.interval) clearInterval(this.interval);
    this.state.save();
    process.exit(0);
  }
}

// ══════════════════════════════════════════════════════════════════
// SECTION 9: API — ממשק לחיבור מערכות חיצוניות
// ══════════════════════════════════════════════════════════════════

module.exports = {
  NexusEngine,
  AIBrain,
  StateManager,
  GoalManager,
  AlertSystem,
  ModuleManager,
  Logger,
  CONFIG,
  extractJSON,
  sleep,
  // Built-in modules (so custom setups can reuse them)
  DailyAnalysisModule,
  SelfImprovementModule,
  HealthCheckModule,
  StatusReportModule,
};

// ══════════════════════════════════════════════════════════════════
// SECTION 10: RUN — הפעלה
// ══════════════════════════════════════════════════════════════════

if (require.main === module) {
  const engine = new NexusEngine();
  engine.start().catch(err => {
    Logger.error("ENGINE", `Fatal: ${err.message}`);
    process.exit(1);
  });
}
