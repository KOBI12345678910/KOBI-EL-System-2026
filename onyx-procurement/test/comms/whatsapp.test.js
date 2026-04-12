// Agent Y123 — Tests for WhatsApp Business adapter
// =============================================================
// File: onyx-procurement/test/comms/whatsapp.test.js
//
// Zero-dependency test runner: plain `node --test` (built into Node
// 18+). No Jest / Mocha / Vitest needed. Run with:
//
//   cd onyx-procurement
//   node --test test/comms/whatsapp.test.js
//
// Covers:
//   * template registration + send path
//   * interactive button & list rendering
//   * webhook verification handshake
//   * 24-hour customer service window tracking
//   * opt-in / opt-out audit records (append-only)
//   * free-form text refused outside the 24h window
//   * bilingual (Hebrew + English) content
//   * tier / rate-limit accounting
//   * house rule: nothing is ever deleted

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  WhatsApp,
  TIER_LIMITS,
  TEMPLATE_STATUS,
  WINDOW_MS,
  normalisePhone,
} = require('../../src/comms/whatsapp');

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
function fresh(options) {
  return new WhatsApp({
    phoneNumberId: 'PHONE_TEST',
    businessAccountId: 'WABA_TEST',
    accessToken: 'token',
    verifyToken: 'verify-token-abc',
    appSecret: 'app-secret',
    ...(options || {}),
  });
}

function openWindowFor(wa, phone) {
  // Simulate the user sending an inbound message to open the 24h window.
  wa.handleIncoming({
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: 'wamid.user.' + phone + '.' + Date.now(),
            from: phone,
            type: 'text',
            text: { body: 'שלום' },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  });
}

// -------------------------------------------------------------
// normalisePhone
// -------------------------------------------------------------
test('normalisePhone — Israeli domestic converts to E.164 without plus', () => {
  assert.equal(normalisePhone('050-1234567'), '972501234567');
  assert.equal(normalisePhone('0501234567'),  '972501234567');
  assert.equal(normalisePhone('+972501234567'), '972501234567');
  assert.equal(normalisePhone('972 50 123 4567'), '972501234567');
  assert.throws(() => normalisePhone('abc'));
  assert.throws(() => normalisePhone(''));
});

// -------------------------------------------------------------
// template register + send path
// -------------------------------------------------------------
test('registerTemplate — appends pending then approved snapshot', async () => {
  const wa = fresh();
  const approved = await wa.registerTemplate({
    name: 'invoice_reminder',
    category: 'UTILITY',
    language: 'he',
    components: [
      { type: 'HEADER', text: 'תזכורת תשלום' },
      { type: 'BODY',   text: 'שלום {{1}}, חשבונית {{2}} על סך {{3}} ₪ ממתינה לתשלום.' },
      { type: 'FOOTER', text: 'טכנו-קול עוזי' },
    ],
  });
  assert.equal(approved.status, TEMPLATE_STATUS.APPROVED);

  // Append-only: history has BOTH the PENDING and APPROVED rows.
  const history = wa.templateHistory('invoice_reminder');
  assert.equal(history.length, 2);
  assert.equal(history[0].status, TEMPLATE_STATUS.PENDING);
  assert.equal(history[1].status, TEMPLATE_STATUS.APPROVED);
});

test('sendTemplate — dispatches approved template with parameters', async () => {
  const wa = fresh();
  await wa.registerTemplate({
    name: 'payment_received',
    category: 'UTILITY',
    language: 'he',
    components: [
      { type: 'BODY', text: 'תודה {{1}}, קיבלנו {{2}} ₪ (אסמכתא {{3}}).' },
    ],
  });
  wa.optIn({ phoneNumber: '0501234567', source: 'website', consentText: 'מסכים לקבל הודעות' });

  const envelope = await wa.sendTemplate({
    to: '0501234567',
    templateName: 'payment_received',
    language: 'he',
    parameters: ['קובי', '12,345', 'R-4242'],
  });
  assert.equal(envelope.kind, 'template');
  assert.equal(envelope.to, '972501234567');
  assert.equal(envelope.templateName, 'payment_received');
  assert.ok(envelope.wamid.startsWith('wamid'));

  // Mock transport recorded the exact Cloud API body.
  const req = wa.mockInbox()[wa.mockInbox().length - 1];
  assert.equal(req.method, 'POST');
  assert.match(req.path, /\/PHONE_TEST\/messages$/);
  assert.equal(req.body.template.name, 'payment_received');
  assert.equal(req.body.template.language.code, 'he');
  assert.equal(req.body.template.components[0].parameters.length, 3);
  assert.equal(req.body.template.components[0].parameters[0].text, 'קובי');

  // messageStatus returns the seeded "sent" record.
  const st = wa.messageStatus({ messageId: envelope.wamid });
  assert.equal(st.latest, 'sent');
});

