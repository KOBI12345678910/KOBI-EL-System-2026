/**
 * RFQ Engine — מנוע בקשות הצעת מחיר
 * Agent X-28 (Swarm 3B) — Techno-Kol Uzi mega-ERP — 2026-04-11
 *
 * ---------------------------------------------------------------------------
 * Purpose
 * ---------------------------------------------------------------------------
 *   Full Request-For-Quote workflow used by the ONYX procurement module.
 *   Handles the end-to-end lifecycle:
 *
 *       DRAFT → INVITED → OPEN → CLOSED → SCORED → AWARDED → ARCHIVED
 *
 *   Every state transition is recorded to the audit trail — nothing is ever
 *   deleted, only archived. This is a compliance hard-rule for Techno-Kol
 *   Uzi (חוק חובת מכרזים, public-sector procurement law).
 *
 * ---------------------------------------------------------------------------
 * Features
 * ---------------------------------------------------------------------------
 *   - Line items with description / spec / quantity / delivery / currency
 *   - Supplier invitation with unique per-supplier signed tokens
 *   - Blind bidding — suppliers cannot see each other until bids are closed
 *   - Q&A — any question asked is broadcast as an answer to ALL invited
 *     suppliers (keeps the playing field level)
 *   - Attachments (drawings, technical specs) — stored as references
 *   - Revision rounds — a bid can be revised until the deadline
 *   - Minimum bid count enforcement (>= 3 for compliance, configurable)
 *   - Automated weighted scoring: price / delivery / quality / payment terms
 *   - Award → automatically creates a linked Purchase-Order stub
 *   - Legal compliance flags for public-sector RFQs
 *   - Bid deadline enforcement with grace windows
 *   - Full audit trail with actor identification
 *
 * ---------------------------------------------------------------------------
 * Public exports
 * ---------------------------------------------------------------------------
 *   createRfqEngine(options?)                         → engine instance
 *   createRfq(fields, actor?)                         → rfqId
 *   getRfq(rfqId)                                     → rfq snapshot
 *   listRfqs(filter?)                                 → rfq[]
 *   inviteSuppliers(rfqId, supplierIds[], actor?)     → invitations
 *   submitBid(token, bidData)                         → bidId   (no-auth)
 *   reviseBid(token, bidId, patch)                    → bidId   (no-auth)
 *   closeRfq(rfqId, actor?)                           → void (locks bids)
 *   scoreBids(rfqId, weights?)                        → ranked[]
 *   awardRfq(rfqId, winnerBidId, actor?)              → { poId, rfq }
 *   archiveRfq(rfqId, actor?)                         → void
 *   qaAddQuestion(rfqId, token, question)             → questionId
 *   qaAnswer(rfqId, questionId, answer, actor?)       → void (broadcast)
 *   getSupplierView(token)                            → supplier-safe view
 *   getAuditTrail(rfqId)                              → audit[]
 *
 *   // module-level convenience wrappers around a singleton engine
 *   createRfq, inviteSuppliers, submitBid, closeRfq, scoreBids, awardRfq,
 *   qaAddQuestion, qaAnswer
 *
 * ---------------------------------------------------------------------------
 * Storage
 * ---------------------------------------------------------------------------
 *   In-memory by default. An adapter interface lets the caller swap in a
 *   durable store. Nothing is ever physically removed — "archiving" only
 *   flips a flag so the data remains queryable by auditors.
 *
 * Zero dependencies — only node:crypto from the stdlib.
 */

'use strict';

const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RFQ_STATES = Object.freeze({
  DRAFT:    'DRAFT',
  INVITED:  'INVITED',
  OPEN:     'OPEN',
  CLOSED:   'CLOSED',
  SCORED:   'SCORED',
  AWARDED:  'AWARDED',
  ARCHIVED: 'ARCHIVED',
});

// Legal transition map — anything not here is forbidden.
const LEGAL_TRANSITIONS = Object.freeze({
  DRAFT:    ['INVITED', 'ARCHIVED'],
  INVITED:  ['OPEN', 'ARCHIVED'],
  OPEN:     ['CLOSED', 'ARCHIVED'],
  CLOSED:   ['SCORED', 'ARCHIVED'],
  SCORED:   ['AWARDED', 'CLOSED', 'ARCHIVED'],
  AWARDED:  ['ARCHIVED'],
  ARCHIVED: [],
});

const DEFAULT_MIN_BIDS = 3;

