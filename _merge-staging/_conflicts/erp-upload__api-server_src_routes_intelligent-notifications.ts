import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ================================================================
   Intelligent Notification & Communication Hub  --  TechnoKoluzi ERP
   Beyond SAP/Oracle -- smart routing, escalation & digest engine
   ================================================================ */

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_channels (
      id SERIAL PRIMARY KEY,
      channel_type VARCHAR(30) NOT NULL CHECK (channel_type IN ('in_app','email','whatsapp','sms','push','teams','slack','webhook')),
      name VARCHAR(200) NOT NULL,
      config JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','error')),
      priority INT DEFAULT 5,
      rate_limit_per_minute INT DEFAULT 60,
      daily_quota INT DEFAULT 1000,
      sent_today INT DEFAULT 0,
      last_reset TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(200) NOT NULL,
      user_name VARCHAR(300),
      module VARCHAR(100) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      channels JSONB DEFAULT '["in_app"]',
      frequency VARCHAR(30) DEFAULT 'realtime' CHECK (frequency IN ('realtime','hourly_digest','daily_digest','weekly_digest','never')),
      muted_until TIMESTAMPTZ,
      priority_threshold VARCHAR(20) DEFAULT 'low' CHECK (priority_threshold IN ('low','normal','high','urgent')),
      quiet_hours_start TIME,
      quiet_hours_end TIME,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, module, event_type)
    );

    CREATE TABLE IF NOT EXISTS notification_queue (
      id SERIAL PRIMARY KEY,
      recipient_id VARCHAR(200) NOT NULL,
      recipient_name VARCHAR(300),
      channel VARCHAR(30) NOT NULL,
      module VARCHAR(100),
      event_type VARCHAR(100),
      subject VARCHAR(500) NOT NULL,
      body TEXT NOT NULL,
      body_html TEXT,
      priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
      status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','delivered','failed','read','cancelled')),
      retry_count INT DEFAULT 0,
      max_retries INT DEFAULT 3,
      error_message TEXT,
      metadata JSONB DEFAULT '{}',
      scheduled_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notif_queue_status ON notification_queue(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_notif_queue_recipient ON notification_queue(recipient_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS notification_digest (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(200) NOT NULL,
      digest_type VARCHAR(30) NOT NULL CHECK (digest_type IN ('hourly','daily','weekly')),
      items JSONB DEFAULT '[]',
      item_count INT DEFAULT 0,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','generating','sent','failed')),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS escalation_chains (
      id SERIAL PRIMARY KEY,
      name VARCHAR(300) NOT NULL,
      description TEXT,
      module VARCHAR(100),
      trigger_event VARCHAR(200) NOT NULL,
      trigger_condition JSONB DEFAULT '{}',
      levels JSONB DEFAULT '[]',
      max_escalation_level INT DEFAULT 3,
      active BOOLEAN DEFAULT true,
      escalation_count INT DEFAULT 0,
      last_triggered TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(300) NOT NULL,
      module VARCHAR(100),
      event_type VARCHAR(100),
      channel VARCHAR(30) NOT NULL,
      subject_template VARCHAR(500),
      body_template TEXT NOT NULL,
      body_html_template TEXT,
      variables JSONB DEFAULT '[]',
      language VARCHAR(10) DEFAULT 'he',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
ensureTables();

// ======================== NOTIFICATION QUEUE ========================

router.get("/smart-notifications/queue", async (req, res) => {
  try {
    const userId = req.query.user_id;
    const status = req.query.status;
    let query = `SELECT * FROM notification_queue WHERE 1=1`;
    const params: any[] = [];
    if (userId) { params.push(userId); query += ` AND recipient_id=$${params.length}`; }
    if (status) { params.push(status); query += ` AND status=$${params.length}`; }
    query += ` ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, created_at DESC LIMIT 200`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/smart-notifications/send", async (req, res) => {
  try {
    const d = req.body;
    const recipients = Array.isArray(d.recipients) ? d.recipients : [{ id: d.recipient_id, name: d.recipient_name }];

    const results = [];
    for (const recipient of recipients) {
      // Check preferences
      const { rows: prefs } = await pool.query(
        `SELECT * FROM notification_preferences WHERE user_id=$1 AND module=$2 AND event_type=$3`,
        [recipient.id, d.module || 'system', d.event_type || 'general']
      );

      const pref = prefs[0];
      // If muted, skip
      if (pref?.muted_until && new Date(pref.muted_until) > new Date()) continue;
      // If frequency is 'never', skip
      if (pref?.frequency === 'never') continue;

      const channels = pref?.channels || ['in_app'];
      const frequency = pref?.frequency || 'realtime';

      if (frequency === 'realtime') {
        for (const channel of (Array.isArray(channels) ? channels : [channels])) {
          const { rows } = await pool.query(
            `INSERT INTO notification_queue (recipient_id, recipient_name, channel, module, event_type, subject, body, body_html, priority, status, metadata, scheduled_at, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued',$10,$11,$12) RETURNING *`,
            [recipient.id, recipient.name, channel, d.module || 'system', d.event_type || 'general', d.subject, d.body, d.body_html, d.priority || 'normal', d.metadata || {}, d.scheduled_at || new Date(), d.expires_at]
          );
          results.push(rows[0]);

          // Mark as sent (simulated)
          await pool.query(`UPDATE notification_queue SET status='sent', sent_at=NOW() WHERE id=$1`, [rows[0].id]);
        }
      } else {
        // Queue for digest
        const digestType = frequency.replace('_digest', '');
        await pool.query(
          `INSERT INTO notification_digest (user_id, digest_type, items, item_count, period_start, period_end)
           VALUES ($1, $2, $3, 1, NOW(), NOW() + INTERVAL '1 day')
           ON CONFLICT DO NOTHING`,
          [recipient.id, digestType, JSON.stringify([{ subject: d.subject, body: d.body, module: d.module, priority: d.priority, created_at: new Date() }])]
        );
      }
    }

    res.json({ success: true, sent: results.length, notifications: results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/smart-notifications/mark-read", async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id];
    await pool.query(`UPDATE notification_queue SET status='read', read_at=NOW() WHERE id=ANY($1)`, [ids]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== PREFERENCES ========================

router.get("/smart-notifications/preferences/:userId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id=$1 ORDER BY module, event_type`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/smart-notifications/preferences", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO notification_preferences (user_id, user_name, module, event_type, channels, frequency, muted_until, priority_threshold, quiet_hours_start, quiet_hours_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, module, event_type) DO UPDATE SET
         channels=$5, frequency=$6, muted_until=$7, priority_threshold=$8, quiet_hours_start=$9, quiet_hours_end=$10, updated_at=NOW()
       RETURNING *`,
      [d.user_id, d.user_name, d.module, d.event_type, d.channels || ['in_app'], d.frequency || 'realtime', d.muted_until, d.priority_threshold || 'low', d.quiet_hours_start, d.quiet_hours_end]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/smart-notifications/preferences/bulk", async (req, res) => {
  try {
    const prefs = req.body.preferences || [];
    const results = [];
    for (const d of prefs) {
      const { rows } = await pool.query(
        `INSERT INTO notification_preferences (user_id, user_name, module, event_type, channels, frequency)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, module, event_type) DO UPDATE SET channels=$5, frequency=$6, updated_at=NOW()
         RETURNING *`,
        [d.user_id, d.user_name, d.module, d.event_type, d.channels, d.frequency]
      );
      results.push(rows[0]);
    }
    res.json({ success: true, updated: results.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== ESCALATION CHAINS ========================

router.get("/smart-notifications/escalation-chains", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalation_chains ORDER BY module, name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/smart-notifications/escalation-chains", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO escalation_chains (name, description, module, trigger_event, trigger_condition, levels, max_escalation_level, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.name, d.description, d.module, d.trigger_event, d.trigger_condition || {}, d.levels || [], d.max_escalation_level || 3, d.active !== false]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/smart-notifications/escalation-chains/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE escalation_chains SET name=$1, description=$2, module=$3, trigger_event=$4, trigger_condition=$5, levels=$6, max_escalation_level=$7, active=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [d.name, d.description, d.module, d.trigger_event, d.trigger_condition, d.levels, d.max_escalation_level, d.active, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/smart-notifications/escalation-chains/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM escalation_chains WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CHANNELS ========================

router.get("/smart-notifications/channels", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM notification_channels ORDER BY priority`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/smart-notifications/channels", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO notification_channels (channel_type, name, config, status, priority, rate_limit_per_minute, daily_quota)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.channel_type, d.name, d.config || {}, d.status || 'active', d.priority || 5, d.rate_limit_per_minute || 60, d.daily_quota || 1000]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== DIGEST ========================

router.post("/smart-notifications/digest/generate", async (req, res) => {
  try {
    const digestType = req.body.digest_type || 'daily';
    const interval = digestType === 'hourly' ? '1 hour' : digestType === 'weekly' ? '7 days' : '1 day';

    // Find users who need digest
    const { rows: users } = await pool.query(
      `SELECT DISTINCT user_id, user_name FROM notification_preferences WHERE frequency=$1`, [`${digestType}_digest`]
    );

    let generated = 0;
    for (const u of users) {
      const { rows: items } = await pool.query(
        `SELECT * FROM notification_queue WHERE recipient_id=$1 AND created_at >= NOW() - INTERVAL '${interval}' ORDER BY priority DESC, created_at DESC`,
        [u.user_id]
      );
      if (items.length > 0) {
        await pool.query(
          `INSERT INTO notification_digest (user_id, digest_type, items, item_count, period_start, period_end, status)
           VALUES ($1,$2,$3,$4,NOW()-INTERVAL '${interval}',NOW(),'sent')`,
          [u.user_id, digestType, JSON.stringify(items.map(i => ({ subject: i.subject, body: i.body, module: i.module, priority: i.priority, created_at: i.created_at }))), items.length]
        );
        generated++;
      }
    }

    res.json({ success: true, digests_generated: generated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== TEMPLATES ========================

router.get("/smart-notifications/templates", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM notification_templates ORDER BY module, event_type`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/smart-notifications/templates", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO notification_templates (name, module, event_type, channel, subject_template, body_template, body_html_template, variables, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [d.name, d.module, d.event_type, d.channel, d.subject_template, d.body_template, d.body_html_template, d.variables || [], d.language || 'he']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== DASHBOARD ========================

router.get("/smart-notifications/dashboard", async (_req, res) => {
  try {
    const [queueStats, channelStats, prefStats, escalationStats, digestStats] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) as total_notifications,
        COUNT(*) FILTER(WHERE status='queued') as queued,
        COUNT(*) FILTER(WHERE status='sent') as sent,
        COUNT(*) FILTER(WHERE status='delivered') as delivered,
        COUNT(*) FILTER(WHERE status='failed') as failed,
        COUNT(*) FILTER(WHERE status='read') as read_count,
        COUNT(*) FILTER(WHERE priority='urgent') as urgent,
        COUNT(*) FILTER(WHERE priority='high') as high_priority,
        COUNT(*) FILTER(WHERE created_at >= NOW()-INTERVAL '24 hours') as today,
        COUNT(*) FILTER(WHERE created_at >= NOW()-INTERVAL '1 hour') as last_hour
        FROM notification_queue`),
      pool.query(`SELECT channel, COUNT(*) as count, COUNT(*) FILTER(WHERE status='sent' OR status='delivered' OR status='read') as success,
                         COUNT(*) FILTER(WHERE status='failed') as failures
                  FROM notification_queue GROUP BY channel ORDER BY count DESC`),
      pool.query(`SELECT
        COUNT(DISTINCT user_id) as users_with_prefs,
        COUNT(*) as total_rules,
        COUNT(*) FILTER(WHERE frequency='never') as muted_events,
        COUNT(*) FILTER(WHERE muted_until IS NOT NULL AND muted_until > NOW()) as currently_muted
        FROM notification_preferences`),
      pool.query(`SELECT
        COUNT(*) as total_chains, COUNT(*) FILTER(WHERE active=true) as active_chains,
        SUM(escalation_count) as total_escalations
        FROM escalation_chains`),
      pool.query(`SELECT
        COUNT(*) as total_digests, COUNT(*) FILTER(WHERE status='sent') as sent_digests,
        SUM(item_count) as total_digest_items
        FROM notification_digest WHERE created_at >= NOW()-INTERVAL '7 days'`)
    ]);

    res.json({
      queue: queueStats.rows[0],
      channels: channelStats.rows,
      preferences: prefStats.rows[0],
      escalations: escalationStats.rows[0],
      digests: digestStats.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
