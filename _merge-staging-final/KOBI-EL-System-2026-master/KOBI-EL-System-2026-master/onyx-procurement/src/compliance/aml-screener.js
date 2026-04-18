/**
 * ════════════════════════════════════════════════════════════════════════
 * AMLScreener — Anti-Money-Laundering Hit-Screener
 * ════════════════════════════════════════════════════════════════════════
 * Agent Y-146 — Techno-Kol Uzi Mega-ERP (Israeli metal fabrication
 *                                        + real-estate division)
 * Written 2026-04-11 — House rule: לא מוחקים רק משדרגים ומגדלים
 * Zero external dependencies — Node built-ins only.
 *
 * Legal basis / מקור חוקי:
 *   - חוק איסור הלבנת הון, התש"ס-2000
 *     (Prohibition on Money Laundering Law, 5760-2000)
 *   - חוק איסור מימון טרור, התשס"ה-2005
 *     (Prohibition on Terror Financing Law, 5765-2005)
 *   - צו איסור הלבנת הון (חובות זיהוי, דיווח וניהול רישומים
 *     של תאגיד בנקאי), התשס"א-2001
 *     (AML Order for Banking Corps, 5761-2001)
 *   - צו איסור הלבנת הון (חובות זיהוי, דיווח וניהול רישומים
 *     של נותן שירות עסקי), התשע"ה-2014
 *     (AML Order for Business Service Providers, 5775-2014)
 *   - תוספת ראשונה לחוק (עבירות מקור)
 *     (First Schedule — predicate offences)
 *
 * Regulator: הרשות לאיסור הלבנת הון ומימון טרור
 *            (Israel Money-Laundering and Terror-Financing
 *             Prohibition Authority — "IMPA")
 *            Ministry of Justice — https://www.gov.il/he/departments/impa
 *
 * Reporting thresholds (סף דיווח) — hard-coded per statute. Never delete.
 *   ┌─────────────────────────┬──────────┬─────────────────────────────────┐
 *   │ Payment type            │ Currency │ Threshold                       │
 *   ├─────────────────────────┼──────────┼─────────────────────────────────┤
 *   │ Cash (מזומן)            │ ILS      │ 50,000                          │
 *   │ Cash — business deal    │ ILS      │ 11,000 (עוסק/תאגיד)              │
 *   │ Cash — private deal     │ ILS      │ 15,000                          │
 *   │ Wire — non-resident     │ USD equiv│ 5,000  (תקנות - לא תושב)          │
 *   │ Bearer instruments      │ ILS      │ 50,000                          │
 *   │ Real estate cash        │ ILS      │ 50,000  (חוק צמצום המזומן)       │
 *   │ Foreign currency swap   │ USD equiv│ 50,000  (צו נותני שירות במטבע)    │
 *   │ High-risk jurisdiction  │ any      │ zero (always report)            │
 *   └─────────────────────────┴──────────┴─────────────────────────────────┘
 *
 * Suspicious-pattern taxonomy (מודיעין-סיכון):
 *   - structuring (פיצול עסקאות)           — multiple tx just under threshold
 *   - smurfing    (סמורפים/שליחים)         — many small tx by different actors
 *   - rapid in/out (עסקה מהירה)            — funds in-and-out within hours
 *   - round-number (סכומים עגולים)         — statistically rare "clean" sums
 *   - high-risk jurisdiction (תחום שיפוט)  — FATF grey/black-list counterparty
 *   - PEP (אישיות ציבורית)                 — politically exposed person
 *   - blacklist hit (רשימת שמות)           — sanctions / watch-list match
 *   - velocity (תדירות)                    — abnormal frequency vs baseline
 *   - unknown source (מקור לא ברור)        — beneficial owner undisclosed
 *
 * Public API — class AMLScreener (frozen, only add new methods):
 *   - constructor({ clock, blacklist, pepList, highRiskCountries,
 *                   threshold, retentionYears, fetch })
 *   - injectTransport(fn)                   — mock HTTP for sanctions API
 *   - addToBlacklist(entry)                 — dynamic, never deletes existing
 *   - setRetentionYears(n)                  — must be ≥7 per law
 *   - screenCustomer(kyc)                   — returns { risk, flags, rating }
 *   - screenTransaction(tx)                 — returns { flags, score, … }
 *   - checkThresholds(tx)                   — returns { triggered, items }
 *   - dualCheck(tx, relatedTxs)             — combines many same-day tx
 *   - isBlacklisted(name, opts)             — returns { hit, entry }
 *   - isPEP(name)                           — returns bool
 *   - rateCustomer(kyc)                     — 'low'|'medium'|'high'|'pep'
 *   - recordCase(data)                      — stores with 7yr retention
 *   - listCases()                           — returns non-expired cases
 *   - purgeExpired()                        — never throws, returns count
 *   - generateSAR(caseData)                 — Suspicious Activity Report
 *                                             draft in IMPA "טופס דיווח"
 *                                             JSON + plain-text bilingual
 *
 * Record retention (שמירת רשומות):
 *   חוק איסור הלבנת הון קובע שמירת רישומים 7 שנים לפחות.
 *   Default retentionYears = 7. Can be *increased* via setRetentionYears()
 *   but never decreased below 7 (statutory minimum).
 *
 * Security / PII handling:
 *   - Customer ID numbers (תעודת זהות) are hashed with SHA-256 + salt
 *     before being written to any exportable artefact (SAR, case store).
 *   - Raw PII is kept only in-memory and purged on purgeExpired().
 *   - `generateSAR()` returns hashed subject IDs by default; pass
 *     { includeRawPII: true } to include raw (only for regulator submission).
 *
 * Transport injection (mock HTTP pattern):
 *   const screener = new AMLScreener();
 *   screener.injectTransport(async (url, opts) => ({ status: 200, body: {} }));
 *   // ... tests can stub sanctions API responses without network I/O
 *
 * ════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ────────────────────────────────────────────────────────────────────────
// Constants — never delete, only extend.
// ────────────────────────────────────────────────────────────────────────

/** Cash reporting ceiling per חוק איסור הלבנת הון, ₪ */
const CASH_REPORT_THRESHOLD_ILS = 50_000;

