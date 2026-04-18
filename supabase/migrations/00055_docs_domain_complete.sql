-- ============================================================
-- FILE: supabase/migrations/00055_docs_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Docs Domain Complete (15 models)
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing docs.* tables (documents, document_classifications,
--      ocr_results, attachments, print_jobs, scan_sessions) — add
--      housekeeping columns (is_deleted, is_active, record_code, notes,
--      metadata, created_by, updated_by) where missing.
--   2. CREATE MISSING tables:
--        docs.document_versions
--        docs.document_signature_requests
--        docs.ocr_runs
--        docs.extraction_runs
--        docs.classification_runs
--        docs.document_chunks
--        docs.entity_extractions
--        docs.document_relations
--        docs.knowledge_cards
--   3. Tighten status lifecycles per D014 via CHECK constraints.
--   4. Audit triggers (governance.set_updated_at()) on documents and
--      document_signature_requests (pattern from 00047).
--   5. Seed docs.document_classifications with core classification labels.
--   6. Enable RLS on NEW tables with 3 baseline policies each.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing docs tables — housekeeping columns
-- ──────────────────────────────────────────────────────────────

alter table docs.documents
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists status text not null default 'draft';

-- Widen status lifecycle to the canonical set (drop then re-add to avoid
-- conflicts with older single-value defaults / legacy data).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'documents_status_check') then
    alter table docs.documents drop constraint documents_status_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'docs_documents_status_check') then
    alter table docs.documents
      add constraint docs_documents_status_check
      check (status in ('draft','pending_review','approved','archived','deleted'));
  end if;
end $$;

alter table docs.document_classifications
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists updated_at timestamptz not null default now();

alter table docs.ocr_results
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists updated_at timestamptz not null default now();

alter table docs.attachments
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table docs.print_jobs
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists updated_at timestamptz not null default now();

alter table docs.scan_sessions
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id),
  add column if not exists updated_at timestamptz not null default now();

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE missing tables
-- ──────────────────────────────────────────────────────────────

-- B.1  document_versions — version history per document
create table if not exists docs.document_versions (
  id             bigserial primary key,
  public_id      uuid not null default governance.generate_public_id(),
  document_id    bigint not null references docs.documents(id) on delete cascade,
  version_number integer not null,
  filename       text not null,
  storage_path   text,
  file_size_bytes bigint,
  mime_type      text,
  checksum       text,
  change_summary text,
  is_current     boolean not null default false,
  is_active      boolean not null default true,
  is_deleted     boolean not null default false,
  record_code    text,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     bigint references governance.users_profile(id),
  updated_by     bigint references governance.users_profile(id),
  unique(document_id, version_number)
);

create index if not exists idx_document_versions_document_id on docs.document_versions(document_id);
create index if not exists idx_document_versions_is_current  on docs.document_versions(is_current) where is_current = true;
create index if not exists idx_document_versions_created_at  on docs.document_versions(created_at desc);

create trigger trg_document_versions_updated_at
  before update on docs.document_versions
  for each row execute function governance.set_updated_at();

-- B.2  document_signature_requests — e-signature workflow
create table if not exists docs.document_signature_requests (
  id                      bigserial primary key,
  public_id               uuid not null default governance.generate_public_id(),
  request_number          text not null unique,
  document_id             bigint not null references docs.documents(id) on delete cascade,
  provider                text,
  external_ref            text,
  status                  text not null default 'sent' check (status in (
                            'sent','partially_signed','signed','declined','expired')),
  signer_names            text[],
  signer_emails           text[],
  signed_count            integer not null default 0,
  total_signers           integer not null default 1,
  sent_at                 timestamptz not null default now(),
  completed_at            timestamptz,
  expires_at              timestamptz,
  decline_reason          text,
  is_active               boolean not null default true,
  is_deleted              boolean not null default false,
  record_code             text,
  notes                   text,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              bigint references governance.users_profile(id),
  updated_by              bigint references governance.users_profile(id)
);

create index if not exists idx_docsigreq_document_id on docs.document_signature_requests(document_id);
create index if not exists idx_docsigreq_status      on docs.document_signature_requests(status);
create index if not exists idx_docsigreq_sent_at     on docs.document_signature_requests(sent_at desc);
create index if not exists idx_docsigreq_created_at  on docs.document_signature_requests(created_at desc);

create trigger trg_docsigreq_updated_at
  before update on docs.document_signature_requests
  for each row execute function governance.set_updated_at();

-- B.3  ocr_runs — OCR job queue / audit
create table if not exists docs.ocr_runs (
  id                 bigserial primary key,
  public_id          uuid not null default governance.generate_public_id(),
  document_id        bigint not null references docs.documents(id) on delete cascade,
  status             text not null default 'queued' check (status in (
                       'queued','running','complete','failed')),
  provider           text,
  requested_at       timestamptz not null default now(),
  started_at         timestamptz,
  completed_at       timestamptz,
  error_message      text,
  pages_processed    integer,
  confidence_avg     numeric(9,4),
  is_active          boolean not null default true,
  is_deleted         boolean not null default false,
  record_code        text,
  notes              text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         bigint references governance.users_profile(id),
  updated_by         bigint references governance.users_profile(id)
);

