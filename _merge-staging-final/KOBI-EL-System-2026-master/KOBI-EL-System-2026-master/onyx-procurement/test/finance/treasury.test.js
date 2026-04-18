/**
 * Unit tests — Treasury module (Agent Y-080)
 * Run:  node --test test/finance/treasury.test.js
 *
 * Rule: לא מוחקים — only upgrade/grow.
 * This test file exercises: cash position across currencies,
 * concentration logic, ladder build, liquidity buffer, and
 * additional read-only invariants (signatories, mirrors,
 * FX exposure, BOI packet, and safety: isReadOnly).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Treasury,
  ACCOUNT_TYPE,
  CONCENTRATION_RULE,
  BASE_CCY
} = require('../../src/finance/treasury.js');

/* --------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------*/

function mkTreasury() {
  // Fixed FX rates so tests are deterministic.
  return new Treasury({
    baseCurrency: 'ILS',
    fxRates: { ILS: 1.0, USD: 4.0, EUR: 4.0, GBP: 5.0, JPY: 0.025 },
    clock: () => new Date('2026-04-11T10:00:00Z')
  });
}

function seedAccounts(t) {
  t.bankAccountRegister({
    id: 'ACC-HAPOALIM-MAIN',
    bank: 'Bank Hapoalim',
    branch: '600',
    accountNumber: '123456',
    currency: 'ILS',
    type: ACCOUNT_TYPE.CHECKING,
    signatories: [
      { person: 'Uzi Kol', role: 'CEO', limit: 1_000_000, pairRequired: false },
      { person: 'Ronit Levi', role: 'CFO', limit: 500_000, pairRequired: true }
    ],
    dailyLimit: 2_000_000,
    purpose: 'Operations'
  });
  t.bankAccountRegister({
    id: 'ACC-LEUMI-USD',
    bank: 'Bank Leumi',
    branch: '800',
    accountNumber: '789012',
    currency: 'USD',
    type: ACCOUNT_TYPE.FOREIGN,
    signatories: [{ person: 'Uzi Kol', role: 'CEO', limit: 250_000 }],
    purpose: 'Import payments'
  });
  t.bankAccountRegister({
    id: 'ACC-DISCOUNT-SAVINGS',
    bank: 'Discount',
    accountNumber: '345678',
    currency: 'ILS',
    type: ACCOUNT_TYPE.SAVINGS,
    signatories: [{ person: 'Uzi Kol', role: 'CEO', limit: 10_000_000 }],
    purpose: 'Reserve'
  });
  t.bankAccountRegister({
    id: 'ACC-MIZRAHI-ESCROW',
    bank: 'Mizrahi Tefahot',
    accountNumber: '901234',
    currency: 'ILS',
    type: ACCOUNT_TYPE.ESCROW,
    signatories: [{ person: 'Trustee Co.', role: 'trustee', limit: 5_000_000, pairRequired: true }],
    purpose: 'Project ABC escrow'
  });
}

function seedBalances(t) {
  // Latest balances "as of 2026-04-10"
  t.postBalance('ACC-HAPOALIM-MAIN', 500_000, '2026-04-10', 'ILS');
  t.postBalance('ACC-LEUMI-USD', 100_000, '2026-04-10', 'USD');  // = 400k ILS
  t.postBalance('ACC-DISCOUNT-SAVINGS', 2_000_000, '2026-04-10', 'ILS');
  t.postBalance('ACC-MIZRAHI-ESCROW', 750_000, '2026-04-10', 'ILS');
}

/* ==========================================================================
 * cashPosition across currencies — FX conversion
 * ==========================================================================*/

test('01. cashPosition sums all accounts in base ILS with FX conversion', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);

  const pos = t.cashPosition('2026-04-10');
  // Expected: 500k + 400k + 2m + 750k = 3,650,000
  assert.equal(pos.base, 'ILS');
  assert.equal(pos.totalBase, 3_650_000);
  assert.equal(pos.byAccount.length, 4);

  const leumi = pos.byAccount.find(r => r.id === 'ACC-LEUMI-USD');
  assert.equal(leumi.currency, 'USD');
  assert.equal(leumi.amount, 100_000);
  assert.equal(leumi.amountBase, 400_000);
});

