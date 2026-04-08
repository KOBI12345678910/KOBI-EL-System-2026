import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";

export const workOrderPhotosTable = pgTable("work_order_photos", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull(),
  photoUrl: text("photo_url").notNull(),
  photoType: varchar("photo_type", { length: 30 }).default("in-progress"), // before, after, in-progress
  description: text("description"),
  uploadedBy: integer("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
