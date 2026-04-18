import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityRecordsTable,
  entityStatusesTable,
  viewDefinitionsTable,
  formDefinitionsTable,
  actionDefinitionsTable,
  platformWidgetsTable,
  platformWorkflowsTable,
  systemCategoriesTable,
  systemMenuItemsTable,
  systemPermissionsTable,
  detailDefinitionsTable,
} from "@workspace/db/schema";
import { eq, sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/claude/knowledge/schema-summary", async (_req, res) => {
  try {
    const [modulesCount] = await db.select({ count: count() }).from(platformModulesTable);
    const [entitiesCount] = await db.select({ count: count() }).from(moduleEntitiesTable);
    const [fieldsCount] = await db.select({ count: count() }).from(entityFieldsTable);
    const [relationsCount] = await db.select({ count: count() }).from(entityRelationsTable);
    const [recordsCount] = await db.select({ count: count() }).from(entityRecordsTable);
    const [statusesCount] = await db.select({ count: count() }).from(entityStatusesTable);
    const [viewsCount] = await db.select({ count: count() }).from(viewDefinitionsTable);
    const [formsCount] = await db.select({ count: count() }).from(formDefinitionsTable);
    const [actionsCount] = await db.select({ count: count() }).from(actionDefinitionsTable);
    const [widgetsCount] = await db.select({ count: count() }).from(platformWidgetsTable);
    const [workflowsCount] = await db.select({ count: count() }).from(platformWorkflowsTable);
    const [categoriesCount] = await db.select({ count: count() }).from(systemCategoriesTable);

    const publishedModules = await db.select({ count: count() }).from(platformModulesTable).where(eq(platformModulesTable.status, "published"));

    const draftModuleRows = await db
      .select({ name: platformModulesTable.name, nameHe: platformModulesTable.nameHe })
      .from(platformModulesTable)
      .where(eq(platformModulesTable.status, "draft"));

    const entitiesWithoutFields = await db.execute(sql`
      SELECT COUNT(*) as count FROM module_entities me
      WHERE NOT EXISTS (SELECT 1 FROM entity_fields ef WHERE ef.entity_id = me.id)
    `);

    const draftModuleNames = draftModuleRows
      .map((m) => (m.nameHe || m.name || "").trim())
      .filter((n) => n.length > 0);

    res.json({
      totals: {
        modules: Number(modulesCount.count),
        entities: Number(entitiesCount.count),
        fields: Number(fieldsCount.count),
        relations: Number(relationsCount.count),
        records: Number(recordsCount.count),
        statuses: Number(statusesCount.count),
        views: Number(viewsCount.count),
        forms: Number(formsCount.count),
        actions: Number(actionsCount.count),
        widgets: Number(widgetsCount.count),
        workflows: Number(workflowsCount.count),
        categories: Number(categoriesCount.count),
      },
      health: {
        publishedModules: Number(publishedModules[0].count),
        draftModules: draftModuleRows.length,
        draftModuleNames,
        entitiesWithoutFields: Number((entitiesWithoutFields as any).rows?.[0]?.count || 0),
        averageFieldsPerEntity: Number(entitiesCount.count) > 0
          ? Math.round(Number(fieldsCount.count) / Number(entitiesCount.count) * 10) / 10
          : 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/module-summary", async (_req, res) => {
  try {
    const modules = await db.select().from(platformModulesTable);
    const entities = await db.select().from(moduleEntitiesTable);
    const fieldCounts = await db
      .select({ entityId: entityFieldsTable.entityId, count: count() })
      .from(entityFieldsTable)
      .groupBy(entityFieldsTable.entityId);
    const fcMap = Object.fromEntries(fieldCounts.map(f => [f.entityId, Number(f.count)]));

    res.json(modules.map(m => {
      const modEntities = entities.filter(e => e.moduleId === m.id);
      return {
        id: m.id,
        name: m.name,
        nameHe: m.nameHe,
        slug: m.slug,
        status: m.status,
        category: m.category,
        icon: m.icon,
        entityCount: modEntities.length,
        totalFields: modEntities.reduce((sum, e) => sum + (fcMap[e.id] || 0), 0),
        entities: modEntities.map(e => ({
          id: e.id,
          name: e.name,
          nameHe: e.nameHe,
          slug: e.slug,
          entityType: e.entityType,
          fieldCount: fcMap[e.id] || 0,
        })),
      };
    }));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/entity-map", async (_req, res) => {
  try {
    const entities = await db.select({
      id: moduleEntitiesTable.id,
      name: moduleEntitiesTable.name,
      nameHe: moduleEntitiesTable.nameHe,
      slug: moduleEntitiesTable.slug,
      moduleId: moduleEntitiesTable.moduleId,
      entityType: moduleEntitiesTable.entityType,
    }).from(moduleEntitiesTable);

    const relations = await db.select().from(entityRelationsTable);

    res.json({
      nodes: entities.map(e => ({
        id: e.id,
        name: e.name,
        nameHe: e.nameHe,
        slug: e.slug,
        moduleId: e.moduleId,
        entityType: e.entityType,
      })),
      edges: relations.map(r => ({
        id: r.id,
        source: r.sourceEntityId,
        target: r.targetEntityId,
        relationType: r.relationType,
        label: r.label,
        reverseLabel: r.reverseLabel,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/field-summary", async (_req, res) => {
  try {
    const fieldTypes = await db
      .select({ fieldType: entityFieldsTable.fieldType, count: count() })
      .from(entityFieldsTable)
      .groupBy(entityFieldsTable.fieldType);

    const requiredCount = await db.select({ count: count() }).from(entityFieldsTable).where(eq(entityFieldsTable.isRequired, true));
    const uniqueCount = await db.select({ count: count() }).from(entityFieldsTable).where(eq(entityFieldsTable.isUnique, true));
    const searchableCount = await db.select({ count: count() }).from(entityFieldsTable).where(eq(entityFieldsTable.isSearchable, true));

    res.json({
      byType: Object.fromEntries(fieldTypes.map(f => [f.fieldType, Number(f.count)])),
      stats: {
        required: Number(requiredCount[0].count),
        unique: Number(uniqueCount[0].count),
        searchable: Number(searchableCount[0].count),
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/relation-graph", async (_req, res) => {
  try {
    const relations = await db.select().from(entityRelationsTable);
    const entities = await db.select({
      id: moduleEntitiesTable.id,
      name: moduleEntitiesTable.name,
      slug: moduleEntitiesTable.slug,
    }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));

    res.json(relations.map(r => ({
      id: r.id,
      source: { id: r.sourceEntityId, ...entityMap[r.sourceEntityId] },
      target: { id: r.targetEntityId, ...entityMap[r.targetEntityId] },
      relationType: r.relationType,
      label: r.label,
      reverseLabel: r.reverseLabel,
      cascadeDelete: r.cascadeDelete,
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/status-map", async (_req, res) => {
  try {
    const statuses = await db.select().from(entityStatusesTable);
    const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));

    const grouped: Record<number, any> = {};
    for (const s of statuses) {
      if (!grouped[s.entityId]) {
        grouped[s.entityId] = { entity: entityMap[s.entityId], statuses: [] };
      }
      grouped[s.entityId].statuses.push({ id: s.id, name: s.name, slug: s.slug, color: s.color, isDefault: s.isDefault, isFinal: s.isFinal });
    }
    res.json(Object.values(grouped));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/category-map", async (_req, res) => {
  try {
    const categories = await db.select().from(systemCategoriesTable);
    const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));

    const grouped: Record<number, any> = {};
    for (const c of categories) {
      if (!grouped[c.entityId]) {
        grouped[c.entityId] = { entity: entityMap[c.entityId], categories: [] };
      }
      grouped[c.entityId].categories.push({ id: c.id, name: c.name, slug: c.slug, color: c.color, icon: c.icon, parentId: c.parentId });
    }
    res.json(Object.values(grouped));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/workflow-map", async (_req, res) => {
  try {
    const workflows = await db.select().from(platformWorkflowsTable);
    const modules = await db.select({ id: platformModulesTable.id, name: platformModulesTable.name, slug: platformModulesTable.slug }).from(platformModulesTable);
    const moduleMap = Object.fromEntries(modules.map(m => [m.id, m]));

    res.json(workflows.map(w => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      module: moduleMap[w.moduleId],
      triggerType: w.triggerType,
      actionsCount: Array.isArray(w.actions) ? w.actions.length : 0,
      conditionsCount: Array.isArray(w.conditions) ? w.conditions.length : 0,
      isActive: w.isActive,
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/screen-map", async (_req, res) => {
  try {
    const views = await db.select().from(viewDefinitionsTable);
    const forms = await db.select().from(formDefinitionsTable);
    const details = await db.select().from(detailDefinitionsTable);
    const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));

    const screens: Record<number, any> = {};
    for (const entity of entities) {
      screens[entity.id] = {
        entity: { id: entity.id, name: entity.name, slug: entity.slug },
        views: views.filter(v => v.entityId === entity.id).map(v => ({ id: v.id, name: v.name, viewType: v.viewType, isDefault: v.isDefault })),
        forms: forms.filter(f => f.entityId === entity.id).map(f => ({ id: f.id, name: f.name, formType: f.formType, isDefault: f.isDefault })),
        details: details.filter(d => d.entityId === entity.id).map(d => ({ id: d.id, name: d.name, isDefault: d.isDefault })),
      };
    }
    res.json(Object.values(screens).filter(s => s.views.length > 0 || s.forms.length > 0 || s.details.length > 0));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/menu-map", async (_req, res) => {
  try {
    const menuItems = await db.select().from(systemMenuItemsTable);
    res.json(menuItems);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/permission-map", async (_req, res) => {
  try {
    const permissions = await db.select().from(systemPermissionsTable);
    const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));
    const modules = await db.select({ id: platformModulesTable.id, name: platformModulesTable.name }).from(platformModulesTable);
    const moduleMap = Object.fromEntries(modules.map(m => [m.id, m]));

    res.json(permissions.map(p => ({
      ...p,
      entityName: p.entityId ? entityMap[p.entityId]?.name : null,
      moduleName: p.moduleId ? moduleMap[p.moduleId]?.name : null,
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/knowledge/metadata-dependency-map", async (_req, res) => {
  try {
    const modules = await db.select({
      id: platformModulesTable.id,
      name: platformModulesTable.name,
      slug: platformModulesTable.slug,
    }).from(platformModulesTable);

    const entities = await db.select({
      id: moduleEntitiesTable.id,
      name: moduleEntitiesTable.name,
      slug: moduleEntitiesTable.slug,
      moduleId: moduleEntitiesTable.moduleId,
      hasStatus: moduleEntitiesTable.hasStatus,
      hasCategories: moduleEntitiesTable.hasCategories,
    }).from(moduleEntitiesTable);

    const relations = await db.select().from(entityRelationsTable);
    const fields = await db.select({
      id: entityFieldsTable.id,
      entityId: entityFieldsTable.entityId,
      slug: entityFieldsTable.slug,
      fieldType: entityFieldsTable.fieldType,
      relatedEntityId: entityFieldsTable.relatedEntityId,
    }).from(entityFieldsTable);

    const forms = await db.select({ id: formDefinitionsTable.id, entityId: formDefinitionsTable.entityId }).from(formDefinitionsTable);
    const views = await db.select({ id: viewDefinitionsTable.id, entityId: viewDefinitionsTable.entityId }).from(viewDefinitionsTable);
    const actions = await db.select({ id: actionDefinitionsTable.id, entityId: actionDefinitionsTable.entityId }).from(actionDefinitionsTable);
    const workflows = await db.select({ id: platformWorkflowsTable.id, moduleId: platformWorkflowsTable.moduleId }).from(platformWorkflowsTable);

    const fieldsByEntity = new Map<number, typeof fields>();
    for (const f of fields) {
      const arr = fieldsByEntity.get(f.entityId) || [];
      arr.push(f);
      fieldsByEntity.set(f.entityId, arr);
    }
    const outRelBySource = new Map<number, typeof relations>();
    const inRelByTarget = new Map<number, typeof relations>();
    for (const r of relations) {
      const out = outRelBySource.get(r.sourceEntityId) || [];
      out.push(r);
      outRelBySource.set(r.sourceEntityId, out);
      const inc = inRelByTarget.get(r.targetEntityId) || [];
      inc.push(r);
      inRelByTarget.set(r.targetEntityId, inc);
    }
    const formsByEntity = new Map<number, number>();
    for (const f of forms) formsByEntity.set(f.entityId, (formsByEntity.get(f.entityId) || 0) + 1);
    const viewsByEntity = new Map<number, number>();
    for (const v of views) viewsByEntity.set(v.entityId, (viewsByEntity.get(v.entityId) || 0) + 1);
    const actionsByEntity = new Map<number, number>();
    for (const a of actions) actionsByEntity.set(a.entityId, (actionsByEntity.get(a.entityId) || 0) + 1);

    const lookupFieldsByTarget = new Map<number, typeof fields>();
    for (const f of fields) {
      if (f.relatedEntityId && f.relatedEntityId !== f.entityId) {
        const arr = lookupFieldsByTarget.get(f.relatedEntityId) || [];
        arr.push(f);
        lookupFieldsByTarget.set(f.relatedEntityId, arr);
      }
    }

    const dependencies = entities.map(entity => {
      const entityFields = fieldsByEntity.get(entity.id) || [];
      const lookupFields = entityFields.filter(f => f.relatedEntityId);
      const outgoingRelations = outRelBySource.get(entity.id) || [];
      const incomingRelations = inRelByTarget.get(entity.id) || [];

      return {
        entity: { id: entity.id, name: entity.name, slug: entity.slug, moduleId: entity.moduleId },
        dependsOn: [
          ...lookupFields.map(f => ({ type: "lookup_field" as const, fieldSlug: f.slug, targetEntityId: f.relatedEntityId })),
          ...outgoingRelations.map(r => ({ type: "relation" as const, relationType: r.relationType, targetEntityId: r.targetEntityId, label: r.label })),
        ],
        dependedBy: [
          ...incomingRelations.map(r => ({ type: "relation" as const, relationType: r.relationType, sourceEntityId: r.sourceEntityId, label: r.reverseLabel })),
          ...(lookupFieldsByTarget.get(entity.id) || []).map(f => ({ type: "lookup_field" as const, fieldSlug: f.slug, sourceEntityId: f.entityId })),
        ],
        components: {
          fieldCount: entityFields.length,
          formCount: formsByEntity.get(entity.id) || 0,
          viewCount: viewsByEntity.get(entity.id) || 0,
          actionCount: actionsByEntity.get(entity.id) || 0,
          hasStatus: entity.hasStatus,
          hasCategories: entity.hasCategories,
        },
      };
    });

    const moduleWorkflowCounts = Object.fromEntries(
      modules.map(m => [m.id, workflows.filter(w => w.moduleId === m.id).length])
    );

    res.json({
      modules: modules.map(m => ({
        ...m,
        entityCount: entities.filter(e => e.moduleId === m.id).length,
        workflowCount: moduleWorkflowCounts[m.id] || 0,
      })),
      entities: dependencies,
      summary: {
        totalModules: modules.length,
        totalEntities: entities.length,
        totalRelations: relations.length,
        totalLookupFields: fields.filter(f => f.relatedEntityId).length,
        isolatedEntities: dependencies.filter(d => d.dependsOn.length === 0 && d.dependedBy.length === 0).map(d => d.entity),
        highlyConnected: dependencies
          .filter(d => d.dependsOn.length + d.dependedBy.length >= 3)
          .map(d => ({ entity: d.entity, connectionCount: d.dependsOn.length + d.dependedBy.length })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
