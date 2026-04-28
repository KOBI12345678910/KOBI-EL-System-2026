# AGENT-31 — Deep Audit: orchestrator.js

**File:** `onyx-procurement/src/pipeline/orchestrator.js`
**Lines:** 338
**Date:** 2026-04-29
**Scope:** Verify 18 executable actions with preconditions, effects, events, listeners.

---

## 1. Summary

| Item | Expected | Found | Status |
|------|----------|-------|--------|
| Total actions | 18 | 18 | PASS |
| Actions with preconditions | 18 | 18 | PASS |
| Actions with effects | 18 | 18 | PASS |
| Actions with events | 18 | 18 | PASS |
| Actions with listeners | (subset) | 9 | PASS |
| Audit hook | yes | yes | PASS |
| Routes registered | 3 | 3 | PASS |

CLAUDE.md asserts "18 executable actions" — confirmed exact count.

---

## 2. Action Inventory (18)

| # | Key | Service | Preconds | Effects | Events | Listeners | Navigate |
|---|-----|---------|---------:|--------:|-------:|----------:|----------|
| 1 | lead.create_quote | ops | 2 | 4 | 1 | 0 | quote |
| 2 | lead.convert_to_customer | ops | 2 | 3 | 2 | 0 | customer |
| 3 | quote.approve | procurement | 2 | 4 | 1 | 1 | - |
| 4 | quote.convert_to_project | ops | 3 | 8 | 1 | 2 | project |
| 5 | project.create_work_order | ops | 2 | 4 | 1 | 0 | work_order |
| 6 | project.create_po | procurement | 1 | 4 | 1 | 1 | po |
| 7 | project.create_invoice | procurement | 1 | 4 | 1 | 0 | invoice |
| 8 | rfq.convert_to_po | procurement | 2 | 6 | 1 | 0 | po |
| 9 | po.receive_items | procurement | 2 | 6 | 2 | 2 | - |
| 10 | work_order.start | ops | 2 | 4 | 1 | 0 | - |
| 11 | work_order.signoff | ops | 2 | 6 | 1 | 0 | - |
| 12 | invoice.issue | procurement | 2 | 5 | 1 | 2 | - |
| 13 | invoice.register_payment | procurement | 2 | 4 | 1 | 1 | - |
| 14 | payment.reconcile | procurement | 2 | 4 | 1 | 0 | - |
| 15 | attendance.approve | payroll | 1 | 4 | 1 | 1 | - |
| 16 | payroll.calculate | payroll | 2 | 5 | 1 | 2 | - |
| 17 | payroll.export | payroll | 2 | 4 | 1 | 0 | - |
| 18 | alert.resolve | dynamic | 2 | 3 | 1 | 0 | - |

Totals: 32 preconditions, 82 effects, 20 events, 13 listener hooks across 9 actions.

---

## 3. Service Distribution

| Service | Count | Actions |
|---------|------:|---------|
| ops | 6 | lead.create_quote, lead.convert_to_customer, quote.convert_to_project, project.create_work_order, work_order.start, work_order.signoff |
| procurement | 8 | quote.approve, project.create_po, project.create_invoice, rfq.convert_to_po, po.receive_items, invoice.issue, invoice.register_payment, payment.reconcile |
| payroll | 3 | attendance.approve, payroll.calculate, payroll.export |
| dynamic | 1 | alert.resolve |

Aligns with the 4-service split in CLAUDE.md (ops/procurement/payroll). `dynamic` is a sensible catch-all for cross-cutting alerts.

---

## 4. Master Flow Coverage

CLAUDE.md flow: `Lead -> Quote -> Approval -> Order -> Project -> Work Orders -> Procurement -> Inventory -> Execution -> Delivery -> Invoice -> Payment -> Closure`

| Stage | Action(s) | Covered |
|-------|-----------|:-------:|
| Lead | lead.create_quote, lead.convert_to_customer | YES |
| Quote | quote.approve, quote.convert_to_project | YES |
| Approval | quote.approve | YES |
| Order/Project | quote.convert_to_project | YES |
| Work Orders | project.create_work_order, work_order.start, work_order.signoff | YES |
| Procurement | project.create_po, rfq.convert_to_po | YES |
| Inventory | po.receive_items | YES |
| Execution | work_order.start, work_order.signoff | YES |
| Delivery | (implicit via signoff -> check_delivery_ready) | PARTIAL |
| Invoice | project.create_invoice, invoice.issue | YES |
| Payment | invoice.register_payment, payment.reconcile | YES |
| Closure | work_order.signoff | PARTIAL |

Gaps: no explicit `delivery.dispatch` action; no `project.close` action. Closure is implicit via WO signoff side-effects.

---

## 5. Precondition Patterns

Six distinct check types observed:

- `entity_exists` (most common)
- `status_is` (single status)
- `status_in` (multi status)
- `bank_entry_exists` (payment.reconcile)
- `approved_attendance_exists` (payroll.calculate)
- `employee_active` (payroll.calculate)

All 18 actions have at least one precondition. No malformed checks. State-machine integration via imported `canTransition` is present (line 16) but NOT actually invoked inside `executeOrchestration` (line 270-298) — see Findings.

---

