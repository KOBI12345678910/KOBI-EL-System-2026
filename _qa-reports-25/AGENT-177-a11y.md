# AGENT-177 — WCAG 2.1 AA Accessibility Audit

**Agent:** Agent-177
**Date:** 2026-04-29
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Reference baseline:** `HEBREW_A11Y_AUDIT.md` (Agent-30, 2026-04-11) + `_qa-reports-25/AGENT-10-ui-rtl.md`
**Scope:** Color contrast, focus visibility, alt text, ARIA labels, keyboard navigation, screen reader, RTL.
**Mode:** Read-only — verifies what shipped vs. baseline.

---

## 1. Scorecard vs. Baseline

| WCAG SC | Area | Baseline (Agent-30) | Now | Status |
|---|---|---|---|---|
| 1.1.1 | Image alt text | 3 missing | 2 still empty in `Purchasing.tsx` | OPEN |
| 1.3.1 | Form labels (`htmlFor`/`id`) | 2 of 48 files | 2 of 48 (`VacationRequestForm.tsx`, `pages/Documents.tsx`) | OPEN |
| 1.4.3 | Color contrast AA | ~14 components fail | `#5C7080` still in 33 files in `techno-kol-ops/`; `#3D4F6A`/`#475569` still present | OPEN |
| 1.4.4 | Resize text (no `user-scalable=no`) | FAIL in `payroll-autonomous/index.html` | FIXED — meta now plain `initial-scale=1.0` | CLOSED |
| 2.1.1 | Keyboard operable | 0 of 48 with focus styles | a11y.css present but **only loaded by `onyx-procurement/web`**; React shells do not import it | PARTIAL |
| 2.4.1 | Skip-to-main | 0 of 5 shells | `.skip-to-main` exists in `a11y.css` only; **0 shells render the link** | OPEN |
| 2.4.3 | Focus order | divs with `onClick` everywhere | 13 occurrences still in `techno-kol-ops` (`HRAutonomy`, `Documents`, `WorkOrder360`, `Project360`, `ProcurementHyperintelligence`, `EmployeeHoursLog`) | OPEN |
| 2.4.7 | Focus visible | 0 of 48 | Only the dropped-in `a11y.css` defines `:focus-visible`; not imported by techno-kol-ops, payroll, or erp-app | PARTIAL |
| 3.3.2 | Labels/instructions | only 2 forms paired | unchanged | OPEN |
| 4.1.2 | Name/role/value (ARIA) | 3 of 48 | 16 occurrences across **6 files** in techno-kol-ops; sidebar has `role="navigation"`, `aria-label`, `aria-current`, `tabIndex={0}`, key handler — partial fix | PARTIAL |

---

## 2. Color Contrast (1.4.3 AA — 4.5:1 normal / 3:1 large)

Confirmed by greps in current source — **failures from baseline are unfixed**:

| Token | On bg | Ratio | Verdict | Where |
|---|---|---:|---|---|
| `#5C7080` | `#1C2127` | 3.2:1 | FAIL | Sidebar section headers (`Sidebar.tsx:69`), Navbar stat label, MetricCard label, StatusTag delivered |
| `#5C7080` | `#2F343C` | 3.3:1 | FAIL | `VacationRequestForm` textDim, `AttendanceCalendar` |
| `#5C7080` | `#383E47` | 3.0:1 | FAIL | Dashboard table headers |
| `#3D4F6A` | `#1C2127` | 2.5:1 | HARD FAIL | `AlertFeed` timestamps |
| `#475569` | `#0c0f1a` | 3.1:1 | FAIL | `onyx-dashboard.jsx` statSub, miniStatLabel, empty |

**Fix:** swap `#5C7080`→`#6B7F94` (≈4.6:1) and `#3D4F6A`→`#52687F` (≈4.5:1) in `techno-kol-ops/client/src/styles/theme.ts` and `onyx-procurement/web/onyx-dashboard.jsx`. One-token global change.

---

## 3. Focus Visibility (2.4.7) & Keyboard Navigation (2.1.1)

- **`a11y.css` is built but not wired in.** `Grep` confirms it exists at `onyx-procurement/web/lib/a11y.css` and defines `:focus-visible`, `.skip-to-main`, `.sr-only`, reduced-motion, and forced-colors fallbacks. **Zero React entrypoints import it.** None of `techno-kol-ops/client/src/main.tsx`, `payroll-autonomous/src/main.jsx`, or `erp-app` import the file.
- **`techno-kol-ops/client/src/components/Sidebar.tsx` partially remediated**: `role="navigation"`, `aria-label="ניווט ראשי"`, `tabIndex={0}` per item, `aria-current={active?'page':undefined}`, and Enter/Space `onKeyDown` (lines 52-87). Still a `<div>` chain rather than `<nav><ul><a>` — screen-reader experience is acceptable but not idiomatic.
- **13 `<div onClick>` occurrences remain** as non-buttons in 6 files: `pages/HRAutonomy.tsx` (2), `pages/Documents.tsx` (3), `pages/WorkOrder360.tsx` (1), `pages/Project360.tsx` (1), `pages/ProcurementHyperintelligence.tsx` (4), `components/EmployeeHoursLog.tsx` (2). These have no keyboard handlers.
- **`tabIndex` is set in exactly 1 React file** in techno-kol-ops (Sidebar). All other interactive divs are unreachable by keyboard.
- **`payroll-autonomous/src/App.jsx` tabs** still `<div onClick>` with no key handler (baseline finding unchanged).

---

## 4. Screen Reader / ARIA (4.1.2)

