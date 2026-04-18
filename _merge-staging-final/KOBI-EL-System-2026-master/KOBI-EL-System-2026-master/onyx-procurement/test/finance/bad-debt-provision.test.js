/**
 * ============================================================================
 *  Unit tests — Bad Debt Provisioning (IFRS 9 ECL + Israeli Tax)
 *  Agent AG-Y089 — Techno-Kol Uzi ERP — 2026-04-11
 * ----------------------------------------------------------------------------
 *  Run:
 *    node --test onyx-procurement/test/finance/bad-debt-provision.test.js
 *
 *  Zero deps — pure node:test + node:assert/strict.
 *
 *  Coverage map:
 *    §A  Module surface
 *    §B  computeECL — Stage 1 / 2 / 3, bounds, DCF
 *    §C  agingMethod — provision matrix, edge cases
 *    §D  specificProvision — validation, accumulation
 *    §E  writeOffRequest — state machine
 *    §F  taxDeductibility — Israeli §17(4) scenarios
 *    §G  provisionMovement — opening + new − reversal − write-off = closing
 *    §H  backTest — calibration stats
 *    §I  forwardLookingAdjustment — macro factors
 *    §J  disclosureTable — IFRS 7 §35M table
 *    §K  Integration — "realistic" roll-forward scenario
 * ============================================================================
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const modulePath = path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'finance',
  'bad-debt-provision.js'
);

const {
  BadDebtProvision,
  IFRS9_STAGES,
  DEFAULT_LGD,
  ISRAELI_TAX_RULES,
  MACRO_FACTOR_WEIGHTS,
  WRITEOFF_STATES,
  stageFromAge,
  discountFactor,
  round2,
} = require(modulePath);

/* ------------------------------------------------------------- *
 * §A. Module surface                                            *
 * ------------------------------------------------------------- */

test('A1. module exports BadDebtProvision class', () => {
  assert.equal(typeof BadDebtProvision, 'function');
  const inst = new BadDebtProvision();
  assert.ok(inst instanceof BadDebtProvision);
});

test('A2. frozen constants exposed', () => {
  assert.ok(Object.isFrozen(IFRS9_STAGES));
  assert.ok(Object.isFrozen(DEFAULT_LGD));
  assert.ok(Object.isFrozen(ISRAELI_TAX_RULES));
  assert.ok(Object.isFrozen(MACRO_FACTOR_WEIGHTS));
});

test('A3. all required methods present', () => {
  const inst = new BadDebtProvision();
  const methods = [
    'computeECL',
    'agingMethod',
    'specificProvision',
    'writeOffRequest',
    'taxDeductibility',
    'provisionMovement',
    'backTest',
    'forwardLookingAdjustment',
    'disclosureTable',
  ];
  for (const m of methods) {
    assert.equal(typeof inst[m], 'function', 'missing method: ' + m);
  }
});

test('A4. stageFromAge helper classifies correctly', () => {
  assert.equal(stageFromAge('current'), 'STAGE_1');
  assert.equal(stageFromAge('0-30'), 'STAGE_1');
  assert.equal(stageFromAge('31-60'), 'STAGE_2');
  assert.equal(stageFromAge('61-90'), 'STAGE_2');
  assert.equal(stageFromAge('91-120'), 'STAGE_3');
  assert.equal(stageFromAge('default'), 'STAGE_3');
});

test('A5. discountFactor helper', () => {
  assert.equal(discountFactor(0, 1), 1);
  assert.equal(round2(discountFactor(0.05, 1)), 0.95); // 1/1.05 ≈ 0.9524 → 0.95
  assert.equal(round2(discountFactor(0.10, 2)), 0.83); // 1/1.21 ≈ 0.8264 → 0.83
});

/* ------------------------------------------------------------- *
 * §B. computeECL — IFRS 9 stages                                *
 * ------------------------------------------------------------- */

test('B1. Stage 1 (performing) — 12-month ECL', () => {
  const prov = new BadDebtProvision();
  const res = prov.computeECL({
    receivable: { id: 'INV-1', amount: 100000, customerId: 'C1' },
    probabilityDefault: 0.02,
    lossGivenDefault: 0.5,
    exposureAtDefault: 100000,
    discountRate: 0,
    ageBucket: 'current',
  });
  assert.equal(res.stage, 'STAGE_1');
  assert.equal(res.ecl, 1000); // 0.02 * 0.5 * 100000 = 1000
  assert.equal(res.horizonMonths, 12);
});

test('B2. Stage 2 (SICR) — lifetime ECL, higher loss', () => {
  const prov = new BadDebtProvision();
  const res = prov.computeECL({
    receivable: { id: 'INV-2', amount: 50000, customerId: 'C2' },
    probabilityDefault: 0.15,
    lossGivenDefault: 0.6,
    exposureAtDefault: 50000,
    discountRate: 0,
    ageBucket: '61-90',
  });
  assert.equal(res.stage, 'STAGE_2');
  assert.equal(res.ecl, 4500); // 0.15 * 0.6 * 50000 = 4500
  assert.equal(res.horizonMonths, null); // lifetime
});

test('B3. Stage 3 (credit-impaired) — full write-down', () => {
  const prov = new BadDebtProvision();
  const res = prov.computeECL({
    receivable: { id: 'INV-3', amount: 20000, customerId: 'C3' },
    probabilityDefault: 1.0,
    lossGivenDefault: 0.9,
    exposureAtDefault: 20000,
    discountRate: 0,
    ageBucket: 'default',
  });
  assert.equal(res.stage, 'STAGE_3');
  assert.equal(res.ecl, 18000); // 1 * 0.9 * 20000
});

test('B4. computeECL rejects PD > 1', () => {
  const prov = new BadDebtProvision();
  assert.throws(() =>
    prov.computeECL({
      receivable: { amount: 1000 },
      probabilityDefault: 1.5,
      lossGivenDefault: 0.5,
    })
  );
});

