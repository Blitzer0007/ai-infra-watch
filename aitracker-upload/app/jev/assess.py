"""Reusable, auditable Jev assessments for AI Infra Watch platform modules."""

from __future__ import annotations

import json
from typing import Any

from .client import JevClient, JevEvaluation


ASSESSMENTS: dict[str, dict[str, dict[str, Any]]] = {
    "research": {
        "sufficiency": {
            "type": "choice",
            "instructions": "Is the retrieved evidence sufficient to support a near-term research answer, or is another independent evidence source needed?",
            "criteria": {
                "stop": "At least two useful evidence signals are consistent, specific to the question and sufficient for a bounded answer.",
                "gather_more": "Evidence is sparse, mostly single-source, stale, generic or missing an important channel; retrieve another independent source.",
                "resolve_conflict": "Retrieved sources materially conflict or leave an important discrepancy that needs verification before finalization.",
            },
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the retrieved evidence for answering the research question now?",
            "criteria": ["Sparse", "Partial", "Usable", "Strong"],
        },
    },
    "portfolio": {
        "attention": {
            "type": "choice",
            "instructions": "Which aspect of the current portfolio state deserves the most immediate research attention?",
            "criteria": {
                "concentration": "Exposure concentration or a dominant holding is the clearest portfolio-level issue to inspect.",
                "recovery_watch": "One or more holdings are below cost and declining while supporting group/peer evidence warrants closer review.",
                "macro": "Macro, geopolitical, power or export exposure is the clearest active portfolio issue.",
                "catalyst": "A filing, contract, earnings, policy or other catalyst is the clearest active issue.",
                "market": "Current price, breadth, stress or benchmark-relative movement is the clearest active issue.",
                "mixed": "Several evidence channels are active and should be reviewed together.",
                "monitor": "No single portfolio issue stands out from the available evidence."
            }
        },
        "context": {
            "type": "choice",
            "instructions": "How should the current portfolio context be characterized from the supplied measurements and evidence?",
            "criteria": {
                "supportive": "Observed portfolio and evidence signals are broadly supportive, with no material unresolved conflict.",
                "mixed": "Supportive and adverse signals coexist, so the position context remains mixed.",
                "adverse": "Observed portfolio measurements and evidence contain multiple adverse signals.",
                "insufficient": "The available data is too incomplete or stale for a reliable context characterization."
            }
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the evidence available for reviewing the current portfolio state?",
            "criteria": ["Sparse", "Partial", "Usable", "Strong"]
        }
    },
    "platform": {
        "attention": {
            "type": "choice",
            "instructions": "Which aspect of this portfolio state deserves the most immediate research attention?",
            "criteria": {
                "earnings": "Earnings timing, estimates, results or reactions are the clearest active issue.",
                "sec": "A primary SEC filing, contract or disclosure is the clearest active issue.",
                "macro": "A geopolitical, power or export risk is the clearest active issue.",
                "market": "A price, breadth or relative-strength change is the clearest active issue.",
                "mixed": "Several evidence channels are active and should be reviewed together.",
                "monitor": "No single issue stands out from the available evidence.",
            },
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the evidence needed to support a near-term research conclusion?",
            "criteria": ["Sparse", "Partial", "Usable", "Strong"],
        },
    },
    "contracts": {
        "materiality": {
            "type": "choice",
            "instructions": "How should this contract set be triaged for research attention?",
            "criteria": {
                "material": "Disclosed value, counterparty, capacity or commercial terms indicate a potentially material infrastructure development.",
                "commercial": "The disclosure contains meaningful commercial terms but materiality is not fully established.",
                "routine": "The available evidence looks routine, repetitive or limited in economic detail.",
                "unclear": "The evidence is insufficient to classify the contract set confidently.",
            },
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the available contract evidence for understanding economic significance?",
            "criteria": ["Minimal", "Partial", "Good", "Strong"],
        },
    },
    "events": {
        "follow_up": {
            "type": "choice",
            "instructions": "What historical-reaction follow-up is appropriate for this event-study state?",
            "criteria": {
                "deep_dive": "Multiple verified events and usable price reactions justify deeper event-pattern analysis.",
                "standard": "There is enough evidence for standard event-study review.",
                "insufficient": "Events exist but price history or reaction fields are too incomplete for a useful reaction conclusion.",
                "monitor": "The current event set does not expose a clear historical pattern worth extending.",
            },
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the event-study evidence for evaluating historical reactions?",
            "criteria": ["Sparse", "Partial", "Usable", "Strong"],
        },
    },
    "macro": {
        "attention": {
            "type": "choice",
            "instructions": "Which macro channel deserves the most immediate review given the current risk ledger?",
            "criteria": {
                "taiwan": "TSMC or Taiwan supply-chain disruption is the clearest active exposure.",
                "power": "Power or grid constraints are the clearest active exposure.",
                "export": "AI-chip export controls or embargo breadth are the clearest active exposure.",
                "mixed": "Multiple macro channels are materially active and should be reviewed together.",
                "monitor": "No single macro channel stands out from the current ledger.",
            },
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the current macro evidence for portfolio transmission analysis?",
            "criteria": ["Sparse", "Partial", "Usable", "Strong"],
        },
    },
    "congress": {
        "relevance": {
            "type": "choice",
            "instructions": "How should the current congressional disclosure set be triaged?",
            "criteria": {
                "research": "The disclosures provide a clear reason to inspect company-specific context and timing.",
                "context": "The disclosures are useful as context but do not independently establish a company event.",
                "low_signal": "The current disclosure set appears low-signal for the selected research question.",
                "unclear": "Available disclosure data is insufficient for confident triage.",
            },
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the available congressional transaction evidence?",
            "criteria": ["Sparse", "Partial", "Usable", "Strong"],
        },
    },
    "earnings": {
        "urgency": {
            "type": "choice",
            "instructions": "How should this earnings state be triaged for attention?",
            "criteria": {
                "immediate": "An earnings event is imminent or newly reported and deserves immediate review.",
                "near_term": "An earnings event is approaching but does not require immediate escalation.",
                "historical": "The state is primarily historical earnings evidence for pattern analysis.",
                "monitor": "No clear earnings issue requires additional attention now.",
            },
        },
        "evidence_quality": {
            "type": "score",
            "instructions": "How complete is the earnings evidence for the current research question?",
            "criteria": ["Sparse", "Partial", "Usable", "Strong"],
        },
    },
}


