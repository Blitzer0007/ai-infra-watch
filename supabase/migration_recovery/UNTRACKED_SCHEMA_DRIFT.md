# Untracked schema drift and ordered migration recovery

The live project now has **31 recorded migration versions**. The first 30
historical SQL bodies are restored under `supabase/migrations/` unchanged and
protected by the Git-blob integrity manifest. The 31st is the applied,
idempotent reconciliation migration:
`20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql`.

It is intentionally ordered immediately before the recorded
`20261013233140_portfolio_digest_runs_server_only_rls` migration, which alters
`public.portfolio_digest_runs` but does not create it. The reconciliation
migration creates that table when missing and repairs the other confirmed
schema deltas without editing historical SQL.

## Confirmed differences and reconciliation

1. **Missing `portfolio_digest_runs` predecessor.** Production already had the
   table, primary key, `started_at DESC` index and expected columns. The 30
   original recorded SQL files have no preceding `CREATE TABLE`, but migration
   `20261013233140` enables RLS and revokes client privileges on it. The
   reconciliation migration creates the expected structure before it during
   clean replay and is now recorded in production.
2. **Scorecard and currency drift.**
   `portfolio_signal_family_scorecard.median_20d_excess_return_pct` and
   `currency` columns/checks on `portfolio_holdings`,
   `portfolio_purchase_lots` and `portfolio_transactions` existed in
   production but not in the 30 historical migration statements. The applied
   reconciliation migration adds/validates them idempotently.
3. **Cash-flow reward type.** The live
   `portfolio_cash_flows_flow_type_check` accepts `reward`, and production
   contains two reward rows. The applied migration includes `reward` in the
   constraint without changing those rows.
4. **Decision-quality migration divergence.** The former
   `20261004_decision_quality_hardening.sql` differs from the exact recorded
   SQL for version `20261004143120`, including broker-alert backfill and risk
   metadata expressions. Both files remain preserved for comparison. The
   older file must not be replayed in place of the exact recorded migration.
5. **Forecast table direct grants.** `public.forecast_model_config` and
   `public.forecast_snapshots` have RLS enabled with service-role-only
   policies but previously retained direct table grants for `anon` and
   `authenticated`. The applied migration revokes those client grants while
   preserving `service_role`.

## Production application and verification

The reconciliation migration was applied on 2026-10-31 after the linked
Supabase dry run identified exactly one pending version and the reviewed SQL
was checked against production schema and data. The migration history version
was then normalized to the checked-in backfilled version
`20261013233000`, preserving the applied statement; no SQL was re-run during
that metadata correction.

Post-apply read-only checks confirmed:

- `portfolio_digest_runs`, its `started_at DESC` index, and RLS are present.
- The scorecard and three currency columns exist; all currency values remain
  valid USD and the three-letter currency constraints are present.
- The cash-flow constraint includes `reward`; both existing reward rows
  remain present.
- `forecast_model_config` and `forecast_snapshots` have no direct
  `anon`/`authenticated` table grants; `service_role` retains its grants.
- Application row counts remained: 107 digest-run rows, 24 cash-flow rows,
  10 holdings, 63 purchase lots, and 76 transactions.

The local manifest and live migration history now contain the same 31 versions,
including `20261013233000`; no migration is pending. The read-only linked
Supabase dry run reports `Remote database is up to date`.

## Reproducibility and next release step

`supabase/tests/schema_full_migration_replay.sql` applies the 30 exact
historical migrations in order, runs the recorded `20261013233000`
reconciliation migration immediately before the recorded RLS migration, then
re-runs it to test idempotence. It uses a PostgreSQL 17 fixture for
Supabase-managed baseline objects and does not connect to production.
Separate PostgreSQL tests validate grant boundaries and the Telegram outbox.

The CI linked-migration verification now asserts that all 31 local migration
versions match their remote counterparts and that
`supabase db push --linked --include-all --dry-run` reports no pending SQL.
The Vercel application deployment remains a separate, once-only controlled
release step after its remaining release gates and explicit deployment
approval.
