# AGENT-252 — Workflow Engine Gap Analysis

**Date:** 2026-04-29
**Source:** `onyx-procurement/src/pipeline/workflow-flows.js` (5 flows, 22 steps)
**Cross-references:**
- `onyx-procurement/src/pipeline/state-machines.js` (13 entities, 91 transitions)
- `onyx-procurement/src/pipeline/orchestrator.js` (19 executable actions)

## Method

For each step `{entity, action}` in `WORKFLOW_FLOWS`, three checks were run:

1. **State machine** — Does `STATE_MACHINES[entity]` define a transition matching `action`?
2. **Orchestrator** — Does `ORCHESTRATIONS[entity.action]` exist with effects + events?
3. **Implementation** — Is there an executor / wired API beyond definitional metadata?

**Note on implementation:** the orchestrator executor (`executeOrchestration`) only logs effects (`status: 'executed'`); none of the effect types (`create`, `link`, `audit`, `transition`, `update_inventory`, `post_to_gl`, `notify`, etc.) have real handlers. Therefore **every step is "no implementation"** at the executor level. To be useful, this report flags steps that lack even the **definition** scaffolding (state machine entry or orchestrator entry).

---

## Inventory of orchestrator action keys (19)

```
lead.create_quote          lead.convert_to_customer
quote.approve              quote.convert_to_project
project.create_work_order  project.create_po           project.create_invoice
rfq.convert_to_po
po.receive_items
work_order.start           work_order.signoff
invoice.issue              invoice.register_payment
payment.reconcile
attendance.approve
payroll.calculate          payroll.export
alert.resolve
```

Conspicuously absent: any actions for `material_request`, `inventory`, `bank_match`, `customer`, `supplier`, `project.start_planning`, `project.mark_billable`, `employee.attend_work`.

---

## FLOW 1 — sales_to_project (5 steps)

| # | Step | State Machine | Orchestrator | Verdict |
|---|------|--------------|-------------|---------|
| 1 | `lead.qualify` | OK — `new/contacted → qualified` via `qualify` | MISSING — no `lead.qualify` orchestration (`lead.create_quote` and `lead.convert_to_customer` only) | Partial — SM only |
| 2 | `lead.create_quote` | MISSING — `lead` machine has no `create_quote` transition; closest is `qualified→quoted` via `quote` | OK — `lead.create_quote` exists | Partial — orch only |
| 3 | `quote.approve` | OK — `under_review→approved` via `approve` (also `sent→approved`) | OK — `quote.approve` | Implemented (def) |
| 4 | `quote.convert_to_project` | OK — `approved→converted` via `convert` (action name mismatch: SM uses `convert`, flow says `convert_to_project`) | OK — `quote.convert_to_project` | Implemented (def) — minor naming drift |
| 5 | `project.start_planning` | PARTIAL — `approved→in_planning` via `plan` (name mismatch: flow says `start_planning`, SM uses `plan`) | MISSING — no `project.start_planning` orchestration | Partial — SM only, naming drift |

**Flow 1 gaps:**
- `lead.qualify` lacks orchestrator entry (no effect/event hooks for stage flip).
- `lead.create_quote` orchestrator exists but no matching SM transition on `lead` (only on `quote`).
- `project.start_planning` lacks orchestrator entry; SM transition keyword differs (`plan` vs `start_planning`).

---

## FLOW 2 — project_to_procurement (5 steps)

