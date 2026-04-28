# AGENT-128 — Events Domain Audit

**Date:** 2026-04-29
**Scope:** Audit the Events domain (conference / event management) covering tables `events_events`, `events_speakers`, `events_tickets`, `events_registrations`, plus the ticketing flow, QR-code generation/scan, and attendance tracking.
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Verdict:** **DOMAIN ABSENT.** No `events_*` tables, no event-management module, no ticket/QR/attendance flow exists in any of the four services (TECHNO_KOL_OPS, ONYX_PROCUREMENT, PAYROLL_AUTONOMOUS, ONYX_AI). The "Events" capability is a P-non-existent gap, not P0/P1/P2.

---

## 1. Targeted artefacts and what was actually found

| Expected artefact | Search performed | Result |
|---|---|---|
| Table `events_events` | grep across repo | **0 hits** in any `.sql`, `.js`, `.ts`, `.tsx`, `.md` |
| Table `events_speakers` | grep across repo | **0 hits** |
| Table `events_tickets` | grep across repo | **0 hits** |
| Table `events_registrations` | grep across repo | **0 hits** |
| Conference/event-management module | dir scan + grep `conference\|webinar\|seminar` | No module; 7 unrelated files (lead-scoring, customer advocacy, meeting-scheduler) |
| QR ticket scan flow | grep `qr_code\|qr_token\|attendee_check_in` | Only `lib-client/db/src/schema/work-order-qr-codes.ts` (work-order QR, not event ticket) |
| Attendance tracking | grep `attendance` | None for events; payroll has `attendance` (employee time) — different domain |

The literal token `events_` matches only:
- `system_events` table (event-sourcing audit log) — `onyx-procurement/supabase/migrations/001-supabase-schema.sql:355-367`
- `domain-events.js` / `event-bus.js` (in-process pub-sub) — `onyx-procurement/src/wiring/`
- Index names `idx_events_type`, `idx_events_severity` on `system_events`

None of these are conference / ticketed-event entities.

---

## 2. What "events" means in this codebase (and what it doesn't)

Three orthogonal usages of the word "event" exist; **none** is the audited domain:

1. **System / domain events (event-sourcing)** — `system_events` table, `EventBus` (`onyx-procurement/src/wiring/event-bus.js`, 739 LOC), `domain-events.js` singleton bridge. This is the audit-trail / pub-sub plumbing. Cross-ref: AGENT-79 confirms the bus is wired but 12 orchestrator listener names are unsubscribed metadata.
2. **Audit log** — `audit_log` table at line 339 of the same migration. Append-only entity-change journal, also unrelated to event management.
3. **Customer-support tickets** — `onyx-procurement/src/support/ticketing.js`. Issue-tracker tickets (priority, SLA, comments). Reuses the word "ticket" but is not an event ticket sold to an attendee.

There is **no third meaning**: no `Event` business entity (conference, webinar, course session), no `Ticket` saleable item with QR, no `Registration` linking a contact to an event, and no `Speaker` resource.

---

## 3. Pipeline / wiring spec coverage

Per `CLAUDE.md`, the system identity is anchored in 6 modules under `onyx-procurement/src/pipeline/`. Searching all six:

| Module | `event\|ticket\|speaker\|registration\|attendance` hits |
|---|---|
| `pipeline-engine.js` | "event triggers" (generic) — no Event entity |
| `entity-map.js` | 16 entities defined — none is `Event`, `Ticket`, `Speaker`, `Registration` |
| `workflow-flows.js` | 5 flows: Sales→Project→Procurement→Execution→Cash + Employee→Payroll. **No event-ticketing flow.** |
| `state-machines.js` | 13 state machines — none for ticket/registration |
| `wiring-spec.js` | 9 page contracts — Customer/Supplier/Quote/RFQ/Project/WorkOrder/PO/Finance/Employee 360. **No Event360.** |
| `orchestrator.js` | 18 actions — none is `event.publish`, `ticket.issue`, `registration.check_in`, etc. |

The Master Flow `Lead → Quote → … → Closure` does not branch into ticketing/event-execution.

---

## 4. Ticketing flow — present in a different sense

`onyx-procurement/src/support/ticketing.js` implements a customer-support ticket lifecycle (create → triage → assign → comment → resolve → close, with SLA matrix, breach scanner, in-memory + Supabase adapter). This is **not** an event ticket: no price, no QR, no event_id FK, no holder identity, no entry validation.

If the requested "Events Ticketing" were to be built, none of this support module is reusable beyond pattern (entity + state machine + audit).

