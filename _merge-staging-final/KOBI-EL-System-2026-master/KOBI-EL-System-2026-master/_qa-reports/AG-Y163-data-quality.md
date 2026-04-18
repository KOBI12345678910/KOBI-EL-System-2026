# AG-Y163 — Data Quality Scorer / מדרג איכות נתונים

**Agent:** Y-163
**Module:** `onyx-ai/src/quality/data-quality.ts`
**Wave:** Techno-Kol Uzi mega-ERP — Data Governance
**Date:** 2026-04-11
**Status:** GREEN — 25 / 25 tests passing
**Deps added:** 0 (built-ins only / ללא תלויות חיצוניות)

---

## 1. Scope / היקף

**EN.** Deliver a pure-TypeScript, zero-dependency engine that grades
an arbitrary tabular dataset on the six classical data-quality
dimensions (completeness, uniqueness, validity, consistency,
timeliness, accuracy) and emits a bilingual actionable issues list
plus an overall A..F letter grade. Israeli compliance is non-negotiable:
Teudat Zehut, IL IBAN, Osek / Hevra VAT number, Hebrew-only text fields,
and +972 phones are first-class validators.

**HE.** לספק מנוע TypeScript טהור וללא תלויות חיצוניות, אשר מדרג כל
מערך נתונים טבלאי לפי שישה מימדי איכות קלאסיים (שלמות, ייחודיות,
תקפות, עקביות, עדכניות, דיוק), מפיק רשימת בעיות דו-לשונית ומעניק
ציון כולל מ-A עד F. תאימות ישראלית הינה קריטית: ת"ז, IBAN ישראלי,
מספר ח"פ / עוסק מורשה, שדות טקסט עברי בלבד, וטלפונים עם קידומת +972
נתמכים כולם כסוגי שדה ראשיים.

---

## 2. Files delivered / קבצים

| File                                                             | Role / תפקיד                | LOC  |
|------------------------------------------------------------------|-----------------------------|------|
| `onyx-ai/src/quality/data-quality.ts`                            | Scorer + validators         | ~660 |
| `onyx-ai/test/quality/data-quality.test.ts`                      | Unit test suite             | ~470 |
| `_qa-reports/AG-Y163-data-quality.md`                            | This report                 | n/a  |

Both directories (`src/quality/` and `test/quality/`) were new and
were created by this agent. Nothing was removed or renamed.

---

## 3. Public API / ממשק ציבורי

```ts
import {
  DataQualityScorer,
  DEFAULT_WEIGHTS,
  DIMENSION_LABELS,
  GRADE_LADDER,
  ISRAELI_BANKS,
  // low-level predicates
  isValidIsraeliId,
  isValidIsraeliIban,
  validateIsraeliIban,
  isValidIsraeliVat,
  isHebrewOnlyText,
  isValidIsraeliPhone,
  isValidEmail,
  isValidIso8601,
} from './quality/data-quality';

const scorer = new DataQualityScorer({
  now: new Date('2026-04-11T12:00:00Z'), // optional clock injection
  weights: { validity: 0.4 },             // optional; normalised internally
  maxIssues: 500,                         // optional; default 500, 0 = unlimited
});

const report = scorer.scoreDataset(rows, {
  name: 'Employees',
  name_he: 'עובדים',
  fields: [
    { name: 'id',      type: 'israeli_id',  required: true, unique: true },
    { name: 'iban',    type: 'iban_il',     required: true },
    { name: 'name_he', type: 'hebrew_text', required: true },
    { name: 'email',   type: 'email',       required: true },
    { name: 'phone',   type: 'phone_il' },
    { name: 'vat',     type: 'vat_il' },
    { name: 'role',    type: 'string',      required: true,
      enum: ['engineer', 'manager', 'accountant'] as const },
    { name: 'salary',  type: 'number',      min: 5000, max: 100000 },
    { name: 'updated', type: 'date',        freshnessDays: 30 },
  ],
  consistency: [
    {
      id: 'start-before-end',
      check: (r) => new Date(String(r['start_date'])) <= new Date(String(r['end_date'])),
      message: 'start_date must be ≤ end_date',
      message_he: 'תאריך התחלה חייב להיות ≤ תאריך סיום',
    },
  ],
});

// Every issue has message + message_he
// report.grade === 'A' | 'B' | 'C' | 'D' | 'F'
// report.overallScore is the weighted mean (0..100)
```

### Supported `FieldSchema.type` values