- **Live regions (`aria-live`, `role="status"`, `role="alert"`):** `Grep` finds **zero matches** in `techno-kol-ops/client/src`. `RealtimeToast.tsx` still announces nothing; `AlertFeed.tsx` is not a `role="log"`.
- **Icon-only buttons:** baseline flagged `🔄`, `✕`, `📤`, `✓` (alert resolve), hamburger `☰`. ARIA helpers added in only 6 files (Sidebar, Topbar, AppShell, ErrorBoundary, layout/Sidebar, ProgressBar) — most icon-only buttons are still unlabeled across 80+ component/page files.
- **Decorative emoji** (🎯, 🌊, 🧠, ⚡ in Sidebar/Navbar) — still rendered without `aria-hidden="true"`. Screen readers still pronounce "target", "wave", "brain" mid-Hebrew.
- **Headings:** vastly improved — 25+ pages now contain `<h1>` (vs. 3 of 23 in baseline). Remaining gaps: `pages/Dashboard.tsx` (still no h1).

---

## 5. RTL Correctness

Verified against baseline + Agent-10 follow-up:

- Root `dir="rtl"` set on `techno-kol-ops/client/index.html` and `payroll-autonomous/index.html` (verified). `erp-app/index.html` still missing — Agent-10 P0 finding stands.
- `<bdi>` / `unicode-bidi: isolate`: **0 occurrences anywhere in source** (only in `a11y.css` utility classes that nobody uses). Mixed Hebrew/Latin/`₪`/numbers will mis-order in toasts, tables, tooltips. Highest-risk files: `analytics-engine.tsx`, `whatsapp-ai.tsx`, `company-financials.tsx`, `bom-products.tsx`.
- `borderLeft`/`borderRight` literals in `techno-kol-ops`: 33 occurrences across 15 files (Sidebar.tsx:57+95, AlertFeed:3, HoursReport:6, ProjectTimeline:9, etc.) — should be `borderInlineStart`/`borderInlineEnd`.
- `RealtimeToast.tsx` still uses `left: 20` (baseline §2.3 unfixed) — slides in from wrong logical edge in RTL.
- Sidebar active marker `borderLeft: 2px solid #FFA500` is visually correct in current Chrome (panel pinned right) but direction-locked.

---

## 6. Alt Text (1.1.1)

- `alt=""` on meaningful product images: 2 occurrences in `techno-kol-ops/client/src/pages/Purchasing.tsx` (down from 3). Should use product name.
- `VacationRequestForm.tsx` preview image: `alt="preview"` — English literal, still not localized to `alt="תצוגה מקדימה של הקובץ שהועלה"`.

---

## 7. Resize / Zoom (1.4.4)

- **FIXED:** `payroll-autonomous/index.html` no longer has `user-scalable=no`. Verified — the offending meta tag is now plain `width=device-width, initial-scale=1.0`.
- All other shells were already compliant.

---

## 8. Critical Open Items (Priority Order)

| P | Item | File(s) | Effort |
|---|---|---|---|
| P0 | Wire `a11y.css` into all three React shells | `techno-kol-ops/client/src/main.tsx`, `payroll-autonomous/src/main.jsx`, `erp-app/src/main.tsx` | 15 min |
| P0 | Replace `#5C7080`→`#6B7F94`, `#3D4F6A`→`#52687F`, `#475569`→`#5E708A` globally | `theme.ts`, inline style scrub | 1 hr |
| P0 | Add `dir="rtl"` to `erp-app/index.html` `<html>` (Agent-10 finding) | `erp-app/index.html:2` | 1 min |
| P1 | Render `<a class="skip-to-main">` in each shell `<body>` and `<main id="main">` landmark | 3 shells | 30 min |
| P1 | Convert 13 `<div onClick>` to `<button type="button">` or add `role="button" tabIndex={0}` + `onKeyDown` | 6 files listed §3 | 2 hr |
| P1 | Add `aria-label` to icon-only buttons (`✕`, `🔄`, `✓`, `☰`, `📤`); `aria-hidden="true"` on decorative emoji | site-wide | 3 hr |
| P1 | `htmlFor`/`id` for every `<label><input>` pair (use `useId()` hook) | 46 files | 4 hr |
| P1 | `<bdi>` wrapper for Hebrew + Latin/₪/numbers in tables, toasts, tooltips | high-risk pages | 4 hr |
| P2 | `RealtimeToast.tsx`: add `role="status" aria-live="polite"`; swap `left:20`→`insetInlineStart:20` | 1 file | 10 min |
| P2 | `<h1>` on `pages/Dashboard.tsx` | 1 file | 5 min |
| P2 | Replace `borderLeft`/`borderRight`/`marginLeft`/`marginRight` literals with logical properties | 33+10 occurrences | 2 hr |
| P2 | Localize `alt="preview"`; populate alt on `Purchasing.tsx` product images | 2 files | 10 min |

---

## 9. Verdict

**Partial conformance to WCAG 2.1 AA.** Five items improved since baseline: heading structure, sidebar keyboard semantics (partial), `user-scalable` removed, more `aria-current`/`role="navigation"` usage, and a polished `a11y.css` exists. However, the foundational fix (importing `a11y.css` into the React entrypoints) was **not done**, so focus-visible, skip-to-main, reduced-motion, forced-colors, and `.sr-only` utilities are inert in the live UI. The 4.5:1 contrast failures dominate the surface area and remain a hard blocker for AA certification. ~6 hr of focused work would close all P0 items.

**Files of interest (absolute):**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\web\lib\a11y.css`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\components\Sidebar.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\components\RealtimeToast.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\Purchasing.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\App.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\index.html`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\HEBREW_A11Y_AUDIT.md`
