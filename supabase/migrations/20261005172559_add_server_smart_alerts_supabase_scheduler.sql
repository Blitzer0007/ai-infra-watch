
select cron.schedule(
  'aiw-server-smart-alerts-10m',
  '*/10 * * * *',
  $job$
    select net.http_get(
      url := 'https://ai-infra-watch-theta.vercel.app/api/server-alerts?scheduled=1',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='aiw_cron_secret'),
        'User-Agent', 'aiw-supabase-smart-alerts/1.0'
      ),
      timeout_milliseconds := 120000
    );
  $job$
);
