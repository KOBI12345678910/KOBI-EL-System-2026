// ═══════════════════════════════════════════════════════════════════════════
// fixtures.js — Playwright test data + route-mocking helpers
// Agent 52
//
// Each dashboard fetches JSON from /api/<module>/... on mount. These fixtures
// provide 20-row mock datasets so the UI has something to render during tests
// even though the real Express backend isn't running.
//
// Use `installMocks(page)` at the start of any spec to stub every /api/**
// call with the matching fixture. Call it BEFORE page.goto().
//
//   const { test, expect } = require('@playwright/test');
//   const { installMocks } = require('./fixtures');
//
//   test('vat dashboard loads', async ({ page }) => {
//     await installMocks(page);
//     await page.goto('/vat-dashboard.html');
//     ...
//   });
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────
const pad = (n, w = 4) => String(n).padStart(w, '0');
const isoDate = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const rand = (seed) => {
  // deterministic pseudo-random from a seed — keeps fixtures stable
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// ─── 20 × VAT invoices ────────────────────────────────────────────────────
const VAT_PROFILE = {
  profile: {
    id: 1,
    business_name: 'טכנו-קול עוזי בע"מ',
    business_id: '514123456',
    vat_number: '514123456',
    reporting_frequency: 'monthly',
    vat_rate: 17,
    registered_at: '2018-01-01',
    status: 'active',
  },
};

const VAT_PERIODS = {
  periods: Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return {
      id: 100 + i,
      year: 2026,
      month,
      period_code: `2026-${String(month).padStart(2, '0')}`,
      status: i < 3 ? 'submitted' : i < 6 ? 'closed' : 'open',
      output_vat: 18_000 + i * 1_250,
      input_vat: 11_000 + i * 900,
      net_vat: 7_000 + i * 350,
      submitted_at: i < 3 ? isoDate(2026, month + 1, 15) : null,
      pcn836_ref: i < 3 ? `PCN-${2026}${pad(month, 2)}` : null,
    };
  }),
};

const VAT_INVOICES = {
  invoices: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    const amount = 1_500 + n * 375;
    const vat = Math.round(amount * 0.17);
    return {
      id: 1000 + n,
      doc_number: `INV-${pad(n)}`,
      doc_type: n % 4 === 0 ? 'credit_note' : 'invoice',
      direction: n % 2 === 0 ? 'output' : 'input',
      supplier_name: [
        'ברזל חיפה בע״מ',
        'מפעלי פלדה אשדוד',
        'מתכת הצפון',
        'ברזל ירושלים',
        'חומרי בנין בן-שמן',
      ][n % 5],
      issue_date: isoDate(2026, ((n - 1) % 12) + 1, ((n * 3) % 27) + 1),
      net_amount: amount,
      vat_amount: vat,
      total_amount: amount + vat,
      vat_rate: 17,
      period_id: 100 + ((n - 1) % 12),
      status: n % 6 === 0 ? 'void' : 'posted',
      description: `חשבונית בדיקה ${n} — פריטי ברזל ומעקות`,
    };
  }),
};

// ─── 20 × Bank fixtures ───────────────────────────────────────────────────
const BANK_ACCOUNTS = {
  accounts: Array.from({ length: 5 }, (_, i) => ({
    id: 200 + i,
    bank_code: ['10', '11', '12', '20', '31'][i],
    bank_name: ['בנק הפועלים', 'בנק דיסקונט', 'בנק לאומי', 'בנק מזרחי', 'בנק יהב'][i],
    branch: String(100 + i * 13),
    account_number: `${123000 + i * 17}`,
    iban: `IL${pad(20 + i, 2)}0${10 + i}00000000${123000 + i * 17}`,
    purpose: ['תפעולי', 'משכורות', 'מע״מ', 'ספקים', 'חסכון'][i],
    balance: 150_000 + i * 87_500,
    currency: 'ILS',
  })),
};

