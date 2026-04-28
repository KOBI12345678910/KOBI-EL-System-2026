# AGENT-30 — wiring-spec.js Deep Audit

**File:** `onyx-procurement/src/pipeline/wiring-spec.js` (334 lines)
**Date:** 2026-04-29
**Scope:** Verify counts vs. CLAUDE.md spec — 4 services, 20 entity relationships, 19 route groups, 9 page contracts, 55 action→API mappings, 7 cross-service contracts.

---

## 1. Service Ownership — EXPECTED 4 / FOUND 4 — PASS

| # | Key | Role | Port | Entities | Responsibilities |
|---|-----|------|------|----------|------------------|
| 1 | `ops` | operational_core | 3200 | 11 | 6 |
| 2 | `procurement` | finance_procurement_backbone | 3100 | 23 | 8 |
| 3 | `payroll` | workforce_and_salary_engine | 5173 | 9 | 5 |
| 4 | `ai` | intelligence_and_automation_layer | 3300 | 6 | 5 |

Ports/labels match CLAUDE.md exactly. Each entry has `role`, `label`, `port`, `entities[]`, `responsibilities[]` — schema is consistent across all 4.

**Note:** Procurement entity list (23) is denser than the others; `pipeline_stage` is in ops (correct). All four services expose distinct, non-overlapping entity sets.

---

## 2. Entity Relationships — EXPECTED 20 / FOUND 20 — PASS

| # | Entity | Lines | Relations Defined |
|---|--------|-------|-------------------|
| 1 | lead | 47 | belongs_to, has_many, can_create |
| 2 | customer | 48 | has_many, has_one |
| 3 | supplier | 49 | has_many, has_one |
| 4 | quote | 50 | belongs_to, has_many, has_one, can_create |
| 5 | rfq | 51 | belongs_to, has_many, can_create |
| 6 | po | 52 | belongs_to, has_many, has_one |
| 7 | contract | 53 | belongs_to, has_many |
| 8 | project | 54 | belongs_to, has_many |
| 9 | work_order | 55 | belongs_to, has_many |
| 10 | material | 56 | belongs_to, has_many |
| 11 | inventory | 57 | belongs_to, has_many |
| 12 | warehouse | 58 | has_many |
| 13 | employee | 59 | belongs_to, has_many |
| 14 | attendance | 60 | belongs_to, has_many |
| 15 | payroll | 61 | belongs_to, has_many |
| 16 | invoice | 62 | belongs_to, has_many |
| 17 | payment | 63 | belongs_to, has_one, has_many |
| 18 | task | 64 | belongs_to, has_many |
| 19 | document | 65 | polymorphic_parent, has_many |
| 20 | alert | 66 | polymorphic_parent, has_many |

Both `document` and `alert` correctly use `polymorphic_parent` — they attach to many entity types. Optional refs use `?` suffix consistently (e.g. `customer?`, `quote?`).

**Cross-check vs. SERVICE_OWNERSHIP entities:** 20 relationship keys overlap most service entities. Entities mentioned in service ownership but NOT in relationships: `pipeline_stage`, `material_request`, `logistics_order`, `employee_assignment`, `report`, `supplier_quote`, `approval`, `inventory_receipt`, `supplier_invoice`, `receipt`, `vat_record`, `tax_record`, `bank_match`, `cashflow_entry`, `budget_entry`, `costing_entry`, `gl_transaction`, `collection_case`, `expense`, `return`, `warranty_case`, `wage_slip`, `pension_record`, `employee_expense`, `hr_profile`, `support_ticket`, `employer`, plus all 6 AI entities. These are referenced *as* relations from the 20 core entities (e.g. `vat_record` in `invoice.has_many`). The 20 represent the canonical "relationship roots" — acceptable for a wiring spec.

---

## 3. Canonical Routes — EXPECTED 19 / FOUND 19 — PASS

