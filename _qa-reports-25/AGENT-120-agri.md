# AGENT-120 - Agriculture Domain Audit

**Project:** Techno-Kol Uzi ERP 2026 (kobi-el-system-2026, `ponypxhushxeskxgrmha`)
**Scope:** `agri_farms`, `agri_fields`, `agri_crops`, `agri_livestock`, `agri_harvest_logs` plus crop-yield, irrigation, livestock-tracking and Israeli Ministry of Agriculture (משרד החקלאות) reporting
**Date:** 2026-04-29
**Auditor:** Agent 120 - Agriculture
**Sources:** `supabase/migrations/00000-00071`, `supabase/types.ts`, `onyx-procurement/`, `payroll-autonomous/`, `_qa-reports-25/AGENT-09-db-integrity.md`

---

## Status

**FAIL.** Agriculture is a stub. Only two of the five mandated tables exist on the canonical Supabase project, none of the five have a CREATE TABLE migration on disk, none have any application code (no entity-map entry, no orchestrator action, no API route, no UI, no tests, no IL reporting), and what exists has the same RLS / tenant-isolation gaps Agent-09 already flagged for the rest of the `public.*` vertical domains.

| Check | Result | Severity |
|---|---|---|
| Tables present in DB (5 expected) | 2 of 5 (`agri_fields`, `agri_harvest_logs`) | CRITICAL |
| Tables missing from DB | `agri_farms`, `agri_crops`, `agri_livestock` | CRITICAL |
| `CREATE TABLE` migrations on disk | 0 of 5 (no migration creates any agri_* table) | CRITICAL |
| `tenant_id` column on existing tables | Missing on `agri_fields`, `agri_harvest_logs` | HIGH |
| `tenant_id` index on referenced tables | Missing on `agri_crops`, `agri_livestock` | HIGH |
| RLS policies | `USING (true)` permissive (per Agent-09) | CRITICAL |
| `agri_fields.status` CHECK constraint | Missing | MEDIUM |
| FK indexes on tenant_id columns | Missing | HIGH |
| `entity-map.js` registration | Not found - no agri entity types | HIGH |
| `state-machines.js` for crop / harvest / livestock | Missing | HIGH |
| `orchestrator.js` actions (plant, irrigate, harvest, vaccinate) | Missing | HIGH |
| `wiring-spec.js` route group + 360 page | Missing | HIGH |
| API routes (`/api/agri/*`) | None | HIGH |
| UI pages / Farm360 / Field360 | None | HIGH |
| Crop-yield calculation service | Missing | HIGH |
| Irrigation scheduling service | Missing | HIGH |
| Livestock tagging / health tracking | Missing | HIGH |
| IL Ministry of Agriculture reports | None | HIGH |
| מועצת הצמחים / מועצת החלב / מל"מ submissions | None | HIGH |
| Tests | 0 unit, 0 integration | HIGH |

---

## Schema-issues

### 1. Three of five mandated tables do not exist
Agent-09 enumerated `public.*` vertical-domain tables containing prefix `agri_`. Only `agri_fields` (line 43, status column without CHECK) and `agri_harvest_logs` (line 110, missing `tenant_id`) appear. **`agri_farms`, `agri_crops`, `agri_livestock` are referenced in line 97 (`agri_crops.tenant_id`, `agri_livestock.tenant_id` listed as missing FK indexes)** - meaning Agent-09 saw them on the canonical Supabase project, **but they have no `CREATE TABLE` statement in any of the 73 migrations on disk** (`00000_master_schema.sql` through `00071_remove_dangerous_anon_read_policies.sql`, plus `20260417000000_initial_schema.sql`). They were created out-of-band (Supabase dashboard or a deleted migration) - the local repo cannot reproduce them. This blocks any reproducible deployment and blocks every other audit.

### 2. No DDL anywhere in repo for any agri_* table
A full text search across `supabase/`, `onyx-procurement/`, `erp-app/`, `packages/`, `api-server/`, `dev/`, `_master-registry/`, `_audit_tmp/`, `_delivery/` returned zero hits for `agri_farms`, `agri_fields`, `agri_crops`, `agri_livestock`, `agri_harvest_logs`. The only matches are inside `_qa-reports-25/AGENT-09-db-integrity.md` (the upstream DB audit) and `AI-Task-Manager/artifacts/erp-mobile/app.json` (mobile app metadata, irrelevant).

### 3. `agri_fields.status` lacks CHECK constraint
Per Agent-09 line 43. Allowed values cannot be enforced at the DB level - any string is accepted. Required canonical set (proposed): `planned | prepared | planted | growing | harvesting | harvested | fallow | retired`.

### 4. Missing CHECK and NOT-NULL on agronomic numerics (assumed)
With no DDL on disk, fields like `area_dunam` (1 dunam = 1,000 m²), `ph`, `ec`, `irrigation_minutes`, `yield_kg`, `harvest_quantity` cannot be confirmed to enforce `>= 0` or units. Same gap Agent-09 flagged for AP/AR/Procurement amounts.

