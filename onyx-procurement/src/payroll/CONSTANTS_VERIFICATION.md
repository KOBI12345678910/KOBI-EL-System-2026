# CONSTANTS_2026 Verification Mapping

**File verified:** `onyx-procurement/src/payroll/wage-slip-calculator.js`
**Object:** `CONSTANTS_2026` (lines 25–90)
**Agent:** Agent-34
**Date:** 2026-04-11
**Purpose:** Map each constant to its source document, flag verification status, and establish an annual re-verification protocol.

---

## 1. Line-by-line mapping

### 1.1 `INCOME_TAX_BRACKETS` (lines 27–35)

| Code value | Source document | Status | Re-verify |
|---|---|---|---|
| `{ upTo: 84120, rate: 0.10 }` | פקודת מס הכנסה, סעיף 121; ילקוט פרסומים (annual CPI update) | **ESTIMATED** | Jan 1 |
| `{ upTo: 120720, rate: 0.14 }` | ibid | **ESTIMATED** | Jan 1 |
| `{ upTo: 193800, rate: 0.20 }` | ibid | **ESTIMATED** | Jan 1 |
| `{ upTo: 269280, rate: 0.31 }` | ibid | **ESTIMATED** | Jan 1 |
| `{ upTo: 560280, rate: 0.35 }` | ibid | **ESTIMATED** | Jan 1 |
| `{ upTo: 721560, rate: 0.47 }` | ibid | **ESTIMATED** | Jan 1 |
| `{ upTo: Infinity, rate: 0.50 }` | פקודה סעיף 121ב (47% + 3% יסף) | **CONFIRMED** (structural) | On law change |

**Source placeholder URL:** https://www.gov.il/he/departments/guides/income-tax-brackets
**Recommendation:** Brackets are CPI-indexed annually. 2026 actual values to be published in ילקוט פרסומים late Dec 2025 / Jan 2026. Must update and regression-test `computeIncomeTaxAnnual` before running Jan 2026 payroll.

---

### 1.2 `TAX_CREDIT_POINT_ANNUAL` / `TAX_CREDIT_POINT_MONTHLY` (lines 38–39)

| Code value | Source | Status | Re-verify |
|---|---|---|---|
| `2976` (annual) | רשות המסים — נקודת זיכוי 2026 | **ESTIMATED** | Jan 1 |
| `248` (monthly) | derived = 2976 / 12 | **ESTIMATED** | Jan 1 |

**Source placeholder URL:** https://www.gov.il/he/departments/guides/credit-points
**Recommendation:** Value is CPI-indexed and published annually alongside brackets. Auto-derive monthly value from annual to avoid drift (currently two independent literals — consider refactor to single constant).

---

### 1.3 `BITUACH_LEUMI` (lines 43–50)

| Code field | Value | Source | Status | Re-verify |
|---|---|---|---|---|
| `MONTHLY_THRESHOLD` | 7522 | = 60% × שכר ממוצע (~₪12,536) | **ESTIMATED** | Jan 1 |
| `MONTHLY_MAX_BASE` | 49030 | = 5× שכר ממוצע | **ESTIMATED** | Jan 1 |
| `EMPLOYEE_LOW_RATE` | 0.004 (0.4%) | btl.gov.il rate tables | **CONFIRMED** (structural) | Jan 1 |
| `EMPLOYEE_HIGH_RATE` | 0.07 (7%) | btl.gov.il rate tables | **CONFIRMED** (structural) | Jan 1 |
| `EMPLOYER_LOW_RATE` | 0.0355 (3.55%) | btl.gov.il rate tables | **CONFIRMED** (structural) | Jan 1 |
| `EMPLOYER_HIGH_RATE` | 0.076 (7.6%) | btl.gov.il rate tables | **CONFIRMED** (structural) | Jan 1 |

**Source placeholder URL:** https://www.btl.gov.il/Insurance/InsuranceRates/Pages/default.aspx
**Recommendation:** Re-fetch the BL rate tables every January. Store a dated snapshot PDF in `/compliance/snapshots/bl-rates-YYYY.pdf`.

---

### 1.4 `HEALTH_TAX` (lines 53–58)

| Code field | Value | Source | Status | Re-verify |
|---|---|---|---|---|
| `MONTHLY_THRESHOLD` | 7522 | aligned with BL threshold | **ESTIMATED** | Jan 1 |
| `MONTHLY_MAX_BASE` | 49030 | aligned with BL max | **ESTIMATED** | Jan 1 |
| `EMPLOYEE_LOW_RATE` | 0.031 (3.1%) | חוק ביטוח בריאות ממלכתי | **CONFIRMED** (structural) | Jan 1 |
| `EMPLOYEE_HIGH_RATE` | 0.05 (5%) | ibid | **CONFIRMED** (structural) | Jan 1 |

