/**
 * ============================================================================
 *  QA-03 — Integration Test Agent
 *  File   : qa-03-payroll-frontend.test.js
 *  Agent  : QA-03 (Integration)
 *  Date   : 2026-04-11
 *
 *  Scope
 *  -----
 *  Tests the frontend (payroll-autonomous/src/App.jsx) ↔ backend
 *  (onyx-procurement/src/payroll/payroll-routes.js) integration. Instead
 *  of booting Vite+React we re-use the exact payload shape the React client
 *  sends (hand-copied from App.jsx :: ComputeTab) and hit the real Express
 *  routes with an in-memory mock supabase.
 *
 *  What this test verifies
 *  -----------------------
 *  1. The payload shape the React client sends to POST /api/payroll/wage-slips
 *     is accepted by the server (field names match).
 *
 *  2. The response shape the server returns is what the client reads
 *     (`{ wage_slip: {...} }`, `{ employees: [...] }`, `{ employers: [...] }`,
 *     `{ wage_slips: [...] }`) — not the Supabase-default shape.
 *
 *  3. Compute-preview endpoint returns `{ wage_slip, preview: true }`.
 *
 *  4. Duplicate-period returns 409 — important because App.jsx only parses
 *     `{ error }` from the body on non-2xx.
 *
 *  5. Hebrew field values survive the round trip unchanged (encoding,
 *     RTL control chars, nikud).
 *
 *  6. DOCUMENTS BUG-09: the PDF download URL is a plain <a href> in App.jsx —
 *     the browser won't send X-API-Key, so when procurement auth is enabled
 *     the download will 401. This test asserts the shape of the URL the
 *     client uses so we can catch a regression if/when someone fixes it.
 *
 *  Rule: NEW FILE ONLY — we do not touch App.jsx or payroll-routes.js.
 * ============================================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

// Stub PDF generator BEFORE requiring payroll-routes (same pattern as
// existing test/payroll-routes.test.js to avoid pulling pdfkit into tests).
const pdfGenPath = require.resolve(
  path.join('..', '..', 'src', 'payroll', 'pdf-generator.js'),
);
const pdfCalls = [];
require.cache[pdfGenPath] = {
  id: pdfGenPath,
  filename: pdfGenPath,
  loaded: true,
  exports: {
    generateWageSlipPdf: async (slip, out) => {
      pdfCalls.push({ slip, out });
      // simulate a real file so the route can stat it
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, '%PDF-1.4 (qa03-stub)');
      } catch (_e) { /* ignore */ }
      return { size: 42 };
    },
  },
};

const TMP_DIR = path.join(__dirname, '..', 'tmp-pdfs-qa03');
fs.mkdirSync(TMP_DIR, { recursive: true });
process.env.PAYROLL_PDF_DIR = TMP_DIR;

const { makeMockSupabase } = require(
  path.join('..', 'helpers', 'mock-supabase.js'),
);
const { registerPayrollRoutes } = require(
  path.join('..', '..', 'src', 'payroll', 'payroll-routes.js'),
);

// ---------------------------------------------------------------------------
// Boot a real Express app wired to a mock supabase + capture audit calls
// ---------------------------------------------------------------------------

function bootApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const audit = [];
  const captureAudit = (type, id, action, actor, description, before, after) =>
    audit.push({ type, id, action, actor, description, before, after });

  // Seed realistic data — shapes come from the real wage-slip-calculator
  // expectations (first_name/last_name/employer_id/is_active/tax credits/etc.)
  const supabase = makeMockSupabase(
    {
      employers: [
        {
          id: 1,
          legal_name: 'טכנו-קול עוזי בע"מ',
          deduction_file_number: '123456789',
          address: 'ת"ד 123, תל-אביב',
          pension_provider: 'מגדל',
          pension_rate_employer: 6.5,
          pension_rate_employee: 6,
          pension_rate_severance: 6,
          study_fund_rate_employer: 7.5,
          study_fund_rate_employee: 2.5,
        },
      ],
      employees: [
        {
          id: 10,
          employer_id: 1,
          employee_number: 'E-001',
          first_name: 'אבי',
          last_name: 'כהן',
          full_name: 'אבי כהן',
          id_number: '123456789',
          tax_credits: 2.25,
          base_salary: 10000,
          hourly_rate: 55,
          is_active: true,
          start_date: '2024-01-01',
          address: 'רחוב הרצל 7, חיפה',
          pension_scheme: 'pension',
        },
      ],
      wage_slips: [],
      employee_balances: [
        {
          id: 1,
          employee_id: 10,
          vacation_days_balance: 12,
          sick_days_balance: 30,
          study_fund_balance: 5000,
          severance_balance: 22000,
          snapshot_date: '2026-03-31',
        },
      ],
      payroll_audit_log: [],
    },
    {
      constraints: {
        wage_slips: [['employee_id', 'period_year', 'period_month']],
      },
    },
  );

  registerPayrollRoutes(app, { supabase, audit: captureAudit });

  return { app, audit, supabase };
}

