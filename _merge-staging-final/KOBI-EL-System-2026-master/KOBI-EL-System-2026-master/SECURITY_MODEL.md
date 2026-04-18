# SECURITY MODEL — Techno-Kol Uzi Mega ERP

Author: Agent-35
Date: 2026-04-11
Scope: The 5-project ERP (onyx-procurement, payroll-autonomous, techno-kol-ops, onyx-ai) + the Supabase data plane.
Sources: `onyx-procurement/server.js` §§ ENV/security/auth/webhook (lines 27–152), `techno-kol-ops/src/index.ts` lines 38–70, `onyx-ai/src/security.ts`.

---

## 1. Threat Model

The system holds enough sensitive data to make it a very juicy target:

**Assets at risk**
- Israeli tax filings (PCN836, Forms 1301/1320/6111/30א) — disclosure or tampering is a criminal risk under חוק מע"מ 1975.
- Employee payroll PII: national ID (ת.ז), salary, bank details, pension/study-fund numbers. Governed by חוק הגנת השכר תיקון 24 and Privacy Protection Law.
- Supplier pricing & negotiated savings — competitive intelligence; leaks let competitors undercut future RFQs.
- Bank statement data + reconciliation matches — direct window into company cashflow.
- WhatsApp Business token + webhook secret — full impersonation of the business phone line.
- API keys, JWT secret, Supabase anon/service-role keys.

**Adversaries**
| Adversary | Goal | Capability |
|---|---|---|
| T1. External attacker (public internet) | Steal PII / tax data, ransom DB | HTTP calls, webhook replay, dictionary attacks on API keys |
| T2. Malicious supplier | Inject false quote, manipulate RFQ decision | Legitimate WhatsApp number; might try to spoof webhook payloads |
| T3. Disgruntled employee / contractor | Exfiltrate payroll, wipe audit log | Internal API-key knowledge, maybe SSH to host |
| T4. Hostile AI prompt-injection via LLM features (onyx-ai) | Exfiltrate data via generated routes | Crafted input to intelligence/brain/aip endpoints |
| T5. Supply-chain / dependency hijack | Trojan code in `npm install` | Compromised transitive package |
| T6. Tax authority audit failure | Not an attacker but a forcing function: must prove every figure on every filed form | — |

