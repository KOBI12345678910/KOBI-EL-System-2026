/**
 * form-856-routes.js — Express routes for טופס 856
 * (Annual Withholding Report — Freelancers / Contractors)
 * Wave 2026 — Techno-Kol Uzi Mega-ERP
 * ---------------------------------------------------------------------------
 *
 * Mounts the existing form-856.js business-logic engine behind a thin HTTP
 * surface so the UI / external callers can:
 *
 *   GET  /api/tax/form-856/:year/generate?download=1
 *        → Aggregates contractor payments + withholding certificates for the
 *          calendar year, runs generate856(), and returns either a JSON
 *          report OR (when ?download=1) the fixed-width שע"מ submission file
 *          as `text/plain` so the operator can save it locally.
 *
 *   POST /api/tax/form-856/:year/submit
 *        → Generates the year's report, persists it under
 *          `annual_tax_reports` with form_type='856' and status='submitted',
 *          and writes an audit row. Does NOT actually upload to שע"מ — the
 *          ITA portal upload is a manual step, but the row records the
 *          intent + payload + electronic file shape so the upload is
 *          repeatable and reviewable.
 *
 * Data sources used (in fall-through order):
 *   1. `withholding_tax_certificates`  (israeli-accounting-engine v1)
 *   2. `contractor_payment_engine` rows (granular per-project ledger)
 *      — joined to `contractor_profiles` for vendor identity
 *
 * Both inputs are normalized by the adapters in form-856.js
 * (rowsFromCertificateTable / rowsFromContractorPayments).
 *
 * Permissions: all routes require `tax-annual:export` for read/preview and
 * `tax-annual:create` for submit.
 *
 * Zero new dependencies. Compatible with the registerXxxRoutes() pattern
 * already used by annual-tax-routes / vat-routes / payroll-routes.
 * ---------------------------------------------------------------------------
 */

'use strict';

const {
  generate856,
  rowsFromCertificateTable,
  rowsFromContractorPayments,
} = require('./form-856');

// ───────────────────────────────────────────────────────────────────────────
// Helpers — resolve contractor profiles once, then map by id for adapter use
// ───────────────────────────────────────────────────────────────────────────

async function fetchContractorProfiles(supabase) {
  try {
    const { data, error } = await supabase
      .from('contractor_profiles')
      .select('id, full_name, tax_id, id_number, contractor_type, withholding_rate');
    if (error) return {};
    const byId = {};
    for (const row of data || []) byId[row.id] = row;
    return byId;
  } catch {
    return {};
  }
}

async function fetchPayerProfile(supabase) {
  try {
    const { data } = await supabase
      .from('company_tax_profile')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      company_id: data.company_id || data.tax_id || data.vat_number || '',
      legal_name: data.legal_name || data.company_name || '',
      tax_file_number: data.tax_file_number || data.withholding_file || '',
      address: data.address || '',
      contact: data.contact || data.email || '',
    };
  } catch {
    return null;
  }
}

/**
 * Pull all the raw rows we need for `year` and feed them through the
 * normalizers in form-856.js. Returns a payload ready for generate856().
 */
