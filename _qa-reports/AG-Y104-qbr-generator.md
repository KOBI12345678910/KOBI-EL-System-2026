# AG-Y104 — QBR Generator (Quarterly Business Review)

**Agent:** Y-104
**Swarm:** Customer Success
**ERP:** Techno-Kol Uzi mega-ERP
**Module:** `onyx-procurement/src/customer/qbr-generator.js`
**Tests:**  `onyx-procurement/test/customer/qbr-generator.test.js`
**Date / תאריך:** 2026-04-11
**Rule / חוק הברזל:** *לא מוחקים רק משדרגים ומגדלים* — existing QBRs are
superseded or archived, never deleted. The module was **upgraded**, not
rewritten, to honour this rule.

---

## 1. Summary / תקציר

A zero-dependency bilingual (Hebrew RTL primary / English LTR secondary)
Quarterly Business Review generator. Aggregates customer-success data
(usage, support, invoices, surveys, health-score, NPS, goals) and
produces a 10-section Palantir-dark-themed slide deck, self-contained
HTML, structured PDF payload, rule-based recommendations, and
quarter-over-quarter comparison.

- **Zero external deps** — only `node:crypto` and in-memory Map.
- **Append-only store** — `createMemoryStore()` has no `delete` /
  `remove` / `clear` / `drop` methods (structurally enforced, asserted
  by `createMemoryStore has no delete/remove/clear methods` test).
- **Bilingual everywhere** — every label, slide, title, recommendation
  and glossary entry ships `{ he, en }`.
- **Palantir dark theme** tokens: `#0b0d10` bg, `#13171c` panel,
  `#4a9eff` accent.

מחולל סקירה עסקית רבעונית דו-לשוני, ללא תלויות חיצוניות, מאגר הכל בזיכרון
ללא יכולת מחיקה, תומך בעברית RTL כברירת מחדל עם אנגלית LTR לצידה.

---

## 2. Public API / API ציבורי

| Method | Purpose (EN) | תכלית (HE) |
|---|---|---|
| `generateQBR({customerId, period, goals, usage, support, invoices, surveys, healthScore, nps})` | Structured bilingual QBR content | תוכן QBR דו-לשוני מובנה |
| `buildSlide(sectionKey, data)` | Build one of the 10 standard slides | בנה שקופית אחת מתוך 10 |
| `renderHTML(qbr, {theme:'palantir-dark'})` | Self-contained HTML deck | מצגת HTML עצמאית |
| `renderPDF(qbr)` | Structured payload for PDF renderer | תשתית נתונים ל-PDF |
| `valueDelivered(customerId, period)` | ROI calc: savings + revenue + efficiency | חישוב ערך שנמסר |
| `goalProgress(customerId, goals)` | % achieved per goal | אחוז השגה ליעד |
| `supportSummary(customerId, period)` | Tickets / resolution / CSAT | סיכום תמיכה |
| `recommendations(qbr)` | Rule-based recommendations | המלצות מבוססות חוקים |
| `archiveQBR(qbrId)` | Archive (preserve) a record | סמן כארכיון, אל תמחק |
| `history(customerId)` | All past QBRs, append-only | היסטוריית QBR מלאה |
| `compareQuarters(customerId, q1, q2)` | Quarter-over-quarter deltas | השוואה בין רבעונים |

Legacy methods — preserved and still operational (we upgrade, we don't
delete): `pullData`, `executiveSponsor`, `generatePDF`, `generateSlides`,
`prepMaterials`, `trackCommitments`, `followUpActions`, `scheduleNextQBR`.

---

## 3. The 10 Standard Slide Sections / עשר השקופיות

