# QA Agent #54 — Supplier Self-Service Portal (Forward-Looking Design)

**Project:** onyx-procurement
**Agent:** #54 / Wave 2
**Dimension:** Supplier Self-Service Portal (future feature — does not exist today)
**Date:** 2026-04-11
**Analysis type:** Static analysis + forward-looking design
**Scope:** server.js, web/onyx-dashboard.jsx, package.json

---

## 0. Current State Snapshot (Baseline)

Static inventory of everything supplier-related in the codebase:

### 0.1 Endpoints inventory (server.js)
Total Express routes: **28** routes + **2** webhook routes.

**Admin-facing supplier endpoints (backend-only):**
| Line | Route | Auth | Purpose |
|---|---|---|---|
| 130 | `GET  /api/suppliers` | none | List suppliers (admin dashboard) |
| 140 | `GET  /api/suppliers/:id` | none | Supplier detail (admin) |
| 149 | `POST /api/suppliers` | none | Create supplier (admin) |
| 157 | `PATCH /api/suppliers/:id` | none | Update supplier (admin) |
| 166 | `POST /api/suppliers/:id/products` | none | Add product (admin) |
| 173 | `GET  /api/suppliers/search/:category` | none | Admin search |
| 226 | `POST /api/rfq/send` | none | Admin broadcasts RFQ via WhatsApp/SMS |
| 365 | `POST /api/quotes` | none | **Admin enters quote manually** (supplier does not POST here) |
| 425 | `POST /api/rfq/:id/decide` | none | AI decision (admin) |
| 626 | `POST /api/purchase-orders/:id/send` | none | Send PO to supplier via WhatsApp |
| 863 | `GET  /webhook/whatsapp` | verify_token | Meta verification |
| 876 | `POST /webhook/whatsapp` | none | Incoming WA messages — **logs only, does NOT parse quotes** |

### 0.2 Supplier-facing surface: **ZERO**
- No `/supplier/*`, `/portal/*`, `/public/*` routes.
- No magic-link, OTP, token, JWT, session, bcrypt, or passport imports.
- No HTML rendering (`res.render`, `sendFile`) — only JSON.
- `web/onyx-dashboard.jsx` is 100% internal admin UI (tabs: dashboard, suppliers, rfq, quotes, orders, subcontractors, sub_decide). Hardcoded to `http://localhost:3100`.
- `package.json` dependencies: express, @supabase/supabase-js, dotenv, cors. **No auth libs, no file-upload libs (multer/busboy), no template engine, no rate limiter.**

### 0.3 How suppliers currently interact (reconstructed from code)
```
Admin -> POST /api/rfq/send
      -> server sends WhatsApp text to supplier.whatsapp/phone
Supplier -> replies via WhatsApp (free-text, any format)
          -> webhook logs raw message to system_events table
Admin (manual) -> reads supplier's WA reply
               -> manually types the quote into admin UI
               -> POST /api/quotes (from admin browser)
Admin -> POST /api/rfq/:id/decide -> AI ranks
Admin -> POST /api/purchase-orders/:id/send -> PO goes out via WhatsApp
```
**The supplier never touches the system directly.** They see text messages; a human rekeys everything. This is a genuine productivity loss for N>3 suppliers per RFQ.

> Note: This dimension does not overlap with QA-WAVE1-DIRECT-FINDINGS (which audits the code that exists). This document designs code that does **not** yet exist.

---

## 1. Capabilities Matrix — MVP vs v2 vs v3

