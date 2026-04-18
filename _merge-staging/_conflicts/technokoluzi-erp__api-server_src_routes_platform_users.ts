import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { ilike, or, eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/platform/users", async (req, res) => {
  try {
    const search = String(req.query.search || "");
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    let results;
    if (search.length >= 1) {
      const pattern = `%${search}%`;
      results = await db.select({
        id: usersTable.id,
        name: usersTable.fullName,
        email: usersTable.email,
        department: usersTable.department,
        avatarUrl: usersTable.avatarUrl,
      }).from(usersTable)
        .where(and(
          eq(usersTable.isActive, true),
          or(
            ilike(usersTable.fullName, pattern),
            ilike(usersTable.username, pattern),
            usersTable.email ? ilike(usersTable.email, pattern) : undefined,
          )
        ))
        .limit(limit);
    } else {
      results = await db.select({
        id: usersTable.id,
        name: usersTable.fullName,
        email: usersTable.email,
        department: usersTable.department,
        avatarUrl: usersTable.avatarUrl,
      }).from(usersTable)
        .where(eq(usersTable.isActive, true))
        .limit(limit);
    }

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
