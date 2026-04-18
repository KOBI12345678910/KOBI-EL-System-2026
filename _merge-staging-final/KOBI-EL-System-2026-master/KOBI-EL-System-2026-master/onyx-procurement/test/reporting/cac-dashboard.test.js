/**
 * Tests for cac-dashboard.js
 * בדיקות יחידה למודול CAC Dashboard
 *
 * Agent: Y-194
 * Run with: node --test test/reporting/cac-dashboard.test.js
 *
 * Zero third-party imports — uses `node:test` + `node:assert/strict` only.
 * All fixtures are hand-written and deterministic.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  CACDashboard,
  r2,
  r4,
  sum,
  safeDiv,
  toISODate,
  monthsInPeriod,
  monthKey,
  resolvePeriod,
  classifyChannel,
  LABELS,
  DEFAULT_PAID_CHANNELS,
  DEFAULT_ORGANIC_CHANNELS,
} = require('../../src/reporting/cac-dashboard.js');

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES — Q1 2026, Techno-Kol Uzi marketing book
// ═══════════════════════════════════════════════════════════════════════════

const customers = [
  // Paid acquisitions
  { id: 'c1', acquiredAt: '2026-01-05', channel: 'google_ads',   segment: 'smb',         monthlyGrossProfit: 1200 },
  { id: 'c2', acquiredAt: '2026-01-18', channel: 'facebook_ads', segment: 'smb',         monthlyGrossProfit:  800 },
  { id: 'c3', acquiredAt: '2026-02-03', channel: 'google_ads',   segment: 'mid_market',  monthlyGrossProfit: 3500 },
  { id: 'c4', acquiredAt: '2026-02-20', channel: 'linkedin_ads', segment: 'enterprise',  monthlyGrossProfit: 8000 },
  { id: 'c5', acquiredAt: '2026-03-08', channel: 'google_ads',   segment: 'smb',         monthlyGrossProfit:  950 },
  // Organic acquisitions
  { id: 'c6',  acquiredAt: '2026-01-11', channel: 'seo',      segment: 'smb',        monthlyGrossProfit: 1000 },
  { id: 'c7',  acquiredAt: '2026-02-14', channel: 'referral', segment: 'mid_market', monthlyGrossProfit: 2500 },
  { id: 'c8',  acquiredAt: '2026-03-22', channel: 'direct',   segment: 'enterprise', monthlyGrossProfit: 6000 },
  { id: 'c9',  acquiredAt: '2026-03-29', channel: 'email',    segment: 'smb',        monthlyGrossProfit: 1100 },
  // Outside-period (must be excluded)
  { id: 'c10', acquiredAt: '2025-12-20', channel: 'google_ads', segment: 'smb',       monthlyGrossProfit: 1000 },
  { id: 'c11', acquiredAt: '2026-04-02', channel: 'seo',        segment: 'smb',       monthlyGrossProfit: 1000 },
];

const marketing = [
  // Paid
  { date: '2026-01-03', channel: 'google_ads',   lineItem: 'google_ads',   amount: 15000, type: 'paid' },
  { date: '2026-01-15', channel: 'facebook_ads', lineItem: 'facebook_ads', amount:  8000, type: 'paid' },
  { date: '2026-02-02', channel: 'google_ads',   lineItem: 'google_ads',   amount: 18000, type: 'paid' },
  { date: '2026-02-18', channel: 'linkedin_ads', lineItem: 'linkedin_ads', amount: 12000, type: 'paid' },
  { date: '2026-03-05', channel: 'google_ads',   lineItem: 'google_ads',   amount: 16000, type: 'paid' },
  // Organic investment (tooling, content, salaries)
  { date: '2026-01-10', channel: 'seo',     lineItem: 'seo',               amount: 5000, type: 'organic' },
  { date: '2026-02-10', channel: 'content', lineItem: 'content',           amount: 4000, type: 'organic' },
  { date: '2026-03-10', channel: 'events',  lineItem: 'events',            amount: 9000, type: 'organic' },
  { date: '2026-01-01', channel: 'crm_tooling', lineItem: 'crm_tooling',   amount: 2000, type: 'organic' },
  { date: '2026-02-01', channel: 'salaries_marketing', lineItem: 'salaries_marketing', amount: 25000, type: 'organic' },
  // Segment-labeled spend
  { date: '2026-03-12', channel: 'google_ads',   segment: 'enterprise',   lineItem: 'google_ads', amount: 7000, type: 'paid' },
  // Out of period (ignored)
  { date: '2025-12-01', channel: 'google_ads',   lineItem: 'google_ads',   amount: 99999, type: 'paid' },
  { date: '2026-04-15', channel: 'facebook_ads', lineItem: 'facebook_ads', amount: 77777, type: 'paid' },
];

const Q1 = { start: '2026-01-01', end: '2026-03-31' };

function makeDashboard(opts = {}) {
  return new CACDashboard({ customers, marketing, options: opts });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER TESTS
// ═══════════════════════════════════════════════════════════════════════════

test('T01 r2 rounds to 2 decimals; r4 rounds to 4', () => {
  assert.equal(r2(1.234), 1.23);
  assert.equal(r2(1.235999), 1.24);
  assert.equal(r2(1.004), 1);
  assert.equal(r4(1.23456789), 1.2346);
  assert.equal(r2('not-a-number'), 0);
  assert.equal(r2(NaN), 0);
  assert.equal(r2(Infinity), 0);
});

test('T02 sum skips non-numeric values safely', () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([1, 'x', null, undefined, 4]), 5);
  assert.equal(sum(null), 0);
  assert.equal(sum(undefined), 0);
});

test('T03 safeDiv returns null on zero/NaN denominator', () => {
  assert.equal(safeDiv(10, 2), 5);
  assert.equal(safeDiv(10, 0), null);
  assert.equal(safeDiv(10, NaN), null);
  assert.equal(safeDiv('x', 2), null);
});

test('T04 toISODate handles Date, string, and bad input', () => {
  assert.equal(toISODate('2026-01-05'), '2026-01-05');
  assert.equal(toISODate(new Date('2026-01-05T12:00:00Z')), '2026-01-05');
  assert.equal(toISODate(null), null);
  assert.equal(toISODate('nonsense'), null);
});

test('T05 monthsInPeriod counts inclusive months', () => {
  assert.equal(monthsInPeriod('2026-01-01', '2026-03-31'), 3);
  assert.equal(monthsInPeriod('2026-01-01', '2026-01-31'), 1);
  assert.equal(monthsInPeriod('2026-01-01', '2026-12-31'), 12);
});

test('T06 monthKey returns YYYY-MM', () => {
  assert.equal(monthKey('2026-03-15'), '2026-03');
  assert.equal(monthKey(new Date('2026-07-04T00:00:00Z')), '2026-07');
  assert.equal(monthKey(null), null);
});

test('T07 resolvePeriod handles all shorthand forms', () => {
  const p1 = resolvePeriod({ start: '2026-01-01', end: '2026-03-31' });
  assert.equal(p1.start, '2026-01-01');
  assert.equal(p1.end,   '2026-03-31');

  const p2 = resolvePeriod({ year: 2026, quarter: 2 });
  assert.equal(p2.start, '2026-04-01');
  assert.equal(p2.end,   '2026-06-30');

  const p3 = resolvePeriod({ year: 2026, month: 4 });
  assert.equal(p3.start, '2026-04-01');
  assert.equal(p3.end,   '2026-04-30');

  const p4 = resolvePeriod({ year: 2026 });
  assert.equal(p4.start, '2026-01-01');
  assert.equal(p4.end,   '2026-12-31');
});

test('T08 classifyChannel honors explicit type and default sets', () => {
  assert.equal(classifyChannel({ type: 'paid', channel: 'random' },
    DEFAULT_PAID_CHANNELS, DEFAULT_ORGANIC_CHANNELS), 'paid');
  assert.equal(classifyChannel({ channel: 'google_ads' },
    DEFAULT_PAID_CHANNELS, DEFAULT_ORGANIC_CHANNELS), 'paid');
  assert.equal(classifyChannel({ channel: 'seo' },
    DEFAULT_PAID_CHANNELS, DEFAULT_ORGANIC_CHANNELS), 'organic');
  assert.equal(classifyChannel({ channel: 'unknown_channel' },
    DEFAULT_PAID_CHANNELS, DEFAULT_ORGANIC_CHANNELS), 'organic');
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTOR / VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

test('T09 constructor rejects non-array inputs (bilingual error)', () => {
  assert.throws(() => new CACDashboard({ customers: 'oops' }), /customers/);
  assert.throws(() => new CACDashboard({ marketing: 42 }),     /marketing/);
});

test('T10 constructor accepts empty inputs and reports no customers', () => {
  const d = new CACDashboard();
  const b = d.blendedCAC(Q1);
  assert.equal(b.customersAcquired, 0);
  assert.equal(b.totalSpend, 0);
  assert.equal(b.cac, null);
  assert.deepEqual(b.note, LABELS.noCustomers);
});

// ═══════════════════════════════════════════════════════════════════════════
// BLENDED CAC
// ═══════════════════════════════════════════════════════════════════════════

test('T11 blendedCAC — Q1 2026 totals', () => {
  const d = makeDashboard();
  const b = d.blendedCAC(Q1);

  // In-period customers = 9 (c1..c9); c10 and c11 are outside.
  assert.equal(b.customersAcquired, 9);

  // In-period spend = 15000 + 8000 + 18000 + 12000 + 16000 + 5000
  //                  + 4000 + 9000 + 2000 + 25000 + 7000 = 121000
  assert.equal(b.totalSpend, 121000);

  // Paid = 15000 + 8000 + 18000 + 12000 + 16000 + 7000 = 76000
  assert.equal(b.paidSpend, 76000);
  assert.equal(b.organicSpend, 45000);

  // CAC = 121000 / 9 = 13444.444...  → 13444.44 after r2
  assert.equal(b.cac, 13444.44);

  // Bilingual label present
  assert.equal(b.label.he, LABELS.blendedCAC.he);
  assert.equal(b.label.en, LABELS.blendedCAC.en);
});

// ═══════════════════════════════════════════════════════════════════════════
// PAID CAC
// ═══════════════════════════════════════════════════════════════════════════

test('T12 paidCAC counts only paid spend and paid-attributed customers', () => {
  const d = makeDashboard();
  const p = d.paidCAC(Q1);

  // Paid customers = c1..c5 (5 of them), all non-organic channels.
  assert.equal(p.customersAcquired, 5);

  // Paid spend (in period) = 76000
  assert.equal(p.paidSpend, 76000);

  // CAC = 76000 / 5 = 15200
  assert.equal(p.cac, 15200);
});

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIC CAC
// ═══════════════════════════════════════════════════════════════════════════

test('T13 organicCAC counts only organic spend and organic customers', () => {
  const d = makeDashboard();
  const o = d.organicCAC(Q1);

  // Organic customers = c6..c9 (4 of them)
  assert.equal(o.customersAcquired, 4);

  // Organic spend = 5000 + 4000 + 9000 + 2000 + 25000 = 45000
  assert.equal(o.organicSpend, 45000);

  // CAC = 45000 / 4 = 11250
  assert.equal(o.cac, 11250);
});

// ═══════════════════════════════════════════════════════════════════════════
// BY CHANNEL
// ═══════════════════════════════════════════════════════════════════════════

test('T14 byChannel groups, classifies, and sorts by descending spend', () => {
  const d = makeDashboard();
  const byCh = d.byChannel(Q1);
  assert.ok(byCh.rows.length > 0);

  // Top row should be google_ads (15+18+16+7 = 56000)
  const google = byCh.rows.find((r) => r.channel === 'google_ads');
  assert.ok(google, 'google_ads row present');
  assert.equal(google.spend, 56000);
  assert.equal(google.type, 'paid');
  // 3 google customers (c1, c3, c5) → CAC = 56000 / 3 = 18666.67
  assert.equal(google.customers, 3);
  assert.equal(google.cac, 18666.67);

  // linkedin_ads: 12000 / 1 = 12000
  const li = byCh.rows.find((r) => r.channel === 'linkedin_ads');
  assert.equal(li.spend, 12000);
  assert.equal(li.customers, 1);
  assert.equal(li.cac, 12000);

  // Sorted descending by spend — first row has max spend
  const spends = byCh.rows.map((r) => r.spend);
  for (let i = 0; i < spends.length - 1; i += 1) {
    assert.ok(spends[i] >= spends[i + 1]);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BY SEGMENT
// ═══════════════════════════════════════════════════════════════════════════

test('T15 bySegment allocates unsegmented spend proportionally to counts', () => {
  const d = makeDashboard();
  const seg = d.bySegment(Q1);

  // Segment customer counts (Q1): smb=5, mid_market=2, enterprise=2 (total 9)
  const smb        = seg.rows.find((r) => r.segment === 'smb');
  const mid        = seg.rows.find((r) => r.segment === 'mid_market');
  const enterprise = seg.rows.find((r) => r.segment === 'enterprise');
  assert.equal(smb.customers, 5);
  assert.equal(mid.customers, 2);
  assert.equal(enterprise.customers, 2);

  // Direct (segment-tagged) spend = 7000 (enterprise on 2026-03-12)
  // Unallocated = 121000 - 7000 = 114000 → split 5/2/2 among segments.
  assert.equal(seg.unallocatedSpend, 114000);

  // SMB gets 114000 * (5/9) = 63333.33
  assert.equal(smb.spend, 63333.33);
  // mid_market gets 114000 * (2/9) = 25333.33
  assert.equal(mid.spend, 25333.33);
  // enterprise gets 114000 * (2/9) + 7000 direct = 32333.33
  assert.equal(enterprise.spend, 32333.33);

  // CAC = spend / customers
  assert.equal(smb.cac, r2(63333.33 / 5));
  assert.equal(mid.cac, r2(25333.33 / 2));
  assert.equal(enterprise.cac, r2(32333.33 / 2));
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYBACK PERIOD
// ═══════════════════════════════════════════════════════════════════════════

test('T16 paybackPeriod computes months for blended/channel/segment', () => {
  const d = makeDashboard();
  const pb = d.paybackPeriod(Q1);

  // avgGP = mean of [1200, 800, 3500, 8000, 950, 1000, 2500, 6000, 1100]
  //       = 25050 / 9 = 2783.33
  assert.equal(pb.blended.avgMonthlyGrossProfit, 2783.33);
  // Blended payback = 13444.44 / 2783.33 ≈ 4.83 months
  assert.ok(pb.blended.paybackMonths > 4.8);
  assert.ok(pb.blended.paybackMonths < 4.9);

  // Per-channel rows exist and each has a payback or null.
  assert.ok(Array.isArray(pb.byChannel));
  assert.ok(pb.byChannel.length > 0);
  for (const row of pb.byChannel) {
    assert.ok('paybackMonths' in row);
    assert.ok('avgMonthlyGrossProfit' in row);
  }
  for (const row of pb.bySegment) {
    assert.ok('paybackMonths' in row);
  }

  // Spot check: linkedin_ads → 1 enterprise customer, monthlyGP = 8000,
  //              CAC = 12000 → payback = 12000/8000 = 1.5
  const li = pb.byChannel.find((r) => r.channel === 'linkedin_ads');
  assert.equal(li.paybackMonths, 1.5);

  // Label bilingual
  assert.equal(pb.label.he, LABELS.paybackPeriod.he);
  assert.equal(pb.label.en, LABELS.paybackPeriod.en);
});

// ═══════════════════════════════════════════════════════════════════════════
// TREND
// ═══════════════════════════════════════════════════════════════════════════

test('T17 trend buckets customers & spend by month (incl. zero months)', () => {
  const d = makeDashboard();
  const t = d.trend(Q1);

  assert.equal(t.rows.length, 3); // Jan, Feb, Mar
  const [jan, feb, mar] = t.rows;

  assert.equal(jan.month, '2026-01');
  assert.equal(feb.month, '2026-02');
  assert.equal(mar.month, '2026-03');

  // January: spend = 15000 + 8000 + 5000 + 2000 = 30000; customers = c1,c2,c6 = 3
  assert.equal(jan.spend, 30000);
  assert.equal(jan.customers, 3);
  assert.equal(jan.cac, 10000);

  // February: spend = 18000 + 12000 + 4000 + 25000 = 59000; customers = c3,c4,c7 = 3
  assert.equal(feb.spend, 59000);
  assert.equal(feb.customers, 3);
  assert.equal(feb.cac, r2(59000 / 3));

  // March: spend = 16000 + 9000 + 7000 = 32000; customers = c5,c8,c9 = 3
  assert.equal(mar.spend, 32000);
  assert.equal(mar.customers, 3);
  assert.equal(mar.cac, r2(32000 / 3));
});

test('T18 trend includes zero-activity months when period is longer', () => {
  const d = new CACDashboard({
    customers: [{ id: 'x', acquiredAt: '2026-01-05', channel: 'seo', segment: 'smb', monthlyGrossProfit: 500 }],
    marketing: [{ date: '2026-01-05', channel: 'seo', amount: 1000, type: 'organic' }],
  });
  const t = d.trend({ start: '2026-01-01', end: '2026-04-30' });
  assert.equal(t.rows.length, 4);
  const months = t.rows.map((r) => r.month);
  assert.deepEqual(months, ['2026-01', '2026-02', '2026-03', '2026-04']);
  // Feb/Mar/Apr are zero
  assert.equal(t.rows[1].spend, 0);
  assert.equal(t.rows[1].customers, 0);
  assert.equal(t.rows[1].cac, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// BY LINE ITEM
// ═══════════════════════════════════════════════════════════════════════════

test('T19 byLineItem distributes customers proportionally to spend share', () => {
  const d = makeDashboard();
  const li = d.byLineItem(Q1);

  assert.equal(li.totalSpend, 121000);
  assert.equal(li.totalCustomers, 9);

  // google_ads line item total spend = 15+18+16+7 = 56000
  const g = li.rows.find((r) => r.lineItem === 'google_ads');
  assert.equal(g.spend, 56000);
  // share = 56000 / 121000 ≈ 0.4628
  assert.equal(g.share, 0.4628);
  // attributed = 9 * 0.4628 ≈ 4.17 (rounded)
  assert.ok(g.attributedCustomers > 4 && g.attributedCustomers < 4.3);

  // salaries_marketing is a big organic line item
  const sal = li.rows.find((r) => r.lineItem === 'salaries_marketing');
  assert.equal(sal.spend, 25000);
  assert.equal(sal.labelHe, 'שכר צוות שיווק');
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY + BILINGUAL
// ═══════════════════════════════════════════════════════════════════════════

test('T20 summary exposes all sub-reports bilingually', () => {
  const d = makeDashboard();
  const s = d.summary(Q1);

  assert.ok(s.blended);
  assert.ok(s.paid);
  assert.ok(s.organic);
  assert.ok(s.byChannel);
  assert.ok(s.bySegment);
  assert.ok(s.byLineItem);
  assert.ok(s.trend);
  assert.ok(s.payback);
  assert.equal(s.months, 3);
  assert.equal(s.currency, 'ILS');

  // Every sub-report carries a bilingual `label`
  for (const key of ['blended','paid','organic','byChannel','bySegment','byLineItem','trend','payback']) {
    assert.ok(s[key].label, `${key} has label`);
    assert.ok(s[key].label.he, `${key} has Hebrew`);
    assert.ok(s[key].label.en, `${key} has English`);
  }

  // Labels dictionary echoes back
  assert.deepEqual(s.labels.blendedCAC, LABELS.blendedCAC);
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

test('T21 zero-customer period returns null CAC and bilingual "no customers"', () => {
  const d = new CACDashboard({
    customers: [],
    marketing: [{ date: '2026-02-15', channel: 'google_ads', amount: 5000, type: 'paid' }],
  });
  const b = d.blendedCAC(Q1);
  assert.equal(b.cac, null);
  assert.equal(b.customersAcquired, 0);
  assert.deepEqual(b.note, LABELS.noCustomers);
});

test('T22 zero-spend period is fine (CAC = 0 when customers acquired organically for free)', () => {
  const d = new CACDashboard({
    customers: [
      { id: 'z1', acquiredAt: '2026-02-01', channel: 'direct', segment: 'smb', monthlyGrossProfit: 500 },
      { id: 'z2', acquiredAt: '2026-02-10', channel: 'referral', segment: 'smb', monthlyGrossProfit: 600 },
    ],
    marketing: [],
  });
  const b = d.blendedCAC(Q1);
  assert.equal(b.totalSpend, 0);
  assert.equal(b.customersAcquired, 2);
  assert.equal(b.cac, 0);
});

test('T23 out-of-period rows are excluded from every metric', () => {
  const d = makeDashboard();
  const b = d.blendedCAC(Q1);
  // Sanity: c10 (2025-12-20), c11 (2026-04-02), out-of-period marketing rows
  // must NOT appear in totals.
  assert.equal(b.customersAcquired, 9);           // NOT 11
  assert.equal(b.totalSpend, 121000);             // NOT ~300k
});

test('T24 unknown channel falls into "unknown" bucket and organic classification', () => {
  const d = new CACDashboard({
    customers: [
      { id: 'u1', acquiredAt: '2026-02-01', channel: 'mystery_box', segment: 'smb', monthlyGrossProfit: 500 },
    ],
    marketing: [
      { date: '2026-02-01', channel: 'mystery_box', amount: 1000 },
    ],
  });
  const byCh = d.byChannel(Q1);
  const mystery = byCh.rows.find((r) => r.channel === 'mystery_box');
  assert.ok(mystery);
  assert.equal(mystery.type, 'organic');
  assert.equal(mystery.spend, 1000);
  assert.equal(mystery.customers, 1);
  assert.equal(mystery.cac, 1000);
});

test('T25 custom paidChannels option reclassifies a known organic channel', () => {
  const d = new CACDashboard({
    customers: [
      { id: 'q1', acquiredAt: '2026-02-01', channel: 'email', segment: 'smb', monthlyGrossProfit: 500 },
    ],
    marketing: [
      { date: '2026-02-01', channel: 'email', amount: 1000 },
    ],
    options: { paidChannels: ['email'], organicChannels: [] },
  });
  const byCh = d.byChannel(Q1);
  const em = byCh.rows.find((r) => r.channel === 'email');
  assert.equal(em.type, 'paid');

  const p = d.paidCAC(Q1);
  assert.equal(p.customersAcquired, 1);
  assert.equal(p.paidSpend, 1000);
  assert.equal(p.cac, 1000);
});

test('T26 every top-level return object carries a bilingual `label` with he/en', () => {
  const d = makeDashboard();
  const ret = [
    d.blendedCAC(Q1),
    d.paidCAC(Q1),
    d.organicCAC(Q1),
    d.byChannel(Q1),
    d.bySegment(Q1),
    d.byLineItem(Q1),
    d.trend(Q1),
    d.paybackPeriod(Q1),
  ];
  for (const r of ret) {
    assert.ok(r.label, 'label present');
    assert.equal(typeof r.label.he, 'string');
    assert.equal(typeof r.label.en, 'string');
    assert.ok(r.label.he.length > 0);
    assert.ok(r.label.en.length > 0);
  }
});

test('T27 currency defaults to ILS and is overridable', () => {
  const d1 = makeDashboard();
  assert.equal(d1.blendedCAC(Q1).currency, 'ILS');

  const d2 = new CACDashboard({
    customers, marketing,
    options: { currency: 'USD' },
  });
  assert.equal(d2.blendedCAC(Q1).currency, 'USD');
  assert.equal(d2.summary(Q1).currency, 'USD');
});
