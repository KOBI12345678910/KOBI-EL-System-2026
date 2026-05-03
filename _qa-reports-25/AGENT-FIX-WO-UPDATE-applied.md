# AGENT-FIX-WO-UPDATE — Applied

**Date:** 2026-04-29
**Branch:** `claude/objective-merkle-40ff93`
**Owner:** kobi.ellkayam@technokoluzi.com
**Scope:** Add the missing UPDATE / DELETE endpoints for `WorkOrder` flagged by the CRUD audit.

---

## What was missing

| Verb | Path | Before | After |
|------|--------------------------|----------------|----------------|
| LIST | `/api/work-orders`              | present        | unchanged       |
| GET  | `/api/work-orders/:id`          | present        | unchanged       |
| POST | `/api/work-orders`              | present        | unchanged       |
| PUT  | `/api/work-orders/:id`          | partial-only (allowlist) | hardened (audit + 404 + Hebrew) |
| **PATCH** | `/api/work-orders/:id`     | **missing**    | **added** (alias of PUT, preferred for forms) |
| **DELETE** | `/api/work-orders/:id`    | **missing**    | **added — SOFT delete** |
| PUT  | `/api/work-orders/:id/progress` | present        | unchanged       |
| POST | `/api/work-orders/:id/employees`| present        | unchanged       |

---

## Canonical service

`techno-kol-ops` is the live ERP backend mounted at port **3200** (`src/index.ts` line 143:
`app.use('/api/work-orders', workOrdersRouter)`).
`api-server/src/routes/work-orders.ts` is a separate, lower-priority surface that was NOT
the routing target — left untouched per minimum-blast-radius.

## DB target

Local Postgres table `work_orders` (unqualified) — schema in
`techno-kol-ops/src/db/schema.sql` lines 83–105. Status enum already includes
`'cancelled'`, so the soft delete needs no migration. The Supabase
`execution.work_orders` (project `Techno-Uzi-Command-2026`) is a different
surface used by other consumers and is not touched.

## Files changed

| File | Change |
|------|--------|
| `techno-kol-ops/src/routes/workOrders.ts` | +84 / −7 — refactored PUT into a shared `updateWorkOrderHandler`, added PATCH alias, added DELETE (soft) |
| `techno-kol-ops/test/workOrders.routes.test.js` | +129 (new) — 10 unit tests covering both endpoints |

**Total LOC added: ~213** (budget: ≤ 250).

## Endpoint behavior

### `PATCH /api/work-orders/:id`
- Auth via existing `authenticate` middleware (mounted at the router level).
- Body: any subset of allowlisted columns (`client_id`, `product`, `description`,
  `material_primary`, `category`, `quantity`, `unit`, `price`, `cost_estimate`,
  `advance_paid`, `delivery_date`, `priority`, `notes`, `status`, `progress`,
  `assigned_to`, `start_date`, `end_date`, `location`).
- Empty/invalid body → **400** `{ error: "אין שדות חוקיים לעדכון", code: "NO_VALID_FIELDS" }`.
- Missing WO → **404** `{ error: "הזמנת עבודה לא נמצאה", code: "WORK_ORDER_NOT_FOUND" }`.
- Success → writes `order_events` audit row, broadcasts `ORDER_UPDATED`, emits
  `workorder:updated` on the eventBus, returns the updated row.

### `DELETE /api/work-orders/:id`
- **SOFT delete only**: `UPDATE work_orders SET status='cancelled'` — no `DELETE FROM`.
  The audit trail row stays.
- Optional `reason` body or query parameter is captured in the audit row.
- Missing WO → **404** `הזמנת עבודה לא נמצאה`.
- Already cancelled → **409** `הזמנת עבודה כבר בוטלה`.
- Success → writes `order_events` row (`event_type='cancelled'`), broadcasts
  `ORDER_CANCELLED`, emits `workorder:cancelled` event, returns
  `{ ok: true, soft_deleted: true, work_order: <row> }`.

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean (no output, exit 0) |
| `node --test test/workOrders.routes.test.js` | **10 passed / 0 failed** |
| `node --test test/smoke.test.js` | **4 passed / 0 failed** (no regression) |
| Hard-DELETE search (`DELETE FROM work_orders`) | none — guaranteed by test |
| LOC budget (≤ 250) | 213 added |

## Constraints met

- [x] ≤ 250 LOC added (213).
- [x] Soft delete only — flips `status` to `'cancelled'`, never removes the row.
- [x] Uses existing `authenticate` middleware (router-level).
- [x] Same factory pattern as adjacent routes (`clients.ts`, etc.) — column allowlist for SQL safety.
- [x] Hebrew labels in all user-facing errors.
- [x] Audit rows written to `order_events` for both UPDATE and DELETE.
- [x] Domain events emitted on the eventBus (`workorder:updated`, `workorder:cancelled`).
- [x] No commit made.
