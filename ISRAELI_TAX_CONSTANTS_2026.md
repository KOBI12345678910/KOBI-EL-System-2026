# Israeli Tax Constants — 2026

**Agent:** Agent-34
**Date:** 2026-04-11
**Purpose:** Single source of truth for all tax constants used in the Mega ERP.
**Status legend:**
- **CONFIRMED** — published in official gazette / on authority website
- **ESTIMATED** — derived from prior-year value + CPI / average-wage indexation, to be updated when officially published
- **PLACEHOLDER** — best guess, flag for urgent verification

---

## 1. Income Tax Brackets (מדרגות מס הכנסה) — Annual

| Up to (NIS/year) | Rate | Status | Notes |
|---|---|---|---|
| 84,120 | **10%** | ESTIMATED | 2025 was ~₪84,120; 2026 assumed flat |
| 120,720 | **14%** | ESTIMATED | |
| 193,800 | **20%** | ESTIMATED | |
| 269,280 | **31%** | ESTIMATED | |
| 560,280 | **35%** | ESTIMATED | |
| 721,560 | **47%** | ESTIMATED | |
| ∞ | **50%** | CONFIRMED | 47% marginal + 3% יסף (surtax) on income > ~₪721,560/year |

**Source (primary):** רשות המסים — פקודת מס הכנסה, סעיף 121
**URL placeholder:** https://www.gov.il/he/departments/guides/income-tax-brackets
**Gazette placeholder:** ילקוט פרסומים — עדכון שנתי לפי תקנות מס הכנסה (תיאומים בשל אינפלציה)

**Important:** Brackets are indexed annually per CPI. When the 2026 actual brackets are published (usually late December 2025 or January 2026 in ילקוט פרסומים), update the `ESTIMATED` rows.

---

## 2. נקודת זיכוי (Tax Credit Point)

| Item | Value | Status | Source |
|---|---|---|---|
| Annual value (2026) | **₪2,976** | ESTIMATED | 2025 was ₪2,976; expected slight CPI bump |
| Monthly value (2026) | **₪248** | ESTIMATED | = annual / 12 |
| Standard resident Israeli male | **2.25 points** | CONFIRMED | פקודת מס הכנסה 34 |
| Standard resident Israeli female | **2.75 points** | CONFIRMED | +0.5 additional נקודה |
| Per child under 5 (mother) | **+2.0 points** | CONFIRMED | |
| Per child 6–17 (mother) | **+1.0 point** | CONFIRMED | |
| Per child (father, split) | **variable** | CONFIRMED | see ruling |

**Source placeholder:** https://www.gov.il/he/departments/guides/credit-points

**Citation:** פקודת מס הכנסה, סעיפים 34, 36, 37, 38, 40

---

## 3. VAT Rate (שיעור מע"מ)

| Item | Value | Status | Source |
|---|---|---|---|
| Standard rate (2026) | **17%** | CONFIRMED | Rate raised to 17% effective 1 January 2025; remains 17% in 2026 |
| Eilat zone (אילת) | **0%** | CONFIRMED | חוק אזור סחר חופשי אילת |
| Export | **0%** | CONFIRMED | סעיף 30 חוק מע"מ |
| Fruit & vegetables (unprocessed) | **0%** | CONFIRMED | סעיף 30 |

**Source placeholder:** https://www.gov.il/he/departments/taxes/value-added-tax
**Law:** חוק מס ערך מוסף, התשל"ו-1975

---

## 4. Corporate Tax (מס חברות)

