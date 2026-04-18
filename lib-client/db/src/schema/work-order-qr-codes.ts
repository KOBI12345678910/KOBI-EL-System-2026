import { pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const workOrderQrCodesTable = pgTable("work_order_qr_codes", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().unique(),
  qrCode: text("qr_code").notNull(), // Data URL or SVG
  qrUrl: varchar("qr_url", { length: 500 }), // URL to /work-orders/:id
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
