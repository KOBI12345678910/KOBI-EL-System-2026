import { Router, type IRouter } from "express";
import { eq, desc, sql, count } from "drizzle-orm";
import { db, locationsTable } from "@workspace/db";
import {
  SaveLocationBody,
  GetLocationHistoryQueryParams,
  GetLocationHistoryResponse,
  GetLocationStatsResponse,
  GetRecentSessionsQueryParams,
  GetRecentSessionsResponse,
} from "@workspace/api-zod";
import { savedPlacesTable, shareSessionsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/locations", async (req, res): Promise<void> => {
  const parsed = SaveLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [location] = await db
    .insert(locationsTable)
    .values({
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracy: parsed.data.accuracy,
      speed: parsed.data.speed ?? null,
      heading: parsed.data.heading ?? null,
      sessionId: parsed.data.sessionId,
      timestamp: new Date(parsed.data.timestamp),
    })
    .returning();

  res.status(201).json(location);
});

router.get("/locations", async (req, res): Promise<void> => {
  const parsed = GetLocationHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const query = db
    .select()
    .from(locationsTable)
    .orderBy(desc(locationsTable.timestamp))
    .limit(parsed.data.limit ?? 50);

  if (parsed.data.sessionId) {
    const results = await query.where(eq(locationsTable.sessionId, parsed.data.sessionId));
    res.json(GetLocationHistoryResponse.parse(results));
    return;
  }

  const results = await query;
  res.json(GetLocationHistoryResponse.parse(results));
});

router.get("/locations/stats", async (_req, res): Promise<void> => {
  const [locationCount] = await db.select({ count: count() }).from(locationsTable);
  const [placeCount] = await db.select({ count: count() }).from(savedPlacesTable);

  const sessionResult = await db
    .selectDistinct({ sessionId: locationsTable.sessionId })
    .from(locationsTable);

  const [activeShares] = await db
    .select({ count: count() })
    .from(shareSessionsTable)
    .where(eq(shareSessionsTable.active, true));

  res.json(
    GetLocationStatsResponse.parse({
      totalLocationsTracked: locationCount?.count ?? 0,
      totalSessions: sessionResult.length,
      totalSavedPlaces: placeCount?.count ?? 0,
      activeShareSessions: activeShares?.count ?? 0,
      totalDistanceKm: 0,
    }),
  );
});

router.get("/locations/recent-sessions", async (req, res): Promise<void> => {
  const parsed = GetRecentSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 10;

  const sessions = await db
    .select({
      sessionId: locationsTable.sessionId,
      startTime: sql<Date>`min(${locationsTable.timestamp})`,
      endTime: sql<Date>`max(${locationsTable.timestamp})`,
      locationCount: count(),
    })
    .from(locationsTable)
    .groupBy(locationsTable.sessionId)
    .orderBy(desc(sql`max(${locationsTable.timestamp})`))
    .limit(limit);

  const result = sessions.map((s) => ({
    ...s,
    distanceKm: 0,
  }));

  res.json(GetRecentSessionsResponse.parse(result));
});

export default router;
