# TECHNO-KOL OPS — Authentication Audit

- **Auditor:** Agent-25
- **Date:** 2026-04-11
- **Scope:** `techno-kol-ops/` backend + related client usage
- **Mega ERP context:** Must align with `onyx-procurement` and `onyx-ai` for a single SSO / JWT story.

---

## 1. Current Auth Story (as-is)

| Area | Finding |
|---|---|
| Strategy | Hand-rolled JWT (HS256) via `jsonwebtoken@9.0.2`. No Supabase Auth, no Passport, no sessions. |
| Login endpoint | `POST /api/auth/login` inlined in `src/index.ts` (lines 47-70). |
| Middleware | `src/middleware/auth.ts` — `authenticate()` + `requireAdmin()`. |
| Token transport | `Authorization: Bearer <jwt>` for HTTP; `?token=` query-string for WebSocket (`src/realtime/websocket.ts`). |
| Password hashing | `bcryptjs@2.4.3`, cost factor **10** (inferred from seed hash `$2a$10$...`). |
| JWT secret storage | `process.env.JWT_SECRET`, default value in `.env.example` is `techno_kol_secret_2026_palantir` — **hard-coded, weak, committed**. |
| JWT expiry | `24h` hard-coded in login route; `.env` declares `JWT_EXPIRES_IN=24h` but the code does **not** read it. |
| Refresh tokens | **NONE** — no refresh endpoint, no refresh token issuance, 24h hard session. |
| Logout / revocation | **NONE** — no deny list, no blacklist, no session store. Logout is client-side only. |
| MFA / 2FA | **NONE**. |
| Password reset | **NONE** — no email flow, no reset tokens, no `/api/auth/forgot`. |
| Account lockout / rate limit | **NONE** — unlimited login attempts. |
| Audit logging of auth events | Only `last_login` timestamp; no failed-attempt log. |
| CORS | `app.use(cors({ origin: '*' }))` — wide-open despite `ALLOWED_ORIGINS` being declared in env. |
| WebSocket auth | Best-effort: if `jwt.verify` throws, the connection is still accepted as `anonymous`. **Unauthenticated clients can join and receive broadcasts.** |

---

## 2. Findings — Ranked by Severity

### CRITICAL (C)

**C1. Weak / committed JWT secret.**
`.env.example` ships `JWT_SECRET=techno_kol_secret_2026_palantir` (33 chars but predictable, public, identical across installs). Anyone with repo access can forge admin tokens for any deploy that didn't rotate. No length check, no entropy check at startup.

**C2. Unauthenticated WebSocket fall-through.**
`src/realtime/websocket.ts` wraps `jwt.verify` in `try {} catch {}` and silently downgrades to `userId = 'anonymous'`. A client with an invalid (or missing) token still gets `CONNECTED` and joins the `global` room — receiving every `broadcastToAll` payload (orders, GPS, financials).

**C3. CORS wildcard.**
`app.use(cors({ origin: '*' }))` contradicts the env-level `ALLOWED_ORIGINS` allow-list, enabling CSRF-style abuse against any browser holding a valid JWT in JS memory.

**C4. No account lockout / rate limit on `/api/auth/login`.**
Brute force and credential-stuffing are unconstrained. Combined with bcrypt cost 10, an attacker can throw thousands of guesses per minute.

### HIGH (H)

**H1. bcrypt cost factor 10 (should be >= 12).**
Seed hashes are `$2a$10$...`. 2026 baseline is 12; high-risk tenants 13-14.

**H2. JWT 24h hard-coded; `JWT_EXPIRES_IN` env ignored.**
`src/index.ts:63` passes `expiresIn: '24h'` literal — the declared env var is dead code. Long-lived tokens + no revocation = stolen token is valid for a full day.

**H3. No refresh-token strategy.**
Mega ERP needs short-lived access (15m) + rotating refresh (7-30d) + device binding. Today it's one flat 24h token.

**H4. No logout / token revocation.**
Stolen tokens cannot be invalidated. Required: Redis (or Postgres) deny list keyed by `jti`, checked in `authenticate()`.

**H5. No password reset flow.**
Users who lose passwords cannot recover without DB access. Operational risk + support burden.

**H6. No MFA.**
For admin / finance roles this is table-stakes in 2026. At minimum TOTP (RFC 6238).