| # | Capability | MVP | v2 | v3 | Est. backend LOC | Est. frontend LOC |
|---|---|---|---|---|---|---|
| C1 | View inbound RFQ (read-only) | Y | Y | Y | 40 | 120 |
| C2 | Submit quote (line items + totals) | Y | Y | Y | 150 | 350 |
| C3 | Attach PDF/image to quote | Y | Y | Y | 90 | 80 |
| C4 | View their PO once awarded | Y | Y | Y | 40 | 140 |
| C5 | Acknowledge PO ("I accept / I decline") | Y | Y | Y | 60 | 80 |
| C6 | Upload invoice against PO | - | Y | Y | 140 | 180 |
| C7 | View payment status | - | Y | Y | 30 | 90 |
| C8 | View delivery ETA / mark shipped | - | Y | Y | 110 | 170 |
| C9 | Counter-offer / negotiation thread | - | Y | Y | 240 | 300 |
| C10 | Multi-user (2-5 users per supplier) | - | Y | Y | 180 | 160 |
| C11 | Notification prefs (WA/SMS/email) | - | Y | Y | 70 | 110 |
| C12 | Onboarding wizard (new supplier signup) | - | - | Y | 200 | 380 |
| C13 | Catalog self-maintenance | - | - | Y | 160 | 290 |
| C14 | Dispute / issue ticketing | - | - | Y | 180 | 240 |
| C15 | Analytics for supplier (win rate, avg price vs market) | - | - | Y | 130 | 200 |

**MVP totals:** ~380 backend LOC, ~770 frontend LOC, ~1,150 LOC total.
**v2 totals:** ~1,150 backend LOC, ~1,990 frontend LOC, ~3,140 LOC total.
**v3 totals:** ~1,820 backend LOC, ~3,100 frontend LOC, ~4,920 LOC total.

---

## 2. Authentication Model — Recommendation

Four candidate models evaluated:

| # | Model | Pros | Cons | Verdict |
|---|---|---|---|---|
| A | **Magic link (stateless JWT in URL)** | No password, no Supabase Auth dependency, works for WA/SMS/email delivery, 1-hour expiry | Links may be forwarded; need one-time-use claim | **Recommended for MVP** |
| B | Supabase Auth (email/OTP) | Handled infra, free tier | Adds user_id -> supplier_id mapping table; suppliers must remember to check an inbox they don't have | v2 when multi-user arrives |
| C | Password login | Familiar | Suppliers will reuse weak passwords; support burden | Rejected |
| D | SMS OTP only | Zero-friction, phone already in `suppliers` table | Twilio/WA OTP cost, no desktop fallback | Good companion to A |

**MVP recommendation — Model A + D hybrid:**
1. Admin clicks "Send RFQ" -> server generates `supplier_access_tokens` row:
   - `token` (ULID, 26 chars), `supplier_id`, `rfq_id`, `expires_at` (72h), `used_at`, `scope` ('view_rfq','submit_quote').
2. WA/SMS/email message contains: `https://portal.onyx.co.il/s/<token>`.
3. Server middleware `requireSupplierToken` validates and hydrates `req.supplier` + `req.allowedRfqId`.
4. On submit, token is **not** burned (supplier may edit within window), but `used_at` is updated each call and any call after `expires_at` returns 410 Gone.
5. Optional: on first click, server SMSs a 6-digit OTP to `supplier.phone` for step-up when scope includes `view_payment` or `upload_invoice`.

**Important defaults:**
- Tokens are **per-RFQ**, not per-supplier-global. A token sees exactly one RFQ.
- Tokens must be HTTPS-only and never logged to `system_events` (currently the webhook logs full message bodies — same mistake would leak links).
- Revocation: `supplier_access_tokens.revoked_at`.

---

## 3. URL Structure

| Pattern | Use | Notes |
|---|---|---|
| `GET  /s/:token` | Landing (resolves token -> dashboard) | Public, no CORS |
| `GET  /portal/rfq/:rfqId` | View RFQ | Needs valid token cookie |
| `POST /portal/rfq/:rfqId/quote` | Submit quote | Idempotent via `Idempotency-Key` |
| `POST /portal/rfq/:rfqId/quote/:quoteId/attachments` | Upload file | multer, 10 MB limit |
| `GET  /portal/po/:poId` | View PO | Token scope check |
| `POST /portal/po/:poId/ack` | Accept / decline PO | |
| `POST /portal/po/:poId/invoice` | Upload invoice (v2) | |
| `GET  /portal/me` | Supplier profile (v2) | Requires long-lived session |
| `POST /portal/login` | v2: email+OTP login (supabase) | |

