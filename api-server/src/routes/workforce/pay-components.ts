// workforce.pay_components + workforce.employee_pay_components
import { Router } from "express";
import {
  CreatePayComponentSchema, UpdatePayComponentSchema, ListPayComponentsQuerySchema,
  CreateEmployeePayComponentSchema, UpdateEmployeePayComponentSchema, ListEmployeePayComponentsQuerySchema,
} from "@workspace/api-zod/workforce";
import {
  db, sql, authMiddleware, hrOrAdminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);
router.use(hrOrAdminMiddleware);

const PC_ALLOWED = new Set(["id","component_code","component_name","component_type","created_at","updated_at"]);
const EPC_ALLOWED = new Set(["id","employee_id","pay_component_id","effective_from","created_at","updated_at"]);

// ───── pay_components ─────
router.get("/", async (req, res) => {
  const q = parseQuery(ListPayComponentsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.active !== undefined) c.push(sql`active = ${q.active}`);
    if (q.component_type) c.push(sql`component_type = ${q.component_type}`);
    if (q.q) c.push(sql`(component_code ILIKE ${"%" + q.q + "%"} OR component_name ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "workforce.pay_components", conditions: c,
      allowedOrderColumns: PC_ALLOWED, fallbackColumn: "component_code",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "pay-components:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.pay_components where id = ${id} and coalesce(is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "רכיב שכר לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "pay-components:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreatePayComponentSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.pay_components (
        component_code, component_name, component_type, taxable, pensionable, active,
        config_payload, notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.component_code}, ${d.component_name}, ${d.component_type},
        ${d.taxable ?? true}, ${d.pensionable ?? true}, ${d.active ?? true},
        ${JSON.stringify(d.config_payload ?? {})}::jsonb,
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_pay_components", record_id: row.id, action: "INSERT", new_values: { component_code: d.component_code }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "pay-components:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePayComponentSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) =>
      (k === "metadata" || k === "config_payload")
        ? sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`
        : sql`${sql.raw(k)} = ${v as string | number | boolean | null}`
    );
    let setClause = fragments[0];
    for (let i = 1; i < fragments.length; i++) setClause = sql`${setClause}, ${fragments[i]}`;
    const r = await db.execute(sql`
      update workforce.pay_components set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "רכיב שכר לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_pay_components", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "pay-components:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.pay_components set is_deleted = true, active = false,
        updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "רכיב שכר לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_pay_components", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "pay-components:delete"); }
});

// ───── employee_pay_components ─────
router.get("/employee-assignments", async (req, res) => {
  const q = parseQuery(ListEmployeePayComponentsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.pay_component_id) c.push(sql`pay_component_id = ${q.pay_component_id}`);
    if (q.active !== undefined) c.push(sql`active = ${q.active}`);
    const r = await runSafeList({
      table: "workforce.employee_pay_components", conditions: c,
      allowedOrderColumns: EPC_ALLOWED, fallbackColumn: "effective_from",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "employee-pay-components:list"); }
});

router.post("/employee-assignments", async (req, res) => {
  const d = parseBody(CreateEmployeePayComponentSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.employee_pay_components (
        employee_id, pay_component_id, value_type, value_amount,
        effective_from, effective_to, active, metadata,
        created_by, updated_by, created_at, updated_at
      ) values (
        ${d.employee_id}, ${d.pay_component_id}, ${d.value_type}, ${d.value_amount},
        ${d.effective_from}, ${d.effective_to ?? null}, ${d.active ?? true},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_employee_pay_components", record_id: row.id, action: "INSERT", new_values: { employee_id: d.employee_id, pay_component_id: d.pay_component_id }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "employee-pay-components:create"); }
});

router.patch("/employee-assignments/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateEmployeePayComponentSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) =>
      k === "metadata"
        ? sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`
        : sql`${sql.raw(k)} = ${v as string | number | boolean | null}`
    );
    let setClause = fragments[0];
    for (let i = 1; i < fragments.length; i++) setClause = sql`${setClause}, ${fragments[i]}`;
    const r = await db.execute(sql`
      update workforce.employee_pay_components set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הקצאה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_employee_pay_components", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "employee-pay-components:update"); }
});

export default router;
