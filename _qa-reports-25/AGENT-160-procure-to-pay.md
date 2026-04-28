# AGENT-160 — Procure-to-Pay (P2P) End-to-End Trace

**Service**: ONYX_PROCUREMENT (port 3100)
**Date**: 2026-04-29
**Scope**: Requisition → RFQ → PO → GRN → AP Invoice → Payment
**Verdict**: PARTIALLY IMPLEMENTED. Front half (Requisition→RFQ→PO) is wired and working. Back half (GRN, AP Invoice, Payment) is **DESIGNED BUT NOT WIRED** — schema exists, contracts declared, but no HTTP routes / orchestrator handlers reach the DB. The flow falls off a cliff after `PO sent`.

---

## 1. REQUISITION (Purchase Request) — IMPLEMENTED (partial)

### Code references
- **DB schema**: `onyx-procurement/supabase/migrations/001-supabase-schema.sql:82` (`purchase_requests`), `:97` (`purchase_request_items`)
- **Status enum**: `001-supabase-schema.sql:90` — `draft|rfq_sent|quotes_received|decided|ordered|delivered|cancelled`
- **Routes**:
  - `POST /api/purchase-requests` — `onyx-procurement/server.js:652`
  - `GET  /api/purchase-requests` — `server.js:675`
- **Audit**: `server.js:670` — `audit('purchase_request', …, 'created', …)`
- **Test**: `onyx-procurement/test/api/qa-08-purchase-requests.test.js`

### Gaps
1. **No state machine entry** for `purchase_request` in `src/pipeline/state-machines.js` — entity-map.js mentions it (line 145), but `enforceTransition('purchase_request', …)` has nothing to enforce. Confirmed at `server.js:786` — comment: `// (purchase_request has no state machine — skip enforcement, record history only)`.
2. **No approval workflow / threshold check**. PR is created and immediately RFQ-sendable; there's no manager sign-off step before procurement engages suppliers. `src/po/approval-matrix.js:1-25` exists but is wired only to PO, not PR.
3. **No POST permission gate**. `POST /api/purchase-requests` has no `requirePermission()` call — anyone with auth can create a PR. Compare to `POST /api/rfq/send` which requires `purchase-orders:create` (`server.js:688`).
4. **No `requested_by` foreign key** to `auth.users`/`employees` — column is free-text TEXT (`001-supabase-schema.sql:84`). Fraud vector + breaks Employee360.
5. **No `project_id` FK** — `purchase_requests.project_id TEXT` (`001-supabase-schema.sql:87`) is a string, not a UUID FK to `projects`. Breaks "PR linked to Project" flow in `workflow-flows.js:43-45`.
6. **No PUT/PATCH/DELETE endpoints** — once created, a PR can't be edited or cancelled via API.

---

## 2. RFQ — IMPLEMENTED (mostly)

### Code references
- **DB schema**: `001-supabase-schema.sql:114` (`rfqs`), `:130` (`rfq_recipients`), `:149` (`supplier_quotes`), `:174` (`quote_line_items`)
- **Routes**:
  - `POST /api/rfq/send` — `server.js:688` (RBAC: `purchase-orders:create`)
  - `POST /api/rfq/decide` — referenced at `server.js:1110` (creates `procurement_decisions` + auto-creates PO)
- **State machine**: `src/pipeline/state-machines.js:55-74` (rfq) — `draft→sent→quotes_received→under_comparison→approved→converted_to_po`
- **Engine**: `src/rfq/rfq-engine.js`
- **Domain event**: `procurement.rfq.sent` emitted at `server.js:808-812`
- **WhatsApp dispatch**: `server.js:751-783` (loops suppliers, calls `sendWhatsApp`)

### Gaps
1. **DB status values diverge from state machine**. `rfqs.status` CHECK in `001-supabase-schema.sql:123` allows `sent|collecting|closed|decided|cancelled`. State machine declares `draft|sent|quotes_received|under_comparison|approved|converted_to_po|rejected` (`state-machines.js:57-65`). **NEVER align** — `decided` exists in DB but not SM; `under_comparison` exists in SM but DB CHECK constraint will reject it. `recordTransition()` at `server.js:1126` writes `'decided'` which the DB allows but SM rejects → silent data corruption.
2. **No deadline cron**. `rfqs.auto_close_on_deadline` (`001-supabase-schema.sql:122`) defaults `true`, but no scheduled job runs to flip stale RFQs to `closed`. No cron registered in `server.js`.
3. **Reminder logic not wired**. `rfq_recipients.reminder_sent` field exists (`001-supabase-schema.sql:138`), `reminder_after_hours` defaults 12 (`001-supabase-schema.sql:120`), but no job sends reminders.
4. **Quote ingestion is manual only**. WhatsApp replies are NOT auto-parsed → `rfq.send` outbound is wired but inbound webhook to populate `supplier_quotes` is missing. `supplier_quotes.source` accepts `'whatsapp_reply'` (`001-supabase-schema.sql:164`), but no endpoint receives it.
5. **No RBAC on `/api/rfq/decide`**. The auto-PO creator has access controls only via `requirePermission` on the PO-side, not the decision side.

