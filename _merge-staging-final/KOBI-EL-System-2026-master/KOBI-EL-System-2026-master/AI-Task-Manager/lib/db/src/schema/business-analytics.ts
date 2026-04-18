import { pgTable, serial, text, numeric, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const competitorsTable = pgTable("competitors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain"),
  marketShare: numeric("market_share").default("0"),
  isActive: boolean("is_active").default(true),
  swotStrengths: text("swot_strengths"),
  swotWeaknesses: text("swot_weaknesses"),
  swotOpportunities: text("swot_opportunities"),
  swotThreats: text("swot_threats"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const competitorPricesTable = pgTable("competitor_prices", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id").notNull(),
  productCategory: text("product_category").notNull(),
  productName: text("product_name"),
  ourPrice: numeric("our_price").default("0"),
  competitorPrice: numeric("competitor_price").default("0"),
  lastUpdated: text("last_updated"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const baCurrencyExposuresTable = pgTable("ba_currency_exposures", {
  id: serial("id").primaryKey(),
  currencyPair: text("currency_pair").notNull(),
  exposureAmount: numeric("exposure_amount").default("0"),
  expiryDate: text("expiry_date"),
  hedgingType: text("hedging_type").default("none"),
  hedgingCostPercent: numeric("hedging_cost_percent").default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const commodityRisksTable = pgTable("commodity_risks", {
  id: serial("id").primaryKey(),
  materialName: text("material_name").notNull(),
  quantity: numeric("quantity").default("0"),
  unit: text("unit").default("kg"),
  currentPrice: numeric("current_price").default("0"),
  floorPrice: numeric("floor_price"),
  ceilingPrice: numeric("ceiling_price"),
  hedgingRecommendation: text("hedging_recommendation"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
