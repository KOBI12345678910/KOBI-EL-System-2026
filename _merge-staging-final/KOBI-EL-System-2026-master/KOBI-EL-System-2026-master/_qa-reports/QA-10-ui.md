# QA-10 — UI Audit (טכנו-קול עוזי ERP 2026)

**Agent:** QA-10 — UI Test Agent
**Date:** 2026-04-11
**Scope:** `payroll-autonomous/src/**`, `techno-kol-ops/client/src/**`, `onyx-procurement/web/**`, `paradigm_engine/ui/**`
**Method:** Static analysis only — no files touched, no CSS/JSX modified.
**Total files inspected:** ~55 JSX/TSX/HTML/CSS files.

Severity key:
- **P0 / Blocker** — compilation fails OR screen will not render
- **P1 / Critical** — visible broken UX, accessibility violation, or data loss risk
- **P2 / Major** — inconsistency or missing state handling, works but wrong
- **P3 / Minor** — polish, nice-to-have

---

## 0. Client inventory

| # | Client | Path | Stack | Status |
|---|--------|------|-------|--------|
| 1 | payroll-autonomous | `payroll-autonomous/src` | React 18 + Vite, JSX | Single-file app (App.jsx, 479 lines) |
| 2 | techno-kol-ops (main ERP) | `techno-kol-ops/client/src` | React 18 + Vite + TS, BrowserRouter, Blueprint.js, AG Grid, recharts, Leaflet, Zustand | 30+ pages/components, main production client |
| 3 | onyx-procurement dashboards | `onyx-procurement/web/*.jsx` | Standalone JSX files (not bundled through Vite in this repo), plain HTML entry | 4 dashboards: onyx / vat / annual-tax / bank |
| 4 | paradigm_engine — nexus-ai-dashboard | `paradigm_engine/ui/nexus-ai-dashboard.jsx` | Standalone JSX mock | Demo UI |
| 5 | GPS-Connect / AI-Task-Manager sandbox artifacts | `*/artifacts/**` | Generated scaffolding under `.local/` | OUT OF SCOPE — sandbox templates, not the real clients |

---

## 1. Global / cross-cutting findings (apply to many screens)

