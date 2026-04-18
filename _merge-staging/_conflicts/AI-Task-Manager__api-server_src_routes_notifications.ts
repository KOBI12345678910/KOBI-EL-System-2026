import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { notificationsTable, notificationPreferencesTable, notificationRoutingRulesTable, notificationDeliveryLogTable } from "@workspace/db/schema";
import { eq, desc, sql, and, isNull, isNotNull, gte, lte, like, or } from "drizzle-orm";
import { createNotification, runAllTriggers } from "../lib/notification-service";
import { addSSEClient, getConnectedClientCount } from "../lib/sse-manager";

const router: IRouter = Router();

const notifDashCache = new Map<number, { data: unknown; ts: number }>();
const NOTIF_DASH_TTL_MS = 30_000;

function getUserId(req: Request): number | null {
  const uid = req.userId;
  if (!uid) return null;
  const num = Number(uid);
  return isNaN(num) || num === 0 ? null : num;
}

function userScopeCondition(authUserId: number | null) {
  if (!authUserId) return undefined;
  return eq(notificationsTable.userId, authUserId);
}

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [System & Settings]
 *     summary: רשימת התראות — List notifications
 *     description: |
 *       מחזיר התראות למשתמש המחובר עם אפשרות סינון לפי קטגוריה, עדיפות, ומצב קריאה.
 *       ניתן לסנן לא-נקראות, לפי סוג, ולפי תאריך.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *         description: "קטגוריה: system, finance, hr, production, ..."
 *       - name: priority
 *         in: query
 *         schema: { type: string, enum: [low, medium, high, urgent] }
 *       - name: isRead
 *         in: query
 *         schema: { type: boolean }
 *         description: "false = הצג רק לא נקראות"
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: רשימת התראות עם פגינציה
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications: { type: array, items: { type: object } }
 *                 unreadCount: { type: integer }
 *                 total: { type: integer }
 *       401: { description: "נדרשת התחברות" }
 */
router.get("/notifications", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  const {
    category,
    priority,
    isRead,
    archived,
    search,
    dateFrom,
    dateTo,
    limit: limitStr,
    offset: offsetStr,
  } = req.query;

  const conditions = [];

  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  if (category && category !== "all") {
    conditions.push(eq(notificationsTable.category, String(category)));
  }

  if (priority && priority !== "all") {
    conditions.push(eq(notificationsTable.priority, String(priority)));
  }

  if (isRead === "true") {
    conditions.push(eq(notificationsTable.isRead, true));
  } else if (isRead === "false") {
    conditions.push(eq(notificationsTable.isRead, false));
  }

  if (archived === "true") {
    conditions.push(isNotNull(notificationsTable.archivedAt));
  } else if (archived !== "all") {
    conditions.push(isNull(notificationsTable.archivedAt));
  }

  if (search) {
    const term = `%${String(search)}%`;
    conditions.push(
      or(
        like(notificationsTable.title, term),
        like(notificationsTable.message, term)
      )
    );
  }

  if (dateFrom) {
    conditions.push(gte(notificationsTable.createdAt, new Date(String(dateFrom))));
  }

  if (dateTo) {
    conditions.push(lte(notificationsTable.createdAt, new Date(String(dateTo))));
  }

  const limit = Math.min(Number(limitStr) || 50, 200);
  const offset = Number(offsetStr) || 0;

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [notifications, countResult] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(where),
  ]);

  res.json({
    notifications,
    total: countResult[0]?.count || 0,
    limit,
    offset,
  });
});

router.get("/notifications/unread-count", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });

  const conditions = [eq(notificationsTable.isRead, false), isNull(notificationsTable.archivedAt)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(...conditions));

  const [critical] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(...conditions, eq(notificationsTable.priority, "critical")));

  res.json({
    count: total?.count || 0,
    critical: critical?.count || 0,
  });
});

