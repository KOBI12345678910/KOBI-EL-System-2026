/**
 * src/tax-exports/bkmv-routes.js — Express routes for BKMVDATA / INI.TXT
 * (Israel Tax Authority — מבנה אחיד, regulation 36).
 *
 * Mounts on top of bkmv-unified.js (the buffer builder). This file is the
 * thin HTTP layer that:
 *   1. pulls raw inputs from Supabase for a given fiscal year,
 *   2. calls buildUnifiedFile(),
 *   3. validates the produced BKMVDATA buffer,
 *   4. archives both files to disk under data/bkmv/<YEAR>/,
 *   5. records the run in the audit log,
 *   6. streams the archive back to the caller (ZIP-style: bkmvBuffer first,
 *      then INI buffer in a separate JSON envelope; or the raw file when
 *      ?artifact=bkmv | ini is requested).
 *
 * Endpoints (all under /api/tax/bkmv):
 *   GET  /:year/generate        — build & archive both files; default JSON envelope
 *                                  (?artifact=bkmv → stream BKMVDATA.TXT only,
 *                                   ?artifact=ini  → stream INI.TXT only)
 *   GET  /:year/preview         — same builder but no archive, no audit (dry-run)
 *   GET  /:year/last            — metadata of the most recent run for the year
 *   GET  /:year/download/:file  — download a previously archived artifact
 *                                  (file = 'bkmv' | 'ini')
 *   GET  /health                — module liveness + record-width table
 *
 * Permission:
 *   - generate / download require 'tax-bkmv:generate' (added to RBAC list)
 *
 * Sibling modules:
 *   - src/vat/vat-routes.js          (PCN836 — same pattern, win-1255)
 *   - src/tax/annual-tax-routes.js   (annual return JSON builders)
 *
 * Agent 216 — wave 2026 finance hardening.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { buildUnifiedFile, validateFile, RECORD_WIDTHS } = require('./bkmv-unified');

/**
 * Register the BKMV routes onto an Express app.
 *
 * @param {import('express').Express} app
 * @param {Object} deps
 * @param {Object} deps.supabase           — Supabase client (admin or service role)
 * @param {Function} [deps.audit]          — server.js audit() wrapper
 * @param {Function} [deps.requirePermission] — RBAC middleware factory
 */
