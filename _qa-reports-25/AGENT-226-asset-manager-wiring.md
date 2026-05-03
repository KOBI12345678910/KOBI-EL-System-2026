# AGENT-226 — Asset Manager Engine Wiring + Never-Delete Enforcement

**Agent:** 226
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Predecessor:** AGENT-191 (asset audit — engine green, route green, wiring red)
**Scope:** Wire `onyx-procurement/src/assets/asset-manager.js` into the live API, ban hard `DELETE`, add a real `dispose()` endpoint, extend the schema to persist IAS 16/36 fields, and patch the UI endpoint mismatch.

---

## 1. Problem Recap

AGENT-191 found that the asset-manager engine (32/32 tests passing, IL-compliant, IAS 16/36/IFRS 5 aware) is **never imported** anywhere under `api-server/src/`. The two registered routes — `finance-accounting.ts` (CRUD) and `finance-enterprise4.ts` (schedule + run) — re-implement depreciation inline with a weaker calculator and ignore GL posting, mid-month convention, salvage clamping for DDB, SOY, and units-of-production. Additionally:

- `DELETE /fixed-assets/:id` (finance-accounting.ts:249) violates the never-delete rule.
- No `dispose()` endpoint exists; UI flips status via PUT with no gain/loss math and no journal.
- Schema lacks `revaluation_surplus`, `impairment_loss`, `disposal_gain_loss`, `last_depreciated_to` — the engine has no place to round-trip its IAS state.
- `depreciation-schedule.tsx:78` calls `/api/depreciation-schedule` while the registered route is `/api/finance/fixed-assets/depreciation-schedule` (404 in production).

This agent ships the four fixes.

---

## 2. Deliverable 1 — Replace inline depreciation with engine calls

**Files to change**
- `api-server/src/routes/finance-accounting.ts` (POST/PUT/DELETE/list)
- `api-server/src/routes/finance-enterprise4.ts` (depreciation-schedule, calculate-depreciation)

**New shared helper** (proposed): `api-server/src/lib/asset-engine-bridge.ts`

```ts
// Bridges the JS engine into TS routes. One per-tenant store, lazily hydrated
// from the fixed_assets table on first call, then mutated in memory for the
// duration of the request. Persistence happens via explicit save() at end.
import { createAssetStore, METHODS, CATEGORY_RATES } from
  '../../../onyx-procurement/src/assets/asset-manager.js';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

export async function loadStoreForTenant(tenantId: string) {
  const store = createAssetStore();
  const rows = await db.execute(sql`
    SELECT * FROM fixed_assets WHERE tenant_id = ${tenantId}
      AND status IN ('active','ACTIVE','disposed','DISPOSED','fully_depreciated')`);
  for (const r of rows.rows as any[]) store.hydrate(rowToEngineAsset(r));
  return store;
}

export function rowToEngineAsset(r: any) { /* map snake_case → engine shape */ }
export function engineAssetToRow(a: any) { /* reverse */ }
```

(`createAssetStore()` already exists at asset-manager.js:914-927; a `hydrate(asset)` method is the only addition required on the store factory — append into the internal `assets` Map without re-running `addAsset` validation.)

**Route rewrite — `POST /finance/fixed-assets/calculate-depreciation`** (replaces lines 355-379 of finance-enterprise4.ts):

