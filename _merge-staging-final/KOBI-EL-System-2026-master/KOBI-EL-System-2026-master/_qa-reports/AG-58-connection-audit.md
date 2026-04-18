# AG-58 — DB Connection-Pool Audit

**Agent:** 58
**Date:** 2026-04-11
**Scope:** 4 projects under `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\`
**Rule of engagement:** nothing is deleted. This report is additive.

---

## 0. Executive summary

| Project              | DB layer                  | Config quality | Leak risk | New wrapper adopted? |
|----------------------|---------------------------|----------------|-----------|----------------------|
| `onyx-procurement`   | `@supabase/supabase-js`   | **partial**    | none      | available (opt-in)   |
| `onyx-ai`            | raw `https` → Supabase REST | n/a (2 s abort) | none      | n/a                  |
| `payroll-autonomous` | none (SPA)                | n/a            | none      | n/a                  |
| `techno-kol-ops`     | `pg.Pool`                 | **partial**    | none      | documented for future|

No outright connection leaks were found. Two latent risks were documented and
one wrapper module (`onyx-procurement/src/db/pool-config.js`) was created to
address #1 below.

---

## 1. Audit methodology

The audit walked each project and answered three questions:

1. Where is the client instantiated?
2. What pool / timeout / limit settings are passed?
3. Is the client (or the per-connection handle) always released on every path
   — normal, thrown, rejected?

Tools used: `Grep` for `createClient\(`, `new Pool\(`, `new Client\(`,
`pool\.connect\(\)`, `client\.release\(\)`, `pool\.end\(\)`, `supabase\.from`,
and manual `Read` of every hit. No runtime profiling; this is a static audit.

Files inspected (non-exhaustive):

- `onyx-procurement/server.js` (~L130)
- `onyx-procurement/scripts/migrate.js`, `migrate.legacy.js`, `migrate-verify.js`, `seed-data.js`, `backup.js`, `backup-restore.js`
- `onyx-procurement/src/bank/bank-routes.js`, `src/vat/vat-routes.js`, `src/payroll/payroll-routes.js`, `src/tax/annual-tax-routes.js`
- `onyx-procurement/src/db/query-analyzer.js`
- `onyx-ai/src/index.ts` (readyz handler ~L2335–2400), `src/onyx-integrations.ts`, `src/integrations.ts`
- `techno-kol-ops/src/db/connection.ts`, `src/db/init.ts`, `src/db/seed.ts`
- `techno-kol-ops/src/services/signatureService.ts`, `src/services/pipeline.ts`
- `techno-kol-ops/src/middleware/security.js` (graceful shutdown)
- `techno-kol-ops/src/config/env.js`, `src/config/env.test.js`
- `payroll-autonomous/package.json` (no DB deps — confirmed)

---

## 2. Findings — per project

### 2.1 `onyx-procurement`

**How it connects.** A single long-lived Supabase client is created in
`server.js` and passed by reference to every route module:

```js
// server.js:130
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
```

The route modules (`bank-routes.js`, `vat-routes.js`, `payroll-routes.js`,
`annual-tax-routes.js`) receive `supabase` as a function parameter in their
registration functions. None of them call `createClient` themselves. **Good
shared-instance hygiene.**

**Missing settings (latent risk).**

- No `db.schema` (defaults to `'public'` — cosmetic).
- **No client-side fetch timeout.** A hung Supabase REST call will block the
  Express handler until Node's default socket timeout (~2 minutes). In a
  saturated state this can exhaust worker capacity before `express-rate-limit`
  catches up. → Addressed by `makeSupabase()` in the new wrapper module.
- No `X-Client-Info` header. Not a leak, but makes `pg_stat_activity`
  debugging harder.

**Scripts.** Every script in `scripts/*.js` builds its own short-lived client
per process. They all run to completion and exit, so idle-connection leakage
is structurally impossible. Inspected:

| File                    | Client style                               | Leak?   |
|-------------------------|--------------------------------------------|---------|
| `migrate.js`            | `createClient` (service key), no explicit close | none (process exits) |
| `migrate.legacy.js`     | idem                                       | none    |
| `migrate-verify.js`     | `createClient` *and* `new pg.Client()` — the `pg.Client` is closed with `await client.end()` in a `finally` block | none |
| `seed-data.js`          | `createClient` (service key)               | none    |
| `backup.js`             | `createClient`, `db.schema='public'`       | none    |
| `backup-restore.js`     | idem                                       | none    |

### 2.2 `onyx-ai`

No `@supabase/supabase-js` import anywhere. The `/readyz` handler in
`src/index.ts` (~L2335) builds a one-off `https.request()` to
`${SUPABASE_URL}/rest/v1/`, reads `apikey` + `Authorization` from env, and
enforces `DB_TIMEOUT_MS = 2000` via an explicit abort timer. There is no
pool to tune; the handler returns `{ ready: false, source: 'supabase' }`
on timeout and falls back to the internal `EventStore.verifyIntegrity()`.

**Verdict.** No pool, no leak, no action needed.

### 2.3 `payroll-autonomous`

Pure Vite + React SPA. `package.json` declares only `react`, `react-dom`,
`vite`, `@vitejs/plugin-react`. No `pg`, no `@supabase/supabase-js`. Talks
to `onyx-procurement` via HTTP. **Nothing to audit.**

### 2.4 `techno-kol-ops`

**How it connects.**

```ts
// src/db/connection.ts
import { Pool } from 'pg';
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

- `max: 20` is exactly the per-service recommendation. Pass.
- `idleTimeoutMillis: 30000` = 30 s. Pass.
- `connectionTimeoutMillis: 2000` = 2 s — tighter than the 5 s guideline; fine.

**Missing settings (latent risk).**

- No `statement_timeout` at the Postgres level. A runaway `UPDATE` can pin a
  worker until the OS kills the query. → Documented in
  `docs/db-connection-pool.md` §2.5 and §4. Not fixed by this agent (no
  deletions; would require editing `connection.ts`, which is out of scope).
- No `application_name`. `pg_stat_activity` shows `client` for every conn.
- `pool.on('connect', ...)` hook is not installed — no per-connection `SET`
  to patch statement timeout / app name after the fact.

**Release hygiene.** Every `pool.connect()` / `getClient()` call site uses
`try { BEGIN; ...; COMMIT; } catch { ROLLBACK; throw } finally { client.release(); }`.
Inspected call sites:

| File                                    | Line range  | Pattern                                          |
|-----------------------------------------|-------------|--------------------------------------------------|
| `src/db/seed.ts`                        | 43–53       | `try / catch / finally release`                  |
| `src/db/init.ts`                        | 45–56       | idem                                             |
| `src/services/signatureService.ts`      | 37–84       | idem (create-document transaction)               |
| `src/services/signatureService.ts`      | 240–303     | idem (apply-signature transaction)               |
| `src/services/pipeline.ts`              | 237–286     | idem (advance-stage transaction)                 |

All **five** sites were inspected and all use the `try/finally release` idiom
correctly. **No leaks.**

**Graceful shutdown.** `src/middleware/security.js:260–289` installs SIGTERM
/ SIGINT / `uncaughtException` handlers that call `await pool.end()` before
letting the process exit. ~10 second drain window via `setTimeout(…).unref()`.
**Good.**

**Dead schema entries.** `src/config/env.js:49–51` still declares
`SUPABASE_URL` and `SUPABASE_ANON_KEY` as required — legacy from an earlier
design when techno-kol-ops was going to use Supabase. **No code reads them.**
Kept intentionally (rule: no deletions). If env is missing them the process
refuses to start, which is misleading but not a leak.

---

## 3. Leak-checks run

All negative (i.e. nothing found) unless otherwise noted.

| Check                                                                             | Result                                                                    |
|------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| `createClient(` inside a `for` / `while` / `forEach`                               | **none**                                                                  |
| `new Pool(` inside a loop                                                          | **none**                                                                  |
| `supabase.from(...)...` without an `await` on the left side                        | **none**                                                                  |
| `.then()` chained after `supabase.from(...)` with no error handler                 | **none**                                                                  |
| `pool.connect()` whose result is not used in a `try/finally`                       | **none** — every call site inspected uses the pattern                     |
| `new pg.Client()` without a matching `client.end()`                                | **none** — `migrate-verify.js:60` closes in `finally`                     |
| `pool.end()` on hot paths (request handlers, loops)                                | **none** — only in shutdown handlers                                      |
| Per-request re-instantiation of `createClient` in a route handler                  | **none**                                                                  |

---

## 4. Recommendations (ordered by impact)

### 4.1 — Add client-side fetch timeout to `onyx-procurement`'s main Supabase client.

**Status:** addressed by the new wrapper. The wrapper is opt-in: `server.js`
still constructs its client inline. To adopt, change `server.js:130`:

```js
// before
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// after
const { makeSupabase } = require('./src/db/pool-config');
const supabase = makeSupabase({ role: 'anon' });
```

This gives you a 30 s fetch timeout in production and 60 s in dev, plus the
`X-Client-Info` header for observability. Nothing else needs to change —
the client surface is identical.

### 4.2 — Patch `techno-kol-ops/src/db/connection.ts` with server-side guards.

Two lines of new code on the pool:

```ts
pool.on('connect', async (client) => {
  await client.query(`SET statement_timeout = 30000`);
  await client.query(`SET idle_in_transaction_session_timeout = 60000`);
  await client.query(`SET application_name = 'techno-kol-ops@${process.env.NODE_ENV || 'dev'}'`);
});
```

The new wrapper's `makePgPool()` implements this automatically, but we do
NOT delete `connection.ts` — the recommendation is for a follow-up PR, noted
here and in `docs/db-connection-pool.md` §4.3.

### 4.3 — Tighten `onyx-procurement/scripts/*.js` to use the wrapper.

When any of the five scripts is next touched, replace:

```js
const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
```

with:

```js
const { makeSupabase } = require('../src/db/pool-config');
const supabase = makeSupabase({ role: 'service' });
```

This brings them under the same timeout / `X-Client-Info` policy as the
server and avoids drift. Non-urgent — scripts are interactive.

### 4.4 — Clean up `techno-kol-ops/src/config/env.js` legacy Supabase keys.

Change `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `required: true` to
`required: false` so the process starts without them. **Noted only**, not
executed — the file already works in its production environment.

---

## 5. Tier sizing math

Supabase free tier = **60** concurrent Postgres connections total, shared
across every service, cron, backup, dashboard, and migration in the org.
Assume the worst-case simultaneous usage:

| Consumer                                    | Peak conns |
|---------------------------------------------|------------|
| `onyx-procurement` server (PgBouncer-bound) | 10         |
| `techno-kol-ops` server (direct pg)         | 20         |
| Migration / backup scripts (ad-hoc)         | 5          |
| Supabase dashboard (you)                    | 3          |
| Supabase internal (RLS, realtime, logs)     | ~10        |
| **Subtotal**                                | **48**     |
| Safety margin                               | 12         |
| **Total**                                   | **60**     |

At 48/60 the free tier is sustainable. If `techno-kol-ops` is promoted to
`max=40`, or a second app comes online, you must upgrade to Pro (400) and
set `SUPABASE_POOL_MAX=20` on every service.

---

## 6. What this audit did NOT do

- No runtime profiling — all findings are static.
- No load test of the new wrapper; it is written to be drop-in compatible
  with the existing `createClient` call site, but adoption is opt-in and
  should be covered by the existing integration tests when wired.
- No changes to `server.js`, `connection.ts`, or any script — only new files.
- No deletions. Dead / legacy config in `techno-kol-ops/src/config/env.js`
  and the unused `migrate.legacy.js` are noted but left in place.

---

## 7. Deliverables cross-reference

1. `docs/db-connection-pool.md` — current state, recommended values, wrapper
   reference. **(NEW)**
2. `onyx-procurement/src/db/pool-config.js` — the wrapper module
   (`makeSupabase` + `makePgPool`). **(NEW)**
3. `_qa-reports/AG-58-connection-audit.md` — this file. **(NEW)**

---

*Report generated by Agent 58. No files were deleted or modified.*
