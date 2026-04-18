/**
 * Unit tests — expense-manager.js
 * Agent X-26 (Swarm 3B) — 2026-04-11
 *
 * Run with:
 *   node --test test/payroll/expense-manager.test.js
 *
 * 30+ assertions across 28 test cases exercising the full public API
 * of onyx-procurement/src/expenses/expense-manager.js.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const expenseMgrPath = path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'expenses',
  'expense-manager.js'
);

const EM = require(expenseMgrPath);

const {
  createExpenseManager,
  createStore,
  createReport,
  addLine,
  submitReport,
  approveReport,
  rejectReport,
  markReimbursed,
  computeReimbursement,
  validatePolicy,
  exportPdf,
  attachReceipt,
  runOcr,
  autoCategorize,
  computeMileage,
  computePerDiem,
  convertToIls,
  findDuplicates,
  splitVat,
  CATEGORIES,
  STATUS,
  DEFAULT_POLICY,
  VAT_STANDARD,
  ExpenseError,
} = EM;

/* ─────────────────────────────────────────────────────────────
 *  Helpers
 * ──────────────────────────────────────────────────────────── */

function freshMgr() {
  return createExpenseManager();
}

function seedReport(mgr, employeeId) {
  return mgr.createReport(
    employeeId || 'emp_001',
    'Q2 נסיעות',
    { from: '2026-04-01', to: '2026-04-30' }
  );
}

const TODAY = new Date().toISOString().slice(0, 10);

/* ─────────────────────────────────────────────────────────────
 *  1. Constants sanity
 * ──────────────────────────────────────────────────────────── */

test('01 categories contain all 8 Israeli expense types', () => {
  const wanted = [
    'meals','fuel','travel','lodging',
    'equipment','hospitality','donation','other',
  ];
  for (const k of wanted) {
    assert.ok(CATEGORIES[k], `missing ${k}`);
    assert.ok(CATEGORIES[k].he, `missing he label for ${k}`);
    assert.ok(CATEGORIES[k].en, `missing en label for ${k}`);
  }
});

test('02 VAT standard rate is 17%', () => {
  assert.equal(VAT_STANDARD, 0.17);
});

test('03 status enum exposes full lifecycle', () => {
  assert.equal(STATUS.DRAFT, 'draft');
  assert.equal(STATUS.SUBMITTED, 'submitted');
  assert.equal(STATUS.APPROVED, 'approved');
  assert.equal(STATUS.REJECTED, 'rejected');
  assert.equal(STATUS.REIMBURSED, 'reimbursed');
});

test('04 DEFAULT_POLICY matches Israeli defaults', () => {
  assert.equal(DEFAULT_POLICY.meals.dailyCapIls, 150);
  assert.equal(DEFAULT_POLICY.lodging.localNightCapIls, 600);
  assert.equal(DEFAULT_POLICY.lodging.abroadNightCapIls, 1200);
  assert.equal(DEFAULT_POLICY.mileage.smallEngineRate, 2.50);
  assert.equal(DEFAULT_POLICY.mileage.largeEngineRate, 3.00);
  assert.equal(DEFAULT_POLICY.perDiem.localDailyIls, 200);
});

/* ─────────────────────────────────────────────────────────────
 *  2. VAT split
 * ──────────────────────────────────────────────────────────── */

test('05 splitVat — 117 ILS gross = 100 net + 17 VAT', () => {
  const { net, vat } = splitVat(117, 0.17);
  assert.equal(net, 100);
  assert.equal(vat, 17);
});

test('06 splitVat — 0% rate returns all net', () => {
  const { net, vat } = splitVat(500, 0);
  assert.equal(net, 500);
  assert.equal(vat, 0);
});

test('07 splitVat — default rate = 17% when omitted', () => {
  const { net } = splitVat(234);
  assert.ok(Math.abs(net - 200) < 0.01);
});

/* ─────────────────────────────────────────────────────────────
 *  3. FX conversion
 * ──────────────────────────────────────────────────────────── */

test('08 convertToIls — ILS is identity', () => {
  assert.equal(convertToIls(100, 'ILS', '2026-04-11'), 100);
});

test('09 convertToIls — USD 100 → ~365 ILS (2026 rate)', () => {
  const ils = convertToIls(100, 'USD', '2026-04-11');
  assert.ok(ils >= 350 && ils <= 380, `got ${ils}`);
});

test('10 convertToIls — unknown currency throws', () => {
  assert.throws(
    () => convertToIls(100, 'JPY', '2026-04-11'),
    (err) => err instanceof ExpenseError && err.code === 'FX_UNKNOWN_CURRENCY'
  );
});

