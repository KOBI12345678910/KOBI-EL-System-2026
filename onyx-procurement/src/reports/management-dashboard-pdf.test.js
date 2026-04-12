/**
 * Smoke tests for the Management Dashboard PDF generator.
 * Agent-61 — written 2026-04-11
 *
 * Run:
 *   node --test src/reports/management-dashboard-pdf.test.js
 *
 * Strategy:
 *   - Load the shipping fixture (sample-mgmt-data.json) as the "realistic"
 *     case and generate a full PDF.
 *   - Exercise every optional section by dropping it from a cloned fixture
 *     and confirming the PDF still builds (and is smaller).
 *   - Confirm that an almost-empty payload still renders the cover page.
 *   - Confirm the function rejects garbage input.
 *
 * Cleanup policy: generated PDFs are left in src/reports/tmp-mgmt-pdfs/
 * for manual inspection. The directory is wiped at the start of each run
 * so stale output doesn't accumulate.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  generateManagementDashboardPDF,
  _internals,
} = require('./management-dashboard-pdf.js');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sample-mgmt-data.json');
const TMP_DIR = path.join(__dirname, 'tmp-mgmt-pdfs');

// ─────────────────────────────────────────────────────────────
// Setup: wipe tmp dir once before tests run
// ─────────────────────────────────────────────────────────────
if (fs.existsSync(TMP_DIR)) {
  for (const f of fs.readdirSync(TMP_DIR)) {
    try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) { /* ignore */ }
  }
} else {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function loadFixture() {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return JSON.parse(raw);
}

function out(name) {
  return path.join(TMP_DIR, name);
}

function pdfHeader(file) {
  return fs.readFileSync(file).subarray(0, 5).toString('ascii');
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─────────────────────────────────────────────────────────────
// 1. Fixture round-trip: realistic PDF exists and is non-trivial
// ─────────────────────────────────────────────────────────────
test('generates a realistic management dashboard PDF from the fixture', async () => {
  const data = loadFixture();
  const target = out('01-full-fixture.pdf');
  const result = await generateManagementDashboardPDF(data, target);

  assert.equal(result.path, target);
  assert.ok(fs.existsSync(target), 'PDF should exist on disk');
  assert.ok(result.size > 2000, `PDF should be > 2000 bytes, got ${result.size}`);
  assert.equal(pdfHeader(target), '%PDF-', 'file should start with %PDF- header');
});

// ─────────────────────────────────────────────────────────────
// 2. Minimal data: only company + period — cover page still renders
// ─────────────────────────────────────────────────────────────
test('renders cover page even when all detail sections are missing', async () => {
  const minimal = {
    company: { legal_name: 'טכנו-קול עוזי בע"מ', company_id: '515123456' },
    period: { year: 2026, month: 3, label: '2026-03' },
  };
  const target = out('02-minimal.pdf');
  const result = await generateManagementDashboardPDF(minimal, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 1000, `minimal PDF size: ${result.size}`);
  assert.equal(pdfHeader(target), '%PDF-');
});

// ─────────────────────────────────────────────────────────────
// 3. Every section is optional — dropping them all still produces a PDF
// ─────────────────────────────────────────────────────────────
test('each optional section can be dropped individually without crashing', async () => {
  const keys = [
    'kpis',
    'revenue_breakdown',
    'expenses_breakdown',
    'top_suppliers',
    'top_customers',
    'headcount_trend',
    'overdue_invoices',
    'vat_liability',
    'outstanding_payments',
    'critical_alerts',
  ];
  for (const k of keys) {
    const data = loadFixture();
    delete data[k];
    const target = out(`03-without-${k}.pdf`);
    const result = await generateManagementDashboardPDF(data, target);
    assert.ok(fs.existsSync(target), `PDF missing after dropping ${k}`);
    assert.ok(result.size > 1000, `PDF without ${k} too small: ${result.size}`);
    assert.equal(pdfHeader(target), '%PDF-');
  }
});

// ─────────────────────────────────────────────────────────────
// 4. Dropping a section shrinks the PDF
// ─────────────────────────────────────────────────────────────
test('dropping heavy sections visibly shrinks the PDF', async () => {
  const full = loadFixture();
  const slim = deepClone(full);
  delete slim.top_suppliers;
  delete slim.top_customers;
  delete slim.revenue_breakdown;
  delete slim.expenses_breakdown;

  const a = await generateManagementDashboardPDF(full, out('04a-full.pdf'));
  const b = await generateManagementDashboardPDF(slim, out('04b-slim.pdf'));
  assert.ok(
    a.size > b.size,
    `expected full PDF (${a.size}) larger than slim PDF (${b.size})`,
  );
});

// ─────────────────────────────────────────────────────────────
// 5. Negative P&L renders without crash and picks a red-ish tile
//    (we don't introspect colors; just verify it builds)
// ─────────────────────────────────────────────────────────────
test('negative P&L still produces a valid PDF', async () => {
  const data = loadFixture();
  data.kpis.revenue = 500000;
  data.kpis.expenses = 800000;
  data.kpis.pnl = -300000;
  const target = out('05-negative-pnl.pdf');
  const result = await generateManagementDashboardPDF(data, target);
  assert.ok(result.size > 1000);
  assert.equal(pdfHeader(target), '%PDF-');
});

// ─────────────────────────────────────────────────────────────
// 6. Critical alerts section handles various severities
// ─────────────────────────────────────────────────────────────
test('critical alerts with mixed severities render cleanly', async () => {
  const data = loadFixture();
  data.critical_alerts = [
    { severity: 'critical', title: 'A', message: 'שגיאה קריטית' },
    { severity: 'high', title: 'B', message: 'שגיאה חמורה', count: 2 },
    { severity: 'medium', title: 'C', message: 'התראה בינונית', count: 1 },
    { severity: 'low', title: 'D', message: 'התראה נמוכה' },
    { severity: null, title: 'E', message: 'בלי חומרה' },
  ];
  const target = out('06-alerts-mixed.pdf');
  const result = await generateManagementDashboardPDF(data, target);
  assert.ok(result.size > 1000);
});

// ─────────────────────────────────────────────────────────────
// 7. Nested output directory is created on demand
// ─────────────────────────────────────────────────────────────
test('creates nested output directory if it does not exist', async () => {
  const nested = path.join(TMP_DIR, 'nested', 'deeper');
  if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
  const target = path.join(nested, '07-nested.pdf');
  const result = await generateManagementDashboardPDF(loadFixture(), target);
  assert.ok(fs.existsSync(nested));
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 1000);
});

// ─────────────────────────────────────────────────────────────
// 8. Invalid inputs reject
// ─────────────────────────────────────────────────────────────
test('rejects when data argument is not an object', async () => {
  await assert.rejects(
    () => generateManagementDashboardPDF(null, out('08a-null.pdf')),
    /data must be an object/,
  );
  await assert.rejects(
    () => generateManagementDashboardPDF('nope', out('08b-string.pdf')),
    /data must be an object/,
  );
});

test('rejects when outputPath is missing or not a string', async () => {
  await assert.rejects(
    () => generateManagementDashboardPDF(loadFixture(), ''),
    /outputPath must be a string/,
  );
  await assert.rejects(
    () => generateManagementDashboardPDF(loadFixture(), null),
    /outputPath must be a string/,
  );
});

// ─────────────────────────────────────────────────────────────
// 9. Formatter sanity checks
// ─────────────────────────────────────────────────────────────
test('internal formatters behave as expected', () => {
  const { formatMoney, formatMoneyShort, formatInt, formatPct } = _internals;

  // formatMoney always returns a ₪-prefixed localised string
  const m = formatMoney(1234.5);
  assert.ok(m.startsWith('₪'), `expected ₪-prefix, got "${m}"`);
  assert.ok(m.includes('1,234.50') || m.includes('1234.50'), `got "${m}"`);

  // formatMoneyShort collapses large numbers
  assert.equal(formatMoneyShort(1_500_000), '₪ 1.50M');
  assert.equal(formatMoneyShort(2500), '₪ 2.5K');
  assert.equal(formatMoneyShort(0), '₪ 0');

  // formatInt
  assert.equal(formatInt(0), '0');
  assert.ok(formatInt(1234567).includes('1'));

  // formatPct
  assert.equal(formatPct(12.345), '12.3%');
  assert.equal(formatPct(0), '0.0%');
});

// ─────────────────────────────────────────────────────────────
// 10. Two calls with same path overwrite cleanly
// ─────────────────────────────────────────────────────────────
test('two calls with same path overwrite without leaking', async () => {
  const target = out('10-overwrite.pdf');
  const r1 = await generateManagementDashboardPDF(loadFixture(), target);
  const mtime1 = fs.statSync(target).mtimeMs;

  const data2 = loadFixture();
  data2.kpis.revenue = 999999;
  const r2 = await generateManagementDashboardPDF(data2, target);
  const mtime2 = fs.statSync(target).mtimeMs;

  assert.ok(fs.existsSync(target));
  assert.ok(r1.size > 1000 && r2.size > 1000);
  assert.ok(mtime2 >= mtime1, 'second write should be at or after first write');
  assert.equal(pdfHeader(target), '%PDF-');
});
