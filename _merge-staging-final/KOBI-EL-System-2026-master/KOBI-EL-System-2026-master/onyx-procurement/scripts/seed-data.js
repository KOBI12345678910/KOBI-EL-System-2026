#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
 * ONYX PROCUREMENT — Deterministic Seed Data Generator
 * Agent 36 / Techno-Kol Uzi mega-ERP build
 * ───────────────────────────────────────────────────────────────────────
 * Populates the Supabase PostgreSQL database with reproducible, realistic
 * sample data for suppliers, employers, employees, purchase orders,
 * tax invoices, customer payments, and wage slips.
 *
 *   USAGE:
 *     node scripts/seed-data.js           # insert seed rows (idempotent by batch)
 *     node scripts/seed-data.js --reset   # remove prior seed rows first, then insert
 *     node scripts/seed-data.js --batch=my-run-1   # custom batch id
 *
 * ENV:
 *   SUPABASE_URL                 (required)
 *   SUPABASE_SERVICE_ROLE_KEY    (required) — bypasses RLS
 *
 * IMMUTABLE DIRECTIVE: never blanket-delete. Only rows that carry the
 * current seed batch tag are removed on --reset. Everything else is
 * untouched. We only ever upgrade and grow.
 * ═══════════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const fs   = require('fs');

// Load .env if present (dotenv is a project dep) — tolerate absence.
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { createClient } = require('@supabase/supabase-js');

// ─────────────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const RESET   = argv.includes('--reset');
const DRY_RUN = argv.includes('--dry-run');
const batchArg = argv.find(a => a.startsWith('--batch='));
const BATCH_ID = batchArg ? batchArg.split('=')[1] : 'seed-2026-kobi-el';
const BATCH_TAG = `seed:${BATCH_ID}`;

// ─────────────────────────────────────────────────────────────────────
// ENV + CLIENT
// ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[seed-data] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('            Set them in .env or your shell before running this script.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ─────────────────────────────────────────────────────────────────────
// DETERMINISTIC PRNG — mulberry32 (no deps, reproducible)
// ─────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seed is derived deterministically from BATCH_ID so same batch => same data.
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const rng = mulberry32(hashSeed(BATCH_ID));

const rand     = () => rng();
const randInt  = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const randPick = (arr) => arr[Math.floor(rand() * arr.length)];
const randBool = (p = 0.5) => rand() < p;
const round2   = (n) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────
// ISRAELI DATA HELPERS
// ─────────────────────────────────────────────────────────────────────

// Valid 9-digit Israeli ת.ז checksum (Luhn variant used by משרד הפנים).
function generateIsraeliID() {
  const digits = [];
  for (let i = 0; i < 8; i++) digits.push(randInt(0, 9));
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let val = digits[i] * ((i % 2) + 1);
    if (val > 9) val -= 9;
    sum += val;
  }
  const check = (10 - (sum % 10)) % 10;
  digits.push(check);
  return digits.join('');
}

// ח"פ — 9-digit valid company registration number, same Luhn check.
function generateCompanyID() {
  // Israeli HP starts with 5 for limited companies; we'll mix.
  const prefix = randPick([5, 5, 5, 5, 3]); // 5 = Ltd, 3 = NPO
  const digits = [prefix];
  for (let i = 0; i < 7; i++) digits.push(randInt(0, 9));
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let val = digits[i] * ((i % 2) + 1);
    if (val > 9) val -= 9;
    sum += val;
  }
  const check = (10 - (sum % 10)) % 10;
  digits.push(check);
  return digits.join('');
}

function generatePhone() {
  const prefix = randPick(['050', '052', '053', '054', '055', '058']);
  let num = '';
  for (let i = 0; i < 7; i++) num += randInt(0, 9);
  return `+972${prefix.slice(1)}${num}`;
}

function generateBankAccount() {
  return {
    bank_code:   randPick(['10', '11', '12', '13', '14', '17', '20', '31']),
    bank_branch: String(randInt(100, 899)).padStart(3, '0'),
    account:     String(randInt(100000, 9999999))
  };
}

