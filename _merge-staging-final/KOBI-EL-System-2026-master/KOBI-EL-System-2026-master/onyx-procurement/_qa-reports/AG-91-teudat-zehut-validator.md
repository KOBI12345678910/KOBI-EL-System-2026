# AG-91 — Teudat Zehut (ת.ז) Validator

**Agent**: 91
**System**: Techno-Kol Uzi ERP / Payroll validators
**Date**: 2026-04-11
**Status**: PASS (64/64 tests)

---

## 1. Summary

Delivered a zero-dependency Israeli National ID (ת.ז / Teudat Zehut) validator
for the Techno-Kol Uzi ERP, implementing the official check-digit algorithm
published by רשות האוכלוסין וההגירה (Population & Immigration Authority).

### Files

| File | Purpose | LOC |
|------|---------|-----|
| `src/validators/teudat-zehut.js` | Validator, formatter, generator | ~270 |
| `test/payroll/teudat-zehut.test.js` | `node --test` suite, 64 tests | ~370 |

### Public API (`src/validators/teudat-zehut.js`)

```js
validateTeudatZehut(id)      // → { valid, reason?, normalized }
formatTeudatZehut(id)         // → "NNN-NN-NNNN" display form
generateValidTeudatZehut()    // → 9-digit valid ID (test helper)

// Also exported for tests / introspection
normalizeTeudatZehut(id)      // → { ok, normalized | reason }
computeChecksum(normalized)   // → number (valid iff % 10 === 0)
TZ_LENGTH                     // 9
RESERVED_IDS                  // Set<string>
```

### Bilingual errors

Every `reason` field combines Hebrew and English, e.g.:
`ת.ז חייבת להכיל ספרות בלבד / ID must contain digits only`

This is enforced by dedicated tests:
- `bilingual: error messages contain Hebrew`
- `bilingual: error messages contain English`

---

## 2. Algorithm Verification

### 2.1 Interior Ministry algorithm

1. Normalise to 9 digits (pad leading zeros if needed).
2. Multiply each digit alternately by 1 and 2 (`multiplier[i] = (i % 2 === 0) ? 1 : 2`).
3. If the product > 9, subtract 9 (equivalent to digit-sum because
   products are in `[10..18]`).
4. Sum the 9 resulting values.
5. ID is valid iff `sum mod 10 === 0`.

### 2.2 Hand-verified fixtures

| ID | Digits × Multipliers | Products (after >9 fold) | Sum | Result |
|----|----------------------|--------------------------|-----|--------|
| `000000018` | 0·1, 0·2, 0·1, 0·2, 0·1, 0·2, 0·1, 1·2, 8·1 | 0,0,0,0,0,0,0,2,8 | **10** | VALID |
| `123456782` | 1·1, 2·2, 3·1, 4·2, 5·1, 6·2, 7·1, 8·2, 2·1 | 1,4,3,8,5,3(=12-9),7,7(=16-9),2 | **40** | VALID |
| `111111118` | 1,2,1,2,1,2,1,2,8 | (sum = 20) | **20** | VALID |
| `222222226` | 2,4,2,4,2,4,2,4,6 | (sum = 30) | **30** | VALID |
| `123456789` | 1,4,3,8,5,3,7,7,9 | — | **47** | INVALID |

### 2.3 Automated checksum tests

- `computeChecksum('000000018')` === `10`
- `computeChecksum('123456782')` === `40`
- `computeChecksum('123456789')` === `47`
- `computeChecksum('999999998')` === `80`
- Idempotent: same input → same output

### 2.4 Generator self-validates

`generateValidTeudatZehut()` computes the 9th digit such that the
total sum is divisible by 10, avoids the reserved bands, then re-runs
`validateTeudatZehut()` as a belt-and-braces sanity check. The test
suite runs 50 generated IDs through the validator — all pass.

---

## 3. Test Coverage

### 3.1 Run

```
node --test test/payroll/teudat-zehut.test.js
```

### 3.2 Result

```
ℹ tests 64
ℹ pass  64
ℹ fail  0
ℹ duration_ms 140.687
```

### 3.3 Breakdown (12 groups)

| # | Group | Tests |
|---|-------|-------|
| 1 | Core algorithm — `computeChecksum` | 5 |
| 2 | Known-valid IDs (`validateTeudatZehut`) | 8 |
| 3 | Known-invalid IDs (check-digit failure) | 5 |
| 4 | Normalisation — leading zeros & padding | 5 |
| 5 | Normalisation — spaces / dashes / dots / slashes | 5 |
| 6 | Edge cases — `null`, `undefined`, `''`, `NaN`, objects, too short/long | 12 |
| 7 | Reserved / impossible IDs | 5 |
| 8 | `formatTeudatZehut` display formatter | 6 |
| 9 | `generateValidTeudatZehut` (including deterministic RNG) | 4 |
| 10 | Round-trip (validate → format → validate) | 2 |
| 11 | Bilingual error messages | 2 |
| 12 | Structural guarantees (return shape, constants) | 5 |
| **Total** | | **64** |

