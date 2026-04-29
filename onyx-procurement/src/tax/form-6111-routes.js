/**
 * form-6111-routes.js — Express routes for טופס 6111
 * (IL annual income tax return — דין וחשבון שנתי). Wave 2026.
 *
 *   GET  /api/tax/form-6111/:year/generate?format=json|fixed|xml&download=1
 *   POST /api/tax/form-6111/:year/submit  → upserts annual_tax_reports
 *
 * Permissions: tax-annual:export (read), tax-annual:create (submit).
 * Source fall-through: annual_close_summary → general_ledger_summary → body.figures.
 * Defensive supabase reads — returns zeros on missing tables instead of 500.
 * Matches the registerXxxRoutes(app, { supabase, audit, requirePermission }) pattern.
 */

'use strict';

const {
  buildForm6111File,
  validateForm6111File,
  computeDeadline,
} = require('./form-6111');

// Defensive readers — return null / zeros on missing tables.
async function fetchCompanyProfile(supabase) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('company_tax_profile').select('*').limit(1).maybeSingle();
    if (!data) return null;
    return {
      tin:             data.company_id || data.tax_id || data.vat_number || '',
      legal_name:      data.legal_name || data.company_name || '',
      tax_file_number: data.tax_file_number || data.income_tax_file || '',
    };
  } catch { return null; }
}

async function fetchAnnualFigures(supabase, year) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('annual_close_summary')
      .select('*').eq('fiscal_year', year).maybeSingle();
    if (data) return {
      revenue:  Number(data.total_revenue || data.revenue || 0),
      expenses: Number(data.total_expenses || data.expenses || 0),
      taxable:  data.taxable_income != null ? Number(data.taxable_income) : null,
      tax:      data.tax_due != null ? Number(data.tax_due) : null,
      advances: Number(data.advances_paid || data.advances || 0),
    };
  } catch { /* missing table */ }
  try {
    const { data } = await supabase.from('general_ledger_summary')
      .select('*').eq('fiscal_year', year);
    if (Array.isArray(data) && data.length) {
      let revenue = 0, expenses = 0;
      for (const row of data) {
        const code = parseInt(String(row.account_code || '').replace(/\D/g, ''), 10);
        const amt = Number(row.balance || row.amount || 0);
        if (Number.isInteger(code)) {
          if (code >= 1000 && code <= 1999) revenue += Math.abs(amt);
          else if (code >= 2000 && code <= 4999) expenses += Math.abs(amt);
        }
      }
      return { revenue, expenses, taxable: null, tax: null, advances: 0 };
    }
  } catch { /* missing table */ }
  return null;
}

