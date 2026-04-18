import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { reportDefinitionsTable } from "./report-definitions";

export const reportSnapshotsTable = pgTable("report_snapshots", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => reportDefinitionsTable.id, { onDelete: "cascade" }),
  snapshotData: jsonb("snapshot_data").notNull().default({}),
  totalRecords: integer("total_records").notNull().default(0),
  generatedBy: text("generated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
