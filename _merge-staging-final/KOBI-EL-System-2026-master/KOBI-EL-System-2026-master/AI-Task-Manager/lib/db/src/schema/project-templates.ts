import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const projectTemplatesTable = pgTable("project_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  projectType: text("project_type").default("general"),
  templateData: jsonb("template_data"),
  createdBy: text("created_by").default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