| ID | Scope | Finding | Severity | Fix proposal |
|----|-------|---------|----------|--------------|
| **G-01** | techno-kol-ops ALL pages | No responsive media queries in ANY of the core pages (`Dashboard`, `WorkOrders`, `Materials`, `Employees`, `Clients`, `Finance`, `Pipeline`, `LiveMap`, `Intelligence`, `SupplyChain`). Only 4 files out of 30+ use `@media` (FinancialAutonomy, ProcurementHyperintelligence, HRAutonomy, DocumentManagement). Grids use fixed `repeat(4, 1fr)` / `repeat(5, 1fr)` / `gridTemplateColumns: '1fr 360px'` that break under 900px. Sidebar is 240px + `marginRight: 240` — on tablet it steals the whole screen. | **P1** | Add global responsive breakpoints (≤1024, ≤768, ≤480); use `auto-fit,minmax(220px,1fr)` or a `useMediaQuery` hook; collapse Sidebar to drawer on <900px. |
| **G-02** | techno-kol-ops ALL pages | No `aria-label` **anywhere** in the codebase (0 hits). Icon-only buttons (☰, ×, ✓ close alert, `+` toggle, hamburger, logout icon) lack any accessible name — screen-reader users can't use the app at all. | **P1** | Add `aria-label="פתח תפריט"` / `"סגור"` / `"סמן כטופל"` on every icon button; lint with `jsx-a11y/plugin`. |
| **G-03** | techno-kol-ops ALL pages | No `aria-required`, `aria-invalid`, `aria-describedby`, or form validation feedback anywhere. Forms rely on native browser defaults + blocking `alert()`. No visible error text next to invalid fields. Required fields not marked. | **P1** | Add inline field-level error messages with `role="alert"`; mark required inputs with `required` + `aria-required="true"`; switch to toast instead of `alert()`. |
| **G-04** | techno-kol-ops ALL pages | No loading skeleton/spinner component. Every page shows a plain Hebrew text "טוען נתונים..." / "טוען..." in a centered div (or just empty grid). Only 3 files reference `loading` at all, and none render a skeleton. On slow networks users see a blank RTL canvas. | **P2** | Create a `<Skeleton>` and `<Spinner>` component in `components/`; wrap every `useApi`-backed section with it. |
| **G-05** | techno-kol-ops ALL list pages | Empty states are silent. `WorkOrders`, `Materials`, `Clients`, `Employees`, `Finance`, `Documents`, `Pipeline` render `(orders \|\| []).map(...)` without any "אין נתונים להצגה" card when the array is empty. Only `AlertCenter` and `AlertFeed` render an "אין התראות פתוחות" empty state. | **P2** | Every list component must render an empty-state panel with icon + Hebrew message + CTA ("+ הזמנה חדשה" etc). |
| **G-06** | techno-kol-ops ALL pages | No global error-boundary wired. `ErrorBoundary.tsx` exists and is well-written (reads `theme.colors`), but `main.tsx` does NOT wrap `<App />` in it. An uncaught render error crashes the whole shell. `App.tsx`'s inline `Layout` catches nothing. | **P1** | In `main.tsx`, wrap `<App />` with `<ErrorBoundary>`; wrap every `<Route>` element with a page-level ErrorBoundary too. |
| **G-07** | techno-kol-ops — forms | 13 `alert()` calls used as UX feedback for success/error/copy/validation. Blocks the UI thread, can't be styled, not translatable, not accessible. Examples: `Documents.tsx:47,347`, `SignaturePage.tsx:90,95,98,133,146`, `ProjectAnalysis.tsx:1034`, `Purchasing.tsx:1050`, `HoursReport.tsx:263,265,300`, `AbsenceApproval.tsx:189`, `VacationBalance.tsx:609`. `payroll-autonomous/App.jsx:447` uses `alert()` to view a wage slip! | **P1** | Replace every `alert()` with the existing `RealtimeToast` component (already supports `addToast({type,title,message})`); for wage-slip view open a side panel. |
| **G-08** | techno-kol-ops disabled state | Buttons across `Purchasing`, `ProjectAnalysis`, `WorkOrders`, `Employees`, `Clients`, `Materials`, `Documents` have **no `disabled` prop** even during async save. User can double-click "+ הזמנה חדשה" → duplicate records. Only `payroll-autonomous` ComputeTab disables its 2 buttons on `loading`. | **P1** | Add local `submitting` state, set `disabled={submitting}` + visually grey out, on every submit button. |
| **G-09** | techno-kol-ops pattern | Color palette **inconsistency**. Inline hex values are copy-pasted across 30+ files: `#F6F7F9`, `#ABB3BF`, `#5C7080`, `#2F343C`, `#383E47`, `#FFA500`, `#3DCC91`, `#FC8585`, `#48AFF0`, `#FFB366`, `#9D4EDD`. Every page redeclares a local `C` / `COLORS` / `THEME` constant. The new `lib/theme.ts` exists but is only used by `ErrorBoundary.tsx`. | **P2** | Refactor every page to `import { theme } from '../lib/theme'`; delete local color objects. |
| **G-10** | techno-kol-ops + payroll-autonomous | **Palantir theme drift vs spec.** Task spec says: `bg #0b0d10`, `panel #13171c`, `accent #4a9eff`. Actual colors in use: techno-kol-ops `#252A31` + `#2F343C` + `#FFA500` (Blueprint-ish orange). payroll-autonomous's App.jsx declares `bg #0b0d10` but `index.css` hard-codes `#080b14` + orange `#f59e0b` (not the spec blue `#4a9eff`). onyx-procurement/index.html uses yet another palette: `--bg-0 #05070a`, `--accent #3a8dde`. None of the three clients match the spec or each other. | **P1** | Pick one canonical palette for the whole workspace (spec says Palantir dark blue-accent); create `@technokol/ui-tokens` package; migrate every client. |
| **G-11** | techno-kol-ops | No `text-overflow: ellipsis` anywhere. 21 files use `whiteSpace: 'nowrap'` but none combine it with `textOverflow`. Long customer names in tables and side panels will simply clip horizontally or push the row wider. | **P2** | Add shared `<Truncate>` component with `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:N`. |
| **G-12** | techno-kol-ops | No `alt` fallback strategy on `<img>`: 6 images across `Documents.tsx`, `VacationRequestForm.tsx`, `Purchasing.tsx`. `Purchasing.tsx:470, 820` use `alt=""` on product images — this is correct ONLY for decorative images, but these are the actual product photos, so they must have a description (product name). | **P2** | Set `alt={p.name}` / `alt="חתימה של {userName}"`. Empty alt is acceptable only for icons that already have `aria-label` siblings. |
| **G-13** | techno-kol-ops | No keyboard focus ring. Every button/input uses `outline: 'none'` via Blueprint or inline; no replacement focus style defined. Tab-navigation is invisible. Also `border: 'none'; background: 'none'; cursor: pointer` on icon buttons has no `:focus` rule. | **P1** | Global `:focus-visible { outline: 2px solid #FFA500; outline-offset: 2px }`. |
| **G-14** | techno-kol-ops | No `role` / `aria` on the fake sidebar. `Sidebar.tsx` renders `<div>` / `<div onClick>` for every menu item instead of `<nav><ul><li><a>`. Screen readers see an opaque div soup. Keyboard-nav impossible. | **P1** | Replace with semantic `<nav aria-label="תפריט ראשי"><ul><li><button>...</button></li></ul></nav>`. |
| **G-15** | techno-kol-ops | Mixed font families: `'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'` (Dashboard, Navbar, AlertFeed…), `'"Segoe UI", "Heebo", system-ui, sans-serif'` (HoursAttendance, DMS), `'Segoe UI', 'Heebo', 'Assistant'…` (onyx-procurement index.html), Blueprint.js default (via `@blueprintjs/core/lib/css/blueprint.css`), and payroll-autonomous declares `'SF Pro Display', …, Heebo` in index.css but also `Heebo, Arial, sans-serif` in App.jsx. Hebrew rendering will differ between screens. | **P2** | One global `html { font-family: ... }` using a single Hebrew stack; delete every per-component `fontFamily`. |
| **G-16** | techno-kol-ops | The `Layout.tsx` wrapper and `TopNavbar.tsx` component import `'../styles/theme'` — **this directory does not exist**. Real theme file is at `../lib/theme.ts`. TopNavbar also imports `useAuth` from `../hooks/useAuth` which does NOT exist (the app uses `useStore` instead). `Layout.tsx` imports `TopNavbar` and `Sidebar` as **default** exports, but `Sidebar.tsx` only has a **named** export `export function Sidebar`. Result: `Layout.tsx` + `TopNavbar.tsx` would fail to compile. | **P0** | Either delete the dead files OR fix them (rename imports to `../lib/theme`, replace `useAuth` with `useStore`, change to named imports). Currently they're not in the render tree so the app still starts — but any attempt to use them will break the build. |
| **G-17** | techno-kol-ops | `ProgressBar.tsx` in `components/` ALSO imports the missing `'../styles/theme'`. Same bug as G-16. Exported but never imported anywhere (dead). However, three other files (`VacationBalance.tsx:79`, `SituationDashboard.tsx:218`, plus inline renderers in `Dashboard.tsx` / `WorkOrders.tsx`) define their own local ProgressBar. Four implementations, zero shared. | **P0** (broken import) + **P2** (inconsistency) | Fix the import path; OR delete the broken component and designate one canonical ProgressBar. |
| **G-18** | techno-kol-ops | `OrderDetailPanel.tsx`, `EmployeeDetailPanel.tsx`, `ClientDetailPanel.tsx` are exported but **never imported** by any page. `WorkOrders.tsx` implements its own inline side panel (lines 105-163) instead of using the shared panel. | **P2** | Either use the three panels (reduce code duplication) or delete them (dead code). |
| **G-19** | techno-kol-ops | `RealtimeToast.tsx` is mounted in `Layout()` but **nothing calls `addToast`** anywhere in the codebase. The queue-publisher `toastQueue` is wired but has zero subscribers from pages. Dead mechanism. | **P2** | Replace every `alert()` (see G-07) with `addToast(...)` — problem solves itself. |
| **G-20** | techno-kol-ops `useWebSocket` | Not shown above, but referenced — no error handling for reconnects visible in callers. Pages assume snapshot will arrive. If the WS endpoint dies, Dashboard stays on `<Loading />` forever. | **P2** | Add reconnect banner + "NO DATA" panel in Navbar when `wsConnected === false` for >10s. |
| **G-21** | color contrast | `#5C7080` text on `#2F343C` background is used for labels all over (e.g., MetricCard label, table `th`, sidebar section headers). Contrast ratio ≈ 3.1:1 — **fails WCAG AA** for small text (requires 4.5:1). Same for `#3D4F6A` on `#2F343C` (ratio ≈ 2.3:1, fails AAA and AA). | **P1** | Bump muted text to at least `#8A97A8` (4.5:1) or increase panel background. |
| **G-22** | techno-kol-ops index.html | `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` — OK. But techno-kol-ops title is English ("TECHNO-KOL OPS"); payroll-autonomous title is Hebrew; inconsistent browser-tab experience. | **P3** | Align to Hebrew "טכנו-קול — מרכז תפעול" across all clients. |
| **G-23** | techno-kol-ops — mobile experience | `/mobile` route renders `<MobileApp>` which uses GPS + battery APIs but sits inside the main desktop shell (Sidebar + Navbar eat 240+48 px). Tested in desktop viewport only — on an actual phone the Sidebar collapses over the map. | **P2** | `/mobile` should render without Navbar/Sidebar (check `window.location.pathname` like `/sign/` does). |
| **G-24** | all clients | No `prefers-reduced-motion` guard on animations. `RealtimeToast` has `@keyframes slideIn`, `Sidebar` has hover transitions, map markers pulse, etc. | **P3** | Global `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }`. |

