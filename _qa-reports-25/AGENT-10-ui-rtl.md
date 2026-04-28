# AGENT-10 — UI RTL / Hebrew Audit (extension of HEBREW_A11Y_AUDIT.md)

**Agent:** Agent-10 (UI Audit, RTL Hebrew)
**Date:** 2026-04-29
**Scope:** `techno-kol-ops/client`, `AI-Task-Manager/artifacts/erp-app`, `AI-Task-Manager/artifacts/erp-mobile`, `onyx-procurement/web`, `erp-app`
**Mode:** Read-only audit. No source files modified.
**Reference:** `HEBREW_A11Y_AUDIT.md` (Agent-30, 2026-04-11) — extended below with the larger surface that has shipped since.

---

## Status

| Surface | Files (TS/TSX/HTML) | RTL root OK | i18n layer | Loading/Empty/Error states | Verdict |
|---|---:|:---:|:---:|:---:|:---|
| `techno-kol-ops/client` | ~80 | YES (`index.html`) | none — hardcoded HE | partial (per-page only) | NEEDS WORK |
| `AI-Task-Manager/artifacts/erp-app` | ~430 | YES (`index.html`) | none — hardcoded HE | YES (`unified-states.tsx`) | OK with gaps |
| `AI-Task-Manager/artifacts/erp-mobile` | ~120 | YES (`I18nManager.forceRTL`) | none | partial | OK with gaps |
| `onyx-procurement/web` | ~6 | YES | partial (`lib/i18n.js` stub) | partial | OK |
| `erp-app` (root) | ~600 | **FAIL** — `<html lang="he">` no `dir="rtl"` | none | partial | **P0 BUG** |

Overall: ERP front ends ship **without a translation layer** (every label is a Hebrew string literal); RTL root direction is set in 4/5 surfaces; one shell at the repo root is missing `dir="rtl"` entirely.

---

## RTL-issues

### P0
1. **`erp-app/index.html` is missing `dir="rtl"`** — `<html lang="he">` only (line 2). Every page in this app then sets `dir="rtl"` on a wrapper `<div>` (50+ occurrences confirmed: `App.tsx:1148/1182/2916`, `pages/forbidden.tsx:7`, `pages/analytics-engine.tsx:52/103/418/670/700/802`, all `pages/analytics/*.tsx`, `pages/whatsapp-ai.tsx`, etc.). Any portal-rendered child (toasts, dialogs, popovers, tooltips, command palette) that escapes the `<div dir="rtl">` ancestor will render LTR. Fix: add `dir="rtl"` to `<html>` and remove the per-component duplicates.
2. **`techno-kol-ops/client/src/components/Sidebar.tsx` active marker uses `borderLeft`** (line 95: `borderLeft: active ? '2px solid #FFA500' : '2px solid transparent'`) and the panel uses `borderRight` (line 57). In RTL the panel is pinned to the right and the visual "inside edge" is the left edge — so the result is *visually* correct in current Chrome but is direction-locked. Replace with `borderInlineStart` / `borderInlineEnd` for portability.
3. **No `<bdi>` / `unicode-bidi: isolate` anywhere in the new surfaces either.** Same finding as Agent-30, now applies across ~600 additional `erp-app` files. Mixed Hebrew + LTR (numbers, `₪`, `kWh`, IBANs, emails, file names) will mis-order in tables, toasts, and tooltips on Safari and on Chromium when bidi context shifts. Highest-risk pages: `analytics-engine.tsx`, `whatsapp-ai.tsx`, `company-financials.tsx`, `bom-products.tsx`, `usage-logs.tsx`.

