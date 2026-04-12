# QA Agent #81 — Event Sourcing Patterns

**Project:** onyx-procurement
**Dimension:** Event Sourcing Patterns
**Date:** 2026-04-11
**Mode:** Static Analysis ONLY
**Cross-ref:** Agent #50 (Audit Trail)

---

## 1. system_events Table — Is It an Event Log?

**Location:** `supabase/migrations/001-supabase-schema.sql` lines 353-367

```sql
CREATE TABLE IF NOT EXISTS system_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_type ON system_events(type);
CREATE INDEX idx_events_severity ON system_events(severity);
```

### Verdict: NOT A TRUE EVENT LOG

This is an **operational/monitoring log** (alert stream), not a domain event store.

| Event Sourcing Requirement | system_events |
|-----------------------------|---------------|
| Immutable append-only | No enforcement |
| Aggregate/Entity ID reference | Missing (no `entity_id`, no `aggregate_id`) |
| Sequence number / version | Missing |
| Event payload (before/after state) | Only `data JSONB` (free-form) |
| Correlation / Causation ID | Missing |
| Deterministic schema per event type | Missing (JSONB is unstructured) |

**What it actually is:** A notifications/alerts firehose — similar to a syslog or Sentry breadcrumb stream. It is used only twice in `server.js`:

1. **Line 329-333** — `rfq_sent` log entry (informational)
2. **Line 888-894** — `whatsapp_incoming` log entry (webhook trace)

No state changes in the domain (suppliers, purchase_orders, quotes, decisions) are written to `system_events`. The table is write-rarely, read-almost-never.

---

## 2. Append-Only Enforcement

### Verdict: NONE

There is **no append-only enforcement** anywhere in the schema:

- No `REVOKE UPDATE, DELETE` on `system_events` or `audit_log`.
- No PostgreSQL row-level triggers that block `UPDATE`/`DELETE`.
- No RLS policies (the block at lines 490-493 is **commented out**).
- The column `acknowledged BOOLEAN DEFAULT false` **explicitly expects UPDATEs** — which contradicts the event-sourcing principle that events are immutable facts.
- The `audit_log` table also has no protection; anyone with the Supabase anon key can `DELETE FROM audit_log`.

**Consequence:** Any client with write access can silently mutate or erase history. This makes the "audit trail" forensically unreliable.

---

## 3. Event Replay Capability

### Verdict: IMPOSSIBLE

Replay requires:
1. A complete, ordered stream of domain events.
2. Pure event handlers that can rebuild state from the stream.
3. A deterministic starting point (empty state or snapshot).

Onyx has **none of these**:

- **State is stored directly** in mutable tables (`suppliers`, `purchase_orders`, `rfqs`, …).
- **Triggers overwrite data** (`update_updated_at()`, lines 394-407) — old `updated_at` is lost.
- **Aggregate updates are destructive** — e.g., `suppliers.total_orders`, `total_spent`, `last_order_date` are incremented in place (server.js lines 576-580); the previous value is discarded and cannot be recovered without scanning `audit_log.previous_value`, which is only populated in one place (supplier PATCH, line 161).
- Most write paths (quotes, POs, RFQs, decisions) write **only the new state** to `audit_log` — no `previous_value`, no `new_value`.
- There is **no "rebuild from events" endpoint**, no projection, no aggregate loader.

Replay is structurally impossible with the current design.

---

## 4. State Reconstruction From Events

### Verdict: NOT SUPPORTED

CQRS/Event Sourcing expects that the **write model** persists events only, and the **read model** is a projection rebuilt from the event stream.

Onyx inverts this:
- **Write model = read model** (same tables).
- Views (`rfq_summary`, `supplier_dashboard`, `procurement_dashboard`) are SQL aggregates over the **current** state — they are not event projections.
- If `suppliers.total_spent` becomes corrupted there is **no way** to recompute it from a canonical event log. You could try to sum `purchase_orders.total`, but that is an approximation — not a replay.

---

## 5. Snapshot Strategy

### Verdict: ABSENT

Event sourcing snapshots exist to speed up aggregate rebuilds. Since Onyx has no event stream, the question is moot — but the usual mitigations are also missing:

- No `snapshots` table.
- No periodic materialized view refresh.
- No point-in-time recovery hooks beyond Supabase's built-in DB backups (outside application control).

---

## 6. Event Versioning

### Verdict: ABSENT

- No `event_version` / `schema_version` column on `system_events`.
- No `event_version` on `audit_log`.
- `data JSONB` is schema-less, so upgrading event payload shape has no migration path.
- No event upcasters, no event registry, no contract tests.

In a real event-sourced system this is a hard failure mode — once you have 10k events with `type='rfq_sent'` and you change the payload shape, you must be able to version-discriminate. Onyx cannot.

---

## 7. Cross-Reference: Agent #50 (Audit Trail)

Onyx has **two parallel logging tables** with overlapping but distinct purposes:

| Aspect | `audit_log` (Agent #50 domain) | `system_events` (this agent) |
|--------|-------------------------------|------------------------------|
| Purpose | Who did what to which entity | System-level alerts / webhook trace |
| Has entity_id | Yes (`entity_type`, `entity_id`) | **No** |
| Has actor | Yes (`actor TEXT NOT NULL`) | No (only `source`) |
| Has before/after state | Yes (`previous_value`, `new_value` JSONB) | No |
| Append-only enforced | **No** (no triggers, no RLS) | **No** |
| Used for replay | Not designed for it; only one path fills `previous_value` | Not designed for it |
| Write coverage | 9 call sites in server.js (suppliers, PR, RFQ, quotes, PO, decisions) | 2 call sites (rfq_sent, whatsapp_incoming) |

### Critical gap identified vs Agent #50

`audit_log` looks like the closest thing to an event store, but it is **not consistently populated**:

- Only `PATCH /api/suppliers/:id` (server.js line 161) captures `prev, data` (before/after).
- **All other `audit()` calls pass only `entityType, entityId, action, actor, detail`** — `previous_value` and `new_value` remain NULL.
- `POST /api/quotes` (line 412), `POST /api/rfq/:id/decide` (line 582), `POST /api/purchase-orders/:id/approve` (line 621), `POST /api/purchase-orders/:id/send` (line 672), `POST /api/rfq/send` (line 326), `POST /api/purchase-requests` (line 209), `POST /api/suppliers` (line 152) — all write audit entries **without the state delta**.

So `audit_log` is a **textual activity log**, not an event store. Reconstructing the history of a single purchase order from it would be possible only partially, via string parsing of `detail` fields. That is not auditable in any serious regulatory sense.

### Overlap & inconsistency

- RFQ send writes to **both** `audit_log` (line 326) and `system_events` (line 329). No other operation does. This is ad-hoc — there is no policy for when to log where.
- `system_events` is never read by any API endpoint (there is `GET /api/audit` but no `GET /api/events`). It is write-only telemetry.
- Neither table is indexed on `created_at` except `audit_log` (descending), so time-range queries on `system_events` will scan.

---

## 8. Recommendations

### Priority 1 — Fix the audit trail (high value, low cost)

1. **Enforce append-only on `audit_log`** via a BEFORE UPDATE/DELETE trigger that raises an exception, OR via RLS policy denying UPDATE/DELETE to all non-service roles.
2. **Always populate `previous_value` and `new_value`** in every `audit()` call. Extend the helper to fetch the prior row when it is not passed, or refuse to log without it.
3. **Add indexes:** `idx_audit_actor ON audit_log(actor)`, `idx_audit_action ON audit_log(action)`.
4. **Add `correlation_id` and `request_id`** columns so related entries (RFQ → quotes → decision → PO) can be joined into a single causal chain.

### Priority 2 — Promote `system_events` to a domain event log (optional, if event sourcing is genuinely wanted)

1. **Rename** to `domain_events` and keep `system_events` only for infra/alerts.
2. **Add required columns:**
   - `aggregate_type TEXT NOT NULL`
   - `aggregate_id UUID NOT NULL`
   - `sequence_number BIGINT NOT NULL` (globally unique, monotonic — use a sequence)
   - `event_version INTEGER NOT NULL DEFAULT 1`
   - `correlation_id UUID`
   - `causation_id UUID`
   - `payload JSONB NOT NULL` (schema per `(type, event_version)`)
3. **Enforce append-only** (trigger or RLS).
4. **Publish every domain write** (supplier create, quote received, decision made, PO approved, …) as a typed event **inside the same transaction** as the state mutation. Use Supabase triggers or application-level transactional outbox.
5. **Add `idempotency_key`** to prevent duplicate events on retries.
6. **Add a snapshot table** `aggregate_snapshots(aggregate_id, aggregate_type, sequence_number, state JSONB, created_at)` once events exceed ~1000 per aggregate.

### Priority 3 — Realistic "lite" option (recommended for onyx-procurement's scale)

Given the system is a procurement app with a handful of suppliers and POs per day, **full event sourcing is overkill**. A simpler and much more cost-effective approach:

1. Implement the **Priority 1** audit-trail fixes only.
2. Add one new table: `entity_history` — a straight before/after snapshot on every mutation of the key tables (`suppliers`, `purchase_orders`, `rfqs`, `supplier_quotes`, `procurement_decisions`). Populate via PostgreSQL triggers (one trigger per table) so no application code change is needed.
3. Add time-travel queries: `GET /api/suppliers/:id/history`, `GET /api/purchase-orders/:id/history`.
4. Ensure Supabase PITR (point-in-time recovery) is enabled at the project level and documented.

This delivers 90% of the audit value of event sourcing at 10% of the architectural cost.

### Priority 4 — Housekeeping

- Add an index on `system_events(created_at DESC)`.
- Remove the `acknowledged` column from `system_events` — if events must remain immutable, acknowledgment belongs in a separate `event_acknowledgments` table.
- Expose `GET /api/events` with severity/time filters for ops visibility.
- Document the difference between `audit_log` (who did what) and `system_events` (what happened in the system).

---

## Summary Scorecard

| Capability | Status |
|------------|--------|
| Domain event store | MISSING |
| Append-only enforcement | MISSING |
| Event replay | IMPOSSIBLE |
| State reconstruction from events | NOT SUPPORTED |
| Snapshot strategy | ABSENT |
| Event versioning | ABSENT |
| Audit trail integrity | PARTIAL (text-only, mutable) |
| Correlation/causation tracking | MISSING |

**Overall:** Onyx does **not implement event sourcing**. It has a conventional CRUD architecture with a lightweight activity log and a write-only alert stream. The `system_events` table is mislabelled — it is a monitoring log, not an event store. The `audit_log` table is the closer analogue but is under-populated and unprotected.

This is **acceptable** for an MVP, but should not be presented as "event-sourced" in any architecture document. See Priority 3 for the recommended pragmatic upgrade path.
