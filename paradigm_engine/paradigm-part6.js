// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 6
// SUPPLY CHAIN AI + TEMPORAL INTELLIGENCE + DOCUMENT AI + DASHBOARD SERVER
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");
const http = require("http");

// ═══════════════════════════════════════
// SUPPLY CHAIN AI — אופטימיזציה של שרשרת אספקה
// ═══════════════════════════════════════

class SupplyChainAI {
  constructor(brain, memory, erp) {
    this.brain = brain;
    this.memory = memory;
    this.erp = erp;
    this.file = path.join(CONFIG.DIR, "supplychain", "state.json");
    this.data = load(this.file, {
      supplierScores: {},
      reorderPoints: {},
      jitOrders: [],
      alternatives: {},
      priceHistory: [],
      leadTimeHistory: [],
      qualityHistory: [],
      stockOptimization: {
        target: { minDays: 7, maxDays: 21, optimalDays: 14 },
        carryingCostPercent: 0.18, // 18% per year
        stockoutCostMultiplier: 3.5,
      },
      forecasts: [],
    });
  }
  save() { save(this.file, this.data); }

  scoreSupplier(supplierId) {
    const supplier = this.erp?.data?.suppliers?.find(s => s.id === supplierId);
    if (!supplier) return null;

    const onTimeRate = supplier.performance?.onTime > 0 || supplier.performance?.late > 0
      ? supplier.performance.onTime / (supplier.performance.onTime + supplier.performance.late)
      : 1;

    const defectRate = supplier.performance?.defective > 0 && supplier.performance?.onTime > 0
      ? supplier.performance.defective / (supplier.performance.onTime + supplier.performance.late)
      : 0;

    // ציון רב-מימדי
    const score = {
      supplierId,
      name: supplier.name,
      onTimeScore: Math.round(onTimeRate * 100),
      qualityScore: Math.round((1 - defectRate) * 100),
      ratingScore: ((supplier.rating || 3) / 5) * 100,
      leadTimeScore: supplier.leadTimeDays <= 7 ? 100 : Math.max(0, 100 - (supplier.leadTimeDays - 7) * 5),
      priceScore: 75, // baseline; would compare to market
      reliabilityScore: 0,
      overall: 0,
      tier: "C",
      computedAt: now(),
    };

    score.reliabilityScore = Math.round((score.onTimeScore + score.qualityScore) / 2);
    score.overall = Math.round(
      (score.onTimeScore * 0.30) +
      (score.qualityScore * 0.30) +
      (score.leadTimeScore * 0.20) +
      (score.priceScore * 0.10) +
      (score.ratingScore * 0.10)
    );

    if (score.overall >= 90) score.tier = "A";
    else if (score.overall >= 75) score.tier = "B";
    else if (score.overall >= 60) score.tier = "C";
    else score.tier = "D";

    this.data.supplierScores[supplierId] = score;
    this.save();
    return score;
  }

  computeReorderPoint(itemId) {
    const item = this.erp?.data?.inventory?.find(i => i.id === itemId);
    if (!item) return null;

    // EOQ-like simplified: reorder when reaches average daily usage × leadTime + safety stock
    const dailyUsage = item.history?.length > 1
      ? Math.abs(item.history.filter(h => h.action === "stock_out").reduce((s, h) => s + (h.qty || 0), 0)) / 30
      : 1;

    const supplier = item.supplier
      ? this.erp.data.suppliers.find(s => s.name === item.supplier || s.id === item.supplier)
      : null;
    const leadTimeDays = supplier?.leadTimeDays || 14;
    const safetyStock = Math.ceil(dailyUsage * 7); // 1 week safety
    const reorderPoint = Math.ceil(dailyUsage * leadTimeDays + safetyStock);
    const economicQty = Math.ceil(dailyUsage * 30); // ~1 month worth

    const result = {
      itemId, itemName: item.name,
      dailyUsage: Math.round(dailyUsage * 100) / 100,
      leadTimeDays, safetyStock,
      reorderPoint, economicOrderQty: economicQty,
      currentStock: item.qty,
      shouldReorderNow: item.qty <= reorderPoint,
      computedAt: now(),
    };

    this.data.reorderPoints[itemId] = result;
    this.save();
    return result;
  }

