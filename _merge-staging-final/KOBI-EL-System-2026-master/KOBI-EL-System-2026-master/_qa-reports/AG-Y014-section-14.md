# AG-Y014 — Section 14 Pension Arrangement Tracker (הסדר סעיף 14)
**Agent:** Y-014 | **Swarm:** Israeli Payroll Compliance | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 22/22 tests green
**Rule:** לא מוחקים רק משדרגים ומגדלים — honoured (append-only storage, `upgradeArrangement` supersedes instead of mutating).

---

## 1. Scope

A zero-dependency tracker for Section 14 pension arrangements under
Israeli labour law. The module classifies each arrangement as full or
partial, computes monthly contribution breakdowns, tracks month-by-month
deposit history, and — most importantly — calculates any top-up owed by
the employer on termination.

Delivered files
- `onyx-procurement/src/pension/section-14.js` — the engine (≈680 LOC)
- `onyx-procurement/test/pension/section-14.test.js` — 22 tests
- `_qa-reports/AG-Y014-section-14.md` — this report

RULES respected
- **Never delete** — `upgradeArrangement` creates a new versioned record
  and marks the old one `superseded_by` + `superseded_at`; the old record
  stays in `_arrangements` forever. There is no exported delete function.
- **Bilingual** — every human-facing field has a Hebrew counterpart
  (`_he` keys or Hebrew strings); the formal letter is primarily Hebrew
  with an English parallel text.
- **Zero deps** — only `node:crypto` (standard library) for id generation.
- **Real code** — 22 tests covering validation, classification, monthly
  breakdown, termination math in all four scenarios (full / partial /
  pre-arrangement / forfeiture), history aggregation, and supersession.

---

## 2. Section 14 — Legal Background

**Source**: סעיף 14 לחוק פיצויי פיטורים, התשכ"ג-1963 +
"היתר כללי לתשלומי מעבידים לקרן פנסיה ולקופת ביטוח במקום פיצויי פיטורים"
(General Approval, issued by the Minister of Labour on 30.6.1998 and
subsequently amended).

### 2.1 The core trade-off

| Without Section 14 | With Section 14 |
|---|---|
| Employer owes 1 month of the *final* salary per year of service AT termination | Employer deposits 8.33% (= 1/12) of monthly salary *as it is earned*, into a pension fund / gemel / managers' insurance |
| Severance can be denied in cases of resignation | **Monies are RELEASED to the employee regardless of reason for termination** (except sections 16–17 of the law) |
| Employer carries a growing liability on its balance sheet | Liability is extinguished month by month |
| Employee bears the risk of employer insolvency | Employee's severance is held by a third-party fund, survives the employer |

### 2.2 Prerequisites for a valid Section 14 arrangement

1. **Signed written agreement** referencing the general approval.
2. **Employer pension ≥ 6% / 6.5%** (6.5% under the 2017 mandatory
   pension law; 6% is still accepted on legacy letters).