test('B5. computeECL rejects negative LGD', () => {
  const prov = new BadDebtProvision();
  assert.throws(() =>
    prov.computeECL({
      receivable: { amount: 1000 },
      probabilityDefault: 0.1,
      lossGivenDefault: -0.1,
    })
  );
});

test('B6. computeECL DCF reduces provision', () => {
  const prov = new BadDebtProvision({ defaultDiscountRate: 0.10 });
  const res = prov.computeECL({
    receivable: { amount: 100000 },
    probabilityDefault: 0.10,
    lossGivenDefault: 0.5,
    ageBucket: '91-120', // ≈ 1 year horizon
  });
  // undiscounted 5000, discounted ≈ 5000/1.1 ≈ 4545.45 → 4545.45
  assert.ok(res.ecl < 5000);
  assert.ok(res.ecl > 4500);
});

test('B7. computeECL defaults ageBucket to Stage 1', () => {
  const prov = new BadDebtProvision();
  const res = prov.computeECL({
    receivable: { amount: 1000 },
    probabilityDefault: 0.01,
    lossGivenDefault: 0.5,
    discountRate: 0,
  });
  assert.equal(res.stage, 'STAGE_1');
});

/* ------------------------------------------------------------- *
 * §C. agingMethod — provision matrix                            *
 * ------------------------------------------------------------- */

test('C1. agingMethod — canonical 4 buckets', () => {
  const prov = new BadDebtProvision();
  const res = prov.agingMethod({
    agingBuckets: {
      current: 500000,
      '31-60': 200000,
      '61-90': 100000,
      '>180': 50000,
    },
    historicalLossRates: {
      current: 0.005,
      '31-60': 0.03,
      '61-90': 0.10,
      '>180': 0.80,
    },
  });
  // 500000*0.005 + 200000*0.03 + 100000*0.10 + 50000*0.80
  // = 2500 + 6000 + 10000 + 40000 = 58500
  assert.equal(res.totals.gross, 850000);
  assert.equal(res.totals.provision, 58500);
  assert.equal(res.totals.net, 791500);
  assert.equal(res.rows.length, 4);
});

test('C2. agingMethod — falls back to default rates', () => {
  const prov = new BadDebtProvision();
  const res = prov.agingMethod({
    agingBuckets: { '>180': 100000 }, // default is 0.75
  });
  assert.equal(res.totals.provision, 75000);
});

test('C3. agingMethod — rejects invalid input', () => {
  const prov = new BadDebtProvision();
  assert.throws(() => prov.agingMethod({}));
});

test('C4. agingMethod — rows carry stage classification', () => {
  const prov = new BadDebtProvision();
  const res = prov.agingMethod({
    agingBuckets: { current: 100, '31-60': 100, '91-120': 100 },
  });
  const stages = res.rows.map((r) => r.stage);
  assert.deepEqual(stages, ['STAGE_1', 'STAGE_2', 'STAGE_3']);
});

/* ------------------------------------------------------------- *
 * §D. specificProvision                                         *
 * ------------------------------------------------------------- */

test('D1. specificProvision — requires all inputs', () => {
  const prov = new BadDebtProvision();
  assert.throws(() => prov.specificProvision({}));
  assert.throws(() =>
    prov.specificProvision({ customerId: 'C1', amount: 0, justification: 'x', approver: 'y' })
  );
  assert.throws(() =>
    prov.specificProvision({ customerId: 'C1', amount: 100, justification: 'x' })
  );
});

test('D2. specificProvision — accumulates, never overwrites', () => {
  const prov = new BadDebtProvision();
  prov.specificProvision({
    customerId: 'C1',
    amount: 1000,
    justification: 'Court judgment',
    approver: 'CFO',
    taxTrigger: 'COURT_JUDGMENT_UNENFORCED',
  });
  prov.specificProvision({
    customerId: 'C1',
    amount: 2000,
    justification: 'Updated',
    approver: 'CFO',
  });
  const list = prov.specificFor('C1');
  assert.equal(list.length, 2);
  assert.equal(list[0].amount, 1000);
  assert.equal(list[1].amount, 2000);
});

test('D3. specificProvision — returns frozen record with id', () => {
  const prov = new BadDebtProvision();
  const r = prov.specificProvision({
    customerId: 'C9',
    amount: 500,
    justification: 'Debtor untraceable',
    approver: 'Controller',
  });
  assert.ok(r.provisionId.startsWith('SP-'));
  assert.equal(r.amount, 500);
  assert.equal(r.type, 'SPECIFIC');
  assert.ok(Object.isFrozen(r));
});

/* ------------------------------------------------------------- *
 * §E. writeOffRequest — state machine                           *
 * ------------------------------------------------------------- */

test('E1. writeOffRequest starts DRAFT', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOffRequest('C1', { amount: 5000 });
  assert.equal(wo.state, WRITEOFF_STATES.DRAFT);
  assert.equal(wo.amount, 5000);
  assert.ok(wo.id.startsWith('WO-'));
});

test('E2. writeOffRequest full flow: draft → submit → approve → post', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOffRequest('C2', { amount: 10000 });
  wo.submit();
  assert.equal(wo.state, WRITEOFF_STATES.PENDING_APPROVAL);
  wo.approve('CFO');
  assert.equal(wo.state, WRITEOFF_STATES.APPROVED);
  wo.post();
  assert.equal(wo.state, WRITEOFF_STATES.POSTED);
  assert.equal(wo.approvals.length, 1);
  assert.equal(wo.approvals[0].approver, 'CFO');
  assert.equal(wo.stateHistory.length, 4);
});

test('E3. writeOffRequest reject path', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOffRequest('C3', { amount: 200 });
  wo.submit();
  wo.reject('Auditor', 'insufficient evidence');
  assert.equal(wo.state, WRITEOFF_STATES.REJECTED);
});

test('E4. writeOffRequest reversal (recovery)', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOffRequest('C4', { amount: 1000 });
  wo.submit();
  wo.approve('CFO');
  wo.post();
  wo.reverse('Debtor paid after legal pressure');
  assert.equal(wo.state, WRITEOFF_STATES.REVERSED);
  assert.equal(wo.reverseReason, 'Debtor paid after legal pressure');
});

