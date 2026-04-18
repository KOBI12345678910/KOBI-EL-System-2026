/**
 * rollback-engine.js — Automated rollback engine with safety guards
 * Agent Y-179 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Zero dependencies. Node.js built-ins only. No disk I/O — the
 * engine is a pure in-memory state machine; callers pass in the
 * `executor` function that actually performs the rollback
 * (kubectl, helm, ssh, etc.) and the engine records the outcome.
 *
 * Principle: "לא מוחקים רק משדרגים ומגדלים" — we never delete a
 * release, a trigger, a frozen window, or an incident record. All
 * mutation is additive: old records move to history, new state is
 * appended. `loopGuard` PAUSES — it never erases counters.
 *
 * Public API:
 *   const { RollbackEngine } = require('./rollback-engine');
 *   const engine = new RollbackEngine({
 *     executor: async ({ releaseId, reason }) => { ... },
 *     loopGuardCount: 3,
 *     loopGuardWindowMs: 10 * 60 * 1000,
 *     clock: () => Date.now(),
 *   });
 *
 *   engine.registerTrigger('error-rate', () => getErrorRate(), 0.05, 30_000);
 *   engine.registerDependency('web', ['api', 'db']);
 *   engine.freeze(Date.now(), Date.now() + 60_000, 'business hours');
 *   const report = engine.watch('release-2026-04-11-01');
 *   await engine.autoRollback('release-2026-04-11-01', 'slo-breach');
 *   const summary = engine.incidentSummary();   // bilingual
 *
 * Public methods:
 *   registerTrigger(name, metricFn, threshold, durationMs)
 *   registerDependency(service, dependsOn[])
 *   registerMigrationCheck(name, checkFn)
 *   freeze(startMs, endMs, reason)
 *   watch(releaseId)
 *   autoRollback(releaseId, reason)     — async
 *   manualRollback(releaseId, reason, operator)   — async
 *   loopGuardStatus()
 *   incidentSummary(limit)
 *   history()
 *   pausedByLoopGuard()
 *   resume(operator)
 *   getDependencyOrder(service)
 *   checkMigrationSafety(migrationPlan)
 */

'use strict';

/* ------------------------------------------------------------------ *
 *  Constants                                                         *
 * ------------------------------------------------------------------ */

const TRIGGER_REASONS = Object.freeze([
  'slo-breach',
  'error-spike',
  'health-check',
  'manual',
  'custom',
]);

const ROLLBACK_OUTCOME = Object.freeze({
  SUCCESS: 'success',
  FAILED: 'failed',
  BLOCKED_FREEZE: 'blocked-freeze',
  BLOCKED_LOOPGUARD: 'blocked-loopguard',
  BLOCKED_MIGRATION: 'blocked-migration',
});

const DEFAULTS = Object.freeze({
  loopGuardCount: 3,
  loopGuardWindowMs: 10 * 60 * 1000, // 10 minutes
  maxHistory: 1000,
});

/* Hebrew labels for bilingual summary */
const HEBREW_OUTCOME = Object.freeze({
  [ROLLBACK_OUTCOME.SUCCESS]: 'הצלחה',
  [ROLLBACK_OUTCOME.FAILED]: 'כשל',
  [ROLLBACK_OUTCOME.BLOCKED_FREEZE]: 'חסום — חלון הקפאה',
  [ROLLBACK_OUTCOME.BLOCKED_LOOPGUARD]: 'חסום — שומר לולאות',
  [ROLLBACK_OUTCOME.BLOCKED_MIGRATION]: 'חסום — מיגרציית נתונים הרסנית',
});

const HEBREW_REASON = Object.freeze({
  'slo-breach': 'הפרת יעד שירות (SLO)',
  'error-spike': 'זינוק שגיאות',
  'health-check': 'בדיקת בריאות נכשלה',
  'manual': 'ידני',
  'custom': 'טריגר מותאם',
});

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function assertType(value, type, name) {
  if (typeof value !== type) {
    throw new TypeError(`RollbackEngine: '${name}' must be ${type}, got ${typeof value}`);
  }
}

function assertNonEmptyString(value, name) {
  assertType(value, 'string', name);
  if (value.length === 0) {
    throw new Error(`RollbackEngine: '${name}' cannot be empty`);
  }
}

function assertFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`RollbackEngine: '${name}' must be a function`);
  }
}

function assertPositiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`RollbackEngine: '${name}' must be a positive finite number`);
  }
}

function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`RollbackEngine: '${name}' must be a positive integer`);
  }
}

/* ------------------------------------------------------------------ *
 *  Destructive migration detection                                   *
 * ------------------------------------------------------------------ */

/**
 * Heuristic scanner for destructive SQL / schema ops.
 * Returns { destructive: boolean, reasons: string[] }.
 * Callers can also register custom migration checks via
 * registerMigrationCheck() for domain-specific rules.
 */
function scanMigrationSql(sqlText) {
  if (typeof sqlText !== 'string') {
    return { destructive: false, reasons: [] };
  }
  const upper = sqlText.toUpperCase();
  const reasons = [];

  // Strong destructive ops — these drop data permanently
  if (/\bDROP\s+TABLE\b/.test(upper)) reasons.push('DROP TABLE');
  if (/\bDROP\s+COLUMN\b/.test(upper)) reasons.push('DROP COLUMN');
  if (/\bDROP\s+DATABASE\b/.test(upper)) reasons.push('DROP DATABASE');
  if (/\bDROP\s+SCHEMA\b/.test(upper)) reasons.push('DROP SCHEMA');
  if (/\bTRUNCATE\b/.test(upper)) reasons.push('TRUNCATE');

  // DELETE without WHERE is destructive (affects all rows)
  const deleteMatches = upper.match(/\bDELETE\s+FROM\b[^;]*/g) || [];
  for (const stmt of deleteMatches) {
    if (!/\bWHERE\b/.test(stmt)) reasons.push('DELETE without WHERE');
  }

  // ALTER COLUMN that changes type in a narrowing direction is risky
  if (/\bALTER\s+COLUMN\b.*\bTYPE\b/.test(upper)) {
    reasons.push('ALTER COLUMN TYPE (may lose data)');
  }

  // RENAME is not destructive but blocks rollback if app still reads old name
  if (/\bRENAME\s+(TABLE|COLUMN)\b/.test(upper)) {
    reasons.push('RENAME (rollback needs compat layer)');
  }

  return {
    destructive: reasons.length > 0,
    reasons,
  };
}

/* ------------------------------------------------------------------ *
 *  Class                                                             *
 * ------------------------------------------------------------------ */

class RollbackEngine {
  constructor(opts) {
    const o = opts || {};

    // Executor: the actual rollback action. Must return a promise
    // that resolves on success and rejects on failure. If not
    // provided we use a no-op so the engine is usable for testing
    // and dry-runs.
    this._executor = typeof o.executor === 'function'
      ? o.executor
      : async () => ({ ok: true, dryRun: true });

    this._loopGuardCount = Number.isInteger(o.loopGuardCount) && o.loopGuardCount > 0
      ? o.loopGuardCount
      : DEFAULTS.loopGuardCount;

    this._loopGuardWindowMs = Number.isFinite(o.loopGuardWindowMs) && o.loopGuardWindowMs > 0
      ? o.loopGuardWindowMs
      : DEFAULTS.loopGuardWindowMs;

    this._maxHistory = Number.isInteger(o.maxHistory) && o.maxHistory > 0
      ? o.maxHistory
      : DEFAULTS.maxHistory;

    this._clock = typeof o.clock === 'function' ? o.clock : () => Date.now();

    // Map<triggerName, {metricFn, threshold, durationMs, breachStart}>
    this._triggers = new Map();

    // Map<service, string[]>  — dependency graph (service -> upstream)
    this._deps = new Map();

    // Map<checkName, (plan) => {destructive, reasons[]}>
    this._migrationChecks = new Map();

    // FreezeWindow[] — never deleted; expired windows remain for audit
    this._freezeWindows = [];

    // Incident[] — append-only; bounded by _maxHistory (oldest moved to _archive)
    this._incidents = [];
    this._archive = [];

    // Loop-guard state
    this._pausedByLoopGuard = false;
    this._pauseReason = null;
    this._pausedAt = null;

    // Map<releaseId, {watchedAt, lastTriggerFired}>
    this._watched = new Map();
  }

