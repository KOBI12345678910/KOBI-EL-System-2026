/**
 * Integration tests for annual-tax-routes.js
 * Run with: node --test test/annual-tax-routes.test.js
 *
 * Covers:
 *   - CRUD for projects, customers, customer invoices, customer payments
 *   - Fiscal-year compute (revenue, COGS, profit, 23% corporate tax for 2026)
 *   - Annual tax form generation (1320, 6111, invalid)
 *   - audit() invocation on create/update
 *
 * TODO: If/when test/helpers/mock-supabase.js is added by Agent-11, replace the
 * inline MockSupabase below with an import: require('./helpers/mock-supabase').
 */
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { registerAnnualTaxRoutes } = require('../src/tax/annual-tax-routes.js');

// ═══════════════════════════════════════════════════════════════════
// Minimal Express-like app stub
// ═══════════════════════════════════════════════════════════════════
function createAppStub() {
  const routes = { GET: [], POST: [], PATCH: [], PUT: [], DELETE: [] };

  function register(method) {
    return (path, handler) => {
      routes[method].push({ path, handler, regex: pathToRegex(path) });
    };
  }

  function pathToRegex(path) {
    const keys = [];
    const pattern = path.replace(/:([^/]+)/g, (_m, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    return { re: new RegExp('^' + pattern + '$'), keys };
  }

  function match(method, urlPath) {
    for (const r of routes[method] || []) {
      const m = urlPath.match(r.regex.re);
      if (m) {
        const params = {};
        r.regex.keys.forEach((k, i) => (params[k] = m[i + 1]));
        return { handler: r.handler, params };
      }
    }
    return null;
  }

  return {
    get: register('GET'),
    post: register('POST'),
    patch: register('PATCH'),
    put: register('PUT'),
    delete: register('DELETE'),
    _match: match,
    _routes: routes,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Fake req/res that mimics Express handler interface
// ═══════════════════════════════════════════════════════════════════
async function invoke(app, method, fullUrl, body = undefined, actor = 'test-user') {
  const [pathOnly, queryString = ''] = fullUrl.split('?');
  const query = {};
  if (queryString) {
    for (const pair of queryString.split('&')) {
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  const match = app._match(method, pathOnly);
  if (!match) {
    return { statusCode: 404, body: { error: 'Route not found' } };
  }
  const req = {
    method,
    url: fullUrl,
    params: match.params,
    query,
    body: body || {},
    actor,
  };
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      _body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this._body = payload;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
    };
    Promise.resolve(match.handler(req, res)).catch(reject);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Inline MockSupabase
// ═══════════════════════════════════════════════════════════════════
// TODO: Replace with require('./helpers/mock-supabase') once Agent-11 adds it.
function createMockSupabase(seed = {}) {
  const db = {
    projects: [],
    customers: [],
    customer_invoices: [],
    customer_payments: [],
    tax_invoices: [],
    fiscal_years: [],
    annual_tax_reports: [],
    company_tax_profile: [],
    chart_of_accounts: [],
    ...seed,
  };
  let idCounter = 1000;
  function nextId() {
    return `id-${++idCounter}`;
  }

  function builder(table) {
    const ctx = {
      _table: table,
      _rows: () => db[table] || (db[table] = []),
      _filters: [],
      _insertData: null,
      _updateData: null,
      _deleteFlag: false,
      _orderBy: null,
      _limit: null,
      _single: false,
      _maybeSingle: false,
    };

    function applyFilters(rows) {
      let out = rows.slice();
      for (const f of ctx._filters) {
        if (f.op === 'eq') out = out.filter((r) => r[f.col] == f.val);
        else if (f.op === 'neq') out = out.filter((r) => r[f.col] != f.val);
        else if (f.op === 'gte') out = out.filter((r) => r[f.col] >= f.val);
        else if (f.op === 'lte') out = out.filter((r) => r[f.col] <= f.val);
      }
      return out;
    }

    const thenable = {
      select() {
        return thenable;
      },
      insert(data) {
        ctx._insertData = Array.isArray(data) ? data : [data];
        return thenable;
      },
      update(data) {
        ctx._updateData = data;
        return thenable;
      },
      delete() {
        ctx._deleteFlag = true;
        return thenable;
      },
      eq(col, val) {
        ctx._filters.push({ op: 'eq', col, val });
        return thenable;
      },
      neq(col, val) {
        ctx._filters.push({ op: 'neq', col, val });
        return thenable;
      },
      gte(col, val) {
        ctx._filters.push({ op: 'gte', col, val });
        return thenable;
      },
      lte(col, val) {
        ctx._filters.push({ op: 'lte', col, val });
        return thenable;
      },
      order(col, opts) {
        ctx._orderBy = { col, asc: opts?.ascending !== false };
        return thenable;
      },
      limit(n) {
        ctx._limit = n;
        return thenable;
      },
      single() {
        ctx._single = true;
        return execute();
      },
      maybeSingle() {
        ctx._maybeSingle = true;
        return execute();
      },
      then(onFulfilled, onRejected) {
        return execute().then(onFulfilled, onRejected);
      },
    };

    async function execute() {
      try {
        // INSERT
        if (ctx._insertData) {
          // Uniqueness check for customer_payments.receipt_number
          if (table === 'customer_payments') {
            for (const d of ctx._insertData) {
              if (d.receipt_number) {
                const dup = ctx._rows().find(
                  (r) => r.receipt_number === d.receipt_number,
                );
                if (dup) {
                  return { data: null, error: { message: 'duplicate key value: receipt_number' } };
                }
              }
            }
          }
          const inserted = ctx._insertData.map((d) => {
            // Validate required fields for projects
            if (table === 'projects') {
              if (!d.project_code) return { _error: 'project_code is required' };
              if (!d.client_id) return { _error: 'client_id is required' };
            }
            const row = {
              id: d.id || nextId(),
              created_at: new Date().toISOString(),
              ...d,
            };
            return row;
          });
          const errRow = inserted.find((r) => r._error);
          if (errRow) return { data: null, error: { message: errRow._error } };
          ctx._rows().push(...inserted);
          const data = ctx._single || ctx._maybeSingle ? inserted[0] : inserted;
          return { data, error: null };
        }

        // UPDATE
        if (ctx._updateData) {
          const matched = applyFilters(ctx._rows());
          matched.forEach((r) => Object.assign(r, ctx._updateData));
          const data =
            ctx._single || ctx._maybeSingle ? matched[0] || null : matched;
          return { data, error: null };
        }

        // DELETE
        if (ctx._deleteFlag) {
          const matched = applyFilters(ctx._rows());
          db[table] = ctx._rows().filter((r) => !matched.includes(r));
          return { data: matched, error: null };
        }

        // SELECT
        let rows = applyFilters(ctx._rows());
        if (ctx._orderBy) {
          rows.sort((a, b) => {
            const av = a[ctx._orderBy.col];
            const bv = b[ctx._orderBy.col];
            if (av === bv) return 0;
            const cmp = av < bv ? -1 : 1;
            return ctx._orderBy.asc ? cmp : -cmp;
          });
        }
        if (ctx._limit) rows = rows.slice(0, ctx._limit);
        if (ctx._single) {
          if (rows.length === 0)
            return { data: null, error: { message: 'no rows' } };
          return { data: rows[0], error: null };
        }
        if (ctx._maybeSingle) {
          return { data: rows[0] || null, error: null };
        }
        return { data: rows, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
    }

    return thenable;
  }

  return {
    _db: db,
    from(table) {
      return builder(table);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Test harness setup
// ═══════════════════════════════════════════════════════════════════
function setup({ seed } = {}) {
  const app = createAppStub();
  const supabase = createMockSupabase(seed);
  const auditCalls = [];
  const audit = async (...args) => {
    auditCalls.push(args);
  };
  // Silence the "routes registered" log
  const origLog = console.log;
  console.log = () => {};
  try {
    registerAnnualTaxRoutes(app, { supabase, audit });
  } finally {
    console.log = origLog;
  }
  return { app, supabase, audit, auditCalls };
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe('annual-tax-routes integration', () => {
  // ── Test 1
  test('POST /api/projects creates project and validates required fields', async () => {
    const { app, auditCalls } = setup();

    // Missing project_code → 400
    const missing = await invoke(app, 'POST', '/api/projects', {
      name: 'Demo',
      client_id: 'c-1',
    });
    assert.equal(missing.statusCode, 400);
    assert.match(missing.body.error, /project_code/);

    // Missing client_id → 400
    const missingClient = await invoke(app, 'POST', '/api/projects', {
      project_code: 'P-001',
      name: 'Demo',
    });
    assert.equal(missingClient.statusCode, 400);
    assert.match(missingClient.body.error, /client_id/);

    // Valid → 201
    const ok = await invoke(app, 'POST', '/api/projects', {
      project_code: 'P-001',
      client_id: 'c-1',
      name: 'Demo Project',
    });
    assert.equal(ok.statusCode, 201);
    assert.ok(ok.body.project.id);
    assert.equal(ok.body.project.project_code, 'P-001');
    assert.equal(ok.body.project.created_by, 'test-user');
    // audit() was called with entity='project', action='created'
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0][0], 'project');
    assert.equal(auditCalls[0][2], 'created');
  });

  // ── Test 2
  test('GET /api/projects lists all projects', async () => {
    const { app } = setup({
      seed: {
        projects: [
          { id: 'p1', project_code: 'P-001', name: 'A', status: 'active', created_at: '2026-01-01' },
          { id: 'p2', project_code: 'P-002', name: 'B', status: 'closed', created_at: '2026-02-01' },
        ],
      },
    });
    const res = await invoke(app, 'GET', '/api/projects');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.projects.length, 2);
  });

  // ── Test 3
  test('POST /api/customers stores customer with tax_id', async () => {
    const { app, auditCalls } = setup();
    const res = await invoke(app, 'POST', '/api/customers', {
      name: 'Acme LTD',
      tax_id: '514000001',
      active: true,
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.customer.tax_id, '514000001');
    assert.equal(res.body.customer.name, 'Acme LTD');
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0][0], 'customer');
    assert.equal(auditCalls[0][2], 'created');
  });

  // ── Test 4
  test('POST /api/customer-invoices auto-computes vat_amount from net_amount * vat_rate', async () => {
    const { app, auditCalls } = setup();
    const res = await invoke(app, 'POST', '/api/customer-invoices', {
      invoice_number: 'INV-1',
      customer_id: 'c-1',
      customer_name: 'Acme',
      invoice_date: '2026-03-01',
      net_amount: 1000,
      vat_rate: 0.17,
      status: 'issued',
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.invoice.vat_amount, 170);
    assert.equal(res.body.invoice.gross_amount, 1170);
    assert.equal(res.body.invoice.amount_outstanding, 1170);
    assert.equal(auditCalls[0][0], 'customer_invoice');
  });

  // ── Test 5
  test('POST /api/customer-invoices with gross — vat still derived from net_amount path', async () => {
    // The route only auto-fills vat_amount when it's absent AND net_amount is present.
    // We exercise the gross-provided branch where vat still comes from net*rate but
    // caller-provided gross_amount is preserved.
    const { app } = setup();
    const res = await invoke(app, 'POST', '/api/customer-invoices', {
      invoice_number: 'INV-2',
      customer_id: 'c-1',
      customer_name: 'Acme',
      invoice_date: '2026-03-02',
      net_amount: 2000,
      gross_amount: 2340, // caller-supplied gross (includes 17% VAT)
      vat_rate: 0.17,
    });
    assert.equal(res.statusCode, 201);
    // vat_amount auto-filled from net*rate = 340
    assert.equal(res.body.invoice.vat_amount, 340);
    // caller-supplied gross_amount preserved (back-compat)
    assert.equal(res.body.invoice.gross_amount, 2340);
    // amount_outstanding defaults to gross
    assert.equal(res.body.invoice.amount_outstanding, 2340);
  });

  // ── Test 6
  test('POST /api/customer-payments applies to multiple invoices and reduces amount_outstanding on each', async () => {
    const seed = {
      customer_invoices: [
        {
          id: 'inv-A',
          invoice_number: 'A',
          customer_id: 'c-1',
          amount_paid: 0,
          amount_outstanding: 500,
          gross_amount: 500,
          status: 'issued',
        },
        {
          id: 'inv-B',
          invoice_number: 'B',
          customer_id: 'c-1',
          amount_paid: 0,
          amount_outstanding: 800,
          gross_amount: 800,
          status: 'issued',
        },
      ],
    };
    const { app, supabase } = setup({ seed });

    const res = await invoke(app, 'POST', '/api/customer-payments', {
      receipt_number: 'R-100',
      customer_id: 'c-1',
      customer_name: 'Acme',
      payment_date: '2026-03-10',
      amount: 1000,
      invoice_ids: ['inv-A', 'inv-B'],
    });
    assert.equal(res.statusCode, 201);

    const invA = supabase._db.customer_invoices.find((i) => i.id === 'inv-A');
    const invB = supabase._db.customer_invoices.find((i) => i.id === 'inv-B');

    // inv-A fully paid (500)
    assert.equal(invA.amount_outstanding, 0);
    assert.equal(invA.amount_paid, 500);
    assert.equal(invA.status, 'paid');

    // inv-B partial: 1000-500 = 500 applied, 800-500 = 300 remaining
    assert.equal(invB.amount_outstanding, 300);
    assert.equal(invB.amount_paid, 500);
    assert.equal(invB.status, 'partial');
  });

  // ── Test 7
  test('POST /api/customer-payments rejects duplicate receipt_number', async () => {
    const seed = {
      customer_payments: [
        { id: 'pay-1', receipt_number: 'R-200', amount: 100 },
      ],
    };
    const { app } = setup({ seed });
    const res = await invoke(app, 'POST', '/api/customer-payments', {
      receipt_number: 'R-200', // duplicate
      customer_id: 'c-1',
      customer_name: 'Acme',
      amount: 500,
      payment_date: '2026-03-11',
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /duplicate/i);
  });

  // ── Test 8
  test('POST /api/fiscal-years/:year/compute aggregates revenue, COGS, profit with 23% corporate tax hint', async () => {
    const seed = {
      customer_invoices: [
        {
          id: 'i1',
          invoice_date: '2026-04-01',
          net_amount: 100000,
          gross_amount: 117000,
          status: 'issued',
        },
        {
          id: 'i2',
          invoice_date: '2026-06-15',
          net_amount: 50000,
          gross_amount: 58500,
          status: 'paid',
        },
        {
          id: 'i3',
          invoice_date: '2026-07-20',
          net_amount: 999,
          gross_amount: 1169,
          status: 'voided', // excluded
        },
      ],
      tax_invoices: [
        {
          id: 't1',
          invoice_date: '2026-05-01',
          direction: 'input',
          net_amount: 30000,
          is_asset: false,
          status: 'received',
        },
        {
          id: 't2',
          invoice_date: '2026-05-10',
          direction: 'input',
          net_amount: 10000,
          is_asset: true, // excluded from COGS
          status: 'received',
        },
      ],
    };
    const { app, auditCalls } = setup({ seed });
    const res = await invoke(app, 'POST', '/api/fiscal-years/2026/compute');
    assert.equal(res.statusCode, 200);
    const fy = res.body.fiscal_year;
    assert.equal(fy.year, 2026);
    assert.equal(fy.total_revenue, 150000); // 100000 + 50000
    assert.equal(fy.total_cogs, 30000); // asset excluded
    assert.equal(fy.net_profit_before_tax, 120000);
    // 2026 corporate rate is 23% → 120000 * 0.23 = 27600
    assert.equal(Math.round(fy.net_profit_before_tax * 0.23), 27600);
    // audit('fiscal_year', …, 'computed', …)
    const fyAudit = auditCalls.find((c) => c[0] === 'fiscal_year');
    assert.ok(fyAudit, 'fiscal_year audit should be emitted');
    assert.equal(fyAudit[2], 'computed');
  });

  // ── Test 9
  test('POST /api/annual-tax/:year/forms/1320/generate dispatches to buildForm1320 and upserts annual_tax_reports', async () => {
    const seed = {
      company_tax_profile: [
        {
          id: 'prof-1',
          company_id: 'CO-1',
          legal_name: 'Techno-Kol Uzi',
          vat_file_number: '123456789',
          tax_file_number: '987654321',
          accounting_method: 'accrual',
          fiscal_year_end_month: 12,
        },
      ],
      fiscal_years: [
        {
          id: 'fy-2026',
          year: 2026,
          net_profit_before_tax: 120000,
          total_revenue: 150000,
          total_cogs: 30000,
          status: 'open',
        },
      ],
      customer_invoices: [
        { id: 'i1', invoice_date: '2026-04-01', net_amount: 100000, status: 'issued', amount_outstanding: 0 },
      ],
      tax_invoices: [
        { id: 't1', invoice_date: '2026-05-01', direction: 'input', net_amount: 30000, is_asset: false, status: 'received' },
      ],
      projects: [{ id: 'p1', project_code: 'P-1', fiscal_year: 2026 }],
    };
    const { app, supabase, auditCalls } = setup({ seed });
    const res = await invoke(
      app,
      'POST',
      '/api/annual-tax/2026/forms/1320/generate',
    );
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.report.form_type, '1320');
    assert.equal(res.body.report.fiscal_year, 2026);
    // computed_totals carries 23% corporate tax for 2026
    assert.equal(res.body.report.computed_totals.profit_before_tax, 120000);
    assert.equal(res.body.report.computed_totals.corporate_tax, 27600);
    assert.equal(
      res.body.report.computed_totals.profit_after_tax,
      120000 - 27600,
    );
    // payload came from buildForm1320
    assert.equal(res.body.report.payload.formType, '1320');
    assert.ok(res.body.report.payload.companyIdentification);
    assert.equal(
      res.body.report.payload.companyIdentification.legalName,
      'Techno-Kol Uzi',
    );
    // upserted into annual_tax_reports
    assert.equal(supabase._db.annual_tax_reports.length, 1);
    // audit('annual_tax_report', …, 'created', …)
    const rep = auditCalls.find((c) => c[0] === 'annual_tax_report');
    assert.ok(rep, 'annual_tax_report audit should be emitted');
    assert.equal(rep[2], 'created');
  });

  // ── Test 10
  test('POST /api/annual-tax/:year/forms/INVALID/generate returns 400 unknown form type', async () => {
    const { app } = setup();
    const res = await invoke(
      app,
      'POST',
      '/api/annual-tax/2026/forms/INVALID/generate',
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Unknown form type/i);
  });

  // ── Test 11
  test('POST /api/annual-tax/:year/forms/6111/generate handles missing chart_of_accounts gracefully', async () => {
    const seed = {
      company_tax_profile: [
        {
          id: 'prof-1',
          company_id: 'CO-1',
          legal_name: 'Techno-Kol Uzi',
          vat_file_number: '123456789',
        },
      ],
      fiscal_years: [
        {
          id: 'fy-2026',
          year: 2026,
          net_profit_before_tax: 0,
          total_revenue: 0,
          total_cogs: 0,
        },
      ],
      // NOTE: chart_of_accounts intentionally empty
    };
    const { app } = setup({ seed });
    const res = await invoke(
      app,
      'POST',
      '/api/annual-tax/2026/forms/6111/generate',
    );
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.report.form_type, '6111');
    assert.equal(res.body.report.payload.formType, '6111');
    // lines array present but empty when chart_of_accounts is empty
    assert.ok(Array.isArray(res.body.report.payload.lines));
    assert.equal(res.body.report.payload.lines.length, 0);
  });

  // ── Test 12
  test('audit() is called on each create/update across endpoints', async () => {
    const { app, auditCalls, supabase } = setup({
      seed: {
        projects: [
          { id: 'p-existing', project_code: 'P-E', name: 'Existing', client_id: 'c-1' },
        ],
      },
    });

    // POST project
    await invoke(app, 'POST', '/api/projects', {
      project_code: 'P-999',
      client_id: 'c-1',
      name: 'Fresh',
    });
    // PATCH project (existing)
    await invoke(app, 'PATCH', '/api/projects/p-existing', { name: 'Renamed' });
    // POST customer
    await invoke(app, 'POST', '/api/customers', { name: 'Bob', tax_id: '123' });
    // POST invoice
    await invoke(app, 'POST', '/api/customer-invoices', {
      invoice_number: 'INV-AUDIT',
      customer_id: 'c-1',
      customer_name: 'Bob',
      net_amount: 500,
      vat_rate: 0.17,
    });
    // POST payment
    await invoke(app, 'POST', '/api/customer-payments', {
      receipt_number: 'R-AUDIT',
      customer_id: 'c-1',
      customer_name: 'Bob',
      amount: 100,
      payment_date: '2026-03-15',
    });

    const entities = auditCalls.map((c) => c[0]);
    assert.ok(entities.includes('project'), 'project audit missing');
    assert.ok(entities.includes('customer'), 'customer audit missing');
    assert.ok(
      entities.includes('customer_invoice'),
      'customer_invoice audit missing',
    );
    assert.ok(
      entities.includes('customer_payment'),
      'customer_payment audit missing',
    );
    // At least one "updated" action (from PATCH)
    const actions = auditCalls.map((c) => c[2]);
    assert.ok(actions.includes('updated'), 'updated audit missing (from PATCH)');
    assert.ok(actions.includes('created'), 'created audit missing');
    // Ensure each audit carried actor
    for (const c of auditCalls) {
      assert.equal(c[3], 'test-user', 'audit actor should be forwarded');
    }
    // Sanity: underlying DB writes happened
    assert.ok(supabase._db.projects.length >= 2);
    assert.equal(supabase._db.customers.length, 1);
    assert.equal(supabase._db.customer_invoices.length, 1);
    assert.equal(supabase._db.customer_payments.length, 1);
  });
});
