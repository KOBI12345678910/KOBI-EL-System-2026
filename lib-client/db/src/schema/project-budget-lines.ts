import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";

export const projectBudgetLinesTable = pgTable("project_budget_lines", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  category: text("category").notNull(),
  plannedAmount: numeric("planned_amount", { precision: 15, scale: 2 }).default("0"),
  actualAmount: numeric("actual_amount", { precision: 15, scale: 2 }).default("0"),
  earnedValue: numeric("earned_value", { precision: 15, scale: 2 }).default("0"),
  plannedValue: numeric("planned_value", { precision: 15, scale: 2 }).default("0"),
  variance: numeric("variance", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const projectEvmSnapshotsTable = pgTable("project_evm_snapshots", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  pv: numeric("pv", { precision: 15, scale: 2 }).default("0"),
  ev: numeric("ev", { precision: 15, scale: 2 }).default("0"),
  ac: numeric("ac", { precision: 15, scale: 2 }).default("0"),
  cpi: numeric("cpi", { precision: 8, scale: 4 }),
  spi: numeric("spi", { precision: 8, scale: 4 }),
  eac: numeric("eac", { precision: 15, scale: 2 }),
  etc: numeric("etc", { precision: 15, scale: 2 }),
  vac: numeric("vac", { precision: 15, scale: 2 }),
  cv: numeric("cv", { precision: 15, scale: 2 }),
  sv: numeric("sv", { precision: 15, scale: 2 }),
  completionPct: numeric("completion_pct", { precision: 5, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
