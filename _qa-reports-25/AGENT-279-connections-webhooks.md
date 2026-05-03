# AGENT-279 — Connections #4: Webhook Inbound + Outbound Audit

Date: 2026-04-29
Worktree: `objective-merkle-40ff93`
Branch: `claude/objective-merkle-40ff93`
Scope: Per-provider audit of webhook flows (Stripe, PayPal, Tranzila, WhatsApp/Meta, Anthropic, etc.) — HMAC signature verification, idempotency, retry, replay protection.
Related: see `AGENT-140-payments.md` (payments deep-dive), `AGENT-139-comms-providers.md`.

---

## 1. Webhook Surface Inventory

### Inbound endpoints (incoming POSTs the system receives)

| Route | File | Purpose | Allowlist? |
|---|---|---|---|
| `POST /api/platform/webhooks/receive/:slug` | `api-server/src/routes/platform/webhooks-receiver.ts` | Generic integration webhook (mapped → entity) | yes (`/api/webhooks/`) |
| `POST /api/integration-hub/webhooks/:token/receive` | `api-server/src/routes/integration-hub.ts:561` | Token-based integration webhook | yes |
| `POST /api/edi/webhook/:partnerId` | `api-server/src/routes/edi.ts:413` | EDI trading partner inbound | yes |
| `POST /api/contracts/esign-webhook/:provider` | `api-server/src/routes/contract-templates.ts:417` | DocuSign / Adobe Sign / gov.il | yes |
| `POST /api/platform/messaging/webhook/whatsapp/:connectionId` | `api-server/src/routes/platform/messaging.ts:200` | WhatsApp Cloud API per-connection | yes |
| `GET  /api/platform/messaging/webhook/whatsapp/:connectionId` | same | Meta verification handshake | yes |
| `POST /api/whatsapp/webhook` | `api-server/src/routes/whatsapp-hub.ts:132` | WhatsApp inbound (legacy) | yes |
| `POST /api/whatsapp/receive-webhook` | `api-server/src/routes/whatsapp-business-engine.ts:516` | WhatsApp inbound (engine) | yes |
| `POST /webhooks/whatsapp` (Onyx) | `onyx-procurement/src/whatsapp/whatsapp-webhook.js:172` | Standalone WhatsApp module | n/a (separate process) |
| `POST /webhooks/<source>` in `onyx-ai` | `onyx-ai/src/integrations.ts:2120-2191` | Stripe / Twilio / Slack / WhatsApp / generic | n/a (not mounted into api-server) |
| `POST /api/stripe/webhook` | none mounted | Allowlisted but route does not exist → 404 | yes |
| `POST /api/sendgrid/webhook` | none mounted | Allowlisted but route does not exist → 404 | yes |
| `POST /api/twilio/webhook` | none mounted | Allowlisted but route does not exist → 404 | yes |
| `POST /api/supabase/webhook` | none mounted | Allowlisted but route does not exist → 404 | yes |
| python `WebhookReceiver.receive(...)` | `enterprise_palantir_core/app/engines/webhook_receiver.py` | In-process registry (Stripe/FedEx/Shopify/GitHub stubs) | n/a — not bound to HTTP |

Generic verification middleware: `api-server/src/lib/webhook-verify.ts` (`webhookVerifyMiddleware`). It looks up a per-path secret in `security_webhook_secrets`, verifies HMAC-SHA256 of `rawBody` from `X-Webhook-Signature`, optional replay window via `X-Webhook-Timestamp`. **Not auto-attached** in `app.ts` — must be wired in per-route. Not visible on any of the routes above.

### Outbound senders (the system pushes events out)

| Sender | File | Notes |
|---|---|---|
| Onyx outbound webhook engine | `onyx-procurement/src/webhooks/webhook-sender.js` | HMAC-SHA256 over canonical JSON, exponential backoff with jitter, dead-letter after 6 attempts, `parseRetryAfter` honored, redirect-loop guarded, **strips signature on cross-origin redirect: NO** (header is re-sent on every hop — see §6) |
| Outgoing-webhook test fire | `api-server/src/routes/platform/webhooks-management.ts:74` | Sends to subscriber URL on demand. **No HMAC signing.** Auth via static `Authorization` header only. SSRF: no URL-allowlist / private-IP guard. |
| Webhook delivery log + replay | `onyx-procurement/src/webhooks/webhook-delivery-log.js` | DB-backed, replay creates a **new** row, preserves envelope `id` |
| Subscription registry | `onyx-procurement/src/webhooks/webhook-subscriptions.js` | 32-byte base64url secret per row. SAFE_MODE blocks private hosts only when `WEBHOOKS_SAFE_MODE=true` (default off). |

