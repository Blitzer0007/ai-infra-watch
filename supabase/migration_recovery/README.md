# Supabase migration recovery

The active `supabase/migrations/` directory is restored from the live project's
`supabase_migrations.schema_migrations` history. It contains all 30 recorded
migration versions, with their exact stored SQL statements and original
version/name metadata.

`migration-ledger.manifest.json` records each path and Git blob SHA-1.
Run `npm run migration:verify` to detect missing, modified, or unexpected SQL
files. The frontend CI workflow runs this check on pull requests.

## Important scope limitation

This restores the recorded migration ledger; it does **not** prove that replaying
those statements alone reproduces every object currently present in production.
Read `migration_recovery/UNTRACKED_SCHEMA_DRIFT.md` before using this history
to provision a fresh database. Former repository files are preserved under
`legacy_repository_files/` for comparison only and are not active migrations.

No production database migration was run as part of this recovery.
