/**
 * form-126-routes.js — Express routes for טופס 126 (annual employee
 * tax certificate — EMPLOYEE side; complement to 856 which is the
 * freelancer/contractor side).
 * Wave 2026 — Techno-Kol Uzi Mega-ERP
 * ---------------------------------------------------------------------------
 *
 * Mounts buildForm126File / validateForm126File from form-126.js behind a
 * thin HTTP surface so the UI / scheduler can:
 *
 *   GET  /api/tax/form-126/:year/generate
 *        ?download=1            → text/plain fixed-width (windows-1255)
 *        ?format=xml            → application/xml envelope
 *        (default)              → JSON { json, xml, fixedWidth, totals, ... }
 *
 *   POST /api/tax/form-126/:year/submit
 *        Generate + persist into `annual_tax_reports` (upsert by
 *        fiscal_year/form_type='126') and write an audit row.
 *
 * Permissions: both routes require `tax-annual:export`.
 *
 * Source data (in fall-through order):
 *   1. `payroll_run_lines` aggregated across the calendar year, joined to
 *      `employees` for full_name / national_id.
 *   2. `wage_slips` aggregated across the year if payroll_run_lines is
 *      unavailable.
 *   3. Manual `req.body.rows` on POST — caller may supply rows directly.
 *
 * No new dependencies. registerForm126Routes(app, deps) factory matches
 * registerForm856Routes / registerBkmvRoutes / registerVatRoutes pattern.
 * ---------------------------------------------------------------------------
 */

'use strict';

const { buildForm126File, validateForm126File } = require('./form-126');

// ───────────────────────────────────────────────────────────────────────────
// Defensive readers — return [] / null on missing tables
// ───────────────────────────────────────────────────────────────────────────

async function fetchEmployerProfile(supabase) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('company_tax_profile')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      id:              data.company_id || data.tax_id || data.vat_number || '',
      name:            data.legal_name || data.company_name || '',
      tax_file_number: data.tax_file_number || data.withholding_file || '',
    };
  } catch {
    return null;
  }
}

async function fetchEmployees(supabase) {
  if (!supabase) return {};
  try {
    const { data } = await supabase
      .from('employees')
      .select('id, national_id, full_name, employee_number');
    const map = {};
    for (const row of data || []) map[row.id] = row;
    return map;
  } catch {
    return {};
  }
}

/**
 * Aggregate annual payroll for the calendar year. Sums across all months
 * of payroll_run_lines (or wage_slips fallback) per employee, returning
 * the row shape expected by buildForm126File:
 *   { employee_id, full_name, gross_annual, income_tax, bl_withheld,
 *     pension, severance }
 */
async function fetchAnnualRows(supabase, year) {
  if (!supabase) return [];
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  const employees = await fetchEmployees(supabase);

  const empAcc = new Map(); // employee_id → accumulator
  const accumulate = (empId, src) => {
    const key = String(empId || '');
    if (!key) return;
    let cur = empAcc.get(key);
    if (!cur) {
      const emp = employees[empId] || {};
      cur = {
        employee_id:  emp.national_id || src.national_id || '',
        full_name:    emp.full_name || src.employee_name || src.full_name || '',
        gross_annual: 0,
        income_tax:   0,
        bl_withheld:  0,
        pension:      0,
        severance:    0,
      };
      empAcc.set(key, cur);
    }
    cur.gross_annual += Number(src.gross_wages || src.gross || src.gross_total || 0);
    cur.income_tax   += Number(src.income_tax || src.income_tax_withheld || src.tax_withheld || 0);
    cur.bl_withheld  += Number(src.bl_employee || src.bituach_leumi || src.bituach_leumi_employee || 0);
    cur.pension      += Number(src.pension || src.pension_employee || 0);
    cur.severance    += Number(src.severance || src.severance_employer || 0);
  };

  // 1. payroll_run_lines (preferred, richest source)
  let usedPrimary = false;
  try {
    const { data, error } = await supabase
      .from('payroll_run_lines')
      .select('*')
      .gte('period_start', yearStart)
      .lte('period_start', yearEnd);
    if (!error && Array.isArray(data) && data.length) {
      for (const r of data) accumulate(r.employee_id, r);
      usedPrimary = true;
    }
  } catch { /* table may not exist */ }

  // 2. wage_slips fallback
  if (!usedPrimary) {
    try {
      const { data, error } = await supabase
        .from('wage_slips')
        .select('*')
        .gte('period_start', yearStart)
        .lte('period_end', yearEnd);
      if (!error && Array.isArray(data)) {
        for (const r of data) accumulate(r.employee_id, r);
      }
    } catch { /* swallow */ }
  }

  return Array.from(empAcc.values());
}

// ───────────────────────────────────────────────────────────────────────────
// Route registrar
// ───────────────────────────────────────────────────────────────────────────

