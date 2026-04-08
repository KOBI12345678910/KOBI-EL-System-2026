import { Router, type IRouter } from "express";
import { validateSession, logoutUser } from "../lib/auth";
import { db } from "@workspace/db";
import { userSessionsTable, usersTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, and, gt, desc, ne } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

function extractToken(req: any): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.substring(7);
  return req.query.token || null;
}

function computeFingerprint(ipAddress: string, userAgent: string): string {
  return crypto.createHash("sha256")
    .update(`${ipAddress}:${userAgent}`)
    .digest("hex")
    .substring(0, 64);
}

function parseDeviceName(userAgent: string): string {
  if (!userAgent) return "Unknown Device";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown Device";
}

export { computeFingerprint, parseDeviceName };

router.get("/sessions/admin/all", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const sessions = await db.select({
      id: userSessionsTable.id,
      userId: userSessionsTable.userId,
      ipAddress: userSessionsTable.ipAddress,
      userAgent: userSessionsTable.userAgent,
      deviceName: userSessionsTable.deviceName,
      location: userSessionsTable.location,
      fingerprint: userSessionsTable.fingerprint,
      isActive: userSessionsTable.isActive,
      isMfaVerified: userSessionsTable.isMfaVerified,
      expiresAt: userSessionsTable.expiresAt,
      lastActivityAt: userSessionsTable.lastActivityAt,
      createdAt: userSessionsTable.createdAt,
      userName: usersTable.fullName,
      userEmail: usersTable.email,
      username: usersTable.username,
    })
    .from(userSessionsTable)
    .leftJoin(usersTable, eq(userSessionsTable.userId, usersTable.id))
    .where(and(
      eq(userSessionsTable.isActive, true),
      gt(userSessionsTable.expiresAt, new Date())
    ))
    .orderBy(desc(userSessionsTable.lastActivityAt))
    .limit(500);

    res.json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to get sessions" });
  }
});

router.get("/sessions/admin/user/:userId", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }

    const targetUserId = parseInt(req.params.userId);
    const isSelf = (user as any).id === targetUserId;
    if (!isSelf && !(user as any).isSuperAdmin) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const sessions = await db.select({
      id: userSessionsTable.id,
      ipAddress: userSessionsTable.ipAddress,
      userAgent: userSessionsTable.userAgent,
      deviceName: userSessionsTable.deviceName,
      location: userSessionsTable.location,
      fingerprint: userSessionsTable.fingerprint,
      isActive: userSessionsTable.isActive,
      isMfaVerified: userSessionsTable.isMfaVerified,
      expiresAt: userSessionsTable.expiresAt,
      lastActivityAt: userSessionsTable.lastActivityAt,
      createdAt: userSessionsTable.createdAt,
    })
    .from(userSessionsTable)
    .where(and(
      eq(userSessionsTable.userId, targetUserId),
      eq(userSessionsTable.isActive, true),
      gt(userSessionsTable.expiresAt, new Date())
    ))
    .orderBy(desc(userSessionsTable.lastActivityAt));

    res.json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to get user sessions" });
  }
});

router.delete("/sessions/admin/:sessionId", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const sessionId = parseInt(req.params.sessionId);
    const result = await db.update(userSessionsTable)
      .set({ isActive: false })
      .where(eq(userSessionsTable.id, sessionId))
      .returning();

    if (result.length === 0) { res.status(404).json({ error: "Session not found" }); return; }
    res.json({ message: "Session revoked successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

router.delete("/sessions/admin/user/:userId/all", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const targetUserId = parseInt(req.params.userId);
    const result = await db.update(userSessionsTable)
      .set({ isActive: false })
      .where(and(
        eq(userSessionsTable.userId, targetUserId),
        eq(userSessionsTable.isActive, true)
      ))
      .returning();

    res.json({ message: `Revoked ${result.length} sessions for user ${targetUserId}`, count: result.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke user sessions" });
  }
});

router.get("/sessions/config", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const [idleTimeout] = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "session_idle_timeout_minutes")).limit(1);
    const [absoluteTimeout] = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "session_absolute_timeout_hours")).limit(1);
    const [concurrentLimit] = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "session_concurrent_limit")).limit(1);
    const [fingerprintEnabled] = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "session_fingerprint_enabled")).limit(1);

    res.json({
      idleTimeoutMinutes: parseInt(idleTimeout?.value || "30"),
      absoluteTimeoutHours: parseInt(absoluteTimeout?.value || "72"),
      concurrentSessionLimit: parseInt(concurrentLimit?.value || "5"),
      fingerprintEnabled: (fingerprintEnabled?.value || "true") === "true",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get session config" });
  }
});

router.put("/sessions/config", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const { idleTimeoutMinutes, absoluteTimeoutHours, concurrentSessionLimit, fingerprintEnabled } = req.body;

    const updates: Array<{ key: string; value: string }> = [];
    if (idleTimeoutMinutes !== undefined) updates.push({ key: "session_idle_timeout_minutes", value: String(idleTimeoutMinutes) });
    if (absoluteTimeoutHours !== undefined) updates.push({ key: "session_absolute_timeout_hours", value: String(absoluteTimeoutHours) });
    if (concurrentSessionLimit !== undefined) updates.push({ key: "session_concurrent_limit", value: String(concurrentSessionLimit) });
    if (fingerprintEnabled !== undefined) updates.push({ key: "session_fingerprint_enabled", value: String(fingerprintEnabled) });

    for (const update of updates) {
      const existing = await db.select().from(platformSettingsTable)
        .where(eq(platformSettingsTable.key, update.key)).limit(1);
      if (existing.length > 0) {
        await db.update(platformSettingsTable)
          .set({ value: update.value, updatedAt: new Date() })
          .where(eq(platformSettingsTable.key, update.key));
      } else {
        await db.insert(platformSettingsTable).values({
          key: update.key,
          value: update.value,
          category: "security",
          isSystem: true,
        });
      }
    }

    res.json({ message: "Session configuration updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update session config" });
  }
});

router.get("/sessions/stats", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const activeSessions = await db.select({ id: userSessionsTable.id })
      .from(userSessionsTable)
      .where(and(
        eq(userSessionsTable.isActive, true),
        gt(userSessionsTable.expiresAt, new Date())
      ));

    const allUsers = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.isActive, true));

    res.json({
      activeSessions: activeSessions.length,
      activeUsers: allUsers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get session stats" });
  }
});

export default router;
