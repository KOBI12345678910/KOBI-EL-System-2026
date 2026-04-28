# AGENT-239 — Events Domain DDL

**Date:** 2026-04-29
**Scope:** Generate DDL closing the Events domain gap reported by AGENT-128 (verdict: "DOMAIN ABSENT"). Four tables, QR HMAC ticket flow, attendance tracking.
**Output:** `supabase/migrations/00079_events_domain.sql`
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Verdict:** **DDL DELIVERED.** 4 tables created, 5 status state-machines encoded as CHECK constraints, QR HMAC fields modelled, attendance trail wired, RLS enabled with 3 baseline policies per table, idempotent.

---

## 1. Files written

| Path | Lines | Purpose |
|---|---|---|
| `supabase/migrations/00079_events_domain.sql` | 287 | DDL for `events_events`, `events_speakers`, `events_tickets`, `events_registrations` plus RLS bootstrap |
| `_qa-reports-25/AGENT-239-events-ddl.md` | this | Audit report |

Migration number `00079` selected because the live sequence stops at `00074_hotel_domain_complete.sql` and Agent 128 follow-up requested `00079`; intermediate slots `00075–00078` remain free for parallel domain agents (auto, banking, food, sports per `_qa-reports-25/AGENT-12{4..6}` reports already filed).

---

## 2. Tables created

### 2.1 `public.events_events` — event / conference master
- **PK:** `id bigserial`, **public_id:** `uuid`
- **Tenant:** `tenant_id bigint not null` + index
- **Identity:** `event_code` (unique per tenant), `name_he`, `name_en`
- **Type:** `event_type` CHECK in 9 values (conference, webinar, seminar, workshop, meetup, training, exhibition, launch, gala)
- **Time:** `starts_at`, `ends_at`, `timezone` (default `Asia/Jerusalem`), CHECK `ends_at >= starts_at`
- **Capacity:** `capacity`, `registered_count`, `attended_count` with CHECK `attended_count <= registered_count`
- **Lifecycle:** `status` CHECK in 8 values (`draft → published → registration_open → registration_closed → in_progress → completed`, plus `cancelled`, `postponed`)
- **Revenue link:** `currency_code` (ILS default), `customer_id`, `organizer_id`
- **Audit columns:** `is_active, is_deleted, record_code, metadata, created_by, updated_by, created_at, updated_at`
- **Indexes:** tenant, status, starts_at, type+is_active, customer

### 2.2 `public.events_speakers` — speakers per event (M:1 to event)
- **FK:** `event_id` → `events_events(id)` ON DELETE CASCADE
- **Identity:** `full_name`, `title`, `organization`, `bio`, `email`, `phone`, `photo_url`
- **Session:** `session_title`, `session_starts_at`, `session_ends_at`
- **Fee:** `fee_amount`, `currency_code`, `payment_status` CHECK in 6 values, `contract_signed`
- **Lifecycle:** `status` CHECK in 7 values (`invited → confirmed → presented`, plus `declined`, `withdrawn`, `no_show`, `cancelled`)
- **UX flags:** `is_keynote`, `display_order`
- **Indexes:** tenant, event, status, payment, email

### 2.3 `public.events_tickets` — saleable ticket types per event
- **FK:** `event_id` → `events_events(id)` ON DELETE CASCADE
- **Identity:** `ticket_code` (unique per tenant+event), `name_he`, `name_en`
- **Type:** `ticket_type` CHECK in 10 values (standard, vip, early_bird, student, speaker, staff, sponsor, press, complimentary, group)
- **Pricing:** `price`, `currency_code` (ILS), `vat_included`, `vat_rate` (default 18.00 — Israeli VAT 2026 alignment with `ISRAELI_TAX_CONSTANTS_2026.md`)
- **Inventory:** `quantity_total`, `quantity_sold`, `quantity_held` with CHECK `sold + held <= total`
- **Sales window:** `sales_start_at`, `sales_end_at` with CHECK `end >= start`
- **Order rules:** `min_per_order`, `max_per_order`, `is_transferable`, `is_refundable`, `refund_deadline_at`
- **Lifecycle:** `status` CHECK in 6 values (`draft → on_sale → sold_out / sales_closed`, plus `suspended`, `retired`)
- **Indexes:** tenant, event, status, type+is_active, sales window

