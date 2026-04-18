# AG-Y040 — Tool / Die / Fixture / Gauge Tracker

**Agent:** Y-040 — Swarm Manufacturing
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal fab) — Wave 2026
**Module:** `onyx-procurement/src/manufacturing/tool-tracker.js`
**Test:** `onyx-procurement/test/manufacturing/tool-tracker.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המעקב

Every metal fabrication shop lives or dies by the state of its **tool cage**
(ארון הכלים). A progressive die will punch ~100,000 brackets, then start
producing burrs. A welding jig drifts 0.3 mm after six months of abuse. A
digital caliper that hasn't been calibrated in a year is producing fiction,
not measurements — and every "OK" QC stamp built on that fiction is a lie.

When these silent failures aren't caught:

- **Scrap rate** explodes on expensive material (Techno-Kol runs 3-5 mm
  stainless and 10 mm mild steel — both priced per-kilo).
- **Customer rejections** on delivered batches. Every RMA wipes out ~3x
  the margin of the order.
- **ISO 9001 audit findings** on clause 7.1.5 (Monitoring & measuring
  resources) — always a major non-conformance.
- **Safety incidents** when a worn die fractures or an un-calibrated
  torque wrench over-tightens a structural bolt.

Module `tool-tracker.js` is the single source of truth for every
perishable or precision tool on the shop floor: die sets, welding jigs,
drill fixtures, dial indicators & calipers, cutting bits, injection
molds. Usage is logged per work-order; wear is computed as a percentage
of rated life; calibration / sharpening / inspection / overhaul events
are scheduled, closed, and surfaced when overdue.

---

## 2. Supported Tool Types — סוגי כלים

Six canonical types (`TOOL_TYPES` map). Every tool is one of these:

| Type (id)      | Hebrew            | English         | Examples                                                    |
|----------------|-------------------|-----------------|-------------------------------------------------------------|
| `die`          | תבנית             | Die             | Progressive punch die, blanking die, draw die, trim die     |
| `jig`          | ג׳יג              | Jig             | Welding jig, drilling jig, assembly jig                     |
| `fixture`      | תפיסה              | Fixture         | Clamping fixture, holding fixture, inspection fixture       |
| `gauge`        | גאוג׳              | Gauge           | Go/No-Go, dial indicator, caliper, micrometer, height gauge |
| `cutting-tool` | כלי חיתוך         | Cutting tool    | End mill, drill bit, tap, lathe insert, laser nozzle        |
| `mold`         | תבנית יציקה       | Mold            | Injection mold, die-cast mold, sand-cast pattern            |

Dies, molds and cutting tools are **cycle-counted** (rated lifetime in
stamps / cycles / hits). Gauges are **calibration-driven** (no cycle
count — `rated_cycles: 0` means "measure by calibration interval, not
by usage"). Jigs and fixtures can be either or neither.

---

## 3. Wear Logic — לוגיקת הבלאי

Each cycle-counted tool has a `rated_cycles` number set at
procurement time (usually taken from the die-maker's datasheet or
the supplier's quoted life). As usage is recorded via
`recordUsage(toolId, …)`, `totalCycles` accumulates.

`wearLevel(toolId)` returns a three-bucket traffic light based on
the ratio `totalCycles / rated_cycles`:

| Level    | % consumed  | Meaning (Hebrew)                  | Action                          |
|----------|-------------|-----------------------------------|---------------------------------|
| `GREEN`  | 0 – 69 %    | שימוש תקין                        | Carry on as normal.             |
| `YELLOW` | 70 – 89 %   | מתקרב לסוף החיים — להיערך להחלפה  | Plan replacement, order spares. |
| `RED`    | 90 % +      | סוף חיים — להוציא משימוש / לחדד   | Stop, sharpen, or swap.         |

Default thresholds (`DEFAULT_WEAR_THRESHOLDS`): yellow 0.70, red 0.90.
These are **injection-replaceable** via the `ToolTracker` constructor
— shops with tighter tolerances (aerospace, medical) use
`{ yellow: 0.50, red: 0.75 }` to retire tools earlier.

Uncounted tools (`rated_cycles: 0`) always return GREEN with a
`uncounted: true` flag, to signal that wear cannot be quantified
for this item — rely on the calibration schedule instead.

`cyclesRemaining(toolId)` = `rated_cycles - totalCycles` (floored at 0).
Uncounted tools return `Infinity`.

`alertNearEnd(threshold?)` returns the sorted list (most-worn first)
of every active cycle-counted tool at or above the threshold
(default = yellow, i.e. 0.70). Retired tools are excluded; uncounted
tools are excluded.

---

## 4. Calibration Standards — תקני כיול

Techno-Kol's tool program aligns with the following bodies:

| Standard          | Scope                                           | Used by                     |
|-------------------|-------------------------------------------------|-----------------------------|
| **ISO 9001:2015** | §7.1.5 Monitoring & measuring resources         | Every tool catalog entry    |
| **ISO 17025**     | Testing & calibration laboratory competence     | Third-party cal houses      |
| **SII** (מכון התקנים) | Israeli national standards body              | Traceable cal chain in IL   |
| **ת"י 18265** / ISO 6508 | Rockwell / Vickers hardness testers      | QC lab hardness testers     |
| **DIN 878** / JIS B 7503 | Dial indicators                           | QC lab indicators           |
| **ISO 3650**      | Gauge blocks — slip gauges (Johansson blocks)    | QC lab masters              |
| **ת"י 1500**      | Calibration laboratories in Israel               | In-house cal cell           |

Default calibration intervals (`DEFAULT_CALIBRATION_DAYS`) are applied
when caller doesn't specify `calibrationFreqDays`:

| Tool type      | Default interval | Rationale                                |
|----------------|------------------|------------------------------------------|
| `gauge`        | 180 d (6 months) | ISO 9001 best practice for shop gauges   |
| `die`          | 365 d (annual)   | Dimensional check + crack NDT            |
| `mold`         | 365 d (annual)   | Surface finish + dimensional verification|
| `jig`          | 730 d (2 years)  | Lower precision, slower drift            |
| `fixture`      | 730 d (2 years)  | Static holding, minimal drift            |
| `cutting-tool` | `null`           | Calibration N/A — sharpen when dull      |

Calibration is auto-rolling: when `completeMaintenance` closes a
`calibration` entry and the tool has a non-null `calibrationFreqDays`,
a fresh `calibration` entry is automatically scheduled for
`today + calibrationFreqDays`. You can never forget to re-schedule.

---

## 5. Maintenance Types — סוגי תחזוקה

Four distinct maintenance kinds tracked in `MAINTENANCE_TYPES`:

| Type           | Hebrew          | When it applies                                        |
|----------------|-----------------|--------------------------------------------------------|
| `calibration`  | כיול            | Gauges, instruments — measurement traceability         |
| `sharpening`   | השחזה           | Cutting tools, punches — restore edge geometry         |
| `inspection`   | בדיקה תקופתית   | Periodic visual / NDT / dimensional check              |
| `overhaul`     | שיפוץ יסודי     | Major rebuild — bearings, guide posts, heel blocks     |

A single tool can carry many open and closed maintenance entries at
once (a die might have quarterly `inspection` plus annual `calibration`
plus `sharpening` every 20k cycles). The module doesn't enforce any
particular mix — it's driven by what ops schedules.

`overdueTools(asOf?)` returns every live tool with at least one OPEN
maintenance entry whose `dueDate < asOf` (default `asOf` = today).
Results are sorted **most-late-first** so the foreman's dashboard
puts fires at the top.

---

## 6. Checkout / Return — השאלה והחזרה

The tool cage needs custody tracking. A die worth ₪45,000 walking
off-site without a paper trail is a real problem.

**`checkout({ toolId, borrower, expectedReturn, purpose? })`**

- Fails if the tool is already IN_USE (no double-booking).
- Fails if the tool is in MAINTENANCE.
- Flips status → `IN_USE`, sets `currentCheckout` to the new entry id.
- Appends a `CO-*` entry to `checkoutLog`.

**`returnTool({ toolId, returner, condition, notes? })`**

- `condition ∈ { EXCELLENT, GOOD, FAIR, POOR, DAMAGED }`.
- On `GOOD` / `EXCELLENT` / `FAIR` → status returns to `ACTIVE`.
- On **`POOR` or `DAMAGED`** → status becomes `QUARANTINE` **and** an
  `inspection` maintenance entry is auto-scheduled for the next day.
  This means a damaged return can never be silently pushed back into
  the cage — the foreman sees it in `overdueTools()` the moment the
  inspection is missed.

Every check-out and check-in is preserved in `checkoutLog` — including
who brought it back, when, and in what condition. Audit-ready.

---

## 7. Retire — Never Delete — לעולם לא מוחקים

When a tool reaches end of life, you call `retire(toolId, reason)`.
This is the **only** way to "remove" a tool from the active pool, and
it is purely a status change:

1. `status` becomes `RETIRED`.
2. `retireRecord` is set with `retiredAt`, `reason`, `finalTotalCycles`,
   and `finalUsageCount` — a frozen snapshot of lifetime usage.
3. **Everything else is preserved**: `usageLog`, `maintenanceLog`,
   `checkoutLog`, `catalogHistory`, `auditLog`. You can still
   `findById(toolId)` and pull back the full life story.
4. `listAll()` still returns retired tools by default. Pass
   `{ includeRetired: false }` if the dashboard should hide them.

Retired tools can NOT be mutated:

- `recordUsage` → throws `tool is RETIRED`.
- `checkout` → throws `tool is RETIRED`.
- `scheduleMaintenance` → throws `tool is RETIRED`.
- `retire` a second time → throws.

Retirement is also blocked if the tool is still checked out — return
it first, so the cage log stays clean.

This is the central implementation of the **לא מוחקים רק משדרגים
ומגדלים** rule. Five years later, you can still query every strike a
particular die ever made, who borrowed the weld jig the morning
everyone was sick on Purim, and which calibration house signed off
on the caliper.

---

## 8. Hebrew Glossary — מילון עברית-אנגלית

### Tool vocabulary

| Hebrew              | English                | Notes                                    |
|---------------------|------------------------|------------------------------------------|
| ארון הכלים          | Tool cage               | Physical locked storage                  |
| כלים מתכלים         | Consumable tools        | Wear with use (dies, bits)               |
| כלים מדודים         | Calibrated tools        | Must be periodically verified            |
| תבנית               | Die                     | Press die                                |
| תבנית פרוגרסיבית    | Progressive die         | Multi-stage strip die                    |
| תבנית ניקוב         | Piercing/punch die      |                                          |
| תבנית גזירה         | Blanking die            |                                          |
| תבנית כיפוף         | Bending die             |                                          |
| תבנית יציקה         | Casting/injection mold  |                                          |
| תבנית הזרקה         | Injection mold          |                                          |
| ג׳יג                | Jig                     | Guides the tool to the work              |
| ג׳יג ריתוך          | Welding jig             |                                          |
| ג׳יג קידוח          | Drilling jig            |                                          |
| תפיסה               | Fixture                 | Holds the work steady                    |
| מלחצה               | Clamp                   |                                          |
| גאוג׳               | Gauge                   |                                          |
| גאוג׳ "עובר/לא עובר" | Go/No-Go gauge          |                                          |
| מד-גובה             | Height gauge            |                                          |
| מד-זווית            | Protractor              |                                          |
| קליפר               | Caliper                 | Digital or dial                          |
| מיקרומטר            | Micrometer              |                                          |
| אינדיקטור חוגה      | Dial indicator          |                                          |
| מפתח מומנט          | Torque wrench           |                                          |
| כלי חיתוך           | Cutting tool            |                                          |
| מקדח                | Drill bit               |                                          |
| מכרסמת / כרסום     | End mill / milling      |                                          |
| טאפ                 | Tap                     | Thread-cutting                           |
| אינסרט              | Insert                  | Carbide tip for turning / milling        |
| סכין חד-פעמי        | Disposable blade        |                                          |
| פוינץ׳ (אגרוף)      | Punch                   |                                          |
| חותם                | Stamp                   |                                          |

### Lifecycle vocabulary

| Hebrew              | English                    | Module term                |
|---------------------|----------------------------|----------------------------|
| מחזורי שימוש        | Usage cycles               | `totalCycles`              |
| מחזורים נותרים      | Cycles remaining           | `cyclesRemaining`          |
| אורך חיים מתוכנן    | Rated life                 | `rated_cycles`             |
| רמת בלאי            | Wear level                 | `wearLevel`                |
| בלאי                | Wear                       | `wear`                     |
| ירוק / צהוב / אדום  | Green / Yellow / Red       | `WEAR_LEVELS`              |
| סוף חיים            | End of life                | `alertNearEnd`             |
| הוצאה משימוש        | Retirement                 | `retire`                   |
| תחזוקה              | Maintenance                | `scheduleMaintenance`      |
| כיול                | Calibration                | `calibration`              |
| השחזה               | Sharpening                 | `sharpening`               |
| בדיקה תקופתית       | Periodic inspection        | `inspection`               |
| שיפוץ יסודי         | Overhaul                   | `overhaul`                 |
| מועד יעד            | Due date                   | `dueDate`                  |
| באיחור              | Overdue                    | `overdueTools`             |
| השאלה               | Checkout                   | `checkout`                 |
| החזרה               | Return                     | `returnTool`               |
| שואל                | Borrower                   | `borrower`                 |
| מחזיר               | Returner                   | `returner`                 |
| הסגר                | Quarantine                 | `QUARANTINE` status        |
| מצב החזרה           | Return condition           | `conditionOnReturn`        |
| מצוין / טוב / סביר / גרוע / פגום | Excellent / Good / Fair / Poor / Damaged | `CONDITION` |
| יומן שימוש          | Usage log                  | `usageLog`                 |
| יומן תחזוקה         | Maintenance log            | `maintenanceLog`           |
| יומן השאלות         | Checkout log               | `checkoutLog`              |
| ספק                 | Supplier                   | `supplier`                 |
| מחלקה בעלת הכלי     | Owner department           | `ownerDept`                |
| מס' שרטוט           | Drawing reference          | `drawingRef`               |

---

## 9. Public API Surface

```text
class ToolTracker
├─ constructor({ wearThresholds? })
├─ defineTool(spec)                        → Tool
├─ recordUsage(toolId, usage)              → UsageEntry
├─ cyclesRemaining(toolId)                 → number | Infinity
├─ wearLevel(toolId)                       → { level, percent, consumed, rated, uncounted }
├─ scheduleMaintenance(id, type, due, opts)→ MaintenanceEntry
├─ completeMaintenance(id, maintId, opts)  → { closed, followUp }
├─ overdueTools(asOf?)                     → Array<{id, overdue[…]}>
├─ checkout({ toolId, borrower, expectedReturn, purpose })     → CheckoutEntry
├─ returnTool({ toolId, returner, condition, notes })          → CheckoutEntry
├─ retire(toolId, reason)                  → Tool (status=RETIRED)
├─ alertNearEnd(threshold?)                → Array<{id, percent, wearLevel, …}>
├─ findById(toolId)                        → Tool | null
├─ listAll({ includeRetired, type })       → Tool[]
└─ getAuditLog()                           → AuditEntry[]