router.get("/notifications/stats", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });

  const baseConditions = [isNull(notificationsTable.archivedAt)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) baseConditions.push(scopeCondition);

  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(...baseConditions, eq(notificationsTable.isRead, false)));

  const [critical] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(
      and(
        ...baseConditions,
        eq(notificationsTable.isRead, false),
        eq(notificationsTable.priority, "critical")
      )
    );

  const byCategory = await db
    .select({
      category: notificationsTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(notificationsTable)
    .where(and(...baseConditions, eq(notificationsTable.isRead, false)))
    .groupBy(notificationsTable.category);

  const byPriority = await db
    .select({
      priority: notificationsTable.priority,
      count: sql<number>`count(*)::int`,
    })
    .from(notificationsTable)
    .where(and(...baseConditions, eq(notificationsTable.isRead, false)))
    .groupBy(notificationsTable.priority);

  res.json({
    unread: unread?.count || 0,
    critical: critical?.count || 0,
    byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r.count])),
    byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r.count])),
  });
});

router.patch("/notifications/:id/read", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  const id = Number(req.params.id);

  const conditions = [eq(notificationsTable.id, id)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(...conditions))
    .returning();
  if (!notification) return res.status(404).json({ message: "Not found" });
  res.json(notification);
});

router.patch("/notifications/mark-all-read", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });

  const conditions = [eq(notificationsTable.isRead, false)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  await db.update(notificationsTable).set({ isRead: true }).where(and(...conditions));
  res.json({ success: true });
});

router.patch("/notifications/:id/archive", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  const id = Number(req.params.id);

  const conditions = [eq(notificationsTable.id, id)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  const [notification] = await db
    .update(notificationsTable)
    .set({ archivedAt: new Date(), isRead: true })
    .where(and(...conditions))
    .returning();
  if (!notification) return res.status(404).json({ message: "Not found" });
  res.json(notification);
});

router.patch("/notifications/archive-all", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });

  const conditions = [isNull(notificationsTable.archivedAt)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  await db
    .update(notificationsTable)
    .set({ archivedAt: new Date(), isRead: true })
    .where(and(...conditions));
  res.json({ success: true });
});

router.delete("/notifications/delete-all", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  await db
    .delete(notificationsTable)
    .where(eq(notificationsTable.userId, authUserId));
  res.json({ success: true });
});

router.delete("/notifications/:id", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  const id = Number(req.params.id);

  const conditions = [eq(notificationsTable.id, id)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  const [deleted] = await db
    .delete(notificationsTable)
    .where(and(...conditions))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Not found" });
  res.json({ success: true });
});

router.post("/notifications/bulk-action", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  const { ids, action } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids[] required" });
  }
  if (!["read", "archive", "delete"].includes(action)) {
    return res.status(400).json({ message: "action must be read, archive, or delete" });
  }

  if (action === "delete") {
    const permissions = (req as any).permissions;
    if (!permissions?.isSuperAdmin) {
      return res.status(403).json({ error: "מחיקה מותרת רק למנהל מערכת ראשי" });
    }
  }

  const { inArray } = await import("drizzle-orm");
  const numericIds = ids.map(Number).filter((n) => !isNaN(n));

  const conditions = [inArray(notificationsTable.id, numericIds)];
  const scopeCondition = userScopeCondition(authUserId);
  if (scopeCondition) conditions.push(scopeCondition);

  const where = and(...conditions);

  if (action === "read") {
    await db.update(notificationsTable).set({ isRead: true }).where(where);
  } else if (action === "archive") {
    await db.update(notificationsTable).set({ archivedAt: new Date(), isRead: true }).where(where);
  } else if (action === "delete") {
    await db.delete(notificationsTable).where(where);
  }

  res.json({ success: true, count: numericIds.length });
});

router.get("/notification-preferences", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const prefs = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, authUserId));

  res.json(prefs);
});

router.put("/notification-preferences", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const { preferences } = req.body;
  if (!Array.isArray(preferences)) {
    return res.status(400).json({ message: "preferences[] required" });
  }

  const validCategories = ["anomaly", "task", "approval", "system", "workflow"];
  const validPriorities = ["low", "normal", "medium", "high", "critical"];

  for (const p of preferences) {
    if (!validCategories.includes(p.category)) {
      return res.status(400).json({ message: `Invalid category: ${p.category}` });
    }
    if (p.minPriority && !validPriorities.includes(p.minPriority)) {
      return res.status(400).json({ message: `Invalid minPriority: ${p.minPriority}` });
    }
  }

  await db
    .delete(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, authUserId));

  if (preferences.length > 0) {
    await db.insert(notificationPreferencesTable).values(
      preferences.map((p: { category: string; enabled: boolean; minPriority: string }) => ({
        userId: authUserId,
        category: p.category,
        enabled: p.enabled,
        minPriority: p.minPriority || "low",
      }))
    );
  }

  const saved = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, authUserId));

  res.json(saved);
});

