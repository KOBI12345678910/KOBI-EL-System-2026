# AG-Y031 — Bill of Materials (BOM) Manager / מנהל עץ מוצר

**Domain:** Techno-Kol Uzi — Israeli metal-fabrication shop floor / טכנו-קול עוזי — מתכת
**Module:** `onyx-procurement/src/manufacturing/bom-manager.js`
**Tests:**  `onyx-procurement/test/manufacturing/bom-manager.test.js`
**Rule:**   לא מוחקים — רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Date:**   2026-04-11
**Status:** PASS — 69 / 69 tests green (39 legacy + 30 new Y-031 spec)

> **English** — Multi-level BOM manager for Israeli metal-fab. Supports
> phantom assemblies, alternates, effectivity dates, scrap factors,
> nested sub-assemblies, where-used reverse lookup, dual-approval ECO
> workflow (engineering + quality + purchasing), revision diff for ECO
> review, costed BOM with priceMap, and availability shortages report.
>
> **עברית** — מנהל עץ מוצר רב-מפלסי למפעלי מתכת ישראליים. תומך בתת-מכלולים
> פנטום, חלופות, תאריכי תוקף, אחוזי פחת, קינון רב-שכבתי, חיפוש הפוך
> (איפה משמש), זרימת ECO באישור כפול (הנדסה + איכות + רכש), השוואת
> רוויזיות לבדיקת ECO, גלגול עלות עם מפת מחירים, ודוח חוסרים.

---

## 1. Purpose / מטרה

**EN:** A zero-dependency, in-memory, append-only Bill-of-Materials store
that powers manufacturing planning for the Techno-Kol Uzi mega-ERP. It is
the single source of truth for "what does this product consume", "where is
this raw material used", "how much does this assembly cost", and "what
changed between two engineering revisions".

**HE:** מאגר עץ-מוצר ללא תלויות חיצוניות, בזיכרון, רק-הוספה (append-only)
המהווה את ליבת תכנון הייצור במערכת ה-ERP טכנו-קול עוזי. הוא המקור היחיד
לאמת לשאלות: "ממה המוצר הזה מורכב?", "איפה משתמשים בחומר הגלם הזה?",
"כמה עולה המכלול הזה?", ו-"מה השתנה בין שתי רוויזיות הנדסיות?".

---

## 2. Data Model / מודל נתונים

### 2.1 BOM record / רשומת עץ מוצר

```
BOM
├── id                  string  (auto-generated)
├── sku / partNumber    string  (parent item)
├── name_he, name_en    bilingual display
├── revision (rev)      string  ('A', 'B', 'A1', '1', '1.1', ...)
├── components[]        list of component rows (see 2.2)
├── routingId           link to routing master (labor + overhead)
├── effectiveDate       ISO date — envelope start
├── endDate             ISO date — envelope end
├── status              draft | active | obsolete | archived
├── notes               free-text engineering notes
├── createdAt, updatedAt
├── supersededBy        bomId of replacement (set on obsolete)
├── supersedes          bomId of previous revision
├── phantom             boolean — transparent pass-through if true
└── history[]           append-only audit (create / activate / obsolete / cert-attach)
```

### 2.2 Component row / שורת רכיב (Y-031 spec)

| field             | EN                                    | HE                              |
|-------------------|----------------------------------------|---------------------------------|
| `sku` / `childPart` | Component item                       | רכיב                            |
| `qty`             | Quantity per parent                   | כמות לפריט אב                   |
| `uom`             | Unit of measure                       | יחידת מידה                      |
| `scrap`           | Yield loss [0,1] or [0,100]%          | אחוז פחת [0,1] או [0,100]       |
| `level`           | Indent (UI hint)                      | רמת קינון                       |
| `operation`       | Operation that consumes this row      | פעולה שצורכת את הרכיב           |
| `alternateGroup`  | Substitution group tag                | תג קבוצת חלופות                 |
| `alternatives[]`  | Approved substitute SKUs              | חלופות מאושרות                  |
| `effectivityFrom` | Row valid from date (ISO)             | תוקף מתאריך                     |
| `effectivityTo`   | Row valid to date (ISO)               | תוקף עד תאריך                   |
| `isOptional`      | Optional / consumable                 | אופציונלי                       |
| `certRequired`    | Material certificate required         | נדרשת תעודת חומר                |
| `materialCert`    | Lot / heat / mill cert traceability   | עקיבות מנה                      |
| `subRev`          | Pin a specific child rev              | קיבוע רוויזיית בן               |
| `notes`           | Free text                             | הערות                           |

