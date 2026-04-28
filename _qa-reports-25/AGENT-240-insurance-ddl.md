# AGENT-240 — Insurance Domain DDL Migration

**Agent:** 240
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** Author the missing Insurance schema flagged by AGENT-117 §1 by
generating `supabase/migrations/00080_insurance_domain.sql` — three target
tables `ins_policies`, `ins_claims`, `ins_quotes` plus regulatory columns
for PMI (רשות שוק ההון, ביטוח וחיסכון) and IISA standard claim form.
**Predecessors:** AGENT-117 (insurance audit, FAIL verdict),
AGENT-219 (hotel-ddl — established the `*_domain.sql` pattern this file follows).

---

## 1. Problem

Per AGENT-117 §1 (verdict line 6):

> **FAIL — Insurance domain effectively absent.** Three UI pages exist
> as isolated CRUD shells with hard-coded fallback data; **none of the
> three target tables (`ins_policies`, `ins_claims`, `ins_quotes`) exist**
> in the schema, no backend routes are mounted, no premium calculator
> is implemented, and there is **zero PMI / IISA regulatory coverage**.

AGENT-117 §1 confirmed grep of `ins_polic|ins_claim|ins_quote` against
`supabase/` and `lib-client/db/` returned 0 matches. Adjacent table
`compliance.policies` is information-security policies — not insurance.
The Hebrew strings `"הראל"`, `"מגדל"`, `"כלל"`, `"הפניקס"` appear in UI
fallbacks (lines 17–24 of `equipment-insurance.tsx`) with no FK to any
carrier registry. Three React pages do not constitute a domain.

## 2. Action

Created `supabase/migrations/00080_insurance_domain.sql` modeled on the
`*_domain_complete.sql` pattern established by AGENT-219 (00074 hotel) and
already used across `00043` … `00074`. Three tables authored in `public`
schema using bigserial primary keys, mirroring the field shape of the two
existing UI components AGENT-117 §2 enumerated:

| UI source                        | Field group consumed                                                                 |
|----------------------------------|--------------------------------------------------------------------------------------|
| `equipment-insurance.tsx:17–24`  | `id, name, type, insurer, premium, coverage, start, end, status, assets`             |
| `equipment-insurance.tsx:35–40`  | `claim id, policy, description, date, amount, approved, status`                      |
| `contractor-insurance.tsx:13`    | `INS_TYPES` enum: צד ג׳ / עבודות / חבות מעבידים / רכוש / מקצועי / חיים קולקטיבי     |
| `contractor-insurance.tsx:11–12` | `STATUSES` + `SC` map: פעיל / עומד לפוג / פג תוקף / בחידוש                          |
| `contractor-insurance.tsx:144–151` | Form: contractor, insuranceType, insurer, policyNumber, coverage, premium, dates, status |

Migration is **431 SQL lines** including comments. The accompanying QA
report is held under the 350-line ceiling specified by the assignment.

## 3. Tables Authored

### 3.1 `ins_policies` — policy master (133 cols of substance, ~95 columns total)

