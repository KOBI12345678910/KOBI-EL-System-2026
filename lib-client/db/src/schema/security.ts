import { pgTable, serial, text, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { platformRolesTable } from "./platform-roles";

export const userMfaTable = pgTable("user_mfa", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 20 }).notNull().default("totp"),
  totpSecret: text("totp_secret"),
  totpVerified: boolean("totp_verified").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  backupCodes: jsonb("backup_codes").default([]),
  isEnabled: boolean("is_enabled").notNull().default(false),
  enabledAt: timestamp("enabled_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mfaChallengesTable = pgTable("mfa_challenges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 128 }).notNull().unique(),
  code: varchar("code", { length: 10 }),
  method: varchar("method", { length: 20 }).notNull().default("totp"),
  purpose: varchar("purpose", { length: 50 }).notNull().default("login"),
  isUsed: boolean("is_used").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ssoProvidersTable = pgTable("sso_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  type: varchar("type", { length: 20 }).notNull().default("oauth2"),
  isActive: boolean("is_active").notNull().default(true),
  isAutoProvision: boolean("is_auto_provision").notNull().default(true),
  defaultRoleId: integer("default_role_id").references(() => platformRolesTable.id),
  roleMappings: jsonb("role_mappings").default({}),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ssoSessionsTable = pgTable("sso_sessions", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => ssoProvidersTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  state: varchar("state", { length: 256 }),
  relayState: text("relay_state"),
  samlResponse: text("saml_response"),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const roleMfaRequirementsTable = pgTable("role_mfa_requirements", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  requireMfa: boolean("require_mfa").notNull().default(false),
  requireMfaForActions: jsonb("require_mfa_for_actions").default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const roleHierarchyTable = pgTable("role_hierarchy", {
  id: serial("id").primaryKey(),
  parentRoleId: integer("parent_role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  childRoleId: integer("child_role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
