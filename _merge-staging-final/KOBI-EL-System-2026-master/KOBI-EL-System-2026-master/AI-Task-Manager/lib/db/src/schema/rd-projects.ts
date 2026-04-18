import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";

export const rdProjectsTable = pgTable("rd_projects", {
  id: serial("id").primaryKey(),
  projectNumber: text("project_number").notNull().unique(),
  name: text("name").notNull(),
  objective: text("objective"),
  status: text("status").notNull().default("ideation"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: numeric("budget").default("0"),
  spent: numeric("spent").default("0"),
  teamMembers: text("team_members"),
  milestones: text("milestones"),
  outcomes: text("outcomes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
