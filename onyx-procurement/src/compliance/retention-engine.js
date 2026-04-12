/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Retention Engine — מנוע שימור רשומות ביקורת
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-149  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / compliance / retention-engine.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Enforce per-category retention periods required by Israeli law for
 *  audit-log and business records. The core invariant of the Techno-Kol
 *  Uzi platform is   "לא מוחקים — רק משדרגים ומגדלים"
 *  ("We do not delete — we only upgrade and grow").
 *
 *  For regulated audit logs this is reconciled as follows:
 *    retention expiry  =>  soft-archive + segregate  (move to cold storage)
 *    retention expiry  !=  hard delete of production data
 *
 *  Nothing is ever `DELETE FROM …` — an archive event is emitted and the
 *  receiving cold-storage pipeline is responsible for taking its own copy.
 *  The production row is then flagged `archived=true` and moved to the
 *  "cold" partition.
 *
 *  Zero external dependencies (only `node:crypto` + `node:events`).
 *  Hebrew RTL and bilingual (HE / EN) labels on every artefact.
 *
 *  Retention matrix (Israeli law)
 *  ------------------------------
 *    financial        |  7 y   | פקודת מס הכנסה / חוק מע״מ
 *    employment       |  7 y   | חוק שעות עבודה ומנוחה (from termination)
 *    aml              |  7 y   | חוק איסור הלבנת הון
 *    privacy          |  7 y   | חוק הגנת הפרטיות (PDPL) — per purpose
 *    contracts        |  7 y   | post-expiry
 *    medical          | 10 y   | חוק זכויות החולה
 *    construction     | 25 y   | חוק המכר (דירות) — אחריות קבלן
 *    tax_audit        | 10 y   | התכתבויות ביקורת מס
 *
 *  Class API
 *  ---------
 *    new RetentionEngine({ now?, coldStoreStream? })
 *    engine.categorize(record)          → { category, labels }
 *    engine.computeExpiryDate(record)   → Date   (null if on legal hold)
 *    engine.scanDue(now?)               → Array<DueRecord>
 *    engine.archiveBatch(records)       → Array<ArchiveEvent>
 *    engine.holdOverride(id, reason)    → void   (legal hold — retention is
 *                                                  paused indefinitely)
 *    engine.releaseHold(id, reason)
 *    engine.bilingualReport()           → { he, en, hash }
 *    engine.verifyChain()               → boolean
 *    engine.decisions                   → immutable list of decisions
 *                                         (SHA-256 chain of every action)
 *
 *  Immutable audit trail
 *  ---------------------
 *  Every decision the engine makes (categorize / archive / hold / release)
 *  is appended to an in-memory list and chained by SHA-256:
 *
 *     prevHash ─────────────┐
 *                           ▼
 *     ┌─────────────────────────────┐
 *     │  decision N                 │
 *     │  hash = SHA256(prev || N)   │
 *     └─────────────────────────────┘
 *
 *  `verifyChain()` walks the list top-down and returns `false` if any link
 *  has been tampered with. The chain itself is never pruned, even by the
 *  engine's own retention logic — the retention log is retained forever
 *  (this is the "growing" half of "לא מוחקים, רק משדרגים ומגדלים").
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

// ───────────────────────────────────────────────────────────────────────────
// Retention matrix — exported for auditors / tests
// ───────────────────────────────────────────────────────────────────────────