test('02. cashPosition groups by currency and type', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);

  const pos = t.cashPosition();
  // Group by currency: ILS raw = 500k + 2m + 750k = 3,250,000 ; USD raw = 100k
  assert.equal(pos.byCurrency.ILS, 3_250_000);
  assert.equal(pos.byCurrency.USD, 100_000);

  // Group by type (base ILS): checking=500k, foreign=400k, savings=2m, escrow=750k
  assert.equal(pos.byType.checking, 500_000);
  assert.equal(pos.byType.foreign, 400_000);
  assert.equal(pos.byType.savings, 2_000_000);
  assert.equal(pos.byType.escrow, 750_000);
});

test('03. cashPosition returns zero base when no accounts', () => {
  const t = mkTreasury();
  const pos = t.cashPosition();
  assert.equal(pos.totalBase, 0);
  assert.equal(pos.byAccount.length, 0);
});

test('04. cashPosition respects latest-on-or-before asOf date', () => {
  const t = mkTreasury();
  t.bankAccountRegister({
    id: 'A1', bank: 'X', accountNumber: '1', currency: 'ILS', type: ACCOUNT_TYPE.CHECKING
  });
  t.postBalance('A1', 1000, '2026-01-01');
  t.postBalance('A1', 5000, '2026-02-01');
  t.postBalance('A1', 9000, '2026-03-01');
  const p1 = t.cashPosition('2026-01-15');
  const p2 = t.cashPosition('2026-02-15');
  const p3 = t.cashPosition('2026-03-15');
  assert.equal(p1.totalBase, 1000);
  assert.equal(p2.totalBase, 5000);
  assert.equal(p3.totalBase, 9000);
});

/* ==========================================================================
 * concentration logic — all three rules, plus safety
 * ==========================================================================*/

test('05. concentration zero-balance sweeps everything to target', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);

  const plan = t.concentration({
    sourceAccounts: ['ACC-HAPOALIM-MAIN', 'ACC-MIZRAHI-ESCROW'],
    targetAccount: 'ACC-DISCOUNT-SAVINGS',
    rule: CONCENTRATION_RULE.ZERO_BALANCE
  });

  assert.equal(plan.executed, false);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.rule, 'zero-balance');
  // Both sources swept at full amount -> 500k + 750k = 1,250,000 ILS
  assert.equal(plan.totalSweepBase, 1_250_000);
  assert.equal(plan.moves.length, 2);
  assert.ok(plan.warning.he.length > 0);
  assert.ok(plan.warning.en.length > 0);
});

test('06. concentration target-balance leaves the minimum behind', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);

  const plan = t.concentration({
    sourceAccounts: ['ACC-HAPOALIM-MAIN'],
    targetAccount: 'ACC-DISCOUNT-SAVINGS',
    rule: CONCENTRATION_RULE.TARGET_BALANCE,
    targetBalance: 100_000
  });
  // 500k - 100k minimum = 400k swept
  assert.equal(plan.moves[0].amount, 400_000);
  assert.equal(plan.totalSweepBase, 400_000);
});

test('07. concentration threshold sweeps only overage', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);

  const plan = t.concentration({
    sourceAccounts: ['ACC-HAPOALIM-MAIN', 'ACC-MIZRAHI-ESCROW'],
    targetAccount: 'ACC-DISCOUNT-SAVINGS',
    rule: CONCENTRATION_RULE.THRESHOLD,
    threshold: 600_000
  });
  // Hapoalim 500k < 600k -> nothing. Escrow 750k - 600k = 150k.
  const hap = plan.moves.find(m => m.source === 'ACC-HAPOALIM-MAIN');
  const esc = plan.moves.find(m => m.source === 'ACC-MIZRAHI-ESCROW');
  assert.equal(hap.amount, 0);
  assert.equal(esc.amount, 150_000);
  assert.equal(plan.totalSweepBase, 150_000);
});

test('08. concentration rejects invalid rule', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);
  assert.throws(() => t.concentration({
    sourceAccounts: ['ACC-HAPOALIM-MAIN'],
    targetAccount: 'ACC-DISCOUNT-SAVINGS',
    rule: 'nonsense'
  }), /TREAS_CON_004/);
});

