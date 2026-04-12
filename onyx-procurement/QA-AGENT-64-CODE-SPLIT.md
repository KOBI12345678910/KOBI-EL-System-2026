# QA Agent #64 — Code Splitting Strategy Analysis

**Project:** onyx-procurement
**File analyzed:** `web/onyx-dashboard.jsx` (711 lines)
**Dimension:** Code Splitting Strategy
**Method:** Static analysis only
**Date:** 2026-04-11

---

## 1. Executive Summary

The ONYX dashboard is a **single-file monolithic React component** totaling **711 lines**, with **ZERO code splitting** of any kind. There is no router, no `React.lazy`, no `Suspense`, no dynamic `import()`, no bundler configuration (no Vite, no webpack, no Rollup, no esbuild), and no separate build entry point. The file is served as raw JSX, implying either an in-browser Babel transform (`<script type="text/babel">`) or a bundler that is not yet in the repository. This produces one giant JavaScript payload on initial load regardless of which tab the user actually visits.

**Code-split readiness grade: F (0 / 100)**

---

## 2. Detailed Findings

### 2.1 Single-File Dashboard — CONFIRMED

**Verdict:** YES — 100% monolithic.

Evidence (line references):

| # | Component | Lines | Role |
|---|---|---|---|
| 1 | `OnyxDashboard` (default export) | 18–109 | Root shell, state container, tab switcher |
| 2 | `DashboardTab` | 115–167 | KPI + savings overview |
| 3 | `KPI` | 169–177 | Small presentational card |
| 4 | `SuppliersTab` | 183–237 | Supplier list + add form |
| 5 | `RFQTab` | 243–331 | Multi-line RFQ composer |
| 6 | `QuotesTab` | 337–436 | Quote entry + AI decision |
| 7 | `OrdersTab` | 442–485 | PO list + approve/send |
| 8 | `SubcontractorsTab` | 491–517 | Sub list view |
| 9 | `SubDecideTab` | 523–590 | % vs m² AI decision |
| 10 | `Input` | 596–603 | Shared form primitive |
| 11 | `Select` | 605–614 | Shared form primitive |
| 12 | `MiniStat` | 616–623 | Shared presentational |
| 13 | `styles` constant | 630–710 | ~300 inline style objects |

**Observation:** All 7 tab feature modules, 3 primitives, the root shell, the API helper, and ~80 style objects live in one `.jsx` file. There is no `index.jsx`, no `main.jsx`, no route file, no `components/` directory — nothing.

### 2.2 Route-Based Splitting Potential

**Current state:** NO router present.

- `package.json` lists only backend deps: `express`, `@supabase/supabase-js`, `dotenv`, `cors`. No `react`, no `react-dom`, no `react-router-dom`.
- Navigation is implemented by a local state variable `const [tab, setTab] = useState("dashboard")` (line 19) and seven inline ternaries `{tab === "X" && <XTab .../>}` (lines 91–97).
- There is no URL binding, no `<BrowserRouter>`, no `history`, no deep-linking. A reload always returns to the Dashboard tab.

**Potential:** HIGH. The seven tabs map 1-to-1 to seven natural routes:

```
/                   → DashboardTab        (always-on, small)
/suppliers          → SuppliersTab
/rfq                → RFQTab               (heavy: multi-line form)
/quotes             → QuotesTab            (heavy: decision engine UI)
/orders             → OrdersTab
/subcontractors     → SubcontractorsTab
/subcontractors/decide → SubDecideTab      (heavy: AI decision UI)
```

Migrating to `react-router-dom@6` + `createBrowserRouter` would immediately enable per-route splitting with near-zero refactor (the tab components already accept plain props and have no sibling coupling).

### 2.3 `React.lazy` + `Suspense` Usage

**Grep results:**

| Symbol | Occurrences in file | Status |
|---|---|---|
| `React.lazy` | 0 | NOT USED |
| `lazy(` | 0 | NOT USED |
| `Suspense` | 0 | NOT USED |
| `import(` (dynamic) | 0 | NOT USED |
| `loadable` | 0 | NOT USED |

**Verdict:** Zero lazy loading. Even the large and rarely-touched tabs (`RFQTab` 89 lines, `QuotesTab` 100 lines, `SubDecideTab` 68 lines) are statically imported at module load. A user who only opens "Dashboard" still pays the full bytecode cost of all seven tabs plus the style blob.

### 2.4 Tab-Based Lazy Loading (RFQ / Subcontractor / Audit)

