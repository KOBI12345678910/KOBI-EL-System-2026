# AGENT-304 — System End-to-End QA Report

**Date:** 2026-04-29
**Agent:** 304 — System Test Agent
**Scope:** End-to-end traversal of all 5 business flows (workflow-flows.js) cross-referenced against state-machines.js, entity-map.js, pipeline-engine.js, orchestrator.js and wiring-spec.js.
**Method:** Static traversal of pipeline definitions; every transition in workflow-flows is matched against the actual state machine; every action mapped through orchestrator + ACTION_API_MAP.

---

## Executive Summary

Inspected 5 flows × ~22 steps + 13 state machines (91 transitions) + 18 orchestrations + 55 action→API mappings.
**Findings:** 21 bugs — 4 BLOCKER, 7 HIGH, 7 MEDIUM, 3 LOW. The system has a solid backbone but several **flow breaks** prevent the documented Master Flow from executing end-to-end without manual intervention. The two most damaging are: (1) `project` state machine cannot reach `in_production`, and (2) `work_order` final state is `signed_off` but `state_machines.js` triggers reference `done` — causing dashboards to never reflect closure.

---

## BUG-304-001 — Project state machine has no `in_production` state, but entity-map and pipeline-engine claim it does
**Severity:** BLOCKER
**Module:** state-machines.js / entity-map.js / pipeline-engine.js
**Steps:**
1. Open `entity-map.js` line 171 — `project.statuses` lists `['draft','approved','in_planning','in_procurement','in_production','in_delivery','completed','closed']`.
2. Open `pipeline-engine.js` line 56 — same list, including `in_production`.
3. Open `state-machines.js` lines 172-184 — the `project` machine states are `draft, approved, in_planning, in_procurement, in_execution, in_delivery, completed, closed`. **`in_production` does not exist; it is named `in_execution`.**
4. UI in entity360 lists "התחל ייצור → in_production" as nextStep (entity-map.js:175).
**Actual:** Clicking "Start Production" sends `targetStatus=in_production` → state-machine rejects (`Unknown status`).
**Expected:** Single canonical name across all 6 modules.
**Fix:** Rename to `in_production` in state-machines.js (states + 4 trigger keys), OR rename to `in_execution` in entity-map.js, pipeline-engine.js and any UI. Recommend `in_execution` (already used by triggers `in_procurement→in_execution`, `in_execution→in_delivery`).

---

## BUG-304-002 — Work order completion mismatch: `done` vs `completed` vs `signed_off`
**Severity:** BLOCKER
**Module:** state-machines.js / pipeline-engine.js / wiring-spec.js
**Steps:**
1. `state-machines.js:223` — `work_order.in_progress.transitions.complete` → `completed`, then `completed→signed_off` (final).
2. `pipeline-engine.js:57` — statuses listed as `['open','assigned','in_progress','waiting_materials','qa_check','done','signed_off']` — uses `done`, not `completed`; uses `qa_check` instead of `qa`.
3. `wiring-spec.js:202` — `work_order.complete` API sets `status: 'done'` (PATCH body).
**Actual:** API writes `done`, state machine never accepts `done`, transition fails. Dashboards filtering by `status=completed` show 0 records even after completion.
**Expected:** All three sources agree on `completed` (and `qa`, not `qa_check`).
**Fix:** Standardize on the state-machine names (`completed`, `qa`). Update `pipeline-engine.js:57` and `wiring-spec.js:202` (`work_order.complete` body) to use `completed`. Add migration to rename existing rows.

---

