# AGENT-139 — Communication Providers Audit

**Scope:** Twilio (SMS), WhatsApp Business API, Israeli SMS providers (Cellact / Pelephone / InforU / 019 / Unicell). Auth, queue, idempotency, opt-out compliance.
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`

---

## 1. Inventory of comms modules (production paths)

| Module | Path | Role |
|---|---|---|
| Multi-provider SMS sender | `onyx-procurement/src/sms/send-sms.js` | 4-provider façade (Twilio, InforU, CellAct, SMSGlobal); queue, retry, audit |
| Unified IL SMS gateway | `onyx-procurement/src/comms/sms-gateway.js` | 7-provider gateway (Inforu, 019/019mobile, Unicell, SMS4Free, MessageNet, TrueDialog, Mock) |
| WhatsApp Cloud API adapter | `onyx-procurement/src/comms/whatsapp.js` | Meta Graph v19.0 adapter; templates, 24h window, tier limits |
| WhatsApp webhook handler | `onyx-procurement/src/whatsapp/whatsapp-webhook.js` | X-Hub-Signature-256 verification, status store |
| ops-centric WhatsApp bot | `techno-kol-ops/src/services/whatsappBot.ts` | Hebrew NLU bot mapping inbound msgs to pipeline actions |
| Notification service stub | `techno-kol-ops/src/services/notifications.ts` | Templates only; live wiring is `console.log` (TODO) |
| Israeli phone validator | `onyx-procurement/src/validators/phone.js` | Carrier prefix detection (Pelephone 050, We4G 051, etc.) |
| Env example (canonical) | `onyx-procurement/.env.example`, `onyx-ai/.env.example` | All provider keys documented |

Israeli mobile carrier prefix table lives in `sms-gateway.js` lines 75-86: 050=Pelephone, 051=We4G, 052=Cellcom, 053=Hot Mobile, 054=Partner, 058=Golan/Hot. **Pelephone is treated as a carrier (recipient-side), not as an SMS aggregator.** Cellact is treated as an aggregator vendor with stub adapter.

---

## 2. Twilio (SMS)

- **Adapter:** `createTwilioAdapter()` in `send-sms.js:301-325`. Cost model: ₪0.23/segment (highest, used as international fallback only).
- **Auth:** Basic auth `(TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN)` — Account SID + Auth Token from env. From-number via `TWILIO_FROM`.
- **Live mode:** Gated behind `SMS_LIVE_MODE=1` AND credentials. **Currently throws `'twilio: live-mode wiring deferred — see docs/SMS.md'`** — the HTTP request to `api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` is documented inline but not implemented. Stub returns deterministic `queued` response.
- **Status:** GAP — Twilio live HTTP wiring not implemented. Documented as deliberate deferral by Agent-75.

---

## 3. WhatsApp Business (Meta Cloud API)

- **Adapter:** `onyx-procurement/src/comms/whatsapp.js` (Agent Y123). Targets Graph API `v19.0`, host `graph.facebook.com`.
- **Auth:** Bearer token `WHATSAPP_TOKEN` (or `WHATSAPP_ACCESS_TOKEN` in onyx-ai env). Sender = `WHATSAPP_PHONE_ID` / `WHATSAPP_PHONE_NUMBER_ID`.
- **Webhook auth:** `whatsapp-webhook.js:75-92` — HMAC-SHA256 over raw body, compared against `X-Hub-Signature-256` using `crypto.timingSafeEqual`. Verify token (`WHATSAPP_VERIFY_TOKEN`) and app secret (`WHATSAPP_APP_SECRET`) both required. Returns `false` if app secret unset, blocking unsigned ingest in prod.
- **Compliance hooks:**
  - 24-hour Customer Service Window enforced (`WINDOW_MS = 86_400_000`); free-form text outside window throws `WINDOW_CLOSED` and forces template fallback.
  - Tier limits encoded (`TIER_1K/10K/100K/UNLIMITED`).
  - Template approval lifecycle (`PENDING/APPROVED/REJECTED/PAUSED/DISABLED`).
  - Opt-out keywords include Hebrew (`ביטול`, `הסר`, `עצור`, `הפסק`) + English (`stop`, `unsubscribe`, etc.).
- **Queue/idempotency:** Message ids tracked in `_statusStore` (in-memory Map keyed by `wa_message_id`); status history append-only. No outbound queue beyond Meta's API.
- **Status:** PRESENT — webhook signed & verified, opt-out enforced, append-only audit. Persistence is in-memory; restart drops status store (documented gap).

---

## 4. Israeli SMS providers

### 4.1 Inforu (default)
- **Provider:** Default (`SMS_PROVIDER=inforu`). Cost ₪0.065/segment (cheapest for IL).
- **Auth:** `INFORU_USER` + `INFORU_PASSWORD`. Sender id `INFORU_SENDER`.
- **Endpoint:** `capi.inforu.co.il/api/v2/SMS/SendSms` (gateway) or `uapi.inforu.co.il/SendMessageXml.ashx` (sender).
- **Status:** Stub only; `SMS_LIVE_MODE=1` throws `'inforu: live-mode wiring deferred'`.

### 4.2 Cellact
- **Provider:** Local IL aggregator. Cost ₪0.08/segment.
- **Auth:** `CELLACT_USER` + `CELLACT_PASSWORD` + `CELLACT_SENDER`.
- **Endpoint:** `panel.cellactpro.com/API/SendMT.ashx` (form-encoded).
- **Status:** Stub only; live wiring deferred.

### 4.3 019 Mobile / Unicell / SMS4Free / MessageNet / TrueDialog
Defined in `sms-gateway.js`:
- **019**: `www.019mobile.co.il/api/sms/send`, ₪0.055/seg, 15 msg/s.
- **Unicell**: `api.unicell.co.il/sms/send`, ₪0.058/seg, 18 msg/s.
- **SMS4Free**: free tier (90 msgs/month), ₪0.000.
- **MessageNet**: ₪0.065/seg.
- **TrueDialog**: enterprise fallback, ₪0.080/seg, 50 msg/s.
- All inherit from `_BaseProvider` whose live `send()` returns `LIVE_TRANSPORT_NOT_CONFIGURED` until injected via `injectTransport(provider, fn)`.

### 4.4 Pelephone
- **Not** wired as a sending provider. Recognised only as a destination carrier (prefix `050`). Pelephone does not expose a public B2B SMS API in Israel; sends to Pelephone subscribers route through aggregators above (Inforu/Cellact/019).
- **Status:** No outbound Pelephone adapter exists or is required.

---

## 5. Authentication summary

| Provider | Mechanism | Env vars |
|---|---|---|
| Twilio | HTTP Basic | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| WhatsApp out | Bearer token | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |
| WhatsApp webhook in | HMAC-SHA256 + verify token | `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` |
| Inforu | Basic / XML user+pass | `INFORU_USER`, `INFORU_PASSWORD`, `INFORU_SENDER` |
| Cellact | Form user+pass | `CELLACT_USER`, `CELLACT_PASSWORD`, `CELLACT_SENDER` |
| SMSGlobal | OAuth1 | `SMSGLOBAL_API_KEY`, `SMSGLOBAL_API_SECRET` |
| 019/Unicell/etc. | Per-provider (deferred) | configured via `gateway.configure({credentials})` |

The procurement env example masks Twilio cleanly with comments and documents `WHATSAPP_VERIFY_TOKEN=onyx_verify_2026` as a placeholder — should be rotated in production. `JWT_SECRET=change-this-in-production-min-32-chars` is a placeholder default that the env validator (`scripts/validate-env.js`) refuses to start on in `NODE_ENV=production`.

---

## 6. Queueing & retry

- **send-sms.js** — bounded-concurrency queue (default 4 workers, `createQueue`), `withRetry` wrapper: 3 retries, 250 ms × 2^attempt exponential backoff, `SMS_NOT_RETRYABLE` short-circuit.
- **sms-gateway.js** — token-bucket-lite per-provider rate limiter, fallback chain (`['inforu', '019mobile', 'messagenet', 'truedialog', 'sms4free']`), `bulkSend` micro-throttles by `1000/perSecond` ms gap, `sendBulk` batches with `delayMs`.
- **scheduledSend** — append-only scheduled queue (`_scheduled[]`), entries marked `_dispatched: true` rather than removed.
- **WhatsApp** — no internal queue; relies on Meta API rate limits + tier ceiling enforced via `TIER_LIMITS`. `_statusStore` provides in-memory message-id index.

---

## 7. Idempotency

- **Outbound SMS:** No client-supplied idempotency key. Each call generates a fresh `messageId` via `_uid('sms')` (`crypto.randomBytes(4)`). Re-sending an identical payload twice produces two distinct messages — caller must dedupe upstream.
- **WhatsApp outbound:** Each send produces a fresh `wamid` from Meta; no client-side idempotency.
- **WhatsApp webhook ingest:** No `messageId` dedup in `handleWebhookPayload`. Replays would re-emit status updates and append duplicate history entries to `_statusStore`.
- **HTTP API layer:** `onyx-procurement/src/resilience/idempotency-key.js` exists (key shape `${method}:${path}:${idempotencyKey}`) but is not wired into the comms send paths.
- **Status:** GAP — comms-level idempotency is absent. Webhook replays mutate state. Recommend: hash `from+text+timestamp` for inbound dedup, accept caller-supplied `Idempotency-Key` for outbound `/sms/send` and `/whatsapp/send` endpoints.

---

## 8. Opt-out compliance (חוק התקשורת §30א, amendment 40)

Both modules implement Israeli anti-spam law:

- **Keywords accepted:** `הסר`, `הסרה`, `להסיר`, `עצור`, `ביטול`, `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`.
- **Append-only ledger:** First opt-out wins. `_optOut` Map cannot delete entries; subsequent sends suppressed with `RECIPIENT_OPTED_OUT` / `{status:'suppressed', reason:'opted-out'}`.
- **Inbound auto-detection:** `handleInboundReply()` (SMS) and `handleIncoming()` (gateway/WhatsApp) parse user replies and trigger `optOut()` automatically.
- **Compliance footer:** `complianceFooter(senderName)` renders `— ${senderName}. להסרה השיבו "הסר"`. `withCompliance(text)` auto-appends footer unless body already contains opt-out keyword.
- **§30א rules enforced in `sendY122()` (sms-gateway.js):**
  - Sender name must appear in first 100 chars of marketing messages → `SENDER_IDENTIFICATION_MISSING` error.
  - Quiet hours 20:00–07:00 Asia/Jerusalem (`_isInQuietHours`) → `QUIET_HOURS` error for marketing.
  - Rolling 3-per-24h cap per recipient → `DAILY_CAP_EXCEEDED` error.
  - Transactional/urgent priority bypasses all three.
- **OTP/password-reset:** Templates flagged `allowOptOutFooter: false` so footer is not appended to time-sensitive messages.
- **Sender id:** Capped at 11 alphanumeric chars; Hebrew sender names rejected at validator (carrier limitation, documented).

**Status:** STRONG — full §30א coverage including quiet hours, daily cap, sender identification.

---

## 9. Audit & observability

- Structured append-only audit logs in both SMS modules: `accepted`, `rejected`, `suppressed`, `rate-limited`, `warning`, `OPT_OUT`, `DLR`, `BULK_DONE`, `SEND_BLOCKED_QUIET`, `SEND_BLOCKED_CAP`, etc.
- `redactBody: true` masks message body — useful for OTP/PII.
- WhatsApp webhook events appended to `logs/whatsapp-webhook.log` (jsonl).
- All entries `Object.freeze`d to prevent retroactive mutation.

---

## 10. Findings & recommendations

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| 1 | High | All live HTTP wiring deferred (Twilio, Inforu, Cellact, SMSGlobal, 019, Unicell). Stubs return `LIVE_TRANSPORT_NOT_CONFIGURED`. | Implement live HTTP path in dedicated PR; gate behind `SMS_LIVE_MODE=1` and provider creds (already plumbed). |
| 2 | Medium | No idempotency at comms layer. WhatsApp webhook replays mutate `_statusStore`. | Add `Idempotency-Key` header to outbound, dedupe webhook by `wamid` + `status` + `timestamp`. |
| 3 | Medium | In-memory state (`_optOut`, `_statusStore`, `_audit`) lost on restart. | Wire to Postgres / Supabase opt-out + audit tables; injection points already exist (`createSmsSender({optOutLedger,auditLog})`). |
| 4 | Low | `techno-kol-ops/src/services/notifications.ts` line 77 still does `console.log(...)` instead of dispatching to onyx-procurement comms. | Replace with HTTP call to `onyx-procurement` send endpoints. |
| 5 | Low | `WHATSAPP_VERIFY_TOKEN=onyx_verify_2026` placeholder in `.env.example`. | Document rotation; ensure prod uses random 32-byte token. |
| 6 | Info | Pelephone correctly modeled as recipient carrier, not aggregator. | No action. |

---

## 11. Verdict

Comms architecture is **well-designed and §30א-compliant** at the domain layer. The main production gap is the deliberate deferral of live HTTP transport for every SMS provider — every adapter is a stub today. WhatsApp webhook signature verification, opt-out, and append-only ledgers are correctly implemented. Outbound idempotency and persistent storage of opt-out / audit state are the next priorities before live rollout.
