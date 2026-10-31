# Supabase migration recovery

The active `supabase/migrations/` directory contains the **30 exact SQL files**
recorded by the live project's `supabase_migrations.schema_migrations` table,
plus one pending, idempotent reconciliation migration. The 30 recorded file
bodies and their hashes remain unchanged.

The extra migration,
`20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql`,
is intentionally timestamped between `20261013231950` and the recorded
`20261013233140` migration. This is required because the latter alters
`portfolio_digest_runs` but the historical 30-file ledger never created it.
The pending migration also repairs the other schema differences found during
read-only production inspection. It is not yet applied to production.

Run `npm run migration:verify` to verify active migration hashes, inventory,
and timestamp ordering. The PostgreSQL 17 full-replay test applies all 30
recorded migrations plus the pending migration in order, and re-runs the
pending migration to test idempotence. The fixture models only the Supabase
baseline objects required by this migration slice; it is not a full Supabase
local-stack run.

Before applying the pending backfilled migration to production, inspect:

```bash
supabase migration list
supabase db push --linked --include-all --dry-run
```

The opt-in GitHub Actions remote dry-run job uses the repository Actions
secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. Configure those
secrets under repository Settings → Secrets and variables → Actions before
running that job. Do not commit them or paste them into chat. When either secret
is absent, the job fails closed before connecting.

The dry run must list only the pending
`20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql`.
Review it against remote schema and data first. Do not use `migration repair`
to fake the new version as applied, and do not run a production push without
explicit release approval.

No production database migration or application deployment was performed
during this recovery work.
