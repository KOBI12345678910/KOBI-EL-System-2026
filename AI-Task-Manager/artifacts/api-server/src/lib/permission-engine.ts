import { db, withRetry } from "@workspace/db";
import { platformRolesTable, roleAssignmentsTable, platformModulesTable, moduleEntitiesTable, dataScopeRulesTable, recordAuditLogTable, usersTable } from "@workspace/db/schema";
import { eq, and, inArray, sql, type SQL } from "drizzle-orm";
import { getEntityModuleMapping, getRolePermissions } from "./metadata-cache";

export interface ModulePermission {
  view: boolean;
  manage: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
}

export interface EntityPermission {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

export type FieldVisibility = "write" | "read" | "hidden";

export interface ActionPermission {
  execute: boolean;
}

export interface DataScopeRule {
  id: number;
  roleId: number;
  entityId: number;
  scopeType: string;
  field: string | null;
  operator: string | null;
  value: string | null;
  description: string | null;
  isActive: boolean;
}

export interface RolePermissionConfig {
  isSuperAdmin?: boolean;
  builderAccess?: boolean;
  modules: Record<string, ModulePermission>;
  entities: Record<string, EntityPermission>;
  fields: Record<string, Record<string, FieldVisibility>>;
  actions: Record<string, ActionPermission>;
}

export interface ResolvedPermissions {
  isSuperAdmin: boolean;
  builderAccess: boolean;
  roles: string[];
  roleIds: number[];
  department: string | null;
  modules: Record<string, ModulePermission>;
  entities: Record<string, EntityPermission>;
  fields: Record<string, Record<string, FieldVisibility>>;
  actions: Record<string, ActionPermission>;
}

const EMPTY_PERMISSIONS: ResolvedPermissions = {
  isSuperAdmin: false,
  builderAccess: false,
  roles: [],
  roleIds: [],
  department: null,
  modules: {},
  entities: {},
  fields: {},
  actions: {},
};

function mergePermissions(target: ResolvedPermissions, roleConfig: RolePermissionConfig): void {
  if (roleConfig.isSuperAdmin) {
    target.isSuperAdmin = true;
  }
  if (roleConfig.builderAccess) {
    target.builderAccess = true;
  }

  for (const [moduleId, perm] of Object.entries(roleConfig.modules || {})) {
    if (!target.modules[moduleId]) {
      target.modules[moduleId] = { view: false, manage: false, create: false, edit: false, delete: false };
    }
    if (perm.view) target.modules[moduleId].view = true;
    if (perm.manage) target.modules[moduleId].manage = true;
    if (perm.create) target.modules[moduleId].create = true;
    if (perm.edit) target.modules[moduleId].edit = true;
    if (perm.delete) target.modules[moduleId].delete = true;
  }

  for (const [entityId, perm] of Object.entries(roleConfig.entities || {})) {
    if (!target.entities[entityId]) {
      target.entities[entityId] = { create: false, read: false, update: false, delete: false };
    }
    if (perm.create) target.entities[entityId].create = true;
    if (perm.read) target.entities[entityId].read = true;
    if (perm.update) target.entities[entityId].update = true;
    if (perm.delete) target.entities[entityId].delete = true;
  }

  for (const [entityId, fieldMap] of Object.entries(roleConfig.fields || {})) {
    if (!target.fields[entityId]) {
      target.fields[entityId] = {};
    }
    for (const [fieldSlug, visibility] of Object.entries(fieldMap)) {
      const current = target.fields[entityId][fieldSlug];
      if (!current || visibilityRank(visibility) > visibilityRank(current)) {
        target.fields[entityId][fieldSlug] = visibility;
      }
    }
  }

  for (const [actionId, perm] of Object.entries(roleConfig.actions || {})) {
    if (!target.actions[actionId]) {
      target.actions[actionId] = { execute: false };
    }
    if (perm.execute) target.actions[actionId].execute = true;
  }
}

function visibilityRank(v: FieldVisibility): number {
  switch (v) {
    case "write": return 2;
    case "read": return 1;
    case "hidden": return 0;
    default: return 0;
  }
}

export async function resolveUserPermissions(userId: string): Promise<ResolvedPermissions> {
  if (!userId) {
    return { ...EMPTY_PERMISSIONS, roles: [], roleIds: [] };
  }

  const [userRow] = await db.select({ isSuperAdmin: usersTable.isSuperAdmin, department: usersTable.department })
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)));

  const userDepartment = userRow?.department || null;

  if (userRow?.isSuperAdmin) {
    return {
      isSuperAdmin: true,
      builderAccess: true,
      roles: ["superAdmin"],
      roleIds: [],
      department: userDepartment,
      modules: {},
      entities: {},
      fields: {},
      actions: {},
    };
  }

  const assignments = await db.select()
    .from(roleAssignmentsTable)
    .where(eq(roleAssignmentsTable.userId, userId));

  if (assignments.length === 0) {
    return { ...EMPTY_PERMISSIONS, roles: [], roleIds: [] };
  }

  const assignedRoleIds = assignments.map(a => a.roleId);
  const allRoles = await getRolePermissions(assignedRoleIds);
  const activeAssigned = allRoles.filter(r => r.isActive);

  const inheritedRoleIds = new Set<number>(assignedRoleIds);
  const toResolve = [...activeAssigned];
  while (toResolve.length > 0) {
    const current = toResolve.shift()!;
    const parentId = (current as any).parentRoleId as number | null;
    if (parentId && !inheritedRoleIds.has(parentId)) {
      inheritedRoleIds.add(parentId);
      try {
        const parentRoles = await getRolePermissions([parentId]);
        const activeParents = parentRoles.filter(r => r.isActive);
        toResolve.push(...activeParents);
      } catch { }
    }
  }

  const allInheritedRoleIds = Array.from(inheritedRoleIds);
  const allInheritedRoles = await getRolePermissions(allInheritedRoleIds);
  const roles = allInheritedRoles.filter(r => r.isActive);
  const roleIds = assignedRoleIds;

  const result: ResolvedPermissions = {
    isSuperAdmin: false,
    builderAccess: false,
    roles: roles.map(r => r.slug),
    roleIds: roles.map(r => r.id),
    department: userDepartment,
    modules: {},
    entities: {},
    fields: {},
    actions: {},
  };

  for (const role of roles) {
    const settings = (role.settings as Record<string, unknown>) || {};
    const permConfig: RolePermissionConfig = {
      isSuperAdmin: (settings.isSuperAdmin as boolean) ?? false,
      builderAccess: (settings.builderAccess as boolean) ?? false,
      modules: (settings.modules as Record<string, ModulePermission>) || {},
      entities: (settings.entities as Record<string, EntityPermission>) || {},
      fields: (settings.fields as Record<string, Record<string, FieldVisibility>>) || {},
      actions: (settings.actions as Record<string, ActionPermission>) || {},
    };
    mergePermissions(result, permConfig);
  }

  return result;
}

