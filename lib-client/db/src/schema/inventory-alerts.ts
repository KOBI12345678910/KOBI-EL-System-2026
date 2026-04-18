import { pgTable, serial, text, numeric, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { rawMaterialsTable } from "./raw-materials";

export const inventoryAlertsTable = pgTable("inventory_alerts", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => rawMaterialsTable.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull().default("warning"),
  currentStock: numeric("current_stock"),
  thresholdValue: numeric("threshold_value"),
  message: text("message").notNull(),
  status: text("status").notNull().default("active"),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  autoPoGenerated: boolean("auto_po_generated").default(false),
  suggestedOrderQty: numeric("suggested_order_qty"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
