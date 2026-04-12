# AG-95 — Israeli Tax File Validator (תיק ניכויים)

**Agent:** 95
**Date:** 2026-04-11
**Scope:** `onyx-procurement/src/validators/tax-file.js`
**Rule of engagement:** nothing is deleted. This report is additive.

---

## 0. Executive summary

| Deliverable                                        | Status | Notes                                   |
|----------------------------------------------------|--------|-----------------------------------------|
| `src/validators/tax-file.js`                       | **NEW**| 495 lines, zero deps, pure JS           |
| `test/payroll/tax-file.test.js`                    | **NEW**| 47 tests in 8 suites, all green         |
| Hebrew bilingual output                            | **OK** | `reason_he` + `reason_en` on every fail |
| Israeli compliance (Luhn, 9-digit, reserved 000…) | **OK** | Mirrors Shaam / רשות המסים algorithm    |
| Zero runtime dependencies                          | **OK** | only `node:test` for tests              |
| Future online-status hook                          | **OK** | `checkActiveStatus()` stub returns `unknown` |

Test run via the project's own runner:

```
$ node test/run.js --only tax-file
ℹ tests 47
ℹ suites 8
ℹ pass 47
ℹ fail 0
```

---

## 1. Why this module exists

Several parts of `onyx-procurement` already carry a `tax_file_number` field
on company / employer / supplier rows, but none of them actually validate
it before persisting or exporting:

| Caller                                           | Field name            | Currently validated? |
|--------------------------------------------------|-----------------------|----------------------|
| `src/payroll/wage-slip-calculator.js` L362       | `employer.tax_file_number`      | **no**  |
| `src/reports/quarterly-tax-report.js` L1087     | `profile.tax_file_number`       | **no**  |
| `src/reports/quarterly-tax-report.js` L1335     | printed on PDF letterhead       | **no**  |
| `src/tax/form-builders.js` L46                  | emitted into Form 102 / 126 XML | **no**  |

When a bad tax file (wrong length / bad check digit / letters) slips into
any of these, it ends up in a Shaam upload and is rejected server-side
by שע"ם — usually with a confusing Hebrew error. This module provides a
single entry point so the same validation runs everywhere, in the same
way, and emits the same bilingual error codes.

---

## 2. Files created

### 2.1 `onyx-procurement/src/validators/tax-file.js`

Canonical validator. No runtime deps. Exports:

| Symbol                         | Kind      | Purpose |
|--------------------------------|-----------|---------|
| `validateTaxFile(id, type)`    | fn        | Generic validator — returns rich result object |
| `validateWithholdingFile(id)`  | fn        | Shortcut for תיק ניכויים |
| `validateVatFile(id)`          | fn        | Shortcut for תיק מע"מ |
| `validateIncomeTaxFile(id)`    | fn        | Shortcut for תיק מס הכנסה |
| `validateOsekMorsheFile(id)`   | fn        | Shortcut for עוסק מורשה |
| `crossReference(a, b)`         | fn        | Base-number sanity check, returns `{match, confidence, reason}` |
| `checkActiveStatus(id, type)`  | async fn  | Stub hook for future רשות המסים API |
| `normalize(raw)`               | fn        | Strip dashes/spaces/quotes, pad to 9 |
| `luhnIsraeliCheck(id)`         | fn        | Low-level check-digit (Luhn-style) |
| `formatDisplay(id, type)`      | fn        | Canonical `xxx-xxx-xxx` with optional bilingual label |
| `TAX_FILE_TYPES`               | enum      | `withholding`, `vat`, `income_tax`, `osek_morshe` |
| `TYPE_LABELS`                  | const     | Hebrew + English label for each type |
| `REASON_CODES`                 | enum      | `empty`, `non_numeric`, `wrong_length`, `all_zeros`, `check_digit`, `unknown_type`, `not_string`, `reserved_prefix` |
| `REASON_MESSAGES`              | const     | Bilingual text for every reason code |

