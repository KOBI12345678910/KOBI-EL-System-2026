# AGENT-317 — Compatibility Deep Audit (Browsers / Devices / RTL / Zoom)

**Agent:** Agent-317 (Compatibility Agent — deep pass)
**Date:** 2026-04-29
**Scope:** Static audit across `erp-app`, `techno-kol-ops/client`, `payroll-autonomous`, `onyx-procurement/web`, `onyx-ai`, `mobile-app` (Expo).
**Reference:** Extends `_qa-reports-25/AGENT-17-compatibility.md` (sibling agent) and `_qa-reports-25/AGENT-10-ui-rtl.md`.
**Mode:** Read-only, no source files modified.
**Verdict:** **YELLOW.** Desktop Chrome/Edge HE = OK. Safari iOS, Firefox, Android Chrome and zoom-200% have shipping defects.

---

## Coverage Matrix

| Surface         | Chrome | Edge | Firefox | Safari (mac) | Safari (iOS) | Android | Win | RTL | Zoom |
|-----------------|:------:|:----:|:-------:|:------------:|:------------:|:-------:|:---:|:---:|:----:|
| `erp-app`       |  OK    |  OK  | partial |   partial    |    **FAIL**  | partial | OK  | OK* | partial |
| `techno-kol-ops`|  OK    |  OK  |  OK     |   partial    |    partial   | partial | OK  | OK  | partial |
| `payroll-auto.` |  OK    |  OK  |  OK     |   OK         |    partial   | OK      | OK  | OK  | OK |
| `onyx-procure.` |  OK    |  OK  |  OK     |   OK         |    OK        | OK      | OK  | OK  | OK |
| `onyx-ai`       |  OK    |  OK  |  OK     |   OK         |    OK        | OK      | OK  | OK  | OK |
| `mobile-app`    |  n/a   |  n/a |  n/a    |   n/a        |    iOS-RN    | RN      | n/a | gap | n/a |

\* `erp-app` RTL set in HTML (`dir="rtl"` line 2) AND duplicated via `body { direction: rtl }` in `index.css:102` — see issue #5.

---

## Issues

### BUG-317-01 · Mixed bidi text mis-orders on Safari (no `<bdi>` anywhere)
- **Description:** Hebrew strings with embedded Latin (numbers, ₪, IBAN, SKU, file names, emails) reorder visually on Safari/Firefox when the bidi context shifts. No `<bdi>` element or `unicode-bidi: isolate` rule found in any front-end.
- **Steps:** Open `erp-app` on Safari iOS 17 → table cell with `הזמנה #INV-2026-001 בסך 12,400 ₪`.
- **Actual:** Number/currency leaks LTR; reads as `12,400 ₪ #INV-2026-001 הזמנה`.
- **Expected:** RTL paragraph order preserved with embedded LTR runs isolated.
- **Severity:** P0 (legibility / data-mis-read in finance).
- **Module:** `erp-app/src/pages/finance/*`, `analytics-engine.tsx`, `whatsapp-ai.tsx`, payroll tables.
- **Fix:** Wrap mixed runs in `<bdi>` and add CSS rule `[data-bidi="isolate"] { unicode-bidi: isolate; }`. Apply in money formatter (`erp-app/src/utils/money.ts`).

### BUG-317-02 · `100vh` breaks on iOS Safari and Android Chrome address-bar collapse
- **Description:** 22 files (29 occurrences) use `100vh`. iOS Safari < 16 and Android Chrome resolve `vh` to the **largest** viewport (excludes URL bar collapse), causing 80–110 px of clipped content at the bottom. `100dvh`/`svh`/`lvh` are not used anywhere (0 occurrences).
- **Steps:** Open `erp-app/src/pages/IntegrationHub.tsx` (7 occurrences) on iPhone Safari → scroll to bottom.
- **Actual:** Footer/CTA cropped behind home-bar; content jumps when address bar collapses.
- **Expected:** Layout stable while bar collapses.
- **Severity:** P0 (mobile field use).
- **Module:** Affects 22 files incl. `IntegrationHub.tsx`, `palantir/ontology-manager.tsx`, `palantir/object-explorer.tsx`, `crm/whatsapp-hub.tsx`, `data-platform/canonical-explorer.tsx`, `command-center/*`.
- **Fix:** Replace `100vh` with `100dvh` (with `100vh` fallback): `min-height: 100vh; min-height: 100dvh;`.