/* ------------------------------------------------------------- *
 * §F. taxDeductibility — Israeli §17(4)                         *
 * ------------------------------------------------------------- */

test('F1. General reserve is NOT deductible — temporary difference', () => {
  const prov = new BadDebtProvision();
  const res = prov.taxDeductibility({
    type: 'GENERAL',
    amount: 10000,
    customerId: 'BULK',
  });
  assert.equal(res.deductible, false);
  assert.equal(res.temporaryDifference, 10000);
  assert.match(res.reason, /[Nn]ot deductible/);
  assert.ok(res.form6111Row);
});

test('F2. Provision-matrix output is not deductible', () => {
  const prov = new BadDebtProvision();
  const res = prov.taxDeductibility({
    type: 'MATRIX',
    amount: 58500,
  });
  assert.equal(res.deductible, false);
  assert.equal(res.temporaryDifference, 58500);
});

test('F3. Specific provision with BANKRUPTCY trigger + evidence → deductible', () => {
  const prov = new BadDebtProvision();
  const p = prov.specificProvision({
    customerId: 'C1',
    amount: 50000,
    justification: 'Customer bankruptcy',
    approver: 'CFO',
    taxTrigger: 'BANKRUPTCY',
    evidence: ['bankruptcy-filing.pdf', 'receiver-notice.pdf'],
  });
  const res = prov.taxDeductibility(p);
  assert.equal(res.deductible, true);
  assert.equal(res.temporaryDifference, 0);
  assert.match(res.reasonHe, /אבוד ספציפי/);
});

test('F4. Specific provision without trigger → not deductible', () => {
  const prov = new BadDebtProvision();
  const p = prov.specificProvision({
    customerId: 'C2',
    amount: 5000,
    justification: 'Customer slow to pay',
    approver: 'Controller',
  });
  const res = prov.taxDeductibility(p);
  assert.equal(res.deductible, false);
});

test('F5. Specific provision with DEBTOR_UNTRACEABLE trigger → deductible', () => {
  const prov = new BadDebtProvision();
  const p = prov.specificProvision({
    customerId: 'C3',
    amount: 7500,
    justification: 'Customer disappeared',
    approver: 'CFO',
    taxTrigger: 'DEBTOR_UNTRACEABLE',
    evidence: ['investigator-report.pdf'],
  });
  const res = prov.taxDeductibility(p);
  assert.equal(res.deductible, true);
});

test('F6. COURT_JUDGMENT_UNENFORCED trigger is deductible', () => {
  const prov = new BadDebtProvision();
  const p = prov.specificProvision({
    customerId: 'C4',
    amount: 30000,
    justification: 'Execution failed — no assets',
    approver: 'CFO',
    taxTrigger: 'COURT_JUDGMENT_UNENFORCED',
    evidence: ['execution-file-closed.pdf'],
  });
  const res = prov.taxDeductibility(p);
  assert.equal(res.deductible, true);
});

test('F7. GENERAL_RESERVE trigger is explicitly non-deductible', () => {
  const prov = new BadDebtProvision();
  const res = prov.taxDeductibility({
    type: 'SPECIFIC',
    amount: 1000,
    taxTrigger: 'GENERAL_RESERVE',
  });
  assert.equal(res.deductible, false);
});

test('F8. Missing evidence flags a condition — still deductible if event recognised', () => {
  const prov = new BadDebtProvision();
  const p = prov.specificProvision({
    customerId: 'C9',
    amount: 1000,
    justification: 'Bankruptcy',
    approver: 'CFO',
    taxTrigger: 'BANKRUPTCY',
    // no evidence
  });
  const res = prov.taxDeductibility(p);
  assert.equal(res.deductible, true);
  assert.ok(res.conditionsMissing.length > 0);
});

/* ------------------------------------------------------------- *
 * §G. provisionMovement — roll-forward                          *
 * ------------------------------------------------------------- */

test('G1. movement: opening + new − reversal − write-off = closing', () => {
  const prov = new BadDebtProvision();
  const m = prov.provisionMovement({
    opening: 100000,
    newProvisions: 25000,
    reversals: 5000,
    writeOffs: 10000,
    fx: 0,
    label: '2026-Q1',
  });
  // 100000 + 25000 - 5000 - 10000 = 110000
  assert.equal(m.closing, 110000);
  assert.equal(m.rows.length, 6);
  assert.equal(m.rows[0].amount, 100000);
  assert.equal(m.rows[5].label, 'Closing balance');
});

test('G2. movement with FX retranslation', () => {
  const prov = new BadDebtProvision();
  const m = prov.provisionMovement({
    opening: 50000,
    newProvisions: 10000,
    reversals: 0,
    writeOffs: 0,
    fx: 1500, // weaker shekel → higher foreign-currency provision
    label: '2026-Q2',
  });
  assert.equal(m.closing, 61500);
});

test('G3. movement — empty period defaults to zeros', () => {
  const prov = new BadDebtProvision();
  const m = prov.provisionMovement({});
  assert.equal(m.opening, 0);
  assert.equal(m.closing, 0);
});

/* ------------------------------------------------------------- *
 * §H. backTest                                                  *
 * ------------------------------------------------------------- */

test('H1. perfect prediction → MAPE 0, GREEN', () => {
  const prov = new BadDebtProvision();
  const r = prov.backTest({
    historicalProvisions: [1000, 2000, 3000],
    actualLosses: [1000, 2000, 3000],
  });
  assert.equal(r.mape, 0);
  assert.equal(r.status, 'GREEN');
  assert.equal(r.calibrationRatio, 1);
});

test('H2. 20% over-prediction → YELLOW', () => {
  const prov = new BadDebtProvision();
  const r = prov.backTest({
    historicalProvisions: [1200, 2400, 3600],
    actualLosses: [1000, 2000, 3000],
  });
  assert.equal(r.status, 'YELLOW');
  // calibration > 1 means over-provisioned
  assert.ok(r.calibrationRatio > 1);
});

