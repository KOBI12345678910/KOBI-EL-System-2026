# techno-kol-ops / client — Audit Report

Agent: Agent-22
Date: 2026-04-11
Mode: Read-only audit + additive file creation (no edits to existing files)

---

## 1. Inventory snapshot

**Root config**
- `package.json` — React 18.2, react-dom 18.2, react-router-dom 6.22, Zustand 4.5, axios 1.6, recharts 2.12, date-fns 3.3, @blueprintjs/core + icons + table 5.10, ag-grid-react/community 31.1. Scripts: `dev`, `build (tsc && vite build)`, `preview`.
- `vite.config.ts` — React plugin, dev server on 3000, proxy `/api` and `/ws` to `localhost:5000`.
- `tsconfig.json` — `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `moduleResolution: bundler`, `jsx: react-jsx`, `paths: @/* -> src/*`, `references` -> `tsconfig.node.json`.
- `tsconfig.node.json` — newly added, composite, `types: [node]`, includes vite.config.
- `index.html` — `<html lang="he" dir="rtl">`, dark body background `#252A31`, custom scrollbar.

**Source (`src/`)**
- `main.tsx` (entry), `App.tsx` (routes + login + layout).
- `components/` — Navbar, Sidebar, TopNavbar, Layout, RealtimeToast, StatusTag, ProgressBar, MetricCard, AlertFeed, plus detail panels (Client/Employee/Order), plus large HR/payroll/hours modules.
- `engines/` — 10 client-side TS engines: dataFlow, dms, financialAutonomy, hoursAttendance, hrAutonomy, intelligentAlert, procurement, purchasing, situation, subcontractor (all very large modules, 20k–80k bytes).
- `hooks/` — `useApi` (axios wrapper), `useWebSocket`, `useAutonomousPipeline`, `useRealtimeEvent`.
- `pages/` — 25 route pages (Dashboard, WorkOrders, Pipeline, Purchasing, HRAutonomy, HoursAttendance, IntelligentAlerts, DocumentManagement, ProcurementHyperintelligence, FinancialAutonomy, SignaturePage, etc.).
- `store/useStore.ts` — Zustand store: token, user, WS status, snapshot, alerts, sidebar.
- `utils/format.ts` — currency/date helpers + `API_URL`, `WS_URL` env readers.
- `mobile/` — empty directory.

**New files created by this audit**
- `src/lib/api-client.ts` — centralized fetch wrapper (added).
- `src/lib/theme.ts` — Palantir dark theme tokens (added).
- `src/components/ErrorBoundary.tsx` — class-based error boundary (added).
- `CLIENT_AUDIT.md` — this file.

No existing file was modified.

---

## 2. Findings — issues discovered

### 2.1 API URL handling (Medium)
- `src/utils/format.ts` is the **only** place that consumes `import.meta.env.VITE_API_URL` / `VITE_WS_URL`, with fallback to `http://localhost:5000`.
- `src/App.tsx` line 112 uses **relative** `fetch('/api/auth/login', ...)` — works only because `vite.config.ts` proxies `/api` to localhost:5000. In production (no Vite dev server), this will rely on the hosting origin. If the API lives elsewhere, login silently fails. Recommend migrating to `api()` wrapper.
- `src/hooks/useAutonomousPipeline.ts` line 126 uses relative `fetch('/api/pipeline/new-quotes', ...)`. Same caveat.
- `src/hooks/useWebSocket.ts` wires the token as a **query-string parameter** (`?token=`). Works, but leaks token into proxy access logs. Consider subprotocol header instead.

### 2.2 Missing API key / X-API-Key header (High)
- Nothing in `src` sets an `X-API-Key` or `api_key` header. The backend API key path is effectively unused client-side. `api-client.ts` now supports it via `VITE_API_KEY` or `localStorage['tk_api_key']`.

### 2.3 Missing Error Boundary (High)
- Grep for `componentDidCatch` / `getDerivedStateFromError` / `ErrorBoundary` returned **zero matches**. Any render error in a 60k-byte page (e.g. `HRAutonomy.tsx`) will unmount the entire shell. New `ErrorBoundary.tsx` addresses this — caller needs to wrap `<App />` inside `main.tsx` (not edited per instructions).

### 2.4 Missing loading / skeleton states (Medium)
- `Dashboard.tsx` contains **no** `loading` or `isLoading` token — it renders directly from `snapshot` even when it's `null`. Some pages rely on optional chaining only; no spinner UX.
- `useApi` exposes `loading` but many pages (Clients, AlertCenter, Employees, Pipeline, LiveMap, Materials, ProductionFloor, WorkOrders, SupplyChain) never read it — they only call `fetch()` in `useEffect` and show an empty grid.

### 2.5 XSS risk — `dangerouslySetInnerHTML` (High)
- `src/pages/SignaturePage.tsx:325`:
  ```tsx
  <div dangerouslySetInnerHTML={{ __html: doc?.content || '' }}
       style={{ pointerEvents: 'none', userSelect: 'none' }} />
  ```
- Document content is rendered as raw HTML, no sanitization (no DOMPurify, no sanitize-html dep in package.json). If `doc.content` comes from user input (likely — signable documents), this is a classic stored XSS. Recommendation: add `dompurify` and wrap the value before assigning, or server-side sanitize + whitelist allowed tags.

### 2.6 Console statements in production paths (Medium)
- 59 `console.log/warn/error` occurrences across 14 files, including `App.tsx` (`[AI Pipeline] Decision made…`), `hooks/useWebSocket.ts` (`WS connected`), and most engines (verbose diagnostics per event). Recommendation: gate with `import.meta.env.DEV` or strip via Vite `esbuild.drop: ['console']` in production config.

### 2.7 RTL support (OK — minor gaps)
- `index.html` sets `lang="he" dir="rtl"`, good.
- `App.tsx` `Layout` and `Login` apply `direction: 'rtl'` inline.
- Not all page components set `direction` explicitly; they rely on inheritance from `<html dir="rtl">`. That works, but AG-Grid and Blueprint need explicit RTL enablement:
  - AG-Grid: `enableRtl` prop is **not** set on the `AgGridReact` instances in `WorkOrders.tsx` and `ClientDetailPanel.tsx`. Grid will render LTR inside an RTL shell.
  - Blueprint `<Table>` does not ship in any page (import grep returned no results), so not an active issue, but `@blueprintjs/table` remains a dependency — likely dead weight.

### 2.8 Dark theme (OK — non-tokenized)
- The dark Palantir palette is hardcoded in every component (`#1C2127`, `#2F343C`, `#FFA500`, etc.). There is no theme module — this makes refactors painful and risks drift. New `src/lib/theme.ts` centralizes the tokens.

### 2.9 Unused / questionable dependencies (Low)
- `@blueprintjs/table`: no imports found in `src`.
- `@blueprintjs/icons`: no imports found; Navbar and Sidebar render emoji glyphs.
- `axios`: only `src/hooks/useApi.ts` imports it (1 file). With the new `api-client.ts` (native fetch), `axios` can be removed after migration.
- `ag-grid-community`: only one file imports its types (`ClientDetailPanel.tsx`). Likely fine, just small surface.
- `@blueprintjs/core` CSS is imported globally in `main.tsx` but the actual Blueprint components are barely used — consider auditing bundle size.

### 2.10 Auth / security hygiene (Medium)
- Token stored in `localStorage` (`tk_token`) — susceptible to XSS exfiltration, amplified by the unsanitized `dangerouslySetInnerHTML` above. Consider HttpOnly cookie + CSRF token, or at minimum ensure sanitization before rendering HTML.
- No 401 -> logout handling in the relative `fetch('/api/auth/login')` in `App.tsx`. `useApi` does handle 401 (via axios interceptor) but many new pages don't route through `useApi`.
- `useStore.ts` reads `localStorage.getItem('tk_token')` synchronously at module-load time — fine, but it means swapping tab to another account requires a full reload.

### 2.11 WebSocket resilience (Low)
- `useWebSocket.ts` reconnects after 3s with no exponential backoff and no max attempts — could hammer the server during extended outages.
- `onmessage` silently swallows parse errors (`catch {}`) — good for robustness but hides real server bugs. Consider routing through `ErrorBoundary`'s `onError` channel for telemetry.

### 2.12 Router / public route handling (Low)
- `App.tsx` checks `window.location.pathname.startsWith('/sign/')` **before** rendering any Routes. If a signed URL includes a trailing hash or query, this still works, but mixing raw `window.location` checks with `react-router` is brittle. Prefer a dedicated `<Route>` gated by auth state.

### 2.13 `tsconfig` noUnused flags vs large engines (Low)
- `noUnusedLocals: true` + `noUnusedParameters: true` + 80k-byte engine files is a recipe for build-time friction. Expect `tsc && vite build` to flag dozens of unused locals. A quick sanity: ensure all engine modules are actually imported somewhere (several engines are feature-flagged and might be dead imports). Out-of-scope for this read-only audit.

### 2.14 Empty `mobile/` directory (Trivial)
- `src/mobile/` exists but is empty. Either delete or populate; otherwise it's confusing noise.

---

## 3. Risk summary

| Area | Severity | Status |
| --- | --- | --- |
| Unsanitized `dangerouslySetInnerHTML` in `SignaturePage` | **High** | Not fixed (read-only) — needs DOMPurify |
| Missing `ErrorBoundary` wrapping `<App />` | **High** | File added, requires one line in `main.tsx` |
| No `X-API-Key` header anywhere | **High** | `api-client.ts` now supports it |
| Hardcoded `/api/...` fetch in `App.tsx` + `useAutonomousPipeline` | Medium | Migrate to `api-client.ts` |
| Dashboard/most pages lack loading state | Medium | Needs UI work |
| 59 `console.log` left in prod paths | Medium | Add Vite `esbuild.drop` |
| Auth token in localStorage | Medium | Consider HttpOnly cookie |
| AG-Grid not RTL-enabled | Medium | Add `enableRtl` prop on grids |
| Theme hardcoded across components | Low | `theme.ts` now available |
| Unused deps (@blueprintjs/table, icons, maybe axios) | Low | Prune after migration |
| WS reconnect w/o backoff | Low | Add exponential backoff |
| Empty `src/mobile/` | Trivial | Delete or populate |

---

## 4. Recommended next steps (for the owning engineer)

1. **Sanitize `SignaturePage`** — add `dompurify`, wrap `doc.content` before rendering.
2. **Wrap the root** — in `main.tsx`, import `ErrorBoundary` and wrap `<App />`.
3. **Adopt `api-client.ts`** — migrate `App.tsx` login, `useAutonomousPipeline` POST, and `useApi` off axios onto `api()` so the API key header and 401 logic apply uniformly.
4. **Apply `theme.ts`** — replace inline hex colors in new components; optionally run a codemod on existing ones.
5. **Enable AG-Grid RTL** — add `enableRtl={true}` to every `<AgGridReact>`.
6. **Strip prod console.logs** — add `build: { minify: 'esbuild' }` + `esbuild: { drop: ['console', 'debugger'] }` in `vite.config.ts`.
7. **Prune deps** — remove `@blueprintjs/table` and `@blueprintjs/icons` if still unused after the grid/icon audit; optionally remove `axios` once `useApi` is migrated.
8. **Add loading skeletons** — at minimum `Dashboard`, `Clients`, `Employees`, `WorkOrders`, `Pipeline` should surface the `useApi.loading` flag.

---

## 5. Files created by this audit

| Path | Purpose |
| --- | --- |
| `client/src/lib/api-client.ts` | Centralized fetch wrapper with VITE_API_URL / VITE_API_KEY / JWT / 401 reset / 429 backoff toast / typed errors. |
| `client/src/lib/theme.ts` | Palantir dark theme tokens — colors, typography, spacing, radius, shadow, layout, z-index, CSS variables map. |
| `client/src/components/ErrorBoundary.tsx` | Class component with Hebrew RTL Palantir-styled fallback UI, `reset` + `reload` actions, `onError` hook. |
| `client/CLIENT_AUDIT.md` | This audit. |

No existing files were modified. `package.json` and `vite.config.ts` untouched per task constraints.
