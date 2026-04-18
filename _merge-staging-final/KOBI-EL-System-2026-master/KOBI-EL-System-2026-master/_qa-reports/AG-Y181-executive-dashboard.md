# AG-Y181 — Executive Dashboard Aggregator — QA Report

**Agent:** AG-Y181
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/reporting/executive-dashboard.js`
**Test file:** `onyx-procurement/test/reporting/executive-dashboard.test.js`
**Runtime:** Node.js built-ins only (`node:test`, `node:assert`)
**Status:** GREEN — 20 / 20 tests passing
**Rule observed:** לא מוחקים רק משדרגים ומגדלים — this module is fully ADDITIVE; it lives in a brand-new directory `src/reporting/` and does not touch `src/reports/` or any other existing aggregator (e.g. `grand-aggregator.js`, `management-dashboard-pdf.js`).

---

## 1. Purpose / מטרה

**EN —** Build a server-side executive dashboard aggregator that lets multiple subsystems (finance, sales, HR, procurement, operations, safety, quality, customer, risk) register themselves as data sources. Calling `build(period)` fetches all of them in parallel, merges the results, evaluates every KPI against its target, computes trend arrows vs the prior period, and ships a single bilingual JSON snapshot that is 100 % ready for a frontend to render — no further joins, no further label lookups.

**HE —** לבנות אגרגטור לוח-מחוונים למנכ"ל/דירקטוריון בצד-השרת, המאפשר לתתי-מערכות שונות להירשם כמקורות-נתונים. קריאה אחת ל-`build(period)` אוספת את כולם במקביל, ממזגת את התוצאות, בודקת כל KPI מול היעד שהוגדר, מחשבת חצי-מגמה אל מול התקופה הקודמת, ומחזירה קובץ JSON דו-לשוני יחיד המוכן לעיבוד בצד-הלקוח — ללא חישובים נוספים, ללא חיפוש תוויות נוסף.

---

## 2. Architecture / ארכיטקטורה

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                    ExecutiveDashboard class                        │
 │                                                                     │
 │  registerSource(name, fetchFn)     — add any subsystem as a source │
 │  setTargets({...})                  — override default KPI targets │
 │  setPriorSnapshot(prevSnapshot)     — wire up trend-vs-prior       │
 │                                                                     │
 │   ┌──────────────┐  parallel Promise.allSettled  ┌──────────────┐  │
 │   │  finance.fn  │─┐                            ┌─│  quality.fn  │  │
 │   │   sales.fn   │─┤                            ├─│   safety.fn  │  │
 │   │   hr.fn      │─┤ ─── merge + normalise ───► ├─│   risk.fn    │  │
 │   │  procure.fn  │─┤                            ├─│ customer.fn  │  │
 │   │  operate.fn  │─┘                            └─│  …anything   │  │
 │   └──────────────┘                               └──────────────┘  │
 │                                                                     │
 │   merged KPIs → evaluateTarget() → computeTrend(priorSnapshot)     │
 │                                ↓                                    │
 │                      BILINGUAL JSON SNAPSHOT                        │
 │   {version, generatedAt, tenant, period, kpis, summary,             │
 │    sourceErrors, extras, metadata: {theme, i18n, sources}}          │
 └─────────────────────────────────────────────────────────────────────┘
```

Key principles:

1. **Fan-in** — many small fetchers, one call site. Each source only needs to know the KPI ids it owns (`revenue`, `ebitda`, …); the dashboard takes care of the rest.
2. **Isolation** — `Promise.allSettled` guarantees that a crashing source never kills the build. The failure ends up in `snapshot.sourceErrors[name]` and the KPIs owned by that source fall back to `null` with `status: 'unknown'`.
3. **Purity** — the class has no I/O of its own. Every integration point is a function you inject, which is exactly why sources are trivially mockable from the test suite.
4. **Bilingual first** — every label, legend entry, severity tooltip and KPI subtitle is generated in Hebrew and English at the same time; the renderer never has to branch on locale.
5. **Theme-aware** — the full Palantir dark-theme token palette is embedded in `metadata.theme.tokens`, and every KPI's `statusColor` and `trend.color` is pre-resolved from that palette.

