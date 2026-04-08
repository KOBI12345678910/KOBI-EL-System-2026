import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  viewDefinitionsTable,
  formDefinitionsTable,
  actionDefinitionsTable,
  entityStatusesTable,
} from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  entityType?: string;
  entityId?: number;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  checkedAt: string;
}

export async function validateModuleForPublish(moduleId: number): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, moduleId));
  if (!mod) {
    return { valid: false, issues: [{ severity: "error", code: "MODULE_NOT_FOUND", message: `Module ${moduleId} not found` }], checkedAt: new Date().toISOString() };
  }

  if (!mod.name || mod.name.trim() === "") {
    issues.push({ severity: "error", code: "MISSING_NAME", message: "Module name is required", entityType: "module", entityId: moduleId, field: "name" });
  }
  if (!mod.slug || mod.slug.trim() === "") {
    issues.push({ severity: "error", code: "MISSING_SLUG", message: "Module slug is required", entityType: "module", entityId: moduleId, field: "slug" });
  }

  const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, moduleId));
  if (entities.length === 0) {
    issues.push({ severity: "warning", code: "NO_ENTITIES", message: "Module has no entities defined", entityType: "module", entityId: moduleId });
  }

  for (const entity of entities) {
    const entityIssues = await validateEntity(entity.id);
    issues.push(...entityIssues);
  }

  return {
    valid: issues.filter(i => i.severity === "error").length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export async function validateEntity(entityId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, entityId));
  if (!entity) {
    return [{ severity: "error", code: "ENTITY_NOT_FOUND", message: `Entity ${entityId} not found`, entityType: "entity", entityId }];
  }

  if (!entity.name || entity.name.trim() === "") {
    issues.push({ severity: "error", code: "MISSING_NAME", message: `Entity missing name`, entityType: "entity", entityId, field: "name" });
  }
  if (!entity.slug || entity.slug.trim() === "") {
    issues.push({ severity: "error", code: "MISSING_SLUG", message: `Entity missing slug`, entityType: "entity", entityId, field: "slug" });
  }

  const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entityId));
  if (fields.length === 0) {
    issues.push({ severity: "warning", code: "NO_FIELDS", message: `Entity '${entity.name}' has no fields`, entityType: "entity", entityId });
  }

  for (const field of fields) {
    if (!field.name || field.name.trim() === "") {
      issues.push({ severity: "error", code: "FIELD_MISSING_NAME", message: `Field ${field.id} missing name`, entityType: "field", entityId: field.id });
    }
    if (!field.fieldType || field.fieldType.trim() === "") {
      issues.push({ severity: "error", code: "FIELD_MISSING_TYPE", message: `Field '${field.name}' missing field type`, entityType: "field", entityId: field.id });
    }
    if (field.relatedEntityId) {
      const [relatedEntity] = await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, field.relatedEntityId));
      if (!relatedEntity) {
        issues.push({ severity: "error", code: "ORPHAN_REFERENCE", message: `Field '${field.name}' references non-existent entity ${field.relatedEntityId}`, entityType: "field", entityId: field.id });
      }
    }
  }

  const relations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, entityId));
  for (const rel of relations) {
    const [targetEntity] = await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, rel.targetEntityId));
    if (!targetEntity) {
      issues.push({ severity: "error", code: "ORPHAN_RELATION", message: `Relation '${rel.label}' targets non-existent entity ${rel.targetEntityId}`, entityType: "relation", entityId: rel.id });
    }
  }

  if (entity.hasStatus) {
    const statuses = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, entityId));
    if (statuses.length === 0) {
      issues.push({ severity: "warning", code: "STATUS_ENABLED_NO_VALUES", message: `Entity '${entity.name}' has status enabled but no status values defined`, entityType: "entity", entityId });
    }
  }

  const [viewCount] = await db.select({ count: count() }).from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entityId));
  if (Number(viewCount.count) === 0) {
    issues.push({ severity: "info", code: "NO_VIEWS", message: `Entity '${entity.name}' has no views defined`, entityType: "entity", entityId });
  }

  const [formCount] = await db.select({ count: count() }).from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entityId));
  if (Number(formCount.count) === 0) {
    issues.push({ severity: "info", code: "NO_FORMS", message: `Entity '${entity.name}' has no forms defined`, entityType: "entity", entityId });
  }

  return issues;
}

export async function detectConflicts(entityType: string, entityId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  if (entityType === "module") {
    const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, entityId));
    if (!mod) return [{ severity: "error", code: "NOT_FOUND", message: `Module ${entityId} not found` }];

    if (mod.status === "published") {
      issues.push({ severity: "warning", code: "ALREADY_PUBLISHED", message: `Module '${mod.name}' is already published. Publishing again will overwrite the live version.`, entityType: "module", entityId });
    }
  }

  if (entityType === "entity") {
    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, entityId));
    if (!entity) return [{ severity: "error", code: "NOT_FOUND", message: `Entity ${entityId} not found` }];

    const incomingRelations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.targetEntityId, entityId));
    if (incomingRelations.length > 0) {
      issues.push({
        severity: "info",
        code: "HAS_DEPENDENTS",
        message: `Entity '${entity.name}' is referenced by ${incomingRelations.length} relation(s). Changes may affect dependent entities.`,
        entityType: "entity",
        entityId,
      });
    }

    const lookupFields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.relatedEntityId, entityId));
    if (lookupFields.length > 0) {
      issues.push({
        severity: "info",
        code: "HAS_LOOKUP_DEPENDENTS",
        message: `Entity '${entity.name}' is referenced by ${lookupFields.length} lookup field(s) in other entities.`,
        entityType: "entity",
        entityId,
      });
    }
  }

  return issues;
}

export async function lintMetadata(moduleId?: number): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  const modules = moduleId
    ? await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, moduleId))
    : await db.select().from(platformModulesTable);

  for (const mod of modules) {
    if (!mod.name) issues.push({ severity: "error", code: "MODULE_NO_NAME", message: `Module ${mod.id} missing name`, entityType: "module", entityId: mod.id });
    if (!mod.slug) issues.push({ severity: "error", code: "MODULE_NO_SLUG", message: `Module ${mod.id} missing slug`, entityType: "module", entityId: mod.id });

    const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, mod.id));

    const slugSet = new Set<string>();
    for (const entity of entities) {
      if (slugSet.has(entity.slug)) {
        issues.push({ severity: "error", code: "DUPLICATE_ENTITY_SLUG", message: `Duplicate entity slug '${entity.slug}' in module '${mod.name}'`, entityType: "entity", entityId: entity.id });
      }
      slugSet.add(entity.slug);

      const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id));
      const fieldSlugSet = new Set<string>();
      for (const field of fields) {
        if (fieldSlugSet.has(field.slug)) {
          issues.push({ severity: "error", code: "DUPLICATE_FIELD_SLUG", message: `Duplicate field slug '${field.slug}' in entity '${entity.name}'`, entityType: "field", entityId: field.id });
        }
        fieldSlugSet.add(field.slug);
      }
    }
  }

  return {
    valid: issues.filter(i => i.severity === "error").length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}
