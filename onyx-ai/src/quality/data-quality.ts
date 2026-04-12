/**
 * ONYX AI — Data Quality Scorer (Agent Y-163 / Techno-Kol Uzi mega-ERP)
 * ----------------------------------------------------------------------
 * Bilingual (English + Hebrew) data-quality engine that grades an
 * arbitrary tabular dataset on six classical dimensions:
 *
 *   1. completeness — are required fields populated?
 *   2. uniqueness   — are "unique"/PK fields unique across rows?
 *   3. validity     — does each value match its declared type/pattern?
 *   4. consistency  — do cross-field invariants hold (e.g. start<=end)?
 *   5. timeliness   — are date fields recent / within freshness SLA?
 *   6. accuracy     — do values match reference/allowed lists (enums,
 *                     Israeli banks registry, etc.)?
 *
 * Per-dimension score is a percentage (0..100). The overall grade is
 * derived from a weighted mean via a configurable A..F ladder.
 *
 * DESIGN CONSTRAINTS (per agent brief)
 *
 *   - **Built-ins only.** No third-party deps. Node ≥ 18. BigInt is
 *     used only for the IBAN MOD-97 path.
 *   - **Never delete.** All lookup tables (Israeli bank registry, VAT
 *     authorities, grade ladder, dimension weights) are `Object.freeze`d
 *     and exposed read-only so downstream code cannot mutate or shrink
 *     them at runtime.
 *   - **Bilingual.** Every issue carries both `message` (English) and
 *     `message_he` (Hebrew). Dimension keys are locale-free
 *     identifiers; UI callers can map them via the exported
 *     `DIMENSION_LABELS` table.
 *   - **Deterministic & pure.** `scoreDataset()` has no side effects,
 *     no I/O, no network, no clock reads beyond what the caller passes
 *     via `options.now`.
 *
 * ISRAELI-SPECIFIC VALIDATIONS
 *
 *   - **Israeli ID** — 9-digit Luhn-style checksum (Teudat Zehut),
 *     per the spec on www.gov.il/he/departments/general/identity-number.
 *     Values shorter than 9 digits are left-padded with zeros before
 *     the checksum is computed (matches the official behaviour).
 *   - **IBAN IL** — exact 23-char length, ISO 13616 MOD-97 MOD check.
 *     The bank-code prefix is cross-checked against the frozen
 *     `ISRAELI_BANKS` registry for the accuracy dimension.
 *   - **Israeli VAT / Company number** — 9-digit Osek Morshe / Hevra,
 *     with the Tax Authority checksum (see AG-94 / AG-95 reports).
 *   - **Hebrew-only text fields** — must contain at least one Hebrew
 *     code-point and must not contain any Latin letters. Digits,
 *     whitespace, punctuation and common symbols are allowed.
 *   - **Phone +972** — E.164 Israeli phones: `+972` + 8..9 digits,
 *     leading trunk digit in {2,3,4,5,7,8,9} (mobile: 5; landlines:
 *     2/3/4/7/8/9; VoIP/premium: 7). A bare `0XXXXXXXXX` form is also
 *     accepted and internally normalised to `+972XXXXXXXXX`.
 *
 * PUBLIC API
 *
 *   new DataQualityScorer(options?)
 *   scorer.scoreDataset(rows, schema)   → QualityReport
 *   validators (exported for reuse):
 *     isValidIsraeliId, isValidIsraeliIban, isValidIsraeliVat,
 *     isHebrewOnlyText, isValidIsraeliPhone, isValidEmail, isValidIso8601
 *
 * @see _qa-reports/AG-Y163-data-quality.md for the QA write-up.
 */

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

/** Declarative description of one column of the dataset under test. */
export interface FieldSchema {
  /** Property name on each row object. */
  name: string;
  /**
   * Declared logical type. Drives the "validity" dimension.
   * - `string|number|boolean|date` are generic.
   * - `israeli_id|iban_il|vat_il|phone_il|hebrew_text|email` trigger
   *   the bilingual Israeli-specific validators.
   */
  type:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'date'
    | 'email'
    | 'israeli_id'
    | 'iban_il'
    | 'vat_il'
    | 'phone_il'
    | 'hebrew_text';
  /** True ⇒ null/undefined/empty-string hits the completeness score. */
  required?: boolean;
  /** True ⇒ duplicate values across rows hit the uniqueness score. */
  unique?: boolean;
  /** Optional regex the value (stringified) must match. */
  pattern?: RegExp;
  /** Optional closed-set of allowed values — drives the accuracy score. */
  enum?: readonly (string | number | boolean)[];
  /** Optional numeric range (inclusive). */
  min?: number;
  max?: number;
  /**
   * Optional freshness SLA in days. If set, any date older than
   * `now - freshnessDays` is reported under the timeliness dimension.
   */
  freshnessDays?: number;
}

