import { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";

export const contractRiskAssessmentsTable = pgTable("contract_risk_assessments", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => ({
    name: "contracts",
    schema: "public",
  }), { onDelete: "cascade" }),
  overallRiskScore: numeric("overall_risk_score", { precision: 5, scale: 2 }).notNull(),
  vendorRiskScore: numeric("vendor_risk_score", { precision: 5, scale: 2 }),
  financialRiskScore: numeric("financial_risk_score", { precision: 5, scale: 2 }),
  complianceRiskScore: numeric("compliance_risk_score", { precision: 5, scale: 2 }),
  performanceHistoryScore: numeric("performance_history_score", { precision: 5, scale: 2 }),
  riskFactors: jsonb("risk_factors").default([]),
  riskLevel: text("risk_level").notNull(),
  recommendations: jsonb("recommendations").default([]),
  analysisDate: timestamp("analysis_date").notNull(),
  nextReviewDate: timestamp("next_review_date"),
  analyzedBy: text("analyzed_by").default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contractRiskAlertsTable = pgTable("contract_risk_alerts", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => ({
    name: "contracts",
    schema: "public",
  }), { onDelete: "cascade" }),
  riskAssessmentId: integer("risk_assessment_id").notNull().references(() => contractRiskAssessmentsTable.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  details: jsonb("details").default({}),
  status: text("status").notNull().default("active"),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contractInsightsTable = pgTable("contract_insights", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => ({
    name: "contracts",
    schema: "public",
  }), { onDelete: "cascade" }),
  insightType: text("insight_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dataPoints: jsonb("data_points").default([]),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  actionable: boolean("actionable").default(false),
  suggestedAction: text("suggested_action"),
  category: text("category"),
  priority: text("priority").default("normal"),
  generatedAt: timestamp("generated_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const predictiveAnalyticsDataTable = pgTable("predictive_analytics_data", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => ({
    name: "contracts",
    schema: "public",
  }), { onDelete: "cascade" }),
  predictionType: text("prediction_type").notNull(),
  predictionValue: numeric("prediction_value", { precision: 10, scale: 2 }),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
  timeHorizon: text("time_horizon"),
  factors: jsonb("factors").default([]),
  historicalData: jsonb("historical_data").default([]),
  trend: text("trend"),
  forecastedOutcome: text("forecasted_outcome"),
  generatedAt: timestamp("generated_at").notNull(),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contractAnalyticsDashboardTable = pgTable("contract_analytics_dashboard", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  dashboardName: text("dashboard_name").notNull(),
  description: text("description"),
  widgets: jsonb("widgets").default([]),
  filters: jsonb("filters").default({}),
  dateRange: jsonb("date_range").default({ start: null, end: null }),
  isShared: boolean("is_shared").default(false),
  sharedWith: jsonb("shared_with").default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contractAnalysisHistoryTable = pgTable("contract_analysis_history", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => ({
    name: "contracts",
    schema: "public",
  }), { onDelete: "cascade" }),
  analysisType: text("analysis_type").notNull(),
  analysisData: jsonb("analysis_data").default({}),
  results: jsonb("results").default({}),
  status: text("status").notNull().default("completed"),
  executionTime: integer("execution_time"),
  analyzedBy: text("analyzed_by").default("system"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