---

## 2. Per-Provider Audit

### 2.1 Stripe
**Location:** `onyx-ai/src/integrations.ts:2141-2152` (handler) + `:2222-2235` (`verifyStripeSignature`).
- Signature: parses `stripe-signature` into `t=` + `v1=`, recomputes HMAC-SHA256 over `t + "." + rawBody`. Algorithm correct.
- **HMAC verify will fail in api-server because the route is NOT mounted in `api-server`** — `auth-allowlist.ts:65` exposes `/api/stripe/webhook` but no router answers it (404). Stripe webhooks are only handled inside `onyx-ai` if that service receives them directly.
- **`rawBody` capture is conditional:** `api-server/src/app.ts:1030-1037` only captures `rawBody` when `req.url` includes `/webhook/`. `onyx-ai` uses `(req as any).rawBody ?? JSON.stringify(req.body)` (line 2144). The `JSON.stringify` fallback breaks the byte-exact requirement and will reject valid signatures. **Bug.**
- **Replay protection:** `t` parsed but never checked against tolerance window. Stripe recommends 300s. **Missing.**
- **Idempotency:** No dedupe table on `event.id`. Re-deliveries (Stripe retries up to ~3 days) will run handlers twice. **Missing.**
- **Timing-safe compare:** `timingSafeEqualStr` used — OK.

### 2.2 PayPal
**No inbound webhook handler at all.** No `paypal-transmission-sig`, no `paypal-cert-url`, no `notifications/verify-webhook-signature` call anywhere in `api-server` or `onyx-ai`. PayPal charge/capture in `israeli-business-integrations.ts:1447-1521` is fully synchronous — async events (Pay Later, dispute, chargeback, subscription state change) are silently dropped. **P0 gap.**

### 2.3 Tranzila / CardCom / iCredit
**No IPN / notify_url handler.** DB stores a `webhook_url` text column on `israeli_payment_gateways` but it is never wired to an inbound route. Tranzila supports `notify_url_address`, CardCom has `WebHookUrl` in LowProfile — neither used. Any PostBack would either 404 or land on `/api/webhooks/` (allowlisted, no signature check). **P0 gap.** Refund / 3DS-step-up flows depend on these.

### 2.4 WhatsApp (Meta Cloud API)
Three implementations — pick one and consolidate:

1. `api-server/src/routes/platform/messaging.ts:200-220` — proper: looks up `appSecret` by `connectionId`, requires `x-hub-signature-256`, requires `rawBody`, rejects 401 on miss. Verification handshake at `:222-239` with `verifyToken`. **OK.**
2. `onyx-procurement/src/whatsapp/whatsapp-webhook.js:75-92` — proper HMAC-SHA256 over `X-Hub-Signature-256` with `crypto.timingSafeEqual`, GET handshake with `WHATSAPP_VERIFY_TOKEN`. **OK.**
3. `api-server/src/routes/whatsapp-hub.ts:132-156` — **NO signature verification, NO verify token, raw SQL with string-interpolated user input** (`phone_number`, `content`). Public via allowlist `/whatsapp/webhook` (line 64). **CRITICAL: SQL injection + auth bypass.** Matches `auth-allowlist.ts:64`.
4. `api-server/src/routes/whatsapp-business-engine.ts:516-552` — uses parameterized queries but **no signature check, no verify token**. Public via allowlist. Anyone can post arbitrary inbound messages.

**Replay / Idempotency:** WhatsApp sends `messages[].id`. `whatsapp-webhook.js` stores in an in-memory `_statusStore` keyed by ID, but `_remember` always appends — no dedupe before processing. messaging.ts and the api-server variants do not dedupe at all. WhatsApp Cloud API retries within ~24h on non-200 — duplicates likely.

### 2.5 Anthropic
**No webhook implementation.** The Anthropic SDK does not currently ship inbound webhook events that this codebase consumes. Outbound calls to `api.anthropic.com` exist but no callback endpoint. No matches for `x-anthropic-signature`, `anthropic.webhook`, or `anthropic-signature`. **N/A — not a gap unless Anthropic ships webhooks (e.g., for Workbench or Agent SDK delivery callbacks). Track upstream.**

