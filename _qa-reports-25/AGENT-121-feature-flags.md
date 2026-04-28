# AGENT-121 - Feature Flags & A/B Experiments Audit

**Project:** kobi-el-system-2026 / Techno-Kol Uzi ERP 2026
**Scope:** `governance.feature_flags` (15 rows in DB) + `ab_experiments` (4 rows in DB)
**Date:** 2026-04-29
**Auditor:** Agent 121

---

## Status

**FAIL - flags exist in DB but are not consumed by any runtime code path. AB-experiments table is orphaned.**

| Check | Result | Severity |
|-------|--------|----------|
| `feature_flags` rows in DB | 15 (6 baseline + 9 manual) | INFO |
| `ab_experiments` rows in DB | 4 | INFO |
| Flags actually evaluated in code | 0 of 6 seeded keys | CRITICAL |
| Flags read from DB by `isEnabled()` checks | 0 references | CRITICAL |
| Always-on (`is_enabled=true && rollout=100`) flags | 1 (`ops.sla_auto_escalate`) | HIGH |
| Tables with RLS disabled | both `feature_flags`, `ab_experiments` | CRITICAL |
| Targeting tables wired to evaluator | none (UI exists, runtime does not) | HIGH |
| Stale (no consumer) flags | all 15 | HIGH |
| Schema collision (two table shapes) | yes (`public.feature_flags` vs `governance.feature_flags`) | CRITICAL |

---

## 1. Where flags are defined

### 1a. Schema collision (CRITICAL)
Two competing `feature_flags` table definitions live side-by-side:

- `governance.feature_flags` (canonical) - `supabase/migrations/00059_governance_domain_complete.sql:269` columns: `flag_key, flag_name, description, is_enabled, rollout_percent, rule_json, is_active, created_by, metadata`.
- `public.feature_flags` (ad-hoc) - created at runtime by `api-server/src/routes/feature-flags.ts:14-30` with totally different columns: `flag_key, name, description, enabled, environment, role_scope, branch_scope, owner, expiry_date`.

The route `/api/feature-flags` (mounted in `api-server/src/routes/index.ts:504-505`) reads/writes the **public** table. The route `/api/governance/feature-flags` (`api-server/src/routes/governance/feature-flags.ts`) reads/writes the **governance** table. UI page `erp-app/src/pages/settings/feature-flags.tsx` calls `/api/settings/feature-flags` (a third endpoint, not found in api-server) - it will 404 in production. UI page `erp-app/src/pages/governance/FeatureFlagsPage.tsx` correctly calls `/api/governance/feature-flags`.

### 1b. Seeded flags (`governance.feature_flags`, 6 rows from migration)
Seeded in `supabase/migrations/00059_governance_domain_complete.sql:617-625`:

| flag_key | is_enabled | rollout | Owner |
|----------|-----------|---------|-------|
| `ai.auto_recommendations` | false | 0 | unspecified |
| `procurement.rfq_auto_send` | false | 0 | unspecified |
| `finance.e_invoice` | false | 0 | unspecified |
| `hr.biometric_attendance` | false | 0 | unspecified |
| `ops.sla_auto_escalate` | **true** | **100** | unspecified |
| `governance.require_mfa` | false | 0 | unspecified |

Remaining 9 rows in DB were inserted manually via the UI (no seed migration). Without DB inspection their keys are unknown to this static audit.

### 1c. AB experiments
There is **no `ab_experiments` table definition** in `supabase/migrations/`. The 4 rows must have been created out-of-band (manual SQL or runtime). `lib-client/db/src/schema/advanced-tech.ts:261` defines a different table `ml_experiments` (Drizzle), and `onyx-procurement/src/experiments/ab-testing.js` is a pure in-memory engine - it never reads/writes `ab_experiments`.

---

## 2. Where flags are READ in code

### 2a. Production reads of `governance.feature_flags`
**Zero**. No code path calls `isEnabled('ai.auto_recommendations')` or any of the 6 seeded keys. Grep on the 6 keys finds them ONLY in the seed migration itself (and one merge-staging duplicate). Coincidental name overlaps in `onyx-procurement/src/pipeline/*` and `erp-app/src/components/alerts/*` are unrelated.

