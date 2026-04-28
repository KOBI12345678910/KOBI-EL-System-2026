# AGENT-17 — Compatibility Audit (Browser / Device / RTL)

**Date:** 2026-04-29
**Scope:** Static audit — package configs, HTML entries, CSS, viewport, PWA, mobile-app, RTL.
**Status:** **YELLOW** — solid foundations in `payroll-autonomous`, gaps in `erp-app`, `techno-kol-ops/client`, and `onyx-procurement` SPA. Production-acceptable for desktop Chrome/Edge with Hebrew; **iOS Safari and Android Chrome have known holes**.

---

## 1. Browserslist / Build Targets

| Project | `browserslist` | TS `target` | Build tool |
|---|---|---|---|
| `erp-app` | **none** | `ES2020` | Vite (no `build.target` override) |
| `techno-kol-ops/client` | **none** | `ES2020` | Vite |
| `payroll-autonomous` | **none** | (JS, no tsconfig) | Vite 5 + PWA |
| `onyx-ai` (server-rendered HTML) | n/a | `ES2022` | Plain HTML |
| `onyx-procurement/web` | **none** | n/a | Plain HTML/JSX bundled by server |
| `tsconfig.base.json` | n/a | `ES2022` | — |
| `mobile-app` | n/a | (RN Babel preset) | Expo SDK 51 |

**Finding:** No project pins a `browserslist`. Vite defaults to `modules` browsers (Chrome 87, Firefox 78, Safari 14, Edge 88), which is acceptable for a 2026 ERP, but it should be **explicit** to prevent silent regression. ES2020 features (optional chaining, nullish coalescing, BigInt, dynamic import, `globalThis`) are emitted as-is — **not safe for any iOS Safari < 14 or Edge Legacy**.

---

## 2. Viewport Meta Tags