| # | `sectionKey` | English title | כותרת עברית |
|---|---|---|---|
| 1 | `executive-summary` | Executive Summary | תקציר מנהלים |
| 2 | `goal-progress` | Goal Progress | התקדמות יעדים |
| 3 | `usage-metrics` | Usage Metrics | מדדי שימוש |
| 4 | `value-delivered` | Value Delivered | ערך שנמסר |
| 5 | `roi-analysis` | ROI Analysis | ניתוח ROI |
| 6 | `support-summary` | Support Summary | סיכום תמיכה |
| 7 | `nps-csat` | NPS & CSAT | NPS ושביעות רצון |
| 8 | `roadmap-preview` | Roadmap Preview | תצוגה מקדימה — מפת דרכים |
| 9 | `asks-from-customer` | Asks from Customer | בקשות מהלקוח |
| 10 | `next-steps` | Next Steps | צעדים הבאים |

Each slide ships a `{ he, en }` title and a `{ he: [lines], en: [lines] }`
body with side-by-side RTL/LTR layout. Theme tokens are embedded on each
slide so downstream renderers cannot drift from the Palantir-dark palette.

---

## 4. ROI Formula / נוסחת ROI

```
valueDelivered.total  =  savings + revenue + efficiency
ROI %                 =  ((valueDelivered.total − investment) / investment) * 100
investment            =  billing.arr  ||  billing.contractValue
```

- **savings** — cost avoided by the customer (manual labor, rework,
  penalties, duplicates).
- **revenue** — net-new revenue attributable to modules we delivered
  (expansion orders, upsell, retained customers at risk of churn).
- **efficiency** — quantified throughput uplift (cycle-time → money).
- **currency** — from `valueDelivered.currency` → falls back to
  `billing.currency` → defaults to `ILS`.
- **Fallback** — if only a flat `amount` is supplied, we bucket it as
  `savings` (most conservative interpretation).

חישוב: סך הערך = חיסכונות + הכנסה נוספת + יעילות. ROI = (ערך כולל −
השקעה) / השקעה * 100. המטבע נגזר ממבנה הערך, מהחיוב, או ברירת מחדל ILS.

---

## 5. Recommendation Rules / חוקי המלצות

| Rule | Trigger (EN) | Priority | המלצה (HE) |
|---|---|---|---|
| `advocacy`     | NPS ≥ 50 → request referral / case study | `high` | בקשת המלצה / עדות לקוח |
| `training`     | `usage.activeUsers` < 10 → training / onboarding refresh | `medium` | הצעת הדרכה והטמעה |
| `health-check` | `support.opened` ≥ 20 → schedule health check | `high` | בדיקת בריאות חשבון |
| `renewal`      | `billing.renewalDate` within 90 days → renewal conversation | `critical` | שיחת חידוש חוזה |

Rules are deterministic (pure functions of QBR data), bilingual, and
stateless. Multiple rules can fire simultaneously — the result is a flat
array so downstream UI can chip / badge each.

---

## 6. Palantir-Dark Theme Tokens / צבעי ה-Theme

```css
--qbr-bg      : #0b0d10   /* page background                */
--qbr-panel   : #13171c   /* card / slide panel             */
--qbr-accent  : #4a9eff   /* signature blue                 */
--qbr-text    : #e6edf6   /* body copy                      */
--qbr-muted   : #9aa8bf   /* secondary/English copy         */
```

The `renderHTML` method inlines all CSS — the generated deck has **zero
external references** (no webfonts, no CDN scripts). RTL is asserted at
the `<html dir="rtl" lang="he">` level; each slide body carries both
`dir="rtl" lang="he"` (Hebrew column) and `dir="ltr" lang="en"`
(English column) so screen readers announce both passes correctly.

---

## 7. Append-Only Guarantees / ערבויות אי-מחיקה

1. **`createMemoryStore`** exposes `save*`, `append*`, `set*`, and
   `cache*` — no mutator name matches `/delete|remove|erase|clear|drop/i`
   (asserted by an existing test in the suite).
2. **`generateQBR`** never overwrites: regenerating a QBR for the same
   customer+quarter marks the previous record as `SUPERSEDED` and
   appends a new entry with `supersedes: prevId`.
3. **`archiveQBR`** only flips the `status` to `ARCHIVED`, sets
   `archived: true`, and **appends** to the history. The sections,
   sponsor, theme and supersedes-chain are preserved byte-for-byte.
