# AG-Y050 — Self-Service Tenant Portal (Real-Estate)
**Agent:** Y-050 | **Swarm:** Real-Estate | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 45 / 45 unit tests green (`node --test test/realestate/tenant-portal.test.js`)

> לא מוחקים, רק משדרגים ומגדלים — every mutation in this portal is
> additive. Address edits, contact changes, lease-renewal requests,
> maintenance updates, and failed payments are all preserved in history
> arrays or recorded as new rows. Soft-delete uses `archivedAt`; the
> audit log is append-only.

---

## 1. Scope

A zero-dependency self-service tenant portal that lets residents of
Techno-Kol Uzi real-estate assets handle everything they would normally
phone the office for — see what they owe, pay rent, open a maintenance
request with photos, browse their lease and receipts, and ask for a
lease renewal — all without staff involvement.

### Delivered files
- `onyx-procurement/src/realestate/tenant-portal.js` — backend engine
- `payroll-autonomous/src/components/TenantPortal.jsx` — React UI (RTL, dark theme)
- `test/realestate/tenant-portal.test.js` — 45 unit tests
- `_qa-reports/AG-Y050-tenant-portal.md` — this report

### RULES respected
- **Zero dependencies** — only `node:crypto` on the backend; React on
  the front-end (already bundled by `payroll-autonomous`). No JWT libs,
  no axios, no dayjs, no i18n lib. Hebrew/English labels are literal
  string maps.
- **Bilingual** — every user-visible label has `he` + `en` entries and
  is exported via `labels(key)` so a future i18n switch is one prop.
- **RTL layout** — every React tree is wrapped in `dir="rtl" lang="he"`
  with `textAlign: 'right'` on text inputs and tables.
- **Never deletes** — lease-renewal requests append to
  `lease.renewalRequests[]`; failed payments are recorded (not discarded);
  maintenance history lives in `request.history[]`; documents use
  `archivedAt` soft-delete; receipts are auto-generated on successful
  payment and never removed.
- **Real code** — no stubs, no TODOs. The payment, mailer, SMS and PDF
  integrations are implemented behind injectable bridges so production
  can wire Y-076 PayBox/Bit / real SMTP / real S3 without changing one
  line of engine code.

---

## 2. Public API (backend)

```js
const { createTenantPortal, createInMemoryRepo } =
  require('./onyx-procurement/src/realestate/tenant-portal.js');

const engine = createTenantPortal({
  repo: createInMemoryRepo(),      // or your own repo
  secret: process.env.TENANT_HMAC_SECRET, // REQUIRED in prod
  clock: { now: () => Date.now() },
  sendEmail: async (to, subject, body) => { /* smtp */ },
  sendSms:   async (to, body) => { /* twilio, etc. */ },
  paymentBridge:     { charge: async ({ tenantId, amount, method }) => ({ ref }) }, // Y-076
  pdfBridge:         { getDocument: async ({ tenantId, docId }) => ({ fileRef, mime, bytes }) },
  maintenanceBridge: { dispatch: async ({ tenantId, requestId }) => {} },
  portalBaseUrl: 'https://portal.techno-kol.co.il/tenant',
  tokenTtlMs:  24 * 60 * 60 * 1000, // 24h magic link
  sessionTtlMs: 8 * 60 * 60 * 1000, // 8h session
});
```

| # | Method                                                       | Returns                                       | Notes                                    |
|---|--------------------------------------------------------------|-----------------------------------------------|------------------------------------------|
| 1 | `requestMagicLink(channel, value)`                           | `{ ok, sent, token?, link? }`                 | email or SMS; no enumeration             |
| 2 | `verifyMagicLink(token)`                                     | `{ ok, tenantId, session }`                   | single-use, 24h TTL, HMAC-SHA256         |
| 3 | `resolveSession(sessionId)`                                  | `tenantId or null`                            | 8h TTL, in-memory                        |
| 4 | `logout(sessionId)`                                          | `{ ok }`                                      | kills session, audit entry               |
| 5 | `getDashboard(tenantId)`                                     | snapshot                                      | balance + upcoming + lease end + opens   |
| 6 | `getBalance(tenantId)`                                       | `{ owed, paid, balance, currency }`           | currency `ILS`                           |
| 7 | `getUpcomingRent(tenantId)`                                  | `Charge or null`                              | next unpaid due                          |
| 8 | `getPaymentHistory(tenantId, filters?)`                      | `Payment[]`                                   | newest-first, status/date filters        |
| 9 | `getLeaseDetails(tenantId)`                                  | `Lease`                                       | includes `renewalRequests[]`             |
|10 | `getMaintenanceRequests(tenantId, filter?)`                  | `MaintenanceRequest[]`                        | newest-first                             |
|11 | `submitMaintenanceRequest(tenantId, data)`                   | `{ ok, id }`                                  | validates category/priority/desc         |
|12 | `uploadMaintenancePhoto(tenantId, reqId, file)`              | `{ ok, photoId }`                             | mime/size/EICAR/traversal guarded        |
|13 | `payRent(tenantId, amount, method)`                          | `{ ok, paymentRef }`                          | bridges Y-076 PayBox / Bit / card / masav|
|14 | `requestLeaseRenewal(tenantId, {termMonths, note, proposedRent})`| `{ ok, id }`                              | additive; blocks duplicates              |
|15 | `getDocuments(tenantId)`                                     | `Document[]`                                  | includes synthetic lease-PDF entry       |
|16 | `downloadReceipt(tenantId, receiptId)`                       | `{ ok, fileRef or fallbackText }`             | bridge-first with text fallback          |
|17 | `downloadLeasePdf(tenantId)`                                 | `{ ok, fileRef or fallbackText }`             | bridge-first with text fallback          |
|18 | `getAuditLog(filter?)`                                       | `AuditEntry[]`                                | append-only, filterable by tenant/action |

