# AG-X21 — Customer Support Ticketing System — QA Report

**Agent:** X-21 (Swarm 3B)
**Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Scope:** Full ticketing backend + React UI + regression suite
**Status:** PASS — 54 / 54 tests green, zero deps, never-delete compliant

---

## 1. Deliverables

| File | LOC | Purpose |
|---|---|---|
| `onyx-procurement/src/support/ticketing.js` | ~640 | Backend service: model, SLA engine, storage, stats |
| `payroll-autonomous/src/components/TicketList.jsx` | ~660 | React RTL table, Palantir dark theme, bulk ops |
| `onyx-procurement/test/payroll/ticketing.test.js` | ~560 | 54 unit tests across 11 suites |
| `_qa-reports/AG-X21-ticketing.md` | this file | QA report |

Total: 4 new files, ~1,900 LOC, zero external npm dependencies.

---

## 2. Backend — `src/support/ticketing.js`

### 2.1 Ticket model

```
id             : string                         // tkt_<base36>_<seq>
client_id      : string
subject        : string
description    : string
status         : open | in_progress | waiting | resolved | closed
priority       : urgent | high | med | low
category       : string                         // default "general"
assignee       : string | null
tags           : string[]                       // normalized lower-case hyphenated
comments       : Comment[]                      // { id, author, at, body, internal, attachments[] }
attachments    : Attachment[]                   // { id, name, ref, mime, size }  <-- references, not blobs
history        : AuditEvent[]                   // { at, by, action, note }
created_at     : ISO timestamp
updated_at     : ISO timestamp
created_by     : string
archived       : boolean                        // soft-only, never deleted
sla_due        : {
    response_due       : ISO
    resolution_due     : ISO
    paused_ms          : number
    paused_since       : ISO | null
    first_response_at  : ISO | null
    resolved_at        : ISO | null
}
```

### 2.2 Public API

| Method | Signature | Notes |
|---|---|---|
| `createTicket(input)` | `{client_id, subject, description?, priority?, category?, assignee?, tags?, attachments?, created_by?}` | Validates required fields, computes SLA deadlines, logs `created` history event |
| `getTicket(id)` | `(id) -> Ticket\|null` | Null-safe on empty/unknown id |
| `listTickets(filters)` | `{status, priority, client_id, assignee, category, tag, search, from, to, sort, page, limit, include_archived}` | Paginated `{items,total,page,limit,pages}`, default sort `created_at:desc`, server-side filter + sort |
| `updateStatus(id, status, userId, note?)` | | Validates enum, manages SLA pause/resume, logs status history event |
| `assign(id, assigneeId, userId?)` | | `null` assigneeId unassigns |
| `addComment(id, {body,author,attachments?}, isInternal)` | | Internal/external flag, auto-resume on client reply while waiting, first-response credit |
| `addTag(id, tag, userId?)` | | Normalizes + dedups |
| `removeTag(id, tag, userId?)` | | Idempotent |
| `addAttachment(id, attachment, userId?)` | | Reference only — `{name, ref, mime, size}` |
| `archive(id, userId?)` | | Soft-flag only — never deletes |
| `unarchive(id, userId?)` | | Restores visibility |
| `getSlaBreach(asOf?)` | | Returns tickets past response OR resolution deadline, skips `waiting` (paused) and `closed`, sorted urgent-first |
| `stats(period?)` | `{from?, to?}` | `{total, by_status, by_priority, avg_resolution_hours, sla_breach_count, resolved_count, period}` |
| `bulkAssign(ids, assigneeId, userId?)` | | Delegates per-id |
| `bulkUpdateStatus(ids, status, userId?)` | | Delegates per-id |
| `bulkAddTag(ids, tag, userId?)` | | Delegates per-id |

### 2.3 SLA matrix (exported as `SLA_RULES`)

| Priority | First response | Full resolution |
|---|---|---|
| urgent | 2 h  |  8 h |
| high   | 4 h  | 24 h |
| med    | 8 h  | 72 h |
| low    | 24 h |  7 d |

Pause-on-wait semantics: when a ticket enters `waiting`, the SLA clock pauses. When it leaves `waiting` (either via `updateStatus` or via the auto-resume triggered by a client comment), the paused duration is added to `paused_ms` AND both deadlines are pushed forward by the same delta — so the service always reports the SLA as "on time" if the team was only blocked by the customer.

### 2.4 Pluggable storage