---

## 3. PURCHASE ORDER — IMPLEMENTED

### Code references
- **DB schema**: `001-supabase-schema.sql:192` (`purchase_orders`), `:237` (`po_line_items`)
  Also a second canonical schema at `db/migrations/0003_purchase_orders.sql:7-50`
- **Routes**:
  - `GET  /api/purchase-orders` — `server.js:1198`
  - `GET  /api/purchase-orders/:id` — `server.js:1206`
  - `POST /api/purchase-orders/:id/approve` — `server.js:1212` (RBAC: `purchase-orders:approve`)
  - `POST /api/purchase-orders/:id/send` — `server.js:1267` (RBAC: `purchase-orders:update`)
  - **NO** `POST /api/purchase-orders` — POs are only created via `/api/rfq/decide` at `server.js:1074-1090`
- **Approval matrix**: `src/po/approval-matrix.js` (5 brackets, vendor risk, emergency flag)
- **State machine**: `state-machines.js:76-102` — `draft→pending_approval→approved→sent→partially_received→fully_received→closed`
- **Enforcement**: `enforceTransition('po', …)` at `server.js:1218, 1272`
- **State history**: `recordTransition()` + `stateHistoryWriter.recordTransition()` paired (`server.js:1229, 1240`)
- **Domain event**: `procurement.po.created` at `server.js:1163`, `procurement.po.approved` at `server.js:1249`

### Gaps
1. **DB / SM status mismatch**. `purchase_orders.status` CHECK accepts `draft|pending_approval|approved|sent|confirmed|shipped|delivered|inspected|closed|cancelled|disputed` (`001-supabase-schema.sql:211`); state machine declares 8 different states (`state-machines.js:79-86`). State `'send_failed'` is written at `server.js:1347` but is in **neither** schema CHECK nor state machine — UPDATE will fail in production with strict CHECK.
2. **Two parallel PO schemas**. `001-supabase-schema.sql:192` (TEXT status, denormalized supplier_name) vs. `db/migrations/0003_purchase_orders.sql:7` (uses `doc_status` enum, no supplier_name column). `server.js` uses the former; the canonical migration is unused. Risk: schema drift / unclear source of truth.
3. **Approval matrix is dead code**. `src/po/approval-matrix.js` returns the chain but `POST /approve` (`server.js:1212`) accepts a single `approved_by` and writes `approved_at`. No multi-step approval, no escalation, no "manager → CFO" chain. Module exists but isn't called.
4. **No "Cancel PO" endpoint**. SM allows `draft→cancelled` and `pending_approval→cancelled` but no HTTP route exposes it.
5. **`/send` requires WhatsApp config**. If `WA_TOKEN` is unset, all sends fail and PO sticks at `send_failed` — no email fallback or manual-mark-sent path.
6. **Project link is text only**. `purchase_orders.project_id TEXT` (`001-supabase-schema.sql:208`) — same FK gap as PR.

---

## 4. GRN (Goods Receipt Note) — **NOT IMPLEMENTED** (critical gap)

### What exists
- **Spec**: `wiring-spec.js:79` declares route `/po/:id/receive` (UI), `wiring-spec.js:183` declares API `POST /api/purchase-orders/:id/receive`
- **Orchestration**: `orchestrator.js:135-148` — `'po.receive_items'` action defined: creates `inventory_receipt`, `warehouse_receipt`, updates inventory, transitions PO
- **State machine triggers**: `state-machines.js:90-100` — `sent→partially_received` and `sent→fully_received` declare `update_inventory`, `create_warehouse_receipt`, `update_costing`
- **Schema field**: `purchase_order_lines.received_qty` exists at `db/migrations/0003_purchase_orders.sql:46` (alt schema only)
- **UI placeholder**: `web/po360.html:175-177` shows mock GRN entries (`GRN-0081`, `GRN-0095`); state badges at `:194-196` include `partial_receipt`, `fully_received`