---

## 3. Public API / ממשק ציבורי

| Symbol | Signature | Description |
|---|---|---|
| `class ExecutiveDashboard` | `new ExecutiveDashboard({targets?, priorSnapshot?, clock?, tenant?})` | Construct an aggregator instance. |
| `.registerSource(name, fetchFn)` | `(string, (ctx) => object\|Promise<object>) → this` | Register one source. |
| `.registerSources(map)` | `({name: fn, …}) → this` | Bulk register. |
| `.unregisterSource(name)` | `(string) → this` | Remove a source (idempotent). |
| `.listSources()` | `() → string[]` | List currently registered source names. |
| `.setTargets(targets)` | `({kpiId: target}) → this` | Override KPI targets. |
| `.setPriorSnapshot(snapshot)` | `(snapshot) → this` | Supply prior period snapshot for trend calc. |
| `.build(period)` | `(string\|{from,to,label_en,label_he}) → Promise<Snapshot>` | Main entry point. |
| `.buildSync(data, period)` | `(object, period) → Snapshot` | Pure build without fetchers. |

### 3.1 Exported helpers (for re-use and deep tests)

- `PALANTIR_DARK_TOKENS` — the full colour-token tree (`bg`, `fg`, `border`, `brand`, `status`, `trend`, `chart`).
- `KPI_DEFINITIONS` — immutable catalogue of all 16 KPIs with `label_en`, `label_he`, `unit`, `family`, `direction`.
- `KPI_KEYS` — ordered id array.
- `DEFAULT_TARGETS` — safe defaults that can be overridden per tenant.
- `computeTrend(current, prior)` — returns `{token, direction, deltaAbs, deltaPct}`.
- `evaluateTarget(actual, target)` — returns `'on' | 'warn' | 'off' | 'unknown'`.
- `statusColor(status)` / `trendColor(direction, kpiDirection)` — palette resolvers.
- `formatNIS(amount)` / `formatValue(value, unit)` — reproducible (locale-independent for currency).
- `mergeSources(results)` — merge strategy with topRisks concatenation.
- `normaliseSnapshot(raw)` / `normaliseRisks(list)` — tolerant shape coercion.

---

## 4. KPI Catalogue / קטלוג מדדים

16 required KPIs × bilingual labels:

| Id | EN Label | HE Label | Family | Unit | Dir |
|---|---|---|---|---|---|
| `revenue` | Revenue | הכנסות | financial | NIS | ↑ |
| `grossMargin` | Gross Margin | רווח גולמי | financial | % | ↑ |
| `opEx` | Operating Expenses | הוצאות תפעוליות | financial | NIS | ↓ |
| `ebitda` | EBITDA | EBITDA — רווח תפעולי | financial | NIS | ↑ |
| `cashPosition` | Cash Position | יתרת מזומנים | financial | NIS | — |
| `backlog` | Order Backlog | צבר הזמנות | sales | NIS | ↑ |
| `aging` | AR Aging >60 days | חוב לקוחות מעל 60 ימים | sales | NIS | ↓ |
| `workforce` | Workforce Headcount | מצבת עובדים | hr | count | — |
| `openRFQs` | Open RFQs | בקשות להצעה פתוחות | procurement | count | — |
| `openWOs` | Open Work Orders | הזמנות עבודה פתוחות | operations | count | — |
| `safetyIncidents` | Safety Incidents | אירועי בטיחות | safety | count | ↓ |
| `qualityPPM` | Quality PPM | PPM איכות | quality | ppm | ↓ |
| `onTime` | On-Time Delivery | אספקה בזמן | operations | % | ↑ |
| `npsScore` | NPS Score | מדד NPS | customer | score | ↑ |
| `churnRate` | Customer Churn | נטישת לקוחות | customer | % | ↓ |
| `topRisks` | Top Risks | סיכונים מובילים | risk | list | — |

`↑` = higher is better · `↓` = lower is better · `—` = track level

---

