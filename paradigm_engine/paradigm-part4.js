// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 4/4
// THE ENGINE — הלולאה הראשית שמחברת הכל
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, Brain, Memory, ERPModule, CRMModule, uid, now, today, save, load, shekel, log } = require("./paradigm-part1");
const { BOMModule, HRModule, FinanceModule, OpsModule } = require("./paradigm-part2");
const { PricingModule, QualityModule, NotificationModule, AnalyticsModule, Swarm, Adversarial, Dream, MetaLearner, Goals } = require("./paradigm-part3");
const path = require("path");

// ═══════════════════════════════════════
// PARADIGM ENGINE — המנוע
// ═══════════════════════════════════════

class ParadigmEngine {
  constructor() {
    // Core
    this.brain = new Brain();
    this.memory = new Memory();

    // Business Modules
    this.erp = new ERPModule(this.brain, this.memory);
    this.crm = new CRMModule(this.brain, this.memory);
    this.bom = new BOMModule(this.brain, this.memory);
    this.hr = new HRModule(this.brain, this.memory);
    this.finance = new FinanceModule(this.brain, this.memory);
    this.ops = new OpsModule(this.brain, this.memory);
    this.pricing = new PricingModule(this.brain, this.memory, this.bom);
    this.quality = new QualityModule(this.brain, this.memory);
    this.notifications = new NotificationModule(this.memory);
    this.analytics = new AnalyticsModule(this.brain, this.memory, {
      erp: this.erp, crm: this.crm, hr: this.hr, finance: this.finance,
      ops: this.ops, pricing: this.pricing, quality: this.quality,
      brain: this.brain, notifications: this.notifications,
    });

    // Intelligence Modules
    this.swarm = new Swarm(this.brain);
    this.adversarial = new Adversarial(this.brain);
    this.dream = new Dream(this.brain);
    this.metaLearner = new MetaLearner(this.brain);
    this.goals = new Goals(this.brain);

    // Engine State
    this.cycle = 0;
    this.running = false;
    this.startTime = null;
    this.cycleHistory = [];
    this.healthScore = 100;
  }

  // ═══════════════════════════════════════
  // PHASE 1: PERCEPTION — תפיסה
  // מה קורה? אסוף נתונים מכל המודולים
  // ═══════════════════════════════════════

  async perceive() {
    log("ENGINE", "👁️ שלב 1: תפיסה — סורק את כל המודולים...");
    this.memory.conscious(0, `Cycle ${this.cycle}: Perception started`);

    const analyses = {};
    const modules = [
      { name: "ERP", mod: this.erp, icon: "📦" },
      { name: "CRM", mod: this.crm, icon: "👥" },
      { name: "BOM", mod: this.bom, icon: "📋" },
      { name: "HR", mod: this.hr, icon: "👷" },
      { name: "FINANCE", mod: this.finance, icon: "💰" },
      { name: "OPS", mod: this.ops, icon: "🔧" },
      { name: "PRICING", mod: this.pricing, icon: "💲" },
      { name: "QUALITY", mod: this.quality, icon: "✅" },
    ];

    for (const { name, mod, icon } of modules) {
      try {
        const startMs = Date.now();
        analyses[name] = await mod.analyze();
        const duration = Date.now() - startMs;
        const status = analyses[name]?.status || "unknown";
        const score = analyses[name]?.score || "?";
        const statusIcon = status === "critical" ? "🔴" : status === "warning" ? "🟡" : "🟢";
        log("ENGINE", `  ${statusIcon} ${icon} ${name}: ${status} (${score}/100) [${duration}ms]`,
          status === "critical" ? "ERROR" : status === "warning" ? "WARN" : "SUCCESS");
      } catch (e) {
        log("ENGINE", `  ❌ ${icon} ${name}: FAILED — ${e.message}`, "ERROR");
        analyses[name] = { status: "error", error: e.message };
        this.memory.add("mistakes", { module: name, error: e.message, cycle: this.cycle });
      }
    }

    this.memory.conscious(1, `Perceived ${Object.keys(analyses).length} modules`);
    return analyses;
  }

  // ═══════════════════════════════════════
  // PHASE 2: COMPREHENSION — הבנה
  // מה זה אומר? נחיל סוכנים דן בעדיפויות
  // ═══════════════════════════════════════

