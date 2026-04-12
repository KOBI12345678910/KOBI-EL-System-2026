# QA Agent #83 — Webhook Reliability (inbound)

**Project:** onyx-procurement
**File:** `server.js` (lines 870-920)
**Endpoint:** `POST /webhook/whatsapp`
**Date:** 2026-04-11
**Scope:** Static analysis only — WhatsApp inbound webhook reliability
**Related finding:** B-04 (signature verification)

---

## 1. Executive Summary

The WhatsApp webhook handler at `/webhook/whatsapp` is a minimal 25-line implementation
that fails virtually every resilience requirement for a production Meta Cloud API
integration. The handler performs synchronous database I/O **before** acknowledging,
has no idempotency protection, no DLQ, no replay protection, and no structured error
handling. On any Supabase slowness or transient failure, WhatsApp will retry the same
payload repeatedly, producing duplicate `system_events` rows and — worse — duplicate
downstream business actions if handlers are added later.

**Overall grade: F (critical, production-blocking)**

---

## 2. Current Code (as-is)

```js
app.post('/webhook/whatsapp', async (req, res) => {
  const body = req.body;
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const messages = changes?.value?.messages;

  if (messages?.length) {
    for (const msg of messages) {
      const from = msg.from;
      const text = msg.text?.body || msg.type;

      // Log incoming message
      await supabase.from('system_events').insert({
        type: 'whatsapp_incoming',
        severity: 'info',
        source: 'whatsapp',
        message: `הודעה מ-${from}: ${text.slice(0, 200)}`,
        data: { from, text, messageId: msg.id, timestamp: msg.timestamp },
      });

      console.log(`📱 WhatsApp from ${from}: ${text.slice(0, 100)}`);
    }
  }

  res.sendStatus(200);
});
```

---

## 3. Findings by Dimension

### 3.1 Webhook Ack Speed (<5s requirement)  — SEVERITY: HIGH

**Finding:** The handler calls `await supabase.from(...).insert(...)` **inside a `for`
loop** and only after the loop completes sends `res.sendStatus(200)`.

**Why it matters:**
- WhatsApp Cloud API requires 200 OK within 5 seconds or the message is flagged for
  retry (Meta will retry with exponential backoff — up to 7 days in some cases).
- Each Supabase INSERT is a round-trip over the public internet (Supabase REST API).
  Typical latency: 80–400 ms per INSERT. A batch of 5 messages can exceed 2 s easily,
  and a cold connection or PostgREST restart can push a single INSERT past 5 s.
- There is **zero timeout** on the Supabase call. If Supabase hangs, the request hangs
  with it and the Express default (no timeout) will hold the socket open indefinitely.
- If Meta times out, it will retry — producing the same INSERT again (see §3.3).

**Verdict:** FAIL. Ack is blocked behind 1–N synchronous external writes.

---

### 3.2 Async Processing Pattern (ack-first, process-later) — SEVERITY: HIGH

**Finding:** The code is pure synchronous-before-ack. There is no queue, no
`setImmediate`, no `process.nextTick`, no BullMQ/pgmq/Kafka hand-off.

**Correct pattern (for reference):**
```js
app.post('/webhook/whatsapp', (req, res) => {
  // 1. Verify signature (fail fast)
  // 2. Enqueue raw payload
  // 3. Ack immediately
  res.sendStatus(200);
  // 4. Process after ack (separate worker)
});
```

**What's missing:**
- No queue table (e.g. `whatsapp_inbox_queue`) where raw payload is persisted.
- No worker process to drain the queue.
- No separation of "I received it" from "I processed it".

**Verdict:** FAIL. Architecture conflates ingestion with processing.

---

### 3.3 Idempotency on Duplicate Delivery — SEVERITY: CRITICAL

**Finding:** `msg.id` is stored inside a JSONB `data` column but is **NOT** used as
an idempotency key. There is no `UNIQUE` constraint, no `ON CONFLICT DO NOTHING`,
no `SELECT ... WHERE messageId = ?` pre-check.

**Impact:**
- Meta is **guaranteed** to deliver the same webhook more than once under normal
  retry conditions. Every retry will create a new `system_events` row.
- If the handler is ever extended to create POs, send auto-replies, or trigger any
  business action, those actions will fire N times per message.
- Current behavior: duplicate log spam. Future behavior (once business logic is
  added): duplicate orders, duplicate billing, double-booked vendors.

**Recommended fix:**
```sql
CREATE TABLE whatsapp_inbox (
  wa_message_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_status TEXT DEFAULT 'pending'
);
```
Then: `INSERT ... ON CONFLICT (wa_message_id) DO NOTHING`.

**Verdict:** CRITICAL FAIL.

---

### 3.4 Signature Verification — SEVERITY: CRITICAL (ref. B-04)

**Finding:** Confirmed: there is **no verification of the `X-Hub-Signature-256`
header**. The handler accepts any POST to `/webhook/whatsapp` as authentic.

