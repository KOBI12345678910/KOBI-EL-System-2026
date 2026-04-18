/* ============================================================================
 * Techno-Kol ERP — Manufacturing Routing & Work Center Manager
 * Agent Y-032 / Swarm Manufacturing / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מנהל ניתובי ייצור ומרכזי עבודה — מפעל מתכת "טכנו-קול עוזי"
 *
 * Domain:
 *   Metal fabrication shop floor. A Routing is an ordered sequence of
 *   Operations (חיתוך, ריתוך, כיפוף, צביעה, ...) that transform raw
 *   stock into a finished SKU. Each Operation runs at a Work Center
 *   (מרכז עבודה) with a labour/machine hourly rate, a setup buffer,
 *   and a daily capacity ceiling.
 *
 * Features implemented:
 *   1. defineWorkCenter        — register cutting / welding / bending / ...
 *   2. createRouting           — bind operations to a SKU
 *   3. computeLeadTime         — total wall-clock hours for a given qty
 *   4. computeCost             — labour + machine cost rollup
 *   5. utilizationReport       — actual vs capacity for a WC in a period
 *   6. operationList           — flattened list for the work-order / traveler
 *   7. reorderOperations       — change seq while preserving history
 *   8. alternativeRouting      — register fallback routings for breakdowns
 *   9. selectRouting           — pick primary / alt1 / alt2 given availability
 *  10. logProductionHours      — feed actuals back for utilization math
 *
 * Israeli metal-fab operation types (ten canonical):
 *   - חיתוך לייזר        Laser cutting
 *   - חיתוך פלזמה        Plasma cutting
 *   - כרסום CNC          CNC milling
 *   - כיפוף               Bending / press-brake
 *   - ריתוך MIG/TIG       MIG/TIG welding
 *   - צביעה באבקה         Powder coating
 *   - גלוון חם            Hot-dip galvanizing
 *   - ציפוי               Plating / coating
 *   - הרכבה               Assembly
 *   - בקרת איכות          Quality control (QC)
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. Routings are versioned; reorder records
 *     its previous shape in a history stack so auditors can replay it.
 *   - Zero external dependencies (pure Node built-ins only).
 *   - Bilingual Hebrew / English on every structure.
 *   - Times are hours (decimal); costs are ILS (decimal).
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Immutable catalog — Work Center Types
 * -------------------------------------------------------------------------- */
const WORK_CENTER_TYPES = Object.freeze({
  cutting:  { id: 'cutting',  he: 'חיתוך',        en: 'Cutting' },
  welding:  { id: 'welding',  he: 'ריתוך',        en: 'Welding' },
  bending:  { id: 'bending',  he: 'כיפוף',        en: 'Bending' },
  drilling: { id: 'drilling', he: 'קידוח/כרסום',  en: 'Drilling/Milling' },
  grinding: { id: 'grinding', he: 'ליטוש',        en: 'Grinding' },
  painting: { id: 'painting', he: 'צביעה',        en: 'Painting' },
  assembly: { id: 'assembly', he: 'הרכבה',        en: 'Assembly' },
  qc:       { id: 'qc',       he: 'בקרת איכות',   en: 'Quality Control' },
});

/* ----------------------------------------------------------------------------
 * 1. Israeli metal-fab operation name catalog (seed, can be extended)
 * -------------------------------------------------------------------------- */
const OPERATION_CATALOG = Object.freeze({
  laser_cut:     { he: 'חיתוך לייזר',     en: 'Laser cutting',    wcType: 'cutting'  },
  plasma_cut:    { he: 'חיתוך פלזמה',      en: 'Plasma cutting',   wcType: 'cutting'  },
  cnc_mill:      { he: 'כרסום CNC',         en: 'CNC milling',      wcType: 'drilling' },
  bending:       { he: 'כיפוף',             en: 'Press-brake bend', wcType: 'bending'  },
  mig_weld:      { he: 'ריתוך MIG',         en: 'MIG welding',      wcType: 'welding'  },
  tig_weld:      { he: 'ריתוך TIG',         en: 'TIG welding',      wcType: 'welding'  },
  powder_coat:   { he: 'צביעה באבקה',       en: 'Powder coating',   wcType: 'painting' },
  hot_galvanize: { he: 'גלוון חם',          en: 'Hot-dip galvanize',wcType: 'painting' },
  plating:       { he: 'ציפוי',             en: 'Plating',          wcType: 'painting' },
  assembly:      { he: 'הרכבה',             en: 'Assembly',         wcType: 'assembly' },
  qc:            { he: 'בקרת איכות',        en: 'Quality control',  wcType: 'qc'       },
  grinding:      { he: 'ליטוש',             en: 'Grinding',         wcType: 'grinding' },
});

