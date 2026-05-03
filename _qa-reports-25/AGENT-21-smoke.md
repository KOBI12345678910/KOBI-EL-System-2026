# AGENT 21 — Static Smoke Test

**Mode:** Static read-only (no execution).
**Date:** 2026-04-29
**Scope:** onyx-procurement, techno-kol-ops, onyx-ai, payroll-autonomous, AI-Task-Manager

---

## Per-Service Bootability

### 1. onyx-procurement (port 3100)

| Check | Result | Evidence |
|---|---|---|
| `package.json` start/dev | PASS | `"start": "node server.js"`, `"dev": "node --watch server.js"` (lines 8-9). `prestart` runs `scripts/validate-env.js`. |
| Entry file exists | PASS | `server.js` present at root. |
| Port binding | PASS | `const PORT = process.env.PORT || 3100;` `app.listen(PORT, ...)` at line 1781-1782. |
| `/health` route | PASS | `/health`, `/healthz`, `/livez`, `/readyz` exempt paths declared (line 156); `app.get('/healthz', ...)` at line 1730; `/api/admin/ai-bridge/health` at line 305. |
| Supabase client init | PASS | `const { createClient } = require('@supabase/supabase-js')` (line 19); `createClient(...)` at line 169. |
| Crash-on-boot risk | LOW | Hard `process.exit(1)` if `SUPABASE_URL` or `SUPABASE_ANON_KEY` are missing (lines 84-94). Will refuse to start without env, which is correct behavior but blocks zero-env smoke. |

### 2. techno-kol-ops (port 3200)

| Check | Result | Evidence |
|---|---|---|
| `package.json` start/dev | PASS | `"start": "node dist/index.js"`, `"dev": "tsx watch src/index.ts"`, `"build": "tsc"` (lines 5-7). `start` requires prior `npm run build`. |
| Entry file exists | PASS | `src/index.ts` (12058 bytes). |
| Port binding | PASS | `const PORT = process.env.PORT || 3200;` `server.listen(PORT, ...)` at line 292-293. |
| `/health` route | PASS | `/api/health` (line 168, with DB ping), `/healthz` (line 186), `/livez` (line 195), `/readyz` (line 199), `/api/bridges/health` (line 219). Comprehensive K8s probes. |
| Supabase client init | NOT APPLICABLE | Service uses Postgres `pool` directly (`./db/connection`, line 6); no `@supabase/supabase-js` dependency. Per architecture this is fine. |
| Crash-on-boot risk | MEDIUM | `start` script depends on `dist/` which is not present in repo (no `dist/` committed). Must run `npm run build` first or use `dev`. JWT, bcrypt, pg deps all declared. |

### 3. onyx-ai (port 3300 per CLAUDE.md, but code defaults to 3200)

| Check | Result | Evidence |
|---|---|---|
| `package.json` start/dev | PASS | `"start": "node dist/index.js"` with `prestart: npm run build`, `"dev": "ts-node src/index.ts"` (lines 11-13). |
| Entry file exists | PASS | `src/index.ts` (110903 bytes — large monolith). |
| Port binding | WARNING | `const PORT = parseInt(process.env.PORT || '3200', 10);` at line 2979. **Default `3200` collides with techno-kol-ops.** CLAUDE.md says port 3300; code disagrees. |
| `/health` route | PASS | `/healthz` (line 2331), `/livez` (line 2345), `/health` legacy alias (line 2358), `/readyz` with Supabase ping (line 2495). Direct handler at line 2286 short-circuits before router. |
| Supabase client init | PARTIAL | No `@supabase/supabase-js` declared in `dependencies`. Code reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` env (line 2495) and uses raw `fetch` to `/rest/v1/` endpoint (line 2509-2518). Works without the SDK but cannot use `createClient` features. |
| Crash-on-boot risk | MEDIUM | Auto-boots only if `require.main === module` (line 2978) — safe. But `prestart` runs full `tsc` build; any type error blocks `start`. Bootstrap dynamically `require`s `./onyx-platform` at runtime (line 2990) — must exist on disk. |

### 4. payroll-autonomous (port 5174 in code, 5173 in CLAUDE.md)

| Check | Result | Evidence |
|---|---|---|
| `package.json` start/dev | PASS | `"start": "vite"`, `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"` (lines 9-12). Pure Vite SPA. |
| Entry file exists | PASS | `index.html` (Vite root) and `src/` directory present. |
| Port binding | WARNING | `vite.config.js` line 50: `port: 5174`. CLAUDE.md states 5173. **Minor discrepancy** — likely cosmetic. |
| `/health` route | NOT APPLICABLE | Frontend SPA — no backend, no health endpoint. Vite dev server has built-in `/` route that proves liveness. |
| Supabase client init | NONE | No supabase imports found in `src/`. SPA appears to call backend services directly. |
| Crash-on-boot risk | LOW | Dev server boots without env. PWA plugin and Tailwind v4 plugin require their toolchains; modern but stable. `base: '/payroll/'` requires reverse proxy in prod. |

### 5. AI-Task-Manager (workspace root + `artifacts/api-server`)