test('H3. 50% under-prediction → RED', () => {
  const prov = new BadDebtProvision();
  const r = prov.backTest({
    historicalProvisions: [500, 1000, 1500],
    actualLosses: [1000, 2000, 3000],
  });
  assert.equal(r.status, 'RED');
  assert.ok(r.calibrationRatio < 1);
});

test('H4. backTest validates arrays length', () => {
  const prov = new BadDebtProvision();
  assert.throws(() =>
    prov.backTest({
      historicalProvisions: [1, 2],
      actualLosses: [1],
    })
  );
});

test('H5. backTest rejects empty input', () => {
  const prov = new BadDebtProvision();
  assert.throws(() =>
    prov.backTest({ historicalProvisions: [], actualLosses: [] })
  );
});

/* ------------------------------------------------------------- *
 * §I. forwardLookingAdjustment                                  *
 * ------------------------------------------------------------- */

test('I1. GDP pessimistic → PD increases', () => {
  const prov = new BadDebtProvision();
  const r = prov.forwardLookingAdjustment({
    macroFactor: 'GDP',
    scenario: 'pessimistic',
    basePd: 0.05,
  });
  assert.ok(r.adjustedPd > 0.05);
});

test('I2. GDP optimistic → PD decreases', () => {
  const prov = new BadDebtProvision();
  const r = prov.forwardLookingAdjustment({
    macroFactor: 'GDP',
    scenario: 'optimistic',
    basePd: 0.05,
  });
  assert.ok(r.adjustedPd < 0.05);
});

test('I3. unemployment pessimistic → larger upward shift', () => {
  const prov = new BadDebtProvision();
  const r = prov.forwardLookingAdjustment({
    macroFactor: 'unemployment',
    scenario: 'pessimistic',
    basePd: 0.10,
  });
  assert.ok(r.adjustedPd > 0.10);
});

test('I4. PD clamped to [0,1]', () => {
  const prov = new BadDebtProvision();
  const r = prov.forwardLookingAdjustment({
    macroFactor: 'GDP',
    scenario: 'pessimistic',
    basePd: 0.95, // big base → potentially > 1
  });
  assert.ok(r.adjustedPd <= 1);
  assert.ok(r.adjustedPd >= 0);
});

test('I5. unknown macroFactor throws', () => {
  const prov = new BadDebtProvision();
  assert.throws(() =>
    prov.forwardLookingAdjustment({ macroFactor: 'CPI', basePd: 0.1 })
  );
});

test('I6. baseCase returns same PD', () => {
  const prov = new BadDebtProvision();
  const r = prov.forwardLookingAdjustment({
    macroFactor: 'sector',
    scenario: 'baseCase',
    basePd: 0.05,
  });
  assert.equal(r.adjustedPd, 0.05);
});

/* ------------------------------------------------------------- *
 * §J. disclosureTable                                           *
 * ------------------------------------------------------------- */

test('J1. disclosureTable returns 3-stage structure', () => {
  const prov = new BadDebtProvision();
  const d = prov.disclosureTable({
    label: '2026-Q1',
    asOf: '2026-03-31',
    stage1: { grossCarrying: 1000000, ecl: 5000 },
    stage2: { grossCarrying: 200000, ecl: 12000 },
    stage3: { grossCarrying: 80000, ecl: 48000 },
  });
  assert.equal(d.rows.length, 3);
  assert.equal(d.totals.grossCarrying, 1280000);
  assert.equal(d.totals.ecl, 65000);
  assert.equal(d.totals.net, 1215000);
});

test('J2. disclosureTable coverage ratio', () => {
  const prov = new BadDebtProvision();
  const d = prov.disclosureTable({
    stage1: { grossCarrying: 1000000, ecl: 10000 },
    stage2: { grossCarrying: 0, ecl: 0 },
    stage3: { grossCarrying: 0, ecl: 0 },
  });
  // coverage = 10000/1000000 = 0.01
  assert.equal(d.rows[0].coverageRatio, 0.01);
  assert.equal(d.totals.coverageRatio, 0.01);
});

test('J3. disclosureTable bilingual headers', () => {
  const prov = new BadDebtProvision();
  const d = prov.disclosureTable({});
  assert.equal(d.headers.he.length, 6);
  assert.equal(d.headers.en.length, 6);
  assert.equal(d.titleHe.startsWith('גילוי'), true);
});

/* ------------------------------------------------------------- *
 * §K. Integration — realistic end-to-end                        *
 * ------------------------------------------------------------- */

test('K1. End-to-end scenario: matrix + specific + movement + disclosure', () => {
  const prov = new BadDebtProvision({
    defaultDiscountRate: 0.04,
    entity: 'Techno-Kol Uzi Ltd.',
    reportingCurrency: 'ILS',
  });

  // Step 1: aging matrix on trade portfolio
  const aging = prov.agingMethod({
    agingBuckets: {
      current: 2000000,
      '31-60': 400000,
      '61-90': 100000,
      '91-120': 50000,
    },
  });
  assert.ok(aging.totals.provision > 0);

  // Step 2: specific provision for a troubled customer
  const spec = prov.specificProvision({
    customerId: 'ABC-CONSTRUCTION',
    amount: 125000,
    justification: 'Customer filed for bankruptcy — creditors\' meeting scheduled',
    approver: 'CFO',
    taxTrigger: 'BANKRUPTCY',
    evidence: ['court-notice-2026-03-01.pdf'],
  });

  // Step 3: tax deductibility check on both
  const taxGeneral = prov.taxDeductibility({
    type: 'MATRIX',
    amount: aging.totals.provision,
  });
  assert.equal(taxGeneral.deductible, false);

  const taxSpecific = prov.taxDeductibility(spec);
  assert.equal(taxSpecific.deductible, true);

  // Step 4: movement roll-forward
  const m = prov.provisionMovement({
    opening: 250000,
    newProvisions: aging.totals.provision + spec.amount,
    reversals: 5000,
    writeOffs: 0,
    label: '2026-Q1',
  });
  assert.ok(m.closing > m.opening);

  // Step 5: disclosure table
  const d = prov.disclosureTable({
    label: '2026-Q1',
    stage1: { grossCarrying: 2000000, ecl: 10000 },
    stage2: { grossCarrying: 500000, ecl: 18000 },
    stage3: { grossCarrying: 125000, ecl: 125000 },
  });
  assert.equal(d.rows[2].coverageRatio, 1); // stage 3 fully covered
});