  proposeJITOrder(itemId, urgency = "normal") {
    const reorder = this.computeReorderPoint(itemId);
    if (!reorder || !reorder.shouldReorderNow) return null;

    const item = this.erp.data.inventory.find(i => i.id === itemId);
    const supplier = item.supplier
      ? this.erp.data.suppliers.find(s => s.name === item.supplier || s.id === item.supplier)
      : null;

    const order = {
      id: `JIT-${uid()}`,
      itemId, itemName: item.name,
      qty: reorder.economicOrderQty,
      currentStock: item.qty,
      reorderPoint: reorder.reorderPoint,
      supplier: supplier?.name || "default",
      supplierId: supplier?.id || null,
      estimatedCost: reorder.economicOrderQty * (item.avgCost || item.costPerUnit || 0),
      urgency, // urgent, normal, low
      reasoning: `מלאי נוכחי ${item.qty}, נקודת הזמנה ${reorder.reorderPoint}, שימוש יומי ${reorder.dailyUsage}`,
      status: "proposed",
      createdAt: now(),
    };

    this.data.jitOrders.push(order);
    this.save();
    log("SUPPLY", `📦 JIT הצעה: ${item.name} × ${order.qty} מ-${order.supplier} (₪${shekel(order.estimatedCost)})`);
    return order;
  }

  registerAlternativeSupplier(category, alternatives) {
    if (!this.data.alternatives[category]) this.data.alternatives[category] = [];
    for (const alt of alternatives) {
      this.data.alternatives[category].push({
        ...alt,
        addedAt: now(),
      });
    }
    this.save();
    return this.data.alternatives[category];
  }

  detectStockouts() {
    if (!this.erp?.data?.inventory) return [];
    return this.erp.data.inventory
      .filter(item => item.qty <= 0)
      .map(item => ({
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        lastQty: item.qty,
        impact: "production_halted",
        alternatives: this.data.alternatives[item.category] || [],
      }));
  }

  async analyze() {
    const stockouts = this.detectStockouts();
    const lowStock = this.erp?.getLowStockItems?.() || [];
    const allScores = Object.values(this.data.supplierScores);
    const avgSupplierScore = allScores.length > 0
      ? Math.round(allScores.reduce((s, x) => s + x.overall, 0) / allScores.length)
      : 0;

    return await this.brain.thinkJSON(`
נתח שרשרת אספקה של טכנו כל עוזי:

═══ מצב ═══
פריטים שאזלו: ${stockouts.length}
מלאי נמוך: ${lowStock.length}
ציון ספקים ממוצע: ${avgSupplierScore}/100
הזמנות JIT הצעה: ${this.data.jitOrders.filter(o => o.status === "proposed").length}

═══ פריטים בסכנה ═══
${JSON.stringify(stockouts.map(s => ({ name: s.itemName, alternatives: s.alternatives.length })))}
${JSON.stringify(lowStock.slice(0, 10).map(i => ({ name: i.name, qty: i.qty, min: i.minQty })))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "criticalActions": [{"action": "...", "item": "...", "deadline": "...", "cost": 0}],
  "supplierRisks": [{"supplier": "...", "risk": "...", "mitigation": "..."}],
  "diversificationGaps": [{"category": "...", "reason": "...", "alternatives": ["..."]}],
  "stockOptimization": {"overstock": ["..."], "understock": ["..."], "rebalance": "..."}
}`);
  }
}

// ═══════════════════════════════════════
// TEMPORAL INTELLIGENCE — חיזוי וזיהוי תבניות
// ═══════════════════════════════════════

