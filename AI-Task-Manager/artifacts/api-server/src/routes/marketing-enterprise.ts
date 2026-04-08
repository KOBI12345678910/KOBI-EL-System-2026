import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Marketing-Enterprise query error:", e.message); return []; }
}

// ========== CAMPAIGNS ==========
router.get("/marketing/campaigns", async (_req, res) => {
  res.json(await q(`SELECT * FROM marketing_campaigns ORDER BY created_at DESC`));
});

router.get("/marketing/campaigns/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='פעיל') as active,
    COALESCE(AVG(CASE WHEN actual_spend > 0 THEN ((revenue::float - actual_spend::float) / actual_spend::float) * 100 END), 0) as avg_roi,
    COALESCE(SUM(actual_spend::float), 0) as total_spend,
    COALESCE(SUM(leads_count), 0) as total_leads,
    COALESCE(SUM(conversions), 0) as total_conversions,
    COALESCE(SUM(revenue::float), 0) as total_revenue
  FROM marketing_campaigns`);
  res.json(rows[0] || {});
});

router.post("/marketing/campaigns", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO marketing_campaigns (campaign_name, description, channel, target_audience, budget, actual_spend, start_date, end_date, leads_count, conversions, revenue, roi, manager, status, notes)
    VALUES (${s(d.campaignName)}, ${s(d.description)}, ${s(d.channel)}, ${s(d.targetAudience)}, ${d.budget||0}, ${d.actualSpend||0}, ${d.startDate ? `'${d.startDate}'` : 'NULL'}, ${d.endDate ? `'${d.endDate}'` : 'NULL'}, ${d.leadsCount||0}, ${d.conversions||0}, ${d.revenue||0}, ${d.roi||0}, ${s(d.manager)}, ${s(d.status||'פעיל')}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/marketing/campaigns/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.campaignName) sets.push(`campaign_name=${s(d.campaignName)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.channel) sets.push(`channel=${s(d.channel)}`);
  if (d.targetAudience !== undefined) sets.push(`target_audience=${s(d.targetAudience)}`);
  if (d.budget !== undefined) sets.push(`budget=${d.budget}`);
  if (d.actualSpend !== undefined) sets.push(`actual_spend=${d.actualSpend}`);
  if (d.startDate) sets.push(`start_date='${d.startDate}'`);
  if (d.endDate) sets.push(`end_date='${d.endDate}'`);
  if (d.leadsCount !== undefined) sets.push(`leads_count=${d.leadsCount}`);
  if (d.conversions !== undefined) sets.push(`conversions=${d.conversions}`);
  if (d.revenue !== undefined) sets.push(`revenue=${d.revenue}`);
  if (d.roi !== undefined) sets.push(`roi=${d.roi}`);
  if (d.manager !== undefined) sets.push(`manager=${s(d.manager)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE marketing_campaigns SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM marketing_campaigns WHERE id=${req.params.id}`))[0]);
});

router.delete("/marketing/campaigns/:id", async (req, res) => {
  await q(`DELETE FROM marketing_campaigns WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== CONTENT CALENDAR ==========
router.get("/marketing/content-calendar", async (_req, res) => {
  res.json(await q(`SELECT * FROM content_calendar ORDER BY planned_date ASC, created_at DESC`));
});

router.get("/marketing/content-calendar/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='פורסם' AND planned_date >= date_trunc('month', CURRENT_DATE)) as published_this_month,
    COUNT(*) FILTER (WHERE status='מתוכנן') as planned,
    COUNT(DISTINCT channel) as active_channels
  FROM content_calendar`);
  res.json(rows[0] || {});
});

