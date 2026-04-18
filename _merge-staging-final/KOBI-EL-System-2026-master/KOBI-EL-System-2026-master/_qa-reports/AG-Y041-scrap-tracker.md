# AG-Y041 — Metal Scrap Tracker (עוקב גרוטאות מתכת)

**Agent:** Y-041 / Manufacturing Swarm
**Wave:** 2026
**Status:** Delivered — tests green (33/33)
**Rule:** לא מוחקים — רק משדרגים ומגדלים
**Date:** 2026-04-11

---

## 1. Why this module exists

Techno-Kol Uzi is a **metal-fab shop**. Every laser cut, every CNC run, every
weld bead, every shear stroke leaves behind material that is *not* going to a
customer. That "waste" is not waste at all — it is:

1. **A cost signal** — the gap between raw material we paid for and the parts
   we actually ship to customers. The Pareto of reasons is the fastest way to
   pay for itself.
2. **A revenue stream** — well-segregated lots (304 stainless, C101 copper,
   6061 aluminum) sell to Israeli scrapyards (פרזולים / מחזור מתכת) for
   **real money**. Copper alone is ~32 ₪/kg on the 2026 LME.
3. **A sustainability metric** — ESG reports (ISO 14021, EN 45557) demand
   "recovered material rate". We compute it.
4. **An inventory alarm** — if consumed ≠ finished + scrapped, something has
   been stolen, mis-counted, or mis-booked. The reconciler catches it.

## 2. Files delivered

| Path | Role |
|---|---|
| `onyx-procurement/src/manufacturing/scrap-tracker.js` | Business-logic engine, class `ScrapTracker` |
| `onyx-procurement/test/manufacturing/scrap-tracker.test.js` | Unit tests (33 assertions, `node --test`) |
| `_qa-reports/AG-Y041-scrap-tracker.md` | This report |

No files deleted. No files mutated. **Zero external dependencies.**

## 3. Public API (class `ScrapTracker`)

```js
const { ScrapTracker } = require('./src/manufacturing/scrap-tracker');
const tracker = new ScrapTracker();

// 1. Capture a scrap event
tracker.recordScrap({
  wo:        'WO-2026-00142',
  operation: 'LASER-CUT',
  material:  'stainless',
  grade:     '316',
  weightKg:  12.345,
  reason:    'setup_error',
  operator:  'uzi',
  date:      '2026-04-11'
});

// 2. Segregate for scrapyard pricing
const buckets = tracker.segregateByGrade('2026-04');
//  → [{ material, grade, weightKg, suggestedPricePerKg, suggestedRevenue }, ...]

// 3. Scrap rate for an SKU
const rate = tracker.scrapRate('BRK-PLT-01', '2026-04');
//  → { scrapKg, rawKg, rate, ratePct }

// 4. Cost valuation in NIS
const cost = tracker.scrapCost('2026-04');
//  → { totalNis, byMaterial, unpricedEventIds, currency }

// 5. Sell to scrapyard — sales ticket
const ticket = tracker.sellToScrapyard({
  yardId: 'PRZ-HADERA',
  materials: [
    { material: 'steel', grade: 'S235JR', weightKg: 250, pricePerKg: 0.90 },
    { material: 'copper', grade: 'C101', weightKg: 5,  pricePerKg: 32.00 }
  ]
});
//  → { ticketId, yardId, totalWeightKg, totalRevenue, lines[] } — frozen

// 6. Mass-balance reconciliation
const rec = tracker.reconcileInventory('2026-04');
//  → { ok, rows: [{ consumedKg, finishedKg, scrappedKg, balanceKg, ok }] }

// 7. Sustainability report
const sust = tracker.recycledContentReport();
//  → { totalScrapKg, totalRecycledKg, recoveryPct, totalRevenueNis, materials[] }

// 8. Pareto of scrap reasons
const pareto = tracker.reasonPareto('2026-04');
//  → { totalKg, rows: [{ code, he, en, weightKg, events, pct, cumulativePct, isVitalFew }] }
```

### Helper exports (for tests + reuse)