**Source placeholder URL:** https://www.btl.gov.il/Insurance/HealthInsurance/Pages/default.aspx
**Law:** חוק ביטוח בריאות ממלכתי, התשנ"ד-1994
**Recommendation:** Health tax rates are more stable than BL rates; still re-check annually. Note: employer health tax is embedded in BL employer rate (line 233 of calculator explicitly handles this — good).

---

### 1.5 `PENSION` (lines 61–67)

| Code field | Value | Source | Status | Re-verify |
|---|---|---|---|---|
| `MIN_BASE_MONTHLY` | 0 | Post-2017 — first shekel rule | **CONFIRMED** | Apr 1 |
| `MAX_PENSIONABLE` | 28750 | ~2× שכר ממוצע | **ESTIMATED** | Apr 1 |
| `EMPLOYEE_RATE` | 0.06 (6%) | צו הרחבה לפנסיית חובה | **CONFIRMED** | Apr 1 |
| `EMPLOYER_RATE` | 0.065 (6.5%) | ibid | **CONFIRMED** | Apr 1 |
| `SEVERANCE_RATE` | 0.0833 (8.33%) | = 1/12 חודש, ibid | **CONFIRMED** | Apr 1 |

**Source placeholder URL:** https://www.gov.il/he/departments/topics/mandatory_pension
**Law:** צו הרחבה לביטוח פנסיוני מקיף במשק, 2008 + עדכונים
**Recommendation:** Pension cap updates usually in April. Verify via הממונה על שוק ההון publications. Values themselves have been stable since 2017.

---

### 1.6 `STUDY_FUND` (lines 70–74)

| Code field | Value | Source | Status | Re-verify |
|---|---|---|---|---|
| `MAX_BASE_MONTHLY` | 15712 | רשות המסים — תקרה לקרן השתלמות | **ESTIMATED** | Jan 1 |
| `EMPLOYEE_RATE` | 0.025 (2.5%) | contractual customary | **CONFIRMED** (customary) | On contract change |
| `EMPLOYER_RATE` | 0.075 (7.5%) | contractual customary | **CONFIRMED** (customary) | On contract change |

**Source placeholder URL:** https://www.gov.il/he/departments/guides/study-fund
**Law:** פקודת מס הכנסה, סעיף 3(ה)
**Note:** Study fund is **not mandatory** — it is contractual. The ceiling is the tax-exempt cap above which contributions become taxable income. Rates 2.5%/7.5% are the customary ratio that preserves exemption.
**Recommendation:** Re-verify ceiling in January. If contract terms differ per employee, this should be moved to per-employee configuration rather than a global constant.

---

### 1.7 `OVERTIME_RATES` (lines 77–83)

| Code field | Value | Source | Status | Re-verify |
|---|---|---|---|---|
| `REGULAR` | 1.00 | חוק שעות עבודה ומנוחה | **CONFIRMED** | On law change |
| `FIRST_2H` | 1.25 (125%) | סעיף 16 | **CONFIRMED** | On law change |
| `AFTER_2H` | 1.50 (150%) | סעיף 16 | **CONFIRMED** | On law change |
| `WEEKEND` | 1.75 (175%) | contractual / צו הרחבה | **CONFIRMED** (customary) | On contract change |
| `HOLIDAY` | 2.00 (200%) | סעיף 17 + צו הרחבה | **CONFIRMED** | On law change |

**Source placeholder URL:** https://www.nevo.co.il/law_html/law01/p214m1_002.htm
**Law:** חוק שעות עבודה ומנוחה, התשי"א-1951
**Recommendation:** Stable since 1951 core; multipliers have only changed with extension orders. Low maintenance.

---

### 1.8 `STANDARD_HOURS_PER_MONTH` (line 86)

| Code field | Value | Source | Status | Re-verify |
|---|---|---|---|---|
| `STANDARD_HOURS_PER_MONTH` | 182 | 42h/week × 4.333 — post April 2018 reform | **CONFIRMED** | On law change |

**Source placeholder URL:** https://www.gov.il/he/departments/guides/working-hours
**Law:** חוק שעות עבודה ומנוחה — תיקון 2018
**Recommendation:** Stable.

---

### 1.9 `ROUND_TO` (line 89)

