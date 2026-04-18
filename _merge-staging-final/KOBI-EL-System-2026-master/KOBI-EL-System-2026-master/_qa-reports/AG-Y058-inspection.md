# AG-Y058 — Property Inspection Engine (`PropertyInspection`)

**Agent:** Y-058
**Swarm:** Mega-ERP Techno-Kol Uzi — Kobi EL (real-estate vertical)
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/realestate/inspection.js`
**Tests:** `onyx-procurement/test/realestate/inspection.test.js`
**Rule of the house:** **לא מוחקים — רק משדרגים ומגדלים.**
**Bilingual:** עברית RTL + English

---

## 1. Summary / סיכום

A zero-dependency, deterministic, bilingual (Hebrew RTL / English) property
inspection engine for the real-estate vertical of the Mega-ERP. Covers
residential and commercial properties in compliance with:

- **חוק המכר (דירות), תשל"ג-1973** — Sale of Apartments Law
- **חוק השכירות והשאילה, תשל"א-1971** — Rental & Loan Law
- **חוק הגנת הדייר [נוסח משולב], תשל"ב-1972** — Tenant Protection Law

מנוע בדיקות נכסים אפס תלויות, דו-לשוני, דטרמיניסטי, לציר הנדל"ן של ה-Mega-ERP.
מכסה דירות מגורים ונכסים מסחריים, בהתאמה מלאה לחוקי מקרקעין בישראל.

The engine:

* Schedules six inspection types (`scheduleInspection`) with auto-numbered
  reports and full audit trail.
* Defines re-usable, version-bumped, bilingual checklists
  (`defineChecklist`) — אסור למחוק, כל "עדכון" מעלה גרסה.
* Records findings (`recordInspection`) **append-only** — every recording
  pushes onto the existing array; no replacement, ever.
* Generates bilingual HTML (RTL) + plain-text reports (`generateReport`)
  with severity-color rows and photo references.
* Extracts **major + critical** defects (`createDefectList`) and attaches
  the matching בדק warranty period (1-year minimum, 7 years for גגות /
  ריצוף, 4 years for בטון, 3 years for בידוד תרמי, 2 years for אינסטלציה).
* Bridges to Y-049 maintenance (`trackRepairRequest`) by emitting a
  `repair:requested` event with all the context (no direct coupling).
* Diffs move-in vs move-out (`compareInspections`) and produces a
  deposit return (`computeDepositReturn`) with wear-and-tear excluded
  and the Israeli legal cap on deductions enforced.
* Returns the canonical Israeli warranty table (`warrantyPeriods`) and the
  full, never-purged inspection history per property (`history`).

Test suite: **21 passing, 0 failing** (`node --test`, zero external deps).

---

## 2. Run the tests / הרצת הבדיקות

```bash
# from repo root
cd onyx-procurement
node --test test/realestate/inspection.test.js
```

Expected output:

```
✔ CONSTANTS — six inspection types and seven categories defined
✔ defineChecklist — bilingual items, categories validated, version bumps
✔ scheduleInspection — pre-purchase
✔ scheduleInspection — move-in
✔ scheduleInspection — move-out
✔ scheduleInspection — annual-safety
✔ scheduleInspection — pre-renewal
✔ scheduleInspection — handover (חוק המכר)
✔ scheduleInspection — invalid type rejected
✔ recordInspection — appends findings, never replaces
✔ generateReport — bilingual HTML + text with severity summary
✔ createDefectList — extracts major+critical with 1y minimum warranty
✔ trackRepairRequest — emits repair:requested for Y-049 maintenance
✔ compareInspections — move-in vs move-out diff (חוק הגנת הדייר)
✔ computeDepositReturn — wear-and-tear excluded, legal cap applied
✔ computeDepositReturn — legal cap actually caps over-the-top deductions
✔ warrantyPeriods — Israeli law (חוק המכר דירות) full table
✔ defect severity ranking — critical first then major
✔ history — full inspection history for property, never purged
✔ bilingual report — Hebrew RTL + English labels both present
✔ no-delete invariant — defects history append-only after repair
ℹ tests 21  pass 21  fail 0
```

---

## 3. Inspection types / סוגי בדיקות

| Code              | Hebrew                       | English                          | When used / מתי                                                    |
| ----------------- | ---------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `pre-purchase`    | בדיקה לפני רכישה             | Pre-purchase inspection           | Before signing a purchase contract / לפני חתימת חוזה מכר            |
| `move-in`         | בדיקת כניסה לשכירות           | Move-in (rental) inspection       | Tenant taking possession / כניסת שוכר — בסיס לפיקדון               |
| `move-out`        | בדיקת יציאה משכירות           | Move-out (rental) inspection      | Tenant vacating / יציאת שוכר — חישוב החזר פיקדון                   |
| `annual-safety`   | בדיקת בטיחות שנתית            | Annual safety inspection          | Required by safety policy / שנתי לפי מדיניות בטיחות                |
| `pre-renewal`     | בדיקה לפני חידוש חוזה          | Pre-renewal inspection            | Before lease renewal / לפני חידוש שכירות                            |
| `handover`        | מסירת דירה (חוק המכר)         | Handover (Sale of Apartments Law) | Builder→buyer handover / מסירה מקבלן לרוכש — הפעלת תקופת בדק       |

---

## 4. Warranty periods table / טבלת תקופות בדק
### חוק המכר (דירות), תשל"ג-1973 — סעיף 4א + תוספת

| Years / שנים | Hebrew                            | English                  | Mapped category / קטגוריה ממופה          |
| ------------ | --------------------------------- | ------------------------ | ----------------------------------------- |
| **1**        | אחריות כללית — שנה                | General — 1 year         | חשמל, גימור, בטיחות, אזעקה/גז             |
| **2**        | מערכות אינסטלציה — שנתיים          | Plumbing — 2 years       | אינסטלציה                                  |
| **3**        | בידוד תרמי — 3 שנים                | Thermal insulation — 3y  | (general bucket override on demand)        |
| **4**        | בטון ויסודות — 4 שנים               | Concrete & foundations    | מבנה                                       |
| **7**        | אטימות גגות — 7 שנים                | Roof waterproofing — 7y  | רטיבות                                     |
| **7**        | ריצוף — 7 שנים                    | Flooring — 7 years        | (set explicitly on a finding/checklist)    |

> **בדק period** — every defect logged via `createDefectList()` carries
> the matching warranty key, the legal basis string, and an absolute
> `warrantyExpiresAt` ISO timestamp. The minimum is **1 year**, never
> less, regardless of category mapping.

---

## 5. Severity definitions / חומרות

| Code       | Rank | Hebrew    | English   | Meaning / משמעות                                                 |
| ---------- | ---- | --------- | --------- | ----------------------------------------------------------------- |
| `cosmetic` | 1    | קוסמטי    | Cosmetic  | Visual blemish, no functional impact / פגם נראות בלבד            |
| `minor`    | 2    | קל        | Minor     | Functional but not urgent / תקלה קלה לא דחופה                    |
| `major`    | 3    | חמור      | Major     | Significant defect, becomes a defect-list entry / נכלל ברשימת בדק |
| `critical` | 4    | קריטי     | Critical  | Life-safety / habitability impact / סיכון בטיחותי או היתכנות מגורים |

`createDefectList()` extracts severity ≥ 3 (`major` and `critical`) **only**
from `fail` findings. `cosmetic` and `minor` findings are reported but not
elevated to the בדק list.

---

## 6. Hebrew glossary / מילון עברי

| Hebrew                     | Transliteration       | English meaning                                  |
| -------------------------- | --------------------- | ------------------------------------------------ |
| בדיקה                      | bdika                 | Inspection                                       |
| בדק                        | bedek                 | Statutory warranty / defect liability period     |
| חוק המכר (דירות)           | chok ha-mecher dirot  | Sale of Apartments Law                           |
| חוק הגנת הדייר             | chok haganat ha-dayar | Tenant Protection Law                            |
| חוק השכירות והשאילה        | chok ha-schirut       | Rental and Loan Law                              |
| מסירת דירה                 | mesirat dira          | Handover of apartment (builder→buyer)            |
| ליקוי                      | likui                 | Defect                                           |
| בלאי סביר                  | b'lai savir           | Reasonable wear-and-tear                         |
| פיקדון                     | pikadon               | Security deposit                                 |
| משכיר                      | maskir                | Landlord                                         |
| שוכר                       | sokher                | Tenant                                           |
| חוזה שכירות                | chozeh schirut        | Lease agreement                                  |
| ועדת קבלה                  | va'adat kabala        | Acceptance committee (handover)                  |
| ממצא                       | mimtza                | Finding                                          |
| תקין                       | takin                 | OK / passing                                     |
| חמור                       | chamur                | Severe / major                                   |
| קריטי                      | kriti                 | Critical                                         |
| תיעוד מצב                  | tiud matzav           | Status note (existing-condition record)          |
| הסתמכות חוזית              | histamchut chozit     | Contractual reliance                             |
| נדל"ן                      | nadlan                | Real estate                                      |
| אינסטלציה                  | instalatzya           | Plumbing                                         |
| אזעקה / גז                 | az'aka / gaz          | Alarm / gas                                      |
| רטיבות                     | retivut               | Damp / moisture                                  |
| גימור                      | gimur                 | Finish (cosmetic)                                |
| תקופת בדק                  | tkufat bedek          | Defect liability period                          |

---

## 7. Public API / ממשק

```js
const { PropertyInspection } = require('./realestate/inspection');

