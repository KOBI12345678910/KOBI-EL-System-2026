import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  dataScopeRulesTable,
  platformRolesTable,
  roleAssignmentsTable,
  moduleEntitiesTable,
  platformModulesTable,
  recordAuditLogTable,
  entityRecordsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, asc, desc, sql, inArray, count, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { requireSuperAdmin } from "../../lib/permission-middleware";
import { invalidateAssignmentCache } from "../../lib/permission-engine";

const router: IRouter = Router();

const CreateScopeRuleBody = z.object({
  roleId: z.number(),
  entityId: z.number(),
  scopeType: z.enum(["all", "own", "field_equals", "field_contains", "field_in", "assigned_to_me", "created_by_me"]),
  field: z.string().optional(),
  operator: z.string().optional(),
  value: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  settings: z.record(z.string(), z.any()).optional(),
});

const UpdateScopeRuleBody = CreateScopeRuleBody.partial();

router.get("/platform/governance/scope-rules", requireSuperAdmin, async (req, res) => {
  try {
    const roleId = req.query.roleId ? Number(req.query.roleId) : undefined;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;

    const conditions: SQL[] = [];
    if (roleId) conditions.push(eq(dataScopeRulesTable.roleId, roleId));
    if (entityId) conditions.push(eq(dataScopeRulesTable.entityId, entityId));

    const rules = conditions.length > 0
      ? await db.select().from(dataScopeRulesTable).where(and(...conditions)).orderBy(asc(dataScopeRulesTable.id))
      : await db.select().from(dataScopeRulesTable).orderBy(asc(dataScopeRulesTable.id));

    res.json(rules);
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to fetch scope rules" });
  }
});

router.post("/platform/governance/scope-rules", requireSuperAdmin, async (req, res) => {
  try {
    const body = CreateScopeRuleBody.parse(req.body);
    const [rule] = await db.insert(dataScopeRulesTable).values(body).returning();
    res.status(201).json(rule);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "issues" in err) return res.status(400).json({ message: "Validation error", errors: (err as { issues: unknown }).issues });
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to create scope rule" });
  }
});

router.put("/platform/governance/scope-rules/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateScopeRuleBody.parse(req.body);
    const [rule] = await db.update(dataScopeRulesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(dataScopeRulesTable.id, id))
      .returning();
    if (!rule) return res.status(404).json({ message: "Scope rule not found" });
    res.json(rule);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "issues" in err) return res.status(400).json({ message: "Validation error", errors: (err as { issues: unknown }).issues });
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to update scope rule" });
  }
});

router.delete("/platform/governance/scope-rules/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(dataScopeRulesTable).where(eq(dataScopeRulesTable.id, id));
    res.status(204).send();
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to delete scope rule" });
  }
});

