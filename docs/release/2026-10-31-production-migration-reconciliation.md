# Production migration reconciliation — 2026-10-31

## Status

The reconciliation migration `20261013233000_create_portfolio_digest_runs_and_reconcile_schema_drift.sql` was applied to the production Supabase project on 2026-10-31 and is recorded in the linked `schema_migrations` ledger.

The production ledger and the repository manifest were verified to contain the same 31 migration versions. The reconciliation migration is ordered immediately before `20261013233140_portfolio_digest_runs_server_only_rls.sql`, which depends on the `portfolio_digest_runs` table.

The linked read-only validation completed with:
- All 31 local and remote migration versions matching.
- `supabase db push --linked --include-all --dry-run` reporting that the remote database is up to date.
- No pending SQL to apply.

The production schema checks covered the digest-run table, its index and RLS, scorecard and currency columns and constraints, the reward cash-flow constraint, and server-only access to forecast tables. Application row counts were unchanged.

## Migration artifact integrity

The SQL migration file is intentionally retained byte-for-byte as the artifact used for the production migration. Its original Git blob SHA-1 remains recorded in `supabase/migration-ledger.manifest.json`. Do not amend the SQL file or replace its recorded hash after application; any future schema change must be a new forward migration.

The header comment in the historical SQL file describes its pre-application state and is now stale. This release note is the authoritative record of its production application status. The manifest verifier should continue to validate the exact applied SQL artifact.

## Release boundary

This migration record does not authorize an application deployment or enable Re-entry alert delivery. The Vercel production deployment and Re-entry activation remain separate release actions requiring explicit approval.