### 2.6 Slack
`onyx-ai/src/integrations.ts:2169-2185` — `verifySlackSignature` over `v0:<ts>:<rawBody>` HMAC-SHA256 (line 2248-2256). Replay window — **not enforced** (Slack recommends 5 min check on `x-slack-request-timestamp`). url_verification challenge handled. Mounted only inside `onyx-ai` router (not in api-server).

### 2.7 Twilio
`onyx-ai/src/integrations.ts:2155-2166` + `:2237-2246`. HMAC-SHA1 over URL+sorted-params, base64. Algorithm matches Twilio spec. No mount in api-server.

### 2.8 GitHub / Shopify / FedEx (registered in palantir python receiver)
`enterprise_palantir_core/app/engines/webhook_receiver.py` — clean abstraction: `verify_signature` uses `hmac.compare_digest`, idempotency-key set with TTL GC. **But not bound to any FastAPI/HTTP route in this repo** — it is a library. No HTTP entry point.

### 2.9 DocuSign / Adobe Sign / gov.il
`api-server/src/routes/contract-templates.ts:339-415` — per-provider `verifyDocuSignWebhook` / `verifyAdobeSignWebhook` / `verifyGovIlWebhook`. Uses `rawBody` correctly. Default branch (unknown provider) requires `ESIGN_WEBHOOK_SECRET` env or rejects. Timing-safe compare via `timingSafeHexCompare`. **OK.**

### 2.10 EDI partners
`api-server/src/routes/edi.ts:413-446` — requires `partner.webhookSecret`, decrypts via `decryptEdiSecret`, verifies `x-edi-signature`. **No replay protection, no idempotency on the EDI control number** — duplicate POSTs with the same `ISA13` will create duplicate transactions.