router.post("/marketing/content-calendar", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO content_calendar (content_title, content_type, channel, planned_date, publish_time, content_text, creative_link, assignee, status, notes)
    VALUES (${s(d.contentTitle)}, ${s(d.contentType)}, ${s(d.channel)}, ${d.plannedDate ? `'${d.plannedDate}'` : 'NULL'}, ${s(d.publishTime)}, ${s(d.contentText)}, ${s(d.creativeLink)}, ${s(d.assignee)}, ${s(d.status||'מתוכנן')}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/marketing/content-calendar/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.contentTitle) sets.push(`content_title=${s(d.contentTitle)}`);
  if (d.contentType) sets.push(`content_type=${s(d.contentType)}`);
  if (d.channel) sets.push(`channel=${s(d.channel)}`);
  if (d.plannedDate) sets.push(`planned_date='${d.plannedDate}'`);
  if (d.publishTime !== undefined) sets.push(`publish_time=${s(d.publishTime)}`);
  if (d.contentText !== undefined) sets.push(`content_text=${s(d.contentText)}`);
  if (d.creativeLink !== undefined) sets.push(`creative_link=${s(d.creativeLink)}`);
  if (d.assignee !== undefined) sets.push(`assignee=${s(d.assignee)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE content_calendar SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM content_calendar WHERE id=${req.params.id}`))[0]);
});

router.delete("/marketing/content-calendar/:id", async (req, res) => {
  await q(`DELETE FROM content_calendar WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== SOCIAL MEDIA ==========
router.get("/marketing/social-media", async (_req, res) => {
  res.json(await q(`SELECT * FROM social_media_metrics ORDER BY metric_date DESC, created_at DESC`));
});

router.get("/marketing/social-media/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COALESCE(SUM(followers), 0) as total_followers,
    COALESCE(AVG(engagement::float), 0) as avg_engagement,
    COALESCE(SUM(reach), 0) as total_reach,
    COUNT(DISTINCT platform) as platforms_count,
    (SELECT platform FROM social_media_metrics GROUP BY platform ORDER BY SUM(followers) DESC LIMIT 1) as top_platform
  FROM social_media_metrics`);
  res.json(rows[0] || {});
});

router.post("/marketing/social-media", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO social_media_metrics (platform, account_name, followers, followers_change, posts, engagement, reach, impressions, clicks, shares, metric_date, notes)
    VALUES (${s(d.platform)}, ${s(d.accountName)}, ${d.followers||0}, ${d.followersChange||0}, ${d.posts||0}, ${d.engagement||0}, ${d.reach||0}, ${d.impressions||0}, ${d.clicks||0}, ${d.shares||0}, ${d.metricDate ? `'${d.metricDate}'` : 'NULL'}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/marketing/social-media/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.platform) sets.push(`platform=${s(d.platform)}`);
  if (d.accountName !== undefined) sets.push(`account_name=${s(d.accountName)}`);
  if (d.followers !== undefined) sets.push(`followers=${d.followers}`);
  if (d.followersChange !== undefined) sets.push(`followers_change=${d.followersChange}`);
  if (d.posts !== undefined) sets.push(`posts=${d.posts}`);
  if (d.engagement !== undefined) sets.push(`engagement=${d.engagement}`);
  if (d.reach !== undefined) sets.push(`reach=${d.reach}`);
  if (d.impressions !== undefined) sets.push(`impressions=${d.impressions}`);
  if (d.clicks !== undefined) sets.push(`clicks=${d.clicks}`);
  if (d.shares !== undefined) sets.push(`shares=${d.shares}`);
  if (d.metricDate) sets.push(`metric_date='${d.metricDate}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE social_media_metrics SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM social_media_metrics WHERE id=${req.params.id}`))[0]);
});

router.delete("/marketing/social-media/:id", async (req, res) => {
  await q(`DELETE FROM social_media_metrics WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== EMAIL MARKETING ==========
router.get("/marketing/email", async (_req, res) => {
  res.json(await q(`SELECT * FROM email_marketing ORDER BY send_date DESC, created_at DESC`));
});

router.get("/marketing/email/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE send_date >= date_trunc('month', CURRENT_DATE)) as sent_this_month,
    COALESCE(AVG(open_rate::float), 0) as avg_open_rate,
    COALESCE(AVG(click_rate::float), 0) as avg_click_rate,
    COALESCE(SUM(recipients), 0) as total_subscribers
  FROM email_marketing`);
  res.json(rows[0] || {});
});

