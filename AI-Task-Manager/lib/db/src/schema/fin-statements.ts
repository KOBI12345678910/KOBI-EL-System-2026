import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean, date } from "drizzle-orm/pg-core";

// P&L Lines
export const finPnlLinesTable = pgTable("fin_pnl_lines", {
  id: serial("id").primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  section: text("section").notNull(), // revenue | cost_of_sales | gross_profit | operating_expenses | operating_profit | financing | pre_tax_profit | taxes | net_profit
  lineItem: text("line_item").notNull(), // e.g. operating_revenue, material_cost, salaries
  labelHe: text("label_he").notNull(),
  amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
  previousPeriodAmount: numeric("previous_period_amount", { precision: 20, scale: 2 }),
  budgetAmount: numeric("budget_amount", { precision: 20, scale: 2 }),
  varianceAmount: numeric("variance_amount", { precision: 20, scale: 2 }),
  variancePercent: numeric("variance_percent", { precision: 10, scale: 4 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isSubtotal: boolean("is_subtotal").notNull().default(false),
  isTotal: boolean("is_total").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Balance Sheet Lines
export const finBalanceSheetLinesTable = pgTable("fin_balance_sheet_lines", {
  id: serial("id").primaryKey(),
  asOfDate: date("as_of_date").notNull(),
  section: text("section").notNull(), // assets | liabilities | equity
  subsection: text("subsection").notNull(), // current_assets | fixed_assets | current_liabilities | long_term_liabilities | equity
  lineItem: text("line_item").notNull(),
  labelHe: text("label_he").notNull(),
  amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
  previousPeriodAmount: numeric("previous_period_amount", { precision: 20, scale: 2 }),
  changeAmount: numeric("change_amount", { precision: 20, scale: 2 }),
  changePercent: numeric("change_percent", { precision: 10, scale: 4 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isSubtotal: boolean("is_subtotal").notNull().default(false),
  isTotal: boolean("is_total").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Cash Flow Lines
export const finCashflowLinesTable = pgTable("fin_cashflow_lines", {
  id: serial("id").primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  section: text("section").notNull(), // operating | investing | financing | net
  lineItem: text("line_item").notNull(),
  labelHe: text("label_he").notNull(),
  amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
  previousPeriodAmount: numeric("previous_period_amount", { precision: 20, scale: 2 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isSubtotal: boolean("is_subtotal").notNull().default(false),
  isTotal: boolean("is_total").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Statement Snapshots (frozen points in time)
export const finStatementSnapshotsTable = pgTable("fin_statement_snapshots", {
  id: serial("id").primaryKey(),
  snapshotType: text("snapshot_type").notNull(), // pnl | balance_sheet | cashflow | working_capital | profitability
  periodLabel: text("period_label").notNull(), // e.g. "2026-Q1", "2026-03"
  asOfDate: date("as_of_date").notNull(),
  dataJson: jsonb("data_json").notNull(), // full snapshot data
  ratiosJson: jsonb("ratios_json"), // computed ratios at this point
  notes: text("notes"),
  createdBy: text("created_by").notNull().default("system"),
  isFinal: boolean("is_final").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Period Close Runs
export const finPeriodCloseRunsTable = pgTable("fin_period_close_runs", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(), // e.g. "2026-03"
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull().default("open"), // open | in_progress | closed | reopened
  closedBy: text("closed_by"),
  closedAt: timestamp("closed_at"),
  reopenedBy: text("reopened_by"),
  reopenedAt: timestamp("reopened_at"),
  checklistJson: jsonb("checklist_json"), // steps to complete before close
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Treasury - Liquidity Buckets
export const finLiquidityBucketsTable = pgTable("fin_liquidity_buckets", {
  id: serial("id").primaryKey(),
  asOfDate: date("as_of_date").notNull(),
  bucketLabel: text("bucket_label").notNull(), // 0-7d | 8-30d | 31-60d | 61-90d | 91-180d | 181-365d | 365d+
  inflowAmount: numeric("inflow_amount", { precision: 20, scale: 2 }).notNull().default("0"),
  outflowAmount: numeric("outflow_amount", { precision: 20, scale: 2 }).notNull().default("0"),
  netAmount: numeric("net_amount", { precision: 20, scale: 2 }).notNull().default("0"),
  cumulativeNet: numeric("cumulative_net", { precision: 20, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Treasury - Debt Facilities
export const finDebtFacilitiesTable = pgTable("fin_debt_facilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  facilityType: text("facility_type").notNull(), // term_loan | revolving_credit | overdraft | trade_finance | leasing
  lender: text("lender").notNull(),
  totalAmount: numeric("total_amount", { precision: 20, scale: 2 }).notNull(),
  drawnAmount: numeric("drawn_amount", { precision: 20, scale: 2 }).notNull().default("0"),
  availableAmount: numeric("available_amount", { precision: 20, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 10, scale: 4 }),
  maturityDate: date("maturity_date"),
  covenantRulesJson: jsonb("covenant_rules_json"), // { debt_to_equity_max: 3, current_ratio_min: 1.2 }
  status: text("status").notNull().default("active"), // active | matured | cancelled
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
