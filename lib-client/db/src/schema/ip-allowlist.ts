import { pgTable, serial, text, boolean, timestamp, varchar, integer } from "drizzle-orm/pg-core";

export const ipAllowlistTable = pgTable("ip_allowlist", {
  id: serial("id").primaryKey(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  cidrMask: integer("cidr_mask"),
  label: text("label"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  addedBy: integer("added_by"),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  hitCount: integer("hit_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
