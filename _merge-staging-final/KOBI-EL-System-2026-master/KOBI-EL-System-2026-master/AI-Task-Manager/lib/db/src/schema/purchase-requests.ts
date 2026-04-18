import { pgTable, serial, text, numeric, timestamp, date } from "drizzle-orm/pg-core";

export const purchaseRequestsTable = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  requestNumber: text("request_number").notNull().unique(),
  title: text("title").notNull(),
  requesterName: text("requester_name"),
  department: text("department"),
  priority: text("priority").notNull().default("רגיל"),
  status: text("status").notNull().default("טיוטה"),
  totalEstimated: numeric("total_estimated").default("0"),
  currency: text("currency").default("ILS"),
  neededBy: date("needed_by"),
  notes: text("notes"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const purchaseRequestItemsTable = pgTable("purchase_request_items", {
  id: serial("id").primaryKey(),
  requestId: numeric("request_id").notNull(),
  materialId: numeric("material_id"),
  itemDescription: text("item_description").notNull(),
  quantity: numeric("quantity").notNull().default("1"),
  unit: text("unit").default("יחידה"),
  estimatedPrice: numeric("estimated_price"),
  currency: text("currency").default("ILS"),
  preferredSupplierId: numeric("preferred_supplier_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseRequestApprovalsTable = pgTable("purchase_request_approvals", {
  id: serial("id").primaryKey(),
  requestId: numeric("request_id").notNull(),
  approverName: text("approver_name").notNull(),
  approvalStatus: text("approval_status").notNull().default("ממתין"),
  approvalLevel: numeric("approval_level").default("1"),
  comments: text("comments"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