### P1
4. **`textAlign: 'left'/'right'` (literal directions) used in 23 `techno-kol-ops` files** instead of logical `start`/`end`. Same anti-pattern in 10 `AI-Task-Manager/artifacts/erp-app` pages (`command-center/causal-impact-viewer.tsx`, `builder/categories-builder.tsx`, `ai-engine/kimi-terminal.tsx`, `ai-engine/kobi-ide.tsx`, `projects/project-tasks-page.tsx`, `projects/gantt-chart-page.tsx`, `builder/permissions-builder.tsx`, `palantir/code-workspace.tsx`, `finance/accounting-portal.tsx`, `finance/chart-of-accounts.tsx`).
5. **`marginLeft` / `marginRight` / `paddingLeft` / `paddingRight` literal in `techno-kol-ops`** — at least 23 occurrences across `App.tsx`, `AbsenceApproval.tsx`, `EmployeeDetailPanel.tsx`, `EmployeeHoursLog.tsx`, `pages/AlertCenter.tsx`, `GlobalSearch.tsx`, `layout/Sidebar.tsx`, `pages/Employees.tsx`, `pages/Finance.tsx`, `pages/DataFlowMonitor.tsx`. Should migrate to `marginInlineStart` / `marginInlineEnd`.
6. **Mobile (Expo) RTL force-flip is unconditional** — `AI-Task-Manager/artifacts/erp-mobile/app/_layout.tsx:33-36` calls `I18nManager.forceRTL(true)` once and reloads. This works for Hebrew-only deployments but cannot be toggled at runtime; if a future build serves English, the RN flag must be inverted via `Updates.reloadAsync()`. Document the constraint.
7. **`erp-app/src/pages/analytics-engine.tsx`** wraps tooltips, tables, and modals each with their own `dir="rtl"` (5 occurrences). Each is an extra DOM hop for the bidi algorithm — consolidate to a single root `dir="rtl"` from `<html>` once P0#1 is fixed.

### P2
8. Inline literal `right: 20` / `left: 20` for floating positions (toasts, FABs) — present in `RealtimeToast.tsx` (`left: 20` confirmed in prior audit, still unfixed) — should be `insetInlineStart: 20`.
9. Tile hover translates use `translateX(-2px)` (positive nudge in LTR, negative in RTL) — see prior audit §2.1 onyx index.html line. Still unfixed.

---

## Hardcoded-strings

**There is no i18n library in any front-end.** No `i18next`, `react-intl`, `react-i18next`, `vue-i18n`, `useTranslation`, or `t()` helper resolves to a translation function in any of the audited surfaces:

- `AI-Task-Manager/artifacts/erp-app/src` — 66 `i18n` occurrences but ALL are local variables (e.g., `i18n` as state, `i18n` as a column key), or `t(` references that resolve to `useToast()` / `t()` from `recharts`. Confirmed by reading `App.tsx`, `main.tsx`, `routes/ai-routes.tsx`, `utils/money.ts`, `lib/collaboration-engine.ts`.
- `AI-Task-Manager/artifacts/erp-mobile` — **zero** `i18n` or `useTranslation` references.
- `techno-kol-ops/client/src` — 18 `i18n` matches; all are local `i18n` strings (data labels), not a translation layer. Hebrew text is inlined in JSX everywhere.

### Volume of inlined Hebrew (sample counts, distinct files containing inline `>...<` Hebrew text in JSX):
| Path | Files w/ inline HE strings |
|---|---:|
| `AI-Task-Manager/artifacts/erp-app/src/pages` | 96+ (sampled top 5; full glob ≥250) |
| `techno-kol-ops/client/src/pages` | 268 across 10 sampled files |
| `erp-app/src/pages` | 50+ (every page sampled) |
| `AI-Task-Manager/artifacts/erp-mobile/app` | 28 in `login.tsx` alone |

Examples (representative, not exhaustive):
- `erp-mobile/app/login.tsx:233` `setError("שגיאה בשליחת בקשה")` — error literal hardcoded in component.
- `erp-mobile/app/login.tsx:236` success literal hardcoded.
- `erp-mobile/app/login.tsx:263` `<Text>מערכת ניהול ארגונית</Text>`
- `erp-mobile/app/login.tsx:283` `<Text>שם משתמש</Text>`, `:295` `placeholder="הזן שם משתמש"`
- `erp-app/src/components/layout.tsx:16-20` `שגיאה בטעינת הדף` / `לא ניתן היה לטעון…` / `נסה שוב` — even the chunk-load error is a literal.
- `AI-Task-Manager/artifacts/erp-app/src/components/ui/unified-states.tsx:15-16` `טוען נתונים...` / `הטעינה לוקחת יותר מהרגיל...`

