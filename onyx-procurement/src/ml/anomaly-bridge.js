/**
 * Anomaly Bridge — connects detectAnomalies() to the persistence + SSE layer.
 * Agent 224 — wires the previously-orphaned detector (AG-100, audited by AG-182)
 * into csv-import.js, multi-format-parser.js, and the payment-anomalies UI.
 *
 *   detector record   ──map──▶  payment_anomalies row  ──insert──▶  SSE event
 *
 * No runtime deps. Pure JS. Safe to require from both csv-import-routes.js
 * (validated invoice / bank rows) and bank-routes.js (parsed statements).
 */

'use strict';

const { detectAnomalies } = require('./anomaly-detector');

// ─────────────────────────────────────────────────────────────────
// Detector-key → UI-key mapping. The UI (payment-anomalies.tsx)
// understands a fixed set of anomaly_type values; the detector emits
// a different but equivalent vocabulary. We translate one to the
// other so the existing screen renders without any UI change.
// ─────────────────────────────────────────────────────────────────
const TYPE_MAP = Object.freeze({
  zscore:         'amount_anomaly',
  iqr:            'amount_anomaly',
  moving_average: 'amount_anomaly',
  seasonal:       'amount_anomaly',
  benford:        'amount_anomaly',
  duplicate:      'duplicate_payment',
  round_amount:   'amount_anomaly',
  time_of_day:    'after_hours',
  velocity:       'multiple_payments',
  geographic:     'amount_anomaly',
});

// Severity 1..10 (detector) → critical / warning / info (UI + DB).
function severityBucket(sev) {
  const n = Number(sev) || 0;
  if (n >= 8) return 'critical';
  if (n >= 4) return 'warning';
  return 'info';
}

// Stable dedupe hash so re-parsing the same file does not re-insert.
function dedupeHash(rec) {
  const parts = [
    rec.anomaly_type,
    rec.transaction_id || '',
    String(Math.round((rec.metric && rec.metric.amount) || 0)),
    rec.metric && rec.metric.date || '',
  ];
  // djb2
  let h = 5381;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `ag224-${h.toString(16)}`;
}

/**
 * Map a detector anomaly record + the original transaction into a row
 * shaped exactly like payment_anomalies expects.
 */
function toAnomalyRow(rec, tx) {
  const ui_type = TYPE_MAP[rec.anomaly_type] || 'amount_anomaly';
  const severity = severityBucket(rec.severity);
  const amount = Number((tx && tx.amount) || (rec.metric && rec.metric.amount) || 0);
  return {
    anomaly_type:     ui_type,
    detector_type:    rec.anomaly_type,        // raw detector tag, kept for audit
    severity,
    severity_score:   Number(rec.severity) || 0,
    title:            rec.explanation_he || rec.explanation_en || 'Anomaly detected',
    description:      rec.explanation_he || rec.explanation_en || '',
    supplier_name:    (tx && (tx.vendor || tx.counterparty)) || null,
    supplier_id:      (tx && tx.supplier_id) || null,
    amount,
    payment_date:     (tx && (tx.date || tx.transaction_date)) || null,
    payment_ref:      (tx && (tx.reference || tx.id)) || rec.transaction_id || null,
    recommendation:   rec.explanation_he ? 'בדוק את התנועה' : 'Review the transaction',
    status:           'open',
    confidence:       Number(rec.confidence) || 0,
    source:           'auto-detector',
    dedupe_hash:      dedupeHash(rec),
    metric:           rec.metric || null,
  };
}

/**
 * Persist an array of anomaly rows.
 *
 * Two persistence flavours are supported transparently:
 *   1. supabase client  (used from JS-side onyx-procurement routes)
 *   2. db.execute(sql)  (used from TS api-server) — caller passes
 *      `dbExecute` + `sql` instead of `supabase`.
 *
 * Returns { inserted, skipped, criticalCount, newCount }.
 */
async function persistAnomalies(rows, deps) {
  const out = { inserted: 0, skipped: 0, criticalCount: 0, newCount: 0, items: [] };
  if (!Array.isArray(rows) || rows.length === 0) return out;

  const { supabase, dbExecute, sql } = deps || {};

  for (const r of rows) {
    let alreadyExists = false;
    try {
      if (supabase && supabase.from) {
        const { data } = await supabase
          .from('payment_anomalies')
          .select('id')
          .eq('dedupe_hash', r.dedupe_hash)
          .limit(1);
        alreadyExists = Array.isArray(data) && data.length > 0;
      } else if (dbExecute && sql) {
        const res = await dbExecute(
          sql`SELECT id FROM payment_anomalies WHERE dedupe_hash=${r.dedupe_hash} LIMIT 1`
        );
        alreadyExists = ((res && res.rows) || []).length > 0;
      }
    } catch { /* table may not exist yet — caller is expected to have run ensureAnomalyTable() */ }

    if (alreadyExists) { out.skipped++; continue; }

    try {
      if (supabase && supabase.from) {
        const { data } = await supabase.from('payment_anomalies').insert(r).select('id').single();
        if (data) {
          out.inserted++;
          out.items.push({ id: data.id, severity: r.severity, anomaly_type: r.anomaly_type });
        }
      } else if (dbExecute && sql) {
        await dbExecute(sql`
          INSERT INTO payment_anomalies (
            anomaly_type, detector_type, severity, severity_score, title, description,
            supplier_name, supplier_id, amount, payment_date, payment_ref,
            recommendation, status, confidence, source, dedupe_hash, metric
          ) VALUES (
            ${r.anomaly_type}, ${r.detector_type}, ${r.severity}, ${r.severity_score},
            ${r.title}, ${r.description}, ${r.supplier_name}, ${r.supplier_id},
            ${r.amount}, ${r.payment_date}, ${r.payment_ref},
            ${r.recommendation}, ${r.status}, ${r.confidence}, ${r.source},
            ${r.dedupe_hash}, ${JSON.stringify(r.metric)}::jsonb
          )
          ON CONFLICT (dedupe_hash) DO NOTHING
        `);
        out.inserted++;
      }
      out.newCount++;
      if (r.severity === 'critical') out.criticalCount++;
    } catch (e) {
      // Persistence failures must never crash the import. Log and move on.
      // eslint-disable-next-line no-console
      console.warn('[anomaly-bridge] insert failed:', e && e.message);
      out.skipped++;
    }
  }
  return out;
}

