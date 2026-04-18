import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

async function q(rawSql: string) {
  const result = await db.execute(sql.raw(rawSql));
  return result.rows || result;
}

async function nextNum(prefix: string, table: string, col: string): Promise<string> {
  const rows = await q(`SELECT COUNT(*)::int as c FROM ${table}`);
  const c = (rows as any)[0]?.c || 0;
  return `${prefix}${String(c + 1).padStart(4, "0")}`;
}

router.get("/crm-custom-reports", async (_req: Request, res: Response) => {
  try { res.json(await q("SELECT * FROM crm_custom_reports ORDER BY updated_at DESC")); }
  catch (e: any) { res.json([]); }
});

router.get("/crm-custom-reports/stats", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'active')::int as active,
      COUNT(*) FILTER (WHERE schedule != 'manual')::int as scheduled,
      COALESCE(SUM(row_count), 0)::int as total_rows
    FROM crm_custom_reports`);
    res.json((rows as any)[0] || {});
  } catch (e: any) { res.json({}); }
});

router.post("/crm-custom-reports", async (req: Request, res: Response) => {
  try {
    const { name, description, data_source, report_type, fields, filters, schedule, status } = req.body;
    const num = await nextNum("RPT-", "crm_custom_reports", "report_number");
    await db.execute(sql`INSERT INTO crm_custom_reports (report_number, name, description, data_source, report_type, fields, filters, schedule, status)
      VALUES (${num}, ${name || "דוח חדש"}, ${description || ""}, ${data_source || "leads"}, ${report_type || "table"},
      ${fields || "{}"}, ${JSON.stringify(filters || {})}, ${schedule || "manual"}, ${status || "active"})`);
    const rows = await q(`SELECT * FROM crm_custom_reports WHERE report_number = '${num}'`);
    res.json((rows as any)[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm-custom-reports/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, data_source, report_type, fields, filters, schedule, status, row_count } = req.body;
    await db.execute(sql`UPDATE crm_custom_reports SET
      name = COALESCE(${name}, name), description = COALESCE(${description}, description),
      data_source = COALESCE(${data_source}, data_source), report_type = COALESCE(${report_type}, report_type),
      schedule = COALESCE(${schedule}, schedule), status = COALESCE(${status}, status),
      row_count = COALESCE(${row_count != null ? row_count : null}, row_count),
      updated_at = NOW() WHERE id = ${Number(id)}`);
    const rows = await q(`SELECT * FROM crm_custom_reports WHERE id = ${Number(id)}`);
    res.json((rows as any)[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm-custom-reports/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_custom_reports WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/crm-cohorts", async (_req: Request, res: Response) => {
  try { res.json(await q("SELECT * FROM crm_cohorts ORDER BY total_revenue DESC")); }
  catch (e: any) { res.json([]); }
});

router.get("/crm-cohorts/stats", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT
      COUNT(*)::int as total,
      COALESCE(SUM(customer_count), 0)::int as total_customers,
      COALESCE(SUM(total_revenue), 0)::numeric as total_revenue,
      COALESCE(AVG(retention_rate), 0)::numeric as avg_retention,
      COALESCE(AVG(avg_ltv), 0)::numeric as avg_ltv,
      COALESCE(AVG(avg_cac), 0)::numeric as avg_cac
    FROM crm_cohorts`);
    res.json((rows as any)[0] || {});
  } catch (e: any) { res.json({}); }
});

