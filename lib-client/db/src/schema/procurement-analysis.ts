import { pgTable, serial, text, boolean, timestamp, jsonb, numeric, integer } from "drizzle-orm/pg-core";

export const competitorsTable = pgTable("competitors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  marketShare: numeric("market_share", { precision: 5, scale: 2 }),
  status: text("status").default("active"), // active, inactive
  swot: jsonb("swot").default({}), // {strengths: [], weaknesses: [], opportunities: [], threats: []}
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const competitorPricesTable = pgTable("competitor_prices", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id"),
  productCategory: text("product_category").notNull(),
  competitorPrice: numeric("competitor_price", { precision: 12, scale: 2 }),
  ourPrice: numeric("our_price", { precision: 12, scale: 2 }),
  priceVariance: numeric("price_variance", { precision: 5, scale: 2 }), // percentage difference
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const currencyExposuresTable = pgTable("currency_exposures", {
  id: serial("id").primaryKey(),
  currencyPair: text("currency_pair").notNull(), // USD/ILS, EUR/ILS, CNY/ILS
  exposureAmount: numeric("exposure_amount", { precision: 15, scale: 2 }).notNull(),
  exposureDate: timestamp("exposure_date"),
  hedgingStrategy: text("hedging_strategy").default("none"), // Forward, Option, none
  hedgingCost: numeric("hedging_cost", { precision: 15, scale: 2 }),
  estimatedPnL: jsonb("estimated_pnl").default({}), // {upside5: 0, downside5: 0, upside10: 0, downside10: 0}
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const commodityRisksTable = pgTable("commodity_risks", {
  id: serial("id").primaryKey(),
  commodityName: text("commodity_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  currentPrice: numeric("current_price", { precision: 12, scale: 2 }),
  floorPrice: numeric("floor_price", { precision: 12, scale: 2 }),
  ceilingPrice: numeric("ceiling_price", { precision: 12, scale: 2 }),
  hedgingRecommendation: text("hedging_recommendation"),
  riskScore: integer("risk_score"), // 1-10
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectAnalysesExtendedTable = pgTable("project_analyses_extended", {
  id: serial("id").primaryKey(),
  projectAnalysisId: integer("project_analysis_id"),
  sourceType: text("source_type"), // quote, deal, product_catalog
  sourceId: integer("source_id"),
  profitabilityStatus: text("profitability_status").default("go"), // go, no-go
  marginPercentage: numeric("margin_percentage", { precision: 5, scale: 2 }),
  netMarginPercentage: numeric("net_margin_percentage", { precision: 5, scale: 2 }),
  roi: numeric("roi", { precision: 5, scale: 2 }),
  competitorComparison: jsonb("competitor_comparison").default({}), // {competitorId: priceVariance, ...}
  riskAssessment: jsonb("risk_assessment").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