**Trust boundaries**
- Public internet ↔ onyx-procurement (port 3100) — only `/api/status`, `/api/health`, and `/webhook/whatsapp` are unauthenticated.
- Public internet ↔ techno-kol-ops (port 5000) — currently `cors({origin:'*'})` (see L3 in ARCHITECTURE.md).
- onyx-procurement ↔ Supabase — TLS + anon key; anon key is treated as a server-side secret, never shipped to browsers.
- onyx-ai ↔ onyx-procurement — server-to-server via `procurement-bridge.ts`, uses the same X-API-Key flow.
- Browser ↔ payroll-autonomous ↔ onyx-procurement — the React app holds an API key in `localStorage`/Vite env. This is acceptable only because the React bundle is itself gated by a network perimeter (Kobi's LAN/VPN).

---

## 2. Authentication

### 2.1 API-key auth (onyx-procurement, onyx-ai, payroll-autonomous)

Source: `onyx-procurement/server.js` lines 101–126.

```js
const API_KEYS = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
const AUTH_MODE = process.env.AUTH_MODE || (API_KEYS.length ? 'api_key' : 'disabled');
```

- Header: `X-API-Key: <key>` OR `Authorization: Bearer <key>`.
- The server keeps API keys only in `process.env.API_KEYS` (comma-separated). Never persisted in Git, never echoed in logs.
- Constant-time compare is **not** used on the list membership check (`API_KEYS.includes(apiKey)`); this is acceptable today because API keys are high-entropy random strings ≥32 chars. If shorter keys are ever allowed, switch to `crypto.timingSafeEqual` against each entry.
- On auth failure the response is `401 { error: 'Unauthorized — missing or invalid X-API-Key header' }` — no hint whether the header was missing vs wrong.
- On success `req.actor = 'api_key:' + apiKey.slice(0,6) + '…'` — the first 6 chars go into every audit row so leaks are traceable but the full key is never persisted.

### 2.2 Auth modes

| Mode | Trigger | Behaviour |
|---|---|---|
| `api_key` | `AUTH_MODE=api_key` OR any `API_KEYS` configured | Every `/api/*` route (except public list) requires a valid key |
| `disabled` | `AUTH_MODE=disabled` AND no keys | `req.actor = 'anonymous'`, all routes open — **dev only** |
| Public | `/api/status`, `/api/health` | No auth, returns dashboard summary / uptime |

A boot banner prints `Auth Mode: <mode>` and `API Keys: <count>` so the operator always knows which mode is live.

### 2.3 JWT auth (techno-kol-ops)

Source: `techno-kol-ops/src/index.ts` lines 47–70.
- `POST /api/auth/login` with `{username, password}`.
- Password verified with `bcrypt.compare(password, rows[0].password_hash)`.
- Success → `jwt.sign({id, username, role}, process.env.JWT_SECRET, { expiresIn: '24h' })`.
- Failure path returns a generic `Invalid credentials` — no user enumeration.
- `last_login` is stamped on success.
- No refresh token, no revocation list (L2 in ARCHITECTURE.md).

---

## 3. Authorization — what is "actor"?

`actor` is the universal identity string written on every audit/mutation row. It is NOT a role — RBAC does not exist yet.

```
actor ∈ {
  api_key:<first-6>…     // server-side caller, identified by truncated key
  user:<username>        // techno-kol-ops JWT holder
  system:cron            // scheduled jobs
  system:webhook         // incoming WhatsApp message
  system:autonomous      // onyx-ai decision
  anonymous              // AUTH_MODE=disabled only — forbidden in prod
  public                 // /api/status, /api/health
}
```

Any valid `api_key:*` actor can call every `/api/*` mutation — there is no resource-level policy engine. Authorization is enforced by network perimeter (who holds the key) and after-the-fact audit via `audit_log.actor`.

techno-kol-ops carries `role` in the JWT payload but there is no middleware that actually checks the role before route execution. The decoded token is available to route handlers; none of the handlers inspected use it. This is a known gap.

---

## 4. Data at Rest

- **Primary store**: Supabase-hosted Postgres. Supabase encrypts storage at rest with AES-256 at the disk layer. Row-level encryption is not used — any key holder can read PII columns.
- **PII columns** (payroll): `employees.national_id`, `employees.bank_account_number`, `wage_slips.employee_national_id`. These are stored plaintext in the DB; physical exfiltration of the DB means PII exposure. Mitigation is access control, not column encryption.
- **Filesystem archives**: PCN836 `.TXT` files under `data/pcn836/`, wage-slip PDFs under `data/`. These live on the app host's disk with process permissions. Checksums are stored in `vat_submissions.pcn836_file_checksum` so tampering is detectable. No disk-level encryption is enforced by the app (relies on the host disk encryption).
- **Secrets**: `.env` files, never committed (see § 9). The anon key is in memory only after boot.
- **Backups**: Supabase daily backups + PITR window (platform-managed, encrypted).

---

## 5. Data in Transit

- **HTTPS everywhere** is the rule in production. The app itself binds plain HTTP; TLS termination happens at the reverse proxy (Caddy/Nginx/Cloudflare).
- Supabase is always HTTPS.
- WhatsApp Graph API calls go out via `https.request` to `graph.facebook.com` on 443.
- WebSocket upgrade (techno-kol-ops `initWebSocket(server)`) rides on the same Express server port — `wss://` via the same TLS terminator in production.
- Rate limiter + helmet + CORS all assume TLS-terminated upstream.

---

## 6. Webhook Security (WhatsApp)

Source: `onyx-procurement/server.js` lines 128–152, 1094–1132.

### 6.1 Verification handshake (GET /webhook/whatsapp)
```
if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
  res.status(200).send(challenge);
} else {
  res.sendStatus(403);
}
```
The verify token is a shared secret with Meta, checked once during webhook setup.

### 6.2 Per-message HMAC (POST /webhook/whatsapp)

```js
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

function verifyWhatsAppHmac(req, res, next) {
  if (!WA_APP_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Webhook HMAC not configured — server refuses unsigned webhooks in production' });
    }
    // dev-only warning, pass through
  }
  const signature = req.headers['x-hub-signature-256'] || '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WA_APP_SECRET)
    .update(req.rawBody || Buffer.from(''))
    .digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  next();
}
```

Key properties:
1. `req.rawBody` is captured BEFORE JSON.parse — critical because HMAC is over the raw bytes.
2. HMAC-SHA256 over the raw body with `WHATSAPP_APP_SECRET`.
3. `crypto.timingSafeEqual` — no early-exit string compare.
4. Length-check before `timingSafeEqual` prevents the "length oracle" that `timingSafeEqual` throws on mismatched lengths.
5. In production, missing `WHATSAPP_APP_SECRET` returns 500 — the server refuses to process unsigned webhooks. Only `NODE_ENV !== 'production'` lets it pass with a console warning.

---

## 7. Rate Limits

Source: `server.js` lines 68–83.

```js
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_MAX) || 300,
});
app.use('/api/', apiLimiter);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_WEBHOOK_MAX) || 120,
});
app.use('/webhook/', webhookLimiter);
```

- API pool: 300 req / 15 min per-IP (env override).
- Webhook pool: 120 req / min (WhatsApp can spike).
- Headers: `RateLimit-*` standard (`standardHeaders: true`, `legacyHeaders: false`).
- 429 response body: `{error: 'Too many requests — rate limit exceeded (15 min window)'}`.
- In-process counter — not distributed (L10).

---

## 8. CORS Allowlist

```js
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
```

- Default `*` is allowed only for dev. Production **must** set `ALLOWED_ORIGINS=https://dashboard.example.co.il,https://payroll.example.co.il`.
- `credentials: true` is deliberately allowed so the dashboard can set `Authorization`/`X-API-Key`.
- techno-kol-ops currently uses `cors({origin:'*'})` hardcoded — must be aligned before external exposure.

---

## 9. Helmet Policy

```js
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
```

Helmet defaults are applied — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, etc.

- **CSP is disabled** because the RTL dashboards inject inline `<style>` blocks (see `payroll-autonomous/src/App.jsx` `const css = \`…\``). A future fix is to hash or nonce those inlines and re-enable CSP.
- `crossOriginResourcePolicy: 'cross-origin'` so the dashboard can pull PDFs and the PCN836 `.TXT` files across subdomains.

---

## 10. Secrets Management

**Required env vars** (boot fails without them):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

**Optional but recommended**:
- `API_KEYS` (comma-separated high-entropy strings ≥32 chars)
- `AUTH_MODE` (`api_key` | `disabled`)
- `ALLOWED_ORIGINS`
- `RATE_LIMIT_API_MAX`, `RATE_LIMIT_WEBHOOK_MAX`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
- `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
- `JWT_SECRET` (techno-kol-ops)
- `PCN836_ARCHIVE_DIR`
- `VAT_RATE` (default 0.17)
- `PORT`, `NODE_ENV`

Rules:
1. `.env.example` is committed. `.env` is `.gitignore`d.
2. Secrets never appear in logs. The audit_log captures only the 6-char prefix of an API key.
3. Rotation procedure is documented in `onyx-procurement/DR_RUNBOOK.md`.
4. Secrets live in the operator's password manager; they are injected via the process-supervisor env (systemd `Environment=`, Docker `--env-file`, or the hosting platform secrets store).
5. `NODE_ENV=production` flips several safeties: stack traces hidden, unsigned WhatsApp webhooks refused, rate limiter strict.

---

## 11. OWASP Top 10 (2021) Coverage Matrix

| # | Risk | Status | Notes |
|---|---|---|---|
| A01 | Broken Access Control | **Partial** | API-key gate in place, but no RBAC/object-level policies. Any valid key can read any row. L1 in ARCHITECTURE.md. Mitigated by network perimeter + audit log. |
| A02 | Cryptographic Failures | **Covered** | TLS in transit, Supabase AES-256 at rest, bcrypt for passwords (techno-kol-ops), HMAC-SHA256 on webhooks, `timingSafeEqual`. Gap: PII columns not encrypted at the column level. |
| A03 | Injection | **Covered** | Supabase client is parameterized (`.from().insert(body)`), `pg` queries use `$1,$2,…`. No dynamic `pg.query(sql + userInput)` found. Bank-statement CSV parsing uses `csv-parse`. |
| A04 | Insecure Design | **Partial** | "Never delete, only upgrade" and append-only audit log are strong design choices. Gap: some FKs use `ON DELETE CASCADE` (L11), contradicting the principle; worth tightening. |
| A05 | Security Misconfiguration | **Partial** | Helmet + CORS allowlist + strict env validation on boot. Gap: CSP disabled; techno-kol-ops has `cors: '*'` hardcoded. |
| A06 | Vulnerable/Outdated Components | **Partial** | `npm run audit:sec` script (`audit --audit-level=high`). Dependencies are modern (express 4.21, helmet 8, supabase-js 2.45). No automated Dependabot/Renovate wired yet. |
| A07 | Identification & Authentication Failures | **Partial** | Strong API-key model, bcrypt on JWT. Gaps: no key rotation workflow, no session revocation, no MFA. |
| A08 | Software & Data Integrity Failures | **Covered** | `schema_migrations` tracking + checksum on files, PCN836 file checksum in `vat_submissions`, `wage_slips` CHECK constraint on net vs gross. Supply-chain mitigation is `npm audit` + lockfile committed. |
| A09 | Security Logging & Monitoring | **Covered** | Universal `audit_log` + dedicated `payroll_audit_log` with IP/user-agent, `system_events`, pino structured logger, `unhandledRejection` handler. Gap: no SIEM forwarder yet. |
| A10 | Server-Side Request Forgery | **Covered** | Only outbound call targets are hardcoded (`graph.facebook.com`, `api.twilio.com`, `SUPABASE_URL`). No user-controlled URL fetch. Webhook inbound is HMAC-verified. |

### Additional hardening recommendations (prioritised)

1. **P0 — Align techno-kol-ops CORS** with onyx-procurement's allowlist pattern before any external exposure.
2. **P0 — Enable CSP** on the RTL dashboards by moving inline styles to static CSS files or adding SHA256 hashes.
3. **P1 — Column-level encryption for PII** (`national_id`, `bank_account_number`, `wage_slips.*_national_id`) using `pgcrypto` + a KMS-sourced DEK.
4. **P1 — RBAC** (L1): introduce `roles` + `policies` tables and an Express middleware that reads `req.actor` and denies on mismatch.
5. **P1 — Session revocation** in techno-kol-ops (L2): `user_sessions` with `revoked_at`.
6. **P2 — SIEM integration**: forward `audit_log`, `payroll_audit_log`, and `system_events` to an external log store for tamper-evidence.
7. **P2 — Automated dependency scanning**: Dependabot / Renovate across all 5 projects.
8. **P2 — Signed releases**: tag releases and verify signatures before deploy.
9. **P3 — Key rotation runbook**: script to rotate `API_KEYS`, `JWT_SECRET`, `WHATSAPP_APP_SECRET`, `SUPABASE_ANON_KEY`.
10. **P3 — Pen-test** before adding any external supplier portal.
