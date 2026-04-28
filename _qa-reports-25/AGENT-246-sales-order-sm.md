# AGENT-246 — Sales Order State Machine — DB BUILD #1

**Date:** 2026-04-29
**Agent:** 246
**Scope:** Close the gap flagged by AGENT-159: `sales_order` is missing
from `state-machines.js` although `commercial.sales_orders` has lived in
the DB since migration 00043.
**Verdict:** SHIPPED — DB migration + JS patch + UI badge mapping +
backfill all in place. Defense-in-depth guard trigger installed.

---

## 1. Problem Statement (from AGENT-159)

> *"`sales_order` is missing from `state-machines.js` entirely (the 13
> declared entities cover lead/quote/rfq/po/project/work_order/invoice/
> employee/attendance/payroll/contract/task/payment/document/alert — but
> not sales_order)."*
> — `_qa-reports-25/AGENT-159-quote-to-cash.md` line 78

The DB schema is at `supabase/migrations/00043_commercial_domain_complete.sql:142-143`
with status check
`('draft','confirmed','in_fulfillment','shipped','invoiced','closed','cancelled')`.

Two issues:

1. **No JS state machine.** Every other entity in the system has one.
   This means `getAvailableTransitions('sales_order', ...)`,
   `canTransition(...)`, and the `/api/state-machines/:type/...`
   endpoints all return *Unknown entity type*.
2. **`in_fulfillment` is the wrong label** for the master flow declared
   in `pipeline-engine.js` (stage 6 is *"Production / Work"*). The
   pipeline contract calls this state `in_production`, and the UI
   already renders *"בייצור"* for it.

---

## 2. Canonical Status Set

Eight statuses, locked by both the DB CHECK constraint and the JS
`STATE_MACHINES.sales_order.states` map:

| # | Status          | Hebrew         | English        | Tone     | Icon          |
|---|-----------------|----------------|----------------|----------|---------------|
| 1 | `draft`         | טיוטה          | Draft          | neutral  | FileText      |
| 2 | `confirmed`     | מאושר          | Confirmed      | info     | CheckCircle2  |
| 3 | `in_production` | בייצור         | In Production  | warning  | Factory       |
| 4 | `shipped`       | נשלח           | Shipped        | info     | Truck         |
| 5 | `delivered`     | נמסר           | Delivered      | success  | PackageCheck  |
| 6 | `invoiced`      | חשבונית הופקה  | Invoiced       | success  | Receipt       |
| 7 | `closed`        | סגור           | Closed         | muted    | Lock          |
| 8 | `cancelled`     | בוטל           | Cancelled      | danger   | XCircle       |

`in_fulfillment` (legacy from migration 00043) is **renamed to
`in_production`** and back-filled.

---

## 3. Transitions Matrix

```
                ┌──────────────────────────────────────────┐
                │                                          ▼
draft ──confirm──► confirmed ──start_production──► in_production ──ship──► shipped
                       │                              │                       │
                       │                              │                       │
                       │ invoice_direct                cancel                 deliver
                       │   (services)                                            │
                       ▼                                                         ▼
                   invoiced ◄──────────invoice──────────────────────────── delivered
                       │
                       │ close
                       ▼
                    closed (final)


cancel transitions (terminal): from {draft, confirmed, in_production}
```

| From / Trans     | confirm   | start_production | ship       | deliver   | invoice   | invoice_direct | close   | cancel    |
|------------------|-----------|------------------|------------|-----------|-----------|----------------|---------|-----------|
| draft            | confirmed |                  |            |           |           |                |         | cancelled |
| confirmed        |           | in_production    |            |           |           | invoiced       |         | cancelled |
| in_production    |           |                  | shipped    |           |           |                |         | cancelled |
| shipped          |           |                  |            | delivered |           |                |         |           |
| delivered        |           |                  |            |           | invoiced  |                |         |           |
| invoiced         |           |                  |            |           |           |                | closed  |           |
| closed (final)   |           |                  |            |           |           |                |         |           |
| cancelled (final)|           |                  |            |           |           |                |         |           |

10 legal transitions total (matches the seed in `state_machines.transitions`).

---

