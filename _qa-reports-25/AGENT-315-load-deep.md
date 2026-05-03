# AGENT-315 - Load Deep Audit (Concurrency, Throughput, Saturation)

**Agent:** 315 (Load / Stress / Concurrency QA)
**Date:** 2026-04-29
**Scope:** Deep load analysis across the 4 ERP services -- many users, parallel API, simultaneous R/W, DB / Auth / uploads saturation.
**Source artifacts:** AGENT-296 k6 scenarios; live source at `onyx-procurement/`, `techno-kol-ops/`, `payroll-autonomous/`, `onyx-ai/`.
**Method:** Static review of pool/limiter/transaction code paths + projected k6 behavior under the AGENT-296 scenarios.

---

## Targets

| Service | Port | DB pool max | Rate limit |
|---|---|---|---|
| TECHNO_KOL_OPS | 3200 | 20 (`techno-kol-ops/src/db/connection.ts:7`) | none observed |
| ONYX_PROCUREMENT | 3100 | 10 prod / 20 dev (`onyx-procurement/src/db/pool-config.js:38-79`) | tiered + global (`server.js:132-149`) |
| PAYROLL_AUTONOMOUS | 5173 | (frontend Vite dev srv, no direct pool) | n/a -- proxies to ops |
| ONYX_AI | 3300 | shared via ops pool | n/a |

---

## L1 - Connection-pool starvation under 100 concurrent browse VUs

**Title:** TECHNO_KOL_OPS pg.Pool max=20 starves at 100 concurrent users
**Description:** `techno-kol-ops/src/db/connection.ts` builds a single `pg.Pool({max:20})`. AGENT-296 S1 ramps to 100 VUs each issuing 3 GETs (360 + list + wiring) per iteration, plus state-machine transitions. With 100 VUs and 3 in-flight queries each, the pool ceiling is hit on the first second of steady-state.
**Steps to reproduce:** `k6 run tests/load/scenarios/browse.js` with target=100 against ops:3200.
**Actual:** Once concurrent active queries exceed 20, the next caller blocks on `pool.connect()` until `connectionTimeoutMillis=2000` elapses; queue depth grows; tail latency spikes; eventually `Error: timeout exceeded when trying to connect` appears.
**Expected:** P95 < 400 ms, < 1 % errors per S1 thresholds.
**Severity:** HIGH
**Module:** `techno-kol-ops/src/db/connection.ts`
**Fix:** Raise `max` to 50 for ops; add `connectionTimeoutMillis: 5000`; emit a `pool_wait_ms` Trend metric; add per-route caching for `/api/wiring/spec` and `/api/entity-map/*` (TTL 60 s) -- they are static blueprint data.

---

## L2 - ONYX_PROCUREMENT prod pool capped at 10 -- write storm cliff at 50/s

**Title:** Production pool max=10 cannot sustain S2 invoice arrival rate of 50/s
**Description:** `onyx-procurement/src/db/pool-config.js:58` sets `poolMax: 10` in production with `statementTimeoutMs: 30_000`. S2 fires 50 invoice POSTs/s for 20 s. Each invoice generates >=4 statements (insert header, insert lines, state-transition, audit-log) inside a transaction. Required throughput ~200 statements/s through 10 connections = 20 statements/s/conn -- feasible only if each statement <50 ms; any spike (vacuum, lock, index hit) causes back-pressure.
**Steps:** Run S2 (`tests/load/scenarios/invoices.js`) with `NODE_ENV=production`.
**Actual:** P95 inflates past 1500 ms; iterations queue at the `preAllocatedVUs:50` boundary; some POSTs hit 30 s `statement_timeout` and return 500.
**Expected:** All 1000 invoices created, P95 <1500, P99 <3000, no duplicates.
**Severity:** CRITICAL
**Module:** `onyx-procurement/src/db/pool-config.js`
**Fix:** Set `SUPABASE_POOL_MAX=30` (Supabase Pro tier supports >=200 conns); separate read pool (`poolMax:50`) and write pool (`poolMax:20`) in `pool-config.js`; ensure invoice insert uses a single multi-row `INSERT ... RETURNING` plus one audit row -- verify code in finance modules.

---

## L3 - Sliding-window limiter is process-local -- multi-instance bypass

