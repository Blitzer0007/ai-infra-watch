-- Disposable PostgreSQL integration test for the private-table grant migration.
-- The workflow creates anon/authenticated/service_role before running this script.

create table public.ai_quality_runs (id bigint);
create table public.decision_journal_entries (id bigint);
create table public.forecast_learning_runs (id bigint);
create table public.forecast_scheduler_runs (id bigint);
create table public.historical_data_artifacts (id bigint);
create table public.jev_paper_proposals (id bigint);
create table public.portfolio_cash_flows (id bigint);
create table public.portfolio_digest_runs (id bigint);
create table public.portfolio_holdings (id bigint);
create table public.portfolio_purchase_lots (id bigint);
create table public.portfolio_signal_family_scorecard (id bigint);
create table public.portfolio_signal_scorecard (id bigint);
create table public.portfolio_transactions (id bigint);
create table public.reentry_telegram_deliveries (id bigint);
create table public.reentry_watchlist (id bigint);
create table public.server_alert_config (id bigint);
create table public.server_alert_state (id bigint);

alter table public.ai_quality_runs enable row level security;
alter table public.decision_journal_entries enable row level security;
alter table public.forecast_learning_runs enable row level security;
alter table public.forecast_scheduler_runs enable row level security;
alter table public.historical_data_artifacts enable row level security;
alter table public.jev_paper_proposals enable row level security;
alter table public.portfolio_cash_flows enable row level security;
alter table public.portfolio_digest_runs enable row level security;
alter table public.portfolio_holdings enable row level security;
alter table public.portfolio_purchase_lots enable row level security;
alter table public.portfolio_signal_family_scorecard enable row level security;
alter table public.portfolio_signal_scorecard enable row level security;
alter table public.portfolio_transactions enable row level security;
alter table public.reentry_telegram_deliveries enable row level security;
alter table public.reentry_watchlist enable row level security;
alter table public.server_alert_config enable row level security;
alter table public.server_alert_state enable row level security;

grant all privileges on table
  public.ai_quality_runs, public.decision_journal_entries,
  public.forecast_learning_runs, public.forecast_scheduler_runs,
  public.historical_data_artifacts, public.jev_paper_proposals,
  public.portfolio_cash_flows, public.portfolio_digest_runs,
  public.portfolio_holdings, public.portfolio_purchase_lots,
  public.portfolio_signal_family_scorecard, public.portfolio_signal_scorecard,
  public.portfolio_transactions, public.reentry_telegram_deliveries,
  public.reentry_watchlist, public.server_alert_config, public.server_alert_state
to anon, authenticated, service_role;

\i supabase/migrations/20261031055343_revoke_unused_direct_grants_private_tables_20261031.sql

do $$
declare
  table_name text;
  table_names text[] := array[
    'ai_quality_runs','decision_journal_entries','forecast_learning_runs',
    'forecast_scheduler_runs','historical_data_artifacts','jev_paper_proposals',
    'portfolio_cash_flows','portfolio_digest_runs','portfolio_holdings',
    'portfolio_purchase_lots','portfolio_signal_family_scorecard',
    'portfolio_signal_scorecard','portfolio_transactions',
    'reentry_telegram_deliveries','reentry_watchlist','server_alert_config',
    'server_alert_state'
  ];
  privilege_name text;
begin
  foreach table_name in array table_names loop
    if not coalesce((select c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=table_name), false) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;

    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', format('public.%I', table_name), privilege_name) then
        raise exception 'anon still has % on public.%', privilege_name, table_name;
      end if;
      if has_table_privilege('authenticated', format('public.%I', table_name), privilege_name) then
        raise exception 'authenticated still has % on public.%', privilege_name, table_name;
      end if;
      if not has_table_privilege('service_role', format('public.%I', table_name), privilege_name) then
        raise exception 'service_role lost % on public.%', privilege_name, table_name;
      end if;
    end loop;
  end loop;
end;
$$;

select 'private table grant revocation migration: PASS' as result;
