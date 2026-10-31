create table if not exists public.server_alert_config (
  id text primary key default 'default',
  watchlist jsonb not null default '[]'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  large_move_enabled boolean not null default false,
  large_move_pct numeric not null default 5,
  catalyst_alerts boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.server_alert_config enable row level security;

create table if not exists public.server_alert_state (
  event_key text primary key,
  active boolean not null default false,
  last_seen_at timestamptz,
  last_triggered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.server_alert_state enable row level security;

create index if not exists server_alert_state_last_triggered_idx
  on public.server_alert_state (last_triggered_at);
