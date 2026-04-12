/**
 * Unit tests for src/finance/debt-collection.js
 * Run with: node --test test/finance/debt-collection.test.js
 *
 * Coverage:
 *   • Constants, citations, ladder shape
 *   • escalationLadder — day-count progression, small-claims threshold,
 *     statute-of-limitations warning
 *   • recordAction — append-only, validation, history stability
 *   • generateLegalLetter — pre-suit / demand / court-summons, bilingual,
 *     disclaimer, citation, interest inclusion
 *   • computeLateInterest — 4% default, custom rate, zero days, ACT/365
 *   • promissoryNoteHandling — register + retrieve, overdue detection
 *   • executionOfficeRegistration — checklist shape
 *   • escrowedSettlement — discount pct, condition array
 *   • writeOff — journal entry balance, tax treatment, approver-role flag
 *   • recoveryLater — split excess, re-income journal entry
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../../src/finance/debt-collection.js');
const {
  DebtCollection,
  CONSTANTS,
  LAW_CITATIONS,
  ESCALATION_LADDER,
  LETTER_TYPES,
  ACTION_OUTCOMES,
  _internals,
} = mod;

// ══════════════════════════════════════════════════════════════════
// Constants & static shape
// ══════════════════════════════════════════════════════════════════

describe('constants & shape', () => {
  test('default court interest rate is 4%', () => {
    assert.equal(CONSTANTS.DEFAULT_COURT_INTEREST_RATE, 0.04);
  });

  test('small-claims cap is NIS 34,600 (2026)', () => {
    assert.equal(CONSTANTS.SMALL_CLAIMS_CAP_ILS, 34600);
  });

  test('statute of limitations is 7 years', () => {
    assert.equal(CONSTANTS.STATUTE_OF_LIMITATIONS_YEARS, 7);
  });

  test('day count basis is 365 (ACT/365)', () => {
    assert.equal(CONSTANTS.DAY_COUNT_BASIS, 365);
  });

  test('escalation ladder has exactly 9 steps', () => {
    assert.equal(ESCALATION_LADDER.length, 9);
  });

  test('ladder steps are strictly numbered 1..9', () => {
    for (let i = 0; i < ESCALATION_LADDER.length; i++) {
      assert.equal(ESCALATION_LADDER[i].step, i + 1);
    }
  });

  test('ladder steps 1..5 match the spec day offsets', () => {
    assert.equal(ESCALATION_LADDER[0].dayOffset, 60);
    assert.equal(ESCALATION_LADDER[1].dayOffset, 75);
    assert.equal(ESCALATION_LADDER[2].dayOffset, 90);
    assert.equal(ESCALATION_LADDER[3].dayOffset, 105);
    assert.equal(ESCALATION_LADDER[4].dayOffset, 120);
  });

  test('ladder has both Hebrew and English labels', () => {
    for (const s of ESCALATION_LADDER) {
      assert.ok(typeof s.he === 'string' && s.he.length > 0);
      assert.ok(typeof s.en === 'string' && s.en.length > 0);
    }
  });

  test('step 5 is מכתב התראה לפני תביעה', () => {
    assert.equal(ESCALATION_LADDER[4].key, 'legal_letter');
    assert.ok(ESCALATION_LADDER[4].he.includes('התראה'));
  });

  test('step 6 is small claims and carries the max-amount cap', () => {
    assert.equal(ESCALATION_LADDER[5].key, 'small_claims');
    assert.equal(ESCALATION_LADDER[5].maxAmountILS, 34600);
  });

  test('step 8 requires judgment or bill', () => {
    assert.equal(ESCALATION_LADDER[7].key, 'execution_office');
    assert.equal(ESCALATION_LADDER[7].requires, 'judgment_or_bill');
  });

  test('LAW_CITATIONS are bilingual', () => {
    assert.ok(LAW_CITATIONS.INTEREST_LAW.he.includes('ריבית'));
    assert.ok(LAW_CITATIONS.INTEREST_LAW.en.toLowerCase().includes('interest'));
    assert.ok(LAW_CITATIONS.EXECUTION_LAW.he.includes('הוצאה לפועל'));
  });

  test('LETTER_TYPES matches spec', () => {
    assert.deepEqual([...LETTER_TYPES].sort(), ['court-summons', 'demand', 'pre-suit']);
  });

  test('ACTION_OUTCOMES includes expected values', () => {
    assert.ok(ACTION_OUTCOMES.includes('sent'));
    assert.ok(ACTION_OUTCOMES.includes('partial_payment'));
    assert.ok(ACTION_OUTCOMES.includes('dispute_raised'));
    assert.ok(ACTION_OUTCOMES.includes('paid_in_full'));
  });

  test('module and ladder are frozen (rule of the house)', () => {
    assert.ok(Object.isFrozen(ESCALATION_LADDER));
    assert.ok(Object.isFrozen(CONSTANTS));
    assert.ok(Object.isFrozen(LAW_CITATIONS));
  });

  test('_internals exposes date helpers', () => {
    assert.equal(_internals.daysBetween('2026-01-01', '2026-01-11'), 10);
    assert.equal(_internals.isoDate('2026-04-11'), '2026-04-11');
  });
});

// ══════════════════════════════════════════════════════════════════
// escalationLadder
// ══════════════════════════════════════════════════════════════════

describe('escalationLadder', () => {
  function engine(today = '2026-04-11') {
    return new DebtCollection({ today });
  }

  test('throws when customerId missing', () => {
    assert.throws(() => engine().escalationLadder({ debtAmount: 1000 }), /customerId/);
  });

  test('throws on non-positive debtAmount', () => {
    assert.throws(
      () => engine().escalationLadder({ customerId: 'C1', debtAmount: 0 }),
      /debtAmount/
    );
    assert.throws(
      () => engine().escalationLadder({ customerId: 'C1', debtAmount: -5 }),
      /debtAmount/
    );
  });

  test('returns all 9 steps with reach/current flags', () => {
    const e = engine();
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 5000,
      dueDate: '2026-01-01', // ~100 days before today
    });
    assert.equal(out.steps.length, 9);
    assert.ok(out.currentStep === 0); // no actions recorded yet
    assert.ok(out.recommendedStep >= 1);
  });

  test('day-count progression: 60 days → step 1', () => {
    const e = engine('2026-04-11');
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 1000,
      dueDate: '2026-02-10', // exactly 60 days
    });
    assert.equal(out.daysOverdue, 60);
    assert.equal(out.recommendedStep, 1);
  });

  test('day-count progression: 75 days → step 2', () => {
    const e = engine('2026-04-11');
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 1000,
      dueDate: '2026-01-26', // 75 days
    });
    assert.equal(out.daysOverdue, 75);
    assert.equal(out.recommendedStep, 2);
  });

  test('day-count progression: 120 days → step 5 (legal letter)', () => {
    const e = engine('2026-04-11');
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 1000,
      dueDate: '2025-12-12', // 120 days
    });
    assert.equal(out.daysOverdue, 120);
    assert.equal(out.recommendedStep, 5);
  });

  test('small-claims threshold — eligible at 34,600', () => {
    const e = engine();
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 34600,
      dueDate: '2025-11-01',
    });
    assert.equal(out.smallClaimsEligible, true);
    assert.equal(out.warnings.length, 0);
  });

  test('small-claims threshold — NOT eligible at 34,601', () => {
    const e = engine();
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 34601,
      dueDate: '2025-11-01',
    });
    assert.equal(out.smallClaimsEligible, false);
    assert.ok(
      out.warnings.some((w) => w.includes('small-claims')),
      'expected small-claims warning'
    );
    // The small-claims step is marked unavailable.
    const step6 = out.steps.find((s) => s.key === 'small_claims');
    assert.equal(step6.available, false);
  });

  test('statute-of-limitations warning near 7 years', () => {
    const e = engine('2026-04-11');
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 5000,
      dueDate: '2019-04-01', // ~7 years old
    });
    assert.ok(
      out.warnings.some((w) => w.includes('statute-of-limitations')),
      'expected statute-of-limitations warning'
    );
  });

  test('returned object is frozen', () => {
    const e = engine();
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 1000,
      dueDate: '2026-02-10',
    });
    assert.ok(Object.isFrozen(out));
    assert.ok(Object.isFrozen(out.steps));
  });
});

// ══════════════════════════════════════════════════════════════════
// recordAction
// ══════════════════════════════════════════════════════════════════

describe('recordAction', () => {
  test('rejects invalid step', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () =>
        e.recordAction({
          customerId: 'C1',
          step: 0,
          date: '2026-04-01',
          outcome: 'sent',
        }),
      /step/
    );
    assert.throws(
      () =>
        e.recordAction({
          customerId: 'C1',
          step: 10,
          date: '2026-04-01',
          outcome: 'sent',
        }),
      /step/
    );
  });

  test('rejects invalid outcome', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () =>
        e.recordAction({
          customerId: 'C1',
          step: 1,
          date: '2026-04-01',
          outcome: 'unknown',
        }),
      /outcome/
    );
  });

  test('append-only: history is preserved across calls', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const r1 = e.recordAction({
      customerId: 'C1',
      step: 1,
      date: '2026-02-10',
      outcome: 'sent',
      notes: 'soft reminder email',
    });
    const r2 = e.recordAction({
      customerId: 'C1',
      step: 2,
      date: '2026-02-25',
      outcome: 'no_response',
    });
    const history = e.actionsFor('C1');
    assert.equal(history.length, 2);
    assert.equal(history[0].id, r1.id);
    assert.equal(history[1].id, r2.id);
    // Records are frozen.
    assert.ok(Object.isFrozen(history[0]));
    assert.throws(() => {
      history[0].outcome = 'hack';
    });
  });

  test('reached step bumps recommended step in escalationLadder', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    e.recordAction({
      customerId: 'C1',
      step: 3,
      date: '2026-03-01',
      outcome: 'no_response',
    });
    const out = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 5000,
      dueDate: '2026-02-10', // 60 days → normally step 1
    });
    // Already at step 3 — next recommendation is at least step 4.
    assert.equal(out.currentStep, 3);
    assert.ok(out.recommendedStep >= 4);
  });

  test('stores bilingual step labels', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const r = e.recordAction({
      customerId: 'C1',
      step: 5,
      date: '2026-04-10',
      outcome: 'sent',
    });
    assert.ok(r.stepHe.length > 0);
    assert.ok(r.stepEn.length > 0);
    assert.equal(r.stepKey, 'legal_letter');
  });
});

// ══════════════════════════════════════════════════════════════════
// generateLegalLetter
// ══════════════════════════════════════════════════════════════════

describe('generateLegalLetter', () => {
  test('rejects unknown type', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () =>
        e.generateLegalLetter({
          customerId: 'C1',
          debtAmount: 5000,
          type: 'nonsense',
        }),
      /type/
    );
  });

  test('pre-suit letter contains Hebrew + English + disclaimer + citation', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const ltr = e.generateLegalLetter({
      customerId: 'Customer-42',
      debtAmount: 12345.67,
      type: 'pre-suit',
      dueDate: '2025-12-01',
    });
    assert.ok(ltr.bodyHe.includes('מכתב התראה לפני תביעה'));
    assert.ok(ltr.bodyHe.includes('Customer-42'));
    assert.ok(ltr.bodyEn.includes('PRE-SUIT DEMAND LETTER'));
    assert.ok(ltr.bodyEn.includes('Customer-42'));
    assert.ok(ltr.disclaimer.he.includes('ייעוץ משפטי'));
    assert.ok(ltr.disclaimer.en.includes('legal advice'));
    assert.ok(
      ltr.citations.some((c) => c.he.includes('ריבית')),
      'expected interest law citation'
    );
  });

  test('demand letter is short and final', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const ltr = e.generateLegalLetter({
      customerId: 'C1',
      debtAmount: 10000,
      type: 'demand',
    });
    assert.ok(ltr.bodyHe.includes('מכתב דרישה סופית'));
    assert.ok(ltr.bodyEn.includes('FINAL DEMAND'));
  });

  test('court-summons includes draft warning and courts-law citation', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const ltr = e.generateLegalLetter({
      customerId: 'C1',
      debtAmount: 20000,
      type: 'court-summons',
    });
    assert.ok(ltr.bodyHe.includes('כתב תביעה'));
    assert.ok(ltr.bodyHe.includes('תבנית'));
    assert.ok(ltr.bodyEn.includes('STATEMENT OF CLAIM'));
    assert.ok(ltr.bodyEn.includes('template'));
    // Both citations are present for court-summons.
    assert.equal(ltr.citations.length, 2);
  });

  test('letter includes computed interest and total', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const ltr = e.generateLegalLetter({
      customerId: 'C1',
      debtAmount: 10000,
      type: 'pre-suit',
      dueDate: '2025-04-11', // exactly 1 year
    });
    // 10,000 × 4% × 365/365 = 400
    assert.ok(Math.abs(ltr.interestAmount - 400) < 0.01);
    assert.ok(Math.abs(ltr.total - 10400) < 0.01);
  });

  test('letter is persisted and retrievable via snapshot', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const ltr = e.generateLegalLetter({
      customerId: 'C1',
      debtAmount: 5000,
      type: 'pre-suit',
    });
    const snap = e.snapshot();
    assert.ok(snap.letters[ltr.id]);
    assert.equal(snap.letters[ltr.id].type, 'pre-suit');
  });
});

// ══════════════════════════════════════════════════════════════════
// computeLateInterest
// ══════════════════════════════════════════════════════════════════

describe('computeLateInterest', () => {
  test('default 4% over 1 year on 10,000 = 400', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const r = e.computeLateInterest({
      principal: 10000,
      periodStart: '2025-04-11',
    });
    assert.equal(r.rate, 0.04);
    assert.equal(r.days, 365);
    assert.ok(Math.abs(r.interestAmount - 400) < 0.01);
    assert.ok(Math.abs(r.totalDue - 10400) < 0.01);
  });

  test('default 4% over 30 days on 10,000 ≈ 32.88', () => {
    const e = new DebtCollection({ today: '2026-02-10' });
    const r = e.computeLateInterest({
      principal: 10000,
      periodStart: '2026-01-11',
    });
    assert.equal(r.days, 30);
    // 10,000 × 0.04 × 30/365 = 32.877…
    assert.ok(Math.abs(r.interestAmount - 32.88) < 0.01);
  });

  test('custom rate override works', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const r = e.computeLateInterest({
      principal: 10000,
      periodStart: '2025-04-11',
      rate: 0.06,
    });
    assert.equal(r.rate, 0.06);
    assert.ok(Math.abs(r.interestAmount - 600) < 0.01);
  });

  test('zero days yields zero interest', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const r = e.computeLateInterest({
      principal: 50000,
      periodStart: '2026-04-11',
    });
    assert.equal(r.days, 0);
    assert.equal(r.interestAmount, 0);
    assert.equal(r.totalDue, 50000);
  });

  test('rejects non-positive principal', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () => e.computeLateInterest({ principal: 0, periodStart: '2026-01-01' }),
      /principal/
    );
  });

  test('rejects negative rate', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () =>
        e.computeLateInterest({
          principal: 1000,
          periodStart: '2026-01-01',
          rate: -0.01,
        }),
      /rate/
    );
  });

  test('requires periodStart', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () => e.computeLateInterest({ principal: 1000 }),
      /periodStart/
    );
  });

  test('citation is attached', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const r = e.computeLateInterest({
      principal: 1000,
      periodStart: '2026-01-01',
    });
    assert.ok(r.citation.he.includes('ריבית'));
  });
});

// ══════════════════════════════════════════════════════════════════
// promissoryNoteHandling
// ══════════════════════════════════════════════════════════════════

describe('promissoryNoteHandling', () => {
  test('accepts string shortcut for customerId (empty result)', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const out = e.promissoryNoteHandling('C1');
    assert.equal(out.customerId, 'C1');
    assert.equal(out.notes.length, 0);
  });

  test('registers and retrieves a note', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const out1 = e.promissoryNoteHandling({
      customerId: 'C1',
      register: {
        amount: 15000,
        issueDate: '2026-01-01',
        dueDate: '2026-03-01',
      },
    });
    assert.equal(out1.notes.length, 1);
    assert.equal(out1.notes[0].amount, 15000);
    assert.equal(out1.notes[0].status, 'active');

    const out2 = e.promissoryNoteHandling('C1');
    assert.equal(out2.notes.length, 1);
    assert.ok(out2.analysis[0].isOverdue);
    assert.ok(out2.analysis[0].protestDue);
  });

  test('rejects non-positive note amount on register', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () =>
        e.promissoryNoteHandling({
          customerId: 'C1',
          register: { amount: 0, dueDate: '2026-01-01' },
        }),
      /amount/
    );
  });

  test('includes citation to Bills of Exchange Ordinance', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const out = e.promissoryNoteHandling('C1');
    assert.ok(out.citation.he.includes('השטרות'));
  });
});

// ══════════════════════════════════════════════════════════════════
// executionOfficeRegistration
// ══════════════════════════════════════════════════════════════════

describe('executionOfficeRegistration', () => {
  test('creates a case with checklist', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const c = e.executionOfficeRegistration({
      customerId: 'C1',
      judgmentId: 'J-999',
      amount: 50000,
      courtName: 'בית משפט השלום תל אביב',
      judgmentDate: '2026-03-15',
    });
    assert.equal(c.customerId, 'C1');
    assert.equal(c.judgmentId, 'J-999');
    assert.equal(c.status, 'opened');
    assert.ok(c.checklist.length >= 5);
    const steps = c.checklist.map((x) => x.step);
    assert.ok(steps.includes('judgment_copy'));
    assert.ok(steps.includes('application_form'));
    assert.ok(steps.includes('fee_payment'));
    assert.ok(c.citation.he.includes('הוצאה לפועל'));
  });

  test('requires both customerId and judgmentId', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () => e.executionOfficeRegistration({ customerId: 'C1' }),
      /judgmentId/
    );
    assert.throws(
      () => e.executionOfficeRegistration({ judgmentId: 'J-1' }),
      /customerId/
    );
  });

  test('case is retrievable via snapshot', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const c = e.executionOfficeRegistration({
      customerId: 'C1',
      judgmentId: 'J-1',
    });
    const snap = e.snapshot();
    assert.ok(snap.executionCases[c.id]);
  });
});

// ══════════════════════════════════════════════════════════════════
// escrowedSettlement
// ══════════════════════════════════════════════════════════════════

describe('escrowedSettlement', () => {
  test('computes discount percentage when originalDebt given', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const s = e.escrowedSettlement({
      customerId: 'C1',
      settleAmount: 8000,
      originalDebt: 10000,
      conditions: ['full payment within 14 days', 'signed release'],
    });
    assert.equal(s.settleAmount, 8000);
    assert.equal(s.originalDebt, 10000);
    assert.equal(s.discountPct, 20); // (1 - 8000/10000) * 100
    assert.equal(s.conditions.length, 2);
    assert.equal(s.status, 'escrowed');
  });

  test('accepts a single condition string', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const s = e.escrowedSettlement({
      customerId: 'C1',
      settleAmount: 5000,
      conditions: 'pay in 10 days',
    });
    assert.deepEqual([...s.conditions], ['pay in 10 days']);
  });

  test('rejects non-positive settleAmount', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () =>
        e.escrowedSettlement({
          customerId: 'C1',
          settleAmount: 0,
          conditions: 'x',
        }),
      /settleAmount/
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// writeOff
// ══════════════════════════════════════════════════════════════════

describe('writeOff', () => {
  test('records a balanced journal entry (debit = credit)', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 12000,
      reason: 'debtor insolvent',
      approver: 'cfo',
    });
    assert.equal(wo.status, 'written_off');
    assert.equal(wo.journalEntry.lines.length, 2);
    const debit = wo.journalEntry.lines.find((l) => l.side === 'debit');
    const credit = wo.journalEntry.lines.find((l) => l.side === 'credit');
    assert.equal(debit.amount, 12000);
    assert.equal(credit.amount, 12000);
    assert.equal(debit.amount, credit.amount);
    assert.equal(debit.account, 'bad_debt_expense');
    assert.ok(credit.account.startsWith('ar_'));
  });

  test('tax treatment flags income-tax and VAT correctly', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 5000,
      reason: 'no response after 1 year',
      approver: 'controller',
    });
    assert.equal(wo.taxTreatment.incomeTaxDeductible, true);
    assert.ok(wo.taxTreatment.incomeTaxCitation.he.includes('17(4)'));
    assert.equal(wo.taxTreatment.vatRelief, 'conditional');
    assert.ok(wo.taxTreatment.vatCitation.he.includes('49'));
  });

  test('flags unknown approver role', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 1000,
      reason: 'small',
      approver: 'intern', // not in WRITE_OFF_APPROVER_ROLES
    });
    assert.equal(wo.approverRoleValid, false);
    assert.ok(wo.warnings.length > 0);
  });

  test('cfo / controller / owner / auditor are accepted', () => {
    for (const role of CONSTANTS.WRITE_OFF_APPROVER_ROLES) {
      const e = new DebtCollection({ today: '2026-04-11' });
      const wo = e.writeOff({
        customerId: 'C1',
        amount: 1000,
        reason: 'r',
        approver: role,
      });
      assert.equal(wo.approverRoleValid, true, `expected ${role} to be valid`);
      assert.equal(wo.warnings.length, 0);
    }
  });

  test('rejects missing reason/approver', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () =>
        e.writeOff({
          customerId: 'C1',
          amount: 1000,
          approver: 'cfo',
        }),
      /reason/
    );
    assert.throws(
      () =>
        e.writeOff({
          customerId: 'C1',
          amount: 1000,
          reason: 'r',
        }),
      /approver/
    );
  });

  test('write-off is retained in snapshot (never deleted)', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 9999,
      reason: 'uncollectible',
      approver: 'cfo',
    });
    const snap = e.snapshot();
    assert.ok(snap.writeOffs[wo.id]);
    assert.equal(snap.writeOffs[wo.id].amount, 9999);
  });
});

// ══════════════════════════════════════════════════════════════════
// recoveryLater — post-write-off collection
// ══════════════════════════════════════════════════════════════════

describe('recoveryLater', () => {
  test('full recovery → income for entire amount, no excess', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 10000,
      reason: 'x',
      approver: 'cfo',
    });
    const r = e.recoveryLater({
      writeOffId: wo.id,
      recovered: 10000,
      date: '2026-06-01',
    });
    assert.equal(r.recovered, 10000);
    assert.equal(r.recoveredBookedAsIncome, 10000);
    assert.equal(r.excess, 0);
    // Journal: debit cash 10000, credit recovery income 10000.
    const debit = r.journalEntry.lines.find((l) => l.side === 'debit');
    assert.equal(debit.amount, 10000);
    const credits = r.journalEntry.lines.filter((l) => l.side === 'credit');
    const creditTotal = credits.reduce((s, l) => s + l.amount, 0);
    assert.equal(creditTotal, 10000);
  });

  test('partial recovery → income only for the collected portion', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 10000,
      reason: 'x',
      approver: 'cfo',
    });
    const r = e.recoveryLater({
      writeOffId: wo.id,
      recovered: 3000,
    });
    assert.equal(r.recoveredBookedAsIncome, 3000);
    assert.equal(r.excess, 0);
  });

  test('over-recovery (late interest) → split between income + other income', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 10000,
      reason: 'x',
      approver: 'cfo',
    });
    const r = e.recoveryLater({
      writeOffId: wo.id,
      recovered: 11000, // 1000 over
    });
    assert.equal(r.recovered, 11000);
    assert.equal(r.recoveredBookedAsIncome, 10000);
    assert.equal(r.excess, 1000);
    // Three journal lines: debit cash, credit recovery income, credit other income.
    assert.equal(r.journalEntry.lines.length, 3);
    const otherIncome = r.journalEntry.lines.find(
      (l) => l.account === 'other_income'
    );
    assert.equal(otherIncome.amount, 1000);
  });

  test('unknown writeOffId throws', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    assert.throws(
      () => e.recoveryLater({ writeOffId: 'WO-nonexistent', recovered: 100 }),
      /not found/
    );
  });

  test('rejects non-positive recovered', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 1000,
      reason: 'x',
      approver: 'cfo',
    });
    assert.throws(
      () => e.recoveryLater({ writeOffId: wo.id, recovered: 0 }),
      /recovered/
    );
  });

  test('recovery is tagged with income-tax citation', () => {
    const e = new DebtCollection({ today: '2026-04-11' });
    const wo = e.writeOff({
      customerId: 'C1',
      amount: 1000,
      reason: 'x',
      approver: 'cfo',
    });
    const r = e.recoveryLater({ writeOffId: wo.id, recovered: 1000 });
    assert.equal(r.taxTreatment.treatment, 'income');
    assert.ok(r.taxTreatment.citation.he.includes('17(4)'));
  });
});

// ══════════════════════════════════════════════════════════════════
// Integration — escalation flow
// ══════════════════════════════════════════════════════════════════

describe('integration: 60→120 day escalation sequence', () => {
  test('records soft → firm → phone → demand → legal in order', () => {
    const e = new DebtCollection({ today: '2026-06-01' });
    const steps = [
      { step: 1, date: '2026-02-01', outcome: 'sent' }, // 60d
      { step: 2, date: '2026-02-16', outcome: 'no_response' }, // 75d
      { step: 3, date: '2026-03-03', outcome: 'unreachable' }, // 90d
      { step: 4, date: '2026-03-18', outcome: 'no_response' }, // 105d
      { step: 5, date: '2026-04-02', outcome: 'sent' }, // 120d
    ];
    for (const s of steps) {
      e.recordAction({ customerId: 'C1', ...s });
    }
    const hist = e.actionsFor('C1');
    assert.equal(hist.length, 5);
    assert.deepEqual(hist.map((h) => h.step), [1, 2, 3, 4, 5]);
    assert.equal(hist[4].stepKey, 'legal_letter');

    const ladder = e.escalationLadder({
      customerId: 'C1',
      debtAmount: 20000,
      dueDate: '2025-12-03',
    });
    assert.equal(ladder.currentStep, 5);
    assert.ok(ladder.recommendedStep >= 6);
  });
});

// ══════════════════════════════════════════════════════════════════
// Agent Y-088 — Case-level workflow (createCase, friendlyReminder,
// formalDemand, lawyerLetter, hotza'ah, paymentPlan, recordPayment,
// computeInterest, statute, writeOffCase, closeCase, generateCaseFile)
// ══════════════════════════════════════════════════════════════════

const {
  CASE_STAGE_DEFS,
  CASE_CLOSE_STATUSES,
  FRIENDLY_REMINDER_METHODS,
  FORMAL_DEMAND_METHODS,
  LAWYER_FEE_TYPES,
} = mod;

function caseEngine(today = '2026-04-11') {
  return new DebtCollection({ today });
}

function openStandardCase(e, opts = {}) {
  return e.createCase({
    customerId: opts.customerId || 'CUST-Y088',
    invoices: opts.invoices || [
      { id: 'INV-001', amount: 6000, issueDate: '2025-11-01' },
      { id: 'INV-002', amount: 4000, issueDate: '2025-11-15' },
    ],
    totalAmount: opts.totalAmount || 10000,
    currency: opts.currency || 'ILS',
    dueDate: opts.dueDate || '2025-12-01',
  });
}

describe('Y-088 case workflow — createCase', () => {
  test('opens a case at stage 0 with principal = totalAmount', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.equal(c.stage, 0);
    assert.equal(c.stageKey, 'new');
    assert.equal(c.principal, 10000);
    assert.equal(c.balance, 10000);
    assert.equal(c.paymentsTotal, 0);
    assert.equal(c.status, 'open');
    assert.equal(c.invoices.length, 2);
    assert.equal(c.currency, 'ILS');
    assert.equal(c.customerId, 'CUST-Y088');
  });

  test('case record is fully frozen (append-only contract)', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.ok(Object.isFrozen(c));
    assert.ok(Object.isFrozen(c.invoices));
    assert.ok(Object.isFrozen(c.invoices[0]));
    assert.throws(() => {
      c.stage = 99;
    });
  });

  test('rejects missing customerId / invoices / totalAmount / dueDate', () => {
    const e = caseEngine();
    assert.throws(() => e.createCase({}), /customerId/);
    assert.throws(
      () => e.createCase({ customerId: 'A', totalAmount: 100, dueDate: '2026-01-01' }),
      /invoices/
    );
    assert.throws(
      () =>
        e.createCase({
          customerId: 'A',
          invoices: [{ amount: 100 }],
          dueDate: '2026-01-01',
          totalAmount: 0,
        }),
      /totalAmount/
    );
    assert.throws(
      () =>
        e.createCase({
          customerId: 'A',
          invoices: [{ amount: 100 }],
          totalAmount: 100,
        }),
      /dueDate/
    );
  });

  test('case event log starts with case_created', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    const events = e.caseEvents(c.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'case_created');
    assert.equal(events[0].stage, 0);
    assert.equal(events[0].amount, 10000);
  });
});

describe('Y-088 case workflow — stage progression', () => {
  test('friendlyReminder advances stage 0 → 1 and logs event', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    const out = e.friendlyReminder({
      caseId: c.id,
      method: 'email',
      leadDays: 7,
    });
    assert.equal(out.case.stage, 1);
    assert.equal(out.case.stageKey, 'friendly');
    assert.equal(out.event.type, 'friendly_reminder');
    assert.equal(out.event.method, 'email');
    assert.equal(out.event.leadDays, 7);
    assert.ok(out.event.messageHe.includes('להזכיר'));
    assert.ok(out.event.messageEn.includes('reminder'));
  });

  test('friendlyReminder rejects unknown method', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.throws(
      () => e.friendlyReminder({ caseId: c.id, method: 'carrier_pigeon' }),
      /method/
    );
  });

  test('friendlyReminder rejects negative leadDays', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.throws(
      () => e.friendlyReminder({ caseId: c.id, method: 'sms', leadDays: -1 }),
      /leadDays/
    );
  });

  test('formalDemand advances to stage 2 and generates a demand letter', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.friendlyReminder({ caseId: c.id, method: 'email' });
    const out = e.formalDemand({ caseId: c.id, method: 'registered_mail' });
    assert.equal(out.case.stage, 2);
    assert.equal(out.case.stageKey, 'formal');
    assert.ok(out.letter.bodyHe.includes('דרישה סופית'));
    assert.ok(out.letter.bodyEn.includes('FINAL DEMAND'));
    assert.equal(out.event.type, 'formal_demand');
    assert.ok(out.event.legalWarningHe.includes('תביעה'));
  });

  test('lawyerLetter advances to stage 3 and records lawyer + fee type', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.friendlyReminder({ caseId: c.id, method: 'email' });
    e.formalDemand({ caseId: c.id, method: 'registered_mail' });
    const out = e.lawyerLetter({
      caseId: c.id,
      lawyerId: 'LAW-COHEN',
      feeType: 'flat',
    });
    assert.equal(out.case.stage, 3);
    assert.equal(out.case.lawyerId, 'LAW-COHEN');
    assert.equal(out.event.feeType, 'flat');
    assert.ok(out.letter.bodyHe.includes('התראה לפני תביעה'));
  });

  test('lawyerLetter rejects unknown feeType', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.throws(
      () =>
        e.lawyerLetter({
          caseId: c.id,
          lawyerId: 'LAW-1',
          feeType: 'barter',
        }),
      /feeType/
    );
  });

  test("hotza'ah advances to stage 4 and records claimNumber + court", () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.friendlyReminder({ caseId: c.id, method: 'email' });
    e.formalDemand({ caseId: c.id, method: 'registered_mail' });
    e.lawyerLetter({ caseId: c.id, lawyerId: 'LAW-1', feeType: 'hourly' });
    const out = e.hotzaah({
      caseId: c.id,
      claimNumber: '01-12345-67-8',
      court: 'לשכת ההוצאה לפועל תל אביב',
    });
    assert.equal(out.case.stage, 4);
    assert.equal(out.case.stageKey, 'enforcement');
    assert.equal(out.case.claimNumber, '01-12345-67-8');
    assert.ok(out.case.court.includes('הוצאה'));
    assert.equal(out.event.type, 'hotzaah_filed');
    assert.ok(out.executionCase.id.startsWith('EO-'));
    assert.ok(out.event.citationHe.includes('הוצאה לפועל'));
  });

  test("hotza'ah requires claimNumber and court", () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.throws(
      () => e.hotzaah({ caseId: c.id, court: 'בית משפט' }),
      /claimNumber/
    );
    assert.throws(
      () => e.hotzaah({ caseId: c.id, claimNumber: '123' }),
      /court/
    );
  });

  test('stage-advancement methods throw on closed case', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.closeCase(c.id, 'uncollectible', 'debtor vanished');
    assert.throws(
      () => e.friendlyReminder({ caseId: c.id, method: 'email' }),
      /closed/
    );
    assert.throws(
      () => e.formalDemand({ caseId: c.id, method: 'email' }),
      /closed/
    );
  });
});

describe('Y-088 case workflow — interest compounding', () => {
  test('computeInterest applies 4% compound daily, A = P*(1+r/365)^n - P', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, {
      totalAmount: 100000,
      dueDate: '2025-04-11',
    });
    const r = e.computeInterest({ caseId: c.id });
    assert.equal(r.days, 365);
    assert.equal(r.rate, 0.04);
    assert.equal(r.basis, 'compound_daily');
    // (1 + 0.04/365)^365 − 1 ≈ 0.0408085
    const expected = Math.round(100000 * 0.0408085 * 100) / 100;
    assert.ok(
      Math.abs(r.interestAmount - expected) < 2,
      `expected ~${expected}, got ${r.interestAmount}`
    );
    // Simple-interest comparison should be ~4000 (always less than compound).
    assert.ok(Math.abs(r.simpleInterestComparison - 4000) < 0.5);
    assert.ok(r.interestAmount > r.simpleInterestComparison);
  });

  test('computeInterest zero days = zero interest', () => {
    const e = caseEngine('2025-12-01');
    const c = openStandardCase(e, { dueDate: '2025-12-01' });
    const r = e.computeInterest({ caseId: c.id });
    assert.equal(r.days, 0);
    assert.equal(r.interestAmount, 0);
  });

  test('computeInterest carries bilingual labels and formula', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    const r = e.computeInterest({ caseId: c.id });
    assert.ok(r.he.includes('ריבית'));
    assert.ok(r.en.includes('interest'));
    assert.equal(r.formula, 'A = P × (1 + r/365)^n − P');
    assert.ok(r.citation.he.includes('ריבית'));
  });

  test('computeInterest allows custom rate override', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, {
      totalAmount: 50000,
      dueDate: '2025-10-12',
    });
    const r = e.computeInterest({ caseId: c.id, rate: 0.08 });
    assert.equal(r.rate, 0.08);
    // Compound always > simple.
    assert.ok(r.interestAmount >= r.simpleInterestComparison);
  });
});

describe('Y-088 case workflow — statute of limitations', () => {
  test('statute returns not prescribed for fresh debt', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { dueDate: '2026-01-01' });
    const s = e.statute(c.id);
    assert.equal(s.prescribed, false);
    assert.equal(s.warning, false);
    assert.equal(s.statuteLimitYears, 7);
    assert.ok(s.he.includes('תקופת ההתיישנות'));
  });

  test('statute warns when close to 7-year limit', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { dueDate: '2020-01-01' });
    const s = e.statute(c.id);
    assert.equal(s.prescribed, false);
    assert.equal(s.warning, true);
    assert.ok(s.he.includes('אזהרה'));
  });

  test('statute marks debt as prescribed past 7 years', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { dueDate: '2018-01-01' });
    const s = e.statute(c.id);
    assert.equal(s.prescribed, true);
    assert.ok(s.he.includes('התיישן'));
    assert.ok(s.en.toLowerCase().includes('prescribed'));
    assert.ok(s.citation.he.includes('התיישנות'));
  });
});

describe('Y-088 case workflow — payment plan + payments', () => {
  test('paymentPlan with 0% interest splits evenly', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { totalAmount: 12000 });
    const plan = e.paymentPlan({
      caseId: c.id,
      installments: 6,
      startDate: '2026-05-01',
      interestRate: 0,
    });
    assert.equal(plan.installments, 6);
    assert.equal(plan.schedule.length, 6);
    assert.equal(plan.interest, 0);
    assert.equal(plan.perInstallment, 2000);
    assert.equal(plan.totalWithInterest, 12000);
    // Cadence: 30 days default.
    assert.equal(plan.schedule[0].dueDate, '2026-05-01');
    assert.equal(plan.schedule[1].dueDate, '2026-05-31');
  });

  test('paymentPlan with interest totals more than principal', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { totalAmount: 10000 });
    const plan = e.paymentPlan({
      caseId: c.id,
      installments: 12,
      startDate: '2026-05-01',
      interestRate: 0.04,
    });
    assert.ok(plan.interest > 0);
    assert.ok(plan.totalWithInterest > 10000);
    const sum = plan.schedule.reduce((a, x) => a + x.amount, 0);
    assert.ok(Math.abs(sum - plan.totalWithInterest) < 0.05);
  });

  test('paymentPlan rejects non-integer / zero installments', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.throws(
      () =>
        e.paymentPlan({ caseId: c.id, installments: 0, startDate: '2026-05-01' }),
      /installments/
    );
    assert.throws(
      () =>
        e.paymentPlan({
          caseId: c.id,
          installments: 1.5,
          startDate: '2026-05-01',
        }),
      /installments/
    );
  });

  test('recordPayment reduces the case balance', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { totalAmount: 10000 });
    const r1 = e.recordPayment({
      caseId: c.id,
      amount: 3000,
      date: '2026-04-02',
      method: 'wire',
      notes: 'partial',
    });
    assert.equal(r1.balance, 7000);
    assert.equal(r1.paymentsTotal, 3000);
    const r2 = e.recordPayment({
      caseId: c.id,
      amount: 2500,
      date: '2026-04-05',
      method: 'check',
    });
    assert.equal(r2.balance, 4500);
    assert.equal(r2.paymentsTotal, 5500);
    const after = e.getCase(c.id);
    assert.equal(after.balance, 4500);
    assert.equal(after.paymentsTotal, 5500);
  });

  test('recordPayment is append-only: history preserves all payments', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.recordPayment({ caseId: c.id, amount: 1000, date: '2026-04-01', method: 'cash' });
    e.recordPayment({ caseId: c.id, amount: 2000, date: '2026-04-02', method: 'wire' });
    e.recordPayment({ caseId: c.id, amount: 500, date: '2026-04-03', method: 'card' });
    const payments = e.casePayments(c.id);
    assert.equal(payments.length, 3);
    assert.deepEqual(payments.map((p) => p.amount), [1000, 2000, 500]);
    assert.ok(Object.isFrozen(payments));
    assert.ok(Object.isFrozen(payments[0]));
  });

  test('recordPayment clamps balance at zero for overpayment', () => {
    const e = caseEngine();
    const c = openStandardCase(e, { totalAmount: 1000 });
    const r = e.recordPayment({
      caseId: c.id,
      amount: 1500,
      date: '2026-04-10',
      method: 'wire',
    });
    assert.equal(r.balance, 0);
  });
});

describe('Y-088 case workflow — write-off + closeCase', () => {
  test('writeOffCase requires 3 years of documented effort', () => {
    const e = caseEngine('2026-04-11');
    // Debt is only ~4 months old — should fail the 3-year rule.
    const c = openStandardCase(e, { dueDate: '2025-12-01' });
    e.friendlyReminder({ caseId: c.id, method: 'email' });
    assert.throws(
      () =>
        e.writeOffCase({
          caseId: c.id,
          reason: 'debtor bankrupt',
          approver: 'controller',
        }),
      /3 years/
    );
  });

  test('writeOffCase succeeds on old debt with documented effort', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { dueDate: '2022-01-01' });
    e.friendlyReminder({ caseId: c.id, method: 'email' });
    e.formalDemand({ caseId: c.id, method: 'registered_mail' });
    const out = e.writeOffCase({
      caseId: c.id,
      reason: 'debtor insolvent',
      approver: 'cfo',
    });
    assert.ok(out.writeOff.id.startsWith('WO-'));
    assert.ok(out.effortYears >= 3);
    assert.equal(out.case.writeOffId, out.writeOff.id);
    // Journal entry must balance.
    const lines = out.writeOff.journalEntry.lines;
    const debit = lines
      .filter((l) => l.side === 'debit')
      .reduce((a, l) => a + l.amount, 0);
    const credit = lines
      .filter((l) => l.side === 'credit')
      .reduce((a, l) => a + l.amount, 0);
    assert.equal(debit, credit);
  });

  test('closeCase preserves record and freezes at stage 5', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e);
    e.friendlyReminder({ caseId: c.id, method: 'email' });
    e.recordPayment({
      caseId: c.id,
      amount: 10000,
      date: '2026-04-10',
      method: 'wire',
    });
    const closed = e.closeCase(c.id, 'paid', 'paid in full via wire');
    assert.equal(closed.stage, 5);
    assert.equal(closed.status, 'closed');
    assert.equal(closed.closeStatus, 'paid');
    assert.ok(closed.closedAt);
    // Record is still retrievable — nothing deleted.
    const fetched = e.getCase(c.id);
    assert.equal(fetched.id, c.id);
    assert.equal(fetched.closeStatus, 'paid');
    // All events preserved.
    const events = e.caseEvents(c.id);
    assert.ok(events.some((ev) => ev.type === 'case_closed'));
    assert.ok(events.some((ev) => ev.type === 'case_created'));
  });

  test('closeCase rejects unknown status', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    assert.throws(() => e.closeCase(c.id, 'gone', ''), /status/);
  });

  test('closeCase cannot double-close', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.closeCase(c.id, 'uncollectible', '');
    assert.throws(
      () => e.closeCase(c.id, 'paid', 'actually paid'),
      /closed/
    );
  });
});

describe('Y-088 case workflow — generateCaseFile', () => {
  test('generateCaseFile produces bilingual summary with all artifacts', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { totalAmount: 20000, dueDate: '2025-10-01' });
    e.friendlyReminder({ caseId: c.id, method: 'email' });
    e.formalDemand({ caseId: c.id, method: 'registered_mail' });
    e.lawyerLetter({ caseId: c.id, lawyerId: 'LAW-LEVI', feeType: 'hourly' });
    e.recordPayment({
      caseId: c.id,
      amount: 5000,
      date: '2026-03-15',
      method: 'wire',
    });
    e.paymentPlan({
      caseId: c.id,
      installments: 3,
      startDate: '2026-05-01',
      interestRate: 0.04,
    });
    const file = e.generateCaseFile(c.id);
    assert.ok(file.id.startsWith('FILE-'));
    assert.ok(file.headerHe.includes('תיק'));
    assert.ok(file.headerEn.toLowerCase().includes('case'));
    assert.ok(file.summaryHe.includes('CUST-Y088'));
    assert.ok(file.summaryEn.includes('CUST-Y088'));
    assert.equal(file.stageLadder.length, 6);
    assert.ok(file.events.length >= 5);
    assert.equal(file.payments.length, 1);
    assert.equal(file.paymentPlans.length, 1);
    assert.ok(file.interest);
    assert.ok(file.statute);
    assert.ok(file.citations.length >= 5);
    assert.ok(file.disclaimer.he.includes('ייעוץ משפטי'));
    assert.ok(file.disclaimer.en.includes('legal advice'));
  });

  test('generateCaseFile on a closed case still renders', () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.closeCase(c.id, 'settled', 'compromise settled out of court');
    const file = e.generateCaseFile(c.id);
    assert.equal(file.case.closeStatus, 'settled');
    assert.ok(file.summaryHe.includes('settled') || file.summaryHe.includes('סגירה'));
  });
});

describe('Y-088 case workflow — integration & rule enforcement', () => {
  test('full happy path: create → friendly → formal → lawyer → hotza\'ah → plan → payments → close', () => {
    const e = caseEngine('2026-04-11');
    const c = openStandardCase(e, { totalAmount: 30000, dueDate: '2025-09-01' });

    e.friendlyReminder({ caseId: c.id, method: 'sms', leadDays: 5 });
    e.formalDemand({ caseId: c.id, method: 'registered_mail' });
    e.lawyerLetter({ caseId: c.id, lawyerId: 'LAW-001', feeType: 'contingency' });
    e.hotzaah({
      caseId: c.id,
      claimNumber: '02-99999-88-7',
      court: 'לשכת ההוצאה לפועל ירושלים',
    });
    e.paymentPlan({
      caseId: c.id,
      installments: 6,
      startDate: '2026-05-01',
      interestRate: 0.04,
    });
    // Pay off in 6 wires.
    for (let i = 0; i < 6; i++) {
      e.recordPayment({
        caseId: c.id,
        amount: 5000,
        date: `2026-05-${String(1 + i).padStart(2, '0')}`,
        method: 'wire',
      });
    }
    const closed = e.closeCase(c.id, 'paid', 'paid in full via plan');
    assert.equal(closed.stage, 5);
    assert.equal(closed.balance, 0);
    assert.equal(closed.paymentsTotal, 30000);
    // Snapshot retains everything.
    const snap = e.snapshot();
    assert.ok(snap.cases[c.id]);
    assert.ok(snap.caseEvents[c.id].length >= 8);
    assert.equal(snap.casePayments[c.id].length, 6);
  });

  test("rule: 'לא מוחקים רק משדרגים ומגדלים' — closed case remains in registry", () => {
    const e = caseEngine();
    const c = openStandardCase(e);
    e.closeCase(c.id, 'written-off', 'uncollectible');
    const snap = e.snapshot();
    assert.ok(snap.cases[c.id]);
    assert.equal(snap.cases[c.id].closeStatus, 'written-off');
    // Events retain the creation row too.
    assert.ok(snap.caseEvents[c.id].length >= 2);
    assert.equal(snap.caseEvents[c.id][0].type, 'case_created');
  });

  test('stage constants export correctly with 6 bilingual stages', () => {
    assert.equal(CASE_STAGE_DEFS.length, 6);
    for (let i = 0; i < 6; i++) {
      assert.equal(CASE_STAGE_DEFS[i].stage, i);
      assert.ok(CASE_STAGE_DEFS[i].he.length > 0);
      assert.ok(CASE_STAGE_DEFS[i].en.length > 0);
    }
    assert.deepEqual(
      [...CASE_CLOSE_STATUSES].sort(),
      ['paid', 'settled', 'uncollectible', 'written-off']
    );
    assert.ok(FRIENDLY_REMINDER_METHODS.includes('email'));
    assert.ok(FORMAL_DEMAND_METHODS.includes('registered_mail'));
    assert.ok(LAWYER_FEE_TYPES.includes('contingency'));
  });
});
