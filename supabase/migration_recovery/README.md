# Supabase migration recovery

The active `supabase/migrations/` directory restores all 30 migration versions
recorded by the live project's `supabase_migrations.schema_migrations` history.
`migration-ledger.manifest.json` records each path and Git blob SHA-1.
Run `npm run migration:verify` to detect missing, modified, or unexpected active
SQL files. Frontend CI runs this integrity check.

## Important scope limitation

The restored ledger is exact, but it does **not** prove that replaying those
statements alone reconstructs every object currently present in production.
Read `UNTRACKED_SCHEMA_DRIFT.md` before using this history to provision a fresh
database. Former repository files are preserved under
`legacy_repository_files/` for comparison only and are not active migrations.

The folder `candidates/` contains review-only SQL fragments for the missing
`portfolio_digest_runs` prerequisite and confirmed schema/security drift.
They are deliberately excluded from `supabase/migrations/` and the 30-entry
manifest. The disposable PostgreSQL integration test validates the SQL logic
and privilege boundaries, but it is not a substitute for generating the active
timestamped migration files with Supabase CLI and running a full local replay.

No production database migration was run as part of this recovery.
