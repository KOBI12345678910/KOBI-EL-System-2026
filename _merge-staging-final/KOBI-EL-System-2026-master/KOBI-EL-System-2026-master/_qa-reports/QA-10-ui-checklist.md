# QA-10 — UI Checklist (כללי לכל UI חדש)

**Owner:** QA-10 UI Test Agent
**Scope:** Techno-Kol Uzi ERP — payroll-autonomous, techno-kol-ops/client, onyx-procurement/web, paradigm_engine/ui, plus any future React/JSX/Vue/HTML client.
**Purpose:** A self-audit checklist to run **before** any UI PR is merged. Grounded in the real findings from `QA-10-ui.md`. Every item links to a concrete anti-pattern we already found in the repo, so there is a precedent for why it's here.
**How to use:** Copy this list into the PR description. Tick each box or write `N/A — reason`. A PR that leaves any **P0** item unticked is a **NO-GO**.

Legend:
- `[P0]` — blocker, will break production or violate Israeli accessibility law (תקן ישראלי 5568 / WCAG 2.0 AA).
- `[P1]` — serious usability/quality issue, must fix before release.
- `[P2]` — quality issue, fix before sign-off of the feature.
- `[P3]` — polish, fix opportunistically.

---

## 0. Pre-flight (before writing any JSX)

- [ ] **[P1]** Confirm which client you are touching and which theme file owns it:
  - `techno-kol-ops/client` → `src/lib/theme.ts` (`theme.colors.*`, `theme.spacing.*`). Do **not** invent a parallel `styles/theme.ts` — that path does not exist and will break `TopNavbar.tsx` / `Layout.tsx` / `ProgressBar.tsx` the moment you import from them (see QA-10-ui.md §6 dead-code table).
  - `payroll-autonomous` → local `theme` object in `src/App.jsx`, but note `src/index.css` silently overrides it with orange `#f59e0b`. Either delete the override or delete the inline object — never both.
  - `onyx-procurement/web` → CSS variables in `index.html` (`--bg-0`, `--accent: #3a8dde`).
  - `paradigm_engine/ui` → local constants in the single JSX file.
- [ ] **[P1]** Do **not** create a new "COLORS" / "palette" / "theme" constant inside a page component. We already have 18 of those and they all drift (QA-10-ui.md G-10). Import the central theme instead.
- [ ] **[P1]** If you need a component, search for it first: we already have `components/Navbar.tsx`, `Sidebar.tsx`, `ErrorBoundary.tsx`, `RealtimeToast.tsx`, `ProgressBar.tsx`. Three of these are orphan/broken — verify they're actually wired before you "reuse" them.

---

## 1. RTL / Hebrew

- [ ] **[P0]** Root element (`<html>` or top-level `<div>`) has `dir="rtl"` **and** `lang="he"`. Pages that forget this produce LTR chart axes and misaligned icons — see `paradigm_engine/ui/nexus-ai-dashboard.jsx`.
- [ ] **[P1]** No hardcoded `marginLeft:`, `paddingLeft:`, `left:` for layout spacing in a child. Use `marginInlineStart` / `paddingInlineStart` / `insetInlineStart`, or flip to `marginRight` only if the parent is an `dir="rtl"` island that you own.
- [ ] **[P1]** Numbers, dates, and currency are formatted through `Intl.NumberFormat('he-IL', ...)` / `Intl.DateTimeFormat('he-IL', ...)`. No `` `₪${cost}` `` template literals (Materials page anti-pattern).
- [ ] **[P2]** Any chart (recharts/Chart.js/Leaflet legend) has `direction: rtl` wrapper **or** the axis/legend labels are mirrored. Finance page still has LTR axes.
- [ ] **[P2]** Text that mixes Hebrew + English + numbers uses Unicode `&rlm;`/`&lrm;` where the order inverts (e.g. `שעות: 8:30-17:00` — the time range must stay LTR inside an RTL sentence).

## 2. Responsive

