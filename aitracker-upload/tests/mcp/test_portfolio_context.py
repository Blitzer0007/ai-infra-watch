"""Fictional loaded holdings/quotes; no hosted DB, provider or model access."""
from copy import deepcopy
from decimal import getcontext
import json

import httpx
import pytest

from app.mcp_client.application_sources import ApplicationResearchService
from app.mcp_client.client import MCPClientError
from app.mcp_client.portfolio_valuation import portfolio_context, select_holdings

NOW = "2026-11-09T12:00:00Z"
OBS = "2026-11-09T11:59:00Z"


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://fictional.invalid")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fictional-context-only")
    def forbidden(*args, **kwargs):
        pytest.fail("A portfolio regression attempted HTTP")
    monkeypatch.setattr(httpx.Client, "get", forbidden)


def holding(symbol="FICT", **fields):
    return {"id": "fictional", "symbol": symbol, "quantity": "2", "average_cost": "80", **fields}


def quote(symbol="FICT", **fields):
    return {"symbol": symbol, "price": 100, "change_pct": 0, "source": "finnhub", "simulated": False,
            "currency": "USD", "as_of": OBS, "retrieved_at": "2026-11-09T11:59:01Z",
            "adjusted_basis": "raw", "is_market_session_open": True, **fields}


def context(rows=None, quotes=None):
    return portfolio_context([holding()] if rows is None else rows, {"FICT": quote()} if quotes is None else quotes, NOW, {}, {})


def test_covered_mark_does_not_invent_cost_currency_or_accounting_profit():
    result = context()
    row = result["holdings"][0]
    assert row["currentValue"] == 200 and row["dailyChangePct"] == 0
    assert row["investedValue"] is row["costBasisCurrency"] is None
    assert row["sourceFindings"] == ["COST_CURRENCY_UNSUPPORTED_OR_UNKNOWN"]
    assert result["portfolio"] == {"currency": "USD", "investedValue": None, "currentValue": 200,
                                    "unrealizedPnl": None, "unrealizedPct": None,
                                    "accountingBasis": "unreconciled-stored-average-cost"}
    assert result["as_of"] == OBS and result["assessed_at"] == NOW
    assert result["data_quality"]["allQuotesFresh"] is True
    assert result["data_quality"]["accountingReconciled"] is False
    assert result["grants_decision_eligibility"] is result["verifies_provider_identity"] is False


@pytest.mark.parametrize("fields,code", [
    ({"as_of": None}, "OBSERVATION_TIME_UNKNOWN"),
    ({"as_of": "2026-11-09"}, "OBSERVATION_TIME_UNKNOWN"),
    ({"as_of": "2026-11-09T11:59:00"}, "OBSERVATION_TIME_UNKNOWN"),
    ({"as_of": "2026-11-09T12:00:01Z"}, "OBSERVATION_OUTSIDE_AGE_POLICY"),
    ({"as_of": "2026-11-09T11:44:59Z"}, "OBSERVATION_OUTSIDE_AGE_POLICY"),
    ({"retrieved_at": None}, "RETRIEVAL_TIME_UNKNOWN"),
    ({"retrieved_at": "2026-11-09T12:00:01Z"}, "INCONSISTENT_SOURCE_TIMES"),
    ({"retrieved_at": "2026-11-09T11:58:59Z"}, "INCONSISTENT_SOURCE_TIMES"),
    ({"symbol": "OTHER"}, "QUOTE_SYMBOL_MISMATCH"),
    ({"source": "fixture", "simulated": True}, "SIMULATED_OR_UNKNOWN_SOURCE"),
    ({"source": "unknown"}, "SIMULATED_OR_UNKNOWN_SOURCE"),
    ({"simulated": None}, "SIMULATED_OR_UNKNOWN_SOURCE"),
    ({"stale": True}, "SOURCE_QUALITY_BLOCKED"),
    ({"stale": "false"}, "SOURCE_QUALITY_BLOCKED"),
    ({"status": "conflicting"}, "SOURCE_QUALITY_BLOCKED"),
    ({"status": "missing"}, "SOURCE_QUALITY_BLOCKED"),
    ({"status": {"unexpected": "shape"}}, "SOURCE_QUALITY_BLOCKED"),
    ({"adjusted_basis": "unknown"}, "ADJUSTMENT_BASIS_UNSUPPORTED_OR_UNKNOWN"),
    ({"is_market_session_open": None}, "SESSION_UNKNOWN"),
    ({"is_market_session_open": 1}, "SESSION_UNKNOWN"),
    ({"price": True}, "PRICE_UNAVAILABLE"),
    ({"price": "100"}, "PRICE_UNAVAILABLE"),
    ({"price": float("inf")}, "PRICE_UNAVAILABLE"),
    ({"price": 0}, "PRICE_UNAVAILABLE"),
])
def test_unsuitable_quote_never_becomes_an_eligible_mark(fields, code):
    result = context(quotes={"FICT": quote(**fields)})
    row = result["holdings"][0]
    assert row["currentValue"] is row["dailyChangePct"] is None
    assert code in row["sourceFindings"]
    assert result["portfolio"]["currentValue"] is result["as_of"] is None
    assert result["data_quality"]["eligibleMarkCount"] == 0
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize("currency", [None, "EUR", "GBP", "GBp", "usd", "USd", ""])
def test_unknown_other_or_minor_unit_currency_is_not_usd(currency):
    result = context(quotes={"FICT": quote(currency=currency)})
    assert result["portfolio"]["currentValue"] is None
    assert "QUOTE_CURRENCY_UNSUPPORTED_OR_UNKNOWN" in result["holdings"][0]["sourceFindings"]