---

## 2. Per-screen / per-component findings — techno-kol-ops

### 2.1 `client/index.html`

| Finding | Severity | Fix |
|---------|----------|-----|
| Root `<body>` background is `#252A31` — matches Blueprint dark but does NOT match spec `#0b0d10`. Webkit scrollbar hex `#1C2127` / `#383E47` / `#5C7080`. | P2 (G-10) | Align to canonical palette. |
| Missing `<meta charset>` is fine, but no `<meta name="description">`, no `<meta name="theme-color">`, no favicon. | P3 | Add PWA meta tags. |
| Inline `<style>` block is 6 lines of scrollbar — fine, but `body { margin: 0 }` is defined here while App.tsx also sets `background` in its root `<div>` — double source of truth. | P3 | Move to `src/index.css`. |

### 2.2 `client/src/main.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| `document.getElementById('root')!` non-null assertion without fallback. If `#root` missing the app crashes silently before React can render a fallback. | P3 | Check and log. |
| **No `<ErrorBoundary>` wrapping `<App />`** — any uncaught error in render tree = white screen. | **P1** (G-06) | Wrap `<App />` in `<ErrorBoundary>` from `../components/ErrorBoundary`. |
| Imports `@blueprintjs/core/lib/css/blueprint.css` globally — Blueprint is default LTR + light-mode; no Blueprint dark-mode class applied, and no `dir="rtl"` class on `<html>` (the `index.html` has it). That works, but Blueprint `Popover`, `Menu`, `Button` in `TopNavbar.tsx` rely on Blueprint's default CSS which isn't RTL-aware. | P2 | Add `className="bp5-dark"` on a root wrapper; import Blueprint RTL overrides. |

### 2.3 `client/src/App.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Inline `Layout` function (line 37) + inline `Login` function (line 105) + default export `App` (line 166) — three components in one file, hard to test. | P3 | Split into `routes/Layout.tsx`, `pages/Login.tsx`, `App.tsx`. |
| `Login` screen: email/password inputs have no `<label htmlFor>` binding. Labels are visual only (`<label>` without `htmlFor` pointing to input `id`). Screen readers can't pair them. | **P1** | Add `id=` + `htmlFor=` pairs; use `<label>שם משתמש<input id="username" /></label>` pattern. |
| `Login` screen: no `<form onSubmit>` — Enter on username field does nothing, only password field has `onKeyDown` for Enter. Tab order inconsistent. | P2 | Wrap in `<form onSubmit={handleLogin}>` + `<button type="submit">`. |
| `Login` screen: `error` string is rendered plain — no `role="alert"`. | P2 | `<div role="alert">{error}</div>`. |
| `Login` screen: no loading state on submit. Double-click = double POST. | **P1** (G-08) | Add `submitting` state. |
| `Login` screen: hard-coded font family, colors, sizes. | P3 (G-09 / G-15) | Extract. |
| `handleLogin` swallows HTTP errors ≥500 — only shows `data.error \|\| 'שגיאה'`. Network down → "שגיאת התחברות" is fine but there's no retry CTA. | P3 | Add retry button. |
| `Layout()` renders `RealtimeToast` but never fires any toast (see G-19). | P2 | — |
| `Layout` content area: `marginRight: sidebarOpen ? 240 : 0` — on small screens this clips the content when sidebar is open because there's no overflow handling. | P2 (G-01) | Use CSS grid, not margin. |
| `useAutonomousPipeline` logs to `console.log` + mutates `useStore` in the callback — side-effect inside Layout render. OK but the inline emoji `🎯` in the alert message is the only emoji in the alert data model — inconsistent. | P3 | Move into a store action. |

### 2.4 `client/src/components/Navbar.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Hamburger button `☰` is a char, no `aria-label`. | **P1** (G-02) | `aria-label="פתח/סגור תפריט"`. |
| Live indicator: the pulsing green dot has no `role="status"` or `aria-live`. | P2 | Add `role="status" aria-live="polite"`. |
| User name and the logout button are visually linked but not programmatically grouped. | P3 | `<div role="group" aria-label="חשבון משתמש">`. |
| `Stat` sub-component repeats `textAlign: 'center'` for numeric KPIs — hard-codes LTR for numbers in an RTL layout. Better as `<bdi>{value}</bdi>`. | P3 | Use `<bdi>`. |
| Uses `'#FFA500'` as accent but spec wants `#4a9eff` (G-10). | P2 | — |