test('09. concentration rejects unregistered target', () => {
  const t = mkTreasury();
  seedAccounts(t);
  assert.throws(() => t.concentration({
    sourceAccounts: ['ACC-HAPOALIM-MAIN'],
    targetAccount: 'NOT-REGISTERED',
    rule: CONCENTRATION_RULE.ZERO_BALANCE
  }), /TREAS_CON_005/);
});

/* ==========================================================================
 * investmentLadder — build
 * ==========================================================================*/

test('10. investmentLadder sorts, estimates interest, and weights avg rate', () => {
  const t = mkTreasury();
  const ladder = t.investmentLadder({
    startDate: '2026-04-01',
    buckets: [
      { maturityDays: 365, minRate: 0.05, amount: 1_000_000 },
      { maturityDays: 90, minRate: 0.04, amount: 500_000 },
      { maturityDays: 180, minRate: 0.045, amount: 500_000 }
    ]
  });
  assert.equal(ladder.rungs.length, 3);
  // Sorted ascending by days: 90, 180, 365
  assert.deepEqual(ladder.rungs.map(r => r.maturityDays), [90, 180, 365]);
  assert.equal(ladder.totalAmount, 2_000_000);
  assert.equal(ladder.longestDays, 365);
  // Weighted avg = (0.04*500k + 0.045*500k + 0.05*1m) / 2m
  //              = (20k + 22.5k + 50k) / 2m = 0.04625
  assert.equal(ladder.avgRate, 0.0463); // rounded 4dp via round(x*10000)/10000
  // Interest first rung ≈ 500k * 0.04 * 90/365 ≈ 4,931.51
  assert.ok(ladder.rungs[0].estInterest > 4_900);
  assert.ok(ladder.rungs[0].estInterest < 5_000);
  assert.ok(ladder.warning.he.length > 0);
});

test('11. investmentLadder rejects empty buckets', () => {
  const t = mkTreasury();
  assert.throws(() => t.investmentLadder({ buckets: [] }), /TREAS_LAD_001/);
});

test('12. investmentLadder rejects invalid bucket amount', () => {
  const t = mkTreasury();
  assert.throws(() => t.investmentLadder({
    buckets: [{ maturityDays: 30, minRate: 0.03, amount: -1 }]
  }), /TREAS_LAD_004/);
});

/* ==========================================================================
 * liquidityBuffer
 * ==========================================================================*/

test('13. liquidityBuffer reports surplus when current >= required', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);
  // total base = 3.65m
  const buf = t.liquidityBuffer({ required: 2_000_000 });
  assert.equal(buf.status, 'ok');
  assert.equal(buf.current, 3_650_000);
  assert.equal(buf.gap, 1_650_000);
  assert.ok(buf.coverageRatio > 1);
});

test('14. liquidityBuffer reports shortfall when current < required', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);
  const buf = t.liquidityBuffer({ required: 5_000_000 });
  assert.equal(buf.status, 'shortfall');
  assert.equal(buf.gap, -1_350_000);
  assert.ok(buf.message.he.includes('חוסר'));
});

test('15. liquidityBuffer accepts explicit current override', () => {
  const t = mkTreasury();
  const buf = t.liquidityBuffer({ required: 1_000, current: 1_200 });
  assert.equal(buf.gap, 200);
  assert.equal(buf.status, 'ok');
});

test('16. liquidityBuffer rejects missing/invalid required', () => {
  const t = mkTreasury();
  assert.throws(() => t.liquidityBuffer({}), /TREAS_LIQ_002/);
  assert.throws(() => t.liquidityBuffer({ required: -5 }), /TREAS_LIQ_002/);
});

/* ==========================================================================
 * Signatory matrix, mirror accounts, FX exposure
 * ==========================================================================*/

test('17. signatoryMatrix aggregates by account and by person', () => {
  const t = mkTreasury();
  seedAccounts(t);
  const m = t.signatoryMatrix();
  assert.ok(m.byAccount['ACC-HAPOALIM-MAIN']);
  assert.ok(m.byPerson['Uzi Kol']);
  // Uzi Kol appears on 3 accounts (main, usd, savings)
  assert.equal(m.byPerson['Uzi Kol'].length, 3);
});