## 5. Default Targets / יעדים ברירת-מחדל

```js
revenue        : { min: 10,000,000, stretch: 12,000,000 }
grossMargin    : { min: 30,         stretch: 38 }
opEx           : { max: 6,500,000 }
ebitda         : { min: 1,500,000,  stretch: 2,200,000 }
cashPosition   : { min: 4,000,000 }
backlog        : { min: 20,000,000 }
aging          : { max: 900,000 }
workforce      : { min: 120, max: 200 }     // band
openRFQs       : { min: 8,   max: 50 }      // band
openWOs        : { min: 5,   max: 120 }     // band
safetyIncidents: { max: 2 }
qualityPPM     : { max: 500 }
onTime         : { min: 92 }
npsScore       : { min: 45 }
churnRate      : { max: 5 }
topRisks       : null                        // list — no target
```

`evaluateTarget` policy (one function for every shape):

- `{min, max}` band — outside → `off`; within 10 % of either edge → `warn`; else `on`.
- `{min, stretch}` — below `min` → `off`; between → `warn`; above `stretch` → `on`.
- `{min}` — below → `off`; else → `on`.
- `{max}` — above → `off`; within 10 % of cap → `warn`; else → `on`.
- `null` / missing — `unknown`.

---

## 6. Trend Arrows / חצי-מגמה

`computeTrend(current, prior)` emits:

| Direction | Token | EN | HE |
|---|---|---|---|
| up | ▲ | Improving | משתפר |
| down | ▼ | Declining | יורד |
| flat | ▶ | Stable | יציב |
| none | • | Unknown | לא ידוע |

Flat tolerance: |Δ%| < 0.5 and |Δabs| < max(1, |prior|·0.5 %). Zero-divisor safe: when prior is 0 and current ≠ 0, Δ% is clamped to ±100.

`trend.color` is resolved against the KPI's own `direction`:
- An *up* trend on a "higher-is-better" KPI turns **green** (`trend.up`).
- An *up* trend on a "lower-is-better" KPI (e.g. `aging`, `qualityPPM`, `churnRate`) turns **red** (`trend.down`) — regression.
- A *flat* direction is always gray.

This decision is unit-tested in test #10 with the aging KPI.

---

## 7. Palantir Dark Theme Tokens / סמני עיצוב

Embedded verbatim into `snapshot.metadata.theme.tokens`:

```
bg:     primary #0B0F14 · secondary #111821 · surface #1A2330 · raised #21303F · overlay #0B0F14CC
fg:     primary #E6EDF3 · secondary #A6B3C2 · muted #6B7A8C · inverse #0B0F14
border: default #2B3A4D · strong #3E5168 · focus #5BC0EB
brand:  blue #00A3E0 · blueDark #0075A8 · blueGlow #5BC0EB · accent #11D6A7
status: success #10B981 · warning #F59E0B · danger #EF4444 · info #3B82F6 · neutral #6B7A8C
trend:  up #10B981 · down #EF4444 · flat #A6B3C2 · volatile #F59E0B
chart:  [#00A3E0, #11D6A7, #F59E0B, #EF4444, #A78BFA, #F472B6, #5BC0EB, #FDBA74]
```

The full tree is also frozen with `Object.freeze` so consumers cannot mutate it by accident.

---

## 8. Bilingual Metadata Block / בלוק מטא דו-לשוני

Every snapshot ships with:

```json
{
  "metadata": {
    "agent": "AG-Y181",
    "module": "onyx-procurement/src/reporting/executive-dashboard.js",
    "sources": { "<name>": { "status": "ok" | "error", "keys"|"error": ... } },
    "theme": { "name": "palantir-dark", "tokens": { ... }, "trendTokens": { ... } },
    "i18n": {
      "locales": ["en", "he"],
      "default": "he",
      "rtl": { "he": true, "en": false },
      "labels": {
        "title_en":    "Executive Dashboard",
        "title_he":    "לוח מחוונים להנהלה",
        "subtitle_en": "Snapshot · <period>",
        "subtitle_he": "תמונת מצב · <period>",
        "summary_en":  "<n> on target · <n> warn · <n> off · <n> unknown",
        "summary_he":  "<n> ביעד · <n> אזהרה · <n> מחוץ ליעד · <n> לא ידוע",
        "legend": {
          "on_en": "On target",         "on_he": "ביעד",
          "warn_en": "Warning",         "warn_he": "אזהרה",
          "off_en": "Off target",       "off_he": "מחוץ ליעד",
          "unknown_en": "Unknown",      "unknown_he": "לא ידוע",
          "trend_up_en": "Improving",   "trend_up_he": "משתפר",
          "trend_down_en": "Declining", "trend_down_he": "יורד",
          "trend_flat_en": "Stable",    "trend_flat_he": "יציב"
        }
      }
    }
  }
}
```

---

## 9. Snapshot Schema / סכימת התוצאה

```ts
type Snapshot = {
  version: 'exec-dash/1.0';
  generatedAt: string;               // ISO timestamp
  tenant: string;
  period: { from, to, label_en, label_he };
  kpis: Record<KpiId, {
    id: string;
    family: 'financial' | 'sales' | 'hr' | 'procurement' | 'operations'
          | 'safety' | 'quality' | 'customer' | 'risk';
    label_en: string;
    label_he: string;
    unit: 'NIS' | 'percent' | 'ppm' | 'score' | 'count' | 'list';
    direction: 'up' | 'down' | 'flat';
    value: number | any[] | null;
    formatted_en: string;
    formatted_he: string;
    target: object | null;
    status: 'on' | 'warn' | 'off' | 'unknown';
    statusColor: string;             // Palantir hex
    trend: {
      token: '▲'|'▼'|'▶'|'•';
      direction: 'up'|'down'|'flat'|'none';
      deltaAbs: number|null;
      deltaPct: number|null;
      color: string;                 // Palantir hex
    };
  }>;
  summary: { on: number; warn: number; off: number; unknown: number; total: number };
  sourceErrors: Record<string, string>;
  extras: Record<string, unknown>;
  metadata: { agent, module, sources, theme, i18n };
};
```

