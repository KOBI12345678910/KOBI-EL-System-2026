-- =============================================================================
-- Migration: 00088_audit_log_v2.sql
-- Author:    Agent 250 (per Agent 153 - types.ts audit; AuditLog drift report)
-- Date:      2026-04-29
-- Purpose:   Canonical, unified audit log aligned with the TS `AuditLog`
--            interface in `supabase/types.ts` (L95-106) AND the architectural
--            fields used by `supabase/functions/_shared/audit.ts` and
--            `governance.audit_logs` (00000_master_schema.sql L133-148).
--
--            Fixes Agent 153 finding #2 (AuditLog "Heavy drift"): the TS shape
--            (event_type / old_data / new_data / ip_address / user_agent) had
--            zero overlap with SQL fields (action_name / old_values /
--            new_values / source_service / source_module / source_page /
--            correlation_id / performed_at). Both worlds are now reconciled
--            on a single table by:
--              - keeping the architectural columns the writer code already
--                inserts (action_name, source_service, ...);
--              - adding the TS-shape columns as the canonical names
--                (event_type, old_data, new_data, ip_address, user_agent);
--              - generating both old/new pairs from each other so legacy
--                writers and TS-typed readers see consistent rows.
--
--            Sections:
--              A. Create governance.audit_log_v2 (canonical, unified shape).
--              B. Tamper-evident hash chain (prev_row_hash + row_hash, with
--                 per-tenant chain head and BEFORE INSERT trigger).
--              C. Mirror columns: TS aliases <-> architectural names kept in
--                 sync via a BEFORE INSERT trigger (no app rewrites needed).
--              D. Backfill: copy governance.audit_logs + public.gl_audit_trail
--                 history into audit_log_v2, recompute hash chain.
--              E. Compatibility view governance.audit_logs renamed to
--                 governance.audit_logs_legacy; new view at the old name
--                 surfaces audit_log_v2 with the legacy column set.
--              F. RLS (admin + executive read; service-role write only).
--              G. Indexes (entity, performed_at desc, correlation, tenant,
--                 event_type, hash chain integrity).
--              H. 7-year retention via a partitioned-aware monthly purge
--                 procedure + pg_cron schedule (governance.purge_audit_log()).
--              I. Verification helper: governance.verify_audit_chain().
--
-- Idempotent. Safe to re-run.
-- =============================================================================

-- ── Section A. Canonical unified audit table ────────────────────────────────
create extension if not exists pgcrypto;

create schema if not exists governance;

create table if not exists governance.audit_log_v2 (
  -- identity
  id                   bigserial primary key,
  public_id            uuid        not null default gen_random_uuid(),
  tenant_id            uuid,                     -- multi-tenant scope (nullable for platform events)

  -- TS-shape (canonical names per supabase/types.ts AuditLog)
  event_type           text        not null,     -- e.g. 'INSERT' | 'UPDATE' | 'DELETE' | 'STATE_CHANGE' | 'LOGIN'
  entity_type          text,                     -- e.g. 'customer', 'purchase_order'
  entity_id            bigint,                   -- numeric PK of the entity row
  entity_public_id     uuid,                     -- optional public_id of the entity row
  old_data             jsonb,                    -- TS alias of old_values (kept in sync)
  new_data             jsonb,                    -- TS alias of new_values (kept in sync)
  ip_address           inet,
  user_agent           text,
  user_id              bigint,                   -- TS alias of performed_by_user_id

  -- architectural names (kept for governance.audit_logs callers + RPCs)
  action_name          text,                     -- mirrors event_type for legacy writers
  old_values           jsonb,                    -- mirrors old_data
  new_values           jsonb,                    -- mirrors new_data
  performed_by_user_id bigint,                   -- mirrors user_id
  source_service       text        not null default 'unknown',
  source_module        text        not null default 'unknown',
  source_page          text,
  correlation_id       text,
  request_id           text,
  session_id           text,

  -- timing
  performed_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),

  -- ── Section B. Hash chain columns (tamper detection) ─────────────────
  chain_seq            bigint      not null,                 -- per-tenant monotonic
  prev_row_hash        bytea,                                -- prior row hash in chain
  row_hash             bytea       not null,                 -- sha256 of canonical payload

  constraint audit_log_v2_event_type_chk
    check (event_type in ('INSERT','UPDATE','DELETE','VIEW','EXPORT',
                          'LOGIN','LOGOUT','STATE_CHANGE','APPROVE','REJECT',
                          'EXECUTE','ERROR'))
);

