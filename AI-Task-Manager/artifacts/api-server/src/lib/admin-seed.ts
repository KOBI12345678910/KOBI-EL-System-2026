import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

function makePasswordHash(password: string, salt: string): string {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

const DEFAULT_USERS = [
  {
    username: "admin",
    password: "admin123",
    salt: "fallback_salt_admin_2026",
    email: "admin@technokol.co.il",
    fullName: "מנהל מערכת",
    fullNameHe: "מנהל מערכת",
    isSuperAdmin: true,
    isActive: true,
    department: "IT",
    jobTitle: "מנהל מערכת",
  },
  {
    username: "kobiellkayam",
    password: "KOBIE@307994798",
    salt: "fallback_salt_kobiellkayam_2026",
    email: "kobiellkayam@gmail.com",
    fullName: "קובי אלקיים",
    fullNameHe: "קובי אלקיים",
    isSuperAdmin: true,
    isActive: true,
    department: "הנהלה",
    jobTitle: "מנכ״ל",
  },
] as const;

export async function ensureAdminUser(): Promise<void> {
  try {
    for (const userDef of DEFAULT_USERS) {
      const passwordHash = makePasswordHash(userDef.password, userDef.salt);

      const [existing] = await db
        .select({
          id: usersTable.id,
          passwordHash: usersTable.passwordHash,
          isSuperAdmin: usersTable.isSuperAdmin,
          isActive: usersTable.isActive,
        })
        .from(usersTable)
        .where(sql`lower(${usersTable.username}) = lower(${userDef.username})`)
        .limit(1);

      if (existing) {
        const updates: Partial<{
          passwordHash: string;
          isSuperAdmin: boolean;
          isActive: boolean;
          updatedAt: Date;
        }> = {};

        if (existing.passwordHash !== passwordHash) {
          updates.passwordHash = passwordHash;
        }
        if (existing.isSuperAdmin !== userDef.isSuperAdmin) {
          updates.isSuperAdmin = userDef.isSuperAdmin;
        }
        if (existing.isActive !== userDef.isActive) {
          updates.isActive = userDef.isActive;
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          await db
            .update(usersTable)
            .set(updates)
            .where(eq(usersTable.id, existing.id));
          console.log(`[admin-seed] Updated user ${userDef.username}:`, Object.keys(updates).join(", "));
        } else {
          console.log(`[admin-seed] User already correct: ${userDef.username}`);
        }
      } else {
        await db.insert(usersTable).values({
          username: userDef.username,
          email: userDef.email,
          fullName: userDef.fullName,
          fullNameHe: userDef.fullNameHe,
          passwordHash,
          isSuperAdmin: userDef.isSuperAdmin,
          isActive: userDef.isActive,
          department: userDef.department,
          jobTitle: userDef.jobTitle,
          loginCount: 0,
        });
        console.log(`[admin-seed] Created default user: ${userDef.username}`);
      }
    }
  } catch (err) {
    console.error("[admin-seed] Failed to ensure default users:", err instanceof Error ? err.message : err);
  }
}
