# AGENT-238 - Automotive Domain DDL

**Project:** kobi-el-system-2026
**Worktree:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Date:** 2026-04-29
**Author:** Agent 238
**Trigger:** AGENT-126 finding - automotive service domain missing
**Output:** `supabase/migrations/00078_automotive_domain.sql`

---

## Status

**DONE - migration written, idempotent, RLS-tenant-scoped, ready for `supabase db push`.**

| Required deliverable | Status |
|----------------------|--------|
| Table `auto_vehicles` | CREATED in `auto` schema |
| Table `auto_service_orders` | CREATED |
| Table `auto_service_items` | CREATED |
| IL plate CHECK regex (XX-XXX-XX + XXX-XX-XXX) | ENFORCED at column level |
| Monotonic odometer | ENFORCED 2 ways: trigger + table CHECK |
| Tziyud cert FK | ENFORCED via dedicated `auto_tziyud_certs` table |
| Idempotent (re-runnable) | YES - all `IF NOT EXISTS` / DO-block guards |
| RLS tenant-scoped (no `USING (true)`) | YES - per AGENT-71 ban on anon-read |

The brief asked for 3 tables. The migration ships 4: a fourth table `auto_tziyud_certs` is required so the tziyud_cert FK has a real target. Without it, `auto_service_items.tziyud_cert_id` would be a dangling bigint that the audit explicitly flagged as a HIGH-severity gap (AGENT-126 sec.5).

---

## Migration layout

File: `supabase/migrations/00078_automotive_domain.sql` (397 lines)

| Part | Section | Tables / objects |
|------|---------|------------------|
| A | Tziyud certs | `auto.auto_tziyud_certs` + 3 indexes |
| B | Vehicles | `auto.auto_vehicles` + 6 indexes |
| C | Service orders | `auto.auto_service_orders` + 6 indexes |
| D | Service items | `auto.auto_service_items` + 5 indexes |
| E | Trigger | `fn_vehicle_odometer_monotonic` - blocks rollback |
| F | Trigger | `fn_so_propagate_odometer` - SO -> vehicle push-up |
| G | RLS | 12 policies (3 per table x 4 tables) |

Slot `00078` is open - latest existing migrations are `00074_hotel_domain_complete.sql` and `00082_food_domain.sql`. Convention matches `00082_food_domain.sql` exactly (own schema, `tenant_id bigint`, RLS via `app.current_tenant_id`).

---

## Constraint highlights

### 1. Israeli license-plate format (AGENT-126 sec.4)

```sql
constraint plate_il_format check (
  plate_number ~ '^[0-9]{2}-[0-9]{3}-[0-9]{2}$'      -- old 7-digit
  or plate_number ~ '^[0-9]{3}-[0-9]{2}-[0-9]{3}$'   -- new 8-digit (2017+)
)
```

Plus `UNIQUE (tenant_id, plate_number)` so the same plate cannot recur within a tenant. A partial index on `(tenant_id, plate_number) WHERE is_deleted = false` keeps lookups fast and lets a soft-deleted plate be re-issued.

### 2. Monotonic odometer (AGENT-126 sec.6)

Three layers of enforcement:

- **Column CHECK on `auto_vehicles.current_odometer_km`** - non-negative.
- **Table CHECK on `auto_service_orders.odometer_monotonic`** - delivery >= intake.
- **`BEFORE UPDATE` trigger `fn_vehicle_odometer_monotonic`** - raises `check_violation` if `NEW.current_odometer_km < OLD.current_odometer_km`. Auto-stamps `last_odometer_at` when the value changes.

A complementary `AFTER UPDATE` trigger on `auto_service_orders` propagates a higher delivery odometer up to the parent vehicle (with a `WHERE current_odometer_km < new` guard so it can never decrease the row), and tags the source as `SERVICE_INTAKE`.

This shuts the IL consumer-protection gap (חוק רישוי שירותים לרכב) flagged in AGENT-126.

### 3. Tziyud cert FK (AGENT-126 sec.5)

A dedicated table `auto.auto_tziyud_certs` carries 8 cert types:

| Code | Hebrew | Use |
|------|--------|-----|
| `TACHOGRAPH` | מסוף נסיעה | תקנה 364 - heavy/commercial |
| `WEIGHT` | אישור משקל | trucks, trailers |
| `METER` | מונה מונית | taxi/hire |
| `HAZMAT` | חומ"ס | hazardous-materials carriers |
| `ANNUAL_TEST` | טסט שנתי | all vehicles |
| `GAS_INSTALL` | התקן גז | LPG/CNG conversions |
| `BRAKE_TEST` | בדיקת בלמים | post-major-service |
| `OTHER` | - | catch-all |

`auto_vehicles` carries 4 direct FKs (tachograph, weight, meter, hazmat) so a Vehicle360 page can show cert status without a join through service items.

`auto_service_items` carries `tziyud_cert_id` plus a CHECK that **forces** it to be non-null when `kind='tziyud_check'` and forbids it otherwise:

```sql
constraint tziyud_cert_required check (
  (kind = 'tziyud_check' and tziyud_cert_id is not null)
  or (kind <> 'tziyud_check')
)
```

---

## Schema details

### `auto.auto_tziyud_certs` (12 fields + audit)
- `cert_type` enum-via-CHECK (8 values listed above)
- `cert_number`, `cert_authority`, `inspector_name`, `document_url`
- `issued_at`, `expires_at` with `expires_at >= issued_at` CHECK
- `status` enum: `valid|expiring_soon|expired|revoked`
- `UNIQUE (tenant_id, cert_type, cert_number)` so the same cert cannot be entered twice