class TemporalIntelligence {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "temporal", "state.json");
    this.data = load(this.file, {
      timeSeries: {}, // metric → array of {t, value}
      patterns: [],
      seasonalTrends: {
        weekly: {},     // dayOfWeek → typical value
        monthly: {},    // month → typical value
        hourly: {},     // hour → typical value
      },
      anomalies: [],
      forecasts: [],
      events: [],
    });
  }
  save() { save(this.file, this.data); }

  recordMetric(metric, value, t = null) {
    if (!this.data.timeSeries[metric]) this.data.timeSeries[metric] = [];
    const record = { t: t || now(), value };
    this.data.timeSeries[metric].push(record);
    this.data.timeSeries[metric] = this.data.timeSeries[metric].slice(-1000); // keep last 1000

    // Update seasonal trends
    const date = new Date(record.t);
    const dayOfWeek = date.getDay();
    const hour = date.getHours();
    const month = date.getMonth();

    if (!this.data.seasonalTrends.weekly[metric]) this.data.seasonalTrends.weekly[metric] = {};
    if (!this.data.seasonalTrends.hourly[metric]) this.data.seasonalTrends.hourly[metric] = {};
    if (!this.data.seasonalTrends.monthly[metric]) this.data.seasonalTrends.monthly[metric] = {};

    const wAvg = this.data.seasonalTrends.weekly[metric][dayOfWeek] || { sum: 0, count: 0 };
    wAvg.sum += value; wAvg.count++;
    this.data.seasonalTrends.weekly[metric][dayOfWeek] = wAvg;

    const hAvg = this.data.seasonalTrends.hourly[metric][hour] || { sum: 0, count: 0 };
    hAvg.sum += value; hAvg.count++;
    this.data.seasonalTrends.hourly[metric][hour] = hAvg;

    const mAvg = this.data.seasonalTrends.monthly[metric][month] || { sum: 0, count: 0 };
    mAvg.sum += value; mAvg.count++;
    this.data.seasonalTrends.monthly[metric][month] = mAvg;

    // Anomaly detection — z-score
    this.detectAnomaly(metric, value);

    this.save();
    return record;
  }

  detectAnomaly(metric, value) {
    const series = this.data.timeSeries[metric];
    if (!series || series.length < 10) return null;

    const recent = series.slice(-30);
    const mean = recent.reduce((s, r) => s + r.value, 0) / recent.length;
    const variance = recent.reduce((s, r) => s + Math.pow(r.value - mean, 2), 0) / recent.length;
    const stdDev = Math.sqrt(variance);
    const zScore = stdDev > 0 ? (value - mean) / stdDev : 0;

    if (Math.abs(zScore) > 2.5) {
      const anomaly = {
        id: uid(),
        metric, value, mean, stdDev, zScore: Number(zScore.toFixed(2)),
        direction: value > mean ? "spike" : "drop",
        severity: Math.abs(zScore) > 3.5 ? "critical" : "high",
        t: now(),
      };
      this.data.anomalies.push(anomaly);
      this.data.anomalies = this.data.anomalies.slice(-200);
      this.memory.add("alerts", { type: "anomaly", ...anomaly });
      log("TEMPORAL", `🚨 חריגה ב-${metric}: ${anomaly.direction} z=${anomaly.zScore} (value=${value}, mean=${mean.toFixed(1)})`, "WARN");
      return anomaly;
    }

    return null;
  }

  forecast(metric, periods = 7) {
    const series = this.data.timeSeries[metric];
    if (!series || series.length < 14) return null;

    // Simple moving average + trend
    const recent = series.slice(-30);
    const mean = recent.reduce((s, r) => s + r.value, 0) / recent.length;

    // Linear trend
    const n = recent.length;
    const xs = recent.map((_, i) => i);
    const ys = recent.map(r => r.value);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumXX = xs.reduce((s, x) => s + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const predictions = [];
    for (let i = 1; i <= periods; i++) {
      const value = intercept + slope * (n + i - 1);
      predictions.push({ period: i, forecast: Math.round(value * 100) / 100 });
    }

    const forecast = {
      metric, mean, slope: Number(slope.toFixed(4)),
      direction: slope > 0.05 ? "rising" : slope < -0.05 ? "falling" : "stable",
      predictions,
      confidence: recent.length >= 30 ? 0.75 : 0.5,
      generatedAt: now(),
    };

    this.data.forecasts.push(forecast);
    this.data.forecasts = this.data.forecasts.slice(-50);
    this.save();
    return forecast;
  }

  recordEvent(type, description, metadata = {}) {
    const event = {
      id: uid(),
      type, description,
      metadata,
      t: now(),
      day: today(),
      dayOfWeek: new Date().getDay(),
      hour: new Date().getHours(),
    };
    this.data.events.push(event);
    this.data.events = this.data.events.slice(-500);
    this.save();
    return event;
  }

  getSeasonalAverage(metric, type = "weekly", key = null) {
    const trends = this.data.seasonalTrends[type]?.[metric];
    if (!trends) return null;
    if (key !== null && trends[key]) {
      return trends[key].count > 0 ? trends[key].sum / trends[key].count : null;
    }
    const result = {};
    for (const [k, v] of Object.entries(trends)) {
      result[k] = v.count > 0 ? Math.round((v.sum / v.count) * 100) / 100 : null;
    }
    return result;
  }

  async analyze() {
    const metrics = Object.keys(this.data.timeSeries);
    const recentAnomalies = this.data.anomalies.slice(-10);

    return await this.brain.thinkJSON(`
נתח אינטליגנציה זמנית:
מטריקות מנוטרות: ${metrics.length} (${metrics.join(", ")})
חריגות אחרונות: ${recentAnomalies.length}
תחזיות: ${this.data.forecasts.length}

חריגות: ${JSON.stringify(recentAnomalies.map(a => ({ metric: a.metric, direction: a.direction, severity: a.severity, z: a.zScore })))}

תחזיר JSON:
{
  "status": "healthy/warning/critical",
  "score": 0-100,
  "patternsDiscovered": [{"pattern": "...", "metric": "...", "confidence": 0.0-1.0}],
  "trendAlerts": [{"metric": "...", "trend": "...", "implication": "..."}],
  "seasonalInsights": ["תובנה 1"],
  "predictions": [{"what": "...", "when": "...", "probability": 0.0-1.0}],
  "recommendations": ["..."]
}`);
  }
}

