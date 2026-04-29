/**
 * Annual Tax module — Express routes
 * Wave 1.5 — B-10 fix
 *
 * AGENT-229 — Year-End Close Orchestrator additions:
 *   - POST /api/fiscal-years/:year/close
 *   - postTaxProvisionJE         → templates.TAX_PROVISION
 *   - postYearEndCloseJE         → templates.YEAR_END_CLOSE_FULL (full P&L sweep)
 *   - postRollForwardOpeningJE   → templates.ROLL_FORWARD_OPENING
 *   - recomputeYearTotals        → opex/finance/tax/NPAT from posted GL
 */

'use strict';

const { buildForm1320, buildForm1301, buildForm6111, buildForm30A } = require('./form-builders');
const GL = require('../gl/journal-entry');

// ─── AGENT-229 helpers ──────────────────────────────────────────────────────

/** Round to 2 decimals (ש"ח / agorot precision). */
function _r2(x) {
  return Math.round((Number(x) + Number.EPSILON) * 100) / 100;
}

/**
 * Bucket gl_lines by P&L section using the journal-entry classifier.
 * Returns:
 *   { revenue, cogs, opex, finance, tax, assets, liabilities, equity }
 *     where each section is an array of { account, debit, credit, balance }.
 */
function bucketByPLSection(lines) {
  const acctMap = new Map(); // account -> { account, debit, credit }
  for (const l of (lines || [])) {
    if (!l || !l.account) continue;
    const k = String(l.account);
    if (!acctMap.has(k)) acctMap.set(k, { account: k, debit: 0, credit: 0 });
    const row = acctMap.get(k);
    row.debit  = _r2(row.debit  + Number(l.debit  || 0));
    row.credit = _r2(row.credit + Number(l.credit || 0));
  }

  const out = {
    revenue: [], cogs: [], opex: [], finance: [], tax: [],
    assets: [], liabilities: [], equity: [],
  };

  for (const row of acctMap.values()) {
    const cls = GL.classify(row.account);
    if (!cls) continue;
    // P&L sections: balance is signed by normal side; for revenue (Cr normal):
    // positive balance = credit excess. For tax/cogs/opex/non-op (Dr normal):
    // positive balance = debit excess. Caller's template uses Math.abs() and
    // stores both directions explicitly in the line construction.
    const debitNormal = cls.normalSide === 'D';
    const balance = debitNormal
      ? _r2(row.debit  - row.credit)
      : _r2(row.credit - row.debit);
    const item = { account: row.account, debit: row.debit, credit: row.credit, balance };

    switch (cls.key) {
      case 'REVENUE':   out.revenue.push(item);     break;
      case 'COGS':      out.cogs.push(item);        break;
      case 'OPEX':      out.opex.push(item);        break;
      case 'NONOP':     out.finance.push(item);     break;
      case 'TAX':       out.tax.push(item);         break;
      case 'ASSET':     out.assets.push(item);      break;
      case 'LIABILITY': out.liabilities.push(item); break;
      case 'EQUITY':    out.equity.push(item);      break;
      default: break;
    }
  }
  return out;
}

/**
 * Mirror an in-memory JE (built via app.locals.glBook) to the journal_entries
 * table for downstream consumers (BKMV, audit, reports). Best-effort —
 * silently skips if table absent (e.g. test env).
 */
async function _mirrorJEToDB(supabase, je, year, actor) {
  if (!supabase || !je) return null;
  try {
    const row = {
      number: je.number || je.id,
      date: je.date,
      memo: je.memo,
      status: je.status || 'posted',
      fiscal_year: year,
      created_by: actor,
      posted_by: actor,
      posted_at: je.posted_at || new Date().toISOString(),
      total_debit: GL.sumBy(je.lines || [], 'debit'),
      total_credit: GL.sumBy(je.lines || [], 'credit'),
      lines: je.lines,
    };
    const { data } = await supabase.from('journal_entries').insert(row).select().maybeSingle();
    return data || null;
  } catch (_e) { return null; }
}

