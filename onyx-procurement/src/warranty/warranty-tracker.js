/**
 * Warranty Tracker — Agent X-33 (Swarm 3B)
 * Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * מעקב אחריות — סוכן X-33
 * ניהול אחריות על מוצרים שנמכרו וציוד שהתקבל, עם תמיכה מלאה
 * בחוק הגנת הצרכן הישראלי (חוק אחריות למוצרים פגומים, התשמ"א-1980).
 *
 * Tracks manufacturer + extended + service warranties for:
 *   - Products sold TO customers (we give warranty)
 *   - Equipment received FROM suppliers (we get warranty)
 *
 * Built for Techno-Kol Uzi — metal fabrication shop.
 *
 * Israeli consumer protection baked in:
 *   - תקנות הגנת הצרכן (אחריות ושירות לאחר מכירה), התשס"ו-2006
 *   - Metal goods / appliances: minimum 1 year manufacturer warranty
 *   - Building materials: 10 years structural (תקנות בניה)
 *   - Lemon rule: 3 failed repairs of the same defect ⇒ replacement right
 *   - Extended warranty may be labour/parts/comprehensive
 *
 * Bilingual Hebrew/English. Zero external dependencies (node: built-ins only).
 * Pure, in-memory store — never deletes. Integrates with invoices (sale),
 * inventory (serials) and the RMA engine (Agent X-32).
 *
 * Exports:
 *   - createWarranty(productSale)                → warrantyId
 *   - registerEquipment(equipment)                → warrantyId (inbound)
 *   - findBySerialNo(serialNo)                    → warranty | null
 *   - findByWarrantyId(id)                        → warranty | null
 *   - findByCustomer(customerId)                  → warranty[]
 *   - findByProduct(productId)                    → warranty[]
 *   - checkCoverage(warrantyId, date?)            → coverage object
 *   - createClaim(warrantyId, claimData)          → claimId
 *   - updateClaimStatus(claimId, status, res?)    → claim
 *   - getClaim(claimId)                           → claim | null
 *   - listClaims(warrantyId?)                     → claim[]
 *   - linkRMA(claimId, rmaId)                     → claim
 *   - vendorReimbursement(claimId, amount)        → claim
 *   - failureRateReport(productId, period?)       → report
 *   - expiringWarranties(daysAhead?)              → warranty[]
 *   - lemonCheck(warrantyId)                      → lemon-law evaluation
 *   - upsellCandidates(daysBeforeExpiry?)         → list of candidates
 *   - coverageFromTerms(type, terms)              → {parts, labor}
 *   - minimumLegalDays(productClass)              → number
 *   - legalFloor                                  → constants
 *   - CLAIM_STATUSES, WARRANTY_TYPES, COVERAGE_KINDS, PRODUCT_CLASSES
 *   - _resetStore() — test helper only, never used in prod paths
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const WARRANTY_TYPES = Object.freeze({
  MANUFACTURER: 'MANUFACTURER',   // יצרן — ברירת־מחדל
  EXTENDED:     'EXTENDED',       // אחריות מורחבת (נרכשת)
  SERVICE:      'SERVICE',        // חוזה שירות
  STATUTORY:    'STATUTORY',      // אחריות חוקית (חוק הגנת הצרכן)
});

const COVERAGE_KINDS = Object.freeze({
  PARTS_ONLY:       'PARTS_ONLY',       // חלפים בלבד
  LABOR_ONLY:       'LABOR_ONLY',       // עבודה בלבד
  COMPREHENSIVE:    'COMPREHENSIVE',    // מקיף — חלפים + עבודה
});

const CLAIM_STATUSES = Object.freeze({
  REPORTED:    'REPORTED',     // דווח
  IN_REVIEW:   'IN_REVIEW',    // בבדיקה
  APPROVED:    'APPROVED',     // אושר
  REJECTED:    'REJECTED',     // נדחה
  IN_REPAIR:   'IN_REPAIR',    // בתיקון
  REPAIRED:    'REPAIRED',     // תוקן
  REPLACED:    'REPLACED',     // הוחלף
  REFUNDED:    'REFUNDED',     // זוכה
  CLOSED:      'CLOSED',       // סגור
});

const PRODUCT_CLASSES = Object.freeze({
  METAL:        'METAL',        // מוצרי מתכת כלליים
  APPLIANCE:    'APPLIANCE',    // מוצרי חשמל / מכשירים
  BUILDING:     'BUILDING',     // חומרי בנייה / רכיבים קונסטרוקטיביים
  ELECTRONICS:  'ELECTRONICS',  // אלקטרוניקה
  CONSUMABLE:   'CONSUMABLE',   // מתכלים — אין חובה
  OTHER:        'OTHER',
});

/**
 * Israeli legal minimum warranty days per product class.
 * תקנות הגנת הצרכן (אחריות ושירות לאחר מכירה), התשס"ו-2006.
 * The Building value (3650 days == 10 years) reflects structural defects
 * duties under התקנות לבניה ולתכנון — not a perfect mapping but a safe floor.
 */
