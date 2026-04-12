/* ============================================================================
 * Techno-Kol ERP — Tool / Die / Fixture / Gauge Tracker
 * Agent Y-040 / Swarm Manufacturing / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מעקב כלים, תבניות, סכינים וגאג'ים — מפעל מתכת "טכנו-קול עוזי"
 *
 * Domain:
 *   Every metal fabrication shop lives and dies by the state of its tool
 *   cage. Dies wear out after N strokes, cutting bits dull after X cycles,
 *   fixtures drift out of spec, and gauges must be calibrated on a rolling
 *   schedule. When any one of these fails silently — the scrap rate
 *   explodes, customers reject shipments, and inspection audits fail.
 *
 *   This module is the single source of truth for every perishable /
 *   precision tool on the shop floor: die sets, welding jigs, drill
 *   fixtures, dial indicators & calipers, cutting bits, injection molds.
 *   Usage is logged per work-order; wear is computed as a percentage of
 *   the rated life; calibration / sharpening / inspection / overhaul are
 *   scheduled and surfaced when overdue.
 *
 * Features implemented:
 *   1. defineTool            — catalog a tool with drawing, supplier, rated life
 *   2. recordUsage           — log each use (WO, cycles, wear, operator)
 *   3. cyclesRemaining       — rated_cycles - sum(actual cycles)
 *   4. wearLevel             — green / yellow / red bucket
 *   5. scheduleMaintenance   — calibration / sharpening / inspection / overhaul
 *   6. completeMaintenance   — close a schedule entry (keeps history)
 *   7. overdueTools          — tools past a due date
 *   8. checkout              — tool-cage checkout
 *   9. returnTool            — tool-cage return with condition
 *  10. retire                — mark retired (NEVER deleted)
 *  11. alertNearEnd          — tools approaching end-of-life
 *  12. findById / listAll    — read-only accessors
 *
 * Tool types supported (canonical seven):
 *   - die            תבנית עימוץ/חיתוך   Punch & bending dies, progressive dies
 *   - jig            ג'יג                  Welding / drilling / assembly jigs
 *   - fixture        תפיסה                 Holding fixtures, clamping fixtures
 *   - gauge          גאוג'                 Go/no-go, dial indicators, calipers
 *   - cutting-tool   כלי חיתוך             End mills, drill bits, taps, inserts
 *   - mold           תבנית יציקה           Injection / casting molds
 *
 * Calibration standards referenced (Israeli metal-fab baseline):
 *   - ISO 9001:2015  §7.1.5 — Monitoring & measuring resources
 *   - ISO 17025       — Testing & calibration laboratory requirements
 *   - מכון התקנים     (SII) — Israeli calibration body, traceable to NIST/INETEC
 *   - ת"י 18265 / ISO 6508  — hardness testers calibration
 *   - JIS B 7503 / DIN 878  — dial indicators
 *
 * Wear thresholds (rule of thumb for punch & cutting tools):
 *   - GREEN  : 0–69 %  of rated cycles consumed         → OK
 *   - YELLOW : 70–89 % of rated cycles consumed         → plan replacement
 *   - RED    : 90–100 %+                                → stop, sharpen/swap
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. retire() sets status='RETIRED' and preserves
 *     the entire usage history, maintenance history, and checkout log.
 *   - Zero external dependencies (pure Node built-ins only).
 *   - Bilingual Hebrew / English on every structure.
 *   - Time in ISO-8601 strings, counts as integers, cost as ILS decimal.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Immutable catalogs — tool types, maintenance kinds, status, condition
 * -------------------------------------------------------------------------- */