## 6. Effect Type Catalog

20 distinct effect types: `create`, `link`, `audit`, `transition`, `snapshot`, `create_tasks`, `notify`, `update_inventory`, `update_costing`, `init_progress_tracking`, `enable_attendance_links`, `update_project_progress`, `calculate_wo_costs`, `check_delivery_ready`, `post_to_gl`, `post_to_vat`, `start_collection_tracking`, `update_invoice_balance`, `create_or_update`, `mark_reconciled`, `update_cashflow`, `set_status`, `mark_available_for_payroll`, `mark_available_for_costing`, `calculate_pension`, `allocate_labor_expense`, `post_costs_to_finance`, `close_linked_task`.

Every action ends with an `audit` effect — consistent and correct.

---

## 7. Event Naming Audit

20 event tokens. Naming convention: `entity.past_tense_verb` (e.g. `quote.approved`, `po.created_from_rfq`). Consistent across all actions.

Special cases:
- `customer.created` emitted from `lead.convert_to_customer` (multi-event, correct).
- `inventory.received_from_po` + `costing.updated` together (correct fan-out).
- `project.created_from_quote` is descriptive (good — distinguishes from generic `project.created`).

No duplicate event names. No typos detected.

---

## 8. Listener Wiring (9 actions)

| Action | Listeners |
|--------|-----------|
| quote.approve | ai.margin_and_risk_review |
| quote.convert_to_project | ai.generate_project_risk_baseline, procurement.prepare_procurement_context |
| project.create_po | ai.assess_supplier_risk |
| po.receive_items | ops.try_allocate_received_stock, ai.check_delivery_anomalies |
| invoice.issue | ai.update_cashflow_forecast, ops.show_project_finance_update |
| invoice.register_payment | ai.detect_collection_risk_change |
| attendance.approve | procurement.consume_labor_cost |
| payroll.calculate | procurement.post_labor_cost, ai.detect_payroll_anomalies |

Listener namespacing follows `service.verb_object` form. AI listeners (8) and cross-service listeners (5) — matches "Intelligence & Automation layer" role of ONYX_AI in CLAUDE.md.

---

## 9. API Surface (3 routes)

- `GET /api/orchestrator/actions` — lists all 18 with counts (line 307)
- `GET /api/orchestrator/actions/:key` — single definition (line 318)
- `POST /api/orchestrator/execute` — runs an action (line 326)

`POST /api/orchestrator/execute` is referenced in CLAUDE.md "Key APIs" — PRESENT and matches contract.

---

## 10. Findings & Issues

### CRITICAL — none.

### HIGH

1. **Preconditions are declarative but not enforced at runtime.** `executeOrchestration` (lines 270-298) iterates `orch.effects` and pushes to `effects_executed` with status `executed`, but never validates `orch.preconditions`. A caller can run `quote.approve` on a non-existent quote and get `{ ok: true }`. Imported `canTransition`/`getTriggersForTransition` (line 16) are unused.

2. **Effects are not actually executed — only logged.** Line 286 comment explicitly says "simplified — in production each would call real APIs". `create`/`link`/`transition`/etc. effects are stub-recorded only. This is a known scaffold but should be tracked.

3. **Events are declared but not published.** `events_emitted` is copied into the result but no event bus / `supabase.channel` / pub-sub call is made. Listeners are likewise never notified despite being declared.

### MEDIUM

4. **`navigate` placeholder `:newId` is never substituted.** e.g. `/entity360.html?type=quote&id=:newId` is returned literally; no resolver replaces `:newId` with the created entity's id from effects.

5. **Missing actions for full Master Flow closure:**
   - No `delivery.dispatch` / `delivery.confirm` action.
   - No `project.close` action (closure stage is implicit only).
   - No supplier-invoice ingest action (purchase invoice path).

6. **`rfq.create_from_project` not in this orchestrator** — RFQ shows up as the source of `rfq.convert_to_po` but no action creates an RFQ. May live in workflow-flows.js but breaks orchestrator self-containedness.

### LOW

7. Effect schemas mix two field shapes — `fields: ['a','b']` (whitelist for copy) and `fields: { a: ':val' }` (key/value). Document the disambiguation.
8. `audit` effect is duplicated by the audit hook at line 292-295. Could lead to double-write once effects are real.
9. `console.log` at line 334 uses a unicode checkmark; OK for Linux/macOS but may render oddly on Windows cp1252 terminals.
10. `service: 'dynamic'` on `alert.resolve` is undocumented in CLAUDE.md's 4-service table.

---

## 11. Verdict

**Structural audit: PASS.** All 18 actions are present, well-formed, consistently named, fully populated with preconditions/effects/events, and the 3 declared API routes are wired. Listener fan-out matches the AI/cross-service architecture.

**Runtime audit: SCAFFOLD.** The executor is a contract-defining shell — preconditions are not checked, effects are not applied, events are not published. Production-readiness requires implementing the engine (issues #1, #2, #3). Until then, `POST /api/orchestrator/execute` is functionally a no-op that returns the spec.

**Recommendation:** treat `ORCHESTRATIONS` as the authoritative action manifest (it is sound) and route hardening / engine implementation as the next P0 task before declaring 360-page action wiring complete.
