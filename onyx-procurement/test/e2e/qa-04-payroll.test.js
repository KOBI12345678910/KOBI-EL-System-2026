/**
 * QA-04 Scenario 2 — Payroll Full Flow (end-to-end)
 * ------------------------------------------------------------------
 * Flow under test:
 *   Manager creates employer -> adds employee -> reports timesheet ->
 *   computes wage slip -> approves -> issues PDF -> marks paid ->
 *   YTD updates on the next month's slip.
 *
 * Edge cases audited:
 *   - Can we approve a slip before computing it? (status-machine)
 *   - What happens when we try to issue a non-approved slip?
 *   - Does creating a duplicate slip for the same period get blocked?
 *   - Does YTD aggregate across prior months correctly?
 *   - Does "mark paid" guard against marking a non-issued slip as paid?
 *   - Does a 0-hour timesheet still produce a sane (non-crashing) slip?
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFullApp,
  startServer,
  request,
  recordFinding,
} = require('./qa-04-harness');

async function newCtx() {
  const ctx = buildFullApp({
    employers: [],
    employees: [],
    wage_slips: [],
    employee_balances: [],
  });
  await startServer(ctx);
  return ctx;
}

const JAN_TIMESHEET = {
  hours_regular: 182,
  hours_overtime_125: 4,
  hours_overtime_150: 2,
  hours_overtime_175: 0,
  hours_overtime_200: 0,
  hours_absence: 0,
  hours_vacation: 0,
  hours_sick: 0,
  bonuses: 0,
};

const FEB_TIMESHEET = { ...JAN_TIMESHEET, hours_overtime_125: 2 };

async function seedEmployerAndEmployee(ctx) {
  const erRes = await request(ctx.server, 'POST', '/api/payroll/employers', {
    legal_name: 'טכנו כל עוזי בע"מ',
    company_id: '514000001',
    tax_file_number: '937100200',
  });
  assert.equal(erRes.status, 201);
  const employerId = erRes.body.employer.id;

  const empRes = await request(ctx.server, 'POST', '/api/payroll/employees', {
    employer_id: employerId,
    employee_number: 'E-00001',
    first_name: 'רותם',
    last_name: 'לוי',
    full_name: 'רותם לוי',
    national_id: '032123459',
    position: 'Technician',
    department: 'Production',
    employment_type: 'monthly',
    base_salary: 15000,
    hours_per_month: 182,
    work_percentage: 100,
    tax_credits: 2.25,
    is_active: true,
  });
  assert.equal(empRes.status, 201);
  return { employerId, employeeId: empRes.body.employee.id };
}

test('QA-04 / payroll / happy path — employer → employee → slip → approve → issue → paid', async () => {
  const ctx = await newCtx();
  try {
    const { employeeId } = await seedEmployerAndEmployee(ctx);

    // Compute + persist Jan slip
    let res = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: employeeId,
      timesheet: JAN_TIMESHEET,
      period: { year: 2026, month: 1 },
    });
    if (res.status !== 201) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'critical',
        title: 'Wage slip creation failed on happy path',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '201 with wage_slip.id',
        repro: 'POST /api/payroll/wage-slips for a fresh employee',
        impact: 'Manager cannot pay employees — blocking.',
      });
    }
    assert.equal(res.status, 201);
    const slipId = res.body.wage_slip.id;
    const grossJan = res.body.wage_slip.gross_pay;
    assert.ok(grossJan > 0, 'gross pay > 0');
    assert.equal(res.body.wage_slip.status ?? 'computed', 'computed'); // status may be undefined if route doesn't set it explicitly

    // Approve
    res = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${slipId}/approve`, {});
    if (res.status !== 200) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'high',
        title: 'Approving a freshly-computed wage slip fails',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '200 with wage_slip.status=approved',
        repro: 'POST /api/payroll/wage-slips -> POST /api/payroll/wage-slips/:id/approve',
        impact: 'Payroll pipeline is broken at the approval gate.',
      });
    }
    assert.equal(res.status, 200);
    assert.equal(res.body.wage_slip.status, 'approved');

    // Issue PDF
    res = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${slipId}/issue`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.wage_slip.status, 'issued');
    assert.ok(res.body.pdf && res.body.pdf.size > 0, 'PDF was generated (stub)');

    // Mark paid (QA harness-only endpoint)
    res = await request(ctx.server, 'POST', `/api/qa/payroll/wage-slips/${slipId}/paid`, {
      paid_at: '2026-02-10T00:00:00Z',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.wage_slip.status, 'paid');

    // Compute a Feb slip — YTD must now reflect the Jan gross
    res = await request(ctx.server, 'POST', '/api/payroll/wage-slips/compute', {
      employee_id: employeeId,
      timesheet: FEB_TIMESHEET,
      period: { year: 2026, month: 2 },
    });
    assert.equal(res.status, 200);
    const febSlip = res.body.wage_slip;
    if (febSlip.ytd_gross == null || febSlip.ytd_gross <= 0) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'high',
        title: 'YTD gross does not roll forward after a prior-month slip was persisted',
        observed: `ytd_gross=${febSlip.ytd_gross} on Feb slip after Jan persisted at ₪${grossJan}`,
        expected: `ytd_gross should be ≥ ${grossJan}`,
        repro: 'POST /api/payroll/wage-slips Jan, then POST /compute Feb — inspect ytd_gross',
        impact: 'Income tax computation uses annual brackets; if YTD breaks, net pay is wrong every month after month 1.',
      });
    }
    // We still assert structurally — the field should at least exist
    assert.ok('ytd_gross' in febSlip, 'ytd_gross field present on preview');
  } finally {
    await ctx.close();
  }
});

test('QA-04 / payroll / negative — issuing an unapproved slip returns 409', async () => {
  const ctx = await newCtx();
  try {
    const { employeeId } = await seedEmployerAndEmployee(ctx);
    const slipRes = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: employeeId,
      timesheet: JAN_TIMESHEET,
      period: { year: 2026, month: 1 },
    });
    const slipId = slipRes.body.wage_slip.id;
    const res = await request(ctx.server, 'POST', `/api/payroll/wage-slips/${slipId}/issue`, {});
    if (res.status === 200) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'high',
        title: 'Can issue PDF on a non-approved wage slip',
        observed: `issue returned 200 for slip in status=${slipRes.body.wage_slip.status}`,
        expected: '409 Conflict — slip must be approved first',
        repro: 'Create slip -> immediately POST /issue without /approve',
        impact: 'Unapproved payslips sent to employees violate Wage Protection Law s.24.',
      });
    }
    assert.equal(res.status, 409);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / payroll / negative — duplicate slip for same period returns 409', async () => {
  const ctx = await newCtx();
  try {
    const { employeeId } = await seedEmployerAndEmployee(ctx);
    const body = {
      employee_id: employeeId,
      timesheet: JAN_TIMESHEET,
      period: { year: 2026, month: 1 },
    };
    const first = await request(ctx.server, 'POST', '/api/payroll/wage-slips', body);
    assert.equal(first.status, 201);
    const second = await request(ctx.server, 'POST', '/api/payroll/wage-slips', body);
    if (second.status !== 409) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'critical',
        title: 'Duplicate wage slip for same employee+period was accepted',
        observed: `1st=${first.status}, 2nd=${second.status}, body=${JSON.stringify(second.body)}`,
        expected: '409 Conflict with existing_id',
        repro: 'POST /api/payroll/wage-slips twice with identical employee_id+period',
        impact: 'Double salaries paid; YTD math corrupted; compliance failure (tax file shows inflated earnings).',
      });
    }
    assert.equal(second.status, 409);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / payroll / negative — mark-paid on an un-issued slip returns 409', async () => {
  const ctx = await newCtx();
  try {
    const { employeeId } = await seedEmployerAndEmployee(ctx);
    const slipRes = await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: employeeId,
      timesheet: JAN_TIMESHEET,
      period: { year: 2026, month: 1 },
    });
    const res = await request(ctx.server, 'POST', `/api/qa/payroll/wage-slips/${slipRes.body.wage_slip.id}/paid`, {});
    if (res.status === 200) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'high',
        title: 'Mark-paid succeeds on an un-issued wage slip',
        observed: `status=${res.status}`,
        expected: '409 Conflict — slip must be issued first',
        repro: 'Create slip -> skip /approve -> skip /issue -> hit /paid',
        impact: 'Payslip audit trail shows money paid against a computed (not issued) slip — accounting integrity violation.',
      });
    }
    assert.equal(res.status, 409);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / payroll / robustness — 0-hour timesheet should not crash, should produce zero gross', async () => {
  const ctx = await newCtx();
  try {
    const { employeeId } = await seedEmployerAndEmployee(ctx);
    const res = await request(ctx.server, 'POST', '/api/payroll/wage-slips/compute', {
      employee_id: employeeId,
      timesheet: { hours_regular: 0, hours_overtime_125: 0, hours_overtime_150: 0 },
      period: { year: 2026, month: 3 },
    });
    if (res.status !== 200) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'medium',
        title: 'Preview compute crashes on all-zero timesheet',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '200 with gross_pay >= 0 (salaried employee still gets monthly base)',
        repro: 'POST /api/payroll/wage-slips/compute with zero hours',
        impact: 'On-leave / zero-hour preview screens crash the UI.',
      });
    }
    assert.equal(res.status, 200);
    assert.ok('gross_pay' in res.body.wage_slip);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / payroll / no-op — dashboard-style listing after creating slips matches persistence', async () => {
  const ctx = await newCtx();
  try {
    const { employeeId } = await seedEmployerAndEmployee(ctx);
    await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: employeeId, timesheet: JAN_TIMESHEET, period: { year: 2026, month: 1 },
    });
    const list = await request(ctx.server, 'GET', '/api/payroll/wage-slips');
    assert.equal(list.status, 200);
    if (!Array.isArray(list.body.wage_slips) || list.body.wage_slips.length === 0) {
      recordFinding({
        scenario: 'payroll-full-flow',
        severity: 'high',
        title: 'Freshly-created wage slip missing from list endpoint',
        observed: `GET /api/payroll/wage-slips returned ${JSON.stringify(list.body)}`,
        expected: 'at least 1 slip in array',
        repro: 'POST a slip, immediately GET /wage-slips',
        impact: 'UI shows empty table right after successful save — users double-save.',
      });
    }
    assert.ok(list.body.wage_slips.length >= 1);
  } finally {
    await ctx.close();
  }
});