### What is MISSING
1. **No `POST /api/purchase-orders/:id/receive` route** in `server.js`. Verified by grep — no `/receive`, no `/grn`, no `/api/inventory-receipts`. Endpoint declared in wiring-spec is **not implemented**.
2. **No `inventory_receipts` / `goods_receipts` / `grn` table** in any migration (verified across `db/migrations/0001..0005` and `supabase/migrations/000..007`).
3. **No `received_qty` column on the schema actually used by server.js**. Only the alt `db/migrations/0003` has it — the live `supabase/migrations/001` PO line table at `:237-252` has no receiving columns.
4. **Orchestrator never executes**. `orchestrator.js:135` defines the action but `POST /api/orchestrator/execute` (per CLAUDE.md) doesn't actually run side-effects against the DB — it's metadata only.
5. **No quality / inspection step** despite `purchase_orders.quality_score` and `quality_result` columns existing (`001-supabase-schema.sql:217-218`) — never written to.
6. **No partial receipt support**. PO state `partially_received` exists in SM but no path to set it.
7. **No serial / lot / batch capture** for received goods.
8. **No GRN PDF / signed receipt artifact**. `src/receipts/receipt-pdf-generator.js` exists but is for customer receipts, not GRN.

---

## 5. AP INVOICE (Supplier Invoice) — **NOT IMPLEMENTED**