**Attack vector:**
- Any attacker who knows the endpoint URL (trivially discoverable via DNS/port scan
  or leaked error logs) can POST arbitrary JSON and pollute `system_events`.
- An attacker can spoof incoming messages from arbitrary phone numbers.
- Combined with lack of rate limiting (see §3.5), this is a trivial DoS/log-injection
  vector.

**Required fix:**
```js
import crypto from 'crypto';
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.META_APP_SECRET)
  .update(req.rawBody) // requires raw body middleware
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(req.headers['x-hub-signature-256']),
                            Buffer.from(expected))) {
  return res.sendStatus(401);
}
```

**Note:** this requires capturing the raw body via
`express.json({ verify: (req, _, buf) => { req.rawBody = buf; } })`.
Check whether the current `app.use(express.json())` call is so configured.

**Verdict:** CRITICAL FAIL (cross-referenced to B-04).

---

### 3.5 Replay Attack Window — SEVERITY: HIGH

**Finding:** There is no timestamp check. Even if signature verification were
added, a captured legitimate webhook POST could be replayed minutes, hours, or
days later and would be processed again (see §3.3 — no idempotency).

**Required defense-in-depth:**
1. Verify signature (§3.4).
2. Extract `msg.timestamp` (Meta provides Unix seconds).
3. Reject messages older than N minutes (suggested: 15 min):
   ```js
   if (Math.abs(Date.now()/1000 - msg.timestamp) > 900) {
     return res.sendStatus(200); // ack but drop
   }
   ```
4. Idempotency check on `msg.id`.

**Verdict:** FAIL.

---

### 3.6 Failed Delivery Handling (Meta Retries) — SEVERITY: HIGH

**Finding:** The handler has **no try/catch** around the `await supabase...insert`.
If the INSERT throws (network, schema mismatch, RLS denial, quota), the error
propagates up and Express returns **500** — which causes Meta to **retry**.

**Consequences:**
- Poison messages (malformed payload, RLS block, etc.) retry forever.
- On any sustained Supabase outage, WhatsApp marks the webhook as failing and may
  eventually disable message delivery on the business account.
- No alerting: `console.log` is the only signal, and errors go to stderr silently.

**Required pattern:**
```js
try {
  // enqueue
  res.sendStatus(200);
} catch (e) {
  // Still ack to prevent retry-storm, but log to emergency channel
  logger.error('webhook_enqueue_failed', { err: e, rawBody: req.body });
  res.sendStatus(200);
}
```
Decision rule: **ack on any error after signature check passes**. Rely on DLQ, not
on Meta retries, to recover.

**Verdict:** FAIL.

---

### 3.7 DLQ for Poison Messages — SEVERITY: HIGH

**Finding:** There is no Dead Letter Queue. A single malformed message (e.g. one
that violates a JSONB size limit or triggers an RLS policy) will either:
- Crash the handler → Meta retries → loop.
- Or silently disappear with no audit trail.

**Required architecture:**
1. `whatsapp_inbox` table (raw payloads).
2. Worker picks up `pending` rows, attempts processing, moves to `processed`.
3. After N retries (e.g. 5), worker moves row to `whatsapp_inbox_dlq`.
4. Alerting hooked to `whatsapp_inbox_dlq` insert (e.g. Supabase trigger → notify).

Nothing of the above exists.

**Verdict:** FAIL.

---

### 3.8 Logging Webhook Payloads — SEVERITY: MEDIUM

**Finding:** The current implementation logs:
- `console.log` — plaintext first 100 chars, unstructured, no correlation ID.
- `system_events` INSERT — structured but is **both** the log AND the business
  record; conflates concerns.

**Problems:**
- No request-level correlation ID (`req.id` / `x-request-id`).
- No raw-body capture for forensic replay (only parsed `msg.text`/`msg.type`).
- `text.slice(0, 200)` silently truncates — if a legitimate message is >200 chars,
  the log is misleading and the original is lost (because `data.text` stores the
  same truncated-at-source value — actually `data.text` stores full `text` var,
  but that var is `msg.text?.body || msg.type`, so media messages log only the
  type string — no media ID, no media URL, no caption).
- No PII redaction strategy — phone numbers are stored in plaintext in
  `system_events`, which may conflict with Israeli Privacy Protection Law
  (חוק הגנת הפרטיות) depending on retention policy.
- No log level differentiation — inbound messages are logged at `info` regardless
  of whether processing succeeded or failed.

**Verdict:** PARTIAL FAIL.

---

## 4. Additional Static-Analysis Observations

### 4.1 Null-safety gap on `text.slice(...)`
```js
const text = msg.text?.body || msg.type;
// ...
message: `הודעה מ-${from}: ${text.slice(0, 200)}`,
```
If `msg.text?.body` is undefined **and** `msg.type` is also undefined (malformed
payload), `text` is `undefined` and `text.slice(0, 200)` throws
`TypeError: Cannot read properties of undefined (reading 'slice')`. This will
propagate to the Express error handler → 500 → Meta retry.

