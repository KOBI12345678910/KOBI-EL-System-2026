import { pgTable, serial, text, boolean, timestamp, varchar, integer, numeric, date, jsonb } from "drizzle-orm/pg-core";

export const salariedEmployeesTable = pgTable("wa_salaried_employees", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  title: varchar("title", { length: 200 }),
  department: varchar("department", { length: 150 }),
  manager: varchar("manager", { length: 200 }),
  startDate: date("start_date"),
  photoUrl: varchar("photo_url", { length: 500 }),
  attritionRisk: numeric("attrition_risk", { precision: 5, scale: 2 }).default("0"),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).default("0"),
  bonus: numeric("bonus", { precision: 12, scale: 2 }).default("0"),
  pensionCost: numeric("pension_cost", { precision: 12, scale: 2 }).default("0"),
  healthInsurance: numeric("health_insurance", { precision: 12, scale: 2 }).default("0"),
  mealAllowance: numeric("meal_allowance", { precision: 12, scale: 2 }).default("0"),
  vehicleCost: numeric("vehicle_cost", { precision: 12, scale: 2 }).default("0"),
  licensesCost: numeric("licenses_cost", { precision: 12, scale: 2 }).default("0"),
  cloudCost: numeric("cloud_cost", { precision: 12, scale: 2 }).default("0"),
  coachingCost: numeric("coaching_cost", { precision: 12, scale: 2 }).default("0"),
  recruitmentCost: numeric("recruitment_cost", { precision: 12, scale: 2 }).default("0"),
  directValue: numeric("direct_value", { precision: 12, scale: 2 }).default("0"),
  indirectValue: numeric("indirect_value", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const salariedTasksTable = pgTable("wa_salaried_tasks", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  taskName: varchar("task_name", { length: 300 }).notNull(),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  status: varchar("status", { length: 50 }).default("active"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salariedKpisTable = pgTable("wa_salaried_kpis", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  kpiName: varchar("kpi_name", { length: 200 }).notNull(),
  actualValue: numeric("actual_value", { precision: 12, scale: 2 }).default("0"),
  benchmarkValue: numeric("benchmark_value", { precision: 12, scale: 2 }).default("0"),
  unit: varchar("unit", { length: 50 }),
  period: varchar("period", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesAgentsTable = pgTable("wa_sales_agents", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  type: varchar("type", { length: 100 }).default("קבלן משנה"),
  photoUrl: varchar("photo_url", { length: 500 }),
  retainerFee: numeric("retainer_fee", { precision: 12, scale: 2 }).default("0"),
  closingCommissionPct: numeric("closing_commission_pct", { precision: 5, scale: 2 }).default("0"),
  upsellCommissionPct: numeric("upsell_commission_pct", { precision: 5, scale: 2 }).default("0"),
  targetBonusAmount: numeric("target_bonus_amount", { precision: 12, scale: 2 }).default("0"),
  targetBonusThreshold: numeric("target_bonus_threshold", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const salesDealsTable = pgTable("wa_sales_deals", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  dealName: varchar("deal_name", { length: 300 }).notNull(),
  contractValue: numeric("contract_value", { precision: 14, scale: 2 }).default("0"),
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).default("0"),
  actualCommission: numeric("actual_commission", { precision: 12, scale: 2 }).default("0"),
  status: varchar("status", { length: 50 }).default("pipeline"),
  closedAt: date("closed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productionWorkersTable = pgTable("wa_production_workers", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  type: varchar("type", { length: 100 }).default("קבלן משנה"),
  specialization: varchar("specialization", { length: 200 }),
  photoUrl: varchar("photo_url", { length: 500 }),
  payModel: varchar("pay_model", { length: 50 }).default("per_unit"),
  ratePerUnit: numeric("rate_per_unit", { precision: 10, scale: 2 }).default("0"),
  ratePerHour: numeric("rate_per_hour", { precision: 10, scale: 2 }).default("0"),
  overheadCost: numeric("overhead_cost", { precision: 12, scale: 2 }).default("0"),
  materialWasteCost: numeric("material_waste_cost", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productionMonthlyTable = pgTable("wa_production_monthly", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  unitsProduced: integer("units_produced").default(0),
  targetUnits: integer("target_units").default(0),
  hoursWorked: numeric("hours_worked", { precision: 8, scale: 2 }).default("0"),
  defectRate: numeric("defect_rate", { precision: 5, scale: 2 }).default("0"),
  reworkRate: numeric("rework_rate", { precision: 5, scale: 2 }).default("0"),
  totalPay: numeric("total_pay", { precision: 12, scale: 2 }).default("0"),
  productionValue: numeric("production_value", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const installersTable = pgTable("wa_installers", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  type: varchar("type", { length: 100 }).default("קבלן משנה"),
  photoUrl: varchar("photo_url", { length: 500 }),
  regularRate: numeric("regular_rate", { precision: 10, scale: 2 }).default("0"),
  complexRate: numeric("complex_rate", { precision: 10, scale: 2 }).default("0"),
  serviceRate: numeric("service_rate", { precision: 10, scale: 2 }).default("0"),
  fuelCost: numeric("fuel_cost", { precision: 10, scale: 2 }).default("0"),
  vehicleDepreciation: numeric("vehicle_depreciation", { precision: 10, scale: 2 }).default("0"),
  toolsCost: numeric("tools_cost", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const installerMonthlyTable = pgTable("wa_installer_monthly", {
  id: serial("id").primaryKey(),
  installerId: integer("installer_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  regularJobs: integer("regular_jobs").default(0),
  complexJobs: integer("complex_jobs").default(0),
  serviceJobs: integer("service_jobs").default(0),
  totalRevenue: numeric("total_revenue", { precision: 12, scale: 2 }).default("0"),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).default("0"),
  customerSatisfaction: numeric("customer_satisfaction", { precision: 5, scale: 2 }).default("0"),
  callbackRate: numeric("callback_rate", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
