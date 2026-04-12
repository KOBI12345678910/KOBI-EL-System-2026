/**
 * Unit tests for the Unified Notification Service.
 * Agent-76 — Notifications
 *
 * Run:
 *   node --test src/notifications/notification-service.test.js
 *
 * Strategy:
 *   - All stateful components (queue, preferences, history) are constructed
 *     with tmp file paths so tests are hermetic and can run in parallel with
 *     the real service.
 *   - The notification-service is built with an explicit `adapters` object
 *     so we fully control delivery outcomes — no sibling modules are loaded.
 *   - Priority routing, quiet hours, throttle, frequency cap, retry schedule,
 *     DLQ behavior, render interpolation, and the REST shape are all covered.
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');

const types      = require('./notification-types');
const { NotificationQueue }       = require('./notification-queue');
const { NotificationPreferences, isInQuietHours, parseHHMM } = require('./notification-preferences');
const { NotificationHistory }     = require('./notification-history');
const { NotificationService }     = require('./notification-service');

// ───────────────────────────────────────────────────────────────
// Test helpers
// ───────────────────────────────────────────────────────────────

function tmpPath(suffix) {
  const dir = path.join(os.tmpdir(), 'onyx-notif-test-' + crypto.randomBytes(4).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'f_' + suffix);
}

function makeSvc(overrideAdapters) {
  const logPath = tmpPath('queue.jsonl');
  const dlqPath = tmpPath('dlq.jsonl');
  const prefsPath = tmpPath('prefs.jsonl');
  const histPath  = tmpPath('hist.jsonl');

  const queue       = new NotificationQueue({ logPath, dlqPath });
  const preferences = new NotificationPreferences({ storePath: prefsPath });
  const history     = new NotificationHistory({ storePath: histPath });

  const svc = new NotificationService({
    queue, preferences, history,
    adapters: Object.assign({
      email:    async () => ({ success: true }),
      whatsapp: async () => ({ success: true }),
      sms:      async () => ({ success: true }),
      push:     async () => ({ success: true }),
    }, overrideAdapters || {}),
  });
  return { svc, queue, preferences, history };
}

// ───────────────────────────────────────────────────────────────
// notification-types
// ───────────────────────────────────────────────────────────────

test('notification-types: registry has at least 20 types', () => {
  const ids = types.listIds();
  assert.ok(ids.length >= 20, 'expected ≥20 types, got ' + ids.length);
  // spot-check required ones
  for (const id of [
    'wage_slip_ready', 'invoice_overdue', 'payment_received',
    'po_approval_needed', 'vat_report_ready', 'security_alert',
    'system_maintenance',
  ]) {
    assert.ok(types.has(id), 'missing required type: ' + id);
  }
});

test('notification-types: render interpolates {{keys}}', () => {
  const out = types.render('שלום {{name}}, סכום: {{amount}} ₪', { name: 'דנה', amount: 1234 });
  assert.equal(out, 'שלום דנה, סכום: 1234 ₪');
  // unknown keys → empty string
  assert.equal(types.render('{{missing}}', {}), '');
  // null safety
  assert.equal(types.render('{{x}}', { x: null }), '');
});

test('notification-types: renderType returns title + body', () => {
  const r = types.renderType('wage_slip_ready', { employeeName: 'דנה', month: '2026-03' });
  assert.ok(r);
  assert.ok(r.title);
  assert.match(r.body, /דנה/);
  assert.match(r.body, /2026-03/);
});

test('notification-types: unknown type returns null', () => {
  assert.equal(types.get('not_a_type'), null);
  assert.equal(types.renderType('not_a_type', {}), null);
});

// ───────────────────────────────────────────────────────────────
// notification-preferences
// ───────────────────────────────────────────────────────────────

test('preferences: parseHHMM accepts valid, rejects invalid', () => {
  assert.equal(parseHHMM('00:00'), 0);
  assert.equal(parseHHMM('22:30'), 22 * 60 + 30);
  assert.equal(parseHHMM('7:05'), 7 * 60 + 5);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('abc'), null);
  assert.equal(parseHHMM(null), null);
});

test('preferences: defaults applied for unknown user', async () => {
  const p = new NotificationPreferences({ storePath: tmpPath('p.jsonl') });
  const prefs = await p.get('new_user');
  assert.equal(prefs.channels.email, true);
  assert.equal(prefs.channels.whatsapp, true);
  assert.equal(prefs.timezone, 'Asia/Jerusalem');
  assert.equal(prefs.frequencyCap, 30);
});

test('preferences: set persists and round-trips', async () => {
  const p = new NotificationPreferences({ storePath: tmpPath('p.jsonl') });
  await p.set('u1', { channels: { email: false }, frequencyCap: 5 });
  const prefs = await p.get('u1');
  assert.equal(prefs.channels.email, false);
  assert.equal(prefs.channels.whatsapp, true);  // default preserved
  assert.equal(prefs.frequencyCap, 5);
});

test('preferences: isInQuietHours handles wrap-around window', () => {
  // build a prefs object with a deterministic quiet window via injected Date
  const prefs = {
    quietHours: { enabled: true, start: '22:00', end: '07:00' },
    timezone:   'UTC',
  };
  // Monkey-patch currentLocalMinute by crafting a full Date. isInQuietHours
  // falls through to UTC when given a Date argument — we exercise that path.
  const nightUtc = new Date(Date.UTC(2026, 0, 1, 23, 30, 0));   // 23:30 UTC
  const morningUtc = new Date(Date.UTC(2026, 0, 1, 8, 30, 0));  // 08:30 UTC
  assert.equal(isInQuietHours(prefs, nightUtc), true);
  assert.equal(isInQuietHours(prefs, morningUtc), false);
});

test('preferences: shouldDeliver — critical always passes', async () => {
  const p = new NotificationPreferences({ storePath: tmpPath('p.jsonl') });
  await p.set('u1', { channels: { sms: false } });
  const def = types.get('security_alert');
  const r = await p.shouldDeliver('u1', 'sms', def);
  assert.equal(r.allow, true);
  assert.equal(r.reason, 'critical_override');
});

test('preferences: shouldDeliver — info is email-only', async () => {
  const p = new NotificationPreferences({ storePath: tmpPath('p.jsonl') });
  const def = types.get('system_maintenance');
  const rEmail = await p.shouldDeliver('u1', 'email', def);
  const rSms   = await p.shouldDeliver('u1', 'sms', def);
  assert.equal(rEmail.allow, true);
  assert.equal(rSms.allow, false);
  assert.equal(rSms.reason, 'info_email_only');
});

test('preferences: shouldDeliver — channel disabled blocks normal priority', async () => {
  const p = new NotificationPreferences({ storePath: tmpPath('p.jsonl') });
  await p.set('u1', { channels: { whatsapp: false } });
  const def = types.get('wage_slip_ready');
  const r = await p.shouldDeliver('u1', 'whatsapp', def);
  assert.equal(r.allow, false);
  assert.equal(r.reason, 'channel_disabled');
});

// ───────────────────────────────────────────────────────────────
// notification-queue
// ───────────────────────────────────────────────────────────────

test('queue: enqueue then peekDueBatch returns due jobs', () => {
  const q = new NotificationQueue({ logPath: tmpPath('q.jsonl'), dlqPath: tmpPath('dlq.jsonl') });
  q.enqueue({ userId: 'u1', channel: 'email', body: 'x' });
  q.enqueue({ userId: 'u2', channel: 'sms',   body: 'y' });
  const batch = q.peekDueBatch();
  assert.equal(batch.length, 2);
});

test('queue: fail reschedules with exponential backoff and eventually DLQ', () => {
  const q = new NotificationQueue({
    logPath: tmpPath('q.jsonl'),
    dlqPath: tmpPath('dlq.jsonl'),
    retryDelaysMs: [0, 1, 1, 1, 1, 1, 1],
  });
  const id = q.enqueue({ userId: 'u1', channel: 'email' });
  // 6 retries → 7th attempt → DLQ
  assert.equal(q.fail(id, new Error('e1')), 'retry');
  assert.equal(q.fail(id, new Error('e2')), 'retry');
  assert.equal(q.fail(id, new Error('e3')), 'retry');
  assert.equal(q.fail(id, new Error('e4')), 'retry');
  assert.equal(q.fail(id, new Error('e5')), 'retry');
  assert.equal(q.fail(id, new Error('e6')), 'retry');
  assert.equal(q.fail(id, new Error('e7')), 'dlq');
  const dlq = q.dlqList();
  assert.equal(dlq.length, 1);
  assert.equal(dlq[0].attempts, 7);
});

test('queue: ack removes the job', () => {
  const q = new NotificationQueue({ logPath: tmpPath('q.jsonl'), dlqPath: tmpPath('dlq.jsonl') });
  const id = q.enqueue({ userId: 'u1' });
  assert.equal(q.stats().pending, 1);
  q.ack(id);
  assert.equal(q.stats().pending, 0);
});

test('queue: tryDrain batches up to 10', async () => {
  const q = new NotificationQueue({ logPath: tmpPath('q.jsonl'), dlqPath: tmpPath('dlq.jsonl') });
  for (let i = 0; i < 25; i++) q.enqueue({ i });
  let processed = 0;
  const summary = await q.tryDrain(async () => { processed++; return { ok: true }; });
  assert.equal(summary.processed, 10);
  assert.equal(summary.acked, 10);
  assert.equal(processed, 10);
  assert.equal(q.stats().pending, 15);
});

test('queue: replay rebuilds state from JSONL', () => {
  const logPath = tmpPath('q.jsonl');
  const dlqPath = tmpPath('dlq.jsonl');
  const q1 = new NotificationQueue({ logPath, dlqPath });
  q1.enqueue({ a: 1 });
  q1.enqueue({ a: 2 });
  // New instance → replays log
  const q2 = new NotificationQueue({ logPath, dlqPath });
  assert.equal(q2.stats().pending, 2);
});

// ───────────────────────────────────────────────────────────────
// notification-history
// ───────────────────────────────────────────────────────────────

test('history: record + getUnread + markRead', async () => {
  const h = new NotificationHistory({ storePath: tmpPath('h.jsonl') });
  const r = await h.record({
    userId: 'u1', typeId: 'payment_received', priority: 'normal',
    title: 'שלום', body: 'body', channels: ['email'], deliveredOn: ['email'],
  });
  assert.ok(r.id);
  let unread = h.getUnread('u1');
  assert.equal(unread.length, 1);
  await h.markRead(r.id);
  unread = h.getUnread('u1');
  assert.equal(unread.length, 0);
});

test('history: countRecent excludes critical, enforces cutoff', async () => {
  const h = new NotificationHistory({ storePath: tmpPath('h.jsonl') });
  await h.record({ userId: 'u1', typeId: 'wage_slip_ready', priority: 'normal', channels: [] });
  await h.record({ userId: 'u1', typeId: 'security_alert',  priority: 'critical', channels: [] });
  const n = h.countRecent('u1', 60 * 60 * 1000);
  assert.equal(n, 1);
});

test('history: lastEmissionOfType tracks per-type throttle', async () => {
  const h = new NotificationHistory({ storePath: tmpPath('h.jsonl') });
  const before = Date.now() - 10;
  await h.record({ userId: 'u1', typeId: 'wage_slip_ready', priority: 'normal', channels: [] });
  const last = h.lastEmissionOfType('u1', 'wage_slip_ready');
  assert.ok(last >= before);
  assert.equal(h.lastEmissionOfType('u1', 'payment_received'), 0);
});

// ───────────────────────────────────────────────────────────────
// notification-service (end-to-end)
// ───────────────────────────────────────────────────────────────

test('service: unknown type is skipped cleanly', async () => {
  const { svc } = makeSvc();
  const r = await svc.notify('u1', 'not_a_real_type', {});
  assert.equal(r.skippedReason, 'unknown_type');
});

test('service: info priority emits email + in_app only', async () => {
  let smsCalls = 0;
  const { svc } = makeSvc({
    sms: async () => { smsCalls++; return { success: true }; },
  });
  const r = await svc.notify('u1', 'system_maintenance', {
    startTime: '02:00', endTime: '04:00', description: 'DB upgrade',
  });
  assert.ok(r.notificationId);
  assert.equal(smsCalls, 0);
  assert.ok(r.requestedChannels.includes('email'));
  assert.ok(r.requestedChannels.includes('in_app'));
  assert.ok(!r.requestedChannels.includes('sms'));
});

test('service: critical priority forces SMS + PUSH even when disabled in prefs', async () => {
  const { svc, preferences } = makeSvc();
  await preferences.set('u1', { channels: { sms: false, push: false } });
  const r = await svc.notify('u1', 'security_alert', {
    event: 'brute_force', ipAddress: '1.2.3.4',
  });
  assert.ok(r.requestedChannels.includes('sms'));
  assert.ok(r.requestedChannels.includes('push'));
});

test('service: adapter failure enqueues for retry', async () => {
  let calls = 0;
  const { svc, queue } = makeSvc({
    email: async () => { calls++; return { success: false, error: 'smtp_down' }; },
  });
  const r = await svc.notify('u1', 'wage_slip_ready', {
    employeeName: 'דנה', month: '2026-03',
  });
  assert.equal(calls, 1);
  assert.ok(r.failedOn.includes('email'));
  assert.equal(queue.stats().pending, 1);
});

test('service: successful delivery updates history.deliveredOn', async () => {
  const { svc, history } = makeSvc();
  const r = await svc.notify('u1', 'payment_received', {
    amount: 1000, customerName: 'אקמה', invoiceNumber: 'INV-1',
  });
  assert.ok(r.notificationId);
  const items = history.getHistory('u1');
  assert.equal(items.length, 1);
  assert.ok(items[0].deliveredOn.includes('email') || items[0].deliveredOn.includes('in_app'));
});

test('service: throttle blocks a duplicate within throttleSec', async () => {
  const { svc } = makeSvc();
  const a = await svc.notify('u1', 'wage_slip_ready', { employeeName: 'דנה', month: '2026-03' });
  assert.ok(a.notificationId);
  const b = await svc.notify('u1', 'wage_slip_ready', { employeeName: 'דנה', month: '2026-03' });
  assert.equal(b.skippedReason, 'throttled');
});

test('service: frequency cap blocks normal, still allows critical', async () => {
  const { svc, preferences } = makeSvc();
  await preferences.set('u1', { frequencyCap: 1 });
  // first non-critical passes
  const a = await svc.notify('u1', 'payment_received', { amount: 1, customerName: 'x', invoiceNumber: 'I1' });
  assert.ok(a.notificationId);
  // second is capped
  const b = await svc.notify('u1', 'payment_received', { amount: 2, customerName: 'y', invoiceNumber: 'I2' });
  assert.equal(b.skippedReason, 'frequency_cap');
  // critical still goes through
  const c = await svc.notify('u1', 'security_alert', { event: 'x', ipAddress: '1.1.1.1' });
  assert.ok(c.notificationId);
});

test('service: drainQueue processes retries in batches', async () => {
  let attempts = 0;
  const { svc, queue } = makeSvc({
    email: async () => {
      attempts++;
      return attempts === 1 ? { success: false, error: 'boom' } : { success: true };
    },
  });
  await svc.notify('u1', 'wage_slip_ready', { employeeName: 'דנה', month: '2026-03' });
  // First call failed, second should succeed via drain
  assert.equal(queue.stats().pending, 1);
  // bypass backoff: force nextAttemptAt to now
  for (const j of queue.jobs.values()) j.nextAttemptAt = 0;
  const summary = await svc.drainQueue();
  assert.equal(summary.acked, 1);
  assert.equal(queue.stats().pending, 0);
});

test('service: queueOnly flag defers dispatch', async () => {
  let calls = 0;
  const { svc, queue } = makeSvc({
    email: async () => { calls++; return { success: true }; },
  });
  const r = await svc.notify(
    'u1', 'payment_received',
    { amount: 1, customerName: 'x', invoiceNumber: 'I1' },
    { queueOnly: true }
  );
  assert.equal(calls, 0);
  assert.ok(r.notificationId);
  assert.ok(r.queued >= 1);
  assert.ok(queue.stats().pending >= 1);
});

test('service: stats exposes queue/history/adapter summary', () => {
  const { svc } = makeSvc();
  const s = svc.stats();
  assert.ok(s.queue);
  assert.ok(s.history);
  assert.ok(s.adapters);
  assert.equal(s.adapters.email, true);
});

// ───────────────────────────────────────────────────────────────
// routes (shape test, no real express listener)
// ───────────────────────────────────────────────────────────────

test('routes: router factory returns a router with expected routes', () => {
  const { svc } = makeSvc();
  const { router } = require('./notification-routes');
  const r = router(svc);
  assert.ok(r);
  // express router exposes .stack with layer.route objects
  const paths = new Set();
  (r.stack || []).forEach((layer) => {
    if (layer.route && layer.route.path) paths.add(layer.route.path);
  });
  assert.ok(paths.has('/api/notifications'));
  assert.ok(paths.has('/api/notifications/history'));
  assert.ok(paths.has('/api/notifications/preferences'));
  assert.ok(paths.has('/api/notifications/:id/read'));
  assert.ok(paths.has('/api/notifications/types'));
  assert.ok(paths.has('/api/notifications/stats'));
  assert.ok(paths.has('/api/notifications/send'));
});

test('routes: resolveUserId prefers actor > header > query > body', () => {
  const { resolveUserId } = require('./notification-routes');
  assert.equal(resolveUserId({ actor: { user: 'a' }, headers: { 'x-user-id': 'h' } }), 'a');
  assert.equal(resolveUserId({ headers: { 'x-user-id': 'h' }, query: { userId: 'q' } }), 'h');
  assert.equal(resolveUserId({ query: { userId: 'q' }, body: { userId: 'b' } }), 'q');
  assert.equal(resolveUserId({ body: { userId: 'b' } }), 'b');
  assert.equal(resolveUserId({}), null);
});