exports.TOOL_TYPES
exports.MAINTENANCE_TYPES
exports.STATUS              // ACTIVE | IN_USE | MAINTENANCE | QUARANTINE | RETIRED
exports.CONDITION           // EXCELLENT | GOOD | FAIR | POOR | DAMAGED
exports.WEAR_LEVELS         // GREEN | YELLOW | RED
exports.DEFAULT_WEAR_THRESHOLDS
exports.DEFAULT_CALIBRATION_DAYS
```

---

## 10. Test Coverage — כיסוי בדיקות

`test/manufacturing/tool-tracker.test.js` — **38 unit tests**, all
passing under `node --test` with zero external dependencies.

Coverage map:

| Area                            | Tests                                              |
|---------------------------------|----------------------------------------------------|
| `defineTool` happy path         | bilingual metadata, idempotent re-define           |
| `defineTool` validation         | bad type, missing fields, negative cost            |
| `defineTool` auto-defaults      | calibration interval lookup by type                |
| `recordUsage`                   | accumulation, unknown tool, negative cycles        |
| `cyclesRemaining`               | normal, floored at 0, Infinity for uncounted       |
| `wearLevel`                     | GREEN / YELLOW / RED buckets, uncounted, custom    |
| `scheduleMaintenance`           | calibration, inspection, bad type                  |
| `overdueTools`                  | detection, future excluded, sort order, retired excluded |
| `completeMaintenance`           | close + auto-roll next calibration                 |
| `checkout` / `returnTool`       | happy path, double-checkout blocked, quarantine on POOR / DAMAGED, bad condition |
| `retire`                        | preserves history, blocks mutations, blocks on active checkout, `listAll` inclusion toggle |
| `alertNearEnd`                  | threshold, sort, retired+uncounted excluded        |
| audit log                       | every mutation captured                            |
| `listAll`                       | filter by type                                     |

Run:

```sh
cd onyx-procurement
node --test test/manufacturing/tool-tracker.test.js
```

Result on 2026-04-11: `tests 38 pass 38 fail 0 duration_ms ~121`.

---

## 11. Compliance Notes — הערות ציות

1. **ISO 9001 §7.1.5**: every gauge has a documented calibration
   schedule, a traceable supplier, and a history of calibrations.
   The audit trail is immutable (no `delete`, no `UPDATE` without
   history preservation).
2. **ת"י 18001 / ISO 45001** (OH&S): tools returned in POOR or
   DAMAGED condition are auto-quarantined and cannot silently
   re-enter service — mitigates the "foreseeable misuse" risk.
3. **Israeli Tax Authority** — tools are capital assets depreciated
   over their useful life. This module tracks lifetime cycles which
   feeds the useful-life estimate used by `assets/asset-manager.js`
   for the annual depreciation calculation.
4. **Retention**: no record is ever deleted. `retire()` is a status
   change. The `auditLog` is an append-only journal of every public
   mutation. For GDPR / Privacy Protection Law compliance, no PII is
   stored — only role identifiers (operator id, borrower id) which
   are references into the HR system and are redacted by the HR
   module, not this one.

---

## 12. Future Extensions — הרחבות עתידיות

Out of scope for Y-040, captured here for the roadmap:

- **QR-code label generation** — hook into
  `src/printing/label-templates/asset-tag.js` so each tool gets a
  cage-cage scannable tag.
- **Predictive wear curves** — fit a survival curve to historical
  `usageLog` data and issue early-retirement alerts before the
  yellow threshold hits. Hand off to Agent Y-042 (predictive maint).
- **Cost-per-cycle reporting** — rollup `(cost + totalMaintenanceCost)
  / totalCycles` so procurement can compare supplier A vs supplier B
  on actual life rather than catalog promises.
- **Supplier life-warranty claims** — if a die dies at 40% of rated
  life, auto-generate a warranty claim to the die maker via the
  procurement module.
- **Mobile check-out** — touchscreen terminal in the cage with
  barcode reader; today the API is the integration point.

---

**Never delete — only upgrade and grow.**
**לא מוחקים — רק משדרגים ומגדלים.**
