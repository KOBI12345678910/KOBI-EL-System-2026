# AG-X96 — Master Health Dashboard (Observability Aggregator)

**Agent:** X-96
**Swarm:** 3D / Techno-Kol Uzi mega-ERP
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade and grow
**Date:** 2026-04-11
**Status:** Delivered, 33/33 tests passing, zero external dependencies

---

## 1. Purpose

X-96 aggregates every observability signal from agents **X-51..X-65** into a single, unified, bilingual (Hebrew RTL + English LTR), Palantir-dark-themed HTML dashboard. It is the one-pane-of-glass operators open first during incidents — no hunting, no context switching. Auto-refresh every 30 seconds via HTML `<meta http-equiv="refresh">`, no JavaScript required.

---

## 2. Files Delivered

| Path | Purpose |
|------|---------|
| `onyx-procurement/src/ops/master-dashboard.js` | Module: `generateMasterDashboard`, `dashboardJSON`, `middleware`, `attach`, exposed helpers, THEME, VERSION |
| `onyx-procurement/test/ops/master-dashboard.test.js` | 33 `node:test` assertions: HTML validity, KPI rendering, SVG validity, bilingual coverage, missing-source tolerance, middleware behavior, XSS escaping |
| `_qa-reports/AG-X96-master-dashboard.md` | This report |

No existing files were modified or deleted (rule honoured). The module is strictly additive.

---

## 3. Signal Sources Aggregated (X-51..X-65)

All inputs are optional. The dashboard renders cleanly with any subset, zero subset, or malformed inputs. Missing sources surface in the bottom-right "Signal Sources" widget as `חסר · missing`.

| Source key | Producing agent | Shape (expected) |
|------------|-----------------|------------------|
| `prom`         | X-51 Prometheus metrics | `{ latency_p95_ms: number[], error_rate: number[], req_rate: number[], ts: number[] }` |
| `slo`          | X-60 SLO tracker        | `{ burnRate, target, current, window }` |
| `incidents`    | X-61 Incident Mgmt      | `[{ id, title, titleHe, severity: 'SEV1'..'SEV4', openedAt, status }]` |
| `errorBudget`  | X-60 Error budget       | `{ remaining_pct, consumed_pct, eta_exhaustion }` |
| `alerts`       | X-55 Alert Manager      | `[{ id, name, nameHe, severity, firedAt, state: 'firing' }]` |
| `errors`       | X-54 Error Tracker      | `[{ message, count, lastSeen, service }]` |
| `deps`         | X-58 Dep Health         | `{ critical, high, medium, low, totalPackages }` |
| `resources`    | X-63 Resource Tracker   | `{ cpu_pct: number[], mem_pct: number[], disk_pct, load_avg, ts }` |
| `uptime`       | X-62 Uptime Monitor     | `{ overall_pct, since, per_service: { id: pct } }` |
| `logs`         | X-54 Log Store          | `{ rate_per_min: number[], ts, levels: { error, warn, info } }` |
| `canary`       | X-65 Synthetic Monitor  | `[{ name, nameHe, status, latencyMs, lastRun }]` |
| `services`     | X-56 Health Check (agg) | `[{ id, name, nameHe, status, uptime_pct, p95_ms, error_rate, owner }]` |

Any signal may be `undefined`, `null`, empty, or arrive with stray types — the renderer tolerates all of it (`_num`, `_arr` coercers, chart empty-state fallback, and an explicit `malformed signal values do not throw` regression test).

---

