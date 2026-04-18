# AG-X12 — HR Analytics Dashboard Backend

**Agent:** X-12
**Swarm:** 3 (Techno-Kol Uzi)
**System:** Kobi's mega-ERP
**Date:** 2026-04-11
**Status:** GREEN (30/30 tests passing)

---

## 1. Scope

HR analytics dashboard backend for Techno-Kol Uzi — pure, zero-dependency people
metrics engine exposing headcount, turnover, cost, absence, diversity, pay
equity, retention risk, severance, and 106-form aggregates.

Hebrew/English bilingual labels. Israeli labor-law compliant
(חוק שוויון הזדמנויות, חוק הגנת הפרטיות, חוק דמי מחלה, חוק חופשה שנתית,
חוק עבודת נשים, חוק פיצויי פיטורים).

## 2. Deliverables

| File | Purpose | Lines |
|------|---------|------:|
| `onyx-procurement/src/hr/analytics.js` | Full analytics engine | ~740 |
| `onyx-procurement/test/payroll/hr-analytics.test.js` | Test suite | ~390 |
| `_qa-reports/AG-X12-hr-analytics.md` | This report | — |

## 3. Exports

### Core reports

| Function | Purpose |
|---|---|
| `headcountReport(employees, period)` | total, by_department, by_role, by_employment_type, monthly trend |
| `turnoverAnalysis({employees, separations}, period)` | rate, voluntary, involuntary, YTD, rolling 12m, by_reason |
| `timeToHire(records, period)` | avg, median, p90, by_department |
| `timeToProductivity(employees, period)` | avg / median onboarding days |
| `costPerHire(spend, hires, period)` | total spend / hires + breakdown |
| `totalComp(employee, period)` | gross + pension + severance + BL + study fund + benefits |
| `overtimeCostRatio(payrolls, period)` | OT as % of base |
| `absenceRate(absences, workdays, period)` | sick / vacation / unpaid + maternity & reserve duty reported separately |
| `tenureHistogram(employees, asOf)` | <1y / 1-2y / 2-5y / 5-10y / 10+y |
| `diversityDashboard(employees)` | aggregate-only gender / age / tenure / department |
| `trainingHours(records, employees, period)` | total, avg, by topic |
| `payEquityAudit(employees)` | gap by role with Welch t-statistic |
| `retentionRisk(employee, context)` | 0-100 score, band, factors, interventions |

### Israeli-specific

| Function | Law |
|---|---|
| `severance(employee, exitDate)` | חוק פיצויי פיטורים — 1 month per year, pro-rated |
| `form106(employee, year)` | טופס 106 — YTD comp summary (data-only, never writes) |

## 4. Israeli labor-law handling

| Requirement | Implementation |
|---|---|
| **Reserve duty (מילואים)** | `turnoverAnalysis` filters out any separation where `type === reserve_duty` / `miluim` / reason contains `מילואים`. A `reserve_duty_excluded: true` flag is returned on every report. `absenceRate` reports reserve-duty days separately from the rate. |
| **Maternity leave (חופשת לידה)** | `absenceRate` reports maternity days in a dedicated bucket but **excludes** them from the rate. 26-week standard + 6-week extension constants are codified in `ISRAELI_LABOR`. |
| **Sick pay eligibility** | Constant `SICK_PAY_ELIGIBILITY_DAYS = 365` exposed for consumers. |
| **Severance (פיצויים)** | `severance()` uses 1-month-per-year, pro-rated by day-count. Returns `law: 'חוק פיצויי פיטורים, תשכ״ג-1963'` for audit trail. |
| **Form 106 data** | `form106()` aggregates YTD gross, income tax withheld, BL employee, health tax employee, pension employee, study fund employee, net — without writing files. |
| **Equal-opportunity law** | `diversityDashboard()` only emits aggregate counts, collapses any bucket < `PRIVACY.MIN_GROUP_SIZE` (= 5) into "other", and returns `compliant_with: ['חוק שוויון הזדמנויות בעבודה', 'חוק הגנת הפרטיות']`, `individual_pii_exposed: false`. |
| **Equal pay (שכר שווה)** | `payEquityAudit()` computes tenure-normalized pay gap with Welch's t-test; any role with fewer than `PRIVACY.MIN_EQUITY_GROUP` (= 3) employees on either side is marked `suppressed: true` and emits no numbers. |

## 5. Privacy architecture

- Every aggregation function emits counts only — no employee IDs, no PII.
- `diversityDashboard` and `payEquityAudit` both self-collapse small groups.
- Regression tests `privacy: diversityDashboard never exposes individual PII`
  and `privacy: payEquityAudit never leaks individual salaries` verify by
  JSON-stringifying the output and asserting no employee IDs or raw salaries
  appear.