/** Cross-field invariant — drives the "consistency" dimension. */
export interface ConsistencyRule {
  /** Stable id used in the issues list. */
  id: string;
  /** Pure predicate over the row. Returning false = rule violated. */
  check: (row: Record<string, unknown>) => boolean;
  /** English failure message (shown in issues[].message). */
  message: string;
  /** Hebrew failure message (shown in issues[].message_he). */
  message_he: string;
}

/** Schema = ordered fields + zero or more consistency rules. */
export interface DatasetSchema {
  fields: readonly FieldSchema[];
  consistency?: readonly ConsistencyRule[];
  /** Optional dataset display names for bilingual reports. */
  name?: string;
  name_he?: string;
}

/** Optional knobs for the scorer. */
export interface ScorerOptions {
  /** Clock injection for timeliness — defaults to `new Date()`. */
  now?: Date;
  /**
   * Dimension weights. Any missing keys fall back to the frozen
   * DEFAULT_WEIGHTS. Weights are normalised to sum to 1 internally.
   */
  weights?: Partial<Record<Dimension, number>>;
  /**
   * Maximum number of issues to keep in the returned report. Defaults
   * to 500 — prevents the caller from OOMing on a dirty 1M-row upload.
   * Setting to 0 disables the cap.
   */
  maxIssues?: number;
}

/** The six dimensions. */
export type Dimension =
  | 'completeness'
  | 'uniqueness'
  | 'validity'
  | 'consistency'
  | 'timeliness'
  | 'accuracy';

/** A single actionable finding. */
export interface QualityIssue {
  dimension: Dimension;
  severity: 'low' | 'medium' | 'high';
  field?: string;
  rowIndex?: number;
  value?: unknown;
  code: string;
  /** English, human-readable. */
  message: string;
  /** Hebrew, human-readable. */
  message_he: string;
}

/** Counts feeding the per-dimension score calculation. */
export interface DimensionStat {
  checked: number;
  failed: number;
  score: number; // 0..100
}

/** Final grade band (A..F). */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Scoring report returned by `scoreDataset`. */
export interface QualityReport {
  datasetName?: string;
  datasetName_he?: string;
  rowCount: number;
  fieldCount: number;
  dimensions: Record<Dimension, DimensionStat>;
  overallScore: number; // 0..100, weighted mean
  grade: Grade;
  issues: QualityIssue[];
  /** Count of issues that were truncated due to `maxIssues`. */
  issuesTruncated: number;
  /**
   * Short bilingual summary lines — safe for direct rendering into
   * a dashboard tile. Order matches the `dimensions` map.
   */
  summary: string[];
  summary_he: string[];
  /** ISO-8601 timestamp of when the report was produced. */
  generatedAt: string;
}

// ----------------------------------------------------------------------
// Frozen tables (never-delete compliance)
// ----------------------------------------------------------------------

/**
 * Default weighting for the six dimensions. Completeness, validity
 * and accuracy get the highest weight because they are the most
 * expensive to fix downstream.
 *
 * FROZEN — tests assert that `delete DEFAULT_WEIGHTS.validity` throws
 * in strict mode.
 */
export const DEFAULT_WEIGHTS: Readonly<Record<Dimension, number>> = Object.freeze({
  completeness: 0.2,
  uniqueness: 0.15,
  validity: 0.25,
  consistency: 0.15,
  timeliness: 0.1,
  accuracy: 0.15,
});

/** Grade ladder — values are *lower* bounds (≥). FROZEN. */
export const GRADE_LADDER: ReadonlyArray<Readonly<{ min: number; grade: Grade }>> =
  Object.freeze([
    Object.freeze({ min: 90, grade: 'A' as const }),
    Object.freeze({ min: 80, grade: 'B' as const }),
    Object.freeze({ min: 70, grade: 'C' as const }),
    Object.freeze({ min: 60, grade: 'D' as const }),
    Object.freeze({ min: 0, grade: 'F' as const }),
  ]);