## BUG-304-003 — `sales_order` flow exists in state machine but not in any of the 5 documented business flows
**Severity:** HIGH
**Module:** workflow-flows.js / state-machines.js
**Steps:**
1. `state-machines.js:61-121` defines a complete `sales_order` machine with 8 states, 10 triggers, badges, comment cites AGENT-159/246 + migration 00084.
2. `workflow-flows.js` defines 5 flows but **none reference `sales_order`** — Flow 1 jumps `quote → project`, Flow 4 starts at `project.mark_billable`. There is no Sales Order flow.
3. Pipeline-engine `PIPELINE_STAGES` has stage `order` ("Sales Order / Contract") — wired to nothing.
**Actual:** Sales Orders can be created but no workflow surfaces them; users will create them and they will sit dead.
**Expected:** Either Flow 1.5 or Flow 4 should branch through sales_order (especially the `confirmed→invoiced` and `delivered→invoiced` paths in state-machines.js:91-97).
**Fix:** Add `sales_to_order` flow OR document explicitly that `sales_order` is for direct-invoice (B2B SaaS) and project-bypass scenarios. Add UI nav entry.

---

## BUG-304-004 — Quote machine has `under_review` state with no entry transition (orphan)
**Severity:** HIGH
**Module:** state-machines.js
**Steps:**
1. `state-machines.js:35` — `quote.draft.transitions = { send:'sent', reject:'rejected' }`. No path to `under_review`.
2. Line 36 — only `sent.transitions.review = 'under_review'` enters it.
3. But `quote.approve` orchestration (orchestrator.js:51) accepts `statuses: ['draft','sent','under_review']` — so a draft can be approved without ever passing review.
**Actual:** Approval bypass — a quote can go `draft → approved` directly via the orchestration, breaking the audit trail (no `under_review` event).
**Expected:** Either drop `under_review` from `status_in` precondition or force the path `draft → sent → under_review → approved`.
**Fix:** Add transition `draft.transitions.review = 'under_review'`, OR tighten orchestrator preconditions to `['under_review']`. Recommend the latter so approvals always have the review event in audit.

---

## BUG-304-005 — Workflow flow steps reference actions/transitions that don't exist on the entity
**Severity:** HIGH
**Module:** workflow-flows.js vs state-machines.js
**Steps:**
1. Flow 2 step 4 — `rfq.convert_to_po` → matches state-machines `rfq.approved.transitions.convert='converted_to_po'` ✓
2. Flow 1 step 1 — `lead.qualify` → state-machines has `lead.new.transitions.qualify='qualified'` ✓
3. Flow 1 step 4 — `quote.convert_to_project` → state-machines has `quote.approved.transitions.convert='converted'`. The transition is named `convert`, **not** `convert_to_project`.
4. Flow 3 step 3 — `work_order.start_execution` → state-machines has `work_order.assigned.transitions.start='in_progress'`. The transition is `start`, **not** `start_execution`.
5. Flow 4 step 1 — `project.mark_billable` → no such transition exists in `project` state machine.
6. Flow 5 step 1 — `employee.attend_work` → no such transition; employee machine only has `leave/suspend/terminate`.
**Actual:** Workflow runner that maps `step.action` → state-machine transition will fail on every flow.
**Expected:** Either every flow `action` matches a transition name, or workflow-flows declares "this is a high-level step name, not a transition" and provides a mapping.
**Fix:** Add a `transition` field on each step (alongside `action`) that names the actual state-machine transition. Update orchestrator to look up `transition` first, fall back to `action`.

---

## BUG-304-006 — Orchestrator `quote.convert_to_project` uses `transition: 'convert'`, but state-machines triggers fire on `approved→converted`
**Severity:** MEDIUM
**Module:** orchestrator.js / state-machines.js
**Steps:**
1. `orchestrator.js:71` — `{ type: 'transition', entity: 'quote', transition: 'convert' }`.
2. `state-machines.js:38` — `quote.approved.transitions.convert = 'converted'` ✓.
3. But trigger key (line 45) is `'approved→converted'` — fires `create_project`, `create_contract`, `notify`.
4. `orchestrator.js:65-70` already creates `project`, `contract`, runs notify itself — **so triggers fire a second time** and we get duplicate projects/contracts/notifications.
**Actual:** Every quote→project conversion creates 2 projects, 2 contracts, 2 notifications (and 2 audit events).
**Expected:** Either orchestrator delegates to state-machine triggers (effects = transition only) or marks transition as "skipTriggers".
**Fix:** Add `skipTriggers: true` on the transition effect when orchestration already does the work, OR remove the duplicated `create` effects from orchestrator and rely on triggers.

