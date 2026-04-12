# SMS Notification Subsystem

Agent-75 — Onyx Procurement notification subsystem.

This module adds an **append-only** SMS notification layer to
`onyx-procurement`. It ships six Hebrew templates, four pluggable
provider adapters (Twilio, InforU, CellAct, SMSGlobal), a queue
with retry/back-off, sliding-window rate limiting, a Hebrew opt-out
ledger ("הסר"), delivery receipt plumbing, a redactable audit log
and rough cost estimation per provider.

> **Nothing is deleted.** The audit log and opt-out ledger are
> append-only by design. Upstream callers may add more templates,
> providers, or metadata — but no existing entity is removed or
> mutated after the fact.

---

## 1. Layout

```
src/sms/
├── sms-templates.js        # Hebrew templates + segment math
├── sms-templates.test.js   # node:test suite for both modules
├── send-sms.js             # sender, providers, queue, rate limit, audit
└── docs/
    └── SMS.md              # this file
```

The module is pure CommonJS and has **zero runtime dependencies**
outside Node 20+ built-ins. No `npm install` step is required.

---

## 2. Templates

All templates are authored in Hebrew. Placeholders look like
`{{name}}` and are substituted by `renderTemplate(id, vars)`.

| Template ID          | Body (with placeholders)                                      | Vars              | Category        | Opt-out footer allowed |
| -------------------- | ------------------------------------------------------------- | ----------------- | --------------- | ---------------------- |
| `otp-code`           | `קוד האימות שלך: {{code}}. בתוקף ל-5 דקות.`                    | `code`            | `otp`           | No                     |
| `wage-slip-ready`    | `תלוש השכר לחודש {{month}} מוכן. היכנסו ל-{{url}}`              | `month`, `url`    | `transactional` | Yes                    |
| `payment-received`   | `תודה! קיבלנו תשלום של ₪{{amount}}`                            | `amount`          | `transactional` | Yes                    |
| `appointment-reminder` | `תזכורת: פגישה מחר ב-{{time}} - {{subject}}`                | `time`, `subject` | `reminder`      | Yes                    |
| `alert`              | `⚠️ התראה: {{message}}`                                       | `message`         | `alert`         | No                     |
| `password-reset`     | `לאיפוס סיסמה: {{link}} (בתוקף לשעה)`                          | `link`            | `transactional` | No                     |

### Segment math

Hebrew is outside GSM-7, so every template here is billed at the
Unicode SMS rate:

* **Unicode single segment:** 70 chars
* **Unicode concatenated segment:** 67 chars per part
* **Hard cap (enforced):** 160 chars — `renderTemplate` emits a
  warning if a rendered body crosses 70 chars and surfaces a hard
  warning above 160.

`estimateSegments(text)` returns `{ chars, gsm7Chars, segments,
unicode }` so upstream analytics can report per-message segment
count without re-parsing the body.

### Example

```js
const { renderTemplate } = require('./sms-templates');

const { body, segments, chars, warnings } = renderTemplate('otp-code', {
  code: '987654',
});
// body      = 'קוד האימות שלך: 987654. בתוקף ל-5 דקות.'
// segments  = 1
// chars     = 39
// warnings  = []
```

---

## 3. Providers

Four stub adapters ship out of the box. Each adapter speaks the same
contract:

```js
adapter.send({ to, body, senderName, metadata }) => Promise<{
  id,       // provider message id
  status,   // 'queued' | 'sent' | 'delivered' | 'failed'
  raw,      // raw provider response (opaque)
}>
```