function registerBkmvRoutes(app, { supabase, audit, requirePermission } = {}) {
  if (!app)      throw new Error('registerBkmvRoutes: express app required');
  if (!supabase) throw new Error('registerBkmvRoutes: supabase client required');

  const noopMw = (_req, _res, next) => next();
  const requirePerm = typeof requirePermission === 'function'
    ? requirePermission
    : () => noopMw;

  const auditFn = typeof audit === 'function'
    ? audit
    : async () => {}; // best-effort — no audit table, no error

  // Archive root: env override → data/bkmv/<YEAR>/
  const BKMV_ARCHIVE_DIR = process.env.BKMV_ARCHIVE_DIR
    || path.join(__dirname, '..', '..', 'data', 'bkmv');
  try { fs.mkdirSync(BKMV_ARCHIVE_DIR, { recursive: true }); } catch (_) {}

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Best-effort fetch from a Supabase table.
   * Some sources (gl_lines, chart_of_accounts, inventory_items, receipts)
   * may not exist on every install. Return [] instead of throwing so a
   * partial unified file can still be produced (A100 + Z900 + whatever
   * sources DO exist).
   */
  async function safeFetch(table, applyFilters) {
    try {
      let q = supabase.from(table).select('*');
      if (typeof applyFilters === 'function') q = applyFilters(q);
      const { data, error } = await q;
      if (error) {
        console.warn(`[bkmv] table '${table}' fetch failed: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn(`[bkmv] table '${table}' threw: ${err && err.message}`);
      return [];
    }
  }

  /**
   * Build the input bundle that bkmv-unified.buildUnifiedFile() expects
   * from the live Supabase tables, scoped to one fiscal year.
   *
   * Year window: [YYYY-01-01, (YYYY+1)-01-01) — half-open.
   */
  async function loadInputs(fiscalYear) {
    const yStart = `${fiscalYear}-01-01`;
    const yEnd   = `${Number(fiscalYear) + 1}-01-01`;

    // Single tenant — pick the only row, or the first one
    const { data: companyProfile, error: profileErr } = await supabase
      .from('company_tax_profile')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (profileErr) throw new Error(`company_tax_profile read failed: ${profileErr.message}`);
    if (!companyProfile) {
      const e = new Error('Company tax profile not configured — PUT /api/vat/profile first');
      e.status = 412;
      throw e;
    }

    // B100 — general journal lines
    const journal = await safeFetch('gl_lines', (q) =>
      q.gte('date', yStart).lt('date', yEnd).order('date', { ascending: true })
    );

    // B110 — chart of accounts (year balances baked in at row level when present)
    const ledger = await safeFetch('chart_of_accounts', (q) =>
      q.order('account_code', { ascending: true })
    );

    // C100 — sales (output) tax invoices
    const salesInvoices = await safeFetch('tax_invoices', (q) =>
      q.eq('direction', 'output')
       .gte('invoice_date', yStart)
       .lt('invoice_date', yEnd)
       .neq('status', 'voided')
    );

    // D110 — purchase (input) tax invoices
    const purchaseInvoices = await safeFetch('tax_invoices', (q) =>
      q.eq('direction', 'input')
       .gte('invoice_date', yStart)
       .lt('invoice_date', yEnd)
       .neq('status', 'voided')
    );

    // D120 — receipts (customer payments closed in the year)
    let receipts = await safeFetch('receipts', (q) =>
      q.gte('receipt_date', yStart).lt('receipt_date', yEnd)
    );
    if (!receipts.length) {
      // Fallback: customer_payments table (annual-tax-routes uses this)
      receipts = await safeFetch('customer_payments', (q) =>
        q.gte('payment_date', yStart).lt('payment_date', yEnd)
      );
    }

    // M100 — inventory snapshot
    let inventory = await safeFetch('inventory_items');
    if (!inventory.length) {
      inventory = await safeFetch('items');
    }

    return {
      companyProfile,
      fiscalYear,
      journal,
      ledger,
      salesInvoices,
      purchaseInvoices,
      receipts,
      inventory,
    };
  }

  /** Year folder under archive root, mkdir-safe. */
  function yearDir(fiscalYear) {
    const dir = path.join(BKMV_ARCHIVE_DIR, String(fiscalYear));
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    return dir;
  }

  /** 4-digit year guard. Reject obviously bad inputs. */
  function parseYear(raw) {
    const y = Number(raw);
    if (!Number.isInteger(y) || y < 1990 || y > 2100) {
      const e = new Error(`Invalid fiscal year '${raw}' — expected 4-digit integer`);
      e.status = 400;
      throw e;
    }
    return String(y);
  }

  // ═══════════════════════════════════════════════════════════════
  // Routes
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /api/tax/bkmv/health
   * Module liveness + record-width reference table.
   */
  app.get('/api/tax/bkmv/health', (_req, res) => {
    res.json({
      status: 'ok',
      module: 'bkmv-unified',
      agent: '216',
      archiveDir: BKMV_ARCHIVE_DIR,
      recordWidths: RECORD_WIDTHS,
      endpoints: [
        'GET  /api/tax/bkmv/:year/generate',
        'GET  /api/tax/bkmv/:year/preview',
        'GET  /api/tax/bkmv/:year/last',
        'GET  /api/tax/bkmv/:year/download/:file',
        'GET  /api/tax/bkmv/health',
      ],
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /api/tax/bkmv/:year/generate
   *
   * Build + archive + audit. Default response is a JSON envelope with
   * metadata and base64 payloads. Use ?artifact=bkmv|ini to stream the
   * raw windows-1255 file directly.
   */
  app.get(
    '/api/tax/bkmv/:year/generate',
    requirePerm('tax-bkmv:generate'),
    async (req, res) => {
      try {
        const fiscalYear = parseYear(req.params.year);
        const inputs = await loadInputs(fiscalYear);

        const out = buildUnifiedFile(inputs);

        // Structural validation — width per record + first/last sentinels
        const errors = validateFile(out.bkmvBuffer);
        if (errors.length) {
          return res.status(422).json({
            error: 'BKMVDATA structural validation failed',
            details: errors.slice(0, 20),
            metadata: out.metadata,
          });
        }

        // Archive both files
        const dir = yearDir(fiscalYear);
        const bkmvPath = path.join(dir, out.bkmvFilename);
        const iniPath  = path.join(dir, out.iniFilename);
        try {
          fs.writeFileSync(bkmvPath, out.bkmvBuffer);
          fs.writeFileSync(iniPath,  out.iniBuffer);
        } catch (err) {
          console.error('[bkmv] archive write failed:', err && err.message);
        }

        // Audit (non-blocking — never throw on audit failure)
        try {
          await auditFn(
            'bkmv_unified',
            `${fiscalYear}-${out.metadata.bodyChecksum16}`,
            'generated',
            req.actor || (req.user && req.user.id) || 'api',
            `BKMVDATA + INI לשנת ${fiscalYear} — ${out.metadata.totalRecords} רשומות`,
            null,
            {
              ...out.metadata,
              bkmvPath,
              iniPath,
            },
          );
        } catch (_) {}

        // Streaming variants
        const artifact = String(req.query.artifact || '').toLowerCase();
        if (artifact === 'bkmv') {
          res.setHeader('Content-Type', 'text/plain; charset=windows-1255');
          res.setHeader('Content-Disposition', `attachment; filename="${out.bkmvFilename}"`);
          return res.end(out.bkmvBuffer);
        }
        if (artifact === 'ini') {
          res.setHeader('Content-Type', 'text/plain; charset=windows-1255');
          res.setHeader('Content-Disposition', `attachment; filename="${out.iniFilename}"`);
          return res.end(out.iniBuffer);
        }

        // Default: JSON envelope (base64 payloads + metadata + archive paths)
        res.json({
          ok: true,
          fiscalYear,
          metadata: out.metadata,
          bkmvFilename: out.bkmvFilename,
          iniFilename: out.iniFilename,
          archivePaths: { bkmv: bkmvPath, ini: iniPath },
          payload: {
            bkmvBase64: out.bkmvBuffer.toString('base64'),
            iniBase64:  out.iniBuffer.toString('base64'),
          },
        });
      } catch (err) {
        const status = err.status || 500;
        console.error('[bkmv] generate failed:', err && err.message);
        res.status(status).json({ error: err.message || 'BKMV generation failed' });
      }
    },
  );

  /**
   * GET /api/tax/bkmv/:year/preview
   * Same builder, no archive, no audit. Useful for UI dry-runs and tests.
   */
  app.get('/api/tax/bkmv/:year/preview', async (req, res) => {
    try {
      const fiscalYear = parseYear(req.params.year);
      const inputs = await loadInputs(fiscalYear);
      const out = buildUnifiedFile(inputs);
      const errors = validateFile(out.bkmvBuffer);
      res.json({
        ok: errors.length === 0,
        fiscalYear,
        metadata: out.metadata,
        bkmvFilename: out.bkmvFilename,
        iniFilename: out.iniFilename,
        validationErrors: errors,
        firstLines: out.bkmvBuffer
          .toString('binary')
          .split('\r\n')
          .slice(0, 5),
      });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'BKMV preview failed' });
    }
  });

  /**
   * GET /api/tax/bkmv/:year/last
   * Metadata of the most recently archived run for the given fiscal year
   * (mtime-sorted).
   */
  app.get('/api/tax/bkmv/:year/last', (req, res) => {
    try {
      const fiscalYear = parseYear(req.params.year);
      const dir = yearDir(fiscalYear);
      const files = fs.readdirSync(dir).filter((f) => /^(BKMVDATA|INI)_/.test(f));
      if (!files.length) {
        return res.status(404).json({ error: 'No archived runs for this year' });
      }
      const stats = files.map((f) => {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        return { filename: f, path: p, bytes: st.size, mtime: st.mtime.toISOString() };
      }).sort((a, b) => b.mtime.localeCompare(a.mtime));
      res.json({ fiscalYear, archive: stats });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'last-run lookup failed' });
    }
  });

  /**
   * GET /api/tax/bkmv/:year/download/:file
   * Stream a previously archived artifact. file ∈ {bkmv, ini}.
   */
  app.get(
    '/api/tax/bkmv/:year/download/:file',
    requirePerm('tax-bkmv:generate'),
    (req, res) => {
      try {
        const fiscalYear = parseYear(req.params.year);
        const which = String(req.params.file || '').toLowerCase();
        if (which !== 'bkmv' && which !== 'ini') {
          return res.status(400).json({ error: "file must be 'bkmv' or 'ini'" });
        }
        const dir = yearDir(fiscalYear);
        const prefix = which === 'bkmv' ? 'BKMVDATA_' : 'INI_';
        const files = fs.readdirSync(dir)
          .filter((f) => f.startsWith(prefix))
          .map((f) => ({ f, p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtime }))
          .sort((a, b) => b.m - a.m);
        if (!files.length) {
          return res.status(404).json({ error: `No archived ${which.toUpperCase()} for ${fiscalYear}` });
        }
        const top = files[0];
        res.setHeader('Content-Type', 'text/plain; charset=windows-1255');
        res.setHeader('Content-Disposition', `attachment; filename="${top.f}"`);
        fs.createReadStream(top.p).pipe(res);
      } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ error: err.message || 'download failed' });
      }
    },
  );

  console.log('✓ bkmv-unified wired — GET /api/tax/bkmv/:year/generate (regulation 36)');
}

module.exports = { registerBkmvRoutes };