/* ─────────────────────────────────────────────────────────────
 *  4. Mileage & per-diem
 * ──────────────────────────────────────────────────────────── */

test('11 computeMileage — small engine 100km = 250 ILS', () => {
  assert.equal(computeMileage(100, 1400), 250);
});

test('12 computeMileage — large engine 100km = 300 ILS', () => {
  assert.equal(computeMileage(100, 2000), 300);
});

test('13 computeMileage — negative km throws', () => {
  assert.throws(
    () => computeMileage(-5, 1400),
    (err) => err instanceof ExpenseError && err.code === 'BAD_KM'
  );
});

test('14 computePerDiem — 3 local days = 600 ILS', () => {
  assert.equal(computePerDiem(3), 600);
});

test('15 computePerDiem — abroad 2 days = 900 ILS', () => {
  assert.equal(computePerDiem(2, { abroad: true }), 900);
});

/* ─────────────────────────────────────────────────────────────
 *  5. Auto-categorization
 * ──────────────────────────────────────────────────────────── */

test('16 autoCategorize — Hebrew "מסעדה אבו חסן" → meals', () => {
  assert.equal(autoCategorize('ארוחה במסעדה אבו חסן'), 'meals');
});

test('17 autoCategorize — "דלק בפז" → fuel', () => {
  assert.equal(autoCategorize('דלק בתחנת פז'), 'fuel');
});

test('18 autoCategorize — "taxi to client" → travel', () => {
  assert.equal(autoCategorize('taxi to client office'), 'travel');
});

test('19 autoCategorize — empty / unknown → other', () => {
  assert.equal(autoCategorize(''), 'other');
  assert.equal(autoCategorize('xyzzy random blob'), 'other');
});

/* ─────────────────────────────────────────────────────────────
 *  6. Report lifecycle
 * ──────────────────────────────────────────────────────────── */

test('20 createReport validates employeeId / title / period', () => {
  const mgr = freshMgr();
  assert.throws(
    () => mgr.createReport(null, 't', { from: 'a', to: 'b' }),
    (e) => e.code === 'NO_EMPLOYEE'
  );
  assert.throws(
    () => mgr.createReport('e', null, { from: 'a', to: 'b' }),
    (e) => e.code === 'NO_TITLE'
  );
  assert.throws(
    () => mgr.createReport('e', 't', null),
    (e) => e.code === 'NO_PERIOD'
  );
});

test('21 addLine creates line with FX + VAT split + audit entry', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  const line = mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'מלון ירושלים',
    amount: 500,
    currency: 'ILS',
    vendor: 'מלון המלך דוד',
    has_tax_invoice: true,
  });
  assert.ok(line.id);
  assert.equal(line.category, 'lodging'); // auto-classified
  assert.equal(line.currency, 'ILS');
  assert.equal(line.amount_ils, 500);
  assert.ok(line.vat > 0);
  const reloaded = mgr.getReport(rep.id);
  assert.equal(reloaded.lines.length, 1);
  assert.ok(reloaded.audit.length >= 2); // create + addLine
});

test('22 addLine refuses negative amount and unknown category', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  assert.throws(
    () => mgr.addLine(rep.id, { amount: -1, description: 'x' }),
    (e) => e.code === 'BAD_AMOUNT'
  );
  assert.throws(
    () => mgr.addLine(rep.id, { amount: 10, description: 'x', category: 'xyz' }),
    (e) => e.code === 'BAD_CATEGORY'
  );
});

test('23 submit → approve lifecycle + illegal transitions blocked', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'דלק בתחנת פז',
    amount: 200,
    currency: 'ILS',
    vendor: 'פז',
    has_tax_invoice: true,
  });
  assert.equal(rep.status, STATUS.DRAFT);
  mgr.submitReport(rep.id);
  assert.equal(mgr.getReport(rep.id).status, STATUS.SUBMITTED);
  mgr.approveReport(rep.id, 'mgr_99', 'OK');
  assert.equal(mgr.getReport(rep.id).status, STATUS.APPROVED);
  // illegal: cannot re-approve / go back
  assert.throws(
    () => mgr.approveReport(rep.id, 'mgr_99', 'OK2'),
    (e) => e.code === 'BAD_STATUS'
  );
  mgr.markReimbursed(rep.id, 'bank_txn_123');
  assert.equal(mgr.getReport(rep.id).status, STATUS.REIMBURSED);
  assert.throws(
    () => mgr.markReimbursed(rep.id),
    (e) => e.code === 'BAD_TRANSITION'
  );
});

