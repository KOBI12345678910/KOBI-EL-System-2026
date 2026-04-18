# AG-Y064 — Employee Offboarding Workflow Engine — QA Report
# AG-Y064 — מנוע סיום העסקה — דו"ח QA

**Agent:** AG-Y064
**Date / תאריך:** 2026-04-11
**Module / מודול:** `onyx-procurement/src/hr/offboarding.js`
**Test file / קובץ בדיקות:** `onyx-procurement/test/hr/offboarding.test.js`
**Status / סטטוס:** PASS — 29 / 29 tests green
**Rule observed / הכלל המנחה:** "לא מוחקים רק משדרגים ומגדלים" — append-only event log per offboarding; the in-memory `Map` store is never cleared, paused workflows are recoverable, and the engine surface exposes no `delete*` / `remove*` / `purge*` method.
**Zero deps / ללא תלויות:** only `node:test` + `node:assert` for tests; runtime uses no external packages.

---

## 1. Purpose / מטרה

Provide a complete workflow engine for terminating an Israeli employee, end-to-end, in compliance with statutory and case-law obligations. The module orchestrates:

1. Initiation with one of seven reason codes.
2. Generation of the שימוע (pre-dismissal hearing) invitation letter, with a hearing date no earlier than three business days from issuance.
3. Statutory notice-period computation (three tenure bands).
4. Severance dispatch to Y-015 — emit-only, never imports.
5. Asset collection with full state machine (returned / missing / damaged / written off / pending).
6. Access-revocation checklist with bus event `access:revoke`.
7. Bilingual exit interview using a frozen 15-question template.
8. Form 161 (`form161:request`) emit to Y-015 for tax-authority filing.
9. מכתב אישור העסקה (employment confirmation) and discretionary מכתב המלצה.
10. Final payroll computation with unused-vacation pidyon, severance placeholder, and pilot flag.
11. Append-only history (`history()`) — frozen entries, no mutation possible.

---

## 2. Israeli Statutes Covered / חוקי המגן הישראליים שמטופלים

| Statute (HE) | Statute (EN) | Where it appears in code |
|---|---|---|
| חוק הודעה מוקדמת לפיטורים ולהתפטרות, התשס"א-2001 | Prior Notice for Dismissal & Resignation Law, 5761-2001 | `computeNoticePeriodDays()`, `serveNotice()` |
| חובת השימוע (פסיקת בית הדין לעבודה) | Pre-dismissal hearing duty (Labor Court case-law) | `generateShimuaLetter()` — hearing ≥ 3 business days |
| חוק פיצויי פיטורים, התשכ"ג-1963 | Severance Pay Law, 5723-1963 | `computeSeverance()` → emit `severance:compute` (Y-015) |
| חוק חופשה שנתית, התשי"א-1951 | Annual Leave Law, 5711-1951 | `finalPayroll()` — `unused_vacation` line item |
| חוק הגנת השכר, התשי"ח-1958 | Wage Protection Law, 5718-1958 | `finalPayroll()` — final salary line item |
| פקודת מס הכנסה — סעיפים 9(7א), 161, 164 | Income Tax Ordinance §§ 9(7a), 161, 164 | `generateForm161()` → emit `form161:request` (Y-015) |
| חוק הודעה לעובד (תנאי עבודה), התשס"ב-2002 | Notice to Employee Law, 5762-2002 | `generateApprovalLetter()` |
| חוק שוויון הזדמנויות בעבודה, התשמ"ח-1988 | Equal Employment Opportunities Law | reason `dismissal` → mandatory shimua + audit trail |
| חוק הגנה על עובדים (חשיפת עבירות), התשנ"ז-1997 | Whistleblower Protection Law, 5757-1997 | append-only `events[]` log + pause/resume |

---

## 3. Reasons Matrix / מטריצת סיבות סיום

| Code | Hebrew | English | Severity | Rights tier | Shimua required |
|---|---|---|---|---|---|
| `voluntary` | התפטרות מרצון | Voluntary resignation | low | limited | no |
| `dismissal` | פיטורים | Dismissal | high | full | **yes** |
| `retirement` | פרישה לפנסיה | Retirement | low | pension | no |
| `end_of_contract` | סיום חוזה | End of contract | low | full | no |
| `death` | פטירה (מוות) | Death | critical | estate | no |
| `layoff` | צמצום / פיטורי התייעלות | Layoff / economic dismissal | high | full | **yes** |
| `relocation` | מעבר מקום מגורים (רלוקיישן) | Relocation | medium | partial | no |