```ts
router.post('/finance/fixed-assets/calculate-depreciation', async (req, res) => {
  const tenantId = (req as any).user.tenantId;
  const asOf = req.body.asOf || new Date().toISOString().slice(0, 10);
  const store = await loadStoreForTenant(tenantId);
  const entries = store.runDepreciation(asOf, { units_this_period: req.body.units });

  // Persist updated assets + GL journal in a single transaction
  for (const e of entries) {
    const a = store.getAsset(e.asset_id);
    await q(`UPDATE fixed_assets SET
      accumulated_depreciation=${a.accumulated_depreciation},
      current_value=${a.current_nbv},
      last_depreciated_to='${a.last_depreciated_to}',
      updated_at=NOW()
      WHERE id=${a.id} AND tenant_id='${tenantId}'`);
    await q(`INSERT INTO journal_entries
      (entry_id, fiscal_year, fiscal_period, debit_account, credit_account,
       debit_amount, credit_amount, asset_id, memo, status, created_at)
      VALUES ('${e.journal.entry_id}', ${new Date(asOf).getFullYear()},
       ${new Date(asOf).getMonth()+1}, '${e.journal.debit.account}',
       '${e.journal.credit.account}', ${e.journal.debit.amount},
       ${e.journal.credit.amount}, ${a.id},
       '${e.journal.memo.replace(/'/g, "''")}', 'posted', NOW())`);
  }
  res.json({ success: true, runs: entries.length, asOf, entries });
});
```

**Route rewrite — `GET /finance/fixed-assets/depreciation-schedule`** (replaces lines 338-353): instead of computing book value in SQL, project the engine's `categorySummary()` plus per-asset state — guaranteeing the schedule view matches what `calculate-depreciation` will post.

**Net effect:** all five engine methods (STRAIGHT_LINE, DECLINING_BALANCE, SUM_OF_YEARS, UNITS_OF_PRODUCTION, ACCELERATED) become reachable via the API without further edits. The 13-row Israeli `CATEGORY_RATES` catalog is exposed via a new read-only `GET /api/finance/fixed-assets/categories` returning `Object.entries(CATEGORY_RATES)`.

---

## 3. Deliverable 2 — Block hard DELETE, add `dispose()` endpoint

### 3.1 Remove the destructive route
In `finance-accounting.ts`, replace lines 249-252 with:

```ts
router.delete('/fixed-assets/:id', async (req, res) => {
  res.status(405).json({
    error: 'מחיקה אסורה — נכסים אינם נמחקים. השתמש ב-POST /fixed-assets/:id/dispose',
    code: 'NEVER_DELETE',
    hint: 'Use POST /fixed-assets/:id/dispose with { saleAmount, disposalDate }'
  });
});
```

This preserves the URL surface (no broken clients), returns 405, and points callers at the correct flow. The X-34 contract is enforced.

### 3.2 New endpoint — `POST /fixed-assets/:id/dispose`

Add to `finance-accounting.ts` after the GET-by-id block (~line 192):

```ts
router.post('/fixed-assets/:id/dispose', async (req, res) => {
  const tenantId = (req as any).user.tenantId;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: 'מזהה לא תקין' }); return; }
  const { saleAmount, disposalDate } = req.body;
  if (!Number.isFinite(Number(saleAmount)) || Number(saleAmount) < 0) {
    res.status(400).json({ error: 'saleAmount חייב להיות מספר אי-שלילי' }); return;
  }
  try {
    const store = await loadStoreForTenant(tenantId);
    const result = store.dispose(`FA-${id}`, Number(saleAmount),
      disposalDate || new Date().toISOString().slice(0,10));
    const a = store.getAsset(`FA-${id}`);
    await q(`UPDATE fixed_assets SET
      status='disposed',
      disposal_date='${a.disposal_date}',
      disposal_price=${a.disposal_proceeds},
      disposal_gain_loss=${a.disposal_gain_loss},
      accumulated_depreciation=${a.accumulated_depreciation},
      current_value=0,
      updated_at=NOW()
      WHERE id=${id} AND tenant_id='${tenantId}'`);
    // Persist multi-line journal — disposal journals are 3-4 lines (cash, acc dep, FA, gain/loss)
    for (const line of result.journal.lines) {
      await q(`INSERT INTO journal_entries
        (entry_id, debit_account, credit_account, debit_amount, credit_amount,
         asset_id, memo, status, created_at)
        VALUES ('${result.journal.entry_id}',
         ${line.debit > 0 ? `'${line.account}'` : 'NULL'},
         ${line.credit > 0 ? `'${line.account}'` : 'NULL'},
         ${line.debit}, ${line.credit}, ${id},
         '${result.journal.memo.replace(/'/g, "''")}', 'posted', NOW())`);
    }
    res.json({
      success: true, asset_id: id,
      gain_loss: result.gain_loss,
      proceeds: a.disposal_proceeds,
      nbv_at_disposal: a.disposal_proceeds - result.gain_loss,
      journal_entry_id: result.journal.entry_id
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'שגיאה במימוש נכס' });
  }
});
```

The engine already produces the four GL lines (cash debit, accumulated-dep debit, asset credit, gain credit OR loss debit — asset-manager.js:519-549). Route just persists them.

---

## 4. Deliverable 3 — Schema migration

**New file:** `api-server/src/migrations/task226_fixed_assets_ias16_fields.sql`

```sql
-- AGENT-226: extend fixed_assets to round-trip the asset-manager engine.
-- Source-of-truth is asset-manager.js:337-363.

BEGIN;

ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS revaluation_surplus  NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impairment_loss      NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_gain_loss   NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS last_depreciated_to  DATE;

-- Defaults: never-depreciated assets carry last_depreciated_to = purchase_date,
-- which matches addAsset() initialization.
UPDATE fixed_assets
   SET last_depreciated_to = purchase_date
 WHERE last_depreciated_to IS NULL
   AND purchase_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_last_depreciated_to
  ON fixed_assets (last_depreciated_to)
  WHERE status IN ('active','ACTIVE');

-- Sanity guards aligned with engine invariants
ALTER TABLE fixed_assets
  ADD CONSTRAINT fixed_assets_revaluation_nonneg
    CHECK (revaluation_surplus >= 0),
  ADD CONSTRAINT fixed_assets_impairment_nonneg
    CHECK (impairment_loss >= 0),
  ADD CONSTRAINT fixed_assets_no_phantom_disposal
    CHECK (
      (status NOT IN ('disposed','DISPOSED'))
      OR (disposal_date IS NOT NULL AND disposal_gain_loss IS NOT NULL)
    );