/** Bilingual labels for the six dimensions. FROZEN. */
export const DIMENSION_LABELS: Readonly<
  Record<Dimension, Readonly<{ en: string; he: string }>>
> = Object.freeze({
  completeness: Object.freeze({ en: 'Completeness', he: 'שלמות' }),
  uniqueness: Object.freeze({ en: 'Uniqueness', he: 'ייחודיות' }),
  validity: Object.freeze({ en: 'Validity', he: 'תקפות' }),
  consistency: Object.freeze({ en: 'Consistency', he: 'עקביות' }),
  timeliness: Object.freeze({ en: 'Timeliness', he: 'עדכניות' }),
  accuracy: Object.freeze({ en: 'Accuracy', he: 'דיוק' }),
});

/**
 * Israeli banks registry (subset) — frozen. Used by the accuracy
 * dimension to cross-check the bank-code prefix of IL-IBAN values.
 *
 * Keyed on the 2-digit Bank of Israel bank code (zero-padded string).
 * Names match AG-92's iban validator for cross-consistency.
 */
export const ISRAELI_BANKS: Readonly<Record<string, Readonly<{ en: string; he: string }>>> =
  Object.freeze({
    '04': Object.freeze({ en: 'Yahav', he: 'יהב' }),
    '09': Object.freeze({ en: 'Bank of Israel', he: 'בנק ישראל' }),
    '10': Object.freeze({ en: 'Leumi', he: 'לאומי' }),
    '11': Object.freeze({ en: 'Discount', he: 'דיסקונט' }),
    '12': Object.freeze({ en: 'Mizrahi Tefahot', he: 'מזרחי טפחות' }),
    '13': Object.freeze({ en: 'Igud', he: 'איגוד' }),
    '14': Object.freeze({ en: 'Otzar HaHayal', he: 'אוצר החייל' }),
    '17': Object.freeze({ en: 'Merkantil Discount', he: 'מרכנתיל דיסקונט' }),
    '20': Object.freeze({ en: 'Mizrachi (legacy)', he: 'מזרחי (ישן)' }),
    '26': Object.freeze({ en: 'Union Bank', he: 'יובנק' }),
    '31': Object.freeze({ en: 'Hapoalim', he: 'הפועלים' }),
    '34': Object.freeze({ en: 'Arab Israel Bank', he: 'ערבי ישראלי' }),
    '46': Object.freeze({ en: 'Massad', he: 'מסד' }),
    '52': Object.freeze({ en: 'Poalei Agudat Israel', he: 'פועלי אגודת ישראל' }),
    '54': Object.freeze({ en: 'Jerusalem', he: 'ירושלים' }),
    '65': Object.freeze({ en: 'First International', he: 'הבינלאומי הראשון' }),
    '90': Object.freeze({ en: 'HaDoar / Postal Bank', he: 'הדואר' }),
    '99': Object.freeze({ en: 'Postal Bank', he: 'בנק הדואר' }),
  });

// ----------------------------------------------------------------------
// Low-level predicates — exported for reuse & direct testing
// ----------------------------------------------------------------------

/**
 * Israeli Teudat Zehut (9-digit national ID) checksum.
 *
 * Algorithm (per gov.il):
 *   1. If shorter than 9 digits, left-pad with zeros.
 *   2. Multiply each digit by alternating 1,2,1,2,1,2,1,2,1.
 *   3. If any product ≥ 10, replace it with (digit//10 + digit%10)
 *      (i.e. sum the digits of the product).
 *   4. Sum all nine results. Valid iff sum mod 10 === 0.
 *
 * Rejects: non-strings, anything containing non-digits, strings with
 * more than 9 digits, the trivial all-zeros case.
 */
