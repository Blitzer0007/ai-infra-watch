"""mcp-server-stocks: real-time stock quotes as MCP tools + a live resource.

Public surface (importable without running the server):
    StockService        — transport-independent domain logic (tested directly)
    build_server        — construct the MCPServer shell around a service
    FixtureProvider     — offline deterministic quotes (tests / CI)
    FinnhubProvider     — live quotes (FINNHUB_API_KEY)
    CandleService       — daily price-history store (rotation detector)
    schemas             — Quote / QuoteBatch / Candle / CandleSeries / ...
"""
from .candles import (
    CandleService,
    FixtureCandleProvider,
    StooqCandleProvider,
    series_from_closes,
)
from .earnings import (
    EarningsService,
    FinnhubEarningsProvider,
    FixtureEarningsProvider,
    FmpEarningsProvider,
)
from .providers import FinnhubProvider, FixtureProvider, QuoteError
from .schemas import (
    Candle,
    CandleSeries,
    EarningsEvent,
    EarningsHistory,
    FeedMessage,
    Quote,
    QuoteBatch,
    ServerHealth,
)
from .service import DEFAULT_WATCHLIST, StockService
from .server import build_server, from_env, main

__all__ = [
    "StockService",
    "CandleService",
    "EarningsService",
    "build_server",
    "from_env",
    "main",
    "FixtureProvider",
    "FinnhubProvider",
    "FixtureCandleProvider",
    "StooqCandleProvider",
    "FixtureEarningsProvider",
    "FinnhubEarningsProvider",
    "series_from_closes",
    "QuoteError",
    "FeedMessage",
    "Quote",
    "QuoteBatch",
    "Candle",
    "CandleSeries",
    "EarningsEvent",
    "EarningsHistory",
    "ServerHealth",
    "DEFAULT_WATCHLIST",
]
