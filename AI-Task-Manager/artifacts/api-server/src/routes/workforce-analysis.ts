import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  salariedEmployeesTable, salariedTasksTable, salariedKpisTable,
  salesAgentsTable, salesDealsTable,
  productionWorkersTable, productionMonthlyTable,
  installersTable, installerMonthlyTable,
} from "@workspace/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router: IRouter = Router();

function extractToken(req: any): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.substring(7);
  return req.query.token || null;
}

async function requireAuth(req: any, res: any): Promise<any | null> {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "לא מחובר" }); return null; }
  const { user, error } = await validateSession(token);
  if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return null; }
  return user;
}

// ==================== SALARIED EMPLOYEES ====================

router.get("/workforce/salaried", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(salariedEmployeesTable).orderBy(asc(salariedEmployeesTable.fullName));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/salaried", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const data = { ...req.body };
    if (!data.startDate || data.startDate === "") data.startDate = null;
    const [row] = await db.insert(salariedEmployeesTable).values(data).returning();
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "שגיאה" }); }
});

router.put("/workforce/salaried/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const { id, createdAt, ...updates } = req.body;
    updates.updatedAt = new Date();
    if (updates.startDate === "") updates.startDate = null;
    const [row] = await db.update(salariedEmployeesTable).set(updates).where(eq(salariedEmployeesTable.id, +req.params.id)).returning();
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/salaried/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(salariedKpisTable).where(eq(salariedKpisTable.employeeId, +req.params.id));
    await db.delete(salariedTasksTable).where(eq(salariedTasksTable.employeeId, +req.params.id));
    await db.delete(salariedEmployeesTable).where(eq(salariedEmployeesTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { console.error(err); res.status(500).json({ error: "שגיאה" }); }
});

router.get("/workforce/salaried/:id/tasks", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(salariedTasksTable).where(eq(salariedTasksTable.employeeId, +req.params.id)).orderBy(desc(salariedTasksTable.createdAt));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/salaried/:id/tasks", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const [row] = await db.insert(salariedTasksTable).values({ ...req.body, employeeId: +req.params.id }).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/salaried-tasks/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(salariedTasksTable).where(eq(salariedTasksTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.get("/workforce/salaried/:id/kpis", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(salariedKpisTable).where(eq(salariedKpisTable.employeeId, +req.params.id)).orderBy(desc(salariedKpisTable.createdAt));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/salaried/:id/kpis", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const [row] = await db.insert(salariedKpisTable).values({ ...req.body, employeeId: +req.params.id }).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/salaried-kpis/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(salariedKpisTable).where(eq(salariedKpisTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

// ==================== SALES AGENTS ====================

router.get("/workforce/sales-agents", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(salesAgentsTable).orderBy(asc(salesAgentsTable.fullName));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/sales-agents", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const [row] = await db.insert(salesAgentsTable).values(req.body).returning();
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "שגיאה" }); }
});

router.put("/workforce/sales-agents/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const { id, createdAt, ...updates } = req.body;
    updates.updatedAt = new Date();
    const [row] = await db.update(salesAgentsTable).set(updates).where(eq(salesAgentsTable.id, +req.params.id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/sales-agents/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(salesDealsTable).where(eq(salesDealsTable.agentId, +req.params.id));
    await db.delete(salesAgentsTable).where(eq(salesAgentsTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.get("/workforce/sales-agents/:id/deals", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(salesDealsTable).where(eq(salesDealsTable.agentId, +req.params.id)).orderBy(desc(salesDealsTable.createdAt));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/sales-agents/:id/deals", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const dealData = { ...req.body, agentId: +req.params.id };
    if (dealData.closedAt === "") dealData.closedAt = null;
    const [row] = await db.insert(salesDealsTable).values(dealData).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/sales-deals/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(salesDealsTable).where(eq(salesDealsTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

// ==================== PRODUCTION WORKERS ====================

router.get("/workforce/production", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(productionWorkersTable).orderBy(asc(productionWorkersTable.fullName));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/production", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const [row] = await db.insert(productionWorkersTable).values(req.body).returning();
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "שגיאה" }); }
});

router.put("/workforce/production/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const { id, createdAt, ...updates } = req.body;
    updates.updatedAt = new Date();
    const [row] = await db.update(productionWorkersTable).set(updates).where(eq(productionWorkersTable.id, +req.params.id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/production/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(productionMonthlyTable).where(eq(productionMonthlyTable.workerId, +req.params.id));
    await db.delete(productionWorkersTable).where(eq(productionWorkersTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.get("/workforce/production/:id/monthly", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(productionMonthlyTable).where(eq(productionMonthlyTable.workerId, +req.params.id)).orderBy(asc(productionMonthlyTable.month));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/production/:id/monthly", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const [row] = await db.insert(productionMonthlyTable).values({ ...req.body, workerId: +req.params.id }).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/production-monthly/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(productionMonthlyTable).where(eq(productionMonthlyTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

// ==================== INSTALLERS ====================

router.get("/workforce/installers", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(installersTable).orderBy(asc(installersTable.fullName));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/installers", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const [row] = await db.insert(installersTable).values(req.body).returning();
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "שגיאה" }); }
});

router.put("/workforce/installers/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const { id, createdAt, ...updates } = req.body;
    updates.updatedAt = new Date();
    const [row] = await db.update(installersTable).set(updates).where(eq(installersTable.id, +req.params.id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/installers/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(installerMonthlyTable).where(eq(installerMonthlyTable.installerId, +req.params.id));
    await db.delete(installersTable).where(eq(installersTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.get("/workforce/installers/:id/monthly", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const rows = await db.select().from(installerMonthlyTable).where(eq(installerMonthlyTable.installerId, +req.params.id)).orderBy(asc(installerMonthlyTable.month));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.post("/workforce/installers/:id/monthly", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    const [row] = await db.insert(installerMonthlyTable).values({ ...req.body, installerId: +req.params.id }).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

router.delete("/workforce/installer-monthly/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;
    await db.delete(installerMonthlyTable).where(eq(installerMonthlyTable.id, +req.params.id));
    res.json({ message: "נמחק" });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

// ==================== SUMMARY / DASHBOARD ====================

router.get("/workforce/summary", async (req, res) => {
  try {
    const user = await requireAuth(req, res); if (!user) return;

    const [salariedCount] = await db.select({ count: sql<number>`count(*)::int` }).from(salariedEmployeesTable);
    const [salesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(salesAgentsTable);
    const [prodCount] = await db.select({ count: sql<number>`count(*)::int` }).from(productionWorkersTable);
    const [instCount] = await db.select({ count: sql<number>`count(*)::int` }).from(installersTable);

    res.json({
      salaried: salariedCount?.count || 0,
      salesAgents: salesCount?.count || 0,
      production: prodCount?.count || 0,
      installers: instCount?.count || 0,
    });
  } catch (err) { res.status(500).json({ error: "שגיאה" }); }
});

export default router;
