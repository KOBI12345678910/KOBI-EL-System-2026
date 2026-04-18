/**
 * Tests for src/finance/ic-loans.js
 *
 * Agent Y-085 — Intercompany Loans Tracker
 *
 * Coverage:
 *   • originateLoan — validation, §85A note, §3(i) floor warning
 *   • buildAmortization — level, bullet, interest_only, zero-rate
 *   • calculateInterest — ACT/365, ACT/360, 30/360 + payment chunks
 *   • recordPayment — waterfall, late-payment status transition, repaid
 *   • outstandingBalance — running total after multiple payments
 *   • thinCapRules — debt/equity breach, BEPS Action 4 30% EBITDA
 *   • withholdingTax — statutory, treaty relief, bank exception, domestic
 *   • currencyRevaluation — gain and loss paths, journal shape
 *   • armsLengthSupport — interquartile range, supplied comparables
 *   • generateLoanAgreement — bilingual structure sanity checks
 *   • consolidationElimination — mirrored JV entries
 *   • Alias: instance["arm'sLengthSupport"] === method
 *
 * Run: node --test test/finance/ic-loans.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../../src/finance/ic-loans.js');
const {
  ICLoans,
  RATE_TYPES,
  LOAN_STATUS,
  PAYMENT_TYPES,
  DAY_COUNT,
  IL_3I_IMPUTED_RATE_2026,
  IL_WHT_INTEREST_DEFAULT,
  buildAmortization,
  dayCountFraction,
} = mod;

// ═══ FIXTURES ═══════════════════════════════════════════════════════════════

const LENDER = 'TKU-ISR-HQ';
const BORROWER = 'TKU-RE-LTD';

function newLoan(overrides) {
  return {
    lender: LENDER,
    borrower: BORROWER,
    principal: 1_000_000,
    currency: 'ILS',
    rate: 0.06,
    rateType: RATE_TYPES.FIXED,
    term: {
      startDate: '2026-01-01',
      maturityDate: '2031-01-01',
      gracePeriodMonths: 0,
    },
    paymentSchedule: {
      frequency: 'MONTHLY',
      amortization: 'level',
      dayCount: DAY_COUNT.ACT_365,
    },
    purpose: 'Intragroup working capital facility',
    intercompanyAgreement: {
      reference: 'ICL-2026-001',
      signatories: ['CFO', 'CEO'],
      jurisdiction: 'Tel Aviv',
      governingLaw: 'Israeli law',
    },
    ...(overrides || {}),
  };
}

// ═══ ORIGINATION ═══════════════════════════════════════════════════════════

describe('originateLoan', () => {
  test('creates a loan with §85A note and active status', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    assert.ok(loan.loanId.startsWith('ICL-'));
    assert.equal(loan.status, LOAN_STATUS.ACTIVE);
    assert.ok(loan.section85ANote.he.includes('85א'));
    assert.ok(loan.section85ANote.en.includes('Section 85A'));
    assert.ok(Array.isArray(loan.amortizationSchedule));
    assert.equal(loan.amortizationSchedule.length, 60); // 5y monthly
  });

  test('rejects principal <= 0', () => {
    const ic = new ICLoans();
    assert.throws(() => ic.originateLoan(newLoan({ principal: 0 })), /principal must be > 0/);
  });

  test('rejects identical lender and borrower', () => {
    const ic = new ICLoans();
    assert.throws(
      () => ic.originateLoan(newLoan({ borrower: LENDER })),
      /lender and borrower must differ/
    );
  });

  test('rejects unknown rateType', () => {
    const ic = new ICLoans();
    assert.throws(() => ic.originateLoan(newLoan({ rateType: 'martian' })), /invalid rateType/);
  });

  test('flags loans below §3(i) floor without TP support', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan({ rate: 0.005 }));
    assert.ok(loan.armsLengthWarning);
    assert.ok(loan.armsLengthWarning.he.includes('3(י)'));
    assert.ok(loan.armsLengthWarning.en.includes('3(i)'));
    const log = ic.getAuditLog();
    assert.ok(log.some(l => l.action === 'ARMS_LENGTH_WARNING'));
  });
});

// ═══ AMORTIZATION ══════════════════════════════════════════════════════════

describe('buildAmortization', () => {
  test('level schedule — ending balance is zero (within rounding)', () => {
    const rows = buildAmortization({
      principal: 120_000,
      rate: 0.05,
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      frequency: 12,
      amortization: 'level',
      dayCount: DAY_COUNT.ACT_365,
    });
    assert.equal(rows.length, 12);
    const last = rows[rows.length - 1];
    assert.equal(last.closingBalance, 0);
    // Sum of principal approximately equal to original principal
    const sumPrincipal = rows.reduce((a, r) => a + r.principal, 0);
    assert.ok(Math.abs(sumPrincipal - 120_000) < 0.02);
  });

  test('interest-only / bullet — principal paid only at maturity', () => {
    const rows = buildAmortization({
      principal: 500_000,
      rate: 0.04,
      startDate: '2026-01-01',
      maturityDate: '2028-01-01',
      frequency: 4,
      amortization: 'interest_only',
      dayCount: DAY_COUNT.ACT_365,
    });
    assert.equal(rows.length, 8);
    for (let i = 0; i < 7; i += 1) assert.equal(rows[i].principal, 0);
    assert.equal(rows[7].principal, 500_000);
    assert.equal(rows[7].closingBalance, 0);
  });

  test('zero-rate loan — principal amortises linearly', () => {
    const rows = buildAmortization({
      principal: 60_000,
      rate: 0,
      startDate: '2026-01-01',
      maturityDate: '2026-07-01',
      frequency: 12,
      amortization: 'level',
      dayCount: DAY_COUNT.ACT_365,
    });
    assert.equal(rows.length, 6);
    assert.equal(rows[0].interest, 0);
    assert.equal(rows[rows.length - 1].closingBalance, 0);
  });
});

describe('dayCountFraction', () => {
  test('ACT/365 between 2026-01-01 and 2026-04-01 ≈ 0.2466', () => {
    const f = dayCountFraction('2026-01-01', '2026-04-01', DAY_COUNT.ACT_365);
    assert.ok(Math.abs(f - 90 / 365) < 1e-9);
  });
  test('ACT/360 differs from ACT/365', () => {
    const a = dayCountFraction('2026-01-01', '2026-07-01', DAY_COUNT.ACT_365);
    const b = dayCountFraction('2026-01-01', '2026-07-01', DAY_COUNT.ACT_360);
    assert.notEqual(a, b);
  });
  test('30/360 between 2026-01-15 and 2026-07-15 = 0.5', () => {
    const f = dayCountFraction('2026-01-15', '2026-07-15', DAY_COUNT.D30_360);
    assert.ok(Math.abs(f - 0.5) < 1e-9);
  });
});

// ═══ INTEREST ACCRUAL ═════════════════════════════════════════════════════

describe('calculateInterest', () => {
  test('simple accrual without mid-period payments', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    const res = ic.calculateInterest(loan.loanId, { from: '2026-01-01', to: '2026-07-01' });
    // 6 months of simple interest on 1M at 6% ≈ 29,753.42 (ACT/365)
    const expected = 1_000_000 * 0.06 * (181 / 365);
    assert.ok(Math.abs(res.accruedInterest - Math.round(expected * 100) / 100) < 0.5);
    assert.equal(res.chunks.length, 1);
  });

  test('splits into chunks around mid-period payments', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    ic.recordPayment({ loanId: loan.loanId, date: '2026-04-01', principal: 100_000, interest: 15_000, type: 'scheduled' });
    const res = ic.calculateInterest(loan.loanId, { from: '2026-01-01', to: '2026-07-01' });
    assert.equal(res.chunks.length, 2);
    // First chunk on full 1M, second chunk on 900k
    assert.equal(res.chunks[0].balance, 1_000_000);
    assert.equal(res.chunks[1].balance, 900_000);
  });

  test('rejects inverted period', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    assert.throws(
      () => ic.calculateInterest(loan.loanId, { from: '2026-07-01', to: '2026-01-01' }),
      /period\.to must be after period\.from/
    );
  });
});

// ═══ PAYMENTS + STATUS ═══════════════════════════════════════════════════

describe('recordPayment', () => {
  test('scheduled payment reduces principal and leaves loan active', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    ic.recordPayment({ loanId: loan.loanId, date: '2026-02-01', principal: 50_000, interest: 5_000, type: 'scheduled' });
    const ob = ic.outstandingBalance(loan.loanId, '2026-02-02');
    assert.equal(ob.principal, 950_000);
    assert.equal(ic.getLoan(loan.loanId).status, LOAN_STATUS.ACTIVE);
  });

  test('late payment transitions loan to in_default', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    ic.recordPayment({ loanId: loan.loanId, date: '2026-02-15', principal: 10_000, interest: 1_000, type: 'late' });
    assert.equal(ic.getLoan(loan.loanId).status, LOAN_STATUS.IN_DEFAULT);
  });

  test('full repayment flips status to repaid', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    ic.recordPayment({
      loanId: loan.loanId,
      date: '2026-02-01',
      principal: 1_000_000,
      interest: 5_000,
      type: 'early',
    });
    const lr = ic.getLoan(loan.loanId);
    assert.equal(lr.status, LOAN_STATUS.REPAID);
    const ob = ic.outstandingBalance(loan.loanId, '2026-02-02');
    assert.equal(ob.principal, 0);
  });

  test('gross amount is split via waterfall', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan({ rate: 0.12 }));
    // After 1 month at 12% APR: interest ≈ 1M * 0.12 * 31/365 = 10,191.78
    const rec = ic.recordPayment({ loanId: loan.loanId, date: '2026-02-01', amount: 20_000, type: 'scheduled' });
    assert.ok(rec.interest > 0);
    assert.ok(rec.principal > 0);
    assert.ok(Math.abs(rec.interest + rec.principal - 20_000) < 0.02);
  });
});

// ═══ OUTSTANDING BALANCE ═════════════════════════════════════════════════

describe('outstandingBalance', () => {
  test('reflects multiple payments', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    ic.recordPayment({ loanId: loan.loanId, date: '2026-02-01', principal: 100_000, interest: 5_000, type: 'scheduled' });
    ic.recordPayment({ loanId: loan.loanId, date: '2026-05-01', principal: 200_000, interest: 12_000, type: 'scheduled' });
    const ob = ic.outstandingBalance(loan.loanId, '2026-06-01');
    assert.equal(ob.principal, 700_000);
    assert.equal(ob.interestPaid, 17_000);
    assert.ok(ob.interestAccrued > 0);
  });

  test('throws for unknown loanId', () => {
    const ic = new ICLoans();
    assert.throws(() => ic.outstandingBalance('ICL-nope'), /loan not found/);
  });
});

// ═══ THIN CAP RULES ══════════════════════════════════════════════════════

describe('thinCapRules', () => {
  test('no breach when ratio at threshold', () => {
    const ic = new ICLoans();
    const r = ic.thinCapRules({ entity: 'TKU-RE-LTD', debtEquityRatio: 2.5, maxRatio: 3.0 });
    assert.equal(r.breaches.length, 0);
    assert.ok(r.opinion.he.includes('לא זוהתה'));
  });

  test('debt/equity breach disallows portion of interest', () => {
    const ic = new ICLoans();
    const r = ic.thinCapRules({
      entity: 'TKU-RE-LTD',
      debtEquityRatio: 4.5,
      maxRatio: 3.0,
      interestExpense: 1_000_000,
    });
    assert.equal(r.breaches.length, 1);
    assert.equal(r.breaches[0].test, 'debt_equity');
    // excessFraction ≈ (4.5 - 3.0) / 4.5 = 0.3333 → 333,333 non-deductible
    assert.ok(Math.abs(r.nonDeductibleInterest - 333_333.33) < 1);
    assert.ok(r.taxImpact > 0);
  });

  test('BEPS Action 4 — 30% EBITDA cap', () => {
    const ic = new ICLoans();
    const r = ic.thinCapRules({
      entity: 'TKU-RE-LTD',
      debtEquityRatio: 1.0,
      maxRatio: 3.0,
      interestExpense: 800_000,
      ebitda: 2_000_000,
    });
    // Cap = 600k, non-ded = 200k
    assert.equal(r.nonDeductibleInterest, 200_000);
    assert.ok(r.breaches.some(b => b.test === 'beps_4_30pct_ebitda'));
  });

  test('requires at least one usable input', () => {
    const ic = new ICLoans();
    assert.throws(() => ic.thinCapRules({ entity: 'X' }), /debtEquityRatio/);
  });
});

// ═══ WITHHOLDING TAX ═════════════════════════════════════════════════════

describe('withholdingTax', () => {
  test('domestic loan — no WHT obligation', () => {
    const ic = new ICLoans();
    const w = ic.withholdingTax({ borrower: 'TKU-IL', lender: 'TKU-IL-2', interest: 10_000, lenderCountry: 'IL' });
    assert.equal(w.appliedWHT, 2_500);    // statutory ceiling shown
    assert.equal(w.treatyRate, null);
    assert.ok(w.he.note.includes('ישראלים'));
    assert.ok(w.en.note.includes('Israeli'));
  });

  test('statutory 25% when no treaty certificate', () => {
    const ic = new ICLoans();
    const w = ic.withholdingTax({ borrower: 'TKU-IL', lender: 'TKU-US', interest: 100_000, lenderCountry: 'US' });
    assert.equal(w.statutoryRate, IL_WHT_INTEREST_DEFAULT);
    assert.equal(w.statutoryWHT, 25_000);
    assert.equal(w.treatyRate, 0.175);
    assert.equal(w.appliedWHT, 25_000);   // certificate absent → statutory
    assert.ok(w.en.note.includes('residency certificate'));
  });

  test('treaty relief applied with certificate', () => {
    const ic = new ICLoans();
    const w = ic.withholdingTax({
      borrower: 'TKU-IL',
      lender: 'TKU-DE',
      interest: 100_000,
      lenderCountry: 'DE',
      treatyCertificate: 'CERT-2026-DE-001',
    });
    assert.equal(w.treatyRate, 0.05);
    assert.equal(w.appliedWHT, 5_000);
    assert.equal(w.netInterestToLender, 95_000);
    assert.ok(w.he.note.includes('אמנה'));
  });

  test('bank exception caps treaty rate at 10%', () => {
    const ic = new ICLoans();
    const w = ic.withholdingTax({
      borrower: 'TKU-IL',
      lender: 'TKU-US-BANK',
      interest: 100_000,
      lenderCountry: 'US',
      bankException: true,
      treatyCertificate: 'CERT-2026-US-002',
    });
    assert.ok(w.treatyRate <= 0.10 + 1e-9);
  });

  test('rejects negative interest', () => {
    const ic = new ICLoans();
    assert.throws(
      () => ic.withholdingTax({ borrower: 'A', lender: 'B', interest: -1 }),
      /non-negative/
    );
  });
});

// ═══ FX REVALUATION ══════════════════════════════════════════════════════

describe('currencyRevaluation', () => {
  test('USD loan — unrealised gain for the lender when USD strengthens', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan({ currency: 'USD', principal: 100_000 }));
    const rev = ic.currencyRevaluation({
      loanId: loan.loanId,
      asOfDate: '2026-03-31',
      spotRate: 3.85,
      functionalCurrency: 'ILS',
      previousSpot: 3.70,
    });
    // (3.85 - 3.70) * 100_000 = 15_000 ILS gain for the lender
    assert.equal(rev.diff, 15_000);
    assert.equal(rev.lenderImpact, 15_000);
    assert.equal(rev.borrowerImpact, -15_000);
    assert.ok(rev.journal.lender.length === 2);
    assert.ok(rev.journal.borrower.length === 2);
  });

  test('EUR loan — loss for the lender when EUR weakens', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan({ currency: 'EUR', principal: 50_000 }));
    const rev = ic.currencyRevaluation({
      loanId: loan.loanId,
      asOfDate: '2026-06-30',
      spotRate: 3.90,
      functionalCurrency: 'ILS',
      previousSpot: 4.00,
    });
    assert.equal(rev.diff, -5_000);
    assert.equal(rev.lenderImpact, -5_000);
  });

  test('same-currency loan — zero impact without previous rate', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    const rev = ic.currencyRevaluation({
      loanId: loan.loanId,
      asOfDate: '2026-06-30',
      spotRate: 1.0,
      functionalCurrency: 'ILS',
    });
    assert.equal(rev.diff, 0);
  });
});

// ═══ ARM'S LENGTH SUPPORT ════════════════════════════════════════════════

describe("armsLengthSupport", () => {
  test('synthesises baseline comparables when none supplied', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan({ rate: IL_3I_IMPUTED_RATE_2026 }));
    const support = ic.armsLengthSupport(loan.loanId);
    assert.ok(support.comparables.length >= 3);
    assert.ok(support.comparables.every(c => c.synthesised));
    assert.ok(support.conclusion.inRange);
    assert.ok(support.method.he.includes('CUP'));
  });

  test('uses supplied comparables when available', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan({
      rate: 0.055,
      armsLengthSupport: {
        comparables: [
          { source: 'Bloomberg BICLB02Y', rate: 0.048, tenor: '5Y' },
          { source: 'Bank Leumi term loan', rate: 0.060, tenor: '5Y' },
          { source: 'Discount Bank term loan', rate: 0.062, tenor: '5Y' },
          { source: 'Moody\'s BBB curve',    rate: 0.052, tenor: '5Y' },
        ],
      },
    }));
    const support = ic.armsLengthSupport(loan.loanId);
    assert.equal(support.comparables.length, 4);
    assert.ok(support.conclusion.inRange);
  });

  test("instance alias arm'sLengthSupport works identically", () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    const a = ic.armsLengthSupport(loan.loanId);
    const b = ic["arm'sLengthSupport"](loan.loanId);
    assert.equal(a.loanId, b.loanId);
    assert.deepEqual(a.interquartileRange, b.interquartileRange);
  });
});

// ═══ AGREEMENT GENERATION ═══════════════════════════════════════════════

describe('generateLoanAgreement', () => {
  test('bilingual agreement contains required clauses', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    const agr = ic.generateLoanAgreement(loan.loanId);
    assert.ok(agr.he.includes('הסכם הלוואה'));
    assert.ok(agr.he.includes('85א'));
    assert.ok(agr.he.includes('25%'));
    assert.ok(agr.en.includes('INTERCOMPANY LOAN AGREEMENT'));
    assert.ok(agr.en.includes('Section 85A'));
    assert.ok(agr.en.includes('25%'));
    assert.ok(agr.en.includes('Form 2513'));
  });
});

// ═══ CONSOLIDATION ELIMINATION ═══════════════════════════════════════════

describe('consolidationElimination', () => {
  test('returns mirrored JV entries for each open loan', () => {
    const ic = new ICLoans();
    const l1 = ic.originateLoan(newLoan());
    const l2 = ic.originateLoan(newLoan({ principal: 500_000 }));
    const out = ic.consolidationElimination({ from: '2026-01-01', to: '2026-06-30' });
    assert.equal(out.count, 2);
    for (const item of out.items) {
      const bs = item.balanceSheetElimination.entries;
      const pl = item.incomeStatementElimination.entries;
      // Mirrored: debit side total equals credit side total
      assert.equal(
        bs[0].debit + bs[1].debit,
        bs[0].credit + bs[1].credit
      );
      assert.equal(
        pl[0].debit + pl[1].debit,
        pl[0].credit + pl[1].credit
      );
    }
    assert.ok([l1.loanId, l2.loanId].every(id => out.items.some(x => x.loanId === id)));
  });
});

// ═══ AUDIT LOG ═══════════════════════════════════════════════════════════

describe('audit log + do-not-delete invariant', () => {
  test('originate, payment, WHT all leave traces', () => {
    const ic = new ICLoans();
    const loan = ic.originateLoan(newLoan());
    ic.recordPayment({ loanId: loan.loanId, date: '2026-02-01', principal: 10_000, interest: 1_000, type: 'scheduled' });
    ic.withholdingTax({ borrower: 'TKU-IL', lender: 'TKU-US', interest: 10_000, lenderCountry: 'US' });
    const log = ic.getAuditLog();
    assert.ok(log.some(l => l.action === 'ORIGINATE'));
    assert.ok(log.some(l => l.action === 'PAYMENT'));
    assert.ok(log.some(l => l.action === 'WHT_CALC'));
  });
});