Primitives also exported:
`createMagicLinkToken`, `parseMagicLinkToken`, `hmacSign`, `hmacVerify`,
`safeEqual`, `isValidEmail`, `isValidIsraeliPhone`, `normalizeEmail`,
`normalizePhone`, `validatePhotoUpload`, `consumeBucket`, `labels`,
`LABELS`, `constants`.

---

## 3. Tenant capabilities delivered

| #  | Capability                                 | Engine surface                          | UI tab        |
|----|--------------------------------------------|-----------------------------------------|---------------|
|  1 | Magic-link login by email                  | `requestMagicLink('email', …)`          | Login screen  |
|  2 | Magic-link login by SMS                    | `requestMagicLink('sms', …)`            | Login screen  |
|  3 | See current balance                        | `getBalance`                            | דשבורד        |
|  4 | See upcoming rent                          | `getUpcomingRent`                       | דשבורד        |
|  5 | See payment history                        | `getPaymentHistory`                     | תשלומים       |
|  6 | See lease details                          | `getLeaseDetails`                       | חשבון         |
|  7 | See maintenance requests                   | `getMaintenanceRequests`                | תחזוקה        |
|  8 | See documents (lease PDF, receipts)        | `getDocuments`                          | מסמכים        |
|  9 | Submit maintenance request                 | `submitMaintenanceRequest`              | תחזוקה        |
| 10 | Upload photos to a request                 | `uploadMaintenancePhoto`                | תחזוקה        |
| 11 | Pay rent (PayBox, Bit, card, מס״ב)         | `payRent` → bridge → Y-076              | תשלומים       |
| 12 | Request lease renewal                      | `requestLeaseRenewal`                   | חשבון         |
| 13 | Download receipt                           | `downloadReceipt`                       | מסמכים        |
| 14 | Download lease PDF                         | `downloadLeasePdf`                      | מסמכים        |

---

## 4. UI screens (React component)

`payroll-autonomous/src/components/TenantPortal.jsx`

| Screen               | Tab (Hebrew)   | Key elements                                                      |
|----------------------|----------------|-------------------------------------------------------------------|
| Login — email        | —              | Tab switch, email input, "send link", "check inbox" success state |
| Login — SMS          | —              | Phone input (Israeli format), SMS send                            |
| Token verify         | —              | Paste-or-click token, verify button                               |
| Dashboard            | דשבורד         | KPI tiles: balance, upcoming rent, lease end, open requests       |
| Quick actions        | (in dashboard) | "Pay now", "New request", "Request renewal" shortcuts             |
| Payments             | תשלומים        | Pay-rent form + payment history table w/ status badges            |
| Maintenance          | תחזוקה         | New-request form (category, priority, desc) + list + photo upload |
| Documents            | מסמכים         | Lease + receipts list, bridge-or-fallback download                |
| Account              | חשבון          | Lease details (from/to/rent/deposit) + renewal form               |

### Accessibility (AA)
- Every interactive element has an `aria-label` or visible text.
- Tab bar uses `role="tablist"` / `role="tab"` / `aria-selected` /
  `aria-controls`, panels use `role="tabpanel"`.
- Error messages are wrapped in `role="alert"`, success in
  `role="status"` for live-region announcement.
- All inputs have an associated `<label htmlFor>`.
- Minimum touch target 36-44 px (buttons, tabs).
- Color contrast — the Palantir dark tokens (`text #e6edf3` on
  `bg #0b0d10`) clear WCAG AA contrast. Accent blue `#4a9eff` on the
  dark panel is used only for emphasis/borders, never for body copy.
