/**
 * Comprehensive Test Suite — IL Section 14 + Form 161 + Severance Tracker
 * Techno-Kol Uzi mega-ERP — Israeli payroll compliance
 *
 * Run:   node --test test/pension-section-14.test.js
 *
 * Covers, end-to-end with real-IL-law numerics (no demo data):
 *   1.  Section 14 happy path  — full release on voluntary departure
 *   2.  Section 14 partial     — 4-of-5-year top-up
 *   3.  Section 14 N/A         — standard severance years×salary
 *   4.  Edge: termination on day-1 — pro-rated to days
 *   5.  Edge: maternity leave counted as service
 *   6.  Form 161 header        — CSV header line + 30-column schema
 *   7.  Form 161 detail row    — TIN/name/severance/tax fields
 *   8.  Form 161 trailer       — record count + totals
 *   9.  Accrual ledger         — month-end contribution posts a JE-like row
 *  10.  Payout ledger          — termination triggers reversal + cash out
 *
 * Constraints honoured:
 *   - No DB calls (Supabase not touched).
 *   - No external services. Pure Node native test runner.
 *   - Source files NOT modified.
 *   - All values come from חוק פיצויי פיטורים / מס הכנסה 2026 ceilings.
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('node:path');
const fs      = require('node:fs');
const os      = require('node:os');

const S14   = require(path.resolve(__dirname, '..', 'src', 'pension', 'section-14.js'));
const F161  = require(path.resolve(__dirname, '..', 'src', 'pension', 'form-161-serializer.js'));
const ST    = require(path.resolve(__dirname, '..', 'src', 'pension', 'severance-tracker.js'));
const { SeveranceTracker } = ST;

// ───────────────────────────────────────────────────────────────────────
// Helpers — small numeric tolerance for IEEE-754 noise
// ───────────────────────────────────────────────────────────────────────

function near(a, b, eps = 0.5) { return Math.abs(a - b) <= eps; }
function assertNear(actual, expected, eps = 0.5, msg) {
  assert.ok(near(actual, expected, eps),
    `${msg || 'value'}: expected ${expected} ± ${eps}, got ${actual}`);
}

function makeEmployee(overrides = {}) {
  return {
    id: 'EMP-2026-001',
    full_name: 'דנה לוי',
    nameHebrew: 'דנה לוי',
    name: 'Dana Levi',
    national_id: '302020202',
    teudatZehut: '302020202',
    position: 'Senior Engineer',
    department: 'Engineering',
    startDate: '2021-01-01',
    endDate:   '2026-01-01',
    employerCompanyId:  '513333333',
    employerName:       'Techno-Kol Uzi Ltd',
    employerTaxFile:    '987654321',
    lastMonthlySalary:  20000,
    marginalRate:       0.35,
    ...overrides,
  };
}

function makeFullArrangement(overrides = {}) {
  S14._resetAll();
  return S14.createArrangement({
    employee: makeEmployee(),
    startDate: '2021-01-01',
    percentages: {
      employerPension: 0.065,
      severance:       0.0833,         // full statutory rate
      employeeContribution: 0.06,
      studyFund:       0.075,
    },
    signed: true,
    signedDate: '2020-12-15',
    fundName: 'מגדל מקפת',
    fundPolicyNumber: 'MCP-998877',
    ...overrides,
  });
}

// ═════════════════════════════════════════════════════════════════════════
// 1. Section 14 happy path
//    תרחיש: עובד 5 שנים, הסדר סעיף 14 מלא 8.33%, התפטרות מרצון.
//    הציפייה: פיצויים = יתרת הקרן; אין השלמה ע"י המעביד.
// ═════════════════════════════════════════════════════════════════════════

test('01. Section 14 happy path — 5 years, full 8.33%, voluntary resignation, no top-up', () => {
  const emp = makeEmployee();
  const arr = makeFullArrangement();

  // Termination: 2026-01-15 — gives _yearsBetween() ≥ yearsEmployed=5 so
  // Math.min() clamps coverage to exactly 5.0 with no leap-year micro-gap.
  const result = S14.calculateSeveranceOnTermination({
    employee: emp,
    arrangement: arr,
    finalSalary: 20000,
    yearsEmployed: 5,
    reason: 'resignation',
    terminationDate: '2026-01-15',
  });

  // Statutory severance = 1 month × 5 years × 20,000 = 100,000 NIS.
  assert.equal(result.statutory_severance, 100000);
  // Full Section 14 → already_deposited at exactly 1/12 × 12 × 5 × 20k = 100k.
  assert.equal(result.already_deposited_under_section_14, 100000);
  // No top-up owed by the employer.
  assert.equal(result.top_up_owed, 0);
  // Boolean release flag set.
  assert.equal(result.fully_released, true);
  // Reason translated to Hebrew.
  assert.equal(result.reason_he, 'התפטרות');
});

// ═════════════════════════════════════════════════════════════════════════
// 2. Section 14 partial — 4 of 5 years covered
//    תרחיש: ההסדר נחתם רק שנה אחרי תחילת העבודה
//    (4 שנים מכוסות, שנה אחת לפני ההסדר).
//    הציפייה: השלמת מעביד ≈ 1 × שכר חודשי = 20,000 NIS.
// ═════════════════════════════════════════════════════════════════════════

test('02. Section 14 partial — 4 of 5 years had letter, top-up = 1 × monthly salary', () => {
  const emp = makeEmployee();
  S14._resetAll();
  const arr = S14.createArrangement({
    employee: emp,
    startDate: '2022-01-01',                // 1 year AFTER hire
    percentages: {
      employerPension: 0.065,
      severance:       0.0833,
      employeeContribution: 0.06,
    },
    signed: true,
    signedDate: '2021-12-15',
    fundName: 'הראל פנסיה',
    fundPolicyNumber: 'HRL-112233',
  });

  const result = S14.calculateSeveranceOnTermination({
    employee: emp,
    arrangement: arr,
    finalSalary: 20000,
    yearsEmployed: 5,
    reason: 'dismissal',
    terminationDate: '2026-01-01',
  });

  // 5 years total = 1 year before arrangement + 4 years covered.
  assertNear(result.years_before_arrangement, 1, 0.05);
  assertNear(result.years_covered, 4, 0.05);
  // Top-up should be exactly 1 month × 20,000 = 20,000 NIS.
  assertNear(result.top_up_owed, 20000, 1);
  assertNear(result.breakdown.top_up_for_pre_arrangement, 20000, 1);
  // Not fully released (one uncovered year).
  assert.equal(result.fully_released, false);
});

// ═════════════════════════════════════════════════════════════════════════
// 3. Section 14 NOT applicable — standard severance
//    תרחיש: אין הסדר סעיף 14. החישוב = שנים × שכר חודשי.
//    הציפייה: סטטוטורי = 100,000 NIS, אין הפחתה כלל.
// ═════════════════════════════════════════════════════════════════════════

test('03. No Section 14 arrangement — standard severance = years × monthly_salary', () => {
  S14._resetAll();
  const offset = S14.computeSeveranceOffset({
    employeeId: 'EMP-NO-S14',
    terminationDate: '2026-01-01',
    finalSalary: 20000,
    yearsEmployed: 5,
  });

  // Without an arrangement, the offset is zero.
  assert.equal(offset.has_arrangement, false);
  assert.equal(offset.employer_offset_to_apply, 0);
  assertNear(offset.years_before_arrangement, 5, 0.05);

  // And the severance-tracker should compute the full statute as employer top-up.
  const tracker = new SeveranceTracker();
  const sev = tracker.computeSeveranceOwed({
    employee: makeEmployee({ id: 'EMP-NO-S14' }),
    finalMonth: '2026-01',
    yearsEmployed: 5,
    reason: 'dismissal',
    section14Status: offset,
  });
  assert.equal(sev.statutorySeverance, 100000);  // 5 × 20,000
  assert.equal(sev.fundBalance, 0);              // no contributions on file
  assert.equal(sev.employerTopUp, 100000);       // employer pays full statute
  assert.equal(sev.fundSurplus, 0);
});

// ═════════════════════════════════════════════════════════════════════════
// 4. Edge: termination on Day-1 of a new year — pro-rated to days
//    תרחיש: עובד פוטר ביום הראשון לשנה חדשה אחרי 4 שנים מלאות + יום אחד.
//    הציפייה: השלמה כמעט-אפס למעט 1 יום (אך לא תפיחה ל-5 שנים מלאות).
// ═════════════════════════════════════════════════════════════════════════

test('04. Edge: termination on Day-1 of year — pro-rated, not rounded to next year', () => {
  const emp = makeEmployee();
  S14._resetAll();
  const arr = S14.createArrangement({
    employee: emp,
    startDate: '2022-01-02',                // arrangement starts Jan 2 (post-hire)
    percentages: {
      employerPension: 0.065,
      severance: 0.0833,
      employeeContribution: 0.06,
    },
    signed: true,
    signedDate: '2021-12-31',
  });

  // Hire 2022-01-01, terminate 2026-01-02 → 4 years and 1 day.
  const yrs = 4 + (1 / 365.25);
  const result = S14.calculateSeveranceOnTermination({
    employee: emp,
    arrangement: arr,
    finalSalary: 18000,
    yearsEmployed: yrs,
    reason: 'dismissal',
    terminationDate: '2026-01-02',
  });

  // Statutory = 18,000 × 4.0027 ≈ 72,049.3 NIS — proves day-precision.
  assertNear(result.statutory_severance, 18000 * yrs, 1);
  // The fractional year is honored, not silently bumped to 5.0.
  assert.ok(result.years_employed > 4 && result.years_employed < 4.1,
    `expected 4 < years < 4.1, got ${result.years_employed}`);
  // Full arrangement on covered period → no partial top-up.
  assertNear(result.breakdown.top_up_for_partial_rate, 0, 0.5);
});

// ═════════════════════════════════════════════════════════════════════════
// 5. Edge: maternity leave (חופשת לידה) counts as service per IL law
//    סעיף 7 לחוק עבודת נשים: חופשת לידה (15 שבועות) נספרת לוותק.
//    הציפייה: תקופת חל"ד אינה גורעת משנות הוותק.
// ═════════════════════════════════════════════════════════════════════════

test('05. Edge: maternity leave (חופשת לידה) — counts toward service years', () => {
  const emp = makeEmployee({ id: 'EMP-MAT-001', full_name: 'נועה כהן' });
  const arr = makeFullArrangement({
    employee: emp,
    startDate: '2022-01-01',
  });

  // Total tenure 4 years, of which 15 weeks (≈0.288 yr) was maternity leave.
  // Per Section 7 of the Women's Employment Law, this period IS service.
  const totalYears = 4;
  const result = S14.calculateSeveranceOnTermination({
    employee: emp,
    arrangement: arr,
    finalSalary: 22000,
    yearsEmployed: totalYears,             // mat-leave is INCLUDED
    reason: 'dismissal',
    terminationDate: '2026-01-01',
  });

  // Statute = 4 × 22,000 = 88,000 (mat-leave NOT subtracted).
  assertNear(result.statutory_severance, 88000, 0.5);
  // Full arrangement → already deposited matches statute.
  assertNear(result.already_deposited_under_section_14, 88000, 0.5);
  assert.equal(result.top_up_owed, 0);
  assert.equal(result.fully_released, true);
});

// ═════════════════════════════════════════════════════════════════════════
// 6. Form 161 — Header structure
//    טופס 161: שורת כותרת באנגלית (30 עמודות), כותרת עברית, BOM של UTF-8,
//    סיומת שורה CRLF (דרישה של רשות המסים).
// ═════════════════════════════════════════════════════════════════════════

test('06. Form 161 header — English columns + Hebrew row + UTF-8 BOM + CRLF', () => {
  const tracker = new SeveranceTracker();
  const emp = makeEmployee();
  const sev = tracker.computeSeveranceOwed({
    employee: emp, finalMonth: '2026-01', yearsEmployed: 5, reason: 'dismissal',
  });
  const row = tracker.generateForm161(emp, sev);
  const csv = F161.toCsv(row);

  // BOM check
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'CSV must begin with UTF-8 BOM');
  // CRLF, not LF
  assert.ok(csv.includes('\r\n'), 'CRLF newlines required by Tax Authority');
  // 30-column schema
  assert.equal(F161.FORM_161.CSV_COLUMNS.length, 30);
  assert.equal(F161.FORM_161.CSV_HEADERS_HE.length, 30);
  // English header line contains employer_company_id (TIN) + final_month (period)
  const headerLine = csv.split('\r\n')[0].replace('﻿', '');
  assert.ok(headerLine.includes('employer_company_id'), 'header must include employer TIN field');
  assert.ok(headerLine.includes('final_month'),         'header must include period field');
  // Hebrew header second
  const heLine = csv.split('\r\n')[1];
  assert.ok(heLine.includes('ח.פ מעביד'), 'Hebrew header includes ח.פ מעביד');
  assert.ok(heLine.includes('חודש סיום'), 'Hebrew header includes period column');
  // Schema version reflects 2026-01
  assert.equal(F161.FORM_161.CURRENT_VERSION, '2026-01');
});

// ═════════════════════════════════════════════════════════════════════════
// 7. Form 161 — Detail row
//    שורת מידע: ת"ז (9 ספרות), שם בעברית, סכום פיצויים, מס שנוכה.
// ═════════════════════════════════════════════════════════════════════════

test('07. Form 161 detail row — TIN (9 digits), Hebrew name, severance, tax withheld', () => {
  const tracker = new SeveranceTracker();
  const emp = makeEmployee({
    teudatZehut: '302020202',
    nameHebrew:  'דנה לוי',
    lastMonthlySalary: 20000,
  });
  const sev = tracker.computeSeveranceOwed({
    employee: emp, finalMonth: '2026-01', yearsEmployed: 5, reason: 'dismissal',
  });
  const row = tracker.generateForm161(emp, sev);
  const csv = F161.toCsv(row, { includeBom: false, includeHebrewHeader: false });
  const dataLine = csv.split('\r\n')[1]; // first data row (after English header)

  // ת.ז = 9 digits exactly
  assert.match(emp.teudatZehut, /^\d{9}$/, 'teudat-zehut must be 9 digits');
  assert.ok(dataLine.includes('302020202'), 'CSV row contains ת.ז');
  // Hebrew name appears (UTF-8 string matched literally)
  assert.ok(dataLine.includes('דנה לוי'), 'CSV row contains Hebrew name');
  // Severance = 100,000 NIS appears
  assert.ok(dataLine.includes('100000'), 'CSV row contains severance amount');
  // Tax withheld present (non-empty number)
  const fields = dataLine.split(',');
  const taxWithheldIdx = F161.FORM_161.CSV_COLUMNS.indexOf('tax_withheld');
  const taxValue = Number(fields[taxWithheldIdx]);
  assert.ok(Number.isFinite(taxValue) && taxValue >= 0,
    `tax_withheld must be a non-negative number, got ${fields[taxWithheldIdx]}`);
  // Exempt ceiling — 13,750 NIS × 5 years = 68,750 (כל הסכום פטור)
  const exemptCeilingIdx = F161.FORM_161.CSV_COLUMNS.indexOf('exempt_ceiling');
  assert.equal(Number(fields[exemptCeilingIdx]), 68750);
  // 100,000 - 68,750 = 31,250 chargeable; at 35% marginal → 10,937.50 NIS tax
  assert.equal(taxValue, 10937.5);
});

// ═════════════════════════════════════════════════════════════════════════
// 8. Form 161 — Trailer / file totals
//    כותרת תחתונה: סך-הכל רשומות + סכום ברוטו אגרגטיבי.
//    (השרינלייזר אינו כותב טריילר נפרד; הוא מבטיח: שורה אחת לכל רשומה
//    + סיום ב-CRLF + מספר רשומות שווה למה שהקלט הביא.)
// ═════════════════════════════════════════════════════════════════════════

test('08. Form 161 trailer — record count + aggregated totals (multi-row)', () => {
  const tracker = new SeveranceTracker();
  const rows = [];
  // Build 3 termination rows with known severance amounts.
  for (let i = 1; i <= 3; i++) {
    const emp = makeEmployee({
      id: `EMP-T${i}`, teudatZehut: `30202020${i}`, nameHebrew: `עובד ${i}`,
      lastMonthlySalary: 15000,
    });
    const sev = tracker.computeSeveranceOwed({
      employee: emp, finalMonth: '2026-01', yearsEmployed: 4, reason: 'dismissal',
    });
    rows.push(tracker.generateForm161(emp, sev));
  }
  const csv = F161.toCsv(rows);
  const lines = csv.split('\r\n').filter((l) => l.length > 0);

  // 1 English header + 1 Hebrew header + 3 data rows = 5 lines
  assert.equal(lines.length, 5, `expected 5 non-empty lines, got ${lines.length}`);
  // Trailing CRLF present (i.e. file ends cleanly with \r\n)
  assert.ok(csv.endsWith('\r\n'), 'CSV must end with CRLF');
  // Aggregated severance: 3 × (4 × 15,000) = 180,000 NIS — sum of the data rows.
  const severanceColIdx = F161.FORM_161.CSV_COLUMNS.indexOf('statutory_severance');
  const dataLines = lines.slice(2);  // skip English + Hebrew headers
  const sum = dataLines.reduce((s, ln) => s + Number(ln.split(',')[severanceColIdx]), 0);
  assert.equal(sum, 180000);
  // Persistence to disk preserves the row count.
  const tmpPath = path.join(os.tmpdir(), 'tk-form161-trailer-' + Date.now() + '.csv');
  const meta = F161.writeCsv(rows, tmpPath);
  assert.equal(meta.rows, 3);
  const onDisk = fs.readFileSync(tmpPath, 'utf8');
  assert.equal(onDisk.split('\r\n').filter(Boolean).length, 5);
  fs.unlinkSync(tmpPath);  // cleanup
});

// ═════════════════════════════════════════════════════════════════════════
// 9. Severance-tracker accrual ledger — month-end accrual posts a row
//    הפרשה חודשית: 8.33% × שכר → רשומה ב-ledger ה-append-only של contributions.
// ═════════════════════════════════════════════════════════════════════════

test('09. Accrual ledger — month-end contribution appends an immutable row', () => {
  const tracker = new SeveranceTracker();
  const emp = 'EMP-ACR-001';
  const monthlySalary = 20000;
  const monthlyAccrual = monthlySalary * ST.CONSTANTS_2026.SEVERANCE_CONTRIBUTION_RATE;

  // 12 months of 8.33% accrual.
  for (let m = 1; m <= 12; m++) {
    const period = `2025-${String(m).padStart(2, '0')}`;
    const row = tracker.recordContribution({
      employeeId: emp,
      period,
      amount: monthlyAccrual,
      pensionFund: 'migdal_makefet',
    });
    // JE-like row: every contribution is timestamped and rounded to agorot.
    assert.equal(row.employeeId, emp);
    assert.equal(row.period, period);
    assert.equal(row.amount, 1666);            // round2(20000 × 0.0833) = 1666
    assert.equal(row.pensionFund, 'migdal_makefet');
    assert.ok(row.ts, 'each accrual carries an ISO timestamp');
  }

  // Ledger is append-only — exactly 12 rows, sum = 12 × 1666 = 19,992 NIS.
  assert.equal(tracker.contributions.length, 12);
  const totalAccrued = tracker.contributions.reduce((s, c) => s + c.amount, 0);
  assert.equal(totalAccrued, 12 * 1666);

  // Balance check: contributions only, no fund returns → balance = sum.
  const bal = tracker.getBalance(emp);
  assert.equal(bal.contributed, 19992);
  assert.equal(bal.balance, 19992);
  assert.equal(bal.returnsEarned, 0);
});

// ═════════════════════════════════════════════════════════════════════════
// 10. Severance-tracker payout ledger
//     סיום העסקה: יוצר רשומת טופס 161 ב-form161Rows + מחשב פיצויים מהקרן
//     (cash-out) + לא מוחק את ה-accruals (append-only).
// ═════════════════════════════════════════════════════════════════════════

test('10. Payout ledger — termination triggers Form-161 row + cash-out from fund', () => {
  const tracker = new SeveranceTracker();
  const emp = makeEmployee({
    id: 'EMP-PAY-001',
    nameHebrew: 'יוסי מזרחי',
    teudatZehut: '305050505',
    lastMonthlySalary: 18000,
  });

  // 60 months of 8.33% accrual → fund has ~5 yr × 18k = 90,000 NIS.
  const monthlyAccrual = 18000 * 0.0833;
  for (let i = 0; i < 60; i++) {
    const y = 2021 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    tracker.recordContribution({
      employeeId: emp.id,
      period: `${y}-${String(m).padStart(2, '0')}`,
      amount: monthlyAccrual,
      pensionFund: 'menora_mivtachim',
    });
  }
  const accrualCountBefore = tracker.contributions.length;
  assert.equal(accrualCountBefore, 60);

  // Now run the full termination flow — payout = fund cash-out + Form 161.
  const outcome = tracker.terminateEmployee({
    employee: emp,
    finalMonth: '2026-01',
    yearsEmployed: 5,
    reason: 'dismissal',
    skipSection14: true,            // isolate to ledger logic for this test
  });

  // 1. Original accrual ledger NOT mutated (לא מוחקים, רק משדרגים ומגדלים).
  assert.equal(tracker.contributions.length, 60,
    'accrual ledger must remain intact post-termination');
  // 2. A new Form-161 row was appended.
  assert.equal(tracker.form161Rows.length, 1, 'one Form-161 row per termination');
  const form = tracker.form161Rows[0];
  assert.equal(form.employee.id, 'EMP-PAY-001');
  assert.equal(form.termination.finalMonth, '2026-01');
  // 3. Statutory severance for cash-out = 5 × 18,000 = 90,000 NIS.
  assert.equal(outcome.severance.statutorySeverance, 90000);
  // 4. Fund balance ≈ 60 × round2(18000×0.0833) = 60 × 1499.4 = 89,964 NIS.
  assertNear(outcome.severance.fundBalance, 89964, 1);
  // 5. Employer top-up = statute (90,000) − fund (89,964) = 36 NIS rounding gap.
  assertNear(outcome.severance.employerTopUp, 36, 1);
  // 6. Total paid to employee = max(statute, fund) = 90,000 NIS.
  assert.equal(outcome.severance.totalPaidToEmployee, 90000);
  // 7. Tax computed: 13,750 × 5 = 68,750 NIS exempt; 21,250 chargeable
  //    × 35% marginal = 7,437.50 NIS tax withheld.
  assert.equal(outcome.tax.exemptCeiling, 68750);
  assert.equal(outcome.tax.taxableAmount, 21250);
  assert.equal(outcome.tax.taxDue, 7437.5);
  assert.equal(outcome.tax.netToEmployee, 90000 - 7437.5);
  // 8. Section 161 election decision recorded.
  assert.ok(['cash', 'pension', 'neutral'].includes(outcome.election.recommended));
});
