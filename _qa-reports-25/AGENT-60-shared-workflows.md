# Agent 60 — `packages/shared-workflows/` Audit

**Date:** 2026-04-29
**Scope:** `packages/shared-workflows/` vs canonical `onyx-procurement/src/pipeline/workflow-flows.js` and `state-machines.js`
**Verdict:** SIGNIFICANT DRIFT — packaged machines disagree with canonical state-machines on naming convention, state lists, and transition names. workflow-flows.js has no counterpart in the package.

---

## 1. Package Inventory

| File | LOC | Purpose |
|------|----:|---------|
| `index.js` | 78 | Barrel export |
| `transition-engine.js` | 187 | `StateMachine` class (validator, no DB) |
| `machines.js` | 323 | 12 pre-built `StateMachine` instances |
| `guards.js` | 208 | 6 guard primitives + `assertAllGuards` |
| `escalation.js` | 181 | `checkSLA`, `getEscalationLevel`, `checkSLABatch` |

Engine + guards + escalation are clean utility code with no canonical counterpart — no drift to flag.

The drift surface is **`machines.js`**, which the file's own header claims "mirror the canonical definitions in `onyx-procurement/src/pipeline/state-machines.js`". It does not.

---

## 2. Naming-Convention Drift (systemic)

| Surface | Canonical (`state-machines.js`) | Packaged (`machines.js`) |
|---------|---------------------------------|--------------------------|
| State names | `snake_case` (`pending_approval`, `in_planning`, `partially_received`) | `PascalCase` (`PendingApproval`, `InPlanning`, `PartiallyReceived`) |
| Initial state | `new`, `draft`, `open` | `New`, `Draft`, `Open` |
| Final marker | `final: true` flag on state | implicit (no outgoing transitions) |
| Triggers/effects | `triggers: {'from→to': [{action, params}]}` map | absent |
| Transition names | `submit`, `receive`, `qa`, `fail`, `expire` | `request_approval`, `receive_quotes`, `send_to_qa`, `fail_qa`, `mark_overdue` |

**Impact:** Any consumer that imports `getMachine('po')` and feeds it a status from the database (`'pending_approval'`) will hit `Unknown state` in `transition-engine.js:82`. The packaged machines are unusable against the canonical data without a casing translation layer.

---

## 3. Per-Entity Drift

### 3.1 Lead — added `Converted` state, lost `convert` from canonical
- Canonical: `new → contacted → qualified → quoted → won → (final)` + `lose` from any
- Packaged: `New → Contacted → Qualified → Quoted → Won → Converted` (extra hop)
- Canonical has `won` as `final: true`; packaged makes `Converted` final and adds `convert: Won → Converted`. Conflicts with canonical `quote.approved → converted` model where the **quote** converts to project, not the lead.

### 3.2 Quote — missing `deleted` state
- Canonical states: `draft, sent, under_review, approved, rejected, converted, deleted` (7)
- Packaged states: `Draft, Sent, UnderReview, Approved, Rejected, ConvertedToProject` (6)
- Drift: `deleted` final state dropped; `converted` renamed to `ConvertedToProject`. Canonical also allows `draft → rejected` directly; packaged does not.

### 3.3 RFQ — extra reject paths, renamed final
- Canonical: `reject` only from `draft, sent, quotes_received, under_comparison`; rejected is final
- Packaged: same reject edges but renames final `converted_to_po` to `ConvertedToPO`. Acceptable.
- Missing: `draft → rejected` direct edge (canonical allows it).

### 3.4 PO — transition names diverge
| Canonical action | Packaged action |
|------------------|-----------------|
| `submit` (draft → pending_approval) | `request_approval` |
| `send` (approved → sent) | `send_to_supplier` |
| state name `sent` | state name `SentToSupplier` |
| `partial_receive` from `[sent]` only | from `[SentToSupplier, PartiallyReceived]` (extra self-edge) |
| no `cancel` from `Approved` or `Sent` | `cancel` allowed from `Draft, PendingApproval, Approved, SentToSupplier` (extra cancel surface) |

### 3.5 Project — extra `procure: Approved → InProcurement` edge
- Canonical: `approved` only goes to `in_planning` or `cancelled`; procurement requires planning first
- Packaged: `procure` allowed from BOTH `Approved` and `InPlanning` — bypasses planning gate
- Both: `complete` accepts `InExecution OR InDelivery` (matches)

### 3.6 WorkOrder — `wait_material` rename + missing return edge
- Canonical: `wait_material` (singular), `waiting_materials → assigned` allowed
- Packaged: `wait_materials` (plural), no `WaitingMaterials → Assigned` return edge
- Canonical: `qa → in_progress` via `fail`; packaged: `fail_qa` (renamed)
- Canonical: `complete` only from `in_progress`; packaged: from `InProgress OR QA` (extra path)

### 3.7 Invoice — extra `Issued` state, dropped direct edges
- Canonical: 8 states `draft, issued, sent, partially_paid, paid, overdue, in_collection, cancelled`
- Packaged: 8 states (matches count) but `Issued` is not the same as `issued` — packaged forces `Draft → Issued → Sent` then payments only from `Sent`/`Overdue`
- Canonical allows `sent → overdue` via action `overdue`; packaged renames to `mark_overdue`. Canonical allows `partially_paid → overdue`; packaged also has it. Acceptable shape, name drift only.
- `cancel` from `[Draft, Issued]` matches canonical `[draft, issued]`. OK.