### 2.3 ECO record / רשומת בקשת שינוי הנדסי

```
ECO
├── id                 string (ECO-... auto)
├── bomId              BOM being changed
├── partNumber         derived from BOM
├── changes[]          free-shape descriptors (e.g. {op:'sub', from:'OLD', to:'NEW'})
├── requester          email / login
├── reason             plain-text justification
├── effectiveDate      ISO date
├── status             pending | approved | rejected | effective | cancelled
├── approvals[]        append-only [{role, approver, decision, comment, at}]
├── requiredRoles      ['engineering', 'quality', 'purchasing']
├── createdAt, updatedAt
└── history[]          append-only (create / approval-* / status-change)
```

### 2.4 Phantom registry / רישום פנטום

```
phantom
├── partNumber
├── name_he, name_en
├── flag = '__phantom__'
└── addedAt
```

A phantom part is **transparent during explode** — its children are
issued directly to the higher-level work order; the phantom itself is
neither stocked, purchased, nor costed. Phantoms are append-only.

מק"ט פנטום הוא **שקוף בעת פיצוץ ה-BOM** — הילדים שלו מוצאים ישירות
להזמנת העבודה ברמה גבוהה יותר; הפנטום עצמו אינו מאוחסן, נרכש, או
מתומחר. רישומי הפנטום הם append-only.

---

## 3. API Surface / מנעד פונקציות ציבורי

### 3.1 Y-031 spec methods (new)

| Method                                                  | Purpose / מטרה                                                   |
|---------------------------------------------------------|-------------------------------------------------------------------|
| `defineBOM({partNumber, rev, items, status, phantom})`  | Define a BOM in Y-031 shape — multi-level, with effectivity      |
| `explode(partNumber, rev, qty, opts)`                   | Recursive flat list with scrap factor, optional `asOfDate` filter |
| `implode(childPart, opts)`                              | Reverse lookup — direct + transitive parents                      |
| `availabilityCheck(part, rev, qty, inventoryMap)`       | Compare exploded demand vs on-hand → shortages list               |
| `costedBOM(part, rev, priceMap)`                        | Per-line ext cost using priceMap, fallback to standardCost        |
| `costRollup(part, qty)`                                 | Material + labor + overhead total                                 |
| `compareBOMs(part, revA, revB)`                         | Diff for ECO review (added/removed/changed/unchanged)             |
| `validateBOM(bom)`                                      | No circular ref, no missing children, scrap% in [0,100]           |
| `ecoRequest({bomId, changes, requester, reason})`       | Append-only ECO log                                               |
| `approveEco(ecoId, approvers[])`                        | Dual approval — engineering + quality + purchasing                |
| `markEcoEffective(ecoId)`                               | Flip APPROVED → EFFECTIVE                                         |
| `cancelEco(ecoId, reason)`                              | Cancel a PENDING ECO (record preserved forever)                   |
| `alternateGroup(part, rev, group)`                      | List substitutable members of a group                             |
| `phantomBOM(partNumber, meta)`                          | Mark a part as transparent pass-through                           |
| `findBOM(partNumber, rev)`                              | Direct lookup by (part, rev)                                      |
| `isPhantom(partNumber)` / `listPhantoms()`              | Phantom registry queries                                          |
| `getEco(id)` / `listEcos({status, bomId})`              | ECO queries                                                       |

### 3.2 Legacy methods (preserved — never deleted)

