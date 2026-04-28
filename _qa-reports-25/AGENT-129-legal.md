# AGENT-129 - Legal Domain Audit

**Project:** kobi-el-system-2026 (Supabase `ponypxhushxeskxgrmha`)
**Scope:** Tables `legal_cases`, `legal_contracts`, `legal_documents`, `legal_time_entries`
**Date:** 2026-04-29
**Auditor:** Agent 129 - Legal Domain
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`

---

## Status

**FAIL - Domain ghost-exists in production DB but is unwired, ungoverned, and not Israel-localized.**

| Check | Result | Severity |
|-------|--------|----------|
| Tables present in live DB | 4 / 4 | OK |
| Tables defined in repo migrations | 0 / 4 | CRITICAL |
| Rows in any legal table | 0 | INFO (no data loss) |
| RLS enabled | 4 / 4 | OK |
| RLS policies are real (not `USING (true)`) | 0 / 4 | CRITICAL |
| `tenant_id` present | 3 / 4 (`legal_time_entries` missing) | HIGH |
| FK to `tenants` | 3 / 4 (none on `legal_time_entries`) | HIGH |
| FK indexes on `tenant_id` | 1 / 3 (only `legal_cases`) | HIGH |
| FK indexes on `case_id` | 0 / 2 | HIGH |
| FK from `legal_time_entries.attorney_id` | 0 / 1 | HIGH |
| FK from `legal_documents.uploaded_by` | 0 / 1 | MEDIUM |
| FK from `legal_cases.assigned_attorney` | 0 / 1 | MEDIUM |
| CHECK constraints (status, billing_type) | 2 / many | PARTIAL |
| Israeli court taxonomy / case-number pattern | none | HIGH |
| Israeli legal-law references | none | MEDIUM |
| Hebrew-aware fields (RTL, bilingual labels) | none | MEDIUM |
| Wired into `entity-map.js` / `wiring-spec.js` / pipeline | NO | CRITICAL |
| Wired into menu / 360 page / state machine | NO | CRITICAL |
| API routes / orchestrator actions | NO | CRITICAL |
| Code modules referencing tables | 0 | CRITICAL |
| Bridge to existing `documents/legal-hold.js` engine | none | HIGH |
| Bridge to existing `contracts/contract-manager.js` engine | none | HIGH |
| Bridge to existing `time/time-tracking.js` engine | none | HIGH |

---

## Schema (live DB)

### `legal_cases` (23 cols)
PK `id uuid`, `tenant_id` FK to `tenants(id)`, UNIQUE (`tenant_id`,`case_number`).
Cols: `case_number`, `case_name`, `case_type`, `client_name/email/phone`, `opposing_party`, `court`, `judge`, `filing_date`, `hearing_date`, `statute_of_limitations`, `status` (CHECK: `intake|open|discovery|trial|appeal|settled|closed|archived`), `assigned_attorney uuid`, `practice_area`, `billing_type` (CHECK: `hourly|contingency|flat_fee|retainer|pro_bono`), `retainer_amount`, `estimated_value`, `notes`, `tags[]`, `created_at`.

### `legal_contracts` (18 cols)
PK `id uuid`, `tenant_id` FK to `tenants(id)`, UNIQUE (`tenant_id`,`contract_number`).
Cols: `contract_number`, `title`, `party_a`, `party_b`, `contract_type`, `effective_date`, `expiry_date`, `value`, `currency` (default `'USD'`), `auto_renew`, `renewal_notice_days` (default 30), `status` (CHECK: `draft|review|negotiation|active|expired|terminated|renewed`), `signed_date`, `signed_by_a`, `signed_by_b`, `file_url`, `notes`, `tags[]`, `created_at`.

### `legal_documents` (13 cols)
PK `id uuid`, `case_id` FK to `legal_cases(id)`, `tenant_id` FK to `tenants(id)`.
Cols: `doc_name`, `doc_type`, `category`, `file_url`, `file_size`, `version` (default 1), `uploaded_by uuid`, `notes`, `tags[]`, `created_at`.

### `legal_time_entries` (11 cols)
PK `id uuid`, `case_id` FK to `legal_cases(id)`. **NO `tenant_id`. NO `tenant_id` FK.**
Cols: `attorney_id uuid`, `entry_date`, `hours`, `rate`, `amount`, `description`, `is_billable` (default true), `status` (default `'draft'`, **NO CHECK constraint**), `created_at`.

---

## CRITICAL findings

### 1. Tables exist in production DB but in zero repo migrations
Files searched: `supabase/migrations/00000_*.sql` ... `20260417000000_initial_schema.sql` (72 files), plus all `*.sql` across the worktree. None contain `legal_cases`, `legal_contracts`, `legal_documents`, `legal_time_entries`. They appeared via an out-of-band path (likely a deleted earlier migration or direct DDL). Disaster recovery cannot recreate them. **A new migration file is required to canonicalize the schema.**

### 2. RLS is "always-true" - tenant isolation is NOT enforced
Every legal table has exactly one policy:
```
policyname='l1'/'l2'/'l3'/'l4'  cmd=ALL  qual=true  with_check=true
```
Any authenticated user reads every tenant's cases, contracts, documents, and time entries. Same pattern as the 318 always-true policies flagged in AGENT-09. RLS hardening migration `00072_*.sql` must replace these four policies with `tenant_id = current_setting('app.tenant_id')::uuid` (or the project's standard `is_member_of_tenant(tenant_id)` helper). For `legal_time_entries`, isolation must be inherited via `case_id`.

### 3. `legal_time_entries` has no tenant column or FK chain
The only ownership link is `case_id`. Without joining to `legal_cases`, RLS cannot evaluate tenancy. Add `tenant_id uuid REFERENCES tenants(id)` and a trigger / generated column that copies it from the parent case on insert.

### 4. Domain is invisible to the pipeline
Searched `onyx-procurement/src/pipeline/{entity-map,wiring-spec,workflow-flows,state-machines,orchestrator,pipeline-engine}.js` - zero references to legal entities. The 16-entity entity-map and 9 Master 360 pages do not include Case360, Contract360, or any legal surface. Per `CLAUDE.md`'s "No Dead Pages Rule" the data is unreachable from the UI.

### 5. Three production-grade engines exist but are not bridged
The repo already contains:
- `onyx-procurement/src/documents/legal-hold.js` (1,283 lines, full e-discovery + bilingual hold notices, Israeli civil-procedure refs)
- `onyx-procurement/src/contracts/contract-manager.js` (1,116 lines, 7 templates, Israeli contract law refs, version history, append-only audit)
- `onyx-procurement/src/time/time-tracking.js` (clock-in/out, Israeli labor-law validator)

**None of these read or write the four legal_* tables.** They are pure in-memory engines. A Phase 2 task is to wire each engine to its corresponding table via a Supabase persistence adapter (the `setPersistenceAdapter` hook already exists in `contract-manager.js`).

### 6. No Israeli court taxonomy
`legal_cases.court` is free text. Israeli court system requires an enum:
- `supreme` בית המשפט העליון
- `district_*` בית המשפט המחוזי (TLV/JLM/Haifa/Beersheva/Nazareth/Central)
- `magistrates_*` בית משפט השלום
- `family` ענייני משפחה
- `labor_regional|labor_national` בית הדין לעבודה
- `traffic` תעבורה
- `small_claims` תביעות קטנות
- `rabbinical_*` בית דין רבני

Israeli case-number format (`<court>/<type>-<seq>-<year>`, e.g., `ת"א 12345-67-89`) is not validated; `legal_cases_tenant_id_case_number_key` accepts any free-text uniqueness.

