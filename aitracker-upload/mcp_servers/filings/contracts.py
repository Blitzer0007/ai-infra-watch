"""Contract intelligence over primary SEC filings.

This module converts 8-K material-agreement disclosures into structured,
auditable contract records. It never labels a headline as a confirmed deal:
records are emitted only from primary SEC filing documents whose 8-K item set
contains a contract/obligation signal (1.01, 1.02, 2.03).

Extraction is deliberately conservative and deterministic:
- value/amount strings come from nearby dollar/percent/quantity expressions;
- counterparties are taken from "between ... and ..." / "with ..." patterns;
- an evidence snippet is preserved from the filing text;
- every record carries accession + direct EDGAR URL.

The LLM/autonomous layer can interpret these records later, but it cannot
manufacture contract terms that were not present in the source document.
"""
from __future__ import annotations

import re
from typing import Iterable

from .edgar import EdgarClient, from_env as edgar_from_env
from .schemas import ContractRecord, ContractTimeline, EdgarError, FilingRef

CONTRACT_ITEMS = frozenset({"1.01", "1.02", "2.03"})
_VALUE_RE = re.compile(
    r"(?i)(?:US\$|\$)\s?\d+(?:\.\d+)?\s?(?:million|billion|trillion|bn|mm|m|k)?"
)
_PERCENT_RE = re.compile(r"\b\d+(?:\.\d+)?\s?%")
_BETWEEN_RE = re.compile(r"(?is)between\s+(.{3,120}?)\s+and\s+(.{3,120}?)(?:[\.;:,]|\n)")
_WITH_RE = re.compile(r"(?is)\bwith\s+([A-Z][A-Za-z0-9&.,'() -]{2,100}?)(?:\s+(?:the|in|under|for|on|pursuant|dated)|[\.;:,]|\n)")


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" \t\r\n,.;:")


def _dedupe(values: Iterable[str], limit: int = 5) -> list[str]:
    out: list[str] = []
    for value in values:
        value = _clean(value)
        if value and value not in out:
            out.append(value)
        if len(out) >= limit:
            break
    return out


def _candidate_sections(text: str) -> list[str]:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    return [line for line in lines if len(line) >= 20][:120]


def _extract_evidence(text: str, limit: int = 3) -> list[str]:
    sections = _candidate_sections(text)
    hits: list[str] = []
    for line in sections:
        lower = line.lower()
        if any(term in lower for term in ("agreement", "contract", "purchase", "lease", "order", "commitment", "obligation")):
            hits.append(line[:600])
    return _dedupe(hits, limit=limit)


def _extract_values(text: str) -> list[str]:
    matches = _VALUE_RE.findall(text or "")
    percentages = _PERCENT_RE.findall(text or "")
    return _dedupe([*matches, *percentages], limit=8)


def _extract_counterparties(text: str) -> list[str]:
    candidates: list[str] = []
    for m in _BETWEEN_RE.finditer(text or ""):
        candidates.extend([m.group(1), m.group(2)])
    for m in _WITH_RE.finditer(text or ""):
        candidates.append(m.group(1))
    cleaned: list[str] = []
    for value in candidates:
        value = _clean(value)
        if len(value) < 3 or len(value) > 120:
            continue
        if value.lower() in {"the company", "the registrant", "the parties"}:
            continue
        cleaned.append(value)
    return _dedupe(cleaned, limit=5)


def _record(ref: FilingRef, text: str) -> ContractRecord:
    return ContractRecord(
        symbol=ref.symbol,
        date=ref.filed_date,
        form=ref.form,
        accession=ref.accession,
        url=ref.url,
        items=list(ref.items),
        title="Material agreement / financial obligation",
        counterparties=_extract_counterparties(text),
        disclosed_values=_extract_values(text),
        evidence=_extract_evidence(text),
        source="sec-edgar-primary",
        confidence="primary_filing",
    )


class ContractService:
    """Find recent contract-related 8-Ks and extract auditable terms."""

    def __init__(self, client: EdgarClient | None = None, limit: int = 12) -> None:
        self.client = client or edgar_from_env("fixture")
        self.limit = limit

    @classmethod
    def from_env(cls, mode: str = "fixture") -> "ContractService":
        return cls(client=edgar_from_env(mode))

    def get_timeline(self, symbol: str) -> ContractTimeline:
        sym = symbol.strip().upper()
        cik = self.client.resolve_cik(sym)
        if not cik:
            raise EdgarError("NO_DATA", f"no CIK for {sym}")
        refs = self.client.recent_events(cik, form="8-K", limit=self.limit)
        records: list[ContractRecord] = []
        for ref in refs:
            if not (set(ref.items) & CONTRACT_ITEMS):
                continue
            try:
                text = self.client.download(ref)
            except EdgarError:
                continue
            if not (text or "").strip():
                continue
            records.append(_record(ref, text))
        return ContractTimeline(symbol=sym, source=self.client.source, contracts=records)

    def get_many(self, symbols: list[str]) -> dict[str, ContractTimeline]:
        out: dict[str, ContractTimeline] = {}
        errors = 0
        for symbol in symbols:
            try:
                timeline = self.get_timeline(symbol)
                out[timeline.symbol] = timeline
            except EdgarError:
                errors += 1
        if symbols and errors == len(symbols):
            raise EdgarError("NO_DATA", f"all {len(symbols)} symbols failed")
        return out


def from_env(mode: str = "fixture") -> ContractService:
    return ContractService.from_env(mode=mode)
