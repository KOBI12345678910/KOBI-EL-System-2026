/**
 * ONYX — Webhook Subscriptions CRUD
 * ═══════════════════════════════════════════════════════════════
 * Agent-80 — Webhook Delivery System
 *
 * Exposes the Express routes that let admins manage which external
 * systems should receive which events. All mutating routes require
 * admin authentication (`requireAdmin`) — passed in by server.js
 * so this module stays framework-agnostic for tests.
 *
 * Table:
 *   webhook_subscriptions (
 *     id          uuid primary key,
 *     url         text not null,
 *     events      text[] not null,          -- e.g. ["invoice.paid","po.*"]
 *     secret      text not null,            -- HMAC key; never returned unmasked
 *     active      boolean default true,
 *     created_at  timestamptz default now(),
 *     updated_at  timestamptz,
 *     created_by  text,
 *     description text
 *   )
 *
 * Routes:
 *   POST   /api/webhooks/subscriptions        create (admin only)
 *   GET    /api/webhooks/subscriptions        list
 *   GET    /api/webhooks/subscriptions/:id    detail
 *   PATCH  /api/webhooks/subscriptions/:id    update (admin only)
 *   DELETE /api/webhooks/subscriptions/:id    deactivate (admin only, soft)
 *
 * IMPORTANT: secrets are WRITE-ONLY from the API surface. Listing
 * and detail responses mask the secret as `"***"`. Full values are
 * only available via direct DB access, as intended for subscriber
 * onboarding handover — never log or email them from the web tier.
 *
 * Migration (run once — do NOT drop in prod):
 *
 *   create table if not exists webhook_subscriptions (
 *     id          uuid primary key default gen_random_uuid(),
 *     url         text not null,
 *     events      text[] not null default '{}',
 *     secret      text not null,
 *     active      boolean not null default true,
 *     created_at  timestamptz not null default now(),
 *     updated_at  timestamptz,
 *     created_by  text,
 *     description text
 *   );
 *   create index if not exists webhook_subscriptions_active_idx
 *     on webhook_subscriptions (active) where active = true;
 */

'use strict';

const crypto = require('crypto');
const { isValidEventType, listEventTypes } = require('./webhook-events');

const TABLE = 'webhook_subscriptions';

// ─── Helpers ───────────────────────────────────────────────────────

function generateSecret() {
  // 32 bytes = 256 bits, base64url for URL-safe transmission.
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * validateUrl — only allow http(s), block obviously-internal hosts
 * when SAFE_MODE is on. In dev we allow localhost so the test
 * receiver (`webhook-test-receiver.js`) works.
 */
function validateUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return 'url is required';
  let parsed;
  try { parsed = new URL(url); }
  catch { return 'url is not a valid URL'; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'url must be http or https';
  }
  if (process.env.WEBHOOKS_SAFE_MODE === 'true') {
    const host = parsed.hostname.toLowerCase();
    // SSRF hardening: refuse common internal targets when strict.
    const blocked = [
      'localhost', '127.0.0.1', '0.0.0.0',
      '169.254.169.254', // AWS/GCP metadata
      '::1',
    ];
    if (blocked.includes(host) || host.endsWith('.internal')) {
      return `host ${host} is not allowed in safe mode`;
    }
  }
  return null;
}

function validateEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return 'events must be a non-empty array';
  }
  for (const e of events) {
    if (e === '*') continue;
    if (!isValidEventType(e)) {
      return `unknown event type: ${e} (valid: ${listEventTypes().join(', ')})`;
    }
  }
  return null;
}

function maskRow(row) {
  if (!row) return row;
  const { secret, ...rest } = row;
  return { ...rest, secret: secret ? '***' : null };
}

// ─── Route registration ───────────────────────────────────────────

/**
 * registerWebhookSubscriptionRoutes — mount all CRUD routes.
 *
 * @param {object} app                  Express app
 * @param {object} deps
 * @param {object} deps.supabase        supabase-js client
 * @param {function} [deps.audit]       async (entity,id,action,actor,...) => void
 * @param {function} [deps.requireAdmin] Express middleware; falls back to
 *                                       an `x-admin-token` header check when
 *                                       not provided — development only.
 */
