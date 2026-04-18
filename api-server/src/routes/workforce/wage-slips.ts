// workforce.wage_slips — highly sensitive; self-only read for regular employees.
//   POST /:id/publish — generates PDF via pdf-generator-engine (best-effort).
import { Router } from "express";
import {
  CreateWageSlipSchema, UpdateWageSlipSchema, ListWageSlipsQuerySchema, PublishWageSlipSchema,
} from "@workspace/api-zod/workforce";
import {
  db, sql, authMiddleware, hrOrAdminMiddleware, hrManagerMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);
router.use(hrOrAdminMiddleware);

const ALLOWED = new Set(["id","slip_number","slip_date","employee_id","status","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListWageSlipsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.payroll_entry_id) c.push(sql`payroll_entry_id = ${q.payroll_entry_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.slip_date_from) c.push(sql`slip_date >= ${q.slip_date_from}`);
    if (q.slip_date_to) c.push(sql`slip_date <= ${q.slip_date_to}`);
    if (q.q) c.push(sql`slip_number ILIKE ${"%" + q.q + "%"}`);
    const r = await runSafeList({
      table: "workforce.wage_slips", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "slip_date",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "wage-slips:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select ws.*, e.employee_number, e.full_name
      from workforce.wage_slips ws
      left join workforce.employees e on e.id = ws.employee_id
      where ws.id = ${id} and coalesce(ws.is_deleted,false) = false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "תלוש לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "wage-slips:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateWageSlipSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.wage_slips (
        slip_number, payroll_entry_id, employee_id, slip_date,
        gross_pay, net_pay, document_id, status, notes, metadata,
        created_by, updated_by, created_at, updated_at
      ) values (
        ${d.slip_number ?? "WS-" + Date.now()}, ${d.payroll_entry_id}, ${d.employee_id},
        ${d.slip_date}, ${d.gross_pay}, ${d.net_pay},
        ${d.document_id ?? null}, ${d.status ?? "draft"},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_wage_slips", record_id: row.id, action: "INSERT", new_values: { employee_id: d.employee_id, slip_date: d.slip_date }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "wage-slips:create"); }
});

// POST /:id/publish — transition draft→published and attempt PDF generation.
router.post("/:id/publish", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(PublishWageSlipSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    // Attempt to generate a PDF via internal engine if available. Graceful fallback
    // if the engine isn't importable — status still transitions.
    let documentId: number | null = null;
    if (d.generate_pdf) {
      try {
        const mod = await import("../../lib/pdf-generator-engine").catch(() => null);
        type MaybePdfEngine = {
          generateWageSlipPdf?: (slipId: number, userId: number | null) => Promise<number | null>;
        };
        const engine: MaybePdfEngine | null = (mod as unknown as MaybePdfEngine | null) ?? null;
        if (engine && typeof engine.generateWageSlipPdf === "function") {
          documentId = await engine.generateWageSlipPdf(id, uid);
        }
      } catch (e) {
        console.warn("[workforce:wage-slips:publish] pdf engine unavailable", e);
      }
    }

    const r = await db.execute(sql`
      update workforce.wage_slips
      set status = 'published', published_at = now(), published_by = ${uid},
          document_id = coalesce(${documentId}, document_id),
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'draft' and coalesce(is_deleted,false)=false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(400).json({ error: "ניתן לפרסם רק תלוש בטיוטה" });
    await logAudit({ user_id: uid, table_name: "workforce_wage_slips", record_id: id, action: "UPDATE", new_values: { status: "published", document_id: documentId }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "wage-slips:publish"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateWageSlipSchema, req, res); if (!d) return;
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
      update workforce.wage_slips set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'draft' and coalesce(is_deleted,false)=false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(400).json({ error: "ניתן לעדכן רק תלוש בטיוטה" });
    await logAudit({ user_id: uid, table_name: "workforce_wage_slips", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "wage-slips:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.wage_slips set is_deleted = true, status = 'superseded',
        updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "תלוש לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_wage_slips", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "wage-slips:delete"); }
});

export default router;
