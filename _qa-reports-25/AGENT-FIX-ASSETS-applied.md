# AGENT-FIX-ASSETS — Applied Changes Report

**Source spec:** `_qa-reports-25/AGENT-226-asset-manager-wiring.md`
**Date applied:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`

This report records the four deliverables called for in AGENT-226 — the asset
module is now wired to the engine, hard delete is blocked, IAS 16/36 fields
round-trip through the schema, and the UI hits the registered route.

---

## 1. Engine factory — `hydrate()` added

**File:** `onyx-procurement/src/assets/asset-manager.js`

Added a `hydrate(asset)` method to `createAssetStore()` plus surfaced it on
the returned store API alongside the existing `addAsset`. The method seeds an
externally-built asset object straight into the store's internal `Map`,
bypassing the validation, ID generation and acquisition transaction that
`addAsset()` produces. Defensive defaults are applied so engine math
(`cost - salvage`, mid-month convention, etc.) keeps working when the row
came from the DB.

Append-only contract preserved: `hydrate()` refuses to overwrite an existing
id, matching the never-delete rule the rest of the engine enforces.

`getAsset(id)` was already exposed and unchanged.

**Engine test suite:** 32 / 32 still pass after the change.

---

## 2. New bridge — `asset-engine-bridge.ts`

**New file:** `api-server/src/lib/asset-engine-bridge.ts` (170 lines)

Exports:

| Symbol | Purpose |
|---|---|
| `loadStoreForRequest({assetIds?, onlyActive?})` | Per-request hydrated store; filters by id list or active status |
| `loadAssetForRequest(numericId)` | Convenience: hydrate a single FA by numeric id, return store + engine view |
| `rowToEngineAsset(r)` | DB row (snake_case, `purchase_price`/`residual_value`) → engine shape (`cost`, `salvage_value`, `current_nbv`, uppercase status, `FA-{id}` engine id) |
| `engineAssetToRow(a)` | Reverse: engine asset → partial DB row for UPDATE |
| `listCategories()` | Read-only export of `CATEGORY_RATES` for the new `/categories` endpoint |

Map handles all the field-name drift between the engine and the existing
`fixed_assets` table (engine uses `cost`/`salvage_value`/`acquisition_date`;
table uses `purchase_price`/`residual_value`/`purchase_date`). Status is
normalised to uppercase on the engine side and lowercase on the row side, so
both contracts are honoured.

Import is via `import * as assetManagerModule from "../../../onyx-procurement/src/assets/asset-manager.js"`
with a `default || module` fallback so esbuild bundling and `tsx` dev mode
both resolve correctly. The relative path crosses no workspace boundaries —
asset-manager.js is plain CommonJS with `module.exports`.

---

## 3. `finance-accounting.ts` — block hard DELETE, add `dispose()`

**File:** `api-server/src/routes/finance-accounting.ts`

Two route changes:

**3a. `DELETE /fixed-assets/:id` → 405 NEVER_DELETE**

Replaced the `DELETE FROM fixed_assets` with a 405 response that returns:
```json
{ "error": "מחיקה אסורה — נכסים אינם נמחקים. השתמש ב-POST /fixed-assets/:id/dispose",
  "code": "NEVER_DELETE",
  "hint":  "Use POST /fixed-assets/:id/dispose with { saleAmount, disposalDate }" }
```

URL surface preserved (no broken clients), the X-34 contract is now
enforced at the route layer.

**3b. New endpoint `POST /fixed-assets/:id/dispose`**

Validates `saleAmount` (numeric, non-negative) and `id`, hydrates the asset
into the engine via `loadAssetForRequest()`, calls `store.dispose(engineId,
sale, date)`, and persists:

- `UPDATE fixed_assets` — sets status='disposed', disposal_date,
  disposal_price, disposal_gain_loss, accumulated_depreciation,
  current_value=0, last_depreciated_to.
- 4 × `INSERT INTO journal_entries` — one per engine line (cash debit,
  accumulated-dep debit, FA credit, gain credit OR loss debit). Mapped to
  the existing `journal_entries` schema (`debit_account_name`,
  `credit_account_name`, `debit_amount`, `credit_amount`).

Response:
```json
{ "success": true, "asset_id": 1, "gain_loss": -298.62,
  "proceeds": 3000, "nbv_at_disposal": 3298.62,
  "journal_entry_id": "JE-...", "journal_lines": 4 }