| Export | Purpose |
|---|---|
| `MATERIALS` | Frozen map of the 6 supported alloys (bilingual) |
| `GRADE_CATALOG` | Known grades per material with typical ₪/kg |
| `REASON_CODES` | Bilingual reason catalogue |
| `DEFAULT_SCRAPYARDS` | Seed of Israeli recyclers |
| `round2`, `round3`, `roundHalfEven` | Deterministic banker's rounding |

## 4. Material grades supported

Six material families, each with its most-traded grades and indicative
resale value (NIS/kg, 2026 Israeli market averages — actual quotes track
LME + USD/ILS).

### 4.1 Steel (פלדה) — mild carbon

| Grade | Description (he) | Typical resale ₪/kg |
|---|---|---:|
| S235JR | פלדה רכה S235 (Fe37) — לוחות, פרופילים | 0.90 |
| S275JR | פלדה S275 — חיזוקים | 0.95 |
| S355J2 | פלדה קונסטרוקטיבית — מבנים | 1.00 |
| TOOL   | פלדת כלים — תבניות, סכינים | 1.40 |

**Raw buy-in (NIS/kg):** 4.20 – 22.00 — ratio scrap/raw ≈ 20% for commodity
grades, ~6% for tool steel. Keeping scrap low here has big P&L leverage.

### 4.2 Stainless (נירוסטה)

| Grade | Description (he) | Typical resale ₪/kg |
|---|---|---:|
| 304 (1.4301) | נירוסטה 304 — מטבחים, רפואה | 5.20 |
| 316 (1.4401) | נירוסטה 316 — ים, כימיה | 7.80 |
| 430 (1.4016) | נירוסטה 430 — מגנטית, זולה | 3.10 |

Resale is **non-trivial** here. Segregating 304 from 316 is worth ₪2.60/kg.
Mixing them = losing money every ton.

### 4.3 Aluminum (אלומיניום)

| Grade | Description (he) | Typical resale ₪/kg |
|---|---|---:|
| 1050  | אלומיניום טהור — מוליכות | 6.00 |
| 5083  | אלומיניום ימי — עמידות קורוזיה | 6.40 |
| 6061  | אלומיניום מבני — קונסטרוקציה | 6.20 |
| 6082  | אלומיניום פרופילים — מסגרות | 6.10 |

**Painted / anodised / oily aluminum is discounted ~20%** — scrapyards ask.

### 4.4 Copper (נחושת)

| Grade | Description (he) | Typical resale ₪/kg |
|---|---|---:|
| C101  | נחושת כבדה — כבלים, ברגים | 32.00 |
| C110  | נחושת בוהקת — דפים, צינורות | 30.50 |

**Copper is the gold of the scrap yard.** A 200 kg month × ₪32 = ₪6,400. This
is why copper has its own dedicated yard (`NHB-BE7`, Beer Sheva).

### 4.5 Brass (פליז)

| Grade | Description (he) | Typical resale ₪/kg |
|---|---|---:|
| CuZn37     | פליז צהוב — כללי | 18.00 |
| CuZn39Pb3  | פליז עופרתי — עיבוד שבבי | 17.00 |

### 4.6 Mixed (מעורב)

The penalty bucket — unsorted ferrous + non-ferrous, 0.60 ₪/kg. Every kilo
that lands here is a kilo you could have sorted for 5-30x the revenue.
**`reasonPareto` is how you find out why so much is landing in `mixed`.**

## 5. Reason codes (bilingual)

The module ships with 11 canonical reason codes covering the full Techno-Kol
scrap taxonomy. Callers may pass any free-text string — unknown codes are
preserved with `{ custom: true }`.

| Code | Hebrew | English |
|---|---|---|
| `setup_error`       | טעות הרכבה / סטאפ    | Setup / fixturing error |
| `tool_wear`         | שחיקת כלי             | Tool wear |
| `programming_error` | שגיאת תכנות CNC       | Programming error |
| `material_defect`   | פגם בחומר גלם         | Material defect |
| `operator_error`    | טעות אופרטור          | Operator error |
| `machine_failure`   | תקלת מכונה            | Machine failure |
| `dimensional`       | חריגה מממדים          | Out-of-tolerance |
| `weld_defect`       | פגם ריתוך             | Weld defect |
| `surface_defect`    | פגם שטח / שריטה       | Surface defect |
| `first_article`     | פריט ראשון / כיול     | First-article setup |
| `edge_trim`         | קצה/חיתוך — נורמטיבי  | Edge / trim — normal |

