import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { entityRecordsTable, entityFieldsTable, entityRelationsTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { computeFormulaFields } from "../../lib/formula-engine";

const router: IRouter = Router();

const ChildRecordBody = z.object({
  data: z.record(z.string(), z.any()).default({}),
  status: z.string().optional(),
});

const BulkChildBody = z.object({
  children: z.array(z.object({
    id: z.number().optional(),
    data: z.record(z.string(), z.any()).default({}),
    status: z.string().optional(),
    _delete: z.boolean().optional(),
  })),
});

async function resolveInlineChildRelation(parentId: number, childEntityId: number) {
  const [parentRecord] = await db.select().from(entityRecordsTable)
    .where(eq(entityRecordsTable.id, parentId));

  if (!parentRecord) return { error: "Parent record not found" };

  const relations = await db.select().from(entityRelationsTable)
    .where(and(
      eq(entityRelationsTable.sourceEntityId, parentRecord.entityId),
      eq(entityRelationsTable.targetEntityId, childEntityId),
      eq(entityRelationsTable.relationType, "inline_child")
    ));

  const relation = relations[0];
  if (!relation) return { error: "No inline_child relation found between parent and child entities" };

  return { relation, parentRecord, linkFieldSlug: relation.targetFieldSlug || "_parent_id" };
}

async function validateChildOwnership(childId: number, childEntityId: number, parentId: number, linkFieldSlug: string) {
  const [child] = await db.select().from(entityRecordsTable)
    .where(eq(entityRecordsTable.id, childId));

  if (!child) return { error: "Child record not found" };
  if (child.entityId !== childEntityId) return { error: "Child record does not belong to the specified entity" };

  const childData = child.data as Record<string, any>;
  if (String(childData[linkFieldSlug]) !== String(parentId)) {
    return { error: "Child record does not belong to the specified parent" };
  }

  return { child };
}

router.get("/platform/records/:parentId/children/:childEntityId", async (req, res) => {
  try {
    const parentId = Number(req.params.parentId);
    const childEntityId = Number(req.params.childEntityId);

    const resolved = await resolveInlineChildRelation(parentId, childEntityId);
    if ("error" in resolved) return res.status(404).json({ message: resolved.error });

    const { linkFieldSlug } = resolved;

    const allRecords = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, childEntityId))
      .orderBy(asc(entityRecordsTable.createdAt));

    const childRecords = allRecords.filter(r => {
      const data = r.data as Record<string, any>;
      return String(data[linkFieldSlug]) === String(parentId);
    });

    res.json({ records: childRecords, total: childRecords.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/records/:parentId/children/:childEntityId", async (req, res) => {
  try {
    const parentId = Number(req.params.parentId);
    const childEntityId = Number(req.params.childEntityId);
    const body = ChildRecordBody.parse(req.body);

    const resolved = await resolveInlineChildRelation(parentId, childEntityId);
    if ("error" in resolved) return res.status(404).json({ message: resolved.error });

    const { relation, linkFieldSlug } = resolved;

    const fields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, childEntityId))
      .orderBy(asc(entityFieldsTable.sortOrder));

    let processedData = { ...body.data, [linkFieldSlug]: parentId };
    processedData = computeFormulaFields(processedData, fields);

    const [record] = await db.insert(entityRecordsTable).values({
      entityId: childEntityId,
      data: processedData,
      status: body.status || "active",
    }).returning();

    await recomputeParentAggregates(parentId, childEntityId, relation);

    res.status(201).json(record);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/records/:parentId/children/:childEntityId/:childId", async (req, res) => {
  try {
    const parentId = Number(req.params.parentId);
    const childEntityId = Number(req.params.childEntityId);
    const childId = Number(req.params.childId);
    const body = ChildRecordBody.parse(req.body);

    const resolved = await resolveInlineChildRelation(parentId, childEntityId);
    if ("error" in resolved) return res.status(404).json({ message: resolved.error });

    const { relation, linkFieldSlug } = resolved;

    const ownership = await validateChildOwnership(childId, childEntityId, parentId, linkFieldSlug);
    if ("error" in ownership) return res.status(403).json({ message: ownership.error });

    const { child: existing } = ownership;

    const fields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, childEntityId))
      .orderBy(asc(entityFieldsTable.sortOrder));

    const mergedData = { ...(existing.data as Record<string, any>), ...body.data, [linkFieldSlug]: parentId };
    const processedData = computeFormulaFields(mergedData, fields);

    const updates: any = { data: processedData, updatedAt: new Date() };
    if (body.status !== undefined) updates.status = body.status;

    const [record] = await db.update(entityRecordsTable)
      .set(updates)
      .where(eq(entityRecordsTable.id, childId))
      .returning();

    await recomputeParentAggregates(parentId, childEntityId, relation);

    res.json(record);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/records/:parentId/children/:childEntityId/:childId", async (req, res) => {
  try {
    const parentId = Number(req.params.parentId);
    const childEntityId = Number(req.params.childEntityId);
    const childId = Number(req.params.childId);

    const resolved = await resolveInlineChildRelation(parentId, childEntityId);
    if ("error" in resolved) return res.status(404).json({ message: resolved.error });

    const { relation, linkFieldSlug } = resolved;

    const ownership = await validateChildOwnership(childId, childEntityId, parentId, linkFieldSlug);
    if ("error" in ownership) return res.status(403).json({ message: ownership.error });

    await db.delete(entityRecordsTable).where(eq(entityRecordsTable.id, childId));

    await recomputeParentAggregates(parentId, childEntityId, relation);

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/records/:parentId/children/:childEntityId/bulk", async (req, res) => {
  try {
    const parentId = Number(req.params.parentId);
    const childEntityId = Number(req.params.childEntityId);
    const body = BulkChildBody.parse(req.body);

    const resolved = await resolveInlineChildRelation(parentId, childEntityId);
    if ("error" in resolved) return res.status(404).json({ message: resolved.error });

    const { relation, linkFieldSlug } = resolved;

    const fields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, childEntityId))
      .orderBy(asc(entityFieldsTable.sortOrder));

    const results: any[] = [];

    for (const child of body.children) {
      if (child._delete && child.id) {
        const ownership = await validateChildOwnership(child.id, childEntityId, parentId, linkFieldSlug);
        if (!("error" in ownership)) {
          await db.delete(entityRecordsTable).where(eq(entityRecordsTable.id, child.id));
        }
        continue;
      }

      let processedData = { ...child.data, [linkFieldSlug]: parentId };
      processedData = computeFormulaFields(processedData, fields);

      if (child.id) {
        const ownership = await validateChildOwnership(child.id, childEntityId, parentId, linkFieldSlug);
        if ("error" in ownership) continue;

        const [updated] = await db.update(entityRecordsTable)
          .set({ data: processedData, updatedAt: new Date() })
          .where(eq(entityRecordsTable.id, child.id))
          .returning();
        if (updated) results.push(updated);
      } else {
        const [created] = await db.insert(entityRecordsTable).values({
          entityId: childEntityId,
          data: processedData,
          status: child.status || "active",
        }).returning();
        results.push(created);
      }
    }

    await recomputeParentAggregates(parentId, childEntityId, relation);

    res.json({ records: results });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/records/:parentId/children/:childEntityId/aggregates", async (req, res) => {
  try {
    const parentId = Number(req.params.parentId);
    const childEntityId = Number(req.params.childEntityId);

    const resolved = await resolveInlineChildRelation(parentId, childEntityId);
    if ("error" in resolved) return res.status(404).json({ message: resolved.error });

    const { relation, linkFieldSlug } = resolved;
    const settings = (relation.settings as Record<string, any>) || {};
    const aggregations = settings.aggregations || [];

    const allRecords = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, childEntityId));

    const childRecords = allRecords.filter(r => {
      const data = r.data as Record<string, any>;
      return String(data[linkFieldSlug]) === String(parentId);
    });

    const results: Record<string, number> = {};

    for (const agg of aggregations) {
      const { function: aggFunc, sourceField, targetField } = agg;
      const values = childRecords
        .map(r => Number((r.data as Record<string, any>)[sourceField] ?? 0))
        .filter(n => !isNaN(n));

      results[targetField] = computeAggregate(aggFunc, values);
    }

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

function computeAggregate(func: string, values: number[]): number {
  let result = 0;
  switch (func) {
    case "SUM":
      result = values.reduce((a, b) => a + b, 0);
      break;
    case "COUNT":
      result = values.length;
      break;
    case "AVG":
      result = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
      break;
    case "MIN":
      result = values.length === 0 ? 0 : Math.min(...values);
      break;
    case "MAX":
      result = values.length === 0 ? 0 : Math.max(...values);
      break;
  }
  return Math.round(result * 100) / 100;
}

async function recomputeParentAggregates(parentId: number, childEntityId: number, relation: any) {
  try {
    const settings = (relation.settings as Record<string, any>) || {};
    const aggregations = settings.aggregations || [];

    if (aggregations.length === 0) return;

    const linkFieldSlug = relation.targetFieldSlug || "_parent_id";

    const allRecords = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, childEntityId));

    const childRecords = allRecords.filter(r => {
      const data = r.data as Record<string, any>;
      return String(data[linkFieldSlug]) === String(parentId);
    });

    const [parentRecord] = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.id, parentId));

    if (!parentRecord) return;

    const parentData = { ...(parentRecord.data as Record<string, any>) };
    let changed = false;

    for (const agg of aggregations) {
      const { function: aggFunc, sourceField, targetField } = agg;
      const values = childRecords
        .map(r => Number((r.data as Record<string, any>)[sourceField] ?? 0))
        .filter(n => !isNaN(n));

      parentData[targetField] = computeAggregate(aggFunc, values);
      changed = true;
    }

    if (changed) {
      await db.update(entityRecordsTable)
        .set({ data: parentData, updatedAt: new Date() })
        .where(eq(entityRecordsTable.id, parentId));
    }
  } catch (err) {
    console.error("Failed to recompute parent aggregates:", err);
  }
}

export default router;
