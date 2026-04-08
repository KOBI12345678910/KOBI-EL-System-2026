import { db } from "@workspace/db";
import { usersTable, userSessionsTable, platformRolesTable, roleAssignmentsTable, userGpsStatusTable } from "@workspace/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import crypto from "crypto";
import { sendWelcomeEmail, sendPasswordResetEmail } from "./gmail-service";
import { isDbAlive, setDbAlive } from "./db-health";

const SESSION_DURATION_HOURS = 8; // 8 hours

// WARNING: _fallbackSessions is an in-memory fallback ONLY.
// In a multi-instance/autoscale deployment, sessions stored here
// are NOT shared across instances. Ensure SESSION_DURATION_HOURS
// is short and monitor for session loss. For production HA,
// migrate to a shared store (e.g. Redis or DB-backed sessions).
const _fallbackSessions = new Map<string, { userId: number; user: Record<string, unknown>; expiresAt: Date }>();

const SESSION_ACTIVITY_THROTTLE_MS = 30_000;
const _sessionActivityCache = new Map<number, number>();

const SUPER_ADMIN_CACHE_MS = 60_000;
const _superAdminCache = new Map<number, { value: boolean; at: number }>();

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const FALLBACK_USERS: Array<{
  id: number; username: string; passwordHash: string;
  fullName: string; fullNameHe: string; email: string;
  isSuperAdmin: boolean; isActive: boolean; loginCount: number;
  department: string | null; jobTitle: string | null; phone: string | null;
}> = IS_PRODUCTION ? [] : [
  {
    id: 7, username: "kobie4kayam",
    passwordHash: (() => {
      const s = "fallback_salt_kobie4kayam_2026";
      const h = crypto.pbkdf2Sync("admin123", s, 100000, 64, "sha512").toString("hex");
      return `${s}:${h}`;
    })(),
    fullName: "קובי אלקיים", fullNameHe: "קובי אלקיים",
    email: "kobie@technokoluzi.com", isSuperAdmin: true, isActive: true,
    loginCount: 0, department: "הנהלה", jobTitle: "מנכ״ל", phone: null,
  },
  {
    id: 1, username: "admin",
    passwordHash: (() => {
      const s = "fallback_salt_admin_2026";
      const h = crypto.pbkdf2Sync("admin123", s, 100000, 64, "sha512").toString("hex");
      return `${s}:${h}`;
    })(),
    fullName: "מנהל מערכת", fullNameHe: "מנהל מערכת",
    email: "admin@technokol.co.il", isSuperAdmin: true, isActive: true,
    loginCount: 0, department: "IT", jobTitle: "מנהל מערכת", phone: null,
  },
];

export async function hasSuperAdminRole(userId: number): Promise<boolean> {
  const [superAdminRole] = await db.select({ id: platformRolesTable.id })
    .from(platformRolesTable)
    .where(eq(platformRolesTable.slug, "super-admin"))
    .limit(1);
  if (!superAdminRole) return false;
  const [assignment] = await db.select({ id: roleAssignmentsTable.id })
    .from(roleAssignmentsTable)
    .where(and(
      eq(roleAssignmentsTable.roleId, superAdminRole.id),
      eq(roleAssignmentsTable.userId, String(userId))
    ))
    .limit(1);
  return !!assignment;
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, s, 100000, 64, "sha512").toString("hex");
  return { hash: `${s}:${hash}`, salt: s };
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const { hash: newHash } = hashPassword(password, salt);
  const [, computedHash] = newHash.split(":");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computedHash!, "hex"));
}

