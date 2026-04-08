import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  systemPublishLogsTable,
  claudeGovernanceLogsTable,
} from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  validateModuleForPublish,
  validateEntity,
  detectConflicts,
  lintMetadata,
} from "../../services/claude/validation-engine";

const router: IRouter = Router();

const ValidateBody = z.object({
  entityType: z.enum(["module", "entity"]),
  entityId: z.number(),
});

const PublishBody = z.object({
  entityType: z.enum(["module", "entity"]),
  entityId: z.number(),
  force: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

const LintBody = z.object({
  moduleId: z.number().optional(),
});

router.post("/claude/governance/validate", async (req, res) => {
  try {
    const body = ValidateBody.parse(req.body);
    let result;

    if (body.entityType === "module") {
      result = await validateModuleForPublish(body.entityId);
    } else {
      const issues = await validateEntity(body.entityId);
      result = {
        valid: issues.filter(i => i.severity === "error").length === 0,
        issues,
        checkedAt: new Date().toISOString(),
      };
    }

    await db.insert(claudeGovernanceLogsTable).values({
      action: "validate",
      entityType: body.entityType,
      entityId: body.entityId,
      status: result.valid ? "passed" : "failed",
      validationResult: result,
    });

    res.json(result);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/governance/check-conflicts", async (req, res) => {
  try {
    const body = ValidateBody.parse(req.body);
    const conflicts = await detectConflicts(body.entityType, body.entityId);

    await db.insert(claudeGovernanceLogsTable).values({
      action: "check_conflicts",
      entityType: body.entityType,
      entityId: body.entityId,
      status: conflicts.length > 0 ? "conflicts_found" : "clean",
      validationResult: { conflicts },
    });

    res.json({
      hasConflicts: conflicts.filter(c => c.severity === "error" || c.severity === "warning").length > 0,
      conflicts,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/governance/publish", async (req, res) => {
  try {
    const body = PublishBody.parse(req.body);

    if (!body.force) {
      let validationResult;
      if (body.entityType === "module") {
        validationResult = await validateModuleForPublish(body.entityId);
      } else {
        const issues = await validateEntity(body.entityId);
        validationResult = {
          valid: issues.filter(i => i.severity === "error").length === 0,
          issues,
          checkedAt: new Date().toISOString(),
        };
      }

      if (!validationResult.valid) {
        await db.insert(claudeGovernanceLogsTable).values({
          action: "publish_rejected",
          entityType: body.entityType,
          entityId: body.entityId,
          status: "validation_failed",
          validationResult,
          notes: body.notes,
        });

        return res.status(422).json({
          published: false,
          reason: "Validation failed. Fix errors before publishing or use force=true.",
          validation: validationResult,
        });
      }
    }

    let previousState: any = null;
    let newState: any = null;

    if (body.entityType === "module") {
      const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, body.entityId));
      if (!mod) return res.status(404).json({ message: "Module not found" });

      previousState = { ...mod };
      const previousVersion = mod.version;
      const newVersion = previousVersion + 1;

      await db.transaction(async (tx) => {
        const [updated] = await tx.update(platformModulesTable)
          .set({ status: "published", version: newVersion, updatedAt: new Date() })
          .where(eq(platformModulesTable.id, body.entityId))
          .returning();

        newState = updated;

        await tx.insert(systemPublishLogsTable).values({
          moduleId: body.entityId,
          entityType: "module",
          entityId: body.entityId,
          action: "publish",
          previousVersion,
          newVersion,
          publishedBy: "claude",
          notes: body.notes,
        });

        await tx.insert(claudeGovernanceLogsTable).values({
          action: "publish",
          entityType: body.entityType,
          entityId: body.entityId,
          status: "published",
          previousState,
          newState,
          notes: body.notes,
        });
      });
    } else {
      const [entity] = await db.select().from(moduleEntitiesTable).where(eq(moduleEntitiesTable.id, body.entityId));
      if (!entity) return res.status(404).json({ message: "Entity not found" });

      previousState = { ...entity };

      await db.transaction(async (tx) => {
        const [updated] = await tx.update(moduleEntitiesTable)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(moduleEntitiesTable.id, body.entityId))
          .returning();

        newState = updated;

        await tx.insert(systemPublishLogsTable).values({
          moduleId: entity.moduleId,
          entityType: "entity",
          entityId: body.entityId,
          action: "publish",
          publishedBy: "claude",
          notes: body.notes,
        });

        await tx.insert(claudeGovernanceLogsTable).values({
          action: "publish",
          entityType: body.entityType,
          entityId: body.entityId,
          status: "published",
          previousState,
          newState,
          notes: body.notes,
        });
      });
    }

    res.json({
      published: true,
      entityType: body.entityType,
      entityId: body.entityId,
      state: newState,
      publishedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/governance/lint", async (req, res) => {
  try {
    const body = LintBody.parse(req.body);
    const result = await lintMetadata(body.moduleId);

    await db.insert(claudeGovernanceLogsTable).values({
      action: "lint",
      entityType: body.moduleId ? "module" : "system",
      entityId: body.moduleId || 0,
      status: result.valid ? "clean" : "issues_found",
      validationResult: result,
    });

    res.json(result);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/governance/publish-logs", async (req, res) => {
  try {
    const moduleId = req.query.moduleId ? Number(req.query.moduleId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    let query = db.select().from(systemPublishLogsTable).orderBy(desc(systemPublishLogsTable.createdAt)).limit(limit);

    if (moduleId) {
      query = db.select().from(systemPublishLogsTable)
        .where(eq(systemPublishLogsTable.moduleId, moduleId))
        .orderBy(desc(systemPublishLogsTable.createdAt))
        .limit(limit);
    }

    const logs = await query;
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/claude/governance/logs", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const logs = await db.select().from(claudeGovernanceLogsTable)
      .orderBy(desc(claudeGovernanceLogsTable.createdAt))
      .limit(limit);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/claude/governance/enforce-draft", async (req, res) => {
  try {
    const body = z.object({
      entityType: z.enum(["module"]),
      entityId: z.number(),
    }).parse(req.body);

    const [mod] = await db.select().from(platformModulesTable).where(eq(platformModulesTable.id, body.entityId));
    if (!mod) return res.status(404).json({ message: "Module not found" });

    if (mod.status === "draft") {
      return res.json({ alreadyDraft: true, module: mod });
    }

    const previousState = { ...mod };
    const [updated] = await db.update(platformModulesTable)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(platformModulesTable.id, body.entityId))
      .returning();

    await db.insert(claudeGovernanceLogsTable).values({
      action: "enforce_draft",
      entityType: body.entityType,
      entityId: body.entityId,
      status: "reverted_to_draft",
      previousState,
      newState: updated,
    });

    res.json({ reverted: true, module: updated });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