| # | Group | Endpoints |
|---|-------|-----------|
| 1 | customers | 5 (list, new, detail, edit, portal) |
| 2 | suppliers | 5 (list, new, detail, edit, portal) |
| 3 | leads | 6 (incl. create_quote, move_stage) |
| 4 | quotes | 7 (incl. approve, convert, export) |
| 5 | rfq | 8 (incl. send, compare, approve, convert) |
| 6 | po | 8 (incl. approve, send, receive, close) |
| 7 | projects | 8 (incl. create_wo, create_po, create_inv) |
| 8 | work_orders | 7 (incl. assign, qa, signoff) |
| 9 | invoices | 7 (incl. issue, pay, collections) |
| 10 | payments | 4 (incl. reconcile) |
| 11 | employees | 7 (incl. attendance, payroll, expenses) |
| 12 | payroll | 5 (incl. run, approve, export) |
| 13 | inventory | 6 (incl. receive, issue, reserve, count) |
| 14 | materials | 4 |
| 15 | documents | 5 (incl. upload, ocr, sign) |
| 16 | contracts | 4 (incl. sign) |
| 17 | tasks | 4 |
| 18 | finance | 7 (dashboard, bank, vat, tax, collections, cash, budget) |
| 19 | ai | 6 (anomaly, forecast, insights, quality, trends, nlq) |

All routes use `:id` placeholders consistently. Finance + AI groups are non-CRUD (sub-page maps), which is the correct shape for hub pages.

---

## 4. Page Contracts — EXPECTED 9 / FOUND 9 — PASS

All 9 Master 360 pages from CLAUDE.md are present:

| # | Page | Tabs | Widgets | Primary | Secondary |
|---|------|------|---------|---------|-----------|
| 1 | customer360 | 11 | 5 | 3 | 3 |
| 2 | supplier360 | 12 | 5 | 4 | 4 |
| 3 | quote360 | 8 | 4 | 3 | 2 |
| 4 | rfq360 | 8 | 4 | 4 | 3 |
| 5 | project360 | 16 | 7 | 8 | 3 |
| 6 | workOrder360 | 12 | 5 | 7 | 3 |
| 7 | po360 | 11 | 5 | 5 | 2 |
| 8 | finance360 | 12 | 6 | 5 | 1 |
| 9 | employee360 | 11 | 5 | 3 | 2 |

Every page has the required 4 sub-arrays: `tabs`, `widgets`, `primary_actions`, `secondary_actions`. Audit log tab is present in all 9. Primary 360 grand totals: 101 tabs, 46 widgets, 42 primary actions, 23 secondary actions.

**Naming consistency note:** key uses camelCase (`workOrder360`, `customer360`) — recommend the consumer normalize on read.

---

## 5. Action → API Mappings — EXPECTED 55 / FOUND 55 — PASS

Counted by regex `^\s*'[^']+':\s*\{\s*method:` → **55 exact matches.**

### Distribution by group (line-verified)

| Group | Count | Lines |
|-------|-------|-------|
| Lead | 4 | 162-165 |
| Quote | 5 | 168-172 |
| RFQ | 4 | 175-178 |
| PO | 6 | 181-186 |
| Project | 7 | 189-195 |
| Work Order | 6 | 198-203 |
| Invoice | 7 | 206-212 |
| Employee | 4 | 215-218 |
| Supplier | 4 | 221-224 |
| Customer | 4 | 227-230 |
| Universal (`any.*`) | 4 | 233-236 |
| **TOTAL** | **55** |  |

### HTTP method distribution

- POST: ~46 (action endpoints)
- PATCH: ~5 (`lead.qualify`, `lead.mark_lost`, `project.change_status`, `work_order.start`, `work_order.complete`)
- GET: ~4 (`quote.export_pdf`, `rfq.compare_quotes`, `invoice.export_tax`, plus downloads flagged `download: true`)

### Schema consistency

Every entry has `method` + `path`. Entries with body parameters use placeholder syntax `:leadId`, `:quoteId`, `:projectId` for substitution at call time. `download: true` flag used consistently for binary GETs.

### Issues / observations

