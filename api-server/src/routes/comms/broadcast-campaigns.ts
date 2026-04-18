// ============================================================
// comms.broadcast_campaigns — CRUD + execute
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  ListCampaignsQuerySchema,
  ExecuteCampaignSchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "created_at", "updated_at", "scheduled_at", "started_at", "completed_at",
  "status", "channel", "name", "campaign_code",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListCampaignsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.channel) conditions.push(sql`channel = ${q.channel}`);
    if (q.q) conditions.push(sql`(name ILIKE ${"%" + q.q + "%"} OR campaign_code ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.broadcast_campaigns",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "campaigns:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select c.*,
        coalesce(json_agg(json_build_object(
          'id', r.id, 'target', r.target, 'status', r.status,
          'sent_at', r.sent_at, 'error_message', r.error_message
        )) filter (where r.id is not null), '[]'::json) as recipients
      from comms.broadcast_campaigns c
      left join comms.broadcast_recipients r on r.campaign_id = c.id
      where c.id = ${id} and coalesce(c.is_deleted, false) = false
      group by c.id
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "קמפיין לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "campaigns:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateCampaignSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.broadcast_campaigns (
        campaign_code, name, channel, template_id, audience_filter,
        status, scheduled_at, metadata, created_by, updated_by,
        created_at, updated_at
      ) values (
        ${d.campaign_code}, ${d.name}, ${d.channel}, ${d.template_id ?? null},
        ${JSON.stringify(d.audience_filter ?? {})}::jsonb,
        ${d.status ?? "draft"}, ${d.scheduled_at ?? null},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "campaigns:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateCampaignSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.broadcast_campaigns set
        name = coalesce(${d.name ?? null}, name),
        channel = coalesce(${d.channel ?? null}, channel),
        template_id = coalesce(${d.template_id ?? null}, template_id),
        audience_filter = coalesce(${d.audience_filter ? JSON.stringify(d.audience_filter) : null}::jsonb, audience_filter),
        status = coalesce(${d.status ?? null}, status),
        scheduled_at = coalesce(${d.scheduled_at ?? null}, scheduled_at),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "קמפיין לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "campaigns:update"); }
});

// POST /:id/execute — mark campaign as sending and materialize recipients
// (the actual send is handled by a background worker reading the recipients).
router.post("/:id/execute", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ExecuteCampaignSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      select id, status, channel, recipient_count from comms.broadcast_campaigns
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const campaign = (r.rows ?? [])[0] as
      { id: number; status: string; channel: string; recipient_count: number } | undefined;
    if (!campaign) return res.status(404).json({ error: "קמפיין לא נמצא" });
    if (campaign.status === "sending" || campaign.status === "completed") {
      return res.status(409).json({ error: "קמפיין כבר בתהליך או הושלם" });
    }
    if (d.dry_run) {
      return res.json({
        ok: true,
        dry_run: true,
        would_send: campaign.recipient_count,
        status: campaign.status,
      });
    }
    const upd = await db.execute(sql`
      update comms.broadcast_campaigns
      set status = 'sending', started_at = now(), updated_at = now()
      where id = ${id}
      returning *
    `);
    res.json({ ok: true, campaign: (upd.rows ?? [])[0] });
  } catch (err) { sendDbError(res, err, "campaigns:execute"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.broadcast_campaigns set is_deleted = true, is_active = false, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "קמפיין לא נמצא" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "campaigns:delete"); }
});

export default router;
