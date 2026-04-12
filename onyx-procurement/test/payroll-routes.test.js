/**
 * Integration tests for payroll routes — src/payroll/payroll-routes.js
 * Agent-13 — written 2026-04-11
 *
 * Run with:   node --test test/payroll-routes.test.js
 *
 * Strategy:
 *   - In-memory fake Supabase with a fluent query builder that supports the
 *     exact chains used by payroll-routes.js: .from().select().eq()/.lt()/
 *     .order()/.limit().single()/.maybeSingle(), .insert().select().single(),
 *     .update().eq().select().single(), .upsert().select().single().
 *   - Real express() app with routes registered under /api/payroll/*.
 *   - supertest-style requests via the native http module (no extra deps).
 *   - pdf-generator is stubbed via require.cache to avoid real disk writes
 *     except to a temp dir under test/tmp-pdfs-routes/, letting us assert
 *     pdf_path + pdf_generated_at without pulling in pdfkit.
 *
 * All tests hit the real wage-slip-calculator so we also get a smoke-level
 * verification that the calculator is wired correctly end-to-end.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ─────────────────────────────────────────────────────────────
// Set env + stub pdf-generator BEFORE requiring payroll-routes
// ─────────────────────────────────────────────────────────────
const TMP_DIR = path.join(__dirname, 'tmp-pdfs-routes');
if (fs.existsSync(TMP_DIR)) {
  for (const f of fs.readdirSync(TMP_DIR)) {
    try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) { /* ignore */ }
  }
} else {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}
process.env.PAYROLL_PDF_DIR = TMP_DIR;

// Stub pdf-generator in require.cache so the real pdfkit code never runs.
const pdfGenPath = require.resolve('../src/payroll/pdf-generator.js');
const pdfCalls = [];
require.cache[pdfGenPath] = {
  id: pdfGenPath,
  filename: pdfGenPath,
  loaded: true,
  exports: {
    generateWageSlipPdf: async (slip, outputPath) => {
      pdfCalls.push({ slip, outputPath });
      // Write a tiny fake PDF to outputPath so fs.existsSync paths work.
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const stub = Buffer.from('%PDF-1.4\n% stub PDF for integration test\n%%EOF\n');
      fs.writeFileSync(outputPath, stub);
      return { path: outputPath, size: stub.length };
    },
  },
};

const express = require('express');
const { registerPayrollRoutes } = require('../src/payroll/payroll-routes.js');

// ─────────────────────────────────────────────────────────────
// In-memory fake Supabase client
// ─────────────────────────────────────────────────────────────

/**
 * Creates a mock supabase client backed by `tables` (a map of name→array of
 * rows). Supports only the query shapes used by payroll-routes.js.
 *
 * Filter semantics: .eq / .lt compose AND filters. .select is a no-op. The
 * final awaitable object resolves to { data, error }. .single() requires
 * exactly one row or returns an error; .maybeSingle() returns the first row
 * (or null) without erroring when empty.
 */
