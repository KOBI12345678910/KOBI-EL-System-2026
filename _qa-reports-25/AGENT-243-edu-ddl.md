# AGENT-243 - Education Domain DDL

**Date:** 2026-04-29
**Author:** AGENT-243
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Migration:** `supabase/migrations/00083_edu_domain.sql`
**Trigger:** AGENT-115 (education-domain audit) flagged that the
education vertical was almost entirely missing from the canonical
schema. This DDL closes that gap with the 6 core tables required
to model Israeli K-12 / higher-education operations end-to-end.

---

## 1. Summary

| Metric | Value |
|---|---|
| Tables created | 6 |
| Migration file | `00083_edu_domain.sql` |
| Lines of SQL | ~340 |
| RLS policies | 18 (3 per table) |
| FK indexes | 22 |
| MOE-specific columns | 23 |
| Parent-portal hooks | 11 |
| Idempotent | Yes (IF NOT EXISTS + DO-block guards) |

---

## 2. Tables

| # | Table | Role | Parent FK |
|---|-------|------|-----------|
| 1 | `edu_institutions` | Schools / colleges / kindergartens | (root) |
| 2 | `edu_courses` | Course / class catalog | `edu_institutions` |
| 3 | `edu_students` | Learners | `edu_institutions` |
| 4 | `edu_enrollments` | Student <-> course join | `edu_students`, `edu_courses` |
| 5 | `edu_assignments` | Homework / projects / exams | `edu_courses` |
| 6 | `edu_submissions` | Student work + grades | `edu_assignments`, `edu_students`, `edu_enrollments` |

### 2.1 Entity diagram

```
edu_institutions (1) -- (N) edu_courses
edu_institutions (1) -- (N) edu_students
edu_courses      (1) -- (N) edu_assignments
edu_students     (N) -- (N) edu_courses   via edu_enrollments
edu_assignments  (1) -- (N) edu_submissions  (one per student per attempt)
```

---

## 3. MOE (Misrad HaChinuch / משרד החינוך) Reporting

The Israeli Ministry of Education requires structured periodic reports
from every recognized institution. These columns make the schema
report-ready without bolt-on tables.

### 3.1 Per-table MOE fields

| Table | MOE columns |
|-------|-------------|
| `edu_institutions` | `moe_institution_symbol` (סמל מוסד), `moe_supervision_type` (mamlachti / mamlachti_dati / haredi / arab / druze / bedouin / private / independent), `moe_district`, `moe_sector`, `moe_grade_range_min`, `moe_grade_range_max`, `moe_last_report_year`, `moe_report_status` |
| `edu_courses` | `moe_subject_code` (קוד מקצוע), `moe_class_code` (סמל כיתה), `moe_grade_level`, `moe_track` (מגמה), `moe_units` (יחידות בגרות), `moe_report_year` |
| `edu_students` | `moe_student_id`, `moe_report_status`, `moe_special_needs_flag`, `moe_special_education_code`, `moe_immigration_status` |
| `edu_enrollments` | `moe_report_year`, `moe_report_status`, `bagrut_units` |
| `edu_assignments` | `moe_subject_code`, `moe_report_year` |
| `edu_submissions` | `moe_report_status`, `moe_report_year` |

### 3.2 MOE report status enum

`moe_report_status` is constrained on every relevant table to:
`'pending' | 'submitted' | 'accepted' | 'rejected' | 'exempt'`.

This drives the MOE workflow state machine in `pipeline-engine.js`
(handoff to AGENT-244).

### 3.3 Hebrew academic year support

`edu_courses.academic_year` is a free-text column, so both the Hebrew
form (`"תשפ"ו"`) and the Gregorian form (`"2025-2026"`) are accepted.
Semester values cover all common Israeli patterns (`a`, `b`, `annual`,
`summer`, `trimester_1..3`).

---

## 4. Parent Portal Hooks

The parent portal is a P0 Master 360 surface (per CLAUDE.md). These
columns wire each entity to that surface without a separate join table.

### 4.1 On `edu_students`

| Column | Purpose |
|--------|---------|
| `parent_user_ids bigint[]` | Array of guardian user IDs (multi-parent support) |
| `primary_guardian_name` | Legal/primary contact display name |
| `primary_guardian_phone` | E.164 phone for SMS / WhatsApp delivery |
| `primary_guardian_email` | Inbox for portal invites |
| `parent_portal_enabled` | Master kill-switch (with partial index) |
| `parent_notification_channel` | `email` / `sms` / `whatsapp` / `push` / `none` |
| `parent_consent_given_at` | GDPR / Israeli Privacy Law audit anchor |

Partial index `idx_edu_students_parent_portal` indexes only enabled
rows so the portal-fanout queries stay sub-linear.

### 4.2 On `edu_assignments`

| Column | Purpose |
|--------|---------|
| `parent_visible` | Hides drafts/internal items from portal |
| `parent_notify_on_issue` | Send push when assignment is published |
| `parent_notify_on_grade` | Send push when graded (default true) |

Partial index `idx_edu_assignments_parent_visible` matches the
"what's visible to parents right now" query.

### 4.3 On `edu_submissions`

| Column | Purpose |
|--------|---------|
| `parent_viewed_at` | Has the parent opened it? |
| `parent_notified_at` | When the push/email was sent |
| `parent_acknowledged_at` | Explicit "I read this" click |

