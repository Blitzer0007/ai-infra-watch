"""Archive MarketParquet's newest public daily file to private Supabase Storage.

The archive preserves exact Parquet bytes and a SHA-256 hash. No data rows are
printed, attached as public CI artifacts, or written to the Git repository.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from typing import Any

from scripts.historical_evidence.storage import BUCKET, ArchiveError, utc_now, upload_object, upsert_metadata

SOURCE_ENDPOINT = "https://marketparquet.com/api/data/download/stock_daily/latest.parquet"
USER_AGENT = "AI-Infra-Watch-private-evidence-archive/1.0"
MAX_BYTES = 45 * 1024 * 1024


def fetch_latest() -> tuple[bytes, dict[str, str]]:
    request = urllib.request.Request(
        SOURCE_ENDPOINT,
        headers={"Accept": "application/octet-stream", "User-Agent": USER_AGENT},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = response.read(MAX_BYTES + 1)
            if response.status != 200:
                raise ArchiveError(f"MarketParquet latest file returned HTTP {response.status}")
            if len(body) > MAX_BYTES:
                raise ArchiveError("MarketParquet object exceeds the 45 MiB safety limit")
            headers = {
                "content_type": response.headers.get("Content-Type", ""),
                "content_disposition": response.headers.get("Content-Disposition", ""),
            }
            return body, headers
    except urllib.error.HTTPError as exc:
        raise ArchiveError(f"MarketParquet latest file returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ArchiveError(f"MarketParquet download failed ({type(exc).__name__})") from None


def _to_market_date(value: Any) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        return date.fromisoformat(value[:10]).isoformat()
    raise ValueError("Unrecognized date/timestamp field in Parquet")


def validate_parquet(content: bytes) -> dict[str, Any]:
    """Validate Parquet magic, daily schema and basic OHLCV invariants."""
    if len(content) < 12 or content[:4] != b"PAR1" or content[-4:] != b"PAR1":
        raise ValueError("Downloaded content does not have valid Parquet magic bytes")
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
        parquet = pq.ParquetFile(io.BytesIO(content))
        names = set(parquet.schema_arrow.names)
        required = {"symbol", "open", "high", "low", "close", "volume"}
        date_column = "date" if "date" in names else "timestamp" if "timestamp" in names else None
        if not required.issubset(names) or date_column is None:
            raise ValueError("Parquet schema does not contain daily OHLCV and date/timestamp columns")
        row_count = parquet.metadata.num_rows
        if row_count <= 0:
            raise ValueError("Parquet contains no rows")
        table = pq.read_table(io.BytesIO(content), columns=[date_column, *sorted(required)])
        dates = {_to_market_date(value) for value in table.column(date_column).to_pylist() if value is not None}
        if len(dates) != 1:
            raise ValueError("Expected exactly one exchange trading date per daily file")
        symbols = [value for value in table.column("symbol").to_pylist() if isinstance(value, str) and value.strip()]
        if len(symbols) != row_count or not symbols:
            raise ValueError("Parquet contains blank/missing stock symbols")
        for field in ("open", "high", "low", "close"):
            values = table.column(field).to_pylist()
            if len(values) != row_count or any(
                value is None or isinstance(value, bool) or not math.isfinite(float(value)) or float(value) <= 0
                for value in values
            ):
                raise ValueError(f"Parquet has invalid {field} values")
        volumes = table.column("volume").to_pylist()
        if any(value is not None and (
            isinstance(value, bool) or not math.isfinite(float(value)) or float(value) < 0
        ) for value in volumes):
            raise ValueError("Parquet has invalid volume values")
        market_date = next(iter(dates))
        return {
            "market_date": market_date,
            "row_count": row_count,
            "symbol_count": len(set(symbols)),
            "columns": sorted(names),
            "date_column": date_column,
            "format": "parquet",
            "parquet_version": getattr(pa, "__version__", "unknown"),
        }
    except ImportError as exc:
        raise RuntimeError("pyarrow is required to validate and archive Parquet") from exc


def archive_latest() -> dict[str, Any]:
    body, response_headers = fetch_latest()
    validated = validate_parquet(body)
    digest = hashlib.sha256(body).hexdigest()
    market_date = validated["market_date"]
    object_path = f"marketparquet/stock_daily/{market_date}/{digest}.parquet"
    retrieved_at = utc_now()
    upload_object(object_path, body, "application/vnd.apache.parquet")
    upsert_metadata({
        "provider": "marketparquet",
        "artifact_type": "stock_daily_full_market_file",
        "sha256": digest,
        "bucket_name": BUCKET,
        "object_path": object_path,
        "source_endpoint": SOURCE_ENDPOINT,
        "retrieved_at": retrieved_at,
        "source_as_of": None,
        "market_date": market_date,
        "row_count": validated["row_count"],
        "symbol_count": validated["symbol_count"],
        "evidence_status": "archive_only",
        "details": {
            "columns": validated["columns"],
            "date_column": validated["date_column"],
            "file_size_bytes": len(body),
            "content_type": response_headers["content_type"] or None,
            "adjustment": "split-adjusted; dividends are not embedded",
            "source_semantics": "current provider file preserved on retrieval date; not proof of original historical publication time",
            "license_note": "private personal research archive; do not redistribute raw file",
        },
    })
    return {
        "provider": "marketparquet",
        "market_date": market_date,
        "row_count": validated["row_count"],
        "symbol_count": validated["symbol_count"],
        "file_size_bytes": len(body),
        "sha256": digest,
        "object_path": object_path,
        "retrieved_at": retrieved_at,
        "archive_status": "archive_only",
        "response_content_type": response_headers["content_type"] or None,
    }


def main() -> int:
    try:
        result = archive_latest()
    except (ArchiveError, ValueError, RuntimeError) as exc:
        # Errors are constrained to types/messages, never raw payloads or credentials.
        print("MARKETPARQUET_ARCHIVE " + json.dumps({
            "status": "BLOCKED",
            "error_type": type(exc).__name__,
            "reason": str(exc)[:200],
        }, sort_keys=True))
        return 1
    print("MARKETPARQUET_ARCHIVE " + json.dumps(result, sort_keys=True))
    print("MARKETPARQUET_EVIDENCE_GATE archive_only=true historical_gate=not_cleared")
    return 0


if __name__ == "__main__":
    sys.exit(main())
