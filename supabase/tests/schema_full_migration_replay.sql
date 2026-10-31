\set ON_ERROR_STOP on
begin;

-- Model the existing Supabase project baseline that predates this 30-entry
-- migration slice: shared application tables, Storage, and pg_cron.
-- This test uses PostgreSQL 17 and does not connect to production.

create role anon;
create role authenticated;
create role service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

create table public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  created_at timestamptz not null default now(),
  target_date date,
  horizon text,
  scenario_id text,
  entry_price numeric,
  median numeric,
  p25 numeric,
  p75 numeric,
  p10 numeric,
  p90 numeric,
  status text not null default 'pending',
  verified_at timestamptz,
  actual_date date,
  actual_price numeric,
  actual_return numeric,
  median_error numeric,
  created_source text not null default 'forward_outlook',
  model_version text not null default 'analogue-v1'
);
alter table public.forecast_snapshots enable row level security;

create table public.forecast_model_config (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  horizon integer not null,
  active_model text not null default 'analogue-v1',
  score numeric,
  v1_direction numeric,
  v1_error numeric,
  v2_direction numeric,
  v2_error numeric,
  validation_tests integer,
  updated_at timestamptz not null default now()
);
alter table public.forecast_model_config enable row level security;

create table public.ai_quality_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  suite text not null default 'red-team',
  target text not null default 'ai-infra-watch-research',
  status text not null default 'completed',
  quality_score numeric,
  metrics jsonb not null default '{}'::jsonb
);
alter table public.ai_quality_runs enable row level security;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create schema cron;
create table cron.job (
  jobid bigint primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null,
  active boolean not null default true
);

create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint
language plpgsql
as $$
begin
  insert into cron.job(jobid, jobname, schedule, command)
  values (11, job_name, schedule, command);
  return 11;
end;
$$;

create or replace function cron.alter_job(
  job_id bigint,
  schedule text default null,
  command text default null,
  active boolean default null
)
returns void
language plpgsql
as $$
begin
  update cron.job
  set schedule = coalesce(alter_job.schedule, cron.job.schedule),
      command = coalesce(alter_job.command, cron.job.command),
      active = coalesce(alter_job.active, cron.job.active)
  where jobid = job_id;
  if not found then
    raise exception 'cron job % does not exist in the Supabase baseline fixture', job_id;
  end if;
end;
$$;

-- Exact 30-entry historical migration ledger plus one recorded, ordered reconciliation migration.
\ir ../migrations/20261002040357_create_portfolio_holdings.sql
\ir ../migrations/20261002085841_portfolio_purchase_lots.sql
\ir ../migrations/20261002085858_portfolio_purchase_lot_rpc.sql
\ir ../migrations/20261002085957_portfolio_purchase_lot_initial_rpc.sql
\ir ../migrations/20261002120745_portfolio_signal_scorecard.sql
\ir ../migrations/20261002120754_portfolio_signal_family_scorecard.sql
\ir ../migrations/20261002143822_add_forecast_decision_rules.sql
\ir ../migrations/20261003021324_forecast_evidence_snapshot.sql
\ir ../migrations/20261003130501_server_alerts.sql
\ir ../migrations/20261003133457_forecast_validation_guards.sql
\ir ../migrations/20261004033553_portfolio_transactions_20261004.sql
\ir ../migrations/20261004052337_decision_journal_20261004.sql
\ir ../migrations/20261004093628_20261004_allocation_rules.sql
\ir ../migrations/20261004143120_decision_quality_hardening.sql
\ir ../migrations/20261005145829_forecast_learning_feedback_loop.sql
\ir ../migrations/20261005172559_add_server_smart_alerts_supabase_scheduler.sql
\ir ../migrations/20261005172606_run_server_smart_alerts_immediately.sql
\ir ../migrations/20261005172902_restore_server_smart_alerts_ten_minute_schedule.sql
\ir ../migrations/20261005172936_immediate_server_smart_alert_scan_again.sql
\ir ../migrations/20261005173304_restore_server_smart_alerts_ten_minute_schedule_final.sql
\ir ../migrations/20261006031320_forecast_scheduler_reliability.sql
\ir ../migrations/20261013151254_portfolio_cash_flows_20261013.sql
\ir ../migrations/20261013182018_reentry_watchlist.sql
\ir ../migrations/20261013231950_jev_autonomous_portfolio_lab.sql