| Method                                                  | Purpose                                                |
|---------------------------------------------------------|--------------------------------------------------------|
| `createBOM(spec)`                                       | Original create — internally used by `defineBOM`       |
| `explodeBOM(sku, qty, levels)`                          | Original explode — sku resolves to active rev          |
| `whereUsed(sku, opts)`                                  | Original where-used (now also exposed via `implode`)   |
| `getActiveBOMForSku(sku, asOfDate)`                     | Active rev resolver                                    |
| `obsoleteRevision(bomId, newRevId)`                     | Mark obsolete + supersede                              |
| `substituteComponent(bomId, oldSku, newSku, ...)`       | Single-component swap — creates new revision           |
| `attachMaterialCert(bomId, sku, cert)`                  | Lot / heat / mill cert traceability hook               |
| `upsertItem(sku, data)` / `getItem(sku)`                | Item-master CRUD                                       |
| `upsertRouting(id, data)` / `getRouting(id)`            | Routing-master CRUD                                    |
| `listBOMs({sku, status})`                               | Filtered list                                          |
| `getAuditTrail()` / `size()`                            | Introspection                                          |

---

## 4. ECO Workflow / זרימת ECO

```
                              ┌──────────────┐
                              │  ecoRequest  │
                              └──────┬───────┘
                                     │
                              status: PENDING (ממתין)
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
            ▼                        ▼                        ▼
   approveEco[engineering]  approveEco[quality]  approveEco[purchasing]
            │                        │                        │
            └────────────┬───────────┴────────────┬───────────┘
                         │                        │
                  any decision: 'reject'?         │
                         │                        │
               yes ──────┘                        │
                │                                 │
                ▼                            all 3 roles
        status: REJECTED                  approve at least once
           (נדחה)                                 │
                                                  ▼
                                       status: APPROVED (מאושר)
                                                  │
                                                  ▼
                                         markEcoEffective()
                                                  │
                                                  ▼
                                       status: EFFECTIVE (בתוקף)

  cancelEco() (PENDING only) → status: CANCELLED (בוטל) — record preserved
```

**Required roles** (REQUIRED_ECO_ROLES, immutable):
- `engineering` / הנדסה
- `quality`     / איכות
- `purchasing`  / רכש

**Append-only invariant:** every approval, rejection, and status-change is
pushed onto `eco.approvals[]` and `eco.history[]`. No row is ever deleted.
Re-calling `approveEco` simply adds more rows. Cancellation does NOT
remove the ECO — it stays in the store with `status='cancelled'`.

**אינווריאנט append-only:** כל אישור, דחייה ושינוי סטטוס נדחפים אל
`eco.approvals[]` ו-`eco.history[]`. אף שורה אינה נמחקת לעולם.
קריאה חוזרת ל-`approveEco` רק מוסיפה שורות. ביטול לא מסיר את ה-ECO —
הוא נשאר במאגר עם `status='cancelled'`.

---

## 5. Validation Rules / כללי אימות

### 5.1 Hard errors (block create) / שגיאות חמורות

1. **Missing partNumber/sku** — שדה sku חובה
2. **components is not an array** — components חייב להיות מערך
3. **Missing childPart on row** — חסר sku ברכיב
4. **Self-reference** (parent listed as its own child) — הפניה לעצמו
5. **Negative qty** — כמות שלילית
6. **Non-finite qty** (string, NaN, Infinity) — כמות לא מספרית
7. **scrap% out of [0,100]** — אחוז פחת מחוץ לטווח חוקי
8. **scrap fraction out of [0,1] post-normalize** — אחוז פחת לאחר נירמול
9. **Circular reference** (A → B → A or transitive) — מעגליות
10. **Duplicate (partNumber, rev) on defineBOM** — רוויזיה כפולה
11. **ECO refers to unknown bomId** — ECO שמפנה ל-BOM לא קיים
12. **Approval with unknown role** — אישור עם תפקיד לא חוקי

### 5.2 Warnings (allow but flag) / אזהרות

1. **Empty components array** — מערך רכיבים ריק
2. **qty=0 on a non-optional row** — כמות 0 ברכיב לא אופציונלי
3. **Unknown UOM** — יחידת מידה לא מוכרת
4. **Unknown operation tag** — תג פעולה לא מוכר
5. **Duplicate component sku** — sku חוזר באותו עץ
6. **Alternate is not a string** — חלופה אינה מחרוזת

### 5.3 Cycle detection / זיהוי מעגליות

