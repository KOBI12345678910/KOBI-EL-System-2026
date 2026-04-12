/**
 * time-tracking.js — Agent X-25 (Swarm 3B)
 * Techno-Kol Uzi mega-ERP — Workshop Time Tracking Core
 *
 * Offline-first clock-in/out engine for shop-floor kiosks.
 *
 *   - Clock-in / clock-out with job code
 *   - Break tracking (paid / unpaid)
 *   - PIN or ת.ז (Israeli ID) auth — no passwords on shared kiosks
 *   - IndexedDB queue for offline, flushed when online
 *   - Israeli labor-law compliance validator
 *       חוק שעות עבודה ומנוחה, התשי"א-1951
 *       - max 8h regular / day
 *       - mandatory 30-min break after 6h
 *       - weekly max 42h before overtime
 *       - min 11h rest between shifts
 *       - min 36h weekly rest
 *       - Shabbat window (Fri 18:00 — Sat 18:00)
 *   - Payable computation: regular / OT125 / OT150 / OT175 / OT200
 *
 * Zero external dependencies. Runs in Node (tests), browsers (kiosk),
 * and the ERP backend (sync endpoint).
 *
 * IMPORTANT: this module NEVER deletes records. Corrections are
 * appended as new entries with a "supersedes" pointer.
 */

'use strict';

/* ════════════════════════════════════════════════════════════════ */
/*  Constants — Israeli labor law (חוק שעות עבודה ומנוחה)          */
/* ════════════════════════════════════════════════════════════════ */

const LABOR_LAW = Object.freeze({
  // Daily
  MAX_REGULAR_HOURS_PER_DAY: 8,        // beyond → overtime
  MAX_TOTAL_HOURS_PER_DAY: 12,          // absolute ceiling
  BREAK_REQUIRED_AFTER_HOURS: 6,        // 30-min break obligation
  BREAK_MIN_MINUTES: 30,

  // Weekly
  MAX_REGULAR_HOURS_PER_WEEK: 42,       // beyond → overtime
  MIN_WEEKLY_REST_HOURS: 36,            // unbroken rest window

  // Between shifts
  MIN_REST_BETWEEN_SHIFTS_HOURS: 11,

  // Shabbat — חוק שעות עבודה ומנוחה §7 (36-hour rest; starts Fri eve)
  SHABBAT_START_DAY: 5,                 // Friday (0=Sun .. 6=Sat)
  SHABBAT_START_HOUR: 18,
  SHABBAT_END_DAY: 6,                   // Saturday
  SHABBAT_END_HOUR: 18,

  // Overtime multipliers (§16)
  OT_125_FIRST_HOURS: 2,                // first 2 OT hrs = 125%
  // after that → 150%
  // Shabbat/Holiday → 175% first 2h, then 200%
});

const OT_RATE = Object.freeze({
  REGULAR: 1.00,
  OT_125: 1.25,
  OT_150: 1.50,
  OT_175: 1.75,
  OT_200: 2.00,
});

const ENTRY_STATUS = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
  VOIDED: 'voided',           // never deletes, only marks
  SUPERSEDED: 'superseded',
});

const BREAK_TYPE = Object.freeze({
  PAID: 'paid',
  UNPAID: 'unpaid',
  MEAL: 'meal',               // 30-min statutory meal break (unpaid by default)
});

/* ════════════════════════════════════════════════════════════════ */
/*  Utility — time math (all times are UTC ISO; display in L10N)   */
/* ════════════════════════════════════════════════════════════════ */

function nowIso() { return new Date().toISOString(); }

function toDate(v) {
  if (v instanceof Date) return v;
  return new Date(v);
}

function diffHours(fromIso, toIso) {
  const a = toDate(fromIso).getTime();
  const b = toDate(toIso).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, (b - a) / 3600000);
}

function diffMinutes(fromIso, toIso) {
  return diffHours(fromIso, toIso) * 60;
}

function roundTo(n, decimals) {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

/**
 * ID generator — monotonic per-process, collision-resistant across
 * offline clients. Format: time_<base36-ms>_<rand>
 */
let __idCounter = 0;
function generateId(prefix) {
  __idCounter = (__idCounter + 1) & 0xffff;
  const t = Date.now().toString(36);
  const c = __idCounter.toString(36).padStart(3, '0');
  const r = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, '0');
  return `${prefix || 'id'}_${t}_${c}${r}`;
}

