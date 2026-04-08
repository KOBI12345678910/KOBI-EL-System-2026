import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  actionDefinitionsTable,
  platformWidgetsTable,
  platformWorkflowsTable,
  systemMenuItemsTable,
  systemPermissionsTable,
  systemStatusSetsTable,
  systemStatusValuesTable,
  systemCategoriesTable,
  systemDashboardPagesTable,
  entityStatusesTable,
} from "@workspace/db/schema";
import { eq, count, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/claude/management/status", async (_req, res) => {
  const [modules] = await db.select({ count: count() }).from(platformModulesTable);
  const [activeModules] = await db.select({ count: count() }).from(platformModulesTable).where(eq(platformModulesTable.status, "active"));
  const [draftModules] = await db.select({ count: count() }).from(platformModulesTable).where(eq(platformModulesTable.status, "draft"));
  const [entities] = await db.select({ count: count() }).from(moduleEntitiesTable);
  const [fields] = await db.select({ count: count() }).from(entityFieldsTable);
  const [relations] = await db.select({ count: count() }).from(entityRelationsTable);
  const [forms] = await db.select({ count: count() }).from(formDefinitionsTable);
  const [views] = await db.select({ count: count() }).from(viewDefinitionsTable);
  const [actions] = await db.select({ count: count() }).from(actionDefinitionsTable);
  const [widgets] = await db.select({ count: count() }).from(platformWidgetsTable);
  const [workflows] = await db.select({ count: count() }).from(platformWorkflowsTable);

  res.json({
    overview: {
      totalModules: modules.count,
      activeModules: activeModules.count,
      draftModules: draftModules.count,
      totalEntities: entities.count,
      totalFields: fields.count,
      totalRelations: relations.count,
      totalForms: forms.count,
      totalViews: views.count,
      totalActions: actions.count,
      totalWidgets: widgets.count,
      totalWorkflows: workflows.count,
    },
    timestamp: new Date().toISOString(),
  });
});

router.get("/claude/management/modules", async (_req, res) => {
  const allModules = await db.select().from(platformModulesTable);

  const moduleStatuses = await Promise.all(
    allModules.map(async (mod) => {
      const [entCount] = await db.select({ count: count() }).from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, mod.id));
      return {
        id: mod.id,
        name: mod.name,
        slug: mod.slug,
        status: mod.status,
        entityCount: entCount.count,
        isSystem: mod.isSystem,
        showInSidebar: mod.showInSidebar,
        showInDashboard: mod.showInDashboard,
      };
    })
  );

  const active = moduleStatuses.filter((m) => m.status === "active");
  const draft = moduleStatuses.filter((m) => m.status === "draft");
  const incomplete = moduleStatuses.filter((m) => m.status !== "active" && m.status !== "draft");

  res.json({ active, draft, incomplete, total: moduleStatuses.length });
});

router.get("/claude/management/health", async (_req, res) => {
  const issues: Array<{ severity: string; code: string; message: string; entityType?: string; entityId?: number }> = [];

  const allModules = await db.select().from(platformModulesTable);
  for (const mod of allModules) {
    const [entCount] = await db.select({ count: count() }).from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, mod.id));
    if (entCount.count === 0) {
      issues.push({ severity: "warning", code: "EMPTY_MODULE", message: `Module "${mod.name}" has no entities`, entityType: "module", entityId: mod.id });
    }
  }

  const allEntities = await db.select().from(moduleEntitiesTable);
  for (const entity of allEntities) {
    const [fieldCount] = await db.select({ count: count() }).from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id));
    if (fieldCount.count === 0) {
      issues.push({ severity: "warning", code: "ENTITY_NO_FIELDS", message: `Entity "${entity.name}" has no fields`, entityType: "entity", entityId: entity.id });
    }

    const [formCount] = await db.select({ count: count() }).from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entity.id));
    if (formCount.count === 0) {
      issues.push({ severity: "info", code: "ENTITY_NO_FORMS", message: `Entity "${entity.name}" has no form definitions`, entityType: "entity", entityId: entity.id });
    }

    const [viewCount] = await db.select({ count: count() }).from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entity.id));
    if (viewCount.count === 0) {
      issues.push({ severity: "info", code: "ENTITY_NO_VIEWS", message: `Entity "${entity.name}" has no view definitions`, entityType: "entity", entityId: entity.id });
    }

    if (!entity.primaryDisplayField) {
      issues.push({ severity: "warning", code: "MISSING_DISPLAY_FIELD", message: `Entity "${entity.name}" has no primary display field`, entityType: "entity", entityId: entity.id });
    }
  }

  let menuItems: any[] = [];
  try {
    menuItems = await db.select().from(systemMenuItemsTable);
  } catch (err: any) {
    issues.push({ severity: "warning", code: "QUERY_FAILED", message: `Failed to query menu items: ${err?.message || "unknown"}` });
  }
  const moduleIds = new Set(allModules.map((m) => m.id));
  for (const item of menuItems) {
    if (item.moduleId && !moduleIds.has(item.moduleId)) {
      issues.push({ severity: "error", code: "BROKEN_MENU_BINDING", message: `Menu item "${item.label}" references non-existent module ${item.moduleId}`, entityType: "menu_item", entityId: item.id });
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const infos = issues.filter((i) => i.severity === "info").length;

  res.json({
    healthy: errors === 0,
    summary: { errors, warnings, infos, total: issues.length },
    issues,
    checkedAt: new Date().toISOString(),
  });
});