DFS על גרף הרכיבים (current store + candidate). הנפת חריגה במקרה של מציאת
back-edge. מבוצע גם ב-`createBOM` (לפני שמירה) וגם ב-`explode`/`explodeBOM`
(לתפיסת נתונים מקוריים).

---

## 6. Hebrew ↔ English Glossary / מילון

| English                | עברית                  | Notes                                  |
|------------------------|------------------------|----------------------------------------|
| Bill of Materials      | עץ מוצר                | "BOM" = ב.ו.מ in Israeli shop slang    |
| Revision               | רוויזיה / גרסה          | usually a letter: A, B, C…              |
| Effectivity date       | תאריך תוקף              | from / to dates per row                 |
| Scrap factor           | אחוז פחת                | % loss per operation                    |
| Yield                  | יבולת / תפוקה           | 1 - scrap                               |
| Explode (BOM)          | פיצוץ עץ מוצר           | top-down, recursive                     |
| Implode / Where-used   | היכן משמש              | bottom-up, reverse lookup               |
| Sub-assembly           | תת-מכלול                | nested BOM                              |
| Phantom assembly       | מכלול פנטום             | transparent pass-through                |
| Alternate (substitute) | חלופה                   | approved substitute                     |
| Alternate group        | קבוצת חלופות            | tag binding multiple substitutes        |
| Engineering Change     | שינוי הנדסי (ECO)       | dual-approval workflow                  |
| Cost rollup            | גלגול עלות              | material + labor + overhead             |
| Costed BOM             | עץ מוצר מתומחר          | per-line ext cost                       |
| Material certificate   | תעודת חומר              | mill / heat / lot traceability          |
| Lot traceability       | עקיבות מנה              | for QA recall                           |
| Routing                | מסלול ייצור             | ordered ops with WC + rates             |
| Work center            | מרכז עבודה              | physical machine / station              |
| Operation              | פעולה                   | cut / weld / bend / paint / QC          |
| Cutting                | חיתוך                   | laser, plasma, saw, shear               |
| Welding                | ריתוך                   | MIG, TIG, spot, robotic                 |
| Bending                | כיפוף                   | press-brake, roll                       |
| Drilling               | קידוח                   | drill press, CNC mill                   |
| Grinding               | השחזה / ליטוש           | surface grinder, deburring              |
| Punching               | ניקוב                   | turret punch, ironworker                |
| Painting               | צביעה                   | wet, powder, e-coat                     |
| Galvanizing            | גילוון                  | hot-dip                                 |
| Assembly               | הרכבה                   | bench / fixture                         |
| QC / Inspection        | בקרת איכות / בדיקה      | dimensional, visual                     |
| Heat number            | מספר התכה               | from steel mill cert                    |
| Mill certificate       | תעודת מפעל מתכת         | EN 10204 3.1                            |
| Engineering            | הנדסה                   | ECO approver role                       |
| Quality                | איכות                   | ECO approver role                       |
| Purchasing             | רכש                     | ECO approver role                       |
| Effective              | בתוקף                   | ECO terminal status                     |
| Pending                | ממתין                   | ECO awaiting approvals                  |
| Approved               | מאושר                   | ECO ready for application               |
| Rejected               | נדחה                    | ECO blocked by an approver              |
| Cancelled              | בוטל                    | ECO withdrawn                           |
| Append-only            | רק-הוספה                | golden rule                             |
| Never delete           | לא מוחקים               | golden rule                             |
| Audit trail            | תיעוד פעולות            | immutable log                           |

---

## 7. Worked Example / דוגמה מעובדת

**Gate sub-assembly (GATE-Y031, rev A):**

```
GATE-Y031 (שער פלדה)
├── FRAME-Y031        × 1   piece   level 1
│   ├── TUBE-SQ-40    × 4   meter   level 2  scrap 5%   group:TUBES
│   └── BOLT-M8       × 8   piece   level 2  scrap 0%
├── STEEL-SHEET-2MM   × 18  kg      level 1  scrap 5%   group:SHEETS
├── HINGE-HD          × 2   piece   level 1  scrap 0%
├── BOLT-M8           × 12  piece   level 1  scrap 0%
└── PAINT-BLACK       × 0.6 liter   level 1  scrap 5%
```

