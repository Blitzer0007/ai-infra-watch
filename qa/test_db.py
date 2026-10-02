from __future__ import annotations

import os
import httpx
import pytest

TABLES = {
    "portfolio_holdings": "symbol,quantity,average_cost,purchase_date",
    "forecast_snapshots": "ticker,horizon,status,median,actual_return",
    "forecast_model_config": "ticker,horizon,model_version",
    "ai_quality_runs": "suite,target,status,quality_score,case_count,failures",
}

@pytest.fixture(scope="module")
def db_client():
    url = (os.getenv("QA_SUPABASE_URL") or os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = (os.getenv("QA_SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        pytest.skip("Supabase credentials not configured for DB validation.")
    client = httpx.Client(base_url=url, headers={"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"}, timeout=30.0)
    yield client
    client.close()

def test_table_access_and_schema(db_client):
    for table, select in TABLES.items():
        response = db_client.get("/rest/v1/" + table, params={"select":select,"limit":"5"})
        assert response.status_code == 200, response.text[:500]
        assert isinstance(response.json(), list)

def test_portfolio_data_integrity(db_client):
    response = db_client.get("/rest/v1/portfolio_holdings", params={"select":"symbol,quantity,average_cost,purchase_date","order":"symbol.asc","limit":"100"})
    assert response.status_code == 200, response.text[:500]
    rows=response.json()
    assert rows
    symbols=[str(row["symbol"]).upper() for row in rows]
    assert len(symbols)==len(set(symbols))
    for row in rows:
        assert float(row["quantity"])>0
        assert float(row["average_cost"])>=0
        assert row.get("purchase_date")

def test_forecast_data_integrity(db_client):
    response = db_client.get("/rest/v1/forecast_snapshots", params={"select":"ticker,horizon,status,median,actual_return","order":"created_at.desc","limit":"25"})
    assert response.status_code == 200, response.text[:500]
    for row in response.json():
        assert int(row["horizon"]) in {5,20,60,120,252}
        assert row["status"] in {"pending","verified"}
        assert row["ticker"]

def test_quality_run_metrics_integrity(db_client):
    response = db_client.get("/rest/v1/ai_quality_runs", params={"select":"quality_score,faithfulness,relevance,safety,hallucination_rate,citation_coverage,adversarial_failure_rate,case_count,failures","order":"created_at.desc","limit":"25"})
    assert response.status_code == 200, response.text[:500]
    for row in response.json():
        for key in ["quality_score","faithfulness","relevance","safety","hallucination_rate","citation_coverage","adversarial_failure_rate"]:
            if row[key] is not None: assert 0 <= float(row[key]) <= 100
        assert int(row["case_count"] or 0) >= 0
        assert int(row["failures"] or 0) >= 0
