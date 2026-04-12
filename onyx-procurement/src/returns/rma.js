/**
 * RMA — Returns & Return Merchandise Authorization Engine
 * ========================================================
 * ניהול החזרות ואישורי החזרת סחורה (RMA)
 *
 * Agent X-32  |  Swarm 3B  |  Techno-Kol Uzi mega-ERP
 *
 * A zero-dependency, in-memory, auditable RMA engine that implements the
 * full 9-step RMA workflow expected by the Techno-Kol Uzi front-office:
 *
 *   1. Customer requests a return           → createRma()
 *   2. Reason codes (6)                     → REASON_CODES
 *   3. Approval (auto < 30 days, else man.) → approveRma()
 *   4. Ship-back label / instructions       → getShipBackInstructions()
 *   5. Receive returned item                → receiveReturn()
 *   6. Inspect (accept / reject)            → inspectItems()
 *   7. Restock / scrap / repair             → disposition on each line
 *   8. Credit note / refund / replacement   → processRefund()
 *   9. Close RMA                            → closeRma()
 *
 * Israeli consumer-law compliance (חוק הגנת הצרכן, התשמ"א-1981):
 *   • Right to cancel within 14 days of receipt for consumer purchases
 *   • Full refund minus restocking fee of 5% OR ₪100 — whichever is lower
 *   • Excluded items: perishables, custom-made, opened software, bespoke goods
 *   • B2B default window is 30 days unless the invoice specifies otherwise
 *
 * RULES
 *   • Zero dependencies — only `node:crypto` from the standard library
 *   • Bilingual (Hebrew + English) labels on every reason / status / event
 *   • NEVER deletes — every mutation is appended to the audit trail
 *   • Pure in-memory (injected `store` for persistence when wired to DB)
 *   • Real code, fully exercised by `test/payroll/rma.test.js`
 *
 * Public API (exports):
 *   createRma(customerId, invoiceId, items[], reason)           → rmaId
 *   approveRma(rmaId, approverId)                               → void
 *   receiveReturn(rmaId, receivedItems[])                       → void
 *   inspectItems(rmaId, inspections[])                          → void
 *   processRefund(rmaId, refundType)                            → creditNoteId
 *   closeRma(rmaId)                                             → void
 *   rejectRma(rmaId, reason)                                    → void
 *   getRmaStats(period)                                         → {count, top_reasons, avg_resolution_days}
 *
 * Helper / introspection exports (for tests + admin tooling):
 *   REASON_CODES, STATUS, DISPOSITION, CONDITION,
 *   getRma, listRmas, getAuditTrail, getShipBackInstructions,
 *   computeRestockingFee, isItemExcludedByConsumerLaw,
 *   createStore, setInvoiceGenerator, setInventoryHook,
 *   _internal
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════
// 1.  CONSTANTS — REASON CODES / STATUS / DISPOSITION / CONDITION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Six canonical reason codes. Each is bilingual.
 * Front-office may extend the dictionary at runtime; these are the defaults.
 */
const REASON_CODES = Object.freeze({
  DEFECTIVE: {
    code: 'defective',
    label_he: 'פגום / לא תקין',
    label_en: 'Defective',
    auto_approvable: true,
  },
  WRONG_ITEM: {
    code: 'wrong_item',
    label_he: 'פריט שגוי נשלח',
    label_en: 'Wrong item shipped',
    auto_approvable: true,
  },
  WRONG_QTY: {
    code: 'wrong_qty',
    label_he: 'כמות שגויה',
    label_en: 'Wrong quantity',
    auto_approvable: true,
  },
  DAMAGED_TRANSIT: {
    code: 'damaged_in_transit',
    label_he: 'נפגם במשלוח',
    label_en: 'Damaged in transit',
    auto_approvable: true,
  },
  CHANGED_MIND: {
    code: 'customer_changed_mind',
    label_he: 'הלקוח התחרט',
    label_en: 'Customer changed mind',
    auto_approvable: true, // within window only
  },
  WARRANTY: {
    code: 'warranty_claim',
    label_he: 'תביעת אחריות',
    label_en: 'Warranty claim',
    auto_approvable: false, // always manual (needs service desk review)
  },
});

