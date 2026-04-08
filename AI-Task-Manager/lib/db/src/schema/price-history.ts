import { pgTable, serial, text, numeric, timestamp, date, integer } from "drizzle-orm/pg-core";

export const supplierPriceHistoryTable = pgTable("supplier_price_history", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  materialId: integer("material_id").notNull(),
  price: numeric("price").notNull(),
  currency: text("currency").default("ILS"),
  validFrom: date("valid_from").defaultNow(),
  validUntil: date("valid_until"),
  priceListName: text("price_list_name"),
  discountPercentage: numeric("discount_percentage"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
