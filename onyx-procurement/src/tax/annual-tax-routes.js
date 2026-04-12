/**
 * Annual Tax module — Express routes
 * Wave 1.5 — B-10 fix
 */

'use strict';

const { buildForm1320, buildForm1301, buildForm6111, buildForm30A } = require('./form-builders');

function registerAnnualTaxRoutes(app, { supabase, audit }) {
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

  app.post('/api/customer-invoices', async (req, res) => {
    const body = { ...req.body };
    if (!body.vat_amount && body.net_amount) {
      const rate = body.vat_rate || 0.17;
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

  app.post('/api/customer-payments', async (req, res) => {
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

  app.post('/api/fiscal-years/:year/compute', async (req, res) => {
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

  // ═══ ANNUAL FORMS ═══

  app.post('/api/annual-tax/:year/forms/:type/generate', async (req, res) => {
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

module.exports = { registerAnnualTaxRoutes };