**`mgr.explode('GATE-Y031', 'A', 1)` →**

| Leaf SKU         | Effective qty | UoM   | Calc                  |
|------------------|--------------:|-------|----------------------|
| TUBE-SQ-40       |          4.20 | meter | 4 × 1.05 = 4.2       |
| BOLT-M8          |         20.00 | piece | (8 + 12)             |
| STEEL-SHEET-2MM  |         18.90 | kg    | 18 × 1.05            |
| HINGE-HD         |          2.00 | piece | 2 × 1.0              |
| PAINT-BLACK      |          0.63 | liter | 0.6 × 1.05           |

**`mgr.costedBOM('GATE-Y031', 'A', priceMap)` totals:**

| Leaf            | Eff qty | × | Unit ₪ | = | Ext ₪    |
|-----------------|--------:|---|-------:|---|---------:|
| TUBE-SQ-40      |    4.20 | × |     65 | = |    273.00|
| STEEL-SHEET-2MM |   18.90 | × |     48 | = |    907.20|
| HINGE-HD        |    2.00 | × |     35 | = |     70.00|
| BOLT-M8         |   20.00 | × |    0.5 | = |     10.00|
| PAINT-BLACK     |    0.63 | × |     85 | = |     53.55|
| **Total**       |         |   |        |   | **1313.75** |

**`mgr.availabilityCheck('GATE-Y031', 'A', 1, {STEEL-SHEET-2MM: 5})` →**
returns 4 shortages (everything except 5 kg of sheet on hand) with the
exact `short` deltas.

---

## 8. ECO Worked Example / דוגמת ECO

```js
// 1. file the request
const eco = mgr.ecoRequest({
  bomId: gate.id,
  changes: [{ op: 'sub', from: 'STEEL-SHEET-2MM', to: 'STEEL-SHEET-3MM' }],
  requester: 'eli@technokol.co.il',
  reason: 'Customer required heavier gauge for marine env',
  effectiveDate: '2026-05-01',
});
// → status PENDING

// 2. each gate keeper signs in turn
mgr.approveEco(eco.id, [{ role: 'engineering', approver: 'avi@eng.tk' }]);
// → still PENDING (1 / 3)
mgr.approveEco(eco.id, [{ role: 'quality', approver: 'rina@qa.tk' }]);
// → still PENDING (2 / 3)
mgr.approveEco(eco.id, [{ role: 'purchasing', approver: 'kobi@buy.tk' }]);
// → APPROVED (3 / 3) — auto-flip

// 3. apply (creates a new revision via defineBOM or substituteComponent)
mgr.markEcoEffective(eco.id);
// → EFFECTIVE
```

If the QA gate-keeper rejects:

```js
mgr.approveEco(eco.id, [{ role: 'quality', approver: 'rina@qa.tk',
                          decision: 'reject', comment: 'Color spec mismatch' }]);
// → REJECTED — terminal, but record preserved
```

The cancelled / rejected ECO **is never removed** from `mgr.listEcos()`,
matching the golden rule.

---

## 9. Test Coverage / כיסוי בדיקות

`node --test test/manufacturing/bom-manager.test.js`

```
ℹ tests 69
ℹ suites 23
ℹ pass 69
ℹ fail 0
```

### 9.1 Legacy suites (preserved — 39 tests)

| Suite                                          | Tests |
|------------------------------------------------|------:|
| createBOM — creation & basic validation        |     8 |
| validateBOM — circular reference detection     |     3 |
| explodeBOM — flat BOM scrap-inclusion          |     3 |
| explodeBOM — nested sub-assemblies             |     2 |
| costRollup — material + labor + overhead       |     3 |
| whereUsed — reverse lookup                     |     3 |
| compareBOMs — revision diff                    |     2 |
| obsoleteRevision — preserve history            |     2 |
| substituteComponent — engineering change       |     3 |
| metal-fab specifics                            |     5 |
| edge cases                                     |     5 |

### 9.2 Y-031 spec suites (new — 30 tests, ≥22 required)