/* ----------------------------------------------------------------------------
 * 2. Tiny helpers (no deps)
 * -------------------------------------------------------------------------- */
function _now() { return new Date().toISOString(); }

function _assertNum(v, name) {
  if (typeof v !== 'number' || !isFinite(v) || v < 0) {
    throw new TypeError('invalid ' + name + ': ' + v);
  }
}

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _round(n, decimals) {
  const f = Math.pow(10, decimals || 2);
  return Math.round(n * f) / f;
}

function _deepCopy(obj) {
  // Lightweight deep copy for plain JSON-safe structures (our data model).
  return JSON.parse(JSON.stringify(obj));
}

/* ----------------------------------------------------------------------------
 * 3. RoutingManager class
 * -------------------------------------------------------------------------- */
class RoutingManager {
  constructor() {
    /** @type {Map<string, WorkCenter>} */
    this.workCenters = new Map();
    /** @type {Map<string, Routing>} */
    this.routings = new Map();
    /** @type {Map<string, { primary:string, alt1?:string, alt2?:string }>} */
    this.skuAlternatives = new Map();
    /** @type {Array<ProductionLogEntry>} actuals for utilization */
    this.productionLog = [];
    /** @type {Array<AuditEntry>} never-delete audit log */
    this.auditLog = [];
  }

  /* ---------- audit helper ---------- */
  _audit(action, payload) {
    this.auditLog.push({ ts: _now(), action: action, payload: _deepCopy(payload) });
  }

  /* ==========================================================================
   * 3.1  defineWorkCenter
   * ========================================================================= */
  /**
   * Register a work center (a physical station on the shop floor).
   * @param {object} wc
   * @param {string} wc.id
   * @param {string} wc.name_he
   * @param {string} wc.name_en
   * @param {'cutting'|'welding'|'bending'|'drilling'|'grinding'|'painting'|'assembly'|'qc'} wc.type
   * @param {number} wc.hourlyRate          — ILS per hour (labour+machine blended)
   * @param {number} wc.capacityHoursPerDay — e.g. 8 for 1 shift, 16 for 2
   * @param {number} wc.setupBuffer         — constant setup hours per run
   */
  defineWorkCenter({ id, name_he, name_en, type, hourlyRate, capacityHoursPerDay, setupBuffer }) {
    _assertStr(id, 'workCenter.id');
    _assertStr(name_he, 'workCenter.name_he');
    _assertStr(name_en, 'workCenter.name_en');
    if (!WORK_CENTER_TYPES[type]) {
      throw new TypeError('invalid work center type: ' + type +
        ' (allowed: ' + Object.keys(WORK_CENTER_TYPES).join(', ') + ')');
    }
    _assertNum(hourlyRate, 'hourlyRate');
    _assertNum(capacityHoursPerDay, 'capacityHoursPerDay');
    _assertNum(setupBuffer, 'setupBuffer');

    const existing = this.workCenters.get(id);
    const wc = {
      id: id,
      name_he: name_he,
      name_en: name_en,
      type: type,
      typeLabel_he: WORK_CENTER_TYPES[type].he,
      typeLabel_en: WORK_CENTER_TYPES[type].en,
      hourlyRate: hourlyRate,
      capacityHoursPerDay: capacityHoursPerDay,
      setupBuffer: setupBuffer,
      available: true,                       // set false when broken down
      createdAt: existing ? existing.createdAt : _now(),
      updatedAt: _now(),
      history: existing ? existing.history.concat([existing]) : [],
    };
    this.workCenters.set(id, wc);
    this._audit('defineWorkCenter', { id: id });
    return wc;
  }

  /** Mark a work center broken-down / back-online (for alt routing fallback). */
  setWorkCenterAvailability(id, available) {
    const wc = this.workCenters.get(id);
    if (!wc) throw new Error('unknown work center: ' + id);
    wc.available = !!available;
    wc.updatedAt = _now();
    this._audit('setWorkCenterAvailability', { id: id, available: !!available });
    return wc;
  }