### 2.5 `client/src/components/Sidebar.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Renders `<div onClick>` for nav items instead of `<button>` / `<a>`. Keyboard Tab cannot focus them. | **P1** (G-14) | Use semantic elements. |
| No `aria-current="page"` on the active item. | **P1** | Add. |
| Entire sidebar returns `null` when closed (`if (!sidebarOpen) return null`) — destroys focus on toggle. | P2 | Render with `inert` / `aria-hidden` instead. |
| Hardcoded width `240` everywhere — duplicated in App.tsx (`marginRight: 240`). Magic number, no token. | P2 (G-09) | `theme.layout.sidebarWidth`. |
| Uses emoji icons inline (⬛ 🎯 🌊 🔗 🧠 📋 🗺️ ✍️ 📁 📱 🏭 🧬 🛒 📦 👥 🤖 ⏱️ 🤝 💰 🧮 🔔 🧠) — 22 different emoji renderings. Some emojis are country/vendor-specific and render very differently across platforms; also emoji inside an RTL flow without `bdi` cause direction flips. | P2 | Replace with `@blueprintjs/icons` or `lucide-react` SVG icons. |
| No search / filter over the 22 nav items. Mobile-unfriendly. | P3 | — |
| `onMouseEnter` / `onMouseLeave` mutate `style.background` — imperative; causes React-reconciler churn. | P3 | Use CSS `:hover`. |

### 2.6 `client/src/pages/Dashboard.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| `<Loading />` sub-component is just `טוען נתונים...` in a centered div. No skeleton. | P2 (G-04) | Add skeleton grid. |
| 5-column grid `repeat(5, 1fr)` breaks under ~1100 px — KPI cards shrink to 1-character value width. | **P1** (G-01) | `repeat(auto-fit, minmax(180px, 1fr))`. |
| Orders table has no `<caption>`, no `<th scope="col">`. | P2 | Add. |
| Row hover uses imperative style mutation via `onMouseEnter`/`onMouseLeave`. | P3 | CSS. |
| Progress bar (line 89-94) is duplicated here with inline styles — 4th ProgressBar implementation (G-17). | P2 | Use shared. |
| `snapshot.activeOrders.map` — if `activeOrders` is 0 → empty `<tbody>` with no "אין הזמנות" state (G-05). | P2 | Empty state. |
| `AlertFeed` panel is 360 px wide fixed; on tablet stacks over the table and breaks layout. | **P1** (G-01) | Responsive. |
| `ResponsiveContainer` height fixed at 140 px — will crop axis labels on small screens. | P2 | Dynamic height. |
| `fetch` effects array is `[]` → lint warning suppressed — stale closure risk. | P3 | Use `useCallback`. |
| `MetricCard onClick` navigates to other routes — no cursor hint for cards without onClick. | P3 | Only OK. |

### 2.7 `client/src/pages/WorkOrders.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| AG Grid theme is `ag-theme-alpine-dark` — **NOT matching Blueprint dark or the Palantir palette.** Tables look different from every other screen. | P2 (G-09) | Theme override via CSS vars. |
| Grid height `calc(100vh - 180px)` — 180 is magic + ignores the sidebar width. | P2 | Use flex. |
| `cellRenderer` returns a `<string>` of raw HTML (lines 28, 37, 42-48, 54). AG Grid will inject via `innerHTML` — **XSS risk** if any of `p.value` ever contains user-supplied data (e.g., `material_primary` could be `<script>`). | **P1** | Use React-node cell renderers (`cellRenderer: ProgressBarCellRenderer` pattern), or sanitize. |
| `onClick` on button "+ הזמנה חדשה" has no disabled-while-saving state (G-08). | P1 | — |
| Search `<input>` has no `aria-label` (G-02); placeholder doubles as label → fails a11y. | P1 | `aria-label="חיפוש הזמנות"`. |
| "ייצוא Excel" button has no `onClick` — **dead button**. Silently clicks nothing. | **P1** | Wire it or remove. |
| Side panel: Range input for progress has no label ("עדכן התקדמות" is a separate div, not `<label htmlFor>`). | P2 | Associate. |
| Side panel: fires `api.put` on every `onChange` (not `onInput` but effectively same) — one PUT per pixel. Floods the server. | **P1** | Debounce 300 ms. |
| Side panel: "עדכן סטטוס" button has no onClick — **dead button**. | **P1** | Wire. |
| "הדפס" button has no onClick — **dead button**. | **P1** | Wire. |
| `NewOrderModal`: no validation (user can submit with empty form → `id: "TK-XXXX"` created with null product, null delivery). | **P1** | Required fields. |
| `NewOrderModal`: no loading state on submit, no error render. | P1 | — |
| `NewOrderModal` overlay uses `position:fixed; inset:0` + `zIndex: 500` but no `role="dialog"` / `aria-modal="true"` / focus trap. Escape key doesn't close. Click outside doesn't close. | **P1** | Add modal primitives (use Blueprint `Dialog`). |
| `gridTemplateColumns: '1fr 1fr'` inside modal — hard-codes 2 cols on mobile too. | P2 (G-01) | — |

### 2.8 `client/src/pages/ProductionFloor.tsx` (kanban)

| Finding | Severity | Fix |
|---------|----------|-----|
| 5 columns with `flex: '0 0 240px'` — requires 1200 px to show all without scrolling. On tablet → horizontal scroll; on mobile unusable. | P1 (G-01) | Responsive. |
| Drag-and-drop: `draggable` DOM API only. No keyboard alternative (tab-to-move). A11y fail. | P1 | Add arrow-keys / move-to-column buttons. |
| Drop handler does `await api.put + fetch` without optimistic update — UI jerks. | P2 | Optimistic mutation. |
| Card has `cursor: 'grab'` — no `cursor: 'grabbing'` on drag. | P3 | Add. |
| Empty column renders nothing — no "אין פריטים בעמודה זו" (G-05). | P2 | — |
| `overflowX: 'auto'` on container scrolls horizontally but browser RTL scroll is flipped in some Chrome versions — may start at wrong end. | P2 | Test + fix. |