/* ════════════════════════════════════════════════════════════════ */
/*  Israeli ID (ת.ז) + PIN validation                                */
/* ════════════════════════════════════════════════════════════════ */

/**
 * Validate Israeli ID (תעודת זהות) via Luhn-style checksum.
 * Accepts 5–9 digits, pads to 9.
 */
function validateIsraeliId(id) {
  if (id == null) return false;
  const s = String(id).replace(/\D/g, '');
  if (s.length < 5 || s.length > 9) return false;
  const padded = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = parseInt(padded[i], 10);
    d *= (i % 2) + 1;
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Validate PIN — 4 to 8 digits, not trivial (0000, 1234, etc.)
 */
function validatePin(pin) {
  if (pin == null) return false;
  const s = String(pin);
  if (!/^\d{4,8}$/.test(s)) return false;
  // weak-pin blocklist
  const weak = ['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','0123','1212'];
  if (weak.indexOf(s) !== -1) return false;
  return true;
}

/**
 * Hash a PIN for storage (simple SHA-like — actual hashing delegated
 * to the caller's crypto layer in production; this is a non-reversible
 * fingerprint for local dev and tests only).
 */
function hashPin(pin, salt) {
  const s = String(salt || '') + ':' + String(pin || '');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') +
         (h2 >>> 0).toString(16).padStart(8, '0');
}

/* ════════════════════════════════════════════════════════════════ */
/*  In-memory store (used when no IndexedDB — Node tests & SSR)     */
/* ════════════════════════════════════════════════════════════════ */

class MemoryStore {
  constructor() {
    this.entries = new Map();     // entry_id → TimeEntry
    this.breaks  = new Map();     // break_id → Break
    this.queue   = [];            // pending sync ops
  }
  putEntry(e)   { this.entries.set(e.entry_id, e); }
  getEntry(id)  { return this.entries.get(id) || null; }
  listEntries() { return Array.from(this.entries.values()); }
  putBreak(b)   { this.breaks.set(b.break_id, b); }
  getBreak(id)  { return this.breaks.get(id) || null; }
  listBreaks()  { return Array.from(this.breaks.values()); }
  enqueue(op)   { this.queue.push(op); return op; }
  drain()       { const q = this.queue.slice(); this.queue = []; return q; }
  size()        { return this.queue.length; }
}

/* ════════════════════════════════════════════════════════════════ */
/*  IndexedDB adapter — offline persistence for kiosks               */
/* ════════════════════════════════════════════════════════════════ */

const IDB_NAME = 'technokol-time';
const IDB_VERSION = 1;
const IDB_STORE_ENTRIES = 'entries';
const IDB_STORE_BREAKS  = 'breaks';
const IDB_STORE_QUEUE   = 'sync_queue';

function isIdbAvailable() {
  return typeof indexedDB !== 'undefined';
}

function openIdb() {
  if (!isIdbAvailable()) {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE_ENTRIES)) {
        const s = db.createObjectStore(IDB_STORE_ENTRIES, { keyPath: 'entry_id' });
        s.createIndex('by_employee', 'employee_id', { unique: false });
        s.createIndex('by_status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_BREAKS)) {
        const s = db.createObjectStore(IDB_STORE_BREAKS, { keyPath: 'break_id' });
        s.createIndex('by_entry', 'entry_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_QUEUE)) {
        db.createObjectStore(IDB_STORE_QUEUE, { keyPath: 'op_id', autoIncrement: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror    = () => reject(tx.error);
  });
}

function idbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const r = tx.objectStore(storeName).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror   = () => reject(r.error);
  });
}

function idbAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const r = tx.objectStore(storeName).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror   = () => reject(r.error);
  });
}

function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
  });
}

class IdbStore {
  constructor() { this._db = null; }
  async _ready() {
    if (!this._db) this._db = await openIdb();
    return this._db;
  }
  async putEntry(e)   { const db = await this._ready(); return idbPut(db, IDB_STORE_ENTRIES, e); }
  async getEntry(id)  { const db = await this._ready(); return idbGet(db, IDB_STORE_ENTRIES, id); }
  async listEntries() { const db = await this._ready(); return idbAll(db, IDB_STORE_ENTRIES); }
  async putBreak(b)   { const db = await this._ready(); return idbPut(db, IDB_STORE_BREAKS,  b); }
  async getBreak(id)  { const db = await this._ready(); return idbGet(db, IDB_STORE_BREAKS, id); }
  async listBreaks()  { const db = await this._ready(); return idbAll(db, IDB_STORE_BREAKS); }
  async enqueue(op) {
    const db = await this._ready();
    const opWithId = Object.assign({ op_id: generateId('op') }, op);
    await idbPut(db, IDB_STORE_QUEUE, opWithId);
    return opWithId;
  }
  async drain() {
    const db = await this._ready();
    const q = await idbAll(db, IDB_STORE_QUEUE);
    for (const op of q) await idbDelete(db, IDB_STORE_QUEUE, op.op_id);
    return q;
  }
  async size() {
    const db = await this._ready();
    const q = await idbAll(db, IDB_STORE_QUEUE);
    return q.length;
  }
}

