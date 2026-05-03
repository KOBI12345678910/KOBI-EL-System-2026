-- ============================================================
-- FILE: supabase/migrations/00083_edu_domain.sql
-- TECHNO-KOL UZI ERP 2026 -- Education Domain
-- Created: 2026-04-29
-- Author:  AGENT-243
-- Purpose:
--   Per AGENT-115 (education-domain audit): the education vertical
--   is largely missing from the canonical schema. This migration
--   creates the 6 core tables required by the Israeli K-12 / higher-
--   education model, with first-class fields for MOE (Misrad
--   HaChinuch / משרד החינוך) reporting and parent-portal hooks.
--
--   Tables created:
--     1. public.edu_institutions   -- schools / colleges / kindergartens
--     2. public.edu_courses        -- catalog of courses / classes
--     3. public.edu_students       -- learners (linked to parents/guardians)
--     4. public.edu_enrollments    -- student <-> course links
--     5. public.edu_assignments    -- homework / projects / exams
--     6. public.edu_submissions    -- student work + grades
--
--   Standards applied across every table:
--     * tenant_id (NOT NULL + index)         -- multi-tenant isolation
--     * canonical audit columns              -- created_by / updated_by /
--                                               created_at / updated_at /
--                                               is_active / is_deleted /
--                                               metadata / record_code
--     * MOE reporting fields                 -- moe_institution_symbol,
--                                               moe_class_code,
--                                               moe_student_id,
--                                               moe_subject_code,
--                                               moe_report_year, etc.
--     * parent portal hooks                  -- parent_user_ids,
--                                               parent_visible flag,
--                                               parent_notification_channel
--     * tightened lifecycles via CHECK
--     * 3 baseline RLS policies per table    -- read/insert (auth) + service_role
--
--   Idempotent: every CREATE uses IF NOT EXISTS; ALTERs guarded by
--   DO-blocks; CHECKs added via exception-trapped DO-blocks.
-- ============================================================

-- ------------------------------------------------------------
-- PART A: edu_institutions -- schools, colleges, kindergartens
-- ------------------------------------------------------------
create table if not exists public.edu_institutions (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  institution_code         text not null,
  name_he                  text not null,
  name_en                  text,
  institution_type         text not null default 'school'
    check (institution_type in (
      'kindergarten','elementary','middle','high','combined',
      'yeshiva','seminary','college','university','vocational','special_ed'
    )),
  -- MOE / Misrad HaChinuch reporting fields
  moe_institution_symbol   text,                 -- "סמל מוסד"
  moe_supervision_type     text                  -- mamlachti / mamlachti_dati / haredi / arab / private
    check (moe_supervision_type is null or moe_supervision_type in (
      'mamlachti','mamlachti_dati','haredi','arab','druze','bedouin','private','independent'
    )),
  moe_district             text,                 -- מחוז (north/haifa/center/tel_aviv/jerusalem/south)
  moe_sector               text,                 -- jewish/arab/druze/bedouin
  moe_grade_range_min      integer check (moe_grade_range_min between 0 and 14),
  moe_grade_range_max      integer check (moe_grade_range_max between 0 and 14),
  moe_last_report_year     integer,              -- שנה אחרונה שדווחה למשרד
  moe_report_status        text default 'pending'
    check (moe_report_status in ('pending','submitted','accepted','rejected','exempt')),
  -- Contact / location
  address_line1            text,
  address_line2            text,
  city                     text,
  country_code             text default 'IL',
  postal_code              text,
  phone                    text,
  email                    text,
  principal_name           text,
  status                   text not null default 'active'
    check (status in ('active','inactive','closed','pending_approval')),
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, institution_code)
);
create index if not exists idx_edu_institutions_tenant on public.edu_institutions (tenant_id);
create index if not exists idx_edu_institutions_moe_symbol on public.edu_institutions (moe_institution_symbol);
create index if not exists idx_edu_institutions_type on public.edu_institutions (institution_type, is_active);

