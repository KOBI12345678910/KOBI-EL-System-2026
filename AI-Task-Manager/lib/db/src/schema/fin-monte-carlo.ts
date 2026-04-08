import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

// Scenario Definitions
export const finScenarioDefinitionsTable = pgTable("fin_scenario_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  scenarioType: text("scenario_type").notNull(), // stress_test | what_if | monte_carlo_config
  parametersJson: jsonb("parameters_json").notNull(), // { revenue_drop: -20%, collection_delay: +15days }
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Monte Carlo Runs
export const finMonteCarloRunsTable = pgTable("fin_monte_carlo_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  modelType: text("model_type").notNull(), // cashflow_forecast | project_profitability | customer_payment_delay | supplier_cost_inflation | revenue_variability | margin_variability | working_capital | liquidity_runway | portfolio_of_projects | full_company_pnl
  scenarioCount: integer("scenario_count").notNull().default(50000),
  distributionType: text("distribution_type").notNull().default("normal"), // normal | lognormal | triangular | uniform | beta | custom_empirical
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  inputParametersJson: jsonb("input_parameters_json").notNull(), // all input variables + distributions
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Monte Carlo Variables (inputs per run)
export const finMonteCarloVariablesTable = pgTable("fin_monte_carlo_variables", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  variableName: text("variable_name").notNull(),
  distributionType: text("distribution_type").notNull(), // normal | lognormal | triangular | uniform | beta | custom
  paramMean: numeric("param_mean", { precision: 20, scale: 6 }),
  paramStdDev: numeric("param_std_dev", { precision: 20, scale: 6 }),
  paramMin: numeric("param_min", { precision: 20, scale: 6 }),
  paramMax: numeric("param_max", { precision: 20, scale: 6 }),
  paramAlpha: numeric("param_alpha", { precision: 10, scale: 4 }), // for beta
  paramBeta: numeric("param_beta", { precision: 10, scale: 4 }), // for beta
  customDataJson: jsonb("custom_data_json"), // for custom_empirical
});

// Monte Carlo Results (aggregated)
export const finMonteCarloResultsTable = pgTable("fin_monte_carlo_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  metricName: text("metric_name").notNull(), // e.g. "net_cashflow", "net_profit", "working_capital"
  mean: numeric("mean", { precision: 20, scale: 2 }).notNull(),
  median: numeric("median", { precision: 20, scale: 2 }).notNull(),
  stdDev: numeric("std_dev", { precision: 20, scale: 2 }).notNull(),
  variance: numeric("variance", { precision: 20, scale: 2 }),
  min: numeric("min", { precision: 20, scale: 2 }).notNull(),
  max: numeric("max", { precision: 20, scale: 2 }).notNull(),
  skewness: numeric("skewness", { precision: 10, scale: 4 }),
  kurtosis: numeric("kurtosis", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Monte Carlo Percentiles
export const finMonteCarloPercentilesTable = pgTable("fin_monte_carlo_percentiles", {
  id: serial("id").primaryKey(),
  resultId: integer("result_id").notNull().references(() => finMonteCarloResultsTable.id, { onDelete: "cascade" }),
  percentile: integer("percentile").notNull(), // 1, 5, 10, 25, 50, 75, 90, 95, 99
  value: numeric("value", { precision: 20, scale: 2 }).notNull(),
});

// Monte Carlo Risk Outputs
export const finMonteCarloRiskOutputsTable = pgTable("fin_monte_carlo_risk_outputs", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => finMonteCarloRunsTable.id, { onDelete: "cascade" }),
  probabilityOfNegativeCash: numeric("prob_negative_cash", { precision: 10, scale: 6 }),
  probabilityOfLoss: numeric("prob_loss", { precision: 10, scale: 6 }),
  probabilityOfMarginBreach: numeric("prob_margin_breach", { precision: 10, scale: 6 }),
  probabilityOfCovenantBreach: numeric("prob_covenant_breach", { precision: 10, scale: 6 }),
  valueAtRisk95: numeric("var_95", { precision: 20, scale: 2 }),
  valueAtRisk99: numeric("var_99", { precision: 20, scale: 2 }),
  expectedShortfall95: numeric("es_95", { precision: 20, scale: 2 }),
  expectedShortfall99: numeric("es_99", { precision: 20, scale: 2 }),
  maxDrawdown: numeric("max_drawdown", { precision: 20, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Stress Test Runs
export const finStressTestRunsTable = pgTable("fin_stress_test_runs", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").references(() => finScenarioDefinitionsTable.id),
  name: text("name").notNull(),
  stressDimensionsJson: jsonb("stress_dimensions_json").notNull(), // { revenue_drop: -30, raw_material_increase: 15, collection_delay: 30 }
  baselineResultJson: jsonb("baseline_result_json"),
  stressedResultJson: jsonb("stressed_result_json"),
  impactJson: jsonb("impact_json"), // delta between baseline and stressed
  status: text("status").notNull().default("completed"),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
