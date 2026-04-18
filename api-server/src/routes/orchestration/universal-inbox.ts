import { Router } from "express";
import {
  CreateInboxItemSchema, ListInboxItemsQuerySchema,
  ClaimInboxItemSchema, ResolveInboxItemSchema, DismissInboxItemSchema,
  ReassignInboxItemSchema, ListInboxAssignmentsQuerySchema,
} from "@workspace/api-zod/orchestration";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);

const ALLOWED = new Set([
  "id", "inbox_number", "item_type", "status", "priority",
  "assigned_to_user_id", "due_at", "created_at", "updated_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListInboxItemsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.assigned_to_user_id) c.push(sql`assigned_to_user_id = ${q.assigned_to_user_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.item_type) c.push(sql`item_type = ${q.item_type}`);
    if (q.parent_entity_type) c.push(sql`parent_entity_type = ${q.parent_entity_type}`);
    if (q.parent_entity_id) c.push(sql`parent_entity_id = ${q.parent_entity_id}`);
    if (q.priority) c.push(sql`priority = ${q.priority}`);
    if (q.overdue) c.push(sql`due_at is not null and due_at < now() and status in ('open','claimed')`);
    if (q.q) c.push(sql`(inbox_number ILIKE ${"%" + q.q + "%"} OR title ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.universal_inbox", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "universal-inbox:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from orchestration.universal_inbox where id = ${id}
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "פריט לא נמצא" });
    const assignments = await db.execute(sql`
      select * from orchestration.inbox_assignments
      where inbox_item_id = ${id}
      order by assigned_at desc limit 50
    `);
    res.json({ item: row, assignments: assignments.rows ?? [] });
  } catch (err) { sendDbError(res, err, "universal-inbox:get"); }
});

router.post("/", adminMiddleware, async (req, res) => {
  const d = parseBody(CreateInboxItemSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const inboxNumber = d.inbox_number ??
      `INB-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9999).toString(36).toUpperCase()}`;
    const r = await db.execute(sql`
      insert into orchestration.universal_inbox
        (inbox_number, item_type, parent_entity_type, parent_entity_id, title, description,
         assigned_to_user_id, priority, status, state, due_at, metadata, created_at, updated_at)
      values
        (${inboxNumber}, ${d.item_type}, ${d.parent_entity_type ?? null}, ${d.parent_entity_id ?? null},
         ${d.title}, ${d.description ?? null},
         ${d.assigned_to_user_id ?? null}, ${d.priority ?? null},
         'open', 'open', ${d.due_at ?? null},
         ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id && d.assigned_to_user_id) {
      await db.execute(sql`
        insert into orchestration.inbox_assignments
          (inbox_item_id, assigned_to_user_id, assigned_by, assigned_at, metadata)
        values (${row.id}, ${d.assigned_to_user_id}, ${uid}, now(), '{}'::jsonb)
      `);
    }
    if (row?.id) await logAudit({ user_id: uid, table_name: "orchestration_universal_inbox", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "universal-inbox:create"); }
});

// Business: claim
router.post("/:id/claim", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ClaimInboxItemSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  if (!uid) return res.status(401).json({ error: "נדרש משתמש מחובר" });
  try {
    const r = await db.execute(sql`
      update orchestration.universal_inbox
      set status = 'claimed', state = 'claimed',
          claimed_by = ${uid}, claimed_at = now(),
          assigned_to_user_id = coalesce(assigned_to_user_id, ${uid}),
          updated_at = now()
      where id = ${id} and status = 'open'
      returning id, status, claimed_by, claimed_at
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "הפריט אינו פתוח" });
    }
    await db.execute(sql`
      insert into orchestration.inbox_assignments
        (inbox_item_id, assigned_to_user_id, assigned_by, reason, assigned_at, metadata)
      values (${id}, ${uid}, ${uid}, ${"claim: " + (d.claim_note ?? "")}, now(), '{}'::jsonb)
    `);
    await logAudit({ user_id: uid, table_name: "orchestration_universal_inbox", record_id: id, action: "UPDATE", new_values: { claimed: true, note: d.claim_note ?? null } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "claim" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "universal-inbox:claim"); }
});

// Business: resolve
router.post("/:id/resolve", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ResolveInboxItemSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.universal_inbox
      set status = 'resolved', state = 'resolved',
          resolved_by = ${uid}, resolved_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('resolution_note', ${d.resolution_note}),
          updated_at = now()
      where id = ${id} and status in ('open','claimed')
      returning id, status, resolved_by, resolved_at
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "לא ניתן לסגור בסטטוס הנוכחי" });
    }
    await logAudit({ user_id: uid, table_name: "orchestration_universal_inbox", record_id: id, action: "UPDATE", new_values: { resolved: true, note: d.resolution_note } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "resolve" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "universal-inbox:resolve"); }
});

// Business: dismiss
router.post("/:id/dismiss", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(DismissInboxItemSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.universal_inbox
      set status = 'dismissed', state = 'dismissed',
          dismissed_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('dismiss_reason', ${d.reason}),
          updated_at = now()
      where id = ${id} and status in ('open','claimed')
      returning id, status, dismissed_at
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "לא ניתן לדחות בסטטוס הנוכחי" });
    }
    await logAudit({ user_id: uid, table_name: "orchestration_universal_inbox", record_id: id, action: "UPDATE", new_values: { dismissed: true, reason: d.reason } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "dismiss" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "universal-inbox:dismiss"); }
});

// Business: reassign (admin)
router.post("/:id/reassign", adminMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ReassignInboxItemSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    // close existing active assignment
    await db.execute(sql`
      update orchestration.inbox_assignments
      set unassigned_at = now()
      where inbox_item_id = ${id} and unassigned_at is null
    `);
    const r = await db.execute(sql`
      update orchestration.universal_inbox
      set assigned_to_user_id = ${d.assigned_to_user_id},
          status = case when status = 'dismissed' or status = 'resolved' then status else 'open' end,
          state  = case when state  = 'dismissed' or state  = 'resolved' then state  else 'open' end,
          updated_at = now()
      where id = ${id}
      returning id, assigned_to_user_id, status
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "פריט לא נמצא" });
    await db.execute(sql`
      insert into orchestration.inbox_assignments
        (inbox_item_id, assigned_to_user_id, assigned_by, reason, assigned_at, metadata)
      values (${id}, ${d.assigned_to_user_id}, ${uid}, ${d.reason ?? null}, now(), '{}'::jsonb)
    `);
    await logAudit({ user_id: uid, table_name: "orchestration_universal_inbox", record_id: id, action: "UPDATE", new_values: { reassigned_to: d.assigned_to_user_id, reason: d.reason ?? null } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "reassign" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "universal-inbox:reassign"); }
});

// ---------- assignments history ----------
const ALLOWED_ASSIGN = new Set([
  "id", "inbox_item_id", "assigned_to_user_id", "assigned_at", "unassigned_at",
]);

router.get("/assignments/list", async (req, res) => {
  const q = parseQuery(ListInboxAssignmentsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.inbox_item_id) c.push(sql`inbox_item_id = ${q.inbox_item_id}`);
    if (q.assigned_to_user_id) c.push(sql`assigned_to_user_id = ${q.assigned_to_user_id}`);
    if (q.active_only) c.push(sql`unassigned_at is null`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.inbox_assignments", conditions: c,
      allowedOrderColumns: ALLOWED_ASSIGN, fallbackColumn: "assigned_at",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "inbox-assignments:list"); }
});

export default router;