function makeSupabase(tables) {
  let nextId = 1000;
  function genId() { return nextId++; }

  function fromTable(table) {
    const state = {
      table,
      filters: [],
      orderBys: [],
      limitCount: null,
      op: null,          // 'select' | 'insert' | 'update' | 'upsert'
      insertRow: null,
      updatePatch: null,
      upsertRow: null,
    };
    const rows = () => (tables[table] = tables[table] || []);

    function applyFilters(list) {
      return list.filter((row) =>
        state.filters.every(({ kind, col, val }) => {
          if (kind === 'eq') return row[col] == val;
          if (kind === 'lt') return row[col] != null && row[col] < val;
          return true;
        })
      );
    }

    function applyOrder(list) {
      let out = list.slice();
      for (const { col, asc } of state.orderBys.slice().reverse()) {
        out.sort((a, b) => {
          const av = a[col]; const bv = b[col];
          if (av == null && bv == null) return 0;
          if (av == null) return asc ? -1 : 1;
          if (bv == null) return asc ? 1 : -1;
          if (av < bv) return asc ? -1 : 1;
          if (av > bv) return asc ? 1 : -1;
          return 0;
        });
      }
      return out;
    }

    function runSelect() {
      let out = applyFilters(rows());
      out = applyOrder(out);
      if (state.limitCount != null) out = out.slice(0, state.limitCount);
      return { data: out, error: null };
    }

    function runInsert() {
      const arr = Array.isArray(state.insertRow) ? state.insertRow : [state.insertRow];
      const inserted = [];
      for (const row of arr) {
        const copy = { ...row };
        if (copy.id == null) copy.id = genId();
        rows().push(copy);
        inserted.push(copy);
      }
      return { data: inserted, error: null };
    }

    function runUpdate() {
      const matched = applyFilters(rows());
      for (const row of matched) Object.assign(row, state.updatePatch);
      return { data: matched, error: null };
    }

    function runUpsert() {
      const arr = Array.isArray(state.upsertRow) ? state.upsertRow : [state.upsertRow];
      const result = [];
      for (const row of arr) {
        // naive upsert: match by id if present, else insert.
        if (row.id != null) {
          const existing = rows().find((r) => r.id == row.id);
          if (existing) {
            Object.assign(existing, row);
            result.push(existing);
            continue;
          }
        }
        const copy = { ...row };
        if (copy.id == null) copy.id = genId();
        rows().push(copy);
        result.push(copy);
      }
      return { data: result, error: null };
    }

    function executeBase() {
      if (state.op === 'insert') return runInsert();
      if (state.op === 'update') return runUpdate();
      if (state.op === 'upsert') return runUpsert();
      return runSelect();
    }

    const builder = {
      select() { return builder; },
      eq(col, val) { state.filters.push({ kind: 'eq', col, val }); return builder; },
      lt(col, val) { state.filters.push({ kind: 'lt', col, val }); return builder; },
      order(col, opts = {}) {
        state.orderBys.push({ col, asc: opts.ascending !== false });
        return builder;
      },
      limit(n) { state.limitCount = n; return builder; },
      insert(row) { state.op = 'insert'; state.insertRow = row; return builder; },
      update(patch) { state.op = 'update'; state.updatePatch = patch; return builder; },
      upsert(row) { state.op = 'upsert'; state.upsertRow = row; return builder; },

      // terminal
      single() {
        const { data, error } = executeBase();
        if (error) return Promise.resolve({ data: null, error });
        if (!data || data.length === 0) {
          return Promise.resolve({ data: null, error: { message: 'no rows' } });
        }
        return Promise.resolve({ data: data[0], error: null });
      },
      maybeSingle() {
        const { data, error } = executeBase();
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: data && data[0] ? data[0] : null, error: null });
      },
      // awaiting the builder directly = run the full query
      then(onFulfilled, onRejected) {
        try {
          const result = executeBase();
          return Promise.resolve(result).then(onFulfilled, onRejected);
        } catch (err) {
          return Promise.reject(err).catch(onRejected);
        }
      },
    };

    return builder;
  }

  return {
    from: fromTable,
    _tables: tables,
  };
}

// ─────────────────────────────────────────────────────────────
// Mini HTTP helper — POSTs/GETs JSON against a running server
// ─────────────────────────────────────────────────────────────
function request(server, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload ? payload.length : 0,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* not json */ }
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Shared test-app factory — gives each test a fresh world
// ─────────────────────────────────────────────────────────────
function makeAuditStub() {
  const calls = [];
  return Object.assign(
    async (...args) => { calls.push(args); },
    { calls },
  );
}

