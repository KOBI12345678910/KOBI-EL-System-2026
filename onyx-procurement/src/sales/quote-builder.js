/* ============================================================================
 * Techno-Kol ERP — Sales Quote Builder / בונה הצעות מחיר
 * Agent Y-016 / Swarm 4 / Onyx Procurement
 * ----------------------------------------------------------------------------
 * Quote / הצעת מחיר lifecycle:
 *
 *     draft  →  sent  →  accepted  →  won
 *        │        │          │         │
 *        │        │          │         └→ expired
 *        │        │          └───────────→ lost
 *        │        └→ expired
 *        └→ expired
 *
 * Rules (לא מוחקים רק משדרגים ומגדלים):
 *   • Every edit of a sent/accepted quote creates a new immutable version;
 *     prior versions remain in the version chain forever.
 *   • Discount history is kept — applying a new discount does not wipe the
 *     previous one, it appends to `discounts[]`.
 *   • Status transitions are recorded in `history[]` with actor + reason.
 *   • Line items carry a `sku`, qty, unitPrice, optional line discount.
 *   • VAT rate comes from constructor config (defaults 17%) so the module
 *     does not hard-code Israeli policy.
 *   • Currency conversion is delegated to src/fx/fx-engine.js if present.
 *   • Hebrew RTL bilingual PDF is generated via pdfkit (optional dep) — if
 *     pdfkit is missing the generator returns a text fallback.
 *   • חשבונית רפורמה 2024 — allocation_number placeholder is carried on the
 *     quote so the eventual invoice can be stamped with a real number from
 *     רשות המיסים when the deal is won.
 *
 * Zero dependencies beyond optional pdfkit + optional fx-engine.
 *
 * Public API — class QuoteBuilder
 *   ctor({ vatRate?, currency?, fxEngine?, now?, pdfDir?, sellerInfo? })
 *   createQuote({ customer, items, validDays, terms, notes, currency? })
 *   addLine(quote, line)
 *   removeLine(quote, sku)
 *   updateLine(quote, sku, patch)
 *   applyDiscount(quote, { type, value, scope, reason, sku? })
 *   computeTotals(quote)
 *   reviseQuote(id, changes)
 *   listVersions(quoteId)
 *   getVersion(quoteId, v)
 *   statusTransition(quoteId, to, { actor?, reason? }?)
 *   generatePDF(quote, outputPath?)
 *   convertToOrder(quote)
 *
 * Getter:
 *   get(id) — returns most-recent version
 *   all()   — returns head of every quote chain
 * ========================================================================== */

'use strict';

/* ---------- optional deps (lazy, fail-soft) ---------- */
let PDFDocument = null;
try { PDFDocument = require('pdfkit'); } catch (_) { /* pdfkit optional */ }

let fxEngineModule = null;
try { fxEngineModule = require('../fx/fx-engine.js'); } catch (_) { /* optional */ }

const fs = require('fs');
const path = require('path');

/* ---------- constants ---------- */
const DEFAULT_VAT = 0.17;           // ברירת מחדל — מע"מ 17%
const DEFAULT_CURRENCY = 'ILS';
const DEFAULT_VALID_DAYS = 30;

const STATUS = Object.freeze({
  DRAFT:    'draft',
  SENT:     'sent',
  ACCEPTED: 'accepted',
  WON:      'won',
  LOST:     'lost',
  EXPIRED:  'expired'
});

/** Allowed transitions — never delete, only grow graph */
const ALLOWED = Object.freeze({
  draft:    [STATUS.SENT, STATUS.EXPIRED],
  sent:     [STATUS.ACCEPTED, STATUS.LOST, STATUS.EXPIRED],
  accepted: [STATUS.WON, STATUS.LOST, STATUS.EXPIRED],
  won:      [],
  lost:     [],
  expired:  []
});

