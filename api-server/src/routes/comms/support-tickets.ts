// ============================================================
// comms.support_tickets — list / get / create / update / assign / resolve / delete
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateTicketSchema,
  UpdateTicketSchema,
  ListTicketsQuerySchema,
  AssignTicketSchema,
  ResolveTicketSchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "opened_at", "created_at", "updated_at", "status", "priority", "assigned_to_user_id",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListTicketsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.priority) conditions.push(sql`priority = ${q.priority}`);
    if (q.assigned_to_user_id) conditions.push(sql`assigned_to_user_id = ${q.assigned_to_user_id}`);
    if (q.customer_id) conditions.push(sql`customer_id = ${q.customer_id}`);
    if (q.category) conditions.push(sql`category = ${q.category}`);
    if (q.q) conditions.push(sql`(title ILIKE ${"%" + q.q + "%"} OR description ILIKE ${"%" + q.q + "%"} OR ticket_number ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.support_tickets",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "tickets:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select t.*,
        coalesce(json_agg(json_build_object(
          'id', s.id, 'sla_type', s.sla_type, 'target_at', s.target_at,
          'actual_at', s.actual_at, 'status', s.status
        )) filter (where s.id is not null), '[]'::json) as sla_tracking
      from comms.support_tickets t
      left join comms.support_sla_tracking s on s.ticket_id = t.id
      where t.id = ${id} and coalesce(t.is_deleted, false) = false
      group by t.id
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "קריאת שירות לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "tickets:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateTicketSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const ticketNumber = d.ticket_number
      ?? `TKT-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
    const r = await db.execute(sql`
      insert into comms.support_tickets (
        ticket_number, customer_id, supplier_id, portal_user_id,
        title, description, priority, category, channel,
        status, sla_due_at, metadata, created_by, updated_by,
        opened_at, created_at, updated_at
      ) values (
        ${ticketNumber}, ${d.customer_id ?? null}, ${d.supplier_id ?? null},
        ${d.portal_user_id ?? null},
        ${d.title}, ${d.description ?? null}, ${d.priority ?? "medium"},
        ${d.category ?? null}, ${d.channel ?? null},
        'open', ${d.sla_due_at ?? null},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "tickets:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateTicketSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.support_tickets set
        title = coalesce(${d.title ?? null}, title),
        description = coalesce(${d.description ?? null}, description),
        priority = coalesce(${d.priority ?? null}, priority),
        category = coalesce(${d.category ?? null}, category),
        channel = coalesce(${d.channel ?? null}, channel),
        status = coalesce(${d.status ?? null}, status),
        assigned_to_user_id = coalesce(${d.assigned_to_user_id ?? null}, assigned_to_user_id),
        sla_due_at = coalesce(${d.sla_due_at ?? null}, sla_due_at),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "קריאת שירות לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "tickets:update"); }
});

// POST /:id/assign
router.post("/:id/assign", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(AssignTicketSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.support_tickets set
        assigned_to_user_id = ${d.assigned_to_user_id},
        status = case when status = 'open' then 'in_progress' else status end,
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "קריאת שירות לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "tickets:assign"); }
});

// POST /:id/resolve
router.post("/:id/resolve", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ResolveTicketSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.support_tickets set
        status = 'resolved',
        resolved_at = now(),
        metadata = metadata
          || jsonb_build_object('resolution', ${d.resolution}::text, 'resolution_notes', ${d.notes ?? ""}::text),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "קריאת שירות לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "tickets:resolve"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.support_tickets set is_deleted = true, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "קריאת שירות לא נמצאה" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "tickets:delete"); }
});

export default router;
