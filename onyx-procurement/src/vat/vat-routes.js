/**
 * VAT module — Express routes
 * Wave 1.5 — B-09 fix
 *
 * Endpoints:
 *   GET    /api/vat/profile              — company tax profile
 *   PUT    /api/vat/profile              — update profile
 *   GET    /api/vat/periods              — list periods
 *   POST   /api/vat/periods              — open new period
 *   GET    /api/vat/periods/:id          — detail + computed totals
 *   POST   /api/vat/periods/:id/close    — compute + lock period
 *   POST   /api/vat/periods/:id/submit   — build PCN836 + record submission
 *   GET    /api/vat/periods/:id/pcn836   — download PCN836 file
 *   GET    /api/vat/invoices             — list tax invoices
 *   POST   /api/vat/invoices             — record invoice
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { buildPcn836File, validatePcn836File } = require('./pcn836');

function registerVatRoutes(app, { supabase, audit, requireAuth, VAT_RATE }) {
  const PCN836_ARCHIVE_DIR = process.env.PCN836_ARCHIVE_DIR || path.join(__dirname, '..', '..', 'data', 'pcn836');

  // Ensure archive dir exists
  try {
    fs.mkdirSync(PCN836_ARCHIVE_DIR, { recursive: true });
  } catch {}

  // ═══ PROFILE ═══

  app.get('/api/vat/profile', async (req, res) => {
    const { data, error } = await supabase.from('company_tax_profile').select('*').limit(1).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ profile: data });
  });

  app.put('/api/vat/profile', async (req, res) => {
    const existing = await supabase.from('company_tax_profile').select('id').limit(1).maybeSingle();
    let result;
    if (existing.data?.id) {
      result = await supabase.from('company_tax_profile')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', existing.data.id)
        .select()
        .single();
    } else {
      result = await supabase.from('company_tax_profile').insert(req.body).select().single();
    }
    if (result.error) return res.status(400).json({ error: result.error.message });
    await audit('tax_profile', result.data.id, existing.data ? 'updated' : 'created', req.actor || 'api',
      'פרופיל מס עודכן', null, result.data);
    res.json({ profile: result.data });
  });

  // ═══ PERIODS ═══

  app.get('/api/vat/periods', async (req, res) => {
    const { data, error } = await supabase.from('vat_periods')
      .select('*')
      .order('period_start', { ascending: false })
      .limit(parseInt(req.query.limit) || 24);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ periods: data });
  });

  app.post('/api/vat/periods', async (req, res) => {
    const { period_start, period_end, period_label } = req.body;
    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'period_start and period_end required' });
    }
    const label = period_label || period_start.slice(0, 7);
    const { data, error } = await supabase.from('vat_periods').insert({
      period_start, period_end, period_label: label, status: 'open',
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('vat_period', data.id, 'created', req.actor || 'api', `תקופת מע"מ ${label}`, null, data);
    res.status(201).json({ period: data });
  });

  app.get('/api/vat/periods/:id', async (req, res) => {
    const { data: period, error } = await supabase.from('vat_periods').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Period not found' });

    // Compute totals from tax_invoices
    const { data: outputs } = await supabase.from('tax_invoices')
      .select('net_amount, vat_amount, is_asset, is_zero_rate, is_exempt')
      .eq('vat_period_id', req.params.id)
      .eq('direction', 'output')
      .neq('status', 'voided');
    const { data: inputs } = await supabase.from('tax_invoices')
      .select('net_amount, vat_amount, is_asset, is_zero_rate, is_exempt')
      .eq('vat_period_id', req.params.id)
      .eq('direction', 'input')
      .neq('status', 'voided');

    const outs = outputs || [];
    const ins = inputs || [];

    const computed = {
      taxable_sales: outs.filter(i => !i.is_exempt && !i.is_zero_rate).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      zero_rate_sales: outs.filter(i => i.is_zero_rate).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      exempt_sales: outs.filter(i => i.is_exempt).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      vat_on_sales: outs.reduce((s, i) => s + Number(i.vat_amount || 0), 0),
      taxable_purchases: ins.filter(i => !i.is_asset).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      vat_on_purchases: ins.filter(i => !i.is_asset).reduce((s, i) => s + Number(i.vat_amount || 0), 0),
      asset_purchases: ins.filter(i => i.is_asset).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      vat_on_assets: ins.filter(i => i.is_asset).reduce((s, i) => s + Number(i.vat_amount || 0), 0),
    };
    computed.net_vat_payable = computed.vat_on_sales - computed.vat_on_purchases - computed.vat_on_assets;
    computed.is_refund = computed.net_vat_payable < 0;

    res.json({
      period,
      computed,
      counts: { outputs: outs.length, inputs: ins.length },
    });
  });

  app.post('/api/vat/periods/:id/close', async (req, res) => {
    // Get period + compute via previous handler logic
    const { data: period } = await supabase.from('vat_periods').select('*').eq('id', req.params.id).single();
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (period.status !== 'open') return res.status(409).json({ error: `Period is ${period.status}, cannot close` });

    const { data: outputs } = await supabase.from('tax_invoices').select('net_amount,vat_amount,is_asset,is_zero_rate,is_exempt')
      .eq('vat_period_id', req.params.id).eq('direction', 'output').neq('status', 'voided');
    const { data: inputs } = await supabase.from('tax_invoices').select('net_amount,vat_amount,is_asset,is_zero_rate,is_exempt')
      .eq('vat_period_id', req.params.id).eq('direction', 'input').neq('status', 'voided');

    const outs = outputs || []; const ins = inputs || [];
    const totals = {
      taxable_sales: outs.filter(i => !i.is_exempt && !i.is_zero_rate).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      zero_rate_sales: outs.filter(i => i.is_zero_rate).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      exempt_sales: outs.filter(i => i.is_exempt).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      vat_on_sales: outs.reduce((s, i) => s + Number(i.vat_amount || 0), 0),
      taxable_purchases: ins.filter(i => !i.is_asset).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      vat_on_purchases: ins.filter(i => !i.is_asset).reduce((s, i) => s + Number(i.vat_amount || 0), 0),
      asset_purchases: ins.filter(i => i.is_asset).reduce((s, i) => s + Number(i.net_amount || 0), 0),
      vat_on_assets: ins.filter(i => i.is_asset).reduce((s, i) => s + Number(i.vat_amount || 0), 0),
    };
    totals.net_vat_payable = totals.vat_on_sales - totals.vat_on_purchases - totals.vat_on_assets;
    totals.is_refund = totals.net_vat_payable < 0;

    const { data: updated, error } = await supabase.from('vat_periods').update({
      ...totals,
      status: 'closing',
      locked_at: new Date().toISOString(),
      prepared_by: req.actor || 'api',
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    await audit('vat_period', req.params.id, 'closed', req.actor || 'api',
      `תקופה ${period.period_label} נסגרה — נטו ₪${totals.net_vat_payable.toFixed(2)}`, period, updated);

    res.json({ period: updated, totals });
  });

  app.post('/api/vat/periods/:id/submit', async (req, res) => {
    const { data: period } = await supabase.from('vat_periods').select('*').eq('id', req.params.id).single();
    if (!period) return res.status(404).json({ error: 'Period not found' });
    if (period.status === 'submitted') return res.status(409).json({ error: 'Period already submitted' });

    const { data: profile } = await supabase.from('company_tax_profile').select('*').limit(1).maybeSingle();
    if (!profile) return res.status(412).json({ error: 'Company tax profile not configured — PUT /api/vat/profile first' });

    const { data: outputInvoices } = await supabase.from('tax_invoices').select('*')
      .eq('vat_period_id', req.params.id).eq('direction', 'output').neq('status', 'voided');
    const { data: inputInvoices } = await supabase.from('tax_invoices').select('*')
      .eq('vat_period_id', req.params.id).eq('direction', 'input').neq('status', 'voided');

    // Build PCN836 file
    const file = buildPcn836File({
      companyProfile: profile,
      period,
      inputInvoices: inputInvoices || [],
      outputInvoices: outputInvoices || [],
      submission: { type: req.body.submission_type || 'initial', date: new Date() },
    });

    const errors = validatePcn836File(file);
    if (errors.length) return res.status(422).json({ error: 'PCN836 validation failed', details: errors });

    // Archive to disk — write the windows-1255 encoded Buffer directly
    // (BUG-08 fix: previously wrote JS string with 'binary' encoding which corrupted Hebrew)
    const archivePath = path.join(PCN836_ARCHIVE_DIR, file.metadata.filename);
    try {
      fs.writeFileSync(archivePath, file.buffer);
    } catch (err) {
      console.error('Could not archive PCN836:', err);
    }

    // Record submission
    const { data: submission, error: subErr } = await supabase.from('vat_submissions').insert({
      vat_period_id: req.params.id,
      submission_type: req.body.submission_type || 'initial',
      submission_method: req.body.submission_method || 'shamat',
      submitted_by: req.actor || req.body.submitted_by || 'api',
      pcn836_header: { companyProfile: profile, metadata: file.metadata },
      pcn836_records: { lines: file.lines },
      pcn836_total_records: file.lines.length,
      pcn836_file_checksum: file.metadata.fileChecksum,
      pcn836_file_path: archivePath,
      status: 'submitted',
    }).select().single();
    if (subErr) return res.status(500).json({ error: subErr.message });

    // Update period
    await supabase.from('vat_periods').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      pcn836_file_path: archivePath,
    }).eq('id', req.params.id);

    await audit('vat_submission', submission.id, 'submitted', req.actor || 'api',
      `PCN836 נוצר עבור ${period.period_label} — ${file.lines.length} רשומות`, null, submission);

    res.status(201).json({
      submission,
      metadata: file.metadata,
      archivePath,
      preview: file.lines.slice(0, 5),
    });
  });

  app.get('/api/vat/periods/:id/pcn836', async (req, res) => {
    const { data: period } = await supabase.from('vat_periods').select('pcn836_file_path,period_label').eq('id', req.params.id).single();
    if (!period || !period.pcn836_file_path) {
      return res.status(404).json({ error: 'PCN836 file not generated for this period' });
    }
    if (!fs.existsSync(period.pcn836_file_path)) {
      return res.status(410).json({ error: 'PCN836 file missing from archive' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=windows-1255');
    res.setHeader('Content-Disposition', `attachment; filename="PCN836_${period.period_label}.TXT"`);
    fs.createReadStream(period.pcn836_file_path).pipe(res);
  });

  // ═══ INVOICES ═══

  app.get('/api/vat/invoices', async (req, res) => {
    let q = supabase.from('tax_invoices').select('*').order('invoice_date', { ascending: false });
    if (req.query.direction) q = q.eq('direction', req.query.direction);
    if (req.query.period_id) q = q.eq('vat_period_id', req.query.period_id);
    q = q.limit(parseInt(req.query.limit) || 100);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ invoices: data });
  });

  app.post('/api/vat/invoices', async (req, res) => {
    const body = { ...req.body };
    // Auto-fill vat_amount if not provided and net/gross given
    if (body.net_amount && !body.vat_amount && !body.is_exempt && !body.is_zero_rate) {
      const rate = body.vat_rate || VAT_RATE;
      body.vat_amount = Math.round(body.net_amount * rate * 100) / 100;
      body.gross_amount = body.gross_amount || (Number(body.net_amount) + Number(body.vat_amount));
      body.vat_rate = rate;
    }

    const { data, error } = await supabase.from('tax_invoices').insert(body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('tax_invoice', data.id, 'created', req.actor || 'api',
      `חשבונית ${body.direction}: ${body.invoice_number} — ₪${body.gross_amount}`, null, data);
    res.status(201).json({ invoice: data });
  });

  console.log('   ✓ VAT module routes registered');
}

module.exports = { registerVatRoutes };