| type           | meaning                                                 |
|----------------|---------------------------------------------------------|
| `string`       | generic string                                          |
| `number`       | finite number (range via `min`/`max`)                   |
| `integer`      | `Number.isInteger` + range                              |
| `boolean`      | primitive boolean                                       |
| `date`         | ISO-8601 string or `Date` instance                      |
| `email`        | RFC 5322 "lite"                                         |
| `israeli_id`   | 9-digit Teudat Zehut + checksum                         |
| `iban_il`      | IL 23-char ISO 13616 + bank registry                    |
| `vat_il`       | 9-digit Osek Morshe / Hevra + Tax Authority checksum    |
| `phone_il`     | `+972...` E.164 or `0...` local form                    |
| `hebrew_text`  | ≥1 Hebrew code-point, no Latin letters                  |

### Output shape

```ts
interface QualityReport {
  datasetName?: string;
  datasetName_he?: string;
  rowCount: number;
  fieldCount: number;
  dimensions: Record<Dimension, { checked: number; failed: number; score: number }>;
  overallScore: number;           // weighted mean, 0..100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: QualityIssue[];         // capped by options.maxIssues
  issuesTruncated: number;
  summary: string[];              // English per-dimension lines
  summary_he: string[];           // Hebrew per-dimension lines
  generatedAt: string;            // ISO-8601
}

interface QualityIssue {
  dimension: Dimension;
  severity: 'low' | 'medium' | 'high';
  field?: string;
  rowIndex?: number;
  value?: unknown;
  code: string;                   // stable id, e.g. 'missing_required'
  message: string;                // English
  message_he: string;             // Hebrew
}
```

---

## 4. Dimensions / מימדים

### 4.1 Completeness — שלמות

- Any field marked `required: true` with a null / undefined / empty
  string / empty array value fires `missing_required` at severity
  `high`.
- Score = `(checked - failed) / checked × 100`.
- Empty schema → dimension defaults to 100.

### 4.2 Uniqueness — ייחודיות

- Any field marked `unique: true` is tracked per-dataset in a
  `Map<canonicalKey, rowIndex>`. Duplicates fire `duplicate_value`
  at severity `high` and include the index of the first occurrence.
- Canonicalisation: strings are trimmed + lowercased, numbers
  stringified, booleans/dates handled specially, objects JSON-serialised.

### 4.3 Validity — תקפות

- Type check per `FieldSchema.type` (see §3 table).
- Optional `pattern: RegExp` must match the stringified value.
- Optional numeric `min`/`max` (inclusive).
- Israeli-specific validators (ID, IBAN, VAT, Hebrew text, phone) are
  called here. Each rejection has a stable error `code`.

### 4.4 Consistency — עקביות

- Caller supplies pure `(row) => boolean` predicates with a stable
  `id` and bilingual failure messages.
- Predicate exceptions are treated as `false` (no test blow-up if a
  rule crashes on a malformed row).

### 4.5 Timeliness — עדכניות

- Triggered when a `date`-typed field has `freshnessDays` set.
- `now - value > freshnessDays` → `stale_record` (severity `medium`).
- Unparseable date → `timeliness_unparseable` (severity `low`).
- `now` is injectable via `ScorerOptions.now` for deterministic tests.

### 4.6 Accuracy — דיוק

- Any field with an `enum` array: values outside the set fire
  `not_in_enum` at severity `medium`.
- **Bonus path for IL IBANs:** a MOD-97-valid IBAN whose 2-digit
  bank-code prefix is NOT in the frozen `ISRAELI_BANKS` registry
  fires `unknown_bank_code` — because it's the classic "data-entry
  typo that still happens to pass ISO 13616". This sits in accuracy,
  not validity, per Bank of Israel guidance.

---

## 5. Dimension weights + grading / משקלים ודירוג

Default weights (frozen, sum = 1.00):

| dimension     | weight | rationale                                      |
|---------------|--------|------------------------------------------------|
| completeness  | 0.20   | cheapest to measure, blocks downstream joins   |
| uniqueness    | 0.15   | PKs are load-bearing                           |
| validity      | 0.25   | highest — catches the widest class of bugs     |
| consistency   | 0.15   | caller-defined rules                           |
| timeliness    | 0.10   | SLA-bound only                                 |
| accuracy      | 0.15   | enum / reference-data match                    |

Custom weights are accepted via `options.weights` and are
**normalised to sum=1** internally; partial overrides are allowed.
The frozen `DEFAULT_WEIGHTS` is never mutated — a regression test
enforces this.

Grade ladder (frozen):

```
A  ≥ 90
B  ≥ 80
C  ≥ 70
D  ≥ 60
F  <  60
```

---

## 6. Israeli validators — algorithms / אלגוריתמים

