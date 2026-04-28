# AGENT-242 — Food / Restaurant Domain DDL

**Agent:** 242
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Date:** 2026-04-29
**Predecessor:** AGENT-114 (verdict: domain absent)
**Deliverable:** `supabase/migrations/00082_food_domain.sql` (498 lines)

---

## 1. Summary

Per AGENT-114 finding ("named-but-empty vertical"), the Food / Restaurant
domain had production tables in Supabase but **no DDL in repo**. Agent
242 closes that gap with a single idempotent migration that creates the
seven required tables plus kashrut, allergen, and Wolt / 10bis / Cibus
delivery integration fields.

Per CLAUDE.md "No Dead Pages Rule" and the Master Flow contract, the
schema is now sufficient for downstream pipeline / 360-page wiring
(scheduled for follow-up agents).

---

## 2. Tables Delivered (7 / 7)

| # | Table                          | Purpose                              |
|---|--------------------------------|--------------------------------------|
| 1 | `food.food_restaurants`        | Establishment master                 |
| 2 | `food.food_menu_categories`    | Menu sections, hierarchical          |
| 3 | `food.food_menu_items`         | Sellable items with kashrut+allergens|
| 4 | `food.food_orders`             | Order header, channel-aware          |
| 5 | `food.food_order_items`        | Order lines, KDS-ready               |
| 6 | `food.food_tables`             | Front-of-house table register        |
| 7 | `food.food_reservations_table` | Reservation slots                    |

Bonus reference table:
- `food.food_allergen_vocab` — seeded with 14 EU 1169 / MoH allergens
  in EN + HE.

All 7 tables include the canonical audit columns required by the
codebase pattern (matching `00065_comms_domain_complete.sql`):

`id`, `tenant_id`, `record_code`, `is_active`, `is_deleted`, `metadata`,
`created_by`, `updated_by`, `created_at`, `updated_at`.

---

## 3. Kashrut Coverage

Per AGENT-114 sec. 3, the 9-value kashrut enum is enforced via CHECK on:

- `food_restaurants.kashrut_status`
- `food_menu_items.kashrut_status`

Values: `NOT_KOSHER, KOSHER, KOSHER_LEHADRIN, MEHADRIN, BADATZ,
PASSOVER, MILK, MEAT, PARVE`.

Additional kashrut metadata on `food_restaurants`:

- `kashrut_authority` (Rabbanut Aza, Mehadrin, Eida HaChareidit, etc.)
- `kashrut_certificate_id`
- `kashrut_expires_at`
- `is_shabbat_mode` (boolean toggle)

Additional kashrut metadata on `food_menu_items`:

- `is_chametz`, `is_milk`, `is_meat`, `is_parve`
- `is_vegetarian`, `is_vegan`, `is_gluten_free`

**Cross-table integrity trigger:** `fn_check_kashrut_separation()` on
`food_order_items` raises a CHECK exception when an order at a
KOSHER_LEHADRIN / MEHADRIN / BADATZ restaurant attempts to mix
`is_meat` and `is_milk` items. This implements the meat/milk separation
rule called out in AGENT-114 sec. 3.

Kashrut snapshot on `food_order_items.kashrut_status_snapshot` preserves
the at-order-time status for audit trail.

---

## 4. Allergen Coverage

Per AGENT-114 sec. 4, EU 1169/2011 + Israeli MoH compliance:

- `food_menu_items.allergens jsonb default '[]'::jsonb` with GIN index
  for fast containment queries
- `food_order_items.allergens_snapshot jsonb` — point-in-time copy at
  order placement
- `food_reservations_table.allergen_notes jsonb` — guest declared
  allergies for proactive warnings
- Seeded reference table `food.food_allergen_vocab` with all 14
  required codes:
  `gluten, crustaceans, eggs, fish, peanuts, soybeans, milk,
  tree_nuts, celery, mustard, sesame, sulphites, lupin, molluscs`

Each entry has `name_en` + `name_he` for RTL UI surfaces.

---

## 5. Delivery Integration Coverage (Wolt / 10bis / Cibus)

Per AGENT-114 sec. 5, the channel split is enforced via CHECK on
`food_orders.order_channel`:

`DINE_IN, TAKEAWAY, DELIVERY_OWN, DELIVERY_WOLT, DELIVERY_10BIS,
DELIVERY_CIBUS`.

External-provider fields on `food_orders`:

| Column                | Purpose                                    |
|-----------------------|--------------------------------------------|
| `external_order_id`   | Provider-side order ID for idempotent sync |
| `external_provider`   | `wolt | tenbis | cibus | own`              |
| `delivery_courier_id` | Courier identifier for state webhooks      |
| `delivery_status`     | `pending → assigned → picked_up → en_route → delivered` |
| `delivery_eta`        | Promised delivery time                     |
| `delivery_lat/lng`    | Drop-point for geo dispatch                |
| `delivery_fee`        | Charged to customer                        |
| `commission_amount`   | Platform commission for P&L attribution    |

Provider-side IDs persisted on parent records:

- `food_restaurants.wolt_venue_id`
- `food_restaurants.tenbis_restaurant_id`
- `food_restaurants.cibus_restaurant_id`
- `food_menu_items.wolt_item_id`
- `food_menu_items.tenbis_item_id`
- `food_menu_items.cibus_item_id`

`food_reservations_table.source` accepts `wolt | tenbis | cibus | partner`
to track inbound reservations from the same providers.

Compound index `idx_food_orders_external (external_provider,
external_order_id)` supports webhook lookup in O(log n).