**Current:** All seven tabs are unconditionally resident in the main bundle — they are sibling function declarations in the same file. Tab switching is pure render-time conditional rendering, not module loading.

**RFQ tab:** heaviest business logic — line-item state machine, category/unit enums, two sequential POST calls, result preview, delivery stats. Hard candidate #1 for lazy load.

**Subcontractor tabs:** `SubcontractorsTab` (read-only list) + `SubDecideTab` (decision engine) together are ~170 lines. The decision engine is only used by senior staff and is a hard candidate #2 for lazy load.

**Audit tab:** **NOT PRESENT** in the file. The `tabs` array (lines 47–55) lists only: `dashboard`, `suppliers`, `rfq`, `quotes`, `orders`, `subcontractors`, `sub_decide`. There is no audit tab yet. If/when added, it should be built lazily from day one.

### 2.5 Bundle Entry Points

**Current state:** Ambiguous / undefined.

- `package.json` `main` field points to **`server.js`** (Node backend), not a web entry.
- There is no `index.html` in the `web/` directory (only the `.jsx` file).
- There is no `vite.config.js`, `webpack.config.js`, `rollup.config.js`, `esbuild.config.js`, or `tsconfig.json`.
- The `.jsx` extension + inline `<style>{`@import url(...)`}</style>` + `<script>` font imports strongly suggest the file is intended to be loaded via Babel standalone in the browser, i.e. served raw from the Express static handler — a classic prototype setup.

**Implication:** There is exactly **one entry point, implicit and unbundled**. The concept "vendor chunk" does not yet exist because there is no bundler to create chunks.

### 2.6 Vendor Chunking Strategy

**Current:** N/A — no bundler, no chunks.

**Inventory of third-party runtime deps actually referenced by `onyx-dashboard.jsx`:**

| Package | Imported as | Weight estimate |
|---|---|---|
| `react` (`useState`, `useEffect`, `useCallback`) | line 1 | ~6 kB gzipped |
| `react-dom` | (assumed, not in file) | ~40 kB gzipped |
| Google Fonts `Rubik` | runtime `@import` | external, ~25 kB |
| `fetch` (browser built-in) | line 10 | 0 |

**There are no other heavy vendor deps.** No chart library, no icon library (emojis are inline Unicode), no date-fns/moment (uses native `toLocaleDateString`), no lodash, no axios. This is actually a favourable starting point for vendor chunking because the vendor bundle would be dominated by React alone (~50 kB gzipped total).

**Recommended vendor chunking (post-Vite):**
```
vendor-react.js      → react + react-dom       (~50 kB gz)
app.js               → OnyxDashboard shell     (~8 kB gz)
tab-dashboard.js     → DashboardTab + KPI      (~2 kB gz)
tab-suppliers.js     → SuppliersTab            (~2 kB gz)
tab-rfq.js           → RFQTab                  (~4 kB gz)
tab-quotes.js        → QuotesTab               (~5 kB gz)
tab-orders.js        → OrdersTab               (~2 kB gz)
tab-subs.js          → Sub + SubDecide         (~4 kB gz)
```

### 2.7 Recommendation — Migration to Vite

#### Phase 1 — Scaffold Vite (zero behaviour change, 30 min)

1. `npm i -D vite @vitejs/plugin-react` (dev deps only)
2. `npm i react react-dom` (runtime deps — currently missing from `package.json`!)
3. Create `web/index.html` with `<div id="root">` and `<script type="module" src="/main.jsx">`.
4. Create `web/main.jsx`:
   ```jsx
   import React from "react";
   import { createRoot } from "react-dom/client";
   import OnyxDashboard from "./onyx-dashboard.jsx";
   createRoot(document.getElementById("root")).render(<OnyxDashboard />);
   ```
5. Create `vite.config.js` with React plugin + `server.proxy` pointing `/api` to `http://localhost:3100`.
6. Add scripts: `"dev:web": "vite"`, `"build:web": "vite build"`.

#### Phase 2 — Split tab files (1–2 hours)

Move each tab to its own module. Target layout:

```
web/
├── index.html
├── main.jsx                       ← entry
├── App.jsx                        ← OnyxDashboard shell (lines 17–109)
├── api.js                         ← helper (lines 3–15)
├── styles.js                      ← shared style objects (lines 630–710)
├── components/
│   ├── Input.jsx
│   ├── Select.jsx
│   ├── MiniStat.jsx
│   ├── KPI.jsx
│   └── Toast.jsx
└── tabs/
    ├── DashboardTab.jsx
    ├── SuppliersTab.jsx
    ├── RFQTab.jsx
    ├── QuotesTab.jsx
    ├── OrdersTab.jsx
    ├── SubcontractorsTab.jsx
    └── SubDecideTab.jsx
```

