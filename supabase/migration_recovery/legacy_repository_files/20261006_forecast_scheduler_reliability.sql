create table if not exists public.forecast_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null default 'supabase_cron',
  slot text,
  status text not null default 'started',
  http_status integer,
  holdings integer,
  created_count integer,
  skipped_count integer,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists forecast_scheduler_runs_created_at_idx
  on public.forecast_scheduler_runs (created_at desc);

alter table public.forecast_scheduler_runs enable row level security;