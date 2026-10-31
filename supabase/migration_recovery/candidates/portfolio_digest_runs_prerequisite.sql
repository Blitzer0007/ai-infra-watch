-- REVIEW-ONLY CANDIDATE; not in supabase/migrations/ and not applied to production.
-- This prerequisite must sort immediately before the recorded 20261013233140
-- server-only RLS migration on a fresh database. The recorded migration expects
-- public.portfolio_digest_runs to exist but does not create it.
--
-- On the existing production schema, CREATE TABLE IF NOT EXISTS is a no-op.
-- A subsequent reviewed migration/application plan must record this prerequisite
-- without changing the exact SQL body of the 30 restored historical migrations.

create table if not exists public.portfolio_digest_runs (
  slot_key text primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  delivery jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists portfolio_digest_runs_started_idx
  on public.portfolio_digest_runs (started_at desc);

comment on table public.portfolio_digest_runs is
  'Idempotency ledger for scheduled portfolio digest delivery across redundant schedulers.';
