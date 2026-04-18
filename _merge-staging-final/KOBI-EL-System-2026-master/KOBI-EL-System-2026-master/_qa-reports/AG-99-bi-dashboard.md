# AG-99 — BI Dashboard (pure-SVG charts)

**Agent:** 99
**Date:** 2026-04-11
**Scope:** Business-Intelligence dashboard component for Techno-Kol Uzi mega-ERP.
**Status:** Delivered

---

## Summary

Delivered a self-contained React component (`BIDashboard.jsx`) that renders six
interactive financial charts using **only inline SVG** — zero chart libraries
(no recharts, no chart.js, no d3, no nivo, no victory, no plotly, no apex).
The only runtime import is `react`. All drawing is done with raw `<path>`,
`<rect>`, `<circle>`, `<line>`, and `<text>` elements inside `<svg viewBox>`
containers so every chart is fully responsive without a resize observer.

The component is Hebrew-first, right-to-left, bilingual (Hebrew title + short
English subtitle), and locked to the Palantir dark palette
(`#0b0d10` background, `#13171c` panel, `#4a9eff` accent). It exposes a clean
props contract and delegates server-side concerns (PDF export, drill-down
routing, period/date-range state) to the host via callbacks.

**Files created**

- `payroll-autonomous/src/components/BIDashboard.jsx` — ~1,030 LOC, six charts + shell
- `payroll-autonomous/src/components/BIDashboard.test.jsx` — smoke tests + mock dataset + SSR fallback
- `_qa-reports/AG-99-bi-dashboard.md` — this report

No existing files were modified or deleted. The component is importable via
`import BIDashboard from './components/BIDashboard.jsx'`.

---

## The six charts

| # | Chart | Technique | Interactive? |
|---|---|---|---|
| 1 | **מגמת הכנסות** (Revenue trend) | `<path>` line + area gradient + point hit-circles | hover tooltip + click drill-down |
| 2 | **הכנסות מול הוצאות** (Revenue vs expenses) | Grouped `<rect>` bars — two series per period | hover tooltip on each bar |
| 3 | **10 לקוחות מובילים** (Top 10 clients) | Horizontal `<rect>` bars, rotated palette colors, value labels inside | hover + click |
| 4 | **תזרים מזומנים** (Cash flow waterfall) | Floating `<rect>` bars with running-balance connectors | hover + click |
| 5 | **עלויות עובדים** (Employee costs) | Donut built from SVG arc path (`M/A/L/Z`) + inner center total | hover + click |
| 6 | **גיול חובות** (AR aging) | Stacked `<rect>` bars (current / 30d / 60d / 90d+) | hover + click |

Every chart:

- Accepts its data slice off the `data` prop (`data.revenue_trend`, etc.)
- Calls `onDrillDown(chartName, dataPoint)` when a segment is clicked
- Emits a tooltip with formatted `₪ he-IL` values on hover
- Has an **empty state** when its slice is empty or missing
- Uses a shared `niceTicks(min, max, count)` helper to compute round-number axis ticks
- Renders a bilingual `<title>`/`<desc>` inside the SVG plus `role="img"` and `aria-label` on the container

---

## Props contract

```js
<BIDashboard
  data={{
    revenue_trend:    [{ label, value }],
    revenue_expenses: [{ label, revenue, expenses }],
    top_clients:      [{ name, value }],
    cash_flow:        [{ label, value, type: 'start'|'in'|'out'|'end' }],
    employee_costs:   [{ label, value }],
    ar_aging:         [{ label, current, d30, d60, d90 }],
  }}
  period="month|quarter|ytd"
  dateRange={{ from: '2026-01-01', to: '2026-04-11' }}
  loading={false}
  onPeriodChange={(p) => ...}
  onDateRangeChange={({from,to}) => ...}
  onDrillDown={(chart, dataPoint) => ...}
  onExportPDF={() => ...}
/>
```

Any missing slice renders its own per-chart empty state. If **all** slices
are empty (and `loading === false`), the dashboard body collapses into a
single empty-state card with the message "אין נתונים להצגה בטווח הנבחר".

---

## Top bar

- **Title row** — "דשבורד BI — בינה עסקית" in Hebrew with the English
  subtitle "Business Intelligence Dashboard · Techno-Kol"
- **Period segmented control** — חודש / רבעון / מתחילת השנה. Active state is
  highlighted with the Palantir accent color. Each click fires
  `onPeriodChange('month'|'quarter'|'ytd')`. The control uses
  `role="group"` and `aria-pressed` on each option.
- **Date range picker** — two native `<input type="date">` fields labelled
  "מ־" / "עד". Changes call `onDateRangeChange({ from, to })`.