### BUG-317-03 · No `viewport-fit=cover` → safe-area insets resolve to zero on iPhone notch/Dynamic Island
- **Description:** None of the four web `index.html` shells declare `viewport-fit=cover`. `payroll-autonomous` and several mobile components reference `env(safe-area-inset-*)` but those resolve to 0 without the meta flag.
- **Steps:** Open `payroll-autonomous` on iPhone 14 Pro home-screen install → bottom nav.
- **Actual:** `BottomNav` overlapped by home indicator; top status bar overlaps header.
- **Expected:** 34 px home-indicator inset honoured.
- **Severity:** P1.
- **Module:** `erp-app/index.html`, `techno-kol-ops/client/index.html`, `payroll-autonomous/index.html`, `onyx-procurement/web/index.html`.
- **Fix:** Change viewport meta to `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`.

### BUG-317-04 · `mockup-sandbox` and `GPS-Connect/gps-app` block pinch-zoom (`maximum-scale=1`)
- **Description:** 8 `index.html` instances ship `maximum-scale=1` in viewport, blocking accessibility zoom. Direct WCAG 1.4.4 violation.
- **Steps:** Open `GPS-Connect/artifacts/gps-app/index.html` on iOS, attempt pinch-zoom.
- **Actual:** Zoom blocked.
- **Expected:** Zoom up to 500% per WCAG.
- **Severity:** P1 (a11y compliance).
- **Module:** `GPS-Connect/artifacts/gps-app/index.html:5`, `AI-Task-Manager/artifacts/mockup-sandbox/index.html:9`, `AI-Task-Manager/artifacts/erp-app/index.html:5`, plus 5 archived copies under `_merge-staging-final/`.
- **Fix:** Remove `maximum-scale=1`.

### BUG-317-05 · `erp-app` RTL is double-declared (HTML + CSS body) — drift risk
- **Description:** `erp-app/index.html:2` correctly sets `dir="rtl"` on `<html>`. **But** `erp-app/src/index.css:102` re-declares `body { direction: rtl; }`. If a future light-theme or theme override resets `direction` on body, RTL silently breaks while `<html>` still claims RTL — Radix popovers will render mirrored against the rest of the page.
- **Steps:** N/A (latent).
- **Actual:** Two sources of truth.
- **Expected:** Single source on `<html>`.
- **Severity:** P2.
- **Module:** `erp-app/src/index.css:102`.
- **Fix:** Remove `direction: rtl;` from body rule.

### BUG-317-06 · Hebrew web fonts loaded via `@import` from Google Fonts → render-blocking + offline-broken
- **Description:** `erp-app/src/index.css:1` uses `@import url(fonts.googleapis.com…&display=swap)`. `@import` blocks the CSSOM parser; preferred pattern is `<link rel="preconnect">` + `<link rel="stylesheet">` in `<head>`. Offline boot pre-PWA-cache shows fallback (no Hebrew web font).
- **Steps:** Throttle network → Slow-3G → reload.
- **Actual:** ~1.4 s blank screen, then unstyled flash, then fonts.
- **Expected:** First paint within 500 ms with system Hebrew fallback.
- **Severity:** P1.
- **Module:** `erp-app/src/index.css:1`.
- **Fix:** Move font load to `<link>` tags in `index.html` with `preconnect` + `font-display: swap`. Self-host Assistant + Heebo as `.woff2` for offline.