---

## HIGH findings

### 7. Index gaps
- `legal_cases.assigned_attorney` - no index (queries by attorney workload will table-scan).
- `legal_documents.case_id` and `legal_documents.tenant_id` - no indexes.
- `legal_time_entries.case_id`, `legal_time_entries.attorney_id`, `legal_time_entries.entry_date` - no indexes (every billing-period rollup table-scans).
- `legal_contracts.tenant_id` - no standalone index (only as part of UNIQUE).
- `legal_contracts.expiry_date`, `legal_cases.statute_of_limitations`, `legal_cases.hearing_date` - no indexes despite being the natural fields for "what's due in 30 days" alerts.

### 8. Foreign keys missing on UUID reference columns
- `legal_cases.assigned_attorney` -> should FK `auth.users(id)` or an `attorneys` table.
- `legal_documents.uploaded_by` -> same.
- `legal_time_entries.attorney_id` -> same.
- `legal_documents.case_id` exists but has no `ON DELETE` clause (defaults to NO ACTION).

### 9. Currency default mismatch
`legal_contracts.currency` defaults to `'USD'` while the rest of the ERP defaults to `ILS` (see `onyx-procurement/src/contracts/contract-manager.js` line 585). For an Israeli ERP this should be `'ILS'`.

### 10. `legal_time_entries.amount` and `rate` are unconstrained
No `CHECK (>= 0)`. AGENT-09 flagged the same column. Negative billing rates will be accepted.