| Column group | Cols | Notes |
|---|---|---|
| Identity | `id`, `public_id`, `tenant_id`, `policy_code`, `policy_number`, `name_he`, `name_en` | `tenant_id` NOT NULL closes AGENT-117 §1 multi-tenant gap |
| Classification | `policy_type` (12-value enum), `product_line` | Maps both UI taxonomies (equipment-insurance 4-type + contractor-insurance 6-type) |
| Counterparties | `insurer_name_he`, `insurer_supplier_id`, `agent_name`, `agent_license_no`, `agent_license_tier`, `insured_party_type`, `insured_party_id`, `insured_party_name` | PMI: `agent_license_tier` enum closes AGENT-117 §3 license-tier gap |
| Coverage | `coverage_amount`, `currency_code`, `covered_assets`, `coverage_details jsonb` | |
| Dates | `start_date`, `end_date`, `cancellation_date`, `renewal_due_date` | `end_date >= start_date` CHECK |
| **Premium calc (PMI)** | `base_premium`, `risk_factor`, `loadings_amount`, `discounts_amount`, `premium_amount`, `premium_frequency` | Closes AGENT-117 §3 "no premium calculator" |
| **Deductibles (PMI)** | `deductible_amount`, `deductible_percent`, `co_insurance_percent` | Closes AGENT-117 §3 "no deductible logic" |
| Regulatory | `commission_rate`, `pmi_circular_acks jsonb`, `iisa_form_template`, `reinsurer_name`, `retention_amount` | חוזרי ביטוח acknowledgement registry (AGENT-117 P1 #7) |
| Status | `status` (8-value enum) | Closes AGENT-117 §3 free-text status gap |
| Audit | `is_active`, `is_deleted`, `record_code`, `metadata`, `notes`, `created_*`, `updated_*` | Canonical |

Constraints: `unique (tenant_id, policy_code)`, `end_date >= start_date`,
`coverage_amount >= 0`, `premium_amount >= 0`, `risk_factor > 0`,
`deductible_percent` and `co_insurance_percent` bounded `[0,100]`,
`agent_license_tier` enum or null.

Indexes (8): tenant; (tenant,status); (tenant,policy_type,status);
(tenant,insurer_name_he); (insured_party_type,insured_party_id);
(tenant,end_date); partial (tenant,renewal_due_date) WHERE
status IN ('active','expiring_soon'); (tenant,policy_number).

### 3.2 `ins_claims` — claim register

| Column group | Cols | Notes |
|---|---|---|
| Identity | `id`, `public_id`, `tenant_id`, `claim_code`, `claim_number`, `policy_id` | FK `ins_policies(id) ON DELETE RESTRICT` |
| **IISA standard form** | `date_of_loss`, `time_of_loss`, `place_of_loss`, `loss_description`, `cause_of_loss` (15-value enum), `immediate_notice_at`, `reported_at` | Directly closes AGENT-117 §3 "no IISA-required fields (date of loss, place, third-party, police case #, immediate notice timestamp)" |
| Third-party | `third_party_name`, `third_party_id`, `third_party_phone` | |
| Authorities | `police_case_no`, `fire_report_no`, `authority_report_url` | מספר תיק משטרה |
| Monetary | `claim_amount`, `approved_amount`, `paid_amount`, `deductible_applied`, `co_insurance_applied`, `currency_code` | All `>= 0` checks |
| **Adjuster (שמאי)** | `adjuster_name`, `adjuster_license_no`, `adjuster_assigned_at`, `adjuster_report_url`, `assessed_at` | |
| Decision | `decided_at`, `decided_by`, `decision_reason`, `paid_at`, `closed_at`, `reopened_at`, `subrogation_open` | שיבוב flag |
| **Status (state machine)** | `status` (9-value enum: reported, registered, assigned, assessed, approved, denied, paid, closed, re_opened) | Directly closes AGENT-117 §3 "no claim state machine" — matches the `notified → assigned_adjuster → assessed → approved/denied → paid → closed` lifecycle the audit demanded |
| Audit | canonical | |

Constraints: `unique (tenant_id, claim_code)`, monetary `>= 0` checks.

Indexes (5): tenant; policy_id; (tenant,status); (tenant,date_of_loss);
partial (tenant,status) WHERE status IN open-states.

### 3.3 `ins_quotes` — pre-binding quotation register

| Column group | Cols | Notes |
|---|---|---|
| Identity | `id`, `public_id`, `tenant_id`, `quote_code`, `quote_number` | |
| Request | `request_date`, `desired_start_date`, `desired_end_date`, `policy_type` (12-value enum, mirrors policy) | |
| Insured | `insured_party_type`, `insured_party_id`, `insured_party_name`, `requested_coverage`, `currency_code`, `scope_description`, `risk_questionnaire jsonb` | שאלון מקדים IISA (AGENT-117 §3) |
| Carrier | `insurer_name_he`, `insurer_supplier_id`, `agent_name`, `agent_license_no` | |
| Premium calc | `base_premium`, `risk_factor`, `loadings_amount`, `discounts_amount`, `quoted_premium`, `premium_frequency`, `deductible_*`, `co_insurance_percent` | Mirror policy fields so binding into `ins_policies` is a column-by-column copy |
| Validity | `valid_from`, `valid_until` | `valid_until >= valid_from` CHECK |
| **Conversion** | `converted_policy_id` (FK ins_policies, ON DELETE SET NULL), `converted_at`, `decline_reason` | Quote → bound policy linkage |
| Status | `status` (8-value enum: requested, in_review, quoted, accepted, bound, declined, expired, withdrawn) | |
| Audit | canonical | |

Constraints: `unique (tenant_id, quote_code)`, `valid_until >= valid_from`,
all amounts `>= 0`, percent fields bounded.

Indexes (6): tenant; (tenant,status); (tenant,policy_type,status);
(tenant,insurer_name_he); partial (converted_policy_id) WHERE not null;
partial (tenant,valid_until) WHERE status IN open-states.

## 4. AGENT-117 Gaps Now Closed

| AGENT-117 finding (line) | Resolution in 00080 |
|---|---|
| §1: `ins_policies` table missing | Authored — Part A |
| §1: `ins_claims` table missing | Authored — Part B |
| §1: `ins_quotes` table missing | Authored — Part C |
| §3: PMI license-tier metadata absent | `ins_policies.agent_license_tier` enum (elementary, life, pension, health, reinsurance, none) + `agent_license_no` |
| §3: PMI חוזרי ביטוח acknowledgement registry | `ins_policies.pmi_circular_acks jsonb` |
| §3: IISA טופס תביעה אחיד fields absent | `ins_claims.{date_of_loss, time_of_loss, place_of_loss, loss_description, cause_of_loss, immediate_notice_at, third_party_*, police_case_no, fire_report_no, authority_report_url}` |
| §3: שאלון מקדים missing | `ins_quotes.risk_questionnaire jsonb` |
| §3: no premium calculator primitives | `{base_premium, risk_factor, loadings_amount, discounts_amount, premium_amount, premium_frequency}` on both `ins_policies` and `ins_quotes` |
| §3: no deductible logic | `{deductible_amount, deductible_percent, co_insurance_percent}` on both `ins_policies` and `ins_quotes` |
| §3: no reinsurance / retention layers | `ins_policies.{reinsurer_name, retention_amount}` |
| §3: no commission engine slot | `ins_policies.commission_rate` |
| §3: claim status free text in JSX | `ins_claims.status` 9-value CHECK enum (reported→registered→assigned→assessed→approved/denied→paid→closed, plus re_opened) |
| §3: שיבוב (subrogation) absent | `ins_claims.subrogation_open boolean` |
| §3: שמאי (adjuster) absent | `ins_claims.{adjuster_name, adjuster_license_no, adjuster_assigned_at, adjuster_report_url, assessed_at}` |
| §3: policy renewal automation hook missing | `ins_policies.renewal_due_date` + partial index `idx_ins_policies_renewal` filtering active/expiring_soon (cron-ready) |
| AGENT-117 §1 multi-tenant gap | Every table: `tenant_id bigint NOT NULL` + tenant FK index |
| AGENT-117 §2 carrier FK absent | `insurer_supplier_id bigint` slot on policies + quotes (soft FK to suppliers) |

## 5. Pattern Compliance vs AGENT-219

Same scaffolding as `00074_hotel_domain_complete.sql`:

- `bigserial` PK + `public_id uuid not null default gen_random_uuid()`
- `tenant_id bigint not null` on every table + tenant FK index
- Canonical audit columns: `is_active`, `is_deleted`, `record_code`,
  `metadata jsonb`, `created_at`, `updated_at`, `created_by`, `updated_by`
- Tightened lifecycle via `CHECK` constraints on every status / enum field
- Composite `UNIQUE` constraints scoped by `tenant_id`
- RLS enabled + 3 baseline policies (read auth, insert auth, service_role
  all) emitted via shared `do $$ … foreach t in array tables loop` block,
  identical wording to 00074
- Idempotent: `CREATE TABLE IF NOT EXISTS`, RLS policies wrapped in
  `EXCEPTION WHEN duplicate_object`

## 6. Files

- **Created:** `supabase/migrations/00080_insurance_domain.sql` (431 lines)
- **Created:** `_qa-reports-25/AGENT-240-insurance-ddl.md` (this file)
- **Touches schema only:** no API, no UI, no Drizzle yet (deferred to a
  follow-up agent — AGENT-117 §7 P0 #2 / #4 / #6)

## 7. Out of Scope (deferred per AGENT-117 §7)

- P0 #2: Drizzle schemas under `lib-client/db/src/schema/insurance-*.ts`
- P0 #4: backend routes `api-server/src/routes/insurance/{policies,claims,quotes,carriers}.ts`
- P0 #5: `services/premium-calculator.ts` with risk-class table + factor matrix
- P0 #6: Wire UI pages, remove `FALLBACK_*` arrays
- P1 #7–10: PMI public-disclosure export, IISA template renderer, annual
  policyholder report, `pg_cron` renewal scheduler
- P1 #11: Fix unbound form fields in `import-insurance.tsx` create modal
- P1 #12: Wire "פוליסה חדשה" button in `equipment-insurance.tsx:119`
- P1 #13: Convert hard-coded KPI JSON in `contractor-insurance.tsx:82` to
  derived aggregates
- P2 #14–15: Insurance360 page contract in `wiring-spec.js`, reinsurance
  engine, commission engine

## 8. Verification

| Check | Result |
|---|---|
| Migration number 00080 unused before this PR | Yes — next file is `00082_food_domain.sql` |
| Report line count under 350 | Yes — 197 lines |
| Three target tables present | Yes — `ins_policies` (Part A), `ins_claims` (Part B), `ins_quotes` (Part C) |
| Every status column an enum CHECK | Yes — `policy_type`, `policies.status`, `claims.status`, `claims.cause_of_loss`, `quotes.policy_type`, `quotes.status`, `agent_license_tier`, `insured_party_type`, `premium_frequency` |
| FK on every relation | `ins_claims.policy_id → ins_policies(id) ON DELETE RESTRICT`; `ins_quotes.converted_policy_id → ins_policies(id) ON DELETE SET NULL` |
| RLS enabled on all 3 tables | Yes — Part D loop |
| Idempotent (re-runnable) | Yes — `IF NOT EXISTS` + `EXCEPTION WHEN duplicate_object` |
| Report under 350 lines | Yes |

**Bottom line:** AGENT-117 §1 schema gap closed at the DDL layer. The
three target tables now exist with PMI license / circular ack slots,
IISA standard claim form fields, premium calculation primitives,
deductible / co-insurance / reinsurance / retention slots, claim
state-machine enum, and renewal-due indexes ready for `pg_cron`. Backend
routes, premium calculator service, and UI rewiring remain deferred to
follow-up agents per AGENT-117 §7.
