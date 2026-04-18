import { Router } from "express";
import {
  UpsertUserPreferenceSchema, ListUserPreferencesQuerySchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "user_id", "namespace", "key", "updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListUserPreferencesQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.user_id) c.push(sql`user_id = ${q.user_id}`);
    if (q.namespace) c.push(sql`namespace = ${q.namespace}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.user_preferences", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "user-preferences:list"); }
});

router.put("/", async (req, res) => {
  const d = parseBody(UpsertUserPreferenceSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.user_preferences (user_id, namespace, key, value, updated_at)
      values (${d.user_id}, ${d.namespace}, ${d.key}, ${JSON.stringify(d.value ?? null)}::jsonb, now())
      on conflict (user_id, namespace, key)
      do update set value = excluded.value, updated_at = now()
      returning *
    `);
    await logAudit({ user_id: uid, table_name: "governance_user_preferences", record_id: d.user_id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "user-preferences:upsert"); }
});

export default router;
