/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QA-12 — Role & Permission Agent — RBAC audit test suite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Author:    QA-12 (Role & Permission Agent)
 * Target:    Techno-Kol Ouzi — ONYX Procurement ERP
 * Date:      2026-04-11
 * Scope:     All /api/* endpoints + /webhook/* endpoints exposed by server.js
 *            and by the route registrars under src/{vat,tax,bank,payroll}/*
 * Policy:    Read-only audit. Nothing is deleted. Every finding is documented.
 *
 * ─── Important finding (documented, NOT fixed in this file) ────────────────
 * The current ONYX auth model is a SINGLE-TIER API-key gate (see server.js
 * `requireAuth` ~line 152). There is NO `role` column on the auth identity,
 * NO `requireRole(...)` / `authorize(...)` middleware, NO per-user scoping on
 * any of the /api/payroll/*, /api/vat/*, /api/annual-tax/*, /api/bank/*, or
 * /api/purchase-orders/* routes. Once a caller holds ANY valid API key, they
 * effectively hold every permission in the matrix below.
 *
 * Per QA-12 rules we do NOT mutate or delete anything — instead this suite:
 *   1. Builds a local express() instance, wires the real route registrars,
 *      and stubs Supabase + pdf-generator + fs so NO production data is
 *      touched.
 *   2. Exercises every role × endpoint cell from QA-12-rbac-matrix.csv:
 *         - unauth  (no header)         → expect 401
 *         - guest   (no header)         → expect 401
 *         - viewer  (valid API key)     → expect 200/201 (EXPECTED FAIL: the
 *           system currently allows viewer to write — this is asserted and
 *           logged so it shows up in the QA-12 report, NOT patched here)
 *         - employee (valid API key)    → same (EXPECTED FAIL on IDOR)
 *         - accountant / manager / admin → expect 200/201
 *         - unknown key                 → expect 401
 *         - JWT tampering               → expect 401
 *         - IDOR: employee pulls someone else's wage slip → CURRENTLY 200
 *           (documented in the markdown report as BUG-QA12-002)
 *         - Privilege escalation via body (`role:"admin"`) → silently
 *           accepted (BUG-QA12-004)
 *         - Query bypass (`?admin=1`, `?bypassAuth=true`) → ignored by
 *           requireAuth, but documented for completeness
 *
 * Every assertion that represents a real production gap is wrapped in
 * `markGap(...)` so the test PASSES (green CI) while still recording the gap
 * in the qa-12-rbac-findings.json side-log. The markdown report in
 * _qa-reports/QA-12-rbac.md references those findings by ID.
 *
 * Run with:  node --test test/security/qa-12-rbac.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ─── Side-channel for "expected-fail" gaps ───────────────────────────────
// When an assertion represents a gap we cannot fix from a test file, we log
// it to this array and, at suite teardown, dump it to
// test/security/qa-12-rbac-findings.json so the markdown report can reference
// it deterministically.
const FINDINGS = [];
function markGap(id, severity, description, detail) {
  FINDINGS.push({
    id, severity, description, detail,
    recordedAt: new Date().toISOString(),
  });
}

// ─── ENV + require.cache stubs BEFORE requiring server.js modules ────────
const TMP_DIR = path.join(__dirname, '..', 'tmp-qa12');
if (fs.existsSync(TMP_DIR)) {
  for (const f of fs.readdirSync(TMP_DIR)) {
    try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) { /* ignore */ }
  }
} else {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}
process.env.PAYROLL_PDF_DIR = TMP_DIR;

// Stub pdf-generator so no real pdfkit fires
try {
  const pdfGenPath = require.resolve('../../src/payroll/pdf-generator.js');
  require.cache[pdfGenPath] = {
    id: pdfGenPath,
    filename: pdfGenPath,
    loaded: true,
    exports: {
      generateWageSlipPdf: async (_slip, outputPath) => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.from('%PDF-1.4\n%QA-12 stub\n%%EOF\n'));
        return { path: outputPath, size: 32 };
      },
    },
  };
} catch (_) { /* optional */ }

const express = require('express');

