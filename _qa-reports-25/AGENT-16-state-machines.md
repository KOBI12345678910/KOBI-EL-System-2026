# AGENT-16 — State Machines Audit

**Source of truth:** `onyx-procurement/src/pipeline/state-machines.js`
**Cross-refs:** `pipeline/orchestrator.js`, `pipeline/entity-map.js`, `wiring/event-bus.js`, `wiring/domain-events.js`
**Date:** 2026-04-29

---

## Status: AMBER

The state-machine module is fully wired (executor + 4 REST routes registered) and structurally sound, but it deviates from the CLAUDE.md spec ("13 state machines / 91 transitions") on the actual numbers, has 1 dead state, several un-registered listeners, and 3 orchestrator preconditions referencing non-existent statuses.

---

## Coverage — 13/91 vs Reality

CLAUDE.md target: **13 machines / 91 transitions**.
Actual (programmatically counted via `node -e` against the exported `STATE_MACHINES`):

| # | Machine | States | Transitions | Triggers (events) | Final States |
|---|---|---|---|---|---|
| 1 | lead | 6 | 9 | 4 | won, lost |
| 2 | quote | 7 | 9 | 2 | converted, **deleted** |
| 3 | rfq | 7 | 9 | 2 | rejected, converted_to_po |
| 4 | po | 8 | 10 | 3 | closed, cancelled |
| 5 | project | 9 | 11 | 6 | closed, cancelled |
| 6 | work_order | 8 | 11 | 3 | signed_off, cancelled |
| 7 | invoice | 8 | 12 | 4 | paid, cancelled |
| 8 | employee | 4 | 7 | 0 | terminated |
| 9 | attendance | 5 | 5 | 2 | exported_to_payroll |
| 10 | payroll | 6 | 7 | 3 | paid, cancelled |
| 11 | contract | 5 | 6 | 1 | terminated |
| 12 | task | 6 | 7 | 0 | done, cancelled |
| 13 | payment | 4 | 4 | 2 | reconciled, reversed |
| 14 | document | 4 | 4 | 0 | archived |
| 15 | alert | 5 | 4 | 0 | resolved, dismissed |
| **Σ** | **15** | **92** | **115** | **32** | — |

**Deltas vs CLAUDE.md:**
- Machines: **15** declared, not 13. (+2 over spec — `attendance`, `payroll` are extra; both are P1 entities and worth keeping.)
- Transitions: **115**, not 91. (+24 over spec.)
- The string in `pipeline-engine.js`/CLAUDE.md needs to be updated, OR two machines must be merged/dropped. Recommendation: update the spec — the extras are legitimate workforce flows.

---

## Entity-Map ↔ State-Machine Coverage (16 entities)

| Side | Entries |
|---|---|
| In **entity-map** but no SM | `customer`, `supplier`, `material` |
| In **SM** but no entity-map | `attendance`, `payroll` |

`customer` / `supplier` arguably do not need a SM (master data, no lifecycle), but `material` has an inventory lifecycle (stock states: in_stock / reserved / consumed / in_transit) and SHOULD have one. `attendance`/`payroll` should be added to entity-map for symmetry.

---

## Dead States (no inbound transitions, not initial)

| Machine | State | Reason |
|---|---|---|
| **quote** | `deleted` | Declared `final: true` but no transition leads to it. Either remove it or add a `delete` transition from `draft`/`sent`/`under_review`. |

All other 91 non-initial states are reachable.

---

## Unreachable Terminal States

Same single offender as above: **`quote.deleted`** is final and unreachable. Every other final state has at least one inbound transition.

---

## Listeners — MISSING Registrations

`orchestrator.js` declares **12 unique listener IDs** across 8 actions. NONE of them are registered in `wiring/event-bus.js` or `wiring/domain-events.js` (which only subscribes to `procurement.po.*` topics).

Missing listener bindings:

```
ai.margin_and_risk_review            (quote.approve)
ai.generate_project_risk_baseline    (quote.convert_to_project)
procurement.prepare_procurement_context (quote.convert_to_project)
ai.assess_supplier_risk              (project.create_po)
ops.try_allocate_received_stock      (po.receive_items)
ai.check_delivery_anomalies          (po.receive_items)
ai.update_cashflow_forecast          (invoice.issue)
ops.show_project_finance_update      (invoice.issue)
ai.detect_collection_risk_change     (invoice.register_payment)
procurement.consume_labor_cost       (attendance.approve)
procurement.post_labor_cost          (payroll.calculate)
ai.detect_payroll_anomalies          (payroll.calculate)
```

In addition, the **state-machine `triggers` map** (32 entries) has NO dispatcher: `getTriggersForTransition()` returns the trigger array but nothing in the codebase calls it on a real transition (`registerStateMachineRoutes` exposes only read endpoints — no `POST /transition`). All side-effects listed in the `triggers:` blocks are decorative until a transition executor is wired.

