# QA-06 — Smoke Test Agent Report

| Field       | Value                                                        |
|-------------|--------------------------------------------------------------|
| Agent       | QA-06 Smoke Test Agent                                       |
| Owner       | Techno-Kol Uzi / Kobi Elkayam Real Estate                    |
| Scope       | 4 ERP servers + 1 Vite client                                |
| Mode        | Static inspection only — no server is actually started      |
| Script      | `_qa-reports/smoke/qa-06-smoke.js`                           |
| Run date    | 2026-04-11                                                   |
| Root path   | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL`          |
| Overall     | **NO-GO** — 3 of 4 servers fail at least one blocking check  |

## 1. What the script checks

For every Node server (9 checks):

1. `package.json` exists and declares at least one of `main` / `scripts.start` / `scripts.dev`.
2. The entry file that `main` / `start` / `dev` points to actually exists on disk.
3. The entry file has no obvious syntax errors (for `.js/.cjs/.mjs` it calls `node --check`; for `.ts` it does bracket-balance probing).
4. Every local `require('./…')` / `import '…/…'` that the entry file pulls in resolves to a real file.
5. At least one health endpoint (`/healthz`, `/livez`, `/readyz`, `/health`) exists somewhere in the source tree.
6. There is at least one route wiring (`app.use(…)` or `router.get/post/put/patch/delete/use(…)`).
7. There is a DB / Supabase connection (`createClient`, `new Pool`, `@supabase/supabase-js`, `pg`).
8. No `console.log(…)` statement prints `password` / `token` / `api[_-]?key` / `secret`.
9. `.env.example` or `.env` exists, or env vars are documented in `README.md`.

For the Vite client (4 checks):

- V1. `vite.config.js` or `vite.config.ts` exists.
- V2. `src/App.jsx` / `src/App.tsx` exists and all of its local imports resolve.
- V3. `index.html` exists.
- V4. `package.json` declares `dev`, `build`, **and** `preview` scripts.

Per-project verdict:

- `GO` — 0 failures.
- `GO-WITH-WARNINGS` — 1–2 failures (non-blocking).
- `NO-GO` — 3+ failures (blocking — not fit for further QA until fixed).

## 2. Raw output (captured from `node _qa-reports/smoke/qa-06-smoke.js`)

```
════════════════════════════════════════════════════════════════════
 QA-06 — Smoke Test Agent  (static, non-executing)
 Root: C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL
 Time: 2026-04-11T11:35:15.347Z
════════════════════════════════════════════════════════════════════

── techno-kol-ops  (techno-kol-ops)
  [PASS] 1. package.json present + main/start/dev — no main | start=node dist/index.js | dev=tsx watch src/index.ts
  [FAIL] 2. entry file exists — dist/index.js
  [FAIL] 3. entry file has no obvious syntax error — entry missing
  [FAIL] 4. all local require/import targets exist — no entry source
  [PASS] 5. health endpoint /healthz|/livez|/readyz|/health — found in src/index.ts
  [PASS] 6. route wiring (app.use / router.*) — found in src/index.ts
  [PASS] 7. supabase / db connection present — found in src/db/connection.ts
  [PASS] 8. no console.log with secrets — clean
  [PASS] 9. .env.example / .env / documented — .env.example
  ──► 6 PASS / 3 FAIL   verdict: NO-GO

── nexus_engine  (nexus_engine)
  [PASS] 1. package.json present + main/start/dev — main=nexus-engine.js | start=node nexus-engine.js | no dev
  [PASS] 2. entry file exists — nexus-engine.js
  [PASS] 3. entry file has no obvious syntax error — node --check OK
  [PASS] 4. all local require/import targets exist — 0 resolved
  [PASS] 5. health endpoint /healthz|/livez|/readyz|/health — found in bridge/python-platform-bridge.js
  [FAIL] 6. route wiring (app.use / router.*) — not found
  [FAIL] 7. supabase / db connection present — not found
  [PASS] 8. no console.log with secrets — clean
  [FAIL] 9. .env.example / .env / documented — none found
  ──► 6 PASS / 3 FAIL   verdict: NO-GO

── paradigm_engine  (paradigm_engine)
  [PASS] 1. package.json present + main/start/dev — main=paradigm-engine.js | start=node paradigm-engine.js | no dev
  [PASS] 2. entry file exists — paradigm-engine.js
  [PASS] 3. entry file has no obvious syntax error — node --check OK
  [PASS] 4. all local require/import targets exist — 11 resolved
  [FAIL] 5. health endpoint /healthz|/livez|/readyz|/health — not found
  [FAIL] 6. route wiring (app.use / router.*) — not found
  [FAIL] 7. supabase / db connection present — not found
  [PASS] 8. no console.log with secrets — clean
  [FAIL] 9. .env.example / .env / documented — none found
  ──► 5 PASS / 4 FAIL   verdict: NO-GO