// ─────────────────────────────────────────────────────────────────────
// NAME / ADDRESS POOLS (Israeli, realistic)
// ─────────────────────────────────────────────────────────────────────
const SUPPLIER_NAME_PREFIXES = [
  'מתכת', 'סטיל', 'ברזל', 'אלומיניום', 'נירוסטה', 'זכוכית', 'פלדה',
  'יציקות', 'מסגריית', 'מבני', 'פרופילי', 'לוחות', 'חומרי', 'תעשיות',
  'מפעלי', 'אריחי', 'שיש', 'עץ ומתכת', 'כלי עבודה', 'חומרה'
];
const SUPPLIER_NAME_SUFFIXES = [
  'ישראל', 'הצפון', 'המרכז', 'הדרום', 'הנגב', 'השרון', 'המפרץ',
  'תל אביב', 'רחובות', 'חיפה', 'אשדוד', 'באר שבע', 'נתניה',
  'ירושלים', 'לוד', 'פתח תקווה', 'ראשון לציון', 'הרצליה', 'רמלה', 'יהוד'
];
const CITIES = [
  'תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד',
  'נתניה', 'באר שבע', 'חולון', 'בני ברק', 'רמת גן', 'אשקלון',
  'הרצליה', 'כפר סבא', 'רעננה', 'מודיעין', 'לוד', 'רמלה', 'נצרת', 'עכו'
];
const STREETS = [
  'הרצל', 'ז׳בוטינסקי', 'אלנבי', 'דיזנגוף', 'רוטשילד', 'בן גוריון',
  'ויצמן', 'אבן גבירול', 'הנביאים', 'המלאכה', 'התעשייה', 'הפלדה',
  'הברזל', 'המסגר', 'הסדנא', 'האורגים', 'העמל', 'היוצרים', 'התקווה', 'האלה'
];
const INDUSTRIAL_ZONES = [
  'אזור תעשייה חולון', 'אזור תעשייה ראשל"צ', 'אזור תעשייה יהוד',
  'אזור תעשייה נתניה', 'אזור תעשייה כפר סבא', 'אזור תעשייה לוד',
  'פארק תעשיות קיסריה', 'פארק ההייטק הרצליה', 'אזור תעשייה ברקן',
  'אזור תעשייה עומר'
];
const FIRST_NAMES_M = [
  'אבי', 'משה', 'יוסי', 'דוד', 'דני', 'רונן', 'ירון', 'אייל',
  'חיים', 'שלמה', 'עמית', 'ניר', 'גיא', 'אורי', 'רן'
];
const FIRST_NAMES_F = [
  'שרה', 'רחל', 'מיכל', 'ענת', 'נעמה', 'יעל', 'ליאת', 'טל',
  'אורלי', 'רותי', 'ליטל', 'דנה', 'הילה', 'שירה', 'רונית'
];
const LAST_NAMES = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'דהן', 'חדד',
  'אוחיון', 'עמר', 'בן דוד', 'אזולאי', 'שמש', 'שרון', 'כץ',
  'גולדברג', 'רוזן', 'פרידמן', 'וייס', 'הכהן'
];
const POSITIONS = [
  'ריתוך', 'מסגרות', 'חיתוך לייזר', 'הרכבה', 'צביעה', 'תכנון',
  'בקרת איכות', 'מנהל ייצור', 'לוגיסטיקה', 'רכש', 'חשבונאות',
  'מזכירה', 'נהג מסירות', 'מנהל פרויקט', 'עיבוד שבבי'
];
const DEPARTMENTS = [
  'ייצור', 'הנדסה', 'לוגיסטיקה', 'הנהלת חשבונות', 'משרד', 'מסירות', 'בקרת איכות'
];
const CATEGORIES = [
  'ברזל', 'נירוסטה', 'אלומיניום', 'זכוכית', 'פח', 'חומרה', 'צבע',
  'ריתוך', 'כלי עבודה', 'חלפי פלדה'
];
const PO_ITEM_NAMES = [
  'ברזל 12 מ"מ', 'ברזל 16 מ"מ', 'פרופיל 40×40', 'פרופיל 50×50',
  'פח 2 מ"מ', 'פח 3 מ"מ', 'נירוסטה 304', 'פרופיל אלומיניום 50×30',
  'זכוכית מחוסמת 10 מ"מ', 'זכוכית למינציה 8+8', 'מוט ריתוך', 'צבע אפוקסי',
  'שיש קררה', 'לוח עץ OSB', 'מברגה חשמלית', 'מגן פנים ריתוך'
];

