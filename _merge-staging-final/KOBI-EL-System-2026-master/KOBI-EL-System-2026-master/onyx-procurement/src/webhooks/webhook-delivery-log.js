/**
 * ONYX — Webhook Delivery Log
 * ═══════════════════════════════════════════════════════════════
 * Agent-80 — Webhook Delivery System
 *
 * Every outbound webhook attempt is recorded in `webhook_deliveries`
 * so operators can audit delivery, diagnose subscriber failures, and
 * replay events that ended up in the dead-letter state.
 *
 * Table:
 *   webhook_deliveries (
 *     id               uuid primary key,
 *     subscription_id  uuid references webhook_subscriptions(id),
 *     event            text not null,            -- event type ("invoice.paid")
 *     event_id         text not null,            -- idempotency id from envelope
 *     payload          jsonb not null,           -- full envelope we sent
 *     attempts         int not null default 0,
 *     last_status      text not null,            -- 'pending'|'ok'|'http_xxx'|'dead_letter'|...
 *     status_code      int,
 *     duration_ms      int,
 *     error            text,
 *     created_at       timestamptz default now(),
 *     delivered_at     timestamptz
 *   )
 *
 * Routes:
 *   GET  /api/webhooks/deliveries                list recent (paged)
 *   GET  /api/webhooks/deliveries/:id            detail
 *   POST /api/webhooks/deliveries/:id/replay     re-send with a fresh
 *                                                delivery row; honors
 *                                                current subscription secret
 *
 * Replay semantics:
 *   - Creates a NEW delivery row (never mutates the original) — so the
 *     audit trail is preserved forever.
 *   - Uses the subscription's CURRENT url + secret (which may differ
 *     from the originals if the subscription was rotated).
 *   - Envelope's `id` is preserved (so idempotent consumers dedupe).
 *   - If the original subscription was deactivated, replay is refused
 *     unless `?force=true` is passed by an admin.
 *
 * Migration (run once — do NOT drop in prod):
 *
 *   create table if not exists webhook_deliveries (
 *     id              uuid primary key default gen_random_uuid(),
 *     subscription_id uuid references webhook_subscriptions(id),
 *     event           text not null,
 *     event_id        text not null,
 *     payload         jsonb not null,
 *     attempts        int  not null default 0,
 *     last_status     text not null,
 *     status_code     int,
 *     duration_ms     int,
 *     error           text,
 *     created_at      timestamptz not null default now(),
 *     delivered_at    timestamptz
 *   );
 *   create index if not exists webhook_deliveries_sub_idx
 *     on webhook_deliveries (subscription_id, created_at desc);
 *   create index if not exists webhook_deliveries_event_idx
 *     on webhook_deliveries (event_id);
 *   create index if not exists webhook_deliveries_dead_idx
 *     on webhook_deliveries (last_status) where last_status = 'dead_letter';
 */

'use strict';

const { sendWebhook } = require('./webhook-sender');
const { buildEventEnvelope, isValidEventType } = require('./webhook-events');

const TABLE = 'webhook_deliveries';
const SUBS_TABLE = 'webhook_subscriptions';

// ─── Public helpers used by the dispatcher ───────────────────────

/**
 * recordAttemptStart — insert a pending row BEFORE firing the
 * request so that an at-least-once trail is preserved even if the
 * process crashes mid-send. Returns the inserted row.
 */
async function recordAttemptStart(supabase, { subscriptionId, envelope }) {
  const insertRow = {
    subscription_id: subscriptionId,
    event:           envelope.type,
    event_id:        envelope.id,
    payload:         envelope,
    attempts:        0,
    last_status:     'pending',
    status_code:     null,
    duration_ms:     null,
    error:           null,
    created_at:      new Date().toISOString(),
  };
  const { data, error } = await supabase.from(TABLE).insert(insertRow).select().single();
  if (error) throw error;
  return data;
}

/**
 * recordAttemptFinish — update the pending row with the final result
 * from sendWebhook(). `delivered_at` is set only on success.
 */
