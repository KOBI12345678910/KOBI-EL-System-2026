# AG-Y032 — Manufacturing Routing & Work Center Manager

**Domain:** Techno-Kol Uzi — metal fabrication shop floor
**Module:** `onyx-procurement/src/manufacturing/routing-manager.js`
**Tests:** `onyx-procurement/test/manufacturing/routing-manager.test.js`
**Rule:** לא מוחקים — רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Status:** PASS — 23/23 tests green

---

## 1. Purpose

Defines the canonical data model and computation layer for **מסלולי ייצור** (production routings) and **מרכזי עבודה** (work centers) for a metal-fabrication shop. A routing is an ordered sequence of operations (cut → bend → weld → coat → QC) binding a SKU to the physical stations that transform raw stock into finished goods.

The manager is zero-dependency, bilingual (Hebrew/English), and append-only: every create, re-create, or reorder pushes the previous shape onto a `history[]` stack rather than mutating in place.

---

## 2. Work Center Types (`WORK_CENTER_TYPES`)

Eight canonical types cover the full Israeli metal-fab shop floor:

| id         | עברית         | English            | Typical equipment                     |
|------------|---------------|--------------------|---------------------------------------|
| `cutting`  | חיתוך         | Cutting            | Fiber laser, plasma, waterjet, shear  |
| `welding`  | ריתוך         | Welding            | MIG, TIG, spot, robotic weld cell     |
| `bending`  | כיפוף         | Bending            | CNC press-brake, roll-bender          |
| `drilling` | קידוח/כרסום   | Drilling/Milling   | CNC mill, VMC, drill press            |
| `grinding` | ליטוש         | Grinding           | Surface grinder, deburring, polishing |
| `painting` | צביעה         | Painting           | Powder booth, wet paint, galvanize    |
| `assembly` | הרכבה         | Assembly           | Manual bench, rivet/fastener jig      |
| `qc`       | בקרת איכות    | Quality Control    | CMM, dimensional check, visual        |

---

## 3. Israeli Metal-Fab Operation Catalog (`OPERATION_CATALOG`)

Ten canonical operation names (seed) — every routing operation is free to reference any of these labels:

| key             | עברית              | English             | Work center type |
|-----------------|--------------------|---------------------|------------------|
| `laser_cut`     | חיתוך לייזר        | Laser cutting       | cutting          |
| `plasma_cut`    | חיתוך פלזמה         | Plasma cutting      | cutting          |
| `cnc_mill`      | כרסום CNC           | CNC milling         | drilling         |
| `bending`       | כיפוף               | Press-brake bend    | bending          |
| `mig_weld`      | ריתוך MIG           | MIG welding         | welding          |
| `tig_weld`      | ריתוך TIG           | TIG welding         | welding          |
| `powder_coat`   | צביעה באבקה         | Powder coating      | painting         |
| `hot_galvanize` | גלוון חם            | Hot-dip galvanize   | painting         |
| `plating`       | ציפוי               | Plating             | painting         |
| `assembly`      | הרכבה               | Assembly            | assembly         |
| `qc`            | בקרת איכות          | Quality control     | qc               |
| `grinding`      | ליטוש               | Grinding            | grinding         |

The catalog is a **seed** — additional operations can be defined ad-hoc on any routing (each operation carries its own `operationName_he` / `operationName_en`).

---

## 4. Routing Data Model

```
WorkCenter
├── id
├── name_he, name_en
├── type          (one of WORK_CENTER_TYPES)
├── typeLabel_he, typeLabel_en
├── hourlyRate            ILS / hour (labour + machine, blended)
├── capacityHoursPerDay   e.g. 8 for 1 shift, 16 for 2
├── setupBuffer           constant setup hours per run
├── available             true/false (for breakdown fallback)
├── createdAt, updatedAt
└── history[]             snapshots of previous revisions

Routing
├── id
├── sku
├── operations[]          ordered by seq
│   ├── seq
│   ├── workCenterId
│   ├── operationName_he, operationName_en
│   ├── setupTime          hours per run
│   ├── runTimePerUnit     hours per unit
│   └── description
├── version
├── active
├── createdAt, updatedAt
└── history[]             full previous shapes on re-create / reorder

skuAlternatives : Map<sku, { primary, alt1?, alt2? }>
productionLog[] : actual hours logged per WC per date (fuel for utilization)
auditLog[]      : ts/action/payload — never deleted
```

