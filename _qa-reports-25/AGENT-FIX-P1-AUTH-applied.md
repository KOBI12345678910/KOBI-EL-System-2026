# P1 SECURITY: Auth Middleware Applied

**Date:** 2026-04-29  
**Branch:** `claude/objective-merkle-40ff93`

## Scope
Add session-validating auth middleware to 5 unprotected `api-server` route files
and 3 public `techno-kol-ops` endpoints.

## Findings & Actions

### `api-server/src/routes/`
| File | Status before | Action |
|---|---|---|
| `agent-orchestration.ts` | already had inline `requireAuth` (line 8 + `router.use` line 18) | none — preserved |
| `agent-performance.ts` | imported `requireAuthMw` from `../lib/require-auth-mw` (broken: helper missing) | helper created (see below); import now resolves |
| `ai-agents-system.ts` | inline `requireAuth` + `router.use` | refactored to shared `requireAuthMw` (-9 LOC) |
| `warehouses.ts` | inline `requireAuth` + `router.use` | refactored to shared `requireAuthMw` (-9 LOC) |
| `suppliers.ts` | inline `requireAuth` + `router.use` | refactored to shared `requireAuthMw` (-9 LOC) |

**Helper created:** `api-server/src/lib/require-auth-mw.ts` (16 LOC).  
Mirrors the codebase's existing inline pattern: extracts Bearer token from
`Authorization` header or `?token=` query param, calls
`validateSession()` from `lib/auth`, returns `401` on failure, attaches
`req.user` and continues. Used by the 4 routes above.

### `techno-kol-ops/src/index.ts`
HEAD already had `, authenticate` inline on all 3 endpoints flagged in the
QA list (verified via `git show HEAD:`):
- Line 133 `GET /api/ontology/snapshot` — `authenticate` present
- Line 238 `GET /api/bridges/procurement/purchase-orders` — `authenticate` present
- Line 254 `GET /api/bridges/ai/insights` — `authenticate` present

My idempotent re-edits were no-ops on these 3 lines. `authenticate` is
imported from `./middleware/auth.ts` (JWT verify, HS256, 401 on failure).
`/api/bridges/health` left public (intentional — health probe).

## Verification

### Typecheck
```
cd api-server && npx tsc --noEmit -p tsconfig.json 2>&1 \
  | grep -E "(agent-performance|ai-agents-system|warehouses|suppliers|agent-orchestration|require-auth-mw)"
# (no output — zero new errors in changed files)

cd techno-kol-ops && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "index.ts"
# (no output — zero new errors)
```
Pre-existing tsconfig path errors (`lib/db` etc. missing in worktree) are
unrelated baseline noise — not introduced by this fix.

### No-regression check
- `agent-orchestration.ts` untouched; `git diff` confirms no changes.
- Public health endpoints (`/healthz`, `/livez`, `/readyz`,
  `/api/bridges/health`) remain unauthenticated.
- Role gate `requireAdmin` on `/api/admin` (techno-kol-ops line 130)
  preserved.

## LOC Summary
- New file `require-auth-mw.ts`: +16 LOC
- 3 routes refactored: net -27 LOC (consolidated boilerplate)
- techno-kol-ops/index.ts: 0 net (HEAD already had it)
- **Net delta: -11 LOC** (well under the 30-LOC budget)

## Files modified
- `api-server/src/lib/require-auth-mw.ts` (new)
- `api-server/src/routes/ai-agents-system.ts`
- `api-server/src/routes/suppliers.ts`
- `api-server/src/routes/warehouses.ts`
