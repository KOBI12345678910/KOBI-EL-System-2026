import { pgTable, serial, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedPlacesTable = pgTable("saved_places", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedPlaceSchema = createInsertSchema(savedPlacesTable).omit({ id: true, createdAt: true });
export type InsertSavedPlace = z.infer<typeof insertSavedPlaceSchema>;
export type SavedPlace = typeof savedPlacesTable.$inferSelect;