---

## 5. QR-code surface

The only QR usage in the repo is `lib-client/db/src/schema/work-order-qr-codes.ts` (operator scans a printed work-order). There is:
- No QR generation library imported for tickets
- No `/api/tickets/:id/qr.png` route
- No scan endpoint that toggles `registration.attended = true`
- No anti-replay nonce / signed token (HMAC) on a ticket
- No offline scan queue (relevant if doors run on tablets without connectivity)

`onyx-procurement/src/scanners/barcode-scanner.js` exists but is for inventory barcodes, not event tickets.

---

## 6. Cross-service contracts that *would* be needed

If Events were to be added under wiring-spec's "7 cross-service contracts" pattern, the missing contracts are:

1. ONYX_PROCUREMENT → ONYX_PROCUREMENT(Finance) — ticket sale → invoice / revenue recognition
2. ONYX_PROCUREMENT → PAYROLL — speaker fee → vendor payment or contractor payroll
3. TECHNO_KOL_OPS → ONYX_AI — registration → attendance forecast / no-show prediction
4. CRM → Events — Customer/Lead → Registration link (so Customer360 shows past events)

None of these exist.

---

## 7. Page-contract & "no dead pages" implication

Per CLAUDE.md "No Dead Pages Rule," every page must answer six questions (Where am I? What is this? Status? Actions? Next? Related?). For Events that means at minimum:
- `Event360` (event header, sessions, registrations roll-up, revenue, capacity, check-in rate)
- `Ticket360` (holder, QR, issue/void state, scan history)
- `Registration360` (contact link, payment status, attendance bool, badge)
- `Speaker360` (sessions, fee, contracts, payout state)

**Zero of these pages exist.** `erp-app/src/pages/` was scanned: no `events/`, no `tickets/` (besides `fabrication/service-tickets.tsx` which is work-order service), no `registrations/`, no `speakers/`.

---

## 8. Israeli-compliance angle (relevant if domain is built)

Issuing a paid event ticket in IL is a taxable supply. A future implementation must integrate with the existing tax stack (`ISRAELI_TAX_CONSTANTS_2026.md`, AGENT-19, AGENT-140 VAT). Today there is no hook because there is no module to hook into.

---

## 9. Risks of the current gap

| Risk | Severity | Note |
|---|---|---|
| Spec drift if "Events" is referenced in any frontend nav | Medium | Verified: `erp-app/src/pages/` has no events route, so no broken link today |
| Incorrect audit assumption — confusing `system_events` with event domain | High | The naming collision is real; future agents will hit it |
| If a customer requests event/conference module, no scaffolding exists | High | Greenfield build — 4 tables, 4 360 pages, ~6 actions, 1 state machine, QR/HMAC, scanner, payment & VAT integration |

---

## 10. Recommendations

1. **Acknowledge the gap explicitly** in `SYSTEM_MAP_360.md` and `wiring-spec.js` — add a placeholder entry `events: { status: 'not_implemented' }` so downstream agents stop hunting.
2. **Rename or namespace** to avoid the `events_*` vs `system_events` collision — recommended schema name `evt_events`, `evt_speakers`, `evt_tickets`, `evt_registrations` if the domain is ever built.
3. **Do not retrofit** support `ticketing.js` for event tickets — different lifecycle, different revenue model. New module under `onyx-procurement/src/events/`.
4. **Build order** if prioritised: (a) tables + RLS, (b) state machine `ticket: issued → paid → checked_in → void`, (c) QR HMAC service, (d) Event360 + Registration360 pages, (e) Finance integration (invoice + VAT), (f) scanner offline queue.

---

## 11. Files referenced

Absolute paths:
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\supabase\migrations\001-supabase-schema.sql` (lines 339-367 — `audit_log`, `system_events`)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\wiring\event-bus.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\wiring\domain-events.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\support\ticketing.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\scanners\barcode-scanner.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\lib-client\db\src\schema\work-order-qr-codes.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\` (all 6 modules — entity-map, wiring-spec, orchestrator, state-machines, workflow-flows, pipeline-engine)

---

## 12. Summary

- Asked to audit four Events tables and a QR/ticketing/attendance flow.
- None of the four tables exist.
- No module, no entity, no state machine, no page, no API, no QR, no attendance hook.
- The word "events" in this codebase only refers to event-sourcing (`system_events`) and the in-process bus, both unrelated.
- This is a complete domain gap, not a partial / buggy implementation.
- **Audit cannot be passed or failed** — there is nothing to audit. Logged as gap.