router.get("/notifications/stream", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  addSSEClient(authUserId, res);
});

router.get("/notifications/sse-status", async (req, res) => {
  res.json({ connectedClients: getConnectedClientCount() });
});

router.post("/notifications/trigger-check", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  await runAllTriggers();
  res.json({ success: true, message: "Trigger checks completed" });
});

router.get("/notification-routing-rules", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  const rules = await db.select().from(notificationRoutingRulesTable).orderBy(desc(notificationRoutingRulesTable.createdAt));
  res.json(rules);
});

router.post("/notification-routing-rules", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  const ALLOWED_PRIORITIES = ["low", "normal", "medium", "high", "critical"];
  const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  const {
    notificationType, category, roleName, userId: ruleUserId,
    channelInApp, channelEmail, channelWhatsapp, channelSlack, channelSms, channelTelegram,
    minPriorityInApp, minPriorityEmail, minPriorityWhatsapp, minPrioritySlack, minPrioritySms, minPriorityTelegram,
    quietHoursEnabled, quietHoursFrom, quietHoursTo, quietHoursBypassPriority, description,
  } = req.body as {
    notificationType?: string; category?: string; roleName?: string; userId?: string | number;
    channelInApp?: boolean; channelEmail?: boolean; channelWhatsapp?: boolean;
    channelSlack?: boolean; channelSms?: boolean; channelTelegram?: boolean;
    minPriorityInApp?: string; minPriorityEmail?: string; minPriorityWhatsapp?: string;
    minPrioritySlack?: string; minPrioritySms?: string; minPriorityTelegram?: string;
    quietHoursEnabled?: boolean; quietHoursFrom?: string; quietHoursTo?: string;
    quietHoursBypassPriority?: string; description?: string;
  };

  const priorityFields = { minPriorityInApp, minPriorityEmail, minPriorityWhatsapp, minPrioritySlack, minPrioritySms, minPriorityTelegram, quietHoursBypassPriority };
  for (const [field, val] of Object.entries(priorityFields)) {
    if (val !== undefined && val !== "" && !ALLOWED_PRIORITIES.includes(val)) {
      return res.status(400).json({ message: `Invalid priority value for ${field}: ${val}` });
    }
  }
  if (quietHoursFrom && !HH_MM_RE.test(quietHoursFrom)) {
    return res.status(400).json({ message: `Invalid quietHoursFrom format (expected HH:mm): ${quietHoursFrom}` });
  }
  if (quietHoursTo && !HH_MM_RE.test(quietHoursTo)) {
    return res.status(400).json({ message: `Invalid quietHoursTo format (expected HH:mm): ${quietHoursTo}` });
  }

  const [rule] = await db.insert(notificationRoutingRulesTable).values({
    notificationType: notificationType || "*",
    category: category || "system",
    roleName: roleName || null,
    userId: ruleUserId ? Number(ruleUserId) : null,
    channelInApp: channelInApp !== false,
    channelEmail: channelEmail === true,
    channelWhatsapp: channelWhatsapp === true,
    channelSlack: channelSlack === true,
    channelSms: channelSms === true,
    channelTelegram: channelTelegram === true,
    minPriorityInApp: minPriorityInApp || "low",
    minPriorityEmail: minPriorityEmail || "high",
    minPriorityWhatsapp: minPriorityWhatsapp || "critical",
    minPrioritySlack: minPrioritySlack || "high",
    minPrioritySms: minPrioritySms || "critical",
    minPriorityTelegram: minPriorityTelegram || "high",
    quietHoursEnabled: quietHoursEnabled === true,
    quietHoursFrom: quietHoursFrom || "22:00",
    quietHoursTo: quietHoursTo || "08:00",
    quietHoursBypassPriority: quietHoursBypassPriority || "critical",
    description: description || null,
  }).returning();
  res.json(rule);
});