  async comprehend(analyses) {
    log("ENGINE", "🧠 שלב 2: הבנה — דיון נחיל...");

    // CRM Lead Scoring (כל 3 מחזורים)
    if (this.cycle % 3 === 0) {
      log("ENGINE", "  🎯 Lead Scoring...");
      await this.crm.scoreAllLeads();
    }

    // דיון נחיל — מה הכי חשוב עכשיו?
    const context = {
      analyses: Object.fromEntries(
        Object.entries(analyses).map(([k, v]) => [k, { status: v?.status, score: v?.score, summary: v?.summary }])
      ),
      goals: this.goals.goals.map(g => ({
        title: g.title, target: g.target, current: g.current,
        unit: g.unit, priority: g.priority, status: g.status,
      })),
      recentDecisions: this.memory.get("decisions", 5).map(d => d.decision || d.type),
      recentMistakes: this.memory.get("mistakes", 3),
      recentSuccesses: this.memory.get("successes", 3),
      cycle: this.cycle,
      notifications: this.notifications.getSummary(),
    };

    const swarmResult = await this.swarm.debate(
      "מה הפעולה הכי חשובה שטכנו כל עוזי + קובי אלקיים נדל\"ן צריכים לעשות עכשיו? תתחשב במצב כל המודולים, היעדים, והמשאבים.",
      context
    );

    if (swarmResult) {
      this.memory.add("decisions", {
        type: "swarm_priority",
        decision: swarmResult.finalDecision,
        consensus: swarmResult.consensusLevel,
        risks: swarmResult.risks,
        nextSteps: swarmResult.nextSteps,
      });
      this.memory.stat("totalDecisions");
      this.memory.stat("totalDebates");
      this.memory.conscious(2, swarmResult.finalDecision);

      if (swarmResult.consensusLevel >= 0.8) {
        this.notifications.notify({
          level: "info", title: "החלטת נחיל",
          message: swarmResult.finalDecision,
          module: "swarm",
        });
      }
    }

    return swarmResult;
  }

  // ═══════════════════════════════════════
  // PHASE 3: VALIDATION — אימות
  // האם ההחלטה נכונה? Red Team תוקף
  // ═══════════════════════════════════════

  async validate(decision) {
    if (this.cycle % CONFIG.ADVERSARIAL_EVERY !== 0 || !decision) return null;

    log("ENGINE", "🔴 שלב 3: אימות — Red Team...");

    const attack = await this.adversarial.attack(decision);

    if (attack) {
      const criticals = (attack.vulnerabilities || []).filter(v => v.severity === "critical");
      const highs = (attack.vulnerabilities || []).filter(v => v.severity === "high");

      if (criticals.length > 0) {
        this.notifications.notify({
          level: "critical",
          title: `🚨 ${criticals.length} פגיעויות קריטיות`,
          message: criticals.map(v => v.description).join("; "),
          module: "adversarial",
          actionRequired: true,
        });
        this.memory.add("alerts", { type: "critical_vulnerability", count: criticals.length, risk: attack.overallRisk });
      }

      if (highs.length > 0) {
        this.notifications.notify({
          level: "warning",
          title: `⚠️ ${highs.length} פגיעויות גבוהות`,
          message: highs.map(v => v.description).join("; "),
          module: "adversarial",
        });
      }

      if (attack.recommendation === "reject") {
        log("ENGINE", `🚫 Red Team דחה את ההחלטה! המלצה: ${attack.improvedDecision}`, "ERROR");
        this.memory.add("insights", {
          type: "decision_rejected_by_red_team",
          originalDecision: decision.finalDecision,
          improvedDecision: attack.improvedDecision,
          risk: attack.overallRisk,
        });
      }

      this.memory.add("insights", { type: "adversarial_analysis", risk: attack.overallRisk, vulnerabilities: (attack.vulnerabilities || []).length });
    }

    return attack;
  }

  // ═══════════════════════════════════════
  // PHASE 4: GOAL TRACKING — מעקב יעדים
  // האם מתקדמים? מה צריך לשנות?
  // ═══════════════════════════════════════

