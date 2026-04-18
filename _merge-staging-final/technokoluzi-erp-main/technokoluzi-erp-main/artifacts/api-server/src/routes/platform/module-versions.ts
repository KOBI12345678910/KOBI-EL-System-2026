import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  moduleVersionsTable,
  versionChangesTable,
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  entityStatusesTable,
  viewDefinitionsTable,
  formDefinitionsTable,
  actionDefinitionsTable,
} from "@workspace/db/schema";
import { eq, desc, and, max, asc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

async function createModuleSnapshot(moduleId: number) {
  const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, moduleId));
  if (!mod) return null;

  const entities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, moduleId)).orderBy(asc(moduleEntitiesTable.sortOrder));

  const entityIds = entities.map(e => e.id);

  let fields: any[] = [];
  let relations: any[] = [];
  let statuses: any[] = [];
  let views: any[] = [];
  let forms: any[] = [];
  let actions: any[] = [];

  for (const entityId of entityIds) {
    const ef = await db.select().from(entityFieldsTable).where(eq(entityFieldsTable.entityId, entityId)).orderBy(asc(entityFieldsTable.sortOrder));
    fields.push(...ef);

    const er = await db.select().from(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, entityId));
    relations.push(...er);

    const es = await db.select().from(entityStatusesTable).where(eq(entityStatusesTable.entityId, entityId)).orderBy(asc(entityStatusesTable.sortOrder));
    statuses.push(...es);

    const vd = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entityId));
    views.push(...vd);

    const fd = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entityId));
    forms.push(...fd);

    const ad = await db.select().from(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, entityId));
    actions.push(...ad);
  }

  return {
    module: mod,
    entities,
    fields,
    relations,
    statuses,
    views,
    forms,
    actions,
    snapshotAt: new Date().toISOString(),
  };
}

function computeChanges(oldSnapshot: any, newSnapshot: any): any[] {
  const changes: any[] = [];

  if (!oldSnapshot) {
    changes.push({ changeType: "added", objectType: "module", objectName: newSnapshot.module?.name, objectId: newSnapshot.module?.id });
    for (const e of newSnapshot.entities || []) {
      changes.push({ changeType: "added", objectType: "entity", objectName: e.nameHe || e.name, objectId: e.id });
    }
    for (const f of newSnapshot.fields || []) {
      changes.push({ changeType: "added", objectType: "field", objectName: f.nameHe || f.name, objectId: f.id });
    }
    return changes;
  }

  const oldMod = oldSnapshot.module || {};
  const newMod = newSnapshot.module || {};
  const moduleFields = ["name", "nameHe", "nameEn", "slug", "description", "icon", "color", "category", "status", "settings"];
  for (const field of moduleFields) {
    const ov = JSON.stringify(oldMod[field]);
    const nv = JSON.stringify(newMod[field]);
    if (ov !== nv) {
      changes.push({ changeType: "modified", objectType: "module", objectName: newMod.nameHe || newMod.name, objectId: newMod.id, field, oldValue: oldMod[field], newValue: newMod[field] });
    }
  }

  const diffCollection = (oldItems: any[], newItems: any[], type: string, nameField = "name") => {
    const oldMap = new Map(oldItems.map(i => [i.id, i]));
    const newMap = new Map(newItems.map(i => [i.id, i]));

    for (const [id, item] of newMap) {
      if (!oldMap.has(id)) {
        changes.push({ changeType: "added", objectType: type, objectName: item.nameHe || item[nameField] || item.slug, objectId: id });
      } else {
        const oldItem = oldMap.get(id);
        const keys = new Set([...Object.keys(oldItem), ...Object.keys(item)]);
        for (const key of keys) {
          if (key === "id" || key === "createdAt" || key === "updatedAt") continue;
          const ov = JSON.stringify(oldItem[key]);
          const nv = JSON.stringify(item[key]);
          if (ov !== nv) {
            changes.push({ changeType: "modified", objectType: type, objectName: item.nameHe || item[nameField] || item.slug, objectId: id, field: key, oldValue: oldItem[key], newValue: item[key] });
          }
        }
      }
    }

    for (const [id, item] of oldMap) {
      if (!newMap.has(id)) {
        changes.push({ changeType: "removed", objectType: type, objectName: item.nameHe || item[nameField] || item.slug, objectId: id });
      }
    }
  };

  diffCollection(oldSnapshot.entities || [], newSnapshot.entities || [], "entity");
  diffCollection(oldSnapshot.fields || [], newSnapshot.fields || [], "field");
  diffCollection(oldSnapshot.relations || [], newSnapshot.relations || [], "relation", "label");
  diffCollection(oldSnapshot.statuses || [], newSnapshot.statuses || [], "status");
  diffCollection(oldSnapshot.views || [], newSnapshot.views || [], "view");
  diffCollection(oldSnapshot.forms || [], newSnapshot.forms || [], "form");
  diffCollection(oldSnapshot.actions || [], newSnapshot.actions || [], "action");

  return changes;
}

