# AGENT-28 — Deep Audit: `onyx-procurement/src/pipeline/workflow-flows.js`

**Auditor:** Agent 28
**Date:** 2026-04-29
**File:** `onyx-procurement/src/pipeline/workflow-flows.js` (130 lines)
**Scope:** Verify the 5 business flows declared in CLAUDE.md (Sales→Project→Procurement→Execution→Cash + Employee→Payroll). Each must have entry, steps, exits, and error states.

---

## Status

**PARTIAL — STRUCTURAL GAPS.** The file declares all 5 flows with the correct labels, icons, colors, and step sequences mapped to the Master Flow. However the schema is **steps-only**: it has no `entry`, `exits`, or `error` keys at all. Cross-references to `entity-map.js`, `orchestrator.js`, and `state-machines.js` reveal additional drift on entity names and action IDs.

Counts: 5 flows present, 22 steps total (5+5+4+4+4), 2 HTTP routes (`/api/workflows`, `/api/workflows/:id`), 0 error branches, 0 exit conditions, 0 entry guards.

---

## Flow-coverage

| # | Flow id | Label | Steps | Entry? | Exits? | Errors? | Master-Flow alignment |
|---|---------|-------|------:|:------:|:------:|:------:|------------------------|
| 1 | `sales_to_project` | Sales → Project | 5 | NO | NO | NO | Lead→Quote→Approval→Order→Project (Order step missing — see Issue I-2) |
| 2 | `project_to_procurement` | Project → Procurement | 5 | NO | NO | NO | Project→WO→Procurement (WO not in this flow — handled in Flow 3) |
| 3 | `procurement_to_execution` | Procurement → Execution | 4 | NO | NO | NO | Procurement→Inventory→Execution→Delivery (Delivery missing) |
| 4 | `execution_to_cash` | Execution → Cash | 4 | NO | NO | NO | Invoice→Payment→Closure (Closure step missing) |
| 5 | `employee_to_payroll` | Employee → Payroll | 4 | NO | NO | NO | Standalone HR loop — bank export OK |

All 5 declared flows exist. **All 5 are missing entry guards, exit conditions, and error states uniformly.**

---

## Missing-steps (vs. Master Flow `Lead→Quote→Approval→Order→Project→WO→Procurement→Inventory→Execution→Delivery→Invoice→Payment→Closure`)

- **Flow 1** — No `Order` (sales-order) step between Quote-approve and Project-create. Spec calls for 13 stages including Order; flow jumps `quote.approve` → `quote.convert_to_project` directly.
- **Flow 2** — No explicit `material_request.approve` step before RFQ. Step 1 creates requests, step 2 jumps to RFQ creation; auth gate is implicit.
- **Flow 2** — No `RFQ.send_to_suppliers` step (creation and comparison are merged with selection). Spec separates `sent` → `responses_received` → `compared`.
- **Flow 3** — No `Delivery` step (Master Flow stage 10). Flow ends at `work_order.complete` without any delivery/logistics handoff.
- **Flow 3** — No `quality_check` or `signoff` step. Step 4 marks them as *results* (`quality_check_required`, `signoff_required`) but state-machines.js has explicit `qa` and `signed_off` states.
- **Flow 4** — No `Closure` step (Master Flow stage 13). Flow ends at bank reconciliation; project never transitions `completed→closed`.
- **Flow 4** — No `vat_period.close` / `gl.post` step despite results referencing `post_to_gl`, `post_to_vat`.
- **Flow 5** — No `attendance.submit` step (state-machines defines `draft→submitted→approved`); step 1 jumps from create to step 2 `approve`.
- **Flow 5** — No `payroll.export_to_bank` distinct step (merged into `approve_and_export`); state-machines splits `approved→exported_to_payroll`.

---

## Issues

**I-1 — No schema for entry/exits/error states.** Required by audit brief. Current shape: `{ label, labelEn, icon, color, steps[] }`. Missing: `entry`, `exits`, `errorStates`, `compensations`, `triggers`, `slaMinutes`, `roleRequired`. Consumer `/api/workflows/:id` returns the bare object — no error semantics for callers.

**I-2 — Missing Sales-Order entity.** Master Flow Stage 4 is `Order`. No flow step references `sales_order` and `entity-map.js` has no `sales_order` entity. Either remove `Order` from Master Flow doc or add it.

**I-3 — Step entities reference undeclared entity-map entries.** Flow steps cite entities `material_request`, `inventory`, `work_order`, `attendance`, `payroll`, `bank_match` — but `entity-map.js` (16 entities) only declares: `lead, customer, supplier, quote, rfq, po, project, work_order, invoice, employee, contract, material, payment, task, document, alert`. Missing from entity-map: `material_request`, `inventory` (only `material`), `attendance`, `payroll`, `bank_match`. CLAUDE.md claims "16 entities" — needs reconciliation.

**I-4 — Step actions not all in orchestrator.js.** Orchestrator has 18 executable actions. Workflow-flows references 22 step actions. Not in orchestrator: `qualify`, `start_planning`, `request_materials`, `create_rfq`, `compare_and_approve`, `send_and_receive`, `reserve_for_project`, `start_execution` (orchestrator has `work_order.start`), `complete`, `mark_billable`, `register` (orchestrator has `register_payment`), `attend_work`, `approve_and_export` (orchestrator splits `calculate` and `export`). 13 of 22 step actions have **no executable handler**.

