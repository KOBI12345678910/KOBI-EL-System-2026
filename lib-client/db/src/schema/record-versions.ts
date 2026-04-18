import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const recordVersionsTable = pgTable("record_versions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  recordId: integer("record_id").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  data: jsonb("data").notNull().default({}),
  status: text("status"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
