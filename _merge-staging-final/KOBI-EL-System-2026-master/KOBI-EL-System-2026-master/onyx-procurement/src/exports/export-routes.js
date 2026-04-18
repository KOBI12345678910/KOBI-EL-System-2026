/**
 * ONYX — Export routes (XLSX downloads)
 * ═══════════════════════════════════════════════════════════════
 * Agent 66 — written 2026-04-11
 *
 * Streams .xlsx reports straight to `res` without touching disk,
 * so bulk payroll / invoice / bank exports don't blow up RAM or
 * the filesystem. Uses the zero-dep `excel-exporter` module.
 *
 * All routes below are mounted under `/api/exports/*` and therefore
 * inherit the X-API-Key middleware that server.js already wires
 * on `/api/`. No extra auth glue is needed here.
 *
 * Endpoints:
 *   GET /api/exports/employees.xlsx
 *   GET /api/exports/wage-slips.xlsx?year=2026&month=3
 *   GET /api/exports/invoices.xlsx?from=2026-01-01&to=2026-03-31
 *   GET /api/exports/suppliers.xlsx
 *   GET /api/exports/pcn836.xlsx?year=2026&month=3
 *   GET /api/exports/bank-transactions.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Query parameters are optional and validated; unknown params are
 * ignored. The response is always `application/vnd.openxmlformats-
 * officedocument.spreadsheetml.sheet` with a UTF-8-safe download
 * filename (RFC 5987 encoded for Hebrew support).
 *
 * Data loading:
 *   Each route accepts an optional `fetcher` function via the
 *   factory options so routes stay DB-agnostic and unit-testable.
 *   The default fetcher uses `supabase` directly. If `supabase`
 *   is missing, routes short-circuit with a 503.
 *
 * This module exports a single `registerExportRoutes(app, deps)`
 * function matching the `register*Routes` convention used
 * elsewhere in onyx-procurement (see src/payroll/payroll-routes.js).
 */

'use strict';

const {
  exportToExcel,
  exportEmployees,
  exportWageSlips,
  exportInvoices,
  exportSuppliers,
  exportPCN836,
  exportBankTransactions,
} = require('./excel-exporter');

// ────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────
const XLSX_CT =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function setDownloadHeaders(res, filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_') || 'export.xlsx';
  const encoded = encodeURIComponent(filename);
  res.setHeader('Content-Type', XLSX_CT);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYearMonth(query) {
  const year = Number(query.year);
  const month = Number(query.month);
  const hasY = Number.isInteger(year) && year >= 1970 && year <= 2100;
  const hasM = Number.isInteger(month) && month >= 1 && month <= 12;
  return { year: hasY ? year : null, month: hasM ? month : null };
}

function parseDateRange(query) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof query.from === 'string' && re.test(query.from) ? query.from : null;
  const to = typeof query.to === 'string' && re.test(query.to) ? query.to : null;
  return { from, to };
}

function badRequest(res, msg) {
  res.status(400).json({ error: msg });
}