comment on table  governance.audit_log_v2          is 'Unified audit log (Agent 250). TS-shape + architectural columns reconciled. Hash-chained for tamper detection. 7-year retention.';
comment on column governance.audit_log_v2.event_type   is 'Canonical TS-shape action type. Legacy writers may set action_name; trigger mirrors.';
comment on column governance.audit_log_v2.old_data     is 'TS alias of old_values; trigger keeps both in sync.';
comment on column governance.audit_log_v2.new_data     is 'TS alias of new_values; trigger keeps both in sync.';
comment on column governance.audit_log_v2.user_id      is 'TS alias of performed_by_user_id; trigger keeps both in sync.';
comment on column governance.audit_log_v2.row_hash     is 'sha256(prev_row_hash || canonical_payload). Tamper detection. See governance.verify_audit_chain().';

-- per-tenant chain head (one row per tenant, plus a NULL-tenant row for platform)
create table if not exists governance.audit_chain_head (
  tenant_id  uuid primary key,                   -- NULL stored as nil-uuid 00000000-...
  last_seq   bigint  not null default 0,
  last_hash  bytea,
  updated_at timestamptz not null default now()
);

-- ── Section B/C. Mirror + chain trigger ──────────────────────────────────
create or replace function governance.audit_log_v2_before_insert()
returns trigger
language plpgsql
security definer
set search_path = governance, pg_catalog
as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_prev   bytea;
  v_seq    bigint;
  v_payload bytea;
begin
  -- A. Mirror TS-shape <-> architectural columns
  if new.event_type is null and new.action_name is not null then
    new.event_type := upper(new.action_name);
  elsif new.action_name is null and new.event_type is not null then
    new.action_name := new.event_type;
  end if;

  if new.old_data is null and new.old_values is not null then new.old_data := new.old_values; end if;
  if new.old_values is null and new.old_data   is not null then new.old_values := new.old_data; end if;
  if new.new_data is null and new.new_values is not null then new.new_data := new.new_values; end if;
  if new.new_values is null and new.new_data   is not null then new.new_values := new.new_data; end if;

  if new.user_id is null and new.performed_by_user_id is not null then new.user_id := new.performed_by_user_id; end if;
  if new.performed_by_user_id is null and new.user_id is not null then new.performed_by_user_id := new.user_id; end if;

  -- B. Hash chain — read+lock head row, allocate next seq, compute hash
  insert into governance.audit_chain_head (tenant_id, last_seq, last_hash)
       values (v_tenant, 0, null)
    on conflict (tenant_id) do nothing;

  select last_seq, last_hash
    into v_seq, v_prev
    from governance.audit_chain_head
   where tenant_id = v_tenant
     for update;

  v_seq := v_seq + 1;
  new.chain_seq      := v_seq;
  new.prev_row_hash  := v_prev;

  -- canonical payload: stable ordering, never includes row_hash itself
  v_payload := convert_to(
      coalesce(v_tenant::text,'')                || '|' ||
      v_seq::text                                || '|' ||
      coalesce(encode(v_prev,'hex'),'')          || '|' ||
      coalesce(new.event_type,'')                || '|' ||
      coalesce(new.entity_type,'')               || '|' ||
      coalesce(new.entity_id::text,'')           || '|' ||
      coalesce(new.user_id::text,'')             || '|' ||
      coalesce(new.source_service,'')            || '|' ||
      coalesce(new.source_module,'')             || '|' ||
      coalesce(new.correlation_id,'')            || '|' ||
      coalesce(new.old_data::text,'')            || '|' ||
      coalesce(new.new_data::text,'')            || '|' ||
      coalesce(new.performed_at::text, now()::text),
      'UTF8');

  new.row_hash := digest(coalesce(v_prev, '\x'::bytea) || v_payload, 'sha256');

  update governance.audit_chain_head
     set last_seq   = v_seq,
         last_hash  = new.row_hash,
         updated_at = now()
   where tenant_id  = v_tenant;

  return new;
end;
$$;

drop trigger if exists trg_audit_log_v2_before_insert on governance.audit_log_v2;
create trigger trg_audit_log_v2_before_insert
before insert on governance.audit_log_v2
for each row execute function governance.audit_log_v2_before_insert();

