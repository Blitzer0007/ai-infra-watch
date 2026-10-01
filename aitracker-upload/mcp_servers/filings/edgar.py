"""EDGAR client for the Ingest Agent — SEC filing acquisition.

Two implementations behind one Protocol, exactly like the stocks
providers (FixtureProvider / FinnhubProvider):

  * FixtureEdgarClient — reads committed sample EDGAR JSON from
    mcp_servers/filings/fixtures/edgar/. Fully offline and deterministic;
    the default for tests and CI. Lets the Ingest Agent run end-to-end
    (resolve CIK -> list filings -> download text -> ingest) with zero
    network.
  * LiveEdgarClient — real https://data.sec.gov + https://www.sec.gov
    calls, with the same retry/backoff discipline as
    mcp_servers/stocks/providers.py:FinnhubProvider. EDGAR needs no API
    key but REQUIRES a descriptive User-Agent (it blocks blank-UA
    requests) and asks callers to stay under ~10 req/s.

Both return FilingRef objects, so the agent never branches on which
client is active — only the document bytes differ.

EDGAR endpoints used
--------------------
  * company_tickers.json  — ticker -> CIK map
        {"0": {"cik_str": 1045810, "ticker": "NVDA", "title": "NVIDIA CORP"}, ...}
  * submissions/CIK##########.json  — recent filings for one CIK (10-digit,
        zero-padded), with parallel arrays under filings.recent:
        accessionNumber[], form[], filingDate[], primaryDocument[]
  * Archives/edgar/data/<cik>/<accession-no-dashes>/<primaryDocument>
        — the filing document itself.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Iterable, Protocol

import httpx

from mcp_servers.filings.schemas import EdgarError, FilingRef

# Committed sample EDGAR payloads (offline) live next to the corpus fixtures.
FIXTURE_EDGAR_DIR = Path(__file__).resolve().parent / "fixtures" / "edgar"

# EDGAR requires a descriptive User-Agent (a company/app name + contact).
# Overridable via EDGAR_USER_AGENT for real deployments.
DEFAULT_USER_AGENT = "AI Infra Watch/1.0 (SEC research; contact: github-actions[bot]@users.noreply.github.com)"

DEFAULT_FORMS: tuple[str, ...] = ("10-K", "10-Q")


DEFAULT_EVENT_FORM = "8-K"
DEFAULT_EVENT_LIMIT = 12


class EdgarClient(Protocol):
    def resolve_cik(self, symbol: str) -> str | None: ...
    def recent_filings(
        self, cik: str, forms: Iterable[str] = DEFAULT_FORMS
    ) -> list[FilingRef]: ...
    def recent_events(
        self,
        cik: str,
        form: str = DEFAULT_EVENT_FORM,
        limit: int = DEFAULT_EVENT_LIMIT,
    ) -> list[FilingRef]: ...
    def download(self, ref: FilingRef) -> str: ...
    @property
    def source(self) -> str: ...


def _pad_cik(cik: str) -> str:
    """EDGAR submissions endpoint wants a 10-digit zero-padded CIK."""
    digits = "".join(ch for ch in str(cik) if ch.isdigit())
    return digits.zfill(10)


def _latest_per_form(
    symbol: str,
    cik: str,
    recent: dict,
    forms: Iterable[str],
) -> list[FilingRef]:
    """Pick the most-recent filing of each requested form from the parallel
    arrays under submissions.filings.recent. EDGAR lists newest first, so the
    first match per form is the latest."""
    want = {f.upper() for f in forms}
    acc = recent.get("accessionNumber") or []
    form_arr = recent.get("form") or []
    dates = recent.get("filingDate") or []
    docs = recent.get("primaryDocument") or []
    seen: set[str] = set()
    out: list[FilingRef] = []
    for i, form in enumerate(form_arr):
        f = str(form).upper()
        if f not in want or f in seen:
            continue
        seen.add(f)
        accession = acc[i] if i < len(acc) else ""
        primary = docs[i] if i < len(docs) else ""
        filed = dates[i] if i < len(dates) else ""
        cik_int = str(int(_pad_cik(cik)))
        acc_nodash = str(accession).replace("-", "")
        url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{primary}"
            if accession and primary
            else ""
        )
        out.append(
            FilingRef(
                cik=_pad_cik(cik),
                symbol=symbol.upper(),
                form=f,
                accession=str(accession),
                primary_doc=str(primary),
                filed_date=str(filed),
                url=url,
            )
        )
        if seen >= want:
            break
    return out


def _recent_of_form(
    symbol: str,
    cik: str,
    recent: dict,
    form: str,
    limit: int = 12,
) -> list[FilingRef]:
    """Return up to `limit` most-recent filings of a single form from the
    parallel arrays under submissions.filings.recent, preserving item codes when
    EDGAR included them (8-K filings carry an items[] of section codes). EDGAR
    lists newest first, so the first matches are the most recent."""
    want = form.upper()
    acc = recent.get("accessionNumber") or []
    form_arr = recent.get("form") or []
    dates = recent.get("filingDate") or []
    docs = recent.get("primaryDocument") or []
    items_arr = recent.get("items") or []
    cik_int = str(int(_pad_cik(cik)))
    out: list[FilingRef] = []
    for i, f in enumerate(form_arr):
        if str(f).upper() != want:
            continue
        accession = acc[i] if i < len(acc) else ""
        primary = docs[i] if i < len(docs) else ""
        filed = dates[i] if i < len(dates) else ""
        items_raw = items_arr[i] if i < len(items_arr) else ""
        items = (
            [it.strip() for it in str(items_raw).split(",") if it.strip()]
            if items_raw
            else []
        )
        acc_nodash = str(accession).replace("-", "")
        url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{primary}"
            if accession and primary
            else ""
        )
        out.append(
            FilingRef(
                cik=_pad_cik(cik),
                symbol=symbol.upper(),
                form=f,
                accession=str(accession),
                primary_doc=str(primary),
                filed_date=str(filed),
                url=url,
                items=items,
            )
        )
        if len(out) >= limit:
            break
    return out


# ----------------------------------------------------------------------
# Fixture client (offline, deterministic)
# ----------------------------------------------------------------------
class FixtureEdgarClient:
    """Serve EDGAR data from committed JSON/text fixtures.

    Layout (mcp_servers/filings/fixtures/edgar/):
        company_tickers.json          — same shape as the real endpoint
        submissions/CIK##########.json — recent-filings slice per CIK
        docs/<accession-no-dashes>.txt — the filing document text

    Missing data raises EdgarError("NO_DATA", ...) — the agent degrades
    that symbol and moves on, exactly as a live 404 would.
    """

    source = "fixture"

    def __init__(self, base_dir: Path | str = FIXTURE_EDGAR_DIR) -> None:
        self.base_dir = Path(base_dir)
        self._tickers: dict[str, str] | None = None

    def _load_tickers(self) -> dict[str, str]:
        if self._tickers is None:
            path = self.base_dir / "company_tickers.json"
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except FileNotFoundError as exc:
                raise EdgarError("NO_DATA", f"fixture missing: {path}") from exc
            except json.JSONDecodeError as exc:
                raise EdgarError("NO_DATA", f"bad fixture JSON: {exc}") from exc
            self._tickers = {
                str(row.get("ticker", "")).upper(): _pad_cik(row.get("cik_str", ""))
                for row in raw.values()
            }
        return self._tickers

    def resolve_cik(self, symbol: str) -> str | None:
        return self._load_tickers().get(symbol.strip().upper())

    def recent_filings(
        self, cik: str, forms: Iterable[str] = DEFAULT_FORMS
    ) -> list[FilingRef]:
        path = self.base_dir / "submissions" / f"CIK{_pad_cik(cik)}.json"
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise EdgarError("NO_DATA", f"no submissions fixture for CIK {cik}") from exc
        except json.JSONDecodeError as exc:
            raise EdgarError("NO_DATA", f"bad submissions JSON: {exc}") from exc
        symbol = str(raw.get("tickers", [""])[0] or "").upper()
        recent = (raw.get("filings") or {}).get("recent") or {}
        return _latest_per_form(symbol, cik, recent, forms)

    def recent_events(
        self,
        cik: str,
        form: str = DEFAULT_EVENT_FORM,
        limit: int = DEFAULT_EVENT_LIMIT,
    ) -> list[FilingRef]:
        path = self.base_dir / "submissions" / f"CIK{_pad_cik(cik)}.json"
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise EdgarError("NO_DATA", f"no submissions fixture for CIK {cik}") from exc
        except json.JSONDecodeError as exc:
            raise EdgarError("NO_DATA", f"bad submissions JSON: {exc}") from exc
        symbol = str(raw.get("tickers", [""])[0] or "").upper()
        recent = (raw.get("filings") or {}).get("recent") or {}
        return _recent_of_form(symbol, cik, recent, form, limit)

    def download(self, ref: FilingRef) -> str:
        acc_nodash = ref.accession.replace("-", "")
        path = self.base_dir / "docs" / f"{acc_nodash}.txt"
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError as exc:
            raise EdgarError("NO_DATA", f"no document fixture for {ref.accession}") from exc
        return text


# ----------------------------------------------------------------------
# Live client (real EDGAR)
# ----------------------------------------------------------------------
def _http_retryable(status: int) -> bool:
    return status in (408, 409, 429) or 500 <= status <= 599


class LiveEdgarClient:
    """Real EDGAR access. Mirrors FinnhubProvider's retry/backoff policy.

    No API key; a descriptive User-Agent is mandatory (SEC blocks blank
    UA). A conservative inter-request sleep keeps us under EDGAR's ~10
    req/s ceiling without a separate rate-limiter.
    """

    source = "live"
    TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
    SUBMISSIONS_BASE = "https://data.sec.gov/submissions"

    def __init__(
        self,
        user_agent: str | None = None,
        max_retries: int = 4,
        base_delay: float = 1.0,
        timeout: float = 20.0,
        min_interval: float = 0.11,  # ~9 req/s ceiling
    ) -> None:
        self.user_agent = (
            user_agent if user_agent is not None
            else os.getenv("EDGAR_USER_AGENT", DEFAULT_USER_AGENT)
        )
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout
        self.min_interval = min_interval
        self.gateway_url = os.getenv("EDGAR_GATEWAY_URL", "").strip()
        self.gateway_token = os.getenv("EDGAR_GATEWAY_TOKEN", "").strip()
        self._tickers: dict[str, str] | None = None
        self._last_call = 0.0

    def _headers(self) -> dict[str, str]:
        return {"User-Agent": self.user_agent, "Accept-Encoding": "gzip, deflate"}

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_call
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_call = time.monotonic()

    def _gateway_target(self, url: str) -> str | None:
        """Translate supported SEC URLs to the optional Vercel SEC gateway."""
        if not self.gateway_url:
            return None

        if url == "https://www.sec.gov/files/company_tickers.json":
            resource = {"sec": "tickers"}
        elif url.startswith("https://data.sec.gov/submissions/CIK"):
            cik = url.rsplit("/CIK", 1)[-1].removesuffix(".json")
            if not cik.isdigit():
                return None
            resource = {"sec": "submissions", "cik": cik}
        elif url.startswith("https://data.sec.gov/api/xbrl/companyfacts/CIK"):
            cik = url.rsplit("/CIK", 1)[-1].removesuffix(".json")
            if not cik.isdigit():
                return None
            resource = {"sec": "companyfacts", "cik": cik}
        elif url.startswith("https://www.sec.gov/Archives/edgar/data/"):
            resource = {"sec": "archive", "url": url}
        else:
            return None

        from urllib.parse import urlencode
        return self.gateway_url + ("&" if "?" in self.gateway_url else "?") + urlencode(resource)

    def _get(self, url: str) -> httpx.Response:
        if not self.user_agent:
            raise EdgarError("NO_UA", "EDGAR requires a descriptive User-Agent")
        last_exc: Exception | None = None
        request_url = self._gateway_target(url) or url
        request_headers = self._headers()
        if request_url != url and self.gateway_token:
            request_headers["Authorization"] = "Bearer " + self.gateway_token

        for attempt in range(self.max_retries + 1):
            self._throttle()
            try:
                with httpx.Client(timeout=self.timeout, headers=request_headers) as client:
                    resp = client.get(request_url)
                if resp.status_code == 429:
                    if attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise EdgarError("RATE_LIMIT", "EDGAR rate limit (~10 req/s)")
                if resp.status_code >= 400:
                    if _http_retryable(resp.status_code) and attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    detail = (resp.text or "").strip().replace("\n", " ")[:240]
                    suffix = f" ({detail})" if detail else ""
                    raise EdgarError("HTTP_ERROR", f"EDGAR returned {resp.status_code} for {url}{suffix}")
                return resp
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise EdgarError("HTTP_ERROR", f"EDGAR request failed: {last_exc}")

    def _load_tickers(self) -> dict[str, str]:
        if self._tickers is None:
            raw = self._get(self.TICKERS_URL).json()
            self._tickers = {
                str(row.get("ticker", "")).upper(): _pad_cik(row.get("cik_str", ""))
                for row in raw.values()
            }
        return self._tickers

    def resolve_cik(self, symbol: str) -> str | None:
        return self._load_tickers().get(symbol.strip().upper())

    def recent_filings(
        self, cik: str, forms: Iterable[str] = DEFAULT_FORMS
    ) -> list[FilingRef]:
        url = f"{self.SUBMISSIONS_BASE}/CIK{_pad_cik(cik)}.json"
        raw = self._get(url).json()
        symbol = str((raw.get("tickers") or [""])[0] or "").upper()
        recent = (raw.get("filings") or {}).get("recent") or {}
        return _latest_per_form(symbol, cik, recent, forms)

    def recent_events(
        self,
        cik: str,
        form: str = DEFAULT_EVENT_FORM,
        limit: int = DEFAULT_EVENT_LIMIT,
    ) -> list[FilingRef]:
        url = f"{self.SUBMISSIONS_BASE}/CIK{_pad_cik(cik)}.json"
        raw = self._get(url).json()
        symbol = str((raw.get("tickers") or [""])[0] or "").upper()
        recent = (raw.get("filings") or {}).get("recent") or {}
        return _recent_of_form(symbol, cik, recent, form, limit)

    def download(self, ref: FilingRef) -> str:
        if not ref.url:
            raise EdgarError("NO_DATA", f"no document url for {ref.accession}")
        return self._get(ref.url).text


def from_env(mode: str | None = None) -> EdgarClient:
    """Build an EdgarClient from the environment.

    EDGAR_MODE=fixture (default) -> committed sample payloads, offline.
    EDGAR_MODE=live               -> real EDGAR (needs EDGAR_USER_AGENT).
    """
    mode = (mode or os.getenv("EDGAR_MODE", "fixture")).strip().lower()
    if mode == "live":
        return LiveEdgarClient()
    return FixtureEdgarClient()
