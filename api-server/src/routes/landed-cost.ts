import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { purchaseOrdersTable, purchaseOrderItemsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function safeExec(query: string): Promise<any[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (err: any) {
    console.error(`[landed-cost] query error: ${err.message}`);
    return [];
  }
}

function esc(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}
function escNum(val: number | string | null | undefined): string {
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return "0";
  return String(n);
}

async function ensureTables() {
  await safeExec(`CREATE TABLE IF NOT EXISTS landed_cost_entries (id SERIAL PRIMARY KEY, po_id INTEGER NOT NULL, component_type VARCHAR(50) NOT NULL, component_name VARCHAR(200) NOT NULL, amount NUMERIC(15,2) NOT NULL DEFAULT 0, currency VARCHAR(10) DEFAULT 'ILS', allocation_method VARCHAR(30) DEFAULT 'by_value', notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await safeExec(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS weight NUMERIC(12,4) DEFAULT NULL`);
  await safeExec(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS volume NUMERIC(12,4) DEFAULT NULL`);

  await safeExec(`
    CREATE TABLE IF NOT EXISTS landed_cost_item_allocation (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      po_item_id INTEGER NOT NULL,
      allocated_amount NUMERIC(15,4) NOT NULL DEFAULT 0,
      allocation_pct NUMERIC(8,4),
      landed_cost_per_unit NUMERIC(15,4),
      allocation_basis NUMERIC(15,4),
      created_at TIMESTAMP DEFAULT NOW()
    )`
  );
}

ensureTables().catch(console.error);

async function calculateAllocations(entryId: number, poId: number, amount: number, method: string): Promise<any[]> {
  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, poId));
  if (items.length === 0) return [];

  let bases: number[] = [];

  if (method === "by_value") {
    bases = items.map(i => parseFloat(i.totalPrice || "0"));
  } else if (method === "by_quantity") {
    bases = items.map(i => parseFloat(i.quantity || "0"));
  } else if (method === "by_weight") {
    const rows = await safeExec(`SELECT id, COALESCE(weight, quantity::numeric, 1) AS basis FROM purchase_order_items WHERE order_id = ${poId} ORDER BY id`);
    const basisMap = Object.fromEntries(rows.map((r: any) => [Number(r.id), parseFloat(r.basis || "1")]));
    bases = items.map(i => basisMap[i.id] ?? 1);
  } else if (method === "by_volume") {
    const rows = await safeExec(`SELECT id, COALESCE(volume, quantity::numeric, 1) AS basis FROM purchase_order_items WHERE order_id = ${poId} ORDER BY id`);
    const basisMap = Object.fromEntries(rows.map((r: any) => [Number(r.id), parseFloat(r.basis || "1")]));
    bases = items.map(i => basisMap[i.id] ?? 1);
  } else {
    bases = items.map(_ => 1);
  }

  let totalBase = bases.reduce((s, b) => s + b, 0);
  if (totalBase === 0) {
    bases = items.map(_ => 1);
    totalBase = items.length;
  }

  const allocations = items.map((item, i) => {
    const pct = bases[i] / totalBase;
    const allocated = amount * pct;
    const qty = parseFloat(item.quantity || "1");
    return {
      poItemId: item.id,
      description: item.itemDescription,
      allocationBasis: bases[i],
      allocationPct: Math.round(pct * 10000) / 100,
      allocatedAmount: Math.round(allocated * 100) / 100,
      landedCostPerUnit: qty > 0 ? Math.round((allocated / qty) * 10000) / 10000 : 0,
      quantity: qty,
      unitPrice: parseFloat(item.unitPrice || "0"),
    };
  });

  return allocations;
}

router.get("/landed-costs/:poId", async (req, res) => {
  try {
    const poId = z.coerce.number().int().positive().parse(req.params.poId);
    const entries = await safeExec(`SELECT * FROM landed_cost_entries WHERE po_id = ${poId} ORDER BY id`);

    const result = [];
    for (const entry of entries) {
      const allocations = await safeExec(`
        SELECT lca.*, poi.item_description, poi.quantity, poi.unit_price
        FROM landed_cost_item_allocation lca
        JOIN purchase_order_items poi ON poi.id = lca.po_item_id
        WHERE lca.entry_id = ${entry.id}
      `);
      result.push({ ...entry, allocations });
    }

    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
    const totalLandedCost = entries.reduce((s, e) => s + parseFloat(e.amount || "0"), 0);

    res.json({
      poId,
      entries: result,
      totalLandedCost,
      freightCost: po?.freightCost || "0",
      insuranceCost: po?.insuranceCost || "0",
      customsCost: po?.customsCost || "0",
      landedCost: po?.landedCost || "0",
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/landed-costs/:poId/entries", async (req, res) => {
  try {
    const poId = z.coerce.number().int().positive().parse(req.params.poId);
    const body = z.object({
      componentType: z.enum(["freight", "customs", "insurance", "handling", "other"]),
      componentName: z.string().min(1),
      amount: z.number().positive(),
      currency: z.string().optional(),
      allocationMethod: z.enum(["by_value", "by_quantity", "by_weight", "by_volume", "equal"]).optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [entry] = await safeExec(`
      INSERT INTO landed_cost_entries (po_id, component_type, component_name, amount, currency, allocation_method, notes)
      VALUES (${poId}, ${esc(body.componentType)}, ${esc(body.componentName)}, ${escNum(body.amount)}, ${esc(body.currency || 'ILS')}, ${esc(body.allocationMethod || 'by_value')}, ${esc(body.notes)})
      RETURNING *
    `);

    const allocations = await calculateAllocations(entry.id, poId, body.amount, body.allocationMethod || "by_value");

    await safeExec(`DELETE FROM landed_cost_item_allocation WHERE entry_id = ${entry.id}`);
    for (const alloc of allocations) {
      await safeExec(`
        INSERT INTO landed_cost_item_allocation (entry_id, po_item_id, allocated_amount, allocation_pct, landed_cost_per_unit, allocation_basis)
        VALUES (${entry.id}, ${alloc.poItemId}, ${escNum(alloc.allocatedAmount)}, ${escNum(alloc.allocationPct)}, ${escNum(alloc.landedCostPerUnit)}, ${escNum(alloc.allocationBasis)})
      `);
    }

    const totalLandedCost = await safeExec(`SELECT COALESCE(SUM(amount), 0) AS total FROM landed_cost_entries WHERE po_id = ${poId}`);
    await db.update(purchaseOrdersTable).set({
      landedCost: String(totalLandedCost[0]?.total || 0),
      freightCost: body.componentType === "freight" ? String(body.amount) : undefined,
      insuranceCost: body.componentType === "insurance" ? String(body.amount) : undefined,
      customsCost: body.componentType === "customs" ? String(body.amount) : undefined,
      updatedAt: new Date(),
    }).where(eq(purchaseOrdersTable.id, poId));

    res.status(201).json({ ...entry, allocations });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/landed-costs/entries/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      componentName: z.string().optional(),
      amount: z.number().positive().optional(),
      currency: z.string().optional(),
      allocationMethod: z.enum(["by_value", "by_quantity", "by_weight", "by_volume", "equal"]).optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [existing] = await safeExec(`SELECT * FROM landed_cost_entries WHERE id = ${id}`);
    if (!existing) return res.status(404).json({ message: "Not found" });

    const sets: string[] = ["updated_at = NOW()"];
    if (body.componentName !== undefined) sets.push(`component_name = ${esc(body.componentName)}`);
    if (body.amount !== undefined) sets.push(`amount = ${escNum(body.amount)}`);
    if (body.currency !== undefined) sets.push(`currency = ${esc(body.currency)}`);
    if (body.allocationMethod !== undefined) sets.push(`allocation_method = ${esc(body.allocationMethod)}`);
    if (body.notes !== undefined) sets.push(`notes = ${esc(body.notes)}`);

    const [entry] = await safeExec(`UPDATE landed_cost_entries SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`);

    const newAmount = body.amount ?? parseFloat(existing.amount || "0");
    const newMethod = body.allocationMethod ?? existing.allocation_method ?? "by_value";

    await safeExec(`DELETE FROM landed_cost_item_allocation WHERE entry_id = ${id}`);
    const allocations = await calculateAllocations(id, existing.po_id, newAmount, newMethod);
    for (const alloc of allocations) {
      await safeExec(`
        INSERT INTO landed_cost_item_allocation (entry_id, po_item_id, allocated_amount, allocation_pct, landed_cost_per_unit, allocation_basis)
        VALUES (${id}, ${alloc.poItemId}, ${escNum(alloc.allocatedAmount)}, ${escNum(alloc.allocationPct)}, ${escNum(alloc.landedCostPerUnit)}, ${escNum(alloc.allocationBasis)})
      `);
    }

    const totalLandedCost = await safeExec(`SELECT COALESCE(SUM(amount), 0) AS total FROM landed_cost_entries WHERE po_id = ${existing.po_id}`);
    await db.update(purchaseOrdersTable).set({
      landedCost: String(totalLandedCost[0]?.total || 0),
      updatedAt: new Date(),
    }).where(eq(purchaseOrdersTable.id, existing.po_id));

    res.json({ ...entry, allocations });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/landed-costs/entries/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [entry] = await safeExec(`SELECT po_id FROM landed_cost_entries WHERE id = ${id}`);
    if (!entry) return res.status(404).json({ message: "Not found" });
    const poId = entry.po_id;

    await safeExec(`DELETE FROM landed_cost_item_allocation WHERE entry_id = ${id}`);
    await safeExec(`DELETE FROM landed_cost_entries WHERE id = ${id}`);

    const [totRow] = await safeExec(`SELECT COALESCE(SUM(amount), 0) AS total FROM landed_cost_entries WHERE po_id = ${poId}`);
    const newTotal = totRow?.total || 0;
    await db.update(purchaseOrdersTable).set({
      landedCost: String(newTotal),
      updatedAt: new Date(),
    }).where(eq(purchaseOrdersTable.id, poId));

    res.json({ message: "Deleted", newTotal });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/landed-costs/:poId/preview", async (req, res) => {
  try {
    const poId = z.coerce.number().int().positive().parse(req.params.poId);
    const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, poId));
    const entries = await safeExec(`SELECT * FROM landed_cost_entries WHERE po_id = ${poId}`);

    const itemMap: Record<number, any> = {};
    for (const item of items) {
      itemMap[item.id] = {
        id: item.id,
        description: item.itemDescription,
        quantity: parseFloat(item.quantity || "0"),
        unitPrice: parseFloat(item.unitPrice || "0"),
        totalPrice: parseFloat(item.totalPrice || "0"),
        landedCostComponents: [],
        totalLandedCostPerUnit: 0,
        totalLandedCostAllocation: 0,
      };
    }

    for (const entry of entries) {
      const allocations = await safeExec(`SELECT * FROM landed_cost_item_allocation WHERE entry_id = ${entry.id}`);
      for (const alloc of allocations) {
        if (itemMap[alloc.po_item_id]) {
          itemMap[alloc.po_item_id].landedCostComponents.push({
            componentName: entry.component_name,
            componentType: entry.component_type,
            allocated: parseFloat(alloc.allocated_amount || "0"),
            perUnit: parseFloat(alloc.landed_cost_per_unit || "0"),
          });
          itemMap[alloc.po_item_id].totalLandedCostPerUnit += parseFloat(alloc.landed_cost_per_unit || "0");
          itemMap[alloc.po_item_id].totalLandedCostAllocation += parseFloat(alloc.allocated_amount || "0");
        }
      }
    }

    res.json({
      items: Object.values(itemMap),
      totalLandedCost: entries.reduce((s, e) => s + parseFloat(e.amount || "0"), 0),
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