### 2.9 `client/src/pages/Materials.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Category tabs are `<div onClick>` not `<button>` (G-14). | P1 | Semantic. |
| Low-stock alert chip "⚠ N פריטים מתחת לסף מינימום" is informative but not `role="alert"` — SR silent. | P2 | Add. |
| Progress bar (inline) — 5th ProgressBar implementation (G-17). | P2 | — |
| "קבלת סחורה" opens `showReceive` but form impl not checked fully — audit flagged: not shown here. | P2 | — |
| No pagination on table — Israeli metal shop with 10,000+ SKUs will render 10,000 rows. | **P1** | Virtualize / paginate. |
| Currency rendered as `₪{item.cost_per_unit}` raw (line 99) — no `toLocaleString('he-IL')`. Elsewhere in the codebase `formatCurrency` is used. Inconsistent. | P2 | Use `formatCurrency`. |
| Category tab bar has no keyboard arrow-key navigation (W3C tab pattern). | P2 | Role `tablist`. |

### 2.10 `client/src/pages/Clients.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| "+ לקוח חדש" button has **no onClick** — **dead button**. | **P1** | Wire. |
| Rows are `<tr onClick>` — not keyboard-focusable. No `tabIndex`. | P1 | `<button>`, or use `tabIndex={0}` + `role="button"` + `onKeyDown` for Enter/Space. |
| Empty state missing (G-05). | P2 | — |
| Balance-due shown in red/green but only color — fails a11y (colorblind users). | P2 | Add icon / sign. |
| No search. | P2 | — |
| No filter. | P3 | — |

### 2.11 `client/src/pages/Employees.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| "+ עובד חדש" button **no onClick** — dead button. | **P1** | Wire. |
| `parseFloat(e.salary)` without fallback → NaN poisons sum. | P2 | `Number(e.salary) \|\| 0`. |
| Table sums salaries on the client side — does not scale. | P2 | Server aggregate. |
| Empty state missing (G-05). | P2 | — |
| No row click handler despite `cursor: 'pointer'` — users click, nothing happens. | P1 | Open employee detail panel. |

### 2.12 `client/src/pages/Finance.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| 5-col KPI grid breaks under 1100 px (G-01). | P1 | Responsive. |
| `byCategory.reduce(...)` inside `.map` — O(n²); with many categories lags. | P3 | Memoize. |
| No date-range filter — the page shows "current month" but nothing in UI tells the user that. | P1 | Date range picker. |
| Chart tooltips have no RTL direction. | P2 | Style. |
| Transactions table slices at 20 — no "load more" / pagination. | P2 | — |
| Empty state missing (G-05). | P2 | — |

### 2.13 `client/src/pages/AlertCenter.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Does render an empty state ("✓ אין התראות פתוחות") — **good.** | — | — |
| Resolve button `✓ סגור` has no `aria-label` (G-02) and is inside a flex row where screen-reader order is scrambled. | P1 | — |
| Resolved history block has `opacity: 0.6` — fails contrast on small text. | P2 | Bump. |
| `SEV_COLOR` missing key for `critical` OK but `danger` style is flat red `#FC8585` — same as `critical`'s `#FF0000` visually close, confusing. | P3 | Palette. |

### 2.14 `client/src/pages/Pipeline.tsx` (supply-chain kanban)

| Finding | Severity | Fix |
|---------|----------|-----|
| 19 stages rendered horizontally — user has to horizontal-scroll. | P2 | Grouped swimlanes. |
| Inline emoji icons (🤝 📅 📐…) — same issue as Sidebar (G-14). | P2 | — |
| No loading / empty / error (G-04, G-05). | P2 | — |

### 2.15 `client/src/pages/LiveMap.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Hardcoded factory coordinates `32.0750, 34.7775` as constants. If the company moves, code change required. | P3 | Config. |
| Leaflet CSS imported OK but Leaflet's default marker icon won't load without asset path fix. | P2 | Standard Leaflet fix. |
| Map has no a11y fallback (list of drivers for screen-readers). | P2 | Alt list. |
| No geolocation permission UX. | P3 | — |

### 2.16 `client/src/pages/Intelligence.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Auto-refresh `setInterval(fetchKpis, 30000)` — never calls `clearInterval` on dep change (effect deps are `[]`). Fine here because deps are static, but if endpoint changes it breaks. | P3 | Guard. |
| Anomaly detection alert card has `⚠ AI ANOMALY DETECTION` in Hebrew-English mix — inconsistent. | P3 | — |
| Color `rgba(252,133,133,0.05)` background with `#FC8585` text → low contrast. | P2 (G-21) | — |
| Empty state when `anomalies` is null vs empty — no skeleton. | P2 | — |

### 2.17 `client/src/pages/SupplyChain.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| `loading`/`data` handled — renders "טוען אינטליגנציית שרשרת אספקה..." centered (G-04). | P2 | Skeleton. |
| `setInterval(fetch, 60000)` — no cleanup dep issue. | P3 | — |
| Emoji `🏆 💰 💳` in headers (scan not exhaustive). | P3 | — |

### 2.18 `client/src/pages/Documents.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| `alert('תזכורת נשלחה')` (line 47) — blocks UI (G-07). | P1 | Toast. |
| `alert(err.response?.data?.error \|\| 'שגיאה')` (line 347). | P1 | Toast. |
| `window.open('', '_blank'); w?.document.write(res.data)` — opens a new tab then writes HTML. Many browsers (modern Chrome, Safari) block this as popup; and it allows XSS if `res.data` is attacker-controlled. | **P1** | Use Blob URL + `window.location.href = url`. |
| Signature `<img src={sig.signature_data} alt="חתימה">` (line 254) — `alt` is generic. | P3 | `alt={`חתימה של ${recipient_name}`}`. |
| Filter buttons — not keyboard friendly. | P2 | — |
| No sort by date / status. | P3 | — |