export async function resolveDataScopeRules(roleIds: number[], entityId: number): Promise<DataScopeRule[]> {
  if (roleIds.length === 0) return [];

  const rules = await db.select()
    .from(dataScopeRulesTable)
    .where(and(
      inArray(dataScopeRulesTable.roleId, roleIds),
      eq(dataScopeRulesTable.entityId, entityId),
      eq(dataScopeRulesTable.isActive, true),
    ));

  return rules;
}

export interface ScopeResult {
  denyAll: boolean;
  conditions: SQL[];
}

export async function getUserDepartment(userId: string): Promise<string | null> {
  if (!userId) return null;
  const [user] = await db.select({ department: usersTable.department })
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)));
  return user?.department || null;
}

export function buildScopeConditions(rules: DataScopeRule[], userId: string, userDepartment?: string | null): ScopeResult {
  if (rules.length === 0) {
    return { denyAll: true, conditions: [] };
  }

  const hasAllScope = rules.some(r => r.scopeType === "all");
  if (hasAllScope) return { denyAll: false, conditions: [] };

  const conditions: SQL[] = [];

  for (const rule of rules) {
    switch (rule.scopeType) {
      case "own":
        conditions.push(sql`(created_by = ${userId} OR assigned_to = ${userId})`);
        break;
      case "department":
        if (rule.value) {
          const resolvedDept = rule.value === "{{current_user_department}}" ? (userDepartment || "") : rule.value;
          const field = rule.field || "department";
          conditions.push(sql`(data->>${field} = ${resolvedDept} OR assigned_to = ${userId} OR created_by = ${userId})`);
        }
        break;
      case "field_equals":
        if (rule.field && rule.value !== null) {
          const resolvedValue = rule.value === "{{current_user}}" ? userId : rule.value;
          conditions.push(sql`(data->>${rule.field} = ${resolvedValue} OR assigned_to = ${userId} OR created_by = ${userId})`);
        }
        break;
      case "field_contains":
        if (rule.field && rule.value !== null) {
          const resolvedValue = rule.value === "{{current_user}}" ? userId : rule.value;
          conditions.push(sql`(data->>${rule.field} ILIKE ${'%' + resolvedValue + '%'})`);
        }
        break;
      case "field_in":
        if (rule.field && rule.value !== null) {
          const values = rule.value.split(",").map(v => v.trim() === "{{current_user}}" ? userId : v.trim());
          const placeholders = values.map(v => sql`${v}`);
          conditions.push(sql`(data->>${rule.field} IN (${sql.join(placeholders, sql`, `)}))`);
        }
        break;
      case "assigned_to_me":
        conditions.push(sql`assigned_to = ${userId}`);
        break;
      case "created_by_me":
        conditions.push(sql`created_by = ${userId}`);
        break;
      case "team":
        if (rule.value) {
          const resolvedTeam = rule.value === "{{current_user}}" ? userId : rule.value;
          conditions.push(sql`assigned_team = ${resolvedTeam}`);
        }
        break;
    }
  }

  if (conditions.length === 0) {
    return { denyAll: true, conditions: [] };
  }

  return { denyAll: false, conditions };
}