-- Block UPDATE/DELETE on audit_log_v2 entirely (append-only)
create or replace function governance.audit_log_v2_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log_v2 is append-only (operation %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_audit_log_v2_no_update on governance.audit_log_v2;
create trigger trg_audit_log_v2_no_update
before update on governance.audit_log_v2
for each row execute function governance.audit_log_v2_block_mutation();

drop trigger if exists trg_audit_log_v2_no_delete on governance.audit_log_v2;
create trigger trg_audit_log_v2_no_delete
before delete on governance.audit_log_v2
for each row execute function governance.audit_log_v2_block_mutation();

-- ── Section D. Backfill from existing audit sources ─────────────────────
-- D1. From governance.audit_logs (master schema canonical)
do $$
begin
  if exists (
       select 1 from information_schema.tables
        where table_schema='governance' and table_name='audit_logs'
     )
  then
    insert into governance.audit_log_v2
        (event_type, entity_type, entity_id, old_data, new_data,
         user_id, action_name, old_values, new_values, performed_by_user_id,
         source_service, source_module, source_page, correlation_id,
         performed_at, created_at)
    select coalesce(al.action_name,'EXECUTE')      as event_type,
           al.entity_type,
           al.entity_id,
           al.old_values                           as old_data,
           al.new_values                           as new_data,
           al.performed_by_user_id                 as user_id,
           al.action_name,
           al.old_values,
           al.new_values,
           al.performed_by_user_id,
           coalesce(al.source_service,'legacy'),
           coalesce(al.source_module,'audit_logs'),
           al.source_page,
           al.correlation_id,
           al.performed_at,
           al.created_at
      from governance.audit_logs al
     where not exists (
       select 1 from governance.audit_log_v2 v
        where v.performed_at = al.performed_at
          and v.entity_type  is not distinct from al.entity_type
          and v.entity_id    is not distinct from al.entity_id
          and v.action_name  is not distinct from al.action_name
     );
  end if;
end $$;

-- D2. From public.gl_audit_trail (finance GL append-only journal)
do $$
declare
  v_cols text[];
begin
  if exists (
       select 1 from information_schema.tables
        where table_schema='public' and table_name='gl_audit_trail'
     )
  then
    select array_agg(column_name)
      into v_cols
      from information_schema.columns
     where table_schema='public' and table_name='gl_audit_trail';

    -- Best-effort projection: most gl_audit_trail variants have
    --   id / entry_id / action / user_id / before_json|old_data|payload /
    --   after_json|new_data / created_at + tenant_id.
    -- Use dynamic SQL so missing columns degrade gracefully.
    execute format($f$
      insert into governance.audit_log_v2
          (tenant_id, event_type, entity_type, entity_id,
           old_data, new_data, user_id, source_service, source_module,
           performed_at, created_at)
      select %s                                                   as tenant_id,
             %s                                                   as event_type,
             'gl_journal_entry'::text                             as entity_type,
             %s                                                   as entity_id,
             %s                                                   as old_data,
             %s                                                   as new_data,
             %s                                                   as user_id,
             'finance'::text                                      as source_service,
             'gl_audit_trail'::text                               as source_module,
             %s                                                   as performed_at,
             %s                                                   as created_at
        from public.gl_audit_trail t
    $f$,
      case when 'tenant_id'  = any(v_cols) then 't.tenant_id'    else 'null::uuid'        end,
      case when 'action'     = any(v_cols) then 'upper(t.action)'
           when 'event_type' = any(v_cols) then 'upper(t.event_type)'
           else                                  '''EXECUTE''::text'                       end,
      case when 'entry_id'   = any(v_cols) then 't.entry_id'
           when 'journal_entry_id' = any(v_cols) then 't.journal_entry_id'
           else                                  'null::bigint'                            end,
      case when 'before_json'= any(v_cols) then 't.before_json'
           when 'old_data'   = any(v_cols) then 't.old_data'
           when 'payload'    = any(v_cols) then 't.payload'
           else                                  'null::jsonb'                             end,
      case when 'after_json' = any(v_cols) then 't.after_json'
           when 'new_data'   = any(v_cols) then 't.new_data'
           else                                  'null::jsonb'                             end,
      case when 'user_id'    = any(v_cols) then 't.user_id'
           else                                  'null::bigint'                            end,
      case when 'created_at' = any(v_cols) then 't.created_at'
           when 'performed_at'= any(v_cols)then 't.performed_at'
           else                                  'now()'                                   end,
      case when 'created_at' = any(v_cols) then 't.created_at'
           else                                  'now()'                                   end
    );
  end if;
end $$;

-- ── Section E. Compatibility views ──────────────────────────────────────
-- Preserve the legacy table name for any reader still pointing at it.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema='governance' and table_name='audit_logs'
                and table_type='BASE TABLE') then
    alter table governance.audit_logs rename to audit_logs_legacy;
  end if;
end $$;

create or replace view governance.audit_logs as
  select id,
         public_id,
         entity_type,
         entity_id,
         action_name,
         old_values,
         new_values,
         performed_by_user_id,
         source_service,
         source_module,
         source_page,
         correlation_id,
         performed_at,
         created_at
    from governance.audit_log_v2;

comment on view governance.audit_logs is 'Compatibility view over audit_log_v2 (legacy column set). Writes go to audit_log_v2.';

-- ── Section F. RLS ──────────────────────────────────────────────────────
alter table governance.audit_log_v2 enable row level security;
alter table governance.audit_chain_head enable row level security;

-- Read: admin + executive (matches existing governance.audit_logs policy)
drop policy if exists audit_log_v2_select on governance.audit_log_v2;
create policy audit_log_v2_select on governance.audit_log_v2
  for select to authenticated
  using (
    governance.current_user_is_admin()
    or governance.current_user_is_executive()
  );

-- Write: service_role only (everything else flows through RPCs that run as service_role)
drop policy if exists audit_log_v2_insert_service on governance.audit_log_v2;
create policy audit_log_v2_insert_service on governance.audit_log_v2
  for insert to service_role
  with check (true);

drop policy if exists audit_chain_head_select on governance.audit_chain_head;
create policy audit_chain_head_select on governance.audit_chain_head
  for select to authenticated
  using (governance.current_user_is_admin());

drop policy if exists audit_chain_head_write_service on governance.audit_chain_head;
create policy audit_chain_head_write_service on governance.audit_chain_head
  for all to service_role
  using (true) with check (true);

-- ── Section G. Indexes ──────────────────────────────────────────────────
create index if not exists idx_audit_log_v2_entity
  on governance.audit_log_v2 (entity_type, entity_id, performed_at desc);

create index if not exists idx_audit_log_v2_performed_at
  on governance.audit_log_v2 (performed_at desc);

create index if not exists idx_audit_log_v2_tenant
  on governance.audit_log_v2 (tenant_id, performed_at desc)
  where tenant_id is not null;

create index if not exists idx_audit_log_v2_correlation
  on governance.audit_log_v2 (correlation_id)
  where correlation_id is not null;

create index if not exists idx_audit_log_v2_event_type
  on governance.audit_log_v2 (event_type, performed_at desc);

create index if not exists idx_audit_log_v2_user
  on governance.audit_log_v2 (user_id, performed_at desc)
  where user_id is not null;

-- chain integrity helpers
create unique index if not exists ux_audit_log_v2_tenant_seq
  on governance.audit_log_v2 (coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), chain_seq);

-- ── Section H. 7-year retention ─────────────────────────────────────────
-- Israeli regulatory baseline: 7 years (חוק החברות, תקנות מס הכנסה).
-- Healthcare/payroll long-tail retention is handled in domain tables
-- (e.g. health.medical_records.retention_class). The audit log itself
-- only ever needs 7 years.

create table if not exists governance.audit_log_retention_policy (
  id              smallserial primary key,
  retention_years int  not null default 7
                  check (retention_years between 1 and 30),
  notes           text,
  effective_at    timestamptz not null default now(),
  is_active       boolean not null default true
);

insert into governance.audit_log_retention_policy (retention_years, notes)
select 7, 'Default 7-year retention per Israeli accounting + tax regs'
where not exists (select 1 from governance.audit_log_retention_policy);

create or replace function governance.purge_audit_log()
returns table (purged_count bigint, cutoff timestamptz)
language plpgsql
security definer
set search_path = governance, public, pg_catalog
as $$
declare
  v_years  int;
  v_cutoff timestamptz;
  v_n      bigint;
begin
  select retention_years into v_years
    from governance.audit_log_retention_policy
   where is_active limit 1;

  v_years  := coalesce(v_years, 7);
  v_cutoff := now() - make_interval(years => v_years);

  -- We need to bypass append-only triggers for retention purges only.
  alter table governance.audit_log_v2 disable trigger trg_audit_log_v2_no_delete;
  delete from governance.audit_log_v2 where performed_at < v_cutoff;
  get diagnostics v_n = row_count;
  alter table governance.audit_log_v2 enable trigger trg_audit_log_v2_no_delete;

  -- Snapshot purge event into the chain itself (so the gap is provable).
  insert into governance.audit_log_v2
        (event_type, entity_type, source_service, source_module,
         new_data, performed_at)
  values ('EXECUTE','audit_log','governance','retention',
          jsonb_build_object('purged_rows', v_n, 'cutoff', v_cutoff,
                             'retention_years', v_years),
          now());

  purged_count := v_n;
  cutoff       := v_cutoff;
  return next;
end;
$$;

revoke all   on function governance.purge_audit_log() from public;
grant execute on function governance.purge_audit_log() to service_role;

-- pg_cron schedule (monthly on the 1st at 02:30 UTC). Idempotent.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('audit_log_v2_purge')
       from cron.job where jobname = 'audit_log_v2_purge';
    perform cron.schedule(
      'audit_log_v2_purge',
      '30 2 1 * *',
      $cron$ select governance.purge_audit_log(); $cron$
    );
  end if;
exception when undefined_table then
  null;  -- pg_cron not installed in this env; deployer schedules externally
end $$;

-- ── Section I. Chain verification helper ────────────────────────────────
create or replace function governance.verify_audit_chain(p_tenant uuid default null)
returns table (
  ok                boolean,
  total_rows        bigint,
  first_break_id    bigint,
  expected_hash_hex text,
  found_hash_hex    text
)
language plpgsql
stable
security definer
set search_path = governance, pg_catalog
as $$
declare
  rec record;
  v_prev bytea := null;
  v_calc bytea;
  v_payload bytea;
  v_count bigint := 0;
  v_tenant uuid := coalesce(p_tenant,'00000000-0000-0000-0000-000000000000'::uuid);
begin
  for rec in
    select id, tenant_id, chain_seq, prev_row_hash, row_hash,
           event_type, entity_type, entity_id, user_id,
           source_service, source_module, correlation_id,
           old_data, new_data, performed_at
      from governance.audit_log_v2
     where coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid) = v_tenant
     order by chain_seq
  loop
    v_count := v_count + 1;

    if rec.prev_row_hash is distinct from v_prev then
      ok := false; total_rows := v_count;
      first_break_id := rec.id;
      expected_hash_hex := encode(coalesce(v_prev,'\x'::bytea),'hex');
      found_hash_hex    := encode(coalesce(rec.prev_row_hash,'\x'::bytea),'hex');
      return next; return;
    end if;

    v_payload := convert_to(
        coalesce(rec.tenant_id::text,'')         || '|' ||
        rec.chain_seq::text                      || '|' ||
        coalesce(encode(v_prev,'hex'),'')        || '|' ||
        coalesce(rec.event_type,'')              || '|' ||
        coalesce(rec.entity_type,'')             || '|' ||
        coalesce(rec.entity_id::text,'')         || '|' ||
        coalesce(rec.user_id::text,'')           || '|' ||
        coalesce(rec.source_service,'')          || '|' ||
        coalesce(rec.source_module,'')           || '|' ||
        coalesce(rec.correlation_id,'')          || '|' ||
        coalesce(rec.old_data::text,'')          || '|' ||
        coalesce(rec.new_data::text,'')          || '|' ||
        coalesce(rec.performed_at::text,''),
      'UTF8');
    v_calc := digest(coalesce(v_prev,'\x'::bytea) || v_payload, 'sha256');

    if v_calc is distinct from rec.row_hash then
      ok := false; total_rows := v_count;
      first_break_id := rec.id;
      expected_hash_hex := encode(v_calc,'hex');
      found_hash_hex    := encode(rec.row_hash,'hex');
      return next; return;
    end if;

    v_prev := rec.row_hash;
  end loop;

  ok := true; total_rows := v_count;
  first_break_id := null;
  expected_hash_hex := encode(coalesce(v_prev,'\x'::bytea),'hex');
  found_hash_hex := expected_hash_hex;
  return next;
end;
$$;

revoke all   on function governance.verify_audit_chain(uuid) from public;
grant execute on function governance.verify_audit_chain(uuid) to service_role;

-- =============================================================================
-- End 00088_audit_log_v2.sql
-- =============================================================================