  /* ==========================================================================
   * 3.2  createRouting
   * ========================================================================= */
  /**
   * @param {object} r
   * @param {string} r.id
   * @param {string} r.sku
   * @param {Array<{
   *   seq: number,
   *   workCenterId: string,
   *   operationName_he: string,
   *   operationName_en: string,
   *   setupTime: number,          // hours
   *   runTimePerUnit: number,     // hours per unit
   *   description?: string
   * }>} r.operations
   */
  createRouting({ id, sku, operations }) {
    _assertStr(id, 'routing.id');
    _assertStr(sku, 'routing.sku');
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new TypeError('routing.operations must be a non-empty array');
    }
    operations.forEach((op, idx) => {
      _assertNum(op.seq, 'operations[' + idx + '].seq');
      _assertStr(op.workCenterId, 'operations[' + idx + '].workCenterId');
      if (!this.workCenters.has(op.workCenterId)) {
        throw new Error('operations[' + idx + '].workCenterId unknown: ' + op.workCenterId);
      }
      _assertStr(op.operationName_he, 'operations[' + idx + '].operationName_he');
      _assertStr(op.operationName_en, 'operations[' + idx + '].operationName_en');
      _assertNum(op.setupTime, 'operations[' + idx + '].setupTime');
      _assertNum(op.runTimePerUnit, 'operations[' + idx + '].runTimePerUnit');
    });

    const existing = this.routings.get(id);
    // Operation deep-copy so callers can't mutate from outside.
    const ops = operations
      .map((op) => ({
        seq: op.seq,
        workCenterId: op.workCenterId,
        operationName_he: op.operationName_he,
        operationName_en: op.operationName_en,
        setupTime: op.setupTime,
        runTimePerUnit: op.runTimePerUnit,
        description: op.description || '',
      }))
      .sort((a, b) => a.seq - b.seq);

    const routing = {
      id: id,
      sku: sku,
      operations: ops,
      version: existing ? existing.version + 1 : 1,
      createdAt: existing ? existing.createdAt : _now(),
      updatedAt: _now(),
      history: existing ? existing.history.concat([_deepCopy(existing)]) : [],
      active: true,
    };
    this.routings.set(id, routing);

