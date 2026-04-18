import { Router, type IRouter } from "express";
import { eq, asc, sql } from "drizzle-orm";
import { db, sessionsTable, locationsTable } from "@workspace/db";
import {
  ListLocationsParams,
  AddLocationParams,
  AddLocationBody,
  AddLocationsBatchParams,
  AddLocationsBatchBody,
  ListLocationsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

router.get("/sessions/:sessionId/locations", async (req, res): Promise<void> => {
  const params = ListLocationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const locations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.sessionId, params.data.sessionId))
    .orderBy(asc(locationsTable.timestamp));

  res.json(ListLocationsResponse.parse(locations));
});

router.post("/sessions/:sessionId/locations", async (req, res): Promise<void> => {
  const params = AddLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [location] = await db
    .insert(locationsTable)
    .values({
      sessionId: params.data.sessionId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      altitude: parsed.data.altitude,
      accuracy: parsed.data.accuracy,
      speed: parsed.data.speed,
      heading: parsed.data.heading,
      timestamp: new Date(parsed.data.timestamp),
    })
    .returning();

  const lastLocations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.sessionId, params.data.sessionId))
    .orderBy(asc(locationsTable.timestamp));

  let totalDistance = 0;
  for (let i = 1; i < lastLocations.length; i++) {
    totalDistance += haversineDistance(
      lastLocations[i - 1].latitude,
      lastLocations[i - 1].longitude,
      lastLocations[i].latitude,
      lastLocations[i].longitude
    );
  }

  await db
    .update(sessionsTable)
    .set({
      totalDistance: Math.round(totalDistance * 1000) / 1000,
      totalPoints: lastLocations.length,
    })
    .where(eq(sessionsTable.id, params.data.sessionId));

  res.status(201).json(location);
});

router.post("/sessions/:sessionId/locations/batch", async (req, res): Promise<void> => {
  const params = AddLocationsBatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddLocationsBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const values = parsed.data.locations.map((loc) => ({
    sessionId: params.data.sessionId,
    latitude: loc.latitude,
    longitude: loc.longitude,
    altitude: loc.altitude,
    accuracy: loc.accuracy,
    speed: loc.speed,
    heading: loc.heading,
    timestamp: new Date(loc.timestamp),
  }));

  const locations = await db
    .insert(locationsTable)
    .values(values)
    .returning();

  const allLocations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.sessionId, params.data.sessionId))
    .orderBy(asc(locationsTable.timestamp));

  let totalDistance = 0;
  for (let i = 1; i < allLocations.length; i++) {
    totalDistance += haversineDistance(
      allLocations[i - 1].latitude,
      allLocations[i - 1].longitude,
      allLocations[i].latitude,
      allLocations[i].longitude
    );
  }

  await db
    .update(sessionsTable)
    .set({
      totalDistance: Math.round(totalDistance * 1000) / 1000,
      totalPoints: allLocations.length,
    })
    .where(eq(sessionsTable.id, params.data.sessionId));

  res.status(201).json(locations);
});

export default router;