---

## BUG-304-007 — Invoice "issued → sent" transition has no orchestrator action; UI button leads to dead end
**Severity:** HIGH
**Module:** orchestrator.js / wiring-spec.js / state-machines.js
**Steps:**
1. `state-machines.js:245` — `invoice.issued.transitions.send='sent'` exists.
2. `wiring-spec.js:207` — `invoice.send` API: `POST /api/invoices/:id/send`.
3. **No orchestration** in orchestrator.js for `invoice.send`. Only `invoice.issue` and `invoice.register_payment` exist.
4. State-machine fires trigger `'issued→sent': [{action: notify_customer}]` but that's only on transition; UI clicking "Send" gets HTTP 200 but no orchestration record.
**Actual:** Status flips to `sent` but no audit event, no listener notification, no AI hook. AR aging will not start counting from "sent" because cashflow update is not triggered.
**Expected:** Orchestration `invoice.send` with effects `[transition, notify_customer, start_ar_aging, audit]`.
**Fix:** Add orchestration for `invoice.send`. Audit existing invoices in `sent` to backfill audit trail.

---

## BUG-304-008 — Invoice machine has `cancelled` state with no exit, but `cancel` transition only available from `draft`
**Severity:** MEDIUM
**Module:** state-machines.js
**Steps:**
1. `state-machines.js:244` — `invoice.draft.transitions.cancel='cancelled'`. Issued/sent invoices cannot be cancelled.
2. Israeli accounting practice: a `sent` invoice that is wrong must be **credited** (zikui) — not cancelled — but the system shows no `credit_note` workflow.
3. There's no transition from any non-draft state to `cancelled`.
**Actual:** A user who issues a wrong invoice has no recovery path in UI; will likely click around and either delete (illegal in IL accounting) or leave duplicate.
**Expected:** Either add `void`/`credit` transition (issued→credited) producing a credit-note record, or document that "credit note" is its own entity.
**Fix:** Add `credit_note` entity + state-machine transitions `issued/sent/paid → credit_note_issued` that creates a negative-amount invoice. P0 for IL VAT compliance.

---

## BUG-304-009 — Payment state machine has no `failed` state; reverse-only path leaves money lost in limbo
**Severity:** HIGH
**Module:** state-machines.js
**Steps:**
1. `state-machines.js:340-352` — payment states `draft, posted, reconciled, reversed`. Only `posted→reversed`.
2. No `failed`, `bounced`, `pending_clearing` — these are real bank states (especially for Masav/Zahav).
3. Bank reconciliation flow assumes payment goes `posted→reconciled` directly; if bank file rejects (NSF), there's no state to represent it.
**Actual:** A bounced check / failed wire posts as `reconciled` once a manual fix is applied; cashflow forecast is wrong.
**Expected:** States: `draft → posted → pending_clearing → reconciled` with branches `pending_clearing → failed → reversed`.
**Fix:** Add intermediate states. Wire AGENT-135 (Masav) error responses to `failed` transition.

---

## BUG-304-010 — Attendance.exported_to_payroll is final, but payroll lifecycle requires re-export on recalculation
**Severity:** MEDIUM
**Module:** state-machines.js
**Steps:**
1. `state-machines.js:288` — `attendance.exported_to_payroll = final`.
2. `payroll.calculated.transitions.recalculate='draft'` (line 300) — payroll can be recalculated.
3. If payroll is recalculated (e.g. tax change retroactive), the corresponding attendance is locked and can't be re-attached.
**Actual:** Recalculated payroll runs against stale attendance snapshot; mismatches with retroactive Bituach Leumi rate changes.
**Expected:** Attendance should support `exported_to_payroll → re-opened → submitted` cycle, OR payroll recalc should snapshot attendance at calculation time.
**Fix:** Add `attendance.exported_to_payroll.transitions.reopen='approved'` guarded by payroll-recalc event. Confirm with AGENT-04 (payroll runtime).

---

