# AG-92 — IBAN Validator (Israeli-aware)

**Agent:** 92
**Module:** `onyx-procurement/src/validators/iban.js`
**Wave:** Payroll / Banking primitives
**Date:** 2026-04-11
**Status:** GREEN — 47/47 tests passing
**Deps added:** 0

---

## 1. Scope

Deliver a pure-Node (zero deps) IBAN validator that implements ISO 13616
MOD-97 checksum verification and parses Israeli IBANs into their bank,
branch, and account components. Must be bilingual (Hebrew + English in
reason codes), freeze its constant tables to honour the "never delete"
rule, and ship with a 20+ test matrix.

---

## 2. Files delivered

| File                                                              | Role                    | LOC  |
|-------------------------------------------------------------------|-------------------------|------|
| `onyx-procurement/src/validators/iban.js`                         | Validator module        | ~330 |
| `onyx-procurement/test/payroll/iban.test.js`                      | Unit test suite         | ~340 |
| `_qa-reports/AG-92-iban-validator.md`                             | This report             | n/a  |

Both directories (`src/validators/` and `test/payroll/`) were new and
were created by this agent.

---

## 3. Public API

```js
const {
  validateIban,        // (iban) -> { valid, country, bank_code?, branch_code?, account?, reason?, reason_he? }
  parseIsraeliIban,    // (iban) -> { bank, branch, account } | null
  formatIban,          // (iban) -> "IL62 0108 0000 0009 9999 999"
  normalizeIban,       // (iban) -> uppercased, whitespace-stripped string
  israeliBanks,        // frozen { [code]: { name_en, name_he } }
  IBAN_COUNTRY_LENGTHS // frozen { [cc]: expectedLen }
} = require('./src/validators/iban');
```

### Reason codes (reason / reason_he)

| reason                           | reason_he                                                | meaning                                  |
|----------------------------------|----------------------------------------------------------|------------------------------------------|
| `empty`                          | `IBAN ריק`                                               | null / undefined / whitespace-only       |
| `bad_format`                     | `פורמט IBAN לא תקין`                                     | not `[A-Z]{2}\d{2}[A-Z0-9]+`             |
| `bad_length`                     | `אורך IBAN לא חוקי`                                      | outside 5..34                            |
| `bad_length_for_IL:expected_23_got_N` | `אורך IBAN לא נכון למדינה IL (צריך 23, התקבל N)`    | country-specific length mismatch         |
| `bad_check_digit`                | `ספרת ביקורת שגויה`                                      | MOD-97 did not yield 1                   |
| `mod97_error`                    | `שגיאה בחישוב MOD-97`                                    | BigInt conversion failure                |
| `unknown_country`                | `מדינה לא מוכרת (חישוב עבר)`                             | CC not in ECBS registry but math passed  |

---

## 4. Israeli banks map

Includes all codes required by the agent-92 spec plus additional common
banks (Yahav, Bank of Israel, FIB, First International, Arab Israel
Bank, postal bank, etc.). The map is `Object.freeze`d so it cannot be
mutated or deleted at runtime — enforcing the "never delete" rule.

| code | name_en                 | name_he                 |
|------|-------------------------|-------------------------|
| 4    | Yahav                   | יהב                     |
| 9    | Bank of Israel          | בנק ישראל               |
| 10   | Leumi                   | לאומי                   |
| 11   | Discount                | דיסקונט                 |
| 12   | Mizrahi Tefahot         | מזרחי טפחות             |
| 13   | Igud                    | איגוד                   |
| 14   | Otzar HaHayal           | אוצר החייל              |
| 17   | Merkantil Discount      | מרכנתיל דיסקונט         |
| 20   | Mizrachi (legacy)       | מזרחי                   |
| 26   | Union Bank              | יובנק                   |
| 31   | Hapoalim                | הפועלים                 |
| 34   | Arab Israel Bank        | ערבי ישראלי             |
| 46   | Massad                  | מסד                     |
| 52   | Poalei Agudat Israel    | פועלי אגודת ישראל       |
| 54   | Jerusalem               | ירושלים                 |
| 59   | Bank SBI                | SBI                     |
| 65   | First International     | הבינלאומי הראשון        |
| 68   | Dexia                   | דקסיה ישראל             |
| 71   | HSBC Israel             | HSBC ישראל              |
| 77   | Jerusalem (legacy)      | ירושלים (ישן)           |
| 82   | Citibank Israel         | סיטיבנק ישראל           |
| 90   | HaDoar / Postal Bank    | הדואר                   |
| 99   | Postal Bank             | בנק הדואר               |

---

## 5. Algorithm — ISO 13616 MOD-97

1. Remove all whitespace (including NBSP, U+200E, U+200F) and uppercase.
2. Reject if not matching `^[A-Z]{2}[0-9]{2}[A-Z0-9]+$` or length is
   outside 5..34.
3. If the country is in `IBAN_COUNTRY_LENGTHS`, reject on length
   mismatch. Israeli IBANs must be exactly 23 chars.