def test_exact_age_boundary_closed_session_and_utc_offset():
    result = context(quotes={"FICT": quote(as_of="2026-11-09T17:15:00+05:30", is_market_session_open=False)})
    assert result["portfolio"]["currentValue"] == 200
    assert result["as_of"] == "2026-11-09T11:45:00Z"


@pytest.mark.parametrize("move", [None, True, "0", float("nan"), float("inf")])
def test_missing_or_invalid_move_is_not_flat_but_does_not_invent_a_price_gap(move):
    result = context(quotes={"FICT": quote(change_pct=move)})
    row = result["holdings"][0]
    assert row["dailyChangePct"] is None and row["currentValue"] == 200
    assert "DAILY_MOVE_UNAVAILABLE" in row["sourceFindings"]
    json.dumps(result, allow_nan=False)


def test_conflicting_move_alias_is_withheld_and_tiny_reported_move_stays_nonzero():
    result = context(quotes={"FICT": quote(changePct=1)})
    assert result["holdings"][0]["dailyChangePct"] is None
    assert context(quotes={"FICT": quote(change_pct=1e-12)})["holdings"][0]["dailyChangePct"] == 1e-12


def test_partial_and_unaligned_quotes_cannot_create_a_complete_portfolio_total():
    rows = [holding(), holding("DEMO")]
    partial = context(rows, {"FICT": quote()})
    assert partial["holdings"][0]["currentValue"] == 200
    assert partial["portfolio"]["currentValue"] is partial["as_of"] is None
    assert partial["data_quality"]["holdingCount"] == 2
    assert partial["data_quality"]["missingValuationSymbols"] == ["DEMO"]
    unaligned = context(rows, {"FICT": quote(), "DEMO": quote("DEMO", as_of="2026-11-09T11:57:59Z")})
    assert unaligned["data_quality"]["allQuotesFresh"] is True
    assert unaligned["data_quality"]["eligibleMarkCount"] == 2
    assert unaligned["data_quality"]["allMarksAvailable"] is False
    assert "UNALIGNED_QUOTES" in unaligned["data_quality"]["aggregateFindings"]
    assert unaligned["portfolio"]["currentValue"] is unaligned["as_of"] is None
    aligned = context(rows, {"FICT": quote(), "DEMO": quote("DEMO", as_of="2026-11-09T11:58:00Z")})
    assert aligned["portfolio"]["currentValue"] == 400 and aligned["as_of"] == "2026-11-09T11:58:00Z"