## 4. Layout Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER                                                          │
│  Title + Subtitle          [Overall pill]       Last update /   │
│  (bilingual)               (green/yellow/red)   refresh notice  │
├─────────────────────────────────────────────────────────────────┤
│ KPI ROW (4 cards, color-coded left border)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐   │
│  │ זמינות   │  │ SLO Burn │  │ Incidents│  │ Error Budget   │   │
│  │ Uptime   │  │   1.40×  │  │    2     │  │   68.5%        │   │
│  │  99.94%  │  │ tgt 99.9 │  │  1 SEV2  │  │  remaining     │   │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ CHARTS ROW (pure SVG, zero libs)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │ Latency P95 ms  │  │ Error Rate %    │  │ CPU + Memory   │   │
│  │ (accent blue)   │  │ (crit red)      │  │ (dual series)  │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ SERVICES TABLE                                                  │
│  Service | Status | Uptime | P95 | Error Rate | Owner           │
│  api-gw  | green  | 99.98% | 145 | 0.20%      | platform        │
│  billing | yellow | 99.82% | 480 | 2.80%      | fintech         │
├─────────────────────────────────────────────────────────────────┤
│ WIDGETS ROW                                                     │
│  ┌────────┐  ┌────────┐  ┌───────┐  ┌───────┐  ┌─────────────┐  │
│  │ Alerts │  │ Top    │  │ Deps  │  │Canary │  │  Signal     │  │
│  │        │  │ Errors │  │ CVEs  │  │ Tests │  │  Sources    │  │
│  │        │  │        │  │       │  │       │  │  (wide)     │  │
│  └────────┘  └────────┘  └───────┘  └───────┘  └─────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ FOOTER  "לא מוחקים רק משדרגים ומגדלים" · Agent X-96 · v1.0.0    │
└─────────────────────────────────────────────────────────────────┘
```

Responsive: grid auto-fits. On narrow viewports (< 640 px) the charts and widgets collapse to a single column and the wide source widget spans one column.

---

## 5. Theme Colors (Palantir Dark)

All colors frozen in the exported `THEME` constant:

| Token | Hex | Usage |
|-------|-----|-------|
| `bg`        | `#0b0d10` | Page background |
| `panel`     | `#13171c` | Card / section background |
| `panelElev` | `#1a1f26` | Elevated surface |
| `border`    | `#232932` | Card borders |
| `accent`    | `#4a9eff` | Primary highlight, main chart line |
| `accentDim` | `#2563eb` | Secondary blue |
| `text`      | `#e5e9f0` | Primary text |
| `textDim`   | `#94a3b8` | Secondary text |
| `textMuted` | `#64748b` | Tertiary / footer |
| `ok`        | `#10b981` | Healthy / green |
| `warn`      | `#f59e0b` | Degraded / yellow |
| `crit`      | `#ef4444` | Outage / red |
| `info`      | `#3b82f6` | Maintenance / blue |
| `grid`      | `#1f242c` | Chart gridlines |

Theme is shared with `./status-page.js` (X-62) so both surfaces look visually identical.

---

## 6. Hebrew Glossary (operator-facing terms)

| English | Hebrew | Context |
|---------|--------|---------|
| Master Health Dashboard | לוח בקרה ראשי | Header title |
| Unified X-51..X-65 observability signals | אחדות כל אותות תצפיתיות X-51..X-65 | Subtitle |
| Last update | עדכון אחרון | Header meta |
| Auto-refresh every 30 seconds | רענון אוטומטי כל 30 שניות | Header meta |
| Overall status | מצב כולל | Status pill aria |
| Uptime | זמינות | KPI card 1 |
| SLO Burn Rate | קצב שריפת SLO | KPI card 2 |
| Active Incidents | אירועים פעילים | KPI card 3 |
| Error Budget | תקציב שגיאות | KPI card 4 |
| Latency P95 (ms) | השהיית P95 (ms) | Chart 1 |
| Error Rate (%) | קצב שגיאות (%) | Chart 2 |
| Resource Usage | ניצול משאבי מערכת | Chart 3 |
| CPU | מעבד | Chart legend |
| Memory | זיכרון | Chart legend |
| Services | שירותים | Table section |
| Service | שירות | Column header |
| Status | סטטוס | Column header |
| P95 Latency | השהיית P95 | Column header |
| Error Rate | קצב שגיאות | Column header |
| Owner | אחראי | Column header |
| Active Alerts | התראות פעילות | Widget title |
| Top Errors | שגיאות נפוצות | Widget title |
| Dependency Vulnerabilities | פגיעויות תלויות | Widget title |
| Synthetic Canaries | בדיקות סינתטיות | Widget title |
| Signal Sources | מקורות אותות | Widget title |
| No data | אין נתונים | Empty state |
| missing | חסר | Source disconnected |
| connected | מחובר | Source present |
| operational | תקין | Status label |
| degraded | מוגבל | Status label |
| outage | תקלה | Status label |
| unknown | לא ידוע | Status label |
| critical | קריטי | Severity |
| high | גבוה | Severity |
| medium | בינוני | Severity |
| low | נמוך | Severity |
| remaining | נשאר | Error budget sub |
| Never delete, only upgrade and grow | לא מוחקים רק משדרגים ומגדלים | Footer rule |
| Agent | סוכן | Footer |

All strings live in the exported `L` constant (`module.exports.L`) keyed by identifier, each with `{ he, en }`.

---

## 7. Public API

```js
const dash = require('./src/ops/master-dashboard');

// 1) Render as HTML string
const html = dash.generateMasterDashboard(signals, { refreshSec: 30 });

// 2) Render as JSON (for API consumers, automation, JSONL ingest, tests)
const payload = dash.dashboardJSON(signals);

// 3) Mount as Express middleware at /ops/dashboard
app.use('/ops/dashboard', dash.middleware(async () => collectAllSignals()));

// 4) One-liner mount
dash.attach(app, { path: '/ops/dashboard', getSignals: collectAllSignals });
```