/**
 * RMA lifecycle status — 9 states. State transitions are validated.
 */
const STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  SHIPPED_BACK: 'shipped_back',
  RECEIVED: 'received',
  INSPECTED: 'inspected',
  PROCESSED: 'processed',
  CLOSED: 'closed',
  REJECTED: 'rejected',
});

/**
 * Legal transitions — any transition not listed here will throw.
 * Forward progression only; once CLOSED or REJECTED, the RMA is terminal.
 */
const LEGAL_TRANSITIONS = Object.freeze({
  draft: ['pending_approval', 'approved', 'rejected'],
  pending_approval: ['approved', 'rejected'],
  approved: ['shipped_back', 'received', 'rejected'],
  shipped_back: ['received', 'rejected'],
  received: ['inspected', 'rejected'],
  inspected: ['processed', 'rejected'],
  processed: ['closed'],
  closed: [],
  rejected: [],
});

/**
 * Disposition for an inspected line — decides inventory action.
 */
const DISPOSITION = Object.freeze({
  RESTOCK: 'restock', // goes back into sellable stock
  SCRAP: 'scrap', // write-off
  REPAIR: 'repair', // send to repair bench
  REPLACE: 'replace', // ship a replacement to the customer
});

/**
 * Physical condition reported at the receiving bay.
 */
const CONDITION = Object.freeze({
  NEW: 'new', // unopened, sellable
  OPEN_BOX: 'open_box', // opened but unused
  USED: 'used', // clearly used
  DAMAGED: 'damaged', // physical damage
  DEFECTIVE: 'defective', // electronic fault
});

/**
 * Refund types handled by processRefund().
 */
const REFUND_TYPES = Object.freeze({
  CREDIT_NOTE: 'credit_note', // default — issues a credit-note invoice
  REFUND: 'refund', // money back to original payment method
  REPLACEMENT: 'replacement', // ship a fresh unit, no money movement
});

// ═══════════════════════════════════════════════════════════════════════
// 2.  CONSUMER-LAW EXCLUSIONS (חוק הגנת הצרכן, התשמ"א-1981)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Categories that are excluded from the 14-day right-of-return under
 * Israeli consumer law. The Techno-Kol item taxonomy uses these category
 * codes; anything not in this set is eligible for the 14-day window.
 */
const EXCLUDED_CATEGORIES = Object.freeze([
  'perishable', // food, flowers, medical
  'custom', // made-to-order
  'opened_software', // once the seal is broken
  'digital_download', // DLC, licence keys
  'intimate', // swimwear, underwear, earrings
  'newspaper', // time-sensitive printed matter
]);

/**
 * Policy windows (in days) — defaults.
 */
const DEFAULT_POLICY = Object.freeze({
  CONSUMER_WINDOW_DAYS: 14, // חוק הגנת הצרכן
  B2B_WINDOW_DAYS: 30, // default B2B window
  AUTO_APPROVAL_DAYS: 30, // auto-approve anything < this many days old
  RESTOCKING_FEE_PCT: 0.05, // 5%
  RESTOCKING_FEE_CAP: 100, // ₪100 cap
});

// ═══════════════════════════════════════════════════════════════════════
// 3.  STORE — in-memory persistence layer
// ═══════════════════════════════════════════════════════════════════════

/**
 * Creates an isolated store. Each store is a unit of persistence: tests
 * use their own store so they stay independent.
 *
 * When wired to a real database, pass a store that implements the same
 * interface: put(collection, id, row), get(collection, id), list(collection).
 */
function createStore() {
  const rmas = new Map(); // rmaId -> RMA
  const lines = new Map(); // rmaId -> Line[]
  const audit = new Map(); // rmaId -> AuditEvent[]
  const sequence = new Map(); // "YYYYMM" -> int

  return {
    rmas,
    lines,
    audit,
    nextSequence(ym) {
      const cur = sequence.get(ym) || 0;
      const next = cur + 1;
      sequence.set(ym, next);
      return next;
    },
  };
}

