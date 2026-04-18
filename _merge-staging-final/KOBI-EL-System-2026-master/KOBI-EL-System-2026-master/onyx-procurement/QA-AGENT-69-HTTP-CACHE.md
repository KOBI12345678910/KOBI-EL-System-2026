# QA Agent #69 — HTTP Cache Headers Analysis
**Project:** onyx-procurement
**File analyzed:** `server.js` (934 lines)
**Date:** 2026-04-11
**Mode:** Static analysis only
**Dimension:** HTTP Cache Headers

---

## 1. Executive Summary

| Aspect | Status | Severity |
|---|---|---|
| `Cache-Control` headers on API responses | NOT SET | HIGH |
| `ETag` generation | DEFAULT Express (weak etag) | MEDIUM |
| `Last-Modified` headers | NOT SET | MEDIUM |
| `max-age` / `s-maxage` directives | NOT SET | HIGH |
| `no-store` for sensitive data | NOT SET | HIGH (security) |
| `immutable` directive | NOT SET | LOW |
| `express.static` middleware | NOT USED | INFO |
| `compression` middleware | NOT USED | MEDIUM |
| CDN-friendly headers (`Vary`, `Surrogate-Control`) | NOT SET | MEDIUM |
| 304 Not Modified handling | IMPLICIT (Express default) | LOW |

**Overall Grade:** **D** — No explicit cache policy exists anywhere in the server. Every response relies on Express defaults, leaving caching behavior ambiguous for clients, proxies, and CDNs.

---

## 2. Grep Results

Pattern search executed on `server.js` for:
```
Cache-Control | ETag | Last-Modified | max-age | no-store | immutable
setHeader | res.set | express.static | etag | lastModified
helmet | compression
```

**Result:** **ZERO matches.** The source code contains no cache-related directives of any kind.

---

## 3. Middleware Stack (lines 18-20)

```js
const app = express();
app.use(cors());
app.use(express.json());
```

### Findings
1. **No `express.static`** — server serves no static assets at all. It is a pure JSON API.
2. **No `helmet()`** — missing security headers; related to caching because `helmet` does NOT set cache headers (that's `express.static`'s job), but the absence confirms a minimalist middleware stack.
3. **No `compression()`** — responses are not gzipped, which compounds the cache problem because cold responses are larger than they need to be.
4. **No custom cache middleware** — e.g., `apicache`, `express-cache-controller`, `memory-cache`, none present.
5. **Express default ETag** — since Express 4.x sets `etag: true` by default, every `res.json()` / `res.send()` response receives a **weak ETag** (`W/"..."`) computed from the body. This is the ONLY caching signal emitted by this server. It enables **conditional GET** / `304 Not Modified` flow, but only if the client sends `If-None-Match`.

---

## 4. Endpoint-by-Endpoint Analysis

The server exposes 29 route handlers. Cache behavior per endpoint type:

