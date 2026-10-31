# Untracked schema drift and ordered migration recovery

The live project has **30 recorded migration versions**. Their exact SQL bodies
are restored under `supabase/migrations/` and protected by the Git-blob integrity
manifest. Those 30 files are not rewritten to conceal schema drift.

One additional migration is pending locally:
`20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql`.
It is intentionally ordered immediately before the recorded
`20261013233140_portfolio_digest_runs_server_only_rls` migration, which alters
`public.portfolio_digest_runs` but does not create it. The pending migration
creates that table (idempotently) and reconciles the other confirmed deltas.
This resolves the clean-replay predecessor dependency without editing the
historical SQL body. The pending migration is not yet recorded in production.

## Confirmed differences and reconciliation

1. **Missing `portfolio_digest_runs` predecessor.** Production already had the
   table, primary key, `started_at DESC` index and expected columns. The 30
   recorded SQL files have no preceding `CREATE TABLE`, but migration
   `20261013233140` enables RLS and revokes client privileges on it. The new
   pending `20261013233000` migration creates the expected structure before it.
2. **Scorecard and currency drift.**
   `portfolio_signal_family_scorecard.median_20d_excess_return_pct` and
   `currency` columns/checks on `portfolio_holdings`,
   `portfolio_purchase_lots` and `portfolio_transactions` exist in
   production but not in the 30 recorded migration statements. The same
   pending migration adds them idempotently.
3. **Cash-flow reward type.** The live
   `portfolio_cash_flows_flow_type_check` accepts `reward`, and production
   contains two reward rows. The pending migration extends the constraint.
4. **Decision-quality migration divergence.** The former
   `20261004_decision_quality_hardening.sql` differs from the exact recorded
   SQL for version `20261004143120`, including broker-alert backfill and risk
   metadata expressions. Both files remain preserved for comparison. The
   older file must not be replayed in place of the exact recorded migration.
5. **Forecast table direct grants.** `public.forecast_model_config` and
   `public.forecast_snapshots` have RLS enabled with no policies but previously
   retained direct table grants for `anon` and `authenticated`. The pending
   migration revokes those client grants while preserving `service_role`.

Read-only production checks found no invalid currency values, null risk-group
or beta metadata, invalid risk leverage, or legacy broker-alert rows requiring
conversion. No production SQL was executed.

## Validation and production sequencing

`supabase/tests/schema_full_migration_replay.sql` now applies the 30 exact
recorded migrations in order, runs the pending `20261013233000` migration
immediately before the recorded RLS migration, then re-runs it to test
idempotence. It uses a PostgreSQL 17 fixture for the Supabase-managed baseline
objects and does not connect to production. Separate PostgreSQL tests validate
grant boundaries and the Telegram outbox.

Because `20261013233000` is a backfilled prerequisite that is absent from the
remote migration history while later versions are already recorded, the
required pre-release check is:

```bash
supabase migration list
supabase db push --linked --include-all --dry-run
```

The dry run must show only the single pending reconciliation migration. It must
not apply it. A successful dry run still needs review against the actual remote
project state before a separately approved production migration. Do not run
`supabase db push` or any production DDL as part of this review. The Vercel
application deployment remains a separate, once-only release step after the
database plan is approved.