function seed() {
  return {
    employers: [
      {
        id: 1,
        legal_name: 'Onyx Construction Ltd',
        company_id: '514000000',
        tax_file_number: '937123456',
      },
    ],
    employees: [
      {
        id: 10,
        employer_id: 1,
        employee_number: 'E-00010',
        first_name: 'Moshe',
        last_name: 'Cohen',
        full_name: 'Moshe Cohen',
        national_id: '123456782',
        position: 'Technician',
        department: 'Production',
        employment_type: 'monthly',
        base_salary: 15000,
        hours_per_month: 182,
        work_percentage: 100,
        tax_credits: 2.25,
        study_fund_number: 'SF-100',
        is_active: true,
      },
    ],
    wage_slips: [],
    employee_balances: [
      {
        id: 1,
        employee_id: 10,
        snapshot_date: '2026-03-31',
        vacation_days_balance: 12.5,
        sick_days_balance: 20.0,
        study_fund_balance: 18000.00,
        severance_balance: 42000.00,
      },
    ],
    payroll_audit_log: [],
  };
}

async function startApp(tablesOverride) {
  const tables = tablesOverride || seed();
  const supabase = makeSupabase(tables);
  const audit = makeAuditStub();
  const app = express();
  app.use(express.json());
  // forward an actor from header for easy testing
  app.use((req, _res, next) => {
    req.actor = req.headers['x-actor'] || 'test-agent';
    next();
  });
  registerPayrollRoutes(app, { supabase, audit });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return { server, tables, audit, close: () => new Promise((r) => server.close(() => r())) };
}

const baseTimesheet = {
  hours_regular: 182,
  hours_overtime_125: 0,
  hours_overtime_150: 0,
  hours_overtime_175: 0,
  hours_overtime_200: 0,
  hours_absence: 0,
  hours_vacation: 0,
  hours_sick: 0,
  bonuses: 0,
};

const basePeriod = { year: 2026, month: 4 };

