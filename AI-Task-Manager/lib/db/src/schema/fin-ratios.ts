import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

// Ratio & KPI Definitions
export const finRatioDefinitionsTable = pgTable("fin_ratio_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  labelHe: text("label_he").notNull(),
  category: text("category").notNull(), // profitability | loss | liquidity | leverage | efficiency | hedge | risk | multiple
  formula: text("formula").notNull(), // e.g. "gross_profit / revenue"
  description: text("description"),
  unit: text("unit").notNull().default("ratio"), // ratio | percent | currency | days | months
  higherIsBetter: boolean("higher_is_better").notNull().default(true),
  warningThreshold: numeric("warning_threshold", { precision: 15, scale: 4 }),
  criticalThreshold: numeric("critical_threshold", { precision: 15, scale: 4 }),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Ratio Results (computed periodically)
export const finRatioResultsTable = pgTable("fin_ratio_results", {
  id: serial("id").primaryKey(),
  ratioDefinitionId: integer("ratio_definition_id").notNull().references(() => finRatioDefinitionsTable.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  value: numeric("value", { precision: 20, scale: 6 }).notNull(),
  previousValue: numeric("previous_value", { precision: 20, scale: 6 }),
  changePercent: numeric("change_percent", { precision: 10, scale: 4 }),
  status: text("status").notNull().default("normal"), // normal | warning | critical
  numerator: numeric("numerator", { precision: 20, scale: 2 }),
  denominator: numeric("denominator", { precision: 20, scale: 2 }),
  metadataJson: jsonb("metadata_json"),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// KPI Definitions
export const finKpiDefinitionsTable = pgTable("fin_kpi_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  labelHe: text("label_he").notNull(),
  category: text("category").notNull(),
  sourceQuery: text("source_query").notNull(),
  unit: text("unit").notNull().default("currency"),
  targetValue: numeric("target_value", { precision: 20, scale: 2 }),
  warningThreshold: numeric("warning_threshold", { precision: 20, scale: 2 }),
  criticalThreshold: numeric("critical_threshold", { precision: 20, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// KPI Snapshots
export const finKpiSnapshotsTable = pgTable("fin_kpi_snapshots", {
  id: serial("id").primaryKey(),
  kpiDefinitionId: integer("kpi_definition_id").notNull().references(() => finKpiDefinitionsTable.id),
  periodDate: timestamp("period_date").notNull(),
  value: numeric("value", { precision: 20, scale: 2 }).notNull(),
  targetValue: numeric("target_value", { precision: 20, scale: 2 }),
  variancePercent: numeric("variance_percent", { precision: 10, scale: 4 }),
  status: text("status").notNull().default("normal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
