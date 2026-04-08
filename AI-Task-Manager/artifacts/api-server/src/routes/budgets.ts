import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { budgetsTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const numericFields = ["budgetedAmount", "actualAmount", "committedAmount", "forecastAmount"];
  const intFields = ["fiscalYear", "fiscalMonth", "projectId"];
  const dateFields = ["approvedDate"];
  for (const key of numericFields) {
    if (cleaned[key] === "") cleaned[key] = undefined;
    else if (cleaned[key] !== undefined) cleaned[key] = String(cleaned[key]);
  }
  for (const key of intFields) {
    if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined;
    else if (cleaned[key] !== undefined) cleaned[key] = parseInt(cleaned[key]);
  }
  for (const key of dateFields) {
    if (cleaned[key] === "") cleaned[key] = null;
  }
  if (typeof cleaned.alertThreshold80 === "string") cleaned.alertThreshold80 = cleaned.alertThreshold80 === "true";
  if (typeof cleaned.alertThreshold90 === "string") cleaned.alertThreshold90 = cleaned.alertThreshold90 === "true";
  if (typeof cleaned.alertThreshold100 === "string") cleaned.alertThreshold100 = cleaned.alertThreshold100 === "true";
  delete cleaned.variance;
  delete cleaned.remainingAmount;
  delete cleaned.utilizationPct;
  return cleaned;
}

async function generateBudgetNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(budgetsTable);
  const num = (result?.count || 0) + 1;
  return `BUD-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/budgets", async (_req, res) => {
  try {
    const budgets = await db.select().from(budgetsTable).orderBy(desc(budgetsTable.createdAt));
    res.json(budgets);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/budgets/summary/:year", async (req, res) => {
  try {
    const year = z.coerce.number().int().positive().parse(req.params.year);
    const budgets = await db.select().from(budgetsTable).where(eq(budgetsTable.fiscalYear, year));
    const totalBudget = budgets.reduce((s, b) => s + parseFloat(b.budgetedAmount || "0"), 0);
    const totalActual = budgets.reduce((s, b) => s + parseFloat(b.actualAmount || "0"), 0);
    const totalCommitted = budgets.reduce((s, b) => s + parseFloat(b.committedAmount || "0"), 0);
    const totalForecast = budgets.reduce((s, b) => s + parseFloat(b.forecastAmount || "0"), 0);
    const overBudget = budgets.filter(b => parseFloat(b.actualAmount || "0") > parseFloat(b.budgetedAmount || "0")).length;
    const alert80 = budgets.filter(b => {
      const pct = parseFloat(b.budgetedAmount || "0") > 0 ? (parseFloat(b.actualAmount || "0") / parseFloat(b.budgetedAmount || "0") * 100) : 0;
      return pct >= 80 && pct < 90;
    }).length;
    const alert90 = budgets.filter(b => {
      const pct = parseFloat(b.budgetedAmount || "0") > 0 ? (parseFloat(b.actualAmount || "0") / parseFloat(b.budgetedAmount || "0") * 100) : 0;
      return pct >= 90 && pct < 100;
    }).length;
    const alert100 = budgets.filter(b => {
      const pct = parseFloat(b.budgetedAmount || "0") > 0 ? (parseFloat(b.actualAmount || "0") / parseFloat(b.budgetedAmount || "0") * 100) : 0;
      return pct >= 100;
    }).length;

    const byDepartment: Record<string, { budget: number; actual: number; committed: number }> = {};
    budgets.forEach(b => {
      const dept = b.department || "ללא מחלקה";
      if (!byDepartment[dept]) byDepartment[dept] = { budget: 0, actual: 0, committed: 0 };
      byDepartment[dept].budget += parseFloat(b.budgetedAmount || "0");
      byDepartment[dept].actual += parseFloat(b.actualAmount || "0");
      byDepartment[dept].committed += parseFloat(b.committedAmount || "0");
    });

    const byCategory: Record<string, { budget: number; actual: number }> = {};
    budgets.forEach(b => {
      const cat = b.category || "אחר";
      if (!byCategory[cat]) byCategory[cat] = { budget: 0, actual: 0 };
      byCategory[cat].budget += parseFloat(b.budgetedAmount || "0");
      byCategory[cat].actual += parseFloat(b.actualAmount || "0");
    });

    res.json({
      year, count: budgets.length, totalBudget, totalActual, totalCommitted, totalForecast,
      overBudget, alert80, alert90, alert100, byDepartment, byCategory,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/budgets/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!budget) return res.status(404).json({ message: "Budget not found" });
    res.json(budget);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/budgets", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.budgetNumber) {
      cleaned.budgetNumber = await generateBudgetNumber();
    }
    const [budget] = await db.insert(budgetsTable).values(cleaned).returning();
    res.status(201).json(budget);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/budgets/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [budget] = await db.update(budgetsTable)
      .set({ ...cleaned, updatedAt: new Date() })
      .where(eq(budgetsTable.id, id)).returning();
    if (!budget) return res.status(404).json({ message: "Budget not found" });
    res.json(budget);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/budgets/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(budgetsTable).where(eq(budgetsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Budget not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
