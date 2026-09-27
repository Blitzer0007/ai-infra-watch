from __future__ import annotations

from pathlib import Path

from mcp_servers.filings.contracts import ContractService, _extract_counterparties, _extract_values
from mcp_servers.filings.edgar import FixtureEdgarClient


def test_contract_value_extraction_is_conservative():
    text = "The agreement provides for aggregate consideration of $1.25 billion and an upfront payment of $250 million."
    values = _extract_values(text)
    assert "$1.25 billion" in values
    assert "$250 million" in values


def test_contract_counterparty_pattern_extraction():
    text = "The Master Services Agreement was entered into between Example AI, Inc. and Acme Compute LLC for GPU capacity."
    parties = _extract_counterparties(text)
    assert any("Example AI" in x for x in parties)
    assert any("Acme Compute" in x for x in parties)


def test_contract_service_fixture_degrades_cleanly_for_no_8k_data():
    svc = ContractService(client=FixtureEdgarClient())
    timeline = svc.get_timeline("NVDA")
    assert timeline.symbol == "NVDA"
    assert isinstance(timeline.contracts, list)