router.post("/crm-cohorts", async (req: Request, res: Response) => {
  try {
    const { name, description, segment_criteria, customer_count, total_revenue, retention_rate, growth_rate, avg_ltv, avg_cac, color, status } = req.body;
    const num = await nextNum("COH-", "crm_cohorts", "cohort_number");
    await db.execute(sql`INSERT INTO crm_cohorts (cohort_number, name, description, segment_criteria, customer_count, total_revenue, retention_rate, growth_rate, avg_ltv, avg_cac, color, status)
      VALUES (${num}, ${name || "קבוצה חדשה"}, ${description || ""}, ${segment_criteria || ""},
      ${customer_count || 0}, ${total_revenue || 0}, ${retention_rate || 0}, ${growth_rate || 0},
      ${avg_ltv || 0}, ${avg_cac || 0}, ${color || "blue"}, ${status || "active"})`);
    const rows = await q(`SELECT * FROM crm_cohorts WHERE cohort_number = '${num}'`);
    res.json((rows as any)[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm-cohorts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await db.execute(sql`UPDATE crm_cohorts SET
      name = COALESCE(${b.name}, name), description = COALESCE(${b.description}, description),
      segment_criteria = COALESCE(${b.segment_criteria}, segment_criteria),
      customer_count = COALESCE(${b.customer_count != null ? b.customer_count : null}, customer_count),
      total_revenue = COALESCE(${b.total_revenue != null ? b.total_revenue : null}, total_revenue),
      retention_rate = COALESCE(${b.retention_rate != null ? b.retention_rate : null}, retention_rate),
      growth_rate = COALESCE(${b.growth_rate != null ? b.growth_rate : null}, growth_rate),
      avg_ltv = COALESCE(${b.avg_ltv != null ? b.avg_ltv : null}, avg_ltv),
      avg_cac = COALESCE(${b.avg_cac != null ? b.avg_cac : null}, avg_cac),
      color = COALESCE(${b.color}, color), status = COALESCE(${b.status}, status),
      updated_at = NOW() WHERE id = ${Number(id)}`);
    const rows = await q(`SELECT * FROM crm_cohorts WHERE id = ${Number(id)}`);
    res.json((rows as any)[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm-cohorts/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_cohorts WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/crm-sync-devices", async (_req: Request, res: Response) => {
  try { res.json(await q("SELECT * FROM crm_sync_devices ORDER BY last_sync DESC NULLS LAST")); }
  catch (e: any) { res.json([]); }
});

router.get("/crm-sync-devices/stats", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE sync_status = 'synced')::int as synced,
      COUNT(*) FILTER (WHERE sync_status = 'error')::int as errors,
      COUNT(*) FILTER (WHERE sync_status = 'warning')::int as warnings
    FROM crm_sync_devices`);
    res.json((rows as any)[0] || {});
  } catch (e: any) { res.json({}); }
});

router.post("/crm-sync-devices", async (req: Request, res: Response) => {
  try {
    const { device_name, device_type, os, user_name, sync_status, sync_frequency, data_size, ip_address } = req.body;
    await db.execute(sql`INSERT INTO crm_sync_devices (device_name, device_type, os, user_name, last_sync, sync_status, sync_frequency, data_size, ip_address)
      VALUES (${device_name || "מכשיר חדש"}, ${device_type || "desktop"}, ${os || ""}, ${user_name || ""},
      NOW(), ${sync_status || "synced"}, ${sync_frequency || "30 seconds"}, ${data_size || "0 MB"}, ${ip_address || ""})`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm-sync-devices/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await db.execute(sql`UPDATE crm_sync_devices SET
      device_name = COALESCE(${b.device_name}, device_name),
      device_type = COALESCE(${b.device_type}, device_type),
      os = COALESCE(${b.os}, os), user_name = COALESCE(${b.user_name}, user_name),
      sync_status = COALESCE(${b.sync_status}, sync_status),
      sync_frequency = COALESCE(${b.sync_frequency}, sync_frequency),
      data_size = COALESCE(${b.data_size}, data_size),
      ip_address = COALESCE(${b.ip_address}, ip_address),
      last_sync = NOW(), updated_at = NOW() WHERE id = ${Number(id)}`);
    const rows = await q(`SELECT * FROM crm_sync_devices WHERE id = ${Number(id)}`);
    res.json((rows as any)[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm-sync-devices/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_sync_devices WHERE id = ${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
