# AGENT-116 — Logistics Domain Audit

**Agent:** 116
**Domain:** Logistics (carriers, vehicles, routes, shipments, tracking)
**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope brief:** Audit `log_carriers`, `log_vehicles`, `log_routes`, `log_shipments`, `log_tracking_events` plus route optimization, ePOD, fleet mgmt, IL Ministry of Transport (משרד התחבורה) compliance.
**Status:** RED — partial. Algorithm layer GREEN; data layer + compliance layer MISSING.

---

## 1. Executive verdict

| Layer | Status | Evidence |
|---|---|---|
| Route optimization (algorithm) | GREEN | `onyx-procurement/src/logistics/route-optimizer.js` (861 lines) + `test/payroll/route-optimizer.test.js` (585 lines, 40+ assertions) |
| Pipeline / state-machine wiring | YELLOW | `logistics_order` is a node in 5-flow Sales→Cash; transition `in_execution→in_delivery` triggers `create_logistics_order`, but there is no `logistics_order` state machine in `state-machines.js` |
| Persistent data model | RED | Only `execution.logistics_orders` (15 cols) and `execution.delivery_events` exist. The 5 expected tables — `log_carriers`, `log_vehicles`, `log_routes`, `log_shipments`, `log_tracking_events` — **do not exist anywhere** in `supabase/migrations/`, `onyx-procurement/db/migrations/`, or `onyx-procurement/supabase/migrations/` |
| ePOD (electronic Proof of Delivery) | YELLOW | `execution.signatures` table + `delivery_events.received_by_name` exist; no photo capture, no GPS-stamp, no dedicated `epod_*` artifacts |
| Fleet management | RED | No `log_vehicles` table, no driver licensing, no maintenance schedules, no tachograph/odometer entities |
| IL MoT (משרד התחבורה) compliance | RED | Zero references to tachograph, drivers' hours regulations, vehicle annual test (טסט), driver licensing categories (B/C/C1/D), hazmat (חומ"ס) permits, weight-by-axle, ITS license |

---

## 2. Tables: expected vs actual

### 2.1 Expected (from task brief)
The brief names a `log_*` namespace that is the standard for transport/fleet domains:
- `log_carriers` — 3PL carrier master + ratings + insurance
- `log_vehicles` — fleet master (plate, VIN, GVW, category, license expiry)
- `log_routes` — saved/optimized routes, time windows, sequences
- `log_shipments` — shipments header (incl. waybill, hazmat flags)
- `log_tracking_events` — GPS pings + status events (timestamped, geo-stamped)

### 2.2 Actual (in repo)
Only **two** logistics-relevant tables persist (file `supabase/migrations/00000_master_schema.sql`, lines 933–960):

| Table | Cols | Notable absence |
|---|---|---|
| `execution.logistics_orders` | id, public_id, logistics_number, project_id, work_order_id, warehouse_id, destination_name, destination_address, scheduled_at, delivered_at, state, notes, created_at, updated_at | no carrier_id, no vehicle_id, no driver_id, no route_id, no waybill_no, no weight_kg, no volume_m3, no hazmat_class, no temperature_zone, no incoterms |
| `execution.delivery_events` | id, project_id, work_order_id, logistics_order_id, delivered_at, delivered_by_user_id, received_by_name, notes, created_at | no signature_blob_id, no photo_url, no geo_lat/lng, no odometer_km |

Migration `00045_execution_domain_complete.sql` (line 88) only adds soft-delete and audit columns — does not introduce the missing 5 tables.

**Verdict:** the brief's 5 tables are absent. Anyone querying `log_carriers`, `log_vehicles`, `log_routes`, `log_shipments`, `log_tracking_events` will get a relation-does-not-exist error.

---

## 3. Route optimization — GREEN

File: `onyx-procurement/src/logistics/route-optimizer.js`