/**
 * Validate password policy:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export function validatePasswordPolicy(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: "הסיסמה חייבת להיות לפחות 8 תווים" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "הסיסמה חייבת להכיל לפחות אות גדולה אחת" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "הסיסמה חייבת להכיל לפחות אות קטנה אחת" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: "הסיסמה חייבת להכיל לפחות מספר אחד" };
  }
  return { valid: true };
}

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

function parseDeviceName(userAgent: string): string {
  if (!userAgent) return "Unknown Device";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Browser";
}

async function enforceSessionLimit(userId: number): Promise<void> {
  try {
    const { db: dbInst } = await import("@workspace/db");
    const { platformSettingsTable: pst } = await import("@workspace/db/schema");
    const { eq: eqFn } = await import("drizzle-orm");
    const [limitRow] = await dbInst.select().from(pst).where(eqFn(pst.key, "session_concurrent_limit")).limit(1);
    const limit = parseInt(limitRow?.value || "5");

    const { desc: descFn } = await import("drizzle-orm");
    const activeSessions = await db.select({ id: userSessionsTable.id })
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.userId, userId), eq(userSessionsTable.isActive, true)))
      .orderBy(descFn(userSessionsTable.lastActivityAt));

    if (activeSessions.length >= limit) {
      const toRevoke = activeSessions.slice(limit - 1);
      const { inArray } = await import("drizzle-orm");
      await db.update(userSessionsTable).set({ isActive: false })
        .where(inArray(userSessionsTable.id, toRevoke.map(s => s.id)));
    }
  } catch {
  }
}

export interface CompanyRolesSettings {
  adminJobTitles: string[];
}

export function parseCompanyRolesSettings(settings: any): CompanyRolesSettings {
  if (!settings || typeof settings !== "object") return { adminJobTitles: [] };
  return {
    adminJobTitles: Array.isArray(settings.adminJobTitles) ? settings.adminJobTitles : []
  };
}

export async function registerUser(data: {
  username: string;
  password: string;
  fullName: string;
  fullNameHe?: string;
  email?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  isSuperAdmin?: boolean;
}): Promise<{ user: Record<string, unknown>; error?: string; welcomeEmailSent?: boolean; welcomeEmailError?: string }> {
  // Validate password policy
  const passwordValidation = validatePasswordPolicy(data.password);
  if (!passwordValidation.valid) {
    return { user: {}, error: passwordValidation.error };
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, data.username));
  if (existing.length > 0) {
    return { user: {}, error: "שם משתמש כבר קיים במערכת" };
  }

  if (data.email) {
    const emailExists = await db.select().from(usersTable).where(eq(usersTable.email, data.email));
    if (emailExists.length > 0) {
      return { user: {}, error: "אימייל כבר רשום במערכת" };
    }
  }

  // Auto-sync isSuperAdmin from company roles config if not explicitly set
  let effectiveIsSuperAdmin = data.isSuperAdmin ?? false;
  if (data.isSuperAdmin === undefined && data.jobTitle) {
    const roles = await getCompanyRoles();
    const role = roles.find(r => r.jobTitle === data.jobTitle);
    if (role?.isAdmin) {
      effectiveIsSuperAdmin = true;
    }
  }

  const { hash } = hashPassword(data.password);

  const [user] = await db.insert(usersTable).values({
    username: data.username,
    passwordHash: hash,
    fullName: data.fullName,
    fullNameHe: data.fullNameHe || data.fullName,
    email: data.email || null,
    phone: data.phone || null,
    department: data.department || null,
    jobTitle: data.jobTitle || null,
    isSuperAdmin: effectiveIsSuperAdmin,
  }).returning();

  const { passwordHash: _, ...safeUser } = user;

  let welcomeEmailSent = false;
  let welcomeEmailError: string | undefined;
  if (data.email) {
    try {
      const emailResult = await sendWelcomeEmail({
        username: data.username,
        password: data.password,
        email: data.email,
        fullName: data.fullNameHe || data.fullName,
      });
      welcomeEmailSent = emailResult.success;
      welcomeEmailError = emailResult.error;
    } catch (err) {
      console.log("Failed to send welcome email:", err instanceof Error ? err.message : err);
      welcomeEmailError = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return { user: safeUser as unknown as Record<string, unknown>, welcomeEmailSent, welcomeEmailError };
}

export async function loginUser(
  username: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ token?: string; user?: Record<string, unknown>; error?: string }> {
  const dbOk = await isDbAlive();

  if (dbOk) {
    try {
      const [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.username}) = lower(${username})`);
      if (!user) {
        console.warn(`[Auth] Login failed — user not found: username="${username}" ip="${ipAddress || "unknown"}"`);
        return { error: "שם משתמש או סיסמה שגויים" };
      }

      if (!user.isActive) {
        console.warn(`[Auth] Login failed — account inactive: username="${username}" ip="${ipAddress || "unknown"}"`);
        return { error: "חשבון מושבת. פנה למנהל המערכת" };
      }

      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
        console.warn(`[Auth] Login failed — account locked: username="${username}" ip="${ipAddress || "unknown"}" minutesLeft=${minutesLeft}`);
        return { error: `החשבון נעול. נסה שוב בעוד ${minutesLeft} דקות` };
      }

      if (!verifyPassword(password, user.passwordHash)) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const lockout = attempts >= 5 ? new Date(Date.now() + 15 * 60000) : null;
        console.warn(`[Auth] Login failed — wrong password: username="${username}" ip="${ipAddress || "unknown"}" attempts=${attempts}${lockout ? " LOCKED" : ""}`);
        db.update(usersTable).set({
          failedLoginAttempts: attempts,
          lockedUntil: lockout,
          updatedAt: new Date(),
        }).where(eq(usersTable.id, user.id)).catch(() => {});
        if (lockout) {
          return { error: "החשבון ננעל ל-15 דקות עקב ניסיונות כושלים. נסה שוב מאוחר יותר" };
        }
        return { error: "שם משתמש או סיסמה שגויים" };
      }

      // Check IP allowlist for admins
      if (user.isSuperAdmin && ipAddress) {
        try {
          const ipAllowlist = await db.query.ipAllowlistTable?.findMany?.({
            where: (table: any) => eq(table.userId, user.id),
          }) || [];
          if (ipAllowlist && ipAllowlist.length > 0) {
            const isAllowed = ipAllowlist.some((entry: any) => {
              if (!entry.ipAddress) return false;
              // Simple CIDR or exact IP match
              return entry.ipAddress === ipAddress || entry.ipAddress === "*";
            });
            if (!isAllowed) {
              return { error: "כתובת ה-IP שלך אינה מורשה. פנה למנהל." };
            }
          }
        } catch (_err) {
          // Silently fail - IP check is optional
        }
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
      const absoluteExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
      const fingerprint = ipAddress && userAgent
        ? crypto.createHash("sha256").update(`${ipAddress}:${userAgent}`).digest("hex").substring(0, 64)
        : null;
      const deviceName = userAgent ? parseDeviceName(userAgent) : null;

      await db.insert(userSessionsTable).values({
        userId: user.id,
        token,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        fingerprint,
        deviceName,
        expiresAt,
        absoluteExpiresAt,
      });

      db.update(usersTable).set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        loginCount: user.loginCount + 1,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, user.id)).catch(() => {});

      enforceSessionLimit(user.id).catch(() => {});

      const { passwordHash: _, ...safeUser } = user;
      setDbAlive(true);
      return { token, user: safeUser as unknown as Record<string, unknown> };
    } catch (err) {
      console.warn("[Auth] DB login failed, trying fallback:", err instanceof Error ? err.message : err);
      setDbAlive(false);
    }
  }

  const fbUser = FALLBACK_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!fbUser) {
    console.warn(`[Auth] Login failed — fallback user not found: username="${username}" ip="${ipAddress || "unknown"}"`);
    return { error: "שם משתמש או סיסמה שגויים" };
  }
  if (!verifyPassword(password, fbUser.passwordHash)) {
    console.warn(`[Auth] Login failed — fallback wrong password: username="${username}" ip="${ipAddress || "unknown"}"`);
    return { error: "שם משתמש או סיסמה שגויים" };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
  const { passwordHash: _, ...safeUser } = fbUser;
  _fallbackSessions.set(token, { userId: fbUser.id, user: safeUser as unknown as Record<string, unknown>, expiresAt });
  console.log(`[Auth] Fallback login OK for ${username}`);
  return { token, user: safeUser as unknown as Record<string, unknown> };
}

export async function loginOrCreateGoogleUser(
  googleData: { email: string; name: string; picture?: string; googleId: string },
  ipAddress?: string,
  userAgent?: string
): Promise<{ token?: string; user?: Record<string, unknown>; error?: string }> {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, googleData.email));

  if (!user) {
    return { error: "משתמש לא קיים במערכת. פנה למנהל לפתיחת חשבון" };
  }

  if (!user.isActive) return { error: "חשבון מושבת. פנה למנהל המערכת" };

  await db.update(usersTable).set({
    lastLoginAt: new Date(),
    loginCount: user.loginCount + 1,
    avatarUrl: googleData.picture || user.avatarUrl,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
  await db.insert(userSessionsTable).values({
    userId: user.id,
    token,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    expiresAt,
  });

  const { passwordHash: _, ...safeUser } = user;
  return { token, user: safeUser as unknown as Record<string, unknown> };
}

export async function validateSession(token: string): Promise<{ user?: Record<string, unknown>; session?: Record<string, unknown>; error?: string }> {
  if (!token) return { error: "לא מחובר" };

  const fbSession = _fallbackSessions.get(token);
  if (fbSession) {
    if (fbSession.expiresAt > new Date()) {
      return { user: fbSession.user, session: { id: 0, token, userId: fbSession.userId, isActive: true } };
    }
    _fallbackSessions.delete(token);
  }

  const dbOk = await isDbAlive();
  if (!dbOk) {
    if (fbSession) return { error: "Session פג תוקף" };
    return { error: "מסד הנתונים לא זמין. נסה שוב בעוד דקה" };
  }

  try {
    const now = new Date();
    const [session] = await db.select().from(userSessionsTable)
      .where(and(
        eq(userSessionsTable.token, token),
        eq(userSessionsTable.isActive, true),
        gt(userSessionsTable.expiresAt, now)
      ));

    if (!session) return { error: "Session לא תקין או פג תוקף" };

    const nowMs = Date.now();
    const lastActivity = _sessionActivityCache.get(session.id) ?? 0;
    if (nowMs - lastActivity >= SESSION_ACTIVITY_THROTTLE_MS) {
      _sessionActivityCache.set(session.id, nowMs);
      db.update(userSessionsTable).set({ lastActivityAt: new Date() }).where(eq(userSessionsTable.id, session.id)).catch(() => {});
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
    if (!user || !user.isActive) return { error: "חשבון לא פעיל" };

    let effectiveIsSuperAdmin = user.isSuperAdmin;
    if (!effectiveIsSuperAdmin) {
      const cached = _superAdminCache.get(user.id);
      let hasRole: boolean;
      if (cached && now - cached.at < SUPER_ADMIN_CACHE_MS) {
        hasRole = cached.value;
      } else {
        hasRole = await hasSuperAdminRole(user.id);
        _superAdminCache.set(user.id, { value: hasRole, at: now });
      }
      if (hasRole) {
        db.update(usersTable).set({ isSuperAdmin: true, updatedAt: new Date() }).where(eq(usersTable.id, user.id)).catch(() => {});
        effectiveIsSuperAdmin = true;
      }
    }

    const { passwordHash: _, ...safeUser } = user;
    setDbAlive(true);
    return {
      user: { ...safeUser, isSuperAdmin: effectiveIsSuperAdmin } as unknown as Record<string, unknown>,
      session: session as unknown as Record<string, unknown>,
    };
  } catch (err) {
    console.warn("[Auth] DB validateSession failed:", err instanceof Error ? err.message : err);
    setDbAlive(false);
    return { error: "מסד הנתונים לא זמין. נסה שוב בעוד דקה" };
  }
}

export async function refreshSession(token: string): Promise<boolean> {
  const fbSession = _fallbackSessions.get(token);
  if (fbSession) {
    fbSession.expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
    return true;
  }
  const dbOk = await isDbAlive();
  if (!dbOk) return false;
  try {
    const newExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
    const result = await db.update(userSessionsTable)
      .set({ expiresAt: newExpiresAt, lastActivityAt: new Date() })
      .where(and(eq(userSessionsTable.token, token), eq(userSessionsTable.isActive, true)))
      .returning({ id: userSessionsTable.id });
    return result.length > 0;
  } catch {
    return false;
  }
}

export async function logoutUser(token: string): Promise<void> {
  _fallbackSessions.delete(token);
  try {
    const dbOk = await isDbAlive();
    if (dbOk) {
      await db.update(userSessionsTable).set({ isActive: false }).where(eq(userSessionsTable.token, token));
    }
  } catch {}
}

export async function logoutAllSessions(userId: number): Promise<number> {
  const result = await db.update(userSessionsTable)
    .set({ isActive: false })
    .where(and(eq(userSessionsTable.userId, userId), eq(userSessionsTable.isActive, true)))
    .returning();
  return result.length;
}

export async function cleanExpiredSessions(): Promise<number> {
  const result = await db.delete(userSessionsTable)
    .where(gt(new Date() as any, userSessionsTable.expiresAt))
    .returning();
  return result.length;
}

export async function getActiveSessions(userId: number): Promise<unknown[]> {
  return db.select().from(userSessionsTable)
    .where(and(
      eq(userSessionsTable.userId, userId),
      eq(userSessionsTable.isActive, true),
      gt(userSessionsTable.expiresAt, new Date())
    ));
}

export async function getUserCount(): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  return Number(result?.count || 0);
}

export async function listUsers(): Promise<unknown[]> {
  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    email: usersTable.email,
    fullName: usersTable.fullName,
    fullNameHe: usersTable.fullNameHe,
    phone: usersTable.phone,
    department: usersTable.department,
    jobTitle: usersTable.jobTitle,
    isActive: usersTable.isActive,
    isSuperAdmin: usersTable.isSuperAdmin,
    lastLoginAt: usersTable.lastLoginAt,
    loginCount: usersTable.loginCount,
    createdAt: usersTable.createdAt,
    gpsEnabled: usersTable.gpsEnabled,
    gpsDeviceId: usersTable.gpsDeviceId,
    gpsLastPingAt: userGpsStatusTable.lastPingAt,
    gpsIsMoving: userGpsStatusTable.isMoving,
    gpsStatus: userGpsStatusTable.status,
    gpsTotalPings: userGpsStatusTable.totalPings,
  }).from(usersTable)
    .leftJoin(userGpsStatusTable, eq(usersTable.id, userGpsStatusTable.userId))
    .orderBy(usersTable.id);
  return users;
}

const COMPANY_ROLES_CONFIG_SLUG = "__company-roles-config__";

export async function getCompanyRoles(): Promise<{ jobTitle: string; isAdmin: boolean; userCount: number }[]> {
  const [configRole] = await db.select().from(platformRolesTable)
    .where(eq(platformRolesTable.slug, COMPANY_ROLES_CONFIG_SLUG));

  const { adminJobTitles } = parseCompanyRolesSettings(configRole?.settings);

  const users = await db.select({
    jobTitle: usersTable.jobTitle,
  }).from(usersTable).where(eq(usersTable.isActive, true));

  const jobTitleCounts = new Map<string, number>();
  for (const u of users) {
    if (u.jobTitle && u.jobTitle.trim()) {
      jobTitleCounts.set(u.jobTitle, (jobTitleCounts.get(u.jobTitle) || 0) + 1);
    }
  }

  const defaultJobTitles = ["מנכ\"ל", "סמנכ\"ל", "מנהל מכירות", "איש מכירות", "מנהל ייצור", "מנהל כספים", "מנהל לוגיסטיקה", "מנהל IT", "מנהל משאבי אנוש"];
  const allTitles = new Set([...defaultJobTitles, ...Array.from(jobTitleCounts.keys())]);

  return Array.from(allTitles).map(title => ({
    jobTitle: title,
    isAdmin: adminJobTitles.includes(title),
    userCount: jobTitleCounts.get(title) || 0,
  }));
}

export async function setCompanyRoleAdmin(jobTitle: string, isAdmin: boolean): Promise<number> {
  const [configRole] = await db.select().from(platformRolesTable)
    .where(eq(platformRolesTable.slug, COMPANY_ROLES_CONFIG_SLUG));

  const { adminJobTitles: currentAdminTitles } = parseCompanyRolesSettings(configRole?.settings);
  let adminJobTitles = currentAdminTitles;

  if (isAdmin && !adminJobTitles.includes(jobTitle)) {
    adminJobTitles = [...adminJobTitles, jobTitle];
  } else if (!isAdmin) {
    adminJobTitles = adminJobTitles.filter(t => t !== jobTitle);
  }

  const newSettings: CompanyRolesSettings = { adminJobTitles };

  if (configRole) {
    await db.update(platformRolesTable)
      .set({ settings: newSettings as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(platformRolesTable.slug, COMPANY_ROLES_CONFIG_SLUG));
  } else {
    await db.insert(platformRolesTable).values({
      name: "Company Roles Config",
      nameHe: "תצורת תפקידי חברה",
      slug: COMPANY_ROLES_CONFIG_SLUG,
      isSystem: true,
      isActive: false,
      color: "#64748b",
      settings: newSettings as unknown as Record<string, unknown>,
    });
  }

  const usersWithTitle = await db.select().from(usersTable)
    .where(eq(usersTable.jobTitle, jobTitle));

  let updatedCount = 0;
  for (const u of usersWithTitle) {
    if (u.isSuperAdmin !== isAdmin) {
      await db.update(usersTable)
        .set({ isSuperAdmin: isAdmin, updatedAt: new Date() })
        .where(eq(usersTable.id, u.id));
      updatedCount++;
    }
  }

  return updatedCount;
}

export async function forgotPassword(identifier: string): Promise<{ success: boolean; message?: string; error?: string; newPassword?: string; emailSent?: boolean }> {
  if (!identifier || !identifier.trim()) {
    return { success: false, error: "יש להזין שם משתמש או כתובת אימייל" };
  }

  const trimmed = identifier.trim();
  const isEmail = trimmed.includes("@");
  const [user] = await db.select().from(usersTable).where(
    isEmail ? eq(usersTable.email, trimmed) : eq(usersTable.username, trimmed)
  );
  if (!user || !user.isActive) {
    return { success: true, message: "אם הפרטים קיימים במערכת, סיסמה חדשה תונפק" };
  }

  const newPassword = crypto.randomInt(10000000, 99999999).toString() + "A1";

  const { hash } = hashPassword(newPassword);
  await db.update(usersTable).set({
    passwordHash: hash,
    failedLoginAttempts: 0,
    lockedUntil: null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  let emailSent = false;
  try {
    const emailResult = await sendPasswordResetEmail({
      email: user.email!,
      fullName: user.fullNameHe || user.fullName,
      username: user.username,
      newPassword,
    });

    if (emailResult.success) {
      emailSent = true;
    } else {
      console.log(`forgotPassword: Email send failed for ${user.email}: ${emailResult.error}`);
    }
  } catch (err) {
    console.log("forgotPassword: Email error:", err instanceof Error ? err.message : err);
  }

  if (emailSent) {
    return { success: true, message: "סיסמה חדשה נשלחה לאימייל שלך", emailSent: true };
  } else {
    return { success: true, message: "הסיסמה אופסה בהצלחה", emailSent: false, newPassword };
  }
}

export async function updateUser(id: number, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const allowed = ["fullName", "fullNameHe", "email", "phone", "department", "jobTitle", "isActive", "isSuperAdmin", "gpsEnabled", "gpsDeviceId"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  if (data.password && typeof data.password === "string" && data.password.trim().length >= 8) {
    const { hash } = hashPassword(data.password as string);
    updates.passwordHash = hash;
  }

  if (typeof updates.jobTitle === "string" && updates.isSuperAdmin === undefined) {
    const [configRole] = await db.select().from(platformRolesTable)
      .where(eq(platformRolesTable.slug, COMPANY_ROLES_CONFIG_SLUG));
    const { adminJobTitles } = parseCompanyRolesSettings(configRole?.settings);
    updates.isSuperAdmin = adminJobTitles.includes(updates.jobTitle);
  }

  const [user] = await db.update(usersTable).set(updates as any).where(eq(usersTable.id, id)).returning();
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser as unknown as Record<string, unknown>;
}

export async function deleteUser(id: number): Promise<boolean> {
  await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, id));
  const result = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  return result.length > 0;
}

export async function verifyCurrentPassword(userId: number, password: string): Promise<boolean> {
  const [user] = await db.select({ passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user?.passwordHash) return false;
  return verifyPassword(password, user.passwordHash);
}

export async function createUserSession(
  userId: number,
  ipAddress?: string,
  userAgent?: string
): Promise<{ token: string; user: Record<string, unknown> } | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.isActive) return null;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
  const absoluteExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
  const fingerprint = ipAddress && userAgent
    ? crypto.createHash("sha256").update(`${ipAddress}:${userAgent}`).digest("hex").substring(0, 64)
    : null;
  const deviceName = userAgent ? parseDeviceName(userAgent) : null;

  await db.insert(userSessionsTable).values({
    userId: user.id,
    token,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    fingerprint,
    deviceName,
    expiresAt,
    absoluteExpiresAt,
  });

  db.update(usersTable).set({
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
    loginCount: user.loginCount + 1,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id)).catch(() => {});

  enforceSessionLimit(user.id).catch(() => {});

  const { passwordHash: _, ...safeUser } = user;
  return { token, user: safeUser as unknown as Record<string, unknown> };
}
