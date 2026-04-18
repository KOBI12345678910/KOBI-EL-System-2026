/**
 * Tests for src/customer/referral.js
 * Agent Y-094 / Techno-Kol Uzi mega-ERP 2026
 *
 * Run:
 *   cd onyx-procurement
 *   node --test test/customer/referral.test.js
 *
 * Zero third-party deps. Pure node:test + node:assert.
 * Rule: לא מוחקים רק משדרגים ומגדלים — append-only, no destructive ops.
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  ReferralProgram,
  REWARD_TYPE_FIXED,
  REWARD_TYPE_PERCENT,
  REWARD_TYPE_CREDIT,
  REWARD_TYPE_GIFT,
  REWARD_TYPE_DISCOUNT,
  REWARD_METHOD_CASH,
  REWARD_METHOD_CREDIT,
  REWARD_METHOD_DISCOUNT,
  SIDE_REFERRER,
  SIDE_REFERRED,
  REFERRAL_STATUS_CAPTURED,
  REFERRAL_STATUS_CONVERTED,
  REFERRAL_STATUS_BLOCKED,
  REWARD_STATUS_ISSUED,
  REWARD_STATUS_VOIDED,
  FRAUD_SELF,
  FRAUD_CIRCULAR,
  FRAUD_VELOCITY,
  FRAUD_IP_MATCH,
  FRAUD_DISPOSABLE,
  FRAUD_EMAIL_MATCH,
  IL_TAX_FREE_PER_OCCASION,
  IL_TAX_FREE_ANNUAL_CUMULATIVE,
  LABELS_HE,
  LABELS_EN,
  isDisposableEmail,
} = require('../../src/customer/referral.js');

/* ------------------------------------------------------------------ */
/* Fixtures & helpers                                                  */
/* ------------------------------------------------------------------ */

function baseProgram(over = {}) {
  return {
    id:      'kobi-welcome',
    name_he: 'ברוכים הבאים קובי אל',
    name_en: 'Welcome to Kobi EL',
    rewardReferrer: { type: REWARD_TYPE_FIXED,    value: 100 },
    rewardReferred: { type: REWARD_TYPE_DISCOUNT, value: 50  },
    eligibilityRules: {
      minFirstPurchase: 500,
      allowedChannels:  ['whatsapp', 'sms', 'email', 'link'],
    },
    duration:   { startAt: '2026-01-01T00:00:00Z', endAt: '2026-12-31T23:59:59Z' },
    maxRewards: 10000,
    fraudRules: {},
    ...over,
  };
}

function makeRP() {
  // Deterministic-ish: clock is fixed, randomId returns sequential ints
  let c = 0;
  return new ReferralProgram({
    clock:    () => new Date('2026-04-11T09:00:00Z'),
    randomId: () => ('t' + (++c).toString(16).padStart(6, '0')),
  });
}

/* ------------------------------------------------------------------ */
/* createProgram                                                       */
/* ------------------------------------------------------------------ */

test('createProgram — valid spec is stored and returned frozen', () => {
  const rp = makeRP();
  const p  = rp.createProgram(baseProgram());
  assert.equal(p.id, 'kobi-welcome');
  assert.equal(p.version, 1);
  assert.equal(p.name_he, 'ברוכים הבאים קובי אל');
  assert.equal(p.name_en, 'Welcome to Kobi EL');
  assert.equal(p.rewardReferrer.value, 100);
  assert.equal(p.rewardReferred.type, REWARD_TYPE_DISCOUNT);
  assert.ok(Object.isFrozen(p));
});

test('createProgram — re-defining same id bumps version, keeps history', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const v2 = rp.createProgram(baseProgram({
    rewardReferrer: { type: REWARD_TYPE_FIXED, value: 150 },
  }));
  assert.equal(v2.version, 2);
  assert.equal(v2.rewardReferrer.value, 150);
  const history = rp.getProgramHistory('kobi-welcome');
  assert.equal(history.length, 2);
  assert.equal(history[0].version, 1);
  assert.equal(history[0].rewardReferrer.value, 100);
  assert.equal(history[1].version, 2);
});