// ─────────────────────────────────────────────────────────────────────
// MARKER / TAGGING STRATEGY
// Since schema has NO seed_batch_id column, we tag rows per table:
//   suppliers.tags[]       → includes BATCH_TAG
//   purchase_orders.tags[] → includes BATCH_TAG
//   employers.trading_name → suffixed with "[BATCH_TAG]"
//   employees.employee_number → prefixed with "SEED-"+shortBatch
//   tax_invoices.source_type = 'seed', source_id = BATCH_ID
//   customer_payments.notes  contains BATCH_TAG
//   wage_slips.notes         contains BATCH_TAG
//   customers.legal_name     suffixed with "[BATCH_TAG]" (seed-only customers)
// ─────────────────────────────────────────────────────────────────────
const shortBatch = BATCH_ID.slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
const EMP_NO_PREFIX = `SEED${shortBatch}`;

// ─────────────────────────────────────────────────────────────────────
// GENERATORS
// ─────────────────────────────────────────────────────────────────────
function genSupplier(i) {
  const name = `${randPick(SUPPLIER_NAME_PREFIXES)} ${randPick(SUPPLIER_NAME_SUFFIXES)} בע"מ`;
  const firstName = randPick([...FIRST_NAMES_M, ...FIRST_NAMES_F]);
  const lastName = randPick(LAST_NAMES);
  const contact = `${firstName} ${lastName}`;
  const phone = generatePhone();
  const slug = `supplier${i}`;
  return {
    name,
    contact_person: contact,
    phone,
    email: `${slug}@example.co.il`,
    whatsapp: phone,
    address: `${randPick(STREETS)} ${randInt(1, 120)}, ${randPick(INDUSTRIAL_ZONES)}`,
    country: 'ישראל',
    preferred_channel: randPick(['whatsapp', 'email', 'whatsapp']),
    default_payment_terms: randPick(['שוטף + 30', 'שוטף + 45', 'שוטף + 60', 'מזומן']),
    avg_delivery_days: randInt(2, 14),
    distance_km: randInt(5, 180),
    rating: randInt(5, 10),
    delivery_reliability: randInt(5, 10),
    quality_score: randInt(5, 10),
    total_orders: 0,
    total_spent: 0,
    risk_score: randInt(10, 60),
    active: true,
    notes: `ח"פ: ${generateCompanyID()} | ${BATCH_TAG}`,
    tags: [BATCH_TAG, 'seed', randPick(CATEGORIES)]
  };
}

function genEmployer(i) {
  const trading = `${randPick(SUPPLIER_NAME_PREFIXES)} ${randPick(SUPPLIER_NAME_SUFFIXES)}`;
  const legal = `${trading} בע"מ`;
  const companyId = generateCompanyID();
  return {
    legal_name: legal,
    trading_name: `${trading} [${BATCH_TAG}]`,
    company_id: companyId,
    tax_file_number: String(randInt(900000000, 999999999)),
    vat_file_number: companyId,
    bituach_leumi_number: String(randInt(900000000, 999999999)),
    address: `${randPick(STREETS)} ${randInt(1, 80)}`,
    city: randPick(CITIES),
    phone: generatePhone(),
    is_active: true
  };
}

