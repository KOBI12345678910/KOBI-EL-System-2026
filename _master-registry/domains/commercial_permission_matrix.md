# Commercial Domain — Permission Matrix

Generated: 2026-04-18
Scope: Endpoints introduced by migration 00043 + `api-server/src/routes/commercial/*`.

All endpoints below require a valid JWT via `authMiddleware`. Row-level
access (fine-grained entity permissions) is layered on top — values here
describe the *minimum* role that should be granted write access at the
permission-engine layer.

## Role abbreviations
- `viewer` — read-only user
- `sales_rep` — sales associate with create/update on own records
- `sales_mgr` — sales manager (approve, close, configure pipelines)
- `finance_mgr` — finance manager (invoicing, close-out)
- `admin` — super-admin / system role

## commercial.lead_sources

| Method | Path | viewer | sales_rep | sales_mgr | finance_mgr | admin |
|---|---|:-:|:-:|:-:|:-:|:-:|
| GET | `/api/commercial/lead-sources` | R | R | R | R | R |
| GET | `/api/commercial/lead-sources/:id` | R | R | R | R | R |
| POST | `/api/commercial/lead-sources` | — | — | W | — | W |
| PATCH | `/api/commercial/lead-sources/:id` | — | — | W | — | W |
| DELETE | `/api/commercial/lead-sources/:id` (soft) | — | — | W | — | W |

## commercial.customer_segments

| Method | Path | viewer | sales_rep | sales_mgr | finance_mgr | admin |
|---|---|:-:|:-:|:-:|:-:|:-:|
| GET | `/api/commercial/customer-segments` | R | R | R | R | R |
| GET | `/api/commercial/customer-segments/:id` | R | R | R | R | R |
| POST | `/api/commercial/customer-segments` | — | — | W | — | W |
| PATCH | `/api/commercial/customer-segments/:id` | — | — | W | — | W |
| POST | `/api/commercial/customer-segments/:id/recount` | — | W | W | — | W |
| DELETE | `/api/commercial/customer-segments/:id` (soft) | — | — | W | — | W |

## commercial.sales_orders

| Method | Path | viewer | sales_rep | sales_mgr | finance_mgr | admin |
|---|---|:-:|:-:|:-:|:-:|:-:|
| GET | `/api/commercial/sales-orders` | R | R | R | R | R |
| GET | `/api/commercial/sales-orders/:id` | R | R | R | R | R |
| POST | `/api/commercial/sales-orders` | — | W | W | — | W |
| PATCH | `/api/commercial/sales-orders/:id` | — | W* | W | — | W |
| POST | `/api/commercial/sales-orders/:id/transition` | — | W* | W | W (invoiced→closed) | W |
| DELETE | `/api/commercial/sales-orders/:id` (soft) | — | — | W | — | W |

\* `sales_rep` may edit / transition only own orders in `draft` / `confirmed` state.

### Status transition RACI

| From → To | sales_rep | sales_mgr | finance_mgr | admin |
|---|:-:|:-:|:-:|:-:|
| draft → confirmed | W (own) | W | — | W |
| confirmed → in_fulfillment | W (own) | W | — | W |
| in_fulfillment → shipped | — | W | — | W |
| shipped → invoiced | — | — | W | W |
| invoiced → closed | — | — | W | W |
| any → cancelled | — | W | — | W |

## commercial.pricing_rules

| Method | Path | viewer | sales_rep | sales_mgr | finance_mgr | admin |
|---|---|:-:|:-:|:-:|:-:|:-:|
| GET | `/api/commercial/pricing-rules` | R | R | R | R | R |
| GET | `/api/commercial/pricing-rules/:id` | R | R | R | R | R |
| POST | `/api/commercial/pricing-rules` | — | — | W | W | W |
| PATCH | `/api/commercial/pricing-rules/:id` | — | — | W | W | W |
| POST | `/api/commercial/pricing-rules/:id/activate` | — | — | W | W | W |
| POST | `/api/commercial/pricing-rules/:id/deactivate` | — | — | W | W | W |
| DELETE | `/api/commercial/pricing-rules/:id` (hard) | — | — | — | — | W |

## Audit surface

All write endpoints emit `audit_log` rows via `lib/audit-log.logAudit`
with `table_name` set to the schema-qualified logical name
(e.g. `commercial_sales_orders`). Action codes used:
- `INSERT` on create
- `UPDATE` on PATCH / activate / deactivate / transition / recount
- `DELETE` on DELETE (both soft and hard)

## Notes

- Field-level redaction is NOT implemented at route level. Callers with
  read access receive the full row. If finer-grained visibility becomes
  required (e.g. hide `cost_estimate` from sales_rep), add a redaction
  step in each list/get handler using `filterFieldsForRead` from the
  permission engine.
- RLS at the DB layer is deferred to a dedicated migration (see
  `commercial_evidence_log.md §11`). Until then, authz is enforced
  entirely at the middleware layer.
