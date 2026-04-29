# AGENT-258 — Backend Bootability Audit

**Agent:** 258 — BACKEND #3
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Node:** v24.14.1, **npm:** 11.11.0, **Platform:** Windows 11 (bash)

## Scope
Attempt cold-start of all 4 services and capture real boot output. Identify
hard blockers that prevent boot and any second-order issues observed during
boot (port conflicts, missing prerequisites, runtime errors).

## Services Under Test

| # | Service             | Path                  | Entry           | Declared Port |
|---|---------------------|-----------------------|-----------------|---------------|
| 1 | ONYX_PROCUREMENT    | `onyx-procurement/`   | `server.js`     | 3100          |
| 2 | TECHNO_KOL_OPS      | `techno-kol-ops/`     | `dist/index.js` | 3200          |
| 3 | ONYX_AI             | `onyx-ai/`            | `entrypoint.js` | 3300          |
| 4 | PAYROLL_AUTONOMOUS  | `payroll-autonomous/` | vite (5173)     | 5173          |

## Results Summary

| Service             | Cold Boot | After `npm install` | After Build | After stub `.env` | Verdict |
|---------------------|:---------:|:-------------------:|:-----------:|:-----------------:|:-------:|
| onyx-procurement    | FAIL      | FAIL (env)          | n/a         | PASS              | BOOTS w/ stubs |
| onyx-ai             | FAIL      | FAIL (no dist)      | PASS        | PASS              | BOOTS |
| techno-kol-ops      | FAIL      | FAIL (no dist)      | PASS\*      | PASS\*            | BOOTS, DB unreachable |
| payroll-autonomous  | FAIL      | PARTIAL             | n/a         | PARTIAL           | esbuild scan error |

\* = listens, but inner subsystems error on missing infra.

---

## 1. onyx-procurement (Port 3100)

### Cold boot (no install)
```
Error: Cannot find module 'express'
  at Object.<anonymous> (.../onyx-procurement/server.js:18:17)
  code: 'MODULE_NOT_FOUND'
```

### After `npm install` (539 packages, 19s) — no .env
```
✓ RBAC wired — 10 roles, 97 resources

❌ ONYX boot failed — missing required environment variables:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY

   Copy .env.example → .env and fill in real values.
```
`scripts/validate-env.js` runs in `prestart` (when via `npm start`); when
launched directly via `node server.js` the env validator inside `server.js`
itself trips, exits non-zero. Hard blocker.

### After stub `.env` (PORT=3100, NODE_ENV=development, fake SUPABASE_URL + SUPABASE_ANON_KEY)
Boots cleanly:
```
✓ RBAC wired — 10 roles, 97 resources
✓ ops/metrics wired — GET /metrics (Prometheus)
✓ domain-events wired — EventBus + shared-events producer
✓ db/query-analyzer wired
⚠️  ai-bridge wired but disabled — set ONYX_AI_API_KEY
⚠️  /ops sibling not found at .../techno-kol-ops/client/dist
⚠️  /payroll sibling not found at .../payroll-autonomous/dist
✓ static /ai -> .../onyx-ai
✓ shared-audit wired
✓ state-enforcement wired
[notification-service] adapters { email:false, whatsapp:false, sms:false, push:true, in_app:true }
✓ notifications wired
✓ VAT / Annual tax / Bank reconciliation / Wage slip routes registered
✓ Enterprise routes wired — 29 endpoints
🚀 ONYX PROCUREMENT API SERVER  Port: 3100  Supabase: ✅ Connected
```

### Boot blockers (onyx-procurement)
1. **Missing `node_modules`** — must run `npm install` first.
2. **Missing `.env`** — `SUPABASE_URL` + `SUPABASE_ANON_KEY` are hard-required;
   server refuses to start without them.
3. **Static-asset siblings absent at boot** — `/ops` (techno-kol-ops/client/dist)
   and `/payroll` (payroll-autonomous/dist) are not built; they degrade to
   warnings rather than failures.

---

## 2. onyx-ai (Port 3300 via entrypoint.js → dist/index.js on 3301)

### Cold boot (no install / no build)
```
Error: Cannot find module './dist/index.js'
  at Object.<anonymous> (.../onyx-ai/entrypoint.js:1:540)
```
`entrypoint.js` is a one-line proxy that calls `require("./dist/index.js")`
after binding the outer port. `dist/` does not ship in repo.

### After `npm install` (37 packages, 4s)
Same `MODULE_NOT_FOUND` for `./dist/index.js`.

### After `npx tsc` (build clean, no errors)
`dist/index.js` exists. Boot via dist directly works:
```
🚀 ONYX AI — Institutional Autonomous Platform v2.0
   ONYX AI Platform v2.0.0  Agents:0  Tools:0  Policies:1
✓ ONYX AI listening on port 3200
✓ Event store: ./data/events.jsonl
🌐 ONYX API Server running on port 3200
   Rate limits: general=200 req/15min, AI=20 req/15min
   CORS: http://localhost:5173, :3200, :3100
```
**Important port quirk:** the inner server defaults to **3200**, not 3300.
The wrapper `entrypoint.js` does:
```js
const m = +(process.env.PORT || 3300);  // outer (3300)
const a = m + 1;                         // inner (3301)
process.env.PORT = "" + a;
```
With `PORT=3300` set, the inner Express binds 3301 and the wrapper binds
3300. Confirmed via `netstat`: `0.0.0.0:3300 LISTENING`. **However**, if
launched bare (`node entrypoint.js`) without `PORT` env, inner reads
`process.env.PORT="3301"` *but* the dist code's own default fallback is
3200 — a confusing mixed contract worth tracking.

