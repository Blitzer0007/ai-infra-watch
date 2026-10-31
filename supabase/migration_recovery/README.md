# Supabase migration recovery

The active `supabase/migrations/` directory contains **31 SQL files** recorded
by the live project's `supabase_migrations.schema_migrations` table. The first
30 historical SQL bodies and their hashes remain unchanged; the 31st is the
ordered schema-reconciliation migration.

The additional migration,
`20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql`,
is intentionally timestamped between `20261013231950` and the recorded
`20261013233140` migration. This is required because the latter alters
`portfolio_digest_runs` but the historical 30-file ledger never created it.
The reconciliation migration also repairs the other schema differences found
during read-only production inspection.

The migration was applied to production on 2026-10-31 after a successful
read-only linked dry run and review. The production migration ledger was
reconciled to the checked-in backfilled version so the 31 local and remote
versions now match. Post-apply checks confirmed the table, index, RLS,
scorecard/currency columns, cash-flow constraint, and server-only forecast
table grants. Existing application row counts were unchanged.

Run `npm run migration:verify` to verify active migration hashes, inventory,
and timestamp ordering. The PostgreSQL 17 full-replay test applies all 30
historical migrations plus the reconciliation migration in order, immediately
before the historical RLS migration, and re-runs the reconciliation migration
to test idempotence. The fixture models only the Supabase baseline objects
required by this migration slice; it is not a full Supabase local-stack run.

To verify production synchronization, inspect:

```bash
supabase migration list --linked
supabase db push --linked --include-all --dry-run
```

The opt-in GitHub Actions verification uses the repository Actions secrets
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. Configure those secrets
under repository Settings → Secrets and variables → Actions. Do not commit
them or paste them into chat. When either secret is absent, the job fails
closed before connecting.

The linked dry run should report that the remote database is up to date, with
no pending SQL. It is read-only and does not apply migrations. Future schema
changes still require a reviewed migration, passing checks, and separate
production approval. Do not use `migration repair` to mark a future version
as applied without executing and validating its SQL.

The database migration is complete. The Vercel application deployment remains
a separate controlled release step and has not been performed.
