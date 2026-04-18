import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityRecordsTable,
  entityStatusesTable,
  statusTransitionsTable,
  viewDefinitionsTable,
  formDefinitionsTable,
  actionDefinitionsTable,
  detailDefinitionsTable,
  entityCategoriesTable,
  platformWidgetsTable,
  platformWorkflowsTable,
  systemTemplatesTable,
  systemButtonsTable,
  systemCategoriesTable,
  systemStatusSetsTable,
  systemStatusValuesTable,
  systemPermissionsTable,
  systemMenuItemsTable,
  systemDashboardPagesTable,
  systemDashboardWidgetsTable,
  systemValidationsTable,
  systemVersionsTable,
  systemPublishLogsTable,
  platformAutomationsTable,
  claudeAuditLogsTable,
} from "@workspace/db/schema";
import { eq, asc, desc, sql, count, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/claude/dev-support/module-tree", async (_req, res) => {
  try {
    const modules = await db.select().from(platformModulesTable).orderBy(asc(platformModulesTable.sortOrder));
    const entities = await db.select().from(moduleEntitiesTable).orderBy(asc(moduleEntitiesTable.sortOrder));
    const fields = await db.select().from(entityFieldsTable).orderBy(asc(entityFieldsTable.sortOrder));
    const relations = await db.select().from(entityRelationsTable);
    const statuses = await db.select().from(entityStatusesTable).orderBy(asc(entityStatusesTable.sortOrder));
    const forms = await db.select().from(formDefinitionsTable);
    const views = await db.select().from(viewDefinitionsTable);
    const actions = await db.select().from(actionDefinitionsTable);
    const details = await db.select().from(detailDefinitionsTable);
    const widgets = await db.select().from(platformWidgetsTable);
    const workflows = await db.select().from(platformWorkflowsTable);

    const tree = modules.map(mod => {
      const modEntities = entities.filter(e => e.moduleId === mod.id);
      return {
        module: {
          id: mod.id,
          name: mod.name,
          nameHe: mod.nameHe,
          slug: mod.slug,
          status: mod.status,
          category: mod.category,
          icon: mod.icon,
          color: mod.color,
        },
        entities: modEntities.map(entity => ({
          id: entity.id,
          name: entity.name,
          nameHe: entity.nameHe,
          slug: entity.slug,
          entityType: entity.entityType,
          isActive: entity.isActive,
          fields: fields.filter(f => f.entityId === entity.id).map(f => ({
            id: f.id,
            name: f.name,
            slug: f.slug,
            fieldType: f.fieldType,
            isRequired: f.isRequired,
            isUnique: f.isUnique,
          })),
          relations: relations.filter(r => r.sourceEntityId === entity.id || r.targetEntityId === entity.id).map(r => ({
            id: r.id,
            relationType: r.relationType,
            label: r.label,
            sourceEntityId: r.sourceEntityId,
            targetEntityId: r.targetEntityId,
          })),
          statuses: statuses.filter(s => s.entityId === entity.id).map(s => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            color: s.color,
            isDefault: s.isDefault,
            isFinal: s.isFinal,
          })),
          forms: forms.filter(f => f.entityId === entity.id).map(f => ({
            id: f.id,
            name: f.name,
            slug: f.slug,
            formType: f.formType,
            isDefault: f.isDefault,
          })),
          views: views.filter(v => v.entityId === entity.id).map(v => ({
            id: v.id,
            name: v.name,
            slug: v.slug,
            viewType: v.viewType,
            isDefault: v.isDefault,
          })),
          actions: actions.filter(a => a.entityId === entity.id).map(a => ({
            id: a.id,
            name: a.name,
            slug: a.slug,
            actionType: a.actionType,
            handlerType: a.handlerType,
          })),
          details: details.filter(d => d.entityId === entity.id).map(d => ({
            id: d.id,
            name: d.name,
            slug: d.slug,
            isDefault: d.isDefault,
          })),
        })),
        widgets: widgets.filter(w => w.moduleId === mod.id).map(w => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          widgetType: w.widgetType,
          isActive: w.isActive,
        })),
        workflows: workflows.filter(w => w.moduleId === mod.id).map(w => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          triggerType: w.triggerType,
          isActive: w.isActive,
        })),
      };
    });

    res.json(tree);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/entity-dependency-graph", async (_req, res) => {
  try {
    const entities = await db.select({
      id: moduleEntitiesTable.id,
      name: moduleEntitiesTable.name,
      slug: moduleEntitiesTable.slug,
      moduleId: moduleEntitiesTable.moduleId,
      entityType: moduleEntitiesTable.entityType,
      parentEntityId: moduleEntitiesTable.parentEntityId,
    }).from(moduleEntitiesTable);

    const relations = await db.select().from(entityRelationsTable);

    const fields = await db.select({
      id: entityFieldsTable.id,
      entityId: entityFieldsTable.entityId,
      slug: entityFieldsTable.slug,
      fieldType: entityFieldsTable.fieldType,
      relatedEntityId: entityFieldsTable.relatedEntityId,
    }).from(entityFieldsTable);

    const modules = await db.select({ id: platformModulesTable.id, name: platformModulesTable.name, slug: platformModulesTable.slug }).from(platformModulesTable);
    const moduleMap = Object.fromEntries(modules.map(m => [m.id, m]));

    const nodes = entities.map(e => ({
      id: e.id,
      name: e.name,
      slug: e.slug,
      entityType: e.entityType,
      module: moduleMap[e.moduleId] || null,
      parentEntityId: e.parentEntityId,
    }));

    const edges: any[] = [];

    for (const r of relations) {
      edges.push({
        type: "relation",
        source: r.sourceEntityId,
        target: r.targetEntityId,
        relationType: r.relationType,
        label: r.label,
        cascadeDelete: r.cascadeDelete,
      });
    }

    for (const e of entities) {
      if (e.parentEntityId) {
        edges.push({
          type: "parent-child",
          source: e.parentEntityId,
          target: e.id,
          relationType: "parent",
          label: "parent",
        });
      }
    }

    const lookupFields = fields.filter(f => f.relatedEntityId);
    for (const f of lookupFields) {
      edges.push({
        type: "field-reference",
        source: f.entityId,
        target: f.relatedEntityId,
        fieldSlug: f.slug,
        fieldType: f.fieldType,
      });
    }

    res.json({ nodes, edges });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/field-usage-map", async (_req, res) => {
  try {
    const fields = await db.select().from(entityFieldsTable).orderBy(asc(entityFieldsTable.entityId), asc(entityFieldsTable.sortOrder));
    const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug, moduleId: moduleEntitiesTable.moduleId }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));
    const forms = await db.select().from(formDefinitionsTable);
    const views = await db.select().from(viewDefinitionsTable);

    const fieldUsage = fields.map(f => {
      const entity = entityMap[f.entityId];
      return {
        id: f.id,
        name: f.name,
        slug: f.slug,
        fieldType: f.fieldType,
        entityId: f.entityId,
        entityName: entity?.name || null,
        entitySlug: entity?.slug || null,
        moduleId: entity?.moduleId || null,
        isRequired: f.isRequired,
        isUnique: f.isUnique,
        isSearchable: f.isSearchable,
        isFilterable: f.isFilterable,
        showInList: f.showInList,
        showInForm: f.showInForm,
        showInDetail: f.showInDetail,
        relatedEntityId: f.relatedEntityId,
        isCalculated: f.isCalculated,
        isSystemField: f.isSystemField,
        formCount: forms.filter(fm => fm.entityId === f.entityId).length,
        viewCount: views.filter(v => v.entityId === f.entityId).length,
      };
    });

    const byType: Record<string, number> = {};
    for (const f of fields) {
      byType[f.fieldType] = (byType[f.fieldType] || 0) + 1;
    }

    res.json({
      fields: fieldUsage,
      summary: {
        totalFields: fields.length,
        byType,
        requiredCount: fields.filter(f => f.isRequired).length,
        uniqueCount: fields.filter(f => f.isUnique).length,
        searchableCount: fields.filter(f => f.isSearchable).length,
        calculatedCount: fields.filter(f => f.isCalculated).length,
        systemFieldCount: fields.filter(f => f.isSystemField).length,
        lookupFieldCount: fields.filter(f => f.relatedEntityId).length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/form-entity-bindings", async (_req, res) => {
  try {
    const forms = await db.select().from(formDefinitionsTable);
    const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug, moduleId: moduleEntitiesTable.moduleId }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));
    const fields = await db.select().from(entityFieldsTable).orderBy(asc(entityFieldsTable.sortOrder));
    const modules = await db.select({ id: platformModulesTable.id, name: platformModulesTable.name, slug: platformModulesTable.slug }).from(platformModulesTable);
    const moduleMap = Object.fromEntries(modules.map(m => [m.id, m]));

    const bindings = forms.map(f => {
      const entity = entityMap[f.entityId];
      const entityFields = fields.filter(fld => fld.entityId === f.entityId);
      const formFields = entityFields.filter(fld => fld.showInForm !== false);
      return {
        form: {
          id: f.id,
          name: f.name,
          slug: f.slug,
          formType: f.formType,
          isDefault: f.isDefault,
        },
        entity: entity ? {
          id: entity.id,
          name: entity.name,
          slug: entity.slug,
        } : null,
        module: entity ? moduleMap[entity.moduleId] || null : null,
        totalEntityFields: entityFields.length,
        formVisibleFields: formFields.length,
        fields: formFields.map(fld => ({
          id: fld.id,
          name: fld.name,
          slug: fld.slug,
          fieldType: fld.fieldType,
          isRequired: fld.isRequired,
          fieldWidth: fld.fieldWidth,
        })),
      };
    });

    res.json(bindings);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/view-entity-bindings", async (_req, res) => {
  try {
    const views = await db.select().from(viewDefinitionsTable);
    const entities = await db.select({ id: moduleEntitiesTable.id, name: moduleEntitiesTable.name, slug: moduleEntitiesTable.slug, moduleId: moduleEntitiesTable.moduleId }).from(moduleEntitiesTable);
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));
    const fields = await db.select().from(entityFieldsTable).orderBy(asc(entityFieldsTable.sortOrder));
    const modules = await db.select({ id: platformModulesTable.id, name: platformModulesTable.name, slug: platformModulesTable.slug }).from(platformModulesTable);
    const moduleMap = Object.fromEntries(modules.map(m => [m.id, m]));

    const bindings = views.map(v => {
      const entity = entityMap[v.entityId];
      const entityFields = fields.filter(fld => fld.entityId === v.entityId);
      const listFields = entityFields.filter(fld => fld.showInList !== false);
      return {
        view: {
          id: v.id,
          name: v.name,
          slug: v.slug,
          viewType: v.viewType,
          isDefault: v.isDefault,
        },
        entity: entity ? {
          id: entity.id,
          name: entity.name,
          slug: entity.slug,
        } : null,
        module: entity ? moduleMap[entity.moduleId] || null : null,
        totalEntityFields: entityFields.length,
        listVisibleFields: listFields.length,
        columns: v.columns || [],
        filters: v.filters || [],
        sorting: v.sorting || [],
      };
    });

    res.json(bindings);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/version-timeline", async (_req, res) => {
  try {
    const versions = await db.select().from(systemVersionsTable).orderBy(desc(systemVersionsTable.createdAt));
    const publishLogs = await db.select().from(systemPublishLogsTable).orderBy(desc(systemPublishLogsTable.createdAt));

    const timeline: any[] = [];

    for (const v of versions) {
      timeline.push({
        type: "version",
        id: v.id,
        entityType: v.entityType,
        entityId: v.entityId,
        versionNumber: v.versionNumber,
        createdBy: v.createdBy,
        createdAt: v.createdAt,
      });
    }

    for (const p of publishLogs) {
      timeline.push({
        type: "publish",
        id: p.id,
        moduleId: p.moduleId,
        entityType: p.entityType,
        entityId: p.entityId,
        action: p.action,
        previousVersion: p.previousVersion,
        newVersion: p.newVersion,
        publishedBy: p.publishedBy,
        notes: p.notes,
        createdAt: p.createdAt,
      });
    }

    timeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(timeline);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/runtime-summary", async (_req, res) => {
  try {
    const [modulesCount] = await db.select({ count: count() }).from(platformModulesTable);
    const [entitiesCount] = await db.select({ count: count() }).from(moduleEntitiesTable);
    const [fieldsCount] = await db.select({ count: count() }).from(entityFieldsTable);
    const [relationsCount] = await db.select({ count: count() }).from(entityRelationsTable);
    const [recordsCount] = await db.select({ count: count() }).from(entityRecordsTable);
    const [statusesCount] = await db.select({ count: count() }).from(entityStatusesTable);
    const [transitionsCount] = await db.select({ count: count() }).from(statusTransitionsTable);
    const [viewsCount] = await db.select({ count: count() }).from(viewDefinitionsTable);
    const [formsCount] = await db.select({ count: count() }).from(formDefinitionsTable);
    const [actionsCount] = await db.select({ count: count() }).from(actionDefinitionsTable);
    const [detailsCount] = await db.select({ count: count() }).from(detailDefinitionsTable);
    const [categoriesCount] = await db.select({ count: count() }).from(entityCategoriesTable);
    const [widgetsCount] = await db.select({ count: count() }).from(platformWidgetsTable);
    const [workflowsCount] = await db.select({ count: count() }).from(platformWorkflowsTable);
    const [templatesCount] = await db.select({ count: count() }).from(systemTemplatesTable);
    const [buttonsCount] = await db.select({ count: count() }).from(systemButtonsTable);
    const [permissionsCount] = await db.select({ count: count() }).from(systemPermissionsTable);
    const [menuItemsCount] = await db.select({ count: count() }).from(systemMenuItemsTable);
    const [dashboardPagesCount] = await db.select({ count: count() }).from(systemDashboardPagesTable);
    const [dashboardWidgetsCount] = await db.select({ count: count() }).from(systemDashboardWidgetsTable);
    const [validationsCount] = await db.select({ count: count() }).from(systemValidationsTable);
    const [automationsCount] = await db.select({ count: count() }).from(platformAutomationsTable);

    const publishedModules = await db.select({ count: count() }).from(platformModulesTable).where(eq(platformModulesTable.status, "published"));

    const entityTypes = await db
      .select({ entityType: moduleEntitiesTable.entityType, count: count() })
      .from(moduleEntitiesTable)
      .groupBy(moduleEntitiesTable.entityType);

    const fieldTypes = await db
      .select({ fieldType: entityFieldsTable.fieldType, count: count() })
      .from(entityFieldsTable)
      .groupBy(entityFieldsTable.fieldType);

    const recentBuilderActions = await db
      .select()
      .from(claudeAuditLogsTable)
      .where(sql`${claudeAuditLogsTable.actionType} LIKE 'builder_%'`)
      .orderBy(desc(claudeAuditLogsTable.createdAt))
      .limit(10);

    res.json({
      counts: {
        modules: Number(modulesCount.count),
        entities: Number(entitiesCount.count),
        fields: Number(fieldsCount.count),
        relations: Number(relationsCount.count),
        records: Number(recordsCount.count),
        statuses: Number(statusesCount.count),
        transitions: Number(transitionsCount.count),
        views: Number(viewsCount.count),
        forms: Number(formsCount.count),
        actions: Number(actionsCount.count),
        details: Number(detailsCount.count),
        categories: Number(categoriesCount.count),
        widgets: Number(widgetsCount.count),
        workflows: Number(workflowsCount.count),
        templates: Number(templatesCount.count),
        buttons: Number(buttonsCount.count),
        permissions: Number(permissionsCount.count),
        menuItems: Number(menuItemsCount.count),
        dashboardPages: Number(dashboardPagesCount.count),
        dashboardWidgets: Number(dashboardWidgetsCount.count),
        validations: Number(validationsCount.count),
        automations: Number(automationsCount.count),
      },
      moduleStatus: {
        published: Number(publishedModules[0].count),
        draft: Number(modulesCount.count) - Number(publishedModules[0].count),
      },
      entityTypes: Object.fromEntries(entityTypes.map(e => [e.entityType, Number(e.count)])),
      fieldTypes: Object.fromEntries(fieldTypes.map(f => [f.fieldType, Number(f.count)])),
      recentBuilderActions: recentBuilderActions.map(a => ({
        actionType: a.actionType,
        targetApi: a.targetApi,
        status: a.status,
        createdAt: a.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/schema-summary", async (_req, res) => {
  try {
    const modules = await db.select().from(platformModulesTable).orderBy(asc(platformModulesTable.sortOrder));
    const entities = await db.select().from(moduleEntitiesTable).orderBy(asc(moduleEntitiesTable.sortOrder));
    const fieldCounts = await db
      .select({ entityId: entityFieldsTable.entityId, count: count() })
      .from(entityFieldsTable)
      .groupBy(entityFieldsTable.entityId);
    const fcMap = Object.fromEntries(fieldCounts.map(f => [f.entityId, Number(f.count)]));

    const relationCounts = await db
      .select({ entityId: entityRelationsTable.sourceEntityId, count: count() })
      .from(entityRelationsTable)
      .groupBy(entityRelationsTable.sourceEntityId);
    const rcMap = Object.fromEntries(relationCounts.map(r => [r.entityId, Number(r.count)]));

    const statusCounts = await db
      .select({ entityId: entityStatusesTable.entityId, count: count() })
      .from(entityStatusesTable)
      .groupBy(entityStatusesTable.entityId);
    const scMap = Object.fromEntries(statusCounts.map(s => [s.entityId, Number(s.count)]));

    const summary = modules.map(mod => {
      const modEntities = entities.filter(e => e.moduleId === mod.id);
      return {
        module: { id: mod.id, name: mod.name, slug: mod.slug, status: mod.status },
        entityCount: modEntities.length,
        totalFields: modEntities.reduce((sum, e) => sum + (fcMap[e.id] || 0), 0),
        totalRelations: modEntities.reduce((sum, e) => sum + (rcMap[e.id] || 0), 0),
        totalStatuses: modEntities.reduce((sum, e) => sum + (scMap[e.id] || 0), 0),
        entities: modEntities.map(e => ({
          id: e.id,
          name: e.name,
          slug: e.slug,
          entityType: e.entityType,
          fieldCount: fcMap[e.id] || 0,
          relationCount: rcMap[e.id] || 0,
          statusCount: scMap[e.id] || 0,
          hasStatus: e.hasStatus,
          hasCategories: e.hasCategories,
          hasAttachments: e.hasAttachments,
          hasNotes: e.hasNotes,
          hasOwner: e.hasOwner,
        })),
      };
    });

    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/dev-support/metadata-types", async (_req, res) => {
  try {
    res.json({
      types: [
        {
          name: "module",
          description: "Top-level organizational unit containing entities",
          builderEndpoint: "/claude/builder/modules",
          readEndpoint: "/claude/system/modules",
          fields: ["name", "nameHe", "nameEn", "slug", "moduleKey", "description", "icon", "color", "category", "status", "sortOrder"],
        },
        {
          name: "entity",
          description: "Data model definition within a module",
          builderEndpoint: "/claude/builder/entities",
          readEndpoint: "/claude/system/entities",
          fields: ["moduleId", "name", "nameHe", "nameEn", "namePlural", "slug", "entityKey", "tableName", "entityType", "icon"],
          entityTypes: ["master", "transaction", "child", "reference", "log", "system", "document", "analytics"],
        },
        {
          name: "field",
          description: "Column/attribute definition on an entity",
          builderEndpoint: "/claude/builder/fields",
          readEndpoint: "/claude/system/fields",
          fields: ["entityId", "name", "slug", "fieldType", "isRequired", "isUnique", "isSearchable", "fieldWidth"],
          fieldTypes: ["text", "number", "date", "datetime", "boolean", "select", "multiselect", "relation", "file", "image", "url", "email", "phone", "textarea", "richtext", "json", "currency", "percentage", "rating", "color", "formula"],
        },
        {
          name: "relation",
          description: "Relationship definition between two entities",
          builderEndpoint: "/claude/builder/relations",
          readEndpoint: "/claude/system/relations",
          fields: ["sourceEntityId", "targetEntityId", "relationType", "label", "reverseLabel", "cascadeDelete"],
          relationTypes: ["one_to_one", "one_to_many", "many_to_many"],
        },
        {
          name: "form",
          description: "Form layout definition for an entity",
          builderEndpoint: "/claude/builder/forms",
          readEndpoint: "/claude/system/forms",
          fields: ["entityId", "name", "slug", "formType", "sections", "isDefault"],
          formTypes: ["create", "edit", "quick_create", "wizard"],
        },
        {
          name: "view",
          description: "List/grid view definition for an entity",
          builderEndpoint: "/claude/builder/views",
          readEndpoint: "/claude/system/views",
          fields: ["entityId", "name", "slug", "viewType", "columns", "filters", "sorting", "isDefault"],
        },
        {
          name: "status",
          description: "Status value for entity workflow states",
          builderEndpoint: "/claude/builder/statuses",
          readEndpoint: "/claude/system/statuses",
          fields: ["entityId", "name", "slug", "color", "icon", "isDefault", "isFinal", "sortOrder"],
        },
        {
          name: "category",
          description: "Category/classification for entity records",
          builderEndpoint: "/claude/builder/categories",
          readEndpoint: "/claude/system/categories",
          fields: ["entityId", "name", "slug", "parentId", "icon", "color", "sortOrder"],
        },
        {
          name: "action",
          description: "UI action/button definition bound to an entity",
          builderEndpoint: "/claude/builder/actions",
          readEndpoint: "/claude/system/actions",
          fields: ["entityId", "name", "slug", "actionType", "handlerType", "icon", "color"],
          actionTypes: ["page", "row", "bulk", "header", "contextual"],
          handlerTypes: ["create", "update", "delete", "duplicate", "status_change", "workflow", "modal", "navigate", "export", "import", "print", "custom"],
        },
        {
          name: "button",
          description: "Custom button with action binding on an entity",
          builderEndpoint: "/claude/builder/buttons",
          readEndpoint: "/claude/system/buttons",
          fields: ["entityId", "name", "slug", "buttonType", "icon", "color", "actionType", "actionConfig"],
        },
        {
          name: "detail",
          description: "Detail page layout definition for an entity",
          builderEndpoint: "/claude/builder/details",
          readEndpoint: "/claude/system/detail-pages",
          fields: ["entityId", "name", "slug", "sections", "isDefault", "showRelatedRecords"],
        },
        {
          name: "widget",
          description: "Dashboard widget definition bound to a module",
          builderEndpoint: "/claude/builder/widgets",
          readEndpoint: "/claude/system/widgets",
          fields: ["moduleId", "name", "slug", "widgetType", "entityId", "config", "position"],
        },
        {
          name: "workflow",
          description: "Automated workflow definition bound to a module",
          builderEndpoint: "/claude/builder/workflows",
          readEndpoint: "/claude/system/workflows",
          fields: ["moduleId", "name", "slug", "description", "triggerType", "triggerConfig", "actions", "conditions"],
        },
        {
          name: "template",
          description: "Reusable template definition",
          builderEndpoint: "/claude/builder/templates",
          readEndpoint: "/claude/system/templates",
          fields: ["name", "slug", "templateType", "entityId", "moduleId", "content", "isActive"],
        },
        {
          name: "dashboard-widget",
          description: "Widget on a dashboard page",
          builderEndpoint: "/claude/builder/dashboard-widgets",
          readEndpoint: "/claude/system/dashboards",
          fields: ["dashboardId", "widgetType", "title", "entityId", "config", "position", "size"],
        },
        {
          name: "status-set",
          description: "Named set of status values for an entity",
          builderEndpoint: "/claude/builder/status-sets",
          readEndpoint: "/claude/system/statuses",
          fields: ["entityId", "name", "slug", "isDefault"],
        },
        {
          name: "transition",
          description: "Status transition rule between statuses",
          builderEndpoint: "/claude/builder/transitions",
          readEndpoint: "/claude/system/statuses",
          fields: ["entityId", "fromStatusId", "toStatusId", "label", "icon", "conditions"],
        },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
