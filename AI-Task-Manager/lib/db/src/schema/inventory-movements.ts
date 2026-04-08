import { pgTable, serial, text, integer, numeric, timestamp, varchar } from "drizzle-orm/pg-core";

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  inventoryItemId: integer("inventory_item_id").notNull(),
  movementType: varchar("movement_type", { length: 30 }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  previousQuantity: numeric("previous_quantity", { precision: 12, scale: 3 }),
  newQuantity: numeric("new_quantity", { precision: 12, scale: 3 }),
  unitCost: numeric("unit_cost", { precision: 15, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 15, scale: 2 }),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  referenceNumber: text("reference_number"),
  warehouseFrom: text("warehouse_from"),
  warehouseTo: text("warehouse_to"),
  reason: text("reason"),
  notes: text("notes"),
  performedBy: integer("performed_by"),
  approvedBy: integer("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
