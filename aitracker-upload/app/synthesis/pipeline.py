"""Synthesis pipeline — the thing under test (and under /api/eval).

The static dashboard synthesizes a "what moved and why" summary from
raw per-stock data points. This module is the Python reference
implementation the roadmap's Gemini synthesis maps onto; it is
provider-agnostic so it can later become a LangChain / LangGraph /
MCP-wrapped component without callers changing.
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.config import settings
from app.llm.client import LLMClient, strip_json_fences


# ----------------------------------------------------------------------
# Output schema (also used by assert_matches_schema in the tests)
# ----------------------------------------------------------------------
class TickerInsight(BaseModel):
    ticker: str = Field(description="Stock symbol, e.g. NVDA")
    move_pct: float = Field(description="Change for the period in percent")
    reason: str = Field(description="One-sentence driver for the move")


class MarketSynthesis(BaseModel):
    date: str
    summary: str
    insights: list[TickerInsight]
    risks: list[str] = Field(default_factory=list)
    generated_by: str = ""


# ----------------------------------------------------------------------
# Prompt
# ----------------------------------------------------------------------
SYSTEM_PROMPT = (
    "You are a market analyst for AI-infra-watch. You write factual, "
    "grounded market summaries. You never invent numbers, tickers, or "
    "events. If a fact is not in the data, you omit it. Respond ONLY "
    "with a JSON object."
)


def build_prompt(stock_data: list[dict[str, Any]], question: str = "") -> str:
    data_json = json.dumps(stock_data, ensure_ascii=False)
    # A specific question focuses the summary; when absent (the daily-overview
    # / watchlist path) the prompt is byte-identical to the original so the
    # committed stub fixtures and the market-agent path stay stable.
    focus = ""
    if question and question.strip():
        focus = (
            f"Focus on answering this question: {question.strip()}\n"
            "Ground the answer only in the data below; if the data does not "
            "address it, say so in the summary.\n\n"
        )
    return (
        f"{focus}"
        "Synthesize a daily market summary from the following per-stock data "
        "points (all fields are facts):\n\n"
        f"{data_json}\n\n"
        "Return STRICT JSON conforming to:\n"
        '{"date": "YYYY-MM-DD", "summary": "<1-2 sentences>", '
        '"insights": [{"ticker": "<SYMBOL>", "move_pct": <float>, '
        '"reason": "<one sentence>"}], '
        '"risks": ["<risk sentence>"]}\n'
        "Rules: ticker must be one of the symbols above; move_pct must match "
        "the data; reasons must cite only facts present in the data."
    )


def _as_list(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return [raw]
    return []


# ----------------------------------------------------------------------
# Pipeline entry point
# ----------------------------------------------------------------------
def synthesize(
    stock_data: list[dict[str, Any]] | dict[str, Any],
    client: LLMClient | None = None,
    question: str = "",
) -> MarketSynthesis:
    """Run the synthesis pipeline and return a validated model.

    `question`, when given, focuses the summary on that query (query-conditioned
    generation); when empty the prompt is the original daily-overview prompt so
    existing fixtures and the watchlist-driven market agent are unaffected.
    """
    client = client or LLMClient()
    prompt = build_prompt(_as_list(stock_data), question)
    raw = client.generate(prompt)
    cleaned = strip_json_fences(raw)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Synthesis output was not valid JSON: {exc}. Raw: {raw[:200]!r}"
        ) from exc
    model = MarketSynthesis.model_validate(parsed)
    if settings.TRACE_ENABLED:
        from app.eval.trace import record_call

        record_call(
            kind="synthesis",
            prompt=prompt,
            response=raw,
            metadata=client.metadata(),
        )
    return model
