# AGENT-FIX-DRIZZLE-DRIFT — Applied

**Date:** 2026-04-29
**Source:** Supabase project `ponypxhushxeskxgrmha` (kobi-el-system-2026)
**Generator:** `mcp__supabase__generate_typescript_types`
**Output:** `packages/shared-types/supabase.ts`

## Summary

Auto-generated Supabase TypeScript types persisted to canonical location
`packages/shared-types/supabase.ts` with companion `package.json`
(`@techno-kol/shared-types@0.1.0`). The types are now importable across
the four ERP services (TECHNO_KOL_OPS, ONYX_PROCUREMENT, PAYROLL_AUTONOMOUS,
ONYX_AI) for type-safe Supabase client usage.

## Metrics

| Metric | Value |
|---|---|
| File size (chars) | 466,619 (TS content) + 189 (header) = 466,808 |
| File size (lines) | 14,965 |
| Source raw chars (JSON-wrapped) | 484,181 |
| `interface ` declarations | 0 |
| `type ` aliases | 9 |

## Schemas Covered

Single schema: **public** (plus `__InternalSupabase` meta).

### Sections in `Database['public']`

| Section | Count |
|---|---|
| Tables | 231 |
| Views | 14 |
| Functions | 40 |
| Enums | 3 |
| CompositeTypes | 0 |

### Enum Definitions

- `order_status` — draft, measuring, quoted, approved, production, ready,
  installing, completed, invoiced, paid, cancelled
- `product_category` — gate, fence, railing, pergola, stairs, window, door,
  custom, other
- `user_role` — admin, manager, field, client

## Type Aliases Exported

The 9 `type` declarations are the standard Supabase scaffold:
`Json`, `Database`, `DatabaseWithoutInternals`, `DefaultSchema`, `Tables`,
`TablesInsert`, `TablesUpdate`, `Enums`, `CompositeTypes`. (No `interface`
declarations — Supabase emits a single nested `Database` type tree.)

## Files Touched

- `packages/shared-types/supabase.ts` — created (466,808 bytes, 14,965 lines)
- `packages/shared-types/package.json` — created
- `_qa-reports-25/AGENT-FIX-DRIZZLE-DRIFT-applied.md` — this report

## Refresh Procedure

To regenerate after schema changes:

```
mcp__supabase__generate_typescript_types
```

then overwrite `packages/shared-types/supabase.ts` (preserve the 3-line
header comment block).