  async trackGoals() {
    if (this.cycle % 5 !== 0) return null;

    log("ENGINE", "🎯 שלב 4: מעקב יעדים...");

    const evaluation = await this.goals.evaluate();

    if (evaluation) {
      for (const ev of evaluation.evaluations || []) {
        if (ev.status === "behind") {
          this.notifications.notify({
            level: "warning",
            title: `יעד בפיגור: ${ev.goalId}`,
            message: `${ev.nextAction} (ביטחון: ${(ev.confidence * 100).toFixed(0)}%)`,
            module: "goals",
            actionRequired: true,
          });
          log("ENGINE", `  ⚠️ ${ev.goalId}: בפיגור — ${ev.nextAction}`, "WARN");
        } else if (ev.status === "achieved") {
          this.notifications.notify({
            level: "success",
            title: `🏆 יעד הושג!`,
            message: ev.goalId,
            module: "goals",
          });
          this.memory.add("successes", { type: "goal_achieved", goalId: ev.goalId });
          log("ENGINE", `  🏆 ${ev.goalId}: הושג!`, "SUCCESS");
        } else if (ev.status === "on_track") {
          log("ENGINE", `  ✅ ${ev.goalId}: בכיוון (${ev.progressPercent}%)`, "SUCCESS");
        } else if (ev.status === "at_risk") {
          log("ENGINE", `  🟡 ${ev.goalId}: בסיכון — ${ev.nextAction}`, "WARN");
        }
      }

      if (evaluation.overallHealth === "critical") {
        this.notifications.notify({
          level: "critical",
          title: "מצב יעדים קריטי",
          message: "מרבית היעדים בפיגור. נדרשת התערבות מיידית.",
          module: "goals",
          actionRequired: true,
        });
      }
    }

    return evaluation;
  }

  // ═══════════════════════════════════════
  // PHASE 5: EVOLUTION — שיפור עצמי
  // מה למדנו? איך משתפרים?
  // ═══════════════════════════════════════

  async evolve() {
    let metaResult = null;
    let dreamResult = null;

    // Meta-Learning (כל 25 מחזורים)
    if (this.cycle % CONFIG.META_LEARN_EVERY === 0) {
      log("ENGINE", "🎓 שלב 5a: מטא-למידה...");
      metaResult = await this.metaLearner.evaluate(
        this.memory.get("decisions", 30),
        this.memory.get("successes", 15)
      );

      if (metaResult) {
        this.memory.add("insights", {
          type: "meta_learning",
          strategy: metaResult.improvedStrategy,
          learningRate: metaResult.learningRate,
          metaInsight: metaResult.metaInsight,
        });
        this.memory.stat("totalImprovements");
        this.memory.conscious(5, metaResult.metaInsight || "Self-improvement cycle completed");
      }
    }

    // Dream Mode (כל 50 מחזורים)
    if (this.cycle % CONFIG.DREAM_EVERY === 0) {
      log("ENGINE", "💤 שלב 5b: מצב חלום...");
      dreamResult = await this.dream.dream(
        this.memory.get("insights", 15)
      );

      if (dreamResult) {
        this.memory.stat("totalDreams");

        if (dreamResult.noveltyScore > 0.7) {
          this.memory.add("insights", {
            type: "dream_breakthrough",
            idea: dreamResult.actionableInsight,
            novelty: dreamResult.noveltyScore,
            feasibility: dreamResult.feasibilityScore,
            potentialRevenue: dreamResult.potentialRevenue,
          });
          this.notifications.notify({
            level: "success",
            title: "💡 רעיון פורץ דרך!",
            message: `${dreamResult.actionableInsight} (חדשנות: ${(dreamResult.noveltyScore * 100).toFixed(0)}%, ישימות: ${(dreamResult.feasibilityScore * 100).toFixed(0)}%)`,
            module: "dream",
          });
        }
      }
    }

    // Stress Test (כל 100 מחזורים)
    if (this.cycle % 100 === 0) {
      log("ENGINE", "🔥 שלב 5c: Stress Test...");
      const stressResult = await this.adversarial.stressTest(
        this.memory.getSummary()
      );
      if (stressResult) {
        log("ENGINE", `  🛡️ Resilience: ${(stressResult.overallResilience * 100).toFixed(0)}% | Weakest: ${stressResult.weakestPoint}`);
        this.memory.add("insights", {
          type: "stress_test",
          resilience: stressResult.overallResilience,
          weakestPoint: stressResult.weakestPoint,
        });
      }
    }

    return { metaResult, dreamResult };
  }

  // ═══════════════════════════════════════
  // PHASE 6: REPORTING — דיווח
  // מה עשינו? מה המצב?
  // ═══════════════════════════════════════

