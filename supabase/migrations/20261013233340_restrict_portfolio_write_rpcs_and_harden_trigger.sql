-- These SECURITY DEFINER portfolio mutation RPCs are intended for trusted server-side use.
-- Remove inherited/public and client-role execution, retaining the service-role path.
REVOKE EXECUTE ON FUNCTION public.create_portfolio_holding(text, numeric, numeric, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_portfolio_holding(text, numeric, numeric, date, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_portfolio_purchase(uuid, numeric, numeric, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_portfolio_purchase(uuid, numeric, numeric, date, text) TO service_role;

-- Trigger body only calls now() and assigns NEW.updated_at; pg_catalog is sufficient.
ALTER FUNCTION public.set_portfolio_holdings_updated_at() SET search_path = pg_catalog;