All shipped `index.html` files include `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.

- **erp-app** — viewport OK; **`<html lang="he">` is set but `dir="rtl"` is MISSING** in the HTML attribute (RTL is forced via `body { direction: rtl }` in CSS only). This breaks accessibility tools and screen readers that read `dir` from the root element before paint.
- **payroll-autonomous** — `lang="he" dir="rtl"` correct, plus full Apple meta (`apple-mobile-web-app-capable`, `status-bar-style`, `apple-mobile-web-app-title`).
- **techno-kol-ops/client** — `lang="he" dir="rtl"` + Apple meta — clean.
- **onyx-ai** — clean.
- No project uses `viewport-fit=cover` → on iPhone notch devices, content does not extend under the safe area. `payroll-autonomous` partially compensates with `env(safe-area-inset-*)` in `MobileLayout.jsx` / `BottomNav.jsx`, but the meta tag is missing — **safe area insets resolve to 0**.

**Action:** Add `dir="rtl"` to `erp-app/index.html`. Add `viewport-fit=cover` to all four web entries.

---

## 3. PWA / Service Worker

| Project | Manifest | SW | Quality |
|---|---|---|---|
| `payroll-autonomous` | `public/manifest.json` (full: shortcuts, lang/dir, maskable icon) + `vite-plugin-pwa` autoUpdate | Hand-rolled `public/sw.js` (cache-first/NetworkFirst/SWR + bg-sync) | **A — production-grade** |
| `erp-app` | (relies on `vite-plugin-pwa` via dependency) | `src/sw-custom.ts` (Workbox: precache + 5 routes including `fonts.googleapis.com`, API cache layers, NavigationRoute) | **B+ — good logic, but `vite-plugin-pwa` not wired in `vite.config.ts`** |
| `techno-kol-ops/client` | `vite-plugin-pwa` declared in package.json | not configured in `vite.config.ts` | **C — dependency declared, never invoked** |
| `onyx-procurement` | none | none | **F** — server-first, no offline (per existing QA-AGENT-68 report). Field-of-use case (construction sites with weak cellular) requires this. |
| `onyx-ai` | none | none | n/a (server status page) |

**Critical:** `erp-app/vite.config.ts` does **not** import `vite-plugin-pwa` → `sw-custom.ts` is dead code, never bundled into a SW. App ships without a service worker despite intent.

---

## 4. RTL / Hebrew Cross-Browser

**Strengths:**
- Tailwind v4 (catalog) auto-emits `:dir(rtl)` variants; no manual flips needed for utilities (`me-` / `ms-` / `start-` / `end-`).
- `payroll-autonomous` consistently uses `paddingInlineStart/End`, `marginInlineStart/End` and `env(safe-area-inset-*)` (logical properties — RTL-safe across all evergreen browsers).
- All HTMLs declare `lang="he"`; manifests declare `lang: 'he', dir: 'rtl'`.

**Issues:**
- **`erp-app/src/index.css:102`** — RTL is set via `body { direction: rtl }` only, not via `<html dir="rtl">`. Components inside iframes, portals, `<dialog>`, or `popover` may inherit `ltr` until body paints. Radix UI primitives in particular check `document.dir` for `Direction.Provider` defaults — without `<html dir="rtl">`, Radix dropdowns/popovers may flip incorrectly on first render.
- **15 erp-app pages** still use physical `left:`/`right:`/`margin-left`/`margin-right`/`float` declarations (tenders, supplier scorecards, BI dashboards, gantt, project profitability). These will visually mirror wrong on RTL.
- **iOS Safari quirks:**
  - Mixed-direction strings (Hebrew + Latin numbers/SKUs) — without explicit `unicode-bidi: plaintext` or `<bdi>` tags, numbers leak to LTR ordering inside RTL paragraphs. **No `<bdi>` or `unicode-bidi` usage found anywhere in the codebase.**
  - `text-align: right` is used in places where `text-align: end` would be RTL-portable.
  - iOS Safari < 16 does not honour `inset-inline-start` in absolute-positioned elements; `payroll-autonomous` uses it heavily — needs `@supports` fallback or browserslist gate.
  - Hebrew web fonts (Assistant, Heebo) are loaded from Google Fonts at runtime (`@import url(fonts.googleapis.com…)` in `erp-app/src/index.css`) — this **blocks first paint**, has no `font-display: swap` override, and fails offline. The SW caches it but only after first online visit.

---

## 5. Mobile-App (`mobile-app/`)

**Verdict:** This is **React Native via Expo SDK 51** — not Capacitor, not a web wrapper.

- Entry: `App.tsx` uses `react-native`, `react-native-safe-area-context`, `react-native-gesture-handler`, `@react-navigation/*`, `expo-secure-store`. Native iOS/Android only — `app.json` declares `"platforms": ["ios", "android"]`, no `"web"` platform configured.
- `app.json` declares iOS `CFBundleLocalizations: ["he","en"]` and `CFBundleDevelopmentRegion: "he"` — correct for Hebrew right-to-left layout (RN reads this and flips `I18nManager.isRTL` automatically).
- However: **no `I18nManager.forceRTL(true)` call found in `App.tsx`.** On Android, RTL only activates if the device locale is Hebrew — Israeli users with English-system phones will see LTR layout.
- React 18.2.0 + RN 0.74.5 — current and supported.

---

## 6. Touch / Pointer Event Handling (Web)

- **3 files** use touch events (`onTouchStart/End/Move`): `field-operations.tsx`, `dynamic-data-view.tsx`, `form-field-components.tsx`.
- Most components rely on click only — **no pointer events** API used. On iOS Safari this produces 300ms tap delay on Safari ≤ 9.3 (mitigated by viewport meta) but also means custom drag (e.g. `@hello-pangea/dnd`, `@dnd-kit`) needs `touch-action: none` to disable browser scrolling. Spot-check confirms `@dnd-kit` ships its own touch sensor — OK, but custom builder pages do not.
- `index.css` adds `min-height: 44px; min-width: 44px` to buttons under 768px → meets Apple HIG / WCAG 2.5.5 tap target.
- `-webkit-overflow-scrolling: touch` set on tables under 768px → good for iOS momentum scroll.

---

## 7. Mobile Breakpoints

- Tailwind v4 default breakpoints (`sm:640 / md:768 / lg:1024 / xl:1280`) used; 18+ occurrences across `erp-app`. No custom breakpoint config.
- `index.css` has a single hand-rolled `@media (max-width: 768px)` that collapses `grid-cols-4..8` to 2 cols (`!important`). Smart fallback, but only applies under 768px — tablet portrait (768–1024) keeps 4–8 col grids → may overflow horizontally.
- No `xs:` / 360px breakpoint for compact phones (Galaxy A series, iPhone SE). Older Hebrew test devices likely affected.

---

## 8. ES2020+ Features Without Transpilation

`tsconfig` targets `ES2020` (`erp-app`, `techno-kol-ops`, `payroll-autonomous`) or `ES2022` (`onyx-ai`, mono base). Vite default `esbuild` target is **`esnext` in dev / browser-modules in build** (Chrome 87 / FF 78 / Safari 14 / Edge 88). Features like:
- `?.`, `??`, `Promise.allSettled` — Safari 14+ ✓
- `??=`, `||=`, `&&=` — Safari 14+ ✓
- `Object.hasOwn`, `at()` — Safari **15.4+** (logical assignment is fine; `Object.hasOwn` is **not used in any source file**)
- top-level `await` — Vite SSR/build only

**Risk:** Any user on iOS 13.x (still ~3% of Israel installed base 2026) gets a white screen. **Recommend explicit `build.target: ['es2020', 'safari14']` and `browserslist: ["last 2 versions", "not dead", "iOS >= 14"]` in `vite.config.ts`.**

---

## 9. Recommendations (P0 → P2)

**P0 (blocking):**
1. Add `dir="rtl"` to `<html>` in `erp-app/index.html`.
2. Wire `vite-plugin-pwa` into `erp-app/vite.config.ts` and `techno-kol-ops/client/vite.config.ts` — both ship dead PWA dependencies.
3. Add `viewport-fit=cover` to the four web `index.html` entries; verify safe-area paddings work on iPhone 14/15 Pro.
4. Pin `browserslist` and Vite `build.target` per project (suggest `["chrome>=90","firefox>=88","safari>=14","edge>=90"]`).
5. Replace `direction: rtl` on `body` with `dir="rtl"` on `<html>` everywhere; Radix UI relies on it.

**P1 (mobile UX in field):**
6. Convert remaining 15 erp-app pages from `left:`/`right:`/`margin-left/right` to logical properties (`inset-inline-start/end`, `margin-inline-*`).
7. Add `<meta name="apple-mobile-web-app-capable">` + Apple touch-icons to `erp-app/index.html` (currently only payroll has them).
8. Self-host Hebrew fonts (Assistant, Heebo) via Vite asset pipeline — current Google-Fonts `@import` blocks first paint and fails offline.
9. Add `font-display: swap`.
10. mobile-app: call `I18nManager.forceRTL(true)` at app boot; reload bundle if `isRTL !== true` (RN docs pattern). Otherwise English-locale Android phones render LTR.

**P2 (polish):**
11. Wrap mixed Hebrew+Latin runs with `<bdi>` or `unicode-bidi: isolate` — currently zero usage; numbers and SKUs may misorder on iOS Safari.
12. Add `xs:` (≤ 360px) Tailwind breakpoint for legacy Android.
13. Set `text-align: end` instead of `text-align: right` in components meant to be locale-portable.
14. Add `onyx-procurement` PWA shell (per existing QA-AGENT-68 — known F grade; field workers need offline RFQ queueing).
15. Add Lighthouse PWA / Accessibility CI gate per service.

---

## Appendix — Files inspected

- `erp-app/index.html`, `erp-app/src/index.css`, `erp-app/src/main.tsx`, `erp-app/src/sw-custom.ts`, `erp-app/vite.config.ts`, `erp-app/package.json`, `erp-app/tsconfig.json`
- `payroll-autonomous/index.html`, `payroll-autonomous/public/manifest.json`, `payroll-autonomous/public/sw.js`, `payroll-autonomous/vite.config.js`, `payroll-autonomous/src/mobile/MobileLayout.jsx`, `payroll-autonomous/src/mobile/BottomNav.jsx`
- `techno-kol-ops/client/index.html`, `techno-kol-ops/client/package.json`
- `onyx-ai/index.html`
- `mobile-app/package.json`, `mobile-app/app.json`, `mobile-app/App.tsx`
- `tsconfig.base.json`, root `package.json`
- Cross-referenced existing `_qa-reports/AG-X19-pwa-offline.md`, `_qa-reports/AG-X20-mobile-responsive.md`, `onyx-procurement/QA-AGENT-68-PWA.md`, `onyx-procurement/QA-AGENT-36-MOBILE.md`.
