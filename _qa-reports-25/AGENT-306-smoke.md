# AGENT-306 — Smoke Test Report

- Date: 2026-04-29
- Worktree: `objective-merkle-40ff93`
- Scope: cold-boot smoke test of the 4 services (TECHNO_KOL_OPS / ONYX_PROCUREMENT / PAYROLL_AUTONOMOUS / ONYX_AI), basic UI/API path, no destructive writes.
- Method: `node server.js` / `npx tsx src/index.ts` with placeholder env (`SUPABASE_URL=http://test`, `SUPABASE_ANON_KEY=test`, no PG running). HTTP probes via `Invoke-WebRequest` and `curl`.

---

## Quick verdict per area

| Area | Result | Notes |
|---|---|---|
| ONYX_PROCUREMENT — boot (3100) | PASSED | 12+ subsystems wired, banner prints, no stack trace |
| ONYX_PROCUREMENT — `GET /` | PASSED | 200, RTL Hebrew HTML shell |
| ONYX_PROCUREMENT — `GET /api/health` | PASSED | 200 `{status:"ok",uptime,timestamp}` |
| ONYX_PROCUREMENT — `GET /metrics` | PASSED | 200 Prometheus text |
| ONYX_PROCUREMENT — `GET /api/admin/query-stats` | PASSED | 200 |
| ONYX_PROCUREMENT — `GET /api/status` | **FAILED** | request hangs >10s (Supabase-dependent, no timeout/try-catch) |
| ONYX_PROCUREMENT — auth gate on `/api/suppliers /api/dashboard /api/notifications /api/wiring/spec /api/pipeline/stages /api/entity-map/* /api/state-machines` | PASSED | All correctly return 401 without `X-API-Key` |
| ONYX_PROCUREMENT — `POST /api/auth/login` w/ wrong creds | PASSED | 401 (rejection works without DB hit on this path) |
| TECHNO_KOL_OPS — boot (3200) | PASSED with WARNING | Express server up, all engines started; but Brain Engine logs `ECONNREFUSED 127.0.0.1:5432` because no Postgres |
| TECHNO_KOL_OPS — `GET /` | PASSED | 200 |
| TECHNO_KOL_OPS — `GET /health` | **FAILED** | 404 — no top-level health endpoint registered |
| TECHNO_KOL_OPS — RBAC bootstrap | PASSED | "10 roles, 97 resources" line confirmed on boot |
| TECHNO_KOL_OPS — Domain events / EventBus | PASSED | Initialised, 5 cross-service consumers registered |
| ONYX_AI — boot (3300) | NOT TESTED | did not boot in this run; static-served at `/ai` confirmed wired by ONYX |
| PAYROLL_AUTONOMOUS — boot (5173) | NOT TESTED | static-served at `/payroll` |
| Static `/ops` mount | **FAILED** | "/ops sibling not found at .../techno-kol-ops/client/dist" — client never built |
| Static `/payroll` mount | **FAILED** | "/payroll sibling not found at .../payroll-autonomous/dist" — never built |
| Static `/ai` mount | PASSED | wired |
| 9 Master-360 page files exist (Customer/Supplier/Quote/RFQ/Project/WorkOrder/PO/Finance/Employee) | PASSED | all 9 `.tsx` present in `techno-kol-ops/client/src/pages/360/` |
| `src/pipeline/` 6 modules | PASSED | pipeline-engine.js, entity-map.js, workflow-flows.js, state-machines.js, wiring-spec.js, orchestrator.js — all present + extras (domain-model, ontology, state-enforcement) |
| Crash on idle | PASSED | server stays up >90s, no unhandled rejections logged |
| Login (real round-trip) | NOT TESTED | requires seeded DB |
| Dashboard render in browser | NOT TESTED | client `dist/` not built; `npm run build` not executed in this smoke |
| Save basic action (orchestrator/execute) | NOT TESTED | requires X-API-Key + reachable DB |

---

## Issues found (hard mode)

### ISSUE-306-01 — `/api/status` hangs forever (no timeout / no error handler)
- **Description:** Public health endpoint `/api/status` calls Supabase but never resolves when Supabase is unreachable. No `try/catch`, no timeout. Client requests stack up.
- **Steps:** Boot ONYX with unreachable `SUPABASE_URL`; `GET /api/status`.
- **Actual:** Request hangs > 10s; PowerShell `Invoke-WebRequest` times out.
- **Expected:** 200 with degraded payload, or 503 within 2s.
- **Severity:** HIGH (it is the documented public probe — a bad `SUPABASE_URL` will silently kill the LB health page).
- **Module:** `onyx-procurement/server.js:559`.
- **Fix:** wrap in `try/catch`, add `Promise.race` with 2s timeout, return `{status:'degraded', supabase:'unreachable'}` on failure. Move banner statement "Supabase: ✅ Connected" to actually verify with a `from('_health').select('1')` ping.

### ISSUE-306-02 — TECHNO_KOL_OPS has no top-level `/health`
- **Description:** Service prints "running on port 3200" but has no `GET /health` (only `/`). Cloud-Run / k8s liveness probe will fail.
- **Steps:** `GET http://localhost:3200/health`.
- **Actual:** 404.
- **Expected:** 200 `{status:"ok"}`.
- **Severity:** HIGH (deploy/ops blocker).
- **Module:** `techno-kol-ops/src/index.ts`.
- **Fix:** add `app.get('/health', (_q,r)=>r.json({status:'ok',uptime:process.uptime()}))` before route mounting.