| Suite                                                  | Tests |
|--------------------------------------------------------|------:|
| Y-031 defineBOM — spec shape                           |     5 |
| Y-031 explode — rev-pinned multi-level                 |     3 |
| Y-031 implode — reverse lookup                         |     2 |
| Y-031 compareBOMs — diff                               |     1 |
| Y-031 cost rollup & costedBOM                          |     3 |
| Y-031 availabilityCheck — shortages list               |     2 |
| Y-031 ECO workflow — request + dual approval           |     6 |
| Y-031 circular-reference detection                     |     1 |
| Y-031 phantomBOM — transparent pass-through            |     2 |
| Y-031 effectivity-date filtering                       |     1 |
| Y-031 alternateGroup — substitutable components        |     2 |
| Y-031 validateBOM — Y-031 spec ranges                  |     2 |

### 9.3 Required-coverage matrix (per agent prompt)

| Required test                          | Y-031 suite covering it                         |
|----------------------------------------|-------------------------------------------------|
| `defineBOM`                            | Y-031 defineBOM × 5                             |
| `explode` multi-level                  | Y-031 explode-rev-pinned × 3                    |
| `scrap factor`                         | Y-031 explode + defineBOM normalize             |
| `implode` / where-used                 | Y-031 implode × 2                               |
| `cost rollup`                          | Y-031 cost rollup & costedBOM × 3               |
| `ECO approval flow (dual)`             | Y-031 ECO workflow × 6                          |
| `circular reference detection`         | Y-031 circular-ref + legacy validateBOM         |
| `phantom BOM`                          | Y-031 phantomBOM × 2                            |
| `effectivity date filtering`           | Y-031 effectivity-date filtering × 1            |
| `alternate group lookup`               | Y-031 alternateGroup × 2                        |
| `compareBOMs diff`                     | Y-031 compareBOMs × 1                           |

---

## 10. Compliance with Golden Rule / ציות לכלל הזהב

> **לא מוחקים — רק משדרגים ומגדלים**

| Operation              | Mechanism                                              |
|------------------------|--------------------------------------------------------|
| Obsoleting a revision  | `status='obsolete'` + `supersededBy` pointer (no del)  |
| Substituting a comp    | New revision created, old marked obsolete (kept)       |
| Cancelling an ECO      | `status='cancelled'`, record stays in `_ecos` map      |
| Rejecting an ECO       | `status='rejected'`, all approvals preserved           |
| Re-defining BOM        | THROWS — must bump rev to upgrade                      |
| Phantom registration   | Idempotent — second call refreshes meta, never deletes |
| Re-approving an ECO    | Pushes more approval rows; no overwrite                |
| `validateBOM` on save  | Pre-flight before indexing — store stays clean on fail |
| Audit trail            | `_audit[]` is push-only; never spliced                 |

---

## 11. Operational Notes / הערות תפעוליות

- **Storage:** `Map<string, BOM>` in process memory. For persistence, the
  caller serializes `mgr.listBOMs()` + `mgr.listEcos()` + `mgr.listPhantoms()`
  + `mgr.getAuditTrail()` to JSON / SQL.
- **Performance:** explode is O(n × m) where n = avg children per BOM and
  m = depth (capped at MAX_EXPLODE_DEPTH = 64).
- **Concurrency:** single-threaded — caller serializes mutations.
- **Determinism:** all numeric outputs use `round4` for qty / `round2` for ₪.
- **Bilingual UI:** every label is in `LABELS.he` and `LABELS.en`. Component
  rows accept `name_he` / `name_en` so reports render in Hebrew RTL.

---

## 12. File Map / מפת קבצים

```
onyx-procurement/
├── src/manufacturing/
│   └── bom-manager.js                          (1,640+ lines, upgraded in-place)
└── test/manufacturing/
    └── bom-manager.test.js                     (1,400+ lines, 69 tests)

_qa-reports/
└── AG-Y031-bom-manager.md                      (this file)
```

---

**Agent:** Y-031 (Swarm Manufacturing)
**Timestamp:** 2026-04-11
**Verdict:** GREEN — full Y-031 spec implementation, golden rule honoured, 69/69 tests passing.