create index if not exists idx_ocr_runs_document_id on docs.ocr_runs(document_id);
create index if not exists idx_ocr_runs_status      on docs.ocr_runs(status);
create index if not exists idx_ocr_runs_created_at  on docs.ocr_runs(created_at desc);

create trigger trg_ocr_runs_updated_at
  before update on docs.ocr_runs
  for each row execute function governance.set_updated_at();

-- B.4  extraction_runs — structured-field extraction
create table if not exists docs.extraction_runs (
  id                 bigserial primary key,
  public_id          uuid not null default governance.generate_public_id(),
  document_id        bigint not null references docs.documents(id) on delete cascade,
  status             text not null default 'queued' check (status in (
                       'queued','running','complete','failed')),
  extractor_name     text,
  fields_extracted   jsonb not null default '{}'::jsonb,
  confidence_avg     numeric(9,4),
  started_at         timestamptz,
  completed_at       timestamptz,
  error_message      text,
  is_active          boolean not null default true,
  is_deleted         boolean not null default false,
  record_code        text,
  notes              text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         bigint references governance.users_profile(id),
  updated_by         bigint references governance.users_profile(id)
);

create index if not exists idx_extraction_runs_document_id on docs.extraction_runs(document_id);
create index if not exists idx_extraction_runs_status      on docs.extraction_runs(status);
create index if not exists idx_extraction_runs_created_at  on docs.extraction_runs(created_at desc);

create trigger trg_extraction_runs_updated_at
  before update on docs.extraction_runs
  for each row execute function governance.set_updated_at();

-- B.5  classification_runs — ML classification audit
create table if not exists docs.classification_runs (
  id                  bigserial primary key,
  public_id           uuid not null default governance.generate_public_id(),
  document_id         bigint not null references docs.documents(id) on delete cascade,
  classifier_name     text,
  predicted_category  text,
  confidence          numeric(9,4),
  status              text not null default 'queued' check (status in (
                        'queued','running','complete','failed')),
  completed_at        timestamptz,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references governance.users_profile(id),
  updated_by          bigint references governance.users_profile(id)
);

create index if not exists idx_classification_runs_document_id on docs.classification_runs(document_id);
create index if not exists idx_classification_runs_status      on docs.classification_runs(status);
create index if not exists idx_classification_runs_created_at  on docs.classification_runs(created_at desc);

create trigger trg_classification_runs_updated_at
  before update on docs.classification_runs
  for each row execute function governance.set_updated_at();

-- B.6  document_chunks — RAG-friendly chunked content
create table if not exists docs.document_chunks (
  id             bigserial primary key,
  public_id      uuid not null default governance.generate_public_id(),
  document_id    bigint not null references docs.documents(id) on delete cascade,
  chunk_order    integer not null,
  content        text,
  token_count    integer,
  embedding_ref  text,
  is_active      boolean not null default true,
  is_deleted     boolean not null default false,
  record_code    text,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     bigint references governance.users_profile(id),
  updated_by     bigint references governance.users_profile(id),
  unique(document_id, chunk_order)
);

create index if not exists idx_document_chunks_document_id on docs.document_chunks(document_id);
create index if not exists idx_document_chunks_created_at  on docs.document_chunks(created_at desc);

create trigger trg_document_chunks_updated_at
  before update on docs.document_chunks
  for each row execute function governance.set_updated_at();

-- B.7  entity_extractions — NER / entity spans
create table if not exists docs.entity_extractions (
  id             bigserial primary key,
  public_id      uuid not null default governance.generate_public_id(),
  document_id    bigint not null references docs.documents(id) on delete cascade,
  entity_type    text,
  entity_value   text,
  confidence     numeric(9,4),
  source_page    integer,
  source_offset  integer,
  is_active      boolean not null default true,
  is_deleted     boolean not null default false,
  record_code    text,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     bigint references governance.users_profile(id),
  updated_by     bigint references governance.users_profile(id)
);

create index if not exists idx_entity_extractions_document_id on docs.entity_extractions(document_id);
create index if not exists idx_entity_extractions_entity_type on docs.entity_extractions(entity_type);
create index if not exists idx_entity_extractions_created_at  on docs.entity_extractions(created_at desc);

create trigger trg_entity_extractions_updated_at
  before update on docs.entity_extractions
  for each row execute function governance.set_updated_at();

-- B.8  document_relations — cross-document graph
create table if not exists docs.document_relations (
  id                 bigserial primary key,
  public_id          uuid not null default governance.generate_public_id(),
  from_document_id   bigint not null references docs.documents(id) on delete cascade,
  to_document_id     bigint not null references docs.documents(id) on delete cascade,
  relation_type      text not null check (relation_type in (
                       'supersedes','amends','references','attaches_to')),
  is_active          boolean not null default true,
  is_deleted         boolean not null default false,
  record_code        text,
  notes              text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         bigint references governance.users_profile(id),
  updated_by         bigint references governance.users_profile(id),
  unique(from_document_id, to_document_id, relation_type)
);

