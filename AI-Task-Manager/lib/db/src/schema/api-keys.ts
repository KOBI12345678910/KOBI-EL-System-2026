import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  keyName: text("key_name").notNull(),
  userId: text("user_id").notNull(),
  scopes: jsonb("scopes").default([]),
  permissions: jsonb("permissions").default([]),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const apiKeyUsageTable = pgTable("api_key_usage", {
  id: serial("id").primaryKey(),
  keyId: serial("key_id").references(() => apiKeysTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint"),
  method: text("method"),
  statusCode: serial("status_code"),
  responseTime: serial("response_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const apiRateLimitsTable = pgTable("api_rate_limits", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  apiKeyId: serial("api_key_id"),
  endpoint: text("endpoint"),
  requestsPerMinute: serial("requests_per_minute").default(200),
  requestsPerHour: serial("requests_per_hour").default(10000),
  isHeavyEndpoint: boolean("is_heavy_endpoint").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
