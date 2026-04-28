# AGENT-29 — Deep Audit: `onyx-procurement/src/pipeline/state-machines.js`

**File**: `onyx-procurement/src/pipeline/state-machines.js`
**Lines**: 372
**Date**: 2026-04-29
**Scope**: state machines only (no cross-file checks)

---

## Status

PASS WITH DRIFT — file is well-formed, internally consistent, and exports a working executor (`canTransition`, `getAvailableTransitions`, `getTriggersForTransition`, `registerStateMachineRoutes`). However the actual content **drifts above the CLAUDE.md spec**: 15 machines (not 13) and 115 transitions (not 91). This is over-delivery, not a bug — but the documented contract is wrong.

---

## Count — CLAUDE.md says 13 / 91

### Machines: actual = **15**, spec = 13 — DRIFT (+2)

| # | Machine | Initial | States | Transitions | Final states |
|---|---------|---------|--------|-------------|--------------|
| 1 | `lead` | new | 6 | 9 | won, lost |
| 2 | `quote` | draft | 7 | 9 | converted, deleted |
| 3 | `rfq` | draft | 7 | 9 | rejected, converted_to_po |
| 4 | `po` | draft | 8 | 10 | closed, cancelled |
| 5 | `project` | draft | 9 | 11 | closed, cancelled |
| 6 | `work_order` | open | 8 | 11 | signed_off, cancelled |
| 7 | `invoice` | draft | 8 | 12 | paid, cancelled |
| 8 | `employee` | active | 4 | 7 | terminated |
| 9 | `attendance` | draft | 5 | 5 | exported_to_payroll |
| 10 | `payroll` | draft | 6 | 7 | paid, cancelled |
| 11 | `contract` | draft | 5 | 6 | terminated |
| 12 | `task` | todo | 6 | 7 | done, cancelled |
| 13 | `payment` | draft | 4 | 4 | reconciled, reversed |
| 14 | `document` | uploaded | 4 | 4 | archived |
| 15 | `alert` | new | 5 | 4 | resolved, dismissed |

**Total transitions = 9+9+9+10+11+11+12+7+5+7+6+7+4+4+4 = 115** (spec says 91 → +24).

### Counting method
Sum of `Object.keys(state.transitions).length` over every state in every machine. Final states (empty `transitions: {}`) contribute 0.

---

## Side-effects coverage

Trigger map is keyed `'fromStatus→toStatus'` (using the literal `→` arrow char). `getTriggersForTransition` looks up that exact key, so off-key triggers silently no-op.

| Machine | Trigger keys with actions | Notes |
|---------|---------------------------|-------|
| lead | 2 of 4 declared (`qualified→quoted`, `quoted→won`); 2 declared empty | |
| quote | 2 (`under_review→approved`, `approved→converted`) | |
| rfq | 2 (`under_comparison→approved`, `approved→converted_to_po`) | |
| po | 3 (`approved→sent`, `sent→partially_received`, `sent→fully_received`) | |
| project | 6 (full Master-Flow chain: approved→…→closed) | strongest coverage |
| work_order | 3 (`open→assigned`, `in_progress→qa`, `completed→signed_off`) | |
| invoice | 4 (`draft→issued`, `issued→sent`, `sent→paid`, `overdue→in_collection`) | |
| employee | **0** (`triggers: {}`) | gap |
| attendance | 2 | |
| payroll | 3 | |
| contract | 1 (`pending_signature→active`) | |
| task | **0** | gap |
| payment | 2 | |
| document | **0** | gap |
| alert | **0** | gap |

**Coverage = 30 / 115 transitions = ~26%.** Master-Flow critical path (Lead → Quote → Approval → Order → Project → WO → Procurement → Inventory → Execution → Delivery → Invoice → Payment → Closure) is fully wired. Auxiliary entities (employee, task, document, alert) are status-only — intentional or oversight.

