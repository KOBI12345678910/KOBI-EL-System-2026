import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const entityRecordsTable = pgTable("entity_records", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull().default({}),
  status: text("status"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  assignedTo: text("assigned_to"),
  assignedTeam: text("assigned_team"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