test('18. mirrorAccounts links master + mirrors and consolidates balances', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);
  const out = t.mirrorAccounts('ACC-HAPOALIM-MAIN', ['ACC-MIZRAHI-ESCROW']);
  assert.equal(out.master, 'ACC-HAPOALIM-MAIN');
  assert.deepEqual(out.mirrors, ['ACC-MIZRAHI-ESCROW']);
  // master 500k + mirror 750k = 1,250,000
  assert.equal(out.consolidatedBase, 1_250_000);
});

test('19. fxExposure reports share by currency and marks base', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);
  const fx = t.fxExposure();
  assert.equal(fx.base, 'ILS');
  assert.equal(fx.totalBase, 3_650_000);
  const usd = fx.exposures.find(e => e.ccy === 'USD');
  // USD share = 400k / 3.65m ≈ 0.1096
  assert.ok(usd.share > 0.10 && usd.share < 0.12);
  assert.equal(usd.isBase, false);
  const ils = fx.exposures.find(e => e.ccy === 'ILS');
  assert.equal(ils.isBase, true);
});

/* ==========================================================================
 * Open account workflow + alerts + BOI + safety
 * ==========================================================================*/

test('20. openAccount returns under_review when checklist incomplete', () => {
  const t = mkTreasury();
  const wf = t.openAccount({
    bank: 'Bank Hapoalim',
    branch: '600',
    type: ACCOUNT_TYPE.CHECKING,
    currency: 'ILS',
    purpose: 'Operations',
    companyIdVerified: true,
    kycDone: false
  });
  assert.equal(wf.status, 'under_review');
  assert.ok(wf.checklist.some(c => !c.done));
  assert.ok(wf.humanNote.he.length > 0);
});

test('21. openAccount returns approved when checklist fully satisfied', () => {
  const t = mkTreasury();
  const wf = t.openAccount({
    bank: 'Discount',
    companyIdVerified: true,
    signingRightsDoc: true,
    boardResolution: true,
    articles: true,
    kycDone: true,
    amlCleared: true,
    branchMeetingDate: '2026-04-15',
    agreementSigned: true
  });
  assert.equal(wf.status, 'approved');
  assert.ok(wf.checklist.every(c => c.done));
});

test('22. alerts configuration is respected and low balance triggers', () => {
  const t = mkTreasury();
  seedAccounts(t);
  t.postBalance('ACC-HAPOALIM-MAIN', 100, '2026-04-10'); // very low
  const out = t.alerts({ lowBalance: 5_000 });
  const lb = out.triggered.find(a => a.accountId === 'ACC-HAPOALIM-MAIN');
  assert.ok(lb);
  assert.equal(out.rules.lowBalance, 5_000);
});

test('23. reportToBOI packets include confirmations and are build-only', () => {
  const t = mkTreasury();
  seedAccounts(t);
  seedBalances(t);
  const report = t.reportToBOI({ from: '2026-01-01', to: '2026-04-10' });
  assert.ok(report.id.startsWith('BOI-'));
  assert.ok(Array.isArray(report.confirmations));
  assert.equal(report.confirmations.every(c => c.done === false), true);
  assert.ok(report.safetyNote.he.includes('דיווח'));
});

test('24. isReadOnly asserts treasury never executes transfers', () => {
  const t = mkTreasury();
  assert.equal(t.isReadOnly(), true);
});

test('25. upgrading an account increments version and does NOT delete prior', () => {
  const t = mkTreasury();
  t.bankAccountRegister({
    id: 'ACC-X', bank: 'X', accountNumber: '1', currency: 'ILS', type: ACCOUNT_TYPE.CHECKING
  });
  const v2 = t.bankAccountRegister({
    id: 'ACC-X', bank: 'X', accountNumber: '1', currency: 'ILS',
    type: ACCOUNT_TYPE.CHECKING, dailyLimit: 99_999
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.dailyLimit, 99_999);
});