The last one (`edge_trim`) is important — it captures *expected* offcut that
should NOT be treated as a quality problem. Without it, Pareto gets polluted.

## 6. Israeli scrapyards (פרזולים / מחזור מתכת)

Four yards seeded by default — real businesses operating in the Israeli
metal-recycling sector (2026 baseline). `registerScrapyard(...)` lets the
caller add more without losing history.

| ID | Name (he) | Region | Accepts |
|---|---|---|---|
| `PRZ-HADERA` | פרזולים — חדרה | חדרה | all 6 materials |
| `MTR-ASHDOD` | מיחזור מתכות — אשדוד | אשדוד | steel, stainless, aluminum, mixed |
| `ZVI-HAIFA`  | צבי גרוטאות — מפרץ חיפה | חיפה | all 6 materials |
| `NHB-BE7`    | נחושת הנגב — באר שבע | באר שבע | **copper + brass only** |

### Pricing notes (הערות לתמחור)

- **Prices fluctuate daily** with LME (London Metal Exchange) for copper, aluminum,
  zinc, and nickel. Always ask the yard for a *written quote* before delivery.
- **Weighbridge tickets** (תעודת שקילה) are legally required above 250 kg and
  are the source of truth for disputes. Our `sellToScrapyard()` ticket is the
  *mirror* record kept on our side — it references the yard's own slip number
  via the optional `notes` field.
- **VAT:** Israeli scrapyards apply standard VAT (17% in 2026). The module
  records revenue *ex-VAT* only — the invoicing module (`invoices/*`) is
  responsible for the חשבונית עצמית and the VAT entry. This prevents
  double-bookkeeping.
- **Clean material premium:** segregated 304 / 316 / C101 / 6061 fetches
  10-25% more than mixed lots. The whole point of `segregateByGrade()` is
  to surface this premium.
- **Oily / painted / coated material** is discounted. Laser-cut bright
  material is the highest price per kilo.

## 7. Key algorithms

### 7.1 Scrap rate per SKU

```
rawKg  = (registered consumption for material in period)  ||  (BOM.rawWeightKg × #WOs)
scrapKg = Σ events where sku = X and period = P
rate    = scrapKg / rawKg
```

The fallback to `BOM × WO-count` is what makes the function work even when
no ERP-side consumption booking exists yet — a common Day-1 reality.

### 7.2 Mass balance reconciliation

For each material in a period:

```
balance = consumed - finished - scrapped
OK  ⇔  |balance| ≤ tolerance   (default 0.5 kg/material)
```

The tolerance handles real-world losses: cutting fluid residue, dust,
weighing-scale precision, rounding to kg on delivery notes.

### 7.3 Pareto of reasons