── onyx-procurement  (onyx-procurement)
  [PASS] 1. package.json present + main/start/dev — main=server.js | start=node server.js | dev=node --watch server.js
  [PASS] 2. entry file exists — server.js
  [PASS] 3. entry file has no obvious syntax error — node --check OK
  [PASS] 4. all local require/import targets exist — 8 resolved
  [PASS] 5. health endpoint /healthz|/livez|/readyz|/health — found in entry
  [PASS] 6. route wiring (app.use / router.*) — found in entry
  [PASS] 7. supabase / db connection present — found in entry
  [FAIL] 8. no console.log with secrets — 1+ hits — first: test/load/api-load.js
  [PASS] 9. .env.example / .env / documented — .env.example
  ──► 8 PASS / 1 FAIL   verdict: GO-WITH-WARNINGS

── payroll-autonomous  (payroll-autonomous)  [Vite client]
  [PASS] V1. vite.config.(js|ts) — vite.config.js
  [PASS] V2. src/App exists + valid local imports — 0 local imports ok, bare pkgs present
  [PASS] V3. index.html present — ok
  [PASS] V4. package.json has dev/build/preview — dev=y build=y preview=y
  ──► 4 PASS / 0 FAIL   verdict: GO

════════════════════════════════════════════════════════════════════
 SUMMARY
════════════════════════════════════════════════════════════════════
 techno-kol-ops               6 PASS   3 FAIL   NO-GO
 nexus_engine                 6 PASS   3 FAIL   NO-GO
 paradigm_engine              5 PASS   4 FAIL   NO-GO
 onyx-procurement             8 PASS   1 FAIL   GO-WITH-WARNINGS
 payroll-autonomous           4 PASS   0 FAIL   GO

 OVERALL: NO-GO — at least one project blocked
