# AGENT-236 — Logistics Domain DDL

**Agent:** 236
**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Predecessor:** AGENT-116 (RED — logistics tables missing entirely)
**Deliverable:** `supabase/migrations/00076_logistics_schema.sql`
**Status:** GREEN — schema authored, idempotent, RLS-baselined.

---

## 1. Mandate

AGENT-116 left logistics RED on three layers:

- Data layer (5 expected tables absent: `log_carriers`, `log_vehicles`, `log_routes`, `log_shipments`, `log_tracking_events`)
- IL Ministry of Transport (משרד התחבורה) compliance (zero functional matches in repo)
- ePOD enrichment (skeleton only on `execution.delivery_events`)

This agent (AGENT-236) closes the data-layer gap and lays the IL MoT compliance fields directly on the relevant tables. State-machine pseudo-table seeding is included; the runtime SM in `src/pipeline/state-machines.js` and orchestrator action `create_logistics_order` remain follow-up work for a JS-side agent.

---

## 2. File written

| Path | Lines | Idempotent |
|---|---|---|
| `supabase/migrations/00076_logistics_schema.sql` | ~330 | yes — `IF NOT EXISTS`, DO-blocks, `ON CONFLICT DO NOTHING` |

Patterns follow the live repo precedent set by `00074_hotel_domain_complete.sql`:

- `public.<domain>_*` namespace
- `bigserial primary key`, `public_id uuid default gen_random_uuid()`
- mandatory `tenant_id bigint not null` + tenant index
- audit columns `is_active / is_deleted / record_code / metadata / created_at / updated_at / created_by / updated_by`
- 3-policy RLS template (`*_read_auth`, `*_insert_auth`, `*_service_all`)

---

## 3. Tables created (5)

### 3.1 `public.log_carriers`
3PL master + Israeli operator licence + insurance.

Notable cols: `il_its_licence_no` (רשיון מוביל per חוק שירותי הובלה 1997), `il_its_licence_expiry`, `il_adr_permit_no` / `_expiry` (חומרים מסוכנים ADR), `insurance_policy_no` / `_expiry`, `rating numeric(3,2) ∈ [0,5]`, `status ∈ {active,inactive,suspended,blacklisted}`.

Indexes: tenant, (tenant,status), partial expiry indexes for ITS and ADR (only where `is_active`).

### 3.2 `public.log_vehicles`
Fleet master. FK to `log_carriers`. Plate uniqueness scoped by tenant.

IL MoT compliance:
- `il_licence_category text` — A/A1/B/C/C1/C+E/D/D1/D+E/1 (תקנה 176)
- `il_annual_test_expiry date` — טסט שנתי (תקנה 273)
- `il_tachograph_required boolean`, `il_tachograph_serial`, `il_tachograph_last_calib` (תקנה 364א)
- `il_gvw_kg`, `il_max_axle_load_kg` (תקנה 313)
- `il_hazmat_authorised boolean`, `il_refrigeration_class` (ATP)
- IL plate-format CHECK: `^[0-9]{2}-?[0-9]{3}-?[0-9]{2,3}$` when `country_code='IL'` (NOT VALID, idempotent)

Vehicle status: `available | in_transit | maintenance | out_of_service | retired`.