router.put("/notification-routing-rules/:id", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  const id = Number(req.params.id);
  const body = req.body as {
    notificationType?: string;
    category?: string;
    roleName?: string;
    userId?: number | string;
    channelInApp?: boolean;
    channelEmail?: boolean;
    channelWhatsapp?: boolean;
    channelSlack?: boolean;
    channelSms?: boolean;
    channelTelegram?: boolean;
    minPriorityInApp?: string;
    minPriorityEmail?: string;
    minPriorityWhatsapp?: string;
    minPrioritySlack?: string;
    minPrioritySms?: string;
    minPriorityTelegram?: string;
    quietHoursEnabled?: boolean;
    quietHoursFrom?: string;
    quietHoursTo?: string;
    quietHoursBypassPriority?: string;
    isActive?: boolean;
    description?: string;
  };
  const PUT_ALLOWED_PRIORITIES = ["low", "normal", "medium", "high", "critical"];
  const PUT_HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const putPriorityFields: Record<string, string | undefined> = {
    minPriorityInApp: body.minPriorityInApp, minPriorityEmail: body.minPriorityEmail,
    minPriorityWhatsapp: body.minPriorityWhatsapp, minPrioritySlack: body.minPrioritySlack,
    minPrioritySms: body.minPrioritySms, minPriorityTelegram: body.minPriorityTelegram,
    quietHoursBypassPriority: body.quietHoursBypassPriority,
  };
  for (const [field, val] of Object.entries(putPriorityFields)) {
    if (val !== undefined && val !== "" && !PUT_ALLOWED_PRIORITIES.includes(val)) {
      return res.status(400).json({ message: `Invalid priority value for ${field}: ${val}` });
    }
  }
  if (body.quietHoursFrom && !PUT_HH_MM_RE.test(body.quietHoursFrom)) {
    return res.status(400).json({ message: `Invalid quietHoursFrom format (expected HH:mm): ${body.quietHoursFrom}` });
  }
  if (body.quietHoursTo && !PUT_HH_MM_RE.test(body.quietHoursTo)) {
    return res.status(400).json({ message: `Invalid quietHoursTo format (expected HH:mm): ${body.quietHoursTo}` });
  }

  type RuleUpdate = Partial<typeof notificationRoutingRulesTable.$inferInsert>;
  const updates: RuleUpdate = { updatedAt: new Date() };
  if (body.notificationType !== undefined) updates.notificationType = body.notificationType;
  if (body.category !== undefined) updates.category = body.category;
  if (body.roleName !== undefined) updates.roleName = body.roleName || null;
  if (body.userId !== undefined) updates.userId = body.userId ? Number(body.userId) : null;
  if (body.channelInApp !== undefined) updates.channelInApp = body.channelInApp !== false;
  if (body.channelEmail !== undefined) updates.channelEmail = body.channelEmail === true;
  if (body.channelWhatsapp !== undefined) updates.channelWhatsapp = body.channelWhatsapp === true;
  if (body.channelSlack !== undefined) updates.channelSlack = body.channelSlack === true;
  if (body.channelSms !== undefined) updates.channelSms = body.channelSms === true;
  if (body.channelTelegram !== undefined) updates.channelTelegram = body.channelTelegram === true;
  if (body.minPriorityInApp !== undefined) updates.minPriorityInApp = body.minPriorityInApp || "low";
  if (body.minPriorityEmail !== undefined) updates.minPriorityEmail = body.minPriorityEmail || "high";
  if (body.minPriorityWhatsapp !== undefined) updates.minPriorityWhatsapp = body.minPriorityWhatsapp || "critical";
  if (body.minPrioritySlack !== undefined) updates.minPrioritySlack = body.minPrioritySlack || "high";
  if (body.minPrioritySms !== undefined) updates.minPrioritySms = body.minPrioritySms || "critical";
  if (body.minPriorityTelegram !== undefined) updates.minPriorityTelegram = body.minPriorityTelegram || "high";
  if (body.quietHoursEnabled !== undefined) updates.quietHoursEnabled = body.quietHoursEnabled === true;
  if (body.quietHoursFrom !== undefined) updates.quietHoursFrom = body.quietHoursFrom || "22:00";
  if (body.quietHoursTo !== undefined) updates.quietHoursTo = body.quietHoursTo || "08:00";
  if (body.quietHoursBypassPriority !== undefined) updates.quietHoursBypassPriority = body.quietHoursBypassPriority || "critical";
  if (body.isActive !== undefined) updates.isActive = body.isActive !== false;
  if (body.description !== undefined) updates.description = body.description || null;
  const [rule] = await db.update(notificationRoutingRulesTable).set(updates)
    .where(eq(notificationRoutingRulesTable.id, id)).returning();
  if (!rule) return res.status(404).json({ message: "Rule not found" });
  res.json(rule);
});

