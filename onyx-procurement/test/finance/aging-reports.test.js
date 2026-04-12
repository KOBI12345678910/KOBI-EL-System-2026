/**
 * aging-reports.test.js — Tests for finance/aging-reports.js
 * Agent Y-087 — Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Run:   node --test test/finance/aging-reports.test.js
 *
 * Coverage (≥ 20 tests):
 *   1. default buckets shape & immutability
 *   2. daysBetween helper — positive / negative / zero
 *   3. bucketFor — boundary + overflow into 180+
 *   4. arAging — happy path totals
 *   5. arAging — custom buckets override default
 *   6. arAging — paidDate filters out closed invoices
 *   7. apAging — happy path + vendor breakdown
 *   8. dsoCalculation — formula correctness
 *   9. dsoCalculation — zero revenue guard
 *  10. dpoCalculation — formula correctness
 *  11. dpoCalculation — zero cogs guard
 *  12. customerAging — filters correctly & sorts oldest first
 *  13. vendorAging — supports vendorId alias
 *  14. topDelinquents — sorted by amount desc
 *  15. topDelinquents — respects limit
 *  16. exportCSV — bilingual headers
 *  17. exportCSV — includes totals row
 *  18. exportPDF — payload structure
 *  19. variance — worsened / improved / stable
 *  20. variance — pct handles zero prior
 *  21. concentrationRisk — top-10 share
 *  22. concentrationRisk — HHI grows with concentration
 *  23. alerts — threshold trigger + severity
 *  24. arAging — deterministic (same input ⇒ same output)
 *  25. house rule — no mutation of input array
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgingReports,
  DEFAULT_BUCKETS_V2,
  HEBREW_GLOSSARY_V2,
  daysBetween,
  bucketFor,
  toDate,
  round2,
} = require('../../src/finance/aging-reports.js');

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

const AS_OF = '2026-04-11'; // matches currentDate in runtime context

function makeInv(id, customerId, amount, issueOffset, dueOffset, paidOffset = null) {
  // Offsets are relative to AS_OF (negative = before AS_OF).
  const asOf = new Date(AS_OF + 'T00:00:00Z');
  const iso = (off) => {
    const d = new Date(asOf);
    d.setUTCDate(d.getUTCDate() + off);
    return d.toISOString().slice(0, 10);
  };
  return {
    id,
    customerId,
    amount,
    issueDate: iso(issueOffset),
    dueDate:   iso(dueOffset),
    paidDate:  paidOffset == null ? null : iso(paidOffset),
    currency:  'ILS',
  };
}

function makeBill(id, vendorId, amount, issueOffset, dueOffset, paidOffset = null) {
  const inv = makeInv(id, vendorId, amount, issueOffset, dueOffset, paidOffset);
  inv.vendorId = vendorId;
  return inv;
}

// Canonical invoice set — covers every bucket
const CANON_INVOICES = [
  makeInv('INV-001', 'CUST-A',  1000, -10,  +5),   // current, not yet due
  makeInv('INV-002', 'CUST-A',  2000, -20, -10),   // 10 days overdue => 0-30
  makeInv('INV-003', 'CUST-B',  3000, -50, -40),   // 40 days overdue => 31-60
  makeInv('INV-004', 'CUST-B',  4000, -90, -80),   // 80 days overdue => 61-90
  makeInv('INV-005', 'CUST-C',  5000,-150,-140),   // 140 days overdue => 91-180
  makeInv('INV-006', 'CUST-C',  6000,-300,-290),   // 290 days overdue => 180+
  makeInv('INV-007', 'CUST-D',  7000, -50, -40, -30), // PAID ⇒ excluded
];

const CANON_BILLS = [
  makeBill('BILL-001', 'VND-X',  1500, -15, -5),
  makeBill('BILL-002', 'VND-X',  2500, -40, -30),
  makeBill('BILL-003', 'VND-Y',  3500, -80, -70),
  makeBill('BILL-004', 'VND-Z',  4500,-250,-240),
];

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

test('01. default buckets shape is frozen and has 5 buckets', () => {
  assert.equal(DEFAULT_BUCKETS_V2.length, 5);
  assert.equal(DEFAULT_BUCKETS_V2[0].label, '0-30');
  assert.equal(DEFAULT_BUCKETS_V2[4].label, '180+');
  assert.equal(DEFAULT_BUCKETS_V2[4].max, Infinity);
  assert.throws(() => { DEFAULT_BUCKETS_V2.push({}); });
});

test('02. daysBetween — positive / negative / zero', () => {
  assert.equal(daysBetween('2026-04-11', '2026-04-01'), 10);
  assert.equal(daysBetween('2026-04-01', '2026-04-11'), -10);
  assert.equal(daysBetween('2026-04-11', '2026-04-11'), 0);
});

test('03. bucketFor — boundary and overflow into 180+', () => {
  assert.equal(bucketFor(0,    DEFAULT_BUCKETS_V2).label, '0-30');
  assert.equal(bucketFor(30,   DEFAULT_BUCKETS_V2).label, '0-30');
  assert.equal(bucketFor(31,   DEFAULT_BUCKETS_V2).label, '31-60');
  assert.equal(bucketFor(60,   DEFAULT_BUCKETS_V2).label, '31-60');
  assert.equal(bucketFor(91,   DEFAULT_BUCKETS_V2).label, '91-180');
  assert.equal(bucketFor(180,  DEFAULT_BUCKETS_V2).label, '91-180');
  assert.equal(bucketFor(181,  DEFAULT_BUCKETS_V2).label, '180+');
  assert.equal(bucketFor(9999, DEFAULT_BUCKETS_V2).label, '180+');
  assert.equal(bucketFor(-5,   DEFAULT_BUCKETS_V2).label, '0-30', 'negative ⇒ current');
});

test('04. arAging — happy path totals', () => {
  const r = new AgingReports();
  const rep = r.arAging(CANON_INVOICES, AS_OF);
  // 6 open + 1 paid excluded
  assert.equal(rep.totals.count, 6);
  assert.equal(rep.totals.amount, 1000 + 2000 + 3000 + 4000 + 5000 + 6000);
  assert.equal(rep.type, 'AR');
  assert.equal(rep.typeHe, HEBREW_GLOSSARY_V2.accountsReceivable.he);
  assert.equal(rep.byBucket['0-30'].amount,   3000); // INV-001 (current) + INV-002 (10 overdue)
  assert.equal(rep.byBucket['31-60'].amount,  3000); // INV-003
  assert.equal(rep.byBucket['61-90'].amount,  4000); // INV-004
  assert.equal(rep.byBucket['91-180'].amount, 5000); // INV-005
  assert.equal(rep.byBucket['180+'].amount,   6000); // INV-006
});

test('05. arAging — custom buckets override default', () => {
  const custom = [
    { min: 0,  max: 15,       label: '0-15',  labelHe: '0-15 ימים'  },
    { min: 16, max: Infinity, label: '16+',   labelHe: '16+ ימים'   },
  ];
  const r = new AgingReports();
  const rep = r.arAging(CANON_INVOICES, AS_OF, { buckets: custom });
  assert.equal(rep.buckets.length, 2);
  assert.ok(rep.byBucket['0-15']);
  assert.ok(rep.byBucket['16+']);
  // INV-001 (current) + INV-002 (10 overdue) ⇒ 0-15
  assert.equal(rep.byBucket['0-15'].amount, 3000);
  // All others 40+ days overdue ⇒ 16+
  assert.equal(rep.byBucket['16+'].amount, 3000 + 4000 + 5000 + 6000);
});

test('06. arAging — paid invoices excluded from open balance', () => {
  const r = new AgingReports();
  const rep = r.arAging(CANON_INVOICES, AS_OF);
  // CUST-D only had one invoice, and it's paid
  assert.equal(rep.byCustomer['CUST-D'], undefined);
});

test('07. apAging — happy path + vendor breakdown', () => {
  const r = new AgingReports();
  const rep = r.apAging(CANON_BILLS, AS_OF);
  assert.equal(rep.type, 'AP');
  assert.equal(rep.totals.count, 4);
  assert.equal(rep.totals.amount, 1500 + 2500 + 3500 + 4500);
  assert.equal(rep.byVendor['VND-X'].total, 1500 + 2500);
  assert.equal(rep.byVendor['VND-Z'].total, 4500);
  // VND-Z bill is 240 days overdue => 180+
  assert.equal(rep.byVendor['VND-Z'].buckets['180+'].amount, 4500);
});

test('08. dsoCalculation — formula correctness', () => {
  const r = new AgingReports();
  // openAR = sum of unpaid = 21000 (the 6 open invoices)
  const result = r.dsoCalculation({
    invoices: CANON_INVOICES,
    period: 90,
    revenue: 100000,
  });
  // DSO = (21000 / 100000) * 90 = 18.9
  assert.equal(result.dso, 18.9);
  assert.equal(result.openAR, 21000);
});

test('09. dsoCalculation — zero revenue guard', () => {
  const r = new AgingReports();
  const result = r.dsoCalculation({ invoices: CANON_INVOICES, period: 30, revenue: 0 });
  assert.equal(result.dso, 0);
  assert.equal(result.note, 'zero_revenue');
});

test('10. dpoCalculation — formula correctness', () => {
  const r = new AgingReports();
  // openAP = 12000; cogs = 48000; period = 30 ⇒ 7.5
  const result = r.dpoCalculation({
    bills: CANON_BILLS,
    period: 30,
    cogs: 48000,
  });
  assert.equal(result.dpo, 7.5);
  assert.equal(result.openAP, 12000);
});

test('11. dpoCalculation — zero cogs guard', () => {
  const r = new AgingReports();
  const result = r.dpoCalculation({ bills: CANON_BILLS, period: 30, cogs: 0 });
  assert.equal(result.dpo, 0);
  assert.equal(result.note, 'zero_cogs');
});

test('12. customerAging — filters correctly & sorts oldest first', () => {
  const r = new AgingReports();
  const rep = r.customerAging('CUST-A', CANON_INVOICES, AS_OF);
  assert.equal(rep.count, 2);
  assert.equal(rep.total, 3000);
  // INV-002 (10 overdue) should come before INV-001 (not yet due, daysOverdue=-5)
  assert.equal(rep.items[0].id, 'INV-002');
  assert.equal(rep.items[0].daysOverdue, 10);
  assert.equal(rep.items[1].id, 'INV-001');
});

test('13. vendorAging — supports vendorId alias', () => {
  const r = new AgingReports();
  const rep = r.vendorAging('VND-X', CANON_BILLS, AS_OF);
  assert.equal(rep.count, 2);
  assert.equal(rep.total, 4000);
  // Both BILL-001 (5 overdue) and BILL-002 (30 overdue) fit in 0-30 bucket (max=30).
  assert.equal(rep.byBucket['0-30'].count, 2);
  assert.equal(rep.byBucket['0-30'].amount, 4000);
  assert.equal(rep.byBucket['31-60'].count, 0);
});

test('14. topDelinquents — sorted by amount desc', () => {
  const r = new AgingReports();
  const top = r.topDelinquents(CANON_INVOICES, 10, AS_OF);
  // top row should be INV-006 (6000, 290 overdue)
  assert.equal(top[0].id, 'INV-006');
  assert.equal(top[0].amount, 6000);
  // next should be INV-005 (5000)
  assert.equal(top[1].id, 'INV-005');
  assert.equal(top[1].amount, 5000);
  // INV-001 is not yet due ⇒ excluded from delinquents
  assert.ok(!top.find(r => r.id === 'INV-001'));
});

test('15. topDelinquents — respects limit', () => {
  const r = new AgingReports();
  const top = r.topDelinquents(CANON_INVOICES, 2, AS_OF);
  assert.equal(top.length, 2);
});

test('16. exportCSV — bilingual headers', () => {
  const r = new AgingReports();
  const rep = r.arAging(CANON_INVOICES, AS_OF);
  const csv = r.exportCSV(rep);
  const lines = csv.trim().split('\n');
  assert.ok(lines[0].includes('Customer ID'), 'row 1 English header');
  assert.ok(lines[1].includes(HEBREW_GLOSSARY_V2.customerId.he), 'row 2 Hebrew header');
  assert.ok(lines[0].includes('0-30'));
  assert.ok(lines[1].includes('0-30 ימים'));
});

test('17. exportCSV — includes totals row', () => {
  const r = new AgingReports();
  const rep = r.arAging(CANON_INVOICES, AS_OF);
  const csv = r.exportCSV(rep);
  assert.ok(csv.includes('TOTAL / סה״כ'));
  assert.ok(csv.includes('21000'));
});

test('18. exportPDF — payload structure', () => {
  const r = new AgingReports();
  const rep = r.arAging(CANON_INVOICES, AS_OF);
  const pdf = r.exportPDF(rep);
  assert.equal(pdf.meta.direction, 'rtl');
  assert.ok(pdf.meta.title.includes('דוח גיול'));
  assert.ok(Array.isArray(pdf.rows));
  assert.ok(pdf.rows.length >= 1);
  assert.equal(pdf.summary.totalAmount, 21000);
  assert.equal(pdf.header.en.length, pdf.header.he.length);
});

test('19. variance — worsened / improved / stable', () => {
  const r = new AgingReports();
  const current = r.arAging(CANON_INVOICES, AS_OF);
  // Build a prior report with smaller totals to simulate worsening
  const priorInvoices = CANON_INVOICES.filter(i => i.id !== 'INV-006'); // drop 6000
  const prior = r.arAging(priorInvoices, AS_OF);
  const v = r.variance(current, prior);
  assert.equal(v.totals.current, 21000);
  assert.equal(v.totals.prior,   15000);
  assert.equal(v.totals.delta,   6000);
  assert.equal(v.totals.direction, 'worsened');
  // Bucket 180+ had 6000 appearing fresh
  assert.equal(v.byBucket['180+'].direction, 'worsened');
});

test('20. variance — pct handles zero prior safely', () => {
  const r = new AgingReports();
  const current = r.arAging(CANON_INVOICES, AS_OF);
  const prior = r.arAging([], AS_OF);
  const v = r.variance(current, prior);
  assert.equal(v.totals.prior, 0);
  assert.equal(v.totals.deltaPct, Infinity);
});

test('21. concentrationRisk — top-10 share and shape', () => {
  const r = new AgingReports();
  const risk = r.concentrationRisk(CANON_INVOICES);
  assert.equal(risk.grandTotal, 21000);
  assert.ok(risk.top10.length <= 10);
  // With only 3 open customers, top-10 share must be 100%
  assert.equal(risk.top10SharePct, 100);
  assert.equal(risk.risk, 'high');
  // CUST-C has 11000 ⇒ biggest
  assert.equal(risk.top10[0].customerId, 'CUST-C');
});

test('22. concentrationRisk — HHI grows with concentration', () => {
  const r = new AgingReports();
  // Spread portfolio: 10 customers × 1000 each
  const spread = Array.from({ length: 10 }, (_, i) =>
    makeInv(`SP-${i}`, `C${i}`, 1000, -20, -10)
  );
  // Concentrated portfolio: one customer has 10000
  const concentrated = [makeInv('CO-1', 'CBIG', 10000, -20, -10)];
  const r1 = r.concentrationRisk(spread);
  const r2 = r.concentrationRisk(concentrated);
  assert.ok(r2.hhi > r1.hhi, 'concentrated HHI must exceed spread HHI');
  assert.equal(r2.risk, 'high');
  assert.equal(r1.risk, 'high'); // top-10 captures all 10 ⇒ 100% share
});

test('23. alerts — threshold triggers with severity classification', () => {
  const r = new AgingReports();
  const rep = r.arAging(CANON_INVOICES, AS_OF);
  // Threshold below the 91-180 bucket (which is 5000) ⇒ warning
  const a = r.alerts({ threshold: 4000, bucket: '91-180' }, rep);
  assert.equal(a.triggered.length, 1);
  assert.equal(a.triggered[0].bucket, '91-180');
  assert.equal(a.triggered[0].severity, 'warning');

  // Half the 180+ bucket (3000) so amount (6000) >= 2 * threshold ⇒ critical
  const b = r.alerts({ threshold: 3000, bucket: '180+' }, rep);
  assert.equal(b.triggered[0].severity, 'critical');

  // Threshold above all buckets — no trigger
  const c = r.alerts({ threshold: 999999 }, rep);
  assert.equal(c.triggered.length, 0);
  assert.equal(c.anyTriggered, false);
});

test('24. arAging — deterministic output', () => {
  const r = new AgingReports();
  const r1 = r.arAging(CANON_INVOICES, AS_OF);
  const r2 = r.arAging(CANON_INVOICES, AS_OF);
  assert.deepEqual(r1, r2);
});

test('25. house rule — no mutation of input arrays ("לא מוחקים")', () => {
  const r = new AgingReports();
  const snapshot = JSON.stringify(CANON_INVOICES);
  r.arAging(CANON_INVOICES, AS_OF);
  r.topDelinquents(CANON_INVOICES, 5, AS_OF);
  r.concentrationRisk(CANON_INVOICES);
  assert.equal(JSON.stringify(CANON_INVOICES), snapshot, 'input must not mutate');
});

test('26. round2 — banker-neutral behavior on .5', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.345), 2.35);
  assert.equal(round2(0),     0);
});

test('27. toDate — accepts Date, ISO string, and UTC-midnight normalizes', () => {
  const d1 = toDate('2026-04-11');
  const d2 = toDate(new Date('2026-04-11T15:30:00Z'));
  assert.equal(d1.getTime(), d2.getTime(), 'time-of-day stripped');
});