### 3.3 `public.log_routes`
Persists the route-optimizer JSON output (currently in-memory only per AGENT-116). Includes `stops_json jsonb`, `total_distance_km`, `total_duration_min`, `optimization_algo ∈ {nn_2opt,sweep,manual,external}`, `optimization_score`, `shabbat_warning boolean` (mirrors the optimizer's day-6 flag). Status: `planned | dispatched | in_progress | completed | cancelled`.

### 3.4 `public.log_shipments`
Shipment header — the core operational entity.

- Hard FKs to route/carrier/vehicle. Soft (added by DO-block) FK to `execution.logistics_orders` so the migration runs whether or not that table exists.
- IL Tax-Authority circular 23/2017 waybill: `il_waybill_no`, `il_waybill_issued_at`, `il_waybill_pdf_url`.
- Hazmat (חומרים מסוכנים): `il_hazmat_class ∈ {1..9}`, `il_hazmat_un_no`, `il_hazmat_packing_group ∈ {I,II,III}`.
- Cold-chain: `temperature_zone ∈ {ambient,chilled,frozen,controlled}` + `temperature_min_c` / `_max_c`.
- Incoterms enum: EXW/FCA/CPT/CIP/DAP/DPU/DDP/FAS/FOB/CFR/CIF.
- ePOD enrichment columns: `epod_signature_blob_id`, `epod_photo_urls text[]`, `epod_geo_lat/_lng`, `epod_received_by_name`, `epod_received_by_id` (ת.ז.), `refusal_code`.

Shipment state machine encoded as CHECK constraint on `state`:
`planned → assigned → picked_up → in_transit → delivered → closed` plus `exception` and `cancelled` branches.

### 3.5 `public.log_tracking_events`
GPS pings + status transitions. `bigserial`, FK shipment with `on delete cascade`, no audit columns (event log).

`event_type ∈ {ping, status_change, geofence_enter, geofence_exit, stop_arrive, stop_depart, exception, tachograph}`. IL tachograph block: `il_driver_card_id`, `il_driving_min`, `il_rest_min` (תקנה 168 — 9h driving / 12h on-duty enforcement source data).

Indexes built for the AGENT-116 priority-4 access pattern: `(shipment_id, event_ts desc)`, plus `(vehicle_id, event_ts desc)`, `(tenant_id, event_ts desc)`, `(event_type, event_ts desc)`. (GiST kept off — would need `btree_gist` ext; the descending btree on `(shipment_id, event_ts)` covers the dominant query.)

---

## 4. Linkage to existing schema

Soft-extends `execution.logistics_orders` (the 15-col stub flagged by AGENT-116) only if it exists:

```
add column if not exists carrier_id, vehicle_id, driver_user_id,
                         route_id, shipment_id,
                         waybill_no, weight_kg, volume_m3,
                         hazmat_class, temperature_zone
```

Plus 4 named FKs (each in its own `begin/exception when duplicate_object` block) and 4 indexes. Existing rows are unaffected — every column is nullable.

---

## 5. State machine

### 5.1 Encoded in CHECK
`log_shipments.state` enforces the 8-state lifecycle at insert/update time.

### 5.2 Catalogue inserted into `governance.state_machine_transitions`
Conditional on the table existing. 10 transitions:

| from | to | action |
|---|---|---|
| planned | assigned | assign_carrier_vehicle |
| assigned | picked_up | mark_picked_up |
| picked_up | in_transit | start_transit |
| in_transit | delivered | mark_delivered |
| in_transit | exception | log_exception |
| exception | in_transit | resume_transit |
| exception | cancelled | cancel_shipment |
| delivered | closed | close_shipment |
| planned | cancelled | cancel_shipment |
| assigned | cancelled | cancel_shipment |

Out-of-scope for SQL DDL: registering this in JS `src/pipeline/state-machines.js`. Flagged for a JS follow-up agent.

---

## 6. IL MoT (משרד התחבורה) compliance coverage

Mapping AGENT-116 §7 table to where each requirement now lives:

| Requirement | Reg ref | DDL location |
|---|---|---|
| Driver hours-of-service log (12h max / 9h driving) | תקנה 168 | `log_tracking_events.il_driving_min`, `il_rest_min`, `il_driver_card_id` |
| Tachograph data (28d digital, 1yr archive) | תקנה 364א | `log_vehicles.il_tachograph_*` + `log_tracking_events.event_type='tachograph'` |
| Annual vehicle test (טסט שנתי) | תקנה 273 | `log_vehicles.il_annual_test_expiry` + partial index for alerts |
| Vehicle licence categories (B/C1/C/D/E) | תקנה 176 | `log_vehicles.il_licence_category` (CHECK) |
| Hazmat ADR permit on shipment | תקנות שירותי הובלה | `log_shipments.il_hazmat_class/_un_no/_packing_group` + `log_carriers.il_adr_permit_*` |
| GVW/axle-load enforcement | תקנה 313 | `log_vehicles.il_gvw_kg`, `il_max_axle_load_kg` |
| ITS / Operator licence | חוק שירותי הובלה 1997 | `log_carriers.il_its_licence_no/_expiry` |
| Structured waybill | חוזר רשות המסים 23/2017 | `log_shipments.il_waybill_no/_issued_at/_pdf_url` |
| IL plate format validation | regex | `chk_log_vehicles_il_plate_format` (NOT VALID) |
| Driver fatigue / break enforcement | תקנה 168(ב) | source data on tracking events; aggregation job is downstream |

Coverage is at the column/constraint level only. The aggregation jobs (driver-hours rollup, expiry-alert cron) are downstream business logic, not DDL.

---

## 7. RLS posture

3 baseline policies per new table, applied via DO-block loop:

- `*_read_auth` — `for select to authenticated using (true)`
- `*_insert_auth` — `for insert to authenticated with check (true)`
- `*_service_all` — `for all to service_role`

Tenancy-scoped policies are deferred to the project-wide RLS hardening migration (00073 pattern) — every table carries `tenant_id` and a tenant-prefix index, so the next pass can flip the predicate to `tenant_id = current_setting('app.tenant_id')::bigint` without DDL changes.

---

## 8. Idempotency proof points

| Construct | Guard |
|---|---|
| `create table` | `if not exists` (5×) |
| `add column` | `if not exists` (10× on `execution.logistics_orders`) |
| `add constraint fk_*` | wrapped `begin … exception when duplicate_object` (4×) |
| `add constraint chk_*_il_plate_format` | wrapped + `not valid` |
| `create index` | `if not exists` (24×) |
| `insert into governance.state_machine_transitions` | `on conflict do nothing` |
| `create policy` | wrapped `begin … exception when duplicate_object` per name |
| FK to `execution.logistics_orders` | gated on `information_schema.tables` lookup |

Re-run safety: a second `psql -f` invocation will be a near-noop — only the `insert ... on conflict` path may emit "0 rows" log lines.

---

## 9. Gaps NOT closed by this migration

1. JS-side `logistics_order` / `shipment` state machines in `onyx-procurement/src/pipeline/state-machines.js` (AGENT-116 §4 & §8 item 2).
2. Orchestrator action body for `create_logistics_order` in `src/pipeline/orchestrator.js` (AGENT-116 §8 item 3).
3. Drivers-hours aggregation job + 9h/12h SLA alerts (AGENT-116 §8 item 7).
4. Hazmat permit-expiry and טסט-expiry alert plumbing (AGENT-116 §8 items 8 & 9) — schema is ready; cron/notification logic is downstream.
5. Wiring the route-optimizer's JSON output into `log_routes` row inserts (AGENT-116 §8 item 10).
6. Logistics360 page (No-Dead-Pages rule per CLAUDE.md).
7. `Shipment360` 360 page contract in `wiring-spec.js`.

These belong to JS/UI agents, not to SQL DDL.

---

## 10. Verification commands

After applying the migration, the following queries should succeed:

```sql
-- table presence
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('log_carriers','log_vehicles','log_routes','log_shipments','log_tracking_events');
-- expected: 5 rows

-- new FKs on the stub
select conname
from pg_constraint
where conrelid = 'execution.logistics_orders'::regclass
  and contype = 'f'
  and conname in ('fk_lo_carrier','fk_lo_vehicle','fk_lo_route','fk_lo_shipment');
-- expected: 4 rows when execution.logistics_orders exists

-- IL plate constraint
select conname, convalidated
from pg_constraint
where conname = 'chk_log_vehicles_il_plate_format';
-- expected: convalidated=false (NOT VALID, additive on existing rows)

-- RLS enabled
select relname, relrowsecurity
from pg_class
where relname in ('log_carriers','log_vehicles','log_routes','log_shipments','log_tracking_events');
-- expected: relrowsecurity=true on all 5
```

---

## 11. Numbering note

Existing migration list runs through `00074_hotel_domain_complete.sql`. AGENT-236 chose `00076` (skipping 00075) so an in-flight 00075 (e.g., for adjacent domains) is not blocked. If the registry requires sequential numbering, rename to `00075_logistics_schema.sql` — file body is unaffected.

---

## 12. Files of record

- `supabase/migrations/00076_logistics_schema.sql` (this delivery)
- `supabase/migrations/00074_hotel_domain_complete.sql` (DDL pattern source)
- `supabase/migrations/00045_execution_domain_complete.sql` (audit-column convention)
- `supabase/migrations/00000_master_schema.sql:933-960` (pre-existing `execution.logistics_orders` skeleton)
- `_qa-reports-25/AGENT-116-logistics.md` (predecessor audit)
- `onyx-procurement/src/logistics/route-optimizer.js` (consumer of `log_routes`)

---

*End of AGENT-236 report.*