The repo root `package.json` is a **pnpm workspace orchestrator**, not a runnable service. Real server lives at `artifacts/api-server/`.

| Check | Result | Evidence |
|---|---|---|
| `package.json` start/dev | MIXED | Root has no `start`/`dev`; only `build`/`typecheck`. Workspace root enforces pnpm via `preinstall` hook that exits non-zero for npm/yarn. Sub-package `artifacts/api-server/package.json` has `"dev": "cross-env NODE_ENV=development tsx ./src/index.ts"` and `"start": "bash ./scripts/run-server.sh"`. |
| Entry file exists | PASS | `artifacts/api-server/src/index.ts` (337+ lines). `scripts/run-server.sh` exists. |
| Port binding | STRICT | Lines 24-36: **throws `Error` if `PORT` env not provided** — no default. Will hard-crash on boot in zero-env smoke. `app.listen(port, ...)` at line 336. |
| `/health` route | PASS | `routes/health.ts` exists with `router.get("/healthz", ...)` (line 39). `app.ts` registers `/healthz` (line 2017, 2378) and `/api/health`/`/api/healthz` (lines 2475, 2499). |
| Supabase client init | NONE | Uses `@workspace/db` (Drizzle ORM + `pg` Pool), not Supabase. Per design — this service runs against direct Postgres. |
| Crash-on-boot risk | HIGH | (a) Mandatory `PORT` env. (b) `start` runs a bash script — fails on Windows without WSL/Git-Bash. (c) `index.ts` calls `connectWithRetry`, `verifyDbConnectivity`, `runStartupMigrations`, `seedAdminUser`, `ensureProductionIndexes` — boot failure if DB unreachable (`process.exit(1)` at line 350). (d) Workspace deps (`@workspace/db`, `@workspace/api-zod`, etc.) require `pnpm install` from monorepo root before any run. |

---

## Health Routes Summary

| Service | `/health` | `/healthz` | `/livez` | `/readyz` | Notes |
|---|---|---|---|---|---|
| onyx-procurement | YES (alias for ai-bridge) | YES | YES | YES | Wrapped in exempt paths. |
| techno-kol-ops | `/api/health` (DB ping) | YES | YES | YES (DB timeout 2s) | Strongest probe coverage. |
| onyx-ai | YES (legacy alias of `/healthz`) | YES | YES | YES (Supabase ping w/ EventStore fallback) | Direct handler short-circuits class router. |
| payroll-autonomous | N/A | N/A | N/A | N/A | SPA, no backend. |
| AI-Task-Manager (api-server) | `/api/health` | YES + `/api/healthz` | (not located) | (not located) | Health router mounted under root and `/api`. |

---

## Critical Crash-on-Boot Risks

1. **AI-Task-Manager api-server: HIGH** — `PORT` is mandatory (no default); `start` is a bash script, hostile to Windows native shell; service exits if DB is unreachable on boot. Smoke without DB + env will fail at line 27 immediately.
2. **onyx-ai port collision: MEDIUM** — Code defaults `PORT` to `3200`, the same port techno-kol-ops uses. Both services on same host with default env will EADDRINUSE the second one. CLAUDE.md (port 3300) is authoritative; code default is wrong.
3. **techno-kol-ops production start: MEDIUM** — `npm start` requires pre-built `dist/`; not committed. Either build first, deploy from compiled artifact, or use `npm run dev`.
4. **onyx-procurement env validation: LOW** — Hard exit on missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` is intentional and correct. Smoke needs env set.
5. **payroll-autonomous port mismatch: COSMETIC** — Code says 5174, CLAUDE.md says 5173. No functional impact, just inconsistent docs.
6. **onyx-ai missing Supabase SDK: LOW** — Service references Supabase via raw fetch only; no `@supabase/supabase-js` in dependencies. Works for `/readyz` but blocks any future `createClient`-based code without an `npm install`.

---

## Recommendations

1. **Fix onyx-ai port default**: change `process.env.PORT || '3200'` to `'3300'` in `onyx-ai/src/index.ts` line 2979 to match CLAUDE.md and avoid collision with techno-kol-ops.
2. **Fix payroll port doc**: align `vite.config.js` `port: 5174` with CLAUDE.md `5173` (or update CLAUDE.md). Pick one.
3. **AI-Task-Manager api-server hardening**: provide a sensible `PORT` default (e.g., `3400`) instead of throwing — strict-only mode is a deployment-time concern, not a default-developer-experience concern. Also add a Node-based start script alongside `run-server.sh` for Windows.
4. **techno-kol-ops `start` script**: add `prestart: npm run build` to guarantee `dist/` exists, mirroring onyx-ai's pattern.
5. **Onyx-AI Supabase dep**: add `@supabase/supabase-js` to `dependencies` if any path uses `createClient`, or document that the service is fetch-only.
6. **Common smoke runner**: create a top-level `npm run smoke:all` that boots each service in dry-run mode (e.g., loads modules without `listen`) to catch parse/import errors statically.
7. **Workspace bootstrap doc**: AI-Task-Manager root `preinstall` script (lines 6) blocks npm/yarn outright — call this out in QUICKSTART.md so contributors don't silently fail.