1. **L221 path inconsistency:** `supplier.send_rfq` posts to `/api/rfq/send` (no `:id` segment) — diverges from `rfq.send_to_suppliers` (L175) which posts to `/api/rfq/:id/send`. Likely intentional (supplier-context vs rfq-context), but worth flagging — verify orchestrator/server routes match.
2. **Path semantics `/api/po` vs `/api/purchase-orders`:** the canonical route uses `/po`, but the action map uses `/api/purchase-orders` (L178, L181-186, L190, L222). This is a known split between UI-facing routes (`CANONICAL_ROUTES`) and API endpoints (`ACTION_API_MAP`). Consumer must not conflate the two.
3. Universal `any.*` actions use `parentType`/`parentId` polymorphism — correctly mirrors the `polymorphic_parent` pattern in `document` and `alert` relationships.

---

## 6. Cross-Service Contracts — EXPECTED 7 / FOUND 7 — PASS

| # | Direction | Calls | Notes |
|---|-----------|-------|-------|
| 1 | ops→procurement | 4 | create_po, create_rfq, create_invoice, get_financials |
| 2 | ops→payroll | 3 | assign_employee, record_attendance, get_employee_costs |
| 3 | procurement→ops | 2 | po_received, invoice_issued (event-style) |
| 4 | procurement→ai | 3 | analyze_spending, forecast_cashflow, detect_anomalies |
| 5 | payroll→procurement | 2 | post_payroll_costs, create_bank_file |
| 6 | ai→ops | 2 | send_alert, send_recommendation |
| 7 | ai→procurement | 2 | risk_signal, price_recommendation |

Total cross-service calls: **18.** All entries have `description`, `calls[]` with `action`, `endpoint`, `payload`. Direction arrows in keys are unicode (`→`), consumer code must handle that.

### Coverage matrix

|        | ops | proc | pay | ai |
|--------|:---:|:----:|:---:|:--:|
| **ops →**   | — | yes | yes | (—) |
| **proc →**  | yes | — | (—) | yes |
| **pay →**   | (—) | yes | — | (—) |
| **ai →**    | yes | yes | (—) | — |

**Gaps:** no `ops→ai`, `payroll→ops`, `payroll→ai`, `ai→payroll`, `procurement→payroll`. The `ops→ai` gap is notable — OPS would plausibly request AI insights directly. AI fan-out only goes to ops + procurement. These may be intentional (AI is push-only to consumers) but should be documented.

---

## 7. Module Exports & Routes Registration — PASS

`module.exports` (L329-333) exposes all 6 maps + `registerWiringRoutes`. The route registration function (L303-327) wires:

- `GET /api/wiring/ownership`
- `GET /api/wiring/relationships`
- `GET /api/wiring/routes`
- `GET /api/wiring/page-contracts`
- `GET /api/wiring/action-map`
- `GET /api/wiring/contracts`
- `GET /api/wiring/spec` (combined blueprint)

Combined endpoint matches CLAUDE.md "Key APIs" entry: `GET /api/wiring/spec` returns full blueprint with 6 keys — services, relationships, routes, pages, actions, contracts.

---

## Verdict

**ALL 6 COUNT TARGETS MET.**

| Target | Expected | Found | Status |
|--------|:--------:|:-----:|:------:|
| Service ownership | 4 | 4 | PASS |
| Entity relationships | 20 | 20 | PASS |
| Route groups | 19 | 19 | PASS |
| Page contracts | 9 | 9 | PASS |
| Action→API mappings | 55 | 55 | PASS |
| Cross-service contracts | 7 | 7 | PASS |

### Recommendations (non-blocking)

1. Reconcile `/api/rfq/send` vs `/api/rfq/:id/send` — pick one, document the other.
2. Document or close cross-service gaps (`ops→ai`, `procurement→payroll`).
3. Normalize page-contract keys (camelCase vs snake_case) — `workOrder360` is the only outlier.
4. Add explicit JSDoc count comments at each section header (e.g. `// 20 entities below`) so future audits self-verify without external counts.
5. Consider adding a tiny self-check function at module load that asserts these counts — guards against drift.
