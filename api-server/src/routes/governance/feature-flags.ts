import { Router } from "express";
import {
  CreateFeatureFlagSchema, UpdateFeatureFlagSchema, ListFeatureFlagsQuerySchema,
  CreateFlagTargetSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "flag_key", "is_enabled", "created_at", "updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListFeatureFlagsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_active, true) = true`];
    if (q.is_enabled !== undefined) c.push(sql`is_enabled = ${q.is_enabled}`);
    if (q.q) c.push(sql`(flag_key ILIKE ${"%" + q.q + "%"} OR flag_name ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "governance.feature_flags", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "feature-flags:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateFeatureFlagSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.feature_flags (flag_key, flag_name, description, is_enabled, rollout_percent,
        rule_json, is_active, created_by, metadata, created_at, updated_at)
      values (${d.flag_key}, ${d.flag_name}, ${d.description ?? null}, ${d.is_enabled ?? false},
              ${d.rollout_percent ?? 0}, ${JSON.stringify(d.rule_json ?? {})}::jsonb,
              ${d.is_active ?? true}, ${uid},
              ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_feature_flags", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "feature-flags:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateFeatureFlagSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "rule_json")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update governance.feature_flags set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "Feature flag לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_feature_flags", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "feature-flags:update"); }
});

router.post("/targets", async (req, res) => {
  const d = parseBody(CreateFlagTargetSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.feature_flag_targets (flag_id, target_type, target_ref, is_enabled)
      values (${d.flag_id}, ${d.target_type}, ${d.target_ref}, ${d.is_enabled ?? true})
      on conflict (flag_id, target_type, target_ref) do update set is_enabled = excluded.is_enabled
      returning *
    `);
    await logAudit({ user_id: uid, table_name: "governance_feature_flag_targets", record_id: d.flag_id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "feature-flags:targets:create"); }
});

export default router;