Default: `InMemoryTicketStore` (Map-backed, no deps).
Adapter shipped: `SupabaseTicketAdapter(supabase, table='support_tickets')` exposing `insert/get/update/all`. Pass via `new TicketingService({ store: new SupabaseTicketAdapter(supabaseClient) })` for Supabase-backed persistence. The adapter uses only `from().select().insert().update().eq().single().maybeSingle()` which is supabase-js's core surface, so no other runtime dependency is introduced.

### 2.5 Hebrew labels & theme tokens (exported)

- `TICKET_LABELS_HE` — `{status, priority, fields, actions}` — used by both UI + PDF exports.
- `PRIORITY_COLOURS` — `{urgent:#ff5c5c, high:#ff9f43, med:#f5a623, low:#4a9eff}`
- `STATUS_COLOURS`   — `{open:#4a9eff, in_progress:#3ddc84, waiting:#f5a623, resolved:#8b95a5, closed:#5a6472}`

### 2.6 Event bus (optional)

`new TicketingService({ onEvent: (evt, payload) => ... })`

Emitted events: `ticket.created`, `ticket.status_changed`, `ticket.assigned`, `ticket.comment_added`, `ticket.tag_added`, `ticket.tag_removed`, `ticket.attachment_added`.

Failure-isolated: listener exceptions are swallowed so the core write path is never blocked.

---

## 3. UI — `payroll-autonomous/src/components/TicketList.jsx`

### 3.1 Layout

- RTL root (`dir="rtl"`, `lang="he"`), Heebo/Assistant/Rubik font stack
- Palantir dark theme via inline `PALANTIR_DARK` token map — no external CSS
- Header with bilingual title + manual refresh button
- Toolbar row: search, status/priority/assignee/tag selects, reset
- Collapsible bulk-action bar — appears only when ≥1 row selected
- Table: 11 columns, click-to-sort headers (id, subject, priority, status, assignee, created_at, updated_at), hover highlight, selected row highlight
- Footer: total + pagination (25/page default)

### 3.2 Columns

| Column | Content |
|---|---|
| Select checkbox | Bulk selection, "select all on page" in header |
| מזהה (ID) | Monospace truncated |
| נושא (Subject) | Primary text, single-line ellipsis |
| לקוח (Client) | `client_id` monospace |
| עדיפות (Priority) | Pill with coloured dot + Hebrew label (דחוף/גבוה/בינוני/נמוך) |
| סטטוס (Status) | Inline select dropdown — quick status change without opening detail |
| מטפל (Assignee) | Circular avatar with deterministic colour + initials + name lookup from `agents` prop |
| תגיות (Tags) | Chips, first 3 + overflow count |
| SLA | Badge: בזמן / קרוב לסיום / חריגה / מושהה |
| עודכן / נוצר | `time ago` relative label, `dateTime` attr with Jerusalem absolute timestamp via `title` |

### 3.3 Bulk actions

- "שיוך אליי" — assigns all selected to `currentUser.id`
- "שיוך ל…" select — assigns to any agent
- Tag input + button — adds one tag to all selected
- "סגירת פניות" — bulk close (delegates to parent via `onClose`)

### 3.4 Accessibility

- `aria-label` on root, toolbar, table, select-all
- Each row has `aria-selected`
- Status dropdown stops propagation so quick-change doesn't open the detail panel
- Selectable inputs inside rows also stop propagation
- Time cells use `<time dateTime>` with exact Jerusalem timestamp in `title` for screen readers + tooltip
- All interactive controls keyboard-focusable (native `<select>`, `<input>`, `<button>`)

### 3.5 Live updates

`useEffect` ticks every 60 s to re-render time-ago labels + SLA badges. No external timers or workers.

---

## 4. Test Suite — 54 cases / 11 suites

```
▶ 1. createTicket — happy path & validation        (8 tests)
▶ 2. getTicket & listTickets                        (9 tests)
▶ 3. Status transitions & SLA pause/resume          (6 tests)
▶ 4. assign                                         (3 tests)
▶ 5. addComment — internal, external, auto-resume   (8 tests)
▶ 6. addTag / removeTag / normalizeTag              (4 tests)
▶ 7. getSlaBreach                                   (5 tests)
▶ 8. stats                                          (3 tests)
▶ 9. Bulk ops & archive (never-delete rule)         (4 tests)
▶ 10. i18n & theme tokens                           (3 tests)
▶ 11. onEvent audit bus                             (1 test )
---------------------------------------------------------------
  tests 54 · pass 54 · fail 0 · duration_ms 171
```

