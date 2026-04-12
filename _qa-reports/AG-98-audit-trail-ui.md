# AG-98 — Audit Trail UI Component

**Agent:** 98
**Date:** 2026-04-11
**Scope:** Read-only audit trail timeline component for Techno-Kol Uzi mega-ERP.
**Status:** Delivered

---

## Summary

Delivered a self-contained React component (`AuditTrail.jsx`) that renders a read-only timeline of every system action in the mega-ERP. The component is purposefully thin — zero external UI libraries, zero CSS frameworks, zero state managers — every style is inline and every behavior is local React state. It is Hebrew-first, right-to-left, and locked to the Palantir dark palette (`#0b0d10` background, `#13171c` panel, `#4a9eff` accent) with no light-mode fallback.

The component talks to the backend through a single `fetchEvents` prop, defaulting to a built-in mock fetcher that returns 500 synthetic rows over a simulated 10,234-row corpus. The mock fetcher mirrors the expected `/api/audit/events` query-string contract (`from, to, user, action, resource, search, page, limit`) so the backend team can drop in the real endpoint without touching the UI.

**Files created**

- `payroll-autonomous/src/components/AuditTrail.jsx` — 1,030+ LOC component
- `payroll-autonomous/src/components/AuditTrail.test.jsx` — framework-agnostic smoke tests (runs under vitest, jest, or `node --test`)
- `_qa-reports/AG-98-audit-trail-ui.md` — this report

No existing files were modified or deleted. The component is importable via
`import AuditTrail from './components/AuditTrail.jsx'`.

---

## Features

### Data & API contract
- `fetchEvents({from,to,user,action,resource,search,page,limit})` returns `{ events, total, page }`.
- Named export `defaultMockFetch` is used when no `fetchEvents` prop is supplied, so the component works stand-alone in Storybook/dev preview.
- `onExport(filters)` is awaited when present; otherwise the component builds a UTF-8 BOM CSV client-side and triggers a `Blob` download.
- `theme` prop reserved (default `"dark"`) — the Palantir dark palette is canonical; other themes are intentionally not implemented.

### Filters
- **Date range** — HTML5 `<input type="date">` for both `from` and `to`.
- **User** — free-text substring match on actor name or ת.ז last-4.
- **Action type** — dropdown with `create / update / delete / view / all`.
- **Resource** — dropdown with `invoice / wage-slip / employee / report / config / all`.
- **Full-text search** — HTML5 `type="search"` field that the mock fetcher applies against the JSON-stringified event.
- Two explicit buttons: `החל` (apply) and `איפוס` (reset). Filters are **not** applied on every keystroke — the user clicks apply, which keeps the UI predictable for large corpora.

### Virtual scrolling
- Custom `useVirtual` hook with binary-search over a per-row offset table.
- Collapsed rows are 56px; expanded rows are 440px — the offset table rebuilds whenever the expanded set changes, so scroll position math stays correct when rows expand mid-list.
- Overscan of 6 rows in both directions.
- Tested at `events.length = 500` rows returned per page; the architecture scales to 10k+ because only the visible slice is ever mounted.

### Row expansion & diff view
- Click a row (or press Enter/Space) to expand.
- Expanded panel shows: actor, ת.ז last-4, Jerusalem timestamp, IP, user-agent, severity label.
- Side-by-side JSON diff: `before` (amber header) vs `after` (green header). Monospace font, LTR-locked inside the pre blocks so JSON keys stay readable even though the rest of the UI is RTL.
- `null` values show as `— (null) —` to visually distinguish "not present" from "empty object".

### Export to CSV
- `buildCSV(events)` emits a UTF-8 BOM (`\uFEFF`) so Excel on Windows opens the file as UTF-8 (critical for Hebrew).
- Header row: `id, timestamp_jerusalem, actor_name, actor_id_last4, action_type, resource_type, resource_id, severity, ip, user_agent, message`.
- Every cell is double-quoted and inner newlines are collapsed to spaces to keep the CSV single-line-per-row.
- Download file name: `audit-trail-<epoch>.csv`.
- If the caller supplies `onExport`, the component delegates to it (so the backend can stream large exports).

### Severity color coding
- `info` — `#4a9eff` (Palantir blue)
- `warning` — `#f5a623` (amber)
- `critical` — `#ff5c5c` (red)
- A 3px right-border strip and a timeline dot on every row reflect the severity — double encoding for users who are color-blind-adjacent.

### Actor display
- Shows full Hebrew name plus masked ת.ז: `קובי אלבז (***1234)`.
- Never shows the full nine-digit number in the collapsed row — only in the expanded `ת.ז סיום` cell, and even there it's masked to the last 4.

### Jerusalem time
- `fmtJerusalem` uses `Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem' })` so DST transitions and IDF winter/summer time are handled by the platform, not by us.
- Timestamps are displayed in monospace LTR inside the row to preserve column alignment.

### Inline Hebrew highlighting
- The `highlightHebrew` helper scans strings with the `/[\u0590-\u05FF]+/g` Unicode range and wraps each Hebrew run in a `<span>` colored with `#ffd76a` at 600 weight. This makes Hebrew tokens pop out of otherwise-English log lines — useful for spotting user-entered Hebrew text in automated messages.

