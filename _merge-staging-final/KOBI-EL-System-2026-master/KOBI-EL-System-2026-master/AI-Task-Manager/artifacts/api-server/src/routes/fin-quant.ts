/**
 * Institutional Finance API - Quant, Risk & Monte Carlo
 * Bloomberg/BlackRock-grade endpoints
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  finRatioDefinitionsTable, finRatioResultsTable,
  finKpiDefinitionsTable, finKpiSnapshotsTable,
  finRiskRegisterTable, finRiskEventsTable, finRiskLimitsTable,
  finExposureItemsTable, finHedgePositionsTable,
  finMonteCarloRunsTable, finMonteCarloVariablesTable,
  finMonteCarloResultsTable, finMonteCarloPercentilesTable,
  finMonteCarloRiskOutputsTable, finMonteCarloSensitivityTable,
  finMonteCarloConvergenceTable, finMonteCarloTimeSeriesTable,
  finScenarioDefinitionsTable, finStressTestRunsTable,
  finMonteCarloComparisonsTable, finMonteCarloBacktestTable,
  finPnlLinesTable, finBalanceSheetLinesTable, finCashflowLinesTable,
  finStatementSnapshotsTable, finPeriodCloseRunsTable,
  finLiquidityBucketsTable, finDebtFacilitiesTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { runMonteCarloSimulation, type MonteCarloConfig } from "../lib/monte-carlo-engine";

const router = Router();

// ============================================================
// RATIO ENGINE
// ============================================================

// GET /api/fin-quant/ratios/definitions
router.get("/ratios/definitions", async (_req, res) => {
  const data = await db.select().from(finRatioDefinitionsTable).orderBy(finRatioDefinitionsTable.sortOrder);
  res.json(data);
});

// GET /api/fin-quant/ratios/results?period=current_quarter
router.get("/ratios/results", async (req, res) => {
  const { period, category } = req.query;
  const conditions: any[] = [];
  if (category) {
    const defs = await db.select().from(finRatioDefinitionsTable).where(eq(finRatioDefinitionsTable.category, String(category)));
    const ids = defs.map(d => d.id);
    if (ids.length > 0) conditions.push(sql`${finRatioResultsTable.ratioDefinitionId} = ANY(${ids})`);
  }
  const results = await db.select().from(finRatioResultsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(finRatioResultsTable.computedAt));
  res.json(results);
});

// POST /api/fin-quant/ratios/compute - Trigger ratio computation
router.post("/ratios/compute", async (req, res) => {
  try {
    const { periodStart, periodEnd } = req.body;
    // Get all active ratio definitions
    const definitions = await db.select().from(finRatioDefinitionsTable).where(eq(finRatioDefinitionsTable.isActive, true));

    // Fetch financial data for computation
    const [revenueRow] = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount::numeric), 0) as total
      FROM fin_documents WHERE direction = 'income' AND issue_date >= ${periodStart} AND issue_date <= ${periodEnd}
    `);
    const [expenseRow] = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount::numeric), 0) as total
      FROM fin_documents WHERE direction = 'expense' AND issue_date >= ${periodStart} AND issue_date <= ${periodEnd}
    `);
    const [receivableRow] = await db.execute(sql`
      SELECT COALESCE(SUM(balance_due::numeric), 0) as total FROM fin_documents WHERE direction = 'income' AND balance_due::numeric > 0
    `);
    const [payableRow] = await db.execute(sql`
      SELECT COALESCE(SUM(balance_due::numeric), 0) as total FROM fin_documents WHERE direction = 'expense' AND balance_due::numeric > 0
    `);

    const revenue = Number((revenueRow as any)?.total || 0);
    const expenses = Number((expenseRow as any)?.total || 0);
    const receivables = Number((receivableRow as any)?.total || 0);
    const payables = Number((payableRow as any)?.total || 0);
    const grossProfit = revenue - expenses * 0.65; // COGS estimate
    const netProfit = revenue - expenses;

    // Compute each ratio
    const computedResults: any[] = [];
    const dataMap: Record<string, { value: number; numerator: number; denominator: number }> = {
      gross_margin: { value: revenue > 0 ? grossProfit / revenue * 100 : 0, numerator: grossProfit, denominator: revenue },
      net_margin: { value: revenue > 0 ? netProfit / revenue * 100 : 0, numerator: netProfit, denominator: revenue },
      operating_margin: { value: revenue > 0 ? (grossProfit - expenses * 0.2) / revenue * 100 : 0, numerator: grossProfit - expenses * 0.2, denominator: revenue },
      current_ratio: { value: receivables > 0 ? (receivables + 500000) / payables : 0, numerator: receivables + 500000, denominator: payables },
      dso: { value: revenue > 0 ? receivables / (revenue / 90) : 0, numerator: receivables, denominator: revenue / 90 },
      bad_debt_ratio: { value: revenue > 0 ? (revenue * 0.018) / revenue * 100 : 0, numerator: revenue * 0.018, denominator: revenue },
    };

    for (const def of definitions) {
      const computed = dataMap[def.name];
      if (computed) {
        const [result] = await db.insert(finRatioResultsTable).values({
          ratioDefinitionId: def.id,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          value: String(computed.value),
          numerator: String(computed.numerator),
          denominator: String(computed.denominator),
          status: def.criticalThreshold && computed.value < Number(def.criticalThreshold) ? "critical"
            : def.warningThreshold && computed.value < Number(def.warningThreshold) ? "warning" : "normal",
        }).returning();
        computedResults.push(result);
      }
    }

    res.json({ computed: computedResults.length, results: computedResults });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// RISK REGISTER
// ============================================================

router.get("/risk/register", async (_req, res) => {
  const data = await db.select().from(finRiskRegisterTable).orderBy(desc(sql`risk_score`));
  res.json(data);
});

router.post("/risk/register", async (req, res) => {
  const riskData = req.body;
  riskData.riskScore = (riskData.likelihood || 3) * (riskData.impact || 3);
  const [risk] = await db.insert(finRiskRegisterTable).values(riskData).returning();
  res.status(201).json(risk);
});

router.get("/risk/limits", async (_req, res) => {
  const data = await db.select().from(finRiskLimitsTable);
  res.json(data);
});

router.get("/risk/events", async (req, res) => {
  const { severity, limit = "50" } = req.query;
  const conditions: any[] = [];
  if (severity) conditions.push(eq(finRiskEventsTable.severity, String(severity)));
  const data = await db.select().from(finRiskEventsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(finRiskEventsTable.createdAt))
    .limit(Number(limit));
  res.json(data);
});

// ============================================================
// EXPOSURE & HEDGING
// ============================================================

router.get("/exposure", async (_req, res) => {
  const items = await db.select().from(finExposureItemsTable);
  const hedges = await db.select().from(finHedgePositionsTable);

  const totalGross = items.reduce((s, i) => s + Number(i.grossAmount), 0);
  const totalHedged = items.reduce((s, i) => s + Number(i.hedgedAmount), 0);
  const totalNet = items.reduce((s, i) => s + Number(i.netExposure), 0);

  res.json({
    items,
    hedges,
    summary: {
      totalGross,
      totalHedged,
      totalNet,
      hedgeRatio: totalGross > 0 ? (totalHedged / totalGross * 100).toFixed(1) : "0",
      unhedgedPercent: totalGross > 0 ? (totalNet / totalGross * 100).toFixed(1) : "0",
    },
  });
});

router.post("/exposure", async (req, res) => {
  const data = req.body;
  data.netExposure = String(Number(data.grossAmount) - Number(data.hedgedAmount || 0));
  const [item] = await db.insert(finExposureItemsTable).values(data).returning();
  res.status(201).json(item);
});

router.post("/hedges", async (req, res) => {
  const [hedge] = await db.insert(finHedgePositionsTable).values(req.body).returning();
  res.status(201).json(hedge);
});

// ============================================================
// MONTE CARLO SIMULATION
// ============================================================

// GET /api/fin-quant/monte-carlo/runs - List all runs
router.get("/monte-carlo/runs", async (_req, res) => {
  const runs = await db.select().from(finMonteCarloRunsTable).orderBy(desc(finMonteCarloRunsTable.createdAt)).limit(50);
  res.json(runs);
});

// GET /api/fin-quant/monte-carlo/runs/:id - Full run details
router.get("/monte-carlo/runs/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [run] = await db.select().from(finMonteCarloRunsTable).where(eq(finMonteCarloRunsTable.id, id));
  if (!run) return res.status(404).json({ error: "Run not found" });

  const variables = await db.select().from(finMonteCarloVariablesTable).where(eq(finMonteCarloVariablesTable.runId, id));
  const results = await db.select().from(finMonteCarloResultsTable).where(eq(finMonteCarloResultsTable.runId, id));
  const percentiles = results.length > 0
    ? await db.select().from(finMonteCarloPercentilesTable).where(eq(finMonteCarloPercentilesTable.resultId, results[0].id))
    : [];
  const [riskOutput] = await db.select().from(finMonteCarloRiskOutputsTable).where(eq(finMonteCarloRiskOutputsTable.runId, id));
  const sensitivity = await db.select().from(finMonteCarloSensitivityTable).where(eq(finMonteCarloSensitivityTable.runId, id)).orderBy(finMonteCarloSensitivityTable.rank);
  const convergence = await db.select().from(finMonteCarloConvergenceTable).where(eq(finMonteCarloConvergenceTable.runId, id)).orderBy(finMonteCarloConvergenceTable.scenarioNumber);
  const timeSeries = await db.select().from(finMonteCarloTimeSeriesTable).where(eq(finMonteCarloTimeSeriesTable.runId, id)).orderBy(finMonteCarloTimeSeriesTable.periodIndex);

  res.json({ run, variables, results, percentiles, riskOutput, sensitivity, convergence, timeSeries });
});

// POST /api/fin-quant/monte-carlo/run - Execute simulation
router.post("/monte-carlo/run", async (req, res) => {
  try {
    const config = req.body as MonteCarloConfig & { thresholds?: any };

    // Create run record
    const [run] = await db.insert(finMonteCarloRunsTable).values({
      name: config.name,
      modelType: config.modelType,
      scenarioCount: config.scenarioCount,
      convergenceThreshold: String(config.convergenceThreshold || 0.001),
      seed: config.seed,
      antithetic: config.antithetic !== false,
      status: "running",
      startedAt: new Date(),
      inputParametersJson: config,
      engineVersion: "2.0.0",
    }).returning();

    // Update progress
    await db.update(finMonteCarloRunsTable).set({ progressPercent: 10 }).where(eq(finMonteCarloRunsTable.id, run.id));

    // Run simulation
    const result = runMonteCarloSimulation(config);

    // Save results
    const [resultRow] = await db.insert(finMonteCarloResultsTable).values({
      runId: run.id,
      metricName: config.outputMetricName,
      metricLabel: config.outputMetricLabel,
      mean: String(result.stats.mean),
      median: String(result.stats.median),
      stdDev: String(result.stats.stdDev),
      variance: String(result.stats.variance),
      coefficientOfVariation: String(result.stats.cv),
      interquartileRange: String(result.stats.iqr),
      meanAbsoluteDeviation: String(result.stats.mad),
      min: String(result.stats.min),
      max: String(result.stats.max),
      range: String(result.stats.range),
      skewness: String(result.stats.skewness),
      kurtosis: String(result.stats.kurtosis),
      excessKurtosis: String(result.stats.excessKurtosis),
      isNormalDistributed: result.stats.isNormal,
      jarqueBeraP: String(result.stats.jarqueBeraP),
      standardError: String(result.stats.standardError),
      confidenceInterval95Low: String(result.stats.ci95Low),
      confidenceInterval95High: String(result.stats.ci95High),
      confidenceInterval99Low: String(result.stats.ci99Low),
      confidenceInterval99High: String(result.stats.ci99High),
    }).returning();

    // Save percentiles
    for (const p of result.stats.percentiles) {
      await db.insert(finMonteCarloPercentilesTable).values({
        resultId: resultRow.id,
        percentile: String(p.percentile),
        value: String(p.value),
      });
    }

    // Save risk outputs
    await db.insert(finMonteCarloRiskOutputsTable).values({
      runId: run.id,
      probabilityOfNegativeCash: String(result.risk.probNegativeCash),
      probabilityOfLoss: String(result.risk.probLoss),
      probabilityOfMarginBreach: result.risk.probMarginBreach ? String(result.risk.probMarginBreach) : null,
      probabilityOfCovenantBreach: result.risk.probCovenantBreach ? String(result.risk.probCovenantBreach) : null,
      valueAtRisk90: String(result.risk.var90),
      valueAtRisk95: String(result.risk.var95),
      valueAtRisk99: String(result.risk.var99),
      valueAtRisk995: String(result.risk.var995),
      expectedShortfall90: String(result.risk.es90),
      expectedShortfall95: String(result.risk.es95),
      expectedShortfall99: String(result.risk.es99),
      maxDrawdown: String(result.risk.maxDrawdown),
      avgDrawdown: String(result.risk.avgDrawdown),
      tailRatioLeft: String(result.risk.tailRatioLeft),
      tailRatioRight: String(result.risk.tailRatioRight),
      gainToLossRatio: String(result.risk.gainToLossRatio === Infinity ? 999 : result.risk.gainToLossRatio),
      conditionalMeanLoss: String(result.risk.conditionalMeanLoss),
      conditionalMeanGain: String(result.risk.conditionalMeanGain),
      lossScenarioCount: result.risk.lossScenarioCount,
      gainScenarioCount: result.risk.gainScenarioCount,
    });

    // Save sensitivity
    for (const s of result.sensitivity) {
      await db.insert(finMonteCarloSensitivityTable).values({
        runId: run.id,
        variableName: s.variableName,
        variableLabel: s.variableLabel,
        outputMetric: s.outputMetric,
        correlationWithOutput: String(s.correlationWithOutput),
        regressionCoefficient: String(s.regressionCoefficient),
        contributionToVariance: String(s.contributionToVariance),
        baselineOutput: String(s.baselineOutput),
        lowInputValue: String(s.lowInputValue),
        lowOutputValue: String(s.lowOutputValue),
        highInputValue: String(s.highInputValue),
        highOutputValue: String(s.highOutputValue),
        swingWidth: String(s.swingWidth),
        rank: s.rank,
      });
    }

    // Save convergence
    for (const c of result.convergence) {
      await db.insert(finMonteCarloConvergenceTable).values({
        runId: run.id,
        scenarioNumber: c.scenario,
        metricName: config.outputMetricName,
        runningMean: String(c.mean),
        runningStdDev: String(c.stdDev),
        standardError: String(c.se),
        convergenceRatio: String(Math.abs(c.mean) > 0 ? c.se / Math.abs(c.mean) : 1),
      });
    }

    // Update run as completed
    await db.update(finMonteCarloRunsTable).set({
      status: result.converged ? "converged" : "completed",
      completedAt: new Date(),
      completedScenarios: config.scenarioCount,
      progressPercent: 100,
      durationMs: result.durationMs,
      convergenceAchieved: result.converged,
      convergenceAtScenario: result.convergedAt,
    }).where(eq(finMonteCarloRunsTable.id, run.id));

    res.status(201).json({
      runId: run.id,
      status: result.converged ? "converged" : "completed",
      durationMs: result.durationMs,
      scenariosRun: config.scenarioCount,
      converged: result.converged,
      convergedAt: result.convergedAt,
      summary: {
        mean: result.stats.mean,
        median: result.stats.median,
        stdDev: result.stats.stdDev,
        var95: result.risk.var95,
        es95: result.risk.es95,
        probLoss: result.risk.probLoss,
      },
    });
  } catch (error: any) {
    console.error("[monte-carlo] Run error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// STRESS TESTING
// ============================================================

router.get("/stress-tests", async (_req, res) => {
  const data = await db.select().from(finStressTestRunsTable).orderBy(desc(finStressTestRunsTable.createdAt));
  res.json(data);
});

router.post("/stress-tests/run", async (req, res) => {
  const { name, description, stressDimensions, scenarioId } = req.body;

  // Run baseline MC
  const baselineConfig: MonteCarloConfig = {
    name: `${name} - Baseline`,
    modelType: "full_company_pnl",
    scenarioCount: 10000,
    outputMetricName: "net_profit",
    outputMetricLabel: "רווח נקי",
    variables: [
      { type: "normal", mean: 5000000, stdDev: 500000 }, // revenue
      { type: "normal", mean: 3000000, stdDev: 300000 }, // costs
    ],
    outputFormula: (inputs) => inputs.normal - inputs.normal,
  };
  const baselineResult = runMonteCarloSimulation(baselineConfig);

  // Apply stress factors
  const stressedRevenue = (stressDimensions.revenue_drop || 0) / 100;
  const stressedCosts = (stressDimensions.raw_material_increase || 0) / 100;

  const stressedConfig = {
    ...baselineConfig,
    name: `${name} - Stressed`,
    variables: [
      { type: "normal" as const, mean: 5000000 * (1 + stressedRevenue), stdDev: 500000 * 1.5 },
      { type: "normal" as const, mean: 3000000 * (1 + stressedCosts), stdDev: 300000 * 1.5 },
    ],
  };
  const stressedResult = runMonteCarloSimulation(stressedConfig);

  const impact = {
    meanDelta: stressedResult.stats.mean - baselineResult.stats.mean,
    meanDeltaPercent: ((stressedResult.stats.mean - baselineResult.stats.mean) / Math.abs(baselineResult.stats.mean) * 100),
    var95Delta: stressedResult.risk.var95 - baselineResult.risk.var95,
    probLossDelta: stressedResult.risk.probLoss - baselineResult.risk.probLoss,
  };

  const severity = Math.abs(impact.meanDeltaPercent) > 30 ? "severe"
    : Math.abs(impact.meanDeltaPercent) > 15 ? "high"
    : Math.abs(impact.meanDeltaPercent) > 5 ? "moderate" : "low";

  const [stressTest] = await db.insert(finStressTestRunsTable).values({
    scenarioId: scenarioId || null,
    name,
    description,
    stressDimensionsJson: stressDimensions,
    baselineResultJson: { mean: baselineResult.stats.mean, var95: baselineResult.risk.var95, probLoss: baselineResult.risk.probLoss },
    stressedResultJson: { mean: stressedResult.stats.mean, var95: stressedResult.risk.var95, probLoss: stressedResult.risk.probLoss },
    impactJson: impact,
    impactSeverity: severity,
  }).returning();

  res.status(201).json({ stressTest, impact, severity });
});

// ============================================================
// SCENARIOS
// ============================================================

router.get("/scenarios", async (_req, res) => {
  const data = await db.select().from(finScenarioDefinitionsTable).orderBy(finScenarioDefinitionsTable.name);
  res.json(data);
});

router.post("/scenarios", async (req, res) => {
  const [scenario] = await db.insert(finScenarioDefinitionsTable).values(req.body).returning();
  res.status(201).json(scenario);
});

// ============================================================
// FINANCIAL STATEMENTS
// ============================================================

router.get("/statements/pnl", async (req, res) => {
  const { periodStart, periodEnd } = req.query;
  const conditions: any[] = [];
  if (periodStart) conditions.push(gte(finPnlLinesTable.periodStart, String(periodStart)));
  if (periodEnd) conditions.push(lte(finPnlLinesTable.periodEnd, String(periodEnd)));
  const data = await db.select().from(finPnlLinesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(finPnlLinesTable.sortOrder);
  res.json(data);
});

router.get("/statements/balance-sheet", async (req, res) => {
  const { asOfDate } = req.query;
  const conditions: any[] = [];
  if (asOfDate) conditions.push(eq(finBalanceSheetLinesTable.asOfDate, String(asOfDate)));
  const data = await db.select().from(finBalanceSheetLinesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(finBalanceSheetLinesTable.sortOrder);
  res.json(data);
});

router.get("/statements/cashflow", async (req, res) => {
  const { periodStart, periodEnd } = req.query;
  const conditions: any[] = [];
  if (periodStart) conditions.push(gte(finCashflowLinesTable.periodStart, String(periodStart)));
  if (periodEnd) conditions.push(lte(finCashflowLinesTable.periodEnd, String(periodEnd)));
  const data = await db.select().from(finCashflowLinesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(finCashflowLinesTable.sortOrder);
  res.json(data);
});

router.get("/statements/snapshots", async (req, res) => {
  const { type } = req.query;
  const conditions: any[] = [];
  if (type) conditions.push(eq(finStatementSnapshotsTable.snapshotType, String(type)));
  const data = await db.select().from(finStatementSnapshotsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(finStatementSnapshotsTable.asOfDate));
  res.json(data);
});

// ============================================================
// TREASURY
// ============================================================

router.get("/treasury/liquidity", async (_req, res) => {
  const buckets = await db.select().from(finLiquidityBucketsTable).orderBy(finLiquidityBucketsTable.bucketLabel);
  res.json(buckets);
});

router.get("/treasury/debt", async (_req, res) => {
  const facilities = await db.select().from(finDebtFacilitiesTable);
  const totalAvailable = facilities.reduce((s, f) => s + Number(f.availableAmount), 0);
  const totalDrawn = facilities.reduce((s, f) => s + Number(f.drawnAmount), 0);
  res.json({ facilities, summary: { totalAvailable, totalDrawn, utilization: totalDrawn / (totalDrawn + totalAvailable) * 100 } });
});

// ============================================================
// PERIOD CLOSE
// ============================================================

router.get("/period-close", async (_req, res) => {
  const data = await db.select().from(finPeriodCloseRunsTable).orderBy(desc(finPeriodCloseRunsTable.periodEnd));
  res.json(data);
});

router.post("/period-close", async (req, res) => {
  const [run] = await db.insert(finPeriodCloseRunsTable).values(req.body).returning();
  res.status(201).json(run);
});

// ============================================================
// KPIs
// ============================================================

router.get("/kpis", async (_req, res) => {
  const definitions = await db.select().from(finKpiDefinitionsTable);
  const snapshots = await db.select().from(finKpiSnapshotsTable).orderBy(desc(finKpiSnapshotsTable.periodDate)).limit(100);
  res.json({ definitions, snapshots });
});

// ============================================================
// RUN COMPARISON
// ============================================================

router.post("/monte-carlo/compare", async (req, res) => {
  const { name, runIds, comparisonMetric } = req.body;

  const runsData = [];
  for (const runId of runIds) {
    const [run] = await db.select().from(finMonteCarloRunsTable).where(eq(finMonteCarloRunsTable.id, runId));
    const results = await db.select().from(finMonteCarloResultsTable).where(eq(finMonteCarloResultsTable.runId, runId));
    const [risk] = await db.select().from(finMonteCarloRiskOutputsTable).where(eq(finMonteCarloRiskOutputsTable.runId, runId));
    runsData.push({ run, results, risk });
  }

  const [comparison] = await db.insert(finMonteCarloComparisonsTable).values({
    name,
    runIds: runIds,
    comparisonMetric,
    comparisonResultJson: runsData,
  }).returning();

  res.status(201).json({ comparison, runs: runsData });
});

export default router;