test('K2. Event log accumulates and is never cleared', () => {
  const prov = new BadDebtProvision();
  prov.agingMethod({ agingBuckets: { current: 1000 } });
  prov.specificProvision({
    customerId: 'X',
    amount: 100,
    justification: 'test',
    approver: 'me',
  });
  prov.provisionMovement({ opening: 100, newProvisions: 50 });

  const events = prov.events();
  assert.ok(events.length >= 3);
  // Events preserved in order
  assert.equal(events[0].type, 'AGING_MATRIX');
  assert.equal(events[1].type, 'SPECIFIC_PROVISION');
});

test('K3. Additive rule — specificFor returns immutable snapshot', () => {
  const prov = new BadDebtProvision();
  prov.specificProvision({
    customerId: 'Z',
    amount: 10,
    justification: 'x',
    approver: 'y',
  });
  const list1 = prov.specificFor('Z');
  list1.push({ rogue: true }); // mutate the returned copy
  const list2 = prov.specificFor('Z');
  assert.equal(list2.length, 1); // internal state intact
});

/* ============================================================= *
 *  §V2.  Agent Y-089 canonical API (upgrade — new methods)      *
 *                                                                *
 *  These tests exercise the new canonical API surface added on  *
 *  2026-04-11 under the additive rule                           *
 *  (לא מוחקים רק משדרגים ומגדלים). The original v1 tests        *
 *  above MUST keep passing (they do).                            *
 * ============================================================= */

/* ------------- V2.A  agingBuckets ------------- */

test('V2.A1. agingBuckets — splits AR list into 7 canonical buckets', () => {
  const prov = new BadDebtProvision();
  const ar = [
    { invoiceId: 'I1', customerId: 'C1', amount: 1000, dueDate: '2026-05-01' }, // future
    { invoiceId: 'I2', customerId: 'C1', amount: 2000, dueDate: '2026-04-01' }, // 10 dpd
    { invoiceId: 'I3', customerId: 'C2', amount: 3000, dueDate: '2026-02-20' }, // ~50 dpd
    { invoiceId: 'I4', customerId: 'C2', amount: 4000, dueDate: '2026-01-25' }, // ~76 dpd
    { invoiceId: 'I5', customerId: 'C3', amount: 5000, dueDate: '2025-12-01' }, // ~131 dpd
    { invoiceId: 'I6', customerId: 'C3', amount: 6000, dueDate: '2025-08-01' }, // ~253 dpd
    { invoiceId: 'I7', customerId: 'C4', amount: 7000, dueDate: '2024-05-01' }, // ~710 dpd
  ];
  const res = prov.agingBuckets(ar, { asOf: '2026-04-11' });
  assert.equal(res.total, 28000);
  assert.equal(res.invoiceCount, 7);
  assert.equal(res.buckets.current, 1000);
  assert.equal(res.buckets['0-30'], 2000);
  assert.equal(res.buckets['31-60'], 3000);
  assert.equal(res.buckets['61-90'], 4000);
  assert.equal(res.buckets['91-180'], 5000);
  assert.equal(res.buckets['181-365'], 6000);
  assert.equal(res.buckets['365+'], 7000);
  // bilingual labels present
  assert.equal(res.bucketLabels.he['365+'], '365 ימים ויותר');
});

test('V2.A2. agingBuckets — per-customer rollup', () => {
  const prov = new BadDebtProvision();
  const res = prov.agingBuckets([
    { invoiceId: 'I1', customerId: 'C1', amount: 1000, dueDate: '2026-04-01' },
    { invoiceId: 'I2', customerId: 'C1', amount: 2000, dueDate: '2026-02-01' },
    { invoiceId: 'I3', customerId: 'C2', amount: 500,  dueDate: '2026-04-10' },
  ], { asOf: '2026-04-11' });
  assert.equal(res.byCustomer.C1.total, 3000);
  assert.equal(res.byCustomer.C2.total, 500);
});

test('V2.A3. agingBuckets — accepts dict-shape AR snapshot', () => {
  const prov = new BadDebtProvision();
  const res = prov.agingBuckets({
    'INV-1': { customerId: 'C1', amount: 100, dueDate: '2026-04-10' },
    'INV-2': { customerId: 'C1', amount: 200, dueDate: '2026-04-10' },
  }, { asOf: '2026-04-11' });
  assert.equal(res.total, 300);
});

/* ------------- V2.B  historicalLossRate ------------- */

test('V2.B1. historicalLossRate — weighted per-bucket', () => {
  const prov = new BadDebtProvision();
  const h = prov.historicalLossRate([
    { asOf: '2025-Q4', buckets: { 'current': 100000, '31-60': 10000 }, losses: { 'current': 500, '31-60': 300 } },
    { asOf: '2025-Q3', buckets: { 'current': 200000, '31-60': 20000 }, losses: { 'current': 1500, '31-60': 700 } },
  ]);
  // current: (500+1500)/(100000+200000) = 2000/300000 = 0.0067
  // 31-60:  (300+700) / (10000+20000)   = 1000/30000  = 0.0333
  assert.equal(h.rates.current, 0.0067);
  assert.equal(h.rates['31-60'], 0.0333);
  assert.equal(h.sampleSize, 2);
});

test('V2.B2. historicalLossRate — rejects empty', () => {
  const prov = new BadDebtProvision();
  assert.throws(() => prov.historicalLossRate([]));
  assert.throws(() => prov.historicalLossRate(null));
});

/* ------------- V2.C  forwardLookingFactor ------------- */

