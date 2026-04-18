# AG-Y034 — Medium-Term Capacity Planning (תכנון כושר ייצור)

**Agent:** Y-034 — Manufacturing / Capacity Planning
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal-fab) — Wave 2026
**Module:** `onyx-procurement/src/manufacturing/capacity-planning.js`
**Test:**   `onyx-procurement/test/manufacturing/capacity-planning.test.js`
**Date:**   2026-04-11
**Rule:**   לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המודול

Medium-term (4-26 week) **capacity planning** for a metal-fabrication shop:
decide whether the existing shop floor can meet the Master Production
Schedule (MPS) and, when it cannot, suggest concrete scenarios (overtime,
extra shift, parallel machines, subcontract) that close the gap.

The module exposes a single class — `CapacityPlanner` — which combines:

| Layer | Purpose | Method |
|---|---|---|
| Calendar | Defines when a work centre is open | `defineCalendar()` |
| Capacity | Minutes available per period | `availableCapacity()` |
| Demand | Minutes required per period | `demandForecast()` |
| RCCP | Rough-cut feasibility of the MPS | `rccp()` |
| CPP / CRP | Detailed capacity vs load using routings | `cpp()` |
| Bottleneck | Which work centre is the constraint | `bottleneckAnalysis()` |
| What-if | Simulate scenarios without mutation | `whatIf()` |
| Levelling | Pull forward excess load to earlier slots | `loadLevel()` |

**Zero deps. Pure JS. Deterministic.** All times in minutes. All periods
are ISO `YYYY-MM-DD` strings — no reliance on system timezone.

---

## 2. RCCP vs CPP — שני שלבים של תכנון

The difference is **granularity**, not purpose. Both answer the same
question — "can we physically do this?" — but RCCP is a fast sanity
check while CPP is the authoritative detailed plan.

### 2.1 Rough-Cut Capacity Planning (RCCP) — `rccp(period)`

```
load(wc) = Σ  demand(line).quantity × billOfResources(line.partId)[wc].loadPerUnit
```

Inputs:
- **Bill of Resources** — a flat `[{workCenterId, loadPerUnit}]` per part.
  `loadPerUnit` is the total effective minutes **per finished unit** at the
  **critical** work centre, with setup and queue time **amortised**.
- **Demand forecast** — open WOs + forecast orders whose due date lies
  inside the period.

Output: `{ loadMin, availableMin, utilization, status }` for each work centre.

Use it to:
- Sanity-check a new MPS before committing.
- Run "what-if" sales pushes (+20% plate orders next quarter?).
- Find obvious blockers in seconds.

### 2.2 Capacity Requirements Planning / CPP — `cpp(period)`

```
load(wc) = Σ  (setupMin
             + quantity × runMinPerUnit
             + queueMin
             + moveMin)  for each operation on wc
```

Inputs:
- **Routings** — `[{workCenterId, setupMin, runMinPerUnit, queueMin, moveMin}]`
  ordered by operation number.
- **Demand forecast** — same source as RCCP.

Output: same shape as RCCP, plus `missingRoutings[]` for parts that have
no routing (flagged so planners can fix their master data).

Use it to:
- Generate the executable weekly load for each work centre.
- Feed downstream dispatch / finite scheduling.
- Decide overtime and subcontract in scenario planning.

### 2.3 When does each fire?

| Phase | Cadence | Method |
|---|---|---|
| Sales & Ops Planning (S&OP) | monthly | RCCP |
| MPS validation | weekly | RCCP |
| Master Scheduler review | weekly | CPP |
| Shop floor load balancing | daily | CPP → `loadLevel()` |

---

## 3. Israeli Work Calendar — לוח עבודה ישראלי

### 3.1 Work week

| Day | Hebrew | Policy |
|---|---|---|
| Sunday | ראשון | Full shifts |
| Monday | שני | Full shifts |
| Tuesday | שלישי | Full shifts |
| Wednesday | רביעי | Full shifts |
| Thursday | חמישי | Full shifts |
| Friday | שישי | **Half day** (configurable via `fridayHalfDay: false`) |
| Saturday | שבת | **Closed** (no shifts, overridable by explicit shift on day 6) |

