/* ============================================================================
 * Techno-Kol ERP — deposit-slip test suite
 * Agent X-46 / Swarm 3C / Cash-desk bank deposit flow
 * ----------------------------------------------------------------------------
 * Target module:
 *   onyx-procurement/src/payments/deposit-slip.js
 *
 * Run with:
 *   node --test test/payroll/deposit-slip.test.js
 *
 * Coverage (20 cases — exceeds the 15-case minimum):
 *   1.  createDepositSlipEngine returns an engine with all public methods
 *   2.  createDeposit returns a slipId and persists a draft row
 *   3.  addCash rejects invalid denominations, accepts canonical ones
 *   4.  addCash accumulates cash_total + grand_total correctly
 *   5.  addCheck rejects missing check_no and non-positive amounts
 *   6.  addCheck rolls into check_total and grand_total
 *   7.  addCash / addCheck on a non-draft slip throws
 *   8.  finalize writes PDF to outDir and returns path + total + referenceNo
 *   9.  finalize is idempotent — second call returns the same referenceNo
 *  10.  reconcile returns matched=true when bank amount equals expected
 *  11.  reconcile returns matched=false and variance when amounts differ
 *  12.  reconcile rejects draft slips
 *  13.  listSlips filters by date range and bankAccountId
 *  14.  pendingDeposits returns only drafts that have money on them
 *  15.  denominationBreakdown produces rows in canonical order
 *  16.  cash-limit-law warning triggers when single cash > 6000
 *  17.  hebrewWords converts small + thousand-scale integers
 *  18.  encodeCode39 wraps text with start/stop * sentinels
 *  19.  formatShekel formats with thousands separators and shekel sign
 *  20.  PDF bytes start with %PDF-1.4 and end with %%EOF
 *  21.  renderHtml embeds the reference number and totals
 *  22.  bank format resolves to mizrahi / leumi / hapoalim / discount
 * ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const mod = require('../../onyx-procurement/src/payments/deposit-slip.js');

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'deposit-slip-test-'));
  return d;
}

function makeEngine(overrides = {}) {
  return mod.createDepositSlipEngine({
    outDir: tmpDir(),
    business: {
      name: 'Techno-Kol Uzi Ltd',
      nameHe: 'טכנו-קול עוזי בע"מ',
      vatId: '516789123',
      address: 'רח\' הרצל 1, תל אביב',
      phone: '03-1234567',
    },
    banks: {
      'BA-HAPOALIM-001': { bankCode: 12, branchCode: 688, accountNo: '123456', format: 'hapoalim' },
      'BA-LEUMI-001':    { bankCode: 10, branchCode: 800, accountNo: '654321', format: 'leumi' },
      'BA-DISCOUNT-001': { bankCode: 11, branchCode: 77,  accountNo: '999777', format: 'discount' },
      'BA-MIZRAHI-001':  { bankCode: 20, branchCode: 456, accountNo: '333222', format: 'mizrahi' },
    },
    ...overrides,
  });
}

// --------------------------------------------------------------------------
// 1. API surface
// --------------------------------------------------------------------------

test('[01] createDepositSlipEngine exposes the required public methods', () => {
  const e = makeEngine();
  for (const k of [
    'createDeposit', 'addCash', 'addCheck', 'finalize', 'reconcile',
    'listSlips', 'pendingDeposits', 'getSlip', 'renderPdf', 'renderHtml',
    'denominationBreakdown', 'detectWarnings', 'buildReferenceNumber',
  ]) {
    assert.equal(typeof e[k], 'function', `missing method ${k}`);
  }
  assert.ok(mod.DENOMINATIONS.includes(200));
  assert.ok(mod.DENOMINATIONS.includes(1));
  assert.equal(mod.CASH_LIMIT_LAW_THRESHOLD, 6000);
});

// --------------------------------------------------------------------------
// 2. createDeposit
// --------------------------------------------------------------------------

test('[02] createDeposit persists a draft slip with the given date + bank', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  assert.match(id, /^DS-/);
  const slip = e.getSlip(id);
  assert.equal(slip.status, 'draft');
  assert.equal(slip.date, '2026-04-10');
  assert.equal(slip.bank_code, 12);
  assert.equal(slip.branch_code, 688);
  assert.equal(slip.bank_format, 'hapoalim');
  assert.equal(slip.cash_total, 0);
  assert.equal(slip.check_total, 0);
});

test('[02b] createDeposit throws when bankAccountId missing', () => {
  const e = makeEngine();
  assert.throws(() => e.createDeposit({ date: '2026-04-10' }), /bankAccountId/);
});

// --------------------------------------------------------------------------
// 3. addCash — denomination validation
// --------------------------------------------------------------------------

test('[03] addCash rejects zero-or-negative denominations', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  assert.throws(() => e.addCash(id, 0, 5), /denomination/);
  assert.throws(() => e.addCash(id, -10, 5), /denomination/);
});

test('[03b] addCash accepts all canonical denominations', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  for (const d of mod.DENOMINATIONS) e.addCash(id, d, 1);
  const slip = e.getSlip(id);
  const expected = mod.DENOMINATIONS.reduce((n, d) => n + d, 0);
  assert.equal(slip.cash_total, expected);
});

// --------------------------------------------------------------------------
// 4. addCash — accumulation
// --------------------------------------------------------------------------

test('[04] addCash accumulates cash_total + grand_total', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(id, 200, 3); // 600
  e.addCash(id, 100, 5); // 500
  e.addCash(id, 20, 2);  // 40
  const slip = e.getSlip(id);
  assert.equal(slip.cash_total, 1140);
  assert.equal(slip.grand_total, 1140);
});

// --------------------------------------------------------------------------
// 5. addCheck — validation
// --------------------------------------------------------------------------

test('[05] addCheck rejects missing check_no and non-positive amounts', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  assert.throws(() => e.addCheck(id, { drawer_name: 'Foo', amount: 100 }), /check_no/);
  assert.throws(() => e.addCheck(id, { check_no: '0001', amount: 0 }), /positive/);
  assert.throws(() => e.addCheck(id, { check_no: '0001', amount: -5 }), /positive/);
});

// --------------------------------------------------------------------------
// 6. addCheck — accumulation
// --------------------------------------------------------------------------

test('[06] addCheck rolls into check_total and grand_total', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(id, 100, 1); // 100 cash
  e.addCheck(id, { drawer_name: 'Customer A', drawer_bank: 12, drawer_branch: 688, check_no: '0001', amount: 250.5 });
  e.addCheck(id, { drawer_name: 'Customer B', drawer_bank: 10, drawer_branch: 800, check_no: '0002', amount: 749.5 });
  const slip = e.getSlip(id);
  assert.equal(slip.check_total, 1000);
  assert.equal(slip.cash_total, 100);
  assert.equal(slip.grand_total, 1100);
  assert.equal(slip.checks.length, 2);
});

// --------------------------------------------------------------------------
// 7. guard against mutating non-draft slips
// --------------------------------------------------------------------------

test('[07] addCash / addCheck on a finalized slip throws', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  e.addCash(id, 200, 1);
  e.finalize(id);
  assert.throws(() => e.addCash(id, 100, 1), /status/);
  assert.throws(() => e.addCheck(id, { check_no: '1', amount: 100 }), /status/);
});

// --------------------------------------------------------------------------
// 8. finalize — PDF lifecycle
// --------------------------------------------------------------------------

test('[08] finalize writes a real PDF file to outDir', () => {
  const outDir = tmpDir();
  const e = makeEngine({ outDir });
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  e.addCash(id, 200, 2);
  e.addCash(id, 100, 3);
  e.addCheck(id, { drawer_name: 'Acme Corp', drawer_bank: 12, drawer_branch: 688, check_no: '7788', amount: 1500 });
  const res = e.finalize(id);
  assert.ok(res.pdfPath.endsWith('.pdf'));
  assert.ok(fs.existsSync(res.pdfPath));
  assert.equal(res.total, 2200);
  assert.ok(res.referenceNo);
});

// --------------------------------------------------------------------------
// 9. finalize is idempotent
// --------------------------------------------------------------------------

test('[09] finalize is idempotent — second call returns same referenceNo', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  e.addCash(id, 50, 2);
  const a = e.finalize(id);
  const b = e.finalize(id);
  assert.equal(a.referenceNo, b.referenceNo);
  assert.equal(a.total, b.total);
});

// --------------------------------------------------------------------------
// 10. reconcile — matched
// --------------------------------------------------------------------------

test('[10] reconcile returns matched=true when bank amount equals expected', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(id, 100, 10); // 1000
  e.finalize(id);
  const rec = e.reconcile(id, { amount: 1000 });
  assert.equal(rec.matched, true);
  assert.equal(rec.variance, 0);
  assert.equal(rec.status, 'confirmed');
});

// --------------------------------------------------------------------------
// 11. reconcile — variance
// --------------------------------------------------------------------------

test('[11] reconcile returns matched=false and variance when amounts differ', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(id, 100, 10); // 1000
  e.finalize(id);
  const rec = e.reconcile(id, { amount: 995.5 });
  assert.equal(rec.matched, false);
  assert.equal(rec.variance, -4.5);
  assert.equal(rec.status, 'variance');
  assert.equal(rec.expected, 1000);
  assert.equal(rec.actual, 995.5);
});

// --------------------------------------------------------------------------
// 12. reconcile guards against draft slips
// --------------------------------------------------------------------------

test('[12] reconcile rejects draft slips', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(id, 100, 1);
  assert.throws(() => e.reconcile(id, { amount: 100 }), /draft/);
});

// --------------------------------------------------------------------------
// 13. listSlips — filtering
// --------------------------------------------------------------------------

test('[13] listSlips filters by date range and bankAccountId', () => {
  const e = makeEngine();
  const a = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-01' });
  const b = e.createDeposit({ bankAccountId: 'BA-LEUMI-001',    date: '2026-04-05' });
  const c = e.createDeposit({ bankAccountId: 'BA-LEUMI-001',    date: '2026-04-10' });
  e.addCash(a, 100, 1);
  e.addCash(b, 100, 1);
  e.addCash(c, 100, 1);
  const range = e.listSlips({ from: '2026-04-03', to: '2026-04-09' });
  assert.ok(range.some((s) => s.id === b));
  assert.ok(!range.some((s) => s.id === a));
  assert.ok(!range.some((s) => s.id === c));
  const onlyLeumi = e.listSlips({ bankAccountId: 'BA-LEUMI-001' });
  assert.equal(onlyLeumi.length, 2);
});

// --------------------------------------------------------------------------
// 14. pendingDeposits
// --------------------------------------------------------------------------

test('[14] pendingDeposits returns only drafts that have money on them', () => {
  const e = makeEngine();
  const empty = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  const withCash = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(withCash, 100, 3);
  const done = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(done, 200, 1);
  e.finalize(done);
  const pending = e.pendingDeposits();
  const ids = pending.map((p) => p.id);
  assert.ok(ids.includes(withCash));
  assert.ok(!ids.includes(empty));
  assert.ok(!ids.includes(done));
});

// --------------------------------------------------------------------------
// 15. denominationBreakdown
// --------------------------------------------------------------------------

test('[15] denominationBreakdown returns rows in canonical order', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  e.addCash(id, 20, 5);
  e.addCash(id, 200, 2);
  e.addCash(id, 1, 10);
  const slip = e.getSlip(id);
  const rows = e.denominationBreakdown(slip);
  // canonical order: 200,100,50,20,10,5,2,1 then agorot bucket
  const order = rows.map((r) => r.denomination);
  assert.deepEqual(order.slice(0, 8), [200, 100, 50, 20, 10, 5, 2, 1]);
  const r200 = rows.find((r) => r.denomination === 200);
  const r20 = rows.find((r) => r.denomination === 20);
  assert.equal(r200.count, 2);
  assert.equal(r200.amount, 400);
  assert.equal(r20.count, 5);
  assert.equal(r20.amount, 100);
});

// --------------------------------------------------------------------------
// 16. cash-limit law warning
// --------------------------------------------------------------------------

test('[16] cash-limit-law warning triggers when single cash > 6000', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  e.addCash(id, 200, 40); // 8000 — exceeds 6000 ceiling
  const slip = e.getSlip(id);
  const warns = e.detectWarnings(slip);
  assert.ok(warns.some((w) => w.code === 'CASH_LAW_6000'));
});

test('[16b] cash below threshold does not trigger warning', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  e.addCash(id, 200, 10); // 2000
  const slip = e.getSlip(id);
  const warns = e.detectWarnings(slip);
  assert.ok(!warns.some((w) => w.code === 'CASH_LAW_6000'));
});

// --------------------------------------------------------------------------
// 17. hebrewWords
// --------------------------------------------------------------------------

test('[17] hebrewWords converts small + thousand-scale integers', () => {
  assert.equal(mod.hebrewWords(0), 'אפס שקלים');
  assert.ok(mod.hebrewWords(1).includes('שקלים'));
  assert.ok(mod.hebrewWords(1000).includes('אלף'));
  assert.ok(mod.hebrewWords(2000).includes('אלפיים'));
});

// --------------------------------------------------------------------------
// 18. Code-39 barcode
// --------------------------------------------------------------------------

test('[18] encodeCode39 frames the value with start/stop sentinels', () => {
  const enc = mod.encodeCode39('ABC123');
  assert.ok(enc.framed.startsWith('*'));
  assert.ok(enc.framed.endsWith('*'));
  assert.equal(enc.text, 'ABC123');
  assert.ok(enc.bars.length > 0);
});

test('[18b] encodeCode39 sanitises unsupported characters', () => {
  const enc = mod.encodeCode39('a@b');
  // lowercase 'a' uppercased, '@' unsupported → replaced with '-'
  assert.equal(enc.text, 'A-B');
});

// --------------------------------------------------------------------------
// 19. formatShekel
// --------------------------------------------------------------------------

test('[19] formatShekel formats with thousands separators and shekel sign', () => {
  assert.equal(mod.formatShekel(0), '₪0.00');
  assert.equal(mod.formatShekel(1234.5), '₪1,234.50');
  assert.equal(mod.formatShekel(1000000), '₪1,000,000.00');
  assert.equal(mod.formatShekel(-15.2), '-₪15.20');
});

// --------------------------------------------------------------------------
// 20. PDF structural check
// --------------------------------------------------------------------------

test('[20] PDF bytes start with %PDF-1.4 and end with %%EOF', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  e.addCash(id, 200, 2);
  e.addCheck(id, { drawer_name: 'Foo', drawer_bank: 12, drawer_branch: 1, check_no: '42', amount: 50 });
  const res = e.finalize(id);
  const buf = fs.readFileSync(res.pdfPath);
  const head = buf.slice(0, 8).toString('latin1');
  const tail = buf.slice(-6).toString('latin1');
  assert.ok(head.startsWith('%PDF-1.4'));
  assert.ok(tail.includes('%%EOF'));
  assert.ok(buf.length > 400, 'PDF should be non-trivial in size');
});

// --------------------------------------------------------------------------
// 21. HTML render mirrors the slip totals
// --------------------------------------------------------------------------

test('[21] renderHtml embeds the reference number and totals', () => {
  const e = makeEngine();
  const id = e.createDeposit({ bankAccountId: 'BA-LEUMI-001', date: '2026-04-10' });
  e.addCash(id, 100, 5);
  const res = e.finalize(id);
  const slip = e.getSlip(id);
  const html = e.renderHtml(slip);
  assert.ok(html.includes(res.referenceNo), 'reference number should appear in html');
  assert.ok(html.includes('₪500.00'), 'total should appear in html');
  assert.ok(html.includes('לאומי'), 'Hebrew bank name should appear');
  assert.ok(html.includes('dir="rtl"'));
});

// --------------------------------------------------------------------------
// 22. Bank format routing
// --------------------------------------------------------------------------

test('[22] bank format resolves correctly per account', () => {
  const e = makeEngine();
  const h = e.createDeposit({ bankAccountId: 'BA-HAPOALIM-001', date: '2026-04-10' });
  const l = e.createDeposit({ bankAccountId: 'BA-LEUMI-001',    date: '2026-04-10' });
  const d = e.createDeposit({ bankAccountId: 'BA-DISCOUNT-001', date: '2026-04-10' });
  const m = e.createDeposit({ bankAccountId: 'BA-MIZRAHI-001',  date: '2026-04-10' });
  assert.equal(e.getSlip(h).bank_format, 'hapoalim');
  assert.equal(e.getSlip(l).bank_format, 'leumi');
  assert.equal(e.getSlip(d).bank_format, 'discount');
  assert.equal(e.getSlip(m).bank_format, 'mizrahi');
  // BANK_FORMATS should have an accent + title for each
  for (const k of ['hapoalim', 'leumi', 'discount', 'mizrahi']) {
    assert.ok(mod.BANK_FORMATS[k].title.includes('שובר הפקדה'));
  }
});
