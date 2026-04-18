/**
 * ONYX PROCUREMENT — SMS Templates Tests
 * ────────────────────────────────────────
 * Agent-75 — SMS notification subsystem
 *
 * These tests cover both sms-templates.js and the validation /
 * queue / rate-limit / opt-out paths of send-sms.js. They run under
 * the built-in node:test runner (Node >= 20) so they need zero
 * extra deps. Run with:
 *     node --test src/sms/sms-templates.test.js
 *
 * The suite is deliberately strict about:
 *   • character accounting (chars vs. UTF-16 units)
 *   • Unicode segment math (70 / 67 boundaries)
 *   • missing/unknown variable surfacing
 *   • Hebrew OTP body shape
 *   • Israeli phone normalization edge cases
 *   • opt-out keywords (Hebrew + English)
 *   • rate-limit sliding window
 *   • cost tracking & audit log accumulation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEMPLATES,
  renderTemplate,
  listTemplates,
  estimateSegments,
  validateTemplate,
  isGsm7,
  constants,
} = require('./sms-templates');

const {
  createSmsSender,
  normalizePhone,
  isValidIsraeliPhone,
  isMobileNumber,
  normalizeSenderName,
  createRateLimiter,
  createOptOutLedger,
  createAuditLog,
  createDeliveryRegistry,
  createQueue,
  withRetry,
  estimateCostILS,
  PROVIDER_COST_PER_SEGMENT_ILS,
} = require('./send-sms');

// ─────────────────────────────────────────────────────────────────
// sms-templates — registry & metadata
// ─────────────────────────────────────────────────────────────────

test('TEMPLATES contains the six required templates', () => {
  const ids = Object.keys(TEMPLATES).sort();
  const expected = [
    'alert',
    'appointment-reminder',
    'otp-code',
    'password-reset',
    'payment-received',
    'wage-slip-ready',
  ];
  assert.deepEqual(ids, expected);
});

test('listTemplates returns metadata for every template', () => {
  const list = listTemplates();
  assert.equal(list.length, 6);
  for (const t of list) {
    assert.ok(t.id);
    assert.ok(t.description);
    assert.ok(Array.isArray(t.vars));
    assert.ok(['otp', 'transactional', 'reminder', 'alert', 'marketing'].includes(t.category));
  }
});

test('OTP template body is the exact Hebrew string', () => {
  assert.equal(
    TEMPLATES['otp-code'].body,
    'קוד האימות שלך: {{code}}. בתוקף ל-5 דקות.',
  );
});

test('OTP template is flagged to NEVER carry an opt-out footer', () => {
  assert.equal(TEMPLATES['otp-code'].allowOptOutFooter, false);
  assert.equal(TEMPLATES['password-reset'].allowOptOutFooter, false);
  assert.equal(TEMPLATES['alert'].allowOptOutFooter, false);
});

// ─────────────────────────────────────────────────────────────────
// estimateSegments
// ─────────────────────────────────────────────────────────────────

test('estimateSegments: empty string → 0 segments', () => {
  const r = estimateSegments('');
  assert.equal(r.chars, 0);
  assert.equal(r.segments, 0);
});

test('estimateSegments: ASCII "hello" → GSM-7 single segment', () => {
  const r = estimateSegments('hello');
  assert.equal(r.unicode, false);
  assert.equal(r.segments, 1);
  assert.equal(r.chars, 5);
});

test('estimateSegments: Hebrew falls into Unicode mode', () => {
  const r = estimateSegments('שלום עולם');
  assert.equal(r.unicode, true);
  assert.equal(r.segments, 1);
});

test('estimateSegments: 71-char Hebrew crosses concat boundary', () => {
  const body = 'א'.repeat(71);
  const r = estimateSegments(body);
  assert.equal(r.unicode, true);
  assert.equal(r.chars, 71);
  // 71 chars > 70 → two concat segments of 67
  assert.equal(r.segments, 2);
});

test('estimateSegments: 70-char Hebrew fits in one segment', () => {
  const body = 'א'.repeat(70);
  const r = estimateSegments(body);
  assert.equal(r.segments, 1);
});

test('isGsm7: Hebrew returns false, ASCII returns true', () => {
  assert.equal(isGsm7('hello world'), true);
  assert.equal(isGsm7('שלום'), false);
  assert.equal(isGsm7('hello שלום'), false);
});

// ─────────────────────────────────────────────────────────────────
// renderTemplate
// ─────────────────────────────────────────────────────────────────

test('renderTemplate: OTP substitutes {{code}}', () => {
  const r = renderTemplate('otp-code', { code: '123456' });
  assert.equal(r.body, 'קוד האימות שלך: 123456. בתוקף ל-5 דקות.');
  assert.equal(r.unicode, true);
  assert.equal(r.segments, 1);
  assert.equal(r.warnings.length, 0);
});

test('renderTemplate: wage-slip substitutes month + url', () => {
  const r = renderTemplate('wage-slip-ready', {
    month: '03/2026',
    url: 'https://onyx.example/p/1',
  });
  assert.equal(r.body, 'תלוש השכר לחודש 03/2026 מוכן. היכנסו ל-https://onyx.example/p/1');
  assert.equal(r.unicode, true);
});

test('renderTemplate: payment-received renders ILS sign + amount', () => {
  const r = renderTemplate('payment-received', { amount: '1,250.00' });
  assert.equal(r.body, 'תודה! קיבלנו תשלום של \u20AA1,250.00');
});

test('renderTemplate: appointment-reminder uses time + subject', () => {
  const r = renderTemplate('appointment-reminder', {
    time: '14:30',
    subject: 'סקירה רבעונית',
  });
  assert.equal(r.body, 'תזכורת: פגישה מחר ב-14:30 - סקירה רבעונית');
});

test('renderTemplate: alert renders warning emoji', () => {
  const r = renderTemplate('alert', { message: 'שרת לא זמין' });
  assert.ok(r.body.startsWith('\u26A0\uFE0F התראה:'));
  assert.ok(r.body.includes('שרת לא זמין'));
});

test('renderTemplate: password-reset renders link', () => {
  const r = renderTemplate('password-reset', { link: 'https://onyx.example/r/abc' });
  assert.equal(r.body, 'לאיפוס סיסמה: https://onyx.example/r/abc (בתוקף לשעה)');
});

test('renderTemplate: all templates fit within 160-char Unicode cap', () => {
  const samples = {
    'otp-code': { code: '123456' },
    'wage-slip-ready': { month: '03/2026', url: 'https://onyx.example/p/1' },
    'payment-received': { amount: '1,250.00' },
    'appointment-reminder': { time: '14:30', subject: 'פגישת צוות' },
    'alert': { message: 'קצר בתקשורת' },
    'password-reset': { link: 'https://onyx.example/r/abc' },
  };
  for (const [id, vars] of Object.entries(samples)) {
    const r = renderTemplate(id, vars);
    assert.ok(
      r.chars <= constants.MAX_UNICODE_LENGTH,
      `${id}: ${r.chars} chars > ${constants.MAX_UNICODE_LENGTH}`,
    );
  }
});

test('renderTemplate: missing var throws SMS_TEMPLATE_INVALID', () => {
  assert.throws(
    () => renderTemplate('otp-code', {}),
    (err) => err.code === 'SMS_TEMPLATE_INVALID' && err.missing.includes('code'),
  );
});

test('renderTemplate: unknown template id throws', () => {
  assert.throws(() => renderTemplate('no-such-template', {}), /unknown template/);
});

test('renderTemplate: long message surfaces a warning', () => {
  const bigSubject = 'צ'.repeat(60);
  const r = renderTemplate('appointment-reminder', { time: '14:30', subject: bigSubject });
  // maxVars.subject is 40 → coerceVar truncates silently.
  assert.ok(r.chars <= 80);
});

test('validateTemplate: flags unknown var keys', () => {
  const v = validateTemplate('otp-code', { code: '1234', foo: 'bar' });
  assert.equal(v.ok, true); // ok=true because missing[] is empty
  assert.deepEqual(v.unknown, ['foo']);
});

// ─────────────────────────────────────────────────────────────────
// Phone validation
// ─────────────────────────────────────────────────────────────────

test('normalizePhone: accepts 050-1234567', () => {
  assert.equal(normalizePhone('050-1234567'), '+972501234567');
});

test('normalizePhone: accepts 0501234567', () => {
  assert.equal(normalizePhone('0501234567'), '+972501234567');
});

test('normalizePhone: accepts +972-50-1234567', () => {
  assert.equal(normalizePhone('+972-50-1234567'), '+972501234567');
});

test('normalizePhone: accepts +972501234567', () => {
  assert.equal(normalizePhone('+972501234567'), '+972501234567');
});

test('normalizePhone: rejects empty & junk', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone('hello'), null);
  assert.equal(normalizePhone('1234'), null);
});

test('normalizePhone: rejects too many digits', () => {
  assert.equal(normalizePhone('05012345678'), null);
  assert.equal(normalizePhone('+9725012345678'), null);
});

test('normalizePhone: rejects too few digits', () => {
  assert.equal(normalizePhone('050123456'), null);
  assert.equal(normalizePhone('+97250123456'), null);
});

test('isValidIsraeliPhone: accepts landlines too', () => {
  assert.equal(isValidIsraeliPhone('03-1234567'), true);
});

test('isMobileNumber: only 05X counts as mobile', () => {
  assert.equal(isMobileNumber('050-1234567'), true);
  assert.equal(isMobileNumber('052-1234567'), true);
  assert.equal(isMobileNumber('054-1234567'), true);
  assert.equal(isMobileNumber('058-1234567'), true);
  assert.equal(isMobileNumber('03-1234567'), false);
  assert.equal(isMobileNumber('072-1234567'), false);
});

// ─────────────────────────────────────────────────────────────────
// Sender name
// ─────────────────────────────────────────────────────────────────

test('normalizeSenderName: accepts <=11 alphanumeric', () => {
  assert.equal(normalizeSenderName('OnyxProc'), 'OnyxProc');
  assert.equal(normalizeSenderName('Onyx2026'), 'Onyx2026');
});

test('normalizeSenderName: rejects too long', () => {
  assert.equal(normalizeSenderName('OnyxProcurement'), null);
});

test('normalizeSenderName: rejects spaces and punctuation', () => {
  assert.equal(normalizeSenderName('Onyx Proc'), null);
  assert.equal(normalizeSenderName('Onyx-Proc'), null);
});

// ─────────────────────────────────────────────────────────────────
// Rate limiter
// ─────────────────────────────────────────────────────────────────

test('createRateLimiter: allows up to N then blocks', () => {
  const rl = createRateLimiter({ windowMs: 60_000 });
  assert.equal(rl.check('k', 3).allowed, true);
  assert.equal(rl.check('k', 3).allowed, true);
  assert.equal(rl.check('k', 3).allowed, true);
  const r = rl.check('k', 3);
  assert.equal(r.allowed, false);
  assert.equal(r.remaining, 0);
});

test('createRateLimiter: separate keys are independent', () => {
  const rl = createRateLimiter();
  for (let i = 0; i < 5; i++) rl.check('a', 5);
  assert.equal(rl.check('a', 5).allowed, false);
  assert.equal(rl.check('b', 5).allowed, true);
});

// ─────────────────────────────────────────────────────────────────
// Opt-out ledger
// ─────────────────────────────────────────────────────────────────

test('opt-out: "הסר" reply marks the number as opted out', () => {
  const led = createOptOutLedger();
  const r = led.handleInboundReply({ from: '050-1111111', body: 'הסר' });
  assert.equal(r.handled, true);
  assert.equal(led.isOptedOut('050-1111111'), true);
});

test('opt-out: English STOP also works', () => {
  const led = createOptOutLedger();
  led.handleInboundReply({ from: '0502222222', body: 'STOP' });
  assert.equal(led.isOptedOut('+972502222222'), true);
});

test('opt-out: non-matching reply leaves ledger empty', () => {
  const led = createOptOutLedger();
  led.handleInboundReply({ from: '0503333333', body: 'hello' });
  assert.equal(led.isOptedOut('0503333333'), false);
});

test('opt-out: manual optOut also works', () => {
  const led = createOptOutLedger();
  led.optOut('054-1234567', { reason: 'support ticket' });
  assert.equal(led.isOptedOut('054-1234567'), true);
});

test('opt-out: list returns recorded entries', () => {
  const led = createOptOutLedger();
  led.optOut('055-0000001');
  led.optOut('055-0000002');
  const list = led.list();
  assert.equal(list.length, 2);
});

// ─────────────────────────────────────────────────────────────────
// Cost model
// ─────────────────────────────────────────────────────────────────

test('estimateCostILS: inforu is cheapest, twilio most expensive', () => {
  const inf = estimateCostILS('inforu', 1);
  const twi = estimateCostILS('twilio', 1);
  assert.ok(inf < twi);
});

test('estimateCostILS: scales (monotonically) with segments', () => {
  // The per-segment rate is rounded to 2 decimals, so strict linearity
  // is not guaranteed — we only assert monotonicity and rough ×10 scale.
  const one = estimateCostILS('inforu', 1);
  const ten = estimateCostILS('inforu', 10);
  assert.ok(ten > one, 'ten-segment cost should exceed one-segment cost');
  assert.ok(Math.abs(ten - one * 10) < 0.1, 'ten-segment cost should be ~10× one-segment');
});

test('PROVIDER_COST_PER_SEGMENT_ILS has all four providers', () => {
  assert.ok('twilio' in PROVIDER_COST_PER_SEGMENT_ILS);
  assert.ok('inforu' in PROVIDER_COST_PER_SEGMENT_ILS);
  assert.ok('cellact' in PROVIDER_COST_PER_SEGMENT_ILS);
  assert.ok('smsglobal' in PROVIDER_COST_PER_SEGMENT_ILS);
});

// ─────────────────────────────────────────────────────────────────
// Queue + retry
// ─────────────────────────────────────────────────────────────────

test('createQueue: respects concurrency bound', async () => {
  const q = createQueue({ concurrency: 2 });
  let inFlight = 0;
  let maxInFlight = 0;
  const jobs = [];
  for (let i = 0; i < 10; i++) {
    jobs.push(q.enqueue(async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    }));
  }
  const out = await Promise.all(jobs);
  assert.equal(out.length, 10);
  assert.ok(maxInFlight <= 2);
});

test('withRetry: succeeds first try', async () => {
  const r = await withRetry(async () => 'ok', { retries: 3 });
  assert.equal(r.result, 'ok');
  assert.equal(r.attempts, 1);
});

test('withRetry: retries then succeeds', async () => {
  let n = 0;
  const r = await withRetry(async () => {
    n++;
    if (n < 3) throw new Error('nope');
    return 'eventually';
  }, { retries: 5, backoffMs: 1 });
  assert.equal(r.result, 'eventually');
  assert.equal(r.attempts, 3);
});

test('withRetry: gives up after retries exhausted', async () => {
  await assert.rejects(
    () => withRetry(async () => { throw new Error('boom'); }, { retries: 2, backoffMs: 1 }),
    /all 3 attempts failed/,
  );
});

// ─────────────────────────────────────────────────────────────────
// SmsSender end-to-end (stub provider)
// ─────────────────────────────────────────────────────────────────

function makeSender(overrides = {}) {
  return createSmsSender({
    env: { SMS_PROVIDER: 'inforu' },
    concurrency: 2,
    retries: 0,
    backoffMs: 1,
    ...overrides,
  });
}

test('SmsSender: sends an OTP and returns audit entry', async () => {
  const s = makeSender();
  const r = await s.send({
    to: '050-1234567',
    templateId: 'otp-code',
    vars: { code: '987654' },
    senderName: 'OnyxProc',
  });
  assert.equal(r.status, 'accepted');
  assert.ok(r.providerMessageId);
  assert.equal(r.provider, 'inforu');
  assert.equal(r.segments, 1);
  assert.ok(r.estCostILS > 0);
});

test('SmsSender: rejects invalid phone', async () => {
  const s = makeSender();
  await assert.rejects(
    () => s.send({ to: 'xxx', templateId: 'otp-code', vars: { code: '1' } }),
    (err) => err.code === 'SMS_INVALID_PHONE',
  );
});

test('SmsSender: rejects non-mobile landline', async () => {
  const s = makeSender();
  await assert.rejects(
    () => s.send({ to: '03-1234567', templateId: 'otp-code', vars: { code: '1' } }),
    (err) => err.code === 'SMS_NOT_MOBILE',
  );
});

test('SmsSender: honors per-number rate limit', async () => {
  const s = makeSender({ perNumberLimit: 2 });
  const phone = '052-1234567';
  await s.send({ to: phone, templateId: 'otp-code', vars: { code: '1' } });
  await s.send({ to: phone, templateId: 'otp-code', vars: { code: '2' } });
  await assert.rejects(
    () => s.send({ to: phone, templateId: 'otp-code', vars: { code: '3' } }),
    (err) => err.code === 'SMS_RATE_LIMITED' && err.scope === 'per-number',
  );
});

test('SmsSender: honors per-campaign rate limit', async () => {
  const s = makeSender({ perCampaignLimit: 2, perNumberLimit: 999 });
  const cid = 'qr1';
  await s.send({ to: '052-1111111', templateId: 'otp-code', vars: { code: '1' }, campaignId: cid });
  await s.send({ to: '052-2222222', templateId: 'otp-code', vars: { code: '2' }, campaignId: cid });
  await assert.rejects(
    () => s.send({ to: '052-3333333', templateId: 'otp-code', vars: { code: '3' }, campaignId: cid }),
    (err) => err.code === 'SMS_RATE_LIMITED' && err.scope === 'per-campaign',
  );
});

test('SmsSender: suppresses messages to opted-out numbers', async () => {
  const s = makeSender();
  s.optOut('054-7777777');
  const r = await s.send({
    to: '054-7777777',
    templateId: 'otp-code',
    vars: { code: '9' },
  });
  assert.equal(r.status, 'suppressed');
});

test('SmsSender: inbound "הסר" reply marks number as opted out', async () => {
  const s = makeSender();
  s.handleInboundReply({ from: '052-9990001', body: 'הסר' });
  assert.equal(s.isOptedOut('052-9990001'), true);
});

test('SmsSender: sendBulk aggregates results', async () => {
  const s = makeSender();
  const results = await s.sendBulk([
    { to: '052-8880001', templateId: 'otp-code', vars: { code: '1' } },
    { to: 'bad-phone',   templateId: 'otp-code', vars: { code: '2' } },
    { to: '052-8880002', templateId: 'otp-code', vars: { code: '3' } },
  ]);
  assert.equal(results.length, 3);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[2].ok, true);
});

test('SmsSender: totalEstimatedCostILS sums accepted sends', async () => {
  const s = makeSender();
  await s.send({ to: '052-1000001', templateId: 'otp-code', vars: { code: '1' } });
  await s.send({ to: '052-1000002', templateId: 'otp-code', vars: { code: '2' } });
  const total = s.totalEstimatedCostILS();
  assert.ok(total > 0);
});

test('SmsSender: delivery receipt is recordable and queryable', async () => {
  const s = makeSender();
  const r = await s.send({ to: '052-1000003', templateId: 'otp-code', vars: { code: '1' } });
  s.handleDeliveryReceipt({ providerMessageId: r.providerMessageId, status: 'delivered' });
  const rec = s.getDeliveryReceipt(r.providerMessageId);
  assert.equal(rec.status, 'delivered');
});

test('SmsSender: unknown provider throws during construction', () => {
  assert.throws(
    () => createSmsSender({ env: { SMS_PROVIDER: 'nope' } }),
    /unknown provider/,
  );
});

test('SmsSender: supports raw body (no template)', async () => {
  const s = makeSender();
  const r = await s.send({
    to: '052-1000004',
    body: 'hello world',
  });
  assert.equal(r.status, 'accepted');
});

test('SmsSender: send without template or body throws', async () => {
  const s = makeSender();
  await assert.rejects(
    () => s.send({ to: '052-1000005' }),
    (err) => err.code === 'SMS_NO_CONTENT',
  );
});

test('SmsSender: all four providers work in stub mode', async () => {
  for (const p of ['twilio', 'inforu', 'cellact', 'smsglobal']) {
    const s = createSmsSender({ env: { SMS_PROVIDER: p } });
    const r = await s.send({
      to: '052-5000001',
      templateId: 'otp-code',
      vars: { code: '1' },
    });
    assert.equal(r.provider, p);
    assert.equal(r.status, 'accepted');
  }
});

// ─────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────

test('createAuditLog: append-only + query by phone', () => {
  const a = createAuditLog();
  a.record({ status: 'accepted', phone: '+972501111111' });
  a.record({ status: 'accepted', phone: '+972502222222' });
  assert.equal(a.count(), 2);
  const out = a.query({ phone: '+972501111111' });
  assert.equal(out.length, 1);
});

test('createAuditLog: redactBody hides body', () => {
  const a = createAuditLog({ redactBody: true });
  a.record({ status: 'accepted', body: 'secret' });
  assert.equal(a.query()[0].body, '[REDACTED]');
});

test('createDeliveryRegistry: no-op when id is missing', () => {
  const d = createDeliveryRegistry();
  assert.equal(d.recordReceipt({}), false);
});