function genEmployee(i, employerIds) {
  const isMale = randBool();
  const first = randPick(isMale ? FIRST_NAMES_M : FIRST_NAMES_F);
  const last  = randPick(LAST_NAMES);
  const type  = randBool(0.6) ? 'monthly' : 'hourly';
  const bank  = generateBankAccount();
  // hire dates across 2018..2025, birth dates 1965..2000
  const startYear = randInt(2018, 2025);
  const startMonth = randInt(1, 12);
  const startDay = randInt(1, 28);
  const birthYear = randInt(1965, 2000);
  const baseSalary = type === 'monthly'
    ? randInt(7000, 25000)                      // monthly gross
    : randInt(45, 120);                          // hourly rate

  return {
    employer_id: randPick(employerIds),
    employee_number: `${EMP_NO_PREFIX}-${String(i).padStart(4, '0')}`,
    national_id: generateIsraeliID(),
    first_name: first,
    last_name: last,
    birth_date: `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
    start_date: `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
    position: randPick(POSITIONS),
    department: randPick(DEPARTMENTS),
    employment_type: type,
    work_percentage: randPick([100, 100, 100, 80, 50]),
    base_salary: baseSalary,
    hours_per_month: type === 'monthly' ? 182 : 0,
    bank_code: bank.bank_code,
    bank_branch: bank.bank_branch,
    bank_account_number: bank.account,
    pension_fund: randPick(['מנורה מבטחים', 'הראל פנסיה', 'כלל פנסיה', 'מגדל פנסיה']),
    pension_fund_number: String(randInt(10000, 99999)),
    study_fund: randPick(['קרן השתלמות כללית', 'קרן השתלמות הראל', 'קרן השתלמות מנורה']),
    study_fund_number: String(randInt(10000, 99999)),
    tax_credits: 2.25,
    is_active: true,
    created_by: 'seed-data.js'
  };
}

function genPurchaseOrder(i, supplierIds, supplierNameById) {
  const supplierId = randPick(supplierIds);
  const subtotal = round2(randInt(1500, 80000) + rand());
  const deliveryFee = randBool(0.4) ? round2(randInt(50, 500)) : 0;
  const vatRate = 0.17;
  const vatAmount = round2((subtotal + deliveryFee) * vatRate);
  const total = round2(subtotal + deliveryFee + vatAmount);
  const status = randPick([
    'draft', 'pending_approval', 'approved', 'sent',
    'confirmed', 'shipped', 'delivered', 'closed'
  ]);
  const created = randDate2025to2026();
  const expected = new Date(created.getTime() + randInt(3, 30) * 86400_000);
  return {
    supplier_id: supplierId,
    supplier_name: supplierNameById.get(supplierId),
    subtotal,
    delivery_fee: deliveryFee,
    vat_amount: vatAmount,
    vat_rate: vatRate,
    total,
    currency: 'ILS',
    payment_terms: randPick(['שוטף + 30', 'שוטף + 45', 'שוטף + 60']),
    expected_delivery: expected.toISOString().slice(0, 10),
    delivery_address: 'ריבל 37, תל אביב',
    requested_by: randPick(['קובי אל', 'דני רכש', 'ציון מנהל']),
    approved_by: status !== 'draft' ? 'קובי אל' : null,
    approved_at: status !== 'draft' ? created.toISOString() : null,
    project_id: `PRJ-${randInt(1000, 9999)}`,
    project_name: `פרויקט ${randPick(CITIES)}`,
    source: randPick(['manual', 'rfq', 'auto_reorder']),
    status,
    original_price: round2(total * randInt(102, 115) / 100),
    negotiated_savings: round2(total * randInt(1, 12) / 100),
    negotiation_strategy: randPick(['bundle', 'volume_discount', 'competitive_bid']),
    notes: `PO seed ${i} | ${BATCH_TAG}`,
    tags: [BATCH_TAG, 'seed'],
    created_at: created.toISOString(),
    updated_at: created.toISOString()
  };
}

function randDate2025to2026() {
  // Range: 2025-01-01 .. 2026-11-30
  const start = Date.UTC(2025, 0, 1);
  const end   = Date.UTC(2026, 10, 30);
  return new Date(start + Math.floor(rand() * (end - start)));
}