test('V2.C1. forwardLookingFactor — baseline ≈ 1', () => {
  const prov = new BadDebtProvision();
  const flf = prov.forwardLookingFactor({
    macroIndicators: { gdpGrowth: 3, unemployment: 4, industryPmi: 50 },
  });
  assert.equal(flf.factor, 1);
  assert.equal(flf.regime, 'NEUTRAL');
});

test('V2.C2. forwardLookingFactor — recession → > 1 (ADVERSE)', () => {
  const prov = new BadDebtProvision();
  const flf = prov.forwardLookingFactor({
    macroIndicators: { gdpGrowth: -2, unemployment: 9, industryPmi: 42 },
  });
  assert.ok(flf.factor > 1);
  assert.equal(flf.regime, 'ADVERSE');
});

test('V2.C3. forwardLookingFactor — boom → < 1 (FAVOURABLE)', () => {
  const prov = new BadDebtProvision();
  const flf = prov.forwardLookingFactor({
    macroIndicators: { gdpGrowth: 6, unemployment: 2, industryPmi: 60 },
  });
  assert.ok(flf.factor < 1);
  assert.equal(flf.regime, 'FAVOURABLE');
});

/* ------------- V2.D  stageClassification ------------- */

test('V2.D1. stageClassification — performing → STAGE_1', () => {
  const prov = new BadDebtProvision();
  const s = prov.stageClassification({ customerId: 'C1', daysPastDue: 5 });
  assert.equal(s.stage, 'STAGE_1');
  assert.equal(s.lifetime, false);
});

test('V2.D2. stageClassification — DPD≥30 → STAGE_2 (SICR)', () => {
  const prov = new BadDebtProvision();
  const s = prov.stageClassification({ customerId: 'C2', daysPastDue: 45 });
  assert.equal(s.stage, 'STAGE_2');
  assert.equal(s.lifetime, true);
});

test('V2.D3. stageClassification — DPD≥90 → STAGE_3 (credit-impaired)', () => {
  const prov = new BadDebtProvision();
  const s = prov.stageClassification({ customerId: 'C3', daysPastDue: 120 });
  assert.equal(s.stage, 'STAGE_3');
});

test('V2.D4. stageClassification — bankruptcy → STAGE_3', () => {
  const prov = new BadDebtProvision();
  const s = prov.stageClassification({ customerId: 'C4', bankruptcy: true });
  assert.equal(s.stage, 'STAGE_3');
  assert.match(s.reasonsHe.join(' '), /פשיטת רגל/);
});

test('V2.D5. stageClassification — 2-notch downgrade → STAGE_2', () => {
  const prov = new BadDebtProvision();
  const s = prov.stageClassification({
    customerId: 'C5',
    rating: 'C',
    ratingAtOrigination: 'A',
  });
  assert.equal(s.stage, 'STAGE_2');
});

/* ------------- V2.E  computeECL (canonical signature) ------------- */

test('V2.E1. computeECL — canonical v2 shape {exposure,stage,PD,LGD,EAD,lifetime}', () => {
  const prov = new BadDebtProvision();
  const res = prov.computeECL({
    customerId: 'C1',
    exposure: 100000,
    stage: 'STAGE_1',
    PD: 0.02,
    LGD: 0.5,
    EAD: 100000,
    lifetime: false,
    discountRate: 0,
  });
  assert.equal(res.stage, 'STAGE_1');
  assert.equal(res.ecl, 1000);
  assert.equal(res.lifetime, false);
  assert.equal(res.horizonMonths, 12);
});

test('V2.E2. computeECL — 12m vs lifetime (Stage 1 vs Stage 2)', () => {
  const prov = new BadDebtProvision();
  const s1 = prov.computeECL({
    exposure: 100000, stage: 'STAGE_1',
    PD: 0.05, LGD: 0.5, EAD: 100000, lifetime: false, discountRate: 0,
  });
  const s2 = prov.computeECL({
    exposure: 100000, stage: 'STAGE_2',
    PD: 0.15, LGD: 0.5, EAD: 100000, lifetime: true, discountRate: 0,
  });
  assert.equal(s1.horizonMonths, 12);
  assert.equal(s2.horizonMonths, null); // lifetime
  assert.ok(s2.ecl > s1.ecl); // stage 2 is higher
});

test('V2.E3. computeECL — FLF multiplies ECL', () => {
  const prov = new BadDebtProvision();
  const base = prov.computeECL({
    exposure: 100000, PD: 0.1, LGD: 0.5, EAD: 100000, discountRate: 0,
  });
  const adverse = prov.computeECL({
    exposure: 100000, PD: 0.1, LGD: 0.5, EAD: 100000, discountRate: 0, flf: 1.5,
  });
  assert.equal(base.ecl, 5000);
  assert.equal(adverse.ecl, 7500);
});

/* ------------- V2.F  computeSimplifiedMatrix ------------- */

test('V2.F1. computeSimplifiedMatrix — per-customer provision matrix', () => {
  const prov = new BadDebtProvision();
  const res = prov.computeSimplifiedMatrix(
    {
      customerId: 'C1',
      buckets: {
        current: 10000,
        '31-60': 2000,
        '61-90': 1000,
        '91-180': 500,
      },
    },
    {
      current: 0.005,
      '31-60': 0.02,
      '61-90': 0.10,
      '91-180': 0.40,
    }
  );
  // 10000*0.005 + 2000*0.02 + 1000*0.10 + 500*0.40
  // = 50 + 40 + 100 + 200 = 390
  assert.equal(res.gross, 13500);
  assert.equal(res.ecl, 390);
  assert.equal(res.net, 13110);
  assert.equal(res.customerId, 'C1');
});

test('V2.F2. computeSimplifiedMatrix — rejects missing args', () => {
  const prov = new BadDebtProvision();
  assert.throws(() => prov.computeSimplifiedMatrix(null, {}));
  assert.throws(() => prov.computeSimplifiedMatrix({ buckets: {} }, null));
});

/* ------------- V2.G  provisionJournalEntry ------------- */