async function buildPayload(supabase, year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // 1. Certificates (one row per vendor / period)
  let certRows = [];
  try {
    const { data } = await supabase
      .from('withholding_tax_certificates')
      .select('*')
      .eq('fiscal_year', year);
    certRows = data || [];
  } catch { /* table may not exist in dev */ }

  // 2. Contractor payment ledger rows in the calendar year
  let payRows = [];
  try {
    const { data } = await supabase
      .from('contractor_payments')
      .select('*')
      .gte('paid_date', yearStart)
      .lte('paid_date', yearEnd);
    payRows = data || [];
  } catch { /* table may not exist in dev */ }

  const profilesById = await fetchContractorProfiles(supabase);
  const payer = await fetchPayerProfile(supabase);

  // Normalize through the adapters and merge.
  const fromCerts = rowsFromCertificateTable(certRows);
  const fromLedger = rowsFromContractorPayments(payRows, profilesById);

  // Merge recipients (de-dup by vendor_id; ledger entries override, since
  // they carry richer profile-derived metadata).
  const recipientsById = new Map();
  for (const r of fromCerts.recipients) recipientsById.set(r.vendor_id, r);
  for (const r of fromLedger.recipients) recipientsById.set(r.vendor_id, r);

  return {
    year,
    payer: payer || {
      company_id: '',
      legal_name: '',
      tax_file_number: '',
      address: '',
      contact: '',
    },
    recipients: Array.from(recipientsById.values()),
    payments: [...fromCerts.payments, ...fromLedger.payments],
    certificates: fromCerts.certificates,
    submission_type: 'initial',
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Route registrar
// ───────────────────────────────────────────────────────────────────────────

function registerForm856Routes(app, deps = {}) {
  const { supabase, audit, requirePermission } = deps;

  if (!app || typeof app.get !== 'function') {
    throw new Error('form-856-routes: app (Express) is required');
  }
  if (!supabase) {
    throw new Error('form-856-routes: supabase client is required');
  }
  // requirePermission is optional in dev; fall back to a no-op middleware.
  const guardExport = typeof requirePermission === 'function'
    ? requirePermission('tax-annual:export')
    : (_req, _res, next) => next();
  const guardCreate = typeof requirePermission === 'function'
    ? requirePermission('tax-annual:create')
    : (_req, _res, next) => next();
  const auditFn = typeof audit === 'function' ? audit : async () => {};

  // ─── GET /api/tax/form-856/:year/generate ───────────────────────────────
  // Preview / download — does NOT persist.
  // ?download=1 → text/plain fixed-width file
  // ?format=xml → application/xml envelope
  // (default)   → JSON { records, summary, electronicFile }
  app.get('/api/tax/form-856/:year/generate', guardExport, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }

    let payload;
    try {
      payload = await buildPayload(supabase, year);
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }

    let report;
    try {
      report = generate856(payload);
    } catch (err) {
      return res.status(400).json({ error: `form-856 generation failed: ${err.message}` });
    }

    const wantsDownload = String(req.query.download || '').match(/^(1|true|yes)$/i);
    const format = String(req.query.format || '').toLowerCase();

    if (wantsDownload || format === 'txt' || format === 'fixed') {
      const filename = `form-856-${year}.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(report.electronicFile.fixedWidth);
    }
    if (format === 'xml') {
      const filename = `form-856-${year}.xml`;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      if (wantsDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      return res.send(report.electronicFile.xml);
    }

    return res.json({
      year,
      form_code: '856',
      version: report.version,
      generated_at: report.generated_at,
      records: report.records,
      summary: report.summary,
      electronicFile: {
        recordWidth: report.electronicFile.recordWidth,
        trailerWidth: report.electronicFile.trailerWidth,
        lineCount: report.electronicFile.lineCount,
        // Include payload bytes so a UI can offer download without a 2nd round-trip.
        fixedWidth: report.electronicFile.fixedWidth,
        xml: report.electronicFile.xml,
      },
    });
  });

  // ─── POST /api/tax/form-856/:year/submit ────────────────────────────────
  // Generate + persist. Upserts annual_tax_reports row keyed by
  // (fiscal_year, form_type='856').
  app.post('/api/tax/form-856/:year/submit', guardCreate, async (req, res) => {
    const year = parseInt(req.params.year, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year', year: req.params.year });
    }

    let payload;
    try {
      payload = await buildPayload(supabase, year);
    } catch (err) {
      return res.status(500).json({ error: `failed to load source data: ${err.message}` });
    }
    // Caller may override submission_type (e.g. correction)
    if (req.body && (req.body.submission_type === 'correction' || req.body.submission_type === 'initial')) {
      payload.submission_type = req.body.submission_type;
    }

    let report;
    try {
      report = generate856(payload);
    } catch (err) {
      return res.status(400).json({ error: `form-856 generation failed: ${err.message}` });
    }

    // Upsert into annual_tax_reports
    let saved = null;
    try {
      const { data: existing } = await supabase
        .from('annual_tax_reports')
        .select('id')
        .eq('fiscal_year', year)
        .eq('form_type', '856')
        .maybeSingle();

      const record = {
        fiscal_year: year,
        form_type: '856',
        report_version: report.version || '2026.1',
        status: 'submitted',
        payload: {
          records: report.records,
          summary: report.summary,
          submission_type: payload.submission_type,
        },
        computed_totals: {
          record_count: report.summary.record_count,
          payment_count: report.summary.payment_count,
          gross_total: report.summary.gross_total,
          tax_withheld: report.summary.tax_withheld,
          net_paid: report.summary.net_paid,
        },
        created_by: req.actor || 'api',
        updated_at: new Date().toISOString(),
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
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
      saved = result.data;

      await auditFn(
        'annual_tax_report',
        saved.id,
        existing ? 'submitted' : 'created',
        req.actor || 'api',
        `הוגש טופס 856 לשנת ${year} — ${report.summary.record_count} מקבלים, ניכוי ₪${report.summary.tax_withheld.toLocaleString('he-IL')}`,
        existing || null,
        saved
      );
    } catch (err) {
      return res.status(500).json({ error: `persistence failed: ${err.message}` });
    }

    return res.status(201).json({
      ok: true,
      report_id: saved?.id || null,
      year,
      form_code: '856',
      submission_type: payload.submission_type,
      summary: report.summary,
      electronicFile: {
        recordWidth: report.electronicFile.recordWidth,
        trailerWidth: report.electronicFile.trailerWidth,
        lineCount: report.electronicFile.lineCount,
      },
    });
  });

  console.log('   ✓ Form 856 routes registered (GET/POST /api/tax/form-856/:year/...)');
}

module.exports = { registerForm856Routes };