// ═══════════════════════════════════════
// DOCUMENT AI — פירוק חוזים, חשבוניות, מדידות
// ═══════════════════════════════════════

class DocumentAI {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "documents", "ai-state.json");
    this.data = load(this.file, {
      processed: [],
      templates: {
        invoice: { fields: ["number", "date", "vendor", "amount", "vat", "items"], confidence: 0 },
        contract: { fields: ["parties", "dates", "obligations", "payment", "termination"], confidence: 0 },
        measurement: { fields: ["customer", "address", "sections", "totalLength", "totalArea"], confidence: 0 },
        purchase_order: { fields: ["number", "supplier", "items", "total", "delivery_date"], confidence: 0 },
        receipt: { fields: ["date", "vendor", "amount", "items"], confidence: 0 },
      },
      stats: { total: 0, byType: {}, errors: 0 },
    });
  }
  save() { save(this.file, this.data); }

  async parseDocument(text, hint = null) {
    const docType = hint || await this.detectType(text);
    const template = this.data.templates[docType];

    if (!template) {
      log("DOC-AI", `❌ סוג מסמך לא ידוע: ${docType}`, "ERROR");
      this.data.stats.errors++;
      this.save();
      return null;
    }

    const parsed = await this.brain.thinkJSON(`
אתה Document AI. פרק את המסמך למבנה JSON.

═══ סוג מסמך ═══
${docType}

═══ שדות לחילוץ ═══
${template.fields.join(", ")}

═══ טקסט המסמך ═══
${text.substring(0, 4000)}

תחזיר JSON עם המבנה:
{
  "type": "${docType}",
  "fields": {
    ${template.fields.map(f => `"${f}": "..."`).join(",\n    ")}
  },
  "confidence": 0.0-1.0,
  "warnings": ["..."],
  "extractedAt": "${now()}"
}`);

    if (parsed) {
      const record = {
        id: `DOC-${uid()}`,
        type: docType,
        ...parsed,
        sourceLength: text.length,
        createdAt: now(),
      };
      this.data.processed.push(record);
      this.data.processed = this.data.processed.slice(-500);
      this.data.stats.total++;
      this.data.stats.byType[docType] = (this.data.stats.byType[docType] || 0) + 1;
      this.save();
      log("DOC-AI", `📄 נפרק ${docType}: confidence ${parsed.confidence || "?"}`);
      return record;
    }

    this.data.stats.errors++;
    this.save();
    return null;
  }

  async detectType(text) {
    const sample = text.substring(0, 500).toLowerCase();
    if (sample.includes("חשבונית") || sample.includes("invoice")) return "invoice";
    if (sample.includes("חוזה") || sample.includes("הסכם") || sample.includes("contract")) return "contract";
    if (sample.includes("מדיד") || sample.includes("measurement")) return "measurement";
    if (sample.includes("הזמנת רכש") || sample.includes("purchase order")) return "purchase_order";
    if (sample.includes("קבלה") || sample.includes("receipt")) return "receipt";
    return "unknown";
  }

  getStats() { return this.data.stats; }
}

