import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { platformRolesTable } from "./platform-roles";

export const rolePermissionsTable = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  entityId: integer("entity_id"),
  moduleId: integer("module_id"),
  action: text("action").notNull(),
  isAllowed: boolean("is_allowed").notNull().default(true),
  conditions: jsonb("conditions").default({}),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
