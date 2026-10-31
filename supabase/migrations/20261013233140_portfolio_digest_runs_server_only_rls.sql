-- Keep the digest idempotency ledger private to trusted server-side jobs.
-- service_role retains its existing table grants and bypasses RLS by design.
ALTER TABLE public.portfolio_digest_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.portfolio_digest_runs FROM anon, authenticated;
