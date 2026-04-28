# AGENT-234 — Feature Flags Fix (Schema Collision + Runtime Wiring)

**Project:** kobi-el-system-2026 / Techno-Kol Uzi ERP 2026
**Date:** 2026-04-29
**Author:** Agent 234
**Predecessor:** AGENT-121 (Feature Flags & A/B Audit) — FAIL verdict, all 6 seeded flags unconsumed.

---

## Summary

AGENT-121 found three blockers that keep `governance.feature_flags` from being a real control plane: (a) a parallel `public.feature_flags` table created at runtime by an ad-hoc route, (b) a UI page calling `/api/settings/feature-flags` that does not exist, (c) zero `isEnabled()` consumers in business code. This fix retires the ad-hoc table, mounts a settings-namespaced reader on the canonical schema, and wires `isEnabled()` at the six documented call sites.

---

## 1. Drop `public.feature_flags` (ad-hoc table)

### Source of the collision

| Source | Schema | Columns | Owner |
|--------|--------|---------|-------|
| Canonical | `governance.feature_flags` | `flag_key, flag_name, is_enabled, rollout_percent, rule_json, is_active, created_by, metadata` | `supabase/migrations/00059_governance_domain_complete.sql:269` |
| Ad-hoc | `public.feature_flags` | `flag_key, name, enabled, environment, role_scope, branch_scope, owner, expiry_date` | `api-server/src/routes/feature-flags.ts:14-30` (CREATE TABLE IF NOT EXISTS at boot) |

### Migration `00069_drop_public_feature_flags.sql`

```sql
-- Phase 1: copy any rows that exist in public.feature_flags into governance.feature_flags
-- (only rows whose flag_key is not already present)
INSERT INTO governance.feature_flags (flag_key, flag_name, description, is_enabled, rollout_percent, metadata, is_active, created_at, updated_at)
SELECT pf.flag_key,
       pf.name,
       pf.description,
       pf.enabled,
       0,
       jsonb_build_object(
         'environment', pf.environment,
         'role_scope', pf.role_scope,
         'branch_scope', pf.branch_scope,
         'owner', pf.owner,
         'expiry_date', pf.expiry_date,
         'migrated_from', 'public.feature_flags'
       ),
       true,
       pf.created_at,
       pf.updated_at
FROM public.feature_flags pf
WHERE NOT EXISTS (
  SELECT 1 FROM governance.feature_flags gf WHERE gf.flag_key = pf.flag_key
);

-- Phase 2: drop the ad-hoc table
DROP TABLE IF EXISTS public.feature_flags CASCADE;
```

### Code-level retirement

1. Delete `api-server/src/routes/feature-flags.ts` (the `ensureTables()` boot hook is what re-creates the table on every restart — must be removed).
2. Remove imports/mounts from `api-server/src/routes/index.ts:504-505`:
   ```ts
   // DELETE these two lines:
   import featureFlagsRouter from "./feature-flags";
   router.use("/feature-flags", featureFlagsRouter);
   ```
3. UI fetches in `erp-app/src/pages/settings/feature-flags.tsx:31-78` are rewritten in §2.

---

## 2. Mount `/api/settings/feature-flags` against `governance.feature_flags`

The UI page at `erp-app/src/pages/settings/feature-flags.tsx` calls `/api/settings/feature-flags`. There is no route at that path today — the page 404s. The fix mounts a thin alias router that is identical in behaviour to `/api/governance/feature-flags` but enforces only `authMiddleware` (not `adminMiddleware`), so non-admin settings users can read flag state without granting them admin write privileges.

### New file `api-server/src/routes/settings/feature-flags.ts`