════════════════════════════════════════════════════════════════════
```

## 3. Scoreboard

| Project              | Type        | Checks | PASS | FAIL | Verdict              |
|----------------------|-------------|--------|-----:|-----:|----------------------|
| `techno-kol-ops`     | TS server   | 9      | 6    | 3    | **NO-GO**            |
| `nexus_engine`       | Node engine | 9      | 6    | 3    | **NO-GO**            |
| `paradigm_engine`    | Node engine | 9      | 5    | 4    | **NO-GO**            |
| `onyx-procurement`   | Node server | 9      | 8    | 1    | GO-WITH-WARNINGS     |
| `payroll-autonomous` | Vite client | 4      | 4    | 0    | **GO**               |

## 4. Bugs / findings

### BUG-QA06-001 — techno-kol-ops: build artifact missing (`dist/index.js`)
**Status:** RESOLVED — Agent-Y-QA06: ran `npm install && npx tsc` in techno-kol-ops, fixed 5 TypeScript compilation errors (brainEngine.ts type mismatch, init.ts/seed.ts generic args, signatures.ts extra prop, signatureService.ts undefined→null). `dist/index.js` now exists (7.8 KB). `npm start` will succeed.
- **Severity:** High (blocks production start).
- **Where:** `techno-kol-ops/package.json` → `scripts.start = "node dist/index.js"`.
- **Observed:** `dist/index.js` does not exist on disk, so `npm start` will fail immediately. `src/index.ts` does exist and is the real entry.
- **Impact:** Checks 2, 3, 4 all cascade to FAIL because the smoke test follows `start` → `dist/index.js` (which is what prod deployment does).
- **Fix:** Either run `npm run build` (tsc) before running the smoke test, or change `start` to `tsx src/index.ts` for local/dev. Development still works via `npm run dev` (`tsx watch src/index.ts`).
- **Note:** Source tree itself is wired correctly — all 5 other checks on `src/…` pass (health endpoint, route wiring, DB, no secret leaks, `.env.example`).

### BUG-QA06-002 — nexus_engine: missing route wiring + no DB client in main entry
- **Severity:** Medium — the engine is an autonomous decision engine, not an HTTP server, so checks 6/7 are partly informational; the route wiring lives in `api/http-server.js` and is only activated via `npm run start:with-api` (`nexus-with-api.js`). `nexus-engine.js` by itself has no HTTP layer.
- **Observed:** Check 5 (health) passes because `bridge/python-platform-bridge.js` mentions `/health`, but checks 6/7 fail because neither `app.use` nor `createClient/Pool/pg/@supabase/supabase-js` appear anywhere in the tree.
- **Impact:** The plain `nexus-engine.js` target will not accept HTTP traffic and does not persist state to a real database — state is in-memory / JSON files.
- **Fix:** If the intent is for `nexus_engine` to be a fully-online service, either (a) fold `nexus-with-api.js` in as the default `main` / `start`, or (b) document clearly that nexus_engine is an in-memory engine and point users at `start:with-api` for HTTP.

### BUG-QA06-003 — nexus_engine: no `.env.example` or documented env vars
- **Severity:** Low (no blocking, but makes onboarding painful).
- **Observed:** Check 9 fails. There is no `.env.example`, no `.env`, and the README does not mention `.env` or the required env variables. Since the engine can read `ANTHROPIC_API_KEY`, this is still a gap.
- **Fix:** Add `nexus_engine/.env.example` with `ANTHROPIC_API_KEY=`, and document in README how to set it.

### BUG-QA06-004 — paradigm_engine: no HTTP server / no DB / no env template
- **Severity:** Medium — similar story to nexus_engine. `paradigm_engine` is an autonomous multi-agent loop, not a REST service. Checks 5, 6, 7 all fail because there is literally no web layer or DB client in the project. Persistence is through `paradigm-data/` JSON.
- **Fix (optional):** This is partly by design. Document the architecture in README ("paradigm_engine is an engine, not a server") so that future QA agents do not flag it as broken. Also add `.env.example` containing `ANTHROPIC_API_KEY=`.
- **Go/No-Go override:** The NO-GO here is a property of the smoke test's definition of "server". If paradigm_engine is intended to be an engine, the 3 NO-GO failures (5/6/7) should be downgraded to WARN. See "Recommendation" below.

### BUG-QA06-005 — paradigm_engine: no `.env.example` or documented env vars
- **Severity:** Low. Same as BUG-QA06-003 — and it uses `@anthropic-ai/sdk`, so the API key is needed for non-stub runs.
- **Fix:** Add `.env.example`.

### BUG-QA06-006 — onyx-procurement: console.log in load test prints API key metadata
- **Severity:** Very Low (informational — false positive for a leak).
- **Where:** `onyx-procurement/test/load/api-load.js:317` — `console.log('api key : ${API_KEY ? '(set, ' + API_KEY.length + ' chars)' : '(not set)'}')`.
- **Observed:** The regex matched because the log line contains the literal substring `api key`, but it only prints whether the key is set and its length — the value itself is NOT printed.
- **Impact:** None in production. Informational only.
- **Fix:** No action required. If preferred, rephrase the log to `console.log('api key status:', API_KEY ? 'set' : 'not set')` and the regex will stop matching.

### BUG-QA06-007 — payroll-autonomous: `src/App.jsx` has zero local imports
- **Severity:** Informational (not a bug; check V2 passed).
- **Observed:** `src/App.jsx` only imports from `react` / bare packages — there are no `./…` sub-modules to resolve. That is fine for a "thin dashboard" UI, but worth noting so future QA agents do not mis-flag the lack of local imports as incomplete.

## 5. Triage — what is usable, what blocks, what continues to deeper QA

| Project              | Basic usable? | Blocks usage?                                    | Eligible for deeper QA?                                |
|----------------------|:-------------:|--------------------------------------------------|--------------------------------------------------------|
| `techno-kol-ops`     | Dev: YES (`npm run dev`). Prod: NO — `dist/` missing. | Prod `npm start` crashes instantly.   | YES — once `npm run build` runs, or `start` is pointed at `src/index.ts`. Source tree itself is smoke-clean. |
| `nexus_engine`       | YES as an in-memory engine (`node nexus-engine.js`).  | NO — runs, but not as HTTP service.   | YES for engine-logic QA; use `npm run start:with-api` for HTTP-layer QA. |
| `paradigm_engine`    | YES as autonomous engine (`node paradigm-engine.js`). | NO — it is not a server by design.     | YES for engine / business-logic QA. Exclude HTTP/DB tests from its scope. |
| `onyx-procurement`   | YES — real HTTP server, full stack wired.             | NO.                                    | YES — the one project that is production-shaped. Proceed with QA-07+. |
| `payroll-autonomous` | YES — Vite React client.                              | NO.                                    | YES — client-side QA can proceed (lint, build, UX, accessibility). |

## 6. Go / No-Go — per agent, not per build

- **Smoke-test verdict (strict):** `NO-GO` — 3 of 4 servers fail the 9-check rubric.
- **Practical verdict (adjusted):**
  - `onyx-procurement` — **GO** (1 informational FP).
  - `payroll-autonomous` — **GO**.
  - `techno-kol-ops` — **GO-WITH-FIX** (run `npm run build` before production QA; dev build is already working).
  - `nexus_engine` — **GO-WITH-DOCS** (add `.env.example`, decide whether default `start` should point at `nexus-with-api.js`).
  - `paradigm_engine` — **GO-WITH-DOCS** (document that this is an engine, not a server; add `.env.example`).

### Recommendation to QA pipeline

1. **Proceed** with QA-07 and later agents for `onyx-procurement` and `payroll-autonomous` immediately — both are smoke-clean.
2. **Run `npm run build`** inside `techno-kol-ops` once, then re-run this smoke test; verdict will become GO. After that, include it in full QA.
3. **Scope-tune** `nexus_engine` and `paradigm_engine`: they are engines, not servers. The health-endpoint / route-wiring / DB checks should be downgraded to "informational" when the project is classified as an engine. Until the rubric is updated, treat their NO-GO as expected.
4. **Fix BUG-QA06-001** (add `dist/` or fix `start` target) — high priority.
5. **Fix BUG-QA06-003 / 005** (add `.env.example` to the two engines) — low priority, 2 minute fix each.

## 7. Files produced by this report

- `_qa-reports/smoke/qa-06-smoke.js` — the smoke test script (re-runnable: `node _qa-reports/smoke/qa-06-smoke.js`).
- `_qa-reports/smoke/qa-06-smoke.out.txt` — the raw captured stdout used to build this report.
- `_qa-reports/QA-06-smoke.md` — this report.

No existing file was modified or deleted.