test('createProgram — rejects missing id / names / bad reward', () => {
  const rp = makeRP();
  assert.throws(() => rp.createProgram({}), /spec is required|id is required/);
  assert.throws(() => rp.createProgram({ id: 'p', name_he: 'x', name_en: 'y' }), /rewardReferrer/);
  assert.throws(() => rp.createProgram(baseProgram({ name_en: '' })), /bilingual/);
  assert.throws(() => rp.createProgram(baseProgram({ rewardReferrer: { type: 'bogus', value: 10 } })), /rewardReferrer\.type/);
  assert.throws(() => rp.createProgram(baseProgram({ rewardReferrer: { type: REWARD_TYPE_FIXED, value: -5 } })), /value/);
});

/* ------------------------------------------------------------------ */
/* generateReferralCode — uniqueness + idempotency                     */
/* ------------------------------------------------------------------ */

test('generateReferralCode — produces a well-formed code with checksum', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const r = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  assert.ok(r.code);
  assert.match(r.code, /^[A-Z0-9]{3}-[A-Z0-9]{6}-[A-Z0-9]$/);
  const v = rp.validateCode(r.code);
  assert.equal(v.valid, true);
});

test('generateReferralCode — idempotent per (customer,program)', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const a = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  const b = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  assert.equal(a.code, b.code);
});

test('generateReferralCode — codes are unique across customers (500 sample)', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const r = rp.generateReferralCode({ customerId: 'cust-' + i, programId: 'kobi-welcome' });
    assert.equal(seen.has(r.code), false, 'collision on ' + r.code);
    seen.add(r.code);
    assert.equal(rp.validateCode(r.code).valid, true);
  }
  assert.equal(seen.size, 500);
});

test('generateReferralCode — rejects unknown program', () => {
  const rp = makeRP();
  assert.throws(() => rp.generateReferralCode({ customerId: 'x', programId: 'nope' }), /unknown programId/);
});

test('validateCode — rejects wrong checksum', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const r = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  const tampered = r.code.slice(0, -1) + (r.code.slice(-1) === '0' ? '1' : '0');
  const v = rp.validateCode(tampered);
  assert.equal(v.valid, false);
});

/* ------------------------------------------------------------------ */
/* trackReferralLink                                                   */
/* ------------------------------------------------------------------ */

test('trackReferralLink — increments click counter', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  rp.trackReferralLink(code, 'whatsapp');
  rp.trackReferralLink(code, 'sms');
  rp.trackReferralLink(code, 'whatsapp');
  const clicks = rp.getClicks(code);
  assert.equal(clicks.length, 3);
  assert.equal(clicks[0].medium, 'whatsapp');
});

test('trackReferralLink — unknown code does not throw, tracked=false', () => {
  const rp = makeRP();
  const c = rp.trackReferralLink('nope', 'email');
  assert.equal(c.tracked, false);
});

/* ------------------------------------------------------------------ */
/* captureReferred                                                     */
/* ------------------------------------------------------------------ */

test('captureReferred — creates referral with captured status', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  const ref = rp.captureReferred({
    code,
    leadInfo: { leadId: 'lead-1', email: 'a@example.com', phone: '050-1234567', ip: '1.2.3.4' },
  });
  assert.equal(ref.status, REFERRAL_STATUS_CAPTURED);
  assert.equal(ref.referrerId, 'cust-1');
  assert.equal(ref.leadId, 'lead-1');
});

test('captureReferred — unknown code throws', () => {
  const rp = makeRP();
  assert.throws(() => rp.captureReferred({ code: 'NOPE' }), /unknown code/);
});

/* ------------------------------------------------------------------ */
/* validateConversion                                                  */
/* ------------------------------------------------------------------ */