@pytest.mark.parametrize("quantity", [None, True, "", "NaN", "Infinity", float("inf"), "1e50", "1e-9", 0, -1])
def test_invalid_quantities_stay_in_coverage_without_zero_cost_or_value(quantity):
    result = context([holding(quantity=quantity)])
    row = result["holdings"][0]
    assert row["quantity"] is row["investedValue"] is row["currentValue"] is None
    assert result["data_quality"]["holdingCount"] == 1
    assert "QUANTITY_INVALID" in row["sourceFindings"]
    assert result["portfolio"]["currentValue"] is None


@pytest.mark.parametrize("average", [None, True, "", "NaN", float("inf"), -1])
def test_invalid_cost_does_not_become_zero_or_hide_a_valid_mark(average):
    result = context([holding(average_cost=average, cost_currency="USD")])
    assert result["holdings"][0]["averageCost"] is result["portfolio"]["investedValue"] is None
    assert result["portfolio"]["currentValue"] == 200
    assert result["portfolio"]["unrealizedPct"] is None


def test_declared_cost_unit_and_zero_cost_are_distinct_from_ledger_reconciliation():
    result = context([holding(average_cost="0", cost_currency="USD")])
    assert result["portfolio"]["investedValue"] == 0
    assert result["data_quality"]["allCostBasesAvailable"] is True
    assert result["portfolio"]["unrealizedPnl"] is result["portfolio"]["unrealizedPct"] is None
    assert result["data_quality"]["accountingReconciled"] is False


def test_decimal_arithmetic_ignores_ambient_context_and_never_mutates_inputs():
    rows = [holding(quantity="0.1", average_cost="0.2", cost_currency="USD")]
    quotes = {"FICT": quote(price=0.3)}
    original = deepcopy((rows, quotes))
    precision = getcontext().prec
    try:
        getcontext().prec = 2
        result = context(rows, quotes)
    finally:
        getcontext().prec = precision
    assert result["portfolio"]["currentValue"] == 0.03 and result["portfolio"]["investedValue"] == 0.02
    assert (rows, quotes) == original
    assert context([holding(quantity="1e-8")], {"FICT": quote(price=1e-8)})["portfolio"]["currentValue"] == 1e-16


@pytest.mark.parametrize("rows", [None, {}, [None], [holding(symbol="")], [holding(), holding("fict")], [holding(str(i)) for i in range(151)]])
def test_unbounded_malformed_or_duplicate_universe_is_rejected(rows):
    with pytest.raises(MCPClientError):
        select_holdings(rows)


def test_empty_is_unavailable_and_selected_scope_is_explicit():
    assert context([], {})["portfolio"]["currentValue"] is None
    assert context([], {})["data_quality"]["allQuotesFresh"] is False
    result = portfolio_context([holding(), holding("DEMO")], {"FICT": quote()}, NOW, {}, {}, "FICT")
    assert result["scope"] == "selected-stored-holding" and result["requestedSymbol"] == "FICT"
    assert result["data_quality"]["expectedSymbols"] == ["FICT"]


class Stocks:
    def __init__(self, failure=False):
        self.calls = []
        self.failure = failure

    def get_quote(self, symbol):
        self.calls.append(symbol)
        if self.failure:
            raise RuntimeError("private-upstream-body-and-credential-must-not-appear")
        return quote(symbol)


def service(monkeypatch, rows, stocks=None, **kwargs):
    app = ApplicationResearchService(live=True, stocks=stocks, clock=lambda: NOW, **kwargs)
    captured = []
    def stored(table, params, **options):
        captured.append((table, params, options))
        return rows
    monkeypatch.setattr(app, "_supabase_get", stored)
    return app, captured


def test_real_service_uses_minimal_bounded_read_and_complete_selected_contract(monkeypatch):
    stocks = Stocks()
    app, captured = service(monkeypatch, [holding()], stocks)
    result = app.portfolio_context(" fict ")
    assert captured == [("portfolio_holdings", {"select": "id,symbol,quantity,average_cost,purchase_date,notes", "order": "symbol.asc", "limit": "151"}, {"strict_records": True})]
    assert stocks.calls == ["FICT"]
    assert result["data_quality"]["quoteUsage"]["quoteCalls"] == 1
    assert result["holdings"][0]["dailyChangePct"] == 0
    assert result["portfolio"]["investedValue"] is result["portfolio"]["unrealizedPnl"] is None


