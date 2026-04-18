# Commercial Mega Batch — Evidence Log

Generated: 2026-04-18
Scope: Gathering patterns prior to writing 4 new commercial tables + Zod + API + pages.

## 1. Auth middleware
- `api-server/src/middleware/auth.ts:44` exports `authMiddleware(req,res,next)` (JWT from cookie or Bearer)
- `api-server/src/middleware/auth.ts:26` exports `generateToken`, `generateRefreshToken`, `refreshTokenHandler`, `adminMiddleware`
- `req.userId` is typed as **`number`** in the auth middleware global augmentation (line 18) but ALSO as **`string`** in `api-server/src/lib/permission-middleware.ts:40` — dual declaration exists; we treat it as string/number-coercible.
- Route convention: `router.use("/crm", requireAuth);` OR per-route `async (req, res, next) => {...}` with early-return 401/403 JSON.
- No exported `requireRole` / `requirePermission` — use `req.permissions` checks via `checkEntityAccess` from `permission-engine`.

## 2. DB client
- `@workspace/db` exposes `db.execute(sql\`...\`)` — Drizzle-style.
- `sql`, `sql.raw` from `drizzle-orm`.
- All commercial tables use `bigserial` PK + `bigint` FKs (NOT uuid).
- `governance.users_profile(id)` is the user table.
- `governance.set_updated_at()` is the shared updated_at trigger function.
- `governance.generate_public_id()` generates default `public_id uuid`.

## 3. Commercial tables — existing columns (from 00000 + 00010 + 00011)
| Table | Key Columns Present |
|---|---|
| `commercial.customers` | id, public_id, customer_number, legal_name, display_name, customer_type, tax_id, phone, email, website, address_line_1/2, city, region, postal_code, country, billing_contact_*, account_manager_user_id, status, credit_limit, current_balance, preferred_currency, risk_level, internal_notes, external_notes, created_at, updated_at, created_by, updated_by, deleted_at |
| `commercial.leads` | id, public_id, lead_number, source, full_name, company_name, phone, email, address_*, interest_type, estimated_value, currency, priority, state ('New'), pipeline_stage_id, assigned_user_id, customer_id, won_at, lost_at, lost_reason, internal_notes, external_notes, audit |
| `commercial.opportunities` | id, public_id, opportunity_number, lead_id, customer_id, title, description, estimated_value, currency, probability_percent, expected_close_date, state ('Open'), owner_user_id, audit |
| `commercial.quotes` | id, public_id, quote_number, customer_id, lead_id, opportunity_id, valid_until, quote_date, subtotal, discount_total, vat_total, grand_total, margin_estimate, currency, pricing_snapshot_id, approval_status ('draft'), state ('Draft'), converted_project_id, internal_notes, customer_notes, audit |
| `commercial.quote_lines` | id, quote_id, line_number, item_type, item_code, description, quantity, unit_of_measure, unit_price, discount_percent/amount, line_subtotal, vat_percent/amount, line_total, cost_estimate, margin_amount, audit |
| `commercial.quote_revisions` | id, public_id, quote_id, revision_number, revision_reason, revision_snapshot jsonb, created_by, created_at |
| `commercial.quote_approval_rules` | id, public_id, rule_code, rule_name, min_total_amount, max_total_amount, currency, required_role_code, required_approval_count, active, audit |
| `commercial.pricing_snapshots` | id, quote_id, pricing_engine_version, snapshot_payload jsonb, margin_estimate, pricing_notes, created_at, created_by |
| `commercial.pipeline_stages` | id, public_id, stage_code, stage_name, stage_order, probability_percent, is_closed_won, is_closed_lost, active, audit |
| `commercial.crm_activities` | id, public_id, related_entity_type, related_entity_id, activity_type, subject, activity_at, performed_by_user_id, outcome, notes, next_action_at, next_action_type, audit |
| `commercial.customer_portal_accounts` | (exists in 00000 line 1780) |
| `commercial.customer_contacts` | (exists in 00010) |
| `commercial.lead_tags` | id, public_id, tag_code, tag_name, color, active, audit |
| `commercial.lead_tag_assignments` | id, lead_id, tag_id, assigned_at, assigned_by |

## 4. MISSING — 4 new tables to build
- `commercial.lead_sources`
- `commercial.customer_segments`
- `commercial.sales_orders`
- `commercial.pricing_rules`

