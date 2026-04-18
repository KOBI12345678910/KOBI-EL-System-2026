# AG-Y035 — OEE Tracker (Overall Equipment Effectiveness)

**Agent:** Y-035 — Swarm Manufacturing
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal fabrication) — Wave 2026
**Module:** `onyx-procurement/src/manufacturing/oee-tracker.js`
**Test:**  `onyx-procurement/test/manufacturing/oee-tracker.test.js`
**Date:**   2026-04-11
**Rule:**   לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת הדוח

**OEE (Overall Equipment Effectiveness)** is the gold-standard KPI for
discrete manufacturing, introduced by Seiichi Nakajima (JIPM, 1988) as
part of Total Productive Maintenance (TPM). It expresses — as a single
number between 0 and 1 — how effectively a production machine is being
used **compared to its own design capability**, under the plan that was
set for it.

For the Techno-Kol Uzi metal-fab floor this covers:

- **CNC mills / lathes** — cycle-time-bound, quality-sensitive
- **Laser & plasma cutters** — setup-dominated, beam-dwell critical
- **Press brakes** — tool-change heavy, bend-angle quality losses
- **Welding stations** — arc-on time, weld-defect quality losses
- **Painting / galvanising booths** — thermal cycle, finish defects
- **Shearing, punching, deburring** — material-handling waits, jams

The tracker turns shift reports into a live metric, decomposes losses
into Nakajima's **Six Big Losses**, ranks downtime causes as a
**Pareto** (80/20 curve), measures the **gap to world-class OEE (85%)**,
fires **real-time alerts** when a machine drops below a threshold, and
emits a **bilingual (HE/EN) report with inline SVG sparkline + Pareto
bars**. Zero external dependencies — pure ES2020 class.

---

## 2. OEE Formula — נוסחת ה-OEE

```
OEE = Availability × Performance × Quality
```

| Factor | Formula | Intuition |
|---|---|---|
| **Availability** (זמינות) | `Run Time / Planned Production Time` | How much of the planned time the machine actually ran |
| **Performance**  (ביצועים) | `(Ideal Cycle Time × Total Count) / Run Time` | How fast the machine ran, vs its design speed |
| **Quality**      (איכות)   | `Good Count / Total Count` | How many pieces came out good |

### 2.1 Worked example — textbook 7-hour shift

| Input | Value |
|---|---|
| `plannedTime`      | 420 min (one 7-hr shift) |
| `runTime`          | 400 min (20 min downtime) |
| `idealCycleTime`   | 1.0 min / piece |
| `piecesProduced`   | 380 |
| `piecesGood`       | 370 |

```
Availability = 400 / 420              ≈ 0.9524   (95.24%)
Performance  = (1.0 × 380) / 400      = 0.9500   (95.00%)
Quality      = 370 / 380              ≈ 0.9737   (97.37%)
OEE          = 0.9524 × 0.95 × 0.9737 ≈ 0.8810   (88.10%)
```

The value 0.8810 is pinned by the first test in the suite — "computes
the three factors from textbook values".

### 2.2 Rollup (multi-run aggregation)

OEE for a **period** is NOT the arithmetic mean of per-run OEE numbers —
that would overweight short runs. Instead the tracker **sums the raw
inputs** across all runs in the window and recomputes the three factors
once at the end:

```
A = ΣrunTime / ΣplannedTime
P = Σ(idealCycle × produced) / ΣrunTime
Q = ΣpiecesGood / ΣpiecesProduced
```

This is the same approach used by Vorne, XL, and every TPM textbook.

### 2.3 Clamping & rounding

- Every factor is clamped to `[0, 1]` — over-reported runtime or
  piece-counts can never push a factor above 1.
- Every factor is rounded to 4 decimals with an `EPSILON`-bumped
  `Math.round` to avoid IEEE-754 drift (so 0.85 looks like 0.85, not
  0.8499999999).
- `runTime` is clamped to `plannedTime`; `piecesGood` is clamped to
  `piecesProduced`. The raw input object itself is never mutated.

---

## 3. Six Big Losses — ששת ההפסדים הגדולים

Nakajima (1988) classified every form of lost productivity into six
buckets that map cleanly onto the three OEE factors:

| # | English | עברית | OEE category |
|:-:|---|---|---|
| 1 | **Equipment Failure / Breakdown** | כשל ציוד / תקלת מכונה | Availability |
| 2 | **Setup & Adjustment**             | התאמות ושינויי כלי עבודה | Availability |
| 3 | **Idling & Minor Stops**           | עצירות קטנות / הרצות חלקיות | Performance |
| 4 | **Reduced Speed**                  | מהירות מופחתת | Performance |
| 5 | **Startup Rejects**                | פסולת סטארט-אפ | Quality |
| 6 | **Production Rejects**             | פסולת ייצור שוטפת | Quality |

