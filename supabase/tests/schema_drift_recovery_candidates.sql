\set ON_ERROR_STOP on
begin;

create role anon;
create role authenticated;
create role service_role;

-- Model Supabase's normal public-schema default table grants for objects created
-- by postgres. The historical RLS migration must then remove anon/authenticated
-- access while preserving service_role.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

create table public.portfolio_signal_family_scorecard (
  signal_type text primary key
);

create table public.portfolio_holdings (
  id uuid primary key,
  symbol text not null,
  quantity numeric not null
);
create table public.portfolio_purchase_lots (
  id uuid primary key,
  holding_id uuid not null,
  symbol text not null
);
create table public.portfolio_transactions (
  id uuid primary key,
  symbol text not null
);
create table public.portfolio_cash_flows (
  id uuid primary key,
  flow_type text not null,
  constraint portfolio_cash_flows_flow_type_check
    check (flow_type = any (array['deposit'::text, 'withdrawal'::text, 'dividend'::text, 'fee'::text]))
);

create table public.forecast_model_config (id uuid primary key);
create table public.forecast_snapshots (id uuid primary key);
alter table public.forecast_model_config enable row level security;
alter table public.forecast_snapshots enable row level security;
grant all privileges on table public.forecast_model_config, public.forecast_snapshots
  to anon, authenticated, service_role;

-- A clean replay runs this prerequisite before the exact restored 20261013233140
-- migration, which immediately enables RLS and revokes client grants.
\ir ../migration_recovery/candidates/portfolio_digest_runs_prerequisite.sql
\ir ../migrations/20261013233140_portfolio_digest_runs_server_only_rls.sql

-- Run the forward reconciliation twice to prove additive/idempotent behavior.
\ir ../migration_recovery/candidates/untracked_schema_drift_forward.sql
\ir ../migration_recovery/candidates/untracked_schema_drift_forward.sql

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_signal_family_scorecard'
      and column_name='median_20d_excess_return_pct'
  ) then raise exception 'median_20d_excess_return_pct missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_holdings' and column_name='currency'
  ) then raise exception 'portfolio_holdings.currency missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_purchase_lots' and column_name='currency'
  ) then raise exception 'portfolio_purchase_lots.currency missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_transactions' and column_name='currency'
  ) then raise exception 'portfolio_transactions.currency missing'; end if;

  if not has_table_privilege('anon','public.portfolio_digest_runs','select,insert,update,delete')
     and not has_table_privilege('authenticated','public.portfolio_digest_runs','select,insert,update,delete')
     and has_table_privilege('service_role','public.portfolio_digest_runs','select,insert,update,delete')
  then null;
  else raise exception 'portfolio_digest_runs privilege boundary is incorrect'; end if;

  if has_table_privilege('anon','public.forecast_model_config','select,insert,update,delete')
     or has_table_privilege('authenticated','public.forecast_model_config','select,insert,update,delete')
     or not has_table_privilege('service_role','public.forecast_model_config','select,insert,update,delete')
  then raise exception 'forecast_model_config privilege boundary is incorrect'; end if;

  if has_table_privilege('anon','public.forecast_snapshots','select,insert,update,delete')
     or has_table_privilege('authenticated','public.forecast_snapshots','select,insert,update,delete')
     or not has_table_privilege('service_role','public.forecast_snapshots','select,insert,update,delete')
  then raise exception 'forecast_snapshots privilege boundary is incorrect'; end if;
end;
$$;

insert into public.portfolio_cash_flows (id, flow_type) values
  ('00000000-0000-0000-0000-000000000001','reward');
insert into public.portfolio_holdings (id, symbol, quantity, currency) values
  ('00000000-0000-0000-0000-000000000002','TEST',1,'USD');
insert into public.portfolio_purchase_lots (id, holding_id, symbol, currency) values
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','TEST','USD');
insert into public.portfolio_transactions (id, symbol, currency) values
  ('00000000-0000-0000-0000-000000000004','TEST','USD');

do $$
begin
  if (select count(*) from public.portfolio_cash_flows where flow_type='reward') <> 1 then
    raise exception 'reward flow_type insert did not persist';
  end if;
  if (select currency from public.portfolio_holdings where symbol='TEST') <> 'USD' then
    raise exception 'holdings currency default/check failed';
  end if;
  begin
    insert into public.portfolio_holdings (id,symbol,quantity,currency) values
      ('00000000-0000-0000-0000-000000000005','BAD',1,'US');
    raise exception 'invalid currency unexpectedly passed the check constraint';
  exception when check_violation then
    null;
  end;
end;
$;

rollback;