### `auto.auto_vehicles` (28 fields + audit)
- IL plate CHECK (covered above)
- `vin`, `make`, `model`, `year` (1950-2099 sanity range)
- `fuel_type` enum: `GASOLINE|DIESEL|LPG|CNG|HYBRID|EV|HYDROGEN|OTHER`
- `transmission`, `engine_volume_cc`, `mot_class` (סוג רישוי)
- `current_odometer_km`, `last_odometer_at`, `last_odometer_source` (5 sources)
- 4 expiry dates: `annual_test_expires_at`, `insurance_expires_at`, `license_expires_at`, `next_service_due_at`
- 4 cert FKs: tachograph / weight / meter / hazmat
- `status` enum: `active|inactive|sold|totaled|impounded`

### `auto.auto_service_orders` (24 fields + audit)
- `state` enum: `opened|in_diag|approved|in_work|qc|delivered|invoiced|closed|cancelled` (matches AGENT-126 sketch + adds `cancelled`)
- `service_type` enum: 10 values incl. `TZIYUD_CHECK`, `RECALL`, `WARRANTY`
- 6 money columns in agorot (bigint to avoid float drift): labor / parts / tziyud / external / VAT / total
- `complaint_he`, `diagnosis_he`, `customer_approval_at`, `customer_approver` for compliant טופס תיוג
- `intake_odometer_km` NOT NULL, `delivery_odometer_km` nullable, monotonic CHECK across them
- `UNIQUE (tenant_id, order_number)`

### `auto.auto_service_items` (21 fields + audit)
- `kind` enum: `labor|part|tziyud_check|external|sublet`
- `qty`, `unit_price_agorot`, `discount_agorot`, `vat_agorot`, `total_agorot`
- `labor_minutes`, `technician_id` for labor lines
- `tziyud_cert_id` FK (required-when-tziyud CHECK)
- `warranty_days`, `supplier_id`, `external_invoice_no` for parts/sublet
- `UNIQUE (service_order_id, line_no)` - line ordering stable
- `ON DELETE CASCADE` from parent service order

---

## RLS posture

Every table has 3 policies (12 total), generated in a DO block to keep the SQL DRY:

1. `<table>_tenant_select` - SELECT for `authenticated` where `tenant_id` matches `current_setting('app.current_tenant_id')`
2. `<table>_tenant_modify` - ALL (insert/update/delete) for `authenticated` with both USING and WITH CHECK on tenant
3. `<table>_service_all` - ALL for `service_role` (bypasses tenant gate, used by background jobs)

This deliberately mirrors `00082_food_domain.sql` and respects:
- `00071_remove_dangerous_anon_read_policies.sql` (no `to anon`)
- `00073_rls_hardening.sql` (no `USING (true)` for authenticated)
- `00070_fix_auth_rls_initplan.sql` (uses `current_setting` not `auth.uid()` direct)

---

## Indexes added (20 total)

| Table | Indexes |
|-------|---------|
| `auto_tziyud_certs` | tenant; tenant+type+expiry; tenant+status (partial) |
| `auto_vehicles` | tenant; tenant+customer; plate (partial); vin (partial); tenant+status (partial); tenant+test_expiry (partial) |
| `auto_service_orders` | tenant; tenant+vehicle+opened DESC; tenant+customer+opened DESC; tenant+state (partial); technician (partial); tenant+opened DESC |
| `auto_service_items` | tenant; service_order; tenant+kind; product (partial); tziyud (partial) |

Partial indexes use `WHERE is_deleted = false` or `WHERE x is not null` to keep them small.

---

## What this does NOT do (out of scope)

The brief was DDL-only. The following are referenced in the migration as bigint FKs but the target tables/integrations are deferred to follow-up agents:

- `customer_id` - loose bigint, not FK'd to `commercial.customers` (cross-schema FK; needs AGENT-9 alignment).
- `technician_id` - loose bigint; will FK to `workforce.employees` once that schema is consolidated.
- `product_id`, `supplier_id` - loose bigints to inventory/procurement.
- `invoice_id` on service order - loose bigint to finance.
- Pipeline registration: `entity-map.js`, `state-machines.js`, `orchestrator.js`, `wiring-spec.js` updates per AGENT-126 sec.7 - **NOT in this migration** (separate task per CLAUDE.md architecture rules).
- Vehicle360 / ServiceOrder360 pages - **NOT in this migration** (UI task).

---

## Verification suggested (post-merge)

```sql
-- 1. Plate CHECK rejects junk
insert into auto.auto_vehicles (tenant_id, customer_id, plate_number)
  values (1, 1, 'ABCDE');                  -- expect: check_violation

-- 2. Monotonic odometer trigger
update auto.auto_vehicles set current_odometer_km = 50
  where id = (select id from auto.auto_vehicles
              where current_odometer_km > 100 limit 1);  -- expect: rollback forbidden

-- 3. Tziyud-required CHECK on service items
insert into auto.auto_service_items
  (tenant_id, service_order_id, line_no, kind, description_he)
  values (1, 1, 1, 'tziyud_check', 'בדיקת מסוף נסיעה');  -- expect: check_violation (no cert)

-- 4. RLS gate
set role authenticated;
set app.current_tenant_id = '999';
select count(*) from auto.auto_vehicles;        -- expect: 0
```

---

## Files touched

- `supabase/migrations/00078_automotive_domain.sql` - **created** (397 lines)
- `_qa-reports-25/AGENT-238-automotive-ddl.md` - **created** (this file)

No other files modified.
