/**
 * ONYX — Blue/Green Deployment Orchestrator
 * Agent Y-178 — Techno-Kol Uzi mega-ERP DevOps pack — written 2026-04-11
 * ════════════════════════════════════════════════════════════════════
 *
 * Dedicated Blue/Green coordinator with DB migration guard.
 *
 * Distinct from Y-167 (rollout-strategies.js), which plans *any*
 * strategy (blue-green / canary / rolling / recreate). Y-178 is a
 * narrow, stateful orchestrator that owns the blue/green slot pair
 * for a single service and enforces the expand-contract migration
 * pattern before any atomic traffic switch.
 *
 * Public API
 * ──────────
 *   const { BlueGreenDeployer, SLOTS, STATE, PHASES } = require('./blue-green');
 *
 *   const dep = new BlueGreenDeployer({
 *     initialSlot       : 'blue',
 *     warmupMs          : 5000,
 *     smokeTimeoutMs    : 30000,
 *     requiredSmokeTests: ['/health', '/ready', '/api/version'],
 *     adapter           : infraAdapter,       // injectable, mockable
 *     clock             : () => Date.now(),   // injectable
 *     sleep             : (ms) => Promise     // injectable
 *   });
 *
 *   dep.activeSlot();                         // → 'blue'
 *   dep.standbySlot();                        // → 'green'
 *   await dep.deployToStandby('v2.4.1');
 *   await dep.smokeTests(dep.standbySlot());
 *   await dep.dbMigrationGuard(migrationSet); // blocks switch if not compat
 *   await dep.warmup();                       // warmup period
 *   await dep.cachePreheat(['warehouses','suppliers','users']);
 *   await dep.switchTraffic();                // atomic cut-over
 *   await dep.rollback();                     // reverse traffic
 *   dep.auditTrail();                         // bilingual entries
 *
 * Principles honored
 * ──────────────────
 *   • RULE 1 — "לא מוחקים רק משדרגים ומגדלים" / never delete:
 *       old slot is retired (quiesced + marked standby) after a
 *       successful switch, never torn down. The full audit trail
 *       is append-only and kept forever.
 *   • RULE 2 — Node built-ins only (node:events, node:crypto).
 *   • RULE 3 — Bilingual Hebrew/English audit messages.
 *
 * Expand-contract enforcement
 * ───────────────────────────
 * A DB migration bundle is marked *switch-safe* ONLY IF it is in the
 * EXPAND phase — i.e. it ADDs columns/tables/indexes or writes to
 * new backfill tables, but does NOT DROP, RENAME, or CHANGE TYPE on
 * any column still used by the old (active) slot. Those destructive
 * operations must be scheduled for a LATER deploy (the CONTRACT
 * phase) once the old slot has been retired for N grace periods.
 * dbMigrationGuard() blocks switchTraffic when it detects a CONTRACT
 * statement in a bundle that is still servicing traffic from the old
 * slot — this is the classic expand-contract pattern.
 *
 * @module src/devops/blue-green
 */

'use strict';

const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

/* ------------------------------------------------------------------ *
 *  Enumerations                                                      *
 * ------------------------------------------------------------------ */

const SLOTS = Object.freeze({
  BLUE: 'blue',
  GREEN: 'green',
});

const STATE = Object.freeze({
  IDLE: 'idle',                  // nothing in progress
  DEPLOYING: 'deploying',        // pushing artifact to standby
  SMOKE_TESTING: 'smoke-testing',
  GUARDING: 'guarding',          // DB guard running
  WARMING: 'warming',            // warmup period in progress
  PREHEATING: 'preheating',      // cache preheat in progress
  READY_TO_SWITCH: 'ready-to-switch',
  SWITCHING: 'switching',        // atomic cut-over
  SWITCHED: 'switched',          // new slot live
  ROLLING_BACK: 'rolling-back',  // reverse in flight
  ROLLED_BACK: 'rolled-back',    // reverse complete
  BLOCKED: 'blocked',            // guard refused switch
  FAILED: 'failed',              // fatal error somewhere
});

