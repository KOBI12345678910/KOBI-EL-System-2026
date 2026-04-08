import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { integrationConnectionsTable, integrationSyncLogsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: any) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("marketing-sync query error:", e.message); return []; }
}

function esc(v: any): string {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

router.use(requireAuth as any);

router.post("/marketing/sync/google-ads", async (req, res): Promise<void> => {
  const { connectionId, credentials } = req.body;
  const startTime = Date.now();
  try {
    if (!credentials?.token || !credentials?.customerId) {
      res.status(400).json({ success: false, message: "נדרשים token ו-customerId" }); return;
    }
    const customerId = String(credentials.customerId).replace(/-/g, "");
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${credentials.token}`,
      "developer-token": credentials.token,
      "Content-Type": "application/json",
    };
    if (credentials.loginCustomerId) {
      headers["login-customer-id"] = credentials.loginCustomerId;
    }

    let synced = 0;
    let message = "סנכרון Google Ads הושלם";

    try {
      const gaRes = await fetch(
        `https://googleads.googleapis.com/v14/customers/${customerId}/googleAds:searchStream`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: `SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS`,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (gaRes.ok) {
        const data: any = await gaRes.json();
        const results = Array.isArray(data) ? data : data.results || [];
        for (const row of results) {
          const camp = row.campaign || {};
          const metrics = row.metrics || {};
          const name = camp.name || `Google Ads Campaign ${camp.id}`;
          const spend = (Number(metrics.cost_micros || 0) / 1_000_000);
          const convs = Number(metrics.conversions || 0);
          const status = camp.status === "ENABLED" ? "פעיל" : camp.status === "PAUSED" ? "מושהה" : "הסתיים";
          const existing = await q(`SELECT id FROM marketing_campaigns WHERE campaign_name=${esc(name)} AND channel='גוגל'`);
          if (existing.length > 0) {
            await q(`UPDATE marketing_campaigns SET actual_spend=${spend}, conversions=${convs}, status=${esc(status)}, updated_at=NOW() WHERE id=${(existing[0] as any).id}`);
          } else {
            await q(`INSERT INTO marketing_campaigns (campaign_name, channel, actual_spend, conversions, status, manager) VALUES (${esc(name)}, 'גוגל', ${spend}, ${convs}, ${esc(status)}, 'Google Ads')`);
          }
          synced++;
        }
        message = `סונכרנו ${synced} קמפיינים מ-Google Ads`;
      } else {
        message = `Google Ads API: ${gaRes.status} ${gaRes.statusText}`;
      }
    } catch (fetchErr: any) {
      message = `שגיאת חיבור ל-Google Ads: ${fetchErr.message}`;
    }

    if (connectionId) {
      await db.insert(integrationSyncLogsTable).values({
        connectionId,
        direction: "import",
        status: "success",
        recordsProcessed: synced,
        recordsFailed: 0,
        details: { responseTime: Date.now() - startTime, message },
      });
      await db.update(integrationConnectionsTable).set({ lastSyncAt: new Date() }).where(eq(integrationConnectionsTable.id, connectionId));
    }

    res.json({ success: true, synced, message });
  } catch (e: any) {
    res.json({ success: false, message: e.message });
  }
});

