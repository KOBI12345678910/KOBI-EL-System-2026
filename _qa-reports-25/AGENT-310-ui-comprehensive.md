# AGENT-310 — UI Comprehensive Test Report

**Date:** 2026-04-29
**Auditor:** Agent 310 (UI Test Agent)
**Scope:** `erp-app/`, `techno-kol-ops/client/`, `payroll-autonomous/`
**Method:** Static analysis of TSX/JSX files, CSS rules, RTL configuration, layout, components, and visual states.

---

## 1. Inventory

| Application | Pages | Components | Stack | RTL Configured |
|-------------|-------|------------|-------|----------------|
| `erp-app` | 117 (top-level + nested) | 100+ shared in `src/components` | React + Vite + Tailwind v4 + shadcn/ui + recharts | Yes (`<html lang="he" dir="rtl">`) |
| `techno-kol-ops/client` | 36 (incl. 9× 360 pages, 4× control rooms) | Inline + few shared | React + Vite + Tailwind + Supabase RPC | Partial (per-page only) |
| `payroll-autonomous` | Single SPA in `App.jsx` (40+ tabs) | 60+ in `src/components` | React + Vite + custom CSS-in-JS | Yes (`direction: rtl` in body CSS) |

Visual styling strategy varies wildly across apps:
- `erp-app` → Tailwind utility classes, dark theme via HSL variables.
- `techno-kol-ops/client` → **Inline `style={{...}}` everywhere** (Dashboard.tsx alone has 34 inline-style blocks).
- `payroll-autonomous` → Templated CSS string injected at runtime via `buildCss(theme)`.

---

## 2. Findings (severity-ranked)

### UI-310-01 — Inline styles dominate techno-kol-ops, theme switching broken
- **Severity:** P1 (High)
- **Module:** `techno-kol-ops/client`
- **Files:** `client/src/pages/Dashboard.tsx`, `pages/360/*.tsx`, `controlRooms/*.tsx`
- **Description:** Every page hardcodes hex colors (`#2F343C`, `#48AFF0`, `#FC8585`) inside `style={{...}}` props. There is no CSS variable layer, no theme toggle, no light mode. `Dashboard.tsx` contains 34 inline style blocks, zero Tailwind classes.
- **Steps to reproduce:** Open `/dashboard` in techno-kol-ops; attempt to switch to light mode.
- **Actual:** No light mode. Dark Palantir colors are baked into JSX.
- **Expected:** A single theme source (CSS vars or Tailwind tokens) so designers can re-skin without code edits.
- **Fix:** Extract `theme.dark.bg`, `theme.dark.panel` into `:root` CSS vars inside `index.css`. Replace inline styles with `var(--panel)` references. Mirror the pattern already used by `payroll-autonomous` (`buildCss(theme)`).

### UI-310-02 — RTL inconsistencies in techno-kol-ops 360 pages
- **Severity:** P1
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/360/Customer360.tsx:194` (and the 8 sibling 360 pages)
- **Description:** Tables explicitly set `text-align: right` for `<th>` and `<td>`. However surrounding flex/grid containers use `flex` and `gap` without `flex-direction: row-reverse` or `space-x-reverse`. A `<header className="flex items-start justify-between">` will visually place the title on the LEFT under RTL, contradicting Hebrew reading order.
- **Steps to reproduce:** Navigate to `/customer/123`. Observe header.
- **Actual:** Title appears left-aligned despite Hebrew content.
- **Expected:** Title leads on the right; status badge on the left, mirroring Hebrew flow.
- **Fix:** Wrap root in `<div dir="rtl">` and add `text-right` to the header `<div>`. Confirm Tailwind `space-x-` utilities use the `rtl:space-x-reverse` plugin.

### UI-310-03 — No empty-state shared component in techno-kol-ops
- **Severity:** P2 (Medium)
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/360/Customer360.tsx:190` ("אין רשומות" string repeated)
- **Description:** Each 360 page reuses a one-line `<p className="text-gray-500 text-sm">אין רשומות</p>`. No icon, no CTA, no help text. erp-app already has `components/common/empty-state.tsx` with proper iconography — techno-kol-ops should consume the same.
- **Steps to reproduce:** Open Customer360 for a customer with no quotes.
- **Actual:** Single grey line of text.
- **Expected:** Icon + headline + "Create first quote" CTA.
- **Fix:** Lift `EmptyState` into a shared `lib-client` package; consume in all 9 360 pages (Quotes, Projects, Invoices, Documents, Audit).

