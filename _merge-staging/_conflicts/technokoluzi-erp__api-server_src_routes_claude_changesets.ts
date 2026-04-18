import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityStatusesTable,
  viewDefinitionsTable,
  formDefinitionsTable,
  actionDefinitionsTable,
  systemPublishLogsTable,
  systemVersionsTable,
  claudeGovernanceLogsTable,
} from "@workspace/db/schema";
import { eq, desc, and, gte, lte, count } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/claude/changesets/module/:moduleId", async (req, res) => {
  try {
    const moduleId = Number(req.params.moduleId);

    const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, moduleId));
    if (!mod) return res.status(404).json({ message: "Module not found" });

    const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, moduleId));

    const publishLogs = await db.select().from(systemPublishLogsTable)
      .where(and(eq(systemPublishLogsTable.moduleId, moduleId), eq(systemPublishLogsTable.entityType, "module")))
      .orderBy(desc(systemPublishLogsTable.createdAt));

    const lastPublish = publishLogs.length > 0 ? publishLogs[0] : null;

    const governanceLogs = await db.select().from(claudeGovernanceLogsTable)
      .where(eq(claudeGovernanceLogsTable.entityId, moduleId))
      .orderBy(desc(claudeGovernanceLogsTable.createdAt))
      .limit(20);

    const changes: any[] = [];

    if (lastPublish) {
      const lastPublishDate = lastPublish.createdAt;

      for (const entity of entities) {
        if (entity.updatedAt > lastPublishDate) {
          changes.push({
            type: "entity_modified",
            entityType: "entity",
            entityId: entity.id,
            entityName: entity.name,
            modifiedAt: entity.updatedAt,
          });
        }

        const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id));
        for (const field of fields) {
          if (field.updatedAt > lastPublishDate) {
            changes.push({
              type: "field_modified",
              entityType: "field",
              entityId: field.id,
              entityName: `${entity.name}.${field.name}`,
              modifiedAt: field.updatedAt,
            });
          }
        }
      }

      if (mod.updatedAt > lastPublishDate) {
        changes.push({
          type: "module_modified",
          entityType: "module",
          entityId: mod.id,
          entityName: mod.name,
          modifiedAt: mod.updatedAt,
        });
      }
    } else {
      changes.push({
        type: "never_published",
        entityType: "module",
        entityId: mod.id,
        entityName: mod.name,
        modifiedAt: mod.updatedAt,
      });
    }

    res.json({
      module: { id: mod.id, name: mod.name, slug: mod.slug, status: mod.status, version: mod.version },
      lastPublish: lastPublish ? {
        id: lastPublish.id,
        action: lastPublish.action,
        publishedBy: lastPublish.publishedBy,
        publishedAt: lastPublish.createdAt,
        version: lastPublish.newVersion,
      } : null,
      changesSinceLastPublish: changes,
      changeCount: changes.length,
      publishHistory: publishLogs.slice(0, 10),
      recentGovernanceActions: governanceLogs,
    });
  } catch (err: any) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/changesets/entity/:entityId", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);

    const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, entityId));
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entityId));
    const relations = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, entityId));
    const views = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entityId));
    const forms = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entityId));
    const actions = await db.select().from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, entityId));
    const statuses = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, entityId));

    const versions = await db.select().from(systemVersionsTable)
      .where(and(eq(systemVersionsTable.entityType, "entity"), eq(systemVersionsTable.entityId, entityId)))
      .orderBy(desc(systemVersionsTable.createdAt))
      .limit(10);

    const currentSnapshot = {
      entity: { id: entity.id, name: entity.name, slug: entity.slug, entityType: entity.entityType, isActive: entity.isActive },
      fieldCount: fields.length,
      relationCount: relations.length,
      viewCount: views.length,
      formCount: forms.length,
      actionCount: actions.length,
      statusCount: statuses.length,
      fields: fields.map(f => ({ id: f.id, name: f.name, slug: f.slug, fieldType: f.fieldType })),
      relations: relations.map(r => ({ id: r.id, targetEntityId: r.targetEntityId, relationType: r.relationType, label: r.label })),
    };

    const lastVersion = versions.length > 0 ? versions[0] : null;
    let diff: any = null;

    if (lastVersion && lastVersion.data && typeof lastVersion.data === "object") {
      const prevData = lastVersion.data as any;
      diff = {
        versionCompared: lastVersion.versionNumber,
        comparedAt: lastVersion.createdAt,
        fieldCountChange: fields.length - (prevData.fieldCount || 0),
        relationCountChange: relations.length - (prevData.relationCount || 0),
        viewCountChange: views.length - (prevData.viewCount || 0),
        formCountChange: forms.length - (prevData.formCount || 0),
      };
    }

    res.json({
      currentSnapshot,
      lastVersion: lastVersion ? { id: lastVersion.id, versionNumber: lastVersion.versionNumber, createdAt: lastVersion.createdAt, createdBy: lastVersion.createdBy } : null,
      diff,
      versionHistory: versions,
    });
  } catch (err: any) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/changesets/diff", async (req, res) => {
  try {
    const body = z.object({
      entityType: z.enum(["module", "entity"]),
      entityId: z.number(),
    }).parse(req.body);

    if (body.entityType === "module") {
      const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, body.entityId));
      if (!mod) return res.status(404).json({ message: "Module not found" });

      const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, body.entityId));

      const lastPublishLogs = await db.select().from(systemPublishLogsTable)
        .where(and(eq(systemPublishLogsTable.moduleId, body.entityId), eq(systemPublishLogsTable.entityType, "module")))
        .orderBy(desc(systemPublishLogsTable.createdAt))
        .limit(1);

      const lastVersion = lastPublishLogs.length > 0 ? lastPublishLogs[0] : null;

      const governanceLogs = await db.select().from(claudeGovernanceLogsTable)
        .where(eq(claudeGovernanceLogsTable.entityId, body.entityId))
        .orderBy(desc(claudeGovernanceLogsTable.createdAt))
        .limit(5);

      const stateChanges = governanceLogs.filter(g => g.previousState && g.newState);

      res.json({
        entityType: "module",
        entityId: body.entityId,
        current: {
          name: mod.name,
          slug: mod.slug,
          status: mod.status,
          version: mod.version,
          entityCount: entities.length,
        },
        lastPublished: lastVersion ? {
          version: lastVersion.newVersion,
          publishedAt: lastVersion.createdAt,
          publishedBy: lastVersion.publishedBy,
        } : null,
        isDirty: mod.status === "draft" || (lastVersion ? mod.updatedAt > lastVersion.createdAt : true),
        recentChanges: stateChanges.map(g => ({
          action: g.action,
          performedAt: g.createdAt,
          previousState: g.previousState,
          newState: g.newState,
        })),
      });
    } else {
      const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, body.entityId));
      if (!entity) return res.status(404).json({ message: "Entity not found" });

      const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, body.entityId));
      const views = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, body.entityId));
      const forms = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, body.entityId));

      const lastVersions = await db.select().from(systemVersionsTable)
        .where(and(eq(systemVersionsTable.entityType, "entity"), eq(systemVersionsTable.entityId, body.entityId)))
        .orderBy(desc(systemVersionsTable.createdAt))
        .limit(1);

      const lastVersion = lastVersions.length > 0 ? lastVersions[0] : null;
      const prevData = (lastVersion?.data && typeof lastVersion.data === "object") ? lastVersion.data as any : null;

      const currentSummary = { fieldCount: fields.length, viewCount: views.length, formCount: forms.length };
      const changes: string[] = [];

      if (prevData) {
        if (fields.length !== (prevData.fieldCount || 0)) changes.push(`Fields: ${prevData.fieldCount || 0} → ${fields.length}`);
        if (views.length !== (prevData.viewCount || 0)) changes.push(`Views: ${prevData.viewCount || 0} → ${views.length}`);
        if (forms.length !== (prevData.formCount || 0)) changes.push(`Forms: ${prevData.formCount || 0} → ${forms.length}`);
      }

      res.json({
        entityType: "entity",
        entityId: body.entityId,
        current: {
          name: entity.name,
          slug: entity.slug,
          isActive: entity.isActive,
          ...currentSummary,
        },
        lastVersion: lastVersion ? {
          versionNumber: lastVersion.versionNumber,
          createdAt: lastVersion.createdAt,
          data: prevData,
        } : null,
        isDirty: lastVersion ? entity.updatedAt > lastVersion.createdAt : true,
        changes,
      });
    }
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/changesets/snapshot", async (req, res) => {
  try {
    const body = z.object({
      entityType: z.enum(["module", "entity"]),
      entityId: z.number(),
      notes: z.string().optional(),
    }).parse(req.body);

    let snapshotData: any;
    let versionNumber = 1;

    const existingVersions = await db.select().from(systemVersionsTable)
      .where(and(eq(systemVersionsTable.entityType, body.entityType), eq(systemVersionsTable.entityId, body.entityId)))
      .orderBy(desc(systemVersionsTable.versionNumber))
      .limit(1);

    if (existingVersions.length > 0) {
      versionNumber = existingVersions[0].versionNumber + 1;
    }

    if (body.entityType === "module") {
      const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, body.entityId));
      if (!mod) return res.status(404).json({ message: "Module not found" });

      const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, body.entityId));
      snapshotData = {
        module: mod,
        entityCount: entities.length,
        entities: entities.map(e => ({ id: e.id, name: e.name, slug: e.slug })),
        snapshotAt: new Date().toISOString(),
      };
    } else {
      const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, body.entityId));
      if (!entity) return res.status(404).json({ message: "Entity not found" });

      const fields = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, body.entityId));
      const views = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, body.entityId));
      const forms = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, body.entityId));

      snapshotData = {
        entity,
        fieldCount: fields.length,
        viewCount: views.length,
        formCount: forms.length,
        fields: fields.map(f => ({ id: f.id, name: f.name, slug: f.slug, fieldType: f.fieldType })),
        snapshotAt: new Date().toISOString(),
      };
    }

    const [version] = await db.insert(systemVersionsTable).values({
      entityType: body.entityType,
      entityId: body.entityId,
      versionNumber,
      data: snapshotData,
      createdBy: "claude",
    }).returning();

    res.status(201).json({
      version: { id: version.id, versionNumber: version.versionNumber, createdAt: version.createdAt },
      snapshot: snapshotData,
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/changesets/versions/:entityType/:entityId", async (req, res) => {
  try {
    const entityType = req.params.entityType;
    const entityId = Number(req.params.entityId);

    const versions = await db.select().from(systemVersionsTable)
      .where(and(eq(systemVersionsTable.entityType, entityType), eq(systemVersionsTable.entityId, entityId)))
      .orderBy(desc(systemVersionsTable.createdAt));

    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
