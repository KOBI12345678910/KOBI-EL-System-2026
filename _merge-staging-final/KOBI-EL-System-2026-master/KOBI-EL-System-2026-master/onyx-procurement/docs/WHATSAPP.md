# WhatsApp Business Integration Guide

Agent 74 module — `src/whatsapp/`

This document describes how to integrate the Techno-Kol / Onyx
Procurement platform with the **Meta WhatsApp Business Cloud API**
and how to use the template system shipped under `src/whatsapp/`.

> **Production warning.** You cannot send to real customers until
> Meta has **verified your business** and **approved your templates**.
> Templates stay in `PENDING` status after submission and any
> `sendTemplate()` call will fail with Cloud API error `132001`
> (template does not exist). See *"Go-live checklist"* at the bottom.

---

## 1. Architecture

```
+------------------+     sendTemplate()     +------------------+
|   app code       |  ------------------->  |  send-whatsapp   |
|   (payroll /     |                        |  .js             |
|   AR / PO etc.)  |  <-------------------  |                  |
+------------------+     Promise            +--------+---------+
                                                     |
                                                     | HTTPS POST
                                                     v
                                          graph.facebook.com/<ver>/
                                          <phone_number_id>/messages
                                                     |
                                                     v
                                          +----------+---------+
                                          |   Meta Cloud API   |
                                          +----------+---------+
                                                     |
                                                     v
                                          +----------+---------+
                                          | whatsapp-webhook.js|
                                          | (status updates,   |
                                          | inbound, STOP)     |
                                          +--------------------+
```

Files:

| File                        | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `whatsapp-templates.js`     | Canonical list of all approved templates (`TEMPLATES`).    |
| `send-whatsapp.js`          | Queue, rate-limit, retry, opt-in check, audit log.         |
| `whatsapp-webhook.js`       | Handles Meta webhooks: verification, statuses, opt-outs.   |
| `whatsapp-templates.test.js`| Unit tests (run with `node whatsapp-templates.test.js`).   |

We never delete template entries — deprecated templates stay in the
file with a `deprecated: true` flag so past audit events remain
traceable.

---

## 2. Templates

Six templates ship in the first release. All are `UTILITY` category
(Meta charges less for utility than marketing) and `language: "he"`.

| Name                   | Audience  | Purpose                              |
| ---------------------- | --------- | ------------------------------------ |
| `wage_slip_ready`      | Employee  | Monthly pay slip is ready + PDF link |
| `invoice_reminder`     | Customer  | Soft-dunning reminder                |
| `payment_received`     | Customer  | Thank-you after payment clears       |
| `po_status_update`     | Supplier  | PO status change                     |
| `appointment_reminder` | Anyone    | Meeting / inspection reminder        |
| `urgent_action_needed` | Managers  | High-priority ops alert              |

Each template uses Meta's official component format (`HEADER`,
`BODY`, `FOOTER`, `BUTTONS`) with positional `{{1}}`, `{{2}}` …
placeholders. `renderTemplatePayload()` substitutes the parameters
into the exact JSON shape required by the Cloud API.

### Placeholder rules

- Body parameters come first, in order (`{{1}}`, `{{2}}`, …).
- If the template has a URL button with `{{n}}` in the URL, pass
  that parameter **last** (after all body parameters).
- Quick-reply buttons have no placeholders — the reply arrives
  via the webhook.

---

## 3. Usage

```js
const wa = require('./src/whatsapp/send-whatsapp');

// One-time: record the opt-in you collected on your signup form,
// portal, or in-person with a signed consent form.
wa.recordOptIn('972501234567', 'portal_checkbox');

// Send a pay slip notification.
await wa.sendTemplate(
  '972501234567',
  'wage_slip_ready',
  [
    'קובי',                                  // {{1}} employee name
    'מרץ 2026',                              // {{2}} month
    '12,345',                                // {{3}} net NIS
    'https://app.example.com/slips/abc123',  // {{4}} URL-button param
  ]
);
```