3. **Employee contribution ≥ 6%** (or 5.5% in managers' insurance variants).
4. **Severance contribution** — ideally the full 8.33%; a partial rate
   is permitted but the employer must top up the difference at termination.
5. **No clawback clause** — the employer cannot reclaim deposited
   severance funds except in the narrow cases of sections 16–17
   (theft / serious breach / conviction).
6. **Defined start date** — months BEFORE that date are NOT released.

### 2.3 "Partial" arrangement

When the employer contributes less than 8.33% (e.g. 6% only into the
severance component of a provident fund), the release is **proportional**.
At termination the employer owes the difference between the statutory
amount and what was actually deposited, computed at the final salary:

```
topUp = (finalSalary × yearsCovered) − (finalSalary × 12 × partialRate × yearsCovered)
      = finalSalary × yearsCovered × (1 − 12 × partialRate)
```

For a 6% partial arrangement this yields `finalSalary × years × (1 − 0.72) =
finalSalary × years × 0.28` — 28% of the statutory amount must be topped up.

---

## 3. Public API

```js
const S14 = require('./src/pension/section-14.js');

// Core (as per spec)
S14.createArrangement({
  employee, startDate,
  percentages: { employerPension, severance, employeeContribution, studyFund },
  signed, signedDate, fundName, fundPolicyNumber, createdBy,
}) → arrangement

S14.calculateMonthlyContribution(salary, arrangement) → breakdown

S14.calculateSeveranceOnTermination({
  employee, arrangement, finalSalary, yearsEmployed, reason,
  terminationDate, monthsNotCoveredByPartial,
}) → settlement

S14.isFullyReleased(arrangement) → boolean

S14.generateArrangementLetter(arrangement) → { text_he, text_en, direction:'rtl', ... }

S14.trackContributionHistory(employeeId) → {
  employee_id,
  arrangements: [{ aggregate, monthly_history }, …],
  grand_total,
}

// Support
S14.recordMonthlyContribution(arrangementId, { period, salary, actuallyDeposited })
S14.upgradeArrangement(arrangementId, changes) → new arrangement (supersedes old)
S14.getArrangement(id)
S14.listArrangementsForEmployee(employeeId)

// Constants
S14.SECTION_14
```

---

## 4. Contribution percentages — 2026 reference table

| Component | Employer | Employee | Notes |
|---|---:|---:|---|
| פנסיה (tagmulim / pension) | **6.5%** (legacy 6%) | **6%** | Mandatory pension law minimums |
| פיצויים (severance) | **8.33%** full / **6%+** partial | — | Full rate releases the employer at termination |
| קרן השתלמות (study fund) | 7.5% | 2.5% | Voluntary, tax-exempt up to ₪15,712/month |
| **Total (full arrangement)** | **22.33%** | **8.5%** | Of pensionable salary |
| **Total (partial @6% severance)** | 19.5% | 8% | Requires top-up at termination |

The module VALIDATES against these floors; attempts to create an
arrangement with `employerPension < 6%`, `employeeContribution < 6%`, or
`severance > 8.33%` throw a bilingual error.

---

## 5. Top-up formula at termination

Let:
- `FS` = final pensionable salary (NIS/month)
- `Y` = total years of employment
- `Yc` = years covered by the Section 14 arrangement (from `start_date` to `terminationDate`)
- `Yb` = years before the arrangement = max(0, Y − Yc)
- `r` = employer severance rate under the arrangement (e.g. 0.0833 or 0.06)
- `mExtra` = months of non-pensioned components (bonuses, overtime over cap) that still need top-up

### 5.1 Statutory severance

```
statutorySeverance = FS × Y
```

### 5.2 Already deposited under Section 14 (valued at final salary)

```
alreadyDeposited = FS × 12 × r × Yc
```

When the arrangement is classified as **full** (`r` ≈ 1/12), the engine
uses the exact 1/12 instead of the rounded 0.0833 so that the "no top-up"
guarantee holds down to the cent.

### 5.3 Top-up components

```
topUpForPartial     = max(0,  FS × Yc  −  alreadyDeposited)
topUpForPreArr      = FS × Yb
topUpForExtras      = (FS / 12) × mExtra
topUpOwed           = topUpForPartial + topUpForPreArr + topUpForExtras
```

### 5.4 Forfeiture (sections 16–17)

If `reason ∈ { theft_or_fraud, serious_breach }`:
```
topUpOwed = 0          // deposited funds stay with the employee;
forfeited = true       // no additional employer liability.
```

### 5.5 Decision table (examples)

| Scenario | FS | Y | Yc | r | topUp |
|---|---:|---:|---:|---:|---:|
| Full, resignation after 5y (all covered) | 12,000 | 5 | 5 | 1/12 | **0** |
| Full, dismissal after 5y (all covered) | 12,000 | 5 | 5 | 1/12 | **0** |
| Partial 6%, dismissal after 5y | 10,000 | 5 | 5 | 0.06 | **14,000** |
| Full, dismissal after 7y but arrangement started 2y in | 10,000 | 7 | 5 | 1/12 | **≈20,000** |
| Theft & dismissal | 12,000 | 5 | 5 | 1/12 | **0 (forfeited)** |

All five rows are exercised by the test suite.

---

## 6. Formal letter template (Hebrew)

The `generateArrangementLetter` function emits a RTL Hebrew letter whose
structure follows the customary market wording:

```
אל: [שם העובד]
ת"ז: [תעודת זהות]
תאריך: [תאריך תחילת ההסדר]

הנדון: הסדר על-פי סעיף 14 לחוק פיצויי פיטורים, התשכ"ג-1963

1. הרינו להודיעך כי החל מיום [תאריך] יחול עליך הסדר על-פי סעיף 14 לחוק
   פיצויי פיטורים, התשכ"ג-1963, בכפוף ל"היתר הכללי לתשלומי מעבידים לקרן
   פנסיה ולקופת ביטוח במקום פיצויי פיטורים" מיום 30.6.1998 ותיקוניו.

2. במסגרת הסדר זה, המעביד יפריש מדי חודש את השיעורים הבאים מהשכר הקובע
   לפנסיה:
   א. הפרשת מעביד לפנסיה (תגמולים): [employerPension]%.
   ב. הפרשת מעביד לפיצויים: [severance]%.
   ג. הפרשת עובד: [employeeContribution]%.
   ד. קרן השתלמות: [studyFund_employee]% עובד / [studyFund_employer]% מעביד.

3. ההפרשות יועברו ל-[fundName] (מספר פוליסה/קרן: [fundPolicyNumber]).

4. הצדדים מסכימים כי תשלומי המעביד לרכיב הפיצויים יבואו במקום תשלום
   פיצויי פיטורים על-פי סעיף 14 לחוק, וזאת ביחס לשכר ולתקופות שבהן
   יופקדו תשלומים אלו בפועל, והכל בכפוף להוראות הדין והיתר הכללי.

5. [FULL]    מדובר בהסדר מלא: הפרשת המעביד לרכיב הפיצויים היא בשיעור
             8.33% מן השכר הקובע, ועל כן במועד סיום יחסי העבודה — מכל סיבה
             שהיא למעט המקרים הקבועים בסעיפים 16–17 לחוק — הכספים שהצטברו
             ברכיב זה ישוחררו לטובת העובד והמעביד יהיה פטור מכל חבות
             נוספת בגין פיצויי פיטורים עבור התקופה המכוסה.
   [PARTIAL] מדובר בהסדר חלקי: הפרשת המעביד לרכיב הפיצויים היא בשיעור
             [severance]% בלבד, ולפיכך במועד סיום יחסי העבודה יהיה המעביד
             חייב בהשלמה יחסית של ההפרש שבין השיעור המופרש לבין 8.33%
             הסטטוטוריים, מוכפל בשכר האחרון ובשנות העבודה המכוסות בהסדר.

6. המעביד מתחייב שלא לבקש החזר של כספי הפיצויים, למעט במקרים המפורטים
   בסעיפים 16–17 לחוק פיצויי פיטורים.

7. הסדר זה חל על השכר המבוטח בלבד. רכיבי שכר שאינם מבוטחים (כגון
   בונוסים, שעות נוספות מעבר לתקרה, ורכב מעל התקרה החוקית) — אינם
   נכללים בהסדר ודורשים השלמה במועד הסיום.

המעביד: _______________________      העובד: _______________________
חתימה וחותמת                           חתימה
תאריך חתימה: [signedDate]

(מסמך זה נערך באופן אוטומטי על-ידי מערכת Techno-Kol Uzi. המסמך אינו
 מהווה תחליף לייעוץ משפטי.)
```

An English parallel text is also returned (`text_en`) for bilingual
employment packages.

**Clause 5 is template-driven** — the module switches between the FULL
and PARTIAL variants based on the classification performed at
`createArrangement` time.

---

## 7. Test coverage

```
test/pension/section-14.test.js
```

22 tests, 0 failures, 0 skipped:

| # | Group | Test |
|---:|---|---|
| 1 | createArrangement | full arrangement is flagged correctly |
| 2 | createArrangement | partial arrangement is flagged correctly |
| 3 | createArrangement | rejects severance above statutory 8.33% |
| 4 | createArrangement | rejects employer pension below 6% |
| 5 | createArrangement | rejects employee contribution below 6% |
| 6 | calculateMonthlyContribution | computes all components for full arrangement |
| 7 | calculateMonthlyContribution | partial arrangement lower employer severance |
| 8 | termination | FULL — NO top-up on dismissal |
| 9 | termination | FULL — NO top-up on resignation (the key benefit) |
| 10 | termination | PARTIAL (6% only) — proportional top-up required |
| 11 | termination | years BEFORE arrangement start trigger extra top-up |
| 12 | termination | forfeiture (theft) → zero top-up |
| 13 | termination | unknown reason throws |
| 14 | isFullyReleased | true for full + signed |
| 15 | isFullyReleased | false for partial |
| 16 | isFullyReleased | false if not signed |
| 17 | letter | contains key Hebrew clauses |
| 18 | letter | partial arrangement mentions top-up |
| 19 | history | aggregates month-by-month rows correctly |
| 20 | history | spans multiple (upgraded) arrangements |
| 21 | upgrade | old version preserved with `superseded_by` |
| 22 | upgrade | cannot double-supersede |

Run locally:
```bash
cd onyx-procurement
node --test test/pension/section-14.test.js
```

Last green run:
```
ℹ tests 22
ℹ pass 22
ℹ fail 0
ℹ duration_ms 177.15
```

---

## 8. Known limitations / future work

1. The module does not yet **persist to the database** — it currently
   stores arrangements in process-memory `Map`s. The interface is stable
   and a DB adapter can be added without touching the math.
2. `already_deposited_under_section_14` is valued at **final salary**
   (as the law requires for top-up), not at the historical salary in
   each month. A future enhancement can also compute the
   "book-value" figure using the historical deposits from
   `trackContributionHistory`, which is useful for balance-sheet disclosure.
3. Managers' insurance variants (5% + 8.33% + disability coverage of up to
   2.5%) use different structural percentages; for now they must be
   recorded as custom `percentages` on create. A named preset function
   (`createManagersInsuranceArrangement`) can be added later.