  async report(analyses) {
    if (this.cycle % CONFIG.REPORT_EVERY !== 0) return null;

    log("ENGINE", "📊 שלב 6: דוח מנהלים...");
    const report = await this.analytics.generateExecutiveReport();

    if (report) {
      this.healthScore = report.overallScore || this.healthScore;

      log("ENGINE", "");
      log("ENGINE", `${"═".repeat(65)}`);
      log("ENGINE", `  📊 EXECUTIVE REPORT — Cycle #${this.cycle}`, "SUCCESS");
      log("ENGINE", `${"═".repeat(65)}`);
      log("ENGINE", `  🏢 טכנו כל עוזי + קובי אלקיים נדל"ן`);
      log("ENGINE", `  📅 ${new Date().toLocaleDateString("he-IL")} ${new Date().toLocaleTimeString("he-IL")}`);
      log("ENGINE", `${"─".repeat(65)}`);
      log("ENGINE", `  🎯 ציון כללי: ${report.overallScore}/100`, report.overallScore >= 70 ? "SUCCESS" : report.overallScore >= 40 ? "WARN" : "ERROR");
      log("ENGINE", "");

      // Module scores
      if (report.moduleScores) {
        log("ENGINE", `  📦 ERP:     ${report.moduleScores.erp || "?"}/100`);
        log("ENGINE", `  👥 CRM:     ${report.moduleScores.crm || "?"}/100`);
        log("ENGINE", `  👷 HR:      ${report.moduleScores.hr || "?"}/100`);
        log("ENGINE", `  💰 Finance: ${report.moduleScores.finance || "?"}/100`);
        log("ENGINE", `  🔧 Ops:     ${report.moduleScores.ops || "?"}/100`);
        log("ENGINE", `  💲 Pricing: ${report.moduleScores.pricing || "?"}/100`);
        log("ENGINE", `  ✅ Quality: ${report.moduleScores.quality || "?"}/100`);
      }

      log("ENGINE", "");
      log("ENGINE", `  📝 סיכום: ${report.executiveSummary || "N/A"}`);

      if (report.topPriorities && report.topPriorities.length > 0) {
        log("ENGINE", "");
        log("ENGINE", `  🔥 עדיפויות:`);
        for (const p of report.topPriorities.slice(0, 3)) {
          log("ENGINE", `    ${p.urgency === "critical" ? "🚨" : p.urgency === "high" ? "⚠️" : "ℹ️"} ${p.title} [${p.owner || "?"}]`);
        }
      }

      if (report.wins && report.wins.length > 0) {
        log("ENGINE", "");
        log("ENGINE", `  🏆 הצלחות:`);
        for (const w of report.wins.slice(0, 3)) {
          log("ENGINE", `    ✅ ${typeof w === "string" ? w : w.what || JSON.stringify(w)}`, "SUCCESS");
        }
      }

      if (report.risks && report.risks.length > 0) {
        log("ENGINE", "");
        log("ENGINE", `  ⚠️ סיכונים:`);
        for (const r of report.risks.slice(0, 3)) {
          log("ENGINE", `    🔶 ${r.risk} (${(r.probability * 100).toFixed(0)}%)`, "WARN");
        }
      }

      if (report.aiRecommendations && report.aiRecommendations.length > 0) {
        log("ENGINE", "");
        log("ENGINE", `  🤖 המלצות AI:`);
        for (const rec of report.aiRecommendations.slice(0, 3)) {
          log("ENGINE", `    💡 ${rec.recommendation} [${rec.priority}]`, "AI");
        }
      }

      log("ENGINE", "");
      log("ENGINE", `${"═".repeat(65)}`);

      // Save report
      save(path.join(CONFIG.DIR, "reports", `report-${this.cycle}.json`), { cycle: this.cycle, t: now(), report });
    }

    return report;
  }

  // ═══════════════════════════════════════
  // PHASE 7: HOUSEKEEPING — ניקיון ותחזוקה
  // ═══════════════════════════════════════