/**
 * Fire SSE event `payment_anomaly_new` (or `_critical`) so the UI refreshes.
 * Uses the host app's notification service when available; otherwise no-op.
 */
async function emitAnomalySse(stats, deps) {
  if (!stats || stats.newCount === 0) return;
  const { createNotificationForAllUsers } = deps || {};
  if (typeof createNotificationForAllUsers !== 'function') return;

  const eventType = stats.criticalCount > 0
    ? 'payment_anomaly_critical'
    : 'payment_anomaly_new';

  const heTitle = stats.criticalCount > 0
    ? `${stats.criticalCount} חריגות תשלום קריטיות זוהו`
    : `${stats.newCount} חריגות תשלום חדשות`;

  const heMessage = stats.criticalCount > 0
    ? `מנוע הזיהוי האוטומטי זיהה ${stats.criticalCount} חריגות קריטיות חדשות — נדרשת בדיקה מיידית`
    : `מנוע הזיהוי האוטומטי זיהה ${stats.newCount} חריגות חדשות הדורשות בדיקה`;

  try {
    await createNotificationForAllUsers({
      type: eventType,
      title: heTitle,
      message: heMessage,
      priority: stats.criticalCount > 0 ? 'critical' : 'high',
      category: 'anomaly',
      actionUrl: '/finance/payment-anomalies',
      metadata: { source: 'auto-detector', inserted: stats.inserted, critical: stats.criticalCount },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[anomaly-bridge] SSE emit failed:', e && e.message);
  }
}

/**
 * Convert validated CSV / bank rows into transactions the detector understands.
 * Only finance-relevant entities are scanned — employees / suppliers etc. are
 * skipped automatically by returning [].
 */
function rowsToTransactions(rows, opts) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const entity = opts && opts.entity;

  return rows.map((r, idx) => {
    if (entity === 'invoices') {
      return {
        id:        r.invoice_number || `inv-${idx}`,
        vendor:    r.supplier_name || r.supplier_tax_id || 'unknown',
        category:  r.category || 'invoice',
        amount:    Number(r.amount_total || r.amount_net || 0),
        currency:  r.currency || 'ILS',
        date:      r.invoice_date,
      };
    }
    // bank_transactions, parsed bank statements, generic
    const amt = Number(r.amount || 0);
    return {
      id:        r.reference || r.reference_number || r.external_id || `tx-${idx}`,
      vendor:    r.counterparty || r.counterparty_name || r.description || 'unknown',
      category:  r.source_format || 'bank',
      amount:    Math.abs(amt),
      _signedAmount: amt,
      currency:  r.currency || 'ILS',
      date:      r.transaction_date || r.date,
      timestamp: r.timestamp || null,
    };
  });
}

/**
 * Top-level convenience: run detection, map, persist, emit SSE — in one call.
 * `runIfFinance` is a flag: callers (csv-import) only invoke this for
 * invoices / bank_transactions. Bank-routes always invokes.
 */
async function detectAndPersist(rows, deps, opts) {
  const transactions = rowsToTransactions(rows, opts);
  if (transactions.length === 0) return { ran: false };

  let detections;
  try {
    detections = detectAnomalies(transactions, (opts && opts.detectorOpts) || undefined);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[anomaly-bridge] detectAnomalies threw:', e && e.message);
    return { ran: true, detections: 0, persisted: { inserted: 0, skipped: 0 } };
  }
  if (!Array.isArray(detections) || detections.length === 0) {
    return { ran: true, detections: 0, persisted: { inserted: 0, skipped: 0 } };
  }

  const txById = new Map(transactions.map(t => [t.id, t]));
  const anomalyRows = detections
    .map(d => toAnomalyRow(d, txById.get(d.transaction_id)))
    .filter(Boolean);

  const persisted = await persistAnomalies(anomalyRows, deps);
  await emitAnomalySse(persisted, deps);
  return { ran: true, detections: detections.length, persisted };
}

module.exports = {
  detectAndPersist,
  rowsToTransactions,
  toAnomalyRow,
  persistAnomalies,
  emitAnomalySse,
  dedupeHash,
  severityBucket,
  TYPE_MAP,
};
