import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { reportSchedulesTable, reportDeliveryLogsTable } from "@workspace/db/schema";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use("/bi/schedules", requireAuth as any);
router.use("/bi/delivery-logs", requireAuth as any);

function computeNextRun(scheduleType: string, cronExpression?: string | null): Date {
  const now = new Date();
  switch (scheduleType) {
    case "daily": {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }
    case "weekly": {
      const next = new Date(now);
      next.setDate(next.getDate() + (7 - next.getDay()));
      next.setHours(8, 0, 0, 0);
      return next;
    }
    case "monthly": {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0, 0);
      return next;
    }
    case "quarterly": {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const nextQuarterMonth = (currentQuarter + 1) * 3;
      const next = new Date(now.getFullYear(), nextQuarterMonth, 1, 8, 0, 0, 0);
      return next;
    }
    default: {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }
  }
}

router.get("/bi/schedules", async (_req: Request, res: Response) => {
  try {
    const schedules = await db.select().from(reportSchedulesTable).orderBy(desc(reportSchedulesTable.createdAt));
    res.json(schedules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/schedules/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [schedule] = await db.select().from(reportSchedulesTable).where(eq(reportSchedulesTable.id, id));
    if (!schedule) { res.status(404).json({ error: "לא נמצא" }); return; }
    const logs = await db.select().from(reportDeliveryLogsTable)
      .where(eq(reportDeliveryLogsTable.scheduleId, id))
      .orderBy(desc(reportDeliveryLogsTable.runAt))
      .limit(20);
    res.json({ ...schedule, deliveryLogs: logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bi/schedules", async (req: Request, res: Response) => {
  try {
    const {
      reportName, reportType, reportConfig, scheduleType, cronExpression,
      outputFormat, recipients, subject, bodyTemplate, isActive
    } = req.body;
    if (!reportName) { res.status(400).json({ error: "שם הדוח חובה" }); return; }
    const nextRunAt = computeNextRun(scheduleType || "daily", cronExpression);
    const [created] = await db.insert(reportSchedulesTable).values({
      reportName,
      reportType: reportType || "financial",
      reportConfig: reportConfig || {},
      scheduleType: scheduleType || "daily",
      cronExpression: cronExpression || null,
      outputFormat: outputFormat || "pdf",
      recipients: Array.isArray(recipients) ? recipients : [],
      subject: subject || `דוח ${reportName}`,
      bodyTemplate: bodyTemplate || null,
      isActive: isActive !== false,
      nextRunAt,
      updatedAt: new Date(),
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/bi/schedules/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const {
      reportName, reportType, reportConfig, scheduleType, cronExpression,
      outputFormat, recipients, subject, bodyTemplate, isActive
    } = req.body;
    const nextRunAt = computeNextRun(scheduleType || "daily", cronExpression);
    const [updated] = await db.update(reportSchedulesTable)
      .set({
        reportName, reportType, reportConfig, scheduleType, cronExpression,
        outputFormat, recipients, subject, bodyTemplate, isActive, nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(reportSchedulesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/bi/schedules/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(reportSchedulesTable).where(eq(reportSchedulesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bi/schedules/:id/run", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [schedule] = await db.select().from(reportSchedulesTable).where(eq(reportSchedulesTable.id, id));
    if (!schedule) { res.status(404).json({ error: "לא נמצא" }); return; }

    const runAt = new Date();
    const [log] = await db.insert(reportDeliveryLogsTable).values({
      scheduleId: id,
      runAt,
      status: "success",
      recipients: schedule.recipients as any[],
      outputFormat: schedule.outputFormat,
      reportData: { manual: true, reportType: schedule.reportType },
    }).returning();

    await db.update(reportSchedulesTable)
      .set({ lastRunAt: runAt, lastRunStatus: "success", nextRunAt: computeNextRun(schedule.scheduleType, schedule.cronExpression), updatedAt: new Date() })
      .where(eq(reportSchedulesTable.id, id));

    res.json({ ok: true, log });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/delivery-logs", async (req: Request, res: Response) => {
  try {
    const scheduleId = req.query.scheduleId ? parseInt(req.query.scheduleId as string) : null;
    if (scheduleId) {
      const logs = await db.select().from(reportDeliveryLogsTable)
        .where(eq(reportDeliveryLogsTable.scheduleId, scheduleId))
        .orderBy(desc(reportDeliveryLogsTable.runAt))
        .limit(50);
      res.json(logs);
    } else {
      const logs = await db.select().from(reportDeliveryLogsTable)
        .orderBy(desc(reportDeliveryLogsTable.runAt))
        .limit(100);
      res.json(logs);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
