import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { platformRolesTable } from "./platform-roles";
import { moduleEntitiesTable } from "./module-entities";

export const dataScopeRulesTable = pgTable("data_scope_rules", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull().default("all"),
  field: text("field"),
  operator: text("operator"),
  value: text("value"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
