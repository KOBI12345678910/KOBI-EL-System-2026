/**
 * Agent-Y122 — SMS Gateway tests
 * Zero-dependency: uses node:test + node:assert.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — these tests only add
 * coverage, never remove existing cases from sibling suites.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SMSGateway,
  InforuProvider,
  Mobile019Provider,
  Sms4FreeProvider,
  MessageNetProvider,
  TrueDialogProvider,
  IL_MOBILE_PREFIXES,
  PROVIDER_DEFAULTS
} = require('../../src/comms/sms-gateway.js');

// ────────────────────────────────────────────────────────────────
// phoneNormalize
// ────────────────────────────────────────────────────────────────
test('phoneNormalize: local 0501234567 → +972501234567', () => {
  const g = new SMSGateway();
  assert.equal(g.phoneNormalize('0501234567'), '+972501234567');
});

test('phoneNormalize: +972501234567 passes through unchanged', () => {
  const g = new SMSGateway();
  assert.equal(g.phoneNormalize('+972501234567'), '+972501234567');
});

test('phoneNormalize: dashes, spaces, parentheses accepted', () => {
  const g = new SMSGateway();
  assert.equal(g.phoneNormalize('050-123-4567'), '+972501234567');
  assert.equal(g.phoneNormalize('(050) 123 4567'), '+972501234567');
  assert.equal(g.phoneNormalize(' 050.123.4567 '), '+972501234567');
});

test('phoneNormalize: 00972 international prefix', () => {
  const g = new SMSGateway();
  assert.equal(g.phoneNormalize('00972501234567'), '+972501234567');
});

test('phoneNormalize: 972 without + also normalized', () => {
  const g = new SMSGateway();
  assert.equal(g.phoneNormalize('972501234567'), '+972501234567');
});

test('phoneNormalize: invalid inputs return null', () => {
  const g = new SMSGateway();
  assert.equal(g.phoneNormalize(''), null);
  assert.equal(g.phoneNormalize(null), null);
  assert.equal(g.phoneNormalize(undefined), null);
  assert.equal(g.phoneNormalize('abc'), null);
  assert.equal(g.phoneNormalize('12345'), null);
  assert.equal(g.phoneNormalize('123456789012345'), null);
});

// ────────────────────────────────────────────────────────────────
// validateIsraeliMobile
// ────────────────────────────────────────────────────────────────
test('validateIsraeliMobile: 050-059 accepted with carrier name', () => {
  const g = new SMSGateway();
  for (let p = 50; p <= 59; p++) {
    const res = g.validateIsraeliMobile(`0${p}1234567`);
    assert.equal(res.valid, true, `prefix 0${p}`);
    assert.equal(res.prefix, `0${p}`);
    assert.ok(res.carrier && res.carrier.length > 0, 'carrier should be populated');
  }
});

test('validateIsraeliMobile: landline 03-1234567 rejected (NOT_MOBILE_PREFIX)', () => {
  const g = new SMSGateway();
  // Tel Aviv landline: 10 digits like a mobile but 03 prefix.
  const res = g.validateIsraeliMobile('0312345678');
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'NOT_MOBILE_PREFIX');
});

test('validateIsraeliMobile: garbage → invalid', () => {
  const g = new SMSGateway();
  const res = g.validateIsraeliMobile('lol');
  assert.equal(res.valid, false);
});

test('validateIsraeliMobile: Pelephone recognized on 050', () => {
  const g = new SMSGateway();
  const res = g.validateIsraeliMobile('0501234567');
  assert.equal(res.carrier, 'Pelephone');
});

// ────────────────────────────────────────────────────────────────
// detectUnicode + charLimits
// ────────────────────────────────────────────────────────────────
test('detectUnicode: plain English → false (GSM-7)', () => {
  const g = new SMSGateway();
  assert.equal(g.detectUnicode('Hello world'), false);
});

test('detectUnicode: Hebrew → true (UCS-2)', () => {
  const g = new SMSGateway();
  assert.equal(g.detectUnicode('שלום עולם'), true);
});

test('detectUnicode: mixed Hebrew + English → true', () => {
  const g = new SMSGateway();
  assert.equal(g.detectUnicode('Hello שלום'), true);
});

test('detectUnicode: emoji → true', () => {
  const g = new SMSGateway();
  // Use \u{} escape so the emoji survives file-encoding round-trips.
  assert.equal(g.detectUnicode('nice \u{1F44D}'), true);
});

test('charLimits: returns 70/67 for Hebrew, 160/153 for GSM-7', () => {
  const g = new SMSGateway();
  assert.deepEqual(g.charLimits('שלום'), { unicode: true,  singleLimit: 70,  multiLimit: 67  });
  assert.deepEqual(g.charLimits('Hello'), { unicode: false, singleLimit: 160, multiLimit: 153 });
});

// ────────────────────────────────────────────────────────────────
// longSMSSplit
// ────────────────────────────────────────────────────────────────
test('longSMSSplit: short GSM-7 → 1 segment', () => {
  const g = new SMSGateway();
  const r = g.longSMSSplit({ text: 'Hello' });
  assert.equal(r.segments, 1);
  assert.equal(r.unicode, false);
  assert.deepEqual(r.parts, ['Hello']);
});

test('longSMSSplit: 160 char GSM-7 still 1 segment', () => {
  const g = new SMSGateway();
  const s = 'a'.repeat(160);
  const r = g.longSMSSplit({ text: s });
  assert.equal(r.segments, 1);
  assert.equal(r.parts[0].length, 160);
});

test('longSMSSplit: 161 char GSM-7 → 2 segments of 153', () => {
  const g = new SMSGateway();
  const s = 'a'.repeat(161);
  const r = g.longSMSSplit({ text: s });
  assert.equal(r.segments, 2);
  assert.equal(r.parts[0].length, 153);
  assert.equal(r.parts[1].length, 8);
});

test('longSMSSplit: short Hebrew → 1 segment', () => {
  const g = new SMSGateway();
  const r = g.longSMSSplit({ text: 'שלום' });
  assert.equal(r.segments, 1);
  assert.equal(r.unicode, true);
});

test('longSMSSplit: 71-char Hebrew → 2 segments (UCS-2, 67 per)', () => {
  const g = new SMSGateway();
  const s = 'א'.repeat(71);
  const r = g.longSMSSplit({ text: s });
  assert.equal(r.unicode, true);
  assert.equal(r.segments, 2);
  assert.equal(r.parts[0].length, 67);
  assert.equal(r.parts[1].length, 4);
});

test('longSMSSplit: 200-char Hebrew → 3 segments', () => {
  const g = new SMSGateway();
  const s = 'ש'.repeat(200);
  const r = g.longSMSSplit({ text: s });
  assert.equal(r.segments, 3);
  // 67 + 67 + 66 = 200
  assert.equal(r.parts[0].length + r.parts[1].length + r.parts[2].length, 200);
});

test('longSMSSplit: empty text → 1 empty segment', () => {
  const g = new SMSGateway();
  const r = g.longSMSSplit({ text: '' });
  assert.equal(r.segments, 1);
  assert.equal(r.parts[0], '');
});

// ────────────────────────────────────────────────────────────────
// optOutHandling
// ────────────────────────────────────────────────────────────────
test('optOutHandling: adds STOP opt-out and blocks future sends', async () => {
  const g = new SMSGateway();
  const r = g.optOutHandling({ phoneNumber: '0501234567', keyword: 'STOP' });
  assert.equal(r.ok, true);
  assert.equal(r.optedOut, true);

  const send = await g.send({ to: '0501234567', text: 'Hi' });
  assert.equal(send.ok, false);
  assert.equal(send.error, 'RECIPIENT_OPTED_OUT');
});

test('optOutHandling: Hebrew keyword הסר recognized', () => {
  const g = new SMSGateway();
  const r = g.optOutHandling({ phoneNumber: '0521234567', keyword: 'הסר' });
  assert.equal(r.ok, true);
  assert.equal(r.optedOut, true);
  assert.equal(r.keyword, 'הסר');
});

test('optOutHandling: עצור also recognized', () => {
  const g = new SMSGateway();
  const r = g.optOutHandling({ phoneNumber: '0541234567', keyword: 'עצור' });
  assert.equal(r.ok, true);
  assert.equal(r.optedOut, true);
});

test('optOutHandling: check mode returns current status', () => {
  const g = new SMSGateway();
  let r = g.optOutHandling({ phoneNumber: '0501234567', mode: 'check' });
  assert.equal(r.optedOut, false);
  g.optOutHandling({ phoneNumber: '0501234567', keyword: 'STOP' });
  r = g.optOutHandling({ phoneNumber: '0501234567', mode: 'check' });
  assert.equal(r.optedOut, true);
});

test('optOutHandling: second opt-out does NOT overwrite first (append-only)', () => {
  const g = new SMSGateway();
  g.optOutHandling({ phoneNumber: '0501234567', keyword: 'STOP' });
  const before = g.optOutHandling({ phoneNumber: '0501234567', mode: 'check' });
  g.optOutHandling({ phoneNumber: '0501234567', keyword: 'הסר' });
  const after = g.optOutHandling({ phoneNumber: '0501234567', mode: 'check' });
  assert.equal(before.keyword, after.keyword, 'first opt-out keyword must be preserved');
});

test('optOutHandling: invalid phone returns INVALID_PHONE', () => {
  const g = new SMSGateway();
  const r = g.optOutHandling({ phoneNumber: 'junk', keyword: 'STOP' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'INVALID_PHONE');
});

// ────────────────────────────────────────────────────────────────
// costEstimate
// ────────────────────────────────────────────────────────────────
test('costEstimate: Hebrew 1 segment → per-provider prices populated', () => {
  const g = new SMSGateway();
  const r = g.costEstimate({ text: 'שלום', to: '0501234567' });
  assert.equal(r.segments, 1);
  assert.equal(r.unicode, true);
  assert.ok('inforu' in r.perProvider);
  assert.ok('019mobile' in r.perProvider);
  assert.ok('sms4free' in r.perProvider);
  assert.ok('messagenet' in r.perProvider);
  assert.ok('truedialog' in r.perProvider);
  assert.equal(r.perProvider.sms4free, 0, 'sms4free should be free (0 NIS)');
});

test('costEstimate: long Hebrew multiplies by segment count', () => {
  const g = new SMSGateway();
  const long = 'ש'.repeat(200); // 3 segments
  const r = g.costEstimate({ text: long, to: '0501234567' });
  assert.equal(r.segments, 3);
  assert.equal(r.perProvider.inforu, +(PROVIDER_DEFAULTS.inforu.cost * 3).toFixed(4));
});

test('costEstimate: English short → GSM-7 1 segment', () => {
  const g = new SMSGateway();
  const r = g.costEstimate({ text: 'Hello there', to: '0501234567' });
  assert.equal(r.segments, 1);
  assert.equal(r.unicode, false);
});

test('costEstimate: carries Israeli carrier name in result', () => {
  const g = new SMSGateway();
  const r = g.costEstimate({ text: 'hi', to: '0541234567' });
  assert.equal(r.carrier, 'Partner');
});

// ────────────────────────────────────────────────────────────────
// chooseProvider + rateLimit
// ────────────────────────────────────────────────────────────────
test('chooseProvider: dedupes and preserves order', () => {
  const g = new SMSGateway();
  const chain = g.chooseProvider({
    preferences: ['inforu', 'messagenet', 'inforu'],
    fallback: ['truedialog', 'messagenet']
  });
  assert.deepEqual(chain, ['inforu', 'messagenet', 'truedialog']);
});

test('chooseProvider: unknown names are filtered out', () => {
  const g = new SMSGateway();
  const chain = g.chooseProvider({
    preferences: ['bogus', 'inforu'],
    fallback: ['alsobogus', 'messagenet']
  });
  assert.deepEqual(chain, ['inforu', 'messagenet']);
});

test('rateLimit: sequential calls up to ceiling allowed', () => {
  const g = new SMSGateway();
  for (let i = 0; i < 5; i++) {
    const r = g.rateLimit({ provider: 'inforu', perSecond: 5 });
    assert.equal(r.allowed, true, `call ${i}`);
  }
  const over = g.rateLimit({ provider: 'inforu', perSecond: 5 });
  assert.equal(over.allowed, false);
  assert.ok(over.waitMs > 0);
});

// ────────────────────────────────────────────────────────────────
// send + audit log
// ────────────────────────────────────────────────────────────────
test('send: happy path returns messageId + audit entry', async () => {
  const g = new SMSGateway();
  const r = await g.send({ to: '0501234567', text: 'שלום', senderName: 'ONYX' });
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'inforu');
  assert.equal(r.to, '+972501234567');
  assert.ok(r.messageId);
  const audit = g.auditLog({ messageId: r.messageId });
  assert.ok(audit.length >= 1);
});

test('send: invalid phone returns INVALID_PHONE without crashing', async () => {
  const g = new SMSGateway();
  const r = await g.send({ to: 'junk', text: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'INVALID_PHONE');
});

test('send: sender name >11 chars rejected', async () => {
  const g = new SMSGateway();
  const r = await g.send({ to: '0501234567', text: 'x', senderName: 'VeryLongSenderName' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'SENDER_INVALID');
});

test('send: missing sender name → SENDER_REQUIRED', async () => {
  const g = new SMSGateway();
  const r = await g.send({ to: '0501234567', text: 'x', senderName: '' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'SENDER_REQUIRED');
});

test('send: preferences override default provider', async () => {
  const g = new SMSGateway();
  const r = await g.send({
    to: '0501234567',
    text: 'x',
    preferences: ['messagenet']
  });
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'messagenet');
});

// ────────────────────────────────────────────────────────────────
// deliveryReport
// ────────────────────────────────────────────────────────────────
test('deliveryReport: request + ingest DELIVERED status', async () => {
  const g = new SMSGateway();
  const r = await g.send({ to: '0501234567', text: 'hi', deliveryReport: true });
  assert.equal(r.ok, true);
  const q1 = g.deliveryReport({ messageId: r.messageId });
  assert.equal(q1.status, 'QUEUED');
  const q2 = g.deliveryReport({ messageId: r.messageId, status: 'DELIVERED' });
  assert.equal(q2.status, 'DELIVERED');
  assert.ok(q2.updates.length >= 2, 'should accumulate updates');
});

test('deliveryReport: unknown status rejected', () => {
  const g = new SMSGateway();
  const r = g.deliveryReport({ messageId: 'x', status: 'FOO' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'INVALID_STATUS');
});

// ────────────────────────────────────────────────────────────────
// scheduledSend
// ────────────────────────────────────────────────────────────────
test('scheduledSend: queues entry with ISO sendAt', () => {
  const g = new SMSGateway();
  const r = g.scheduledSend({
    sendAt: new Date(Date.now() + 60_000),
    to: '0501234567',
    text: 'later'
  });
  assert.equal(r.ok, true);
  assert.ok(r.scheduledId);
});

test('scheduledSend: numeric seconds-from-now accepted', () => {
  const g = new SMSGateway();
  const r = g.scheduledSend({ sendAt: 30, to: '0501234567', text: 'later' });
  assert.equal(r.ok, true);
});

test('scheduledSend: invalid sendAt rejected', () => {
  const g = new SMSGateway();
  const r = g.scheduledSend({ sendAt: 'not a date', to: '0501234567', text: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'INVALID_SEND_AT');
});

test('scheduledSend: runDueScheduled dispatches past entries', async () => {
  const g = new SMSGateway();
  g.scheduledSend({ sendAt: 1, to: '0501234567', text: 'past', senderName: 'ONYX' });
  await new Promise((r) => setTimeout(r, 1100));
  const out = await g.runDueScheduled();
  assert.ok(out.length >= 1);
  assert.equal(out[0].ok, true);
});

// ────────────────────────────────────────────────────────────────
// bulkSend
// ────────────────────────────────────────────────────────────────
test('bulkSend: mixed list processes each recipient', async () => {
  const g = new SMSGateway();
  const r = await g.bulkSend({
    recipients: ['0501234567', '0521234567', '0541234567'],
    text: 'שלום',
    senderName: 'ONYX'
  });
  assert.equal(r.ok, true);
  assert.equal(r.count, 3);
  assert.equal(r.results.filter((x) => x.ok).length, 3);
});

test('bulkSend: non-array recipients rejected', async () => {
  const g = new SMSGateway();
  const r = await g.bulkSend({ recipients: 'not-array', text: 'x' });
  assert.equal(r.ok, false);
});

// ────────────────────────────────────────────────────────────────
// Compliance helpers
// ────────────────────────────────────────────────────────────────
test('complianceFooter: includes Hebrew unsubscribe notice', () => {
  const g = new SMSGateway();
  const footer = g.complianceFooter('ONYX');
  assert.ok(footer.includes('ONYX'));
  assert.ok(footer.includes('הסר'));
});

test('withCompliance: adds footer unless keyword already present', () => {
  const g = new SMSGateway();
  const withFooter = g.withCompliance('שלום', 'ONYX');
  assert.ok(withFooter.includes('הסר'));
  const already = g.withCompliance('שלום הסר', 'ONYX');
  assert.equal(already, 'שלום הסר');
});

// ────────────────────────────────────────────────────────────────
// Provider class exports are usable standalone
// ────────────────────────────────────────────────────────────────
test('Provider classes: standalone mock send works', async () => {
  const p = new InforuProvider();
  const r = await p.send({ to: '+972501234567', text: 'x', segments: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'inforu');
  assert.equal(r.mocked, true);
});

test('SMS4Free: enforces freeLimit', async () => {
  const p = new Sms4FreeProvider();
  p.monthlyUsed = PROVIDER_DEFAULTS.sms4free.freeLimit; // cap
  const r = await p.send({ to: '+972501234567', text: 'x', segments: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'FREE_TIER_EXHAUSTED');
});

test('IL_MOBILE_PREFIXES export is frozen and covers 050-059', () => {
  assert.equal(Object.isFrozen(IL_MOBILE_PREFIXES), true);
  for (let p = 50; p <= 59; p++) {
    assert.ok(IL_MOBILE_PREFIXES[`0${p}`], `missing 0${p}`);
  }
});

// ════════════════════════════════════════════════════════════════
//   Y-122 upgrade suite — 18+ new tests (ADDED, none removed)
//   Covers: configure/injectTransport, sendY122 shape, sendBulk,
//   checkDeliveryStatus, handleIncoming, optOut/isOptedOut,
//   quietHours, unicodeHandling, messageTemplate, costEstimate,
//   history, §30א compliance (sender id + 3/24h cap + quiet hours),
//   provider comparison (Inforu/019/Unicell/Mock).
// ════════════════════════════════════════════════════════════════

test('Y122: configure accepts provider + credentials + senderId', () => {
  const g = new SMSGateway();
  const res = g.configure({
    provider: 'inforu',
    credentials: { user: 'u', token: 't' },
    senderId: 'OnyxERP'
  });
  assert.equal(res.ok, true);
  assert.equal(res.provider, 'inforu');
  assert.equal(res.senderId, 'OnyxERP');
  assert.equal(typeof res.injectTransport, 'function');
});

test('Y122: configure supports all three providers — inforu, 019, unicell, mock', () => {
  const g = new SMSGateway();
  for (const p of ['inforu', '019', 'unicell', 'mock']) {
    const r = g.configure({ provider: p, credentials: {}, senderId: 'X' });
    assert.equal(r.ok, true, `provider ${p} should configure ok`);
  }
});

test('Y122: configure unknown provider rejected', () => {
  const g = new SMSGateway();
  const r = g.configure({ provider: 'nowhere' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'UNKNOWN_PROVIDER');
  assert.ok(Array.isArray(r.known));
});

test('Y122: Israeli phone format validation — +972-5X-XXX-XXXX', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  // Valid local + E.164
  const a = await g.sendY122({
    to: '050-123-4567',
    message: 'OnyxERP: שלום',
    priority: 'transactional'
  });
  assert.equal(a.ok, true);
  const b = await g.sendY122({
    to: '+972521234567',
    message: 'OnyxERP: שלום',
    priority: 'transactional'
  });
  assert.equal(b.ok, true);
  // Invalid — landline
  const c = await g.sendY122({
    to: '03-1234567',
    message: 'OnyxERP: שלום',
    priority: 'transactional'
  });
  assert.equal(c.ok, false);
});

test('Y122: Hebrew message → UCS-2 split (unicodeHandling)', () => {
  const g = new SMSGateway();
  const long = 'ש'.repeat(200); // 3 UCS-2 segments
  const info = g.unicodeHandling(long);
  assert.equal(info.encoding, 'UCS-2');
  assert.equal(info.charsPerPart, 70);
  assert.equal(info.charsPerConcatPart, 67);
  assert.equal(info.segments, 3);
  assert.equal(info.parts.length, 3);
});

test('Y122: English message → GSM-7 encoding descriptor', () => {
  const g = new SMSGateway();
  const info = g.unicodeHandling('Hello from Onyx ERP');
  assert.equal(info.encoding, 'GSM-7');
  assert.equal(info.charsPerPart, 160);
  assert.equal(info.charsPerConcatPart, 153);
});

test('Y122: mock transport — injectTransport intercepts the send', async () => {
  const g = new SMSGateway();
  let captured = null;
  const handle = g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  handle.injectTransport(async (payload) => {
    captured = payload;
    return { ok: true, providerMessageId: 'mock-abc-001' };
  });
  const res = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: שלום',
    priority: 'transactional'
  });
  assert.equal(res.ok, true);
  assert.ok(captured, 'mock transport should have been called');
  assert.equal(captured.to, '+972501234567');
  assert.equal(captured.senderId, 'OnyxERP');
});

test('Y122: opt-out enforcement — STOP keyword blocks future sends', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.optOut({ phone: '0501234567', reason: 'user-stop', keyword: 'STOP' });
  assert.equal(g.isOptedOut('0501234567'), true);
  const res = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: promo',
    priority: 'transactional'
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'RECIPIENT_OPTED_OUT');
});

test('Y122: opt-out via handleIncoming — "הסר" keyword auto-registers', () => {
  const g = new SMSGateway();
  const r = g.handleIncoming({
    from: '0501234567',
    to: '55555',
    body: 'הסר',
    provider: 'inforu'
  });
  assert.equal(r.ok, true);
  assert.equal(r.optOutTriggered, true);
  assert.equal(g.isOptedOut('+972501234567'), true);
});

test('Y122: isOptedOut — returns false for fresh phone, true after opt-out', () => {
  const g = new SMSGateway();
  assert.equal(g.isOptedOut('0501234567'), false);
  g.optOut({ phone: '0501234567' });
  assert.equal(g.isOptedOut('0501234567'), true);
  assert.equal(g.isOptedOut('junk'), false);
});

test('Y122: quietHours block — marketing rejected during 20:00-07:00 Asia/Jerusalem', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  // Force window to be "always on" (00:00→23:59 crosses midnight only
  // when end<start; use an always-matching configuration).
  g.quietHours({ enabled: true, start: '00:00', end: '23:59', timezone: 'Asia/Jerusalem' });
  const res = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP מבצע חם',
    priority: 'marketing'
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'QUIET_HOURS');
  assert.equal(res.rule, 'חוק התקשורת §30א');
});

test('Y122: quietHours does NOT block transactional messages', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.quietHours({ enabled: true, start: '00:00', end: '23:59', timezone: 'Asia/Jerusalem' });
  const res = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: OTP 123456',
    priority: 'transactional'
  });
  assert.equal(res.ok, true);
});

test('Y122: quietHours — disable flag bypasses block', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.quietHours({ enabled: false });
  const res = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP מבצע',
    priority: 'marketing'
  });
  assert.equal(res.ok, true);
});

test('Y122: §30א — sender identification missing in first 100 chars rejected', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.quietHours({ enabled: false });
  // Body doesn't start with "OnyxERP" and is marketing → should fail.
  const res = await g.sendY122({
    to: '0501234567',
    message: 'קבל הטבה בלעדית ללקוחותינו — עכשיו עד סוף החודש',
    priority: 'marketing'
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'SENDER_IDENTIFICATION_MISSING');
  assert.equal(res.rule, 'חוק התקשורת §30א');
});

test('Y122: §30א — sender in first 100 chars passes', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.quietHours({ enabled: false });
  const res = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: מבצע חם להסרה השיבו הסר',
    priority: 'marketing'
  });
  assert.equal(res.ok, true);
});

test('Y122: §30א — daily cap enforced at 3 messages per 24h', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.quietHours({ enabled: false });
  for (let i = 0; i < 3; i++) {
    const r = await g.sendY122({
      to: '0501234567',
      message: `OnyxERP: מבצע #${i}`,
      priority: 'marketing'
    });
    assert.equal(r.ok, true, `send ${i} should succeed`);
  }
  const blocked = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: מבצע רביעי',
    priority: 'marketing'
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'DAILY_CAP_EXCEEDED');
});

test('Y122: explicit consent bypasses daily cap', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.quietHours({ enabled: false });
  for (let i = 0; i < 5; i++) {
    const r = await g.sendY122({
      to: '0521234567',
      message: `OnyxERP: יום ${i}`,
      priority: 'marketing',
      meta: { hasExplicitConsent: true }
    });
    assert.equal(r.ok, true, `consented send ${i} should succeed`);
  }
});

test('Y122: sendBulk processes batches with delayMs', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  const messages = [
    { to: '0501234567', message: 'OnyxERP: OTP 111', priority: 'transactional' },
    { to: '0521234567', message: 'OnyxERP: OTP 222', priority: 'transactional' },
    { to: '0541234567', message: 'OnyxERP: OTP 333', priority: 'transactional' }
  ];
  const t0 = Date.now();
  const res = await g.sendBulk({ messages, batchSize: 2, delayMs: 10 });
  const elapsed = Date.now() - t0;
  assert.equal(res.ok, true);
  assert.equal(res.total, 3);
  assert.equal(res.succeeded, 3);
  assert.equal(res.failed, 0);
  assert.ok(elapsed >= 10, 'expected at least one 10ms batch-delay');
});

test('Y122: checkDeliveryStatus returns locally stored report', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  const sent = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: OTP',
    priority: 'transactional',
    meta: { deliveryReport: true }
  });
  assert.equal(sent.ok, true);
  const r1 = await g.checkDeliveryStatus(sent.messageId);
  assert.equal(r1.ok, true);
  assert.equal(r1.status, 'QUEUED');
  // Record a DELIVERED update via the injected status probe
  g.injectStatusTransport(async (_msgId) => ({ status: 'DELIVERED', raw: { via: 'mock' } }));
  const r2 = await g.checkDeliveryStatus(sent.messageId);
  assert.equal(r2.status, 'DELIVERED');
});

test('Y122: checkDeliveryStatus — unknown id rejected', async () => {
  const g = new SMSGateway();
  const r = await g.checkDeliveryStatus('does-not-exist');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'NOT_FOUND');
});

test('Y122: messageTemplate register + render with Hebrew placeholders', () => {
  const g = new SMSGateway();
  g.messageTemplate('welcome', 'שלום {{name}}, ברוכים הבאים ל-{{company}}');
  const out = g.messageTemplate('welcome', { name: 'דני', company: 'Onyx' });
  assert.equal(out.ok, true);
  assert.equal(out.rendered, 'שלום דני, ברוכים הבאים ל-Onyx');
});

test('Y122: messageTemplate missing placeholder kept verbatim', () => {
  const g = new SMSGateway();
  g.messageTemplate('otp', 'OnyxERP: {{code}} expires in {{minutes}} min');
  const out = g.messageTemplate('otp', { code: '482910' });
  assert.equal(out.ok, true);
  assert.match(out.rendered, /{{minutes}}/);
});

test('Y122: messageTemplate unknown template rejected', () => {
  const g = new SMSGateway();
  const out = g.messageTemplate('nonexistent', {});
  assert.equal(out.ok, false);
  assert.equal(out.error, 'TEMPLATE_NOT_FOUND');
});

test('Y122: costEstimate — per-provider NIS for Unicell appears', () => {
  const g = new SMSGateway();
  const r = g.costEstimate({ text: 'שלום', to: '0501234567', provider: 'unicell' });
  assert.ok('unicell' in r.perProvider, 'unicell should appear in cost breakdown');
  assert.ok(r.perProvider.unicell > 0);
  assert.equal(r.primary.provider, 'unicell');
});

test('Y122: costEstimate — three providers comparison (Inforu/019/Unicell)', () => {
  const g = new SMSGateway();
  const r = g.costEstimate({ text: 'שלום עולם', to: '0501234567' });
  assert.ok(r.perProvider.inforu < r.perProvider['019mobile']);
  assert.ok(r.perProvider['019mobile'] < r.perProvider.unicell);
});

test('Y122: history — append-only per-phone delivery log', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  await g.sendY122({ to: '0501234567', message: 'OnyxERP: first',  priority: 'transactional' });
  await g.sendY122({ to: '0501234567', message: 'OnyxERP: second', priority: 'transactional' });
  const hist = g.history('0501234567');
  assert.equal(hist.length, 2);
  assert.ok(hist[0].messageId);
  assert.ok(hist[0].preview.includes('second') || hist[0].preview.includes('OnyxERP'));
});

test('Y122: history — empty for unknown phone', () => {
  const g = new SMSGateway();
  assert.deepEqual(g.history('0501234567'), []);
});

test('Y122: handleIncoming — non-opt-out body just buffered, no opt-out', () => {
  const g = new SMSGateway();
  const r = g.handleIncoming({
    from: '0501234567',
    to: '55555',
    body: 'תודה רבה!',
    provider: 'inforu'
  });
  assert.equal(r.ok, true);
  assert.equal(r.optOutTriggered, false);
  assert.equal(g.isOptedOut('0501234567'), false);
});

test('Y122: injectTransport — forced failure surfaces as INJECTED_TRANSPORT_FAILED', async () => {
  const g = new SMSGateway();
  const h = g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  h.injectTransport(async () => ({ ok: false, error: 'PROVIDER_DOWN' }));
  const res = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: OTP',
    priority: 'transactional'
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'PROVIDER_DOWN');
});

test('Y122: audit log captures §30א rejections', async () => {
  const g = new SMSGateway();
  g.configure({ provider: 'mock', senderId: 'OnyxERP' });
  g.quietHours({ enabled: false });
  await g.sendY122({
    to: '0501234567',
    message: 'promo without sender',
    priority: 'marketing'
  });
  const rejections = g.auditLog({ event: 'SEND_REJECTED_30A' });
  assert.ok(rejections.length >= 1);
});

test('Y122: sendBulk empty list is still ok', async () => {
  const g = new SMSGateway();
  const r = await g.sendBulk({ messages: [] });
  assert.equal(r.ok, true);
  assert.equal(r.total, 0);
});

test('Y122: provider alias — 019 resolves to same adapter as 019mobile', async () => {
  const g = new SMSGateway();
  const r1 = g.configure({ provider: '019', senderId: 'OnyxERP' });
  assert.equal(r1.ok, true);
  const a = await g.sendY122({
    to: '0501234567',
    message: 'OnyxERP: hi',
    priority: 'transactional'
  });
  assert.equal(a.ok, true);
  assert.equal(a.provider, '019mobile');
});