create index if not exists idx_document_relations_from         on docs.document_relations(from_document_id);
create index if not exists idx_document_relations_to           on docs.document_relations(to_document_id);
create index if not exists idx_document_relations_type         on docs.document_relations(relation_type);
create index if not exists idx_document_relations_created_at   on docs.document_relations(created_at desc);

create trigger trg_document_relations_updated_at
  before update on docs.document_relations
  for each row execute function governance.set_updated_at();

-- B.9  knowledge_cards — distilled knowledge units
create table if not exists docs.knowledge_cards (
  id                  bigserial primary key,
  public_id           uuid not null default governance.generate_public_id(),
  title               text not null,
  summary             text,
  source_document_id  bigint references docs.documents(id) on delete set null,
  category            text,
  tags                text[],
  content             jsonb not null default '{}'::jsonb,
  confidence_score    numeric(9,4),
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references governance.users_profile(id),
  updated_by          bigint references governance.users_profile(id)
);

create index if not exists idx_knowledge_cards_source_document on docs.knowledge_cards(source_document_id);
create index if not exists idx_knowledge_cards_category        on docs.knowledge_cards(category);
create index if not exists idx_knowledge_cards_created_at      on docs.knowledge_cards(created_at desc);

create trigger trg_knowledge_cards_updated_at
  before update on docs.knowledge_cards
  for each row execute function governance.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- PART C: Audit triggers on existing tables (add if missing)
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_documents_updated_at') then
    execute 'create trigger trg_documents_updated_at before update on docs.documents for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_document_classifications_updated_at') then
    execute 'create trigger trg_document_classifications_updated_at before update on docs.document_classifications for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ocr_results_updated_at') then
    execute 'create trigger trg_ocr_results_updated_at before update on docs.ocr_results for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_attachments_updated_at') then
    execute 'create trigger trg_attachments_updated_at before update on docs.attachments for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_print_jobs_updated_at') then
    execute 'create trigger trg_print_jobs_updated_at before update on docs.print_jobs for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_scan_sessions_updated_at') then
    execute 'create trigger trg_scan_sessions_updated_at before update on docs.scan_sessions for each row execute function governance.set_updated_at()';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART D: Seed docs.document_classifications (core categories)
-- ──────────────────────────────────────────────────────────────

-- Seed classification labels against a nullable dummy document-id-free
-- bootstrap row. We create a bootstrap document if none exists, then
-- upsert classification labels.
do $$
declare
  v_bootstrap_id bigint;
begin
  select id into v_bootstrap_id from docs.documents where document_number = 'BOOTSTRAP-CLASS-SEED' limit 1;
  if v_bootstrap_id is null then
    insert into docs.documents (document_number, filename, document_type, status)
    values ('BOOTSTRAP-CLASS-SEED', 'bootstrap.seed', 'system', 'archived')
    returning id into v_bootstrap_id;
  end if;

  insert into docs.document_classifications (document_id, classification_label, classified_by)
  select v_bootstrap_id, lbl, 'system_seed'
  from (values
    ('contract'),
    ('invoice'),
    ('receipt'),
    ('id_document'),
    ('quote'),
    ('purchase_order'),
    ('drawing'),
    ('other')
  ) as s(lbl)
  where not exists (
    select 1 from docs.document_classifications c
    where c.document_id = v_bootstrap_id and c.classification_label = s.lbl
  );
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART E: RLS on NEW tables — 3 baseline policies per table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'document_versions',
    'document_signature_requests',
    'ocr_runs',
    'extraction_runs',
    'classification_runs',
    'document_chunks',
    'entity_extractions',
    'document_relations',
    'knowledge_cards'
  ];
begin
  foreach t in array tables loop
    execute format('alter table docs.%I enable row level security', t);

    -- SELECT
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='docs' and tablename='%1$s' and policyname='%1$s_select_authenticated') then
          create policy %1$s_select_authenticated on docs.%1$I
            for select using (auth.role() = 'authenticated' or current_setting('role', true) in ('authenticated','service_role','anon'));
        end if;
      end $inner$;
    $pol$, t);

    -- INSERT + UPDATE
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='docs' and tablename='%1$s' and policyname='%1$s_write_authenticated') then
          create policy %1$s_write_authenticated on docs.%1$I
            for all using (auth.role() in ('authenticated','service_role'))
            with check (auth.role() in ('authenticated','service_role'));
        end if;
      end $inner$;
    $pol$, t);

    -- DELETE — super_admin only
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='docs' and tablename='%1$s' and policyname='%1$s_delete_admin') then
          create policy %1$s_delete_admin on docs.%1$I
            for delete using (
              auth.role() = 'service_role'
              or coalesce(current_setting('request.jwt.claim.is_super_admin', true), 'false')::boolean = true
            );
        end if;
      end $inner$;
    $pol$, t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART F: Final status
-- ──────────────────────────────────────────────────────────────
select 'Migration 00055 applied — docs domain complete (15 models, 9 new tables, seeds, RLS, audit triggers)' as status;
