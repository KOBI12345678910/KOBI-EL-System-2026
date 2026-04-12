/**
 * Options Vesting & Israeli Section 102 Tracker — Unit Tests
 * Agent Y-073 • Techno-Kol Uzi • Swarm HR/Tax
 *
 * Run with:
 *    node --test onyx-procurement/test/hr/options-vesting.test.js
 *
 * Zero external dependencies. Covers:
 *   - grant registration + track validation
 *   - monthly / quarterly / yearly schedule with cliff
 *   - pre-cliff vs post-cliff vesting
 *   - explicit-tranches override
 *   - cash / cashless / swap exercise
 *   - 102 capital track 24-month lockup (both branches)
 *   - 102 ordinary track
 *   - 3(i) consultants track
 *   - surtax (mas yesef) on high earners
 *   - trustee transfer + lockup-end date
 *   - acceleration on termination / death / change-of-control
 *   - 83(b)-equivalent pre-IPO FMV declaration
 *   - form 161 equity-addendum generator
 *   - PDF surrogate contents
 *   - append-only ledger invariant
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(__dirname, '..', '..', 'src', 'hr', 'options-vesting.js'));
const { OptionsVesting, CONSTANTS_2026, LABELS_HE, _internals } = mod;

// ─── Fixture helpers ────────────────────────────────────────────────
function newEngine() {
  return new OptionsVesting();
}

function baseGrant(overrides = {}) {
  return {
    employeeId: 'emp-001',
    type: 'NSO',
    shares: 4800,
    strike: 10,
    grantDate: '2024-01-01T00:00:00.000Z',
    vestingSchedule: {
      totalMonths: 48,
      cliffMonths: 12,
      frequency: 'monthly',
    },
    trackType: '102-capital',
    trustee: 'IBI-Trust-Ltd',
    fmvAtGrant: 12,
    ...overrides,
  };
}

// ─── 1. grantOption: validation & registration ──────────────────────
test('grantOption: rejects unknown type', () => {
  const eng = newEngine();
  assert.throws(() => eng.grantOption(baseGrant({ type: 'FUNKY' })), /type must be/);
});

test('grantOption: rejects unknown trackType', () => {
  const eng = newEngine();
  assert.throws(() => eng.grantOption(baseGrant({ trackType: '102-fun' })), /trackType must be/);
});

test('grantOption: requires positive shares', () => {
  const eng = newEngine();
  assert.throws(() => eng.grantOption(baseGrant({ shares: 0 })), /shares must be > 0/);
});

test('grantOption: produces an id and ledger entry', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  assert.ok(g.id, 'grant id present');
  assert.equal(g.tranches.length > 0, true);
  const ledger = eng.ledgerFor(g.id);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].type, 'grant');
});

// ─── 2. Vesting schedule: cliff + monthly / quarterly / explicit ────
test('computeVested: pre-cliff returns 0', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const snap = eng.computeVested(g.id, '2024-06-01T00:00:00.000Z'); // 5 months in
  assert.equal(snap.vested, 0);
  assert.equal(snap.beforeCliff, true);
  assert.equal(snap.unvested, 4800);
});

test('computeVested: at cliff releases 1/4 of a 48mo grant', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const snap = eng.computeVested(g.id, '2025-01-01T00:00:00.000Z'); // +12mo
  // cliff block = 12 tranches of 100 each = 1200
  assert.equal(snap.vested, 1200);
  assert.equal(snap.beforeCliff, false);
});

test('computeVested: mid-vest (2-year mark) returns half', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const snap = eng.computeVested(g.id, '2026-01-01T00:00:00.000Z'); // +24mo
  assert.equal(snap.vested, 2400);
  assert.equal(snap.unvested, 2400);
});

test('computeVested: fully vested after totalMonths', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const snap = eng.computeVested(g.id, '2028-02-01T00:00:00.000Z'); // +49mo
  assert.equal(snap.vested, 4800);
  assert.equal(snap.unvested, 0);
  assert.equal(snap.exercisable, 4800);
});

test('computeVested: quarterly schedule', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({
    shares: 4000,
    vestingSchedule: { totalMonths: 48, cliffMonths: 12, frequency: 'quarterly' },
  }));
  // 16 quarters, 250/quarter; at 24mo = 8 quarters = 2000
  const snap = eng.computeVested(g.id, '2026-01-01T00:00:00.000Z');
  assert.equal(snap.vested, 2000);
});

test('computeVested: explicit tranches override', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({
    shares: 1500,
    vestingSchedule: {
      tranches: [
        { date: '2024-12-31', shares: 500 },
        { date: '2025-12-31', shares: 500 },
        { date: '2026-12-31', shares: 500 },
      ],
    },
  }));
  assert.equal(g.tranches.length, 3);
  const snap = eng.computeVested(g.id, '2025-06-30');
  assert.equal(snap.vested, 500);
});

// ─── 3. Exercise mechanics ──────────────────────────────────────────
test('exercise: rejects beyond vested', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  assert.throws(
    () => eng.exercise(g.id, 2000, 'cash', { asOfDate: '2025-01-01', fmv: 20 }),
    /cannot exercise/,
  );
});

test('exercise: cash outlay matches strike x shares', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const res = eng.exercise(g.id, 1000, 'cash', { asOfDate: '2026-02-01', fmv: 20 });
  assert.equal(res.cashOutlay, 10_000);
  assert.equal(res.sharesReceived, 1000);
  assert.equal(res.spread, 10_000);
});

test('exercise: cashless keeps net shares only', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const res = eng.exercise(g.id, 1000, 'cashless', { asOfDate: '2026-02-01', fmv: 20 });
  assert.equal(res.cashOutlay, 0);
  // cost 10_000 / fmv 20 = 500 shares sold, 500 kept
  assert.equal(res.sharesReceived, 500);
});

test('exercise: swap surrenders enough owned shares', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const res = eng.exercise(g.id, 1000, 'swap', { asOfDate: '2026-02-01', fmv: 20 });
  assert.equal(res.sharesReceived, 1000);
  assert.equal(res.surrenderedShares, 500);
});

// ─── 4. Tax: Section 102 capital — lockup path ──────────────────────
test('computeTaxOnExercise: 102-capital satisfied → 25% on capital portion', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({ strike: 5, fmvAtGrant: 8 }));
  // 30mo later — lockup satisfied (24mo)
  const tax = eng.computeTaxOnExercise({
    grant: g,
    fmv: 50,
    exerciseDate: '2026-07-01',
    shares: 1000,
  });
  assert.equal(tax.lockupSatisfied, true);
  // ordinary portion = (8-5) * 1000 = 3000
  assert.equal(tax.components.ordinaryPortion, 3000);
  // capital portion = (50-5)*1000 - 3000 = 42_000
  assert.equal(tax.components.capitalPortion, 42_000);
  // 25 % of capital portion = 10_500
  assert.equal(tax.components.capitalGainsTax, 10_500);
  // ordinary tax at 47 % of 3000 = 1410
  assert.equal(tax.components.ordinaryTax, 1410);
});

test('computeTaxOnExercise: 102-capital DISQUALIFIED (<24mo) → full ordinary', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({ strike: 5, fmvAtGrant: 8 }));
  // 18 months later — below 24mo lockup
  const tax = eng.computeTaxOnExercise({
    grant: g,
    fmv: 50,
    exerciseDate: '2025-07-01',
    shares: 1000,
  });
  assert.equal(tax.lockupSatisfied, false);
  // full 45_000 spread taxed ordinary
  assert.equal(tax.components.ordinaryPortion, 45_000);
  // marginal 47 % + BL 12 % = 59 %
  assert.equal(tax.components.ordinaryTax, 21_150);
  assert.equal(tax.components.ordinaryBL, 5_400);
  assert.equal(tax.grossTax, 26_550);
});

// ─── 5. Tax: 102 ordinary & 3(i) tracks ─────────────────────────────
test('computeTaxOnExercise: 102-ordinary → marginal + BL', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({ trackType: '102-ordinary', strike: 10 }));
  const tax = eng.computeTaxOnExercise({
    grant: g,
    fmv: 30,
    exerciseDate: '2026-06-01',
    shares: 1000,
  });
  // spread = 20_000
  assert.equal(tax.components.ordinaryTax, 9400); // 20_000 * 0.47
  assert.equal(tax.components.ordinaryBL, 2400);  // 20_000 * 0.12
  assert.equal(tax.grossTax, 11_800);
});

test('computeTaxOnExercise: 3(i) consultants → full marginal + BL, no capital', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({ trackType: '3(i)', trustee: null, strike: 10 }));
  const tax = eng.computeTaxOnExercise({
    grant: g,
    fmv: 30,
    exerciseDate: '2026-06-01',
    shares: 500,
  });
  // spread = 10_000
  assert.equal(tax.components.ordinaryTax, 4700);
  assert.equal(tax.components.capitalGainsTax, 0);
});

test('computeTaxOnExercise: high earner surtax applied', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({ trackType: '102-ordinary', strike: 10 }));
  const tax = eng.computeTaxOnExercise({
    grant: g,
    fmv: 30,
    exerciseDate: '2026-06-01',
    shares: 1000,
    annualIncome: 900_000,
  });
  assert.ok(tax.components.surtax > 0, 'surtax present');
  assert.equal(tax.components.surtax, 600); // 20_000 * 0.03
});

// ─── 6. Trustee transfer & lockup math ──────────────────────────────
test('trusteeTransfer: computes 24-month lockup end for 102-capital', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const tr = eng.trusteeTransfer(g.id, { depositDate: '2024-01-15' });
  assert.equal(tr.lockupMonths, 24);
  // grantDate 2024-01-01 + 24mo = 2026-01-01
  assert.equal(tr.lockupEnds.slice(0, 10), '2026-01-01');
});

test('trusteeTransfer: 12-month lockup for 102-ordinary', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({ trackType: '102-ordinary' }));
  const tr = eng.trusteeTransfer(g.id, { depositDate: '2024-02-01' });
  assert.equal(tr.lockupMonths, 12);
  assert.equal(tr.lockupEnds.slice(0, 10), '2025-01-01');
});

test('trusteeTransfer: refuses 3(i) grants', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant({ trackType: '3(i)', trustee: null }));
  assert.throws(() => eng.trusteeTransfer(g.id), /no trustee required/);
});

// ─── 7. Acceleration rules ──────────────────────────────────────────
test('leaveAcceleration: termination w/o cause cancels unvested by default', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  // at 18 months in: 1800 vested, 3000 unvested
  const res = eng.leaveAcceleration({
    grantId: g.id,
    reason: 'termination',
    asOfDate: '2025-07-01',
  });
  assert.equal(res.accelerated, 0);
  assert.equal(res.cancelled, 3000);
  assert.equal(res.exerciseDeadline.slice(0, 10), '2025-09-29');
});

test('leaveAcceleration: change-of-control → full accel', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const res = eng.leaveAcceleration({
    grantId: g.id,
    reason: 'change-of-control',
    asOfDate: '2025-07-01',
  });
  assert.equal(res.accelerated, 3000);
  assert.equal(res.cancelled, 0);
  const snap = eng.computeVested(g.id, '2025-07-01');
  assert.equal(snap.vested, 4800);
});

test('leaveAcceleration: death → full accel', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const res = eng.leaveAcceleration({
    grantId: g.id,
    reason: 'death',
    asOfDate: '2025-07-01',
  });
  assert.equal(res.accelPct, 1);
  assert.equal(res.accelerated, 3000);
});

test('leaveAcceleration: custom accelPct is honoured', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const res = eng.leaveAcceleration({
    grantId: g.id,
    reason: 'termination',
    asOfDate: '2025-07-01',
    accelPct: 0.5,
  });
  assert.equal(res.accelerated, 1500);
  assert.equal(res.cancelled, 1500);
});

// ─── 8. 83(b) surrogate note ───────────────────────────────────────
test('strike83b: records FMV declaration note', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const note = eng.strike83b({ grantId: g.id, date: '2024-01-05' });
  assert.equal(note.track, '102-capital');
  assert.equal(note.equivalent, 'us-83b');
  assert.ok(Array.isArray(note.notes));
});

// ─── 9. PDF / text surrogate ───────────────────────────────────────
test('vestingSchedulePDF: includes Hebrew labels and all tranches', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  const pdf = eng.vestingSchedulePDF(g.id);
  assert.equal(pdf.format, 'text/plain');
  assert.ok(pdf.content.includes('מסלול'));
  assert.ok(pdf.content.includes('102-capital'));
  assert.ok(pdf.content.includes(g.id));
});

// ─── 10. Form 161 aggregation ──────────────────────────────────────
test('reportForForm161: aggregates grants per employee', () => {
  const eng = newEngine();
  eng.grantOption(baseGrant());
  eng.grantOption(baseGrant({ shares: 2400, type: 'RSU' }));
  eng.grantOption(baseGrant({ employeeId: 'emp-999' }));
  const rep = eng.reportForForm161('emp-001');
  assert.equal(rep.rows.length, 2);
  assert.equal(rep.totals.shares, 7200);
  assert.equal(rep.formIdHe, LABELS_HE.form161);
});

// ─── 11. Append-only ledger invariant ──────────────────────────────
test('ledger: grant entries are frozen & append-only', () => {
  const eng = newEngine();
  const g = eng.grantOption(baseGrant());
  eng.trusteeTransfer(g.id, { depositDate: '2024-01-15' });
  eng.exercise(g.id, 500, 'cash', { asOfDate: '2026-02-01', fmv: 20 });
  const ledger = eng.ledgerFor(g.id);
  assert.equal(ledger.length, 3);
  assert.throws(() => { ledger[0].payload.employeeId = 'hacker'; }, TypeError);
  // Snapshot is a copy — mutating it does not affect the engine's ledger.
  ledger.push({ fake: true });
  const fresh = eng.ledgerFor(g.id);
  assert.equal(fresh.length, 3);
});

// ─── 12. Constants surface sanity ──────────────────────────────────
test('CONSTANTS_2026: capital track rate is 25%', () => {
  assert.equal(CONSTANTS_2026.SECTION_102_CAPITAL_RATE, 0.25);
  assert.equal(CONSTANTS_2026.SECTION_102_CAPITAL_LOCKUP_MONTHS, 24);
});

test('_internals.diffMonths: 24-month round-trip', () => {
  const m = _internals.diffMonths('2024-01-01', '2026-01-01');
  assert.equal(m, 24);
});