test('validateConversion — passes when first purchase >= min', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  rp.captureReferred({ code, leadInfo: { leadId: 'lead-1', email: 'buyer@mail.com', ip: '9.9.9.9' } });
  const r = rp.validateConversion({
    leadId: 'lead-1',
    conditions: { firstPurchase: 700, purchaseCompleted: true },
  });
  assert.equal(r.valid, true);
  const ref = rp.getReferral(r.referralId);
  assert.equal(ref.status, REFERRAL_STATUS_CONVERTED);
  assert.equal(ref.conversionValue, 700);
});

test('validateConversion — fails when first purchase below threshold', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  rp.captureReferred({ code, leadInfo: { leadId: 'lead-1', email: 'buyer@mail.com', ip: '9.9.9.9' } });
  const r = rp.validateConversion({
    leadId: 'lead-1',
    conditions: { firstPurchase: 200, purchaseCompleted: true },
  });
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'below-min-purchase');
  assert.equal(r.required, 500);
  assert.equal(r.actual, 200);
});

test('validateConversion — no-purchase gates conversion', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  rp.captureReferred({ code, leadInfo: { leadId: 'lead-1' } });
  const r = rp.validateConversion({
    leadId: 'lead-1',
    conditions: { firstPurchase: 1000, purchaseCompleted: false },
  });
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'no-purchase');
});

test('validateConversion — no referral = invalid', () => {
  const rp = makeRP();
  const r = rp.validateConversion({ leadId: 'ghost' });
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'no-referral');
});

test('validateConversion — blocked referral cannot convert', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  // Self-referral will be blocked
  rp.captureReferred({ code, leadInfo: { leadId: 'cust-1' } });
  const r = rp.validateConversion({
    leadId: 'cust-1',
    conditions: { firstPurchase: 1000, purchaseCompleted: true },
  });
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'blocked');
});

/* ------------------------------------------------------------------ */
/* issueReward                                                         */
/* ------------------------------------------------------------------ */

test('issueReward — referrer and referred sides both supported', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const r1 = rp.issueReward({
    programId: 'kobi-welcome',
    side:      SIDE_REFERRER,
    customerId: 'cust-1',
  });
  assert.equal(r1.side, SIDE_REFERRER);
  assert.equal(r1.value, 100);
  assert.equal(r1.status, REWARD_STATUS_ISSUED);
  const r2 = rp.issueReward({
    programId: 'kobi-welcome',
    side:      SIDE_REFERRED,
    customerId: 'lead-1',
  });
  assert.equal(r2.side, SIDE_REFERRED);
  assert.equal(r2.value, 50);
});

test('issueReward — value override + custom method', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const r = rp.issueReward({
    programId: 'kobi-welcome',
    side: SIDE_REFERRER,
    customerId: 'c',
    value: 250,
    method: REWARD_METHOD_CASH,
  });
  assert.equal(r.value, 250);
  assert.equal(r.method, REWARD_METHOD_CASH);
});

test('issueReward — bad side or unknown program throws', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  assert.throws(() => rp.issueReward({ programId: 'kobi-welcome', side: 'bogus', customerId: 'c' }), /side/);
  assert.throws(() => rp.issueReward({ programId: 'nope', side: SIDE_REFERRER, customerId: 'c' }), /unknown program/);
});

test('issueReward — respects maxRewards cap', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram({ maxRewards: 2 }));
  rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRER, customerId: 'a' });
  rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRER, customerId: 'b' });
  assert.throws(
    () => rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRER, customerId: 'c' }),
    /cap reached/,
  );
});

test('voidReward — flips status but keeps the record (append-only)', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const r = rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRER, customerId: 'c' });
  const v = rp.voidReward(r.id, 'fraud');
  assert.equal(v.status, REWARD_STATUS_VOIDED);
  assert.equal(v.voidReason, 'fraud');
  // Still retrievable (never deleted)
  assert.ok(rp.getReward(r.id));
});

/* ------------------------------------------------------------------ */
/* fraudDetection — every rule family                                  */
/* ------------------------------------------------------------------ */

