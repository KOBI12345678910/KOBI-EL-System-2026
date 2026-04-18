/**
 * ONYX — Manufacturing / Capacity Planning (תכנון כושר ייצור)
 * ═══════════════════════════════════════════════════════════════
 *
 * Agent AG-Y034  |  Mega-ERP Techno-Kol Uzi (מפעל מתכת)
 * Rule: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
 *
 * Medium-term capacity planning for a metal-fabrication shop.
 *
 * Hierarchy of planning techniques implemented here:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Master Production Schedule (MPS)                            │
 *   │            │                                                 │
 *   │            ▼                                                 │
 *   │  RCCP — Rough-Cut Capacity Planning (rccp)                   │
 *   │    • Uses bills of resources ("high-level routings")         │
 *   │    • Checks critical work centres only                       │
 *   │    • Validates feasibility of the MPS itself                 │
 *   │                                                              │
 *   │            ▼ (if feasible)                                   │
 *   │                                                              │
 *   │  MRP                                                         │
 *   │            │                                                 │
 *   │            ▼                                                 │
 *   │  CRP / CPP — Capacity Requirements Planning (cpp)            │
 *   │    • Uses detailed routings & open Work Orders               │
 *   │    • Includes setup, queue, move and run time                │
 *   │    • Every work centre, every period                         │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Israeli work-week assumptions (שבוע עבודה בישראל):
 *   - Sunday-Thursday : full shifts
 *   - Friday          : half day or closed (configurable)
 *   - Saturday (שבת)  : closed (no shifts)
 *   - Jewish holidays : closed (חגי ישראל)
 *   - National days   : closed (זיכרון, עצמאות, תשעה באב)
 *
 * Units:
 *   - All capacity/demand calculations are in **minutes**.
 *   - Periods are calendar days expressed as ISO `YYYY-MM-DD`.
 *
 * Zero deps. Pure JS. Deterministic — no Date.now() in the hot path;
 * callers provide `{from, to}` ISO strings.
 *
 * Bilingual — labels / errors exposed in both Hebrew and English so
 * the UI can render either without re-keying.
 */

'use strict';

// ───────────────────────────────────────────────────────────────
// Bilingual vocabulary (glossary)
// ───────────────────────────────────────────────────────────────

const GLOSSARY = Object.freeze({
  workCenter:     { he: 'תחנת עבודה',          en: 'Work center' },
  shift:          { he: 'משמרת',                en: 'Shift' },
  holiday:        { he: 'חג',                    en: 'Holiday' },
  capacity:       { he: 'כושר ייצור',           en: 'Capacity' },
  load:           { he: 'עומס',                  en: 'Load' },
  utilization:    { he: 'ניצולת',                en: 'Utilization' },
  rccp:           { he: 'תכנון גס של כושר',     en: 'Rough-Cut Capacity Planning' },
  cpp:            { he: 'תכנון מפורט של כושר',  en: 'Capacity Requirements Planning' },
  bottleneck:     { he: 'צוואר בקבוק',          en: 'Bottleneck' },
  overtime:       { he: 'שעות נוספות',          en: 'Overtime' },
  subcontract:    { he: 'קבלן משנה',            en: 'Subcontract' },
  workOrder:      { he: 'הזמנת עבודה',          en: 'Work order' },
  routing:        { he: 'מסלול ייצור',          en: 'Routing' },
  setupTime:      { he: 'זמן הקמה',             en: 'Setup time' },
  runTime:        { he: 'זמן ריצה',             en: 'Run time' },
  queueTime:      { he: 'זמן המתנה',            en: 'Queue time' },
  moveTime:       { he: 'זמן שינוע',            en: 'Move time' },
  loadLevel:      { he: 'ייצוב עומסים',         en: 'Load levelling' },
  whatIf:         { he: 'ניתוח מה-אם',          en: 'What-if analysis' },
});

// ───────────────────────────────────────────────────────────────
// Israeli Holiday Calendar — 2026 & 2027 (גרגוריאני)
// ───────────────────────────────────────────────────────────────
//
// Sourced from the Hebcal Gregorian equivalents. Dates are the
// civil (gregorian) date on which the holiday occurs. Evenings-before
// (ערב חג) are handled separately via `isEveOfHoliday`.
//
// Convention for multi-day chag:
//   - Full-day closure for the first and last day of yom-tov.
//   - "half" days (chol-hamoed) are listed with halfDay: true, which
//     the calendar engine treats as a half-shift day.
//
// NEVER DELETE. To extend to 2028 append a new `'2028'` block below.
// ───────────────────────────────────────────────────────────────