- `dir="rtl" lang="he"` on every root, `textAlign: 'right'` on
  inputs, tables and pre-formatted text (fallback PDFs).

### Mobile responsiveness
- KPI tiles use `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))`
  so 4 tiles collapse to 2 columns on tablet, 1 on phone.
- Nav tabs use `overflow-x: auto` to scroll horizontally on small screens.
- Forms use 2-column grids that collapse naturally via grid `minmax`.
- Tables are wrapped in `overflow-x: auto` so Hebrew tables scroll
  without breaking layout.

---

## 5. Security notes

| Concern                 | Mitigation                                                                  |
|-------------------------|-----------------------------------------------------------------------------|
| Magic-link forgery      | HMAC-SHA256 over payload, constant-time verify (`safeEqual`).               |
| Token replay            | Tokens are hashed (`sha256`) and stored; `usedAt` marks consumed tokens.    |
| Expired token           | 24 h TTL enforced both in payload (`exp`) and in repo (`exp` field).        |
| Email/phone enumeration | Unknown recipients return `ok:true, sent:false`; audit logs `magic_unknown`.|
| Brute force             | Per-contact rate limit (5 attempts / 15 min) and per-tenant RL (120 / min). |
| Tenant data leakage     | Every read/write uses `requireTenant` + scoped queries; guarded by `tenantId` that is resolved from the session, never from the request body. Cross-tenant maintenance uploads return `not_found`. |
| CSRF                    | Sessions are short-lived (8 h) and opaque; state-changing API calls should be POST-only behind the session id.|
| File upload abuse       | `validatePhotoUpload` enforces mime allow-list (jpeg/png/webp/heic/heif), 15 MB cap, path-traversal ban, EICAR fingerprint block.|
| Audit trail             | Append-only `auditLog`: every login, dashboard access, payment, maintenance submit, receipt download and renewal request is captured with timestamp and tenant id.|
| Secret hygiene          | `DEFAULT_SECRET_WARNING` string is used if no secret is passed; rotate via env var (`TENANT_HMAC_SECRET`) in production.|
| PII minimization        | No plain tokens stored in the repo — only their SHA-256 hashes, so a repo leak does not leak active magic links.|

---

## 6. Hebrew glossary  |  מילון מונחים

| Hebrew           | English                  | Notes                                  |
|------------------|--------------------------|----------------------------------------|
| פורטל דיירים     | Tenant portal            | Product name                           |
| דייר             | Tenant                   | Resident of a unit                     |
| חוזה שכירות      | Lease / rental agreement | Legal contract tenant ↔ landlord       |
| שכר דירה         | Rent                     | Monthly charge                         |
| פיקדון ביטחון    | Security deposit         | Returned at lease end                  |
| יתרה לתשלום      | Balance due              | Owed − paid, in ILS                    |
| מועד תשלום       | Due date                 | When a charge becomes payable          |
| בקשת תחזוקה      | Maintenance request      | Service ticket                         |
| תחזוקה שוטפת     | Routine maintenance      | Low/medium priority                    |
| דחיפות           | Priority                 | Low / Medium / High / Urgent           |
| אינסטלציה        | Plumbing                 | Category                               |
| מיזוג אוויר      | HVAC                     | Category                               |
| מזיקים           | Pest control             | Category                               |
| שטחים משותפים    | Common area              | Category                               |
| חידוש חוזה       | Lease renewal            | Tenant-initiated extension             |
| קבלה             | Receipt                  | Proof of payment                       |
| הסכם שכירות      | Lease agreement PDF      | Downloadable                           |
| אמצעי תשלום      | Payment method           | PayBox / Bit / אשראי / מס״ב            |
| קישור כניסה      | Sign-in / magic link     | One-time URL                           |
| פג תוקף          | Expired                  | Token / session                        |
| ממתין            | Pending                  | Payment status                         |
| שולם             | Paid                     | Payment status                         |
| נכשל             | Failed                   | Payment status                         |
| פתוחה            | Open                     | Maintenance status                     |
| בטיפול           | In progress              | Maintenance status                     |
| מתוזמנת          | Scheduled                | Maintenance status                     |
| הסתיימה          | Resolved                 | Maintenance status                     |
| סגורה            | Closed                   | Maintenance status                     |
| גישה חסומה       | Access denied            | Error                                  |
| יותר מדי ניסיונות| Too many attempts        | Rate-limit error                       |
| דשבורד           | Dashboard                | Tab                                    |
| תשלומים          | Payments                 | Tab                                    |
| תחזוקה           | Maintenance              | Tab                                    |
| מסמכים           | Documents                | Tab                                    |
| חשבון            | Account                  | Tab                                    |

---

## 7. Test evidence

Command: `node --test test/realestate/tenant-portal.test.js`
Runtime: ~180 ms · 45 tests, 0 failures, 0 skipped.

