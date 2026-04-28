# AGENT-114 — Food / Restaurant Domain Audit

**Agent:** 114
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** `food_restaurants`, `food_menu_categories`, `food_menu_items`,
`food_orders`, `food_order_items`, `food_tables`, `food_reservations_table`;
kashrut info, allergens, takeaway/delivery, table management.

---

## 1. Verdict — DOMAIN ABSENT

**Severity: P0 — vertical does not exist as code.**

Exhaustive searches across every service tree in the worktree
(`onyx-procurement/`, `techno-kol-ops/`, `payroll-autonomous/`, `onyx-ai/`,
`erp-app/`, `nexus_engine/`, `enterprise_palantir_core/`, `paradigm_engine/`,
`packages/`, `src/`, `supabase/migrations/`, `dev/`, `mobile-app/`) returned
**zero implementation files** for the Food / Restaurant domain.

| Artifact required                                  | Found? | Evidence |
|---|---|---|
| `food_restaurants` table CREATE                    | NO | not present in any of 72 SQL migrations |
| `food_menu_categories` table CREATE                | NO | not present |
| `food_menu_items` table CREATE                     | NO | not present |
| `food_orders` table CREATE                         | NO | not present |
| `food_order_items` table CREATE                    | NO | not present |
| `food_tables` table CREATE                         | NO | not present |
| `food_reservations_table` table CREATE             | NO | not present |
| Kashrut certification / supervision metadata       | NO | no `kashrut_*` column, no rabbinate sync |
| Allergen list (gluten / nuts / dairy / soy / etc.) | NO | no `allergens jsonb` column or enum |
| Takeaway / delivery channel split                  | NO | no `order_channel` enum |
| Delivery courier integration (Wolt / 10bis / Cibus)| NO | no API client, webhook, or queue |
| Table management (status, seat count, server)      | NO | no `table_status` state machine |
| Reservation flow (slot / party-size / no-show)     | NO | no `reservation` state machine |
| 360 page, route, action, event                     | NO | not in `pipeline/*.js` |

The only hits across the entire repository that contain the words
`food` / `restaurant` are unrelated to a Food vertical:

| File | Line | Context | Verdict |
|---|---|---|---|
| `onyx-procurement/src/expenses/expense-manager.js` | 99-102 | OCR keyword list `'אוכל', 'מסעדה', 'restaurant', 'food', 'meal'` for receipt categorisation | Expense capture only |
| `onyx-procurement/src/chatbot/engine.js` | 620, 627 | Regex map `food` and `restaurant` -> chat intent category | Chatbot keyword routing only |
| `_merge-incoming/.../slides/templates/artisan-food.md` | — | Slide template asset | Unrelated content |

**None of these constitute a food / restaurant POS or PMS vertical.**

---

## 2. Where the table names DO appear

The seven table names are referenced **only** in
`_qa-reports-25/AGENT-09-db-integrity.md` as items in a list of multi-tenant
schema gaps observed against the production Supabase project:

```
AGENT-09-db-integrity.md:44   food_menu_items.price, food_order_items.quantity,
                              food_orders.total — numeric columns w/o non-negative check
AGENT-09-db-integrity.md:97   food_restaurants.tenant_id — needs index
AGENT-09-db-integrity.md:115  food_menu_categories, food_menu_items,
                              food_order_items, food_reservations_table,
                              food_tables — missing tenant_id column entirely
```

This means: the production Supabase project (audited remotely by AGENT-09)
contains these tables — but the **DDL is not in this repository**. The 72
migrations under `supabase/migrations/00000…00071` cover commercial /
execution / procurement / inventory / finance / workforce / docs /
intelligence / governance / analytics / orchestration / comms domains plus
ad-hoc verticals (agri, auto, ecom, edu, energy, events, food, health,
legal, log, mfg, pm, re, sec, sports). **There is no `food_domain_complete`
migration** equivalent to the 14 `*_domain_complete.sql` files that exist
for every other vertical. (`AGENT-113-hotel.md` reaches the same finding
for hotel.)

---

## 3. Kashrut certification — ABSENT

A working Israeli restaurant module needs:

- `kashrut_status` enum on `food_restaurants` and `food_menu_items`
  (`KOSHER`, `KOSHER_LEHADRIN`, `MEHADRIN`, `BADATZ`, `NOT_KOSHER`,
  `PASSOVER`, `MILK`, `MEAT`, `PARVE`);
- `kashrut_authority` (Rabbanut Aza, Mehadrin, Eida HaChareidit, Badatz
  Beit Yosef, OU, etc.) and `kashrut_certificate_id` / expiry;
- separation rule: a `meat` and `milk` item cannot appear on the same
  order;
- Passover override window (`is_chametz` flag);
- Shabbat-mode toggle (no orders Fri sunset → Sat dark in regions where
  enforced).

**None of this exists.** Searches for `kashrut`, `kosher`, `mehadrin`,
`badatz`, `parve`, `chametz`, `shabbat_mode` returned **zero hits** across
all `*.sql`, `*.js`, `*.ts`, `*.jsx`, `*.tsx` files in the worktree.

---

## 4. Allergens — ABSENT

EU 1169/2011 + Israeli MoH labelling requires the 14 allergens (gluten,
crustaceans, eggs, fish, peanuts, soybeans, milk, tree-nuts, celery,
mustard, sesame, sulphites, lupin, molluscs) to be declared per item.
There is:

- no `allergens jsonb` / `allergens text[]` column on `food_menu_items`;
- no allergen enum or seed table;
- no UI surface for guest-facing warnings;
- no order-time block when an item with declared allergens is requested
  by a guest with a stored allergy profile.

This is a regulatory gap as well as a UX gap.

---

## 5. Takeaway / Delivery — ABSENT

A working channel mix requires:

- `order_channel` enum on `food_orders`: `DINE_IN`, `TAKEAWAY`,
  `DELIVERY_OWN`, `DELIVERY_WOLT`, `DELIVERY_10BIS`, `DELIVERY_CIBUS`;
- `delivery_address`, `delivery_eta`, `delivery_courier_id`,
  `delivery_status` (`assigned → picked_up → en_route → delivered`);
- inbound webhooks from Wolt / 10bis / Cibus;
- outbound menu / availability sync to the same;
- commission accounting per channel.

Searches for `wolt`, `10bis`, `tenbis`, `cibus`, `mishloach`, `delivery_courier`
returned **zero hits** in any food / order context. The only `delivery`
strings in the repo are inside Logistics (`log_*` tables) and shipping
documents — not restaurant delivery.

---

## 6. Table management — ABSENT

A working POS / front-of-house needs:

- `food_tables.status` state machine:
  `available → seated → ordered → served → bill_pending → paid → cleared → available`
- triggers: order-placement transitions `seated → ordered`, payment
  transitions `bill_pending → paid`, busser action transitions
  `paid → cleared`;
- `seat_count`, `server_id`, `section_id`;
- merge / split / move-table operations with audit;
- `food_reservations_table` linked to a slot grid (party-size,
  start-time, expected-duration, no-show window).

`onyx-procurement/src/pipeline/state-machines.js` defines **13 state
machines, 91 transitions** — none for `table`, `food_order`, or
`food_reservation`. `pipeline-engine.js` has no F&B stages.
`orchestrator.js` has no `seat_party`, `place_order`, `fire_to_kitchen`,
`mark_table_clean`, or `assign_courier` actions.
`wiring-spec.js` has no `food_*` entity mapping or 360 page contract.

---

## 7. Risk Assessment

| Risk | Severity | Note |
|---|---|---|
| Food tables exist in prod DB but no DDL in repo | **CRITICAL** | Schema drift — cannot recreate environment from source |
| Missing `tenant_id` on `food_menu_categories`, `food_menu_items`, `food_order_items`, `food_reservations_table`, `food_tables` | **HIGH** | Per AGENT-09 — multi-tenant isolation broken; one tenant can read another's menu and orders |
| No index on `food_restaurants.tenant_id` | HIGH | Per AGENT-09 — table-scan on every RLS evaluation |
| Numeric columns without non-negative check (`food_menu_items.price`, `food_order_items.quantity`, `food_orders.total`) | HIGH | Per AGENT-09 — negative orders / refund-as-sale fraud vector |
| No POS code path → orders cannot be created, fired, paid, or settled | **CRITICAL** | Domain is non-functional |
| No kashrut metadata → cannot serve the Israeli market | **CRITICAL** | Regulatory + brand exposure |
| No allergen labelling → MoH / EU 1169 non-compliance | HIGH | Direct consumer-safety + regulatory risk |
| No delivery integrations → manual entry of every Wolt / 10bis order | HIGH | Operational impossibility at scale |
| No table state machine → covers, turnover, server tipping uncomputable | HIGH | F&B economics broken |

