# AGENT-FIX-P1-SQLI — Applied

**Date:** 2026-04-29
**Severity:** P1 (Critical)
**Vector:** SQL injection via column-name interpolation in dynamic INSERT/UPDATE.

## Vulnerability

Three route files built `INSERT INTO t (${keys})` and `UPDATE t SET ${sets}` from
`Object.keys(req.body)` without an allowlist. An attacker authenticated to the API
could send a JSON body whose property names contained SQL syntax, e.g.
`{ "name; DROP TABLE warehouses;--": "x" }`, and the server would interpolate that
string verbatim into the query. Parameterized values (`$1, $2`) protect data but
not identifiers — column names were the attack surface.

## Files patched

1. `api-server/src/routes/warehouses.ts` (lines ~23, ~34 in the original)
2. `api-server/src/routes/suppliers.ts` (lines ~48, ~66 in the original)
3. `api-server/src/routes/kobi/tools.ts` (lines 421, 436, 471 — `update_entity`,
   `update_field`, `manageMenu` update). Reachable via super-agent endpoints
   that import `executeTool`.

## Fix pattern

Each unsafe site now goes through an explicit `Set<string>` allowlist of writable
columns (sourced from seed scripts and existing INSERT statements). Unknown keys
throw immediately and the handler responds 400. PK and timestamp columns
(`id`, `created_at`, `updated_at`) are additionally blocked on UPDATE so an
attacker cannot rewrite primary keys or backdate audit fields.

- `warehouses.ts`: `WAREHOUSE_ALLOWED_COLUMNS` (9 columns) + helper
  `pickWarehouseColumns(body, { isUpdate })`.
- `suppliers.ts`: `SUPPLIER_ALLOWED_COLUMNS` (~36 columns covering Hebrew/English
  schema variants seen in factory-seed.ts and seed-fix.sql) + helper
  `pickSupplierColumns(body, { isUpdate, dropEmpty })`. POST drops empty/undefined
  to preserve the original behavior of inserting only provided fields.
- `kobi/tools.ts`: per-case inline `Set` for `module_entities`, `entity_fields`,
  and `menu_items` (post-camelCase normalization). Empty-set requests now return
  "אין שדות לעדכון" instead of producing malformed SQL.

## Constraints met

- Allowlist (set membership), no regex sanitization.
- No new dependencies.
- Net diff: +22 / -32 LOC across the three files (well under 80 added).
- Existing valid columns continue to work; rating, contacts, performance, and
  delete endpoints untouched.

## Verification

`npx tsc --noEmit -p api-server/tsconfig.json 2>&1 | grep -E "(warehouses|suppliers|kobi/tools)\.ts"`
returns nothing (no new TypeScript errors in the touched files). The pre-existing
`tsconfig.json` path errors for missing `lib/*` packages are unrelated.

## Residual risk

- `req.body` values are still `any`. Type-coercion attacks (sending an object
  where a string is expected) remain possible and are out of scope for this
  ticket — Drizzle/zod schema validation should follow.
- The `tools.ts` allowlists are conservative best guesses based on existing
  INSERT statements; a Drizzle-derived schema source would be more robust. Add
  any newly-needed columns to the allowlist when the table schema changes.