- `retentionRisk` is the only endpoint that operates on a single employee;
  callers are responsible for access-control.

## 6. Metrics coverage

1. Headcount — total / dept / role / employment type + monthly trend
2. Turnover — monthly / YTD / rolling 12m / voluntary-involuntary / by_reason
3. Time-to-hire — avg / median / p90 / by department
4. Time-to-productivity — avg / median
5. Cost per hire — total spend + per-category breakdown
6. Total comp per employee — gross + overtime + pension + severance + BL + study fund + benefits
7. Overtime cost ratio — OT / base
8. Absence rate — sick / vacation / unpaid (maternity & reserve duty tracked separately)
9. Tenure histogram — 5 buckets + avg tenure
10. Diversity — gender / age / tenure / department, aggregate-only
11. Training hours — total / per-employee / by topic
12. Pay equity — gap by role with statistical significance

## 7. Zero-dependency verification

```
$ grep -E "^(const|import).*require" onyx-procurement/src/hr/analytics.js
# no matches — pure JS only
```

Only `node:test` and `node:assert/strict` used in the test file — both built-in.

## 8. Test results

```
$ node --test test/payroll/hr-analytics.test.js
tests 30
suites 0
pass 30
fail 0
duration_ms ~138
```

30 scenarios (exceeds 15+ requirement) covering:

| # | Area | Tests |
|---|---|---:|
| 1 | headcount | 3 |
| 2 | turnover (incl. reserve-duty exclusion) | 3 |
| 3 | time-to-hire | 1 |
| 4 | time-to-productivity | 1 |
| 5 | cost-per-hire | 1 |
| 6 | total comp | 1 |
| 7 | overtime ratio | 1 |
| 8 | absence rate (maternity/reserve excluded) | 1 |
| 9 | tenure histogram | 1 |
| 10 | diversity + privacy collapse | 2 |
| 11 | training hours | 1 |
| 12 | pay equity (detect + suppress) | 2 |
| 13 | retention risk (high / low / null) | 3 |
| 14 | severance (pro-rated / zero) | 2 |
| 15 | form 106 (YTD filtering) | 1 |
| 16 | _internals sanity | 3 |
| 17 | privacy invariants | 2 |
| 18 | constants | 1 |

## 9. Integration notes

- The module only reads in-memory records. Callers supply employee /
  separation / payroll / absence / recruiting arrays.
- `payroll_history` entries are expected to follow the existing
  `wage-slip-calculator.js` schema (gross, overtime, pension_employer,
  severance_employer, bituach_leumi_employer, study_fund_employer,
  income_tax, bituach_leumi_employee, health_tax_employee,
  pension_employee, study_fund_employee).
- Period accepts `{start, end}`, `{year}`, or `{year, month}`.
- All dates accept ISO strings or Date objects.

## 10. Non-goals / future work

- No persistence layer (by design — pure functions).
- No ML; `retentionRisk` is heuristic-only.
- No PDF rendering of Form 106 — data only; existing `pdf-generator.js`
  can consume the output.
- No forecasting (attrition projection could be layered on top of
  `turnoverAnalysis.rolling_12m`).

## 11. Compliance summary

| Law | Clause honored | Location |
|---|---|---|
| חוק שוויון הזדמנויות בעבודה | Aggregate-only diversity | `diversityDashboard` |
| חוק הגנת הפרטיות | No individual PII, small-group collapse | `PRIVACY.*`, both aggregations |
| חוק שכר שווה לעובדת ולעובד | Tenure-normalized pay-gap with suppression | `payEquityAudit` |
| חוק פיצויי פיטורים תשכ״ג-1963 | 1 month per year, pro-rated | `severance` |
| חוק דמי מחלה | 365-day eligibility constant | `ISRAELI_LABOR.SICK_PAY_ELIGIBILITY_DAYS` |
| חוק עבודת נשים | 26w + 6w extension constants, excluded from absence rate | `ISRAELI_LABOR.MATERNITY_*`, `absenceRate` |
| חוק חיילים משוחררים (מילואים) | Never counts in turnover or absence rate | `turnoverAnalysis`, `absenceRate` |

## 12. Sign-off

- [x] File created at requested path
- [x] 15+ tests — delivered 30
- [x] Zero dependencies
- [x] Privacy-aware
- [x] Hebrew bilingual
- [x] Israeli labor-law compliant
- [x] No deletions to existing code
- [x] All tests passing

— Agent X-12, 2026-04-11
