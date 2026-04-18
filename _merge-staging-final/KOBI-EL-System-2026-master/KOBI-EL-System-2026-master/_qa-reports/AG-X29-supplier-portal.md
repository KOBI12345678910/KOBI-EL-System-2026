# AG-X29 — Self-Service Supplier Portal

**Agent:** X-29 / Swarm 3B
**Date:** 2026-04-11
**Scope:** Techno-Kol Uzi mega-ERP — pluggable, zero-dep supplier self-service portal
**Status:** GREEN — 37/37 tests passing

---

## 1. Deliverables

| # | Path | Purpose |
|---|------|---------|
| 1 | `onyx-procurement/src/supplier-portal/portal-engine.js` | Server-side engine: auth, POs, ASN, invoices, certifications, payments, contact, tax clarification, audit |
| 2 | `payroll-autonomous/src/components/SupplierPortal.jsx` | Palantir-style React UI — Hebrew RTL, bilingual, zero UI libs |
| 3 | `test/payroll/supplier-portal.test.js` | 37 unit tests via `node:test` |
| 4 | `_qa-reports/AG-X29-supplier-portal.md` | this report |

Zero new dependencies. Everything runs on Node.js `node:crypto` built-in.

---

## 2. Supplier capabilities (task checklist)

| # | Capability | Engine function | UI view |
|---|------------|-----------------|---------|
| 1 | View open POs | `listOpenPOs(supplierId)` | `pos` |
| 2 | Acknowledge PO | `acknowledgePO(supplierId, poId, promiseDate)` | `pos` |
| 3 | Submit ASN | `submitASN(supplierId, asnData)` | `asn` |
| 4 | Upload invoices (PO-matched) | `submitInvoice(supplierId, invoiceData)` | `invoices` |
| 5 | View payment history | `getPaymentHistory(supplierId)` | `payments` |
| 6 | Update contact info | `updateContact(supplierId, newData)` | `contact` |
| 7 | Upload certifications | `uploadCertification(supplierId, certData)` | `certs` |
| 8 | Tax clarifications (ניכוי במקור) | `submitTaxClarification(supplierId, data)` | `tax` |

All functions are synchronous from the caller's perspective but the React UI awaits them, so a production-grade async repo (Postgres, etc.) can be injected via `createPortalEngine({ repo })` without further changes.

---

## 3. Authentication — magic link

### Flow

```
supplier            portal-engine              email service
   |------ requestMagicLink(email) --->|
   |                                   |---- sendEmail(stub) ----->|
   |                                   |                           |
   |<-- (magic link URL by email) -----|                           |
   |                                   |
   |------ verifyMagicLink(token) ---->|
   |<--- { token (JWT), csrf } --------|
```

### Security invariants

- **Token storage:** raw magic-link token is HMAC-hashed before persistence → leaking the DB does not leak reusable tokens.
- **TTL:** `MAGIC_LINK_TTL_MS = 72h`, `SESSION_TTL_MS = 8h`.
- **Single use:** `consumeMagicLink` is atomic — replay attempts trigger `magic_link_replay` audit event.
- **Enumeration resistance:** unknown email never reveals absence; silent success from the caller's perspective.
- **Rate limit:** `5 attempts / 15 min` keyed on `email + IP` via a token-bucket in the repo.
- **JWT:** compact `header.payload.signature` HS256 format. No library; 3 helper functions (`b64urlEncode`, `hmacSign`, `jwtSign/Verify`).
- **CSRF:** a 128-bit token is embedded in the JWT and returned separately (`session.csrf`) for double-submit cookie pattern; `verifyCsrf` uses `crypto.timingSafeEqual`.

---

## 4. Security controls

