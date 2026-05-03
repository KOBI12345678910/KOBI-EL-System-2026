# AGENT-140 — Payment Providers Audit

Date: 2026-04-29
Worktree: `objective-merkle-40ff93`
Scope: Stripe, PayPal, Tranzila, iCredit, CardCom — webhook security, refund flow, recurring billing, PCI scope.

---

## 1. Provider Inventory

| Provider | Implementation Location | Status |
|---|---|---|
| Stripe | `onyx-ai/src/integrations.ts:2141` (webhook handler with HMAC verify); `auth-allowlist.ts:65` (`/api/stripe/webhook` public). Scaffold templates in `onyx-ai/agents/src/tools/integrationsTool.ts`. ERP UI lists Stripe in `erp-app/src/pages/settings/sections/payment-services.tsx` and `seed-modules.ts:3934`. **No charge/refund/subscription handler in `api-server`.** | Webhook-only / scaffold |
| PayPal | `api-server/src/routes/israeli-business-integrations.ts` — `oauth2/token` -> `/v2/checkout/orders` create+capture (charge L1447-1521), capture refund `/v2/payments/captures/:id/refund` (L1631-1667). | Production code |
| Tranzila | `api-server/src/routes/israeli-business-integrations.ts` — `secure5.tranzila.com/<terminal>/json` `tranmode:"A"` (charge L1379-1412), `tranmode:"C"` (refund L1571-1600). Tokenize via redirect to `direct.tranzila.com/<terminal>/iframe.html`. | Production code |
| CardCom | `api-server/src/routes/israeli-business-integrations.ts` — `secure.cardcom.solutions/api/v11/LowProfile/Create` Operation 1 (charge L1413-1446), Operation 2 (refund L1601-1630), Operation 4 (tokenize L1284-1309). | Production code |
| iCredit | Listed as integration slug `payment-icredit` in `israeli-business-integrations.ts:327, 363` and selectable in `seed-modules.ts:3934`. **No charge / refund / tokenize / webhook handler exists.** | Stub only |

Reference: `api-server/src/routes/israeli-business-integrations.ts` (1842 lines) is the production payment surface.

---

## 2. Webhook Security

### 2.1 Stripe (onyx-ai)
`onyx-ai/src/integrations.ts:2222-2235` — `verifyStripeSignature` parses `stripe-signature` header into `t=` / `v1=`, recomputes `HMAC-SHA256(t + "." + rawBody, secret)`, compares with `timingSafeEqualStr`. Correct algorithm. Notes:
- Falls back to `JSON.stringify(req.body)` if `req.rawBody` absent (L2144) — that is **a real bug**: re-stringifying breaks signature byte-for-byte. Without `express.raw()` or a `verify` callback that captures `rawBody` upstream, valid Stripe events will be rejected. No `express.raw({type:'application/json'})` mount found for `/api/stripe/webhook` on this router.
- No replay protection: `t` (timestamp) is parsed but never compared against tolerance window. Stripe recommends a 5-minute `tolerance`.
- No event idempotency on `event.id` — if Stripe redelivers, handlers run twice.

### 2.2 PayPal
**No webhook receiver in repo.** No `paypal-transmission-sig`, `verifyWebhookSignature`, or `notifications/verify-webhook-signature` call. `israeli-biz/payment/charge` for PayPal status only updates DB based on the synchronous `capture` response. If a payment is finalized async (e.g., Pay Later), the system never learns.

### 2.3 Tranzila / CardCom / iCredit
**No webhook / IPN / notify_url handler.** Tranzila supports a `notify_url_address` parameter and CardCom has `WebHookUrl` / IndicatorUrl in LowProfile, but neither are wired into `israeli_payment_gateways` flow. The DB has a `webhook_url` TEXT column (L244) but it's stored only and never validated on inbound. Any PostBack/IPN sent by these providers would either 404 or hit `/api/webhooks/` allowlisted by `auth-allowlist.ts:62` with no signature check.

### 2.4 Generic webhook plumbing
`erp-app/src/pages/security/tabs/webhook-secrets.tsx` documents internal HMAC-SHA256 over `X-Webhook-Signature` for **outbound** integration webhooks; this is unrelated to Stripe/PayPal/IL gateway inbound signatures. `api-server/src/lib/edi-processor.ts:340` has a generic `verifyWebhookSignature(body, sig, secret)` but is wired to EDI partners only, not payments.