`sixBigLosses(machineId, period)` returns minutes attributed to each
bucket plus category totals. Highlights:

- **Downtime reasons** tagged on `recordRun` are routed to 1-2 or 3
  based on the reason-code → big-loss mapping in `REASON_CODES`.
- **Reduced speed (bucket 4)** is computed analytically as
  `max(0, runTime − idealCycleTime × totalCount)`. Any explicit
  `reduced_speed` downtime is max-merged so we never double-count.
- **Quality losses (buckets 5+6)** are converted from *pieces* to
  *minutes of lost production time* via `rejected × avgIdealCycleTime`.
  If the caller hasn't tagged reject downtime, the module defaults to
  a **50/50 split** between startup and production rejects (override
  with `{ rejectSplit }`). Explicit tags are honoured proportionally.

Test coverage includes dedicated assertions for each bucket's
attribution, the speed-loss gap, reject-minute conversion, and the
invariant that `categories.availability + performance + quality`
matches the sum of the six individual buckets.

---

## 4. Reason-Code Catalogue — קטלוג קודי הסיבות

Bilingual HE/EN reason codes tuned for the metal-fab floor.

### Availability losses (1) Equipment Failure

| Code | עברית | English |
|---|---|---|
| `mechanical_breakdown` | תקלה מכנית | Mechanical Breakdown |
| `electrical_fault`     | תקלת חשמל | Electrical Fault |
| `hydraulic_leak`       | דליפה הידראולית | Hydraulic Leak |
| `controller_crash`     | קריסת בקר CNC | CNC Controller Crash |
| `tool_breakage`        | שבר כלי חיתוך | Tool Breakage |

### Availability losses (2) Setup & Adjustment

| Code | עברית | English |
|---|---|---|
| `setup_changeover`     | החלפת סדרה / setup | Setup / Changeover |
| `tool_change`          | החלפת כלי עבודה | Tool Change |
| `material_changeover`  | החלפת חומר גלם | Material Changeover |
| `fixture_adjustment`   | כיוון התקן אחיזה | Fixture Adjustment |
| `program_upload`       | טעינת תוכנית CNC | CNC Program Upload |

### Performance losses (3) Idling & Minor Stops

| Code | עברית | English |
|---|---|---|
| `jammed_part`      | תקיעת חלק | Jammed Part |
| `sensor_misread`   | שגיאת חיישן | Sensor Misread |
| `operator_break`   | הפסקת מפעיל | Operator Break |
| `awaiting_material`| המתנה לחומר גלם | Awaiting Material |
| `awaiting_crane`   | המתנה לעגורן | Awaiting Overhead Crane |

### Performance losses (4) Reduced Speed

| Code | עברית | English |
|---|---|---|
| `slow_feed_rate`        | קצב הזנה איטי | Slow Feed Rate |
| `worn_tooling`          | כלי עבודה שחוקים | Worn Tooling |
| `operator_inefficiency` | חוסר יעילות מפעיל | Operator Inefficiency |
| `material_hardness`     | חומר קשה מהתקן | Material Harder Than Spec |

### Quality losses (5) Startup Rejects

| Code | עברית | English |
|---|---|---|
| `startup_scrap`                | פסולת הרצה ראשונית | Startup Scrap |
| `warmup_rejects`               | חלקים פגומים בחימום | Warm-Up Rejects |
| `first_piece_inspection_fail`  | כשל בדיקת חלק ראשון | First-Piece Inspection Fail |

### Quality losses (6) Production Rejects

| Code | עברית | English |
|---|---|---|
| `dimension_out_of_tol` | סטייה ממידה | Dimension Out of Tolerance |
| `surface_defect`       | פגם פני שטח | Surface Defect |
| `weld_defect`          | פגם ריתוך | Weld Defect |
| `paint_defect`         | פגם צביעה | Paint Defect |
| `bend_angle_error`     | שגיאת זווית כיפוף | Bend Angle Error |

Unknown codes degrade gracefully to a synthetic `unspecified` entry,
mapped to `equipment_failure` so losses are never silently dropped.

---

## 5. World-Class Benchmark — מצוינות עולמית

| Level | OEE | Who hits it | Source |
|---|:-:|---|---|
| **World-class** | **0.85 (85%)** | Top-quartile of best-in-class plants | Nakajima 1988 / JIPM |
| Good / good-enough | 0.75 | Most well-run plants | Vorne / OEE Industry Standard |
| Typical | 0.40 – 0.60 | Average discrete manufacturer | SAE / TPM surveys |
| Poor   | < 0.40 | Bottleneck or legacy asset | — |