### 4.1 Read-heavy / low-mutation endpoints (high cache potential)
| Line | Endpoint | Current headers | Recommended |
|---|---|---|---|
| 111 | `GET /api/status` | Default ETag only | `Cache-Control: no-store` (it's a heartbeat; caching would mask outages) |
| 130 | `GET /api/suppliers` | Default ETag only | `Cache-Control: private, max-age=300, stale-while-revalidate=60` |
| 140 | `GET /api/suppliers/:id` | Default ETag only | `Cache-Control: private, max-age=120` + `Last-Modified` from `updated_at` |
| 173 | `GET /api/suppliers/search/:category` | Default ETag only | `Cache-Control: private, max-age=600` + `Vary: Accept-Language` |
| 686 | `GET /api/subcontractors` | Default ETag only | `Cache-Control: private, max-age=300` |
| 805 | `GET /api/analytics/savings` | Default ETag only | `Cache-Control: private, max-age=900` (expensive aggregate) |
| 825 | `GET /api/analytics/spend-by-supplier` | Default ETag only | `Cache-Control: private, max-age=900` |
| 834 | `GET /api/analytics/spend-by-category` | Default ETag only | `Cache-Control: private, max-age=900` |

### 4.2 Mutable business data (short TTL or no-cache)
| Line | Endpoint | Recommended |
|---|---|---|
| 213 | `GET /api/purchase-requests` | `Cache-Control: no-cache` (forces revalidation) |
| 347 | `GET /api/rfq/:id` | `Cache-Control: no-cache` |
| 355 | `GET /api/rfqs` | `Cache-Control: no-cache` |
| 600 | `GET /api/purchase-orders` | `Cache-Control: no-cache` |
| 608 | `GET /api/purchase-orders/:id` | `Cache-Control: no-cache` |

### 4.3 Audit / security-sensitive
| Line | Endpoint | Recommended |
|---|---|---|
| 852 | `GET /api/audit` | `Cache-Control: no-store, max-age=0` + `Pragma: no-cache` |

### 4.4 Mutations (POST/PUT/DELETE)
All 15 mutation endpoints (e.g., `POST /api/suppliers`, `POST /api/rfq/send`, `POST /api/purchase-orders/:id/approve`) should emit:
```
Cache-Control: no-store
```
This is **critical** because browsers and intermediate proxies may otherwise cache `201 Created` / `200 OK` responses that contain business data.

### 4.5 Webhook endpoints
| Line | Endpoint | Recommended |
|---|---|---|
| 863 | `GET /webhook/whatsapp` (verify) | `Cache-Control: no-store` |
| 876 | `POST /webhook/whatsapp` | `Cache-Control: no-store` |

---

## 5. Specific Question Answers

### Q1: Do API responses set `Cache-Control`?
**No.** Zero occurrences in `server.js`. Every response falls back to Express defaults, which means **no `Cache-Control` header is emitted at all**. Per RFC 7234, a response with no cache directives MAY be cached heuristically by intermediaries (commonly 10% of `Last-Modified` age). This is a real risk.

### Q2: Static assets — handled by Express? express.static defaults?
**Not handled.** There is no `app.use(express.static(...))` call anywhere. The server is API-only. If the `onyx-procurement` project has a frontend, it must be served by a separate process (nginx, Vite dev server, Vercel, etc.), which means cache behavior for static assets is **outside this file's scope** — but the absence should be documented so deployment can address it.

If `express.static` were added, its **defaults** are:
- `etag: true` (strong ETag based on inode+size+mtime)
- `lastModified: true`
- `maxAge: 0` ← **this is the problem**: no `Cache-Control: max-age` is set unless explicitly configured.
Recommendation: `app.use('/assets', express.static('public', { maxAge: '1y', immutable: true, etag: true }))`.

### Q3: ETag generation?
**Yes, implicitly.** Express 4 default is `app.set('etag', 'weak')`. Every `res.json()` response produces a weak ETag via `etag` module. This is fine for JSON APIs but:
- It is **computed after** the body is serialized — no CPU savings.
- Weak ETags do NOT permit byte-range requests (irrelevant for JSON).
- There is no override in this file.

### Q4: 304 Not Modified handling?
**Implicit only.** Express checks `If-None-Match` against the generated ETag and automatically returns `304` when they match. However, because **no `Cache-Control` is set**, clients have no guidance on WHEN to send `If-None-Match`. Browsers will revalidate only under heuristic conditions. The 304 path is effectively unused.

### Q5: CDN-friendly headers?
**None.** There is no:
- `Vary` header (critical when behind a CDN serving multiple accept-languages or auth states)
- `Surrogate-Control` (Fastly/Akamai)
- `CDN-Cache-Control` (Cloudflare)
- `s-maxage` (shared cache directive)

A CDN placed in front of this API today would either cache nothing, or cache too aggressively and leak data across users.

### Q6: Mutable vs immutable assets?
**N/A — no assets.** But for the JSON API:
- **Ontological mutable** (order status, RFQ state, audit log): must never be cached long-term.
- **Ontological slow-moving** (suppliers list, subcontractors list, supplier categories): safe for 5-15 minute TTL.
- **Ontological reference** (spend categories enum, analytics rollups): safe for 15+ minute TTL.

### Q7: Should `/api/suppliers` be cached?
**Yes — short private cache.** Suppliers change rarely (~daily). Recommendation:
```js
app.get('/api/suppliers', async (req, res) => {
  // ...existing code...
  res.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
  res.set('Vary', 'Authorization');
  res.json({ suppliers: data });
});
```
`private` is critical because the response may contain tenant-specific data; it MUST NOT be cached by shared proxies/CDNs. `stale-while-revalidate` lets clients show stale data while silently refreshing.

### Q8: Recommendation per endpoint type
| Type | Directive |
|---|---|
| Health/status | `no-store` |
| Reference lists (suppliers, subcontractors) | `private, max-age=300, stale-while-revalidate=60` |
| Analytics rollups | `private, max-age=900` |
| Mutable lists (PRs, POs, RFQs) | `no-cache` (must-revalidate) |
| Single resource GETs | `private, max-age=60` + `Last-Modified` |
| Audit log | `no-store` |
| Mutations (POST/PUT/DELETE) | `no-store` |
| Webhooks | `no-store` |
| Static assets (if ever added) | `public, max-age=31536000, immutable` |

---

## 6. Risks

### HIGH
1. **Data leakage through shared caches** — without `private` directive, a corporate proxy or CDN could cache tenant-specific supplier data and serve it to another user. Today this works only because no cache directives exist; add a CDN and it breaks.
2. **Stale audit logs** — `/api/audit` has no `no-store`, so an intermediary could cache and serve stale audit data, masking security investigations.
3. **Mutation replay** — `POST` responses without `no-store` may be cached by misconfigured reverse proxies.

### MEDIUM
4. **Wasted bandwidth** — absence of `Cache-Control: max-age` + lack of `compression` middleware means every poll from the frontend re-downloads the entire supplier list (likely tens of KB) from Supabase on every request. The only saving grace is Express's auto-ETag enabling 304s.
5. **No `Vary: Authorization`** — if any auth is added later, shared caches will mix users. This is a ticking bomb.
6. **No Supabase-level caching** — the server fetches from Supabase on every request without even an in-memory cache layer. Combined with the absence of HTTP cache headers, this creates a double penalty.

### LOW
7. Default ETag is weak, not strong. Acceptable for JSON.
8. No `Last-Modified` populated from DB `updated_at` column, even though Supabase timestamps are readily available.

---

## 7. Recommendations (prioritized)

### P0 — Immediate
1. Add a cache-header middleware:
```js
// Default: no-store for everything, override per-route
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
```
Then explicitly opt-in to caching on specific GET routes.

2. Add `no-store` to the audit endpoint and all mutations explicitly, even if default changes.

### P1 — This sprint
3. Add `compression()` middleware: `app.use(require('compression')())`.
4. Add short-TTL caching to reference endpoints (`/api/suppliers`, `/api/subcontractors`, `/api/suppliers/search/:category`).
5. Add `Vary: Authorization, Accept-Language` where relevant.

### P2 — When CDN is added
6. Introduce `s-maxage` for shared caches.
7. Use `stale-while-revalidate` on analytics endpoints.
8. Populate `Last-Modified` from Supabase `updated_at`.

### P3 — If frontend gets served here
9. `app.use('/assets', express.static('public', { maxAge: '1y', immutable: true }))`.
10. Fingerprint asset filenames (hash in name) so `immutable` is safe.

---

## 8. Code Snippet — Proposed cacheControl helper

```js
const cacheControl = (policy) => (req, res, next) => {
  res.set('Cache-Control', policy);
  next();
};

const NO_STORE   = cacheControl('no-store');
const NO_CACHE   = cacheControl('no-cache');
const SHORT_PRIV = cacheControl('private, max-age=300, stale-while-revalidate=60');
const LONG_PRIV  = cacheControl('private, max-age=900');

// Global default: do not cache
app.use(NO_STORE);

// Override per-route:
app.get('/api/suppliers', SHORT_PRIV, async (req, res) => { /* ... */ });
app.get('/api/analytics/savings', LONG_PRIV, async (req, res) => { /* ... */ });
app.get('/api/audit', NO_STORE, async (req, res) => { /* ... */ });
```

---

## 9. Final Verdict

`server.js` is a caching blank slate. Express's default weak ETag provides minimal `304 Not Modified` support, but without any explicit `Cache-Control` directive, behavior downstream is unpredictable. For a procurement system that handles supplier data and audit trails, this is a **governance-grade concern**: the day a CDN is added, data will leak between tenants unless cache headers are fixed first.

**Required action:** Introduce a global `no-store` default and per-route opt-in for cacheable GET endpoints before any CDN or reverse-proxy deployment.

---

*End of report — QA Agent #69 — HTTP Cache Headers*