test('V2.G1. provisionJournalEntry — increase produces DR expense / CR allowance', () => {
  const prov = new BadDebtProvision();
  const je = prov.provisionJournalEntry(15000, 10000);
  assert.equal(je.delta, 5000);
  assert.equal(je.lines.length, 2);
  assert.equal(je.lines[0].debit, 5000);
  assert.equal(je.lines[0].accountName, 'Bad debt expense');
  assert.equal(je.lines[1].credit, 5000);
  assert.equal(je.lines[1].accountNameHe, 'הפרשה לחובות מסופקים (ניגוד לקוחות)');
  assert.equal(je.balanced, true);
});

test('V2.G2. provisionJournalEntry — decrease produces release entry', () => {
  const prov = new BadDebtProvision();
  const je = prov.provisionJournalEntry(8000, 10000);
  assert.equal(je.delta, -2000);
  assert.equal(je.lines[0].accountName, 'Allowance for doubtful accounts (contra-AR)');
  assert.equal(je.lines[0].debit, 2000);
  assert.equal(je.lines[1].accountName, 'Bad debt recovery / release');
  assert.equal(je.lines[1].credit, 2000);
});

test('V2.G3. provisionJournalEntry — zero delta produces no lines', () => {
  const prov = new BadDebtProvision();
  const je = prov.provisionJournalEntry(10000, 10000);
  assert.equal(je.delta, 0);
  assert.equal(je.lines.length, 0);
});

/* ------------- V2.H  writeOff + collectionEffort + 3-year rule ------------- */

test('V2.H1. writeOff with 3-year rule — blocked without effort history', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOff({
    customerId: 'C1',
    invoiceId: 'INV-1',
    amount: 5000,
    reason: 'Customer slow-pay',
  });
  // Meets rules = false because no effort recorded and no strong trigger
  assert.equal(wo.meetsIsraeliTaxRules, false);
  assert.equal(wo.amount, 5000);
  assert.ok(wo.id.startsWith('WO2-'));
});

test('V2.H2. writeOff — strong trigger (BANKRUPTCY) bypasses 3-year rule', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOff({
    customerId: 'C2',
    invoiceId: 'INV-2',
    amount: 50000,
    reason: 'Bankruptcy filed',
    triggerEvent: 'BANKRUPTCY',
  });
  assert.equal(wo.meetsIsraeliTaxRules, true);
});

test('V2.H3. writeOff — v1 getter signature still works (additive)', () => {
  const prov = new BadDebtProvision();
  // Using the v1 action writeOffRequest() still returns a record
  const wo1 = prov.writeOffRequest('C9', { amount: 100 });
  // And v2 getter by id still works
  const got = prov.writeOff(wo1.id);
  assert.equal(got.id, wo1.id);
});

test('V2.H4. collectionEffort — accumulates append-only history', () => {
  const prov = new BadDebtProvision();
  prov.collectionEffort('C1', [
    { type: 'phone', date: '2023-01-05', note: 'Left voicemail', by: 'Kobi' },
  ]);
  prov.collectionEffort('C1', [
    { type: 'letter', date: '2024-01-10', note: 'Demand letter', by: 'Kobi' },
  ]);
  const list = prov.getCollectionEfforts('C1');
  assert.equal(list.length, 2);
  assert.equal(list[0].type, 'phone');
  assert.equal(list[1].typeHe, 'מכתב דרישה');
});

test('V2.H5. writeOff — passes 3-year rule after long documented effort', () => {
  const prov = new BadDebtProvision();
  // Record an effort from 4 years ago
  const fourYearsAgoIso = new Date(Date.now() - 4 * 365 * 86_400_000).toISOString();
  prov.collectionEffort('C-OLD', [
    { type: 'lawyer-letter', date: fourYearsAgoIso, by: 'Legal' },
  ]);
  const wo = prov.writeOff({
    customerId: 'C-OLD',
    invoiceId: 'INV-OLD',
    amount: 1000,
    reason: 'Debt not recovered after 4 years of effort',
  });
  assert.equal(wo.meetsIsraeliTaxRules, true);
  assert.ok(wo.yearsSinceFirstEffort >= 3);
});

/* ------------- V2.I  recoveryTracking ------------- */

test('V2.I1. recoveryTracking — partial recovery', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOff({
    customerId: 'C1', invoiceId: 'INV-1', amount: 10000,
    reason: 'Bankruptcy', triggerEvent: 'BANKRUPTCY',
  });
  const rec = prov.recoveryTracking({
    writeOffId: wo.id,
    recoveredAmount: 3000,
    date: '2026-05-01',
  });
  assert.equal(rec.writeOff.recoveredAmount, 3000);
  assert.equal(rec.writeOff.reversed, false);
  assert.equal(rec.writeOff.state, 'PARTIALLY_RECOVERED');
  assert.equal(rec.journalEntry.lines[0].accountName, 'Cash / Bank');
  assert.equal(rec.journalEntry.lines[0].debit, 3000);
});

test('V2.I2. recoveryTracking — full recovery reverses write-off', () => {
  const prov = new BadDebtProvision();
  const wo = prov.writeOff({
    customerId: 'C2', invoiceId: 'INV-2', amount: 5000,
    reason: 'Bankruptcy', triggerEvent: 'BANKRUPTCY',
  });
  const rec = prov.recoveryTracking({
    writeOffId: wo.id, recoveredAmount: 5000, date: '2026-06-01',
  });
  assert.equal(rec.writeOff.recoveredAmount, 5000);
  assert.equal(rec.writeOff.reversed, true);
  assert.equal(rec.writeOff.state, 'REVERSED');
});

test('V2.I3. recoveryTracking — rejects unknown writeOffId', () => {
  const prov = new BadDebtProvision();
  assert.throws(() =>
    prov.recoveryTracking({ writeOffId: 'WO2-FAKE', recoveredAmount: 100 })
  );
});

/* ------------- V2.J  agingReport ------------- */