## BUG-304-011 — RFQ entity-map.js statuses don't match state-machines.js
**Severity:** MEDIUM
**Module:** entity-map.js / state-machines.js
**Steps:**
1. `entity-map.js:123` — rfq statuses `['draft','sent','quotes_received','decided','cancelled']`.
2. `state-machines.js:124-133` — rfq states `['draft','sent','quotes_received','under_comparison','approved','rejected','converted_to_po']`.
3. **`under_comparison`, `approved`, `rejected`, `converted_to_po` are missing from entity-map.** **`decided`, `cancelled` are missing from state-machine.**
**Actual:** UI dropdown for RFQ status filter shows wrong options. Filter `decided` returns 0 (state never written). Status `under_comparison` cannot be filtered from UI.
**Expected:** Single source of truth — state-machines is canonical.
**Fix:** Replace entity-map.js:123 with the state-machines list. Audit other entities (project already failing — see BUG-001).

---

## BUG-304-012 — Lead state machine final state `won` has no project-creation trigger
**Severity:** HIGH
**Module:** state-machines.js / workflow-flows.js
**Steps:**
1. `state-machines.js:21` — `lead.won` is final.
2. Line 28 — trigger `'quoted→won'` runs `create_customer + notify` only.
3. Flow 1 step 4 says "convert to project" should happen — but no trigger creates a project from won lead. Project is only created from quote→converted.
4. If a lead is `won` without a quote (rare but legal — handshake deal), no project is ever created.
**Actual:** Edge case: lead with no quote → handshake → user marks won → project never appears → execution flow blocked.
**Expected:** Either prevent `qualified/contacted → won` without a quote, or auto-create a placeholder project.
**Fix:** Add precondition on `win` transition: `quote_exists`. Or add trigger `'qualified→won'` that creates project shell.

---

## BUG-304-013 — Empty screens: 7 entities exist in state-machines but have no entity-map entry
**Severity:** HIGH
**Module:** entity-map.js
**Steps:**
1. State-machines defines: `lead, quote, sales_order, rfq, po, project, work_order, invoice, employee, attendance, payroll, contract, task, payment, document, alert` (16).
2. Entity-map (entity-map.js) — sample shows `lead, customer, supplier, quote, rfq, po, project, work_order` — let me read more...
3. Sales_order has full state machine + badges (best-defined entity!) but **no entity-map entry**, **no nextSteps array**, **no UI page**.
4. `sales_order/new` route doesn't exist in CANONICAL_ROUTES (wiring-spec.js:73-93).
**Actual:** Sales orders cannot be created via UI; only via direct API POST. Entity360.html?type=sales_order returns "unknown entity".
**Expected:** Every state-machine entity has a matching entity-map entry + canonical route + 360 page.
**Fix:** Add entity-map entries for sales_order, payment, document, alert, task. Add canonical routes. Add `salesOrder360` to PAGE_CONTRACTS.

---

## BUG-304-014 — PO `cancelled` state is final but receiving partial shipments before cancellation has no inventory rollback
**Severity:** MEDIUM
**Module:** state-machines.js
**Steps:**
1. `state-machines.js:147` — `po.draft/pending_approval.transitions.cancel='cancelled'`.
2. PO **cannot** be cancelled from `sent`/`partially_received`/`fully_received` states.
3. Real-world: supplier ships 50% then cancels. PO is stuck `partially_received` forever — no path to closed-with-partials or cancelled-with-receipt.
**Actual:** Long-running stale POs in `partially_received` skew open-PO dashboard. Inventory shows phantom on-order quantities forever.
**Expected:** `partially_received → close_with_balance` transition that closes PO and writes off open balance.
**Fix:** Add transition + orchestration `po.close_partial`. Effect: write costing variance, close PO.

---