router.get("/platform/governance/dashboard", requireSuperAdmin, async (_req, res) => {
  try {
    const allRoles = await db.select().from(platformRolesTable).orderBy(asc(platformRolesTable.name));

    const allAssignments = await db.select().from(roleAssignmentsTable);

    const allEntities = await db.select({
      id: moduleEntitiesTable.id,
      name: moduleEntitiesTable.name,
      nameHe: moduleEntitiesTable.nameHe,
      slug: moduleEntitiesTable.slug,
      moduleId: moduleEntitiesTable.moduleId,
    }).from(moduleEntitiesTable);

    const allScopeRules = await db.select().from(dataScopeRulesTable);

    const assignedUserIds = new Set(allAssignments.map(a => a.userId));

    let allUsers: { id: number; username: string; fullName: string }[] = [];
    try {
      allUsers = await db.select({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
      }).from(usersTable);
    } catch {}

    const usersWithoutRoles = allUsers.filter(u => !assignedUserIds.has(String(u.id)));

    const entitiesWithPermissions = new Set<number>();
    for (const role of allRoles) {
      const settings = (role.settings as Record<string, Record<string, unknown>>) || {};
      for (const entityId of Object.keys(settings.entities || {})) {
        entitiesWithPermissions.add(Number(entityId));
      }
    }

    const ungovernedEntities = allEntities.filter(e => !entitiesWithPermissions.has(e.id));

    const entitiesWithScopeRules = new Set(allScopeRules.map(r => r.entityId));
    const entitiesWithoutScopeRules = allEntities.filter(e => !entitiesWithScopeRules.has(e.id));

    const recentDenials = await db.select()
      .from(recordAuditLogTable)
      .where(eq(recordAuditLogTable.action, "permission_denied"))
      .orderBy(desc(recordAuditLogTable.createdAt))
      .limit(50);

    const totalRecords = await db.select({ count: sql<number>`count(*)::int` }).from(entityRecordsTable);
    const recordsWithOwner = await db.select({ count: sql<number>`count(*)::int` })
      .from(entityRecordsTable)
      .where(sql`created_by IS NOT NULL`);

    res.json({
      summary: {
        totalRoles: allRoles.length,
        activeRoles: allRoles.filter(r => r.isActive).length,
        totalAssignments: allAssignments.length,
        uniqueUsersWithRoles: assignedUserIds.size,
        totalEntities: allEntities.length,
        governedEntities: entitiesWithPermissions.size,
        ungovernedEntities: ungovernedEntities.length,
        totalScopeRules: allScopeRules.length,
        entitiesWithScopeRules: entitiesWithScopeRules.size,
        entitiesWithoutScopeRules: entitiesWithoutScopeRules.length,
        totalRecords: totalRecords[0]?.count || 0,
        recordsWithOwner: recordsWithOwner[0]?.count || 0,
        usersWithoutRoles: usersWithoutRoles.length,
        recentDenialCount: recentDenials.length,
      },
      allEntities,
      ungovernedEntities,
      entitiesWithoutScopeRules,
      usersWithoutRoles,
      recentDenials,
      roles: allRoles,
      scopeRules: allScopeRules,
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to load dashboard" });
  }
});

router.post("/platform/governance/bulk-assign", requireSuperAdmin, async (req, res) => {
  try {
    const body = z.object({
      roleId: z.number(),
      userIds: z.array(z.string()).min(1),
      assignedBy: z.string().optional(),
    }).parse(req.body);

    const existing = await db.select()
      .from(roleAssignmentsTable)
      .where(and(
        eq(roleAssignmentsTable.roleId, body.roleId),
        inArray(roleAssignmentsTable.userId, body.userIds),
      ));

    const existingUserIds = new Set(existing.map(a => a.userId));
    const newUserIds = body.userIds.filter(id => !existingUserIds.has(id));

    if (newUserIds.length > 0) {
      await db.insert(roleAssignmentsTable).values(
        newUserIds.map(userId => ({
          roleId: body.roleId,
          userId,
          assignedBy: body.assignedBy,
        }))
      );
    }

    invalidateAssignmentCache();

    const allAssignments = await db.select()
      .from(roleAssignmentsTable)
      .where(eq(roleAssignmentsTable.roleId, body.roleId));

    res.json({
      assigned: newUserIds.length,
      skipped: existingUserIds.size,
      total: allAssignments.length,
      assignments: allAssignments,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "issues" in err) return res.status(400).json({ message: "Validation error", errors: (err as { issues: unknown }).issues });
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to bulk assign" });
  }
});

router.post("/platform/governance/bulk-revoke", requireSuperAdmin, async (req, res) => {
  try {
    const body = z.object({
      roleId: z.number(),
      userIds: z.array(z.string()).min(1),
    }).parse(req.body);

    await db.delete(roleAssignmentsTable).where(and(
      eq(roleAssignmentsTable.roleId, body.roleId),
      inArray(roleAssignmentsTable.userId, body.userIds),
    ));

    invalidateAssignmentCache();

    res.json({ revoked: body.userIds.length });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "issues" in err) return res.status(400).json({ message: "Validation error", errors: (err as { issues: unknown }).issues });
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to bulk revoke" });
  }
});

router.get("/platform/governance/access-denials", requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const denials = await db.select()
      .from(recordAuditLogTable)
      .where(eq(recordAuditLogTable.action, "permission_denied"))
      .orderBy(desc(recordAuditLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(recordAuditLogTable)
      .where(eq(recordAuditLogTable.action, "permission_denied"));

    res.json({
      denials,
      total: totalResult[0]?.count || 0,
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to fetch access denials" });
  }
});

export default router;
