"""Versioned, conditional research admission. Loaded declarations only; no I/O or authority."""
from __future__ import annotations
from datetime import datetime, date, timedelta, timezone
import hashlib
import json
import math
import re
from app.agents.portfolio_council import decode, parse_packet, instant, FAMILIES, Evidence

VERSION = "council-admission-v1"
RULE = "family-provenance-v1"
SEC_ISSUES = {"ISSUER_MISMATCH", "INVALID_SOURCE", "SOURCE_LIMIT", "INVALID_FACT", "AMBIGUOUS_FACT", "MISSING_INPUT", "PERIOD_ALIGNMENT", "NONPOSITIVE_DENOMINATOR", "INVALID_CAPEX", "NONFINITE_RESULT", "DATE_ONLY_PUBLICATION"}
REVENUE = ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet")
TAGS = (*REVENUE, "OperatingIncomeLoss", "NetCashProvidedByUsedInOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment", "Liabilities", "StockholdersEquity")
METHODS = ("revenue-growth-yoy", "operating-margin", "operating-cash-flow-less-capex", "liabilities-to-equity")
DAY_US = 86400000000


def exact(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Invalid declared day")
    return date.fromisoformat(value)


def number(value):
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def validate_sec(receipt, packet):
    if receipt is None:
        return {}
    if not exact(receipt, ("contract_version", "symbol", "cik", "retrieved_at", "status", "observations", "issues", "source_authenticity_verified")) or receipt["contract_version"] != "council-sec-v1" or receipt["symbol"] != packet.symbol or not isinstance(receipt["cik"], str) or not re.fullmatch(r"\d{10}", receipt["cik"]) or int(receipt["cik"]) <= 0 or receipt["source_authenticity_verified"] is not False or receipt["status"] not in ("partial", "unavailable"):
        raise ValueError("Invalid SEC receipt")
    retrieved = instant(receipt["retrieved_at"])
    if not isinstance(receipt["issues"], list) or len(receipt["issues"]) > 12 or any(not isinstance(code, str) or code not in SEC_ISSUES for code in receipt["issues"]):
        raise ValueError("Invalid receipt issues")
    observations = receipt["observations"]
    if not isinstance(observations, list) or len(observations) > 4 or (receipt["status"] == "unavailable" and observations):
        raise ValueError("Invalid receipt observations")
    if any(code in ("ISSUER_MISMATCH", "INVALID_SOURCE", "SOURCE_LIMIT") for code in receipt["issues"]) and (receipt["status"] != "unavailable" or observations):
        raise ValueError("Fatal source issues cannot carry usable facts")
    by_id = {e.evidence_id: e.model_dump(mode="json") for e in packet.evidence}
    result, facts_seen, filings_seen = {}, {}, {}
    for o in observations:
        if not exact(o, ("method", "inputs", "evidence")) or o["method"] not in METHODS or not isinstance(o["inputs"], list) or len(o["inputs"]) != 2:
            raise ValueError("Invalid calculation")
        e = o["evidence"]
        Evidence.model_validate_json(json.dumps(e, allow_nan=False))
        if not isinstance(e, dict) or not isinstance(e.get("evidence_id"), str) or e["evidence_id"] in result or by_id.get(e["evidence_id"]) != e or e["source_id"] != "sec-edgar-companyfacts" or e["basis"] != "unknown" or e["simulated"] is not False or e["observed_at"] is not None or e["published_at"] is not None or e["retrieved_at"] != receipt["retrieved_at"]:
            raise ValueError("Unbound calculation")
        for f in o["inputs"]:
            if not exact(f, ("tag", "accession", "form", "period_start", "period_end", "filed_on", "value", "unit")) or f["tag"] not in TAGS or f["form"] not in ("10-K", "10-K/A") or f["unit"] != "USD" or not number(f["value"]) or not isinstance(f["accession"], str) or not re.fullmatch(r"\d{10}-\d{2}-\d{6}", f["accession"]):
                raise ValueError("Invalid original fact")
            end, filed = day(f["period_end"]), day(f["filed_on"])
            if end > filed or filed > retrieved.date() or (f["period_start"] is not None and not 300 <= (end - day(f["period_start"])).days <= 400):
                raise ValueError("Invalid fact chronology")
            filing = (f["form"], f["filed_on"])
            if f["accession"] in filings_seen and filings_seen[f["accession"]] != filing:
                raise ValueError("Conflicting filing metadata")
            filings_seen[f["accession"]] = filing
            identity = tuple(f[k] for k in ("tag", "accession", "period_start", "period_end", "unit"))
            if identity in facts_seen and facts_seen[identity] != f["value"]:
                raise ValueError("Conflicting original fact references")
            facts_seen[identity] = f["value"]
        a, b = o["inputs"]
        same = all(a[k] == b[k] for k in ("period_start", "period_end", "accession", "filed_on"))
        if o["method"] == "revenue-growth-yoy":
            if a["tag"] not in REVENUE or a["tag"] != b["tag"] or a["accession"] != b["accession"] or a["filed_on"] != b["filed_on"] or a["period_start"] is None or b["period_start"] is None or a["value"] < 0 or b["value"] <= 0 or (day(a["period_start"]) - day(b["period_end"])).days != 1 or abs((day(a["period_end"]) - day(a["period_start"])).days - (day(b["period_end"]) - day(b["period_start"])).days) > 14:
                raise ValueError("Invalid growth inputs")
            metric, value = "revenue_growth_pct", (a["value"] - b["value"]) / b["value"] * 100
        elif o["method"] == "operating-margin":
            if not same or a["period_start"] is None or a["tag"] != "OperatingIncomeLoss" or b["tag"] not in REVENUE or b["value"] <= 0:
                raise ValueError("Invalid margin inputs")
            metric, value = "operating_margin_pct", a["value"] / b["value"] * 100
        elif o["method"] == "operating-cash-flow-less-capex":
            if not same or a["period_start"] is None or a["tag"] != "NetCashProvidedByUsedInOperatingActivities" or b["tag"] != "PaymentsToAcquirePropertyPlantAndEquipment" or b["value"] < 0:
                raise ValueError("Invalid cash-flow inputs")
            metric, value = "free_cash_flow_usd", a["value"] - b["value"]
        else:
            if not same or a["period_start"] is not None or a["tag"] != "Liabilities" or b["tag"] != "StockholdersEquity" or a["value"] < 0 or b["value"] <= 0:
                raise ValueError("Invalid balance inputs")
            metric, value = "liabilities_equity", a["value"] / b["value"]
        if not number(value) or e["metric"] != metric or e["evidence_id"] != "sec:" + metric or e["value"] != value or e["period_start"] != a["period_start"] or e["period_end"] != a["period_end"]:
            raise ValueError("Calculation does not match original inputs")
        result[e["evidence_id"]] = o
    return result


def parse_request(raw):
    value = decode(raw)
    if not exact(value, ("mode", "packet", "sources")) or value["mode"] not in ("admission-v2", "loaded-v2") or not exact(value["sources"], ("sec", "catalyst")):
        raise ValueError("Invalid admission request")
    packet = parse_packet(json.dumps(value["packet"], allow_nan=False).encode())
    sec = validate_sec(value["sources"]["sec"], packet)
    catalyst = value["sources"]["catalyst"]
    if catalyst is not None:
        if not exact(catalyst, ("evidence_id", "event_at", "confirmation", "confirmation_basis", "published_at", "retrieved_at")) or catalyst["evidence_id"] != "calendar:event-days" or catalyst["confirmation"] not in ("confirmed", "estimated", "cancelled") or catalyst["confirmation_basis"] not in ("issuer", "regulator", None):
            raise ValueError("Invalid event receipt")
        instant(catalyst["event_at"])
        for k in ("published_at", "retrieved_at"):
            if catalyst[k] is not None:
                instant(catalyst[k])
        row = next((e for e in packet.evidence if e.evidence_id == catalyst["evidence_id"]), None)
        elapsed = (instant(catalyst["event_at"]) - instant(packet.assessed_at)) // timedelta(microseconds=1)
        if abs(elapsed) > 9007199254740991:
            raise ValueError("Unsupported event interval")
        expected = elapsed / DAY_US
        if row is None or row.source_id != "loaded-calendar" or row.metric != "event_days_until" or row.value != expected or row.observed_at is not None or row.published_at != catalyst["published_at"] or row.retrieved_at != catalyst["retrieved_at"] or row.basis != ("estimate" if catalyst["confirmation"] == "estimated" else "unknown"):
            raise ValueError("Unbound event receipt")
    return packet, sec, catalyst


def publication_window(filed):
    d = day(filed)
    if not 2000 <= d.year <= 2099:
        return None
    base = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    # A conservative envelope over supported civil offsets, not a recovered timezone/instant.
    return {"earliest": (base - timedelta(hours=14)).isoformat(), "latest_exclusive": (base + timedelta(days=1, hours=12)).isoformat(), "precision": "date-only", "offset_policy": "utc-minus12-plus14"}


def evaluate(raw):
    packet, sec, catalyst = parse_request(raw)
    now = instant(packet.assessed_at)
    records = []
    quality = {"usable_ids": [], "issues": [], "missing_families": [], "conflicting_ids": []}
    for row in packet.evidence:
        reasons, window = [], None
        def deny(code):
            if code not in reasons:
                reasons.append(code)
        if row.simulated:
            deny("SIMULATED")
        if row.family == "market":
            kind = "quote"
            if row.source_id not in ("yahoo", "finnhub", "alpha-vantage"):
                deny("SOURCE_UNKNOWN")
            if row.basis != "reported":
                deny("BASIS_NOT_REPORTED")
            if row.period_start is not None or row.period_end is not None:
                deny("PERIOD_MISMATCH")
            if row.observed_at is None or row.retrieved_at is None:
                deny("TIME_MISSING")
            else:
                observed, retrieved = instant(row.observed_at), instant(row.retrieved_at)
                if not observed <= retrieved <= now or (row.published_at is not None and not observed <= instant(row.published_at) <= retrieved):
                    deny("TIME_ORDER_INVALID")
                if not 0 <= (now - observed).total_seconds() <= 900:
                    deny("SOURCE_STALE_OR_FUTURE")
        elif row.family in ("financial", "risk"):
            kind = "sec-duration" if row.family == "financial" else "sec-instant"
            proof = sec.get(row.evidence_id)
            if proof is None:
                deny("LINEAGE_MISSING")
            else:
                filed = proof["inputs"][0]["filed_on"]
                window = publication_window(filed)
                if window is None:
                    deny("PUBLICATION_PRECISION_UNSUPPORTED")
                else:
                    retrieved = instant(row.retrieved_at)
                    if retrieved > now:
                        deny("TIME_ORDER_INVALID")
                    if instant(window["latest_exclusive"]) > min(retrieved, now):
                        deny("PUBLICATION_WINDOW_UNCLOSED")
                    if not 0 <= (now - instant(window["earliest"])).total_seconds() <= 550 * 86400:
                        deny("SOURCE_STALE_OR_FUTURE")
                if not 0 <= (now.date() - day(row.period_end)).days <= 550:
                    deny("PERIOD_STALE_OR_FUTURE")
        else:
            kind = "catalyst-countdown"
            if catalyst is None or row.evidence_id != catalyst["evidence_id"]:
                deny("LINEAGE_MISSING")
            else:
                if catalyst["confirmation"] != "confirmed" or catalyst["confirmation_basis"] not in ("issuer", "regulator"):
                    deny("EVENT_UNCONFIRMED")
                if row.published_at is None or row.retrieved_at is None:
                    deny("TIME_MISSING")
                else:
                    published, retrieved = instant(row.published_at), instant(row.retrieved_at)
                    if not published <= retrieved <= now:
                        deny("TIME_ORDER_INVALID")
                    if not 0 <= (now - published).total_seconds() <= 30 * 86400:
                        deny("SOURCE_STALE_OR_FUTURE")
                if not 0 <= (instant(catalyst["event_at"]) - now).total_seconds() <= 366 * 86400:
                    deny("EVENT_OUTSIDE_WINDOW")
        records.append({"evidence_id": row.evidence_id, "kind": kind, "eligible": not reasons, "reason_codes": reasons, "publication_window": window})
        if not reasons:
            quality["usable_ids"].append(row.evidence_id)
        else:
            categories = {
                "SIMULATED": "SIMULATED_OR_UNKNOWN_SOURCE", "SOURCE_UNKNOWN": "SIMULATED_OR_UNKNOWN_SOURCE",
                "BASIS_NOT_REPORTED": "REPORTED_BASIS_MISSING", "LINEAGE_MISSING": "REPORTED_BASIS_MISSING", "EVENT_UNCONFIRMED": "REPORTED_BASIS_MISSING",
                "PERIOD_MISMATCH": "PERIOD_PROVENANCE_MISSING", "PERIOD_STALE_OR_FUTURE": "SOURCE_STALE_OR_FUTURE",
                "SOURCE_STALE_OR_FUTURE": "SOURCE_STALE_OR_FUTURE", "EVENT_OUTSIDE_WINDOW": "SOURCE_STALE_OR_FUTURE", "TIME_ORDER_INVALID": "TIME_ORDER_INVALID",
            }
            codes = list(dict.fromkeys(categories.get(reason, "TIME_PROVENANCE_MISSING") for reason in reasons))
            quality["issues"].append({"evidence_id": row.evidence_id, "codes": codes})
    groups = {}
    for row in packet.evidence:
        groups.setdefault((row.metric, row.period_start, row.period_end, row.observed_at), []).append(row)
    conflicts = sorted({r.evidence_id for rows in groups.values() if len({r.value for r in rows}) > 1 for r in rows})
    quality["conflicting_ids"] = conflicts
    quality["usable_ids"] = [i for i in quality["usable_ids"] if i not in conflicts]
    for record in records:
        if record["evidence_id"] in conflicts:
            record["eligible"] = False
            record["reason_codes"].append("CONFLICTING_EVIDENCE")
    quality["missing_families"] = [family for family in FAMILIES if not any(row.family == family and row.evidence_id in quality["usable_ids"] for row in packet.evidence)]
    return {"contract_version": VERSION, "rule_version": RULE, "run_id": packet.run_id, "request_sha256": hashlib.sha256(raw).hexdigest(), "status": "needs-data" if quality["missing_families"] or conflicts else "conditional", "records": records, "quality": quality, "source_authenticity_verified": False, "forecast_validity_established": False, "grants_decision_eligibility": False, "changes_allocation": False, "sends_messages": False}