### 6.1 Teudat Zehut (Israeli ID) / ת"ז

1. Reject anything that isn't a 1..9 digit string/number.
2. Left-pad with zeros to length 9 (matches gov.il behaviour).
3. Multiply each digit by alternating `1, 2, 1, 2, ..., 1`.
4. If any product ≥ 10, replace it with `⌊p/10⌋ + p mod 10`.
5. Sum; valid iff `sum mod 10 === 0`.
6. The all-zeros placeholder is explicitly rejected.

### 6.2 IL IBAN / IBAN ישראלי

1. Strip whitespace + BiDi marks, uppercase.
2. Format must be `^IL\d{2}[0-9A-Z]+$`, length exactly 23.
3. Move first 4 chars to the end. Letters → digits (`A=10..Z=35`).
4. Compute `num mod 97` via 7-digit chunked reduce (no BigInt needed
   for 23-char inputs — we use the `mod = Number(str(mod)+chunk) % 97`
   loop, which is both correct and zero-dep).
5. Valid iff result `=== 1`.
6. For the accuracy signal, the 2-digit bank code (`bban[0..3]`,
   stripped of leading zeros, re-padded to 2 digits) is looked up
   in the frozen `ISRAELI_BANKS` registry. AG-92's canonical test
   vectors are cross-checked in `DQ.2.1`.

### 6.3 Osek Morshe / Hevra (VAT) / ח"פ / עוסק מורשה

1. Exactly 9 digits.
2. Weights `1,2,1,2,...`. If product > 9, subtract 9.
3. Sum; valid iff `sum mod 10 === 0`.
4. `000000000` placeholder rejected.

### 6.4 Hebrew-only text / טקסט עברי בלבד

- Non-empty string.
- Must contain at least one U+0590..U+05FF code-point.
- Must NOT contain any `[A-Za-z]` Latin letters.
- Digits, spaces, `׳`, `״`, `-`, punctuation and common symbols are
  all permitted (legal names in Israel routinely contain them).

### 6.5 Phone +972 / טלפון ישראלי

- Separators `\s`, `-`, `(`, `)` are stripped before matching.
- E.164: `+972XXXXXXXX` or `+972XXXXXXXXX`.
- Local: `0XXXXXXXXX` or `0XXXXXXXX`.
- Trunk digit (the one right after `+972` or `0`) must be one of
  `2 3 4 5 7 8 9`. The digit `6` is unassigned for subscriber
  numbers per the Ministry of Communications numbering plan.

---

## 7. Test results / תוצאות בדיקות

```
✔ DQ.1.1 valid 9-digit Israeli ID passes
✔ DQ.1.2 short ID is left-padded then validated
✔ DQ.1.3 bad checksum rejected
✔ DQ.1.4 non-numeric / null / empty rejected
✔ DQ.2.1 all AG-92 canonical IL IBANs pass
✔ DQ.2.2 wrong length / bad format rejected
✔ DQ.2.3 IL IBAN with unknown bank code reported via accuracy dimension
✔ DQ.3.1 valid 9-digit Osek number passes
✔ DQ.3.2 bad length / bad checksum rejected
✔ DQ.4.1 pure Hebrew passes, Latin rejected
✔ DQ.5.1 E.164 +972 mobile/landline forms pass
✔ DQ.5.2 local 0-prefixed form also accepted
✔ DQ.5.3 unassigned trunk digits and garbage rejected
✔ DQ.6.1 email predicate sanity
✔ DQ.6.2 ISO-8601 predicate accepts date and timestamp forms
✔ DQ.7.1 clean dataset scores 100 / grade A
✔ DQ.7.2 dirty dataset surfaces each dimension
✔ DQ.7.3 empty rows ⇒ every dimension defaults to 100
✔ DQ.7.4 maxIssues cap truncates and reports the truncation
✔ DQ.8.1 grade ladder maps scores as expected
✔ DQ.9.1 summary arrays are bilingual & parallel
✔ DQ.9.2 dataset name is passed through in both languages
✔ DQ.10.1 exported tables are frozen
✔ DQ.10.2 strict-mode delete on frozen table throws
✔ DQ.10.3 custom weights are normalised but defaults unchanged

ℹ tests 25      ℹ suites 0
ℹ pass 25       ℹ fail 0
ℹ duration_ms ~1028
```

**Total scenario count: 25 (≥ 15 required).**

### Coverage of requested scenarios / כיסוי דרישות המטלה

- [x] Israeli ID (9 digits + checksum) — valid, bad-checksum, short,
      non-numeric, null/empty, all-zeros, too-long.
