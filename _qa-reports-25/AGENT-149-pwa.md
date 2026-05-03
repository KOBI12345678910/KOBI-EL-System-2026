# AGENT-149 — PWA / Offline Audit

**Date:** 2026-04-29
**Scope:** All client services in `Techno-Kol Uzi ERP 2026`
**Reference:** `_qa-reports/AG-X19-pwa-offline.md` (Agent X-19, 2026-04-11)
**Type:** Static analysis only

---

## 1. Executive Summary

`payroll-autonomous` is the **only PWA-ready client** in the system. It has dual
PWA wiring (Vite plugin generates a Workbox SW at build time, plus a hand-rolled
`public/sw.js` from Agent X-19 with IndexedDB sync queue).

The other three client surfaces are **not PWA-ready**:

| Service | Vite PWA | Manifest | SW | IndexedDB | Sync | Indicator |
|---------|:--:|:--:|:--:|:--:|:--:|:--:|
| `payroll-autonomous` (port 5173, /payroll) | YES | YES | YES (2x) | YES | YES | YES |
| `techno-kol-ops/client` (port 5174, /ops)  | YES | YES | NO | NO | NO | NO |
| `erp-app` (port 5173)                       | NO | NO | NO | partial | partial | YES (UI only) |
| `desktop-tutorial-client` (port 5173)       | NO | NO | NO | NO | NO | NO |
| `onyx-procurement` web/                     | NO | NO | NO | NO | NO | NO |

PWA score for the suite: **~25/100** (one client passes, three fail).

---

## 2. payroll-autonomous — PASS

**Vite config** (`payroll-autonomous/vite.config.js`):
- `VitePWA({ registerType: 'autoUpdate' })` — Workbox SW auto-registers and
  auto-updates on each new build.
- `manifest`: name "Techno Kol ERP", `lang: 'he'`, `dir: 'rtl'`, theme `#0b0d10`.
- Icons: `pwa-192x192.png`, `pwa-512x512.png` (+ maskable).
- Workbox: `globPatterns: ['**/*.{js,css,html,ico,png,svg}']`.
- `base: '/payroll/'` — scope correctly nested under the parent ERP host.

**Hand-rolled SW** (`payroll-autonomous/public/sw.js`, ~320 LOC, Agent X-19):
- Cache-first for static, network-first for `/api/*`+`/v1/*`+`/graphql`,
  stale-while-revalidate for images, network-first w/ offline shell for nav.
- Versioned caches (`tk-erp-static-v1.0.0`, `-api-`, `-img-`, `-runtime-`),
  old caches purged on activate.
- Background Sync API with `tk-erp-sync-queue` tag.
- MessageChannel commands: `SKIP_WAITING`, `DRAIN_QUEUE`, `GET_VERSION`.

**Static manifest** (`payroll-autonomous/public/manifest.json`):
- `start_url: '/payroll/'`, `scope: '/payroll/'`, `id: 'tk-erp'`.
- `display_override: ['standalone','minimal-ui','browser']`.
- 2 shortcuts (Create Invoice, New Employee) with HE short_name.

**IndexedDB sync queue** (`payroll-autonomous/src/offline/sync-queue.js`, ~370 LOC):
- DB `tk-erp-offline`, store `sync-queue`, indexes on `timestamp` + `status`.
- Exponential backoff 500ms-30s cap, max 5 attempts; non-retriable 4xx (except
  408/429); FIFO by timestamp; dependency injection for tests.
- Hebrew RTL UI helpers (`renderOfflineBadge`, `showToast`) with
  `role="status"`, `aria-live="polite"`.
- 16/16 tests passing (`test/payroll/sync-queue.test.js`).

---

## 3. payroll-autonomous — Gaps

1. **Dual SW conflict risk.** Vite-PWA generates its own SW (`registerType:
   'autoUpdate'`); the hand-rolled `public/sw.js` is also present. Whichever
   registers last wins, and `globPatterns` precaches `*.js` which would include
   the hand-rolled SW into a *different* SW's precache. Pick one, drop the
   other, or namespace them under different scopes.
2. **Missing assets in `public/`:** only `manifest.json` + `sw.js`. No
   `offline.html`, no `pwa-192x192.png`, no `pwa-512x512.png`, no
   `apple-touch-icon.png`, no `masked-icon.svg`. Manifest icons resolve to 404
   in production, breaking install on iOS/Android.
3. **`index.html` registers nothing.** `payroll-autonomous/index.html` has
   `<link rel="manifest" href="/manifest.json">` but `src/main.jsx` does NOT
   call `navigator.serviceWorker.register('/sw.js')`. Vite-PWA injects its own
   registration at build but the X-19 manual SW will never load unless wired.
4. **Manifest path mismatch.** `index.html` uses `/manifest.json` while
   `vite.config.js` `base: '/payroll/'` would resolve assets to
   `/payroll/manifest.json`. Confirm with a built bundle.
5. **No encryption on queued bodies.** Payroll PII sits in plaintext IDB.
   X-19 already flagged this for v1.1.

---