- **Export PDF button** — calls `onExportPDF()`. The component does **not**
  generate the PDF itself; PDF rendering is a server-side concern (see
  integration notes below).

---

## Loading skeleton

When `loading === true`, every chart card is replaced with a `ChartSkeleton`
that emits a shimmering bar via a scoped `@keyframes bi-shimmer` animation
injected inside the component's `<style>` tag. The skeleton carries
`aria-busy="true"` and `aria-live="polite"`.

---

## Empty state

`EmptyState` renders a dim placeholder with the glyph `∅`, a Hebrew message,
and the English "No data available" subtitle. It is marked `role="status"`.
Each chart renders its own empty state when its data slice is missing or
empty, so partial failures don't blank the whole dashboard.

---

## Tooltip implementation

Tooltips are a single shared React state per chart (`useTooltip` hook). On
hover, the component stores `{ x, y, title, lines }` using `clientX/clientY`
and renders a fixed-position `<div>` via React — **not** an SVG element — so
the tooltip is never clipped by the SVG viewBox and can extend beyond the
chart bounds. Tooltip text is Hebrew and all values are formatted with
`fmtILS` / `fmtILSCompact` (both use `he-IL` locale).

---

## Palette lock-in

All colors are constants in the exported `BI_THEME` object:

- `bg: '#0b0d10'`
- `panel: '#13171c'`
- `panel2: '#1a2028'`
- `border: '#2a3340'`
- `text: '#e6edf3'`
- `textDim: '#8b96a5'`
- `accent: '#4a9eff'`
- `success: '#3fb950'`
- `warning: '#d29922'`
- `danger: '#f85149'`
- `palette: [10 distinct chart colors, rotated for donut / horizontal bars]`

No hex literals are scattered through JSX — every style references the theme
constant, so a theme migration is a one-file change.

---

## Accessibility

| Area | Implementation |
|---|---|
| Language / direction | Root `<div>` has `dir="rtl"`, topbar is `role="toolbar"`, `aria-label="בקרת דשבורד"` |
| Chart semantics | Every `<svg>` has `role="img"`, `aria-label` in Hebrew, plus `<title>`/`<desc>` elements for screen readers |
| Interactive elements | Every hover target is `<rect>`/`<circle>`/`<path>` with `tabIndex={0}` + `aria-label="label: value"` and a keyboard `onKeyDown` handler on line-chart points |
| Card regions | Each chart card is `role="region"` with `aria-label={title}` |
| Loading | Skeleton carries `aria-busy="true"` + `aria-live="polite"` |
| Empty state | `role="status"` (polite live region) |
| Buttons | Period segmented buttons use `aria-pressed`; export button has `aria-label="ייצוא דשבורד ל-PDF"` |
| Date inputs | Each `<input type="date">` has its own `aria-label` |
| Color contrast | Text `#e6edf3` on `#0b0d10` (≈14:1, WCAG AAA). Dim text `#8b96a5` on panel `#13171c` (≈6.3:1, WCAG AA) |
| Color-only info | Legends include both a color swatch **and** a text label, so the chart is readable without color |

### Known limitations

- Donut segments <3% of total produce very thin slices — the legend and
  tooltip still surface the exact value, but the slice may be hard to click.
- Native `<input type="date">` uses the browser-styled calendar, not a
  Palantir-dark popup. Accepted trade-off vs. pulling in a date-picker
  library (would violate the "no new deps" rule).

---

## RTL handling

- The root sets `dir="rtl"`. All text flows RTL naturally.
- In charts with an x-axis (line, grouped bars, waterfall, AR aging), the
  first data point is drawn on the **right** edge of the plot area and
  subsequent points progress leftward — this matches Hebrew reading order.
  The math is `x(i) = margin.left + iw - i * xStep` (or equivalent for
  bars).
- Y-axis labels remain on the left of the plot area (standard for charts
  worldwide) — only the x-axis direction flips for RTL.
- Value labels on the horizontal bar chart sit to the **right** of each bar
  (where the bar starts) and client names to the **left** (where the text
  extends) — this preserves Hebrew natural flow.
- Legend uses `display: flex; flex-wrap: wrap` without an explicit
  direction override so it inherits the document's RTL flow.
- Swatches use `margin-inline-end` (logical property) so the swatch ends up
  on the reading-order-correct side.

---

## Responsive behavior

- Every `<svg>` uses a fixed `viewBox` (e.g. `0 0 620 260`) plus
  `preserveAspectRatio="xMidYMid meet"` and `width: 100%`. The chart scales
  with its parent card without any resize observer.
- The grid uses `grid-template-columns: repeat(12, 1fr)` with `span-4`,
  `span-6`, `span-8`, `span-12` utility classes. A single `@media (max-width: 900px)`
  rule collapses all spans to 12 for mobile.
