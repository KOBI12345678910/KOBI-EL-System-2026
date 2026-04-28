# AGENT-126 - Automotive Service Domain Audit

**Project:** kobi-el-system-2026
**Scope:** `auto_vehicles`, `auto_service_orders`, `auto_service_items`; IL license-plate format; Tziyud (ציוד) standards; mileage/odometer tracking
**Date:** 2026-04-29
**Auditor:** Agent 126 - Automotive Service
**Worktree:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`

---

## Status

**FAIL - The Automotive Service domain does not exist as a first-class domain. No `auto_*` tables, no service-order pages, no Tziyud (ציוד) certification linkage to vehicles. What exists is internal Fleet (`flt_*`) management and a partial logistics garage UX backed by hard-coded fallback data.**

| Check | Result | Severity |
|-------|--------|----------|
| Table `auto_vehicles` exists | NOT FOUND in any migration | CRITICAL |
| Table `auto_service_orders` exists | NOT FOUND | CRITICAL |
| Table `auto_service_items` exists | NOT FOUND | CRITICAL |
| `auto.*` schema or `public.auto_*` prefix | NOT FOUND | CRITICAL |
| IL license-plate format validation (CHECK / regex) | NOT IMPLEMENTED | HIGH |
| Mileage/odometer tracking (data model) | PARTIAL - in `flt_*` only | MEDIUM |
| Tziyud (ציוד) safety/cert linkage to vehicles | MISSING | HIGH |
| Service-order state machine | MISSING | HIGH |
| Vehicle 360 page | MISSING (only fleet card) | HIGH |
| Garage / external service-provider entity | MISSING (only seed strings) | MEDIUM |

---

## What was searched

Searched the canonical `supabase/migrations/` (00000-00071) plus `_merge-incoming/`, `onyx-procurement/`, `erp-app/`, `techno-kol-ops/`, `payroll-autonomous/`, `onyx-ai/`, and `api-server/` for the three required tables, the `auto.*` schema prefix, license-plate regex CHECK constraints, and Tziyud-to-vehicle linkage. Tools: Grep over `*.sql` and source trees, Read on the closest-match files.

---

## Key findings

### 1. Required tables are absent
No CREATE TABLE for `auto_vehicles`, `auto_service_orders`, or `auto_service_items` in any of the 71 canonical migrations or in the candidate sources under `_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/lib/db/drizzle/`.

`AGENT-09-db-integrity.md:28` lists `auto/` only as a hypothetical "vertical-domain prefix" Claude expected to find on `public.*`. It is not a real schema in the deployed Supabase project.

### 2. Closest existing model: Fleet (`flt_*`) - internal use only
File: `_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/lib/db/drizzle/0000_bright_morbius.sql`
- `flt_vehicles` (line 684) - `plate_number text NOT NULL UNIQUE`, `vin`, `current_odometer_km`, `next_service_due_km`, `next_service_due_at`, `insurance_expires_at`, `license_expires_at`. No CHECK on plate format.
- `flt_maintenance` (line 641) - `vehicle_id`, `type`, `status`, `odometer_km`, `next_service_due_km`, `workshop_name`, `technician_name`, `labor_cost_agorot`, `parts_cost_agorot`, `invoice_number`, `invoice_url`. This is the closest analogue to a "service order" but it is an *internal* maintenance log for the company's own fleet, not a service-shop order against an external customer's vehicle.
- `flt_fuel_transactions`, `flt_routes`, `flt_telemetry` round out fleet ops.

These tables live in a parallel staging tree (`_merge-incoming/`) - they are NOT in `supabase/migrations/`, so they are not deployed.

### 3. UI exists but is mostly fallback fixtures
- `erp-app/src/pages/logistics/fleet-management.tsx` - vehicles tab calls `GET /api/fleet/vehicles`. Form validation requires `plate` and `vehicle_type` but does not validate the plate against the IL format (5-7-8 digit groupings).
- `erp-app/src/pages/logistics/vehicle-maintenance.tsx` - lines 30-60 are hard-coded `FALLBACK_SCHEDULE_DATA`, `FALLBACK_HISTORY_DATA`, `FALLBACK_ALERTS` arrays with example plates like `"משאית 12-345-67"`. There is no `/api/maintenance/*` integration in this file.
- `erp-app/src/pages/logistics/vehicle-registry.tsx` exists alongside `fleet-management.tsx` - duplicated concern, not consolidated.
- Menu wiring (`supabase/migrations/00038_merged_sources_menu_additions.sql:580,784`) registers `/logistics/vehicle-registry` only.

### 4. License-plate format (IL)
Israeli plates use `XX-XXX-XX` (7 digits) for older vehicles and `XXX-XX-XXX` (8 digits) for newer (2017+). NO CHECK constraint, NO regex validation, NO Hebrew/English letter handling anywhere in the codebase. The fallback fixtures in `vehicle-maintenance.tsx` use `12-345-67` (7-digit) format consistently, which is half the spec.

Recommendation: enforce on `auto_vehicles.plate_number`:
```sql
CHECK (plate_number ~ '^[0-9]{2}-[0-9]{3}-[0-9]{2}$' OR plate_number ~ '^[0-9]{3}-[0-9]{2}-[0-9]{3}$')
```
plus a unique partial index excluding soft-deleted rows.

### 5. Tziyud (ציוד) certification - present in inventory, NOT linked to vehicles
Hits for `ציוד` (equipment) appear in:
- `api-server/seed-factory-data.sql:203,206,356,379,383` - chart-of-accounts `2100 מכונות וציוד`, `2300 ריהוט וציוד משרדי`, suppliers `SUP015 ציוד`, `SUP018 ציוד בטיחות`.
- `desktop-tutorial-server/src/db/schema.sql:156` - `ציוד` as a category color tag.
- `AI-Task-Manager/MODULES_DETAIL_7_12.yaml:1155-1156` - `ציוד` enum value.
- `AI-Task-Manager/verification-matrix.md:344` - module `ניהול ציוד ונכסים` at `/production/equipment`.

These are general equipment/asset entries. There is NO linkage from a vehicle row to a Tziyud certificate (e.g. tachograph calibration, taxi meter cert, hazmat plate cert, weight cert), no `auto_equipment_certs` join table, and no expiry alerts wired to a service-order state machine.

For an Israeli automotive service domain, expected fields per vehicle:
- `tachograph_cert_expires_at` (תקנה 364 - מסוף נסיעה)
- `weight_cert_expires_at` (אישור משקל)
- `meter_cert_expires_at` (taxi/hire only)
- `annual_test_expires_at` (טסט שנתי - already partial in `flt_vehicles.license_expires_at`)
- `mot_class` (סוג רישוי)

None of these are modelled.

### 6. Mileage tracking
`flt_vehicles.current_odometer_km`, `flt_maintenance.odometer_km`, `flt_fuel_transactions.odometer_km`, `flt_routes.start_odometer_km`/`end_odometer_km`, `flt_telemetry.odometer_km` exist on the staging side. There is:
- No monotonicity constraint (odometer can decrease).
- No reading-source enum (manual / OBD / GPS / service-shop-input).
- No reconciliation function across the four tables that all hold the value.
- No `kilometers_since_last_service` computed/stored column for SLA triggers.

### 7. Pipeline / state-machines / orchestrator
`onyx-procurement/src/pipeline/` contains the system architecture (per CLAUDE.md). Searched for `automotive`, `garage`, `car_service`, `vehicle_service`, `service_bay` - **zero hits**. There is no `auto_service_order` state machine in `state-machines.js`, no automotive flow in `workflow-flows.js`, no entity in `entity-map.js`. Master Flow stages stop at Lead -> Quote -> ... -> Closure with no automotive specialisation.

---

## Risks if shipped as-is

1. **Compliance:** Israeli garages (מוסכים) must issue a service order (טופס תיוג) per רשות הרישוי standards before any work. Without `auto_service_orders` and a state machine, the system cannot generate compliant docs.
2. **Tziyud expiry blindness:** A vehicle can be invoiced for service while its tachograph cert is expired - no system block.
3. **Plate-format bugs:** Free-text `plate` fields will accept malformed plates, breaking joins with תעבורה lookups and DMV integrations.
4. **Odometer fraud:** No monotonic CHECK means downward edits are silent. This is a known IL consumer-protection issue (חוק רישוי שירותים לרכב).

---

## Recommended next migration (sketch)

Create `supabase/migrations/00072_automotive_service_domain.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS auto;

CREATE TABLE auto.auto_vehicles (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  customer_id bigint NOT NULL REFERENCES crm_customers(id),
  plate_number text NOT NULL,
  vin text,
  make text, model text, year smallint,
  current_odometer_km integer NOT NULL DEFAULT 0,
  fuel_type text,
  annual_test_expires_at date,
  tachograph_cert_expires_at date,
  weight_cert_expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plate_il_format
    CHECK (plate_number ~ '^[0-9]{2}-[0-9]{3}-[0-9]{2}$'
        OR plate_number ~ '^[0-9]{3}-[0-9]{2}-[0-9]{3}$'),
  CONSTRAINT odometer_nonneg CHECK (current_odometer_km >= 0),
  UNIQUE (tenant_id, plate_number)
);

CREATE TABLE auto.auto_service_orders (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_number text NOT NULL,
  vehicle_id bigint NOT NULL REFERENCES auto.auto_vehicles(id),
  customer_id bigint NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  state text NOT NULL DEFAULT 'opened',  -- opened|in_diag|approved|in_work|qc|delivered|invoiced|closed
  intake_odometer_km integer NOT NULL,
  delivery_odometer_km integer,
  technician_id bigint,
  bay_id smallint,
  total_labor_agorot bigint NOT NULL DEFAULT 0,
  total_parts_agorot bigint NOT NULL DEFAULT 0,
  total_agorot bigint NOT NULL DEFAULT 0,
  notes text,
  CONSTRAINT odometer_monotonic
    CHECK (delivery_odometer_km IS NULL OR delivery_odometer_km >= intake_odometer_km),
  UNIQUE (tenant_id, order_number)
);

CREATE TABLE auto.auto_service_items (
  id bigserial PRIMARY KEY,
  service_order_id bigint NOT NULL REFERENCES auto.auto_service_orders(id) ON DELETE CASCADE,
  line_no smallint NOT NULL,
  kind text NOT NULL,  -- labor|part|tziyud_check|external
  description_he text NOT NULL,
  product_id bigint,
  qty numeric(10,3) NOT NULL DEFAULT 1,
  unit_price_agorot bigint NOT NULL DEFAULT 0,
  total_agorot bigint NOT NULL DEFAULT 0,
  tziyud_cert_id bigint,  -- FK to certs table when kind='tziyud_check'
  UNIQUE (service_order_id, line_no)
);

CREATE INDEX ON auto.auto_vehicles (tenant_id, customer_id);
CREATE INDEX ON auto.auto_service_orders (tenant_id, vehicle_id, opened_at DESC);
CREATE INDEX ON auto.auto_service_items (service_order_id);
ALTER TABLE auto.auto_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto.auto_service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto.auto_service_items ENABLE ROW LEVEL SECURITY;
-- policies: tenant_id = current_tenant() ; no anon read.
```

Plus: register entity in `onyx-procurement/src/pipeline/entity-map.js`, add state machine in `state-machines.js`, wire orchestrator action `auto.openServiceOrder` in `orchestrator.js`, add Vehicle360 page, link Tziyud certs as a related-records section.

---

## Files referenced (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_merge-incoming\techno-uzi-erp\Techno-Uzi-Erp\lib\db\drizzle\0000_bright_morbius.sql` (lines 600-712: `flt_*` fleet tables)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\logistics\fleet-management.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\logistics\vehicle-maintenance.tsx` (fallback fixtures only)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\logistics\vehicle-registry.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00038_merged_sources_menu_additions.sql` (line 580, 784: vehicle-registry menu wiring)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\` (no automotive entries)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-09-db-integrity.md` (line 28: `auto/` listed as hypothetical prefix only)