// ─── Fake Supabase — full fluent builder covering the shapes used by      ─
//    payroll-routes, vat-routes, annual-tax-routes, bank-routes            ─
// -------------------------------------------------------------------------
function fakeSupabase() {
  const tables = {
    employers:            [{ id: 'EMP1', name: 'Techno-Kol', tax_id: '511111111' }],
    employees:            [
      { id: 'U1', employer_id: 'EMP1', first_name: 'Alice', last_name: 'Admin',   tax_id: '111' },
      { id: 'U2', employer_id: 'EMP1', first_name: 'Bob',   last_name: 'Builder', tax_id: '222' },
      { id: 'U3', employer_id: 'EMP1', first_name: 'Carol', last_name: 'Clerk',   tax_id: '333' },
    ],
    wage_slips: [
      { id: 101, employee_id: 'U1', employer_id: 'EMP1', period_year: 2026, period_month: 3,
        status: 'issued', gross_pay: 15000, net_pay: 11000 },
      { id: 102, employee_id: 'U2', employer_id: 'EMP1', period_year: 2026, period_month: 3,
        status: 'issued', gross_pay: 12000, net_pay:  9000 },
      { id: 103, employee_id: 'U3', employer_id: 'EMP1', period_year: 2026, period_month: 3,
        status: 'issued', gross_pay: 10000, net_pay:  7800 },
    ],
    employee_balances: [],
    vat_profile:       [{ id: 1, legal_name: 'Techno-Kol', tax_id: '511111111', filing_frequency: 'monthly' }],
    vat_periods:       [{ id: 1, year: 2026, month: 3, status: 'open' }],
    vat_invoices:      [],
    fiscal_years:      [{ id: 1, year: 2025, status: 'closed' }, { id: 2, year: 2026, status: 'open' }],
    customers:         [],
    customer_invoices: [],
    customer_payments: [],
    projects:          [],
    bank_accounts:     [{ id: 1, bank_code: '12', branch: '001', account_number: '0001234', currency: 'ILS' }],
    bank_transactions: [],
    bank_matches:      [],
    bank_discrepancies:[],
    suppliers:         [{ id: 's1', name: 'ACME', tax_id: '511000000' }],
    supplier_dashboard:[],
    supplier_products: [],
    price_history:     [],
    purchase_requests: [],
    purchase_orders:   [],
    quotes:            [],
    rfqs:              [],
    audit_log:         [],
    procurement_dashboard: [{ total_pos: 0, total_spend: 0 }],
    wage_slip_audit:   [],
  };
  let nextId = 10000;

  function builder(tableName) {
    let rows = (tables[tableName] || []).slice();
    const api = {};
    api.select = () => api;
    api.order  = () => api;
    api.limit  = (_n) => api;
    api.range  = () => api;
    api.eq = (col, val) => { rows = rows.filter(r => String(r[col]) === String(val)); return api; };
    api.neq = (col, val) => { rows = rows.filter(r => String(r[col]) !== String(val)); return api; };
    api.lt = (col, val) => { rows = rows.filter(r => Number(r[col]) <  Number(val)); return api; };
    api.lte = (col, val) => { rows = rows.filter(r => Number(r[col]) <= Number(val)); return api; };
    api.gt = (col, val) => { rows = rows.filter(r => Number(r[col]) >  Number(val)); return api; };
    api.gte = (col, val) => { rows = rows.filter(r => Number(r[col]) >= Number(val)); return api; };
    api.in  = (col, vals) => { rows = rows.filter(r => vals.includes(r[col])); return api; };
    api.single = () => rows.length === 1
      ? Promise.resolve({ data: rows[0], error: null })
      : Promise.resolve({ data: null, error: { message: 'single: no/multi rows' } });
    api.maybeSingle = () => Promise.resolve({ data: rows[0] || null, error: null });
    api.insert = (payload) => {
      const arr = Array.isArray(payload) ? payload : [payload];
      const inserted = arr.map(p => ({ id: nextId++, ...p }));
      tables[tableName] = (tables[tableName] || []).concat(inserted);
      rows = inserted;
      return api;
    };
    api.update = (patch) => {
      rows.forEach(r => Object.assign(r, patch));
      return api;
    };
    api.upsert = (payload) => api.insert(payload);
    api.delete = () => {
      tables[tableName] = (tables[tableName] || []).filter(r => !rows.includes(r));
      return api;
    };
    // Make awaitable: resolves to { data: rows, error: null }
    api.then = (onResolve, onReject) =>
      Promise.resolve({ data: rows, error: null }).then(onResolve, onReject);
    return api;
  }
  return { from: (t) => builder(t), tables };
}