| Code field | Value | Purpose | Status |
|---|---|---|---|
| `ROUND_TO` | 2 | NIS precision — 2 decimal places | **CONFIRMED** (operational) |

Not a regulatory constant; operational rounding precision.

---

## 2. Gaps identified

Constants **MISSING** from `CONSTANTS_2026` that Israeli payroll compliance typically requires:

1. **Minimum wage** — not tracked; needed for validation checks (block payment below minimum)
2. **שכר ממוצע במשק** — used as base for BL thresholds but hard-coded into derived values; should be an explicit constant
3. **יסף threshold** — top bracket is represented but surtax threshold is not called out separately; masking makes audit harder
4. **נקודות זיכוי defaults table** — code defaults to 2.25 (resident male) but there's no table for the standard profiles (female = 2.75, etc.)
5. **Holiday calendar** — day-level calendar for חג / ימי מנוחה is not in this file (assumed elsewhere)
6. **Sick-pay percentages** — 0%/50%/100% day schedule per חוק דמי מחלה is hard-coded in `computeMonthlyGross` (line 150) as `0.50` — should move to `CONSTANTS_2026`
7. **Vacation entitlement tables** — יום חופש per year by seniority should be constant, currently not in file
8. **Per-fund pension minimums** — some pension funds require >6/6.5% by regulation; should be per-provider override table

---

## 3. Annual Re-verification Protocol

### Cadence: 1 January each year

**Step 1 — Fetch**
- Download `ילקוט פרסומים` updates for December-January
- Fetch btl.gov.il rate tables
- Fetch רשות המסים constants publication
- Archive PDFs in `/compliance/snapshots/YYYY/`

**Step 2 — Compare**
- Run `scripts/verify-tax-constants.js` (to be built) — diffs current `CONSTANTS_2026` vs fetched values
- Produce a red/green report per line

**Step 3 — Update**
- For each diff: create a PR updating `wage-slip-calculator.js → CONSTANTS_2026`
- Update `ISRAELI_TAX_CONSTANTS_2026.md` in parallel
- Update this file (`CONSTANTS_VERIFICATION.md`) — change status markers, add entry to change log

**Step 4 — Regression test**
- Run the full wage-slip test suite (`tests/payroll/*.test.js`)
- Run parallel computation on last 12 months of historical slips — any delta must be explainable
- Tax accountant sign-off before merge

**Step 5 — Deploy**
- Merge and deploy **before** first January payroll run
- Tag release with `tax-constants-YYYY`

### Secondary cadence: 1 April each year
Run a light re-check for pension cap + any mid-year בג"ץ / חקיקה changes.

### Event-triggered
Whenever any of the following happens, trigger an out-of-cycle review:
- חוק ההסדרים enacted
- חוק התקציב enacted
- פסיקת בג"ץ affecting payroll
- עדכון שר האוצר to VAT rate
- Tax reform announced

---

## 4. Severity of staleness

| Constant group | Severity if stale | Likelihood of change in any year |
|---|---|---|
| Income tax brackets | **HIGH** — affects every employee | Almost certain (CPI) |
| נקודת זיכוי | **HIGH** | Almost certain (CPI) |
| BL thresholds | **HIGH** | Almost certain (wage index) |
| BL rates | **MEDIUM** | Occasional |
| Health tax rates | **MEDIUM** | Rare |
| Pension rates | **LOW** | Very rare |
| Pension cap | **MEDIUM** | Occasional |
| Study fund ceiling | **MEDIUM** | Occasional |
| OT multipliers | **LOW** | Very rare |
| Standard hours | **LOW** | Very rare |

---

## 5. Change Log

| Date | Line / field | Old | New | Reason | Operator |
|---|---|---|---|---|---|
| 2026-04-11 | — | — | — | Initial creation of verification mapping | Agent-34 |

---

## 6. Next steps

1. **Build** `scripts/verify-tax-constants.js` — automated diff tool
2. **Add** missing constants identified in Section 2 (minimum wage, sick schedule, etc.)
3. **Refactor** `TAX_CREDIT_POINT_MONTHLY` to be derived from `TAX_CREDIT_POINT_ANNUAL` (eliminate drift risk)
4. **Schedule** 2026-12-15 reminder to pull 2027 constants
5. **Establish** tax-accountant-on-retainer to sign off annual constant updates

---

*Mapping based on `wage-slip-calculator.js` as of commit `c4d76b8` (HEAD at 2026-04-11). If the file is modified, this document must be updated in the same commit.*