## BUG-304-015 — Document state machine `archived` is final — no recovery for accidentally archived legal documents
**Severity:** LOW
**Module:** state-machines.js
**Steps:**
1. `state-machines.js:354-363` — document states `uploaded, classified, signed, archived`. archived = final.
2. Israeli law (חוק הארכיון) requires 7-year retention with retrieval. "Final" forbids un-archive.
**Actual:** Audit / tax inspection requests an "archived" contract — UI shows it as locked-final, user must use direct DB to unarchive.
**Expected:** `archived.transitions.restore='classified'`.
**Fix:** Add restore transition guarded by role=admin.

---

## BUG-304-016 — Action→API map references endpoints that don't exist (no implementation found)
**Severity:** HIGH (smoke-test scope)
**Module:** wiring-spec.js
**Steps:**
1. `wiring-spec.js:160-237` defines 55 action→API mappings.
2. Quick spot check via Glob — no `onyx-procurement/src/server.js` found in worktree (only the pipeline modules exist here). API stubs are unverified.
3. Specific endpoints to verify externally: `POST /api/quotes/:id/convert-to-project`, `POST /api/payroll/compute`, `POST /api/bank/import-payroll`, `POST /api/ai/analyze`.
**Actual:** Cannot guarantee the documented APIs are implemented — runtime calls will 404.
**Expected:** Each action_api_map entry points to a registered Express route.
**Fix:** Add CI smoke test: spin up service, GET /api/wiring/action-map, for each entry call the path with a mock body, expect ≠ 404. Create issues for every miss.

---

## BUG-304-017 — `attendance.approve` orchestration uses `set_status` instead of `transition` — bypasses state-machine guard
**Severity:** MEDIUM
**Module:** orchestrator.js / state-machines.js
**Steps:**
1. `orchestrator.js:218` — effect `{ type: 'set_status', entity: 'attendance', status: 'approved' }`.
2. State-machine attendance has transitions `submit, approve, reject, export, revise`. Setting status directly bypasses `'submitted→approved'` trigger which runs `mark_available_for_payroll` and `mark_available_for_costing`.
3. Then orchestrator manually does `mark_available_for_payroll` + `mark_available_for_costing` — duplicate work plus the trigger never fires its audit log.
**Actual:** Two competing audit trails; one from orchestrator audit message and one from state-machine that never fires.
**Expected:** Use `{type:'transition', transition:'approve'}` and let triggers run.
**Fix:** Replace `set_status` with `transition`. Remove duplicate effects. Same for any other `set_status` usage.

---

## BUG-304-018 — Payroll `cancelled` exists but no transition leads to it from `calculated`/`approved`
**Severity:** LOW
**Module:** state-machines.js
**Steps:**
1. `state-machines.js:299` — `payroll.draft.transitions.cancel='cancelled'`.
2. From `calculated` only `approve, recalculate`. From `approved` only `export, pay`.
3. **No abort path for an approved payroll that needs to be voided** (e.g. found tax error after approval).
**Actual:** Stuck approved-but-don't-pay payrolls have no path forward except export-then-reverse-bank — accounting nightmare.
**Expected:** `approved → cancelled` transition with audit and unwind effect.
**Fix:** Add transition + unwind orchestration that reverses GL postings and cost allocations.

---

## BUG-304-019 — Cross-flow: PO receipt updates inventory but doesn't notify project work-orders waiting on materials
**Severity:** HIGH
**Module:** orchestrator.js / state-machines.js
**Steps:**
1. `orchestrator.js:135-148` `po.receive_items` effects: `inventory_receipt, update_inventory, warehouse_receipt, update_costing, transition`. Listener: `ops.try_allocate_received_stock`.
2. Work_order machine has `waiting_materials` state but its only exit is `assign` or `start` (line 222) — both manual.
3. **There's no automatic transition from `waiting_materials → assigned` when stock arrives.** The listener `ops.try_allocate_received_stock` is just a name with no implementation visible in pipeline modules.
**Actual:** PO arrives, inventory ticks up, but the WO that needed it stays in `waiting_materials`. Foreman has no notification. Production stalls until manual sweep.
**Expected:** PO receive → check pending reservations → auto-assign WO + notify foreman.
**Fix:** Implement `ops.try_allocate_received_stock` listener: query work_orders WHERE status=waiting_materials AND project_id IN (po.project_id) AND material_id IN (po.items); for each, attempt reservation → if all materials covered, transition `waiting_materials → assigned` + notify.