**Do NOT** use `/api/...` prefix for supplier routes — keep a hard split so that existing (unauthenticated!) `/api/*` admin routes can be network-restricted later without breaking the portal.

---

## 4. Permission Scoping — Critical Table

Since today's server has **zero auth**, the portal introduces the first real authorization layer in the codebase. Baseline rules:

```
SELECT rules (all enforced server-side, NOT RLS-only):
  rfqs WHERE id IN (SELECT rfq_id FROM rfq_recipients WHERE supplier_id = :me)
  supplier_quotes WHERE supplier_id = :me
  purchase_orders WHERE supplier_id = :me AND status IN ('sent','confirmed','shipped','delivered','closed')
  purchase_request_items JOIN rfqs ON ... WHERE supplier_id = :me
  audit_log — NEVER readable by supplier
  suppliers — only WHERE id = :me (and only non-sensitive cols: name, contact_person, address; NOT rating, NOT reliability scores, NOT internal notes)
```

**Forbidden from supplier view:**
- Competitor quotes / scores / ranks.
- `weighted_score`, `price_score`, `reliability_score` columns.
- Internal `notes`, `tags`, `overall_score` on suppliers.
- Any other supplier's existence (search for "supplier_id !=" filters before every query).

**Recommended implementation:** a `withSupplierScope(req, query)` helper that auto-appends `.eq('supplier_id', req.supplier.id)` to every Supabase call in `/portal/*` routes. Missing one filter = data leak.

**RLS reality check:** current codebase uses `SUPABASE_ANON_KEY` without RLS hints visible in code. Before launching the portal, **every table** the portal reads needs RLS policies as a defense-in-depth second layer. Cost: ~200 LOC of SQL policies + migration + tests.

---

## 5. Multi-User Per Supplier (v2)

Real suppliers often have: a sales rep (quotes), a warehouse manager (shipping confirmations), an AR clerk (invoices). Schema additions:

```sql
CREATE TABLE supplier_users (
  id uuid PRIMARY KEY,
  supplier_id uuid REFERENCES suppliers(id),
  email text,
  phone text,
  full_name text,
  role text CHECK (role IN ('owner','sales','warehouse','finance','viewer')),
  created_at timestamptz,
  last_login_at timestamptz,
  invited_by uuid,
  status text CHECK (status IN ('invited','active','disabled'))
);

CREATE TABLE supplier_user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES supplier_users(id),
  jwt_id text,
  issued_at timestamptz,
  expires_at timestamptz,
  ip inet,
  ua text,
  revoked_at timestamptz
);
```

Permissions per role:
| Action | owner | sales | warehouse | finance | viewer |
|---|---|---|---|---|---|
| View RFQ | Y | Y | Y | - | Y |
| Submit quote | Y | Y | - | - | - |
| Ack PO | Y | Y | Y | - | - |
| Mark shipped | Y | - | Y | - | - |
| Upload invoice | Y | - | - | Y | - |
| See payment status | Y | - | - | Y | - |
| Invite users | Y | - | - | - | - |

Effort: ~400 LOC (mostly auth middleware + invite flow + audit).

---

## 6. Quote Submission UX

**Form shape (mirrors current `supplier_quotes` + `quote_line_items` schema):**
```
Quote submit form:
  [auto] RFQ ID: RFQ-XXXX
  [auto] Supplier: <hydrated from token>

  Line items table (dynamic rows):
    Item name (prefilled from purchase_request_items, editable)
    Quantity (prefilled, editable)
    Unit
    Unit price* (numeric, ILS)
    Discount % (optional)
    Line total (auto = qty * price * (1 - disc%))
    Note (optional)

  Delivery:
    [x] Free delivery   OR   Delivery fee: ___
    Delivery time (days): ___

  Tax:
    [x] Price includes VAT  (if unchecked, server adds 18%)

  Payment terms: dropdown [net 30 | net 45 | net 60 | upon delivery | prepay]

  Notes to buyer (textarea, 1000 chars)

  Attachments: drop zone (PDF/JPG/PNG, max 10 MB each, max 5 files)
  Validity period: dropdown [24h | 48h | 7d | 14d | 30d]

  [Save draft]  [Submit quote]
```