const insp = new PropertyInspection({ /* clock?: () => ms */ });
insp.on('repair:requested', (e) => maintenance.createRequest(/* … */));

// 1. Define a re-usable bilingual checklist
const checklist = insp.defineChecklist({
  id: 'CK-HANDOVER-V1',
  type: 'handover',
  items: [
    { itemId: 'STR-001', category: 'מבנה', severity: 'critical',
      label_he: 'סדק קונסטרוקטיבי בקיר נושא',
      label_en: 'Structural crack in load-bearing wall' },
    /* … */
  ],
});

// 2. Schedule
const sched = insp.scheduleInspection({
  propertyId: 'P-100',
  type: 'handover',
  inspectorId: 'INSP-01',
  date: '2026-04-12T09:00:00Z',
  reason: 'מסירה לרוכש',
  checklistId: 'CK-HANDOVER-V1',
});

// 3. Record findings (append-only)
insp.recordInspection({
  inspectionId: sched.id,
  findings: [
    { itemId: 'STR-001', status: 'fail', severity: 'critical',
      notes: 'סדק 1.2 מטר', photos: ['/uploads/1.jpg'] },
  ],
});

// 4. Bilingual report
const report = insp.generateReport(sched.id);   // { html, text, summary }

// 5. בדק defect list with warranty
const list = insp.createDefectList(sched.id);

