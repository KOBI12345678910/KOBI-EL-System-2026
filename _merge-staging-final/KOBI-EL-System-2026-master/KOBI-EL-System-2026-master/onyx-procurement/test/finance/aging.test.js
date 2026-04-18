/**
 * Unit tests for finance/aging.js — AR/AP Aging Engine
 * Agent Y-087 — Swarm 3C — Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Run:   node --test test/finance/aging.test.js
 *
 * Coverage:
 *   1. Bucket assignment (0-30, 31-60, 61-90, 91-120, 120+, and the negative,
 *      on-boundary, and Infinity edge cases)
 *   2. arAging + apAging happy-path totals
 *   3. agingByCustomer / agingBySupplier drill-downs
 *   4. aveDaysToPay (DSO) / aveDaysToBeingPaid (DPO)
 *   5. disputedItems — persisted, resolved-but-not-deleted
 *   6. writeOffs — append-only ledger
 *   7. concentrationAnalysis — top-10 sort & %
 *   8. trendAnalysis — improving / deteriorating / stable classification
 *   9. bucketMovement — moved / worsened / improved / cleared / newcomers
 *  10. reminderGeneration — polite / firm / legal, Hebrew + English bodies
 *  11. generateARReport / generateAPReport — SVG + bilingual text
 *  12. customerStatement — opening / closing balance, running column
 *
 * House rule: לא מוחקים רק משדרגים ומגדלים — the tests verify that
 * write-off, dispute, and resolution are persisted as state transitions,
 * not deletions.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Aging,
  DEFAULT_BUCKETS,
  REMINDER_TONES,
  STATUS,
  HEBREW_GLOSSARY,
  daysBetween,
  addDays,
  bucketFor,
  fmtILS,
} = require('../../src/finance/aging.js');

// ─────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────

const AS_OF = new Date('2026-04-11T00:00:00Z');

function mkAging() {
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'C1', name: 'Acme Ltd', nameHe: 'אקמי בע"מ', language: 'he' });
  a.addCustomer({ id: 'C2', name: 'Beta Co',  nameHe: 'בטא בע"מ', language: 'en' });
  a.addCustomer({ id: 'C3', name: 'Gamma Ltd', nameHe: 'גאמא בע"מ' });
  a.addSupplier({ id: 'S1', name: 'Tadiran',   nameHe: 'תדיראן' });
  a.addSupplier({ id: 'S2', name: 'Elektra',   nameHe: 'אלקטרה' });
  // AR invoices — 5 buckets
  a.addARInvoice({ id: 'AR-00', customerId: 'C1', issueDate: '2026-04-05', dueDate: '2026-04-15', amount: 1000 });  // 0-30 (not yet due)
  a.addARInvoice({ id: 'AR-07', customerId: 'C1', issueDate: '2026-03-25', dueDate: '2026-04-04', amount: 2000 });  // 7 days overdue  -> 0-30
  a.addARInvoice({ id: 'AR-40', customerId: 'C1', issueDate: '2026-02-20', dueDate: '2026-03-02', amount: 3000 });  // 40 days overdue -> 31-60
  a.addARInvoice({ id: 'AR-75', customerId: 'C2', issueDate: '2026-01-10', dueDate: '2026-01-26', amount: 4000 });  // 75 days overdue -> 61-90
  a.addARInvoice({ id: 'AR-100', customerId: 'C2', issueDate: '2025-12-10', dueDate: '2026-01-01', amount: 5000 }); // 100 days overdue -> 91-120
  a.addARInvoice({ id: 'AR-160', customerId: 'C3', issueDate: '2025-10-01', dueDate: '2025-11-02', amount: 6000 }); // 160 days overdue -> 120+
  // AP invoices
  a.addAPInvoice({ id: 'AP-10', supplierId: 'S1', issueDate: '2026-03-20', dueDate: '2026-04-01', amount: 1500 }); // 10 days overdue -> 0-30
  a.addAPInvoice({ id: 'AP-50', supplierId: 'S1', issueDate: '2026-01-20', dueDate: '2026-02-20', amount: 2500 }); // 50 days overdue -> 31-60
  a.addAPInvoice({ id: 'AP-70', supplierId: 'S2', issueDate: '2026-01-01', dueDate: '2026-01-31', amount: 3500 }); // 70 days overdue -> 61-90
  return a;
}

// ─────────────────────────────────────────────────────────────
// 1. bucketFor — unit tests
// ─────────────────────────────────────────────────────────────

test('bucketFor: negative days sit in 0-30', () => {
  const b = bucketFor(-5);
  assert.equal(b.label, '0-30');
});

test('bucketFor: 0 sits in 0-30', () => {
  assert.equal(bucketFor(0).label, '0-30');
});

test('bucketFor: 30 sits in 0-30 (inclusive upper boundary)', () => {
  assert.equal(bucketFor(30).label, '0-30');
});

test('bucketFor: 31 sits in 31-60', () => {
  assert.equal(bucketFor(31).label, '31-60');
});

test('bucketFor: 60 sits in 31-60', () => {
  assert.equal(bucketFor(60).label, '31-60');
});

test('bucketFor: 61 sits in 61-90', () => {
  assert.equal(bucketFor(61).label, '61-90');
});

test('bucketFor: 90 sits in 61-90', () => {
  assert.equal(bucketFor(90).label, '61-90');
});

test('bucketFor: 91 sits in 91-120', () => {
  assert.equal(bucketFor(91).label, '91-120');
});

test('bucketFor: 120 sits in 91-120', () => {
  assert.equal(bucketFor(120).label, '91-120');
});

test('bucketFor: 121 sits in 120+', () => {
  assert.equal(bucketFor(121).label, '120+');
});

test('bucketFor: very large (9999) sits in 120+', () => {
  assert.equal(bucketFor(9999).label, '120+');
});

test('bucketFor: uses custom bucket set', () => {
  const customBuckets = [
    { min: 0, max: 15, label: '0-15', he: '0-15' },
    { min: 16, max: 45, label: '16-45', he: '16-45' },
    { min: 46, max: Infinity, label: '46+', he: '46+' },
  ];
  assert.equal(bucketFor(20, customBuckets).label, '16-45');
});

// ─────────────────────────────────────────────────────────────
// 2. daysBetween / addDays primitives
// ─────────────────────────────────────────────────────────────

test('daysBetween: 10 days forward', () => {
  assert.equal(daysBetween('2026-04-01', '2026-04-11'), 10);
});

test('daysBetween: past returns negative? no — a to b means b - a', () => {
  assert.equal(daysBetween('2026-04-11', '2026-04-01'), -10);
});

test('addDays: 7 days forward is non-mutating', () => {
  const a = new Date('2026-04-11T00:00:00Z');
  const b = addDays(a, 7);
  assert.equal(b.toISOString().slice(0, 10), '2026-04-18');
  assert.equal(a.toISOString().slice(0, 10), '2026-04-11');
});

// ─────────────────────────────────────────────────────────────
// 3. arAging — happy path
// ─────────────────────────────────────────────────────────────

test('arAging returns totals, items, and byCustomer', () => {
  const a = mkAging();
  const ar = a.arAging({ asOfDate: AS_OF });
  assert.ok(ar.items.length === 6);
  assert.equal(ar.totals.count, 6);
  // Sum of all AR amounts
  assert.equal(ar.totals.total, 1000 + 2000 + 3000 + 4000 + 5000 + 6000);
});

test('arAging assigns correct bucket totals', () => {
  const a = mkAging();
  const ar = a.arAging({ asOfDate: AS_OF });
  const b = ar.totals.buckets;
  assert.equal(b['0-30'].count, 2);    // AR-00 + AR-07
  assert.equal(b['0-30'].total, 3000);
  assert.equal(b['31-60'].count, 1);   // AR-40
  assert.equal(b['31-60'].total, 3000);
  assert.equal(b['61-90'].count, 1);   // AR-75
  assert.equal(b['61-90'].total, 4000);
  assert.equal(b['91-120'].count, 1);  // AR-100
  assert.equal(b['91-120'].total, 5000);
  assert.equal(b['120+'].count, 1);    // AR-160
  assert.equal(b['120+'].total, 6000);
});

test('arAging drops paid invoices from the output', () => {
  const a = mkAging();
  a.recordPayment({ type: 'AR', invoiceId: 'AR-07', amount: 2000, date: '2026-04-09' });
  const ar = a.arAging({ asOfDate: AS_OF });
  const hasAR07 = ar.items.find(it => it.id === 'AR-07');
  assert.equal(hasAR07, undefined);
  assert.equal(ar.totals.total, 1000 + 3000 + 4000 + 5000 + 6000); // 19_000
});

test('arAging drops written-off invoices from the output', () => {
  const a = mkAging();
  a.writeOff({ type: 'AR', invoiceId: 'AR-160', amount: 6000, reason: 'Bankruptcy', approvedBy: 'CFO', date: '2026-04-10' });
  const ar = a.arAging({ asOfDate: AS_OF });
  const hasAR160 = ar.items.find(it => it.id === 'AR-160');
  assert.equal(hasAR160, undefined);
});

test('arAging byCustomer aggregates correctly', () => {
  const a = mkAging();
  const ar = a.arAging({ asOfDate: AS_OF });
  const c1 = ar.byCustomer.find(c => c.customerId === 'C1');
  assert.ok(c1);
  assert.equal(c1.total, 1000 + 2000 + 3000); // 6000
  const c2 = ar.byCustomer.find(c => c.customerId === 'C2');
  assert.equal(c2.total, 4000 + 5000);         // 9000
  const c3 = ar.byCustomer.find(c => c.customerId === 'C3');
  assert.equal(c3.total, 6000);
});

// ─────────────────────────────────────────────────────────────
// 4. apAging
// ─────────────────────────────────────────────────────────────

test('apAging returns bySupplier and totals', () => {
  const a = mkAging();
  const ap = a.apAging(AS_OF);
  assert.equal(ap.totals.count, 3);
  assert.equal(ap.totals.total, 1500 + 2500 + 3500);
  const s1 = ap.bySupplier.find(s => s.supplierId === 'S1');
  assert.equal(s1.total, 1500 + 2500);
  const s2 = ap.bySupplier.find(s => s.supplierId === 'S2');
  assert.equal(s2.total, 3500);
});

// ─────────────────────────────────────────────────────────────
// 5. agingByCustomer / agingBySupplier drill-downs
// ─────────────────────────────────────────────────────────────

test('agingByCustomer returns only that customer', () => {
  const a = mkAging();
  const r = a.agingByCustomer('C1', { asOf: AS_OF });
  assert.equal(r.items.length, 3);
  assert.equal(r.customer.name, 'Acme Ltd');
  assert.equal(r.totalOutstanding, 1000 + 2000 + 3000);
});

test('agingBySupplier returns only that supplier', () => {
  const a = mkAging();
  const r = a.agingBySupplier('S1', { asOf: AS_OF });
  assert.equal(r.items.length, 2);
  assert.equal(r.supplier.name, 'Tadiran');
  assert.equal(r.totalOutstanding, 1500 + 2500);
});

// ─────────────────────────────────────────────────────────────
// 6. aveDaysToPay / aveDaysToBeingPaid
// ─────────────────────────────────────────────────────────────

test('aveDaysToPay computes average days for one customer', () => {
  const a = mkAging();
  a.recordPayment({ type: 'AR', invoiceId: 'AR-07', amount: 2000, date: '2026-04-04' }); //  10 days
  a.recordPayment({ type: 'AR', invoiceId: 'AR-40', amount: 3000, date: '2026-03-22' }); //  30 days
  const r = a.aveDaysToPay({ customerId: 'C1' });
  assert.equal(r.sampleSize, 2);
  assert.equal(r.avgDays, 20); // (10 + 30) / 2
});

test('aveDaysToBeingPaid (DPO) computes for one supplier', () => {
  const a = mkAging();
  a.recordPayment({ type: 'AP', invoiceId: 'AP-10', amount: 1500, date: '2026-04-05' }); // issue 2026-03-20 => 16 days
  a.recordPayment({ type: 'AP', invoiceId: 'AP-50', amount: 2500, date: '2026-02-25' }); // issue 2026-01-20 => 36 days
  const r = a.aveDaysToBeingPaid({ supplierId: 'S1' });
  assert.equal(r.sampleSize, 2);
  assert.equal(r.avgDays, 26); // (16 + 36) / 2
});

// ─────────────────────────────────────────────────────────────
// 7. disputedItems
// ─────────────────────────────────────────────────────────────

test('disputedItems records and returns AR disputes, never deletes', () => {
  const a = mkAging();
  a.flagDispute({ type: 'AR', invoiceId: 'AR-75', reason: 'Wrong quantity', flaggedAt: '2026-04-01', flaggedBy: 'ar-clerk' });
  const d = a.disputedItems();
  assert.equal(d.ar.length, 1);
  assert.equal(d.ar[0].invoiceId, 'AR-75');
  assert.equal(d.ar[0].reason, 'Wrong quantity');
  // Resolving does NOT delete
  a.resolveDispute('AR-75', { at: '2026-04-05', note: 'customer accepted' });
  const d2 = a.disputedItems();
  assert.equal(d2.ar.length, 1);
  assert.equal(d2.ar[0].resolvedAt, '2026-04-05');
});

// ─────────────────────────────────────────────────────────────
// 8. writeOffs — append-only
// ─────────────────────────────────────────────────────────────

test('writeOffs appends to ledger, never deletes', () => {
  const a = mkAging();
  a.writeOff({ type: 'AR', invoiceId: 'AR-160', amount: 6000, reason: 'Bankruptcy', approvedBy: 'CFO', date: '2026-04-10' });
  const w = a.writeOffs();
  assert.equal(w.count, 1);
  assert.equal(w.total, 6000);
  // Invoice record is still present
  const ar = a.arAging({ asOfDate: AS_OF });
  const present = a.arInvoices.get('AR-160');
  assert.ok(present);
  assert.equal(present.status, STATUS.WRITTEN_OFF);
  // But dropped from live aging
  assert.equal(ar.items.find(it => it.id === 'AR-160'), undefined);
});

test('writeOffs can be filtered by period', () => {
  const a = mkAging();
  a.writeOff({ type: 'AR', invoiceId: 'AR-160', amount: 6000, reason: 'BK', date: '2026-04-10' });
  a.writeOff({ type: 'AR', invoiceId: 'AR-100', amount: 5000, reason: 'BK', date: '2026-01-15' });
  const all = a.writeOffs();
  assert.equal(all.count, 2);
  const qApr = a.writeOffs({ from: '2026-04-01', to: '2026-04-30' });
  assert.equal(qApr.count, 1);
  assert.equal(qApr.total, 6000);
});

// ─────────────────────────────────────────────────────────────
// 9. concentrationAnalysis
// ─────────────────────────────────────────────────────────────

test('concentrationAnalysis returns top customers and suppliers sorted', () => {
  const a = mkAging();
  const c = a.concentrationAnalysis();
  assert.ok(c.topCustomers.length > 0);
  // Top customer should be C2 (9000) > C3 (6000) > C1 (6000)
  assert.equal(c.topCustomers[0].customerId, 'C2');
  assert.equal(c.topCustomers[0].total, 9000);
  // Percentages sum reasonably
  const total = c.topCustomers.reduce((s, t) => s + t.total, 0);
  assert.equal(total, 21000);
  // Top supplier should be S2 (3500) > S1 (4000)?  S1 = 1500+2500 = 4000 > S2 = 3500
  assert.equal(c.topSuppliers[0].supplierId, 'S1');
});

test('concentrationAnalysis computes pctOfAR correctly', () => {
  const a = mkAging();
  const c = a.concentrationAnalysis();
  // C2 has 9000 of 21000 = 42.86%
  assert.ok(Math.abs(c.topCustomers[0].pctOfAR - 42.86) < 0.1);
});

// ─────────────────────────────────────────────────────────────
// 10. trendAnalysis
// ─────────────────────────────────────────────────────────────

test('trendAnalysis classifies improving when old buckets shrink', () => {
  // Start with nasty old debt; pay it off; trend = improving
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'C1', name: 'Acme' });
  // Invoice dated last year, 200 days overdue initially
  a.addARInvoice({ id: 'AR-X', customerId: 'C1', issueDate: '2025-10-01', dueDate: '2025-11-01', amount: 10000 });

  // Snapshot: as of Jan 1, well into the 120+ bucket
  // Snapshot: as of Apr 11 — pay it off between Jan 1 and Apr 11
  // To measure trend we compute old% on Jan 1 (100% in 120+) vs Apr 11 (0%)
  a.recordPayment({ type: 'AR', invoiceId: 'AR-X', amount: 10000, date: '2026-02-01' });
  const trend = a.trendAnalysis([
    { asOfDate: '2026-01-01', label: 'Jan' },
    { asOfDate: '2026-04-11', label: 'Apr' },
  ]);
  assert.equal(trend.snapshots.length, 2);
  assert.equal(trend.trends.length, 1);
  assert.equal(trend.trends[0].arDirection, 'improving');
});

test('trendAnalysis classifies deteriorating when old buckets grow', () => {
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'C1', name: 'Acme' });
  // fresh invoice that ages into 120+
  a.addARInvoice({ id: 'AR-Y', customerId: 'C1', issueDate: '2025-10-01', dueDate: '2025-11-01', amount: 10000 });
  const trend = a.trendAnalysis([
    { asOfDate: '2025-12-01', label: 'Dec' },  // 30 days overdue  -> 0-30
    { asOfDate: '2026-04-11', label: 'Apr' },  // 161 days overdue -> 120+
  ]);
  assert.equal(trend.trends[0].arDirection, 'deteriorating');
});

test('trendAnalysis classifies stable when buckets unchanged', () => {
  const a = mkAging();
  const trend = a.trendAnalysis([
    { asOfDate: '2026-04-11', label: 'A' },
    { asOfDate: '2026-04-11', label: 'B' },
  ]);
  assert.equal(trend.trends[0].arDirection, 'stable');
});

// ─────────────────────────────────────────────────────────────
// 11. bucketMovement
// ─────────────────────────────────────────────────────────────

test('bucketMovement tracks rolls from one bucket to next', () => {
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'C1', name: 'Acme' });
  // an invoice that starts 0-30 and ends 31-60 (due Feb 15, asOf Mar 1 = 14d, asOf Apr 1 = 45d)
  a.addARInvoice({ id: 'AR-A', customerId: 'C1', issueDate: '2026-02-01', dueDate: '2026-02-15', amount: 1000 });
  const move = a.bucketMovement({ period: { from: '2026-03-01', to: '2026-04-01' } });
  assert.equal(move.moved.length, 1);
  assert.equal(move.worsened.length, 1);
  assert.equal(move.moved[0].fromBucket, '0-30');
  assert.equal(move.moved[0].toBucket, '31-60');
});

test('bucketMovement detects cleared items (paid during period)', () => {
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'C1', name: 'Acme' });
  a.addARInvoice({ id: 'AR-B', customerId: 'C1', issueDate: '2026-02-01', dueDate: '2026-02-15', amount: 1000 });
  a.recordPayment({ type: 'AR', invoiceId: 'AR-B', amount: 1000, date: '2026-03-15' });
  const move = a.bucketMovement({ period: { from: '2026-03-01', to: '2026-04-01' } });
  assert.equal(move.cleared.length, 1);
  assert.equal(move.cleared[0].id, 'AR-B');
});

test('bucketMovement detects newcomers (first seen during period)', () => {
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'C1', name: 'Acme' });
  // invoice dated Mar 10, due Mar 15 — not visible on Mar 1 snapshot
  a.addARInvoice({ id: 'AR-C', customerId: 'C1', issueDate: '2026-03-10', dueDate: '2026-03-15', amount: 1000 });
  const move = a.bucketMovement({ period: { from: '2026-03-01', to: '2026-04-01' } });
  assert.equal(move.newcomers.length, 1);
});

// ─────────────────────────────────────────────────────────────
// 12. reminderGeneration
// ─────────────────────────────────────────────────────────────

test('reminderGeneration 0-30 => polite tone', () => {
  const a = mkAging();
  const r = a.reminderGeneration({ customerId: 'C1', bucket: '0-30', language: 'bi' });
  assert.equal(r.tone, REMINDER_TONES.POLITE);
  assert.ok(r.body_he.includes('שלום רב'));
  assert.ok(r.body_en.includes('friendly reminder'));
});

test('reminderGeneration 61-90 => firm tone', () => {
  const a = mkAging();
  const r = a.reminderGeneration({ customerId: 'C2', bucket: '61-90', language: 'bi' });
  assert.equal(r.tone, REMINDER_TONES.FIRM);
  assert.ok(r.body_he.includes('דרישה') || r.body_he.includes('איחור'));
  assert.ok(r.body_en.toLowerCase().includes('past due'));
});

test('reminderGeneration 120+ => legal tone with statute reference', () => {
  const a = mkAging();
  const r = a.reminderGeneration({ customerId: 'C3', bucket: '120+', language: 'bi' });
  assert.equal(r.tone, REMINDER_TONES.LEGAL);
  // Must mention the Israeli Execution Law
  assert.ok(r.body_he.includes('הוצאה לפועל'));
  assert.ok(r.body_en.toLowerCase().includes('legal'));
});

test('reminderGeneration Hebrew-only excludes English body', () => {
  const a = mkAging();
  const r = a.reminderGeneration({ customerId: 'C1', bucket: '0-30', language: 'he' });
  assert.ok(r.body === r.body_he);
  assert.ok(r.subject === r.subject_he);
});

test('reminderGeneration includes per-invoice detail', () => {
  const a = mkAging();
  const r = a.reminderGeneration({ customerId: 'C1', bucket: '0-30', language: 'bi' });
  // Should mention invoice id
  assert.ok(r.body.includes('AR-07') || r.body.includes('AR-00'));
});

// ─────────────────────────────────────────────────────────────
// 13. generateARReport / generateAPReport
// ─────────────────────────────────────────────────────────────

test('generateARReport returns bilingual text and SVG chart', () => {
  const a = mkAging();
  const rep = a.generateARReport({ asOf: AS_OF });
  assert.ok(rep.svg.startsWith('<svg'));
  assert.ok(rep.svg.includes('AR Aging'));
  assert.ok(rep.text_he.includes('דו"ח יישון חייבים'));
  assert.ok(rep.text_en.includes('Accounts Receivable Aging Report'));
  assert.ok(rep.text.includes('────'));
});

test('generateAPReport returns bilingual text and SVG chart', () => {
  const a = mkAging();
  const rep = a.generateAPReport({ asOf: AS_OF });
  assert.ok(rep.svg.startsWith('<svg'));
  assert.ok(rep.text_he.includes('דו"ח יישון זכאים'));
  assert.ok(rep.text_en.includes('Accounts Payable Aging Report'));
});

test('generateARReport embeds all five bucket labels', () => {
  const a = mkAging();
  const rep = a.generateARReport({ asOf: AS_OF });
  for (const b of DEFAULT_BUCKETS) {
    assert.ok(rep.text.includes(b.label), `bucket ${b.label} not in text`);
  }
});

// ─────────────────────────────────────────────────────────────
// 14. customerStatement — opening / closing / running
// ─────────────────────────────────────────────────────────────

test('customerStatement produces a Hebrew statement with opening/closing', () => {
  const a = mkAging();
  a.recordPayment({ type: 'AR', invoiceId: 'AR-07', amount: 2000, date: '2026-04-04' });
  const st = a.customerStatement('C1', { from: '2026-01-01', to: '2026-04-30' });
  assert.ok(st.text.includes('דו"ח חשבון לקוח'));
  assert.ok(st.text.includes('Acme Ltd'));
  assert.ok(st.text.includes('יתרת פתיחה'));
  assert.ok(st.text.includes('יתרת סגירה'));
  // Closing = sum of (invoices in period) - (payments in period) + opening
  // opening = 0 (no invoices before 2026-01-01 for C1)
  // invoices in period: AR-00 (1000), AR-07 (2000), AR-40 (3000) = 6000
  // payments in period: AR-07 (2000)
  // closing = 0 + 6000 - 2000 = 4000
  assert.equal(st.closing, 4000);
});

test('customerStatement opening balance reflects prior activity', () => {
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'CX', name: 'X' });
  a.addARInvoice({ id: 'OLD', customerId: 'CX', issueDate: '2025-11-01', dueDate: '2025-11-15', amount: 5000 });
  a.addARInvoice({ id: 'NEW', customerId: 'CX', issueDate: '2026-02-05', dueDate: '2026-02-20', amount: 3000 });
  const st = a.customerStatement('CX', { from: '2026-01-01', to: '2026-04-30' });
  assert.equal(st.opening, 5000);
  assert.equal(st.closing, 5000 + 3000);
});

test('customerStatement shows rows in chronological order', () => {
  const a = new Aging({ asOfDefault: AS_OF });
  a.addCustomer({ id: 'CY', name: 'Y' });
  a.addARInvoice({ id: 'I2', customerId: 'CY', issueDate: '2026-03-01', dueDate: '2026-03-15', amount: 1000 });
  a.addARInvoice({ id: 'I1', customerId: 'CY', issueDate: '2026-02-01', dueDate: '2026-02-15', amount: 2000 });
  const st = a.customerStatement('CY', { from: '2026-01-01', to: '2026-04-30' });
  assert.equal(st.rows[0].ref, 'I1'); // earlier date first
  assert.equal(st.rows[1].ref, 'I2');
});

// ─────────────────────────────────────────────────────────────
// 15. Formatting helper
// ─────────────────────────────────────────────────────────────

test('fmtILS formats with ₪ and thousand separators', () => {
  assert.equal(fmtILS(1234567.89), '₪1,234,567.89');
  assert.equal(fmtILS(0), '₪0.00');
  assert.equal(fmtILS(-99), '-₪99.00');
});

// ─────────────────────────────────────────────────────────────
// 16. Hebrew glossary presence
// ─────────────────────────────────────────────────────────────

test('HEBREW_GLOSSARY covers essential terms', () => {
  for (const key of ['ar', 'ap', 'customer', 'supplier', 'invoice', 'dueDate', 'aging', 'bucket', 'writeOff']) {
    assert.ok(HEBREW_GLOSSARY[key], `missing glossary key: ${key}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 17. Append-only invariants — we never delete
// ─────────────────────────────────────────────────────────────

test('write-off followed by dispute-resolve keeps both records', () => {
  const a = mkAging();
  a.flagDispute({ type: 'AR', invoiceId: 'AR-75', reason: 'wrong qty', flaggedAt: '2026-04-01' });
  a.writeOff({ type: 'AR', invoiceId: 'AR-75', amount: 4000, reason: 'uncollectable', date: '2026-04-10' });
  a.resolveDispute('AR-75', { at: '2026-04-11', note: 'closed' });
  // Dispute record still exists
  const d = a.disputedItems();
  assert.equal(d.ar.length, 1);
  // Write-off record still exists
  const w = a.writeOffs();
  assert.equal(w.count, 1);
  // Invoice still present in memory
  const inv = a.arInvoices.get('AR-75');
  assert.ok(inv);
});