4. **`history(customerId)`** returns every record — including
   superseded, archived and delivered — sorted by `createdAt`.
5. **Commitments / Follow-ups** (legacy API) are append-only too —
   `updateCommitmentStatus` pushes a new history entry, never mutates
   earlier ones.

לא מוחקים רק משדרגים ומגדלים — כל רשומה נשמרת לעולם.

---

## 8. Test Coverage / כיסוי בדיקות

**Runner:** `node --test test/customer/qbr-generator.test.js`
**Total tests:** **63** (40 existing + 23 new for AG-Y104) — **100% pass**.

### AG-Y104 new tests (23)

1. `generateQBR(new-spec) — accepts period + usage/support/invoices/surveys`
2. `generateQBR end-to-end (new-spec) — bilingual labels across every section`
3. `SLIDE_SECTION_ORDER has exactly 10 canonical sections`
4. `buildSlide — produces a slide payload for every standard section`
5. `buildSlide — rejects unknown section key`
6. `valueDelivered — sums savings + revenue + efficiency`
7. `valueDelivered — flat amount falls back to savings bucket`
8. `goalProgress — % achieved per goal + overall average`
9. `goalProgress — empty list is tolerated (0% overall)`
10. `supportSummary — tickets/resolution/CSAT block`
11. `recommendations — high NPS triggers advocacy ask`
12. `recommendations — low usage triggers training offer`
13. `recommendations — high ticket volume triggers health check`
14. `recommendations — renewal soon triggers renewal conversation`
15. `recommendations — no trigger means empty list`
16. `renderHTML — self-contained deck with Palantir dark theme + RTL Hebrew primary`
17. `renderHTML — contains dir="rtl" and dir="ltr" side-by-side columns`
18. `renderPDF — structured payload with cover + 10 content pages`
19. `archiveQBR — preserves record, only flips status & appends history`
20. `history — returns all past QBRs ordered by createdAt (append-only)`
21. `history — missing customerId throws`
22. `compareQuarters — delta on usage, support, health`
23. `compareQuarters — missing args throw`

**Requirement check:** task required ≥18 tests — **delivered 23**.

### Pre-existing tests (40) — preserved & still passing

- `normalizeQuarter` × 4 — quarter token formats and validation
- `computeHealthScore` / `bandOf` × 3 — health-score math
- `pullData` × 3 — data aggregation + memoisation + stub fallback
- `executiveSponsor` × 2 — verified vs placeholder branches
- Section assembly × 11 — every legacy section populates correctly
- `generatePDF` / `generateSlides` / `prepMaterials` × 4 — legacy render paths
- Commitments / follow-ups / schedule × 7 — append-only + history audit
- `createMemoryStore` never-delete × 1
- Regeneration superseding × 1
- Bilingual label & theme coverage × 2
- Error-handling × 2

### Run output
```
node --test test/customer/qbr-generator.test.js
ℹ tests 63
ℹ pass  63
ℹ fail  0
```

---

## 9. Hebrew Glossary / מילון מונחים

