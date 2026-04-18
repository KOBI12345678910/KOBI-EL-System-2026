import { Router, type Request, type Response, type RequestHandler } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import PDFDocument from "pdfkit";
import { validateSession } from "../lib/auth";

const router = Router();

const BCRYPT_ROUNDS = 12;

const q = async (query: any): Promise<any[]> => {
  try { const r = await db.execute(query); return (r.rows as any[]) || []; }
  catch (e: any) { console.error("[CRM-Customer360]", e.message); return []; }
};

// ======================== INTERNAL AUTH MIDDLEWARE ========================
const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  next();
};

router.use("/crm", requireAuth);

// ======================== RFM CONFIGURABLE THRESHOLDS ========================
const DEFAULT_THRESHOLDS = {
  r_30: 30, r_60: 60, r_90: 90, r_180: 180,
  f_20: 20, f_10: 10, f_5: 5, f_2: 2,
  m_500k: 500000, m_100k: 100000, m_50k: 50000, m_10k: 10000,
  vip_min: 13, gold_min: 10, silver_min: 7,
};

async function getRfmThresholds(): Promise<typeof DEFAULT_THRESHOLDS> {
  try {
    const rows = await q(sql`SELECT key, value FROM system_settings WHERE key LIKE 'rfm_%'`);
    const overrides: any = {};
    for (const row of rows as any[]) {
      const k = row.key.replace("rfm_", "");
      overrides[k] = Number(row.value);
    }
    return { ...DEFAULT_THRESHOLDS, ...overrides };
  } catch { return DEFAULT_THRESHOLDS; }
}

router.get("/crm/rfm/thresholds", async (_req: Request, res: Response) => {
  const t = await getRfmThresholds();
  res.json(t);
});

router.put("/crm/rfm/thresholds", async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, number>;
    for (const [k, v] of Object.entries(updates)) {
      const key = `rfm_${k}`;
      await db.execute(sql`INSERT INTO system_settings (key, value, updated_at) VALUES (${key}, ${String(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CUSTOMER 360 TIMELINE ========================
router.get("/crm/customer360/timeline/:customerId", async (req: Request, res: Response) => {
  const customerId = Number(req.params.customerId);
  const customer = await q(sql`SELECT * FROM sales_customers WHERE id = ${customerId} LIMIT 1`);
  if (!customer[0]) { res.status(404).json({ error: "לקוח לא נמצא" }); return; }
  const cust = customer[0] as any;

  const [orders, invoices, complaints, timeline, entityActivities] = await Promise.all([
    q(sql`SELECT id, order_number, order_date, status, total, payment_status FROM sales_orders WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 50`),
    q(sql`SELECT id, invoice_number, invoice_date, status, total, payment_status FROM sales_invoices WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 50`),
    q(sql`SELECT id, complaint_number, subject, category, priority, status, created_at FROM customer_complaints WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 50`),
    q(sql`SELECT * FROM customer_interaction_timeline WHERE customer_id = ${customerId} ORDER BY event_date DESC LIMIT 100`),
    q(sql`
      SELECT er.id, er.created_at, er.status,
        (er.data->>'title')::text as title,
        (er.data->>'notes')::text as notes,
        (er.data->>'type')::text as activity_type,
        (er.data->>'summary')::text as summary,
        me.slug as entity_slug, me.name as entity_label
      FROM entity_records er
      JOIN module_entities me ON me.id = er.entity_id
      WHERE me.slug IN ('calls', 'interactions', 'crm-activity', 'activities', 'call_logs')
        AND (
          (er.data->>'customer_id')::text = ${String(customerId)}
          OR (er.data->>'customerId')::text = ${String(customerId)}
          OR (er.data->>'customer_name')::text = ${cust.name}
        )
      ORDER BY er.created_at DESC LIMIT 50
    `),
  ]);

  const payments = await q(sql`
    SELECT id, payment_number, payment_date, amount, payment_method
    FROM customer_payments
    WHERE customer_name = ${cust.name}
       OR (customer_tax_id IS NOT NULL AND customer_tax_id != '' AND customer_tax_id = ${cust.tax_id || ""})
    ORDER BY created_at DESC LIMIT 50
  `).catch(() => []);

  const events: any[] = [...(timeline as any[])];

  for (const o of orders as any[]) {
    events.push({ event_type: "order", event_date: o.order_date, title: `הזמנה ${o.order_number}`, description: `סטטוס: ${o.status} | תשלום: ${o.payment_status}`, reference_id: String(o.id), reference_type: "order", amount: o.total, status: o.status });
  }
  for (const inv of invoices as any[]) {
    events.push({ event_type: "invoice", event_date: inv.invoice_date, title: `חשבונית ${inv.invoice_number}`, description: `סטטוס: ${inv.status}`, reference_id: String(inv.id), reference_type: "invoice", amount: inv.total, status: inv.status });
  }
  for (const p of payments as any[]) {
    events.push({ event_type: "payment", event_date: p.payment_date, title: `תשלום ${p.payment_number || ""}`, description: `אמצעי: ${p.payment_method || ""}`, reference_id: String(p.id), reference_type: "payment", amount: p.amount, status: "completed" });
  }
  for (const c of complaints as any[]) {
    events.push({ event_type: "complaint", event_date: c.created_at, title: `תלונה: ${c.subject}`, description: `קטגוריה: ${c.category} | עדיפות: ${c.priority}`, reference_id: String(c.id), reference_type: "complaint", status: c.status });
  }
  for (const a of entityActivities as any[]) {
    events.push({ event_type: a.entity_slug || "activity", event_date: a.created_at, title: a.title || a.summary || `${a.entity_label || "פעילות"} #${a.id}`, description: a.notes || a.summary || "", reference_id: String(a.id), reference_type: a.entity_slug, status: a.status });
  }

  events.sort((a, b) => new Date(b.event_date || 0).getTime() - new Date(a.event_date || 0).getTime());
  res.json({ customer: cust, timeline: events });
});