const HOLIDAYS_IL = Object.freeze({
  '2026': [
    // Purim פורים  (14 Adar 5786 = Tue 2026-03-03)
    { date: '2026-03-03', nameHe: 'פורים',               nameEn: 'Purim',            halfDay: false },
    // Pesach פסח — full closure day 1, chol-hamoed, full closure day 7
    //   14 Nisan 5786 = Wed 2026-04-01 (Erev Pesach)
    //   15 Nisan 5786 = Thu 2026-04-02 (Pesach 1)
    //   21 Nisan 5786 = Wed 2026-04-08 (Pesach 7 / Shvi'i)
    { date: '2026-04-01', nameHe: 'ערב פסח',             nameEn: 'Erev Pesach',      halfDay: true  },
    { date: '2026-04-02', nameHe: 'פסח א׳',              nameEn: 'Pesach Day 1',     halfDay: false },
    { date: '2026-04-03', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2026-04-04', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2026-04-05', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2026-04-06', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2026-04-07', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2026-04-08', nameHe: 'שביעי של פסח',        nameEn: 'Pesach Day 7',     halfDay: false },
    // National days  (4 Iyar = Tue 2026-04-21, 5 Iyar = Wed 2026-04-22)
    { date: '2026-04-21', nameHe: 'יום הזיכרון',         nameEn: 'Memorial Day',     halfDay: true  },
    { date: '2026-04-22', nameHe: 'יום העצמאות',         nameEn: 'Independence Day', halfDay: false },
    // Shavuot שבועות  (6 Sivan 5786 = Fri 2026-05-22)
    { date: '2026-05-21', nameHe: 'ערב שבועות',          nameEn: 'Erev Shavuot',     halfDay: true  },
    { date: '2026-05-22', nameHe: 'שבועות',              nameEn: 'Shavuot',          halfDay: false },
    // Tisha B'Av  (9 Av 5786 = Thu 2026-07-23)
    { date: '2026-07-23', nameHe: 'תשעה באב',            nameEn: "Tisha B'Av",       halfDay: false },
    // Rosh Hashana  (1 Tishri 5787 = Sat 2026-09-12)
    { date: '2026-09-11', nameHe: 'ערב ראש השנה',        nameEn: 'Erev Rosh Hashana',halfDay: true  },
    { date: '2026-09-12', nameHe: 'ראש השנה א׳',         nameEn: 'Rosh Hashana 1',   halfDay: false },
    { date: '2026-09-13', nameHe: 'ראש השנה ב׳',         nameEn: 'Rosh Hashana 2',   halfDay: false },
    // Yom Kippur  (10 Tishri 5787 = Mon 2026-09-21)
    { date: '2026-09-20', nameHe: 'ערב יום כיפור',       nameEn: 'Erev Yom Kippur',  halfDay: true  },
    { date: '2026-09-21', nameHe: 'יום כיפור',           nameEn: 'Yom Kippur',       halfDay: false },
    // Sukkot  (15 Tishri 5787 = Sat 2026-09-26; Simchat Torah 22 Tishri = Sat 2026-10-03)
    { date: '2026-09-25', nameHe: 'ערב סוכות',           nameEn: 'Erev Sukkot',      halfDay: true  },
    { date: '2026-09-26', nameHe: 'סוכות א׳',            nameEn: 'Sukkot Day 1',     halfDay: false },
    { date: '2026-09-27', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2026-09-28', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2026-09-29', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2026-09-30', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2026-10-01', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2026-10-02', nameHe: 'הושענא רבה',          nameEn: 'Hoshana Raba',     halfDay: true  },
    { date: '2026-10-03', nameHe: 'שמחת תורה',           nameEn: 'Simchat Torah',    halfDay: false },
    // Chanukah (observed but not a closed day — no entry, normal work)
  ],
  '2027': [
    // Purim  (14 Adar II 5787 = Tue 2027-03-23)
    { date: '2027-03-23', nameHe: 'פורים',               nameEn: 'Purim',            halfDay: false },
    // Pesach
    //   14 Nisan 5787 = Wed 2027-04-21
    //   15 Nisan 5787 = Thu 2027-04-22
    //   21 Nisan 5787 = Wed 2027-04-28
    { date: '2027-04-21', nameHe: 'ערב פסח',             nameEn: 'Erev Pesach',      halfDay: true  },
    { date: '2027-04-22', nameHe: 'פסח א׳',              nameEn: 'Pesach Day 1',     halfDay: false },
    { date: '2027-04-23', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2027-04-24', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2027-04-25', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2027-04-26', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2027-04-27', nameHe: 'חול המועד פסח',       nameEn: 'Chol Hamoed Pesach', halfDay: true },
    { date: '2027-04-28', nameHe: 'שביעי של פסח',        nameEn: 'Pesach Day 7',     halfDay: false },
    // National days  (4 Iyar = Tue 2027-05-11, 5 Iyar = Wed 2027-05-12)
    { date: '2027-05-11', nameHe: 'יום הזיכרון',         nameEn: 'Memorial Day',     halfDay: true  },
    { date: '2027-05-12', nameHe: 'יום העצמאות',         nameEn: 'Independence Day', halfDay: false },
    // Shavuot  (6 Sivan 5787 = Fri 2027-06-11)
    { date: '2027-06-10', nameHe: 'ערב שבועות',          nameEn: 'Erev Shavuot',     halfDay: true  },
    { date: '2027-06-11', nameHe: 'שבועות',              nameEn: 'Shavuot',          halfDay: false },
    // Tisha B'Av  (9 Av 5787 = Thu 2027-08-12)
    { date: '2027-08-12', nameHe: 'תשעה באב',            nameEn: "Tisha B'Av",       halfDay: false },
    // Rosh Hashana  (1 Tishri 5788 = Sat 2027-10-02)
    { date: '2027-10-01', nameHe: 'ערב ראש השנה',        nameEn: 'Erev Rosh Hashana',halfDay: true  },
    { date: '2027-10-02', nameHe: 'ראש השנה א׳',         nameEn: 'Rosh Hashana 1',   halfDay: false },
    { date: '2027-10-03', nameHe: 'ראש השנה ב׳',         nameEn: 'Rosh Hashana 2',   halfDay: false },
    // Yom Kippur  (10 Tishri 5788 = Mon 2027-10-11)
    { date: '2027-10-10', nameHe: 'ערב יום כיפור',       nameEn: 'Erev Yom Kippur',  halfDay: true  },
    { date: '2027-10-11', nameHe: 'יום כיפור',           nameEn: 'Yom Kippur',       halfDay: false },
    // Sukkot  (15 Tishri 5788 = Sat 2027-10-16; Simchat Torah 22 Tishri = Sat 2027-10-23)
    { date: '2027-10-15', nameHe: 'ערב סוכות',           nameEn: 'Erev Sukkot',      halfDay: true  },
    { date: '2027-10-16', nameHe: 'סוכות א׳',            nameEn: 'Sukkot Day 1',     halfDay: false },
    { date: '2027-10-17', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2027-10-18', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2027-10-19', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2027-10-20', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2027-10-21', nameHe: 'חול המועד סוכות',     nameEn: 'Chol Hamoed Sukkot', halfDay: true },
    { date: '2027-10-22', nameHe: 'הושענא רבה',          nameEn: 'Hoshana Raba',     halfDay: true  },
    { date: '2027-10-23', nameHe: 'שמחת תורה',           nameEn: 'Simchat Torah',    halfDay: false },
  ],
});

// ───────────────────────────────────────────────────────────────
// Pure date helpers (UTC-anchored, zero-dep, deterministic)
// ───────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` → integer day-of-week, 0=Sunday … 6=Saturday. */
function dayOfWeek(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.getUTCDay();
}

/** Inclusive range of ISO dates between `from` and `to`. */
function eachDay(from, to) {
  const out = [];
  let cur = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** HH:MM → minutes from midnight. */
function hmToMinutes(hm) {
  if (typeof hm !== 'string') throw new TypeError('hm must be HH:MM string');
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) throw new RangeError(`invalid HH:MM: ${hm}`);
  const h = Number(m[1]); const mm = Number(m[2]);
  if (h > 23 || mm > 59) throw new RangeError(`invalid HH:MM: ${hm}`);
  return h * 60 + mm;
}

/** Length of a shift in minutes. A shift that spans midnight is
 *  interpreted as running into the next day (common for night shift). */
function shiftMinutes(shift) {
  const s = hmToMinutes(shift.start);
  const e = hmToMinutes(shift.end);
  return e > s ? (e - s) : (24 * 60 - s + e);
}

// ───────────────────────────────────────────────────────────────
// Built-in Israeli holiday resolver
// ───────────────────────────────────────────────────────────────

/**
 * Return the holiday entry matching `iso`, or `undefined`. Caller
 * may also pass `extraHolidays` (company-specific shutdowns) which
 * take precedence over the built-in table.
 */
function resolveHoliday(iso, extraHolidays = []) {
  const local = extraHolidays.find((h) => h.date === iso);
  if (local) return local;
  const year = iso.slice(0, 4);
  const list = HOLIDAYS_IL[year];
  if (!list) return undefined;
  return list.find((h) => h.date === iso);
}

/** Flat list of all built-in Israeli holidays in [2026,2027]. */
function getIsraeliHolidays(years = ['2026', '2027']) {
  const out = [];
  for (const y of years) {
    if (HOLIDAYS_IL[y]) out.push(...HOLIDAYS_IL[y]);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────
// CapacityPlanner — main class
// ───────────────────────────────────────────────────────────────

class CapacityPlanner {
  constructor(options = {}) {
    // All internal state is in plain Maps so snapshots are cheap.
    this._calendars   = new Map();   // workCenterId → calendarDef
    this._workOrders  = [];          // open WOs  (detailed demand)
    this._forecast    = [];          // forecast orders (planned demand)
    this._routings    = new Map();   // partId → [{workCenterId, setupMin, runMinPerUnit, queueMin, moveMin}]
    this._bor         = new Map();   // partId → [{workCenterId, loadPerUnit}]  (bill of resources for RCCP)
    this._shutdowns   = options.extraHolidays || [];
    this._fridayHalf  = options.fridayHalfDay !== false; // default true
  }

  // ─────────────────────────────────────────────────────────
  // Calendar
  // ─────────────────────────────────────────────────────────

  /**
   * Define the working calendar for a work centre.
   *
   * @param {object} def
   * @param {string} def.workCenterId
   * @param {Array<{name,start,end,days}>} def.shifts
   *        - days: array of weekday numbers 0..6 (0=Sunday, 6=Saturday)
   * @param {Array<{date,nameHe,nameEn,halfDay}>} [def.holidays]
   *        Extra (company-specific) shutdowns. Merged with built-in list.
   * @param {number} [def.machines=1]
   *        Number of parallel machines/stations at this work centre.
   * @param {number} [def.efficiency=1.0]
   *        Efficiency factor 0..1 (applied to nominal minutes).
   */
  defineCalendar(def) {
    if (!def || typeof def !== 'object') throw new TypeError('definition required');
    const { workCenterId, shifts, holidays = [], machines = 1, efficiency = 1.0 } = def;
    if (!workCenterId || typeof workCenterId !== 'string') {
      throw new TypeError('workCenterId required');
    }
    if (!Array.isArray(shifts) || shifts.length === 0) {
      throw new RangeError('at least one shift required');
    }
    for (const s of shifts) {
      if (!s.name)  throw new TypeError('shift.name required');
      if (!Array.isArray(s.days) || s.days.some((d) => d < 0 || d > 6)) {
        throw new RangeError('shift.days must be [0..6]');
      }
      // Validate time range
      hmToMinutes(s.start);
      hmToMinutes(s.end);
    }
    this._calendars.set(workCenterId, {
      workCenterId,
      shifts: shifts.map((s) => ({ ...s })),
      holidays: holidays.map((h) => ({ ...h })),
      machines,
      efficiency,
    });
    return this;
  }

  // ─────────────────────────────────────────────────────────
  // Capacity side: availableCapacity()
  // ─────────────────────────────────────────────────────────

  /**
   * Minutes of nominal capacity available on the work centre for the
   * period, accounting for:
   *
   *   - Sunday-Thursday : full shifts.
   *   - Friday          : full or half, per policy.
   *   - Saturday        : closed (overridable by explicit shift on day=6).
   *   - Holidays        : closed unless `halfDay: true` → ½ of full.
   *   - Parallel machines (count) and efficiency factor.
   *
   * @param {string} workCenterId
   * @param {{from:string, to:string}} period  ISO YYYY-MM-DD inclusive
   * @returns {{
   *   workCenterId:string,
   *   availableMinutes:number,
   *   breakdown: Array<{date:string, minutes:number, reason:string}>
   * }}
   */
  availableCapacity(workCenterId, period) {
    const cal = this._calendars.get(workCenterId);
    if (!cal) throw new RangeError(`no calendar for ${workCenterId}`);
    const { from, to } = period || {};
    if (!from || !to) throw new TypeError('period {from,to} required');

    // Merge built-in holidays with company-specific ones (plus planner-level shutdowns).
    const extras = [...cal.holidays, ...this._shutdowns];

    const breakdown = [];
    let total = 0;

    for (const iso of eachDay(from, to)) {
      const dow = dayOfWeek(iso);
      const holiday = resolveHoliday(iso, extras);

      // Full closure for holidays (day-off, non-half).
      if (holiday && !holiday.halfDay) {
        breakdown.push({ date: iso, minutes: 0, reason: `closed:${holiday.nameEn}` });
        continue;
      }

      // Saturday — closed unless a shift is explicitly scheduled for dow=6.
      if (dow === 6 && !cal.shifts.some((s) => s.days.includes(6))) {
        breakdown.push({ date: iso, minutes: 0, reason: 'closed:Shabbat' });
        continue;
      }

      // Sum all shifts that run on this day-of-week.
      let dayMin = 0;
      for (const s of cal.shifts) {
        if (s.days.includes(dow)) {
          dayMin += shiftMinutes(s);
        }
      }

      if (dayMin === 0) {
        breakdown.push({ date: iso, minutes: 0, reason: 'no-shift' });
        continue;
      }

      // Friday half-day policy.
      if (dow === 5 && this._fridayHalf) {
        dayMin = Math.round(dayMin / 2);
      }

      // Half-day holiday (ערב חג / חול המועד).
      if (holiday && holiday.halfDay) {
        dayMin = Math.round(dayMin / 2);
      }

      // Apply parallel machines and efficiency.
      const effectiveMin = Math.round(dayMin * cal.machines * cal.efficiency);

      breakdown.push({
        date: iso,
        minutes: effectiveMin,
        reason: holiday
          ? `half:${holiday.nameEn}`
          : (dow === 5 ? 'half:Friday' : 'work'),
      });
      total += effectiveMin;
    }

    return {
      workCenterId,
      availableMinutes: total,
      breakdown,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Demand side: work orders, forecasts, routings, BoR
  // ─────────────────────────────────────────────────────────

  /** Register an open work order: {id, partId, quantity, dueDate, released} */
  addWorkOrder(wo) {
    if (!wo || !wo.id || !wo.partId) throw new TypeError('invalid work order');
    this._workOrders.push({ ...wo });
    return this;
  }

  /** Register forecast order: {id, partId, quantity, dueDate} */
  addForecast(fo) {
    if (!fo || !fo.partId) throw new TypeError('invalid forecast');
    this._forecast.push({ ...fo });
    return this;
  }

  /**
   * Register a detailed routing for a part.
   * Each op: {workCenterId, setupMin, runMinPerUnit, queueMin?, moveMin?}
   */
  setRouting(partId, operations) {
    if (!partId || !Array.isArray(operations)) {
      throw new TypeError('partId + operations[] required');
    }
    this._routings.set(partId, operations.map((o) => ({
      queueMin: 0,
      moveMin: 0,
      ...o,
    })));
    return this;
  }

  /**
   * Register the Bill of Resources (RCCP-level shortcut):
   *   billOfResources: [{workCenterId, loadPerUnit}] — minutes per finished unit.
   * Aggregated at the critical-WC level only.
   */
  setBillOfResources(partId, bor) {
    if (!partId || !Array.isArray(bor)) throw new TypeError('partId + bor[] required');
    this._bor.set(partId, bor.map((b) => ({ ...b })));
    return this;
  }

  /**
   * Demand forecast for the period. Collects open WOs and forecasted
   * orders whose dueDate lies inside [from, to].
   */
  demandForecast(period) {
    const { from, to } = period || {};
    if (!from || !to) throw new TypeError('period required');
    const inPeriod = (iso) => iso >= from && iso <= to;

    const lines = [];
    for (const wo of this._workOrders) {
      if (inPeriod(wo.dueDate)) lines.push({ ...wo, source: 'wo' });
    }
    for (const fo of this._forecast) {
      if (inPeriod(fo.dueDate)) lines.push({ ...fo, source: 'forecast' });
    }
    return lines;
  }

  // ─────────────────────────────────────────────────────────
  // RCCP — Rough-Cut Capacity Planning
  // ─────────────────────────────────────────────────────────

  /**
   * RCCP: for each work centre, sum `quantity × loadPerUnit` of all
   * demand lines, using the **bill of resources**. Fast, coarse.
   *
   * @returns {{
   *   period, method:'RCCP',
   *   byWorkCenter: Map<wcId, {loadMin, availableMin, utilization, status}>
   * }}
   */
  rccp(period) {
    const demand = this.demandForecast(period);
    const loadByWc = new Map();

    for (const line of demand) {
      const bor = this._bor.get(line.partId);
      if (!bor) continue; // no RCCP-level definition → skipped
      for (const b of bor) {
        const add = (line.quantity || 0) * (b.loadPerUnit || 0);
        loadByWc.set(b.workCenterId, (loadByWc.get(b.workCenterId) || 0) + add);
      }
    }

    const byWorkCenter = new Map();
    for (const [wcId, _] of this._calendars) {
      const loadMin = Math.round(loadByWc.get(wcId) || 0);
      const availableMin = this.availableCapacity(wcId, period).availableMinutes;
      byWorkCenter.set(wcId, this._summarise(loadMin, availableMin));
    }
    // Include work centres that only appear in the BoR (no calendar yet).
    for (const [wcId, loadRaw] of loadByWc) {
      if (!byWorkCenter.has(wcId)) {
        byWorkCenter.set(wcId, this._summarise(Math.round(loadRaw), 0));
      }
    }

    return { period, method: 'RCCP', byWorkCenter };
  }

  // ─────────────────────────────────────────────────────────
  // CPP / CRP — detailed capacity planning via routings
  // ─────────────────────────────────────────────────────────

  /**
   * CPP: detailed CRP using routings. Each operation contributes:
   *
   *    setupMin + (quantity × runMinPerUnit) + queueMin + moveMin
   *
   * Open work orders' due dates drive the bucket allocation; this
   * implementation uses a single bucket = the whole period (good for
   * medium-term planning; easily partitioned by week/month if needed).
   */
  cpp(period) {
    const demand = this.demandForecast(period);
    const loadByWc = new Map();
    const missing  = [];

    for (const line of demand) {
      const routing = this._routings.get(line.partId);
      if (!routing) { missing.push(line.partId); continue; }
      const qty = line.quantity || 0;
      for (const op of routing) {
        const add =
          (op.setupMin || 0) +
          qty * (op.runMinPerUnit || 0) +
          (op.queueMin || 0) +
          (op.moveMin  || 0);
        loadByWc.set(op.workCenterId, (loadByWc.get(op.workCenterId) || 0) + add);
      }
    }

    const byWorkCenter = new Map();
    for (const [wcId, _] of this._calendars) {
      const loadMin = Math.round(loadByWc.get(wcId) || 0);
      const availableMin = this.availableCapacity(wcId, period).availableMinutes;
      byWorkCenter.set(wcId, this._summarise(loadMin, availableMin));
    }
    for (const [wcId, loadRaw] of loadByWc) {
      if (!byWorkCenter.has(wcId)) {
        byWorkCenter.set(wcId, this._summarise(Math.round(loadRaw), 0));
      }
    }

    return { period, method: 'CPP', byWorkCenter, missingRoutings: [...new Set(missing)] };
  }

  /** Shared post-processing → load/capacity/utilisation/status tuple. */
  _summarise(loadMin, availableMin) {
    const utilization = availableMin > 0
      ? Number((loadMin / availableMin).toFixed(4))
      : (loadMin > 0 ? Infinity : 0);
    let status = 'ok';
    if (utilization === 0)                status = 'idle';
    else if (utilization <= 0.85)         status = 'ok';
    else if (utilization <= 1.0)          status = 'tight';
    else                                  status = 'overloaded';
    return { loadMin, availableMin, utilization, status };
  }

  // ─────────────────────────────────────────────────────────
  // Bottleneck analysis
  // ─────────────────────────────────────────────────────────

  /**
   * Identify the work centre with the highest utilisation (or a tie).
   * Uses CPP as the primary signal (detailed); falls back to RCCP.
   */
  bottleneckAnalysis(period) {
    const cpp = this.cpp(period);
    const ranked = [...cpp.byWorkCenter.entries()]
      .map(([wcId, v]) => ({ workCenterId: wcId, ...v }))
      .sort((a, b) => (b.utilization || 0) - (a.utilization || 0));

    const primary = ranked[0] || null;
    const overloaded = ranked.filter((r) => r.status === 'overloaded');

    return {
      period,
      primaryBottleneck: primary,
      overloaded,
      ranked,
      recommendation: primary && primary.status === 'overloaded'
        ? `Work centre ${primary.workCenterId} overloaded at ${(primary.utilization * 100).toFixed(1)}% — consider overtime, added shift, or subcontracting.`
        : primary && primary.status === 'tight'
          ? `Work centre ${primary.workCenterId} is tight (${(primary.utilization * 100).toFixed(1)}%) — monitor closely, pre-plan buffer.`
          : 'All work centres within capacity.',
    };
  }

  // ─────────────────────────────────────────────────────────
  // What-if simulation
  // ─────────────────────────────────────────────────────────

  /**
   * Simulate a capacity scenario without mutating the planner state.
   * Supported `scenario.type`:
   *
   *   - 'addShift':      append a shift to a work centre's calendar.
   *     { workCenterId, shift:{name,start,end,days} }
   *
   *   - 'overtime':      extend daily minutes by N min on weekdays.
   *     { workCenterId, extraMinPerDay }
   *
   *   - 'addMachine':    +N parallel machines to a work centre.
   *     { workCenterId, machines }
   *
   *   - 'subcontract':   remove N load-minutes from a work centre.
   *     { workCenterId, minutes }
   *
   * Returns: before / after capacity + bottleneck comparison.
   */
  whatIf({ scenario, period }) {
    if (!scenario || !scenario.type) throw new TypeError('scenario required');

    const clone = this._clone();
    const before = {
      capacity: {},
      bottleneck: this.bottleneckAnalysis(period),
    };
    for (const [wcId] of this._calendars) {
      before.capacity[wcId] = this.availableCapacity(wcId, period).availableMinutes;
    }

    switch (scenario.type) {
      case 'addShift': {
        const cal = clone._calendars.get(scenario.workCenterId);
        if (!cal) throw new RangeError(`unknown wc ${scenario.workCenterId}`);
        cal.shifts.push({ ...scenario.shift });
        break;
      }
      case 'overtime': {
        const cal = clone._calendars.get(scenario.workCenterId);
        if (!cal) throw new RangeError(`unknown wc ${scenario.workCenterId}`);
        // Implement as an extra shift tagged 'overtime' on weekdays 0..4.
        cal.shifts.push({
          name: 'overtime',
          start: '17:00',
          end: _addMinutes('17:00', scenario.extraMinPerDay || 60),
          days: [0, 1, 2, 3, 4],
        });
        break;
      }
      case 'addMachine': {
        const cal = clone._calendars.get(scenario.workCenterId);
        if (!cal) throw new RangeError(`unknown wc ${scenario.workCenterId}`);
        cal.machines += scenario.machines || 1;
        break;
      }
      case 'subcontract': {
        // Mark load reduction on CPP — inject a fake "subcontract" work order
        // with negative quantity / zero-time routing isn't clean. Instead,
        // store a deduction hint that cpp() will honour via clone-only state.
        clone._subcontractDeductions = clone._subcontractDeductions || new Map();
        const prev = clone._subcontractDeductions.get(scenario.workCenterId) || 0;
        clone._subcontractDeductions.set(
          scenario.workCenterId,
          prev + (scenario.minutes || 0),
        );
        // Patch cpp to subtract.
        const origCpp = clone.cpp.bind(clone);
        clone.cpp = function (p) {
          const r = origCpp(p);
          for (const [wcId, deduct] of clone._subcontractDeductions) {
            const entry = r.byWorkCenter.get(wcId);
            if (entry) {
              const newLoad = Math.max(0, entry.loadMin - deduct);
              r.byWorkCenter.set(wcId, this._summarise(newLoad, entry.availableMin));
            }
          }
          return r;
        };
        break;
      }
      default:
        throw new RangeError(`unknown scenario type: ${scenario.type}`);
    }

    const after = {
      capacity: {},
      bottleneck: clone.bottleneckAnalysis(period),
    };
    for (const [wcId] of clone._calendars) {
      after.capacity[wcId] = clone.availableCapacity(wcId, period).availableMinutes;
    }

    return { scenario, period, before, after };
  }

  // ─────────────────────────────────────────────────────────
  // Load Levelling
  // ─────────────────────────────────────────────────────────

  /**
   * Smooth demand across periods by shifting work orders to earlier
   * slots when their work centre is overloaded.
   *
   * Returns a **plan**, not a mutation. The caller decides whether to
   * apply the rescheduling. Principle: לא מוחקים רק משדרגים ומגדלים —
   * this never discards an order, only suggests an earlier start.
   *
   * The algorithm buckets the period into calendar weeks, computes
   * per-week utilisation, and for any week where utilisation > 1.0 it
   * suggests moving its excess to the first prior week with headroom.
   */
  loadLevel(period) {
    const { from, to } = period || {};
    if (!from || !to) throw new TypeError('period required');

    const weeks = this._weeklyBuckets(from, to);
    const suggestions = [];
    const byWeek = [];

    for (const w of weeks) {
      const weekPeriod = { from: w.from, to: w.to };
      const cpp = this.cpp(weekPeriod);
      const summary = {};
      for (const [wcId, v] of cpp.byWorkCenter) summary[wcId] = v;
      byWeek.push({ week: w.label, period: weekPeriod, summary });
    }

    // Greedy levelling: for each overloaded week, try to move excess
    // minutes backward to the earliest prior week with headroom.
    for (let i = 0; i < byWeek.length; i++) {
      const cur = byWeek[i];
      for (const [wcId, v] of Object.entries(cur.summary)) {
        if (v.status !== 'overloaded') continue;
        let excess = v.loadMin - v.availableMin;
        for (let j = 0; j < i && excess > 0; j++) {
          const prev = byWeek[j].summary[wcId];
          if (!prev) continue;
          const headroom = Math.max(0, prev.availableMin - prev.loadMin);
          if (headroom > 0) {
            const move = Math.min(headroom, excess);
            excess -= move;
            prev.loadMin += move;
            cur.summary[wcId] = {
              ...v,
              loadMin: v.loadMin - move,
            };
            suggestions.push({
              workCenterId: wcId,
              minutes: move,
              fromWeek: cur.week,
              toWeek: byWeek[j].week,
              reason: 'pull-forward',
            });
          }
        }
        if (excess > 0) {
          suggestions.push({
            workCenterId: wcId,
            minutes: excess,
            fromWeek: cur.week,
            toWeek: null,
            reason: 'residual-overload-needs-scenario',
          });
        }
      }
    }

    return { period, byWeek, suggestions };
  }

  // ─────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────

  _weeklyBuckets(from, to) {
    const days = eachDay(from, to);
    const buckets = [];
    let cur = null;
    let weekNo = 0;
    for (const iso of days) {
      const dow = dayOfWeek(iso);
      if (!cur || dow === 0) {
        if (cur) buckets.push(cur);
        weekNo += 1;
        cur = { label: `W${weekNo}`, from: iso, to: iso };
      } else {
        cur.to = iso;
      }
    }
    if (cur) buckets.push(cur);
    return buckets;
  }

  _clone() {
    const c = new CapacityPlanner({ extraHolidays: [...this._shutdowns], fridayHalfDay: this._fridayHalf });
    for (const [k, v] of this._calendars) {
      c._calendars.set(k, {
        ...v,
        shifts: v.shifts.map((s) => ({ ...s })),
        holidays: v.holidays.map((h) => ({ ...h })),
      });
    }
    c._workOrders = this._workOrders.map((w) => ({ ...w }));
    c._forecast   = this._forecast.map((f) => ({ ...f }));
    c._routings   = new Map([...this._routings].map(([k, v]) => [k, v.map((o) => ({ ...o }))]));
    c._bor        = new Map([...this._bor].map(([k, v]) => [k, v.map((b) => ({ ...b }))]));
    return c;
  }
}

// ───────────────────────────────────────────────────────────────
// Time arithmetic helper used by the 'overtime' scenario
// ───────────────────────────────────────────────────────────────

function _addMinutes(hm, delta) {
  const base = hmToMinutes(hm) + delta;
  const h = Math.floor((base % (24 * 60)) / 60);
  const m = base % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ───────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────

module.exports = {
  CapacityPlanner,
  HOLIDAYS_IL,
  GLOSSARY,
  getIsraeliHolidays,
  resolveHoliday,
  // Expose helpers for tests / advanced callers
  _helpers: { dayOfWeek, eachDay, hmToMinutes, shiftMinutes },
};
