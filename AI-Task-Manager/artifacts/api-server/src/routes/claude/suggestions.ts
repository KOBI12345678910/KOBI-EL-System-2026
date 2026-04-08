import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  entityStatusesTable,
  systemPermissionsTable,
  systemMenuItemsTable,
  platformWorkflowsTable,
} from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";

const router: IRouter = Router();

interface Suggestion {
  priority: "high" | "medium" | "low";
  category: string;
  action: string;
  description: string;
  targetType?: string;
  targetId?: number;
  targetName?: string;
  capability?: string;
}

router.get("/claude/suggestions/next-actions", async (_req, res) => {
  const suggestions: Suggestion[] = [];

  const allModules = await db.select().from(platformModulesTable);
  const allEntities = await db.select().from(moduleEntitiesTable);

  for (const mod of allModules) {
    const moduleEntities = allEntities.filter((e) => e.moduleId === mod.id);
    if (moduleEntities.length === 0) {
      suggestions.push({
        priority: "high",
        category: "completeness",
        action: "create_entity",
        description: `Module "${mod.name}" has no entities. Create at least one entity to make this module functional.`,
        targetType: "module",
        targetId: mod.id,
        targetName: mod.name,
        capability: "create_entity",
      });
    }

    if (mod.status === "draft") {
      const [entCount] = await db.select({ count: count() }).from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, mod.id));
      if (entCount.count > 0) {
        suggestions.push({
          priority: "medium",
          category: "governance",
          action: "validate_and_publish",
          description: `Module "${mod.name}" is in draft status with ${entCount.count} entities. Consider validating and publishing.`,
          targetType: "module",
          targetId: mod.id,
          targetName: mod.name,
          capability: "governance_validate",
        });
      }
    }
  }

  for (const entity of allEntities) {
    const [fieldCount] = await db.select({ count: count() }).from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id));
    if (fieldCount.count === 0) {
      suggestions.push({
        priority: "high",
        category: "completeness",
        action: "create_fields",
        description: `Entity "${entity.name}" has no fields defined. Add fields to make it usable.`,
        targetType: "entity",
        targetId: entity.id,
        targetName: entity.name,
        capability: "create_field",
      });
      continue;
    }

    const [formCount] = await db.select({ count: count() }).from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entity.id));
    if (formCount.count === 0) {
      suggestions.push({
        priority: "medium",
        category: "ui",
        action: "create_form",
        description: `Entity "${entity.name}" has fields but no form definition. Create a form for data entry.`,
        targetType: "entity",
        targetId: entity.id,
        targetName: entity.name,
        capability: "create_form",
      });
    }

    const [viewCount] = await db.select({ count: count() }).from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entity.id));
    if (viewCount.count === 0) {
      suggestions.push({
        priority: "medium",
        category: "ui",
        action: "create_view",
        description: `Entity "${entity.name}" has no list view. Create a view for browsing records.`,
        targetType: "entity",
        targetId: entity.id,
        targetName: entity.name,
        capability: "create_view",
      });
    }

    if (!entity.primaryDisplayField) {
      suggestions.push({
        priority: "medium",
        category: "configuration",
        action: "set_display_field",
        description: `Entity "${entity.name}" has no primary display field set. This is needed for relation lookups.`,
        targetType: "entity",
        targetId: entity.id,
        targetName: entity.name,
        capability: "update_entity",
      });
    }

    if (entity.hasStatus) {
      const [statusCount] = await db.select({ count: count() }).from(entityStatusesTable).where(eq(entityStatusesTable.entityId, entity.id));
      if (statusCount.count === 0) {
        suggestions.push({
          priority: "high",
          category: "completeness",
          action: "create_statuses",
          description: `Entity "${entity.name}" has status enabled but no statuses defined.`,
          targetType: "entity",
          targetId: entity.id,
          targetName: entity.name,
          capability: "create_status",
        });
      }
    }

    const [permCount] = await db.select({ count: count() }).from(systemPermissionsTable).where(eq(systemPermissionsTable.entityId, entity.id));
    if (permCount.count === 0) {
      suggestions.push({
        priority: "low",
        category: "security",
        action: "configure_permissions",
        description: `Entity "${entity.name}" has no permissions configured. Consider adding role-based access.`,
        targetType: "entity",
        targetId: entity.id,
        targetName: entity.name,
        capability: "manage_permissions",
      });
    }
  }

  if (allEntities.length >= 2) {
    const [relCount] = await db.select({ count: count() }).from(entityRelationsTable);
    if (relCount.count === 0) {
      suggestions.push({
        priority: "medium",
        category: "data_model",
        action: "create_relations",
        description: `There are ${allEntities.length} entities but no relations between them. Consider connecting related entities.`,
        capability: "create_relation",
      });
    }
  }

  suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  res.json({
    suggestions,
    totalSuggestions: suggestions.length,
    byPriority: {
      high: suggestions.filter((s) => s.priority === "high").length,
      medium: suggestions.filter((s) => s.priority === "medium").length,
      low: suggestions.filter((s) => s.priority === "low").length,
    },
    generatedAt: new Date().toISOString(),
  });
});

router.get("/claude/suggestions/gaps", async (_req, res) => {
  const [modules] = await db.select({ count: count() }).from(platformModulesTable);
  const [entities] = await db.select({ count: count() }).from(moduleEntitiesTable);
  const [fields] = await db.select({ count: count() }).from(entityFieldsTable);
  const [forms] = await db.select({ count: count() }).from(formDefinitionsTable);
  const [views] = await db.select({ count: count() }).from(viewDefinitionsTable);
  const [relations] = await db.select({ count: count() }).from(entityRelationsTable);
  const [workflows] = await db.select({ count: count() }).from(platformWorkflowsTable);
  const [menus] = await db.select({ count: count() }).from(systemMenuItemsTable);
  const [perms] = await db.select({ count: count() }).from(systemPermissionsTable);

  const gaps: Array<{ area: string; current: number; recommended: string; gap: string }> = [];

  if (modules.count > 0 && entities.count === 0) {
    gaps.push({ area: "entities", current: 0, recommended: "At least 1 per module", gap: "No entities defined for any module" });
  }
  if (entities.count > 0 && forms.count === 0) {
    gaps.push({ area: "forms", current: 0, recommended: "At least 1 per entity", gap: "No form definitions exist" });
  }
  if (entities.count > 0 && views.count === 0) {
    gaps.push({ area: "views", current: 0, recommended: "At least 1 per entity", gap: "No view definitions exist" });
  }
  if (entities.count > 1 && relations.count === 0) {
    gaps.push({ area: "relations", current: 0, recommended: "Connect related entities", gap: "No entity relations defined" });
  }
  if (entities.count > 0 && workflows.count === 0) {
    gaps.push({ area: "workflows", current: 0, recommended: "Define business workflows", gap: "No workflows configured" });
  }
  if (modules.count > 0 && menus.count === 0) {
    gaps.push({ area: "menus", current: 0, recommended: "Navigation for each module", gap: "No menu items configured" });
  }
  if (entities.count > 0 && perms.count === 0) {
    gaps.push({ area: "permissions", current: 0, recommended: "Role-based access per entity", gap: "No permissions configured" });
  }

  res.json({
    gaps,
    totalGaps: gaps.length,
    systemMaturity: gaps.length === 0 ? "complete" : gaps.length <= 2 ? "partial" : "early",
    generatedAt: new Date().toISOString(),
  });
});

export default router;
