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
  systemButtonsTable,
  systemCategoriesTable,
  systemPermissionsTable,
} from "@workspace/db/schema";
import { eq, and, asc, count } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const ContextRequestBody = z.object({
  moduleId: z.number().int().optional(),
  entityId: z.number().int().optional(),
  recordId: z.number().int().optional(),
  page: z.enum(["list", "form", "detail", "dashboard"]).optional(),
});

router.post("/claude/context/resolve", async (req, res) => {
  try {
    const body = ContextRequestBody.parse(req.body);
    const context: any = { request: body };

    if (body.moduleId) {
      const [module] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, body.moduleId));
      if (module) {
        context.module = module;
        const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, body.moduleId)).orderBy(asc(moduleEntitiesTable.sortOrder));
        context.moduleEntities = entities.map(e => ({ id: e.id, name: e.name, nameHe: e.nameHe, slug: e.slug, entityType: e.entityType }));
      }
    }

    if (body.entityId) {
      const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, body.entityId));
      if (entity) {
        context.entity = entity;

        const [fields, relations, statuses, transitions, views, forms, actions, details, buttons, categories, permissions] = await Promise.all([
          db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, body.entityId)).orderBy(asc(entityFieldsTable.sortOrder)),
          db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, body.entityId)),
          db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, body.entityId)).orderBy(asc(entityStatusesTable.sortOrder)),
          db.select().from(statusTransitionsTable).where(eq(statusTransitionsTable.entityId, body.entityId)),
          db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, body.entityId)),
          db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, body.entityId)),
          db.select().from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, body.entityId)),
          db.select().from(detailDefinitionsTable).where(eq(detailDefinitionsTable.entityId, body.entityId)),
          db.select().from(systemButtonsTable).where(eq(systemButtonsTable.entityId, body.entityId)),
          db.select().from(systemCategoriesTable).where(eq(systemCategoriesTable.entityId, body.entityId)),
          db.select().from(systemPermissionsTable).where(eq(systemPermissionsTable.entityId, body.entityId)),
        ]);

        context.fields = fields;
        context.relations = relations;
        context.statuses = statuses;
        context.statusTransitions = transitions;
        context.availableViews = views;
        context.availableForms = forms;
        context.availableActions = actions;
        context.detailPages = details;
        context.buttons = buttons;
        context.categories = categories;
        context.permissions = permissions;

        if (body.page === "list") {
          context.visibleFields = fields.filter(f => f.showInList);
          context.activeView = views.find(v => v.isDefault) || views[0] || null;
        } else if (body.page === "form") {
          context.visibleFields = fields.filter(f => f.showInForm);
          context.activeForm = forms.find(f => f.isDefault) || forms[0] || null;
        } else if (body.page === "detail") {
          context.visibleFields = fields.filter(f => f.showInDetail);
          context.activeDetail = details.find(d => d.isDefault) || details[0] || null;
        }

        const [recordCountResult] = await db.select({ count: count() }).from(entityRecordsTable).where(eq(entityRecordsTable.entityId, body.entityId));
        context.recordCount = Number(recordCountResult.count);
      }
    }

    if (body.recordId && body.entityId) {
      const [record] = await db.select().from(entityRecordsTable)
        .where(and(eq(entityRecordsTable.id, body.recordId), eq(entityRecordsTable.entityId, body.entityId)));
      if (record) {
        context.record = record;
        if (record.status) {
          const [currentStatus] = await db.select().from(entityStatusesTable)
            .where(and(eq(entityStatusesTable.slug, record.status), eq(entityStatusesTable.entityId, body.entityId)));
          context.currentStatus = currentStatus || null;
          if (currentStatus) {
            const allowedTransitions = await db.select().from(statusTransitionsTable)
              .where(and(eq(statusTransitionsTable.fromStatusId, currentStatus.id), eq(statusTransitionsTable.entityId, body.entityId)));
            const targetStatusIds = allowedTransitions.map(t => t.toStatusId);
            if (targetStatusIds.length > 0) {
              const allStatuses = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, body.entityId));
              context.allowedTransitions = allowedTransitions.map(t => ({
                ...t,
                targetStatus: allStatuses.find(s => s.id === t.toStatusId),
              }));
            }
          }
        }
      } else {
        context.record = null;
        context.recordError = "Record not found for this entity";
      }
    }

    if (!body.moduleId && !body.entityId) {
      context.module = null;
      context.entity = null;
      context.hint = "Provide moduleId and/or entityId to get contextual information";
    }

    res.json(context);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