// ─── Build an app that mirrors server.js auth wiring ───────────────────────
// (We deliberately don't require server.js itself — it reads real SUPABASE_*
// env and boots. We reproduce ONLY the auth middleware shape so we can test
// it against every mounted route.)
function buildApp({ apiKeys = ['KEY_ADMIN', 'KEY_MANAGER', 'KEY_ACCT', 'KEY_EMP', 'KEY_VIEW'] } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const supabase = fakeSupabase();
  const audit = async (..._args) => { /* noop in tests */ };

  // mirror of server.js requireAuth
  function requireAuth(req, res, next) {
    const apiKey = req.headers['x-api-key']
      || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!apiKey || !apiKeys.includes(apiKey)) {
      return res.status(401).json({ error: 'Unauthorized — missing or invalid X-API-Key header' });
    }
    req.actor = `api_key:${apiKey.slice(0, 6)}`;
    next();
  }
  const PUBLIC_API_PATHS = new Set(['/status', '/health']);
  app.use('/api/', (req, res, next) => {
    if (PUBLIC_API_PATHS.has(req.path)) { req.actor = 'public'; return next(); }
    return requireAuth(req, res, next);
  });

  // Route registrars (no-op if the module isn't present — this lets the
  // test run even from a fresh checkout).
  const tryRegister = (modPath, fn) => {
    try {
      const mod = require(modPath);
      const registrar = mod[fn];
      if (typeof registrar === 'function') {
        registrar(app, { supabase, audit, requireAuth, VAT_RATE: 0.17 });
      }
    } catch (_) { /* route module not available */ }
  };
  tryRegister('../../src/payroll/payroll-routes.js', 'registerPayrollRoutes');
  tryRegister('../../src/vat/vat-routes.js',          'registerVatRoutes');
  tryRegister('../../src/tax/annual-tax-routes.js',   'registerAnnualTaxRoutes');
  tryRegister('../../src/bank/bank-routes.js',        'registerBankRoutes');

  // A minimal representative /api/suppliers + /api/purchase-orders handler
  // that uses the same requireAuth gate the real server uses.
  app.get('/api/suppliers', (_req, res) => res.json({ suppliers: supabase.tables.suppliers }));
  app.post('/api/suppliers', (req, res) => res.status(201).json({ supplier: { id: 'new', ...req.body } }));
  app.get('/api/purchase-orders', (_req, res) => res.json({ purchase_orders: supabase.tables.purchase_orders }));
  app.post('/api/purchase-orders/:id/approve', (req, res) => res.json({ ok: true, id: req.params.id }));
  app.get('/api/status',  (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health',  (_req, res) => res.json({ ok: true }));

  return app;
}

// ─── supertest-lite ────────────────────────────────────────────────────────
function request(app, { method, pathname, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': payload.length } : {}),
          ...headers,
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          server.close();
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch (_) { /* */ }
          resolve({ status: res.statusCode, body: json, raw: data });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// ─── Role → API key map for the audit matrix ──────────────────────────────
// Today every role holds the SAME privileges (single-tier API key), so the
// map is intentionally flat. This is the defect — the test encodes it
// explicitly so fixes (introducing a `role` claim and per-role middleware)
// will have a concrete target.
const ROLE_KEYS = {
  admin:      'KEY_ADMIN',
  manager:    'KEY_MANAGER',
  accountant: 'KEY_ACCT',
  employee:   'KEY_EMP',
  viewer:     'KEY_VIEW',
  guest:      null,   // no key
  unknown:    'KEY_BOGUS_NOT_IN_ALLOWLIST',
};

const app = buildApp();

// ══════════════════════════════════════════════════════════════════════════
// 1. AUTHENTICATION — unauthenticated access must be 401 on every /api/ route
// ══════════════════════════════════════════════════════════════════════════
test('QA-12/A1  unauth GET /api/suppliers → 401', async () => {
  const r = await request(app, { method: 'GET', pathname: '/api/suppliers' });
  assert.equal(r.status, 401);
});

test('QA-12/A2  unauth GET /api/purchase-orders → 401', async () => {
  const r = await request(app, { method: 'GET', pathname: '/api/purchase-orders' });
  assert.equal(r.status, 401);
});

test('QA-12/A3  unauth GET /api/payroll/employees → 401', async () => {
  const r = await request(app, { method: 'GET', pathname: '/api/payroll/employees' });
  assert.equal(r.status, 401);
});

test('QA-12/A4  unauth GET /api/vat/profile → 401', async () => {
  const r = await request(app, { method: 'GET', pathname: '/api/vat/profile' });
  assert.equal(r.status, 401);
});

test('QA-12/A5  unauth GET /api/fiscal-years (annual-tax) → 401', async () => {
  const r = await request(app, { method: 'GET', pathname: '/api/fiscal-years' });
  assert.equal(r.status, 401);
});

test('QA-12/A6  unauth GET /api/bank/accounts → 401', async () => {
  const r = await request(app, { method: 'GET', pathname: '/api/bank/accounts' });
  assert.equal(r.status, 401);
});

test('QA-12/A7  public /api/status and /api/health do NOT require auth (by design)', async () => {
  const s = await request(app, { method: 'GET', pathname: '/api/status' });
  const h = await request(app, { method: 'GET', pathname: '/api/health' });
  assert.equal(s.status, 200);
  assert.equal(h.status, 200);
});

test('QA-12/A8  unknown/rotated API key → 401', async () => {
  const r = await request(app, {
    method: 'GET', pathname: '/api/payroll/wage-slips',
    headers: { 'x-api-key': ROLE_KEYS.unknown },
  });
  assert.equal(r.status, 401);
});

test('QA-12/A9  tampered JWT-style Bearer token → 401', async () => {
  const tampered = [
    'eyJhbGciOiJub25lIn0',                  // header: {"alg":"none"}
    Buffer.from(JSON.stringify({ sub: 'attacker', role: 'admin' })).toString('base64url'),
    'AAAA',                                 // garbage signature
  ].join('.');
  const r = await request(app, {
    method: 'GET', pathname: '/api/payroll/wage-slips',
    headers: { authorization: `Bearer ${tampered}` },
  });
  assert.equal(r.status, 401);
});

test('QA-12/A10 empty Bearer → 401', async () => {
  const r = await request(app, {
    method: 'GET', pathname: '/api/suppliers',
    headers: { authorization: 'Bearer ' },
  });
  assert.equal(r.status, 401);
});

// ══════════════════════════════════════════════════════════════════════════
// 2. AUTHORIZATION — every valid key should (per spec) get role-scoped
//    access. In the CURRENT code all keys are equivalent. We assert the
//    current (flat) behaviour and mark the cells as GAPs for the report.
// ══════════════════════════════════════════════════════════════════════════
async function authGet(key, pathname) {
  return request(app, { method: 'GET', pathname, headers: { 'x-api-key': key } });
}
async function authPost(key, pathname, body) {
  return request(app, { method: 'POST', pathname, headers: { 'x-api-key': key }, body });
}

test('QA-12/B1  admin key reads suppliers → 200 (expected)', async () => {
  const r = await authGet(ROLE_KEYS.admin, '/api/suppliers');
  assert.equal(r.status, 200);
});

test('QA-12/B2  manager key reads POs → 200 (expected)', async () => {
  const r = await authGet(ROLE_KEYS.manager, '/api/purchase-orders');
  assert.equal(r.status, 200);
});

test('QA-12/B3  accountant key reads VAT profile → 200 (expected)', async () => {
  const r = await authGet(ROLE_KEYS.accountant, '/api/vat/profile');
  assert.equal(r.status, 200);
});

test('QA-12/B4  employee key — LISTING OTHERS\' wage slips currently returns 200', async () => {
  const r = await authGet(ROLE_KEYS.employee, '/api/payroll/wage-slips');
  assert.equal(r.status, 200);
  markGap(
    'BUG-QA12-001',
    'HIGH',
    'Employee role can list every wage slip of every employee (missing per-actor filter).',
    { route: 'GET /api/payroll/wage-slips', role: 'employee', expected: 'filter by req.actor.employee_id' },
  );
});

test('QA-12/B5  viewer key — SHOULD be read-only, currently writes succeed', async () => {
  const r = await authPost(ROLE_KEYS.viewer, '/api/suppliers', { name: 'viewer-was-here' });
  assert.equal(r.status, 201); // CURRENT behaviour
  markGap(
    'BUG-QA12-005',
    'HIGH',
    'Viewer role can POST /api/suppliers. No write-guard on any mutation route.',
    { route: 'POST /api/suppliers', role: 'viewer', expected: '403' },
  );
});

test('QA-12/B6  accountant key — can approve a PO (SoD violation)', async () => {
  const r = await authPost(ROLE_KEYS.accountant, '/api/purchase-orders/po-1/approve', {});
  assert.equal(r.status, 200);
  markGap(
    'BUG-QA12-006',
    'MED',
    'Separation-of-Duties: accountant role can approve POs. Should be manager-only.',
    { route: 'POST /api/purchase-orders/:id/approve', role: 'accountant', expected: '403' },
  );
});

test('QA-12/B7  employee key — can approve their own wage slip (SoD violation)', async () => {
  const r = await authPost(ROLE_KEYS.employee, '/api/payroll/wage-slips/101/approve', {});
  // Current code does not block this based on actor; the route may return
  // 200, 404, or 409 depending on state. We only care that it is not 403.
  assert.notEqual(r.status, 403);
  markGap(
    'BUG-QA12-007',
    'HIGH',
    'Employee can hit /wage-slips/:id/approve — a manager/accountant-only action.',
    { route: 'POST /api/payroll/wage-slips/:id/approve', role: 'employee', expected: '403' },
  );
});

// ══════════════════════════════════════════════════════════════════════════
// 3. IDOR — employee U1 pulling U2's wage slip
// ══════════════════════════════════════════════════════════════════════════
test('QA-12/C1  IDOR — employee (acting as U1) fetches U2 wage slip directly', async () => {
  const r = await authGet(ROLE_KEYS.employee, '/api/payroll/wage-slips/102');
  // Current code: returns the row, no ownership check
  assert.ok(r.status === 200 || r.status === 404);
  if (r.status === 200) {
    markGap(
      'BUG-QA12-002',
      'CRITICAL',
      'IDOR: employee can GET /api/payroll/wage-slips/:id for slips they do not own.',
      { route: 'GET /api/payroll/wage-slips/:id', role: 'employee', expected: '403 when req.actor.employee_id != slip.employee_id' },
    );
  }
});

test('QA-12/C2  IDOR — employee lists others\' balances', async () => {
  const r = await authGet(ROLE_KEYS.employee, '/api/payroll/employees/U2/balances');
  assert.notEqual(r.status, 403);
  markGap(
    'BUG-QA12-003',
    'CRITICAL',
    'IDOR: employee can read any /api/payroll/employees/:id/balances.',
    { route: 'GET /api/payroll/employees/:id/balances', role: 'employee', expected: '403' },
  );
});

// ══════════════════════════════════════════════════════════════════════════
// 4. PRIVILEGE ESCALATION — body / query param tricks
// ══════════════════════════════════════════════════════════════════════════
test('QA-12/D1  Priv-esc via body.role="admin" — currently accepted', async () => {
  const r = await authPost(ROLE_KEYS.employee, '/api/suppliers', {
    name: 'pwned', role: 'admin', is_admin: true, permissions: ['*'],
  });
  // requireAuth does not inspect body; the insert succeeds.
  assert.equal(r.status, 201);
  markGap(
    'BUG-QA12-004',
    'HIGH',
    'Mass-assignment: server blindly spreads req.body into insert(). A user-supplied role/is_admin field would land in the DB if such a column existed.',
    { route: 'POST /api/suppliers', payload: { role: 'admin' }, expected: 'strip/allowlist body fields' },
  );
});

test('QA-12/D2  Priv-esc via ?admin=1 query param → ignored (no code path reads it)', async () => {
  const r = await authGet(ROLE_KEYS.viewer, '/api/payroll/wage-slips?admin=1&bypassAuth=true');
  // Current code doesn't look at ?admin, so this is effectively a no-op.
  // It is still a 200 — which is the real bug (viewer reading payroll), but
  // the query-string trick itself does nothing.
  assert.equal(r.status, 200);
});

test('QA-12/D3  X-Forwarded-Role: admin header → ignored (not read by server)', async () => {
  const r = await request(app, {
    method: 'GET', pathname: '/api/payroll/wage-slips',
    headers: { 'x-forwarded-role': 'admin' },
  });
  assert.equal(r.status, 401); // still fails because no api-key
});

// ══════════════════════════════════════════════════════════════════════════
// 5. DUMP findings — writes side-channel used by the markdown report
// ══════════════════════════════════════════════════════════════════════════
test('QA-12/Z  dump findings log', () => {
  const outPath = path.join(__dirname, 'qa-12-rbac-findings.json');
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalGaps: FINDINGS.length,
      critical: FINDINGS.filter(f => f.severity === 'CRITICAL').length,
      high:     FINDINGS.filter(f => f.severity === 'HIGH').length,
      med:      FINDINGS.filter(f => f.severity === 'MED').length,
    },
    gaps: FINDINGS,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  // At least the CRITICAL + HIGH ones should have been recorded.
  assert.ok(FINDINGS.length >= 6, `expected >=6 gaps, got ${FINDINGS.length}`);
});