function registerWebhookSubscriptionRoutes(app, deps = {}) {
  const { supabase, audit } = deps;
  if (!supabase) throw new Error('registerWebhookSubscriptionRoutes: supabase is required');

  const requireAdmin = deps.requireAdmin || ((req, res, next) => {
    const expected = process.env.WEBHOOKS_ADMIN_TOKEN;
    if (!expected) {
      return res.status(500).json({ error: 'admin gate not configured (WEBHOOKS_ADMIN_TOKEN)' });
    }
    const got = req.headers['x-admin-token'];
    if (!got || got !== expected) {
      return res.status(403).json({ error: 'admin token required' });
    }
    next();
  });

  const safeAudit = async (...args) => {
    if (typeof audit !== 'function') return;
    try { await audit(...args); } catch (_) {}
  };

  // ─── POST /api/webhooks/subscriptions ──────────────────────
  app.post('/api/webhooks/subscriptions', requireAdmin, async (req, res) => {
    const { url, events, description } = req.body || {};

    const urlErr    = validateUrl(url);
    if (urlErr)     return res.status(400).json({ error: urlErr });
    const eventsErr = validateEvents(events);
    if (eventsErr)  return res.status(400).json({ error: eventsErr });

    // Secret is generated server-side unless the caller provided one
    // that meets minimum entropy (32 chars). Never log it.
    const providedSecret = req.body && req.body.secret;
    const secret = (typeof providedSecret === 'string' && providedSecret.length >= 32)
      ? providedSecret
      : generateSecret();

    const row = {
      url,
      events,
      secret,
      active:      true,
      description: description || null,
      created_by:  (req.actor && req.actor.id) || req.headers['x-user-id'] || 'api',
      created_at:  new Date().toISOString(),
    };

    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await safeAudit('webhook_subscription', data.id, 'created',
      row.created_by, `Webhook subscription for ${url}`, null, maskRow(data));

    // Return the plaintext secret ONCE at creation — the caller must
    // store it on their side, we only keep a hash for comparison.
    // NOTE: for now we retain the raw secret in the DB because the
    // dispatcher needs it to sign payloads; if we later move to
    // HMAC-KDF hashing we can redact here.
    res.status(201).json({
      subscription:    maskRow(data),
      secret_plaintext: secret,
      warning:         'store this secret now — it will not be shown again in list/detail responses',
    });
  });

  // ─── GET /api/webhooks/subscriptions ──────────────────────
  app.get('/api/webhooks/subscriptions', async (req, res) => {
    const onlyActive = req.query.active === 'true';
    let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false });
    if (onlyActive) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ subscriptions: (data || []).map(maskRow) });
  });

  // ─── GET /api/webhooks/subscriptions/:id ──────────────────
  app.get('/api/webhooks/subscriptions/:id', async (req, res) => {
    const { data, error } = await supabase.from(TABLE)
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'not found' });
    res.json({ subscription: maskRow(data) });
  });

  // ─── PATCH /api/webhooks/subscriptions/:id ───────────────
  app.patch('/api/webhooks/subscriptions/:id', requireAdmin, async (req, res) => {
    const updates = {};

    if (req.body.url != null) {
      const urlErr = validateUrl(req.body.url);
      if (urlErr) return res.status(400).json({ error: urlErr });
      updates.url = req.body.url;
    }
    if (req.body.events != null) {
      const eventsErr = validateEvents(req.body.events);
      if (eventsErr) return res.status(400).json({ error: eventsErr });
      updates.events = req.body.events;
    }
    if (typeof req.body.active === 'boolean') {
      updates.active = req.body.active;
    }
    if (req.body.description != null) {
      updates.description = req.body.description;
    }
    // Secret rotation — only admins, never echoed back plaintext except once.
    let rotated = null;
    if (req.body.rotate_secret === true) {
      rotated = generateSecret();
      updates.secret = rotated;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no updatable fields provided' });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from(TABLE)
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'not found' });

    await safeAudit('webhook_subscription', data.id, 'updated',
      (req.actor && req.actor.id) || req.headers['x-user-id'] || 'api',
      'Webhook subscription updated', null, maskRow(data));

    const response = { subscription: maskRow(data) };
    if (rotated) {
      response.secret_plaintext = rotated;
      response.warning = 'new secret — previous secret is now invalid';
    }
    res.json(response);
  });

  // ─── DELETE /api/webhooks/subscriptions/:id ───────────────
  //
  // SOFT delete only — we set active=false so audit history and
  // delivery logs remain queryable. We never hard-delete rows.
  app.delete('/api/webhooks/subscriptions/:id', requireAdmin, async (req, res) => {
    const { data, error } = await supabase.from(TABLE)
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'not found' });

    await safeAudit('webhook_subscription', data.id, 'deactivated',
      (req.actor && req.actor.id) || req.headers['x-user-id'] || 'api',
      'Webhook subscription deactivated', maskRow(data), null);

    res.json({ subscription: maskRow(data), deactivated: true });
  });
}

/**
 * getActiveSubscriptionsForEvent — server-side helper used by the
 * dispatcher (NOT exposed as a route). Returns the list of active
 * subscription rows WITH secrets (so the sender can sign) that are
 * subscribed to the given event type, including wildcard "*".
 */
async function getActiveSubscriptionsForEvent(supabase, eventType) {
  const { data, error } = await supabase.from(TABLE)
    .select('*')
    .eq('active', true);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.filter((r) => {
    const events = Array.isArray(r.events) ? r.events : [];
    return events.includes('*') || events.includes(eventType);
  });
}

module.exports = {
  registerWebhookSubscriptionRoutes,
  getActiveSubscriptionsForEvent,
  generateSecret,
  validateUrl,
  validateEvents,
  maskRow,
  TABLE,
};