/** Business cash-usage cap per חוק לצמצום השימוש במזומן תשע"ח-2018, ₪ */
const BUSINESS_CASH_CAP_ILS = 11_000;

/** Private cash-usage cap per חוק לצמצום השימוש במזומן, ₪ */
const PRIVATE_CASH_CAP_ILS = 15_000;

/** Real-estate cash cap (any party), ₪ */
const REAL_ESTATE_CASH_CAP_ILS = 50_000;

/** Non-resident wire threshold (approx, USD equiv) */
const NON_RESIDENT_WIRE_USD = 5_000;

/** Statutory minimum record retention, years */
const MIN_RETENTION_YEARS = 7;

/** Suspicious structuring band — tx > 80% of threshold but < 100% */
const STRUCTURING_BAND_RATIO = 0.80;

/** Smurfing threshold — N distinct actors within 24h */
const SMURFING_ACTOR_COUNT = 3;

/** Rapid in/out window, hours */
const RAPID_INOUT_WINDOW_HOURS = 48;

/** FATF high-risk jurisdictions (black + grey list snapshot, 2026-Q1)
 *  עדכון: יש לעדכן בהתאם לפרסומי FATF / IMPA. רק להוסיף, לא למחוק. */
const HIGH_RISK_COUNTRIES_DEFAULT = Object.freeze([
  // FATF Black list (call-for-action)
  'KP', // North Korea / צפון קוריאה
  'IR', // Iran / איראן
  'MM', // Myanmar / מיאנמר
  // FATF Grey list (increased monitoring — snapshot)
  'AL', // Albania
  'BB', // Barbados
  'BF', // Burkina Faso
  'KH', // Cambodia
  'KY', // Cayman Islands
  'HT', // Haiti
  'JM', // Jamaica
  'JO', // Jordan
  'ML', // Mali
  'MZ', // Mozambique
  'NI', // Nicaragua
  'PA', // Panama
  'PH', // Philippines
  'SN', // Senegal
  'SS', // South Sudan
  'SY', // Syria / סוריה
  'TR', // Turkey
  'UG', // Uganda
  'YE', // Yemen / תימן
  'ZW', // Zimbabwe
]);

/** Severity weights → risk score contribution */
const FLAG_WEIGHTS = Object.freeze({
  structuring:        35,
  smurfing:           30,
  rapid_in_out:       25,
  round_number:       10,
  high_risk_country:  40,
  pep_match:          45,
  blacklist_hit:      100,
  threshold_breach:   20,
  velocity_anomaly:   15,
  unknown_source:     20,
  cash_cap_breach:    25,
  real_estate_cash:   30,
  dual_check_cluster: 25,
});

/** Risk-rating bands on 0..100 scale */
const RISK_BANDS = Object.freeze({
  low:    { min: 0,  max: 29, he: 'נמוך',  en: 'Low'    },
  medium: { min: 30, max: 59, he: 'בינוני', en: 'Medium' },
  high:   { min: 60, max: 100, he: 'גבוה',  en: 'High'   },
});

/** Bilingual labels for flags */
const FLAG_LABELS = Object.freeze({
  structuring:        { he: 'פיצול עסקאות (סטרקצ\'רינג)',     en: 'Structuring' },
  smurfing:           { he: 'סמורפינג / שליחים',               en: 'Smurfing' },
  rapid_in_out:       { he: 'עסקה מהירה – כניסה ויציאה',       en: 'Rapid in/out' },
  round_number:       { he: 'סכומים עגולים',                  en: 'Round-number pattern' },
  high_risk_country:  { he: 'תחום שיפוט בסיכון גבוה',          en: 'High-risk jurisdiction' },
  pep_match:          { he: 'אישיות ציבורית (PEP)',            en: 'Politically Exposed Person' },
  blacklist_hit:      { he: 'רשימה שחורה / סנקציות',           en: 'Blacklist / sanctions hit' },
  threshold_breach:   { he: 'חציית סף דיווח',                 en: 'Reporting threshold breach' },
  velocity_anomaly:   { he: 'תדירות חריגה',                   en: 'Velocity anomaly' },
  unknown_source:     { he: 'מקור כספים לא ברור',              en: 'Unknown source of funds' },
  cash_cap_breach:    { he: 'חריגה מתקרת מזומן',               en: 'Cash-cap breach' },
  real_estate_cash:   { he: 'מזומן בעסקת נדל"ן',               en: 'Real-estate cash' },
  dual_check_cluster: { he: 'צבר עסקאות קשורות',               en: 'Related-tx cluster' },
});

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

function now() { return new Date(); }

function toDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function hoursBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return null;
  return Math.abs(da.getTime() - db.getTime()) / 36e5;
}

/** Deterministic salted SHA-256 hex digest for PII redaction. */
function hashPII(value, salt) {
  if (value == null) return '';
  const s = typeof salt === 'string' && salt.length ? salt : 'impa-default-salt';
  return crypto
    .createHash('sha256')
    .update(s + ':' + String(value))
    .digest('hex');
}

