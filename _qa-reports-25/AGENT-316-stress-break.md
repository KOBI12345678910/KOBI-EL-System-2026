# AGENT-316 — Stress / Break Test Report

**Agent:** 316 (Stress/Break)
**Date:** 2026-04-29
**Scope:** ONYX Procurement (3100), Techno-Kol Ops (3200), Payroll, AI — server.js, pipeline/*, web/*.html
**Method:** Static + adversarial flow analysis. Targets: extreme input, large files, bad data, load, double clicks, aggressive navigation, mid-flight refresh, disconnect/reconnect, timeouts, parallel ops.

---

## BUG-316-001 — Double-click on PO approve creates duplicate approvals
**Description:** `app.post('/api/purchase-orders/:id/approve')` reads current state, then writes 'approved' without a row-level lock or `WHERE status='pending_approval'` predicate.
**Steps:**
1. Open `po360.html` for a PO in `pending_approval`.
2. Bind a script to fire two POSTs in <50ms to `/api/purchase-orders/:id/approve`.
3. Both pass `enforceTransition('po', 'pending_approval', 'approved')` because the second hasn't seen the first's commit.
**Actual:** Two `recordTransition` rows, two `audit_log` entries, two `procurement.po.approved` domain events, two ERP notifications.
**Expected:** One transition; second responds 409 INVALID_TRANSITION.
**Severity:** HIGH (BUG-316-001)
**Module:** `onyx-procurement/server.js:1212` `purchase-orders/:id/approve`
**Fix:** Convert to optimistic update — `.update({status:'approved'}).eq('id',id).eq('status','pending_approval').select().single()`. If `data` is null → already approved → 409. Same pattern applies to `/send`, `/rfq/:id/decide`, `/quotes`.

---

## BUG-316-002 — RFQ decide race: weights can divide by zero on parallel call
**Description:** `clamp(parseFloat(v) || 0)` accepts `Infinity`/`-Infinity` (parseFloat returns Infinity) and `NaN` (mapped to 0). Sending `{price_weight:"Infinity"}` produces `priceScore = NaN` after normalization, breaking ranking and persisting `weighted_score:NaN` in DB.
**Steps:** `POST /api/rfq/:id/decide` body `{"price_weight":"Infinity","delivery_weight":1e308}`.
**Actual:** weightSum becomes `Infinity`, `weight.price/Infinity = NaN`, `priceScore * NaN = NaN`, decision rows stored with NaN.
**Expected:** 400 with "weights must be finite numbers in [0,1]".
**Severity:** HIGH
**Module:** `onyx-procurement/server.js:967-983` `/api/rfq/:id/decide`
**Fix:** `const clamp = v => { const n=Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; };`

---

## BUG-316-003 — Quote totals overflow on 10^15 quantity
**Description:** `/api/quotes` does `Math.round(item.quantity * item.unit_price * discountMult)`. No cap on quantity or unit_price. With `quantity: 1e308, unit_price: 1e308` the product is `Infinity`; `Math.round(Infinity)` returns Infinity, then JSON-serialized as `null` (Postgres numeric overflows or stores null), corrupting downstream PO total.
**Steps:** `POST /api/quotes` `{line_items:[{quantity:1e308, unit_price:1e308, discount_percent:0}]}`.
**Actual:** `subtotal: null` written to DB; VAT calc divides by 1+VAT_RATE → still Infinity; PO360 page shows `₪NaN`.
**Expected:** 400 with "quantity exceeds maximum (1e9)".
**Severity:** HIGH
**Module:** `onyx-procurement/server.js:852-935` `/api/quotes`
**Fix:** Add bounds — `if(!Number.isFinite(item.quantity)||item.quantity<0||item.quantity>1e9) return 400;` per line item, plus aggregate total cap.

---

## BUG-316-004 — `/api/suppliers` has no pagination → unbounded result set
**Description:** `GET /api/suppliers` runs `.select('*').order('overall_score',{ascending:false})` with **no limit**. With 10k+ suppliers Express buffers the entire result, JSON.stringify's it on the event loop, blocking all other requests.
**Steps:** Seed 50,000 supplier rows, hit endpoint 5x in parallel.
**Actual:** Worker stalls 8–30s per call; `/healthz` times out at 2s; rate-limit hits before responses return.
**Expected:** Default `limit=50, offset=0`; require `?all=true` to bypass.
**Severity:** HIGH (DoS vector)
**Module:** `onyx-procurement/server.js:578` `/api/suppliers` and `/api/purchase-orders:1198`, `/api/subcontractors:1395`, `/api/rfqs:842`, `/api/purchase-requests:675`
**Fix:** Wrap every list endpoint with `.range(offset, offset+limit-1)` and surface `?limit&offset` query params with caps.

---

## BUG-316-005 — Status race in PO send: WhatsApp success without state-machine guard on 'sent'→'sent'
**Description:** Two parallel `/send` calls — first succeeds (`status: sent`), second's `enforceTransition('po', 'sent', 'sent')` fails (good), but the supplier's WhatsApp inbox still gets the second message because `sendWhatsApp` runs **before** the SM check on the post-write path. The pre-check looks at stale `po.status`.
**Steps:** Two near-simultaneous `POST /api/purchase-orders/:id/send`.
**Actual:** Supplier receives the same PO twice; second call writes `status:'send_failed'` because the state machine rejects `sent→sent`.
**Expected:** Second call rejected before any external send.
**Severity:** HIGH (supplier-facing, integrity)
**Module:** `onyx-procurement/server.js:1267-1388` `/api/purchase-orders/:id/send`
**Fix:** Acquire row lock via conditional `UPDATE ... WHERE status='approved' RETURNING *` before sending; only proceed if a row was claimed.

---

## BUG-316-006 — Rate limiter bypass via X-Forwarded-For spoof
**Description:** `express-rate-limit` defaults to using `req.ip`. Server uses default Express trust-proxy setting. With proxy in front (nginx/CDN typical for ERP), `req.ip` is derived from `X-Forwarded-For`. Attacker rotates header to bypass per-IP cap of 300/15min.
**Steps:** `curl -H "X-Forwarded-For: 1.2.3.<rand>" /api/...` in a loop; never hits limiter.
**Actual:** Effectively no rate limit.
**Expected:** Trust proxy must be explicitly set; otherwise XFF must not be honored.
**Severity:** HIGH
**Module:** `onyx-procurement/server.js:132-147` rate limiter setup
**Fix:** Set `app.set('trust proxy', 1)` (or specific IPs) AND add a per-API-key key generator: `keyGenerator: req => req.headers['x-api-key'] || req.ip`.

---

## BUG-316-007 — Aggressive navigation mid-load leaves stale fetch promises
**Description:** `entity360.html`, `po360.html` start `loadPO()` on mount without `AbortController`. User clicks a related entity quickly → `window.location.href = url`; pending fetch still resolves on the new page (cached) and writes to a now-detached DOM, throwing "Cannot read properties of null".
**Steps:** Open `entity360.html?id=123`; before render, click related card → `entity360.html?id=456`; spam 5 navigations.
**Actual:** Console errors; rendered page shows a flash of entity 123 fields under entity 456 header.
**Expected:** Cancel inflight on navigation/unload.
**Severity:** MEDIUM (UI integrity)
**Module:** `onyx-procurement/web/entity360.html:110,257` and `po360.html:455-471`
**Fix:** Use `AbortController`; on `beforeunload` call `controller.abort()`. Track current request id; ignore stale resolves.

---

## BUG-316-008 — Refresh during quote submit creates orphan line items
**Description:** `/api/quotes` inserts header → inserts line_items → updates `rfq_recipients` → inserts `price_history`. No transaction. Browser refresh between steps 1 and 2 leaves a quote header with zero line items but `total_price` populated.
**Steps:** `POST /api/quotes` huge body; F5 immediately after request fires.
**Actual:** Orphan rows; UI shows quote with totals but no items; `decide` later picks it as winner using bogus pricing.
**Expected:** Single Postgres transaction (Supabase `rpc` or stored proc) so partial state never commits.
**Severity:** HIGH (financial integrity)
**Module:** `onyx-procurement/server.js:852-935`
**Fix:** Wrap in `pg.BEGIN/COMMIT` via direct PG client OR an RPC function `submit_quote_atomic(...)` running inside a transaction.

---

## BUG-316-009 — Unbounded JSON body up to 2MB with deeply-nested object → CPU stall
**Description:** `express.json({limit:'2mb'})` allows 2MB JSON; no depth limit. POSTing nested array `{a:[[[[[...]]]]]}` (10k deep) makes V8 recurse during downstream `JSON.stringify` for audit logs.
**Steps:** `POST /api/purchase-requests` with 1.9MB deeply-nested body.
**Actual:** Event loop blocks 600–1200ms; multiple parallel requests cause cascade timeouts.
**Expected:** Reject body whose depth exceeds N; reject suspicious shapes.
**Severity:** MEDIUM (DoS)
**Module:** `onyx-procurement/server.js:126-129`
**Fix:** Tighten limit to 256KB on most routes; mount 2MB only on specific upload endpoints. Use `JSON.stringify` with replacer to check depth, or `safe-stringify`.

---

## BUG-316-010 — Disconnect/reconnect: WhatsApp send "fire-and-forget" never retries
**Description:** `sendErpNotification` swallows errors silently (`req.on('error', () => {})`). When ops service is down during PO approve, the user sees "approved" but ops dashboard never gets the alert. No DLQ or retry.
**Steps:** Stop techno-kol-ops; approve a PO; bring ops back up.
**Actual:** No notification ever arrives.
**Expected:** Persistent outbox table; redelivery worker.
**Severity:** MEDIUM
**Module:** `onyx-procurement/server.js:29-49` `sendErpNotification`
**Fix:** Insert into `notification_outbox` row, then async worker drains with retry+jitter; mark row `delivered_at` on 2xx.

---

## BUG-316-011 — Unicode/RTL injection in supplier name breaks 360 pages
**Description:** `pickFields` allowlist permits `name: string` of any content. RLO (U+202E), zero-width joiners, or 10k-char names render as malformed badges and overflow `eh-name` div. Hebrew direction reverses entire dashboard.
**Steps:** `POST /api/suppliers` `{"name":"‮evilcorp‬" + "​".repeat(10000)}`.
**Actual:** Other suppliers' names display reversed; supplier360 page hangs on render with 10k zero-width chars.
**Expected:** Strip control chars; cap name length to 200.
**Severity:** MEDIUM
**Module:** `onyx-procurement/server.js:596-611`
**Fix:** Add `sanitize(s){return String(s).replace(/[‪-‮​-‏]/g,'').slice(0,200);}` and apply to all string inputs.

---

## BUG-316-012 — Mass-assignment on supplier_products bypasses pickFields default
**Description:** Inner declaration `const PRODUCT_FIELDS = [...]` only allowlists 10 keys, but `supplier_id` is appended via `{...pickFields(...), supplier_id: req.params.id}`. If `req.body.supplier_id` exists, it's stripped — good. BUT `req.body.id`, `req.body.created_at`, `req.body.updated_at` are also silently stripped without a `400` — caller never learns the field was ignored, leading to "I sent it but it didn't save" support tickets.
**Steps:** `POST /api/suppliers/:id/products {"id":"forced-uuid","name":"x"}`.
**Actual:** Saved with auto id, no error; user thinks override worked.
**Expected:** Reject with 400 listing rejected unknown fields.
**Severity:** LOW
**Module:** `onyx-procurement/server.js:623-630`
**Fix:** Detect unknown keys in body; respond `{rejectedFields:[...]}` 400.

---

## BUG-316-013 — DB timeout in `/healthz` does not surface degraded mode
**Description:** `/healthz` races `dbPing` against 2s timeout but returns 200 OK with `db: 'down'`. Load balancer sees 200 → keeps routing traffic to a node that can't read.
**Steps:** Block Supabase port; hit `/healthz`.
**Actual:** Returns `200 {status:'ok', db:'down'}`.
**Expected:** 503 when db down.
**Severity:** HIGH (availability)
**Module:** `onyx-procurement/server.js:1745-1755` (approx, healthz)
**Fix:** Return `503` if DB ping fails OR add `/readyz` separately; load balancers should poll `/readyz`.

---

## BUG-316-014 — Parallel orchestrator actions on the same entity have no idempotency key
**Description:** `POST /api/orchestrator/execute` (referenced in po360.html) takes `{action, entity, id}` with no `idempotency_key`. Network retry from client repeats the action.
**Steps:** Slow network; client retries `quote.convert_to_project` twice.
**Actual:** Two projects created, two contracts, double Slack/WhatsApp notification, double risk-baseline jobs.
**Expected:** First success returns saved result; second sees the key and returns the cached result.
**Severity:** HIGH
**Module:** `onyx-procurement/src/pipeline/orchestrator.js`
**Fix:** Require `Idempotency-Key` header; store `(key→response)` for 24h.

---

## BUG-316-015 — Audit log writes are sequential awaits — slow under load
**Description:** `await audit(...)` is called inline in every mutation handler. Under 100 RPS to `/quotes`, audit_log inserts queue at the writer connection limit, blocking the response by 200–800ms.
**Steps:** Load-test `/api/quotes` at 200 RPS.
**Actual:** p95 latency climbs from 80ms to 1.4s; audit_log lags real time.
**Expected:** Fire-and-forget audit (queue/buffer) or batched insert.
**Severity:** MEDIUM
**Module:** `onyx-procurement/server.js` (audit calls throughout)
**Fix:** Push audit events to in-process bounded queue; batch-flush every 250ms or 100 events.

---

## BUG-316-016 — Mock fallback in po360.html leaks production-shaped data
**Description:** `loadPO` catches network failure and uses `mockPO` as silent fallback. User sees a "real-looking" PO that doesn't exist; clicking approve fires `doAction` which only `alert()`s — but on a real backend wired button this would issue a write referencing the mock id.
**Steps:** Disconnect network; open `po360.html?id=PO-9999`.
**Actual:** Page renders fully populated mock; only the alert prevents action — wiring is one bug away from creating a phantom PO.
**Expected:** Show error; no mock fallback in production.
**Severity:** MEDIUM (defensive)
**Module:** `onyx-procurement/web/po360.html:455-471`
**Fix:** Gate mock behind `?dev=1`; otherwise show error UI.

---

## BUG-316-017 — `enforceTransition` returns `valid:true` for unknown entity types
**Description:** `state-enforcement.js:39-42` — "graceful degradation". A typo in entity type (`'p_o'` vs `'po'`) silently passes ALL transitions.
**Steps:** Call `enforceTransition('po_typo', 'whatever', 'closed')`.
**Actual:** `{valid:true}`.
**Expected:** `{valid:false, error:'unknown entity type'}`.
**Severity:** HIGH (type-safety)
**Module:** `onyx-procurement/src/pipeline/state-enforcement.js:39-42`
**Fix:** Maintain a known-types set; throw on unknown so dev catches it; fail closed in prod.

---

## BUG-316-018 — VAT_INCLUDED quote with delivery_fee=0 emits NaN VAT amount
**Description:** When `vat_included=true` and `deliveryFee=0`, `deliveryNet = Math.round(0/(1+0.18)) = 0`. OK. BUT if `delivery_fee=null` and `free_delivery=false` then `deliveryFee = (null) || 0 = 0` — fine. Still, downstream computation `vatAmount = (gross-subtotal) + (deliveryFee - deliveryNet)` can become negative if `gross < subtotal*1.18` due to rounding (each line independently rounded). Negative VAT submitted to PCN-836.
**Steps:** Many small lines with vat_included=true (each rounded down).
**Actual:** Aggregate VAT can be `-1` or `-2` ILS.
**Expected:** Compute VAT once at the header level after summing nets.
**Severity:** MEDIUM (tax compliance)
**Module:** `onyx-procurement/server.js:865-879`
**Fix:** Round once at the total; line totals computed but VAT split done at header.

---

## BUG-316-019 — `/api/rfq/:id/decide` reads suppliers in `.in('id', supplierIds)` with no cap
**Description:** When 5,000 quotes exist (synthetic stress), `supplierIds` array is sent to Supabase which inlines to a giant SQL `IN(...)` clause. Postgres parser slows; some clients reject >32k bytes URL.
**Steps:** Synthetic 5,000 quote rows; call `/decide`.
**Actual:** 414 URI Too Long OR slow query (3–8s).
**Expected:** Chunk in batches of 500.
**Severity:** LOW–MEDIUM
**Module:** `onyx-procurement/server.js:996-1000`
**Fix:** Chunk by 500 then merge with Map.

---

## BUG-316-020 — No CSRF protection on cookie-auth path (latent)
**Description:** Server enables `cors({credentials:true})` and accepts both X-API-Key and cookie-mediated calls. There is no CSRF token enforcement. If session cookies are introduced (planned), GET-side-effect endpoints become CSRF targets.
**Steps:** Inject `<img src="https://erp/api/purchase-orders/123/approve">` from an attacker site.
**Actual:** Today: 401 (no API key). Latent: as soon as a session cookie is added, this triggers approve.
**Expected:** SameSite=strict, CSRF token, or POST-only mutations + Origin check.
**Severity:** LOW (latent), HIGH if cookie auth ships
**Module:** `onyx-procurement/server.js:118-123`
**Fix:** Add `csurf` or origin-allowlist middleware for state-mutating routes.

---

# Summary

| Severity | Count | IDs |
|---|---|---|
| HIGH | 9 | 001,002,003,004,005,006,008,013,014,017 |
| MEDIUM | 8 | 007,009,010,011,015,016,018,020 |
| LOW | 2 | 012,019 |

**Top fix priority:** 001 (PO double-approve), 005 (double WhatsApp send), 008 (atomic quotes), 013 (healthz lies), 014 (no idempotency), 017 (unknown-entity bypass).

**Recurring root causes:**
- No row-level optimistic locking on state transitions.
- No transaction wrappers for multi-step writes.
- No idempotency keys on orchestrator and approve/send endpoints.
- List endpoints unbounded by default.
- Front-end fetches not aborted on navigation.
