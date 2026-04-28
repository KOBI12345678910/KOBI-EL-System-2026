/**
 * Bank Reconciliation module — Express routes
 * Wave 1.5 — B-11 fix
 */

'use strict';

const { autoParse } = require('./parsers');
const { autoReconcileBatch } = require('./matcher');
const { parseStatement: parseMultiFormat, detectFormat } = require('./multi-format-parser');

// Agent 224: wire detectAnomalies() into the bank-statement post-parse path.
// Bridge is loaded lazily so unit tests of bank-routes can run in isolation.
let _anomalyBridge = null;
function getAnomalyBridge() {
  if (_anomalyBridge !== null) return _anomalyBridge;
  try { _anomalyBridge = require('../ml/anomaly-bridge'); }
  catch { _anomalyBridge = false; }
  return _anomalyBridge;
}

function registerBankRoutes(app, { supabase, audit, requirePermission, createNotificationForAllUsers }) {
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

  app.post('/api/bank/accounts/:id/import', requirePermission('bank-statements:import'), async (req, res) => {
    // BUG-13 fix: validate bank account exists before importing
    const { data: acct } = await supabase.from('bank_accounts').select('id').eq('id', req.params.id).maybeSingle();
    if (!acct) return res.status(404).json({ error: 'Bank account not found' });

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
    // QA-04-BANK-01 fix: explicitly set reconciled fields on insert
    const txRows = parsed.transactions.map(tx => ({
      bank_account_id: parseInt(req.params.id),
      bank_statement_id: statement.id,
      transaction_date: tx.transaction_date,
      description: tx.description,
      amount: tx.amount,
      balance_after: tx.balance_after,
      reference_number: tx.reference_number,
      raw_data: tx.raw_data,
      reconciled: false,
      reconciled_at: null,
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

    // Agent 224: run anomaly detection on the parsed transactions.
    // Failure here is non-fatal — the import response still ships normally.
    let anomalyResult = null;
    try {
      const bridge = getAnomalyBridge();
      if (bridge && parsed.transactions && parsed.transactions.length > 0) {
        anomalyResult = await bridge.detectAndPersist(
          parsed.transactions,
          { supabase, createNotificationForAllUsers },
          { entity: 'bank_transactions' },
        );
      }
    } catch (e) {
      console.warn('[bank-routes] anomaly detection failed:', e && e.message);
    }

    // BUG-15 fix: use DB row values, not parser values that may be 0
    res.status(201).json({
      statement,
      imported: inserted.length,
      period: parsed.period,
      openingBalance: statement.opening_balance,
      closingBalance: statement.closing_balance,
      anomalies: anomalyResult && anomalyResult.persisted
        ? {
            inserted: anomalyResult.persisted.inserted,
            critical: anomalyResult.persisted.criticalCount,
            skipped:  anomalyResult.persisted.skipped,
          }
        : null,
    });
  });

  // Agent 224: dedicated multi-format endpoint that exercises
  // multi-format-parser.js directly (OFX / QIF / CAMT.053 / PDF / CSV-IL)
  // and pipes the result through the anomaly bridge.
  app.post('/api/bank/multi-format/parse', async (req, res) => {
    const { content, format } = req.body || {};
    if (!content) return res.status(400).json({ error: 'content required' });

    const buffer = Buffer.isBuffer(content)
      ? content
      : (typeof content === 'string'
          ? Buffer.from(content, 'utf8')
          : (content.base64 ? Buffer.from(content.base64, 'base64') : Buffer.from(String(content))));

    let transactions;
    try {
      transactions = await parseMultiFormat(buffer, format || detectFormat(buffer));
    } catch (e) {
      return res.status(422).json({ error: `Parse failed: ${e.message}` });
    }

    let anomalyResult = null;
    try {
      const bridge = getAnomalyBridge();
      if (bridge && transactions.length > 0) {
        anomalyResult = await bridge.detectAndPersist(
          transactions,
          { supabase, createNotificationForAllUsers },
          { entity: 'bank_transactions' },
        );
      }
    } catch (e) {
      console.warn('[bank-routes] multi-format anomaly run failed:', e && e.message);
    }

    res.json({
      format: format || detectFormat(buffer),
      count: transactions.length,
      transactions,
      anomalies: anomalyResult && anomalyResult.persisted
        ? {
            inserted: anomalyResult.persisted.inserted,
            critical: anomalyResult.persisted.criticalCount,
            skipped:  anomalyResult.persisted.skipped,
          }
        : null,
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

  app.post('/api/bank/accounts/:id/auto-reconcile', requirePermission('bank-reconciliation:create'), async (req, res) => {
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

  app.post('/api/bank/matches', requirePermission('bank-reconciliation:create'), async (req, res) => {
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

  // ═══ LIST MATCHES ═══

  app.get('/api/bank/matches', async (req, res) => {
    let q = supabase.from('reconciliation_matches').select('*').order('created_at', { ascending: false });
    if (req.query.bank_transaction_id) q = q.eq('bank_transaction_id', req.query.bank_transaction_id);
    if (req.query.approved === 'true') q = q.eq('approved', true);
    if (req.query.approved === 'false') q = q.eq('approved', false);
    q = q.limit(parseInt(req.query.limit) || 200);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ matches: data });
  });

  // ═══ APPROVE / REJECT MATCH ═══

  app.post('/api/bank/matches/:matchId/:action', requirePermission('bank-reconciliation:update'), async (req, res) => {
    const { matchId, action } = req.params;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }

    const { data: match, error: fetchErr } = await supabase
      .from('reconciliation_matches').select('*').eq('id', matchId).single();
    if (fetchErr || !match) return res.status(404).json({ error: 'Match not found' });

    if (action === 'approve') {
      const { error } = await supabase.from('reconciliation_matches').update({
        approved: true,
        approved_by: req.actor || 'api',
        approved_at: new Date().toISOString(),
      }).eq('id', matchId);
      if (error) return res.status(500).json({ error: error.message });

      // Mark bank transaction as reconciled
      await supabase.from('bank_transactions').update({
        reconciled: true,
        reconciled_at: new Date().toISOString(),
        reconciled_by: req.actor || 'api',
        matched_to_type: match.target_type,
        matched_to_id: String(match.target_id),
        match_confidence: match.confidence,
      }).eq('id', match.bank_transaction_id);

      await audit('reconciliation_match', parseInt(matchId), 'approved', req.actor || 'api',
        `אושרה התאמה #${matchId}`, null, match);
    } else {
      const { error } = await supabase.from('reconciliation_matches').update({
        approved: false,
      }).eq('id', matchId);
      if (error) return res.status(500).json({ error: error.message });

      await audit('reconciliation_match', parseInt(matchId), 'rejected', req.actor || 'api',
        `נדחתה התאמה #${matchId}`, null, match);
    }

    res.json({ ok: true, action, matchId });
  });

  // ═══ DISCREPANCIES ═══

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