const PHASES = Object.freeze({
  EXPAND:   'expand',   // additive only — switch-safe
  MIGRATE:  'migrate',  // data backfill — switch-safe if non-breaking
  CONTRACT: 'contract', // destructive — blocks switch
});

// Verbs that are OK in the EXPAND phase
const EXPAND_VERBS = Object.freeze([
  'CREATE TABLE',
  'CREATE INDEX',
  'CREATE UNIQUE INDEX',
  'CREATE MATERIALIZED VIEW',
  'CREATE VIEW',
  'ADD COLUMN',
  'ADD CONSTRAINT',
  'ALTER TABLE ADD',
  'ALTER TABLE VALIDATE',
]);

// Verbs that are DESTRUCTIVE / CONTRACT-phase only
const CONTRACT_VERBS = Object.freeze([
  'DROP COLUMN',
  'DROP TABLE',
  'DROP INDEX',
  'DROP VIEW',
  'DROP MATERIALIZED VIEW',
  'DROP CONSTRAINT',
  'RENAME COLUMN',
  'RENAME TABLE',
  'ALTER TYPE',
  'TRUNCATE',
]);

// Regex-matched destructive patterns (used in addition to the
// literal CONTRACT_VERBS list for cases where the destructive verb
// is interleaved with a column name). Example: "ALTER TABLE t ALTER
// COLUMN amount TYPE BIGINT" must be detected as destructive.
const CONTRACT_PATTERNS = Object.freeze([
  { re: /\bALTER\s+COLUMN\b[\s\S]*\bTYPE\b/, label: 'ALTER COLUMN TYPE' },
]);

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function nowIso(clock) {
  try {
    return new Date(clock ? clock() : Date.now()).toISOString();
  } catch (_e) {
    return new Date().toISOString();
  }
}

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

function oppositeSlot(slot) {
  if (slot === SLOTS.BLUE)  return SLOTS.GREEN;
  if (slot === SLOTS.GREEN) return SLOTS.BLUE;
  throw new RangeError(`BlueGreen: unknown slot '${slot}'`);
}

function validateSlot(slot, field) {
  if (slot !== SLOTS.BLUE && slot !== SLOTS.GREEN) {
    throw new RangeError(
      `BlueGreen: '${field || 'slot'}' must be 'blue' or 'green', got '${slot}'`
    );
  }
  return slot;
}

function scanStatement(sql) {
  if (typeof sql !== 'string') return { phase: PHASES.EXPAND, hit: null };
  const upper = sql.toUpperCase().replace(/\s+/g, ' ').trim();
  for (const verb of CONTRACT_VERBS) {
    if (upper.includes(verb)) {
      return { phase: PHASES.CONTRACT, hit: verb };
    }
  }
  for (const pat of CONTRACT_PATTERNS) {
    if (pat.re.test(upper)) {
      return { phase: PHASES.CONTRACT, hit: pat.label };
    }
  }
  for (const verb of EXPAND_VERBS) {
    if (upper.includes(verb)) {
      return { phase: PHASES.EXPAND, hit: verb };
    }
  }
  // unknown / data-only statement — treat as MIGRATE (compat)
  return { phase: PHASES.MIGRATE, hit: null };
}

/* ------------------------------------------------------------------ *
 *  Default adapter — in-memory mock; replaceable                      *
 * ------------------------------------------------------------------ */