    // Default sku->alternatives binding if none exists yet.
    if (!this.skuAlternatives.has(sku)) {
      this.skuAlternatives.set(sku, { primary: id });
    }
    this._audit('createRouting', { id: id, sku: sku, version: routing.version });
    return routing;
  }

  /* ==========================================================================
   * 3.3  computeLeadTime
   * ========================================================================= */
  /**
   * Sum of (setupBuffer at WC + op.setupTime + op.runTimePerUnit * qty) across
   * all operations, in hours. Sequential model (no parallel work center use).
   */
  computeLeadTime({ routingId, qty }) {
    const routing = this._getRoutingOrThrow(routingId);
    _assertNum(qty, 'qty');
    if (qty <= 0) throw new RangeError('qty must be > 0');

    let totalHours = 0;
    const perOp = [];
    for (const op of routing.operations) {
      const wc = this.workCenters.get(op.workCenterId);
      if (!wc) throw new Error('routing references unknown WC: ' + op.workCenterId);
      const runHours = op.runTimePerUnit * qty;
      const opHours = wc.setupBuffer + op.setupTime + runHours;
      totalHours += opHours;
      perOp.push({
        seq: op.seq,
        workCenterId: wc.id,
        workCenter_he: wc.name_he,
        workCenter_en: wc.name_en,
        setupBuffer: wc.setupBuffer,
        setupTime: op.setupTime,
        runHours: _round(runHours, 4),
        opHours: _round(opHours, 4),
      });
    }

    return {
      routingId: routing.id,
      sku: routing.sku,
      qty: qty,
      totalHours: _round(totalHours, 4),
      perOperation: perOp,
    };
  }

  /* ==========================================================================
   * 3.4  computeCost
   * ========================================================================= */
  /**
   * Labour + machine cost rollup in ILS for a batch of `qty` units on routing.
   */
  computeCost({ routingId, qty }) {
    const routing = this._getRoutingOrThrow(routingId);
    _assertNum(qty, 'qty');
    if (qty <= 0) throw new RangeError('qty must be > 0');

    let totalCost = 0;
    let totalHours = 0;
    const perOp = [];
    for (const op of routing.operations) {
      const wc = this.workCenters.get(op.workCenterId);
      if (!wc) throw new Error('routing references unknown WC: ' + op.workCenterId);
      const opHours = wc.setupBuffer + op.setupTime + (op.runTimePerUnit * qty);
      const opCost = opHours * wc.hourlyRate;
      totalCost += opCost;
      totalHours += opHours;
      perOp.push({
        seq: op.seq,
        workCenterId: wc.id,
        workCenter_he: wc.name_he,
        hourlyRate: wc.hourlyRate,
        hours: _round(opHours, 4),
        cost: _round(opCost, 2),
      });
    }

    return {
      routingId: routing.id,
      sku: routing.sku,
      qty: qty,
      currency: 'ILS',
      totalHours: _round(totalHours, 4),
      totalCost: _round(totalCost, 2),
      costPerUnit: _round(totalCost / qty, 2),
      perOperation: perOp,
    };
  }

  /* ==========================================================================
   * 3.5  utilizationReport
   * ========================================================================= */
  /**
   * @param {string} workCenterId
   * @param {{ from:string, to:string, workingDays:number }} period — ISO dates
   */
  utilizationReport(workCenterId, period) {
    const wc = this.workCenters.get(workCenterId);
    if (!wc) throw new Error('unknown work center: ' + workCenterId);
    if (!period || !period.from || !period.to) {
      throw new TypeError('period {from,to,workingDays} required');
    }
    _assertNum(period.workingDays, 'period.workingDays');

    const fromTs = new Date(period.from).getTime();
    const toTs = new Date(period.to).getTime();
    if (!isFinite(fromTs) || !isFinite(toTs) || toTs < fromTs) {
      throw new RangeError('invalid period range');
    }

    let actualHours = 0;
    const entries = [];
    for (const rec of this.productionLog) {
      if (rec.workCenterId !== workCenterId) continue;
      const ts = new Date(rec.date).getTime();
      if (ts < fromTs || ts > toTs) continue;
      actualHours += rec.hours;
      entries.push(rec);
    }

    const capacityHours = wc.capacityHoursPerDay * period.workingDays;
    const utilizationPct = capacityHours > 0 ? (actualHours / capacityHours) * 100 : 0;

    return {
      workCenterId: wc.id,
      workCenter_he: wc.name_he,
      workCenter_en: wc.name_en,
      period_he: 'תקופה: ' + period.from + ' עד ' + period.to,
      period_en: 'Period: ' + period.from + ' to ' + period.to,
      workingDays: period.workingDays,
      capacityHours: _round(capacityHours, 2),
      actualHours: _round(actualHours, 2),
      idleHours: _round(Math.max(0, capacityHours - actualHours), 2),
      overloadHours: _round(Math.max(0, actualHours - capacityHours), 2),
      utilizationPct: _round(utilizationPct, 2),
      status_he: utilizationPct > 100 ? 'עומס יתר' : (utilizationPct > 85 ? 'גבוה' : (utilizationPct > 50 ? 'רגיל' : 'נמוך')),
      status_en: utilizationPct > 100 ? 'overloaded' : (utilizationPct > 85 ? 'high' : (utilizationPct > 50 ? 'normal' : 'low')),
      entries: entries,
    };
  }

  /** Add an actual production-hours record (feeder for utilizationReport). */
  logProductionHours({ workCenterId, date, hours, workOrderId }) {
    if (!this.workCenters.has(workCenterId)) {
      throw new Error('unknown work center: ' + workCenterId);
    }
    _assertNum(hours, 'hours');
    const rec = {
      workCenterId: workCenterId,
      date: date,
      hours: hours,
      workOrderId: workOrderId || null,
      loggedAt: _now(),
    };
    this.productionLog.push(rec);
    this._audit('logProductionHours', rec);
    return rec;
  }

  /* ==========================================================================
   * 3.6  operationList
   * ========================================================================= */
  /**
   * Flattened operation list for a given SKU — ready to paste into a
   * work-order traveler printout (תעודת עבודה).
   */
  operationList(sku) {
    _assertStr(sku, 'sku');
    const bundle = this.skuAlternatives.get(sku);
    if (!bundle) return [];
    const routing = this.routings.get(bundle.primary);
    if (!routing) return [];

    return routing.operations.map((op) => {
      const wc = this.workCenters.get(op.workCenterId);
      return {
        seq: op.seq,
        workCenterId: op.workCenterId,
        workCenter_he: wc ? wc.name_he : '',
        workCenter_en: wc ? wc.name_en : '',
        operationName_he: op.operationName_he,
        operationName_en: op.operationName_en,
        setupTime: op.setupTime,
        runTimePerUnit: op.runTimePerUnit,
        description: op.description,
      };
    });
  }

  /* ==========================================================================
   * 3.7  reorderOperations
   * ========================================================================= */
  /**
   * Reorder the ops inside a routing without losing the previous shape.
   * @param {string} routingId
   * @param {Array<{seq:number, workCenterId:string}>} newSequence
   *        Array describing the new order — must contain exactly the same
   *        (workCenterId, original-seq) tuples as the current routing.
   */
  reorderOperations(routingId, newSequence) {
    const routing = this._getRoutingOrThrow(routingId);
    if (!Array.isArray(newSequence) || newSequence.length !== routing.operations.length) {
      throw new TypeError('newSequence must match length of existing operations');
    }

    // snapshot old routing into history before mutation
    routing.history.push(_deepCopy({
      version: routing.version,
      operations: routing.operations,
      snapshotAt: _now(),
    }));

    // Build index by original seq so caller can refer to ops by old seq.
    const byOldSeq = new Map(routing.operations.map((op) => [op.seq, op]));

    const reordered = newSequence.map((entry, idx) => {
      const src = byOldSeq.get(entry.seq);
      if (!src) {
        throw new Error('reorderOperations: unknown old seq ' + entry.seq);
      }
      // New seq = idx+1 (caller can also supply seq field, honoured if given)
      return Object.assign({}, src, { seq: typeof entry.newSeq === 'number' ? entry.newSeq : (idx + 1) });
    });

    routing.operations = reordered.sort((a, b) => a.seq - b.seq);
    routing.version += 1;
    routing.updatedAt = _now();
    this._audit('reorderOperations', { routingId: routingId, version: routing.version });
    return routing;
  }

  /* ==========================================================================
   * 3.8  alternativeRouting
   * ========================================================================= */
  /**
   * Register alternative routings for a SKU so a machine breakdown can
   * fall back to alt1 / alt2.
   * @param {{ sku:string, alt1:string, alt2?:string }} bundle
   */
  alternativeRouting({ sku, alt1, alt2 }) {
    _assertStr(sku, 'sku');
    _assertStr(alt1, 'alt1');
    // Primary routing must already exist
    const existing = this.skuAlternatives.get(sku);
    if (!existing) {
      throw new Error('alternativeRouting: sku ' + sku + ' has no primary routing yet — call createRouting first');
    }
    if (!this.routings.has(alt1)) throw new Error('alt1 routing not found: ' + alt1);
    if (alt2 && !this.routings.has(alt2)) throw new Error('alt2 routing not found: ' + alt2);

    const bundle = {
      primary: existing.primary,
      alt1: alt1,
      alt2: alt2 || undefined,
    };
    this.skuAlternatives.set(sku, bundle);
    this._audit('alternativeRouting', { sku: sku, bundle: bundle });
    return bundle;
  }

  /**
   * Selects which routing to actually run based on current work-center
   * availability. Returns the first routing whose WCs are all available.
   */
  selectRouting(sku) {
    const bundle = this.skuAlternatives.get(sku);
    if (!bundle) throw new Error('no routings registered for sku: ' + sku);
    const tryOrder = [bundle.primary, bundle.alt1, bundle.alt2].filter(Boolean);
    for (const rid of tryOrder) {
      const r = this.routings.get(rid);
      if (!r) continue;
      const allAvailable = r.operations.every((op) => {
        const wc = this.workCenters.get(op.workCenterId);
        return wc && wc.available === true;
      });
      if (allAvailable) {
        return { routingId: rid, tier: rid === bundle.primary ? 'primary' : (rid === bundle.alt1 ? 'alt1' : 'alt2') };
      }
    }
    return { routingId: null, tier: null, reason: 'no routing has all work centers available' };
  }

  /* ---------- internal ---------- */
  _getRoutingOrThrow(routingId) {
    const r = this.routings.get(routingId);
    if (!r) throw new Error('unknown routing: ' + routingId);
    return r;
  }
}

/* ----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  RoutingManager: RoutingManager,
  WORK_CENTER_TYPES: WORK_CENTER_TYPES,
  OPERATION_CATALOG: OPERATION_CATALOG,
};