4. Move the first 4 chars to the end.
5. Replace each letter with `(charCode - 55)` → `A=10, B=11, ..., Z=35`.
6. Compute `BigInt(numeric) % 97n` — valid iff `=== 1n`.
7. On Israeli IBANs, parse BBAN into `bank(3) + branch(3) + account(13)`
   and attach the Hebrew + English bank names from the frozen map.

BigInt is required because the rearranged-numeric form of a 34-char
IBAN exceeds 2^53 and cannot be represented in a JS `number`.

---

## 6. Test results

```
▶ IBAN.1 ISO 13616 valid vectors           (4 tests)
▶ IBAN.2 Israeli IBAN parsing              (11 tests)
▶ IBAN.3 rejections                        (14 tests)
▶ IBAN.4 normalization                     (5 tests)
▶ IBAN.5 formatIban                        (5 tests)
▶ IBAN.6 israeliBanks map                  (4 tests)
▶ IBAN.7 round-trip invariants             (4 tests)

ℹ tests 47      ℹ suites 7
ℹ pass  47      ℹ fail  0
ℹ duration_ms 162
```

**Coverage of requested scenarios:**

- [x] Valid Israeli IBANs — 8 different banks seeded (Leumi, Mizrahi
      Tefahot, Mizrachi, Hapoalim, Jerusalem, Discount, Igud, Poalei
      Agudat), all with freshly-computed ISO 13616 check digits.
- [x] Valid international vectors — DE, GB, FR (with letter in BBAN
      to exercise the letter-to-digit path), CH.
- [x] Invalid check digit — both IL and DE variants.
- [x] Wrong length — IL rejected at 22 chars and 24 chars.
- [x] Unknown country — `ZZ...` prefix rejected via bad_check_digit.
- [x] Garbage characters (`#`, `-`) rejected as `bad_format`.
- [x] Null / undefined / empty / whitespace-only inputs.
- [x] Normalization — spaces, lowercase, mixed whitespace, NBSP.
- [x] `formatIban` grouping with valid, empty, and garbage input.
- [x] Frozen-map invariants (never-delete rule).
- [x] Hebrew bidi sanity — every `name_he` contains a Hebrew codepoint
      (unless explicitly Latin, e.g., "SBI").
- [x] Round-trip `format → normalize → validate` for all 8 IL vectors.
- [x] Defensive inputs — number primitive and plain object do not crash.

**Total scenario count: 47 (≥ 20 required).**

---

## 7. Test vector generation

All 8 Israeli IBAN test vectors were generated by computing fresh check
digits via `98 - (numeric mod 97)`. They are therefore guaranteed to
satisfy the forward validation path. The international vectors are the
canonical ECBS publications (DE89370400440532013000 etc.).

```
IL05 0108 0000 0012 3456 789   Leumi (10)
IL58 0125 3534 5678 9012 345   Mizrahi Tefahot (12)
IL36 0204 0400 0000 1234 567   Mizrachi legacy (20)
IL19 0311 2300 0045 6789 012   Hapoalim (31)
IL98 0541 0000 0000 0012 345   Jerusalem (54)
IL33 0110 0912 3456 7890 123   Discount (11)
IL80 0130 1598 7654 3210 987   Igud (13)
IL90 0522 3400 0098 7654 321   Poalei Agudat (52)
```

---

## 8. Compliance notes

- **Zero dependencies** — only `node:test` and `node:assert/strict`
  (both built in to Node 18+).
- **Hebrew bilingual** — every rejection reason ships with both an
  English `reason` and a Hebrew `reason_he` string.
- **Israeli compliance** — 23-char IL length enforced; full Israeli
  banks directory with both common code variants (12 Mizrahi Tefahot
  vs. 20 legacy Mizrachi, 54 Jerusalem vs. 77 legacy); BBAN split of
  3/3/13 matching Bank of Israel spec.
- **Never delete rule** — `israeliBanks` and `IBAN_COUNTRY_LENGTHS`
  are `Object.freeze`d; tests assert that `delete` and assignment
  both throw in strict mode.
- **Runtime** — Node >= 16 (uses BigInt). Onyx-procurement's existing
  target is Node >= 18, so no version bump is required.

---

## 9. How to run

```bash
cd onyx-procurement

# direct
node --test test/payroll/iban.test.js

# via repo runner
node test/run.js --only iban
```

The repo's `test/run.js` already walks recursively into `test/payroll/`
so the new suite is picked up automatically.

---

## 10. Follow-ups / not in scope

- QA-02 still has a self-contained reference implementation in
  `test/unit/qa-02-validators.test.js`. A future patch should replace
  that reference with an import from `src/validators/iban.js` so there
  is one canonical validator. Not done here to avoid touching unrelated
  files.
- Future: add `computeIbanCheckDigits(cc, bban)` helper for callers
  that need to *construct* an IBAN from a BBAN (e.g., masav/payments
  export).
- Future: extend the Israeli banks map with historical branch codes
  (currently the branch is returned as a 3-digit string without a
  directory lookup).

---

**Agent 92 signing off. All green.**
