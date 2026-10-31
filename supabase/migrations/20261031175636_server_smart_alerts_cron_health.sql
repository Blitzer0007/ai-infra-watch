create or replace function public.server_smart_alerts_cron_health()
returns table (
  job_configured boolean,
  job_active boolean,
  job_schedule text,
  last_cron_run_at timestamptz,
  cron_runs_24h bigint,
  cron_failures_24h bigint,
  latest_http_at timestamptz,
  latest_http_status integer,
  latest_http_ok boolean,
  latest_http_error text,
  last_http_success_at timestamptz,
  last_http_evaluated_symbols integer,
  last_http_fresh_quotes integer,
  last_http_sent integer,
  last_http_checked_at text,
  http_evaluations_6h bigint,
  http_failures_6h bigint,
  recent_runs jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  with target_job as (
    select jobid, jobname, schedule, active
    from cron.job
    where jobname = 'aiw-server-smart-alerts-10m'
    order by jobid desc
    limit 1
  ),
  http_rows as (
    select
      response.id,
      response.created,
      response.status_code,
      response.timed_out,
      response.error_msg,
      case
        when pg_catalog.pg_input_is_valid(response.content, 'jsonb')
          then response.content::jsonb
        else null
      end as payload
    from net._http_response as response
    where response.created >= now() - interval '6 hours'
      and response.content like '%"evaluated_symbols"%'
  ),
  http_health as (
    select
      http_rows.*,
      (
        status_code = 200
        and coalesce(timed_out, false) = false
        and error_msg is null
        and payload ->> 'ok' = 'true'
        and coalesce(payload -> 'errors', '[]'::jsonb) = '[]'::jsonb
      ) as is_healthy
    from http_rows
  ),
  latest_http as (
    select * from http_health order by created desc limit 1
  ),
  latest_success as (
    select * from http_health where is_healthy order by created desc limit 1
  ),
  recent_cron_runs as (
    select
      run.start_time,
      run.end_time,
      run.status,
      run.return_message
    from cron.job_run_details as run
    join target_job as job on job.jobid = run.jobid
    where run.start_time >= now() - interval '24 hours'
    order by run.start_time desc
    limit 12
  )
  select
    exists(select 1 from target_job) as job_configured,
    coalesce((select active from target_job), false) as job_active,
    (select schedule from target_job) as job_schedule,
    (
      select max(run.start_time)
      from cron.job_run_details as run
      join target_job as job on job.jobid = run.jobid
      where run.status = 'succeeded'
    ) as last_cron_run_at,
    (
      select count(*)::bigint
      from cron.job_run_details as run
      join target_job as job on job.jobid = run.jobid
      where run.start_time >= now() - interval '24 hours'
    ) as cron_runs_24h,
    (
      select count(*)::bigint
      from cron.job_run_details as run
      join target_job as job on job.jobid = run.jobid
      where run.start_time >= now() - interval '24 hours'
        and run.status <> 'succeeded'
    ) as cron_failures_24h,
    (select created from latest_http) as latest_http_at,
    (select status_code from latest_http) as latest_http_status,
    coalesce((select is_healthy from latest_http), false) as latest_http_ok,
    (
      select case
        when latest_http.id is null then 'No HTTP response is recorded for the Supabase Smart Alerts cron job.'
        when latest_http.status_code is distinct from 200 then 'HTTP status ' || coalesce(latest_http.status_code::text, 'unknown')
        when coalesce(latest_http.timed_out, false) then 'HTTP request timed out.'
        when latest_http.error_msg is not null then left(latest_http.error_msg, 300)
        when latest_http.payload ->> 'ok' is distinct from 'true' then coalesce(latest_http.payload ->> 'error', 'Evaluator did not report ok=true.')
        when coalesce(latest_http.payload -> 'errors', '[]'::jsonb) <> '[]'::jsonb then left((latest_http.payload -> 'errors')::text, 300)
        else null
      end
      from latest_http
    ) as latest_http_error,
    (select created from latest_success) as last_http_success_at,
    nullif((select payload ->> 'evaluated_symbols' from latest_success), '')::integer as last_http_evaluated_symbols,
    nullif((select payload ->> 'fresh_quotes' from latest_success), '')::integer as last_http_fresh_quotes,
    nullif((select payload ->> 'sent' from latest_success), '')::integer as last_http_sent,
    (select payload ->> 'checked_at' from latest_success) as last_http_checked_at,
    (select count(*)::bigint from http_health) as http_evaluations_6h,
    (select count(*)::bigint from http_health where not is_healthy) as http_failures_6h,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'createdAt', recent.start_time,
          'updatedAt', recent.end_time,
          'status', recent.status,
          'conclusion', case when recent.status = 'succeeded' then 'success' else 'failure' end,
          'details', recent.return_message
        )
        order by recent.start_time desc
      )
      from recent_cron_runs as recent
    ), '[]'::jsonb) as recent_runs;
$function$;

revoke all on function public.server_smart_alerts_cron_health() from public;
revoke all on function public.server_smart_alerts_cron_health() from anon, authenticated;
grant execute on function public.server_smart_alerts_cron_health() to service_role;