/** Hebrew glossary — used by PDF generator */
const GLOSSARY = Object.freeze({
  quote:               { he: 'הצעת מחיר',       en: 'Sales Quote' },
  quoteNumber:         { he: "מס' הצעה",        en: 'Quote #' },
  version:             { he: 'גרסה',             en: 'Version' },
  customer:            { he: 'לקוח',             en: 'Customer' },
  seller:              { he: 'ספק',              en: 'Seller' },
  date:                { he: 'תאריך',            en: 'Date' },
  validUntil:          { he: 'בתוקף עד',         en: 'Valid until' },
  sku:                 { he: 'מק"ט',             en: 'SKU' },
  description:         { he: 'תיאור',            en: 'Description' },
  qty:                 { he: 'כמות',             en: 'Qty' },
  unitPrice:           { he: 'מחיר ליחידה',     en: 'Unit price' },
  discount:            { he: 'הנחה',             en: 'Discount' },
  lineTotal:           { he: 'סה"כ שורה',        en: 'Line total' },
  subtotal:            { he: 'סכום ביניים',     en: 'Subtotal' },
  totalDiscount:       { he: 'סה"כ הנחה',        en: 'Total discount' },
  net:                 { he: 'נטו לפני מע"מ',    en: 'Net' },
  vat:                 { he: 'מע"מ',             en: 'VAT' },
  gross:               { he: 'סה"כ לתשלום',      en: 'Gross total' },
  terms:               { he: 'תנאים',            en: 'Terms' },
  notes:               { he: 'הערות',            en: 'Notes' },
  status:              { he: 'סטטוס',            en: 'Status' },
  statusDraft:         { he: 'טיוטה',            en: 'Draft' },
  statusSent:          { he: 'נשלח',             en: 'Sent' },
  statusAccepted:      { he: 'אושר',             en: 'Accepted' },
  statusWon:           { he: 'נסגר',             en: 'Won' },
  statusLost:          { he: 'לא נסגר',          en: 'Lost' },
  statusExpired:       { he: 'פג תוקף',          en: 'Expired' },
  allocationNumber:    { he: "מס' הקצאה",       en: 'Allocation #' },
  reformaNotice:       {
    he: 'חשבונית מס שתונפק בעת סגירת העסקה תישא מספר הקצאה מרשות המיסים לפי רפורמת החשבונית 2024.',
    en: 'The tax invoice issued upon deal close will bear an allocation number from the Tax Authority per the 2024 invoice reform.'
  }
});

/* ---------- tiny money helpers (zero deps) ---------- */
function round2(n) {
  // Banker's round to 2dp — same style as fx-engine to avoid drift
  const scaled = Number(n) * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let out;
  if (diff > 0.5) out = floor + 1;
  else if (diff < 0.5) out = floor;
  else out = (floor % 2 === 0) ? floor : floor + 1;
  return out / 100;
}

function nonNegNum(v, label) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`QuoteBuilder: ${label} must be a non-negative number, got ${v}`);
  }
  return n;
}