**Title:** Tiered rate-limit store is in-memory, not shared
**Description:** `onyx-procurement/src/middleware/rate-limits.js:48-50` uses `const store = new Map()` per process. The file's own NOTE at line 28-30 says: "PROCESS-LOCAL. Multi-instance deployments should swap the store for Redis." When ops runs 4 PM2 cluster workers (or k8s replicas), an attacker hitting all instances multiplies the effective limit by N -- 100 reads/min becomes 400 reads/min on a 4-replica deploy. Same applies to expensive tier (5/min -> 20/min).
**Steps:** Deploy 4 replicas behind LB; from one IP+key issue 5 PCN836 generations across replicas.
**Actual:** All 5 succeed instead of 4 being 429d.
**Expected:** Global cap of 5/min/key.
**Severity:** HIGH (security / cost vector under load)
**Module:** `onyx-procurement/src/middleware/rate-limits.js`
**Fix:** Add Redis-backed adapter with same `_keyFor`/window math; gate behind `RATE_LIMIT_BACKEND=redis|memory`; keep memory as default for dev. Also: include user_id in `_keyFor` once SSO is wired.

---

## L4 - Slow-query log fires after the damage is done

**Title:** `if duration > 1000` warns but does not abort or shed
**Description:** `techno-kol-ops/src/db/connection.ts:20-22` logs slow queries but continues to await them while holding a pool connection. Under S1+S2 mix, a single slow GROUP BY (e.g., dashboard aggregation without index) holds a connection 5-30 s, starving everyone else.
**Steps:** Run mixed S1 + S2 + an unbounded `GET /api/finance360/aggregate?from=2020`.
**Actual:** One slow request can block 5-10 fast ones via pool starvation.
**Expected:** Slow queries shed under load.
**Severity:** MEDIUM
**Module:** `techno-kol-ops/src/db/connection.ts`
**Fix:** Set `statement_timeout` per session in `pool.on('connect')` (mirror what `pool-config.js:287-297` does in onyx). Add a circuit breaker: if EWMA(query_duration) > 1500 ms over last 10 s, return `503 Slow Down` on heavy endpoints, not on auth/health.

---

## L5 - 50 simultaneous payroll runs collide on shared tables

**Title:** Per-department isolation is correct in fixture but not enforced in DB
**Description:** S3 spawns 50 VUs each running payroll for `DEPT-001..050`. Even with distinct department keys, all 50 writes land on shared tables (`payroll_runs`, `payslips`, `audit_log`, `masav_entries`, `form_102`). No advisory lock or `SELECT ... FOR UPDATE` was found in `payroll-autonomous/src/`. If two runs of the same cycle race (e.g., DEPT-A and DEPT-B both touch `bituach_leumi_summary` rollup), the last writer wins and the rollup is stale.
**Steps:** Run S3; immediately query `SELECT SUM(gross_salary) FROM payslips WHERE cycle='2026-04'` and compare to `SELECT total FROM form_102 WHERE cycle='2026-04'`.
**Actual:** Totals can drift if rollup is computed via UPDATE-with-SUM rather than a view.
**Expected:** Form 102 totals == sum of payslips.
**Severity:** CRITICAL (money-flow correctness)
**Module:** `payroll-autonomous/*` (engine logic appears to live in `onyx-procurement/src/payroll/*` -- not co-located in payroll-autonomous src)
**Fix:** Wrap each run in `BEGIN; SELECT pg_advisory_xact_lock(hashtext('payroll-2026-04')); ... ; COMMIT` -- serializes the cycle even with parallel dept calls. Compute Form 102 / MASAV totals from a SQL VIEW, never via UPDATE-with-SUM.

---

## L6 - Auth verification not cached -- JWT cost paid on every request

**Title:** Bearer token verification likely re-decoded on every API call
**Description:** AGENT-296 sends `Authorization: Bearer ${TOKEN}` on every request (`browse.js:87`). At 200 rps sustained, that is 200 `jwt.verify()` calls/s. RSA-256 verify is ~0.5-1 ms on Node; HMAC-256 ~0.1 ms. No `auth-cache.js` was found in `onyx-procurement/src/auth/`. With kid rotation each verify also fetches JWKS -- which under load could DoS the IdP.
**Steps:** Run S1 for 5 min, watch IdP/JWKS endpoint hits.
**Actual:** N x 100 VUs x ~1 req/s = ~100 JWKS fetches/min if no cache.
**Expected:** JWKS cached >= 5 min, verified token + claims cached for 60 s by token hash.
**Severity:** HIGH
**Module:** `onyx-procurement/src/auth/`
**Fix:** Add `jwks-rsa` with `cache:true, cacheMaxAge:600_000`; add `lru-cache` keyed by `sha256(token)` storing `{exp, claims}` for 60 s.

---