// module-level default store — tests may override by passing `store`
let _defaultStore = createStore();

/**
 * Replace the default store. Used by tests and by the server bootstrap.
 */
function _setDefaultStore(store) {
  _defaultStore = store;
}

// ═══════════════════════════════════════════════════════════════════════
// 4.  EXTERNAL HOOKS — invoice generator + inventory
// ═══════════════════════════════════════════════════════════════════════

/**
 * Default credit-note generator. Production wires this to the real
 * invoice-generator module; tests supply a stub that records the call.
 */
let _invoiceGenerator = function defaultInvoiceGenerator(rma, amount) {
  // Minimal synthetic credit-note identifier, deterministic per RMA id.
  const noteId = 'CN-' + rma.rma_number;
  return {
    id: noteId,
    rma_id: rma.id,
    customer_id: rma.customer_id,
    invoice_id: rma.invoice_id,
    amount_ils: amount,
    issued_at: new Date().toISOString(),
  };
};

function setInvoiceGenerator(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('setInvoiceGenerator requires a function');
  }
  _invoiceGenerator = fn;
}

/**
 * Default inventory hook. Production wires this to the inventory module.
 * Returns an array of {action, item_id, qty} records for inspection by tests.
 */
let _inventoryHook = function defaultInventoryHook(op) {
  return op; // echo — replaced in production
};

function setInventoryHook(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('setInventoryHook requires a function');
  }
  _inventoryHook = fn;
}

// ═══════════════════════════════════════════════════════════════════════
// 5.  UTILITIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a deterministic-ish unique id. Zero-dep, no UUID lib.
 */
function newId(prefix) {
  // crypto.randomBytes is built-in — counts as zero-dep
  return prefix + '-' + crypto.randomBytes(6).toString('hex');
}

/**
 * Format a Date (or ISO string) → "YYYYMM" string.
 */