const RETENTION_MATRIX = Object.freeze({
  financial: {
    years: 7,
    he: 'רשומות פיננסיות ומסים',
    en: 'Financial / tax records',
    law_he: 'פקודת מס הכנסה וחוק מע״מ',
    law_en: 'Income Tax Ordinance & VAT Law',
    anchor: 'created_at',
  },
  employment: {
    years: 7,
    he: 'רשומות עובדים',
    en: 'Employment records',
    law_he: 'חוק שעות עבודה ומנוחה',
    law_en: 'Work Hours & Rest Law',
    anchor: 'termination_date',
  },
  aml: {
    years: 7,
    he: 'רשומות איסור הלבנת הון',
    en: 'AML records',
    law_he: 'חוק איסור הלבנת הון התש״ס-2000',
    law_en: 'Prohibition on Money Laundering Law',
    anchor: 'transaction_date',
  },
  privacy: {
    years: 7,
    he: 'נתוני פרטיות (PDPL)',
    en: 'Privacy data (PDPL)',
    law_he: 'חוק הגנת הפרטיות',
    law_en: 'Protection of Privacy Law',
    anchor: 'purpose_end_date',
  },
  contracts: {
    years: 7,
    he: 'חוזים',
    en: 'Contracts',
    law_he: 'חוק ההתיישנות',
    law_en: 'Statute of Limitations',
    anchor: 'expiry_date',
  },
  medical: {
    years: 10,
    he: 'רשומות רפואיות / ביטוח בריאות',
    en: 'Medical / health insurance',
    law_he: 'חוק זכויות החולה',
    law_en: "Patient's Rights Law",
    anchor: 'created_at',
  },
  construction: {
    years: 25,
    he: 'רשומות בנייה (אחריות קבלן)',
    en: 'Construction (contractor liability)',
    law_he: 'חוק המכר (דירות)',
    law_en: 'Sale of Apartments Law',
    anchor: 'handover_date',
  },
  tax_audit: {
    years: 10,
    he: 'התכתבות ביקורת מס',
    en: 'Tax-audit correspondence',
    law_he: 'פקודת מס הכנסה — סעיפי התיישנות ביקורת',
    law_en: 'Income Tax Ordinance — audit-statute sections',
    anchor: 'created_at',
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Categoriser — heuristic map from record.type/tags → retention category
// ───────────────────────────────────────────────────────────────────────────

const TYPE_TO_CATEGORY = Object.freeze({
  // financial
  invoice: 'financial',
  receipt: 'financial',
  journal: 'financial',
  vat_report: 'financial',
  tax_return: 'financial',
  general_ledger: 'financial',
  // employment
  payroll: 'employment',
  employee_file: 'employment',
  timesheet: 'employment',
  termination_letter: 'employment',
  pension_slip: 'employment',
  // aml
  aml_alert: 'aml',
  kyc: 'aml',
  large_cash_transaction: 'aml',
  sar: 'aml',
  // privacy
  consent_record: 'privacy',
  dsr: 'privacy',
  personal_data: 'privacy',
  // contracts
  contract: 'contracts',
  framework_agreement: 'contracts',
  sla: 'contracts',
  nda: 'contracts',
  // medical
  medical_file: 'medical',
  health_insurance: 'medical',
  work_injury: 'medical',
  // construction
  building_permit: 'construction',
  structural_calc: 'construction',
  handover_protocol: 'construction',
  construction_contract: 'construction',
  // tax audit
  tax_audit_letter: 'tax_audit',
  assessor_correspondence: 'tax_audit',
});

// ───────────────────────────────────────────────────────────────────────────
// Small helpers
// ───────────────────────────────────────────────────────────────────────────

function toDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function stableStringify(value) {
  // Deterministic JSON for hashing — keys sorted recursively
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
      .join(',') +
    '}'
  );
}

// ───────────────────────────────────────────────────────────────────────────
// RetentionEngine
// ───────────────────────────────────────────────────────────────────────────

class RetentionEngine extends EventEmitter {
  /**
   * @param {{ now?: Date }} [opts]
   */
  constructor(opts = {}) {
    super();
    this._now = () => (opts.now instanceof Date ? opts.now : new Date());
    this._records = new Map(); // id → record
    this._holds = new Map(); // id → { reason, placedAt }
    this._decisions = []; // immutable append-only chain
    this._seedGenesisBlock();
  }

  // ── Chain primitives ─────────────────────────────────────────────────────

  _seedGenesisBlock() {
    const genesis = {
      seq: 0,
      action: 'genesis',
      timestamp: this._now().toISOString(),
      payload: { engine: 'RetentionEngine', law: 'Israeli retention matrix' },
      prevHash:
        '0000000000000000000000000000000000000000000000000000000000000000',
    };
    genesis.hash = sha256Hex(stableStringify(genesis));
    this._decisions.push(Object.freeze(genesis));
  }

  _appendDecision(action, payload) {
    const prev = this._decisions[this._decisions.length - 1];
    const entry = {
      seq: prev.seq + 1,
      action,
      timestamp: this._now().toISOString(),
      payload,
      prevHash: prev.hash,
    };
    entry.hash = sha256Hex(stableStringify(entry));
    const frozen = Object.freeze({ ...entry, payload: Object.freeze(payload) });
    this._decisions.push(frozen);
    return frozen;
  }

  /**
   * Read-only snapshot of the immutable decision chain.
   */
  get decisions() {
    return this._decisions.slice();
  }

  /**
   * Walk the chain top-down and verify each hash link.
   * @returns {boolean}
   */
  verifyChain() {
    for (let i = 0; i < this._decisions.length; i += 1) {
      const d = this._decisions[i];
      const { hash, ...rest } = d;
      const recomputed = sha256Hex(stableStringify(rest));
      if (recomputed !== hash) return false;
      if (i > 0 && this._decisions[i - 1].hash !== d.prevHash) return false;
    }
    return true;
  }

  // ── Record ingestion ─────────────────────────────────────────────────────

  /**
   * Register a record with the engine so it can be scanned for retention.
   * Idempotent — re-registering updates the in-memory copy.
   * @param {object} record
   */
  register(record) {
    if (!record || typeof record !== 'object') {
      throw new TypeError('record must be an object');
    }
    if (!record.id) throw new TypeError('record.id is required');
    this._records.set(record.id, { ...record });
    this._appendDecision('register', { id: record.id, type: record.type ?? null });
    return this._records.get(record.id);
  }

  // ── Categorisation ───────────────────────────────────────────────────────

  /**
   * Determine the retention category for a record.
   * Order of precedence:
   *   1) explicit record.category
   *   2) TYPE_TO_CATEGORY[record.type]
   *   3) tag match against known category names
   *   4) fallback → "privacy" (safest — shortest default window 7y)
   *
   * @param {object} record
   * @returns {{category:string, labels:{he:string,en:string}, law:{he:string,en:string}, years:number}}
   */
  categorize(record) {
    if (!record || typeof record !== 'object') {
      throw new TypeError('record must be an object');
    }
    let category = null;

    if (record.category && RETENTION_MATRIX[record.category]) {
      category = record.category;
    } else if (record.type && TYPE_TO_CATEGORY[record.type]) {
      category = TYPE_TO_CATEGORY[record.type];
    } else if (Array.isArray(record.tags)) {
      for (const tag of record.tags) {
        if (RETENTION_MATRIX[tag]) {
          category = tag;
          break;
        }
        if (TYPE_TO_CATEGORY[tag]) {
          category = TYPE_TO_CATEGORY[tag];
          break;
        }
      }
    }
    if (!category) category = 'privacy';

    const entry = RETENTION_MATRIX[category];
    return {
      category,
      years: entry.years,
      labels: { he: entry.he, en: entry.en },
      law: { he: entry.law_he, en: entry.law_en },
      anchor: entry.anchor,
    };
  }

  // ── Expiry computation ───────────────────────────────────────────────────

  /**
   * Compute the expiry date of a record. A record on legal hold returns
   * `null` — retention is paused indefinitely.
   *
   * @param {object} record
   * @returns {Date|null}
   */
  computeExpiryDate(record) {
    if (record && record.id && this._holds.has(record.id)) return null;

    const cat = this.categorize(record);
    const matrix = RETENTION_MATRIX[cat.category];

    const anchorValue =
      record[matrix.anchor] ??
      record.created_at ??
      record.createdAt ??
      record.date ??
      null;

    const anchor = toDate(anchorValue);
    if (!anchor) {
      throw new Error(
        `Cannot compute expiry: missing anchor "${matrix.anchor}" on record ${record.id}`
      );
    }
    return addYears(anchor, matrix.years);
  }

  // ── Scanning ─────────────────────────────────────────────────────────────

  /**
   * Return every registered record whose retention period has expired as
   * of `asOf` (defaults to the engine's clock). Records on legal hold are
   * excluded.
   *
   * @param {Date} [asOf]
   * @returns {Array<{record:object, expiry:Date, category:string, labels:object}>}
   */
  scanDue(asOf) {
    const now = toDate(asOf) || this._now();
    const due = [];
    for (const record of this._records.values()) {
      if (this._holds.has(record.id)) continue;
      let expiry;
      try {
        expiry = this.computeExpiryDate(record);
      } catch {
        continue; // skip malformed
      }
      if (!expiry) continue;
      if (expiry.getTime() <= now.getTime()) {
        const cat = this.categorize(record);
        due.push({
          record,
          expiry,
          category: cat.category,
          labels: cat.labels,
          law: cat.law,
        });
      }
    }
    this._appendDecision('scan_due', {
      asOf: now.toISOString(),
      count: due.length,
      ids: due.map((d) => d.record.id),
    });
    return due;
  }

  // ── Archival (soft — NEVER hard delete) ──────────────────────────────────

  /**
   * Archive a batch of records: emit an `archive` event per record and
   * append an immutable decision. The production row is only *flagged*
   * `archived=true` — never removed.
   *
   * @param {Array<object>} records
   * @returns {Array<{id:string, action:string, to:string, hash:string}>}
   */
  archiveBatch(records) {
    if (!Array.isArray(records)) {
      throw new TypeError('archiveBatch expects an array');
    }
    const events = [];
    for (const rec of records) {
      if (!rec || !rec.id) continue;
      if (this._holds.has(rec.id)) {
        // Legal hold wins — skip and log it
        this._appendDecision('archive_blocked_by_hold', { id: rec.id });
        continue;
      }
      const cat = this.categorize(rec);
      const event = {
        id: rec.id,
        action: 'soft_archive',
        to: 'cold_storage',
        at: this._now().toISOString(),
        category: cat.category,
        labels: cat.labels,
        law: cat.law,
        hard_deleted: false,
      };
      // Flag production row — non-destructive
      if (this._records.has(rec.id)) {
        const stored = this._records.get(rec.id);
        stored.archived = true;
        stored.archived_at = event.at;
        this._records.set(rec.id, stored);
      }
      const decision = this._appendDecision('archive', event);
      const emitted = { ...event, hash: decision.hash };
      this.emit('archive', emitted);
      events.push(emitted);
    }
    return events;
  }

  // ── Legal holds ──────────────────────────────────────────────────────────

  /**
   * Place a legal hold on a record. A legal hold freezes retention —
   * scanDue() will ignore the record and computeExpiryDate() returns
   * null until the hold is released.
   *
   * @param {string} id
   * @param {string} reason
   */
  holdOverride(id, reason) {
    if (!id) throw new TypeError('id is required');
    if (!reason || typeof reason !== 'string') {
      throw new TypeError('reason is required');
    }
    this._holds.set(id, { reason, placedAt: this._now().toISOString() });
    this._appendDecision('legal_hold_placed', { id, reason });
  }

  /**
   * Release a legal hold previously placed via holdOverride().
   * @param {string} id
   * @param {string} reason
   */
  releaseHold(id, reason) {
    if (!this._holds.has(id)) return false;
    this._holds.delete(id);
    this._appendDecision('legal_hold_released', { id, reason: reason || '' });
    return true;
  }

  /**
   * Returns the list of record-ids currently on legal hold.
   */
  get holds() {
    return Array.from(this._holds.entries()).map(([id, meta]) => ({
      id,
      ...meta,
    }));
  }

  // ── Bilingual report ─────────────────────────────────────────────────────

  /**
   * Produce a bilingual human-readable report of retention state and
   * include a SHA-256 seal over the chain's tip.
   *
   * @returns {{he:string, en:string, hash:string, generatedAt:string}}
   */
  bilingualReport() {
    const now = this._now();
    const byCategory = new Map();

    for (const record of this._records.values()) {
      const cat = this.categorize(record);
      const bucket = byCategory.get(cat.category) || {
        total: 0,
        archived: 0,
        onHold: 0,
        labels: cat.labels,
        law: cat.law,
        years: cat.years,
      };
      bucket.total += 1;
      if (record.archived) bucket.archived += 1;
      if (this._holds.has(record.id)) bucket.onHold += 1;
      byCategory.set(cat.category, bucket);
    }

    const tip = this._decisions[this._decisions.length - 1];

    // ── Hebrew (RTL) ───────────────────────────────────────────────
    const heLines = [];
    heLines.push('\u202Bדו״ח שימור רשומות — מערכת Techno-Kol Uzi');
    heLines.push(`\u202Bתאריך הפקה: ${now.toISOString()}`);
    heLines.push('\u202B──────────────────────────────────────────────');
    for (const [cat, b] of byCategory.entries()) {
      heLines.push(
        `\u202B• [${cat}] ${b.labels.he} — תקופת שימור ${b.years} שנים`
      );
      heLines.push(`\u202B  חוק: ${b.law.he}`);
      heLines.push(
        `\u202B  סה״כ: ${b.total} | בארכיון: ${b.archived} | בעיכוב משפטי: ${b.onHold}`
      );
    }
    heLines.push('\u202B──────────────────────────────────────────────');
    heLines.push(`\u202Bחתימה (SHA-256 tip): ${tip.hash}`);
    heLines.push(`\u202Bבלוקים בשרשרת: ${this._decisions.length}`);
    heLines.push(
      '\u202Bכלל: "לא מוחקים — רק משדרגים ומגדלים". גיבוי לארכיון קר בלבד.'
    );

    // ── English ────────────────────────────────────────────────────
    const enLines = [];
    enLines.push('Retention Report — Techno-Kol Uzi ERP');
    enLines.push(`Generated at: ${now.toISOString()}`);
    enLines.push('----------------------------------------------');
    for (const [cat, b] of byCategory.entries()) {
      enLines.push(`- [${cat}] ${b.labels.en} — retention ${b.years} years`);
      enLines.push(`  Law: ${b.law.en}`);
      enLines.push(
        `  Total: ${b.total} | Archived: ${b.archived} | Legal hold: ${b.onHold}`
      );
    }
    enLines.push('----------------------------------------------');
    enLines.push(`Chain tip SHA-256: ${tip.hash}`);
    enLines.push(`Chain length: ${this._decisions.length}`);
    enLines.push(
      'Policy: never hard-delete. Expired records are soft-archived to cold storage.'
    );

    const he = heLines.join('\n');
    const en = enLines.join('\n');
    const hash = sha256Hex(he + '\n' + en);
    return { he, en, hash, generatedAt: now.toISOString() };
  }

  // ── Introspection helpers (tests & admin) ────────────────────────────────

  get size() {
    return this._records.size;
  }

  getRecord(id) {
    return this._records.get(id) || null;
  }
}

module.exports = {
  RetentionEngine,
  RETENTION_MATRIX,
  TYPE_TO_CATEGORY,
};