Each entry exposes `{ code, he, en, severityTier, rightsTier, shimuaRequired }` via `Offboarding.REASONS`.

---

## 4. Notice-Period Table / טבלת הודעה מוקדמת

Implemented in `computeNoticePeriodDays(employee, reason)`. Calendar-month diff is used (year×12 + month delta with day-of-month carry-down) to avoid floating-point drift.

| Tenure (months) | Band | Notice (days) | Formula |
|---:|---|---:|---|
| 0 | `under_six` | 0 | 1/month, floored |
| 1 | `under_six` | 1 | 1 |
| 2 | `under_six` | 2 | 2 |
| 3 | `under_six` | 3 | 3 |
| 4 | `under_six` | 4 | 4 |
| 5 | `under_six` | 5 | 5 |
| **6** | `six_to_twelve` | **6** | base |
| 7 | `six_to_twelve` | 9 | 6 + ⌈1×2.5⌉ = 9 |
| 8 | `six_to_twelve` | 11 | 6 + ⌈2×2.5⌉ = 11 |
| 9 | `six_to_twelve` | 14 | 6 + ⌈3×2.5⌉ = 14 |
| 10 | `six_to_twelve` | 16 | 6 + ⌈4×2.5⌉ = 16 |
| 11 | `six_to_twelve` | 19 | 6 + ⌈5×2.5⌉ = 19 |
| **12+** | `year_plus` | **30** | full month |
| any (death) | `death` | 0 | suspended by statute |

The fractional 2.5/month rule is rounded **up** with `Math.ceil` so the employee never receives less than statute requires.

---

## 5. Shimua Requirements / דרישות השימוע

| Requirement (HE) | Requirement (EN) | Implementation |
|---|---|---|
| בכתב | In writing | `letter.he.body` + `letter.en.body` arrays |
| פירוט הטענות | Allegations listed | `letter.he.allegations` (defaults: ביצועים, התנהגות, התאמה) |
| לפחות 3 ימי עסקים מראש | ≥ 3 business days advance notice | `addBusinessDays(now, 3)` skips Fri & Sat |
| זכות לייצוג | Right to representation | `letter.witnessRights.{he,en}` |
| מועד | Hearing date | `letter.hearingDate` ISO 8601 |
| מיקום | Hearing location | `letter.hearingLocation` (default: משרד מנהל משאבי אנוש) |
| תוצאות אי-הגעה | Consequences of non-attendance | Stated in `body` (he+en) |
| סטטוטוריה | Legal anchor | `letter.he.legal` cites פסיקת בית הדין לעבודה |

The "≥ 3 business days" rule is exercised by two tests, including a Wednesday-issuance scenario that lands the hearing on Monday after skipping Friday + Saturday.

---

## 6. Asset Checklist Template / רשימת ציוד להחזרה

`Offboarding.ASSET_TYPES`:

| Type | Hebrew | English |
|---|---|---|
| `laptop` | מחשב נייד | Laptop |
| `phone` | טלפון סלולרי | Mobile phone |
| `keys` | מפתחות | Keys |
| `access_card` | כרטיס כניסה | Access card |
| `uniform` | מדי עבודה | Uniform |
| `vehicle` | רכב חברה | Company vehicle |
| `fuel_card` | כרטיס דלק | Fuel card |
| `credit_card` | כרטיס אשראי חברה | Company credit card |
| `parking_tag` | תג חנייה | Parking tag |
| `ppe` | ציוד מגן אישי | PPE |
| `documents` | מסמכי חברה | Company documents |
| `monitor` | מסך | Monitor |
| `other` | אחר | Other |

Each asset record carries `{ id, type, labelHe, labelEn, serialNumber, status, notes, recordedAt, recordedBy, history[] }`. Statuses: `returned | missing | damaged | written_off | pending`. The workflow auto-advances to `assets_collected` only when **every** entry is in a final (non-pending) state.

### Default System Catalogue (access revocation)
| ID | Hebrew | English |
|---|---|---|
| `email` | דואר אלקטרוני | Email account |
| `erp` | מערכת ERP | ERP system |
| `crm` | מערכת CRM | CRM system |
| `vpn` | VPN | VPN |
| `sso` | SSO / זיהוי אחיד | SSO / Identity provider |
| `fileshare` | שיתוף קבצים | File share |
| `github` | מאגרי קוד | Source repos |
| `badge` | תג כניסה פיזי | Physical badge |
| `building` | גישה למבנה | Building access |
| `phone_line` | קו טלפון פנימי | Phone extension |