const TOOL_TYPES = Object.freeze({
  'die':          { he: 'תבנית',          en: 'Die',
                    description_he: 'תבנית לעימוץ / חיתוך / עיצוב מתכת',
                    description_en: 'Press die — punching, cutting, forming' },
  'jig':          { he: 'ג׳יג',           en: 'Jig',
                    description_he: 'ג׳יג ריתוך / קידוח / הרכבה',
                    description_en: 'Welding / drilling / assembly jig' },
  'fixture':      { he: 'תפיסה',           en: 'Fixture',
                    description_he: 'תפיסה / מלחצה לקיבוע חלקים',
                    description_en: 'Clamping / holding fixture' },
  'gauge':        { he: 'גאוג׳',           en: 'Gauge',
                    description_he: 'מד-בקרה — Go/No-Go, אינדיקטור, קליפר',
                    description_en: 'Measurement gauge — Go/NoGo, dial, caliper' },
  'cutting-tool': { he: 'כלי חיתוך',       en: 'Cutting tool',
                    description_he: 'סכין מכרסמת, מקדח, טאפ, אינסרט',
                    description_en: 'End mill, drill bit, tap, insert' },
  'mold':         { he: 'תבנית יציקה',     en: 'Mold',
                    description_he: 'תבנית יציקה / הזרקה',
                    description_en: 'Injection / casting mold' },
});

const MAINTENANCE_TYPES = Object.freeze({
  'calibration':  { he: 'כיול',            en: 'Calibration' },
  'sharpening':   { he: 'השחזה',           en: 'Sharpening' },
  'inspection':   { he: 'בדיקה תקופתית',   en: 'Inspection' },
  'overhaul':     { he: 'שיפוץ יסודי',     en: 'Overhaul' },
});

const STATUS = Object.freeze({
  ACTIVE:       'ACTIVE',       // פעיל
  IN_USE:       'IN_USE',       // בשימוש (checked out)
  MAINTENANCE:  'MAINTENANCE',  // בתחזוקה
  QUARANTINE:   'QUARANTINE',   // בהסגר (awaiting inspection)
  RETIRED:      'RETIRED',      // הוצא משימוש (never deleted)
});

const CONDITION = Object.freeze({
  EXCELLENT:  'EXCELLENT',   // מצוין
  GOOD:       'GOOD',        // טוב
  FAIR:       'FAIR',        // סביר
  POOR:       'POOR',        // גרוע
  DAMAGED:    'DAMAGED',     // פגום
});

const WEAR_LEVELS = Object.freeze({
  GREEN:  'GREEN',   // ירוק — שימוש תקין
  YELLOW: 'YELLOW',  // צהוב — מתקרב לסף
  RED:    'RED',     // אדום — סוף חיים
});

// Default wear thresholds (percentage of rated cycles consumed).
const DEFAULT_WEAR_THRESHOLDS = Object.freeze({
  yellow: 0.70,   // 70% consumed → yellow
  red:    0.90,   // 90% consumed → red
});

// Default calibration intervals (days) by tool type, if not given.
const DEFAULT_CALIBRATION_DAYS = Object.freeze({
  'gauge':        180,   // dial indicators, calipers — every 6 months
  'die':          365,   // progressive dies — annually
  'mold':         365,   // molds — annually
  'jig':          730,   // jigs — every 2 years
  'fixture':      730,   // fixtures — every 2 years
  'cutting-tool': null,  // cutting tools have no calibration, only sharpening
});

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers — zero deps
 * -------------------------------------------------------------------------- */

function _now() {
  return new Date().toISOString();
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertNum(v, name, { min = 0 } = {}) {
  if (typeof v !== 'number' || !isFinite(v) || v < min) {
    throw new TypeError('invalid ' + name + ': ' + v);
  }
}

function _deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new TypeError('invalid date: ' + s);
  return d;
}

function _daysBetween(a, b) {
  const A = _parseDate(a);
  const B = _parseDate(b);
  return Math.floor((B.getTime() - A.getTime()) / (24 * 60 * 60 * 1000));
}