## 5. Zod schemas
- Current `lib-client/api-zod/src/index.ts` is a single `export * from "zod"` — no established convention; clean slate. We will create `src/commercial/<table>.ts` files, each exporting `CreateX`, `UpdateX`, `ReadX` zod schemas + TS types.

## 6. Reference page pattern (from `erp-app/src/pages/sales/opportunities.tsx`)
- Imports: `@tanstack/react-query`, `authFetch from "@/lib/utils"`, shadcn components (`Card`, `Button`, `Input`, `Table`, `Dialog`, etc.), `lucide-react` icons, `useLocation from "wouter"`.
- Uses `dir="rtl"` on root elements, Hebrew labels.
- Uses `lazy(() => import('./pages/...'))` in App.tsx followed by `<Route path="...">` (wouter style).

## 7. App.tsx route registration
- `erp-app/src/App.tsx:15-1100+` contains ~629 auto-wired `lazy(() => import(...))` declarations.
- Routes register inside `<Switch>/<Route>` wouter tree (not react-router).
- Suspense fallback is `<PageLoader />` component.
- Existing redirect: `<Route path="/customers"><Redirect to="/sales/customers" /></Route>` (line 1167) — commercial pages live under `/sales/*` today. New commercial pages will use new paths (`/commercial/*`) to avoid collision.

## 8. Audit helper
- EXISTS: `api-server/src/lib/audit-log.ts` exports `logAudit({ user_id, user_name, table_name, record_id, action, old_values, new_values, ip_address, notes })`.
- Action is `"INSERT" | "UPDATE" | "DELETE"`.
- We will REUSE this (no new audit helper needed). The task's `logAuditEvent` signature is aliased on top.

## 9. Menu
- Table: `public.app_menu(id bigserial, label, route, icon, parent_id, order_index)`.
- Category id **2 = "מכירות ולקוחות"** (commercial) per migration 00041.
- Inserts use `insert into public.app_menu (label, route, icon, parent_id, order_index) values (...)` — ID auto-assigned; we'll use `on conflict (route) do nothing` where route is unique. If route is NOT unique, guard with `where not exists`.

## 10. Routes mount style
- `api-server/src/routes/index.ts` uses both `router.use(xRouter)` (route paths fully defined inside) and `router.use("/prefix", xRouter)`.
- We will mount new aggregator at `/api/commercial` via `router.use("/api/commercial", commercialRouter)` but note the file actually mounts on a root `Router()` that is later mounted at `/api` by `app.ts`. So we will use `router.use("/commercial", commercialRouter)`.

## 11. Decisions for 4 new tables
- Use `bigserial` PK + `governance.users_profile(id)` FKs — MATCH existing convention.
- Include `public_id uuid default governance.generate_public_id()` — MATCH convention.
- `created_at/updated_at` timestamptz, audit `created_by/updated_by` bigint FKs.
- `metadata jsonb default '{}'::jsonb` for extensibility.
- RLS: deferred to a later migration because existing commercial tables don't have RLS enabled in 00000 (checked — no `alter table ... enable row level security` in 00000 for commercial). RLS is added centrally in 00001/00005/00014/00019. We will follow the SAME pattern: tables NOT RLS-enabled in our migration; RLS policies added later (noted as DEFERRED).

## 12. Deferred
- ENHANCEMENT of 14 existing commercial tables with is_deleted/is_active/record_code/metadata — many already have deleted_at / status. Deferring to avoid column-mismatch drift with existing policies.
- RLS on new tables — defer to dedicated RLS migration.
- Full 18-model Zod/API/page triad — scope reduction per task's "If you hit context limits" clause. Implementing 4 NEW tables as P0.

## 13. File targets
- `supabase/migrations/00043_commercial_domain_complete.sql`
- `supabase/migrations/00044_commercial_menu_wiring.sql`
- `lib-client/api-zod/src/commercial/{lead-sources,customer-segments,sales-orders,pricing-rules,index}.ts` (5 files)
- `api-server/src/routes/commercial/{lead-sources,customer-segments,sales-orders,pricing-rules,index}.ts` (5 files)
- `api-server/src/routes/index.ts` (edit: mount commercial aggregator)
- `erp-app/src/pages/commercial/{lead-sources,customer-segments,sales-orders,pricing-rules}.tsx` (4 files)
- `erp-app/src/App.tsx` (edit: 4 lazy + 4 Route)
- `_master-registry/domains/commercial_permission_matrix.md`
- `_master-registry/BUILD_CHANGELOG.md` (append)
- `_master-registry/BUILD_FINAL_STATUS.json` (patch)