**Recommendation:** introduce `react-i18next` with a single `locales/he.json` and (for forward compat) `locales/en.json`. Stub `t()` to return key when missing so the codebase can migrate progressively.

---

## Missing-states

| Surface | Loading | Empty | Error | Notes |
|---|:---:|:---:|:---:|---|
| `AI-Task-Manager/artifacts/erp-app` | YES | YES | YES | Has `components/ui/unified-states.tsx` (`LoadingOverlay`, `EmptyState`, `ErrorState`, `ErrorBoundary`). `dashboard.tsx` imports `SkeletonPage` and `ErrorState`. Best in repo. Still ~25% of pages don't import any of them. |
| `techno-kol-ops/client` | **NO** | partial | **NO** | `Dashboard.tsx` and `Pipeline.tsx` have 0 references to `isLoading` / `Skeleton` / error UI. Most pages render whatever `useQuery` returns, so first paint is broken layout. |
| `erp-app` (root) | partial | partial | partial | Some pages (`pages/analytics-engine.tsx`, `pages/forbidden.tsx`) handle states; many do not. No central `EmptyState`. |
| `AI-Task-Manager/artifacts/erp-mobile` | partial | partial | partial | `ActivityIndicator` used per-screen; no global empty/error layout. |
| `onyx-procurement/web/onyx-dashboard.jsx` | partial | partial | partial | Has inline `empty` style but identical text everywhere. |

### Disabled state styling
- `AI-Task-Manager/artifacts/erp-app/src/components/ui/button.tsx` — has `disabled:` Tailwind variant. OK.
- Same for `breadcrumb.tsx`, `calendar.tsx`, `carousel.tsx`, `command.tsx`, `dialog.tsx`, `field.tsx`, `input-group.tsx` (13 occurrences, 8 files). Acceptable for a shadcn/ui project.
- `techno-kol-ops/client` has **no shared button component**; every page renders a `<button>` with inline styles and most omit a `:disabled` style. Buttons remain visually identical when disabled (no `opacity` / `cursor: not-allowed`), which violates WCAG 2.1 SC 1.4.1 for users who can't perceive subtle changes.

---

## A11y-violations

### Already documented in `HEBREW_A11Y_AUDIT.md` and **still not fixed** (re-confirmed 2026-04-29):
- `<div onClick>` for clickable rows / sidebar items (Sidebar.tsx, AlertFeed.tsx, every list).
- No `htmlFor` / `id` pairing on `<label>` / `<input>` (one improvement: `unified-states.tsx` form helpers exist but most pages bypass them).
- No `:focus-visible` outline. Sample: `erp-mobile/app/login.tsx` uses Pressable with no focus indicator.
- No skip-to-main link in any of 5 `index.html` files.
- Emoji + Hebrew labels with no `aria-hidden` on the emoji (Sidebar items, dashboard tiles, `chunk-load error` `⚠️` & `🔄` in `layout.tsx:14/20`).

### New findings (this audit):
- **`erp-app/src/components/layout.tsx:13`** — RTL fallback shell uses *inline-style* `direction: 'rtl'` in JS for the chunk-error fallback. If JS fails to load entirely, no RTL applied because `<html>` itself lacks `dir="rtl"`. Compounds P0#1.
- **`AI-Task-Manager/artifacts/erp-app/src/components/ui/*` aria-label coverage = 4/58 components** (≈7%). Should be near 100% for icon-only buttons.
- **`techno-kol-ops/client` aria-label coverage = 5 occurrences total in src/.** Effectively zero.
- **No `<h1>` on 9 `techno-kol-ops` pages** (`Dashboard.tsx`, `DocumentManagement.tsx`, `InvoicePrint.tsx`, `MobileApp.tsx`, `Project360.tsx`, `Schedule.tsx`, `SignaturePage.tsx`, `SituationDashboard.tsx`, `WorkOrder360.tsx`). `Dashboard.tsx` is the system landing page.
- **No `<h1>` on 1/52 `AI-Task-Manager/artifacts/erp-app` pages sampled** (51 of 52 have `<h1>`; one page in the same set is the unique exception). Better, but heading-skip patterns weren't checked deeply.
- `erp-mobile/app/login.tsx` uses `textAlign="right"` per-input (lines 301 etc.) — works but ignores RN's `writingDirection` API. 22 such occurrences across `ai-chat.tsx`, `chat.tsx`, `approvals.tsx`, `WmsScanner.tsx`, `VoiceFab.tsx`.