/* ════════════════════════════════════════════════════════════════ */
/*  TimeTracking — main class                                       */
/* ════════════════════════════════════════════════════════════════ */

class TimeTracking {
  /**
   * @param {object} opts
   * @param {object} [opts.store]       - persistence backend (MemoryStore/IdbStore)
   * @param {object} [opts.clock]       - injectable clock for testing
   * @param {function} [opts.fetchFn]   - sync transport (defaults to global fetch)
   * @param {string} [opts.syncUrl]     - server endpoint for sync
   * @param {function} [opts.online]    - () => boolean, online detection
   */
  constructor(opts) {
    opts = opts || {};
    this.store   = opts.store || new MemoryStore();
    this.clock   = opts.clock || { now: () => new Date() };
    this.fetchFn = opts.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    this.syncUrl = opts.syncUrl || '/api/time/sync';
    this.online  = opts.online || (() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  }

  /* ───────────── Clock in ───────────── */

  /**
   * Start a new time entry.
   * Returns { entry_id, started_at }.
   */
  async clockIn(employeeId, jobCode, metadata) {
    if (!employeeId) throw new Error('employeeId required');

    // Enforce single open entry per employee
    const existing = await this._findOpenEntry(employeeId);
    if (existing) {
      throw new Error('E_ALREADY_CLOCKED_IN: employee already has an open entry');
    }

    const startedAt = this.clock.now().toISOString();
    const entry = {
      entry_id:    generateId('time'),
      employee_id: String(employeeId),
      job_code:    jobCode || null,
      started_at:  startedAt,
      ended_at:    null,
      breaks:      [],
      status:      ENTRY_STATUS.OPEN,
      metadata:    metadata || {},
      photo_ref:   (metadata && metadata.photo_ref) || null,
      client_id:   (metadata && metadata.client_id) || null,
      created_at:  startedAt,
      updated_at:  startedAt,
      synced:      false,
      supersedes:  null,
    };

    await this.store.putEntry(entry);
    await this.store.enqueue({ type: 'clock_in', entry_id: entry.entry_id, at: startedAt });

    // Attempt opportunistic sync
    this.syncNow().catch(() => { /* offline → next cycle */ });

    return { entry_id: entry.entry_id, started_at: startedAt };
  }

  /* ───────────── Clock out ───────────── */

  /**
   * Close an open entry.
   * Returns { ended_at, hours }.
   */
  async clockOut(entryId) {
    if (!entryId) throw new Error('entryId required');
    const entry = await this.store.getEntry(entryId);
    if (!entry) throw new Error('E_NOT_FOUND: entry not found');
    if (entry.status !== ENTRY_STATUS.OPEN) {
      throw new Error('E_NOT_OPEN: entry is not open');
    }

    // Close any still-open break on this entry
    const openBreak = (entry.breaks || []).find((b) => !b.ended_at);
    if (openBreak) {
      await this.endBreak(openBreak.break_id);
      // reload
      const reloaded = await this.store.getEntry(entryId);
      if (reloaded) Object.assign(entry, reloaded);
    }

    const endedAt = this.clock.now().toISOString();
    entry.ended_at  = endedAt;
    entry.status    = ENTRY_STATUS.CLOSED;
    entry.updated_at = endedAt;

    await this.store.putEntry(entry);
    await this.store.enqueue({ type: 'clock_out', entry_id: entry.entry_id, at: endedAt });

    const totalHours = diffHours(entry.started_at, endedAt);
    const paidBreaks = (entry.breaks || []).filter((b) => b.type === BREAK_TYPE.PAID);
    const unpaidBreaks = (entry.breaks || []).filter((b) => b.type !== BREAK_TYPE.PAID);
    const unpaidMinutes = unpaidBreaks.reduce((acc, b) => acc + (b.duration_minutes || 0), 0);
    const payableHours = Math.max(0, totalHours - (unpaidMinutes / 60));

    this.syncNow().catch(() => {});

    return {
      ended_at:      endedAt,
      hours:         roundTo(totalHours, 4),
      payable_hours: roundTo(payableHours, 4),
      paid_breaks:   paidBreaks.length,
      unpaid_breaks: unpaidBreaks.length,
    };
  }

  /* ───────────── Breaks ───────────── */

  async startBreak(entryId, type) {
    if (!entryId) throw new Error('entryId required');
    const entry = await this.store.getEntry(entryId);
    if (!entry) throw new Error('E_NOT_FOUND: entry not found');
    if (entry.status !== ENTRY_STATUS.OPEN) throw new Error('E_NOT_OPEN: entry is not open');

    // prevent nested breaks
    const openBreak = (entry.breaks || []).find((b) => !b.ended_at);
    if (openBreak) throw new Error('E_BREAK_OPEN: another break is already in progress');

    const bType = (type === BREAK_TYPE.PAID || type === BREAK_TYPE.UNPAID || type === BREAK_TYPE.MEAL)
      ? type : BREAK_TYPE.UNPAID;
    const startedAt = this.clock.now().toISOString();
    const br = {
      break_id:  generateId('brk'),
      entry_id:  entry.entry_id,
      type:      bType,
      started_at: startedAt,
      ended_at:  null,
      duration_minutes: 0,
    };
    await this.store.putBreak(br);

    entry.breaks = entry.breaks || [];
    entry.breaks.push(br);
    entry.updated_at = startedAt;
    await this.store.putEntry(entry);
    await this.store.enqueue({ type: 'break_start', break_id: br.break_id, at: startedAt });

    this.syncNow().catch(() => {});
    return br.break_id;
  }

  async endBreak(breakId) {
    if (!breakId) throw new Error('breakId required');
    const br = await this.store.getBreak(breakId);
    if (!br) throw new Error('E_NOT_FOUND: break not found');
    if (br.ended_at) throw new Error('E_ALREADY_ENDED: break already ended');

    const endedAt = this.clock.now().toISOString();
    const minutes = diffMinutes(br.started_at, endedAt);
    br.ended_at = endedAt;
    br.duration_minutes = roundTo(minutes, 2);
    await this.store.putBreak(br);

    // reflect into parent entry
    const entry = await this.store.getEntry(br.entry_id);
    if (entry && Array.isArray(entry.breaks)) {
      entry.breaks = entry.breaks.map((b) => b.break_id === br.break_id ? br : b);
      entry.updated_at = endedAt;
      await this.store.putEntry(entry);
    }
    await this.store.enqueue({ type: 'break_end', break_id: br.break_id, at: endedAt });

    this.syncNow().catch(() => {});
    return { break_id: br.break_id, duration_minutes: br.duration_minutes, type: br.type };
  }

  /* ───────────── Timesheet ───────────── */

  /**
   * Return entries for an employee over a period.
   * period: { from: ISO, to: ISO }
   */
  async getTimesheet(employeeId, period) {
    if (!employeeId) throw new Error('employeeId required');
    const all = await this._listAllEntries();
    const from = period && period.from ? toDate(period.from).getTime() : -Infinity;
    const to   = period && period.to   ? toDate(period.to).getTime()   :  Infinity;

    return all
      .filter((e) => e.employee_id === String(employeeId))
      .filter((e) => e.status !== ENTRY_STATUS.VOIDED)
      .filter((e) => {
        const started = toDate(e.started_at).getTime();
        return started >= from && started <= to;
      })
      .sort((a, b) => toDate(a.started_at) - toDate(b.started_at));
  }

  /* ───────────── Offline-first sync ───────────── */

  /**
   * Flush the sync queue to the server. Returns { flushed, failed }.
   * Silent no-op if offline or no fetch available.
   */
  async syncNow() {
    if (!this.online()) return { flushed: 0, failed: 0, offline: true };
    if (!this.fetchFn)  return { flushed: 0, failed: 0, no_transport: true };

    const ops = await this.store.drain();
    if (ops.length === 0) return { flushed: 0, failed: 0 };

    try {
      const res = await this.fetchFn(this.syncUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ops }),
      });
      if (res && res.ok) {
        // mark referenced entries as synced
        for (const op of ops) {
          if (op.entry_id) {
            const e = await this.store.getEntry(op.entry_id);
            if (e) { e.synced = true; await this.store.putEntry(e); }
          }
        }
        return { flushed: ops.length, failed: 0 };
      }
      // on failure → re-enqueue
      for (const op of ops) await this.store.enqueue(op);
      return { flushed: 0, failed: ops.length };
    } catch (err) {
      // network down → re-enqueue for next round
      for (const op of ops) await this.store.enqueue(op);
      return { flushed: 0, failed: ops.length, error: String(err.message || err) };
    }
  }

  async pendingSync() { return this.store.size(); }

  /* ───────────── Corrections (never delete) ───────────── */

  /**
   * Supersede an existing entry. The old one is marked SUPERSEDED
   * (not deleted) and a new entry is written with `supersedes` set.
   */
  async correctEntry(oldEntryId, newValues, reason) {
    const old = await this.store.getEntry(oldEntryId);
    if (!old) throw new Error('E_NOT_FOUND: entry not found');
    if (!reason) throw new Error('E_REASON_REQUIRED: correction reason required');

    const nowStamp = this.clock.now().toISOString();
    old.status = ENTRY_STATUS.SUPERSEDED;
    old.updated_at = nowStamp;
    old.correction_reason = reason;
    await this.store.putEntry(old);

    const fresh = Object.assign({}, old, newValues, {
      entry_id:    generateId('time'),
      supersedes:  oldEntryId,
      status:      newValues.ended_at ? ENTRY_STATUS.CLOSED : ENTRY_STATUS.OPEN,
      created_at:  nowStamp,
      updated_at:  nowStamp,
      synced:      false,
      correction_reason: reason,
    });
    await this.store.putEntry(fresh);
    await this.store.enqueue({ type: 'correct', old: oldEntryId, new: fresh.entry_id, at: nowStamp });
    return { entry_id: fresh.entry_id, supersedes: oldEntryId };
  }

  /* ───────────── Internals ───────────── */

  async _findOpenEntry(employeeId) {
    const all = await this._listAllEntries();
    return all.find((e) =>
      e.employee_id === String(employeeId) && e.status === ENTRY_STATUS.OPEN
    ) || null;
  }

  async _listAllEntries() {
    const out = this.store.listEntries();
    if (out && typeof out.then === 'function') return out;
    return out;
  }
}