export async function logPermissionDenied(
  userId: string,
  action: string,
  entityId?: number,
  recordId?: number,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(recordAuditLogTable).values({
      entityId: entityId || 0,
      recordId: recordId || 0,
      action: "permission_denied",
      performedBy: userId,
      changes: {
        deniedAction: action,
        entityId,
        recordId,
        timestamp: new Date().toISOString(),
        ...details,
      },
    });
  } catch {
  }
}

export function checkModuleAccess(
  permissions: ResolvedPermissions,
  moduleId: number | string,
  level: "view" | "manage" = "view",
): boolean {
  if (permissions.isSuperAdmin) return true;
  const modulePerm = permissions.modules[String(moduleId)];
  if (!modulePerm) return false;
  if (level === "view") return modulePerm.view || modulePerm.manage;
  return modulePerm.manage;
}

export function checkEntityAccess(
  permissions: ResolvedPermissions,
  entityId: number | string,
  action: "create" | "read" | "update" | "delete",
): boolean {
  if (permissions.isSuperAdmin) return true;
  const entityPerm = permissions.entities[String(entityId)];
  if (!entityPerm) return false;
  return entityPerm[action] ?? false;
}

export function getFieldPermission(
  permissions: ResolvedPermissions,
  entityId: number | string,
  fieldSlug: string,
): FieldVisibility {
  if (permissions.isSuperAdmin) return "write";
  const entityFields = permissions.fields[String(entityId)];
  if (!entityFields) return "write";
  return entityFields[fieldSlug] ?? "write";
}