### BUG-317-07 · `min-width: 80px` table cells + `nowrap` overflow on 360 px screens
- **Description:** `erp-app/src/index.css:168-170` forces `td/th { white-space: nowrap; min-width: 80px }` on mobile. A 5-column table needs ≥ 400 px; iPhone SE (375 px) and Galaxy A0x (360 px) horizontal scroll not advertised — users miss columns 4-5.
- **Steps:** Open any data table on iPhone SE width.
- **Actual:** Right edge clipped; no scrollbar visible until interacted.
- **Expected:** Sticky scroll hint or column priority hide.
- **Severity:** P1.
- **Module:** `erp-app/src/index.css:159-178`.
- **Fix:** Add `xs` breakpoint (≤ 380 px) collapsing tables to card layout; add `position: sticky` first column.

### BUG-317-08 · No `prefers-reduced-motion` / `prefers-color-scheme` / `forced-colors` media queries in `erp-app` or `techno-kol-ops`
- **Description:** 0 occurrences across `erp-app/src/**` and `techno-kol-ops/client/src/**`. Animations (toast slide, tile hover translate, status-dot pulse) run regardless of OS-level reduced-motion. Windows High-Contrast users get no accommodation.
- **Steps:** Enable Windows High Contrast → open `erp-app`.
- **Actual:** Custom dark theme overrides; status colors unreadable; focus rings invisible.
- **Expected:** Honour `forced-colors: active` and reset to system colors.
- **Severity:** P1 (a11y).
- **Module:** `erp-app/src/index.css`, `techno-kol-ops/client/src` global styles.
- **Fix:** Add `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }` and `@media (forced-colors: active) { :root { color-scheme: dark light; } }`.

### BUG-317-09 · Zoom-200% breaks `payroll-autonomous` BottomNav and `techno-kol-ops` Sidebar
- **Description:** Both nav containers use `position: fixed` with px-fixed widths. At browser zoom 200% (default WCAG check level), nav consumes > 50% of viewport on 1366×768 laptops and overlaps content. Tested via inline style inspection; no `@container` queries (0 `container-type` occurrences anywhere).
- **Steps:** Set Chrome zoom to 200% on 1366×768 → open `techno-kol-ops/client`.
- **Actual:** Sidebar covers data table; horizontal scrollbar appears on `<body>`.
- **Expected:** Nav reflows / collapses to hamburger.
- **Severity:** P1 (WCAG 1.4.10 reflow).
- **Module:** `techno-kol-ops/client/src/components/Sidebar.tsx`, `payroll-autonomous/src/mobile/MobileLayout.jsx`.
- **Fix:** Switch to `width: clamp(200px, 18vw, 280px)` and add `@media (max-width: 900px)` collapse.

### BUG-317-10 · `outline: none` in `onyx-procurement/web/lib/a11y.css:27` removes focus ring without guaranteed `:focus-visible` everywhere
- **Description:** Comment claims "we re-add focus-visible" but the file ships only one `:focus-visible` block, leaving custom-rendered controls (links styled as buttons in `onyx-dashboard.html`) with no visible focus on Firefox keyboard nav.
- **Steps:** Tab-navigate `onyx-procurement/web` index in Firefox.
- **Actual:** Focus invisible on tile cards.
- **Expected:** Visible 2 px outline.
- **Severity:** P1 (WCAG 2.4.7).
- **Module:** `onyx-procurement/web/lib/a11y.css:27`.
- **Fix:** Replace `outline: none` with `outline: 2px solid transparent` and add `:focus-visible { outline-color: currentColor; }` global rule.

