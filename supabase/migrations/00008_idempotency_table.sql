-- =========================================================
-- Migration 008: Idempotency Keys Table
-- TechnoKol Uzi ERP 2026
--
-- Supports duplicate-prevention for retried edge function calls.
-- Referenced by supabase/functions/_shared/idempotency.ts
-- =========================================================

create table if not exists governance.idempotency_keys (
  id bigserial primary key,
  key text not null unique,
  result jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_idempotency_key on governance.idempotency_keys(key);
create index if not exists idx_idempotency_expires on governance.idempotency_keys(expires_at);

-- Auto-cleanup expired keys (can also be done via pg_cron)
-- For now, the edge function checks expires_at on read.