## L7 - No upload pipeline -- multer/busboy missing

**Title:** Service has no file-upload middleware, but tests imply uploads
**Description:** `onyx-procurement/QA-AGENT-143-EXPENSES.md:88` states package.json has only 4 deps: express, supabase-js, dotenv, cors. No `multer` / `busboy` / `formidable`. Any upload-heavy load (receipts, bank statements, MASAV imports) goes through `express.json()` body parser, default 100 KB. At 50 concurrent 5 MB upload attempts, the process either OOMs or rejects with 413.
**Steps:** k6 `http.file()` POST `multipart/form-data` to `/api/expenses/receipt`.
**Actual:** 404 (no route) or 413 (PayloadTooLarge).
**Expected:** Streaming multipart parse, per-file 10 MB cap, 5-concurrent upload limit per user.
**Severity:** HIGH (blocks an entire load surface)
**Module:** `onyx-procurement/server.js` + new `src/middleware/uploads.js`
**Fix:** Add `multer` with `diskStorage` to `/tmp`, `limits:{fileSize:10*1024*1024, files:5}`; chain `file-type` magic-byte check; chain optional `clamav` scan; persist to Supabase Storage with signed URL.

---

## L8 - Idempotency keys honored at app layer but no DB unique index found

**Title:** `Idempotency-Key` header is best-effort, not database-enforced
**Description:** k6 sends `Idempotency-Key: inv-${__VU}-${__ITER}` (`invoices.js:170`). For this to be safe under load (retry after timeout, double-click, k6 restart), the server must store the key in a table with `UNIQUE(idempotency_key, account_id)` and return the cached response on collision. No such table or index was found via Grep on `onyx-procurement/src/`.
**Steps:** Replay the same payload twice with the same Idempotency-Key under load.
**Actual:** Two invoice rows, two different invoice_numbers.
**Expected:** Second call returns the first response; one row.
**Severity:** CRITICAL (financial duplication)
**Module:** `onyx-procurement/src/finance/*`
**Fix:** Create `idempotency_keys(key TEXT, scope TEXT, response_hash TEXT, status_code INT, body JSONB, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(key, scope))` with a 24 h cleanup job; wrap POST handlers with middleware that lookups before insert.

---

## L9 - WebSocket / realtime subscriptions on payroll page

**Title:** `payroll-autonomous/src/hooks/useRealtime.ts` opens a Supabase realtime channel per page
**Description:** Each user landing on `/payroll/runs/:id` opens a realtime subscription. With 100 concurrent users on the page, that is 100 open WS to Supabase. Supabase free tier caps WS at 200 concurrent and each channel costs CPU. No connection pooling/multiplexing was reviewed.
**Steps:** Open the page in 200 tabs; observe Supabase dashboard WS count.
**Actual:** WS count climbs to 200+, new connections rejected silently, UI stops updating without error toast.
**Expected:** Single multiplexed channel per tenant + presence; reconnect with jitter.
**Severity:** MEDIUM
**Module:** `payroll-autonomous/src/hooks/useRealtime.ts`
**Fix:** One channel per tenant subscribed at app shell; per-page components subscribe via `channel.on(...)` filters; backoff `1s,2s,4s,8s,30s` on disconnect; show offline banner if 3 retries fail.

---

## L10 - Audit log write amplification

**Title:** Every state transition writes a row to audit_log on the same DB
**Description:** Master Flow has 13 stages. A single end-to-end iteration of the combined-pipeline test (Section 6 in AGENT-296) writes >=9 audit rows. At 20 VUs sustained for 5 min, that is 20 * 9 * iterations = ~50 K rows. Without `BRIN` index on `created_at` and partitioning by month, audit_log will hit table-scan on dashboard queries while load is running.
**Steps:** Run pipeline test for 5 min while a CEO dashboard polls `SELECT * FROM audit_log WHERE created_at > NOW()-INTERVAL '1h' ORDER BY created_at DESC LIMIT 100`.
**Actual:** Dashboard query degrades from 50 ms to 2-5 s.
**Expected:** <200 ms dashboard query regardless of audit volume.
**Severity:** MEDIUM
**Module:** DB schema (audit_log)
**Fix:** `CREATE INDEX audit_log_created_at_brin ON audit_log USING BRIN(created_at)`; partition by month; route writes through an async queue (BullMQ or pg_partman) so user requests do not pay audit-write latency.

---

## L11 - No HTTP keep-alive tuning between services

