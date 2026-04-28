# AGENT-326 — BOM (Bill of Materials) Deep Audit

Date: 2026-04-29
Agent: 326
Worktree: objective-merkle-40ff93
Scope: BOM tables, explosion logic, multi-level, scrap %, by-products, alternates, where-used, version control.

## 1. Executive Summary

The repo has **three parallel BOM stacks** with overlapping responsibility — a strong production-grade in-memory engine, plus two SQL-backed REST routes, plus a relational schema in the canonical `execution` domain. None of the literal table names requested (`mfg_bom` / `mfg_bom_lines`) exist; the canonical analogues are `execution.bom_headers` + `bom_lines` (and `revision_control`). Coverage of the requested capabilities is broadly strong, with the notable exception of **by-products / co-products** (genuinely missing) and a fragmented, duplicated **alternates** model.

Verdict: **STRONG** for explosion, scrap, where-used, multi-level, version control, ECO; **WEAK** for by-products and unified alternates; **MIXED** for cross-stack consistency.

## 2. Stack Inventory (Authoritative Files)

### A. In-memory engine (Y-031 spec) — most complete logic
- `onyx-procurement/src/manufacturing/bom-manager.js` (1,876 lines) — class `BOMManager`
- `onyx-procurement/test/manufacturing/bom-manager.test.js` (1,381 lines, 23 `describe` blocks, 97 test markers)

### B. SQL-backed REST routes
- `api-server/src/routes/execution/bom-headers.ts` — CRUD + `/release` action over `execution.bom_headers`
- `api-server/src/routes/bom-builder.ts` (461 lines) — auto-creates `bom_products`, `bom_assemblies`, `bom_lines`, `bom_labor_standards`; full CRUD + cost recalc
- `api-server/src/routes/bom-product-engine.ts` (1,092 lines) — auto-creates `product_bom`, `bom_components`, `bom_labor`, `bom_cost_summary`; metal-fab seed data

### C. Schema (canonical)
- `supabase/migrations/00045_execution_domain_complete.sql` — `execution.bom_headers` + `execution.revision_control` (lines 526-599)
- `lib-client/db/src/schema/production-bom.ts` — Drizzle: `bomHeadersTable`, `bomLinesTable`
- `lib-client/db/src/create-production-tables.ts` — bootstrap DDL for `bom_headers` + `bom_lines`
- `lib-client/api-zod/src/execution/bom-headers.ts` — Zod schemas

### D. Front-end pages (10 BOM pages)
- `erp-app/src/pages/production/bom-manager.tsx`, `bom-tree.tsx`
- `erp-app/src/pages/supply-chain/`: `bom-command-center.tsx`, `bom-comparison.tsx`, `bom-cost-rollup.tsx`, `bom-templates.tsx`, `bom-versions.tsx`, `bom-where-used.tsx`
- `erp-app/src/pages/bom-products.tsx`

## 3. Table Audit — Requested vs. Actual

| Requested | Actual canonical | Status |
|-----------|------------------|--------|
| `mfg_bom` | `execution.bom_headers` | RENAMED (no `mfg_*` prefix) |
| `mfg_bom_lines` | `bom_lines` (public) + no `execution.bom_lines` migration found | PARTIAL — `bom_lines` defined in Drizzle/bootstrap, NOT in `00045_execution_domain_complete.sql` |
| `bom_versions` | `execution.revision_control` | COVERED (generic table for drawings/BOMs/specs) |
| Alternates | scattered: `bom_components.substitute_material_id`, `bom_lines.substitute_material`, in-memory `alternateGroup` | FRAGMENTED |

### 3.1 `execution.bom_headers` (migration 00045, line 527)
Columns: `id`, `public_id (uuid)`, `bom_number`, `name`, `description`, `product_code`, `product_description`, `drawing_id` FK, `project_id` FK, `work_order_id` FK, `version`, `bom_type` (CHECK: engineering/production/service/costing/phantom), `state` (draft/in_review/approved/released/obsolete), `effective_from`, `effective_to`, `total_cost_estimate`, `currency` (default ILS), `approved_by_user_id`, `approved_at`, `is_active`, `is_deleted` (soft-delete), `metadata jsonb`. Indexed on `drawing_id`, `project_id`, `state`, `bom_type`, `is_active`. Has `updated_at` trigger.