**Hebrew-first rules:**
- All labels RTL, Rubik font (already used in admin UI).
- Numeric inputs use LTR direction inside RTL row.
- Date/time: `he-IL` locale, 24-hour.
- Currency: `₪` prefix.
- Error text: Hebrew with English technical code in parentheses for support.

**Mobile-first rules (cross-ref Agent 36):**
- Line item table collapses to card-per-row below 640 px.
- Sticky "Submit" button at bottom on mobile.
- File picker uses `capture="environment"` so Android/iOS open the camera.
- No hover-only affordances.

---

## 7. Counter-Offer / Negotiation Thread (v2)

Simplest model: `supplier_quotes` gains `parent_quote_id` and `round`. Admin can POST a "please revise" action with a `counter_message` (free text), which creates a placeholder record with `status='counter_requested'`, notifies supplier, and opens the form pre-filled with previous values. Thread is linear, not branching.

Schema delta:
```sql
ALTER TABLE supplier_quotes ADD COLUMN parent_quote_id uuid REFERENCES supplier_quotes(id);
ALTER TABLE supplier_quotes ADD COLUMN round smallint DEFAULT 1;
ALTER TABLE supplier_quotes ADD COLUMN counter_message text;
ALTER TABLE supplier_quotes ADD COLUMN status text; -- submitted, counter_requested, superseded, rejected, accepted
```

A negotiation feed UI shows each round as a message bubble with timestamp and author.

---

## 8. Invoice Upload — Cross-Reference Agent 47

Agent 47 is the file-upload audit. Current repo has **no multer dependency**, no upload endpoint, no storage bucket config, no virus scanning, no MIME allowlist, no size cap. The portal will need:

- Supabase Storage bucket `supplier-invoices` (or S3/R2).
- Server-side MIME sniffing (not just Content-Type header).
- Max size 25 MB (invoices can include images).
- Filename sanitization (strip path traversal, normalize Hebrew Unicode NFC).
- Antivirus scan (ClamAV daemon or VirusTotal API) — **mandatory** before accepting.
- SHA-256 hash stored for dedup and tamper detection.
- Separate `invoices` table:
  ```sql
  CREATE TABLE invoices (
    id uuid PRIMARY KEY,
    po_id uuid REFERENCES purchase_orders(id),
    supplier_id uuid REFERENCES suppliers(id),
    uploaded_by_user_id uuid,
    original_filename text,
    storage_path text,
    sha256 text,
    size_bytes bigint,
    invoice_number text,
    invoice_date date,
    gross_amount numeric(12,2),
    vat_amount numeric(12,2),
    currency text DEFAULT 'ILS',
    status text CHECK (status IN ('received','validated','approved','rejected','paid')),
    ocr_json jsonb,
    created_at timestamptz DEFAULT now()
  );
  ```

**Blocks to resolve before building C6:** Agent 47 findings must land first. Estimated effort for upload infra alone: ~300 LOC + bucket setup + ClamAV container.

---

## 9. Payment Status Visibility

Requires a `payments` (or `po_payments`) table which **does not exist** in the codebase today. Design:
```sql
CREATE TABLE po_payments (
  id uuid PRIMARY KEY,
  po_id uuid REFERENCES purchase_orders(id),
  invoice_id uuid REFERENCES invoices(id),
  amount numeric(12,2),
  paid_at timestamptz,
  method text, -- bank_transfer, check, cash
  reference text,
  created_by uuid
);
```
Supplier portal view shows: "Invoice INV-123 — received 2026-04-01 — approved 2026-04-05 — **payment due 2026-05-05** — status: pending." No internal notes, no check numbers, only the fields the supplier owns.