const BANK_TRANSACTIONS = {
  transactions: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    const amt = (n % 3 === 0 ? -1 : 1) * (500 + n * 237);
    return {
      id: 300 + n,
      account_id: 200 + (n % 5),
      posted_at: isoDate(2026, ((n - 1) % 12) + 1, ((n * 2) % 27) + 1),
      value_date: isoDate(2026, ((n - 1) % 12) + 1, ((n * 2) % 27) + 2),
      amount: amt,
      currency: 'ILS',
      description: [
        'העברה לספק',
        'קבלה מלקוח',
        'עמלת בנק',
        'משכורת',
        'ארנונה',
        'חשבון חשמל',
        'דלק',
      ][n % 7],
      counterparty: `ספק/לקוח ${n}`,
      reference: `REF-${pad(n)}`,
      reconciled: n % 4 === 0,
      matched: n % 4 === 0,
      category: ['income', 'expense', 'fee'][n % 3],
    };
  }),
};

const BANK_MATCHES = {
  matches: Array.from({ length: 10 }, (_, i) => ({
    id: 400 + i,
    transaction_id: 300 + i * 2,
    ledger_entry_id: 500 + i,
    score: 0.85 + (i % 3) * 0.05,
    method: i % 2 ? 'auto' : 'manual',
    matched_at: isoDate(2026, ((i % 12) + 1), ((i * 3) % 27) + 1),
  })),
};

const BANK_DISCREPANCIES = {
  discrepancies: Array.from({ length: 6 }, (_, i) => ({
    id: 600 + i,
    title: [
      'הפרש בסכום',
      'תאריך לא תואם',
      'ספק חסר',
      'העברה כפולה',
      'אסמכתא שגויה',
      'חסר מט״ח',
    ][i],
    severity: ['critical', 'high', 'medium', 'medium', 'low', 'info'][i],
    status: i === 5 ? 'resolved' : 'open',
    detected_at: isoDate(2026, 3, 10 + i),
    type: 'amount_mismatch',
  })),
};

const BANK_SUMMARY = {
  total_balance: 875_000,
  unreconciled_count: 15,
  unreconciled_total: 48_250,
  open_discrepancies: 5,
};

// ─── 20 × Annual-tax fixtures ─────────────────────────────────────────────
const ANNUAL_CUSTOMERS = {
  customers: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    return {
      id: 700 + n,
      name: [
        'עיריית תל אביב',
        'משרד הביטחון',
        'חברת החשמל',
        'משרד החינוך',
        'אגד תחבורה',
      ][n % 5] + ' #' + n,
      tax_id: `5${pad(n * 1111, 8)}`,
      email: `client${n}@example.co.il`,
      phone: `03-${pad(n * 137 % 9999999, 7)}`,
      address: 'רח׳ הברזל ' + n + ', תל אביב',
      created_at: isoDate(2026, ((n - 1) % 12) + 1, 5),
    };
  }),
};

const ANNUAL_PROJECTS = {
  projects: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    return {
      id: 800 + n,
      project_code: `PRJ-2026-${pad(n)}`,
      client_id: 700 + (n % 20) + 1,
      contract_value: 250_000 + n * 17_500,
      completion_percent: Math.min(100, n * 5),
      fiscal_year: 2026,
      revenue_recognition: n % 2 ? 'percentage_of_completion' : 'completed_contract',
      status: n % 7 === 0 ? 'closed' : 'active',
    };
  }),
};

const ANNUAL_INVOICES = {
  invoices: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    return {
      id: 900 + n,
      invoice_number: `CUST-INV-${pad(n)}`,
      customer_id: 700 + (n % 20) + 1,
      project_id: 800 + (n % 20) + 1,
      issue_date: isoDate(2026, ((n - 1) % 12) + 1, ((n * 2) % 27) + 1),
      amount: 25_000 + n * 1_500,
      vat: Math.round((25_000 + n * 1_500) * 0.17),
      total: Math.round((25_000 + n * 1_500) * 1.17),
      status: ['issued', 'paid', 'overdue'][n % 3],
    };
  }),
};

const ANNUAL_PAYMENTS = {
  payments: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    return {
      id: 1100 + n,
      invoice_id: 900 + n,
      received_at: isoDate(2026, ((n - 1) % 12) + 1, ((n * 3) % 27) + 1),
      amount: 25_000 + n * 1_500,
      method: ['bank_transfer', 'check', 'cash'][n % 3],
      reference: `PAY-${pad(n)}`,
    };
  }),
};