router.post("/platform/modules/:moduleId/publish-version", async (req, res) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const { label, notes, publishedBy } = req.body || {};

    const snapshot = await createModuleSnapshot(moduleId);
    if (!snapshot) return res.status(404).json({ message: "Module not found" });

    const existing = await db.select({ maxVer: max(moduleVersionsTable.versionNumber) })
      .from(moduleVersionsTable)
      .where(eq(moduleVersionsTable.moduleId, moduleId));
    const nextVersion = ((existing[0]?.maxVer as number) || 0) + 1;

    const previousVersions = await db.select()
      .from(moduleVersionsTable)
      .where(eq(moduleVersionsTable.moduleId, moduleId))
      .orderBy(desc(moduleVersionsTable.versionNumber))
      .limit(1);

    const previousSnapshot = previousVersions.length > 0 ? previousVersions[0].snapshot : null;

    const [version] = await db.insert(moduleVersionsTable).values({
      moduleId,
      versionNumber: nextVersion,
      label: label || `v${nextVersion}`,
      notes: notes || null,
      snapshot: snapshot as any,
      publishedBy: publishedBy || "system",
    }).returning();

    const changes = computeChanges(previousSnapshot, snapshot);

    if (changes.length > 0) {
      await db.insert(versionChangesTable).values(
        changes.map(c => ({
          moduleVersionId: version.id,
          changeType: c.changeType,
          objectType: c.objectType,
          objectId: c.objectId || null,
          objectName: c.objectName || null,
          field: c.field || null,
          oldValue: c.oldValue !== undefined ? c.oldValue : null,
          newValue: c.newValue !== undefined ? c.newValue : null,
        }))
      );
    }

    await db.update(platformModulesTable)
      .set({ status: "published", version: nextVersion, updatedAt: new Date() })
      .where(eq(platformModulesTable.id, moduleId));

    const savedChanges = await db.select()
      .from(versionChangesTable)
      .where(eq(versionChangesTable.moduleVersionId, version.id));

    res.status(201).json({ version, changes: savedChanges });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/modules/:moduleId/versions", async (req, res) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const versions = await db.select()
      .from(moduleVersionsTable)
      .where(eq(moduleVersionsTable.moduleId, moduleId))
      .orderBy(desc(moduleVersionsTable.versionNumber));
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/module-versions/:versionId", async (req, res) => {
  try {
    const versionId = Number(req.params.versionId);
    const [version] = await db.select()
      .from(moduleVersionsTable)
      .where(eq(moduleVersionsTable.id, versionId));
    if (!version) return res.status(404).json({ message: "Version not found" });

    const changes = await db.select()
      .from(versionChangesTable)
      .where(eq(versionChangesTable.moduleVersionId, versionId));

    res.json({ ...version, changes });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/module-versions/:versionId/diff/:compareVersionId", async (req, res) => {
  try {
    const versionId = Number(req.params.versionId);
    const compareVersionId = Number(req.params.compareVersionId);

    const [v1] = await db.select().from(moduleVersionsTable).where(eq(moduleVersionsTable.id, versionId));
    const [v2] = await db.select().from(moduleVersionsTable).where(eq(moduleVersionsTable.id, compareVersionId));

    if (!v1 || !v2) return res.status(404).json({ message: "One or both versions not found" });

    const older = v1.versionNumber < v2.versionNumber ? v1 : v2;
    const newer = v1.versionNumber < v2.versionNumber ? v2 : v1;

    const changes = computeChanges(older.snapshot, newer.snapshot);

    res.json({
      from: { id: older.id, versionNumber: older.versionNumber, label: older.label, createdAt: older.createdAt },
      to: { id: newer.id, versionNumber: newer.versionNumber, label: newer.label, createdAt: newer.createdAt },
      changes,
      summary: {
        added: changes.filter(c => c.changeType === "added").length,
        modified: changes.filter(c => c.changeType === "modified").length,
        removed: changes.filter(c => c.changeType === "removed").length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/module-versions/:versionId/rollback", async (req, res) => {
  try {
    const versionId = Number(req.params.versionId);
    const [version] = await db.select().from(moduleVersionsTable).where(eq(moduleVersionsTable.id, versionId));
    if (!version) return res.status(404).json({ message: "Version not found" });

    const snapshot = version.snapshot as any;
    if (!snapshot || !snapshot.module) return res.status(400).json({ message: "Invalid snapshot data" });

    const moduleId = version.moduleId;

    const { id: _id, createdAt: _ca, ...moduleData } = snapshot.module;
    await db.update(platformModulesTable)
      .set({ ...moduleData, updatedAt: new Date() })
      .where(eq(platformModulesTable.id, moduleId));

    const currentEntities = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, moduleId));
    for (const entity of currentEntities) {
      await db.delete(entityFieldsTable).where(eq(entityFieldsTable.entityId, entity.id));
      await db.delete(entityRelationsTable).where(eq(entityRelationsTable.sourceEntityId, entity.id));
      await db.delete(entityStatusesTable).where(eq(entityStatusesTable.entityId, entity.id));
      await db.delete(viewDefinitionsTable).where(eq(viewDefinitionsTable.entityId, entity.id));
      await db.delete(formDefinitionsTable).where(eq(formDefinitionsTable.entityId, entity.id));
      await db.delete(actionDefinitionsTable).where(eq(actionDefinitionsTable.entityId, entity.id));
    }
    await db.delete(moduleEntitiesTable).where(eq(moduleEntitiesTable.moduleId, moduleId));

    const entityIdMap = new Map<number, number>();

    for (const entity of (snapshot.entities || [])) {
      const { id: oldId, createdAt: _c, updatedAt: _u, ...entityData } = entity;
      const [newEntity] = await db.insert(moduleEntitiesTable).values({ ...entityData, moduleId }).returning();
      entityIdMap.set(oldId, newEntity.id);
    }

    for (const field of (snapshot.fields || [])) {
      const { id: _fid, createdAt: _c, updatedAt: _u, ...fieldData } = field;
      const newEntityId = entityIdMap.get(field.entityId);
      if (newEntityId) {
        await db.insert(entityFieldsTable).values({ ...fieldData, entityId: newEntityId });
      }
    }

    for (const relation of (snapshot.relations || [])) {
      const { id: _rid, createdAt: _c, ...relationData } = relation;
      const newSourceId = entityIdMap.get(relation.sourceEntityId);
      const newTargetId = entityIdMap.get(relation.targetEntityId);
      if (newSourceId) {
        await db.insert(entityRelationsTable).values({
          ...relationData,
          sourceEntityId: newSourceId,
          targetEntityId: newTargetId || relation.targetEntityId,
        });
      }
    }

    for (const status of (snapshot.statuses || [])) {
      const { id: _sid, createdAt: _c, ...statusData } = status;
      const newEntityId = entityIdMap.get(status.entityId);
      if (newEntityId) {
        await db.insert(entityStatusesTable).values({ ...statusData, entityId: newEntityId });
      }
    }

    for (const view of (snapshot.views || [])) {
      const { id: _vid, createdAt: _c, updatedAt: _u, ...viewData } = view;
      const newEntityId = entityIdMap.get(view.entityId);
      if (newEntityId) {
        await db.insert(viewDefinitionsTable).values({ ...viewData, entityId: newEntityId });
      }
    }

    for (const form of (snapshot.forms || [])) {
      const { id: _foid, createdAt: _c, updatedAt: _u, ...formData } = form;
      const newEntityId = entityIdMap.get(form.entityId);
      if (newEntityId) {
        await db.insert(formDefinitionsTable).values({ ...formData, entityId: newEntityId });
      }
    }

    for (const action of (snapshot.actions || [])) {
      const { id: _aid, createdAt: _c, updatedAt: _u, ...actionData } = action;
      const newEntityId = entityIdMap.get(action.entityId);
      if (newEntityId) {
        await db.insert(actionDefinitionsTable).values({ ...actionData, entityId: newEntityId });
      }
    }

    const newSnapshot = await createModuleSnapshot(moduleId);

    const existing = await db.select({ maxVer: max(moduleVersionsTable.versionNumber) })
      .from(moduleVersionsTable)
      .where(eq(moduleVersionsTable.moduleId, moduleId));
    const nextVersion = ((existing[0]?.maxVer as number) || 0) + 1;

    const [rollbackVersion] = await db.insert(moduleVersionsTable).values({
      moduleId,
      versionNumber: nextVersion,
      label: `v${nextVersion} (rollback to v${version.versionNumber})`,
      notes: `Rolled back to version ${version.versionNumber}`,
      snapshot: newSnapshot as any,
      publishedBy: req.body?.publishedBy || "system_rollback",
    }).returning();

    res.json({
      message: `Successfully rolled back to version ${version.versionNumber}`,
      version: rollbackVersion,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/modules/:moduleId/current-snapshot", async (req, res) => {
  try {
    const moduleId = Number(req.params.moduleId);
    const snapshot = await createModuleSnapshot(moduleId);
    if (!snapshot) return res.status(404).json({ message: "Module not found" });
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
