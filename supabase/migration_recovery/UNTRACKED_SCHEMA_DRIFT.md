# Untracked schema drift identified during migration recovery

The live migration table contains 30 recorded entries. The repository originally
contained 17 SQL files, several with filenames that did not match the recorded
version IDs. All 30 recorded SQL bodies are restored to the active
`supabase/migrations/` directory and are protected by the Git-blob integrity
manifest. No historical SQL body was rewritten to conceal schema drift.

A read-only comparison of the live schema and recorded statements found these
differences that need reviewed supplemental migrations before a clean database
can be claimed to reproduce production exactly:

1. **Missing prerequisite for `portfolio_digest_runs`.** The recorded migration
   `20261013233140_portfolio_digest_runs_server_only_rls` alters the table and
   revokes client grants, but the exact recorded ledger has no earlier
   `CREATE TABLE` for it. A clean migration replay therefore reaches an
   `ALTER TABLE` against a table that does not yet exist. Production already has
   the table, its primary key, its descending `started_at` index, and the
   expected columns. A review-only prerequisite candidate is preserved at
   `candidates/portfolio_digest_runs_prerequisite.sql`; its intended version
   must sort immediately before the recorded RLS migration. It is idempotent
   against the existing production object.
2. **Scorecard and currency drift.**
   `portfolio_signal_family_scorecard.median_20d_excess_return_pct` and
   `currency` columns/checks on `portfolio_holdings`,
   `portfolio_purchase_lots`, and `portfolio_transactions` are present in
   production but absent from the queried recorded migration statements.
   Candidate SQL was preserved in
   `legacy_repository_files/20261004_scheduler_decision_reliability.sql`.
3. **Cash-flow reward type.** The live
   `portfolio_cash_flows_flow_type_check` accepts `reward`, but there is no
   matching recorded migration version. Production currently contains two
   reward rows. Candidate SQL is preserved in
   `legacy_repository_files/20261013_02_portfolio_cash_flow_rewards.sql`.
4. **Decision-quality migration divergence.** The former
   `20261004_decision_quality_hardening.sql` differs from the exact recorded
   SQL for version `20261004143120`. Differences include the broker-alert
   backfill expression and risk metadata updates. Both versions are preserved;
   do not replay the former file blindly or rewrite the exact recorded version.
5. **Forecast table direct grants.** The production tables
   `public.forecast_model_config` and `public.forecast_snapshots` have RLS
   enabled with no policies, but still grant table DML privileges to both
   `anon` and `authenticated`. This differs from the server-only access model
   used by the other RLS-protected tables. The previous recorded grant cleanup
   migration `20261031055343` omitted these two tables. The review-only forward
   candidate revokes only `anon` and `authenticated`, preserving the existing
   `service_role` grants.

The disposable PostgreSQL test
`supabase/tests/schema_drift_recovery_candidates.sql` exercises the missing
`portfolio_digest_runs` prerequisite before the historical RLS migration,
applies the forward candidate twice to test idempotence, verifies currency and
reward checks, and asserts the intended `anon`/`authenticated`/service-role
privilege boundary. GitHub Actions runs this test against an ephemeral
PostgreSQL 17 service; it does not connect to production.

Review-only SQL is stored under `migration_recovery/candidates/` and is not in
the active migration directory or the 30-entry integrity manifest. Before
activating the candidate files, generate the actual timestamped migration files
with the pinned Supabase CLI, verify migration ordering and
`supabase db push --dry-run` against a disposable/linked validation project,
and review the resulting diff. Do not replay historical SQL blindly. No
production migration was run as part of this recovery.

The live data checks found no invalid currency values, null risk-group/beta
values, invalid risk-leverage values, or legacy broker-alert rows needing
conversion. All production inspection for this report was read-only.