function genTaxInvoice(i, supplierNames) {
  // Mix direction: 70% input (received), 30% output (issued)
  const direction = randBool(0.7) ? 'input' : 'output';
  const invoiceType = direction === 'input' ? 'received' : 'issued';
  const isExempt = randBool(0.10); // ~10% exempt (e.g. Eilat / export)
  const isZero   = !isExempt && randBool(0.05);
  const vatRate  = isExempt ? 0 : (isZero ? 0 : 0.17);
  const netAmount = round2(randInt(500, 45000) + rand());
  const vatAmount = round2(netAmount * vatRate);
  const grossAmount = round2(netAmount + vatAmount);
  const d = randDate2025to2026();
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const counterpartyName = direction === 'input'
    ? randPick(supplierNames)
    : `לקוח ${randPick(CITIES)} בע"מ`;
  return {
    invoice_type: invoiceType,
    direction,
    invoice_number: `${BATCH_ID.slice(0, 4).toUpperCase()}-${String(i).padStart(5, '0')}`,
    invoice_date: d.toISOString().slice(0, 10),
    value_date: d.toISOString().slice(0, 10),
    counterparty_id: generateCompanyID(),
    counterparty_name: counterpartyName,
    counterparty_address: `${randPick(STREETS)} ${randInt(1, 100)}, ${randPick(CITIES)}`,
    net_amount: netAmount,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    gross_amount: grossAmount,
    currency: 'ILS',
    fx_rate: 1.0,
    category: randPick(['goods', 'services', 'asset']),
    is_asset: randBool(0.08),
    is_zero_rate: isZero,
    is_exempt: isExempt,
    accounting_period: ym,
    allocation_number: isExempt || isZero ? null : String(randInt(100000000, 999999999)),
    allocation_verified: !isExempt && randBool(0.8),
    source_type: 'seed',
    source_id: BATCH_ID,
    status: randPick(['recorded', 'recorded', 'verified']),
    created_by: 'seed-data.js'
  };
}

function genCustomer(i) {
  const baseName = `לקוח ${randPick(CITIES)}`;
  return {
    name: baseName,
    legal_name: `${baseName} בע"מ [${BATCH_TAG}]`,
    tax_id: generateCompanyID(),
    tax_id_type: 'company',
    phone: generatePhone(),
    email: `customer${i}@example.co.il`,
    address_street: `${randPick(STREETS)} ${randInt(1, 150)}`,
    address_city: randPick(CITIES),
    address_postal: String(randInt(1000000, 9999999)),
    payment_terms_days: randPick([30, 45, 60]),
    credit_limit: randInt(50000, 500000),
    active: true
  };
}

function genCustomerPayment(i, customers) {
  const c = randPick(customers);
  const d = randDate2025to2026();
  return {
    receipt_number: `RCT-${BATCH_ID.slice(0, 4).toUpperCase()}-${String(i).padStart(6, '0')}`,
    payment_date: d.toISOString().slice(0, 10),
    customer_id: c.id,
    customer_name: c.name,
    amount: round2(randInt(500, 60000) + rand()),
    currency: 'ILS',
    payment_method: randPick(['bank_transfer', 'check', 'credit_card', 'cash', 'wire']),
    check_number: randBool(0.25) ? String(randInt(100000, 999999)) : null,
    check_bank: randBool(0.25) ? randPick(['לאומי', 'פועלים', 'דיסקונט', 'מזרחי טפחות']) : null,
    reference_number: `REF-${randInt(100000, 999999)}`,
    notes: `Seed payment ${i} | ${BATCH_TAG}`,
    reconciled: randBool(0.4),
    created_by: 'seed-data.js'
  };
}