### What exists
- **Generic invoice schema**: `db/migrations/0004_invoices_and_payments.sql:7-30` — `invoices` table with `supplier_id`, `po_id`, `ocr_raw JSONB`, `paid_amount` auto-tracked via trigger (`:61-79`). NOTE: this is the alt schema; `supabase/migrations/001` has no invoices table at all for procurement.
- **Spec**: `wiring-spec.js:184` — `'po.create_invoice': POST /api/invoices, body {fromPO, direction:'input'}` (i.e., AP invoice = supplier invoice with direction=input)
- **Spec**: `wiring-spec.js:223` — `'supplier.register_invoice': POST /api/invoices, body {supplierId, direction:'input'}`
- **Orchestrator entry**: missing — `orchestrator.js` has `'invoice.issue'` (output / customer) and `'invoice.register_payment'` but no `'po.register_supplier_invoice'`
- **Entity-map**: `entity-map.js:76` declares `register_supplier_invoice` action on supplier entity; `:155` on PO entity
- **OCR**: `src/ocr/` exists (referenced in CLAUDE.md priorities); `invoices.ocr_raw JSONB` column ready
- **PDF gen**: `src/invoices/invoice-pdf-generator.js` (customer invoices only — AP receives PDF, doesn't generate)

### What is MISSING
1. **No `POST /api/invoices` route** in `server.js`. grep returned zero matches.
2. **No `supplier_invoices` table** in the live supabase migrations (`001-007`). The `db/migrations/0004` invoices table is generic but not in the supabase migration trail.
3. **No 3-way match logic anywhere**. Search for `three_way|3.way` returned zero hits in code. PO ↔ GRN ↔ AP Invoice tolerance check (qty + price within ε) is the heart of P2P integrity — completely absent.
4. **No tolerance configuration**. No `procurement_settings.invoice_tolerance_pct` or similar.
5. **No `invoices.status` AP-specific values**. State machine `invoice` (`state-machines.js:173-200`) is sales-side: `draft→issued→sent→paid|overdue|in_collection`. AP-specific states (`pending_3way_match`, `posted`, `disputed`, `on_hold`) don't exist.
6. **No GL posting on AP invoice**. `state-machines.js:186` triggers `post_to_gl` on `draft→issued` (output direction); no equivalent for AP that would Dr Expense / Cr AP.
7. **No duplicate invoice number guard** beyond `(supplier_id, invoice_number) UNIQUE` (`0004_invoices_and_payments.sql:26`) — but that schema isn't loaded.
8. **No PDF intake / OCR pipeline endpoint**. `ocr_raw` column exists but no `POST /api/invoices/:id/ocr` to populate it.
9. **No FX revaluation** for foreign-currency AP invoices despite `currency`, `fx_rate`, `total_ils` columns (`0004:15-20`).

---

## 6. PAYMENT (AP Disbursement) — **NOT IMPLEMENTED** (engine exists, not wired)

### What exists
- **Schema**: `db/migrations/0004_invoices_and_payments.sql:37-50` — `payments` table; trigger `recalc_invoice_paid()` (`:61-79`) auto-flips invoice to `paid` when sum reaches total
- **Payment Run Engine**: `src/payments/payment-run.js` — **1120 lines**, full Masav (מס"ב) export, batch proposals, includeExclude, approveRun, exportMasav, confirmPayment, rejectPayment, remittanceAdvice, reconcileWithBank
- **Other payment helpers**: `src/payments/check-printer.js`, `deposit-slip.js`, `qr-payment.js`
- **State machine**: `state-machines.js:272-284` — `payment: draft→posted→reconciled|reversed`
- **Spec**: `wiring-spec.js:208` — `'invoice.register_payment': POST /api/payments, body {invoiceId}`
- **Orchestrator**: `orchestrator.js:190-201` (`invoice.register_payment`), `:203-213` (`payment.reconcile`)

### What is MISSING (the whole disbursement pipeline)
1. **`payment-run.js` is NOT wired into `server.js`**. grep `createPaymentRunEngine\|payment-run` in server.js → zero matches. The 1120-line Masav engine is unreachable. There is also no `src/payments/payment-routes.js` that registers handlers.
2. **No `POST /api/payments` route**. The wiring-spec says it exists; it doesn't.
3. **No `payments` table in the live supabase migrations** (`001-007`). Same drift as AP invoice — `db/migrations/0004` is unloaded.
4. **No payment proposal / approval workflow exposed**. Engine has `proposeRun`, `approveRun`, `execute` but no HTTP surface.
5. **No bank file output endpoint**. `engine.exportMasav` returns bytes — no route to download.
6. **No payment reconciliation**. `payment.reconcile` orchestration declared (`orchestrator.js:203`) — no handler executes it.
7. **Bank reconciliation module loads conditionally**. `server.js:1548-1553` does `try { registerBankRoutes(...) } catch`. The `bank/bank-routes` module exists but is not part of payment processing — it's customer-side recon.
8. **No vendor remittance advice notification flow**. Engine has `remittanceAdvice` — no email/WhatsApp dispatch wired.
9. **No tax withholding** (ניכוי במקור) at payment time. Israeli compliance gap.
10. **Trigger `trg_pmt_recalc`** (`0004:76-79`) auto-promotes `invoices.status` to `paid` based on `payments.amount_ils` — but **this trigger lives in an unloaded migration**.

---

## 7. Cross-cutting gaps

| Gap | Severity | File:line |
|---|---|---|
| Two parallel schema sources (`db/migrations/*.sql` vs. `supabase/migrations/*.sql`) — only the latter is loaded by Supabase | CRITICAL | `db/migrations/0004` unused |
| No state machine for `purchase_request` | HIGH | `state-machines.js` (absent) |
| DB CHECK constraints diverge from state machine states (po, rfq) | HIGH | `001-supabase-schema.sql:123,211` |
| Approval matrix code exists but not wired | MEDIUM | `src/po/approval-matrix.js` |
| Payment Run Engine (1120 LOC) not wired | CRITICAL | `src/payments/payment-run.js` |
| GRN — entire stage missing from server.js / DB | CRITICAL | n/a |
| 3-way match logic absent | CRITICAL | n/a |
| `project_id` is TEXT not UUID FK on PR + PO | HIGH | `001-supabase-schema.sql:87,208` |
| No reminder/auto-close cron for RFQ deadlines | MEDIUM | `server.js` (no jobs) |
| Inbound WhatsApp quote parsing absent | MEDIUM | n/a |
| No tax withholding at payment | HIGH (IL) | n/a |

---

## 8. Net status by stage

| Stage | Schema | Route | RBAC | State Machine | Audit | Domain Event | Verdict |
|---|---|---|---|---|---|---|---|
| Requisition | partial | yes | NO | NO | yes | NO | partial |
| RFQ | yes | yes | yes | yes (drift) | yes | yes | OK (with drift) |
| PO approve/send | yes | yes | yes | yes (drift) | yes | yes | OK (with drift) |
| GRN | NO | **NO** | NO | declared only | NO | NO | **MISSING** |
| AP Invoice | partial (unloaded) | **NO** | NO | wrong direction | NO | NO | **MISSING** |
| Payment | partial (unloaded) | **NO** | NO | yes | NO | NO | **MISSING** (engine present) |

---

## 9. Top 3 fixes to unblock P2P

1. **Wire `payment-run.js` + create supabase migration `008-ap-and-payments.sql`** containing `supplier_invoices`, `payments`, `goods_receipts`, `grn_lines` with FKs to PO + PO lines + supplier. Reuse the unloaded `db/migrations/0004` as the starting point but namespace AP-side fields explicitly.
2. **Add `POST /api/purchase-orders/:id/receive` + `POST /api/invoices` (direction=input) + `POST /api/payments`** routes in `server.js`, each with state-machine enforcement (`enforceTransition`), audit, RBAC, and domain events. Total ~300 LOC.
3. **Implement 3-way match service** at `src/po/three-way-match.js`: input (po_id, grn_id, invoice_id) → output {match, variances, recommended_action}. Block AP invoice posting when out of tolerance unless override role.
