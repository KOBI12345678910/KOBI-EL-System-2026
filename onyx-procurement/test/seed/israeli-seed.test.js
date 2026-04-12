/**
 * Israeli Seed Generator — Unit Tests
 * ═══════════════════════════════════════════════════════════════════════
 * Agent X-85 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Run:
 *   node --test test/seed/israeli-seed.test.js
 *
 * Coverage:
 *   - Determinism: same seed → byte-identical output
 *   - Independence: different seeds → different output
 *   - Count accuracy: generateXxx(N).length === N
 *   - ID correctness: ת.ז and company-IDs pass the Luhn-like check
 *   - Hebrew preservation: output strings contain Hebrew characters
 *   - Distribution realism: role weights, business/private mix
 *   - Payroll math: gross = sum(components) + net
 *   - generateAll: full fixture shape + nested counts
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const modPath = path.resolve(
  __dirname, '..', '..', 'src', 'seed', 'israeli-seed.js'
);
const {
  IsraeliSeedGenerator,
  POOLS,
  TAX_BRACKETS_2026,
  mulberry32,
  embeddedGenerateValidTZ,
  generateValidCompanyId,
  computeIncomeTax,
  computeBituachLeumi,
  computeMasBriut,
  heToLatinSlug,
} = require(modPath);

// Validator is present in this repo — used for ID cross-checks.
const tzPath = path.resolve(
  __dirname, '..', '..', 'src', 'validators', 'teudat-zehut.js'
);
const { validateTeudatZehut } = require(tzPath);

const companyIdPath = path.resolve(
  __dirname, '..', '..', 'src', 'validators', 'company-id.js'
);
const { validateCompanyId } = require(companyIdPath);

// ─────────────────────────────────────────────────────────────────────
// Hebrew character detection — anything in the Hebrew Unicode block
// ─────────────────────────────────────────────────────────────────────
const HEBREW_RE = /[\u0590-\u05FF]/;

function containsHebrew(str) {
  return typeof str === 'string' && HEBREW_RE.test(str);
}

// ─────────────────────────────────────────────────────────────────────
// Mulberry32 — basic sanity
// ─────────────────────────────────────────────────────────────────────

test('mulberry32 — deterministic across instances', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let i = 0; i < 100; i++) {
    assert.strictEqual(a(), b());
  }
});

test('mulberry32 — different seeds produce different streams', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let sameCount = 0;
  for (let i = 0; i < 50; i++) if (a() === b()) sameCount += 1;
  assert.ok(sameCount < 5, 'streams should mostly differ');
});

test('mulberry32 — output in [0, 1)', () => {
  const r = mulberry32(99);
  for (let i = 0; i < 200; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Embedded TZ generator — verify every output passes the real validator
// ─────────────────────────────────────────────────────────────────────

test('embeddedGenerateValidTZ — all output is valid per validator', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const tz = embeddedGenerateValidTZ(r);
    const result = validateTeudatZehut(tz);
    assert.ok(result.valid, `Generated TZ ${tz} failed validation: ${result.reason}`);
    assert.strictEqual(tz.length, 9);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Company-ID generator — verify every output passes the company validator
// ─────────────────────────────────────────────────────────────────────

test('generateValidCompanyId — default prefix 513 passes company validator', () => {
  const r = mulberry32(99);
  for (let i = 0; i < 200; i++) {
    const id = generateValidCompanyId(r, '513');
    const result = validateCompanyId(id);
    assert.ok(result.valid, `Generated company ID ${id} failed: ${result.reason && result.reason.en}`);
    assert.strictEqual(id.length, 9);
    assert.ok(id.startsWith('513'), `Expected prefix 513, got ${id}`);
  }
});

test('generateValidCompanyId — supports different prefixes', () => {
  const r = mulberry32(42);
  for (const prefix of ['510', '511', '512', '513', '514']) {
    const id = generateValidCompanyId(r, prefix);
    assert.ok(id.startsWith(prefix), `Expected prefix ${prefix}, got ${id}`);
    const result = validateCompanyId(id);
    assert.ok(result.valid, `ID ${id} with prefix ${prefix} failed validation`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// generateSupplier
// ─────────────────────────────────────────────────────────────────────

test('generateSupplier — count accuracy', () => {
  const g = new IsraeliSeedGenerator({ seed: 1 });
  assert.strictEqual(g.generateSupplier(0).length, 0);
  assert.strictEqual(g.generateSupplier(1).length, 1);
  assert.strictEqual(g.generateSupplier(50).length, 50);
});

test('generateSupplier — determinism (same seed → same output)', () => {
  const a = new IsraeliSeedGenerator({ seed: 12345 });
  const b = new IsraeliSeedGenerator({ seed: 12345 });
  const sa = a.generateSupplier(20);
  const sb = b.generateSupplier(20);
  assert.deepStrictEqual(sa, sb);
});

test('generateSupplier — different seeds → different output', () => {
  const a = new IsraeliSeedGenerator({ seed: 1 });
  const b = new IsraeliSeedGenerator({ seed: 2 });
  const sa = a.generateSupplier(10);
  const sb = b.generateSupplier(10);
  // Names should differ for at least half
  let different = 0;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i].name !== sb[i].name) different += 1;
  }
  assert.ok(different >= 5, `Expected at least 5/10 different, got ${different}`);
});

test('generateSupplier — Hebrew names and addresses', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const suppliers = g.generateSupplier(15);
  for (const s of suppliers) {
    assert.ok(containsHebrew(s.name), `name not Hebrew: ${s.name}`);
    assert.ok(containsHebrew(s.address.street), `street not Hebrew: ${s.address.street}`);
    assert.ok(containsHebrew(s.address.city), `city not Hebrew: ${s.address.city}`);
    assert.ok(containsHebrew(s.contact_person.full_name), `contact not Hebrew: ${s.contact_person.full_name}`);
  }
});

test('generateSupplier — valid 9-digit company ID (checksum)', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const suppliers = g.generateSupplier(30);
  for (const s of suppliers) {
    assert.strictEqual(s.company_id.length, 9, `Bad length: ${s.company_id}`);
    assert.ok(/^\d{9}$/.test(s.company_id), `Non-numeric: ${s.company_id}`);
    const result = validateCompanyId(s.company_id);
    assert.ok(result.valid, `Invalid company_id ${s.company_id}: ${result.reason && result.reason.en}`);
    assert.ok(s.company_id.startsWith('513'), `Expected 513 prefix: ${s.company_id}`);
  }
});

test('generateSupplier — Bezeq-style phone numbers', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const suppliers = g.generateSupplier(20);
  for (const s of suppliers) {
    // Land line: 0X-NNN-NNNN
    assert.ok(
      /^0[2-9]-\d{3}-\d{4}$/.test(s.phone),
      `Bad land-line format: ${s.phone}`
    );
    // Mobile: 05N-NNN-NNNN
    assert.ok(
      /^05[0-8]-\d{3}-\d{4}$/.test(s.mobile),
      `Bad mobile format: ${s.mobile}`
    );
  }
});

test('generateSupplier — address has real city name', () => {
  const knownCities = new Set(POOLS.CITIES.map(c => c.he));
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const suppliers = g.generateSupplier(30);
  for (const s of suppliers) {
    assert.ok(knownCities.has(s.address.city), `Unknown city: ${s.address.city}`);
  }
});

test('generateSupplier — industrial street pool used', () => {
  const industrial = new Set(POOLS.INDUSTRIAL_STREETS);
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const suppliers = g.generateSupplier(20);
  for (const s of suppliers) {
    assert.ok(
      industrial.has(s.address.street),
      `Non-industrial street on supplier: ${s.address.street}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// generateCustomer
// ─────────────────────────────────────────────────────────────────────

test('generateCustomer — determinism', () => {
  const a = new IsraeliSeedGenerator({ seed: 999 });
  const b = new IsraeliSeedGenerator({ seed: 999 });
  assert.deepStrictEqual(a.generateCustomer(30), b.generateCustomer(30));
});

test('generateCustomer — mix of business + private (~60/40)', () => {
  const g = new IsraeliSeedGenerator({ seed: 77 });
  const customers = g.generateCustomer(500);
  const biz = customers.filter(c => c.kind === 'business').length;
  const priv = customers.filter(c => c.kind === 'private').length;
  assert.strictEqual(biz + priv, 500);
  // Allow wide band: 40..80% business is fine
  assert.ok(biz >= 200 && biz <= 400, `business count out of band: ${biz}/500`);
  assert.ok(priv >= 100 && priv <= 300, `private count out of band: ${priv}/500`);
});

test('generateCustomer — private customers have valid ת.ז', () => {
  const g = new IsraeliSeedGenerator({ seed: 77 });
  const customers = g.generateCustomer(200);
  const privates = customers.filter(c => c.kind === 'private');
  assert.ok(privates.length > 0);
  for (const p of privates) {
    assert.strictEqual(p.teudat_zehut.length, 9);
    const r = validateTeudatZehut(p.teudat_zehut);
    assert.ok(r.valid, `Invalid TZ ${p.teudat_zehut}: ${r.reason}`);
  }
});

test('generateCustomer — business customers have valid company_id', () => {
  const g = new IsraeliSeedGenerator({ seed: 88 });
  const customers = g.generateCustomer(200);
  const biz = customers.filter(c => c.kind === 'business');
  for (const b of biz) {
    const r = validateCompanyId(b.company_id);
    assert.ok(r.valid, `Invalid company_id ${b.company_id}`);
  }
});

test('generateCustomer — Hebrew name preservation', () => {
  const g = new IsraeliSeedGenerator({ seed: 11 });
  const customers = g.generateCustomer(40);
  for (const c of customers) {
    assert.ok(containsHebrew(c.name), `Customer name not Hebrew: ${c.name}`);
    assert.ok(containsHebrew(c.address.city), `City not Hebrew: ${c.address.city}`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// generateEmployee
// ─────────────────────────────────────────────────────────────────────

test('generateEmployee — determinism', () => {
  const a = new IsraeliSeedGenerator({ seed: 555 });
  const b = new IsraeliSeedGenerator({ seed: 555 });
  assert.deepStrictEqual(a.generateEmployee(25), b.generateEmployee(25));
});

test('generateEmployee — valid ת.ז for every employee', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(50);
  for (const e of emps) {
    assert.strictEqual(e.teudat_zehut.length, 9);
    const r = validateTeudatZehut(e.teudat_zehut);
    assert.ok(r.valid, `Invalid TZ ${e.teudat_zehut}: ${r.reason}`);
  }
});

test('generateEmployee — ages in [20, 65]', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(100);
  for (const e of emps) {
    assert.ok(e.age >= 20 && e.age <= 65, `Age out of band: ${e.age}`);
  }
});

test('generateEmployee — tenure does not exceed age-18', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(80);
  for (const e of emps) {
    const hireYear = parseInt(e.hire_date.slice(0, 4), 10);
    const tenureYears = 2026 - hireYear;
    assert.ok(tenureYears <= e.age - 18, `Tenure ${tenureYears} > age-18 (age=${e.age})`);
  }
});

test('generateEmployee — roles drawn from ROLES catalog', () => {
  const known = new Set(POOLS.ROLES.map(r => r.code));
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(50);
  for (const e of emps) {
    assert.ok(known.has(e.role_code), `Unknown role code: ${e.role_code}`);
    assert.ok(containsHebrew(e.role_he), `Role Hebrew missing: ${e.role_he}`);
  }
});

test('generateEmployee — production roles dominate (realism)', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(200);
  const production = emps.filter(e =>
    ['prod_worker','welder','cnc_op','laser_op','crew_lead','shift_mgr','prod_mgr','quality'].includes(e.role_code)
  ).length;
  // We weight production ~57% of the weighted pool — allow a wide band
  assert.ok(production >= 80, `Expected ≥80 production, got ${production}`);
});

test('generateEmployee — Hebrew name components', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(30);
  for (const e of emps) {
    assert.ok(containsHebrew(e.first_name), `Bad first: ${e.first_name}`);
    assert.ok(containsHebrew(e.last_name), `Bad last: ${e.last_name}`);
    assert.ok(containsHebrew(e.full_name));
    assert.ok(containsHebrew(e.department));
  }
});

test('generateEmployee — base wage within role ± 15%', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(100);
  const rolesByCode = new Map(POOLS.ROLES.map(r => [r.code, r]));
  for (const e of emps) {
    const role = rolesByCode.get(e.role_code);
    const min = role.base * 0.85 - 10;
    const max = role.base * 1.15 + 10;
    assert.ok(
      e.base_monthly_wage_nis >= min && e.base_monthly_wage_nis <= max,
      `Wage ${e.base_monthly_wage_nis} out of band [${min}, ${max}] for role ${e.role_code}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// generateItem
// ─────────────────────────────────────────────────────────────────────

test('generateItem — determinism', () => {
  const a = new IsraeliSeedGenerator({ seed: 321 });
  const b = new IsraeliSeedGenerator({ seed: 321 });
  assert.deepStrictEqual(a.generateItem(40), b.generateItem(40));
});

test('generateItem — SKU encodes category + dimension', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const items = g.generateItem(50);
  const cats = new Set(POOLS.ITEM_CATEGORIES.map(c => c.code));
  for (const it of items) {
    const prefix = it.sku.split('-')[0];
    assert.ok(cats.has(prefix), `Unknown SKU prefix: ${prefix}`);
    assert.ok(it.sku.includes('-'), `SKU missing separator: ${it.sku}`);
  }
});

test('generateItem — Hebrew names + unit preserved', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const items = g.generateItem(40);
  for (const it of items) {
    assert.ok(containsHebrew(it.name_he));
    assert.ok(containsHebrew(it.category_he));
    assert.ok(containsHebrew(it.unit_he));
  }
});

test('generateItem — prices within category band', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const items = g.generateItem(200);
  const catByCode = new Map(POOLS.ITEM_CATEGORIES.map(c => [c.code, c]));
  for (const it of items) {
    const cat = catByCode.get(it.category_code);
    assert.ok(
      it.unit_price_nis >= cat.priceMin && it.unit_price_nis <= cat.priceMax,
      `Price ${it.unit_price_nis} outside [${cat.priceMin}, ${cat.priceMax}] for ${cat.code}`
    );
    // Cost must be lower than price (margin exists)
    assert.ok(it.unit_cost_nis < it.unit_price_nis,
      `Cost ${it.unit_cost_nis} >= price ${it.unit_price_nis}`);
  }
});

test('generateItem — VAT rate is 17%', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const items = g.generateItem(20);
  for (const it of items) {
    assert.strictEqual(it.vat_rate, 0.17);
  }
});

// ─────────────────────────────────────────────────────────────────────
// generateInvoice
// ─────────────────────────────────────────────────────────────────────

test('generateInvoice — requires suppliers and items', () => {
  const g = new IsraeliSeedGenerator({ seed: 1 });
  assert.throws(() => g.generateInvoice(5, {}), /קלט ריק|empty/);
  assert.throws(() => g.generateInvoice(5, { suppliers: [] }), /קלט ריק|empty/);
});

test('generateInvoice — determinism', () => {
  const a = new IsraeliSeedGenerator({ seed: 42 });
  const suppA = a.generateSupplier(5);
  const itemsA = a.generateItem(10);
  const invA = a.generateInvoice(20, { suppliers: suppA, items: itemsA });

  const b = new IsraeliSeedGenerator({ seed: 42 });
  const suppB = b.generateSupplier(5);
  const itemsB = b.generateItem(10);
  const invB = b.generateInvoice(20, { suppliers: suppB, items: itemsB });

  assert.deepStrictEqual(invA, invB);
});

test('generateInvoice — VAT math: subtotal + 17% = total', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const supp = g.generateSupplier(5);
  const items = g.generateItem(10);
  const invs = g.generateInvoice(30, { suppliers: supp, items: items });
  for (const inv of invs) {
    const expectedVat = Math.round(inv.subtotal_nis * 0.17 * 100) / 100;
    const expectedTotal = Math.round((inv.subtotal_nis + expectedVat) * 100) / 100;
    assert.strictEqual(inv.vat_amount_nis, expectedVat,
      `VAT mismatch: ${inv.vat_amount_nis} vs ${expectedVat}`);
    assert.strictEqual(inv.total_nis, expectedTotal,
      `Total mismatch: ${inv.total_nis} vs ${expectedTotal}`);
  }
});

test('generateInvoice — line totals sum to subtotal', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const supp = g.generateSupplier(3);
  const items = g.generateItem(10);
  const invs = g.generateInvoice(25, { suppliers: supp, items: items });
  for (const inv of invs) {
    const sum = inv.lines.reduce((acc, l) => acc + l.line_total_nis, 0);
    assert.strictEqual(Math.round(sum * 100) / 100, inv.subtotal_nis,
      `Line sum ${sum} != subtotal ${inv.subtotal_nis}`);
    assert.ok(inv.lines.length >= 1 && inv.lines.length <= 8);
  }
});

test('generateInvoice — allocation number is 7 digits', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const supp = g.generateSupplier(3);
  const items = g.generateItem(10);
  const invs = g.generateInvoice(20, { suppliers: supp, items: items });
  for (const inv of invs) {
    assert.ok(/^\d{7}$/.test(inv.allocation_number),
      `Bad allocation: ${inv.allocation_number}`);
  }
});

test('generateInvoice — due date respects supplier payment terms', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const supp = g.generateSupplier(3);
  const items = g.generateItem(10);
  const invs = g.generateInvoice(15, { suppliers: supp, items: items });
  for (const inv of invs) {
    const issue = new Date(inv.issue_date + 'T00:00:00Z');
    const due = new Date(inv.due_date + 'T00:00:00Z');
    const diffDays = Math.round((due - issue) / 86400000);
    const supplier = supp.find(s => s.id === inv.supplier_id);
    assert.strictEqual(diffDays, supplier.payment_terms_days,
      `Terms mismatch: ${diffDays} vs ${supplier.payment_terms_days}`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// generatePayroll
// ─────────────────────────────────────────────────────────────────────

test('generatePayroll — determinism', () => {
  const a = new IsraeliSeedGenerator({ seed: 42 });
  const empsA = a.generateEmployee(10);
  const payA = a.generatePayroll(empsA, '2026-03');

  const b = new IsraeliSeedGenerator({ seed: 42 });
  const empsB = b.generateEmployee(10);
  const payB = b.generatePayroll(empsB, '2026-03');

  assert.deepStrictEqual(payA, payB);
});

test('generatePayroll — one payslip per employee', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(20);
  const slips = g.generatePayroll(emps, '2026-03');
  assert.strictEqual(slips.length, emps.length);
});

test('generatePayroll — month format enforced', () => {
  const g = new IsraeliSeedGenerator({ seed: 1 });
  const emps = g.generateEmployee(2);
  assert.throws(() => g.generatePayroll(emps, '2026-3'));
  assert.throws(() => g.generatePayroll(emps, '202603'));
  assert.throws(() => g.generatePayroll(emps, null));
});

test('generatePayroll — accounting identity gross = net + deductions', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(30);
  const slips = g.generatePayroll(emps, '2026-03');
  for (const s of slips) {
    const sumDeductions = Math.round(
      (s.income_tax_nis + s.bituach_leumi_nis + s.mas_briut_nis + s.pension_employee_nis) * 100
    ) / 100;
    assert.strictEqual(sumDeductions, s.total_deductions_nis,
      `Deductions mismatch for ${s.employee_id}`);
    const expectedNet = Math.round((s.gross_wage_nis - sumDeductions) * 100) / 100;
    assert.strictEqual(s.net_wage_nis, expectedNet,
      `Net mismatch for ${s.employee_id}: ${s.net_wage_nis} vs ${expectedNet}`);
  }
});

test('generatePayroll — positive net wage', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(50);
  const slips = g.generatePayroll(emps, '2026-03');
  for (const s of slips) {
    assert.ok(s.net_wage_nis > 0, `Non-positive net: ${s.net_wage_nis} (gross ${s.gross_wage_nis})`);
    assert.ok(s.net_wage_nis < s.gross_wage_nis);
  }
});

test('generatePayroll — employer contributions recorded', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const emps = g.generateEmployee(15);
  const slips = g.generatePayroll(emps, '2026-03');
  for (const s of slips) {
    // Employer pension ≈ 6.5% of gross
    const expectedEmpP = Math.round(s.gross_wage_nis * 0.065 * 100) / 100;
    assert.strictEqual(s.pension_employer_nis, expectedEmpP);
    // Employer severance ≈ 8.33% of gross
    const expectedSev = Math.round(s.gross_wage_nis * 0.0833 * 100) / 100;
    assert.strictEqual(s.severance_employer_nis, expectedSev);
  }
});

test('computeIncomeTax — zero wage → zero tax', () => {
  assert.strictEqual(computeIncomeTax(0), 0);
});

test('computeIncomeTax — high wage hits top bracket', () => {
  const taxHigh = computeIncomeTax(100000, 2.25);
  assert.ok(taxHigh > 30000, `Expected >30k tax on 100k, got ${taxHigh}`);
});

test('computeBituachLeumi — reduced bracket for low income', () => {
  const bl = computeBituachLeumi(5000);
  assert.strictEqual(bl, Math.round(5000 * 0.035 * 100) / 100);
});

test('computeBituachLeumi — full bracket above threshold', () => {
  const bl = computeBituachLeumi(12000);
  // Below threshold: 7522 * 0.035 = 263.27
  // Above: (12000-7522) * 0.07 = 313.46
  const expected = Math.round((7522 * 0.035 + (12000 - 7522) * 0.07) * 100) / 100;
  assert.strictEqual(bl, expected);
});

test('computeMasBriut — similar two-bracket behaviour', () => {
  const h = computeMasBriut(5000);
  assert.strictEqual(h, Math.round(5000 * 0.031 * 100) / 100);
});

// ─────────────────────────────────────────────────────────────────────
// generateAll
// ─────────────────────────────────────────────────────────────────────

test('generateAll — default counts + full shape', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const all = g.generateAll();
  assert.strictEqual(typeof all.seed, 'number');
  assert.strictEqual(all.suppliers.length, 20);
  assert.strictEqual(all.customers.length, 50);
  assert.strictEqual(all.employees.length, 15);
  assert.strictEqual(all.items.length, 40);
  assert.strictEqual(all.invoices.length, 100);
  assert.strictEqual(all.payroll.length, 15 * 3); // 3 months
  assert.deepStrictEqual(all.counts, {
    suppliers: 20,
    customers: 50,
    employees: 15,
    items: 40,
    invoices: 100,
    payroll: 45,
  });
});

test('generateAll — determinism across full tree', () => {
  const a = new IsraeliSeedGenerator({ seed: 42 });
  const b = new IsraeliSeedGenerator({ seed: 42 });
  assert.deepStrictEqual(a.generateAll({
    suppliers: 5, customers: 10, employees: 5, items: 10,
    invoices: 15, months: ['2026-01','2026-02'],
  }), b.generateAll({
    suppliers: 5, customers: 10, employees: 5, items: 10,
    invoices: 15, months: ['2026-01','2026-02'],
  }));
});

test('generateAll — supplier/item counts flow into invoices', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const all = g.generateAll({
    suppliers: 3, customers: 5, employees: 3,
    items: 5, invoices: 20, months: ['2026-03'],
  });
  const supplierIds = new Set(all.suppliers.map(s => s.id));
  for (const inv of all.invoices) {
    assert.ok(supplierIds.has(inv.supplier_id));
  }
});

// ─────────────────────────────────────────────────────────────────────
// reset() and fork()
// ─────────────────────────────────────────────────────────────────────

test('reset() — rewinds RNG so output repeats', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const first = g.generateSupplier(5);
  g.reset();
  const second = g.generateSupplier(5);
  assert.deepStrictEqual(first, second);
});

test('fork() — independent sub-generators', () => {
  const g = new IsraeliSeedGenerator({ seed: 42 });
  const a = g.fork('customers');
  const b = g.fork('customers');
  assert.deepStrictEqual(a.generateCustomer(10), b.generateCustomer(10));
  const c = g.fork('suppliers');
  assert.notDeepStrictEqual(a.generateCustomer(3), c.generateCustomer(3));
});

// ─────────────────────────────────────────────────────────────────────
// heToLatinSlug — stable outputs
// ─────────────────────────────────────────────────────────────────────

test('heToLatinSlug — empty / nullish safe', () => {
  assert.strictEqual(heToLatinSlug(''), 'il');
  assert.strictEqual(heToLatinSlug(null), 'il');
  assert.strictEqual(heToLatinSlug(undefined), 'il');
});

test('heToLatinSlug — maps Hebrew letters', () => {
  assert.ok(/^[a-z]+$/.test(heToLatinSlug('כהן')));
  assert.ok(/^[a-z]+$/.test(heToLatinSlug('לוי')));
});