function defaultAdapter() {
  return {
    deployed: { blue: null, green: null },
    health:   { blue: true, green: true },
    cache:    { blue: new Set(), green: new Set() },
    async deploy(slot, version) {
      this.deployed[slot] = version;
      return { slot, version, ok: true };
    },
    async healthProbe(slot) {
      return this.health[slot] === true;
    },
    async shiftTraffic(toSlot) {
      return { active: toSlot, ok: true };
    },
    async preheatKey(slot, key) {
      this.cache[slot].add(key);
      return true;
    },
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

/* ------------------------------------------------------------------ *
 *  BlueGreenDeployer                                                 *
 * ------------------------------------------------------------------ */

class BlueGreenDeployer extends EventEmitter {
  /**
   * @param {object} opts
   * @param {'blue'|'green'} [opts.initialSlot='blue']
   * @param {number} [opts.warmupMs=2000]
   * @param {number} [opts.smokeTimeoutMs=30000]
   * @param {string[]} [opts.requiredSmokeTests]
   * @param {object} [opts.adapter] infra adapter (mockable)
   * @param {()=>number} [opts.clock]
   * @param {(ms:number)=>Promise<void>} [opts.sleep]
   * @param {string} [opts.serviceName]
   */
  constructor(opts) {
    super();
    const o = opts || {};
    const initial = o.initialSlot || SLOTS.BLUE;
    validateSlot(initial, 'initialSlot');

    this._active  = initial;
    this._standby = oppositeSlot(initial);
    this._state   = STATE.IDLE;

    this._warmupMs       = Number.isFinite(o.warmupMs) ? o.warmupMs : 2000;
    this._smokeTimeoutMs = Number.isFinite(o.smokeTimeoutMs) ? o.smokeTimeoutMs : 30000;
    this._requiredSmoke  = Array.isArray(o.requiredSmokeTests) && o.requiredSmokeTests.length
      ? [...o.requiredSmokeTests]
      : ['/health', '/ready', '/api/version'];

    this._adapter = o.adapter || defaultAdapter();
    this._clock   = typeof o.clock === 'function' ? o.clock : () => Date.now();
    this._sleep   = typeof o.sleep === 'function' ? o.sleep : defaultSleep;

    this._service = o.serviceName || 'onyx-procurement';

    this._standbyVersion = null;
    this._activeVersion  = o.initialVersion || 'v0.0.0';
    this._smokeResult    = null;
    this._guardResult    = null;
    this._audit          = [];
    this._deployId       = null;

    this._record('init',
      `Blue/Green orchestrator initialised — active=${this._active}`,
      `מתאם כחול/ירוק אותחל — הפעיל=${this._active}`);
  }

  /* -------------------------- state getters ----------------------- */

  /** Currently receiving live traffic. */
  activeSlot() { return this._active; }

  /** Currently idle standby (target of the next deploy). */
  standbySlot() { return this._standby; }

  state() { return this._state; }

  activeVersion()  { return this._activeVersion; }
  standbyVersion() { return this._standbyVersion; }

  /** Immutable copy of the bilingual audit trail. */
  auditTrail() {
    return this._audit.map((e) => ({ ...e }));
  }

  /** Last DB migration guard decision (null if never run for this cycle). */
  lastGuardDecision() {
    return this._guardResult ? { ...this._guardResult } : null;
  }

  /** Last smoke test result (null if never run for this cycle). */
  lastSmokeResult() {
    return this._smokeResult ? { ...this._smokeResult } : null;
  }

  /* -------------------------- audit helpers ----------------------- */

  _record(kind, en, he, extra) {
    const entry = {
      id: shortId(),
      at: nowIso(this._clock),
      kind,
      slot_active: this._active,
      slot_standby: this._standby,
      state: this._state,
      en: String(en || ''),
      he: String(he || ''),
    };
    if (extra && typeof extra === 'object') entry.extra = { ...extra };
    this._audit.push(entry);
    // emit but never throw if no listeners
    try { this.emit('audit', entry); } catch (_e) {}
    return entry;
  }

  _setState(next) {
    this._state = next;
    try { this.emit('state', next); } catch (_e) {}
  }

  /* -------------------------- deploy phase ------------------------ */

  /**
   * Deploy a new version to the standby slot.
   * Never touches the active slot.
   */
  async deployToStandby(version) {
    if (typeof version !== 'string' || version.length === 0) {
      throw new TypeError("BlueGreen: 'version' must be a non-empty string");
    }
    if (this._state === STATE.SWITCHING) {
      throw new Error('BlueGreen: cannot deploy while switching');
    }
    this._deployId = shortId();
    this._setState(STATE.DEPLOYING);
    this._record('deploy-begin',
      `Deploying ${version} to standby slot '${this._standby}' (id=${this._deployId})`,
      `פריסת ${version} לחריץ ההמתנה '${this._standby}' (מזהה=${this._deployId})`,
      { version });

    let result;
    try {
      result = await this._adapter.deploy(this._standby, version);
    } catch (err) {
      this._setState(STATE.FAILED);
      this._record('deploy-error',
        `Deploy failed: ${err && err.message ? err.message : String(err)}`,
        `פריסה נכשלה: ${err && err.message ? err.message : String(err)}`,
        { version });
      throw err;
    }

    if (!result || result.ok === false) {
      this._setState(STATE.FAILED);
      this._record('deploy-error',
        `Adapter reported deploy failure for ${version}`,
        `המתאם דיווח על כשל בפריסת ${version}`,
        { version });
      throw new Error('BlueGreen: adapter deploy returned non-ok');
    }

    this._standbyVersion = version;
    this._record('deploy-ok',
      `Deploy succeeded: ${version} on ${this._standby}`,
      `הפריסה הצליחה: ${version} על ${this._standby}`,
      { version });
    return { slot: this._standby, version };
  }

  /* -------------------------- smoke tests ------------------------- */

  /**
   * Run smoke tests against the given slot. Defaults to standby.
   * Each required path is probed via adapter.healthProbe(slot, path)
   * — if the adapter lacks a path-aware probe, it falls back to
   * adapter.healthProbe(slot).
   */
  async smokeTests(slot) {
    const target = validateSlot(slot || this._standby, 'slot');
    this._setState(STATE.SMOKE_TESTING);
    this._record('smoke-begin',
      `Running smoke tests on '${target}' (${this._requiredSmoke.length} checks)`,
      `הרצת בדיקות עשן על '${target}' (${this._requiredSmoke.length} בדיקות)`,
      { paths: [...this._requiredSmoke] });

    const started = this._clock();
    const results = [];
    for (const path of this._requiredSmoke) {
      if (this._clock() - started > this._smokeTimeoutMs) {
        const r = { path, ok: false, reason: 'timeout' };
        results.push(r);
        break;
      }
      let ok;
      try {
        if (typeof this._adapter.healthProbe === 'function') {
          ok = await this._adapter.healthProbe(target, path);
          if (typeof ok !== 'boolean') ok = await this._adapter.healthProbe(target);
        } else {
          ok = true;
        }
      } catch (_e) {
        ok = false;
      }
      results.push({ path, ok: !!ok });
    }

    const pass = results.length === this._requiredSmoke.length && results.every((r) => r.ok);
    this._smokeResult = { slot: target, pass, results, at: nowIso(this._clock) };

    if (pass) {
      this._record('smoke-ok',
        `Smoke tests passed on '${target}' (${results.length}/${results.length})`,
        `בדיקות העשן עברו על '${target}' (${results.length}/${results.length})`,
        { results });
    } else {
      this._setState(STATE.FAILED);
      this._record('smoke-fail',
        `Smoke tests failed on '${target}'`,
        `בדיקות עשן נכשלו על '${target}'`,
        { results });
    }
    return { ...this._smokeResult };
  }

  /* -------------------------- DB migration guard ------------------ */

  /**
   * Enforce expand-contract on a migration bundle BEFORE switching
   * traffic. Returns { compat, blockers, warnings, summary } and
   * sets BLOCKED state if any blocker is found.
   *
   * `migrationBundle` may be:
   *   • an array of SQL statement strings
   *   • an array of { sql, phase } objects (phase optional)
   *   • an object { statements: [...], phase?: 'expand'|'contract' }
   *
   * The guard inspects every statement it can parse and classifies
   * into EXPAND / MIGRATE / CONTRACT. Any CONTRACT statement blocks.
   */
  async dbMigrationGuard(migrationBundle) {
    this._setState(STATE.GUARDING);
    this._record('guard-begin',
      `Running DB migration guard (expand-contract)`,
      `הפעלת שומר מיגרציה של בסיס הנתונים (expand-contract)`);

    // Normalise into array of {sql, phase?}
    let items = [];
    if (Array.isArray(migrationBundle)) {
      items = migrationBundle.map((x) => typeof x === 'string' ? { sql: x } : { ...x });
    } else if (migrationBundle && Array.isArray(migrationBundle.statements)) {
      items = migrationBundle.statements.map((x) => typeof x === 'string'
        ? { sql: x, phase: migrationBundle.phase }
        : { ...x, phase: x.phase || migrationBundle.phase });
    } else if (migrationBundle == null) {
      items = [];
    } else {
      throw new TypeError("BlueGreen: 'migrationBundle' must be array or {statements:[...]}");
    }

    const blockers = [];
    const warnings = [];
    const classified = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] || {};
      const sql = item.sql || '';
      const scanned = scanStatement(sql);
      // If the caller explicitly marked a phase, we HONOR it — but a
      // caller cannot override a destructive scan: if we see DROP,
      // we mark CONTRACT regardless of the claimed phase.
      let phase = scanned.phase;
      if (item.phase && item.phase !== PHASES.CONTRACT && scanned.phase === PHASES.CONTRACT) {
        warnings.push({
          index: i,
          note: `Caller labelled phase='${item.phase}' but scanner detected destructive verb '${scanned.hit}'`,
        });
      } else if (item.phase) {
        phase = item.phase;
      }
      const row = { index: i, sql, phase, hit: scanned.hit };
      classified.push(row);
      if (phase === PHASES.CONTRACT) {
        blockers.push({
          index: i,
          verb: scanned.hit,
          sql: sql.slice(0, 240),
          reason: 'destructive-in-expand-window',
        });
      }
    }

    const compat = blockers.length === 0;
    const summary = {
      total:     classified.length,
      expand:    classified.filter((c) => c.phase === PHASES.EXPAND).length,
      migrate:   classified.filter((c) => c.phase === PHASES.MIGRATE).length,
      contract:  classified.filter((c) => c.phase === PHASES.CONTRACT).length,
    };

    this._guardResult = { compat, blockers, warnings, summary, at: nowIso(this._clock) };

    if (compat) {
      this._record('guard-ok',
        `Migration guard: compat=true (expand=${summary.expand}, migrate=${summary.migrate}, contract=${summary.contract})`,
        `שומר מיגרציה: תואם=true (הרחבה=${summary.expand}, מיגרציה=${summary.migrate}, צמצום=${summary.contract})`,
        { summary });
    } else {
      this._setState(STATE.BLOCKED);
      this._record('guard-blocked',
        `Migration guard BLOCKED switch — ${blockers.length} destructive statement(s) detected`,
        `שומר המיגרציה חסם את המעבר — זוהו ${blockers.length} פקודות הרסניות`,
        { blockers });
    }
    return { ...this._guardResult };
  }

  /* -------------------------- warmup ----------------------------- */

  /**
   * Warmup period — blocks the standby from taking traffic for
   * `warmupMs` milliseconds, allowing JIT / connection pools / JVM
   * equivalents to settle. Injectable sleep for deterministic tests.
   */
  async warmup(ms) {
    const duration = Number.isFinite(ms) ? ms : this._warmupMs;
    this._setState(STATE.WARMING);
    this._record('warmup-begin',
      `Warmup period: ${duration}ms on '${this._standby}'`,
      `חלון חימום: ${duration} מילישניות על '${this._standby}'`,
      { durationMs: duration });
    await this._sleep(duration);
    this._record('warmup-ok',
      `Warmup complete on '${this._standby}'`,
      `החימום הושלם על '${this._standby}'`);
    return { slot: this._standby, durationMs: duration };
  }

  /* -------------------------- cache preheat ---------------------- */

  /**
   * Preheat the standby's cache with a set of keys before switching.
   * Keys may be strings or objects — they are simply handed to
   * adapter.preheatKey(slot, key). Returns per-key status.
   */
  async cachePreheat(keys) {
    if (!Array.isArray(keys)) {
      throw new TypeError("BlueGreen: 'keys' must be an array");
    }
    this._setState(STATE.PREHEATING);
    this._record('preheat-begin',
      `Cache preheat: ${keys.length} keys on '${this._standby}'`,
      `חימום מטמון: ${keys.length} מפתחות על '${this._standby}'`,
      { count: keys.length });

    const results = [];
    let okCount = 0;
    for (const key of keys) {
      let ok = false;
      try {
        if (typeof this._adapter.preheatKey === 'function') {
          const r = await this._adapter.preheatKey(this._standby, key);
          ok = r !== false;
        } else {
          ok = true;
        }
      } catch (_e) {
        ok = false;
      }
      if (ok) okCount += 1;
      results.push({ key, ok });
    }

    this._record('preheat-ok',
      `Cache preheat complete: ${okCount}/${keys.length} on '${this._standby}'`,
      `חימום המטמון הושלם: ${okCount}/${keys.length} על '${this._standby}'`,
      { ok: okCount, total: keys.length });
    return { slot: this._standby, ok: okCount, total: keys.length, results };
  }

  /* -------------------------- switch traffic --------------------- */

  /**
   * Atomically switch traffic from active → standby. Requires:
   *   • a deployed standby version
   *   • the last smoke test PASSED
   *   • the last DB migration guard was compat (or never run but
   *     the caller explicitly passed { skipGuardCheck:true } — this
   *     is discouraged; the audit trail will flag it)
   *
   * On success: active and standby swap. On failure: state=FAILED,
   * nothing is swapped. This method is intentionally synchronous in
   * its swap to keep the cut-over atomic.
   */
  async switchTraffic(opts) {
    const options = opts || {};
    if (this._state === STATE.BLOCKED) {
      throw new Error('BlueGreen: cannot switch — state is BLOCKED by migration guard');
    }
    if (!this._standbyVersion) {
      throw new Error('BlueGreen: cannot switch — no version deployed to standby');
    }
    if (!this._smokeResult || !this._smokeResult.pass) {
      throw new Error('BlueGreen: cannot switch — last smoke test did not pass');
    }
    if (!this._guardResult || !this._guardResult.compat) {
      if (!options.skipGuardCheck) {
        throw new Error('BlueGreen: cannot switch — DB migration guard did not approve');
      }
      this._record('switch-guard-skipped',
        `WARNING: migration guard skipped by caller`,
        `אזהרה: שומר המיגרציה דולג על-ידי המתקשר`);
    }

    this._setState(STATE.READY_TO_SWITCH);
    this._record('switch-begin',
      `Atomic switch: active '${this._active}' → '${this._standby}' (${this._standbyVersion})`,
      `מעבר אטומי: פעיל '${this._active}' → '${this._standby}' (${this._standbyVersion})`);

    this._setState(STATE.SWITCHING);
    const from = this._active;
    const to = this._standby;

    try {
      if (typeof this._adapter.shiftTraffic === 'function') {
        const r = await this._adapter.shiftTraffic(to);
        if (r && r.ok === false) {
          throw new Error('adapter.shiftTraffic returned non-ok');
        }
      }
    } catch (err) {
      this._setState(STATE.FAILED);
      this._record('switch-error',
        `Switch failed: ${err && err.message ? err.message : String(err)}`,
        `מעבר נכשל: ${err && err.message ? err.message : String(err)}`);
      throw err;
    }

    // ATOMIC swap — ordering is important: capture previous first.
    this._previousActive = from;
    this._previousActiveVersion = this._activeVersion;
    this._active = to;
    this._standby = from;
    this._activeVersion = this._standbyVersion;
    // Note: old version is NOT deleted — we keep standbyVersion set
    // to the previous running version so that rollback() can restore.
    this._standbyVersion = this._previousActiveVersion;

    this._setState(STATE.SWITCHED);
    this._record('switch-ok',
      `Traffic switched: active='${this._active}' (${this._activeVersion}); previous '${this._previousActive}' quiesced (never deleted)`,
      `התעבורה הועברה: פעיל='${this._active}' (${this._activeVersion}); קודם '${this._previousActive}' הושתק (לא נמחק)`);

    return {
      active: this._active,
      standby: this._standby,
      activeVersion: this._activeVersion,
      standbyVersion: this._standbyVersion,
    };
  }

  /* -------------------------- rollback --------------------------- */

  /**
   * Reverse the last switch. Only valid from STATE.SWITCHED. The
   * previous slot is re-promoted (its data and version are still
   * present because we never deleted them).
   */
  async rollback() {
    if (this._state !== STATE.SWITCHED && this._state !== STATE.FAILED) {
      // allow rollback attempt even from FAILED — it's the whole point
      if (!this._previousActive) {
        throw new Error('BlueGreen: nothing to roll back to');
      }
    }
    if (!this._previousActive) {
      throw new Error('BlueGreen: nothing to roll back to');
    }

    this._setState(STATE.ROLLING_BACK);
    this._record('rollback-begin',
      `Rollback: restoring '${this._previousActive}' (${this._previousActiveVersion})`,
      `החזרה לאחור: משחזר '${this._previousActive}' (${this._previousActiveVersion})`);

    try {
      if (typeof this._adapter.shiftTraffic === 'function') {
        const r = await this._adapter.shiftTraffic(this._previousActive);
        if (r && r.ok === false) {
          throw new Error('adapter.shiftTraffic returned non-ok on rollback');
        }
      }
    } catch (err) {
      this._setState(STATE.FAILED);
      this._record('rollback-error',
        `Rollback failed: ${err && err.message ? err.message : String(err)}`,
        `החזרה לאחור נכשלה: ${err && err.message ? err.message : String(err)}`);
      throw err;
    }

    // reverse the swap
    const formerActive = this._active;
    const formerActiveVersion = this._activeVersion;
    this._active = this._previousActive;
    this._standby = formerActive;
    this._activeVersion = this._previousActiveVersion;
    this._standbyVersion = formerActiveVersion;
    // clear rollback target (one-shot)
    this._previousActive = null;
    this._previousActiveVersion = null;

    this._setState(STATE.ROLLED_BACK);
    this._record('rollback-ok',
      `Rollback complete: active='${this._active}' (${this._activeVersion})`,
      `החזרה לאחור הושלמה: פעיל='${this._active}' (${this._activeVersion})`);

    return {
      active: this._active,
      standby: this._standby,
      activeVersion: this._activeVersion,
      standbyVersion: this._standbyVersion,
    };
  }

  /* -------------------------- full cycle helper ------------------ */

  /**
   * Convenience wrapper: deploy → smoke → guard → warmup →
   * preheat → switch. Any failure halts the pipeline and leaves the
   * deployer in the appropriate error state; nothing is rolled back
   * implicitly — the caller decides.
   */
  async runFullCycle({ version, migrations, preheatKeys, warmupMs } = {}) {
    await this.deployToStandby(version);
    await this.smokeTests(this._standby);
    if (this._smokeResult && this._smokeResult.pass) {
      await this.dbMigrationGuard(migrations || []);
      if (this._guardResult && this._guardResult.compat) {
        await this.warmup(warmupMs);
        await this.cachePreheat(preheatKeys || []);
        return this.switchTraffic();
      }
    }
    return {
      active: this._active,
      standby: this._standby,
      state: this._state,
      smoke: this._smokeResult,
      guard: this._guardResult,
    };
  }
}

/* ------------------------------------------------------------------ *
 *  Exports                                                           *
 * ------------------------------------------------------------------ */

module.exports = {
  BlueGreenDeployer,
  SLOTS,
  STATE,
  PHASES,
  EXPAND_VERBS,
  CONTRACT_VERBS,
  CONTRACT_PATTERNS,
  // exposed for unit-testing only
  scanStatement,
  oppositeSlot,
  validateSlot,
  defaultAdapter,
};
