import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { validationRulesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const CreateValidationBody = z.object({
  name: z.string().min(1),
  ruleType: z.enum(["required", "min_length", "max_length", "min_value", "max_value", "regex", "email", "url", "numeric_range", "custom", "cross_field"]),
  fieldSlug: z.string().nullable().optional(),
  operator: z.string().min(1),
  value: z.string().nullable().optional(),
  errorMessage: z.string().min(1),
  errorMessageHe: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  conditions: z.record(z.string(), z.any()).optional(),
});

router.get("/platform/entities/:entityId/validations", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const rules = await db.select().from(validationRulesTable)
      .where(eq(validationRulesTable.entityId, entityId))
      .orderBy(asc(validationRulesTable.sortOrder));
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/validations", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateValidationBody.parse(req.body);
    const [rule] = await db.insert(validationRulesTable).values({ ...body, entityId }).returning();
    res.status(201).json(rule);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/validations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(validationRulesTable).where(eq(validationRulesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Validation rule not found" });
    const body = CreateValidationBody.partial().parse(req.body);
    const [rule] = await db.update(validationRulesTable).set(body).where(eq(validationRulesTable.id, id)).returning();
    res.json(rule);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/validations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(validationRulesTable).where(eq(validationRulesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Validation rule not found" });
    await db.delete(validationRulesTable).where(eq(validationRulesTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
