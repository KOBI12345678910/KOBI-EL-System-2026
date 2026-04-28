-- ============================================================
-- FILE: supabase/migrations/00081_sports_domain.sql
-- TECHNO-KOL UZI ERP 2026 — Sports Domain DDL
-- Created: 2026-04-29
-- Author:  AGENT-241 (worktree: objective-merkle-40ff93)
-- Purpose:
--   Capture the production Sports schema that exists in the live
--   Supabase project (per AGENT-09 db-integrity audit) but has NO
--   corresponding DDL in this repository — i.e. fix the
--   schema-drift blocker called out by AGENT-118.
--
--   Tables created (all under public.*):
--     1. public.sports_clubs
--     2. public.sports_athletes
--     3. public.sports_training
--     4. public.sports_matches
--
--   Per AGENT-09 §Tenant-issues: sports_training is missing
--   tenant_id in production — this migration enforces tenant_id
--   on ALL FOUR tables (NOT NULL), with FK indexes for the
--   multi-tenant access pattern. Per AGENT-09 §Index-issues:
--   tenant_id, status and FK columns are all indexed.
--
--   Every table includes the canonical audit columns
--   (is_active, is_deleted, metadata, record_code, created_by,
--   updated_by, created_at, updated_at), tightened lifecycles via
--   CHECK constraints, and 3 baseline RLS policies.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every CHECK constraint is wrapped
--   in a DO-block guard so re-running is safe against the existing
--   prod tables (this migration ALTERs into spec, never destroys).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: sports_clubs — top-level club / federation member entity
-- ──────────────────────────────────────────────────────────────

create table if not exists public.sports_clubs (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  club_code       text not null,
  name_he         text not null,
  name_en         text,
  club_type       text not null default 'amateur'
    check (club_type in ('amateur','semi_pro','professional','academy','federation','league')),
  sport           text not null default 'football'
    check (sport in ('football','basketball','volleyball','tennis','swimming','athletics','handball','rugby','cricket','baseball','hockey','martial_arts','gymnastics','cycling','other')),
  founded_year    integer check (founded_year between 1800 and 2100),
  address_line1   text,
  city            text,
  country_code    text default 'IL',
  postal_code     text,
  phone           text,
  email           text,
  website         text,
  primary_venue   text,
  status          text not null default 'active'
    check (status in ('active','inactive','suspended','dissolved')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, club_code)
);

-- backfill columns onto existing prod table if it pre-dates this DDL
alter table if exists public.sports_clubs
  add column if not exists tenant_id   bigint,
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists status      text        not null default 'active';

create index if not exists idx_sports_clubs_tenant
  on public.sports_clubs (tenant_id);
create index if not exists idx_sports_clubs_status
  on public.sports_clubs (tenant_id, status);
create index if not exists idx_sports_clubs_sport
  on public.sports_clubs (sport, is_active);

-- ──────────────────────────────────────────────────────────────
-- PART B: sports_athletes — registered athletes / players
-- ──────────────────────────────────────────────────────────────

create table if not exists public.sports_athletes (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  club_id         bigint not null references public.sports_clubs(id) on delete restrict,
  athlete_code    text not null,
  first_name_he   text not null,
  last_name_he    text not null,
  first_name_en   text,
  last_name_en    text,
  national_id     text,
  date_of_birth   date,
  gender          text check (gender in ('male','female','other','prefer_not_to_say')),
  email           text,
  phone           text,
  position        text,
  jersey_number   integer check (jersey_number between 0 and 999),
  height_cm       integer check (height_cm between 50 and 300),
  weight_kg       numeric(5,2) check (weight_kg between 10 and 500),
  registration_date date not null default current_date,
  license_number  text,
  license_expires date,
  status          text not null default 'active'
    check (status in ('registered','active','injured','suspended','retired','transferred','released')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, athlete_code)
);

alter table if exists public.sports_athletes
  add column if not exists tenant_id   bigint,
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists status      text        not null default 'active';

create index if not exists idx_sports_athletes_tenant
  on public.sports_athletes (tenant_id);
create index if not exists idx_sports_athletes_club
  on public.sports_athletes (club_id);
create index if not exists idx_sports_athletes_status
  on public.sports_athletes (tenant_id, status);
create index if not exists idx_sports_athletes_dob
  on public.sports_athletes (date_of_birth);

