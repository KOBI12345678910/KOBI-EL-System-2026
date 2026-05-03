/**
 * form-102-routes.js — Express routes for טופס 102
 * (Monthly Bituach Leumi & income-tax withholding report)
 * Wave 2026 — Techno-Kol Uzi Mega-ERP
 * ---------------------------------------------------------------------------
 *
 * Mounts buildForm102File / validateForm102File from form-102.js behind a
 * thin HTTP surface so the UI / scheduler can:
 *
 *   GET  /api/tax/form-102/:year/:month/generate
 *        ?download=1            → text/plain fixed-width (windows-1255)
 *        ?format=xml            → application/xml envelope
 *        (default)              → JSON { json, xml, fixedWidth, totals, ... }
 *
 *   POST /api/tax/form-102/:year/:month/submit
 *        Generate + persist into `monthly_tax_reports` (upsert by
 *        fiscal_year/period/form_type) and write an audit row. Does NOT
 *        actually upload to ביטוח לאומי — the portal upload is a manual
 *        step but the row records the intent + payload + electronic file.
 *
 * Permissions: both routes require `tax-monthly:export`.
 * Defensive Supabase reads — if a referenced table is missing in dev the
 * route returns an empty rows array rather than 500-ing.
 *
 * Source data (in fall-through order):
 *   1. `payroll_runs`  filtered by year/month, joined to `payroll_run_lines`
 *   2. `wage_slips`    if `payroll_runs` is unavailable
 *   3. Manual `req.body.rows` on POST — caller may supply pre-aggregated rows
 *
 * No new dependencies. registerForm102Routes(app, deps) factory matches
 * registerForm856Routes / registerBkmvRoutes / registerVatRoutes pattern.
 * ---------------------------------------------------------------------------
 */

'use strict';

const { buildForm102File, validateForm102File } = require('./form-102');

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
      id:                  data.company_id || data.tax_id || data.vat_number || '',
      name:                data.legal_name || data.company_name || '',
      tax_file_number:     data.tax_file_number || data.withholding_file || '',
      bituach_leumi_no:    data.bituach_leumi_number || data.national_insurance_no || '',
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
 * Pull payroll rows for the (year, month) period and shape them into the
 * { employee_id, employee_name, gross_wages, bl_employee, bl_employer,
 *   health_employee } row format that buildForm102File expects.
 */
async function fetchPayrollRows(supabase, year, month) {
  if (!supabase) return [];
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  // Last day of month (handles 30/31/28/29 cleanly).
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const periodLabel = `${year}-${String(month).padStart(2, '0')}`;

  const employees = await fetchEmployees(supabase);

  // 1. Try payroll_run_lines (richest source — already aggregated per slip)
  try {
    const { data, error } = await supabase
      .from('payroll_run_lines')
      .select('*')
      .gte('period_start', periodStart)
      .lte('period_start', periodEnd);
    if (!error && Array.isArray(data) && data.length) {
      return data.map(r => {
        const emp = employees[r.employee_id] || {};
        return {
          employee_id:     emp.national_id || r.national_id || r.employee_id || '',
          employee_name:   emp.full_name || r.employee_name || '',
          gross_wages:     Number(r.gross_wages || r.gross || 0),
          bl_employee:     Number(r.bl_employee || r.bituach_leumi_employee || 0),
          bl_employer:     Number(r.bl_employer || r.bituach_leumi_employer || 0),
          health_employee: Number(r.health_employee || r.health_tax || 0),
        };
      });
    }
  } catch { /* table may not exist */ }

  // 2. Fallback — wage_slips with `period` column
  try {
    const { data, error } = await supabase
      .from('wage_slips')
      .select('*')
      .eq('period', periodLabel);
    if (!error && Array.isArray(data) && data.length) {
      return data.map(r => {
        const emp = employees[r.employee_id] || {};
        return {
          employee_id:     emp.national_id || r.national_id || r.employee_id || '',
          employee_name:   emp.full_name || r.employee_name || '',
          gross_wages:     Number(r.gross_wages || r.gross || 0),
          bl_employee:     Number(r.bl_employee || r.bituach_leumi || 0),
          bl_employer:     Number(r.bl_employer || 0),
          health_employee: Number(r.health_employee || r.health_tax || 0),
        };
      });
    }
  } catch { /* table may not exist */ }

  // 3. Fallback — wage_slips with start/end dates
  try {
    const { data, error } = await supabase
      .from('wage_slips')
      .select('*')
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd);
    if (!error && Array.isArray(data)) {
      return data.map(r => {
        const emp = employees[r.employee_id] || {};
        return {
          employee_id:     emp.national_id || r.national_id || r.employee_id || '',
          employee_name:   emp.full_name || r.employee_name || '',
          gross_wages:     Number(r.gross_wages || r.gross || 0),
          bl_employee:     Number(r.bl_employee || r.bituach_leumi || 0),
          bl_employer:     Number(r.bl_employer || 0),
          health_employee: Number(r.health_employee || r.health_tax || 0),
        };
      });
    }
  } catch { /* swallow */ }

  return [];
}

