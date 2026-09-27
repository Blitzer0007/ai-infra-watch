"""Export structured SEC contract disclosures for the dashboard.

Reads the shared root watchlist, uses ContractService against live SEC EDGAR,
and writes a stable JSON artifact. No timestamps are written so an unchanged
filing set does not create noisy Git commits.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from mcp_servers.filings.contracts import ContractService

ROOT = Path(__file__).resolve().parents[2]
WATCHLIST_PATH = ROOT / "data" / "stock_watchlist.json"
DEFAULT_OUTPUT = ROOT / "data" / "contracts_sec.json"


def _load_symbols(path: Path) -> list[str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    rows = raw.get("watchlist", []) if isinstance(raw, dict) else []
    symbols = [
        str(row.get("symbol", "")).strip().upper()
        for row in rows
        if isinstance(row, dict) and row.get("symbol")
    ]
    # Portfolio names are already represented in the root watchlist universe
    # where relevant; preserve source ordering for deterministic output.
    return list(dict.fromkeys(symbols))


def _record_to_dict(record) -> dict:
    return {
        "id": f"sec-{record.symbol}-{record.accession.replace('-', '') or record.date}",
        "company": record.symbol,
        "client": ", ".join(record.counterparties) if record.counterparties else "Counterparty disclosed in SEC filing",
        "value": ", ".join(record.disclosed_values) if record.disclosed_values else "Not quantified in extracted evidence",
        "duration": "See primary SEC filing",
        "hardware": "See primary SEC filing",
        "details": " | ".join(record.evidence[:2]) if record.evidence else record.title,
        "status": f"SEC {record.form} • items {', '.join(record.items)}",
        "statusLevel": "high-verified",
        "dateSigned": record.date,
        "source": record.source,
        "accession": record.accession,
        "url": record.url,
        "items": record.items,
        "evidence": record.evidence,
    }


def export_contracts(symbols: list[str], output: Path) -> int:
    service = ContractService.from_env("live")
    timelines = service.get_many(symbols)
    records = []
    for symbol in symbols:
        timeline = timelines.get(symbol)
        if not timeline:
            continue
        records.extend(_record_to_dict(record) for record in timeline.contracts)
    records.sort(key=lambda x: (x["company"], x["date"], x["accession"]))
    payload = {"contracts": records}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(records)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export SEC contract intelligence to JSON.")
    parser.add_argument("--watchlist", action="store_true", help="Use data/stock_watchlist.json.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output JSON path.")
    args = parser.parse_args()

    symbols = _load_symbols(WATCHLIST_PATH) if args.watchlist else _load_symbols(WATCHLIST_PATH)
    count = export_contracts(symbols, Path(args.output))
    print(f"exported {count} SEC contract records")


if __name__ == "__main__":
    main()