| Control | Implementation | Test |
|---------|----------------|------|
| Data isolation | Every query filtered by `supplierId` drawn from the session (never from request body). Cross-supplier access returns the same error as "not found" to prevent enumeration. | Tests 14, 15, 17, 20, 29 |
| File upload — mime allow-list | Strict set in `ALLOWED_MIME`; `.exe` and unlisted types rejected. | Test 24 |
| File upload — size cap | `MAX_UPLOAD_BYTES = 25 MB`. | Test 28 |
| File upload — path traversal | Filename rejected if it contains `/` or `\`. | Test 27 |
| AV scan stub | EICAR fingerprint matched against `content` → immediate reject. | Test 26 |
| CSRF | Bound to session; checked via constant-time compare. | Test 13 |
| Audit log | Append-only; 13 distinct actions recorded (login_success, magic_link_*, list_open_pos, po_acknowledged, asn_submitted, invoice_*, certification_uploaded, payment_history_viewed, contact_updated, tax_clarification_submitted, po_access_denied, etc.) | Tests 7, 19, 21, 29, 33 |
| Never delete | No `delete()` operations — everything is a soft update; `deletedAt` column exists but is never populated by the engine. | Test 34 |
| Constant-time compare | `safeEqual` wraps `crypto.timingSafeEqual`. | Test 2 |
| JWT tampering | Any bit flip in the signature is rejected. | Test 4 |
| JWT forgery | Wrong secret is rejected. | Test 5 |
| JWT expiry | Expired tokens rejected. | Test 6, 12 |

### 3-way match (invoice → PO)

`submitInvoice` enforces `invoiceAmount ≤ poTotal × 1.10` (10% tolerance) — anything above is logged as `invoice_three_way_mismatch` and rejected. Verified in tests 22 and 37 (5% over passes, 100% over blocks).

### Contact-update whitelist

`updateContact` accepts only `contactName, phone, alternateEmail, address, city, postalCode, country`. Any attempt to smuggle `id`, `email`, or other protected fields is silently ignored (verified in test 30).

---

## 5. UI — SupplierPortal.jsx

- **Theme:** Palantir dark (default) and light variants; colors match existing `AuditTrail.jsx` / `BIDashboard.jsx`.
- **RTL:** `direction: rtl` root + Hebrew-first labels with English after `•` separator.
- **Zero UI deps:** only `react` peer — inline styles, no CSS modules, no styled-components.
- **Navigation:** sidebar with 8 views mapping 1:1 to supplier capabilities (`overview`, `pos`, `asn`, `invoices`, `payments`, `contact`, `certs`, `tax`).
- **Auth UI:** login panel with email + token pair (supports paste-from-email flow).
- **File uploads:** `<input type="file">` reads content as text, wraps into `{filename, mimeType, size, content}` shape the engine expects; UI hints list allowed types.
- **Error + success banners** rendered in a unified area above each panel.
- **Props-driven API:** the component receives an `api` object and an optional `initialSession`, making it trivial to mount in Storybook, tests, or production with a real fetch-backed adapter.

---

## 6. Test coverage — 37 unit tests (pass)

```
node --test test/payroll/supplier-portal.test.js
...
ℹ tests 37
ℹ pass 37
ℹ fail 0
ℹ duration_ms 146.7
```

### Test catalogue

| # | Area | Test |
|---|------|------|
| 01 | util | `isValidEmail` happy + sad |
| 02 | util | `safeEqual` constant-time |
| 03 | JWT | sign/verify roundtrip |
| 04 | JWT | tampered signature rejected |
| 05 | JWT | wrong secret rejected |
| 06 | JWT | expired rejected |
| 07 | auth | unknown email is silent (enum protection) |
| 08 | auth | happy path — email sent, token returned |
| 09 | auth | invalid email format rejected |
| 10 | auth | rate limit triggers after 5 attempts |
| 11 | auth | `verifyMagicLink` returns session + is single-use |
| 12 | auth | expired magic link rejected |
| 13 | auth | `verifySession` + `verifyCsrf` |
| 14 | isolation | `listOpenPOs` scoped per supplier |
| 15 | isolation | unknown supplier rejected |
| 16 | po | `acknowledgePO` happy path |
| 17 | isolation | `acknowledgePO` blocks cross-supplier access |
| 18 | validation | `acknowledgePO` rejects invalid date |
| 19 | asn | `submitASN` creates record + audit |
| 20 | isolation | `submitASN` rejects foreign PO |
| 21 | invoice | `submitInvoice` happy path |
| 22 | invoice | 3-way-match exceedance blocked |
| 23 | invoice | zero/negative amount rejected |
| 24 | upload | invoice file mime validation |
| 25 | cert | upload — all fields + file |
| 26 | av | EICAR virus stub blocked |
| 27 | upload | path-traversal filename rejected |
| 28 | upload | size cap enforced |
| 29 | isolation | payment history scoped + audited |
| 30 | contact | whitelist — protected fields ignored |
| 31 | contact | empty payload rejected |
| 32 | tax | `submitTaxClarification` record created |
| 33 | audit | scoped log per supplier |
| 34 | never-delete | `acknowledgePO` keeps PO row |
| 35 | auth | malformed token rejected |
| 36 | hmac | deterministic + key-sensitive |
| 37 | invoice | 5% tolerance accepted |

---

## 7. Audit catalogue

The engine emits the following audit actions:

```
magic_link_issued       magic_link_unknown_email     magic_link_rate_limited
magic_link_not_found    magic_link_replay            magic_link_expired
magic_link_rejected     login_success
list_open_pos           po_acknowledged              po_access_denied
asn_submitted           asn_rejected
invoice_submitted       invoice_rejected             invoice_three_way_mismatch
certification_uploaded
payment_history_viewed
contact_updated
tax_clarification_submitted
```

Each entry is `{ id, action, supplierId, metadata, timestamp (ISO) }`.

---

## 8. Integration notes

- **To wire the engine to Postgres:** implement the repo interface (22 methods) and pass it as `createPortalEngine({ repo })`. All engine calls remain synchronous from the caller's perspective but `submitInvoice`/`uploadCertification` etc. can be `await`-ed if the repo is async; the React component already awaits.
- **Email delivery:** replace `defaultSendEmailStub` with the production transport via `createPortalEngine({ sendEmail })`.
- **Secret management:** production MUST pass a 256-bit random `secret`. The engine emits a visible `DEFAULT_SECRET_WARNING` constant for static analyzers.
- **Clock skew in tests:** the engine accepts `now: () => number` so freeze-time tests are trivial (see test 12).

---

## 9. Compliance mapping

| Requirement | Status |
|-------------|--------|
| Never delete | YES — no `delete*` or unset operations anywhere |
| Hebrew RTL bilingual | YES — UI labels all bilingual, engine comments bilingual |
| Zero external deps | YES — only `node:crypto` and `react` peer |
| Magic link (time-limited 72h) | YES — `MAGIC_LINK_TTL_MS = 72 * 60 * 60 * 1000` |
| No password | YES |
| JWT session (HMAC-SHA256) | YES — custom HS256 impl |
| Rate limit on login | YES — token bucket, 5/15 min |
| Data isolation | YES — all queries scoped by session supplierId |
| File validation (mime/size/AV) | YES |
| Audit log | YES — append-only, 20+ action types |
| CSRF | YES — bound to session, constant-time check |
| 20+ tests | YES — 37 tests |
| Real code, no TODOs | YES |

---

## 10. Follow-ups (out of scope for X-29)

1. OAuth stub was mentioned as an alternative auth path — current implementation uses magic link only. An `oauth.js` adapter can be added later alongside `createSession` without changing the capability surface.
2. Virus scan is a stub — wire ClamAV or the equivalent behind `validateUpload`.
3. Magic-link email template can be extended with an actual URL once the public portal host is known; today it embeds the raw token so tests remain independent of URL shape.
4. Rate-limit bucket reset currently happens per-window; a sliding-window implementation can be added if needed for burst handling.

**All 37 tests green. Ready for integration.**