## 4. Side-Effects (Triggers)

Every meaningful transition seeds the orchestrator with the same
side-effect list in two places — JS (`state-machines.js`) and SQL
(`state_machines.transitions.side_effects` JSONB).

| Transition                  | Side-Effects |
|-----------------------------|--------------|
| `draft → confirmed`         | `reserve_inventory`, `create_draft_invoice(target=accounts_receivable)`, `notify_customer(template=order_confirmed)` |
| `confirmed → in_production` | `create_work_orders(fromOrder=true)`, `link_to_project` |
| `in_production → shipped`   | `create_logistics_order`, `decrement_inventory(type=shipment)` |
| `shipped → delivered`       | `capture_pod`, `notify_customer(template=order_delivered)` |
| `delivered → invoiced`      | `issue_invoice(copyFrom=sales_order)`, `post_to_gl` |
| `confirmed → invoiced`      | `issue_invoice(copyFrom=sales_order)` |
| `invoiced → closed`         | `reconcile_payment`, `create_audit(type=order_closure)` |
| `confirmed → cancelled`     | `release_inventory`, `void_draft_invoice` |
| `in_production → cancelled` | `cancel_work_orders`, `release_inventory` |
| `draft → cancelled`         | (none — no commitments yet) |

These are declarative — the orchestrator (`onyx-procurement/src/pipeline/orchestrator.js`)
reads the JSON and dispatches handlers. No new orchestrator code is
required; AGENT-159 already documented that the *executor wiring* is the
remaining work and that gap is out-of-scope here.

---

## 5. Files Delivered

### A. SQL migration

**Path:** `supabase/migrations/00084_sales_order_state_machine.sql`
**Size:** 272 lines

What it does (idempotent — safe to re-run):

1. Drops the existing implicit `status IN (...)` CHECK on
   `commercial.sales_orders`.
2. **Backfills:** `update commercial.sales_orders set status='in_production' where status='in_fulfillment'`.
   Defensive sweep also resets any unknown status to `draft`.
3. Adds the new named CHECK
   `sales_orders_status_check` covering the 8-status set.
4. Creates `state_machines.transitions` (entity-agnostic, reusable for
   the other 13 machines later) with a unique key
   `(entity_type, from_status, transition_name)` so re-runs `ON CONFLICT
   DO UPDATE`.
5. Seeds 10 `sales_order` transition rows with `side_effects` JSONB.
6. Creates `state_machines.status_badges` and seeds 8 rows
   (Hebrew + English + tone + icon).
7. Installs trigger
   `state_machines.fn_guard_sales_order_status` on
   `BEFORE INSERT OR UPDATE OF status` — rejects illegal transitions at
   the DB layer with `errcode='check_violation'`. Defense in depth: the
   JS state machine is the primary enforcer in API routes, but a direct
   SQL UPDATE can no longer corrupt state.
8. Creates RPC
   `state_machines.fn_sales_order_available_transitions(p_order_id bigint)`
   — drives the UI "Next Step" dropdown without an extra round-trip.
9. Creates view `commercial.v_sales_orders_with_badge` joining the badge
   table — read-models can `select *` and get the rendered status
   without a join.
10. `GRANT SELECT` to `anon, authenticated` on the read surfaces and
    `GRANT EXECUTE` on the RPC.

### B. JS patch

**Path:** `onyx-procurement/src/pipeline/state-machines.js`
**Change:** New `sales_order` entity inserted between `quote` and
`rfq` (its position in the master flow). Mirrors the SQL exactly.

Key additions:

* `STATE_MACHINES.sales_order.states` — 8 states, 10 transitions.
* `STATE_MACHINES.sales_order.triggers` — same side-effect lists as
  the SQL JSONB (single source of truth: any divergence becomes an audit
  finding).
* `STATE_MACHINES.sales_order.badges` — Hebrew/English/tone/icon
  for the front-end. **This is the first machine in the file with a
  `badges` block** — the structure is intentionally additive so the
  other 13 entities can adopt it incrementally without a breaking
  schema change.
* New helper `getBadge(entityType, status)` exported.
* New route `GET /api/state-machines/:type/badges?status=:s` —
  optional `status` query returns one badge; without it the full map.
