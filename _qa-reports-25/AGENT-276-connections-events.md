# AGENT-276 — CONNECTIONS #1: Cross-Service Event Catalog

**Auditor:** Agent 276 (Connections #1)
**Date:** 2026-04-29
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Scope:** Document every event that flows between the 4 services (OPS, PROCUREMENT, PAYROLL, AI). Catalog them by source-service to consumer-service. Identify gaps where a sender exists with no consumer (or vice versa).
**Verdict:** Three independent event vocabularies coexist with a written choreography, but only ~15% of declared cross-service deliveries are actually wired. **Most cross-service events are emitted-and-vanished.**

---

## 1. Three independent event surfaces (and they don't talk)

The codebase contains **three distinct event-emitting subsystems**, each with its own naming convention and storage:

| # | Surface | Location | Naming | Storage / transport |
|---|---|---|---|---|
| 1 | **EventBus (typed, in-process)** | `onyx-procurement/src/wiring/event-bus.js` (738 LOC) + `domain-events.js` | dotted `module.entity.action` (e.g. `procurement.po.approved`) | In-process EventEmitter + optional persistence to `domain_events` via `packages/shared-events` |
| 2 | **OPS realtime EventBus** | `techno-kol-ops/src/realtime/eventBus.ts` | colon-style `entity:verb` (e.g. `workorder:completed`) | Postgres `system_events` table + WebSocket broadcast |
| 3 | **Webhook outbound registry** | `onyx-procurement/src/webhooks/webhook-events.js` | dotted `entity.action` (e.g. `invoice.paid`) | Outbound HTTPS to subscribers (B2B integrations) |

Plus two declared-only catalogs that are **not backed by an emitter**:

| Catalog | Location | Status |
|---|---|---|
| `EVENT_TRIGGERS` (11 entries: `quote_approved`, `lead_converted`, `po_received`, …) | `onyx-procurement/src/pipeline/pipeline-engine.js:218-281` | Loaded into `pipeline_events` audit table when `POST /api/pipeline/trigger` is called manually. **No producer auto-fires these.** |
| Orchestrator `events: [...]` field (15 events: `quote.created`, `project.created_from_quote`, `inventory.received_from_po`, …) | `onyx-procurement/src/pipeline/orchestrator.js` | String literals copied into `result.events_emitted`. **Never published to any bus.** AGENT-128 §3 already noted this. |

The naming styles never reconcile. `procurement.po.approved` (EventBus #1), `workorder:completed` (EventBus #2), `invoice.paid` (Webhook #3), `quote.approved` (orchestrator literal), and `quote_approved` (pipeline trigger) are five different shapes for the same business idea.

---

## 2. Per-source emit catalog (what is actually published)

### 2.1 ONYX_PROCUREMENT (port 3100) emits

**Via `EventBus` (`wiring/event-bus.js`) — 8 typed defaults + 8 onyx-specific = 16 registered:**

| Event type | Registered in | Actual `bus.emit/publish` callsite found? |
|---|---|---|
| `procurement.po.created` | event-bus.js:70, domain-events.js:49 | NOT found in the repo (registered, never emitted) |
| `procurement.po.approved` | event-bus.js:78, domain-events.js:54 | NOT found |
| `procurement.grn.received` | event-bus.js:86 | NOT found |
| `procurement.rfq.sent` | domain-events.js:59 | NOT found |
| `commercial.quote.approved` | domain-events.js:64 | NOT found |
| `finance.invoice.posted` | event-bus.js:94 | NOT found |
| `finance.invoice.issued` | domain-events.js:69 | NOT found |
| `finance.payment.dispatched` | event-bus.js:102 | NOT found |
| `finance.payment.registered` | domain-events.js:74 | NOT found |
| `inventory.stock.updated` | event-bus.js:110 | NOT found |
| `hr.employee.hired` | event-bus.js:118 | NOT found |
| `compliance.audit.flag` | event-bus.js:126 | NOT found |
| `workforce.payroll.calculated` | domain-events.js:79 | NOT found |
| `governance.audit.created` | domain-events.js:84 | NOT found |

**Via direct `eventBus.emit(...)` in `payments/payment-run.js` — 9 unregistered types:**

```
payment.proposal.created   payment-run.js:484
payment.proposal.edited    payment-run.js:521
payment.run.approved       payment-run.js:608
payment.run.executed       payment-run.js:737
payment.confirmed          payment-run.js:841
payment.rejected           payment-run.js:909
payment.remittance         payment-run.js:972
payment.run.reconciled     payment-run.js:1014
```

These do NOT match any registered type. They emit on a local `eventBus` import but go to no cross-service consumer.

**Via webhook registry — 12 outbound types** (`webhooks/webhook-events.js:39-67`):
`invoice.created`, `invoice.paid`, `invoice.cancelled`, `wage_slip.issued`, `wage_slip.voided`, `vat_export.submitted`, `bank_reconciliation.completed`, `po.approved`, `po.delivered`, `payment.received`, `annual_tax.filed`, `user.login.failed`. These ship to external HTTPS subscribers — not to OPS / AI / PAYROLL.

### 2.2 TECHNO_KOL_OPS (port 3200) emits

**Via `realtime/eventBus.ts` — 10 listeners registered + emits in routes:**

| Event | Emitted at | Listener side-effects |
|---|---|---|
| `lead:created` | (handler at line 100, no producer found) | broadcast LEAD_CREATED, auto-assign sales rep |
| `quote:generated` | (handler at line 142, no producer found) | broadcast QUOTE_GENERATED |
| `order:updated` | (handler at line 26, no producer found) | broadcast ORDER_UPDATED, auto-create delay alert |
| `project:created` | `routes/pipeline.ts:67` | `system_events` insert + broadcast PROJECT_CREATED |
| `project:stage_advanced` | (handler at line 41, no producer in repo) | `pipeline_events` insert + broadcast |
| `workorder:created` | `routes/workOrders.ts:120` | `system_events` insert (`execution.workorder.created`) |
| `workorder:assigned` | `routes/workOrders.ts:222` | `system_events` insert |
| `workorder:completed` | `routes/workOrders.ts:192` | `system_events` insert + broadcast (comment: "Invoice creation should be triggered" — **is not**) |
| `payment:received` | (handler at line 88, no producer in OPS) | UPDATE clients.balance_due |
| `material:low` | (handler at line 77, no producer in repo) | auto-alert |
| `employee:checked_in`, `gps:update`, `task:completed`, `alert:create`, `order:all_tasks_done` | various | local effects only |

OPS publishes domain events on a **separate** EventEmitter than procurement's. The two buses do not share a transport. There is no HTTP shipper that turns `workorder:completed` into a network call to procurement or AI.

### 2.3 PAYROLL_AUTONOMOUS (port 5173) emits

**None.** The payroll service is a Vite SPA mounted at `/payroll`. Grep for `eventBus|emit|domain.event|publish` in `payroll-autonomous/src/` returns only i18n keys (`employee.name`, `employee.role` — translation strings, not events). No back-end of its own; the Hebrew payroll routes live inside procurement at `onyx-procurement/src/payroll/payroll-routes.js`.

### 2.4 ONYX_AI (port 3300) emits

**None.** The live AI server (`onyx-ai/src/onyx-platform.ts`) only **receives**: `POST /api/knowledge/entity`, `POST /api/knowledge/query`, `GET /api/events` (list), `GET /api/audit`. There is no outbound emit to OPS or procurement. The wiring spec declares `ai→ops` and `ai→procurement` calls (§2.4 of `wiring-spec.js`) but no code performs them.

---

## 3. Cross-service event matrix — declared vs. wired

The wiring spec (`wiring-spec.js:243-297`) declares 7 cross-service contracts with 17 calls. Each row below shows: declared in spec, sender wired, receiver wired.

| # | From → To | Action / event | Spec endpoint | Sender wired? | Receiver wired? |
|---|---|---|---|---|---|
| 1 | OPS → PROC | `create_po` | `POST /api/purchase-orders` | YES (OPS UI calls) | YES (`onyx-procurement/src/po`) |
| 2 | OPS → PROC | `create_rfq` | `POST /api/rfq/send` | partial | YES |
| 3 | OPS → PROC | `create_invoice` | `POST /api/invoices` | YES | YES |
| 4 | OPS → PROC | `get_financials` | `GET /api/analytics/project-financials/:id` | NO | NO route |
| 5 | OPS → PAYROLL | `assign_employee` | `POST /api/payroll/assignments` | NO | NO route — payroll has no API |
| 6 | OPS → PAYROLL | `record_attendance` | `POST /api/payroll/attendance` | NO | NO route |
| 7 | OPS → PAYROLL | `get_employee_costs` | `GET /api/payroll/employee-costs/:projectId` | NO | NO route |
| 8 | PROC → OPS | event `po_received` | `POST /api/ops/events` | NO emit found | NO `/api/ops/events` route in `techno-kol-ops/src/routes/` |
| 9 | PROC → OPS | event `invoice_issued` | `POST /api/ops/events` | NO | NO route |
| 10 | PROC → AI | `analyze_spending` | `POST /api/ai/analyze` | NO emit | NO `/api/ai/analyze` route in `onyx-platform.ts` |
| 11 | PROC → AI | `forecast_cashflow` | `POST /api/ai/forecast` | NO | NO route |
| 12 | PROC → AI | `detect_anomalies` | `POST /api/ai/anomaly` | NO | NO route |
| 13 | PAYROLL → PROC | `post_payroll_costs` | `POST /api/gl/transactions` | NO emit | partial — `gl` module exists, route uncertain |
| 14 | PAYROLL → PROC | `create_bank_file` | `POST /api/bank/import-payroll` | NO | NO route |
| 15 | AI → OPS | `send_alert` | `POST /api/ops/alerts` | NO emit | NO `/api/ops/alerts` POST route (only GET) |
| 16 | AI → OPS | `send_recommendation` | `POST /api/ops/recommendations` | NO | NO route |
| 17 | AI → PROC | `risk_signal` | `POST /api/finance/risk-signals` | NO | NO route |
| 18 | AI → PROC | `price_recommendation` | `POST /api/pricing/recommendations` | NO | NO route |

**Score: 3.5 / 18 cross-service contracts actually wired end-to-end (~19%).** All four are OPS→PROC commands (synchronous HTTP), not events. **No event-shaped delivery is wired across services.**

---

## 4. Sender exists, no consumer (orphan emits)

Events emitted by some part of the system that have nobody listening on any service:

| Event | Emitter | Reason for orphan status |
|---|---|---|
| `payment.proposal.created` / `.edited` / `.run.approved` / `.run.executed` / `.confirmed` / `.rejected` / `.remittance` / `.run.reconciled` (8 events) | `onyx-procurement/src/payments/payment-run.js` | Local-bus emits with no registered type and no subscribers. Not bridged to OPS or AI. |
| `workorder:completed` | `techno-kol-ops/src/routes/workOrders.ts:192` | Comment in `eventBus.ts:174` says "Invoice creation should be triggered" — but the listener only logs and broadcasts; no HTTP POST to procurement to create an invoice. |
| `project:created` | `techno-kol-ops/src/routes/pipeline.ts:67` | Spec `project_created` trigger (pipeline-engine.js:236) declares 4 actions (`create_work_orders`, `allocate_materials`, `assign_employees`, `send_notification`) — none auto-fired. Listener only broadcasts. |
| `payment:received` (OPS-side) | listener only at eventBus.ts:88 | The handler updates `clients.balance_due`, but no OPS code emits `payment:received`. The procurement-side `payment.confirmed` event is on a different bus and does not bridge to OPS, so this listener never fires. |
| Orchestrator events (`quote.created`, `lead.converted`, `customer.created`, `project.created_from_quote`, `workorder.created`, `workorder.started`, `workorder.signed_off`, `po.created`, `po.created_from_rfq`, `inventory.received_from_po`, `costing.updated`, `invoice.draft_created`, `invoice.issued`, `payment.registered`, `payment.reconciled`, `attendance.approved`, `payroll.calculated`, `payroll.exported`, `alert.resolved` — 19 events) | `orchestrator.js:33-263` (string literals in `events: [...]`) | Stored only in result log; never `bus.emit`'d. Listed `listeners` field references method names like `ai.margin_and_risk_review`, `procurement.prepare_procurement_context`, `ops.try_allocate_received_stock`, `ai.check_delivery_anomalies`, `ai.update_cashflow_forecast`, `ops.show_project_finance_update`, `ai.detect_collection_risk_change`, `procurement.consume_labor_cost`, `procurement.post_labor_cost`, `ai.detect_payroll_anomalies` — **none of these methods exist anywhere in the repo**. AGENT-79 / AGENT-128 had already flagged this. |

---

## 5. Consumer exists, no sender (orphan listeners)

Listeners that wait for events nobody emits:

| Listener | Listens for | No producer because |
|---|---|---|
| `eventBus.ts:26` | `order:updated` | OPS routes never emit it (no `eventBus.emit('order:updated')` callsite) |
| `eventBus.ts:41` | `project:stage_advanced` | No emitter found in the repo |
| `eventBus.ts:53` | `employee:checked_in` | No emitter found |
| `eventBus.ts:60` | `gps:update` | No emitter found in OPS routes |
| `eventBus.ts:77` | `material:low` | No stock-monitor emitter found |
| `eventBus.ts:88` | `payment:received` | Procurement emits `payment.confirmed` on a different bus |
| `eventBus.ts:100` | `lead:created` | No emitter found in `routes/leads.ts` |
| `eventBus.ts:124` | `task:completed` | No emitter found in `routes/tasks.ts` |
| `eventBus.ts:142` | `quote:generated` | No emitter (and the procurement counterpart `commercial.quote.approved` is on a different bus) |
| `domain-events.js:242` | `commercial.quote.approved` | No call to `emitDomainEvent('commercial.quote.approved', ...)` anywhere |
| `domain-events.js:252` | `procurement.po.approved` | No call to `emitDomainEvent('procurement.po.approved', ...)` anywhere |
| `domain-events.js:262` | `procurement.po.created` | No call to `emitDomainEvent('procurement.po.created', ...)` anywhere |
| `domain-events.js:272` | `finance.payment.registered` | No call to `emitDomainEvent('finance.payment.registered', ...)` anywhere |
| `domain-events.js:282` | wildcard `procurement.**` | Same as above — nothing publishes |

**Every cross-service listener registered in `domain-events.js` is currently dead code.**

---

## 6. The closest thing to working cross-service event flow

The procurement→AI bridge (`onyx-procurement/src/ai-bridge.js`) DOES make an HTTP call:

```
ai.recordEvent({ type, actor, timestamp, subject, payload })
  → POST :3300/events
```

But: AGENT-278 (already filed) confirmed the AI side returns 404 because the actual server (`onyx-platform.ts:2390`) only exposes `GET /api/events`, not `POST /events`. The bridge has `404` in its `SOFT_MISS_STATUS` set, so it silently returns `null`. **Even the one cross-service event-shipping path is non-functional.**

There are NO inverse calls — `onyx-ai/src/procurement-bridge.ts` is read-only (`getPurchaseOrders`, `getSavingsAnalytics`); it never sends events back to procurement.

---

## 7. Summary table — events per source/consumer pair

| Source ↓ / Consumer → | OPS | PROC | PAYROLL | AI | External (webhook) |
|---|---|---|---|---|---|
| **OPS** | 14 in-process | 0 wired | 0 wired (3 declared) | 0 wired | 0 |
| **PROC** | 0 wired (2 declared) | 16 in-process registered + 8 unregistered emits | 0 wired | 0 wired (3 declared, broken via 404) | 12 outbound types |
| **PAYROLL** | 0 | 0 wired (2 declared) | — | 0 | 0 |
| **AI** | 0 wired (2 declared) | 0 wired (2 declared) | 0 | — | 0 |

In-process events stay in-process. The 4 services are connected by the wiring **spec**, not by wiring.

---

## 8. Top 3 highest-leverage fixes

1. **Bridge `domain-events.js` to actual emit-sites in `orchestrator.js`** — when the orchestrator runs, replace the dead `events: ['quote.approved']` literal with `await emitDomainEvent('commercial.quote.approved', { entityType: 'quote', entityId, action: 'approved', payload })`. ~30 lines, lights up the 5 consumers in `domain-events.js:242-286`.
2. **Pick one event vocabulary.** The `module.entity.action` form (EventBus #1) is the most evolved — registry, persistence, DLQ, replay. Migrate `eventBus.ts` colon-events (`workorder:completed` → `execution.workorder.completed`) and orchestrator literals to it.
3. **Implement the missing receivers — minimum 3 routes:** `POST /api/ops/events` in `techno-kol-ops/src/routes/`, `POST /events` (or rename to `/api/events`) in `onyx-platform.ts`, `POST /api/finance/risk-signals` in procurement. Without these, every "event" the spec promises is undeliverable. AGENT-278 already specified the AI fix in ~30 LOC.

---

## 9. Files referenced (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\pipeline-engine.js` (EVENT_TRIGGERS, lines 218-281)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\orchestrator.js` (events literals, lines 33-263)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\wiring-spec.js` (CROSS_SERVICE_CONTRACTS, lines 243-297)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\wiring\event-bus.js` (typed bus, 738 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\wiring\domain-events.js` (cross-service consumers, lines 242-286)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\webhooks\webhook-events.js` (12 outbound webhooks, lines 39-67)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\payments\payment-run.js` (8 unregistered emits, lines 484-1014)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\ai-bridge.js` (procurement→AI HTTP, broken via 404)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\realtime\eventBus.ts` (OPS realtime bus, 215 LOC)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\workOrders.ts` (lines 120, 192, 222 — emits)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\pipeline.ts` (line 67 — `project:created` emit)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\src\onyx-platform.ts` (live AI routes, lines 2373-2464)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\src\procurement-bridge.ts` (read-only AI→PROC client)

---

## 10. Cross-references to prior agent reports

- AGENT-128 §3 — flagged 18 unsubscribed listener names declared in orchestrator
- AGENT-267 — diagrams the data-flow declared by spec; this report measures actual wiring
- AGENT-278 — root-causes the procurement→AI 404 (the only outbound HTTP event path)
- AGENT-03 §7 — earlier identification of the wrong-server-bootstrapped issue

This report counts the **events** specifically (not commands and not data-fetches); reports above describe the runtime/architectural issues.