**I-5 — Action naming drift between files.**
- `payment.register` (flow) vs `invoice.register_payment` (orchestrator) vs `payment.reconcile` (orchestrator).
- `work_order.start_execution` (flow) vs `work_order.start` (orchestrator).
- `payroll.approve_and_export` (flow) vs `payroll.export` + separate calculate (orchestrator).

**I-6 — Inconsistent step granularity.** Flow 1 = 5 steps, Flow 3/4/5 = 4 steps. No rationale; Flow 3 should arguably be 6+ (receive, putaway, reserve, issue-to-WO, execute, QA, signoff).

**I-7 — `results[]` is descriptive only.** Each step's `results` array contains snake_case strings that read like event names but are not registered in any event bus or `pipeline-engine.js` topology trigger. Consumers cannot dispatch on them.

**I-8 — No flow-level metadata.** No `id`, `version`, `owner`, `slaHours`, `kpi`, `priority`, `status`. Object key is the id; outer routes return `flows: WORKFLOW_FLOWS` (object, not array) — clients can't iterate ordered.

**I-9 — `step` numbering is a property, not enforced.** Numbers happen to start at 1 and increment, but nothing validates uniqueness, monotonicity, or absence of duplicates if a step is added.

**I-10 — No happy-path → terminal mapping.** No declaration of which step is terminal (success), no `successState` per flow.

**I-11 — Hebrew/English label parity not validated.** All flows have both `label` and `labelEn`; ok visually, but no schema check.

**I-12 — `/api/workflows/:id` returns 404 plain text only.** No machine-readable error code, no list-of-valid-ids in body to aid clients.

**I-13 — No protection against accidental mutation.** `WORKFLOW_FLOWS` exported by reference; any consumer can mutate it. Should be deep-frozen.

**I-14 — `bank_match` entity has no state machine.** Flow 4 step 4 calls `bank_match.reconcile`, but `state-machines.js` has no `bank_match` machine (only 11 of the 13 advertised — separate audit, but it bites this flow).

---

## Fixes

**F-1 — Add error/entry/exit schema.** Extend each flow:
```js
{ entry: { from: 'lead.new', guards: ['user_has_role:sales'] },
  exits: { success: 'project.in_planning', cancel: 'lead.lost' },
  errorStates: { quote_rejected: { compensate: 'notify_sales' },
                 conversion_failed: { rollback: ['delete_project_draft'] } } }
```

**F-2 — Add Order step or remove Order from Master Flow doc.** Decide: insert `sales_order` entity + `quote.create_order` step before `convert_to_project`, or strike Stage 4 from CLAUDE.md.

**F-3 — Reconcile entity registry.** Add `material_request`, `inventory`, `attendance`, `payroll`, `bank_match` to `entity-map.js` (or rename in flows to existing entries). Update CLAUDE.md count if it grows past 16.

**F-4 — Map every flow step to an orchestrator action.** For each `{entity, action}` pair, ensure `${entity}.${action}` exists in `orchestrator.js`. Add 13 missing handlers or rename flow steps to existing keys.

**F-5 — Standardize action names.** Pick canonical: orchestrator wins (it's executable). Update `workflow-flows.js`: `register` → `register_payment`, `start_execution` → `start`, `approve_and_export` → split into two steps (`approve` then `export`).

**F-6 — Add Delivery + Closure steps.** Flow 3: append `{entity:'logistics_order', action:'deliver'}`. Flow 4: append `{entity:'project', action:'close'}`.

**F-7 — Add `vat_period.close` / `gl.post` step in Flow 4** OR move them out of flat `results` into orchestrator effects to keep flow thin.

**F-8 — Add flow metadata.** `version`, `owner`, `slaHours`, `successState`, `terminalSteps[]`.

**F-9 — Deep-freeze export.** `module.exports = { WORKFLOW_FLOWS: deepFreeze(WORKFLOW_FLOWS), ... }`.

**F-10 — Validate at module load.** Iterate `WORKFLOW_FLOWS`, assert each step has `{step, entity, action, label, results}`, assert step numbers are 1..n, assert `${entity}.${action}` resolvable in orchestrator, throw on boot if invalid.

**F-11 — Improve `/api/workflows/:id` 404.** Return JSON `{ error, code:'FLOW_NOT_FOUND', validIds: Object.keys(WORKFLOW_FLOWS) }`.

**F-12 — Add `bank_match` state machine** in `state-machines.js`: `unmatched → suggested → confirmed → reconciled` (separate audit, but blocks this flow's last step).

**F-13 — Wire `results[]` to event bus.** Either publish each result string as an event in `pipeline-engine.js` triggers, or rename `results` to `documents` (descriptive) so it's not mistaken for executable signals.

**F-14 — Add `Approval` step explicitly in Flow 1.** Stage 3 of Master Flow is Approval. Currently `quote.approve` exists but no explicit Approval entity row created.

---

## Summary

`workflow-flows.js` is a **clean readable scaffold** — 5 flows in the right shape, Hebrew/English labels, sensible step ordering. But it is **structurally incomplete** for a production ERP: no entry guards, no exits, no error states, 13 of 22 step actions have no executable handler, 5 referenced entities are not in the entity-map, and the file has no validation, no freeze, and no metadata. **Recommend P0 work:** F-1, F-3, F-4, F-5, F-10 before any UI consumes these flows.
