import { pgTable, serial, text, numeric, timestamp, integer, date, jsonb } from "drizzle-orm/pg-core";

export const projectRisksTable = pgTable("project_risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  probability: text("probability").default("medium"),
  impact: text("impact").default("medium"),
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("open"),
  mitigationPlan: text("mitigation_plan"),
  owner: text("owner"),
  identifiedDate: date("identified_date"),
  responseStrategy: text("response_strategy").default("mitigate"),
  contingencyPlan: text("contingency_plan"),
  triggerConditions: text("trigger_conditions"),
  residualScore: numeric("residual_score", { precision: 5, scale: 2 }),
  monitoringFrequency: text("monitoring_frequency").default("weekly"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const projectRiskAssessmentsTable = pgTable("project_risk_assessments", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").notNull(),
  projectId: integer("project_id").notNull(),
  assessedBy: text("assessed_by"),
  probability: text("probability").notNull().default("medium"),
  impact: text("impact").notNull().default("medium"),
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }),
  notes: text("notes"),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).defaultNow(),
});
