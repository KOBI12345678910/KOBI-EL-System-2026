/**
 * Bank Reconciliation module — Express routes
 * Wave 1.5 — B-11 fix
 */

'use strict';

const { autoParse } = require('./parsers');
const { autoReconcileBatch } = require('./matcher');

function registerBankRoutes(app, { supabase, audit }) {
  // ═══ BANK ACCOUNTS ═══

  app.get('/api/bank/accounts', async (req, res) => {
    const { data, error } = await supabase.from('bank_accounts').select('*').order('is_primary', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ accounts: data });
  });

  app.post('/api/bank/accounts', async (req, res) => {
    const { data, error } = await supabase.from('bank_accounts').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('bank_account', data.id, 'created', req.actor || 'api',
      `חשבון בנק חדש: ${data.account_name} @ ${data.bank_name}`, null, data);
    res.status(201).json({ account: data });
  });

  app.patch('/api/bank/accounts/:id', async (req, res) => {
    const { data: prev } = await supabase.from('bank_accounts').select('*').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('bank_accounts').update({
      ...req.body,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('bank_account', data.id, 'updated', req.actor || 'api',
      `עודכן חשבון בנק`, prev, data);
    res.json({ account: data });
  });

  // ═══ IMPORT STATEMENT ═══

  app.post('/api/bank/accounts/:id/import', async (req, res) => {
    const { content, format, openingBalance } = req.body;
    if (!content) return res.status(400).json({ error: 'content (statement text) required' });

    let parsed;
    try {
      parsed = autoParse(content, format);
    } catch (err) {
      return res.status(422).json({ error: `Parse failed: ${err.message}` });
    }

    // Create statement header
    const { data: statement, error: stmtErr } = await supabase.from('bank_statements').insert({
      bank_account_id: req.params.id,
      statement_date: new Date().toISOString().slice(0, 10),
      period_start: parsed.period.start,
      period_end: parsed.period.end,
      opening_balance: openingBalance ?? parsed.openingBalance,
      closing_balance: parsed.closingBalance,
      transaction_count: parsed.transactions.length,
      source_format: parsed.meta.format,
      imported_by: req.actor || 'api',
      status: 'imported',
    }).select().single();
    if (stmtErr) return res.status(400).json({ error: stmtErr.message });

    // Insert transactions
    const txRows = parsed.transactions.map(tx => ({
      bank_account_id: parseInt(req.params.id),
      bank_statement_id: statement.id,
      transaction_date: tx.transaction_date,
      description: tx.description,
      amount: tx.amount,
      balance_after: tx.balance_after,
      reference_number: tx.reference_number,
      raw_data: tx.raw_data,
    }));

    const { data: inserted, error: txErr } = await supabase.from('bank_transactions').insert(txRows).select('id');
    if (txErr) {
      console.error('Transaction insert failed:', txErr);
      return res.status(500).json({ error: txErr.message });
    }

    // Update account balance
    await supabase.from('bank_accounts').update({
      current_balance: parsed.closingBalance,
      last_statement_date: parsed.period.end,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    await audit('bank_statement', statement.id, 'imported', req.actor || 'api',
      `יובאו ${inserted.length} תנועות בנק לחשבון ${req.params.id}`, null, statement);

    res.status(201).json({
      statement,
      imported: inserted.length,
      period: parsed.period,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
    });
  });

  // ═══ TRANSACTIONS ═══

  app.get('/api/bank/transactions', async (req, res) => {
    let q = supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false });
    if (req.query.account_id) q = q.eq('bank_account_id', req.query.account_id);
    if (req.query.reconciled === 'false') q = q.eq('reconciled', false);
    if (req.query.reconciled === 'true') q = q.eq('reconciled', true);
    q = q.limit(parseInt(req.query.limit) || 200);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ transactions: data });
  });

  // ═══ AUTO-RECONCILIATION ═══

  app.post('/api/bank/accounts/:id/auto-reconcile', async (req, res) => {
    // Load unreconciled transactions
    const { data: txs } = await supabase.from('bank_transactions')
      .select('*')
      .eq('bank_account_id', req.params.id)
      .eq('reconciled', false)
      .order('transaction_date', { ascending: false })
      .limit(500);

    if (!txs?.length) {
      return res.json({ suggestions: [], message: 'No unreconciled transactions found' });
    }

    // Load candidate pools
    const { data: invoices } = await supabase.from('customer_invoices')
      .select('id, invoice_number, customer_name, invoice_date, gross_amount, amount_outstanding')
      .neq('status', 'paid')
      .neq('status', 'voided');
    const { data: purchaseOrders } = await supabase.from('purchase_orders')
      .select('id, supplier_name, total, created_at')
      .eq('status', 'sent');

    const suggestions = autoReconcileBatch(txs, {
      customerInvoices: (invoices || []).map(i => ({ ...i, amount: i.amount_outstanding || i.gross_amount, date: i.invoice_date })),
      purchaseOrders: (purchaseOrders || []).map(p => ({ ...p, amount: p.total, date: p.created_at, counterparty_name: p.supplier_name })),
    });

    await audit('bank_reconciliation', parseInt(req.params.id), 'auto_matched', req.actor || 'api',
      `הוצעו ${suggestions.length} התאמות עבור ${txs.length} תנועות`, null, { suggestions: suggestions.length });

    res.json({
      checked: txs.length,
      suggestions,
      autoApproveThreshold: 0.95,
    });
  });

  app.post('/api/bank/matches', async (req, res) => {
    const { bank_transaction_id, target_type, target_id, matched_amount, confidence, match_criteria } = req.body;
    const { data, error } = await supabase.from('reconciliation_matches').insert({
      bank_transaction_id, target_type, target_id,
      matched_amount, confidence: confidence || 1.0,
      match_type: req.body.match_type || 'manual',
      match_criteria,
      approved: true,
      approved_by: req.actor || 'api',
      approved_at: new Date().toISOString(),
      created_by: req.actor || 'api',
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Mark bank_transaction as reconciled
    await supabase.from('bank_transactions').update({
      reconciled: true,
      reconciled_at: new Date().toISOString(),
      reconciled_by: req.actor || 'api',
      matched_to_type: target_type,
      matched_to_id: String(target_id),
      match_confidence: confidence || 1.0,
    }).eq('id', bank_transaction_id);

    await audit('reconciliation_match', data.id, 'created', req.actor || 'api',
      `התאמה: ${target_type}#${target_id} ₪${matched_amount}`, null, data);
    res.status(201).json({ match: data });
  });

  app.get('/api/bank/discrepancies', async (req, res) => {
    let q = supabase.from('reconciliation_discrepancies').select('*').order('created_at', { ascending: false });
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ discrepancies: data });
  });

  app.get('/api/bank/summary', async (req, res) => {
    const { data: summary } = await supabase.from('v_unreconciled_summary').select('*');
    res.json({ summary });
  });

  console.log('   ✓ Bank reconciliation routes registered');
}

module.exports = { registerBankRoutes };