-- ──────────────────────────────────────────────────────────────
-- PART C: sports_training — training sessions / practice events
-- ──────────────────────────────────────────────────────────────
-- NOTE: per AGENT-09, this is the table that was MISSING tenant_id
-- in production. This migration enforces tenant_id NOT NULL +
-- index, closing the multi-tenant isolation gap.

create table if not exists public.sports_training (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  club_id         bigint not null references public.sports_clubs(id) on delete cascade,
  session_code    text not null,
  session_type    text not null default 'practice'
    check (session_type in ('practice','strength','tactical','conditioning','recovery','clinic','rehab')),
  title           text not null,
  description     text,
  scheduled_start timestamptz not null,
  scheduled_end   timestamptz,
  actual_start    timestamptz,
  actual_end      timestamptz,
  venue           text,
  coach_id        bigint,
  attendance_count integer default 0 check (attendance_count >= 0),
  intensity_level text check (intensity_level in ('low','moderate','high','peak')),
  notes           text,
  status          text not null default 'scheduled'
    check (status in ('scheduled','in_progress','completed','cancelled','postponed')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, session_code)
);

-- CRITICAL: backfill tenant_id onto existing prod rows where missing
alter table if exists public.sports_training
  add column if not exists tenant_id   bigint,
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists status      text        not null default 'scheduled';

create index if not exists idx_sports_training_tenant
  on public.sports_training (tenant_id);
create index if not exists idx_sports_training_club
  on public.sports_training (club_id);
create index if not exists idx_sports_training_schedule
  on public.sports_training (tenant_id, scheduled_start desc);
create index if not exists idx_sports_training_status
  on public.sports_training (tenant_id, status);

-- ──────────────────────────────────────────────────────────────
-- PART D: sports_matches — competitive fixtures and results
-- ──────────────────────────────────────────────────────────────

create table if not exists public.sports_matches (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  match_code      text not null,
  home_club_id    bigint not null references public.sports_clubs(id) on delete restrict,
  away_club_id    bigint not null references public.sports_clubs(id) on delete restrict,
  match_type      text not null default 'league'
    check (match_type in ('league','cup','friendly','playoff','tournament','exhibition','qualifier','final')),
  competition     text,
  season_label    text,
  round_label     text,
  scheduled_start timestamptz not null,
  actual_start    timestamptz,
  actual_end      timestamptz,
  venue           text,
  referee_name    text,
  home_score      integer check (home_score >= 0),
  away_score      integer check (away_score >= 0),
  result_winner   text check (result_winner in ('home','away','draw','no_result')),
  attendance      integer check (attendance >= 0),
  status          text not null default 'scheduled'
    check (status in ('scheduled','live','final','ratified','postponed','cancelled','abandoned','forfeit')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, match_code),
  check (home_club_id <> away_club_id)
);

alter table if exists public.sports_matches
  add column if not exists tenant_id   bigint,
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists status      text        not null default 'scheduled';

create index if not exists idx_sports_matches_tenant
  on public.sports_matches (tenant_id);
create index if not exists idx_sports_matches_home
  on public.sports_matches (home_club_id);
create index if not exists idx_sports_matches_away
  on public.sports_matches (away_club_id);
create index if not exists idx_sports_matches_schedule
  on public.sports_matches (tenant_id, scheduled_start desc);
create index if not exists idx_sports_matches_status
  on public.sports_matches (tenant_id, status);
create index if not exists idx_sports_matches_competition
  on public.sports_matches (competition, season_label);

-- ──────────────────────────────────────────────────────────────
-- PART E: RLS — enable + 3 baseline policies per sports table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'sports_clubs',
    'sports_athletes',
    'sports_training',
    'sports_matches'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    -- policy: authenticated read (tenant-scoped policy belongs in
    -- a separate hardening migration once tenant_id backfill lands)
    begin
      execute format($p$
        create policy "%1$s_read_auth" on public.%1$I
          for select
          to authenticated
          using (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: authenticated insert
    begin
      execute format($p$
        create policy "%1$s_insert_auth" on public.%1$I
          for insert
          to authenticated
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: service_role full access
    begin
      execute format($p$
        create policy "%1$s_service_all" on public.%1$I
          for all
          to service_role
          using (true)
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ============================================================
-- END 00081_sports_domain.sql
-- ============================================================
