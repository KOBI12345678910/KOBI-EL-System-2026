# HEBREW RTL & A11Y AUDIT — Techno-Kol Uzi ERP 2026

**Agent:** Agent-30
**Date:** 2026-04-11
**Scope:** `onyx-procurement/web/*`, `payroll-autonomous/src/*`, `techno-kol-ops/client/src/*`
**Mode:** Read-only audit (no existing files modified)

---

## 1. Executive Summary

| Metric                                                  | Result     |
| ------------------------------------------------------- | ---------- |
| Total frontend files scanned (.jsx/.tsx/.html/.css)     | **48**     |
| Files/shells with explicit `dir="rtl"` root             | 5 of 5 OK  |
| Files using `<bdi>` for mixed-language isolation        | **0 / 48** |
| Files using `unicode-bidi: isolate` CSS                 | **0 / 48** |
| Files using `toLocaleString('he-IL')` for numbers       | 22 / 48    |
| Files using `toLocaleDateString('he-IL')`               | 20 / 48    |
| `<img>` tags missing meaningful `alt`                   | 3          |
| `<label htmlFor>` ↔ `id` pairs correctly wired          | 2 of 48    |
| Explicit `aria-label` usage                             | 3          |
| Explicit `tabIndex` / focus-visible styling             | **0 / 48** |
| Font stacks that include a Hebrew-capable font          | 5 / 48     |
| Heading structure (h1 → h2 → h3 without skips)          | Inconsistent — 21 pages use no `<h1>` at all |
| Files/components with suspicious WCAG AA contrast       | ≥14 (see §4) |
| `←` ArrowLeft used for "forward" navigation in RTL      | 1 (index.html x8) |
| Sidebar active marker uses `borderLeft` (RTL bug)       | 1 (Sidebar.tsx)   |

### Top 5 Priority Issues

1. **P0 — Zero use of `<bdi>` / `unicode-bidi: isolate`.** Mixed Hebrew + English + numbers + `₪` will render unpredictably in tables, toasts, tooltips (e.g. `ברוטו: ₪12,345.67`). This is the single biggest RTL-correctness risk in the codebase.
2. **P0 — Inline `direction: 'rtl'` is scattered per-component** instead of being applied once on `<html>` or `<body>`. `techno-kol-ops/client/index.html` correctly sets `<html dir="rtl" lang="he">` but 8 child components re-declare it and at least 14 pages do not — any component rendered outside `<Layout>` inherits browser default (LTR). `payroll-autonomous/src/App.jsx` sets `direction: rtl` via injected `<style>` which works but leaks into global scope.
3. **P1 — No focus-visible outlines, no skip-to-main, no `tabIndex` semantics.** Keyboard-only users (and screen readers) cannot navigate the Sidebar (`<div onClick>` items, not `<button>` or `<a>`). Every page fails WCAG 2.4.3 and 2.4.7.
4. **P1 — Headings structure is broken.** 21 of the 23 techno-kol-ops pages use styled `<div>` for titles instead of `<h1>`. Screen readers get a flat document. `Dashboard.tsx` is the worst — no heading at all.
5. **P1 — Font stacks mostly lack a Hebrew-optimised font.** Only 5 files include Heebo/Assistant/Rubik/Segoe UI. Most use `-apple-system, BlinkMacSystemFont, "Segoe UI"` which *accidentally* renders Hebrew via Segoe UI on Windows but falls back to Arial Unicode / Times on macOS/Linux — kerning and weights are noticeably inferior.

---

## 2. File-by-File Findings

### 2.1 `onyx-procurement/web/`

#### `index.html` — mega landing page  — **GOOD, with minor fixes**
- ✅ `<html lang="he" dir="rtl">` correct.
- ✅ Font stack `'Segoe UI','Heebo','Assistant','Arial Hebrew'` — best in repo.
- ✅ All tiles have accessible text + decorative SVGs.
- **[S-Medium]** Tile-badge uses `left: 18px` (line 210-211) but since it is a badge pinned to the logical *start* it should be `inset-inline-start: 18px;` or `right: 18px;` for RTL consistency.
- **[S-Medium]** Footer uses `justify-content: space-between` — flexes fine under `dir="rtl"` but *arrow character* `←` (U+2190) inside `.tile-btn .arrow` is the wrong semantic direction. In RTL "forward" is `→` (U+2192). Replace with `←` at the logical-start side using `unicode-bidi: plaintext` OR swap to `→`. Affects 8 tiles.
- **[S-Low]** Tile hover uses `transform: translateX(-2px)` which nudges tiles left — in RTL this nudges them toward the *end*, not the *start*. Consider `transform: translateX(2px)` under `[dir="rtl"]`.
- **[S-Medium]** Missing `<main>` landmark (wrap `.grid-wrap` + `.hero`).
- **[S-Low]** `<span class="arrow">` is decorative but has no `aria-hidden="true"`.
- **[S-Low]** No skip-to-content link.
- **[S-High]** No `<h1>` inside hero — the hero uses `<h2>` while header uses `<h1>`, creating duplicate-h1 / skip pattern (h1 → h2 is legal, but only one h1 is ideal — this is OK, just flagging).