- [x] IBAN IL — canonical AG-92 vectors, wrong length, wrong format,
      wrong country, non-string, fresh-computed unknown-bank-code
      IBAN that passes MOD-97 but surfaces under accuracy.
- [x] VAT / Osek — computed valid, wrong length (both sides), bad
      checksum, non-numeric, all-zeros.
- [x] Hebrew-only — pure Hebrew, Hebrew + digits, Hebrew + hyphen,
      pure Latin rejected, mixed rejected, empty rejected, digits-only
      rejected.
- [x] Phone +972 — mobile E.164, landline E.164, separators tolerated,
      local `0...` form, trunk digit 6 rejected, trunk digit 0 rejected,
      missing `+` rejected, non-IL country code rejected, garbage
      rejected, null rejected.
- [x] Grade ladder — 100/90/89.99/80/75/65/59/0 mapped and asserted.
- [x] Bilingual output — summary array length, Hebrew presence,
      Latin absence, dataset name in both languages.
- [x] Never-delete — all exported tables frozen, nested entries frozen,
      strict-mode `delete` throws, default weights unchanged after
      a scorer run with custom weights.
- [x] Truncation — `maxIssues: 5` on a 20-row feed reports 5 issues
      and `issuesTruncated === 15`, while the dimension counters still
      reflect all 20 rows.

---

## 8. How to run / איך להריץ

```bash
cd onyx-ai

# Direct run of the new suite
npx node --test --require ts-node/register test/quality/data-quality.test.ts

# Typecheck (strict mode)
npx tsc --noEmit
```

Output on a clean run:

```
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

---

## 9. Compliance notes / הערות תאימות

- **Zero dependencies.** Only Node built-ins (`node:test`,
  `node:assert/strict`) and the TypeScript standard library. No
  third-party validators — AG-92 / AG-93 / AG-94 / AG-95's reasoning
  was re-implemented inline per the "built-ins only" rule.
- **Never delete.** `DEFAULT_WEIGHTS`, `GRADE_LADDER`,
  `DIMENSION_LABELS` and `ISRAELI_BANKS` are all `Object.freeze`d
  with frozen nested entries. Tests (DQ.10.*) assert that
  strict-mode `delete` throws, and that a scorer invocation with
  custom weights does not mutate the default table.
- **Bilingual.** Every issue carries both `message` (English) and
  `message_he` (Hebrew), and the report's `summary` / `summary_he`
  arrays are parallel and content-verified (English lines contain no
  Hebrew code-points; Hebrew lines contain at least one).
- **Israeli compliance.** Full 9-digit Teudat Zehut checksum with
  left-padding; 23-char IL IBAN with ISO 13616 MOD-97 + Bank of Israel
  bank-code registry cross-check; 9-digit Osek/Hevra with Tax Authority
  checksum; Ministry of Communications numbering-plan trunk digits
  for phones; Hebrew-only predicate that rejects Latin contamination
  while allowing digits, gershayim, hyphens and whitespace (common
  in real ID-card names).
- **Runtime.** Node ≥ 18 (we rely on nothing newer). TypeScript 5.x,
  `strict: true`, `noImplicitReturns: true`, matches the repo's
  existing `onyx-ai/tsconfig.json`.
- **Purity.** `scoreDataset()` has no I/O, no network, no clock
  reads beyond the injected `options.now`. The default clock is
  captured once in the constructor so a single `DataQualityScorer`
  instance produces deterministic `generatedAt` timestamps — this
  was a deliberate choice for reproducible audit trails.

---

## 10. Known gaps / follow-ups — פערים ידועים

- **Historical Israeli branch directory.** The `ISRAELI_BANKS`
  registry currently holds bank names only; the 3-digit branch code
  part of the IL BBAN is not cross-checked against a sub-registry.
  A future agent should import the Bank of Israel branch CSV and
  add an optional `knownBranch` signal to `validateIsraeliIban`.
- **Additional consistency primitives.** The caller currently passes
  arbitrary predicates. Common patterns (foreign-key lookup, cross-row
  aggregation, running-sum invariants) could be factored into a
  library of `ConsistencyRule` factories.
- **Streaming mode.** `scoreDataset` materialises the full issues
  list (capped by `maxIssues`). A future `scoreStream(asyncIter)`
  could emit dimensions incrementally for 10M+-row feeds.
- **Severity calibration.** Current severities are hard-coded per
  dimension. A future patch could let the caller override them per
  field, or derive them from a data-criticality policy.

None of these are in scope for Y-163 and none block release.

---

**Agent Y-163 signing off. All green. / סוכן Y-163 מסיים את העבודה. הכל תקין.**
