/* ============================================================================
 * Techno-Kol ERP — journal-entry test suite
 * Agent X-39 / Swarm 3C / GL Manual Journal Entry Builder
 * ----------------------------------------------------------------------------
 * Covers (24 cases):
 *   01. createBook returns an object with expected API
 *   02. createEntry allocates sequential number JE-YYYYMM-NNNN
 *   03. addLine rejects line with both debit and credit
 *   04. addLine rejects negative amounts
 *   05. validate reports balanced when debits = credits
 *   06. validate reports unbalanced with exact diff
 *   07. validate catches account not in COA
 *   08. validate catches frozen account
 *   09. validate catches inactive account
 *   10. validate catches period-lock
 *   11. classify maps 1100 -> ASSET, 6200 -> OPEX, 4000 -> REVENUE, 9000 -> TAX
 *   12. classify honors legacy 0100 revenue band
 *   13. classify returns null for out-of-range accounts (>9999)
 *   14. auto-number increments per period (YYYYMM)
 *   15. foreign currency auto-converts to ILS via fx adapter
 *   16. post transitions to posted and locks entry
 *   17. post refuses if period is locked
 *   18. post refuses if unbalanced
 *   19. reverse creates balanced counter-entry on first of next period
 *   20. reverse fails if original not posted
 *   21. applyTemplate MONTHLY_RENT_ACCRUAL produces balanced entry
 *   22. applyTemplate DEPRECIATION produces balanced entry
 *   23. applyTemplate PAYROLL_ACCRUAL is balanced for any legal inputs
 *   24. applyTemplate FX_REVALUATION handles gain and loss
 *   25. applyTemplate VAT_OFFSET balances across output/input/net
 *   26. applyTemplate LOAN_PAYMENT splits principal + interest balanced
 *   27. createRecurring + runRecurring creates 12 monthly entries
 *   28. approvalRoleFor maps amounts to correct role tier
 *   29. attachReference appends bilingual reference
 *   30. unpost reverts posted status with audit note
 *   31. unpost refuses if period is now locked
 *   32. reverse refuses double-reverse
 *   33. bilingual errors expose {en, he, code}
 *   34. cost_center per line is preserved
 *
 * Runs under plain Node (no framework). Executes with:
 *   node test/payroll/journal-entry.test.js
 * ========================================================================== */

'use strict';

const path = require('path');

const GL = require(path.join(
  __dirname, '..', '..', 'onyx-procurement', 'src', 'gl', 'journal-entry.js'
));

/* ----------------------------------------------------------------------------
 * Tiny assertion + harness (no deps)
 * -------------------------------------------------------------------------- */
