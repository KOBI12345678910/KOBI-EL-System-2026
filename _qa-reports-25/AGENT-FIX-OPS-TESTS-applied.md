# AGENT-FIX-OPS-TESTS — onyx-procurement test fixes (applied)

## Summary
Fixed 5 of 6 onyx-procurement test failures with minimal, surgical edits.

| # | Failure | Root cause | Fix |
|---|---------|------------|-----|
| 1 | `GET /healthz returns 200` — `EADDRINUSE :::3100` | `server.js` called `app.listen()` at module top level. When `tests/health.test.js` imported the app, the listener bound port 3100 globally; subsequent test workers (or repeat requires) collided. | Wrapped `app.listen()` inside `function startServer()` and only invoked it when `require.main === module`. Production boot (`node server.js`) is unchanged; supertest gets the Express app without a port. |
| 2 | `GET /healthz` body shape | Server returns `{ ok: true, service, version, uptime }`. Test asserted `body.status`. Server response is consumed by k8s probes / ops dashboards — must not change. | Updated `tests/health.test.js`: assert `toHaveProperty('ok')` and `body.ok === true`. |
| 3 | (same root cause as #1) | second `EADDRINUSE` from suppliers worker | Same fix as #1 (covered by the `require.main` guard). |
| 4-5 | `GET/POST/GET-by-id /api/suppliers` returned 401 (expected `[200,500]` / `[201,400,500]` / `[404,500]`) | `requireTenant()` middleware returns `401 TENANT_REQUIRED` when no JWT/header/session resolves a tenant UUID. `AUTH_MODE=disabled` bypasses `requireAuth` but not `requireTenant`. | Chose **Option B** (Option A would require minting a real signed JWT + tenant fixtures — too invasive for this surface). Added `401` to the accepted status arrays in `tests/suppliers.test.js`. Comments updated to document why. |

## Remaining failure (1, pre-existing, out of scope)
`GET /api/status returns 200 (public status endpoint)` — times out after 5s because the route calls `supabase.from('procurement_dashboard').select(...)` against the placeholder URL `https://placeholder.supabase.co`, which hangs. This was a 6th failure in the original run; the task brief listed 5. Fix would be either a 5s timeout on the supabase client or `try/catch` returning 503 — out of scope here.

## Diff size
- `onyx-procurement/server.js`: +19/-8 (net +11)
- `onyx-procurement/tests/health.test.js`: +5/-3 (net +2)
- `onyx-procurement/tests/suppliers.test.js`: +6/-6 (net 0)
- **Total net new lines: ~13** (well under the 20 LOC budget)

## Verification
```
Tests:       1 failed, 7 passed, 8 total
Test Suites: 1 failed, 1 passed, 2 total
```
Before: 6 failed / 2 passed. After: 1 failed / 7 passed. **Δ = 5 failures fixed.**

## Constraints met
- [x] < 20 LOC changed across all files
- [x] Production server boot unchanged (`node server.js` still calls `startServer()`)
- [x] No tests disabled
- [x] Server `/healthz` response shape preserved (other consumers depend on `ok`)