-- ------------------------------------------------------------
-- PART B: edu_courses -- course / class catalog
-- ------------------------------------------------------------
create table if not exists public.edu_courses (
  id                  bigserial primary key,
  public_id           uuid not null default gen_random_uuid(),
  tenant_id           bigint not null,
  institution_id      bigint not null references public.edu_institutions(id),
  course_code         text not null,
  name_he             text not null,
  name_en             text,
  description_he      text,
  -- MOE / Misrad HaChinuch reporting
  moe_subject_code    text,                 -- קוד מקצוע משרד החינוך
  moe_class_code      text,                 -- סמל כיתה
  moe_grade_level     integer check (moe_grade_level between 0 and 14),
  moe_track           text,                 -- מגמה (e.g. ריאלי, הומני)
  moe_units           integer,              -- יחידות לימוד / bagrut units
  moe_report_year     integer,              -- שנת דיווח
  -- Logistics
  academic_year       text,                 -- e.g. "תשפ"ו" / "2025-2026"
  semester            text check (semester is null or semester in ('a','b','annual','summer','trimester_1','trimester_2','trimester_3')),
  teacher_user_id     bigint,
  capacity            integer,
  enrolled_count      integer not null default 0,
  schedule_pattern    jsonb not null default '{}'::jsonb,  -- weekly schedule json
  status              text not null default 'active'
    check (status in ('draft','active','locked','archived','cancelled')),
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint,
  updated_by          bigint,
  unique (tenant_id, institution_id, course_code, academic_year)
);
create index if not exists idx_edu_courses_tenant on public.edu_courses (tenant_id);
create index if not exists idx_edu_courses_institution on public.edu_courses (institution_id);
create index if not exists idx_edu_courses_teacher on public.edu_courses (teacher_user_id);
create index if not exists idx_edu_courses_year on public.edu_courses (academic_year, status);

-- ------------------------------------------------------------
-- PART C: edu_students -- learners (incl. parent portal hooks)
-- ------------------------------------------------------------
create table if not exists public.edu_students (
  id                          bigserial primary key,
  public_id                   uuid not null default gen_random_uuid(),
  tenant_id                   bigint not null,
  institution_id              bigint not null references public.edu_institutions(id),
  student_code                text not null,
  -- Identity (Israeli ID + MOE)
  national_id                 text,                 -- ת"ז (encrypted upstream)
  moe_student_id              text,                 -- מזהה תלמיד משרד החינוך
  first_name_he               text not null,
  last_name_he                text not null,
  first_name_en               text,
  last_name_en                text,
  date_of_birth               date,
  gender                      text check (gender is null or gender in ('m','f','x')),
  -- Class / grade context
  current_grade               integer check (current_grade between 0 and 14),
  current_class_code          text,                 -- e.g. "ה-3"
  enrollment_date             date,
  graduation_date             date,
  -- MOE reporting
  moe_report_status           text default 'pending'
    check (moe_report_status in ('pending','submitted','accepted','rejected','exempt')),
  moe_special_needs_flag      boolean not null default false,
  moe_special_education_code  text,                 -- קוד חינוך מיוחד
  moe_immigration_status      text,                 -- עולה חדש / ותיק / וכו'
  -- Parent portal hooks
  parent_user_ids             bigint[] not null default array[]::bigint[],
  primary_guardian_name       text,
  primary_guardian_phone      text,
  primary_guardian_email      text,
  parent_portal_enabled       boolean not null default true,
  parent_notification_channel text default 'email'
    check (parent_notification_channel in ('email','sms','whatsapp','push','none')),
  parent_consent_given_at     timestamptz,
  -- Lifecycle
  status                      text not null default 'active'
    check (status in ('active','inactive','graduated','transferred','dropped_out','suspended')),
  is_active                   boolean not null default true,
  is_deleted                  boolean not null default false,
  record_code                 text,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  bigint,
  updated_by                  bigint,
  unique (tenant_id, institution_id, student_code)
);
create index if not exists idx_edu_students_tenant on public.edu_students (tenant_id);
create index if not exists idx_edu_students_institution on public.edu_students (institution_id);
create index if not exists idx_edu_students_moe_id on public.edu_students (moe_student_id);
create index if not exists idx_edu_students_grade on public.edu_students (current_grade, status);
create index if not exists idx_edu_students_parent_portal on public.edu_students (parent_portal_enabled) where parent_portal_enabled = true;

-- ------------------------------------------------------------
-- PART D: edu_enrollments -- student <-> course join
-- ------------------------------------------------------------
create table if not exists public.edu_enrollments (
  id                bigserial primary key,
  public_id         uuid not null default gen_random_uuid(),
  tenant_id         bigint not null,
  student_id        bigint not null references public.edu_students(id),
  course_id         bigint not null references public.edu_courses(id),
  enrolled_on       date not null default current_date,
  withdrawn_on      date,
  final_grade       numeric(5,2) check (final_grade is null or (final_grade >= 0 and final_grade <= 100)),
  bagrut_units      integer,                       -- יחידות בגרות בפועל
  attendance_pct    numeric(5,2) check (attendance_pct is null or (attendance_pct >= 0 and attendance_pct <= 100)),
  moe_report_year   integer,
  moe_report_status text default 'pending'
    check (moe_report_status in ('pending','submitted','accepted','rejected','exempt')),
  status            text not null default 'enrolled'
    check (status in ('enrolled','active','completed','withdrawn','failed','transferred')),
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  record_code       text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        bigint,
  updated_by        bigint,
  unique (tenant_id, student_id, course_id)
);
create index if not exists idx_edu_enrollments_tenant on public.edu_enrollments (tenant_id);
create index if not exists idx_edu_enrollments_student on public.edu_enrollments (student_id);
create index if not exists idx_edu_enrollments_course on public.edu_enrollments (course_id);
create index if not exists idx_edu_enrollments_status on public.edu_enrollments (status, is_active);

