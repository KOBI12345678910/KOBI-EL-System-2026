/**
 * Health Insurance Calculator — Unit Tests
 * Tests `onyx-procurement/src/bl/health-insurance.js`
 *
 * Run with:    node --test test/bl/health-insurance.test.js
 *     or:      node test/run.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  HEALTH_INSURANCE_2026,
  HEALTH_FUNDS,
  SUPPLEMENTAL_TIERS,
  STATUS,
  computeHealth,
  kupaSelector,
  generateBLHealthFile,
  normalizeStatus,
  splitBase,
  resolveFundKey,
  resolveSupplementalKey,
} = require(path.resolve(__dirname, '..', '..', 'src', 'bl', 'health-insurance.js'));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function assertNear(actual, expected, eps = 0.02, msg) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    msg || `expected ${expected} ± ${eps}, got ${actual} (delta ${actual - expected})`
  );
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS sanity
// ═══════════════════════════════════════════════════════════════

test('2026 constants match the spec', () => {
  assert.equal(HEALTH_INSURANCE_2026.year, 2026);
  assert.equal(HEALTH_INSURANCE_2026.MONTHLY_THRESHOLD, 7522);
  assert.equal(HEALTH_INSURANCE_2026.MONTHLY_MAX_BASE, 49030);
  assert.equal(HEALTH_INSURANCE_2026.EMPLOYEE_LOW_RATE, 0.031);
  assert.equal(HEALTH_INSURANCE_2026.EMPLOYEE_HIGH_RATE, 0.05);
  assert.equal(HEALTH_INSURANCE_2026.MINIMUM_PAYMENT_MONTHLY, 116);
});

test('constants object is frozen (cannot be mutated at runtime)', () => {
  assert.ok(Object.isFrozen(HEALTH_INSURANCE_2026));
});

test('HEALTH_FUNDS registry contains all four statutory kupot', () => {
  assert.equal(Object.keys(HEALTH_FUNDS).length, 4);
  assert.ok(HEALTH_FUNDS.clalit && HEALTH_FUNDS.maccabi);
  assert.ok(HEALTH_FUNDS.meuhedet && HEALTH_FUNDS.leumit);
  assert.equal(HEALTH_FUNDS.clalit.code,   '01');
  assert.equal(HEALTH_FUNDS.maccabi.code,  '02');
  assert.equal(HEALTH_FUNDS.meuhedet.code, '03');
  assert.equal(HEALTH_FUNDS.leumit.code,   '04');
});

test('SUPPLEMENTAL_TIERS has none/silver/gold/platinum', () => {
  assert.equal(Object.keys(SUPPLEMENTAL_TIERS).length, 4);
  assert.equal(SUPPLEMENTAL_TIERS.none.name_he,     'ללא');
  assert.equal(SUPPLEMENTAL_TIERS.silver.name_he,   'כסף');
  assert.equal(SUPPLEMENTAL_TIERS.gold.name_he,     'זהב');
  assert.equal(SUPPLEMENTAL_TIERS.platinum.name_he, 'פלטינה');
});

// ═══════════════════════════════════════════════════════════════
// splitBase — threshold + ceiling math
// ═══════════════════════════════════════════════════════════════

test('splitBase: income below threshold goes entirely to the low portion', () => {
  const { base, low, high } = splitBase(5000);
  assert.equal(base, 5000);
  assert.equal(low,  5000);
  assert.equal(high, 0);
});

test('splitBase: income exactly at threshold has zero high portion', () => {
  const { base, low, high } = splitBase(7522);
  assert.equal(base, 7522);
  assert.equal(low,  7522);
  assert.equal(high, 0);
});

test('splitBase: income above threshold splits correctly', () => {
  const { base, low, high } = splitBase(10000);
  assert.equal(base, 10000);
  assert.equal(low,  7522);
  assert.equal(high, 2478); // 10000 - 7522
});

test('splitBase: income at ceiling maps cleanly', () => {
  const { base, low, high, cappedOut } = splitBase(49030);
  assert.equal(base, 49030);
  assert.equal(low,  7522);
  assert.equal(high, 41508);
  assert.equal(cappedOut, 0);
});

test('splitBase: income above ceiling is capped and excess is reported', () => {
  const { base, low, high, cappedOut } = splitBase(60000);
  assert.equal(base, 49030);            // capped
  assert.equal(low,  7522);
  assert.equal(high, 41508);            // 49030 - 7522
  assert.equal(cappedOut, 60000 - 49030);
});

test('splitBase: negative income floored to zero', () => {
  const { base, low, high } = splitBase(-500);
  assert.equal(base, 0);
  assert.equal(low,  0);
  assert.equal(high, 0);
});

// ═══════════════════════════════════════════════════════════════
// computeHealth — employee (שכיר)
// ═══════════════════════════════════════════════════════════════

test('employee: income below threshold → 3.1% only', () => {
  const r = computeHealth({ income: 5000, status: 'employee' });
  assert.equal(r.status, STATUS.EMPLOYEE);
  assert.equal(r.base,   5000);
  assertNear(r.tax, 5000 * 0.031); // 155.00
  assertNear(r.rate, 0.031, 1e-6);
});

test('employee: income at threshold → 3.1% on full amount', () => {
  const r = computeHealth({ income: 7522, status: 'employee' });
  assertNear(r.tax, 7522 * 0.031); // 233.18
  assertNear(r.rate, 0.031, 1e-6);
});

test('employee: income above threshold → blended 3.1% + 5%', () => {
  const r = computeHealth({ income: 10000, status: 'employee' });
  const expected = 7522 * 0.031 + (10000 - 7522) * 0.05; // 233.182 + 123.9 = 357.082
  assertNear(r.tax, expected);
  assert.equal(r.base, 10000);
  // Effective rate ≈ 357.08 / 10000 = 0.0357
  assertNear(r.rate, expected / 10000, 1e-4);
});

test('employee: income at ceiling (49030) caps correctly', () => {
  const r = computeHealth({ income: 49030, status: 'employee' });
  const expected = 7522 * 0.031 + (49030 - 7522) * 0.05; // 233.182 + 2075.40 = 2308.582
  assertNear(r.tax, expected);
  assert.equal(r.base, 49030);
});

test('employee: income above ceiling → capped at MONTHLY_MAX_BASE (49030)', () => {
  const r = computeHealth({ income: 100000, status: 'employee' });
  const expected = 7522 * 0.031 + (49030 - 7522) * 0.05;
  assertNear(r.tax, expected, 0.02, 'tax should be the same as at the ceiling');
  assert.equal(r.base, 49030);
  // Excess beyond ceiling should not produce additional tax
  assert.equal(r.breakdown.capped_out, 100000 - 49030);
});

test('employee: zero income → zero tax', () => {
  const r = computeHealth({ income: 0, status: 'employee' });
  assert.equal(r.tax,  0);
  assert.equal(r.base, 0);
  assert.equal(r.rate, 0);
});

test('employee: breakdown includes low + high split', () => {
  const r = computeHealth({ income: 15000, status: 'employee' });
  assert.equal(r.breakdown.low_base,  7522);
  assert.equal(r.breakdown.high_base, 15000 - 7522);
  assert.equal(r.breakdown.low_rate,  0.031);
  assert.equal(r.breakdown.high_rate, 0.05);
});

// ═══════════════════════════════════════════════════════════════
// computeHealth — self-employed (עצמאי)
// ═══════════════════════════════════════════════════════════════

test('self-employed: same 3.1/5 split on net business income', () => {
  const r = computeHealth({ income: 20000, status: 'self-employed' });
  const expected = 7522 * 0.031 + (20000 - 7522) * 0.05;
  assertNear(r.tax, expected);
  assert.equal(r.status, STATUS.SELF_EMPLOYED);
});

test('self-employed: accepts Hebrew alias עצמאי', () => {
  const r = computeHealth({ income: 20000, status: 'עצמאי' });
  assert.equal(r.status, STATUS.SELF_EMPLOYED);
  const expected = 7522 * 0.031 + (20000 - 7522) * 0.05;
  assertNear(r.tax, expected);
});

test('self-employed: breakdown carries a Hebrew note about net business income', () => {
  const r = computeHealth({ income: 20000, status: 'self-employed' });
  assert.ok(r.breakdown.note_he.includes('עסק'));
  assert.ok(r.breakdown.note_en.toLowerCase().includes('business'));
});

// ═══════════════════════════════════════════════════════════════
// computeHealth — pensioner (פנסיונר)
// ═══════════════════════════════════════════════════════════════

test('pensioner: reduced flat rate 3.1% below threshold', () => {
  const r = computeHealth({ income: 5000, status: 'pensioner' });
  assertNear(r.tax, 5000 * 0.031);
  assert.equal(r.status, STATUS.PENSIONER);
});

test('pensioner: threshold split still applies for very high pensions', () => {
  const r = computeHealth({ income: 12000, status: 'pensioner' });
  const expected = 7522 * 0.031 + (12000 - 7522) * 0.05;
  assertNear(r.tax, expected);
});

test('pensioner: Hebrew alias פנסיונר', () => {
  const r = computeHealth({ income: 5000, status: 'פנסיונר' });
  assert.equal(r.status, STATUS.PENSIONER);
});

test('pensioner: breakdown notes reduced pensioner rate', () => {
  const r = computeHealth({ income: 5000, status: 'pensioner' });
  assert.ok(r.breakdown.note_he.includes('פנסיונר'));
});

// ═══════════════════════════════════════════════════════════════
// computeHealth — non-working (לא עובד)
// ═══════════════════════════════════════════════════════════════

test('non-working: flat minimum payment ~116 NIS', () => {
  const r = computeHealth({ income: 0, status: 'non-working' });
  assert.equal(r.tax, 116);
  assert.equal(r.base, 0);
  assert.equal(r.status, STATUS.NON_WORKING);
});

test('non-working: minimum payment applies regardless of income', () => {
  // Even if caller passes an income, non-working status pays the minimum
  const r = computeHealth({ income: 5000, status: 'non-working' });
  assert.equal(r.tax, 116);
});

test('non-working: Hebrew alias לא עובד', () => {
  const r = computeHealth({ income: 0, status: 'לא עובד' });
  assert.equal(r.status, STATUS.NON_WORKING);
  assert.equal(r.tax, 116);
});

test('non-working: Hebrew alias עקרת בית also maps to non-working', () => {
  const r = computeHealth({ income: 0, status: 'עקרת בית' });
  assert.equal(r.status, STATUS.NON_WORKING);
  assert.equal(r.tax, 116);
});

test('non-working: breakdown describes the minimum payment', () => {
  const r = computeHealth({ income: 0, status: 'non-working' });
  assert.equal(r.breakdown.minimum_payment, 116);
  assert.ok(r.breakdown.note_he.includes('מינימום'));
});

// ═══════════════════════════════════════════════════════════════
// computeHealth — non-working spouse (בן/בת זוג לא עובד)
// ═══════════════════════════════════════════════════════════════

test('non-working spouse: zero payment (covered by partner)', () => {
  const r = computeHealth({ income: 0, status: 'non-working-spouse' });
  assert.equal(r.tax, 0);
  assert.equal(r.base, 0);
  assert.equal(r.status, STATUS.NON_WORKING_SPOUSE);
});

test('non-working spouse: breakdown explains the exemption', () => {
  const r = computeHealth({ income: 0, status: 'non-working-spouse' });
  assert.ok(r.breakdown.note_he.includes('בן') || r.breakdown.note_he.includes('זוג'));
  assert.ok(r.breakdown.note_en.toLowerCase().includes('spouse'));
});

// ═══════════════════════════════════════════════════════════════
// computeHealth — foreign resident (תושב חוץ)
// ═══════════════════════════════════════════════════════════════

test('foreign-resident: exempt by default', () => {
  const r = computeHealth({ income: 20000, status: 'foreign-resident' });
  assert.equal(r.tax, 0);
  assert.equal(r.status, STATUS.FOREIGN_RESIDENT);
  assert.equal(r.breakdown.exempt, true);
});

test('foreign-resident: liable=true → employee-style calculation', () => {
  const r = computeHealth({ income: 10000, status: 'foreign-resident', liable: true });
  const expected = 7522 * 0.031 + (10000 - 7522) * 0.05;
  assertNear(r.tax, expected);
  assert.equal(r.status, STATUS.FOREIGN_RESIDENT);
});

test('foreign-resident: Hebrew alias תושב חוץ', () => {
  const r = computeHealth({ income: 20000, status: 'תושב חוץ' });
  assert.equal(r.status, STATUS.FOREIGN_RESIDENT);
  assert.equal(r.tax, 0); // default exempt
});

// ═══════════════════════════════════════════════════════════════
// Discounts — olim + reservists
// ═══════════════════════════════════════════════════════════════

test('oleh discount: 50% off during first 12 months', () => {
  const base = computeHealth({ income: 10000, status: 'employee' });
  const disc = computeHealth({
    income: 10000,
    status: 'employee',
    oleh: { active: true, monthsSinceAliyah: 3 },
  });
  assertNear(disc.tax, base.tax * 0.5);
  assert.equal(disc.discounts.multiplier, 0.5);
});

test('oleh discount: expired after 12 months → no discount', () => {
  const base = computeHealth({ income: 10000, status: 'employee' });
  const disc = computeHealth({
    income: 10000,
    status: 'employee',
    oleh: { active: true, monthsSinceAliyah: 15 },
  });
  assert.equal(disc.tax, base.tax);
  assert.equal(disc.discounts.multiplier, 1);
});

test('reservist discount: 30 days of reserve service → 25% off', () => {
  const base = computeHealth({ income: 10000, status: 'employee' });
  const disc = computeHealth({
    income: 10000,
    status: 'employee',
    reservist: { days: 30 },
  });
  assertNear(disc.tax, base.tax * 0.75); // 25% off
  assertNear(disc.discounts.multiplier, 0.75, 1e-4);
});

test('reservist discount: 15 days → 12.5% off (half of full)', () => {
  const base = computeHealth({ income: 10000, status: 'employee' });
  const disc = computeHealth({
    income: 10000,
    status: 'employee',
    reservist: { days: 15 },
  });
  assertNear(disc.tax, base.tax * (1 - 0.25 * 0.5));
});

test('discount stack: oleh + reservist compound', () => {
  const base = computeHealth({ income: 10000, status: 'employee' });
  const disc = computeHealth({
    income: 10000,
    status: 'employee',
    oleh: { active: true, monthsSinceAliyah: 0 },
    reservist: { days: 30 },
  });
  // 0.5 × 0.75 = 0.375
  assertNear(disc.tax, base.tax * 0.375);
});

// ═══════════════════════════════════════════════════════════════
// kupaSelector
// ═══════════════════════════════════════════════════════════════

test('kupaSelector: resolves english names (case-insensitive)', () => {
  assert.equal(kupaSelector({ health_fund: 'Clalit' }).fund,   'clalit');
  assert.equal(kupaSelector({ health_fund: 'MACCABI' }).fund,  'maccabi');
  assert.equal(kupaSelector({ health_fund: 'meuhedet' }).fund, 'meuhedet');
  assert.equal(kupaSelector({ health_fund: 'Leumit' }).fund,   'leumit');
});

test('kupaSelector: resolves Hebrew names', () => {
  assert.equal(kupaSelector({ health_fund: 'כללית' }).fund,  'clalit');
  assert.equal(kupaSelector({ health_fund: 'מכבי' }).fund,   'maccabi');
  assert.equal(kupaSelector({ health_fund: 'מאוחדת' }).fund, 'meuhedet');
  assert.equal(kupaSelector({ health_fund: 'לאומית' }).fund, 'leumit');
});

test('kupaSelector: resolves BL codes', () => {
  assert.equal(kupaSelector({ health_fund: '01' }).fund, 'clalit');
  assert.equal(kupaSelector({ health_fund: '02' }).fund, 'maccabi');
  assert.equal(kupaSelector({ health_fund: '03' }).fund, 'meuhedet');
  assert.equal(kupaSelector({ health_fund: '04' }).fund, 'leumit');
});

test('kupaSelector: returns the BL fund code', () => {
  const k = kupaSelector({ health_fund: 'Maccabi', supplemental: 'gold' });
  assert.equal(k.fundCode,         '02');
  assert.equal(k.supplementalCode, '2');
});

test('kupaSelector: supplemental Hebrew tiers', () => {
  assert.equal(kupaSelector({ supplemental: 'כסף' }).supplemental,   'silver');
  assert.equal(kupaSelector({ supplemental: 'זהב' }).supplemental,   'gold');
  assert.equal(kupaSelector({ supplemental: 'פלטינה' }).supplemental, 'platinum');
});

test('kupaSelector: default is Clalit + none', () => {
  const k = kupaSelector({});
  assert.equal(k.fund,         'clalit');
  assert.equal(k.supplemental, 'none');
});

test('kupaSelector: alias kupa field also works', () => {
  const k = kupaSelector({ kupa: 'Maccabi' });
  assert.equal(k.fund, 'maccabi');
});

test('kupaSelector: labels object is bilingual', () => {
  const k = kupaSelector({ health_fund: 'Clalit', supplemental: 'gold' });
  assert.equal(k.labels.fund_he, 'כללית');
  assert.equal(k.labels.fund_en, 'Clalit');
  assert.equal(k.labels.supplemental_he, 'זהב');
  assert.equal(k.labels.supplemental_en, 'Gold');
});

// ═══════════════════════════════════════════════════════════════
// computeHealth + kupa integration
// ═══════════════════════════════════════════════════════════════

test('computeHealth: uses employee.health_fund when present', () => {
  const r = computeHealth({
    income: 10000,
    status: 'employee',
    employee: { health_fund: 'Maccabi', supplemental: 'gold' },
  });
  assert.equal(r.fund, 'maccabi');
  assert.equal(r.supplemental, 'gold');
});

test('computeHealth: explicit fund arg overrides employee record', () => {
  const r = computeHealth({
    income: 10000,
    status: 'employee',
    employee: { health_fund: 'Clalit' },
    fund: { fund: 'Leumit', supplemental: 'platinum' },
  });
  assert.equal(r.fund, 'leumit');
  assert.equal(r.supplemental, 'platinum');
});

test('computeHealth: returns bilingual labels', () => {
  const r = computeHealth({ income: 10000, status: 'employee' });
  assert.equal(r.labels_he.tax, 'דמי ביטוח בריאות');
  assert.equal(r.labels_en.tax, 'Health Insurance');
  assert.ok(r.labels_he.status); // e.g. 'שכיר'
  assert.ok(r.labels_en.status); // e.g. 'Employee'
});

test('computeHealth: meta carries law + module + threshold + ceiling', () => {
  const r = computeHealth({ income: 10000, status: 'employee' });
  assert.equal(r.meta.threshold, 7522);
  assert.equal(r.meta.ceiling,   49030);
  assert.equal(r.meta.minimum_payment, 116);
  assert.ok(r.meta.law_he.includes('ביטוח בריאות'));
  assert.ok(r.meta.law_en.toLowerCase().includes('health'));
});

// ═══════════════════════════════════════════════════════════════
// Year validation
// ═══════════════════════════════════════════════════════════════

test('computeHealth: rejects years other than 2026', () => {
  assert.throws(() => computeHealth({ income: 5000, status: 'employee', year: 2025 }));
  assert.throws(() => computeHealth({ income: 5000, status: 'employee', year: 2027 }));
});

test('computeHealth: defaults year to 2026', () => {
  const r = computeHealth({ income: 5000, status: 'employee' });
  assert.equal(r.year, 2026);
});

test('computeHealth: unknown status throws', () => {
  assert.throws(() => computeHealth({ income: 5000, status: 'alien-lifeform' }));
});

test('computeHealth: missing args throws', () => {
  assert.throws(() => computeHealth());
  assert.throws(() => computeHealth(null));
});

// ═══════════════════════════════════════════════════════════════
// normalizeStatus
// ═══════════════════════════════════════════════════════════════

test('normalizeStatus: defaults to employee if empty', () => {
  assert.equal(normalizeStatus(undefined), STATUS.EMPLOYEE);
  assert.equal(normalizeStatus(''), STATUS.EMPLOYEE);
});

test('normalizeStatus: handles whitespace and case variations', () => {
  assert.equal(normalizeStatus('  Employee  '), STATUS.EMPLOYEE);
  assert.equal(normalizeStatus('SELF_EMPLOYED'), STATUS.SELF_EMPLOYED);
});

// ═══════════════════════════════════════════════════════════════
// generateBLHealthFile
// ═══════════════════════════════════════════════════════════════

test('generateBLHealthFile: produces header + rows + totals for multi-employee payload', () => {
  const file = generateBLHealthFile({ year: 2026, month: 4 }, [
    { id: 'E01', name: 'Alice', tz: '123456789', income: 10000, status: 'employee', health_fund: 'Clalit' },
    { id: 'E02', name: 'Bob',   tz: '987654321', income: 20000, status: 'employee', health_fund: 'Maccabi', supplemental: 'gold' },
    { id: 'E03', name: 'Carol', tz: '111222333', income: 5000,  status: 'employee', health_fund: 'Meuhedet' },
  ]);

  assert.equal(file.header.file_type, 'BL-HEALTH-COMBINED');
  assert.equal(file.header.period,    '2026-04');
  assert.equal(file.header.employees_count, 3);
  assert.equal(file.rows.length, 3);
  assert.equal(file.filename, 'bl-health-2026-04.txt');
});

test('generateBLHealthFile: totals aggregate correctly', () => {
  const file = generateBLHealthFile({ year: 2026, month: 1 }, [
    { id: 'E01', name: 'Alice', tz: '123', income: 10000, status: 'employee' },
    { id: 'E02', name: 'Bob',   tz: '456', income: 10000, status: 'employee' },
  ]);

  const perEmployee = 7522 * 0.031 + (10000 - 7522) * 0.05;
  assertNear(file.totals.total_health_tax, 2 * perEmployee);
  assertNear(file.totals.total_base, 20000);
  assert.equal(file.totals.employees_count, 2);
});

test('generateBLHealthFile: by_fund tracking per kupa', () => {
  const file = generateBLHealthFile({ year: 2026, month: 6 }, [
    { id: 'E01', name: 'A', tz: '1', income: 10000, status: 'employee', health_fund: 'Clalit'   },
    { id: 'E02', name: 'B', tz: '2', income: 10000, status: 'employee', health_fund: 'Maccabi'  },
    { id: 'E03', name: 'C', tz: '3', income: 10000, status: 'employee', health_fund: 'Meuhedet' },
    { id: 'E04', name: 'D', tz: '4', income: 10000, status: 'employee', health_fund: 'Leumit'   },
  ]);

  const perEmp = 7522 * 0.031 + (10000 - 7522) * 0.05;
  assertNear(file.totals.by_fund.clalit,   perEmp);
  assertNear(file.totals.by_fund.maccabi,  perEmp);
  assertNear(file.totals.by_fund.meuhedet, perEmp);
  assertNear(file.totals.by_fund.leumit,   perEmp);
});

test('generateBLHealthFile: mixed statuses (employee + self-employed + non-working)', () => {
  const file = generateBLHealthFile({ year: 2026, month: 12 }, [
    { id: 'E01', name: 'A', tz: '1', income: 10000, status: 'employee'      },
    { id: 'E02', name: 'B', tz: '2', income: 20000, status: 'self-employed' },
    { id: 'E03', name: 'C', tz: '3', income: 0,     status: 'non-working'   },
    { id: 'E04', name: 'D', tz: '4', income: 5000,  status: 'pensioner'     },
    { id: 'E05', name: 'E', tz: '5', income: 0,     status: 'non-working-spouse' },
  ]);

  assert.equal(file.rows.length, 5);
  assert.equal(file.totals.by_status[STATUS.NON_WORKING], 116);
  assert.equal(file.totals.by_status[STATUS.NON_WORKING_SPOUSE], 0);
});

test('generateBLHealthFile: combined with bl_tax adds health + BL per line', () => {
  const file = generateBLHealthFile({ year: 2026, month: 2 }, [
    { id: 'E01', name: 'A', tz: '1', income: 10000, status: 'employee', bl_tax: 500 },
  ]);
  const health = 7522 * 0.031 + (10000 - 7522) * 0.05;
  assertNear(file.rows[0].combined, health + 500);
  assertNear(file.totals.total_combined, health + 500);
});

test('generateBLHealthFile: text payload contains header, per-emp rows, totals, funds lines', () => {
  const file = generateBLHealthFile({ year: 2026, month: 3 }, [
    { id: 'E01', name: 'Alice', tz: '123', income: 10000, status: 'employee' },
  ]);
  const lines = file.text.trim().split('\n');
  assert.ok(lines[0].startsWith('HDR|'));
  assert.ok(lines[1].startsWith('EMP|id|'));   // column header
  assert.ok(lines[2].startsWith('EMP|E01|'));  // data row
  assert.ok(lines.some(l => l.startsWith('TOT|')));
  assert.ok(lines.some(l => l.startsWith('FND|')));
});

test('generateBLHealthFile: rejects bad period', () => {
  assert.throws(() => generateBLHealthFile({ year: 2026 }, []));
  assert.throws(() => generateBLHealthFile({}, []));
  assert.throws(() => generateBLHealthFile(null, []));
});

test('generateBLHealthFile: rejects non-array employees', () => {
  assert.throws(() => generateBLHealthFile({ year: 2026, month: 1 }, 'not an array'));
  assert.throws(() => generateBLHealthFile({ year: 2026, month: 1 }, null));
});

test('generateBLHealthFile: empty employees list produces an empty payload (not an error)', () => {
  const file = generateBLHealthFile({ year: 2026, month: 1 }, []);
  assert.equal(file.rows.length, 0);
  assert.equal(file.totals.employees_count, 0);
  assert.equal(file.totals.total_health_tax, 0);
});

// ═══════════════════════════════════════════════════════════════
// Regression: alignment with existing wage-slip calculator
// ═══════════════════════════════════════════════════════════════

test('regression: new computeHealth agrees with legacy computeBituachLeumiAndHealth for employee case', () => {
  // The legacy payroll module exposes the same 3.1/5 split for employees.
  const legacy = require(path.resolve(
    __dirname, '..', '..', 'src', 'payroll', 'wage-slip-calculator.js'
  ));
  const legacyResult = legacy.computeBituachLeumiAndHealth(12500);
  const modernResult = computeHealth({ income: 12500, status: 'employee' });
  assertNear(modernResult.tax, legacyResult.health_tax_employee, 0.02,
    `modern ${modernResult.tax} vs legacy ${legacyResult.health_tax_employee}`);
});

test('regression: health_tax at ceiling matches legacy calculator', () => {
  const legacy = require(path.resolve(
    __dirname, '..', '..', 'src', 'payroll', 'wage-slip-calculator.js'
  ));
  const legacyResult = legacy.computeBituachLeumiAndHealth(49030);
  const modernResult = computeHealth({ income: 49030, status: 'employee' });
  assertNear(modernResult.tax, legacyResult.health_tax_employee, 0.02);
});

test('regression: tax above ceiling equals tax at ceiling (cap enforced)', () => {
  const atCeiling = computeHealth({ income: 49030, status: 'employee' }).tax;
  const above     = computeHealth({ income: 80000, status: 'employee' }).tax;
  assert.equal(atCeiling, above);
});
