import { pgTable, serial, text, numeric, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const projectAnalysesTable = pgTable("project_analyses", {
  id: serial("id").primaryKey(),
  projectCode: text("project_code").notNull().unique(),
  projectName: text("project_name").notNull(),
  customerName: text("customer_name"),
  managerName: text("manager_name"),
  status: text("status").notNull().default("draft"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  description: text("description"),

  laborCost: numeric("labor_cost").default("0"),
  installationCost: numeric("installation_cost").default("0"),
  transportCost: numeric("transport_cost").default("0"),
  insuranceCost: numeric("insurance_cost").default("0"),
  storageCost: numeric("storage_cost").default("0"),
  customsCost: numeric("customs_cost").default("0"),
  packagingCost: numeric("packaging_cost").default("0"),
  overheadCost: numeric("overhead_cost").default("0"),

  paymentTerms: text("payment_terms"),
  numberOfPayments: integer("number_of_payments").default(1),
  creditFeePercent: numeric("credit_fee_percent").default("0"),
  contingencyPercent: numeric("contingency_percent").default("0"),

  operationalOverheadPercent: numeric("operational_overhead_percent").default("0"),
  targetMarginPercent: numeric("target_margin_percent").default("0"),

  proposedSalePrice: numeric("proposed_sale_price").default("0"),
  actualSalePrice: numeric("actual_sale_price").default("0"),

  riskScore: numeric("risk_score").default("5"),
  supplierRisk: numeric("supplier_risk").default("5"),
  currencyRisk: numeric("currency_risk").default("5"),
  marketRisk: numeric("market_risk").default("5"),
  operationalRisk: numeric("operational_risk").default("5"),

  sourceType: text("source_type"),
  sourceId: text("source_id"),

  notes: text("notes"),
  auditTrail: jsonb("audit_trail").default([]),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectAnalysisMaterialsTable = pgTable("project_analysis_materials", {
  id: serial("id").primaryKey(),
  projectAnalysisId: integer("project_analysis_id").notNull(),
  rawMaterialId: integer("raw_material_id"),
  materialName: text("material_name").notNull(),
  materialNumber: text("material_number"),
  quantity: numeric("quantity").default("1"),
  unit: text("unit").default("יחידה"),
  unitPrice: numeric("unit_price").default("0"),
  totalPrice: numeric("total_price").default("0"),
  vatAmount: numeric("vat_amount").default("0"),
  supplierDiscount: numeric("supplier_discount").default("0"),
  pricePerMeter: numeric("price_per_meter"),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectAnalysisCostsTable = pgTable("project_analysis_costs", {
  id: serial("id").primaryKey(),
  projectAnalysisId: integer("project_analysis_id").notNull(),
  costType: text("cost_type").notNull(),
  description: text("description"),
  amount: numeric("amount").default("0"),
  currency: text("currency").default("ILS"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectAnalysisSimulationsTable = pgTable("project_analysis_simulations", {
  id: serial("id").primaryKey(),
  projectAnalysisId: integer("project_analysis_id").notNull(),
  simulationType: text("simulation_type").notNull(),
  scenarioName: text("scenario_name").notNull(),
  parameters: jsonb("parameters").default({}),
  results: jsonb("results").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
