/**
 * Bank Reconciliation Auto-Matcher
 * Wave 1.5 — B-11 fix
 *
 * Heuristics to suggest matches between bank transactions and ledger entries.
 * Confidence score 0..1.
 */

'use strict';

/** Compute match confidence between bank tx and a ledger entry. */
function scoreMatch(bankTx, ledgerEntry, { type }) {
  let score = 0;
  let criteria = {};

  // Amount match (most important)
  const bankAmt = Math.abs(Number(bankTx.amount || 0));
  const ledgerAmt = Math.abs(Number(ledgerEntry.amount || ledgerEntry.gross_amount || ledgerEntry.total || 0));
  const amtDiff = Math.abs(bankAmt - ledgerAmt);
  const amtRatio = bankAmt > 0 ? amtDiff / bankAmt : 1;

  if (amtDiff < 0.01) {
    score += 0.6;
    criteria.amount = 'exact';
  } else if (amtRatio < 0.001) {
    score += 0.55;
    criteria.amount = 'near-exact';
  } else if (amtRatio < 0.01) {
    score += 0.4;
    criteria.amount = 'close';
  } else if (amtRatio < 0.05) {
    score += 0.2;
    criteria.amount = 'partial';
  } else {
    return { confidence: 0, criteria: { rejected: 'amount_mismatch', diff: amtDiff } };
  }

  // Date proximity
  const bankDate = new Date(bankTx.transaction_date);
  const ledgerDate = new Date(ledgerEntry.payment_date || ledgerEntry.invoice_date || ledgerEntry.date);
  const dayDiff = Math.abs((bankDate - ledgerDate) / (1000 * 60 * 60 * 24));
  if (dayDiff === 0) { score += 0.2; criteria.date = 'same_day'; }
  else if (dayDiff <= 1) { score += 0.15; criteria.date = 'within_1_day'; }
  else if (dayDiff <= 3) { score += 0.1; criteria.date = 'within_3_days'; }
  else if (dayDiff <= 7) { score += 0.05; criteria.date = 'within_week'; }
  else if (dayDiff > 30) { score -= 0.1; criteria.date = 'far_apart'; }

  // Name/description similarity
  const bankDesc = (bankTx.description || '').toLowerCase();
  const counterpartyName = (ledgerEntry.customer_name || ledgerEntry.supplier_name || ledgerEntry.counterparty_name || '').toLowerCase();
  if (counterpartyName && bankDesc.includes(counterpartyName.slice(0, 5))) {
    score += 0.15;
    criteria.name = 'substring_match';
  }

  // Reference number match
  if (ledgerEntry.reference_number && bankTx.reference_number) {
    if (ledgerEntry.reference_number === bankTx.reference_number) {
      score += 0.2;
      criteria.reference = 'exact';
    }
  }

  // Direction check
  if (type === 'customer_payment' && bankTx.amount < 0) {
    // Bank debit for customer payment doesn't make sense — customer pays in, we get a credit
    score -= 0.3;
    criteria.direction = 'wrong';
  }
  if (type === 'supplier_payment' && bankTx.amount > 0) {
    score -= 0.3;
    criteria.direction = 'wrong';
  }

  return {
    confidence: Math.max(0, Math.min(1, score)),
    criteria,
  };
}

/**
 * Find the best match for a bank transaction against candidate ledger entries.
 */
function findBestMatch(bankTx, candidates, type) {
  if (!candidates?.length) return null;

  const scored = candidates
    .map(c => ({ entry: c, ...scoreMatch(bankTx, c, { type }) }))
    .filter(s => s.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence);

  if (!scored.length) return null;
  return scored[0];
}

/**
 * Auto-reconcile a batch of bank transactions against a pool of candidates.
 * Returns array of suggested matches (NOT applied — caller must approve).
 */
function autoReconcileBatch(bankTransactions, candidatePools) {
  const suggestions = [];

  for (const tx of bankTransactions) {
    if (tx.reconciled) continue;

    let best = null;
    let bestType = null;

    // Customer payments (credit to us)
    if (tx.amount > 0 && candidatePools.customerInvoices) {
      const m = findBestMatch(tx, candidatePools.customerInvoices, 'customer_invoice');
      if (m && (!best || m.confidence > best.confidence)) { best = m; bestType = 'customer_invoice'; }
    }

    // Supplier payments (debit from us)
    if (tx.amount < 0 && candidatePools.purchaseOrders) {
      const m = findBestMatch(tx, candidatePools.purchaseOrders, 'supplier_payment');
      if (m && (!best || m.confidence > best.confidence)) { best = m; bestType = 'purchase_order'; }
    }

    if (best) {
      suggestions.push({
        bank_transaction_id: tx.id,
        target_type: bestType,
        target_id: best.entry.id,
        confidence: best.confidence,
        match_criteria: best.criteria,
        matched_amount: Math.abs(tx.amount),
        match_type: best.confidence >= 0.85 ? 'exact' : (best.confidence >= 0.6 ? 'partial' : 'suggested'),
      });
    }
  }

  return suggestions;
}

module.exports = {
  scoreMatch,
  findBestMatch,
  autoReconcileBatch,
};
