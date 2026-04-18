import { Router, type IRouter } from "express";
import { eq, desc, sql, count, sum, avg } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentActivityQueryParams,
  GetRecentActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [stats] = await db
    .select({
      totalSessions: count(sessionsTable.id),
      totalDistance: sql<number>`coalesce(sum(${sessionsTable.totalDistance}), 0)`,
      totalPoints: sql<number>`coalesce(sum(${sessionsTable.totalPoints}), 0)`,
      activeSessions: sql<number>`count(*) filter (where ${sessionsTable.status} = 'active')`,
      averageDistance: sql<number>`coalesce(avg(${sessionsTable.totalDistance}), 0)`,
    })
    .from(sessionsTable);

  res.json(
    GetDashboardSummaryResponse.parse({
      totalSessions: Number(stats.totalSessions),
      activeSessions: Number(stats.activeSessions),
      totalDistance: Number(stats.totalDistance),
      totalPoints: Number(stats.totalPoints),
      averageDistance: Math.round(Number(stats.averageDistance) * 1000) / 1000,
    })
  );
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const params = GetRecentActivityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const limit = params.data.limit ?? 10;

  const sessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(limit);

  const activities = sessions.flatMap((session) => {
    const items = [
      {
        id: session.id * 1000,
        sessionId: session.id,
        sessionName: session.name,
        type: "session_started" as const,
        description: `Started tracking "${session.name}"`,
        timestamp: session.startedAt.toISOString(),
      },
    ];

    if (session.status === "stopped" && session.stoppedAt) {
      items.push({
        id: session.id * 1000 + 1,
        sessionId: session.id,
        sessionName: session.name,
        type: "session_stopped" as const,
        description: `Stopped tracking "${session.name}" — ${session.totalDistance.toFixed(2)} km traveled`,
        timestamp: session.stoppedAt.toISOString(),
      });
    }

    return items;
  });

  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  res.json(GetRecentActivityResponse.parse(activities.slice(0, limit)));
});

export default router;
