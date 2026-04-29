/**
 * Vendor Scoring Event Listener — AGENT-223 Patch 1
 * ==================================================
 *
 * Closes the loop opened by AGENT-183: the analytics module
 *   onyx-procurement/src/analytics/vendor-scoring.js
 * had zero production callers. This listener subscribes to the PO
 * receipt-side terminal events (per state-machines.js:144-170) and
 * triggers re-scoring for the supplier:
 *
 *   - procurement.po.fully_received
 *   - procurement.po.closed
 *   - procurement.po.received       (alias used by older emitters)
 *
 * Fire-and-forget. If scoring or persistence fails, we log a warning
 * and return — the PO-close path MUST NEVER throw because of scoring.
 *
 * Loads the supplier's last 24 months of:
 *   purchase_orders, payments, supplier_communications, vendor_score_history
 * and feeds it into scoreVendor() with `recentScores[]` extracted
 * from the score-history table (drives DECLINING_TREND risk).
 */

'use strict';

const { scoreVendor } = require('../analytics/vendor-scoring');
const { persistScore } = require('../suppliers/score-persistence');

const HISTORY_MONTHS = 24;

/**
 * Wire the vendor-scoring re-score handler onto the in-process EventBus.
 *
 * @param {object} params
 * @param {object} params.bus        in-process EventBus (domain-events.js)
 * @param {object} params.supabase   Supabase client
 * @param {object} [params.logger]   pino-style logger (defaults to console)
 * @returns {{ok:boolean, eventsBound?:number, reason?:string}}
 */
function registerVendorScoringListener({ bus, supabase, logger = console }) {
  if (!bus || !supabase) {
    return { ok: false, reason: 'bus and supabase required' };
  }

  const handler = async (evt) => {
    const supplierId =
      (evt && evt.payload && (evt.payload.supplierId || evt.payload.supplier_id)) ||
      null;
    if (!supplierId) return;

    try {
      const history = await loadSupplierHistory(supabase, supplierId);
      const score = scoreVendor(String(supplierId), history);
      await persistScore(supabase, supplierId, score);
      logger.info(
        { supplierId, composite: score.composite, badge: score.badge },
        'vendor.rescored'
      );
    } catch (err) {
      // Fire-and-forget — never throw into the PO close path.
      logger.warn(
        { err: err && err.message, supplierId },
        'vendor.rescore.failed'
      );
    }
  };

  const events = [
    'procurement.po.fully_received',
    'procurement.po.closed',
    'procurement.po.received',
  ];
  for (const e of events) {
    try {
      bus.on(e, handler);
    } catch (err) {
      logger.warn(
        { err: err && err.message, event: e },
        'vendor.rescore.bind_failed'
      );
    }
  }

  return { ok: true, eventsBound: events.length };
}

/**
 * Pull the per-supplier history needed by scoreVendor().
 *
 * Returns the shape consumed by analytics/vendor-scoring.js:
 *   { purchaseOrders, payments, communications, recentScores }
 *
 * Items are flattened from purchase_orders.items[] so each row carries
 * both PO-level (ordered/promised/delivered/urgent/payment_days) and
 * line-level (id) attributes. This matches the test fixtures the
 * 32-case suite relies on.
 *
 * @param {object} supabase
 * @param {string|number} supplierId
 * @returns {Promise<object>}
 */
async function loadSupplierHistory(supabase, supplierId) {
  const since = new Date(
    Date.now() - HISTORY_MONTHS * 30 * 24 * 3600 * 1000
  ).toISOString();

  const [pos, pay, comm, hist] = await Promise.all([
    supabase
      .from('procurement.purchase_orders')
      .select(
        'id, supplier_id, ordered_at, promised_at, delivered_at, urgent, total_amount, payment_days, items'
      )
      .eq('supplier_id', supplierId)
      .gte('ordered_at', since),
    supabase
      .from('procurement.payments')
      .select('id, supplier_id, net_days')
      .eq('supplier_id', supplierId),
    supabase
      .from('procurement.supplier_communications')
      .select('id, request_at, response_at')
      .eq('supplier_id', supplierId),
    supabase
      .from('procurement.vendor_score_history')
      .select('composite')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: true })
      .limit(5),
  ]);

  const purchaseOrders = ((pos && pos.data) || []).flatMap((p) =>
    Array.isArray(p.items) && p.items.length > 0
      ? p.items.map((it) => ({
          ...p,
          ...it,
          id: `${p.id}-${(it && it.id) || 'all'}`,
        }))
      : [{ ...p, id: `${p.id}-all` }]
  );

  return {
    purchaseOrders,
    payments: (pay && pay.data) || [],
    communications: (comm && comm.data) || [],
    recentScores: ((hist && hist.data) || []).map((r) => r.composite),
  };
}

module.exports = {
  registerVendorScoringListener,
  // exported for the nightly-vendor-rescore cron (jobs-registry.js)
  __loadSupplierHistory: loadSupplierHistory,
};