The `defineCalendar()` API accepts an array of shifts, each with `days: [0..6]`
where `0 = Sunday … 6 = Saturday`. Overnight shifts are supported — a
shift with `start: '22:00', end: '06:00'` is interpreted as running into
the following day (8 hours).

### 3.2 Parallel machines & efficiency

- `machines` — number of parallel identical machines at the work centre.
  Effective capacity = `nominalMinutes × machines`.
- `efficiency` — 0-1 factor applied to nominal minutes (accounts for
  breakdowns, tool changes, short interruptions).

### 3.3 Built-in Israeli holiday table — 2026 & 2027

The module ships a complete Gregorian-equivalent table for both years.
All dates have been **cross-verified with the Hebrew calendar**
(via `Intl.DateTimeFormat('en-u-ca-hebrew', ...)`) to catch off-by-one
errors from manual Hebcal copies.

**2026** — `HOLIDAYS_IL['2026']`:

| Gregorian | Hebrew | Event (en) | Day type |
|---|---|---|---|
| 2026-03-03 | 14 Adar 5786 | Purim | closed |
| 2026-04-01 | 14 Nisan 5786 | Erev Pesach | half |
| 2026-04-02 | 15 Nisan 5786 | Pesach Day 1 | closed |
| 2026-04-03 .. 2026-04-07 | 16-20 Nisan | Chol Hamoed | half |
| 2026-04-08 | 21 Nisan 5786 | Pesach Day 7 | closed |
| 2026-04-21 | 4 Iyar 5786 | Memorial Day | half |
| 2026-04-22 | 5 Iyar 5786 | Independence Day | closed |
| 2026-05-21 | 5 Sivan 5786 | Erev Shavuot | half |
| 2026-05-22 | 6 Sivan 5786 | Shavuot | closed |
| 2026-07-23 | 9 Av 5786 | Tisha B'Av | closed |
| 2026-09-11 | 29 Elul 5786 | Erev Rosh Hashana | half |
| 2026-09-12 | 1 Tishri 5787 | Rosh Hashana 1 | closed (also Shabbat) |
| 2026-09-13 | 2 Tishri 5787 | Rosh Hashana 2 | closed |
| 2026-09-20 | 9 Tishri 5787 | Erev Yom Kippur | half |
| 2026-09-21 | 10 Tishri 5787 | Yom Kippur | closed |
| 2026-09-25 | 14 Tishri 5787 | Erev Sukkot | half |
| 2026-09-26 | 15 Tishri 5787 | Sukkot Day 1 | closed (also Shabbat) |
| 2026-09-27 .. 2026-10-01 | 16-20 Tishri | Chol Hamoed Sukkot | half |
| 2026-10-02 | 21 Tishri 5787 | Hoshana Raba | half |
| 2026-10-03 | 22 Tishri 5787 | Simchat Torah | closed (also Shabbat) |

**2027** — `HOLIDAYS_IL['2027']`:

| Gregorian | Hebrew | Event (en) | Day type |
|---|---|---|---|
| 2027-03-23 | 14 Adar II 5787 | Purim | closed |
| 2027-04-21 | 14 Nisan 5787 | Erev Pesach | half |
| 2027-04-22 | 15 Nisan 5787 | Pesach Day 1 | closed |
| 2027-04-23 .. 2027-04-27 | 16-20 Nisan | Chol Hamoed | half |
| 2027-04-28 | 21 Nisan 5787 | Pesach Day 7 | closed |
| 2027-05-11 | 4 Iyar 5787 | Memorial Day | half |
| 2027-05-12 | 5 Iyar 5787 | Independence Day | closed |
| 2027-06-10 | 5 Sivan 5787 | Erev Shavuot | half |
| 2027-06-11 | 6 Sivan 5787 | Shavuot | closed |
| 2027-08-12 | 9 Av 5787 | Tisha B'Av | closed |
| 2027-10-01 | 29 Elul 5787 | Erev Rosh Hashana | half |
| 2027-10-02 | 1 Tishri 5788 | Rosh Hashana 1 | closed (also Shabbat) |
| 2027-10-03 | 2 Tishri 5788 | Rosh Hashana 2 | closed |
| 2027-10-10 | 9 Tishri 5788 | Erev Yom Kippur | half |
| 2027-10-11 | 10 Tishri 5788 | Yom Kippur | closed |
| 2027-10-15 | 14 Tishri 5788 | Erev Sukkot | half |
| 2027-10-16 | 15 Tishri 5788 | Sukkot Day 1 | closed (also Shabbat) |
| 2027-10-17 .. 2027-10-21 | 16-20 Tishri | Chol Hamoed Sukkot | half |
| 2027-10-22 | 21 Tishri 5788 | Hoshana Raba | half |
| 2027-10-23 | 22 Tishri 5788 | Simchat Torah | closed (also Shabbat) |