## 4. techno-kol-ops/client — PARTIAL

`vite.config.ts` declares `VitePWA` (autoUpdate, RTL, port 5174, `base: '/ops/'`)
and `client/public/manifest.json` is present (`start_url: '/ops/'`,
`scope: '/ops/'`, `id: 'tk-ops'`).

**Gaps:**
- No hand-rolled `sw.js` and no IndexedDB sync queue under
  `techno-kol-ops/client/src/`.
- No registration call in `client/src/main.tsx` (only React + Router boot).
- No offline indicator component.
- `public/` contains **only** `manifest.json` — no icon PNGs, no `offline.html`.
- `Grep` for `serviceWorker|registerSW|VitePWA` in `client/src` returns 0
  matches. The plugin will still emit a Workbox SW at build, but runtime UX
  for Hebrew offline (badge, toast) is absent.

**Result:** offline writes from the OPS hub (the system's primary UI) will
silently fail with `Failed to fetch`.

---

## 5. erp-app — FAIL (with quirks)

`erp-app/vite.config.ts` has **no VitePWA plugin** and **no manifest** in
`public/`. `index.html` has no `<link rel="manifest">`.

But `src/components/offline/offline-indicator.tsx` *does* exist and:
- Reads `navigator.onLine`, listens to `online`/`offline` events.
- Calls `navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-offline-data'))`
  at line 44 — this will reject in production because no SW is ever registered.
- Opens `indexedDB.open('MetalProDB', 1)` at line 90 — **different DB** from
  payroll's `tk-erp-offline`. Two unrelated stores in the same origin.
- Hebrew RTL strings (אתה במצב אופליין, סנכרון בעיצומו, מסונכרן).

**Result:** UI component exists but is wiring-orphan — there is no SW, no
`MetalProDB` upgrade, no sync handler. Component would show "0 pending"
forever.

---

## 6. desktop-tutorial-client — FAIL

`vite.config.js` is bare (`react()` plugin only, proxy to localhost:3000). No
manifest, no SW, no offline component, no IndexedDB. `index.html` lang="he"
dir="rtl" but ships zero PWA metadata.

---

## 7. onyx-procurement (server-first) — N/A but flagged

Already documented in `onyx-procurement/QA-AGENT-68-PWA.md`: zero PWA
artifacts, zero deps (`workbox`, `vite-plugin-pwa`, `idb`, `dexie`,
`localforage` all absent), `web/onyx-dashboard.jsx` is a standalone JSX
without bundler. PWA score 0/100. P0 gap for field/site usage.

---

## 8. Service Worker Scope Audit

| Client | `start_url` | `scope` | Conflict? |
|--------|-------------|---------|-----------|
| payroll-autonomous | `/payroll/` | `/payroll/` | OK (isolated) |
| techno-kol-ops/client | `/ops/` | `/ops/` | OK (isolated) |
| erp-app | n/a | n/a | none |
| desktop-tutorial-client | n/a | n/a | none |

If both Workbox SWs eventually deploy on the same origin (e.g. behind one
ERP gateway), browsers will register **two SWs in two scopes** (`/payroll/`
and `/ops/`). That is fine, but cache names overlap (`tk-erp-static-v1.0.0`
in payroll's hand-rolled SW vs Workbox-generated names in ops). Recommend
namespacing: `tk-payroll-*`, `tk-ops-*`.

---

## 9. Recommendations (priority order)

1. **P0 — Wire SW registration in payroll.** Add the X-19 snippet (§7 of
   `AG-X19-pwa-offline.md`) into `src/main.jsx`, or drop the hand-rolled
   `public/sw.js` and rely solely on Vite-PWA. Pick one; don't ship both.
2. **P0 — Add icon PNGs.** Create `pwa-192x192.png`, `pwa-512x512.png`,
   `apple-touch-icon.png` for both `payroll-autonomous/public/` and
   `techno-kol-ops/client/public/`. Without them, install prompt is broken.
3. **P0 — Replicate X-19 pattern in techno-kol-ops/client.** Copy
   `src/offline/sync-queue.js` + offline indicator. OPS is the operational
   hub and currently has no offline path.
4. **P1 — Resolve erp-app orphan indicator.** Add `VitePWA` + manifest + SW
   so the component does real work, or delete it to avoid false "synced" UX.
5. **P1 — Add `/offline.html`** to payroll + ops public dirs.
6. **P1 — Wire desktop-tutorial-client** with manifest + theme-color or mark
   it out-of-scope for PWA.
7. **P2** — AES-GCM encryption, cache-namespace unification, queue TTL
   eviction (per X-19 §9.4-9.5).

---

## 10. File Paths (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\vite.config.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\public\sw.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\public\manifest.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\offline\sync-queue.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\main.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\index.html`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\vite.config.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\public\manifest.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\main.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\vite.config.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\offline\offline-indicator.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\desktop-tutorial-client\vite.config.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\QA-AGENT-68-PWA.md` and `_qa-reports\AG-X19-pwa-offline.md`

---

**End — Agent 149 / 2026-04-29 / under 200 lines**
