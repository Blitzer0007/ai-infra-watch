"""Bounded source-quality role over loaded metadata only; no model, network or persistence.

This is an inspection workflow, not an investment eligibility oracle. Provider and
source-mode labels are caller declarations, not independently verified identities.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Context, Decimal, localcontext
from itertools import combinations
import json
import math
import time
from typing import Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

VERSION = "source-quality-v1"
MAX_INPUT_BYTES = 65536
INSPECT = "source_quality.inspect_quote"
COMPARE = "source_quality.compare_quotes"
ALLOWED_TOOLS = (INSPECT, COMPARE)
FindingCode = Literal[
    "PRICE_UNAVAILABLE", "DAILY_MOVE_UNAVAILABLE", "SIMULATED_OR_UNKNOWN_SOURCE_MODE", "PROVIDER_UNKNOWN",
    "RETURNED_SYMBOL_UNKNOWN", "RETURNED_SYMBOL_MISMATCH", "CURRENCY_UNKNOWN", "UNSUPPORTED_CURRENCY",
    "ADJUSTMENT_BASIS_UNKNOWN", "SESSION_UNKNOWN", "STALE_SOURCE_HINT", "DATE_ONLY_TIME",
    "OBSERVATION_TIME_UNKNOWN", "FUTURE_OBSERVATION", "OBSERVATION_EXCEEDS_AGE_POLICY",
    "RETRIEVAL_TIME_UNKNOWN", "FUTURE_RETRIEVAL", "OBSERVATION_AFTER_RETRIEVAL", "NO_OBSERVATION",
    "NO_DISTINCT_PROVIDER_COMPARISON", "CURRENCY_MISMATCH", "BASIS_MISMATCH", "SESSION_MISMATCH",
    "UNALIGNED_OBSERVATIONS", "NUMERIC_RANGE_UNSUPPORTED", "PRICE_DISCREPANCY",
]


def _instant(value: str) -> datetime:
    if "T" not in value:
        raise ValueError("Explicit time and timezone required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Explicit timezone required")
    return parsed.astimezone(timezone.utc)


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class QuoteEvidence(Contract):
    evidence_id: str = Field(pattern=r"^[A-Za-z0-9_.:-]{1,80}$")
    symbol: str = Field(pattern=r"^[A-Z0-9.^=-]{1,20}$")
    returned_symbol: str | None = Field(default=None, pattern=r"^[A-Z0-9.^=-]{1,20}$")
    provider: Literal["yahoo", "finnhub", "alpha-vantage", "fixture", "unknown"]
    source_mode: Literal["live", "simulated", "unknown"]
    price: float | None = Field(default=None, allow_inf_nan=False)
    change_pct: float | None = Field(default=None, allow_inf_nan=False)
    currency: str | None = Field(default=None, pattern=r"^[A-Za-z]{3}$")
    market_time: str | None = Field(default=None, max_length=40)
    market_date: str | None = Field(default=None, max_length=10)
    time_precision: Literal["instant", "date-only", "unknown"] = "unknown"
    retrieved_at: str | None = Field(default=None, max_length=40)
    adjusted_basis: Literal["raw", "split_adjusted", "total_return", "unknown"] = "unknown"
    is_market_session_open: bool | None = None
    stale: bool = False

    @field_validator("market_time", "retrieved_at")
    @classmethod
    def instant(cls, value: str | None) -> str | None:
        return _instant(value).isoformat().replace("+00:00", "Z") if value is not None else None

    @field_validator("market_date")
    @classmethod
    def calendar_date(cls, value: str | None) -> str | None:
        if value is not None and date.fromisoformat(value).isoformat() != value:
            raise ValueError("Calendar date required")
        return value

    @model_validator(mode="after")
    def precision(self):
        if (self.market_time is not None) != (self.time_precision == "instant"):
            raise ValueError("Inconsistent instant precision")
        if self.time_precision == "date-only" and self.market_date is None:
            raise ValueError("Date-only precision requires a market date")
        if self.market_date is not None and self.time_precision != "date-only":
            raise ValueError("Market date belongs to date-only evidence in this contract")
        return self


class QualityPolicy(Contract):
    max_quote_age_seconds: int = Field(default=900, ge=1, le=86400)
    max_time_difference_seconds: int = Field(default=60, ge=0, le=3600)
    discrepancy_pct: float = Field(default=2.0, ge=0, le=100, allow_inf_nan=False)
    expected_currency: str | None = Field(default=None, pattern=r"^[A-Za-z]{3}$")
    max_tool_calls: int = Field(default=20, ge=1, le=20)
    time_budget_ms: int = Field(default=1000, ge=1, le=2000)


class QualityRequest(Contract):
    run_id: str = Field(pattern=r"^[A-Za-z0-9_.:-]{1,80}$")
    assessed_at: str = Field(max_length=40)
    symbols: tuple[str, ...] = Field(min_length=1, max_length=5, strict=False)
    observations: tuple[QuoteEvidence, ...] = Field(default=(), max_length=15, strict=False)
    policy: QualityPolicy = Field(default_factory=QualityPolicy)

    @field_validator("assessed_at")
    @classmethod
    def assessment_instant(cls, value: str) -> str:
        return _instant(value).isoformat().replace("+00:00", "Z")

    @model_validator(mode="after")
    def universe(self):
        import re
        if len(set(self.symbols)) != len(self.symbols) or any(
            re.fullmatch(r"[A-Z0-9.^=-]{1,20}", symbol) is None for symbol in self.symbols
        ):
            raise ValueError("Unique bounded symbols required")
        ids = [row.evidence_id for row in self.observations]
        if len(ids) != len(set(ids)):
            raise ValueError("Unique evidence ids required")
        if any(row.symbol not in self.symbols for row in self.observations):
            raise ValueError("Observation outside requested universe")
        if any(sum(row.symbol == symbol for row in self.observations) > 3 for symbol in self.symbols):
            raise ValueError("At most three observations per symbol")
        return self


class Finding(Contract):
    code: FindingCode
    severity: Literal["blocker", "attention"]
    evidence_ids: tuple[str, ...] = ()


class PairComparison(Contract):
    evidence_ids: tuple[str, str]
    discrepancy_pct: float = Field(ge=0, allow_inf_nan=False)
    exceeds_threshold: bool


class SymbolInspection(Contract):
    symbol: str
    status: Literal["metadata-covered", "needs-data", "review"]
    observed_count: int
    comparable_evidence_ids: tuple[str, ...] = ()
    findings: tuple[Finding, ...] = ()
    comparisons: tuple[PairComparison, ...] = ()
    comparison_status: Literal["not-assessed", "no-comparable-pairs", "compared"] = "not-assessed"


class ToolTrace(Contract):
    tool: str
    symbol: str
    status: Literal["ok", "denied", "budget", "error"]


class QualityResult(Contract):
    contract_version: Literal["source-quality-v1"] = VERSION
    run_id: str | None = None
    assessed_at: str | None = None
    policy: QualityPolicy | None = None
    status: Literal["complete", "partial", "needs-data", "failed"]
    inspection_complete: bool = False
    termination_reason: Literal["completed", "call-budget", "time-budget", "invalid-request", "tool-denied", "tool-error"]
    expected_symbols: tuple[str, ...] = ()
    inspected_symbols: tuple[str, ...] = ()
    uninspected_symbols: tuple[str, ...] = ()
    pending_comparison_symbols: tuple[str, ...] = ()
    inspections: tuple[SymbolInspection, ...] = ()
    trace: tuple[ToolTrace, ...] = ()
    tool_attempts: int = 0
    tool_calls: int = 0
    provided_observation_count: int = 0
    inspected_observation_count: int = 0
    metadata_covered_observation_count: int = 0
    provider_requests: Literal[0] = 0
    model_calls: Literal[0] = 0
    jev_calls: Literal[0] = 0
    grants_decision_eligibility: Literal[False] = False
    verifies_provider_identity: Literal[False] = False


def _finding(code: str, rows: tuple[QuoteEvidence, ...] = (), severity="blocker") -> Finding:
    return Finding(code=code, severity=severity, evidence_ids=tuple(row.evidence_id for row in rows))


def _issues(row: QuoteEvidence, request: QualityRequest) -> tuple[Finding, ...]:
    issues = []
    def flag(code, severity="blocker"):
        issues.append(_finding(code, (row,), severity))
    policy, now = request.policy, _instant(request.assessed_at)
    if row.price is None or row.price <= 0:
        flag("PRICE_UNAVAILABLE")
    if row.change_pct is None:
        flag("DAILY_MOVE_UNAVAILABLE")
    if row.source_mode != "live" or row.provider == "fixture":
        flag("SIMULATED_OR_UNKNOWN_SOURCE_MODE")
    if row.provider == "unknown":
        flag("PROVIDER_UNKNOWN")
    if row.returned_symbol is None:
        flag("RETURNED_SYMBOL_UNKNOWN")
    elif row.returned_symbol != row.symbol:
        flag("RETURNED_SYMBOL_MISMATCH")
    if row.currency is None:
        flag("CURRENCY_UNKNOWN")
    elif policy.expected_currency and row.currency != policy.expected_currency:
        flag("UNSUPPORTED_CURRENCY")
    if row.adjusted_basis == "unknown":
        flag("ADJUSTMENT_BASIS_UNKNOWN")
    if row.is_market_session_open is None:
        flag("SESSION_UNKNOWN")
    if row.stale:
        flag("STALE_SOURCE_HINT")
    if row.market_time is None:
        flag("DATE_ONLY_TIME" if row.time_precision == "date-only" else "OBSERVATION_TIME_UNKNOWN")
    else:
        age = (now - _instant(row.market_time)).total_seconds()
        if age < -120:
            flag("FUTURE_OBSERVATION")
        elif age > policy.max_quote_age_seconds:
            flag("OBSERVATION_EXCEEDS_AGE_POLICY")
    if row.retrieved_at is None:
        flag("RETRIEVAL_TIME_UNKNOWN", "attention")
    else:
        retrieval = _instant(row.retrieved_at)
        if (retrieval - now).total_seconds() > 120:
            flag("FUTURE_RETRIEVAL")
        if row.market_time and (_instant(row.market_time) - retrieval).total_seconds() > 120:
            flag("OBSERVATION_AFTER_RETRIEVAL")
    return tuple(issues)


def _inspect(symbol: str, request: QualityRequest) -> SymbolInspection:
    rows = tuple(row for row in request.observations if row.symbol == symbol)
    findings = tuple(issue for row in rows for issue in _issues(row, request))
    comparable = tuple(row.evidence_id for row in rows if not any(
        issue.severity == "blocker" for issue in _issues(row, request)
    ))
    if not rows:
        findings = (_finding("NO_OBSERVATION"),)
    if len({row.provider for row in rows}) < 2:
        findings += (_finding("NO_DISTINCT_PROVIDER_COMPARISON", rows, "attention"),)
    covered = bool(comparable) and not any(issue.severity == "blocker" for issue in findings)
    return SymbolInspection(symbol=symbol, status="metadata-covered" if covered else "needs-data",
                            observed_count=len(rows), comparable_evidence_ids=comparable, findings=findings)


def _compare(inspection: SymbolInspection, request: QualityRequest) -> SymbolInspection:
    rows = tuple(row for row in request.observations if row.evidence_id in inspection.comparable_evidence_ids)
    findings, pairs = list(inspection.findings), []
    for a, b in combinations(rows, 2):
        if a.provider == b.provider:
            continue
        code = None
        if a.currency != b.currency:
            code = "CURRENCY_MISMATCH"
        elif a.adjusted_basis != b.adjusted_basis:
            code = "BASIS_MISMATCH"
        elif a.is_market_session_open != b.is_market_session_open:
            code = "SESSION_MISMATCH"
        elif abs((_instant(a.market_time) - _instant(b.market_time)).total_seconds()) > request.policy.max_time_difference_seconds:
            code = "UNALIGNED_OBSERVATIONS"
        if code:
            findings.append(_finding(code, (a, b)))
            continue
        # Decimal input representations avoid classifying exactly 2% as >2%
        # due to binary rounding. The denominator matches the existing JS helper.
        lo, hi = sorted((Decimal(str(a.price)), Decimal(str(b.price))))
        with localcontext(Context(prec=50)):
            discrepancy = (hi / lo - 1) * 100
        pct = float(discrepancy)
        if not math.isfinite(pct):
            findings.append(_finding("NUMERIC_RANGE_UNSUPPORTED", (a, b)))
            continue
        exceeds = discrepancy > Decimal(str(request.policy.discrepancy_pct))
        pairs.append(PairComparison(evidence_ids=(a.evidence_id, b.evidence_id), discrepancy_pct=pct, exceeds_threshold=exceeds))
        if exceeds:
            findings.append(_finding("PRICE_DISCREPANCY", (a, b)))
    status = "review" if any(pair.exceeds_threshold for pair in pairs) else (
        "needs-data" if any(f.severity == "blocker" for f in findings) else "metadata-covered"
    )
    return inspection.model_copy(update={"status": status, "findings": tuple(findings), "comparisons": tuple(pairs),
                                         "comparison_status": "compared" if pairs else "no-comparable-pairs"})


class ToolBoundaryError(RuntimeError):
    """Fixed reason only: no input values, URLs or upstream exceptions."""


class ScopedSnapshotTools:
    """Two trusted local tools. Discovery cannot widen the role's authority.

    Time limits are cooperative around bounded in-process calculations, not
    cancellation of an arbitrary remote tool. There is no remote delegate.
    """
    def __init__(self, request: QualityRequest, clock: Callable[[], float] = time.monotonic):
        self.request, self.clock = request, clock
        self.started = clock()
        self.attempts = self.calls = 0
        self.trace: list[ToolTrace] = []
        self.inspections: dict[str, SymbolInspection] = {}

    def tools(self) -> tuple[str, ...]:
        return ALLOWED_TOOLS

    def _time_check(self):
        elapsed = self.clock() - self.started
        if not math.isfinite(elapsed) or elapsed < 0 or elapsed * 1000 > self.request.policy.time_budget_ms:
            raise ToolBoundaryError("time-budget")

    def call(self, name: str, arguments: dict) -> SymbolInspection:
        self.attempts += 1
        symbol = arguments.get("symbol") if isinstance(arguments, dict) else None
        allowed = name in ALLOWED_TOOLS and isinstance(arguments, dict) and set(arguments) == {"symbol"} and symbol in self.request.symbols
        if not allowed:
            self.trace.append(ToolTrace(tool="denied", symbol="", status="denied"))
            raise ToolBoundaryError("tool-denied")
        try:
            self._time_check()
            if self.calls >= self.request.policy.max_tool_calls:
                raise ToolBoundaryError("call-budget")
            if name == COMPARE and symbol not in self.inspections:
                raise ToolBoundaryError("tool-denied")
            self.calls += 1
            value = _inspect(symbol, self.request) if name == INSPECT else _compare(self.inspections[symbol], self.request)
            self._time_check()
        except ToolBoundaryError as error:
            self.trace.append(ToolTrace(tool=name, symbol=symbol, status="budget" if str(error).endswith("budget") else "denied"))
            raise
        except Exception:
            self.trace.append(ToolTrace(tool=name, symbol=symbol, status="error"))
            raise ToolBoundaryError("tool-error") from None
        self.trace.append(ToolTrace(tool=name, symbol=symbol, status="ok"))
        self.inspections[symbol] = value
        return value


class SourceQualityAgent:
    """Select inspection/comparison steps from findings with no LLM or extra IO."""
    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self.clock = clock

    def run(self, request: QualityRequest) -> QualityResult:
        if not isinstance(request, QualityRequest):
            return QualityResult(status="failed", termination_reason="invalid-request")
        tools = ScopedSnapshotTools(request, self.clock)
        inspections = {}
        pending = []
        reason = "completed"
        try:
            for symbol in request.symbols:
                view = tools.call(INSPECT, {"symbol": symbol})
                inspections[symbol] = view
                providers = {row.provider for row in request.observations if row.evidence_id in view.comparable_evidence_ids}
                if len(providers) >= 2:
                    pending.append(symbol)
                    inspections[symbol] = tools.call(COMPARE, {"symbol": symbol})
                    pending.remove(symbol)
        except ToolBoundaryError as error:
            reason = str(error)
        complete = reason == "completed"
        covered = sum(view.status == "metadata-covered" for view in inspections.values())
        status = "complete" if complete and covered == len(request.symbols) else (
            "partial" if inspections and (not complete or covered > 0) else "needs-data"
        )
        if reason in {"tool-denied", "tool-error"}:
            status = "failed"
        return QualityResult(run_id=request.run_id, assessed_at=request.assessed_at, policy=request.policy, status=status,
                             inspection_complete=complete, termination_reason=reason, expected_symbols=request.symbols,
                             inspected_symbols=tuple(inspections), uninspected_symbols=tuple(s for s in request.symbols if s not in inspections),
                             pending_comparison_symbols=tuple(pending), inspections=tuple(inspections.values()),
                             trace=tuple(tools.trace), tool_attempts=tools.attempts, tool_calls=tools.calls,
                             provided_observation_count=len(request.observations),
                             inspected_observation_count=sum(view.observed_count for view in inspections.values()),
                             metadata_covered_observation_count=sum(len(view.comparable_evidence_ids) for view in inspections.values()))

    def run_json(self, raw: bytes) -> QualityResult:
        def reject_constant(_):
            raise ValueError("Non-finite input")

        def unique_keys(pairs):
            value = {}
            for key, item in pairs:
                if key in value:
                    raise ValueError("Duplicate key")
                value[key] = item
            return value
        try:
            if not isinstance(raw, bytes) or len(raw) > MAX_INPUT_BYTES:
                raise ValueError("Input bound")
            payload = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_keys, parse_constant=reject_constant)
            request = QualityRequest.model_validate(payload)
        except (ValueError, TypeError, ValidationError, RecursionError):
            return QualityResult(status="failed", termination_reason="invalid-request")
        return self.run(request)