test('V2.J1. agingReport — bilingual rows + totals', () => {
  const prov = new BadDebtProvision();
  prov.setARSnapshot([
    { invoiceId: 'I1', customerId: 'C1', amount: 1000, dueDate: '2026-05-01' }, // future
    { invoiceId: 'I2', customerId: 'C1', amount: 2000, dueDate: '2026-02-20' }, // ~50 dpd
    { invoiceId: 'I3', customerId: 'C2', amount: 5000, dueDate: '2025-01-01' }, // 1+ year
  ]);
  const rep = prov.agingReport('2026-04-11');
  assert.equal(rep.total, 8000);
  assert.equal(rep.headers.he.length, 3);
  assert.ok(rep.rows.some((r) => r.bucket === 'current' && r.gross === 1000));
  assert.ok(rep.rows.some((r) => r.bucket === '365+' && r.gross === 5000));
  assert.equal(rep.titleHe.startsWith('דוח גיול'), true);
});

/* ------------- V2.K  stageMigration ------------- */

test('V2.K1. stageMigration — tracks improvements and deteriorations', () => {
  const prov = new BadDebtProvision();
  const mig = prov.stageMigration({
    label: '2026-Q1',
    from: { C1: 'STAGE_1', C2: 'STAGE_1', C3: 'STAGE_2', C4: 'STAGE_3' },
    to:   { C1: 'STAGE_2', C2: 'STAGE_1', C3: 'STAGE_1', C4: 'STAGE_3' },
  });
  assert.equal(mig.totalCustomers, 4);
  assert.equal(mig.stable, 2); // C2 and C4
  assert.equal(mig.improvements, 1); // C3: 2→1
  assert.equal(mig.deteriorations, 1); // C1: 1→2
  assert.equal(mig.matrix.STAGE_1.STAGE_2, 1);
  assert.equal(mig.matrix.STAGE_2.STAGE_1, 1);
});

/* ------------- V2.L  Ledger append-only rule ------------- */

test('V2.L1. append-only write-off ledger', () => {
  const prov = new BadDebtProvision();
  prov.writeOff({
    customerId: 'C1', invoiceId: 'I1', amount: 100,
    reason: 'Bankruptcy', triggerEvent: 'BANKRUPTCY',
  });
  prov.writeOff({
    customerId: 'C2', invoiceId: 'I2', amount: 200,
    reason: 'Bankruptcy', triggerEvent: 'BANKRUPTCY',
  });
  const ledger = prov.writeOffLedger();
  assert.equal(ledger.length, 2);
});

test('V2.L2. append-only provision journal ledger', () => {
  const prov = new BadDebtProvision();
  prov.provisionJournalEntry(1000, 0);
  prov.provisionJournalEntry(1500, 1000);
  const ledger = prov.journalLedger();
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0].delta, 1000);
  assert.equal(ledger[1].delta, 500);
});

/* ------------- V2.M  End-to-end integration ------------- */

test('V2.M1. End-to-end IFRS 9 ECL flow — aging→rates→matrix→ECL→journal', () => {
  const prov = new BadDebtProvision({ entity: 'Techno-Kol Uzi Ltd.' });

  // Step 1: historical loss rates
  const hlr = prov.historicalLossRate([
    { asOf: '2025-Q4', buckets: { current: 500000, '31-60': 80000, '91-180': 20000 },
                       losses: { current: 2500, '31-60': 2400, '91-180': 6000 } },
    { asOf: '2025-Q3', buckets: { current: 400000, '31-60': 60000, '91-180': 15000 },
                       losses: { current: 2000, '31-60': 1800, '91-180': 4500 } },
  ]);
  assert.ok(hlr.rates.current > 0);

  // Step 2: current AR snapshot
  const aging = prov.agingBuckets([
    { invoiceId: 'I1', customerId: 'ABC', amount: 100000, dueDate: '2026-04-15' },
    { invoiceId: 'I2', customerId: 'XYZ', amount: 40000,  dueDate: '2026-02-15' },
    { invoiceId: 'I3', customerId: 'XYZ', amount: 20000,  dueDate: '2025-11-01' },
  ], { asOf: '2026-04-11' });

  // Step 3: FLF
  const flf = prov.forwardLookingFactor({
    macroIndicators: { gdpGrowth: 2.5, unemployment: 4.5, industryPmi: 48 },
  });

  // Step 4: stage classification
  const xyz = prov.stageClassification({ customerId: 'XYZ', daysPastDue: 160 });
  assert.equal(xyz.stage, 'STAGE_3');

  // Step 5: ECL computation for impaired customer
  const ecl = prov.computeECL({
    customerId: 'XYZ',
    exposure: 60000,
    stage: xyz.stage,
    PD: 0.8,
    LGD: 0.7,
    EAD: 60000,
    lifetime: xyz.lifetime,
    flf: flf.factor,
    discountRate: 0,
  });
  assert.ok(ecl.ecl > 0);
  assert.equal(ecl.stage, 'STAGE_3');

  // Step 6: Journal entry
  const je = prov.provisionJournalEntry(ecl.ecl, 0);
  assert.ok(je.balanced);
  assert.ok(je.delta > 0);

  // Step 7: No customer data was destroyed
  assert.equal(aging.total, 160000);
});

test('V2.M2. Write-off → recovery end-to-end reverses cleanly', () => {
  const prov = new BadDebtProvision();
  // Document some efforts
  prov.collectionEffort('DEBTOR', [
    { type: 'phone', date: '2026-01-01' },
    { type: 'letter', date: '2026-02-01' },
  ]);
  const wo = prov.writeOff({
    customerId: 'DEBTOR',
    invoiceId: 'INV-99',
    amount: 7500,
    reason: 'Bankruptcy',
    triggerEvent: 'BANKRUPTCY',
  });
  assert.equal(wo.meetsIsraeliTaxRules, true);

  // Recovery
  const rec = prov.recoveryTracking({
    writeOffId: wo.id,
    recoveredAmount: 7500,
    date: '2027-01-01',
    note: 'Creditor dividend from liquidator',
    noteHe: 'דיבידנד מנאמן מפרק',
  });
  assert.equal(rec.writeOff.reversed, true);

  // Ledger preserves both the posted and the reversed version
  const ledger = prov.writeOffLedger();
  assert.ok(ledger.length >= 2); // original + recovery update
});