---

## 3. Refund Flow

`api-server/src/routes/israeli-business-integrations.ts:1551-1690` (`POST /api/israeli-biz/payment/refund`).

Strengths:
- Reuses original transaction row to derive gateway, currency, external ID. Inserts a new row with `transaction_type='refund'` and links to original.
- Updates the original transaction status to `refunded` only on `approved`.
- Allows partial refund via `amountAgorot`.

Gaps:
- **No idempotency.** Re-POST to the same `transactionId` will hit the gateway again. `idempotency-key.js` exists in `onyx-procurement/src/resilience/` but is not mounted on this Express router. Double refund risk on retry.
- **No over-refund check.** Sums of prior refund rows for the same `linked_invoice_id` / original tx are not aggregated — caller can refund 100% twice (each call calls Tranzila/CardCom which may or may not catch it; relying on remote check is fragile).
- **No partial-refund accounting.** `refundAmount = amountAgorot || origTx.amount_agorot` always, but refunded original is flipped to `'refunded'` even on partial — losing the remaining refundable balance.
- **No invoice/AR reversal.** The linked `invoice_id` is referenced but no journal entry / AR reversal is written. Tax (VAT) reversal not generated either — IL law requires a `חשבונית זיכוי` (credit invoice).
- Tranzila refund uses `tranmode:"C"` correctly; CardCom uses `Operation:2` on `LowProfile/Create` — note: CardCom's documented refund/cancel uses `RefundByTransaction` API; verify this endpoint actually performs a refund vs. a new auth.
- No retry/backoff on transient HTTP errors (30s AbortController timeout sets status to `error` and stops).

---

## 4. Recurring Billing

- DB column `israeli_payment_gateways.supports_recurring BOOLEAN DEFAULT false` (L241) is exposed on UI (`erp-app/src/pages/finance/israeli-integrations.tsx:62`) but **no scheduler, no plan/subscription table, no auto-charge job** in `api-server`.
- `direct-debit` route (L1318-1353) creates a single pending row tagged `'pending_approval'` — not a recurring schedule.
- Stripe scaffold (`onyx-ai/agents/src/tools/integrationsTool.ts:23-30`) creates `mode:'subscription'` checkout but is template code that lives outside the running server.
- PayPal subscriptions (`/v1/billing/subscriptions`) are not used; only one-shot `intent:"CAPTURE"` orders.
- Israeli "הוראת קבע" (standing-order) language appears in UI copy (Tranzila description) but no token-vault + cron implementation.
- No webhook handling for `customer.subscription.updated` / `customer.subscription.deleted` -> business-state propagation.

Conclusion: recurring billing is **not implemented**. Marked as a capability flag only.

---

## 5. PCI Scope

Positive:
- `israeli_payment_transactions` stores only `card_last4`, `card_type`, and `card_token`. PAN/CVV not persisted.
- `charge` rejects non-PayPal requests without `cardToken` (L1368-1370): `"נדרש טוקן כרטיס (cardToken). יש לבצע טוקניזציה תחילה"`. Forces tokenize-first flow.
- Tokenize redirects to provider iframe/hosted page (Tranzila iframe, CardCom LowProfile URL, PayPal JS SDK) — keeps PAN out of the application server. SAQ A path.
- API responses scrub `card_token` and `raw_response` before returning (L1350, 1545).
- Credentials (`api_key`, `api_secret`, `password_encrypted`) AES-256-GCM encrypted at rest (L18-35, `decryptRowCredentials` L385).