/* ════════════════════════════════════════════════════════════════ */
/*  Compliance validator — חוק שעות עבודה ומנוחה                    */
/* ════════════════════════════════════════════════════════════════ */

/**
 * Inspect a list of entries and return any labor-law violations.
 *
 * @param {Array} entries - closed entries (anything else is ignored)
 * @param {object} [opts]
 * @param {boolean} [opts.observesShabbat=false] - flag shabbat violations
 * @returns {Array} violations — [{ code, severity, message_he, message_en, entry_id?, hours? }]
 */
function validateCompliance(entries, opts) {
  opts = opts || {};
  const violations = [];
  if (!Array.isArray(entries) || entries.length === 0) return violations;

  const closed = entries
    .filter((e) => e && e.status === ENTRY_STATUS.CLOSED && e.started_at && e.ended_at)
    .slice()
    .sort((a, b) => toDate(a.started_at) - toDate(b.started_at));

  // ── Per-entry daily checks ──────────────────────────────────
  for (const e of closed) {
    const total  = diffHours(e.started_at, e.ended_at);
    const unpaid = (e.breaks || [])
      .filter((b) => b.type !== BREAK_TYPE.PAID)
      .reduce((acc, b) => acc + ((b.duration_minutes || 0) / 60), 0);
    const worked = Math.max(0, total - unpaid);

    // absolute daily ceiling (12h)
    if (worked > LABOR_LAW.MAX_TOTAL_HOURS_PER_DAY) {
      violations.push({
        code: 'EXCEED_DAILY_MAX',
        severity: 'critical',
        entry_id: e.entry_id,
        hours: roundTo(worked, 2),
        message_he: `חריגה מהמקסימום היומי: ${roundTo(worked, 2)} שעות (מותר עד ${LABOR_LAW.MAX_TOTAL_HOURS_PER_DAY})`,
        message_en: `Daily maximum exceeded: ${roundTo(worked, 2)}h (max ${LABOR_LAW.MAX_TOTAL_HOURS_PER_DAY})`,
      });
    }

    // mandatory 30-min break after 6h
    if (worked >= LABOR_LAW.BREAK_REQUIRED_AFTER_HOURS) {
      const breakMinutes = (e.breaks || [])
        .reduce((acc, b) => acc + (b.duration_minutes || 0), 0);
      if (breakMinutes < LABOR_LAW.BREAK_MIN_MINUTES) {
        violations.push({
          code: 'MISSING_MANDATORY_BREAK',
          severity: 'high',
          entry_id: e.entry_id,
          hours: roundTo(worked, 2),
          message_he: `חובה להפסקה של 30 דקות אחרי ${LABOR_LAW.BREAK_REQUIRED_AFTER_HOURS} שעות עבודה`,
          message_en: `Mandatory 30-min break missing after ${LABOR_LAW.BREAK_REQUIRED_AFTER_HOURS}h work`,
        });
      }
    }

    // Shabbat window
    if (opts.observesShabbat && overlapsShabbat(e.started_at, e.ended_at)) {
      violations.push({
        code: 'SHABBAT_WORK',
        severity: 'high',
        entry_id: e.entry_id,
        message_he: 'עבודה בשבת — דורשת היתר או תגמול מיוחד (175%/200%)',
        message_en: 'Shabbat work — requires permit or special compensation (175%/200%)',
      });
    }
  }

  // ── Min rest between shifts (11h) ───────────────────────────
  for (let i = 1; i < closed.length; i++) {
    const prev = closed[i - 1];
    const curr = closed[i];
    if (prev.employee_id !== curr.employee_id) continue;
    const gap = diffHours(prev.ended_at, curr.started_at);
    if (gap < LABOR_LAW.MIN_REST_BETWEEN_SHIFTS_HOURS) {
      violations.push({
        code: 'INSUFFICIENT_REST_BETWEEN_SHIFTS',
        severity: 'high',
        entry_id: curr.entry_id,
        hours: roundTo(gap, 2),
        message_he: `פחות מ-${LABOR_LAW.MIN_REST_BETWEEN_SHIFTS_HOURS} שעות מנוחה בין משמרות (${roundTo(gap, 2)})`,
        message_en: `Less than ${LABOR_LAW.MIN_REST_BETWEEN_SHIFTS_HOURS}h rest between shifts (${roundTo(gap, 2)})`,
      });
    }
  }

  // ── Weekly aggregation per employee ─────────────────────────
  const weekly = {};   // empId → weekKey → hours
  const weekSpan = {}; // empId → weekKey → [firstStart, lastEnd]
  for (const e of closed) {
    const start = toDate(e.started_at);
    const weekKey = isoWeekKey(start);
    const key = e.employee_id + '|' + weekKey;
    const total  = diffHours(e.started_at, e.ended_at);
    const unpaid = (e.breaks || [])
      .filter((b) => b.type !== BREAK_TYPE.PAID)
      .reduce((acc, b) => acc + ((b.duration_minutes || 0) / 60), 0);
    const worked = Math.max(0, total - unpaid);
    weekly[key] = (weekly[key] || 0) + worked;
    if (!weekSpan[key]) weekSpan[key] = [toDate(e.started_at), toDate(e.ended_at)];
    else {
      if (toDate(e.started_at) < weekSpan[key][0]) weekSpan[key][0] = toDate(e.started_at);
      if (toDate(e.ended_at)   > weekSpan[key][1]) weekSpan[key][1] = toDate(e.ended_at);
    }
  }
  for (const key of Object.keys(weekly)) {
    const hours = weekly[key];
    if (hours > LABOR_LAW.MAX_REGULAR_HOURS_PER_WEEK) {
      const [empId, weekKey] = key.split('|');
      violations.push({
        code: 'EXCEED_WEEKLY_MAX',
        severity: 'medium',
        employee_id: empId,
        week: weekKey,
        hours: roundTo(hours, 2),
        message_he: `עבר ${LABOR_LAW.MAX_REGULAR_HOURS_PER_WEEK} שעות שבועיות רגילות: ${roundTo(hours, 2)}ש' (תוספת לשעות נוספות)`,
        message_en: `Weekly regular limit exceeded: ${roundTo(hours, 2)}h (overtime applies)`,
      });
    }
  }

  // ── Min weekly rest (36h unbroken) ──────────────────────────
  // For each employee across the span, compute max gap between any
  // two consecutive entries and compare with 36h
  const byEmp = {};
  for (const e of closed) {
    (byEmp[e.employee_id] = byEmp[e.employee_id] || []).push(e);
  }
  for (const empId of Object.keys(byEmp)) {
    const list = byEmp[empId];
    if (list.length < 2) continue;
    // find max gap across consecutive pairs
    let maxGap = 0;
    for (let i = 1; i < list.length; i++) {
      const gap = diffHours(list[i - 1].ended_at, list[i].started_at);
      if (gap > maxGap) maxGap = gap;
    }
    const span = diffHours(list[0].started_at, list[list.length - 1].ended_at);
    // only flag if span covers at least a full week
    if (span >= 24 * 6 && maxGap < LABOR_LAW.MIN_WEEKLY_REST_HOURS) {
      violations.push({
        code: 'INSUFFICIENT_WEEKLY_REST',
        severity: 'high',
        employee_id: empId,
        hours: roundTo(maxGap, 2),
        message_he: `פחות מ-${LABOR_LAW.MIN_WEEKLY_REST_HOURS} שעות מנוחה שבועית רצופה`,
        message_en: `Weekly rest below ${LABOR_LAW.MIN_WEEKLY_REST_HOURS}h unbroken`,
      });
    }
  }

  return violations;
}

