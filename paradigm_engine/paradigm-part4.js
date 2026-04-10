// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 4/4
// PARADIGM ENGINE — The Main Orchestrator
// ════════════════════════════════════════════════════════════════════════════════
//
// Wires Parts 1-3 together and runs the perceive → analyze → debate →
// stress-test → dream → meta-learn → report cognitive loop. Registers
// signal handlers, persists every module, and exposes a getStatus() API.

const { CONFIG, Brain, Memory, ERPModule, CRMModule, MASTER_SYSTEM_PROMPT, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const { BOMModule, HRModule, FinanceModule, OpsModule } = require("./paradigm-part2");
const {
  PricingModule, QualityModule, NotificationModule, AnalyticsModule,
  Swarm, Adversarial, Dream, MetaLearner, Goals,
} = require("./paradigm-part3");
const path = require("path");

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

    // Business modules (Parts 1-3)
    this.erp           = new ERPModule(this.brain, this.memory);
    this.crm           = new CRMModule(this.brain, this.memory);
    this.bom           = new BOMModule(this.brain, this.memory);
    this.hr            = new HRModule(this.brain, this.memory);
    this.finance       = new FinanceModule(this.brain, this.memory);
    this.ops           = new OpsModule(this.brain, this.memory);
    this.pricing       = new PricingModule(this.brain, this.memory, this.bom);
    this.quality       = new QualityModule(this.brain, this.memory);
    this.notifications = new NotificationModule(this.memory);

    // Analytics sees everything (including brain + notifications for snapshot serialization)
    this.analytics = new AnalyticsModule(this.brain, this.memory, {
      erp: this.erp,
      crm: this.crm,
      bom: this.bom,
      hr: this.hr,
      finance: this.finance,
      ops: this.ops,
      pricing: this.pricing,
      quality: this.quality,
      notifications: this.notifications,
      brain: this.brain,
    });

    // Cognitive layer
    this.swarm       = new Swarm(this.brain);
    this.adversarial = new Adversarial(this.brain);
    this.dream       = new Dream(this.brain);
    this.metaLearner = new MetaLearner(this.brain);
    this.goals       = new Goals(this.brain);

    this._signalsRegistered = false;
  }

  // ── Convenience helpers ──
  getAllBusinessModules() {
    return {
      erp: this.erp, crm: this.crm, bom: this.bom, hr: this.hr,
      finance: this.finance, ops: this.ops, pricing: this.pricing,
      quality: this.quality, notifications: this.notifications,
      analytics: this.analytics,
    };
  }

  saveAllModules() {
    const modules = [
      this.erp, this.crm, this.bom, this.hr, this.finance, this.ops,
      this.pricing, this.quality, this.notifications, this.analytics,
      this.metaLearner, this.goals, this.memory,
    ];
    for (const m of modules) {
      try { if (typeof m.save === "function") m.save(); } catch (e) {
        log("ENGINE", `save() failed for ${m.constructor?.name || "module"}: ${e.message}`, "WARN");
      }
    }
  }

  // ── The main cycle ──
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
        leads: snapshot.crm?.leads,
        cash: snapshot.finance?.cashflow?.balance,
      })}`);

      // Stage 2 — ANALYZE (rotating per cycle)
      const analyzers = [
        { name: "ERP",     fn: () => this.erp.analyze() },
        { name: "CRM",     fn: () => this.crm.analyze() },
        { name: "BOM",     fn: () => this.bom.analyze() },
        { name: "HR",      fn: () => this.hr.analyze() },
        { name: "Finance", fn: () => this.finance.analyze() },
        { name: "Ops",     fn: () => this.ops.analyze() },
        { name: "Pricing", fn: () => this.pricing.analyze() },
        { name: "Quality", fn: () => this.quality.analyze() },
      ];
      const analyzer = analyzers[this.cycle % analyzers.length];
      log("ENGINE", `🔬 מנתח ${analyzer.name}...`);
      const analysis = await analyzer.fn();
      if (analysis) {
        this.memory.add("longTerm", { type: `analysis_${analyzer.name.toLowerCase()}`, analysis, cycle: this.cycle });
        this.memory.conscious(2, `${analyzer.name}: status=${analysis.status}, score=${analysis.score}`);
      }

      // Stage 3 — SCORE LEADS (every 3 cycles, if CRM exposes scoreAllLeads)
      if (this.cycle % 3 === 0 && typeof this.crm.scoreAllLeads === "function") {
        try { await this.crm.scoreAllLeads(); } catch (e) { /* non-fatal */ }
      }

      // Stage 4 — PREDICT marker (every 5 cycles)
      if (this.cycle % 5 === 0) {
        this.memory.conscious(3, `predicting from ${this.memory.count("patterns")} patterns`);
      }

      // Stage 5 — DECIDE via SWARM (only if critical)
      if (analysis && (analysis.status === "critical" || (analysis.score !== undefined && analysis.score < 50))) {
        log("ENGINE", `⚠️ מצב קריטי — מפעיל Swarm`, "WARN");
        const topic = `${analyzer.name} במצב ${analysis.status} (ציון ${analysis.score}): ${analysis.summary || "—"}`;
        const debate = await this.swarm.debate(topic, { module: analyzer.name, analysis });

        if (debate?.finalDecision) {
          const attackResult = await this.adversarial.attack(debate);
          const approved = attackResult?.recommendation !== "reject";

          if (approved) {
            this.memory.conscious(4, `decision accepted: ${debate.finalDecision}`);
            this.memory.add("decisions", {
              type: "swarm_approved",
              topic,
              decision: debate.finalDecision,
              consensus: debate.consensusLevel,
              riskScore: attackResult?.overallRisk || 0,
              t: now(),
            });
            this.notifications.notify({
              level: "info",
              title: "החלטת Swarm התקבלה",
              message: debate.finalDecision,
              module: analyzer.name,
              target: "קובי",
            });
          } else {
            log("ENGINE", `❌ Red Team דחה — לא מבצעים`, "ERROR");
            this.notifications.notify({
              level: "warning",
              title: "Swarm דחוי ע\"י Red Team",
              message: `נדחה: ${attackResult?.improvedDecision || "ניתוח מחדש נדרש"}`,
              module: analyzer.name,
            });
          }
        }
      }

      // Stage 6 — ADVERSARIAL SELF-TEST (every ADVERSARIAL_EVERY cycles)
      if (this.cycle % CONFIG.ADVERSARIAL_EVERY === 0) {
        const lastDecision = this.memory.get("decisions", 1)[0];
        if (lastDecision) {
          await this.adversarial.attack(lastDecision);
        }
      }

      // Stage 7 — STRESS TEST (every 3 * ADVERSARIAL_EVERY cycles)
      if (this.cycle % (CONFIG.ADVERSARIAL_EVERY * 3) === 0) {
        try { await this.adversarial.stressTest(snapshot); } catch { /* non-fatal */ }
      }

      // Stage 8 — DREAM
      if (this.cycle % CONFIG.DREAM_EVERY === 0) {
        const recentMemories = {
          successes: this.memory.get("successes", 5),
          mistakes: this.memory.get("mistakes", 5),
          insights: this.memory.get("insights", 5),
          patterns: this.memory.get("patterns", 5),
        };
        const dreamResult = await this.dream.dream(recentMemories);
        if (dreamResult?.actionableInsight) {
          this.memory.add("insights", { type: "dream", insight: dreamResult.actionableInsight, novelty: dreamResult.noveltyScore });
          this.memory.stat("totalDreams");
        }
      }

      // Stage 9 — META-LEARN
      if (this.cycle % CONFIG.META_LEARN_EVERY === 0) {
        const decisions = this.memory.get("decisions", 10);
        const outcomes = {
          successes: this.memory.get("successes", 10),
          mistakes: this.memory.get("mistakes", 10),
        };
        await this.metaLearner.evaluate(decisions, outcomes);
      }

      // Stage 10 — GOALS EVALUATION + UPDATE (every 5 cycles)
      if (this.cycle % 5 === 0) {
        // light updates from snapshot — a real deployment would map more metrics
        if (snapshot.crm?.leads) this.goals.update("g1", snapshot.crm.leads);
        if (snapshot.finance?.cashflow?.balance) this.goals.update("g7", snapshot.finance.cashflow.balance);
        if (snapshot.hr?.headcount?.total) this.goals.update("g8", snapshot.hr.headcount.total);
        if (snapshot.quality?.nps !== null) this.goals.update("g6", snapshot.quality.nps || 0);
      }

      // Stage 11 — EXECUTIVE REPORT
      if (this.cycle % CONFIG.REPORT_EVERY === 0) {
        const report = await this.analytics.generateExecutiveReport();
        if (report) {
          this.memory.add("longTerm", { type: "executive_report", report, cycle: this.cycle });
          if (report.overallScore !== undefined && report.overallScore < 60) {
            this.notifications.notify({
              level: "warning",
              title: "דוח מנהלים — ציון כללי נמוך",
              message: `ציון: ${report.overallScore}/100 — ${report.executiveSummary}`,
              module: "analytics",
              target: "קובי",
              actionRequired: true,
            });
          }
        }
      }

      // Finalize
      this.memory.stat("totalCycles");
      this.memory.conscious(5, `cycle ${this.cycle} done in ${Date.now() - startTime}ms`);

      log("ENGINE", `╚═══ CYCLE ${this.cycle} DONE (${Date.now() - startTime}ms) ═══╝`, "SUCCESS");
    } catch (e) {
      log("ENGINE", `❌ שגיאה ב-cycle ${this.cycle}: ${e.message}`, "ERROR");
      this.memory.add("mistakes", { type: "cycle_error", cycle: this.cycle, error: e.message });
    }
  }

  // ── Banner + startup ──
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
║   10 Business Modules · 7-Agent Swarm · Red Team · Dream · Meta · 10 Goals   ║
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
    log("ENGINE", `📊 Business modules: ERP, CRM, BOM, HR, Finance, Ops, Pricing, Quality, Notifications, Analytics`);
    log("ENGINE", `🎭 Cognitive layer: Swarm(7), Adversarial, Dream, MetaLearner, Goals(${this.goals.goals.length})`);

    if (!this._signalsRegistered) {
      this._signalsRegistered = true;
      const shutdown = (sig) => {
        log("ENGINE", `📴 ${sig} — עוצר בצורה בטוחה...`, "WARN");
        this.running = false;
        this.saveAllModules();
        process.exit(0);
      };
      process.on("SIGINT",  () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    }

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
      goals: this.goals.goals.map(g => ({
        id: g.id, title: g.title, status: g.status,
        current: g.current, target: g.target, unit: g.unit,
      })),
      modules: {
        erp_projects: this.erp.data.projects.length,
        crm_leads: this.crm.data.leads.length,
        bom_templates: this.bom.data.templates.length,
        bom_active: this.bom.data.activeBOMs.length,
        hr_employees: this.hr.data.employees.length,
        finance_invoices: this.finance.data.invoices.length,
        ops_measurements: this.ops.data.measurements.length,
        pricing_quotes: this.pricing.data.quotes.length,
        quality_inspections: this.quality.data.inspections.length,
        notifications_unread: this.notifications.getUnread().length,
      },
      debates: this.swarm.debateHistory.length,
      dreams: this.dream.dreams.length,
      adversarialAttacks: this.adversarial.attacks.length,
    };
  }
}

// ═══════════════════════════════════════
// EXPORT PART 4
// ═══════════════════════════════════════

module.exports = {
  ParadigmEngine,
};
