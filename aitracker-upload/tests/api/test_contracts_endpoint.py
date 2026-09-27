from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.main as main
from mcp_servers.filings.contracts import ContractService
from mcp_servers.filings.edgar import FixtureEdgarClient


@pytest.fixture(scope="module")
def client():
    previous = main._contract_service
    main._contract_service = ContractService(client=FixtureEdgarClient())
    try:
        with TestClient(main.app) as c:
            yield c
    finally:
        main._contract_service = previous


def test_contracts_endpoint_returns_documented_shape(client):
    response = client.get("/api/contracts", params={"symbols": "NVDA"})
    assert response.status_code == 200
    body = response.json()
    assert set(("symbols", "missing", "contracts")) <= set(body)
    assert "NVDA" in body["symbols"]
    assert "NVDA" in body["contracts"]
    assert isinstance(body["contracts"]["NVDA"]["contracts"], list)


def test_contracts_endpoint_rejects_empty_symbol_list(client):
    response = client.get("/api/contracts", params={"symbols": " , "})
    assert response.status_code == 422