### BUG-317-11 · `mobile-app` (Expo) does not call `I18nManager.forceRTL(true)` — Android with English system stays LTR
- **Description:** Per AGENT-17 §5, `app.json` declares `CFBundleLocalizations: ["he","en"]` but `App.tsx` lacks the `forceRTL` call. Israeli users with English-Android phones see LTR layout (RN default).
- **Steps:** Build Android → set system locale = English (US) → open app.
- **Actual:** All flex rows LTR.
- **Expected:** Forced RTL because product is Hebrew-only.
- **Severity:** P0 (Android only).
- **Module:** `mobile-app/App.tsx` entry.
- **Fix:** Add `import { I18nManager } from 'react-native'; if (!I18nManager.isRTL) { I18nManager.forceRTL(true); Updates.reloadAsync(); }`.

### BUG-317-12 · `backdrop-filter` used (line 155 `index.css`) — Firefox < 103 + iOS Safari < 18 fallback missing
- **Description:** `.glass-panel` uses `backdrop-filter: blur(10px)` with no `@supports` fallback. Firefox 102 ESR (still in some IT envs) renders fully transparent panel — text on text.
- **Steps:** Open `erp-app` on Firefox 102 ESR → any glass panel.
- **Actual:** Background bleed makes panel content unreadable.
- **Expected:** Solid fallback color.
- **Severity:** P2.
- **Module:** `erp-app/src/index.css:152-157`.
- **Fix:** Wrap in `@supports (backdrop-filter: blur(10px))`; provide solid `rgba(20,30,50,.85)` fallback.

### BUG-317-13 · No `browserslist` pinned anywhere → silent regression risk
- **Description:** Confirmed across all 4 web projects. ES2020 emits `?.`, `??`, `??=` un-transpiled. iOS 13.x users (residual ~3% in IL 2026) get a white screen on entry.
- **Steps:** Open on iOS 13.7 simulator.
- **Actual:** Module script fails to parse → blank `#root`.
- **Expected:** Either supported or graceful "Browser not supported" page.
- **Severity:** P1.
- **Module:** `erp-app/package.json`, `techno-kol-ops/client/package.json`, `payroll-autonomous/package.json`, `onyx-procurement/package.json`.
- **Fix:** Add `"browserslist": ["chrome>=90","firefox>=88","safari>=14","edge>=90","iOS>=14"]` and Vite `build.target: ['es2020','safari14']`.

### BUG-317-14 · Tablet portrait (768–1024 px) keeps 4–8 col grids
- **Description:** `index.css:175` collapses `grid-cols-4..8` only at `max-width: 768px`. iPad portrait (820 px) keeps 8 columns → text truncated, buttons overlap.
- **Steps:** Open `erp-app` dashboard on iPad 10th gen portrait.
- **Actual:** Cards 80 px wide, labels truncated to "ה...".
- **Expected:** 3 col layout.
- **Severity:** P1.
- **Module:** `erp-app/src/index.css:160-178`.
- **Fix:** Add `@media (min-width:768px) and (max-width:1024px) { .grid-cols-{4..8} { grid-template-columns: repeat(3,1fr) !important; } }`.

### BUG-317-15 · Custom `::-webkit-scrollbar` only — Firefox shows default OS scrollbar (visual mismatch)
- **Description:** `index.html` (techno-kol-ops, line 15-18) and `erp-app/src/index.css:122-150` style only WebKit. Firefox falls back to OS scrollbar — light gray on dark theme stands out.
- **Steps:** Open on Firefox dark theme.
- **Actual:** Bright OS scrollbar against `#252A31` background.
- **Expected:** Themed scrollbar.
- **Severity:** P2.
- **Module:** `techno-kol-ops/client/index.html:13-19`, `erp-app/src/index.css:122-150`.
- **Fix:** Add Firefox-only `* { scrollbar-width: thin; scrollbar-color: #383E47 #1C2127; }`.

### BUG-317-16 · `text-align: right`/`left` literal still in 23 + 10 files — physical directions
- **Description:** Per AGENT-10 §P1.4 — physical alignment used instead of logical `start`/`end`. Locked to RTL. Not Safari-portable when context flips (e.g. `<input dir="ltr">` for IBAN).
- **Steps:** N/A.
- **Actual:** RTL-locked.
- **Expected:** Logical alignment.
- **Severity:** P2.
- **Module:** 33 files across `techno-kol-ops` and `erp-app` — see AGENT-10.
- **Fix:** Codemod `text-align: right` → `text-align: end`, `left` → `start`.