| Provider     | Env credentials                                  | Sender env          | Avg ₪/segment | Notes                               |
| ------------ | ------------------------------------------------ | ------------------- | ------------- | ----------------------------------- |
| `twilio`     | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`        | `TWILIO_FROM`       | 0.23          | International SMS; high IL cost.    |
| `inforu`     | `INFORU_USER`, `INFORU_PASSWORD`                  | `INFORU_SENDER`     | 0.065         | Local IL aggregator. Default.       |
| `cellact`    | `CELLACT_USER`, `CELLACT_PASSWORD`                | `CELLACT_SENDER`    | 0.08          | Local IL aggregator.                |
| `smsglobal`  | `SMSGLOBAL_API_KEY`, `SMSGLOBAL_API_SECRET`       | `SMSGLOBAL_SENDER`  | 0.18          | International aggregator.           |

### Stub vs live mode

By default **every adapter is a stub**. Each `send()` call returns
a synthetic message id without hitting the network. This is the
configuration the test suite relies on.

Set `SMS_LIVE_MODE=1` to enable live mode. In live mode the adapter
validates its credentials and **throws** with a descriptive error:

```
twilio: live-mode wiring deferred — see docs/SMS.md
```

The HTTP wiring per provider is documented inline in `send-sms.js`.
The wiring was intentionally deferred to keep Agent-75 a pure
deliverable without making outbound network calls. Add the live
implementation in a follow-up PR — the shared `send()` contract and
the retry/rate-limit plumbing around it are already in place.

### Switching providers

The active provider is picked in this order:

1. `opts.provider` passed to `createSmsSender()`
2. `SMS_PROVIDER` environment variable
3. Default `inforu`

Callers may override per-message by passing `provider: 'twilio'` to
`sender.send({...})`.

---

## 4. Phone validation

Israeli phones are accepted in any of the following forms:

| Input             | Normalized       |
| ----------------- | ---------------- |
| `050-1234567`     | `+972501234567`  |
| `0501234567`      | `+972501234567`  |
| `+972-50-1234567` | `+972501234567`  |
| `+972501234567`   | `+972501234567`  |

The regex only accepts **exactly** 9 digits after the national
trunk (`0`), so `05012345678` (10 digits) and `050123456` (8
digits) both fail. `normalizePhone(null)` returns `null`.

Landlines pass `isValidIsraeliPhone(...)` but only **05X** numbers
pass `isMobileNumber(...)`. The sender rejects non-mobile numbers
with `SMS_NOT_MOBILE` before ever queueing a job.

---

## 5. Sender name

Carrier rules cap alphanumeric sender names at **11 characters**.
`normalizeSenderName(name)` accepts `^[A-Za-z0-9]{1,11}$` and
rejects everything else with `null`. The sender falls back to the
`SMS_SENDER_NAME` env (default `OnyxProc`) when the caller does
not supply one. A non-fatal `warning` audit entry is recorded when
an explicit but invalid sender name is passed.

Hebrew sender names require carrier approval and are **not** routed
through this validator — pass them as raw `metadata` to the adapter
and handle them on the provider side.

---

## 6. Rate limiting

Two sliding-window limiters run per sender instance:

| Scope          | Env var              | Default | Key                           |
| -------------- | -------------------- | ------- | ----------------------------- |
| Per phone      | `SMS_RATE_PER_NUM`   | 3       | `num:<E164>`                  |
| Per campaign   | `SMS_RATE_CAMPAIGN`  | 60      | `campaign:<campaignId>`       |

Both windows are rolling 60 seconds. When a cap is exceeded, the
sender throws `SMS_RATE_LIMITED` with `scope: 'per-number' |
'per-campaign'` and `resetAt: <epoch ms>` so callers can requeue.

The limiter is in-process only. Multi-process deployments should
swap the store by passing `createSmsSender({ rateLimiter: ... })`.

---

## 7. Opt-out

Israeli spam law (Communications Law, amendment 40) mandates an
opt-out path. The ledger recognizes:

* Hebrew: `הסר`, `הסרה`, `להסיר`
* English: `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`

Inbound replies are passed to `sender.handleInboundReply({ from,
body, campaignId })`. The number is normalized, the opt-out flag is
recorded (with timestamp + keyword), and **it cannot be deleted**.
The sender will suppress every subsequent message to an opted-out
number and return `{ status: 'suppressed', reason: 'opted-out' }`.

OTP and password-reset templates are flagged with
`allowOptOutFooter: false` so the caller does not append an
unsubscribe footer to time-sensitive messages.

---

## 8. Delivery receipts

When a provider calls your webhook with a status update, forward it
to the sender:

```js
sender.handleDeliveryReceipt({
  providerMessageId: 'inforu_...',
  status: 'delivered',
  raw: providerPayload,
});
```

The registry stores `{ status, at, updatedAt, raw }` keyed by
`providerMessageId`. `sender.getDeliveryReceipt(id)` returns the
record. History is append-only — `status` is updated in place but
the original `at` timestamp is preserved.

---

## 9. Audit log

Every send path — `accepted`, `rejected`, `suppressed`,
`rate-limited`, `warning` — records a structured entry. Entries
include:

```js
{
  ts, status, phone, provider, senderName, campaignId,
  templateId, body, segments, chars, unicode,
  estCostILS, providerMessageId, attempts, warnings,
}
```

Pass `redactBody: true` to `createSmsSender` (or
`createAuditLog`) to mask the `body` field in every entry with
`[REDACTED]` — useful when the sender is running on a host with
log shipping and the body may contain PII (OTP codes, links, etc.).

Query helpers:

```js
sender.getAuditLog({ phone, provider, campaignId, status });
sender.totalEstimatedCostILS();
```

The log is in-process. To persist across restarts, replace the
default with `createSmsSender({ auditLog: yourStore })` — any
object exposing `{ record, query, count }` is accepted.

---

## 10. Cost tracking

`estimateCostILS(provider, segments)` returns a rough ILS estimate
using the per-segment rates listed in the providers table above.
The numbers are **averages only**; real billing depends on route,
volume tier, and contract. Use them for:

* Pre-send budget checks
* Monthly cost projections
* Picking the cheapest provider for a given campaign

`sender.totalEstimatedCostILS()` sums the `estCostILS` field of
every `accepted` audit entry, so the running total is always
available without re-traversing provider logs.

---

## 11. Queue + retry

Every `sender.send(...)` is enqueued on a bounded-concurrency
queue (default 4 workers). The per-message `adapter.send` call is
wrapped in `withRetry`:

* Default 3 retries
* Exponential back-off (250 ms × 2^attempt)
* Retryable filter — throws flagged with `err.code =
  'SMS_NOT_RETRYABLE'` are passed through immediately.

`sender.sendBulk(inputs)` fans out a list and returns a
`Promise.allSettled`-style array `[{ index, ok, ... }]` — one per
input, in the same order.

Queue internals are exposed on `sender._internals.queue.size()` for
health checks.

---

## 12. Usage example

```js
const { createSmsSender } = require('./send-sms');

