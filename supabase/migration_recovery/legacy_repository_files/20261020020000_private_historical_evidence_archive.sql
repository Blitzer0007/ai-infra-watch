-- Private, owner-only archive for point-in-time prices and historical membership evidence.
-- Raw market-data files must never be publicly served or committed to the repository.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'aiw-private-historical-evidence',
  'aiw-private-historical-evidence',
  false,
  52428800,
  array[
    'application/json',
    'application/vnd.apache.parquet',
    'application/zip',
    'text/html',
    'text/plain',
    'text/csv',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.historical_data_artifacts (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('ohlc', 'marketparquet', 'sp500-membership')),
  artifact_type text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bucket_name text not null default 'aiw-private-historical-evidence',
  object_path text not null,
  source_endpoint text not null,
  retrieved_at timestamptz not null,
  source_as_of timestamptz,
  market_date date,
  row_count integer check (row_count is null or row_count >= 0),
  symbol_count integer check (symbol_count is null or symbol_count >= 0),
  evidence_status text not null default 'archive_only'
    check (evidence_status in ('archive_only', 'candidate', 'verified', 'insufficient')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint historical_data_artifacts_provider_sha256_unique unique (provider, sha256),
  constraint historical_data_artifacts_bucket_path_unique unique (bucket_name, object_path)
);

create index if not exists historical_data_artifacts_provider_date_idx
  on public.historical_data_artifacts (provider, market_date desc);

create index if not exists historical_data_artifacts_as_of_idx
  on public.historical_data_artifacts (provider, source_as_of desc);

alter table public.historical_data_artifacts enable row level security;
revoke all on public.historical_data_artifacts from anon, authenticated;
grant select, insert, update, delete on public.historical_data_artifacts to service_role;
grant usage, select on sequence public.historical_data_artifacts_id_seq to service_role;

comment on table public.historical_data_artifacts is
  'Private evidence-archive index. Structural hashes do not by themselves authenticate source claims or clear the historical release gate.';
comment on column public.historical_data_artifacts.evidence_status is
  'archive_only = preserved data, candidate = under evidence review, verified = reviewed by a separate gate, insufficient = provenance or coverage incomplete.';
comment on column public.historical_data_artifacts.details is
  'Non-secret provenance details only. Never store API keys, bearer tokens, presigned URLs, or raw market data in this JSON column.';
