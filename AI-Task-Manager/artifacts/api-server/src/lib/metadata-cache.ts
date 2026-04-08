import NodeCache from "node-cache";
import { db } from "@workspace/db";
import { entityFieldsTable, entityStatusesTable, platformModulesTable, moduleEntitiesTable } from "@workspace/db/schema";
import { eq, inArray, asc } from "drizzle-orm";

const DEFAULT_TTL_S = 60;
const PERMISSIONS_TTL_S = 30;

export const metadataCache = new NodeCache({ useClones: false });

export async function getEntityFields(entityId: number) {
  const cacheKey = `entity_fields:${entityId}`;
  const cached = metadataCache.get<Awaited<ReturnType<typeof fetchEntityFields>>>(cacheKey);
  if (cached !== undefined) return cached;

  const fields = await fetchEntityFields(entityId);
  metadataCache.set(cacheKey, fields, DEFAULT_TTL_S);
  return fields;
}

async function fetchEntityFields(entityId: number) {
  return db.select().from(entityFieldsTable)
    .where(eq(entityFieldsTable.entityId, entityId))
    .orderBy(asc(entityFieldsTable.sortOrder));
}

export function invalidateEntityFields(entityId: number): void {
  metadataCache.del(`entity_fields:${entityId}`);
}

export async function getEntityStatuses(entityId: number) {
  const cacheKey = `entity_statuses:${entityId}`;
  const cached = metadataCache.get<Awaited<ReturnType<typeof fetchEntityStatuses>>>(cacheKey);
  if (cached !== undefined) return cached;

  const statuses = await fetchEntityStatuses(entityId);
  metadataCache.set(cacheKey, statuses, DEFAULT_TTL_S);
  return statuses;
}

async function fetchEntityStatuses(entityId: number) {
  return db.select().from(entityStatusesTable)
    .where(eq(entityStatusesTable.entityId, entityId))
    .orderBy(asc(entityStatusesTable.sortOrder));
}

export function invalidateEntityStatuses(entityId: number): void {
  metadataCache.del(`entity_statuses:${entityId}`);
}

export async function getRolePermissions(roleIds: number[]) {
  if (roleIds.length === 0) return [];
  const cacheKey = `role_permissions:${[...roleIds].sort().join(",")}`;
  const cached = metadataCache.get<Awaited<ReturnType<typeof fetchRoleRows>>>(cacheKey);
  if (cached !== undefined) return cached;

  const perms = await fetchRoleRows(roleIds);
  metadataCache.set(cacheKey, perms, PERMISSIONS_TTL_S);
  return perms;
}

async function fetchRoleRows(roleIds: number[]) {
  const { platformRolesTable } = await import("@workspace/db/schema");
  return db.select().from(platformRolesTable)
    .where(inArray(platformRolesTable.id, roleIds));
}

export function invalidateRolePermissions(): void {
  const keys = metadataCache.keys().filter(k => k.startsWith("role_permissions:"));
  if (keys.length > 0) metadataCache.del(keys);
}

const FALLBACK_MODULES = [
  { id: 1, name: "דשבורד", slug: "dashboard", description: "לוח בקרה ראשי", icon: "LayoutDashboard", status: "published", sortOrder: 1, moduleKey: "dashboard", createdAt: new Date(), updatedAt: new Date() },
  { id: 2, name: "מכירות", slug: "sales", description: "ניהול מכירות", icon: "ShoppingCart", status: "published", sortOrder: 2, moduleKey: "sales", createdAt: new Date(), updatedAt: new Date() },
  { id: 3, name: "רכש", slug: "procurement", description: "ניהול רכש", icon: "Package", status: "published", sortOrder: 3, moduleKey: "procurement", createdAt: new Date(), updatedAt: new Date() },
  { id: 4, name: "מלאי", slug: "inventory", description: "ניהול מלאי", icon: "Warehouse", status: "published", sortOrder: 4, moduleKey: "inventory", createdAt: new Date(), updatedAt: new Date() },
  { id: 5, name: "ייצור", slug: "production", description: "ניהול ייצור", icon: "Factory", status: "published", sortOrder: 5, moduleKey: "production", createdAt: new Date(), updatedAt: new Date() },
  { id: 6, name: "כספים", slug: "finance", description: "ניהול כספים", icon: "Banknote", status: "published", sortOrder: 6, moduleKey: "finance", createdAt: new Date(), updatedAt: new Date() },
  { id: 7, name: "משאבי אנוש", slug: "hr", description: "ניהול משאבי אנוש", icon: "Users", status: "published", sortOrder: 7, moduleKey: "hr", createdAt: new Date(), updatedAt: new Date() },
  { id: 8, name: "CRM", slug: "crm", description: "ניהול קשרי לקוחות", icon: "Contact", status: "published", sortOrder: 8, moduleKey: "crm", createdAt: new Date(), updatedAt: new Date() },
  { id: 9, name: "פרויקטים", slug: "projects", description: "ניהול פרויקטים", icon: "FolderKanban", status: "published", sortOrder: 9, moduleKey: "projects", createdAt: new Date(), updatedAt: new Date() },
  { id: 10, name: "הגדרות", slug: "settings", description: "הגדרות מערכת", icon: "Settings", status: "published", sortOrder: 20, moduleKey: "settings", createdAt: new Date(), updatedAt: new Date() },
];

export async function getPlatformModules() {
  const cacheKey = `platform_modules:all`;
  const cached = metadataCache.get<Awaited<ReturnType<typeof fetchPlatformModules>>>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const modules = await Promise.race([
      fetchPlatformModules(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DB timeout")), 3000)),
    ]);
    metadataCache.set(cacheKey, modules, DEFAULT_TTL_S);
    return modules;
  } catch {
    return FALLBACK_MODULES;
  }
}

async function fetchPlatformModules() {
  return db.select().from(platformModulesTable)
    .orderBy(asc(platformModulesTable.sortOrder));
}

export function invalidatePlatformModules(): void {
  metadataCache.del(`platform_modules:all`);
}

export async function getEntityModuleMapping(entityId: number): Promise<{ moduleId: number; moduleSlug: string } | null> {
  const cacheKey = `entity_module:${entityId}`;
  const cached = metadataCache.get<{ moduleId: number; moduleSlug: string } | null>(cacheKey);
  if (cached !== undefined) return cached;

  const [row] = await db.select({
    moduleId: moduleEntitiesTable.moduleId,
    moduleSlug: platformModulesTable.slug,
  })
    .from(moduleEntitiesTable)
    .innerJoin(platformModulesTable, eq(platformModulesTable.id, moduleEntitiesTable.moduleId))
    .where(eq(moduleEntitiesTable.id, entityId))
    .limit(1);

  const result: { moduleId: number; moduleSlug: string } | null = row
    ? { moduleId: row.moduleId, moduleSlug: row.moduleSlug }
    : null;
  metadataCache.set<{ moduleId: number; moduleSlug: string } | null>(cacheKey, result, DEFAULT_TTL_S);
  return result;
}

export function invalidateEntityModuleMapping(entityId: number): void {
  metadataCache.del(`entity_module:${entityId}`);
}

export function invalidateAllEntityModuleMappings(): void {
  const keys = metadataCache.keys().filter(k => k.startsWith("entity_module:"));
  if (keys.length > 0) metadataCache.del(keys);
}

export function getCacheStats() {
  return { keys: metadataCache.keys().length, stats: metadataCache.getStats() };
}