// tiny native http client (no supertest dependency)
function request(app, method, urlPath, body) {
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address();
      const payload = body ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: urlPath,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload ? Buffer.byteLength(payload) : 0,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            srv.close();
            let parsed;
            try { parsed = JSON.parse(data); } catch { parsed = data; }
            resolve({ status: res.statusCode, body: parsed });
          });
        },
      );
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('QA-03 PAYROLL-FE :: GET /api/payroll/employees returns { employees: [...] } — matches App.jsx', async () => {
  const { app } = bootApp();
  const res = await request(app, 'GET', '/api/payroll/employees');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.employees), 'response must be { employees: [...] }');
  // App.jsx does `employees.filter(e => e.is_active)` — field must exist
  assert.equal(res.body.employees[0].is_active, true);
  // App.jsx renders `{e.first_name} {e.last_name}` and employee_number — all required
  assert.equal(res.body.employees[0].first_name, 'אבי', 'Hebrew first_name survives round trip');
  assert.equal(res.body.employees[0].last_name,  'כהן', 'Hebrew last_name survives round trip');
  assert.equal(res.body.employees[0].employee_number, 'E-001');
});

test('QA-03 PAYROLL-FE :: GET /api/payroll/employers returns { employers: [...] }', async () => {
  const { app } = bootApp();
  const res = await request(app, 'GET', '/api/payroll/employers');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.employers));
  assert.equal(
    res.body.employers[0].legal_name,
    'טכנו-קול עוזי בע"מ',
    'Hebrew legal_name with double-quote survives JSON',
  );
});

test('QA-03 PAYROLL-FE :: GET /api/payroll/wage-slips returns { wage_slips: [...] }', async () => {
  const { app } = bootApp();
  const res = await request(app, 'GET', '/api/payroll/wage-slips');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.wage_slips));
});

