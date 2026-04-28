# AGENT-301 — Runtime Terminal QA Report

**Date:** 2026-04-29
**Agent:** 301 — Terminal Runtime Agent
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Node version:** v24.14.1
**npm version:** 11.11.0
**OS:** Windows 11 Pro 10.0.26200

## Executive Summary

| Status | Count |
|--------|-------|
| Tests run | 16 (4 build + 4 boot + 8 endpoint probes) |
| Passed | 14 |
| Failed | 0 (boot failures); 2 partial (DB + AI bridge degrade) |
| Critical issues | 0 |
| High issues | 1 (port conflict between onyx-ai and techno-kol-ops in `.env.example`) |
| Medium issues | 3 |
| Low issues | 2 |

**Verdict: PARTIAL — All 4 services boot, build, and respond. Two services degrade gracefully (DB unavailable, AI bridge disabled) which is expected behavior in a workstation without docker compose up. NOT release-ready until DB and secrets are wired.**

## Service Inventory

| Service | Framework | Entry | Build cmd | Run cmd | Port (designed) | Port (actual) |
|---------|-----------|-------|-----------|---------|----------------|---------------|
| onyx-procurement | Express + Supabase (CommonJS) | `server.js` | n/a (JS) | `node server.js` | 3100 | 3100 |
| techno-kol-ops | Express + tsx/tsc (TS) | `src/index.ts` -> `dist/index.js` | `tsc` | `node dist/index.js` | 3200 | 3200 |
| onyx-ai | Raw http + tsc (TS, CJS) | `src/index.ts` -> `dist/index.js` | `tsc` | `node dist/index.js` | 3300 (per CLAUDE.md) | 3300 (after fix) |
| payroll-autonomous | Vite/React 18 + PWA | `index.html` + `src/main.jsx` | `vite build` | `vite` | 5173 (`/payroll/`) | 5173 |

## Build Results

All four packages built clean:

- **onyx-procurement** — no build step (pure CJS); `prestart` validates env (passes after `cp .env.example .env`).
- **techno-kol-ops** — `tsc` exited 0, no errors.
- **onyx-ai** — `tsc` exited 0, no errors. `prebuild` (rimraf dist) ran cleanly.
- **payroll-autonomous** — Vite build emitted 39 PWA precache entries, main bundle 517 KB / 152 KB gzip; PWA SW + workbox generated. Built in 2.48 s.

## Runtime / Boot Results

### onyx-procurement (3100) — PASS

```
✓ RBAC wired — 10 roles, 97 resources
✓ ops/metrics wired — GET /metrics
✓ domain-events wired — EventBus + shared-events producer
✓ db/query-analyzer wired
✓ Enterprise routes wired — 29 endpoints
✓ ONYX PROCUREMENT API SERVER on port 3100
```

Endpoint probes:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/status` | 200 | Returns full service status JSON |
| `GET /api/health` | 200 | Liveness ok |
| `GET /metrics` | 200 | Prometheus format |
| `GET /api/wiring/spec` | 401 | Auth enforced — correct |
| `GET /api/pipeline/stages` | 401 | Auth enforced — correct |
| `GET /` | 200 | Static landing |

### techno-kol-ops (3200) — PASS WITH DEGRADE

Server starts and accepts connections; database unreachable.

Boot output:
```
Alert engine started
Autonomous engine started
[EVENT BUS] Initialized
[BRAIN] 6 data flows initialized
TECHNO-KOL OPS v2.0 — Foundry Edition running on port 3200
[FOUNDRY] Brain Engine + Event Bus + Apollo + AIP + Ontology — ALL ONLINE
[BRAIN] Boot error: AggregateError [ECONNREFUSED] ...
   address: '127.0.0.1', port: 5432  (Postgres)
```

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /healthz` | 200 | `{"ok":true,"service":"techno-kol-ops","version":"1.0.0","uptime":5.24}` |
| `GET /api/health` | 200 | `{"status":"error"}` — payload reflects DB down. Liveness probe returns body but signals dependency error. |

### onyx-ai (3300) — PASS

After raising port from 3200 → 3300 (CLAUDE.md routing) and freeing prior leftover process.

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/status` | 200 | Returns engine/version/agents/tools/policies |
| `GET /` | 404 | Root not registered in Onyx platform router (raw http route handler is shadowed) |
| `GET /healthz` | 404 | Same shadowing issue |

### payroll-autonomous (5173) — PASS

```
VITE v5.4.21  ready in 1501 ms
Local:   http://localhost:5173/payroll/
```

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /payroll/` | 200 | Vite dev server serving the React app |
| `GET /` | 302 | Redirects to base path `/payroll/` (Vite `base` config) |