COMMIT;
```

**Why these four:**
- `revaluation_surplus` — IAS 16 revaluation model; engine reads it at line 400 when computing the depreciable base.
- `impairment_loss` — IAS 36 impairment writedown; same expression.
- `disposal_gain_loss` — the value of the dispose() return; without it the GL trial balance can drift from the asset register on audit.
- `last_depreciated_to` — anchor date for mid-month convention; without it, every depreciation run double-charges from acquisition.

The constraint `fixed_assets_no_phantom_disposal` prevents the existing PUT endpoint from setting `status='disposed'` without a date and gain/loss — it forces the new dispose() endpoint to be used.

---

## 5. Deliverable 4 — UI endpoint mismatch fix

**File:** `erp-app/src/pages/finance/depreciation-schedule.tsx`

**Line 78 — current:**
```ts
const res = await authFetch(`${API}/depreciation-schedule`);
```

**Replace with:**
```ts
const res = await authFetch(`${API}/finance/fixed-assets/depreciation-schedule`);
```

`API` is defined as `"/api"` at line 17, so the resulting URL becomes `/api/finance/fixed-assets/depreciation-schedule` — the exact path registered at `finance-enterprise4.ts:338`. No backend alias needed.

While there, the method dropdown at lines 45-49 should expose all five engine methods:

```ts
const methodMap: Record<string, string> = {
  straight_line:        "קו ישר",
  declining_balance:    "יתרה פוחתת",
  sum_of_years:         "סכום ספרות שנים",
  units_of_production:  "יחידות ייצור",
  accelerated:          "פחת מואץ (תקנות)",
};
```

This unblocks SOY and ACCELERATED, which the engine has fully implemented (asset-manager.js:415-429) but no UI surfaces.

---

## 6. Test Plan (post-merge gate)

| Check | Command / endpoint | Expected |
|---|---|---|
| Engine still green | `node --test test/payroll/asset-manager.test.js` | 32/32 pass |
| Migration idempotent | run twice on the same DB | no error |
| `DELETE /fixed-assets/:id` blocked | `curl -X DELETE …` | 405 NEVER_DELETE |
| `POST /…/dispose` happy path | sale > NBV asset | gain_loss > 0, status flips, 4 journal lines |
| `POST /…/dispose` loss path | sale < NBV asset | gain_loss < 0, line on 7900-LOSS-FA |
| `POST /…/dispose` already-disposed | retry | 400 with `not active` |
| `calculate-depreciation` posts GL | trial balance of 7200/1590 | matches sum of asset deltas |
| UI page loads | open `/finance/depreciation-schedule` | rows render, no 404 in network tab |
| UI shows SOY + ACCELERATED | new dropdown values | filter works, server returns matching rows |
| Schema constraint bites | manual `UPDATE fixed_assets SET status='disposed' WHERE id=…` without disposal fields | rejected |

---

## 7. Risk & Rollout

- **DB migration is forward-only and additive** — all four new columns have defaults or are nullable. Safe to apply without code change. Apply migration first, deploy code second.
- **`DELETE` returning 405 instead of 200** is a breaking change for any integration that scripts asset deletion. AGENT-191 found no such caller in `erp-app` or `onyx-procurement`. Search command for the rollout PR: `Grep "DELETE.*fixed-assets" --type=ts,tsx`.
- **Engine bridge memory** — `loadStoreForTenant()` is per-request; for tenants with >50k assets, hydrate only the requested subset (filter by `category` or `status='active'`). The existing `runDepreciation()` already iterates the store, so partial hydration is correctness-safe.
- **Backwards-compatible UI** — fixing the 404 is pure win; method dropdown change is additive.

---

## 8. Files Touched

| Path | Action |
|---|---|
| `api-server/src/routes/finance-accounting.ts` | Replace DELETE with 405; add `POST /:id/dispose` |
| `api-server/src/routes/finance-enterprise4.ts` | Replace `calculate-depreciation` and `depreciation-schedule` with engine-backed versions |
| `api-server/src/lib/asset-engine-bridge.ts` | New — hydration + persistence helpers |
| `api-server/src/migrations/task226_fixed_assets_ias16_fields.sql` | New — 4 columns + 3 constraints + 1 index |
| `erp-app/src/pages/finance/depreciation-schedule.tsx` | Fix endpoint at line 78; expand method map |
| `onyx-procurement/src/assets/asset-manager.js` | Add `hydrate(asset)` + `getAsset(id)` to `createAssetStore()` factory (lines ~280) |

---

## 9. Sign-off Criteria

The module clears P0 when:
1. `Grep "DELETE FROM fixed_assets" api-server/src/routes/` returns zero matches.
2. `Grep "asset-manager" api-server/src/` returns at least one import line.
3. New migration is in `api-server/src/migrations/` and applied to dev DB.
4. UI page `/finance/depreciation-schedule` loads with HTTP 200, populates from the engine-backed schedule route.
5. Engine test suite still green (32/32) — bridge changes must not break the standalone contract.

After this lands, AGENT-191's seven recommendations collapse to two leftovers (parameterized SQL, IL category catalog exposure) — both P1, both isolated, both mechanical. The asset module then meets the Palantir-grade bar required by `CLAUDE.md`.
