import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  scheduledTasksTable,
  scheduledTaskExecutionLogsTable,
  notificationDigestSettingsTable,
} from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

const TASK_TYPES = [
  { type: "notification_check", label: "בדיקת התראות" },
  { type: "budget_anomaly", label: "בדיקת חריגות תקציב" },
  { type: "low_inventory", label: "בדיקת מלאי נמוך" },
  { type: "overdue_invoices", label: "בדיקת חשבוניות באיחור" },
  { type: "overdue_purchase_orders", label: "בדיקת הזמנות רכש באיחור" },
  { type: "overdue_work_orders", label: "בדיקת פקודות עבודה באיחור" },
  { type: "overdue_shipments", label: "בדיקת משלוחים באיחור" },
  { type: "contract_expiry", label: "בדיקת חוזים פגי תוקף" },
  { type: "project_deadlines", label: "בדיקת דדליינים פרויקטים" },
  { type: "open_ncr", label: "בדיקת אי-התאמות פתוחות" },
  { type: "daily_sales_report", label: "דוח מכירות יומי" },
  { type: "weekly_inventory_report", label: "דוח מלאי שבועי" },
  { type: "monthly_financial_report", label: "דוח כספי חודשי" },
  { type: "notification_digest", label: "תקציר התראות" },
];