All sends go through an in-memory FIFO queue. The queue is drained
at up to `WHATSAPP_RATE_LIMIT` (default **80 msg/sec** — the per-WABA
Cloud API limit). Transient errors (`429`, `5xx`) are retried with
exponential backoff up to `WHATSAPP_MAX_RETRIES`.

Every attempt — queued, retried, sent, failed, rejected — is written
to the JSONL audit log at `WHATSAPP_AUDIT_LOG` (default
`logs/whatsapp-audit.log`).

---

## 4. Opt-in & Israeli privacy law

This module is built to respect the **Protection of Privacy Law
5741-1981** (חוק הגנת הפרטיות) and the **Communications Law
5742-1982 §30A** (חוק התקשורת — "חוק הספאם"), which requires prior
written consent before sending commercial messages. UTILITY messages
(transactional pay slips, invoices, operational alerts) are generally
permitted, but the safest policy is **opt-in for everyone**.

### Policies implemented

1. `sendTemplate()` **refuses** to send to any number without an
   active opt-in. To override for truly exceptional operational
   alerts, pass `{ bypassOptIn: true, bypassReason: "..." }`. The
   bypass is logged with `event: "whatsapp.optin_bypass_used"` and
   must be justified during audit.
2. Inbound `STOP` / `ביטול` / `הסר` messages are detected by the
   webhook and automatically flip the sender to opted-out.
3. Opt-out **never deletes data** — it sets `opted_out_at` on the
   existing row. This matches retention requirements and keeps the
   full history available for audit.
4. Numbers are normalised to E.164 (`972…`) before storage so
   variants of the same number collapse into one consent record.

### Consent sources we accept

| Source                      | Record as `source`     |
| --------------------------- | ---------------------- |
| Employee onboarding form    | `hr_onboarding`        |
| Customer checkout checkbox  | `checkout`             |
| Supplier portal registration| `supplier_portal`      |
| In-person signed form       | `paper_consent`        |
| Verbal (recorded call)      | `phone_call`           |

---

## 5. Webhook

Point Meta at `POST /api/whatsapp/webhook` (or wherever you mount
`whatsapp-webhook.expressHandler`). The handler:

1. On `GET` — performs the Meta verification handshake using
   `WHATSAPP_VERIFY_TOKEN`.
2. On `POST` — verifies `X-Hub-Signature-256` against
   `WHATSAPP_APP_SECRET`, then dispatches:
   - `statuses[]` → updates in-memory status store.
   - `messages[]` → logs inbound and triggers opt-out for `STOP`.

Look up the current status of a sent message with
`whatsapp-webhook.getStatus(waMessageId)` — it returns the latest
delivery state (`sent` / `delivered` / `read` / `failed`) plus the
full history array.

Always return HTTP `200` quickly; the handler never throws from the
dispatch path.

---

## 6. Environment variables

| Variable                      | Default                             | Meaning                                         |
| ----------------------------- | ----------------------------------- | ----------------------------------------------- |
| `WHATSAPP_API_VERSION`        | `v19.0`                             | Graph API version                               |
| `WHATSAPP_PHONE_NUMBER_ID`    | —                                   | Meta phone number ID (numeric)                  |
| `WHATSAPP_ACCESS_TOKEN`       | —                                   | System-user permanent token                     |
| `WHATSAPP_APP_SECRET`         | —                                   | App secret for webhook HMAC                     |
| `WHATSAPP_VERIFY_TOKEN`       | —                                   | Token you chose for webhook handshake           |
| `WHATSAPP_RATE_LIMIT`         | `80`                                | Max msg/sec per WABA                            |
| `WHATSAPP_MAX_RETRIES`        | `5`                                 | Retry budget on transient errors                |
| `WHATSAPP_RETRY_BASE_MS`      | `500`                               | Backoff base (doubles per attempt)              |
| `WHATSAPP_AUDIT_LOG`          | `logs/whatsapp-audit.log`           | Append-only JSONL send log                      |
| `WHATSAPP_WEBHOOK_LOG`        | `logs/whatsapp-webhook.log`         | Append-only JSONL webhook log                   |
| `WHATSAPP_OPTIN_STORE`        | `data/whatsapp-optin.json`          | Opt-in / opt-out JSON store                     |

