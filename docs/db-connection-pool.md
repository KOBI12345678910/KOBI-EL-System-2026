# DB Connection Pool — Audit & Configuration

Agent-58 audit, 2026-04-11. Monorepo root: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\`.

This file documents the current state of every Supabase / Postgres connection pool across the 4 active projects, the recommended values, and the wrapper module that enforces them.

Rule of the session: **nothing is deleted**. This document adds; it does not remove. It supplements `QA-AGENT-72-POOL.md` and `QA-AGENT-74-PG-TUNE.md`.

---

## 1. Scope — the 4 projects

| Project                  | DB access style                     | Key file(s)                                                                                                    |
|--------------------------|-------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `onyx-procurement`       | Supabase REST (`@supabase/supabase-js`) — one shared client in `server.js`, plus short-lived clients in `scripts/*` | `server.js`, `scripts/migrate.js`, `scripts/migrate-verify.js`, `scripts/seed-data.js`, `scripts/backup.js`, `scripts/backup-restore.js` |
| `onyx-ai`                | No ORM. Raw `https.request` against Supabase REST for `/readyz` only | `src/index.ts` (readyz handler, ~L2335–2400)                                                                   |
| `payroll-autonomous`     | **No direct DB** — Vite/React SPA, talks to backend APIs only | `package.json` (no `pg`, no `@supabase/supabase-js`)                                                           |
| `techno-kol-ops`         | Direct `pg.Pool` (`pg@^8.11.3`) — single module-level pool     | `src/db/connection.ts`, `src/db/init.ts`, `src/db/seed.ts`, `src/services/signatureService.ts`, `src/services/pipeline.ts`, `src/middleware/security.js` |

Supabase tier assumption: **Free tier, 60 concurrent connections** (per org statement). Numbers below scale linearly for Pro (400) via the `tight` branch in `pool-config.js`.

---

## 2. Current state — what is actually in the code

### 2.1 `onyx-procurement` — `server.js:130`

```js
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
```

- One shared client for the entire process.
- **`db: { schema }`** — not set (defaults to `public`).
- **`global.headers`** — not set (no custom `Connection: close`).
- **Connection-limit / statement-timeout / idle-timeout** — **NOT SET**.
  Supabase REST connects through PgBouncer, so per-request connections are ephemeral; still, `statement_timeout` is set server-side at `'30s'` by Supabase by default (not overridden here).
- `bank-routes.js`, `vat-routes.js`, `payroll-routes.js`, `annual-tax-routes.js` receive `supabase` as a function parameter — **they do NOT call `createClient` themselves**. Good.

### 2.2 `onyx-procurement/scripts/*`

All five scripts build their own short-lived client per run:

| Script                  | Line | `db.schema` | `auth.persistSession` | Extra notes                         |
|-------------------------|------|-------------|-----------------------|-------------------------------------|
| `migrate.js`            | 33   | (default)   | `false`               | service-role key                    |
| `migrate.legacy.js`     | 44   | (default)   | `false`               | retained for back-compat            |
| `migrate-verify.js`     | 78   | (default)   | `false`               | short-lived, one query              |
| `migrate-verify.js`     | 60 (pg) | —        | —                     | `new pg.Client()`, closed in `finally` via `.end()` — OK |
| `seed-data.js`          | 59   | (default)   | `false`               | service-role key                    |
| `backup.js`             | 320  | `'public'`  | `false`               | snapshot-style export               |
| `backup-restore.js`     | 306  | `'public'`  | `false`               | snapshot-style restore              |

None of the scripts set a `fetch` override, so there is **no client-side statement timeout**. Scripts are process-bound (exit at end), so idle-leak risk is zero, but a runaway query can still block the script for minutes.

### 2.3 `onyx-ai` — `src/index.ts:2335`

No `@supabase/supabase-js` import. The `/readyz` handler uses `https.request` with a 2000 ms abort timer (`DB_TIMEOUT_MS`). Nothing to pool.

### 2.4 `payroll-autonomous`

No DB code. Package depends only on `react`, `react-dom`, `vite`. Nothing to audit.

### 2.5 `techno-kol-ops` — `src/db/connection.ts`

```ts
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

- **`max: 20`** — matches per-service recommendation.
- **`min`** — not set (defaults to 0). Fine for a low-traffic back-office.
- **`idleTimeoutMillis: 30000`** — matches recommendation (30 s).
- **`connectionTimeoutMillis: 2000`** — tighter than our 5 s guideline; keep (it's fine).
- **`statement_timeout`** — **NOT SET**. Postgres default is "no timeout", so a long query can pin a worker forever.
- **`query_timeout`** — not set (library-level wrapper).
- **`application_name`** — not set. Recommended: `techno-kol-ops@${NODE_ENV}` for `pg_stat_activity` visibility.
- Env schema (`src/config/env.js:49–51`) also declares `SUPABASE_URL` / `SUPABASE_ANON_KEY` as required, but no code actually calls `createClient()`. Leftover from an earlier plan; kept intentionally because we **do not delete**.

### 2.6 `techno-kol-ops` — graceful shutdown (`src/middleware/security.js:260`)

```js
if (pool && typeof pool.end === 'function') {
  try { await pool.end(); } catch (e) { /* log */ }
}
```

- Pool is drained on `SIGTERM` / `SIGINT` / `uncaughtException`. Good.

---

## 3. Recommended values — the canonical table

Rationale is in section 2 above and in `QA-AGENT-72-POOL.md`.

| Setting                          | Free tier (60 total) | Pro tier (400 total) | Notes                                             |
|----------------------------------|----------------------|----------------------|---------------------------------------------------|
| `max` per service                | `10`                 | `20`                 | Leave headroom for migrations + dashboard + cron. |
| `min`                            | `0` (free) / `2` (Pro) | `2`                | Pro: avoid cold-start latency on first request.    |
| `idleTimeoutMillis`              | `30000` (30 s)       | `30000`              | Release idle conns so PgBouncer can recycle.       |
| `connectionTimeoutMillis`        | `5000` (5 s)         | `5000`               | Fail fast when pool is saturated.                  |
| `statement_timeout` (server-side)| `30s`                | `30s`                | Hard cap per statement — set via `SET` on connect. |
| `idle_in_transaction_session_timeout` | `60s`          | `60s`                | Kill forgotten `BEGIN;` sessions.                  |
| `application_name`               | `${name}@${env}`     | `${name}@${env}`     | Shows up in `pg_stat_activity`.                    |
| `keepAlive`                      | `true`               | `true`               | TCP keepalive for long-lived NAT paths.            |

Supabase-js specific:

| Setting                      | `development`              | `production`                |
|------------------------------|----------------------------|-----------------------------|
| `auth.persistSession`        | `false`                    | `false`                     |
| `auth.autoRefreshToken`      | `false`                    | `false`                     |
| `db.schema`                  | `'public'`                 | `'public'`                  |
| `global.fetch` timeout       | 60 s (relaxed)             | 30 s (tight — matches `statement_timeout`) |
| `global.headers.X-Client-Info` | `${name}-dev`            | `${name}-prod`              |

The wrapper module `onyx-procurement/src/db/pool-config.js` (see section 5) implements exactly this table.

---

## 4. Known gaps

1. **`onyx-procurement/server.js`** — the shared Supabase client does not set a client-side fetch timeout. A hung Supabase request will hold the Express handler until Node's default socket timeout. → Fix: use the wrapper from `src/db/pool-config.js`.
2. **`onyx-procurement/scripts/*`** — no `statement_timeout`; a runaway backup/restore can hang. → Not critical (scripts run interactively), but the wrapper optionally supports it via `global.fetch`.
3. **`techno-kol-ops/src/db/connection.ts`** — missing `statement_timeout`, `application_name`, no per-connection `SET` hook. → Tracked in QA-AGENT-74.
4. **`techno-kol-ops/src/config/env.js`** — declares `SUPABASE_URL` / `SUPABASE_ANON_KEY` as required even though nothing uses them. Not deleted (rule: no deletions); noted here for future cleanup.
5. **`onyx-ai`** — readyz handler uses raw `https`. Fine as long as timeout is enforced, which it is (`DB_TIMEOUT_MS = 2000`).

---

## 5. The wrapper — `onyx-procurement/src/db/pool-config.js`

A new, additive module. **It does not replace anything** — existing call sites keep working. New code (and the scripts in `scripts/*` when they're next touched) can opt-in:

```js
const { makeSupabase } = require('./src/db/pool-config');
const supabase = makeSupabase({ role: 'anon' }); // or { role: 'service' }
```

The wrapper picks `development` or `production` settings from `NODE_ENV` and applies the table in section 3. Full source is in `onyx-procurement/src/db/pool-config.js`.

---

## 6. Leak audit — summary

Full findings are in `_qa-reports/AG-58-connection-audit.md`. Headline: **no outright leaks found**.

- No `createClient()` inside a `for` / `while` / `forEach` loop.
- No dangling `supabase.from(...)...` call missing an `await`.
- All `pg` `client.release()` calls are wrapped in `finally` blocks.
- All `pool.end()` calls happen inside graceful-shutdown handlers.
- `migrate-verify.js` uses `new pg.Client()` but closes with `await client.end()` in `finally`.

The only *latent* risk is #1 in section 4 — no client-side timeout on the main Supabase REST client. The wrapper fixes this.

---

## 7. Cross-reference

- `QA-AGENT-72-POOL.md`, `QA-AGENT-73-PG-MAINT.md`, `QA-AGENT-74-PG-TUNE.md` — the original QA agent reports in `onyx-procurement/`. This document does not supersede them; it adds a measured code-level audit.
- `docker-compose.yml` (repo root) — defines the local Postgres container; its `max_connections` is the hard ceiling for `techno-kol-ops` during local dev.