function genWageSlip(employee, employer, year, month) {
  const isMonthly = employee.employment_type === 'monthly';
  const base = Number(employee.base_salary);
  const hoursRegular = isMonthly ? Number(employee.hours_per_month || 182) : randInt(140, 200);
  const hoursOT125   = randInt(0, 15);
  const hoursOT150   = randInt(0, 10);
  const rate = isMonthly ? (base / (employee.hours_per_month || 182)) : base;

  const basePay     = isMonthly ? base : round2(hoursRegular * rate);
  const overtimePay = round2(hoursOT125 * rate * 1.25 + hoursOT150 * rate * 1.5);
  const allowMeal   = round2(randInt(200, 600));
  const allowTravel = round2(randInt(150, 500));
  const bonuses     = randBool(0.15) ? round2(randInt(200, 2000)) : 0;

  const grossPay = round2(basePay + overtimePay + allowMeal + allowTravel + bonuses);

  // Israeli 2026 approximate brackets — simplified flat approximation for seed realism.
  const incomeTax = round2(Math.max(0, (grossPay - 6790) * 0.14));
  const bituachLeumi = round2(grossPay * 0.035);
  const healthTax    = round2(grossPay * 0.031);
  const pensionEmp   = round2(grossPay * 0.06);
  const studyFundEmp = round2(grossPay * 0.025);

  const totalDeductions = round2(incomeTax + bituachLeumi + healthTax + pensionEmp + studyFundEmp);
  const netPay = round2(grossPay - totalDeductions);

  const pensionEr = round2(grossPay * 0.0683);
  const studyEr   = round2(grossPay * 0.075);
  const severEr   = round2(grossPay * 0.0833);
  const blEr      = round2(grossPay * 0.0760);
  const htEr      = round2(grossPay * 0);

  return {
    employee_id: employee.id,
    employer_id: employer.id,
    period_year: year,
    period_month: month,
    period_label: `${year}-${String(month).padStart(2, '0')}`,
    pay_date: `${year}-${String(month).padStart(2, '0')}-09`,
    employee_number: employee.employee_number,
    employee_name: `${employee.first_name} ${employee.last_name}`,
    employee_national_id: employee.national_id,
    employer_legal_name: employer.legal_name,
    employer_company_id: employer.company_id,
    employer_tax_file: employer.tax_file_number,
    position: employee.position,
    department: employee.department,
    hours_regular: hoursRegular,
    hours_overtime_125: hoursOT125,
    hours_overtime_150: hoursOT150,
    hours_overtime_175: 0,
    hours_overtime_200: 0,
    hours_absence: 0,
    hours_vacation: randInt(0, 2),
    hours_sick: randInt(0, 2),
    hours_reserve: 0,
    base_pay: basePay,
    overtime_pay: overtimePay,
    vacation_pay: 0,
    sick_pay: 0,
    holiday_pay: 0,
    bonuses,
    commissions: 0,
    allowances_meal: allowMeal,
    allowances_travel: allowTravel,
    allowances_clothing: 0,
    allowances_phone: 0,
    other_earnings: 0,
    gross_pay: grossPay,
    income_tax: incomeTax,
    bituach_leumi: bituachLeumi,
    health_tax: healthTax,
    pension_employee: pensionEmp,
    study_fund_employee: studyFundEmp,
    severance_employee: 0,
    loans: 0,
    garnishments: 0,
    other_deductions: 0,
    total_deductions: totalDeductions,
    net_pay: netPay,
    pension_employer: pensionEr,
    study_fund_employer: studyEr,
    severance_employer: severEr,
    bituach_leumi_employer: blEr,
    health_tax_employer: htEr,
    vacation_balance: randInt(5, 25),
    sick_balance: randInt(10, 60),
    study_fund_balance: round2(randInt(1000, 50000)),
    severance_balance: round2(randInt(1000, 80000)),
    ytd_gross: round2(grossPay * month),
    ytd_income_tax: round2(incomeTax * month),
    ytd_bituach_leumi: round2(bituachLeumi * month),
    ytd_pension: round2(pensionEmp * month),
    status: 'issued',
    prepared_by: 'seed-data.js',
    notes: `Auto-generated seed slip | ${BATCH_TAG}`
  };
}