**H7. Inconsistent auth story across ERP.**
`onyx-procurement`, `onyx-ai`, and `techno-kol-ops` each need their own `JWT_SECRET` verified, or (better) a shared IdP. Today there is no shared `iss` / `aud` claim, no key rotation strategy, no JWKS.

### MEDIUM (M)

**M1. No `iss` / `aud` / `sub` / `jti` claims.**
Token payload is `{ id, username, role }` — flat, no standard claims, no unique ID (blocks future deny-list).

**M2. Login route is inline in `src/index.ts`.**
Mixing framework bootstrap with auth logic hurts testability and makes it easy to skip auditing. Should live in `src/auth/` or `src/routes/auth.ts`.

**M3. Generic 500 on login error swallows stack.**
`res.status(500).json({ error: 'Login failed' })` hides DB outages vs bcrypt errors vs bugs.

**M4. `authenticate()` uses non-null assertion `process.env.JWT_SECRET!`.**
If env is unset, middleware throws at request time (500) instead of refusing to boot.

**M5. No password strength policy on seed / future registration.**
Seed plants `kobi` / `manager` both with password `"password"`. Strictly a seed concern, but the only "registration" story — there is no `/register` endpoint at all.

**M6. `last_login` updated pre-validation of success? No — it is after bcrypt compare, but on success only.** OK. However, no `failed_login_count` column or lock flag.

### LOW (L)

**L1. `requireAdmin` only checks `role === 'admin'`.** No hierarchical role model; no scope-based authorization.

**L2. No JWT clock-skew tolerance configured.** Default is 0s — may cause false rejects between nodes.

**L3. No `helmet`, `express-rate-limit`, `csurf`.** Not strictly auth, but the same threat surface.

---

## 3. Recommended Hardening (ordered)

1. **Stop shipping a real secret in `.env.example`.** Replace with `CHANGE_ME_MIN_32_CHARS` and a startup check that refuses to boot if `JWT_SECRET.length < 32` or matches the placeholder. *(See `src/auth/jwt-helper.js` delivered with this audit.)*
2. **Centralize JWT sign/verify** in `src/auth/jwt-helper.js` and route `src/middleware/auth.ts`, `src/realtime/websocket.ts`, and `src/index.ts` through it. *(Helper delivered; migration is a follow-up PR.)*
3. **Fix the WebSocket fall-through** — reject the socket if `jwt.verify` throws instead of downgrading to anonymous.
4. **Lock CORS** to `ALLOWED_ORIGINS` (already in env).
5. **Raise bcrypt cost to 12.** Re-hash on next successful login (just-in-time migration). *(See `src/auth/password-helper.js` delivered with this audit.)*
6. **Honor `JWT_EXPIRES_IN`** and shorten default to `15m`. Add a refresh-token endpoint issuing rotating `jti`s stored in Postgres (`auth_refresh_tokens`).
7. **Add a deny-list table** (`auth_revoked_tokens(jti, expires_at)`) and check it in `authenticate()`. Logout = insert.
8. **Add rate-limit** (`express-rate-limit`, 5 attempts / 15min / IP+username) on `/api/auth/login`.
9. **Add MFA (TOTP)** for `admin` and `manager` roles; store `mfa_secret` on users table; require second factor post-password.
10. **Add password reset flow** — `/api/auth/forgot` issues a single-use token via email, `/api/auth/reset` consumes it.
11. **Standardize across ERP.** Agree on shared `iss = "onyx-erp"`, per-service `aud`, rotate secrets via a shared KMS, publish a JWKS endpoint, and let `onyx-procurement` / `onyx-ai` / `techno-kol-ops` all verify through the same helper package.
12. **Log auth events** to `audit_log` — login success, login failure, logout, refresh, password reset, MFA enable/disable.

---

## 4. What Agent-25 Delivered in This Pass

- `src/auth/jwt-helper.js` — centralized sign/verify with startup secret validation.
- `src/auth/jwt-helper.test.js` — tests for round-trip, expiry, tamper, weak secret, missing payload.
- `src/auth/password-helper.js` — bcrypt cost 12 + constant-time compare.

No existing auth files were modified. No new npm dependencies were installed. If `jsonwebtoken` or `bcrypt` are unavailable at runtime the helpers fall back to Node's built-in `crypto` module (HS256 + scrypt) with loud warnings — see TODO headers in each file.