### 3.2 `bom_lines` (Drizzle + create-production-tables)
Columns include: `id`, `bom_header_id`, `component_name`, `component_sku`, `quantity`, `unit`, `unit_cost`, `total_cost`, `level`, `parent_line_id` (self-FK for tree), `material_id`, **`scrap_factor` numeric default 0**, `is_critical`, `substitute_material` text, `position_number`, `operation_number`, `lead_time_offset_days`, `warehouse`, **`phantom` boolean**, `effective_date`, `expiry_date`. **GAP:** there is no migration file in `supabase/migrations/` that creates `execution.bom_lines` — the `execution.bom_headers` table has no canonical line-items child in migration 00045. Lines exist only via `lib-client/db/src/create-production-tables.ts` (public schema).

### 3.3 `execution.revision_control` (migration 00045, line 567)
Generic version table: `entity_type` CHECK in (drawing/bom_header/specification/work_order/project), `entity_id`, `revision_code`, `revision_number`, `previous_snapshot jsonb`, `new_snapshot jsonb`, `state`, `supersedes_revision_id` (self-FK), unique on (entity_type, entity_id, revision_number). Strong design — captures full snapshots for diff.

### 3.4 Parallel SQL stack #1 — bom-builder.ts (lines 7-56)
Tables: `bom_products`, `bom_assemblies`, `bom_lines` (note: same name, different columns — `quantity_per_meter`, `waste_pct`, `assembly_id`), `bom_labor_standards`. Cost recalc trigger via `recalcProduct()` on every line CRUD.

### 3.5 Parallel SQL stack #2 — bom-product-engine.ts (lines 14-98)
Tables: `product_bom`, `bom_components` (with `is_optional`, `substitute_material_id`, `waste_percentage`), `bom_labor`, `bom_cost_summary`. Per-sqm metal-fab focus (`quantity_per_sqm`, `cost_per_sqm`).

**Three competing `bom_lines`-type tables coexist** — `execution.bom_headers` lines (drizzle), `bom_lines` (per-meter, builder), `bom_components` (per-sqm, engine). No FK reconciliation. This is the most material risk in the stack.

## 4. BOM Explosion Logic (Y-031 in-memory engine)

### 4.1 Core: `BOMManager.explodeBOM(sku, qty, levels)` — bom-manager.js:480-569
- DFS recursion with `MAX_EXPLODE_DEPTH = 64` cap (line 168) — guards pathological nesting
- `stack` tracks visited path → throws on cycle with full `cycle: []` chain
- For each component: `nominal = parentQty * comp.qty`, `effective = nominal * (1 + scrap)`
- Sub-assemblies: when `getActiveBOMForSku(comp.sku)` returns a BOM → recurse; else treat as raw leaf and aggregate into `totalsByLeaf[sku] = {qty, uom}`
- Returns `{parentSku, parentQty, lines, totalsByLeaf, depth}`
- `round4()` precision (line 207) — gram-level for kg

### 4.2 Y-031 spec extension: `_explodeFromRecord` — bom-manager.js:1338-1432
- Pins to a **specific revision** rather than active
- **Effectivity-date filter** (lines 1362-1366): skips rows where `comp.effectivityFrom > asOfDate` or `comp.effectivityTo < asOfDate`
- **Phantom handling** (lines 1404-1410): phantoms recurse but DO NOT contribute to `totalsByLeaf` — pass-through (correct semantics)
- **Sub-rev pinning** (line 1374): `comp.subRev` allows component to pin a specific child BOM revision — multi-level revision pinning

### 4.3 Multi-level depth verification
- Test `Y-031 explode — rev-pinned multi-level` (test file line 940) exercises 3-deep tree
- `MAX_EXPLODE_DEPTH = 64` is generous; cycle detection is sound (test line 1232)

## 5. Scrap % Handling

### 5.1 In-memory (bom-manager.js)
- `DEFAULT_SCRAP_RATES` (lines 67-79): cutting 5%, welding 2%, bending 3%, drilling 1%, grinding 2%, punching 4%, painting 5%, galvanizing 3%, assembly 0%, inspection 0%, default 2%
- Resolution priority (`resolveScrap`, line 229): row override → operation default → DEFAULT_SCRAP_RATES.default
- Validation (line 936-940): `scrap` must be in [0, 1], else error
- **Y-031 normalization (`defineBOM` line 1208-1218)**: accepts BOTH 0..1 fraction AND 0..100 percent; auto-divides if >1; rejects >100. **GOOD UX** for spec authoring
- Scrap is multiplicative on each level → compound scrap is automatic (intended for metal-fab accumulating loss)

### 5.2 SQL stacks
- `bom_lines.scrap_factor` (Drizzle) — numeric, default 0
- `bom_lines.waste_pct` (bom-builder.ts:40) — default 5
- `bom_components.waste_percentage` (bom-product-engine.ts:51) — default 5
- bom-builder applied as `1 + waste_pct/100` multiplier (line 253) — same compounding semantics

