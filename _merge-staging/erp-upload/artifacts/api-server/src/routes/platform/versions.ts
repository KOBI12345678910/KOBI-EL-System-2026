import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  systemVersionsTable,
  systemPublishLogsTable,
  platformModulesTable,
  moduleEntitiesTable,
} from "@workspace/db/schema";
import { eq, desc, and, max } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const ENTITY_TYPE_TABLE_MAP: Record<string, { table: any; idField: any }> = {
  module: { table: platformModulesTable, idField: platformModulesTable.id },
  entity: { table: moduleEntitiesTable, idField: moduleEntitiesTable.id },
};

router.get("/platform/versions", async (req, res) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    let query = db.select().from(systemVersionsTable).orderBy(desc(systemVersionsTable.createdAt));
    if (entityType) {
      query = query.where(eq(systemVersionsTable.entityType, entityType)) as typeof query;
    }
    const versions = await query;
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/versions/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [version] = await db.select().from(systemVersionsTable).where(eq(systemVersionsTable.id, id));
    if (!version) return res.status(404).json({ message: "Version not found" });
    res.json(version);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/versions", async (req, res) => {
  try {
    const body = z.object({
      entityType: z.string().min(1),
      entityId: z.number().int(),
      data: z.record(z.string(), z.any()),
      createdBy: z.string().optional().nullable(),
    }).parse(req.body);

    const existing = await db.select({ maxVer: max(systemVersionsTable.versionNumber) })
      .from(systemVersionsTable)
      .where(and(
        eq(systemVersionsTable.entityType, body.entityType),
        eq(systemVersionsTable.entityId, body.entityId),
      ));
    const nextVersion = ((existing[0]?.maxVer as number) || 0) + 1;

    const [version] = await db.insert(systemVersionsTable).values({
      ...body,
      versionNumber: nextVersion,
    }).returning();
    res.status(201).json(version);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/versions/:id/rollback", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [version] = await db.select().from(systemVersionsTable).where(eq(systemVersionsTable.id, id));
    if (!version) return res.status(404).json({ message: "Version not found" });

    const mapping = ENTITY_TYPE_TABLE_MAP[version.entityType];

    if (!mapping) {
      return res.status(400).json({
        message: `Unsupported entity type for rollback: "${version.entityType}". Supported types: ${Object.keys(ENTITY_TYPE_TABLE_MAP).join(", ")}`,
      });
    }

    if (!version.data || typeof version.data !== "object") {
      return res.status(400).json({ message: "Version has no snapshot data to restore" });
    }

    const snapshotData = { ...(version.data as Record<string, any>) };
    delete snapshotData.id;
    delete snapshotData.createdAt;

    const [updated] = await db.update(mapping.table)
      .set({ ...snapshotData, updatedAt: new Date() })
      .where(eq(mapping.idField, version.entityId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: `Target ${version.entityType} with id ${version.entityId} not found` });
    }

    const currentVersions = await db.select({ maxVer: max(systemVersionsTable.versionNumber) })
      .from(systemVersionsTable)
      .where(and(
        eq(systemVersionsTable.entityType, version.entityType),
        eq(systemVersionsTable.entityId, version.entityId),
      ));
    const nextVersion = ((currentVersions[0]?.maxVer as number) || 0) + 1;

    const [newVersion] = await db.insert(systemVersionsTable).values({
      entityType: version.entityType,
      entityId: version.entityId,
      versionNumber: nextVersion,
      data: version.data,
      createdBy: "system_rollback",
    }).returning();

    const [publishLog] = await db.insert(systemPublishLogsTable).values({
      entityType: version.entityType,
      entityId: version.entityId,
      action: "rollback",
      previousVersion: version.versionNumber,
      newVersion: nextVersion,
      publishedBy: "system",
      notes: `Rolled back to version ${version.versionNumber}`,
    }).returning();

    res.json({
      message: "Rollback completed successfully",
      restored: true,
      version: newVersion,
      publishLog,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/modules/:moduleId/publish", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);

    const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, moduleId));
    if (!mod) return res.status(404).json({ message: "Module not found" });

    const previousVersion = mod.version;

    const [snapshot] = await db.insert(systemVersionsTable).values({
      entityType: "module",
      entityId: moduleId,
      versionNumber: previousVersion,
      data: mod as any,
      createdBy: "publish_pipeline",
    }).returning();

    const newVersion = previousVersion + 1;
    const [updated] = await db.update(platformModulesTable)
      .set({ status: "published", version: newVersion, updatedAt: new Date() })
      .where(eq(platformModulesTable.id, moduleId))
      .returning();

    const [publishLog] = await db.insert(systemPublishLogsTable).values({
      moduleId,
      entityType: "module",
      entityId: moduleId,
      action: "publish",
      previousVersion,
      newVersion,
      publishedBy: req.body?.publishedBy || "system",
      notes: req.body?.notes || `Published module ${mod.name} v${newVersion}`,
    }).returning();

    res.json({ module: updated, version: snapshot, publishLog });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/publish-logs", async (_req, res) => {
  try {
    const logs = await db.select().from(systemPublishLogsTable).orderBy(desc(systemPublishLogsTable.createdAt));
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/publish-logs", async (req, res) => {
  try {
    const body = z.object({
      moduleId: z.number().int().optional().nullable(),
      entityType: z.string().min(1),
      entityId: z.number().int(),
      action: z.string().min(1),
      previousVersion: z.number().int().optional().nullable(),
      newVersion: z.number().int().optional().nullable(),
      publishedBy: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(req.body);
    const [log] = await db.insert(systemPublishLogsTable).values(body).returning();
    res.status(201).json(log);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