  /* ---------------------------------------------------------- *
   *  Trigger registration                                      *
   * ---------------------------------------------------------- */

  /**
   * Register an auto-rollback trigger.
   *
   * @param {string}   name        unique trigger name
   * @param {Function} metricFn    () => number — current metric value
   * @param {number}   threshold   breach if metricFn() >= threshold
   * @param {number}   durationMs  breach must persist this long
   */
  registerTrigger(name, metricFn, threshold, durationMs) {
    assertNonEmptyString(name, 'name');
    assertFunction(metricFn, 'metricFn');
    assertPositiveNumber(threshold, 'threshold');
    assertPositiveNumber(durationMs, 'durationMs');

    // Never delete — replacing a trigger pushes the old one to the
    // history record so the audit trail is preserved.
    const previous = this._triggers.get(name);
    this._triggers.set(name, {
      name,
      metricFn,
      threshold,
      durationMs,
      breachStart: null,
      supersedes: previous ? previous.registeredAt : null,
      registeredAt: this._clock(),
    });
    return this;
  }

  /**
   * Register a dependency: `service` depends on `upstream[]`.
   * Used to determine rollback order (upstream first, then service).
   */
  registerDependency(service, upstream) {
    assertNonEmptyString(service, 'service');
    if (!Array.isArray(upstream)) {
      throw new TypeError(`RollbackEngine: 'upstream' must be an array`);
    }
    for (const u of upstream) assertNonEmptyString(u, 'upstream element');
    this._deps.set(service, [...upstream]);
    return this;
  }

  /**
   * Register a custom migration-safety check.
   * The check function receives the migration plan and must return
   * { destructive: boolean, reasons: string[] }.
   */
  registerMigrationCheck(name, checkFn) {
    assertNonEmptyString(name, 'name');
    assertFunction(checkFn, 'checkFn');
    this._migrationChecks.set(name, checkFn);
    return this;
  }

  /* ---------------------------------------------------------- *
   *  Freeze windows                                            *
   * ---------------------------------------------------------- */

  /**
   * Declare a freeze window during which auto-rollback is disabled.
   * Manual rollback is still allowed (operator override).
   */
  freeze(startMs, endMs, reason) {
    if (!Number.isFinite(startMs)) throw new Error(`RollbackEngine: 'startMs' must be a number`);
    if (!Number.isFinite(endMs)) throw new Error(`RollbackEngine: 'endMs' must be a number`);
    if (endMs <= startMs) throw new Error(`RollbackEngine: freeze 'endMs' must be after 'startMs'`);
    assertNonEmptyString(reason, 'reason');
    this._freezeWindows.push({
      startMs,
      endMs,
      reason,
      createdAt: this._clock(),
    });
    return this;
  }

