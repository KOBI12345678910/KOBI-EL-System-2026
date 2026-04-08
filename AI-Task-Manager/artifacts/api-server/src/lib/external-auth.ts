import { db } from "@workspace/db";
import {
  externalUsersTable,
  externalUserSessionsTable,
  portalInvitationsTable,
} from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

const SESSION_DURATION_HOURS = 24;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const INVITE_EXPIRY_HOURS = 72;

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

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export async function createPortalInvitation(data: {
  email: string;
  userType: "supplier" | "contractor" | "employee";
  linkedEntityId?: number;
  linkedEntityType?: string;
  invitedBy: number;
}): Promise<{ invitation: any; inviteToken: string; error?: string }> {
  const existing = await db.select().from(externalUsersTable)
    .where(eq(externalUsersTable.email, data.email));
  if (existing.length > 0) {
    return { invitation: null, inviteToken: "", error: "משתמש עם אימייל זה כבר קיים בפורטל" };
  }

  const inviteToken = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 3600000);

  const [invitation] = await db.insert(portalInvitationsTable).values({
    email: data.email,
    userType: data.userType,
    linkedEntityId: data.linkedEntityId || null,
    linkedEntityType: data.linkedEntityType || null,
    inviteToken,
    invitedBy: data.invitedBy,
    expiresAt,
  }).returning();

  return { invitation, inviteToken };
}

export async function registerExternalUser(data: {
  inviteToken: string;
  password: string;
  fullName: string;
  phone?: string;
}): Promise<{ user?: any; error?: string }> {
  const [invitation] = await db.select().from(portalInvitationsTable)
    .where(and(
      eq(portalInvitationsTable.inviteToken, data.inviteToken),
      eq(portalInvitationsTable.isUsed, false),
      gt(portalInvitationsTable.expiresAt, new Date())
    ));

  if (!invitation) {
    return { error: "הזמנה לא תקינה או פגת תוקף" };
  }

  if (!data.password || data.password.trim().length < 8) {
    return { error: "סיסמה חייבת להכיל לפחות 8 תווים" };
  }

  const { hash } = hashPassword(data.password);
  const [user] = await db.insert(externalUsersTable).values({
    email: invitation.email,
    passwordHash: hash,
    fullName: data.fullName,
    phone: data.phone || null,
    userType: invitation.userType,
    linkedEntityId: invitation.linkedEntityId,
    linkedEntityType: invitation.linkedEntityType,
    invitedBy: invitation.invitedBy,
    invitedAt: invitation.createdAt,
  }).returning();

  await db.update(portalInvitationsTable).set({
    isUsed: true,
    usedAt: new Date(),
  }).where(eq(portalInvitationsTable.id, invitation.id));

  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser };
}

export async function loginExternalUser(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ token?: string; user?: any; error?: string }> {
  const [user] = await db.select().from(externalUsersTable)
    .where(eq(externalUsersTable.email, email));

  if (!user) {
    return { error: "אימייל או סיסמה שגויים" };
  }

  if (!user.isActive) {
    return { error: "חשבון מושבת. פנה למנהל" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `חשבון נעול. נסה שוב בעוד ${minutesLeft} דקות` };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    const attempts = user.failedLoginAttempts + 1;
    const updates: Record<string, unknown> = { failedLoginAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000);
    }
    await db.update(externalUsersTable).set(updates as any)
      .where(eq(externalUsersTable.id, user.id));
    return { error: "אימייל או סיסמה שגויים" };
  }

  await db.update(externalUsersTable).set({
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
    loginCount: user.loginCount + 1,
    updatedAt: new Date(),
  }).where(eq(externalUsersTable.id, user.id));

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);

  await db.insert(externalUserSessionsTable).values({
    externalUserId: user.id,
    token,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    expiresAt,
  });

  const { passwordHash: _, ...safeUser } = user;
  return { token, user: safeUser };
}

export async function validateExternalSession(token: string): Promise<{ user?: any; error?: string }> {
  if (!token) return { error: "לא מחובר" };

  const [session] = await db.select().from(externalUserSessionsTable)
    .where(and(
      eq(externalUserSessionsTable.token, token),
      eq(externalUserSessionsTable.isActive, true),
      gt(externalUserSessionsTable.expiresAt, new Date())
    ));

  if (!session) return { error: "Session לא תקין או פג תוקף" };

  await db.update(externalUserSessionsTable)
    .set({ lastActivityAt: new Date() })
    .where(eq(externalUserSessionsTable.id, session.id));

  const [user] = await db.select().from(externalUsersTable)
    .where(eq(externalUsersTable.id, session.externalUserId));

  if (!user || !user.isActive) return { error: "חשבון לא פעיל" };

  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser };
}

export async function logoutExternalUser(token: string): Promise<void> {
  await db.update(externalUserSessionsTable)
    .set({ isActive: false })
    .where(eq(externalUserSessionsTable.token, token));
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string } {
  const key = `ek_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = key.substring(0, 10);
  return { key, prefix };
}