// ═════════════════════════════════════════════════════════════
// 1. POST /api/payroll/employers — creates employer
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/employers creates employer and audits', async () => {
  const ctx = await startApp();
  try {
    const res = await request(ctx.server, 'POST', '/api/payroll/employers', {
      legal_name: 'New Co Ltd',
      company_id: '520000001',
      tax_file_number: '940000001',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.employer);
    assert.equal(res.body.employer.legal_name, 'New Co Ltd');
    assert.equal(res.body.employer.company_id, '520000001');
    // ensure persisted
    assert.equal(ctx.tables.employers.length, 2);
    // ensure audit entry fired for entity_type 'employer'
    assert.ok(ctx.audit.calls.some((c) => c[0] === 'employer' && c[2] === 'created'));
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 2. POST /api/payroll/employees — creates employee
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/employees creates employee linked to employer', async () => {
  const ctx = await startApp();
  try {
    const res = await request(ctx.server, 'POST', '/api/payroll/employees', {
      employer_id: 1,
      employee_number: 'E-00099',
      first_name: 'Sarah',
      last_name: 'Levy',
      full_name: 'Sarah Levy',
      national_id: '987654321',
      employment_type: 'monthly',
      base_salary: 18000,
      tax_credits: 2.75,
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.employee);
    assert.equal(res.body.employee.employer_id, 1);
    assert.equal(res.body.employee.employee_number, 'E-00099');
    // FK: the route inserts whatever employer_id you pass — route does not
    // validate FK itself (responsibility of DB). Document that here.
    assert.equal(ctx.tables.employees.length, 2);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 3. POST /api/payroll/wage-slips/compute — preview only
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips/compute returns preview without writing', async () => {
  const ctx = await startApp();
  try {
    const before = ctx.tables.wage_slips.length;
    const res = await request(ctx.server, 'POST', '/api/payroll/wage-slips/compute', {
      employee_id: 10,
      timesheet: baseTimesheet,
      period: basePeriod,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.preview, true);
    assert.ok(res.body.wage_slip);
    assert.equal(res.body.wage_slip.period_year, 2026);
    assert.equal(res.body.wage_slip.period_month, 4);
    // gross > 0 because monthly base 15000 with full hours
    assert.ok(res.body.wage_slip.gross_pay > 0);
    // Balances were merged from employee_balances
    assert.equal(res.body.wage_slip.vacation_balance, 12.5);
    assert.equal(res.body.wage_slip.sick_balance, 20);
    // Should NOT have written a wage slip row
    assert.equal(ctx.tables.wage_slips.length, before);
    // Should NOT have emitted a payroll_audit_log entry either
    assert.equal(ctx.tables.payroll_audit_log.length, 0);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 4. POST /api/payroll/wage-slips — uniqueness guard (409)
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips enforces uniqueness per employee+period', async () => {
  const ctx = await startApp();
  try {
    const body = { employee_id: 10, timesheet: baseTimesheet, period: basePeriod };
    const first = await request(ctx.server, 'POST', '/api/payroll/wage-slips', body);
    assert.equal(first.status, 201);
    assert.equal(ctx.tables.wage_slips.length, 1);

    const second = await request(ctx.server, 'POST', '/api/payroll/wage-slips', body);
    assert.equal(second.status, 409);
    assert.match(second.body.error, /already exists/i);
    assert.equal(second.body.existing_id, first.body.wage_slip.id);
    // no new row
    assert.equal(ctx.tables.wage_slips.length, 1);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 5. Wage slip create loads YTD from prior months correctly
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips accumulates YTD from prior months', async () => {
  const tables = seed();
  // seed prior-month slip (month 3) with known totals
  tables.wage_slips.push({
    id: 500,
    employee_id: 10,
    employer_id: 1,
    period_year: 2026,
    period_month: 3,
    gross_pay: 15000,
    income_tax: 1200,
    bituach_leumi: 500,
    pension_employee: 900,
    status: 'issued',
  });
  const ctx = await startApp(tables);
  try {
    const res = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: { year: 2026, month: 4 },
    });
    assert.equal(res.status, 201);
    const slip = res.body.wage_slip;
    // YTD gross = prior (15000) + this month gross
    assert.ok(slip.ytd_gross >= 15000 + slip.gross_pay - 0.01);
    assert.ok(slip.ytd_gross <= 15000 + slip.gross_pay + 0.01);
    // YTD income tax = 1200 + this month income_tax
    assert.ok(Math.abs(slip.ytd_income_tax - (1200 + slip.income_tax)) < 0.01);
    // YTD bituach_leumi = 500 + this month
    assert.ok(Math.abs(slip.ytd_bituach_leumi - (500 + slip.bituach_leumi)) < 0.01);
    // YTD pension = 900 + this month
    assert.ok(Math.abs(slip.ytd_pension - (900 + slip.pension_employee)) < 0.01);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 6. Wage slip create pulls balances from employee_balances
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips merges employee_balances into slip', async () => {
  const ctx = await startApp();
  try {
    const res = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: basePeriod,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.wage_slip.vacation_balance, 12.5);
    assert.equal(res.body.wage_slip.sick_balance, 20.0);
    assert.equal(res.body.wage_slip.study_fund_balance, 18000.00);
    assert.equal(res.body.wage_slip.severance_balance, 42000.00);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 7. Approve transitions from 'computed' / 'draft' only
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips/:id/approve allows computed→approved', async () => {
  const ctx = await startApp();
  try {
    const created = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: basePeriod,
    });
    assert.equal(created.status, 201);
    const id = created.body.wage_slip.id;
    // status after create should be 'computed'
    assert.equal(created.body.wage_slip.status, 'computed');

    const approved = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/approve`, {});
    assert.equal(approved.status, 200);
    assert.equal(approved.body.wage_slip.status, 'approved');
    assert.ok(approved.body.wage_slip.approved_at);

    // Re-approve when already 'approved' → 409
    const reapprove = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/approve`, {});
    assert.equal(reapprove.status, 409);
    assert.match(reapprove.body.error, /Cannot approve/i);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 8. Approve on a voided slip → 409
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips/:id/approve on voided returns 409', async () => {
  const ctx = await startApp();
  try {
    const created = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: basePeriod,
    });
    const id = created.body.wage_slip.id;
    const voidRes = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/void`, {
      reason: 'data entry error',
    });
    assert.equal(voidRes.status, 200);
    assert.equal(voidRes.body.wage_slip.status, 'voided');

    const approve = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/approve`, {});
    assert.equal(approve.status, 409);
    assert.match(approve.body.error, /Cannot approve slip in status voided/i);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 9. Issue requires status 'approved'
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips/:id/issue requires approved status', async () => {
  const ctx = await startApp();
  try {
    const created = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: basePeriod,
    });
    const id = created.body.wage_slip.id;
    // Still in 'computed' — issue must 409.
    const early = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/issue`, {});
    assert.equal(early.status, 409);
    assert.match(early.body.error, /Cannot issue slip in status computed/i);

    // Approve then issue succeeds.
    await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/approve`, {});
    const ok = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/issue`, {});
    assert.equal(ok.status, 200);
    assert.equal(ok.body.wage_slip.status, 'issued');
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 10. Issue sets pdf_path + pdf_generated_at
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips/:id/issue writes pdf_path and pdf_generated_at', async () => {
  const ctx = await startApp();
  try {
    const created = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: basePeriod,
    });
    const id = created.body.wage_slip.id;
    await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/approve`, {});
    const res = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/issue`, {});
    assert.equal(res.status, 200);
    const slip = res.body.wage_slip;
    assert.ok(slip.pdf_path, 'pdf_path should be set');
    assert.ok(slip.pdf_generated_at, 'pdf_generated_at should be set');
    assert.ok(res.body.pdf, 'response should include pdf summary');
    assert.ok(res.body.pdf.size > 0);
    // The stub pdf was actually written to TMP_DIR
    assert.ok(fs.existsSync(slip.pdf_path), 'pdf file should exist on disk');
    assert.ok(slip.pdf_path.startsWith(TMP_DIR), 'pdf should be inside TMP_DIR');
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 11. Void appends VOIDED note with reason
// ═════════════════════════════════════════════════════════════
test('POST /api/payroll/wage-slips/:id/void appends VOIDED note with reason', async () => {
  const ctx = await startApp();
  try {
    const created = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: basePeriod,
    });
    const id = created.body.wage_slip.id;
    const reason = 'superseded by corrected timesheet';
    const res = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/void`, { reason });
    assert.equal(res.status, 200);
    const slip = res.body.wage_slip;
    assert.equal(slip.status, 'voided');
    assert.match(slip.notes, /VOIDED /);
    assert.match(slip.notes, new RegExp(reason));
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 12. payroll_audit_log rows for compute/approve/issue/void
// ═════════════════════════════════════════════════════════════
test('payroll_audit_log captures compute, approve, issue, and void events', async () => {
  const ctx = await startApp();
  try {
    const created = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: 10, timesheet: baseTimesheet, period: basePeriod,
    });
    const id = created.body.wage_slip.id;
    await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/approve`, {});
    await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/issue`, {});
    await request(ctx.server, 'POST', `/api/payroll/wage-slips/${id}/void`, { reason: 'test void' });

    const events = ctx.tables.payroll_audit_log.map((r) => r.event_type);
    assert.ok(events.includes('wage_slip_computed'), 'missing wage_slip_computed audit');
    assert.ok(events.includes('wage_slip_approved'), 'missing wage_slip_approved audit');
    assert.ok(events.includes('wage_slip_issued'), 'missing wage_slip_issued audit');
    assert.ok(events.includes('wage_slip_voided'), 'missing wage_slip_voided audit');

    // All rows should reference the same wage_slip_id and employee_id
    for (const row of ctx.tables.payroll_audit_log) {
      assert.equal(row.wage_slip_id, id);
      assert.equal(row.employee_id, 10);
    }
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 13. Status guard: cannot recompute same period without voiding
// ═════════════════════════════════════════════════════════════
test('cannot POST /wage-slips for same period twice unless previous is voided', async () => {
  const ctx = await startApp();
  try {
    const body = { employee_id: 10, timesheet: baseTimesheet, period: basePeriod };
    const first = await request(ctx.server, 'POST', '/api/payroll/wage-slips', body);
    assert.equal(first.status, 201);
    const dup = await request(ctx.server, 'POST', '/api/payroll/wage-slips', body);
    assert.equal(dup.status, 409);
    // Void the first, then retry — should succeed.
    const voidRes = await request(ctx.server, 'POST',
      `/api/payroll/wage-slips/${first.body.wage_slip.id}/void`, { reason: 'correct and resubmit' });
    assert.equal(voidRes.status, 200);
    const retry = await request(ctx.server, 'POST', '/api/payroll/wage-slips', body);
    assert.equal(retry.status, 201);
    // Two rows now, first is voided, second is computed.
    assert.equal(ctx.tables.wage_slips.length, 2);
    const statuses = ctx.tables.wage_slips.map((r) => r.status).sort();
    assert.deepEqual(statuses, ['computed', 'voided']);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 14. GET /api/payroll/wage-slips supports filters
// ═════════════════════════════════════════════════════════════
test('GET /api/payroll/wage-slips filters by employee_id and period_year', async () => {
  const tables = seed();
  tables.wage_slips.push(
    { id: 901, employee_id: 10, employer_id: 1, period_year: 2025, period_month: 12,
      gross_pay: 10000, status: 'issued' },
    { id: 902, employee_id: 10, employer_id: 1, period_year: 2026, period_month: 1,
      gross_pay: 12000, status: 'issued' },
    { id: 903, employee_id: 10, employer_id: 1, period_year: 2026, period_month: 2,
      gross_pay: 12500, status: 'approved' },
  );
  const ctx = await startApp(tables);
  try {
    const all = await request(ctx.server, 'GET', '/api/payroll/wage-slips?employee_id=10');
    assert.equal(all.status, 200);
    assert.equal(all.body.wage_slips.length, 3);
    const only2026 = await request(ctx.server, 'GET', '/api/payroll/wage-slips?employee_id=10&period_year=2026');
    assert.equal(only2026.body.wage_slips.length, 2);
    const onlyApproved = await request(ctx.server, 'GET',
      '/api/payroll/wage-slips?employee_id=10&status=approved');
    assert.equal(onlyApproved.body.wage_slips.length, 1);
    assert.equal(onlyApproved.body.wage_slips[0].id, 903);
  } finally {
    await ctx.close();
  }
});

// ═════════════════════════════════════════════════════════════
// 15. GET /api/payroll/employees/:id/balances  &  POST same
// ═════════════════════════════════════════════════════════════
test('GET/POST /api/payroll/employees/:id/balances returns and upserts balances', async () => {
  const ctx = await startApp();
  try {
    const getRes = await request(ctx.server, 'GET', '/api/payroll/employees/10/balances');
    assert.equal(getRes.status, 200);
    assert.ok(getRes.body.balances);
    assert.equal(getRes.body.balances.vacation_days_balance, 12.5);

    const postRes = await request(ctx.server, 'POST', '/api/payroll/employees/10/balances', {
      snapshot_date: '2026-04-30',
      vacation_days_balance: 14.0,
      sick_days_balance: 21.0,
      study_fund_balance: 18500,
      severance_balance: 42500,
    });
    assert.equal(postRes.status, 200);
    assert.equal(postRes.body.balances.vacation_days_balance, 14.0);
  } finally {
    await ctx.close();
  }
});
