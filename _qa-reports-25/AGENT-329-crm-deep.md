# AGENT-329 — CRM Deep Audit

**Date:** 2026-04-29
**Scope:** Deep audit of the CRM stack — schema (`crm_companies / crm_contacts / crm_pipelines / crm_deals / crm_activities`), `crm-ultimate.ts` (~2,342 LOC), lead-to-customer flow, opportunity stages, activities, sentiment, lead scoring.
**Reference:** AGENT-39 (procurement audit) was not present in `_qa-reports-25/`; this report follows the format used by AGENT-48 (Finance360) and AGENT-205 (SQL injection).
**Verdict:** CRITICAL FAIL — three competing CRM schemas, runtime DDL outside migrations, SQL injection on every list endpoint, no auth, no tenancy, no FKs.

---

## 1. Inventory — Three Competing CRM Stacks

| Stack | Tables (canonical names) | Schema source | Owner |
|-------|--------------------------|---------------|-------|
| **A. `commercial.*` schema** (Postgres schema, snake_case bigserial) | `commercial.leads`, `commercial.crm_activities`, `commercial.opportunities`, `commercial.quotes`, `commercial.lead_sources`, `commercial.customer_segments`, `commercial.pipeline_stages`, `commercial.lead_tags` | `supabase/migrations/00000_master_schema.sql` (line 432) + `00043_commercial_domain_complete.sql` | Designed canonical |
| **B. `public.crm_*`** (referenced by `00072` tenant-id and `00075` FK-index migrations) | `public.crm_companies`, `public.crm_contacts`, `public.crm_pipelines`, `public.crm_deals`, `public.crm_activities` | **Indexed but never CREATEd** in `supabase/migrations/*` | Phantom — indexes target tables that have no DDL |
| **C. `crm_leads_ultimate` family** (10 tables) | `crm_leads_ultimate`, `crm_lead_activities`, `crm_agents`, `crm_meetings`, `crm_quotes`, `crm_contracts`, `crm_tasks`, `crm_agent_locations`, `crm_agent_daily_stats`, `crm_notifications` | `api-server/src/routes/crm-ultimate.ts` `ensureCrmUltimateTables()` — runtime `CREATE TABLE IF NOT EXISTS` (line 77) | `crm-ultimate.ts` runtime |
| **D. `app.ts` ad-hoc** | `crm_contacts`, `crm_opportunities`, `crm_pipeline_stages`, `crm_sla_rules`, `crm_automations` | `api-server/src/app.ts` lines 564, 714, 779, 792, 826 — also runtime DDL | Bootstrap fallback |

The user-requested entities `crm_companies / crm_contacts / crm_pipelines / crm_deals / crm_activities` exist **only as index targets** in migrations `00072` and `00075`. There is no `CREATE TABLE crm_companies / crm_pipelines / crm_deals` anywhere. `crm_contacts` and `crm_activities` are created at runtime by `app.ts` and `crm-communications.ts` only.

---

## 2. `crm-ultimate.ts` Anatomy (2,342 LOC)

**Structure:**
- Lines 1–73: helpers (`q`, `qOne`, `nextNumber`, `clean`, `buildUpdate`).
- Lines 77–526: `ensureCrmUltimateTables()` — 10 `CREATE TABLE IF NOT EXISTS` + ~50 `CREATE INDEX IF NOT EXISTS`.
- Lines 531–1137: 60+ CRUD endpoints (`/init`, `/leads`, `/lead-activities`, `/agents`, `/meetings`, `/quotes`, `/contracts`, `/tasks`, `/agent-locations`, `/agent-daily-stats`, `/notifications`).
- Lines 1146–1312: `/dashboard` (KPIs).
- Lines 1317–1554: `/agent-stats/:agentId`, `/agent-ranking`, `/agent-risk/:agentId` (custom composite scoring).
- Lines 1555–1707: `/assign-lead` (round-robin / territory / load-balance), `/convert-lead/:leadId`.
- Lines 1708–2342: `/pipeline`, `/lead-alerts`, `/agent-location-map`, `/log-activity`, `/conversion-funnel`, `/leads-by-source`, `/leads-by-city`, `/leads-by-product`, `/daily-report/:agentId`, `/manager-dashboard`, `/check-mandatory-fields/:leadId`.

Mounted at `/api/crm-ultimate` via `routes/index.ts:316`. Wired to FE at `erp-app/src/pages/crm/crm-ultimate-dashboard.tsx:28`.

---

## 3. CRITICAL Defects in `crm-ultimate.ts`

### 3.1 SQL Injection — Multiple List Endpoints (HIGH)

Every list endpoint string-concats raw query parameters into `sql.raw()`:

```typescript
// line 572-587 — /leads
if (status) where += ` AND status = '${status}'`;
if (search) where += ` AND (full_name ILIKE '%${search}%' OR phone ILIKE '%${search}%' ...)`;
const rows = await q(sql.raw(`SELECT * FROM crm_leads_ultimate ${where} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`));

// line 656-664 — /lead-activities (same pattern)
// line 713-720 — /agents
// line 769-781 — /meetings
// line 827-836 — /quotes
// line 915-923 — /contracts
// line 968-979 — /tasks
```

A request `?status=' OR 1=1; DROP TABLE crm_leads_ultimate;--` lands directly in the SQL string. AGENT-205 (`AGENT-205-sql-injection-patches.md`) flagged this with 4 hits in this file; the patches were never applied.

### 3.2 No Authentication (HIGH)

`crm-ultimate.ts` does NOT call `router.use(requireAuth)`. The router is mounted under `/api`, which `app.ts:1168` passes through `attachPermissions` middleware, but `attachPermissions` only attaches the user object; it does not require it. Every endpoint is reachable anonymously, including:
- `POST /api/crm-ultimate/leads` — anyone can insert leads
- `POST /api/crm-ultimate/init` — anyone can recreate tables
- `DELETE /api/crm-ultimate/leads/:id` — anyone can delete
- `POST /api/crm-ultimate/assign-lead` — anyone can reassign

Compare `crm.ts:111`: `router.use("/crm", requireAuth)` — proper guard. Compare `crm-communications.ts:23`: `router.use(requireAuth as any)`.

### 3.3 No Tenant Isolation (HIGH)

Zero `tenant_id` columns across the 10 tables. Zero `WHERE tenant_id = ...` filters. In a multi-tenant Palantir-grade ERP this means tenant A sees tenant B's leads, agents, GPS coordinates, quotes, contracts, and customer phone numbers. AGENT-213 (`AGENT-213-tenant-migration.md`) tracked tenant migration; `crm_leads_ultimate` was never enrolled.

### 3.4 No Foreign Keys (HIGH)

Zero `REFERENCES` / `FOREIGN KEY` clauses. `crm_lead_activities.lead_id`, `crm_meetings.lead_id`, `crm_quotes.lead_id`, `crm_contracts.quote_id`, `crm_tasks.lead_id`, `crm_notifications.agent_id` are all bare `INTEGER` columns. Cascade-deletes silently leak rows. Reference integrity is enforced only by app code that does not always check.

### 3.5 Runtime DDL — Schema Outside Migrations (HIGH)

`ensureCrmUltimateTables()` runs `CREATE TABLE IF NOT EXISTS` from a route handler (`POST /init`). Production schema is therefore not reviewable in `supabase/migrations/`. Drift between deployed instances is undetectable. Drizzle migrations are bypassed.

### 3.6 No RLS (HIGH)

The 10 `crm_*_ultimate` tables are not in `00001_rls_helpers_and_policies.sql`. `commercial.crm_activities` has 8 RLS policies (`00001` lines 186, 381–383). The runtime tables are wide open at the database layer, even if the API gained auth.

---

## 4. Lead-to-Customer Flow

### 4.1 Implemented in `crm-ultimate.ts`

```
crm_leads_ultimate (status: new -> call_scheduled -> meeting_scheduled
                            -> quote_sent -> deal_closed | not_relevant | too_expensive | deal_lost)
                            -> POST /convert-lead/:leadId  (line 1651)
                            -> sets is_converted=true, converted_to_customer_id, converted_at
```

`/convert-lead/:leadId` (line 1651–1703) accepts `customer_id` from the request body but never validates it exists in `customers`. It writes to `crm_lead_activities`, `crm_notifications`, increments `crm_agents.current_closings`. It does NOT create a `customers` row, does NOT post any event to the master `Lead → Quote → Approval → Order` pipeline (per CLAUDE.md), does NOT call `pipeline-engine.js` or `state-machines.js`, does NOT emit a `lead_converted` event for downstream listeners.

### 4.2 Disconnect From Master Flow

CLAUDE.md mandates `Lead → Quote → Approval → Order → Project → ...`. The actual code paths:

| Stage | Canonical (`commercial.*`) | `crm_leads_ultimate` flow | Linked? |
|-------|----------------------------|---------------------------|---------|
| Lead | `commercial.leads` | `crm_leads_ultimate` | NO — separate tables |
| Quote | `commercial.quotes` | `crm_quotes` | NO — different schema |
| Approval | `commercial.quote_approval_rules` | none (`discount_requires_approval` flag only) | NO |
| Order | `commercial.sales_orders` | none | NO |
| Activity | `commercial.crm_activities` | `crm_lead_activities` | NO |

Two parallel CRMs do not exchange data. The Master Flow is broken at the seam.

---

## 5. Opportunity Stages

There is no `crm_opportunities` table populated by `crm-ultimate.ts`. Opportunities live elsewhere:

- `commercial.opportunities` — `00000_master_schema.sql:449`, `state` field with `'Open'` default. No state-machine enforcement.
- `app.ts:792` — runtime DDL for `crm_opportunities` with `stage VARCHAR(100) DEFAULT 'prospect'`. Uncoupled from `commercial.opportunities`.
- `crm-sales-pipeline.ts` — uses `sales_opportunities`, `sales_scoring_rules`, `sales_stage_probabilities`. Yet another table family.

The "pipeline" view in `crm-ultimate.ts:1708` derives stages by `CASE` over `crm_leads_ultimate.status` — no real opportunity entity. There is no FSM enforcing transitions; any client can set any status.

---

## 6. Activities

| Source | Table | Purpose | tenant_id | RLS |
|--------|-------|---------|-----------|-----|
| `00000_master_schema.sql:432` | `commercial.crm_activities` | Polymorphic via `related_entity_type`/`related_entity_id` | (added by `00072`) | YES |
| `crm-ultimate.ts:140` | `crm_lead_activities` | Lead-only, with `gps_lat`/`gps_lng`, `call_recording_url`, `call_transcript`, `ai_call_analysis` | NO | NO |
| `crm-communications.ts:764` | `crm_activities` (public) | Inserted on inbound communications — table never CREATEd | NO | NO |
| `app.ts` | none for `crm_activities` | — | — | — |

`crm-communications.ts:764` writes `INSERT INTO crm_activities (entity_type, entity_id, ...)` to a table that no migration creates. The insert will fail at runtime unless `crm_leads_ultimate` infra plus an undocumented external migration created it.

---

## 7. Sentiment Analysis

- **`crm-ultimate.ts`** — zero references to sentiment. The `ai_call_analysis JSONB` column on `crm_lead_activities` (line 150) is defined but never populated by any endpoint in this file.
- **`crm.ts:1001`** — reads sentiment from `entity_records.data->>'sentiment_score'` but never writes it (consumer-side only).
- **`api-server/src/lib/ai-agents-system.ts:365`** — `analyzeSentiment(message)` runs and persists to a separate `ai_conversations.sentiment` column. Not written back to any CRM table.

There is no end-to-end sentiment pipeline. CRM activity ingestion does not call the analyzer; the analyzer's output never reaches the lead/quote/contract records.

---

## 8. Lead Scoring

Three uncoordinated implementations:

| Source | Table / Field | Algorithm | When run |
|--------|---------------|-----------|----------|
| `crm.ts:689` `/crm/leads/scored` | derives from `entity_records` JSONB | Source-weight (referral=30, website=25, ...) + budget bracket + activity count, capped 5–100, categorized hot/warm/cold | On request only — not persisted |
| `crm-ultimate.ts` schema | `crm_leads_ultimate.ai_score`, `quality_score`, `conversion_probability` | Columns exist, never written by any endpoint in the file | Never |
| `crm-sales-pipeline.ts:715` | `sales_scoring_rules` + `recalculate-all` endpoint | Rule-based weighted score | Manual trigger |
| `crm-ultimate.ts:1414` `/agent-ranking` | composite agent score (closings × 30 + revenue cap 25 + quality × 0.2 + response cap 15 + meetings × 5 + target%) | Agent-side, not lead-side | On request |

The lead in `crm_leads_ultimate` is never automatically scored. There is no trigger, no listener, no nightly job. `ai_score` and `conversion_probability` columns are dead weight.

---

## 9. Cross-File Defects

- **`crm.ts:115`** — `safeQuery(query: string)` uses `sql.raw(query)` and is called with template-literal string concatenation throughout (e.g. lines 154–156 are static, but the pattern invites injection in any extension).
- **`crm-ultimate.ts:719, 784, 829, 919, 970`** — same `sql.raw` interpolation pattern as section 3.1 across `/agents`, `/meetings`, `/quotes`, `/contracts`, `/tasks` lists.
- **`crm-customer360.ts:67`** — `/crm/customer360/timeline/:customerId` references `commercial.crm_activities`, hitting the canonical schema, while `lead-profile.tsx` reads from `crm_leads_ultimate`. The Customer360 view will not show CRM-Ultimate activities.
- **`crm-ultimate.ts:1146` `/dashboard`** — duplicates `crm.ts:149` `/crm/dashboard` against different tables. Two dashboards, two truths.

---

## 10. No-Dead-Pages Test (per CLAUDE.md)

`erp-app/src/pages/crm/crm-ultimate-dashboard.tsx` (calls `/api/crm-ultimate`):
- Where am I? PARTIAL (header) — Current status? PARTIAL (KPIs). What can I do? PARTIAL (assign/convert). Next step? FAIL — no recommended action panel. Related records? FAIL — no link to canonical Customer360.