export function isValidIsraeliId(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const raw = String(value).trim();
  if (raw.length === 0) return false;
  if (!/^\d+$/.test(raw)) return false;
  if (raw.length > 9) return false;
  const padded = raw.padStart(9, '0');
  if (padded === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = padded.charCodeAt(i) - 48;
    const mult = (i % 2) + 1; // 1,2,1,2,...
    digit *= mult;
    if (digit >= 10) digit = Math.floor(digit / 10) + (digit % 10);
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Israeli IBAN (ISO 13616) validator. Checks format, 23-char length,
 * MOD-97 checksum, and (for the accuracy dimension) that the 2-digit
 * bank-code prefix maps to a known Bank of Israel entry.
 *
 * Returns an object so callers can distinguish "wrong checksum" from
 * "unknown bank code".
 */
export function validateIsraeliIban(value: unknown): {
  valid: boolean;
  bankCode?: string;
  knownBank: boolean;
  reason?: string;
} {
  if (typeof value !== 'string') return { valid: false, knownBank: false, reason: 'not_string' };
  const normalized = value.replace(/[\s\u00A0\u200E\u200F]/g, '').toUpperCase();
  if (!/^IL\d{2}[0-9A-Z]+$/.test(normalized)) {
    return { valid: false, knownBank: false, reason: 'bad_format' };
  }
  if (normalized.length !== 23) {
    return { valid: false, knownBank: false, reason: 'bad_length' };
  }
  // MOD-97: move first 4 chars to end, letters → digits (A=10..Z=35).
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const c = rearranged.charCodeAt(i);
    if (c >= 48 && c <= 57) numeric += rearranged[i];
    else if (c >= 65 && c <= 90) numeric += String(c - 55);
    else return { valid: false, knownBank: false, reason: 'bad_char' };
  }
  let mod = 0;
  // Process in chunks to avoid BigInt dep for typical sizes; BigInt is
  // still safe here but a chunked reduce is faster & zero-dep.
  for (let i = 0; i < numeric.length; i += 7) {
    mod = Number(String(mod) + numeric.slice(i, i + 7)) % 97;
  }
  if (mod !== 1) return { valid: false, knownBank: false, reason: 'bad_check_digit' };
  // BBAN layout for Israel: bank(3) branch(3) account(13) — normalise
  // the stored key to a 2-digit zero-padded code so the registry key
  // matches both "10" and "010".
  const rawBank = normalized.slice(4, 7); // "010"
  const bankKey = rawBank.replace(/^0+/, '').padStart(2, '0');
  const knownBank = Object.prototype.hasOwnProperty.call(ISRAELI_BANKS, bankKey);
  return { valid: true, bankCode: bankKey, knownBank };
}

/** Back-compat boolean wrapper used by the validity dimension. */
export function isValidIsraeliIban(value: unknown): boolean {
  return validateIsraeliIban(value).valid;
}

/**
 * Israeli VAT / Osek Morshe / Hevra number (9 digits). Checksum is
 * the Tax Authority's "mod-11 weighted" variant:
 *
 *   weight[i] = (i % 2 === 0) ? 1 : 2
 *   digit *= weight; if (digit > 9) digit -= 9
 *   sum % 10 === 0
 *
 * Same idea as Teudat Zehut but always exactly 9 digits (no
 * zero-padding shortcut — Osek numbers are issued at full length).
 */
export function isValidIsraeliVat(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const raw = String(value).trim();
  if (!/^\d{9}$/.test(raw)) return false;
  if (raw === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = raw.charCodeAt(i) - 48;
    const w = (i % 2) + 1;
    d *= w;
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Hebrew-only text predicate. Non-empty, contains at least one Hebrew
 * code-point (U+0590..U+05FF), and contains no Latin letters. Digits,
 * spaces, punctuation and common symbols (e.g. "׳", "״", "-") are ok.
 */
export function isHebrewOnlyText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  if (/[A-Za-z]/.test(value)) return false;
  return /[\u0590-\u05FF]/.test(value);
}

/**
 * Israeli phone validator. Accepts:
 *   - +972XXXXXXXX  (8-9 digits after the +972)
 *   - 0XXXXXXXXX    (local form, 9-10 digits starting with 0)
 *
 * Trunk-digit whitelist per Ministry of Communications numbering plan:
 * 2 3 4 5 7 8 9 (6 is unassigned for subscriber numbers).
 */
export function isValidIsraeliPhone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const cleaned = value.replace(/[\s\-()]/g, '');
  // International E.164 form
  let m = /^\+972(\d{8,9})$/.exec(cleaned);
  if (m) {
    const trunk = m[1]!.charAt(0);
    return /[2-57-9]/.test(trunk);
  }
  // Local form
  m = /^0(\d{8,9})$/.exec(cleaned);
  if (m) {
    const trunk = m[1]!.charAt(0);
    return /[2-57-9]/.test(trunk);
  }
  return false;
}

/**
 * RFC 5322 "lite" email validator. We intentionally don't try to
 * match the full grammar — that's a rabbit-hole and every enterprise
 * app has its own opinion. This catches 99% of real-world typos.
 */
export function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Strict ISO-8601 date-ish parser used by the date validity check. */
export function isValidIso8601(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  // Accept both date-only (YYYY-MM-DD) and full ISO timestamps.
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return false;
  }
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

// ----------------------------------------------------------------------
// Scorer
// ----------------------------------------------------------------------

/**
 * Grades a dataset on the six classical data-quality dimensions.
 *
 * ```ts
 * const scorer = new DataQualityScorer();
 * const report = scorer.scoreDataset(rows, {
 *   fields: [
 *     { name: 'id',      type: 'israeli_id', required: true, unique: true },
 *     { name: 'iban',    type: 'iban_il',    required: true },
 *     { name: 'name_he', type: 'hebrew_text', required: true },
 *     { name: 'phone',   type: 'phone_il' },
 *     { name: 'updated', type: 'date', freshnessDays: 365 },
 *   ],
 *   consistency: [
 *     {
 *       id: 'dates-order',
 *       check: (r) => !(r['start_date'] && r['end_date'])
 *         || new Date(String(r['start_date'])) <= new Date(String(r['end_date'])),
 *       message: 'start_date must be ≤ end_date',
 *       message_he: 'תאריך התחלה חייב להיות ≤ תאריך סיום',
 *     },
 *   ],
 * });
 * console.log(report.grade, report.overallScore);
 * ```
 */
export class DataQualityScorer {
  private readonly now: Date;
  private readonly weights: Readonly<Record<Dimension, number>>;
  private readonly maxIssues: number;

  constructor(options: ScorerOptions = {}) {
    this.now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
    // Merge & normalise weights
    const merged: Record<Dimension, number> = {
      completeness: DEFAULT_WEIGHTS.completeness,
      uniqueness: DEFAULT_WEIGHTS.uniqueness,
      validity: DEFAULT_WEIGHTS.validity,
      consistency: DEFAULT_WEIGHTS.consistency,
      timeliness: DEFAULT_WEIGHTS.timeliness,
      accuracy: DEFAULT_WEIGHTS.accuracy,
    };
    if (options.weights) {
      for (const k of Object.keys(merged) as Dimension[]) {
        const v = options.weights[k];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
          merged[k] = v;
        }
      }
    }
    const total = Object.values(merged).reduce((a, b) => a + b, 0) || 1;
    for (const k of Object.keys(merged) as Dimension[]) {
      merged[k] = merged[k] / total;
    }
    this.weights = Object.freeze(merged);
    const cap = options.maxIssues;
    this.maxIssues = typeof cap === 'number' && cap >= 0 ? cap : 500;
  }

  /**
   * Grades a dataset. Pure function — no side effects beyond reading
   * the injected `now` and the provided inputs.
   */
  scoreDataset(
    rows: ReadonlyArray<Record<string, unknown>>,
    schema: DatasetSchema,
  ): QualityReport {
    const issues: QualityIssue[] = [];
    let issuesTruncated = 0;
    const pushIssue = (issue: QualityIssue): void => {
      if (this.maxIssues === 0 || issues.length < this.maxIssues) {
        issues.push(issue);
      } else {
        issuesTruncated++;
      }
    };

    // Defensive input normalisation
    const safeRows: ReadonlyArray<Record<string, unknown>> = Array.isArray(rows) ? rows : [];
    const fields = schema.fields ?? [];
    const rules = schema.consistency ?? [];

    // Pre-allocate dimension counters
    const stats: Record<Dimension, { checked: number; failed: number }> = {
      completeness: { checked: 0, failed: 0 },
      uniqueness: { checked: 0, failed: 0 },
      validity: { checked: 0, failed: 0 },
      consistency: { checked: 0, failed: 0 },
      timeliness: { checked: 0, failed: 0 },
      accuracy: { checked: 0, failed: 0 },
    };

    // ------------------------------------------------------------------
    // Per-field passes (completeness / validity / accuracy / timeliness)
    // ------------------------------------------------------------------
    for (const field of fields) {
      const uniqueSeen: Map<string, number> = field.unique ? new Map() : new Map();

      for (let rowIdx = 0; rowIdx < safeRows.length; rowIdx++) {
        const row = safeRows[rowIdx] ?? {};
        const value = row[field.name];

        // --- Completeness ---
        if (field.required) {
          stats.completeness.checked++;
          if (isEmpty(value)) {
            stats.completeness.failed++;
            pushIssue({
              dimension: 'completeness',
              severity: 'high',
              field: field.name,
              rowIndex: rowIdx,
              value,
              code: 'missing_required',
              message: `Required field "${field.name}" is empty`,
              message_he: `שדה חובה "${field.name}" ריק`,
            });
            continue; // no point validating a missing value
          }
        } else if (isEmpty(value)) {
          // Optional + empty ⇒ skip remaining per-field checks
          continue;
        }

        // --- Validity (type/pattern/range) ---
        stats.validity.checked++;
        const validityFailure = this.checkValidity(field, value);
        if (validityFailure) {
          stats.validity.failed++;
          pushIssue({
            dimension: 'validity',
            severity: 'high',
            field: field.name,
            rowIndex: rowIdx,
            value,
            code: validityFailure.code,
            message: validityFailure.message,
            message_he: validityFailure.message_he,
          });
        }

        // --- Uniqueness ---
        if (field.unique) {
          stats.uniqueness.checked++;
          const key = canonicalKey(value);
          const firstIdx = uniqueSeen.get(key);
          if (firstIdx === undefined) {
            uniqueSeen.set(key, rowIdx);
          } else {
            stats.uniqueness.failed++;
            pushIssue({
              dimension: 'uniqueness',
              severity: 'high',
              field: field.name,
              rowIndex: rowIdx,
              value,
              code: 'duplicate_value',
              message: `Duplicate value in unique field "${field.name}" (first seen at row ${firstIdx})`,
              message_he: `ערך כפול בשדה ייחודי "${field.name}" (נראה לראשונה בשורה ${firstIdx})`,
            });
          }
        }

        // --- Accuracy (enum / reference data) ---
        if (field.enum && field.enum.length > 0) {
          stats.accuracy.checked++;
          const asPrim = value as string | number | boolean;
          if (!field.enum.includes(asPrim)) {
            stats.accuracy.failed++;
            pushIssue({
              dimension: 'accuracy',
              severity: 'medium',
              field: field.name,
              rowIndex: rowIdx,
              value,
              code: 'not_in_enum',
              message: `Value for "${field.name}" is not in the allowed set`,
              message_he: `הערך של "${field.name}" אינו ברשימת הערכים המותרים`,
            });
          }
        }
        // Additional accuracy signal: IL-IBAN bank code must be in
        // the frozen Israeli banks registry. A MOD-97-valid IBAN whose
        // bank code is unknown is a classic "data-entry typo that
        // still passes ISO 13616" — surfaces as an accuracy issue,
        // not a validity issue.
        if (field.type === 'iban_il') {
          const parsed = validateIsraeliIban(value);
          if (parsed.valid) {
            stats.accuracy.checked++;
            if (!parsed.knownBank) {
              stats.accuracy.failed++;
              pushIssue({
                dimension: 'accuracy',
                severity: 'medium',
                field: field.name,
                rowIndex: rowIdx,
                value,
                code: 'unknown_bank_code',
                message: `IBAN bank code "${parsed.bankCode ?? '??'}" is not a known Bank of Israel code`,
                message_he: `קוד בנק ב-IBAN "${parsed.bankCode ?? '??'}" אינו מוכר במרשם בנק ישראל`,
              });
            }
          }
        }

        // --- Timeliness ---
        if (field.type === 'date' && typeof field.freshnessDays === 'number') {
          stats.timeliness.checked++;
          const ts = toTimestamp(value);
          if (ts === null) {
            stats.timeliness.failed++;
            pushIssue({
              dimension: 'timeliness',
              severity: 'low',
              field: field.name,
              rowIndex: rowIdx,
              value,
              code: 'timeliness_unparseable',
              message: `Cannot evaluate timeliness: "${field.name}" is not a parseable date`,
              message_he: `לא ניתן להעריך עדכניות: "${field.name}" אינו תאריך תקין`,
            });
          } else {
            const ageMs = this.now.getTime() - ts;
            const ageDays = ageMs / (24 * 60 * 60 * 1000);
            if (ageDays > field.freshnessDays) {
              stats.timeliness.failed++;
              pushIssue({
                dimension: 'timeliness',
                severity: 'medium',
                field: field.name,
                rowIndex: rowIdx,
                value,
                code: 'stale_record',
                message: `Field "${field.name}" is ${Math.round(ageDays)}d old (SLA ${field.freshnessDays}d)`,
                message_he: `השדה "${field.name}" בן ${Math.round(ageDays)} ימים (SLA ${field.freshnessDays} ימים)`,
              });
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Consistency pass
    // ------------------------------------------------------------------
    for (const rule of rules) {
      for (let rowIdx = 0; rowIdx < safeRows.length; rowIdx++) {
        const row = safeRows[rowIdx] ?? {};
        stats.consistency.checked++;
        let passed = false;
        try {
          passed = rule.check(row) === true;
        } catch {
          passed = false;
        }
        if (!passed) {
          stats.consistency.failed++;
          pushIssue({
            dimension: 'consistency',
            severity: 'medium',
            rowIndex: rowIdx,
            code: `consistency:${rule.id}`,
            message: rule.message,
            message_he: rule.message_he,
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // Finalise — convert counters to percentages & compute the grade
    // ------------------------------------------------------------------
    const dims: Record<Dimension, DimensionStat> = {
      completeness: toDimStat(stats.completeness),
      uniqueness: toDimStat(stats.uniqueness),
      validity: toDimStat(stats.validity),
      consistency: toDimStat(stats.consistency),
      timeliness: toDimStat(stats.timeliness),
      accuracy: toDimStat(stats.accuracy),
    };
    let overall = 0;
    for (const k of Object.keys(dims) as Dimension[]) {
      overall += dims[k].score * this.weights[k];
    }
    overall = roundTo(overall, 2);
    const grade = toGrade(overall);

    const summary: string[] = [];
    const summary_he: string[] = [];
    for (const k of Object.keys(dims) as Dimension[]) {
      const lbl = DIMENSION_LABELS[k];
      const d = dims[k];
      summary.push(`${lbl.en}: ${d.score.toFixed(1)}% (${d.failed}/${d.checked})`);
      summary_he.push(`${lbl.he}: ${d.score.toFixed(1)}% (${d.failed}/${d.checked})`);
    }

    return {
      datasetName: schema.name,
      datasetName_he: schema.name_he,
      rowCount: safeRows.length,
      fieldCount: fields.length,
      dimensions: dims,
      overallScore: overall,
      grade,
      issues,
      issuesTruncated,
      summary,
      summary_he,
      generatedAt: new Date(this.now.getTime()).toISOString(),
    };
  }

  // --------------------------------------------------------------------
  // Validity — delegates to the low-level predicates above
  // --------------------------------------------------------------------
  private checkValidity(
    field: FieldSchema,
    value: unknown,
  ): { code: string; message: string; message_he: string } | null {
    // Type check first
    switch (field.type) {
      case 'string':
        if (typeof value !== 'string') return fail('not_string', field.name, 'string', 'מחרוזת');
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return fail('not_number', field.name, 'number', 'מספר');
        }
        break;
      case 'integer':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return fail('not_integer', field.name, 'integer', 'מספר שלם');
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') return fail('not_boolean', field.name, 'boolean', 'בוליאני');
        break;
      case 'date':
        if (!isValidIso8601(value)) {
          return fail('not_date', field.name, 'ISO-8601 date', 'תאריך בפורמט ISO-8601');
        }
        break;
      case 'email':
        if (!isValidEmail(value)) {
          return {
            code: 'bad_email',
            message: `Field "${field.name}" is not a valid email`,
            message_he: `השדה "${field.name}" אינו כתובת דוא"ל תקינה`,
          };
        }
        break;
      case 'israeli_id':
        if (!isValidIsraeliId(value)) {
          return {
            code: 'bad_israeli_id',
            message: `Field "${field.name}" is not a valid Israeli ID (bad checksum)`,
            message_he: `השדה "${field.name}" אינו ת"ז ישראלית תקינה (ספרת ביקורת שגויה)`,
          };
        }
        break;
      case 'iban_il': {
        const r = validateIsraeliIban(value);
        if (!r.valid) {
          return {
            code: `bad_iban_il:${r.reason ?? 'unknown'}`,
            message: `Field "${field.name}" is not a valid Israeli IBAN (${r.reason ?? 'unknown'})`,
            message_he: `השדה "${field.name}" אינו IBAN ישראלי תקין`,
          };
        }
        break;
      }
      case 'vat_il':
        if (!isValidIsraeliVat(value)) {
          return {
            code: 'bad_vat_il',
            message: `Field "${field.name}" is not a valid Israeli VAT/Osek number`,
            message_he: `השדה "${field.name}" אינו מספר עוסק/ח.פ. ישראלי תקין`,
          };
        }
        break;
      case 'phone_il':
        if (!isValidIsraeliPhone(value)) {
          return {
            code: 'bad_phone_il',
            message: `Field "${field.name}" is not a valid Israeli phone (+972)`,
            message_he: `השדה "${field.name}" אינו מספר טלפון ישראלי תקין (+972)`,
          };
        }
        break;
      case 'hebrew_text':
        if (!isHebrewOnlyText(value)) {
          return {
            code: 'not_hebrew_text',
            message: `Field "${field.name}" must contain Hebrew text (no Latin letters)`,
            message_he: `השדה "${field.name}" חייב להכיל טקסט עברי (ללא אותיות לטיניות)`,
          };
        }
        break;
      default: {
        // Exhaustiveness guard — unreachable under the FieldSchema union.
        const _never: never = field.type;
        void _never;
      }
    }

    // Pattern
    if (field.pattern) {
      const s = typeof value === 'string' ? value : String(value);
      if (!field.pattern.test(s)) {
        return {
          code: 'pattern_mismatch',
          message: `Field "${field.name}" does not match the required pattern`,
          message_he: `השדה "${field.name}" אינו תואם את התבנית הנדרשת`,
        };
      }
    }
    // Range
    if (typeof value === 'number') {
      if (typeof field.min === 'number' && value < field.min) {
        return {
          code: 'below_min',
          message: `Field "${field.name}" is below minimum ${field.min}`,
          message_he: `השדה "${field.name}" קטן מהמינימום ${field.min}`,
        };
      }
      if (typeof field.max === 'number' && value > field.max) {
        return {
          code: 'above_max',
          message: `Field "${field.name}" exceeds maximum ${field.max}`,
          message_he: `השדה "${field.name}" גדול מהמקסימום ${field.max}`,
        };
      }
    }
    return null;
  }
}

// ----------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim().length === 0) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function canonicalKey(v: unknown): string {
  if (v === null || v === undefined) return '\u0000null';
  if (typeof v === 'string') return 's:' + v.trim().toLowerCase();
  if (typeof v === 'number') return 'n:' + String(v);
  if (typeof v === 'boolean') return 'b:' + String(v);
  if (v instanceof Date) return 'd:' + String(v.getTime());
  try {
    return 'j:' + JSON.stringify(v);
  } catch {
    return 'o:' + Object.prototype.toString.call(v);
  }
}

function toTimestamp(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === 'string' && isValidIso8601(v)) {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function toDimStat(s: { checked: number; failed: number }): DimensionStat {
  if (s.checked === 0) return { checked: 0, failed: 0, score: 100 };
  const score = roundTo(((s.checked - s.failed) / s.checked) * 100, 2);
  return { checked: s.checked, failed: s.failed, score };
}

function toGrade(score: number): Grade {
  for (const row of GRADE_LADDER) {
    if (score >= row.min) return row.grade;
  }
  return 'F';
}

function roundTo(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function fail(
  code: string,
  fieldName: string,
  en: string,
  he: string,
): { code: string; message: string; message_he: string } {
  return {
    code,
    message: `Field "${fieldName}" must be a ${en}`,
    message_he: `השדה "${fieldName}" חייב להיות ${he}`,
  };
}
