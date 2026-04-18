import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean, date } from "drizzle-orm/pg-core";

// Risk Register
export const finRiskRegisterTable = pgTable("fin_risk_register", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // liquidity | credit | concentration | operational | supplier | customer | project | market | fx
  description: text("description"),
  likelihood: integer("likelihood").notNull().default(3), // 1-5
  impact: integer("impact").notNull().default(3), // 1-5
  riskScore: integer("risk_score").notNull().default(9), // likelihood * impact
  owner: text("owner"),
  mitigationPlan: text("mitigation_plan"),
  status: text("status").notNull().default("open"), // open | mitigated | accepted | closed
  reviewDate: date("review_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Risk Events
export const finRiskEventsTable = pgTable("fin_risk_events", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").references(() => finRiskRegisterTable.id),
  eventType: text("event_type").notNull(), // threshold_breach | anomaly | manual_flag
  description: text("description").notNull(),
  severity: text("severity").notNull().default("medium"), // low | medium | high | critical
  impactAmount: numeric("impact_amount", { precision: 15, scale: 2 }),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Risk Limits
export const finRiskLimitsTable = pgTable("fin_risk_limits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  metric: text("metric").notNull(), // e.g. "concentration_top_5_customers"
  limitValue: numeric("limit_value", { precision: 15, scale: 4 }).notNull(),
  currentValue: numeric("current_value", { precision: 15, scale: 4 }),
  status: text("status").notNull().default("within_limit"), // within_limit | warning | breached
  lastCheckedAt: timestamp("last_checked_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Exposure Items
export const finExposureItemsTable = pgTable("fin_exposure_items", {
  id: serial("id").primaryKey(),
  exposureType: text("exposure_type").notNull(), // fx | commodity | interest_rate | credit | supplier
  entityType: text("entity_type"), // customer | supplier | project
  entityId: integer("entity_id"),
  currency: text("currency"),
  grossAmount: numeric("gross_amount", { precision: 15, scale: 2 }).notNull(),
  hedgedAmount: numeric("hedged_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  netExposure: numeric("net_exposure", { precision: 15, scale: 2 }).notNull(),
  maturityDate: date("maturity_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Hedge Positions
export const finHedgePositionsTable = pgTable("fin_hedge_positions", {
  id: serial("id").primaryKey(),
  exposureItemId: integer("exposure_item_id").references(() => finExposureItemsTable.id),
  hedgeType: text("hedge_type").notNull(), // forward | option | swap | natural | collar
  instrument: text("instrument"),
  notionalAmount: numeric("notional_amount", { precision: 15, scale: 2 }).notNull(),
  strikeRate: numeric("strike_rate", { precision: 15, scale: 6 }),
  startDate: date("start_date").notNull(),
  maturityDate: date("maturity_date").notNull(),
  counterparty: text("counterparty"),
  status: text("status").notNull().default("active"), // active | matured | cancelled
  effectivenessRatio: numeric("effectiveness_ratio", { precision: 10, scale: 4 }),
  markToMarket: numeric("mark_to_market", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