| # | Step | State Machine | Orchestrator | Verdict |
|---|------|--------------|-------------|---------|
| 1 | `project.request_materials` | MISSING — no `request_materials` transition on `project` (closest: `plan`, `procure`) | MISSING — no `project.request_materials` orchestration | NOT IMPLEMENTED |
| 2 | `material_request.create_rfq` | MISSING — `material_request` is not in STATE_MACHINES at all | MISSING — no `material_request.*` orchestration | NOT IMPLEMENTED |
| 3 | `rfq.compare_and_approve` | PARTIAL — `under_comparison→approved` via `approve` (naming drift: `compare_and_approve` vs `approve`) | MISSING — no `rfq.compare_and_approve` orchestration; only `rfq.convert_to_po` | Partial — SM only, naming drift |
| 4 | `rfq.convert_to_po` | OK — `approved→converted_to_po` via `convert` (naming drift: SM `convert` vs flow `convert_to_po`) | OK — `rfq.convert_to_po` | Implemented (def) — naming drift |
| 5 | `po.send_and_receive` | PARTIAL — `approved→sent` via `send`, `sent→partially_received/fully_received`. Flow conflates two transitions into one step | MISSING — no `po.send_and_receive` orchestration; only `po.receive_items` | Partial — composite step not modeled |

**Flow 2 gaps:**
- **`material_request` entity is entirely missing** from state machines and orchestrator. This is the single biggest gap — Flow 2 step 2 has no foundation.
- `project.request_materials` has neither SM transition nor orchestration.
- `rfq.compare_and_approve` and `po.send_and_receive` are composite actions in the flow that map to multi-step SM sequences with no single orchestrator wrapper.

---

## FLOW 3 — procurement_to_execution (4 steps)

| # | Step | State Machine | Orchestrator | Verdict |
|---|------|--------------|-------------|---------|
| 1 | `po.receive_items` | OK — `sent→partially_received/fully_received` via `partial_receive`/`full_receive` (naming drift) | OK — `po.receive_items` | Implemented (def) — naming drift |
| 2 | `inventory.reserve_for_project` | MISSING — `inventory` is not in STATE_MACHINES | MISSING — no `inventory.*` orchestration | NOT IMPLEMENTED |
| 3 | `work_order.start_execution` | OK — `assigned→in_progress` via `start` (naming drift: `start_execution` vs `start`) | OK — `work_order.start` (key mismatch: flow `start_execution` vs orch `start`) | Implemented (def) — naming drift |
| 4 | `work_order.complete` | OK — `in_progress→completed` via `complete` (also `qa→completed`) | MISSING — no `work_order.complete` orchestration; only `work_order.start` and `work_order.signoff` | Partial — SM only |

**Flow 3 gaps:**
- **`inventory` entity is entirely missing** from state machines and orchestrator. Flow 3 step 2 has no foundation.
- `work_order.complete` lacks an orchestrator entry, even though it triggers QA / signoff downstream.
- Naming drift on every step except `inventory.reserve_for_project`.

---

## FLOW 4 — execution_to_cash (4 steps)

| # | Step | State Machine | Orchestrator | Verdict |
|---|------|--------------|-------------|---------|
| 1 | `project.mark_billable` | MISSING — no `mark_billable` transition on `project` | MISSING — no `project.mark_billable`; closest is `project.create_invoice` | NOT IMPLEMENTED |
| 2 | `invoice.issue` | OK — `draft→issued` via `issue` | OK — `invoice.issue` | Implemented (def) |
| 3 | `payment.register` | PARTIAL — `payment.draft→posted` via `post` (naming drift: `register` vs `post`) | OK — `invoice.register_payment` (note: keyed under `invoice`, not `payment`) | Implemented (def) — entity/naming drift |
| 4 | `bank_match.reconcile` | MISSING — `bank_match` entity is not in STATE_MACHINES | OK — `payment.reconcile` (keyed under `payment`, not `bank_match`) | Partial — orch only, entity drift |

**Flow 4 gaps:**
- **`bank_match` entity is missing** from state machines.
- `project.mark_billable` has no scaffolding at all (neither SM nor orch). Flow expects this to create an invoice draft, but the orchestrator has only `project.create_invoice` keyed differently.
- Entity drift: `payment.register` orchestration is keyed `invoice.register_payment`; `bank_match.reconcile` is keyed `payment.reconcile`.

---

## FLOW 5 — employee_to_payroll (4 steps)

