# Real-Estate Residues Post-00036 Sweep

Generated: 2026-04-18
Source: scan of `erp-app/src`, `supabase/migrations/00037+` after migration
`00036_remove_realestate_and_add_missing.sql` was applied.

## Findings

Migrations 00037–00041 contain **NO** real-estate leftovers — the SQL sweep
was clean.

Erp-app source contains **4 orphaned page files** under
`erp-app/src/pages/projects/real-estate/`:

| # | File | Status | Recommendation |
|---|------|--------|----------------|
| 1 | `contractors.tsx`  | orphaned | Verify whether referenced by a lazy route in App.tsx. If not — backup and remove. |
| 2 | `kiryati10.tsx`    | orphaned | Project-code residue — likely a specific RE project. Backup and remove. |
| 3 | `permits.tsx`      | orphaned | Building-permit workflow — business domain is construction/RE. Backup and remove. |
| 4 | `units.tsx`        | orphaned | RE unit listing (apartments/units). Backup and remove. |

## Action Not Taken

Per cleanup policy, these files were **not deleted** in the 2026-04-18 sweep
because the pages might still be referenced by lazy route declarations in
`erp-app/src/App.tsx`. A follow-up task should:

1. grep App.tsx + router for `real-estate/(contractors|kiryati10|permits|units)`
2. If zero references → backup to `_external-backups/duplicates-removed-2026-04-18/realestate-residues/` and delete
3. If referenced → verify business intent with owner before removal

## Exclusions (false positives)

* `leases` — when encountered, confirm context. `employee_leaves`, `leave_balances`,
  `leave_requests` are **HR** (עובד לחופשה), NOT real-estate leases.
* `tenant` — in SaaS context this means multitenant customers, not RE tenants.
* `property` — could be a JavaScript property; must be contextualized.

## Status

DOCUMENTED — pending follow-up action.