### 3.4 Known-valid fixtures used

```
000000018   (canonical Interior Ministry fixture)
123456782
111111118
222222226
999999998
010000008   (8-digit legacy form: 10000008 → 010000008)
010000016
010000024
```

### 3.5 Known-invalid fixtures used

```
123456789   (sum = 47)
000000019   (sum = 11)
111111111   (sum = 12)
123456780   (sum = 38)
987654321   (fails check digit)
```

---

## 4. Edge Cases Handled

| # | Case | Handling |
|---|------|----------|
| 1 | `null` / `undefined` input | `{ valid: false, reason: 'ת.ז ריקה / empty ID' }` |
| 2 | Empty string `''` | Same as above |
| 3 | Whitespace-only `'   '` | Trimmed → empty → same as above |
| 4 | Leading/trailing whitespace `'  123456782  '` | Trimmed, still valid |
| 5 | Dashed `123-45-6782` | Stripped → normalised → valid |
| 6 | Spaces `123 45 6782` | Stripped → normalised → valid |
| 7 | Dots `123.45.6782` | Stripped → normalised → valid |
| 8 | Slashes `123/45/6782` | Stripped → normalised → valid |
| 9 | 8-digit legacy `10000008` | Padded to `010000008` → valid |
| 10 | 7-digit `1000001` | Padded to `001000001` (invalid sum, but normalises) |
| 11 | 10-digit with excess leading zero `0123456782` | Trimmed → `123456782` |
| 12 | Numeric input `123456782` (number type) | Converted to string → valid |
| 13 | Tiny numeric `18` (ambiguous typo) | Rejected as "too short" (typo guard) |
| 14 | Non-numeric characters `12345A782` | Rejected with "digits only" error |
| 15 | Unicode / emoji `1234567😀` | Rejected with "digits only" error |
| 16 | Object / Array input `{}` | Rejected with "unsupported input type" |
| 17 | Boolean input `true` | Rejected with "unsupported input type" |
| 18 | `NaN` | Rejected with "positive number" error |
| 19 | Negative number `-123456782` | Rejected with "positive number" error |
| 20 | Too short `'123'` (< 5 digits) | Rejected with "too short" |
| 21 | Too long `'12345678901'` (> 9 non-zero digits) | Rejected with "too long" |
| 22 | Reserved `000000000` (all zeros) | Rejected as reserved |
| 23 | Reserved `999999999` (all nines) | Rejected as reserved |
| 24 | Hard-reserved band `000000001..000000017` | Rejected as in reserved band |
| 25 | Canonical `000000018` | Accepted (passes check digit, not reserved) |

### 4.1 Range / reserved policy

The validator enforces a **hard** reject on:

- `000000000` (all zeros)
- `999999999` (all nines)
- `000000001` .. `000000017` (hard-reserved test band below `000000018`)

The validator is intentionally **permissive** about the broader
range partitions (citizens, residents, historical, etc.) so that
legitimate edge-case IDs in real payroll data are never falsely
rejected. This is consistent with the Interior Ministry's own
published validators, which treat the check-digit algorithm as the
primary authority and only hard-reject the trivially impossible
values above.

### 4.2 Dependencies — ZERO

- Validator `require` count: **0** (no `require` statements in code; the
  only match was in a docstring usage example).
- Test file `require`s: only Node built-ins
  (`node:test`, `node:assert/strict`, `path`).
- No third-party packages, no npm installs needed.

---

## 5. Integration Notes

- File lives in a new `src/validators/` folder. Other payroll modules
  (e.g., `wage-slip-calculator.js`, `payroll-routes.js`) can now
  `require('../validators/teudat-zehut')` to validate employee IDs,
  form 101 submissions, and Bituach Leumi filings.
- `formatTeudatZehut` produces the canonical `NNN-NN-NNNN` display
  layout used on Israeli wage slips.
- `normalized` field is always returned (even on invalid input) so
  callers can store a canonical form alongside any error state for
  audit / compliance logging — aligns with the "never delete"
  ERP-wide rule.
- Bilingual error messages allow the same validator to serve Hebrew
  RTL UIs and English API consumers without an i18n layer.

---

## 6. Artifacts

- Source: `src/validators/teudat-zehut.js`
- Tests: `test/payroll/teudat-zehut.test.js`
- Report: `_qa-reports/AG-91-teudat-zehut-validator.md` (this file)

**Run command**:
```
node --test test/payroll/teudat-zehut.test.js
```

**Result**: 64 passed, 0 failed.