---

## Tenant-isolation-issues

### 1. `agri_fields`, `agri_harvest_logs` missing `tenant_id` (HIGH)
Listed by Agent-09 line 110 among the 57 vertical-domain tables with no `tenant_id` column at all. In a multi-tenant project after the 2026-04-22 migration this means cross-tenant leakage at the API layer.

### 2. `agri_crops.tenant_id`, `agri_livestock.tenant_id` not indexed (HIGH)
Agent-09 line 97. RLS predicates `tenant_id = governance.current_tenant_id()` will produce a sequential scan on every request once tenant isolation is enabled.

### 3. RLS policies permissive (`USING (true)`) (CRITICAL)
Per Agent-09 line 77: every `public.agri_*` table carries a single permissive policy. Until M5 (`00076_harden_public_domain_rls.sql`) lands, any authenticated session reads / writes any tenant's farm, field, crop, livestock, harvest-log row.

---

## Application-layer-issues

### 1. No `entity-map.js` registration
`onyx-procurement/src/pipeline/entity-map.js` defines 16 entities. No entry for `Farm`, `Field`, `Crop`, `LivestockHerd`, `HarvestLog`. CLAUDE.md "No Dead Pages Rule" cannot be satisfied because there are no buttons, no relations, no recommended-next-action mappings.

### 2. No state machines
`state-machines.js` defines 13 machines, 91 transitions. None for crop life-cycle (planned -> growing -> harvested), livestock (born -> growing -> productive -> sold/culled), or harvest log (open -> weighed -> graded -> dispatched -> closed).

### 3. No orchestrator actions
`orchestrator.js` exposes 18 actions. Missing: `agri.field.plan`, `agri.field.plant`, `agri.crop.irrigate`, `agri.crop.fertilise`, `agri.crop.spray`, `agri.crop.harvest`, `agri.harvestLog.weigh`, `agri.livestock.tag`, `agri.livestock.vaccinate`, `agri.livestock.weigh`, `agri.livestock.cull`. Each would need preconditions, side-effects, events, listeners.

### 4. No wiring
`wiring-spec.js` lists 19 route groups and 9 page contracts. Agriculture has no route group, no `Farm360` / `Field360` / `Crop360` / `LivestockHerd360` page, no service ownership (TECHNO_KOL_OPS vs ONYX_PROCUREMENT vs ONYX_AI), no cross-service contract (e.g. harvest -> `inv_transactions` IN, harvest -> `ar_invoices` OUT for sale to dairy / packing house).

### 5. No API surface
Zero `/api/agri/*`, `/api/farms/*`, `/api/fields/*`, `/api/crops/*`, `/api/livestock/*`, `/api/harvest-logs/*` routes in `onyx-procurement/`, `techno-kol-ops/`, or `api-server/`. No GraphQL schema. No RPC.

### 6. No UI
`erp-app/` has no agriculture screen. Mobile app (`AI-Task-Manager/artifacts/erp-mobile/`) does not register the domain.

