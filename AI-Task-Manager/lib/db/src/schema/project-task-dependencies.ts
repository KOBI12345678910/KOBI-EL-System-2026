import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const projectTaskDependenciesTable = pgTable("project_task_dependencies", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  predecessorId: integer("predecessor_id").notNull(),
  successorId: integer("successor_id").notNull(),
  dependencyType: text("dependency_type").notNull().default("FS"),
  lagDays: integer("lag_days").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