async function buildPayload(supabase, year, body) {
  const company = (await fetchCompanyProfile(supabase)) || {};
  const fromDb = await fetchAnnualFigures(supabase, year);
  const manual = (body && typeof body === 'object' && body.figures) ? body.figures : {};
  const merged = { ...(fromDb || {}), ...manual };
  return {
    year, company,
    revenue:  Number(merged.revenue  || 0),
    expenses: Number(merged.expenses || 0),
    taxable:  merged.taxable != null ? Number(merged.taxable) : undefined,
    tax:      merged.tax     != null ? Number(merged.tax)     : undefined,
    advances: Number(merged.advances || 0),
    submission_type: (body && body.submission_type === 'correction') ? 'correction' : 'initial',
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Route registrar
// ───────────────────────────────────────────────────────────────────────────

function registerForm6111Routes(app, deps = {}) {
  const { supabase, audit, requirePermission } = deps;

  if (!app || typeof app.get !== 'function') {
    throw new Error('form-6111-routes: app (Express) is required');
  }
  const guardExport = typeof requirePermission === 'function'
    ? requirePermission('tax-annual:export')
    : (_req, _res, next) => next();
  const guardCreate = typeof requirePermission === 'function'
    ? requirePermission('tax-annual:create')
    : (_req, _res, next) => next();
  const auditFn = typeof audit === 'function' ? audit : async () => {};

  // GET /api/tax/form-6111/:year/generate?format=json|fixed|xml&download=1 — preview, no persist.
  app.get('/api/tax/form-6111/:year/generate', guardExport, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }

    let payload;
    try {
      payload = await buildPayload(supabase, year, req.query);
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }

    let file;
    try {
      file = buildForm6111File(payload);
    } catch (err) {
      return res.status(400).json({ error: `form-6111 generation failed: ${err.message}` });
    }

    const wantsDownload = String(req.query.download || '').match(/^(1|true|yes)$/i);
    const format = String(req.query.format || 'json').toLowerCase();

    if (format === 'fixed' || format === 'txt') {
      const filename = file.metadata.filename;
      res.setHeader('Content-Type', 'text/plain; charset=windows-1255');
      if (wantsDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      // Send raw windows-1255 buffer when iconv-lite is present, otherwise utf8 fallback.
      return res.send(file.buffer || file.fixedWidth);
    }
    if (format === 'xml') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      if (wantsDownload) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="form-6111-${year}.xml"`
        );
      }
      return res.send(file.xml);
    }

    return res.json({
      year,
      form_code: '6111',
      version: file.version,
      deadline: file.deadline,
      submission_type: file.submission_type,
      totals: file.totals,
      json: file.json,
      fixedWidth: file.fixedWidth,
      xml: file.xml,
      metadata: file.metadata,
    });
  });

  // POST /api/tax/form-6111/:year/submit — generate + upsert annual_tax_reports row.
  app.post('/api/tax/form-6111/:year/submit', guardCreate, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }

    let payload;
    try {
      payload = await buildPayload(supabase, year, req.body || {});
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }

    let file;
    try {
      file = buildForm6111File(payload);
    } catch (err) {
      return res.status(400).json({ error: `form-6111 generation failed: ${err.message}` });
    }

    const errors = validateForm6111File(file);
    if (errors.length) {
      return res.status(400).json({ error: 'validation failed', details: errors });
    }

    let saved = null;
    if (supabase) {
      try {
        const { data: existing } = await supabase
          .from('annual_tax_reports')
          .select('id')
          .eq('fiscal_year', year)
          .eq('form_type', '6111')
          .maybeSingle();

        const record = {
          fiscal_year: year,
          form_type:   '6111',
          report_version: file.version || '2026.1',
          status:      'submitted',
          payload: {
            json: file.json,
            submission_type: payload.submission_type,
            deadline: file.deadline,
          },
          computed_totals: file.totals,
          created_by: req.actor || 'api',
          updated_at: new Date().toISOString(),
        };

        const result = existing
          ? await supabase.from('annual_tax_reports').update(record).eq('id', existing.id).select().single()
          : await supabase.from('annual_tax_reports').insert(record).select().single();
        if (result.error) {
          return res.status(500).json({ error: result.error.message });
        }
        saved = result.data;

        await auditFn(
          'annual_tax_report',
          saved.id,
          existing ? 'submitted' : 'created',
          req.actor || 'api',
          `הוגש טופס 6111 לשנת ${year} — מס ₪${Math.round(file.totals.tax).toLocaleString('he-IL')}, יתרה ₪${Math.round(file.totals.balance).toLocaleString('he-IL')}`,
          existing || null,
          saved
        );
      } catch (err) {
        return res.status(500).json({ error: `persistence failed: ${err.message}` });
      }
    }

    return res.status(201).json({
      ok: true,
      report_id: saved?.id || null,
      year,
      form_code: '6111',
      submission_type: payload.submission_type,
      deadline: file.deadline,
      totals: file.totals,
      metadata: file.metadata,
    });
  });

  // GET /api/tax/form-6111/:year/deadline — UI helper.
  app.get('/api/tax/form-6111/:year/deadline', guardExport, (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }
    return res.json({ year, deadline: computeDeadline(year) });
  });

  console.log('   ✓ Form 6111 routes registered (GET/POST /api/tax/form-6111/:year/...)');
}

module.exports = { registerForm6111Routes };