// ─────────────────────────────────────────────────────────────────────
// RESET — delete only rows owned by this seed batch, in FK-safe order
// ─────────────────────────────────────────────────────────────────────
async function resetBatch() {
  console.log(`[seed-data] --reset: removing prior rows tagged "${BATCH_TAG}" ...`);

  // wage_slips  (by notes)
  let r = await supabase.from('wage_slips').delete().like('notes', `%${BATCH_TAG}%`);
  if (r.error) throw new Error(`wage_slips reset: ${r.error.message}`);

  // employees (by employee_number prefix)
  r = await supabase.from('employees').delete().like('employee_number', `${EMP_NO_PREFIX}%`);
  if (r.error) throw new Error(`employees reset: ${r.error.message}`);

  // employers (by trading_name tag)
  r = await supabase.from('employers').delete().like('trading_name', `%[${BATCH_TAG}]%`);
  if (r.error) throw new Error(`employers reset: ${r.error.message}`);

  // customer_payments (by notes)
  r = await supabase.from('customer_payments').delete().like('notes', `%${BATCH_TAG}%`);
  if (r.error) throw new Error(`customer_payments reset: ${r.error.message}`);

  // customers (by legal_name tag)
  r = await supabase.from('customers').delete().like('legal_name', `%[${BATCH_TAG}]%`);
  if (r.error) throw new Error(`customers reset: ${r.error.message}`);

  // tax_invoices (by source_type + source_id)
  r = await supabase.from('tax_invoices').delete()
        .eq('source_type', 'seed').eq('source_id', BATCH_ID);
  if (r.error) throw new Error(`tax_invoices reset: ${r.error.message}`);

  // purchase_orders (by tags array contains tag)
  r = await supabase.from('purchase_orders').delete().contains('tags', [BATCH_TAG]);
  if (r.error) throw new Error(`purchase_orders reset: ${r.error.message}`);

  // suppliers (by tags array contains tag) — last, so FKs from POs are already gone
  r = await supabase.from('suppliers').delete().contains('tags', [BATCH_TAG]);
  if (r.error) throw new Error(`suppliers reset: ${r.error.message}`);

  console.log('[seed-data] reset complete.');
}