/**
 * Return true if the interval [from,to] overlaps the Shabbat window
 * (Friday 18:00 — Saturday 18:00 in the local TZ of the Date object).
 */
function overlapsShabbat(fromIso, toIso) {
  const from = toDate(fromIso);
  const to   = toDate(toIso);
  // iterate in 30-minute steps — cheap and correct for shift-length windows
  const stepMs = 30 * 60 * 1000;
  for (let t = from.getTime(); t <= to.getTime(); t += stepMs) {
    const d = new Date(t);
    const day = d.getDay();
    const hour = d.getHours();
    if (day === LABOR_LAW.SHABBAT_START_DAY && hour >= LABOR_LAW.SHABBAT_START_HOUR) return true;
    if (day === LABOR_LAW.SHABBAT_END_DAY   && hour <  LABOR_LAW.SHABBAT_END_HOUR)   return true;
  }
  // final check for exact end-time
  const dEnd = to;
  if (dEnd.getDay() === LABOR_LAW.SHABBAT_START_DAY && dEnd.getHours() >= LABOR_LAW.SHABBAT_START_HOUR) return true;
  if (dEnd.getDay() === LABOR_LAW.SHABBAT_END_DAY && dEnd.getHours() < LABOR_LAW.SHABBAT_END_HOUR)    return true;
  return false;
}