export function checkActionAccess(
  permissions: ResolvedPermissions,
  actionId: number | string,
): boolean {
  if (permissions.isSuperAdmin) return true;
  const actionPerm = permissions.actions[String(actionId)];
  if (!actionPerm) return false;
  return actionPerm.execute;
}

export function checkModuleCrud(
  permissions: ResolvedPermissions,
  moduleId: number | string,
  action: "create" | "edit" | "delete",
): boolean {
  if (permissions.isSuperAdmin) return true;
  const modulePerm = permissions.modules[String(moduleId)];
  if (!modulePerm) return false;
  if (modulePerm.manage) return true;
  return modulePerm[action] ?? false;
}

export async function checkModuleCrudForEntity(
  permissions: ResolvedPermissions,
  entityId: number,
  action: "view" | "create" | "edit" | "delete",
): Promise<boolean> {
  if (permissions.isSuperAdmin) return true;

  const mapping = await getEntityModuleMapping(entityId);
  if (!mapping) return false;

  const { moduleId, moduleSlug } = mapping;

  if (action === "view") {
    const checkView = (key: string | number) => {
      const mp = permissions.modules[String(key)];
      return mp ? (mp.view || mp.manage) : false;
    };
    return checkView(moduleSlug) || checkView(moduleId);
  }

  const bySlug = checkModuleCrud(permissions, moduleSlug, action);
  if (bySlug) return true;
  return checkModuleCrud(permissions, moduleId, action);
}

export function checkBuilderAccess(permissions: ResolvedPermissions): boolean {
  return permissions.isSuperAdmin || permissions.builderAccess;
}