**Note on Chanukah:** not listed — observed in Israel but not a legal
day off for industry. If a particular shop prefers to close, add it as a
company-specific entry via `defineCalendar({ holidays: [...] })` — the
built-in table is never mutated.

**Extension to 2028+:** append a new year key inside `HOLIDAYS_IL`
(never edit existing years — upgrade & grow, never delete).

---

## 4. What-If Scenarios — ניתוח מה-אם

`whatIf({scenario, period})` clones the planner, applies the change,
and returns `{ before, after }` with capacity and bottleneck deltas for
side-by-side comparison. **The original planner is never mutated.**

| `scenario.type` | Effect | Use case |
|---|---|---|
| `addShift` | Append a shift to a work centre | Add a night shift to cut through a quarter-end push |
| `overtime` | Extend weekday minutes by N (weekdays 0-4) | Short-term fix, no permanent hire |
| `addMachine` | +N parallel machines | Capital decision — multi-quarter horizon |
| `subcontract` | Subtract N minutes of load from a wc | Outsourced welding, external laser cutting |

### 4.1 Example — WELD bottleneck

```
Scenario A — baseline
  WELD: load 6010 min / available 2400 min → 250% overloaded

Scenario B — whatIf addMachine WELD +2
  WELD: load 6010 min / available 7200 min → 83% tight

Scenario C — whatIf subcontract WELD 3000 min
  WELD: load 3010 min / available 2400 min → 125% overloaded (still)

Scenario D — whatIf overtime WELD +120 min/day (5 days)
  WELD: load 6010 min / available 3000 min → 200% overloaded (still)
```

Conclusion: only addMachine genuinely resolves the constraint; the
other scenarios need to be combined. This is exactly the kind of
reasoning the module is built to support.

### 4.2 Load levelling — `loadLevel(period)`

Splits the period into ISO weeks, computes CPP for each week, and for
any week whose utilisation exceeds 100 %, **pulls excess minutes
forward** into earlier weeks that have headroom. Residual overload —
minutes that cannot be pulled forward — is flagged with
`reason: 'residual-overload-needs-scenario'`, meaning the planner has
to run `whatIf()` rather than shuffle.

**Guardrail:** `loadLevel()` **never** proposes deletion. The rule is
enforced by a regression test that scans every suggestion's `reason`
field for the tokens `delete | remove | discard` and fails the build
if any appears.

---

## 5. Test Plan — מבחנים

File: `onyx-procurement/test/manufacturing/capacity-planning.test.js`

