import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const featureRequestsTable = pgTable("feature_requests", {
  id: serial("id").primaryKey(),
  requestNumber: text("request_number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  submittedBy: text("submitted_by"),
  source: text("source").notNull().default("internal"),
  status: text("status").notNull().default("new"),
  priority: text("priority").notNull().default("medium"),
  votes: integer("votes").notNull().default(0),
  linkedRoadmapItemId: integer("linked_roadmap_item_id"),
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