// ======================== PROFITABILITY ANALYSIS ========================
router.get("/crm/customer360/profitability/:customerId", async (req: Request, res: Response) => {
  const customerId = Number(req.params.customerId);
  const customer = await q(sql`SELECT * FROM sales_customers WHERE id = ${customerId} LIMIT 1`);
  if (!customer[0]) { res.status(404).json({ error: "לקוח לא נמצא" }); return; }
  const cust = customer[0] as any;

  const [orderStats, invoiceStats] = await Promise.all([
    q(sql`SELECT COUNT(*) as order_count, COALESCE(SUM(total),0) as total_revenue, COALESCE(SUM(total) FILTER(WHERE status NOT IN ('cancelled')),0) as confirmed_revenue, COALESCE(AVG(total) FILTER(WHERE status NOT IN ('cancelled')),0) as avg_order_value, MIN(order_date) as first_order, MAX(order_date) as last_order FROM sales_orders WHERE customer_id = ${customerId}`),
    q(sql`SELECT COUNT(*) as invoice_count, COALESCE(SUM(total),0) as invoiced_total, COALESCE(SUM(total) FILTER(WHERE payment_status='paid'),0) as paid_total, COALESCE(SUM(total) FILTER(WHERE payment_status='unpaid'),0) as outstanding FROM sales_invoices WHERE customer_id = ${customerId}`),
  ]);

  const paymentStats = await q(sql`
    SELECT COALESCE(SUM(amount),0) as total_paid
    FROM customer_payments
    WHERE customer_name = ${cust.name}
       OR (customer_tax_id IS NOT NULL AND customer_tax_id != '' AND customer_tax_id = ${cust.tax_id || ""})
  `).catch(() => [{ total_paid: 0 }]);

  const revenue = Number(orderStats[0]?.confirmed_revenue || 0);
  const cogs = revenue * 0.65;
  const grossMargin = revenue - cogs;
  const grossMarginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
  const orderCount = Number(orderStats[0]?.order_count || 0);
  const avgOrderValue = Number(orderStats[0]?.avg_order_value || 0);
  const daysSinceFirst = orderStats[0]?.first_order ? Math.floor((Date.now() - new Date(orderStats[0].first_order).getTime()) / 86400000) : 0;

  res.json({ customer: cust, profitability: { revenue, cogs, gross_margin: grossMargin, gross_margin_pct: grossMarginPct, lifetime_value: revenue, order_count: orderCount, avg_order_value: avgOrderValue, invoiced_total: Number(invoiceStats[0]?.invoiced_total || 0), paid_total: Number(invoiceStats[0]?.paid_total || 0), outstanding: Number(invoiceStats[0]?.outstanding || 0), total_paid: Number(paymentStats[0]?.total_paid || 0), customer_since_days: daysSinceFirst, first_order: orderStats[0]?.first_order, last_order: orderStats[0]?.last_order } });
});