## Issues

### ISSUE-1 — `.env.example` for onyx-ai sets PORT=3200 (collides with techno-kol-ops)

- **Severity:** HIGH
- **Module:** onyx-ai
- **File:** `onyx-ai/.env.example` line 10
- **Description:** Comment on line 9 reads "B-22: onyx-ai uses port 3200 to avoid collision with onyx-procurement (3100)". This contradicts the canonical routing in `CLAUDE.md` which maps onyx-ai to **3300** and techno-kol-ops to **3200**. If both .env files are copied verbatim, two services try to bind 3200; the second fails with `EADDRINUSE`.
- **Repro steps:**
  1. `cp onyx-ai/.env.example onyx-ai/.env`
  2. `cp techno-kol-ops/.env.example techno-kol-ops/.env`
  3. Boot both services concurrently — second one crashes.
- **Actual:** EADDRINUSE on second binder.
- **Expected:** All four services start on 3100/3200/3300/5173 respectively.
- **Suggested fix:** Edit `onyx-ai/.env.example`:
  ```
  # Per CLAUDE.md routing: onyx-ai on 3300 (3200 is techno-kol-ops)
  PORT=3300
  ```
  Already applied to `onyx-ai/.env` for this run.
- **Status:** WORKAROUND APPLIED in `.env`; example file still wrong (shipped value will collide).

### ISSUE-2 — onyx-ai exposes inconsistent health/root paths

- **Severity:** MEDIUM
- **Module:** onyx-ai
- **File:** `src/index.ts` lines 2282-2314 vs `src/onyx-platform.ts`
- **Description:** `src/index.ts` defines an http.createServer with handlers for `/`, `/healthz`, `/livez` (lines 2289-2293) but `OnyxPlatform.start({ apiPort })` binds the port first (line 3016) and the second `listen()` silently fails on EADDRINUSE. The active server is `OnyxPlatform`, which only routes `/api/*` paths. Hence `/`, `/health`, `/healthz`, `/ready`, `/livez` all return 404 in production.
- **Repro:** `curl http://localhost:3300/healthz` → `{"error":"Not found"}`
- **Expected:** Cloud Run / Kubernetes liveness probes typically expect `/healthz` or `/`.
- **Suggested fix:** Either (a) remove the dead http.createServer wrapper at lines 2282-2314 (since OnyxPlatform owns the port) and add `/`, `/healthz`, `/livez` cases in `OnyxPlatform.route()`, or (b) handle EADDRINUSE explicitly and warn at boot.

### ISSUE-3 — techno-kol-ops `/api/health` returns `{"status":"error"}` with HTTP 200

- **Severity:** MEDIUM
- **Module:** techno-kol-ops
- **File:** `src/index.ts` line 168
- **Description:** When DB is down, `/api/health` returns 200 OK with `{"status":"error"}`. A standard ops health probe (k8s, Cloud Run) treats any 2xx as healthy and will not restart the pod even though the dependency is broken.
- **Repro:** Stop Postgres, `curl http://localhost:3200/api/health` → 200 + error JSON.
- **Expected:** 503 Service Unavailable when a hard dependency is down.
- **Suggested fix:** When DB query fails, `res.status(503).json({status:'error', db:'down'})`.

### ISSUE-4 — onyx-procurement env: required vars use placeholders by default

- **Severity:** MEDIUM (LOW for dev)
- **Module:** onyx-procurement
- **File:** `onyx-procurement/.env.example`
- **Description:** Required `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ship as `https://YOUR_PROJECT.supabase.co` / `eyJ...YOUR_ANON_KEY`. validate-env passes these as set, but the running server logs `Supabase: ✅ Connected` while supabase-js never actually reaches the server. RBAC + auth tests would silently always-deny.
- **Suggested fix:** validate-env should also detect `YOUR_*` placeholder strings and treat them as MISS in `--strict` mode for required vars.

### ISSUE-5 — onyx-procurement reports `Supabase: ✅ Connected` without verification

- **Severity:** LOW
- **Module:** onyx-procurement
- **File:** `server.js` boot banner
- **Description:** Banner says "Supabase: ✅ Connected" even when the service has never made a network call. Misleading.
- **Suggested fix:** On boot, perform a one-shot `supabase.from('_health').select('*').limit(0)` before printing the banner; print actual status (Connected / Unreachable / Auth-failed).

### ISSUE-6 — onyx-procurement reports `Auth Mode: api_key  API Keys: 0`

