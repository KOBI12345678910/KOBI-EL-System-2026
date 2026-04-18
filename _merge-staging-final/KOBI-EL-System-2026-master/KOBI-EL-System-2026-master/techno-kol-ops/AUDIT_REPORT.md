# TECHNO-KOL OPS — Security & Hardening Audit Report

**Auditor:** Agent-21
**Date:** 2026-04-11
**Scope:** `techno-kol-ops/` root (server only; client/ excluded)
**Mode:** READ-ONLY audit + additive hardening (no existing files modified)

---

## 1. Environment Summary

| Item            | Value                                                   |
|-----------------|---------------------------------------------------------|
| Server entry    | `src/index.ts` (TypeScript, `tsx watch` in dev)         |
| Framework       | Express 4.18 + `http.createServer` (for WebSocket)      |
| Auth            | JWT (HS256) via `jsonwebtoken` + bcryptjs               |
| DB              | PostgreSQL (`pg` pool) — **not Supabase** directly here |
| Realtime        | `ws` WebSocket, Event Bus, Alert Engine, Autonomous     |
| Routes mounted  | 20+ under `/api/*`                                      |
| Existing MW     | `auth.ts` (authenticate, requireAdmin), `audit.ts`, `cache.ts` |
| .env.example    | Present — includes `ALLOWED_ORIGINS`, `JWT_SECRET`, `APP_URL` |

---

## 2. Findings — Severity Ranked

### CRITICAL (P0 — exploitable in production)

| # | Finding | File / Line | Severity |
|---|---------|-------------|----------|
| 1 | **Permissive CORS** — `cors({ origin: '*' })` in `src/index.ts:43`. The `.env.example` already defines `ALLOWED_ORIGINS`, but boot code ignores it. Any origin can hit the API with credentials. | `src/index.ts:43` | CRITICAL |
| 2 | **Default JWT secret leaked in `.env.example`** — `JWT_SECRET=techno_kol_secret_2026_palantir`. If a dev copies `.env.example` verbatim (common), tokens are forgeable. | `.env.example:18` | CRITICAL |
| 3 | **No env validation on boot** — `index.ts` uses `process.env.JWT_SECRET!` (non-null assertion) without checking at startup. If `JWT_SECRET` / `DATABASE_URL` are missing, server crashes on first request instead of failing fast. | `src/index.ts:38-44` | CRITICAL |
| 4 | **No rate limiting on `/api/auth/login`** — brute force / credential stuffing possible. Also no rate limit anywhere else. `middleware/audit.ts` defines a Map-based `rateLimiter` but it is **never mounted** in `index.ts`. | `src/index.ts`, `src/middleware/audit.ts:26` | CRITICAL |

### HIGH (P1 — security posture weakness)

| # | Finding | File / Line | Severity |
|---|---------|-------------|----------|
| 5 | **No `helmet()`** — missing X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, etc. No dependency installed (`package.json`). | `src/index.ts`, `package.json` | HIGH |
| 6 | **No global error handler** — thrown errors may leak stack traces. Each route wraps try/catch individually; any un-awaited promise kills the process. | `src/index.ts` | HIGH |
| 7 | **No graceful shutdown** — no `SIGTERM`/`SIGINT` handler. The PG pool, WebSocket server, alert engine and autonomous engine are never drained → in-flight requests and DB connections are dropped on restart. | `src/index.ts:128-132` | HIGH |
| 8 | **Unbounded JSON body** — `express.json()` with no `limit`. An attacker can send a 100MB JSON body and OOM the server. | `src/index.ts:44` | HIGH |
| 9 | **Dynamic `FROM ${schema.table}` in ontologyEngine** — table name is string-interpolated. Source is a local `ONTOLOGY_SCHEMA` map (safe today) but pattern is one refactor away from SQLi. Should whitelist. | `src/ontology/ontologyEngine.ts:152,167` | HIGH |
| 10 | **Audit log is opportunistic + silent-fail** — `audit.ts:20` swallows errors with `catch {}`. Also not wired into any mutating route, so there is effectively no audit trail today. | `src/middleware/audit.ts:20` | HIGH |

