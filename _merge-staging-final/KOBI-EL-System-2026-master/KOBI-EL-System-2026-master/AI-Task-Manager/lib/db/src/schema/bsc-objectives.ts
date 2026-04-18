import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const bscObjectivesTable = pgTable("bsc_objectives", {
  id: serial("id").primaryKey(),
  perspective: text("perspective").notNull(),
  objective: text("objective").notNull(),
  measure: text("measure"),
  target: text("target"),
  actual: text("actual"),
  status: text("status").default("on-track"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