`summary.total` is always 16; `on + warn + off + unknown === total` (asserted in test #18).

---

## 10. Test Plan / תוכנית בדיקות

`node --test onyx-procurement/test/reporting/executive-dashboard.test.js`

20 tests — **all passing**:

| # | Test | Covers |
|---|---|---|
| 1 | KPI catalogue has all 16 required metrics with bilingual labels | KPI catalogue completeness, Hebrew char check |
| 2 | registerSource stores fetcher; unregister & list work | lifecycle |
| 3 | registerSource rejects invalid inputs | input validation |
| 4 | build() aggregates multiple mockable sources into one snapshot | end-to-end async |
| 5 | Bilingual labels and legend are present in metadata | HE + EN on every KPI |
| 6 | Palantir dark theme tokens appear in metadata.theme | theme injection |
| 7 | KPI status colours come from Palantir tokens | palette resolver |
| 8 | evaluateTarget handles min / max / band / stretch / null | target policy |
| 9 | computeTrend produces up / down / flat / none directions | arrow math |
| 10 | Trend arrows use prior snapshot when provided | trend-vs-prior, color inversion |
| 11 | failing source does not abort build; its error is captured | resilience |
| 12 | buildSync is a pure builder and yields same shape as async | pure path |
| 13 | topRisks normalised into bilingual objects with severity colours | risk shaping |
| 14 | formatNIS covers all magnitude branches | currency formatter |
| 15 | mergeSources precedence: later sources win, topRisks are concatenated | merge rules |
| 16 | normaliseSnapshot accepts objects, counts, items and nulls | tolerant coercion |
| 17 | period object is preserved and exposed in subtitle labels | period propagation |
| 18 | Summary counters add up and target override works | counter invariants |
| 19 | Extras bucket captures unknown KPIs from sources | extras bucket |
| 20 | Each family is represented and formatted_he covers units | family coverage |

### Run output

```
✔ 1. KPI catalogue has all 16 required metrics with bilingual labels
✔ 2. registerSource stores fetcher; unregister & list work
✔ 3. registerSource rejects invalid inputs
✔ 4. build() aggregates multiple mockable sources into one snapshot
✔ 5. Bilingual labels and legend are present in metadata
✔ 6. Palantir dark theme tokens appear in metadata.theme
✔ 7. KPI status colours come from Palantir tokens
✔ 8. evaluateTarget handles min / max / band / stretch / null
✔ 9. computeTrend produces up / down / flat / none directions
✔ 10. Trend arrows use prior snapshot when provided
✔ 11. failing source does not abort build; its error is captured
✔ 12. buildSync is a pure builder and yields same shape as async
✔ 13. topRisks normalised into bilingual objects with severity colours
✔ 14. formatNIS covers all magnitude branches
✔ 15. mergeSources precedence: later sources win, topRisks are concatenated
✔ 16. normaliseSnapshot accepts objects, counts, items and nulls
✔ 17. period object is preserved and exposed in subtitle labels
✔ 18. Summary counters add up and target override works
✔ 19. Extras bucket captures unknown KPIs from sources
✔ 20. Each family is represented and formatted_he covers units
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

---

## 11. Usage Example / דוגמת שימוש

```js
const { ExecutiveDashboard } = require('./src/reporting/executive-dashboard');

const dash = new ExecutiveDashboard({ tenant: 'techno-kol-uzi' });

dash.registerSources({
  finance:  async () => financeRepo.summary(),     // {revenue, grossMargin, opEx, ebitda, cashPosition}
  sales:    async () => salesRepo.pipeline(),      // {backlog, aging}
  hr:       async () => hrRepo.headcount(),        // {workforce}
  procure:  async () => rfqRepo.open(),            // {openRFQs}
  ops:      async () => woRepo.open(),             // {openWOs, onTime}
  safety:   async () => ehsRepo.incidents(),       // {safetyIncidents}
  quality:  async () => qaRepo.ppm(),              // {qualityPPM}
  customer: async () => crmRepo.nps(),             // {npsScore, churnRate}
  risk:     async () => riskRegister.top(5),       // {topRisks: [...]}
});

// Optional — supply last period for trend arrows
dash.setPriorSnapshot(await cache.get('exec-dash:2025-Q4'));

const snapshot = await dash.build({
  from: '2026-01-01', to: '2026-03-31',
  label_en: 'Q1 2026', label_he: 'רבעון 1 2026',
});

// Ship to frontend verbatim — no further processing required.
res.json(snapshot);
```

---

## 12. Rule-#1 Compliance / עמידה בכלל ראשון

- New file `src/reporting/executive-dashboard.js` — created, not modifying anything.
- New file `test/reporting/executive-dashboard.test.js` — created, not modifying anything.
- New directory `src/reporting/` created alongside existing `src/reports/`, so nothing in `reports/` (including `grand-aggregator.js`, `management-dashboard-pdf.js`, `pnl-report.js`, `inventory-valuation.js`, `cash-flow-forecast.js`, `quarterly-tax-report.js`) is touched.
- No existing exports were renamed, removed, or shadowed.
- No pre-existing tests were modified.
- Zero runtime dependencies added (Node.js built-ins only — `node:test`, `node:assert/strict`).

---

## 13. Verdict / מסקנה

**GO — Production ready.**

- 20 / 20 unit tests passing (target was 15+).
- Bilingual (EN + HE) throughout — labels, legends, subtitles, risks.
- Full Palantir dark-theme palette pre-resolved into the JSON payload.
- Resilient: source failures degrade gracefully, never abort the build.
- Additive: follows Rule #1 — nothing deleted, nothing overwritten.

**Next wiring suggestions (for a follow-up agent):**

1. Mount at `GET /api/v1/exec-dashboard?period=2026-Q1` in `onyx-procurement/server.js`.
2. Cache prior snapshot in Redis under `exec-dash:<tenant>:<period-1>` to feed `setPriorSnapshot`.
3. Hook the bi-dashboard UI (`AG-99`) as the default renderer for the returned JSON.
