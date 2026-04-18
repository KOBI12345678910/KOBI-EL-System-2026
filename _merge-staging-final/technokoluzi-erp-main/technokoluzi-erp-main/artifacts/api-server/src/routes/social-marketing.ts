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
  catch (e: any) { console.error("Social-Marketing query error:", e.message); return []; }
}

const s = (v: any) => v !== undefined && v !== null ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any, def = 0) => Number(v) || def;

// ========== AUTO-CREATE TABLES ==========
(async () => {
  await q(`CREATE TABLE IF NOT EXISTS social_accounts (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL DEFAULT 'facebook',
    account_name VARCHAR(255),
    account_id VARCHAR(255),
    access_token_encrypted TEXT,
    status VARCHAR(30) DEFAULT 'connected',
    followers_count INT DEFAULT 0,
    last_synced TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS social_posts (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES social_accounts(id) ON DELETE SET NULL,
    campaign_id INT,
    content TEXT,
    media_urls JSONB DEFAULT '[]'::jsonb,
    post_type VARCHAR(30) DEFAULT 'image',
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'draft',
    likes INT DEFAULT 0,
    comments INT DEFAULT 0,
    shares INT DEFAULT 0,
    reach INT DEFAULT 0,
    clicks INT DEFAULT 0,
    leads_generated INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS social_campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    goal VARCHAR(50) DEFAULT 'brand_awareness',
    platforms JSONB DEFAULT '[]'::jsonb,
    budget NUMERIC(12,2) DEFAULT 0,
    spent NUMERIC(12,2) DEFAULT 0,
    leads_target INT DEFAULT 0,
    leads_actual INT DEFAULT 0,
    status VARCHAR(30) DEFAULT 'planning',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS social_leads (
    id SERIAL PRIMARY KEY,
    campaign_id INT,
    platform VARCHAR(50),
    name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    message TEXT,
    source_post_id INT,
    status VARCHAR(30) DEFAULT 'new',
    assigned_agent_id INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS social_analytics (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES social_accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    followers INT DEFAULT 0,
    engagement_rate REAL DEFAULT 0,
    reach INT DEFAULT 0,
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    leads INT DEFAULT 0,
    cost_per_lead NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log("[Social-Marketing] Tables ready");
})();

// ========== SOCIAL ACCOUNTS ==========
router.get("/social/accounts", async (_req, res) => {
  res.json(await q(`SELECT id, platform, account_name, account_id, status, followers_count, last_synced, created_at, updated_at FROM social_accounts ORDER BY created_at DESC`));
});

router.post("/social/accounts", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO social_accounts (platform, account_name, account_id, access_token_encrypted, status, followers_count)
    VALUES (${s(d.platform)}, ${s(d.accountName)}, ${s(d.accountId)}, ${s(d.accessToken)}, ${s(d.status || 'connected')}, ${n(d.followersCount)})`);
  res.json({ success: true });
});