function formatMoney(n, currency) {
  const num = Number(n || 0);
  const sym = currency === 'USD' ? '$'
            : currency === 'EUR' ? '€'
            : currency === 'GBP' ? '£'
            : '₪';
  return sym + ' ' + num.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function addDays(isoOrDate, n) {
  const d = isoOrDate instanceof Date ? new Date(isoOrDate) : new Date(isoOrDate);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoDate(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

function genId(prefix, now) {
  const ts = now.getTime().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

/* ----------------------------------------------------------------------------
 * Core class
 * -------------------------------------------------------------------------- */
class QuoteBuilder {
  /**
   * @param {Object} opts
   * @param {number} [opts.vatRate=0.17]    — VAT rate, from config
   * @param {string} [opts.currency='ILS']   — default display currency
   * @param {Object} [opts.fxEngine]         — instance of createFxEngine() (optional)
   * @param {Function} [opts.now]            — clock injection for tests
   * @param {string} [opts.pdfDir]           — default PDF output dir
   * @param {Object} [opts.sellerInfo]       — seller block for PDF header
   */
  constructor(opts = {}) {
    this.vatRate = typeof opts.vatRate === 'number' ? opts.vatRate : DEFAULT_VAT;
    this.currency = opts.currency || DEFAULT_CURRENCY;
    this.now = typeof opts.now === 'function' ? opts.now : () => new Date();
    this.pdfDir = opts.pdfDir || null;
    this.sellerInfo = opts.sellerInfo || {
      legal_name: 'טכנו-קול עוזי בע"מ',
      legal_name_en: 'Techno-Kol Uzi Ltd.',
      company_id: '515123456',
      tax_file: '947123456',
      address: 'ישראל',
      phone: '',
      email: ''
    };

    // Allow fx engine injection OR auto-create one if module present
    if (opts.fxEngine) {
      this.fxEngine = opts.fxEngine;
    } else if (fxEngineModule && typeof fxEngineModule.createFxEngine === 'function') {
      try { this.fxEngine = fxEngineModule.createFxEngine({ now: this.now }); }
      catch (_) { this.fxEngine = null; }
    } else {
      this.fxEngine = null;
    }

    // Quote chains keyed by id -> array of versions (index = v-1)
    this._quotes = new Map();
    // Sequential number allocator
    this._nextNumber = 1;
    // Default validity in days
    this.defaultValidDays = opts.defaultValidDays || DEFAULT_VALID_DAYS;
  }

  /* -------------------- creation -------------------- */

  /**
   * Create a brand-new quote in status 'draft'. Version = 1.
   */
  createQuote({
    customer,
    items,
    validDays,
    terms,
    notes,
    currency,
    allocationNumber,
    tags
  } = {}) {
    if (!customer || typeof customer !== 'object') {
      throw new Error('QuoteBuilder.createQuote: customer object required');
    }
    if (!Array.isArray(items)) {
      throw new Error('QuoteBuilder.createQuote: items must be an array');
    }

    const now = this.now();
    const id = genId('Q', now);
    const number = `Q-${now.getUTCFullYear()}-${String(this._nextNumber++).padStart(5, '0')}`;
    const issued = isoDate(now);
    const validity = typeof validDays === 'number' && validDays > 0
      ? validDays
      : this.defaultValidDays;
    const expires = addDays(now, validity);

    // Validate + normalize lines
    const lines = items.map((item, i) => this._makeLine(item, i));

    const quote = {
      id,
      number,
      version: 1,
      status: STATUS.DRAFT,

      customer: { ...customer },
      seller:   { ...this.sellerInfo },

      issued_date:  issued,
      valid_days:   validity,
      expires_date: expires,

      currency: currency || this.currency,
      vat_rate: this.vatRate,

      lines,
      discounts: [],      // scope:'total' entries accumulate here

      terms: terms || '',
      notes: notes || '',
      tags: Array.isArray(tags) ? tags.slice() : [],

      // חשבונית רפורמה 2024 — placeholder until real number obtained
      allocation_number: allocationNumber || null,
      allocation_source: allocationNumber ? 'preassigned' : 'pending',

      history: [
        {
          at: now.toISOString(),
          event: 'created',
          from: null,
          to: STATUS.DRAFT,
          actor: customer.created_by || 'system',
          reason: 'quote created'
        }
      ],

      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      previous_version_id: null
    };

    // Compute initial totals so callers see them immediately
    quote.totals = this.computeTotals(quote);

    // Persist to chain
    this._quotes.set(id, [quote]);
    return quote;
  }

  /**
   * Internal — normalize a line object from user input.
   */
  _makeLine(raw, idx) {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`QuoteBuilder.line[${idx}]: object required`);
    }
    const sku = String(raw.sku || '').trim();
    if (!sku) throw new Error(`QuoteBuilder.line[${idx}]: sku required`);
    const qty = nonNegNum(raw.qty, `line[${idx}].qty`);
    const unitPrice = nonNegNum(raw.unitPrice, `line[${idx}].unitPrice`);
    const discountRaw = raw.discount || 0;
    let discount;
    if (typeof discountRaw === 'number') {
      discount = { type: 'amount', value: nonNegNum(discountRaw, `line[${idx}].discount`), reason: null };
    } else if (discountRaw && typeof discountRaw === 'object') {
      const type = discountRaw.type === 'percent' ? 'percent' : 'amount';
      const value = nonNegNum(discountRaw.value, `line[${idx}].discount.value`);
      if (type === 'percent' && value > 100) {
        throw new Error(`QuoteBuilder.line[${idx}]: percent discount cannot exceed 100`);
      }
      discount = { type, value, reason: discountRaw.reason || null };
    } else {
      discount = { type: 'amount', value: 0, reason: null };
    }
    return {
      sku,
      description: raw.description || raw.name || sku,
      qty,
      unit: raw.unit || 'יח׳',
      unitPrice,
      discount,
      tax_code: raw.tax_code || 'VAT_STANDARD'
    };
  }

  /* -------------------- line editing -------------------- */

  addLine(quote, line) {
    this._assertMutable(quote);
    const q = this._cloneWorking(quote);
    const next = this._makeLine(line, q.lines.length);
    // If a line with this sku already exists, increment qty instead of dup
    const existing = q.lines.find((l) => l.sku === next.sku);
    if (existing) {
      existing.qty = round2(existing.qty + next.qty);
      // unit-price stays as original unless explicit override in patch
      existing.unitPrice = next.unitPrice;
      if (next.discount && next.discount.value > 0) existing.discount = next.discount;
    } else {
      q.lines.push(next);
    }
    q.updated_at = this.now().toISOString();
    q.totals = this.computeTotals(q);
    this._replaceHead(q);
    return q;
  }

  removeLine(quote, sku) {
    this._assertMutable(quote);
    const q = this._cloneWorking(quote);
    const before = q.lines.length;
    q.lines = q.lines.filter((l) => l.sku !== sku);
    if (q.lines.length === before) {
      throw new Error(`QuoteBuilder.removeLine: sku ${sku} not found`);
    }
    q.updated_at = this.now().toISOString();
    q.totals = this.computeTotals(q);
    this._replaceHead(q);
    return q;
  }

  updateLine(quote, sku, patch) {
    this._assertMutable(quote);
    if (!patch || typeof patch !== 'object') {
      throw new Error('QuoteBuilder.updateLine: patch required');
    }
    const q = this._cloneWorking(quote);
    const line = q.lines.find((l) => l.sku === sku);
    if (!line) throw new Error(`QuoteBuilder.updateLine: sku ${sku} not found`);

    if (patch.qty !== undefined) line.qty = nonNegNum(patch.qty, 'qty');
    if (patch.unitPrice !== undefined) line.unitPrice = nonNegNum(patch.unitPrice, 'unitPrice');
    if (patch.description !== undefined) line.description = String(patch.description);
    if (patch.unit !== undefined) line.unit = String(patch.unit);
    if (patch.discount !== undefined) {
      const idx = q.lines.indexOf(line);
      // Re-normalize via _makeLine partial shape
      const normalized = this._makeLine({ ...line, discount: patch.discount }, idx);
      line.discount = normalized.discount;
    }
    q.updated_at = this.now().toISOString();
    q.totals = this.computeTotals(q);
    this._replaceHead(q);
    return q;
  }

  /* -------------------- discounts -------------------- */

  /**
   * applyDiscount — scope can be 'line' (requires sku) or 'total'.
   * Line discounts mutate the line's .discount in-place; total discounts
   * push to quote.discounts[] so history is preserved.
   */
  applyDiscount(quote, opts) {
    this._assertMutable(quote);
    if (!opts || typeof opts !== 'object') {
      throw new Error('QuoteBuilder.applyDiscount: opts required');
    }
    const type = opts.type === 'percent' ? 'percent' : 'amount';
    const value = nonNegNum(opts.value, 'discount value');
    if (type === 'percent' && value > 100) {
      throw new Error('QuoteBuilder.applyDiscount: percent cannot exceed 100');
    }
    const scope = opts.scope === 'line' ? 'line' : 'total';
    const reason = opts.reason || null;

    const q = this._cloneWorking(quote);

    if (scope === 'line') {
      const sku = opts.sku;
      if (!sku) throw new Error('QuoteBuilder.applyDiscount: sku required for line scope');
      const line = q.lines.find((l) => l.sku === sku);
      if (!line) throw new Error(`QuoteBuilder.applyDiscount: sku ${sku} not found`);
      line.discount = { type, value, reason };
    } else {
      q.discounts.push({
        id: genId('D', this.now()),
        type,
        value,
        reason,
        at: this.now().toISOString()
      });
    }
    q.updated_at = this.now().toISOString();
    q.totals = this.computeTotals(q);
    this._replaceHead(q);
    return q;
  }

  /* -------------------- totals -------------------- */

  /**
   * computeTotals — pure function over quote state.
   *
   * Process:
   *   1. For each line: gross = qty*unitPrice; minus line discount → lineNet
   *   2. subtotal = sum(lineNet before line discount)       (pre-discount)
   *      lineDiscountTotal = sum(lineDiscount)
   *      preTotalNet = subtotal - lineDiscountTotal
   *   3. Apply total-scope discounts (percent first on running, then amount)
   *   4. net = preTotalNet - totalDiscountSum  (clamped ≥ 0)
   *   5. vat = net * vatRate
   *   6. gross = net + vat
   */
  computeTotals(quote) {
    if (!quote) throw new Error('QuoteBuilder.computeTotals: quote required');
    const lines = Array.isArray(quote.lines) ? quote.lines : [];
    const vatRate = typeof quote.vat_rate === 'number' ? quote.vat_rate : this.vatRate;

    let subtotal = 0;
    let lineDiscountTotal = 0;
    const lineBreakdown = [];

    for (const line of lines) {
      const gross = round2(Number(line.qty) * Number(line.unitPrice));
      let dAmt = 0;
      if (line.discount) {
        if (line.discount.type === 'percent') {
          dAmt = round2(gross * (Number(line.discount.value) / 100));
        } else {
          dAmt = round2(Number(line.discount.value));
        }
      }
      if (dAmt > gross) dAmt = gross;
      const lineNet = round2(gross - dAmt);
      subtotal = round2(subtotal + gross);
      lineDiscountTotal = round2(lineDiscountTotal + dAmt);
      lineBreakdown.push({
        sku: line.sku,
        qty: line.qty,
        unitPrice: line.unitPrice,
        gross,
        discount: dAmt,
        net: lineNet
      });
    }

    const preTotalNet = round2(subtotal - lineDiscountTotal);

    // Apply total-scope discounts in insertion order
    let totalDiscountSum = 0;
    let running = preTotalNet;
    const totalBreakdown = [];
    for (const d of (quote.discounts || [])) {
      let amt;
      if (d.type === 'percent') {
        amt = round2(running * (Number(d.value) / 100));
      } else {
        amt = round2(Number(d.value));
      }
      if (amt > running) amt = running;
      running = round2(running - amt);
      totalDiscountSum = round2(totalDiscountSum + amt);
      totalBreakdown.push({ id: d.id, type: d.type, value: d.value, reason: d.reason, amount: amt });
    }

    const net = round2(Math.max(0, preTotalNet - totalDiscountSum));
    const vat = round2(net * vatRate);
    const gross = round2(net + vat);
    const totalDiscount = round2(lineDiscountTotal + totalDiscountSum);

    return {
      currency: quote.currency || this.currency,
      vat_rate: vatRate,
      line_breakdown: lineBreakdown,
      total_breakdown: totalBreakdown,
      subtotal,
      line_discount: lineDiscountTotal,
      total_discount: totalDiscount,
      pre_vat_net: net,
      net,
      vat,
      gross
    };
  }

  /* -------------------- versioning -------------------- */

  /**
   * reviseQuote — creates a new immutable version. History of lines is
   * preserved via the chain; caller gets the new head.
   *
   * `changes` may patch: customer, terms, notes, validDays, currency,
   * lines (replace), discounts (replace), allocationNumber.
   */
  reviseQuote(id, changes = {}) {
    const chain = this._quotes.get(id);
    if (!chain) throw new Error(`QuoteBuilder.reviseQuote: quote ${id} not found`);
    const head = chain[chain.length - 1];

    const now = this.now();
    const next = JSON.parse(JSON.stringify(head));
    next.version = head.version + 1;
    next.previous_version_id = head.id;
    // id stays the same → same chain
    next.updated_at = now.toISOString();

    if (changes.customer) next.customer = { ...next.customer, ...changes.customer };
    if (changes.terms !== undefined) next.terms = String(changes.terms || '');
    if (changes.notes !== undefined) next.notes = String(changes.notes || '');
    if (typeof changes.validDays === 'number' && changes.validDays > 0) {
      next.valid_days = changes.validDays;
      next.expires_date = addDays(next.issued_date, changes.validDays);
    }
    if (changes.currency) next.currency = changes.currency;
    if (changes.allocationNumber !== undefined) {
      next.allocation_number = changes.allocationNumber;
      next.allocation_source = changes.allocationNumber ? 'assigned' : 'pending';
    }
    if (Array.isArray(changes.lines)) {
      next.lines = changes.lines.map((l, i) => this._makeLine(l, i));
    }
    if (Array.isArray(changes.discounts)) {
      next.discounts = changes.discounts.map((d) => ({
        id: d.id || genId('D', now),
        type: d.type === 'percent' ? 'percent' : 'amount',
        value: nonNegNum(d.value, 'discount.value'),
        reason: d.reason || null,
        at: d.at || now.toISOString()
      }));
    }

    // Revising a sent quote moves it back to draft unless caller forces status.
    if (head.status === STATUS.SENT) next.status = STATUS.DRAFT;

    next.history = head.history.slice();
    next.history.push({
      at: now.toISOString(),
      event: 'revised',
      from: head.version,
      to: next.version,
      actor: changes.actor || 'system',
      reason: changes.reason || 'revision'
    });

    next.totals = this.computeTotals(next);
    chain.push(next);
    return next;
  }

  listVersions(quoteId) {
    const chain = this._quotes.get(quoteId);
    if (!chain) return [];
    return chain.map((v) => ({
      version: v.version,
      status:  v.status,
      totals:  v.totals,
      updated_at: v.updated_at,
      previous_version_id: v.previous_version_id
    }));
  }

  getVersion(quoteId, v) {
    const chain = this._quotes.get(quoteId);
    if (!chain) return null;
    if (v === undefined || v === null) return chain[chain.length - 1];
    const found = chain.find((x) => x.version === v);
    return found || null;
  }

  get(id) { return this.getVersion(id); }

  all() {
    const out = [];
    for (const chain of this._quotes.values()) out.push(chain[chain.length - 1]);
    return out;
  }

  /* -------------------- status -------------------- */

  statusTransition(quoteId, to, opts = {}) {
    const chain = this._quotes.get(quoteId);
    if (!chain) throw new Error(`QuoteBuilder.statusTransition: quote ${quoteId} not found`);
    const head = chain[chain.length - 1];

    const from = head.status;
    const allowedNext = ALLOWED[from] || [];
    if (!allowedNext.includes(to)) {
      throw new Error(
        `QuoteBuilder.statusTransition: illegal transition ${from} → ${to}` +
        ` (allowed: ${allowedNext.join(', ') || 'none'})`
      );
    }

    const now = this.now();
    head.status = to;
    head.updated_at = now.toISOString();
    head.history.push({
      at: now.toISOString(),
      event: 'status',
      from,
      to,
      actor: opts.actor || 'system',
      reason: opts.reason || null
    });
    return head;
  }

  /* -------------------- internal mutation helpers -------------------- */

  _assertMutable(quote) {
    if (!quote || !quote.id) throw new Error('QuoteBuilder: invalid quote');
    if (quote.status !== STATUS.DRAFT) {
      throw new Error(
        `QuoteBuilder: cannot edit quote in status ${quote.status}; call reviseQuote() to create new version`
      );
    }
  }

  _cloneWorking(quote) {
    // Mutate-in-place is fine for draft; we still refresh updated_at + totals
    return quote;
  }

  _replaceHead(quote) {
    const chain = this._quotes.get(quote.id);
    if (!chain) return;
    chain[chain.length - 1] = quote;
  }

  /* -------------------- FX helpers -------------------- */

  /**
   * Convert a quote's totals into target currency using injected fxEngine.
   * Pure — does not mutate. Returns a copy with fx metadata.
   */
  convertCurrency(quote, targetCcy, asOf) {
    if (!this.fxEngine) {
      throw new Error('QuoteBuilder.convertCurrency: no fxEngine configured');
    }
    if (!quote || !quote.totals) throw new Error('QuoteBuilder.convertCurrency: quote missing totals');
    const src = quote.currency || this.currency;
    if (src === targetCcy) return { ...quote.totals, fx: { rate: 1, from: src, to: targetCcy } };

    const info = this.fxEngine.convert(quote.totals.gross, src, targetCcy, asOf);
    const ratio = info.rate;
    return {
      ...quote.totals,
      currency: targetCcy,
      subtotal: round2(quote.totals.subtotal * ratio),
      line_discount: round2(quote.totals.line_discount * ratio),
      total_discount: round2(quote.totals.total_discount * ratio),
      net: round2(quote.totals.net * ratio),
      vat: round2(quote.totals.vat * ratio),
      gross: round2(quote.totals.gross * ratio),
      fx: {
        rate: ratio,
        from: src,
        to: targetCcy,
        source: info.source,
        asOf: info.asOf,
        stale: info.stale
      }
    };
  }

  /* -------------------- conversion to order -------------------- */

  convertToOrder(quote) {
    if (!quote) throw new Error('QuoteBuilder.convertToOrder: quote required');
    if (quote.status !== STATUS.ACCEPTED && quote.status !== STATUS.WON) {
      throw new Error(
        `QuoteBuilder.convertToOrder: quote must be accepted or won (current: ${quote.status})`
      );
    }
    const totals = quote.totals || this.computeTotals(quote);
    return {
      order_type: 'sales_order',
      source_quote_id:  quote.id,
      source_quote_number: quote.number,
      source_quote_version: quote.version,
      customer: { ...quote.customer },
      seller:   { ...quote.seller },
      currency: quote.currency,
      vat_rate: quote.vat_rate,
      lines: quote.lines.map((l) => ({
        sku: l.sku,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        discount: { ...l.discount },
        tax_code: l.tax_code
      })),
      discounts: quote.discounts.map((d) => ({ ...d })),
      totals,
      terms: quote.terms,
      notes: quote.notes,
      // חשבונית רפורמה 2024 — carry the placeholder forward
      allocation_number: quote.allocation_number,
      allocation_source: quote.allocation_source,
      status: 'pending_fulfillment',
      created_at: this.now().toISOString(),
      history: [
        {
          at: this.now().toISOString(),
          event: 'created_from_quote',
          actor: 'system',
          reason: `from quote ${quote.number} v${quote.version}`
        }
      ]
    };
  }

  /* -------------------- PDF -------------------- */

  /**
   * generatePDF — if pdfkit is available, writes to outputPath and returns
   * { path, size, engine:'pdfkit' }. If pdfkit is missing, returns a plain-
   * text bilingual fallback (engine:'text') so the module still functions.
   */
  generatePDF(quote, outputPath) {
    if (!quote) throw new Error('QuoteBuilder.generatePDF: quote required');
    const totals = quote.totals || this.computeTotals(quote);
    const target = outputPath || (this.pdfDir
      ? path.join(this.pdfDir, `quote-${quote.number}-v${quote.version}.pdf`)
      : null);

    if (!PDFDocument) {
      const text = this._renderTextFallback(quote, totals);
      if (target) {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const txtPath = target.replace(/\.pdf$/i, '.txt');
        fs.writeFileSync(txtPath, text, 'utf8');
        return Promise.resolve({
          path: txtPath, size: Buffer.byteLength(text, 'utf8'), engine: 'text', text
        });
      }
      return Promise.resolve({ path: null, size: Buffer.byteLength(text, 'utf8'), engine: 'text', text });
    }

    if (!target) {
      throw new Error('QuoteBuilder.generatePDF: outputPath or ctor pdfDir required when pdfkit available');
    }

    return new Promise((resolve, reject) => {
      try {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title:  `הצעת מחיר ${quote.number} v${quote.version} — ${quote.customer.name || ''}`,
            Author: quote.seller.legal_name || 'Techno-Kol Uzi',
            Subject: 'Sales Quote / הצעת מחיר',
            Keywords: 'quote,sales,הצעת מחיר',
            CreationDate: new Date()
          }
        });
        const stream = fs.createWriteStream(target);
        doc.pipe(stream);

        this._renderPdfBody(doc, quote, totals);

        doc.end();
        stream.on('finish', () => {
          const stats = fs.statSync(target);
          resolve({ path: target, size: stats.size, engine: 'pdfkit' });
        });
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  _renderPdfBody(doc, quote, totals) {
    const G = GLOSSARY;

    // Header
    doc.fontSize(20).text(`${G.quote.en} / ${G.quote.he}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).text(
      `${G.quoteNumber.en}: ${quote.number}   |   ${G.version.en}: ${quote.version}`,
      { align: 'center' }
    );
    doc.fontSize(10).text(
      `${G.date.en} / ${G.date.he}: ${quote.issued_date}   |   ` +
      `${G.validUntil.en} / ${G.validUntil.he}: ${quote.expires_date}`,
      { align: 'center' }
    );
    doc.moveDown();

    // Seller + customer boxes
    const topY = doc.y;
    doc.fontSize(10);
    doc.text(`${G.seller.en} / ${G.seller.he}`, 40, topY);
    doc.text(`${quote.seller.legal_name || ''}`);
    if (quote.seller.legal_name_en) doc.text(`${quote.seller.legal_name_en}`);
    if (quote.seller.company_id) doc.text(`ח.פ / ID: ${quote.seller.company_id}`);
    if (quote.seller.address) doc.text(`${quote.seller.address}`);

    const col2X = 320;
    doc.text(`${G.customer.en} / ${G.customer.he}`, col2X, topY);
    doc.text(`${quote.customer.name || quote.customer.legal_name || ''}`, col2X, doc.y);
    if (quote.customer.company_id) doc.text(`ח.פ / ID: ${quote.customer.company_id}`, col2X, doc.y);
    if (quote.customer.email) doc.text(`${quote.customer.email}`, col2X, doc.y);
    if (quote.customer.phone) doc.text(`${quote.customer.phone}`, col2X, doc.y);

    doc.moveDown(2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    // Line table header
    doc.fontSize(10).font('Helvetica-Bold');
    const hdrY = doc.y;
    doc.text(`${G.sku.en} / ${G.sku.he}`, 40, hdrY, { width: 90 });
    doc.text(`${G.description.en} / ${G.description.he}`, 130, hdrY, { width: 200 });
    doc.text(`${G.qty.en}`, 330, hdrY, { width: 40, align: 'right' });
    doc.text(`${G.unitPrice.en}`, 375, hdrY, { width: 70, align: 'right' });
    doc.text(`${G.lineTotal.en}`, 460, hdrY, { width: 95, align: 'right' });
    doc.font('Helvetica').moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.2);

    // Lines
    for (let i = 0; i < quote.lines.length; i++) {
      const line = quote.lines[i];
      const bd = totals.line_breakdown[i] || {};
      const y = doc.y;
      doc.fontSize(9);
      doc.text(line.sku, 40, y, { width: 90 });
      doc.text(line.description, 130, y, { width: 200 });
      doc.text(String(line.qty), 330, y, { width: 40, align: 'right' });
      doc.text(formatMoney(line.unitPrice, quote.currency), 375, y, { width: 70, align: 'right' });
      doc.text(formatMoney(bd.net || 0, quote.currency), 460, y, { width: 95, align: 'right' });
      if (line.discount && line.discount.value > 0) {
        doc.fontSize(8).fillColor('#888');
        const dLabel = line.discount.type === 'percent'
          ? `${G.discount.en} ${line.discount.value}%`
          : `${G.discount.en} ${formatMoney(line.discount.value, quote.currency)}`;
        doc.text(dLabel, 130, doc.y, { width: 325 });
        doc.fontSize(9).fillColor('#000');
      }
      doc.moveDown(0.2);
    }
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals block
    const totalsX = 330;
    doc.fontSize(10);
    this._row(doc, totalsX, `${G.subtotal.en} / ${G.subtotal.he}`, formatMoney(totals.subtotal, quote.currency));
    if (totals.total_discount > 0) {
      this._row(doc, totalsX, `${G.totalDiscount.en} / ${G.totalDiscount.he}`, '-' + formatMoney(totals.total_discount, quote.currency));
    }
    this._row(doc, totalsX, `${G.net.en} / ${G.net.he}`, formatMoney(totals.net, quote.currency));
    this._row(doc, totalsX, `${G.vat.en} ${Math.round(totals.vat_rate * 100)}%`, formatMoney(totals.vat, quote.currency));
    doc.font('Helvetica-Bold');
    this._row(doc, totalsX, `${G.gross.en} / ${G.gross.he}`, formatMoney(totals.gross, quote.currency));
    doc.font('Helvetica');
    doc.moveDown();

    // Terms + notes
    if (quote.terms) {
      doc.fontSize(10).text(`${G.terms.en} / ${G.terms.he}:`);
      doc.fontSize(9).text(quote.terms);
      doc.moveDown(0.5);
    }
    if (quote.notes) {
      doc.fontSize(10).text(`${G.notes.en} / ${G.notes.he}:`);
      doc.fontSize(9).text(quote.notes);
      doc.moveDown(0.5);
    }

    // Allocation number + reforma notice
    doc.moveDown(0.5);
    doc.fontSize(9);
    const allocTxt = quote.allocation_number
      ? `${GLOSSARY.allocationNumber.en}: ${quote.allocation_number}`
      : `${GLOSSARY.allocationNumber.en}: __________  (${GLOSSARY.allocationNumber.he} — ${quote.allocation_source})`;
    doc.text(allocTxt);
    doc.fontSize(8).fillColor('#666');
    doc.text(GLOSSARY.reformaNotice.en);
    doc.text(GLOSSARY.reformaNotice.he);
    doc.fillColor('#000');

    // Footer
    doc.fontSize(8).fillColor('#888');
    doc.moveDown(1);
    doc.text(
      `${G.status.en}: ${this._statusLabel(quote.status).en} / ${this._statusLabel(quote.status).he}`,
      { align: 'center' }
    );
    doc.fillColor('#000');
  }

  _row(doc, x, label, value) {
    const y = doc.y;
    doc.text(label, x, y, { width: 130, align: 'left' });
    doc.text(value, x + 130, y, { width: 95, align: 'right' });
    doc.moveDown(0.2);
  }

  _statusLabel(s) {
    const map = {
      draft:    GLOSSARY.statusDraft,
      sent:     GLOSSARY.statusSent,
      accepted: GLOSSARY.statusAccepted,
      won:      GLOSSARY.statusWon,
      lost:     GLOSSARY.statusLost,
      expired:  GLOSSARY.statusExpired
    };
    return map[s] || { he: s, en: s };
  }

  _renderTextFallback(quote, totals) {
    const G = GLOSSARY;
    const lines = [];
    lines.push(`${G.quote.en} / ${G.quote.he}`);
    lines.push(`${G.quoteNumber.en} / ${G.quoteNumber.he}: ${quote.number} v${quote.version}`);
    lines.push(`${G.date.en}: ${quote.issued_date}    ${G.validUntil.en}: ${quote.expires_date}`);
    lines.push('');
    lines.push(`${G.seller.en}: ${quote.seller.legal_name || ''}`);
    lines.push(`${G.customer.en}: ${quote.customer.name || quote.customer.legal_name || ''}`);
    lines.push('');
    lines.push(`${G.sku.en}   ${G.description.en}   ${G.qty.en}   ${G.unitPrice.en}   ${G.lineTotal.en}`);
    for (let i = 0; i < quote.lines.length; i++) {
      const l = quote.lines[i];
      const bd = totals.line_breakdown[i] || {};
      lines.push(`${l.sku}   ${l.description}   ${l.qty}   ${formatMoney(l.unitPrice, quote.currency)}   ${formatMoney(bd.net || 0, quote.currency)}`);
      if (l.discount && l.discount.value > 0) {
        lines.push(`    ${G.discount.en}: ${l.discount.type === 'percent' ? l.discount.value + '%' : formatMoney(l.discount.value, quote.currency)}`);
      }
    }
    lines.push('');
    lines.push(`${G.subtotal.en}: ${formatMoney(totals.subtotal, quote.currency)}`);
    if (totals.total_discount > 0) {
      lines.push(`${G.totalDiscount.en}: -${formatMoney(totals.total_discount, quote.currency)}`);
    }
    lines.push(`${G.net.en}: ${formatMoney(totals.net, quote.currency)}`);
    lines.push(`${G.vat.en} ${Math.round(totals.vat_rate * 100)}%: ${formatMoney(totals.vat, quote.currency)}`);
    lines.push(`${G.gross.en}: ${formatMoney(totals.gross, quote.currency)}`);
    lines.push('');
    if (quote.terms) lines.push(`${G.terms.en}: ${quote.terms}`);
    if (quote.notes) lines.push(`${G.notes.en}: ${quote.notes}`);
    lines.push('');
    lines.push(
      quote.allocation_number
        ? `${G.allocationNumber.en}: ${quote.allocation_number}`
        : `${G.allocationNumber.en}: ________ (${G.allocationNumber.he} — ${quote.allocation_source})`
    );
    lines.push(G.reformaNotice.en);
    lines.push(G.reformaNotice.he);
    lines.push(`${G.status.en}: ${this._statusLabel(quote.status).en} / ${this._statusLabel(quote.status).he}`);
    return lines.join('\n');
  }
}

/* ----------------------------------------------------------------------------
 * Module exports
 * -------------------------------------------------------------------------- */
module.exports = {
  QuoteBuilder,
  STATUS,
  ALLOWED,
  GLOSSARY,
  DEFAULT_VAT,
  round2,
  formatMoney
};
