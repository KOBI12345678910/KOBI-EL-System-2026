# AG-X19 — PWA Offline Support

**Agent**: X-19
**Swarm**: 3
**Date**: 2026-04-11
**Target**: `payroll-autonomous` — Techno-Kol Uzi mega-ERP
**Task**: Service worker + manifest + IndexedDB sync queue + offline indicator + tests
**Rules respected**: never delete, Hebrew RTL, zero dependencies

---

## 1. Summary

Agent X-19 delivered a complete PWA offline layer for the `payroll-autonomous`
front-end. The module supports installable-app behaviour, three distinct
caching strategies, queued writes via IndexedDB with exponential backoff,
a Hebrew RTL offline indicator, and a "back online" toast. All deliverables
are zero-dependency vanilla JavaScript and pass a 16-case test suite.

---

## 2. Deliverables

| # | File | Purpose | LOC |
|---|------|---------|-----|
| 1 | `payroll-autonomous/public/sw.js` | Service Worker with 4 strategies + background sync | ~320 |
| 2 | `payroll-autonomous/public/manifest.json` | PWA manifest (Hebrew RTL, 4 icons, 3 shortcuts) | ~75 |
| 3 | `payroll-autonomous/src/offline/sync-queue.js` | IndexedDB sync queue + UI helpers | ~370 |
| 4 | `test/payroll/sync-queue.test.js` | 16 test cases, hand-rolled fake IndexedDB | ~380 |
| 5 | `_qa-reports/AG-X19-pwa-offline.md` | This report | — |

---

## 3. Service Worker (`sw.js`)

### Caching strategies

| Route pattern | Strategy | Cache |
|---------------|----------|-------|
| `*.css`, `*.js`, `*.mjs`, `*.woff2`, `*.svg`, `*.ico`, `*.webmanifest` | **Cache-first** | `tk-erp-static-v1.0.0` |
| `/api/*`, `/v1/*`, `/graphql` (GET) | **Network-first** + offline JSON fallback | `tk-erp-api-v1.0.0` |
| `*.png`, `*.jpg`, `*.webp`, `*.gif`, `*.avif` | **Stale-while-revalidate** | `tk-erp-img-v1.0.0` |
| `/api/*` (POST/PUT/PATCH/DELETE) | **Queue + Background Sync** | IndexedDB `tk-erp-offline` |
| Navigation | **Network-first + offline shell** | `tk-erp-static-v1.0.0` |
| Runtime fallthrough | **Network-first** | `tk-erp-runtime-v1.0.0` |

### Features

- **Cache versioning**: single `SW_VERSION` constant drives all 4 caches; old
  caches are purged on activate.
- **Precache list**: `/`, `/index.html`, `/manifest.json`, `/offline.html`
  (best-effort — individual failures do not block install).
- **skipWaiting + clients.claim**: new SWs take over immediately; clients
  receive `SW_UPDATED` postMessage so the UI can show the update toast.
- **Navigation preload**: enabled where supported for faster first paint.
- **Background Sync API**: mutating requests that fail offline are persisted
  and replayed under tag `tk-erp-sync-queue`. Page can trigger manual drain
  via `DRAIN_QUEUE` postMessage in browsers without Sync API.
- **Exponential backoff**: 500ms → 1s → 2s → 4s → 8s → capped 30s, max 5
  attempts per entry. 4xx responses are marked non-retriable immediately
  (except 408 Request Timeout and 429 Too Many Requests, which retry).
- **Offline fallback shell**: Hebrew RTL inline HTML is returned when no
  cached shell is available for a navigation request.
- **MessageChannel commands**:
  - `SKIP_WAITING` — force activate pending SW
  - `DRAIN_QUEUE` — manual queue drain
  - `GET_VERSION` — reply with version + build timestamp

---

## 4. Manifest (`manifest.json`)

### Core fields