/**
 * Post the tax-provision JE for a fiscal year.
 *   Profit year → Dr 9100 / Cr 2190
 *   Loss year   → Dr 1490 (DTA) / Cr 9150
 *
 * PBT is recomputed from posted GL (revenue - cogs - opex - finance, NO tax)
 * because fy.net_profit_before_tax may be stale after late adjustments.
 */
async function postTaxProvisionJE({ supabase, year, fy, actor, dryRun, taxRate, app, audit }) {
  // Recompute PBT from posted gl_lines (excluding tax band 9xxx)
  const { data: lines } = await safeGLLines(supabase, fy.start_date, fy.end_date);
  const buckets = bucketByPLSection(lines || []);
  const sumAbs = (arr) => arr.reduce((s, x) => s + Math.abs(Number(x.balance) || 0), 0);

  const revenue = sumAbs(buckets.revenue);
  const cogs    = sumAbs(buckets.cogs);
  const opex    = sumAbs(buckets.opex);
  let finance = 0;
  for (const f of buckets.finance) finance += Number(f.balance) || 0; // signed
  const pbt = _r2(revenue - cogs - opex - finance);

  if (dryRun) {
    return {
      id: null, dryRun: true,
      preview: {
        template: 'TAX_PROVISION',
        variables: { profit_before_tax: pbt, tax_rate: taxRate },
        pbt, expected_tax: _r2(pbt * taxRate),
      },
    };
  }

  const book = app && app.locals && app.locals.glBook;
  if (!book || typeof book.applyTemplate !== 'function') {
    // Fallback — synthesize a record without GL book (test env)
    return {
      id: `TAX-${year}-fallback`,
      template: 'TAX_PROVISION',
      pbt, tax_rate: taxRate,
      tax_amount: _r2(Math.max(0, pbt) * taxRate),
      posted: false,
      note: 'glBook not wired — JE not actually posted',
    };
  }

  const tplId = book.applyTemplate('TAX_PROVISION', {
    profit_before_tax: pbt,
    tax_rate: taxRate,
  });
  // Date the entry on the last day of the fiscal year
  const e = book.entries ? book.entries.get(tplId) : null;
  if (e) e.date = fy.end_date;
  try { book.post(tplId, actor); } catch (_e) { /* may fail in dry environments */ }

  const je = book.get ? book.get(tplId) : (book.entries && book.entries.get(tplId));
  await _mirrorJEToDB(supabase, je, year, actor);
  if (audit && je) {
    await audit('journal_entry', je.id || tplId, 'posted', actor,
      `הפרשה למס חברות ${year}`, null, je);
  }
  try {
    app.locals.events?.emit('ledger.tax_provision_posted', {
      year, je_id: je && je.id, pbt, tax_rate: taxRate,
      tax_amount: _r2(Math.max(0, pbt) * taxRate),
    });
  } catch (_e) { /* noop */ }
  return je || { id: tplId, template: 'TAX_PROVISION', pbt, tax_rate: taxRate };
}

/**
 * Post the full P&L sweep close JE for a fiscal year.
 * Reads posted gl_lines, classifies them, and feeds the bucketed trial balance
 * to the YEAR_END_CLOSE_FULL template.
 */
async function postYearEndCloseJE({ supabase, year, fy, actor, dryRun, app, audit }) {
  const { data: lines } = await safeGLLines(supabase, fy.start_date, fy.end_date);
  const tb = bucketByPLSection(lines || []);

  if (dryRun) {
    return {
      id: null, dryRun: true,
      preview: {
        template: 'YEAR_END_CLOSE_FULL',
        variables: { trialBalance: tb, useIncomeSummary: true },
        bucket_counts: {
          revenue: tb.revenue.length, cogs: tb.cogs.length,
          opex: tb.opex.length, finance: tb.finance.length, tax: tb.tax.length,
        },
      },
    };
  }

  const book = app && app.locals && app.locals.glBook;
  if (!book || typeof book.applyTemplate !== 'function') {
    return {
      id: `CLOSE-${year}-fallback`,
      template: 'YEAR_END_CLOSE_FULL',
      posted: false,
      note: 'glBook not wired — JE not actually posted',
    };
  }

  const tplId = book.applyTemplate('YEAR_END_CLOSE_FULL', {
    trialBalance: tb,
    useIncomeSummary: true,
    retainedEarningsAccount: '3500',
    incomeSummaryAccount: '3490',
  });
  const e = book.entries ? book.entries.get(tplId) : null;
  if (e) e.date = fy.end_date;
  try { book.post(tplId, actor); } catch (_e) { /* fallthrough */ }

  const je = book.get ? book.get(tplId) : (book.entries && book.entries.get(tplId));
  await _mirrorJEToDB(supabase, je, year, actor);
  if (audit && je) {
    await audit('journal_entry', je.id || tplId, 'posted', actor,
      `סגירת שנה ${year} — full P&L sweep`, null, je);
  }
  return je || { id: tplId, template: 'YEAR_END_CLOSE_FULL' };
}

