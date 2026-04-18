# Finance Domain — Permission Matrix

Generated: 2026-04-18
Scope: Endpoints introduced by migrations 00051 + 00052 and
`api-server/src/routes/finance/*` (Tier 1 — Invoice360 / Payment360 / VAT).

All endpoints require a valid JWT via `authMiddleware`. Row-level access
(fine-grained entity permissions) is layered on top via RLS — values
here describe the *minimum* role that should be granted each action at
the permission-engine layer.

## Role abbreviations

- `viewer` — read-only user
- `ap_clerk` — accounts-payable clerk (enter supplier invoices/payments)
- `ar_clerk` — accounts-receivable clerk (issue invoices, record receipts)
- `finance_mgr` — finance manager (void, reconcile, allocate, VAT export)
- `cfo` — CFO / controller (all finance actions incl. voids, refunds)
- `admin` — super-admin / system role

Write cells are marked `W`; read-only `R`; blocked `—`.

## finance.invoices  (`/api/v2/finance/invoices`)

| Method | Path | viewer | ar_clerk | ap_clerk | finance_mgr | cfo | admin |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| GET    | `/`                           | R | R | R | R | R | R |
| GET    | `/:id`                        | R | R | R | R | R | R |
| GET    | `/:id/lines`                  | R | R | R | R | R | R |
| POST   | `/`                           | — | W | W | W | W | W |
| PATCH  | `/:id`                        | — | W | W | W | W | W |
| POST   | `/:id/issue`                  | — | W | — | W | W | W |
| POST   | `/:id/void`                   | — | — | — | W | W | W |
| POST   | `/:id/transition`             | — | W | W | W | W | W |
| DELETE | `/:id` (soft)                 | — | — | — | W | W | W |
| POST   | `/:id/lines`                  | — | W | W | W | W | W |
| PUT    | `/:id/lines` (bulk replace)   | — | W | W | W | W | W |
| PATCH  | `/:id/lines/:lineId`          | — | W | W | W | W | W |
| DELETE | `/:id/lines/:lineId`          | — | W | W | W | W | W |

### State transitions (RACI)

| Transition          | Initiator    | Approver    | Notes |
|---------------------|--------------|-------------|-------|
| draft → issued      | ar_clerk     | —           | triggers VAT rate lock via `getVatRateForDate(issue_date)` |
| draft → cancelled   | ar_clerk     | finance_mgr | soft |
| issued → sent       | ar_clerk     | —           | sets `sent_at` |
| issued → voided     | finance_mgr  | cfo         | requires reason |
| sent → partially_paid | system     | —           | driven by allocation |
| sent → paid         | system       | —           | balance_due ≤ 0.01 |
| paid → voided       | cfo          | cfo         | rare |
| overdue → paid      | system       | —           | on allocation |

## finance.payments  (`/api/v2/finance/payments`)

| Method | Path | viewer | ar_clerk | ap_clerk | finance_mgr | cfo | admin |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| GET    | `/`                        | R | R | R | R | R | R |
| GET    | `/:id`                     | R | R | R | R | R | R |
| GET    | `/:id/allocations`         | R | R | R | R | R | R |
| POST   | `/`                        | — | W | W | W | W | W |
| PATCH  | `/:id`                     | — | W | W | W | W | W |
| POST   | `/:id/reconcile`           | — | — | — | W | W | W |
| POST   | `/:id/allocate`            | — | W | W | W | W | W |
| POST   | `/:id/refund`              | — | — | — | W | W | W |
| POST   | `/:id/transition`          | — | W | W | W | W | W |
| DELETE | `/:id` (soft)              | — | — | — | W | W | W |

### State transitions (RACI)

| Transition           | Initiator    | Approver    | Notes |
|----------------------|--------------|-------------|-------|
| pending → cleared    | ap/ar_clerk  | —           | on bank clearing |
| cleared → reconciled | finance_mgr  | —           | writes `finance.bank_matches` |
| * → refunded         | finance_mgr  | cfo         | requires reason + amount |
| pending → failed     | system       | —           | bounce/NSF |
| failed → pending     | ap/ar_clerk  | —           | retry |

## finance.vat_records  (`/api/v2/finance/vat-records`)

| Method | Path | viewer | ar_clerk | ap_clerk | finance_mgr | cfo | admin |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| GET    | `/`           | R | R | R | R | R | R |
| GET    | `/:id`        | R | R | R | R | R | R |
| POST   | `/`           | — | W | W | W | W | W |
| PATCH  | `/:id`        | — | W | W | W | W | W |
| POST   | `/export`     | — | — | — | W | W | W |
| DELETE | `/:id` (soft) | — | — | — | W | W | W |

### VAT export (PCN836/PCN874)

Only `finance_mgr` or higher may trigger an export. The endpoint writes
a row into `finance.tax_exports` for audit. `getVatRateForDate(period_date)`
is used server-side to sanity-check records against the expected rate
(warn, not block).

## Cross-cutting rules

- Every mutating endpoint writes an entry to `audit_log` via
  `api-server/src/lib/audit-log.ts#logAudit`.
- `DELETE` is **soft** (`is_deleted = true`) everywhere. Hard delete is
  only permitted to `service_role` or tokens carrying
  `request.jwt.claim.is_super_admin = true` (enforced at RLS).
- VAT rate is **never hardcoded**: API + Invoice360 both compute via
  `getVatRateForDate(issue_date)` (exported from
  `api-server/src/routes/israeli-accounting-engine.ts`).
- Totals invariant: `grand_total ≈ subtotal − discount_total + vat_total`
  (±0.01) is enforced by a `before insert/update` trigger on
  `finance.invoices` for every non-draft row.

## Deferred (Tier 2+)

The following finance endpoints/pages exist in the migration but are
out-of-scope for Tier 1 and are tracked in `BUILD_TASK_BOARD.md`:

- Receipts, Expenses, GL transactions
- Bank files, bank matches, reconciliation exceptions
- Collection cases, collection actions, dunning campaigns/steps,
  reminder schedules
- Budget entries, cashflow entries, costing entries
- FX rates admin, consolidation entries, annual tax reports
