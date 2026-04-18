import { pgTable, serial, text, integer, boolean, timestamp, jsonb, date, decimal } from "drizzle-orm/pg-core";

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  contractType: text("contract_type").notNull(),
  status: text("status").notNull().default("draft"),
  vendor: text("vendor"),
  vendorId: integer("vendor_id"),
  customer: text("customer"),
  customerId: integer("customer_id"),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  currency: text("currency").default("ILS"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  renewalDate: date("renewal_date"),
  autoRenewal: boolean("auto_renewal").default(false),
  renewalTermMonths: integer("renewal_term_months").default(12),
  metadata: jsonb("metadata").default({}),
  attachments: jsonb("attachments").default([]),
  keyTerms: jsonb("key_terms").default({}),
  module: text("module"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  createdBy: text("created_by").default("system"),
  updatedBy: text("updated_by").default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contractStatusHistoryTable = pgTable("contract_status_history", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

export const contractApproversTable = pgTable("contract_approvers", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  approverName: text("approver_name").notNull(),
  approverEmail: text("approver_email"),
  approverRole: text("approver_role"),
  status: text("status").notNull().default("pending"),
  comments: text("comments"),
  approvedAt: timestamp("approved_at"),
  sequenceNumber: integer("sequence_number").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contractRenewalAlertsTable = pgTable("contract_renewal_alerts", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  alertDate: date("alert_date").notNull(),
  daysBeforeExpiry: integer("days_before_expiry").notNull(),
  alertType: text("alert_type").notNull().default("renewal"),
  status: text("status").notNull().default("pending"),
  notifiedAt: timestamp("notified_at"),
  actionTaken: text("action_taken"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contractPartyTable = pgTable("contract_parties", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  partyType: text("party_type").notNull(),
  partyName: text("party_name").notNull(),
  partyEmail: text("party_email"),
  partyPhone: text("party_phone"),
  partyAddress: text("party_address"),
  signedAt: timestamp("signed_at"),
  signaturePath: text("signature_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
