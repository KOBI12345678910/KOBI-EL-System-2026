// Thin read alias: user_roles assignment is done via users.ts (/:id/assign-role and /:id/revoke-role)
import { Router } from "express";
import { sql, authMiddleware, adminMiddleware, db, sendDbError } from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get("/", async (req, res) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : null;
    const r = userId
      ? await db.execute(sql`
          select ur.*, r.role_code, r.role_name
          from governance.user_roles ur
          join governance.roles r on r.id = ur.role_id
          where ur.user_id = ${userId}
          order by ur.valid_from desc
          limit 500
        `)
      : await db.execute(sql`
          select ur.*, r.role_code, r.role_name
          from governance.user_roles ur
          join governance.roles r on r.id = ur.role_id
          order by ur.valid_from desc
          limit 500
        `);
    res.json({ data: r.rows ?? [], pagination: { total: (r.rows ?? []).length, page: 1, pageSize: (r.rows ?? []).length, totalPages: 1, hasNext: false, hasPrev: false } });
  } catch (err) { sendDbError(res, err, "user-roles:list"); }
});

export default router;
