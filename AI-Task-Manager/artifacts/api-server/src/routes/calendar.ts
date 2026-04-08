import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { calendarEventsTable } from "@workspace/db/schema";
import { eq, and, between, gte, lte, desc, asc, sql } from "drizzle-orm";
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

router.get("/calendar/events", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { from, to, userId: targetUserId } = req.query;
    const isAdmin = (user as any).isSuperAdmin;
    let effectiveUserId = (user as any).id;

    if (targetUserId && Number(targetUserId) !== effectiveUserId) {
      if (!isAdmin) {
        res.status(403).json({ error: "אין הרשאה לצפות ביומן של משתמש אחר" });
        return;
      }
      effectiveUserId = Number(targetUserId);
    }

    const conditions: any[] = [];

    if (targetUserId === "all" && isAdmin) {
      // no user filter
    } else {
      conditions.push(eq(calendarEventsTable.userId, effectiveUserId));
    }

    if (from) conditions.push(gte(calendarEventsTable.eventDate, String(from)));
    if (to) conditions.push(lte(calendarEventsTable.eventDate, String(to)));

    const events = await db.select().from(calendarEventsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(calendarEventsTable.eventDate), asc(calendarEventsTable.startTime));

    res.json(events);
  } catch (err) {
    console.error("Calendar events error:", err);
    res.status(500).json({ error: "שגיאה בטעינת אירועים" });
  }
});

router.post("/calendar/events", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { title, description, eventType, eventDate, startTime, endTime, location, color, isAllDay, priority, reminderMinutes, relatedEntityType, relatedEntityId, relatedEntityName } = req.body;

    if (!title || !eventDate || !startTime || !endTime) {
      res.status(400).json({ error: "כותרת, תאריך, שעת התחלה ושעת סיום הם שדות חובה" });
      return;
    }

    const [event] = await db.insert(calendarEventsTable).values({
      userId: (user as any).id,
      title,
      description: description || null,
      eventType: eventType || "meeting",
      eventDate,
      startTime,
      endTime,
      location: location || null,
      color: color || "#3B82F6",
      isAllDay: isAllDay || false,
      priority: priority || "normal",
      reminderMinutes: reminderMinutes || null,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId || null,
      relatedEntityName: relatedEntityName || null,
    }).returning();

    res.json(event);
  } catch (err) {
    console.error("Create calendar event error:", err);
    res.status(500).json({ error: "שגיאה ביצירת אירוע" });
  }
});

router.put("/calendar/events/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const eventId = parseInt(req.params.id);
    const [existing] = await db.select().from(calendarEventsTable).where(eq(calendarEventsTable.id, eventId));
    if (!existing) { res.status(404).json({ error: "אירוע לא נמצא" }); return; }

    if (existing.userId !== (user as any).id && !(user as any).isSuperAdmin) {
      res.status(403).json({ error: "אין הרשאה לערוך אירוע זה" });
      return;
    }

    const allowed = ["title", "description", "eventType", "eventDate", "startTime", "endTime", "location", "color", "isAllDay", "isCompleted", "priority", "reminderMinutes", "relatedEntityType", "relatedEntityId", "relatedEntityName"];
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const [updated] = await db.update(calendarEventsTable).set(updates as any).where(eq(calendarEventsTable.id, eventId)).returning();
    res.json(updated);
  } catch (err) {
    console.error("Update calendar event error:", err);
    res.status(500).json({ error: "שגיאה בעדכון אירוע" });
  }
});

router.delete("/calendar/events/:id", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const eventId = parseInt(req.params.id);
    const [existing] = await db.select().from(calendarEventsTable).where(eq(calendarEventsTable.id, eventId));
    if (!existing) { res.status(404).json({ error: "אירוע לא נמצא" }); return; }

    if (existing.userId !== (user as any).id && !(user as any).isSuperAdmin) {
      res.status(403).json({ error: "אין הרשאה למחוק אירוע זה" });
      return;
    }

    await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, eventId));
    res.json({ message: "אירוע נמחק" });
  } catch (err) {
    console.error("Delete calendar event error:", err);
    res.status(500).json({ error: "שגיאה במחיקת אירוע" });
  }
});

router.patch("/calendar/events/:id/complete", async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const eventId = parseInt(req.params.id);
    const [existing] = await db.select().from(calendarEventsTable).where(eq(calendarEventsTable.id, eventId));
    if (!existing) { res.status(404).json({ error: "אירוע לא נמצא" }); return; }
    if (existing.userId !== (user as any).id && !(user as any).isSuperAdmin) {
      res.status(403).json({ error: "אין הרשאה" });
      return;
    }

    const [updated] = await db.update(calendarEventsTable)
      .set({ isCompleted: !existing.isCompleted, updatedAt: new Date() })
      .where(eq(calendarEventsTable.id, eventId))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "שגיאה" });
  }
});

export default router;