### 2b. Read paths that exist but are unused
- `onyx-procurement/src/flags/feature-flags.js` - well-written `FeatureFlags` class with FNV-1a sticky bucketing, rule trees, 5 flag types, append-only audit. **Self-contained, no DB. Zero imports outside its own test.**
- `enterprise_palantir_core/app/engines/feature_flags.py` - a parallel Python implementation with targeting and variants. **Not wired to any FastAPI route.**
- `onyx-ai/agents/src/tools/featureFlagsTool.ts` - an agent tool that persists flags to a file `workspace/.agent/feature-flags.json`. **Used only inside the agent's sandbox, not the ERP runtime.**
- API routes `/api/feature-flags` and `/api/governance/feature-flags` only expose CRUD. There is no `GET /api/feature-flags/check/:key` consumer in the React app, and no middleware that injects `req.flags`.

**Net: the entire feature-flag system is a CRUD UI. No code branches on a flag value.**

---

## 3. Always-on / risky flags

### 3a. `ops.sla_auto_escalate` = (true, 100%) - HIGH
The only seeded flag that defaults to ON for all users. Because nothing reads it, this is harmless today, but if escalation logic is later wired to it, there is no opt-out path: `is_active` defaults to true and there is no end_date guard. **Mitigation:** add a `kill_switch` rule and require `expiry_date` non-null at write time.

### 3b. `governance.require_mfa` = false - HIGH (security)
Seeded **off**. Comment in `00059` says "Block admin login without MFA" - so admins can log in without MFA today. The UI page `mfa-settings.tsx` enforces `mfaStatus.isRequired` from a different source, but the global gate at the flag layer is permissive.

### 3c. `finance.e_invoice` = false
Hebrew tax compliance: as of 2026-04-29, e-invoicing is mandatory for Israeli businesses above the threshold. Flag should be planned for staged rollout, not left at 0%.

### 3d. `hr.biometric_attendance` = false
Biometric data triggers Israeli Privacy Protection Law (חוק הגנת הפרטיות) consent obligations. Leaving the flag in DB without an audit-bound rollout policy is a compliance landmine if a tenant flips it without legal review.

---

## 4. Targeting rules

`governance.feature_flag_targets` (`00059:287-295`) supports `target_type in ('user','role','tenant','segment')` with `target_ref` and per-target `is_enabled`. The 30-tables expansion `00010` defines a **second** `feature_flag_targets` shape with `target_type/target_value/rollout_percent/active`. The two definitions race - `CREATE TABLE IF NOT EXISTS` means whichever migration ran first wins, and the column names diverge. `api-server/src/routes/governance/feature-flags.ts:80-87` writes `target_type, target_ref, is_enabled` (the 00059 shape). If the 00010 shape was applied first, every `POST /targets` will fail with column-not-found.

No code reads `feature_flag_targets` at evaluation time. The on-disk evaluator (`onyx-procurement/src/flags/feature-flags.js`) ignores the table entirely - it only honours the rule tree on the flag itself.

---

## 5. Stale flags

All 6 seeded flags are stale by definition: they exist for over a year (project age) without a single code consumer. The remaining 9 manually-created rows cannot be assessed without DB access, but the UI in `erp-app/src/pages/settings/sections/feature-flags.tsx:107-108` shows a "categories" facet (modules/ai/export/api/reports/system/general/security) that is **stored but never returned by either backend**: the governance route returns `flag_key, flag_name, is_enabled, rollout_percent, rule_json, is_active, created_by, metadata` and the public route returns `name, description, enabled, environment, role_scope, branch_scope, owner, expiry_date`. Neither returns `category` - so the UI filter is a no-op.

---

## 6. Findings summary