def _compact_state(state: Any, max_chars: int = 8000) -> str:
    if isinstance(state, str):
        text = state
    else:
        text = json.dumps(state, ensure_ascii=False, separators=(",", ":"), default=str)
    return text[:max_chars]


def measured_evidence_quality(state: Any) -> dict[str, Any] | None:
    """Compute evidence quality from retrieved evidence metadata, not model judgment.

    Independent usable families establish the base level. Stale evidence,
    missing requirements, conflicts and poor citation coverage can only reduce it.
    """
    if not isinstance(state, dict):
        return None

    availability = state.get("evidence_availability")
    if not isinstance(availability, dict):
        return None

    usable_families = availability.get("usable_families") or []
    usable_count = len(usable_families)
    if usable_count <= 0:
        score = 0.0
    elif usable_count == 1:
        score = 1.0
    elif usable_count == 2:
        score = 2.0
    else:
        score = 3.0

    freshness_records = state.get("evidence_freshness") or []
    statuses: list[str] = []
    for record in freshness_records:
        if not isinstance(record, dict):
            continue
        freshness = record.get("freshness")
        if isinstance(freshness, dict):
            status = str(freshness.get("status") or "").upper()
            if status:
                statuses.append(status)

    fresh_count = statuses.count("FRESH")
    aging_count = statuses.count("AGING")
    stale_count = statuses.count("STALE")
    known_count = fresh_count + aging_count + stale_count

    if known_count and stale_count == known_count:
        score = min(score, 1.0)
    elif known_count and fresh_count == 0 and aging_count == known_count:
        score = min(score, 2.0)

    missing_required = availability.get("missing") or []
    if missing_required:
        score = min(score, 1.5)

    conflicts = state.get("conflict_detection") or {}
    conflict_count = int(conflicts.get("count") or 0) if isinstance(conflicts, dict) else 0
    if conflict_count:
        score = min(score, 1.0)

    citation = state.get("citation_coverage") or {}
    citation_ratio = citation.get("coverage") if isinstance(citation, dict) else None
    if isinstance(citation_ratio, (int, float)) and citation_ratio < 0.5:
        score = max(0.0, score - 0.5)

    score = round(max(0.0, min(3.0, score)), 2)
    return {
        "score": score,
        "percent": round(score / 3.0 * 100.0),
        "label": (
            "Minimal" if score < 0.75
            else "Partial" if score < 1.5
            else "Usable" if score < 2.25
            else "Strong"
        ),
        "usable_family_count": usable_count,
        "usable_families": list(usable_families),
        "fresh_count": fresh_count,
        "aging_count": aging_count,
        "stale_count": stale_count,
        "missing_required": list(missing_required),
        "conflict_count": conflict_count,
        "citation_coverage": citation_ratio,
        "source": "deterministic_evidence_measurement",
    }



def assess(kind: str, state: Any, client: JevClient | None = None) -> JevEvaluation:
    key = kind.strip().lower()
    questions = ASSESSMENTS.get(key)
    if questions is None:
        return JevEvaluation(error=f"Unknown Jev assessment kind: {key!r}")
    evaluation = (client or JevClient()).evaluate(
        state=_compact_state(state),
        questions=questions,
    )
    measured = measured_evidence_quality(state)
    if evaluation.usable:
        for answer in evaluation.answers.values():
            if answer.confidence is None:
                continue
            # JEV confidence is a probability-like value. Keep the API contract
            # bounded even if an upstream response returns an invalid number.
            answer.confidence = max(0.0, min(1.0, float(answer.confidence)))

    if measured and evaluation.usable:
        evidence_cap = max(0.0, min(1.0, measured["score"] / 3.0))
        for answer in evaluation.answers.values():
            if answer.confidence is not None:
                answer.confidence = min(answer.confidence, evidence_cap)
        answer = evaluation.answers.get("evidence_quality")
        if answer is not None:
            # Evidence quality is a measured property of retrieved evidence.
            # Jev can assess routing/context, but must not override the
            # deterministic evidence measurement.
            answer.score = measured["score"]
            answer.legend = {
                "0": "Minimal",
                "1": "Partial",
                "2": "Usable",
                "3": "Strong",
            }
            if answer.confidence is not None:
                answer.confidence = min(
                    answer.confidence,
                    max(0.0, min(1.0, measured["score"] / 3.0)),
                )
    return evaluation


__all__ = ["ASSESSMENTS", "assess", "measured_evidence_quality"]