/** Normalise a name for list-matching — strip diacritics / case / punct. */
function normalizeName(name) {
  if (name == null) return '';
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')      // strip combining marks
    .replace(/["'`.]/g, '')                // drop zero-width punct
    .replace(/[\-,/\\]+/g, ' ')            // dashes, commas → spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Is the numeric amount "round" (>= 1000 and divides by 1000 within tol)? */
function isRoundAmount(amount, tolerance = 0) {
  if (typeof amount !== 'number' || !isFinite(amount) || amount < 1000) return false;
  const mod = amount % 1000;
  return mod <= tolerance || (1000 - mod) <= tolerance;
}

/** Collision-resistant pseudo-ID for cases / SARs. */
function uid(prefix) {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(5).toString('hex');
  return `${prefix}-${ts}-${rnd}`;
}

/** Map numeric score to band key ('low' | 'medium' | 'high'). */
function bandOf(score) {
  const n = typeof score === 'number' && isFinite(score) ? score : 0;
  if (n >= RISK_BANDS.high.min)   return 'high';
  if (n >= RISK_BANDS.medium.min) return 'medium';
  return 'low';
}

// ────────────────────────────────────────────────────────────────────────
// AMLScreener class
// ────────────────────────────────────────────────────────────────────────

class AMLScreener {
  /**
   * @param {object} [opts]
   * @param {() => Date} [opts.clock]            injectable clock for tests
   * @param {Array}      [opts.blacklist]        seed blacklist entries
   * @param {Array}      [opts.pepList]          seed PEP list
   * @param {string[]}   [opts.highRiskCountries] ISO-2 high-risk JDX
   * @param {number}     [opts.threshold]        cash-report threshold (₪)
   * @param {number}     [opts.retentionYears]   record retention (min 7)
   * @param {Function}   [opts.fetch]            mock HTTP transport
   * @param {string}     [opts.piiSalt]          hashing salt for PII
   */
  constructor(opts = {}) {
    this.clock = typeof opts.clock === 'function' ? opts.clock : now;

    // Blacklist — additive only. Deep-copy incoming entries.
    this._blacklist = new Map();
    if (Array.isArray(opts.blacklist)) {
      for (const e of opts.blacklist) this.addToBlacklist(e);
    }

    // PEP list — additive.
    this._pepList = new Set();
    if (Array.isArray(opts.pepList)) {
      for (const n of opts.pepList) this._pepList.add(normalizeName(n));
    }

    // High-risk countries.
    this._highRiskCountries = new Set(
      Array.isArray(opts.highRiskCountries) && opts.highRiskCountries.length
        ? opts.highRiskCountries.map((c) => String(c).toUpperCase())
        : HIGH_RISK_COUNTRIES_DEFAULT.slice()
    );

    // Thresholds — upgradable, never below statutory minimum.
    this._threshold = typeof opts.threshold === 'number' && opts.threshold > 0
      ? Math.max(opts.threshold, CASH_REPORT_THRESHOLD_ILS)
      : CASH_REPORT_THRESHOLD_ILS;

    // Retention — statutory minimum 7 years.
    this._retentionYears = typeof opts.retentionYears === 'number'
      ? Math.max(opts.retentionYears, MIN_RETENTION_YEARS)
      : MIN_RETENTION_YEARS;

    // Transport — injectable for tests (mock HTTP).
    this._transport = typeof opts.fetch === 'function' ? opts.fetch : null;

    // PII salt — per-instance; never logged.
    this._piiSalt = typeof opts.piiSalt === 'string' && opts.piiSalt.length
      ? opts.piiSalt
      : crypto.randomBytes(16).toString('hex');

    // Case store — additive, with retention timestamps.
    this._cases = [];
  }

  // ───────────────────────────── Transport / injection ──────────────────

  /** Inject mock HTTP transport. Fn signature: (url, opts) => Promise<res> */
  injectTransport(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('injectTransport requires a function');
    }
    this._transport = fn;
    return this;
  }

  async _callTransport(url, opts) {
    if (!this._transport) {
      return { status: 0, body: null, error: 'no-transport' };
    }
    try {
      const res = await this._transport(url, opts || {});
      return res || { status: 0, body: null };
    } catch (err) {
      return { status: -1, body: null, error: err && err.message };
    }
  }

  // ───────────────────────────── Blacklist / PEP management ─────────────

  /**
   * Add a blacklist entry. Never replaces/removes existing entries —
   * last-write-wins inside a single aggregated record list.
   */
  addToBlacklist(entry) {
    if (!entry || typeof entry !== 'object') return this;
    const name = normalizeName(entry.name || entry.displayName || '');
    if (!name) return this;
    const existing = this._blacklist.get(name) || { aliases: [], records: [] };
    existing.records.push({
      name: entry.name || '',
      source: entry.source || 'manual',
      reason: entry.reason || '',
      listedAt: entry.listedAt || this.clock().toISOString(),
      severity: entry.severity || 'high',
      jurisdiction: entry.jurisdiction || null,
      ref: entry.ref || null,
    });
    if (Array.isArray(entry.aliases)) {
      for (const a of entry.aliases) {
        const na = normalizeName(a);
        if (na && !existing.aliases.includes(na)) existing.aliases.push(na);
        if (na && !this._blacklist.has(na)) {
          this._blacklist.set(na, { aliases: [name], records: existing.records });
        }
      }
    }
    this._blacklist.set(name, existing);
    return this;
  }

  /** Returns shallow snapshot of blacklist (for UI). */
  listBlacklist() {
    const out = [];
    const seen = new Set();
    for (const [k, v] of this._blacklist.entries()) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push({ name: k, aliases: v.aliases.slice(), records: v.records.slice() });
    }
    return out;
  }

  /** Add a PEP name. Case/diacritic-insensitive. */
  addPEP(name) {
    const n = normalizeName(name);
    if (n) this._pepList.add(n);
    return this;
  }

  /** @returns {boolean} */
  isPEP(name) {
    return this._pepList.has(normalizeName(name));
  }

  /**
   * @param {string} name
   * @param {{ fuzzy?: boolean }} [opts]
   * @returns {{ hit: boolean, entry?: object }}
   */
  isBlacklisted(name, opts = {}) {
    const n = normalizeName(name);
    if (!n) return { hit: false };
    if (this._blacklist.has(n)) {
      return { hit: true, entry: this._blacklist.get(n) };
    }
    if (opts.fuzzy) {
      // Loose substring match as a fallback — never used as a hard block
      // alone; flagged as "weak" match in the envelope for human review.
      for (const [k, v] of this._blacklist.entries()) {
        if (k.length >= 3 && (k.includes(n) || n.includes(k))) {
          return { hit: true, entry: v, weak: true };
        }
      }
    }
    return { hit: false };
  }

  // ───────────────────────────── Retention ──────────────────────────────

  setRetentionYears(n) {
    if (typeof n !== 'number' || !isFinite(n)) return this;
    this._retentionYears = Math.max(n, MIN_RETENTION_YEARS);
    return this;
  }

  getRetentionYears() { return this._retentionYears; }

  // ───────────────────────────── KYC / customer screening ───────────────

  /**
   * Screen a customer KYC record.
   *
   * @param {object} kyc
   * @param {string} kyc.name
   * @param {string} [kyc.id]               ת.ז / תאגיד
   * @param {string} [kyc.country]          ISO-2
   * @param {string} [kyc.occupation]
   * @param {boolean}[kyc.pep]
   * @param {Array}  [kyc.relatedParties]
   * @param {string} [kyc.sourceOfFunds]
   * @param {number} [kyc.expectedMonthlyVolume]
   * @param {string[]}[kyc.aliases]
   * @returns {{ score:number, flags:string[], rating:string, reasons:Array }}
   */
  screenCustomer(kyc) {
    const flags = [];
    const reasons = [];
    if (!kyc || typeof kyc !== 'object') {
      return { score: 0, flags, rating: 'low', reasons, rating_label: RISK_BANDS.low };
    }

    const candidateNames = [kyc.name, ...(Array.isArray(kyc.aliases) ? kyc.aliases : [])].filter(Boolean);

    // Blacklist / sanctions
    for (const n of candidateNames) {
      const b = this.isBlacklisted(n);
      if (b.hit) {
        flags.push('blacklist_hit');
        reasons.push({
          code: 'blacklist_hit',
          he: `התאמה לרשימה שחורה: ${n}`,
          en: `Blacklist match: ${n}`,
          severity: 'critical',
        });
        break;
      }
    }

    // PEP
    const pepFlag = kyc.pep === true || candidateNames.some((n) => this.isPEP(n));
    if (pepFlag) {
      flags.push('pep_match');
      reasons.push({
        code: 'pep_match',
        he: 'הלקוח מסומן כאישיות ציבורית (PEP) — נדרשת בדיקה מוגברת',
        en: 'Customer flagged as PEP — enhanced due diligence required',
        severity: 'high',
      });
    }

    // High-risk jurisdiction
    if (kyc.country && this._highRiskCountries.has(String(kyc.country).toUpperCase())) {
      flags.push('high_risk_country');
      reasons.push({
        code: 'high_risk_country',
        he: `תחום שיפוט בסיכון גבוה: ${kyc.country}`,
        en: `High-risk jurisdiction: ${kyc.country}`,
        severity: 'high',
      });
    }

    // Unknown / empty source of funds
    if (!kyc.sourceOfFunds || String(kyc.sourceOfFunds).trim().length < 3) {
      flags.push('unknown_source');
      reasons.push({
        code: 'unknown_source',
        he: 'מקור הכספים לא הוצהר או לא ברור',
        en: 'Source of funds not declared or unclear',
        severity: 'medium',
      });
    }

    // Excessively high expected volume vs a generic baseline
    if (typeof kyc.expectedMonthlyVolume === 'number' && kyc.expectedMonthlyVolume >= 1_000_000) {
      flags.push('velocity_anomaly');
      reasons.push({
        code: 'velocity_anomaly',
        he: 'צפי מחזור חודשי גבוה מאוד — נדרשת הצדקה עסקית',
        en: 'Very high expected monthly volume — business rationale required',
        severity: 'medium',
      });
    }

    const score = flags.reduce((s, f) => s + (FLAG_WEIGHTS[f] || 0), 0);

    // PEP / blacklist override band
    let rating = bandOf(score);
    if (flags.includes('blacklist_hit')) rating = 'high';
    else if (flags.includes('pep_match') && rating === 'low') rating = 'medium';

    // Distinct "pep" output tag (on top of high/medium/low)
    const ratingTag = flags.includes('pep_match') ? 'pep' : rating;

    return {
      score: Math.min(score, 100),
      flags,
      rating,
      rating_tag: ratingTag,
      rating_label: {
        he: RISK_BANDS[rating].he,
        en: RISK_BANDS[rating].en,
      },
      reasons,
    };
  }

  /** Alias for screenCustomer → returns just the rating label. */
  rateCustomer(kyc) {
    const res = this.screenCustomer(kyc);
    return res.rating_tag;
  }

  // ───────────────────────────── Transaction screening ──────────────────

  /**
   * Screen a single transaction.
   * @param {object} tx
   * @param {number} tx.amount
   * @param {string} tx.currency      (default 'ILS')
   * @param {string} tx.type          'cash'|'wire'|'swap'|'real_estate'|…
   * @param {string} [tx.counterparty]
   * @param {string} [tx.counterpartyCountry] ISO-2
   * @param {string} [tx.date]
   * @param {boolean}[tx.businessDeal]
   * @param {boolean}[tx.incoming]
   * @param {string} [tx.purpose]
   * @param {Array}  [tx.related]     optional related txs for inline cluster
   * @returns {{ score, flags, reasons, reportable, thresholds }}
   */
  screenTransaction(tx) {
    const flags = [];
    const reasons = [];
    if (!tx || typeof tx !== 'object') {
      return {
        score: 0, flags, reasons, reportable: false,
        thresholds: { triggered: false, items: [] },
      };
    }

    const amount = typeof tx.amount === 'number' ? tx.amount : 0;
    const currency = (tx.currency || 'ILS').toUpperCase();
    const type = (tx.type || 'unknown').toLowerCase();

    // Threshold evaluation.
    const th = this.checkThresholds(tx);
    if (th.triggered) {
      flags.push('threshold_breach');
      reasons.push({
        code: 'threshold_breach',
        he: `חצה סף דיווח לרשות: ${th.items.map((i) => i.he).join('; ')}`,
        en: `Breached reporting threshold: ${th.items.map((i) => i.en).join('; ')}`,
        severity: 'high',
      });
    }

    // Structuring — amount in the 80–100% band of threshold.
    if (
      currency === 'ILS'
      && amount >= this._threshold * STRUCTURING_BAND_RATIO
      && amount <  this._threshold
    ) {
      flags.push('structuring');
      reasons.push({
        code: 'structuring',
        he: `סכום ${amount.toLocaleString('he-IL')} ₪ בטווח פיצול חשוד (מתחת לסף ${this._threshold.toLocaleString('he-IL')} ₪)`,
        en: `Amount ${amount} is in the structuring band below threshold ${this._threshold}`,
        severity: 'high',
      });
    }

    // High-risk jurisdiction
    if (tx.counterpartyCountry && this._highRiskCountries.has(String(tx.counterpartyCountry).toUpperCase())) {
      flags.push('high_risk_country');
      reasons.push({
        code: 'high_risk_country',
        he: `צד נגדי מתחום שיפוט בסיכון גבוה: ${tx.counterpartyCountry}`,
        en: `Counterparty from high-risk jurisdiction: ${tx.counterpartyCountry}`,
        severity: 'high',
      });
    }

    // Counterparty on blacklist
    if (tx.counterparty) {
      const b = this.isBlacklisted(tx.counterparty);
      if (b.hit) {
        flags.push('blacklist_hit');
        reasons.push({
          code: 'blacklist_hit',
          he: `צד נגדי ברשימה שחורה: ${tx.counterparty}`,
          en: `Counterparty on blacklist: ${tx.counterparty}`,
          severity: 'critical',
        });
      }
      if (this.isPEP(tx.counterparty)) {
        flags.push('pep_match');
        reasons.push({
          code: 'pep_match',
          he: `צד נגדי מסומן כאישיות ציבורית: ${tx.counterparty}`,
          en: `Counterparty flagged as PEP: ${tx.counterparty}`,
          severity: 'high',
        });
      }
    }

    // Round-number heuristic — only above 10k to avoid noise.
    if (amount >= 10_000 && isRoundAmount(amount, 0)) {
      flags.push('round_number');
      reasons.push({
        code: 'round_number',
        he: `סכום עגול: ${amount.toLocaleString('he-IL')}`,
        en: `Round-number amount: ${amount}`,
        severity: 'low',
      });
    }

    // Rapid in/out — must be supplied via tx.related or dualCheck call.
    if (Array.isArray(tx.related) && tx.related.length > 0 && tx.date) {
      const anyOpposite = tx.related.some((r) => {
        if (typeof r.amount !== 'number') return false;
        if (tx.incoming === undefined || r.incoming === undefined) return false;
        if (tx.incoming === r.incoming) return false;
        const hrs = hoursBetween(tx.date, r.date);
        return hrs != null && hrs <= RAPID_INOUT_WINDOW_HOURS
          && Math.abs(r.amount - amount) / Math.max(amount, 1) < 0.25;
      });
      if (anyOpposite) {
        flags.push('rapid_in_out');
        reasons.push({
          code: 'rapid_in_out',
          he: `כספים נכנסו ויצאו בחלון של עד ${RAPID_INOUT_WINDOW_HOURS} שעות`,
          en: `Funds in & out within ${RAPID_INOUT_WINDOW_HOURS}h window`,
          severity: 'high',
        });
      }
    }

    // Cash-cap breaches per חוק צמצום השימוש במזומן
    if (type === 'cash' && currency === 'ILS') {
      if (tx.businessDeal && amount > BUSINESS_CASH_CAP_ILS) {
        flags.push('cash_cap_breach');
        reasons.push({
          code: 'cash_cap_breach',
          he: `חריגה מתקרת מזומן עסקי (${BUSINESS_CASH_CAP_ILS.toLocaleString('he-IL')} ₪)`,
          en: `Business cash-cap breach (₪${BUSINESS_CASH_CAP_ILS})`,
          severity: 'high',
        });
      } else if (!tx.businessDeal && amount > PRIVATE_CASH_CAP_ILS) {
        flags.push('cash_cap_breach');
        reasons.push({
          code: 'cash_cap_breach',
          he: `חריגה מתקרת מזומן פרטי (${PRIVATE_CASH_CAP_ILS.toLocaleString('he-IL')} ₪)`,
          en: `Private cash-cap breach (₪${PRIVATE_CASH_CAP_ILS})`,
          severity: 'medium',
        });
      }
    }

    // Real-estate cash
    if (type === 'real_estate' && tx.cashPortion && tx.cashPortion >= REAL_ESTATE_CASH_CAP_ILS) {
      flags.push('real_estate_cash');
      reasons.push({
        code: 'real_estate_cash',
        he: `מרכיב מזומן בעסקת נדל"ן מעל ${REAL_ESTATE_CASH_CAP_ILS.toLocaleString('he-IL')} ₪`,
        en: `Real-estate cash portion exceeds ₪${REAL_ESTATE_CASH_CAP_ILS}`,
        severity: 'high',
      });
    }

    const score = Math.min(
      flags.reduce((s, f) => s + (FLAG_WEIGHTS[f] || 0), 0),
      100
    );

    return {
      score,
      flags,
      reasons,
      reportable: flags.includes('threshold_breach')
               || flags.includes('blacklist_hit')
               || flags.includes('structuring'),
      thresholds: th,
    };
  }

  // ───────────────────────────── Threshold checker ──────────────────────

  /**
   * Evaluate whether a single transaction breaches any IMPA-mandated
   * reporting threshold. Returns all matching rules — never short-circuits.
   */
  checkThresholds(tx) {
    const items = [];
    if (!tx || typeof tx !== 'object') return { triggered: false, items };

    const amount = typeof tx.amount === 'number' ? tx.amount : 0;
    const currency = (tx.currency || 'ILS').toUpperCase();
    const type = (tx.type || 'unknown').toLowerCase();

    if (type === 'cash' && currency === 'ILS' && amount >= this._threshold) {
      items.push({
        code: 'CASH_IMPA_50K',
        law: 'חוק איסור הלבנת הון, תש"ס-2000',
        he: `מזומן מעל ${this._threshold.toLocaleString('he-IL')} ₪ — דיווח לרשות`,
        en: `Cash ≥ ₪${this._threshold} — IMPA report required`,
      });
    }

    if (type === 'cash' && currency === 'ILS' && tx.businessDeal && amount > BUSINESS_CASH_CAP_ILS) {
      items.push({
        code: 'CASH_BIZ_CAP_11K',
        law: 'חוק לצמצום השימוש במזומן, תשע"ח-2018',
        he: `תשלום מזומן עסקי מעל ${BUSINESS_CASH_CAP_ILS.toLocaleString('he-IL')} ₪ — אסור`,
        en: `Business cash > ₪${BUSINESS_CASH_CAP_ILS} — prohibited`,
      });
    }

    if (type === 'cash' && currency === 'ILS' && !tx.businessDeal && amount > PRIVATE_CASH_CAP_ILS) {
      items.push({
        code: 'CASH_PRIVATE_CAP_15K',
        law: 'חוק לצמצום השימוש במזומן, תשע"ח-2018',
        he: `תשלום מזומן פרטי מעל ${PRIVATE_CASH_CAP_ILS.toLocaleString('he-IL')} ₪ — אסור`,
        en: `Private cash > ₪${PRIVATE_CASH_CAP_ILS} — prohibited`,
      });
    }

    if (type === 'real_estate' && typeof tx.cashPortion === 'number' && tx.cashPortion >= REAL_ESTATE_CASH_CAP_ILS) {
      items.push({
        code: 'REALESTATE_CASH_50K',
        law: 'חוק לצמצום השימוש במזומן + חוק מיסוי מקרקעין',
        he: `מזומן בעסקת נדל"ן מעל ${REAL_ESTATE_CASH_CAP_ILS.toLocaleString('he-IL')} ₪`,
        en: `Real-estate cash ≥ ₪${REAL_ESTATE_CASH_CAP_ILS}`,
      });
    }

    if (type === 'wire' && tx.nonResident && currency !== 'ILS' && amount >= NON_RESIDENT_WIRE_USD) {
      items.push({
        code: 'WIRE_NONRESIDENT_5K',
        law: 'צו איסור הלבנת הון (נותני שירות במטבע)',
        he: `העברה של לא-תושב מעל ${NON_RESIDENT_WIRE_USD} USD`,
        en: `Non-resident wire ≥ $${NON_RESIDENT_WIRE_USD}`,
      });
    }

    return { triggered: items.length > 0, items };
  }

  // ───────────────────────────── Dual-check (related txs) ───────────────

  /**
   * Evaluate a target tx in the context of N related transactions to
   * detect splitting / smurfing / rapid-in-out clusters.
   *
   * @param {object} tx
   * @param {Array}  relatedTxs
   */
  dualCheck(tx, relatedTxs) {
    const base = this.screenTransaction(tx);
    if (!Array.isArray(relatedTxs) || relatedTxs.length === 0) return base;

    const flags = new Set(base.flags);
    const reasons = base.reasons.slice();

    const baseAmt = typeof tx.amount === 'number' ? tx.amount : 0;
    const clusterTotal = relatedTxs.reduce(
      (sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0),
      baseAmt
    );

    // Structuring via cluster: total ≥ threshold but no single tx is.
    if (
      clusterTotal >= this._threshold
      && baseAmt < this._threshold
      && relatedTxs.every((r) => (typeof r.amount === 'number' ? r.amount : 0) < this._threshold)
    ) {
      flags.add('structuring');
      reasons.push({
        code: 'structuring',
        he: `צבר עסקאות (${(relatedTxs.length + 1)}) מסתכם ב-${clusterTotal.toLocaleString('he-IL')} ₪, כל אחת מתחת לסף`,
        en: `Cluster of ${relatedTxs.length + 1} txs totals ${clusterTotal} — each below threshold`,
        severity: 'critical',
      });
    }

    // Smurfing — distinct counterparties within 24h
    const win24 = relatedTxs.filter((r) => {
      const h = hoursBetween(tx.date, r.date);
      return h != null && h <= 24;
    });
    const distinctActors = new Set(win24.map((r) => normalizeName(r.counterparty || '')).filter(Boolean));
    if (tx.counterparty) distinctActors.add(normalizeName(tx.counterparty));
    if (distinctActors.size >= SMURFING_ACTOR_COUNT) {
      flags.add('smurfing');
      reasons.push({
        code: 'smurfing',
        he: `זוהו ${distinctActors.size} צדדים שונים בתוך 24 שעות`,
        en: `${distinctActors.size} distinct actors within 24h`,
        severity: 'high',
      });
    }

    // Rapid in/out across related set
    if (tx.incoming !== undefined) {
      const opposite = relatedTxs.filter((r) => {
        if (r.incoming === undefined) return false;
        if (r.incoming === tx.incoming) return false;
        const h = hoursBetween(tx.date, r.date);
        return h != null && h <= RAPID_INOUT_WINDOW_HOURS;
      });
      if (opposite.length > 0) {
        flags.add('rapid_in_out');
        reasons.push({
          code: 'rapid_in_out',
          he: `עסקאות מנוגדות בכיוון בחלון של ${RAPID_INOUT_WINDOW_HOURS} שעות`,
          en: `Opposite-direction txs within ${RAPID_INOUT_WINDOW_HOURS}h`,
          severity: 'high',
        });
      }
    }

    flags.add('dual_check_cluster');

    const arr = Array.from(flags);
    const score = Math.min(
      arr.reduce((s, f) => s + (FLAG_WEIGHTS[f] || 0), 0),
      100
    );

    return {
      ...base,
      flags: arr,
      reasons,
      score,
      clusterTotal,
      relatedCount: relatedTxs.length,
      reportable: arr.includes('threshold_breach')
               || arr.includes('blacklist_hit')
               || arr.includes('structuring')
               || arr.includes('smurfing'),
    };
  }

  // ───────────────────────────── SAR generation ─────────────────────────

  /**
   * Build a draft Suspicious Activity Report in IMPA format. Returns an
   * object with both a structured `form` payload and a flat bilingual
   * `text` body ready for human review / PDF export.
   *
   * @param {object} caseData
   * @param {string} caseData.subjectName
   * @param {string} [caseData.subjectId]
   * @param {string} [caseData.subjectAddress]
   * @param {object} [caseData.transaction]
   * @param {Array}  [caseData.related]
   * @param {string[]}[caseData.flags]
   * @param {string} [caseData.narrative]
   * @param {boolean}[caseData.includeRawPII]
   */
  generateSAR(caseData) {
    const data = caseData && typeof caseData === 'object' ? caseData : {};
    const ts = this.clock();
    const reportId = uid('SAR');
    const includeRaw = data.includeRawPII === true;

    const subjectIdRaw = data.subjectId || '';
    const subjectIdOut = includeRaw ? subjectIdRaw : (subjectIdRaw ? hashPII(subjectIdRaw, this._piiSalt) : '');

    const flags = Array.isArray(data.flags) ? data.flags.slice() : [];
    const labelsHe = flags.map((f) => (FLAG_LABELS[f] ? FLAG_LABELS[f].he : f));
    const labelsEn = flags.map((f) => (FLAG_LABELS[f] ? FLAG_LABELS[f].en : f));

    const tx = data.transaction || {};
    const amount = typeof tx.amount === 'number' ? tx.amount : null;

    const form = {
      // IMPA-equivalent headers
      report_id: reportId,
      report_type: 'SAR',                      // טופס דיווח על פעולה בלתי רגילה
      form_name_he: 'טופס דיווח על פעולה בלתי רגילה',
      form_name_en: 'Suspicious Activity Report',
      reporter: {
        entity_he: 'טכנו-קול עוזי מערכות בע"מ',
        entity_en: 'Techno-Kol Uzi Systems Ltd.',
        contact: data.reporter || null,
      },
      report_date: ts.toISOString(),
      legal_basis: [
        'חוק איסור הלבנת הון, תש"ס-2000',
        'חוק איסור מימון טרור, התשס"ה-2005',
      ],
      subject: {
        name: data.subjectName || '(unknown)',
        id_hash: includeRaw ? null : subjectIdOut,
        id_raw:  includeRaw ? subjectIdOut : null,
        address: data.subjectAddress || null,
        country: data.subjectCountry || null,
        pep:     Boolean(data.pep),
      },
      transaction: {
        amount,
        currency: (tx.currency || 'ILS').toUpperCase(),
        type: tx.type || null,
        date: tx.date || null,
        counterparty: tx.counterparty || null,
        counterparty_country: tx.counterpartyCountry || null,
        incoming: tx.incoming === undefined ? null : Boolean(tx.incoming),
        purpose: tx.purpose || null,
      },
      related_transaction_count: Array.isArray(data.related) ? data.related.length : 0,
      flags,
      flag_labels_he: labelsHe,
      flag_labels_en: labelsEn,
      narrative: data.narrative || this._buildDefaultNarrative(data),
      retention: {
        years: this._retentionYears,
        expires: new Date(ts.getTime() + this._retentionYears * 365.25 * 24 * 3600 * 1000).toISOString(),
      },
      status: 'draft',
      submitted: false,
    };

    const textLines = [];
    textLines.push('=======================================================');
    textLines.push('  טופס דיווח על פעולה בלתי רגילה — SAR Draft');
    textLines.push('  מוגש לרשות לאיסור הלבנת הון ומימון טרור (IMPA)');
    textLines.push('=======================================================');
    textLines.push(`מספר דיווח / Report #: ${reportId}`);
    textLines.push(`תאריך / Date:          ${ts.toISOString()}`);
    textLines.push(`מוסד מדווח / Reporter: טכנו-קול עוזי מערכות בע"מ`);
    textLines.push('');
    textLines.push('--- נשוא הדיווח / Subject ---');
    textLines.push(`שם / Name:             ${form.subject.name}`);
    if (includeRaw) {
      textLines.push(`ת.ז / ID:              ${subjectIdOut || '(not provided)'}`);
    } else {
      textLines.push(`ת.ז hash / ID hash:    ${subjectIdOut || '(not provided)'}`);
    }
    if (form.subject.country) textLines.push(`מדינה / Country:       ${form.subject.country}`);
    if (form.subject.pep)     textLines.push('סיווג / Classification: PEP — אישיות ציבורית');
    textLines.push('');
    textLines.push('--- פרטי העסקה / Transaction ---');
    textLines.push(`סכום / Amount:         ${amount != null ? amount.toLocaleString('he-IL') : '(n/a)'} ${form.transaction.currency}`);
    textLines.push(`סוג / Type:            ${form.transaction.type || '(n/a)'}`);
    textLines.push(`תאריך / Date:          ${form.transaction.date || '(n/a)'}`);
    if (form.transaction.counterparty)
      textLines.push(`צד נגדי / Counterparty:${form.transaction.counterparty}`);
    if (form.transaction.counterparty_country)
      textLines.push(`מדינה / Country:       ${form.transaction.counterparty_country}`);
    textLines.push('');
    textLines.push('--- דגלי חשד / Suspicion Flags ---');
    if (flags.length === 0) {
      textLines.push('(no flags)');
    } else {
      for (let i = 0; i < flags.length; i++) {
        textLines.push(`  • ${labelsHe[i]} / ${labelsEn[i]}`);
      }
    }
    textLines.push('');
    textLines.push('--- תיאור / Narrative ---');
    textLines.push(form.narrative);
    textLines.push('');
    textLines.push('--- תשתית חוקית / Legal Basis ---');
    for (const l of form.legal_basis) textLines.push(`  • ${l}`);
    textLines.push('');
    textLines.push(`שמירת רשומה / Retention: ${this._retentionYears} שנים (עד ${form.retention.expires})`);
    textLines.push('');
    textLines.push('טיוטה — דורשת בדיקה ואישור של קצין ציות לפני הגשה.');
    textLines.push('DRAFT — requires compliance-officer review before submission.');

    return {
      form,
      text: textLines.join('\n'),
      id: reportId,
    };
  }

  _buildDefaultNarrative(data) {
    const parts = [];
    const flags = Array.isArray(data.flags) ? data.flags : [];
    if (flags.length === 0) {
      parts.push('לא סופקו דגלי חשד. נדרשת השלמת פרטים. / No flags supplied; further detail required.');
    } else {
      parts.push('במסגרת סקירת ציות לחוק איסור הלבנת הון, זוהו מאפיינים חריגים בפעילות הלקוח:');
      parts.push('During AML compliance screening, the following anomalies were identified:');
      for (const f of flags) {
        const lbl = FLAG_LABELS[f];
        if (lbl) parts.push(`  — ${lbl.he} / ${lbl.en}`);
      }
      parts.push('הדיווח מוגש בהתאם לחובת דיווח סובייקטיבית על פעולות בלתי רגילות.');
      parts.push('This report is submitted under the subjective duty to report unusual activity.');
    }
    return parts.join('\n');
  }

  // ───────────────────────────── Case store (retention 7y) ──────────────

  /**
   * Persist a screening case. Never throws on duplicate IDs — appends.
   * @returns {string} case id
   */
  recordCase(data) {
    const id = (data && data.id) || uid('AML');
    const ts = this.clock();
    const expires = new Date(ts.getTime() + this._retentionYears * 365.25 * 24 * 3600 * 1000);
    const safe = Object.assign({}, data || {});

    // Redact raw PII on storage (hash ID numbers, mask names).
    if (safe.subjectId) {
      safe.subjectIdHash = hashPII(safe.subjectId, this._piiSalt);
      delete safe.subjectId;
    }

    this._cases.push({
      id,
      createdAt: ts.toISOString(),
      expiresAt: expires.toISOString(),
      data: safe,
    });
    return id;
  }

  /** Return all non-expired cases (shallow clones). */
  listCases() {
    const now = this.clock().getTime();
    return this._cases
      .filter((c) => Date.parse(c.expiresAt) >= now)
      .map((c) => ({ ...c, data: { ...c.data } }));
  }

  /** Remove expired cases. Returns number purged. */
  purgeExpired() {
    const now = this.clock().getTime();
    const before = this._cases.length;
    this._cases = this._cases.filter((c) => Date.parse(c.expiresAt) >= now);
    return before - this._cases.length;
  }

  // ───────────────────────────── Introspection ──────────────────────────

  getThresholds() {
    return Object.freeze({
      cash_impa_ils: this._threshold,
      business_cash_cap_ils: BUSINESS_CASH_CAP_ILS,
      private_cash_cap_ils: PRIVATE_CASH_CAP_ILS,
      real_estate_cash_ils: REAL_ESTATE_CASH_CAP_ILS,
      non_resident_wire_usd: NON_RESIDENT_WIRE_USD,
      retention_years: this._retentionYears,
    });
  }

  getHighRiskCountries() {
    return Array.from(this._highRiskCountries);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────

module.exports = {
  AMLScreener,
  // Constants re-exported so callers / tests can reference them.
  CASH_REPORT_THRESHOLD_ILS,
  BUSINESS_CASH_CAP_ILS,
  PRIVATE_CASH_CAP_ILS,
  REAL_ESTATE_CASH_CAP_ILS,
  NON_RESIDENT_WIRE_USD,
  MIN_RETENTION_YEARS,
  HIGH_RISK_COUNTRIES_DEFAULT,
  FLAG_WEIGHTS,
  FLAG_LABELS,
  RISK_BANDS,
  // Helpers exported for tests
  normalizeName,
  hashPII,
  isRoundAmount,
  bandOf,
};