test('24 reject requires reason and sets status to rejected', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    amount: 100, description: 'test', date: '2026-04-05',
  });
  mgr.submitReport(rep.id);
  assert.throws(
    () => mgr.rejectReport(rep.id, 'mgr', ''),
    (e) => e.code === 'NO_REASON'
  );
  mgr.rejectReport(rep.id, 'mgr', 'חסרה קבלה');
  const r = mgr.getReport(rep.id);
  assert.equal(r.status, STATUS.REJECTED);
  assert.ok(r.approvals.length === 1);
  assert.equal(r.approvals[0].decision, 'reject');
});

test('25 cannot submit empty report', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  assert.throws(
    () => mgr.submitReport(rep.id),
    (e) => e.code === 'EMPTY_REPORT'
  );
});

/* ─────────────────────────────────────────────────────────────
 *  7. Reimbursement math
 * ──────────────────────────────────────────────────────────── */

test('26 computeReimbursement with VAT-invoice claims VAT back', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'ציוד מחשב',
    amount: 1170,          // 1000 net + 170 VAT
    currency: 'ILS',
    has_tax_invoice: true,
    category: 'equipment',
  });
  const r = mgr.computeReimbursement(rep.id);
  assert.equal(r.grossIls, 1170);
  assert.ok(Math.abs(r.deductibleVat - 170) < 0.5);
  assert.ok(Math.abs(r.netIls - 1000) < 0.5);
});

test('27 computeReimbursement without tax invoice does NOT deduct VAT', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'קבלה רגילה',
    amount: 117,
    currency: 'ILS',
    has_tax_invoice: false,
    category: 'equipment',
  });
  const r = mgr.computeReimbursement(rep.id);
  assert.equal(r.deductibleVat, 0);
  assert.equal(r.netIls, 117);
});

/* ─────────────────────────────────────────────────────────────
 *  8. Policy violations
 * ──────────────────────────────────────────────────────────── */

test('28 validatePolicy flags lodging over cap', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'מלון יקר',
    amount: 900, // > 600 local
    currency: 'ILS',
    has_tax_invoice: true,
    category: 'lodging',
  });
  const v = mgr.validatePolicy(rep.id);
  assert.ok(v.some((x) => x.code === 'LODGING_OVER_CAP'));
});

test('29 validatePolicy flags meals over daily cap (aggregated)', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05', description: 'lunch',
    amount: 90, currency: 'ILS', category: 'meals',
  });
  mgr.addLine(rep.id, {
    date: '2026-04-05', description: 'dinner',
    amount: 120, currency: 'ILS', category: 'meals',
  });
  const v = mgr.validatePolicy(rep.id);
  assert.ok(v.some((x) => x.code === 'MEALS_OVER_DAILY_CAP'));
});

test('30 validatePolicy blocks donation without 46A', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'תרומה לעמותה',
    amount: 500,
    currency: 'ILS',
    category: 'donation',
  });
  const v = mgr.validatePolicy(rep.id);
  assert.ok(v.some((x) => x.code === 'DONATION_NO_46A' && x.severity === 'error'));
  // Submit is blocked
  assert.throws(
    () => mgr.submitReport(rep.id),
    (e) => e.code === 'POLICY_VIOLATION'
  );
});

test('31 validatePolicy clean donation with 46A certificate passes', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'תרומה לעמותה',
    amount: 500,
    currency: 'ILS',
    category: 'donation',
    meta: { receipt46a: 'CERT-2026-001' },
  });
  const v = mgr.validatePolicy(rep.id);
  assert.ok(!v.some((x) => x.code === 'DONATION_NO_46A'));
});

test('32 validatePolicy flags NO_RECEIPT over threshold', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'meal',
    amount: 500, // > 325
    currency: 'ILS',
    category: 'meals',
  });
  const v = mgr.validatePolicy(rep.id);
  assert.ok(v.some((x) => x.code === 'NO_RECEIPT'));
});

/* ─────────────────────────────────────────────────────────────
 *  9. Duplicates
 * ──────────────────────────────────────────────────────────── */

test('33 findDuplicates catches same-day same-vendor near-amount', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  const l1 = mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'דלק',
    amount: 250,
    currency: 'ILS',
    vendor: 'פז',
    category: 'fuel',
  });
  const dups = mgr.findDuplicates('emp_001', {
    id: 'fake_new',
    report_id: rep.id,
    date: '2026-04-05',
    category: 'fuel',
    vendor: 'פז',
    amount: 251,
  });
  assert.equal(dups.length, 1);
  assert.equal(dups[0].line_id, l1.id);
});

test('34 findDuplicates ignores different vendor / category', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05', description: 'a', amount: 100,
    currency: 'ILS', vendor: 'פז', category: 'fuel',
  });
  const dups = mgr.findDuplicates('emp_001', {
    date: '2026-04-05', category: 'fuel',
    vendor: 'סונול', amount: 100,
  });
  assert.equal(dups.length, 0);
});

