import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const q = async (query: any) => { try { const r = await db.execute(query); return r.rows; } catch(e) { console.error("[CRM-Enterprise]", e); return []; } };

async function nextNumber(prefix: string) {
  const year = new Date().getFullYear();
  const rows = await db.execute(sql`SELECT current_value FROM auto_number_counters WHERE prefix = ${prefix} LIMIT 1`);
  const current = Number((rows.rows as any[])?.[0]?.current_value || 0) + 1;
  await db.execute(sql`UPDATE auto_number_counters SET current_value = ${current} WHERE prefix = ${prefix}`);
  return `${prefix}-${year}-${String(current).padStart(4, "0")}`;
}

function clean(d: any, skip: string[] = []) {
  const o = { ...d };
  for (const k of skip) delete o[k];
  for (const k in o) { if (o[k] === "" || o[k] === undefined) o[k] = null; }
  delete o.id; delete o.created_at; delete o.updated_at;
  return o;
}

// ======================== LEADS ========================
router.get("/crm-leads", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_leads ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/crm-leads/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='new') as new_count,
    COUNT(*) FILTER(WHERE status='contacted') as contacted,
    COUNT(*) FILTER(WHERE status='qualified') as qualified,
    COUNT(*) FILTER(WHERE status='proposal') as proposal,
    COUNT(*) FILTER(WHERE status='converted') as converted,
    COUNT(*) FILTER(WHERE status='lost') as lost,
    COUNT(*) FILTER(WHERE priority='high' OR priority='urgent') as high_priority,
    COALESCE(SUM(estimated_value),0) as total_value,
    COALESCE(SUM(estimated_value) FILTER(WHERE status='converted'),0) as converted_value,
    COALESCE(AVG(estimated_value) FILTER(WHERE estimated_value>0),0) as avg_value,
    COUNT(DISTINCT source) as sources,
    COUNT(*) FILTER(WHERE next_follow_up <= CURRENT_DATE) as overdue_followups,
    COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '7 days') as new_this_week,
    COUNT(DISTINCT assigned_to) as unique_agents,
    CASE WHEN COUNT(*)>0 THEN ROUND(COUNT(*) FILTER(WHERE status='converted')::numeric / COUNT(*) * 100, 1) ELSE 0 END as conversion_rate
    FROM crm_leads`);
  res.json(r[0] || {});
});

router.post("/crm-leads", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body, ["balance_due"]);
    const num = await nextNumber("LED");
    await db.execute(sql`INSERT INTO crm_leads (lead_number, first_name, last_name, company, phone, email, source, status, priority, assigned_to, estimated_value, product_interest, address, city, notes, next_follow_up, last_contact_date, tags)
      VALUES (${num}, ${d.firstName}, ${d.lastName}, ${d.company}, ${d.phone}, ${d.email}, ${d.source}, ${d.status}, ${d.priority}, ${d.assignedTo}, ${d.estimatedValue || 0}, ${d.productInterest}, ${d.address}, ${d.city}, ${d.notes}, ${d.nextFollowUp}, ${d.lastContactDate}, ${d.tags})`);
    res.json({ success: true, lead_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm-leads/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body, ["balance_due"]);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE crm_leads SET first_name=${d.firstName}, last_name=${d.lastName}, company=${d.company}, phone=${d.phone}, email=${d.email}, source=${d.source}, status=${d.status}, priority=${d.priority}, assigned_to=${d.assignedTo}, estimated_value=${d.estimatedValue || 0}, product_interest=${d.productInterest}, address=${d.address}, city=${d.city}, notes=${d.notes}, next_follow_up=${d.nextFollowUp}, last_contact_date=${d.lastContactDate}, tags=${d.tags}, conversion_date=${d.conversionDate}, lost_reason=${d.lostReason}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm-leads/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_leads WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== COLLECTIONS ========================
router.get("/crm-collections", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_collections ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/crm-collections/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='open') as open_count,
    COUNT(*) FILTER(WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER(WHERE status='partial') as partial,
    COUNT(*) FILTER(WHERE status='paid') as paid,
    COUNT(*) FILTER(WHERE status='written_off') as written_off,
    COUNT(*) FILTER(WHERE status='legal') as legal,
    COALESCE(SUM(original_amount),0) as total_original,
    COALESCE(SUM(paid_amount),0) as total_paid,
    COALESCE(SUM(original_amount - paid_amount),0) as total_outstanding,
    COUNT(*) FILTER(WHERE risk_level='critical') as critical_count,
    COUNT(*) FILTER(WHERE risk_level='high') as high_risk,
    COUNT(*) FILTER(WHERE days_overdue > 90) as over_90_days,
    COUNT(*) FILTER(WHERE days_overdue BETWEEN 31 AND 90) as days_31_90,
    COUNT(*) FILTER(WHERE days_overdue BETWEEN 1 AND 30) as days_1_30,
    COALESCE(AVG(days_overdue) FILTER(WHERE status='open'),0) as avg_overdue_days
    FROM crm_collections`);
  res.json(r[0] || {});
});