// ───────────────────────────────────────────────────────────────────────────
// Route registrar
// ───────────────────────────────────────────────────────────────────────────

function registerForm102Routes(app, deps = {}) {
  const { supabase, audit, requirePermission } = deps;

  if (!app || typeof app.get !== 'function') {
    throw new Error('form-102-routes: app (Express) is required');
  }
  if (!supabase) {
    throw new Error('form-102-routes: supabase client is required');
  }

  const guard = typeof requirePermission === 'function'
    ? requirePermission('tax-monthly:export')
    : (_req, _res, next) => next();
  const auditFn = typeof audit === 'function' ? audit : async () => {};

  // ─── GET /api/tax/form-102/:year/:month/generate ────────────────────────
  app.get('/api/tax/form-102/:year/:month/generate', guard, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month (must be 1..12)', month: req.params.month });
    }

    let employer, rows;
    try {
      employer = await fetchEmployerProfile(supabase);
      rows = await fetchPayrollRows(supabase, year, month);
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }

    let file;
    try {
      file = buildForm102File({
        year, month, rows,
        employer: employer || {},
        submission_type: req.query.type === 'correction' ? 'correction' : 'initial',
      });
    } catch (err) {
      return res.status(400).json({ error: `form-102 generation failed: ${err.message}` });
    }

    const errors = validateForm102File(file);
    if (errors.length) {
      return res.status(500).json({ error: 'form-102 validation failed', issues: errors });
    }

    const wantsDownload = String(req.query.download || '').match(/^(1|true|yes)$/i);
    const format = String(req.query.format || '').toLowerCase();

    if (wantsDownload || format === 'txt' || format === 'fixed') {
      res.setHeader('Content-Type', 'text/plain; charset=windows-1255');
      res.setHeader('Content-Disposition', `attachment; filename="${file.metadata.filename}"`);
      // Send raw bytes when iconv is loaded; fall back to the unicode string.
      return res.send(file.buffer || file.fixedWidth);
    }
    if (format === 'xml') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      if (wantsDownload) {
        res.setHeader('Content-Disposition',
          `attachment; filename="form-102-${file.period}.xml"`);
      }
      return res.send(file.xml);
    }

    return res.json({
      ok:        true,
      formCode:  '102',
      year,
      month,
      period:    file.period,
      deadline:  file.deadline,
      submission_type: file.submission_type,
      employer:  file.json.employer,
      rows:      file.json.rows,
      totals:    file.totals,
      fixedWidth:file.fixedWidth,
      xml:       file.xml,
      metadata:  file.metadata,
    });
  });

  // ─── POST /api/tax/form-102/:year/:month/submit ─────────────────────────
  app.post('/api/tax/form-102/:year/:month/submit', guard, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month (must be 1..12)', month: req.params.month });
    }

    let employer, rows;
    try {
      employer = await fetchEmployerProfile(supabase);
      rows = Array.isArray(req.body?.rows) && req.body.rows.length
        ? req.body.rows
        : await fetchPayrollRows(supabase, year, month);
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }

    const submissionType =
      req.body?.submission_type === 'correction' ? 'correction' : 'initial';

    let file;
    try {
      file = buildForm102File({
        year, month, rows,
        employer: employer || {},
        submission_type: submissionType,
      });
    } catch (err) {
      return res.status(400).json({ error: `form-102 generation failed: ${err.message}` });
    }
    const errors = validateForm102File(file);
    if (errors.length) {
      return res.status(400).json({ error: 'form-102 validation failed', issues: errors });
    }

    // Persist into monthly_tax_reports — upsert by (fiscal_year, period, form_type).
    let saved = null;
    try {
      const periodLabel = file.period; // YYYYMM
      const { data: existing } = await supabase
        .from('monthly_tax_reports')
        .select('id')
        .eq('fiscal_year', year)
        .eq('period', periodLabel)
        .eq('form_type', '102')
        .maybeSingle();

      const record = {
        fiscal_year:     year,
        period:          periodLabel,
        form_type:       '102',
        report_version:  file.version || '2026.1',
        status:          'submitted',
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
          .from('monthly_tax_reports')
          .update(record)
          .eq('id', existing.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from('monthly_tax_reports')
          .insert(record)
          .select()
          .single();
      }
      if (result?.error) {
        return res.status(500).json({ error: result.error.message });
      }
      saved = result?.data || null;

      await auditFn(
        'monthly_tax_report',
        saved?.id || `${year}-${periodLabel}-102`,
        existing ? 'submitted' : 'created',
        req.actor || 'api',
        `הוגש טופס 102 לתקופה ${periodLabel} — ${file.totals.record_count} עובדים, סכום לתשלום ₪${(file.totals.payable_total || 0).toLocaleString('he-IL')}`,
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
      month,
      period:          file.period,
      formCode:        '102',
      submission_type: submissionType,
      totals:          file.totals,
      metadata:        file.metadata,
      deadline:        file.deadline,
    });
  });

  console.log('   ✓ Form 102 routes registered (GET/POST /api/tax/form-102/:year/:month/...)');
}

module.exports = { registerForm102Routes };