/** ISO week key: YYYY-Www (ISO 8601 week) */
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;          // Mon=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);       // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d - firstThursday) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

/* ════════════════════════════════════════════════════════════════ */
/*  Payable computation                                              */
/* ════════════════════════════════════════════════════════════════ */

/**
 * Compute payable hour buckets from a list of closed entries.
 *
 * rules (optional):
 *   {
 *     observesShabbat: bool,         // use 175/200 for Shabbat hours
 *     baseRate: number,              // optional ₪/hour — if set, returns amounts
 *     weeklyRegularCap: number,      // default 42
 *     dailyRegularCap: number,       // default 8
 *     ot125FirstHours: number        // default 2
 *   }
 */
function computePayable(entries, rules) {
  rules = rules || {};
  const weeklyCap = rules.weeklyRegularCap || LABOR_LAW.MAX_REGULAR_HOURS_PER_WEEK;
  const dailyCap  = rules.dailyRegularCap  || LABOR_LAW.MAX_REGULAR_HOURS_PER_DAY;
  const ot125First = rules.ot125FirstHours != null ? rules.ot125FirstHours : LABOR_LAW.OT_125_FIRST_HOURS;

  const buckets = {
    regular:       0,
    overtime_125:  0,
    overtime_150:  0,
    overtime_175:  0,
    overtime_200:  0,
  };

  if (!Array.isArray(entries) || entries.length === 0) {
    if (rules.baseRate != null) buckets.total_amount = 0;
    return buckets;
  }

  const closed = entries
    .filter((e) => e && e.status === ENTRY_STATUS.CLOSED && e.started_at && e.ended_at);

  // Track weekly regular-hours budget per employee+ISO-week
  const weekBudget = {};   // key → hours consumed regular

  // sort for deterministic per-day accumulation
  closed.sort((a, b) => toDate(a.started_at) - toDate(b.started_at));

  for (const e of closed) {
    const total  = diffHours(e.started_at, e.ended_at);
    const unpaidMin = (e.breaks || [])
      .filter((b) => b.type !== BREAK_TYPE.PAID)
      .reduce((acc, b) => acc + (b.duration_minutes || 0), 0);
    let hoursLeft = Math.max(0, total - unpaidMin / 60);
    if (hoursLeft === 0) continue;

    const isShabbat = rules.observesShabbat && overlapsShabbat(e.started_at, e.ended_at);
    const weekKey = e.employee_id + '|' + isoWeekKey(toDate(e.started_at));
    const consumedWeek = weekBudget[weekKey] || 0;
    const remainingWeek = Math.max(0, weeklyCap - consumedWeek);

    if (isShabbat) {
      // Shabbat hours: first 2 at 175%, rest at 200%
      const at175 = Math.min(hoursLeft, ot125First);
      buckets.overtime_175 += at175;
      hoursLeft -= at175;
      buckets.overtime_200 += hoursLeft;
      hoursLeft = 0;
      continue;
    }

    // 1. regular up to daily cap AND weekly remaining
    const regThisDay = Math.min(hoursLeft, dailyCap, remainingWeek);
    buckets.regular += regThisDay;
    hoursLeft -= regThisDay;
    weekBudget[weekKey] = consumedWeek + regThisDay;

    if (hoursLeft <= 0) continue;

    // 2. first 2 OT hours at 125%
    const at125 = Math.min(hoursLeft, ot125First);
    buckets.overtime_125 += at125;
    hoursLeft -= at125;

    // 3. remainder at 150%
    if (hoursLeft > 0) {
      buckets.overtime_150 += hoursLeft;
      hoursLeft = 0;
    }
  }

  // round all
  for (const k of Object.keys(buckets)) {
    buckets[k] = roundTo(buckets[k], 4);
  }

  if (rules.baseRate != null) {
    const r = Number(rules.baseRate);
    buckets.total_amount = roundTo(
      buckets.regular       * r * OT_RATE.REGULAR +
      buckets.overtime_125  * r * OT_RATE.OT_125  +
      buckets.overtime_150  * r * OT_RATE.OT_150  +
      buckets.overtime_175  * r * OT_RATE.OT_175  +
      buckets.overtime_200  * r * OT_RATE.OT_200,
      2
    );
  }

  return buckets;
}