**Inconsistency:** field name varies (`scrap_factor` vs. `waste_pct` vs. `waste_percentage`) and default differs (0 vs 5). No single source of truth.

## 6. By-Products / Co-Products — **MISSING**

Searched: `byProduct`, `by_product`, `byproduct`, `coproduct`, `co_product`, `joint product` (case-insensitive) across the project (excluding `_merge-incoming`).
- **No BOM-related implementation found.** Hits are all in unrelated finance/CRM/marketing files.
- No `is_byproduct` / `is_coproduct` / `output_type` flag on any `bom_lines`-like table.
- No negative-quantity convention in code (would be the standard pattern for by-products in MRP).
- Engine `costRollup` (line 586+) only sums positive material cost — no credit-side allocation.

**Recommendation:** add `output_type ENUM('input','byproduct','coproduct','scrap_output')` on `bom_lines`, plus a `value_share_pct` for joint-cost allocation. Required for any process-industry or scrap-yield-tracking deployment.

## 7. Alternates / Substitutes — **FRAGMENTED**

### 7.1 In-memory engine — strongest
- Component-level `alternatives: string[]` (line 374) — list of approved substitute SKUs
- `alternateGroup: string` tag (line 1234) — Y-031 spec; multiple components can share a group
- `alternateGroup(partNumber, rev, group)` API (line 1698-1721) — returns members of a group with their own alternatives lists
- `substituteComponent(bomId, oldSku, newSku, ...)` (line 1018-1061) creates new revision, marks old obsolete, **adds the swapped-out SKU to the new component's `alternatives` list automatically** (line 1039)

### 7.2 SQL stacks — weak
- `bom_lines.substitute_material` text (Drizzle) — single string only, no list, no group
- `bom_components.substitute_material_id` (bom-product-engine.ts:57) — single FK only
- No `bom_alternatives` / `bom_alternate_groups` table anywhere in `supabase/migrations/`

**GAP:** the rich engine model is not persisted. Round-tripping a Y-031 BOM through the SQL layer would lose `alternateGroup` and the multi-alternative list.

## 8. Where-Used (Reverse Lookup)

### 8.1 In-memory: `whereUsed(componentSku, opts)` — bom-manager.js:679-732
- Indexed via `_whereUsed: Map<sku, Set<bomId>>` (line 268) — O(1) lookup
- Supports `transitive: true` for parents-of-parents BFS upward
- `includeObsolete: true` default — by golden rule, obsolete BOMs are NEVER deleted
- Y-031 alias `implode(childPart)` (line 1441-1450) — wraps with transitive ON by default

### 8.2 Front-end: `erp-app/src/pages/supply-chain/bom-where-used.tsx`
- KPIs: total tracked components, shared (3+ products), single-source, critical, orphans
- Tabs for shared components, dependencies (with substitute availability flag), orphan components with disposition action (sell/scrap/archive)
- **CONCERN:** uses `FALLBACK_*` static data (lines 23-80) — page renders fallback when API empty; not wired to a real `whereUsed` endpoint

### 8.3 SQL backing
- No dedicated `where-used` query in `bom-headers.ts` route. Must be derived ad-hoc by joining `bom_lines.component_sku` against `bom_headers.product_sku`. Acceptable but slow at scale without an index on `component_sku`.

## 9. Version Control / Revision Management

### 9.1 In-memory — strict golden rule
- `BOM_STATUS = {DRAFT, ACTIVE, OBSOLETE, ARCHIVED}` (line 94) — obsolete preserved forever
- `obsoleteRevision(bomId, newRevId)` (line 833-867) — flips status, sets `endDate`, sets `supersededBy`, appends history; **never deletes**
- `_nextRevisionLabel(current)` (line 1067) — A→B→...→Z→A1→A2; or numeric increment; or `.1` suffix
- `compareBOMs(sku, revA, revB)` (line 745-817) — returns `{added, removed, changed, unchanged}` with per-field diffs
- ECO workflow (line 1532-1685): `ecoRequest` → `approveEco` (dual-rail: engineering + quality + purchasing must all approve), append-only approvals trail, status timeline preserved. Rejection by ANY role wins immediately (line 1618-1623). Tested at line 1131.

### 9.2 SQL — `execution.revision_control`
- Stores `previous_snapshot jsonb` + `new_snapshot jsonb` — supports diff but requires app code to compute
- `state` flow: draft → in_review → approved (mirrors ECO but coarser-grained — single approver, not three roles)
- `supersedes_revision_id` self-FK builds the revision chain
- **Coverage gap vs. engine:** no analogue of `REQUIRED_ECO_ROLES` (engineering/quality/purchasing) — single approval column