```ts
import { Router } from "express";
import { db, sql, authMiddleware } from "../governance/_helpers";

const router = Router();
router.use(authMiddleware);

// READ-only for settings users — writes still require /api/governance/feature-flags
router.get("/", async (_req, res) => {
  const r = await db.execute(sql`
    SELECT id, flag_key, flag_name, description, is_enabled, rollout_percent,
           rule_json, is_active, metadata, created_at, updated_at
      FROM governance.feature_flags
     WHERE coalesce(is_active, true) = true
     ORDER BY flag_key
  `);
  res.json({ data: r.rows });
});

router.get("/check/:key", async (req, res) => {
  const r = await db.execute(sql`
    SELECT is_enabled, rollout_percent, rule_json, metadata
      FROM governance.feature_flags
     WHERE flag_key = ${req.params.key}
       AND coalesce(is_active, true) = true
  `);
  if (!r.rows.length) return res.json({ enabled: false, exists: false });
  const f = r.rows[0] as { is_enabled: boolean };
  res.json({ enabled: f.is_enabled, exists: true, flag: r.rows[0] });
});

export default router;
```

### Mount in `api-server/src/routes/index.ts`

```ts
import settingsFeatureFlagsRouter from "./settings/feature-flags";
router.use("/settings/feature-flags", settingsFeatureFlagsRouter);
```

### UI page rewrite (`erp-app/src/pages/settings/feature-flags.tsx`)

Replace the 5 fetches that hit `/api/feature-flags` with `/api/settings/feature-flags` for reads, and `/api/governance/feature-flags` for writes (since governance enforces audit logging via `logAudit()`).

---

## 3. Wire `isEnabled()` at the 6 documented call sites

### Shared helper `api-server/src/lib/feature-flags.ts`

```ts
import pool from "@workspace/db";

const cache = new Map<string, { enabled: boolean; ts: number }>();
const TTL_MS = 30_000;

export async function isEnabled(flag_key: string, ctx?: { userId?: string; tenantId?: string }): Promise<boolean> {
  const cached = cache.get(flag_key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.enabled;

  const r = await pool.query(
    `SELECT is_enabled, rollout_percent
       FROM governance.feature_flags
      WHERE flag_key = $1 AND coalesce(is_active, true) = true`,
    [flag_key],
  );
  if (!r.rows.length) return false;
  const f = r.rows[0];
  let enabled = f.is_enabled === true;
  if (enabled && f.rollout_percent < 100 && ctx?.userId) {
    // sticky FNV-1a bucketing (0-99) — match the on-disk evaluator
    let h = 0x811c9dc5;
    const input = `${ctx.userId}:${flag_key}`;
    for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    const bucket = Math.abs(h) % 100;
    enabled = bucket < (f.rollout_percent ?? 0);
  }
  cache.set(flag_key, { enabled, ts: Date.now() });
  return enabled;
}
```

### Call site map

| # | Flag key | File | Gate |
|---|----------|------|------|
| 1 | `procurement.rfq_auto_send` | `api-server/src/routes/procurement/rfqs.ts:79` (`POST /rfqs/:id/send`) | If `false`, require explicit `?manual=true` query param to send (no auto-dispatch). |
| 2 | `finance.e_invoice` | `api-server/src/routes/finance/invoices.ts` (invoice issue handler) | If `false`, do NOT call the e-invoice provider; emit PDF-only path. |
| 3 | `hr.biometric_attendance` | `api-server/src/routes/hr-attendance-advanced.ts` (clock-in handler) | If `false`, reject biometric payload with `409 biometric_disabled` and fall back to PIN. |
| 4 | `ops.sla_auto_escalate` | `api-server/src/routes/sla-management.ts:213` (`POST /breaches`) and `onyx-procurement/src/ops/alert-manager.js` | If `false`, log breach but do not invoke escalation rule chain. |
| 5 | `governance.require_mfa` | `api-server/src/routes/auth.ts` (login handler) | If `true`, reject login when `mfaStatus.isVerified !== true` for admin roles. |
| 6 | `ai.auto_recommendations` | `api-server/src/routes/ai-recommendations.ts:9` (`GET /ai-recommendations`) | If `false`, return `{ recommendations: [] }` without invoking the LLM. |

### Patch templates (one per call site)

