import { Router } from "express";
import {
  CreateConfigEntrySchema, UpdateConfigEntrySchema, ListConfigEntriesQuerySchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "config_key", "updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListConfigEntriesQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.is_secret !== undefined) c.push(sql`is_secret = ${q.is_secret}`);
    if (q.q) c.push(sql`(config_key ILIKE ${"%" + q.q + "%"} OR description ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.config_entries", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "config-entries:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateConfigEntrySchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.config_entries (config_key, config_value, description, is_secret, is_active, metadata, updated_at, updated_by)
      values (${d.config_key}, ${JSON.stringify(d.config_value ?? null)}::jsonb, ${d.description ?? null},
              ${d.is_secret ?? false}, ${d.is_active ?? true},
              ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), ${uid})
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_config_entries", record_id: row.id, action: "INSERT", new_values: { config_key: d.config_key, is_secret: d.is_secret } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "config-entries:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateConfigEntrySchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "config_value")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? null)}::jsonb`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update governance.config_entries set ${sql.join(fragments, sql`, `)}, updated_at = now(), updated_by = ${uid}
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הגדרה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "governance_config_entries", record_id: id, action: "UPDATE", new_values: { keys: Object.keys(d) } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "config-entries:update"); }
});

export default router;
