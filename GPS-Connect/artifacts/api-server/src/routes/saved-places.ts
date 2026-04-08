import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, savedPlacesTable } from "@workspace/db";
import {
  CreateSavedPlaceBody,
  DeleteSavedPlaceParams,
  GetSavedPlacesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/saved-places", async (_req, res): Promise<void> => {
  const places = await db
    .select()
    .from(savedPlacesTable)
    .orderBy(desc(savedPlacesTable.createdAt));

  res.json(GetSavedPlacesResponse.parse(places));
});

router.post("/saved-places", async (req, res): Promise<void> => {
  const parsed = CreateSavedPlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [place] = await db
    .insert(savedPlacesTable)
    .values({
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      category: parsed.data.category ?? null,
    })
    .returning();

  res.status(201).json(place);
});

router.delete("/saved-places/:id", async (req, res): Promise<void> => {
  const params = DeleteSavedPlaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [place] = await db
    .delete(savedPlacesTable)
    .where(eq(savedPlacesTable.id, id))
    .returning();

  if (!place) {
    res.status(404).json({ error: "Place not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