/* ─────────────────────────────────────────────────────────────
 *  10. Multi-currency end-to-end
 * ──────────────────────────────────────────────────────────── */

test('35 addLine in USD stores historic ILS conversion', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  const line = mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'SaaS subscription',
    amount: 100,
    currency: 'USD',
    category: 'equipment',
    has_tax_invoice: false,
  });
  assert.equal(line.currency, 'USD');
  assert.ok(line.amount_ils > 300);
  assert.ok(line.amount_ils < 400);
});

/* ─────────────────────────────────────────────────────────────
 *  11. Receipt attach + OCR stub
 * ──────────────────────────────────────────────────────────── */

test('36 attachReceipt + runOcr with stub bridge fills extracted fields', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  const line = mgr.addLine(rep.id, {
    date: '2026-04-05', description: 'לינה', amount: 400,
    currency: 'ILS', category: 'lodging', vendor: 'Hotel A',
  });
  mgr.attachReceipt(rep.id, line.id, '/tmp/receipt-a.jpg');
  assert.equal(mgr.getReport(rep.id).lines[0].receipt_ref, '/tmp/receipt-a.jpg');
  const stub = () => ({
    extracted: { vendor: 'Hotel A', total: 400, currency: 'ILS', vat_rate: 0.17 },
    confidence: 0.88,
    engine: 'test-stub',
  });
  const res = mgr.runOcr(rep.id, line.id, stub);
  assert.equal(res.confidence, 0.88);
  assert.equal(res.engine, 'test-stub');
  assert.equal(res.extracted.total, 400);
});

test('37 runOcr without receipt throws', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  const line = mgr.addLine(rep.id, {
    date: '2026-04-05', description: 't', amount: 1, category: 'other',
  });
  assert.throws(
    () => mgr.runOcr(rep.id, line.id, () => null),
    (e) => e.code === 'NO_RECEIPT'
  );
});

/* ─────────────────────────────────────────────────────────────
 *  12. PDF export (fallback path)
 * ──────────────────────────────────────────────────────────── */

test('38 exportPdf writes an archive file (pdfkit or text fallback)', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  mgr.addLine(rep.id, {
    date: '2026-04-05',
    description: 'ציוד מחשב',
    amount: 1170,
    currency: 'ILS',
    has_tax_invoice: true,
    category: 'equipment',
  });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-pdf-'));
  const res = mgr.exportPdf(rep.id, outDir);
  assert.ok(res.path);
  assert.ok(['pdfkit', 'text-fallback'].indexOf(res.engine) !== -1);
  assert.ok(fs.existsSync(res.path));
  assert.ok(res.size > 0);
});

/* ─────────────────────────────────────────────────────────────
 *  13. Store append-only behaviour
 * ──────────────────────────────────────────────────────────── */

test('39 updateLine appends revision, never deletes history', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  const line = mgr.addLine(rep.id, {
    date: '2026-04-05', description: 'x', amount: 100,
    currency: 'ILS', category: 'other',
  });
  const originalAmount = line.amount;
  mgr.updateLine(rep.id, line.id, { amount: 250, description: 'x v2' });
  const reloaded = mgr.getReport(rep.id);
  const updated = reloaded.lines.find((l) => l.id === line.id);
  assert.equal(updated.amount, 250);
  assert.ok(updated.revisions.length >= 1);
  assert.equal(updated.revisions[0].before.amount, originalAmount);
});

test('40 updateLine refused after submission', () => {
  const mgr = freshMgr();
  const rep = seedReport(mgr);
  const line = mgr.addLine(rep.id, {
    date: '2026-04-05', description: 'x', amount: 100,
    currency: 'ILS', category: 'other',
  });
  mgr.submitReport(rep.id);
  assert.throws(
    () => mgr.updateLine(rep.id, line.id, { amount: 200 }),
    (e) => e.code === 'BAD_STATUS'
  );
});

test('41 listReports filters by employee and status', () => {
  const mgr = freshMgr();
  const r1 = mgr.createReport('emp_A', 'A1', { from: '2026-04-01', to: '2026-04-30' });
  mgr.createReport('emp_B', 'B1', { from: '2026-04-01', to: '2026-04-30' });
  mgr.addLine(r1.id, {
    date: '2026-04-05', description: 'x', amount: 100,
    currency: 'ILS', category: 'other',
  });
  mgr.submitReport(r1.id);
  const submitted = mgr.listReports({ status: STATUS.SUBMITTED });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].employee_id, 'emp_A');
  const all = mgr.listReports();
  assert.equal(all.length, 2);
});