test('fraudDetection — self-referral is blocked (classic: same id)', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'kobi', programId: 'kobi-welcome' });
  const ref = rp.captureReferred({ code, leadInfo: { leadId: 'kobi' } });
  assert.equal(ref.status, REFERRAL_STATUS_BLOCKED);
  assert.ok(String(ref.blockedReason).includes(FRAUD_SELF));
});

test('fraudDetection — circular referral is blocked', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const a = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' }).code;
  const b = rp.generateReferralCode({ customerId: 'bob',   programId: 'kobi-welcome' }).code;
  // alice refers bob
  rp.captureReferred({ code: a, leadInfo: { leadId: 'bob' } });
  // now bob refers alice — circular
  const circ = rp.captureReferred({ code: b, leadInfo: { leadId: 'alice' } });
  assert.equal(circ.status, REFERRAL_STATUS_BLOCKED);
  assert.ok(String(circ.blockedReason).includes(FRAUD_CIRCULAR));
});

test('fraudDetection — velocity limiter blocks the 3rd in a day', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram({ fraudRules: { maxPerDayPerReferrer: 2 } }));
  const { code } = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' });
  rp.captureReferred({ code, leadInfo: { leadId: 'l1', email: 'a@x.com', ip: '1.1.1.1' } });
  rp.captureReferred({ code, leadInfo: { leadId: 'l2', email: 'b@x.com', ip: '2.2.2.2' } });
  const third = rp.captureReferred({ code, leadInfo: { leadId: 'l3', email: 'c@x.com', ip: '3.3.3.3' } });
  assert.equal(third.status, REFERRAL_STATUS_BLOCKED);
  assert.ok(String(third.blockedReason).includes(FRAUD_VELOCITY));
});

test('fraudDetection — same IP across siblings triggers ip-match', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' });
  rp.captureReferred({ code, leadInfo: { leadId: 'l1', email: 'a@mail.com', ip: '77.77.77.77' } });
  const r2 = rp.captureReferred({
    code,
    leadInfo: { leadId: 'l2', email: 'b@mail.com', ip: '77.77.77.77' },
  });
  assert.equal(r2.status, REFERRAL_STATUS_BLOCKED);
  assert.ok(String(r2.blockedReason).includes(FRAUD_IP_MATCH));
});

test('fraudDetection — disposable email is blocked', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' });
  const ref = rp.captureReferred({
    code,
    leadInfo: { leadId: 'l1', email: 'spam@mailinator.com', ip: '8.8.8.8' },
  });
  assert.equal(ref.status, REFERRAL_STATUS_BLOCKED);
  assert.ok(String(ref.blockedReason).includes(FRAUD_DISPOSABLE));
});

test('fraudDetection — same email reused by same referrer is caught', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' });
  rp.captureReferred({ code, leadInfo: { leadId: 'l1', email: 'reuse@mail.com', ip: '5.5.5.5' } });
  const dup = rp.captureReferred({
    code,
    leadInfo: { leadId: 'l2', email: 'reuse@mail.com', ip: '6.6.6.6' },
  });
  assert.equal(dup.status, REFERRAL_STATUS_BLOCKED);
  assert.ok(String(dup.blockedReason).includes(FRAUD_EMAIL_MATCH));
});

test('fraudDetection — clean referral receives no blocks', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' });
  const ref = rp.captureReferred({
    code,
    leadInfo: { leadId: 'honest', email: 'real@gmail.com', ip: '11.22.33.44', deviceId: 'dev-x' },
  });
  assert.equal(ref.status, REFERRAL_STATUS_CAPTURED);
  assert.equal(ref.blockedReason, null);
});

test('isDisposableEmail helper — catches known disposables', () => {
  assert.equal(isDisposableEmail('test@mailinator.com'), true);
  assert.equal(isDisposableEmail('test@10minutemail.com'), true);
  assert.equal(isDisposableEmail('test@gmail.com'), false);
  assert.equal(isDisposableEmail(''), false);
  assert.equal(isDisposableEmail(null), false);
});

/* ------------------------------------------------------------------ */
/* leaderboard                                                         */
/* ------------------------------------------------------------------ */