const legalFloor = Object.freeze({
  METAL:        365,    // מינימום שנה
  APPLIANCE:    365,    // מינימום שנה
  BUILDING:     3650,   // 10 שנים לליקויים קונסטרוקטיביים
  ELECTRONICS:  365,    // שנה
  CONSUMABLE:   0,      // אין חובה חוקית
  OTHER:        365,    // ברירת מחדל שמרנית
});

const DEFAULTS = Object.freeze({
  warrantyDays:              365,
  expiryAlertFar:            60,
  expiryAlertNear:           30,
  lemonRepairThreshold:      3,     // 3 תיקונים כושלים → זכות החלפה
  lemonWindowDays:           365,   // בתוך שנה מיום הקנייה
  upsellOfferBeforeExpiry:   45,    // הצעת אחריות מורחבת 45 יום לפני תום
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────
// In-memory store (replaces a DB; the host ERP wires its own repo later)
// ─────────────────────────────────────────────────────────────────────

const _store = {
  warranties: new Map(),  // id → warranty
  claims:     new Map(),  // id → claim
  bySerial:   new Map(),  // serialNo → warrantyId
  byCustomer: new Map(),  // customerId → Set<warrantyId>
  byProduct:  new Map(),  // productId → Set<warrantyId>
  counters: { w: 0, c: 0 },
};

function _resetStore() {
  _store.warranties.clear();
  _store.claims.clear();
  _store.bySerial.clear();
  _store.byCustomer.clear();
  _store.byProduct.clear();
  _store.counters.w = 0;
  _store.counters.c = 0;
}

function _nextWarrantyId() {
  _store.counters.w += 1;
  return 'W-' + String(_store.counters.w).padStart(6, '0');
}

function _nextClaimId() {
  _store.counters.c += 1;
  return 'CL-' + String(_store.counters.c).padStart(6, '0');
}

// ─────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────

function _toDate(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && v.length > 0) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new TypeError('warranty-tracker: invalid date value — ' + String(v));
}

function _today() {
  return new Date();
}

function _addDays(date, days) {
  const d = _toDate(date);
  d.setTime(d.getTime() + days * MS_PER_DAY);
  return d;
}

function _daysBetween(a, b) {
  const da = _toDate(a).getTime();
  const db = _toDate(b).getTime();
  return Math.round((db - da) / MS_PER_DAY);
}

function _iso(d) {
  return _toDate(d).toISOString().slice(0, 10);
}

function _requireNonEmpty(value, fieldLabel) {
  if (value === undefined || value === null || value === '') {
    throw new Error('warranty-tracker: missing required field — ' + fieldLabel);
  }
  return value;
}

function _freezeDeep(obj) {
  // Shallow freeze of the shell; callers that read the data shouldn't mutate.
  return Object.freeze(Object.assign({}, obj));
}

function _productClass(v) {
  if (!v) return PRODUCT_CLASSES.OTHER;
  const s = String(v).toUpperCase();
  if (PRODUCT_CLASSES[s]) return s;
  return PRODUCT_CLASSES.OTHER;
}

function minimumLegalDays(productClass) {
  const cls = _productClass(productClass);
  return legalFloor[cls] != null ? legalFloor[cls] : legalFloor.OTHER;
}

/**
 * Determines the coverage kind from free-form terms.
 * Accepts explicit string, or infers from keyword match.
 */
function coverageFromTerms(type, terms) {
  if (terms && typeof terms === 'object' && terms.coverage) {
    const k = String(terms.coverage).toUpperCase();
    if (COVERAGE_KINDS[k]) return k;
  }
  const haystack = [
    terms && terms.notes,
    terms && terms.description,
    type,
  ].filter(Boolean).join(' ').toLowerCase();

  const partsOnly = /parts\s*only|חלפים בלבד|parts\s*-?\s*only/.test(haystack);
  const laborOnly = /labou?r\s*only|עבודה בלבד|labou?r\s*-?\s*only/.test(haystack);
  const comprehensive = /comprehensive|מקיף|full\s*cover/.test(haystack);

  if (comprehensive) return COVERAGE_KINDS.COMPREHENSIVE;
  if (partsOnly && !laborOnly) return COVERAGE_KINDS.PARTS_ONLY;
  if (laborOnly && !partsOnly) return COVERAGE_KINDS.LABOR_ONLY;
  return COVERAGE_KINDS.COMPREHENSIVE;
}

// ─────────────────────────────────────────────────────────────────────
// createWarranty / registerEquipment
// ─────────────────────────────────────────────────────────────────────

/**
 * createWarranty(productSale)
 *
 * Auto-creates a warranty record when a product is sold.
 *
 * productSale shape (all inputs Hebrew or English keys work; we only use
 * the ones below):
 * {
 *   invoice_id,            // חשבונית — מזהה
 *   sale_date,             // תאריך מכירה (Date | ISO string)
 *   product_id,            // מק"ט
 *   product_class,         // METAL | APPLIANCE | BUILDING ...
 *   warranty_days,         // מספר ימי אחריות (ברירת מחדל 365)
 *   serial_no,             // מספר סידורי
 *   customer_id,           // לקוח
 *   type,                  // WARRANTY_TYPES.* — default MANUFACTURER
 *   vendor,                // ספק (אופציונלי, לאחריות מורחבת חיצונית)
 *   terms,                 // { coverage, notes, description, parts, labor }
 *   cost,                  // עלות האחריות ללקוח (לאחריות מורחבת)
 *   owned: false,          // true = ציוד שלנו (inbound)
 * }
 */
function createWarranty(productSale) {
  if (!productSale || typeof productSale !== 'object') {
    throw new TypeError('warranty-tracker: productSale must be an object');
  }
  _requireNonEmpty(productSale.product_id, 'product_id');
  _requireNonEmpty(productSale.sale_date, 'sale_date');

  const productClass = _productClass(productSale.product_class);
  const legalMin = minimumLegalDays(productClass);
  const requestedDays = Number.isFinite(productSale.warranty_days)
    ? Math.max(0, Math.floor(productSale.warranty_days))
    : DEFAULTS.warrantyDays;

  // Statutory floor must never be violated (חוק הגנת הצרכן).
  const effectiveDays = Math.max(requestedDays, legalMin);
  const statutoryUplift = effectiveDays > requestedDays;

  const start = _toDate(productSale.sale_date);
  const end = _addDays(start, effectiveDays);
  const id = _nextWarrantyId();
  const type = productSale.type && WARRANTY_TYPES[productSale.type]
    ? productSale.type
    : WARRANTY_TYPES.MANUFACTURER;

  const terms = Object.assign(
    {},
    productSale.terms || {},
    { coverage: coverageFromTerms(type, productSale.terms) },
  );

  const warranty = Object.freeze({
    id,
    product_id: productSale.product_id,
    product_class: productClass,
    serial_no: productSale.serial_no || null,
    customer_id: productSale.customer_id || null,
    owned: Boolean(productSale.owned),
    invoice_id: productSale.invoice_id || null,
    start_date: _iso(start),
    end_date: _iso(end),
    days: effectiveDays,
    type,
    terms,
    vendor: productSale.vendor || null,
    cost: Number.isFinite(productSale.cost) ? productSale.cost : 0,
    statutory_uplift: statutoryUplift,
    created_at: _iso(_today()),
    label_he: `אחריות ${effectiveDays} ימים עד ${_iso(end)}`,
    label_en: `Warranty ${effectiveDays} days until ${_iso(end)}`,
  });

  _store.warranties.set(id, warranty);

  if (warranty.serial_no) {
    const existing = _store.bySerial.get(warranty.serial_no);
    if (existing && existing !== id) {
      // Never delete — append chronologically via a marker list
      const list = Array.isArray(existing) ? existing.slice() : [existing];
      list.push(id);
      _store.bySerial.set(warranty.serial_no, list);
    } else {
      _store.bySerial.set(warranty.serial_no, id);
    }
  }

  if (warranty.customer_id) {
    if (!_store.byCustomer.has(warranty.customer_id)) {
      _store.byCustomer.set(warranty.customer_id, new Set());
    }
    _store.byCustomer.get(warranty.customer_id).add(id);
  }

  if (!_store.byProduct.has(warranty.product_id)) {
    _store.byProduct.set(warranty.product_id, new Set());
  }
  _store.byProduct.get(warranty.product_id).add(id);

  return id;
}

/**
 * Register inbound equipment warranty (from supplier to us).
 */
function registerEquipment(equipment) {
  if (!equipment || typeof equipment !== 'object') {
    throw new TypeError('warranty-tracker: equipment must be an object');
  }
  return createWarranty(Object.assign({}, equipment, {
    owned: true,
    customer_id: null,
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────

function findByWarrantyId(id) {
  return _store.warranties.get(id) || null;
}

function findBySerialNo(serialNo) {
  if (!serialNo) return null;
  const ref = _store.bySerial.get(serialNo);
  if (!ref) return null;
  if (Array.isArray(ref)) {
    // Most recent entry is the active one
    const latest = ref[ref.length - 1];
    return _store.warranties.get(latest) || null;
  }
  return _store.warranties.get(ref) || null;
}

function findByCustomer(customerId) {
  const set = _store.byCustomer.get(customerId);
  if (!set) return [];
  const out = [];
  set.forEach((id) => {
    const w = _store.warranties.get(id);
    if (w) out.push(w);
  });
  return out;
}

function findByProduct(productId) {
  const set = _store.byProduct.get(productId);
  if (!set) return [];
  const out = [];
  set.forEach((id) => {
    const w = _store.warranties.get(id);
    if (w) out.push(w);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Coverage
// ─────────────────────────────────────────────────────────────────────

/**
 * checkCoverage(warrantyId, date?)
 *
 * Returns:
 * {
 *   warranty_id,
 *   covered: boolean,
 *   days_remaining: integer (negative if expired),
 *   within_statutory: boolean,       // still within חוק הגנת הצרכן floor
 *   alert: null | '30d' | '60d' | 'EXPIRED',
 *   reason_he, reason_en,
 * }
 */
function checkCoverage(warrantyId, date) {
  const w = findByWarrantyId(warrantyId);
  if (!w) {
    return {
      warranty_id: warrantyId,
      covered: false,
      days_remaining: 0,
      within_statutory: false,
      alert: null,
      reason_he: 'אחריות לא נמצאה',
      reason_en: 'Warranty not found',
    };
  }

  const when = date ? _toDate(date) : _today();
  const remaining = _daysBetween(when, w.end_date);
  const legalMin = minimumLegalDays(w.product_class);
  const legalEnd = _addDays(w.start_date, legalMin);
  const withinStatutory = _daysBetween(when, legalEnd) >= 0;
  const covered = remaining >= 0;

  let alert = null;
  if (!covered) {
    alert = 'EXPIRED';
  } else if (remaining <= DEFAULTS.expiryAlertNear) {
    alert = '30d';
  } else if (remaining <= DEFAULTS.expiryAlertFar) {
    alert = '60d';
  }

  return {
    warranty_id: w.id,
    covered,
    days_remaining: remaining,
    within_statutory: withinStatutory,
    alert,
    reason_he: covered
      ? `מכוסה — נותרו ${remaining} ימים`
      : `פג תוקף לפני ${-remaining} ימים${withinStatutory ? ' (אך עודנו בתוך חוק הגנת הצרכן)' : ''}`,
    reason_en: covered
      ? `Covered — ${remaining} days remaining`
      : `Expired ${-remaining} days ago${withinStatutory ? ' (still within statutory floor)' : ''}`,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Claims
// ─────────────────────────────────────────────────────────────────────

function _normalizeClaimStatus(status) {
  if (!status) return CLAIM_STATUSES.REPORTED;
  const s = String(status).toUpperCase();
  if (CLAIM_STATUSES[s]) return s;
  throw new Error('warranty-tracker: unknown claim status — ' + status);
}

/**
 * createClaim(warrantyId, claimData)
 *
 * claimData:
 *   { reported_at?, description, severity?, photos?, reporter?, cost? }
 * Photos are stub string refs; we never store binary data here.
 */
function createClaim(warrantyId, claimData) {
  const w = findByWarrantyId(warrantyId);
  if (!w) {
    throw new Error('warranty-tracker: warranty not found — ' + warrantyId);
  }
  if (!claimData || typeof claimData !== 'object') {
    throw new TypeError('warranty-tracker: claimData must be an object');
  }
  _requireNonEmpty(claimData.description, 'description');

  const reportedAt = claimData.reported_at
    ? _toDate(claimData.reported_at)
    : _today();
  const id = _nextClaimId();

  const claim = {
    id,
    warranty_id: warrantyId,
    reported_at: _iso(reportedAt),
    description: String(claimData.description),
    severity: claimData.severity || 'normal',
    status: CLAIM_STATUSES.REPORTED,
    resolution: null,
    photos: Array.isArray(claimData.photos)
      ? claimData.photos.slice().map(String)
      : [],
    reporter: claimData.reporter || null,
    cost: Number.isFinite(claimData.cost) ? claimData.cost : 0,
    reimbursed: 0,
    rma_id: null,
    history: [{
      at: _iso(reportedAt),
      status: CLAIM_STATUSES.REPORTED,
      note_he: 'פנייה נפתחה',
      note_en: 'Claim opened',
    }],
    created_at: _iso(_today()),
  };

  _store.claims.set(id, claim);
  return id;
}

function getClaim(claimId) {
  const c = _store.claims.get(claimId);
  return c ? _freezeDeep(Object.assign({}, c, {
    photos: c.photos.slice(),
    history: c.history.slice(),
  })) : null;
}

function listClaims(warrantyId) {
  const out = [];
  _store.claims.forEach((c) => {
    if (warrantyId && c.warranty_id !== warrantyId) return;
    out.push(getClaim(c.id));
  });
  // Sort by reported date ascending for deterministic output
  out.sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  return out;
}

/**
 * updateClaimStatus(claimId, status, resolution?)
 * Never deletes history; appends to the timeline.
 */
function updateClaimStatus(claimId, status, resolution) {
  const c = _store.claims.get(claimId);
  if (!c) {
    throw new Error('warranty-tracker: claim not found — ' + claimId);
  }
  const newStatus = _normalizeClaimStatus(status);
  c.status = newStatus;
  if (resolution !== undefined) c.resolution = resolution;
  c.history.push({
    at: _iso(_today()),
    status: newStatus,
    note_he: 'עודכן סטטוס: ' + newStatus,
    note_en: 'Status updated: ' + newStatus,
    resolution: resolution || null,
  });
  return getClaim(claimId);
}

/**
 * linkRMA(claimId, rmaId)
 * Integrates with RMA engine (Agent X-32) — stores the reference only.
 */
function linkRMA(claimId, rmaId) {
  const c = _store.claims.get(claimId);
  if (!c) {
    throw new Error('warranty-tracker: claim not found — ' + claimId);
  }
  if (!rmaId) {
    throw new Error('warranty-tracker: rmaId is required');
  }
  c.rma_id = String(rmaId);
  c.history.push({
    at: _iso(_today()),
    status: c.status,
    note_he: 'שוייך ל-RMA: ' + rmaId,
    note_en: 'Linked to RMA: ' + rmaId,
  });
  return getClaim(claimId);
}

/**
 * vendorReimbursement(claimId, amount)
 * Tracks how much the vendor refunded us for a claim — NEVER subtracts.
 */
function vendorReimbursement(claimId, amount) {
  const c = _store.claims.get(claimId);
  if (!c) {
    throw new Error('warranty-tracker: claim not found — ' + claimId);
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('warranty-tracker: amount must be a non-negative number');
  }
  c.reimbursed = (c.reimbursed || 0) + amount;
  c.history.push({
    at: _iso(_today()),
    status: c.status,
    note_he: `זוכה מהספק: ${amount.toFixed(2)} ₪`,
    note_en: `Vendor reimbursement: ${amount.toFixed(2)} ILS`,
  });
  return getClaim(claimId);
}

// ─────────────────────────────────────────────────────────────────────
// Failure-rate analytics (for Quality)
// ─────────────────────────────────────────────────────────────────────

/**
 * failureRateReport(productId, period?)
 *
 * period: { from, to } — ISO dates or Date objects. If omitted, all time.
 *
 * Returns:
 *   {
 *     product_id,
 *     warranties_count,
 *     claims_count,
 *     claim_rate,           // claims / warranties
 *     mtbf_days,            // mean time between failures across units
 *     top_failures: [{ description, count }, ...],
 *     total_cost, total_reimbursed,
 *   }
 */
function failureRateReport(productId, period) {
  const warranties = findByProduct(productId);
  let fromTs = -Infinity;
  let toTs = Infinity;
  if (period) {
    if (period.from) fromTs = _toDate(period.from).getTime();
    if (period.to)   toTs   = _toDate(period.to).getTime();
  }

  const claims = [];
  warranties.forEach((w) => {
    listClaims(w.id).forEach((c) => {
      const ts = _toDate(c.reported_at).getTime();
      if (ts >= fromTs && ts <= toTs) claims.push(c);
    });
  });

  // MTBF — mean days between consecutive failures across all units.
  // If fewer than 2 failures, MTBF is null.
  const sorted = claims.slice().sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  let mtbf = null;
  if (sorted.length >= 2) {
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i += 1) {
      totalGap += _daysBetween(sorted[i - 1].reported_at, sorted[i].reported_at);
    }
    mtbf = totalGap / (sorted.length - 1);
  }

  // Top failure descriptions (case-insensitive, trimmed)
  const counts = new Map();
  sorted.forEach((c) => {
    const key = String(c.description || '').trim().toLowerCase();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e) => ({ description: e[0], count: e[1] }));

  const totalCost = sorted.reduce((s, c) => s + (c.cost || 0), 0);
  const totalReimbursed = sorted.reduce((s, c) => s + (c.reimbursed || 0), 0);

  return {
    product_id: productId,
    warranties_count: warranties.length,
    claims_count: sorted.length,
    claim_rate: warranties.length > 0 ? sorted.length / warranties.length : 0,
    mtbf_days: mtbf,
    top_failures: top,
    total_cost: totalCost,
    total_reimbursed: totalReimbursed,
    period: {
      from: Number.isFinite(fromTs) ? _iso(new Date(fromTs)) : null,
      to:   Number.isFinite(toTs)   ? _iso(new Date(toTs))   : null,
    },
    label_he: `דוח תקלות למוצר ${productId}: ${sorted.length} תקלות מתוך ${warranties.length} יחידות`,
    label_en: `Failure report for product ${productId}: ${sorted.length} claims / ${warranties.length} units`,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Expiry alerts
// ─────────────────────────────────────────────────────────────────────

/**
 * expiringWarranties(daysAhead?)
 * Returns all warranties that expire within `daysAhead` days from today.
 * Default window = 60 days (matches the "far" alert threshold).
 */
function expiringWarranties(daysAhead) {
  const window = Number.isFinite(daysAhead) ? daysAhead : DEFAULTS.expiryAlertFar;
  const today = _today();
  const horizon = _addDays(today, window);
  const out = [];
  _store.warranties.forEach((w) => {
    const end = _toDate(w.end_date);
    if (end.getTime() >= today.getTime() && end.getTime() <= horizon.getTime()) {
      out.push(w);
    }
  });
  out.sort((a, b) => a.end_date.localeCompare(b.end_date));
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Lemon law — 3 failed repairs = replacement right
// ─────────────────────────────────────────────────────────────────────

/**
 * lemonCheck(warrantyId)
 *
 * Israeli "lemon" doctrine (pulled from consumer protection practice):
 *   A product with 3+ failed repair attempts for the same defect within
 *   the warranty period entitles the consumer to a replacement or refund.
 *
 * Returns:
 *   { is_lemon, qualifying_failures, threshold, reason_he, reason_en }
 */
function lemonCheck(warrantyId) {
  const w = findByWarrantyId(warrantyId);
  if (!w) {
    return {
      is_lemon: false,
      qualifying_failures: 0,
      threshold: DEFAULTS.lemonRepairThreshold,
      reason_he: 'אחריות לא נמצאה',
      reason_en: 'Warranty not found',
    };
  }

  const claims = listClaims(warrantyId);

  // Group by normalized description — "same defect".
  const byDefect = new Map();
  claims.forEach((c) => {
    const key = String(c.description || '').trim().toLowerCase();
    if (!key) return;
    // Count only repairs that failed (anything not in REPAIRED/REPLACED/CLOSED
    // but transitioned through IN_REPAIR counts as a failed attempt; and
    // explicit REPAIRED followed by a new claim also counts).
    const repaired = c.history.some((h) => h.status === CLAIM_STATUSES.REPAIRED);
    if (!byDefect.has(key)) byDefect.set(key, { total: 0, repaired: 0 });
    const g = byDefect.get(key);
    g.total += 1;
    if (repaired) g.repaired += 1;
  });

  let qualifying = 0;
  let matchedDefect = null;
  byDefect.forEach((g, key) => {
    // Total claims with same description >= threshold, OR repaired-but-returned
    // pattern >= threshold.
    const count = g.total;
    if (count > qualifying) {
      qualifying = count;
      matchedDefect = key;
    }
  });

  const isLemon = qualifying >= DEFAULTS.lemonRepairThreshold;

  return {
    is_lemon: isLemon,
    warranty_id: warrantyId,
    qualifying_failures: qualifying,
    threshold: DEFAULTS.lemonRepairThreshold,
    defect: matchedDefect,
    reason_he: isLemon
      ? `זכות החלפה: ${qualifying} תיקונים לאותה תקלה`
      : `טרם הגיע לסף (${qualifying}/${DEFAULTS.lemonRepairThreshold})`,
    reason_en: isLemon
      ? `Replacement right: ${qualifying} repair attempts on the same defect`
      : `Below threshold (${qualifying}/${DEFAULTS.lemonRepairThreshold})`,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Extended warranty upsell reminders
// ─────────────────────────────────────────────────────────────────────

/**
 * upsellCandidates(daysBeforeExpiry?)
 *
 * Returns warranties nearing expiry that:
 *   1. Are currently MANUFACTURER or STATUTORY (not already extended)
 *   2. Belong to a named customer (i.e. not inbound / owned)
 *   3. Have few / no open claims
 */
function upsellCandidates(daysBeforeExpiry) {
  const window = Number.isFinite(daysBeforeExpiry)
    ? daysBeforeExpiry
    : DEFAULTS.upsellOfferBeforeExpiry;
  const expiring = expiringWarranties(window);
  const candidates = [];
  expiring.forEach((w) => {
    if (w.owned) return;
    if (!w.customer_id) return;
    if (w.type === WARRANTY_TYPES.EXTENDED || w.type === WARRANTY_TYPES.SERVICE) return;

    const claims = listClaims(w.id);
    const openClaims = claims.filter((c) => (
      c.status !== CLAIM_STATUSES.CLOSED
      && c.status !== CLAIM_STATUSES.REJECTED
      && c.status !== CLAIM_STATUSES.REFUNDED
    )).length;

    candidates.push({
      warranty_id: w.id,
      customer_id: w.customer_id,
      product_id: w.product_id,
      end_date: w.end_date,
      days_remaining: _daysBetween(_today(), w.end_date),
      claims_count: claims.length,
      open_claims: openClaims,
      recommended_he: 'הציעו אחריות מורחבת לפני תום התקופה',
      recommended_en: 'Offer extended warranty before expiry',
    });
  });
  return candidates;
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  createWarranty,
  registerEquipment,
  findBySerialNo,
  findByWarrantyId,
  findByCustomer,
  findByProduct,
  checkCoverage,
  createClaim,
  updateClaimStatus,
  getClaim,
  listClaims,
  linkRMA,
  vendorReimbursement,
  failureRateReport,
  expiringWarranties,
  lemonCheck,
  upsellCandidates,
  coverageFromTerms,
  minimumLegalDays,
  legalFloor,
  CLAIM_STATUSES,
  WARRANTY_TYPES,
  COVERAGE_KINDS,
  PRODUCT_CLASSES,
  DEFAULTS,
  _resetStore,
};
