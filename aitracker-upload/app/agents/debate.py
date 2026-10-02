"""Bounded multi-agent debate for stock/ETF research.

This module is intentionally question-triggered. It does not generate a trade
recommendation; it produces structured opposing interpretations from the same
retrieved evidence and uses three independent judges to label the balance of
evidence as bull/bear/mixed/unclear.
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

from app.llm.client import LLMClient


@dataclass
class JudgeVerdict:
    judge: int
    verdict: str
    confidence: float | None = None
    rationale: str = ""


@dataclass
class DebateResult:
    enabled: bool = True
    bull_case: str = ""
    bear_case: str = ""
    judges: list[JudgeVerdict] = field(default_factory=list)
    majority: str = "unclear"
    agreement: float = 0.0
    disagreement: bool = False
    note: str = ""


def _compact(value: Any, limit: int = 7000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        text = str(value)
    return text[:limit]


def _parse_judge(raw: str, judge: int) -> JudgeVerdict:
    text = str(raw or "").strip()
    value = None
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                value = json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                value = None

    if isinstance(value, dict):
        verdict = str(value.get("verdict") or "unclear").strip().lower()
        if verdict not in {"bull", "bear", "mixed", "unclear"}:
            verdict = "unclear"
        confidence = value.get("confidence")
        try:
            confidence = float(confidence) if confidence is not None else None
        except (TypeError, ValueError):
            confidence = None
        rationale = str(value.get("rationale") or "").strip()
        return JudgeVerdict(judge=judge, verdict=verdict, confidence=confidence, rationale=rationale[:1200])

    lower = text.lower()
    verdict = "mixed" if "mixed" in lower else "bull" if "bull" in lower else "bear" if "bear" in lower else "unclear"
    return JudgeVerdict(judge=judge, verdict=verdict, rationale=text[:1200])


def _advocate_prompt(role: str, question: str, evidence: list[dict[str, Any]]) -> str:
    return f"""You are the {role} analyst in a bounded stock/ETF research debate.

Question:
{question}

Retrieved evidence:
{_compact(evidence)}

Build the strongest evidence-grounded {role.lower()} case.
Rules:
- Use only retrieved evidence.
- Separate observed facts from interpretation.
- Identify missing evidence.
- Do not invent prices, catalysts, forecasts, or events.
- Do not give personalized trading instructions.
- Keep the argument concise.
"""


def _judge_prompt(question: str, bull: str, bear: str, evidence: list[dict[str, Any]], judge_id: int) -> str:
    return f"""You are independent judge #{judge_id} evaluating a stock/ETF research debate.

Question:
{question}

Evidence:
{_compact(evidence)}

Bull case:
{bull}

Bear case:
{bear}

Return JSON only:
{{"verdict":"bull|bear|mixed|unclear","confidence":0.0,"rationale":"..."}}

Judge the balance of the retrieved evidence, not which side sounds persuasive.
Use "mixed" when the evidence supports material points on both sides.
Use "unclear" when the evidence is too incomplete to distinguish them.
"""


def _generate(client: LLMClient, prompt: str) -> str:
    return client.generate(prompt, max_tokens=700, temperature=0.0, max_retries=1)


def run_debate(
    question: str,
    evidence: list[dict[str, Any]],
    client: LLMClient,
    *,
    judge_count: int = 3,
) -> DebateResult:
    """Generate two bounded advocate cases and a parallel panel of judges."""
    if judge_count < 3:
        judge_count = 3
    bull = _generate(client, _advocate_prompt("Bull", question, evidence))
    bear = _generate(client, _advocate_prompt("Bear", question, evidence))

    judges: list[JudgeVerdict] = []
    with ThreadPoolExecutor(max_workers=judge_count) as pool:
        futures = {
            pool.submit(
                _generate,
                client,
                _judge_prompt(question, bull, bear, evidence, judge_id),
            ): judge_id
            for judge_id in range(1, judge_count + 1)
        }
        for future in as_completed(futures):
            judge_id = futures[future]
            try:
                judges.append(_parse_judge(future.result(), judge_id))
            except Exception as exc:
                judges.append(JudgeVerdict(judge=judge_id, verdict="unclear", rationale=f"{type(exc).__name__}: {exc}"))
    judges.sort(key=lambda item: item.judge)

    counts: dict[str, int] = {}
    for verdict in judges:
        counts[verdict.verdict] = counts.get(verdict.verdict, 0) + 1
    majority, votes = max(counts.items(), key=lambda pair: (pair[1], pair[0])) if counts else ("unclear", 0)
    agreement = votes / len(judges) if judges else 0.0
    return DebateResult(
        bull_case=bull[:4000],
        bear_case=bear[:4000],
        judges=judges,
        majority=majority,
        agreement=agreement,
        disagreement=agreement < 2 / 3,
        note="Three independent judges assess the evidence balance; this is research context, not a trading recommendation.",
    )


__all__ = ["DebateResult", "JudgeVerdict", "run_debate"]
