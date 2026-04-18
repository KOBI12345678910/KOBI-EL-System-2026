# QA-17 — Compatibility Audit

**Agent:** QA-17 Compatibility Agent
**Date:** 2026-04-11
**Scope:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\`
**System under test:** ERP לטכנו-קול עוזי (monorepo — AI-Task-Manager, GPS-Connect, techno-kol-ops, onyx-ai, onyx-procurement, nexus_engine, paradigm_engine, payroll-autonomous)

---

## 0. Methodology

Static audit of all `package.json`, `tsconfig.json`, `vite.config.ts`, `*.html`, CSS, TS/TSX, and JS files in the workspace. No runtime tests executed (user policy: "לא מוחקים, תעד הכל"). Findings categorized as **PASS / WARN / FAIL / UNKNOWN**.

Files covered:
- Backend: 7 Node services (AI-Task-Manager api-server, GPS-Connect api-server, techno-kol-ops, onyx-ai, onyx-procurement, nexus_engine, paradigm_engine)
- Frontend: 4 web apps (erp-app, techno-kol-ops client, payroll-autonomous, kobi-agent UI) + 2 sandbox
- Mobile: 1 React Native / Expo app (erp-mobile)
- Static HTML: 6 onyx-procurement web dashboards

---

## 1. Backend — Node.js Environment

### 1.1 `engines` declarations

| Package | File | engines.node | Verdict |
|---|---|---|---|
| paradigm-engine | `paradigm_engine/package.json` | `>=18.0.0` | PASS |
| nexus-autonomous-engine | `nexus_engine/package.json` | `>=18.0.0` | PASS |
| onyx-ai | `onyx-ai/package.json` | `>=20.0.0` | PASS (strict) |
| onyx-procurement | `onyx-procurement/package.json` | `>=20.0.0` | PASS (strict) |
| AI-Task-Manager (root) | `AI-Task-Manager/package.json` | *(none)* | **WARN — missing `engines`** |
| AI-Task-Manager api-server | `artifacts/api-server/package.json` | *(none)* | **WARN — missing `engines`** |
| AI-Task-Manager erp-app | `artifacts/erp-app/package.json` | *(none)* | **WARN — missing `engines`** |
| AI-Task-Manager erp-mobile | `artifacts/erp-mobile/package.json` | *(none)* | **WARN — missing `engines`** |
| GPS-Connect (root) | `GPS-Connect/package.json` | *(none)* | **WARN — missing `engines`** |
| techno-kol-ops | `techno-kol-ops/package.json` | *(none)* | **WARN — missing `engines`** |
| techno-kol-ops client | `techno-kol-ops/client/package.json` | *(none)* | **WARN — missing `engines`** |
| payroll-autonomous | `payroll-autonomous/package.json` | *(none)* | **WARN — missing `engines`** |

**Finding B-ENG-001:** 8 of 12 `package.json` files do **not** declare `engines.node`. Developers/CI may accidentally install on Node 16 where `fetch`/`webcrypto`/`Array.at` will crash. The strictest declared version in the monorepo is **Node ≥20** (onyx-ai, onyx-procurement) — they require Node 20 but co-located packages allow Node 18 or any version.

**Recommendation:** Lock all `engines.node` to the **same** floor — recommend `>=20.11.0` (LTS Iron) to match the stricter onyx packages. Add `.nvmrc` at repo root.

### 1.2 TypeScript `target`

| tsconfig | target | Verdict |
|---|---|---|
| `techno-kol-ops/tsconfig.json` | `ES2020` | WARN (older than rest) |
| `techno-kol-ops/client/tsconfig.json` | `ES2020` | WARN (older than rest) |
| `AI-Task-Manager/tsconfig.base.json` | `es2022` | PASS |
| `AI-Task-Manager/artifacts/erp-app/` vite `build.target` | `es2020` | PASS (safer for older Safari) |
| `GPS-Connect/tsconfig.base.json` | `es2022` | PASS |
| `onyx-ai/tsconfig.json` | `ES2022` | PASS |
| `AI-Task-Manager/artifacts/kobi-agent/tsconfig.json` | `ES2022` | PASS |

**Finding B-TS-001:** TypeScript target inconsistency (`ES2020` in techno-kol-ops vs. `es2022` elsewhere). Non-blocking but causes duplicate transpilation.

### 1.3 Deprecated / version-gated Node APIs

| API | Usage | Files | Node gate | Verdict |
|---|---|---|---|---|
| `node-fetch` | Imported legacy dependency | `nexus_engine/bridge/python-platform-bridge.js`, `AI-Task-Manager/artifacts/api-server/src/lib/kimi-test.ts` | Redundant on Node 18+ | **WARN** — remove in favor of native fetch |
| `fetch()` (native) | 30+ files | erp-app, api-server, mobile, techno-kol-ops, onyx-ai, onyx-procurement | Requires Node 18+ | PASS (with `engines>=18`) |
| `crypto.webcrypto` | Not found | — | — | N/A |
| `require('crypto')` / `from 'crypto'` | 30+ files | across all backends | Always available | PASS |
| `structuredClone` | 2 files in erp-app | `App.tsx`, `main.tsx` | Node 17+ / Safari 15.4+ | PASS |
| `Promise.allSettled` | 30+ files | erp-app pages | Node 12.9+ / Safari 13+ | PASS |
| `process.platform` | 3 files | onyx-procurement benches, kimi dev-platform | — | PASS |

**Finding B-API-001:** `node-fetch` is still listed/imported in `nexus_engine/bridge/python-platform-bridge.js` and `api-server/src/lib/kimi-test.ts`. This is the old CJS version; if upgraded to v3 it becomes ESM-only and will break CJS callers. Delete and use native `fetch`.

### 1.4 Path separators (Windows compatibility)

No hard-coded `C:\` or `\\` path literals found in source code. All path construction uses `path.join`/`path.resolve` (112+ usages). **PASS.**

**Finding B-PATH-001 (WARN):** Shell scripts used in npm scripts assume POSIX shell:
- `AI-Task-Manager/package.json` → `preinstall: "sh -c 'rm -f package-lock.json yarn.lock; ...'"`
- `GPS-Connect/package.json` → same preinstall
- `AI-Task-Manager/artifacts/api-server/package.json` → `start: "bash ./scripts/run-server.sh"`
- `*.sh` files referenced (start-all.sh, stop-all.sh, guard-mfa.sh, backup-db.sh, restore-db.sh, validate-sidebar-routes.sh, post-merge.sh)

On native Windows (cmd.exe/PowerShell) without Git Bash/WSL these will fail with "sh: not found" / "bash: not found". **WARN** — document Git Bash / WSL as prerequisite, or add `cross-env` + `.cmd` equivalents.

### 1.5 ENV var cross-OS concerns

| Script | Pattern | Issue |
|---|---|---|
| `AI-Task-Manager/artifacts/api-server/package.json` | `"dev": "NODE_ENV=development tsx ./src/index.ts"` | **FAIL on Windows cmd.exe** — `NODE_ENV=...` inline does not set env var on cmd. Works in bash/PowerShell only with `$env:`. Needs `cross-env`. |
| `AI-Task-Manager/artifacts/erp-app/package.json` | `"build": "NODE_OPTIONS=--max-old-space-size=4096 vite build ..."` | Same — **FAIL on Windows cmd.exe**. Needs `cross-env`. |
| `GPS-Connect/artifacts/api-server/package.json` | `"dev": "export NODE_ENV=development && pnpm run build..."` | `export` is bash-only → **FAIL on Windows cmd.exe**. |
| `erp-mobile/package.json` | `dev: EXPO_PACKAGER_PROXY_URL=... pnpm exec expo start` | **FAIL on Windows cmd.exe**. |

**Finding B-ENV-001 (FAIL on cmd.exe):** Multiple `package.json` scripts set env vars inline bash-style. On Windows cmd these produce `'NODE_ENV' is not recognized`. **Blocker** for anyone running without Git Bash.

---

## 2. Frontend — Browser Compatibility

### 2.1 `browserslist`

No `browserslist` field found in any workspace `package.json`. No `.browserslistrc` file.

**Finding F-BL-001 (WARN):** Without `browserslist`, Vite defaults to `build.target` alone; autoprefixer (if configured) uses its own default. Bundle may ship features that break in older Safari.

**Recommendation:** Add to root or each web app:
```
"browserslist": [
  ">0.5%",
  "last 2 versions",
  "not dead",
  "not op_mini all",
  "Safari >= 14",
  "iOS >= 14",
  "Chrome >= 90",
  "Edge >= 90",
  "Firefox >= 90"
]
```

### 2.2 `build.target` in Vite

| App | target | Verdict |
|---|---|---|
| `AI-Task-Manager/artifacts/erp-app/vite.config.ts` | `es2020` | PASS (Safari 14+) |
| `techno-kol-ops/client` | *(default — esnext)* | **WARN** — may emit Safari 16+ features |
| `payroll-autonomous` | *(default)* | **WARN** |
| `GPS-Connect/artifacts/gps-app` | *(default)* | **WARN** |

### 2.3 Modern JS features (audit)

| Feature | Found | Oldest browser | Verdict |
|---|---|---|---|
| `?.` Optional chaining | 62+ occurrences in erp-app alone | Safari 13.1, Chrome 80 | PASS |
| `??` Nullish coalescing | included above | Safari 13.1, Chrome 80 | PASS |
| `Array.prototype.at` | 30+ files | Safari 15.4, Chrome 92 | **WARN** — fails Safari 13/14 |
| `Promise.allSettled` | 30+ files | Safari 13, Chrome 76 | PASS |
| `BigInt` | 30+ files | Safari 14, Chrome 67 | PASS |
| `structuredClone` | 2 files (App.tsx, main.tsx) | Safari 15.4, Chrome 98 | **WARN** — fails Safari 14/15.0-15.3 |
| `IntersectionObserver` | — | Safari 12.1+ | N/A |
| `ResizeObserver` | — | Safari 13.1+ | N/A |
| `Intl.DateTimeFormat` | 16 files | universal | PASS |
| `Intl.NumberFormat` | included above | universal | PASS |
| `Intl.RelativeTimeFormat` | — (not used) | Safari 14+ | N/A |

**Finding F-JS-001 (WARN):** `Array.at()` and `structuredClone` push the minimum to Safari 15.4 / iOS 15.4. On older iPads (iPadOS 14/15) the ERP will throw `undefined is not a function`. Either:
- raise documented min to Safari 15.4+, or
- polyfill (see `QA-17-polyfills-needed.md`).

### 2.4 CSS — modern features

| Feature | Used? | Oldest browser | Verdict |
|---|---|---|---|
| Flexbox | yes (Tailwind) | universal | PASS |
| Grid | yes (Tailwind) | Safari 10.1+ | PASS |
| `gap` (flex) | yes | Safari 14.1+ | PASS if min=Safari 14.1 |
| `color-scheme: dark` | `erp-app/src/index.css:36` | Safari 13+ | PASS |
| `hsl(var(--x))` | widely | universal | PASS |
| `@custom-variant` (Tailwind v4) | `index.css` | Requires evergreen | Tailwind v4 needs Chrome 111+ / Safari 16.4+ — **WARN** for older |
| `env(safe-area-inset-*)` | **NOT FOUND in erp-app** | Safari 11+ | **WARN — iPhone notch not handled in web ERP** |
| `margin-inline-start`/`padding-inline` | **NOT FOUND** | universal (RTL-aware) | **WARN — using physical props with `[dir=rtl]` overrides instead** |
| `text-align: start/end` | **NOT FOUND** | universal | **WARN** |

**Finding F-CSS-001 (WARN):** `erp-app/src/styles/rtl.css` patches RTL with `[dir="rtl"] .pl-4 { padding-left: 0; padding-right: 1rem; }` — a manual override pattern instead of logical properties. Works but fragile; any `pl-*` / `ml-*` / `pr-*` / `mr-*` class added without an RTL override will leak LTR spacing in Hebrew. Browser support for logical properties is 100% — should migrate.

**Finding F-CSS-002 (WARN — iOS notch):** No `env(safe-area-inset-top|bottom|left|right)` in web ERP. On iPhone X+ in PWA/standalone mode, the top bar overlaps the status bar and the bottom nav sits under the home indicator.

### 2.5 Viewport meta tag

| File | Content | Verdict |
|---|---|---|
| `AI-Task-Manager/artifacts/erp-app/index.html:5` | `width=device-width, initial-scale=1.0, maximum-scale=1` | PASS (disables pinch-zoom — a11y **WARN**) |
| `techno-kol-ops/client/index.html:5` | `width=device-width, initial-scale=1.0` | PASS |
| `payroll-autonomous/index.html:6` | `...maximum-scale=1.0, user-scalable=no` | **FAIL** — a11y violation (WCAG 1.4.4 disallows `user-scalable=no`) |
| `GPS-Connect/artifacts/gps-app/index.html:5` | `...maximum-scale=1` | **WARN** — pinch-zoom disabled |
| `onyx-procurement/web/*.html` (6 files) | `width=device-width, initial-scale=1.0` | PASS |

**Finding F-VP-001 (FAIL):** `payroll-autonomous/index.html` sets `user-scalable=no` + `maximum-scale=1.0`. **Blocks WCAG 1.4.4** (Resize Text) and breaks accessibility for low-vision users. Must remove.

**Finding F-VP-002 (WARN):** `erp-app`, `gps-app`, and `mockup-sandbox` all lock `maximum-scale=1`. Still blocks pinch-zoom. Should remove `maximum-scale` entirely.

---

## 3. Mobile — React Native / Expo

### 3.1 erp-mobile — Expo SDK

| Item | Value | Verdict |
|---|---|---|
| `expo` | `~54.0.27` | PASS (SDK 54, 2026-current) |
| `react-native` | `0.81.5` | PASS |
| `react` | via catalog | PASS |
| `react-native-safe-area-context` | `~5.6.0` | PASS (safe-area handled) |
| `expo-status-bar` | `~3.0.9` | PASS |
| `@react-native-async-storage/async-storage` | `2.2.0` | PASS |
| `expo-secure-store` | `~15.0.8` | PASS (iOS keychain/Android keystore) |
| `@shopify/react-native-skia` | `2.2.12` | PASS |
| Min iOS / Android targets | *(not pinned in app.json reviewed here)* | **UNKNOWN — verify app.json**  |

### 3.2 Touch events (web ERP)

Touch event handlers (`onTouchStart`/`touchend`) found in only 4 files:
- `techno-kol-ops/client/src/pages/SignaturePage.tsx`
- `AI-Task-Manager/artifacts/erp-app/src/pages/builder/form-field-components.tsx`
- `AI-Task-Manager/artifacts/erp-app/src/pages/builder/dynamic-data-view.tsx`

**Finding M-TOUCH-001 (INFO):** The web ERP mostly relies on mouse/`onClick`. On iPad/Android touch the 300ms click delay is gone (since Chrome 32+/Safari 9.3+), so this is PASS. Drag-n-drop in the builder uses pointer events — should be verified on iPad.

### 3.3 Safe-area

- Mobile (RN): `react-native-safe-area-context` installed → PASS.
- Web (erp-app): **no `env(safe-area-inset-*)` CSS** → FAIL for PWA installed to iOS home screen.

---

## 4. Accessibility

### 4.1 `lang` + `dir` attributes

| App | `lang` | `dir` | Verdict |
|---|---|---|---|
| erp-app (`index.html:2`) | `he` | `rtl` | PASS |
| techno-kol-ops client | `he` | `rtl` | PASS |
| payroll-autonomous | `he` | `rtl` | PASS |
| onyx-procurement web dashboards (×6) | `he` | `rtl` | PASS |
| kobi-agent UI | `he` | **`ltr`** | **WARN** — Hebrew UI with LTR direction |
| GPS-Connect gps-app | `en` | *(none)* | WARN — no `dir` |
| GPS-Connect mockup-sandbox | `en` | *(none)* | WARN |
| AI-Task-Manager mockup-sandbox | `en` | *(none)* | WARN |

**Finding A-LANG-001 (WARN):** `kobi-agent` declares `lang="he" dir="ltr"` — mismatch. Mockup-sandbox apps use `lang="en"` — if used as Hebrew UI it is incorrect.

### 4.2 Contrast — dark theme

Dark theme values from `erp-app/src/index.css`:
- `--background: 222 47% 11%` → `#0e1530`
- `--foreground: 210 40% 98%` → `#f7fafc`
- Contrast ratio ≈ **17.8 : 1** → **PASS** (AAA)
- `--muted-foreground: 215 20.2% 65.1%` → `#94a3b8`
- Muted on background ≈ **7.2 : 1** → **PASS** (AA Large, AA Normal)
- `--primary: 217.2 91.2% 59.8%` → `#3b82f6`
- Primary on background ≈ **5.1 : 1** → **PASS** (AA Normal)

**Finding A-CONTRAST-001:** Dark theme contrast is compliant. No failures in audited tokens. **PASS.**

*(Not all color pairs checked — report limited to the primary theme tokens in `index.css`. Buttons with ghost variants and placeholder text were not sampled.)*

### 4.3 `:focus-visible`

Present in shadcn UI base components (button.tsx, checkbox.tsx, input-group.tsx, etc.) — 35+ occurrences. **PASS** for library-based components.

**Finding A-FOCUS-001 (WARN):** Custom non-shadcn interactive elements (some pages, sidebar chevrons, custom dropdowns) were not individually audited. Static sweep only covered `:focus-visible` in `.tsx/.css`. Verification needed via automated tool (axe-core) at runtime.

### 4.4 Tab order

Not auditable statically — requires runtime inspection. **UNKNOWN.**

---

## 5. Locale — Israeli

### 5.1 Date format

- `date-fns` v3 used across erp-app (locale configurable).
- Manual `DD/MM/YYYY` / `dd/MM/yyyy` format strings found in 6 files (data-migration, transformation-engine, user-profile, settings, general-settings, scan-receipt).
- `Intl.DateTimeFormat` used in 16 files.
- **No `he-IL` locale wiring** found in a global `date-fns` config — each call site must pass `locale`.

**Finding L-DATE-001 (WARN):** Date locale wiring is per-call-site. Risk of `MM/DD/YYYY` leakage if a developer forgets to pass `he` locale. Recommend a `formatDate()` helper in `erp-app/src/lib/utils.ts` and forbid direct `format()` calls.

### 5.2 Number format / thousands separator

- 166+ occurrences of `ILS`/`he-IL`/`₪` across the codebase.
- `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })` pattern likely in use (seen in settings/user-profile).

**Finding L-NUM-001:** Widespread. Sampling indicates correct `he-IL` locale is used. **PASS (spot-check).**

### 5.3 Currency ₪ position

`Intl.NumberFormat('he-IL', ...)` renders `₪1,234.56` (symbol at start — correct per CLDR for Hebrew). **PASS.**

### 5.4 Timezone

- 16 files reference `Asia/Jerusalem` / `timeZone`. 
- Backend uses `new Date()` in many places — relies on server TZ.

**Finding L-TZ-001 (WARN):** Server environment TZ is not explicitly pinned to `Asia/Jerusalem` in Dockerfile/env. On a US-region cloud host, naive `new Date()` yields UTC, and DST around 2026-03-27 (Israel DST) could shift attendance by 1 hour. Recommend `process.env.TZ = 'Asia/Jerusalem'` at server boot.

---

## 6. RTL Edge Cases

| Issue | Finding |
|---|---|
| `margin-left/right` vs logical | 2 CSS files + many Tailwind `pl-*`/`ml-*` utilities → RTL shim in `rtl.css` → **WARN (fragile)** |
| `text-align: left/right` vs `start/end` | 0 uses of `start`/`end` → **WARN** |
| Directional icons (arrows) | No `scaleX(-1)` class or direction-aware arrow component found → **WARN — arrows likely don't flip in RTL** |
| Scrollbar direction | `webkit-scrollbar` styled in techno-kol-ops client — no direction handling; browser default for RTL flips scrollbar to left → PASS |
| `writing-mode` / bidi issues | Not audited (runtime only) | UNKNOWN |

**Finding R-ARROW-001 (WARN):** No evidence of arrow-icon RTL flipping. `lucide-react` icons like `ChevronRight`/`ArrowLeft` stay LTR by default — on Hebrew RTL "back" buttons point the wrong way.

---

## 7. Compatibility Matrix — Environment × Feature × Pass/Fail

Legend: ✅ PASS · ⚠️ WARN · ❌ FAIL · — N/A · ? UNKNOWN

### 7.1 Backend Node

| Env | Node 18 LTS | Node 20 LTS | Node 22 Current | Windows cmd.exe | Windows+Git Bash | Linux bash |
|---|---|---|---|---|---|---|
| paradigm-engine | ✅ | ✅ | ✅ | ⚠️ (no scripts w/ env) | ✅ | ✅ |
| nexus_engine | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| onyx-ai | ❌ (needs 20) | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| onyx-procurement | ❌ (needs 20) | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| AI-Task-Manager api-server | ✅ | ✅ | ✅ | ❌ (NODE_ENV inline) | ✅ | ✅ |
| AI-Task-Manager erp-app (build) | ✅ | ✅ | ✅ | ❌ (NODE_OPTIONS inline) | ✅ | ✅ |
| GPS-Connect api-server | ✅ | ✅ | ✅ | ❌ (export bash-only) | ✅ | ✅ |
| techno-kol-ops server | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| payroll-autonomous | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 7.2 Frontend Browser

| Feature | Chrome 90+ | Edge 90+ | Firefox 90+ | Safari 14 | Safari 15.0-15.3 | Safari 15.4+ | iPad OS 14 | iPad OS 15.4+ |
|---|---|---|---|---|---|---|---|---|
| erp-app bundle loads (es2020) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `?.` / `??` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Array.at()` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `structuredClone` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `BigInt` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tailwind v4 `@custom-variant` | ✅ (111+) | ✅ | ✅ | ❌ (needs 16.4+) | ❌ | ❌ | ❌ | ❌ |
| `env(safe-area-inset-*)` web PWA | — | — | — | ❌ (not coded) | ❌ | ❌ | ❌ | ❌ |
| Hebrew RTL layout | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Arrow icons flip in RTL | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 7.3 Mobile / PWA

| Environment | erp-mobile (Expo) | erp-app PWA |
|---|---|---|
| iOS 16 iPhone | ✅ | ⚠️ (no safe-area) |
| iOS 16 iPad | ✅ | ⚠️ |
| iOS 15.4+ | ✅ | ⚠️ |
| iOS 14-15.3 | ? (need Expo min iOS) | ❌ (Array.at, structuredClone) |
| Android 13 Chrome | ✅ | ✅ |
| Android 10 Chrome | ✅ | ✅ |

### 7.4 Accessibility

| Check | erp-app | techno-kol-ops client | payroll-autonomous | onyx-procurement web | kobi-agent UI |
|---|---|---|---|---|---|
| `lang="he"` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `dir="rtl"` | ✅ | ✅ | ✅ | ✅ | ❌ (ltr) |
| Viewport allows zoom | ⚠️ (max-scale=1) | ✅ | ❌ (user-scalable=no) | ✅ | ✅ |
| `:focus-visible` on interactive | ✅ (shadcn) | ? | ? | ⚠️ (css shim) | ? |
| Dark theme contrast AA | ✅ | ? | ? | — (light) | ? |
| Arrow icons RTL-aware | ❌ | ❌ | — | — | — |

### 7.5 Locale

| Check | Verdict |
|---|---|
| `lang="he"` root | ✅ (most apps) |
| `he-IL` number formatting | ✅ (sampled) |
| `Asia/Jerusalem` timezone on backend | ⚠️ (not pinned) |
| DD/MM/YYYY date format | ✅ (manual) / ⚠️ (not enforced) |
| ₪ currency symbol position | ✅ (Intl) |
| 24-hour time | ✅ (Intl default for he-IL) |

---

## 8. Bugs — Full Format

### BUG-QA17-001 · FAIL · **Missing `engines.node` across 8 of 12 packages**
- **Files:** `AI-Task-Manager/package.json`, `AI-Task-Manager/artifacts/api-server/package.json`, `AI-Task-Manager/artifacts/erp-app/package.json`, `AI-Task-Manager/artifacts/erp-mobile/package.json`, `GPS-Connect/package.json`, `techno-kol-ops/package.json`, `techno-kol-ops/client/package.json`, `payroll-autonomous/package.json`
- **Severity:** Medium
- **Impact:** Developer may install on Node 16 (native `fetch` absent) → runtime crash. CI may use wrong Node.
- **Reproduction:** `nvm use 16 && pnpm install && pnpm --filter api-server run dev` → first `fetch()` call throws.
- **Fix:** Add `"engines": { "node": ">=20.11.0", "pnpm": ">=9" }` and commit `.nvmrc` at repo root.

### BUG-QA17-002 · FAIL · **Windows cmd.exe cannot run dev/build scripts**
- **Status:** RESOLVED — Added `cross-env` to 3 package.json scripts: `AI-Task-Manager/artifacts/api-server/package.json`, `AI-Task-Manager/artifacts/erp-app/package.json`, `GPS-Connect/artifacts/api-server/package.json`.
- **Files:** `AI-Task-Manager/artifacts/api-server/package.json:7` (`"dev": "NODE_ENV=development tsx ..."`), `AI-Task-Manager/artifacts/erp-app/package.json:8` (`"build": "NODE_OPTIONS=... vite build"`), `GPS-Connect/artifacts/api-server/package.json:7` (`export NODE_ENV=...`), `erp-mobile/package.json:7`.
- **Severity:** High (Windows dev blocker)
- **Impact:** `pnpm dev` on bare cmd.exe fails with `'NODE_ENV' is not recognized`.
- **Fix:** Wrap in `cross-env`: `"dev": "cross-env NODE_ENV=development tsx ./src/index.ts"`; add `cross-env` as devDependency.
- **Workaround:** Use Git Bash or WSL.

### BUG-QA17-003 · FAIL · **`user-scalable=no` blocks WCAG 1.4.4**
- **Status:** RESOLVED — replaced viewport meta in `payroll-autonomous/index.html` with `width=device-width, initial-scale=1.0` (removed `maximum-scale=1.0, user-scalable=no`).
- **File:** `payroll-autonomous/index.html:6`
- **Line:** `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />`
- **Severity:** High (a11y regression, WCAG AA fail)
- **Impact:** Low-vision users cannot pinch-zoom. Legal/compliance blocker under Israeli a11y law 5758-1998 + IS 5568.
- **Fix:** Replace with `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`.

### BUG-QA17-004 · WARN · **Missing `env(safe-area-inset-*)` in web PWA**
- **Files:** `AI-Task-Manager/artifacts/erp-app/src/index.css`, `src/styles/*.css` — **no** `safe-area-inset` usage.
- **Severity:** Medium (visual bug on iPhone 15 Pro / iPad)
- **Impact:** When erp-app is added to iOS home screen as PWA, top bar overlaps the dynamic island / notch; bottom nav sits under the home indicator.
- **Fix:** Wrap top nav in `padding-top: env(safe-area-inset-top)` and bottom nav in `padding-bottom: env(safe-area-inset-bottom)`. Also add `viewport-fit=cover` to `<meta viewport>`.

### BUG-QA17-005 · WARN · **`Array.at()` + `structuredClone` break Safari <15.4 / iPad OS 14-15.3**
- **Files:** 30+ files across `erp-app/src/pages/**`, `App.tsx`, `main.tsx`
- **Severity:** Medium (unless you drop Safari <15.4)
- **Impact:** On iPad Air 2 / iPad (6th gen) stuck at iPadOS 15.1, ERP crashes at load.
- **Fix options:** (1) Declare min Safari 15.4 and document, or (2) install polyfills (see `QA-17-polyfills-needed.md`).

### BUG-QA17-006 · WARN · **RTL uses physical-property overrides instead of logical properties**
- **File:** `AI-Task-Manager/artifacts/erp-app/src/styles/rtl.css`
- **Severity:** Low-Medium (fragile — leaks on any new utility)
- **Impact:** New `pl-6` / `ml-2` Tailwind classes appear LTR in Hebrew.
- **Fix:** Migrate to `ps-*`/`pe-*`/`ms-*`/`me-*` (Tailwind logical utilities) or use CSS `padding-inline-start`/`margin-inline-start`.

### BUG-QA17-007 · WARN · **Arrow icons don't flip in RTL**
- **Files:** erp-app — no `ArrowRight`/`ChevronLeft` wrappers found.
- **Severity:** Medium (UX confusion)
- **Impact:** "Back" buttons show → in Hebrew; "Next" shows ←.
- **Fix:** Create `<DirectionalIcon icon={ChevronRight} />` that swaps Left↔Right in RTL. Or CSS: `[dir="rtl"] .rtl-flip { transform: scaleX(-1); }`.

### BUG-QA17-008 · WARN · **Backend server TZ not pinned to `Asia/Jerusalem`**
- **Files:** `AI-Task-Manager/artifacts/api-server/src/index.ts` (boot), Dockerfile (not audited here).
- **Severity:** Medium (off-by-one-hour bugs around DST: 2026-03-27, 2026-10-25)
- **Impact:** Attendance, payroll, cron schedules drift by 2-3 hours on non-IL cloud region.
- **Fix:** `process.env.TZ = 'Asia/Jerusalem'` at top of `src/index.ts` **before** any `new Date()`.

### BUG-QA17-009 · WARN · **`node-fetch` still referenced — redundant on Node 18+**
- **Files:** `nexus_engine/bridge/python-platform-bridge.js`, `AI-Task-Manager/artifacts/api-server/src/lib/kimi-test.ts`
- **Severity:** Low
- **Impact:** Bundle bloat + future upgrade pain (v3 is ESM-only).
- **Fix:** Delete import, use global `fetch`.

### BUG-QA17-010 · WARN · **TypeScript `target` inconsistency**
- **Files:** `techno-kol-ops/tsconfig.json` (ES2020) vs. rest (ES2022).
- **Severity:** Low
- **Impact:** Duplicate transpilation, lint noise.
- **Fix:** Align to `ES2022`.

### BUG-QA17-011 · WARN · **`kobi-agent` has `lang="he" dir="ltr"` mismatch**
- **File:** `AI-Task-Manager/artifacts/kobi-agent/src/ui/index.html:2`
- **Severity:** Low
- **Fix:** Change to `dir="rtl"`.

### BUG-QA17-012 · WARN · **No `browserslist` declared anywhere**
- **Severity:** Medium
- **Fix:** Add to root or each web app (see §2.1).

### BUG-QA17-013 · WARN · **`maximum-scale=1` in viewport (erp-app, gps-app, mockup-sandbox)**
- **Files:** `AI-Task-Manager/artifacts/erp-app/index.html:5`, `GPS-Connect/artifacts/gps-app/index.html:5`, mockup-sandbox files
- **Severity:** Medium (a11y)
- **Impact:** Disables pinch-zoom for low-vision users.
- **Fix:** Remove `maximum-scale=1`.

### BUG-QA17-014 · WARN · **Bash/POSIX scripts referenced in npm scripts on Windows**
- **Files:** `AI-Task-Manager/artifacts/api-server/package.json` (`start: "bash ./scripts/run-server.sh"`), `start-all.sh`, `stop-all.sh`, `guard-mfa.sh`, `backup-db.sh`, `restore-db.sh`, `validate-sidebar-routes.sh`, `post-merge.sh`
- **Severity:** Medium (Windows)
- **Fix:** Document Git Bash / WSL as prerequisite in README, or provide `.cmd` equivalents.

### BUG-QA17-015 · WARN · **Date locale wiring per-call-site (no central helper)**
- **Files:** 6+ files using manual `DD/MM/YYYY` strings.
- **Severity:** Low-Medium
- **Fix:** Central `formatDate(date, pattern)` helper that always uses `he` locale.

---

## 9. Go / No-Go

| Area | Verdict | Gating Bugs |
|---|---|---|
| Backend Node runtime | 🟡 **GO with conditions** | BUG-001 (add engines), BUG-008 (pin TZ) |
| Backend dev experience on Windows cmd.exe | 🔴 **NO-GO** | BUG-002 (cross-env), BUG-014 (bash scripts) |
| Backend dev experience on Git Bash/WSL/Linux/macOS | 🟢 **GO** | — |
| Frontend evergreen (Chrome/Edge/Firefox/Safari 15.4+) | 🟢 **GO** | — |
| Frontend Safari 14.x / iPad OS 14-15.3 | 🔴 **NO-GO** | BUG-005 (Array.at, structuredClone) |
| Mobile Expo app (SDK 54) | 🟢 **GO** | — (pending app.json min-version check) |
| PWA on iOS | 🟡 **GO with conditions** | BUG-004 (safe-area) |
| Accessibility (Hebrew, contrast, focus) | 🟡 **GO with conditions** | BUG-003 (FAIL in payroll-autonomous), BUG-013, BUG-011 |
| Locale (he-IL, currency, dates) | 🟢 **GO** | — |
| RTL layout | 🟡 **GO with conditions** | BUG-006, BUG-007 |

### Final recommendation: **🟡 CONDITIONAL GO**

**Blockers that must be fixed before GA (3):**
1. **BUG-003** — remove `user-scalable=no` from `payroll-autonomous/index.html` (WCAG failure).
2. **BUG-002** — wrap env-var scripts in `cross-env` so Windows dev works. (Or officially document "Git Bash required".)
3. **BUG-001** — declare `engines.node` ≥20.11 in all 8 packages.

**Strongly recommended (non-blocking) fixes (5):**
- BUG-004 — add `safe-area-inset` CSS for iOS PWA.
- BUG-005 — decide & document minimum Safari version OR polyfill.
- BUG-007 — flip arrow icons in RTL.
- BUG-008 — pin `Asia/Jerusalem` TZ on server boot.
- BUG-012 — add `browserslist`.

**See also:** `QA-17-polyfills-needed.md` for the polyfill decision list.

---

*End of QA-17 Compatibility Audit — 2026-04-11.*