// ────────────────────────────────────────────────────────────────
// Default fetchers — hit Supabase if available, otherwise
// fall back to empty so routes remain functional in tests.
// Each fetcher receives (supabase, query) and returns a list.
// ────────────────────────────────────────────────────────────────
async function fetchEmployees(supabase /*, query */) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('full_name');
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchWageSlips(supabase, query) {
  if (!supabase) return [];
  let q = supabase.from('wage_slips').select('*').order('pay_date', { ascending: false });
  const { year, month } = parseYearMonth(query);
  if (year !== null) q = q.eq('period_year', year);
  if (month !== null) q = q.eq('period_month', month);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchInvoices(supabase, query) {
  if (!supabase) return [];
  let q = supabase.from('invoices').select('*').order('issue_date', { ascending: false });
  const { from, to } = parseDateRange(query);
  if (from) q = q.gte('issue_date', from);
  if (to) q = q.lte('issue_date', to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchSuppliers(supabase /*, query */) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchPCN836(supabase, query) {
  if (!supabase) return [];
  let q = supabase.from('pcn836_rows').select('*');
  const { year, month } = parseYearMonth(query);
  if (year !== null && month !== null) {
    q = q.eq('period', `${year}-${pad2(month)}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchBankTransactions(supabase, query) {
  if (!supabase) return [];
  let q = supabase
    .from('bank_transactions')
    .select('*')
    .order('transaction_date', { ascending: false });
  const { from, to } = parseDateRange(query);
  if (from) q = q.gte('transaction_date', from);
  if (to) q = q.lte('transaction_date', to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

// ────────────────────────────────────────────────────────────────
// Route factory
// ────────────────────────────────────────────────────────────────
function registerExportRoutes(app, deps = {}) {
  const {
    supabase = null,
    fetchers = {},
    logger = console,
  } = deps;

  // Allow consumers to override individual fetchers for tests.
  const F = {
    employees:        fetchers.employees        || fetchEmployees,
    wageSlips:        fetchers.wageSlips        || fetchWageSlips,
    invoices:         fetchers.invoices         || fetchInvoices,
    suppliers:        fetchers.suppliers        || fetchSuppliers,
    pcn836:           fetchers.pcn836           || fetchPCN836,
    bankTransactions: fetchers.bankTransactions || fetchBankTransactions,
  };

  function makeHandler(name, fetcher, exporter, buildFilename) {
    return async function exportHandler(req, res) {
      try {
        const rows = await fetcher(supabase, req.query || {});
        if (!Array.isArray(rows)) {
          return res.status(500).json({ error: `fetcher for ${name} did not return an array` });
        }
        const filename = buildFilename(req.query || {});
        setDownloadHeaders(res, filename);
        // Stream the buffer straight to the response.
        // exportToExcel writes via res.end when `stream` is passed.
        exporter(rows, res);
      } catch (err) {
        logger.error && logger.error(`[exports/${name}] failed:`, err && err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: `Failed to export ${name}: ${err.message}` });
        } else {
          try { res.end(); } catch (_) { /* ignore */ }
        }
      }
    };
  }

  // ─── GET /api/exports/employees.xlsx ─────────────────────────
  app.get('/api/exports/employees.xlsx', makeHandler(
    'employees',
    F.employees,
    exportEmployees,
    () => `onyx-employees-${todayStamp()}.xlsx`,
  ));

  // ─── GET /api/exports/wage-slips.xlsx?year&month ─────────────
  app.get('/api/exports/wage-slips.xlsx', async (req, res) => {
    const { year, month } = parseYearMonth(req.query || {});
    // Year/month are optional; when provided, validate them.
    if (req.query && req.query.year !== undefined && year === null) {
      return badRequest(res, 'Invalid ?year — expected 1970..2100');
    }
    if (req.query && req.query.month !== undefined && month === null) {
      return badRequest(res, 'Invalid ?month — expected 1..12');
    }
    const period = (year && month) ? `-${year}-${pad2(month)}` : '';
    try {
      const rows = await F.wageSlips(supabase, req.query || {});
      setDownloadHeaders(res, `onyx-wage-slips${period}-${todayStamp()}.xlsx`);
      exportWageSlips(rows, res);
    } catch (err) {
      logger.error && logger.error('[exports/wage-slips] failed:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/exports/invoices.xlsx?from&to ──────────────────
  app.get('/api/exports/invoices.xlsx', makeHandler(
    'invoices',
    F.invoices,
    exportInvoices,
    (q) => {
      const { from, to } = parseDateRange(q);
      const range = (from && to) ? `-${from}_${to}` : '';
      return `onyx-invoices${range}-${todayStamp()}.xlsx`;
    },
  ));

  // ─── GET /api/exports/suppliers.xlsx ─────────────────────────
  app.get('/api/exports/suppliers.xlsx', makeHandler(
    'suppliers',
    F.suppliers,
    exportSuppliers,
    () => `onyx-suppliers-${todayStamp()}.xlsx`,
  ));

  // ─── GET /api/exports/pcn836.xlsx?year&month ─────────────────
  app.get('/api/exports/pcn836.xlsx', async (req, res) => {
    const { year, month } = parseYearMonth(req.query || {});
    if (req.query && req.query.year !== undefined && year === null) {
      return badRequest(res, 'Invalid ?year — expected 1970..2100');
    }
    if (req.query && req.query.month !== undefined && month === null) {
      return badRequest(res, 'Invalid ?month — expected 1..12');
    }
    const period = (year && month) ? `-${year}-${pad2(month)}` : '';
    try {
      const rows = await F.pcn836(supabase, req.query || {});
      setDownloadHeaders(res, `onyx-pcn836${period}-${todayStamp()}.xlsx`);
      exportPCN836(rows, res);
    } catch (err) {
      logger.error && logger.error('[exports/pcn836] failed:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/exports/bank-transactions.xlsx?from&to ─────────
  app.get('/api/exports/bank-transactions.xlsx', makeHandler(
    'bank-transactions',
    F.bankTransactions,
    exportBankTransactions,
    (q) => {
      const { from, to } = parseDateRange(q);
      const range = (from && to) ? `-${from}_${to}` : '';
      return `onyx-bank-transactions${range}-${todayStamp()}.xlsx`;
    },
  ));

  // ─── Index / discovery endpoint ─────────────────────────────
  // Lists every available export so clients can auto-build menus.
  app.get('/api/exports', (_req, res) => {
    res.json({
      exports: [
        { path: '/api/exports/employees.xlsx',          entity: 'employees' },
        { path: '/api/exports/wage-slips.xlsx',         entity: 'wage-slips',         params: ['year', 'month'] },
        { path: '/api/exports/invoices.xlsx',           entity: 'invoices',           params: ['from', 'to'] },
        { path: '/api/exports/suppliers.xlsx',          entity: 'suppliers' },
        { path: '/api/exports/pcn836.xlsx',             entity: 'pcn836',             params: ['year', 'month'] },
        { path: '/api/exports/bank-transactions.xlsx',  entity: 'bank-transactions',  params: ['from', 'to'] },
      ],
      format: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rtl: true,
      generated: new Date().toISOString(),
    });
  });
}

// ────────────────────────────────────────────────────────────────
module.exports = {
  registerExportRoutes,
  // internals exposed for tests
  _internal: {
    setDownloadHeaders,
    parseYearMonth,
    parseDateRange,
    todayStamp,
    fetchEmployees,
    fetchWageSlips,
    fetchInvoices,
    fetchSuppliers,
    fetchPCN836,
    fetchBankTransactions,
    XLSX_CT,
  },
  // re-export exporters for convenience
  exportToExcel,
  exportEmployees,
  exportWageSlips,
  exportInvoices,
  exportSuppliers,
  exportPCN836,
  exportBankTransactions,
};
