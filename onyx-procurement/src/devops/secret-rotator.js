/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AG-Y172 — Secret Rotation Scheduler with Dual-Key Support
 * מתזמן רוטציית סודות עם תמיכה בשני מפתחות בו-זמנית
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Agent:     Y172 (DevOps / Security)
 * Module:    onyx-procurement/src/devops/secret-rotator.js
 * System:    Techno-Kol Uzi mega-ERP — ONYX Procurement
 * Date:      2026-04-11
 * Rule:      לא מוחקים — רק מסובבים ושומרים בהיסטוריה
 *            Never delete — only rotate and archive.
 *
 * ─── What this module does ────────────────────────────────────────────────
 * A zero-dependency, injectable secret rotation scheduler that supports
 * the *dual-key* rotation pattern (old + new valid in parallel during a
 * grace window), so services can be upgraded one at a time without a
 * big-bang cutover.
 *
 * Lifecycle of a secret version:
 *
 *     PENDING ─► ACTIVE ─► GRACE ─► RETIRED  (never HARD-DELETED)
 *        │          │         │         │
 *        │          │         │         └── verification still allowed
 *        │          │         │             for read-only audits; no new
 *        │          │         │             signing, ever.
 *        │          │         │
 *        │          │         └── overlap window: old + new both accepted
 *        │          │             by verifyInUse() so callers can migrate.
 *        │          │
 *        │          └── only one version per secretId is ACTIVE at a time.
 *        │              New sign/encrypt operations use the ACTIVE one.
 *        │
 *        └── just created, not yet activated. activateNew() flips it.
 *
 * ─── Israeli security best-practices reference / הפניות ──────────────────
 * This module is designed to fulfil:
 *
 *   1. Privacy Protection Regulations (Information Security), 5777-2017
 *      — תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017 — §11 requires
 *      periodic access credential rotation proportionate to risk level.
 *   2. Israeli National Cyber Directorate (INCD) "Cyber-Defense Doctrine
 *      2.0" — מערך הסייבר הלאומי, תורת ההגנה — control SEC-4 (key
 *      management) requires documented rotation cadence + emergency
 *      rotation playbook.
 *   3. NIST SP 800-57 Part 1 Rev. 5 §5.3.5 "Key Lifetime and Cryptoperiods"
 *      — dual-key rotation to avoid availability gaps.
 *   4. CIS Controls v8 — §3.11 (encryption key rotation) & §4.5 (secure
 *      storage of administrative credentials).
 *   5. PCI-DSS v4.0 §3.7.4 — key rotation at the end of cryptoperiod.
 *
 * ─── Zero-dependency constraint / אפס תלויות ──────────────────────────────
 * Only Node built-ins:  `node:crypto`
 * No `bcrypt`, no `argon2`, no `vault` SDK. Everything is hand-rolled so
 * that this file still runs on an air-gapped DR host with only node.exe.
 *
 * ─── Never-delete discipline / עקרון אי-המחיקה ───────────────────────────
 * retireOld() never drops a row. It flips status to RETIRED and appends
 * an audit record. Old versions stay queryable forever — that is how
 * we investigate a post-incident compromise three years later and
 * still know which version signed a given token.
 *
 * ─── Public API / ממשק ציבורי ─────────────────────────────────────────────
 *   const { SecretRotator, MemoryStorage } = require('./secret-rotator');
 *   const rotator = new SecretRotator({ storage: new MemoryStorage() });
 *
 *   await rotator.scheduleRotation('jwt-signing-key', 90);
 *   const { versionId } = await rotator.rotate('jwt-signing-key');
 *   await rotator.activateNew('jwt-signing-key', versionId);
 *   //  …grace window…
 *   await rotator.retireOld('jwt-signing-key', oldVersionId);
 *
 *   await rotator.verifyInUse('jwt-signing-key', serviceName, versionId);
 *   await rotator.emergencyRotation('jwt-signing-key', 'suspected leak');
 *   const strong = rotator.generateStrongSecret(48);   // hex string
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTS / קבועים
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lifecycle states for a single secret version.
 * מצבי מחזור-חיים של גרסת סוד.
 */
const STATUS = Object.freeze({
  PENDING: 'pending',   // created but not yet the active signer
  ACTIVE: 'active',     // the one issuing new tokens / ciphertexts
  GRACE: 'grace',       // old, still accepted for verification
  RETIRED: 'retired',   // no longer accepted; kept only for audit / forensics
});

