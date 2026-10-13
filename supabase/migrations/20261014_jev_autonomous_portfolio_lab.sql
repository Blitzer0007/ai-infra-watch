create table if not exists public.jev_paper_proposals (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique check (length(client_id) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mode text not null default 'paper' check (mode = 'paper'),
  universe text not null default 'US' check (universe = 'US'),
  review_frequency text not null default 'weekly' check (review_frequency = 'weekly'),
  capital numeric not null check (capital > 0),
  cost_bps numeric not null default 10 check (cost_bps between 0 and 500),
  target jsonb not null default '[]'::jsonb check (jsonb_typeof(target) = 'array'),
  benchmarks jsonb not null default '["SPY","QQQ"]'::jsonb check (jsonb_typeof(benchmarks) = 'array'),
  preview jsonb not null default '{}'::jsonb check (jsonb_typeof(preview) = 'object'),
  research_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(research_snapshot) = 'object'),
  backtest_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(backtest_snapshot) = 'object'),
  evidence_status text not null default 'insufficient' check (evidence_status in ('insufficient','partial','usable','strong')),
  status text not null default 'manual-review' check (status in ('manual-review','approved','archived'))
);

create index if not exists jev_paper_proposals_created_at_idx
  on public.jev_paper_proposals (created_at desc);

alter table public.jev_paper_proposals enable row level security;

comment on table public.jev_paper_proposals is
  'Server-side history for JEV paper-only portfolio proposals. Access is through authenticated server endpoints using the service role; this table never represents broker orders.';
