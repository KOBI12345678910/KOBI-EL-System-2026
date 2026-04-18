// workforce.benefits
import { Router } from "express";
import {
  CreateBenefitSchema, UpdateBenefitSchema, ListBenefitsQuerySchema,
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

const ALLOWED = new Set(["id","benefit_code","benefit_name","benefit_type","effective_from","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListBenefitsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.benefit_type) c.push(sql`benefit_type = ${q.benefit_type}`);
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.q) c.push(sql`(benefit_code ILIKE ${"%" + q.q + "%"} OR benefit_name ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "workforce.benefits", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "benefits:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.benefits where id = ${id} and coalesce(is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הטבה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "benefits:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateBenefitSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.benefits (
        benefit_code, benefit_name, benefit_type, employee_id,
        value_amount, value_type, effective_from, effective_to, taxable,
        notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.benefit_code}, ${d.benefit_name}, ${d.benefit_type},
        ${d.employee_id ?? null}, ${d.value_amount ?? null}, ${d.value_type ?? null},
        ${d.effective_from ?? null}, ${d.effective_to ?? null}, ${d.taxable ?? true},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_benefits", record_id: row.id, action: "INSERT", new_values: { benefit_code: d.benefit_code }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "benefits:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateBenefitSchema, req, res); if (!d) return;
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
      update workforce.benefits set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הטבה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_benefits", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "benefits:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.benefits set is_deleted = true, is_active = false,
        updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "הטבה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_benefits", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "benefits:delete"); }
});

export default router;
