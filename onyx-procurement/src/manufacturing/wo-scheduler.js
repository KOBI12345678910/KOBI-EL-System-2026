/**
 * wo-scheduler.js — Agent Y-033
 * Work Order Scheduler for Techno-Kol Uzi mega-ERP (metal fabrication)
 *
 * מתזמן פקודות עבודה / Work Order Scheduler
 * ---------------------------------------------------
 *  - Finite-capacity scheduling (work centers are bounded)
 *  - Forward scheduling (start-at-earliest)
 *  - Backward scheduling (finish just-in-time)
 *  - Critical-ratio priority dispatching
 *  - Setup / queue / move time aware
 *  - Cascade reschedule on disruption
 *  - Gantt chart data (X-24 Gantt compatible)
 *  - Shop-floor dispatch list
 *  - Shop-floor progress feedback (updateProgress)
 *  - On-time delivery (OTD) KPI
 *
 *  Zero external dependencies. Pure JS. Hebrew RTL bilingual.
 *
 *  RULE: לא מוחקים רק משדרגים ומגדלים — never-delete.
 *  Work orders are `cancelled`, not removed.  History is preserved.
 *
 *  ─────────────────────────────────────────────────────────────
 *  Data model (in-memory, JSON-serializable)
 *  ─────────────────────────────────────────────────────────────
 *
 *  Routing (work-order recipe):
 *    { id, sku, name, name_he,
 *      operations: [ {
 *        op, seq, workCenterId, workCenterName_he,
 *        setupMin, runMinPerUnit, queueMin, moveMin,
 *        description, description_he
 *      } ] }
 *
 *  Work Center:
 *    { id, name, name_he,
 *      capacityMinPerDay,   // total bookable minutes / day
 *      shiftsPerDay,        // informative
 *      efficiency }         // 0..1  (1 = 100%)
 *
 *  Work Order:
 *    { id, sku, qty, dueDate, priority, routingId,
 *      materialsAvailable, status, released_at, created_at,
 *      schedule: [
 *        { op, seq, workCenterId,
 *          plannedStart, plannedEnd,
 *          setupMin, runMin, queueMin, moveMin,
 *          actualStart, actualEnd, quantityCompleted, status }
 *      ],
 *      plannedStart, plannedEnd,
 *      actualStart, actualEnd,
 *      direction,          // "forward" | "backward"
 *      cancelled, cancelReason }
 *
 *  All dates are ISO strings (UTC). Minutes are the base unit for operations.
 *  Days are derived by MS_PER_DAY for KPIs.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  Constants / enums
// ─────────────────────────────────────────────────────────────

const WO_STATUS = Object.freeze({
  DRAFT: 'draft',
  PLANNED: 'planned',
  RELEASED: 'released',
  IN_PROGRESS: 'in_progress',
  ON_HOLD: 'on_hold',
  DONE: 'done',
  CANCELLED: 'cancelled',
});

const WO_STATUS_HE = Object.freeze({
  draft: 'טיוטה',
  planned: 'מתוכנן',
  released: 'שוחרר',
  in_progress: 'בביצוע',
  on_hold: 'מושהה',
  done: 'הושלם',
  cancelled: 'בוטל',
});

const OP_STATUS = Object.freeze({
  PLANNED: 'planned',
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  SKIPPED: 'skipped',
});

const OP_STATUS_HE = Object.freeze({
  planned: 'מתוכנן',
  queued: 'בתור',
  running: 'בביצוע',
  done: 'הושלם',
  skipped: 'דולג',
});

const PRIORITY = Object.freeze({
  LOW: 'low',
  MED: 'med',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const PRIORITY_WEIGHT = Object.freeze({
  low: 1,
  med: 2,
  high: 3,
  critical: 5,
});

const DIRECTION = Object.freeze({
  FORWARD: 'forward',
  BACKWARD: 'backward',
});

const MS_PER_MIN = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CAPACITY_MIN_PER_DAY = 480;   // 8h × 60m — single shift
const DEFAULT_EFFICIENCY = 1.0;

// Hebrew glossary (exported for docs / UI)
const GLOSSARY_HE = Object.freeze({
  work_order: 'פקודת עבודה',
  work_center: 'מרכז עבודה',
  routing: 'מסלול ייצור',
  operation: 'פעולה',
  setup: 'הכנה',
  run: 'ריצה',
  queue: 'המתנה בתור',
  move: 'מעבר בין תחנות',
  forward: 'קדימה (מוקדם)',
  backward: 'אחורה (בדיוק בזמן)',
  capacity: 'קיבולת',
  conflict: 'חפיפה / קונפליקט',
  critical_ratio: 'יחס קריטי',
  dispatch: 'רשימת שיגור',
  shop_floor: 'רצפת ייצור',
  otd: 'אחוז עמידה ביעד אספקה',
});

// ─────────────────────────────────────────────────────────────
//  Date / time helpers  (ISO UTC)
// ─────────────────────────────────────────────────────────────

function toDate(s) {
  if (s instanceof Date) return new Date(s.getTime());
  if (typeof s === 'number') return new Date(s);
  if (typeof s !== 'string') return new Date(NaN);
  const str = s.length === 10 ? s + 'T00:00:00Z' : s;
  return new Date(str);
}

function toIso(d) {
  const x = d instanceof Date ? d : toDate(d);
  if (!(x instanceof Date) || isNaN(x.getTime())) return null;
  return x.toISOString();
}

function toDayIso(d) {
  const iso = toIso(d);
  return iso ? iso.slice(0, 10) : null;
}

function addMinutes(iso, minutes) {
  const d = toDate(iso);
  d.setTime(d.getTime() + Math.round(Number(minutes || 0)) * MS_PER_MIN);
  return toIso(d);
}

function subtractMinutes(iso, minutes) {
  return addMinutes(iso, -Number(minutes || 0));
}

function diffMinutes(a, b) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_PER_MIN);
}

function diffDays(a, b) {
  return (toDate(b).getTime() - toDate(a).getTime()) / MS_PER_DAY;
}

function maxIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return toDate(a).getTime() >= toDate(b).getTime() ? a : b;
}

function minIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return toDate(a).getTime() <= toDate(b).getTime() ? a : b;
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

// ─────────────────────────────────────────────────────────────
//  ID generator
// ─────────────────────────────────────────────────────────────

function makeIdGen(prefix) {
  let n = 0;
  return () => `${prefix}-${(++n).toString(36).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────
//  WorkOrderScheduler — the class
// ─────────────────────────────────────────────────────────────

class WorkOrderScheduler {
  /**
   * @param {object} opts
   *   - workCenters : Array<{id,name,name_he,capacityMinPerDay,shiftsPerDay,efficiency}>
   *   - routings    : Array<Routing>
   *   - now         : optional clock override for tests (ISO string)
   */
  constructor(opts = {}) {
    this.workCenters = new Map();
    this.routings = new Map();
    this.workOrders = new Map();         // id -> WO
    this.bookings = new Map();           // workCenterId -> [{woId, op, seq, start, end}]
    this.events = [];
    this._now = opts.now || null;
    this._nextWoId = opts.woIdGen || makeIdGen('wo');
    this._nextRoutingId = opts.routingIdGen || makeIdGen('rt');

    if (Array.isArray(opts.workCenters)) {
      for (const wc of opts.workCenters) this.addWorkCenter(wc);
    }
    if (Array.isArray(opts.routings)) {
      for (const r of opts.routings) this.addRouting(r);
    }
  }

  // ─────────── Clock ───────────

  now() {
    return this._now || nowIso();
  }

  setClock(iso) {
    this._now = iso || null;
    return this._now;
  }

  // ─────────── Events / audit ───────────

  _emit(type, payload) {
    this.events.push({ type, at: nowIso(), payload });
    if (this.events.length > 5000) {
      this.events.splice(0, this.events.length - 5000);
    }
  }

  getEvents() {
    return this.events.slice();
  }

  // ─────────── Master data: work centers ───────────

  addWorkCenter(wc) {
    if (!wc || !wc.id) throw new Error('addWorkCenter: id required');
    const rec = {
      id: String(wc.id),
      name: wc.name || wc.id,
      name_he: wc.name_he || wc.name || wc.id,
      capacityMinPerDay: Number(wc.capacityMinPerDay) > 0
        ? Number(wc.capacityMinPerDay)
        : DEFAULT_CAPACITY_MIN_PER_DAY,
      shiftsPerDay: Number(wc.shiftsPerDay || 1),
      efficiency: Number.isFinite(Number(wc.efficiency))
        ? clamp(wc.efficiency, 0.01, 2)
        : DEFAULT_EFFICIENCY,
    };
    this.workCenters.set(rec.id, rec);
    if (!this.bookings.has(rec.id)) this.bookings.set(rec.id, []);
    this._emit('workcenter.added', { id: rec.id });
    return rec;
  }

  getWorkCenter(id) {
    return this.workCenters.get(id) || null;
  }

  listWorkCenters() {
    return Array.from(this.workCenters.values()).map((x) => ({ ...x }));
  }

  // ─────────── Master data: routings ───────────

  addRouting(routing) {
    if (!routing || !Array.isArray(routing.operations)) {
      throw new Error('addRouting: operations[] required');
    }
    const id = routing.id || this._nextRoutingId();
    if (this.routings.has(id)) {
      throw new Error(`addRouting: duplicate id ${id}`);
    }
    const rec = {
      id,
      sku: routing.sku || null,
      name: routing.name || id,
      name_he: routing.name_he || routing.name || id,
      operations: routing.operations.map((op, i) => ({
        op: op.op || op.opCode || `OP${i + 1}`,
        seq: Number.isFinite(Number(op.seq)) ? Number(op.seq) : (i + 1) * 10,
        workCenterId: String(op.workCenterId || ''),
        workCenterName_he: op.workCenterName_he || null,
        setupMin: Math.max(0, Number(op.setupMin || 0)),
        runMinPerUnit: Math.max(0, Number(op.runMinPerUnit || 0)),
        queueMin: Math.max(0, Number(op.queueMin || 0)),
        moveMin: Math.max(0, Number(op.moveMin || 0)),
        description: op.description || op.op || `OP${i + 1}`,
        description_he: op.description_he || op.description || '',
      })).sort((a, b) => a.seq - b.seq),
    };
    this.routings.set(id, rec);
    this._emit('routing.added', { id });
    return rec;
  }

  getRouting(id) {
    return this.routings.get(id) || null;
  }

  // ─────────── WO creation ───────────

  /**
   * createWO({id, sku, qty, dueDate, priority, routingId, materialsAvailable})
   * Returns the full work-order record (not scheduled yet — call scheduleForward/Backward).
   */
  createWO(fields) {
    if (!fields || typeof fields !== 'object') {
      throw new Error('createWO: fields object required');
    }
    if (!fields.sku) throw new Error('createWO: sku required');
    if (!Number.isFinite(Number(fields.qty)) || Number(fields.qty) <= 0) {
      throw new Error('createWO: qty > 0 required');
    }
    if (!fields.routingId) throw new Error('createWO: routingId required');
    const routing = this.routings.get(fields.routingId);
    if (!routing) throw new Error(`createWO: routing not found ${fields.routingId}`);

    const id = fields.id || this._nextWoId();
    if (this.workOrders.has(id)) throw new Error(`createWO: duplicate id ${id}`);

    const qty = Number(fields.qty);
    const schedule = routing.operations.map((op) => {
      const wc = this.workCenters.get(op.workCenterId) || null;
      const eff = wc ? (wc.efficiency || 1) : 1;
      const runMin = op.runMinPerUnit * qty / eff;
      return {
        op: op.op,
        seq: op.seq,
        workCenterId: op.workCenterId,
        plannedStart: null,
        plannedEnd: null,
        setupMin: op.setupMin,
        runMin: Math.max(0, Math.round(runMin)),
        queueMin: op.queueMin,
        moveMin: op.moveMin,
        actualStart: null,
        actualEnd: null,
        quantityCompleted: 0,
        status: OP_STATUS.PLANNED,
      };
    });

    const wo = {
      id,
      sku: String(fields.sku),
      qty,
      dueDate: fields.dueDate ? toIso(fields.dueDate) : null,
      priority: fields.priority || PRIORITY.MED,
      routingId: fields.routingId,
      materialsAvailable: !!fields.materialsAvailable,
      status: WO_STATUS.DRAFT,
      released_at: null,
      created_at: nowIso(),
      schedule,
      plannedStart: null,
      plannedEnd: null,
      actualStart: null,
      actualEnd: null,
      direction: null,
      cancelled: false,
      cancelReason: null,
    };
    this.workOrders.set(id, wo);
    this._emit('wo.created', { id, sku: wo.sku, qty });
    return wo;
  }

  getWO(id) {
    return this.workOrders.get(id) || null;
  }

  listWOs(filter = {}) {
    let out = Array.from(this.workOrders.values());
    if (filter.status) out = out.filter((w) => w.status === filter.status);
    if (filter.sku) out = out.filter((w) => w.sku === filter.sku);
    if (filter.workCenterId) {
      out = out.filter((w) =>
        w.schedule.some((s) => s.workCenterId === filter.workCenterId));
    }
    return out.map((w) => this._cloneWO(w));
  }

  _cloneWO(w) {
    return {
      ...w,
      schedule: w.schedule.map((s) => ({ ...s })),
    };
  }

  // Never-delete rule: cancel, do not remove.
  cancelWO(id, reason) {
    const w = this.workOrders.get(id);
    if (!w) throw new Error(`cancelWO: not found ${id}`);
    w.status = WO_STATUS.CANCELLED;
    w.cancelled = true;
    w.cancelReason = reason || null;
    this._removeBookings(id);
    this._emit('wo.cancelled', { id, reason });
    return this._cloneWO(w);
  }

  // ─────────── Scheduling: FORWARD ───────────

  /**
   * scheduleForward(wo, startDate)
   * ------------------------------------------------------------
   * Schedules every operation sequentially starting at `startDate`,
   * respecting setup → queue → run → move and finite capacity on
   * each work center.  Mutates wo.schedule and wo.plannedStart/End.
   */
  scheduleForward(wo, startDate) {
    const w = this._resolveWO(wo);
    const start = toIso(startDate || this.now());
    if (!start) throw new Error('scheduleForward: invalid startDate');

    // Wipe prior bookings owned by this WO
    this._removeBookings(w.id);

    let cursor = start;
    for (const step of w.schedule) {
      // queue waits before booking the work center
      let earliestBookable = addMinutes(cursor, step.queueMin);
      const dur = step.setupMin + step.runMin;
      const slot = this._findForwardSlot(step.workCenterId, earliestBookable, dur);
      step.plannedStart = slot.start;
      step.plannedEnd = slot.end;
      step.status = OP_STATUS.PLANNED;
      this._addBooking(step.workCenterId, w.id, step, slot);
      // move time to the next station
      cursor = addMinutes(slot.end, step.moveMin);
    }

    w.plannedStart = w.schedule.length ? w.schedule[0].plannedStart : null;
    w.plannedEnd = w.schedule.length
      ? w.schedule[w.schedule.length - 1].plannedEnd
      : null;
    w.direction = DIRECTION.FORWARD;
    w.status = (w.status === WO_STATUS.DRAFT) ? WO_STATUS.PLANNED : w.status;

    this._emit('wo.scheduled.forward', {
      id: w.id, start: w.plannedStart, end: w.plannedEnd,
    });
    return this._cloneWO(w);
  }

  // ─────────── Scheduling: BACKWARD ───────────

  /**
   * scheduleBackward(wo, dueDate)
   * ------------------------------------------------------------
   * Back-schedules from dueDate → last op must finish by dueDate
   * (minus its moveMin out), previous ops align to end at the start
   * of the next.  Respects finite capacity by searching backwards
   * for an open slot on each work center.
   */
  scheduleBackward(wo, dueDate) {
    const w = this._resolveWO(wo);
    const due = toIso(dueDate || w.dueDate);
    if (!due) throw new Error('scheduleBackward: invalid dueDate');

    this._removeBookings(w.id);

    // walk from last op to first
    let cursor = due;
    for (let i = w.schedule.length - 1; i >= 0; i--) {
      const step = w.schedule[i];
      // end (before move) — subtract move-out of this op
      const latestEnd = subtractMinutes(cursor, step.moveMin);
      const dur = step.setupMin + step.runMin;
      const slot = this._findBackwardSlot(step.workCenterId, latestEnd, dur);
      step.plannedStart = slot.start;
      step.plannedEnd = slot.end;
      step.status = OP_STATUS.PLANNED;
      this._addBooking(step.workCenterId, w.id, step, slot);
      // the start minus queueMin is the cursor for the previous op
      cursor = subtractMinutes(slot.start, step.queueMin);
    }

    w.plannedStart = w.schedule.length ? w.schedule[0].plannedStart : null;
    w.plannedEnd = w.schedule.length
      ? w.schedule[w.schedule.length - 1].plannedEnd
      : null;
    w.direction = DIRECTION.BACKWARD;
    w.status = (w.status === WO_STATUS.DRAFT) ? WO_STATUS.PLANNED : w.status;

    this._emit('wo.scheduled.backward', {
      id: w.id, start: w.plannedStart, end: w.plannedEnd,
    });
    return this._cloneWO(w);
  }

  // ─────────── Finite capacity: slot search ───────────

  /**
   * Walk the bookings of a work center in time order and find the
   * first gap >= durationMin that starts at or after `earliest`.
   * If the work center isn't registered we still allocate a slot
   * (treating it as infinite capacity — but we emit a warning event).
   */
  _findForwardSlot(workCenterId, earliest, durationMin) {
    const books = this._sortedBookings(workCenterId);
    let cursor = toDate(earliest).getTime();
    const durMs = durationMin * MS_PER_MIN;

    // Skip over any existing booking that overlaps [cursor, cursor+dur)
    for (const b of books) {
      const bs = toDate(b.start).getTime();
      const be = toDate(b.end).getTime();
      if (be <= cursor) continue; // past
      if (bs >= cursor + durMs) break; // gap is large enough
      // overlap — push cursor to end of this booking
      cursor = Math.max(cursor, be);
    }
    const startIso = toIso(new Date(cursor));
    const endIso = addMinutes(startIso, durationMin);
    return { start: startIso, end: endIso };
  }

  _findBackwardSlot(workCenterId, latestEnd, durationMin) {
    const books = this._sortedBookings(workCenterId).slice().reverse();
    let cursor = toDate(latestEnd).getTime();
    const durMs = durationMin * MS_PER_MIN;

    for (const b of books) {
      const bs = toDate(b.start).getTime();
      const be = toDate(b.end).getTime();
      if (bs >= cursor) continue; // future of our end — no effect
      if (be <= cursor - durMs) break; // gap is big enough
      // overlap — pull cursor down to start of this booking
      cursor = Math.min(cursor, bs);
    }
    const endIso = toIso(new Date(cursor));
    const startIso = addMinutes(endIso, -durationMin);
    return { start: startIso, end: endIso };
  }

  _sortedBookings(workCenterId) {
    const arr = this.bookings.get(workCenterId) || [];
    return arr.slice().sort(
      (a, b) => toDate(a.start).getTime() - toDate(b.start).getTime()
    );
  }

  _addBooking(workCenterId, woId, step, slot) {
    if (!this.bookings.has(workCenterId)) {
      this.bookings.set(workCenterId, []);
    }
    this.bookings.get(workCenterId).push({
      woId,
      op: step.op,
      seq: step.seq,
      start: slot.start,
      end: slot.end,
    });
  }

  _removeBookings(woId) {
    for (const [wcId, list] of this.bookings.entries()) {
      this.bookings.set(wcId, list.filter((b) => b.woId !== woId));
    }
  }

  _resolveWO(wo) {
    if (!wo) throw new Error('WO required');
    if (typeof wo === 'string') {
      const found = this.workOrders.get(wo);
      if (!found) throw new Error(`WO not found: ${wo}`);
      return found;
    }
    if (wo.id && this.workOrders.has(wo.id)) {
      return this.workOrders.get(wo.id);
    }
    throw new Error('WO not managed by this scheduler');
  }

  // ─────────── Capacity audit ───────────

  /**
   * finiteCapacityCheck(schedule?)
   * Detects overbooking on any work center.  If a schedule is passed,
   * it is layered on top of the existing bookings for simulation.
   * Returns an array of conflicts: {workCenterId, a, b, overlapMin}
   * Also returns per-day utilization >= 100%.
   */
  finiteCapacityCheck(schedule) {
    const conflicts = [];
    const utilizationWarn = [];

    // 1.  pairwise overlap detection per work center
    const simMap = new Map();
    for (const [wcId, list] of this.bookings.entries()) {
      simMap.set(wcId, list.slice());
    }
    if (Array.isArray(schedule)) {
      for (const s of schedule) {
        if (!s || !s.workCenterId) continue;
        if (!simMap.has(s.workCenterId)) simMap.set(s.workCenterId, []);
        simMap.get(s.workCenterId).push({
          woId: s.woId || '__sim__',
          op: s.op || null,
          seq: s.seq || null,
          start: toIso(s.start || s.plannedStart),
          end: toIso(s.end || s.plannedEnd),
        });
      }
    }

    for (const [wcId, list] of simMap.entries()) {
      const sorted = list.slice().sort(
        (a, b) => toDate(a.start).getTime() - toDate(b.start).getTime()
      );
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          const aEnd = toDate(a.end).getTime();
          const bStart = toDate(b.start).getTime();
          if (bStart >= aEnd) break; // sorted — no more overlap after
          const overlapMs = Math.min(aEnd, toDate(b.end).getTime()) - bStart;
          conflicts.push({
            workCenterId: wcId,
            a: { woId: a.woId, op: a.op, start: a.start, end: a.end },
            b: { woId: b.woId, op: b.op, start: b.start, end: b.end },
            overlapMin: Math.round(overlapMs / MS_PER_MIN),
          });
        }
      }
    }

    // 2.  daily utilization > capacity
    for (const [wcId, list] of simMap.entries()) {
      const wc = this.workCenters.get(wcId);
      if (!wc) continue;
      const perDay = new Map();
      for (const b of list) {
        const sMs = toDate(b.start).getTime();
        const eMs = toDate(b.end).getTime();
        const durMin = Math.max(0, Math.round((eMs - sMs) / MS_PER_MIN));
        const day = toDayIso(b.start);
        perDay.set(day, (perDay.get(day) || 0) + durMin);
      }
      for (const [day, minutes] of perDay.entries()) {
        if (minutes > wc.capacityMinPerDay) {
          utilizationWarn.push({
            workCenterId: wcId,
            day,
            bookedMin: minutes,
            capacityMin: wc.capacityMinPerDay,
            overload: minutes - wc.capacityMinPerDay,
            utilizationPct: Math.round((minutes / wc.capacityMinPerDay) * 100),
          });
        }
      }
    }

    return { conflicts, utilizationWarn };
  }

  // ─────────── Critical ratio / priority ───────────

  /**
   * Critical ratio (CR):
   *    CR = (days remaining to due) / (days of work remaining)
   *  CR < 1  →  behind / urgent
   *  CR = 1  →  exactly on pace
   *  CR > 1  →  slack available
   * Undefined due → Infinity (lowest urgency, but we still respect nominal priority).
   */
  criticalRatio(wo) {
    const w = this._resolveWOSafe(wo);
    if (!w) return null;
    const now = this.now();
    if (!w.dueDate) return Infinity;
    const daysToDue = diffDays(now, w.dueDate);

    let remainingMin = 0;
    for (const s of w.schedule) {
      if (s.status === OP_STATUS.DONE) continue;
      remainingMin += s.setupMin + s.runMin + s.queueMin + s.moveMin;
    }
    // convert to days using a work center's capacity when known,
    // else 8h/day baseline
    const daysOfWork = remainingMin / DEFAULT_CAPACITY_MIN_PER_DAY;
    if (daysOfWork <= 0) return Infinity; // nothing to do
    return daysToDue / daysOfWork;
  }

  _resolveWOSafe(wo) {
    try {
      return this._resolveWO(wo);
    } catch (e) {
      return null;
    }
  }

  _priorityScore(wo) {
    const cr = this.criticalRatio(wo);
    const prBoost = PRIORITY_WEIGHT[wo.priority] || PRIORITY_WEIGHT.med;
    // lower CR = more urgent.  score combines the two: lower is better.
    // Infinity CR (no due) degrades to a neutral base.
    const crComponent = Number.isFinite(cr) ? cr : 999;
    return crComponent / prBoost;
  }

  // ─────────── Reschedule / cascade ───────────

  /**
   * reschedule({woId, reason, shift})
   *   - `shift` may be  { minutes }  or  { days }  or  { startDate }  or  { dueDate }
   *     positive values push later, negatives pull earlier
   *   - Cascade: any op dependent on this WO (same work center overlapping)
   *     is nudged forward in critical-ratio order.
   */
  reschedule({ woId, reason, shift }) {
    const w = this._resolveWO(woId);
    if (!w.schedule.length) return this._cloneWO(w);
    if (!shift) throw new Error('reschedule: shift required');

    let deltaMin = 0;
    if (Number.isFinite(Number(shift.minutes))) {
      deltaMin = Number(shift.minutes);
    } else if (Number.isFinite(Number(shift.days))) {
      deltaMin = Number(shift.days) * 24 * 60;
    } else if (shift.startDate) {
      const oldStart = w.plannedStart || w.schedule[0].plannedStart;
      deltaMin = diffMinutes(oldStart, shift.startDate);
    } else if (shift.dueDate) {
      const oldEnd = w.plannedEnd || w.schedule[w.schedule.length - 1].plannedEnd;
      deltaMin = diffMinutes(oldEnd, shift.dueDate);
    } else {
      throw new Error('reschedule: shift.{minutes|days|startDate|dueDate} required');
    }

    // Remove own bookings first
    this._removeBookings(w.id);

    // Determine a new start cursor
    const oldStart = w.plannedStart || w.schedule[0].plannedStart || this.now();
    const newStart = addMinutes(oldStart, deltaMin);
    this.scheduleForward(w, newStart);

    this._emit('wo.rescheduled', {
      id: w.id, reason: reason || null, deltaMin,
    });

    // Cascade — anything that now conflicts gets pushed in CR order
    const cascade = this._cascadeOnConflict(w.id);

    return { wo: this._cloneWO(w), cascade, deltaMin };
  }

  _cascadeOnConflict(originWoId, guard = 0) {
    if (guard > 20) return []; // bounded
    const cascaded = [];
    const check = this.finiteCapacityCheck();
    if (!check.conflicts.length) return cascaded;

    // Collect conflicting WOs (other than origin) ranked by CR (urgent first)
    const woIds = new Set();
    for (const c of check.conflicts) {
      if (c.a.woId && c.a.woId !== originWoId) woIds.add(c.a.woId);
      if (c.b.woId && c.b.woId !== originWoId) woIds.add(c.b.woId);
    }
    if (!woIds.size) return cascaded;

    const ranked = Array.from(woIds)
      .map((id) => this.workOrders.get(id))
      .filter(Boolean)
      .sort((a, b) => this._priorityScore(b) - this._priorityScore(a));
    // we push the LESS urgent ones forward, keep the most urgent anchored

    for (const other of ranked) {
      // push by the overlap duration observed for this WO
      let pushMin = 0;
      for (const c of check.conflicts) {
        if (c.a.woId === other.id || c.b.woId === other.id) {
          pushMin = Math.max(pushMin, c.overlapMin);
        }
      }
      if (pushMin <= 0) continue;
      const oldStart = other.plannedStart || other.schedule[0].plannedStart || this.now();
      const newStart = addMinutes(oldStart, pushMin);
      this._removeBookings(other.id);
      this.scheduleForward(other, newStart);
      cascaded.push({ woId: other.id, deltaMin: pushMin });
      this._emit('wo.cascade.push', { id: other.id, deltaMin: pushMin });
    }

    // re-run once to catch secondary collisions
    if (cascaded.length) {
      const more = this._cascadeOnConflict(originWoId, guard + 1);
      return cascaded.concat(more);
    }
    return cascaded;
  }

  // ─────────── Gantt data ───────────

  /**
   * ganttData(period)
   *   period: { from, to }  both ISO (optional, defaults unbounded)
   * Returns an X-24 Gantt-compatible shape.
   */
  ganttData(period = {}) {
    const from = period.from ? toIso(period.from) : null;
    const to = period.to ? toIso(period.to) : null;

    const tasks = [];
    const milestones = [];
    let rowIndex = 0;

    for (const w of this.workOrders.values()) {
      if (w.cancelled) continue;
      if (!w.schedule.length) continue;
      if (from && w.plannedEnd && toDate(w.plannedEnd).getTime() < toDate(from).getTime()) continue;
      if (to && w.plannedStart && toDate(w.plannedStart).getTime() > toDate(to).getTime()) continue;

      // One row per op, grouped by wo.id for the Gantt to render a parent header
      w.schedule.forEach((s, i) => {
        if (!s.plannedStart || !s.plannedEnd) return;
        const cr = this.criticalRatio(w);
        const critical = Number.isFinite(cr) ? cr < 1 : false;
        tasks.push({
          id: `${w.id}:${s.op}`,
          wbs: `${w.id}.${i + 1}`,
          parent_id: w.id,
          title: `${w.sku} · ${s.op}`,
          title_he: `${w.sku} · ${s.op}`,
          start: toDayIso(s.plannedStart),
          end: toDayIso(s.plannedEnd),
          startIso: s.plannedStart,
          endIso: s.plannedEnd,
          duration: diffDays(s.plannedStart, s.plannedEnd),
          progress: s.quantityCompleted
            ? Math.round((s.quantityCompleted / w.qty) * 100)
            : 0,
          status: s.status,
          workCenterId: s.workCenterId,
          critical,
          priority: w.priority,
          row: rowIndex,
        });
      });

      // wo-level header (rolls up)
      tasks.push({
        id: w.id,
        wbs: w.id,
        parent_id: null,
        title: `WO ${w.id} ${w.sku}`,
        title_he: `פקודת עבודה ${w.id} ${w.sku}`,
        start: toDayIso(w.plannedStart),
        end: toDayIso(w.plannedEnd),
        startIso: w.plannedStart,
        endIso: w.plannedEnd,
        duration: diffDays(w.plannedStart, w.plannedEnd),
        progress: this._progressOfWO(w),
        status: w.status,
        critical: false,
        priority: w.priority,
        row: rowIndex,
        header: true,
      });

      if (w.dueDate) {
        milestones.push({
          id: `${w.id}:due`,
          wo_id: w.id,
          name: `Due: ${w.sku}`,
          name_he: `יעד אספקה: ${w.sku}`,
          date: toDayIso(w.dueDate),
          reached: w.actualEnd
            ? (toDate(w.actualEnd).getTime() <= toDate(w.dueDate).getTime())
            : false,
        });
      }
      rowIndex += 1;
    }

    return {
      tasks,
      milestones,
      period: { from, to },
      generated_at: nowIso(),
    };
  }

  _progressOfWO(w) {
    if (!w.schedule.length) return 0;
    let total = 0;
    for (const s of w.schedule) total += s.quantityCompleted;
    const target = w.schedule.length * w.qty;
    return target ? Math.round((total / target) * 100) : 0;
  }

  // ─────────── Dispatch list ───────────

  /**
   * dispatchList(workCenterId, shiftDate)
   *   Returns operations planned to run on `shiftDate` at `workCenterId`,
   *   sorted by priority score (critical-ratio based).
   */
  dispatchList(workCenterId, shiftDate) {
    if (!workCenterId) throw new Error('dispatchList: workCenterId required');
    const dayStart = toIso((toDayIso(shiftDate) || toDayIso(this.now())) + 'T00:00:00Z');
    const dayEnd = addMinutes(dayStart, 24 * 60);

    const rows = [];
    for (const w of this.workOrders.values()) {
      if (w.cancelled) continue;
      for (const s of w.schedule) {
        if (s.workCenterId !== workCenterId) continue;
        if (!s.plannedStart || !s.plannedEnd) continue;
        if (s.status === OP_STATUS.DONE) continue;
        const ss = toDate(s.plannedStart).getTime();
        const se = toDate(s.plannedEnd).getTime();
        const ds = toDate(dayStart).getTime();
        const de = toDate(dayEnd).getTime();
        // overlap
        if (se <= ds || ss >= de) continue;
        const score = this._priorityScore(w);
        rows.push({
          woId: w.id,
          sku: w.sku,
          qty: w.qty,
          op: s.op,
          seq: s.seq,
          priority: w.priority,
          priority_he: WO_STATUS_HE[w.priority] || w.priority,
          dueDate: w.dueDate,
          start: s.plannedStart,
          end: s.plannedEnd,
          setupMin: s.setupMin,
          runMin: s.runMin,
          status: s.status,
          status_he: OP_STATUS_HE[s.status] || s.status,
          criticalRatio: this.criticalRatio(w),
          score,
          materialsAvailable: w.materialsAvailable,
        });
      }
    }
    rows.sort((a, b) => a.score - b.score);
    return rows;
  }

  // ─────────── Shop-floor feedback ───────────

  /**
   * updateProgress(woId, opId, {status, actualStart, actualEnd, quantityCompleted})
   *   opId may be the op code (e.g. "OP10") or the seq number.
   */
  updateProgress(woId, opId, patch = {}) {
    const w = this._resolveWO(woId);
    const step = w.schedule.find(
      (s) => s.op === opId || s.seq === opId || String(s.seq) === String(opId)
    );
    if (!step) throw new Error(`updateProgress: op not found ${opId} on ${w.id}`);

    if (patch.actualStart) step.actualStart = toIso(patch.actualStart);
    if (patch.actualEnd) step.actualEnd = toIso(patch.actualEnd);
    if (Number.isFinite(Number(patch.quantityCompleted))) {
      step.quantityCompleted = clamp(Number(patch.quantityCompleted), 0, w.qty);
    }
    if (patch.status && Object.values(OP_STATUS).includes(patch.status)) {
      step.status = patch.status;
    } else if (step.actualEnd) {
      step.status = OP_STATUS.DONE;
    } else if (step.actualStart) {
      step.status = OP_STATUS.RUNNING;
    }

    // Roll up to WO status
    const doneCount = w.schedule.filter((s) => s.status === OP_STATUS.DONE).length;
    const runningCount = w.schedule.filter((s) => s.status === OP_STATUS.RUNNING).length;

    if (doneCount === w.schedule.length && w.schedule.length > 0) {
      w.status = WO_STATUS.DONE;
      if (!w.actualStart) {
        w.actualStart = w.schedule[0].actualStart || step.actualStart;
      }
      w.actualEnd = w.schedule[w.schedule.length - 1].actualEnd || step.actualEnd;
    } else if (runningCount > 0 || doneCount > 0) {
      w.status = WO_STATUS.IN_PROGRESS;
      if (!w.actualStart) {
        w.actualStart = step.actualStart || w.actualStart;
      }
    }

    this._emit('wo.progress', {
      id: w.id,
      op: step.op,
      status: step.status,
      quantityCompleted: step.quantityCompleted,
    });
    return { wo: this._cloneWO(w), step: { ...step } };
  }

  // ─────────── KPIs ───────────

  /**
   * computeOTD()
   * On-time delivery: a WO is on time when (status===done and actualEnd ≤ dueDate).
   * If it's not yet done, it's counted as late if today > dueDate.
   * Returns rate, counts and per-WO detail.
   */
  computeOTD(filter = {}) {
    const total = [];
    const late = [];
    const onTime = [];
    const inProgressLate = [];

    for (const w of this.workOrders.values()) {
      if (w.cancelled) continue;
      if (filter.sku && w.sku !== filter.sku) continue;
      if (filter.from && w.dueDate && toDate(w.dueDate).getTime() < toDate(filter.from).getTime()) continue;
      if (filter.to && w.dueDate && toDate(w.dueDate).getTime() > toDate(filter.to).getTime()) continue;
      if (!w.dueDate) continue; // without a due date OTD is undefined
      total.push(w);

      if (w.status === WO_STATUS.DONE) {
        const end = w.actualEnd || w.plannedEnd;
        if (end && toDate(end).getTime() <= toDate(w.dueDate).getTime()) {
          onTime.push(w.id);
        } else {
          late.push(w.id);
        }
      } else {
        // not done yet — was due in the past?
        if (toDate(this.now()).getTime() > toDate(w.dueDate).getTime()) {
          inProgressLate.push(w.id);
          late.push(w.id);
        }
      }
    }

    const totalClosed = total.filter((w) => w.status === WO_STATUS.DONE).length;
    const rate = total.length
      ? (onTime.length / total.length)
      : 1;

    return {
      total: total.length,
      closed: totalClosed,
      onTime: onTime.length,
      late: late.length,
      inProgressLate: inProgressLate.length,
      rate,                                  // 0..1
      ratePct: Math.round(rate * 1000) / 10,  // 93.4
      detail: {
        onTime,
        late,
        inProgressLate,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────
//  AG-Y033 v2 — WOScheduler (finite-capacity, calendar-aware)
// ─────────────────────────────────────────────────────────────
//
// This class is an UPGRADE on top of the legacy WorkOrderScheduler
// (the legacy class is preserved verbatim — see rule "לא מוחקים רק
// משדרגים ומגדלים").  WOScheduler adds:
//
//   - finite-capacity slot allocation per work-center (concurrent
//     slot count, e.g. 3 lasers in parallel)
//   - work-center calendars (shifts, breaks, holidays, Shabbat)
//   - Israeli 2026 statutory holidays out-of-the-box
//   - dispatch rules: EDD / SPT / FCFS / CR / SLACK
//   - capacityReport / ganttData / whatIf / priorityEscalate
//   - reschedule(woId) on disruption (material delay or breakdown)
//   - append-only change log per WO (status, schedule, escalations)
//
// In-memory storage only; zero deps; Hebrew + English bilingual.
// ─────────────────────────────────────────────────────────────

const DISPATCH_RULES = Object.freeze({
  EDD: 'EDD',     // earliest due date
  SPT: 'SPT',     // shortest processing time
  FCFS: 'FCFS',   // first come first served
  CR: 'CR',       // critical ratio
  SLACK: 'SLACK', // least slack
});

const DISPATCH_RULES_HE = Object.freeze({
  EDD: 'יעד אספקה מוקדם ביותר',
  SPT: 'זמן עיבוד קצר ביותר',
  FCFS: 'ראשון נכנס – ראשון מוגש',
  CR: 'יחס קריטי',
  SLACK: 'מרווח (slack) מינימלי',
});

const ISRAELI_HOLIDAYS_2026 = Object.freeze([
  // [iso-date, name_en, name_he]
  ['2026-03-03', 'Purim',                'פורים'],
  ['2026-04-02', 'Pesach Eve',           'ערב פסח'],
  ['2026-04-03', 'Pesach Day 1',         'פסח – יום ראשון'],
  ['2026-04-09', 'Pesach Day 7',         'שביעי של פסח'],
  ['2026-04-22', 'Yom HaShoah',          'יום השואה'],
  ['2026-04-29', 'Yom HaZikaron',        'יום הזיכרון'],
  ['2026-04-30', 'Independence Day',     'יום העצמאות'],
  ['2026-05-22', 'Shavuot',              'שבועות'],
  ['2026-09-11', 'Rosh Hashana Eve',     'ערב ראש השנה'],
  ['2026-09-12', 'Rosh Hashana Day 1',   'ראש השנה – יום א\''],
  ['2026-09-13', 'Rosh Hashana Day 2',   'ראש השנה – יום ב\''],
  ['2026-09-20', 'Yom Kippur Eve',       'ערב יום כיפור'],
  ['2026-09-21', 'Yom Kippur',           'יום כיפור'],
  ['2026-09-25', 'Sukkot Eve',           'ערב סוכות'],
  ['2026-09-26', 'Sukkot Day 1',         'סוכות – יום ראשון'],
  ['2026-10-03', 'Simchat Torah',        'שמחת תורה'],
]);

const DEFAULT_SHIFTS = Object.freeze([
  { name: 'morning', name_he: 'בוקר',   startMin: 7 * 60,  endMin: 15 * 60 },
  { name: 'evening', name_he: 'ערב',    startMin: 15 * 60, endMin: 23 * 60 },
]);

// Shabbat = Friday evening to Saturday evening.  In simplified planner mode
// we treat Saturday as fully off (UTC day 6).  Friday is half-day (we cap
// at 14:00 if shifts say otherwise).
const SHABBAT_DAY_UTC = 6;
const FRIDAY_DAY_UTC  = 5;
const FRIDAY_LAST_MIN = 14 * 60; // 14:00

function _ymd(d) {
  const x = d instanceof Date ? d : toDate(d);
  if (!x || isNaN(x.getTime())) return null;
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _startOfDay(iso) {
  const d = toDate(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function _addDays(iso, days) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function _minutesIntoDay(d) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

class WOScheduler {
  /**
   * @param {object} opts
   *  - now : ISO clock override for tests
   *  - workCenters : optional [{ id, name, name_he, slots, calendar }]
   */
  constructor(opts = {}) {
    this._now = opts.now || null;
    this.workCenters = new Map();   // wcId -> { id, name, name_he, slots, calendar }
    this.workOrders  = new Map();   // woId -> WO
    this.changeLog   = new Map();   // woId -> [{ at, type, ... }]
    this._holidayCache = new Map(); // year -> [{date,name,name_he}]
    this._holidayCache.set(2026, ISRAELI_HOLIDAYS_2026.map(([d, en, he]) => ({
      date: d, name: en, name_he: he,
    })));

    if (Array.isArray(opts.workCenters)) {
      for (const wc of opts.workCenters) {
        this.defineWorkCenter(wc);
      }
    }
  }

  // ─────────── clock ───────────
  now() { return this._now || nowIso(); }
  setClock(iso) { this._now = iso || null; return this._now; }

  // ─────────── work-centers ───────────
  defineWorkCenter(wc) {
    if (!wc || !wc.id) throw new Error('defineWorkCenter: id required');
    const rec = {
      id: String(wc.id),
      name:    wc.name    || wc.id,
      name_he: wc.name_he || wc.name || wc.id,
      slots: Math.max(1, Number(wc.slots || 1)),
      calendar: this._normalizeCalendar(wc.calendar),
      bookings: [], // [{woId, opSeq, slotIdx, start, end}]
    };
    this.workCenters.set(rec.id, rec);
    return rec;
  }

  _normalizeCalendar(cal) {
    cal = cal || {};
    return {
      shifts:   Array.isArray(cal.shifts)   && cal.shifts.length   ? cal.shifts.map((s) => ({ ...s }))   : DEFAULT_SHIFTS.map((s) => ({ ...s })),
      breaks:   Array.isArray(cal.breaks)   ? cal.breaks.map((b)   => ({ ...b })) : [],
      holidays: Array.isArray(cal.holidays) ? cal.holidays.slice() : [],
      shabbatOff: cal.shabbatOff !== false, // default true
    };
  }

  /**
   * setWorkCenterCalendar(wcId, { shifts, holidays, breaks, shabbatOff })
   * Creates the work center on the fly if it doesn't exist.
   */
  setWorkCenterCalendar(wcId, calendar) {
    if (!this.workCenters.has(wcId)) {
      this.defineWorkCenter({ id: wcId });
    }
    const wc = this.workCenters.get(wcId);
    wc.calendar = this._normalizeCalendar(calendar);
    return { ...wc, bookings: undefined };
  }

  getWorkCenter(wcId) {
    const wc = this.workCenters.get(wcId);
    if (!wc) return null;
    return { ...wc, bookings: wc.bookings.slice() };
  }

  // ─────────── holidays ───────────

  /**
   * listHolidays(year)
   * Returns Israeli statutory holidays for the requested year.
   * 2026 is hard-coded; for other years we approximate Independence
   * Day to Apr-30 and surface only the fixed (Gregorian) markers.
   */
  listHolidays(year) {
    const y = Number(year);
    if (!Number.isFinite(y)) throw new Error('listHolidays: year required');
    if (this._holidayCache.has(y)) {
      return this._holidayCache.get(y).map((h) => ({ ...h }));
    }
    // Fallback (very rough — only for non-2026 forward looking years).
    const out = [
      { date: `${y}-04-30`, name: 'Independence Day (approx)', name_he: 'יום העצמאות (משוער)' },
    ];
    this._holidayCache.set(y, out);
    return out.map((h) => ({ ...h }));
  }

  isHoliday(iso, wcId) {
    const ymd = _ymd(iso);
    const year = Number(ymd && ymd.slice(0, 4));
    const list = this.listHolidays(year);
    if (list.some((h) => h.date === ymd)) return true;
    if (wcId && this.workCenters.has(wcId)) {
      const cal = this.workCenters.get(wcId).calendar;
      if (cal.holidays.includes(ymd)) return true;
    }
    return false;
  }

  // ─────────── change log (append-only) ───────────
  _log(woId, type, payload) {
    if (!this.changeLog.has(woId)) this.changeLog.set(woId, []);
    this.changeLog.get(woId).push({
      at: nowIso(), type, ...payload,
    });
  }

  getChangeLog(woId) {
    return (this.changeLog.get(woId) || []).map((e) => ({ ...e }));
  }

  // ─────────── WO management ───────────

  /**
   * addWO({id, partNumber, qty, routing, priority, dueDate})
   * routing = [ { op, seq, workCenterId, setupMin, runMinPerUnit, queueMin?, moveMin? } ]
   */
  addWO(fields) {
    if (!fields || !fields.id) throw new Error('addWO: id required');
    if (this.workOrders.has(fields.id)) {
      throw new Error(`addWO: duplicate ${fields.id}`);
    }
    if (!Array.isArray(fields.routing) || !fields.routing.length) {
      throw new Error('addWO: routing[] required');
    }
    const qty = Number(fields.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('addWO: qty > 0 required');
    }

    const ops = fields.routing.map((op, i) => ({
      op:            op.op || `OP${(i + 1) * 10}`,
      seq:           Number.isFinite(Number(op.seq)) ? Number(op.seq) : (i + 1) * 10,
      workCenterId:  String(op.workCenterId || ''),
      setupMin:      Math.max(0, Number(op.setupMin || 0)),
      runMinPerUnit: Math.max(0, Number(op.runMinPerUnit || 0)),
      queueMin:      Math.max(0, Number(op.queueMin || 0)),
      moveMin:       Math.max(0, Number(op.moveMin  || 0)),
      durationMin:   Math.max(0, Number(op.setupMin || 0)) +
                     Math.max(0, Number(op.runMinPerUnit || 0)) * qty,
      plannedStart:  null,
      plannedEnd:    null,
      slotIdx:       null,
      status:        'planned',
    })).sort((a, b) => a.seq - b.seq);

    const wo = {
      id: String(fields.id),
      partNumber: String(fields.partNumber || fields.id),
      qty,
      routing: ops,
      priority: fields.priority || 'med',
      dueDate: fields.dueDate ? toIso(fields.dueDate) : null,
      status: 'created',
      createdAt: nowIso(),
      plannedStart: null,
      plannedEnd: null,
      direction: null,
      feasible: true,
      escalations: [],
    };

    this.workOrders.set(wo.id, wo);
    this._log(wo.id, 'wo.created', {
      partNumber: wo.partNumber, qty, priority: wo.priority, dueDate: wo.dueDate,
    });
    return this._cloneWO(wo);
  }

  _resolveWO(wo) {
    if (!wo) throw new Error('WO required');
    if (typeof wo === 'string') {
      const found = this.workOrders.get(wo);
      if (!found) throw new Error(`WO not found: ${wo}`);
      return found;
    }
    const found = this.workOrders.get(wo.id);
    if (!found) throw new Error(`WO not managed: ${wo.id}`);
    return found;
  }

  _cloneWO(w) {
    return {
      ...w,
      routing: w.routing.map((s) => ({ ...s })),
      escalations: w.escalations.map((e) => ({ ...e })),
    };
  }

  listWOs() {
    return Array.from(this.workOrders.values()).map((w) => this._cloneWO(w));
  }

  // ─────────── calendar engine ───────────

  /**
   * Returns the next "open" minute >= the supplied ISO ts on a given
   * work center, taking shifts / breaks / holidays / Shabbat into
   * account.  Returns an ISO string.
   */
  _nextOpenMinute(wcId, iso) {
    const wc = this.workCenters.get(wcId);
    if (!wc) return iso; // unknown wc → no calendar restrictions
    let cur = toDate(iso);

    for (let safety = 0; safety < 3650; safety++) {
      const ymd = _ymd(cur);
      const dow = cur.getUTCDay();
      const isHoliday = this.isHoliday(ymd, wcId);
      const isShabbat = wc.calendar.shabbatOff && dow === SHABBAT_DAY_UTC;
      if (isHoliday || isShabbat) {
        cur = _startOfDay(_addDays(cur, 1));
        continue;
      }
      const minutes = _minutesIntoDay(cur);
      const cap = (dow === FRIDAY_DAY_UTC) ? FRIDAY_LAST_MIN : null;
      // find a shift containing `minutes` (or the next one)
      const shifts = wc.calendar.shifts.slice().sort((a, b) => a.startMin - b.startMin);
      let placed = null;
      for (const s of shifts) {
        const sStart = s.startMin;
        const sEnd   = (cap !== null) ? Math.min(s.endMin, cap) : s.endMin;
        if (sEnd <= sStart) continue;
        if (minutes <= sStart) { placed = sStart; break; }
        if (minutes <  sEnd)   { placed = minutes; break; }
      }
      if (placed === null) {
        cur = _startOfDay(_addDays(cur, 1));
        continue;
      }
      // skip break overlaps within the day
      const breaks = (wc.calendar.breaks || []).slice().sort((a, b) => a.startMin - b.startMin);
      let bumped = false;
      for (const br of breaks) {
        if (placed >= br.startMin && placed < br.endMin) {
          placed = br.endMin;
          bumped = true;
        }
      }
      if (bumped) {
        // re-validate against shift bounds
        let inShift = false;
        for (const s of shifts) {
          const sEnd = (cap !== null) ? Math.min(s.endMin, cap) : s.endMin;
          if (placed >= s.startMin && placed < sEnd) { inShift = true; break; }
        }
        if (!inShift) {
          cur = _startOfDay(_addDays(cur, 1));
          continue;
        }
      }
      const out = new Date(cur.getTime());
      out.setUTCHours(0, 0, 0, 0);
      out.setUTCMinutes(placed);
      return toIso(out);
    }
    return toIso(cur);
  }

  /**
   * Walk forward from `startIso`, accumulating up to `durationMin`
   * MINUTES of "open" calendar time.  Returns the ISO timestamp at
   * which `durationMin` minutes have elapsed.
   */
  _addOpenMinutes(wcId, startIso, durationMin) {
    if (durationMin <= 0) return startIso;
    const wc = this.workCenters.get(wcId);
    if (!wc) return addMinutes(startIso, durationMin);

    let remaining = durationMin;
    let cur = toDate(this._nextOpenMinute(wcId, startIso));

    while (remaining > 0) {
      const dow = cur.getUTCDay();
      const cap = (dow === FRIDAY_DAY_UTC) ? FRIDAY_LAST_MIN : null;
      const minutes = _minutesIntoDay(cur);
      // find shift currently in
      const shifts = wc.calendar.shifts.slice().sort((a, b) => a.startMin - b.startMin);
      let curShiftEnd = null;
      for (const s of shifts) {
        const sEnd = (cap !== null) ? Math.min(s.endMin, cap) : s.endMin;
        if (minutes >= s.startMin && minutes < sEnd) { curShiftEnd = sEnd; break; }
      }
      if (curShiftEnd === null) {
        cur = toDate(this._nextOpenMinute(wcId, toIso(cur)));
        continue;
      }
      const available = curShiftEnd - minutes;
      if (remaining <= available) {
        cur = new Date(cur.getTime() + remaining * MS_PER_MIN);
        remaining = 0;
        break;
      }
      remaining -= available;
      // move to start of next shift / next day
      cur = new Date(cur.getTime() + available * MS_PER_MIN);
      cur = toDate(this._nextOpenMinute(wcId, toIso(cur)));
    }
    return toIso(cur);
  }

  /**
   * Backward variant — subtract open minutes.
   */
  _subOpenMinutes(wcId, endIso, durationMin) {
    if (durationMin <= 0) return endIso;
    const wc = this.workCenters.get(wcId);
    if (!wc) return addMinutes(endIso, -durationMin);

    let remaining = durationMin;
    let cur = toDate(this._prevOpenMinute(wcId, endIso));

    while (remaining > 0) {
      const dow = cur.getUTCDay();
      const cap = (dow === FRIDAY_DAY_UTC) ? FRIDAY_LAST_MIN : null;
      const minutes = _minutesIntoDay(cur);
      const shifts = wc.calendar.shifts.slice().sort((a, b) => a.startMin - b.startMin);
      let curShiftStart = null;
      for (const s of shifts) {
        const sEnd = (cap !== null) ? Math.min(s.endMin, cap) : s.endMin;
        // if minutes lands exactly on shift end (e.g. 23:00) → treat as in-shift
        if (minutes > s.startMin && minutes <= sEnd) { curShiftStart = s.startMin; break; }
      }
      if (curShiftStart === null) {
        cur = toDate(this._prevOpenMinute(wcId, toIso(new Date(cur.getTime() - MS_PER_MIN))));
        continue;
      }
      const available = minutes - curShiftStart;
      if (remaining <= available) {
        cur = new Date(cur.getTime() - remaining * MS_PER_MIN);
        remaining = 0;
        break;
      }
      remaining -= available;
      cur = new Date(cur.getTime() - available * MS_PER_MIN);
      cur = toDate(this._prevOpenMinute(wcId, toIso(new Date(cur.getTime() - MS_PER_MIN))));
    }
    return toIso(cur);
  }

  _prevOpenMinute(wcId, iso) {
    const wc = this.workCenters.get(wcId);
    if (!wc) return iso;
    let cur = toDate(iso);

    for (let safety = 0; safety < 3650; safety++) {
      const ymd = _ymd(cur);
      const dow = cur.getUTCDay();
      const isHoliday = this.isHoliday(ymd, wcId);
      const isShabbat = wc.calendar.shabbatOff && dow === SHABBAT_DAY_UTC;
      if (isHoliday || isShabbat) {
        const prev = _addDays(cur, -1);
        prev.setUTCHours(23, 59, 0, 0);
        cur = prev;
        continue;
      }
      const minutes = _minutesIntoDay(cur);
      const cap = (dow === FRIDAY_DAY_UTC) ? FRIDAY_LAST_MIN : null;
      const shifts = wc.calendar.shifts.slice().sort((a, b) => b.startMin - a.startMin);
      let placed = null;
      for (const s of shifts) {
        const sStart = s.startMin;
        const sEnd   = (cap !== null) ? Math.min(s.endMin, cap) : s.endMin;
        if (sEnd <= sStart) continue;
        if (minutes >= sEnd) { placed = sEnd; break; }
        if (minutes >  sStart) { placed = minutes; break; }
      }
      if (placed === null) {
        const prev = _addDays(cur, -1);
        prev.setUTCHours(23, 59, 0, 0);
        cur = prev;
        continue;
      }
      const out = new Date(cur.getTime());
      out.setUTCHours(0, 0, 0, 0);
      out.setUTCMinutes(placed);
      return toIso(out);
    }
    return toIso(cur);
  }

  // ─────────── finite-capacity slot allocation ───────────

  /**
   * Greedy: try each slot 0..slots-1, pick the one whose earliest free
   * window starting at >= earliestIso comes first.
   */
  _findFiniteForwardSlot(wcId, earliestIso, durationMin) {
    const wc = this.workCenters.get(wcId);
    const slots = wc ? wc.slots : 1;
    const earliestOpen = this._nextOpenMinute(wcId, earliestIso);
    let best = null;

    for (let s = 0; s < slots; s++) {
      const slotBookings = (wc ? wc.bookings : []).filter((b) => b.slotIdx === s)
        .slice()
        .sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime());
      let cursor = earliestOpen;
      // resolve the first non-conflict point
      for (const bk of slotBookings) {
        if (toDate(bk.end).getTime() <= toDate(cursor).getTime()) continue;
        if (toDate(bk.start).getTime() >= toDate(cursor).getTime()) {
          // candidate gap up to bk.start — check size
          const gapMin = diffMinutes(cursor, bk.start);
          if (gapMin >= durationMin) break;
          cursor = bk.end;
          continue;
        }
        cursor = bk.end;
      }
      cursor = this._nextOpenMinute(wcId, cursor);
      const end = this._addOpenMinutes(wcId, cursor, durationMin);
      const startMs = toDate(cursor).getTime();
      if (!best || startMs < toDate(best.start).getTime()) {
        best = { slotIdx: s, start: cursor, end };
      }
    }
    return best || { slotIdx: 0, start: earliestOpen, end: this._addOpenMinutes(wcId, earliestOpen, durationMin) };
  }

  _findFiniteBackwardSlot(wcId, latestEndIso, durationMin) {
    const wc = this.workCenters.get(wcId);
    const slots = wc ? wc.slots : 1;
    const latestClose = this._prevOpenMinute(wcId, latestEndIso);
    let best = null;

    for (let s = 0; s < slots; s++) {
      const slotBookings = (wc ? wc.bookings : []).filter((b) => b.slotIdx === s)
        .slice()
        .sort((a, b) => toDate(b.start).getTime() - toDate(a.start).getTime());
      let cursor = latestClose;
      for (const bk of slotBookings) {
        if (toDate(bk.start).getTime() >= toDate(cursor).getTime()) continue;
        if (toDate(bk.end).getTime() <= toDate(cursor).getTime()) {
          const gapMin = diffMinutes(bk.end, cursor);
          if (gapMin >= durationMin) break;
          cursor = bk.start;
          continue;
        }
        cursor = bk.start;
      }
      cursor = this._prevOpenMinute(wcId, cursor);
      const start = this._subOpenMinutes(wcId, cursor, durationMin);
      const endMs = toDate(cursor).getTime();
      if (!best || endMs > toDate(best.end).getTime()) {
        best = { slotIdx: s, start, end: cursor };
      }
    }
    return best || { slotIdx: 0, start: this._subOpenMinutes(wcId, latestClose, durationMin), end: latestClose };
  }

  _book(wcId, woId, opSeq, slotIdx, start, end) {
    const wc = this.workCenters.get(wcId);
    if (!wc) return;
    wc.bookings.push({ woId, opSeq, slotIdx, start, end });
  }

  _unbookWO(woId) {
    for (const wc of this.workCenters.values()) {
      wc.bookings = wc.bookings.filter((b) => b.woId !== woId);
    }
  }

  // ─────────── scheduleForward ───────────

  /**
   * scheduleForward(wo, startDate)
   *   - earliest-finish given op durations from routing
   *   - respects calendar + finite-capacity slots
   *   - returns the updated WO clone
   */
  scheduleForward(wo, startDate) {
    const w = this._resolveWO(wo);
    const start = toIso(startDate || this.now());
    if (!start) throw new Error('scheduleForward: invalid startDate');

    this._unbookWO(w.id);

    let cursor = start;
    for (const step of w.routing) {
      cursor = this._addOpenMinutes(step.workCenterId, cursor, step.queueMin);
      const slot = this._findFiniteForwardSlot(step.workCenterId, cursor, step.durationMin);
      step.plannedStart = slot.start;
      step.plannedEnd = slot.end;
      step.slotIdx = slot.slotIdx;
      step.status = 'scheduled';
      this._book(step.workCenterId, w.id, step.seq, slot.slotIdx, slot.start, slot.end);
      cursor = this._addOpenMinutes(step.workCenterId, slot.end, step.moveMin);
    }

    w.plannedStart = w.routing[0].plannedStart;
    w.plannedEnd   = w.routing[w.routing.length - 1].plannedEnd;
    w.direction    = 'forward';
    w.status       = 'scheduled';
    w.feasible     = true;

    this._log(w.id, 'wo.scheduled.forward', {
      start: w.plannedStart, end: w.plannedEnd,
    });
    return this._cloneWO(w);
  }

  // ─────────── scheduleBackward ───────────

  /**
   * scheduleBackward(wo, dueDate)
   *   - latest-start to meet `dueDate`
   *   - if computed start < this.now() the WO is flagged INFEASIBLE
   */
  scheduleBackward(wo, dueDate) {
    const w = this._resolveWO(wo);
    const due = toIso(dueDate || w.dueDate);
    if (!due) throw new Error('scheduleBackward: invalid dueDate');

    this._unbookWO(w.id);

    let cursor = due;
    for (let i = w.routing.length - 1; i >= 0; i--) {
      const step = w.routing[i];
      cursor = this._subOpenMinutes(step.workCenterId, cursor, step.moveMin);
      const slot = this._findFiniteBackwardSlot(step.workCenterId, cursor, step.durationMin);
      step.plannedStart = slot.start;
      step.plannedEnd = slot.end;
      step.slotIdx = slot.slotIdx;
      step.status = 'scheduled';
      this._book(step.workCenterId, w.id, step.seq, slot.slotIdx, slot.start, slot.end);
      cursor = this._subOpenMinutes(step.workCenterId, slot.start, step.queueMin);
    }

    w.plannedStart = w.routing[0].plannedStart;
    w.plannedEnd   = w.routing[w.routing.length - 1].plannedEnd;
    w.direction    = 'backward';
    w.status       = 'scheduled';

    const nowMs = toDate(this.now()).getTime();
    const startMs = toDate(w.plannedStart).getTime();
    w.feasible = startMs >= nowMs;

    this._log(w.id, 'wo.scheduled.backward', {
      start: w.plannedStart, end: w.plannedEnd, feasible: w.feasible,
    });
    if (!w.feasible) {
      this._log(w.id, 'wo.infeasible', {
        reason: 'latest start is in the past',
        latestStart: w.plannedStart,
        now: this.now(),
      });
    }
    return this._cloneWO(w);
  }

  // ─────────── dispatch ───────────

  /**
   * dispatch(wcId, rule)
   *   Returns the queue of operations on a work center, sorted per rule.
   *   rule ∈ { EDD, SPT, FCFS, CR, SLACK }
   */
  dispatch(wcId, rule = 'EDD') {
    if (!DISPATCH_RULES[rule]) throw new Error(`dispatch: unknown rule ${rule}`);
    const rows = [];
    const now = this.now();

    for (const w of this.workOrders.values()) {
      if (w.status === 'cancelled' || w.status === 'done') continue;
      for (const step of w.routing) {
        if (step.workCenterId !== wcId) continue;
        if (step.status === 'done') continue;
        // remaining work for slack/CR
        let remainingMin = 0;
        for (const s of w.routing) {
          if (s.status !== 'done') remainingMin += s.durationMin + s.queueMin + s.moveMin;
        }
        const dueMs = w.dueDate ? toDate(w.dueDate).getTime() : null;
        const nowMs = toDate(now).getTime();
        const minsToDue = dueMs ? (dueMs - nowMs) / MS_PER_MIN : Infinity;
        const slack = Number.isFinite(minsToDue) ? minsToDue - remainingMin : Infinity;
        const cr    = Number.isFinite(minsToDue) && remainingMin > 0
          ? minsToDue / remainingMin
          : Infinity;
        rows.push({
          woId: w.id,
          partNumber: w.partNumber,
          seq: step.seq,
          op: step.op,
          dueDate: w.dueDate,
          processingMin: step.durationMin,
          createdAt: w.createdAt,
          remainingMin,
          slack,
          criticalRatio: cr,
          priority: w.priority,
        });
      }
    }

    const cmp = {
      EDD: (a, b) => {
        const av = a.dueDate ? toDate(a.dueDate).getTime() : Infinity;
        const bv = b.dueDate ? toDate(b.dueDate).getTime() : Infinity;
        return av - bv;
      },
      SPT: (a, b) => a.processingMin - b.processingMin,
      FCFS: (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
      CR:  (a, b) => a.criticalRatio - b.criticalRatio,
      SLACK: (a, b) => a.slack - b.slack,
    }[rule];

    rows.sort(cmp);
    return {
      rule,
      rule_he: DISPATCH_RULES_HE[rule],
      workCenterId: wcId,
      generatedAt: now,
      queue: rows,
    };
  }

  // ─────────── capacity report ───────────

  /**
   * capacityReport(wcId, period = { from, to })
   *   - load %, overload highlights, per-day summary
   */
  capacityReport(wcId, period = {}) {
    const wc = this.workCenters.get(wcId);
    if (!wc) throw new Error(`capacityReport: unknown wc ${wcId}`);
    const from = period.from ? toIso(period.from) : null;
    const to   = period.to   ? toIso(period.to)   : null;

    const perDay = new Map();
    for (const bk of wc.bookings) {
      if (from && toDate(bk.end).getTime()   < toDate(from).getTime()) continue;
      if (to   && toDate(bk.start).getTime() > toDate(to).getTime())   continue;
      const day = _ymd(bk.start);
      const min = diffMinutes(bk.start, bk.end);
      if (!perDay.has(day)) perDay.set(day, { day, bookedMin: 0, ops: 0 });
      const rec = perDay.get(day);
      rec.bookedMin += min;
      rec.ops += 1;
    }

    // Capacity per day = slots × Σ shift minutes (cap Friday at 14:00).
    const days = Array.from(perDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    for (const d of days) {
      const dt = toDate(d.day + 'T00:00:00Z');
      const dow = dt.getUTCDay();
      const cap = (dow === FRIDAY_DAY_UTC) ? FRIDAY_LAST_MIN : null;
      let dayCapacityMin = 0;
      if (!(wc.calendar.shabbatOff && dow === SHABBAT_DAY_UTC) && !this.isHoliday(d.day, wcId)) {
        for (const s of wc.calendar.shifts) {
          const sEnd = (cap !== null) ? Math.min(s.endMin, cap) : s.endMin;
          if (sEnd > s.startMin) dayCapacityMin += (sEnd - s.startMin);
        }
        dayCapacityMin *= wc.slots;
      }
      d.capacityMin = dayCapacityMin;
      d.loadPct = dayCapacityMin
        ? Math.round((d.bookedMin / dayCapacityMin) * 1000) / 10
        : (d.bookedMin > 0 ? 999 : 0);
      d.overloaded = d.bookedMin > dayCapacityMin;
    }

    const totalBooked = days.reduce((a, b) => a + b.bookedMin, 0);
    const totalCap    = days.reduce((a, b) => a + b.capacityMin, 0);

    return {
      workCenterId: wcId,
      workCenterName_he: wc.name_he,
      slots: wc.slots,
      period: { from, to },
      days,
      overloadDays: days.filter((d) => d.overloaded),
      totalBookedMin: totalBooked,
      totalCapacityMin: totalCap,
      avgLoadPct: totalCap ? Math.round((totalBooked / totalCap) * 1000) / 10 : 0,
    };
  }

  // ─────────── Gantt data (Palantir dark theme) ───────────

  ganttData(period = {}) {
    const from = period.from ? toIso(period.from) : null;
    const to   = period.to   ? toIso(period.to)   : null;
    const tasks = [];
    const milestones = [];
    const resources = [];

    for (const wc of this.workCenters.values()) {
      resources.push({
        id: wc.id,
        label: wc.name,
        label_he: wc.name_he,
        slots: wc.slots,
      });
    }

    let row = 0;
    for (const w of this.workOrders.values()) {
      if (w.status === 'cancelled') continue;
      if (!w.routing.length || !w.plannedStart) continue;
      if (from && toDate(w.plannedEnd).getTime()   < toDate(from).getTime()) continue;
      if (to   && toDate(w.plannedStart).getTime() > toDate(to).getTime())   continue;

      tasks.push({
        id: w.id,
        wbs: w.id,
        label: `${w.id} · ${w.partNumber}`,
        label_he: `פקודה ${w.id} · ${w.partNumber}`,
        startIso: w.plannedStart,
        endIso: w.plannedEnd,
        priority: w.priority,
        feasible: w.feasible,
        row,
        header: true,
        theme: 'palantir-dark',
      });
      for (const s of w.routing) {
        if (!s.plannedStart) continue;
        tasks.push({
          id: `${w.id}:${s.op}`,
          wbs: `${w.id}.${s.seq}`,
          parent: w.id,
          label: `${s.op} @ ${s.workCenterId}`,
          label_he: `${s.op} @ ${s.workCenterId}`,
          startIso: s.plannedStart,
          endIso: s.plannedEnd,
          resourceId: s.workCenterId,
          slotIdx: s.slotIdx,
          status: s.status,
          row,
          theme: 'palantir-dark',
        });
      }
      if (w.dueDate) {
        milestones.push({
          id: `${w.id}:due`,
          woId: w.id,
          label: `Due ${w.partNumber}`,
          label_he: `יעד אספקה ${w.partNumber}`,
          dateIso: w.dueDate,
          missed: w.plannedEnd
            ? toDate(w.plannedEnd).getTime() > toDate(w.dueDate).getTime()
            : false,
        });
      }
      row += 1;
    }

    return {
      theme: 'palantir-dark',
      rtl: true,
      generatedAt: nowIso(),
      period: { from, to },
      resources,
      tasks,
      milestones,
    };
  }

  // ─────────── reschedule ───────────

  /**
   * reschedule(woId, opts?)
   *   Re-runs the original direction (forward by default) starting from
   *   max(now, original start + delayMin).  Used when material is late
   *   or a machine breaks down.
   *
   *   opts: { reason, delayMin, startDate, direction }
   */
  reschedule(woId, opts = {}) {
    const w = this._resolveWO(woId);
    const direction = opts.direction || w.direction || 'forward';
    let newStart;

    if (opts.startDate) {
      newStart = toIso(opts.startDate);
    } else if (Number.isFinite(Number(opts.delayMin)) && w.plannedStart) {
      newStart = addMinutes(w.plannedStart, Number(opts.delayMin));
    } else {
      newStart = this.now();
    }

    const oldStart = w.plannedStart;
    const oldEnd   = w.plannedEnd;

    let result;
    if (direction === 'backward') {
      result = this.scheduleBackward(w, w.dueDate);
    } else {
      result = this.scheduleForward(w, newStart);
    }

    this._log(w.id, 'wo.rescheduled', {
      reason: opts.reason || null,
      direction,
      previous: { start: oldStart, end: oldEnd },
      next:     { start: w.plannedStart, end: w.plannedEnd },
      delayMin: opts.delayMin || null,
    });
    return result;
  }

  // ─────────── what-if simulation (non-mutating) ───────────

  /**
   * whatIf(changes)
   *   Snapshots state, applies a list of changes, returns the simulated
   *   schedule view, then restores the original state.  Pure read.
   *
   *   changes: array of:
   *     { kind:'addWO',          wo: {...} }
   *     { kind:'reschedule',     woId, opts:{...} }
   *     { kind:'priorityEscalate', woId, newPriority, reason }
   *     { kind:'forward',        woId, startDate }
   *     { kind:'backward',       woId, dueDate }
   *     { kind:'breakdown',      wcId, fromIso, toIso } (no-op stub today)
   */
  whatIf(changes) {
    if (!Array.isArray(changes)) throw new Error('whatIf: changes[] required');
    const snapshot = this._snapshot();
    const results = [];
    try {
      for (const c of changes) {
        switch (c.kind) {
          case 'addWO':
            results.push(this.addWO(c.wo));
            break;
          case 'reschedule':
            results.push(this.reschedule(c.woId, c.opts || {}));
            break;
          case 'priorityEscalate':
            results.push(this.priorityEscalate(c.woId, c.newPriority, c.reason || 'what-if'));
            break;
          case 'forward':
            results.push(this.scheduleForward(c.woId, c.startDate));
            break;
          case 'backward':
            results.push(this.scheduleBackward(c.woId, c.dueDate));
            break;
          case 'breakdown':
            // recorded only — actual capacity carve-outs are a future hook
            results.push({ kind: 'breakdown', ...c });
            break;
          default:
            results.push({ error: `unknown kind ${c.kind}` });
        }
      }
      const view = {
        wos: this.listWOs(),
        gantt: this.ganttData({}),
      };
      return { changes, results, view };
    } finally {
      this._restore(snapshot);
    }
  }

  _snapshot() {
    return {
      workOrders: new Map(
        Array.from(this.workOrders.entries()).map(([k, v]) => [k, this._cloneWO(v)])
      ),
      workCenters: new Map(
        Array.from(this.workCenters.entries()).map(([k, v]) => [k, {
          ...v,
          calendar: {
            ...v.calendar,
            shifts: v.calendar.shifts.map((s) => ({ ...s })),
            breaks: v.calendar.breaks.map((b) => ({ ...b })),
            holidays: v.calendar.holidays.slice(),
          },
          bookings: v.bookings.map((b) => ({ ...b })),
        }])
      ),
      changeLog: new Map(
        Array.from(this.changeLog.entries()).map(([k, v]) => [k, v.map((e) => ({ ...e }))])
      ),
    };
  }

  _restore(snap) {
    this.workOrders = snap.workOrders;
    this.workCenters = snap.workCenters;
    this.changeLog = snap.changeLog;
  }

  // ─────────── priority escalate (audit-logged) ───────────

  priorityEscalate(woId, newPriority, reason) {
    const w = this._resolveWO(woId);
    const allowed = ['low', 'med', 'high', 'critical'];
    if (!allowed.includes(newPriority)) {
      throw new Error(`priorityEscalate: bad priority ${newPriority}`);
    }
    const old = w.priority;
    w.priority = newPriority;
    const entry = {
      at: nowIso(),
      from: old,
      to: newPriority,
      reason: reason || null,
    };
    w.escalations.push(entry);
    this._log(w.id, 'wo.priority.escalated', entry);
    return this._cloneWO(w);
  }
}

// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  WorkOrderScheduler,
  WOScheduler,
  WO_STATUS,
  WO_STATUS_HE,
  OP_STATUS,
  OP_STATUS_HE,
  PRIORITY,
  PRIORITY_WEIGHT,
  DIRECTION,
  GLOSSARY_HE,
  DISPATCH_RULES,
  DISPATCH_RULES_HE,
  ISRAELI_HOLIDAYS_2026,
  // helpers used in tests
  _helpers: {
    toDate,
    toIso,
    addMinutes,
    diffMinutes,
    diffDays,
    maxIso,
    minIso,
    nowIso,
  },
};