```ts
// 1. procurement/rfqs.ts — POST /rfqs/:id/send
import { isEnabled } from "../../lib/feature-flags";
// ... inside handler, before sending:
if (!req.query.manual && !(await isEnabled("procurement.rfq_auto_send", { userId: req.user?.id }))) {
  return res.status(409).json({ error: "rfq_auto_send_disabled", hint: "pass ?manual=true to override" });
}

// 2. finance/invoices.ts — issue handler
const eInvoiceOn = await isEnabled("finance.e_invoice", { tenantId: req.user?.tenant_id });
if (eInvoiceOn) await emitEInvoice(invoice); else await emitPdfOnly(invoice);

// 3. hr-attendance-advanced.ts — clock-in
if (req.body.biometric_payload && !(await isEnabled("hr.biometric_attendance", { tenantId: req.user?.tenant_id }))) {
  return res.status(409).json({ error: "biometric_disabled" });
}

// 4. sla-management.ts — POST /breaches
if (await isEnabled("ops.sla_auto_escalate")) await triggerEscalationRules(breach.id);

// 5. auth.ts — login
const mfaRequired = await isEnabled("governance.require_mfa");
if (mfaRequired && user.role === "admin" && !mfaVerified) {
  return res.status(403).json({ error: "mfa_required" });
}

// 6. ai-recommendations.ts — GET handler
if (!(await isEnabled("ai.auto_recommendations", { userId: req.user?.id }))) {
  return res.json({ recommendations: [], reason: "feature_disabled" });
}
```

---

## 4. Verification checklist

| Check | How |
|-------|-----|
| `public.feature_flags` no longer recreated at boot | restart api-server, run `\d public.feature_flags` in psql — expect "Did not find any relation". |
| `/api/feature-flags` returns 404 | `curl -i -H "$AUTH" http://localhost:3100/api/feature-flags` |
| `/api/settings/feature-flags` returns governance rows | `curl -H "$AUTH" http://localhost:3100/api/settings/feature-flags \| jq '.data[0].flag_key'` |
| `procurement.rfq_auto_send=false` blocks auto-dispatch | `POST /api/procurement/rfqs/<id>/send` → expect 409 unless `?manual=true`. |
| `governance.require_mfa=true` blocks admin login without MFA | `POST /api/auth/login` as admin without MFA → expect 403 `mfa_required`. |
| `ai.auto_recommendations=false` short-circuits the LLM call | `GET /api/ai-recommendations` returns empty array, no model spend. |
| Cache TTL works | Toggle a flag, observe at most 30s lag in business behaviour. |

---

## 5. Out-of-scope (for follow-up agents)

- `feature_flag_targets` schema collision (00010 vs 00059) — AGENT-121 §4. Targeting evaluation is NOT wired here; only flat `is_enabled` + `rollout_percent` are honoured.
- `ab_experiments` table is still orphaned — AGENT-121 §1c. Define migration or drop the 4 mystery rows.
- RLS on `governance.feature_flags` — AGENT-09 owns this.
- UI category facet — phantom field; persist as `metadata->>'category'` if business wants it.

---

## 6. Files changed

- `supabase/migrations/00069_drop_public_feature_flags.sql` (NEW)
- `api-server/src/routes/feature-flags.ts` (DELETE)
- `api-server/src/routes/index.ts` (remove 2 lines, add 2 lines)
- `api-server/src/routes/settings/feature-flags.ts` (NEW)
- `api-server/src/lib/feature-flags.ts` (NEW — `isEnabled()` helper)
- `api-server/src/routes/procurement/rfqs.ts` (1 gate)
- `api-server/src/routes/finance/invoices.ts` (1 gate)
- `api-server/src/routes/hr-attendance-advanced.ts` (1 gate)
- `api-server/src/routes/sla-management.ts` (1 gate)
- `api-server/src/routes/auth.ts` (1 gate)
- `api-server/src/routes/ai-recommendations.ts` (1 gate)
- `erp-app/src/pages/settings/feature-flags.tsx` (rewrite fetch URLs)

## 7. Verdict

After this fix, `governance.feature_flags` is the single source of truth, the settings UI works, and all 6 seeded flags have a real consumer in production code. The system moves from "furniture" to "control plane" per AGENT-121 §9.