4. The letter generator outputs plain text; a PDF variant that ties into
   the existing `src/payroll/pdf-generator.js` pipeline is a follow-up.
5. `_yearsBetween` uses 365.25 days/year. Over long careers this
   introduces ~2 hours/year of drift vs calendar years. Acceptable for
   monetary computations (~20 NIS over 5 years on a 10 k salary), and the
   test suite explicitly allows that tolerance.

---

## 9. Never-delete verification

```
$ grep -n "delete\|\.clear\s*(" onyx-procurement/src/pension/section-14.js
```

- The only `.clear()` calls are inside `_resetAll()`, which is a test
  hook, not exported publicly.
- There is no exported delete function.
- `upgradeArrangement` mutates only the two fields `superseded_by` /
  `superseded_at` / `status` on the OLD record — it never removes it
  from the storage `Map`.
- All read helpers return **deep clones**, so callers cannot mutate the
  stored history.

Rule `לא מוחקים רק משדרגים ומגדלים` — honoured.

---

## 10. Legal disclaimer

This module implements the author's engineering interpretation of
Section 14 and the General Approval of 30.6.1998. It is not legal advice.
Every actual Section 14 arrangement must be reviewed by counsel and
signed according to the applicable general approval text. The letter
generator emits a drafting aid, not a legal instrument.