test('sendTemplate — refuses unregistered template name', async () => {
  const wa = fresh();
  await assert.rejects(
    () => wa.sendTemplate({ to: '0501234567', templateName: 'nope' }),
    /has not been registered/
  );
});

// -------------------------------------------------------------
// Interactive button + list rendering
// -------------------------------------------------------------
test('sendInteractive — renders a button message with Hebrew replies', async () => {
  const wa = fresh();
  openWindowFor(wa, '972501234567'); // open 24h window first
  const env = await wa.sendInteractive({
    to: '972501234567',
    type: 'button',
    header: 'אישור הזמנה',
    body: 'האם לאשר את הזמנת הרכש מס׳ 4242?',
    footer: 'טכנו-קול עוזי',
    action: {
      buttons: [
        { id: 'approve', title: 'אשר' },
        { id: 'reject',  title: 'דחה' },
        { id: 'later',   title: 'מאוחר יותר' },
      ],
    },
  });
  assert.equal(env.interactiveType, 'button');

  const req = wa.mockInbox()[wa.mockInbox().length - 1];
  assert.equal(req.body.type, 'interactive');
  assert.equal(req.body.interactive.type, 'button');
  assert.equal(req.body.interactive.header.text, 'אישור הזמנה');
  assert.equal(req.body.interactive.action.buttons.length, 3);
  assert.equal(req.body.interactive.action.buttons[0].reply.title, 'אשר');
});

test('sendInteractive — renders a list message', async () => {
  const wa = fresh();
  openWindowFor(wa, '972501234567');
  await wa.sendInteractive({
    to: '972501234567',
    type: 'list',
    body: 'בחר קטגוריה',
    action: {
      button: 'בחר',
      sections: [{
        title: 'מוצרים',
        rows: [
          { id: 'p1', title: 'צבע לבן' },
          { id: 'p2', title: 'מדלל' },
        ],
      }],
    },
  });
  const req = wa.mockInbox()[wa.mockInbox().length - 1];
  assert.equal(req.body.interactive.type, 'list');
  assert.equal(req.body.interactive.action.button, 'בחר');
  assert.equal(req.body.interactive.action.sections[0].rows.length, 2);
});

// -------------------------------------------------------------
// Webhook verification
// -------------------------------------------------------------
test('verifyWebhook — returns challenge on valid handshake', () => {
  const wa = fresh();
  const out = wa.verifyWebhook({
    mode: 'subscribe',
    token: 'verify-token-abc',
    challenge: '42',
  });
  assert.equal(out, '42');
});

test('verifyWebhook — rejects bad token', () => {
  const wa = fresh();
  assert.equal(
    wa.verifyWebhook({ mode: 'subscribe', token: 'wrong', challenge: 'x' }),
    null
  );
});

// -------------------------------------------------------------
// 24h window tracking
// -------------------------------------------------------------
test('conversationWindow — closed before any inbound, open after', () => {
  const wa = fresh();
  const before = wa.conversationWindow('972501234567');
  assert.equal(before.open, false);
  assert.equal(before.remainingMs, 0);

  openWindowFor(wa, '972501234567');
  const after = wa.conversationWindow('972501234567');
  assert.equal(after.open, true);
  assert.ok(after.remainingMs > 0);
  assert.ok(after.remainingMs <= WINDOW_MS);
  assert.equal(after.inboundCount, 1);
});

test('sendText — refused when 24h window is closed', async () => {
  const wa = fresh();
  await assert.rejects(
    () => wa.sendText({ to: '0501234567', text: 'שלום, איך אפשר לעזור?' }),
    /24h window is closed/
  );
});

test('sendText — allowed when window is open (Hebrew)', async () => {
  const wa = fresh();
  openWindowFor(wa, '972501234567');
  const env = await wa.sendText({ to: '0501234567', text: 'שלום, קיבלנו את פנייתך.' });
  assert.equal(env.kind, 'text');
  const req = wa.mockInbox()[wa.mockInbox().length - 1];
  assert.equal(req.body.text.body, 'שלום, קיבלנו את פנייתך.');
});

// -------------------------------------------------------------
// Opt-in / opt-out audit (append-only)
// -------------------------------------------------------------
test('optIn — records consent and passes hasOptIn check', () => {
  const wa = fresh();
  const rec = wa.optIn({
    phoneNumber: '0501234567',
    source: 'signup_form_he',
    consentText: 'אני מסכים/ה לקבל הודעות מטכנו-קול עוזי',
  });
  assert.equal(rec.phoneNumber, '972501234567');
  assert.equal(rec.source, 'signup_form_he');
  assert.equal(rec.locale, 'he');
  assert.equal(wa.hasOptIn('0501234567'), true);
});