router.post("/marketing/sync/facebook-ads", async (req, res): Promise<void> => {
  const { connectionId, credentials } = req.body;
  const startTime = Date.now();
  try {
    if (!credentials?.token || !credentials?.adAccountId) {
      res.status(400).json({ success: false, message: "נדרשים token ו-adAccountId" }); return;
    }
    const accountId = String(credentials.adAccountId).startsWith("act_") ? credentials.adAccountId : `act_${credentials.adAccountId}`;

    let synced = 0;
    let message = "סנכרון Facebook Ads הושלם";

    try {
      const fbRes = await fetch(
        `https://graph.facebook.com/v18.0/${accountId}/campaigns?fields=name,status,insights{spend,leads,conversions,impressions,clicks}&access_token=${credentials.token}&limit=50`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (fbRes.ok) {
        const data: any = await fbRes.json();
        const campaigns = data.data || [];
        for (const camp of campaigns) {
          const insights = camp.insights?.data?.[0] || {};
          const name = camp.name;
          const spend = Number(insights.spend || 0);
          const convs = Number(insights.conversions || 0);
          const leads = Number(insights.leads || 0);
          const status = camp.status === "ACTIVE" ? "פעיל" : camp.status === "PAUSED" ? "מושהה" : "הסתיים";

          const existing = await q(`SELECT id FROM marketing_campaigns WHERE campaign_name=${esc(name)} AND channel='פייסבוק'`);
          if (existing.length > 0) {
            await q(`UPDATE marketing_campaigns SET actual_spend=${spend}, conversions=${convs}, leads_count=${leads}, status=${esc(status)}, updated_at=NOW() WHERE id=${(existing[0] as any).id}`);
          } else {
            await q(`INSERT INTO marketing_campaigns (campaign_name, channel, actual_spend, conversions, leads_count, status, manager) VALUES (${esc(name)}, 'פייסבוק', ${spend}, ${convs}, ${leads}, ${esc(status)}, 'Facebook Ads')`);
          }
          synced++;
        }
        message = `סונכרנו ${synced} קמפיינים מ-Facebook Ads`;
      } else {
        const err: any = await fbRes.json();
        message = `Facebook API: ${err?.error?.message || fbRes.statusText}`;
      }
    } catch (fetchErr: any) {
      message = `שגיאת חיבור ל-Facebook: ${fetchErr.message}`;
    }

    if (connectionId) {
      await db.insert(integrationSyncLogsTable).values({
        connectionId,
        direction: "import",
        status: "success",
        recordsProcessed: synced,
        recordsFailed: 0,
        details: { responseTime: Date.now() - startTime, message },
      });
      await db.update(integrationConnectionsTable).set({ lastSyncAt: new Date() }).where(eq(integrationConnectionsTable.id, connectionId));
    }

    res.json({ success: true, synced, message });
  } catch (e: any) {
    res.json({ success: false, message: e.message });
  }
});

router.post("/marketing/sync/google-analytics", async (req, res): Promise<void> => {
  const { connectionId, credentials } = req.body;
  const startTime = Date.now();
  try {
    if (!credentials?.token || !credentials?.propertyId) {
      res.status(400).json({ success: false, message: "נדרשים token ו-propertyId" }); return;
    }

    let synced = 0;
    let message = "סנכרון Google Analytics הושלם";

    try {
      const gaRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${credentials.propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${credentials.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
            metrics: [
              { name: "sessions" },
              { name: "conversions" },
              { name: "totalUsers" },
            ],
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (gaRes.ok) {
        const data: any = await gaRes.json();
        const rows = data.rows || [];
        message = `נשלפו ${rows.length} שורות מ-Google Analytics`;
        synced = rows.length;
      } else {
        const err: any = await gaRes.json();
        message = `Analytics API: ${err?.error?.message || gaRes.statusText}`;
      }
    } catch (fetchErr: any) {
      message = `שגיאת חיבור ל-Google Analytics: ${fetchErr.message}`;
    }

    if (connectionId) {
      await db.insert(integrationSyncLogsTable).values({
        connectionId,
        direction: "import",
        status: "success",
        recordsProcessed: synced,
        recordsFailed: 0,
        details: { responseTime: Date.now() - startTime, message },
      });
      await db.update(integrationConnectionsTable).set({ lastSyncAt: new Date() }).where(eq(integrationConnectionsTable.id, connectionId));
    }

    res.json({ success: true, synced, message });
  } catch (e: any) {
    res.json({ success: false, message: e.message });
  }
});

router.post("/marketing/sync/mailchimp", async (req, res): Promise<void> => {
  const { connectionId, credentials } = req.body;
  const startTime = Date.now();
  try {
    if (!credentials?.apiKey || !credentials?.serverPrefix) {
      res.status(400).json({ success: false, message: "נדרשים apiKey ו-serverPrefix" }); return;
    }

    let synced = 0;
    let message = "סנכרון Mailchimp הושלם";

    try {
      const authHeader = "Basic " + Buffer.from(`anystring:${credentials.apiKey}`).toString("base64");
      const baseUrl = `https://${credentials.serverPrefix}.api.mailchimp.com/3.0`;

      const campsRes = await fetch(`${baseUrl}/campaigns?count=50&status=sent`, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(15000),
      });

      if (campsRes.ok) {
        const data: any = await campsRes.json();
        const camps = data.campaigns || [];
        for (const camp of camps) {
          const stats = camp.report_summary || {};
          const name = camp.settings?.subject_line || camp.settings?.title || `Mailchimp Campaign ${camp.id}`;
          const opens = Number(stats.opens || 0);
          const clicks = Number(stats.clicks || 0);
          const subscribers = Number(camp.recipients?.recipient_count || 0);
          const openRate = stats.open_rate ? Number((stats.open_rate * 100).toFixed(2)) : 0;
          const clickRate = stats.click_rate ? Number((stats.click_rate * 100).toFixed(2)) : 0;
          const sendDate = camp.send_time ? camp.send_time.substring(0, 10) : null;

          const existing = await q(`SELECT id FROM email_marketing WHERE campaign_name=${esc(name)}`);
          if (existing.length > 0) {
            await q(`UPDATE email_marketing SET opens=${opens}, clicks=${clicks}, recipients=${subscribers}, open_rate=${openRate}, click_rate=${clickRate}, status='נשלח', updated_at=NOW() WHERE id=${(existing[0] as any).id}`);
          } else {
            await q(`INSERT INTO email_marketing (campaign_name, subject, recipients, opens, clicks, open_rate, click_rate, send_date, status) VALUES (${esc(name)}, ${esc(camp.settings?.subject_line || name)}, ${subscribers}, ${opens}, ${clicks}, ${openRate}, ${clickRate}, ${sendDate ? `'${sendDate}'` : "NULL"}, 'נשלח')`);
          }
          synced++;
        }
        message = `סונכרנו ${synced} קמפיינים מ-Mailchimp`;
      } else {
        const err: any = await campsRes.json();
        message = `Mailchimp API: ${err?.detail || campsRes.statusText}`;
      }
    } catch (fetchErr: any) {
      message = `שגיאת חיבור ל-Mailchimp: ${fetchErr.message}`;
    }

    if (connectionId) {
      await db.insert(integrationSyncLogsTable).values({
        connectionId,
        direction: "import",
        status: "success",
        recordsProcessed: synced,
        recordsFailed: 0,
        details: { responseTime: Date.now() - startTime, message },
      });
      await db.update(integrationConnectionsTable).set({ lastSyncAt: new Date() }).where(eq(integrationConnectionsTable.id, connectionId));
    }

    res.json({ success: true, synced, message });
  } catch (e: any) {
    res.json({ success: false, message: e.message });
  }
});

router.post("/marketing/webhook/leads", async (req, res) => {
  try {
    const payload = req.body;
    const campaignName = payload.campaign_name || payload.campaignName || payload.campaign || "Webhook Lead";
    const source = payload.source || payload.platform || "webhook";
    const leads = Number(payload.leads || payload.count || 1);

    const existing = await q(`SELECT id, leads_count FROM marketing_campaigns WHERE campaign_name=${esc(campaignName)}`);
    if (existing.length > 0) {
      const currentLeads = Number((existing[0] as any).leads_count || 0);
      await q(`UPDATE marketing_campaigns SET leads_count=${currentLeads + leads}, updated_at=NOW() WHERE id=${(existing[0] as any).id}`);
    } else {
      await q(`INSERT INTO marketing_campaigns (campaign_name, channel, leads_count, status) VALUES (${esc(campaignName)}, ${esc(source)}, ${leads}, 'פעיל')`);
    }

    res.json({ success: true, message: `עודכנו ${leads} לידים לקמפיין ${campaignName}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/marketing/webhook/conversions", async (req, res) => {
  try {
    const payload = req.body;
    const campaignName = payload.campaign_name || payload.campaignName || payload.campaign || "Webhook Conversion";
    const conversions = Number(payload.conversions || payload.count || 1);
    const revenue = Number(payload.revenue || payload.value || 0);

    const existing = await q(`SELECT id, conversions, revenue FROM marketing_campaigns WHERE campaign_name=${esc(campaignName)}`);
    if (existing.length > 0) {
      const cur = existing[0] as any;
      const newConvs = Number(cur.conversions || 0) + conversions;
      const newRevenue = Number(cur.revenue || 0) + revenue;
      await q(`UPDATE marketing_campaigns SET conversions=${newConvs}, revenue=${newRevenue}, updated_at=NOW() WHERE id=${cur.id}`);
    } else {
      await q(`INSERT INTO marketing_campaigns (campaign_name, conversions, revenue, status) VALUES (${esc(campaignName)}, ${conversions}, ${revenue}, 'פעיל')`);
    }

    res.json({ success: true, message: `עודכנו ${conversions} המרות לקמפיין ${campaignName}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/marketing/webhook/spend", async (req, res) => {
  try {
    const payload = req.body;
    const campaignName = payload.campaign_name || payload.campaignName || payload.campaign || "Webhook Spend";
    const spend = Number(payload.spend || payload.amount || payload.cost || 0);
    const date = payload.date || new Date().toISOString().substring(0, 10);
    const channel = payload.platform || payload.channel || "webhook";

    const existing = await q(`SELECT id FROM marketing_budget WHERE budget_name=${esc(campaignName)}`);
    if (existing.length > 0) {
      await q(`UPDATE marketing_budget SET actual_spend=actual_spend::float+${spend}, updated_at=NOW() WHERE id=${(existing[0] as any).id}`);
    } else {
      const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
      const month = monthNames[new Date(date).getMonth()];
      const year = new Date(date).getFullYear();
      await q(`INSERT INTO marketing_budget (budget_name, channel, month, year, planned_budget, actual_spend, status) VALUES (${esc(campaignName)}, ${esc(channel)}, ${esc(month)}, ${year}, 0, ${spend}, 'פעיל')`);
    }

    res.json({ success: true, message: `עודכנה הוצאה של ₪${spend} לקמפיין ${campaignName}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
