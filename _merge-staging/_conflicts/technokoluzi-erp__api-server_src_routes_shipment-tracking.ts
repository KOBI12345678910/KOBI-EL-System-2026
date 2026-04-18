import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { shipmentTrackingTable, shipmentStatusUpdatesTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["etd", "eta", "actualDeparture", "actualArrival"];
  const numericFields = ["freightCost", "insuranceValue", "goodsValue", "weightKg", "volumeCbm"];
  const intFields = ["importOrderId", "containerCount", "packagesCount", "delayDays"];
  const tsFields = ["lastUpdateDate"];
  for (const key of dateFields) { if (cleaned[key] === "") cleaned[key] = null; }
  for (const key of numericFields) { if (cleaned[key] === "") cleaned[key] = undefined; }
  for (const key of intFields) {
    if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined;
    else if (cleaned[key] !== undefined) cleaned[key] = parseInt(cleaned[key]);
  }
  for (const key of tsFields) { if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined; }
  delete cleaned.id;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  return cleaned;
}

async function generateShipmentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(shipmentTrackingTable);
  const num = (result?.count || 0) + 1;
  return `SHP-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/shipment-tracking", async (_req, res) => {
  try {
    const shipments = await db.select().from(shipmentTrackingTable).orderBy(desc(shipmentTrackingTable.createdAt));
    res.json(shipments);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/shipment-tracking/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [s] = await db.select().from(shipmentTrackingTable).where(eq(shipmentTrackingTable.id, id));
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/shipment-tracking", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.shipmentNumber) cleaned.shipmentNumber = await generateShipmentNumber();
    const [s] = await db.insert(shipmentTrackingTable).values(cleaned).returning();
    res.status(201).json(s);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/shipment-tracking/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [s] = await db.update(shipmentTrackingTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(shipmentTrackingTable.id, id)).returning();
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/shipment-tracking/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(shipmentTrackingTable).where(eq(shipmentTrackingTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

// Status updates (timeline)
router.get("/shipment-tracking/:id/updates", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const updates = await db.select().from(shipmentStatusUpdatesTable)
      .where(eq(shipmentStatusUpdatesTable.shipmentId, id))
      .orderBy(desc(shipmentStatusUpdatesTable.updateDate));
    res.json(updates);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.post("/shipment-tracking/:id/updates", async (req, res) => {
  try {
    const shipmentId = z.coerce.number().int().positive().parse(req.params.id);
    const [update] = await db.insert(shipmentStatusUpdatesTable).values({ ...req.body, shipmentId }).returning();
    await db.update(shipmentTrackingTable).set({ lastUpdateDate: new Date(), updatedAt: new Date() }).where(eq(shipmentTrackingTable.id, shipmentId));
    res.status(201).json(update);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/shipment-status-updates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(shipmentStatusUpdatesTable).where(eq(shipmentStatusUpdatesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

export default router;