---

## Backward Transitions — All Are Explicit Reverts (PASS)

15 backward edges found; every one is a named, intentional revert action. None are silent fall-throughs:

| Machine | Edge | Action name |
|---|---|---|
| quote | rejected → draft | `revise` |
| po | pending_approval → draft | `reject` |
| work_order | waiting_materials → assigned | `assign` |
| work_order | qa → in_progress | `fail` |
| invoice | overdue → partially_paid | `partial_pay` |
| invoice | overdue → paid | `full_pay` |
| invoice | in_collection → paid | `full_pay` |
| employee | on_leave → active | `return` |
| employee | suspended → active | `reinstate` |
| attendance | rejected → draft | `revise` |
| payroll | calculated → draft | `recalculate` |
| contract | pending_signature → draft | `reject` |
| contract | expired → draft | `renew` |
| task | blocked → in_progress | `unblock` |
| task | escalated → in_progress | `resolve` |

Per CLAUDE.md rule, each is justified.

---

## Orchestrator ↔ State-Machine Drift (3 broken preconditions)

`orchestrator.js` references statuses that do not exist in the corresponding SM:

| Orchestration | Bad status | Valid statuses |
|---|---|---|
| `project.create_work_order` | `in_production` | draft, approved, in_planning, **in_procurement**, in_execution, in_delivery, completed, closed, cancelled |
| `rfq.convert_to_po` | `decided` | draft, sent, quotes_received, under_comparison, **approved**, rejected, converted_to_po |
| `work_order.signoff` | `done` | open, assigned, waiting_materials, in_progress, qa, **completed**, signed_off, cancelled |

These preconditions will always fail at runtime. Likely intent: rename to `in_procurement`, `approved`, and `completed` respectively.

---

## Guards / Preconditions — Coverage Note

The SM file itself defines NO guard predicates (e.g. `guard: ctx => ctx.value < 100`). All gating happens inside `orchestrator.preconditions[]`. This is acceptable, but means transitions called directly via `canTransition()` (the only path the SM exposes) cannot enforce business rules like "cannot approve quote if margin < 0%" — only role/state-based legality. The "13 state machines with 91 transitions and trigger side-effects" sentence in CLAUDE.md implies guards exist; they do not.

---

## Triggers Without Listeners (decorative side-effects)

32 trigger entries in `state-machines.js` reference 28 distinct action names (`create_quote`, `create_project`, `notify`, `update_inventory`, `post_to_gl`, `create_wage_slips`, etc.). None resolve to a real handler — they are strings consumed only by `getTriggersForTransition()`, which no caller invokes today. Either:
- wire these via the event bus (recommended — the bus already exists), or
- delete the `triggers:` blocks and consolidate side-effects into `orchestrator.effects[]` (the orchestrator IS executed via `POST /api/orchestrator/execute`).

---

## Recommendations (priority order)

1. **P0 — Sync the spec.** Update CLAUDE.md and `pipeline-engine.js` strings from "13 / 91" to "15 / 115", or remove `attendance`/`payroll` if they belong elsewhere.
2. **P0 — Fix 3 orchestrator preconditions** (`in_production` → `in_procurement`; `decided` → `approved`; `done` → `completed`).
3. **P0 — Remove dead state `quote.deleted`** (or add a `delete` transition from non-final quote states).
4. **P1 — Wire a transition executor.** Add `POST /api/state-machines/:type/transition` that validates via `canTransition`, dispatches `triggers[]` through the event bus, and writes the audit row. Today the SM is read-only over HTTP.
5. **P1 — Register the 12 missing listeners.** Each `orchestrator.listeners[]` entry should map to a real `bus.subscribe(topic, handler)` somewhere under `src/ai/*`, `src/ops/*`, `src/procurement/*`. Without this, every "listeners_notified" line returned to the UI is a lie.
6. **P1 — Add `material` state machine** (in_stock / reserved / consumed / in_transit / written_off) — it is referenced by `entity-map` and the procurement workflow.
7. **P2 — Add a guard layer.** Even a thin `guards: { 'approved→converted': ctx => ctx.margin >= 0 }` block per machine would let callers enforce policy without going through the orchestrator.
8. **P2 — Add `attendance`/`payroll` to `entity-map.js`** so the 16 entity card pattern stays consistent.

---

## Summary

| Metric | Value |
|---|---|
| Status | AMBER |
| State machines | 15 (spec says 13) |
| Transitions | 115 (spec says 91) |
| Dead states | 1 (`quote.deleted`) |
| Unreachable terminals | 1 (same) |
| Backward transitions | 15 — all named/explicit (OK) |
| Triggers declared | 32 — 0 dispatched |
| Listeners declared | 12 — 0 registered |
| Orchestrator-SM drift | 3 broken preconditions |
| Entities in EM, no SM | 3 (customer, supplier, material) |
| Entities in SM, no EM | 2 (attendance, payroll) |