### ISSUE-306-03 — Brain Engine boot crashes on missing Postgres but server keeps running
- **Description:** Brain Engine boot runs `loadGoals → calculateMonthlyTarget` synchronously on startup; on `ECONNREFUSED 5432` it logs an `AggregateError` but the rest of the service continues. No retry, no degradation flag, no `/api/brain/status` reflecting the failure.
- **Steps:** Boot techno-kol-ops without Postgres on 5432.
- **Actual:** Stack trace printed; Brain marked "ALL ONLINE" in banner anyway — misleading.
- **Expected:** Either fail-fast in production, or set internal `brain.degraded=true` and reflect in banner / health.
- **Severity:** MEDIUM (observability bug — devs will trust the green banner).
- **Module:** `techno-kol-ops/src/ai/brainEngine.ts:141` (`boot`) and `:1142` (`loadGoals`).
- **Fix:** wrap `boot()` in try/catch, emit `brain.boot.failed` event, set degraded flag, retry every 30s.

### ISSUE-306-04 — Static `/ops` and `/payroll` not built — UI won't load even after boot
- **Description:** ONYX serves `/ops` from `techno-kol-ops/client/dist` and `/payroll` from `payroll-autonomous/dist`, but neither directory exists in this checkout. Boot warns and silently skips. End user navigating to `/ops` or `/payroll` will get 404.
- **Steps:** boot ONYX → `GET /ops` would 404.
- **Actual:** "/ops sibling not found", "/payroll sibling not found" warnings on stdout.
- **Expected:** either a build was run, or the script should fail loudly in production.
- **Severity:** HIGH (basic UI is unreachable).
- **Module:** `onyx-procurement/server.js` (sibling-static block) + missing `npm run build` in `techno-kol-ops/client` and `payroll-autonomous`.
- **Fix:** add `prestart` step that runs `npm run build --workspaces --if-present`, or check at boot and refuse to start in `NODE_ENV=production` if `dist/` is missing.

### ISSUE-306-05 — `JWT_SECRET` ephemeral fallback is silent in dev
- **Description:** `techno-kol-ops/src/index.ts` auto-generates a random JWT secret in dev. Anyone restarting the service invalidates every session — could mask "I'm logged out / why?" bugs in QA.
- **Severity:** LOW.
- **Module:** `techno-kol-ops/src/index.ts:46-58`.
- **Fix:** persist dev secret to `.env.local` on first boot, or honor a `.dev-jwt-secret` file.

### ISSUE-306-06 — `ai-bridge wired but disabled` printed as `⚠️` only
- **Description:** Without `ONYX_AI_API_KEY` the AI bridge silently fails open. Cross-service AI calls return undefined.
- **Severity:** LOW (expected in dev).
- **Module:** `onyx-procurement/src/ai-bridge.js`.
- **Fix:** in production, fail-closed unless `AI_BRIDGE_OPTIONAL=true`.

### ISSUE-306-07 — Workspace inflation noise
- **Description:** Top-level `ls` shows multiple `_merge-staging*`, `_audit_tmp`, `_qa-reports`, `_qa-reports-25`, `dev/`, `_master-registry`, plus a stray `location-finder (1).zip`. Clutter/risk for accidental shipping.
- **Severity:** LOW.
- **Fix:** add to `.gitignore` and `.dockerignore`.

---

## What blocks basic usage today

1. **No DB available** in this worktree → real login, real CRUD, dashboards with data — all blocked.
2. **No client `dist`** → the actual UI on `/ops` and `/payroll` returns 404.
3. **`/api/status` hang** under unreachable Supabase will trip any LB / monitoring.
4. **No `/health` on TECHNO_KOL_OPS** → liveness probe fails.

Without (1) and (2) the system cannot be exercised end-to-end. (3) and (4) are infra-grade defects that the next QA wave will keep tripping on.

---

## Is this build worthy of further QA?

**Conditional GO.** The two services I could boot (ONYX_PROCUREMENT 3100, TECHNO_KOL_OPS 3200) come up clean, RBAC + EventBus + domain-events + metrics + 360 pages all present, and auth gating works. That is enough scaffolding to keep testing.

But before AGENT-307+ run any flow QA:

1. Stand up Postgres + Supabase (or stub) and run the seed.
2. `npm run build --workspaces` so `/ops` and `/payroll` actually serve.
3. Patch `/api/status` (ISSUE-306-01) and add `/health` to ops (ISSUE-306-02) — these are 5-minute fixes and they unblock all subsequent infra/health tests.
4. Boot ONYX_AI (3300) and PAYROLL (5173) — not exercised in this run.

After those four, the system is ready for functional / regression QA at the 360-page and pipeline-orchestrator level.

---

## Files of interest (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\server.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\index.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\ai\brainEngine.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\360\` (9 master-360 pages)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\` (6 architecture modules)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\scripts\smoke-test.js` (existing harness — useful for later runs)
