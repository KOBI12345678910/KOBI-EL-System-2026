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
  recordAuditLogTable,
  platformWidgetsTable,
  platformWorkflowsTable,
  detailDefinitionsTable,
  systemFormSectionsTable,
  systemFormFieldsTable,
  systemViewColumnsTable,
  systemDetailPagesTable,
  systemDetailSectionsTable,
  systemButtonsTable,
  systemCategoriesTable,
  systemStatusSetsTable,
  systemStatusValuesTable,
  systemPermissionsTable,
  systemMenuItemsTable,
  systemDashboardPagesTable,
  systemDashboardWidgetsTable,
  systemValidationsTable,
  systemTemplatesTable,
  systemVersionsTable,
  systemPublishLogsTable,
} from "@workspace/db/schema";
import { eq, asc, sql, count, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/claude/system/modules", async (_req, res) => {
  try {
    const modules = await db.select().from(platformModulesTable).orderBy(asc(platformModulesTable.sortOrder));
    const entityCounts = await db
      .select({ moduleId: moduleEntitiesTable.moduleId, count: count() })
      .from(moduleEntitiesTable)
      .groupBy(moduleEntitiesTable.moduleId);
    const countMap = Object.fromEntries(entityCounts.map(e => [e.moduleId, Number(e.count)]));
    res.json(modules.map(m => ({ ...m, entityCount: countMap[m.id] || 0 })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/modules/:id/full", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid module ID" });
    const [module] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, id));
    if (!module) return res.status(404).json({ message: "Module not found" });

    const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, id)).orderBy(asc(moduleEntitiesTable.sortOrder));
    const entityIds = entities.map(e => e.id);

    let fields: any[] = [];
    let relations: any[] = [];
    let statuses: any[] = [];
    let forms: any[] = [];
    let views: any[] = [];
    let actions: any[] = [];

    if (entityIds.length > 0) {
      fields = await db.select().from(entityFieldsTable).where(inArray(entityFieldsTable.entityId, entityIds));
      relations = await db.select().from(entityRelationsTable).where(inArray(entityRelationsTable.sourceEntityId, entityIds));
      statuses = await db.select().from(entityStatusesTable).where(inArray(entityStatusesTable.entityId, entityIds));
      forms = await db.select().from(formDefinitionsTable).where(inArray(formDefinitionsTable.entityId, entityIds));
      views = await db.select().from(viewDefinitionsTable).where(inArray(viewDefinitionsTable.entityId, entityIds));
      actions = await db.select().from(actionDefinitionsTable).where(inArray(actionDefinitionsTable.entityId, entityIds));
    }

    const widgets = await db.select().from(platformWidgetsTable).where(eq(platformWidgetsTable.moduleId, id));
    const workflows = await db.select().from(platformWorkflowsTable).where(eq(platformWorkflowsTable.moduleId, id));

    res.json({
      module,
      entities: entities.map(entity => ({
        ...entity,
        fields: fields.filter(f => f.entityId === entity.id),
        relations: relations.filter(r => r.sourceEntityId === entity.id),
        statuses: statuses.filter(s => s.entityId === entity.id),
        forms: forms.filter(f => f.entityId === entity.id),
        views: views.filter(v => v.entityId === entity.id),
        actions: actions.filter(a => a.entityId === entity.id),
      })),
      widgets,
      workflows,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/entities", async (_req, res) => {
  try {
    const entities = await db.select().from(moduleEntitiesTable).orderBy(asc(moduleEntitiesTable.sortOrder));
    const fieldCounts = await db
      .select({ entityId: entityFieldsTable.entityId, count: count() })
      .from(entityFieldsTable)
      .groupBy(entityFieldsTable.entityId);
    const countMap = Object.fromEntries(fieldCounts.map(f => [f.entityId, Number(f.count)]));
    res.json(entities.map(e => ({ ...e, fieldCount: countMap[e.id] || 0 })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/entities/:id/full", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid entity ID" });
    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, id));
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    const [fields, relations, statuses, transitions, forms, views, actions, details, categories, buttons, validations] = await Promise.all([
      db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, id)).orderBy(asc(entityFieldsTable.sortOrder)),
      db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, id)),
      db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, id)).orderBy(asc(entityStatusesTable.sortOrder)),
      db.select().from(statusTransitionsTable).where(eq(statusTransitionsTable.entityId, id)),
      db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, id)),
      db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, id)),
      db.select().from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, id)),
      db.select().from(detailDefinitionsTable).where(eq(detailDefinitionsTable.entityId, id)),
      db.select().from(systemCategoriesTable).where(eq(systemCategoriesTable.entityId, id)),
      db.select().from(systemButtonsTable).where(eq(systemButtonsTable.entityId, id)),
      db.select().from(systemValidationsTable).where(eq(systemValidationsTable.entityId, id)),
    ]);

    const recordCount = await db.select({ count: count() }).from(entityRecordsTable).where(eq(entityRecordsTable.entityId, id));

    res.json({
      entity,
      fields,
      relations,
      statuses,
      transitions,
      forms,
      views,
      actions,
      details,
      categories,
      buttons,
      validations,
      recordCount: Number(recordCount[0]?.count || 0),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/fields", async (_req, res) => {
  try {
    const fields = await db.select().from(entityFieldsTable).orderBy(asc(entityFieldsTable.entityId), asc(entityFieldsTable.sortOrder));
    res.json(fields);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/relations", async (_req, res) => {
  try {
    const relations = await db.select().from(entityRelationsTable);
    res.json(relations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/statuses", async (_req, res) => {
  try {
    const statuses = await db.select().from(entityStatusesTable).orderBy(asc(entityStatusesTable.entityId), asc(entityStatusesTable.sortOrder));
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/forms", async (_req, res) => {
  try {
    const forms = await db.select().from(formDefinitionsTable);
    res.json(forms);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/views", async (_req, res) => {
  try {
    const views = await db.select().from(viewDefinitionsTable);
    res.json(views);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/actions", async (_req, res) => {
  try {
    const actions = await db.select().from(actionDefinitionsTable);
    res.json(actions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/categories", async (_req, res) => {
  try {
    const categories = await db.select().from(systemCategoriesTable).orderBy(asc(systemCategoriesTable.sortOrder));
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/buttons", async (_req, res) => {
  try {
    const buttons = await db.select().from(systemButtonsTable).orderBy(asc(systemButtonsTable.sortOrder));
    res.json(buttons);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/permissions", async (_req, res) => {
  try {
    const permissions = await db.select().from(systemPermissionsTable);
    res.json(permissions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/menu-items", async (_req, res) => {
  try {
    const menuItems = await db.select().from(systemMenuItemsTable).orderBy(asc(systemMenuItemsTable.sortOrder));
    res.json(menuItems);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/dashboards", async (_req, res) => {
  try {
    const pages = await db.select().from(systemDashboardPagesTable);
    const widgets = await db.select().from(systemDashboardWidgetsTable);
    res.json(pages.map(p => ({
      ...p,
      widgets: widgets.filter(w => w.dashboardId === p.id),
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/workflows", async (_req, res) => {
  try {
    const workflows = await db.select().from(platformWorkflowsTable);
    res.json(workflows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/widgets", async (_req, res) => {
  try {
    const widgets = await db.select().from(platformWidgetsTable);
    res.json(widgets);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/templates", async (_req, res) => {
  try {
    const templates = await db.select().from(systemTemplatesTable);
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/validations", async (_req, res) => {
  try {
    const validations = await db.select().from(systemValidationsTable);
    res.json(validations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/versions", async (_req, res) => {
  try {
    const versions = await db.select().from(systemVersionsTable);
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/claude/system/detail-pages", async (_req, res) => {
  try {
    const pages = await db.select().from(systemDetailPagesTable);
    const sections = await db.select().from(systemDetailSectionsTable);
    res.json(pages.map(p => ({
      ...p,
      sections: sections.filter(s => s.detailPageId === p.id),
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