-- This recorded reconciliation migration is timestamped before the historical RLS migration.
-- It creates portfolio_digest_runs on a clean database and reconciles the
-- untracked schema deltas while remaining idempotent on current production.
\ir ../migrations/20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql
\ir ../migrations/20261013233140_portfolio_digest_runs_server_only_rls.sql

\ir ../migrations/20261013233340_restrict_portfolio_write_rpcs_and_harden_trigger.sql
\ir ../migrations/20261019160523_reentry_telegram_delivery_outbox_20261015.sql
\ir ../migrations/20261019160530_reentry_dual_path_research_fields_20261015.sql
\ir ../migrations/20261020021802_private_historical_evidence_archive.sql
\ir ../migrations/20261031055343_revoke_unused_direct_grants_private_tables_20261031.sql

-- Re-run the recorded reconciliation migration at the end to verify idempotence.
\ir ../migrations/20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql

do $$
declare
  v_table_name text;
  private_tables text[] := array[
    'ai_quality_runs','decision_journal_entries','forecast_learning_runs',
    'forecast_scheduler_runs','historical_data_artifacts','jev_paper_proposals',
    'portfolio_cash_flows','portfolio_digest_runs','portfolio_holdings',
    'portfolio_purchase_lots','portfolio_signal_family_scorecard',
    'portfolio_signal_scorecard','portfolio_transactions',
    'reentry_telegram_deliveries','reentry_watchlist','server_alert_config',
    'server_alert_state','forecast_model_config','forecast_snapshots'
  ];
begin
  foreach v_table_name in array private_tables loop
    if not coalesce((
      select c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_table_name
    ), false) then
      raise exception 'RLS is not enabled on public.%', v_table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', v_table_name), 'select,insert,update,delete') then
      raise exception 'anon has DML on public.%', v_table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', v_table_name), 'select,insert,update,delete') then
      raise exception 'authenticated has DML on public.%', v_table_name;
    end if;
    if not has_table_privilege('service_role', format('public.%I', v_table_name), 'select,insert,update,delete') then
      raise exception 'service_role lost DML on public.%', v_table_name;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='forecast_snapshots' and column_name='evidence_snapshot'
  ) then raise exception 'forecast_snapshots.evidence_snapshot missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_digest_runs' and column_name='slot_key'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_digest_runs' and column_name='delivery'
  ) then raise exception 'portfolio_digest_runs prerequisite missing'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='portfolio_digest_runs'
      and indexname='portfolio_digest_runs_started_idx'
  ) then raise exception 'portfolio_digest_runs started index missing'; end if;


  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_signal_family_scorecard'
      and column_name='median_20d_excess_return_pct'
  ) then raise exception 'median_20d_excess_return_pct missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_holdings' and column_name='currency'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_purchase_lots' and column_name='currency'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_transactions' and column_name='currency'
  ) then raise exception 'currency drift reconciliation missing'; end if;

  if not exists (select 1 from cron.job where jobid=11 and jobname='aiw-server-smart-alerts-10m' and schedule='*/10 * * * *' and active) then
    raise exception 'server smart-alert cron schedule was not restored to the 10-minute cadence';
  end if;

  if not exists (select 1 from storage.buckets where id='aiw-private-historical-evidence' and public=false) then
    raise exception 'private historical evidence bucket missing or public';
  end if;

  if has_function_privilege('anon','public.claim_reentry_telegram_delivery(text,text,text)','execute')
     or has_function_privilege('authenticated','public.claim_reentry_telegram_delivery(text,text,text)','execute')
     or not has_function_privilege('service_role','public.claim_reentry_telegram_delivery(text,text,text)','execute') then
    raise exception 'Re-entry delivery claim RPC access boundary is incorrect';
  end if;
end;
$$;

insert into public.portfolio_cash_flows (event_date,flow_type,amount,currency,fx_to_usd)
values (current_date,'reward',1,'USD',1);

do $$
begin
  begin
    insert into public.portfolio_holdings (symbol,quantity,average_cost,currency)
    values ('BAD',1,1,'US');
    raise exception 'invalid currency unexpectedly passed the check constraint';
  exception when check_violation then
    null;
  end;
  if (select count(*) from public.portfolio_cash_flows where flow_type='reward') <> 1 then
    raise exception 'reward flow_type insert did not persist';
  end if;
end;
$$;

select 'All 30 historical migrations plus the recorded ordered reconciliation migration: PASS' as result;
rollback;