### 3.8 Payment — drops `posted → reverse` edge
- Canonical: `reverse` from `draft` AND `posted`; `posted → reconciled OR reversed`
- Packaged: `reverse` from `Draft, Posted` (matches). OK — actually clean here.

### 3.9 Payroll — clean
States and transitions match canonical 1:1 modulo casing. `recalculate: Calculated → Draft` matches. `pay` from `[Approved, Exported]` matches. **No structural drift.**

### 3.10 Attendance — clean
1:1 match modulo casing. `revise: Rejected → Draft` and `export_to_payroll: Approved → ExportedToPayroll` both correct.

### 3.11 Task — major drift
- Canonical states: `todo, in_progress, blocked, escalated, done, cancelled` (6)
- Packaged states: `Open, Assigned, InProgress, Blocked, Completed, Cancelled` (6)
- **Different state sets:** canonical has no `Open`/`Assigned`/`Completed` — uses `todo`/`done`. Canonical has `escalated` state with `escalate`/`resolve` transitions. Packaged drops escalation entirely and adds an assignment phase canonical does not model.

### 3.12 Alert — different shape
- Canonical: `new → acknowledged → assigned → resolved`; transitions `ack`, `assign`, `resolve`, `dismiss`
- Packaged: `New → Acknowledged → InProgress → Resolved`; transitions `acknowledge`, `start`, `resolve`, `reopen`, `dismiss`
- Packaged adds `reopen: Resolved → InProgress` (canonical: resolved is final). Different intermediate state name (`InProgress` vs `assigned`).

---

## 4. Coverage Gaps in `machines.js`

Canonical `STATE_MACHINES` defines **16 entities**. Packaged `MACHINES` exposes **12** (13 with `po`/`purchase_order` alias).

**Missing from package:** `employee`, `contract`, `document`. Header comment claims "12 machines covering the full Master Flow" but employee/contract are central to the Sales→Project and Employee→Payroll flows.

---

## 5. workflow-flows.js Coverage

**No file in `packages/shared-workflows/` mirrors `WORKFLOW_FLOWS`.** The 5 business-flow definitions (sales_to_project, project_to_procurement, procurement_to_execution, execution_to_cash, employee_to_payroll) live only in `onyx-procurement`. The package name (`shared-workflows`) suggests it should be the canonical home for these — currently it only exposes machines + guards + SLA.

Workflow step actions also reference transitions that do NOT exist in either machine set:
- `lead.create_quote` (workflow step 2) — neither `state-machines.js` nor `machines.js` defines this action on `lead`
- `quote.convert_to_project` matches packaged action name; canonical uses `convert`
- `material_request.create_rfq`, `rfq.compare_and_approve`, `po.send_and_receive`, `project.start_planning`, `project.request_materials`, `project.mark_billable`, `inventory.reserve_for_project`, `work_order.start_execution`, `bank_match.reconcile`, `employee.attend_work`, `payroll.approve_and_export`, `payment.register` — **none of these are real transitions in either machine file.** They are workflow-level composite actions that have no executor.

---

## 6. Drift Summary Matrix

| Entity | Naming | States | Transitions | Triggers | Verdict |
|--------|--------|--------|-------------|----------|---------|
| lead | mismatch | +Converted | +convert, -lose paths match | dropped | DRIFT |
| quote | mismatch | -deleted | converted renamed | dropped | DRIFT |
| rfq | mismatch | match | converted_to_po renamed | dropped | MINOR |
| po | mismatch | match | submit→request_approval, send→send_to_supplier | dropped | DRIFT |
| project | mismatch | match | extra Approved→InProcurement edge | dropped | DRIFT |
| work_order | mismatch | match | wait_material→wait_materials, fail→fail_qa | dropped | DRIFT |
| invoice | mismatch | match | mark_overdue rename | dropped | MINOR |
| payment | mismatch | match | match | dropped | CLEAN |
| payroll | mismatch | match | match | dropped | CLEAN |
| attendance | mismatch | match | match | dropped | CLEAN |
| task | mismatch | DIFFERENT | DIFFERENT | dropped | MAJOR DRIFT |
| alert | mismatch | DIFFERENT | DIFFERENT | dropped | MAJOR DRIFT |
| employee | — | — | — | — | MISSING |
| contract | — | — | — | — | MISSING |
| document | — | — | — | — | MISSING |

---

## 7. Recommendations

1. **Pick one source of truth.** Either generate `machines.js` from `STATE_MACHINES` or delete `STATE_MACHINES` and have onyx import from `packages/shared-workflows`. Two hand-maintained copies will keep diverging.
2. **Standardize on `snake_case`** to match the database/API contract. Every status persisted hits the DB lowercased.
3. **Restore the `triggers`/effects map** in the package, or wire the packaged `StateMachine` to call `orchestrator.executeAction` on success — currently the package validates transitions but executes no side-effects, defeating the purpose of having canonical triggers.
4. **Fix Task and Alert** — they describe entirely different state shapes than the canonical model.
5. **Add `employee`, `contract`, `document` machines** to close coverage.
6. **Move `WORKFLOW_FLOWS` into the package** (e.g. `packages/shared-workflows/flows.js`) so payroll, ops, and AI services can import the same business-flow registry.
7. **Reconcile workflow-step actions** — every step in `WORKFLOW_FLOWS` should map to a real transition or a named orchestrator action.

---

## 8. Files Referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\packages\shared-workflows\index.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\packages\shared-workflows\machines.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\packages\shared-workflows\transition-engine.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\packages\shared-workflows\guards.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\packages\shared-workflows\escalation.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\workflow-flows.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\state-machines.js`