**Result shape — success:**
```js
{
  valid:      true,
  type:       "withholding",
  display:    "תיק ניכויים / Withholding file: 937-123-453",
  normalized: "937123453",
  raw9:       "937123453"
}
```

**Result shape — failure:**
```js
{
  valid:      false,
  type:       "withholding",
  display:    "<raw input>",
  reason:     "check_digit",
  reason_he:  "ספרת ביקורת שגויה (תיק אינו עובר אלגוריתם לוהן)",
  reason_en:  "Check digit is invalid (Luhn-style test failed)"
}
```

Every single failure path carries both `reason_he` and `reason_en`, so
a UI layer never has to re-translate. Verified by the
"all failure results have bilingual reasons" test.

### 2.2 `onyx-procurement/test/payroll/tax-file.test.js`

47 tests in 8 `describe` suites. Uses only `node:test` and `node:assert/strict`.
Target was 20+ cases — delivered 47. Tests are organized by function under
test, not by input category, so a future regression on (say) `normalize()`
is obvious in the output.

---

## 3. Validation rules implemented

### 3.1 Format
- Must be string or number. Objects / arrays / booleans → `not_string`.
- `null`, `undefined`, `""`, `"   "` → `empty`.
- After stripping `- / . _ space`, Hebrew/ASCII quotes, and parens, the
  remainder must be digit-only. Anything else → `non_numeric`.
- After left-padding with zeros, length must be exactly 9. Longer → `wrong_length`.

### 3.2 Reserved values
- `"000000000"` → `all_zeros` (Tax Authority never assigns this).
- Future extension point: known reserved prefixes (state entities, test
  files) can be added via `REASON_CODES.RESERVED_PREFIX`, which is already
  declared but not yet populated — no public list exists yet.

### 3.3 Check digit
- Uses the canonical Israeli Luhn-style check. Same algorithm as
  `src/scanners/barcode-scanner.js` → `luhnIsraeliIdValid()` (L241–252),
  which is what the rest of the repo already trusts for ת.ז. barcodes.
- Weighted 1,2,1,2,1,2,1,2,1 from left to right.
- Products ≥ 10 collapsed by `v -= 9`.
- Sum must be divisible by 10.

### 3.4 Type
- Supported types: `withholding`, `vat`, `income_tax`, `osek_morshe`.
- Any other type → `unknown_type`.
- Note: current implementation uses the same check digit algorithm
  across all four types. In reality רשות המסים *may* use slightly
  different algorithms for each registry, but the published Shaam
  XSDs use the Luhn form for all of them, and that is what the repo
  already assumes elsewhere. If a future agent proves otherwise for
  a specific registry, swap in `israeliVatNumberValid()` (the mod-11
  variant) that `barcode-scanner.js` already defines.

---

## 4. `crossReference()`

Purpose: sanity-check that an entity ID (ח.פ / ת.ז) and a tax file
number probably belong to the same taxpayer.

In Israeli practice, the same 8-digit base is commonly reused across
ח.פ, תיק ניכויים, תיק מע"מ and תיק מס הכנסה for one legal entity,
with only the final check digit differing because each registry's
check is computed separately.

Confidence ladder:

| Match condition              | `match` | `confidence` | `reason`                    |
|------------------------------|---------|--------------|-----------------------------|
| All 9 digits identical       | `true`  | `1.0`        | `exact_match`               |
| First 8 digits identical     | `true`  | `0.9`        | `same_base_different_check` |
| First 7 digits identical     | `true`  | `0.6`        | `same_prefix_7`             |
| Unrelated                    | `false` | `0.0`        | `no_relationship`           |
| One side fails format check  | `false` | `0.0`        | `invalid_input`             |

Both inputs are normalized first, so `crossReference('937-123-453', '937 123 453')`
correctly returns `1.0`.

---

## 5. Online status hook

`checkActiveStatus(id, type, opts)` is an async stub. Today there is
no free public Israeli Tax Authority endpoint for "is this file
active?", so the function returns:

```js
{ status: "unknown", last_checked_at: "<ISO>", source: "stub" }
```

on valid input, and:

```js
{ status: "invalid_format", last_checked_at: "<ISO>", source: "stub", local_reason: "<code>" }
```

on bad input. It never throws. A future agent wiring up Shaam / Open-Banking
access only needs to fill in the marked `TODO(agent-future)` block near the
bottom of the file — the rest of the contract is locked in by tests
(test suite 8, "checkActiveStatus() — async stub").

---

## 6. Test matrix

| # | Suite                          | Tests | Covers |
|---|--------------------------------|-------|--------|
| 1 | `normalize()`                  | 8     | null, empty, dashes, slashes, dots, underscores, spaces, padding, numeric, >9 digits, non-digit pass-through |
| 2 | `luhnIsraeliCheck()`           | 4     | all valid fixtures, all invalid fixtures, wrong length, non-string inputs |
| 3 | `validateTaxFile()` valid      | 8     | 4 types × canonical, default type, dash input, numeric input, short input |
| 4 | `validateTaxFile()` invalid    | 10    | null, undefined, "", >9, letters, all zeros, bad check, unknown type, object, bilingual check |
| 5 | shortcut wrappers              | 5     | each of the 4 shortcuts + failure propagation |
| 6 | `crossReference()`             | 6     | exact, same base, same 7-prefix, unrelated, invalid, formatted |
| 7 | `formatDisplay()`              | 3     | grouping, bilingual label, bad input |
| 8 | `checkActiveStatus()` stub     | 3     | valid→unknown, invalid→invalid_format, null→no throw |
|   | **Total**                      | **47**|        |

Fixture IDs used in the tests (all Luhn-valid, computed at build time):

```
937123453   514000009   123456782   556666774
300000015   102030400   000000018   999999998
666666664   777777772   888888880
```

Invalid-check-digit fixtures:

```
937123454   123456780   514000000   999999999
```

---

## 7. How to run

```bash
cd onyx-procurement

# Only this module
node test/run.js --only tax-file

# Or directly
node --test test/payroll/tax-file.test.js
```

Output (condensed):

```
ℹ tests 47
ℹ suites 8
ℹ pass 47
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

---

## 8. Follow-up items (additive only — nothing to delete)

1. **Wire callers.** The four files listed in §1 still don't call
   `validateTaxFile()` — they just read the raw column. A follow-up
   agent should insert a guard call at write-time (best) or export-time
   (minimum) so that bad data never reaches a Shaam export. Since the
   existing records may contain legacy bad values, wiring must be
   non-fatal: log and flag, do not reject.

2. **Reserved prefix list.** `REASON_CODES.RESERVED_PREFIX` is declared
   but not used. Once רשות המסים publishes (or we scrape) a list of
   reserved state/test prefixes, populate the check in `validateTaxFile()`
   between the all-zeros check and the Luhn check.

3. **Shaam online status.** When the gov.il SSO / שע"ם lookup is
   available, fill in the `TODO(agent-future)` block in `checkActiveStatus()`.
   The contract is already locked by test suite 8.

4. **VAT mod-11 variant.** `src/scanners/barcode-scanner.js` already
   has `israeliVatNumberValid()` which uses the mod-11 algorithm. If
   it turns out that ACTUAL VAT files use mod-11 rather than the Luhn
   form (current assumption), swap the dispatch inside `validateTaxFile()`
   based on `type === "vat" || type === "osek_morshe"`. Tests 3.2 and 3.4
   will need new fixtures computed for that algorithm.

---

## 9. Rule-of-engagement check

- **Never delete:** no existing file touched; nothing removed.
- **Hebrew bilingual:** every user-facing string is emitted in both
  Hebrew and English. Verified by explicit assertion in tests.
- **Israeli compliance:** algorithm matches the repo's own existing
  ת.ז barcode validator and the Shaam XSD expectation.
- **Zero deps:** only `node:test` and `node:assert/strict` used, both
  stdlib. No `package.json` change.

Signed: Agent 95