| # | Step | State Machine | Orchestrator | Verdict |
|---|------|--------------|-------------|---------|
| 1 | `employee.attend_work` | MISSING — `employee` SM has only `leave/suspend/terminate` transitions | MISSING — no `employee.attend_work` orchestration | NOT IMPLEMENTED |
| 2 | `attendance.approve` | OK — `submitted→approved` via `approve` | OK — `attendance.approve` | Implemented (def) |
| 3 | `payroll.calculate` | OK — `draft→calculated` via `calculate` | OK — `payroll.calculate` | Implemented (def) |
| 4 | `payroll.approve_and_export` | PARTIAL — SM has separate `calculated→approved` (`approve`) and `approved→exported` (`export`) | MISSING — no `payroll.approve_and_export`; orch has `payroll.export` only | Partial — composite step not modeled |

**Flow 5 gaps:**
- `employee.attend_work` has neither SM transition (employee SM is for HR lifecycle, not attendance events) nor orchestrator entry. The flow assumes the action creates an `attendance` record, but there is no `attendance.create` orchestration either.
- `payroll.approve_and_export` is a composite step (approve THEN export) that isn't modeled as a single orchestrator action; missing approval orchestration entirely (no `payroll.approve` exists).

---

## Aggregate scoreboard

| Flow | Steps | Fully scaffolded (SM+orch) | Partial | Not implemented |
|------|-------|----------------------------|---------|-----------------|
| 1 sales_to_project | 5 | 2 (q.approve, q.convert) | 3 | 0 |
| 2 project_to_procurement | 5 | 1 (rfq.convert_to_po) | 2 | 2 |
| 3 procurement_to_execution | 4 | 2 (po.receive, wo.start) | 1 | 1 |
| 4 execution_to_cash | 4 | 1 (invoice.issue) | 2 | 1 |
| 5 employee_to_payroll | 4 | 2 (att.approve, payroll.calc) | 1 | 1 |
| **TOTAL** | **22** | **8 (36%)** | **9 (41%)** | **5 (23%)** |

---

## Critical missing entities (no SM, no orch)

These entities are referenced by `WORKFLOW_FLOWS` steps but have **zero scaffolding** in `state-machines.js`:

1. **`material_request`** — referenced by Flow 2 step 2. Needed states: draft → submitted → approved → fulfilled.
2. **`inventory`** — referenced by Flow 3 step 2. Needed states for stock items: available → reserved → consumed.
3. **`bank_match`** — referenced by Flow 4 step 4. Needed states: pending → matched → reconciled.

---

## Critical missing orchestrations (high priority)

| Action key | Flow | Why critical |
|-----------|------|--------------|
| `lead.qualify` | 1.1 | Entry-point of entire ERP master flow |
| `project.start_planning` | 1.5 | Triggers WBS, material requirements; gateway to procurement |
| `project.request_materials` | 2.1 | Spawns the entire procurement sub-flow |
| `material_request.create_rfq` | 2.2 | Bridge between project and procurement; entity itself missing |
| `rfq.compare_and_approve` | 2.3 | Multi-supplier comparison + approval; high-value gate |
| `inventory.reserve_for_project` | 3.2 | Critical for project costing accuracy |
| `work_order.complete` | 3.4 | Triggers QA + signoff; project progress depends on it |
| `project.mark_billable` | 4.1 | Cash flow trigger |
| `employee.attend_work` | 5.1 | Daily-occurring action; foundation for payroll + costing |
| `payroll.approve_and_export` | 5.4 | Composite gate for paying employees |

---

## Naming drifts (require either flow or SM rename)

The following actions exist on both sides but with mismatched names — UI buttons calling the flow-name will fail to find SM transitions or orch keys:

| Flow action | SM transition | Orch key | Fix |
|------------|--------------|----------|-----|
| `quote.convert_to_project` | `quote.convert` | `quote.convert_to_project` | rename SM transition `convert→convert_to_project` |
| `project.start_planning` | `project.plan` | (missing) | rename SM `plan→start_planning` |
| `rfq.compare_and_approve` | `rfq.approve` | (missing) | add orchestration; align naming |
| `rfq.convert_to_po` | `rfq.convert` | `rfq.convert_to_po` | rename SM `convert→convert_to_po` |
| `po.send_and_receive` | (composite of `send` + `partial_receive`/`full_receive`) | (missing) | split flow step OR add composite orch |
| `po.receive_items` | `po.partial_receive` / `po.full_receive` | `po.receive_items` | rename SM transitions OR alias in orch |
| `work_order.start_execution` | `work_order.start` | `work_order.start` | rename flow step OR alias |
| `work_order.complete` | `work_order.complete` | (missing) | add orchestration |
| `payment.register` | `payment.post` | `invoice.register_payment` | rename SM `post→register`; re-key orch under `payment` |
| `bank_match.reconcile` | (entity missing) | `payment.reconcile` | add `bank_match` SM; re-key orch |
| `payroll.approve_and_export` | (composite of `approve` + `export`) | `payroll.export` only | split flow step OR add composite orch |

---

## Implementation layer gap (applies to all 22 steps)

`executeOrchestration()` in `orchestrator.js` (lines 270–298) currently:
- Iterates over `orch.effects` and pushes `{ type, entity, status: 'executed' }` to a result log.
- Calls `audit()` if available.
- Does **NOT** dispatch any of these effect types to real handlers:
  `create`, `link`, `transition`, `audit`, `notify`, `update_inventory`, `update_costing`, `post_to_gl`, `post_to_vat`, `start_collection_tracking`, `create_tasks`, `snapshot`, `init_progress_tracking`, `enable_attendance_links`, `update_project_progress`, `calculate_wo_costs`, `check_delivery_ready`, `create_or_update`, `mark_reconciled`, `update_cashflow`, `set_status`, `mark_available_for_payroll`, `mark_available_for_costing`, `calculate_pension`, `allocate_labor_expense`, `post_costs_to_finance`, `update_invoice_balance`, `close_linked_task`, `update_budget`, `notify_supplier`, `notify_employee`, `notify_customer`, `create_warehouse_receipt`, `create_quality_check`, `create_signature`, `start_attendance_tracking`, `link_to_payroll`, `link_to_project`, `create_payment_record`, `bank_matching`, `update_tax_export`, `create_alert`, `create_audit`, `create_approval`, `create_comparison`, `create_po`, `create_project`, `create_contract`, `create_customer`, `create_wage_slips`, `create_bank_file`, `assign_employees`, `assign_manager`, `reserve_inventory`, `archive_documents`, `generate_closure_report`, `create_logistics_order`, `create_invoice`, `update_project_financials`, `create_material_requests`, `create_approvals`, `create_rfq`, `create_work_orders`.

**~60 effect types are referenced but unhandled.** Every "Implemented (def)" verdict above means only that the metadata is wired — the side-effects do not actually run.

---

## Recommended priorities (build order)

**P0 — unblock master flow:**
1. Add `material_request`, `inventory`, `bank_match` to `STATE_MACHINES`.
2. Add missing orchestrations: `lead.qualify`, `project.start_planning`, `project.request_materials`, `inventory.reserve_for_project`, `work_order.complete`, `project.mark_billable`, `employee.attend_work`.
3. Reconcile naming drift (11 cases) — single source of truth between flow + SM + orch.

**P1 — make actions actually run:**
4. Implement effect dispatcher in `executeOrchestration` for the top-10 effect types: `create`, `link`, `transition`, `audit`, `notify`, `update_inventory`, `post_to_gl`, `create_tasks`, `update_costing`, `update_project_progress`.

**P2 — fill the long tail:**
5. Wire remaining ~50 effect handlers.
6. Add composite orchestrations for `po.send_and_receive`, `payroll.approve_and_export`, `rfq.compare_and_approve`.

---

## Files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\workflow-flows.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\state-machines.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\orchestrator.js`