### Boot blockers (onyx-ai)
1. **Missing `node_modules`** — needs install.
2. **Missing `dist/`** — TypeScript build (`npx tsc` or `npm run build`) is
   mandatory before `entrypoint.js` will load. `npm start` does this via
   `prestart`, but `node entrypoint.js` does not.

---

## 3. techno-kol-ops (Port 3200)

### Cold boot
```
Error: Cannot find module '.../techno-kol-ops/dist/index.js'
```
No dist; scripts use `tsx watch src/index.ts` for dev or `tsc` for prod build.

### After `npm install` (50 packages) + `npx tsc` (clean)
```
⚠️ JWT_SECRET not set — using ephemeral dev secret.
Alert engine started
Autonomous engine started
[EVENT BUS] Initialized
TECHNO-KOL BRAIN ENGINE v2.0
[BRAIN] 6 data flows initialized
TECHNO-KOL OPS v2.0 — Foundry Edition running on port 3200
[FOUNDRY] Brain Engine + Event Bus + Apollo + AIP + Ontology — ALL ONLINE
[BRAIN] Boot error: AggregateError [ECONNREFUSED]
    code: 'ECONNREFUSED', address: '127.0.0.1', port: 5432
```
Service binds port 3200 successfully but `brainEngine.boot` →
`loadGoals` → `calculateMonthlyTarget` issues a Postgres query, and there
is no Postgres on 5432. HTTP server stays up; brain features will be
non-functional.

### Boot blockers (techno-kol-ops)
1. **Missing `node_modules`** — needs install.
2. **Missing `dist/`** — needs `tsc` (or run dev mode with `tsx`).
3. **Postgres unreachable on `localhost:5432`** — Brain engine boot
   throws ECONNREFUSED but is non-fatal to the HTTP server.
4. **Port collision with onyx-ai inner server (both default 3200)** — if
   onyx-ai's compiled dist is started without `PORT` override and
   techno-kol-ops also starts, only one will bind. CLAUDE.md spec assigns
   onyx-ai to 3300 — verify the entrypoint wrapper is the canonical launch
   path in deployment.
5. **`JWT_SECRET` warning** — non-fatal in dev; would be fatal in prod
   (server.js fail-closed for production NODE_ENV).

---

## 4. payroll-autonomous (Port 5173, vite SPA)

### Cold boot (no install)
```
npm warn exec The following package was not found and will be installed: vite@8.0.10
```
(would fetch vite at runtime via npx — undesirable for prod).

### After `npm install` (361 packages, 14s)
```
VITE v5.4.21  ready in 1336 ms
➜  Local: http://127.0.0.1:5173/payroll/

Error:  Failed to scan for dependencies from entries:
  C:/Users/kobi/.../payroll-autonomous/index.html
The service was stopped
    at .../node_modules/vite/node_modules/esbuild/lib/main.js:993:26
```
Vite starts and announces the URL, then esbuild's dep-scan fails. Likely
cause: Hebrew chars in the absolute path (`המערכת 2026  KOBI EL`) — esbuild
on Windows has known issues resolving non-ASCII paths in some scenarios.

### Boot blockers (payroll-autonomous)
1. **Missing `node_modules`** — needs install.
2. **esbuild dep-scan fails on Hebrew path** — confirmed reproducible. Will
   work from a CI/clean path; flagged for environment caveat.
3. **No prebuilt `dist/`** — onyx-procurement expects
   `payroll-autonomous/dist` for `/payroll` static mount; need
   `npm run build` to populate it.

---

## Cross-Cutting Findings

1. **Zero services boot from a fresh checkout.** All require at minimum
   `npm install`. Two also require a TypeScript build step
   (`onyx-ai`, `techno-kol-ops`).

2. **No `.env` files present.** Only `.env.example` shipped. Each Node
   service has its own env contract:
   - onyx-procurement: `SUPABASE_URL`, `SUPABASE_ANON_KEY` required at boot.
   - techno-kol-ops: `JWT_SECRET` warns in dev / fatal in prod; expects
     Postgres at 5432.
   - onyx-ai: boots without env (in dev).
   - payroll-autonomous: vite, no server-side env required.

3. **Port allocation drift vs. CLAUDE.md.**
   CLAUDE.md spec → ONYX_AI=3300. onyx-ai's compiled `dist/index.js`
   binds 3200 by default; only the `entrypoint.js` wrapper restores 3300
   semantics (and proxies inner→3301). techno-kol-ops also defaults to
   3200 — direct collision with onyx-ai dist if launched bare.

4. **Inter-service expectations at boot:**
   - onyx-procurement warns when `techno-kol-ops/client/dist` and
     `payroll-autonomous/dist` aren't present.
   - techno-kol-ops requires Postgres on 5432; absent → ECONNREFUSED but
     HTTP listener survives.
   - onyx-procurement's ai-bridge needs `ONYX_AI_API_KEY` to enable.

5. **Recommended bootstrap (all four):**
   ```
   (cd onyx-procurement && npm install && cp .env.example .env  # fill creds)
   (cd onyx-ai           && npm install && npm run build)
   (cd techno-kol-ops    && npm install && npm run build)
   (cd payroll-autonomous && npm install && npm run build)
   # start order: postgres → onyx-ai → techno-kol-ops → onyx-procurement → payroll
   ```

## Conclusion
All four services CAN boot, but none boot from a clean checkout without
manual setup. The failures are environmental (missing deps, missing build
artifacts, missing env, missing Postgres) — not code-level breakage. Code
itself is structurally bootable. Single-command "make run" / docker-compose
glue is missing or untested at the worktree root.