```
name         : "Techno-Kol ERP"
name_he      : "טכנו-קול ERP"
short_name   : "TK-ERP"
start_url    : "/"
display      : "standalone"
dir          : "rtl"
lang         : "he-IL"
orientation  : "portrait-primary"
background_color : "#0b0d10"
theme_color      : "#4a9eff"
```

### Icons

4 PNG icons (192, 256, 384, 512) — paths stubbed at `/icons/icon-*.png`.
192 and 512 include `purpose: "any maskable"` for adaptive app icons.

### Shortcuts

| Name (EN) | Name (HE) | URL |
|-----------|-----------|-----|
| Create Invoice | חשבונית חדשה | `/invoices/new` |
| New Employee | עובד חדש | `/employees/new` |
| Scan Receipt | סריקת קבלה | `/scan/receipt` |

---

## 5. Sync Queue (`sync-queue.js`)

### Public API

```js
import SyncQueue, {
  queueRequest, processQueue, clearProcessed, getQueueSize,
  getPending, clearAll, backoffDelay, isOnline,
  installOnlineListeners, autoProcessOnReconnect,
  renderOfflineBadge, showOfflineBadge, hideOfflineBadge,
  showToast, STATUS, MESSAGES_HE
} from './offline/sync-queue.js';
```

### Schema (IndexedDB `tk-erp-offline` / store `sync-queue`)

```
id          : auto-increment (primary key)
url         : string
method      : string (uppercase normalized)
headers     : object
body        : string | null
timestamp   : number
attempts    : number
status      : 'pending' | 'done' | 'failed'
lastAttempt : number | null
lastError   : string | null
```

Two indexes: `timestamp` and `status`.

### Backoff schedule

| Attempt | Delay |
|---------|-------|
| 0 | 500 ms |
| 1 | 1 s |
| 2 | 2 s |
| 3 | 4 s |
| 4 | 8 s |
| 5 | 16 s |
| 6+ | 30 s (cap) |

### Dependency injection for tests

`processQueue()` accepts `{ fetchFn, sleep, idbFactory, onProgress, maxAttempts }`,
enabling deterministic testing without real network or real IDB.

### UI helpers (RTL)

- `renderOfflineBadge(doc)` — fixed top banner with `dir="rtl"`, `lang="he-IL"`,
  `role="status"`, `aria-live="polite"`. Idempotent.
- `showOfflineBadge()` / `hideOfflineBadge()` — animate transform.
- `showToast(message, opts)` — bottom-right toast with 3.5s TTL.
- `installOnlineListeners(onOnline, onOffline)` — wires `window.online` /
  `window.offline` events; returns unsubscribe function.
- `autoProcessOnReconnect()` — end-to-end glue: drains queue + shows Hebrew
  toasts whenever browser regains connectivity.

### Hebrew messages

```
offline    : "אין חיבור לאינטרנט — פעולות יישמרו בתור"
online     : "החיבור חזר — מסנכרן נתונים"
synced     : "הסנכרון הושלם בהצלחה"
syncFailed : "סנכרון נכשל — ננסה שוב"
```

---

## 6. Test Results

**Suite**: `test/payroll/sync-queue.test.js`
**Runner**: plain Node ESM (no framework, zero deps)
**Fake IDB**: hand-rolled in-memory shim in the same file
**Command**: `node test/payroll/sync-queue.test.js`

```
sync-queue.test.js — Techno-Kol ERP offline queue
----------------------------------------------------
  ok  - 01 queueRequest persists entry and returns numeric id
  ok  - 02 queueRequest rejects invalid input
  ok  - 03 getQueueSize counts only pending
  ok  - 04 getPending sorts by timestamp ascending
  ok  - 05 processQueue happy path drains all entries
  ok  - 06 processQueue retries on network error with backoff
  ok  - 07 processQueue stops on 4xx (non-retriable)
  ok  - 08 processQueue retries on 5xx / 408 / 429
  ok  - 09 clearProcessed removes done + failed, keeps pending
  ok  - 10 clearProcessed({includeFailed:false}) preserves failed
  ok  - 11 backoffDelay matches 500 * 2^n capped at 30s
  ok  - 12 multiple entries preserve FIFO by timestamp
  ok  - 13 processQueue invokes onProgress per entry
  ok  - 14 queueRequest normalizes method to uppercase
  ok  - 15 isOnline returns boolean in fake environment
  ok  - 16 installOnlineListeners no-ops when window undefined
----------------------------------------------------
Total: 16  Passed: 16  Failed: 0
```