### 4.1 Coverage matrix

| Feature | Cases | Status |
|---|---|---|
| Happy-path create | 1.1 | pass |
| Required-field validation | 1.2, 1.3 | pass |
| Priority enum | 1.4 | pass |
| SLA deadline math | 1.5 | pass |
| Tag normalization on create | 1.6 | pass |
| History auto-log | 1.7 | pass |
| Attachments-as-references invariant | 1.8 | pass |
| `getTicket` null safety | 2.1 | pass |
| Pagination shape | 2.2 | pass |
| Filters: status, priority, client_id, tag, search | 2.3–2.7 | pass |
| Sorting by priority rank | 2.8 | pass |
| Archive visibility toggle | 2.9 | pass |
| Invalid-status rejection | 3.1 | pass |
| Status history logging | 3.2 | pass |
| `first_response_at` stamping | 3.3 | pass |
| SLA pause / resume math | 3.4 | pass |
| `resolved_at` stamping | 3.5 | pass |
| Unknown-id safety | 3.6, 4.3, 5.8, 6.4 | pass |
| Assignment + unassignment | 4.1, 4.2 | pass |
| Comment validation | 5.1, 5.2 | pass |
| Internal comments | 5.3 | pass |
| First-response credit rules | 5.4, 5.5 | pass |
| Client reply auto-resume | 5.6 | pass |
| Staff reply does NOT auto-resume | 5.7 | pass |
| Tag normalization helper | 6.1 | pass |
| Tag dedup | 6.2 | pass |
| Tag removal + history | 6.3 | pass |
| Resolution breach detection | 7.1 | pass |
| Response breach detection | 7.2 | pass |
| Waiting tickets excluded from breach | 7.3 | pass |
| Closed tickets excluded from breach | 7.4 | pass |
| Urgent-first sort on breach list | 7.5 | pass |
| Stats shape | 8.1 | pass |
| `by_status` / `by_priority` counts | 8.2 | pass |
| `avg_resolution_hours` excludes paused time | 8.3 | pass |
| `bulkAssign` | 9.1 | pass |
| `bulkUpdateStatus` | 9.2 | pass |
| Archive is soft-only (never-delete rule) | 9.3 | pass |
| Unarchive | 9.4 | pass |
| Hebrew status labels | 10.1 | pass |
| Hebrew priority labels | 10.2 | pass |
| Priority colour tokens | 10.3 | pass |
| Event bus emission | 11.1 | pass |

---

## 5. Rule compliance

| Rule | How enforced | Evidence |
|---|---|---|
| **never delete** | No `delete`/`destroy` methods. `archive()` sets `archived=true` only. In-memory store size is asserted stable in test 9.3. | test 9.3 |
| **Hebrew RTL bilingual** | Backend exports `TICKET_LABELS_HE` covering all enums + fields + actions. UI root is `dir="rtl" lang="he"`, every visible string is Hebrew with English subtitle line. | tests 10.1, 10.2 + UI inspection |
| **Palantir dark theme** | `PALANTIR_DARK` token map defines bg `#0b0d10`, panel `#13171c`, borders, accent, info/warn/critical/success colours. Used via inline style; no external CSS. | UI inspection |
| **zero deps** | `package.json` unchanged. Backend uses only `'use strict'` + pure JS; tests use `node:test` + `node:assert/strict` (built-ins). UI uses only React (already present in `payroll-autonomous`). | `node --test` run clean |

---

## 6. Known limitations / future work

1. **Attachment storage** — backend stores `ref` only. An S3/Supabase Storage upload path is out of scope for this agent but trivial to wire via the existing `onEvent` bus (listener on `ticket.attachment_added`).
2. **Ticket detail panel** — `onOpen` callback wiring is delivered, but the detail panel component itself is a separate work item (not listed in X-21's scope).
3. **Saved views / custom filters** — basic filters ship; saved views would live in user preferences and are deferred.
4. **Real-time push** — the `onEvent` bus is synchronous; a websocket bridge to broadcast status changes to all open UIs is pending. Fits naturally into the existing `palantir_realtime_core` module.

---

## 7. How to run

```bash
cd onyx-procurement
node --test test/payroll/ticketing.test.js
```

Expected: `tests 54 · pass 54 · fail 0`.

---

**Signed off:** Agent X-21 / Swarm 3B / 2026-04-11
