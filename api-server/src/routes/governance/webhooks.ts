// ============================================================
// governance.webhook_endpoints — admin CRUD + POST /:id/test-delivery
// ============================================================
import { Router } from "express";
import {
  CreateWebhookEndpointSchema, UpdateWebhookEndpointSchema,
  ListWebhookEndpointsQuerySchema, TestWebhookDeliverySchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "endpoint_name", "created_at", "updated_at", "last_triggered_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListWebhookEndpointsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.event_type) c.push(sql`${q.event_type} = ANY(event_types)`);
    if (q.q) c.push(sql`(endpoint_name ILIKE ${"%" + q.q + "%"} OR target_url ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.webhook_endpoints", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "webhooks:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from governance.webhook_endpoints where id = ${id}`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "Webhook לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "webhooks:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateWebhookEndpointSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.webhook_endpoints (endpoint_name, target_url, secret, event_types, is_active,
        retry_policy, headers, created_by, metadata, created_at, updated_at)
      values (${d.endpoint_name}, ${d.target_url}, ${d.secret ?? null}, ${d.event_types ?? []}::text[],
              ${d.is_active ?? true}, ${JSON.stringify(d.retry_policy ?? {})}::jsonb,
              ${JSON.stringify(d.headers ?? {})}::jsonb, ${uid},
              ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_webhook_endpoints", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "webhooks:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateWebhookEndpointSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "retry_policy" || k === "headers")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      if (k === "event_types")
        return sql`${sql.raw(k)} = ${(v ?? []) as string[]}::text[]`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update governance.webhook_endpoints set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "Webhook לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_webhook_endpoints", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "webhooks:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`delete from governance.webhook_endpoints where id = ${id} returning id`);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "Webhook לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_webhook_endpoints", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "webhooks:delete"); }
});

// POST /:id/test-delivery — enqueue a test delivery
router.post("/:id/test-delivery", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(TestWebhookDeliverySchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const ep = await db.execute(sql`select id, endpoint_name, target_url, is_active from governance.webhook_endpoints where id = ${id}`);
    const e = (ep.rows ?? [])[0] as { id?: number; endpoint_name?: string; is_active?: boolean } | undefined;
    if (!e?.id) return res.status(404).json({ error: "Webhook לא נמצא" });
    if (!e.is_active) return res.status(409).json({ error: "Webhook מושבת" });

    const r = await db.execute(sql`
      insert into governance.webhook_deliveries (endpoint_id, event_type, payload, status, attempt, created_at)
      values (${id}, ${d.event_type}, ${JSON.stringify(d.payload ?? {})}::jsonb, 'pending', 1, now())
      returning *
    `);
    await db.execute(sql`
      update governance.webhook_endpoints
      set last_triggered_at = now(), last_status = 'pending', updated_at = now()
      where id = ${id}
    `);
    await logAudit({ user_id: uid, table_name: "governance_webhook_deliveries", record_id: id, action: "INSERT", new_values: { test: true, event_type: d.event_type }, ip_address: req.ip ?? null, notes: "test-delivery enqueued" });
    res.status(202).json({ enqueued: true, delivery: (r.rows ?? [])[0] });
  } catch (err) { sendDbError(res, err, "webhooks:test-delivery"); }
});

export default router;