### 7. No services
- **Crop-yield calc** (kg/dunam, gross margin/dunam, water-use-efficiency L/kg) - not implemented.
- **Irrigation scheduler** (ETo, Kc, soil-moisture sensors, valve commands) - not implemented; no integration with Netafim / Galcon / Mottech controllers.
- **Livestock tracking** (RFID/EID ear-tag, weight curves, gestation, vaccination calendar) - not implemented.
- **Pesticide / fertiliser application log** (mandatory under PPIS / שפ"מ) - not implemented.

---

## IL-compliance-issues (Israeli Agriculture authorities)

`AGENT-19-il-compliance.md` covers VAT/BL/Mas Hachnasa for the rest of the system but is silent on agriculture-specific filings. None of the following are implemented in this repo:

| Authority | Filing / Interface | Status |
|---|---|---|
| משרד החקלאות ופיתוח הכפר (MoAg) | Annual farm registry update (פרטי משק) | MISSING |
| שירותים להגנת הצומח ולביקורת (PPIS / שפ"מ) | Pesticide-use logbook + annual return; pre-harvest interval enforcement | MISSING |
| מועצת הצמחים (Plant Production & Marketing Board) | Crop-area declaration + harvest forecast (GPS polygon per field) | MISSING |
| מועצת החלב (Israel Dairy Board) | Monthly milk-quota declaration; per-cow yield linked to Sion / NOA herd-book | MISSING |
| מל"מ / SION (Israel Cattle Breeders Association) | Calving, weighing, breeding, culling events | MISSING |
| רשות המים | Annual water-allocation report (allocation vs use, m³ per field) | MISSING |
| המשרד להגנת הסביבה / נציבות המים | Effluent / fertigation discharge log | MISSING |
| משרד הבריאות (raw milk, eggs, raw plant produce) | Producer-license linkage + traceability lots | MISSING |
| מכס - יצוא חקלאי | Phytosanitary certificate metadata for export shipments | MISSING |
| Subsidies (הסכמי תמיכה) | Eligibility tracking and claim files | MISSING |

VAT note: most primary agricultural produce is `מע"מ אפס` (zero-rated) under §30(a)(13)-(14). Without a tax-class on `agri_crops` / harvest-log rows the existing 18% calculator will mistax sales - a domain-specific tax-class column is mandatory.

Personal-data note: livestock RFID + GPS field polygons of farm employees can be PII when joined to `hr_employees`. Privacy Protection Authority registration (database #500/501) is not handled; needs entry in `compliance_certs`.

---

## Pipeline / 360-page gaps

CLAUDE.md mandates 9 P0 360 pages. Agriculture currently has zero of:

- **Farm360** - one row per `agri_farms`. Header (name, location polygon, ICA tax-file, water-allocation), KPIs (active dunams, herd size, YTD yield, YTD margin), related (fields, crops, herds, harvest logs, water meters, employees, suppliers), audit log, recommended next action.
- **Field360** - per `agri_fields`. Crop history, soil-test log, irrigation events, harvest-log roll-up, GPS polygon viewer.
- **Crop360** - per `agri_crops`. Planting -> growing -> harvest timeline, applications log (irrigation/fertilisation/spraying with PHI countdown), expected vs actual yield, gross margin per dunam.
- **Livestock360 / Herd360** - per `agri_livestock`. Animal card (EID, breed, sire, dam), weight & lactation curves, vaccination & medication record (with withdrawal-period block), breeding cycle, culling decision support.
- **HarvestLog360** - per `agri_harvest_logs`. Weighbridge tickets, grading, dispatch to packing house / dairy / customer, link to AR invoice, traceability lot.

None of these exist. The "No Dead Pages Rule" is violated on the entire domain.

---

## Recommended-migrations / fixes

Order matters. M1-M3 must precede everything else.

### M1 - `00081_create_agri_domain_tables.sql`
Create the five tables with `tenant_id uuid NOT NULL`, FK to `tenants(id)`, FK indexes, plus indexes on `farm_id`, `field_id`, `crop_id`, `harvest_date`, `livestock.eid`, `livestock.rfid_tag`. Include CHECK on `status`, `area_dunam >= 0`, `yield_kg >= 0`, `head_count >= 0`. Make this migration idempotent (`IF NOT EXISTS`) to align with whatever already exists on the canonical project, and emit `RAISE NOTICE` on column-shape mismatch.

### M2 - `00082_agri_rls_hardening.sql`
For all five tables: `ENABLE ROW LEVEL SECURITY`; replace `USING (true)` with `tenant_id = governance.current_tenant_id()` for SELECT and `WITH CHECK (tenant_id = governance.current_tenant_id() AND <role-check>)` for INSERT/UPDATE/DELETE. Mirrors AGENT-09 M5 / `00076`.

### M3 - `00083_agri_check_constraints.sql`
Add status enums, non-negative numerics, FK constraints between agri_* tables, and a partial unique index on `agri_livestock(tenant_id, eid)` and `agri_livestock(tenant_id, rfid_tag)`.

### M4 - app code
- `entity-map.js`: 5 entities with fields, statuses, actions, related sections.
- `state-machines.js`: 3 new machines (crop, livestock, harvest_log) with transitions and triggers.
- `orchestrator.js`: 11 actions listed above.
- `wiring-spec.js`: 5 route groups, 5 page contracts, 1 cross-service contract (`harvest -> inventory IN`, `harvest_sale -> ar_invoices`).
- API routes under `onyx-procurement/src/agri/` + handlers wired to `orchestrator.execute`.
- 5 360 pages in `erp-app/src/pages/360/`.

### M5 - IL compliance modules
`onyx-procurement/src/agri/il/`:
- `moag-farm-registry.js`
- `ppis-pesticide-log.js` (PHI enforcement)
- `plant-council-area-declaration.js`
- `dairy-board-monthly.js` + `sion-herdbook.js`
- `water-authority-annual.js`
- `phytosanitary.js`
- VAT zero-rating decorator on AR invoice generator (`§30(a)(13)-(14)`).

### M6 - tests
Per-table integration tests, state-machine transition tests, RLS isolation tests using two tenants, IL-form generator golden-file tests.

---

## Conclusion

Agriculture is **listed in the data dictionary on the canonical Supabase project but is otherwise unimplemented in this repo**. There is no DDL, no entity definition, no business logic, no API, no UI, no tests, no IL-authority reporting. It also inherits every RLS / tenant-isolation gap Agent-09 flagged. Recommend gating any "Agriculture" feature in the menu (`app_menu`) until at least M1-M3 land, and adding an explicit `domain_status='stub'` flag so dashboards do not display empty Farm360 / Field360 / Crop360 / Livestock360 / HarvestLog360 surfaces.

**Priority:** P0 schema reproducibility (M1), P0 RLS (M2), P1 entity/wiring (M4), P1 IL compliance (M5).