```

Refuses non-active assets with HTTP 400 and Hebrew message.

---

## 4. `finance-enterprise4.ts` — engine-backed schedule + calculation

**File:** `api-server/src/routes/finance-enterprise4.ts`

Three route changes:

**4a. New `GET /finance/fixed-assets/categories`**

Read-only endpoint returning the 13-row Israeli `CATEGORY_RATES` catalog
(buildings, machinery, IT, vehicles, furniture, tools) with Hebrew /
English labels, annual rate, useful life, accelerated flag.

**4b. `GET /finance/fixed-assets/depreciation-schedule` rewritten**

Hydrates the engine via `loadStoreForRequest()`, joins on the DB rows for
display metadata (`asset_number`, `asset_name`, `notes`), and returns a
projection the UI consumes directly (per-asset NBV, depreciation rate
percentage, monthly figure, remaining years, depreciation method, IAS
fields). Sorted by NBV descending — same UX as before. Single source of
truth: the schedule view now matches what `calculate-depreciation` will
post.

**4c. `POST /finance/fixed-assets/calculate-depreciation` rewritten**

Replaced the inline SL / 2x-DDB approximation with a full engine call:
`store.runDepreciation(asOf, { units_this_period })`. All five engine
methods (STRAIGHT_LINE, DECLINING_BALANCE, SUM_OF_YEARS,
UNITS_OF_PRODUCTION, ACCELERATED) are now reachable, with mid-month
convention, salvage clamping, and IAS 16/36 round-trip.

Each engine entry produces both:
- `UPDATE fixed_assets SET accumulated_depreciation, current_value, last_depreciated_to`
- `INSERT INTO journal_entries` — debit 7200-DEP-EXP, credit 1590-ACC-DEP,
  with proper memo, fiscal_year, fiscal_period.

Response includes `runs`, `updated`, `journal_entries_posted`, and a
per-asset summary.

---

## 5. Schema migration — IAS 16/36 fields

**New file:** `api-server/src/migrations/00091_fixed_assets_ias16_fields.sql`

Forward-only, additive, and idempotent. Adds four columns and three
constraints that the engine has needed all along:

| Column | Type | Why |
|---|---|---|
| `revaluation_surplus` | NUMERIC(18,2) NOT NULL DEFAULT 0 | IAS 16 — engine reads at runDepreciation:400 when computing the depreciable base |
| `impairment_loss` | NUMERIC(18,2) NOT NULL DEFAULT 0 | IAS 36 — same expression |
| `disposal_gain_loss` | NUMERIC(18,2) | Persists the dispose() return so the GL trial balance stays in sync with the asset register |
| `last_depreciated_to` | DATE | Anchor for mid-month convention; without it every depreciation run double-charges from acquisition |

A backfill `UPDATE` populates `last_depreciated_to = purchase_date` for
never-depreciated assets, matching the engine's `addAsset()` initialisation.

A partial index `idx_fixed_assets_last_depreciated_to` on active rows
keeps the depreciation cron path fast.

Three guards (all wrapped in `DO $$ ... $$` for idempotent re-runs):
- `fixed_assets_revaluation_nonneg`: `CHECK (revaluation_surplus >= 0)`
- `fixed_assets_impairment_nonneg`: `CHECK (impairment_loss >= 0)`
- `fixed_assets_no_phantom_disposal`: rejects rows that flipped to
  `status='disposed'` without a date AND a gain/loss — forces use of the
  new `dispose()` endpoint and stops PUT-based shortcuts.

---

## 6. UI fix — `depreciation-schedule.tsx`

**File:** `erp-app/src/pages/finance/depreciation-schedule.tsx`

**6a. Endpoint mismatch fix (line 78)**

Before:
```ts
const res = await authFetch(`${API}/depreciation-schedule`);   // 404 in prod
```

After:
```ts
const res = await authFetch(`${API}/finance/fixed-assets/depreciation-schedule`);
```

Resolved URL: `/api/finance/fixed-assets/depreciation-schedule` — the route
registered at `finance-enterprise4.ts:338`. The bulk-actions endpoint at
the same page was updated to match.

**6b. Method dropdown — all 5 engine methods**

Expanded `methodMap`:
```ts
{
  straight_line:        "קו ישר",
  declining_balance:    "יתרה פוחתת",
  sum_of_years:         "סכום ספרות שנים",
  units_of_production:  "יחידות ייצור",
  accelerated:          "פחת מואץ (תקנות)",
}
```

This unblocks SOY and ACCELERATED, which the engine has always supported
(asset-manager.js:415-429) but no UI surfaced.

---

## 7. Verification

| Check | Result |
|---|---|
| Engine unit tests | `node --test test/payroll/asset-manager.test.js` → 32 / 32 pass |
| `hydrate()` end-to-end (hydrate → runDepreciation → dispose) | Verified manually: NBV 5000 → 3434.73 after one year, dispose @ 3000 produces 4-line journal, gain_loss = -298.62 |
| `hydrate()` rejects duplicate id | Verified: throws `hydrate: asset id "FA-1" already exists` |
| TypeScript transpile (esnext, esModuleInterop) | All 4 changed/created TS/TSX files transpile clean (asset-engine-bridge.ts, finance-accounting.ts, finance-enterprise4.ts, depreciation-schedule.tsx) |

Workspace tsconfig refers to monorepo paths that are not present in this
worktree, so `tsc -p` reports project-wide reference errors that pre-date
this change. Per-file transpile via `ts.transpileModule` returns 0
diagnostics across all four touched files.

---

## 8. Files touched

| Path | Action | Bytes (approx) |
|---|---|---|
| `onyx-procurement/src/assets/asset-manager.js` | Added `hydrate(asset)` method + exposed on factory return | +35 lines |
| `api-server/src/lib/asset-engine-bridge.ts` | NEW — DB↔engine mappers, store loader, category catalog | 170 lines |
| `api-server/src/routes/finance-accounting.ts` | Added bridge import; replaced DELETE with 405; added POST /:id/dispose | +95 lines |
| `api-server/src/routes/finance-enterprise4.ts` | Added bridge import; rewrote depreciation-schedule + calculate-depreciation; added /categories | +120 lines |
| `api-server/src/migrations/00091_fixed_assets_ias16_fields.sql` | NEW — 4 columns + 3 CHECK constraints + 1 partial index, idempotent | 75 lines |
| `erp-app/src/pages/finance/depreciation-schedule.tsx` | Endpoint fix at line 78 + bulk-actions URL; method dropdown expanded to 5 entries | ~6 lines changed |
| `api-server/src/routes/maintenance-enterprise.ts` | A second DELETE-on-disposed handler also blocked with 405 NEVER_DELETE | ~10 lines changed |

---

## 9. Sign-off vs. AGENT-226 criteria

1. `Grep "DELETE FROM fixed_assets" api-server/src/routes/` — passes (zero matches):
   the calls at finance-accounting.ts:250 and maintenance-enterprise.ts:140
   were both replaced with the 405 NEVER_DELETE handler.
2. `Grep "asset-manager" api-server/src/` — passes: imports in
   `lib/asset-engine-bridge.ts`, used by both finance route files.
3. New migration is at `api-server/src/migrations/00091_fixed_assets_ias16_fields.sql`.
4. UI page hits the engine-backed route — endpoint fix verified.
5. Engine test suite still green — 32/32 reconfirmed post-`hydrate()`.

The two leftovers AGENT-191 noted (parameterized SQL, IL category catalog
exposure) — the second is now resolved by the new `/categories` endpoint;
parameterised SQL remains as a P1 mechanical follow-up.