const sms = createSmsSender({
  provider: 'inforu',
  senderName: 'OnyxProc',
  perNumberLimit: 3,
  perCampaignLimit: 60,
});

// 1. Transactional — OTP
const otp = await sms.send({
  to: '050-1234567',
  templateId: 'otp-code',
  vars: { code: '987654' },
});
console.log(otp);
// { status: 'accepted', providerMessageId: 'inforu_...', segments: 1, estCostILS: 0.07 }

// 2. Bulk — campaign
const results = await sms.sendBulk([
  { to: '052-1111111', templateId: 'wage-slip-ready', vars: { month: '03/2026', url: 'https://onyx.example/p/1' }, campaignId: 'payroll-mar-26' },
  { to: '054-2222222', templateId: 'wage-slip-ready', vars: { month: '03/2026', url: 'https://onyx.example/p/2' }, campaignId: 'payroll-mar-26' },
]);

// 3. Opt-out — inbound reply from the provider webhook
sms.handleInboundReply({ from: '054-2222222', body: 'הסר' });

// 4. Cost check
console.log(sms.totalEstimatedCostILS());
```

---

## 13. Testing

Run the node-test-runner suite from the repo root:

```bash
node --test src/sms/sms-templates.test.js
```

The suite is self-contained — no providers are hit, no network
traffic is generated, and no files are written. Coverage includes:

* Template registry integrity
* Segment math on ASCII and Hebrew
* Template render with missing/unknown vars
* Israeli phone normalization (valid/invalid/edge cases)
* Sender name validation
* Rate limiter (sliding window)
* Opt-out ledger (Hebrew + English keywords)
* Queue concurrency bound
* `withRetry` happy/retry/give-up paths
* End-to-end `sender.send`, `sender.sendBulk`
* All four provider stubs
* Audit log and delivery receipt registry

---

## 14. Environment variables — summary

| Variable                    | Default      | Description                              |
| --------------------------- | ------------ | ---------------------------------------- |
| `SMS_PROVIDER`              | `inforu`     | Active provider id.                      |
| `SMS_SENDER_NAME`           | `OnyxProc`   | Default alphanumeric sender name.        |
| `SMS_LIVE_MODE`             | *unset*      | `1` enables live provider calls.         |
| `SMS_RATE_PER_NUM`          | `3`          | Max msgs / 60s / phone.                  |
| `SMS_RATE_CAMPAIGN`         | `60`         | Max msgs / 60s / campaignId.             |
| `TWILIO_ACCOUNT_SID`        | —            | Twilio account SID.                      |
| `TWILIO_AUTH_TOKEN`         | —            | Twilio auth token.                       |
| `TWILIO_FROM`               | —            | Twilio From number / sender.             |
| `INFORU_USER`               | —            | InforU user.                             |
| `INFORU_PASSWORD`           | —            | InforU password.                         |
| `INFORU_SENDER`             | —            | InforU sender id.                        |
| `CELLACT_USER`              | —            | CellAct user.                            |
| `CELLACT_PASSWORD`          | —            | CellAct password.                        |
| `CELLACT_SENDER`            | —            | CellAct sender id.                       |
| `SMSGLOBAL_API_KEY`         | —            | SMSGlobal API key.                       |
| `SMSGLOBAL_API_SECRET`      | —            | SMSGlobal API secret.                    |
| `SMSGLOBAL_SENDER`          | —            | SMSGlobal sender id.                     |

---

## 15. Compliance checklist

* [x] Israeli phone validation (05X mobiles enforced for sends)
* [x] Hebrew opt-out keyword recognition (`הסר`)
* [x] Opt-out suppression on subsequent sends
* [x] Audit log with redactable PII
* [x] Rate limiting per number + per campaign
* [x] OTP + password-reset carry **no** opt-out footer
* [x] Delivery receipts tracked by provider message id
* [x] Append-only ledgers (no deletes anywhere)

---

## 16. Roadmap

Not in this deliverable but ready to wire on top:

* Live provider HTTP wiring (Twilio / InforU / CellAct / SMSGlobal)
* Redis-backed rate limiter for multi-process setups
* Postgres-backed audit log + opt-out ledger
* Inbound reply signature verification per provider
* Template i18n (English / Arabic variants)
* Per-template cost reports and dashboards