const results = [];

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertNear(actual, expected, tol, msg) {
  const a = Number(actual), e = Number(expected);
  if (Math.abs(a - e) > (tol || 0.01)) {
    throw new Error(`${msg || 'assertNear'}: expected ~${e}, got ${a}`);
  }
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}
function assertFalse(cond, msg) {
  if (cond) throw new Error(msg || 'assertFalse failed');
}
function assertThrows(fn, msg) {
  let threw = false;
  let err = null;
  try { fn(); } catch (e) { threw = true; err = e; }
  if (!threw) throw new Error(msg || 'expected throw');
  return err;
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok  - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  FAIL- ${name}\n        ${err.message}`);
  }
}

/* ----------------------------------------------------------------------------
 * Fixtures
 * -------------------------------------------------------------------------- */

function mkCoa(extra = {}) {
  const coa = GL.defaultCoa();
  if (extra.frozen) coa.set(extra.frozen, Object.assign({}, coa.get(extra.frozen) || { no: extra.frozen, name: 'frz', active: true }, { frozen: true }));
  if (extra.inactive) coa.set(extra.inactive, Object.assign({}, coa.get(extra.inactive) || { no: extra.inactive, name: 'in', frozen: false }, { active: false }));
  return coa;
}

function mkBook(opts) {
  return GL.createBook(Object.assign({ coa: GL.defaultCoa() }, opts || {}));
}

/* ----------------------------------------------------------------------------
 * Test runner
 * -------------------------------------------------------------------------- */
async function run() {
  console.log('journal-entry.test.js — Techno-Kol ERP GL');
  console.log('----------------------------------------------------');

  await test('01 createBook returns an object with expected API', async () => {
    const book = mkBook();
    assertEq(typeof book.createEntry, 'function');
    assertEq(typeof book.addLine, 'function');
    assertEq(typeof book.validate, 'function');
    assertEq(typeof book.post, 'function');
    assertEq(typeof book.unpost, 'function');
    assertEq(typeof book.reverse, 'function');
    assertEq(typeof book.applyTemplate, 'function');
    assertEq(typeof book.createRecurring, 'function');
  });

  await test('02 createEntry allocates JE-YYYYMM-NNNN', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    const e = book.getEntry(id);
    assertTrue(/^JE-202604-0001$/.test(e.number), `got ${e.number}`);
  });

  await test('03 addLine rejects line with both debit and credit', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    const err = assertThrows(() => book.addLine(id, { account: '6200', debit: 100, credit: 100 }));
    assertEq(err.code, 'ERR_LINE_INVALID');
    assertTrue(!!err.he, 'he message present');
  });

  await test('04 addLine rejects negative amounts', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    const err = assertThrows(() => book.addLine(id, { account: '6200', debit: -10 }));
    assertEq(err.code, 'ERR_AMOUNT_NEG');
  });

  await test('05 validate reports balanced when D = C', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 5000, description: 'שכירות' });
    book.addLine(id, { account: '2150', credit: 5000, description: 'שכירות לשלם' });
    const v = book.validate(id);
    assertTrue(v.balanced, 'balanced');
    assertEq(v.errors.length, 0, 'no errors');
    assertNear(v.totalDebits, 5000, 0.01);
    assertNear(v.totalCredits, 5000, 0.01);
  });

  await test('06 validate reports unbalanced with exact diff', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 5000 });
    book.addLine(id, { account: '2150', credit: 4500 });
    const v = book.validate(id);
    assertFalse(v.balanced);
    assertNear(v.diff, 500, 0.01);
    assertTrue(v.errors.some(e => e.code === 'ERR_UNBALANCED'));
  });

  await test('07 validate catches account not in COA', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '1234', debit: 100 });   // 1234 not in default COA
    book.addLine(id, { account: '2150', credit: 100 });
    const v = book.validate(id);
    assertTrue(v.errors.some(e => e.code === 'ERR_ACCT_MISSING'));
  });

  await test('08 validate catches frozen account', async () => {
    const coa = GL.defaultCoa();
    const frozen = Object.assign({}, coa.get('6200'), { frozen: true });
    coa.set('6200', frozen);
    const book = GL.createBook({ coa });
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    const v = book.validate(id);
    assertTrue(v.errors.some(e => e.code === 'ERR_ACCT_FROZEN'));
  });

  await test('09 validate catches inactive account', async () => {
    const coa = GL.defaultCoa();
    coa.set('6200', Object.assign({}, coa.get('6200'), { active: false }));
    const book = GL.createBook({ coa });
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    const v = book.validate(id);
    assertTrue(v.errors.some(e => e.code === 'ERR_ACCT_INACTIVE'));
  });

  await test('10 validate catches period-lock', async () => {
    const periods = { isLocked: (p) => p === '202604' };
    const book = GL.createBook({ coa: GL.defaultCoa(), periods });
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    const v = book.validate(id);
    assertTrue(v.errors.some(e => e.code === 'ERR_PERIOD_LOCKED'));
  });

  await test('11 classify maps 1100/6200/4000/9000', async () => {
    assertEq(GL.classify('1100').type, 'asset');
    assertEq(GL.classify('6200').type, 'opex');
    assertEq(GL.classify('4000').type, 'revenue');
    assertEq(GL.classify('9000').type, 'tax');
    assertEq(GL.classify('2150').type, 'liability');
    assertEq(GL.classify('3500').type, 'equity');
    assertEq(GL.classify('5000').type, 'cogs');
    assertEq(GL.classify('7100').type, 'non_op');
  });

  await test('12 classify honors legacy 0100 revenue', async () => {
    const c = GL.classify('0150');
    assertTrue(!!c, 'classified');
    assertEq(c.type, 'revenue');
    assertEq(c.legacy, true);
  });

  await test('13 classify returns null out-of-range', async () => {
    assertEq(GL.classify('0'), null);
    assertEq(GL.classify('99999'), null);
    assertEq(GL.classify('abc'), null);
  });

  await test('14 auto-number increments per period', async () => {
    const book = mkBook();
    const a = book.createEntry({ date: '2026-04-01' });
    const b = book.createEntry({ date: '2026-04-15' });
    const c = book.createEntry({ date: '2026-05-01' });
    const d = book.createEntry({ date: '2026-04-30' });
    assertEq(book.getEntry(a).number, 'JE-202604-0001');
    assertEq(book.getEntry(b).number, 'JE-202604-0002');
    assertEq(book.getEntry(c).number, 'JE-202605-0001');
    assertEq(book.getEntry(d).number, 'JE-202604-0003');
  });

  await test('15 foreign currency converts to ILS via fx adapter', async () => {
    const fx = { rateToILS: (cur /* , date */) => (cur === 'USD' ? 3.70 : 1) };
    const book = GL.createBook({ coa: GL.defaultCoa(), fx });
    const id = book.createEntry({ date: '2026-04-11', memo: 'USD payable', currency: 'USD' });
    book.addLine(id, { account: '6800', debit:  100, currency: 'USD' });
    book.addLine(id, { account: '2150', credit: 100, currency: 'USD' });
    const e = book.getEntry(id);
    assertNear(e.lines[0].debit_ils, 370, 0.01);
    assertNear(e.lines[1].credit_ils, 370, 0.01);
    const v = book.validate(id);
    assertTrue(v.balanced, 'still balanced in ILS');
  });

  await test('16 post transitions to posted and locks', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    book.post(id, 'user-42');
    const e = book.getEntry(id);
    assertEq(e.status, 'posted');
    assertEq(e.posted_by, 'user-42');
    const err = assertThrows(() => book.addLine(id, { account: '6200', debit: 1 }));
    assertEq(err.code, 'ERR_POSTED_LOCK');
  });

  await test('17 post refuses if period is locked', async () => {
    const periods = { isLocked: () => true };
    const book = GL.createBook({ coa: GL.defaultCoa(), periods });
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    const err = assertThrows(() => book.post(id, 'u'));
    // post() validates first, so it will throw unbalanced wrapper carrying errors
    assertTrue(err.code === 'ERR_PERIOD_LOCKED' ||
               (err.errors && err.errors.some(e => e.code === 'ERR_PERIOD_LOCKED')),
               'period-lock surfaced');
  });

  await test('18 post refuses if unbalanced', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 90 });
    const err = assertThrows(() => book.post(id, 'u'));
    assertEq(err.code, 'ERR_UNBALANCED');
  });

  await test('19 reverse creates counter-entry on first of next period', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    book.post(id, 'u');
    const revId = book.reverse(id, 'correction');
    const rev = book.getEntry(revId);
    assertEq(rev.date, '2026-05-01', 'first of next period');
    assertEq(rev.reverses, id);
    // Each line flipped
    assertNear(rev.lines[0].debit,  0, 0.0001);
    assertNear(rev.lines[0].credit, 100, 0.01);
    assertNear(rev.lines[1].debit,  100, 0.01);
    assertNear(rev.lines[1].credit, 0, 0.0001);
    const v = book.validate(revId);
    assertTrue(v.balanced);
  });

  await test('20 reverse fails if original not posted', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    const err = assertThrows(() => book.reverse(id, 'x'));
    assertEq(err.code, 'ERR_NOT_POSTED');
  });

  await test('21 applyTemplate MONTHLY_RENT_ACCRUAL is balanced', async () => {
    const book = mkBook();
    const id = book.applyTemplate('MONTHLY_RENT_ACCRUAL', {
      amount: 5000, date: '2026-04-01', cost_center: 'CC-HQ',
    });
    const e = book.getEntry(id);
    assertEq(e.lines.length, 2);
    assertEq(e.lines[0].cost_center, 'CC-HQ');
    const v = book.validate(id);
    assertTrue(v.balanced);
  });

  await test('22 applyTemplate DEPRECIATION is balanced', async () => {
    const book = mkBook();
    const id = book.applyTemplate('DEPRECIATION', { amount: 1200, date: '2026-04-30' });
    const v = book.validate(id);
    assertTrue(v.balanced);
    const e = book.getEntry(id);
    assertEq(e.lines[0].account, '6500');  // expense
    assertEq(e.lines[1].account, '1590');  // accum depreciation
  });

  await test('23 applyTemplate PAYROLL_ACCRUAL is balanced', async () => {
    const book = mkBook();
    const id = book.applyTemplate('PAYROLL_ACCRUAL', {
      gross: 10000, employer_cost: 2500, net_payable: 7500, date: '2026-04-30',
    });
    const v = book.validate(id);
    assertTrue(v.balanced, 'balanced ' + JSON.stringify(v));
  });

  await test('24 applyTemplate FX_REVALUATION handles gain and loss', async () => {
    const book = mkBook();
    const g = book.applyTemplate('FX_REVALUATION', { fx_gain_loss:  250, date: '2026-04-30' });
    const l = book.applyTemplate('FX_REVALUATION', { fx_gain_loss: -250, date: '2026-04-30' });
    assertTrue(book.validate(g).balanced);
    assertTrue(book.validate(l).balanced);
  });

  await test('25 applyTemplate VAT_OFFSET balances', async () => {
    const book = mkBook();
    const id = book.applyTemplate('VAT_OFFSET', {
      vat_output: 1700, vat_input: 850, date: '2026-04-30',
    });
    const v = book.validate(id);
    assertTrue(v.balanced, JSON.stringify(v));
  });

  await test('26 applyTemplate LOAN_PAYMENT balances', async () => {
    const book = mkBook();
    const id = book.applyTemplate('LOAN_PAYMENT', {
      principal: 900, interest: 100, date: '2026-04-30',
    });
    const v = book.validate(id);
    assertTrue(v.balanced);
    const e = book.getEntry(id);
    const principalLine = e.lines.find(l => l.account === '2200');
    assertNear(principalLine.debit, 900, 0.01);
  });

  await test('27 createRecurring + runRecurring creates 12 monthly entries', async () => {
    const book = mkBook();
    const rid = book.createRecurring('MONTHLY_RENT_ACCRUAL', {
      frequency: 'monthly',
      start: '2026-01-01',
      occurrences: 12,
      variables: { amount: 5000, cost_center: 'CC-HQ' },
    });
    assertTrue(!!rid, 'recurring id returned');
    // Run through end of year
    const ids = book.runRecurring('2026-12-31');
    assertEq(ids.length, 12, 'twelve monthly entries created');
    // Each entry must be balanced
    for (const id of ids) {
      const v = book.validate(id);
      assertTrue(v.balanced, 'entry ' + id + ' balanced');
    }
  });

  await test('28 approvalRoleFor maps amounts to tier', async () => {
    assertEq(GL.approvalRoleFor(100),     'bookkeeper');
    assertEq(GL.approvalRoleFor(4999),    'bookkeeper');
    assertEq(GL.approvalRoleFor(5001),    'accountant');
    assertEq(GL.approvalRoleFor(49999),   'accountant');
    assertEq(GL.approvalRoleFor(60000),   'cfo');
    assertEq(GL.approvalRoleFor(600000),  'ceo');
  });

  await test('29 attachReference appends supporting doc', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    book.attachReference(id, { type: 'invoice', id: 'INV-42', label: 'Rent inv' });
    book.attachReference(id, { type: 'url', url: 'https://example.com/doc.pdf' });
    const e = book.getEntry(id);
    assertEq(e.references.length, 2);
    assertEq(e.references[0].type, 'invoice');
  });

  await test('30 unpost reverts posted status with audit note', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    book.post(id, 'u');
    book.unpost(id, 'admin', 'wrong amount');
    const e = book.getEntry(id);
    assertEq(e.status, 'approved');
    assertTrue(e.audit.some(a => a.action === 'unpost' && a.reason === 'wrong amount'));
  });

  await test('31 unpost refuses if period locked', async () => {
    let locked = false;
    const periods = { isLocked: () => locked };
    const book = GL.createBook({ coa: GL.defaultCoa(), periods });
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    book.post(id, 'u');
    locked = true;
    const err = assertThrows(() => book.unpost(id, 'admin', 'oops'));
    assertEq(err.code, 'ERR_PERIOD_LOCKED');
  });

  await test('32 reverse refuses double-reverse', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100 });
    book.addLine(id, { account: '2150', credit: 100 });
    book.post(id, 'u');
    book.reverse(id, 'first');
    const err = assertThrows(() => book.reverse(id, 'second'));
    assertEq(err.code, 'ERR_REVERSED_TWICE');
  });

  await test('33 bilingual errors expose {en, he, code}', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    const err = assertThrows(() => book.addLine(id, { account: '6200', debit: 100, credit: 100 }));
    assertTrue(!!err.code);
    assertTrue(typeof err.en === 'string' && err.en.length > 0);
    assertTrue(typeof err.he === 'string' && err.he.length > 0);
  });

  await test('34 cost_center per line is preserved', async () => {
    const book = mkBook();
    const id = book.createEntry({ date: '2026-04-11', memo: 'T' });
    book.addLine(id, { account: '6200', debit: 100, cost_center: 'CC-01', project: 'P-A' });
    book.addLine(id, { account: '2150', credit: 100 });
    const e = book.getEntry(id);
    assertEq(e.lines[0].cost_center, 'CC-01');
    assertEq(e.lines[0].project, 'P-A');
  });

  /* ---- summary ---- */
  console.log('----------------------------------------------------');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`journal-entry.test.js  —  ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) {
    for (const r of results) if (!r.ok) console.log(`  FAIL- ${r.name}: ${r.error}`);
    process.exitCode = 1;
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
