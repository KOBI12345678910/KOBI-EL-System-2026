import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean, date } from "drizzle-orm/pg-core";

// ============================================================
// SCENARIO DEFINITIONS - Templates for stress tests & what-if
// ============================================================
export const finScenarioDefinitionsTable = pgTable("fin_scenario_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  scenarioType: text("scenario_type").notNull(), // stress_test | what_if | monte_carlo_config | reverse_stress | historical_replay
  category: text("category").notNull().default("general"), // market | credit | operational | liquidity | combined
  parametersJson: jsonb("parameters_json").notNull(),
  severity: text("severity").notNull().default("moderate"), // mild | moderate | severe | extreme
  isRegulatory: boolean("is_regulatory").notNull().default(false), // required by regulator
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull().default("system"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// MONTE CARLO RUNS - Master record per simulation execution
// ============================================================
export const finMonteCarloRunsTable = pgTable("fin_monte_carlo_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  modelType: text("model_type").notNull(), // cashflow_forecast | project_profitability | customer_payment_delay | supplier_cost_inflation | revenue_variability | margin_variability | working_capital | liquidity_runway | portfolio_of_projects | full_company_pnl
  scenarioCount: integer("scenario_count").notNull().default(50000),
  completedScenarios: integer("completed_scenarios").notNull().default(0),
  convergenceThreshold: numeric("convergence_threshold", { precision: 10, scale: 6 }).default("0.001"),
  convergenceAchieved: boolean("convergence_achieved").notNull().default(false),
  convergenceAtScenario: integer("convergence_at_scenario"),
  seed: integer("seed"), // for reproducibility
  timeHorizonMonths: integer("time_horizon_months").notNull().default(12),
  periodGranularity: text("period_granularity").notNull().default("monthly"), // daily | weekly | monthly | quarterly
  correlationMethod: text("correlation_method").notNull().default("cholesky"), // none | cholesky | copula | empirical
  antithetic: boolean("antithetic").notNull().default(true), // variance reduction
  importanceSampling: boolean("importance_sampling").notNull().default(false), // tail focus
  status: text("status").notNull().default("pending"), // pending | queued | running | converged | completed | failed | cancelled
  progressPercent: integer("progress_percent").notNull().default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  engineVersion: text("engine_version").notNull().default("2.0.0"),
  inputParametersJson: jsonb("input_parameters_json").notNull(),
  modelConfigJson: jsonb("model_config_json"), // model-specific configuration
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// MONTE CARLO VARIABLES - Input variables with distributions
// ============================================================
export const finMonteCarloVariablesTable = pgTable("fin_monte_carlo_variables", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  variableName: text("variable_name").notNull(),
  variableLabel: text("variable_label").notNull(),
  category: text("category").notNull().default("input"), // input | derived | constraint
  distributionType: text("distribution_type").notNull(), // normal | lognormal | triangular | uniform | beta | gamma | weibull | poisson | binomial | custom_empirical | jump_diffusion | mean_reverting
  // Distribution parameters (use applicable ones based on type)
  paramMean: numeric("param_mean", { precision: 20, scale: 6 }),
  paramStdDev: numeric("param_std_dev", { precision: 20, scale: 6 }),
  paramMin: numeric("param_min", { precision: 20, scale: 6 }),
  paramMax: numeric("param_max", { precision: 20, scale: 6 }),
  paramMode: numeric("param_mode", { precision: 20, scale: 6 }), // for triangular
  paramAlpha: numeric("param_alpha", { precision: 10, scale: 4 }),
  paramBeta: numeric("param_beta", { precision: 10, scale: 4 }),
  paramLambda: numeric("param_lambda", { precision: 10, scale: 4 }), // for poisson / jump
  paramDrift: numeric("param_drift", { precision: 10, scale: 6 }), // for GBM / mean-reverting
  paramVolatility: numeric("param_volatility", { precision: 10, scale: 6 }), // for GBM
  paramMeanReversion: numeric("param_mean_reversion", { precision: 10, scale: 6 }), // for OU process
  paramJumpIntensity: numeric("param_jump_intensity", { precision: 10, scale: 6 }),
  paramJumpMean: numeric("param_jump_mean", { precision: 10, scale: 6 }),
  paramJumpVol: numeric("param_jump_vol", { precision: 10, scale: 6 }),
  // Bounds & constraints
  lowerBound: numeric("lower_bound", { precision: 20, scale: 6 }),
  upperBound: numeric("upper_bound", { precision: 20, scale: 6 }),
  isPercentage: boolean("is_percentage").notNull().default(false),
  baseValue: numeric("base_value", { precision: 20, scale: 2 }), // starting point
  // Empirical / historical data
  customDataJson: jsonb("custom_data_json"),
  historicalSource: text("historical_source"), // e.g. "revenue_last_24m"
  sortOrder: integer("sort_order").notNull().default(0),
});

// ============================================================
// CORRELATION MATRIX - Relationships between variables
// ============================================================
export const finMonteCarloCorrelationsTable = pgTable("fin_monte_carlo_correlations", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  variableA: text("variable_a").notNull(),
  variableB: text("variable_b").notNull(),
  correlation: numeric("correlation", { precision: 10, scale: 6 }).notNull(), // -1 to +1
  correlationType: text("correlation_type").notNull().default("pearson"), // pearson | spearman | kendall
  source: text("source").notNull().default("estimated"), // estimated | historical | expert | regulatory
});

// ============================================================
// MONTE CARLO RESULTS - Aggregated output metrics per run
// ============================================================
export const finMonteCarloResultsTable = pgTable("fin_monte_carlo_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  metricName: text("metric_name").notNull(),
  metricLabel: text("metric_label").notNull(),
  metricUnit: text("metric_unit").notNull().default("ILS"),
  // Central tendency
  mean: numeric("mean", { precision: 20, scale: 2 }).notNull(),
  median: numeric("median", { precision: 20, scale: 2 }).notNull(),
  mode: numeric("mode", { precision: 20, scale: 2 }),
  geometricMean: numeric("geometric_mean", { precision: 20, scale: 2 }),
  // Dispersion
  stdDev: numeric("std_dev", { precision: 20, scale: 2 }).notNull(),
  variance: numeric("variance", { precision: 20, scale: 4 }),
  coefficientOfVariation: numeric("coefficient_of_variation", { precision: 10, scale: 4 }),
  interquartileRange: numeric("iqr", { precision: 20, scale: 2 }),
  meanAbsoluteDeviation: numeric("mad", { precision: 20, scale: 2 }),
  // Range
  min: numeric("min", { precision: 20, scale: 2 }).notNull(),
  max: numeric("max", { precision: 20, scale: 2 }).notNull(),
  range: numeric("range", { precision: 20, scale: 2 }),
  // Shape
  skewness: numeric("skewness", { precision: 10, scale: 6 }),
  kurtosis: numeric("kurtosis", { precision: 10, scale: 6 }),
  excessKurtosis: numeric("excess_kurtosis", { precision: 10, scale: 6 }),
  isNormalDistributed: boolean("is_normal_distributed"), // Jarque-Bera test result
  jarqueBeraP: numeric("jarque_bera_p", { precision: 10, scale: 6 }),
  // Convergence
  standardError: numeric("standard_error", { precision: 20, scale: 6 }),
  confidenceInterval95Low: numeric("ci_95_low", { precision: 20, scale: 2 }),
  confidenceInterval95High: numeric("ci_95_high", { precision: 20, scale: 2 }),
  confidenceInterval99Low: numeric("ci_99_low", { precision: 20, scale: 2 }),
  confidenceInterval99High: numeric("ci_99_high", { precision: 20, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// MONTE CARLO PERCENTILES - Full distribution curve
// ============================================================
export const finMonteCarloPercentilesTable = pgTable("fin_monte_carlo_percentiles", {
  id: serial("id").primaryKey(),
  resultId: integer("result_id").notNull().references(() => finMonteCarloResultsTable.id, { onDelete: "cascade" }),
  percentile: numeric("percentile", { precision: 5, scale: 2 }).notNull(), // 0.5, 1, 2.5, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 97.5, 99, 99.5
  value: numeric("value", { precision: 20, scale: 2 }).notNull(),
});

// ============================================================
// MONTE CARLO RISK OUTPUTS - Tail risk & probability metrics
// ============================================================
export const finMonteCarloRiskOutputsTable = pgTable("fin_monte_carlo_risk_outputs", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  // Probability metrics
  probabilityOfNegativeCash: numeric("prob_negative_cash", { precision: 10, scale: 6 }),
  probabilityOfLoss: numeric("prob_loss", { precision: 10, scale: 6 }),
  probabilityOfMarginBreach: numeric("prob_margin_breach", { precision: 10, scale: 6 }),
  probabilityOfCovenantBreach: numeric("prob_covenant_breach", { precision: 10, scale: 6 }),
  probabilityOfDefault: numeric("prob_default", { precision: 10, scale: 6 }),
  probabilityOfTargetMiss: numeric("prob_target_miss", { precision: 10, scale: 6 }),
  // Value at Risk (parametric + historical)
  valueAtRisk90: numeric("var_90", { precision: 20, scale: 2 }),
  valueAtRisk95: numeric("var_95", { precision: 20, scale: 2 }),
  valueAtRisk99: numeric("var_99", { precision: 20, scale: 2 }),
  valueAtRisk995: numeric("var_995", { precision: 20, scale: 2 }),
  // Expected Shortfall (CVaR)
  expectedShortfall90: numeric("es_90", { precision: 20, scale: 2 }),
  expectedShortfall95: numeric("es_95", { precision: 20, scale: 2 }),
  expectedShortfall99: numeric("es_99", { precision: 20, scale: 2 }),
  // Drawdown metrics
  maxDrawdown: numeric("max_drawdown", { precision: 20, scale: 2 }),
  avgDrawdown: numeric("avg_drawdown", { precision: 20, scale: 2 }),
  drawdownDuration: integer("drawdown_duration_periods"),
  recoveryPeriods: integer("recovery_periods"),
  // Tail risk
  tailRatioLeft: numeric("tail_ratio_left", { precision: 10, scale: 4 }), // P5/P50
  tailRatioRight: numeric("tail_ratio_right", { precision: 10, scale: 4 }), // P95/P50
  gainToLossRatio: numeric("gain_to_loss_ratio", { precision: 10, scale: 4 }),
  // Stress-adjusted
  conditionalMeanLoss: numeric("conditional_mean_loss", { precision: 20, scale: 2 }), // mean of loss scenarios only
  conditionalMeanGain: numeric("conditional_mean_gain", { precision: 20, scale: 2 }), // mean of gain scenarios only
  lossScenarioCount: integer("loss_scenario_count"),
  gainScenarioCount: integer("gain_scenario_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// MONTE CARLO SENSITIVITY - Tornado chart data
// ============================================================
export const finMonteCarloSensitivityTable = pgTable("fin_monte_carlo_sensitivity", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  variableName: text("variable_name").notNull(),
  variableLabel: text("variable_label").notNull(),
  outputMetric: text("output_metric").notNull(), // which result metric this affects
  // Impact measurement
  correlationWithOutput: numeric("correlation_with_output", { precision: 10, scale: 6 }),
  regressionCoefficient: numeric("regression_coefficient", { precision: 20, scale: 6 }),
  contributionToVariance: numeric("contribution_to_variance", { precision: 10, scale: 6 }), // % of total variance explained
  // Tornado values (impact of +/- 1σ on output)
  baselineOutput: numeric("baseline_output", { precision: 20, scale: 2 }),
  lowInputValue: numeric("low_input_value", { precision: 20, scale: 6 }),
  lowOutputValue: numeric("low_output_value", { precision: 20, scale: 2 }),
  highInputValue: numeric("high_input_value", { precision: 20, scale: 6 }),
  highOutputValue: numeric("high_output_value", { precision: 20, scale: 2 }),
  swingWidth: numeric("swing_width", { precision: 20, scale: 2 }), // high - low output
  rank: integer("rank").notNull(), // 1 = most impactful
});

// ============================================================
// MONTE CARLO CONVERGENCE - Tracking stability during run
// ============================================================
export const finMonteCarloConvergenceTable = pgTable("fin_monte_carlo_convergence", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  scenarioNumber: integer("scenario_number").notNull(),
  metricName: text("metric_name").notNull(),
  runningMean: numeric("running_mean", { precision: 20, scale: 2 }).notNull(),
  runningStdDev: numeric("running_std_dev", { precision: 20, scale: 2 }),
  runningVar95: numeric("running_var_95", { precision: 20, scale: 2 }),
  standardError: numeric("standard_error", { precision: 20, scale: 6 }),
  convergenceRatio: numeric("convergence_ratio", { precision: 10, scale: 6 }), // stdError / mean
});

// ============================================================
// MONTE CARLO TIME SERIES - Multi-period path outputs
// ============================================================
export const finMonteCarloTimeSeriesTable = pgTable("fin_monte_carlo_time_series", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  metricName: text("metric_name").notNull(),
  periodIndex: integer("period_index").notNull(), // 0, 1, 2, ... (month 0, month 1, etc.)
  periodLabel: text("period_label").notNull(), // "2026-04", "2026-05", etc.
  // Band statistics across all scenarios for this period
  mean: numeric("mean", { precision: 20, scale: 2 }).notNull(),
  p5: numeric("p5", { precision: 20, scale: 2 }),
  p25: numeric("p25", { precision: 20, scale: 2 }),
  p50: numeric("p50", { precision: 20, scale: 2 }),
  p75: numeric("p75", { precision: 20, scale: 2 }),
  p95: numeric("p95", { precision: 20, scale: 2 }),
  stdDev: numeric("std_dev", { precision: 20, scale: 2 }),
});

// ============================================================
// MONTE CARLO BACKTESTING - Compare predictions vs actuals
// ============================================================
export const finMonteCarloBacktestTable = pgTable("fin_monte_carlo_backtest", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id),
  metricName: text("metric_name").notNull(),
  periodLabel: text("period_label").notNull(),
  predictedMean: numeric("predicted_mean", { precision: 20, scale: 2 }),
  predictedP5: numeric("predicted_p5", { precision: 20, scale: 2 }),
  predictedP95: numeric("predicted_p95", { precision: 20, scale: 2 }),
  actualValue: numeric("actual_value", { precision: 20, scale: 2 }),
  withinBand: boolean("within_band"), // actual between p5 and p95?
  errorPercent: numeric("error_percent", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// STRESS TEST RUNS - Deterministic scenario analysis
// ============================================================
export const finStressTestRunsTable = pgTable("fin_stress_test_runs", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").references(() => finScenarioDefinitionsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  stressType: text("stress_type").notNull().default("forward"), // forward | reverse | historical | combined
  stressDimensionsJson: jsonb("stress_dimensions_json").notNull(),
  baselineResultJson: jsonb("baseline_result_json"),
  stressedResultJson: jsonb("stressed_result_json"),
  impactJson: jsonb("impact_json"),
  impactSeverity: text("impact_severity"), // negligible | low | moderate | high | severe
  breachedLimitsJson: jsonb("breached_limits_json"), // which covenants/limits would break
  recoveryPathJson: jsonb("recovery_path_json"), // estimated recovery timeline
  status: text("status").notNull().default("completed"),
  createdBy: text("created_by").notNull().default("system"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// RUN COMPARISON - Side-by-side analysis of multiple runs
// ============================================================
export const finMonteCarloComparisonsTable = pgTable("fin_monte_carlo_comparisons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  runIds: jsonb("run_ids").notNull(), // [1, 5, 12]
  comparisonMetric: text("comparison_metric").notNull(),
  comparisonResultJson: jsonb("comparison_result_json"),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