### Side-effect verification (sampled actions)
Actions referenced by triggers: `create_quote, create_customer, notify, create_audit, create_project, create_contract, create_tasks, create_comparison, create_approval, create_po, link_to_project, notify_supplier, update_budget, update_inventory, create_warehouse_receipt, update_costing, assign_manager, create_material_requests, create_rfq, create_approvals, create_work_orders, reserve_inventory, assign_employees, create_logistics_order, create_invoice, update_project_financials, generate_closure_report, archive_documents, notify_employee, start_attendance_tracking, create_quality_check, create_signature, update_project_progress, calculate_wo_costs, check_delivery_ready, post_to_gl, post_to_vat, start_collection_tracking, notify_customer, create_payment_record, bank_matching, update_cashflow, update_tax_export, create_alert, mark_available_for_payroll, mark_available_for_costing, link_to_payroll, create_wage_slips, calculate_pension, create_bank_file, post_costs_to_finance, update_project_costing, close_matching_alerts`.

Per CLAUDE.md, `orchestrator.js` exposes 18 executable actions. The trigger list above references **~50 distinct action names** — many will not resolve in `orchestrator.js`. State-machine file alone cannot prove this; flagged as cross-file risk only.

---

## Issues

1. **Spec drift** — CLAUDE.md ("13 state machines with 91 transitions") undercounts the file by 2 machines / 24 transitions. Either the doc or the file needs updating.
2. **Empty trigger blocks** — `employee`, `task`, `document`, `alert` ship `triggers: {}`. Likely intentional (status-only entities), but no comment explains it.
3. **`triggers` keyed with `→` char (U+2192)** — works but is fragile. Any caller building keys with `->` ASCII or `>` will silently get `[]`. The arrow is hardcoded inside `getTriggersForTransition` (line 333), so callers must use the export, not roll their own — undocumented.
4. **`lead` has dead trigger entries** — `'new→contacted': []` and `'contacted→qualified': []` declare keys with empty action arrays. Harmless but noisy; same as not declaring.
5. **No `final: true` on `lead.won/lost` triggers branch** — minor: once final, no transitions exist anyway, but executor doesn't enforce; relies on `transitions: {}` lookup miss.
6. **Action-name surface unverified** — ~50 distinct action names in triggers vs. orchestrator's documented 18. Out of file's scope to verify, but worth a cross-file audit (AGENT-30 if it covers `orchestrator.js`).
7. **No timestamp/actor on transition** — `getTriggersForTransition` returns side-effect specs but executor has no `applyTransition` that audits/persists. Consumers must wire that themselves; CLAUDE.md says "Every transition is audited" — this file does not implement audit.
8. **`qa` state in `work_order`** — `qa` is both a state name and a transition name (`in_progress.transitions.qa: 'qa'`). Legal but readability hazard.

---

## Fixes

| # | Fix | Where | Severity |
|---|-----|-------|----------|
| F1 | Update CLAUDE.md to "15 state machines with 115 transitions" — or trim file to match spec | `CLAUDE.md` line for state-machines.js | doc |
| F2 | Add `// status-only — no side-effects by design` comment above `triggers: {}` for employee/task/document/alert | this file | cosmetic |
| F3 | Export the arrow constant (`const TRANSITION_ARROW = '→'`) and document the key format in a header comment | this file | low |
| F4 | Drop the two empty trigger entries in `lead.triggers` (`new→contacted`, `contacted→qualified`) | lines 25–26 | trivial |
| F5 | Add an `applyTransition(entityType, current, transitionName, ctx)` helper that returns `{ nextStatus, sideEffects, auditRecord }` and have callers route audit through it; CLAUDE.md promises audit | new function near line 335 | medium |
| F6 | Add validation pass at module load — assert every trigger key's `from` and `to` exist as states; assert every state's transitions point at known states | bottom of file | medium |
| F7 | Cross-check the ~50 action names referenced in triggers against `orchestrator.js` exports (out of scope for this file but worth a separate audit) | cross-file | medium |
| F8 | Rename `work_order` transition `qa` → `submit_qa` to disambiguate from the `qa` state name | line 155 | cosmetic |

---

## Bottom line

File is solid, executable, and richer than the spec claims. Master-Flow side-effects are wired end-to-end (Lead → Closure). Drift is only in the doc and in 4 status-only entities lacking triggers. No structural bugs found in the state-machine definitions themselves; the main gap is that `state-machines.js` declares triggers but does not own the audit/execution layer CLAUDE.md attributes to it — that lives in `orchestrator.js` and the trigger names need cross-file verification.