router.post("/marketing/email", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO email_marketing (campaign_name, subject, list_name, recipients, sent, delivered, opens, clicks, bounces, unsubscribes, open_rate, click_rate, send_date, status, notes)
    VALUES (${s(d.campaignName)}, ${s(d.subject)}, ${s(d.listName)}, ${d.recipients||0}, ${d.sent||0}, ${d.delivered||0}, ${d.opens||0}, ${d.clicks||0}, ${d.bounces||0}, ${d.unsubscribes||0}, ${d.openRate||0}, ${d.clickRate||0}, ${d.sendDate ? `'${d.sendDate}'` : 'NULL'}, ${s(d.status||'טיוטה')}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/marketing/email/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.campaignName) sets.push(`campaign_name=${s(d.campaignName)}`);
  if (d.subject !== undefined) sets.push(`subject=${s(d.subject)}`);
  if (d.listName !== undefined) sets.push(`list_name=${s(d.listName)}`);
  if (d.recipients !== undefined) sets.push(`recipients=${d.recipients}`);
  if (d.sent !== undefined) sets.push(`sent=${d.sent}`);
  if (d.delivered !== undefined) sets.push(`delivered=${d.delivered}`);
  if (d.opens !== undefined) sets.push(`opens=${d.opens}`);
  if (d.clicks !== undefined) sets.push(`clicks=${d.clicks}`);
  if (d.bounces !== undefined) sets.push(`bounces=${d.bounces}`);
  if (d.unsubscribes !== undefined) sets.push(`unsubscribes=${d.unsubscribes}`);
  if (d.openRate !== undefined) sets.push(`open_rate=${d.openRate}`);
  if (d.clickRate !== undefined) sets.push(`click_rate=${d.clickRate}`);
  if (d.sendDate) sets.push(`send_date='${d.sendDate}'`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE email_marketing SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM email_marketing WHERE id=${req.params.id}`))[0]);
});

router.delete("/marketing/email/:id", async (req, res) => {
  await q(`DELETE FROM email_marketing WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== MARKETING BUDGET ==========
router.get("/marketing/budget", async (_req, res) => {
  res.json(await q(`SELECT * FROM marketing_budget ORDER BY year DESC, month ASC, created_at DESC`));
});

router.get("/marketing/budget/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COALESCE(SUM(planned_budget::float), 0) as total_budget,
    COALESCE(SUM(actual_spend::float), 0) as total_spent,
    COALESCE(SUM(planned_budget::float) - SUM(actual_spend::float), 0) as total_remaining,
    CASE WHEN SUM(actual_spend::float) > 0 THEN COALESCE(AVG(roi::float), 0) ELSE 0 END as overall_roi
  FROM marketing_budget`);
  res.json(rows[0] || {});
});

router.post("/marketing/budget", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO marketing_budget (budget_name, channel, campaign_ref, month, year, planned_budget, actual_spend, remaining, roi, status, approved_by, notes)
    VALUES (${s(d.budgetName)}, ${s(d.channel)}, ${s(d.campaignRef)}, ${s(d.month)}, ${d.year || new Date().getFullYear()}, ${d.plannedBudget||0}, ${d.actualSpend||0}, ${d.remaining||0}, ${d.roi||0}, ${s(d.status||'פעיל')}, ${s(d.approvedBy)}, ${s(d.notes)})`);
  res.json({ success: true });
});

router.put("/marketing/budget/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.budgetName) sets.push(`budget_name=${s(d.budgetName)}`);
  if (d.channel !== undefined) sets.push(`channel=${s(d.channel)}`);
  if (d.campaignRef !== undefined) sets.push(`campaign_ref=${s(d.campaignRef)}`);
  if (d.month !== undefined) sets.push(`month=${s(d.month)}`);
  if (d.year !== undefined) sets.push(`year=${d.year}`);
  if (d.plannedBudget !== undefined) sets.push(`planned_budget=${d.plannedBudget}`);
  if (d.actualSpend !== undefined) sets.push(`actual_spend=${d.actualSpend}`);
  if (d.remaining !== undefined) sets.push(`remaining=${d.remaining}`);
  if (d.roi !== undefined) sets.push(`roi=${d.roi}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.approvedBy !== undefined) sets.push(`approved_by=${s(d.approvedBy)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  if (sets.length) await q(`UPDATE marketing_budget SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM marketing_budget WHERE id=${req.params.id}`))[0]);
});

router.delete("/marketing/budget/:id", async (req, res) => {
  await q(`DELETE FROM marketing_budget WHERE id=${req.params.id}`);
  res.json({ success: true });
});

export default router;
