import { Router } from "express";
import {
  CreateNotificationSchema, ListNotificationsQuerySchema,
  MarkReadSchema, DismissNotificationSchema,
} from "@workspace/api-zod/orchestration";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);

const ALLOWED = new Set([
  "id", "notification_number", "recipient_type", "recipient_id",
  "status", "severity", "channel", "scheduled_at", "sent_at", "read_at", "created_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListNotificationsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.recipient_type) c.push(sql`recipient_type = ${q.recipient_type}`);
    if (q.recipient_id) c.push(sql`recipient_id = ${q.recipient_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.severity) c.push(sql`severity = ${q.severity}`);
    if (q.channel) c.push(sql`channel = ${q.channel}`);
    if (q.unread_only) c.push(sql`status in ('pending','sent')`);
    const from = safeDateParam(q.from_date);
    const to = safeDateParam(q.to_date);
    if (from) c.push(sql`created_at >= ${from}`);
    if (to) c.push(sql`created_at <= ${to}`);
    if (q.q) c.push(sql`(title ILIKE ${"%" + q.q + "%"} OR message_text ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.notifications", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "notifications:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from orchestration.notifications where id = ${id}
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "התראה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "notifications:get"); }
});

router.post("/", adminMiddleware, async (req, res) => {
  const d = parseBody(CreateNotificationSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const num = d.notification_number ??
      `NTF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9999).toString(36).toUpperCase()}`;
    const r = await db.execute(sql`
      insert into orchestration.notifications
        (notification_number, recipient_type, recipient_id, title, message_text,
         severity, channel, status, state, scheduled_at,
         related_entity_type, related_entity_id, metadata, created_at, updated_at)
      values
        (${num}, ${d.recipient_type}, ${d.recipient_id ?? null},
         ${d.title}, ${d.message_text ?? null},
         ${d.severity ?? "info"}, ${d.channel ?? "in_app"},
         'pending', 'open', ${d.scheduled_at ?? null},
         ${d.related_entity_type ?? null}, ${d.related_entity_id ?? null},
         ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "orchestration_notifications", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "notifications:create"); }
});

// Business: mark as read
router.post("/:id/mark-read", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(MarkReadSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const markRead = d.read !== false;
    const r = await db.execute(sql`
      update orchestration.notifications
      set status = ${markRead ? "read" : "sent"},
          read_at = ${markRead ? sql`now()` : sql`null`},
          updated_at = now()
      where id = ${id} and status in ('pending','sent','read')
      returning id, status, read_at
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "ההתראה אינה במצב סימון" });
    }
    await logAudit({ user_id: uid, table_name: "orchestration_notifications", record_id: id, action: "UPDATE", new_values: { mark_read: markRead } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "notifications:mark-read"); }
});

// Business: dismiss
router.post("/:id/dismiss", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(DismissNotificationSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.notifications
      set status = 'dismissed',
          dismissed_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('dismiss_reason', ${d.reason ?? null}),
          updated_at = now()
      where id = ${id} and status != 'dismissed'
      returning id, status, dismissed_at
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "ההתראה כבר נדחתה" });
    }
    await logAudit({ user_id: uid, table_name: "orchestration_notifications", record_id: id, action: "UPDATE", new_values: { dismissed: true, reason: d.reason ?? null } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "notifications:dismiss"); }
});

// Business: mark all read for current user
router.post("/mark-all-read", async (req, res) => {
  const uid = currentUserId(req);
  if (!uid) return res.status(401).json({ error: "נדרש משתמש מחובר" });
  try {
    const r = await db.execute(sql`
      update orchestration.notifications
      set status = 'read', read_at = now(), updated_at = now()
      where recipient_type = 'user' and recipient_id = ${uid}
        and status in ('pending','sent')
      returning id
    `);
    await logAudit({ user_id: uid, table_name: "orchestration_notifications", record_id: 0, action: "UPDATE", new_values: { mark_all_read: true, count: (r.rows ?? []).length } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json({ updated: (r.rows ?? []).length });
  } catch (err) { sendDbError(res, err, "notifications:mark-all-read"); }
});

export default router;