#### Phase 3 — Add `React.lazy` + `Suspense` (30 min)

In `App.jsx`:

```jsx
import { lazy, Suspense, useState } from "react";

const DashboardTab     = lazy(() => import("./tabs/DashboardTab.jsx"));
const SuppliersTab     = lazy(() => import("./tabs/SuppliersTab.jsx"));
const RFQTab           = lazy(() => import("./tabs/RFQTab.jsx"));
const QuotesTab        = lazy(() => import("./tabs/QuotesTab.jsx"));
const OrdersTab        = lazy(() => import("./tabs/OrdersTab.jsx"));
const SubcontractorsTab = lazy(() => import("./tabs/SubcontractorsTab.jsx"));
const SubDecideTab     = lazy(() => import("./tabs/SubDecideTab.jsx"));

// …

<Suspense fallback={<div style={styles.loading}>טוען...</div>}>
  {tab === "dashboard" && <DashboardTab ... />}
  {tab === "rfq" && <RFQTab ... />}
  {/* … */}
</Suspense>
```

Vite's default code splitter produces one chunk per `import()`. With the above, each tab becomes its own on-demand chunk and the initial load is the shell + DashboardTab + React only.

#### Phase 4 — Add `manualChunks` (15 min)

In `vite.config.js`:

```js
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    proxy: { "/api": "http://localhost:3100" },
  },
});
```

Keeps React in a separately-cacheable chunk — a user who returns to the app after a code deploy only re-downloads the tiny app chunks, not React itself.

#### Phase 5 — Route mode (optional, future)

Once URLs matter (back button, deep links to specific RFQs, bookmarkable order detail), swap the `useState("dashboard")` tab state for `react-router-dom` + `createBrowserRouter`. Routes map 1-to-1 to tabs; `lazy()` continues to work via React Router's native `lazy` route option.

---

## 3. Risk Table

| Risk | Severity | Probability | Notes |
|---|---|---|---|
| Monolith balloons as features grow (audit tab, approvals tab, reports tab, etc.) | HIGH | CERTAIN | Already at 711 lines with no audit tab; easily hits 2k lines within 6 months |
| First paint / TTI slows on mobile network | MEDIUM | HIGH | Whole tab forest ships on every visit |
| Cache busting invalidates entire app on any style change | MEDIUM | HIGH | No chunk granularity → one URL = one big file |
| No HMR, no sourcemaps | MEDIUM | CERTAIN | Dev experience is print-refresh-repeat |
| React missing from `package.json` | HIGH | CERTAIN | Build is fragile / undefined — must be fixed before Vite migration |
| No `index.html` in `web/` | HIGH | CERTAIN | Cannot locate entry point by reading the repo |
| No router → no deep links, no browser back behaviour | MEDIUM | CERTAIN | Returning users re-navigate manually |
| Inline `@import` of Google Fonts blocks paint | LOW | CERTAIN | Move to `<link rel="preconnect">` + `display=swap` |

---

## 4. Scoring (Code-Split Dimension)

| Criterion | Weight | Score | Weighted |
|---|---|---|---|
| File structure modular | 15 | 0/10 | 0 |
| Router present | 15 | 0/10 | 0 |
| `React.lazy` usage | 15 | 0/10 | 0 |
| `Suspense` boundaries | 10 | 0/10 | 0 |
| Dynamic `import()` | 10 | 0/10 | 0 |
| Bundler configured | 15 | 0/10 | 0 |
| Vendor chunking | 10 | 0/10 | 0 |
| Entry point defined | 5 | 0/10 | 0 |
| Build output optimised | 5 | 0/10 | 0 |
| **TOTAL** | 100 | | **0 / 100** |

**Grade: F**. Note: the grade reflects *code-splitting maturity only*. The app itself is functional; the dimension under test happens to be the one with nothing in place yet. A 3–4 hour refactor following the phases above moves this grade from **F** to **A-** without touching any business logic.

---

## 5. Final Recommendation

**Priority:** SHOULD — not urgent while the app stays at ~700 lines, but **BEFORE** the audit, approvals, and reporting tabs are added. Migrating a monolith at 2,000 lines is 4x harder than migrating at 700. Do it now, during a calm sprint, in the Phase 1 → 5 order above. Expect ~4 engineer-hours for Phases 1–4, plus ~2 hours of manual QA per tab.