// ═══════════════════════════════════════
// DASHBOARD SERVER — HTTP Live Dashboard
// ═══════════════════════════════════════

class DashboardServer {
  constructor(engine, port = 7400) {
    this.engine = engine;
    this.port = port;
    this.server = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.port, () => {
      this.running = true;
      log("DASHBOARD", `🌐 Dashboard live at http://localhost:${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.running = false;
    }
  }

  handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    try {
      switch (url.pathname) {
        case "/":
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(this.renderDashboardHTML());
          return;
        case "/api/snapshot":
          res.end(JSON.stringify(this.buildSnapshot()));
          return;
        case "/api/cycle":
          res.end(JSON.stringify({ cycle: this.engine.cycle, running: this.engine.running, healthScore: this.engine.healthScore }));
          return;
        case "/api/goals":
          res.end(JSON.stringify(this.engine.goals.goals));
          return;
        case "/api/projects":
          res.end(JSON.stringify(this.engine.erp.data.projects.slice(-50)));
          return;
        case "/api/leads":
          res.end(JSON.stringify(this.engine.crm.data.leads.slice(-50)));
          return;
        case "/api/notifications":
          res.end(JSON.stringify(this.engine.notifications.getUnread().slice(-30)));
          return;
        case "/api/memory":
          res.end(JSON.stringify(this.engine.memory.getSummary()));
          return;
        case "/api/financial":
          res.end(JSON.stringify({
            cashflow: this.engine.finance.data.cashflow,
            pnl: this.engine.finance.getMonthlyPnL(),
            ytd: this.engine.finance.getYTDSummary(),
            overdueCount: this.engine.finance.getOverdueInvoices().length,
          }));
          return;
        case "/api/brain":
          res.end(JSON.stringify(this.engine.brain.getStats()));
          return;
        case "/api/all":
          res.end(JSON.stringify(this.buildSnapshot()));
          return;
        default:
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "not_found", path: url.pathname }));
      }
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  buildSnapshot() {
    const e = this.engine;
    return {
      timestamp: now(),
      engine: { cycle: e.cycle, running: e.running, healthScore: e.healthScore, startTime: e.startTime, uptime: e.startTime ? Date.now() - e.startTime : 0 },
      brain: e.brain.getStats(),
      memory: e.memory.getSummary(),
      modules: {
        erp: { projects: e.erp.data.projects.length, activeProjects: e.erp.data.projects.filter(p => !["completed", "cancelled", "lost"].includes(p.status)).length, inventory: e.erp.data.inventory.length, lowStock: e.erp.getLowStockItems().length },
        crm: { leads: e.crm.data.leads.length, pipeline: e.crm.getPipelineSummary(), pipelineValue: e.crm.getPipelineValue() },
        bom: { templates: e.bom.data.templates.length, active: e.bom.data.activeBOMs.length },
        hr: { headcount: e.hr.getHeadcount(), salaryCost: e.hr.getTotalSalaryCost() },
        finance: { cashflow: e.finance.data.cashflow, overdue: e.finance.getOverdueInvoices().length, vatBalance: e.finance.data.taxes.vatBalance },
        ops: { pendingMeasurements: e.ops.getPendingMeasurements().length, pendingInstallations: e.ops.getPendingInstallations().length, openIncidents: e.ops.getOpenIncidents().length },
        pricing: { quotes: e.pricing.data.quotes.length, conversionRate: e.pricing.getConversionRate() },
        quality: { nps: e.quality.getNPS(), defectRate: e.quality.getDefectRate() },
      },
      goals: e.goals.goals.map(g => ({ id: g.id, title: g.title, current: g.current, target: g.target, status: g.status, progress: g.target > 0 ? Math.round((g.current / g.target) * 100) : 0 })),
      notifications: e.notifications.getSummary(),
      debates: e.swarm.debateHistory.length,
      dreams: e.dream.dreams.length,
    };
  }

  renderDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>PARADIGM v4.0 — Dashboard</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0e1a; color: #e8eaf0; padding: 20px; }
h1 { font-size: 28px; margin-bottom: 8px; background: linear-gradient(135deg, #00d4ff, #5b8def); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.subtitle { color: #8892b0; margin-bottom: 24px; font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.card { background: #131830; border: 1px solid #1f2540; border-radius: 12px; padding: 20px; }
.card h2 { font-size: 14px; color: #8892b0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.metric { font-size: 32px; font-weight: 700; color: #00d4ff; }
.metric-label { font-size: 12px; color: #8892b0; margin-top: 4px; }
.row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1f2540; font-size: 13px; }
.row:last-child { border-bottom: none; }
.row span:first-child { color: #8892b0; }
.row span:last-child { color: #e8eaf0; font-weight: 600; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge-green { background: #1a3a1f; color: #4ade80; }
.badge-yellow { background: #3a2e1a; color: #fbbf24; }
.badge-red { background: #3a1a1a; color: #f87171; }
.health { font-size: 48px; font-weight: 800; }
.health-100 { color: #4ade80; }
.health-70 { color: #fbbf24; }
.health-low { color: #f87171; }
.refresh { color: #5b8def; font-size: 12px; cursor: pointer; }
footer { text-align: center; margin-top: 32px; color: #4a5172; font-size: 12px; }
</style>
</head>
<body>
<h1>🧠 PARADIGM ENGINE v4.0</h1>
<div class="subtitle">טכנו כל עוזי בע"מ + קובי אלקיים נדל"ן בע"מ — Live Dashboard</div>
<div class="grid" id="grid">
  <div class="card"><h2>Health Score</h2><div class="health health-100" id="health">--</div></div>
  <div class="card"><h2>Cycle</h2><div class="metric" id="cycle">--</div><div class="metric-label">total cycles</div></div>
  <div class="card"><h2>Brain API Calls</h2><div class="metric" id="apiCalls">--</div><div class="metric-label" id="tokens">-- tokens</div></div>
  <div class="card"><h2>Active Projects</h2><div class="metric" id="projects">--</div><div class="metric-label" id="lowStock">-- low stock</div></div>
  <div class="card"><h2>CRM Leads</h2><div class="metric" id="leads">--</div><div class="metric-label" id="pipelineValue">-- pipeline</div></div>
  <div class="card"><h2>Cashflow Balance</h2><div class="metric" id="cash">--</div><div class="metric-label" id="overdue">-- overdue invoices</div></div>
  <div class="card"><h2>Quality NPS</h2><div class="metric" id="nps">--</div><div class="metric-label" id="defects">-- defect rate</div></div>
  <div class="card"><h2>Notifications</h2><div class="metric" id="notifications">--</div><div class="metric-label" id="critical">-- critical</div></div>
  <div class="card"><h2>Cognitive Layer</h2>
    <div class="row"><span>Debates</span><span id="debates">--</span></div>
    <div class="row"><span>Dreams</span><span id="dreams">--</span></div>
    <div class="row"><span>Awareness</span><span id="awareness">--</span></div>
  </div>
  <div class="card" id="goalsCard"><h2>Goals (10)</h2><div id="goals"></div></div>
</div>
<footer>Auto-refresh every 5s · <span class="refresh" onclick="load()">Refresh now</span></footer>
<script>
function fmtAgorot(a) { return '\u20AA' + (a/100).toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }
function fmtPercent(n) { return (n*100).toFixed(1) + '%'; }
async function load() {
  try {
    const r = await fetch('/api/snapshot');
    const d = await r.json();
    document.getElementById('health').textContent = d.engine.healthScore + '/100';
    document.getElementById('health').className = 'health ' + (d.engine.healthScore >= 70 ? 'health-100' : d.engine.healthScore >= 40 ? 'health-70' : 'health-low');
    document.getElementById('cycle').textContent = d.engine.cycle;
    document.getElementById('apiCalls').textContent = d.brain.calls;
    document.getElementById('tokens').textContent = d.brain.tokens.toLocaleString() + ' tokens · ' + d.brain.errors + ' errors';
    document.getElementById('projects').textContent = d.modules.erp.activeProjects;
    document.getElementById('lowStock').textContent = d.modules.erp.lowStock + ' items low stock';
    document.getElementById('leads').textContent = d.modules.crm.leads;
    document.getElementById('pipelineValue').textContent = fmtAgorot(d.modules.crm.pipelineValue || 0) + ' pipeline';
    document.getElementById('cash').textContent = fmtAgorot(d.modules.finance.cashflow.balance || 0);
    document.getElementById('overdue').textContent = d.modules.finance.overdue + ' overdue';
    document.getElementById('nps').textContent = d.modules.quality.nps !== null ? d.modules.quality.nps : '?';
    document.getElementById('defects').textContent = d.modules.quality.defectRate + '% defect rate';
    document.getElementById('notifications').textContent = d.notifications.total;
    document.getElementById('critical').textContent = d.notifications.critical + ' critical';
    document.getElementById('debates').textContent = d.debates;
    document.getElementById('dreams').textContent = d.dreams;
    document.getElementById('awareness').textContent = d.memory.awareness + '%';
    const goalsHtml = d.goals.map(g => {
      const cls = g.status === 'achieved' ? 'badge-green' : g.progress >= 70 ? 'badge-yellow' : 'badge-red';
      return '<div class="row"><span>' + g.title + '</span><span class="badge ' + cls + '">' + g.progress + '%</span></div>';
    }).join('');
    document.getElementById('goals').innerHTML = goalsHtml;
  } catch(e) { console.error(e); }
}
load();
setInterval(load, 5000);
</script>
</body>
</html>`;
  }
}

// ═══════════════════════════════════════
// EXPORT PART 6
// ═══════════════════════════════════════

module.exports = {
  SupplyChainAI,
  TemporalIntelligence,
  DocumentAI,
  DashboardServer,
};