test('leaderboard — ranks by conversions desc then value desc', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const a = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' }).code;
  const b = rp.generateReferralCode({ customerId: 'bob',   programId: 'kobi-welcome' }).code;
  const c = rp.generateReferralCode({ customerId: 'carol', programId: 'kobi-welcome' }).code;

  // Alice: 2 conversions @ 1000 each
  rp.captureReferred({ code: a, leadInfo: { leadId: 'la1', email: 'la1@mail.com', ip: '1.1.1.1' } });
  rp.validateConversion({ leadId: 'la1', conditions: { firstPurchase: 1000, purchaseCompleted: true } });
  rp.captureReferred({ code: a, leadInfo: { leadId: 'la2', email: 'la2@mail.com', ip: '1.1.1.2' } });
  rp.validateConversion({ leadId: 'la2', conditions: { firstPurchase: 1000, purchaseCompleted: true } });

  // Bob: 1 conversion @ 5000
  rp.captureReferred({ code: b, leadInfo: { leadId: 'lb1', email: 'lb1@mail.com', ip: '2.2.2.1' } });
  rp.validateConversion({ leadId: 'lb1', conditions: { firstPurchase: 5000, purchaseCompleted: true } });

  // Carol: 2 conversions @ 600 each
  rp.captureReferred({ code: c, leadInfo: { leadId: 'lc1', email: 'lc1@mail.com', ip: '3.3.3.1' } });
  rp.validateConversion({ leadId: 'lc1', conditions: { firstPurchase: 600, purchaseCompleted: true } });
  rp.captureReferred({ code: c, leadInfo: { leadId: 'lc2', email: 'lc2@mail.com', ip: '3.3.3.2' } });
  rp.validateConversion({ leadId: 'lc2', conditions: { firstPurchase: 600, purchaseCompleted: true } });

  const board = rp.leaderboard('kobi-welcome');
  assert.equal(board.length, 3);
  // Alice (2 conv, 2000 ₪) > Carol (2 conv, 1200 ₪) > Bob (1 conv, 5000 ₪)
  assert.equal(board[0].customerId, 'alice');
  assert.equal(board[1].customerId, 'carol');
  assert.equal(board[2].customerId, 'bob');
  assert.equal(board[0].rank, 1);
  assert.equal(board[1].rank, 2);
  assert.equal(board[2].rank, 3);
  assert.equal(board[0].conversions, 2);
  assert.equal(board[0].totalValue, 2000);
});

test('leaderboard — empty program returns []', () => {
  const rp = makeRP();
  assert.deepEqual(rp.leaderboard('nope'), []);
});

/* ------------------------------------------------------------------ */
/* programROI                                                          */
/* ------------------------------------------------------------------ */

test('programROI — computes revenue, cost, net, roi correctly', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const a = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' }).code;

  rp.captureReferred({ code: a, leadInfo: { leadId: 'l1', email: 'l1@mail.com', ip: '10.0.0.1' } });
  rp.validateConversion({ leadId: 'l1', conditions: { firstPurchase: 2000, purchaseCompleted: true } });
  rp.captureReferred({ code: a, leadInfo: { leadId: 'l2', email: 'l2@mail.com', ip: '10.0.0.2' } });
  rp.validateConversion({ leadId: 'l2', conditions: { firstPurchase: 3000, purchaseCompleted: true } });

  rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRER, customerId: 'alice', value: 200 });
  rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRED, customerId: 'l1',    value: 50  });
  rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRED, customerId: 'l2',    value: 50  });

  const roi = rp.programROI('kobi-welcome');
  assert.equal(roi.captures, 2);
  assert.equal(roi.conversions, 2);
  assert.equal(roi.revenue, 5000);
  assert.equal(roi.rewardCost, 300);
  assert.equal(roi.netRevenue, 4700);
  assert.ok(roi.roi > 15);                     // 4700 / 300 ≈ 15.67
  assert.equal(roi.uniqueNewCustomers, 2);
  assert.equal(roi.costPerConversion, 150);    // 300 / 2
  assert.equal(roi.costPerAcquisition, 150);
});

