# AGENT-FIX-SQLI - SQL Injection Patches Applied

**Date:** 2026-04-29
**Source patch spec:** [`AGENT-205-sql-injection-patches.md`](./AGENT-205-sql-injection-patches.md)
**Result:** All 4 patches applied successfully. Files compile structurally (brace/paren/bracket balance preserved). No collateral changes outside the flagged ranges.

## Diff stats

```
 api-server/src/routes/ar-enterprise.ts    | 122 +++++++++++++++++++++++-------
 api-server/src/routes/crm-ultimate.ts     |  51 ++++++++-----
 api-server/src/routes/finance/payments.ts |  54 ++++++++-----
 3 files changed, 164 insertions(+), 63 deletions(-)
```

## Patch 1 - `api-server/src/routes/crm-ultimate.ts` lines 572-587 (GET /leads)

**Severity:** CRITICAL
**Vector:** 7 user query params (`status`, `agent_id`, `source`, `city`, `lead_type`, `urgency`, `search`) concatenated into a `WHERE` clause then executed via `sql.raw()`.

**Fix applied:**
- Replaced `let where = "WHERE 1=1" + ...` raw concatenation with a `conditions: any[]` array of `sql\`...\${param}...\`` template tags.
- Combined with `sql.join(conditions, sql\` AND \`)`.
- Final query uses parameterised `sql\`...\${whereSql}...\${lim}...\${off}...\``.
- `String()` coerces against array-form query params; numeric ids go through `Number()`.
- `lim` clamped to `[1, 1000]`, `off` clamped to `>= 0` (defence-in-depth even though now bound).

## Patch 2 - `api-server/src/routes/crm-ultimate.ts` lines 827-834 (GET /quotes)

**Severity:** CRITICAL
**Vector:** 4 user query params (`lead_id`, `agent_id`, `status`, `customer_id`) concatenated into a raw `WHERE` clause.

**Fix applied:**
- Same conditions-array + `sql.join` pattern.
- Numeric IDs (`lead_id`, `agent_id`, `customer_id`) coerced via `Number()` so non-numeric values produce `NaN`, which Postgres rejects at bind time (the desired 400-class error).
- Status passed through `String()`.

## Patch 3 - `api-server/src/routes/ar-enterprise.ts` lines 166-217 (5 receipt handlers)

**Severity:** CRITICAL
**Vector:** Raw INSERT/UPDATE/DELETE built with hand-rolled `s()` quote-doubler + `${req.params.id}` interpolation, in 5 handlers:
- `POST /ar-receipts` — INSERT with full row from `req.body`
- `PUT /ar-receipts/:id` — UPDATE with raw `id` interpolation
- `DELETE /ar-receipts/:id` — DELETE with raw `id` interpolation
- `GET /ar/:id/receipts` — SELECT with raw `id` interpolation
- `POST /ar/:id/collect` — INSERT + 3 follow-up queries all using raw `${req.params.id}` and `s()`

**Fix applied:**
- Added a parameterised `qSql(query: any)` helper alongside the legacy `q(query: string)` (the legacy is still used by 30+ out-of-scope handlers per the spec).
- Added a `NEXT_NUM_TARGETS` whitelist (table + column as `sql.identifier`) and a `nextNumSafe(prefix, target)` function that uses `sql\`...\${t.col}...\${t.table}...\${like}...\``.
- All 5 handlers rewritten:
  - `req.params.id` is now `Number()`-coerced and validated with `Number.isInteger(id) && id > 0` before any DB call. Bad ids return HTTP 400 `מזהה לא תקין`.
  - All values use `?? null` (real `NULL`) rather than the `s()` quote-builder.
  - `newStatus` is a literal-union (`"paid" | "partial" | "open"`) — no attacker-controlled value can reach the column.
  - `sql.identifier` + whitelist used for `nextNumSafe` table/column.
- Out-of-scope handlers (dunning, write-offs, etc.) intentionally untouched per spec.

## Patch 4 - `api-server/src/routes/finance/payments.ts` lines 84-115 (LIST handler)

**Severity:** HIGH
**Vector:** Despite Zod-validated input, the handler used `whereParts: string[]` with manual `.replace(/'/g, "''")` quote-doubling and `${order_by} ${order_dir}` interpolation in `ORDER BY`. A Zod-schema regression would re-open the hole; identifiers cannot be parameter-bound in PostgreSQL anyway.

**Fix applied:**
- Added `ORDER_BY_COLUMNS` map: `Record<string, ReturnType<typeof sql.identifier>>` with the 6 allowed sort columns. `orderCol` falls back to `created_at` when input is unrecognised.
- `orderDir` resolved by an explicit `String(...).toUpperCase() === "ASC"` check, then bound via `sql.raw("ASC" | "DESC")` (compile-time literal constants — safe).
- All filter conditions converted to `sql\`...\${param}...\`` fragments.
- Numeric filters (`invoice_id`, `customer_id`, `supplier_id`) `Number()`-coerced.
- `limit` and `offset` clamped (`lim ∈ [1,1000]`, `off >= 0`) and rebound via the parameterised template.
- The 500 error branch still logs `[finance:payments:list]` exactly as before.

## Files NOT touched (out of scope per spec)

The spec explicitly limits AGENT-205 to the 4 ranges above. Adjacent issues called out in the report:
- `s()` helper still appears in 30+ other `ar-enterprise.ts` handlers (dunning at L243+, write-offs, etc.) — follow-up sweep.
- `desktop-tutorial-server/src/routes/payments.js` — legacy mirror; needs separate audit.
- `nextPaymentNumber()` / `nextAllocationNumber()` in `finance/payments.ts` use `sql.raw` with year-only interpolation, but the year comes from `new Date().getFullYear()` and is not user-controlled — same `sql.raw` site that was already there pre-patch and is also out of scope per the AGENT-205 instructions.

## Verification

1. **Brace/paren/bracket balance** — Verified via stripped-comments-and-strings parse:
   - `crm-ultimate.ts`: balanced (0/0/0), unchanged from pre-edit.
   - `ar-enterprise.ts`: brace/bracket balanced; the `paren_balance=-2` is a pre-existing artefact of complex template literals (identical reading before and after edit).
   - `finance/payments.ts`: balanced (0/0/0), unchanged from pre-edit.
2. **Drizzle API confirmed** — `sql.raw`, `sql.join`, `sql.identifier` all exist on `drizzle-orm@0.45.1` (resolved package in this monorepo).
3. **Pattern parity** — `sql.join(arr, sql\` , \`)` is already used elsewhere in `finance/payments.ts:243` (the UPDATE handler), confirming the pattern compiles in this project.
4. **Probes still pending** (require running server):
   - `GET /api/crm/leads?status=' OR 1=1--` → must return 0 rows (literal becomes a bound string equality).
   - `GET /api/finance/payments?order_by=id;DROP TABLE finance.payments` → must fall back to `created_at` and succeed.
   - Re-run AGENT-159's SQLi scanner over the patched ranges → expected 0 findings.

## Result

All 4 critical/high SQLi sites flagged in AGENT-205 are now closed using Drizzle parameterised template tags. The legacy `q(string)` and `s()` helpers remain in place for the 30+ adjacent handlers still out of scope, so the overall surface area is unchanged outside the patched ranges.
