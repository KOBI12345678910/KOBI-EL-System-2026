import { pgTable, serial, text, integer, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";

export const rfqTable = pgTable("rfq", {
  id: serial("id").primaryKey(),
  rfqNumber: text("rfq_number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  department: text("department"),
  createdBy: text("created_by"),
  status: text("status").notNull().default("draft"),
  issueDate: timestamp("issue_date"),
  dueDate: timestamp("due_date").notNull(),
  budget: numeric("budget", { precision: 15, scale: 2 }),
  location: text("location"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rfqItemsTable = pgTable("rfq_items", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqTable.id, { onDelete: "cascade" }),
  itemNumber: integer("item_number"),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 15, scale: 2 }).notNull(),
  unit: text("unit"),
  estimatedPrice: numeric("estimated_price", { precision: 15, scale: 2 }),
  specifications: jsonb("specifications").default({}),
  deliveryDate: timestamp("delivery_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rfqResponsesTable = pgTable("rfq_responses", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqTable.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name"),
  supplierEmail: text("supplier_email"),
  quotedPrice: numeric("quoted_price", { precision: 15, scale: 2 }),
  leadTime: integer("lead_time"),
  paymentTerms: text("payment_terms"),
  qualityRating: numeric("quality_rating", { precision: 3, scale: 1 }),
  priceScore: numeric("price_score", { precision: 5, scale: 2 }),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  deliveryScore: numeric("delivery_score", { precision: 5, scale: 2 }),
  termsScore: numeric("terms_score", { precision: 5, scale: 2 }),
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
  lineItemPrices: jsonb("line_item_prices").default([]),
  responseDate: timestamp("response_date"),
  status: text("status").notNull().default("submitted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const poApprovalThresholdsTable = pgTable("po_approval_thresholds", {
  id: serial("id").primaryKey(),
  minAmount: numeric("min_amount", { precision: 15, scale: 2 }).notNull(),
  maxAmount: numeric("max_amount", { precision: 15, scale: 2 }),
  requiredRoles: jsonb("required_roles").default([]),
  approvalSequence: jsonb("approval_sequence").default([]),
  escalationHours: integer("escalation_hours").default(24),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const poApprovalsTable = pgTable("po_approvals", {
  id: serial("id").primaryKey(),
  poId: integer("po_id"),
  poNumber: text("po_number"),
  poAmount: numeric("po_amount", { precision: 15, scale: 2 }).notNull(),
  currentApprovalLevel: integer("current_approval_level").default(0),
  requiredApprovers: jsonb("required_approvers").default([]),
  approvalStatus: text("approval_status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const poApprovalStepsTable = pgTable("po_approval_steps", {
  id: serial("id").primaryKey(),
  approvalId: integer("approval_id").notNull().references(() => poApprovalsTable.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  approverEmail: text("approver_email").notNull(),
  approverName: text("approver_name"),
  approverRole: text("approver_role"),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  comments: text("comments"),
  escalatedAt: timestamp("escalated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const threeWayMatchingTable = pgTable("three_way_matching", {
  id: serial("id").primaryKey(),
  poId: integer("po_id"),
  poNumber: text("po_number"),
  grnId: integer("grn_id"),
  grnNumber: text("grn_number"),
  invoiceId: integer("invoice_id"),
  invoiceNumber: text("invoice_number"),
  matchStatus: text("match_status").notNull().default("pending"),
  quantityVariance: numeric("quantity_variance", { precision: 5, scale: 2 }),
  priceVariance: numeric("price_variance", { precision: 5, scale: 2 }),
  quantityTolerance: numeric("quantity_tolerance", { precision: 5, scale: 2 }).default(5),
  priceTolerance: numeric("price_tolerance", { precision: 5, scale: 2 }).default(2),
  lineItemMatches: jsonb("line_item_matches").default([]),
  exceptions: jsonb("exceptions").default([]),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const landedCostComponentsTable = pgTable("landed_cost_components", {
  id: serial("id").primaryKey(),
  poId: integer("po_id"),
  poNumber: text("po_number"),
  componentType: text("component_type").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  allocationMethod: text("allocation_method").notNull().default("value"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const landedCostCalculationTable = pgTable("landed_cost_calculation", {
  id: serial("id").primaryKey(),
  poId: integer("po_id"),
  poNumber: text("po_number"),
  totalFreight: numeric("total_freight", { precision: 15, scale: 2 }),
  totalCustomsDuties: numeric("total_customs_duties", { precision: 15, scale: 2 }),
  totalInsurance: numeric("total_insurance", { precision: 15, scale: 2 }),
  totalHandling: numeric("total_handling", { precision: 15, scale: 2 }),
  totalLandedCost: numeric("total_landed_cost", { precision: 15, scale: 2 }),
  lineItemCosts: jsonb("line_item_costs").default([]),
  calculatedAt: timestamp("calculated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