Never commit secrets. Use your existing secret manager (e.g. the
Supabase env in `supabase/`, HashiCorp Vault, or AWS Secrets Manager).

---

## 7. Go-live checklist (Meta verification)

This is the critical part. Meta gates production traffic behind a
verified business and approved templates.

1. **Create a Meta Business Account** at
   `business.facebook.com` and link it to your existing company FB
   page (if any).
2. **Business verification.** Submit legal documents — certificate
   of incorporation / tax certificate (תעודת התאגדות), proof of
   address. Turnaround is usually 1–5 business days.
3. **Create a WhatsApp Business Account (WABA)** inside your
   Business Manager and add the Israeli phone number you will send
   from. Expect an SMS / voice OTP.
4. **Configure the system user** and mint a *permanent* access
   token with `whatsapp_business_messaging` and
   `whatsapp_business_management` scopes. Copy it into
   `WHATSAPP_ACCESS_TOKEN`.
5. **Submit each template** via the WhatsApp Manager UI or the
   `/message_templates` Graph endpoint. Copy the exact body text
   from `whatsapp-templates.js`. Status transitions:
   `PENDING → APPROVED` (usually within an hour) or `REJECTED`
   with a reason. Iterate until approved.
6. **Point the webhook** at your public HTTPS endpoint and complete
   the verification challenge with `WHATSAPP_VERIFY_TOKEN`.
7. **Opt-in collection.** Roll out the opt-in checkboxes on the
   employee portal, customer checkout and supplier portal. Do not
   import legacy contact lists without a clear consent trail.
8. **Seed with test numbers first.** Use the "test number" feature
   in the Meta dashboard to send live template calls before
   enabling real recipients.
9. **Rate-limit sanity check.** Start at 10 msg/sec and ramp up
   once Meta raises your tier (T1 → T2 → T3 as delivery reputation
   improves). The module's default `WHATSAPP_RATE_LIMIT=80` assumes
   you are already at T3 or higher — lower it for new WABAs.
10. **Monitor.** Tail `logs/whatsapp-audit.log` and
    `logs/whatsapp-webhook.log`. Hook a Grafana panel to the
    `failed` status count.

Until every item above is green, keep `WHATSAPP_ACCESS_TOKEN` set
to a sandbox token so no real money or reputation is at risk.

---

## 8. Testing

Plain Node, no external deps:

```bash
cd onyx-procurement
node src/whatsapp/whatsapp-templates.test.js
```

The test suite covers:

- All 6 required templates are defined with correct shape.
- `renderTemplatePayload()` builds a valid Cloud API payload and
  rejects wrong param counts / unknown templates.
- Opt-in / opt-out round-trip and persistence.
- Queue + retry on 5xx, fail-fast on 4xx.
- Rate limiter does not deadlock under a burst of parallel sends.
- Webhook dispatch for status updates (delivered / failed).
- Inbound `STOP` keyword triggers opt-out.
- Signature verification rejects bad signatures.

---

## 9. Operational FAQ

**Q. An employee asks to stop receiving WhatsApp.**
A. Either they reply `STOP` / `ביטול` to any message (handled
automatically by the webhook) or an admin calls
`sender.recordOptOut(phone, 'admin_request')`. The row remains in
the JSON store with `opted_out_at` set.

**Q. Why am I seeing error 132001?**
A. The template name doesn't exist or isn't APPROVED for the
sending phone number. Check the template status in WhatsApp Manager.

**Q. Can I send freeform (non-template) messages?**
A. Only within the **24-hour customer service window** after the
user messaged us first. This module intentionally only ships
templates — it's the safer default for a compliance-heavy workload.

**Q. Can I pass images or documents?**
A. Yes, but you must add a `HEADER` of type `IMAGE` / `DOCUMENT` /
`VIDEO` to the template definition and pass a media handle or URL
in the first component. Add the handling in a follow-up agent task
so it goes through approval.

**Q. Rate limit just tripped in prod.**
A. Lower `WHATSAPP_RATE_LIMIT` below your current Meta tier and
request a tier bump inside Business Manager once your delivery
reputation warrants it.