### 9.3 `bom-headers.ts` route `/release` action (lines 24-34)
- Transition `draft|in_review|approved → released` only; sets `approved_by_user_id`, `approved_at`. No CHECK that all required roles approved first. **Weaker than engine.**

## 10. Test Coverage (bom-manager.test.js)

23 `describe` blocks, 97 test/describe markers, 1,381 lines:
- Creation & validation (line 137)
- Circular reference detection (line 219, 1232)
- Flat scrap inclusion (line 287)
- Nested sub-assemblies (line 348)
- Cost rollup material+labor+overhead (line 405, 1037)
- Where-used direct + transitive (line 463, 977)
- Revision diff (line 533, 1003)
- Obsolete preserves history (line 588)
- Substitute engineering change (line 634)
- Metal-fab specifics (line 683): scrap defaults, cert traceability
- Edge cases (line 735)
- Y-031 defineBOM, explode, implode, costedBOM, availabilityCheck (shortages list, line 1091)
- ECO dual-approval (line 1131)
- Phantom transparency (line 1249)
- Effectivity-date filter (line 1299)
- AlternateGroup (line 1328)
- Y-031 ranges (line 1361)

Strong coverage. **No tests for SQL routes** — the `bom-builder.ts` cost-recalc trigger and `bom-headers.ts` `/release` lack integration tests.

## 11. Risks & Recommendations

| # | Severity | Issue | File/Line | Fix |
|---|----------|-------|-----------|-----|
| 1 | HIGH | No `execution.bom_lines` migration — header has no canonical child table | migration 00045 ends at line 599 with revision_control | Add migration creating `execution.bom_lines` with FK to `bom_headers.id`, mirror Drizzle schema |
| 2 | HIGH | By-products / co-products entirely absent | (none) | Add `output_type` enum + `value_share_pct` on `bom_lines` |
| 3 | HIGH | Three parallel BOM table families (`bom_lines`/`bom_components`/`bom_lines builder`) with no reconciliation | bom-builder.ts:33, bom-product-engine.ts:41, schema/production-bom.ts:34 | Pick `execution.bom_headers + bom_lines` as canonical; deprecate the other two via view shims |
| 4 | MED | Alternates fragmented — text field SQL-side, rich list+group in-memory | bom-product-engine.ts:57, bom-manager.js:1234 | Add `bom_alternates(bom_line_id, alternate_sku, alternate_group, priority)` table |
| 5 | MED | Scrap field naming inconsistent (`scrap_factor`/`waste_pct`/`waste_percentage`) and default differs (0 vs 5) | various | Standardize on `scrap_pct numeric(5,2) default 0` |
| 6 | MED | `bom-headers.ts` `/release` doesn't enforce dual-rail approval; engine does | api-server/src/routes/execution/bom-headers.ts:24 | Check `revision_control` for engineering/quality/purchasing rows before allowing transition |
| 7 | LOW | `bom-where-used.tsx` renders fallback static data when API returns nothing | erp-app/src/pages/supply-chain/bom-where-used.tsx:23-80 | Wire to real `/api/bom/where-used/:sku` endpoint |
| 8 | LOW | No SQL integration tests for the two REST routes | (none) | Add Jest/Vitest specs covering CRUD + `recalcProduct` |
| 9 | LOW | `MAX_EXPLODE_DEPTH = 64` not configurable per tenant | bom-manager.js:168 | Expose via `BOMManager` constructor option |

## 12. Verdict

| Capability | Engine (in-memory) | SQL stacks | Front-end |
|------------|--------------------|------------|-----------|
| BOM explosion (multi-level) | STRONG (DFS, cycle, depth, effectivity, phantoms) | WEAK (none implemented) | OK (bom-tree.tsx exists) |
| Scrap % | STRONG (per-row + per-op + Y-031 0..100 normalize) | OK (compounded but inconsistent naming) | OK |
| By-products | MISSING | MISSING | MISSING |
| Alternates | STRONG (list + group + auto-add on substitute) | WEAK (single text field) | UI exists, model thin |
| Where-used | STRONG (indexed, transitive, includeObsolete) | OK (ad-hoc query) | EXISTS (uses fallback) |
| Version control | STRONG (golden rule, ECO dual-rail, history) | OK (revision_control + snapshots) | EXISTS (bom-versions.tsx) |

**Bottom line:** The in-memory `BOMManager` (Y-031) is production-grade. The SQL persistence layer is significantly behind it on alternates, dual-rail ECO, by-products, and lacks a canonical `execution.bom_lines` migration. Closing items #1, #2, #3 is the priority.