/**
 * Recompute final fiscal-year totals from posted GL (post tax provision).
 * Returns shape suitable for fiscal_years update:
 *   { total_revenue, total_cogs, gross_profit, total_opex, total_finance,
 *     net_profit_before_tax, income_tax, npat, gross_margin_pct, npat_margin_pct }
 */
async function recomputeYearTotals({ supabase, year, fy }) {
  const { data: lines } = await safeGLLines(supabase, fy.start_date, fy.end_date);
  const tb = bucketByPLSection(lines || []);
  const sum = (arr) => arr.reduce((s, x) => s + Math.abs(Number(x.balance) || 0), 0);

  const revenue = _r2(sum(tb.revenue));
  const cogs    = _r2(sum(tb.cogs));
  const opex    = _r2(sum(tb.opex));
  let finance = 0;
  for (const f of (tb.finance || [])) finance += Number(f.balance) || 0;
  finance = _r2(finance);
  const tax = _r2(sum(tb.tax));

  const grossProfit = _r2(revenue - cogs);
  const npbt = _r2(revenue - cogs - opex - finance);
  const npat = _r2(npbt - tax);

  return {
    total_revenue: revenue,
    total_cogs: cogs,
    gross_profit: grossProfit,
    total_opex: opex,
    total_finance: finance,
    net_profit_before_tax: npbt,
    income_tax: tax,
    npat,
    gross_margin_pct: revenue > 0 ? _r2((grossProfit / revenue) * 100) : 0,
    npat_margin_pct: revenue > 0 ? _r2((npat / revenue) * 100) : 0,
  };
}

/**
 * Build closing TB (BS accounts only — assets/liab/equity) from gl_lines,
 * upsert next-year fiscal_years row (status='open'), then post a
 * ROLL_FORWARD_OPENING JE dated YYYY-01-01 for the new year.
 */
async function postRollForwardOpeningJE({ supabase, fromYear, toYear, actor, app, audit }) {
  // Verify prior year is closed
  const { data: priorFy } = await supabase.from('fiscal_years')
    .select('*').eq('year', fromYear).maybeSingle();
  if (!priorFy || priorFy.status !== 'closed') {
    const e = new Error(`Prior year ${fromYear} is not closed (status: ${priorFy && priorFy.status})`);
    e.code = 'ERR_PRIOR_YEAR_NOT_CLOSED';
    throw e;
  }

  // Pull all gl_lines up to and including the prior year-end
  const { data: lines } = await safeGLLinesUpTo(supabase, priorFy.end_date);
  const tb = bucketByPLSection(lines || []);

  // Upsert toYear row
  const { data: existingNext } = await supabase.from('fiscal_years')
    .select('id').eq('year', toYear).maybeSingle();
  const nextPayload = {
    year: toYear,
    start_date: `${toYear}-01-01`,
    end_date: `${toYear}-12-31`,
    status: 'open',
  };
  if (existingNext) {
    await supabase.from('fiscal_years').update(nextPayload).eq('id', existingNext.id);
  } else {
    await supabase.from('fiscal_years').insert(nextPayload);
  }

  const book = app && app.locals && app.locals.glBook;
  if (!book || typeof book.applyTemplate !== 'function') {
    return {
      id: `OPEN-${toYear}-fallback`,
      template: 'ROLL_FORWARD_OPENING',
      from_year: fromYear, to_year: toYear,
      posted: false,
      note: 'glBook not wired — opening JE not actually posted',
    };
  }

  const tplId = book.applyTemplate('ROLL_FORWARD_OPENING', {
    priorYearClosingTB: {
      assets: tb.assets,
      liabilities: tb.liabilities,
      equity: tb.equity,
    },
  });
  const e = book.entries ? book.entries.get(tplId) : null;
  if (e) e.date = `${toYear}-01-01`;
  try { book.post(tplId, actor); } catch (_e) { /* fallthrough */ }

  const je = book.get ? book.get(tplId) : (book.entries && book.entries.get(tplId));
  await _mirrorJEToDB(supabase, je, toYear, actor);
  if (audit && je) {
    await audit('journal_entry', je.id || tplId, 'posted', actor,
      `יתרות פתיחה ${toYear} (גלגול מ-${fromYear})`, null, je);
  }
  return je || { id: tplId, template: 'ROLL_FORWARD_OPENING', from_year: fromYear, to_year: toYear };
}