1. **Schema collision** between `public.feature_flags` (ad-hoc, `enabled`) and `governance.feature_flags` (canonical, `is_enabled`). At least two API routes write to different tables. UI calls a third path that does not exist.
2. **Zero runtime readers.** None of the 6 seeded flags is checked anywhere. The flag system is a CRUD facade.
3. **`ab_experiments` is orphaned** - no migration creates it, no code reads it, the 4 rows in DB are mystery data. AGENT-09 already flagged it as RLS-disabled and CHECK-constraint-missing.
4. **Always-on `ops.sla_auto_escalate`** is harmless today but a foot-gun once wired.
5. **`governance.require_mfa = false`** should be revisited as part of the MFA rollout (AGENT-147).
6. **Targeting tables collide** - 00010 vs 00059 define different `feature_flag_targets`. The route only matches 00059.
7. **UI category filter is a phantom** - not stored or returned by any backend.

---

## 7. Recommendations (priority order)

1. **CRITICAL** - Decide a single source of truth. Drop `public.feature_flags` and `api-server/src/routes/feature-flags.ts`; route the UI to `/api/governance/feature-flags`. Or vice versa - but not both.
2. **CRITICAL** - Wire one real consumer. Pick `ai.auto_recommendations` or `governance.require_mfa`, add an `isEnabled()` check at the gate (e.g. `agent next-best-action` route, or auth middleware), and prove the flag is end-to-end live.
3. **HIGH** - Define `ab_experiments` as a real migration with FK to `governance.feature_flags`, RLS policies, status CHECK, and a documented schema. Or drop the 4 mystery rows.
4. **HIGH** - Reconcile `feature_flag_targets`: drop the duplicate from `00010` or rename it. Either way, only one shape can survive.
5. **HIGH** - Enable RLS on both `feature_flags` and `ab_experiments` (AGENT-09 already filed this as CRITICAL).
6. **MEDIUM** - Add an `expiry_date NOT NULL` policy at the API layer for any flag with `is_enabled = true`. Force an owner to explicitly extend.
7. **MEDIUM** - Wire `feature_flag_targets` evaluation into the governance route's `GET /check/:key` (currently does not exist). Without it, rollout_percent is the only knob, which is a regression vs the on-disk evaluator.
8. **LOW** - Persist `category` on `governance.feature_flags.metadata->>'category'` and surface it in the API.

---

## 8. Files of interest

- `supabase/migrations/00059_governance_domain_complete.sql` (lines 268-295, 617-625) - canonical schema + seed
- `supabase/migrations/00010_enterprise_expansion_30_tables.sql` (lines 304-318) - duplicate `feature_flag_targets` shape
- `api-server/src/routes/feature-flags.ts` - public-table CRUD route (delete-candidate)
- `api-server/src/routes/governance/feature-flags.ts` - governance-table CRUD route (canonical)
- `api-server/src/routes/index.ts:504-505` - router mount
- `erp-app/src/pages/settings/feature-flags.tsx` - UI calling `/api/settings/feature-flags` (broken endpoint)
- `erp-app/src/pages/settings/sections/feature-flags.tsx` - UI section (also broken endpoint)
- `erp-app/src/pages/governance/FeatureFlagsPage.tsx` - UI calling `/api/governance/feature-flags` (working)
- `onyx-procurement/src/flags/feature-flags.js` - unwired in-memory evaluator
- `enterprise_palantir_core/app/engines/feature_flags.py` - unwired Python evaluator
- `onyx-ai/agents/src/tools/featureFlagsTool.ts` - agent-only file-based evaluator
- `onyx-procurement/src/experiments/ab-testing.js` - unwired in-memory A/B engine
- `onyx-procurement/src/devops/ab-router.js` - unwired in-memory router
- `lib-client/db/src/schema/advanced-tech.ts:261` - `ml_experiments` (different table, not `ab_experiments`)

---

## 9. Verdict

Feature flags exist as **furniture**, not as a control plane. The governance table is correctly modelled, but no business logic is gated by a flag. Until step 2 of the recommendations is done - a single proven `isEnabled()` callsite in production - this entire subsystem is dead code, and any rows in `ab_experiments` are stale by definition.