  async housekeeping() {
    // Backup (כל 50 מחזורים)
    if (this.cycle % 50 === 0) {
      log("ENGINE", "💾 Backup...");
      const backup = {
        t: now(), cycle: this.cycle,
        memory: this.memory.getSummary(),
        goals: this.goals.goals.map(g => ({ id: g.id, title: g.title, current: g.current, target: g.target, status: g.status })),
        brain: this.brain.getStats(),
        healthScore: this.healthScore,
      };
      save(path.join(CONFIG.DIR, "backups", `backup-${this.cycle}.json`), backup);
    }

    // Cleanup old logs (כל 200 מחזורים)
    if (this.cycle % 200 === 0) {
      log("ENGINE", "🧹 Cleanup...");
      const logsDir = path.join(CONFIG.DIR, "logs");
      try {
        const files = require("fs").readdirSync(logsDir).sort();
        if (files.length > 30) {
          for (const f of files.slice(0, files.length - 30)) {
            require("fs").unlinkSync(path.join(logsDir, f));
          }
          log("ENGINE", `  🗑️ מחק ${files.length - 30} קבצי לוג ישנים`);
        }
      } catch (e) {}
    }

    // Alert investigation
    const criticalAlerts = this.notifications.getCritical();
    if (criticalAlerts.length > 0) {
      log("ENGINE", `🔍 חוקר ${criticalAlerts.length} התראות קריטיות...`);
      for (const alert of criticalAlerts.slice(0, 3)) {
        const investigation = await this.brain.thinkJSON(`
חקור התראה קריטית:
${JSON.stringify(alert)}

זיכרון רלוונטי: ${JSON.stringify(this.memory.search("shortTerm", alert.title || alert.message || "").slice(0, 5))}

תחזיר JSON:
{
  "rootCause": "...",
  "severity": "critical/high/medium/low",
  "immediateAction": "...",
  "longTermFix": "...",
  "preventionPlan": "...",
  "escalate": true/false,
  "escalateTo": "קובי/דימה/קורין"
}`);

        if (investigation) {
          log("ENGINE", `  🔍 ${alert.title}: ${investigation.rootCause} → ${investigation.immediateAction}`, "AI");
          if (investigation.escalate) {
            this.notifications.notify({
              level: "critical",
              title: `Escalation: ${alert.title}`,
              message: `${investigation.rootCause} → ${investigation.immediateAction}`,
              target: investigation.escalateTo,
              module: "investigation",
              actionRequired: true,
            });
          }
        }
        this.notifications.markActioned(alert.id);
      }
    }
  }

  // ═══════════════════════════════════════
  // RUN CYCLE — מחזור מלא
  // ═══════════════════════════════════════

  async runCycle() {
    this.cycle++;
    this.memory.stat("totalCycles");
    const cycleStart = Date.now();

    log("ENGINE", "");
    log("ENGINE", `${"█".repeat(65)}`);
    log("ENGINE", `█  PARADIGM ENGINE — מחזור #${this.cycle}  █`);
    log("ENGINE", `█  ${new Date().toLocaleString("he-IL")}  █`);
    log("ENGINE", `${"█".repeat(65)}`);
    log("ENGINE", "");

    try {
      // Phase 1: Perception
      const analyses = await this.perceive();

      // Phase 2: Comprehension (Swarm Debate)
      const swarmResult = await this.comprehend(analyses);

      // Phase 3: Validation (Adversarial)
      await this.validate(swarmResult);

      // Phase 4: Goal Tracking
      await this.trackGoals();

      // Phase 5: Evolution (Meta-Learning + Dream)
      await this.evolve();

      // Phase 6: Reporting
      await this.report(analyses);

      // Phase 7: Housekeeping
      await this.housekeeping();

    } catch (error) {
      log("ENGINE", `💀 שגיאה קריטית במחזור: ${error.message}`, "ERROR");
      log("ENGINE", error.stack, "ERROR");
      this.memory.add("mistakes", { type: "cycle_error", error: error.message, cycle: this.cycle });
      this.notifications.notify({
        level: "critical",
        title: "שגיאת מחזור",
        message: error.message,
        module: "engine",
        actionRequired: true,
      });
    }

    // Cycle Summary
    const cycleDuration = Date.now() - cycleStart;
    const cycleEntry = {
      cycle: this.cycle,
      duration: cycleDuration,
      brainCalls: this.brain.calls,
      decisions: this.memory.count("decisions"),
      health: this.healthScore,
      t: now(),
    };
    this.cycleHistory.push(cycleEntry);
    this.cycleHistory = this.cycleHistory.slice(-100);

    log("ENGINE", "");
    log("ENGINE", `${"─".repeat(65)}`);
    log("ENGINE", `  ✅ מחזור #${this.cycle} הושלם`, "SUCCESS");
    log("ENGINE", `  ⏱️  משך: ${(cycleDuration / 1000).toFixed(1)} שניות`);
    log("ENGINE", `  🧠 API calls: ${this.brain.calls} | Tokens: ${this.brain.tokens.toLocaleString()} | Errors: ${this.brain.errors}`);
    log("ENGINE", `  📝 החלטות: ${this.memory.data.stats.totalDecisions} | שיפורים: ${this.memory.data.stats.totalImprovements} | חלומות: ${this.memory.data.stats.totalDreams}`);
    log("ENGINE", `  📢 התראות: ${this.notifications.getUnread().length} unread (${this.notifications.getCritical().length} critical)`);
    log("ENGINE", `  🏥 בריאות: ${this.healthScore}/100`);
    log("ENGINE", `  🧠 תודעה: ${this.memory.data.consciousness.awareness.toFixed(1)}%`);
    log("ENGINE", `${"─".repeat(65)}`);
    log("ENGINE", "");
  }