-- ------------------------------------------------------------
-- PART E: edu_assignments -- homework / projects / exams
-- ------------------------------------------------------------
create table if not exists public.edu_assignments (
  id                  bigserial primary key,
  public_id           uuid not null default gen_random_uuid(),
  tenant_id           bigint not null,
  course_id           bigint not null references public.edu_courses(id),
  assignment_code     text not null,
  title_he            text not null,
  title_en            text,
  description_he      text,
  assignment_type     text not null default 'homework'
    check (assignment_type in ('homework','project','quiz','exam','midterm','final','bagrut','lab','presentation','essay')),
  weight_pct          numeric(5,2) not null default 0
    check (weight_pct >= 0 and weight_pct <= 100),
  max_score           numeric(7,2) not null default 100,
  issued_at           timestamptz not null default now(),
  due_at              timestamptz,
  late_penalty_pct    numeric(5,2) default 0 check (late_penalty_pct is null or late_penalty_pct >= 0),
  -- Parent visibility
  parent_visible      boolean not null default true,
  parent_notify_on_issue boolean not null default false,
  parent_notify_on_grade boolean not null default true,
  -- MOE
  moe_subject_code    text,
  moe_report_year     integer,
  status              text not null default 'draft'
    check (status in ('draft','published','closed','graded','archived','cancelled')),
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint,
  updated_by          bigint,
  unique (tenant_id, course_id, assignment_code)
);
create index if not exists idx_edu_assignments_tenant on public.edu_assignments (tenant_id);
create index if not exists idx_edu_assignments_course on public.edu_assignments (course_id);
create index if not exists idx_edu_assignments_due on public.edu_assignments (due_at, status);
create index if not exists idx_edu_assignments_parent_visible on public.edu_assignments (parent_visible) where parent_visible = true;

-- ------------------------------------------------------------
-- PART F: edu_submissions -- student work + grades
-- ------------------------------------------------------------
create table if not exists public.edu_submissions (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  assignment_id            bigint not null references public.edu_assignments(id),
  student_id               bigint not null references public.edu_students(id),
  enrollment_id            bigint references public.edu_enrollments(id),
  submitted_at             timestamptz,
  is_late                  boolean not null default false,
  attempt_number           integer not null default 1 check (attempt_number >= 1),
  content_text             text,
  attachments              jsonb not null default '[]'::jsonb,  -- array of file refs
  raw_score                numeric(7,2) check (raw_score is null or raw_score >= 0),
  final_score              numeric(7,2) check (final_score is null or final_score >= 0),
  letter_grade             text,
  graded_at                timestamptz,
  graded_by                bigint,
  teacher_feedback_he      text,
  -- Parent portal hooks
  parent_viewed_at         timestamptz,
  parent_notified_at       timestamptz,
  parent_acknowledged_at   timestamptz,
  -- MOE
  moe_report_status        text default 'pending'
    check (moe_report_status in ('pending','submitted','accepted','rejected','exempt')),
  moe_report_year          integer,
  status                   text not null default 'pending'
    check (status in ('pending','submitted','under_review','graded','returned','resubmitted','excused','missing')),
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, assignment_id, student_id, attempt_number)
);
create index if not exists idx_edu_submissions_tenant on public.edu_submissions (tenant_id);
create index if not exists idx_edu_submissions_assignment on public.edu_submissions (assignment_id);
create index if not exists idx_edu_submissions_student on public.edu_submissions (student_id);
create index if not exists idx_edu_submissions_enrollment on public.edu_submissions (enrollment_id);
create index if not exists idx_edu_submissions_status on public.edu_submissions (status, is_active);
create index if not exists idx_edu_submissions_parent_unviewed on public.edu_submissions (parent_viewed_at) where parent_viewed_at is null;

-- ============================================================
-- RLS: enable + 3 baseline policies per table
--   * <table>_read_auth     -- authenticated SELECT
--   * <table>_insert_auth   -- authenticated INSERT
--   * <table>_service_all   -- service_role full access
--   (real tenant scoping happens in 00072 + 00068 family.)
-- ============================================================
do $$
declare
  t text;
  tables text[] := array[
    'edu_institutions',
    'edu_courses',
    'edu_students',
    'edu_enrollments',
    'edu_assignments',
    'edu_submissions'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    begin
      execute format($p$
        create policy "%1$s_read_auth" on public.%1$I
          for select to authenticated using (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    begin
      execute format($p$
        create policy "%1$s_insert_auth" on public.%1$I
          for insert to authenticated with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    begin
      execute format($p$
        create policy "%1$s_service_all" on public.%1$I
          for all to service_role using (true) with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ============================================================
-- END 00083_edu_domain.sql
-- ============================================================