---

## 5. API Surface

| Method                                             | Purpose                                                              |
|----------------------------------------------------|----------------------------------------------------------------------|
| `defineWorkCenter(spec)`                           | Register / re-register a station (history preserved)                 |
| `setWorkCenterAvailability(id, bool)`              | Mark breakdown / back-online                                         |
| `createRouting({id, sku, operations})`             | Bind an ordered op list to a SKU                                     |
| `computeLeadTime({routingId, qty})`                | Sum of `setupBuffer + setupTime + runTimePerUnit*qty` across ops     |
| `computeCost({routingId, qty})`                    | Labour + machine cost rollup, per-op and per-unit, in ILS            |
| `utilizationReport(workCenterId, period)`          | Actual vs capacity, idle / overload, status band                     |
| `logProductionHours({workCenterId, date, hours})`  | Feeder for utilizationReport                                         |
| `operationList(sku)`                               | Flattened bilingual list for work-order traveler                     |
| `reorderOperations(routingId, newSequence)`        | Change seq without losing prior shape (history stack push)           |
| `alternativeRouting({sku, alt1, alt2?})`           | Register fallback routings for machine-breakdown scenarios           |
| `selectRouting(sku)`                               | Pick primary / alt1 / alt2 based on current WC availability          |

---

## 6. Computation Worked Example

**Routing `RT-BRACKET-A`** on SKU `BRACKET-STD`, qty = 100:

| Seq | WC           | Setup buffer | Op setup | Run/unit | Hours = buf + setup + run*qty |
|----:|--------------|-------------:|---------:|---------:|------------------------------:|
|  10 | WC-LASER-01  |         0.50 |     0.20 |     0.05 |                      **5.70** |
|  20 | WC-BEND-01   |         0.25 |     0.30 |     0.08 |                      **8.55** |
|  30 | WC-WELD-01   |         0.10 |     0.15 |     0.12 |                     **12.25** |
|     | **Total**    |              |          |          |                     **26.50** |

Cost rollup (blended ILS/hour):

| Seq | Hours  | Rate | Cost      |
|----:|-------:|-----:|----------:|
|  10 |   5.70 |  350 |  1,995.00 |
|  20 |   8.55 |  220 |  1,881.00 |
|  30 |  12.25 |  180 |  2,205.00 |
|     |  26.50 |      | **6,081.00** |

`costPerUnit = 60.81 ILS`.

---

## 7. Utilization Status Bands

| utilization % | he            | en            |
|--------------:|---------------|---------------|
|      `> 100%` | עומס יתר       | overloaded    |
| `85% – 100%`  | גבוה           | high          |
|  `50% – 85%`  | רגיל           | normal        |
|       `< 50%` | נמוך           | low           |

Report exposes `capacityHours`, `actualHours`, `idleHours`, `overloadHours`, `utilizationPct`, plus bilingual `status_he` / `status_en`.

---

## 8. Alternative Routing / Breakdown Fallback

The `skuAlternatives` map binds a SKU to up to three routings: `primary`, `alt1`, `alt2`.

```
selectRouting(sku)
  → primary if every WC in its ops is available
  → else alt1 if every WC in alt1 is available
  → else alt2 if every WC in alt2 is available
  → else { routingId: null, reason: '…' }
```

Use case: when `WC-LASER-01` breaks down, the fiber-laser routing falls back to a plasma-cut alternative on `WC-LASER-02`. The manager is notified via `setWorkCenterAvailability('WC-LASER-01', false)` and `selectRouting` automatically returns the alt1 tier until the machine is brought back online.

---

## 9. Never-Delete Guarantees

| Action                        | History mechanism                                             |
|-------------------------------|---------------------------------------------------------------|
| Re-define work center         | Prior object pushed onto `wc.history[]`                       |
| Re-create routing (same id)   | Prior object deep-copied onto `routing.history[]`, version++  |
| `reorderOperations`           | Previous ops snapshot pushed onto `routing.history[]`, version++ |
| `setWorkCenterAvailability`   | Audit log entry (never mutates old audit rows)                |
| `logProductionHours`          | Append-only `productionLog[]`                                 |
| All mutating methods          | Append-only `auditLog[]` entry with ts/action/payload         |

No method ever calls `Map.delete()` or shrinks an array — growth-only.