---

## MEDIUM findings

### 11. No CHECK on `legal_time_entries.status`
Default `'draft'`, but no enum constraint. Compare to `legal_cases.status` and `legal_contracts.status` which are properly constrained. Suggested values: `draft|submitted|approved|invoiced|paid|written_off`.

### 12. No CHECK on `legal_documents.doc_type` / `category`
Free-text fields will fragment. Suggested doc_type enum (Israeli litigation):
`pleading|motion|affidavit (תצהיר)|discovery|exhibit|order|ruling (פסק דין)|correspondence|invoice|retainer_agreement|nda|power_of_attorney (יפוי כח)`.

### 13. No bilingual / RTL fields
The system is Hebrew-first per `CLAUDE.md`. Every other domain has `*_he` / `*_en` pairs (see `contract-manager.js` `TYPE_LABELS`). Legal tables lack any Hebrew-aware fields - `case_name`, `client_name`, `notes` are single text columns that mix RTL and LTR without locale tagging.

### 14. No retainer trust-account ledger
`legal_cases.retainer_amount` is a single numeric. Israeli bar association rules (כללי לשכת עורכי הדין (חשבון נאמנות), תשמ"ב-1982) require:
- separate trust account (חשבון נאמנות) per client retainer,
- itemized debit/credit ledger,
- monthly reconciliation,
- IOLTA-style interest-tracking.
None of this exists. A `legal_retainer_ledger` child table is required (debit/credit entries, running balance, reconciliation flag).

### 15. No statute-of-limitations alerting
`legal_cases.statute_of_limitations` is captured but no view, RPC, or scheduled job surfaces "cases approaching SoL within X days." Compare `contract-manager.js#listExpiring(days)` which does exactly this for contracts.

### 16. No conflict-of-interest check on case intake
`onyx-procurement/src/compliance/conflict-of-interest.js` exists but is not invoked anywhere on `legal_cases` insert. Bar-rule Mishpat (כלל 14) requires conflict screening before opening a case.

---

## RECOMMENDATIONS - Build queue

### P0 (block production launch)
1. Write canonical migration `00072_legal_domain_complete.sql` codifying the four tables, replacing the always-true RLS with tenant-scoped policies, and adding `tenant_id` to `legal_time_entries`.
2. Replace all four `l1/l2/l3/l4` policies with proper tenant predicates (or with `is_member_of_tenant(tenant_id)`).
3. Add CHECK constraints: `legal_time_entries.hours >= 0`, `rate >= 0`, `amount >= 0`, `status IN (...)`.
4. Add FK indexes on `tenant_id`, `case_id`, `attorney_id`, `assigned_attorney`, `uploaded_by`, plus expiry/SoL/hearing-date indexes.
5. Wire the four entities into `entity-map.js` and add `Case360`, `Contract360` as Master 360 pages (per `CLAUDE.md` rule).

### P1 (Israeli localization)
6. Add `court` enum + `case_number_pattern` validator (RTL-aware).
7. Default `legal_contracts.currency` to `'ILS'`.
8. Bilingual `case_name_he/en`, `notes_he/en`, label tables for `case_type`, `practice_area`, `doc_type`.
9. Bridge `contracts/contract-manager.js`, `documents/legal-hold.js`, and `time/time-tracking.js` to their corresponding tables via `setPersistenceAdapter`.
10. Add `legal_retainer_ledger` child table for trust-account compliance (כללי לשכת עורכי הדין).

### P2 (workflow + AI)
11. State machine for `legal_cases.status` (`intake -> open -> discovery -> trial -> appeal -> settled -> closed -> archived`) with transition guards (e.g., cannot close while open time_entries exist).
12. Statute-of-limitations alert RPC + dashboard widget.
13. Conflict-of-interest auto-check on intake (wire `compliance/conflict-of-interest.js`).
14. Billing batch RPC: select billable, unbilled time entries -> generate `ar_invoices` row.

---

## Files referenced

- Live DB tables: `public.legal_cases`, `public.legal_contracts`, `public.legal_documents`, `public.legal_time_entries`
- Existing code that should bridge but does NOT:
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\contracts\contract-manager.js`
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\documents\legal-hold.js`
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\time\time-tracking.js`
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\compliance\conflict-of-interest.js`
- Pipeline modules with NO legal references:
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\entity-map.js`
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\wiring-spec.js`
- Cross-reference: `_qa-reports-25\AGENT-09-db-integrity.md` (independently flagged the always-true policies and missing CHECKs).
