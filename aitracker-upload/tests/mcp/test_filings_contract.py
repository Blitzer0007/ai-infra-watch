"""Contract tests for the filings MCP server.

Drive the REAL MCP dispatch path (server.list_tools / call_tool, both
async) to prove the wire contract an agent sees:
  * the exact tool set is registered
  * each tool's input_schema advertises the params agents pass
  * call_tool results round-trip back into the pydantic schemas
  * a bad document id surfaces as a controlled tool error, not a crash
  * the health resource serves JSON
"""
from __future__ import annotations

import asyncio
import json

import pytest

from mcp.server.mcpserver.exceptions import ToolError

from mcp_servers.filings.schemas import AnswerResult, FilingsHealth, SearchResult
from mcp_servers.filings.server import build_server
from mcp_servers.filings.service import from_env

EXPECTED_TOOLS = {
    "search_filings",
    "answer_question",
    "list_documents",
    "get_document",
    "health",
}


@pytest.fixture
def server():
    return build_server(from_env("fixture"))


def _run(coro):
    return asyncio.run(coro)


def _text(result) -> str:
    assert not result.is_error, f"tool errored: {result}"
    return result.content[0].text


# ---- tool registration -------------------------------------------------
def test_expected_tools_are_registered(server):
    tools = _run(server.list_tools())
    assert {t.name for t in tools} == EXPECTED_TOOLS


def test_search_filings_schema_advertises_query(server):
    tools = _run(server.list_tools())
    tool = next(t for t in tools if t.name == "search_filings")
    props = (tool.input_schema or {}).get("properties", {})
    assert "query" in props


def test_answer_question_schema_advertises_question(server):
    tools = _run(server.list_tools())
    tool = next(t for t in tools if t.name == "answer_question")
    props = (tool.input_schema or {}).get("properties", {})
    assert "question" in props


def test_get_document_schema_advertises_document_id(server):
    tools = _run(server.list_tools())
    tool = next(t for t in tools if t.name == "get_document")
    props = (tool.input_schema or {}).get("properties", {})
    assert "document_id" in props


# ---- call round-trips into the schemas ---------------------------------
def test_search_filings_roundtrips(server):
    result = _run(server.call_tool("search_filings", {"query": "data center revenue"}))
    parsed = SearchResult.model_validate_json(_text(result))
    assert parsed.query == "data center revenue"
    assert parsed.hits
    assert parsed.hits[0].document_id


def test_answer_question_roundtrips(server):
    result = _run(
        server.call_tool("answer_question", {"question": "How much did NVIDIA revenue grow?"})
    )
    parsed = AnswerResult.model_validate_json(_text(result))
    assert parsed.answer.strip()
    assert parsed.citations


def test_list_documents_returns_ids(server):
    # A tool returning list[str] renders one TextContent per element.
    result = _run(server.call_tool("list_documents", {}))
    assert not result.is_error
    ids = {block.text for block in result.content}
    assert "nvda_10k_fy2025" in ids


def test_get_document_returns_text(server):
    result = _run(server.call_tool("get_document", {"document_id": "meta_10k_fy2025"}))
    text = _text(result)
    assert "Meta" in text


def test_health_tool_reports_fixture_mode(server):
    result = _run(server.call_tool("health", {}))
    payload = FilingsHealth.model_validate_json(_text(result))
    assert payload.server == "mcp-server-filings"
    assert payload.mode == "fixture"
    assert payload.ok is True


# ---- error contract ----------------------------------------------------
def test_unknown_document_surfaces_as_tool_error(server):
    with pytest.raises(ToolError):
        _run(server.call_tool("get_document", {"document_id": "nope"}))


def test_empty_query_surfaces_as_tool_error(server):
    with pytest.raises(ToolError):
        _run(server.call_tool("search_filings", {"query": "  "}))


# ---- resource ----------------------------------------------------------
def test_health_resource_serves_json(server):
    resources = _run(server.list_resources())
    uris = {str(r.uri) for r in resources}
    assert "filings://corpus/health" in uris
    contents = _run(server.read_resource("filings://corpus/health"))
    payload = json.loads(contents[0].content)
    assert payload["server"] == "mcp-server-filings"