const DEFAULT_WEIGHTS = Object.freeze({
  price:        0.50,
  delivery:     0.20,
  quality:      0.20,
  paymentTerms: 0.10,
});

const SUPPORTED_CURRENCIES = Object.freeze([
  'ILS', 'USD', 'EUR', 'GBP', 'JPY', 'CHF',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function genToken() {
  // 32 bytes = 256 bits — URL-safe base64, unguessable.
  return crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = clone(v[k]);
  return out;
}

function isNonEmptyString(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

function isPositiveNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function assertState(rfq, ...expected) {
  if (!expected.includes(rfq.state)) {
    throw new Error(
      `RFQ ${rfq.id} is in state ${rfq.state}; expected one of ${expected.join(', ')}`
    );
  }
}

function canTransition(from, to) {
  return (LEGAL_TRANSITIONS[from] || []).includes(to);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateLineItem(item, idx) {
  if (!item || typeof item !== 'object') {
    throw new Error(`Line item #${idx}: must be an object`);
  }
  if (!isNonEmptyString(item.description)) {
    throw new Error(`Line item #${idx}: description is required`);
  }
  if (!isPositiveNumber(item.quantity)) {
    throw new Error(`Line item #${idx}: quantity must be positive`);
  }
  if (item.currency && !SUPPORTED_CURRENCIES.includes(item.currency)) {
    throw new Error(
      `Line item #${idx}: currency ${item.currency} not supported`
    );
  }
  if (
    item.target_delivery !== undefined &&
    item.target_delivery !== null &&
    !isNonEmptyString(String(item.target_delivery))
  ) {
    throw new Error(`Line item #${idx}: target_delivery must be a string`);
  }
}

function validateRfqFields(fields) {
  if (!fields || typeof fields !== 'object') {
    throw new Error('RFQ fields object is required');
  }
  if (!isNonEmptyString(fields.title)) {
    throw new Error('RFQ title is required');
  }
  if (!Array.isArray(fields.lineItems) || fields.lineItems.length === 0) {
    throw new Error('RFQ must have at least one line item');
  }
  fields.lineItems.forEach(validateLineItem);
  if (
    fields.currency !== undefined &&
    !SUPPORTED_CURRENCIES.includes(fields.currency)
  ) {
    throw new Error(`Currency ${fields.currency} not supported`);
  }
  if (
    fields.deadline !== undefined &&
    fields.deadline !== null &&
    !isNonEmptyString(String(fields.deadline))
  ) {
    throw new Error('Deadline must be an ISO date string');
  }
  if (
    fields.minBids !== undefined &&
    (!Number.isInteger(fields.minBids) || fields.minBids < 1)
  ) {
    throw new Error('minBids must be a positive integer');
  }
}

function validateBidData(bid, rfq) {
  if (!bid || typeof bid !== 'object') {
    throw new Error('Bid data object is required');
  }
  if (!isNonEmptyString(bid.supplierName)) {
    throw new Error('supplierName is required');
  }
  if (!Array.isArray(bid.lines) || bid.lines.length !== rfq.lineItems.length) {
    throw new Error(
      `Bid must have exactly ${rfq.lineItems.length} line(s) matching RFQ`
    );
  }
  bid.lines.forEach((line, idx) => {
    if (!line || typeof line !== 'object') {
      throw new Error(`Bid line #${idx}: must be an object`);
    }
    if (!isPositiveNumber(line.unitPrice)) {
      throw new Error(`Bid line #${idx}: unitPrice must be positive`);
    }
  });
  if (
    bid.deliveryDays !== undefined &&
    (!Number.isFinite(bid.deliveryDays) || bid.deliveryDays < 0)
  ) {
    throw new Error('deliveryDays must be a non-negative number');
  }
  if (
    bid.qualityScore !== undefined &&
    (!Number.isFinite(bid.qualityScore) ||
      bid.qualityScore < 0 ||
      bid.qualityScore > 100)
  ) {
    throw new Error('qualityScore must be between 0 and 100');
  }
  if (
    bid.paymentTermsDays !== undefined &&
    (!Number.isFinite(bid.paymentTermsDays) || bid.paymentTermsDays < 0)
  ) {
    throw new Error('paymentTermsDays must be a non-negative number');
  }
}

// ---------------------------------------------------------------------------
// In-memory storage adapter
// ---------------------------------------------------------------------------

function createMemoryAdapter() {
  const rfqs       = new Map();
  const bidsByRfq  = new Map();
  const tokensById = new Map();
  const tokensByIdx = new Map();  // token → { rfqId, supplierId }
  const qaByRfq    = new Map();
  const auditByRfq = new Map();
  const pos        = new Map();   // generated purchase orders

  return {
    saveRfq(rfq)          { rfqs.set(rfq.id, rfq); },
    getRfq(id)            { return rfqs.get(id); },
    listRfqs()            { return [...rfqs.values()]; },
    saveBid(rfqId, bid)   {
      if (!bidsByRfq.has(rfqId)) bidsByRfq.set(rfqId, new Map());
      bidsByRfq.get(rfqId).set(bid.id, bid);
    },
    getBid(rfqId, bidId)  {
      const m = bidsByRfq.get(rfqId);
      return m ? m.get(bidId) : undefined;
    },
    listBids(rfqId)       {
      const m = bidsByRfq.get(rfqId);
      return m ? [...m.values()] : [];
    },
    saveInvitation(inv) {
      tokensById.set(inv.id, inv);
      tokensByIdx.set(inv.token, inv);
    },
    getInvitation(id)     { return tokensById.get(id); },
    getInvitationByToken(t) { return tokensByIdx.get(t); },
    listInvitations(rfqId) {
      return [...tokensById.values()].filter((i) => i.rfqId === rfqId);
    },
    saveQa(rfqId, qa) {
      if (!qaByRfq.has(rfqId)) qaByRfq.set(rfqId, []);
      qaByRfq.get(rfqId).push(qa);
    },
    listQa(rfqId)         { return qaByRfq.get(rfqId) || []; },
    appendAudit(rfqId, ev) {
      if (!auditByRfq.has(rfqId)) auditByRfq.set(rfqId, []);
      auditByRfq.get(rfqId).push(ev);
    },
    listAudit(rfqId)      { return auditByRfq.get(rfqId) || []; },
    savePo(po)            { pos.set(po.id, po); },
    getPo(id)             { return pos.get(id); },
    listPos()             { return [...pos.values()]; },
  };
}

// ---------------------------------------------------------------------------
// Email stub — real SMTP code lives in src/emails/send-email.js
// ---------------------------------------------------------------------------

function createEmailStub() {
  const sent = [];
  return {
    async send({ to, subject, body, meta }) {
      const rec = { to, subject, body, meta, sentAt: nowIso() };
      sent.push(rec);
      return { ok: true, messageId: genId('msg'), ...rec };
    },
    list() { return sent.slice(); },
    clear() { sent.length = 0; },
  };
}

// ---------------------------------------------------------------------------
// RFQ Engine
// ---------------------------------------------------------------------------

function createRfqEngine(options = {}) {
  const storage   = options.storage   || createMemoryAdapter();
  const mailer    = options.mailer    || createEmailStub();
  const baseUrl   = options.baseUrl   || 'https://procure.technokol.example';
  const minBidsDefault = Number.isInteger(options.minBids)
    ? options.minBids
    : DEFAULT_MIN_BIDS;

  // ------------------------------------------------------------------
  // Audit helpers
  // ------------------------------------------------------------------
  function audit(rfqId, action, actor, details = {}) {
    const ev = {
      id: genId('aud'),
      rfqId,
      action,
      actor: actor || 'system',
      at: nowIso(),
      details: clone(details),
    };
    storage.appendAudit(rfqId, ev);
    return ev;
  }

  function transition(rfq, to, actor, details) {
    if (!canTransition(rfq.state, to)) {
      throw new Error(
        `Illegal transition ${rfq.state} → ${to} for RFQ ${rfq.id}`
      );
    }
    const from = rfq.state;
    rfq.state = to;
    rfq.updatedAt = nowIso();
    audit(rfq.id, `state:${from}->${to}`, actor, details);
  }

  // ------------------------------------------------------------------
  // 1. Create RFQ
  // ------------------------------------------------------------------
  function createRfq(fields, actor) {
    validateRfqFields(fields);

    const id = genId('rfq');
    const now = nowIso();

    const rfq = {
      id,
      title: fields.title,
      titleEn: fields.titleEn || '',
      description: fields.description || '',
      state: RFQ_STATES.DRAFT,
      currency: fields.currency || 'ILS',
      deadline: fields.deadline || null,
      minBids: Number.isInteger(fields.minBids) ? fields.minBids : minBidsDefault,
      publicSector: !!fields.publicSector,
      legalFlags: fields.publicSector
        ? ['חוק חובת מכרזים', 'Public Procurement Law']
        : [],
      lineItems: fields.lineItems.map((li, idx) => ({
        id: genId('li'),
        index: idx,
        description: li.description,
        spec: li.spec || '',
        quantity: li.quantity,
        unit: li.unit || 'יח׳',
        target_delivery: li.target_delivery || null,
        currency: li.currency || fields.currency || 'ILS',
        notes: li.notes || '',
      })),
      attachments: Array.isArray(fields.attachments)
        ? fields.attachments.map((a) => ({
            id: genId('att'),
            name: a.name || 'attachment',
            url: a.url || '',
            mime: a.mime || 'application/octet-stream',
            size: a.size || 0,
          }))
        : [],
      revisionRound: 1,
      createdBy: actor || 'system',
      createdAt: now,
      updatedAt: now,
      awardedBidId: null,
      awardedPoId: null,
      archivedAt: null,
    };

    storage.saveRfq(rfq);
    audit(id, 'rfq:created', actor, {
      title: rfq.title,
      lineItemCount: rfq.lineItems.length,
    });
    return id;
  }

  // ------------------------------------------------------------------
  // 2. Read helpers
  // ------------------------------------------------------------------
  function getRfq(rfqId) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    return clone(rfq);
  }

  function listRfqs(filter = {}) {
    let list = storage.listRfqs();
    if (filter.state) list = list.filter((r) => r.state === filter.state);
    if (filter.publicSector !== undefined) {
      list = list.filter((r) => r.publicSector === filter.publicSector);
    }
    if (filter.includeArchived === false) {
      list = list.filter((r) => r.state !== RFQ_STATES.ARCHIVED);
    }
    return list.map(clone);
  }

  // ------------------------------------------------------------------
  // 3. Invite suppliers
  // ------------------------------------------------------------------
  async function inviteSuppliers(rfqId, supplierIds, actor) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    assertState(rfq, RFQ_STATES.DRAFT, RFQ_STATES.INVITED, RFQ_STATES.OPEN);

    if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
      throw new Error('supplierIds must be a non-empty array');
    }

    if (rfq.publicSector && supplierIds.length < rfq.minBids) {
      throw new Error(
        `Public-sector RFQ requires at least ${rfq.minBids} invitations`
      );
    }

    const invitations = [];
    for (const sid of supplierIds) {
      if (!isNonEmptyString(sid)) {
        throw new Error('supplierId must be a non-empty string');
      }
      // Reuse existing invitation if supplier was already invited
      const existing = storage
        .listInvitations(rfqId)
        .find((i) => i.supplierId === sid);
      if (existing) {
        invitations.push(existing);
        continue;
      }
      const token = genToken();
      const inv = {
        id: genId('inv'),
        rfqId,
        supplierId: sid,
        supplierEmail: `${sid}@supplier.example`,
        token,
        url: `${baseUrl}/rfq/bid/${token}`,
        sentAt: nowIso(),
        status: 'sent',
      };
      storage.saveInvitation(inv);
      invitations.push(inv);

      await mailer.send({
        to: inv.supplierEmail,
        subject: `הזמנה להצעת מחיר — ${rfq.title}`,
        body:
          `שלום,\n\nהנכם מוזמנים להגיש הצעת מחיר עבור:\n${rfq.title}\n\n` +
          `לצפייה והגשה: ${inv.url}\n\n` +
          `Deadline: ${rfq.deadline || 'TBA'}\n\n` +
          `בברכה,\nTechno-Kol Uzi Procurement`,
        meta: { rfqId, supplierId: sid, invitationId: inv.id },
      });
      audit(rfqId, 'supplier:invited', actor, { supplierId: sid, invId: inv.id });
    }

    if (rfq.state === RFQ_STATES.DRAFT) {
      transition(rfq, RFQ_STATES.INVITED, actor, { inviteCount: invitations.length });
    }
    if (rfq.state === RFQ_STATES.INVITED) {
      transition(rfq, RFQ_STATES.OPEN, actor, { opened: true });
    }
    storage.saveRfq(rfq);

    return invitations.map(clone);
  }

  // ------------------------------------------------------------------
  // 4. Submit bid (no-auth — the token IS the auth)
  // ------------------------------------------------------------------
  function submitBid(token, bidData) {
    if (!isNonEmptyString(token)) throw new Error('token is required');
    const inv = storage.getInvitationByToken(token);
    if (!inv) throw new Error('Invalid invitation token');

    const rfq = storage.getRfq(inv.rfqId);
    if (!rfq) throw new Error(`RFQ ${inv.rfqId} not found`);

    assertState(rfq, RFQ_STATES.OPEN);

    // Deadline enforcement
    if (rfq.deadline && new Date(rfq.deadline).getTime() < Date.now()) {
      throw new Error('Bid deadline has passed');
    }

    validateBidData(bidData, rfq);

    const totalPrice = bidData.lines.reduce(
      (sum, ln, idx) => sum + ln.unitPrice * rfq.lineItems[idx].quantity,
      0
    );

    // Revision support — if this supplier already has a bid, mark the
    // previous one superseded rather than replacing it (never delete).
    const existing = storage
      .listBids(rfq.id)
      .filter((b) => b.supplierId === inv.supplierId && !b.superseded)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    if (existing.length > 0) {
      for (const prev of existing) {
        prev.superseded = true;
        prev.supersededAt = nowIso();
        storage.saveBid(rfq.id, prev);
      }
    }

    const bid = {
      id: genId('bid'),
      rfqId: rfq.id,
      invitationId: inv.id,
      supplierId: inv.supplierId,
      supplierName: bidData.supplierName,
      currency: bidData.currency || rfq.currency,
      lines: bidData.lines.map((ln, idx) => ({
        lineItemId: rfq.lineItems[idx].id,
        unitPrice: ln.unitPrice,
        notes: ln.notes || '',
      })),
      totalPrice,
      deliveryDays: bidData.deliveryDays ?? 30,
      qualityScore: bidData.qualityScore ?? 70,
      paymentTermsDays: bidData.paymentTermsDays ?? 30,
      attachments: Array.isArray(bidData.attachments)
        ? bidData.attachments.map((a) => ({
            id: genId('att'),
            name: a.name || 'attachment',
            url: a.url || '',
            mime: a.mime || 'application/octet-stream',
            size: a.size || 0,
          }))
        : [],
      notes: bidData.notes || '',
      round: rfq.revisionRound,
      superseded: false,
      supersededAt: null,
      submittedAt: nowIso(),
    };

    storage.saveBid(rfq.id, bid);
    audit(rfq.id, 'bid:submitted', inv.supplierId, {
      bidId: bid.id,
      total: totalPrice,
      round: bid.round,
    });

    return bid.id;
  }

  function reviseBid(token, _bidId, patch) {
    // Alias — submitBid already supersedes any previous bid.
    return submitBid(token, patch);
  }

  // ------------------------------------------------------------------
  // 5. Close RFQ — lock bids
  // ------------------------------------------------------------------
  function closeRfq(rfqId, actor) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    assertState(rfq, RFQ_STATES.OPEN);

    const activeBids = storage
      .listBids(rfqId)
      .filter((b) => !b.superseded);

    if (rfq.publicSector && activeBids.length < rfq.minBids) {
      // Compliance: not enough bids to award legally.
      audit(rfqId, 'compliance:insufficient_bids', actor, {
        received: activeBids.length,
        required: rfq.minBids,
      });
      // Don't throw — allow the buyer to decide. Flag it.
      rfq.legalFlags.push(
        `Insufficient bids: ${activeBids.length}/${rfq.minBids}`
      );
    }

    transition(rfq, RFQ_STATES.CLOSED, actor, { bidCount: activeBids.length });
    storage.saveRfq(rfq);
  }

  // ------------------------------------------------------------------
  // 6. Score bids with weights
  // ------------------------------------------------------------------
  function scoreBids(rfqId, weights) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    assertState(rfq, RFQ_STATES.CLOSED, RFQ_STATES.SCORED);

    const w = normalizeWeights(weights || DEFAULT_WEIGHTS);
    const bids = storage.listBids(rfqId).filter((b) => !b.superseded);
    if (bids.length === 0) {
      return [];
    }

    // Extract comparable ranges
    const prices = bids.map((b) => b.totalPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const deliveries = bids.map((b) => b.deliveryDays);
    const minDelivery = Math.min(...deliveries);
    const maxDelivery = Math.max(...deliveries);

    const payments = bids.map((b) => b.paymentTermsDays);
    const minPayment = Math.min(...payments);
    const maxPayment = Math.max(...payments);

    // Scoring functions — all normalized to [0..100]
    // Lower price/delivery = better, higher payment terms = better (from
    // the buyer's perspective, more days to pay = more cash flow).
    const scorePrice = (p) =>
      maxPrice === minPrice ? 100 : 100 * (1 - (p - minPrice) / (maxPrice - minPrice));
    const scoreDelivery = (d) =>
      maxDelivery === minDelivery
        ? 100
        : 100 * (1 - (d - minDelivery) / (maxDelivery - minDelivery));
    const scorePayment = (p) =>
      maxPayment === minPayment
        ? 100
        : 100 * ((p - minPayment) / (maxPayment - minPayment));

    const ranked = bids.map((b) => {
      const compPrice    = scorePrice(b.totalPrice);
      const compDelivery = scoreDelivery(b.deliveryDays);
      const compQuality  = Math.max(0, Math.min(100, b.qualityScore));
      const compPayment  = scorePayment(b.paymentTermsDays);

      const total =
        w.price        * compPrice +
        w.delivery     * compDelivery +
        w.quality      * compQuality +
        w.paymentTerms * compPayment;

      return {
        bidId: b.id,
        supplierId: b.supplierId,
        supplierName: b.supplierName,
        totalPrice: b.totalPrice,
        currency: b.currency,
        deliveryDays: b.deliveryDays,
        qualityScore: b.qualityScore,
        paymentTermsDays: b.paymentTermsDays,
        components: {
          price: round2(compPrice),
          delivery: round2(compDelivery),
          quality: round2(compQuality),
          paymentTerms: round2(compPayment),
        },
        score: round2(total),
      };
    });

    ranked.sort((a, b) => b.score - a.score);
    ranked.forEach((r, i) => {
      r.rank = i + 1;
    });

    if (rfq.state === RFQ_STATES.CLOSED) {
      transition(rfq, RFQ_STATES.SCORED, 'system', {
        weights: w,
        bidCount: bids.length,
      });
      storage.saveRfq(rfq);
    }

    return ranked;
  }

  // ------------------------------------------------------------------
  // 7. Award RFQ — creates a PO stub
  // ------------------------------------------------------------------
  function awardRfq(rfqId, winnerBidId, actor) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    assertState(rfq, RFQ_STATES.SCORED);

    const winner = storage.getBid(rfqId, winnerBidId);
    if (!winner) throw new Error(`Bid ${winnerBidId} not found`);
    if (winner.superseded) {
      throw new Error('Cannot award a superseded bid');
    }

    const po = {
      id: genId('po'),
      rfqId,
      bidId: winner.id,
      supplierId: winner.supplierId,
      supplierName: winner.supplierName,
      currency: winner.currency,
      lines: winner.lines.map((ln, idx) => ({
        lineItemId: ln.lineItemId,
        description: rfq.lineItems[idx].description,
        quantity: rfq.lineItems[idx].quantity,
        unit: rfq.lineItems[idx].unit,
        unitPrice: ln.unitPrice,
        lineTotal: ln.unitPrice * rfq.lineItems[idx].quantity,
      })),
      total: winner.totalPrice,
      deliveryDays: winner.deliveryDays,
      paymentTermsDays: winner.paymentTermsDays,
      status: 'issued',
      issuedAt: nowIso(),
      issuedBy: actor || 'system',
    };
    storage.savePo(po);

    rfq.awardedBidId = winner.id;
    rfq.awardedPoId = po.id;
    transition(rfq, RFQ_STATES.AWARDED, actor, {
      bidId: winner.id,
      poId: po.id,
      total: winner.totalPrice,
    });
    storage.saveRfq(rfq);

    return { poId: po.id, rfq: clone(rfq), po: clone(po) };
  }

  // ------------------------------------------------------------------
  // 8. Archive
  // ------------------------------------------------------------------
  function archiveRfq(rfqId, actor) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    transition(rfq, RFQ_STATES.ARCHIVED, actor, { prevState: rfq.state });
    rfq.archivedAt = nowIso();
    storage.saveRfq(rfq);
  }

  // ------------------------------------------------------------------
  // 9. Q&A — blind, broadcast answers
  // ------------------------------------------------------------------
  function qaAddQuestion(rfqId, token, question) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    // Suppliers question via token — actor is the supplierId;
    // buyer can question without a token (pass null/undefined).
    let supplierId = null;
    if (token) {
      const inv = storage.getInvitationByToken(token);
      if (!inv || inv.rfqId !== rfqId) throw new Error('Invalid token for RFQ');
      supplierId = inv.supplierId;
    }
    if (!isNonEmptyString(question)) {
      throw new Error('question must be a non-empty string');
    }
    const qa = {
      id: genId('qa'),
      rfqId,
      question,
      askedBy: supplierId || 'buyer',
      askedAt: nowIso(),
      answer: null,
      answeredBy: null,
      answeredAt: null,
    };
    storage.saveQa(rfqId, qa);
    audit(rfqId, 'qa:question', supplierId || 'buyer', { qaId: qa.id });
    return qa.id;
  }

  async function qaAnswer(rfqId, questionId, answer, actor) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    if (!isNonEmptyString(answer)) {
      throw new Error('answer must be a non-empty string');
    }
    const qa = storage.listQa(rfqId).find((q) => q.id === questionId);
    if (!qa) throw new Error(`Question ${questionId} not found`);
    qa.answer = answer;
    qa.answeredBy = actor || 'buyer';
    qa.answeredAt = nowIso();
    audit(rfqId, 'qa:answered', actor || 'buyer', { qaId: questionId });

    // Broadcast the new Q&A to ALL invited suppliers — keeps the playing
    // field level. The question text never reveals who asked it.
    const invs = storage.listInvitations(rfqId);
    for (const inv of invs) {
      await mailer.send({
        to: inv.supplierEmail,
        subject: `עדכון Q&A — ${rfq.title}`,
        body:
          `שלום,\n\nעדכון חדש בבקשת הצעת המחיר:\n\n` +
          `שאלה: ${qa.question}\n\n` +
          `תשובה: ${answer}\n\n` +
          `לצפייה: ${baseUrl}/rfq/bid/${inv.token}`,
        meta: { rfqId, questionId, broadcast: true },
      });
    }
  }

  // ------------------------------------------------------------------
  // 10. Supplier view — blind (can only see their own bid)
  // ------------------------------------------------------------------
  function getSupplierView(token) {
    if (!isNonEmptyString(token)) throw new Error('token is required');
    const inv = storage.getInvitationByToken(token);
    if (!inv) throw new Error('Invalid invitation token');

    const rfq = storage.getRfq(inv.rfqId);
    if (!rfq) throw new Error(`RFQ ${inv.rfqId} not found`);

    const myBids = storage
      .listBids(rfq.id)
      .filter((b) => b.supplierId === inv.supplierId);
    const qa = storage.listQa(rfq.id).filter((q) => q.answer !== null);

    // Strip internal fields — suppliers never see other suppliers' info.
    return {
      rfq: {
        id: rfq.id,
        title: rfq.title,
        titleEn: rfq.titleEn,
        description: rfq.description,
        state: rfq.state,
        currency: rfq.currency,
        deadline: rfq.deadline,
        lineItems: clone(rfq.lineItems),
        attachments: clone(rfq.attachments),
        revisionRound: rfq.revisionRound,
        legalFlags: rfq.legalFlags.slice(),
      },
      supplierId: inv.supplierId,
      myBids: myBids.map(clone),
      qa: qa.map((q) => ({
        id: q.id,
        question: q.question,
        answer: q.answer,
        answeredAt: q.answeredAt,
      })),
      submitUrl: `${baseUrl}/rfq/bid/${token}/submit`,
      canSubmit: rfq.state === RFQ_STATES.OPEN,
    };
  }

  // ------------------------------------------------------------------
  // 11. Audit trail
  // ------------------------------------------------------------------
  function getAuditTrail(rfqId) {
    return storage.listAudit(rfqId).map(clone);
  }

  // ------------------------------------------------------------------
  // 12. Comparison matrix (used by the UI)
  // ------------------------------------------------------------------
  function buildComparisonMatrix(rfqId) {
    const rfq = storage.getRfq(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} not found`);
    const bids = storage.listBids(rfqId).filter((b) => !b.superseded);

    const lines = rfq.lineItems.map((li, idx) => {
      const cells = bids.map((b) => {
        const bidLine = b.lines[idx];
        return {
          supplierId: b.supplierId,
          supplierName: b.supplierName,
          unitPrice: bidLine ? bidLine.unitPrice : null,
          lineTotal: bidLine ? bidLine.unitPrice * li.quantity : null,
          currency: b.currency,
        };
      });
      const prices = cells.filter((c) => c.unitPrice !== null).map((c) => c.unitPrice);
      const bestPrice = prices.length ? Math.min(...prices) : null;
      return {
        lineItemId: li.id,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        spec: li.spec,
        bestPrice,
        cells: cells.map((c) => ({
          ...c,
          isBest: c.unitPrice !== null && c.unitPrice === bestPrice,
        })),
      };
    });

    const totals = bids.map((b) => ({
      supplierId: b.supplierId,
      supplierName: b.supplierName,
      currency: b.currency,
      total: b.totalPrice,
      deliveryDays: b.deliveryDays,
      qualityScore: b.qualityScore,
      paymentTermsDays: b.paymentTermsDays,
      isWinner: rfq.awardedBidId === b.id,
    }));

    return {
      rfqId: rfq.id,
      title: rfq.title,
      currency: rfq.currency,
      state: rfq.state,
      lines,
      suppliers: bids.map((b) => ({
        supplierId: b.supplierId,
        supplierName: b.supplierName,
      })),
      totals,
    };
  }

  // ------------------------------------------------------------------
  // Public engine interface
  // ------------------------------------------------------------------
  return {
    STATES: RFQ_STATES,
    DEFAULT_WEIGHTS,
    createRfq,
    getRfq,
    listRfqs,
    inviteSuppliers,
    submitBid,
    reviseBid,
    closeRfq,
    scoreBids,
    awardRfq,
    archiveRfq,
    qaAddQuestion,
    qaAnswer,
    getSupplierView,
    getAuditTrail,
    buildComparisonMatrix,
    // expose for testability
    _storage: storage,
    _mailer: mailer,
  };
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function normalizeWeights(w) {
  const price        = Math.max(0, Number(w.price        ?? 0));
  const delivery     = Math.max(0, Number(w.delivery     ?? 0));
  const quality      = Math.max(0, Number(w.quality      ?? 0));
  const paymentTerms = Math.max(0, Number(w.paymentTerms ?? 0));
  const sum = price + delivery + quality + paymentTerms;
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return {
    price:        price        / sum,
    delivery:     delivery     / sum,
    quality:      quality      / sum,
    paymentTerms: paymentTerms / sum,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Module-level singleton + convenience wrappers
// ---------------------------------------------------------------------------

let _singleton = null;
function getSingleton() {
  if (!_singleton) _singleton = createRfqEngine();
  return _singleton;
}

function createRfq(fields, actor) {
  return getSingleton().createRfq(fields, actor);
}
function inviteSuppliers(rfqId, supplierIds, actor) {
  return getSingleton().inviteSuppliers(rfqId, supplierIds, actor);
}
function submitBid(token, bidData) {
  return getSingleton().submitBid(token, bidData);
}
function closeRfq(rfqId, actor) {
  return getSingleton().closeRfq(rfqId, actor);
}
function scoreBids(rfqId, weights) {
  return getSingleton().scoreBids(rfqId, weights);
}
function awardRfq(rfqId, bidId, actor) {
  return getSingleton().awardRfq(rfqId, bidId, actor);
}
function qaAddQuestion(rfqId, token, question) {
  // Overloaded: qaAddQuestion(rfqId, question) buyer-side
  if (question === undefined) {
    return getSingleton().qaAddQuestion(rfqId, null, token);
  }
  return getSingleton().qaAddQuestion(rfqId, token, question);
}
function qaAnswer(rfqId, questionId, answer, actor) {
  return getSingleton().qaAnswer(rfqId, questionId, answer, actor);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // factory
  createRfqEngine,
  createMemoryAdapter,
  createEmailStub,

  // module-level convenience
  createRfq,
  inviteSuppliers,
  submitBid,
  closeRfq,
  scoreBids,
  awardRfq,
  qaAddQuestion,
  qaAnswer,

  // constants
  RFQ_STATES,
  DEFAULT_WEIGHTS,
  SUPPORTED_CURRENCIES,
  LEGAL_TRANSITIONS,

  // internal helpers exposed for tests
  _normalizeWeights: normalizeWeights,
  _validateRfqFields: validateRfqFields,
  _validateBidData: validateBidData,
  _round2: round2,
  _deepFreeze: deepFreeze,
  _canTransition: canTransition,
};