// ======================== RFM ANALYSIS ENGINE ========================
async function runRfmCalculation(): Promise<number> {
  const t = await getRfmThresholds();
  const customers = await q(sql`SELECT id, name FROM sales_customers WHERE status = 'active'`);
  let processed = 0;

  for (const cust of customers as any[]) {
    const [recencyRow, frequencyRow, monetaryRow] = await Promise.all([
      q(sql`SELECT COALESCE(MIN(EXTRACT(DAY FROM NOW() - MAX(order_date)::timestamptz)), 999) as recency_days FROM sales_orders WHERE customer_id = ${cust.id} AND status NOT IN ('cancelled')`),
      q(sql`SELECT COUNT(*) as freq FROM sales_orders WHERE customer_id = ${cust.id} AND status NOT IN ('cancelled')`),
      q(sql`SELECT COALESCE(SUM(total), 0) as monetary FROM sales_orders WHERE customer_id = ${cust.id} AND status NOT IN ('cancelled')`),
    ]);

    const recencyDays = Number(recencyRow[0]?.recency_days || 999);
    const frequency = Number(frequencyRow[0]?.freq || 0);
    const monetary = Number(monetaryRow[0]?.monetary || 0);

    const rScore = recencyDays <= t.r_30 ? 5 : recencyDays <= t.r_60 ? 4 : recencyDays <= t.r_90 ? 3 : recencyDays <= t.r_180 ? 2 : 1;
    const fScore = frequency >= t.f_20 ? 5 : frequency >= t.f_10 ? 4 : frequency >= t.f_5 ? 3 : frequency >= t.f_2 ? 2 : 1;
    const mScore = monetary >= t.m_500k ? 5 : monetary >= t.m_100k ? 4 : monetary >= t.m_50k ? 3 : monetary >= t.m_10k ? 2 : 1;
    const rfmTotal = rScore + fScore + mScore;

    let tier: string;
    if (rfmTotal >= t.vip_min) tier = "VIP";
    else if (rfmTotal >= t.gold_min) tier = "Gold";
    else if (rfmTotal >= t.silver_min) tier = "Silver";
    else tier = "Bronze";

    const existing = await q(sql`SELECT tier FROM customer_rfm_scores WHERE customer_id = ${cust.id} LIMIT 1`);
    const prevTier = existing[0]?.tier || null;

    await db.execute(sql`
      INSERT INTO customer_rfm_scores (customer_id, customer_name, recency_days, frequency_count, monetary_total, r_score, f_score, m_score, rfm_total, tier, previous_tier, tier_changed_at, calculated_at, updated_at)
      VALUES (${cust.id}, ${cust.name}, ${recencyDays}, ${frequency}, ${monetary}, ${rScore}, ${fScore}, ${mScore}, ${rfmTotal}, ${tier}, ${prevTier}, ${prevTier && prevTier !== tier ? new Date().toISOString() : null}, NOW(), NOW())
      ON CONFLICT (customer_id) DO UPDATE SET
        customer_name=EXCLUDED.customer_name, recency_days=EXCLUDED.recency_days,
        frequency_count=EXCLUDED.frequency_count, monetary_total=EXCLUDED.monetary_total,
        r_score=EXCLUDED.r_score, f_score=EXCLUDED.f_score, m_score=EXCLUDED.m_score,
        rfm_total=EXCLUDED.rfm_total, tier=EXCLUDED.tier,
        previous_tier=CASE WHEN customer_rfm_scores.tier != EXCLUDED.tier THEN customer_rfm_scores.tier ELSE customer_rfm_scores.previous_tier END,
        tier_changed_at=CASE WHEN customer_rfm_scores.tier != EXCLUDED.tier THEN NOW() ELSE customer_rfm_scores.tier_changed_at END,
        calculated_at=NOW(), updated_at=NOW()
    `);

    await db.execute(sql`UPDATE sales_customers SET rfm_r_score=${rScore}, rfm_f_score=${fScore}, rfm_m_score=${mScore}, rfm_tier=${tier}, rfm_total=${rfmTotal}, updated_at=NOW() WHERE id=${cust.id}`);

    await db.execute(sql`
      INSERT INTO customer_rfm_score_history (customer_id, customer_name, recency_days, frequency_count, monetary_total, r_score, f_score, m_score, rfm_total, tier, snapshot_date, calculated_at)
      VALUES (${cust.id}, ${cust.name}, ${recencyDays}, ${frequency}, ${monetary}, ${rScore}, ${fScore}, ${mScore}, ${rfmTotal}, ${tier}, CURRENT_DATE, NOW())
      ON CONFLICT (customer_id, snapshot_date) DO UPDATE SET
        tier=EXCLUDED.tier, rfm_total=EXCLUDED.rfm_total, r_score=EXCLUDED.r_score,
        f_score=EXCLUDED.f_score, m_score=EXCLUDED.m_score, calculated_at=NOW()
    `);

    processed++;
  }
  return processed;
}

