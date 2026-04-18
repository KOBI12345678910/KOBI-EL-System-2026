# ONYX Webhooks — Subscriber Guide

> Agent-80 — Webhook Delivery System
> Module path: `src/webhooks/`

This document is the **subscriber-facing contract** for consuming
outbound webhooks from ONYX (procurement / payroll / tax platform).
It is the source of truth for external partners integrating with
the ONYX event stream.

---

## 1. Overview

ONYX publishes domain events (invoice created, VAT submitted, PO
approved, etc.) to any number of HTTPS endpoints you register as
**subscriptions**. Each delivery is:

- An HTTPS `POST` with a JSON envelope in the body.
- Signed with **HMAC-SHA256** in the `X-Signature` header.
- Retried up to **6 times** with exponential backoff on transient
  failures, then moved to a **dead-letter** state that operators
  can inspect or **replay**.

Delivery is **at-least-once**: you must design your consumer to be
idempotent on `envelope.id`.

---

## 2. The envelope

Every delivery carries exactly this shape:

```json
{
  "id": "evt_17123456789_ab12cd34",
  "type": "invoice.paid",
  "version": 1,
  "created_at": "2026-04-11T14:30:00.000Z",
  "data": {
    "invoice_id": "inv_1234",
    "paid_at": "2026-04-11T14:30:00.000Z",
    "payment_id": "pay_9876",
    "amount": 1170.00
  }
}
```

| Field        | Type   | Description                                                |
|--------------|--------|------------------------------------------------------------|
| `id`         | string | Unique per logical event. **Use for idempotency.**         |
| `type`       | string | Event type from the registry (see §5).                     |
| `version`    | int    | Schema version of the payload. Bumps when `data` changes.  |
| `created_at` | string | ISO-8601 timestamp (UTC).                                  |
| `data`       | object | Domain-specific payload. Shape depends on `type`+`version`. |

---

## 3. Headers we send

| Header                | Example                                  | Purpose                                    |
|-----------------------|------------------------------------------|--------------------------------------------|
| `Content-Type`        | `application/json`                       |                                            |
| `User-Agent`          | `onyx-webhooks/1.0 (+https://onyx.local)`|                                            |
| `X-Signature`         | `b3a1...` (64 hex chars)                 | HMAC-SHA256 of the raw body.               |
| `X-Signature-Alg`     | `hmac-sha256`                            | Algorithm tag — pin for forward-compat.    |
| `X-Event-Id`          | `evt_...`                                | Mirrors `envelope.id`.                     |
| `X-Event-Type`        | `invoice.paid`                           | Mirrors `envelope.type`.                   |
| `X-Event-Version`     | `1`                                      | Mirrors `envelope.version`.                |
| `X-Delivery-Attempt`  | `1`, `2`, ...                            | 1-based attempt counter (see §6).          |
| `X-Replay-Of`         | (optional) original `delivery.id`        | Present only on admin-triggered replays.   |

---

## 4. Verifying signatures (REQUIRED)

You **must** verify `X-Signature` on every delivery. The signature is
`HMAC-SHA256(rawBody, secret)` encoded as lower-case hex.

**Critical:** you must verify against the **raw request bytes** — not
a re-serialized copy of the parsed body. JSON re-serialization can
reorder keys and change whitespace, which will invalidate the
signature even when nothing was tampered with.

### Node.js (reference implementation)

```js
const crypto = require('crypto');

function verifySignature(body, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

Use `crypto.timingSafeEqual` (constant-time compare) — do **not**
use `===`, which leaks information via timing.

### Express app

```js
// IMPORTANT: capture raw body with express.json's verify hook.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

app.post('/my-hook', (req, res) => {
  const sig = req.headers['x-signature'];
  if (!sig || !verifySignature(req.rawBody, sig, process.env.ONYX_WEBHOOK_SECRET)) {
    return res.status(401).send('invalid signature');
  }
  // ... handle req.body ...
  res.status(200).end();
});
```

### Python (Flask)

```python
import hmac, hashlib
from flask import request, abort

def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

@app.post("/my-hook")
def hook():
    sig = request.headers.get("X-Signature", "")
    if not verify_signature(request.get_data(), sig, ONYX_SECRET):
        abort(401)
    # ... handle request.get_json() ...
    return "", 200
```

### Ruby (Rack)

```ruby
require 'openssl'

def verify(body, sig, secret)
  expected = OpenSSL::HMAC.hexdigest('sha256', secret, body)
  Rack::Utils.secure_compare(expected, sig)