// 6. Bridge to Y-049 maintenance
insp.trackRepairRequest({
  defectId: list.defects[0].defectId,
  assignedTo: 'VND-BUILDER',
  dueDate: '2026-05-01T09:00:00Z',
});

// 7. Move-in vs move-out for deposit
const diff = insp.compareInspections(moveIn.id, moveOut.id);
const refund = insp.computeDepositReturn('T-9', 'L-77', {
  depositAmount: 15000, monthlyRent: 5000, leaseMonths: 12,
  cleaningCost: 500,
  repairCosts: [
    { findingId: 'F-WALL', amount: 800,  wearAndTear: false },
    { findingId: 'F-PAINT', amount: 2000, wearAndTear: true }, // EXCLUDED
  ],
});

// 8. Israeli warranty table
const w = insp.warrantyPeriods();

// 9. Property history (never purged)
const h = insp.history('P-100');
```

---

## 8. Compliance notes / הערות תאימות

* **חוק המכר (דירות), תשל"ג-1973 — סעיף 4א:** every major+critical defect
  discovered at handover is captured into the defect list with a warranty
  expiration calculated relative to the **inspection date**, not contract
  date — `createDefectList` uses the engine clock for reproducibility.
* **חוק הגנת הדייר:** `compareInspections()` and `computeDepositReturn()`
  treat anything that already existed at move-in as **non-deductible**;
  only added items and worsened-severity items count as new damage.
* **תיקון "שכירות הוגנת" (תשע"ז):** `computeDepositReturn` enforces a
  legal cap on the **total deduction**:
  `min(depositAmount, 3 × monthlyRent, ⅓ × leaseMonths × monthlyRent)`.
  Even if the proposed deduction is higher, only the cap may be withheld.
* **wear-and-tear (בלאי סביר) is excluded by design:** any repair line
  with `wearAndTear: true` is moved to `excludedRepairs[]` and reported
  separately so the audit trail shows what was *not* charged.
* **append-only audit:** `findings`, `defects[].history`, and
  `inspections[].history` only ever grow. The module exposes no
  delete-style API. Re-defining a checklist bumps `version` and the old
  versions remain inside any inspection that snapshotted them.

---

## 9. Bridge to Y-049 / גשר אל Y-049 maintenance

`trackRepairRequest()` emits an event that the maintenance module can
subscribe to **without** any direct dependency in either direction:

```js
const maintenance = new MaintenanceRequests({ vendorCatalog });
inspection.on('repair:requested', (e) => {
  maintenance.createRequest({
    propertyId: e.propertyId,
    unit: 'AUTO',                      // or whatever the caller maps in
    tenant: { name: 'בדק' },
    category:
      e.category === 'אינסטלציה' ? 'plumbing' :
      e.category === 'חשמל'      ? 'electrical' :
      e.category === 'מבנה'      ? 'structural' :
      e.category === 'רטיבות'    ? 'structural' : 'other',
    description_he: `${e.label_he} (defect ${e.defectId})`,
    description_en: e.label_en || undefined,
    priority:
      e.severity === 'critical' ? 'emergency' :
      e.severity === 'major'    ? 'urgent'    : 'normal',
  });
});
```

The event payload includes `repairId`, `defectId`, `propertyId`,
`category`, `severity`, `assignedTo`, `dueDate`, `label_he`, `label_en`,
`legalBasis` — everything needed for the maintenance side to file a work
order without re-querying.

---

## 10. Test coverage matrix / כיסוי בדיקות

| # | Test                                                              | Covers                                                       |
|---|-------------------------------------------------------------------|--------------------------------------------------------------|
| 1 | CONSTANTS — six inspection types & seven categories               | enums + severity ranks                                       |
| 2 | defineChecklist — bilingual + version bump                        | `defineChecklist`, label_he/en, version trail                |
| 3 | scheduleInspection — pre-purchase                                  | type 1/6                                                     |
| 4 | scheduleInspection — move-in                                       | type 2/6, leaseId attachment                                 |
| 5 | scheduleInspection — move-out                                      | type 3/6                                                     |
| 6 | scheduleInspection — annual-safety                                 | type 4/6                                                     |
| 7 | scheduleInspection — pre-renewal                                   | type 5/6                                                     |
| 8 | scheduleInspection — handover (חוק המכר)                            | type 6/6 + Hebrew label                                      |
| 9 | scheduleInspection — invalid type rejected                         | input validation                                             |
| 10| recordInspection — append-only                                     | findings never erased; history grows                         |
| 11| generateReport — bilingual HTML + text                             | `generateReport`, RTL, severity summary, photos              |
| 12| createDefectList — major+critical with 1y minimum warranty         | `createDefectList`, warranty mapping, 1y minimum             |
| 13| trackRepairRequest — emits repair:requested for Y-049              | `trackRepairRequest`, EventEmitter bridge                    |
| 14| compareInspections — move-in vs move-out (חוק הגנת הדייר)          | `compareInspections`, added/worsened/unchanged               |
| 15| computeDepositReturn — wear-and-tear excluded, legal cap applied   | `computeDepositReturn`, exclusion list, legal cap            |
| 16| computeDepositReturn — legal cap actually caps over-the-top        | cap enforcement edge case                                    |
| 17| warrantyPeriods — Israeli law full table                          | `warrantyPeriods`, sorted asc                                |
| 18| defect severity ranking — critical first then major               | severity sort order                                          |
| 19| history — full inspection history, never purged                   | `history`, no-delete invariant, sort newest-first            |
| 20| bilingual report — Hebrew RTL + English labels                    | duplicate-language coverage                                  |
| 21| no-delete invariant — defects history append-only after repair    | end-to-end audit trail                                       |

> Required: **18+** tests · Delivered: **21** tests · all green.

---

## 11. Files

| Path                                                                 | Role                  |
|----------------------------------------------------------------------|-----------------------|
| `onyx-procurement/src/realestate/inspection.js`                      | Engine                |
| `onyx-procurement/test/realestate/inspection.test.js`                | Unit tests            |
| `_qa-reports/AG-Y058-inspection.md`                                  | This QA report        |

**House rule re-affirmed:** לא מוחקים — רק משדרגים ומגדלים. Every state
transition (schedule → record → defect-list → repair) only ever appends
to the relevant `history[]`. There is no `delete*` method anywhere on
the public API.