### MEDIUM (P2 — hygiene / ops risk)

| # | Finding | File / Line | Severity |
|---|---------|-------------|----------|
| 11 | Hardcoded `ALLOWED_ORIGINS` default in `.env.example` includes production-unsafe `http://localhost:*`. No prod example. | `.env.example:11` | MEDIUM |
| 12 | `/api/auth/login` has no lockout counter, no IP throttle, no CAPTCHA. | `src/index.ts:47-70` | MEDIUM |
| 13 | Health endpoint `/api/health` exists but no `/api/ready`/liveness split, and it's behind nothing (fine) but pool errors are swallowed. | `src/index.ts:107-114` | MEDIUM |
| 14 | `cors` is the only auth-unaware middleware; `requireAdmin` is defined but referenced in 0 routes (grep result). Admin-only routes are not enforced. | `src/middleware/auth.ts:23` | MEDIUM |
| 15 | `brainEngine.boot()` failures are logged but do not halt boot — zombie server if brain is a hard dependency. | `src/index.ts:123` | MEDIUM |
| 16 | WebSocket `initWebSocket(server)` uses `http://${req.headers.host}` (Host header trust) — host header injection possible for URL parsing. | `src/realtime/websocket.ts:17` | MEDIUM |

### LOW (P3 — code quality / defensive)

| # | Finding | File / Line | Severity |
|---|---------|-------------|----------|
| 17 | `dotenv.config()` is called in both `index.ts` and `db/connection.ts` — second call is a no-op but indicates load-order fragility. | `src/db/connection.ts:3` | LOW |
| 18 | No `eval()` / `child_process` / `execSync` usage detected (good). | — | LOW (PASS) |
| 19 | No SQL string-concat with `req.body` / `req.query` detected — all routes use parameterized `$1, $2` (good). | — | LOW (PASS) |
| 20 | `README.md` exists; no `SECURITY.md` or incident runbook. | — | LOW |

---

## 3. Summary — What's Good

- SQL: **all routes use parameterized queries** (`$1, $2`) — no string concat.
- `auth.ts` exists with clean JWT verification.
- Health endpoint exists and pings DB.
- No `eval`, no `child_process`.
- `.env.example` already has `ALLOWED_ORIGINS` — the wiring just doesn't use it.

## 4. What's Missing vs onyx-procurement

Comparing `techno-kol-ops/src/index.ts` to `onyx-procurement/server.js`:

- [ ] `helmet()` block                                          (onyx has it, techno-kol doesn't)
- [ ] `express.json({ limit: '...' })`                          (onyx: 2mb, techno-kol: unlimited)
- [ ] `cors({ origin: ALLOWED_ORIGINS })` from env              (onyx: env, techno-kol: `*`)
- [ ] `express-rate-limit` with `/api/` scope                   (onyx has it, techno-kol has Map-based but unmounted)
- [ ] `REQUIRED_ENV` validation with `process.exit(1)` on boot  (onyx has it)
- [ ] `PUBLIC_API_PATHS` allowlist for auth bypass              (onyx has it)
- [ ] `requireAuth` wired via `app.use('/api/', ...)`           (techno-kol wires it per-router)

## 5. Deliverables

New files added (see separate files):

- `AUDIT_REPORT.md` — this document
- `src/middleware/security.ts` — helmet/cors/rate-limit/body-limit/requireAuth middleware bundle
- `src/middleware/auditMiddleware.ts` — `audit()` Express helper + `withAudit()` wrapper
- `INSTRUCTIONS_TO_WIRE.md` — step-by-step guide to adopt the new middleware without breaking the running server

**No existing files were modified.** All hardening is additive and opt-in.
