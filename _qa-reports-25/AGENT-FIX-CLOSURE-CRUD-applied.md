# AGENT-FIX-CLOSURE-CRUD applied

## Summary
Closure was the only Master Flow entity (Lead → ... → **Closure**) without endpoints. This change adds full CRUD plus the `finalize` orchestrator action and a `checklist` view.

## Files
- **Added** `api-server/src/routes/closure.ts` (393 LOC, < 500 cap)
- **Added** `api-server/src/__tests__/closure.test.ts` (6 smoke tests, stubbed `pool`)
- **Edited** `api-server/src/routes/index.ts` — mounted `closureRouter` next to `variation-orders` (global mount, no prefix; route paths begin with `/closure`)

## Endpoints
| Method | Path | Notes |
|--------|------|-------|
| GET    | `/api/closure`                  | list + filters: `project_id`, `status`, `date_from`, `date_to`, `limit`, `offset` |
| GET    | `/api/closure/:id`              | single record |
| GET    | `/api/closure/:id/checklist`    | merged default + override checklist + progress_pct |
| POST   | `/api/closure`                  | body: `project_id`, `satisfaction_score`, `lessons_learned`, `retention_until`, etc. |
| PUT    | `/api/closure/:id`              | partial update; rejects empty body with Hebrew error |
| DELETE | `/api/closure/:id`              | soft delete via `status='cancelled'` (blocks if already finalized/archived) |
| POST   | `/api/closure/:id/finalize`     | orchestrator: marks closure finalized → flips `execution.projects.state='closed'` + sets `actual_end_date` → builds revenue-recognition JE hint → writes `alerts` row (best-effort) |

## DB strategy
- **Live Supabase audit**: `execution.projects` exists in production (`ponypxhushxeskxgrmha`, `qbnswajiuewyqbetuetq`); **no** `project_closures` / `closure_records` table existed.
- **Decision**: route lazily `CREATE TABLE IF NOT EXISTS closure_records` on import (same pattern as `variation-orders.ts`, `tool-equipment.ts`, etc.). Indexes added on `project_id` and `status`.
- Schema: `id`, `closure_number` (CLS-YYYY-NNNNN unique), `project_id`, `customer_id`, `status` (draft/finalized/archived/cancelled), `satisfaction_score`, `lessons_learned`, `retention_until`, `retention_amount`, `revenue_recognized`, `checklist` jsonb, plus standard audit columns.
- **Migration not applied** — runs on first request. If a formal SQL migration is preferred, propose `supabase/migrations/<ts>_create_closure_records.sql` mirroring the inline DDL.

## Defensive patterns
- All Supabase reads use `safeRows()` that tolerates missing `rows`.
- `execution.projects` lookup wrapped in try/catch (older dev DBs may not have the schema).
- `alerts` insert in finalize() is best-effort; failure recorded in `side_effects.notification_error`.
- All user-facing errors are Hebrew (`רשומת סגירה לא נמצאה`, `אין שדות לעדכון`, `מספר סגירה כבר קיים`, etc.).

## Verification
- `npx tsc --noEmit -p tsconfig.json` (full project) — **zero errors mentioning closure**
- `npx tsc --noEmit src/routes/closure.ts` — only expected workspace-path errors (`@workspace/db`, `zod/v4`); these resolve under the project tsconfig
- Tests: 6 smoke tests cover list, single 404, create-with-mocked-pool, PUT-empty-body, finalize 404, checklist progress