`erp-app/src/pages/crm/leads-ultimate.tsx`, `lead-profile.tsx`, `lead-quality.tsx`, `crm-activities.tsx` — all read from `crm_leads_ultimate` via `/api/crm-ultimate/*`; none of them surface `commercial.leads` data.

---

## 11. Severity Summary

| # | Defect | Severity | File / Line |
|---|--------|----------|-------------|
| 1 | SQL injection on `/leads`, `/lead-activities`, `/agents`, `/meetings`, `/quotes`, `/contracts`, `/tasks` GET-list | CRITICAL | `crm-ultimate.ts:584, 663, 719, 784, 829, 919, 970` |
| 2 | No authentication on any endpoint | CRITICAL | `crm-ultimate.ts` (no `requireAuth`) |
| 3 | No `tenant_id`, no FKs, no RLS on 10 runtime tables | CRITICAL | `crm-ultimate.ts:91-442` |
| 4 | Schema created at runtime, not in migrations | HIGH | `crm-ultimate.ts:77-526` |
| 5 | Two competing schemas (`commercial.*` vs `crm_leads_ultimate`) — Master Flow broken | HIGH | architecture |
| 6 | `crm_companies`, `crm_pipelines`, `crm_deals` indexed but never CREATEd | HIGH | `00072` / `00075` |
| 7 | `/convert-lead` doesn't validate `customer_id`, doesn't emit pipeline event | HIGH | `crm-ultimate.ts:1651` |
| 8 | `crm-communications.ts:764` writes to non-existent `crm_activities` | HIGH | route runtime fail |
| 9 | `ai_score` / `conversion_probability` / `quality_score` columns never populated | MED | `crm-ultimate.ts:118-121` |
| 10 | No state-machine, no opportunity FSM, status field is free-text | MED | `crm-ultimate.ts:108` |
| 11 | Sentiment column `ai_call_analysis JSONB` defined but never written | MED | `crm-ultimate.ts:150` |
| 12 | Two `/dashboard` endpoints over different tables | MED | `crm.ts:149` vs `crm-ultimate.ts:1146` |

---

## 12. Recommended Remediation (Priority Order)

1. **Lock down `crm-ultimate.ts` API:** add `router.use(requireAuth)`, parameterize every `sql.raw`, add `tenant_id` filter middleware. Do this before anything else — this is a publicly-reachable RCE vector.
2. **Move `ensureCrmUltimateTables()` into a numbered Supabase migration**, drop the runtime DDL.
3. **Decide canonical schema:** either `commercial.*` (ADR direction) and migrate `crm_leads_ultimate` data into `commercial.leads`, or rename and harden `crm_*_ultimate` as the canonical and retire `commercial.*`. Two sources of truth must collapse to one.
4. **Create the missing `crm_companies` / `crm_pipelines` / `crm_deals` tables** that `00072`/`00075` index, OR drop those phantom indexes.
5. **Wire `/convert-lead`** to `pipeline-engine.js` so a lead conversion emits the `lead_converted` event the orchestrator listens for.
6. **Persist lead scoring** — schedule a nightly job that writes `ai_score`/`conversion_probability` so reads from `lead-quality.tsx` aren't always empty.
7. **Connect `analyzeSentiment` to CRM ingestion** — call from `/log-activity` and write to `crm_lead_activities.ai_call_analysis`.
8. **Add RLS policies** on the 10 runtime tables matching `commercial.crm_activities` pattern.

---

## 13. Files Referenced

- `api-server/src/routes/crm-ultimate.ts` (2,342 LOC)
- `api-server/src/routes/crm.ts` (1,081 LOC)
- `api-server/src/routes/crm-customer360.ts`
- `api-server/src/routes/crm-communications.ts`
- `api-server/src/routes/crm-sales-pipeline.ts`
- `api-server/src/routes/index.ts` (lines 315–316)
- `api-server/src/app.ts` (lines 564, 714, 779, 792, 826, 1168)
- `api-server/src/seed-data.ts` (line 325)
- `api-server/src/lib/ai-agents-system.ts` (lines 365–502)
- `supabase/migrations/00000_master_schema.sql` (lines 396–465)
- `supabase/migrations/00001_rls_helpers_and_policies.sql` (lines 186, 381)
- `supabase/migrations/00002_secure_rpc_functions.sql` (line 188)
- `supabase/migrations/00043_commercial_domain_complete.sql` (lines 69, 76+)
- `supabase/migrations/00072_tenant_id_columns_and_indexes.sql` (lines 156–158)
- `supabase/migrations/00075_fk_indexes.sql` (lines 136–142)
- `supabase/migrations/00087_analytics_views.sql` (line 217)
- `erp-app/src/pages/crm/*` (16 pages)
- Prior reports: `_qa-reports-25/AGENT-205-sql-injection-patches.md`, `AGENT-213-tenant-migration.md`, `AGENT-287-real-fields.md`, `AGENT-159-quote-to-cash.md`