function toYearMonth(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

/**
 * Format an RMA number: RMA-YYYYMM-NNNN.
 * Sequence is zero-padded to 4 digits; wraps gracefully at 10000+.
 */
function formatRmaNumber(ym, seq) {
  const n = String(seq).padStart(4, '0');
  return `RMA-${ym}-${n}`;
}

/**
 * Number of whole days between two dates (b - a), floored.
 */
function daysBetween(a, b) {
  const ad = a instanceof Date ? a : new Date(a);
  const bd = b instanceof Date ? b : new Date(b);
  const ms = bd.getTime() - ad.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Bankers'-round to 2 decimals — avoids the classic 0.1+0.2 drift.
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve reason input → canonical reason object. Accepts the code string
 * or a full reason object. Throws on unknown codes.
 */
function resolveReason(reasonInput) {
  if (!reasonInput) {
    throw new Error('RMA: reason is required');
  }
  if (typeof reasonInput === 'string') {
    for (const v of Object.values(REASON_CODES)) {
      if (v.code === reasonInput) return v;
    }
    throw new Error(`RMA: unknown reason code "${reasonInput}"`);
  }
  if (typeof reasonInput === 'object' && reasonInput.code) {
    // Revalidate against dictionary — unknown codes are rejected
    for (const v of Object.values(REASON_CODES)) {
      if (v.code === reasonInput.code) return v;
    }
    throw new Error(`RMA: unknown reason code "${reasonInput.code}"`);
  }
  throw new Error('RMA: reason must be a code string or a reason object');
}

/**
 * Append an audit-trail event for a given RMA.
 * NEVER-DELETE rule: events are append-only. No purge method exists.
 */
function appendAudit(store, rmaId, eventType, labelHe, labelEn, meta) {
  const events = store.audit.get(rmaId) || [];
  events.push({
    id: newId('evt'),
    rma_id: rmaId,
    event: eventType,
    label_he: labelHe,
    label_en: labelEn,
    meta: meta || {},
    at: new Date().toISOString(),
  });
  store.audit.set(rmaId, events);
}

/**
 * Guarded state transition. Throws on illegal moves.
 */
function transition(store, rma, nextStatus, labelHe, labelEn, meta) {
  const legal = LEGAL_TRANSITIONS[rma.status] || [];
  if (!legal.includes(nextStatus)) {
    throw new Error(
      `RMA: illegal transition ${rma.status} → ${nextStatus} for ${rma.rma_number}`
    );
  }
  const prev = rma.status;
  rma.status = nextStatus;
  appendAudit(store, rma.id, 'transition', labelHe, labelEn, {
    from: prev,
    to: nextStatus,
    ...(meta || {}),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 6.  POLICY CHECKS — consumer law + auto-approval
// ═══════════════════════════════════════════════════════════════════════

/**
 * Returns true iff the given item category is excluded from the
 * consumer-law 14-day return window.
 */
function isItemExcludedByConsumerLaw(item) {
  if (!item) return false;
  if (item.excluded === true) return true;
  const cat = (item.category || '').toLowerCase();
  return EXCLUDED_CATEGORIES.includes(cat);
}

/**
 * Compute the restocking fee under Israeli consumer law.
 * 5% of the item total, but never more than ₪100.
 * Defective / wrong-item / damaged-in-transit waive the fee entirely.
 */
function computeRestockingFee(reason, totalIls, policy) {
  const p = policy || DEFAULT_POLICY;
  const r = typeof reason === 'string' ? reason : reason && reason.code;
  // No fee for anything that is the seller's fault
  const waived = new Set([
    REASON_CODES.DEFECTIVE.code,
    REASON_CODES.WRONG_ITEM.code,
    REASON_CODES.WRONG_QTY.code,
    REASON_CODES.DAMAGED_TRANSIT.code,
    REASON_CODES.WARRANTY.code,
  ]);
  if (waived.has(r)) return 0;
  const pct = totalIls * p.RESTOCKING_FEE_PCT;
  return round2(Math.min(pct, p.RESTOCKING_FEE_CAP));
}

/**
 * Decide whether an RMA qualifies for auto-approval.
 * Rules:
 *   • Warranty claims never auto-approve
 *   • Invoice age > auto-approval window → manual
 *   • B2C past 14 days → manual (consumer law exhausted)
 *   • Anything left → auto
 */
function _shouldAutoApprove(rma, invoice, policy) {
  const p = policy || DEFAULT_POLICY;
  const reason = resolveReason(rma.reason);
  if (!reason.auto_approvable) return false;

  const invoiceDate = invoice && invoice.issued_at
    ? new Date(invoice.issued_at)
    : new Date(rma.created_at);
  const age = daysBetween(invoiceDate, new Date(rma.created_at));

  if (age > p.AUTO_APPROVAL_DAYS) return false;

  const isConsumer = invoice && invoice.customer_type === 'consumer';
  if (isConsumer && age > p.CONSUMER_WINDOW_DAYS) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// 7.  PUBLIC API — createRma / approve / receive / inspect / refund / close
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a new RMA.
 *
 * @param {string}  customerId
 * @param {string}  invoiceId
 * @param {Array}   items          list of {item_id, qty, unit_price_ils, category?, ...}
 * @param {string|object} reason   reason code or full reason object
 * @param {object}  [opts]
 * @param {object}  [opts.store]   store instance (defaults to module-level)
 * @param {object}  [opts.invoice] invoice record (for policy / age checks)
 * @param {object}  [opts.policy]  override DEFAULT_POLICY
 * @returns {string} rmaId
 */
function createRma(customerId, invoiceId, items, reason, opts) {
  if (!customerId) throw new Error('RMA: customerId is required');
  if (!invoiceId) throw new Error('RMA: invoiceId is required');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('RMA: items[] must be a non-empty array');
  }
  const resolvedReason = resolveReason(reason);

  const store = (opts && opts.store) || _defaultStore;
  const policy = (opts && opts.policy) || DEFAULT_POLICY;
  const invoice = opts && opts.invoice;

  // Excluded-items gate (consumer law)
  if (invoice && invoice.customer_type === 'consumer') {
    const excluded = items.filter(isItemExcludedByConsumerLaw);
    if (excluded.length === items.length) {
      throw new Error(
        'RMA: all requested items are excluded from 14-day consumer return (חוק הגנת הצרכן)'
      );
    }
  }

  const now = new Date();
  const ym = toYearMonth(now);
  const seq = store.nextSequence(ym);
  const rmaNumber = formatRmaNumber(ym, seq);
  const rmaId = newId('rma');

  const rma = {
    id: rmaId,
    customer_id: customerId,
    invoice_id: invoiceId,
    rma_number: rmaNumber,
    status: STATUS.DRAFT,
    reason: resolvedReason.code,
    reason_label_he: resolvedReason.label_he,
    reason_label_en: resolvedReason.label_en,
    created_at: now.toISOString(),
    approved_at: null,
    received_at: null,
    closed_at: null,
    policy: { ...policy },
    invoice_snapshot: invoice
      ? {
          customer_type: invoice.customer_type,
          issued_at: invoice.issued_at,
          total_ils: invoice.total_ils,
        }
      : null,
  };

  const lines = items.map((it) => ({
    id: newId('ln'),
    rma_id: rmaId,
    item_id: it.item_id,
    description: it.description || '',
    category: it.category || '',
    qty_requested: Number(it.qty) || 0,
    qty_received: 0,
    unit_price_ils: round2(Number(it.unit_price_ils) || 0),
    condition: null,
    disposition: null,
    refund_amount: 0,
    excluded_consumer_law: isItemExcludedByConsumerLaw(it),
  }));

  store.rmas.set(rmaId, rma);
  store.lines.set(rmaId, lines);
  appendAudit(
    store,
    rmaId,
    'created',
    'RMA נוצר',
    'RMA created',
    {
      rma_number: rmaNumber,
      reason: resolvedReason.code,
      line_count: lines.length,
    }
  );

  // Auto-approval / pending-approval decision
  if (_shouldAutoApprove(rma, invoice, policy)) {
    transition(
      store,
      rma,
      STATUS.APPROVED,
      'אישור אוטומטי',
      'Auto-approved',
      { auto: true }
    );
    rma.approved_at = new Date().toISOString();
  } else {
    transition(
      store,
      rma,
      STATUS.PENDING_APPROVAL,
      'ממתין לאישור ידני',
      'Pending manual approval',
      { auto: false }
    );
  }

  return rmaId;
}

/**
 * Approve an RMA manually. Allowed from draft / pending_approval.
 */
function approveRma(rmaId, approverId, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = _mustGet(store, rmaId);
  if (!approverId) throw new Error('RMA: approverId is required');
  transition(
    store,
    rma,
    STATUS.APPROVED,
    'אושר ידנית',
    'Approved manually',
    { approver_id: approverId }
  );
  rma.approved_at = new Date().toISOString();
}

/**
 * Record receipt of returned items at the warehouse.
 *
 * @param {string} rmaId
 * @param {Array}  receivedItems  [{ line_id | item_id, qty_received, condition }]
 */
function receiveReturn(rmaId, receivedItems, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = _mustGet(store, rmaId);
  const lines = store.lines.get(rmaId) || [];

  if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
    throw new Error('RMA: receivedItems[] must be a non-empty array');
  }

  // An RMA may skip the shipped_back phase when the customer drops off in
  // person. Allow receive directly from APPROVED or SHIPPED_BACK.
  if (rma.status === STATUS.APPROVED) {
    // Optionally log the intermediate shipped_back for auditability
    transition(
      store,
      rma,
      STATUS.SHIPPED_BACK,
      'משלוח חזרה נרשם',
      'Ship-back recorded',
      { mode: 'implicit' }
    );
  }

  for (const rec of receivedItems) {
    const line = _findLine(lines, rec);
    if (!line) {
      throw new Error(`RMA: received line not found for ${JSON.stringify(rec)}`);
    }
    const qty = Number(rec.qty_received) || 0;
    if (qty < 0) throw new Error('RMA: qty_received must be >= 0');
    if (qty > line.qty_requested) {
      throw new Error(
        `RMA: qty_received (${qty}) exceeds qty_requested (${line.qty_requested}) for line ${line.id}`
      );
    }
    line.qty_received = qty;
    if (rec.condition) line.condition = rec.condition;
  }

  rma.received_at = new Date().toISOString();
  transition(
    store,
    rma,
    STATUS.RECEIVED,
    'התקבל במחסן',
    'Received at warehouse',
    { received_line_count: receivedItems.length }
  );
}

/**
 * Inspection pass — assign condition + disposition to each line.
 *
 * @param {string} rmaId
 * @param {Array}  inspections  [{ line_id|item_id, condition, disposition, refund_amount? }]
 */
function inspectItems(rmaId, inspections, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = _mustGet(store, rmaId);
  const lines = store.lines.get(rmaId) || [];

  if (!Array.isArray(inspections) || inspections.length === 0) {
    throw new Error('RMA: inspections[] must be a non-empty array');
  }

  const validDispositions = new Set(Object.values(DISPOSITION));
  const validConditions = new Set(Object.values(CONDITION));

  for (const ins of inspections) {
    const line = _findLine(lines, ins);
    if (!line) {
      throw new Error(`RMA: inspected line not found for ${JSON.stringify(ins)}`);
    }
    if (ins.condition) {
      if (!validConditions.has(ins.condition)) {
        throw new Error(`RMA: invalid condition "${ins.condition}"`);
      }
      line.condition = ins.condition;
    }
    if (!ins.disposition || !validDispositions.has(ins.disposition)) {
      throw new Error(`RMA: invalid disposition "${ins.disposition}"`);
    }
    line.disposition = ins.disposition;
    if (ins.refund_amount !== undefined) {
      line.refund_amount = round2(Number(ins.refund_amount) || 0);
    }
  }

  // Apply inventory side-effects (restock / scrap / repair / replace)
  for (const line of lines) {
    if (!line.disposition) continue;
    const op = {
      action: line.disposition,
      item_id: line.item_id,
      qty: line.qty_received,
      rma_id: rmaId,
      rma_number: rma.rma_number,
    };
    try {
      _inventoryHook(op);
    } catch (e) {
      appendAudit(
        store,
        rmaId,
        'inventory_hook_error',
        'שגיאה במלאי',
        'Inventory hook error',
        { error: e.message, op }
      );
    }
  }

  transition(
    store,
    rma,
    STATUS.INSPECTED,
    'עבר בדיקה',
    'Inspection complete',
    {
      inspection_count: inspections.length,
      dispositions: inspections.map((i) => i.disposition),
    }
  );
}

/**
 * Process the financial refund — credit note / refund / replacement.
 * Restocking fee is applied automatically per policy + reason.
 *
 * @param {string} rmaId
 * @param {string} refundType  one of REFUND_TYPES
 * @returns {string} creditNoteId  ('' for pure replacements)
 */
function processRefund(rmaId, refundType, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = _mustGet(store, rmaId);
  const lines = store.lines.get(rmaId) || [];

  if (!Object.values(REFUND_TYPES).includes(refundType)) {
    throw new Error(`RMA: invalid refundType "${refundType}"`);
  }
  if (rma.status !== STATUS.INSPECTED) {
    throw new Error(
      `RMA: processRefund requires status=inspected, got ${rma.status}`
    );
  }

  // Sum line totals (restockable + replaceable) based on disposition.
  // SCRAP lines still get refunded (it's our fault or the item is gone);
  // REPAIR lines are NOT refunded (we fix and return).
  let subtotal = 0;
  for (const line of lines) {
    if (line.disposition === DISPOSITION.REPAIR) continue;
    const already = line.refund_amount > 0
      ? line.refund_amount
      : round2(line.unit_price_ils * line.qty_received);
    line.refund_amount = already;
    subtotal += already;
  }
  subtotal = round2(subtotal);

  const restockingFee = computeRestockingFee(rma.reason, subtotal, rma.policy);
  const net = round2(subtotal - restockingFee);

  rma.refund_subtotal_ils = subtotal;
  rma.refund_restocking_fee_ils = restockingFee;
  rma.refund_net_ils = net;
  rma.refund_type = refundType;

  let creditNoteId = '';

  if (refundType === REFUND_TYPES.REPLACEMENT) {
    appendAudit(
      store,
      rmaId,
      'replacement_issued',
      'הוחלף פריט חדש',
      'Replacement shipped',
      { lines: lines.length }
    );
  } else {
    // Issue credit note through the injected generator
    const note = _invoiceGenerator(rma, net);
    if (!note || !note.id) {
      throw new Error('RMA: invoice generator did not return a credit note id');
    }
    creditNoteId = note.id;
    rma.credit_note_id = note.id;
    appendAudit(
      store,
      rmaId,
      refundType === REFUND_TYPES.CREDIT_NOTE
        ? 'credit_note_issued'
        : 'refund_issued',
      refundType === REFUND_TYPES.CREDIT_NOTE
        ? 'הונפקה תעודת זיכוי'
        : 'הונפק החזר כספי',
      refundType === REFUND_TYPES.CREDIT_NOTE
        ? 'Credit note issued'
        : 'Cash refund issued',
      {
        credit_note_id: note.id,
        subtotal_ils: subtotal,
        restocking_fee_ils: restockingFee,
        net_ils: net,
      }
    );
  }

  transition(
    store,
    rma,
    STATUS.PROCESSED,
    'הטיפול הכספי הושלם',
    'Financial processing complete',
    { refund_type: refundType, net_ils: net }
  );

  return creditNoteId;
}

/**
 * Close a fully processed RMA. Terminal.
 */
function closeRma(rmaId, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = _mustGet(store, rmaId);
  transition(store, rma, STATUS.CLOSED, 'נסגר', 'Closed', {});
  rma.closed_at = new Date().toISOString();
}

/**
 * Reject an RMA outright. Terminal.
 */
function rejectRma(rmaId, reason, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = _mustGet(store, rmaId);
  if (!reason) throw new Error('RMA: rejection reason is required');
  transition(
    store,
    rma,
    STATUS.REJECTED,
    'נדחה',
    'Rejected',
    { rejection_reason: reason }
  );
  rma.rejected_at = new Date().toISOString();
  rma.rejection_reason = reason;
}

/**
 * Aggregate stats over a time window.
 *
 * @param {{from:string|Date, to:string|Date}} period  inclusive range on created_at
 * @param {object} [opts]
 * @returns {{count:number, top_reasons:Array, avg_resolution_days:number, by_status:Object}}
 */
function getRmaStats(period, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const from = period && period.from ? new Date(period.from) : new Date(0);
  const to = period && period.to ? new Date(period.to) : new Date('9999-12-31');

  const reasonCount = new Map();
  const statusCount = new Map();
  let count = 0;
  let resSumDays = 0;
  let resCount = 0;

  for (const rma of store.rmas.values()) {
    const created = new Date(rma.created_at);
    if (created < from || created > to) continue;
    count++;
    reasonCount.set(rma.reason, (reasonCount.get(rma.reason) || 0) + 1);
    statusCount.set(rma.status, (statusCount.get(rma.status) || 0) + 1);
    if (rma.closed_at) {
      resSumDays += daysBetween(created, new Date(rma.closed_at));
      resCount++;
    }
  }

  const topReasons = [...reasonCount.entries()]
    .map(([code, n]) => ({
      code,
      count: n,
      label_he: _reasonLabelHe(code),
      label_en: _reasonLabelEn(code),
    }))
    .sort((a, b) => b.count - a.count);

  const by_status = {};
  for (const [k, v] of statusCount.entries()) by_status[k] = v;

  return {
    count,
    top_reasons: topReasons,
    avg_resolution_days: resCount > 0 ? round2(resSumDays / resCount) : 0,
    by_status,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 8.  ADMIN / LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════════════

function getRma(rmaId, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = store.rmas.get(rmaId);
  if (!rma) return null;
  return {
    ...rma,
    lines: (store.lines.get(rmaId) || []).map((l) => ({ ...l })),
  };
}

function listRmas(filter, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const out = [];
  for (const rma of store.rmas.values()) {
    if (filter) {
      if (filter.status && rma.status !== filter.status) continue;
      if (filter.customer_id && rma.customer_id !== filter.customer_id) continue;
    }
    out.push({ ...rma });
  }
  return out;
}

function getAuditTrail(rmaId, opts) {
  const store = (opts && opts.store) || _defaultStore;
  return [...(store.audit.get(rmaId) || [])];
}

/**
 * Bilingual ship-back instructions for the customer packet.
 */
function getShipBackInstructions(rmaId, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const rma = _mustGet(store, rmaId);
  return {
    rma_number: rma.rma_number,
    label_he: [
      `מספר החזרה: ${rma.rma_number}`,
      'אנא ארזו את הפריטים באריזתם המקורית.',
      'צרפו את תעודת ה-RMA שצורפה במייל.',
      'שילחו לכתובת: Techno-Kol Uzi — מרלו"ג החזרות, רח\' העלייה 7, בני ברק.',
      'זמן טיפול צפוי: עד 7 ימי עסקים מקבלת הסחורה.',
    ].join('\n'),
    label_en: [
      `RMA Number: ${rma.rma_number}`,
      'Please repack the items in their original packaging.',
      'Include the RMA slip attached to your confirmation email.',
      'Ship to: Techno-Kol Uzi — Returns DC, 7 Ha-Aliya St., Bnei Brak.',
      'Expected handling time: up to 7 business days after receipt.',
    ].join('\n'),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 9.  INTERNAL HELPERS (exported under `_internal` for tests)
// ═══════════════════════════════════════════════════════════════════════

function _mustGet(store, rmaId) {
  const rma = store.rmas.get(rmaId);
  if (!rma) throw new Error(`RMA: not found: ${rmaId}`);
  return rma;
}

function _findLine(lines, rec) {
  if (rec.line_id) return lines.find((l) => l.id === rec.line_id);
  if (rec.item_id) return lines.find((l) => l.item_id === rec.item_id);
  return null;
}

function _reasonLabelHe(code) {
  for (const v of Object.values(REASON_CODES)) {
    if (v.code === code) return v.label_he;
  }
  return code;
}
function _reasonLabelEn(code) {
  for (const v of Object.values(REASON_CODES)) {
    if (v.code === code) return v.label_en;
  }
  return code;
}

// ═══════════════════════════════════════════════════════════════════════
// 10.  EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // constants
  REASON_CODES,
  STATUS,
  DISPOSITION,
  CONDITION,
  REFUND_TYPES,
  EXCLUDED_CATEGORIES,
  DEFAULT_POLICY,
  LEGAL_TRANSITIONS,

  // public API
  createRma,
  approveRma,
  receiveReturn,
  inspectItems,
  processRefund,
  closeRma,
  rejectRma,
  getRmaStats,

  // helpers
  getRma,
  listRmas,
  getAuditTrail,
  getShipBackInstructions,
  computeRestockingFee,
  isItemExcludedByConsumerLaw,
  resolveReason,

  // store + hooks
  createStore,
  setInvoiceGenerator,
  setInventoryHook,
  _setDefaultStore,

  // introspection
  _internal: {
    formatRmaNumber,
    toYearMonth,
    daysBetween,
    round2,
    newId,
    appendAudit,
    transition,
    _shouldAutoApprove,
    _mustGet,
    _findLine,
  },
};