```
  helpers: dayOfWeek returns 0..6 correctly
  helpers: eachDay inclusive range
  helpers: hmToMinutes and shiftMinutes
  HOLIDAYS_IL: 2026 and 2027 are populated
  resolveHoliday: recognises Yom Kippur 2026
  resolveHoliday: recognises Memorial Day 2027 as half-day
  getIsraeliHolidays: returns both years combined
  GLOSSARY: bilingual keys exist
  defineCalendar: basic Sunday-Thursday + Friday half
  defineCalendar: unknown work centre throws
  defineCalendar: rejects invalid shift days
  availableCapacity: Yom Kippur 2026 → zero
  availableCapacity: Erev Pesach 2026 → half day
  availableCapacity: Pesach Day 1 2026 → closed
  availableCapacity: full week Sunday–Thursday = 2400 min
  availableCapacity: parallel machines multiply capacity
  availableCapacity: efficiency factor reduces effective minutes
  demandForecast: collects WOs and forecasts inside the period
  rccp: computes load per work centre via bill of resources
  cpp: uses routings with setup + run + queue + move
  cpp: reports parts missing a routing
  bottleneckAnalysis: identifies overloaded work centre
  bottleneckAnalysis: returns ok message when all within capacity
  whatIf addMachine: capacity grows, bottleneck eases
  whatIf addShift: appends a second shift and increases capacity
  whatIf subcontract: reduces load on the target work centre
  whatIf overtime: extends daily shift window
  whatIf: planner state is NOT mutated (immutable simulation)
  loadLevel: weekly buckets emitted
  loadLevel: pulls forward excess load into earlier headroom
  rule: loadLevel never produces a "delete" suggestion
```

Result: **31 tests, all passing** via `node --test`.

---

## 6. Hebrew Glossary — מילון מונחים

| English | Hebrew | Notes |
|---|---|---|
| Work centre | תחנת עבודה | Physical machine/station cluster |
| Shift | משמרת | Time window of operation |
| Holiday | חג | Full or half closure |
| Capacity | כושר ייצור | Minutes available |
| Load | עומס | Minutes required |
| Utilisation | ניצולת | load / capacity |
| RCCP | תכנון גס של כושר | Rough-Cut Capacity Planning |
| CPP / CRP | תכנון מפורט של כושר | Capacity Requirements Planning |
| Bottleneck | צוואר בקבוק | Most-utilised work centre |
| Overtime | שעות נוספות | Extra weekday minutes |
| Subcontract | קבלן משנה | Outsourced operation |
| Work order | הזמנת עבודה | Open WO on shop floor |
| Routing | מסלול ייצור | Operation sequence for a part |
| Setup time | זמן הקמה | Minutes per batch |
| Run time | זמן ריצה | Minutes per unit |
| Queue time | זמן המתנה | Wait before the operation |
| Move time | זמן שינוע | Transport between centres |
| Load levelling | ייצוב עומסים | Smoothing demand across periods |
| What-if | ניתוח מה-אם | Scenario simulation |
| Master schedule | תוכנית ייצור ראשית | MPS |
| Bill of materials | רשימת חומרים | BOM (inputs) |
| Bill of resources | רשימת משאבים | BoR (RCCP driver) |

These keys are exported as `GLOSSARY` from the module so the UI can
render labels in either language without duplication.

---

## 7. Integration notes

- **Routings & work orders** — `CapacityPlanner` stores only an
  in-memory mirror. Production integration should feed it from the
  existing BOM / WO tables (`onyx-procurement/src/manufacturing/...`
  namespace will grow — never overwrite existing modules per rule).
- **Bilingual output** — the module returns `reason` codes in English
  (e.g. `closed:Yom Kippur`, `half:Friday`) so the UI maps them via
  `GLOSSARY` to Hebrew. This keeps data transport language-neutral.
- **Multi-tenant / multi-plant** — a single `CapacityPlanner` is
  per-plant. For a multi-plant ERP instantiate one per plant and
  aggregate reports at the application layer.

---

## 8. Upgrade path — "לא מוחקים רק משדרגים ומגדלים"

Future growth without deletion:

1. **Finite-capacity scheduler** — the next module (AG-Y035?) can
   consume `cpp()` output and produce a dispatch plan.
2. **2028 holidays** — append `HOLIDAYS_IL['2028']`; never remove earlier
   years so historical re-runs stay reproducible.
3. **Secondary constraints** — extend routings with `toolId` / `operator`
   requirements so `cpp()` can flag "weld-robot #2 busy while Yossi is on
   reserve duty" without breaking the existing signature.
4. **Live sensor feed** — the deterministic signature makes it trivial
   to wrap `availableCapacity()` with a real-time efficiency multiplier
   fed from OEE telemetry.

Every upgrade is **additive**. This file is the permanent record of
the Wave-2026 baseline.

---

**End of report AG-Y034.**