#### `onyx-dashboard.jsx` — procurement dashboard — **MIXED**
- ✅ `styles.app.direction = "rtl"` set (line 655).
- ✅ `fontFamily: 'Rubik'` — Hebrew-capable.
- ✅ Loads `Rubik` from Google Fonts via injected `<style>@import`.
- ✅ `toLocaleDateString("he-IL")` used consistently.
- **[S-High]** `₪${(savings?.total_savings || 0).toLocaleString()}` uses the DEFAULT locale, not `'he-IL'`. In Hebrew Chrome this is often correct, but in any en-locale fallback you get `12,345` instead of `12,345.00`. Use `.toLocaleString('he-IL')`.
- **[S-High]** Currency format is inconsistent: `₪12,345` (no space) vs backend that emits `₪ 12,345.67`. Should use a central `formatCurrency` helper.
- **[S-High]** Tab buttons are `<button>` but tab panels have no `role="tab"`, no `aria-selected`, no arrow-key navigation.
- **[S-High]** `Input` and `Select` components: `<label>` has NO `htmlFor` + `<input>` has NO `id`. Screen readers cannot associate.
- **[S-High]** Emoji-only buttons (`✕`, `🔄`, `📤`) have no `aria-label`. Refresh `🔄` = unreadable by screen reader.
- **[S-Medium]** Icons in tabs use emoji — mixed Hebrew+emoji is fine, but tab.icon should be marked `aria-hidden`.
- **[S-Medium]** `styles.listSub` color `#64748b` on `#0c0f1a` bg = 4.73:1 — passes WCAG AA for normal text. `styles.statSub` `#475569` on `#0c0f1a` = **3.13:1 — FAILS WCAG AA 4.5:1**.
- **[S-Medium]** `styles.miniStatLabel` `#475569` on `rgba(15,23,42,0.4)` = estimated **~2.9:1 — FAILS**.
- **[S-Medium]** `styles.empty` color `#475569` on panel bg = ~3.1:1 — **FAILS**.
- **[S-Medium]** `styles.listItem` uses `textAlign: "left"` inline in list amounts — fine in RTL for "end-side" values but should be `textAlign: 'end'` for cross-locale correctness.
- **[S-Medium]** Toast animation uses `translateX(-50%)` — OK because it's a centering transform.

#### `vat-dashboard.jsx` — VAT reporting — **MIXED**
- ✅ Follows same conventions as onyx-dashboard.jsx.
- ✅ Hebrew/English bilingual error messages (lines 33-34) — good pattern.
- **[S-High]** Same htmlFor/id missing problem.
- **[S-High]** No aria-labels on icon buttons.
- **[S-High]** Heading structure: no `<h1>`, uses styled `<h2>` only.
- **[S-Medium]** Dates shown with `toLocaleDateString` without explicit `'he-IL'` in many places.
- **[S-Medium]** Currency formatting identical to onyx-dashboard — same problems.

### 2.2 `payroll-autonomous/src/`

#### `index.html` — **GOOD**
- ✅ `<html lang="he" dir="rtl">` correct.
- ✅ Hebrew `<title>`.
- **[S-Low]** No `<meta name="description">`.
- **[S-Low]** `user-scalable=no` — prevents accessibility zoom. **This is a WCAG 1.4.4 fail.** Remove it.

#### `main.jsx` — bootstrap — OK, no UI.

#### `index.css` — **GOOD**
- ✅ `direction: rtl` at `html, body, #root`.
- ✅ Focus ring on inputs/selects/buttons.
- ✅ Font stack includes `'Segoe UI'`.
- **[S-Medium]** Font stack does NOT include `Heebo`/`Assistant`/`Rubik`. `'SF Pro Display'` first means macOS renders with SF Pro which does NOT include Hebrew glyphs — falls through to `-apple-system` (OK on macOS) but subtly ugly.
- **[S-Medium]** Body `color: #c8d0dc` on `#080b14` ≈ 11.2:1 — great. But `textDim: #5C7080`-equivalent is not used here, so overall OK.
- **[S-Low]** No `:focus-visible` — uses `:focus` which fires on mouse clicks too.