**Title:** Cross-service calls (ops -> proc -> ai) do new TCP per request
**Description:** Internal calls between TECHNO_KOL_OPS, ONYX_PROCUREMENT and ONYX_AI use bare `fetch()` / `axios` without an explicit `http.Agent({keepAlive:true, maxSockets:50})`. Under S1, every page render that triggers a wiring call -> entity-map call -> AI recommendation call burns 3 fresh TCP+TLS handshakes (~50-150 ms each).
**Steps:** Wireshark / `ss -t` during S1.
**Actual:** Handshakes dominate latency; CPU on services climbs from TLS work.
**Expected:** Single warm pool, 99 % connection reuse.
**Severity:** MEDIUM
**Module:** `onyx-procurement/src/ai-bridge.js`, all `fetch(...)` cross-service callers
**Fix:** Export a shared `lib-client/http-agent.js` with `keepAlive:true, maxSockets:128`; pass `agent` to every cross-service fetch.

---

## L12 - State-machine transitions allow double-trigger races

**Title:** No optimistic concurrency token on entity transitions
**Description:** `GET /api/state-machines/quote/transitions?current=DRAFT` returns options; `POST /api/orchestrator/execute` performs the transition. If two operators (or two browser tabs) both submit `approve` within ~50 ms, both can read `current=DRAFT` and both transition `DRAFT->APPROVED`. The handler likely runs `UPDATE quotes SET state='APPROVED' WHERE id=$1` without `AND state='DRAFT' AND version=$2`.
**Steps:** k6 spawns 2 VUs targeting same quote_id, same action.
**Actual:** Two transitions logged, two emails sent, possibly two PO creations.
**Expected:** First wins; second returns 409 Conflict.
**Severity:** HIGH
**Module:** `onyx-procurement/src/pipeline/orchestrator.js`
**Fix:** Add `version INT DEFAULT 0` to every entity; client sends `If-Match: <version>`; server `UPDATE ... WHERE id=$1 AND version=$2 RETURNING *`; if 0 rows -> 409.

---

## L13 - PCN836 / Form 102 / MASAV exports are O(N) sync handlers

**Title:** Heavy export endpoints block the event loop
**Description:** `onyx-procurement/src/middleware/rate-limits.js:39` flags `expensive` tier with cap 5/min for "exports, PCN836 gen, bulk PDF". A 50 K-line PCN836 generation on the request thread will block Node event loop for several seconds; under load, neighbour requests queue and their P99 jumps.
**Steps:** Trigger PCN836 export while running S1.
**Actual:** S1 P99 spikes to >2 s while export runs.
**Expected:** Background job; HTTP returns `202 + job_id`; SSE/poll for completion.
**Severity:** HIGH
**Module:** `onyx-procurement/src/tax/*`, exports modules
**Fix:** Move to BullMQ worker; `POST /export -> 202 {job_id}`; `GET /jobs/:id` to poll; signed URL returned on completion.

---

## L14 - k6 `Idempotency-Key: inv-${__VU}-${__ITER}` is unique per run -- masks idempotency bugs

**Title:** Test fixture rotates the key, so it never replays
**Description:** AGENT-296 S2 builds a unique key per (VU, iter), so two runs never collide. The note "Idempotency: replaying same Idempotency-Key returns same row" is asserted but never executed by the script.
**Steps:** Re-read `invoices.js:170`.
**Actual:** Idempotency claim is documentation only.
**Expected:** A dedicated micro-scenario that posts the same key 5x in 1s.
**Severity:** LOW (test gap, not prod gap)
**Module:** `tests/load/scenarios/invoices.js` (to be added)
**Fix:** Add scenario `invoice_idempotency_replay`: 1 VU, 5 iterations, fixed key `inv-replay-test`, asserts identical `invoice_number` in all responses.

---

## L15 - `preAllocatedVUs:50` with `maxVUs:200` may oversubscribe the test runner

**Title:** k6 worker can exhaust local FDs / memory before the system under test fails
**Description:** S2 allows up to 200 VUs to handle 50/s. If service P95 climbs to 4 s under load, k6 spawns extra VUs; combined with S1's 100 VUs and S3's 50 VUs all running, peak VUs ~350. On Windows runners default ulimit / handle table can choke before the SUT does.
**Steps:** Run all three scenarios with `--http-debug=full` in same `k6 run`.
**Actual:** Misleading errors that look like SUT problems but are runner FD exhaustion.
**Expected:** Run scenarios serially in CI; only run combined for soak testing on a beefy host.
**Severity:** LOW (test infra)
**Module:** `tests/load/erp-load.js`
**Fix:** Split into `npm run load:s1 && load:s2 && load:s3`; reserve `load:soak` for a dedicated 1 h combined run on Linux runner with `ulimit -n 65536`.