The middleware content-negotiates: `?format=json`, `?json=1`, or `Accept: application/json` without `text/html` returns JSON; otherwise HTML. It sets `Cache-Control: no-store` on every response. A throwing `getSignals` is caught and degrades to an empty dashboard (never crashes the request).

---

## 8. SVG Chart Primitive

Pure-SVG line chart (`_svgLineChart`) with:

- Zero libraries
- Multi-series support (CPU + memory drawn on the same axis)
- Auto-scaled y-axis with 5 horizontal gridlines and numeric labels
- Area fill under first series for visual weight
- Dot markers on sparse series (≤ 24 points)
- Legend inline
- `viewBox` for responsive scaling
- `role="img"` + `aria-label` for screen readers
- Explicit empty-state fallback that still returns a valid `<svg>` element

Safety: malformed input (null series, non-array data, `NaN`/`Infinity`) is coerced to `0` so the chart always produces valid SVG — regression-tested.

---

## 9. Overall Status Computation

`_computeSummary(signals)` picks the worst level from the following ladder and surfaces it as the big status pill in the header:

| Trigger | Level |
|---------|-------|
| any open SEV1 | `outage` |
| uptime < 95% | `outage` |
| SLO burn > 10× | `outage` |
| budget remaining < 5% | `outage` |
| any service `outage`/`down`/`critical` | `outage` |
| uptime < 99% | `degraded` |
| SLO burn > 2× | `degraded` |
| budget remaining < 25% | `degraded` |
| any open SEV2 | `degraded` |
| otherwise | `operational` |

---

## 10. Missing-Source Tolerance

The dashboard is designed to render correctly under a partial telemetry plane:

- All twelve sources independently optional
- `undefined`, `null`, `{}` all render a full, structurally-valid HTML document
- Malformed field types (string where array expected, NaN numbers, etc.) are coerced via `_num`/`_arr` without throwing
- Missing sources show `חסר · missing` in the sources widget so operators immediately see what's disconnected
- KPI cards show `—` placeholder when the underlying signal is absent; tone reverts to neutral (accent blue)

This is covered by three tests:
1. `generateMasterDashboard tolerates undefined / null input`
2. `each signal source can be missing independently` — programmatically drops each source and re-renders
3. `malformed signal values do not throw`

---

## 11. Test Coverage

`test/ops/master-dashboard.test.js` (node:test, 33 tests, 100% passing):

- HTML validity — doctype, root tag balance, meta refresh, lang/dir attributes
- KPI cards — full signals and partial-signal fallback
- SVG charts — tag balance, namespace, viewBox, polyline presence, empty-state, data rendering
- Bilingual — every major label asserted in both Hebrew and English; `.he` / `.en` CSS classes present
- Missing-source tolerance — undefined / null / `{}` / each source independently dropped / malformed inputs
- Service table — all rows rendered, bilingual names present
- `dashboardJSON` — structured output stable, tolerates missing input
- Middleware — HTML default, `?format=json`, Accept header negotiation, async provider, throwing provider, no provider, `attach` helper behavior
- Theme — `THEME` constants correct, colors embedded in CSS
- `_computeSummary` — SEV1 outage, low uptime outage, happy path operational
- XSS — service names escaped, `_escapeHtml` edge cases (`null`/`undefined`/`0`/`false`/special chars)

Run:
```
cd onyx-procurement && node --test test/ops/master-dashboard.test.js
# tests 33, pass 33, fail 0
```

---

## 12. Non-Destructive Guarantees (rule: לא מוחקים רק משדרגים ומגדלים)

- The module is strictly additive — no existing file was modified or deleted
- `dashboardJSON` and `generateMasterDashboard` are pure functions — they never mutate the input `signals` object
- Middleware never drops or alters the upstream data; it only reads
- `attach` is a no-op for falsy apps; it never throws
- Error paths degrade to empty dashboards rather than blanking pages
- Auto-refresh uses HTML `<meta>` (no JS state to lose across refresh)

---

## 13. Future Upgrades (never delete, only grow)

Ideas surfaced during build, deferred to follow-up agents — none of these require modifying existing code:

- Server-Sent-Events endpoint for sub-30s refresh (new route, reuses `dashboardJSON`)
- Language toggle cookie (layer on top of current `dir="rtl"` default)
- Historical trend window selector (7d/30d/90d) passed as query param
- Export as PNG via `<canvas>` from the SVG (client-side only, opt-in)
- Drill-down per-service detail pages (separate middleware mounts)
- Dark/light theme switch via CSS custom properties (current theme unchanged, new palette added)

---

**Agent X-96 delivered. 33/33 tests green. Zero external deps. Rule honoured.**