The per-factor world-class targets (also Nakajima) are used by
`worldClassGap()` to identify the weakest factor:

| Factor | World-class target |
|---|:-:|
| Availability | 0.90 |
| Performance  | 0.95 |
| Quality      | 0.9999 (~1.0) |

`worldClassGap` returns:

```js
{
  actual: 0.72,          // current rolled-up OEE
  benchmark: 0.85,       // world-class target
  gap: 0.13,             // positive = below target
  gapPercent: 15.29,     // 13 / 85
  factorBenchmarks: { availability: 0.9, performance: 0.95, quality: 0.9999 },
  factorGaps:       { availability: 0.18, performance: 0.05, quality: 0.04 },
  weakestFactor: 'availability',
  coaching: {
    he: 'התמקדו בהפחתת כשלי ציוד והקצרת זמני החלפה (SMED).',
    en: 'Focus on reducing equipment failures and shortening changeovers (SMED).'
  },
  atWorldClass: false
}
```

The coaching strings are bilingual and rotate based on whichever factor
is worst below its individual benchmark.

---

## 6. Public API

```js
const { OEETracker } = require('./src/manufacturing/oee-tracker.js');

const tracker = new OEETracker({
  worldClassOEE: 0.85,     // default
  alertThreshold: 0.60,    // default for alertLowOEE
});
```

| Method | Returns |
|---|---|
| `recordRun(input)` | Frozen run record — `{ availability, performance, quality, oee, … }` |
| `oee(machineId?, period?)` | Rolled-up OEE + raw totals |
| `sixBigLosses(machineId?, period?, { rejectSplit? })` | Bucket minutes + bilingual labels |
| `downtimeReasonCodes(machineId?, period?)` | Pareto array sorted desc, with cumulative % |
| `worldClassGap(machineId?, period?)` | Gap vs 0.85 + weakest factor + bilingual coaching |
| `alertLowOEE(threshold?)` | Array of machines below threshold, sorted worst first |
| `generateReport(machineId, period?, { trendPoints? })` | Bilingual report + inline SVG sparkline + Pareto bars |

`period` accepts `undefined` / `'all'`, the shortcuts `'today' | 'week'
| 'month'`, or an explicit `{ from, to }` window (ISO strings or Dates).

### 6.1 `recordRun` input contract

```js
tracker.recordRun({
  machineId:     'CNC-01',
  shift:         'morning',          // optional label
  plannedTime:   420,                // minutes
  runTime:       400,                // minutes (clamped to plannedTime)
  idealCycleTime: 1.0,               // min per piece
  piecesProduced: 380,
  piecesGood:    370,                // clamped to piecesProduced
  downtime: [
    { reason: 'mechanical_breakdown', duration: 12 },
    { reason: 'setup_changeover',     duration:  8 },
  ],
  timestamp: '2026-04-01T06:00:00Z', // optional; defaults to now
});
```

Record is frozen on return. The internal `_runs` log is append-only —
no method on the tracker ever deletes or rewrites a prior record (pinned
by the `no method ever deletes a run` test).

---

## 7. Test Coverage

File: `test/manufacturing/oee-tracker.test.js` — **45 tests, all passing**.

| Suite | Tests | Focus |
|---|:-:|---|
| `OEE constants` | 4 | WORLD_CLASS_OEE=0.85, bilingual big-loss labels, reason-code tagging, frozen |
| `round & clamp01 helpers` | 2 | IEEE-754 drift, [0,1] clamp |
| `parsePeriod` | 3 | undefined / explicit / shortcut |
| `OEETracker.recordRun` | 8 | textbook factors, validation, clamping, downtime bilingual labels, unknown-code fallback, frozen record, append-only, input immutability |
| `OEETracker.oee` | 5 | no-runs case, single-run, multi-run raw-sum rollup, period filter, all-machines aggregate |
| `OEETracker.sixBigLosses` | 5 | downtime → bucket attribution, reduced-speed gap, reject-to-minutes conversion, categories invariant, empty machine |
| `OEETracker.downtimeReasonCodes` | 4 | Pareto sort, percent + cumulative, occurrence aggregation, bilingual labels |
| `OEETracker.worldClassGap` | 4 | above-WC, availability weakest, quality weakest, positive gap below WC |
| `OEETracker.alertLowOEE` | 3 | empty, severity, worst-first sort |
| `OEETracker.generateReport` | 5 | bilingual summary, SVG well-formed, empty-data, Pareto empty, trendPoints limit |
| `purity (לא מוחקים…)` | 2 | read-only snapshot, append-only log |

### Run

```bash
cd onyx-procurement
node --test test/manufacturing/oee-tracker.test.js
```

### Result (2026-04-11)

```
tests 45
suites 11
pass 45
fail 0
duration_ms 166.23
```