const ANNUAL_FISCAL_YEARS = {
  fiscal_years: [2024, 2025, 2026].map((year, i) => ({
    id: 1200 + i,
    year,
    revenue_total: 2_400_000 + i * 320_000,
    expense_total: 1_850_000 + i * 250_000,
    profit_before_tax: 550_000 + i * 70_000,
    corporate_tax_rate: 23,
    corporate_tax_due: Math.round((550_000 + i * 70_000) * 0.23),
    status: year < 2026 ? 'closed' : 'open',
  })),
};

// ─── Route table: URL suffix → fixture body ───────────────────────────────
const ROUTE_FIXTURES = [
  // VAT
  [/\/api\/vat\/profile$/, VAT_PROFILE],
  [/\/api\/vat\/periods$/, VAT_PERIODS],
  [/\/api\/vat\/invoices$/, VAT_INVOICES],
  [/\/api\/vat\/health$/, { status: 'OK' }],
  // Bank
  [/\/api\/bank\/accounts$/, BANK_ACCOUNTS],
  [/\/api\/bank\/transactions$/, BANK_TRANSACTIONS],
  [/\/api\/bank\/matches$/, BANK_MATCHES],
  [/\/api\/bank\/discrepancies$/, BANK_DISCREPANCIES],
  [/\/api\/bank\/summary$/, BANK_SUMMARY],
  [/\/api\/bank\/health$/, { status: 'OK' }],
  // Annual tax
  [/\/api\/projects(\?|$)/, ANNUAL_PROJECTS],
  [/\/api\/customers(\?|$)/, ANNUAL_CUSTOMERS],
  [/\/api\/customer-invoices(\?|$)/, ANNUAL_INVOICES],
  [/\/api\/customer-payments(\?|$)/, ANNUAL_PAYMENTS],
  [/\/api\/fiscal-years(\?|$)/, ANNUAL_FISCAL_YEARS],
  [/\/api\/tax\/health$/, { status: 'OK' }],
  // Generic health
  [/\/api\/health(\/db)?$/, { status: 'OK', uptime: 0, ts: Date.now() }],
];

/**
 * Install request interception for the page. Any GET to /api/** will be
 * answered from the ROUTE_FIXTURES table above; any write (POST/PUT/DELETE)
 * is answered with { ok: true } so write flows don't explode.
 *
 * @param {import('@playwright/test').Page} page
 */
async function installMocks(page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const u = req.url();
    const method = req.method();

    if (method !== 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ ok: true, id: Date.now() }),
      });
    }

    for (const [re, body] of ROUTE_FIXTURES) {
      if (re.test(u)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(body),
        });
      }
    }

    // Unknown GET → empty object; keeps console clean.
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: '{}',
    });
  });
}

/**
 * Collect console errors/warnings as they happen. Return a snapshot getter
 * so assertions can read them after the navigation.
 *
 * @param {import('@playwright/test').Page} page
 */
function collectConsole(page) {
  /** @type {{ type: string, text: string, location: any }[]} */
  const entries = [];
  page.on('console', (msg) => {
    entries.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  });
  page.on('pageerror', (err) => {
    entries.push({ type: 'pageerror', text: String(err), location: null });
  });
  return {
    all: () => entries.slice(),
    errors: () =>
      entries.filter(
        (e) =>
          e.type === 'error' ||
          e.type === 'pageerror' ||
          (e.type === 'warning' && /uncaught|unhandled/i.test(e.text)),
      ),
  };
}

module.exports = {
  installMocks,
  collectConsole,
  fixtures: {
    VAT_PROFILE,
    VAT_PERIODS,
    VAT_INVOICES,
    BANK_ACCOUNTS,
    BANK_TRANSACTIONS,
    BANK_MATCHES,
    BANK_DISCREPANCIES,
    BANK_SUMMARY,
    ANNUAL_CUSTOMERS,
    ANNUAL_PROJECTS,
    ANNUAL_INVOICES,
    ANNUAL_PAYMENTS,
    ANNUAL_FISCAL_YEARS,
  },
  ROUTE_FIXTURES,
};