---

## 7. Status State Machine / מכונת מצבים

```
initiated → notice_served → assets_collected → exit_interview → final_payroll → completed
                                  ↓                                         ↓
                                on_hold ←──────── pause/resume ────────→ on_hold
```

* `_transition()` enforces strict left-to-right progression. Skipping or moving backward throws.
* `pause()` records `previousStatus`, sets `on_hold`, leaves the record in the store.
* `resume()` returns to `previousStatus` and appends a `resumed` event.
* `complete()` requires the record to be at `final_payroll`; otherwise throws.

Each transition appends an entry of type `transition` to `record.events` with `{ from, to }` data.

---

## 8. Final Payroll Line Items / סעיפי גמר חשבון

| Code | Hebrew | English | Notes |
|---|---|---|---|
| `final_salary` | שכר חודש אחרון | Final month salary | from `monthlySalary` override or employee record |
| `unused_vacation` | פדיון חופשה לא מנוצלת | Unused vacation pay-out | `days × dailyRate`; legal: חוק חופשה שנתית |
| `severance_owed` | פיצויי פיטורים | Severance owed | `null` placeholder until Y-015 returns; legal: חוק פיצויי פיטורים |
| `unused_sick` (cond.) | ימי מחלה לא מנוצלים | Unused sick days | not paid by default Israeli law |
| `pilot_flag` (cond.) | דגל טייס — חישוב מיוחד | Pilot flag — special computation | informational flag for downstream processing |

`totalKnown` sums only numeric line items, leaving the severance placeholder out so the caller knows the dispatch to Y-015 is pending. `pendingFromBridge` lists every line awaiting bridge data (`['severance_owed']` until splice-in).

---

## 9. Hebrew Glossary / מילון מונחים בעברית-אנגלית

| Term (HE) | Term (EN) | Notes |
|---|---|---|
| סיום העסקה | End of employment | Umbrella term used in module header |
| שימוע | Shimua / Pre-dismissal hearing | Mandatory before any dismissal |
| הודעה מוקדמת | Prior notice | חוק הודעה מוקדמת לפיטורים ולהתפטרות |
| פיצויי פיטורים | Severance pay | חוק פיצויי פיטורים, התשכ"ג-1963 |
| פדיון חופשה | Vacation pay-out | Cash-out of unused vacation days at termination |
| גמר חשבון | Final payroll | Last salary + accruals + severance |
| טופס 161 | Form 161 | Tax-authority termination form |
| מכתב אישור העסקה | Employment confirmation letter | חוק הודעה לעובד (תנאי עבודה), התשס"ב-2002 |
| מכתב המלצה | Recommendation letter | Employer's discretion, not statutory |
| ראיון יציאה | Exit interview | 15-question bilingual template |
| ימי עסקים | Business days | Sun-Thu (Fri-Sat are weekend in Israel) |
| ת.ז. | Teudat Zehut / National ID | 9-digit Israeli identifier |
| תקופת ניסיון | Probation period | Set during onboarding, ends at 90 days |
| צמצום | Layoff (economic dismissal) | Triggers shimua + full severance |
| פטירה | Death (estate) | Suspends notice; severance to estate |
| התפטרות | Resignation | Voluntary; no shimua required |
| פרישה לפנסיה | Retirement | rights tier `pension` |
| רלוקיישן | Relocation | rights tier `partial` |
| הרשאות | Permissions | Used in `revokeAccess()` checklist |

---

## 10. Test Coverage Summary / סיכום כיסוי בדיקות

29 tests, all passing. Covers every requirement in the agent brief plus
defensive paths for the never-delete rule and the bilingual contract.