---

## L16 - No backpressure signal from DB pool to HTTP layer

**Title:** Express returns 200 (eventually) instead of 503 when pool is starved
**Description:** When `pool.connect()` is queued >2 s, the request still resolves once a slot opens, ballooning P99 instead of failing fast. Clients keep retrying, multiplying load (retry storm). No middleware exposes pool depth to a health probe or to `Retry-After`.
**Steps:** Saturate pool then watch tail.
**Actual:** No 503s; P99 climbs to 10+ s.
**Expected:** Pool depth > 0.9 -> 503 + Retry-After: 2.
**Severity:** MEDIUM
**Module:** New `onyx-procurement/src/middleware/db-backpressure.js`
**Fix:** Middleware reads `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`; if `waitingCount > poolMax * 2`, return 503; export depth to `/metrics`.

---

## L17 - Helmet + CORS configured but no slowloris protection

**Title:** No `request-timeout` / `header-timeout` -- slow-headers attack pins workers
**Description:** Default Node `headersTimeout=60s` and `requestTimeout=300s` (Node >=18). One attacker dribbling headers can pin a worker socket for 5 min, ratio 1:5000 attacker:server cost.
**Steps:** Use `slowhttptest -c 1000 -H -i 10 -r 200 -t GET -u http://ops:3200/`
**Actual:** Service degrades; healthz still 200 but real traffic stalls.
**Expected:** `headersTimeout=10s`, `requestTimeout=30s` on Express server.
**Severity:** HIGH
**Module:** `onyx-procurement/server.js`
**Fix:** `server.headersTimeout = 10_000; server.requestTimeout = 30_000; server.keepAliveTimeout = 5_000;`

---

## L18 - Memory leak surface: in-memory rate-limit map without TTL on tier maps

**Title:** GC of rate-limit store is opportunistic, not guaranteed
**Description:** `rate-limits.js:54-65` runs GC only "every WINDOW_MS * 5" and only on-write. If traffic stops, stale entries remain. Worse: under sustained DDoS with rotating IPs, the map grows unbounded.
**Steps:** Replay 1 M unique IP+key combos in 1 hour.
**Actual:** RSS climbs by ~64 bytes per key * 1 M = 64 MB; by 10 M -> 640 MB.
**Expected:** Bounded LRU.
**Severity:** MEDIUM
**Module:** `onyx-procurement/src/middleware/rate-limits.js`
**Fix:** Replace `Map` with `lru-cache({max:50_000, ttl:WINDOW_MS*2})`; or move to Redis (see L3).

---

## Summary table

| ID | Severity | Module | One-line fix |
|---|---|---|---|
| L1 | HIGH | techno-kol-ops/db/connection.ts | pool max 20->50 + cache wiring/entity-map |
| L2 | CRITICAL | onyx/db/pool-config.js | SUPABASE_POOL_MAX=30; split read/write |
| L3 | HIGH | onyx/middleware/rate-limits.js | Redis-backed adapter |
| L4 | MEDIUM | techno-kol-ops/db/connection.ts | session statement_timeout + circuit breaker |
| L5 | CRITICAL | payroll engine | pg_advisory_xact_lock + SQL views for totals |
| L6 | HIGH | onyx/auth | jwks-rsa cache + lru token cache |
| L7 | HIGH | onyx/server.js | multer + file-type + clamav |
| L8 | CRITICAL | onyx/finance | idempotency_keys table + middleware |
| L9 | MEDIUM | payroll/hooks/useRealtime | one channel per tenant |
| L10 | MEDIUM | DB schema | BRIN + monthly partition + async write |
| L11 | MEDIUM | lib-client/http-agent | keepAlive shared agent |
| L12 | HIGH | onyx/pipeline/orchestrator.js | optimistic concurrency version |
| L13 | HIGH | onyx/tax exports | BullMQ jobs + 202 + SSE |
| L14 | LOW | tests/load (new) | idempotency-replay micro scenario |
| L15 | LOW | tests/load/erp-load.js | run scenarios serially in CI |
| L16 | MEDIUM | onyx/middleware/db-backpressure.js | 503 when waitingCount > 2*max |
| L17 | HIGH | onyx/server.js | server.headersTimeout=10s |
| L18 | MEDIUM | onyx/middleware/rate-limits.js | lru-cache bounded store |

End of AGENT-315 report.