- [ ] **[P0]** `index.html` viewport meta is exactly `<meta name="viewport" content="width=device-width, initial-scale=1">`. **No** `maximum-scale=1.0`, **no** `user-scalable=no` (WCAG 1.4.4 — `payroll-autonomous/index.html` currently violates this).
- [ ] **[P1]** At least one `@media (max-width: 768px)` in the page/component, **or** the layout is flex/grid with `flex-wrap` / `grid-template-columns: repeat(auto-fill, minmax(...))`. Pages with fixed 5-column grids (Dashboard, Finance, Materials) break on tablets.
- [ ] **[P1]** No hardcoded widths over 320px on the outer container. `Sidebar.tsx` uses `width: 240` — fine for desktop only; the layout must collapse below 900px (currently doesn't — App.tsx always reserves `marginRight: 240`).
- [ ] **[P2]** Tables wider than ~800px are wrapped in `overflow-x: auto` **or** degrade to stacked cards on mobile. AG Grid tables in WorkOrders don't.
- [ ] **[P2]** Touch targets (buttons, links, checkboxes) are ≥ 44×44 px on mobile.

## 3. States (loading / empty / error / disabled)

- [ ] **[P0]** Every async data read has a **loading state**: skeleton, spinner, or "טוען…". Inline `null` is not a loading state (Dashboard KPIs render `—` forever on API failure).
- [ ] **[P0]** Every list / table / grid has an **empty state** with icon + Hebrew copy + (if relevant) a primary action button. Clients, Employees, WorkOrders currently render a blank table on empty data.
- [ ] **[P0]** Every async write / network call has an **error state** rendered inline (not just `console.error`). Login silently fails on 401 today — no `role="alert"` message.
- [ ] **[P0]** Submit buttons get `disabled` + "שומר…" text while the request is in flight. The ComputeTab in payroll-autonomous is the only place that does this — everywhere else you can double-submit.
- [ ] **[P1]** Destructive actions (delete, archive, force-close order) require an explicit confirm dialog — **not** `window.confirm()`, a real modal with focus trap.
- [ ] **[P2]** 404 / network-down has a friendly retry UI, not a white page.

## 4. Forms & Validation

- [ ] **[P0]** Every input has a visible `<label htmlFor="...">`. `placeholder` is not a label (techno-kol-ops Login has no labels at all).
- [ ] **[P0]** Required fields are marked visually **and** with `aria-required="true"`.
- [ ] **[P0]** Validation errors are rendered next to the field with `aria-describedby` pointing at the error text, and the field gets `aria-invalid="true"`. No `alert()` pop-ups for validation (SignaturePage has 6 of these).
- [ ] **[P1]** `onSubmit` is on the `<form>` element, not an `onClick` on the button — so Enter works. Login doesn't have a `<form>` at all.
- [ ] **[P1]** Numeric inputs use `inputMode="numeric"` + `type="number"` + `min` / `max` / `step`. `parseFloat` is wrapped: `const n = Number(v); if (Number.isNaN(n)) { ... }` — Employees page currently NaN-crashes.
- [ ] **[P2]** Auto-save or unsaved-changes warning if the form is more than 3 fields deep.
- [ ] **[P2]** Password/PII fields use `autoComplete` properly (`new-password`, `current-password`, `one-time-code`).

## 5. Accessibility (WCAG 2.0 AA / תקן 5568)

- [ ] **[P0]** No `<div onClick>` for anything clickable. Use `<button type="button">` or `<a href>`. Sidebar nav items are all `<div>` — keyboard users can't reach them.
- [ ] **[P0]** Every icon-only button has `aria-label` in Hebrew. Navbar hamburger (`☰`) does not.
- [ ] **[P0]** Every `<img>` has `alt`. Decorative images get `alt=""` **with** `role="presentation"`. Purchasing page has `alt=""` on real product images — screen reader reports "image" with no name.
- [ ] **[P0]** Keyboard focus is visible on every interactive element. Don't kill `:focus-visible` with `outline: none` unless you replace it with something equivalent (the orange focus ring in payroll `index.css` is the only acceptable override pattern).
- [ ] **[P0]** Modal/dialog has `role="dialog"`, `aria-modal="true"`, focus trap, and Escape to close. `NewOrderModal` has none of these.
- [ ] **[P0]** Toasts/notifications have `role="status"` (polite) or `role="alert"` (assertive) **and** `aria-live`. `RealtimeToast.tsx` is silent to screen readers.
- [ ] **[P1]** Tab order follows visual order (RTL: right → left → down). No `tabIndex > 0`.
- [ ] **[P1]** All interactive states (hover/focus/active/disabled) are distinguishable **without** color alone.
- [ ] **[P1]** Data tables use `<table>` + `<th scope="col">`. AG Grid satisfies this by default — but if you put a `cellRenderer` that emits raw `<div>` HTML, you lose it.
- [ ] **[P2]** Page has one `<h1>`; headings are in order, no skipped levels.

## 6. Color contrast (AA: 4.5:1 text, 3:1 large-text / UI)

- [ ] **[P0]** Body text on page background ≥ 4.5:1. Against `#0b0d10` that's `#cfd3da` or lighter.
- [ ] **[P0]** Muted/secondary text ≥ 4.5:1 (not 3:1 — we're not "large text"). `opacity: 0.6` on AlertCenter history rows fails this.
- [ ] **[P0]** Accent color (`#4a9eff` per spec, `#FFA500` per current techno-kol) as button text on its own background ≥ 4.5:1. Orange `#FFA500` on `#2F343C` = 5.8:1, passes. **Orange on white inside a toast** = 2.1:1, fails.
- [ ] **[P1]** Danger red `#FC8585` on dark card `#2F343C` = 4.9:1 — passes. Do not use danger red on a **white** background anywhere (it drops to 3.1:1).
- [ ] **[P1]** Success green `#32A467` on `#2F343C` = 3.6:1 — fails AA for body text; only acceptable for badges ≥ 14px bold or ≥ 18px regular.
- [ ] **[P2]** Disabled controls are visibly disabled but **readable** (don't drop below 3:1).

## 7. Palantir dark theme consistency

Spec tokens: `bg #0b0d10`, `panel #13171c`, `accent #4a9eff`. Current reality: techno-kol uses `#1C2127 / #2F343C / #FFA500`. Until someone decides which one is canonical, **pick one per client and don't mix**.

- [ ] **[P1]** All color values in the file come from `import { theme } from '@/lib/theme'` (techno-kol-ops) or the client's single central palette file. No inline hex strings.
- [ ] **[P1]** Typography uses `theme.typography.size.*` — no raw `fontSize: 13`.
- [ ] **[P1]** Spacing uses `theme.spacing.*` — no raw `padding: 16`.
- [ ] **[P2]** Border radius: 0 (sharp Palantir corners) or `theme.radius.sm` (3px). No `border-radius: 8px` "friendly" corners.
- [ ] **[P2]** Shadows come from `theme.shadow.*`. No custom `box-shadow`.
- [ ] **[P2]** Page dark mode matches the layout shell — you should not be able to tell where one page ends and the next begins from background color alone (today Dashboard is `#2F343C`, Finance is `#252A31`, HRAutonomy is `#1a1f26` — three different backgrounds).

## 8. Text overflow / truncation

- [ ] **[P1]** Long strings (names, client names, project names) inside tables/cards have `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` **and** a `title={fullText}` tooltip. Clients/Employees tables currently wrap to 4 lines.
- [ ] **[P2]** Multi-line text clamps use `display: -webkit-box; -webkit-line-clamp: N; -webkit-box-orient: vertical; overflow: hidden;` — not arbitrary `max-height`.
- [ ] **[P2]** Numbers are right-aligned in tables (even in RTL — numbers stay LTR).

## 9. Broken / dead code guardrails

- [ ] **[P0]** Every file you `import` exists at the literal path. Specifically: **no** `import ... from '../styles/theme'` — that directory does not exist (TopNavbar.tsx, ProgressBar.tsx, Layout.tsx all break on this).
- [ ] **[P0]** Every hook you import exists: **no** `import { useAuth } from '../hooks/useAuth'`.
- [ ] **[P0]** Named vs default exports match: if the source `export const Sidebar`, the importer must `import { Sidebar }`, not `import Sidebar`.
- [ ] **[P1]** Every component you add is actually imported somewhere (otherwise it becomes an orphan like `ErrorBoundary.tsx`, `TopNavbar.tsx`, `Layout.tsx` — all dead on arrival).
- [ ] **[P1]** Every `addToast(...)` / `pubsub.emit(...)` / event emission has at least one subscriber in the running tree. `RealtimeToast.addToast` currently has zero callers.
- [ ] **[P1]** Every event listener set up in `useEffect` is torn down in the cleanup (`return () => clearInterval(...)`). MobileApp page leaks an interval on unmount.

## 10. No anti-patterns

- [ ] **[P0]** **Zero** `alert(...)` calls in user-facing code. Use toast, inline error, or a modal. SignaturePage has 6; ProjectAnalysis has 1; payroll App.jsx has 1.
- [ ] **[P0]** **Zero** `window.confirm(...)` calls for destructive actions. Use a proper modal.
- [ ] **[P0]** **Zero** `prompt(...)` calls.
- [ ] **[P0]** **Zero** inline event handlers that dispatch raw HTML (`innerHTML: ...` / `dangerouslySetInnerHTML`) on user-controlled data — audit any AG Grid `cellRenderer` returning a string. WorkOrders has two XSS-risky renderers.
- [ ] **[P1]** Buttons that don't do anything yet are marked `disabled` + tooltip "בקרוב", **not** rendered enabled with an empty `onClick`. Clients has "+ לקוח חדש", Employees has "+ עובד חדש", WorkOrders has 3 dead buttons.
- [ ] **[P1]** No hardcoded fake data in production code (`FALLBACK_EMPLOYEES = [{name:'דימה'},{name:'אוזי'}]` in HoursAttendance — move to a fixtures file or delete).
- [ ] **[P1]** No fire-and-forget network calls — every `fetch` / `axios` has `.catch` and the error surfaces to the user.
- [ ] **[P2]** No `setState` inside `render`. No `useEffect` without a dependency array (unless intentional, and then commented).
- [ ] **[P2]** No emoji as icons in production UI — use a proper icon set (Blueprint Icons / lucide-react). Sidebar has 22 emoji icons.

## 11. Error boundaries

- [ ] **[P0]** The app root is wrapped in `<ErrorBoundary>`. `techno-kol-ops/client/src/main.tsx` currently is **not** — any uncaught error wipes the whole shell.
- [ ] **[P1]** High-risk screens (charts, AG Grid, maps) are wrapped in a second-level `<ErrorBoundary>` so one broken panel doesn't take down the dashboard.

## 12. Routing / deep-linking

- [ ] **[P1]** Tabs inside a page reflect in the URL (`?tab=wages`) so the user can bookmark / back-button. HoursAttendance, DocumentManagement, HRAutonomy all lose tab state on refresh.
- [ ] **[P1]** 404 route exists and says something in Hebrew.
- [ ] **[P2]** Public pages (SignaturePage) are not reachable by the logged-in shell navigation without explicit confirmation — they are public-facing and must not leak internal nav.

## 13. Public / customer-facing pages (higher bar)

`SignaturePage` is the only known public-facing page today. If you add another, it must pass **all** of the above **plus**:

- [ ] **[P0]** `touch-action: none` on the signature canvas so the page doesn't scroll during a signature.
- [ ] **[P0]** Explicit consent checkbox with linked privacy policy before capturing a signature / PII (תקנות הגנת הפרטיות + GDPR).
- [ ] **[P0]** No `alert()`, no `prompt()`, no `window.confirm()` — ever. Customers see these as phishing.
- [ ] **[P0]** Page renders on iOS Safari 14+ and Android Chrome 90+ without a polyfill error.
- [ ] **[P1]** `<meta name="theme-color">` matches the page background (not orange on a blue page, as payroll currently does).
- [ ] **[P1]** No `console.log` left in the bundle.
- [ ] **[P2]** Page size ≤ 250 KB gzipped on first paint.

---

## PR template — paste this in

```
## QA-10 UI Self-Audit

- [ ] Section 0 — Pre-flight
- [ ] Section 1 — RTL / Hebrew
- [ ] Section 2 — Responsive
- [ ] Section 3 — States (loading/empty/error/disabled)
- [ ] Section 4 — Forms & Validation
- [ ] Section 5 — Accessibility (WCAG AA / תקן 5568)
- [ ] Section 6 — Color contrast
- [ ] Section 7 — Palantir theme consistency
- [ ] Section 8 — Text overflow
- [ ] Section 9 — Broken/dead code guardrails
- [ ] Section 10 — No anti-patterns (no alert/confirm/prompt/innerHTML)
- [ ] Section 11 — Error boundaries
- [ ] Section 12 — Routing / deep-linking
- [ ] Section 13 — Public page extras (if applicable)

**Screens touched:** ...
**New files:** ...
**P0 items not ticked:** ... (must be empty for merge)
**Known P2/P3 debt filed as ticket:** ...
```

---

## Verdict policy

- **Any P0 unchecked → NO-GO.** PR is blocked.
- **Any P1 unchecked → conditional go** only with an explicit product-owner override recorded in the PR description.
- **P2/P3** may be deferred to a follow-up ticket, **but the ticket must exist before merge**, not "we'll file it later".

---

_Generated by QA-10 on the basis of the findings in `_qa-reports/QA-10-ui.md`. If the repo changes, re-run QA-10 and refresh this checklist — don't let it drift._