### Heading hierarchy
- `techno-kol-ops/client`: 119 heading tags across 30 pages, but 9 pages (incl. Dashboard) have no `<h1>`. Pattern is `<h2>` → `<h2>` → `<h3>` (skips H1).
- `AI-Task-Manager/artifacts/erp-app`: most pages use `<h1>` once and then `<h2>` per section. Acceptable. Heading text is hardcoded Hebrew.
- `erp-mobile`: native, no heading tags — uses `Text` with style — relies on `accessibilityRole="header"` to be set, which it is **not** in `login.tsx` (line 262 `<Text>ERP Mobile</Text>` has no role).

### Responsive breakpoints
- `AI-Task-Manager/artifacts/erp-app` uses Tailwind `sm:` / `md:` / `lg:` widely; no broken pattern detected.
- `techno-kol-ops/client` uses inline styles, **no responsive logic at all** in 23 of 30 pages sampled. Mobile rendering is whatever the desktop layout collapses to. `pages/MobileApp.tsx` exists but is a separate page, not a responsive shell.
- `erp-mobile` is RN — uses `Platform.OS === 'web'` branches; OK.

---

## Recommendations

Priority order (extends the roadmap in `HEBREW_A11Y_AUDIT.md` §6):

1. **(P0, 1 hr)** Add `dir="rtl"` to `erp-app/index.html`. Remove the redundant `<div dir="rtl">` wrappers in 50+ pages once verified.
2. **(P0, 2 days)** Introduce `react-i18next` with `locales/he.json` keyed by component. Codemod the 250+ inline-Hebrew components. Start with `LoginScreen`, `Layout`, `unified-states`, and the 9 missing-`<h1>` pages.
3. **(P0, 1 day)** Replace every literal `borderLeft/Right`, `marginLeft/Right`, `paddingLeft/Right`, `textAlign: 'left'/'right'`, `left:/right:` with logical-property equivalents (`Inline-Start/End`, `start/end`, `inset-inline-start/end`). Single codemod.
4. **(P1, 1 day)** Add `<Bdi>` React helper (`<bdi>{value}</bdi>`) and wrap every value/number/email/IBAN/`₪` in tables, toasts, tooltips. Highest impact: `analytics-engine.tsx`, `company-financials.tsx`, `bom-products.tsx`, `whatsapp-ai.tsx`.
5. **(P1, 1 day)** Standardise on `unified-states.tsx` — port `LoadingOverlay`, `EmptyState`, `ErrorState`, `ErrorBoundary` into `techno-kol-ops/client/src/components/ui/`. Wrap `Dashboard.tsx`, `Pipeline.tsx`, `Employees.tsx` first.
6. **(P1, 1 day)** Add `<h1>` to the 9 `techno-kol-ops` pages without one. Run an axe-core lint in CI.
7. **(P2, half day)** Add `aria-label` to all icon-only buttons in `AI-Task-Manager/artifacts/erp-app/src/components/ui/*` (ratio 4/58 → target ≥50/58).
8. **(P2, half day)** Document the `I18nManager.forceRTL` constraint for `erp-mobile` and add a runtime `useRTL()` hook for future en-localisation.
9. **(P2, ongoing)** Apply the contrast token swaps already specified in Agent-30 §4 (`#5C7080` → `#6B7F94`, `#3D4F6A` → `#52687F`, `#475569` → `#5B6B7F`). 14+ occurrences still pending.

---

## Files Created by This Audit

- `_qa-reports-25/AGENT-10-ui-rtl.md` — this report.

No source files were modified.