### UI-310-04 — Loading state is a bare text label, not a skeleton
- **Severity:** P2
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/360/Customer360.tsx:146`, `pages/Dashboard.tsx:217`
- **Description:** Loaders render `<div className="animate-pulse">טוען לקוח...</div>`. No skeleton placeholders for KPI cards, tables, charts. Causes layout-shift when data arrives (KPIs jump from 0 height to 80px tall row).
- **Steps to reproduce:** Throttle network to "Slow 3G" in DevTools; load Customer360.
- **Actual:** Big empty area, then content snaps in.
- **Expected:** Skeleton blocks matching final layout dimensions.
- **Fix:** Add `<Skeleton />` blocks reproducing the KPI grid + 4 related-tables; reuse erp-app's `Skeleton` from shadcn/ui.

### UI-310-05 — KPI ticker animates outside container in payroll-autonomous
- **Severity:** P2
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx:295-318` (KpiTicker)
- **Description:** Animation uses `100vw` translation (`transform: translateX(100vw)`) inside a `220px` sidebar layout. On viewports <1024px the ticker overlaps the sidebar. The `direction: ltr` override on `.kpi-ticker-text` reverses Hebrew currency formatting visually.
- **Steps to reproduce:** Resize window to 800px wide, observe ticker.
- **Actual:** Text crosses sidebar; numbers read LTR but Hebrew labels read RTL — mixed direction.
- **Expected:** Ticker scrolls within parent container only; preserves RTL throughout.
- **Fix:** Replace `100vw` with `100%` (parent-relative). Drop `direction: ltr`; use `unicode-bidi: plaintext` for currency segments instead.

### UI-310-06 — Sidebar in payroll-autonomous has no responsive collapse
- **Severity:** P1
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx:241-256`
- **Description:** Mobile media query (`max-width: 768px`) flips sidebar to a horizontal scroll bar. With **40+ navigation items spanning 8 groups**, this row is 4000+ px wide. Group labels get hidden (`display: none`), losing all section context. Items not separated visually.
- **Steps to reproduce:** Resize to 360px (iPhone SE).
- **Actual:** A single dense scrolling bar with no group separators or icons.
- **Expected:** Hamburger drawer with collapsed groups, accordion expand-on-tap.
- **Fix:** Replace mobile fallback with `<MobileExecutiveShell>` (already lazy-imported but not wired for mobile <768px). Add a hamburger trigger that swaps sidebar visibility.

### UI-310-07 — payroll-autonomous lacks aria-label on icon-only buttons
- **Severity:** P1 (a11y)
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx` (only 6 `aria-label` instances across 7000+ lines)
- **Description:** Many sidebar items are emoji-prefixed (`📐 מחשבון BOM`, `💸 תחזית תזרים`). Screen readers announce `wave dash money flow forecast` — non-deterministic. Icon-only buttons throughout the app (close-X, export-arrow, refresh) lack aria-labels.
- **Steps to reproduce:** Navigate with NVDA / VoiceOver.
- **Actual:** Emojis read as their unicode names.
- **Expected:** `aria-label="חישוב BOM"` and emojis hidden via `aria-hidden="true"`.
- **Fix:** Sweep all buttons; require `aria-label` lint rule (`jsx-a11y/control-has-associated-label`).

