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

alter table public.portfolio_signal_family_scorecard
  add column if not exists median_20d_excess_return_pct numeric;

alter table public.decision_journal_entries
  add column if not exists decision_score_pct numeric,
  add column if not exists action_taken text,
  add column if not exists transaction_id uuid references public.portfolio_transactions(id) on delete set null;

alter table public.decision_journal_entries
  drop constraint if exists decision_journal_action_taken_check;

alter table public.decision_journal_entries
  add constraint decision_journal_action_taken_check
  check (action_taken is null or action_taken in ('none','BUY','SELL','HOLD','OTHER'));