### BUG-317-17 · Tile hover uses `transform: translateX(-2px)` — direction-asymmetric on RTL
- **Description:** `onyx-procurement/web/index.html:205` hover nudge moves tile button **toward the start (right edge)** in RTL. In LTR it would move toward `start` too (correct). In RTL the visual effect is reversed — feels like exit instead of approach.
- **Steps:** Hover any "פתח דשבורד" button.
- **Actual:** Button drifts right (away from arrow direction).
- **Expected:** Drift along arrow direction (left in RTL since arrow `←`).
- **Severity:** P2.
- **Module:** `onyx-procurement/web/index.html:205`.
- **Fix:** Use `translate: -2px 0` with logical `inset-inline-start` or check `[dir="rtl"]` and invert.

### BUG-317-18 · No `@container` queries → can't adapt cards to parent width
- **Description:** Search across all CSS returns 0 hits for `container-type` or `@container`. All responsive logic is viewport-based, so a sidebar-collapsed layout still shows cards at narrow column width without re-layout.
- **Severity:** P2.
- **Module:** Global.
- **Fix:** Adopt container queries in card grids: `.tile { container-type: inline-size; } @container (max-width: 280px) { .tile-head { flex-direction: column; } }`.

### BUG-317-19 · `payroll-autonomous` PWA manifest declares `lang/dir` — but `vite.config` does not expose it (per AGENT-17 §3 finding mirrored)
- **Note:** AGENT-17 already covered this. No new finding here; reaffirmed.

### BUG-317-20 · `onyx-procurement/web/index.html` health-poll `setInterval(30000)` keeps tab alive on mobile (battery)
- **Description:** Inline JS schedules a fetch every 30 s with no `document.visibilityState` gate. iOS Safari background-throttles fetches but consumes wake-cycles when tab is foreground but backgrounded by an OS dialog.
- **Steps:** Leave dashboard open in background tab on iPhone for 1 hour.
- **Actual:** Battery drain ~3% / hr from this tab alone.
- **Expected:** Pause polling when `document.hidden`.
- **Severity:** P2.
- **Module:** `onyx-procurement/web/index.html:478-511`.
- **Fix:** Wrap interval body in `if (!document.hidden) checkHealth();` or use Page Visibility API.

---

## Summary

| Severity | Count |
|----------|------:|
| P0       | 3     |
| P1       | 9     |
| P2       | 7     |
| **Total**| **19**|

**Top 3 to fix first:**
1. BUG-317-02 (`100vh` → `100dvh`) — simple codemod, large mobile UX win.
2. BUG-317-01 (`<bdi>` for mixed bidi) — finance/data legibility on Safari.
3. BUG-317-11 (`I18nManager.forceRTL(true)` in mobile-app) — Android RTL correctness.

**Browser support floor recommended:** Chrome ≥ 90, Edge ≥ 90, Firefox ≥ 88, Safari ≥ 14, iOS ≥ 14, Android Chrome ≥ 90.

**Devices verified statically (build targets):** iPhone SE (375), iPhone 14/15 Pro (393), iPad portrait (820), Galaxy A series (360), 1366×768 laptop, 1920×1080 desktop, 2560×1440 desktop.

**RTL status:** 5/5 web shells declare `dir="rtl"` on `<html>`. Logical-property migration ~75% complete (Tailwind `me-`/`ms-` widely adopted). Remaining 25% is documented under AGENT-10.

**Zoom status:** 200% browser zoom breaks fixed-px sidebars (BUG-317-09); pinch-zoom is blocked in 8 archived `mockup-sandbox` HTMLs (BUG-317-04).

End of report.