def test_request_budget_preserves_unqueried_holdings_and_never_retries(monkeypatch):
    stocks = Stocks()
    app, _ = service(monkeypatch, [holding(f"F{i}") for i in range(21)], stocks)
    result = app.portfolio_context()
    assert len(stocks.calls) == len(set(stocks.calls)) == 20
    assert result["data_quality"]["holdingCount"] == 21
    assert result["data_quality"]["quoteErrors"] == {"F20": "CALL_BUDGET"}
    assert result["data_quality"]["quoteUsage"]["terminationReason"] == "call-budget"
    assert result["portfolio"]["currentValue"] is None


def test_cooperative_time_budget_withholds_late_result_without_requesting_next_symbol(monkeypatch):
    ticks = iter([0, 0, 6, 6])
    stocks = Stocks()
    app, _ = service(monkeypatch, [holding(), holding("DEMO")], stocks, monotonic=lambda: next(ticks))
    result = app.portfolio_context()
    assert stocks.calls == ["FICT"]
    assert result["data_quality"]["quoteErrors"] == {"FICT": "TIME_BUDGET", "DEMO": "TIME_BUDGET"}
    assert result["portfolio"]["currentValue"] is None


def test_provider_failure_and_missing_configuration_are_explicit_and_redacted(monkeypatch):
    stocks = Stocks(failure=True)
    app, _ = service(monkeypatch, [holding()], stocks)
    result = app.portfolio_context()
    assert stocks.calls == ["FICT"] and result["data_quality"]["quoteErrors"] == {"FICT": "PROVIDER_FAILED"}
    assert "private-upstream" not in json.dumps(result)
    app, _ = service(monkeypatch, [holding()])
    assert app.portfolio_context()["data_quality"]["quoteErrors"] == {"FICT": "QUOTE_NOT_CONFIGURED"}


def test_invalid_quantity_and_universe_never_start_provider_work(monkeypatch):
    stocks = Stocks()
    app, _ = service(monkeypatch, [holding(quantity=True)], stocks)
    assert app.portfolio_context()["data_quality"]["quoteErrors"] == {"FICT": "INVALID_QUANTITY"}
    assert stocks.calls == []
    for rows in [[holding(), holding("fict")], [holding(str(i)) for i in range(151)]]:
        app, _ = service(monkeypatch, rows, stocks)
        with pytest.raises(MCPClientError):
            app.portfolio_context()
    assert stocks.calls == []


@pytest.mark.parametrize("symbol", [True, 1, "FICT,OTHER", "FICT)or(id.gt.0)"])
def test_invalid_requested_scope_is_rejected_before_read(monkeypatch, symbol):
    app, captured = service(monkeypatch, [holding()])
    with pytest.raises(MCPClientError):
        app.portfolio_context(symbol)
    assert captured == []


@pytest.mark.parametrize("payload", [{"error": "private-body"}, [holding(), None]])
def test_actual_stored_response_validation_does_not_drop_rows_or_echo_payload(monkeypatch, payload):
    app = ApplicationResearchService(live=True, clock=lambda: NOW)
    monkeypatch.setattr(app, "_get_json", lambda *args, **kwargs: payload)
    with pytest.raises(MCPClientError) as exc:
        app.portfolio_context()
    assert exc.value.code == "INVALID_DATA" and "private-body" not in str(exc.value)


def test_stored_transport_failure_is_redacted_before_agent_boundary(monkeypatch):
    app = ApplicationResearchService(live=True, clock=lambda: NOW)
    def fail(*args, **kwargs):
        raise MCPClientError("UPSTREAM_HTTP", "https://fictional.invalid?credential=private-marker")
    monkeypatch.setattr(app, "_get_json", fail)
    with pytest.raises(MCPClientError) as exc:
        app.portfolio_context()
    assert exc.value.code == "UPSTREAM_HTTP" and "private-marker" not in str(exc.value)