router.post("/crm-collections", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body, ["balance_due"]);
    const num = await nextNumber("COL");
    await db.execute(sql`INSERT INTO crm_collections (collection_number, customer_name, invoice_number, original_amount, paid_amount, due_date, days_overdue, risk_level, status, escalation_level, collector, last_contact_date, next_action, next_action_date, payment_plan, phone, email, notes, dunning_letters_sent)
      VALUES (${num}, ${d.customerName}, ${d.invoiceNumber}, ${d.originalAmount || 0}, ${d.paidAmount || 0}, ${d.dueDate}, ${d.daysOverdue || 0}, ${d.riskLevel}, ${d.status}, ${d.escalationLevel || 0}, ${d.collector}, ${d.lastContactDate}, ${d.nextAction}, ${d.nextActionDate}, ${d.paymentPlan}, ${d.phone}, ${d.email}, ${d.notes}, ${d.dunningLettersSent || 0})`);
    res.json({ success: true, collection_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm-collections/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body, ["balance_due"]);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE crm_collections SET customer_name=${d.customerName}, invoice_number=${d.invoiceNumber}, original_amount=${d.originalAmount || 0}, paid_amount=${d.paidAmount || 0}, due_date=${d.dueDate}, days_overdue=${d.daysOverdue || 0}, risk_level=${d.riskLevel}, status=${d.status}, escalation_level=${d.escalationLevel || 0}, collector=${d.collector}, last_contact_date=${d.lastContactDate}, next_action=${d.nextAction}, next_action_date=${d.nextActionDate}, payment_plan=${d.paymentPlan}, phone=${d.phone}, email=${d.email}, notes=${d.notes}, dunning_letters_sent=${d.dunningLettersSent || 0}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm-collections/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_collections WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== PRICING RULES ========================
router.get("/crm-pricing-rules", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_pricing_rules ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/crm-pricing-rules/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='active') as active_count,
    COUNT(*) FILTER(WHERE status='inactive') as inactive,
    COUNT(*) FILTER(WHERE status='expired') as expired,
    COUNT(*) FILTER(WHERE status='draft') as draft,
    COALESCE(AVG(discount_percent) FILTER(WHERE status='active'),0) as avg_discount,
    COALESCE(MAX(discount_percent),0) as max_discount,
    COALESCE(AVG(base_price) FILTER(WHERE base_price>0),0) as avg_base_price,
    COUNT(DISTINCT product_category) as categories,
    COUNT(DISTINCT customer_segment) as segments,
    COUNT(*) FILTER(WHERE valid_to < CURRENT_DATE AND status='active') as needs_renewal,
    COUNT(*) FILTER(WHERE valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE) AND status='active') as currently_valid,
    COALESCE(SUM(base_price * (discount_percent/100)) FILTER(WHERE status='active'),0) as total_discount_value,
    COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '30 days') as new_this_month,
    COUNT(*) FILTER(WHERE approved_by IS NOT NULL) as approved_count,
    COUNT(*) FILTER(WHERE approved_by IS NULL AND status='active') as pending_approval
    FROM crm_pricing_rules`);
  res.json(r[0] || {});
});

router.post("/crm-pricing-rules", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body, ["final_price"]);
    const num = await nextNumber("PRC");
    await db.execute(sql`INSERT INTO crm_pricing_rules (rule_number, rule_name, product_category, customer_segment, base_price, discount_percent, min_quantity, max_quantity, valid_from, valid_to, status, priority, conditions, approved_by, notes)
      VALUES (${num}, ${d.ruleName}, ${d.productCategory}, ${d.customerSegment}, ${d.basePrice || 0}, ${d.discountPercent || 0}, ${d.minQuantity || 1}, ${d.maxQuantity}, ${d.validFrom}, ${d.validTo}, ${d.status}, ${d.priority || 0}, ${d.conditions}, ${d.approvedBy}, ${d.notes})`);
    res.json({ success: true, rule_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm-pricing-rules/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body, ["final_price"]);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE crm_pricing_rules SET rule_name=${d.ruleName}, product_category=${d.productCategory}, customer_segment=${d.customerSegment}, base_price=${d.basePrice || 0}, discount_percent=${d.discountPercent || 0}, min_quantity=${d.minQuantity || 1}, max_quantity=${d.maxQuantity}, valid_from=${d.validFrom}, valid_to=${d.validTo}, status=${d.status}, priority=${d.priority || 0}, conditions=${d.conditions}, approved_by=${d.approvedBy}, notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm-pricing-rules/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_pricing_rules WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== FIELD AGENTS ========================
router.get("/crm-field-agents", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_field_agents ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/crm-field-agents/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='active') as active_count,
    COUNT(*) FILTER(WHERE status='inactive') as inactive,
    COUNT(*) FILTER(WHERE status='on_leave') as on_leave,
    COUNT(*) FILTER(WHERE status='terminated') as terminated,
    COALESCE(SUM(mtd_sales),0) as total_mtd_sales,
    COALESCE(SUM(ytd_sales),0) as total_ytd_sales,
    COALESCE(SUM(monthly_target),0) as total_targets,
    COALESCE(AVG(commission_rate) FILTER(WHERE status='active'),0) as avg_commission,
    COALESCE(SUM(total_customers),0) as total_customers,
    COALESCE(SUM(total_visits_month),0) as total_visits,
    COALESCE(AVG(avg_deal_size) FILTER(WHERE avg_deal_size>0),0) as avg_deal,
    COUNT(DISTINCT region) as regions,
    CASE WHEN SUM(monthly_target)>0 THEN ROUND(SUM(mtd_sales)::numeric / SUM(monthly_target) * 100, 1) ELSE 0 END as target_achievement,
    COUNT(*) FILTER(WHERE license_expiry < CURRENT_DATE AND status='active') as expired_licenses,
    COUNT(*) FILTER(WHERE mtd_sales >= monthly_target AND monthly_target > 0) as target_met
    FROM crm_field_agents`);
  res.json(r[0] || {});
});