### 3.1 Capabilities (verified)
- Haversine great-circle distance (WGS-84, IUGG radius 6371.0088 km) — line 108
- Symmetric N×N distance matrix — line 141
- Nearest-neighbour greedy construction — line 170
- 2-opt edge-swap improvement with capped passes — line 229
- Time-window simulation incl. waiting + violations — line 376
- Capacity validation (VRP-lite) — line 436
- Multi-vehicle sweep assignment by polar angle from depot — line 472
- Israel-specific heuristics: rush-hour penalty 1.45×, Jerusalem bbox penalty 1.25×, Highway 6 corridor flag, Shabbat (day 6) warning — lines 286–311
- Driver deep-links: Google Maps multi-stop URL + Waze single-stop URL — lines 546, 561
- Hebrew RTL turn-by-turn driver text — line 585
- Pure JS, zero dependencies, browser-safe export

### 3.2 Tests
`onyx-procurement/test/payroll/route-optimizer.test.js` — 13 describe blocks, 40+ assertions, runs under `node --test` (Node ≥ 18). File path note: lives under `test/payroll/` — should be relocated to `test/logistics/` for hygiene (cosmetic only).

### 3.3 Gaps (not blocking)
- Speed model is constant 45 km/h; no per-edge or time-of-day matrix
- No real road network (great-circle only — under-estimates urban distance ~30%)
- No live traffic feed integration (no `tracking_events` to learn from)
- No CO₂ / fuel-cost output

---

## 4. Pipeline & state-machine wiring

| Artifact | Location | Status |
|---|---|---|
| `logistics_order` listed as Master Flow entity | `src/pipeline/wiring-spec.js:22` | OK |
| `project → has_many logistics_order` relation | `wiring-spec.js:54` | OK |
| `warehouse → has_many logistics_order` relation | `wiring-spec.js:58` | OK |
| Project360 tab `logistics` + action `open_logistics` | `wiring-spec.js:125,128`; `entity-map.js:187,191` | OK |
| Trigger `in_execution → in_delivery` runs `create_logistics_order` | `state-machines.js:133` | OK |
| Standalone `logistics_order` state machine | **missing** in `state-machines.js` | RED |
| Standalone `shipment` state machine (booked→picked-up→in-transit→delivered→exception) | **missing** | RED |
| Orchestrator action `create_logistics_order` implementation | not located in `src/pipeline/orchestrator.js` (referenced only as a trigger string) | YELLOW |

---

## 5. ePOD (electronic Proof of Delivery)

`execution.delivery_events` and `execution.signatures` (lines 950–981 of master schema) provide the *skeleton* of ePOD:
- `delivered_at` timestamp
- `delivered_by_user_id` (driver identity)
- `received_by_name` (free-text customer name)
- `signatures.signature_payload jsonb` keyed by `(entity_type, entity_id)`

Missing for a production-grade ePOD:
- Photo evidence (delivered_photo_url, damage_photo_url)
- Geo-stamp (lat/lng/accuracy at sign moment)
- Device fingerprint (driver app version, IMEI/UUID)
- Customer ID-card / company stamp scan
- Refusal/partial-delivery reason codes
- PDF rendering of the signed waybill
- Immutable hash-chain or blockchain anchor (often required for Israeli customs/MoT audits)

---

## 6. Fleet management

The brief asks for fleet management. Repo evidence:
- **No** `vehicles` / `log_vehicles` table
- **No** driver licensing schema (license_number, categories, expiry, points)
- **No** maintenance / service intervals
- **No** insurance policy records
- **No** fuel card / odometer log
- **No** tachograph data ingestion
- **No** GPS device pairing

The route-optimizer assumes vehicles exist (`{id, capacity}`), but they live only in memory.

---

## 7. IL Ministry of Transport (משרד התחבורה) compliance

Search across `onyx-procurement/` for `משרד התחבורה`, `MoT`, `tachograph`, `טכוגרף`, `drivers.?hours` returned **zero functional matches** (only license-file names). Specifically missing:

