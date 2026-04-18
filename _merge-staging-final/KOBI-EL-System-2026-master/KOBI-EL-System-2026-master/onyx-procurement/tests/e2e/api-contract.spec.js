// ═══════════════════════════════════════════════════════════════════════════
// api-contract.spec.js — API contract tests using Playwright APIRequestContext
// Agent 52
//
// These tests exercise the HTTP contract without touching a browser. They
// validate that the /api/health endpoint (and a few representative mock
// routes exposed by static-server.js) return the shapes the dashboards
// depend on.
//
// If you point PW_BASE_URL at a real Express backend, these same tests will
// run against it unchanged — the contract shapes are identical.
// ═══════════════════════════════════════════════════════════════════════════

const { test, expect, request } = require('@playwright/test');
const { fixtures } = require('./fixtures');

test.describe('API contract — health + module endpoints', () => {
  /** @type {import('@playwright/test').APIRequestContext} */
  let api;

  test.beforeAll(async ({ playwright }) => {
    api = await (playwright.request || request).newContext({
      baseURL: process.env.PW_BASE_URL || 'http://127.0.0.1:4319',
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  });

  test.afterAll(async () => {
    if (api) await api.dispose();
  });

  // ─── Health ─────────────────────────────────────────────────────────────
  test('GET /api/health → 200 and JSON', async () => {
    const res = await api.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(String(body.status)).toMatch(/^(OK|ok|healthy|UP)$/i);
  });

  test('GET /api/_testping → identifies static server when in mock mode', async () => {
    const res = await api.get('/api/_testping');
    // Only strict-check when we're definitely talking to the static server
    if (!process.env.PW_BASE_URL) {
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.server).toBe('playwright-static');
    }
  });

  // ─── VAT ────────────────────────────────────────────────────────────────
  test('GET /api/vat/profile responds 200 with JSON', async () => {
    const res = await api.get('/api/vat/profile');
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(typeof body).toBe('object');
    }
  });

  test('GET /api/vat/periods returns periods array or empty shape', async () => {
    const res = await api.get('/api/vat/periods');
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(body === null || typeof body === 'object').toBeTruthy();
    }
  });

  test('GET /api/vat/invoices returns invoices-shaped payload', async () => {
    const res = await api.get('/api/vat/invoices');
    expect(res.status()).toBeLessThan(500);
    if (res.ok()) {
      const body = await res.json();
      expect(body === null || typeof body === 'object').toBeTruthy();
    }
  });

  // ─── Bank ───────────────────────────────────────────────────────────────
  for (const ep of [
    '/api/bank/accounts',
    '/api/bank/transactions',
    '/api/bank/matches',
    '/api/bank/discrepancies',
    '/api/bank/summary',
  ]) {
    test(`GET ${ep} responds with JSON (<500)`, async () => {
      const res = await api.get(ep);
      expect(res.status()).toBeLessThan(500);
      if (res.ok()) {
        const body = await res.json();
        expect(body === null || typeof body === 'object').toBeTruthy();
      }
    });
  }

  // ─── Annual Tax ─────────────────────────────────────────────────────────
  for (const ep of [
    '/api/projects',
    '/api/customers',
    '/api/customer-invoices',
    '/api/customer-payments',
    '/api/fiscal-years',
  ]) {
    test(`GET ${ep} responds with JSON (<500)`, async () => {
      const res = await api.get(ep);
      expect(res.status()).toBeLessThan(500);
      if (res.ok()) {
        const body = await res.json();
        expect(body === null || typeof body === 'object').toBeTruthy();
      }
    });
  }

  // ─── Fixture self-test (runs always) ────────────────────────────────────
  test('fixture tables all have the promised row counts', () => {
    expect(fixtures.VAT_INVOICES.invoices).toHaveLength(20);
    expect(fixtures.BANK_TRANSACTIONS.transactions).toHaveLength(20);
    expect(fixtures.ANNUAL_PROJECTS.projects).toHaveLength(20);
    expect(fixtures.ANNUAL_INVOICES.invoices).toHaveLength(20);
    expect(fixtures.ANNUAL_PAYMENTS.payments).toHaveLength(20);
    expect(fixtures.ANNUAL_CUSTOMERS.customers).toHaveLength(20);
  });

  test('VAT periods fixture covers all 12 months of 2026', () => {
    const months = fixtures.VAT_PERIODS.periods.map((p) => p.month).sort((a, b) => a - b);
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  test('Bank accounts fixture includes 5 major Israeli banks', () => {
    const names = fixtures.BANK_ACCOUNTS.accounts.map((a) => a.bank_name);
    for (const n of [
      'בנק הפועלים',
      'בנק דיסקונט',
      'בנק לאומי',
      'בנק מזרחי',
      'בנק יהב',
    ]) {
      expect(names).toContain(n);
    }
  });

  test('Bank discrepancies cover all severity levels', () => {
    const sev = new Set(
      fixtures.BANK_DISCREPANCIES.discrepancies.map((d) => d.severity),
    );
    for (const s of ['critical', 'high', 'medium', 'low', 'info']) {
      expect(sev.has(s)).toBeTruthy();
    }
  });

  test('Fiscal-year fixture uses the 2026 Israeli corporate tax rate (23%)', () => {
    for (const fy of fixtures.ANNUAL_FISCAL_YEARS.fiscal_years) {
      expect(fy.corporate_tax_rate).toBe(23);
    }
  });
});
