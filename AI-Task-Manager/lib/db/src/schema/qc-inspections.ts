import { pgTable, serial, text, integer, date, timestamp } from "drizzle-orm/pg-core";

export const qcInspectionsTable = pgTable("qc_inspections", {
  id: serial("id").primaryKey(),
  inspectionNumber: text("inspection_number").notNull().unique(),
  workOrderId: integer("work_order_id"),
  batchReference: text("batch_reference"),
  inspectionDate: date("inspection_date"),
  inspector: text("inspector"),
  inspectionType: text("inspection_type").notNull().default("in-process"),
  result: text("result").notNull().default("pending"),
  defectsFound: integer("defects_found").default(0),
  defectDescription: text("defect_description"),
  correctiveAction: text("corrective_action"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
