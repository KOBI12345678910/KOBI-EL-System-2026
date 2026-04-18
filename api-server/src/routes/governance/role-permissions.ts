// Thin alias router: role_permissions management is implemented in permissions.ts (grant/revoke).
// This file exists to satisfy the wiring contract for `/role-permissions`.
import { Router } from "express";
import { sql, authMiddleware, adminMiddleware, db, sendDbError } from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get("/", async (_req, res) => {
  try {
    const r = await db.execute(sql`
      select rp.role_id, rp.permission_id, rp.granted_at, rp.granted_by,
             r.role_code, r.role_name, p.permission_code, p.permission_name, p.module_name
      from governance.role_permissions rp
      join governance.roles r on r.id = rp.role_id
      join governance.permissions p on p.id = rp.permission_id
      order by r.role_code, p.permission_code
      limit 1000
    `);
    res.json({ data: r.rows ?? [], pagination: { total: (r.rows ?? []).length, page: 1, pageSize: (r.rows ?? []).length, totalPages: 1, hasNext: false, hasPrev: false } });
  } catch (err) { sendDbError(res, err, "role-permissions:list"); }
});

export default router;