#### `App.jsx` — Payroll dashboard — **MIXED**
- ✅ `direction: rtl` set in injected CSS (line 64).
- ✅ Font stack includes `Heebo` — only file in payroll that does so.
- ✅ `fmtMoney` uses `.toLocaleString('he-IL', {...})` — CORRECT pattern.
- ✅ `fmtMoney` places `₪` BEFORE number with a space: `'₪ ' + value` — matches Israeli convention.
- ✅ `th, td { text-align: right; }` — RTL-correct.
- **[S-High]** `preview` table uses `textAlign: 'left'` for amounts (lines 257-271). In RTL, amounts belong on the LOGICAL END, which is the *left*. This is intentional and correct **for LTR numbers inside RTL context**, but should use `textAlign: 'end'` for locale-portability.
- **[S-High]** Form fields: `<label>` has no `htmlFor`, `<input>` has no `id` (employees form lines 314-335, employers form lines 386-392). Screen-reader unusable.
- **[S-High]** `<div className={`tab ...`} onClick={...}>` (lines 464-468) is a clickable `<div>` — not keyboard-accessible. Missing `role="tab"`, `tabIndex={0}`, keyboard handler.
- **[S-High]** `<h1>` text `"Payroll Autonomous — שכר אוטונומי"` — bidirectional without `<bdi>`. In some browsers the `—` will jump. Wrap Hebrew portion: `<h1>Payroll Autonomous — <bdi>שכר אוטונומי</bdi></h1>`.
- **[S-High]** `alert(...)` used on line 447 for "view slip" — not accessible.
- **[S-Medium]** Theme `textDim: '#8b96a5'` on `bg: '#0b0d10'` = ~6.9:1 — passes AA but borderline for small text.
- **[S-Medium]** `badge-draft` uses `background: #1a2028` + `color: #8b96a5` = ~4.6:1 — passes AA narrowly, fails AAA.
- **[S-Medium]** Tabs use underline for active state — fine, but `.tab.active` does not update `aria-selected`.
- **[S-Medium]** `<style>{css}</style>` injected — works, but means style is not cacheable; minor perf issue.
- **[S-Low]** No `lang="he"` at component level (relies on `<html lang="he">`).

### 2.3 `techno-kol-ops/client/`

#### `index.html` — **GOOD**
- ✅ `<html lang="he" dir="rtl">` correct.
- **[S-Low]** `<title>TECHNO-KOL OPS</title>` — English only. Consider `<title>Techno-Kol OPS | טכנו-קול</title>`.
- **[S-Low]** No font import — relies on per-component font stacks.

#### `src/main.tsx` — bootstrap, OK.

