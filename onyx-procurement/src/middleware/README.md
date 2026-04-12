# ONYX Middleware

Drop-in Express middleware for the ONYX procurement server.

## `rate-limits.js` — Tiered Sliding-Window Rate Limiting

Pure in-memory, zero-dependency, per `(IP + X-API-Key)` sliding 60s window.

| Tier         | Limit       | Intended for                                         |
| ------------ | ----------- | ---------------------------------------------------- |
| `read`       | 100 req/min | GET / HEAD / lookups / lists / dashboards            |
| `write`      |  20 req/min | POST / PUT / PATCH / DELETE (mutations)              |
| `expensive`  |   5 req/min | Exports, PCN-836 generation, bulk PDF, full backups  |

### Exempt paths

`/healthz`, `/livez`, `/readyz`, `/metrics` — never counted, never 429.

### Response headers

Every non-exempt response (success AND `429`):

```
X-RateLimit-Limit:     <tier max>
X-RateLimit-Remaining: <hits left in current window>
X-RateLimit-Reset:     <unix seconds when oldest in-window hit ages out>
```

On 429, additionally:

```
Retry-After: <seconds>
```

with body:

```json
{
  "error": "Rate limit exceeded for write tier (20 req/min)",
  "retry_after_seconds": 42,
  "tier": "write"
}
```

---

## Wiring

### 1. Default read limiter (global fallback)

`readLimiter` is the safest global default — mount early so it protects every
route that doesn't override. This is already wired in `server.js`.

```js
const { readLimiter } = require('./src/middleware/rate-limits');
app.use(readLimiter);
```

### 2. Per-route overrides — mutations

Attach `writeLimiter` to mutation routes. Order matters: the last limiter to
run wins the budget check, so put tier-specific limiters AFTER the global
`readLimiter` mount.

```js
const { writeLimiter } = require('./src/middleware/rate-limits');

app.post('/api/purchase-orders',          writeLimiter, createPO);
app.put ('/api/purchase-orders/:id',      writeLimiter, updatePO);
app.patch('/api/suppliers/:id',           writeLimiter, patchSupplier);
app.delete('/api/quotes/:id',             writeLimiter, deleteQuote);
```

### 3. Per-route overrides — expensive operations

```js
const { expensiveLimiter } = require('./src/middleware/rate-limits');

app.get ('/api/reports/export',           expensiveLimiter, exportReport);
app.post('/api/vat/pcn836/generate',      expensiveLimiter, generatePCN836);
app.post('/api/documents/pdf/bulk',       expensiveLimiter, bulkPdf);
app.post('/api/backup/snapshot',          expensiveLimiter, snapshotBackup);
```

### 4. Router-level (alternative)

If you prefer to group by router:

```js
const router = express.Router();
router.use(writeLimiter); // all mutations on this router
router.post('/', createThing);
router.put('/:id', updateThing);
app.use('/api/things', router);
```

### 5. Auto-classify with `tierForRoute()`

For endpoints where you don't want to hard-wire a tier, use the classifier:

```js
const {
  tierForRoute, readLimiter, writeLimiter, expensiveLimiter,
} = require('./src/middleware/rate-limits');

const LIMITERS = {
  read: readLimiter,
  write: writeLimiter,
  expensive: expensiveLimiter,
};

app.use((req, res, next) => {
  const tier = tierForRoute(req); // 'read' | 'write' | 'expensive'
  return LIMITERS[tier](req, res, next);
});
```

`tierForRoute(req)` rules (in order):

1. Path matches `/export`, `/pcn836`, `/pdf/bulk`, `/reports/generate`,
   `/backup` → `expensive`
2. Method is `GET` / `HEAD` / `OPTIONS` → `read`
3. Otherwise → `write`

---

## Coexistence with existing `express-rate-limit`

`server.js` already runs two coarser pools:

- `apiLimiter`      — 300 req / 15 min per IP on `/api/*`
- `webhookLimiter`  — 120 req / min per IP on `/webhook/*`

The tiered limiters in this module are strictly **additive**: they layer a
finer per-minute check on top. If either limiter fires the client gets 429 —
that's correct behavior. Do not remove the coarse pools.

---

## Scaling beyond one process

This store is process-local (`Map` of arrays). For multi-instance deployments
swap `store` for a Redis-backed implementation with the same surface
(`push timestamp`, `filter by window`). Everything else — headers, 429 body,
`tierForRoute`, exempt paths — stays identical.

---

## Testing / ops

Internals exposed for tests:

```js
const rl = require('./src/middleware/rate-limits');
rl._resetAll();        // clear all tier buckets
rl._snapshot();        // { read: { buckets: N }, write: {...}, expensive: {...} }
```