### 4.2 Only first entry/change processed
```js
const entry = body?.entry?.[0];
const changes = entry?.changes?.[0];
```
Meta webhooks can contain **multiple entries and multiple changes per entry** in a
single POST. The current code silently drops `entry[1..n]` and `changes[1..n]`.
This is a correctness bug — messages will be lost under batching.

### 4.3 Status updates ignored
`changes.value.statuses[]` (delivered / read / failed receipts) are never inspected.
If the system ever sends outbound messages (it references `WA_TOKEN`), there is no
feedback loop for delivery failures.

### 4.4 No rate limiting on the endpoint
No express-rate-limit, no per-IP throttle. Combined with §3.4, anyone on the public
internet can flood the endpoint.

### 4.5 Verify endpoint (line 870) uses `===` check without timing-safe compare
The GET verification handler likely compares `VERIFY_TOKEN` with `===`; should use
`crypto.timingSafeEqual` for defense-in-depth (not high-risk, but inconsistent with
best practice).

### 4.6 Blocking error on schema drift
If the `system_events` table schema ever changes (column removed/renamed), the
INSERT fails synchronously and the whole webhook goes down. There is no fallback
to "log to file and keep ack'ing".

---

## 5. Risk Matrix

| # | Finding | Severity | Likelihood | Business Impact |
|---|---|---|---|---|
| 3.1 | Slow ack | HIGH | HIGH | Meta retries; webhook disabled |
| 3.2 | No async pattern | HIGH | CERTAIN | Design blocker |
| 3.3 | No idempotency | CRITICAL | CERTAIN | Duplicate business actions |
| 3.4 | No signature verify | CRITICAL | HIGH | Spoofed messages, log poisoning |
| 3.5 | No replay window | HIGH | MEDIUM | Same as 3.3 on steroids |
| 3.6 | No error handling | HIGH | HIGH | Retry storms, silent outages |
| 3.7 | No DLQ | HIGH | CERTAIN | Poison messages loop forever |
| 3.8 | Logging conflated | MEDIUM | CERTAIN | Forensics impossible |
| 4.1 | `text.slice` crash | MEDIUM | LOW | 500 on malformed payload |
| 4.2 | Batch dropping | HIGH | MEDIUM | Silent message loss |
| 4.3 | Statuses ignored | MEDIUM | CERTAIN | No outbound feedback |
| 4.4 | No rate limit | HIGH | HIGH | DoS / log flood |

---

## 6. Prioritized Remediation Plan

### P0 (block production)
1. **Add signature verification** (§3.4) — wire `X-Hub-Signature-256` HMAC check
   with `META_APP_SECRET` and raw-body middleware.
2. **Ack first, process later** (§3.1, §3.2) — restructure to `res.sendStatus(200)`
   immediately after signature check, then enqueue raw payload to an `inbox` table.
3. **Idempotency** (§3.3) — create `whatsapp_inbox` table with `wa_message_id`
   as PRIMARY KEY, use `ON CONFLICT DO NOTHING`.
4. **Try/catch everything** (§3.6) — never let Express return 500 after signature
   passes.

### P1 (harden)
5. **Replay window** (§3.5) — reject messages with `timestamp` >15 min old.
6. **Iterate all entries/changes** (§4.2) — use `for (const e of body.entry)`.
7. **Null-safety** (§4.1) — `const text = msg.text?.body ?? msg.type ?? 'unknown';`
8. **DLQ table + worker** (§3.7).

### P2 (observability)
9. **Structured logging** with correlation ID (§3.8).
10. **Process status receipts** (§4.3).
11. **Rate limiting** (§4.4) — `express-rate-limit` per IP.
12. **PII retention policy** for phone numbers (§3.8).

---

## 7. Test Plan (for when fix lands)

- **Retry simulation:** Send same webhook POST 5x → expect exactly 1 `whatsapp_inbox`
  row.
- **Signature negative:** POST with wrong HMAC → expect 401.
- **Latency:** Measure p99 ack time under 100 concurrent POSTs → must stay <1 s.
- **Poison message:** POST malformed JSON → expect 200 ack + row in DLQ after N retries.
- **Replay:** POST a valid webhook with `timestamp` 1 hour old → expect 200 ack + drop.
- **Batch:** POST a webhook with 3 entries × 2 changes × 4 messages → expect 24 rows.
- **Supabase outage:** Simulate Supabase 500 → expect 200 ack + local fallback log.

---

## 8. Conclusion

The inbound WhatsApp webhook at `server.js:876-901` is a **prototype-grade**
implementation that would not survive first contact with production traffic.
It violates 8 out of 8 examined dimensions. The fix is not cosmetic — it requires
a small architectural change (ack-first + inbox table + worker) plus the
signature-verification work tracked in B-04.

**Recommendation:** Block production rollout of any WhatsApp-driven business
flow (inbound orders, inbound confirmations, inbound supplier chat) until P0
items above are implemented and tested.

---

*Static analysis only. No runtime verification performed. No code modified.*
*QA Agent #83 — 2026-04-11*