| Requirement | Reg ref | In repo? |
|---|---|---|
| Driver hours-of-service log (12h max / 9h driving) | תקנות התעבורה תקנה 168 | NO |
| Tachograph data retention (28 days digital, 1 yr archive) | תקנה 364א | NO |
| Annual vehicle test (טסט שנתי) tracking | תקנה 273 | NO |
| Vehicle license categories (B/C1/C/D/E) on driver record | תקנה 176 | NO |
| Hazmat (חומרים מסוכנים) ADR permit on shipment | תקנות שירותי הובלה | NO |
| GVW/axle-load enforcement vs vehicle license | תקנה 313 | NO |
| ITS / Operator license (רשיון מוביל) attached to carrier | חוק שירותי הובלה 1997 | NO |
| Waybill (תעודת משלוח) layout per Tax Authority + MoT | חוזר רשות המסים מס׳ 23/2017 | partial — only a `notes` field, no structured waybill |
| Driver fatigue / break enforcement | תקנה 168(ב) | NO |
| Israeli plate format validation (NN-NNN-NN / 7-digit) | regex | NO (no `vehicles` table at all) |

---

## 8. RED-flag list (priority order)

1. **Create the 5 missing tables** under a `logistics` schema: `logistics.carriers`, `logistics.vehicles`, `logistics.drivers`, `logistics.routes`, `logistics.shipments`, `logistics.tracking_events`. Add carrier_id / vehicle_id / driver_id FKs onto `execution.logistics_orders`.
2. **Add `logistics_order` state machine** to `src/pipeline/state-machines.js` (states: planned → assigned → picked → in_transit → delivered → closed; exception branch).
3. **Implement orchestrator action `create_logistics_order`** — currently referenced as a trigger but the executable action is not in `orchestrator.js`'s 18 actions.
4. **Persist tracking events**: `tracking_events(shipment_id, ts, lat, lng, speed_kmh, source, status)` with Postgres `gist` index on `(shipment_id, ts desc)`.
5. **ePOD enrichment**: add `epod_photos`, `epod_geo`, `epod_refusal_codes` either as columns on `delivery_events` or a sidecar `delivery_evidence` table.
6. **Israeli plate regex + license-category check** on driver/vehicle insert.
7. **Driver-hours job** that aggregates from tracking events and emits SLA alerts at 9h driving / 12h on-duty.
8. **Hazmat flag on shipment** + permit-expiry alert on carrier.
9. **Annual test (טסט) expiry alert** with 30/14/7/1-day cadence (reuse `documents/expiry-alerts.js` plumbing already in `onyx-procurement/src/documents/`).
10. **Wire route-optimizer to persisted routes**: today its output is a JSON returned from a function call only — store under `logistics.routes`.

---

## 9. Files of record

- `onyx-procurement/src/logistics/route-optimizer.js` — algorithm core (only file in `src/logistics/`)
- `onyx-procurement/test/payroll/route-optimizer.test.js` — 40+ unit assertions
- `supabase/migrations/00000_master_schema.sql:933-960` — `execution.logistics_orders`, `execution.delivery_events`
- `supabase/migrations/00045_execution_domain_complete.sql:88-105` — soft-delete columns added
- `onyx-procurement/src/pipeline/entity-map.js:170,187,191` — Project360 logistics tab + action
- `onyx-procurement/src/pipeline/state-machines.js:133` — `create_logistics_order` trigger (no SM body)
- `onyx-procurement/src/pipeline/wiring-spec.js:22,54,58,125,128` — entity declarations
- `onyx-procurement/_qa-reports/AG-X31-warehouse.md` — adjacent WMS report (warehouse, not logistics)

---

## 10. Recommendation

Promote logistics from a stub to a first-class domain:

1. New migration `00068_logistics_schema.sql` with the 5 named tables + RLS policies aligned to Project360 visibility.
2. New module `onyx-procurement/src/logistics/{shipments,fleet,epod,compliance-il}.js` mirroring the depth of `src/payroll/` and `src/warehouse/`.
3. New state machine `logistics_order` + `shipment` in `state-machines.js`.
4. New 360 page `Logistics360` (or `Shipment360`) per the No-Dead-Pages rule in `CLAUDE.md`.
5. IL MoT compliance pack: tachograph ingestion, drivers'-hours job, טסט/insurance/license-expiry alerts, ADR hazmat permit, structured waybill matching Tax-Authority circular 23/2017.

Until those land, the logistics chapter of the ERP is operationally blind: routes are optimized but never stored, shipments are tracked only as a free-text `notes` column, and there is no connection to MoT-mandated controls.

---

*End of AGENT-116 report.*