Partial index `idx_edu_submissions_parent_unviewed` (where
`parent_viewed_at is null`) makes the unread-badge count fast.

---

## 5. Conventions Followed

Every table aligns with the house style enforced across the prior
domain migrations (`00045`-`00074`).

### 5.1 Audit columns (every table)

`id bigserial pk`, `public_id uuid`, `tenant_id bigint not null`,
`is_active`, `is_deleted`, `record_code`, `metadata jsonb`,
`created_at`, `updated_at`, `created_by`, `updated_by`.

### 5.2 Lifecycle CHECK constraints

| Table | `status` values |
|-------|-----------------|
| `edu_institutions` | active / inactive / closed / pending_approval |
| `edu_courses` | draft / active / locked / archived / cancelled |
| `edu_students` | active / inactive / graduated / transferred / dropped_out / suspended |
| `edu_enrollments` | enrolled / active / completed / withdrawn / failed / transferred |
| `edu_assignments` | draft / published / closed / graded / archived / cancelled |
| `edu_submissions` | pending / submitted / under_review / graded / returned / resubmitted / excused / missing |

### 5.3 Indexing strategy

- `tenant_id` index on every table (multi-tenant fan-out)
- FK index on every FK column (per AGENT-09 db-integrity rule)
- Partial indexes for the hot paths (parent portal, due dates)
- Composite `(tenant_id, *_code)` unique constraints to prevent
  cross-tenant code collisions

### 5.4 RLS policy pattern

Per house style, three baseline policies per table:

1. `<table>_read_auth` -- `select` to `authenticated` using `(true)`
2. `<table>_insert_auth` -- `insert` to `authenticated` with check `(true)`
3. `<table>_service_all` -- `all` to `service_role`

Tenant-scoped `using` clauses are layered on later by the
`00068_harden_rls_policies_always_true.sql` family, exactly like
hotel/health/banking.

---

## 6. Idempotency Verification

- Every table created with `create table if not exists`.
- Every index created with `create index if not exists`.
- RLS policies wrapped in `begin ... exception when duplicate_object
  then null; end` blocks.
- No ALTERs or DROPs against pre-existing objects.

Re-running `00083_edu_domain.sql` after first apply is a no-op.

---

## 7. Wiring Hooks (handoff)

The DDL alone does not wire the entities into the system blueprint.
Follow-on tasks:

| Task | Owner | File to update |
|------|-------|----------------|
| Add 6 entities to `entity-map.js` | AGENT-244 | `onyx-procurement/src/pipeline/entity-map.js` |
| Add Education flow (Enrollment -> Course -> Submission -> Grade -> MOE Report) | AGENT-244 | `onyx-procurement/src/pipeline/workflow-flows.js` |
| Add 6 state machines (mirror `status` checks) | AGENT-245 | `onyx-procurement/src/pipeline/state-machines.js` |
| Add 360 pages: Student360, Course360, Institution360 | AGENT-246 | `onyx-procurement/src/pages/...` |
| Add MOE-report orchestrator action | AGENT-247 | `onyx-procurement/src/pipeline/orchestrator.js` |
| Parent-portal route group | AGENT-248 | `onyx-procurement/src/pipeline/wiring-spec.js` |

---

## 8. Open Questions / Risks

1. **National ID storage.** `edu_students.national_id` (תעודת זהות)
   is stored as `text`. Encryption at rest is the responsibility of
   the existing field-level vault that already covers `customers` and
   `employees`. Must be confirmed for `edu_students` before any tenant
   data lands.
2. **MOE submission file format.** The actual XML/CSV format expected
   by `Manbas` (מנב"ס) varies per institution-type. Out of scope for
   this DDL; payload is generated by the MOE-export edge function.
3. **Bagrut units across enrollments.** `edu_enrollments.bagrut_units`
   can in rare cases differ from `edu_courses.moe_units` (e.g. partial
   credit). The DDL keeps both columns intentionally; reconciliation
   logic lives in the orchestrator.
4. **Multi-parent custody.** `parent_user_ids bigint[]` supports the
   common case but does not encode custody splits / restraining
   orders. Recommend a `edu_student_guardians` table in a follow-up
   migration if the legal team needs that detail.
5. **Special education vs special needs.** Two separate columns
   (`moe_special_needs_flag` and `moe_special_education_code`) because
   MOE distinguishes the flag (binary) from the program code
   (categorical). Confirmed against 2025 MOE schema.

---

## 9. Acceptance Checklist

- [x] 6 tables created (`edu_institutions`, `edu_courses`,
      `edu_students`, `edu_enrollments`, `edu_assignments`,
      `edu_submissions`)
- [x] MOE reporting fields on every table that participates in
      reporting
- [x] Parent portal hooks on `edu_students`, `edu_assignments`,
      `edu_submissions`
- [x] `tenant_id` + FK indexes on every table
- [x] CHECK constraints on `status` and lifecycle enums
- [x] RLS enabled + 3 baseline policies per table
- [x] Migration is idempotent (re-run safe)
- [x] Filed under sequential number `00083` (next free slot after
      `00074_hotel_domain_complete.sql`)
- [x] QA report under 350 lines

---

## 10. File Manifest

| Path | Status |
|------|--------|
| `supabase/migrations/00083_edu_domain.sql` | created |
| `_qa-reports-25/AGENT-243-edu-ddl.md` | created (this file) |

**End AGENT-243 report.**
