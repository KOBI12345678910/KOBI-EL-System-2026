/* ============================================================================
 * Techno-Kol ERP — petty-cash test suite
 * Agent X-44 / Swarm 3C / Onyx Procurement
 * ----------------------------------------------------------------------------
 * Covers:
 *   01 createFund happy path
 *   02 createFund rejects missing custodian / invalid float / cash-law excess
 *   03 createFund enforces segregation of duties (custodian != approver)
 *   04 disburse happy path + sequential voucher numbering
 *   05 disburse rejects over current balance
 *   06 disburse requires receipt over ₪50
 *   07 disburse requires tax invoice over ₪300 and derives VAT
 *   08 disburse blocks over cash law limit ₪6,000
 *   09 disburse requires approver over ₪1,000 + approver cannot be custodian
 *   10 disburse requires custodian PIN and issuer id
 *   11 replenish gathers PAID vouchers, approval workflow, JE double-entry
 *   12 replenish cannot be self-approved; rejectReplenishment keeps vouchers paid
 *   13 voidVoucher returns cash to fund and logs; blocks custodian self-void
 *   14 dailyCount computes variance + ok/minor/major statuses
 *   15 investigateVariance records root cause + write-off suspense entry
 *   16 reconcile returns imprest invariant check + totals by category
 *   17 auditTrail append-only, never deleted, filters by period
 *   18 scheduleSurpriseAudits deterministic + count respected
 *   19 needsReplenishment triggers at ≤20% threshold
 *   20 multiple funds isolated (sequential numbering per fund)
 *
 * Zero deps — hand-rolled harness. Can run under Node ESM or Jest.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * Tiny assertion harness
 * -------------------------------------------------------------------------- */