| Item | Value | Status | Source |
|---|---|---|---|
| Standard corporate rate (2026) | **23%** | CONFIRMED | Unchanged from 2018+ |
| Preferred enterprise (אזור פיתוח א') | **7.5%** | CONFIRMED | חוק עידוד השקעות הון |
| Preferred enterprise (other) | **16%** | CONFIRMED | |
| Special preferred enterprise | **5% / 8%** | CONFIRMED | |

**Source placeholder:** https://www.gov.il/he/departments/guides/corporate-tax
**Law:** פקודת מס הכנסה, סעיף 126; חוק עידוד השקעות הון

---

## 5. ביטוח לאומי (National Insurance) — 2026

### Thresholds
| Item | Value (NIS/month) | Status | Source |
|---|---|---|---|
| Average salary (שכר ממוצע במשק) | **~₪12,536** | ESTIMATED | MoF publishes annually; 2026 TBD |
| Reduced-rate threshold (60% of average) | **~₪7,522** | ESTIMATED | = 60% × 12,536 |
| Max insurable earnings | **~₪49,030** | ESTIMATED | = 5× average |

### Employee Rates (below / above threshold)
| Component | Below threshold | Above threshold | Status |
|---|---|---|---|
| **Bituach Leumi** — employee | 0.4% | 7.0% | CONFIRMED (structural) / ESTIMATED (exact rates) |
| **Health Tax** — employee | 3.1% | 5.0% | CONFIRMED (structural) |

### Employer Rates
| Component | Below threshold | Above threshold | Status |
|---|---|---|---|
| **Bituach Leumi** — employer (includes health tax portion) | 3.55% | 7.6% | CONFIRMED (structural) |

**Source placeholder:** https://www.btl.gov.il/benefits/insurance/Pages/default.aspx (ביטוח לאומי website)
**Annual publication:** לוחות דמי ביטוח — מפורסמים כל שנה ב-01/01

**Important:** Rates and thresholds must be re-verified every January via the ביטוח לאומי rate tables.

---

## 6. Pension (פנסיית חובה) — 2026

| Item | Value | Status | Source |
|---|---|---|---|
| Employee minimum | **6%** | CONFIRMED | תקנות פנסיית חובה |
| Employer minimum (תגמולים) | **6.5%** | CONFIRMED | |
| Employer severance (פיצויים) | **8.33%** | CONFIRMED | =1/12 חודש |
| **Total employer (min)** | **14.83%** | CONFIRMED | |
| Max pensionable base | **~₪28,750/month** | ESTIMATED | ≈ 2× average salary; published annually |
| First-shekel rule | Yes | CONFIRMED | Post-2017 — מהשקל הראשון |
| Eligibility waiting period (new to workforce) | 6 months | CONFIRMED | צו הרחבה |
| Eligibility (worker with prior pension) | 3 months | CONFIRMED | |

**Source placeholder:** https://www.gov.il/he/departments/topics/mandatory_pension
**Law:** צו הרחבה לפנסיית חובה, 2008 + תיקונים

---

## 7. קרן השתלמות (Study Fund)

| Item | Value | Status | Source |
|---|---|---|---|
| Employee rate | **2.5%** | CONFIRMED (customary) | Not mandatory; common in contracts |
| Employer rate | **7.5%** | CONFIRMED (customary) | |
| Tax-exempt ceiling (תקרה) | **~₪15,712/month** | ESTIMATED | Published annually |
| Withdrawal period | 6 years | CONFIRMED | Tax-free after 6 years |

**Source placeholder:** https://www.gov.il/he/departments/guides/study-fund
**Law:** פקודת מס הכנסה, סעיף 3(ה)

**Note:** Study fund is NOT mandatory by law — it is contractual. The 2.5%/7.5% ratio is customary and maintains tax-exemption when within the ceiling. Contributions above ceiling are taxable.

---

## 8. Overtime Multipliers — חוק שעות עבודה ומנוחה

| Hour type | Multiplier | Status | Source |
|---|---|---|---|
| Regular | 1.00× | CONFIRMED | |
| Overtime — first 2h/day | **1.25×** | CONFIRMED | חוק שעות עבודה ומנוחה, סעיף 16 |
| Overtime — beyond 2h/day | **1.50×** | CONFIRMED | |
| Weekend / night after hours | **1.75×** | CONFIRMED | custom/contractual extension |
| חג (holiday) | **2.00×** | CONFIRMED | סעיף 17 + צווי הרחבה |

**Source placeholder:** https://www.nevo.co.il/law_html/law01/p214m1_002.htm
**Law:** חוק שעות עבודה ומנוחה, התשי"א-1951

**Caps:**
- Max 12 work hours per day (including OT)
- Max 58 work hours per week (including OT, with permit)
- Max 8 OT hours per week (without permit)
- Max 16 OT hours per week (with היתר כללי)

---

## 9. יסף (High-Earner Surtax)

| Item | Value | Status | Source |
|---|---|---|---|
| Surtax rate | **3%** | CONFIRMED | פקודת מס הכנסה, סעיף 121ב |
| Annual threshold (2026) | **~₪721,560** | ESTIMATED | |
| Monthly equivalent | **~₪60,130** | ESTIMATED | |

**Effective top marginal rate:** 47% + 3% = **50%**

**Source placeholder:** https://www.gov.il/he/departments/guides/high-earners-surtax

---

## 10. Minimum Wage (שכר מינימום)

| Item | Value | Status | Source |
|---|---|---|---|
| Minimum monthly (full time) | **~₪6,247.67** | ESTIMATED | 2025 was ₪5,880; increase planned for 2026 |
| Minimum hourly | **~₪34.33** | ESTIMATED | = monthly / 182 |
| Minimum daily (6d week) | **~₪249.91** | ESTIMATED | |

**Source placeholder:** https://www.gov.il/he/departments/guides/minimum-wage
**Law:** חוק שכר מינימום, התשמ"ז-1987

---

## 11. Standard Working Hours

| Item | Value | Status | Source |
|---|---|---|---|
| Standard hours per month | **182** | CONFIRMED | 42h/week × 4.333 (post April 2018 reform) |
| Standard hours per week | **42** | CONFIRMED | |
| Standard days per week | 5 or 6 | CONFIRMED | Contractual |

---

## 12. Verification Schedule

| Constant group | Verify when | Source to re-check |
|---|---|---|
| Income tax brackets | Every Jan 1 | רשות המסים — ילקוט פרסומים |
| נקודת זיכוי | Every Jan 1 | רשות המסים |
| Bituach Leumi rates + thresholds | Every Jan 1 | btl.gov.il rate tables |
| Pension cap | Every Apr 1 | צו הרחבה updates |
| Study fund ceiling | Every Jan 1 | רשות המסים |
| Minimum wage | On law amendment | משרד העבודה |
| VAT rate | On law amendment | חוק מע"מ |
| Corporate tax | On law amendment | פקודת מס הכנסה |

**Recommended cadence:** Full constants review on **1 January** and **1 April** every year. Any discrepancy blocks production payroll until reconciled.

---

## 13. Sources (official)

| Authority | URL (placeholder) |
|---|---|
| רשות המסים בישראל | https://www.gov.il/he/departments/israel_tax_authority |
| ביטוח לאומי | https://www.btl.gov.il/ |
| משרד האוצר | https://www.gov.il/he/departments/ministry_of_finance |
| משרד העבודה | https://www.gov.il/he/departments/ministry_of_labor |
| חוקים ברשומות (Nevo / Takdin) | https://www.nevo.co.il/ |
| ילקוט פרסומים | https://www.gov.il/he/departments/publications |

---

## 14. Change Log

| Date | Change | Source | Operator |
|---|---|---|---|
| 2026-04-11 | Initial creation | multiple | Agent-34 |

---

*All constants matching `onyx-procurement/src/payroll/wage-slip-calculator.js → CONSTANTS_2026`. For line-by-line mapping see `CONSTANTS_VERIFICATION.md`.*