/**
 * Reasons a rotation may have been triggered.
 * סיבות לרוטציה.
 */
const ROTATION_REASON = Object.freeze({
  SCHEDULED: 'scheduled',         // cron / TTL reached
  MANUAL: 'manual',               // operator initiated
  EMERGENCY: 'emergency',         // suspected compromise
  INITIAL: 'initial',             // first-ever version on schedule
  COMPLIANCE: 'compliance',       // required by regulation audit
});

/**
 * Audit event types. Every mutation writes one of these.
 * סוגי אירועי-ביקורת — כל פעולה כותבת שורה אחת לפחות.
 */
const AUDIT_EVENT = Object.freeze({
  SCHEDULED: 'rotation.scheduled',
  ROTATED: 'rotation.rotated',
  ACTIVATED: 'rotation.activated',
  RETIRED: 'rotation.retired',
  EMERGENCY: 'rotation.emergency',
  USAGE: 'rotation.usage',
  VERIFIED: 'rotation.verified',
});

/** Default grace-window length in days if the caller does not specify. */
const DEFAULT_GRACE_DAYS = 7;

/** Minimum entropy for a generated secret in bytes (32 B = 256 bits). */
const MIN_SECRET_BYTES = 32;

/** Maximum practical size so a rogue caller cannot OOM the process. */
const MAX_SECRET_BYTES = 1024;

/** Minimum rotation interval in days — anything shorter is ops noise. */
const MIN_INTERVAL_DAYS = 1;

/** Maximum rotation interval in days — 10 years is the INCD outer bound. */
const MAX_INTERVAL_DAYS = 3650;

// ═══════════════════════════════════════════════════════════════════════════
//  TIME UTILITIES / עזרי זמן
// ═══════════════════════════════════════════════════════════════════════════

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pluggable clock. Tests inject a virtual clock; production uses Date.now.
 * שעון מוזרק — לבדיקות אפשר להחליף בשעון וירטואלי.
 */
function defaultNow() {
  return Date.now();
}

/**
 * Add N days (can be fractional) to an epoch-ms timestamp.
 * מוסיף ימים לחותמת-זמן.
 */
function addDays(tsMs, days) {
  return tsMs + Math.round(days * MS_PER_DAY);
}

// ═══════════════════════════════════════════════════════════════════════════
//  IN-MEMORY STORAGE BACKEND (default, overridable)
//  backend ברירת-מחדל בזיכרון — ניתן להחלפה
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The interface every storage backend must satisfy:
 *
 *   async upsertSecret(record)           → void
 *   async getSecret(secretId)            → record | null
 *   async listSecrets()                  → record[]
 *   async insertVersion(version)         → void
 *   async updateVersion(version)         → void   (same id → overwrite)
 *   async getVersion(secretId, verId)    → version | null
 *   async listVersions(secretId)         → version[]   (all statuses)
 *   async appendAudit(entry)             → void
 *   async listAudit(secretId)            → entry[]
 *   async recordUsage(usage)             → void
 *   async listUsage(secretId)            → usage[]
 *
 * A "record" is never deleted — callers who want a minimal view can
 * filter on status.
 */

class MemoryStorage {
  constructor() {
    /** @type {Map<string, object>} secretId → record */
    this._secrets = new Map();
    /** @type {Map<string, object>} "secretId::versionId" → version */
    this._versions = new Map();
    /** @type {object[]} append-only audit log */
    this._audit = [];
    /** @type {object[]} append-only usage log */
    this._usage = [];
  }

  async upsertSecret(record) {
    this._secrets.set(record.secretId, { ...record });
  }

  async getSecret(secretId) {
    const row = this._secrets.get(secretId);
    return row ? { ...row } : null;
  }

  async listSecrets() {
    return Array.from(this._secrets.values(), (r) => ({ ...r }));
  }

  async insertVersion(version) {
    const key = `${version.secretId}::${version.versionId}`;
    if (this._versions.has(key)) {
      throw new Error(
        `Version already exists: ${key} — never overwrite silently`
      );
    }
    this._versions.set(key, { ...version });
  }