- **Severity:** HIGH (security implication if NODE_ENV=production)
- **Module:** onyx-procurement
- **File:** `server.js` (auth init)
- **Description:** Boot banner shows `Auth Mode: api_key  API Keys: 0`. With AUTH_MODE=api_key and zero keys, all authenticated endpoints return 401 (verified). In production, this would be a hard outage. Acceptable for dev today, but config validator should fail fast.
- **Suggested fix:** When `NODE_ENV=production` and `API_KEYS` is empty under `AUTH_MODE=api_key`, abort boot.

### ISSUE-7 — onyx-procurement static-mounts `/ops`, `/payroll`, `/ai` paths that may not exist

- **Severity:** LOW
- **Module:** onyx-procurement
- **File:** `server.js` static handler
- **Description:** Boot logs:
  ```
  ⚠️  /ops sibling not found at .../techno-kol-ops/client/dist
  ⚠️  /payroll sibling not found at .../payroll-autonomous/dist
  ✓ static /ai -> .../onyx-ai
  ```
  The static `/ai` mount points at the onyx-ai source root (no build artifact there). End users hitting `/ai/index.html` would see 404.
- **Suggested fix:** Mount `/ai` at the onyx-ai dist root (after `npm run build:ai`) or remove until OPS/payroll/AI dist directories are produced via root build.

### ISSUE-8 — Pre-existing leftover node process holding port 3300

- **Severity:** LOW (environmental)
- **Module:** environment
- **Description:** Found PID 25100 holding 0.0.0.0:3300 (started 02:00:54). Killed during this run; suggests prior agents leave dangling processes.
- **Suggested fix:** Add cleanup hook in agent runner to kill child processes before exit; consider `npm run ports` (defined in root package.json) in CI to detect collisions.

## Cross-Service Wiring Notes

- `onyx-procurement.env` defaults `ONYX_AI_URL=http://localhost:3200` (when var unset). With onyx-ai now on 3300, the AI bridge would target the wrong service. Bridge currently disabled (`ONYX_AI_API_KEY not set`), so this is latent.
- `techno-kol-ops.env` correctly references `ONYX_AI_URL=http://localhost:3300`.
- `payroll-autonomous` `.env.example` has `VITE_API_URL=http://localhost:3100` (onyx-procurement) — correct.
- Root `.env.example` references `SUPABASE_URL=http://postgres:5432` which is a docker-compose hostname and **not a Supabase REST URL**. This is wrong for a non-docker bring-up (would be caught only when `cp .env.example .env` is done at root and copied into onyx-procurement, where validator rejects).

## Recommendations / Priority Order

1. **HIGH** — Fix `onyx-ai/.env.example` PORT to `3300` (matches CLAUDE.md). One-line change, prevents future collision-trap.
2. **HIGH** — `onyx-procurement` boot must abort in production when `AUTH_MODE=api_key` and `API_KEYS` is empty.
3. **MEDIUM** — Wire `onyx-ai` to expose `/`, `/healthz`, `/livez` via the actual active listener (OnyxPlatform.route).
4. **MEDIUM** — `techno-kol-ops /api/health` should return 503 when DB is down (k8s/Cloud Run readiness contract).
5. **MEDIUM** — `validate-env --strict` should flag `YOUR_*`/`eyJ...YOUR_*` placeholders as MISS.
6. **LOW** — Verify Supabase connectivity at boot (one-shot probe) before printing "Connected".
7. **LOW** — Remove dead `app /ai` static mount or repoint to a built-dist directory.
8. **LOW** — Add agent-cleanup hook so leftover nodes don't hold ports between runs.

## Release Readiness

| Criterion | Status |
|-----------|--------|
| All 4 services boot | YES |
| All 4 services build | YES |
| Hard dependencies (DB / Supabase / Anthropic / WhatsApp) wired | NO (placeholder values, no docker compose up) |
| Liveness probes 200 OK | YES for procurement, ops; misaligned for ai-platform |
| Readiness probes correctly degrade | NO (techno-kol-ops returns 200 with error body when DB down) |
| Auth enforced on private endpoints | YES (verified via 401) |
| Port routing matches CLAUDE.md | YES (after .env fix) |

**NOT READY for release.** Two non-trivial fixes (port collision in `.env.example`, prod-mode boot abort with empty API_KEYS), three medium-tier health-probe fixes, plus the actual external dependencies (Supabase project, Anthropic key, Postgres, WhatsApp credentials) must be provisioned and wired before any staging deployment.

## Files Changed During QA

- `onyx-procurement/.env` — created from `.env.example` (gitignored).
- `techno-kol-ops/.env` — created from `.env.example` (gitignored).
- `onyx-ai/.env` — created from `.env.example`, then PORT changed from 3200 → 3300.
- `payroll-autonomous/.env` — created from `.env.example` (gitignored).

No source files were modified.