---

## 8. Required Remediation (P0 — full vertical build)

Mirror the structure of every other completed vertical (`00043` through
`00066`). Recommended migrations and code:

### Migrations

- `00072_food_domain_complete.sql` — create `food_restaurants`,
  `food_menu_categories`, `food_menu_items`, `food_orders`,
  `food_order_items`, `food_tables`, `food_reservations_table`, plus
  `food_kashrut_certificates`, `food_allergen_declarations`,
  `food_delivery_assignments`, `food_kitchen_tickets`. Include
  `tenant_id uuid NOT NULL` + FK + index on every table; add
  `CHECK (price >= 0)`, `CHECK (quantity > 0)`, `CHECK (total >= 0)`.
- `00073_food_menu_wiring.sql` — register Restaurant360, Menu360,
  Order360, Table360, Reservation360 pages in `app_menu`.
- `00074_food_rls_policies.sql` — tenant-scoped RLS, never `USING (true)`.
- `00075_food_kashrut_allergen.sql` — `kashrut_status` and
  `kashrut_authority` enums on `food_restaurants` and `food_menu_items`;
  `allergens jsonb` on `food_menu_items` with check constraint over
  the 14-allergen vocabulary.

### Code (under `onyx-procurement/src/food/`)

- `pos-engine.js` — order lifecycle (open / fire / serve / settle)
- `kitchen-display.js` — KDS event stream, station routing
- `table-manager.js` — table state machine, reservation matcher,
  party-size optimiser, no-show timer
- `delivery/wolt.js`, `delivery/tenbis.js`, `delivery/cibus.js` —
  menu push, order pull, idempotent upsert, status webhook
- `kashrut-validator.js` — meat/milk separation, Passover window,
  certificate expiry guard
- `allergen-checker.js` — order-time block when item allergens intersect
  guest profile

### Pipeline wiring

- Add 5 entities to `entity-map.js`: `food_restaurant`, `food_menu_item`,
  `food_order`, `food_table`, `food_reservation`.
- Add 4 state machines to `state-machines.js`: `food_order`,
  `food_table`, `food_reservation`, `food_delivery_assignment`.
- Add 1 workflow to `workflow-flows.js`:
  `Reservation → Seat → Order → Fire → Serve → Bill → Pay → Clear` plus
  delivery branch `Order → Assign Courier → Pick-up → En-route → Delivered`.
- Add 8 actions to `orchestrator.js`: `seat_party`, `place_order`,
  `fire_to_kitchen`, `mark_served`, `request_bill`, `settle_payment`,
  `assign_courier`, `mark_delivered`.

### 360 pages

`Restaurant360`, `Menu360`, `Order360`, `Table360`, `Reservation360` —
each with header+status, primary actions, related records, audit log,
next recommended action, kashrut + allergen badges.

---

## 9. Conclusion

The Food / Restaurant domain is a **named-but-empty vertical**, identical
in shape to the Hotel finding (AGENT-113). Production tables exist
remotely (per AGENT-09) but the entire schema, RLS, business logic, POS
engine, kashrut / allergen rules, delivery integrations, table flow, and
UI are missing from this repository. Per the CLAUDE.md "No Dead Pages
Rule" and the Master Flow contract, this fails the audit on every
dimension.

**Recommendation:** Build the vertical end-to-end before any deployment
that references restaurant revenue. Until then, the AGENT-09 multi-tenant
gaps and missing non-negative checks for the seven food tables remain
blockers.

---

**End of report — AGENT-114**