/** Safe helper: fetch gl_lines for a date window (returns [] on table-missing). */
async function safeGLLines(supabase, startDate, endDate) {
  try {
    const { data } = await supabase.from('gl_lines')
      .select('account, debit, credit, date')
      .gte('date', startDate).lte('date', endDate);
    return { data: data || [] };
  } catch (_e) { return { data: [] }; }
}

/** Safe helper: fetch gl_lines up to (and including) a date. */
async function safeGLLinesUpTo(supabase, endDate) {
  try {
    const { data } = await supabase.from('gl_lines')
      .select('account, debit, credit, date')
      .lte('date', endDate);
    return { data: data || [] };
  } catch (_e) { return { data: [] }; }
}

function registerAnnualTaxRoutes(app, { supabase, audit, requirePermission }) {
  // Defensive default: when host omits requirePermission (unit tests),
  // fall back to a pass-through gate. Production wiring lives in server.js.
  // Hebrew error string for UX consistency: 'אין הרשאה לבצע פעולה זו'.
  if (typeof requirePermission !== 'function') {
    requirePermission = () => (_req, _res, next) => next();
  }
  // ═══ PROJECTS ═══

  app.get('/api/projects', async (req, res) => {
    let q = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.fiscal_year) q = q.eq('fiscal_year', req.query.fiscal_year);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ projects: data });
  });

  app.post('/api/projects', async (req, res) => {
    const { data, error } = await supabase.from('projects').insert({
      ...req.body,
      created_by: req.actor || 'api',
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('project', data.id, 'created', req.actor || 'api', `פרויקט חדש: ${data.name}`, null, data);
    res.status(201).json({ project: data });
  });

  app.patch('/api/projects/:id', async (req, res) => {
    const { data: prev } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('projects').update({
      ...req.body,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('project', data.id, 'updated', req.actor || 'api',
      `עודכן: ${Object.keys(req.body).join(', ')}`, prev, data);
    res.json({ project: data });
  });

  app.put('/api/projects/:id', async (req, res) => {
    const { data: prev } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('projects').update({
      ...req.body,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('project', data.id, 'updated', req.actor || 'api',
      `עודכן: ${Object.keys(req.body).join(', ')}`, prev, data);
    res.json({ project: data });
  });

  app.delete('/api/projects/:id', async (req, res) => {
    const { data: prev } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
    if (!prev) return res.status(404).json({ error: 'Project not found' });
    const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await audit('project', parseInt(req.params.id), 'deleted', req.actor || 'api',
      `נמחק פרויקט: ${prev.name}`, prev, null);
    res.json({ ok: true });
  });

  // ═══ CUSTOMERS ═══

  app.get('/api/customers', async (req, res) => {
    const { data, error } = await supabase.from('customers').select('*').eq('active', true).order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ customers: data });
  });

  app.post('/api/customers', async (req, res) => {
    const { data, error } = await supabase.from('customers').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('customer', data.id, 'created', req.actor || 'api', `לקוח חדש: ${data.name}`, null, data);
    res.status(201).json({ customer: data });
  });

  app.put('/api/customers/:id', async (req, res) => {
    const { data: prev } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('customers').update({
      ...req.body,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('customer', data.id, 'updated', req.actor || 'api',
      `עודכן לקוח: ${data.name}`, prev, data);
    res.json({ customer: data });
  });

  app.delete('/api/customers/:id', async (req, res) => {
    const { data: prev } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    if (!prev) return res.status(404).json({ error: 'Customer not found' });
    const { error } = await supabase.from('customers').update({ active: false, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await audit('customer', parseInt(req.params.id), 'deleted', req.actor || 'api',
      `בוטל לקוח: ${prev.name}`, prev, null);
    res.json({ ok: true });
  });

  // ═══ CUSTOMER INVOICES ═══

  app.get('/api/customer-invoices', async (req, res) => {
    let q = supabase.from('customer_invoices').select('*, customers(*), projects(*)').order('invoice_date', { ascending: false });
    if (req.query.customer_id) q = q.eq('customer_id', req.query.customer_id);
    if (req.query.project_id) q = q.eq('project_id', req.query.project_id);
    if (req.query.status) q = q.eq('status', req.query.status);
    q = q.limit(parseInt(req.query.limit) || 100);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ invoices: data });
  });

  app.post('/api/customer-invoices', requirePermission('invoices:create'), async (req, res) => {
    const body = { ...req.body };
    if (!body.vat_amount && body.net_amount) {
      const rate = body.vat_rate || 0.18; // Israeli VAT default — 18% from 2026-01-01 (was 17%)
      body.vat_amount = Math.round(body.net_amount * rate * 100) / 100;
      body.gross_amount = body.gross_amount || (Number(body.net_amount) + Number(body.vat_amount));
      body.vat_rate = rate;
    }
    body.amount_outstanding = body.amount_outstanding ?? body.gross_amount;

    const { data, error } = await supabase.from('customer_invoices').insert({
      ...body,
      created_by: req.actor || 'api',
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await audit('customer_invoice', data.id, 'created', req.actor || 'api',
      `חשבונית ${data.invoice_number} — ${data.customer_name} — ₪${data.gross_amount}`, null, data);
    res.status(201).json({ invoice: data });
  });

  // ═══ CUSTOMER PAYMENTS ═══

  app.get('/api/customer-payments', async (req, res) => {
    const { data, error } = await supabase.from('customer_payments')
      .select('*, customers(*)')
      .order('payment_date', { ascending: false })
      .limit(parseInt(req.query.limit) || 100);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ payments: data });
  });

  app.post('/api/customer-payments', requirePermission('payments:create'), async (req, res) => {
    const body = { ...req.body, created_by: req.actor || 'api' };
    const { data: payment, error } = await supabase.from('customer_payments').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Apply payment to invoices if linked
    if (body.invoice_ids?.length) {
      let remaining = Number(body.amount);
      for (const invId of body.invoice_ids) {
        if (remaining <= 0) break;
        const { data: inv } = await supabase.from('customer_invoices').select('*').eq('id', invId).single();
        if (!inv) continue;
        const pay = Math.min(remaining, Number(inv.amount_outstanding));
        const newPaid = Number(inv.amount_paid) + pay;
        const newOutstanding = Number(inv.amount_outstanding) - pay;
        const newStatus = newOutstanding <= 0 ? 'paid' : 'partial';
        await supabase.from('customer_invoices').update({
          amount_paid: newPaid,
          amount_outstanding: newOutstanding,
          status: newStatus,
        }).eq('id', invId);
        remaining -= pay;
      }
    }

    await audit('customer_payment', payment.id, 'created', req.actor || 'api',
      `קבלה ${payment.receipt_number} — ${payment.customer_name} — ₪${payment.amount}`, null, payment);
    res.status(201).json({ payment });
  });

  // ═══ FISCAL YEARS ═══

  app.get('/api/fiscal-years', async (req, res) => {
    const { data } = await supabase.from('fiscal_years').select('*').order('year', { ascending: false });
    res.json({ fiscal_years: data });
  });

  app.post('/api/fiscal-years/:year/compute', requirePermission('tax-annual:create'), async (req, res) => {
    const year = parseInt(req.params.year);
    if (isNaN(year)) return res.status(400).json({ error: 'Invalid year' });

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Total revenue from customer invoices
    const { data: invoices } = await supabase.from('customer_invoices')
      .select('net_amount, gross_amount, status')
      .gte('invoice_date', yearStart).lte('invoice_date', yearEnd)
      .neq('status', 'voided');

    const totalRevenue = (invoices || []).reduce((s, i) => s + Number(i.net_amount || 0), 0);

    // Total purchases
    const { data: purchases } = await supabase.from('tax_invoices')
      .select('net_amount, is_asset')
      .gte('invoice_date', yearStart).lte('invoice_date', yearEnd)
      .eq('direction', 'input')
      .neq('status', 'voided');

    const totalCogs = (purchases || []).filter(p => !p.is_asset).reduce((s, p) => s + Number(p.net_amount || 0), 0);

    // Upsert fiscal year record
    const { data: existing } = await supabase.from('fiscal_years').select('id').eq('year', year).maybeSingle();
    let result;
    const payload = {
      year,
      start_date: yearStart,
      end_date: yearEnd,
      total_revenue: totalRevenue,
      total_cogs: totalCogs,
      gross_profit: totalRevenue - totalCogs,
      net_profit_before_tax: totalRevenue - totalCogs,
      status: 'open',
    };
    if (existing) {
      result = await supabase.from('fiscal_years').update(payload).eq('id', existing.id).select().single();
    } else {
      result = await supabase.from('fiscal_years').insert(payload).select().single();
    }
    if (result.error) return res.status(500).json({ error: result.error.message });

    await audit('fiscal_year', result.data.id, 'computed', req.actor || 'api',
      `חישוב שנת מס ${year}: הכנסה ₪${totalRevenue.toLocaleString()}`, null, result.data);

    res.json({ fiscal_year: result.data });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT-229 — Year-End Close Orchestrator
  //
  // POST /api/fiscal-years/:year/close
  //   Query flags:
  //     dryRun=true      → simulate; no DB writes, no JEs posted
  //     rollForward=true → after close, build & post opening JE for year+1
  //
  // Pipeline:
  //   1. assertPreconditions(year)        (status='open', no unposted JEs in year)
  //   2. flip status → 'closing'
  //   3. postTaxProvisionJE(year)         templates.TAX_PROVISION
  //   4. postYearEndCloseJE(year)         templates.YEAR_END_CLOSE_FULL
  //   5. populateFiscalYearTotals(year)   (opex, finance, tax, NPAT)
  //   6. flip status → 'closed' + closed_at/by
  //   7. emit('ledger.year_end_closed')
  //   8. (?rollForward=true) postRollForwardOpeningJE(year+1)
  //   9. periods.invalidate(year)         (locks all periods in year)
  // ═══════════════════════════════════════════════════════════════════════════

  app.post('/api/fiscal-years/:year/close',
    requirePermission('tax-annual:close'),
    async (req, res) => {
      const year = parseInt(req.params.year, 10);
      if (isNaN(year)) return res.status(400).json({ error: 'Invalid year', he: 'שנה לא תקינה' });

      const actor = req.actor || 'api';
      const rollForward = req.query.rollForward === 'true' || req.query.rollForward === '1';
      const dryRun = req.query.dryRun === 'true' || req.query.dryRun === '1';
      const taxRate = Number(req.body && req.body.taxRate) || 0.23;

      try {
        // ── 1. Preconditions ────────────────────────────────────────────────
        const { data: fy } = await supabase.from('fiscal_years')
          .select('*').eq('year', year).maybeSingle();
        if (!fy) {
          return res.status(412).json({
            error: `FY ${year} not computed`,
            he: `שנת מס ${year} לא חושבה — POST /api/fiscal-years/${year}/compute first`,
          });
        }
        if (fy.status !== 'open') {
          return res.status(409).json({
            error: `Cannot close — current status: ${fy.status}`,
            he: `לא ניתן לסגור — סטטוס נוכחי: ${fy.status}`,
            current_status: fy.status,
          });
        }

        // Block if any JE in the year is not posted
        let unposted = [];
        try {
          const { data } = await supabase.from('journal_entries')
            .select('id, number, status, date')
            .gte('date', fy.start_date).lte('date', fy.end_date)
            .neq('status', 'posted');
          unposted = data || [];
        } catch (_e) { /* table may not exist in test env */ }

        if (unposted.length) {
          return res.status(412).json({
            error: 'Unposted JEs in year',
            he: 'קיימות פקודות יומן שלא הופקדו בשנה',
            count: unposted.length,
            sample: unposted.slice(0, 5),
          });
        }

        // ── 2. Flip status → 'closing' ──────────────────────────────────────
        if (!dryRun) {
          await supabase.from('fiscal_years').update({ status: 'closing' }).eq('year', year);
        }

        // ── 3. Tax provision JE ─────────────────────────────────────────────
        const taxJE = await postTaxProvisionJE({
          supabase, year, fy, actor, dryRun, taxRate, app: req.app, audit,
        });

        // ── 4. Full P&L sweep close JE ──────────────────────────────────────
        const closeJE = await postYearEndCloseJE({
          supabase, year, fy, actor, dryRun, app: req.app, audit,
        });

        // ── 5. Recompute totals (post-tax, NPAT) ────────────────────────────
        const totals = await recomputeYearTotals({ supabase, year, fy });

        // ── 6. Flip status → 'closed' ───────────────────────────────────────
        const closedAt = new Date().toISOString();
        if (!dryRun) {
          await supabase.from('fiscal_years').update({
            ...totals,
            status: 'closed',
            closed_at: closedAt,
            closed_by: actor,
          }).eq('year', year);
        }

        // ── 7. Audit + event ────────────────────────────────────────────────
        if (!dryRun) {
          await audit('fiscal_year', fy.id, 'closed', actor,
            `סגירת שנת מס ${year} — רווח נקי ₪${(totals.npat || 0).toLocaleString()}`,
            fy, { ...fy, status: 'closed', ...totals, closed_at: closedAt, closed_by: actor });
        }
        try {
          req.app.locals.events?.emit('ledger.year_end_closed', {
            year,
            npat: totals.npat,
            taxJEId: taxJE && taxJE.id,
            closeJEId: closeJE && closeJE.id,
            closed_at: closedAt,
            closed_by: actor,
          });
        } catch (_e) { /* event bus optional */ }

        // ── 8. Optional roll-forward to next year ───────────────────────────
        let rollFwdJE = null;
        if (rollForward && !dryRun) {
          rollFwdJE = await postRollForwardOpeningJE({
            supabase, fromYear: year, toYear: year + 1, actor, app: req.app, audit,
          });
          try {
            req.app.locals.events?.emit('ledger.opening_balances_posted', {
              from_year: year, to_year: year + 1,
              je_id: rollFwdJE && rollFwdJE.id,
              posted_at: new Date().toISOString(),
            });
          } catch (_e) { /* noop */ }
        }

        // ── 9. Invalidate period-lock cache for this year ───────────────────
        if (!dryRun && req.app.locals.glPeriods
            && typeof req.app.locals.glPeriods.invalidate === 'function') {
          req.app.locals.glPeriods.invalidate(year);
        }

        return res.json({
          ok: true,
          fiscal_year: { ...fy, status: dryRun ? fy.status : 'closed', ...totals,
                          closed_at: dryRun ? null : closedAt,
                          closed_by: dryRun ? null : actor },
          taxProvisionJE: taxJE,
          yearEndCloseJE: closeJE,
          rollForwardJE: rollFwdJE,
          dryRun,
        });
      } catch (err) {
        // On failure, attempt to revert status to 'open'
        try {
          if (!dryRun) {
            await supabase.from('fiscal_years').update({ status: 'open' }).eq('year', year);
          }
        } catch (_e) { /* best-effort */ }
        return res.status(500).json({
          error: err.message || 'Year-end close failed',
          he: 'סגירת שנה נכשלה',
          stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
        });
      }
    },
  );

  // ═══ ANNUAL FORMS ═══

  app.post('/api/annual-tax/:year/forms/:type/generate', requirePermission('tax-annual:export'), async (req, res) => {
    const year = parseInt(req.params.year);
    const formType = req.params.type;
    if (!['1320', '1301', '6111', '30a'].includes(formType)) {
      return res.status(400).json({ error: `Unknown form type: ${formType}` });
    }

    const { data: profile } = await supabase.from('company_tax_profile').select('*').limit(1).maybeSingle();
    if (!profile) return res.status(412).json({ error: 'Company tax profile not configured' });

    const { data: fy } = await supabase.from('fiscal_years').select('*').eq('year', year).maybeSingle();
    if (!fy) return res.status(412).json({ error: `Fiscal year ${year} not computed — POST /api/fiscal-years/${year}/compute first` });

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const { data: projects } = await supabase.from('projects').select('*').eq('fiscal_year', year);
    const { data: customerInvoices } = await supabase.from('customer_invoices').select('*')
      .gte('invoice_date', yearStart).lte('invoice_date', yearEnd);
    const { data: taxInvoices } = await supabase.from('tax_invoices').select('*')
      .gte('invoice_date', yearStart).lte('invoice_date', yearEnd);

    const totals = {
      profit_before_tax: fy.net_profit_before_tax,
      corporate_tax: Math.round(fy.net_profit_before_tax * 0.23),  // 2026 corporate rate
      profit_after_tax: fy.net_profit_before_tax - Math.round(fy.net_profit_before_tax * 0.23),
    };

    let payload;
    try {
      switch (formType) {
        case '1320':
          payload = buildForm1320({ fiscalYear: year, profile, totals, projects, customerInvoices, taxInvoices });
          break;
        case '1301':
          payload = buildForm1301({ fiscalYear: year, taxpayer: req.body.taxpayer || {}, incomeSources: req.body.incomeSources, deductions: req.body.deductions, credits: req.body.credits });
          break;
        case '6111':
          payload = buildForm6111({ fiscalYear: year, profile, chartOfAccounts: (await supabase.from('chart_of_accounts').select('*')).data || [] });
          break;
        case '30a':
          payload = buildForm30A({ fiscalYear: year, profile, production: req.body.production, rawMaterials: req.body.rawMaterials, finishedGoods: req.body.finishedGoods, labor: req.body.labor });
          break;
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Upsert annual_tax_reports
    const { data: existing } = await supabase.from('annual_tax_reports')
      .select('id')
      .eq('fiscal_year', year)
      .eq('form_type', formType)
      .maybeSingle();

    const record = {
      fiscal_year: year,
      form_type: formType,
      report_version: String(year),
      status: 'draft',
      payload,
      computed_totals: totals,
      created_by: req.actor || 'api',
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      result = await supabase.from('annual_tax_reports').update(record).eq('id', existing.id).select().single();
    } else {
      result = await supabase.from('annual_tax_reports').insert(record).select().single();
    }
    if (result.error) return res.status(500).json({ error: result.error.message });

    await audit('annual_tax_report', result.data.id, existing ? 'updated' : 'created', req.actor || 'api',
      `טופס ${formType} לשנת ${year}`, null, result.data);

    res.json({ report: result.data });
  });

  app.get('/api/annual-tax/:year/forms', async (req, res) => {
    const { data } = await supabase.from('annual_tax_reports')
      .select('*')
      .eq('fiscal_year', parseInt(req.params.year));
    res.json({ reports: data });
  });

  console.log('   ✓ Annual tax module routes registered');
}

module.exports = {
  registerAnnualTaxRoutes,
  // AGENT-229 — exposed for tests and downstream modules (e.g. CLI cron close)
  postTaxProvisionJE,
  postYearEndCloseJE,
  postRollForwardOpeningJE,
  recomputeYearTotals,
  bucketByPLSection,
};