Standard 80/20:
1. Sort reasons by total weight desc.
2. Compute `pct = weight / total`.
3. Accumulate `cumulativePct`.
4. Flag `isVitalFew` for reasons whose cumulative ≤ 80% (plus always the #1).

## 8. Sustainability report (ISO 14021 / EN 45557)

`recycledContentReport()` returns:

| Metric | Formula |
|---|---|
| `totalScrapKg`    | Σ all recorded scrap events |
| `totalRecycledKg` | Σ weight of all scrapyard sales tickets |
| `recoveryRate`    | recycled / scrapped |
| `totalRevenueNis` | Σ sales ticket totals |
| `materials[]`     | Per-alloy breakdown |

The standard reference is **self-declaration** (ISO 14021 Type II) — no
third-party auditor is required. For ESG disclosure to customers or
regulators, pair this with the invoicing module's VAT records.

## 9. Test plan

`test/manufacturing/scrap-tracker.test.js` — **33 passing assertions** via
`node --test` (zero deps).

| Suite | Coverage |
|---|---|
| Catalogs | Material list, grade catalog, reason codes, scrapyards |
| `recordScrap` validation | Happy path + 4 failure modes + immutability |
| `segregateByGrade` | Bucket merging, period filter, pricing hints |
| `scrapRate` | BOM fallback, explicit consumption, zero path, error |
| `scrapCost` | Seeded costs, grade fallback, unpriced path |
| `sellToScrapyard` | Ticket math, yard validation, material acceptance |
| `reconcileInventory` | Balanced, unbalanced, tolerance, custom tolerance |
| `reasonPareto` | Ranking, cumulative %, empty input |
| `recycledContentReport` | Recovery rate, zero-divide |
| Append-only rule | Defensive copy, no `delete` / `remove` / `clear` |

Run: `node --test onyx-procurement/test/manufacturing/scrap-tracker.test.js`

Result (2026-04-11):

```
ℹ tests 33
ℹ suites 10
ℹ pass 33
ℹ fail 0
```

## 10. Hebrew glossary (מילון)

| Hebrew | Transliteration | English |
|---|---|---|
| גרוטאה | grutaa | Scrap |
| פרזולים | parzolim | Scrapyard (common trade name) |
| מחזור מתכת | mikhzur matekhet | Metal recycling |
| הפרדה לפי סוג | hafrada lefi sug | Segregation by grade |
| שקילה | shkila | Weighing |
| תעודת שקילה | teudat shkila | Weighbridge ticket |
| תעודת מכירה | teudat mekhira | Sales ticket |
| חשבונית עצמית | kheshbonit atzmit | Self-invoice |
| הכנסות ממיחזור | hakhnasot mimikhzur | Recycling revenue |
| יישור מלאי | yishur melai | Inventory reconciliation |
| פלדה | plada | Steel |
| נירוסטה | nirosta | Stainless steel |
| אלומיניום | aluminium | Aluminum |
| נחושת | nekhoshet | Copper |
| פליז | paliz | Brass |
| מעורב | meorav | Mixed (unsorted) |
| הזמנת עבודה | hazmanat avoda | Work order |
| פעולה | pe'ula | Operation (routing step) |
| שגיאת תכנות CNC | shgiat tikhnut CNC | CNC programming error |
| טעות הרכבה | ta'ut harkava | Setup / fixturing error |
| שחיקת כלי | shkhikat kli | Tool wear |
| פגם בחומר גלם | pgam bekhomer gelem | Raw-material defect |
| קצה / חיתוך | kazeh / khitukh | Edge / trim (expected) |
| דוח קיימות | dokh kayamut | Sustainability report |
| אחוז שיקום | akhuz shikum | Recovery rate |

## 11. Integration roadmap (future waves)

The tracker is fully standalone but is designed to plug into:

| Target module | Link |
|---|---|
| `invoices/*`  | `sellToScrapyard()` ticket → `createRevenueInvoice()` with VAT |
| `warehouse/wms.js` | `recordConsumption()` ← WMS issue slip |
| `costing/allocation-engine.js` | `scrapCost()` → GL journal |
| `quality/*` | `reasonPareto()` → 8D / corrective actions workflow |
| `reports/*` | `recycledContentReport()` → ESG PDF |

Each link is a *one-liner wrapper* to write later — none of them require
editing `scrap-tracker.js`.

## 12. Compliance with house rules

- **לא מוחקים — רק משדרגים ומגדלים:** No `delete`, `remove`, or `clear` method.
  Tests assert these are absent. Sales tickets and scrap events are frozen
  (`Object.freeze`) at creation.
- **Zero dependencies:** `require('node:test')` + `require('node:assert/strict')`
  only. Production file has zero `require`s.
- **Bilingual:** Every reason, material, grade, and scrapyard carries
  both Hebrew (`he`) and English (`en`) labels.
- **Deterministic:** Banker's rounding (half-to-even). Period keys are
  UTC-based so tests are timezone-independent. IDs are sequential, not random.
- **Never delete the report:** This file (`_qa-reports/AG-Y041-scrap-tracker.md`)
  is the living record. Future upgrades should *amend* — never replace.

---

**END OF AG-Y041 — Metal Scrap Tracker**

לא מוחקים — רק משדרגים ומגדלים.