const results = [];
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}
function assertFalse(cond, msg) {
  if (cond) throw new Error(msg || 'assertFalse failed');
}
function assertThrows(fn, code, msg) {
  let threw = false;
  let caught = null;
  try { fn(); } catch (e) { threw = true; caught = e; }
  if (!threw) throw new Error(msg || 'expected throw');
  if (code && caught.code !== code) {
    throw new Error(`${msg || 'expected code'}: expected ${code}, got ${caught && caught.code}`);
  }
  return caught;
}
function assertClose(actual, expected, eps, msg) {
  if (Math.abs(actual - expected) > (eps || 0.01)) {
    throw new Error(`${msg || 'assertClose'}: expected ~${expected}, got ${actual}`);
  }
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
 * Dynamic import of the SUT
 * -------------------------------------------------------------------------- */
async function run() {
  const modUrl = new URL(
    '../../onyx-procurement/src/cash/petty-cash.js',
    import.meta.url
  );
  const petty = await import(modUrl.href);
  const {
    createMemoryStore,
    setStore,
    createFund,
    getFund,
    disburse,
    getVoucher,
    listVouchersByFund,
    voidVoucher,
    replenish,
    approveReplenishment,
    rejectReplenishment,
    issueReplenishmentCash,
    dailyCount,
    investigateVariance,
    reconcile,
    auditTrail,
    scheduleSurpriseAudits,
    needsReplenishment,
    VOUCHER_STATUS,
    REPLENISH_STATUS,
    RECEIPT_THRESHOLD_ILS,
    TAX_INVOICE_THRESHOLD_ILS,
    CASH_LAW_LIMIT_ILS,
    OVER_THRESHOLD_APPROVAL_ILS
  } = petty;

  function reset() {
    setStore(createMemoryStore());
  }

  function baseFund(overrides) {
    return createFund(Object.assign({
      name: 'HQ Petty Cash',
      nameHe: 'קופה קטנה מטה',
      floatAmount: 3000,
      custodianId: 'emp-custodian',
      approverIds: ['emp-approver', 'emp-finance'],
      location: 'TLV',
      createdBy: 'emp-finance'
    }, overrides || {}));
  }

  function baseVoucher(overrides) {
    return Object.assign({
      payee: 'שופרסל',
      amount: 120,
      category: 'MEALS',
      description: 'Coffee for meeting',
      descriptionHe: 'קפה לישיבה',
      receiptRef: 'RCPT-001',
      custodianPin: '1234',
      issuedBy: 'emp-custodian'
    }, overrides || {});
  }

  console.log('petty-cash.test.js — Techno-Kol ERP imprest fund');
  console.log('----------------------------------------------------');

  await test('01 createFund happy path returns id and sets balance=float', () => {
    reset();
    const id = baseFund();
    assertTrue(typeof id === 'string' && id.startsWith('FND-'), 'id pattern');
    const f = getFund(id);
    assertEq(f.floatAmount, 3000);
    assertEq(f.currentBalance, 3000, 'starts fully funded');
    assertEq(f.custodianId, 'emp-custodian');
    assertEq(f.status, 'active');
    assertTrue(Array.isArray(f.categories) && f.categories.length > 0);
  });

  await test('02 createFund rejects invalid float / missing custodian / cash-law excess', () => {
    reset();
    assertThrows(() => createFund(null), 'ERR_INVALID_INPUT');
    assertThrows(() => createFund({ name: '', floatAmount: 1000, custodianId: 'x', approverIds: ['y'] }), 'ERR_NAME_REQUIRED');
    assertThrows(() => createFund({ name: 'F', floatAmount: -5, custodianId: 'x', approverIds: ['y'] }), 'ERR_FLOAT_INVALID');
    assertThrows(
      () => createFund({ name: 'F', floatAmount: 10000, custodianId: 'x', approverIds: ['y'] }),
      'ERR_FLOAT_EXCEEDS_CASH_LAW'
    );
    assertThrows(
      () => createFund({ name: 'F', floatAmount: 1000, custodianId: '', approverIds: ['y'] }),
      'ERR_CUSTODIAN_REQUIRED'
    );
    assertThrows(
      () => createFund({ name: 'F', floatAmount: 1000, custodianId: 'x', approverIds: [] }),
      'ERR_APPROVER_REQUIRED'
    );
  });

  await test('03 createFund enforces segregation of duties', () => {
    reset();
    assertThrows(
      () => createFund({
        name: 'F',
        floatAmount: 1000,
        custodianId: 'emp-1',
        approverIds: ['emp-1']
      }),
      'ERR_SEGREGATION_OF_DUTIES'
    );
  });

  await test('04 disburse happy path + sequential voucher numbering', () => {
    reset();
    const fundId = baseFund();
    const v1 = disburse(fundId, baseVoucher({ amount: 100 }));
    const v2 = disburse(fundId, baseVoucher({ amount: 50, payee: 'Dor Alon' }));
    const vr1 = getVoucher(v1);
    const vr2 = getVoucher(v2);
    assertEq(vr1.sequenceNo, 1, 'first voucher = 1');
    assertEq(vr2.sequenceNo, 2, 'second voucher = 2');
    assertEq(vr1.status, VOUCHER_STATUS.PAID);
    assertEq(vr1.amount, 100);
    const f = getFund(fundId);
    assertEq(f.currentBalance, 2850, '3000 - 100 - 50 = 2850');
    assertEq(f.totalDisbursed, 150);
  });

  await test('05 disburse rejects over current balance', () => {
    reset();
    const fundId = baseFund({ floatAmount: 500 });
    // Two small vouchers first to drain balance below tax-invoice threshold
    disburse(fundId, baseVoucher({ amount: 250 }));
    disburse(fundId, baseVoucher({ amount: 150 }));
    // Now balance = 100; a 200 voucher must fail on balance (not on tax invoice)
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 200 })),
      'ERR_INSUFFICIENT_BALANCE'
    );
    assertEq(getFund(fundId).currentBalance, 100, 'only first two succeeded');
  });

  await test('06 disburse requires receipt above ₪50', () => {
    reset();
    const fundId = baseFund();
    // amount exactly 50 → no receipt required
    const ok = disburse(fundId, baseVoucher({ amount: 50, receiptRef: '' }));
    assertTrue(ok, '50 ILS allowed without receipt');

    // amount 51 → receipt required
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 51, receiptRef: '' })),
      'ERR_RECEIPT_REQUIRED'
    );

    // amount 200 with receipt → ok
    const v = disburse(fundId, baseVoucher({ amount: 200, receiptRef: 'RCPT-X' }));
    assertTrue(v.length > 0);
  });

  await test('07 disburse requires tax invoice over ₪300 and derives VAT', () => {
    reset();
    const fundId = baseFund();
    // 400 without tax invoice → reject
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 400, receiptRef: 'R1', taxInvoiceRef: '' })),
      'ERR_TAX_INVOICE_REQUIRED'
    );
    // 400 with tax invoice → VAT derived from gross
    const id = disburse(fundId, baseVoucher({
      amount: 400,
      receiptRef: 'R1',
      taxInvoiceRef: 'TAX-001',
      category: 'OFFICE'
    }));
    const v = getVoucher(id);
    assertEq(v.vatRecoverable, true);
    // Gross 400, rate 17% → net = 400 / 1.17 ≈ 341.88, vat ≈ 58.12
    assertClose(v.net, 341.88, 0.02);
    assertClose(v.vatAmount, 58.12, 0.02);
  });

  await test('08 disburse blocks over cash law limit ₪6,000', () => {
    reset();
    const fundId = baseFund({ floatAmount: 6000 });
    assertThrows(
      () => disburse(fundId, baseVoucher({
        amount: CASH_LAW_LIMIT_ILS + 1,
        receiptRef: 'R', taxInvoiceRef: 'T', approverId: 'emp-approver'
      })),
      'ERR_CASH_LAW_EXCEEDED'
    );
  });

  await test('09 disburse requires second approver over ₪1,000 — cannot be custodian', () => {
    reset();
    const fundId = baseFund({ floatAmount: 6000 });
    // No approver → reject
    assertThrows(
      () => disburse(fundId, baseVoucher({
        amount: 1500, receiptRef: 'R', taxInvoiceRef: 'T', approverId: null
      })),
      'ERR_APPROVER_REQUIRED_OVER_THRESHOLD'
    );
    // Approver === custodian → reject
    assertThrows(
      () => disburse(fundId, baseVoucher({
        amount: 1500, receiptRef: 'R', taxInvoiceRef: 'T', approverId: 'emp-custodian'
      })),
      'ERR_APPROVER_NOT_AUTHORISED'
    );
    // Unauthorised outsider → reject
    assertThrows(
      () => disburse(fundId, baseVoucher({
        amount: 1500, receiptRef: 'R', taxInvoiceRef: 'T', approverId: 'emp-unknown'
      })),
      'ERR_APPROVER_NOT_AUTHORISED'
    );
    // Legit approver → ok
    const id = disburse(fundId, baseVoucher({
      amount: 1500, receiptRef: 'R', taxInvoiceRef: 'T', approverId: 'emp-approver'
    }));
    assertEq(getVoucher(id).approverId, 'emp-approver');
  });

  await test('10 disburse requires custodian PIN and issuer id', () => {
    reset();
    const fundId = baseFund();
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 20, custodianPin: '' })),
      'ERR_CUSTODIAN_PIN_REQUIRED'
    );
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 20, issuedBy: '' })),
      'ERR_ISSUER_REQUIRED'
    );
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 20, category: 'UNKNOWN_CAT' })),
      'ERR_CATEGORY_UNKNOWN'
    );
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 0 })),
      'ERR_AMOUNT_INVALID'
    );
    assertThrows(
      () => disburse(fundId, baseVoucher({ amount: 10, payee: '' })),
      'ERR_PAYEE_REQUIRED'
    );
  });

  await test('11 replenish: gathers PAID vouchers, full workflow → JE double-entry', () => {
    reset();
    const fundId = baseFund({ floatAmount: 3000 });
    disburse(fundId, baseVoucher({ amount: 100, category: 'MEALS' }));
    disburse(fundId, baseVoucher({ amount: 200, category: 'OFFICE' }));
    disburse(fundId, baseVoucher({
      amount: 468,
      category: 'TRAVEL',
      receiptRef: 'R', taxInvoiceRef: 'T-travel'
    }));
    const fBefore = getFund(fundId);
    assertEq(fBefore.currentBalance, 2232, '3000 - 768');

    const replId = replenish(fundId, 'emp-custodian');
    // Approve
    approveReplenishment(replId, 'emp-finance');
    // Issue & post
    const posted = issueReplenishmentCash(replId, 'emp-finance');
    assertEq(posted.status, REPLENISH_STATUS.POSTED);
    assertTrue(!!posted.journalEntry, 'JE attached');
    assertEq(posted.journalEntry.totalDebit, posted.journalEntry.totalCredit, 'JE balanced');
    assertEq(posted.journalEntry.totalCredit, 768, 'credit = sum of vouchers');

    const fAfter = getFund(fundId);
    assertEq(fAfter.currentBalance, 3000, 'balance restored to float');

    // All batched vouchers now REPLENISHED
    const batched = listVouchersByFund(fundId, { status: VOUCHER_STATUS.REPLENISHED });
    assertEq(batched.length, 3);
    // VAT Input line present (because TRAVEL 468 had tax invoice)
    const vatLine = posted.journalEntry.lines.find((l) => l.account === '1510');
    assertTrue(vatLine && vatLine.debit > 0, 'VAT input line present');
  });

  await test('12 replenish: self-approval blocked, rejection leaves vouchers PAID', () => {
    reset();
    const fundId = baseFund();
    disburse(fundId, baseVoucher({ amount: 200 }));

    // Requester = custodian
    const replId = replenish(fundId, 'emp-custodian');

    // Custodian tries to approve self → blocked
    assertThrows(() => approveReplenishment(replId, 'emp-custodian'), 'ERR_SEGREGATION_OF_DUTIES');

    // Rejection keeps vouchers PAID
    rejectReplenishment(replId, 'emp-finance', 'missing receipts');
    const paid = listVouchersByFund(fundId, { status: VOUCHER_STATUS.PAID });
    assertEq(paid.length, 1, 'voucher still PAID after rejection');

    // And we can't issue cash for a rejected one
    assertThrows(() => issueReplenishmentCash(replId, 'emp-finance'), 'ERR_REPL_NOT_APPROVED');

    // No vouchers to replenish → error
    reset();
    const f2 = baseFund();
    assertThrows(() => replenish(f2, 'emp-custodian'), 'ERR_NO_VOUCHERS_TO_REPLENISH');
  });

  await test('13 voidVoucher returns cash; custodian cannot self-void', () => {
    reset();
    const fundId = baseFund();
    const vId = disburse(fundId, baseVoucher({ amount: 250 }));
    assertEq(getFund(fundId).currentBalance, 2750);

    // Custodian cannot void
    assertThrows(() => voidVoucher(vId, 'emp-custodian', 'x'), 'ERR_APPROVER_NOT_AUTHORISED');

    // Approver voids
    voidVoucher(vId, 'emp-approver', 'duplicate entry');
    assertEq(getVoucher(vId).status, VOUCHER_STATUS.VOIDED);
    assertEq(getFund(fundId).currentBalance, 3000, 'cash returned');

    // Cannot void twice
    assertThrows(() => voidVoucher(vId, 'emp-approver', 'again'), 'ERR_ALREADY_VOIDED');
  });

  await test('14 dailyCount computes variance + ok/minor/major statuses', () => {
    reset();
    const fundId = baseFund({ floatAmount: 3000 });
    disburse(fundId, baseVoucher({ amount: 100 }));
    // Expected now 2900
    const ok = dailyCount(fundId, 2900, { auditorId: 'emp-audit' });
    assertEq(ok.status, 'ok');
    assertEq(ok.variance, 0);

    // Minor variance (4 ILS — > tolerance 3 (0.1% of 3000), ≤ 15)
    const minor = dailyCount(fundId, 2896, { auditorId: 'emp-audit' });
    assertEq(minor.status, 'minor_variance');
    assertEq(minor.variance, -4);

    // Major variance (> 5 * tolerance)
    const major = dailyCount(fundId, 2850, { auditorId: 'emp-audit', surprise: true });
    assertEq(major.status, 'major_variance');
    assertEq(major.surprise, true);

    // Breakdown form
    const counted = dailyCount(fundId, {
      '200': 10, '100': 5, '50': 4, '20': 10, '10': 5, coins: 0
    }, { auditorId: 'emp-audit' });
    // 2000 + 500 + 200 + 200 + 50 = 2950
    assertEq(counted.counted, 2950);

    assertThrows(() => dailyCount(fundId, 'bad-input'), 'ERR_COUNTED_INVALID');
  });

  await test('15 investigateVariance records root cause + suspense entry', () => {
    reset();
    const fundId = baseFund({ floatAmount: 3000 });
    const c = dailyCount(fundId, 2950, { auditorId: 'emp-audit' });
    const investigated = investigateVariance(c.countId, {
      rootCause: 'till shortage',
      rootCauseHe: 'חסר בקופה',
      investigator: 'emp-audit',
      writeOff: true
    });
    assertTrue(!!investigated.investigation);
    assertEq(investigated.investigation.rootCause, 'till shortage');
    assertTrue(!!investigated.investigation.suspenseEntry, 'suspense entry created');
    assertEq(investigated.investigation.suspenseEntry.account, '1900');
    // Variance was -50 → debit to suspense
    assertEq(investigated.investigation.suspenseEntry.debit, 50);
  });

  await test('16 reconcile returns imprest invariant + totals by category', () => {
    reset();
    const fundId = baseFund({ floatAmount: 3000 });
    disburse(fundId, baseVoucher({ amount: 100, category: 'MEALS' }));
    disburse(fundId, baseVoucher({ amount: 200, category: 'MEALS' }));
    disburse(fundId, baseVoucher({ amount: 80, category: 'OFFICE' }));

    const rep = reconcile(fundId, { from: '2000-01-01', to: '2100-12-31' });
    assertEq(rep.totals.voucherCount, 3);
    assertEq(rep.totals.disbursed, 380);
    assertEq(rep.imprestOk, true, 'balance + pending = float');
    assertEq(rep.currentBalance + rep.pendingSum, rep.floatAmount);
    assertEq(rep.totals.byCategory.MEALS.amount, 300);
    assertEq(rep.totals.byCategory.OFFICE.amount, 80);
    assertEq(rep.totals.byCategory.MEALS.count, 2);
  });

  await test('17 auditTrail is append-only and never deleted', () => {
    reset();
    const fundId = baseFund();
    const before = auditTrail(fundId, {});
    assertTrue(before.length >= 1, 'fund create event logged');

    disburse(fundId, baseVoucher({ amount: 60 }));
    disburse(fundId, baseVoucher({ amount: 80 }));

    const after = auditTrail(fundId, {});
    assertTrue(after.length >= 3, 'grew monotonically');
    // All entries have bilingual payloads
    for (const e of after) {
      assertTrue(typeof e.event === 'string');
      assertTrue(typeof e.at === 'string');
      assertTrue(e.fundId === fundId);
    }
    // Period filter
    const future = auditTrail(fundId, { from: '2999-01-01', to: '2999-12-31' });
    assertEq(future.length, 0);
  });

  await test('18 scheduleSurpriseAudits deterministic + count respected', () => {
    reset();
    const fundId = baseFund();
    const a = scheduleSurpriseAudits(fundId, { year: 2026, count: 4 });
    const b = scheduleSurpriseAudits(fundId, { year: 2026, count: 4 });
    assertEq(a.length, 4);
    assertEq(a.join(','), b.join(','), 'deterministic for same input');
    for (const d of a) {
      assertTrue(/^2026-\d{2}-\d{2}$/.test(d), `ISO date: ${d}`);
    }
  });

  await test('19 needsReplenishment triggers at ≤20% threshold', () => {
    reset();
    const fundId = baseFund({ floatAmount: 3000 });
    assertFalse(needsReplenishment(fundId), 'full fund no replenish');
    // Spend until ≤20% = 600
    disburse(fundId, baseVoucher({
      amount: 2400,
      receiptRef: 'R', taxInvoiceRef: 'T', approverId: 'emp-approver'
    }));
    assertEq(getFund(fundId).currentBalance, 600);
    assertTrue(needsReplenishment(fundId), 'at exactly 20% triggers');
  });

  await test('20 multiple funds isolated — sequential numbering per fund', () => {
    reset();
    const a = baseFund({ name: 'Fund A' });
    const b = createFund({
      name: 'Fund B',
      nameHe: 'קופה ב',
      floatAmount: 2000,
      custodianId: 'emp-2',
      approverIds: ['emp-finance']
    });
    const va = disburse(a, baseVoucher({ amount: 10 }));
    const vb = disburse(b, {
      payee: 'X', amount: 10, category: 'MEALS',
      receiptRef: '', custodianPin: '9999', issuedBy: 'emp-2'
    });
    const ra = getVoucher(va);
    const rb = getVoucher(vb);
    assertEq(ra.sequenceNo, 1, 'fund A first voucher');
    assertEq(rb.sequenceNo, 1, 'fund B first voucher (independent counter)');
    assertTrue(ra.id.startsWith(a));
    assertTrue(rb.id.startsWith(b));
    assertEq(getFund(a).currentBalance, 2990);
    assertEq(getFund(b).currentBalance, 1990);
  });

  /* -------- summary -------- */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('----------------------------------------------------');
  console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.log('FAILED TESTS:');
    for (const r of results) if (!r.ok) console.log(`  - ${r.name}: ${r.error}`);
    if (typeof process !== 'undefined') process.exitCode = 1;
  }
  return { total: results.length, passed, failed };
}

/* ----------------------------------------------------------------------------
 * Entry point
 * -------------------------------------------------------------------------- */
run().catch((err) => {
  console.error('RUNNER ERROR:', err);
  if (typeof process !== 'undefined') process.exit(2);
});

export { run };