def test_selected_scope_preserves_case_insensitive_loaded_identity_and_unknown_symbol(monkeypatch):
    stocks = Stocks()
    app, _ = service(monkeypatch, [holding("fict"), holding("OTHER")], stocks)
    result = app.portfolio_context("FICT")
    assert result["data_quality"]["expectedSymbols"] == ["FICT"] and stocks.calls == ["FICT"]
    missing = app.portfolio_context("MISSING")
    assert missing["holdings"] == [] and missing["portfolio"]["currentValue"] is None
    assert missing["scope"] == "selected-stored-holding" and stocks.calls == ["FICT"]


def test_maximum_stored_numeric_and_trailing_zero_scale_are_not_context_rounded():
    rows = [holding(quantity="999999999999.99999999", average_cost="0.2000000000", cost_currency="USD")]
    result = context(rows)
    assert result["holdings"][0]["quantity"] is not None
    assert result["holdings"][0]["averageCost"] == 0.2


def test_inprocess_consumer_preserves_withheld_values_and_coverage(monkeypatch):
    from app.mcp_client.inprocess import InProcessMCPToolbox
    app, _ = service(monkeypatch, [holding(), holding("DEMO")], Stocks(failure=True))
    toolbox = InProcessMCPToolbox(live=False)
    toolbox._application = app
    result = toolbox.call("app.get_portfolio_context")
    assert result["contract_version"] == "portfolio-context-v2"
    assert result["data_quality"]["expectedSymbols"] == ["FICT", "DEMO"]
    assert result["portfolio"]["currentValue"] is result["portfolio"]["unrealizedPnl"] is None
    assert result["data_quality"]["quoteUsage"]["providerRequestCount"] is None
    assert "private-upstream" not in json.dumps(result, allow_nan=False)


def test_actual_stock_quote_metadata_reaches_consumer_without_usd_or_session_guess(monkeypatch):
    from mcp_servers.stocks.providers import FinnhubProvider
    from mcp_servers.stocks.service import StockService
    typed = FinnhubProvider(api_key="fictional-context-only", clock=lambda: NOW)._normalize(
        "FICT", {"c": 100, "dp": 0, "t": 1794225540})  # OBS, fixed fictional packet
    assert typed.as_of == OBS
    class LoadedProvider:
        source = "finnhub"
        def get_quote(self, symbol):
            assert symbol == "FICT"
            return typed
    app, _ = service(monkeypatch, [holding()], StockService(provider=LoadedProvider(), clock=lambda: NOW))
    result = app.portfolio_context()
    row = result["holdings"][0]
    assert row["quote"]["changePct"] == 0 and row["quote"]["currency"] is None
    assert row["quote"]["isMarketSessionOpen"] is None
    assert result["portfolio"]["currentValue"] is result["portfolio"]["unrealizedPnl"] is None
    assert {"QUOTE_CURRENCY_UNSUPPORTED_OR_UNKNOWN", "SESSION_UNKNOWN"}.issubset(row["sourceFindings"])


def test_late_failure_records_time_termination_without_another_call(monkeypatch):
    ticks = iter([0, 0, 6, 6])
    stocks = Stocks(failure=True)
    app, _ = service(monkeypatch, [holding(), holding("DEMO")], stocks, monotonic=lambda: next(ticks))
    result = app.portfolio_context()
    assert stocks.calls == ["FICT"]
    assert result["data_quality"]["quoteUsage"]["terminationReason"] == "time-budget"
    assert result["data_quality"]["quoteErrors"] == {"FICT": "PROVIDER_FAILED", "DEMO": "TIME_BUDGET"}


def test_calculation_does_not_inherit_decimal_exponent_or_trap_settings():
    from decimal import Inexact, ROUND_DOWN, localcontext
    with localcontext() as ambient:
        ambient.prec = 2
        ambient.Emax = 2
        ambient.Emin = -2
        ambient.rounding = ROUND_DOWN
        ambient.traps[Inexact] = True
        result = context([holding(quantity="1234.12345678", average_cost="0.2", cost_currency="USD")])
        assert ambient.prec == 2 and ambient.Emax == 2 and ambient.traps[Inexact]
    assert result["portfolio"]["currentValue"] == 123412.345678
    assert result["portfolio"]["investedValue"] == 246.824691356