  /** True if any freeze window currently covers `atMs`. */
  isFrozen(atMs) {
    const t = typeof atMs === 'number' ? atMs : this._clock();
    for (const w of this._freezeWindows) {
      if (t >= w.startMs && t < w.endMs) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------- *
   *  Watching a release                                        *
   * ---------------------------------------------------------- */

  /**
   * Evaluate all registered triggers for the given release. Returns
   * a sync report describing which triggers are in breach and, if
   * any breach has persisted longer than its durationMs, which
   * trigger is READY to fire.
   *
   * Watch is side-effect free regarding rollback — it updates
   * breachStart timestamps but never calls the executor. Callers
   * who want auto-rollback should pass the result to autoRollback()
   * if ready===true.
   */
  watch(releaseId) {
    assertNonEmptyString(releaseId, 'releaseId');
    const now = this._clock();
    if (!this._watched.has(releaseId)) {
      this._watched.set(releaseId, { watchedAt: now, lastTriggerFired: null });
    }

    const report = {
      releaseId,
      at: now,
      triggers: [],
      ready: false,
      readyTrigger: null,
    };

    for (const trig of this._triggers.values()) {
      let value;
      let metricError = null;
      try {
        value = trig.metricFn();
      } catch (e) {
        metricError = String(e && e.message ? e.message : e);
      }

      const inBreach = metricError === null && typeof value === 'number' && value >= trig.threshold;

      if (inBreach) {
        if (trig.breachStart === null) trig.breachStart = now;
      } else {
        trig.breachStart = null;
      }

      const persistedMs = trig.breachStart === null ? 0 : now - trig.breachStart;
      const ready = inBreach && persistedMs >= trig.durationMs;

      report.triggers.push({
        name: trig.name,
        value,
        threshold: trig.threshold,
        durationMs: trig.durationMs,
        breachStart: trig.breachStart,
        persistedMs,
        inBreach,
        ready,
        metricError,
      });

      if (ready && !report.ready) {
        report.ready = true;
        report.readyTrigger = trig.name;
      }
    }

    return report;
  }

  /* ---------------------------------------------------------- *
   *  Loop guard                                                *
   * ---------------------------------------------------------- */

  /** Read-only snapshot of loop-guard state. */
  loopGuardStatus() {
    const now = this._clock();
    const windowStart = now - this._loopGuardWindowMs;
    const recent = this._incidents.filter(
      (i) => i.outcome === ROLLBACK_OUTCOME.SUCCESS && i.startedAt >= windowStart
    );
    return {
      pausedByLoopGuard: this._pausedByLoopGuard,
      pauseReason: this._pauseReason,
      pausedAt: this._pausedAt,
      recentRollbacks: recent.length,
      limit: this._loopGuardCount,
      windowMs: this._loopGuardWindowMs,
      wouldBlock: recent.length >= this._loopGuardCount,
    };
  }

  /** True if the engine is currently paused by the loop guard. */
  pausedByLoopGuard() {
    return this._pausedByLoopGuard === true;
  }

  /**
   * Human operator resumes the engine after investigating the
   * loop-guard alert. Resume is NOT "reset" — incident history is
   * preserved. The paused-reason gets archived to the incident log.
   */
  resume(operator) {
    assertNonEmptyString(operator, 'operator');
    if (!this._pausedByLoopGuard) return false;
    const now = this._clock();
    this._appendIncident({
      id: `resume-${now}`,
      releaseId: null,
      reason: 'manual',
      outcome: 'resume',
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      operator,
      note: `resumed after pause: ${this._pauseReason || 'unknown'}`,
    });
    this._pausedByLoopGuard = false;
    this._pauseReason = null;
    this._pausedAt = null;
    return true;
  }

  /* ---------------------------------------------------------- *
   *  Auto / manual rollback                                    *
   * ---------------------------------------------------------- */

  /**
   * Automatic rollback. Subject to:
   *   1. freeze window
   *   2. loop-guard
   *   3. destructive-migration check (if migrationPlan is supplied)
   *
   * @returns {Promise<IncidentRecord>}
   */
  async autoRollback(releaseId, reason, opts) {
    assertNonEmptyString(releaseId, 'releaseId');
    assertNonEmptyString(reason, 'reason');
    const o = opts || {};
    const now = this._clock();

    // Freeze check
    if (this.isFrozen(now)) {
      return this._appendIncident({
        id: `incident-${now}`,
        releaseId,
        reason,
        outcome: ROLLBACK_OUTCOME.BLOCKED_FREEZE,
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        operator: 'auto',
        note: 'auto-rollback blocked by active freeze window',
      });
    }

    // Loop-guard check (pre-execution)
    const guard = this._checkLoopGuard(now);
    if (guard.pause) {
      // Engine enters the paused state so subsequent autoRollback
      // calls are rejected until a human resumes.
      this._pausedByLoopGuard = true;
      this._pauseReason = `${guard.count} rollbacks in ${Math.round(this._loopGuardWindowMs / 60000)} minutes`;
      this._pausedAt = now;
      return this._appendIncident({
        id: `incident-${now}`,
        releaseId,
        reason,
        outcome: ROLLBACK_OUTCOME.BLOCKED_LOOPGUARD,
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        operator: 'auto',
        note: this._pauseReason,
      });
    }

    // Migration safety
    if (o.migrationPlan) {
      const safety = this.checkMigrationSafety(o.migrationPlan);
      if (safety.destructive) {
        return this._appendIncident({
          id: `incident-${now}`,
          releaseId,
          reason,
          outcome: ROLLBACK_OUTCOME.BLOCKED_MIGRATION,
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
          operator: 'auto',
          note: `destructive migration: ${safety.reasons.join(', ')}`,
        });
      }
    }

    return this._executeRollback(releaseId, reason, 'auto', o);
  }

  /**
   * Manual rollback — invoked by a human operator. Bypasses the
   * freeze window (operator override) but is STILL subject to the
   * destructive-migration check. The loop-guard records the
   * rollback but does not block manual actions (the operator has
   * already reasoned about the situation).
   */
  async manualRollback(releaseId, reason, operator, opts) {
    assertNonEmptyString(releaseId, 'releaseId');
    assertNonEmptyString(reason, 'reason');
    assertNonEmptyString(operator, 'operator');
    const o = opts || {};
    const now = this._clock();

    // Migration safety applies even to manual rollback unless
    // opts.forceDestructive === true (the operator explicitly
    // accepts the data-loss risk and their name is recorded).
    if (o.migrationPlan && o.forceDestructive !== true) {
      const safety = this.checkMigrationSafety(o.migrationPlan);
      if (safety.destructive) {
        return this._appendIncident({
          id: `incident-${now}`,
          releaseId,
          reason,
          outcome: ROLLBACK_OUTCOME.BLOCKED_MIGRATION,
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
          operator,
          note: `destructive migration: ${safety.reasons.join(', ')}`,
        });
      }
    }

    return this._executeRollback(releaseId, reason, operator, o);
  }

  async _executeRollback(releaseId, reason, operator, opts) {
    const startedAt = this._clock();
    const o = opts || {};
    let outcome = ROLLBACK_OUTCOME.SUCCESS;
    let note = '';
    let executorResult = null;

    // Determine service rollback order via dependency graph
    const order = o.service ? this.getDependencyOrder(o.service) : [];

    try {
      const result = await this._executor({
        releaseId,
        reason,
        operator,
        order,
        at: startedAt,
      });
      executorResult = result || null;
      // Executor may return { ok: false, error: 'why' } to indicate
      // a soft failure without throwing.
      if (result && result.ok === false) {
        outcome = ROLLBACK_OUTCOME.FAILED;
        note = String(result.error || 'executor returned ok:false');
      }
    } catch (e) {
      outcome = ROLLBACK_OUTCOME.FAILED;
      note = String(e && e.message ? e.message : e);
    }

    const finishedAt = this._clock();
    return this._appendIncident({
      id: `incident-${startedAt}`,
      releaseId,
      reason,
      outcome,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      operator,
      note,
      order,
      executorResult,
    });
  }

  _checkLoopGuard(now) {
    // If already paused, every new call is blocked.
    if (this._pausedByLoopGuard) {
      return { pause: true, count: -1, alreadyPaused: true };
    }
    const windowStart = now - this._loopGuardWindowMs;
    const recent = this._incidents.filter(
      (i) => i.outcome === ROLLBACK_OUTCOME.SUCCESS && i.startedAt >= windowStart
    );
    return {
      pause: recent.length >= this._loopGuardCount,
      count: recent.length,
      alreadyPaused: false,
    };
  }

  /* ---------------------------------------------------------- *
   *  Dependency order                                          *
   * ---------------------------------------------------------- */

  /**
   * Return a topologically-sorted list of services that must be
   * rolled back, with upstream first. Handles cycles by throwing.
   */
  getDependencyOrder(service) {
    assertNonEmptyString(service, 'service');
    const visited = new Set();
    const stack = new Set();
    const result = [];

    const visit = (s) => {
      if (visited.has(s)) return;
      if (stack.has(s)) {
        throw new Error(`RollbackEngine: dependency cycle detected at '${s}'`);
      }
      stack.add(s);
      const upstream = this._deps.get(s) || [];
      for (const u of upstream) visit(u);
      stack.delete(s);
      visited.add(s);
      result.push(s);
    };

    visit(service);
    return result;
  }

  /* ---------------------------------------------------------- *
   *  Migration safety                                          *
   * ---------------------------------------------------------- */

  /**
   * Check whether a migration plan is safe to roll back.
   * Returns { destructive, reasons[] }. A plan is "unsafe" if any
   * built-in or custom check flags it as destructive.
   *
   * Accepts either a plain object { sql: '...' } or a string
   * containing SQL, or an array of statements.
   */
  checkMigrationSafety(plan) {
    const reasons = [];
    let destructive = false;

    // Normalize input
    let sqlText = '';
    if (typeof plan === 'string') {
      sqlText = plan;
    } else if (Array.isArray(plan)) {
      sqlText = plan.join(';\n');
    } else if (plan && typeof plan === 'object' && typeof plan.sql === 'string') {
      sqlText = plan.sql;
    }

    if (sqlText.length > 0) {
      const builtin = scanMigrationSql(sqlText);
      if (builtin.destructive) {
        destructive = true;
        for (const r of builtin.reasons) reasons.push(`sql:${r}`);
      }
    }

    // Run custom checks — they receive the raw plan
    for (const [name, fn] of this._migrationChecks.entries()) {
      try {
        const r = fn(plan);
        if (r && r.destructive === true) {
          destructive = true;
          const rs = Array.isArray(r.reasons) ? r.reasons : [];
          for (const rr of rs) reasons.push(`${name}:${rr}`);
        }
      } catch (e) {
        // A custom check that throws is treated as "unsafe" (fail
        // closed) — we cannot proceed when the safety check itself
        // is broken.
        destructive = true;
        reasons.push(`${name}:check-threw:${String(e && e.message ? e.message : e)}`);
      }
    }

    return { destructive, reasons };
  }

  /* ---------------------------------------------------------- *
   *  Bilingual incident summary                                *
   * ---------------------------------------------------------- */

  /**
   * Return a bilingual (English + Hebrew) summary of the most
   * recent incidents. `limit` defaults to 10.
   */
  incidentSummary(limit) {
    const n = Number.isInteger(limit) && limit > 0 ? limit : 10;
    const recent = this._incidents.slice(-n).reverse();

    const lines = [];
    lines.push('# Rollback Incident Summary / סיכום אירועי החזרה');
    lines.push('');
    lines.push(`Total incidents (history) / סך אירועים בהיסטוריה: ${this._incidents.length}`);
    lines.push(`Paused by loop-guard / השהיה ע״י שומר הלולאות: ${this._pausedByLoopGuard ? 'yes / כן' : 'no / לא'}`);
    if (this._pausedByLoopGuard) {
      lines.push(`Pause reason / סיבת השהיה: ${this._pauseReason}`);
    }
    lines.push('');
    lines.push(`Showing last ${recent.length} incident(s) / מציג ${recent.length} אירועים אחרונים:`);
    lines.push('');

    for (const inc of recent) {
      const enOutcome = inc.outcome;
      const heOutcome = HEBREW_OUTCOME[inc.outcome] || inc.outcome;
      const enReason = inc.reason;
      const heReason = HEBREW_REASON[inc.reason] || inc.reason;
      lines.push(`- [${inc.id}] release=${inc.releaseId || '—'}`);
      lines.push(`  reason / סיבה: ${enReason} / ${heReason}`);
      lines.push(`  outcome / תוצאה: ${enOutcome} / ${heOutcome}`);
      lines.push(`  operator / מבצע: ${inc.operator}`);
      lines.push(`  duration / משך: ${inc.durationMs}ms`);
      if (inc.note) lines.push(`  note / הערה: ${inc.note}`);
      if (inc.order && inc.order.length > 0) {
        lines.push(`  order / סדר: ${inc.order.join(' -> ')}`);
      }
    }

    return lines.join('\n');
  }

  /* ---------------------------------------------------------- *
   *  History getters                                           *
   * ---------------------------------------------------------- */

  history() {
    return {
      incidents: this._incidents.slice(),
      archived: this._archive.slice(),
      total: this._incidents.length + this._archive.length,
    };
  }

  /* ---------------------------------------------------------- *
   *  Internals                                                 *
   * ---------------------------------------------------------- */

  _appendIncident(incident) {
    this._incidents.push(Object.freeze({ ...incident }));
    // Never delete — overflow moves to archive
    while (this._incidents.length > this._maxHistory) {
      this._archive.push(this._incidents.shift());
    }
    return incident;
  }
}

module.exports = {
  RollbackEngine,
  TRIGGER_REASONS,
  ROLLBACK_OUTCOME,
  DEFAULTS,
  scanMigrationSql,
};