test('programROI — empty program returns zeros and 0 ROI', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const roi = rp.programROI('kobi-welcome');
  assert.equal(roi.revenue, 0);
  assert.equal(roi.rewardCost, 0);
  assert.equal(roi.netRevenue, 0);
  assert.equal(roi.roi, 0);
  assert.equal(roi.conversions, 0);
});

/* ------------------------------------------------------------------ */
/* generateShareAssets                                                 */
/* ------------------------------------------------------------------ */

test('generateShareAssets — bilingual messages across channels', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'cust-1', programId: 'kobi-welcome' });
  const assets = rp.generateShareAssets(code, ['whatsapp', 'sms', 'email', 'facebook', 'link']);
  assert.equal(assets.code, code);
  assert.ok(assets.link.includes(code));
  // Hebrew must exist on all requested channels
  assert.ok(assets.he.whatsapp.includes(code));
  assert.ok(assets.he.sms.includes(code));
  assert.ok(assets.he.emailSubject.length > 0);
  assert.ok(assets.he.emailBody.includes(code));
  // English too
  assert.ok(assets.en.whatsapp.includes(code));
  assert.ok(assets.en.sms.includes(code));
  assert.ok(assets.en.emailBody.includes(code));
  // Hebrew message contains Hebrew characters
  assert.match(assets.he.whatsapp, /[\u0590-\u05FF]/);
  // English message contains only ASCII letters for the greeting
  assert.match(assets.en.whatsapp, /Hi!|Join/);
});

test('generateShareAssets — unknown code falls back gracefully', () => {
  const rp = makeRP();
  const assets = rp.generateShareAssets('NOPE-123456-X', ['whatsapp']);
  assert.ok(assets.he.whatsapp);
  assert.ok(assets.en.whatsapp);
});

/* ------------------------------------------------------------------ */
/* taxTreatment                                                        */
/* ------------------------------------------------------------------ */

test('taxTreatment — discount reward is NEVER taxable', () => {
  const rp = makeRP();
  const verdict = rp.taxTreatment({
    type:     REWARD_TYPE_DISCOUNT,
    value:    500,
    method:   REWARD_METHOD_DISCOUNT,
    customerId: 'x',
  });
  assert.equal(verdict.taxable, false);
  assert.equal(verdict.classification, 'price-reduction');
});

test('taxTreatment — low cash reward below threshold is tax-free', () => {
  const rp = makeRP();
  const verdict = rp.taxTreatment({
    type:     REWARD_TYPE_FIXED,
    value:    100, // below IL_TAX_FREE_PER_OCCASION (210)
    method:   REWARD_METHOD_CASH,
    customerId: 'new-customer',
  });
  assert.equal(verdict.taxable, false);
  assert.equal(verdict.classification, 'de-minimis-gift');
  assert.equal(verdict.thresholdPerOccasion, IL_TAX_FREE_PER_OCCASION);
  assert.equal(verdict.thresholdAnnual, IL_TAX_FREE_ANNUAL_CUMULATIVE);
});

test('taxTreatment — large cash reward above threshold is TAXABLE', () => {
  const rp = makeRP();
  const verdict = rp.taxTreatment({
    type:    REWARD_TYPE_FIXED,
    value:   1500,
    method:  REWARD_METHOD_CASH,
    customerId: 'biguser',
  });
  assert.equal(verdict.taxable, true);
  assert.equal(verdict.classification, 'cash-prize');
  assert.equal(verdict.reportingForm, 'טופס 867');
  assert.ok(verdict.withholding > 0);
  assert.ok(verdict.note_he.length > 0);
  assert.ok(verdict.note_en.length > 0);
});

test('taxTreatment — gift above threshold flags form 806', () => {
  const rp = makeRP();
  const verdict = rp.taxTreatment({
    type: REWARD_TYPE_GIFT,
    value: 800,
    method: 'gift',
    customerId: 'giftee',
  });
  assert.equal(verdict.taxable, true);
  assert.equal(verdict.classification, 'in-kind-gift');
  assert.equal(verdict.reportingForm, 'טופס 806');
});