---

## 6. Table & Reservation State Machines

Per AGENT-114 sec. 6:

**`food_tables.status`** (8 states, CHECK-enforced):
`available, seated, ordered, served, bill_pending, paid, cleared,
out_of_service`

**`food_reservations_table.status`** (6 states):
`booked, confirmed, seated, no_show, cancelled, completed`

**`food_orders.status`** (9 states):
`draft, open, fired, served, bill_pending, paid, closed, cancelled,
refunded`

**`food_order_items.status`** (7 states, KDS-ready):
`pending, fired, prepping, ready, served, voided, comped`

Side-effect timestamps captured on every transition target:
`fired_at, ready_at, served_at, paid_at, closed_at, cancelled_at,
seated_at, no_show_after`.

---

## 7. AGENT-09 Multi-Tenant Gaps — All Closed

| AGENT-09 finding                                                | Status |
|-----------------------------------------------------------------|--------|
| `food_restaurants.tenant_id` needs index                        | FIXED — `idx_food_restaurants_tenant` |
| `food_menu_categories` missing `tenant_id`                      | FIXED — column NOT NULL + index |
| `food_menu_items` missing `tenant_id`                           | FIXED — column NOT NULL + index |
| `food_order_items` missing `tenant_id`                          | FIXED — column NOT NULL + index |
| `food_reservations_table` missing `tenant_id`                   | FIXED — column NOT NULL + index |
| `food_tables` missing `tenant_id`                               | FIXED — column NOT NULL + index |
| `food_menu_items.price` lacks non-negative check                | FIXED — `check (price >= 0)` |
| `food_order_items.quantity` lacks non-negative check            | FIXED — `check (quantity > 0)` |
| `food_orders.total` lacks non-negative check                    | FIXED — `check (total >= 0)` |

All money columns (`subtotal, discount_total, service_charge, tip_amount,
vat_total, total, delivery_fee, commission_amount, unit_price, discount,
line_subtotal, line_vat, line_total, cost`) have `>= 0` check
constraints.

---

## 8. RLS Posture

All 7 tables have `enable row level security`. Two policies generated
per table via DO block:

- `<table>_tenant_select` — `for select using (tenant_id = current_tenant)`
- `<table>_tenant_modify` — `for all using (...) with check (...)`

Critical: **no `using (true)` policies**, complying with
`00071_remove_dangerous_anon_read_policies.sql` and
`00068_harden_rls_policies_always_true.sql`.

Tenant resolution via
`current_setting('app.current_tenant_id', true)::bigint`.

---

## 9. Idempotency

- Every `create table` uses `if not exists`.
- Every `create index` uses `if not exists`.
- Every `insert` into the allergen vocab uses `on conflict do nothing`.
- All policies wrapped in `drop policy if exists` before `create
  policy`.
- Trigger function uses `create or replace`.
- Trigger uses `drop trigger if exists` before `create trigger`.
- DO block iterates a fixed array of table names — re-runnable.

Migration can be re-applied to a database where any subset of objects
already exists without error.

---

## 10. Numbering Note

The instruction names this migration `00082_food_domain.sql`. Highest
prior migration in repo is `00071_*.sql`. Numbers `00072`–`00081` are
not present in this worktree — they may exist on other branches or be
intentionally reserved. Migration was created at the requested number
verbatim per the agent instruction. If gap-resolution is needed, a
follow-up rename to `00072_food_domain.sql` is mechanical.

---

## 11. Deferred Follow-Ups (Out of Scope for AGENT-242)

AGENT-114 sec. 8 lists additional deliverables that are **not** part of
the DDL deliverable for this agent:

- `00083_food_menu_wiring.sql` — register Restaurant360, Menu360,
  Order360, Table360, Reservation360 in `app_menu`.
- `pos-engine.js`, `kitchen-display.js`, `table-manager.js`,
  `delivery/wolt.js`, `delivery/tenbis.js`, `delivery/cibus.js`,
  `kashrut-validator.js`, `allergen-checker.js` under
  `onyx-procurement/src/food/`.
- `entity-map.js` — add `food_restaurant`, `food_menu_item`,
  `food_order`, `food_table`, `food_reservation` (5 entities).
- `state-machines.js` — add 4 machines for the enums declared in
  this DDL.
- `workflow-flows.js` — add the
  `Reservation → Seat → Order → Fire → Serve → Bill → Pay → Clear`
  flow plus delivery branch.
- `orchestrator.js` — add 8 actions (`seat_party, place_order,
  fire_to_kitchen, mark_served, request_bill, settle_payment,
  assign_courier, mark_delivered`).
- 360 pages: Restaurant360, Menu360, Order360, Table360,
  Reservation360.

These remain open — the schema this agent creates is the foundation
they will build on.

---

## 12. Verdict

DDL artefact complete. AGENT-114 P0 schema gap is closed. AGENT-09
multi-tenant + non-negative-check findings for the seven food tables
are closed. Kashrut, allergens, and three delivery providers (Wolt,
10bis, Cibus) all have first-class column + enum + index support.

**File:** `supabase/migrations/00082_food_domain.sql` (498 lines).
**Tables:** 7 required + 1 reference vocab = 8.
**Indexes:** 25.
**CHECK constraints:** ~35 (statuses, enums, non-negative money,
seat/party-size positivity, spice 0-5).
**Triggers:** 1 (kashrut meat/milk separation).
**RLS policies:** 14 (2 per table over 7 tables).

---

**End of report — AGENT-242**
