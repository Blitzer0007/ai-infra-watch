#!/usr/bin/env python
"""Run the EDGAR ingest pipeline to populate the filings corpus.

This is the runnable entry point that turns the `IngestAgent` (app/agents/
ingest.py) into an operable data-acquisition step OUTSIDE the test suite: it
resolves the curated `ai_stocks` universe, fetches each symbol's latest 10-K/
10-Q from EDGAR, and writes `<doc_id>.txt` + the `_index.json` manifest into
the filings corpus dir (default: data/filings/). Once populated, running the
backend with FILINGS_MODE=live makes the Filings agent (and /api/ask) answer
over this ingest-fed corpus instead of the committed sample fixtures.

Modes
-----
--mode fixture (default)  Offline: uses the committed FixtureEdgarClient, so
                          `python scripts/ingest_filings.py` runs hermetically
                          with no network and produces the NVDA/MSFT sample
                          corpus the fixture EDGAR data can serve.
--mode live               Real EDGAR over HTTP. Requires a descriptive
                          EDGAR_USER_AGENT (SEC blocks blank UAs).

Usage
-----
    python scripts/ingest_filings.py                      # whole universe, fixture
    python scripts/ingest_filings.py --symbols NVDA MSFT  # a subset
    python scripts/ingest_filings.py --mode live          # real EDGAR
    python scripts/ingest_filings.py --mode live --watchlist

`main()` takes injectable `client` / `filings_dir` / `universe` seams so the
test suite can drive it against a FixtureEdgarClient + a tmp dir with zero
network and zero writes to the real corpus.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ensure `python scripts/ingest_filings.py` works from the repo root
# regardless of cwd (matches scripts/gen_fixtures.py).
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.agents.ingest import IngestAgent  # noqa: E402
from app.agents.schemas import IngestAgentResult  # noqa: E402
from app.config import settings  # noqa: E402
from app.universe import Universe, get_universe  # noqa: E402

WATCHLIST_PATH = ROOT.parent / "data" / "stock_watchlist.json"
from mcp_servers.filings.edgar import EdgarClient  # noqa: E402
from mcp_servers.filings.edgar import from_env as edgar_from_env  # noqa: E402


def _load_watchlist_symbols(path: Path = WATCHLIST_PATH) -> list[str]:
    """Load dashboard symbols from the root JSON watchlist."""
    import json

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"failed to load watchlist: {path}: {exc}") from exc
    rows = raw.get("watchlist", []) if isinstance(raw, dict) else []
    symbols = [
        str(row["symbol"]).strip().upper()
        for row in rows
        if isinstance(row, dict) and row.get("symbol")
    ]
    if not symbols:
        raise ValueError(f"watchlist is empty: {path}")
    return symbols


def build_report(result: IngestAgentResult) -> str:
    """Render a concise, human-readable summary of an ingest run.

    Pure (no I/O) so it is trivially testable and reusable. Per-symbol
    errors are shown but are NOT failures — a run that ran cleanly is ok()
    even when some universe symbols had no EDGAR data.
    """
    lines = [
        f"ingest: {'ok' if result.ok() else 'FAILED'}",
        f"  targets:  {len(result.targets)}",
        f"  fetched:  {len(result.fetched)}  ({', '.join(result.ingested_docs) or '-'})",
        f"  skipped:  {len(result.skipped)} (already in corpus)",
        f"  chunks:   {result.chunks}",
        f"  errors:   {len(result.errors)}",
    ]
    for err in result.errors:
        lines.append(f"    - {err}")
    return "\n".join(lines)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="ingest_filings",
        description="Fetch EDGAR filings for the ai_stocks universe into the corpus dir.",
    )
    p.add_argument(
        "--mode",
        choices=["fixture", "live"],
        default="fixture",
        help="fixture (offline committed data, default) or live (real EDGAR)",
    )
    p.add_argument(
        "--symbols",
        nargs="*",
        default=None,
        help="Ticker subset to ingest (default: the whole ai_stocks universe)",
    )
    p.add_argument(
        "--watchlist",
        action="store_true",
        help="Use the root data/stock_watchlist.json symbols instead of ai_stocks",
    )
    p.add_argument(
        "--filings-dir",
        default=None,
        help="Corpus output dir (default: data/filings under DATA_DIR)",
    )
    return p.parse_args(argv)


def main(
    argv: list[str] | None = None,
    client: EdgarClient | None = None,
    filings_dir: Path | str | None = None,
    universe: Universe | None = None,
) -> IngestAgentResult:
    """Run the ingest pipeline and print a report; return the result.

    All external dependencies are injectable so a test can pass a
    FixtureEdgarClient + tmp dir. When not injected, the client is built from
    --mode, the dir defaults to data/filings, and the universe defaults to the
    curated ai_stocks set.
    """
    args = _parse_args(argv)

    client = client if client is not None else edgar_from_env(args.mode)
    out_dir = Path(filings_dir or args.filings_dir or settings.DATA_DIR / "filings")
    universe = universe if universe is not None else get_universe()

    symbols = args.symbols or None
    if args.watchlist and symbols:
        raise SystemExit("--watchlist cannot be combined with --symbols")
    if args.watchlist:
        try:
            symbols = _load_watchlist_symbols()
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc

    agent = IngestAgent(client=client, universe=universe, filings_dir=out_dir)
    result = agent.run(symbols=symbols)

    print(f"corpus dir: {out_dir}")
    print(build_report(result))
    return result


if __name__ == "__main__":
    raise SystemExit(0 if main().ok() else 1)
