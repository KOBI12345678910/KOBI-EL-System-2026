# AG-Y013 — Health Insurance Calculator (דמי ביטוח בריאות)

**Status:** DELIVERED — all 69 tests pass
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/bl/health-insurance.js`
**Tests:** `onyx-procurement/test/bl/health-insurance.test.js`
**Rule compliance:** לא מוחקים — רק משדרגים ומגדלים. This module is **additive**. It does NOT replace `onyx-procurement/src/payroll/wage-slip-calculator.js :: computeBituachLeumiAndHealth`, which remains the canonical wage-slip path. The new module generalises health tax to all statuses, adds kupa + supplemental tracking, and emits a BL submission file.

---

## 1. Scope

Build a standalone Israeli health-insurance calculator (חוק ביטוח בריאות ממלכתי, התשנ"ד-1994) that:

1. Computes monthly health-insurance tax for every legal status (employee / self-employed / pensioner / non-working / non-working spouse / foreign resident).
2. Tracks which of the four statutory health funds (קופת חולים) the insured is assigned to, plus supplemental tier (כסף / זהב / פלטינה).
3. Emits a per-employee submission file that combines BL (national insurance) and health-insurance totals, ready for translation into BL-102 XML by the existing `form-102-xml.js` adapter.
4. Handles olim and reservist discounts.
5. Zero runtime dependencies.
6. Bilingual labels (Hebrew + English) on every result.

---

## 2. Public API

### `computeHealth({ income, status, year, ... })`

| Arg | Type | Required | Notes |
|---|---|---|---|
| `income` | number | yes | Monthly income in NIS. Meaning varies by status (see §4). |
| `status` | string | yes | One of `employee` / `self-employed` / `pensioner` / `non-working` / `non-working-spouse` / `foreign-resident`. Hebrew aliases accepted. |
| `year` | number | no | Defaults to 2026. Currently **2026 only** — passing 2025/2027 throws. |
| `liable` | boolean | no | Foreign resident only — overrides the default exempt flag. |
| `fund` | object | no | `{ fund, supplemental }` — overrides the employee record. |
| `employee` | object | no | Full employee record — used by `kupaSelector` fallback. |
| `oleh` | object | no | `{ active, monthsSinceAliyah }` — triggers 50% discount in months 0–11. |
| `reservist` | object | no | `{ days }` — up to 25% discount proportional to `days/30`. |

**Returns** (summary fields listed first, rest for audit):

```
{
  rate:         0.0357,         // effective blended rate
  base:         10000,          // taxable base in NIS
  tax:          357.08,         // monthly health tax in NIS
  fund:         'clalit',       // kupa key
  supplemental: 'none',         // supplemental tier key
  status:       'employee',
  year:         2026,
  income:       10000,
  breakdown:    { low_base, low_rate, low_tax, high_base, high_rate, high_tax, capped_out, note_he, note_en },
  discounts:    { pre_discount_tax, multiplier, oleh, reservist, savings },
  fund_detail:  { fund, fundCode, supplemental, supplementalCode, labels: {...} },
  labels_he:    { tax, base, rate, fund, supplemental, status },
  labels_en:    { tax, base, rate, fund, supplemental, status },
  meta:         { threshold, ceiling, minimum_payment, law_he, law_en, module, version }
}
```

### `kupaSelector(employee)`

Resolves fuzzy fund input (Hebrew, English, BL code, partial name) into the canonical fund key + BL code + supplemental tier.

| Input field | Accepted spellings |
|---|---|
| `health_fund` / `kupa` / `fund` | `Clalit` / `CLALIT` / `clalit` / `כללית` / `שירותי בריאות כללית` / `01` (also: `Maccabi` / `מכבי` / `02`, `Meuhedet` / `מאוחדת` / `03`, `Leumit` / `לאומית` / `04`) |
| `supplemental` / `supp` / `supplemental_tier` | `none` / `ללא`, `silver` / `כסף` / `basic` / `1`, `gold` / `זהב` / `2`, `platinum` / `פלטינה` / `3` |

**Returns:** `{ fund, fundCode, supplemental, supplementalCode, labels: { fund_he, fund_full_he, fund_en, supplemental_he, supplemental_en } }`

### `generateBLHealthFile(period, employees)`

Produces the internal "what we intend to report" plain-text file combining BL + health per employee.

- `period` = `{ year, month }` — e.g. `{ year: 2026, month: 4 }`
- `employees` = array of `{ id, name, tz | id_number, status, income, health_fund, supplemental, bl_tax?, oleh?, reservist?, liable? }`

**Returns:** `{ header, rows, totals, text, filename }` where:
- `totals` = `{ employees_count, total_base, total_health_tax, total_bl_tax, total_combined, by_fund, by_status }`
- `filename` = `bl-health-YYYY-MM.txt`

File format (plain-text, pipe-delimited, easy to diff and audit):
```
HDR|BL-HEALTH-COMBINED|1.0.0|2026-04|<iso-timestamp>|<count>
EMP|id|tz|name|status|income|base|health_tax|bl_tax|combined|fund_code|supp_code
EMP|E01|123456789|Alice|employee|10000.00|10000.00|357.08|500.00|857.08|01|0
...
TOT|employees=3|base=...|health=...|bl=...|combined=...
FND|clalit=...|maccabi=...|meuhedet=...|leumit=...
```

A downstream adapter (`src/tax-exports/form-102-xml.js`) translates this into the BL-102 XML accepted by ביטוח לאומי's online submission API.

---

## 3. Rate Table — 2026

Source: `HEALTH_INSURANCE_2026` constant in `src/bl/health-insurance.js`, cross-verified against `onyx-procurement/src/payroll/CONSTANTS_VERIFICATION.md` §1.4 (`HEALTH_TAX`).

| Field | Value | Unit | Law / source | Status |
|---|---:|---|---|---|
| `MONTHLY_THRESHOLD` | **7,522** | NIS/month | ~60% × שכר ממוצע (~₪12,536) | **ESTIMATED** — re-verify Jan 1 |
| `MONTHLY_MAX_BASE` (ceiling) | **49,030** | NIS/month | 5× שכר ממוצע | **ESTIMATED** — re-verify Jan 1 |
| `EMPLOYEE_LOW_RATE` | **3.1%** | — | חוק ביטוח בריאות ממלכתי | **CONFIRMED** (structural) |
| `EMPLOYEE_HIGH_RATE` | **5.0%** | — | ibid | **CONFIRMED** (structural) |
| `SELF_EMPLOYED_LOW_RATE` | **3.1%** | — | ibid | **CONFIRMED** (structural) |
| `SELF_EMPLOYED_HIGH_RATE` | **5.0%** | — | ibid | **CONFIRMED** (structural) |
| `PENSIONER_FLAT_RATE` | **3.1%** | — | reduced pensioner rate | **CONFIRMED** (structural) |
| `PENSIONER_HIGH_RATE` | **5.0%** | — | for very high pensions above threshold | **CONFIRMED** (structural) |
| `MINIMUM_PAYMENT_MONTHLY` | **116** | NIS/month | דמי מינימום for non-working residents | **ESTIMATED** — re-verify Jan 1 |
| `FOREIGN_RESIDENT_LIABLE_BY_DEFAULT` | `false` | — | default exempt | **CONFIRMED** |
| `OLIM_DISCOUNT_MONTHS` | **12** | months | עולה חדש | **CONFIRMED** |
| `OLIM_DISCOUNT_RATE` | **50%** | — | customary | **CONFIRMED** |
| `RESERVIST_DISCOUNT_RATE` | **25%** (max) | pro-rata on days/30 | מילואים | **CONFIRMED** (structural) |
| `ROUND_TO` | 2 | decimals | operational precision | — |

### Worked examples

| Income | Status | Math | Expected tax (NIS) |
|---:|---|---|---:|
| 0 | employee | — | 0.00 |
| 5,000 | employee | 5000 × 0.031 | **155.00** |
| 7,522 | employee | 7522 × 0.031 | **233.18** |
| 10,000 | employee | 7522 × 0.031 + 2478 × 0.05 | **357.08** |
| 15,000 | employee | 7522 × 0.031 + 7478 × 0.05 | **607.08** |
| 49,030 | employee | 7522 × 0.031 + 41508 × 0.05 | **2,308.58** |
| 100,000 | employee | capped at 49,030 | **2,308.58** (same as at ceiling) |
| 10,000 | employee + oleh (3mo) | 357.08 × 0.50 | **178.54** |
| 10,000 | employee + reservist 30d | 357.08 × 0.75 | **267.81** |
| 10,000 | employee + oleh + reservist 30d | 357.08 × 0.50 × 0.75 | **133.905** |
| 0 | non-working | flat minimum | **116.00** |
| 0 | non-working-spouse | covered by insured partner | **0.00** |
| 20,000 | foreign-resident (default) | exempt | **0.00** |
| 20,000 | foreign-resident (liable=true) | 7522 × 0.031 + 12478 × 0.05 | **857.08** |

All worked examples above are explicitly asserted by unit tests (see §5).

---

## 4. Status Matrix

| Status (canonical) | Hebrew alias(es) | English alias(es) | Income meaning | Calculation |
|---|---|---|---|---|
| `employee` | `שכיר` | `employee`, `worker` | Gross taxable monthly wage | 3.1% up to 7,522 + 5% on 7,522–49,030; above 49,030 capped |
| `self-employed` | `עצמאי` | `self-employed`, `self_employed`, `selfemployed`, `osek` | Net business income (after deductions) | Same 3.1/5 two-tier split, 49,030 ceiling |
| `pensioner` | `פנסיונר`, `גמלאי` | `pensioner`, `retired` | Monthly pension amount | Reduced flat 3.1% + 5% above threshold (for very high pensions) |
| `non-working` | `לא עובד`, `לא-עובד`, `עקרת בית` | `non-working`, `non_working`, `unemployed` | (ignored) | Flat statutory **116 NIS/month** minimum payment |
| `non-working-spouse` | `בן/בת זוג לא עובד` | `non-working-spouse`, `spouse` | (ignored) | **0 NIS** — covered by insured partner |
| `foreign-resident` | `תושב חוץ` | `foreign`, `foreign-resident`, `non-resident` | Gross Israeli-source income | Default **exempt (0)**; with `liable:true` uses employee rates |

### Discounts

| Discount | Trigger | Multiplier |
|---|---|---|
| Oleh Hadash (עולה חדש) | `oleh: { active: true, monthsSinceAliyah: <12 }` | × 0.50 (50% off) |
| Reservist (מילואים) | `reservist: { days: 1..30 }` | × `(1 - 0.25 × days/30)` |
| Both | stack multiplicatively | e.g. 0.50 × 0.75 = 0.375 |

---

## 5. Test Matrix

**Result:** `ℹ tests 69  |  pass 69  |  fail 0  |  duration_ms ≈ 260`

Groups:

1. **Constants sanity** (4 tests) — rate table values match spec; `HEALTH_INSURANCE_2026` is frozen; all four kupot registered with correct BL codes; all four supplemental tiers.
2. **splitBase — threshold + ceiling math** (6 tests) — below threshold, at threshold, above threshold, at ceiling, above ceiling (cappedOut correct), negative income → 0.
3. **Employee** (7 tests) — below/at/above threshold, at ceiling, above ceiling (cap enforced), zero income, low+high breakdown correctness.
4. **Self-employed** (3 tests) — same 3.1/5 math, `עצמאי` alias, Hebrew/English notes on breakdown.
5. **Pensioner** (4 tests) — reduced flat rate below threshold, two-tier split for high pensions, `פנסיונר` alias, breakdown note.
6. **Non-working** (5 tests) — flat 116 with zero income, flat 116 even with income>0, Hebrew aliases `לא עובד` and `עקרת בית`, breakdown describes minimum payment.
7. **Non-working spouse** (2 tests) — zero payment, breakdown explains exemption.
8. **Foreign resident** (3 tests) — default exempt, liable=true uses employee math, Hebrew alias.
9. **Discounts** (5 tests) — oleh 50% during 12-month window, oleh expires after 12 months, reservist 30d = 25% off, reservist 15d = 12.5% off, oleh+reservist stack multiplicatively.
10. **kupaSelector** (8 tests) — English case-insensitive, Hebrew names, BL codes, returned code, Hebrew supplemental tiers, default Clalit + none, alias `kupa` field, bilingual labels.
11. **computeHealth integration** (4 tests) — uses `employee.health_fund`, explicit `fund` arg overrides, bilingual labels returned, meta carries law + module + threshold + ceiling.
12. **Year + input validation** (4 tests) — rejects years ≠ 2026, defaults to 2026, unknown status throws, missing args throws.
13. **normalizeStatus** (2 tests) — empty defaults to employee, handles whitespace/case.
14. **generateBLHealthFile** (9 tests) — multi-employee payload, totals aggregate, `by_fund` tracking, mixed statuses (5 employees with 5 different statuses), combined bl_tax + health, text payload structure (HDR/EMP header/EMP rows/TOT/FND), rejects bad period, rejects non-array employees, empty employees list produces valid empty payload.
15. **Regression — alignment with legacy wage-slip calculator** (3 tests) — new `computeHealth` agrees with legacy `computeBituachLeumiAndHealth` at 12,500 NIS and at 49,030 NIS ceiling; above ceiling equals at-ceiling (cap enforced).

---

## 6. Kupa codes — reference

The codes used in the BL submission file and returned by `kupaSelector` follow the BL Form 102 fund field convention:

| Key | BL code | Hebrew | English | Full Hebrew name |
|---|:---:|---|---|---|
| `clalit` | **01** | כללית | Clalit | שירותי בריאות כללית |
| `maccabi` | **02** | מכבי | Maccabi | מכבי שירותי בריאות |
| `meuhedet` | **03** | מאוחדת | Meuhedet | קופת חולים מאוחדת |
| `leumit` | **04** | לאומית | Leumit | קופת חולים לאומית |

### Supplemental tiers (ביטוח משלים) — normalized across funds

| Key | Code | Hebrew | English | Typical name per fund |
|---|:---:|---|---|---|
| `none` | **0** | ללא | None | (no supplemental) |
| `silver` | **1** | כסף | Silver | Clalit Mushlam, Maccabi Silver, Meuhedet Adif, Leumit Silver |
| `gold` | **2** | זהב | Gold | Clalit Mushlam Zahav, Maccabi Gold, Meuhedet See, Leumit Gold |
| `platinum` | **3** | פלטינה | Platinum | Clalit Platinum, Maccabi Sheli, Meuhedet SEE Premium, Leumit Platinum |

---

## 7. Minimum payment value — 2026

**`MINIMUM_PAYMENT_MONTHLY = 116 NIS/month`**

Applies to non-working residents (`status = 'non-working'`, including Hebrew aliases `לא עובד`, `עקרת בית`). This is a flat amount, independent of income, paid directly to BL and transferred to the assigned kupa. Non-working spouses of an insured resident pay **0** (coverage flows through the insured partner per חוק ביטוח בריאות ממלכתי).

**Status:** ESTIMATED — re-verify Jan 1 each year against btl.gov.il rate tables; the annual re-verification protocol in `onyx-procurement/src/payroll/CONSTANTS_VERIFICATION.md` §3 now also covers `HEALTH_INSURANCE_2026.MINIMUM_PAYMENT_MONTHLY` by extension.

---

## 8. Delivery artefacts

| Path | Purpose | Rule |
|---|---|---|
| `onyx-procurement/src/bl/health-insurance.js` | New module (zero deps, bilingual) | ADDED — לא מוחקים |
| `onyx-procurement/test/bl/health-insurance.test.js` | 69 unit tests, all passing | ADDED |
| `_qa-reports/AG-Y013-health-insurance.md` | This report | ADDED — never delete |

---

## 9. Compliance with "לא מוחקים — רק משדרגים ומגדלים"

**Check:** no existing file was deleted or destructively modified.

- `onyx-procurement/src/payroll/wage-slip-calculator.js` — untouched. `computeBituachLeumiAndHealth` remains the canonical wage-slip path. Regression tests in §5 group 15 prove the new module agrees with it.
- `onyx-procurement/src/payroll/CONSTANTS_VERIFICATION.md` — untouched.
- `onyx-procurement/test/wage-slip-calculator.test.js` — untouched.
- `src/bl/` is a new sibling folder; `test/bl/` was empty prior to this delivery and is now populated.

**Scope:** the new module *grows* coverage in three ways not present in the legacy wage-slip path —
  1. Status variations (self-employed / pensioner / non-working / non-working-spouse / foreign-resident).
  2. Kupa + supplemental resolution with fuzzy Hebrew/English/code input.
  3. BL submission file generation combining BL + health per employee.

---

## 10. Next steps (out of scope for this ticket)

1. Wire `generateBLHealthFile` output into `src/tax-exports/form-102-xml.js` to emit the official BL-102 XML.
2. Add a CLI command `bin/bl-health-file.js` for month-end batch runs.
3. Add per-kupa rate overrides if fund-specific health-insurance deductions ever diverge (currently unified by law).
4. Extend `normalizeStatus` to read from the HR `employees` table `employment_status` column directly.
5. Add 2027 rate tables on Jan 1 2027 per the annual re-verification protocol.
6. Verify `MINIMUM_PAYMENT_MONTHLY = 116` against the exact BL published value for 2026 (currently a rounded estimate).

---

*Report authored 2026-04-11 alongside the module and test suite. Per Techno-Kol Uzi policy, this report is **never deleted** — future audits, tax-year updates, and compliance reviews append to it.*