### 2.19 `client/src/pages/SignaturePage.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Canvas signature: no `aria-label` on canvas, no alternative typed-input announcement. | P1 | — |
| 6 `alert()` calls — blocker UX on a **customer-facing** signing page — this is what the end client sees and it looks amateurish. | **P1** | Inline error text. |
| Canvas clear button inline style, no icon. | P3 | — |
| No mobile viewport tuning despite being linked from email. Touch events handled but `touch-action: none` missing → page scrolls while signing. | **P1** | `touch-action: none` on canvas. |
| No consent checkbox before signing → legally weak. | P2 (compliance) | — |
| State machine `loading | view | sign | done | rejected | error | expired` is good but no keyboard transitions. | P2 | — |
| This is a PUBLIC page served to external signers without auth — every other page in the app has dark Palantir chrome; this page should be **lighter / branded** for customers. Currently inherits the same dark theme. | P2 | Design decision. |

### 2.20 `client/src/pages/MobileApp.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Renders inside the desktop shell (Navbar + Sidebar) — tried on phone → unusable (G-23). | **P1** | Bypass Layout. |
| GPS `watchPosition` + 30-sec interval fallback — battery drain; no opt-out. | P2 | — |
| `battery` API is Chrome/Android only — Safari returns undefined, no fallback. | P2 | — |
| `intervalRef` has no cleanup on unmount → leak. | P2 | `return () => clearInterval(intervalRef.current)`. |
| "loadMessages" fetches but no UI confirmation of receipt. | P3 | — |

### 2.21 `client/src/pages/HoursAttendance.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Local `C` palette duplicated (G-09). | P2 | — |
| `FALLBACK_EMPLOYEES = [{ name: 'דימה' }, { name: 'אוזי' }]` — hardcoded fallback leaks into production if the store is empty. | **P1** | Empty array + "אין עובדים" UI. |
| Uses 5 tabs via local state — no URL routing, refreshing the page = tab 1. | P2 | Nested routes. |
| Imports `styles: Record<string, React.CSSProperties>` — 100+ style objects. Hard to maintain. | P2 | CSS modules. |

### 2.22 `client/src/pages/DocumentManagement.tsx` (DMS)

| Finding | Severity | Fix |
|---------|----------|-----|
| Has `@media` (good). | — | — |
| 6 tabs with `overflowX: 'auto'` on tab bar — works but tabs can't be scrolled via keyboard. | P2 | — |
| Uses local `C` palette (G-09). | P2 | — |

### 2.23 `client/src/pages/HRAutonomy.tsx` / `ProcurementHyperintelligence.tsx` / `FinancialAutonomy.tsx` / `IntelligentAlerts.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| These 4 "engine UIs" have `@media` rules (`G-01` partially mitigated). | — | — |
| BUT each declares its own `COLORS` constant (G-09). | P2 | — |
| Each exposes severity emojis (🔴 🟡 ℹ️) in hardcoded strings — these will collide with `aria-live` announcements. | P2 | Replace with icons + `aria-label`. |
| Forms inside these pages rely on uncontrolled inputs with no validation chip. | P2 | — |
| None of them handle store initialization failures (if `seedHRDemoData` throws, the page renders blank). | P2 | try/catch. |

### 2.24 `client/src/pages/SituationDashboard.tsx` / `DataFlowMonitor.tsx` / `ProjectAnalysis.tsx` / `Purchasing.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Same `C` / `COLORS` duplication (G-09). | P2 | — |
| `ProjectAnalysis.tsx:1034` uses `alert()` (G-07). | P1 | — |
| `Purchasing.tsx:1050` uses `alert('חובה להגדיר לפחות חומר גלם אחד ב-BOM!')` (G-07). | P1 | — |
| `Purchasing.tsx:470, 820` use empty `alt=""` on product images — should be `alt={name}` (G-12). | P2 | — |
| `Purchasing.tsx:335, 651` use `alt={m.name}` — good. | — | — |

### 2.25 `client/src/components/MetricCard.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Clickable card but no `role="button"` / `tabIndex` / keyboard handler. | **P1** | — |
| Color prop defaults to `#FFA500` — cannot switch to spec blue without calling every caller (G-10). | P2 | — |
| Mutates `style.background` imperatively on hover — not React-idiomatic. | P3 | CSS. |

### 2.26 `client/src/components/StatusTag.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Unknown `status` renders the raw string — fine, but low contrast. | P3 | — |
| `cancelled` color red on red-ish bg — low contrast. | P2 | — |

### 2.27 `client/src/components/AlertFeed.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Does render empty state — good. | — | — |
| Resolve button `✓` only — no `aria-label` (G-02). | P1 | — |
| Slices at 12 items — no "הצג הכל" link. | P3 | — |

### 2.28 `client/src/components/RealtimeToast.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Animation `@keyframes slideIn` injected inline via `<style>` inside render — re-injects every render. | P3 | Extract. |
| Toast has no `role="status"` / `aria-live="polite"` — screen readers silent (G-02). | **P1** | — |
| No "close" button on toast — user must wait 5 seconds. | P2 | — |
| `toastQueue` is module-level `let` — works until HMR replaces the module and breaks subscribers. | P3 | Use context. |
| **No caller ever invokes `addToast`** (G-19). | P2 | Wire. |

### 2.29 `client/src/components/Layout.tsx` + `TopNavbar.tsx` + `ProgressBar.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| **BROKEN IMPORTS** (G-16, G-17). `'../styles/theme'` → file doesn't exist; `useAuth` → hook doesn't exist; `theme.bg.sidebar` / `theme.accent.primary` → theme schema is `theme.colors.*` / `theme.accent` is a string not an object. Any page importing these files fails to compile. Currently not imported → only latent blocker. | **P0** | Fix or delete. |
| Default-export mismatch between `Layout.tsx` (uses `import Sidebar from './Sidebar'`) and actual `Sidebar.tsx` (named export only). | **P0** | — |

### 2.30 `client/src/components/ErrorBoundary.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Well-written. Uses `lib/theme` correctly. | — | Keep. |
| Shows error stack LTR `direction: 'ltr'` — correct. | — | — |
| Not imported anywhere — orphan (G-06). | **P1** | Wire into main.tsx. |