router.get("/platform/scheduled-tasks", async (_req, res) => {
  try {
    const tasks = await db.select().from(scheduledTasksTable).orderBy(scheduledTasksTable.createdAt);
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/scheduled-tasks/types", async (_req, res) => {
  res.json(TASK_TYPES);
});

router.post("/platform/scheduled-tasks", async (req, res) => {
  try {
    const { name, description, taskType, cronExpression, scheduleFrequency, scheduleTime, parameters } = req.body;
    if (!name || !taskType) return res.status(400).json({ message: "name and taskType are required" });
    const [task] = await db.insert(scheduledTasksTable).values({
      name,
      description: description || null,
      taskType,
      cronExpression: cronExpression || null,
      scheduleFrequency: scheduleFrequency || "daily",
      scheduleTime: scheduleTime || "08:00",
      parameters: parameters || {},
    }).returning();
    res.status(201).json(task);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/scheduled-tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, taskType, cronExpression, scheduleFrequency, scheduleTime, parameters, isActive } = req.body;
    const [task] = await db.update(scheduledTasksTable).set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(taskType !== undefined && { taskType }),
      ...(cronExpression !== undefined && { cronExpression }),
      ...(scheduleFrequency !== undefined && { scheduleFrequency }),
      ...(scheduleTime !== undefined && { scheduleTime }),
      ...(parameters !== undefined && { parameters }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    }).where(eq(scheduledTasksTable.id, id)).returning();
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/scheduled-tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(scheduledTasksTable).where(eq(scheduledTasksTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/scheduled-tasks/:id/run", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [task] = await db.select().from(scheduledTasksTable).where(eq(scheduledTasksTable.id, id));
    if (!task) return res.status(404).json({ message: "Task not found" });

    const [logEntry] = await db.insert(scheduledTaskExecutionLogsTable).values({
      taskId: id,
      status: "running",
      startedAt: new Date(),
    }).returning();

    const startTime = Date.now();
    let success = false;
    let output = "";
    let errorMessage: string | null = null;

    try {
      const result = await executeTaskType(task.taskType, task.parameters as Record<string, any>);
      success = result.success;
      output = result.output;
    } catch (err: any) {
      errorMessage = err.message;
    }

    const duration = Date.now() - startTime;

    await db.update(scheduledTaskExecutionLogsTable).set({
      status: success ? "success" : "failed",
      output,
      errorMessage,
      duration,
      completedAt: new Date(),
    }).where(eq(scheduledTaskExecutionLogsTable.id, logEntry.id));

    await db.update(scheduledTasksTable).set({
      lastRunAt: new Date(),
      runCount: task.runCount + 1,
      updatedAt: new Date(),
    }).where(eq(scheduledTasksTable.id, id));

    res.json({ success, output, errorMessage, duration, logId: logEntry.id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/scheduled-tasks/:id/logs", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await db.select().from(scheduledTaskExecutionLogsTable)
      .where(eq(scheduledTaskExecutionLogsTable.taskId, id))
      .orderBy(desc(scheduledTaskExecutionLogsTable.startedAt))
      .limit(limit);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/notification-digest/settings", async (req, res) => {
  try {
    const userId = (req as any).userId || 1;
    const [settings] = await db.select().from(notificationDigestSettingsTable)
      .where(eq(notificationDigestSettingsTable.userId, userId));
    res.json(settings || { enabled: false, frequency: "daily", scheduleTime: "08:00", scheduleDayOfWeek: 1, includeCategories: ["anomaly","task","approval","system","workflow"], minPriority: "normal" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/notification-digest/settings", async (req, res) => {
  try {
    const userId = (req as any).userId || 1;
    const { enabled, frequency, scheduleTime, scheduleDayOfWeek, includeCategories, minPriority } = req.body;

    const existing = await db.select().from(notificationDigestSettingsTable)
      .where(eq(notificationDigestSettingsTable.userId, userId));

    if (existing.length > 0) {
      const [settings] = await db.update(notificationDigestSettingsTable).set({
        ...(enabled !== undefined && { enabled }),
        ...(frequency !== undefined && { frequency }),
        ...(scheduleTime !== undefined && { scheduleTime }),
        ...(scheduleDayOfWeek !== undefined && { scheduleDayOfWeek }),
        ...(includeCategories !== undefined && { includeCategories }),
        ...(minPriority !== undefined && { minPriority }),
        updatedAt: new Date(),
      }).where(eq(notificationDigestSettingsTable.userId, userId)).returning();
      res.json(settings);
    } else {
      const [settings] = await db.insert(notificationDigestSettingsTable).values({
        userId,
        enabled: enabled ?? false,
        frequency: frequency || "daily",
        scheduleTime: scheduleTime || "08:00",
        scheduleDayOfWeek: scheduleDayOfWeek ?? 1,
        includeCategories: includeCategories || ["anomaly","task","approval","system","workflow"],
        minPriority: minPriority || "normal",
      }).returning();
      res.json(settings);
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/notification-digest/preview", async (req, res) => {
  try {
    const userId = (req as any).userId || 1;
    const { notificationsTable } = await import("@workspace/db/schema");
    const { and, gte, eq: eqOp, isNull } = await import("drizzle-orm");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notifications = await db.select().from(notificationsTable)
      .where(and(
        eqOp(notificationsTable.userId, userId),
        eqOp(notificationsTable.isRead, false),
        isNull(notificationsTable.archivedAt),
        gte(notificationsTable.createdAt, since),
      ))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(100);

    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const n of notifications) {
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
      byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
    }

    res.json({
      total: notifications.length,
      byCategory,
      byPriority,
      recentItems: notifications.slice(0, 10).map(n => ({
        id: n.id, title: n.title, message: n.message, priority: n.priority, category: n.category, createdAt: n.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/notification-action/:id", async (req, res) => {
  try {
    const notificationId = Number(req.params.id);
    const { action, data } = req.body;

    const { notificationsTable } = await import("@workspace/db/schema");
    const [notification] = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.id, notificationId));

    if (!notification) return res.status(404).json({ message: "Notification not found" });

    const metadata = (notification.metadata as Record<string, any>) || {};

    let result: Record<string, any> = { success: true };

    switch (action) {
      case "approve": {
        if (metadata.approvalRequestId) {
          await db.execute(sql`UPDATE approval_requests SET status = 'approved', resolved_at = NOW() WHERE id = ${metadata.approvalRequestId}`);
        }
        result = { success: true, message: "אושר בהצלחה" };
        break;
      }
      case "reject": {
        if (metadata.approvalRequestId) {
          await db.execute(sql`UPDATE approval_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ${metadata.approvalRequestId}`);
        }
        result = { success: true, message: "נדחה בהצלחה" };
        break;
      }
      case "acknowledge": {
        result = { success: true, message: "אושר קבלה" };
        break;
      }
      default:
        result = { success: false, message: "פעולה לא ידועה" };
    }

    await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, notificationId));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

async function executeTaskType(taskType: string, params: Record<string, any>): Promise<{ success: boolean; output: string }> {
  const { createNotificationForAllUsers } = await import("../../lib/notification-service");

  switch (taskType) {
    case "notification_check": {
      const { checkBudgetAnomalies, checkLowInventory, checkOverdueApprovals, checkOverdueTasks } = await import("../../lib/notification-service");
      await Promise.all([checkBudgetAnomalies(), checkLowInventory(), checkOverdueApprovals(), checkOverdueTasks()]);
      return { success: true, output: "בדיקת התראות הושלמה" };
    }
    case "budget_anomaly": {
      const { checkBudgetAnomalies } = await import("../../lib/notification-service");
      await checkBudgetAnomalies();
      return { success: true, output: "בדיקת חריגות תקציב הושלמה" };
    }
    case "low_inventory": {
      const { checkLowInventory } = await import("../../lib/notification-service");
      await checkLowInventory();
      return { success: true, output: "בדיקת מלאי נמוך הושלמה" };
    }
    case "overdue_invoices": {
      const { checkOverdueInvoices } = await import("../../lib/notification-service");
      await checkOverdueInvoices();
      return { success: true, output: "בדיקת חשבוניות באיחור הושלמה" };
    }
    case "overdue_purchase_orders": {
      const { checkOverduePurchaseOrders } = await import("../../lib/notification-service");
      await checkOverduePurchaseOrders();
      return { success: true, output: "בדיקת הזמנות רכש הושלמה" };
    }
    case "overdue_work_orders": {
      const { checkOverdueWorkOrders } = await import("../../lib/notification-service");
      await checkOverdueWorkOrders();
      return { success: true, output: "בדיקת פקודות עבודה הושלמה" };
    }
    case "overdue_shipments": {
      const { checkOverdueShipments } = await import("../../lib/notification-service");
      await checkOverdueShipments();
      return { success: true, output: "בדיקת משלוחים הושלמה" };
    }
    case "contract_expiry": {
      const { checkExpiringSupplierContracts } = await import("../../lib/notification-service");
      await checkExpiringSupplierContracts();
      return { success: true, output: "בדיקת חוזים פגי תוקף הושלמה" };
    }
    case "project_deadlines": {
      const { checkProjectsPastDeadline } = await import("../../lib/notification-service");
      await checkProjectsPastDeadline();
      return { success: true, output: "בדיקת דדליינים הושלמה" };
    }
    case "open_ncr": {
      const { checkOpenNCRs } = await import("../../lib/notification-service");
      await checkOpenNCRs();
      return { success: true, output: "בדיקת NCR הושלמה" };
    }
    case "daily_sales_report": {
      await createNotificationForAllUsers({
        type: "scheduled_report",
        title: "דוח מכירות יומי",
        message: `דוח מכירות יומי נוצר עבור ${new Date().toLocaleDateString("he-IL")}`,
        priority: "normal",
        category: "system",
        actionUrl: "/reports",
      });
      return { success: true, output: "דוח מכירות יומי נשלח" };
    }
    case "weekly_inventory_report": {
      await createNotificationForAllUsers({
        type: "scheduled_report",
        title: "דוח מלאי שבועי",
        message: `דוח מלאי שבועי נוצר עבור שבוע ${new Date().toLocaleDateString("he-IL")}`,
        priority: "normal",
        category: "system",
        actionUrl: "/reports",
      });
      return { success: true, output: "דוח מלאי שבועי נשלח" };
    }
    case "monthly_financial_report": {
      await createNotificationForAllUsers({
        type: "scheduled_report",
        title: "דוח כספי חודשי",
        message: `דוח כספי חודשי נוצר עבור ${new Date().toLocaleDateString("he-IL", { month: "long", year: "numeric" })}`,
        priority: "normal",
        category: "system",
        actionUrl: "/finance",
      });
      return { success: true, output: "דוח כספי חודשי נשלח" };
    }
    case "notification_digest": {
      return { success: true, output: "תקציר התראות נשלח" };
    }
    default:
      return { success: false, output: `סוג משימה לא ידוע: ${taskType}` };
  }
}

export default router;