router.get("/claude/management/completeness", async (_req, res) => {
  const allEntities = await db.select().from(moduleEntitiesTable);

  const completeness = await Promise.all(
    allEntities.map(async (entity) => {
      const [fieldCount] = await db.select({ count: count() }).from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id));
      const [formCount] = await db.select({ count: count() }).from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entity.id));
      const [viewCount] = await db.select({ count: count() }).from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entity.id));
      const [statusCount] = await db.select({ count: count() }).from(entityStatusesTable).where(eq(entityStatusesTable.entityId, entity.id));
      const [permCount] = await db.select({ count: count() }).from(systemPermissionsTable).where(eq(systemPermissionsTable.entityId, entity.id));

      const hasFields = fieldCount.count > 0;
      const hasForms = formCount.count > 0;
      const hasViews = viewCount.count > 0;
      const hasStatuses = !entity.hasStatus || statusCount.count > 0;
      const hasPermissions = permCount.count > 0;
      const hasDisplayField = !!entity.primaryDisplayField;

      const checks = [hasFields, hasForms, hasViews, hasStatuses, hasPermissions, hasDisplayField];
      const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);

      return {
        entityId: entity.id,
        entityName: entity.name,
        moduleId: entity.moduleId,
        score,
        checks: { hasFields, hasForms, hasViews, hasStatuses, hasPermissions, hasDisplayField },
      };
    })
  );

  const avgScore = completeness.length > 0 ? Math.round(completeness.reduce((s, c) => s + c.score, 0) / completeness.length) : 0;

  res.json({
    averageScore: avgScore,
    entities: completeness,
    checkedAt: new Date().toISOString(),
  });
});

router.get("/claude/management/integrity", async (_req, res) => {
  const issues: Array<{ severity: string; code: string; message: string }> = [];

  const relations = await db.select().from(entityRelationsTable);
  const entityIds = new Set((await db.select({ id: moduleEntitiesTable.id }).from(moduleEntitiesTable)).map((e) => e.id));

  for (const rel of relations) {
    if (!entityIds.has(rel.sourceEntityId)) {
      issues.push({ severity: "error", code: "BROKEN_RELATION_SOURCE", message: `Relation "${rel.label}" references missing source entity ${rel.sourceEntityId}` });
    }
    if (!entityIds.has(rel.targetEntityId)) {
      issues.push({ severity: "error", code: "BROKEN_RELATION_TARGET", message: `Relation "${rel.label}" references missing target entity ${rel.targetEntityId}` });
    }
  }

  const fields = await db.select().from(entityFieldsTable);
  for (const field of fields) {
    if (field.relatedEntityId && !entityIds.has(field.relatedEntityId)) {
      issues.push({ severity: "error", code: "BROKEN_FIELD_RELATION", message: `Field "${field.name}" references missing related entity ${field.relatedEntityId}` });
    }
  }

  try {
    const statusSets = await db.select().from(systemStatusSetsTable);
    for (const ss of statusSets) {
      const [valCount] = await db.select({ count: count() }).from(systemStatusValuesTable).where(eq(systemStatusValuesTable.statusSetId, ss.id));
      if (valCount.count === 0) {
        issues.push({ severity: "warning", code: "EMPTY_STATUS_SET", message: `Status set "${ss.name}" has no values` });
      }
    }
  } catch (err: any) {
    issues.push({ severity: "warning", code: "QUERY_FAILED", message: `Failed to query status sets: ${err?.message || "unknown"}` });
  }

  res.json({
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  });
});

export default router;
