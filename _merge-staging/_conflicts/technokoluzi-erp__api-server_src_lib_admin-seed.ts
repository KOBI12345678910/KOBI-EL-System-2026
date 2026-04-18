import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export async function ensureAdminUser(): Promise<void> {
  const isDev = process.env.NODE_ENV !== "production";
  const bootstrapMode = process.env.ADMIN_BOOTSTRAP === "true";

  if (!isDev && !bootstrapMode) {
    return;
  }

  try {
    const [existing] = await db
      .select({ id: usersTable.id, isSuperAdmin: usersTable.isSuperAdmin })
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);

    if (existing) {
      const updates: Partial<{ isSuperAdmin: boolean; passwordHash: string }> = {};
      if (!existing.isSuperAdmin) {
        updates.isSuperAdmin = true;
      }
      if (bootstrapMode) {
        updates.passwordHash = hashPassword("admin123");
        console.log("[admin-seed] Bootstrap mode: resetting admin password to admin123");
      }
      if (Object.keys(updates).length > 0) {
        await db.update(usersTable).set(updates).where(eq(usersTable.id, existing.id));
        console.log("[admin-seed] Updated admin user:", JSON.stringify(Object.keys(updates)));
      } else {
        console.log("[admin-seed] Admin user already exists with isSuperAdmin=true (password unchanged)");
      }
      return;
    }

    const passwordHash = hashPassword("admin123");
    await db.insert(usersTable).values({
      username: "admin",
      email: "admin@system.local",
      fullName: "מנהל מערכת",
      passwordHash,
      isSuperAdmin: true,
    });
    console.log("[admin-seed] Created admin user in dev/bootstrap mode (isSuperAdmin=true)");
  } catch (err) {
    console.error("[admin-seed] Failed to ensure admin user:", err instanceof Error ? err.message : err);
  }
}