async function recordAttemptFinish(supabase, deliveryId, result) {
  const patch = {
    attempts:    result.attempts || 0,
    last_status: result.last_status,
    status_code: result.status_code || null,
    duration_ms: result.duration_ms || null,
    error:       result.error || null,
  };
  if (result.delivered) patch.delivered_at = new Date().toISOString();

  const { data, error } = await supabase.from(TABLE)
    .update(patch)
    .eq('id', deliveryId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * dispatchEvent — top-level helper callers use to emit events.
 *
 * 1. Load active subscriptions for this event type
 * 2. For each: recordAttemptStart → sendWebhook → recordAttemptFinish
 * 3. Return a summary so callers can decide whether to alert on
 *    partial failure (we never throw — dispatching must never
 *    block the business transaction that fired the event).
 */
async function dispatchEvent({ supabase, type, data, logger, sendImpl }) {
  if (!isValidEventType(type)) {
    throw new Error(`dispatchEvent: unknown event type ${type}`);
  }
  const log = logger || console;
  const send = sendImpl || sendWebhook;

  const { data: subs, error } = await supabase.from(SUBS_TABLE)
    .select('*')
    .eq('active', true);
  if (error) throw error;

  const matching = (subs || []).filter((s) => {
    const events = Array.isArray(s.events) ? s.events : [];
    return events.includes('*') || events.includes(type);
  });

  if (matching.length === 0) {
    return { event_type: type, delivered: 0, failed: 0, subscribers: 0 };
  }

  const envelope = buildEventEnvelope({ type, data });
  let delivered = 0;
  let failed    = 0;

  await Promise.all(matching.map(async (sub) => {
    let deliveryRow = null;
    try {
      deliveryRow = await recordAttemptStart(supabase, {
        subscriptionId: sub.id,
        envelope,
      });
    } catch (e) {
      log.warn && log.warn({ msg: 'webhook.log.insert_failed', error: e.message });
      return;
    }

    const result = await send({
      url:      sub.url,
      secret:   sub.secret,
      envelope,
      options:  { logger: log },
    });

    try {
      await recordAttemptFinish(supabase, deliveryRow.id, result);
    } catch (e) {
      log.warn && log.warn({ msg: 'webhook.log.update_failed', error: e.message });
    }

    if (result.delivered) delivered += 1;
    else                  failed    += 1;
  }));

  return {
    event_type:  type,
    subscribers: matching.length,
    delivered,
    failed,
    event_id:    envelope.id,
  };
}

// ─── Route registration ──────────────────────────────────────────

/**
 * registerWebhookDeliveryRoutes — mount the read/replay routes.
 *
 * @param {object} app
 * @param {object} deps
 * @param {object} deps.supabase
 * @param {function} [deps.requireAdmin]
 * @param {function} [deps.sendImpl]   override send (tests)
 */
function registerWebhookDeliveryRoutes(app, deps = {}) {
  const { supabase } = deps;
  if (!supabase) throw new Error('registerWebhookDeliveryRoutes: supabase is required');
  const sendImpl = deps.sendImpl || sendWebhook;

  const requireAdmin = deps.requireAdmin || ((req, res, next) => {
    const expected = process.env.WEBHOOKS_ADMIN_TOKEN;
    if (!expected) return res.status(500).json({ error: 'admin gate not configured' });
    if (req.headers['x-admin-token'] !== expected) {
      return res.status(403).json({ error: 'admin token required' });
    }
    next();
  });

  // ─── GET /api/webhooks/deliveries ──────────────────────────
  app.get('/api/webhooks/deliveries', async (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const offset = parseInt(req.query.offset, 10) || 0;

    let q = supabase.from(TABLE)
      .select('id,subscription_id,event,event_id,attempts,last_status,status_code,duration_ms,created_at,delivered_at,error')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.status)         q = q.eq('last_status', req.query.status);
    if (req.query.event)          q = q.eq('event',       req.query.event);
    if (req.query.subscription_id) q = q.eq('subscription_id', req.query.subscription_id);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ deliveries: data || [], limit, offset });
  });

  // ─── GET /api/webhooks/deliveries/:id ──────────────────────
  app.get('/api/webhooks/deliveries/:id', async (req, res) => {
    const { data, error } = await supabase.from(TABLE)
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'not found' });
    res.json({ delivery: data });
  });

  // ─── POST /api/webhooks/deliveries/:id/replay ──────────────
  app.post('/api/webhooks/deliveries/:id/replay', requireAdmin, async (req, res) => {
    const force = req.query.force === 'true';

    // Load the original delivery
    const orig = await supabase.from(TABLE)
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (orig.error) return res.status(500).json({ error: orig.error.message });
    if (!orig.data)  return res.status(404).json({ error: 'delivery not found' });

    // Load the subscription (may have been deactivated or rotated)
    const sub = await supabase.from(SUBS_TABLE)
      .select('*')
      .eq('id', orig.data.subscription_id)
      .maybeSingle();
    if (sub.error) return res.status(500).json({ error: sub.error.message });
    if (!sub.data)  return res.status(404).json({ error: 'subscription not found' });
    if (!sub.data.active && !force) {
      return res.status(409).json({
        error: 'subscription is inactive — re-activate or pass ?force=true',
      });
    }

    // Preserve envelope id so idempotent consumers can dedupe.
    const envelope = orig.data.payload || {
      id:         orig.data.event_id,
      type:       orig.data.event,
      version:    1,
      created_at: new Date().toISOString(),
      data:       {},
    };

    // New row — never mutate the original.
    let newRow;
    try {
      newRow = await recordAttemptStart(supabase, {
        subscriptionId: sub.data.id,
        envelope,
      });
    } catch (e) {
      return res.status(500).json({ error: `failed to record replay: ${e.message}` });
    }

    const result = await sendImpl({
      url:     sub.data.url,
      secret:  sub.data.secret,
      envelope,
      options: { extraHeaders: { 'X-Replay-Of': orig.data.id } },
    });

    let finished;
    try {
      finished = await recordAttemptFinish(supabase, newRow.id, result);
    } catch (e) {
      return res.status(500).json({ error: `failed to finalize replay: ${e.message}`, send_result: result });
    }

    res.json({
      replayed_from: orig.data.id,
      delivery:      finished,
      result,
    });
  });
}

module.exports = {
  registerWebhookDeliveryRoutes,
  dispatchEvent,
  recordAttemptStart,
  recordAttemptFinish,
  TABLE,
};