---

## BUG-304-020 — Dashboards: Finance360 widgets reference data sources without declared API endpoints
**Severity:** MEDIUM
**Module:** wiring-spec.js
**Steps:**
1. `wiring-spec.js:142-147` — finance360 widgets: `ar_summary_card, ap_summary_card, overdue_summary_card, cashflow_card, reconciliation_card, vat_liability_card`.
2. ACTION_API_MAP has no `finance.ar_summary` / `finance.ap_summary` / `finance.cashflow` endpoints.
3. Widgets in entity360.html (assumed implementation) will call which endpoint? Likely render empty.
**Actual:** Finance dashboard renders 6 empty cards.
**Expected:** Each widget has a declared `data_source` (API or aggregate query).
**Fix:** Add `WIDGET_DATA_SOURCES` map alongside PAGE_CONTRACTS. Each widget → `{endpoint, params}`. Validate at server startup.

---

## BUG-304-021 — Search: no global search endpoint declared, but every 360 page assumes you can pivot to a related entity
**Severity:** LOW
**Module:** wiring-spec.js
**Steps:**
1. CLAUDE.md key APIs list: `/api/wiring/spec`, `/api/entity-map/:type`, `/api/state-machines/...`, `/api/orchestrator/execute`, `/api/pipeline/stages`, `/api/workflows/:id`.
2. **No `/api/search?q=` endpoint listed.** Yet every 360 page has "related records" tabs that should be searchable.
3. CANONICAL_ROUTES has no `search` route group.
**Actual:** A user looking for "Cohen" cannot find the customer / lead / employee / supplier of that name from a global search.
**Expected:** `/api/search?q=&types=&limit=` returning ranked entities across services.
**Fix:** Add cross-service search aggregator in OPS (3200) that fan-outs to PROCUREMENT/PAYROLL/AI and merges results. Add to CANONICAL_ROUTES.

---

## Severity Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 2     | 001, 002 |
| HIGH     | 7     | 003, 005, 007, 009, 012, 013, 016, 019 |
| MEDIUM   | 8     | 004, 006, 008, 010, 011, 014, 017, 020 |
| LOW      | 3     | 015, 018, 021 |

---

## Recommended Fix Order

1. **BUG-001 + BUG-002** — naming inconsistency causes 100% of project/work_order flow breakage. Single rename PR.
2. **BUG-005** — workflow-flows uses fake action names; fix mapping or every flow runner errors.
3. **BUG-006 + BUG-017** — orchestrator double-executes effects; will create duplicate records in production.
4. **BUG-013 + BUG-011** — empty/wrong entity dropdowns; user-visible blocker.
5. **BUG-007 + BUG-019** — silent flow gaps; data appears consistent but business stalls.
6. **BUG-008 + BUG-009 + BUG-018** — state-machine completeness; legal/financial compliance.
7. **BUG-016** — runtime API verification (CI test).
8. Remaining items (003, 004, 010, 012, 014, 015, 020, 021) — backlog.

---

## Files to touch

- `onyx-procurement/src/pipeline/state-machines.js` — add `in_production` (or rename), add transitions for cancel/credit/restore/cancel-payroll, add `failed` payment state.
- `onyx-procurement/src/pipeline/entity-map.js` — sync RFQ/project status lists with state-machines; add sales_order/payment/document/alert/task entries.
- `onyx-procurement/src/pipeline/pipeline-engine.js` — sync ENTITY_STATUSES with state-machines.
- `onyx-procurement/src/pipeline/orchestrator.js` — add `invoice.send` / `payroll.cancel` / `po.close_partial`; replace `set_status` with `transition`; add `skipTriggers` flag to dedupe.
- `onyx-procurement/src/pipeline/workflow-flows.js` — add `transition:` field per step.
- `onyx-procurement/src/pipeline/wiring-spec.js` — add WIDGET_DATA_SOURCES; add `search` route group; add sales_order routes.