Effort: ~200 LOC + admin UI to mark payments.

---

## 10. Delivery Tracking

Lightweight status machine on `purchase_orders.status`: `confirmed -> preparing -> shipped -> out_for_delivery -> delivered`. Supplier can:
- Mark "shipped" + enter shipment reference + ETA.
- Upload proof-of-delivery photo.
- Optional: Waze/Google Maps link (pastable text).

No real-time GPS tracking in scope — that requires an external carrier integration (~1 month effort per carrier). Skip.

---

## 11. Hebrew + English UI

- i18n lib: `i18next` + `react-i18next` (or `formatjs`). ~5 KB gzipped.
- JSON catalogs: `he.json`, `en.json`. MVP ~120 keys; v3 ~400 keys.
- RTL handling: `dir="rtl"` based on locale; logical CSS (`margin-inline-start`, `padding-inline-end`) everywhere.
- Date/time: `Intl.DateTimeFormat` with locale switch.
- Currency: `₪` for ILS always; show supplier's preferred currency in v3 (supplier can have USD/EUR prices).
- Form validation messages localized.
- Font: Rubik (already used) supports Hebrew + Latin.

Adds ~250 frontend LOC + ~200 LOC of translation keys. Keep locale in URL (`/he/...`, `/en/...`) or in user profile once multi-user arrives.

---

## 12. Mobile-First (cross-ref Agent 36)

Agent 36 owns responsive audit. Portal specifics:
- Breakpoints: 360, 640, 1024, 1440.
- Min tap target 44x44 px.
- Line item table -> stacked cards below 640.
- Sticky CTAs at bottom on mobile.
- File upload must work on iOS Safari (no `<input type="file" webkitdirectory>`).
- Test on low-end Android (suppliers in Israel commonly use 3-year-old Samsung/Xiaomi).
- Lighthouse mobile score >= 85.

The current admin `onyx-dashboard.jsx` uses inline styles and fixed widths — **not reusable** for mobile portal. Build a new component tree.

---

## 13. Notification Preferences (cross-ref Agent 52)

Supplier portal needs:
```sql
CREATE TABLE supplier_notification_prefs (
  supplier_user_id uuid PRIMARY KEY REFERENCES supplier_users(id),
  channel_rfq text CHECK (channel_rfq IN ('whatsapp','sms','email','none')),
  channel_po text,
  channel_payment text,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text DEFAULT 'Asia/Jerusalem',
  digest_mode text CHECK (digest_mode IN ('immediate','hourly','daily'))
);
```

Today, `suppliers.preferred_channel` exists (whatsapp/sms) but it's a single flat field, not per-event. Upgrade at portal launch.

Agent 52 handles the notification engine itself; portal just provides the **preferences surface**.

---

## 14. Onboarding via Portal (cross-ref Agent 53)

Agent 53 owns onboarding. Portal touch points:
- Admin generates an invite token -> supplier clicks -> fills a 4-step wizard:
  1. Company info (name, tax ID, address) — validates Israeli HP number (`\d{9}`).
  2. Primary contact + verification OTP.
  3. Categories served (multi-select from `supplier_products.category` list).
  4. Upload docs: business license, insurance, NDA (optional).
- After submit, supplier is status `pending_approval`. Admin reviews in dashboard, flips to `active`. RFQs only route to `active` suppliers.

Effort: ~600 LOC.

---

## 15. SOC 2 / Data Isolation for B2B

If Onyx evolves into a multi-tenant B2B product (serving multiple buyer companies, not only Techno Kol Uzi), the portal must enforce:

1. **Row-level tenant isolation** — every row gains `tenant_id`; every query filters on it. Supabase RLS + app-layer `withTenant()` wrapper.
2. **Audit completeness** — every supplier portal action writes to `audit_log` with `actor_type='supplier_user'`, `actor_id`, `ip`, `ua`, `route`, `entity`, `before`, `after`. Current `audit()` helper (server.js:99) covers 5 of 7 fields; missing `ip` and `ua`.
3. **Encryption at rest** — Supabase provides this for DB; bucket objects need server-side encryption flag.
4. **Encryption in transit** — TLS 1.2+ enforced; HSTS header; no cleartext WhatsApp links (tokens expose data if WA device is stolen, but that's an accepted risk of the channel).
5. **Access review cadence** — quarterly review of `supplier_users.status='active'`.
6. **Incident response runbook** — cross-ref Agent 22.
7. **Sub-processor list** — Supabase, Meta (WhatsApp), Twilio, ClamAV, storage provider. Must publish.
8. **DPA with each supplier** — legal, not engineering.
9. **Pen test** — cross-ref Agent 30 once portal ships.
10. **SOC 2 Type II** itself is ~$40k + 6 months observation. Worth it only if selling to enterprises.

**Engineering cost of SOC 2 readiness for the portal slice:** ~1,200 LOC (audit logging, IP/UA capture, tenant isolation helpers, RLS policies, rate limiting, session revocation, password policies if v2 login lands).

---

## 16. Cross-Cutting Risks Identified During Analysis

### R1. **Existing admin `/api/*` has ZERO auth** (severity: CRITICAL, pre-existing)
QA Wave 1 likely covers this, but re-flagging because introducing the portal without first fixing the admin surface would expose both. Every `/api/suppliers`, `/api/quotes`, `/api/rfq/send` etc. is open to any network caller. Today it's only bound to `http://localhost:3100`, but the moment it's deployed publicly, **anyone can POST quotes on behalf of any supplier**. Portal design assumes this is fixed first.

### R2. **Token in URL leaks via referer / history / WA forwarding** (severity: HIGH)
Magic links sent over WhatsApp can be screenshot, forwarded to group chats, copy-pasted. Mitigations:
- Short TTL (72h).
- Bind token to supplier phone on first use (device fingerprint or OTP step-up).
- Rate limit `/s/:token` to 10 requests/min per IP.
- Log all first-uses with IP/UA, alert on mismatch.

### R3. **Quote price tampering via MITM** (severity: MEDIUM)
Enforce HTTPS everywhere, HSTS, and server-side recomputation of totals (current admin `POST /api/quotes` already recomputes — good pattern to keep).

### R4. **File upload attack surface** (severity: HIGH, depends on Agent 47)
See section 8. Without ClamAV + MIME sniffing + filename sanitization, one malicious PDF compromises the bucket.

### R5. **No rate limiting anywhere in codebase** (severity: HIGH, pre-existing)
`package.json` has no `express-rate-limit`. Portal must add it per-route:
- `/s/:token`: 10/min/IP.
- `/portal/rfq/:id/quote`: 5/min/supplier.
- `/portal/po/:id/invoice`: 3/min/supplier.

### R6. **`system_events` logs full WA message bodies** (severity: MEDIUM, pre-existing, line 892)
Currently: `message: 'הודעה מ-' + from + ': ' + text.slice(0, 200)`. If suppliers click magic links over WhatsApp and reply with the same message (rare but possible), the token fragment could land in the event log. Portal link format should avoid echoing tokens in any WA message body.

### R7. **Frontend hardcodes `http://localhost:3100`** (severity: LOW, but will block portal launch)
`web/onyx-dashboard.jsx:3` — `const API = "http://localhost:3100"`. Portal frontend must use env config (`VITE_API_URL` / `NEXT_PUBLIC_API_URL`).

### R8. **No CSRF protection** (severity: MEDIUM)
Admin UI and future portal both POST JSON from browser. Token-in-URL portal is somewhat CSRF-resistant (attackers don't have the token), but multi-user v2 with cookies needs CSRF tokens or SameSite=Strict.

### R9. **Supplier quote injection via WA webhook is unparsed** (severity: LOW, design note)
Line 876: `/webhook/whatsapp` only logs. If portal goes live, WA replies become noise. Decide: either ignore WA replies entirely (portal-only), or parse them into draft quotes with `needs_review=true`.

---

## 17. Effort Estimate

### MVP (C1–C5) — "Supplier clicks a link, sees RFQ, submits quote"
- Backend: ~380 LOC (routes + token middleware + validation + audit).
- Frontend: ~770 LOC (3 screens: RFQ view, quote form, thank-you/confirm).
- SQL: ~80 LOC (1 new table `supplier_access_tokens`, 2 column additions, 3 indexes).
- Tests: ~250 LOC (unit for token validation, 3 E2E flows).
- Infra: magic-link delivery via existing `sendWhatsApp`/`sendSMS`/add `sendEmail`.
- **Total:** ~1,480 LOC.
- **Team effort (1 full-stack senior):** **3.5 – 4.5 weeks** including QA and Hebrew copywriting. With prior security fixes (R1, R5, R8): **5 – 6 weeks**.

### v2 (+ C6–C11)
- Backend: +770 LOC.
- Frontend: +1,220 LOC.
- SQL: +180 LOC (4 new tables, 8 column additions).
- Infra: file storage bucket, ClamAV container, email provider, i18n setup.
- **Total incremental:** ~2,170 LOC.
- **Team effort:** **+6 – 8 weeks** (1 senior + 0.5 designer).

### v3 (+ C12–C15 + SOC 2 readiness)
- Backend: +670 LOC + ~1,200 LOC SOC 2 plumbing.
- Frontend: +1,110 LOC.
- SQL: +120 LOC.
- **Total incremental:** ~3,100 LOC.
- **Team effort:** **+10 – 14 weeks** (1 senior + 0.5 frontend + 0.25 compliance consultant).

### Cumulative to a production B2B portal
- **Lines of code:** ~6,750 LOC (app) + 1,200 LOC (SOC 2) = ~**8,000 LOC**.
- **Wall-clock with one engineer:** ~**20 – 26 weeks**.
- **Wall-clock with a team of 2 (backend + frontend) + 0.25 designer:** ~**12 – 16 weeks**.

---

## 18. Sequencing Recommendation

1. **Week 0** (prerequisite, not in portal budget): fix R1 (add auth middleware to `/api/*`), R5 (rate limiting), R7 (env config). ~2 weeks.
2. **Weeks 1-5**: MVP (sections 1 capabilities C1-C5, sections 2-4, 6, 10).
3. **Weeks 6-12**: v2 multi-user + invoices + payment visibility (sections 5, 7-9, 11, 13).
4. **Weeks 13-24**: v3 onboarding + SOC 2 readiness + analytics (sections 14-15).

Gate each phase on: security review, RTL QA, mobile QA, Hebrew copy review, pen test (at least of the new surface).

---

## 19. Files Referenced
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\server.js` (935 LOC, 30 routes, no auth)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\web\onyx-dashboard.jsx` (admin-only, fixed layout, hardcoded localhost)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\package.json` (4 deps, no auth/upload/rate-limit libs)

## 20. Cross-Agent Dependencies
- **Agent 36** (mobile/responsive) — portal is mobile-first, shared breakpoints and component library.
- **Agent 47** (file upload) — portal invoice upload blocks on Agent 47 recommendations.
- **Agent 52** (notifications) — portal exposes the prefs surface; Agent 52 owns delivery engine.
- **Agent 53** (onboarding) — portal hosts the wizard; Agent 53 owns flow logic.
- **Agent 22** (incident response) — SOC 2 readiness needs portal-specific runbooks.
- **Agent 30** (pen test) — portal requires pen test at MVP launch and again before v3.
- **QA Wave 1 Direct Findings** — do not re-report the pre-existing zero-auth risk; this doc assumes Wave 1 catches it.

---

*End of QA Agent #54 report — Supplier Self-Service Portal (forward-looking design).*
