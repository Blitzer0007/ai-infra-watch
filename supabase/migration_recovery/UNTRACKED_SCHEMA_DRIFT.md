# Untracked schema drift identified during migration recovery

The live migration table contains 30 recorded entries. The repository originally
contained 17 SQL files, several with filenames that did not match the recorded
version IDs. All 30 recorded SQL bodies are now restored to the active
`supabase/migrations/` directory. Former repository files are retained in
`legacy_repository_files/` and are excluded from CLI migration discovery.

A read-only comparison of the live schema and recorded statements found these
items that need a reviewed forward migration before a fresh database can be
claimed to reproduce production exactly:

1. `portfolio_digest_runs` exists in the live schema, but the recorded migration
   `20261013233140_portfolio_digest_runs_server_only_rls` only enables RLS and
   revokes client-role privileges; it does not create the table. The former
   repository file `20261004_scheduler_decision_reliability.sql` contains
   candidate creation SQL.
2. `portfolio_signal_family_scorecard.median_20d_excess_return_pct` and currency
   columns/constraints on portfolio holdings, purchase lots and transactions are
   present in the live schema but are not represented in the recorded migration
   statements queried. Candidate SQL was present in
   `20261004_scheduler_decision_reliability.sql`.
3. The live `portfolio_cash_flows_flow_type_check` accepts `reward`, but no
   matching migration version exists in the recorded history. Candidate SQL is
   preserved in `20261013_02_portfolio_cash_flow_rewards.sql`.
4. The former `20261004_decision_quality_hardening.sql` differs from the exact
   recorded SQL for version `20261004143120`. Differences include the legacy
   broker-alert backfill expression and risk metadata updates. Both versions
   are preserved; do not replay the former file blindly.

These are not automatically appended to `supabase/migrations/`: the correct
forward migration must be generated with the Supabase CLI, checked against the
current schema, and reviewed for idempotence before it can be considered safe.
The migration integrity check validates restored ledger files only; it is not a
schema-equivalence or migration-replay test.

All production Supabase inspection for this report was read-only.
