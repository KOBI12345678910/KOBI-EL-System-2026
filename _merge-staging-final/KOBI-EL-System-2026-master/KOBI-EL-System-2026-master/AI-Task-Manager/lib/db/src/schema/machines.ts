import { pgTable, serial, text, numeric, integer, date, timestamp } from "drizzle-orm/pg-core";

export const machinesTable = pgTable("machines", {
  id: serial("id").primaryKey(),
  machineNumber: text("machine_number").notNull().unique(),
  name: text("name").notNull(),
  assetTag: text("asset_tag"),
  location: text("location"),
  machineType: text("machine_type"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  serialNumber: text("serial_number"),
  status: text("status").notNull().default("active"),
  purchaseDate: date("purchase_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const machineMaintenanceRecordsTable = pgTable("machine_maintenance_records", {
  id: serial("id").primaryKey(),
  recordNumber: text("record_number").notNull().unique(),
  machineId: integer("machine_id").notNull(),
  maintenanceType: text("maintenance_type").notNull().default("preventive"),
  scheduledDate: date("scheduled_date"),
  completedDate: date("completed_date"),
  performedBy: text("performed_by"),
  description: text("description"),
  cost: numeric("cost").default("0"),
  partsReplaced: text("parts_replaced"),
  nextScheduledDate: date("next_scheduled_date"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