Areas exercised:

- **Primitives (1-10)** — email/phone validators, HMAC sign/verify,
  constant-time equality, token create/parse, token tamper, token
  expiry, rate-limit token-bucket, photo upload validator (good case,
  traversal, wrong mime, over-size, EICAR).
- **Magic-link flow (11-20)** — email channel, SMS channel, unknown
  recipient (no enumeration), invalid inputs, verify happy path,
  replay block, 24 h expiry, garbage rejection, session resolve,
  session expiry, logout.
- **Rate limiting (21-22)** — per-contact limit on magic-link issuance,
  per-tenant limit on authenticated API calls.
- **Balance / rent / payments (23-28)** — balance computation,
  next unpaid charge, history newest-first, happy-path `payRent`
  (records payment, closes charge, auto-creates receipt document),
  bridge failure (still recorded as `failed`, never deleted),
  bad-input rejection.
- **Lease & renewal (29-30)** — lease details, additive renewal
  request, duplicate-renewal block.
- **Maintenance (31-34)** — submit, rejects bad category/priority/
  empty description, photo upload attaches to request, cross-tenant
  upload rejected for isolation.
- **Documents (35-37)** — synthetic lease entry, receipt download
  fallback text (bridge absent), lease PDF fallback text.
- **Dashboard (38)** — aggregates balance, upcoming rent, lease end,
  open maintenance count.
- **Isolation & errors (39-40)** — unknown tenant → `NOT_FOUND`,
  tenant A cannot see tenant B payments.
- **Audit log (41-45)** — captures magic-link issued/verified/
  dashboard access, filterable by action, records unknown recipients
  (audit-only, no enumeration), magic-link record is marked `usedAt`
  after verification, bilingual labels exposed.

### Raw tail of `node --test` output

```
ℹ tests 45
ℹ suites 0
ℹ pass 45
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 178.7
```

---

## 8. Integration notes

### Wiring Y-076 PayBox / Bit

The engine never talks to PayBox/Bit directly. The `paymentBridge`
interface is a single async method:

```js
paymentBridge: {
  charge: async ({ tenantId, amount, method, paymentId }) => {
    // Call Y-076 PayBox/Bit here; return { ref } on success, throw on failure.
    const ref = await payboxClient.charge({ tenantId, amount, method });
    return { ref };
  },
}
```

The engine will:
1. Call `charge()` inside a try/catch.
2. On success, record a `paid` payment, close the oldest unpaid
   charge, and auto-create a `receipt` document.
3. On failure, record the attempt as `failed` (never discarded), and
   return `{ ok:false, status:'failed', error }` to the caller.

### Wiring SMTP / SMS

```js
sendEmail: async (to, subject, body) => { /* Nodemailer etc. */ },
sendSms:   async (to, body) => { /* Twilio / local SMS gateway */ },
```

Delivery failures are caught inside the engine — they still return
`ok:true` to the caller (to preserve the no-enumeration guarantee) and
log `magic_delivery_failed` in the audit log.

### Wiring PDF storage

```js
pdfBridge: {
  getDocument: async ({ tenantId, docId }) => ({
    fileRef: 'https://cdn/....pdf', // pre-signed URL
    mime:    'application/pdf',
    bytes:   null, // or a Buffer
  }),
}
```

If the bridge throws or is absent, the engine returns `fallbackText`
— a Hebrew text snapshot of the receipt / lease — so the tenant always
sees *something*.

---

## 9. Known limitations / upgrade hooks (growth, not deletion)

1. **In-memory sessions** — `sessions` is a `Map` on the engine
   instance. For multi-instance deploys, inject a Redis-backed session
   store (hook: expose `sessionStore` option; today it is a private
   closure Map). This is an *upgrade*, not a deletion.
2. **Rate-bucket persistence** — buckets live in the repo; the
   in-memory repo will lose them on restart. A real repo persists
   them via `getBucket` / `setBucket`.
3. **File storage** — photos are currently stored in `photos[].bytes`
   inside the in-memory repo. Production should store a reference
   (`file.ref`) to S3 / local blob store; the upload validator
   already accepts `file.ref` passthrough.
4. **i18n** — only Hebrew / English are wired. Adding Arabic or
   Russian is a pure addition to `HE` / `EN` maps.

---

## 10. Sign-off

- Code: `onyx-procurement/src/realestate/tenant-portal.js` — 1050 LOC, zero deps.
- UI: `payroll-autonomous/src/components/TenantPortal.jsx` — ~900 LOC, inline styles.
- Tests: `test/realestate/tenant-portal.test.js` — 45 / 45 passing.
- Report: this file — never delete, only extend.

RULE reminder: **לא מוחקים, רק משדרגים ומגדלים.**
