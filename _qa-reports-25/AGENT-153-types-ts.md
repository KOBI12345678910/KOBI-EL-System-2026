# AGENT-153 — Audit of `supabase/types.ts`

**Target:** `supabase/types.ts` (982 lines, declared as the generated DB types for project `ponypxhushxeskxgrmha`)
**Schemas referenced in header:** public, governance, commercial, procurement, execution, inventory, workforce, finance, comms, crm, service, quality, compliance, treasury, planning, maintenance, pricing, routing, documents, analytics, orchestration (21 schemas)
**Status:** **NOT generated, NOT consumed, severely drifted.** Effectively dead code.

---

## 1. Generation provenance

The file claims to be a Supabase-generated artifact:
```
supabase gen types typescript --project-id ponypxhushxeskxgrmha
```
But its shape is wrong for that command. A real generation would produce:
- `Database` with one entry **per schema** containing `Tables`, `Views`, `Functions`, `Enums`, `CompositeTypes`.
- `Row` / `Insert` / `Update` / `Relationships` for **every table** in **every schema**.

What is in the file (lines 936-968):
```ts
export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      app_menu: { Row: AppMenu; Insert: ...; Update: ...; Relationships: [...] };
      roles:    { Row: Role;    Insert: ...; Update: ...; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
```
Only **2 of ~271 tables** are wired into `Database` (`public.app_menu`, `public.roles`). The other 19 schemas declared in the header (governance, commercial, …) are absent from `Database` entirely. The 50 hand-rolled `export interface` blocks (Customer, Quote, PurchaseOrder, …) are orphan types — they never feed into `Tables<T>` / `TablesInsert<T>` / `TablesUpdate<T>` and the Supabase JS client cannot infer them.

Conclusion: this file was **hand-written**, with the header comment fabricated. It is not a `gen types` output.

---

## 2. Drift vs. live SQL schema

Cross-checked the 50 interfaces against `supabase/migrations/00000_master_schema.sql` and 71 follow-on migrations. Examples of confirmed drift:

| Interface | Mismatch with SQL |
|---|---|
| `UserProfile` | Missing `auth_user_id`, `deleted_at`. SQL has no separate `updated_at` requirement past default. |
| `GovRole` | Has `is_system: boolean`; SQL column is `is_system_role`. Missing `public_id`, `updated_at`. |
| `Permission` | Has `resource: string \| null`; SQL has `domain text NOT NULL` and `entity_type text NOT NULL` (both required, neither named `resource`). Missing `public_id`, `updated_at`. |
| `RolePermission` | TS `created_at`; SQL column is `granted_at` plus `granted_by`. |
| `UserRole` | Missing `expires_at` (present in SQL). |
| `AuditLog` | Heavy drift: TS has `event_type`, `old_data`, `new_data`, `ip_address`, `user_agent`. SQL has `action_name`, `old_values`, `new_values`, `source_service`, `source_module`, `source_page`, `correlation_id`, `performed_at`, `performed_by_user_id`, `public_id`. None of the SQL-side audit fields exist in the TS type. |
| `DomainEvent` | TS has `event_type`, `aggregate_type`, `aggregate_id`, `version`, `processed_at`. SQL has `event_name`, `event_version`, `topic_name`, `source_service`, `source_module`, `entity_type`, `entity_id`, `partition_key`. Almost no field overlap. |
| `FeatureFlag` | TS has `enabled`, `rollout_percent`, `conditions`. `00000_master_schema.sql` has `active`, `rollout_payload`. `00059_governance_domain_complete.sql` later redefines with `is_enabled`, `rollout_percent`, `rule_json`, `flag_key` — TS matches **neither** definition. |
| `ConfigEntry` | TS has `is_secret: boolean`. SQL has `environment text` and no `is_secret`/`description` columns. |
| `AppMenu` | TS field `is_visible: boolean \| null`. SQL has `is_visible boolean default true` (nullable but with default), and column order differs (TS lists `order_index` before `is_visible`/`required_permission`, SQL has them grouped differently) — minor but TS is not a faithful regen. |
| `Customer` | Mostly aligned, but missing `created_by`/`updated_by` typing as nullable bigint matches SQL — this one is one of the cleaner cases. |

The drift pattern shows the file was authored by hand against an earlier or imagined schema, then never resynced after migrations 00010-00071 added ~200 tables and renamed columns.

---

## 3. Tables present in DB but missing from `types.ts`

**SQL has ~271 distinct tables across 21 schemas. `types.ts` covers ~50 (~18%).** Entire schemas have **zero** typed coverage:

- `analytics` (17 tables — dashboards, KPIs, read-models, drilldowns, reports)
- `comms` (12 tables — email, sms, whatsapp, portal users, support tickets, SLA)
- `compliance` (2 tables — policies, acknowledgements)
- `crm` (3 tables — leads, opportunities, activities) — note `CrmLead` / `CrmOpportunity` interfaces exist in TS but are not wired to `Database`
- `docs` / `documents` (15+ tables — versions, OCR, classification, knowledge cards)
- `execution` (~25 tables — production_orders, BOM, drawings, signatures, milestones, blockers, risks, dependencies, punch_lists, …) — only `Project`, `WorkOrder`, `Alert`, `ProjectPhase` typed
- `finance` (~20 tables — bank_files, dunning, collections, fx_rates, gl_transactions, expenses, costing, cashflow, consolidation, reconciliation_exceptions, annual_tax_reports, …) — only `Invoice`, `InvoiceLine`, `Receipt`, `Payment`, `VatRecord` typed
- `governance` (35+ tables — workflows, escalations, integrations, queue_jobs, webhook_*, security_events, sla_timers, validations_log, command_logs, alert_subscriptions, saved_filters, user_preferences, health_checks, …) — only 7 typed
- `intelligence` (15 tables — agent_registry, ai_insights, anomaly_cases, forecast_models, model_registry, prompt_templates, …) — completely missing
- `inventory` (~17 tables) — only 5 typed; missing barcode_scans, inventory_movements, inventory_reservations, inventory_transfers, manufacturing_batches, material_lots, material_requests, reorder_rules, shortage_snapshots, stock_counts*
- `maintenance` (assets, work_orders) — `Asset` interface exists, not wired
- `orchestration` (10 tables — universal_inbox, workflow_runs, step_runs, triggers, …) — completely missing
- `planning` (capacity_calendars, capacity_slots, demand_forecasts) — missing
- `pricing` (calculations, rule_sets) — missing
- `procurement` (~22 tables — RFQs, contracts, goods_receipts, supplier_quotes, three_way_matches, warranty_cases, …) — only `Supplier`, `PurchaseOrder`, `PurchaseOrderLine` typed
- `quality` (defects, inspection_plans, inspection_runs) — `InspectionPlan` interface only, not wired
- `routing` (menu_nodes, route_registry, route_permission_map) — missing
- `service` (tickets, ticket_comments) — `ServiceTicket` interface only, not wired
- `treasury` (bank_accounts, cash_forecasts, cash_positions) — only `BankAccount` typed
- `workforce` (~18 tables) — 8 typed; missing benefits, employee_expenses, leave_requests, leave_types, pay_components, pension_records, shifts, payroll_export_batches, payroll_exceptions, attendance_exceptions, employee_pay_components

---

## 4. Client usage

Searched the entire worktree (excluding node_modules / pnpm store) for imports of `supabase/types`:

```
supabase/types.ts                                            (self)
_merge-staging-final/.../KOBI-EL-System-2026-master/supabase/types.ts   (duplicate copy)
```

**No production code in `onyx-procurement/`, `erp-app/`, `techno-kol-ops/`, `onyx-ai/`, `payroll-autonomous/`, `api-server/`, `dev/`, `src/`, or `packages/` imports `supabase/types`.** The Supabase JS client is used in `onyx-procurement` (server.js, db helpers, tests) but always via `createClient(...)` without a `<Database>` generic, i.e. **untyped**. `QA-AGENT-61-TYPESCRIPT.md` already flags this: *"@supabase/supabase-js ships native .d.ts but project never consumes them (untyped client)"*.

Net effect: `types.ts` provides no compile-time safety to anything — it is a documentation artifact at best, and a misleading one given the drift.

---

## 5. Recommendations

1. **Regenerate, don't patch.** Run `supabase gen types typescript --project-id ponypxhushxeskxgrmha --schema public,governance,commercial,procurement,execution,inventory,workforce,finance,comms,crm,service,quality,compliance,treasury,planning,maintenance,pricing,routing,documents,analytics,orchestration,intelligence,docs > supabase/types.ts`. Replace the entire file. Add to CI as a drift check.
2. **Wire the typed client.** In every service that uses `@supabase/supabase-js`, change to `createClient<Database>(url, key)` and import `Database` from a stable path (`@/supabase/types` alias).
3. **Delete the orphan duplicate** at `_merge-staging-final/KOBI-EL-System-2026-master/supabase/types.ts` to prevent future search-and-replace mistakes.
4. **Drop the hand-rolled `export interface` blocks** once generation is in place — they will be replaced by `Tables<'commercial.customers'>` style accessors.
5. **Header comment** currently lies about provenance; rewrite as part of the regen so it is accurate (or rely on the auto-generated header).

---

## 6. Severity

| Dimension | Rating |
|---|---|
| Coverage gap | **Critical** — 82% of tables untyped |
| Drift on covered tables | **High** — column renames, missing fields, conflicting later migrations |
| Client safety impact | **Low (paradoxically)** — file is unused, so drift hurts no compile, only misleads readers |
| Doc-truthfulness impact | **High** — header advertises 21 schemas; only 2 tables in 1 schema are wired |

Bottom line: low blast-radius today, but it is a tripwire for the moment a developer trusts it. Replace before any team starts typing the Supabase client.