router.post("/crm-field-agents", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("AGT");
    await db.execute(sql`INSERT INTO crm_field_agents (agent_number, full_name, phone, email, region, territory, status, hire_date, commission_rate, monthly_target, mtd_sales, ytd_sales, total_customers, total_visits_month, avg_deal_size, vehicle_number, license_expiry, manager, notes)
      VALUES (${num}, ${d.fullName}, ${d.phone}, ${d.email}, ${d.region}, ${d.territory}, ${d.status}, ${d.hireDate}, ${d.commissionRate || 0}, ${d.monthlyTarget || 0}, ${d.mtdSales || 0}, ${d.ytdSales || 0}, ${d.totalCustomers || 0}, ${d.totalVisitsMonth || 0}, ${d.avgDealSize || 0}, ${d.vehicleNumber}, ${d.licenseExpiry}, ${d.manager}, ${d.notes})`);
    res.json({ success: true, agent_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm-field-agents/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE crm_field_agents SET full_name=${d.fullName}, phone=${d.phone}, email=${d.email}, region=${d.region}, territory=${d.territory}, status=${d.status}, hire_date=${d.hireDate}, commission_rate=${d.commissionRate || 0}, monthly_target=${d.monthlyTarget || 0}, mtd_sales=${d.mtdSales || 0}, ytd_sales=${d.ytdSales || 0}, total_customers=${d.totalCustomers || 0}, total_visits_month=${d.totalVisitsMonth || 0}, avg_deal_size=${d.avgDealSize || 0}, vehicle_number=${d.vehicleNumber}, license_expiry=${d.licenseExpiry}, manager=${d.manager}, notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm-field-agents/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_field_agents WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CRM DASHBOARD STATS ========================
router.get("/crm-enterprise/dashboard", async (_req: Request, res: Response) => {
  const [leads, collections, pricing, agents] = await Promise.all([
    q(sql`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='new') as new_count, COUNT(*) FILTER(WHERE status='converted') as converted, COALESCE(SUM(estimated_value),0) as pipeline_value FROM crm_leads`),
    q(sql`SELECT COUNT(*) as total, COALESCE(SUM(original_amount - paid_amount),0) as outstanding, COUNT(*) FILTER(WHERE risk_level IN ('high','critical')) as at_risk FROM crm_collections WHERE status != 'paid'`),
    q(sql`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='active') as active_count FROM crm_pricing_rules`),
    q(sql`SELECT COUNT(*) as total, COALESCE(SUM(mtd_sales),0) as mtd_sales, COALESCE(SUM(monthly_target),0) as total_target FROM crm_field_agents WHERE status='active'`)
  ]);
  res.json({ leads: leads[0], collections: collections[0], pricing: pricing[0], agents: agents[0] });
});

export default router;