// ─────────────────────────────────────────────────────────────────────
// INSERT helpers — chunked, error-aware
// ─────────────────────────────────────────────────────────────────────
async function insertRows(table, rows, select = '*') {
  if (DRY_RUN) {
    console.log(`[seed-data] DRY_RUN would insert ${rows.length} into ${table}`);
    return rows.map((_, i) => ({ id: i + 1, ...rows[i] }));
  }
  const CHUNK = 100;
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase.from(table).insert(slice).select(select);
    if (error) {
      console.error(`[seed-data] insert into ${table} failed:`, error.message);
      throw error;
    }
    out.push(...(data || []));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`[seed-data] ONYX PROCUREMENT seed generator`);
  console.log(`            batch:  ${BATCH_ID}`);
  console.log(`            tag:    ${BATCH_TAG}`);
  console.log(`            url:    ${SUPABASE_URL}`);
  console.log(`            reset:  ${RESET ? 'YES' : 'no'}`);
  console.log(`            dry:    ${DRY_RUN ? 'YES' : 'no'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (RESET) {
    try { await resetBatch(); } catch (e) { console.error(e); process.exit(2); }
  }

  // ─── 1. Suppliers (20) ─────────────────────────────────────────
  const suppliersToInsert = [];
  for (let i = 1; i <= 20; i++) suppliersToInsert.push(genSupplier(i));
  const suppliers = await insertRows('suppliers', suppliersToInsert, 'id,name');
  const supplierIds = suppliers.map(s => s.id);
  const supplierNameById = new Map(suppliers.map(s => [s.id, s.name]));
  const supplierNames = suppliers.map(s => s.name);
  console.log(`  ✓ suppliers: ${suppliers.length}`);

  // ─── 2. Employers (10) ─────────────────────────────────────────
  const employersToInsert = [];
  for (let i = 1; i <= 10; i++) employersToInsert.push(genEmployer(i));
  const employers = await insertRows('employers', employersToInsert, 'id,legal_name,company_id,tax_file_number');
  const employerIds = employers.map(e => e.id);
  console.log(`  ✓ employers: ${employers.length}`);

  // ─── 3. Employees (30) ─────────────────────────────────────────
  const employeesToInsert = [];
  for (let i = 1; i <= 30; i++) employeesToInsert.push(genEmployee(i, employerIds));
  const employees = await insertRows('employees', employeesToInsert,
    'id,employer_id,employee_number,national_id,first_name,last_name,position,department,employment_type,base_salary,hours_per_month');
  console.log(`  ✓ employees: ${employees.length}`);

  // ─── 4. Purchase orders (50) ───────────────────────────────────
  const posToInsert = [];
  for (let i = 1; i <= 50; i++) posToInsert.push(genPurchaseOrder(i, supplierIds, supplierNameById));
  const pos = await insertRows('purchase_orders', posToInsert, 'id,supplier_id,total');
  console.log(`  ✓ purchase_orders: ${pos.length}`);

  // ─── 5. Tax invoices (100) ─────────────────────────────────────
  const invToInsert = [];
  for (let i = 1; i <= 100; i++) invToInsert.push(genTaxInvoice(i, supplierNames));
  const invoices = await insertRows('tax_invoices', invToInsert, 'id');
  console.log(`  ✓ tax_invoices: ${invoices.length}`);

  // ─── 6. Customers (enough to back the payments) ────────────────
  const customersToInsert = [];
  for (let i = 1; i <= 25; i++) customersToInsert.push(genCustomer(i));
  const customers = await insertRows('customers', customersToInsert, 'id,name');
  console.log(`  ✓ customers: ${customers.length} (support rows)`);

  // ─── 7. Customer payments (200) ────────────────────────────────
  const paysToInsert = [];
  for (let i = 1; i <= 200; i++) paysToInsert.push(genCustomerPayment(i, customers));
  const pays = await insertRows('customer_payments', paysToInsert, 'id');
  console.log(`  ✓ customer_payments: ${pays.length}`);

  // ─── 8. Wage slips (60: 2025-01 .. 2026-12, spread over employees) ──
  // We need 60 slips spanning 2025 and 2026. We'll pick 5 employees × 12 months
  // so 5×12=60. This avoids the (employee,year,month) unique constraint.
  const chosenEmployees = employees.slice(0, 5);
  const employerById = new Map(employers.map(e => [e.id, e]));
  const wageSlipsToInsert = [];
  for (const emp of chosenEmployees) {
    const er = employerById.get(emp.employer_id);
    // 6 months in 2025 + 6 months in 2026 = 12 slips per employee
    const months = [
      [2025, 7], [2025, 8], [2025, 9], [2025, 10], [2025, 11], [2025, 12],
      [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6]
    ];
    for (const [y, m] of months) wageSlipsToInsert.push(genWageSlip(emp, er, y, m));
  }
  const wageSlips = await insertRows('wage_slips', wageSlipsToInsert, 'id');
  console.log(`  ✓ wage_slips: ${wageSlips.length}`);

  // ─────────────────────────────────────────────────────────────
  const ms = Date.now() - startedAt;
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SEED SUMMARY');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  suppliers          : ${suppliers.length}`);
  console.log(`  employers          : ${employers.length}`);
  console.log(`  employees          : ${employees.length}`);
  console.log(`  purchase_orders    : ${pos.length}`);
  console.log(`  tax_invoices       : ${invoices.length}`);
  console.log(`  customers (support): ${customers.length}`);
  console.log(`  customer_payments  : ${pays.length}`);
  console.log(`  wage_slips         : ${wageSlips.length}`);
  console.log('───────────────────────────────────────────────────────────────');
  const grandTotal =
    suppliers.length + employers.length + employees.length +
    pos.length + invoices.length + customers.length +
    pays.length + wageSlips.length;
  console.log(`  TOTAL ROWS         : ${grandTotal}`);
  console.log(`  elapsed            : ${ms} ms`);
  console.log(`  batch              : ${BATCH_ID}`);
  console.log(`  tag                : ${BATCH_TAG}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('[seed-data] FAILED:', err);
  process.exit(1);
});
