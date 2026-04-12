/**
 * Payroll module — Express routes
 * Wave 1.5 — B-08 fix
 *
 * Endpoints:
 *   GET  /api/payroll/employers                — list
 *   POST /api/payroll/employers                — create
 *   GET  /api/payroll/employees                — list (with ?employer_id filter)
 *   POST /api/payroll/employees                — create
 *   PATCH /api/payroll/employees/:id           — update
 *   GET  /api/payroll/wage-slips               — list (filter employer_id, period, status)
 *   POST /api/payroll/wage-slips/compute       — compute without saving
 *   POST /api/payroll/wage-slips               — compute + save
 *   GET  /api/payroll/wage-slips/:id           — detail
 *   POST /api/payroll/wage-slips/:id/approve   — approve
 *   POST /api/payroll/wage-slips/:id/issue     — generate PDF + mark issued
 *   GET  /api/payroll/wage-slips/:id/pdf       — download PDF
 *   POST /api/payroll/wage-slips/:id/email     — email to employee
 *   POST /api/payroll/wage-slips/:id/void      — void (creates audit entry)
 *   GET  /api/payroll/employees/:id/balances   — current balances
 *   POST /api/payroll/employees/:id/balances   — snapshot balances
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { computeWageSlip } = require('./wage-slip-calculator');
const { generateWageSlipPdf } = require('./pdf-generator');

function registerPayrollRoutes(app, { supabase, audit }) {
  const PDF_DIR = process.env.PAYROLL_PDF_DIR
    || path.join(__dirname, '..', '..', 'storage', 'wage-slips');

  // ═════════════════════════════════════════════════════════════
  // Agent-Y-QA12 FIX (BUG-QA12-001/002/003): payroll ownership gate.
  //
  // Before this fix, any authenticated API-key holder could read
  // any employee's wage slips and balances — classic IDOR. The
  // server has no RBAC layer, so we add a minimal, env-driven
  // check here until the real role middleware lands:
  //
  //   • PAYROLL_ADMIN_KEYS — comma-separated api keys that are
  //     allowed to read ANY employee's data (HR / payroll / CEO).
  //   • X-Employee-Id (trusted identity header, set by an upstream
  //     identity proxy or by direct employee-key mapping via the
  //     PAYROLL_EMPLOYEE_KEY_MAP env var) — if the caller is not a
  //     payroll admin, they may only read their own data.
  //
  //   PAYROLL_EMPLOYEE_KEY_MAP format:
  //     EMP_ID:api_key,EMP_ID:api_key,...
  //   This lets the server pin each non-admin key to exactly one
  //   employee id without needing a database lookup.
  //
  //   Fail-closed: if the caller is not admin AND we can't match
  //   them to an employee id, the request is rejected with 403.
  // ═════════════════════════════════════════════════════════════
  const PAYROLL_ADMIN_KEYS = new Set(
    (process.env.PAYROLL_ADMIN_KEYS || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  );

  const PAYROLL_EMPLOYEE_KEY_MAP = new Map();
  (process.env.PAYROLL_EMPLOYEE_KEY_MAP || '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const colon = pair.indexOf(':');
      if (colon <= 0) return;
      const empId = pair.slice(0, colon).trim();
      const apiKey = pair.slice(colon + 1).trim();
      if (empId && apiKey) PAYROLL_EMPLOYEE_KEY_MAP.set(apiKey, empId);
    });

  function getCallerIdentity(req) {
    const apiKey =
      req.headers['x-api-key'] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const isAdmin = !!apiKey && PAYROLL_ADMIN_KEYS.has(apiKey);
    // Map trusted header first (identity proxy); fall back to key map.
    const headerEmp = req.headers['x-employee-id'];
    const mappedEmp = apiKey ? PAYROLL_EMPLOYEE_KEY_MAP.get(apiKey) : null;
    const employeeId = String(headerEmp || mappedEmp || '').trim() || null;
    return { isAdmin, employeeId };
  }

  function normaliseEmployeeId(v) {
    if (v === null || v === undefined) return null;
    return String(v).trim();
  }

  // Reject the request with 403 if the caller is not a payroll admin
  // AND the target employee id does not match the caller's own id.
  // Returns `true` when the request was rejected (caller should `return`).
  function denyIfNotOwnerOrAdmin(req, res, targetEmployeeId) {
    const { isAdmin, employeeId } = getCallerIdentity(req);
    if (isAdmin) return false;
    const target = normaliseEmployeeId(targetEmployeeId);
    if (!employeeId) {
      res.status(403).json({
        error: 'forbidden',
        reason: 'payroll data requires admin role or self-identification',
        reason_he: 'נתוני שכר דורשים הרשאת מנהל או זיהוי עצמי',
        code: 'PAYROLL_ACCESS_DENIED',
      });
      return true;
    }
    if (!target || String(target) !== String(employeeId)) {
      res.status(403).json({
        error: 'forbidden',
        reason: 'you may only access your own payroll records',
        reason_he: 'ניתן לגשת רק לרשומות שכר אישיות',
        code: 'PAYROLL_CROSS_USER_ACCESS_DENIED',
      });
      return true;
    }
    return false;
  }

  async function payrollAudit(event_type, slip_id, employee_id, actor, details, before, after) {
    try {
      await supabase.from('payroll_audit_log').insert({
        event_type,
        wage_slip_id: slip_id,
        employee_id,
        actor: actor || 'api',
        details: details || null,
        before_state: before || null,
        after_state: after || null,
      });
    } catch (err) {
      console.error('payroll_audit_log failed:', err.message);
    }
  }

  // ═══ EMPLOYERS ═══

  app.get('/api/payroll/employers', async (req, res) => {
    const { data, error } = await supabase.from('employers').select('*').order('legal_name');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ employers: data });
  });

  // Agent-Y-QA12 FIX (BUG-QA12-004): allowlist fields on employer create
  const EMPLOYER_FIELDS = ['legal_name', 'trade_name', 'company_id', 'vat_number', 'address', 'phone', 'email', 'contact_name', 'employer_number', 'bituach_leumi_number', 'tax_deduction_file', 'reporting_frequency', 'active'];
  app.post('/api/payroll/employers', async (req, res) => {
    const { data, error } = await supabase.from('employers').insert(pick(req.body, EMPLOYER_FIELDS)).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('employer', data.id, 'created', req.actor || 'api',
      `מעסיק חדש: ${data.legal_name}`, null, data);
    res.status(201).json({ employer: data });
  });

  // ═══ EMPLOYEES ═══

  app.get('/api/payroll/employees', async (req, res) => {
    let q = supabase.from('employees').select('*').order('full_name');
    if (req.query.employer_id) q = q.eq('employer_id', req.query.employer_id);
    if (req.query.active === 'true') q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ employees: data });
  });

  // Agent-Y-QA12 FIX (BUG-QA12-004): allowlist fields on employee create
  const EMPLOYEE_FIELDS = ['employer_id', 'first_name', 'last_name', 'full_name', 'id_number', 'employee_number', 'email', 'phone', 'address', 'birth_date', 'start_date', 'end_date', 'department', 'position', 'base_salary', 'hourly_rate', 'pay_type', 'work_percentage', 'hours_per_month', 'tax_credits', 'bank_code', 'bank_branch', 'bank_account', 'is_active'];
  app.post('/api/payroll/employees', async (req, res) => {
    const { data, error } = await supabase.from('employees')
      .insert({ ...pick(req.body, EMPLOYEE_FIELDS), created_by: req.actor || 'api' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('employee', data.id, 'created', req.actor || 'api',
      `עובד חדש: ${data.first_name} ${data.last_name}`, null, data);
    res.status(201).json({ employee: data });
  });

  // Agent-Y-QA12 FIX (BUG-QA12-004): allowlist fields on employee update
  app.patch('/api/payroll/employees/:id', async (req, res) => {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'forbidden', code: 'EMPLOYEE_UPDATE_DENIED', reason_he: 'עדכון עובד דורש הרשאת מנהל' });
    }
    const { data: prev } = await supabase.from('employees').select('*').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('employees')
      .update(pick(req.body, EMPLOYEE_FIELDS)).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('employee', data.id, 'updated', req.actor || 'api',
      `עודכן עובד: ${data.full_name}`, prev, data);
    res.json({ employee: data });
  });

  // ═══ WAGE SLIPS ═══

  // Agent-Y-QA12 FIX (BUG-QA12-001): employees may only list their own wage slips.
  app.get('/api/payroll/wage-slips', async (req, res) => {
    const { isAdmin, employeeId } = getCallerIdentity(req);

    // Non-admins MUST be identified and can only see their own slips
    if (!isAdmin) {
      if (!employeeId) {
        return res.status(403).json({
          error: 'forbidden',
          reason: 'wage slip listing requires admin role or self-identification',
          reason_he: 'צפייה בתלושי שכר דורשת הרשאת מנהל או זיהוי עצמי',
          code: 'WAGE_SLIP_LIST_ACCESS_DENIED',
        });
      }
    }

    let q = supabase.from('wage_slips').select('*')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .order('id', { ascending: false });

    // Non-admins: force-filter to own employee_id (ignore query param)
    if (!isAdmin) {
      q = q.eq('employee_id', employeeId);
    } else {
      if (req.query.employer_id) q = q.eq('employer_id', req.query.employer_id);
      if (req.query.employee_id) q = q.eq('employee_id', req.query.employee_id);
    }

    if (req.query.period_year) q = q.eq('period_year', parseInt(req.query.period_year));
    if (req.query.period_month) q = q.eq('period_month', parseInt(req.query.period_month));
    if (req.query.status) q = q.eq('status', req.query.status);

    q = q.limit(parseInt(req.query.limit) || 200);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ wage_slips: data });
  });

  /** Compute a wage slip without saving — for preview. */
  app.post('/api/payroll/wage-slips/compute', async (req, res) => {
    try {
      const { employee_id, timesheet, period } = req.body;
      if (!employee_id) return res.status(400).json({ error: 'employee_id required' });

      const { data: employee, error: eErr } = await supabase.from('employees')
        .select('*').eq('id', employee_id).single();
      if (eErr) return res.status(404).json({ error: `Employee not found: ${eErr.message}` });

      const { data: employer, error: erErr } = await supabase.from('employers')
        .select('*').eq('id', employee.employer_id).single();
      if (erErr) return res.status(404).json({ error: `Employer not found: ${erErr.message}` });

      // Load YTD from prior slips this year
      const yearForYtd = period?.year || new Date().getFullYear();
      const { data: priorSlips } = await supabase.from('wage_slips')
        .select('gross_pay, income_tax, bituach_leumi, pension_employee')
        .eq('employee_id', employee_id)
        .eq('period_year', yearForYtd)
        .lt('period_month', period?.month || 13);

      const ytd = (priorSlips || []).reduce((acc, s) => ({
        ytd_gross: (acc.ytd_gross || 0) + Number(s.gross_pay || 0),
        ytd_income_tax: (acc.ytd_income_tax || 0) + Number(s.income_tax || 0),
        ytd_bituach_leumi: (acc.ytd_bituach_leumi || 0) + Number(s.bituach_leumi || 0),
        ytd_pension: (acc.ytd_pension || 0) + Number(s.pension_employee || 0),
      }), {});

      // Load current balances
      const { data: balances } = await supabase.from('employee_balances')
        .select('*').eq('employee_id', employee_id)
        .order('snapshot_date', { ascending: false }).limit(1).single();

      const slip = computeWageSlip({
        employee, employer, timesheet,
        period: period || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
        ytd,
      });

      if (balances) {
        slip.vacation_balance = balances.vacation_days_balance;
        slip.sick_balance = balances.sick_days_balance;
        slip.study_fund_balance = balances.study_fund_balance;
        slip.severance_balance = balances.severance_balance;
      }

      res.json({ wage_slip: slip, preview: true });
    } catch (err) {
      console.error('compute failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /** Compute and persist a wage slip. */
  app.post('/api/payroll/wage-slips', async (req, res) => {
    try {
      const { employee_id, timesheet, period } = req.body;
      if (!employee_id) return res.status(400).json({ error: 'employee_id required' });

      const { data: employee } = await supabase.from('employees')
        .select('*').eq('id', employee_id).single();
      if (!employee) return res.status(404).json({ error: 'Employee not found' });

      const { data: employer } = await supabase.from('employers')
        .select('*').eq('id', employee.employer_id).single();
      if (!employer) return res.status(404).json({ error: 'Employer not found' });

      // Duplicate check
      const { data: existing } = await supabase.from('wage_slips').select('id, status')
        .eq('employee_id', employee_id)
        .eq('period_year', period.year)
        .eq('period_month', period.month)
        .maybeSingle();
      if (existing && existing.status !== 'voided') {
        return res.status(409).json({
          error: 'Wage slip already exists for this period',
          existing_id: existing.id,
        });
      }

      // YTD from prior slips
      const { data: priorSlips } = await supabase.from('wage_slips')
        .select('gross_pay, income_tax, bituach_leumi, pension_employee')
        .eq('employee_id', employee_id)
        .eq('period_year', period.year)
        .lt('period_month', period.month);

      const ytd = (priorSlips || []).reduce((acc, s) => ({
        ytd_gross: (acc.ytd_gross || 0) + Number(s.gross_pay || 0),
        ytd_income_tax: (acc.ytd_income_tax || 0) + Number(s.income_tax || 0),
        ytd_bituach_leumi: (acc.ytd_bituach_leumi || 0) + Number(s.bituach_leumi || 0),
        ytd_pension: (acc.ytd_pension || 0) + Number(s.pension_employee || 0),
      }), {});

      // Balances
      const { data: balances } = await supabase.from('employee_balances')
        .select('*').eq('employee_id', employee_id)
        .order('snapshot_date', { ascending: false }).limit(1).maybeSingle();

      const slip = computeWageSlip({ employee, employer, timesheet, period, ytd });
      delete slip._debug;

      if (balances) {
        slip.vacation_balance = balances.vacation_days_balance;
        slip.sick_balance = balances.sick_days_balance;
        slip.study_fund_balance = balances.study_fund_balance;
        slip.severance_balance = balances.severance_balance;
      }

      slip.prepared_by = req.actor || 'api';

      const { data, error } = await supabase.from('wage_slips').insert(slip).select().single();
      if (error) return res.status(400).json({ error: error.message });

      await payrollAudit('wage_slip_computed', data.id, employee_id, req.actor,
        { period: slip.period_label, gross: slip.gross_pay, net: slip.net_pay }, null, data);
      await audit('wage_slip', data.id, 'created', req.actor || 'api',
        `תלוש שכר נוצר: ${slip.employee_name} ${slip.period_label} — נטו ${slip.net_pay}₪`, null, data);

      res.status(201).json({ wage_slip: data });
    } catch (err) {
      console.error('wage-slip create failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/payroll/wage-slips/:id', async (req, res) => {
    const { data, error } = await supabase.from('wage_slips').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: error.message });
    // Agent-Y-QA12 FIX (BUG-QA12-002): ownership check — employees may
    // only read their own wage slip, admins may read any. Fail-closed.
    if (denyIfNotOwnerOrAdmin(req, res, data && data.employee_id)) return;
    res.json({ wage_slip: data });
  });

  // Agent-Y-QA12 FIX (BUG-QA12-005/007): admin-only + four-eyes principle.
  app.post('/api/payroll/wage-slips/:id/approve', async (req, res) => {
    const { isAdmin, employeeId } = getCallerIdentity(req);

    // BUG-QA12-005: only admins may approve (viewers/employees cannot write)
    if (!isAdmin) {
      return res.status(403).json({
        error: 'forbidden',
        reason: 'wage slip approval requires admin role',
        reason_he: 'אישור תלושי שכר דורש הרשאת מנהל',
        code: 'WAGE_SLIP_APPROVE_DENIED',
      });
    }

    const { data: prev } = await supabase.from('wage_slips').select('*').eq('id', req.params.id).single();
    if (!prev) return res.status(404).json({ error: 'Not found' });

    // BUG-QA12-007: four-eyes — approver cannot be the slip's own employee
    if (employeeId && String(prev.employee_id) === String(employeeId)) {
      return res.status(403).json({
        error: 'forbidden',
        reason: 'you cannot approve your own wage slip (four-eyes principle)',
        reason_he: 'לא ניתן לאשר תלוש שכר של עצמך (עיקרון ארבע עיניים)',
        code: 'SELF_APPROVAL_DENIED',
      });
    }

    if (prev.status !== 'computed' && prev.status !== 'draft') {
      return res.status(409).json({ error: `Cannot approve slip in status ${prev.status}` });
    }
    const { data, error } = await supabase.from('wage_slips').update({
      status: 'approved',
      approved_by: req.actor || 'api',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await payrollAudit('wage_slip_approved', data.id, data.employee_id, req.actor, null, prev, data);
    res.json({ wage_slip: data });
  });

  app.post('/api/payroll/wage-slips/:id/issue', async (req, res) => {
    try {
      const { data: slip } = await supabase.from('wage_slips').select('*').eq('id', req.params.id).single();
      if (!slip) return res.status(404).json({ error: 'Not found' });
      if (slip.status !== 'approved') {
        return res.status(409).json({ error: `Cannot issue slip in status ${slip.status}` });
      }

      const filename = `wage-slip-${slip.id}-${slip.period_label}-${slip.employee_number}.pdf`;
      const outputPath = path.join(PDF_DIR, filename);
      const { size } = await generateWageSlipPdf(slip, outputPath);

      const { data, error } = await supabase.from('wage_slips').update({
        status: 'issued',
        pdf_path: outputPath,
        pdf_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).select().single();
      if (error) return res.status(400).json({ error: error.message });

      await payrollAudit('wage_slip_issued', data.id, data.employee_id, req.actor,
        { pdf_size: size, pdf_path: outputPath });
      res.json({ wage_slip: data, pdf: { path: outputPath, size } });
    } catch (err) {
      console.error('issue failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/payroll/wage-slips/:id/pdf', async (req, res) => {
    try {
      const { data: slip } = await supabase.from('wage_slips').select('*').eq('id', req.params.id).single();
      if (!slip) return res.status(404).json({ error: 'Not found' });

      let pdfPath = slip.pdf_path;
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        const filename = `wage-slip-${slip.id}-${slip.period_label}-${slip.employee_number}.pdf`;
        pdfPath = path.join(PDF_DIR, filename);
        await generateWageSlipPdf(slip, pdfPath);
        await supabase.from('wage_slips').update({
          pdf_path: pdfPath,
          pdf_generated_at: new Date().toISOString(),
        }).eq('id', slip.id);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition',
        `attachment; filename="wage-slip-${slip.period_label}.pdf"`);
      fs.createReadStream(pdfPath).pipe(res);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/payroll/wage-slips/:id/void', async (req, res) => {
    const { data: prev } = await supabase.from('wage_slips').select('*').eq('id', req.params.id).single();
    if (!prev) return res.status(404).json({ error: 'Not found' });
    const reason = req.body.reason || 'no reason provided';

    const { data, error } = await supabase.from('wage_slips').update({
      status: 'voided',
      notes: `${prev.notes || ''}\nVOIDED ${new Date().toISOString()} by ${req.actor || 'api'}: ${reason}`,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await payrollAudit('wage_slip_voided', data.id, data.employee_id, req.actor, { reason }, prev, data);
    await audit('wage_slip', data.id, 'voided', req.actor || 'api',
      `בוטל תלוש שכר ${data.period_label}: ${reason}`, prev, data);

    res.json({ wage_slip: data });
  });

  // ═══ BALANCES ═══

  app.get('/api/payroll/employees/:id/balances', async (req, res) => {
    // Agent-Y-QA12 FIX (BUG-QA12-003): ownership check BEFORE the query,
    // since the target employee id is available directly from the URL.
    if (denyIfNotOwnerOrAdmin(req, res, req.params.id)) return;
    const { data, error } = await supabase.from('employee_balances')
      .select('*').eq('employee_id', req.params.id)
      .order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ balances: data });
  });

  // Agent-Y-QA12 FIX (BUG-QA12-004/005): allowlist + admin-only on balance write
  const BALANCE_FIELDS = ['vacation_days_balance', 'sick_days_balance', 'study_fund_balance', 'severance_balance', 'snapshot_date'];
  app.post('/api/payroll/employees/:id/balances', async (req, res) => {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'forbidden', code: 'BALANCE_WRITE_DENIED', reason_he: 'עדכון יתרות דורש הרשאת מנהל' });
    }
    const safeBody = pick(req.body, BALANCE_FIELDS);
    const payload = {
      employee_id: parseInt(req.params.id),
      snapshot_date: safeBody.snapshot_date || new Date().toISOString().slice(0, 10),
      ...safeBody,
    };
    const { data, error } = await supabase.from('employee_balances').upsert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('employee_balance', data.id, 'updated', req.actor || 'api',
      `עודכנו יתרות עובד #${req.params.id}`, null, data);
    res.json({ balances: data });
  });

  // ═══ Agent-Y-QA12 FIX (BUG-QA12-004): mass-assignment prevention ═══
  // Utility to pick only allowed fields from request body.
  function pick(obj, keys) {
    const out = {};
    for (const k of keys) { if (k in obj) out[k] = obj[k]; }
    return out;
  }

  console.log('   ✓ Payroll / wage slip routes registered');
}

module.exports = { registerPayrollRoutes };