  // ═══════════════════════════════════════
  // START — הפעלה
  // ═══════════════════════════════════════

  async start() {
    this.startTime = Date.now();

    console.log(`\x1b[36m
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   ██████╗  █████╗ ██████╗  █████╗ ██████╗ ██╗ ██████╗ ███╗   ███╗   ║
║   ██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗██║██╔════╝ ████╗ ████║   ║
║   ██████╔╝███████║██████╔╝███████║██║  ██║██║██║  ███╗██╔████╔██║   ║
║   ██╔═══╝ ██╔══██║██╔══██╗██╔══██║██║  ██║██║██║   ██║██║╚██╔╝██║   ║
║   ██║     ██║  ██║██║  ██║██║  ██║██████╔╝██║╚██████╔╝██║ ╚═╝ ██║   ║
║   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝ ╚═╝     ╚═╝   ║
║                                                                       ║
║   TOTAL BUSINESS AUTONOMY ENGINE v4.0                                 ║
║   Beyond Human Cognition — Zero Touch Operations                      ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   ═══ BUSINESS MODULES (8) ═══                                        ║
║   📦 ERP    — Projects, Inventory, POs, Work Orders, Suppliers        ║
║   👥 CRM    — Leads, Pipeline, AI Scoring, Deals, Follow-ups         ║
║   📋 BOM    — 11 Templates, Costing, Optimization, Wastage           ║
║   👷 HR     — Employees, Attendance, Recruitment, Performance         ║
║   💰 FIN    — Cashflow, Invoices, VAT 18%, P&L, Taxes, Budgets       ║
║   🔧 OPS    — Measurements, Installations, Vehicles, Incidents       ║
║   💲 PRICING — Quotes, Dynamic Pricing, Competitor Analysis           ║
║   ✅ QUALITY — Inspections, Defects, Warranties, NPS, Standards       ║
║                                                                       ║
║   ═══ INTELLIGENCE MODULES (6) ═══                                    ║
║   🐝 SWARM        — 7 AI Agents debate every decision                ║
║   🔴 RED TEAM     — Adversarial self-testing (8 attack vectors)      ║
║   💤 DREAM MODE   — Creative synthesis & wild ideas                   ║
║   🎓 META-LEARN   — Learning how to learn better                     ║
║   🎯 GOALS        — 10 business objectives tracked                   ║
║   📊 ANALYTICS    — Snapshots, Executive Reports, Forecasts          ║
║                                                                       ║
║   ═══ SUPPORT MODULES (2) ═══                                         ║
║   📢 NOTIFICATIONS — Multi-level alerts & escalation                  ║
║   👁️ CONSCIOUSNESS — 6-layer awareness system                         ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   ═══ CYCLE PHASES ═══                                                ║
║   Phase 1: 👁️ PERCEIVE    — Scan all 8 modules                       ║
║   Phase 2: 🧠 COMPREHEND  — 7-agent swarm debate                     ║
║   Phase 3: 🔴 VALIDATE    — Red Team attack (every 15 cycles)        ║
║   Phase 4: 🎯 TRACK GOALS — Evaluate 10 objectives (every 5)        ║
║   Phase 5: 🧬 EVOLVE      — Meta-learn (25) + Dream (50)            ║
║   Phase 6: 📊 REPORT      — Executive report (every 10)              ║
║   Phase 7: 🔧 HOUSEKEEP   — Backup, cleanup, investigate             ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   🏢 טכנו כל עוזי בע"מ — 80 שנה | 30 עובדים | ריבל 37 ת"א          ║
║   🏠 קובי אלקיים נדל"ן בע"מ — יוקרה | IL + EN + FR                  ║
║   💰 מע"מ 18% | אגורות (integers) | עברית RTL                        ║
║                                                                       ║
║   👤 קובי (CEO) | דימה (COO) | עוזי (Field) | קורין (HR)            ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
\x1b[0m`);

    this.running = true;
    log("ENGINE", "🚀 PARADIGM ENGINE v4.0 — מתחיל!", "SUCCESS");
    log("ENGINE", `⏱️  מחזור כל ${CONFIG.CYCLE_MS / 1000} שניות`);
    log("ENGINE", `🧠 Model: ${CONFIG.MODEL}`);
    log("ENGINE", "");

    // First cycle immediately
    await this.runCycle();

    // Infinite loop
    this.interval = setInterval(async () => {
      if (this.running) {
        try {
          await this.runCycle();
        } catch (e) {
          log("ENGINE", `💀 Fatal cycle error: ${e.message}`, "ERROR");
        }
      }
    }, CONFIG.CYCLE_MS);

    // Graceful shutdown
    const shutdown = () => {
      log("ENGINE", "");
      log("ENGINE", `${"═".repeat(65)}`);
      log("ENGINE", "  🛑 PARADIGM ENGINE — מכבה...", "WARN");
      log("ENGINE", `${"═".repeat(65)}`);

      this.running = false;
      if (this.interval) clearInterval(this.interval);

      // Save everything
      this.memory.save();
      this.goals.save();

      // Final backup
      const finalBackup = {
        t: now(), type: "shutdown",
        totalCycles: this.cycle,
        totalUptime: Date.now() - this.startTime,
        brainStats: this.brain.getStats(),
        memorySummary: this.memory.getSummary(),
        goals: this.goals.goals,
        healthScore: this.healthScore,
      };
      save(path.join(CONFIG.DIR, "backups", `shutdown-${Date.now()}.json`), finalBackup);

      const uptimeMs = Date.now() - this.startTime;
      const hours = Math.floor(uptimeMs / 3600000);
      const minutes = Math.floor((uptimeMs % 3600000) / 60000);

      log("ENGINE", "");
      log("ENGINE", `  📊 סיכום ריצה:`);
      log("ENGINE", `  ⏱️  Uptime: ${hours}h ${minutes}m`);
      log("ENGINE", `  🔄 מחזורים: ${this.cycle}`);
      log("ENGINE", `  🧠 API Calls: ${this.brain.calls}`);
      log("ENGINE", `  📝 Tokens: ${this.brain.tokens.toLocaleString()}`);
      log("ENGINE", `  ❌ Errors: ${this.brain.errors}`);
      log("ENGINE", `  📊 החלטות: ${this.memory.data.stats.totalDecisions}`);
      log("ENGINE", `  🧬 שיפורים: ${this.memory.data.stats.totalImprovements}`);
      log("ENGINE", `  💤 חלומות: ${this.memory.data.stats.totalDreams}`);
      log("ENGINE", `  🐝 דיונים: ${this.memory.data.stats.totalDebates}`);
      log("ENGINE", `  🏥 בריאות: ${this.healthScore}/100`);
      log("ENGINE", `  🧠 תודעה: ${this.memory.data.consciousness.awareness.toFixed(1)}%`);
      log("ENGINE", "");
      log("ENGINE", `${"═".repeat(65)}`);
      log("ENGINE", "  להתראות. PARADIGM ENGINE v4.0 נכבה.", "WARN");
      log("ENGINE", `${"═".repeat(65)}`);
      log("ENGINE", "");

      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

// ═══════════════════════════════════════
// EXPORT & RUN
// ═══════════════════════════════════════

module.exports = { ParadigmEngine };

if (require.main === module) {
  const engine = new ParadigmEngine();
  engine.start().catch(e => {
    log("FATAL", `💀 ${e.message}`, "ERROR");
    console.error(e.stack);
    process.exit(1);
  });
}