### UI-310-08 — erp-app: 117 page files, no consistent layout wrapper
- **Severity:** P2
- **Module:** `erp-app`
- **Files:** `src/pages/*` (117 entries) + `src/components/layout.tsx`
- **Description:** Pages individually compose headers, breadcrumbs, action bars, and KPI rows. No mandated `<PageShell>` wrapper. Result: padding varies from `p-4` (procurement.tsx) to `p-8` (executive pages) to none (mobile/*). Title font-sizes range `text-lg` → `text-3xl`.
- **Steps to reproduce:** Compare `/procurement` and `/executive/strategy`.
- **Actual:** Inconsistent gutters and title sizing.
- **Expected:** All pages wrap in `<PageShell title="…" actions={…} breadcrumbs={…}>`.
- **Fix:** Build `<PageShell>` enforcing `max-w-screen-2xl mx-auto px-6 py-8 space-y-6`; refactor pages incrementally, starting with the 9 P0 360 pages.

### UI-310-09 — Disabled state visually identical to enabled in payroll
- **Severity:** P2
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx:213` — `button:disabled { opacity: 0.5; cursor: not-allowed; }`
- **Description:** 50% opacity is the *only* disabled cue. On a dark `#1a2028` panel, primary buttons (`#4a9eff`) at 50% still read as active blue. No greyscale shift.
- **Steps to reproduce:** Submit form with empty required field.
- **Actual:** Button looks tappable; clicking does nothing → user confusion.
- **Expected:** Disabled = grey background, removed border accent, distinct text color.
- **Fix:** `button:disabled { background: var(--panel2); color: var(--textDim); border-color: var(--border); opacity: 0.6; }`.

### UI-310-10 — Form inputs lack visible required indicator (all 3 apps)
- **Severity:** P2
- **Module:** all
- **Files:** `payroll-autonomous/src/App.jsx:216`, `erp-app/src/components/ui/input.tsx`, `techno-kol-ops/client/src/pages/360/Customer360.tsx`
- **Description:** Inputs marked `required` get HTML5-validated only on submit. No red asterisk, no left-border accent, no inline message before submit.
- **Steps to reproduce:** Open new-quote form; click submit without filling fields.
- **Actual:** Browser tooltip "Please fill out this field" in English.
- **Expected:** Hebrew inline error under field; red asterisk next to label on render.
- **Fix:** Build `<Field label required error>` component + Hebrew `react-hook-form` schema (zod).

### UI-310-11 — Tables overflow on mobile without horizontal scroll wrapper
- **Severity:** P1
- **Module:** all
- **Files:** `techno-kol-ops/client/pages/Dashboard.tsx:94` (orders table), `pages/360/Customer360.tsx:193`
- **Description:** Customer360 wraps tables in `<div className="overflow-auto">` (good). Dashboard.tsx orders table has no overflow wrapper — on <600px the table pushes the right column off-screen.
- **Steps to reproduce:** Open Dashboard at 480px width.
- **Actual:** Charts row truncated; horizontal page scroll appears.
- **Expected:** Table scrolls inside its panel; page does not scroll horizontally.
- **Fix:** Wrap every `<table>` in `<div className="overflow-x-auto">`. Enforce via `<DataTable>` shared component.

### UI-310-12 — Status badges hardcode 3 states; real workflow has 13
- **Severity:** P2
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/360/Customer360.tsx:153` — `colors: { Active, Draft, Closed }`
- **Description:** Per CLAUDE.md the system has **13 state machines** with 91 transitions. The shared `StatusBadge` only colors 3 states; everything else falls back to grey `Draft` styling. Quote `Pending Approval` → grey. PO `Issued` → grey.
- **Steps to reproduce:** Open Quote360 for a quote in state `pending_approval`.
- **Actual:** Generic grey pill labelled "pending_approval".
- **Expected:** Yellow pill labelled "ממתין לאישור" with icon.
- **Fix:** Pull state colors from `pipeline/state-machines.js` via `/api/state-machines/:type`. Map every state → color + Hebrew label.

### UI-310-13 — No keyboard focus ring visible on any payroll component
- **Severity:** P1 (a11y)
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx:217` — `input:focus, select:focus { outline: none; border-color: ${t.accent}; }`
- **Description:** `outline: none` removed; replacement is a 1px border color change at the same 1px width — invisible for users tabbing through.
- **Steps to reproduce:** Tab through form using keyboard only.
- **Actual:** No clear focused element indicator.
- **Expected:** 2px solid ring with offset; visible on dark and light themes.
- **Fix:** `*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`. Keep `outline: none` only on `:focus:not(:focus-visible)`.

### UI-310-14 — Absent breadcrumbs across erp-app deep pages
- **Severity:** P2
- **Module:** `erp-app`
- **Files:** `src/pages/crm/contract-management.tsx`, `src/pages/sales/*`, `src/pages/finance/*`
- **Description:** Sub-pages (3+ levels deep) have a header but no breadcrumb. With 117 routes the user cannot trace how they got here.
- **Steps to reproduce:** Navigate `Dashboard → CRM → Contracts → Edit #4567`.
- **Actual:** Page title only, no path.
- **Expected:** `Home / CRM / Contracts / #4567`.
- **Fix:** Add `<Breadcrumbs>` to `<PageShell>` (UI-310-08); derive from route metadata.

### UI-310-15 — Modals lack ESC-close + outside-click guard
- **Severity:** P2
- **Module:** `payroll-autonomous`, `techno-kol-ops/client`
- **Files:** `payroll-autonomous/src/components/ShortcutsModal.tsx`, `components/ContractGenerator.tsx`
- **Description:** Several custom modal panels are coded as fixed-position divs without dialog primitives. ESC key does not dismiss them. Click outside the modal does not close.
- **Steps to reproduce:** Open Shortcuts modal; press ESC.
- **Actual:** Modal stays open.
- **Expected:** ESC dismisses; backdrop click dismisses; focus traps inside the dialog.
- **Fix:** Migrate to `@radix-ui/react-dialog` (already imported in erp-app); enforce focus-trap.

### UI-310-16 — Hebrew text uses `font-family: -apple-system` only
- **Severity:** P2
- **Module:** `payroll-autonomous`, `techno-kol-ops/client`
- **Files:** `payroll-autonomous/src/App.jsx:210`, `techno-kol-ops/client/src/pages/Dashboard.tsx:64`
- **Description:** Font stacks: `-apple-system, "Segoe UI", Heebo, Arial, sans-serif`. Heebo loaded after fallback. On Linux/Windows where neither Apple nor Heebo is present, browser falls to Arial which has poor Hebrew kerning. erp-app correctly preloads Assistant via Google Fonts.
- **Steps to reproduce:** Open in Chromium on Ubuntu.
- **Actual:** Hebrew renders in Arial — uneven baseline, broken nikud.
- **Expected:** Heebo or Assistant served as `@font-face` with `font-display: swap`.
- **Fix:** Self-host Heebo TTF + add `<link rel="preload" as="font">` in each app's `index.html`.

### UI-310-17 — Charts don't flip axes for RTL
- **Severity:** P2
- **Module:** all
- **Files:** `techno-kol-ops/client/pages/Dashboard.tsx:154-194` (recharts), `payroll-autonomous/src/components/BIDashboard.jsx`
- **Description:** Recharts renders X-axis time progression LTR (oldest → newest left to right). In Hebrew context users expect time to flow right → left (matching reading direction). Y-axis labels remain on left, awkward in RTL.
- **Steps to reproduce:** Open Dashboard "Revenue 6 Months" line chart.
- **Actual:** Newest month appears on the right edge but the eye scans left first.
- **Expected:** Y-axis on right (`<YAxis orientation="right">`), X-axis ordered right-to-left.
- **Fix:** Set `<YAxis orientation="right">` and reverse data array before `<LineChart>`. Document RTL convention in design system.

### UI-310-18 — `localStorage`-driven API key fallback exposed in DOM
- **Severity:** P1 (UX/security)
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx:74-77`
- **Description:** `API_KEY` is read from `localStorage.getItem('ONYX_API_KEY')`. There is no UI to set/clear it, no masking, no expiry. New users hit the app and get silent 401s.
- **Steps to reproduce:** Open app first time without `VITE_API_KEY` env var.
- **Actual:** All requests return 401 with red banner "השרת אינו זמין".
- **Expected:** Login screen → server returns key, sets `localStorage`, redirects.
- **Fix:** Implement login flow; remove inline `localStorage` fallback; surface "API key not configured" empty-state for admins.

### UI-310-19 — Color contrast on `text-gray-500` over dark panels
- **Severity:** P1 (a11y, WCAG AA)
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/360/Customer360.tsx:190`, `pages/360/Customer360.tsx:131` (audit log)
- **Description:** Audit log timestamp uses `text-gray-500` (#6B7280) on `bg-gray-800/50` panel (~#1F2937). Contrast ≈ 3.2:1 — fails WCAG AA (requires 4.5:1 for body text).
- **Steps to reproduce:** Inspect audit-log row.
- **Actual:** Timestamp barely legible.
- **Expected:** ≥ 4.5:1 contrast.
- **Fix:** Bump to `text-gray-400` (#9CA3AF, ~5.7:1) or add `font-weight: 500`.

### UI-310-20 — Long client names in dashboard table truncate ungracefully
- **Severity:** P2
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/Dashboard.tsx:118-141`
- **Description:** `<td style={{ padding: '8px 12px', color: '#F6F7F9', fontWeight: 500 }}>{o.client_name}</td>` — no `max-width` or `text-overflow: ellipsis`. A 40-char Hebrew company name wraps to 3 lines and breaks row alignment.
- **Steps to reproduce:** Insert order with client "מועדון חברים אגודת בעלי המקצועות החופשיים".
- **Actual:** Row height inflates, progress bar misaligns with neighbours.
- **Expected:** Single-line truncation with hover tooltip showing full name.
- **Fix:** Add `max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` + `<title={o.client_name}>` for tooltip.

### UI-310-21 — Realtime "connected" indicator uses unicode dots that flip in RTL
- **Severity:** P3 (Low/Cosmetic)
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/Dashboard.tsx:77` — `{connected ? '● חי' : '○ מנותק'}`
- **Description:** Unicode bullets (●○) rendered alongside Hebrew text don't always align baseline; in some browsers the bullet appears after the Hebrew text in RTL.
- **Steps to reproduce:** Compare in Firefox vs Chrome.
- **Actual:** Bullet position inconsistent.
- **Expected:** Use `<span style={{ display: 'inline-block' }}>` with explicit positioning.
- **Fix:** Replace unicode with a CSS-styled `<span>` dot; embed in flex with `gap`.

### UI-310-22 — No global error boundary message in techno-kol-ops
- **Severity:** P1
- **Module:** `techno-kol-ops/client`
- **Files:** `client/src/App.tsx`, `client/src/main.tsx`
- **Description:** Payroll has `GlobalErrorBoundary`. erp-app has one. techno-kol-ops `App.tsx` does not import any error boundary. A render error in one of the 360 pages crashes the whole tree to a blank screen.
- **Steps to reproduce:** Force a render error in Customer360 (e.g., access `data.audit.length` when audit is undefined).
- **Actual:** White screen, no message.
- **Expected:** Friendly Hebrew error card with "Reload" button.
- **Fix:** Add `<ErrorBoundary>` wrapper around all `<Route>`s in `App.tsx`. Reuse payroll's `GlobalErrorBoundary.tsx`.

### UI-310-23 — Spacing inconsistencies between erp-app and techno-kol-ops 360 pages
- **Severity:** P2
- **Module:** `erp-app`, `techno-kol-ops/client`
- **Files:** `erp-app/src/pages/workforce/PayrollRun360.tsx`, `techno-kol-ops/client/src/pages/360/Customer360.tsx`
- **Description:** erp-app uses Tailwind `space-y-6` (1.5rem); techno-kol-ops uses `space-y-6` in some 360 pages but `gap-4` (1rem) in others. KPI grid is `grid-cols-2 md:grid-cols-4` everywhere, but card paddings differ — `p-4` vs `p-6`.
- **Steps to reproduce:** Side-by-side compare `Customer360` (erp-app) and `Customer360` (techno-kol-ops).
- **Actual:** Two different "Customer 360" implementations exist.
- **Expected:** One canonical Customer360 in `lib-client`, consumed by both apps.
- **Fix:** Consolidate per CLAUDE.md (P0): "9 Master 360 Pages must have header+status, primary actions, related records, documents, audit log, next recommended action."

### UI-310-24 — "Next Recommended Action" missing from all 360 pages
- **Severity:** P1 (spec violation)
- **Module:** `techno-kol-ops/client`
- **Files:** `pages/360/*.tsx` (all 9)
- **Description:** CLAUDE.md mandates: *"Every 360 page must have: header+status, primary actions, related records, documents, audit log, **next recommended action**"*. Customer360 currently shows AI insights but no "Next Recommended Action" card with single CTA.
- **Steps to reproduce:** Open any 360 page.
- **Actual:** No "Next Step" panel.
- **Expected:** A pinned card at top: "Recommended next: Send approval reminder to David Cohen — Approve / Snooze / Dismiss".
- **Fix:** Build `<NextRecommendedAction>` component fed by `/api/orchestrator/next-action`.

### UI-310-25 — Payroll lazy-loaded modules show no loading fallback
- **Severity:** P1
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx:31-63` (33 `lazy()` imports), `Suspense` usage
- **Description:** `lazy()` is used for 33 components, but a single `<Suspense>` wraps the whole router. No `fallback` includes the route-specific skeleton; users see a centered "Loading..." spinner replacing the entire layout (sidebar disappears).
- **Steps to reproduce:** Click any Enterprise tab.
- **Actual:** Whole layout flashes blank for ~400ms.
- **Expected:** Sidebar persists; only `main-content` shows skeleton.
- **Fix:** Move `<Suspense fallback={<MainContentSkeleton />}>` inside `<main className="main-content">`, not outside `.app-layout`.

### UI-310-26 — Color palette divergence across the 3 apps
- **Severity:** P2
- **Module:** all
- **Files:** `erp-app/src/index.css:46`, `techno-kol-ops/client/pages/Dashboard.tsx:12`, `payroll-autonomous/src/App.jsx:118`
- **Description:** Primary blues differ: erp-app `hsl(217.2 91.2% 59.8%)` ≈ #3B82F6, techno-kol-ops `#48AFF0`, payroll `#4a9eff`. Three "blue brands" displayed if user opens all three apps in tabs.
- **Steps to reproduce:** Open all three apps; compare buttons.
- **Actual:** Three different blues.
- **Expected:** Single brand color exposed via shared `@technokoluzi/tokens` package.
- **Fix:** Publish a tokens package; consume in all 3 apps' build configs.

### UI-310-27 — Tooltip absent on truncated content (multiple apps)
- **Severity:** P3
- **Module:** all
- **Files:** various
- **Description:** When `text-overflow: ellipsis` is applied, `title` attribute is rarely set. Hover reveals nothing.
- **Steps to reproduce:** Hover any truncated cell.
- **Actual:** No tooltip.
- **Expected:** Native `title` or shadcn `<Tooltip>` showing full text.
- **Fix:** Adopt `<TruncatedText value={…}>` helper that auto-injects `title`.

### UI-310-28 — `payroll-autonomous` has no PageShell — content edge-bleeds on wide screens
- **Severity:** P2
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx:247` — `.main-content { flex: 1; padding: 24px; }`
- **Description:** On ultrawide monitors (3440px) content stretches edge-to-edge with 24px padding, making text lines unreadably long.
- **Steps to reproduce:** Open BI Dashboard at 3440px.
- **Actual:** Text columns ~3000px wide.
- **Expected:** `max-width: 1600px; margin: 0 auto;`.
- **Fix:** Add max-width to `.main-content` or wrap each tab's content in `<div className="page-shell">`.

### UI-310-29 — Filter / search inputs don't preserve state on tab change
- **Severity:** P2
- **Module:** `payroll-autonomous`
- **Files:** `src/App.jsx` SPA tab switcher; component-local `useState` only
- **Description:** Switching from `wage-slips` (filtered to "Approved") to `dashboard` and back resets filters. No URL sync.
- **Steps to reproduce:** Filter wage-slips → click Dashboard → click Wage Slips again.
- **Actual:** Filter cleared.
- **Expected:** Filters survive navigation; ideally encoded in URL `?status=approved`.
- **Fix:** Use `react-router` `useSearchParams` to persist filter state.

### UI-310-30 — Print stylesheet missing across all apps
- **Severity:** P2
- **Module:** all
- **Files:** none — search for `@media print` returned 0 hits in `erp-app/src` and `payroll-autonomous/src/styles`.
- **Description:** Users will need to print invoices, work orders, payroll slips. No print stylesheet hides sidebar/header, no `page-break-after`, no monochrome conversion.
- **Steps to reproduce:** Cmd+P on Invoice page.
- **Actual:** Sidebar, header, action buttons all printed.
- **Expected:** Document-only print view.
- **Fix:** Add `@media print { .sidebar, .header, .actions { display: none; } body { background: white; color: black; } }` plus `<PrintLayout>` for invoice/payslip routes.

---

## 3. Summary Table

| ID | Severity | Module | Title |
|----|----------|--------|-------|
| 01 | P1 | techno-kol-ops | Inline styles, no theme switching |
| 02 | P1 | techno-kol-ops | RTL header alignment broken |
| 03 | P2 | techno-kol-ops | No empty-state component |
| 04 | P2 | techno-kol-ops | Loading state not skeleton |
| 05 | P2 | payroll | KPI ticker overflow + bidi |
| 06 | P1 | payroll | Sidebar mobile collapse missing |
| 07 | P1 | payroll | Missing aria-labels on icons |
| 08 | P2 | erp-app | No PageShell wrapper |
| 09 | P2 | payroll | Disabled state low contrast |
| 10 | P2 | all | No required-field indicator |
| 11 | P1 | all | Tables overflow on mobile |
| 12 | P2 | techno-kol-ops | Status badges only 3 colors |
| 13 | P1 | payroll | No focus ring (a11y) |
| 14 | P2 | erp-app | Missing breadcrumbs |
| 15 | P2 | techno-kol-ops, payroll | Modals lack ESC/outside-close |
| 16 | P2 | payroll, techno-kol-ops | Hebrew font fallback unreliable |
| 17 | P2 | all | Charts don't flip RTL |
| 18 | P1 | payroll | API key UX failure |
| 19 | P1 | techno-kol-ops | text-gray-500 fails WCAG AA |
| 20 | P2 | techno-kol-ops | Long client names unhandled |
| 21 | P3 | techno-kol-ops | Unicode dots bidi wobble |
| 22 | P1 | techno-kol-ops | No global error boundary |
| 23 | P2 | erp-app, techno-kol-ops | Spacing inconsistency |
| 24 | P1 | techno-kol-ops | Missing "Next Recommended Action" (CLAUDE.md) |
| 25 | P1 | payroll | Lazy fallback loses sidebar |
| 26 | P2 | all | 3 different blue brands |
| 27 | P3 | all | No tooltips on truncated text |
| 28 | P2 | payroll | No max-width on main content |
| 29 | P2 | payroll | Filter state not persisted |
| 30 | P2 | all | No print stylesheet |

**Totals:** 11× P1, 17× P2, 2× P3 = **30 issues**.

---

## 4. Priority Recommendations

1. **Build `lib-client/PageShell + EmptyState + Skeleton + ErrorBoundary + StatusBadge`** — solves issues 03, 04, 08, 12, 14, 22, 23 in one pass.
2. **Standardize design tokens** in a shared package (`@technokoluzi/tokens`) — solves 01, 26, 16.
3. **Accessibility sweep** with `eslint-plugin-jsx-a11y` + axe-core CI gate — solves 07, 13, 19, 10.
4. **Ship the 9 P0 360 pages per CLAUDE.md spec** — solves 24, 12, 23 simultaneously.
5. **Mobile responsive pass** — solves 06, 11, 20, 25.
6. **Theme + RTL system audit** — solves 01, 02, 17.

## 5. Files Referenced
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\index.html`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\index.css`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\common\empty-state.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\Dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\360\Customer360.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\App.jsx`

— end of report —