Concerns:
- **`raw_response` JSONB persisted** (L1535) contains full provider response. CardCom/Tranzila success payloads include masked PAN, but check: any CardCom error or `LowProfile` payload may carry sensitive fields. Treat as cardholder data and either mask before insert or set 90-day retention.
- **`card_token VARCHAR(200)` stored alongside `card_last4`** (L260). Tokens are not PAN, but if the provider issues a cleartext PAN-equivalent token, the table becomes in-scope. Confirm Tranzila/CardCom tokens are network-token / vault-references rather than PAN-derivative.
- `DEFAULT_DEV_KEY` constant `"a1b2c3..."` (L8) is shipped in source. Production guard on L9-11 is correct, but the dev fallback string in source is a SAST flag.
- `customer_id_number` (Israeli תעודת זהות, PII) stored in plaintext on every transaction row (L266). No masking, no row-level encryption. Israeli Privacy Protection Law (חוק הגנת הפרטיות 1981) classifies this as sensitive — should be encrypted or hashed.
- No `X-Forwarded-For` / IP retention policy or audit on payment endpoints.
- TLS verification on outbound `fetch` is default Node behavior — fine, but no certificate pinning to gateway hosts.

---

## 6. Other Risk Findings

- **No transaction wrapping**: charge inserts the row after the gateway call; if INSERT fails, the customer was charged but no record exists. Should be `BEGIN; gateway_call; INSERT; COMMIT` with compensating refund on INSERT failure.
- **Authorization missing on `/api/israeli-biz/payment/charge` and `/refund`**: route is mounted on the regular `router` and relies on app-level `authMiddleware`. Confirm; the file does not show `requireAuth`, `requireAdmin`, or RBAC guards for refund. Any authenticated user can refund any transaction.
- **No rate limiting** observed on `/payment/charge` or `/payment/tokenize`.
- **`linked_invoice_id` is INTEGER without FK** (L271): orphan refunds against deleted invoices are possible.
- `auth-allowlist.ts:65` exposes `/api/stripe/webhook` publicly but no Stripe webhook route is mounted in `api-server` — public surface points to a 404.
- Frontend `online-payment-button.tsx:21` generates a "payment link" with `Math.random().toString(36).substr(2,9)` — predictable, 9-char, not cryptographically secure. Should be `crypto.randomUUID()` plus signed JWT.

---

## 7. Recommendations (priority order)

1. P0 — Fix Stripe rawBody capture: mount `express.raw({type:'application/json'})` on `/api/stripe/webhook` BEFORE `express.json()`, store `req.rawBody` in `verify` callback. Currently signature verify will silently fail in production.
2. P0 — Add webhook receivers + signature verify for PayPal (`PAYPAL-AUTH-ALGO` / `paypal-cert-url` chain), Tranzila (HMAC over notify body), CardCom (compare `WebHookUrl` POST against `terminal_number`+`ApiName` shared secret).
3. P0 — Add idempotency key middleware on `/payment/charge` and `/payment/refund`. Module already exists at `onyx-procurement/src/resilience/idempotency-key.js`.
4. P0 — Aggregate prior refunds before allowing new refund; mark partials separately (status `partially_refunded`).
5. P1 — Replace `Math.random` payment-link token with `crypto.randomUUID()` + HMAC-signed.
6. P1 — Encrypt `customer_id_number` at rest; restrict access via RBAC.
7. P1 — Add Stripe event-id dedup table and 5-minute timestamp tolerance.
8. P1 — Wrap charge in DB transaction; emit business event on success only.
9. P2 — Implement recurring billing (subscription table + cron + token re-charge with retries + dunning).
10. P2 — Implement iCredit handler or remove from selectable list / mark "coming soon".
11. P2 — PCI documentation: explicit SAQ A scoping doc since tokenize-only flow qualifies.

---

## 8. File References

- `api-server/src/routes/israeli-business-integrations.ts` (charge L1356-1549, refund L1551-1690, tokenize L1268-1316, gateway CRUD L1140-1200)
- `onyx-ai/src/integrations.ts:2141-2235` (Stripe webhook + signature verification)
- `api-server/src/middleware/auth-allowlist.ts:61-69` (webhook public endpoints)
- `erp-app/src/pages/settings/sections/payment-services.tsx` (provider config UI)
- `erp-app/src/components/invoices/online-payment-button.tsx` (insecure link gen)
- `onyx-procurement/src/resilience/idempotency-key.js` (unused — should be wired in)
- `lib-client/db/src/schema/israeli-integrations.ts` (Drizzle schema)
- `erp-app/src/pages/security/tabs/webhook-secrets.tsx` (internal outbound webhook HMAC docs)
