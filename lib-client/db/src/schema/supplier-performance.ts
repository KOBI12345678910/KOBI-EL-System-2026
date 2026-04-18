import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";

export const supplierPerformanceTable = pgTable("supplier_performance", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  qualityRating: numeric("quality_rating"),
  availabilityRating: numeric("availability_rating"),
  priceRating: numeric("price_rating"),
  serviceRating: numeric("service_rating"),
  reliabilityRating: numeric("reliability_rating"),
  delayPercentage: numeric("delay_percentage"),
  performanceNotes: text("performance_notes"),
  evaluationDate: timestamp("evaluation_date").notNull().defaultNow(),
  evaluatedBy: text("evaluated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