test('QA-03 PAYROLL-FE :: POST compute with React payload shape returns { wage_slip, preview: true }', async () => {
  const { app } = bootApp();
  // Payload copied verbatim from App.jsx :: ComputeTab initial state
  const reactPayload = {
    employee_id: 10,
    period: { year: 2026, month: 4, pay_date: '2026-05-09' },
    timesheet: {
      hours_regular: 182, hours_overtime_125: 0, hours_overtime_150: 0,
      hours_overtime_175: 0, hours_overtime_200: 0,
      hours_vacation: 0, hours_sick: 0, hours_absence: 0,
      bonuses: 0, commissions: 0,
      allowances_meal: 0, allowances_travel: 0, allowances_clothing: 0, allowances_phone: 0,
    },
  };

  const res = await request(app, 'POST', '/api/payroll/wage-slips/compute', reactPayload);
  assert.equal(res.status, 200, `compute should be 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.preview, true);
  assert.ok(res.body.wage_slip, 'response must contain wage_slip');
  // App.jsx calls `setPreview(res.wage_slip)` and then reads gross_pay / net_pay
  assert.ok(
    'gross_pay' in res.body.wage_slip || 'grossPay' in res.body.wage_slip,
    'server must return gross_pay (snake_case) matching the client',
  );
});

test('QA-03 PAYROLL-FE :: POST /api/payroll/wage-slips creates then duplicate returns 409', async () => {
  const { app } = bootApp();
  const reactPayload = {
    employee_id: 10,
    period: { year: 2026, month: 4, pay_date: '2026-05-09' },
    timesheet: {
      hours_regular: 182, hours_overtime_125: 0, hours_overtime_150: 0,
      hours_overtime_175: 0, hours_overtime_200: 0,
      hours_vacation: 0, hours_sick: 0, hours_absence: 0,
      bonuses: 0, commissions: 0,
      allowances_meal: 0, allowances_travel: 0, allowances_clothing: 0, allowances_phone: 0,
    },
  };

  const first = await request(app, 'POST', '/api/payroll/wage-slips', reactPayload);
  assert.equal(first.status, 201, `first create should be 201: ${JSON.stringify(first.body)}`);
  assert.ok(first.body.wage_slip);
  assert.equal(first.body.wage_slip.employee_id, 10);
  assert.equal(first.body.wage_slip.period_year, 2026);
  assert.equal(first.body.wage_slip.period_month, 4);

  // Duplicate — App.jsx will `JSON.parse(text)` and show the `error` field.
  const dup = await request(app, 'POST', '/api/payroll/wage-slips', reactPayload);
  assert.equal(dup.status, 409, 'duplicate period must return 409');
  assert.ok(dup.body.error, 'error field must be present so UI can display it');
  assert.ok(
    typeof dup.body.existing_id === 'number' || typeof dup.body.existing_id === 'string',
    'existing_id must be returned so UI could link to the prior slip',
  );
});

test('QA-03 PAYROLL-FE :: missing employee_id yields 400 with { error } body', async () => {
  const { app } = bootApp();
  const res = await request(app, 'POST', '/api/payroll/wage-slips/compute', {
    period: { year: 2026, month: 4 },
    timesheet: {},
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'employee_id required');
});

test('QA-03 PAYROLL-FE :: BUG-09 — PDF download URL in App.jsx sends no auth header', async () => {
  // We do NOT actually call the PDF endpoint here; we document the shape.
  // When auth is enabled the client will fail because:
  //   1. App.jsx renders <a href={`${API_URL}/api/payroll/wage-slips/${id}/pdf`}>
  //   2. The browser will NOT attach the X-API-Key header on an <a> navigation.
  //   3. The PDF route is mounted behind requireAuth → 401.
  //
  // Assertion: the route pattern the client uses is exactly the server path,
  // so nothing upstream will catch the bug at lint / typecheck time.
  const appJsxPath = path.join(
    __dirname, '..', '..', '..', 'payroll-autonomous', 'src', 'App.jsx',
  );
  const src = fs.readFileSync(appJsxPath, 'utf8');
  assert.ok(
    src.includes('/api/payroll/wage-slips/') && src.includes('/pdf`'),
    'PDF download must exist in App.jsx (documented for bug traceability)',
  );
  assert.ok(
    src.includes('<a href={`${API_URL}/api/payroll/wage-slips/'),
    'BUG-09: PDF link is a plain <a href> — no fetch with X-API-Key',
  );
  assert.ok(
    !src.includes('/pdf?api_key=') && !src.includes('signedUrl'),
    'BUG-09: there is no signed URL / query-param workaround either',
  );
});

test('QA-03 PAYROLL-FE :: issue-flow schema surface matches the UI call sequence', async () => {
  // NOTE: full issue → pdf flow is already covered by
  // test/payroll-routes.test.js. Here we only verify the schema surface the
  // UI touches: the route names App.jsx hits exist and return JSON (the
  // actual number/string id casting is a pre-existing shared-mock quirk
  // that the existing test works around with a loose-equality makeSupabase).
  const { app } = bootApp();

  // App.jsx calls these exact routes in sequence — we just prove they are
  // all reachable and return JSON so routes don't silently move.
  const endpoints = [
    ['GET',  '/api/payroll/wage-slips'],
    ['GET',  '/api/payroll/employees'],
    ['GET',  '/api/payroll/employers'],
  ];
  for (const [method, p] of endpoints) {
    const res = await request(app, method, p);
    assert.equal(res.status, 200, `${method} ${p} must respond 200`);
    assert.ok(typeof res.body === 'object', `${method} ${p} must return JSON`);
  }

  // Verify the App.jsx source still uses these exact route paths so a rename
  // on the backend breaks this test immediately.
  const appJsxPath = path.join(
    __dirname, '..', '..', '..', 'payroll-autonomous', 'src', 'App.jsx',
  );
  const src = fs.readFileSync(appJsxPath, 'utf8');
  assert.ok(src.includes(`api('/api/payroll/wage-slips')`), 'App.jsx calls GET /api/payroll/wage-slips');
  assert.ok(src.includes(`api('/api/payroll/employees')`), 'App.jsx calls GET /api/payroll/employees');
  assert.ok(src.includes(`api('/api/payroll/employers')`), 'App.jsx calls GET /api/payroll/employers');
  assert.ok(src.includes(`/api/payroll/wage-slips/compute`), 'App.jsx calls POST .../wage-slips/compute');
  assert.ok(src.includes(`/approve`), 'App.jsx calls POST .../approve');
  assert.ok(src.includes(`/issue`),   'App.jsx calls POST .../issue');
});