function _addDays(dateStr, days) {
  const d = _parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ----------------------------------------------------------------------------
 * 2. ToolTracker class
 * -------------------------------------------------------------------------- */

class ToolTracker {
  constructor({ wearThresholds } = {}) {
    /** @type {Map<string, Tool>} the canonical tool store */
    this.tools = new Map();
    /** Wear thresholds may be overridden per-instance if a shop has unusual
     *  quality requirements, but defaults are used otherwise. */
    this.wearThresholds = Object.assign({}, DEFAULT_WEAR_THRESHOLDS, wearThresholds || {});
    /** @type {Array<AuditEntry>} immutable audit log — NEVER pruned */
    this.auditLog = [];
  }

  /* ---------- audit helper ---------- */
  _audit(action, payload) {
    this.auditLog.push({
      ts:      _now(),
      action:  action,
      payload: _deepCopy(payload),
    });
  }

  /* ==========================================================================
   * 2.1  defineTool
   * Register a tool in the catalog. Idempotent on `id` — re-defining a tool
   * preserves its usage / checkout / maintenance history and only replaces
   * the mutable catalog fields (name, supplier, rated life, etc.).
   * ========================================================================= */
  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {string} spec.name_he
   * @param {string} spec.name_en
   * @param {'die'|'jig'|'fixture'|'gauge'|'cutting-tool'|'mold'} spec.type
   * @param {string} spec.location           Where it lives (e.g. "Cage-A shelf 3")
   * @param {string} spec.ownerDept          Which department owns the tool
   * @param {string} spec.purchaseDate       ISO date
   * @param {number} spec.cost               ILS
   * @param {string} spec.serial             Serial number (manufacturer)
   * @param {string} spec.supplier           Supplier id / name
   * @param {string} [spec.drawingRef]       Drawing number / revision
   * @param {string} [spec.sku]              SKU it services (or '*' if generic)
   * @param {number} spec.rated_cycles       Lifetime rated cycles (0 = uncounted)
   * @param {number} [spec.calibrationFreqDays] Days between calibrations
   */
  defineTool(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('defineTool requires a spec object');
    }
    const {
      id, name_he, name_en, type, location, ownerDept,
      purchaseDate, cost, serial, supplier,
      drawingRef, sku, rated_cycles, calibrationFreqDays,
    } = spec;

    _assertStr(id,           'tool.id');
    _assertStr(name_he,      'tool.name_he');
    _assertStr(name_en,      'tool.name_en');
    if (!TOOL_TYPES[type]) {
      throw new TypeError('invalid tool type: ' + type +
        ' (allowed: ' + Object.keys(TOOL_TYPES).join(', ') + ')');
    }
    _assertStr(location,     'tool.location');
    _assertStr(ownerDept,    'tool.ownerDept');
    _assertStr(purchaseDate, 'tool.purchaseDate');
    _parseDate(purchaseDate); // validates format
    _assertNum(cost,         'tool.cost');
    _assertStr(serial,       'tool.serial');
    _assertStr(supplier,     'tool.supplier');
    _assertNum(rated_cycles, 'tool.rated_cycles');

    // Use default calibration interval by type if caller didn't specify.
    let calFreq = calibrationFreqDays;
    if (calFreq === undefined || calFreq === null) {
      calFreq = DEFAULT_CALIBRATION_DAYS[type] === undefined
        ? null
        : DEFAULT_CALIBRATION_DAYS[type];
    }
    if (calFreq !== null) _assertNum(calFreq, 'calibrationFreqDays');

    const existing = this.tools.get(id);

    // Preserve history on re-define; only overwrite catalog fields.
    const tool = {
      id:          id,
      name_he:     name_he,
      name_en:     name_en,
      type:        type,
      type_he:     TOOL_TYPES[type].he,
      type_en:     TOOL_TYPES[type].en,
      location:    location,
      ownerDept:   ownerDept,
      purchaseDate: purchaseDate,
      cost:        cost,
      serial:      serial,
      supplier:    supplier,
      drawingRef:  drawingRef || null,
      sku:         sku || '*',
      rated_cycles: rated_cycles,
      calibrationFreqDays: calFreq,

      status:        existing ? existing.status        : STATUS.ACTIVE,
      totalCycles:   existing ? existing.totalCycles   : 0,

      // History arrays — append-only, never deleted.
      usageLog:        existing ? existing.usageLog        : [],
      maintenanceLog:  existing ? existing.maintenanceLog  : [],
      checkoutLog:     existing ? existing.checkoutLog     : [],
      retireRecord:    existing ? existing.retireRecord    : null,

      // Currently-active checkout (null when in cage).
      currentCheckout: existing ? existing.currentCheckout : null,

      createdAt: existing ? existing.createdAt : _now(),
      updatedAt: _now(),
      // Past revisions of the catalog entry — so you can always replay
      // "what did this tool look like on day X".
      catalogHistory: existing
        ? existing.catalogHistory.concat([{
            snapshot: {
              name_he: existing.name_he, name_en: existing.name_en,
              location: existing.location, ownerDept: existing.ownerDept,
              supplier: existing.supplier, drawingRef: existing.drawingRef,
              rated_cycles: existing.rated_cycles,
              calibrationFreqDays: existing.calibrationFreqDays,
            },
            replacedAt: _now(),
          }])
        : [],
    };

    this.tools.set(id, tool);
    this._audit(existing ? 'updateTool' : 'defineTool', { id: id, type: type });
    return _deepCopy(tool);
  }

  /* ==========================================================================
   * 2.2  recordUsage
   * Append a usage event. Every event is kept — we never overwrite.
   * ========================================================================= */
  /**
   * @param {string} toolId
   * @param {object} usage
   * @param {string} usage.wo           Work-order id (e.g. WO-2026-01234)
   * @param {string} usage.operation    Operation name (e.g. 'laser_cut')
   * @param {number} usage.cycles       Cycles consumed in this session
   * @param {number} [usage.wear]       Optional subjective wear delta (%)
   * @param {string} usage.operator     Operator id / name
   * @param {string} [usage.notes]      Free-text notes (Hebrew or English)
   * @param {string} [usage.timestamp]  Override (defaults to now)
   */
  recordUsage(toolId, usage) {
    const tool = this._getLiveTool(toolId, 'recordUsage');
    if (!usage || typeof usage !== 'object') {
      throw new TypeError('recordUsage requires a usage object');
    }
    const { wo, operation, cycles, wear, operator, notes, timestamp } = usage;
    _assertStr(wo,       'usage.wo');
    _assertStr(operation, 'usage.operation');
    _assertNum(cycles,   'usage.cycles');
    _assertStr(operator, 'usage.operator');
    if (wear !== undefined && wear !== null) {
      _assertNum(wear, 'usage.wear');
    }

    const entry = {
      ts:        timestamp || _now(),
      wo:        wo,
      operation: operation,
      cycles:    cycles,
      wear:      wear == null ? null : wear,
      operator:  operator,
      notes:     notes || null,
    };
    tool.usageLog.push(entry);
    tool.totalCycles += cycles;
    tool.updatedAt = _now();
    this._audit('recordUsage', { id: toolId, wo: wo, cycles: cycles });
    return _deepCopy(entry);
  }

  /* ==========================================================================
   * 2.3  cyclesRemaining
   * rated - actual. If rated_cycles is 0 (uncounted) we return Infinity.
   * ========================================================================= */
  cyclesRemaining(toolId) {
    const tool = this._getTool(toolId, 'cyclesRemaining');
    if (tool.rated_cycles === 0) return Infinity;
    const remaining = tool.rated_cycles - tool.totalCycles;
    return remaining < 0 ? 0 : remaining;
  }

  /* ==========================================================================
   * 2.4  wearLevel
   * Returns 'GREEN' / 'YELLOW' / 'RED' based on % of rated cycles consumed.
   * Tools with rated_cycles=0 always return GREEN (can't measure wear).
   * ========================================================================= */
  wearLevel(toolId) {
    const tool = this._getTool(toolId, 'wearLevel');
    if (tool.rated_cycles === 0) {
      return { level: WEAR_LEVELS.GREEN, percent: 0, consumed: tool.totalCycles,
               rated: 0, uncounted: true };
    }
    const pct = tool.totalCycles / tool.rated_cycles;
    let level;
    if (pct >= this.wearThresholds.red)         level = WEAR_LEVELS.RED;
    else if (pct >= this.wearThresholds.yellow) level = WEAR_LEVELS.YELLOW;
    else                                        level = WEAR_LEVELS.GREEN;
    return {
      level:    level,
      percent:  Math.round(pct * 10000) / 100, // 2 dp percent
      consumed: tool.totalCycles,
      rated:    tool.rated_cycles,
      uncounted: false,
    };
  }

  /* ==========================================================================
   * 2.5  scheduleMaintenance
   * Creates an OPEN maintenance entry with a due date. Does not delete any
   * previously-scheduled or completed entries.
   * ========================================================================= */
  /**
   * @param {string} toolId
   * @param {'calibration'|'sharpening'|'inspection'|'overhaul'} type
   * @param {string} dueDate        ISO date (YYYY-MM-DD or full ISO)
   * @param {object} [opts]
   * @param {string} [opts.assignedTo]
   * @param {string} [opts.notes]
   */
  scheduleMaintenance(toolId, type, dueDate, opts) {
    const tool = this._getLiveTool(toolId, 'scheduleMaintenance');
    if (!MAINTENANCE_TYPES[type]) {
      throw new TypeError('invalid maintenance type: ' + type +
        ' (allowed: ' + Object.keys(MAINTENANCE_TYPES).join(', ') + ')');
    }
    _assertStr(dueDate, 'dueDate');
    _parseDate(dueDate); // validates

    const entry = {
      id:         'M-' + toolId + '-' + (tool.maintenanceLog.length + 1),
      type:       type,
      type_he:    MAINTENANCE_TYPES[type].he,
      type_en:    MAINTENANCE_TYPES[type].en,
      scheduledAt: _now(),
      dueDate:    dueDate.slice(0, 10),
      status:     'OPEN',
      assignedTo: (opts && opts.assignedTo) || null,
      notes:      (opts && opts.notes)      || null,
      completedAt: null,
      completedBy: null,
      result:     null,
    };
    tool.maintenanceLog.push(entry);
    tool.updatedAt = _now();
    this._audit('scheduleMaintenance', {
      id: toolId, type: type, dueDate: entry.dueDate,
    });
    return _deepCopy(entry);
  }

  /* ==========================================================================
   * 2.6  completeMaintenance
   * Close an OPEN maintenance entry. If type was 'calibration' we
   * automatically schedule the next one based on calibrationFreqDays.
   * ========================================================================= */
  completeMaintenance(toolId, maintId, { completedBy, result, notes } = {}) {
    const tool = this._getLiveTool(toolId, 'completeMaintenance');
    const entry = tool.maintenanceLog.find((m) => m.id === maintId);
    if (!entry) throw new Error('unknown maintenance id: ' + maintId);
    if (entry.status !== 'OPEN') {
      throw new Error('maintenance already ' + entry.status);
    }
    entry.status      = 'COMPLETED';
    entry.completedAt = _now();
    entry.completedBy = completedBy || null;
    entry.result      = result || 'PASS';
    if (notes) entry.notes = (entry.notes ? entry.notes + ' | ' : '') + notes;
    tool.updatedAt = _now();

    // Auto-roll a new calibration event so we never lose track.
    let followUp = null;
    if (entry.type === 'calibration' && tool.calibrationFreqDays) {
      followUp = this.scheduleMaintenance(
        toolId,
        'calibration',
        _addDays(_today(), tool.calibrationFreqDays),
        { notes: 'Auto-rolled after ' + maintId },
      );
    }
    this._audit('completeMaintenance', {
      id: toolId, maintId: maintId, result: entry.result,
    });
    return { closed: _deepCopy(entry), followUp: followUp };
  }

  /* ==========================================================================
   * 2.7  overdueTools
   * Returns every tool with at least one OPEN maintenance entry past due.
   * Retired tools are excluded (they don't need maintenance any more)
   * but their history is preserved.
   * ========================================================================= */
  overdueTools(asOf) {
    const today = asOf ? _parseDate(asOf) : new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const out = [];
    for (const tool of this.tools.values()) {
      if (tool.status === STATUS.RETIRED) continue;
      const overdue = tool.maintenanceLog.filter((m) =>
        m.status === 'OPEN' && m.dueDate < todayIso,
      );
      if (overdue.length > 0) {
        out.push({
          id:        tool.id,
          name_he:   tool.name_he,
          name_en:   tool.name_en,
          type:      tool.type,
          location:  tool.location,
          ownerDept: tool.ownerDept,
          overdue:   overdue.map((m) => ({
            id:         m.id,
            type:       m.type,
            type_he:    m.type_he,
            dueDate:    m.dueDate,
            daysLate:   _daysBetween(m.dueDate, todayIso),
          })),
        });
      }
    }
    // Most-overdue first.
    out.sort((a, b) => {
      const aMax = Math.max.apply(null, a.overdue.map((o) => o.daysLate));
      const bMax = Math.max.apply(null, b.overdue.map((o) => o.daysLate));
      return bMax - aMax;
    });
    return out;
  }

  /* ==========================================================================
   * 2.8  checkout
   * Mark a tool as borrowed from the cage. Cannot double-checkout.
   * ========================================================================= */
  /**
   * @param {object} args
   * @param {string} args.toolId
   * @param {string} args.borrower
   * @param {string} args.expectedReturn   ISO date
   * @param {string} [args.purpose]
   */
  checkout({ toolId, borrower, expectedReturn, purpose }) {
    const tool = this._getLiveTool(toolId, 'checkout');
    if (tool.status === STATUS.IN_USE) {
      throw new Error('tool already checked out by ' +
        (tool.currentCheckout && tool.currentCheckout.borrower));
    }
    if (tool.status === STATUS.MAINTENANCE) {
      throw new Error('tool is in maintenance, cannot checkout');
    }
    _assertStr(borrower,       'borrower');
    _assertStr(expectedReturn, 'expectedReturn');
    _parseDate(expectedReturn);

    const entry = {
      id:             'CO-' + toolId + '-' + (tool.checkoutLog.length + 1),
      borrower:       borrower,
      checkoutAt:     _now(),
      expectedReturn: expectedReturn.slice(0, 10),
      purpose:        purpose || null,
      returnAt:       null,
      returner:       null,
      conditionOnReturn: null,
      status:         'OPEN',
    };
    tool.checkoutLog.push(entry);
    tool.currentCheckout = entry.id;
    tool.status = STATUS.IN_USE;
    tool.updatedAt = _now();
    this._audit('checkout', { id: toolId, borrower: borrower });
    return _deepCopy(entry);
  }

  /* ==========================================================================
   * 2.9  returnTool
   * Close the currently-active checkout. If the returned condition is POOR
   * or DAMAGED we automatically quarantine the tool for inspection.
   * ========================================================================= */
  /**
   * @param {object} args
   * @param {string} args.toolId
   * @param {string} args.returner
   * @param {'EXCELLENT'|'GOOD'|'FAIR'|'POOR'|'DAMAGED'} args.condition
   * @param {string} [args.notes]
   */
  returnTool({ toolId, returner, condition, notes }) {
    const tool = this._getLiveTool(toolId, 'returnTool');
    if (tool.status !== STATUS.IN_USE || !tool.currentCheckout) {
      throw new Error('tool is not currently checked out');
    }
    if (!CONDITION[condition]) {
      throw new TypeError('invalid condition: ' + condition +
        ' (allowed: ' + Object.keys(CONDITION).join(', ') + ')');
    }
    _assertStr(returner, 'returner');

    const entry = tool.checkoutLog.find((c) => c.id === tool.currentCheckout);
    if (!entry) throw new Error('current checkout record missing (data corruption)');
    entry.returnAt          = _now();
    entry.returner          = returner;
    entry.conditionOnReturn = condition;
    entry.status            = 'RETURNED';
    if (notes) entry.notes = notes;

    tool.currentCheckout = null;
    // Poor / damaged returns go to quarantine for inspection.
    if (condition === CONDITION.POOR || condition === CONDITION.DAMAGED) {
      tool.status = STATUS.QUARANTINE;
      // Auto-schedule an inspection tomorrow so it surfaces in overdueTools.
      this.scheduleMaintenance(
        toolId,
        'inspection',
        _addDays(_today(), 1),
        { notes: 'Auto — returned in ' + condition + ' condition' },
      );
    } else {
      tool.status = STATUS.ACTIVE;
    }
    tool.updatedAt = _now();
    this._audit('returnTool', {
      id: toolId, returner: returner, condition: condition,
    });
    return _deepCopy(entry);
  }

  /* ==========================================================================
   * 2.10 retire
   * Marks the tool RETIRED with a reason. Usage, maintenance, checkout logs
   * and everything else is preserved forever — this is the "לא מוחקים"
   * cornerstone of the module.
   * ========================================================================= */
  retire(toolId, reason) {
    const tool = this._getLiveTool(toolId, 'retire');
    _assertStr(reason, 'reason');
    if (tool.status === STATUS.IN_USE) {
      throw new Error('cannot retire a tool that is checked out — return it first');
    }
    tool.status       = STATUS.RETIRED;
    tool.retireRecord = {
      retiredAt: _now(),
      reason:    reason,
      // Snapshot the final usage state at retirement time.
      finalTotalCycles: tool.totalCycles,
      finalUsageCount:  tool.usageLog.length,
    };
    tool.updatedAt = _now();
    this._audit('retire', { id: toolId, reason: reason });
    return _deepCopy(tool);
  }

  /* ==========================================================================
   * 2.11 alertNearEnd
   * Tools whose wear % ≥ threshold (default = yellow). RED tools are
   * included too because they're even more urgent.
   * ========================================================================= */
  alertNearEnd(threshold) {
    const t = threshold == null ? this.wearThresholds.yellow : threshold;
    _assertNum(t, 'threshold');
    const out = [];
    for (const tool of this.tools.values()) {
      if (tool.status === STATUS.RETIRED) continue;
      if (tool.rated_cycles === 0) continue;
      const pct = tool.totalCycles / tool.rated_cycles;
      if (pct >= t) {
        out.push({
          id:        tool.id,
          name_he:   tool.name_he,
          name_en:   tool.name_en,
          type:      tool.type,
          location:  tool.location,
          percent:   Math.round(pct * 10000) / 100,
          consumed:  tool.totalCycles,
          rated:     tool.rated_cycles,
          remaining: tool.rated_cycles - tool.totalCycles,
          wearLevel: pct >= this.wearThresholds.red
            ? WEAR_LEVELS.RED
            : pct >= this.wearThresholds.yellow
              ? WEAR_LEVELS.YELLOW
              : WEAR_LEVELS.GREEN,
        });
      }
    }
    // Most-worn first.
    out.sort((a, b) => b.percent - a.percent);
    return out;
  }

  /* ==========================================================================
   * 2.12 Read-only accessors
   * ========================================================================= */
  findById(toolId) {
    const tool = this.tools.get(toolId);
    return tool ? _deepCopy(tool) : null;
  }

  listAll({ includeRetired = true, type = null } = {}) {
    const out = [];
    for (const tool of this.tools.values()) {
      if (!includeRetired && tool.status === STATUS.RETIRED) continue;
      if (type && tool.type !== type) continue;
      out.push(_deepCopy(tool));
    }
    return out;
  }

  /** Read-only view of audit log */
  getAuditLog() {
    return _deepCopy(this.auditLog);
  }

  /* ==========================================================================
   * Internal: lookup helpers
   * ========================================================================= */
  _getTool(toolId, op) {
    _assertStr(toolId, 'toolId');
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error(op + ': unknown tool id: ' + toolId);
    return tool;
  }

  _getLiveTool(toolId, op) {
    const tool = this._getTool(toolId, op);
    if (tool.status === STATUS.RETIRED) {
      throw new Error(op + ': tool is RETIRED: ' + toolId);
    }
    return tool;
  }
}

/* ----------------------------------------------------------------------------
 * 3. Module exports
 * -------------------------------------------------------------------------- */

module.exports = {
  ToolTracker:            ToolTracker,
  TOOL_TYPES:             TOOL_TYPES,
  MAINTENANCE_TYPES:      MAINTENANCE_TYPES,
  STATUS:                 STATUS,
  CONDITION:              CONDITION,
  WEAR_LEVELS:            WEAR_LEVELS,
  DEFAULT_WEAR_THRESHOLDS: DEFAULT_WEAR_THRESHOLDS,
  DEFAULT_CALIBRATION_DAYS: DEFAULT_CALIBRATION_DAYS,
};
