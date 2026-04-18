import { pgTable, serial, text, integer, boolean, timestamp, jsonb, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { platformRolesTable } from "./platform-roles";

/**
 * BASH44 Enterprise Permission System
 *
 * RBAC + Data Scopes + Field-level + Approval Limits + Full Audit
 *
 * Resolution order:
 * 1. system_super_admin → full access
 * 2. explicit_user_deny → block
 * 3. explicit_user_allow → allow
 * 4. role_deny → block
 * 5. role_allow → allow
 * 6. data_scope_check → filter rows
 * 7. approval_limit_check → limit amounts
 * 8. default → deny
 */

// ═══════════════════════════════════════════════════════════════
// PERMISSIONS CATALOG — all permission codes in the system
// ═══════════════════════════════════════════════════════════════
export const permissionsCatalogTable = pgTable("permissions_catalog", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  code: varchar("code", { length: 150 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nameHe: varchar("name_he", { length: 255 }),
  module: varchar("module", { length: 100 }),
  screen: varchar("screen", { length: 100 }),
  action: varchar("action", { length: 100 }),
  fieldName: varchar("field_name", { length: 100 }),
  permissionType: varchar("permission_type", { length: 50 }).notNull().default("action_access"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_permissions_catalog_tenant_code").on(table.tenantId, table.code),
]);

// ═══════════════════════════════════════════════════════════════
// USER ROLES — many-to-many with validity period
// ═══════════════════════════════════════════════════════════════
export const userRolesTable = pgTable("user_roles_v2", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  isActive: boolean("is_active").notNull().default(true),
  assignedBy: integer("assigned_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// USER PERMISSION OVERRIDES — direct per-user allow/deny
// ═══════════════════════════════════════════════════════════════
export const userPermissionOverridesTable = pgTable("user_permission_overrides", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissionsCatalogTable.id, { onDelete: "cascade" }),
  allow: boolean("allow").notNull().default(true),
  conditionsJson: jsonb("conditions_json"),
  overrideMode: varchar("override_mode", { length: 30 }).notNull().default("OVERRIDE"),
  reason: text("reason"),
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  grantedBy: integer("granted_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// APPROVAL POLICIES — amount-based approval requirements
// ═══════════════════════════════════════════════════════════════
export const approvalPoliciesTable = pgTable("approval_policies_v2", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  approvalAction: varchar("approval_action", { length: 100 }).notNull().default("approve"),
  minAmount: integer("min_amount").default(0),
  maxAmount: integer("max_amount"),
  requiredRoleId: integer("required_role_id").references(() => platformRolesTable.id),
  requiredRoleCode: varchar("required_role_code", { length: 100 }),
  escalationRoleId: integer("escalation_role_id").references(() => platformRolesTable.id),
  escalationRoleCode: varchar("escalation_role_code", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// PERMISSION AUDIT LOG — every critical action logged
// ═══════════════════════════════════════════════════════════════
export const permissionAuditLogTable = pgTable("permission_audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id").references(() => usersTable.id),
  targetUserId: integer("target_user_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: integer("entity_id"),
  permissionCode: varchar("permission_code", { length: 150 }),
  roleId: integer("role_id"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  result: varchar("result", { length: 30 }).notNull().default("SUCCESS"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// FIELD PERMISSIONS — field-level visibility per role
// ═══════════════════════════════════════════════════════════════
export const fieldPermissionsTable = pgTable("field_permissions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  roleId: integer("role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  module: varchar("module", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  fieldName: varchar("field_name", { length: 100 }).notNull(),
  visibility: varchar("visibility", { length: 20 }).notNull().default("write"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// DATA SCOPE ASSIGNMENTS — row-level filtering per user/role
// ═══════════════════════════════════════════════════════════════
export const dataScopeAssignmentsTable = pgTable("data_scope_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  roleId: integer("role_id").references(() => platformRolesTable.id, { onDelete: "cascade" }),
  scopeType: varchar("scope_type", { length: 50 }).notNull(),
  scopeValue: varchar("scope_value", { length: 100 }).notNull(),
  accessMode: varchar("access_mode", { length: 30 }).notNull().default("ALLOW"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