### 2.11 Generic platform receiver
`api-server/src/routes/platform/webhooks-receiver.ts` (the slug-based receiver) compares `req.headers["x-webhook-secret"]` to `webhook.webhookSecret` with **`!==` plain-string equality** (line 607 of `integration-runtime.ts`). This is **timing-attack-leakable.** Should use `crypto.timingSafeEqual`. Also no replay window, no signature (it's bearer-secret only), no idempotency.

### 2.12 Integration-hub token receiver
`api-server/src/routes/integration-hub.ts:561-596` — also plain `sig !== wh.secret` equality. Same timing-leak issue. No replay, no idempotency.

---

## 3. Outbound Webhook Sender — `webhook-sender.js`

Strengths:
- HMAC-SHA256 in `X-Signature` (hex). `signPayload` signs the EXACT bytes that are sent (`JSON.stringify(envelope)`).
- 10-second per-attempt timeout via `AbortController`.
- Exponential backoff with 30 % jitter, capped 60 s, 6 attempts max → dead-letter.
- Honors `Retry-After` on 429 (delta-seconds OR HTTP-date), capped at 5 minutes (anti-DoS).
- Manual redirect handling (3 hops max), only http/https schemes.
- Returns structured result, **never throws**.
- `verifySignature` reference for subscribers uses `crypto.timingSafeEqual`.

Gaps:
- **Signature header re-sent on cross-origin redirects.** `_postOnce` follows `Location` and resubmits headers including `X-Signature`. If a subscriber redirects to a third-party host, the secret-derived signature leaks. Should strip `X-Signature` (and `Authorization`-style headers) when the origin changes. The header-comment claims this is done — **the implementation does not strip.**
- **No SSRF guard.** `validateUrl` in `webhook-subscriptions.js` only blocks private hosts when `WEBHOOKS_SAFE_MODE=true`; default off. Outbound POSTs can target `127.0.0.1`, `169.254.169.254` (cloud metadata), etc. Compare with `api-server/src/lib/integration-runtime.ts:24-114` which has a proper allow-list-style SSRF guard (BLOCKED_HOSTS + IPv4/IPv6 private-range checks + DNS resolution) — **the outbound webhook path does NOT use it.**
- **No replay timestamp header.** Subscribers cannot distinguish a fresh delivery from a replay attack; they must dedupe by `X-Event-Id` only (envelope.id). Adding `X-Signature-Timestamp` and signing `ts.body` (Stripe-style) would close that.
- **`_guessAttempts` returns `maxAttempts` on any failure** — the audit row therefore overstates attempts when an early terminal (e.g. 404) is hit. Cosmetic but misleading.
- **`outgoing-webhooks/:id/test`** in `webhooks-management.ts:74-150` (the test-fire) does **NOT** sign with HMAC (only sends static auth header). Test-fired endpoints will not match production verification expectations.

Retry / DLQ semantics:
- Retryable status set: `408, 425, 429, 500, 502, 503, 504`. Other 4xx terminal. Correct.
- `webhook-delivery-log.js` documents an at-least-once trail — pending row inserted before HTTP fire (good, survives crash). Replay creates a new row, preserves `event_id` for downstream dedupe.

---

## 4. Idempotency

| Location | Backend | Notes |
|---|---|---|
| `onyx-procurement/src/resilience/idempotency-key.js` | In-memory `Map`, 24 h TTL | Stripe-style `Idempotency-Key`. Single-process — needs Redis for multi-instance. **Not mounted on payment routes** (see AGENT-140 §7). |
| `enterprise_palantir_core/app/engines/webhook_receiver.py:133-147` | In-memory dict | Per-connector, replay-window GC. Good. **Not bound to HTTP.** |
| api-server inbound webhooks | none | No dedupe layer for Stripe/Meta/EDI/Tranzila etc. Re-deliveries process twice. |
| Outbound senders | `event_id` carried in envelope; subscribers responsible | Acceptable design but undocumented for subscribers. |

---

## 5. Replay Protection

| Provider | Tolerance window | Status |
|---|---|---|
| Stripe (`onyx-ai`) | should be 300 s | **NOT enforced** — `t` parsed, never compared |
| Slack (`onyx-ai`) | should be 300 s | **NOT enforced** |
| Generic `webhookVerifyMiddleware` | `WEBHOOK_REPLAY_WINDOW_SEC` (default 300 s) | **OK**, but middleware not actually wired into routes |
| Palantir python receiver | `replay_window_seconds=300` | OK in the library, but library is not on HTTP |
| WhatsApp / Meta | (Meta does not send a timestamp header) | n/a — relies on `id` dedupe |
| EDI / DocuSign / Adobe Sign / gov.il | none | **Missing** |
| Tranzila / CardCom / PayPal | n/a (no handler at all) | **Missing** |

---

## 6. Issues Summary (priority-ranked)

**P0 — security / data-integrity:**
1. `whatsapp-hub.ts:132` — public webhook with **string-interpolated SQL** + no signature + no auth → SQLi + spoofed inbound messages. Remove or rewrite (use parameterized queries + `verifyWhatsAppSignature`).
2. `whatsapp-business-engine.ts:516` — public, no signature check; anyone can post fake inbound WhatsApp.
3. Stripe `rawBody` fallback `?? JSON.stringify(req.body)` (`onyx-ai/src/integrations.ts:2144`) breaks signature verification. Mount `express.raw({type:'application/json'})` for `/api/stripe/webhook` and remove the fallback.
4. No PayPal / Tranzila / CardCom IPN receivers — async outcomes lost.
5. Outbound `webhook-sender.js` does not strip signature/auth headers on cross-origin redirect — secret-derived material leaks. Also no SSRF guard on outbound URL.
6. `webhooks-receiver.ts` and `integration-hub.ts:574` use `secret !== wh.secret` (non-constant-time). Replace with `crypto.timingSafeEqual` over equal-length buffers.

**P1 — reliability:**
7. Allowlist `/api/stripe/webhook`, `/api/sendgrid/webhook`, `/api/twilio/webhook`, `/api/supabase/webhook` are exposed but **no router answers them** — every legitimate event 404s. Either mount handlers or remove from allowlist.
8. Replay tolerance not enforced for Stripe, Slack, EDI, e-sign providers.
9. No event-ID idempotency for Stripe / Meta / EDI inbound paths — duplicate processing on provider retries.
10. `webhookVerifyMiddleware` (a generic, well-built per-path verifier) is NEVER mounted in `app.ts`. Either wire it to the platform receiver routes or delete it.
11. `webhook-sender.js` — `_guessAttempts` overstates attempts in the audit log on terminal failures.
12. Outgoing-webhook test fire (`webhooks-management.ts:74`) does not sign payload — production behaviour mismatch.

**P2 — hygiene:**
13. `WEBHOOKS_SAFE_MODE=false` by default in subscription validation — flip the default to true in production env templates.
14. Consolidate three WhatsApp inbound implementations (messaging.ts, whatsapp-hub.ts, whatsapp-business-engine.ts) — pick the messaging.ts variant and remove the others.
15. `enterprise_palantir_core/app/engines/webhook_receiver.py` has clean idempotency + signature semantics but is unused — either bind it to a FastAPI router or delete.

---

## 7. Recommendations

1. **Single inbound gateway.** Mount one router (`/api/webhooks/<provider>`) with `express.raw({type:'application/json'})` so each provider gets verifiable `rawBody`. Move the per-provider verify functions out of `onyx-ai` and into `api-server/src/lib/webhook-verifiers/<provider>.ts`.
2. **Persistent dedupe table.** `webhook_event_seen (provider, external_event_id, received_at)` with unique index; insert on receive, fast-path 200 on conflict.
3. **Replay window enforcement.** Reject events whose provider-supplied timestamp is > 300 s old (Stripe `t`, Slack `x-slack-request-timestamp`, custom `X-Webhook-Timestamp`).
4. **Outbound: strip auth/signature headers across origin changes**, signed timestamp header (`X-Signature-Timestamp`) signed in payload (Stripe-style), SSRF allow-list reuse from `integration-runtime.ts`.
5. **Constant-time compare everywhere.** Replace `===` / `!==` on secrets in `integration-runtime.ts:607`, `integration-hub.ts:574`, anywhere a webhook secret is checked.
6. **Wire `webhookVerifyMiddleware`** to `/api/platform/webhooks/receive/:slug` and `/api/integration-hub/webhooks/:token/receive`.
7. **Delete or fix** the dead allowlist entries (`/api/stripe/webhook`, `/api/sendgrid/webhook`, `/api/twilio/webhook`, `/api/supabase/webhook`).
8. **Add IPN handlers** for PayPal, Tranzila, CardCom (each with the provider's documented signature scheme).
9. **Remove `whatsapp-hub.ts:132` and `whatsapp-business-engine.ts:516`** — keep only `messaging.ts`.

---

## 8. Key File References

- `api-server/src/lib/webhook-verify.ts` (110-165)
- `api-server/src/lib/integration-runtime.ts` (595-754, processInboundWebhook + SSRF helpers 24-143)
- `api-server/src/routes/platform/webhooks-receiver.ts` (entire file, 32 lines)
- `api-server/src/routes/platform/webhooks-management.ts` (74-150 — outbound test, no HMAC)
- `api-server/src/routes/integration-hub.ts` (561-596 — bearer-secret receiver)
- `api-server/src/routes/edi.ts` (413-446)
- `api-server/src/routes/contract-templates.ts` (305-415 — eSign verify)
- `api-server/src/routes/platform/messaging.ts` (200-239 — WhatsApp signed)
- `api-server/src/routes/whatsapp-hub.ts` (132-156 — UNSIGNED + SQLi)
- `api-server/src/routes/whatsapp-business-engine.ts` (516-552 — UNSIGNED)
- `api-server/src/middleware/auth-allowlist.ts` (62-69)
- `api-server/src/app.ts` (1030-1046 — rawBody capture + CSRF skip)
- `onyx-ai/src/integrations.ts` (2120-2256 — Stripe/Slack/Twilio/WhatsApp verifiers)
- `onyx-procurement/src/webhooks/webhook-sender.js` (entire file — outbound)
- `onyx-procurement/src/webhooks/webhook-delivery-log.js` (replay + DLQ)
- `onyx-procurement/src/webhooks/webhook-subscriptions.js` (URL validation, secret gen)
- `onyx-procurement/src/whatsapp/whatsapp-webhook.js` (verifySignature + verify-token handshake)
- `onyx-procurement/src/resilience/idempotency-key.js` (Stripe-style middleware, in-memory)
- `enterprise_palantir_core/app/engines/webhook_receiver.py` (Python registry, unused)

Cross-references: `_qa-reports-25/AGENT-140-payments.md` covers Stripe/PayPal/Tranzila/CardCom payment flows in depth; this report covers their **webhook** dimension specifically and additionally audits non-payment webhook plumbing (EDI, e-sign, WhatsApp, Slack, Twilio, generic platform/integration-hub receivers) and the outbound `webhook-sender.js` engine.
