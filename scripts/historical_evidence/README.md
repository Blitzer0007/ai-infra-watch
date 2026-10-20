# Private historical-evidence archive

This package implements a **private evidence-capture pipeline**, not an automatic release-gate pass. It preserves source bytes and provenance so the historical validator can be run against an auditable bundle later.

## Data paths

### OHLC EOD as-of snapshots

```bash
python -m scripts.historical_evidence.archive_ohlc_asof --as-of YYYY-MM-DD --symbols NVDA,SPY,QQQ
```

The Free-plan allowlist is deliberately fixed to the documented symbols `AAPL, NVDA, JNJ, PEP, MSFT, SPY, QQQ`. The pipeline:
- rejects `as_of` dates before the observed provider boundary of `2026-09-22`;
- preserves each exact JSON response page, follows cursor pagination, and verifies unique trading dates, symbol identity, OHLCV values and the returned cutoff;
- stores page hashes and a separate manifest under private Supabase Storage;
- marks evidence as `candidate` only. Provider as-of semantics and membership coverage still require separate review.

A capability test returned 3 NVDA rows for a 2025 window queried as-of 2026-10-03, but the provider rejected an as-of cutoff of 2025-10-03 and returned no 2025 rows at its earliest accepted cutoff. **Do not use those results as proof of what was known in 2025.**

### MarketParquet forward archive

```bash
python -m scripts.historical_evidence.archive_marketparquet
```

Downloads the newest publicly available `stock_daily` Parquet file, validates file magic/schema/date/OHLCV invariants, preserves the exact bytes privately, and indexes its SHA-256. The archive status is `archive_only`. It is a retrieval-time snapshot of a provider file, not proof of the file's original publication timestamp or unchanged historical values. MarketParquet documents these files as split-adjusted rather than dividend-adjusted.

### S&P 500 membership

```bash
python -m scripts.historical_evidence.build_sp500_membership_evidence \
  --source-root /path/to/SP500-Survivorship-bias-data-2004-2026 \
  --upstream-sha <40-character-commit-sha> \
  --upstream-commit-time <ISO-8601-commit-time>
```

The builder archives the exact community YAML and its source notes/license, fetches allowlisted official announcement pages, hashes the exact response bytes, checks page/source dates and event-title overlap, builds intervals using the rule that a removed ticker is not a member on its removal-effective date, and excludes events past the source's declared freeze. It conservatively treats date-only publication evidence as an upper bound rather than inventing a precise publication timestamp. Intervals not supported by source provenance are `insufficient`; intervals without a known exit are right-censored at the declared freeze instead of being left open-ended.

The community dataset's current published freeze is older than today's date and it contains legacy membership events without event-specific provenance. For that reason the complete membership gate remains `BLOCKED`. The script must not be changed to force it to pass because YAML parsing or current constituents look plausible.

## Private storage configuration

The idempotent migration `supabase/migrations/20261020020000_private_historical_evidence_archive.sql` creates the private bucket `aiw-private-historical-evidence` and the service-role-only `historical_data_artifacts` index table.

Runtime environment:
- `OHLC_API_KEY`: GitHub Actions secret used by the OHLC workflow. Keep it server-side.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: GitHub Actions secrets for private Storage uploads and metadata indexing.
- `HISTORICAL_EVIDENCE_ARCHIVE_ENABLED=true`: GitHub repository variable required before any archive workflow performs network requests or writes to Storage.

All three workflows also expose `workflow_dispatch`, but they are guarded by that variable too. Before enabling:
1. Merge the reviewed code and apply the Supabase migration.
2. Verify all three secrets exist in GitHub Actions.
3. Verify the new Supabase bucket is private and metadata table has RLS with no anon/authenticated grants.
4. Only then set the repository variable to `true`.

## Privacy, licensing and safety

- Never commit API keys, service-role keys, raw OHLC responses, Parquet files, or the resulting membership zip to the repository.
- The public dashboard may be authenticated for a personal user, but raw vendor data stays in the private service-side archive; these workflows do not add an OHLC browser/client path.
- Follow each source's plan terms. OHLC Free is documented for personal use. Do not redistribute source bars or expose them via a public endpoint.
- `archive_only` / `candidate` means stored and structurally checked, not that its contents pass the point-in-time release gate.
- Nothing in this package enables re-entry scanning, sends Telegram notifications, changes portfolio/decision data, creates a JEV proposal, submits broker orders, or deploys production code.