/* ════════════════════════════════════════════════════════════════ */
/*  Stand-alone stateless wrapper functions                          */
/*  (used directly by callers that prefer a functional API)         */
/* ════════════════════════════════════════════════════════════════ */

let _defaultTT = null;
function _default() {
  if (!_defaultTT) _defaultTT = new TimeTracking();
  return _defaultTT;
}

async function clockIn(employeeId, jobCode, metadata)  { return _default().clockIn(employeeId, jobCode, metadata); }
async function clockOut(entryId)                       { return _default().clockOut(entryId); }
async function startBreak(entryId, type)               { return _default().startBreak(entryId, type); }
async function endBreak(breakId)                       { return _default().endBreak(breakId); }
async function getTimesheet(employeeId, period)        { return _default().getTimesheet(employeeId, period); }

/* ════════════════════════════════════════════════════════════════ */
/*  Photo capture stub (browser MediaDevices)                        */
/* ════════════════════════════════════════════════════════════════ */

async function capturePhotoStub(videoEl) {
  if (typeof document === 'undefined' || !videoEl) {
    return { stub: true, data_url: null };
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width  = videoEl.videoWidth  || 320;
    canvas.height = videoEl.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return { stub: false, data_url: canvas.toDataURL('image/jpeg', 0.6) };
  } catch (_err) {
    return { stub: true, data_url: null, error: 'capture_failed' };
  }
}

/* ════════════════════════════════════════════════════════════════ */
/*  Exports                                                          */
/* ════════════════════════════════════════════════════════════════ */

const api = {
  // Classes
  TimeTracking,
  MemoryStore,
  IdbStore,

  // Stateless functional API
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  getTimesheet,
  validateCompliance,
  computePayable,

  // Auth helpers
  validateIsraeliId,
  validatePin,
  hashPin,

  // Photo stub
  capturePhotoStub,

  // Utilities
  generateId,
  diffHours,
  diffMinutes,
  overlapsShabbat,
  isoWeekKey,
  isIdbAvailable,

  // Constants
  LABOR_LAW,
  OT_RATE,
  ENTRY_STATUS,
  BREAK_TYPE,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.TimeTrackingAPI = api;
}