end
```

---

## 5. Event types

| Type                             | Category    | PII | Description                          |
|----------------------------------|-------------|-----|--------------------------------------|
| `invoice.created`                | invoice     | no  | חשבונית נוצרה                        |
| `invoice.paid`                   | invoice     | no  | חשבונית שולמה                        |
| `invoice.cancelled`              | invoice     | no  | חשבונית בוטלה                        |
| `wage_slip.issued`               | payroll     | **yes** | תלוש שכר הונפק                  |
| `wage_slip.voided`               | payroll     | **yes** | תלוש שכר בוטל                   |
| `vat_export.submitted`           | tax         | no  | דוח מע"מ הוגש                        |
| `bank_reconciliation.completed`  | treasury    | no  | התאמת בנק הושלמה                     |
| `po.approved`                    | procurement | no  | הזמנת רכש אושרה                      |
| `po.delivered`                   | procurement | no  | הזמנת רכש התקבלה                     |
| `payment.received`               | payment     | no  | תשלום התקבל                          |
| `annual_tax.filed`               | tax         | no  | דוח שנתי הוגש                        |
| `user.login.failed`              | security    | **yes** | כשלון בכניסת משתמש              |

Subscribe to all events with `["*"]`, or list specific types:

```json
{ "events": ["invoice.paid", "po.approved"] }
```

For each event's sample payload, see
`src/webhooks/webhook-events.js → EVENT_REGISTRY`.

---

## 6. Retry policy

| Setting              | Value                                       |
|----------------------|---------------------------------------------|
| Timeout per attempt  | **10 s**                                    |
| Max attempts         | **6** (then dead-letter)                    |
| Backoff              | exponential (0.5 s, 1 s, 2 s, 4 s, 8 s, 16 s) with 0–30% jitter, capped at 60 s |
| Redirects followed   | **up to 3**                                 |
| `Retry-After` (429)  | honored, capped at 5 min                    |

A delivery is considered **transient** (and retried) on:

- Network errors (DNS, TCP, TLS)
- Request timeouts (`AbortError`)
- HTTP status `408`, `425`, `429`, `500`, `502`, `503`, `504`

A delivery is considered **terminal** (and NOT retried) on:

- Any other `4xx` (including `401`, `403`, `404`, `410`)
- Redirect loop (more than 3 hops)
- Invalid URL, scheme, or malformed Location header

On success we expect `HTTP 200–299`. Your handler should:

1. Verify the signature.
2. Persist the raw envelope (or at least `envelope.id`).
3. Acknowledge with `200 OK` **as fast as possible** (< 10 s).
4. Do the slow work asynchronously.

---

## 7. Dead-letter and replay

After 6 consecutive failures, the delivery row is marked
`last_status = 'dead_letter'` in `webhook_deliveries`. Operators can
inspect and replay it:

- `GET /api/webhooks/deliveries?status=dead_letter`
- `GET /api/webhooks/deliveries/:id`
- `POST /api/webhooks/deliveries/:id/replay` (admin only)

Replay creates a **new** delivery row so the history is preserved.
The replayed request carries the original `envelope.id` plus an
`X-Replay-Of` header pointing to the original delivery ID — this is
the signal for your consumer to run its idempotency check rather
than processing the event a second time.

---

## 8. Subscription management

All mutating endpoints require the admin token header
`X-Admin-Token: <WEBHOOKS_ADMIN_TOKEN>`.

### Create

```http
POST /api/webhooks/subscriptions
X-Admin-Token: ...
Content-Type: application/json

{
  "url":         "https://partner.example.com/onyx-webhook",
  "events":      ["invoice.paid", "payment.received"],
  "description": "Partner X billing integration"
}
```

Response:

```json
{
  "subscription": {
    "id": "uuid",
    "url": "https://partner.example.com/onyx-webhook",
    "events": ["invoice.paid", "payment.received"],
    "secret": "***",
    "active": true
  },
  "secret_plaintext": "base64url-string-64-chars...",
  "warning": "store this secret now — it will not be shown again in list/detail responses"
}
```

**The plaintext secret is returned exactly once**, at creation or
rotation. Store it immediately in your secrets manager.

### List / detail

```http
GET /api/webhooks/subscriptions
GET /api/webhooks/subscriptions/:id
```

### Update

```http
PATCH /api/webhooks/subscriptions/:id
X-Admin-Token: ...
Content-Type: application/json

{ "active": false }
```

Also supports `url`, `events`, `description`, and
`{ "rotate_secret": true }` which returns a fresh
`secret_plaintext` (and invalidates the previous one).

### Delete

```http
DELETE /api/webhooks/subscriptions/:id
X-Admin-Token: ...
```

This is a **soft delete** (sets `active = false`). Delivery history
and audit logs remain queryable.

---

## 9. Test receiver (development)

For local end-to-end testing, set
`WEBHOOKS_ENABLE_TEST_ECHO=true` and point a subscription at
`POST /api/webhooks/test-echo?secret=<your-secret>`.

- The receiver echoes the request body and headers.
- Pass `?secret=...` to have the server also verify the signature
  for you and return `signature_valid: true/false`.
- `GET /api/webhooks/test-echo` returns the last 25 echoed
  requests (in-memory ring buffer).

This endpoint is **disabled in production by default**.

---

## 10. Security checklist for subscribers

- [ ] TLS on your endpoint (HTTPS only — we refuse `http://` in
      `WEBHOOKS_SAFE_MODE=true`).
- [ ] Verify the HMAC signature on every request.
- [ ] Use `crypto.timingSafeEqual` (or equivalent constant-time
      compare) — never `===`.
- [ ] Treat the secret like a password: rotate quarterly, store in
      a secrets manager, never commit to source.
- [ ] Make your consumer **idempotent** on `envelope.id`.
- [ ] Respond with `2xx` within 10 seconds. Do slow work async.
- [ ] On `4xx` responses we stop retrying — return these only if
      you are certain the event is permanently un-processable.
- [ ] Log `X-Delivery-Attempt` to diagnose your own reliability.
- [ ] Handle duplicate deliveries gracefully — at-least-once is the
      contract.

---

## 11. Source files

| File                                    | Purpose                                   |
|-----------------------------------------|-------------------------------------------|
| `src/webhooks/webhook-sender.js`        | Outbound delivery with retry/backoff     |
| `src/webhooks/webhook-subscriptions.js` | CRUD for `webhook_subscriptions`         |
| `src/webhooks/webhook-events.js`        | Event type registry + envelope builder   |
| `src/webhooks/webhook-delivery-log.js`  | Dispatch, delivery log, replay routes    |
| `src/webhooks/webhook-test-receiver.js` | `/api/webhooks/test-echo` dev endpoint   |
| `src/webhooks/webhook-sender.test.js`   | Unit tests for the sender                |
