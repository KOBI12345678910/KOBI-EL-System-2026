/**
 * Bank Reconciliation module — Express routes
 * Wave 1.5 — B-11 fix
 *
 * Agent 227 — auto-reconcile path now drives the persistent engine
 * (`src/bank/reconciliation.js`) through the persistence adapter
 * (`src/bank/recon-persistence.js`).  Legacy `matcher.js` is no
 * longer imported here; the file is kept on disk with a deprecation
 * banner per the never-delete rule.
 */

'use strict';

const { autoParse } = require('./parsers');
const { parseStatement: parseMultiFormat, detectFormat } = require('./multi-format-parser');
const engine = require('./reconciliation');
const {
  hydrateSession,
  persistSession,
  persistGLEntries,
  persistMatch,
  persistAdjustment,
  persistAudit,
  persistAll,
  rememberId,
  resolveEngineId,
} = require('./recon-persistence');

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

  // ═══ AUTO-RECONCILIATION (Agent 227 — engine-driven, persistent) ═══

  app.post('/api/bank/accounts/:id/auto-reconcile',
    requirePermission('bank-reconciliation:create'), async (req, res) => {
    try {
      // Default period: trailing 31 days unless caller specifies
      const period = req.body && req.body.period ? req.body.period : {
        from: (req.body && req.body.from) || new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10),
        to:   (req.body && req.body.to)   || new Date().toISOString().slice(0, 10),
      };

      const reconId = engine.startReconciliation(req.params.id, period);
      rememberId(reconId, reconId);

      // Bank entries — use the actual integer ids so persistMatch can
      // round-trip them back to bank_transactions on
      // reconcile/un-reconcile flips.
      const { data: txs } = await supabase.from('bank_transactions')
        .select('*')
        .eq('bank_account_id', req.params.id)
        .eq('reconciled', false)
        .limit(500);

      if (!txs?.length) {
        await persistSession(supabase, reconId);
        return res.json({
          recon_id: reconId, checked: 0, matched: 0, unmatched: 0, suspicious: 0,
          message: 'No unreconciled transactions found',
        });
      }

      engine.importStatement(reconId, (txs || []).map(t => ({
        id: 'btx-db-' + t.id,
        amount: Number(t.amount),
        transaction_date: t.transaction_date,
        description: t.description,
        reference: t.reference_number,
        external_id: String(t.id),
      })));

      // GL pool — open invoices + sent POs
      const { data: invoices } = await supabase.from('customer_invoices')
        .select('id, invoice_number, customer_name, invoice_date, gross_amount, amount_outstanding')
        .neq('status', 'paid')
        .neq('status', 'voided');
      const { data: pos } = await supabase.from('purchase_orders')
        .select('id, supplier_name, total, created_at')
        .eq('status', 'sent');

      engine.loadGLEntries(reconId, [
        ...(invoices || []).map(i => ({
          id: 'inv-' + i.id,
          amount: i.amount_outstanding || i.gross_amount,
          transaction_date: i.invoice_date,
          description: i.invoice_number,
          counterparty_name: i.customer_name,
        })),
        ...(pos || []).map(p => ({
          id: 'po-' + p.id,
          amount: -Number(p.total),
          transaction_date: p.created_at,
          counterparty_name: p.supplier_name,
        })),
      ]);

      const stats = engine.runAutoMatch(reconId);
      await persistAll(supabase, reconId);

      await audit('bank_reconciliation', parseInt(req.params.id), 'auto_matched', req.actor || 'api',
        `התאמה אוטומטית: ${stats.matched} התאמות, ${stats.unmatched} לא תואמו`,
        null, { reconId, stats });

      res.json({
        recon_id: reconId,
        checked: txs.length,
        ...stats,
        status: engine.getStatus(reconId),
        autoApproveThreshold: 0.95,
      });
    } catch (e) {
      console.error('[auto-reconcile] failed:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  /api/finance/reconciliation/*   (Agent 227 — engine endpoints)
  // ═══════════════════════════════════════════════════════════════

  // Start a fresh reconciliation session.
  app.post('/api/finance/reconciliation/start',
    requirePermission('bank-reconciliation:create'), async (req, res) => {
    try {
      const { bank_account_id, period } = req.body || {};
      if (!bank_account_id) return res.status(400).json({ error: 'bank_account_id required' });
      if (!period || !period.from || !period.to) {
        return res.status(400).json({ error: 'period {from,to} required' });
      }

      // Active-session lock — refuse a duplicate draft for the same
      // (account, period) pair, keeping the engine map and DB in lockstep.
      const { data: existing } = await supabase.from('reconciliation_sessions')
        .select('id, status')
        .eq('bank_account_id', bank_account_id)
        .eq('period_from', period.from)
        .eq('period_to', period.to)
        .in('status', ['draft', 'in_progress'])
        .maybeSingle();
      if (existing) {
        return res.status(409).json({
          error: 'active reconciliation exists for this period',
          recon_id: existing.id,
          status: existing.status,
        });
      }

      const reconId = engine.startReconciliation(bank_account_id, period);
      rememberId(reconId, reconId);
      await persistSession(supabase, reconId);
      const snap = engine.getReconciliation(reconId);
      for (const e of snap.audit) await persistAudit(supabase, reconId, e);

      res.status(201).json({ recon_id: reconId, status: engine.getStatus(reconId) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Import bank statement rows into an existing session.
  app.post('/api/finance/reconciliation/:id/import',
    requirePermission('bank-reconciliation:create'), async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);

      const { content, format, transactions } = req.body || {};
      let txs = transactions;

      if (!txs && content) {
        // Try the multi-format parser first, fall back to autoParse
        try {
          const buf = Buffer.from(String(content), 'utf8');
          txs = await parseMultiFormat(buf, format || detectFormat(buf));
        } catch {
          txs = autoParse(content, format).transactions;
        }
      }
      if (!Array.isArray(txs)) {
        return res.status(400).json({ error: 'transactions[] or content required' });
      }

      const count = engine.importStatement(engineId, txs.map((t, i) => ({
        id: t.id || ('btx-import-' + Date.now() + '-' + i),
        amount: Number(t.amount),
        transaction_date: t.transaction_date || t.date,
        description: t.description,
        reference: t.reference || t.reference_number,
      })));
      await persistSession(supabase, persistedId);
      const snap = engine.getReconciliation(engineId);
      for (const e of snap.audit) await persistAudit(supabase, persistedId, e);

      res.json({ recon_id: persistedId, imported: count, status: engine.getStatus(engineId) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Push GL rows into the engine's frozen ledger snapshot.
  app.post('/api/finance/reconciliation/:id/load-gl',
    requirePermission('bank-reconciliation:create'), async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);
      const rows = (req.body && req.body.rows) || req.body;
      if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows[] required' });

      const count = engine.loadGLEntries(engineId, rows);
      await persistGLEntries(supabase, persistedId);
      await persistSession(supabase, persistedId);

      res.json({ recon_id: persistedId, loaded: count });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Run the multi-pass auto-match ladder.
  app.post('/api/finance/reconciliation/:id/auto-match',
    requirePermission('bank-reconciliation:create'), async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);

      const stats = engine.runAutoMatch(engineId);
      await persistAll(supabase, persistedId);

      res.json({ recon_id: persistedId, ...stats, status: engine.getStatus(engineId) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Manual bank<->GL pair match.
  app.post('/api/finance/reconciliation/:id/manual-match',
    requirePermission('bank-reconciliation:create'), async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);
      const { bankEntryId, glEntryId } = req.body || {};
      if (!bankEntryId || !glEntryId) {
        return res.status(400).json({ error: 'bankEntryId and glEntryId required' });
      }
      const m = engine.manualMatch(engineId, glEntryId, bankEntryId);
      await persistMatch(supabase, persistedId, m);
      await persistSession(supabase, persistedId);
      const snap = engine.getReconciliation(engineId);
      for (const e of snap.audit.slice(-2)) await persistAudit(supabase, persistedId, e);

      res.json({ match: m, status: engine.getStatus(engineId) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Undo a match — never deletes; flips undone=true.
  app.post('/api/finance/reconciliation/:id/match/:matchId/undo',
    requirePermission('bank-reconciliation:update'), async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);
      engine.undoMatch(engineId, req.params.matchId);
      const snap = engine.getReconciliation(engineId);
      const undone = snap.matches.find(m => m.id === req.params.matchId);
      if (undone) await persistMatch(supabase, persistedId, undone);
      await persistSession(supabase, persistedId);
      for (const e of snap.audit.slice(-1)) await persistAudit(supabase, persistedId, e);

      res.json({ recon_id: persistedId, undone: req.params.matchId, status: engine.getStatus(engineId) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Add a bank-fee / interest / FX adjustment.
  app.post('/api/finance/reconciliation/:id/adjustment',
    requirePermission('bank-reconciliation:create'), async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);
      const adj = engine.addAdjustment(engineId, req.body || {});
      await persistAdjustment(supabase, persistedId, adj);
      await persistSession(supabase, persistedId);
      const snap = engine.getReconciliation(engineId);
      for (const e of snap.audit.slice(-1)) await persistAudit(supabase, persistedId, e);

      res.status(201).json({ adjustment: adj, status: engine.getStatus(engineId) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Lock the session — requires balanced + zero unmatched.
  app.post('/api/finance/reconciliation/:id/complete',
    requirePermission('bank-reconciliation:update'), async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);
      const userId = (req.body && req.body.userId) || req.actor || 'api';
      const result = engine.complete(engineId, userId);
      await persistSession(supabase, persistedId);
      const snap = engine.getReconciliation(engineId);
      for (const e of snap.audit.slice(-1)) await persistAudit(supabase, persistedId, e);

      await audit('bank_reconciliation_session', 0, 'completed', req.actor || 'api',
        `סשן התאמה ${persistedId} ננעל`, null, result);

      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Read-only snapshot for the UI.
  app.get('/api/finance/reconciliation/:id', async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);
      const snap = engine.getReconciliation(engineId);
      const status = engine.getStatus(engineId);
      res.json({ ...snap, recon_id: persistedId, status });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.get('/api/finance/reconciliation/:id/status', async (req, res) => {
    try {
      const persistedId = req.params.id;
      const engineId = await hydrateSession(supabase, persistedId);
      res.json(engine.getStatus(engineId));
    } catch (e) {
      // Fall back to DB row if the engine cannot hydrate.
      const { data } = await supabase.from('reconciliation_sessions')
        .select('*').eq('id', req.params.id).maybeSingle();
      if (!data) return res.status(404).json({ error: 'session not found' });
      res.json({
        recon_id: data.id,
        status: data.status,
        matched_count: data.matched_count,
        unmatched_count: data.unmatched_count,
        suspicious_count: data.suspicious_count,
        difference: data.difference,
        is_balanced: data.is_balanced,
      });
    }
  });

  // List all sessions — DB-backed via the migration-008 rollup view.
  app.get('/api/finance/reconciliation/sessions', async (req, res) => {
    let q = supabase.from('v_reconciliation_status').select('*').order('created_at', { ascending: false });
    if (req.query.account_id) q = q.eq('bank_account_id', req.query.account_id);
    if (req.query.status)     q = q.eq('status', req.query.status);
    q = q.limit(parseInt(req.query.limit) || 100);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ sessions: data });
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