test('taxTreatment — cumulative YTD tips cash reward over threshold', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  // Issue many small cash rewards to the same customer this year
  for (let i = 0; i < 15; i++) {
    rp.issueReward({
      programId: 'kobi-welcome',
      side:      SIDE_REFERRER,
      customerId: 'cash-cow',
      value:     200,
      method:    REWARD_METHOD_CASH,
    });
  }
  // Each individual reward is 200 (< 210 per-occasion), but cumulative
  // is 3000 — over IL_TAX_FREE_ANNUAL_CUMULATIVE (2480). The next one
  // should flip taxable because of the YTD bucket.
  const sampleReward = {
    id:     undefined, // not registered yet
    type:   REWARD_TYPE_FIXED,
    value:  200,
    method: REWARD_METHOD_CASH,
    customerId: 'cash-cow',
  };
  const verdict = rp.taxTreatment(sampleReward);
  assert.equal(verdict.taxable, true);
});

/* ------------------------------------------------------------------ */
/* Append-only invariants                                              */
/* ------------------------------------------------------------------ */

test('house rule — blocked referrals are kept not deleted', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'kobi', programId: 'kobi-welcome' });
  const ref = rp.captureReferred({ code, leadInfo: { leadId: 'kobi' } });
  assert.equal(ref.status, REFERRAL_STATUS_BLOCKED);
  // Still findable
  assert.ok(rp.getReferral(ref.id));
  // Snapshot still contains it
  const snap = rp.snapshot();
  assert.ok(snap.referrals.find((r) => r.id === ref.id));
});

test('house rule — program history keeps every version', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  rp.createProgram(baseProgram({ rewardReferrer: { type: REWARD_TYPE_FIXED, value: 120 } }));
  rp.createProgram(baseProgram({ rewardReferrer: { type: REWARD_TYPE_FIXED, value: 150 } }));
  const history = rp.getProgramHistory('kobi-welcome');
  assert.equal(history.length, 3);
  assert.equal(history[0].rewardReferrer.value, 100);
  assert.equal(history[1].rewardReferrer.value, 120);
  assert.equal(history[2].rewardReferrer.value, 150);
});

test('house rule — fromSnapshot round-trips every store', () => {
  const rp = makeRP();
  rp.createProgram(baseProgram());
  const { code } = rp.generateReferralCode({ customerId: 'alice', programId: 'kobi-welcome' });
  rp.trackReferralLink(code, 'whatsapp');
  rp.captureReferred({ code, leadInfo: { leadId: 'l1', email: 'l1@mail.com', ip: '1.2.3.4' } });
  rp.validateConversion({ leadId: 'l1', conditions: { firstPurchase: 1000, purchaseCompleted: true } });
  rp.issueReward({ programId: 'kobi-welcome', side: SIDE_REFERRER, customerId: 'alice', value: 100 });

  const snap = rp.snapshot();
  const rp2  = ReferralProgram.fromSnapshot(snap);
  const s2   = rp2.stats();
  assert.equal(s2.programs,  1);
  assert.equal(s2.codes,     1);
  assert.equal(s2.clicks,    1);
  assert.equal(s2.referrals, 1);
  assert.equal(s2.rewards,   1);
  // Leaderboard must still work after rehydrate
  const board = rp2.leaderboard('kobi-welcome');
  assert.equal(board.length, 1);
  assert.equal(board[0].customerId, 'alice');
});

/* ------------------------------------------------------------------ */
/* Bilingual labels sanity                                             */
/* ------------------------------------------------------------------ */

test('bilingual labels — he + en exports both present', () => {
  assert.equal(LABELS_HE.referral, 'הפניה');
  assert.equal(LABELS_EN.referral, 'Referral');
  assert.equal(LABELS_HE.leaderboard, 'טבלת מובילים');
  assert.equal(LABELS_EN.leaderboard, 'Leaderboard');
});