---

## 8. SVG Charts — גרפים מובנים

`generateReport` emits two inline SVGs, both zero-dep, both with
`role="img"` and `aria-label` for screen readers.

- **Sparkline** — 240×48 line chart of the last N runs' OEE, with a
  dashed reference line at the world-class benchmark. Line colour
  swings green / amber / red based on the most recent OEE value.
- **Pareto bars** — 360×120 bar chart of the top-6 downtime reasons,
  bilingual `<title>` tooltips, ordered by time lost.

Both fall back to a "no data" placeholder when called with an empty
dataset — pinned by tests.

---

## 9. Purity & Non-Destructiveness (לא מוחקים רק משדרגים ומגדלים)

1. **`recordRun`** returns a **frozen** record and **appends** to an
   internal `_runs` array — the log is never truncated, shortened, or
   rewritten.
2. **No mutation of inputs** — `recordRun` copies and validates every
   field; a dedicated `JSON.stringify` snapshot test pins this.
3. **All analytical methods are pure reads** — `oee`, `sixBigLosses`,
   `downtimeReasonCodes`, `worldClassGap`, `alertLowOEE`, and
   `generateReport` never touch `_runs` except to read-filter it.
4. **No external deps** — only Node.js built-ins; no Date libraries, no
   chart libraries, no lodash. Tree-shakes to a single file.
5. **Upgrades, not rewrites** — new reason codes or new SVG chart kinds
   can be added without breaking the existing interface. The reason
   table in § 4 is additive.

---

## 10. Hebrew Glossary — מילון עברית

| English | עברית | הערה |
|---|---|---|
| Overall Equipment Effectiveness | מדד יעילות ציוד כוללת (OEE) | מדד מרכזי של TPM |
| Availability | זמינות | Run Time / Planned Time |
| Performance | ביצועים | קצב ייצור מול מהירות תיאורטית |
| Quality | איכות | יחידות תקינות מתוך הסך |
| Planned Production Time | זמן ייצור מתוכנן | זמן המשמרת בפועל בניכוי הפסקות מתוכננות |
| Run Time | זמן ריצה | משך בו המכונה באמת עבדה |
| Downtime | השבתה | כל עצירה שאינה מתוכננת |
| Ideal Cycle Time | זמן מחזור תיאורטי | זמן לחלק לפי מפרט היצרן |
| Good Count | יחידות תקינות | כמות שעברה QA |
| Total Count | סך היחידות | יחידות תקינות + פסולת |
| Six Big Losses | ששת ההפסדים הגדולים | סיווג Nakajima 1988 |
| Equipment Failure | כשל ציוד / תקלת מכונה | הפסד זמינות 1 |
| Setup & Adjustment | התאמות ושינויי כלי עבודה | הפסד זמינות 2 |
| Idling & Minor Stops | עצירות קטנות / הרצות חלקיות | הפסד ביצועים 1 |
| Reduced Speed | מהירות מופחתת | הפסד ביצועים 2 |
| Startup Rejects | פסולת סטארט-אפ | הפסד איכות 1 |
| Production Rejects | פסולת ייצור שוטפת | הפסד איכות 2 |
| World-class | מצוינות עולמית | 0.85 OEE (Nakajima) |
| Pareto | פארטו / עקומת 80-20 | דירוג סיבות לפי זמן |
| SMED | החלפה מהירה (Single-Minute Exchange of Die) | טכניקת הקטנת setup |
| TPM | תחזוקה פרודוקטיבית כוללת | מסגרת Nakajima |
| Shift | משמרת | boker/tsoharayim/layla |
| Shop Floor | רחבת ייצור | — |

---

## 11. Files

| Path | Role |
|---|---|
| `onyx-procurement/src/manufacturing/oee-tracker.js` | Business logic — class, Nakajima math, reason catalogue, SVG helpers |
| `onyx-procurement/test/manufacturing/oee-tracker.test.js` | Node `--test` suite, 45 tests |
| `_qa-reports/AG-Y035-oee-tracker.md` | **This report — never delete.** |

---

## 12. References

- Nakajima, Seiichi. *Introduction to TPM: Total Productive Maintenance*.
  Productivity Press, 1988. — origin of OEE and the Six Big Losses.
- JIPM (Japan Institute of Plant Maintenance) — TPM standard definitions.
- Vorne Industries — *The Fast Guide to OEE* — modern textbook formulas.
- Shingo, Shigeo. *A Revolution in Manufacturing: The SMED System*.
  Productivity Press, 1985. — setup-reduction technique referenced in
  coaching output.

---

**Status:** GREEN — 45/45 tests pass, no open issues.
**Signed-off:** Agent Y-035 — 2026-04-11.