router.delete("/notification-routing-rules/:id", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  const id = Number(req.params.id);
  await db.delete(notificationRoutingRulesTable).where(eq(notificationRoutingRulesTable.id, id));
  res.json({ success: true });
});

router.put("/notification-routing-rules", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const { rules: incoming } = req.body;
    if (!Array.isArray(incoming)) return res.status(400).json({ message: "rules array required" });

    const validPriorities = ["low", "normal", "medium", "high", "critical"];
    const BULK_HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const r of incoming) {
      if (!r.category || typeof r.category !== "string") {
        return res.status(400).json({ message: "Each rule must have a category" });
      }
      for (const p of [r.minPriorityInApp, r.minPriorityEmail, r.minPriorityWhatsapp, r.minPrioritySms, r.minPriorityTelegram, r.quietHoursBypassPriority]) {
        if (p && !validPriorities.includes(p)) {
          return res.status(400).json({ message: `Invalid priority: ${p}` });
        }
      }
      if (r.quietHoursFrom && !BULK_HH_MM_RE.test(r.quietHoursFrom)) {
        return res.status(400).json({ message: `Invalid quietHoursFrom format (expected HH:mm): ${r.quietHoursFrom}` });
      }
      if (r.quietHoursTo && !BULK_HH_MM_RE.test(r.quietHoursTo)) {
        return res.status(400).json({ message: `Invalid quietHoursTo format (expected HH:mm): ${r.quietHoursTo}` });
      }
    }

    await db.transaction(async (tx) => {
      for (const r of incoming) {
        const existing = await tx.select().from(notificationRoutingRulesTable)
          .where(and(
            eq(notificationRoutingRulesTable.category, r.category),
            isNull(notificationRoutingRulesTable.roleName),
            isNull(notificationRoutingRulesTable.userId),
          ))
          .limit(1);

        const quietHoursFields = {
          quietHoursEnabled: r.quietHoursEnabled === true,
          quietHoursFrom: r.quietHoursFrom || "22:00",
          quietHoursTo: r.quietHoursTo || "08:00",
          quietHoursBypassPriority: r.quietHoursBypassPriority || "critical",
        };
        if (existing.length > 0) {
          await tx.update(notificationRoutingRulesTable).set({
            channelInApp: r.channelInApp !== false,
            channelEmail: r.channelEmail === true,
            channelWhatsapp: r.channelWhatsapp === true,
            channelSms: r.channelSms === true,
            channelTelegram: r.channelTelegram === true,
            minPriorityInApp: r.minPriorityInApp || "low",
            minPriorityEmail: r.minPriorityEmail || "high",
            minPriorityWhatsapp: r.minPriorityWhatsapp || "critical",
            minPrioritySms: r.minPrioritySms || "critical",
            minPriorityTelegram: r.minPriorityTelegram || "high",
            ...quietHoursFields,
            updatedAt: new Date(),
          }).where(eq(notificationRoutingRulesTable.id, existing[0].id));
        } else {
          await tx.insert(notificationRoutingRulesTable).values({
            notificationType: r.category,
            category: r.category,
            channelInApp: r.channelInApp !== false,
            channelEmail: r.channelEmail === true,
            channelWhatsapp: r.channelWhatsapp === true,
            channelSms: r.channelSms === true,
            channelTelegram: r.channelTelegram === true,
            minPriorityInApp: r.minPriorityInApp || "low",
            minPriorityEmail: r.minPriorityEmail || "high",
            minPriorityWhatsapp: r.minPriorityWhatsapp || "critical",
            minPrioritySms: r.minPrioritySms || "critical",
            minPriorityTelegram: r.minPriorityTelegram || "high",
            ...quietHoursFields,
            description: `כלל ניתוב — ${r.category}`,
          });
        }
      }
    });

    const allRules = await db.select().from(notificationRoutingRulesTable).orderBy(desc(notificationRoutingRulesTable.createdAt));
    res.json({ success: true, rules: allRules });
  } catch (err: any) {
    console.error("Error saving routing rules:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/notification-delivery-stats", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  try {
    const [stats] = await db.select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${notificationDeliveryLogTable.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${notificationDeliveryLogTable.status} = 'failed')::int`,
      skipped: sql<number>`count(*) filter (where ${notificationDeliveryLogTable.status} = 'skipped')::int`,
    }).from(notificationDeliveryLogTable);
    res.json(stats);
  } catch (err: any) {
    res.json({ total: 0, sent: 0, failed: 0, skipped: 0 });
  }
});

router.get("/notification-delivery-log", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const logs = await db.select().from(notificationDeliveryLogTable)
    .orderBy(desc(notificationDeliveryLogTable.createdAt))
    .limit(limit).offset(offset);
  res.json(logs);
});

router.get("/notifications/dashboard-stats", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) return res.status(401).json({ message: "Authentication required" });

  const cached = notifDashCache.get(authUserId);
  if (cached && Date.now() - cached.ts < NOTIF_DASH_TTL_MS) {
    res.set("X-Cache", "HIT");
    return res.json(cached.data);
  }

  const scopeCondition = userScopeCondition(authUserId);
  const baseWhere = scopeCondition ? and(scopeCondition, isNull(notificationsTable.archivedAt)) : isNull(notificationsTable.archivedAt);

  const [[totalUnread], [totalCritical], byType] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(notificationsTable)
      .where(and(baseWhere, eq(notificationsTable.isRead, false))),
    db.select({ count: sql<number>`count(*)::int` }).from(notificationsTable)
      .where(and(baseWhere, eq(notificationsTable.isRead, false), eq(notificationsTable.priority, "critical"))),
    db.select({
      type: notificationsTable.type,
      count: sql<number>`count(*)::int`,
    }).from(notificationsTable).where(and(baseWhere, eq(notificationsTable.isRead, false)))
      .groupBy(notificationsTable.type).orderBy(desc(sql<number>`count(*)`)).limit(10),
  ]);

  const trendsResult = await db.execute(
    sql`SELECT DATE_TRUNC('day', created_at) as day, COUNT(*)::int as count
        FROM notifications
        WHERE created_at > NOW() - INTERVAL '30 days'
        ${scopeCondition ? sql`AND user_id = ${authUserId}` : sql``}
        GROUP BY day ORDER BY day`
  );
  const trends = (Array.isArray(trendsResult) ? trendsResult : (trendsResult as { rows?: unknown[] }).rows || []) as Array<{ day: string; count: number }>;

  const moduleHealth = [
    { module: "רכש", type: "overdue_purchase_order" },
    { module: "ייצור", type: "overdue_work_order" },
    { module: "משלוחים", type: "overdue_shipment" },
    { module: "תקציב", type: "budget_exceeded" },
    { module: "מלאי", type: "low_inventory" },
    { module: "אישורים", type: "overdue_approval" },
    { module: "איכות", type: "open_ncr" },
  ];

  const moduleHealthResults = await Promise.all(
    moduleHealth.map(({ type }) =>
      db.select({ count: sql<number>`count(*)::int` }).from(notificationsTable)
        .where(and(baseWhere, eq(notificationsTable.type, type), eq(notificationsTable.isRead, false)))
    )
  );
  const moduleHealthStats = moduleHealth.map(({ module }, i) => {
    const count = moduleHealthResults[i]?.[0]?.count || 0;
    return { module, count, status: count === 0 ? "green" : count <= 2 ? "yellow" : "red" };
  });

  const data = {
    totalUnread: totalUnread?.count || 0,
    totalCritical: totalCritical?.count || 0,
    byType,
    trends,
    moduleHealth: moduleHealthStats,
  };

  notifDashCache.set(authUserId, { data, ts: Date.now() });
  res.set("X-Cache", "MISS");
  res.json(data);
});

router.post("/notifications", async (req, res) => {
  const authUserId = getUserId(req);
  if (!authUserId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const { type, title, message, priority, category, actionUrl, metadata, moduleId, recordId } = req.body;
  const notification = await createNotification({
    type,
    title,
    message,
    userId: authUserId,
    priority,
    category,
    actionUrl,
    metadata,
    moduleId,
    recordId,
  });
  if (!notification) {
    return res.json({ skipped: true, message: "Notification filtered by user preferences" });
  }
  res.json(notification);
});

export default router;