router.post("/crm/rfm/calculate", async (req: Request, res: Response) => {
  try {
    const processed = await runRfmCalculation();
    res.json({ success: true, processed });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/crm/rfm/scores", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT r.*, sc.email, sc.phone FROM customer_rfm_scores r LEFT JOIN sales_customers sc ON sc.id = r.customer_id ORDER BY r.rfm_total DESC`);
  res.json(rows);
});

// Daily RFM auto-calculation scheduler
function scheduleRfmAutoCalculation() {
  const now = new Date();
  const nextRun = new Date();
  nextRun.setHours(3, 0, 0, 0);
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
  const msUntilNext = nextRun.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      const processed = await runRfmCalculation();
      console.log(`[RFM-Scheduler] Daily auto-calculation completed: ${processed} customers processed`);
    } catch (e: any) {
      console.error("[RFM-Scheduler] Auto-calculation failed:", e.message);
    }
    setInterval(async () => {
      try {
        const processed = await runRfmCalculation();
        console.log(`[RFM-Scheduler] Daily auto-calculation: ${processed} customers`);
      } catch (e: any) {
        console.error("[RFM-Scheduler] Auto-calculation failed:", e.message);
      }
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext);

  console.log(`[RFM-Scheduler] Next auto-calculation scheduled at ${nextRun.toISOString()}`);
}

scheduleRfmAutoCalculation();

// ======================== SEGMENTATION DASHBOARD ========================
router.get("/crm/segmentation/dashboard", async (_req: Request, res: Response) => {
  const [tierDist, topByTier, migrations, overall, monthlyTrends] = await Promise.all([
    q(sql`SELECT tier, COUNT(*) as count, COALESCE(SUM(monetary_total),0) as total_revenue, COALESCE(AVG(rfm_total),0) as avg_rfm FROM customer_rfm_scores GROUP BY tier ORDER BY avg_rfm DESC`),
    q(sql`SELECT r.*, sc.phone, sc.email FROM customer_rfm_scores r LEFT JOIN sales_customers sc ON sc.id = r.customer_id ORDER BY monetary_total DESC LIMIT 20`),
    q(sql`SELECT previous_tier, tier as new_tier, COUNT(*) as count FROM customer_rfm_scores WHERE previous_tier IS NOT NULL AND tier != previous_tier GROUP BY previous_tier, tier ORDER BY count DESC`),
    q(sql`SELECT COUNT(*) as total, COALESCE(SUM(monetary_total),0) as total_revenue FROM customer_rfm_scores`),
    q(sql`
      SELECT TO_CHAR(snapshot_date, 'YYYY-MM') as month, tier, COUNT(DISTINCT customer_id) as count
      FROM customer_rfm_score_history
      WHERE snapshot_date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY month, tier ORDER BY month ASC, tier ASC
    `),
  ]);

  const tierOrder: Record<string, number> = { VIP: 0, Gold: 1, Silver: 2, Bronze: 3 };
  const sortedTiers = [...(tierDist as any[])].sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9));

  const monthMap: Record<string, any> = {};
  for (const row of monthlyTrends as any[]) {
    if (!monthMap[row.month]) monthMap[row.month] = { month: row.month, VIP: 0, Gold: 0, Silver: 0, Bronze: 0 };
    monthMap[row.month][row.tier] = Number(row.count);
  }
  const chartData = Object.values(monthMap).sort((a, b) => a.month > b.month ? 1 : -1);

  res.json({ tier_distribution: sortedTiers, top_customers: topByTier, tier_migrations: migrations, overall: overall[0] || { total: 0, total_revenue: 0 }, monthly_trends: monthlyTrends, chart_data: chartData });
});