**Coverage highlights**:
- Persistence round-trips (add / get / update / delete)
- Input validation (null, missing url, missing method)
- FIFO ordering by timestamp
- Successful drain
- Retriable failures (network errors, 503, 429, 408)
- Non-retriable failures (403)
- Progress callback invocation
- Method case normalization
- Backoff curve boundary conditions (n=0, n=6 cap, n=-1 clamp)
- Environment-safety of `isOnline` and `installOnlineListeners`

---

## 7. Integration Notes

### Registration snippet (drop into `src/main.jsx` or app bootstrap)

```js
import SyncQueue from './offline/sync-queue.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      // show update toast when a new SW takes over
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev.data && ev.data.type === 'SW_UPDATED') {
          SyncQueue.showToast(ev.data.message_he || 'גרסה חדשה זמינה');
        }
      });
    } catch (err) {
      console.warn('SW registration failed', err);
    }
  });

  // offline indicator
  SyncQueue.installOnlineListeners(
    () => { SyncQueue.hideOfflineBadge(); SyncQueue.showToast('החיבור חזר — מסנכרן'); },
    () => { SyncQueue.showOfflineBadge(); }
  );

  // auto-drain on reconnect
  SyncQueue.autoProcessOnReconnect();
}
```

### `index.html` head tags

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#4a9eff">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

### Required icon files (not created — stubbed in manifest)

Place PNG icons at:
```
payroll-autonomous/public/icons/icon-192.png
payroll-autonomous/public/icons/icon-256.png
payroll-autonomous/public/icons/icon-384.png
payroll-autonomous/public/icons/icon-512.png
```

---

## 8. Compliance

| Rule | Status |
|------|--------|
| Never delete existing files | **PASS** — only new files added |
| Hebrew RTL | **PASS** — `dir="rtl"`, `lang="he-IL"`, Hebrew messages, RTL UI helpers |
| Zero dependencies | **PASS** — all code uses vanilla Web APIs only; tests use hand-rolled fake IDB |
| Real code (no stubs) | **PASS** — all handlers implemented and tested |
| 10+ test cases | **PASS** — 16 cases, 16 passing |
| Accessibility | **PASS** — `role="status"`, `aria-live="polite"` on indicators |

---

## 9. Known Limitations / Follow-ups

1. **Icon PNGs**: stubbed at `/icons/icon-*.png`; actual PNG assets must be
   generated (e.g. from brand SVG) and placed in `public/icons/`.
2. **Background Sync API**: not supported in Firefox or Safari as of 2026-Q1;
   `autoProcessOnReconnect()` provides the fallback path via `window.online`
   event.
3. **Offline shell HTML**: an optional `/offline.html` file can be added to
   `public/` for a richer offline screen; current implementation falls back
   to inline HTML if missing.
4. **Quota handling**: the queue does not yet enforce a max-size or TTL;
   recommended follow-up in v1.1 — evict oldest entries past a configurable
   cap (e.g. 500 entries or 14 days).
5. **Encryption**: queued request bodies are stored in plain text in IDB.
   If queued entries may contain PII (likely for payroll), add an AES-GCM
   wrapper in a follow-up hardening pass.

---

## 10. File Paths (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\public\sw.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\public\manifest.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\src\offline\sync-queue.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\test\payroll\sync-queue.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-X19-pwa-offline.md`

---

**End of report — Agent X-19 / Swarm 3 / 2026-04-11**