test('optOut — blocks further sends but preserves opt-in history', async () => {
  const wa = fresh();
  wa.optIn({ phoneNumber: '0501234567', source: 'website' });
  wa.optOut({ phoneNumber: '0501234567', reason: 'unit_test' });
  assert.equal(wa.hasOptIn('0501234567'), false);

  // Consent history retains BOTH events — nothing is deleted.
  const history = wa.consentHistory('0501234567');
  assert.equal(history.length, 2);
  assert.equal(history[0].event, 'opt_in');
  assert.equal(history[1].event, 'opt_out');

  // Register a template, then try to send — must fail on opt-out.
  await wa.registerTemplate({
    name: 'payment_received',
    category: 'UTILITY',
    language: 'he',
    components: [{ type: 'BODY', text: 'שלום {{1}}.' }],
  });
  await assert.rejects(
    () => wa.sendTemplate({
      to: '0501234567',
      templateName: 'payment_received',
      parameters: ['א'],
    }),
    /has opted out/
  );
});

test('handleIncoming — STOP keyword triggers automatic opt-out', () => {
  const wa = fresh();
  wa.optIn({ phoneNumber: '972501234567', source: 'website' });
  const out = wa.handleIncoming({
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: 'wamid.stop.1',
            from: '972501234567',
            type: 'text',
            text: { body: 'ביטול' },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  });
  assert.equal(out.optOuts.length, 1);
  assert.equal(wa.hasOptIn('972501234567'), false);
});

test('handleIncoming — delivery status propagates to messageStatus', async () => {
  const wa = fresh();
  await wa.registerTemplate({
    name: 'payment_received',
    category: 'UTILITY',
    language: 'he',
    components: [{ type: 'BODY', text: 'תודה {{1}}.' }],
  });
  wa.optIn({ phoneNumber: '0501234567', source: 'website' });
  const env = await wa.sendTemplate({
    to: '0501234567',
    templateName: 'payment_received',
    parameters: ['קובי'],
  });

  wa.handleIncoming({
    entry: [{
      changes: [{
        value: {
          statuses: [{
            id: env.wamid,
            status: 'delivered',
            recipient_id: '972501234567',
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  });
  const st = wa.messageStatus({ messageId: env.wamid });
  assert.equal(st.latest, 'delivered');
  assert.ok(st.history.length >= 2); // sent + delivered
});

// -------------------------------------------------------------
// Tier / rate limiting
// -------------------------------------------------------------
test('rateLimits — switches tier and records history (append-only)', () => {
  const wa = fresh();
  assert.equal(wa.rateLimits().tier, 'TIER_1K');
  wa.rateLimits(2);
  assert.equal(wa.rateLimits().tier, 'TIER_10K');
  wa.rateLimits({ tier: 'TIER_100K', reason: 'growth_phase' });
  const info = wa.rateLimits();
  assert.equal(info.tier, 'TIER_100K');
  assert.equal(info.limitPerDay, TIER_LIMITS.TIER_100K);
  assert.ok(info.history.length >= 3);
});

// -------------------------------------------------------------
// Bilingual English path
// -------------------------------------------------------------
test('sendText — supports English content inside the window', async () => {
  const wa = fresh();
  openWindowFor(wa, '972501234567');
  await wa.sendText({ to: '0501234567', text: 'Hi, your PO was approved.' });
  const req = wa.mockInbox()[wa.mockInbox().length - 1];
  assert.equal(req.body.text.body, 'Hi, your PO was approved.');
});

// -------------------------------------------------------------
// House rule
// -------------------------------------------------------------
test('house rule — no state mutation or deletion after send', async () => {
  const wa = fresh();
  await wa.registerTemplate({
    name: 'payment_received',
    category: 'UTILITY',
    language: 'he',
    components: [{ type: 'BODY', text: 'שלום {{1}}.' }],
  });
  wa.optIn({ phoneNumber: '0501234567', source: 'website' });
  const env = await wa.sendTemplate({
    to: '0501234567',
    templateName: 'payment_received',
    parameters: ['קובי'],
  });

  const outbox1 = wa.outbox();
  const audit1 = wa.auditLog();
  // Attempt to mutate the returned snapshots — they're frozen.
  assert.throws(() => { env.to = 'evil'; });
  // The internal arrays should be unchanged because they return copies.
  const outbox2 = wa.outbox();
  outbox2.push('garbage');
  assert.equal(wa.outbox().length, outbox1.length);
  assert.ok(audit1.length > 0);
});