function registerForm126Routes(app, deps = {}) {
  const { supabase, audit, requirePermission } = deps;

  if (!app || typeof app.get !== 'function') {
    throw new Error('form-126-routes: app (Express) is required');
  }
  if (!supabase) {
    throw new Error('form-126-routes: supabase client is required');
  }

  const guard = typeof requirePermission === 'function'
    ? requirePermission('tax-annual:export')
    : (_req, _res, next) => next();
  const auditFn = typeof audit === 'function' ? audit : async () => {};

  // ─── GET /api/tax/form-126/:year/generate ───────────────────────────────
  app.get('/api/tax/form-126/:year/generate', guard, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }

    let employer, rows;
    try {
      employer = await fetchEmployerProfile(supabase);
      rows = await fetchAnnualRows(supabase, year);
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }

    let file;
    try {
      file = buildForm126File({
        year, rows,
        employer: employer || {},
        submission_type: req.query.type === 'correction' ? 'correction' : 'initial',
      });
    } catch (err) {
      return res.status(400).json({ error: `form-126 generation failed: ${err.message}` });
    }

    const errors = validateForm126File(file);
    if (errors.length) {
      return res.status(500).json({ error: 'form-126 validation failed', issues: errors });
    }

    const wantsDownload = String(req.query.download || '').match(/^(1|true|yes)$/i);
    const format = String(req.query.format || '').toLowerCase();

    if (wantsDownload || format === 'txt' || format === 'fixed') {
      res.setHeader('Content-Type', 'text/plain; charset=windows-1255');
      res.setHeader('Content-Disposition', `attachment; filename="${file.metadata.filename}"`);
      return res.send(file.buffer || file.fixedWidth);
    }
    if (format === 'xml') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      if (wantsDownload) {
        res.setHeader('Content-Disposition',
          `attachment; filename="form-126-${year}.xml"`);
      }
      return res.send(file.xml);
    }

    return res.json({
      ok:        true,
      formCode:  '126',
      year,
      submission_type: file.submission_type,
      employer:  file.json.employer,
      rows:      file.json.rows,
      totals:    file.totals,
      fixedWidth:file.fixedWidth,
      xml:       file.xml,
      metadata:  file.metadata,
    });
  });

  // ─── POST /api/tax/form-126/:year/submit ────────────────────────────────
  app.post('/api/tax/form-126/:year/submit', guard, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }

    let employer, rows;
    try {
      employer = await fetchEmployerProfile(supabase);
      rows = Array.isArray(req.body?.rows) && req.body.rows.length
        ? req.body.rows
        : await fetchAnnualRows(supabase, year);
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }

    const submissionType =
      req.body?.submission_type === 'correction' ? 'correction' : 'initial';

    let file;
    try {
      file = buildForm126File({
        year, rows,
        employer: employer || {},
        submission_type: submissionType,
      });
    } catch (err) {
      return res.status(400).json({ error: `form-126 generation failed: ${err.message}` });
    }
    const errors = validateForm126File(file);
    if (errors.length) {
      return res.status(400).json({ error: 'form-126 validation failed', issues: errors });
    }

    // Persist into annual_tax_reports — upsert by (fiscal_year, form_type='126').
    let saved = null;
    try {
      const { data: existing } = await supabase
        .from('annual_tax_reports')
        .select('id')
        .eq('fiscal_year', year)
        .eq('form_type', '126')
        .maybeSingle();

      const record = {
        fiscal_year:    year,
        form_type:      '126',
        report_version: file.version || '2026.1',
        status:         'submitted',
        payload: {
          employer:        file.json.employer,
          rows:            file.json.rows,
          submission_type: submissionType,
        },
        computed_totals: file.totals,
        created_by:      req.actor || 'api',
        updated_at:      new Date().toISOString(),
      };

      let result;
      if (existing) {
        result = await supabase
          .from('annual_tax_reports')
          .update(record)
          .eq('id', existing.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from('annual_tax_reports')
          .insert(record)
          .select()
          .single();
      }
      if (result?.error) {
        return res.status(500).json({ error: result.error.message });
      }
      saved = result?.data || null;

      await auditFn(
        'annual_tax_report',
        saved?.id || `${year}-126`,
        existing ? 'submitted' : 'created',
        req.actor || 'api',
        `הוגש טופס 126 לשנת ${year} — ${file.totals.record_count} עובדים, מס הכנסה שנוכה ₪${(file.totals.income_tax || 0).toLocaleString('he-IL')}`,
        existing || null,
        saved
      );
    } catch (err) {
      return res.status(500).json({ error: `persistence failed: ${err.message}` });
    }

    return res.status(201).json({
      ok:              true,
      report_id:       saved?.id || null,
      year,
      formCode:        '126',
      submission_type: submissionType,
      totals:          file.totals,
      metadata:        file.metadata,
    });
  });

  console.log('   ✓ Form 126 routes registered (GET/POST /api/tax/form-126/:year/...)');
}

module.exports = { registerForm126Routes };