### 2.4 `public.events_registrations` — attendee registration + QR + attendance
- **FKs:** `event_id` → `events_events`, `ticket_id` → `events_tickets`, both ON DELETE RESTRICT (preserve audit trail)
- **Attendee identity:** `customer_id` (CRM link, optional), `attendee_name`, `attendee_email`, `attendee_phone`, `attendee_company`, `attendee_title`, `dietary_prefs`, `accessibility_notes`
- **Pricing snapshot at issue time:** `amount_paid`, `currency_code`, `vat_amount`, `payment_method` CHECK in 7 values, `payment_reference`, `invoice_id`
- **Registration code:** `registration_code` (unique per tenant)
- **Lifecycle:** `status` CHECK in 9 values (`pending → confirmed → paid → checked_in`, plus `no_show`, `cancelled`, `refunded`, `transferred`, `void`)

#### QR HMAC ticket flow — 9 columns
| Column | Type | Purpose |
|---|---|---|
| `qr_token` | text NOT NULL, unique per tenant | Public-facing opaque token (printed/shown in app); presented to scanner |
| `qr_hmac` | text NOT NULL | Server-side HMAC digest of `(tenant_id, event_id, registration_id, qr_nonce, qr_issued_at)` keyed by server secret |
| `qr_nonce` | text NOT NULL | Per-token nonce for anti-replay / forgery resistance |
| `qr_algorithm` | text NOT NULL default `HS256` (CHECK in HS256/HS384/HS512) | Algorithm tag — supports rotation |
| `qr_version` | integer NOT NULL default 1 | Schema version for forward compat (e.g. v2 adds rotating-secret window) |
| `qr_issued_at` | timestamptz NOT NULL default now() | When the token was minted |
| `qr_expires_at` | timestamptz | NULL = no expiry; CHECK `>= qr_issued_at` |
| `qr_revoked_at` | timestamptz | Revocation timestamp |
| `qr_revoke_reason` | text | Free text |

DDL stores only the digest + metadata. HMAC compute uses the server secret in app code (not in DDL/RLS) — same pattern as JWT signing keys never persisted in the DB.

#### Attendance tracking — 7 columns
| Column | Type | Purpose |
|---|---|---|
| `attended` | boolean NOT NULL default false | Final attended flag |
| `checked_in_at` | timestamptz | Set on first successful scan |
| `checked_in_by` | bigint | Operator user id |
| `check_in_location` | text | Venue / room / gate name |
| `check_in_device_id` | text | Tablet/handheld scanner id (offline queue reconciliation) |
| `check_in_gate` | text | Specific gate or door |
| `scan_count` | integer NOT NULL default 0 | Replay counter — every scan increments |
| `last_scan_at` | timestamptz | Most recent scan |
| `last_scan_result` | text | CHECK in 7 values: admitted, duplicate, expired, revoked, invalid_hmac, wrong_event, rejected |

CHECK constraint `attended = false OR checked_in_at IS NOT NULL` enforces consistency: cannot mark attended without a check-in time.

- **Indexes:** tenant, event, ticket, customer, status, email, qr_token, (event,attended), (event,checked_in_at), invoice

---

## 3. Status state-machines encoded

| Table | Field | States | Count |
|---|---|---|---|
| `events_events` | `status` | draft, published, registration_open, registration_closed, in_progress, completed, cancelled, postponed | 8 |
| `events_speakers` | `status` | invited, confirmed, declined, withdrawn, presented, no_show, cancelled | 7 |
| `events_speakers` | `payment_status` | pending, contracted, invoiced, paid, waived, cancelled | 6 |
| `events_tickets` | `status` | draft, on_sale, sold_out, sales_closed, suspended, retired | 6 |
| `events_registrations` | `status` | pending, confirmed, paid, checked_in, no_show, cancelled, refunded, transferred, void | 9 |

5 state machines, 36 named states. Transitions to be wired in `onyx-procurement/src/pipeline/state-machines.js` in a follow-up task (out of scope for DDL).

---

## 4. Cross-table integrity invariants

| Invariant | Mechanism |
|---|---|
| Event time window valid | CHECK `events_events.ends_at >= starts_at` |
| Attended cannot exceed registered | CHECK `attended_count <= registered_count` |
| Ticket inventory cannot oversell | CHECK `quantity_sold + quantity_held <= quantity_total` |
| Sales window monotonic | CHECK `sales_end_at >= sales_start_at` |
| Order rules consistent | CHECK `max_per_order >= min_per_order` |
| QR expiry monotonic | CHECK `qr_expires_at >= qr_issued_at` |
| Attended implies check-in time | CHECK `attended = false OR checked_in_at IS NOT NULL` |
| Refund non-negative | CHECK `refund_amount IS NULL OR refund_amount >= 0` |
| Unique ticket code per event | UNIQUE `(tenant_id, event_id, ticket_code)` |
| Unique registration code | UNIQUE `(tenant_id, registration_code)` |
| Unique QR token | UNIQUE `(tenant_id, qr_token)` |