// ======================== COMPLAINTS MANAGEMENT ========================
router.get("/crm/complaints", async (req: Request, res: Response) => {
  const { customerId } = req.query;
  if (customerId) {
    const rows = await q(sql`SELECT * FROM customer_complaints WHERE customer_id = ${Number(customerId)} ORDER BY created_at DESC`);
    res.json(rows);
  } else {
    const rows = await q(sql`SELECT * FROM customer_complaints ORDER BY created_at DESC LIMIT 200`);
    res.json(rows);
  }
});

router.post("/crm/complaints", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const countRes = await q(sql`SELECT COALESCE(MAX(id),0)+1 as n FROM customer_complaints`);
    const num = `CMP-${new Date().getFullYear()}-${String(countRes[0]?.n || 1).padStart(4, "0")}`;
    await db.execute(sql`INSERT INTO customer_complaints (complaint_number, customer_id, customer_name, subject, description, category, priority, status, assigned_to, notes) VALUES (${num}, ${d.customerId || null}, ${d.customerName || null}, ${d.subject}, ${d.description || null}, ${d.category || 'general'}, ${d.priority || 'medium'}, ${d.status || 'open'}, ${d.assignedTo || null}, ${d.notes || null})`);
    res.json({ success: true, complaint_number: num });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm/complaints/:id", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE customer_complaints SET subject=${d.subject}, description=${d.description}, category=${d.category}, priority=${d.priority}, status=${d.status}, assigned_to=${d.assignedTo || null}, resolution=${d.resolution || null}, resolved_at=${d.status === 'resolved' ? new Date().toISOString() : null}, satisfaction_rating=${d.satisfactionRating || null}, notes=${d.notes || null}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm/complaints/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM customer_complaints WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== PORTAL USER MANAGEMENT (Internal) ========================
router.get("/crm/portal-users", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT u.*, sc.name as customer_display_name FROM customer_portal_users u LEFT JOIN sales_customers sc ON sc.id = u.customer_id ORDER BY u.created_at DESC`);
  res.json(rows);
});

router.post("/crm/portal-users/invite", async (req: Request, res: Response) => {
  try {
    const { customerId, email, fullName } = req.body;
    const customer = await q(sql`SELECT * FROM sales_customers WHERE id = ${Number(customerId)} LIMIT 1`);
    if (!customer[0]) { res.status(404).json({ error: "לקוח לא נמצא" }); return; }
    const cust = customer[0] as any;
    const inviteToken = crypto.randomBytes(24).toString("hex");
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.execute(sql`
      INSERT INTO customer_portal_users (customer_id, customer_name, email, password_hash, full_name, is_active, invite_token, invite_expires, invite_used)
      VALUES (${cust.id}, ${cust.name}, ${email.toLowerCase()}, '', ${fullName || cust.name}, FALSE, ${inviteToken}, ${inviteExpires.toISOString()}, FALSE)
      ON CONFLICT (email) DO UPDATE SET
        invite_token=${inviteToken}, invite_expires=${inviteExpires.toISOString()}, invite_used=FALSE,
        customer_id=${cust.id}, customer_name=${cust.name}, is_active=FALSE
    `);
    res.json({ success: true, invite_token: inviteToken, invite_url: `/portal/customer/login?token=${inviteToken}` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/crm/portal-users/:id/toggle", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE customer_portal_users SET is_active = NOT is_active, updated_at=NOW() WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/crm/portal-users/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM customer_portal_users WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== PORTAL SESSION HELPER ========================
async function getPortalUser(token: string): Promise<any | null> {
  const sessions = await q(sql`
    SELECT s.user_id, s.expires_at, u.customer_id, u.customer_name, u.email, u.full_name, u.is_active
    FROM portal_customer_sessions s
    JOIN customer_portal_users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > NOW()
    LIMIT 1
  `);
  if (!sessions[0]) return null;
  const s = sessions[0] as any;
  if (!s.is_active) return null;
  return s;
}

// ======================== CUSTOMER PORTAL AUTH (public) ========================
router.post("/portal/customer/register", async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, phone, inviteToken } = req.body;
    if (!email || !password) { res.status(400).json({ error: "אימייל וסיסמה נדרשים" }); return; }
    if (password.length < 8) { res.status(400).json({ error: "הסיסמה חייבת להכיל לפחות 8 תווים" }); return; }

    const emailLower = email.toLowerCase();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    if (inviteToken) {
      const invite = await q(sql`
        SELECT * FROM customer_portal_users
        WHERE invite_token = ${inviteToken}
          AND invite_used = FALSE
          AND (invite_expires IS NULL OR invite_expires > NOW())
        LIMIT 1
      `);
      if (invite[0]) {
        const invitedUser = invite[0] as any;
        if (invitedUser.email !== emailLower) {
          res.status(400).json({ error: "האימייל אינו תואם להזמנה" }); return;
        }
        await db.execute(sql`
          UPDATE customer_portal_users
          SET password_hash=${passwordHash}, full_name=${fullName || invitedUser.full_name},
            phone=${phone || null}, is_active=TRUE, invite_used=TRUE, updated_at=NOW()
          WHERE id=${invitedUser.id}
        `);
        const user = { id: invitedUser.id, email: invitedUser.email, full_name: fullName || invitedUser.full_name, customer_id: invitedUser.customer_id, customer_name: invitedUser.customer_name };
        const token = crypto.randomBytes(32).toString("hex");
        await db.execute(sql`INSERT INTO portal_customer_sessions (token, user_id, expires_at) VALUES (${token}, ${user.id}, NOW() + INTERVAL '7 days')`);
        res.json({ success: true, token, user });
        return;
      }
    }

    const existing = await q(sql`SELECT id, invite_token, invite_used, is_active FROM customer_portal_users WHERE email = ${emailLower} LIMIT 1`);
    if (existing.length > 0) {
      const ex = existing[0] as any;
      if (ex.is_active) { res.status(400).json({ error: "אימייל כבר קיים במערכת" }); return; }
    }

    const result = await db.execute(sql`
      INSERT INTO customer_portal_users (customer_id, customer_name, email, password_hash, full_name, phone, is_active)
      VALUES (NULL, NULL, ${emailLower}, ${passwordHash}, ${fullName || emailLower}, ${phone || null}, TRUE)
      RETURNING id, email, full_name, customer_id, customer_name
    `);
    const user = (result.rows as any[])[0];
    const token = crypto.randomBytes(32).toString("hex");
    await db.execute(sql`INSERT INTO portal_customer_sessions (token, user_id, expires_at) VALUES (${token}, ${user.id}, NOW() + INTERVAL '7 days')`);
    res.json({ success: true, token, user: { id: user.id, email: user.email, full_name: user.full_name, customer_id: user.customer_id, customer_name: user.customer_name } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/portal/customer/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "אימייל וסיסמה נדרשים" }); return; }

    const users = await q(sql`SELECT * FROM customer_portal_users WHERE email = ${email.toLowerCase()} AND is_active = TRUE LIMIT 1`);
    if (!users[0]) { res.status(401).json({ error: "אימייל או סיסמה שגויים" }); return; }

    const user = users[0] as any;
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) { res.status(401).json({ error: "אימייל או סיסמה שגויים" }); return; }

    await db.execute(sql`UPDATE customer_portal_users SET last_login=NOW() WHERE id=${user.id}`);
    const token = crypto.randomBytes(32).toString("hex");
    await db.execute(sql`INSERT INTO portal_customer_sessions (token, user_id, expires_at) VALUES (${token}, ${user.id}, NOW() + INTERVAL '7 days')`);

    res.json({ success: true, token, user: { id: user.id, email: user.email, full_name: user.full_name, customer_id: user.customer_id, customer_name: user.customer_name } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/portal/customer/me", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const s = await getPortalUser(token);
    if (!s) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
    res.json({ id: s.user_id, email: s.email, full_name: s.full_name, customer_id: s.customer_id, customer_name: s.customer_name });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/portal/customer/logout", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) await db.execute(sql`DELETE FROM portal_customer_sessions WHERE token = ${token}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== PORTAL CUSTOMER DATA ========================
router.get("/portal/customer/orders", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const user = await getPortalUser(token);
    if (!user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
    const orders = await q(sql`SELECT id, order_number, order_date, status, total, payment_status, delivery_date, notes FROM sales_orders WHERE customer_id = ${user.customer_id} ORDER BY created_at DESC LIMIT 100`);
    res.json(orders);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/portal/customer/invoices", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const user = await getPortalUser(token);
    if (!user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
    const invoices = await q(sql`SELECT id, invoice_number, invoice_date, due_date, status, total, payment_status FROM sales_invoices WHERE customer_id = ${user.customer_id} ORDER BY created_at DESC LIMIT 100`);
    res.json(invoices);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/portal/customer/invoices/:id/download", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const user = await getPortalUser(token);
    if (!user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }

    const invoiceId = Number(req.params.id);
    const invoices = await q(sql`
      SELECT si.*, sc.name as customer_name_full, sc.address, sc.email as customer_email, sc.phone as customer_phone
      FROM sales_invoices si
      LEFT JOIN sales_customers sc ON sc.id = si.customer_id
      WHERE si.id = ${invoiceId} AND si.customer_id = ${user.customer_id}
      LIMIT 1
    `);
    if (!invoices[0]) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }

    const inv = invoices[0] as any;
    const items = await q(sql`SELECT * FROM sales_invoice_items WHERE invoice_id = ${invoiceId}`);

    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Invoice ${inv.invoice_number}`, Author: "ERP System" } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${inv.invoice_number}.pdf"`);
    doc.pipe(res);

    doc.fontSize(22).fillColor("#1a56db").text("Invoice / חשבונית מס", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#374151");
    doc.text(`Invoice Number: ${inv.invoice_number}`, { align: "right" });
    doc.text(`Date: ${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("he-IL") : "—"}`, { align: "right" });
    doc.text(`Due Date: ${inv.due_date ? new Date(inv.due_date).toLocaleDateString("he-IL") : "—"}`, { align: "right" });
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#111827").text("Customer / לקוח:", { underline: true });
    doc.fontSize(11).fillColor("#374151");
    doc.text(inv.customer_name_full || user.customer_name || "");
    if (inv.customer_email) doc.text(inv.customer_email);
    if (inv.customer_phone) doc.text(inv.customer_phone);
    if (inv.address) doc.text(inv.address);
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#111827").text("Items / פריטים:", { underline: true });
    doc.moveDown(0.3);

    const tableTop = doc.y;
    const colWidths = [250, 60, 80, 80];
    const headers = ["Description / תיאור", "Qty", "Unit Price", "Total"];
    let x = 50;
    doc.fontSize(10).fillColor("#1a56db");
    headers.forEach((h, i) => { doc.text(h, x, tableTop, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);

    for (const item of items as any[]) {
      const y = doc.y;
      x = 50;
      doc.fontSize(10).fillColor("#374151");
      const cols = [
        item.description || item.product_name || "",
        String(item.quantity || 0),
        `${Number(item.unit_price || 0).toFixed(2)} ILS`,
        `${Number(item.total || 0).toFixed(2)} ILS`,
      ];
      cols.forEach((c, i) => { doc.text(c, x, y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc.fontSize(13).fillColor("#111827").text(`Total: ${Number(inv.total || 0).toFixed(2)} ILS`, { align: "right" });
    doc.fontSize(10).fillColor("#6b7280").text(`Payment Status: ${inv.payment_status === 'paid' ? 'Paid' : 'Pending'}`, { align: "right" });
    doc.moveDown(2);
    doc.fontSize(9).fillColor("#9ca3af").text("Generated by ERP System", { align: "center" });
    doc.end();
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

router.get("/portal/customer/tickets", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const user = await getPortalUser(token);
    if (!user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
    const tickets = await q(sql`SELECT * FROM customer_portal_tickets WHERE portal_user_id = ${user.user_id} ORDER BY created_at DESC`);
    res.json(tickets);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/portal/customer/tickets", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const user = await getPortalUser(token);
    if (!user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }

    const { subject, description, category, priority } = req.body;
    const countRes = await q(sql`SELECT COALESCE(MAX(id),0)+1 as n FROM customer_portal_tickets`);
    const num = `PTKT-${new Date().getFullYear()}-${String(countRes[0]?.n || 1).padStart(4, "0")}`;
    await db.execute(sql`INSERT INTO customer_portal_tickets (ticket_number, portal_user_id, customer_id, customer_name, subject, description, category, priority, status)
      VALUES (${num}, ${user.user_id}, ${user.customer_id}, ${user.customer_name}, ${subject}, ${description || null}, ${category || 'general'}, ${priority || 'medium'}, 'open')`);
    res.json({ success: true, ticket_number: num });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