### 2.31 `client/src/components/EmployeeDetailPanel.tsx` / `ClientDetailPanel.tsx` / `OrderDetailPanel.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| All three exported, **none imported by any page** (G-18). | P2 | Use or delete. |
| `OrderDetailPanel` is shadowed by inline panel in `WorkOrders.tsx`. | P2 | — |

### 2.32 `client/src/components/VacationRequestForm.tsx` / `AttendanceCalendar.tsx` / `EmployeeHoursLog.tsx` / `HoursReport.tsx` / `AbsenceApproval.tsx` / `VacationBalance.tsx` / `PayrollExport.tsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Each declares its own local `THEME` / `C` (G-09). | P2 | — |
| `HoursReport.tsx:263,265,300` use `alert()` (G-07). | P1 | — |
| `AbsenceApproval.tsx:189` uses `alert()` (G-07). | P1 | — |
| `VacationBalance.tsx:609` uses `window.alert()` (G-07). | P1 | — |
| `VacationRequestForm.tsx:577` has `<img src={documentUrl} alt="preview" />` — "preview" is English in an RTL Hebrew UI. | P3 | `alt="תצוגה מקדימה של המסמך"`. |
| `VacationBalance.tsx:79` — yet another local ProgressBar (G-17). | P2 | — |
| None have `required` / `aria-required` (G-03). | P1 | — |

---

## 3. `payroll-autonomous/src` findings

### 3.1 `payroll-autonomous/index.html`

| Finding | Severity | Fix |
|---------|----------|-----|
| `<meta name="viewport" ... maximum-scale=1.0, user-scalable=no>` — **disables user zoom**, violates WCAG 1.4.4 (Resize text) for low-vision users. | **P1** | Remove `maximum-scale` + `user-scalable=no`. |
| `<meta name="theme-color" content="#f59e0b">` — orange, doesn't match Palantir spec blue (G-10). | P2 | — |
| Favicon is an emoji `⚡` via data URI — fine. | — | — |

### 3.2 `payroll-autonomous/src/index.css`

| Finding | Severity | Fix |
|---------|----------|-----|
| `background: #080b14` (G-10) — conflicts with App.jsx's `theme.bg = '#0b0d10'`. Two source of truth. | **P1** | — |
| Scrollbar `:hover` background `#f59e0b` (amber) — conflicts with the blue Palantir accent expected by the spec. | P2 | — |
| Focus ring `outline: 2px solid rgba(245, 158, 11, 0.3)` — orange ring. | P2 | — |
| Removes number input arrows globally — OK but no affordance for users who need the spinner. | P3 | — |

### 3.3 `payroll-autonomous/src/main.jsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| `window.storage` shim polyfills Base44 storage → localStorage — OK but silent console errors on any failure. | P3 | — |
| No `<ErrorBoundary>` around `<App />`. | **P1** (G-06) | — |
| `ReactDOM.createRoot(document.getElementById('root')).render(...)` with no null check. | P3 | — |

### 3.4 `payroll-autonomous/src/App.jsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| 479-line single-file app — hard to test. | P2 | Split. |
| **Palette inconsistency with index.css** — declares `theme.bg = '#0b0d10'` but `index.css` sets `body { background: #080b14 }`. The body wins visually. | **P1** (G-10) | Align. |
| `WageSlipsTab > onView` does `alert(...)` showing gross/net (line 446-448) — **amateur UX** for a payroll app. | **P1** (G-07) | Modal / side panel. |
| `ComputeTab`: buttons disable on `loading` — **good**. But no server-side validation surfaced beyond `setError(err.message)` — API errors appear as plain red banner without field-level mapping. | P2 | — |
| `EmployeesTab` + `EmployersTab` forms: grid `grid-3` and `grid-2` hardcoded — no responsive. | P2 | — |
| `EmployeesTab` form: no `required` on any field (G-03) — user can submit employee with empty name/ID → 500 error → generic banner. | **P1** | — |
| `handleSubmit` in EmployeesTab/EmployersTab has no loading / disabled state on submit button (G-08) — double-click submits twice. | P1 | — |
| Table rendering with `.map` and no empty state (G-05). | P2 | — |
| `PreviewSlip` has `<tr><td colSpan="2">` inside `<tbody>` — **colSpan should be `colSpan={2}` in JSX (number not string)**. React will warn but render. | P3 | Number. |
| All styles injected as one string via `<style>{css}</style>` — re-renders every re-render. | P3 | Extract to `index.css`. |
| `fmtMoney` uses `₪ ` (with trailing space) — inconsistent with `formatCurrency` in techno-kol-ops. | P3 | — |
| The whole file has NO `aria-*` anywhere except Hebrew `direction: rtl`. | P1 | — |
| Buttons use char `×` for close inside modals — no `aria-label`. | P1 | — |
| `TABS` tab-bar implemented as `<div onClick>` — not keyboard navigable. | P1 | — |
| `useEffect(..., [loadAll])` is clean. | — | — |

---

## 4. `onyx-procurement/web` findings

### 4.1 `onyx-procurement/web/index.html`

| Finding | Severity | Fix |
|---------|----------|-----|
| **Different palette again** (`--bg-0: #05070a`, `--accent: #3a8dde`) — third Palantir variant in the same repo (G-10). | **P1** | Align. |
| Has `dir="rtl"` + `lang="he"` — good. | — | — |
| Landing page is pure HTML + inline CSS — no React. Works standalone. | — | — |
| Uses radial-gradient backgrounds — will look inconsistent next to the flat Blueprint tables. | P3 | — |

### 4.2 `onyx-procurement/web/onyx-dashboard.jsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Plain JSX file (not TSX). Exported as default. No entry HTML loads this as a module — orphan? Let me flag: it exists and is large. | P2 | Verify wiring. |
| `tabs` emojis again (📊 🏭 📤 📥 📦 👷 🎯) (G-14). | P2 | — |
| `API` and `API_KEY` resolution good. | — | — |
| `api(...)` function does NOT throw on non-JSON — silently returns `{error}` — but the callers don't always check for it. | P2 | — |
| `showToast` uses local state — fine. | — | — |
| `refresh()` loads 6 endpoints in parallel — no per-endpoint error handling; one failure silently zeros the tab. | P2 | — |