export function filterFieldsForRead(
  permissions: ResolvedPermissions,
  entityId: number | string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (permissions.isSuperAdmin) return data;
  const entityFields = permissions.fields[String(entityId)];
  if (!entityFields) return data;

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const visibility = entityFields[key] ?? "write";
    if (visibility !== "hidden") {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function getReadOnlyFields(
  permissions: ResolvedPermissions,
  entityId: number | string,
): string[] {
  if (permissions.isSuperAdmin) return [];
  const entityFields = permissions.fields[String(entityId)];
  if (!entityFields) return [];

  return Object.entries(entityFields)
    .filter(([_, visibility]) => visibility === "read")
    .map(([slug]) => slug);
}

export function validateWriteFields(
  permissions: ResolvedPermissions,
  entityId: number | string,
  data: Record<string, unknown>,
): string[] {
  if (permissions.isSuperAdmin) return [];
  const entityFields = permissions.fields[String(entityId)];
  if (!entityFields) return [];

  const violations: string[] = [];
  for (const key of Object.keys(data)) {
    const visibility = entityFields[key];
    if (visibility === "read" || visibility === "hidden") {
      violations.push(key);
    }
  }
  return violations;
}

let _cachedHasAssignments: boolean | null = null;
let _cacheTime = 0;
const CACHE_TTL = 30000;
const ERROR_CACHE_TTL = 60000;

export async function checkAnyRoleAssignments(): Promise<boolean> {
  const now = Date.now();
  if (_cachedHasAssignments !== null && now - _cacheTime < CACHE_TTL) {
    return _cachedHasAssignments;
  }
  try {
    const result = await withRetry(
      () => db.select({ id: roleAssignmentsTable.id }).from(roleAssignmentsTable).limit(1),
      { label: "checkAnyRoleAssignments", maxAttempts: 2, baseDelayMs: 300 }
    );
    _cachedHasAssignments = result.length > 0;
    _cacheTime = now;
    return _cachedHasAssignments;
  } catch (err) {
    console.error("[PermissionEngine] checkAnyRoleAssignments DB error (using cached/fallback):", err instanceof Error ? err.message : err);
    const fallback = _cachedHasAssignments !== null ? _cachedHasAssignments : false;
    _cachedHasAssignments = fallback;
    _cacheTime = now + ERROR_CACHE_TTL - CACHE_TTL;
    return fallback;
  }
}

export function invalidateAssignmentCache(): void {
  _cachedHasAssignments = null;
}

export async function ensureSuperAdminRole(): Promise<void> {
  const [existing] = await db.select()
    .from(platformRolesTable)
    .where(eq(platformRolesTable.slug, "super-admin"));

  if (!existing) {
    await db.insert(platformRolesTable).values({
      name: "Super Admin",
      nameHe: "מנהל על",
      nameEn: "Super Admin",
      slug: "super-admin",
      description: "Full access to all platform features",
      color: "red",
      isSystem: true,
      isActive: true,
      settings: {
        isSuperAdmin: true,
        builderAccess: true,
        modules: {},
        entities: {},
        fields: {},
        actions: {},
      },
    });
  }
}

export async function ensureDefaultWorkerRoles(): Promise<void> {
  const defaultRoles = [
    {
      name: "מנהל מפעל",
      nameHe: "מנהל מפעל",
      nameEn: "Factory Manager",
      slug: "factory-manager",
      description: "גישה לייצור, מלאי, רכש, פרויקטים, דוחות",
      color: "blue",
      settings: {
        isSuperAdmin: false,
        builderAccess: false,
        modules: {
          "production": { view: true, manage: true, create: true, edit: true, delete: true },
          "procurement-inventory": { view: true, manage: true, create: true, edit: true, delete: true },
          "projects": { view: true, manage: true, create: true, edit: true, delete: false },
          "reports": { view: true, manage: false },
          "approvals": { view: true, manage: true, create: true, edit: true, delete: false },
          "documents": { view: true, manage: false },
          "installations": { view: true, manage: false },
          "field-measurements": { view: true, manage: false },
        },
        entities: {},
        fields: {},
        actions: {},
      },
    },
    {
      name: "חשב / רואה חשבון",
      nameHe: "חשב / רואה חשבון",
      nameEn: "Accountant",
      slug: "accountant",
      description: "גישה מלאה לכספים והנהלת חשבונות, דוחות",
      color: "green",
      settings: {
        isSuperAdmin: false,
        builderAccess: false,
        modules: {
          "finance": { view: true, manage: true, create: true, edit: true, delete: true },
          "accounting": { view: true, manage: true, create: true, edit: true, delete: true },
          "reports": { view: true, manage: false },
          "pricing-billing": { view: true, manage: true, create: true, edit: true, delete: false },
          "documents": { view: true, manage: false },
        },
        entities: {},
        fields: {},
        actions: {},
      },
    },
    {
      name: "איש מכירות",
      nameHe: "איש מכירות",
      nameEn: "Sales Representative",
      slug: "sales-rep",
      description: "גישה ללקוחות, CRM, מכירות, הצעות מחיר",
      color: "orange",
      settings: {
        isSuperAdmin: false,
        builderAccess: false,
        modules: {
          "customers-sales": { view: true, manage: true, create: true, edit: true, delete: false },
          "pricing-billing": { view: true, manage: false },
          "reports": { view: true, manage: false },
          "documents": { view: true, manage: false },
          "meetings-calendar": { view: true, manage: true, create: true, edit: true, delete: true },
          "meetings": { view: true, manage: true, create: true, edit: true, delete: true },
        },
        entities: {},
        fields: {},
        actions: {},
      },
    },
    {
      name: "עובד ייצור",
      nameHe: "עובד ייצור",
      nameEn: "Production Worker",
      slug: "production-worker",
      description: "גישה לייצור בלבד — צפייה וביצוע הוראות עבודה",
      color: "yellow",
      settings: {
        isSuperAdmin: false,
        builderAccess: false,
        modules: {
          "production": { view: true, manage: false, create: false, edit: true, delete: false },
        },
        entities: {},
        fields: {},
        actions: {},
      },
    },
    {
      name: "מחסנאי",
      nameHe: "מחסנאי",
      nameEn: "Warehouse Worker",
      slug: "warehouse-worker",
      description: "גישה למלאי ורכש — קבלת סחורה, ניהול מלאי",
      color: "cyan",
      settings: {
        isSuperAdmin: false,
        builderAccess: false,
        modules: {
          "procurement-inventory": { view: true, manage: true, create: true, edit: true, delete: false },
          "import-operations": { view: true, manage: false },
        },
        entities: {},
        fields: {},
        actions: {},
      },
    },
    {
      name: "מנהל רכש",
      nameHe: "מנהל רכש",
      nameEn: "Procurement Manager",
      slug: "procurement-manager",
      description: "גישה לרכש, ספקים, מלאי, יבוא",
      color: "violet",
      settings: {
        isSuperAdmin: false,
        builderAccess: false,
        modules: {
          "procurement-inventory": { view: true, manage: true, create: true, edit: true, delete: true },
          "import-operations": { view: true, manage: true, create: true, edit: true, delete: true },
          "finance": { view: true, manage: false },
          "reports": { view: true, manage: false },
          "documents": { view: true, manage: false },
          "approvals": { view: true, manage: false },
        },
        entities: {},
        fields: {},
        actions: {},
      },
    },
    {
      name: "מנהל משאבי אנוש",
      nameHe: "מנהל משאבי אנוש",
      nameEn: "HR Manager",
      slug: "hr-manager",
      description: "גישה למשאבי אנוש, נוכחות, שכר, הדרכות",
      color: "pink",
      settings: {
        isSuperAdmin: false,
        builderAccess: false,
        modules: {
          "hr": { view: true, manage: true, create: true, edit: true, delete: true },
          "reports": { view: true, manage: false },
          "documents": { view: true, manage: false },
        },
        entities: {},
        fields: {},
        actions: {},
      },
    },
  ];

  for (const role of defaultRoles) {
    const [existing] = await db.select()
      .from(platformRolesTable)
      .where(eq(platformRolesTable.slug, role.slug));

    if (!existing) {
      await db.insert(platformRolesTable).values({
        name: role.name,
        nameHe: role.nameHe,
        nameEn: role.nameEn,
        slug: role.slug,
        description: role.description,
        color: role.color,
        isSystem: true,
        isActive: true,
        settings: role.settings,
      });
    }
  }
}

export async function ensureExecutiveManagerRole(): Promise<void> {
  let [existing] = await db.select()
    .from(platformRolesTable)
    .where(eq(platformRolesTable.slug, "executive-manager"));

  if (!existing) {
    [existing] = await db.select()
      .from(platformRolesTable)
      .where(eq(platformRolesTable.name, "מנהל הנהלה"));
  }

  if (!existing) {
    const rows = await db.select()
      .from(platformRolesTable)
      .where(eq(platformRolesTable.nameHe, "מנהל הנהלה"));
    existing = rows[0];
  }

  if (existing) {
    const currentSettings = (existing.settings as Record<string, unknown>) || {};
    if (!currentSettings.isSuperAdmin || !currentSettings.builderAccess) {
      await db.update(platformRolesTable)
        .set({
          settings: {
            ...currentSettings,
            isSuperAdmin: true,
            builderAccess: true,
          },
        })
        .where(eq(platformRolesTable.id, existing.id));
    }
  } else {
    await db.insert(platformRolesTable).values({
      name: "מנהל הנהלה",
      nameHe: "מנהל הנהלה",
      nameEn: "Executive Manager",
      slug: "executive-manager",
      description: "Full executive access to all platform features and system builder",
      color: "purple",
      isSystem: true,
      isActive: true,
      settings: {
        isSuperAdmin: true,
        builderAccess: true,
        modules: {},
        entities: {},
        fields: {},
        actions: {},
      },
    });
  }
}