- The topbar uses `flex-wrap: wrap` so on narrow viewports the period
  selector + date range + export button stack vertically.

---

## Test coverage

`BIDashboard.test.jsx` is **framework-agnostic** — it detects Vitest/Jest
globals at import time and registers a full test suite when they're present,
otherwise it falls back to a `react-dom/server` render check that runs under
plain `node`.

### With Vitest/Jest + @testing-library/react

1. Topbar renders the Hebrew title, English subtitle, all three period buttons, and the export button
2. All 6 chart cards render with mock data (assertion on `querySelectorAll('svg').length >= 6`)
3. Empty `data` prop triggers the global empty state
4. `loading` prop renders shimmer skeletons
5. Clicking "רבעון" fires `onPeriodChange('quarter')`
6. Clicking the export button fires `onExportPDF()`
7. Root element has `dir="rtl"`
8. `fmtILS` includes the `₪` sign
9. `fmtILSCompact` produces `M`/`K` short form for large numbers
10. `niceTicks` returns a monotonically increasing array
11. `BI_THEME` exposes the canonical Palantir colors
12. Each of the 6 chart subcomponents renders its own empty state when fed `[]`
13. `EmptyState` and `ChartSkeleton` render without errors

### Fallback (no test framework)

A `react-dom/server#renderToStaticMarkup` sanity check that verifies the
dashboard emits a string containing all six Hebrew chart titles plus
"דשבורד BI" and "Business Intelligence Dashboard".

### Mock dataset

The test file exports `mockBIData` — a fully populated dataset with
realistic Hebrew client names ("בנק הפועלים", "שופרסל בע"מ", "תנובה מרכז
שיווק", …), month labels (ינואר … דצמבר), and shekel values in the
400K – 1.3M range. Other files can import it for Storybook / dev preview.

---

## Verification performed

1. **No chart libraries**
   - Grepped the component file for `import ... from '...'` — only `react` is imported.
   - Esbuild built the file with `--format=esm`; the output bundle references
     only `React.createElement` and has no external module references.
2. **JSX parses cleanly**
   - `npx esbuild BIDashboard.jsx --loader:.jsx=jsx --format=esm` exits 0.
   - `npx esbuild BIDashboard.test.jsx --loader:.jsx=jsx --format=esm` exits 0
     (with a harmless warning about the `require('@testing-library/react')`
     line that only runs under a CJS-interop test runner).
3. **Palette lock-in** — all required colors (`#0b0d10`, `#13171c`, `#4a9eff`)
   are present in the `BI_THEME` export and referenced by name throughout.
4. **Palantir dark only** — no light-mode fallback, no `prefers-color-scheme`
   query, no theme prop.
5. **RTL flag** — `data-testid="bi-dashboard"` element has `dir="rtl"`.

---

## Integration notes

To wire the component into `App.jsx`:

```jsx
import BIDashboard from './components/BIDashboard.jsx';

async function fetchBIData(period, dateRange) {
  const qs = new URLSearchParams({ period, from: dateRange.from, to: dateRange.to });
  const res = await fetch(`${API_URL}/api/bi/dashboard?${qs}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function exportDashboardPDF(period, dateRange) {
  const res = await fetch(`${API_URL}/api/bi/dashboard/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify({ period, ...dateRange }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

<BIDashboard
  data={biData}
  period={period}
  dateRange={range}
  loading={loading}
  onPeriodChange={setPeriod}
  onDateRangeChange={setRange}
  onDrillDown={(chart, dp) => router.push(`/bi/${chart}?id=${dp.id || dp.label}`)}
  onExportPDF={() => exportDashboardPDF(period, range)}
/>
```

The backend endpoints (`/api/bi/dashboard`, `/api/bi/dashboard/pdf`) are out
of scope for this task and should be implemented by the server agent.

---

## Compliance with rules

- **Never delete** — no existing files touched; only three new files added.
- **Hebrew RTL bilingual** — root is `dir="rtl"`, all titles Hebrew, every
  chart also carries an English subtitle and English `<desc>`.
- **Palantir dark exclusively** — hardcoded to `BI_THEME` (`#0b0d10` /
  `#13171c` / `#4a9eff`). No light mode, no theme prop.
- **Zero chart libraries** — only `react` is imported. All charts are pure
  inline SVG (`<path>`, `<rect>`, `<circle>`, `<line>`, `<text>`). Verified
  with esbuild bundle output.
- **No new deps** — uses only `react` (already in `package.json`). Test file
  uses `@testing-library/react` **lazily via `require()`**, guarded behind a
  `typeof describe === 'function'` check so it's a no-op if the dep is not
  installed.