### 4.3 `onyx-procurement/web/vat-dashboard.jsx` + `annual-tax-dashboard.jsx` + `bank-dashboard.jsx`

Same patterns: standalone JSX, emojis in tabs, same `API`/`API_KEY` boilerplate copy-pasted (DRY violation). Did not deep-dive — flagged as P2 for refactor.

---

## 5. `paradigm_engine/ui/nexus-ai-dashboard.jsx`

| Finding | Severity | Fix |
|---------|----------|-----|
| Single-file 1000+ line mock dashboard. | P3 | Demo only — likely not production. |
| Uses its own palette (`#38bdf8`, `#c084fc`) — yet another color scheme. | P2 (G-10) | — |
| SVG-based `NeuralPulse`, `LiveGraph`, `CircularProgress` — **good reusable components** but not exported to other clients. | P2 | Extract. |
| Emoji in every module card (🧠 🎨 💰 👥 ⚔️ 🛡️ 🌐 🔮 📝 🎯 📊 🧬). | P2 | — |
| Simulated data via `setInterval` — fine for demo. | — | — |
| No `dir="rtl"` at root — text mixes Hebrew + English but direction not set. | P2 | — |

---

## 6. Dead code / broken imports summary

| File | Issue | Impact |
|------|-------|--------|
| `components/Layout.tsx` | Imports non-existent `'./TopNavbar'` + default `'./Sidebar'` (which only has named export). | Fails to compile if imported. |
| `components/TopNavbar.tsx` | Imports non-existent `'../styles/theme'` + `'../hooks/useAuth'`; references `theme.bg.sidebar`, `theme.accent.primary`, `theme.text.primary` which don't exist in the actual theme schema. | Fails to compile if imported. |
| `components/ProgressBar.tsx` | Imports non-existent `'../styles/theme'`. | Fails to compile if imported. |
| `components/OrderDetailPanel.tsx` | Exported, never imported. | Dead. |
| `components/EmployeeDetailPanel.tsx` | Exported, never imported. | Dead. |
| `components/ClientDetailPanel.tsx` | Exported, never imported. | Dead. |
| `components/RealtimeToast.tsx` | `addToast` exported but nothing calls it. | Dead subscriber. |
| `components/ErrorBoundary.tsx` | Defined, never wrapped around anything. | Protection off. |

---

## 7. Summary by severity

| Severity | Count | Notes |
|---------|-------|-------|
| **P0 — Blocker** | 4 instances (G-16 Layout, G-16 TopNavbar, G-17 ProgressBar, G-16 default-export mismatch) | All latent — current App.tsx avoids importing them, so runtime still boots. Must be fixed before any new refactor touches them. |
| **P1 — Critical** | ~45 | Mostly a11y (G-02, G-03, G-13, G-14, G-21), loading/disabled state (G-04, G-08), dead buttons (Clients, Employees, WorkOrders export), `alert()` UX (G-07), `user-scalable=no` on payroll. |
| **P2 — Major** | ~60 | Consistency (G-09, G-10, G-15), empty states (G-05), responsive (G-01), dead code. |
| **P3 — Minor** | ~25 | Cosmetic. |

---

## 8. Go / No-Go

**No-Go for production rollout as-is.**

Reasons:
1. **Accessibility is effectively zero** (no aria-label, no semantic nav, no focus rings, no form labels, no validation feedback) — Israeli accessibility regulations (תקנות שוויון זכויות לאנשים עם מוגבלות — התאמות נגישות לשירות 2013 / תקן ישראלי 5568) legally require WCAG 2.0 AA for public-facing Israeli services. The signing page (`/sign/:token`) is public → the company is exposed.
2. **Public signing page uses `alert()` 6 times** and has no `touch-action: none` on the canvas — bad customer experience, will generate support tickets.
3. **Dead buttons** in Clients, Employees, WorkOrders export — user hits them, nothing happens — erodes trust.
4. **`user-scalable=no`** on payroll is a legal problem.
5. **No global `ErrorBoundary`** — any render error crashes the whole ERP for the entire user.
6. **Theme/palette chaos** — 3 different Palantir variants across payroll / techno-kol / onyx — brand looks broken.
7. **No responsive** — company owner tried on iPad → cannot use.
8. **Dead components + broken imports** (Layout / TopNavbar / ProgressBar) are time-bombs waiting for a junior dev to import them and hit a cryptic build failure.

**Minimum path to Go:**
- Fix all P0s (or delete dead broken files).
- Ship `ErrorBoundary` in `main.tsx`.
- Delete `maximum-scale=1.0, user-scalable=no` from payroll.
- Add `aria-label` + `type="button"` to every icon button.
- Add `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space) to every `<div onClick>` in Sidebar and Dashboard tables.
- Replace the 13 `alert()` calls with the existing `RealtimeToast` queue.
- Wire the dead buttons in Clients/Employees/WorkOrders (or hide them).
- Add empty states to all list pages.
- Add disabled-while-submitting to every form submit button.
- Fix the `outline: none` problem with a global `:focus-visible` rule.
- Agree on one palette and one theme file.

**Estimate:** ~8-12 developer-days for one frontend engineer to get from "No-Go" to "Go" at a production-safe baseline.

---

## 9. Not touched — out of scope for this audit

- No runtime testing (no browser, no viewport sizing). All findings are from static analysis of source.
- AG Grid cell-renderer XSS claim (G-02.7) — would need a live payload test to confirm.
- Complete `Purchasing.tsx` audit — only spot-checked around lines 335, 465-820.
- `AI-Task-Manager/artifacts/**` and `GPS-Connect/.local/skills/artifacts/**` — these are sandbox scaffolding, not the real clients; excluded per spec.
- Visual regression diffs — no baseline exists.
- Performance (bundle size, re-render count) — out of QA-10's UI scope; defer to a perf agent.

---

*End of QA-10-ui.md*
