# AGENT-113 — Hotel Domain Audit

**Agent:** 113
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** `hotel_properties`, `hotel_room_types`, `hotel_rooms`, `hotel_reservations`, `hotel_housekeeping`; channel manager (Booking/Expedia); tourist-VAT zero-rate ("אפס מע"מ"); housekeeping flow.

---

## 1. Verdict — DOMAIN ABSENT

**Severity: P0 — vertical does not exist as code.**

Repeated, exhaustive searches across every service tree in the worktree
(`onyx-procurement/`, `techno-kol-ops/`, `payroll-autonomous/`, `onyx-ai/`,
`erp-app/`, `nexus_engine/`, `enterprise_palantir_core/`, `paradigm_engine/`,
`packages/`, `src/`, `supabase/migrations/`, `dev/`, `mobile-app/`) returned
**zero implementation files** for the Hotel domain.

| Artifact required | Found? | Evidence |
|---|---|---|
| `hotel_properties` table CREATE | NO | not present in any of the 72 SQL migrations |
| `hotel_room_types` table CREATE | NO | not present |
| `hotel_rooms` table CREATE | NO | not present |
| `hotel_reservations` table CREATE | NO | not present |
| `hotel_housekeeping` table CREATE | NO | not present |
| Booking.com channel manager adapter | NO | no API client, no webhook, no mapper |
| Expedia / Hotels.com adapter | NO | none |
| Tourist VAT (0% מע"מ) rule | NO | only standard 18% VAT (mig 00037) |
| Housekeeping flow / state machine | NO | not in `state-machines.js` |
| 360 page, route, action, event | NO | not in `pipeline/*.js` |

The only hits across the entire codebase that contain the word "hotel" are:

| File | Line | Context | Verdict |
|---|---|---|---|
| `techno-kol-ops/src/db/schema.sql` | 11 | `clients.type` comment lists `hotel` as one client category | Not a domain — just a CRM tag |
| `onyx-procurement/src/expenses/expense-manager.js` | 145 | OCR keyword `'hotel'` for receipt categorisation | Expense capture only |
| `onyx-procurement/QA-AGENT-143-EXPENSES.md` | 222 | `expense_categories` seed: `('HOTEL', 'לינה', '5311')` | GL account for travel expense |
| `onyx-procurement/src/realestate/valuation.js` | 243 | `cap_rate.hotel = 0.080` | Real-estate valuation, not PMS |
| `onyx-procurement/src/reports/fixtures/sample-mgmt-data.json` | 62 | Customer name `"Hotel Chain"` | Fixture data |
| `onyx-procurement/test/sales/win-loss.test.js` | 42 | Account `"Hof Hotels"` in industry `hospitality` | Test fixture |
| `erp-app/src/pages/hr/expense-claims.tsx` | — | Hotel expense claim UI | HR expense, not PMS |

**None of these constitute a hotel/PMS vertical.**

---

## 2. Where the table names DO appear

The five tables are **only** referenced in `_qa-reports-25/AGENT-09-db-integrity.md`
as items in a list of multi-tenant schema gaps:

```
_qa-reports-25/AGENT-09-db-integrity.md:97   hotel_properties.tenant_id (no index)
_qa-reports-25/AGENT-09-db-integrity.md:117  hotel_housekeeping, hotel_room_types,
                                             hotel_rooms (missing tenant_id column entirely)
```

This means: the production Supabase project (audited remotely by AGENT-09)
contains these tables — but the **DDL is not in this repository**. The 72
migrations under `supabase/migrations/00000…00071` cover commercial /
execution / procurement / inventory / finance / workforce / docs /
intelligence / governance / analytics / orchestration / comms domains, plus
ad-hoc verticals (agri, auto, ecom, edu, energy, events, food, health,
legal, log, mfg, pm, re, sec, sports). **There is no `hotel_domain_complete`
migration** equivalent to the 14 `*_domain_complete.sql` files that exist
for every other vertical.

---

## 3. Channel manager (Booking.com / Expedia) — ABSENT

Searches for `booking.com`, `expedia`, `channel.?manager`, `OTA`, `iCal`,
`HTNG`, `OpenTravel`, `Cloudbeds`, `SiteMinder`, `Rate Tiger` returned no
adapter, webhook, queue, or DTO under any service. No outbound channel
connector, no inbound reservation sync, no rate-and-availability push,
no `hotel_channel_mappings` table, no idempotent reservation upsert.

The `_qa-reports/AG-Y049-maintenance.md` and `AG-Y135-bulletin-board.md`
files contain the literal strings only as words — unrelated.

---

## 4. Tourist VAT (אפס מע"מ for foreign-passport guests) — ABSENT

The Israeli tourist-VAT exemption (Section 30(a)(8) of the VAT Law:
0% rate for hotel accommodation + breakfast for non-resident tourists
paying in foreign currency) requires:

- a `vat_rate` column on `hotel_reservations` with values `STANDARD_18`,
  `TOURIST_ZERO`, `EXEMPT`;
- guest-passport / nationality capture;
- foreign-currency payment evidence;
- separate VAT-book reporting line per `PCN874`.

**None of this exists.** Migration `00037_vat_rate_18_percent.sql` only
sets the global default rate to 18%; there is no zero-rate variant, no
tourist-validation logic, no passport-scan integration, no FX-payment
verification. The PCN874 generator (`onyx-procurement/src/finance/`)
has no `vat_rate_code` branch for tourism.

---

## 5. Housekeeping flow — ABSENT

A working housekeeping module needs at minimum:

1. State machine `room.status`: `dirty → cleaning_in_progress → clean → inspected → ready`
2. Triggers from `reservation.checkout` → `room.status = dirty`
3. Triggers from `reservation.checkin` requiring `room.status = ready`
4. Housekeeper assignment, supplies tracking, lost-and-found, deep-clean cycle
5. Event `housekeeping.room_ready` consumed by the front-desk app

`onyx-procurement/src/pipeline/state-machines.js` defines **13 state
machines, 91 transitions** — none for `room`, `reservation`, or
`housekeeping`. `pipeline-engine.js` has no hospitality stages.
`orchestrator.js` has no `assign_housekeeper` / `mark_room_clean` /
`approve_room_inspection` actions. `wiring-spec.js` has no
`hotel_*` entity mapping or 360 page contract.

---

## 6. Risk Assessment

| Risk | Severity | Note |
|---|---|---|
| Hotel tables exist in prod DB but no DDL in repo | **CRITICAL** | Schema drift — cannot recreate environment |
| No `tenant_id` on `hotel_housekeeping`, `hotel_room_types`, `hotel_rooms` | HIGH | Per AGENT-09 — multi-tenant isolation broken on these tables |
| No index on `hotel_properties.tenant_id` | HIGH | Per AGENT-09 — table-scan on every RLS evaluation |
| No PMS code path → reservations cannot be ingested, billed, or cleaned | **CRITICAL** | Domain is non-functional |
| No tourist-VAT logic → all hotel revenue would be billed at 18% in error | HIGH | Direct VAT exposure to ITA |
| No channel-manager → manual entry of every Booking/Expedia booking | HIGH | Operational impossibility at scale |

---

## 7. Required Remediation (P0 — full vertical build)

Mirror the structure of every other completed vertical (`00043` through
`00066`). Recommended migrations and code:

### Migrations

- `00072_hotel_domain_complete.sql` — create `hotel_properties`,
  `hotel_room_types`, `hotel_rooms`, `hotel_reservations`,
  `hotel_housekeeping`, plus `hotel_rate_plans`, `hotel_channel_mappings`,
  `hotel_guests`, `hotel_folios`, `hotel_night_audit_runs`. Include
  `tenant_id uuid NOT NULL` + FK + index on every table.
- `00073_hotel_menu_wiring.sql` — register Hotel360, Reservation360,
  Room360, Housekeeping360 pages in `app_menu`.
- `00074_hotel_rls_policies.sql` — tenant-scoped RLS, never `USING (true)`.
- `00075_hotel_vat_tourism.sql` — add `vat_rate_code` enum
  (`STANDARD_18`, `TOURIST_ZERO`, `EXEMPT`) on `hotel_reservations` and
  `hotel_folios`; helper `is_tourist_eligible(guest_id, payment_currency)`.

### Code (under `onyx-procurement/src/hotel/`)

- `pms-engine.js` — reservation lifecycle CRUD + folio
- `housekeeping.js` — room state machine + assignment optimiser
- `channel-manager/booking-com.js`, `channel-manager/expedia.js` —
  rate-and-availability push, reservation pull, idempotent upsert
- `night-audit.js` — daily close, no-shows, room-revenue posting to GL
- `tourist-vat-validator.js` — passport + FX-payment evidence check

### Pipeline wiring

- Add 4 entities to `entity-map.js`: `hotel_property`, `hotel_room`,
  `hotel_reservation`, `hotel_housekeeping_task`.
- Add 4 state machines to `state-machines.js`:
  `room`, `reservation`, `housekeeping_task`, `folio`.
- Add 1 workflow to `workflow-flows.js`:
  `Booking → Check-in → Stay → Check-out → Folio → Payment → Night-audit`.
- Add 6 actions to `orchestrator.js`: `create_reservation`,
  `check_in`, `check_out`, `assign_housekeeper`, `mark_room_clean`,
  `run_night_audit`.

### 360 pages

`Hotel360`, `Reservation360`, `Room360`, `Housekeeping360` —
each with header+status, primary actions, related records, audit log.

---

## 8. Conclusion

The Hotel domain is a **named-but-empty vertical**. Production tables exist
remotely (per AGENT-09) but the entire schema, RLS, business logic, channel
integrations, VAT rules, housekeeping workflow, and UI are missing from this
repository. Per the CLAUDE.md "No Dead Pages Rule" and the Master Flow
contract, this fails the audit on every dimension.

**Recommendation:** Build the vertical end-to-end before any deployment that
references hotel revenue. Until then, the AGENT-09 multi-tenant gaps for
the four hotel tables remain blockers.

---

**End of report — AGENT-113**