### Loading / empty / error states
- **Loading** — skeleton of 8 shimmering bars with a `@keyframes auditShimmer` animation injected inline (no global CSS). `aria-busy="true"` for screen readers.
- **Empty** — "אין רישומי ביקורת" with a circle glyph and a hint line. `role="status"`.
- **Error** — red warning glyph, error message rendered LTR (so it's readable for typical stack traces), and an explicit "נסה שוב" retry button. `role="alert"`.

### Pagination footer
- Shows `מציג N מתוך TOTAL` and "עמוד X / Y".
- Prev/Next buttons are disabled at boundaries and visually dimmed (Palantir convention).

---

## Styling notes

- **Palette lock-in** — all colors are constants in the `PALANTIR_DARK` object. No hex literals are scattered through the JSX; every style references the constant. This makes a theme migration a one-file change.
- **Inline styles everywhere** — every `style={}` is a plain JS object. No CSS modules, no `<link>`, no className strings. The only global CSS emitted is a single `<style>` tag containing the `auditShimmer` keyframes, which is scoped to the skeleton component.
- **Font stack** — `"Segoe UI", "Arial Hebrew", Arial, Tahoma, sans-serif` for Hebrew, plus a monospace stack for timestamps / JSON / user-agent strings. All stacks are OS-native so no web font download is needed.
- **RTL handling** — the root element sets `dir="rtl"` and `lang="he"`. JSON diff pre-blocks override to `direction: 'ltr'` because JSON is LTR by nature. Column alignment (`minWidth`, `textAlign: 'left'` for the timestamp column) is explicit so the RTL flow doesn't break the grid.
- **Spacing rhythm** — 14px outer padding, 8px between panels, 6px corner radius throughout. Matches the `App.jsx` theme constants already in the repo (`theme.panel = '#13171c'`).
- **No layout libraries** — the filter bar uses `display: flex; flex-wrap: wrap` and the expanded details use `display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`. Responsive without media queries.
- **Severity strip** — a 3px `borderRight` on every row matches Palantir Foundry's "context lens" visual language, where severity bleeds into the row chrome rather than sitting inside a pill.

---

## Accessibility

| Area | Implementation |
|---|---|
| Language | Root `<div>` has `lang="he"` and `dir="rtl"` so screen readers pronounce content correctly |
| Landmarks | `role="application"` on root, `role="region"` with `aria-label` on filter bar and timeline, `role="list"` on scroller |
| Row semantics | Each row is `role="row"` with `aria-expanded={true/false}` and `aria-label="שורת רישום"` |
| Loading | `aria-busy="true"` + `aria-label="טוען רישומים…"` on skeleton |
| Empty | `role="status"` (polite live region) |
| Error | `role="alert"` (assertive live region) + explicit "נסה שוב" button |
| Keyboard | Container captures `keydown`: ArrowUp/ArrowDown move focus, Home/End jump, Enter/Space toggle expand. `tabIndex={0}` only on the focused row so Tab order isn't polluted |
| Form labels | Every `<input>` and `<select>` is wrapped in a `<label>` and also carries an `aria-label` — redundant but defensive |
| Buttons | All buttons have `aria-label` and visible text; disabled states use the `disabled` attribute plus reduced opacity |
| Color contrast | Text is `#e6edf3` on `#0b0d10` background (contrast ratio ≈ 14:1, passes WCAG AAA). Dim text `#8b95a5` on panel `#13171c` is ≈ 6.3:1 (passes WCAG AA) |
| Color-only information | Severity is encoded by color **and** by a border strip **and** by a text label in the expanded view — no information is lost if colors are unavailable |
| Screen reader text | Decorative glyphs (timeline dot, chevron, empty circle, warning triangle) are marked `aria-hidden="true"` |

### Known limitations
- The virtual scroller relies on pointer/keyboard input; JAWS/NVDA users who navigate by virtual cursor may not see rows outside the rendered slice. This is acceptable for a 10k-row audit log — the filter bar is the primary navigation tool for assistive tech users.
- Date inputs use native `<input type="date">`, which means the calendar popup is browser-styled (not Palantir-dark). Accepted as a trade-off vs pulling in a date-picker library.

---

## Test coverage

`AuditTrail.test.jsx` contains 12 smoke tests covering:

1. Palantir theme constants match the brief (`#0b0d10 / #13171c / #4a9eff`)
2. Hebrew labels are present and non-empty
3. `severityColor` dispatches correctly (info / warning / critical / fallback)
4. `severityLabel` returns Hebrew text
5. `fmtJerusalem` formats a valid ISO timestamp and includes the year
6. `highlightHebrew` passes through plain ASCII unchanged
7. `highlightHebrew` returns React parts for Hebrew strings
8. `buildCSV` emits the UTF-8 BOM, header row, and preserves Hebrew actor names
9. `defaultMockFetch` returns the `{events,total,page}` shape
10. `defaultMockFetch` filters by action type
11. `AuditTrail` SSR-renders a string containing the Hebrew title and `dir="rtl"`
12. `AuditTrail` mounts without throwing when given an empty fetcher

The test file is **framework-agnostic**: it detects vitest/jest globals at runtime and registers tests via `describe/it`, otherwise it falls back to a tiny standalone runner so `node --test` or `node src/components/AuditTrail.test.jsx` works too. No JSDOM is required because the component is exercised through `react-dom/server#renderToString`.

---

## Integration notes

To wire the component into `App.jsx`:

```jsx
import AuditTrail from './components/AuditTrail.jsx';

async function fetchAuditEvents(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}/api/audit/events?${qs}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

<AuditTrail fetchEvents={fetchAuditEvents} />
```

No other wiring is needed. The component is self-contained.

---

## Compliance with rules

- **Never delete** — no existing files touched.
- **Hebrew RTL bilingual** — root is `dir="rtl" lang="he"`, labels are Hebrew, helper text includes English subtitles where useful.
- **Palantir dark exclusively** — hardcoded to `PALANTIR_DARK` palette; `theme` prop accepted but ignored.
- **No external UI libs** — only `react` and `react-dom/server` (already in `package.json`). Zero new dependencies.
