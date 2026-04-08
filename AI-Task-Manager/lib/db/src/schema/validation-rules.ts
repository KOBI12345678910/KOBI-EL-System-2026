import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const validationRulesTable = pgTable("validation_rules", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(),
  fieldSlug: text("field_slug"),
  operator: text("operator").notNull(),
  value: text("value"),
  errorMessage: text("error_message").notNull(),
  errorMessageHe: text("error_message_he"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  conditions: jsonb("conditions").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
