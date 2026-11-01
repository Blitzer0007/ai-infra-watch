# Smart Alerts scheduler health source correction — 2026-10-31

## Finding

The production Smart Alerts scheduler is the Supabase Cron job
`aiw-server-smart-alerts-10m`, not the GitHub Actions schedule history.

The live production database showed:
- The Supabase Cron job is present and active with schedule `*/10 * * * *`.
- 144 successful cron invocations in the preceding 24-hour window.
- Zero failed cron invocations in that window.
- The latest HTTP evaluation returned status 200, `ok: true`, 38 evaluated symbols,
  38 fresh quotes, and an empty evaluator error list.
- 36 successful HTTP evaluations were retained in the preceding six-hour window.

The previous `/api/job-health` implementation derived Smart Alerts freshness only
from GitHub Actions `event=schedule` runs. That misclassified a healthy
Supabase-scheduled production process as stale.

## Correction

- Added `public.server_smart_alerts_cron_health()`, a read-only `SECURITY DEFINER`
  function with an empty search path. It returns only scheduler timing, HTTP
  status, aggregate quote counts, and a bounded recent-run summary.
- Revoked function execution from `PUBLIC`, `anon`, and `authenticated`;
  granted execute only to `service_role`.
- Updated `/api/job-health` to use the Supabase Cron job and its actual `pg_net`
  HTTP response, preserving the 45-minute freshness gate.
- Kept the GitHub Actions Smart Alerts workflow as a manual OIDC-authenticated
  recovery path; removed its duplicate periodic schedule so Supabase Cron is the
  single production scheduler.
- Added tests for fresh success, stale results, a latest HTTP failure, and an
  inactive or missing scheduler.

## Production migration

Migration `20261031175636_server_smart_alerts_cron_health` was applied to the
production Supabase project on 2026-10-31 and recorded in its migration ledger.
The migration file and manifest entry in this change preserve the applied SQL
artifact.

## Safety boundary

This change does not enable Re-entry, write to the Re-entry delivery ledger,
or send Telegram messages. A recent Smart Alerts evaluator response validates
the scheduler and endpoint, not Telegram message acceptance.