router.put("/social/accounts/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.platform) sets.push(`platform=${s(d.platform)}`);
  if (d.accountName) sets.push(`account_name=${s(d.accountName)}`);
  if (d.accountId) sets.push(`account_id=${s(d.accountId)}`);
  if (d.accessToken) sets.push(`access_token_encrypted=${s(d.accessToken)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.followersCount !== undefined) sets.push(`followers_count=${n(d.followersCount)}`);
  sets.push(`last_synced=NOW()`, `updated_at=NOW()`);
  await q(`UPDATE social_accounts SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM social_accounts WHERE id=${req.params.id}`))[0]);
});

router.delete("/social/accounts/:id", async (req, res) => {
  await q(`DELETE FROM social_accounts WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== SOCIAL POSTS ==========
router.get("/social/posts", async (_req, res) => {
  res.json(await q(`SELECT p.*, a.platform, a.account_name, c.name as campaign_name
    FROM social_posts p
    LEFT JOIN social_accounts a ON p.account_id = a.id
    LEFT JOIN social_campaigns c ON p.campaign_id = c.id
    ORDER BY COALESCE(p.scheduled_at, p.created_at) DESC`));
});

router.post("/social/posts", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO social_posts (account_id, campaign_id, content, media_urls, post_type, scheduled_at, status)
    VALUES (${d.accountId || 'NULL'}, ${d.campaignId || 'NULL'}, ${s(d.content)}, ${s(JSON.stringify(d.mediaUrls || []))}, ${s(d.postType || 'image')}, ${d.scheduledAt ? `'${d.scheduledAt}'` : 'NULL'}, ${s(d.status || 'draft')})`);
  res.json({ success: true });
});

router.put("/social/posts/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.accountId !== undefined) sets.push(`account_id=${d.accountId || 'NULL'}`);
  if (d.campaignId !== undefined) sets.push(`campaign_id=${d.campaignId || 'NULL'}`);
  if (d.content !== undefined) sets.push(`content=${s(d.content)}`);
  if (d.mediaUrls) sets.push(`media_urls=${s(JSON.stringify(d.mediaUrls))}`);
  if (d.postType) sets.push(`post_type=${s(d.postType)}`);
  if (d.scheduledAt) sets.push(`scheduled_at='${d.scheduledAt}'`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.likes !== undefined) sets.push(`likes=${n(d.likes)}`);
  if (d.comments !== undefined) sets.push(`comments=${n(d.comments)}`);
  if (d.shares !== undefined) sets.push(`shares=${n(d.shares)}`);
  if (d.reach !== undefined) sets.push(`reach=${n(d.reach)}`);
  if (d.clicks !== undefined) sets.push(`clicks=${n(d.clicks)}`);
  if (d.leadsGenerated !== undefined) sets.push(`leads_generated=${n(d.leadsGenerated)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE social_posts SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM social_posts WHERE id=${req.params.id}`))[0]);
});

router.delete("/social/posts/:id", async (req, res) => {
  await q(`DELETE FROM social_posts WHERE id=${req.params.id}`);
  res.json({ success: true });
});

router.post("/social/posts/:id/publish", async (req, res) => {
  await q(`UPDATE social_posts SET status='published', published_at=NOW(), updated_at=NOW() WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM social_posts WHERE id=${req.params.id}`))[0]);
});

router.post("/social/posts/:id/schedule", async (req, res) => {
  const d = req.body;
  await q(`UPDATE social_posts SET status='scheduled', scheduled_at=${d.scheduledAt ? `'${d.scheduledAt}'` : 'NOW() + INTERVAL \'1 hour\''}, updated_at=NOW() WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM social_posts WHERE id=${req.params.id}`))[0]);
});

// ========== SOCIAL CAMPAIGNS ==========
router.get("/social/campaigns", async (_req, res) => {
  res.json(await q(`SELECT sc.*,
    COALESCE((SELECT COUNT(*) FROM social_posts sp WHERE sp.campaign_id = sc.id), 0) as posts_count,
    COALESCE((SELECT COUNT(*) FROM social_leads sl WHERE sl.campaign_id = sc.id), 0) as leads_count
    FROM social_campaigns sc ORDER BY sc.created_at DESC`));
});

router.get("/social/campaigns/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COALESCE(SUM(budget), 0) as total_budget,
    COALESCE(SUM(spent), 0) as total_spent,
    COALESCE(SUM(leads_actual), 0) as total_leads,
    COALESCE(SUM(leads_target), 0) as total_leads_target
  FROM social_campaigns`);
  res.json(rows[0] || {});
});

router.post("/social/campaigns", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO social_campaigns (name, goal, platforms, budget, spent, leads_target, leads_actual, status, start_date, end_date)
    VALUES (${s(d.name)}, ${s(d.goal || 'brand_awareness')}, ${s(JSON.stringify(d.platforms || []))}, ${n(d.budget)}, ${n(d.spent)}, ${n(d.leadsTarget)}, ${n(d.leadsActual)}, ${s(d.status || 'planning')}, ${d.startDate ? `'${d.startDate}'` : 'NULL'}, ${d.endDate ? `'${d.endDate}'` : 'NULL'})`);
  res.json({ success: true });
});

router.put("/social/campaigns/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.goal) sets.push(`goal=${s(d.goal)}`);
  if (d.platforms) sets.push(`platforms=${s(JSON.stringify(d.platforms))}`);
  if (d.budget !== undefined) sets.push(`budget=${n(d.budget)}`);
  if (d.spent !== undefined) sets.push(`spent=${n(d.spent)}`);
  if (d.leadsTarget !== undefined) sets.push(`leads_target=${n(d.leadsTarget)}`);
  if (d.leadsActual !== undefined) sets.push(`leads_actual=${n(d.leadsActual)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.startDate) sets.push(`start_date='${d.startDate}'`);
  if (d.endDate) sets.push(`end_date='${d.endDate}'`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE social_campaigns SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM social_campaigns WHERE id=${req.params.id}`))[0]);
});

router.delete("/social/campaigns/:id", async (req, res) => {
  await q(`DELETE FROM social_campaigns WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== SOCIAL LEADS ==========
router.get("/social/leads", async (_req, res) => {
  res.json(await q(`SELECT sl.*, sc.name as campaign_name
    FROM social_leads sl LEFT JOIN social_campaigns sc ON sl.campaign_id = sc.id
    ORDER BY sl.created_at DESC`));
});

router.get("/social/leads/new", async (_req, res) => {
  res.json(await q(`SELECT sl.*, sc.name as campaign_name
    FROM social_leads sl LEFT JOIN social_campaigns sc ON sl.campaign_id = sc.id
    WHERE sl.status = 'new'
    ORDER BY sl.created_at DESC`));
});

router.post("/social/leads", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO social_leads (campaign_id, platform, name, phone, email, message, source_post_id, status, assigned_agent_id)
    VALUES (${d.campaignId || 'NULL'}, ${s(d.platform)}, ${s(d.name)}, ${s(d.phone)}, ${s(d.email)}, ${s(d.message)}, ${d.sourcePostId || 'NULL'}, ${s(d.status || 'new')}, ${d.assignedAgentId || 'NULL'})`);
  res.json({ success: true });
});

router.put("/social/leads/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.assignedAgentId !== undefined) sets.push(`assigned_agent_id=${d.assignedAgentId || 'NULL'}`);
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.phone) sets.push(`phone=${s(d.phone)}`);
  if (d.email) sets.push(`email=${s(d.email)}`);
  if (d.message !== undefined) sets.push(`message=${s(d.message)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE social_leads SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM social_leads WHERE id=${req.params.id}`))[0]);
});

router.delete("/social/leads/:id", async (req, res) => {
  await q(`DELETE FROM social_leads WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== ANALYTICS ==========
router.get("/social/analytics/:accountId", async (req, res) => {
  res.json(await q(`SELECT * FROM social_analytics WHERE account_id=${req.params.accountId} ORDER BY date DESC LIMIT 90`));
});

// ========== ROI ==========
router.get("/social/roi/:campaignId", async (req, res) => {
  const campaign = (await q(`SELECT * FROM social_campaigns WHERE id=${req.params.campaignId}`))[0] as any;
  if (!campaign) { res.status(404).json({ error: "קמפיין לא נמצא" }); return; }
  const posts = await q(`SELECT COALESCE(SUM(likes),0) as total_likes, COALESCE(SUM(comments),0) as total_comments, COALESCE(SUM(shares),0) as total_shares, COALESCE(SUM(reach),0) as total_reach, COALESCE(SUM(clicks),0) as total_clicks, COALESCE(SUM(leads_generated),0) as total_leads, COUNT(*) as total_posts FROM social_posts WHERE campaign_id=${req.params.campaignId}`);
  const postStats = posts[0] || {};
  const spent = Number(campaign.spent) || 0;
  const cpl = spent > 0 && Number(postStats.total_leads) > 0 ? spent / Number(postStats.total_leads) : 0;
  res.json({ campaign, postStats, costPerLead: cpl, roi: spent > 0 ? ((Number(postStats.total_leads) * 500 - spent) / spent * 100).toFixed(1) : 0 });
});

// ========== DASHBOARD ==========
router.get("/social/dashboard", async (_req, res) => {
  const accounts = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='connected') as connected, COALESCE(SUM(followers_count),0) as total_followers FROM social_accounts`);
  const posts = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='published') as published, COUNT(*) FILTER (WHERE status='scheduled') as scheduled, COUNT(*) FILTER (WHERE status='draft') as drafts, COALESCE(SUM(likes),0) as total_likes, COALESCE(SUM(comments),0) as total_comments, COALESCE(SUM(shares),0) as total_shares, COALESCE(SUM(reach),0) as total_reach FROM social_posts`);
  const campaigns = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COALESCE(SUM(budget),0) as total_budget, COALESCE(SUM(spent),0) as total_spent, COALESCE(SUM(leads_actual),0) as total_leads FROM social_campaigns`);
  const leads = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='new') as new_leads, COUNT(*) FILTER (WHERE status='converted') as converted FROM social_leads`);
  const recentPosts = await q(`SELECT p.*, a.platform, a.account_name FROM social_posts p LEFT JOIN social_accounts a ON p.account_id = a.id ORDER BY p.created_at DESC LIMIT 5`);
  res.json({ accounts: accounts[0], posts: posts[0], campaigns: campaigns[0], leads: leads[0], recentPosts });
});

export default router;