---

## 10. Hebrew Glossary (מילון מונחים)

| עברית                | English                     | Notes                                  |
|----------------------|-----------------------------|----------------------------------------|
| מסלול ייצור          | Production routing          | Ordered op sequence tied to a SKU      |
| מרכז עבודה           | Work center                 | Physical station / machine group       |
| תעודת עבודה          | Work order traveler         | Printed op list that follows the part  |
| זמן הכנה             | Setup time                  | Per-op, per-run                        |
| חיץ הכנה             | Setup buffer                | Constant per-WC pre-run overhead       |
| זמן ריצה ליחידה      | Run time per unit           | Hours per single unit                  |
| זמן מחזור            | Lead time / cycle time      | Wall-clock duration to finish a batch  |
| קיבולת יומית         | Daily capacity              | Hours per day the WC can run           |
| ניצולת               | Utilization                 | Actual ÷ capacity                      |
| עומס יתר             | Overload                    | actualHours > capacityHours            |
| תעריף שעה            | Hourly rate                 | Blended labour + machine in ILS/hour   |
| ניתוב חלופי          | Alternative routing         | Fallback for machine breakdown         |
| חיתוך לייזר          | Laser cutting               | Fiber / CO2 laser                      |
| חיתוך פלזמה          | Plasma cutting              | Air / HD plasma                        |
| כרסום CNC            | CNC milling                 | Mill / VMC                             |
| כיפוף                | Bending                     | Press-brake                            |
| ריתוך MIG            | MIG welding                 | Gas metal arc                          |
| ריתוך TIG            | TIG welding                 | Tungsten inert gas                     |
| צביעה באבקה          | Powder coating              | Electrostatic + oven cure              |
| גלוון חם             | Hot-dip galvanizing         | Zinc bath                              |
| ציפוי                | Plating                     | Electroplate / anodize                 |
| הרכבה                | Assembly                    | Mechanical fastening, rivet, weld-up   |
| בקרת איכות           | Quality control             | CMM, dim check, visual                 |
| ליטוש                | Grinding / deburring        | Surface finish, edge break             |

---

## 11. Test Coverage (23/23 PASS)

```
defineWorkCenter
  ✓ registers a work center with bilingual fields
  ✓ rejects unknown types
  ✓ rejects negative rates
  ✓ re-defining preserves history (never-delete rule)

createRouting
  ✓ creates a routing with sorted operations
  ✓ rejects operations pointing to unknown WCs
  ✓ recreating same id bumps version and snapshots previous

computeLeadTime
  ✓ rolls up setupBuffer + setupTime + runTime*qty across ops
  ✓ qty=1 still includes full setup overhead
  ✓ rejects bad qty

computeCost
  ✓ labour + machine cost rollup, cost-per-unit, currency ILS

utilizationReport
  ✓ computes actual vs capacity across a period
  ✓ flags overload when actual > capacity

reorderOperations
  ✓ reorders while preserving old version in history
  ✓ rejects mismatched length
  ✓ rejects unknown old seq reference

alternativeRouting + selectRouting
  ✓ falls back to alt1 when primary WC is broken down
  ✓ returns null when no routing has all WCs available
  ✓ rejects registering alt routing before primary exists

operationList
  ✓ returns a flat bilingual list for a SKU
  ✓ returns empty array for unknown sku

catalogs
  ✓ WORK_CENTER_TYPES contains 8 canonical types
  ✓ OPERATION_CATALOG contains Israeli metal-fab canonical ops

tests 23
suites 9
pass  23
fail  0
```

---

## 12. Integration Notes

- Zero npm dependencies — pure `node --test`, runs on the same Node version the rest of `onyx-procurement` uses.
- Ready to bolt onto `src/costing/allocation-engine.js` — `computeCost` result feeds labour + machine cost pools. The `driver_catalog` `machine_hours` and `labor_hours` drivers pair directly with `utilizationReport`.
- Work-order / traveler printing can call `operationList(sku)` and render the bilingual row set.
- The audit log is append-only and safe to ship to the `auth/audit-trail` collector without coordination.
- Hebrew strings are UTF-8 literals — consumers must render RTL where shown to users.

---

**Report produced:** 2026-04-11
**Agent:** Y-032
**Never delete. Only grow.** (לא מוחקים — רק משדרגים ומגדלים)