---

## 5. RLS bootstrap

3 baseline policies per table (12 total), applied via DO-block loop (matches the `00074_hotel_domain_complete.sql` pattern):

| Policy suffix | Role | Action | USING / WITH CHECK |
|---|---|---|---|
| `_read_auth` | authenticated | SELECT | `true` |
| `_insert_auth` | authenticated | INSERT | `true` |
| `_service_all` | service_role | ALL | `true` |

Per `00068_harden_rls_policies_always_true.sql` and `00071_remove_dangerous_anon_read_policies.sql`, follow-up migration must replace `using (true)` with tenant-scoped predicates and remove anon access (which is already absent here — only `authenticated` and `service_role` are granted).

---

## 6. Idempotency guarantees

- All `CREATE TABLE` use `IF NOT EXISTS`
- All indexes use `IF NOT EXISTS`
- All CHECK constraints inline on column definition (no DO-block needed — table itself is gated by `IF NOT EXISTS`)
- RLS policy creation wrapped in `EXCEPTION WHEN duplicate_object THEN NULL`

Re-running the migration is safe.

---

## 7. Israeli compliance hooks (DDL surface)

- `vat_rate` default `18.00` aligns with the constant in `ISRAELI_TAX_CONSTANTS_2026.md` (Israel VAT 2026 = 18%)
- `vat_included` boolean lets the app emit gross or net pricing
- `currency_code` default `'ILS'` on every row that holds money
- `invoice_id` column is reserved for join to the existing `invoices` table — Finance integration (per AGENT-128 §6 "missing cross-service contract #1: ticket sale → invoice")
- `payment_method` CHECK includes `bank_transfer` (MASAV-friendly per AGENT-135)

The DDL does not call any tax function — VAT compute and invoice creation are app-side.

---

## 8. What this migration does NOT do (deliberately out of scope)

| Item | Why deferred |
|---|---|
| State-machine transitions in `state-machines.js` | DDL-only task; transitions are JS-side |
| Event360 / Ticket360 / Registration360 / Speaker360 pages | Frontend; AGENT-128 §7 |
| QR generator endpoint, scan endpoint | App layer; needs server secret + scanner offline queue |
| Pipeline wiring (entity-map, orchestrator action list) | Pipeline modules are JS; needs separate agent |
| `wiring-spec.js` cross-service contracts | Same — JS module update |
| Seed data / Hebrew fixtures | Not requested |
| Tenant-scoped RLS predicates | Universal `using(true)` pattern matches existing domains; follow-up via `00068/00071` style hardening |
| Triggers to keep `registered_count`, `attended_count`, `quantity_sold` in sync | Counters maintained by app code or follow-up migration |

---

## 9. Verification commands

```sql
-- Smoke test: tables exist
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'events_%'
order by table_name;
-- Expected: events_events, events_registrations, events_speakers, events_tickets

-- RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'events_%';
-- Expected: all 4 with rowsecurity = true

-- Policy count
select tablename, count(*) as policies
from pg_policies
where schemaname = 'public' and tablename like 'events_%'
group by tablename;
-- Expected: 3 each (12 total)
```

---

## 10. Files referenced

Absolute paths:
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00079_events_domain.sql` (created)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00074_hotel_domain_complete.sql` (DDL pattern source)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00068_harden_rls_policies_always_true.sql` (RLS pattern)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00071_remove_dangerous_anon_read_policies.sql` (anon hardening reference)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-128-events.md` (gap audit input)

---

## 11. Summary

- 4 tables created (`events_events`, `events_speakers`, `events_tickets`, `events_registrations`)
- 5 status state-machines (36 states total) encoded as CHECK constraints
- QR HMAC ticket flow: 9 dedicated columns (token, hmac, nonce, algorithm, version, issued/expires/revoked timestamps, revoke reason) — DDL stores digest, app computes HMAC with server secret
- Attendance tracking: 9 columns (attended bool, check-in timestamp/operator/location/device/gate, scan count + last-scan result)
- 11 cross-table integrity invariants enforced via CHECK / UNIQUE
- RLS enabled with 3 baseline policies per table (12 total)
- Idempotent — safe to re-run
- Aligned with Israeli compliance defaults (ILS, 18% VAT, MASAV payment)
- 287-line migration; report 273 lines (under 350-line limit)
