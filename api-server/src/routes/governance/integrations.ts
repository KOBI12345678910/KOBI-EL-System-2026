// ============================================================
// governance.integration_connections — admin CRUD + POST /:id/sync-now
// ============================================================
import { Router } from "express";
import {
  CreateIntegrationConnectionSchema, UpdateIntegrationConnectionSchema,
  ListIntegrationConnectionsQuerySchema, TriggerSyncSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "connection_name", "provider", "created_at", "last_sync_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListIntegrationConnectionsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.provider) c.push(sql`provider = ${q.provider}`);
    if (q.connection_type) c.push(sql`connection_type = ${q.connection_type}`);
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.q) c.push(sql`(connection_name ILIKE ${"%" + q.q + "%"} OR provider ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.integration_connections", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "integrations:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateIntegrationConnectionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.integration_connections (
        connection_name, provider, connection_type, config, credentials_ref, is_active,
        created_by, metadata, created_at, updated_at)
      values (${d.connection_name}, ${d.provider}, ${d.connection_type},
              ${JSON.stringify(d.config ?? {})}::jsonb, ${d.credentials_ref ?? null},
              ${d.is_active ?? true}, ${uid},
              ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_integration_connections", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "integrations:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateIntegrationConnectionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "config")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update governance.integration_connections set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "חיבור לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_integration_connections", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "integrations:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`delete from governance.integration_connections where id = ${id} returning id`);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "חיבור לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_integration_connections", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "integrations:delete"); }
});

// POST /:id/sync-now — create an integration_sync_logs row in running
router.post("/:id/sync-now", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(TriggerSyncSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const conn = await db.execute(sql`select id, is_active from governance.integration_connections where id = ${id}`);
    const c = (conn.rows ?? [])[0] as { id?: number; is_active?: boolean } | undefined;
    if (!c?.id) return res.status(404).json({ error: "חיבור לא נמצא" });
    if (!c.is_active) return res.status(409).json({ error: "החיבור מושבת" });

    const r = await db.execute(sql`
      insert into governance.integration_sync_logs
        (connection_id, direction, entity_type, status, started_at, log_payload)
      values
        (${id}, ${d.direction}, ${d.entity_type ?? null}, 'running', now(),
         ${JSON.stringify({ dry_run: d.dry_run, triggered_by: uid })}::jsonb)
      returning *
    `);
    await db.execute(sql`
      update governance.integration_connections
      set last_sync_at = now(), last_sync_status = 'running', updated_at = now() where id = ${id}
    `);
    await logAudit({ user_id: uid, table_name: "governance_integration_sync_logs", record_id: id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null, notes: "sync-now" });
    res.status(202).json({ started: true, log: (r.rows ?? [])[0] });
  } catch (err) { sendDbError(res, err, "integrations:sync-now"); }
});

export default router;