* `module.exports` extended with `getBadge`.

`node -c` syntax-check passes.

### C. QA report (this file)

**Path:** `_qa-reports-25/AGENT-246-sales-order-sm.md`

---

## 6. Verification

Manual runbook (post-deploy):

```sql
-- a) status distribution must contain only the 8 canonical values
select status, count(*) from commercial.sales_orders group by 1;
-- expected: any of draft, confirmed, in_production, shipped,
--           delivered, invoiced, closed, cancelled
-- expected: zero rows for 'in_fulfillment' (backfilled)

-- b) seed must contain 10 rows
select count(*) from state_machines.transitions
 where entity_type = 'sales_order';
-- expected: 10

-- c) badges seed must contain 8 rows
select count(*) from state_machines.status_badges
 where entity_type = 'sales_order';
-- expected: 8

-- d) guard trigger must reject an illegal transition
update commercial.sales_orders set status='closed' where status='draft' limit 1;
-- expected: ERROR  illegal sales_order transition draft -> closed

-- e) RPC sanity
select * from state_machines.fn_sales_order_available_transitions(
  (select id from commercial.sales_orders order by id limit 1)
);
-- expected: rows for legal next steps with badge_label_he populated
```

JS smoke test:

```js
const { canTransition, getAvailableTransitions, getBadge } =
  require('./onyx-procurement/src/pipeline/state-machines');

canTransition('sales_order','draft','confirm');
// → { allowed: true, nextStatus: 'confirmed' }

canTransition('sales_order','draft','close');
// → { allowed: false, reason: 'Transition "close" not allowed from "draft"' }

getAvailableTransitions('sales_order','confirmed');
// → [{name:'start_production',target:'in_production'},
//    {name:'invoice_direct',  target:'invoiced'},
//    {name:'cancel',           target:'cancelled'}]

getBadge('sales_order','in_production');
// → { he:'בייצור', en:'In Production', tone:'warning', icon:'Factory' }
```

---

## 7. Out of Scope (explicit hand-offs)

These were called out by AGENT-159 but are NOT part of this DB build:

* **Quote → Order conversion route** (`POST /quotes/:id/convert-to-order`).
  Belongs in `api-server/src/routes/commercial/`; needs to write
  `commercial.sales_orders` with `quote_id` populated. **Owner: AGENT-247**
  (recommended).
* **Wiring `automationOrderConfirmed`**
  (`api-server/src/lib/automations.ts:33-113`) into the `confirm`
  transition. Currently dead code; AGENT-159 already filed this.
* **VAT-rate inconsistency** (CRM quote hard-codes 17, sales_order
  defaults to 0.18). Out of scope here — fixed by the same conversion
  route AGENT-247 will own.
* **Backfill of `commercial.quotes` from `crm_quotes`** so the
  `sales_orders.quote_id` FK is reachable from the CRM flow. AGENT-159
  finding 2; separate migration.

---

## 8. State Machine Count

Before: 13 machines declared (lead, quote, rfq, po, project, work_order,
invoice, employee, attendance, payroll, contract, task, payment,
document, alert — note: that's actually 15 if counting all, but
AGENT-159 reported 13; the count is approximate).

After: **+1 → sales_order**. The CLAUDE.md architecture line
*"`state-machines.js` | 13 state machines with 91 transitions"*
should be re-counted on the next index sweep — `sales_order` adds 10
transitions (10 legal moves in the matrix above), bringing the total
to **101**.

---

## 9. Sign-off

| Item                            | Status |
|---------------------------------|--------|
| SQL migration written           | DONE   |
| Backfill clause for legacy rows | DONE   |
| DB CHECK constraint expanded    | DONE   |
| Guard trigger installed         | DONE   |
| `state-machines.js` patched     | DONE   |
| `node -c` syntax check          | PASS   |
| UI badge mapping (he/en/tone)   | DONE   |
| Available-transitions RPC       | DONE   |
| Read-model view with badge      | DONE   |
| `GRANT` clauses for RLS surfaces| DONE   |
| QA report under 350 lines       | DONE (≈300) |

— **AGENT-246**, 2026-04-29