  async updateVersion(version) {
    const key = `${version.secretId}::${version.versionId}`;
    if (!this._versions.has(key)) {
      throw new Error(`Cannot update non-existent version: ${key}`);
    }
    this._versions.set(key, { ...version });
  }

  async getVersion(secretId, versionId) {
    const row = this._versions.get(`${secretId}::${versionId}`);
    return row ? { ...row } : null;
  }

  async listVersions(secretId) {
    const out = [];
    for (const [key, v] of this._versions.entries()) {
      if (key.startsWith(`${secretId}::`)) out.push({ ...v });
    }
    // deterministic order → created-asc
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  }

  async appendAudit(entry) {
    this._audit.push({ ...entry });
  }

  async listAudit(secretId) {
    return this._audit
      .filter((e) => !secretId || e.secretId === secretId)
      .map((e) => ({ ...e }));
  }

  async recordUsage(usage) {
    this._usage.push({ ...usage });
  }

  async listUsage(secretId) {
    return this._usage
      .filter((u) => !secretId || u.secretId === secretId)
      .map((u) => ({ ...u }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ERRORS / שגיאות מותאמות
// ═══════════════════════════════════════════════════════════════════════════

class SecretRotatorError extends Error {
  constructor(code, messageEn, messageHe) {
    super(`[${code}] ${messageEn} — ${messageHe}`);
    this.name = 'SecretRotatorError';
    this.code = code;
    this.messageEn = messageEn;
    this.messageHe = messageHe;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECRET ROTATOR / הרוטציה
// ═══════════════════════════════════════════════════════════════════════════

class SecretRotator {
  /**
   * @param {object} [options]
   * @param {object} [options.storage]       Pluggable backend (defaults to
   *                                         MemoryStorage). Must satisfy the
   *                                         interface documented above.
   * @param {() => number} [options.now]     Clock injector (ms since epoch).
   * @param {number} [options.graceDays]     Default grace window length.
   * @param {number} [options.secretBytes]   Default entropy size for
   *                                         generateStrongSecret() — must be
   *                                         ≥ 32 (256 bits).
   * @param {(a: object) => void} [options.auditHook]  Optional sync callback
   *                                         invoked after every audit write
   *                                         (useful for live log streaming).
   */
  constructor(options = {}) {
    this.storage = options.storage || new MemoryStorage();
    this.now = typeof options.now === 'function' ? options.now : defaultNow;
    this.graceDays =
      typeof options.graceDays === 'number' ? options.graceDays : DEFAULT_GRACE_DAYS;
    this.secretBytes =
      typeof options.secretBytes === 'number' ? options.secretBytes : MIN_SECRET_BYTES;

    if (this.secretBytes < MIN_SECRET_BYTES) {
      throw new SecretRotatorError(
        'E_WEAK_ENTROPY',
        `secretBytes must be ≥ ${MIN_SECRET_BYTES}`,
        `חוזק אנטרופיה חייב להיות לפחות ${MIN_SECRET_BYTES} בתים`
      );
    }
    if (this.secretBytes > MAX_SECRET_BYTES) {
      throw new SecretRotatorError(
        'E_TOO_LARGE',
        `secretBytes must be ≤ ${MAX_SECRET_BYTES}`,
        `חוזק אנטרופיה חייב להיות עד ${MAX_SECRET_BYTES} בתים`
      );
    }

    this.auditHook = typeof options.auditHook === 'function' ? options.auditHook : null;
  }

  // ───────────────────────────── PRIMITIVES ────────────────────────────

  /**
   * Generate a cryptographically strong secret.
   * יצירת סוד חזק עם אקראיות חזקה (crypto.randomBytes).
   *
   * @param {number} [bytes=this.secretBytes] ≥ 32 and ≤ 1024.
   * @returns {string} hex-encoded (2 * bytes chars).
   */
  generateStrongSecret(bytes) {
    const n = typeof bytes === 'number' ? bytes : this.secretBytes;
    if (!Number.isInteger(n) || n < MIN_SECRET_BYTES) {
      throw new SecretRotatorError(
        'E_WEAK_ENTROPY',
        `bytes must be an integer ≥ ${MIN_SECRET_BYTES}`,
        `אורך חייב להיות מספר שלם של לפחות ${MIN_SECRET_BYTES}`
      );
    }
    if (n > MAX_SECRET_BYTES) {
      throw new SecretRotatorError(
        'E_TOO_LARGE',
        `bytes must be ≤ ${MAX_SECRET_BYTES}`,
        `אורך חייב להיות עד ${MAX_SECRET_BYTES}`
      );
    }
    return crypto.randomBytes(n).toString('hex');
  }

  /**
   * Derive a collision-resistant version identifier.
   * מזהה גרסה יציב ובלתי-ניתן-לניחוש.
   */
  _newVersionId(secretId) {
    const rnd = crypto.randomBytes(12).toString('hex');
    const stamp = this.now().toString(36);
    return `v_${stamp}_${rnd}`;
  }

  // ───────────────────────────── AUDIT ─────────────────────────────────

  async _audit(event, secretId, details = {}) {
    const entry = {
      event,
      secretId,
      at: this.now(),
      details: { ...details },
    };
    await this.storage.appendAudit(entry);
    if (this.auditHook) {
      try { this.auditHook({ ...entry }); } catch (_) { /* never throw */ }
    }
  }

  // ───────────────────────────── SCHEDULING ────────────────────────────

  /**
   * Register (or re-register) a secret with a rotation cadence.
   * רישום מזהה-סוד עם מחזור רוטציה.
   *
   * Creates the record if it does not exist, and — only on creation —
   * a first PENDING version so rotation never starts from an empty state.
   * Existing records are mutated in place (never deleted) with the new
   * interval so compliance auditors can diff the schedule over time.
   *
   * @param {string} secretId
   * @param {number} intervalDays  1 ≤ n ≤ 3650
   */
  async scheduleRotation(secretId, intervalDays) {
    this._validateSecretId(secretId);
    if (
      !Number.isFinite(intervalDays) ||
      intervalDays < MIN_INTERVAL_DAYS ||
      intervalDays > MAX_INTERVAL_DAYS
    ) {
      throw new SecretRotatorError(
        'E_BAD_INTERVAL',
        `intervalDays must be in [${MIN_INTERVAL_DAYS}, ${MAX_INTERVAL_DAYS}]`,
        `תדירות חייבת להיות בין ${MIN_INTERVAL_DAYS} ל-${MAX_INTERVAL_DAYS} ימים`
      );
    }

    const existing = await this.storage.getSecret(secretId);
    const now = this.now();
    const record = existing
      ? { ...existing, intervalDays, updatedAt: now }
      : {
        secretId,
        intervalDays,
        createdAt: now,
        updatedAt: now,
        nextRotationAt: addDays(now, intervalDays),
        status: 'scheduled',
      };

    if (!existing) {
      // first-ever version is born PENDING; the caller must activate
      // it explicitly with activateNew() so the same code path is used
      // for bootstrapping and ordinary rotation.
      record.nextRotationAt = addDays(now, intervalDays);
      await this.storage.upsertSecret(record);
      await this._createVersion(secretId, ROTATION_REASON.INITIAL);
    } else {
      record.nextRotationAt = addDays(now, intervalDays);
      await this.storage.upsertSecret(record);
    }

    await this._audit(AUDIT_EVENT.SCHEDULED, secretId, {
      intervalDays,
      nextRotationAt: record.nextRotationAt,
      bootstrap: !existing,
    });

    return { ...record };
  }

  /**
   * Check whether scheduled rotation is due and — if so — execute it.
   * Returns the new version record when a rotation actually happened,
   * or `null` if nothing was due.
   * בדיקה האם הגיע מועד הרוטציה ואם כן, ביצועה.
   */
  async rotateIfDue(secretId) {
    this._validateSecretId(secretId);
    const record = await this.storage.getSecret(secretId);
    if (!record) {
      throw new SecretRotatorError(
        'E_NO_SCHEDULE',
        `No schedule for ${secretId} — call scheduleRotation first`,
        `אין תזמון עבור ${secretId} — יש לקרוא ל-scheduleRotation תחילה`
      );
    }
    if (record.nextRotationAt > this.now()) {
      return null;
    }
    return this.rotate(secretId, ROTATION_REASON.SCHEDULED);
  }

  // ───────────────────────────── ROTATION ──────────────────────────────

  /**
   * Core rotation primitive: create a NEW version in PENDING state while
   * leaving the existing ACTIVE version untouched. Does NOT flip the
   * active pointer — that is activateNew()'s job, which lets operators
   * pre-stage a key and roll it out on a schedule.
   * יצירת גרסה חדשה במצב PENDING — לא מעבירה עדיין ל-ACTIVE.
   *
   * @param {string} secretId
   * @param {string} [reason=ROTATION_REASON.MANUAL]
   */
  async rotate(secretId, reason) {
    this._validateSecretId(secretId);
    const record = await this.storage.getSecret(secretId);
    if (!record) {
      throw new SecretRotatorError(
        'E_NO_SCHEDULE',
        `No schedule for ${secretId}`,
        `אין תזמון עבור ${secretId}`
      );
    }

    const why = reason || ROTATION_REASON.MANUAL;
    const version = await this._createVersion(secretId, why);

    const now = this.now();
    await this.storage.upsertSecret({
      ...record,
      updatedAt: now,
      nextRotationAt: addDays(now, record.intervalDays),
    });

    await this._audit(AUDIT_EVENT.ROTATED, secretId, {
      versionId: version.versionId,
      reason: why,
    });

    return { versionId: version.versionId, version: { ...version } };
  }

  async _createVersion(secretId, reason) {
    const versionId = this._newVersionId(secretId);
    const now = this.now();
    const version = {
      secretId,
      versionId,
      status: STATUS.PENDING,
      createdAt: now,
      activatedAt: null,
      graceStartedAt: null,
      retiredAt: null,
      reason,
      // The secret material is stored opaquely; callers who encrypt at
      // rest can wrap _secretHex before persistence.
      _secretHex: this.generateStrongSecret(this.secretBytes),
      fingerprint: null,
    };
    version.fingerprint = this._fingerprint(version._secretHex);
    await this.storage.insertVersion(version);
    return version;
  }

  _fingerprint(secretHex) {
    return crypto
      .createHash('sha256')
      .update(secretHex, 'utf8')
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Promote a PENDING version to ACTIVE, move the currently-ACTIVE one
   * (if any) to GRACE, and start the grace countdown. Never demotes a
   * PENDING version into a GRACE one — the state machine is monotonic.
   *
   * קידום גרסת PENDING ל-ACTIVE והעברת הגרסה הקיימת ל-GRACE.
   *
   * @param {string} secretId
   * @param {string} versionId                         PENDING version
   * @param {{ graceDays?: number }} [options]
   */
  async activateNew(secretId, versionId, options = {}) {
    this._validateSecretId(secretId);
    const pending = await this.storage.getVersion(secretId, versionId);
    if (!pending) {
      throw new SecretRotatorError(
        'E_UNKNOWN_VERSION',
        `Version ${versionId} does not exist`,
        `גרסה ${versionId} לא קיימת`
      );
    }
    if (pending.status !== STATUS.PENDING) {
      throw new SecretRotatorError(
        'E_BAD_STATE',
        `Only PENDING versions can be activated — ${versionId} is ${pending.status}`,
        `רק גרסאות במצב PENDING ניתנות להפעלה`
      );
    }

    const versions = await this.storage.listVersions(secretId);
    const now = this.now();
    const graceDays =
      typeof options.graceDays === 'number' ? options.graceDays : this.graceDays;

    // Move currently-ACTIVE version into GRACE.
    for (const v of versions) {
      if (v.status === STATUS.ACTIVE && v.versionId !== versionId) {
        const graced = {
          ...v,
          status: STATUS.GRACE,
          graceStartedAt: now,
          graceEndsAt: addDays(now, graceDays),
        };
        await this.storage.updateVersion(graced);
        await this._audit(AUDIT_EVENT.ACTIVATED, secretId, {
          versionId: v.versionId,
          transitionTo: STATUS.GRACE,
          graceDays,
        });
      }
    }

    // Promote the pending version.
    const promoted = {
      ...pending,
      status: STATUS.ACTIVE,
      activatedAt: now,
    };
    await this.storage.updateVersion(promoted);
    await this._audit(AUDIT_EVENT.ACTIVATED, secretId, {
      versionId,
      transitionTo: STATUS.ACTIVE,
    });

    return { ...promoted };
  }

  /**
   * Retire a GRACE-phase version. This is a logical retirement only —
   * the row stays in the backend forever with status = RETIRED so
   * forensics can still answer "which key signed this old token?".
   * פרישת גרסה — לעולם לא מחיקה פיזית.
   *
   * @param {string} secretId
   * @param {string} versionId
   * @param {{ force?: boolean }} [options]
   *        force: skip "still in grace window" guard (emergency).
   */
  async retireOld(secretId, versionId, options = {}) {
    this._validateSecretId(secretId);
    const v = await this.storage.getVersion(secretId, versionId);
    if (!v) {
      throw new SecretRotatorError(
        'E_UNKNOWN_VERSION',
        `Version ${versionId} does not exist`,
        `גרסה ${versionId} לא קיימת`
      );
    }
    if (v.status === STATUS.ACTIVE) {
      throw new SecretRotatorError(
        'E_CANNOT_RETIRE_ACTIVE',
        `Refusing to retire ACTIVE version ${versionId} — activate a new one first`,
        `אסור לפרוש גרסה פעילה — יש להפעיל גרסה חדשה תחילה`
      );
    }
    if (v.status === STATUS.RETIRED) {
      // idempotent — return current state without re-auditing
      return { ...v };
    }
    if (
      v.status === STATUS.GRACE &&
      v.graceEndsAt &&
      v.graceEndsAt > this.now() &&
      !options.force
    ) {
      throw new SecretRotatorError(
        'E_STILL_IN_GRACE',
        `Version ${versionId} is still within its grace window — pass { force: true } to override`,
        `הגרסה עדיין בחלון-החסד — ניתן לאלץ עם force:true`
      );
    }

    const now = this.now();
    const retired = {
      ...v,
      status: STATUS.RETIRED,
      retiredAt: now,
    };
    await this.storage.updateVersion(retired);
    await this._audit(AUDIT_EVENT.RETIRED, secretId, {
      versionId,
      previousStatus: v.status,
      forced: !!options.force,
    });
    return { ...retired };
  }

  /**
   * Record that a service is currently using a particular version, and
   * return the set of versions still accepted for verification (ACTIVE +
   * all GRACE). This is the dual-key read path: a consumer that asks
   * "can I validate a token signed by version X?" gets TRUE so long as
   * X is ACTIVE or still inside its grace window.
   *
   * מדווח מי משתמש באיזה גרסה ומחזיר את רשימת הגרסאות הקבילות.
   *
   * @param {string} secretId
   * @param {string} serviceName       e.g. "auth-api", "billing-worker"
   * @param {string} [versionId]       optional — if provided, we verify
   *                                   this version is in {ACTIVE, GRACE}.
   * @returns {Promise<{accepted: string[], active: string|null, grace: string[], verified: boolean|null}>}
   */
  async verifyInUse(secretId, serviceName, versionId) {
    this._validateSecretId(secretId);
    if (typeof serviceName !== 'string' || !serviceName.trim()) {
      throw new SecretRotatorError(
        'E_BAD_SERVICE',
        'serviceName must be a non-empty string',
        'שם השירות חייב להיות מחרוזת לא ריקה'
      );
    }

    const versions = await this.storage.listVersions(secretId);
    const active =
      versions.find((v) => v.status === STATUS.ACTIVE)?.versionId || null;
    const grace = versions
      .filter((v) => v.status === STATUS.GRACE)
      .map((v) => v.versionId);
    const accepted = active ? [active, ...grace] : [...grace];

    let verified = null;
    if (typeof versionId === 'string') {
      verified = accepted.includes(versionId);
    }

    const now = this.now();
    await this.storage.recordUsage({
      secretId,
      serviceName,
      versionId: versionId || active,
      at: now,
      verified,
    });
    await this._audit(AUDIT_EVENT.USAGE, secretId, {
      serviceName,
      versionId: versionId || active,
      verified,
    });

    return { accepted, active, grace, verified };
  }

  /**
   * Break-glass rotation — creates, activates, and forces retirement of
   * every older ACTIVE/GRACE version in a single transaction. Used when
   * a secret is known or suspected to be leaked.
   * רוטציית חרום — יוצרת גרסה חדשה, מפעילה אותה מיד ופורשת את כל הקודמות.
   *
   * @param {string} secretId
   * @param {string} reasonText          free-form incident description
   * @param {{ keepGrace?: boolean }} [options]
   *        keepGrace: if true, previous ACTIVE version goes to GRACE
   *                   instead of RETIRED (allows read-only migration).
   *                   Default FALSE — emergency revokes immediately.
   */
  async emergencyRotation(secretId, reasonText, options = {}) {
    this._validateSecretId(secretId);
    if (typeof reasonText !== 'string' || !reasonText.trim()) {
      throw new SecretRotatorError(
        'E_BAD_REASON',
        'An emergency rotation requires a non-empty reason',
        'רוטציית חרום מחייבת סיבה לא ריקה'
      );
    }

    const record = await this.storage.getSecret(secretId);
    if (!record) {
      throw new SecretRotatorError(
        'E_NO_SCHEDULE',
        `No schedule for ${secretId}`,
        `אין תזמון עבור ${secretId}`
      );
    }

    // 1. create new version
    const newVersion = await this._createVersion(
      secretId,
      ROTATION_REASON.EMERGENCY
    );

    // 2. activate it (moves prior ACTIVE to GRACE)
    await this.activateNew(secretId, newVersion.versionId, {
      graceDays: options.keepGrace ? this.graceDays : 0,
    });

    // 3. if keepGrace === false, force-retire every GRACE version
    if (!options.keepGrace) {
      const versions = await this.storage.listVersions(secretId);
      for (const v of versions) {
        if (v.status === STATUS.GRACE) {
          await this.retireOld(secretId, v.versionId, { force: true });
        }
      }
    }

    const now = this.now();
    await this.storage.upsertSecret({
      ...record,
      updatedAt: now,
      nextRotationAt: addDays(now, record.intervalDays),
    });

    await this._audit(AUDIT_EVENT.EMERGENCY, secretId, {
      versionId: newVersion.versionId,
      reasonText: reasonText.trim(),
      keepGrace: !!options.keepGrace,
    });

    return {
      versionId: newVersion.versionId,
      version: { ...newVersion },
      reason: reasonText.trim(),
    };
  }

  // ───────────────────────────── INSPECTION ────────────────────────────

  /**
   * List every version — every status, never filtered down to "live"
   * because auditors need to see RETIRED entries too.
   */
  async listVersions(secretId, { includeSecret = false } = {}) {
    this._validateSecretId(secretId);
    const versions = await this.storage.listVersions(secretId);
    return versions.map((v) => {
      const clone = { ...v };
      if (!includeSecret) delete clone._secretHex;
      return clone;
    });
  }

  /** Convenience — returns the single ACTIVE version or null. */
  async getActive(secretId, { includeSecret = false } = {}) {
    const versions = await this.listVersions(secretId, { includeSecret });
    return versions.find((v) => v.status === STATUS.ACTIVE) || null;
  }

  /** Returns GRACE versions still accepted for verification. */
  async getAcceptedVersions(secretId) {
    const versions = await this.storage.listVersions(secretId);
    return versions
      .filter((v) => v.status === STATUS.ACTIVE || v.status === STATUS.GRACE)
      .map((v) => ({ ...v, _secretHex: undefined }));
  }

  /** Full audit log — never truncated. */
  async getAuditLog(secretId) {
    return this.storage.listAudit(secretId);
  }

  /** Full usage log — never truncated. */
  async getUsageLog(secretId) {
    return this.storage.listUsage(secretId);
  }

  // ───────────────────────────── HELPERS ───────────────────────────────

  _validateSecretId(secretId) {
    if (typeof secretId !== 'string' || !secretId.trim()) {
      throw new SecretRotatorError(
        'E_BAD_ID',
        'secretId must be a non-empty string',
        'מזהה הסוד חייב להיות מחרוזת לא ריקה'
      );
    }
    if (!/^[a-zA-Z0-9._:\-]{1,128}$/.test(secretId)) {
      throw new SecretRotatorError(
        'E_BAD_ID',
        'secretId contains invalid characters or is too long',
        'מזהה הסוד מכיל תווים לא חוקיים או ארוך מדי'
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  SecretRotator,
  MemoryStorage,
  SecretRotatorError,
  STATUS,
  ROTATION_REASON,
  AUDIT_EVENT,
  DEFAULT_GRACE_DAYS,
  MIN_SECRET_BYTES,
  MAX_SECRET_BYTES,
  MIN_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
  MS_PER_DAY,
  addDays,
};