| # | Test | Area |
|---:|---|---|
| 1 | initiateOffboarding — happy path creates record at INITIATED | initiation |
| 2 | initiateOffboarding — validates required fields and reason enum | initiation |
| 3 | initiateOffboarding — accepts every documented reason | reasons |
| 4 | computeNoticePeriod — under 6 months: 1 day per full month worked | **notice band 1** |
| 5 | computeNoticePeriod — 6 to 12 months: 6 days + 2.5 per month after 6th | **notice band 2** |
| 6 | computeNoticePeriod — year+: full month (30 days) | **notice band 3** |
| 7 | computeNoticePeriod — death suspends notice obligation | edge case |
| 8 | serveNotice — transitions INITIATED → NOTICE_SERVED and stores result | progression |
| 9 | generateShimuaLetter — bilingual + hearing date ≥ 3 business days | **shimua ≥ 3** |
| 10 | generateShimuaLetter — straddling weekend still ≥ 3 business days | **shimua weekend** |
| 11 | generateShimuaLetter — appends event to log | event log |
| 12 | collectAssets — tracks returned/missing/damaged states | **asset state** |
| 13 | collectAssets — pending assets do NOT advance workflow | progression guard |
| 14 | collectAssets — rejects unknown type or status | input validation |
| 15 | revokeAccess — logs requests, emits bus event, can be confirmed | revocation |
| 16 | conductExitInterview — bilingual template stored with answers | **bilingual interview** |
| 17 | conductExitInterview — validates required arguments | input validation |
| 18 | status progression — must follow strict order | **progression enforcement** |
| 19 | status progression — pause / resume preserves prior state | pause/resume |
| 20 | finalPayroll — computes vacation, salary, severance placeholder | **final payroll math** |
| 21 | finalPayroll — pilot flag surfaces for pilot role | pilot flag |
| 22 | computeSeverance + generateForm161 — emit events without importing Y-015 | bridge |
| 23 | generateApprovalLetter — bilingual + cites חוק הודעה לעובד | letters |
| 24 | generateRecommendationLetter — discretionary, three tones supported | letters |
| 25 | history — append-only and frozen against mutation | append-only |
| 26 | store has no delete method — לא מוחקים רק משדרגים ומגדלים | **never-delete** |
| 27 | isBusinessDay — Sun-Thu true, Fri-Sat false | helpers |
| 28 | addBusinessDays — skips Friday and Saturday | helpers |
| 29 | every reason, asset type, system, label has bilingual pair | **bilingual contract** |

```
ℹ tests 29
ℹ pass 29
ℹ fail 0
ℹ duration_ms ~120
```

Run with:

```sh
cd onyx-procurement
node --test test/hr/offboarding.test.js
```

---

## 11. Integration Bridge / גשרי אינטגרציה (emit-only)

The module **never imports** Y-015. Two events bridge the gap:

| Event name | Payload | Consumer |
|---|---|---|
| `severance:compute` | `{ employeeId, reason, employee, requestedAt }` | Y-015 severance-tracker |
| `form161:request`   | `{ offboardingId, employeeId, reason, lastDay, requestedAt }` | Y-015 → Tax Authority filing pipeline |
| `access:revoke`     | `{ offboardingId, employeeId, systemId, requestedAt }` | IT-ops bus |
| `offboarding:initiated`, `:shimua_generated`, `:notice_served`, `:assets_recorded`, `:exit_interview`, `:final_payroll`, `:completed` | engine-internal | UI / audit trail subscribers |

A custom `emit` function may be injected via the constructor; the default sink stores events in `engine.events` for inspection.

---

## 12. Files Touched / קבצים שנוצרו

| File | Purpose |
|---|---|
| `onyx-procurement/src/hr/offboarding.js` | Engine source — `Offboarding` class + helpers |
| `onyx-procurement/test/hr/offboarding.test.js` | 29 tests, zero deps |
| `_qa-reports/AG-Y064-offboarding.md` | This QA report |

No existing files were modified. The engine is purely additive — מוסיפים, לא מוחקים.

---

## 13. Compliance Sign-Off / אישור עמידה בדרישות

- [x] לא מוחקים רק משדרגים ומגדלים — append-only event log; no `delete`/`remove`/`purge` methods on the engine surface.
- [x] Zero external deps — only `node:test` + `node:assert/strict` for tests; runtime is dependency-free.
- [x] Hebrew RTL + bilingual labels — every reason, asset type, system, status, event, exit-interview question, and letter section ships with `{ he, en }`.
- [x] Israeli labor-law compliance — statutes 1, 2, 3, 6, 7, 8 above are all referenced in code; tests assert citations.
- [x] At least 18 tests — delivered 29.
- [x] Notice-period tests for all 3 tenure bands — present (under_six, six_to_twelve, year_plus).
- [x] Shimua hearing ≥ 3 business days — two tests including weekend straddle.
- [x] Asset collection state machine — tested across all five statuses.
- [x] Exit-interview bilingual — covered by template smoke-test + interview test.
- [x] Status progression enforcement — strict order test + skip-blocking test.
- [x] Final payroll calculations — vacation pidyon, severance placeholder, pilot flag.
- [x] Y-015 integration is emit-only — verified by `severance:compute` + `form161:request` event tests.

**End of report — סוף הדו"ח**
