# AGENT-270 — Security Architecture Refresh

**Agent:** 270 (ARCH #5)
**Date:** 2026-04-29
**Branch:** claude/objective-merkle-40ff93
**Owner:** kobi.ellkayam@technokoluzi.com
**Sources reviewed:**
- `SECURITY_MODEL.md` (Agent-35, 2026-04-11)
- `onyx-procurement/QA-AGENT-13-REGRESSION-CHECKLIST.md` (the canonical "Agent 13" doc)
- `_qa-reports-25/AGENT-09-db-integrity.md`
- `_qa-reports-25/AGENT-15-architecture.md`
- `_qa-reports-25/AGENT-147-mfa.md`
- `supabase/migrations/00068`–`00073` (RLS hardening trail)
**Method:** Static review — no runtime probes.

---

## 0. Status — AMBER

The system has the *shape* of an enterprise security model — Supabase Auth, JWT, RLS migrations, audit log, helmet, HMAC webhooks, TOTP module — but **multiple foundational controls are wired only partway through.** The four most damaging gaps are:

1. **318 RLS policies on 244 tables still `USING (true)`** (AGENT-09).
2. **MFA enforcement middleware is dead code** — admin can flip the toggle, nothing reads it (AGENT-147 C-01).
3. **Two TOTP libraries co-exist**, the active one stores backup codes in plaintext (AGENT-147 C-02).
4. **No RBAC engine** — any valid `api_key:*` actor can mutate any row (SECURITY_MODEL §3).

The rest of this document re-states the target architecture, the *current* implementation, and the delta in five layers: identity, authz, encryption, secrets, threat model.

---

## 1. Identity — Supabase Auth + JWT

### 1.1 Target

| Layer | Mechanism | Where |
|---|---|---|
| End-user login | `supabase.auth` (email/password, magic link, OAuth) | erp-app, payroll-autonomous |
| Session token | Supabase JWT, RS256, 1-h access + refresh | Browser → api-server |
| Service-to-service | `X-API-Key` (≥32 chars, high-entropy) | onyx-ai ↔ onyx-procurement, cron jobs |
| MFA gate | TOTP (RFC-6238) + 8-char hex backup codes + email OTP | api-server `/api/mfa/*` |
| Session store | `user_sessions` (idle / absolute / fingerprint) | lib-client `db/schema/security.ts` |

**Required JWT claims:** `sub` (auth.users.id), `tenant_id` (UUID), `role` (governance.roles.code), `iat`, `exp`. The `tenant_id` claim is the keystone for RLS: see `governance.current_tenant_id()` in migration 00073.

### 1.2 Current state vs target

| Component | Spec | Reality | Source |
|---|---|---|---|
| Supabase Auth wired to UI | Yes | Yes (`erp-app/src/lib/supabase.ts`) | AGENT-15 |
| JWT in techno-kol-ops | bcrypt + `jwt.sign({id,username,role}, JWT_SECRET, {expiresIn:'24h'})` | Implemented; **no refresh token, no revocation list** | SECURITY_MODEL §2.3 |
| API-key path | Bearer/X-API-Key, audit log carries first 6 chars | Implemented | SECURITY_MODEL §2.1 |
| TOTP | RFC-6238, scrypt-hashed backup codes, constant-time | **Dual implementation.** `onyx-procurement/src/auth/totp.js` (64/64 tests, dormant) is correct; `api-server/src/lib/mfa.ts` (active) regresses on every property | AGENT-147 §1, §3 C-02 |
| MFA per-role enforcement | Middleware reads `role_mfa_requirements.requireMfaForActions[]` and rejects | **Function exported, never called.** UI persists toggles, server never enforces | AGENT-147 C-01 |
| MFA login gate | `validateSession` rejects if `requireMfa=true` and `isMfaVerified=false` | **Not implemented** — UI shows yellow banner, that is all | AGENT-147 C-03 |
| Session timeouts | idle / absolute / fingerprint via `platformSettingsTable` | Schema present; **enforcer not located** | AGENT-147 M-05 |

### 1.3 Action items (P0)

- A. Replace `api-server/src/lib/mfa.ts` with the Agent-96 module — closes C-02 + H-01 in one move.
- B. Add `requireMfaMiddleware(action)` over the 5 sensitive route groups (`delete_records`, `change_permissions`, `financial_approvals`, `export_data`, `manage_users`).
- C. Login pipeline: `validateSession` must consult `role_mfa_requirements` and return `{error: "mfa_setup_required"}` for users who haven't enrolled.
- D. techno-kol-ops: add `user_sessions.revoked_at` + middleware to honour it.

---

## 2. Authorization — RBAC + RLS

### 2.1 Target

```
JWT.tenant_id ─┐
JWT.sub ─┐    ├─► governance.current_tenant_id() ──► RLS USING (tenant_id = …)
         ├──► governance.user_id()
         └──► roles_assignments → roles → permissions  ──► RBAC middleware
                                                          ──► RPC SECURITY DEFINER guards
```

**Three concentric rings:**
1. **Network perimeter** — CORS allowlist, helmet, rate limiter (300/15min API, 120/min webhook).
2. **RBAC at the edge** — Express middleware reads `req.actor`, joins `role_assignments` → `permissions`, denies on mismatch.
3. **RLS in Postgres** — every tenanted table carries `tenant_id` and a policy of the shape `USING (tenant_id = governance.current_tenant_id())`. SECURITY DEFINER RPCs explicitly opt-out only when needed.

### 2.2 Current state — the big gap

| Layer | Should be | Is | Severity |
|---|---|---|---|
| RBAC middleware | Exists, reads `permissions` | **Does not exist.** Every valid API key can call every mutation | CRITICAL (SECURITY_MODEL §3, A01 row of OWASP table marked Partial) |
| `tenant_id` columns | All tenanted public tables | **57 vertical-domain tables missing it** | HIGH (AGENT-09 §0) |
| `tenant_id` indexes | All tables that have the column | **29 tables without index** | HIGH (AGENT-09 §0) |
| RLS enabled | All public tables | **59 tables RLS-disabled** including `api_keys`, `env_variables`, `webhooks`, `analytics_events`, `system_logs` | CRITICAL (AGENT-09 §1) |
| RLS policies non-trivial | tenant predicate | **318 policies on 244 tables still `USING (true)`** — including `gl_journal_entries`, `ap_invoices`, `ar_invoices`, `ar_receipts` (the books of record) | CRITICAL (AGENT-09 §3) |
| RLS w/ zero policies | Service-role only | 5 platform tables (`platform_api_keys`, `platform_invoices`, `platform_metrics_global`, `platform_organizations`, `platform_webhooks`) — currently unreachable from API | HIGH (AGENT-09 §2) |
| Anon read | Forbidden on PII | 2 tables (`app_menu`, `products`) — defensible for menu, NOT for products | MEDIUM (AGENT-09) |
| RPC privilege model | SECURITY DEFINER + explicit `governance.*` checks | Implemented for the 360 RPCs (00006, 00018, 00026), missing for many domain RPCs | PARTIAL |

### 2.3 The hardening migration trail

Migrations that already landed (good):
- `00068` — replace `USING (true)` on the 4 schemas execution/finance/inventory/intelligence (24 policies).
- `00069` — FK indexes + dedupe.
- `00070` — `auth.uid()` initplan fix.
- `00071` — remove anon read on the most dangerous tables.
- `00072` — add `tenant_id` columns + indexes to a subset.
- `00073` — `governance.current_tenant_id()` helper + tenant predicates on tenanted tables; **idempotent**.

Migrations still needed (delta from AGENT-09):
- `00074_rls_extend_verticals` — tenant predicates for the remaining 23 vertical schemas (`commercial.*`, `comms.*`, `crm.*`, `docs.*`, `documents.*`, `fleet.*`, `governance.*`, `logistics.*`, `maintenance.*`, `orchestration.*`, `planning.*`, `pricing.*`, `procurement.*`, `quality.*`, `reporting.*`, `routing.*`, `safety.*`, `scheduling.*`, `service.*`, `treasury.*`, `workforce.*`, `analytics.*`, `platform.*`).
- `00075_rls_enable_disabled_59` — `ALTER TABLE … ENABLE ROW LEVEL SECURITY` plus a service-role-only policy on the 8 sensitive ones (`api_keys`, `env_variables`, `webhooks`, `tax_rules`, `user_integrations`, `tenant_integrations`, `analytics_events`, `system_logs`).
- `00076_tenant_id_backfill` — add `tenant_id` to the 57 vertical-domain `public.*` tables that don't have it; backfill from owner relation; index.
- `00077_rbac_engine` — `roles`, `permissions`, `role_permissions`, `role_assignments` + `governance.has_permission(user_id, perm_code)` SECURITY DEFINER helper. Wire into `requireMfaMiddleware`.

### 2.4 RLS contract (target shape)

```sql
-- For tenanted tables
ALTER TABLE <schema>.<table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON <schema>.<table>
  FOR SELECT TO authenticated
  USING (tenant_id = governance.current_tenant_id());

CREATE POLICY tenant_isolation_write ON <schema>.<table>
  FOR ALL TO authenticated
  USING (tenant_id = governance.current_tenant_id())
  WITH CHECK (tenant_id = governance.current_tenant_id());

CREATE POLICY service_role_escape ON <schema>.<table>
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

Personal data (e.g. `governance.users_profile`) gets an `owner_isolation` policy keyed on `user_id = auth.uid()`.

System/platform tables get **service_role-only** policies — no `authenticated` access at all.

---

## 3. Encryption

### 3.1 In transit

| Hop | Protocol | Termination |
|---|---|---|
| Browser ↔ api-server | HTTPS (TLS 1.2+) | Caddy / Nginx / Cloudflare reverse proxy. App binds plain HTTP behind it | SECURITY_MODEL §5 |
| api-server ↔ Supabase | HTTPS (forced by Supabase) | Supabase | §5 |
| api-server ↔ Meta Graph | HTTPS to `graph.facebook.com:443` via `https.request` | OS trust store | §5 |
| api-server ↔ Twilio | HTTPS to `api.twilio.com` | OS trust store | §5 |
| WebSocket | `wss://` via the same TLS terminator | Caddy / Nginx | §5 |

**Production rule:** TLS 1.2 minimum; HSTS via helmet; `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. **CSP is currently disabled** (helmet `contentSecurityPolicy: false`) — see Hardening item P0-2 in §6.

### 3.2 At rest

| Layer | Mechanism | Status |
|---|---|---|
| Postgres disk | Supabase AES-256 (platform-managed) | Active |
| Backups | Supabase daily backups + PITR (encrypted) | Active |
| Filesystem (PCN836 `.TXT`, wage-slip PDFs) | Host-disk encryption (LUKS / EBS / Cloudflare R2 SSE) | **Relies on host config — not enforced by app** |
| Tamper detection | SHA-256 checksums in `vat_submissions.pcn836_file_checksum` | Active |
| **Column-level encryption (PII)** | `pgcrypto` PGP_SYM, KMS-sourced DEK | **NOT IMPLEMENTED** — `employees.national_id`, `employees.bank_account_number`, `wage_slips.employee_national_id` stored plaintext | SECURITY_MODEL §4, P1-3 |
| Passwords | `bcrypt` (techno-kol-ops); Supabase Auth handles its own hashing for end-users | Active |
| TOTP secrets | `user_mfa.totpSecret` jsonb — currently **plaintext** | AGENT-147 H-02 |
| Backup codes | scrypt-hashed in dormant Agent-96 module; **plaintext in active api-server module** | AGENT-147 C-02 |
| WhatsApp HMAC | `WHATSAPP_APP_SECRET` → HMAC-SHA256 over raw body, `crypto.timingSafeEqual`, length-pre-check | Correctly implemented | SECURITY_MODEL §6.2 |

### 3.3 Action items

- **P1.** `pgcrypto` extension + `governance.encrypt_pii(text)` / `decrypt_pii(bytea)` + KMS wrapper for the 3 PII columns above.
- **P0.** TOTP secret + backup codes: scrypt + `timingSafeEqual` (use the dormant Agent-96 module).
- **P2.** Re-enable CSP with hashed inline styles or move to static CSS files.

---

## 4. Secrets Management

### 4.1 Current

`SECURITY_MODEL §10` documents the env-var contract. Required:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — boot fails without them.

Recommended:
- `API_KEYS` (≥32 chars, comma-separated), `AUTH_MODE`, `ALLOWED_ORIGINS`, `RATE_LIMIT_*`, `WHATSAPP_*`, `TWILIO_*`, `JWT_SECRET`, `PCN836_ARCHIVE_DIR`, `VAT_RATE`, `NODE_ENV`.

Operating rules (already in place):
1. `.env.example` committed; `.env` git-ignored.
2. Audit log captures only the 6-char prefix of an API key.
3. `NODE_ENV=production` flips safeties (stack traces hidden, unsigned webhooks refused).
4. Rotation procedure documented in `onyx-procurement/DR_RUNBOOK.md`.

### 4.2 Where the secrets actually live (and where they shouldn't)

| Secret | Production sink | Risk |
|---|---|---|
| `SUPABASE_ANON_KEY` | systemd `Environment=` / `--env-file` / hosting platform | OK; never in browser |
| `JWT_SECRET` | Same | OK |
| `WHATSAPP_APP_SECRET` | Same | OK |
| `WHATSAPP_TOKEN` | Same | **Single bearer token = full impersonation of business phone** — rotate on suspicion |
| `API_KEYS` | Same | **Browser holds a copy in `localStorage` (payroll-autonomous)** — acceptable only on LAN/VPN-gated React bundle |
| Supabase `service_role` key | **Should never leave server** | If used at all, only in cron / edge functions |

### 4.3 Target — Vault / Sealed Secrets

Today: env-var-via-process-supervisor. This is acceptable for a single-host deployment and the documented rotation runbook makes it operable.

For the multi-tenant / k8s direction in `k8s/` (already scaffolded per AGENT-15), the target is one of:
- **HashiCorp Vault** with the AppRole auth method per service; secrets fetched at boot via the Vault Agent sidecar; short-TTL leases for DB creds.
- **Sealed Secrets** (Bitnami) for k8s — encrypted manifests checked into git, decrypted by the controller in-cluster.
- **Cloud-native** — AWS Secrets Manager / GCP Secret Manager / Azure Key Vault + Workload Identity.

**Decision pending.** AGENT-141 (`AGENT-141-cloud.md`) is the place this should land. None of the three is implemented today.

### 4.4 Action items

- **P2.** Pick one of {Vault, Sealed Secrets, cloud KMS} and write a 1-page ADR.
- **P2.** Wire `API_KEYS`, `JWT_SECRET`, `WHATSAPP_APP_SECRET`, `SUPABASE_*` through the chosen mechanism.
- **P3.** Short-TTL DB creds (Vault dynamic secrets) for the long-running services.

---

## 5. Threat Model

Carrying forward `SECURITY_MODEL §1`, refreshed against the AGENT-09/15/147 audits:

### 5.1 Assets at risk

- **Israeli tax filings** — PCN836, Forms 1301/1320/6111/30א. Disclosure or tampering is a criminal risk under חוק מע"מ 1975.
- **Payroll PII** — ת.ז (national ID), salary, bank, pension/study-fund. Governed by חוק הגנת השכר תיקון 24 + Privacy Protection Law.
- **Supplier pricing & negotiated savings** — competitive intelligence; leak = future RFQs undercut.
- **Bank statement reconciliation** — direct cashflow window.
- **WhatsApp Business token + verify secret** — full impersonation of the business phone line.
- **Tenant data isolation** — multi-tenant SaaS direction; cross-tenant read = deal-breaker.
- **Audit log** — append-only, must survive partial DB compromise.
- **MFA TOTP secrets + backup codes** — possession = persistent foothold.

### 5.2 Adversaries

| # | Adversary | Goal | Capability | Top mitigation |
|---|---|---|---|---|
| T1 | External attacker (public internet) | Steal PII / tax data, ransom DB | HTTP, webhook replay, dictionary attacks | API-key auth, helmet, rate limit, HMAC webhooks |
| T2 | Malicious supplier | Inject false quote, manipulate RFQ decision | Legitimate WhatsApp number, spoofed payload | HMAC verification + audit trail |
| T3 | Disgruntled insider | Exfiltrate payroll, wipe audit log | Internal API-key knowledge, possible SSH | RBAC (missing!), append-only log, MFA gate (missing!) |
| T4 | Hostile prompt-injection (onyx-ai) | Exfiltrate via generated routes | Crafted LLM input | Server-side RBAC, no user-controlled URL fetch |
| T5 | Supply-chain hijack | Trojan code in `npm install` | Compromised transitive package | Lockfile committed, `npm audit:sec`, **needs Renovate/Dependabot** |
| T6 | Cross-tenant attacker | Read another tenant's rows via a permissive RLS policy | Authenticated session in tenant A | **`tenant_id` predicate via `governance.current_tenant_id()` — currently 318 holes** |
| T7 | Tax authority audit failure | (Forcing function, not adversary) Prove every figure on every filed form | — | Audit log + checksums + state machine `decided` paths |

### 5.3 Trust boundaries

- Public ↔ onyx-procurement (3100) — only `/api/status`, `/api/health`, `/webhook/whatsapp` unauthenticated.
- Public ↔ techno-kol-ops (3200) — currently `cors({origin:'*'})` hardcoded → **align to allowlist before any external exposure** (P0).
- api-server ↔ Supabase — TLS + anon key; anon key treated as server secret.
- onyx-ai ↔ onyx-procurement — server-to-server `X-API-Key` via `procurement-bridge.ts`.
- Browser ↔ payroll-autonomous → onyx-procurement — React bundle holds API key; gated by network perimeter.

### 5.4 OWASP Top 10 (2021) — refreshed status

| # | Risk | Status | Δ vs SECURITY_MODEL §11 |
|---|---|---|---|
| A01 Broken Access Control | **CRITICAL** (was Partial) | Downgraded — AGENT-09 found 318 `USING (true)` policies on the books of record |
| A02 Cryptographic Failures | Partial | Same — column-level PII encryption still missing; backup codes plaintext |
| A03 Injection | Covered | Same — Supabase + parameterized queries |
| A04 Insecure Design | Partial | Same — `ON DELETE CASCADE` contradicts append-only doctrine |
| A05 Security Misconfiguration | Partial | Same — CSP off; techno-kol-ops CORS wildcard |
| A06 Vulnerable Components | Partial | Same — no Renovate/Dependabot |
| A07 Identification & Auth Failures | **HIGH** (was Partial) | Downgraded — AGENT-147 found MFA enforcement is dead code; no key rotation, no session revocation |
| A08 Data Integrity | Covered | Same — checksums, schema_migrations, state machines |
| A09 Logging & Monitoring | Covered | Same — `audit_log`, `payroll_audit_log`, `system_events`, pino |
| A10 SSRF | Covered | Same — only hardcoded outbound targets |

---

## 6. Action Items — Prioritised Backlog

### P0 (block production-grade claim)

1. **MFA enforcement live** — middleware over the 5 sensitive route groups + login gate (`validateSession` rejects when `requireMfa=true && isMfaVerified=false`). [AGENT-147 C-01, C-03]
2. **TOTP unification** — drop `api-server/src/lib/mfa.ts`, import the Agent-96 module, scrypt-hash backup codes. [AGENT-147 C-02]
3. **RLS hardening migration 00074–00076** — replace remaining 318 `USING (true)` policies with `tenant_id = governance.current_tenant_id()`; enable RLS on the 59 disabled tables; backfill `tenant_id` on the 57 missing-column tables. [AGENT-09]
4. **techno-kol-ops CORS** — align with onyx-procurement allowlist pattern. [SECURITY_MODEL §8]
5. **CSP** — re-enable on the RTL dashboards (hash inline styles or move to static CSS). [SECURITY_MODEL §9]

### P1 (next sprint)

6. **RBAC engine** — `roles`, `permissions`, `role_permissions`, `role_assignments` + `governance.has_permission()` + Express middleware that reads `req.actor`. [SECURITY_MODEL §3]
7. **Column-level PII encryption** — `pgcrypto` PGP_SYM on `employees.national_id`, `employees.bank_account_number`, `wage_slips.*national_id`, KMS-sourced DEK. [SECURITY_MODEL §4]
8. **Session revocation** — `user_sessions.revoked_at` honoured by middleware in techno-kol-ops. [SECURITY_MODEL §11 P1]
9. **Rate-limit `/mfa/verify` and `/mfa/email/send`** — 5/min/user with exponential backoff. [AGENT-147 H-03]
10. **Local QR generator** — drop `api.qrserver.com`. [AGENT-147 M-02]

### P2 (architecture maturity)

11. **Secrets backend decision** — Vault | Sealed Secrets | cloud KMS — write 1-page ADR.
12. **SIEM forwarder** — `audit_log`, `payroll_audit_log`, `system_events` to external tamper-evident log store.
13. **Renovate / Dependabot** across all 5 projects.
14. **Signed releases** — verify before deploy.
15. **Distributed rate limiter** — Redis-backed (current is in-process per SECURITY_MODEL §7).

### P3 (hygiene)

16. **Key rotation runbook** automated — script for `API_KEYS`, `JWT_SECRET`, `WHATSAPP_APP_SECRET`, Supabase keys.
17. **External pen-test** before the supplier portal goes live.
18. **Remove `mfa.backup.ts` shadow file + `guard-mfa.sh`** from the repo. [AGENT-147 M-06]

---

## 7. Definition of Done (security gate for any future PR)

A PR is mergeable only if:

- (a) No new `USING (true)` policy without an explicit `service_role`-only justification in the PR body.
- (b) No new public table without `tenant_id` (or an `[OWNER-DATA]` / `[CATALOG]` label).
- (c) Any new mutation route is gated by either an `apiKey` middleware or an authenticated Supabase session, AND lists the matching `permission_code` in the route comment.
- (d) Any new sensitive action (delete / change-permissions / financial-approval / export / manage-users) is wrapped in `requireMfaMiddleware(action)`.
- (e) No secret in code; `.env.example` updated for any new env var; `SECURITY_MODEL §10` table updated.
- (f) Audit log row written for every state transition (matches Agent 13 regression items 67–75).

The Agent-13 regression checklist (100 scenarios, 11 categories, ~32 ★ blockers) remains the runtime contract — that document plus this one is the full security gate.

---

## 8. Sign-off

The security model is **AMBER**: documented end-to-end, but four foundational controls (RBAC, MFA enforcement, RLS predicates, column PII encryption) are demonstrably partial. The path forward is the prioritised backlog in §6 — five P0 items unblock a production-grade claim; without them the system is gated by network perimeter alone.

Agent 270 closes.
