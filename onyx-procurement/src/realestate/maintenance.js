/**
 * maintenance.js — Agent Y-049 (Swarm — Mega-ERP Techno-Kol Uzi)
 * Property Maintenance Request System
 *
 * מערכת קריאות אחזקה לנדל"ן
 * ---------------------------------------------------
 *  - Tenant-originated maintenance request lifecycle
 *  - Categories:  plumbing | electrical | hvac | structural |
 *                 appliance | pest | common-area | other
 *  - Priority tiers with SLA:
 *      emergency   — 4h
 *      urgent      — 24h
 *      normal      — 72h
 *      low         — 7d
 *  - Vendor assignment from supplier catalog (ONYX bridge)
 *  - Visit scheduling + completion reporting
 *  - Cost split under Israeli tenancy law (חוק השכירות והשאילה)
 *  - Recurring-issue pattern detection
 *  - Property-level cost aggregation
 *  - Hebrew printable work order (plain text, zero deps)
 *
 *  House rule: לא מוחקים — רק משדרגים ומגדלים.
 *  No request is ever deleted. `cancelRequest()` soft-cancels only,
 *  every state transition is appended to `request.history[]`.
 *
 *  Zero external dependencies. Pure CommonJS.
 *
 *  Data model (in-memory store, JSON-serializable):
 *
 *  MaintenanceRequest:
 *    { id, propertyId, unit, tenant:{name,phone,email},
 *      category, description_he, description_en?,
 *      priority, status, photos:[], reportedAt, updatedAt,
 *      slaDueAt, slaBreachedAt?, vendorId?, estimatedCost?,
 *      scheduledAt?, scheduleNotes?, completedAt?, completion?,
 *      costSplit?, workOrderNumber, history:[...] }
 *
 *  Every mutation pushes a new event onto `history[]`:
 *    { at, actor, action, before, after, note }
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  Constants / enums
// ─────────────────────────────────────────────────────────────

const CATEGORIES = Object.freeze([
  'plumbing',
  'electrical',
  'hvac',
  'structural',
  'appliance',
  'pest',
  'common-area',
  'other',
]);

const CATEGORY_HE = Object.freeze({
  plumbing: 'אינסטלציה',
  electrical: 'חשמל',
  hvac: 'מיזוג אוויר',
  structural: 'מבני / שלד',
  appliance: 'מכשיר חשמלי',
  pest: 'הדברה',
  'common-area': 'שטחים משותפים',
  other: 'אחר',
});

const PRIORITIES = Object.freeze(['emergency', 'urgent', 'normal', 'low']);

const PRIORITY_HE = Object.freeze({
  emergency: 'חירום',
  urgent: 'דחוף',
  normal: 'רגיל',
  low: 'נמוך',
});

// SLA in milliseconds (and hours for reporting)
const SLA_MS = Object.freeze({
  emergency: 4 * 60 * 60 * 1000,           //  4h
  urgent: 24 * 60 * 60 * 1000,             // 24h
  normal: 72 * 60 * 60 * 1000,             // 72h
  low: 7 * 24 * 60 * 60 * 1000,            //  7d
});

const SLA_HOURS = Object.freeze({
  emergency: 4,
  urgent: 24,
  normal: 72,
  low: 168,
});

const STATUS = Object.freeze({
  OPEN: 'open',
  ASSIGNED: 'assigned',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
});

const STATUS_HE = Object.freeze({
  open: 'פתוחה',
  assigned: 'שובץ ספק',
  scheduled: 'נקבע ביקור',
  'in-progress': 'בביצוע',
  completed: 'הושלמה',
  closed: 'סגורה',
  cancelled: 'בוטלה',
});

// Israeli tenancy-law default split per category (חוק השכירות והשאילה, תשל"א-1971)
//  landlord (משכיר) vs tenant (שוכר)
//  These are DEFAULTS; splitCost() accepts an explicit override.
//  Rule of thumb:
//   • Structural / habitability / shared infrastructure  → landlord 100%.
//   • Normal wear-and-tear / misuse / consumables        → tenant 100%.
//   • Appliances provided with the apartment             → landlord majority.
//   • Pest infestation common to the building            → landlord;
//     pest issue caused by tenant housekeeping           → tenant.
const DEFAULT_SPLIT_BY_CATEGORY = Object.freeze({
  plumbing:       { landlord: 80, tenant: 20 }, // pipes/water heater = landlord; clogs by misuse = tenant share
  electrical:     { landlord: 90, tenant: 10 }, // fixed wiring = landlord
  hvac:           { landlord: 80, tenant: 20 }, // central AC unit = landlord, filters = tenant
  structural:     { landlord: 100, tenant: 0 }, // 100% landlord per law
  appliance:      { landlord: 70, tenant: 30 }, // only if landlord-supplied
  pest:           { landlord: 50, tenant: 50 }, // depends on cause — default balanced
  'common-area':  { landlord: 100, tenant: 0 }, // ועד בית / landlord
  other:          { landlord: 50, tenant: 50 }, // neutral default
});

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function _now() { return Date.now(); }

function _iso(ts) { return new Date(ts).toISOString(); }

function _toTs(v) {
  if (v == null) return _now();
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) throw new Error(`maintenance: invalid date ${v}`);
  return t;
}

function _uid(prefix) {
  // deterministic-ish ID — counter + timestamp; zero-dep
  _uid._n = (_uid._n || 0) + 1;
  return `${prefix}-${Date.now().toString(36)}-${_uid._n.toString(36)}`;
}

function _round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function _clone(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}

function _assert(cond, msg) {
  if (!cond) throw new Error(`maintenance: ${msg}`);
}

// Hebrew right-pad for aligned plain-text work orders (RTL-friendly: just pad raw).
function _hePad(s, n) {
  const str = String(s == null ? '' : s);
  if (str.length >= n) return str;
  return str + ' '.repeat(n - str.length);
}

// ─────────────────────────────────────────────────────────────
//  Main class
// ─────────────────────────────────────────────────────────────

class MaintenanceRequests {
  constructor(opts = {}) {
    this._store = new Map();          // id -> request
    this._workOrderSeq = 0;
    this._vendorCatalog = opts.vendorCatalog || null; // optional injected supplier catalog
    this._clock = typeof opts.clock === 'function' ? opts.clock : _now;
  }

  // --- internal ---
  _t() { return this._clock(); }

  _push(req, action, note, extra) {
    req.history.push({
      at: _iso(this._t()),
      action,
      note: note || null,
      ...(extra ? { extra } : {}),
    });
    req.updatedAt = _iso(this._t());
  }

  _require(id) {
    const r = this._store.get(id);
    _assert(r, `request not found: ${id}`);
    return r;
  }

  // ─────────────────────────────────────────────────────────
  //  createRequest
  // ─────────────────────────────────────────────────────────
  createRequest({
    propertyId,
    unit,
    tenant,
    category,
    description_he,
    description_en,
    priority,
    photos,
    reportedAt,
  } = {}) {
    _assert(propertyId, 'propertyId required');
    _assert(unit, 'unit required');
    _assert(tenant && (tenant.name || tenant.phone), 'tenant.name or tenant.phone required');
    _assert(CATEGORIES.includes(category), `invalid category "${category}"`);
    _assert(PRIORITIES.includes(priority), `invalid priority "${priority}"`);
    _assert(description_he && description_he.trim().length >= 1, 'description_he required');

    const reportedTs = _toTs(reportedAt);
    const slaDueTs = reportedTs + SLA_MS[priority];
    const id = _uid('MR');
    this._workOrderSeq += 1;
    const workOrderNumber = `WO-${new Date(reportedTs).getFullYear()}-${String(this._workOrderSeq).padStart(5, '0')}`;

    const req = {
      id,
      workOrderNumber,
      propertyId,
      unit,
      tenant: {
        name: tenant.name || null,
        phone: tenant.phone || null,
        email: tenant.email || null,
      },
      category,
      description_he,
      description_en: description_en || null,
      priority,
      status: STATUS.OPEN,
      photos: Array.isArray(photos) ? photos.slice() : [],
      reportedAt: _iso(reportedTs),
      updatedAt: _iso(this._t()),
      slaDueAt: _iso(slaDueTs),
      slaBreachedAt: null,
      vendorId: null,
      estimatedCost: null,
      scheduledAt: null,
      scheduleNotes: null,
      completedAt: null,
      completion: null,
      costSplit: null,
      history: [],
    };

    req.history.push({
      at: _iso(this._t()),
      action: 'created',
      note: `${PRIORITY_HE[priority]} / ${CATEGORY_HE[category]}`,
    });

    this._store.set(id, req);
    return _clone(req);
  }

  // ─────────────────────────────────────────────────────────
  //  assignVendor  — from supplier catalog (if attached)
  // ─────────────────────────────────────────────────────────
  assignVendor(requestId, vendorId, estimatedCost) {
    const req = this._require(requestId);
    _assert(vendorId, 'vendorId required');
    _assert(Number.isFinite(Number(estimatedCost)) && Number(estimatedCost) >= 0,
      'estimatedCost must be a non-negative number');

    // If a vendor catalog is injected, verify vendor exists.
    if (this._vendorCatalog) {
      const has =
        typeof this._vendorCatalog.hasSupplier === 'function'
          ? this._vendorCatalog.hasSupplier(vendorId)
          : typeof this._vendorCatalog.get === 'function'
            ? !!this._vendorCatalog.get(vendorId)
            : true;
      _assert(has, `vendor ${vendorId} not in supplier catalog`);
    }

    req.vendorId = vendorId;
    req.estimatedCost = _round2(Number(estimatedCost));
    if (req.status === STATUS.OPEN) req.status = STATUS.ASSIGNED;
    this._push(req, 'vendor-assigned', `vendor=${vendorId} est=₪${req.estimatedCost}`);
    return _clone(req);
  }

  // ─────────────────────────────────────────────────────────
  //  scheduleVisit
  // ─────────────────────────────────────────────────────────
  scheduleVisit(requestId, date, notes) {
    const req = this._require(requestId);
    _assert(req.vendorId, 'assign a vendor before scheduling a visit');
    const ts = _toTs(date);
    req.scheduledAt = _iso(ts);
    req.scheduleNotes = notes || null;
    if (req.status === STATUS.ASSIGNED) req.status = STATUS.SCHEDULED;
    this._push(req, 'visit-scheduled', `scheduled=${req.scheduledAt}`);
    return _clone(req);
  }

  // ─────────────────────────────────────────────────────────
  //  recordCompletion
  // ─────────────────────────────────────────────────────────
  recordCompletion(requestId, {
    workPerformed,
    partsUsed,
    laborHours,
    totalCost,
    photos,
    tenantSignature,
  } = {}) {
    const req = this._require(requestId);
    _assert(workPerformed && String(workPerformed).trim().length > 0,
      'workPerformed required');
    _assert(Number.isFinite(Number(totalCost)) && Number(totalCost) >= 0,
      'totalCost must be a non-negative number');
    _assert(Number.isFinite(Number(laborHours)) && Number(laborHours) >= 0,
      'laborHours must be a non-negative number');

    const completedTs = this._t();
    req.completion = {
      workPerformed: String(workPerformed),
      partsUsed: Array.isArray(partsUsed) ? partsUsed.slice() : [],
      laborHours: _round2(Number(laborHours)),
      totalCost: _round2(Number(totalCost)),
      photos: Array.isArray(photos) ? photos.slice() : [],
      tenantSignature: tenantSignature || null,
    };
    req.completedAt = _iso(completedTs);
    req.status = STATUS.COMPLETED;

    // SLA check at the moment of completion
    const dueTs = Date.parse(req.slaDueAt);
    if (completedTs > dueTs) {
      req.slaBreachedAt = req.slaBreachedAt || _iso(dueTs);
    }

    this._push(req, 'completed', `cost=₪${req.completion.totalCost} hrs=${req.completion.laborHours}`);
    return _clone(req);
  }

  // ─────────────────────────────────────────────────────────
  //  splitCost — Israeli landlord-tenant responsibility law
  //
  //  If landlordPct/tenantPct are supplied, they are validated to
  //  sum to 100; otherwise the category default is used.
  //  חוק השכירות והשאילה, תשל"א-1971:
  //    סעיף 7(א) — המשכיר חייב לתקן ליקויים במושכר ובדרכי הגישה אליו.
  //    סעיף 8   — השוכר חייב להחזיר את המושכר כפי שקיבל חוץ משינויים שאינם
  //                בעיות בלאי סביר.
  //  So: structural/core systems → landlord; misuse / wear&tear → tenant.
  // ─────────────────────────────────────────────────────────
  splitCost(requestId, split) {
    const req = this._require(requestId);
    _assert(req.completion && Number.isFinite(req.completion.totalCost),
      'cost split requires recordCompletion() with totalCost');

    let landlordPct;
    let tenantPct;
    let source;

    if (split && (split.landlordPct != null || split.tenantPct != null)) {
      landlordPct = Number(split.landlordPct);
      tenantPct = Number(split.tenantPct);
      _assert(Number.isFinite(landlordPct) && Number.isFinite(tenantPct),
        'landlordPct and tenantPct must be numbers');
      _assert(landlordPct >= 0 && landlordPct <= 100, 'landlordPct out of range');
      _assert(tenantPct >= 0 && tenantPct <= 100, 'tenantPct out of range');
      _assert(Math.round(landlordPct + tenantPct) === 100,
        `landlordPct + tenantPct must = 100 (got ${landlordPct + tenantPct})`);
      source = 'override';
    } else {
      const def = DEFAULT_SPLIT_BY_CATEGORY[req.category];
      landlordPct = def.landlord;
      tenantPct = def.tenant;
      source = 'default-by-category';
    }

    const total = req.completion.totalCost;
    const landlordShare = _round2((total * landlordPct) / 100);
    // guarantee shares sum exactly to total (fix rounding penny)
    const tenantShare = _round2(total - landlordShare);

    req.costSplit = {
      total,
      landlordPct,
      tenantPct,
      landlordShare,
      tenantShare,
      source,
      basis_he: 'חוק השכירות והשאילה, תשל"א-1971',
      basis_en: 'Rental and Loan Law, 5731-1971',
      category: req.category,
      computedAt: _iso(this._t()),
    };
    this._push(req, 'cost-split', `landlord=₪${landlordShare} tenant=₪${tenantShare} (${source})`);
    return _clone(req.costSplit);
  }

  // ─────────────────────────────────────────────────────────
  //  slaTracker — returns snapshot for every open / non-closed request
  // ─────────────────────────────────────────────────────────
  slaTracker() {
    const now = this._t();
    const out = [];
    for (const req of this._store.values()) {
      // Completed+closed requests we still report on once (as historical),
      // but the "breach" flag is frozen at completion time.
      const dueTs = Date.parse(req.slaDueAt);
      const reportedTs = Date.parse(req.reportedAt);
      const breached =
        !!req.slaBreachedAt ||
        (req.status !== STATUS.COMPLETED &&
          req.status !== STATUS.CLOSED &&
          req.status !== STATUS.CANCELLED &&
          now > dueTs);

      // If we detected a live breach, persist it on the request.
      if (
        breached &&
        !req.slaBreachedAt &&
        req.status !== STATUS.COMPLETED &&
        req.status !== STATUS.CLOSED &&
        req.status !== STATUS.CANCELLED
      ) {
        req.slaBreachedAt = _iso(dueTs);
        this._push(req, 'sla-breached', `due=${req.slaDueAt}`);
      }

      const minutesTotal = Math.round((dueTs - reportedTs) / 60000);
      const minutesRemaining = Math.round((dueTs - now) / 60000);

      out.push({
        id: req.id,
        workOrderNumber: req.workOrderNumber,
        propertyId: req.propertyId,
        unit: req.unit,
        category: req.category,
        priority: req.priority,
        status: req.status,
        reportedAt: req.reportedAt,
        slaDueAt: req.slaDueAt,
        slaHours: SLA_HOURS[req.priority],
        minutesTotal,
        minutesRemaining,
        breached,
        breachedAt: req.slaBreachedAt,
      });
    }
    // Most urgent (least time remaining) first
    out.sort((a, b) => a.minutesRemaining - b.minutesRemaining);
    return out;
  }

  // ─────────────────────────────────────────────────────────
  //  costAggregation(propertyId, period)
  //    period: { from, to }   // ISO strings / Date / ms
  // ─────────────────────────────────────────────────────────
  costAggregation(propertyId, period = {}) {
    _assert(propertyId, 'propertyId required');
    const fromTs = period.from != null ? _toTs(period.from) : -Infinity;
    const toTs = period.to != null ? _toTs(period.to) : Infinity;

    const byCategory = {};
    let total = 0;
    let landlordTotal = 0;
    let tenantTotal = 0;
    let count = 0;
    let breached = 0;

    for (const req of this._store.values()) {
      if (req.propertyId !== propertyId) continue;
      const reportedTs = Date.parse(req.reportedAt);
      if (reportedTs < fromTs || reportedTs > toTs) continue;
      count += 1;
      if (req.slaBreachedAt) breached += 1;

      const cost = req.completion ? req.completion.totalCost : 0;
      total = _round2(total + cost);
      byCategory[req.category] = _round2((byCategory[req.category] || 0) + cost);

      if (req.costSplit) {
        landlordTotal = _round2(landlordTotal + req.costSplit.landlordShare);
        tenantTotal = _round2(tenantTotal + req.costSplit.tenantShare);
      } else if (req.completion) {
        // uncategorised - default-by-category preview for reporting only
        const def = DEFAULT_SPLIT_BY_CATEGORY[req.category];
        landlordTotal = _round2(landlordTotal + (cost * def.landlord) / 100);
        tenantTotal = _round2(tenantTotal + (cost * def.tenant) / 100);
      }
    }

    return {
      propertyId,
      period: {
        from: Number.isFinite(fromTs) ? _iso(fromTs) : null,
        to: Number.isFinite(toTs) ? _iso(toTs) : null,
      },
      count,
      breachedCount: breached,
      total,
      landlordTotal,
      tenantTotal,
      byCategory,
      currency: 'ILS',
    };
  }

  // ─────────────────────────────────────────────────────────
  //  recurringIssues(propertyId)
  //    Pattern-detection: same category appearing ≥3 times
  //    OR same category+unit appearing ≥2 times within 180 days.
  // ─────────────────────────────────────────────────────────
  recurringIssues(propertyId) {
    _assert(propertyId, 'propertyId required');
    const buckets = new Map(); // key = category|unit
    const categoryTotals = new Map(); // category -> count
    const categoryCost = new Map();   // category -> total cost
    const categoryLastTs = new Map(); // category -> last reported ts

    for (const req of this._store.values()) {
      if (req.propertyId !== propertyId) continue;
      const key = `${req.category}|${req.unit}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(req);
      categoryTotals.set(req.category, (categoryTotals.get(req.category) || 0) + 1);
      categoryCost.set(req.category, (categoryCost.get(req.category) || 0) +
        (req.completion ? req.completion.totalCost : 0));
      const ts = Date.parse(req.reportedAt);
      if (!categoryLastTs.has(req.category) || ts > categoryLastTs.get(req.category)) {
        categoryLastTs.set(req.category, ts);
      }
    }

    const WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
    const patterns = [];

    // 1) unit-level hot spots (≥2 same category+unit within 180d)
    for (const [key, arr] of buckets.entries()) {
      if (arr.length < 2) continue;
      const sorted = arr.slice().sort((a, b) => Date.parse(a.reportedAt) - Date.parse(b.reportedAt));
      const spanMs = Date.parse(sorted[sorted.length - 1].reportedAt) - Date.parse(sorted[0].reportedAt);
      if (spanMs <= WINDOW_MS) {
        const [category, unit] = key.split('|');
        patterns.push({
          kind: 'unit-hotspot',
          category,
          unit,
          count: arr.length,
          spanDays: Math.round(spanMs / 86400000),
          requestIds: sorted.map((r) => r.id),
          message_he: `${CATEGORY_HE[category]} ביחידה ${unit} — ${arr.length} קריאות בתוך ${Math.round(spanMs / 86400000)} ימים`,
          message_en: `${category} at unit ${unit} — ${arr.length} calls within ${Math.round(spanMs / 86400000)} days`,
        });
      }
    }

    // 2) property-level chronic category (≥3 total of same category)
    for (const [category, n] of categoryTotals.entries()) {
      if (n >= 3) {
        patterns.push({
          kind: 'chronic-category',
          category,
          count: n,
          totalCost: _round2(categoryCost.get(category) || 0),
          lastReportedAt: _iso(categoryLastTs.get(category)),
          message_he: `בעיה כרונית בקטגוריית ${CATEGORY_HE[category]} — ${n} קריאות בנכס`,
          message_en: `Chronic ${category} issue — ${n} calls on property`,
        });
      }
    }

    patterns.sort((a, b) => b.count - a.count);
    return {
      propertyId,
      patterns,
      totalRequests: [...this._store.values()].filter((r) => r.propertyId === propertyId).length,
    };
  }

  // ─────────────────────────────────────────────────────────
  //  generateWorkOrderPDF
  //    Returns { id, workOrderNumber, content, mime, filename }
  //    `content` is a printable plain-text (UTF-8) Hebrew work order
  //    suitable for wkhtmltopdf, node-pdfkit, or raw printer. Zero-dep
  //    here — we never bundle a PDF library; downstream bridges can
  //    wrap this in a real PDF.
  // ─────────────────────────────────────────────────────────
  generateWorkOrderPDF(requestId) {
    const req = this._require(requestId);
    const lines = [];
    const sep = '='.repeat(60);
    const hr = '-'.repeat(60);

    lines.push(sep);
    lines.push(_hePad(`הזמנת עבודה / Work Order  ${req.workOrderNumber}`, 60));
    lines.push(sep);
    lines.push('');
    lines.push(`תאריך דיווח / Reported:   ${req.reportedAt}`);
    lines.push(`סטטוס / Status:            ${STATUS_HE[req.status]} (${req.status})`);
    lines.push(`עדיפות / Priority:         ${PRIORITY_HE[req.priority]} (${req.priority})`);
    lines.push(`יעד SLA / SLA Due:         ${req.slaDueAt}`);
    lines.push('');
    lines.push(hr);
    lines.push('נכס / Property');
    lines.push(hr);
    lines.push(`מזהה נכס / Property ID:    ${req.propertyId}`);
    lines.push(`יחידה / Unit:              ${req.unit}`);
    lines.push('');
    lines.push(hr);
    lines.push('דייר / Tenant');
    lines.push(hr);
    lines.push(`שם / Name:                 ${req.tenant.name || '-'}`);
    lines.push(`טלפון / Phone:             ${req.tenant.phone || '-'}`);
    lines.push(`דוא"ל / Email:             ${req.tenant.email || '-'}`);
    lines.push('');
    lines.push(hr);
    lines.push('תיאור הבעיה / Issue');
    lines.push(hr);
    lines.push(`קטגוריה / Category:        ${CATEGORY_HE[req.category]} (${req.category})`);
    lines.push(`תיאור / Description (HE):  ${req.description_he}`);
    if (req.description_en) {
      lines.push(`Description (EN):           ${req.description_en}`);
    }
    if (req.photos && req.photos.length) {
      lines.push(`תמונות / Photos:           ${req.photos.length} קבצים`);
    }
    lines.push('');
    if (req.vendorId) {
      lines.push(hr);
      lines.push('ספק שובץ / Assigned Vendor');
      lines.push(hr);
      lines.push(`מזהה ספק / Vendor ID:      ${req.vendorId}`);
      lines.push(`עלות משוערת / Est. Cost:   ₪${_round2(req.estimatedCost || 0).toFixed(2)}`);
      if (req.scheduledAt) {
        lines.push(`מועד ביקור / Scheduled:    ${req.scheduledAt}`);
      }
      if (req.scheduleNotes) {
        lines.push(`הערות / Notes:             ${req.scheduleNotes}`);
      }
      lines.push('');
    }
    if (req.completion) {
      lines.push(hr);
      lines.push('דוח ביצוע / Completion Report');
      lines.push(hr);
      lines.push(`תאריך ביצוע / Completed:   ${req.completedAt}`);
      lines.push(`עבודה שבוצעה / Work:       ${req.completion.workPerformed}`);
      if (req.completion.partsUsed.length) {
        lines.push(`חלפים / Parts:`);
        for (const p of req.completion.partsUsed) {
          const name = p && p.name ? p.name : String(p);
          const qty = p && p.qty != null ? ` × ${p.qty}` : '';
          const cost = p && p.cost != null ? ` — ₪${_round2(p.cost).toFixed(2)}` : '';
          lines.push(`  • ${name}${qty}${cost}`);
        }
      }
      lines.push(`שעות עבודה / Labor (h):    ${req.completion.laborHours}`);
      lines.push(`עלות כוללת / Total Cost:   ₪${req.completion.totalCost.toFixed(2)}`);
      if (req.completion.tenantSignature) {
        lines.push(`חתימת דייר / Signature:    ${req.completion.tenantSignature}`);
      }
      lines.push('');
    }
    if (req.costSplit) {
      lines.push(hr);
      lines.push('חלוקת עלות / Cost Split');
      lines.push(hr);
      lines.push(`בסיס חוקי / Legal Basis:   ${req.costSplit.basis_he}`);
      lines.push(`חלק המשכיר / Landlord:    ${req.costSplit.landlordPct}%  ₪${req.costSplit.landlordShare.toFixed(2)}`);
      lines.push(`חלק השוכר / Tenant:       ${req.costSplit.tenantPct}%  ₪${req.costSplit.tenantShare.toFixed(2)}`);
      lines.push('');
    }
    if (req.slaBreachedAt) {
      lines.push(hr);
      lines.push(`!!  חריגה מ-SLA / SLA BREACHED  !!  ${req.slaBreachedAt}`);
      lines.push('');
    }
    lines.push(sep);
    lines.push('לא מוחקים — רק משדרגים ומגדלים. | Never delete — only upgrade and grow.');
    lines.push(sep);

    const content = lines.join('\n');
    return {
      id: req.id,
      workOrderNumber: req.workOrderNumber,
      content,
      mime: 'text/plain; charset=utf-8',
      filename: `${req.workOrderNumber}.txt`,
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Read-only accessors + soft-cancel
  // ─────────────────────────────────────────────────────────
  getRequest(id) {
    return _clone(this._store.get(id) || null);
  }

  listRequests(filter = {}) {
    const out = [];
    for (const r of this._store.values()) {
      if (filter.propertyId && r.propertyId !== filter.propertyId) continue;
      if (filter.status && r.status !== filter.status) continue;
      if (filter.category && r.category !== filter.category) continue;
      if (filter.priority && r.priority !== filter.priority) continue;
      out.push(_clone(r));
    }
    return out;
  }

  // NEVER deletes — only marks as cancelled.
  cancelRequest(requestId, reason) {
    const req = this._require(requestId);
    _assert(req.status !== STATUS.COMPLETED && req.status !== STATUS.CLOSED,
      'cannot cancel a completed/closed request');
    req.status = STATUS.CANCELLED;
    this._push(req, 'cancelled', reason || 'no reason provided');
    return _clone(req);
  }

  closeRequest(requestId) {
    const req = this._require(requestId);
    _assert(req.status === STATUS.COMPLETED, 'close only after completion');
    req.status = STATUS.CLOSED;
    this._push(req, 'closed', null);
    return _clone(req);
  }
}

module.exports = {
  MaintenanceRequests,
  CATEGORIES,
  CATEGORY_HE,
  PRIORITIES,
  PRIORITY_HE,
  SLA_MS,
  SLA_HOURS,
  STATUS,
  STATUS_HE,
  DEFAULT_SPLIT_BY_CATEGORY,
};