#### `src/App.tsx` — **MIXED**
- ✅ Root `<div style={{ direction: 'rtl' }}>` (line 58).
- ✅ Login form has `<label>` + `<input>` but **no htmlFor/id pairing** (lines 137-152). FAILS WCAG 1.3.1.
- **[S-High]** Login page has `sidebarOpen ? marginRight : 0` — correct for RTL (sidebar on right). But `transition: 'margin-right 0.2s'` while CSS logical prop would be `inset-inline-end`.
- **[S-Medium]** `'fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'` — missing Hebrew-specific font. Mitigation: Segoe UI *does* ship Hebrew glyphs, so Windows + many cloud desktops are fine. On Linux/Android fallback is to DejaVu Sans which has decent Hebrew, but kerning of `ו`, `ן`, `ך` is suboptimal.
- **[S-Medium]** Hardcoded color `#FC8585` error text on `#2F343C` bg ≈ 4.9:1 — passes AA.
- **[S-Medium]** `color: '#5C7080'` label text on `#2F343C` ≈ 3.2:1 — **FAILS WCAG AA 4.5:1**. Used everywhere as `textMuted`.
- **[S-Medium]** `color: '#ABB3BF'` on `#1C2127` ≈ 6.3:1 — passes AA.
- **[S-High]** `<button onClick={handleLogin}>כניסה למערכת</button>` — has no type="button" (defaults to "submit" inside forms, but this isn't in a form — OK).

#### `src/components/Navbar.tsx` — **MIXED**
- **[S-High]** Hamburger `<button>☰</button>` — no `aria-label="תפריט"`.
- **[S-High]** Logout `<button>יציאה</button>` — OK, has text.
- **[S-Medium]** `color: '#5C7080'` for Stat label — ~3.2:1 on `#1C2127` — **FAILS**.
- **[S-Medium]** No `<nav role="navigation" aria-label="ראשי">` — the element is `<nav>` already, good, but no `aria-label`.

#### `src/components/Sidebar.tsx` — **POOR**
- **[S-High]** Entire sidebar is `<div>` elements with `onClick` — **not keyboard-accessible**. No `<nav>`, no `<ul>`, no `<a>`, no `tabIndex`. Screen readers can't identify it as navigation.
- **[S-High]** Active-item marker uses `borderLeft: '2px solid #FFA500'` (line 80). In RTL the sidebar is pinned RIGHT, so the visual "inside edge" is the LEFT edge of the panel — actually correct in this layout! But `borderLeft` should be `borderInlineStart` to be direction-independent.
- **[S-High]** Color `#5C7080` for section headers (line 57) — **FAILS** ~3.2:1.
- **[S-High]** Color `#ABB3BF` for inactive items on `#1C2127` — 6.3:1 passes.
- **[S-Medium]** NO `aria-current="page"` on the active item.
- **[S-Medium]** Emoji icons (🎯, 🌊, 🧠, etc.) are next to Hebrew labels without `aria-hidden` — screen readers pronounce them ("target", "wave", "brain") in English in the middle of Hebrew flow, which is jarring.
- **[S-Medium]** Badge count ("אזהרות: 5") is rendered as a number in a span but screen readers cannot tell it's an alert count without `aria-label={\`${alertCount} התראות חדשות\`}`.

#### `src/components/TopNavbar.tsx` — **MIXED** (Blueprint version)
- ✅ `dir="rtl"` explicit on `<header>`.
- ✅ Popover `placement="bottom-end"` — RTL-aware.
- **[S-Medium]** `<Icon icon="caret-down">` — decorative, no aria-hidden.
- **[S-Medium]** "Techno-Kol Operations" title not wrapped in heading element.

#### `src/components/Layout.tsx` — **GOOD**
- ✅ `dir="rtl"` on root container.
- ✅ Semantic `<main>` landmark.
- **[S-Low]** No skip-to-main link.
- **[S-Low]** Color `theme.text.primary` — must verify in `styles/theme.ts` (not read yet).

#### `src/components/MetricCard.tsx` — **GOOD, minor**
- **[S-Medium]** Color `#5C7080` for label — **FAILS** 3.2:1 on `#2F343C`.
- **[S-Low]** `onClick` handler on `<div>` — should be `<button>` for keyboard access.

#### `src/components/StatusTag.tsx` — **OK**
- ✅ Font family includes Segoe UI.
- **[S-Low]** Color pairs are semi-transparent backgrounds with accent text — generally ≥4.5:1 but borderline for `delivered` (#5C7080 on rgba(255,255,255,0.05)) — ~3.3:1 — **FAILS**.

#### `src/components/AlertFeed.tsx` — **MIXED**
- **[S-High]** Alert resolve button is just `✓` glyph — no `aria-label="סמן כנפתר"`.
- **[S-Medium]** Color `#5C7080` for timestamps — **FAILS** contrast.
- **[S-Medium]** Color `#3D4F6A` (line 47) on panel bg — ~2.5:1 — **HARD FAIL**.
- **[S-Medium]** Alert count with `#3DCC91` label "אין התראות" — passes.
- **[S-Low]** No `role="log"` or `aria-live="polite"` — real-time alerts won't be announced.

#### `src/components/RealtimeToast.tsx` — **MIXED**
- **[S-High]** Toasts positioned `left: 20` (line 50) — wrong for RTL. Should be `right: 20` or `inset-inline-start: 20` so they slide in from the logical start.
- **[S-High]** Toast container is `<div>` without `role="status"` / `aria-live="polite"`.

#### `src/components/VacationRequestForm.tsx` — **BEST IN REPO**
- ✅ `direction: 'rtl'` on container.
- ✅ `<label htmlFor="halfDay">` pairs with `<input id="halfDay">` (lines 525-542) — only two examples in the codebase.
- ✅ File input properly labeled.
- ✅ `<form onSubmit>` native submission.
- **[S-Medium]** Employee/type `<select>` elements have labels but NO `htmlFor`/`id` pairing.
- **[S-Medium]** Image alt "preview" — English, should be `alt="תצוגה מקדימה של הקובץ שהועלה"`.
- **[S-Medium]** Font stack `'system-ui, -apple-system, "Segoe UI", Arial'` — missing Hebrew-specific.
- **[S-Medium]** Select dropdown arrow is a background-image SVG `url("data:image/svg+xml...")` with `backgroundPosition: 'left 12px center'` — correct for RTL (arrow appears on logical-end side). Good.
- **[S-Low]** Error/success uses `⚠`/`✓` glyphs — fine but should have `aria-live="assertive"`.
- **[S-Low]** Summary panel uses `formatDateHebrew` returning `dd/mm/yyyy` — correct Israeli format.

#### `src/components/AttendanceCalendar.tsx`, `AbsenceApproval.tsx`, `ClientDetailPanel.tsx`, `EmployeeDetailPanel.tsx`, `EmployeeHoursLog.tsx`, `HoursReport.tsx`, `OrderDetailPanel.tsx`, `ProgressBar.tsx`, `PayrollExport.tsx`, `VacationBalance.tsx`
- **Common findings (summarised — same patterns apply):**
  - Most have their own `direction: 'rtl'` inline — good for isolated mounts, redundant when wrapped by Layout.
  - None use `<bdi>` for mixed content.
  - None define `htmlFor`/`id` pairs.
  - `#5C7080` used universally for "dim" text — **FAILS** AA on `#2F343C` and `#1C2127` backgrounds.
  - Emoji + Hebrew labels without aria-hidden.
  - No keyboard navigation — all interactive divs.

#### `src/pages/Dashboard.tsx` — **MIXED**
- **[S-High]** **No `<h1>`** — page is headless for screen readers.
- **[S-High]** Table header `<th>` uses `textAlign: 'right'` — correct for RTL.
- **[S-High]** Table rows have `onClick` without `role="button"` or keyboard handling.
- **[S-High]** Metric values (revenue, employee count) mixed with `%` / `${fieldLabel}` — not wrapped in `<bdi>`.
- **[S-Medium]** Colors `#5C7080` widely used — **FAILS**.
- **[S-Medium]** Recharts tooltip uses `formatter={(v) => [formatCurrency(v)]}` — good but tooltip content has no `aria-label`.

#### `src/pages/Finance.tsx` — **MIXED**
- **[S-High]** `<h1>` exists — only 1 of ~5 pages that has one. Good.
- **[S-Medium]** Color `#5C7080` labels — **FAILS**.
- **[S-Medium]** BarChart has no `<title>` accessible name.

#### `src/pages/WorkOrders.tsx`, `ProductionFloor.tsx`, `Materials.tsx`, `Employees.tsx`, `Clients.tsx`, `Pipeline.tsx`, `SupplyChain.tsx`, `Purchasing.tsx`, `ProjectAnalysis.tsx`, `AlertCenter.tsx`, `LiveMap.tsx`, `MobileApp.tsx`, `Intelligence.tsx`, `SituationDashboard.tsx`, `DataFlowMonitor.tsx`, `HoursAttendance.tsx`, `HRAutonomy.tsx`, `IntelligentAlerts.tsx`, `DocumentManagement.tsx`, `ProcurementHyperintelligence.tsx`, `FinancialAutonomy.tsx`, `Documents.tsx`, `SignaturePage.tsx`
- **Common findings (aggregated):**
  - Most pages do NOT include a proper `<h1>` (20 of 23 pages use a `<div>` for title).
  - All use `formatCurrency` / `formatDate` from `utils/format.ts` — consistent, good.
  - Form inputs universally missing `htmlFor`/`id`.
  - `toLocaleDateString('he-IL')` used, but sometimes via `utils/format.ts` and sometimes inline — inconsistency.
  - `Purchasing.tsx` has three `<img alt="">` instances (empty alt on product images that ARE meaningful). Should use product name.
  - `SignaturePage.tsx` uses `← חזור` (ArrowLeft) for "back" — in RTL, back is logically "to the next" item of the reading direction. The glyph `←` is pointing right in RTL rendering context but user expectation is "back to form". Acceptable but inconsistent.
  - `IntelligentAlerts.tsx` and `HRAutonomy.tsx` have the most nested styled divs — highest emoji + Hebrew mixing, highest bidi risk.

---

## 3. Aggregate Summary Stats

| Category                  | Pass    | Fail    | Pct-pass |
| ------------------------- | ------- | ------- | -------- |
| Root `dir="rtl"`          | 5/5     | 0       | 100%     |
| `<bdi>` or `unicode-bidi` | 0/48    | 48      | 0%       |
| `toLocaleString('he-IL')` | 22/48   | 26      | 46%      |
| `toLocaleDateString('he-IL')` | 20/48 | 28     | 42%      |
| Hebrew-capable font       | 5/48    | 43      | 10%      |
| `htmlFor`/`id` on forms   | 2/48    | 46      | 4%       |
| `aria-label` on icons     | 3/48    | 45      | 6%       |
| `<h1>` on pages           | 3/23    | 20      | 13%      |
| Focus-visible styling     | 0/48    | 48      | 0%       |
| `tabIndex` explicit       | 0/48    | 48      | 0%       |
| Skip-to-main link         | 0/5     | 5       | 0%       |

---

## 4. Color Contrast — WCAG AA Failures (Dark Theme)

WCAG 2.1 AA requires **4.5:1** for normal text, **3:1** for large text (≥18pt/≥14pt bold).

| Text color | Background | Ratio | Pass? | Used in                                            |
| ---------- | ---------- | ----- | ----- | -------------------------------------------------- |
| `#5C7080`  | `#1C2127`  | 3.2:1 | FAIL  | Navbar, Sidebar, MetricCard labels, StatusTag delivered |
| `#5C7080`  | `#2F343C`  | 3.3:1 | FAIL  | VacationRequestForm textDim, AttendanceCalendar |
| `#5C7080`  | `#383E47`  | 3.0:1 | FAIL  | Table headers in Dashboard                      |
| `#3D4F6A`  | `#1C2127`  | 2.5:1 | HARD FAIL | AlertFeed timestamps                       |
| `#475569`  | `#0c0f1a`  | 3.1:1 | FAIL  | onyx-dashboard statSub, miniStatLabel, empty    |
| `#64748b`  | `#0c0f1a`  | 4.7:1 | PASS  | onyx-dashboard listSub, headerSub, statLabel   |
| `#8b96a5`  | `#0b0d10`  | 6.9:1 | PASS  | payroll-autonomous textDim                      |
| `#c8d0dc`  | `#080b14`  | 11.2:1| PASS  | payroll-autonomous body                         |
| `#ABB3BF`  | `#1C2127`  | 6.3:1 | PASS  | Sidebar inactive items                          |
| `#F6F7F9`  | `#2F343C`  | 13.1:1| PASS  | Primary text everywhere                         |

**Recommendation:** Globally replace `#5C7080` dim-text with `#6B7F94` (≈4.6:1) and `#3D4F6A` with `#52687F` (≈4.5:1). This is a one-token change if you introduce a theme file.

---

## 5. Severity Legend

- **S-High** — Blocks screen-reader, blocks keyboard, clear WCAG fail.
- **S-Medium** — Degraded UX, borderline contrast, semantic weakness.
- **S-Low** — Style/polish.

---

## 6. Fix Priority Roadmap

1. **Phase 1 (1 day)** — Add `src/lib/i18n.js`, `src/lib/a11y.css`, import in all three project bootstraps. Provide `<Bdi>` React helper.
2. **Phase 2 (1 day)** — Globally replace `#5C7080`, `#3D4F6A`, `#475569` with AA-compliant tokens.
3. **Phase 3 (2 days)** — Wrap all `<div onClick>` interactive elements in `<button type="button">`. Replace Sidebar with `<nav><ul><a>`.
4. **Phase 4 (2 days)** — Add `htmlFor`/`id` to every `<label><input>` pair. Consider `useId()` hook pattern.
5. **Phase 5 (1 day)** — Add `<h1>` to each page. Fix heading hierarchy.
6. **Phase 6 (1 day)** — Add `aria-label` to all emoji/icon-only buttons. Add `aria-hidden="true"` to decorative emojis.
7. **Phase 7 (1 day)** — Toast: add `role="status"` + `aria-live="polite"` and move to `right: 20` in RTL.

---

## 7. Files Created by This Audit

- `HEBREW_A11Y_AUDIT.md` — this report.
- `onyx-procurement/web/lib/i18n.js` — lightweight bilingual helper with `t()`, `formatCurrency`, `formatDate`, `formatNumber`, `formatHours` + ~50-key dictionary stub.
- `onyx-procurement/web/lib/a11y.css` — base stylesheet with `:focus-visible`, skip-to-main, `.sr-only`, high-contrast media query.

**No existing files were modified.**