| English | עברית | Notes |
|---|---|---|
| QBR / Quarterly Business Review | סקירה עסקית רבעונית | ראשי תיבות: ס.ע.ר. |
| Customer Success Manager (CSM) | מנהל הצלחת לקוח | תפקיד המפעיל את ה-QBR |
| Executive Sponsor | נאמן בכיר | בעל העניין מצד הלקוח |
| Executive Summary | תקציר מנהלים | שקופית #1 |
| Goal Progress | התקדמות יעדים | שקופית #2 |
| Usage Metrics | מדדי שימוש | שקופית #3 |
| Value Delivered | ערך שנמסר | שקופית #4 |
| ROI Analysis | ניתוח החזר השקעה | שקופית #5 |
| Support Summary | סיכום תמיכה | שקופית #6 |
| NPS & CSAT | NPS ושביעות רצון | שקופית #7 |
| Roadmap Preview | תצוגה מקדימה של מפת הדרכים | שקופית #8 |
| Asks from Customer | בקשות מהלקוח | שקופית #9 |
| Next Steps | צעדים הבאים | שקופית #10 |
| Savings | חיסכונות | רכיב בערך שנמסר |
| Revenue Uplift | הכנסה נוספת | רכיב בערך שנמסר |
| Efficiency | יעילות | רכיב בערך שנמסר |
| Health Score | ציון בריאות חשבון | 0..100 |
| Healthy / Neutral / At Risk / Critical | בריא / ניטרלי / בסיכון / קריטי | רצועות ציון בריאות |
| Achieved / In Progress / At Risk / Blocked / Deferred | הושג / בתהליך / בסיכון / חסום / נדחה | סטטוס יעד |
| Tickets Opened / Closed | פניות נפתחו / נסגרו | מדד תמיכה |
| First Response Time | זמן תגובה ראשון | מדד SLA |
| Average Resolution Time | זמן טיפול ממוצע | מדד SLA |
| Escalations | הסלמות | פניות שקפצו דרגה |
| NPS (Net Promoter Score) | מדד נאמנות לקוחות (NPS) | 0..100 |
| CSAT (Customer Satisfaction) | שביעות רצון לקוח | 1..5 |
| Renewal | חידוש חוזה | תאריך יעד בחיוב |
| Advocacy Ask | בקשת המלצה | חוק המלצות #1 |
| Training Offer | הצעת הדרכה | חוק המלצות #2 |
| Health Check | בדיקת בריאות | חוק המלצות #3 |
| Renewal Conversation | שיחת חידוש | חוק המלצות #4 |
| Archive | ארכיון | סימון — לא מחיקה |
| Supersede | החלפה (לא מחיקה) | שומר היסטוריה |
| Append-only | רק הוספה, ללא מחיקה | חוק הברזל של ה-ERP |
| Palantir Dark | ערכת צבעים כהה בסגנון Palantir | `#0b0d10` / `#13171c` / `#4a9eff` |

---

## 10. Files Delivered / קבצים שסופקו

| Path | Lines | Type |
|---|---|---|
| `onyx-procurement/src/customer/qbr-generator.js` | ~2,000 | upgraded (prev 1,369 → now includes AG-Y104 extension) |
| `onyx-procurement/test/customer/qbr-generator.test.js` | ~960 | upgraded (prev 643 → +23 AG-Y104 tests) |
| `_qa-reports/AG-Y104-qbr-generator.md` | this file | new |

### Running the suite
```
cd onyx-procurement
node --test test/customer/qbr-generator.test.js
```

Expected: `tests 63 • pass 63 • fail 0`.

---

## 11. Compliance Checklist / רשימת ציות

- [x] Zero external deps (Node built-ins only: `node:crypto`,
      `node:test`, `node:assert`)
- [x] Hebrew RTL primary with bilingual labels on every section
- [x] 10 standard slide sections present and tested
- [x] Palantir dark palette (`#0b0d10` / `#13171c` / `#4a9eff`)
- [x] `generateQBR` accepts the new signature
      (`customerId, period, goals, usage, support, invoices, surveys,
      healthScore, nps`)
- [x] `buildSlide` covers all 10 canonical keys
- [x] `renderHTML` produces a self-contained deck (no external refs)
- [x] `renderPDF` returns a structured multi-page payload
- [x] `valueDelivered` implements `savings + revenue + efficiency`
- [x] `goalProgress` returns per-goal percentages
- [x] `supportSummary` returns tickets / resolution / CSAT
- [x] `recommendations` implements the four rules
- [x] `archiveQBR` preserves the record (append-only)
- [x] `history` returns append-only past QBRs
- [x] `compareQuarters` returns quarter-over-quarter deltas
- [x] ≥18 tests (delivered **23**, plus 40 legacy = **63** total)
- [x] All tests pass (`pass 63, fail 0`)
- [x] The legacy API remains intact (we upgrade, we don't delete)
- [x] Bilingual QA report with slide inventory, rules, ROI formula,
      Hebrew glossary

— *Agent Y-104, Swarm Customer Success, 2026-04-11*
