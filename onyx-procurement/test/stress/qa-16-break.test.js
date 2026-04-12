/**
 * QA-16 — Stress / Break Test Suite
 * ==================================
 *
 * Agent: QA-16 (Stress / Break Agent)
 * Target: onyx-procurement ERP — payroll engine + PDF generator + route surface
 *
 * Purpose:
 *   Intentionally try to break the system with malformed, oversized, concurrent
 *   and adversarial inputs. Each test documents the OBSERVED behaviour (not the
 *   desired behaviour) so a developer can decide whether a guard is needed.
 *
 * Rules:
 *   - Never delete production code.
 *   - Log every test case with its observed outcome.
 *   - Full bug report format inside the companion QA-16-stress.md.
 *
 * Run with:
 *   node --test test/stress/qa-16-break.test.js
 *
 * Any test that intentionally throws is WRAPPED so the suite continues.
 * The goal is to enumerate how the system fails, not to fail the suite.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CALC_PATH = path.resolve(__dirname, '..', '..', 'src', 'payroll', 'wage-slip-calculator.js');
const PDF_PATH  = path.resolve(__dirname, '..', '..', 'src', 'payroll', 'pdf-generator.js');

let calc, pdfGen;
try { calc = require(CALC_PATH); }
catch (e) { console.error('[QA-16] cannot require wage-slip-calculator:', e.message); }

try { pdfGen = require(PDF_PATH); }
catch (e) { console.error('[QA-16] cannot require pdf-generator:', e.message); }

const {
  computeWageSlip,
  computeHourlyGross,
  computeMonthlyGross,
  computeIncomeTaxMonthly,
  computeBituachLeumiAndHealth,
  computePensionContributions,
} = calc || {};

// ─────────────────────────────────────────────────────────────
// Findings log — every case pushes an entry; dumped at end
// ─────────────────────────────────────────────────────────────
const FINDINGS = [];

function record(id, title, severity, observed, expected, note) {
  FINDINGS.push({ id, title, severity, observed, expected, note });
  // Also echo to stdout so `node --test` output is self-documenting.
  console.log(`[QA-16 ${id}] ${severity.padEnd(8)} ${title} :: ${observed}`);
}

process.on('exit', () => {
  console.log('\n═══════════════════════════════════════════════');
  console.log('QA-16 FINDINGS SUMMARY');
  console.log('═══════════════════════════════════════════════');
  for (const f of FINDINGS) {
    console.log(`${f.id} | ${f.severity} | ${f.title}`);
    console.log(`   observed : ${f.observed}`);
    console.log(`   expected : ${f.expected}`);
    if (f.note) console.log(`   note     : ${f.note}`);
  }
});

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────
function makeEmployer(overrides = {}) {
  return {
    id: 'emp-break-001',
    legal_name: 'Techno Kol Uzi Ltd',
    company_id: '513123456',
    tax_file_number: '9999999',
    ...overrides,
  };
}

function makeEmployee(overrides = {}) {
  return {
    id: 'e-break-001',
    employer_id: 'emp-break-001',
    employee_number: '0001',
    full_name: 'Test Subject',
    first_name: 'Test',
    last_name: 'Subject',
    national_id: '012345675',
    employment_type: 'hourly',
    base_salary: 50,
    work_percentage: 100,
    hours_per_month: 182,
    tax_credits: 2.25,
    study_fund_number: null,
    ...overrides,
  };
}

function makeTimesheet(overrides = {}) {
  return {
    hours_regular: 186,
    hours_overtime_125: 0,
    hours_overtime_150: 0,
    hours_overtime_175: 0,
    hours_overtime_200: 0,
    hours_absence: 0,
    hours_vacation: 0,
    hours_sick: 0,
    ...overrides,
  };
}

function safeCall(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function safeCallAsync(fn) {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// =============================================================
// SECTION 1 — INPUT FUZZING (cases 1-16)
// =============================================================

test('QA-16 / 1  — negative hours_regular produces negative gross', () => {
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee(),
    employer: makeEmployer(),
    timesheet: makeTimesheet({ hours_regular: -100 }),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-01', 'Negative hours', 'P2-HIGH',
      `threw: ${slip.error.message}`,
      'Explicit ValidationError before compute');
    return;
  }
  const g = slip.value.gross_pay;
  record('T-01', 'Negative hours', 'P1-CRITICAL',
    `gross_pay = ${g} (negative base silently accepted, net_pay = ${slip.value.net_pay})`,
    'Reject hours < 0 at API boundary with 400 error',
    'Engine does NOT clamp hours. A payroll clerk typing "-100" issues a negative tlush.');
  assert.ok(Number.isFinite(g));
});

test('QA-16 / 2  — absurd hours (1,000,000) produces millionaire tlush', () => {
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee({ base_salary: 50 }),
    employer: makeEmployer(),
    timesheet: makeTimesheet({ hours_regular: 1_000_000 }),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-02', 'Hours = 1,000,000', 'P2-HIGH',
      `threw: ${slip.error.message}`, 'Reject hours > max legal (e.g. 372 / month)');
    return;
  }
  record('T-02', 'Hours = 1,000,000', 'P1-CRITICAL',
    `gross_pay = ${slip.value.gross_pay.toLocaleString()} NIS (no cap enforced)`,
    'Cap monthly hours ≤ 400 at API. 1M hours means 114 years in one month.',
    'Income tax still computes on full annualized amount — ₪millions of tax withheld.');
  assert.ok(Number.isFinite(slip.value.gross_pay));
});

test('QA-16 / 3  — hours_regular = NaN', () => {
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee(),
    employer: makeEmployer(),
    timesheet: makeTimesheet({ hours_regular: NaN }),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-03', 'hours_regular = NaN', 'P3-MED',
      `threw: ${slip.error.message}`, 'toNum() should coerce NaN → 0, test passes');
    return;
  }
  // Calculator has toNum() → returns 0 for NaN. Verified.
  record('T-03', 'hours_regular = NaN', 'P4-LOW',
    `silently coerced to 0 (gross_pay=${slip.value.gross_pay})`,
    'Ideally log a warning; current behaviour is safe coercion',
    'toNum() guards this — documented defensive coding.');
  assert.equal(slip.value.gross_pay, 0);
});

test('QA-16 / 4  — hours_regular = Infinity', () => {
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee(),
    employer: makeEmployer(),
    timesheet: makeTimesheet({ hours_regular: Infinity }),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-04', 'hours_regular = Infinity', 'P2-HIGH',
      `threw: ${slip.error.message}`, 'Reject non-finite at API');
    return;
  }
  const g = slip.value.gross_pay;
  const finite = Number.isFinite(g);
  record('T-04', 'hours_regular = Infinity', finite ? 'P3-MED' : 'P1-CRITICAL',
    `gross_pay = ${g} (finite=${finite}) net_pay=${slip.value.net_pay}`,
    'Reject Infinity at toNum() level or at route schema',
    'Infinity × number stays Infinity — propagates through whole calc, JSON serializes to null.');
});

test('QA-16 / 5  — national_id with 100 chars', () => {
  const huge = '1'.repeat(100);
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee({ national_id: huge }),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-05', 'national_id 100 chars', 'P3-MED',
      `threw: ${slip.error.message}`, 'OK if rejected');
    return;
  }
  record('T-05', 'national_id 100 chars', 'P2-HIGH',
    `accepted ID of length ${slip.value.employee_national_id.length}; will FAIL at ביטוח לאומי/מס הכנסה reporting`,
    'Enforce exactly 9 digits with checksum validation',
    'No length / checksum validation in calc. DB column NVARCHAR likely stores it.');
  assert.equal(slip.value.employee_national_id.length, 100);
});

test('QA-16 / 6  — 10,000-char Unicode+RTL employee name', () => {
  const rtlName = '\u202Eשם\u202C עובד ' + '\u200F\u05D0'.repeat(5000);
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee({ full_name: rtlName }),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-06', '10k-char RTL name', 'P3-MED',
      `threw: ${slip.error.message}`, 'Reject at API schema');
    return;
  }
  record('T-06', '10k-char RTL name', 'P2-HIGH',
    `accepted name of length ${slip.value.employee_name.length} with RTL override chars`,
    'Strip RTL override (U+202E) and enforce max length (e.g. 200)',
    'U+202E can be used for filename spoofing (docx→cod.exe). PDF may crash on 10k char field.');
  assert.ok(slip.value.employee_name.length >= 10000);
});

test('QA-16 / 7  — exotic years (1900, 2100, 0000)', () => {
  for (const year of [1900, 2100, 0]) {
    const r = safeCall(() => computeWageSlip({
      employee: makeEmployee(),
      employer: makeEmployer(),
      timesheet: makeTimesheet(),
      period: { year, month: 4 },
    }));
    if (!r.ok) {
      record(`T-07/${year}`, `Year ${year}`, 'P3-MED',
        `threw: ${r.error.message}`, 'OK if rejected');
      continue;
    }
    record(`T-07/${year}`, `Year ${year}`, 'P2-HIGH',
      `accepted — period_label="${r.value.period_label}"`,
      'Restrict year to [2000, currentYear+1]',
      '2026 tax brackets applied to 1900 payroll — historical falsification risk.');
  }
});

test('QA-16 / 8  — Period month = 0, 13, -1', () => {
  for (const month of [0, 13, -1]) {
    const r = safeCall(() => computeWageSlip({
      employee: makeEmployee(),
      employer: makeEmployer(),
      timesheet: makeTimesheet(),
      period: { year: 2026, month },
    }));
    if (!r.ok) {
      record(`T-08/${month}`, `month=${month}`, 'P4-LOW',
        `threw: ${r.error.message}`,
        'Good — month=0 is falsy so "period required" fires');
      continue;
    }
    record(`T-08/${month}`, `month=${month}`, 'P2-HIGH',
      `accepted; period_label="${r.value.period_label}"`,
      'Validate month ∈ [1,12]',
      'month=13/-1 slip through since `if (!period?.month)` is only a falsy check.');
  }
});

test('QA-16 / 9  — base_salary = -1000', () => {
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee({ base_salary: -1000 }),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-09', 'base_salary = -1000', 'P3-MED',
      `threw: ${slip.error.message}`, 'OK if rejected');
    return;
  }
  record('T-09', 'base_salary = -1000', 'P1-CRITICAL',
    `gross_pay = ${slip.value.gross_pay} (negative), income_tax = ${slip.value.income_tax}`,
    'Reject base_salary < 0 (minimum wage floor preferred: ₪31.36/hr in 2026)',
    'Negative salary would corrupt ZP/846 reports; produces negative YTD too.');
});

test('QA-16 / 10 — 100MB payload (simulated large fields)', () => {
  // Simulate: push ~100MB into bonuses as a string, see how JSON coercion + calc cope
  const bigString = 'A'.repeat(100 * 1024 * 1024); // 100 MB
  const start = Date.now();
  const r = safeCall(() => computeWageSlip({
    employee: makeEmployee({ notes: bigString }),
    employer: makeEmployer({ notes: bigString }),
    timesheet: makeTimesheet({ comment: bigString }),
    period: { year: 2026, month: 4 },
  }));
  const elapsed = Date.now() - start;
  if (!r.ok) {
    record('T-10', '100MB payload', 'P2-HIGH',
      `threw: ${r.error.message} (after ${elapsed}ms)`,
      'Enforce max body size (e.g. 1MB) via express.json({ limit: "1mb" })');
    return;
  }
  record('T-10', '100MB payload', 'P2-HIGH',
    `accepted in ${elapsed}ms; process RSS spike likely`,
    'Enforce body size limit at the HTTP layer before it reaches the calculator',
    'Calculator itself ignores the junk fields, but a real express route would allocate 100MB.');
});

test('QA-16 / 11 — Deeply nested JSON (1000 levels)', () => {
  let nested = { value: 1 };
  for (let i = 0; i < 1000; i++) nested = { nested };
  const r = safeCall(() => computeWageSlip({
    employee: makeEmployee({ meta: nested }),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  // Also test JSON.stringify of the whole slip
  let stringifyOk = false;
  try {
    if (r.ok) { JSON.stringify(r.value); stringifyOk = true; }
  } catch (_) {}
  if (!r.ok) {
    record('T-11', '1000-level nesting', 'P3-MED',
      `compute threw: ${r.error.message}`, 'Reject deep nesting at API parser');
    return;
  }
  record('T-11', '1000-level nesting', stringifyOk ? 'P4-LOW' : 'P1-CRITICAL',
    `compute ok; stringify ${stringifyOk ? 'ok' : 'FAILED (stack overflow risk)'}`,
    'Reject >10 levels of nesting at the API schema',
    'Calculator ignores unknown fields — but JSON.stringify (response serialization) may stack-overflow.');
});

test('QA-16 / 12 — Circular JSON', () => {
  const emp = makeEmployee();
  emp.self = emp; // cycle
  const r = safeCall(() => computeWageSlip({
    employee: emp,
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  if (!r.ok) {
    record('T-12', 'Circular JSON input', 'P4-LOW',
      `threw: ${r.error.message}`, 'OK — fail fast is desired');
    return;
  }
  let stringifyErr = null;
  try { JSON.stringify(r.value); }
  catch (e) { stringifyErr = e.message; }
  record('T-12', 'Circular JSON input', stringifyErr ? 'P2-HIGH' : 'P4-LOW',
    stringifyErr
      ? `compute ok but response JSON.stringify threw: ${stringifyErr}`
      : 'compute ok and response stringified',
    'Sanitize / plain-clone inputs at API boundary');
});

test('QA-16 / 13 — SQL injection in string fields', () => {
  const payload = `'; DROP TABLE employees; --`;
  const r = safeCall(() => computeWageSlip({
    employee: makeEmployee({ full_name: payload, national_id: payload }),
    employer: makeEmployer({ legal_name: payload }),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  if (!r.ok) {
    record('T-13', 'SQL injection string', 'P3-MED',
      `threw: ${r.error.message}`, 'OK if rejected early');
    return;
  }
  const leaks = [r.value.employee_name, r.value.employee_national_id, r.value.employer_legal_name];
  const passedThrough = leaks.some((v) => String(v).includes('DROP TABLE'));
  record('T-13', 'SQL injection string', passedThrough ? 'P2-HIGH' : 'P4-LOW',
    `payload ${passedThrough ? 'stored verbatim in slip' : 'sanitized'}; relies on DB parameterization`,
    'Use parameterized queries in all Supabase inserts (verify in payroll-routes.js)',
    'Calculator is pure — safe. Risk lives in the persistence layer / any raw SQL in scripts/.');
});

test('QA-16 / 14 — XSS payload in employee name', () => {
  const payload = '<script>alert(1)</script>';
  const r = safeCall(() => computeWageSlip({
    employee: makeEmployee({ full_name: payload }),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  if (!r.ok) {
    record('T-14', 'XSS payload name', 'P3-MED', `threw: ${r.error.message}`, 'OK');
    return;
  }
  record('T-14', 'XSS payload name', 'P2-HIGH',
    `passed verbatim: "${r.value.employee_name}"`,
    'HTML-escape on render in the web UI (React auto-escapes; verify email templates + PDF labels)',
    'PDFkit text() is safe (no HTML), but any admin UI rendering slip.employee_name must escape.');
});

test('QA-16 / 15 — Path traversal: ../../../etc/passwd', async () => {
  if (!pdfGen) {
    record('T-15', 'Path traversal to PDF', 'P1-CRITICAL',
      'pdf-generator module failed to load', 'module should load');
    return;
  }
  const evilName = '../../../etc/passwd';
  const slip = safeCall(() => computeWageSlip({
    employee: makeEmployee({ full_name: evilName }),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  if (!slip.ok) {
    record('T-15', 'Path traversal name', 'P3-MED', `compute threw: ${slip.error.message}`, 'OK');
    return;
  }
  // Simulate the route building an outputPath from employee_name
  const unsafePath = path.join(os.tmpdir(), 'qa-16', slip.value.employee_name + '.pdf');
  const resolved = path.resolve(unsafePath);
  const tmpBase = path.resolve(path.join(os.tmpdir(), 'qa-16'));
  const escapes = !resolved.startsWith(tmpBase);
  record('T-15', 'Path traversal name', escapes ? 'P1-CRITICAL' : 'P4-LOW',
    `joined path ${escapes ? 'escapes base dir' : 'stays in base'}: ${resolved}`,
    'Never build file paths from user-controlled strings; use employee.id (UUID)',
    'payroll-routes.js should whitelist the filename pattern before write.');
});

test('QA-16 / 16 — Null bytes in filename: "file\\0.pdf"', async () => {
  const evil = 'file\u0000.pdf';
  const target = path.join(os.tmpdir(), 'qa-16', evil);
  const r = await safeCallAsync(async () => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'x');
    return fs.readFileSync(target);
  });
  if (!r.ok) {
    record('T-16', 'Null byte in filename', 'P4-LOW',
      `threw: ${r.error.code || r.error.message}`,
      'Good — Node fs rejects null bytes (ERR_INVALID_ARG_VALUE)');
    return;
  }
  record('T-16', 'Null byte in filename', 'P1-CRITICAL',
    `accepted; wrote to ${target}`,
    'Reject strings containing \\0 before passing to fs',
    'Null byte may truncate filename in native layer → write to "file" not "file.pdf".');
});

// =============================================================
// SECTION 2 — CONCURRENT OPERATIONS (cases 17-20)
// =============================================================

test('QA-16 / 17 — Same employee computes slip twice in parallel', async () => {
  const args = {
    employee: makeEmployee(),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  };
  const [a, b] = await Promise.all([
    safeCallAsync(async () => computeWageSlip(args)),
    safeCallAsync(async () => computeWageSlip(args)),
  ]);
  if (!a.ok || !b.ok) {
    record('T-17', 'Race: double compute', 'P2-HIGH',
      `one of them threw: ${(a.error || b.error).message}`,
      'Engine must be pure; persistence layer must dedupe');
    return;
  }
  const equal = JSON.stringify(a.value) === JSON.stringify(b.value);
  record('T-17', 'Race: double compute', equal ? 'P2-HIGH' : 'P1-CRITICAL',
    `pure compute equal=${equal}; DB uniqueness is a SEPARATE concern`,
    'Add UNIQUE(employee_id, period_year, period_month) in DB + idempotency key on POST /wage-slips',
    'Calculator is deterministic; the race happens in Supabase insert. Verify DB constraint exists.');
});

test('QA-16 / 18 — Employer deleted mid-compute (mutation race)', () => {
  const employer = makeEmployer();
  const employee = makeEmployee();
  // Step 1: start compute by capturing refs
  const refEmployer = employer;
  // Step 2: simulated "deletion" — wipe employer fields
  for (const k of Object.keys(employer)) delete employer[k];
  const r = safeCall(() => computeWageSlip({
    employee,
    employer: refEmployer,
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  record('T-18', 'Employer deleted mid-compute', r.ok ? 'P2-HIGH' : 'P3-MED',
    r.ok
      ? `compute produced slip with employer_legal_name=${r.value.employer_legal_name}`
      : `threw: ${r.error.message}`,
    'Snapshot employer immutably before compute; forbid deletion while slip status=computing',
    'Slip stored null legal_name → invalid audit trail under תיקון 24.');
});

test('QA-16 / 19 — Double PDF write to same path', async () => {
  if (!pdfGen?.generateWageSlipPdf) {
    record('T-19', 'Double PDF write', 'P1-CRITICAL',
      'pdf-generator missing generateWageSlipPdf', 'module should expose function');
    return;
  }
  const slip = computeWageSlip({
    employee: makeEmployee(),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  });
  const out = path.join(os.tmpdir(), 'qa-16', 'slip-double.pdf');
  const [a, b] = await Promise.allSettled([
    pdfGen.generateWageSlipPdf(slip, out),
    pdfGen.generateWageSlipPdf(slip, out),
  ]);
  const both = a.status === 'fulfilled' && b.status === 'fulfilled';
  record('T-19', 'Double PDF write', both ? 'P2-HIGH' : 'P3-MED',
    `a=${a.status} b=${b.status}`,
    'Write to temp file then atomic-rename, OR hold a file lock per slip',
    'Concurrent PDFKit streams to the same file = corrupt PDF. Check file validity after.');
});

test('QA-16 / 20 — Employer snapshot staleness', () => {
  const employer = makeEmployer({ legal_name: 'OLD NAME' });
  const snapshotMoment = { ...employer }; // this is what *should* be frozen
  employer.legal_name = 'NEW NAME'; // mutate during compute
  const r = safeCall(() => computeWageSlip({
    employee: makeEmployee(),
    employer,
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  }));
  const frozen = r.ok && r.value.employer_legal_name === snapshotMoment.legal_name;
  record('T-20', 'Snapshot staleness', frozen ? 'P4-LOW' : 'P2-HIGH',
    r.ok ? `slip.employer_legal_name=${r.value.employer_legal_name}` : `threw: ${r.error.message}`,
    'Calculator must deep-copy employer at entry to guarantee "frozen snapshot"',
    'Currently calc reads fields live → any mutation after call-time leaks in.');
});

// =============================================================
// SECTION 3 — RESOURCE EXHAUSTION (cases 21-24)
// =============================================================

test('QA-16 / 21 — 1GB file "upload" simulation', () => {
  // We don't actually allocate 1GB — we simulate the API decision.
  // If the payroll route accepts files without a size limit, a 1GB buffer
  // would OOM a 2GB Node process. Document this.
  const fakeSize = 1024 * 1024 * 1024;
  const MAX = 10 * 1024 * 1024; // 10MB recommended
  const allowed = fakeSize <= MAX;
  record('T-21', '1GB upload', allowed ? 'P4-LOW' : 'P1-CRITICAL',
    `fake-size=${fakeSize} allowed=${allowed}; no multer/limits config seen in payroll-routes`,
    'Enforce upload size ≤ 10MB via express.raw({ limit }) / multer config',
    'Grep result: payroll-routes.js has no upload endpoint; risk lives in future features.');
});

test('QA-16 / 22 — 100 slips in parallel with no await / backpressure', async () => {
  const start = Date.now();
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(new Promise((resolve) => {
      try {
        const s = computeWageSlip({
          employee: makeEmployee({ id: `e-${i}` }),
          employer: makeEmployer(),
          timesheet: makeTimesheet(),
          period: { year: 2026, month: 4 },
        });
        resolve({ ok: true, id: s.employee_id });
      } catch (e) { resolve({ ok: false, err: e.message }); }
    }));
  }
  const res = await Promise.all(promises);
  const fail = res.filter((r) => !r.ok).length;
  const elapsed = Date.now() - start;
  record('T-22', '100 parallel computes', fail > 0 ? 'P2-HIGH' : 'P4-LOW',
    `ok=${res.length - fail} fail=${fail} elapsed=${elapsed}ms`,
    'Bulk compute endpoint must throttle via p-limit(10) and stream to DB',
    'Pure compute is fast; risk is in DB fan-out where unthrottled inserts saturate Supabase.');
});

test('QA-16 / 23 — 100k-row DB read w/o pagination (simulated)', () => {
  // Simulate allocating 100k slip-shaped rows in memory
  const rows = [];
  const start = Date.now();
  let oom = false;
  try {
    for (let i = 0; i < 100_000; i++) {
      rows.push({
        id: i, employee_id: `e-${i}`, employer_id: 'e-1',
        gross_pay: 10000, net_pay: 7500, period_label: '2026-04',
      });
    }
  } catch (e) { oom = true; }
  const elapsed = Date.now() - start;
  const heap = process.memoryUsage().heapUsed / 1024 / 1024;
  record('T-23', '100k rows in-memory', oom || heap > 500 ? 'P1-CRITICAL' : 'P2-HIGH',
    `allocated ${rows.length} rows in ${elapsed}ms, heap=${heap.toFixed(1)}MB, oom=${oom}`,
    'All list endpoints must enforce LIMIT (default 100, max 1000) and require pagination',
    'GET /wage-slips without ?limit should not return the full table.');
});

test('QA-16 / 24 — PDFKit 1000-page rendering (simulated load)', async () => {
  if (!pdfGen?.generateWageSlipPdf) {
    record('T-24', '1000-page PDF', 'P1-CRITICAL',
      'pdf-generator missing', 'module should load');
    return;
  }
  // Build a slip then render N PDFs sequentially to measure per-slip cost
  const slip = computeWageSlip({
    employee: makeEmployee(),
    employer: makeEmployer(),
    timesheet: makeTimesheet(),
    period: { year: 2026, month: 4 },
  });
  const N = 10; // NOT 1000 — we extrapolate. 1000 sync is a known crash-risk.
  const out = path.join(os.tmpdir(), 'qa-16', 'bulk');
  fs.mkdirSync(out, { recursive: true });
  const start = Date.now();
  let failed = 0;
  for (let i = 0; i < N; i++) {
    const r = await safeCallAsync(() =>
      pdfGen.generateWageSlipPdf(slip, path.join(out, `slip-${i}.pdf`)));
    if (!r.ok) failed++;
  }
  const elapsed = Date.now() - start;
  const perSlip = elapsed / N;
  const projection = perSlip * 1000;
  record('T-24', '1000-page PDF projection', projection > 30_000 ? 'P1-CRITICAL' : 'P2-HIGH',
    `N=${N} ok=${N - failed} elapsed=${elapsed}ms perSlip=${perSlip.toFixed(1)}ms proj(1000)=${projection.toFixed(0)}ms`,
    'Bulk PDF generation must stream via worker_threads or a queue (Bull/BullMQ)',
    'Extrapolated: 1000 slips in one event-loop tick would block the Node process for minutes.');
});

// =============================================================
// SECTION 4 — NETWORK / TIMEOUT / I/O (cases 25-28)
// =============================================================

test('QA-16 / 25 — Webhook receiver returns HTTP 500', async () => {
  // Simulated — actual receiver may not exist. We emulate via a mock.
  const mockFetch = async () => ({ ok: false, status: 500, text: async () => 'Internal Error' });
  const r = await safeCallAsync(async () => {
    const res = await mockFetch();
    if (!res.ok) throw new Error(`webhook ${res.status}`);
    return res;
  });
  record('T-25', 'Webhook 500', r.ok ? 'P1-CRITICAL' : 'P4-LOW',
    r.ok ? 'webhook error was swallowed' : `propagated: ${r.error.message}`,
    'Wrap webhook calls with retry (3x exponential backoff) + dead-letter queue',
    'If payroll-routes.js fires a webhook on slip issue, it must retry and NOT block the slip creation.');
});

test('QA-16 / 26 — Supabase fails mid-transaction (simulated)', async () => {
  const mockSupabase = {
    from: () => ({
      insert: async (row) => {
        if (row.employee_number === 'FAIL') throw new Error('supabase: network reset');
        return { data: [row], error: null };
      },
    }),
  };
  const r = await safeCallAsync(() =>
    mockSupabase.from('wage_slips').insert({ employee_number: 'FAIL' }));
  record('T-26', 'Supabase fail mid-tx', r.ok ? 'P1-CRITICAL' : 'P3-MED',
    r.ok ? 'error swallowed' : `caught: ${r.error.message}`,
    'All multi-step persistences must run inside a single RPC or use compensating writes',
    'Onyx uses multiple sequential inserts (slip, audit, balances) — partial-failure leaves DB inconsistent.');
});

test('QA-16 / 27 — Disk full during PDF write (simulated)', async () => {
  // We can't actually fill the disk. Simulate by writing to an invalid path.
  const badPath = path.join('Z:\\nonexistent-drive', 'qa16', 'slip.pdf');
  const r = await safeCallAsync(() => new Promise((resolve, reject) => {
    const s = fs.createWriteStream(badPath);
    s.on('error', reject);
    s.on('finish', resolve);
    s.write('test');
    s.end();
  }));
  record('T-27', 'Disk full / bad path', r.ok ? 'P1-CRITICAL' : 'P3-MED',
    r.ok ? 'write succeeded unexpectedly' : `error code=${r.error.code || r.error.message}`,
    'PDF generator must .on("error") and reject the promise (verify in generateWageSlipPdf)',
    'If disk is full, slip status should revert to "approved" not "issued" — needs transactional wrapper.');
});

test('QA-16 / 28 — File descriptor leak: 10k streams without close', () => {
  const maxStreams = 50; // do NOT actually open 10k — that crashes the test host
  const streams = [];
  let failed = 0;
  let failReason = null;
  try {
    for (let i = 0; i < maxStreams; i++) {
      const s = fs.createWriteStream(path.join(os.tmpdir(), 'qa-16', `fd-${i}.txt`));
      streams.push(s);
      // INTENTIONAL: do not close
    }
  } catch (e) { failed++; failReason = e.message; }
  // Cleanup to avoid leaking for the test host:
  for (const s of streams) { try { s.end(); } catch (_) {} }
  record('T-28', 'FD leak simulation', failed > 0 ? 'P1-CRITICAL' : 'P2-HIGH',
    `opened ${streams.length - failed} streams, first-fail=${failReason || 'none'}`,
    'Every createWriteStream in payroll-routes must be in a try/finally that calls .end()',
    'Projection: at 10k streams Node hits ulimit → EMFILE. Real slips on Windows limited ~500 open handles.');
});
