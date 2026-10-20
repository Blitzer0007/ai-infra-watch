"""Build an auditable S&P 500 membership candidate bundle from dated public sources.

This imports an open community-maintained source snapshot, archives exact upstream YAML
and official announcement responses, constructs effective-dated intervals, and flags
any row without source-backed entry/exit provenance as insufficient. It never marks the
entire historical universe as passed merely because the YAML parses.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import importlib.util
import json
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.historical_evidence.storage import BUCKET, ArchiveError, utc_now, upload_object, upsert_metadata

UPSTREAM_REPO = "https://github.com/shardul0701/SP500-Survivorship-bias-data-2004-2026"
OFFICIAL_HOSTS = {"press.spglobal.com", "spglobal.com", "bny.com"}
USER_AGENT = "AI-Infra-Watch-membership-evidence-audit/1.0"
MAX_SOURCE_BYTES = 5 * 1024 * 1024


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def iso_midnight(day: str) -> str:
    return datetime.combine(date.fromisoformat(day), time.min, timezone.utc).isoformat().replace("+00:00", "Z")


def is_official_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    return parsed.scheme == "https" and any(host == item or host.endswith("." + item) for item in OFFICIAL_HOSTS)


def publication_date_from_page(url: str, html: bytes, expected_date: str | None) -> str | None:
    """Verify an announcement date from page metadata or the official press URL's date slug."""
    text = html.decode("utf-8", errors="replace")
    metadata_dates: list[str] = []
    for tag_match in re.finditer(r"(?is)<meta\b[^>]*>", text):
        tag = tag_match.group(0)
        attrs = {
            match.group(1).lower(): match.group(3)
            for match in re.finditer(r"""([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])(.*?)\2""", tag, re.S)
        }
        name = str(attrs.get("property") or attrs.get("name") or "").lower()
        if name not in {
            "article:published_time", "og:published_time", "datepublished",
            "datecreated", "publication_date", "publishdate",
        }:
            continue
        candidate = str(attrs.get("content") or "")[:10]
        try:
            metadata_dates.append(date.fromisoformat(candidate).isoformat())
        except ValueError:
            continue

    # JSON-LD is used by many publication systems; only inspect the known publication fields.
    for pattern in (
        r"""(?i)["'](?:datePublished|dateCreated|published_time)["']\s*:\s*["']([^"']{10,35})["']""",
    ):
        for match in re.finditer(pattern, text):
            try:
                metadata_dates.append(date.fromisoformat(match.group(1)[:10]).isoformat())
            except ValueError:
                continue

    path_dates: list[str] = []
    for candidate in re.findall(r"(?<!\d)(20\d{2}-\d{2}-\d{2})(?!\d)", urlparse(url).path):
        try:
            path_dates.append(date.fromisoformat(candidate).isoformat())
        except ValueError:
            continue

    if expected_date is None:
        unique = sorted(set(metadata_dates or path_dates))
        return unique[0] if len(unique) == 1 else None
    try:
        expected = date.fromisoformat(expected_date).isoformat()
    except ValueError:
        return None
    # Require URL slug and page metadata to agree when both expose dates.
    if path_dates and expected not in path_dates:
        return None
    # Do not accept conflicting metadata simply because a URL slug carries the expected date.
    if metadata_dates:
        if expected not in metadata_dates:
            return None
        return expected
    if path_dates and expected in path_dates:
        return expected
    return None


def _title_overlap(expected_title: str, html_bytes: bytes) -> float:
    """Measure whether the official page includes the event title supplied by the source dataset."""
    stop = {
        "the", "and", "for", "with", "from", "that", "this", "others", "join",
        "set", "to", "of", "in", "on", "at", "by", "a", "an", "s", "p",
        "500", "midcap", "smallcap", "index",
    }
    expected = {
        token for token in re.findall(r"[a-z0-9]+", expected_title.lower())
        if len(token) > 2 and token not in stop
    }
    if len(expected) < 2:
        return 1.0
    page_text = html.unescape(re.sub(r"(?is)<[^>]+>", " ", html_bytes.decode("utf-8", errors="replace"))).lower()
    actual = set(re.findall(r"[a-z0-9]+", page_text))
    return len(expected & actual) / len(expected)


def _publication_upper_bound(published_date: str) -> str:
    """Conservatively bound a date-only publication record in UTC, allowing local timezones."""
    upper_day = date.fromisoformat(published_date) + timedelta(days=1)
    return datetime.combine(upper_day, time.max, timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_announcement(
    url: str,
    expected_date: str | None,
    artifacts_root: Path,
    expected_title: str | None = None,
) -> dict[str, Any]:
    """Archive one official response, then separately evaluate date/title corroboration."""
    if not is_official_url(url):
        return {"verified": False, "reason": "source host is not on the official allowlist", "source_url": url}
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            final_url = response.geturl()
            content = response.read(MAX_SOURCE_BYTES + 1)
            status = response.status
    except urllib.error.HTTPError as exc:
        return {"verified": False, "reason": f"official source returned HTTP {exc.code}", "source_url": url}
    except (urllib.error.URLError, TimeoutError) as exc:
        return {"verified": False, "reason": f"official source fetch failed ({type(exc).__name__})", "source_url": url}
    if not is_official_url(final_url):
        return {"verified": False, "reason": "official source redirected outside the allowlist", "source_url": url}
    if status != 200 or not content or len(content) > MAX_SOURCE_BYTES:
        return {"verified": False, "reason": "official source response was empty or exceeded the size limit", "source_url": url}

    # Preserve the exact allowlisted response even when it fails semantic/date checks,
    # so a reviewer can audit why it did not qualify as membership evidence.
    digest = sha256_bytes(content)
    relative_path = f"source-artifacts/official-announcements/{digest}.html"
    artifact_path = artifacts_root / relative_path
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    if not artifact_path.exists():
        artifact_path.write_bytes(content)

    base = {
        "verified": False,
        "source_url": url,
        "artifact_path": relative_path,
        "sha256": digest,
        "bytes": len(content),
        "http_status": status,
        "final_url": final_url,
    }
    published_date = publication_date_from_page(url, content, expected_date)
    if not published_date:
        return {
            **base,
            "reason": "official page did not independently confirm its expected publication date",
        }
    title_overlap = _title_overlap(expected_title or "", content)
    if not expected_title or title_overlap < 0.60:
        return {
            **base,
            "reason": (
                "dataset event title is missing"
                if not expected_title else
                "official page title/content did not sufficiently match the dataset's event title"
            ),
            "published_date": published_date,
            "title_overlap": round(title_overlap, 3),
        }
    return {
        **base,
        "verified": True,
        "reason": None,
        "published_date": published_date,
        "published_at": _publication_upper_bound(published_date),
        "publication_time_precision": "date-only conservative UTC upper bound (+1 day)",
        "title_overlap": round(title_overlap, 3),
    }

def dataset_file_proof(
    relative_path: str, file_bytes: bytes, source_sha: str, commit_time: str
) -> dict[str, Any]:
    """Fallback proof to the exact upstream YAML, deliberately not point-in-time verified."""
    digest = sha256_bytes(file_bytes)
    source_url = f"{UPSTREAM_REPO}/blob/{source_sha}/{relative_path}"
    try:
        published = datetime.fromisoformat(commit_time.replace("Z", "+00:00"))
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        published_at = published.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        published_at = commit_time
    return {
        "verified": False,
        "source_url": source_url,
        "published_at": published_at,
        "artifact_path": f"source-artifacts/upstream/{Path(relative_path).name}",
        "sha256": digest,
        "evidence_type": "effective_dated_constituent_file",
        "reason": "dataset-only provenance; no independently dated event announcement",
    }


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required to audit the S&P 500 dataset") from exc
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("year"), int):
        raise ValueError(f"Invalid yearly membership YAML: {path.name}")
    baseline = data.get("tickers_on_Jan_1")
    if not isinstance(baseline, list) or not baseline:
        raise ValueError(f"Missing tickers_on_Jan_1 list: {path.name}")
    changes = data.get("changes") or {}
    if not isinstance(changes, dict):
        raise ValueError(f"Invalid membership changes map: {path.name}")
    return data


def _normal_ticker(value: Any) -> str:
    symbol = str(value or "").strip().upper()
    if not symbol or len(symbol) > 16 or not re.fullmatch(r"[A-Z0-9.^-]+", symbol):
        raise ValueError("Membership source contains an invalid symbol")
    return symbol


def build_bundle(
    source_root: Path,
    output_root: Path,
    source_sha: str,
    commit_time: str,
    fetch_sources: bool = True,
) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    data_dir = source_root / "src" / "sp500_ticker_history"
    yaml_paths = sorted(data_dir.glob("sp500-ticker-changes-*.yaml"))
    if not yaml_paths:
        raise ValueError("No sp500-ticker-changes-YYYY.yaml files found in source root")
    source_notes_path = source_root / "source_notes.json"
    notes = json.loads(source_notes_path.read_text(encoding="utf-8")) if source_notes_path.exists() else {}
    coverage_text = str(notes.get("data_freeze_date") or notes.get("date_downloaded") or "").strip()
    try:
        coverage_through = date.fromisoformat(coverage_text).isoformat()
    except ValueError:
        coverage_through = None
    events_after_coverage: list[str] = []

    # Preserve byte-exact upstream inputs in the private evidence bundle.
    upstream_dir = output_root / "source-artifacts" / "upstream"
    upstream_dir.mkdir(parents=True, exist_ok=True)
    notes_bytes = source_notes_path.read_bytes() if source_notes_path.exists() else b"{}\n"
    (upstream_dir / "source_notes.json").write_bytes(notes_bytes)
    license_path = source_root / "licenses" / "fja05680_sp500_LICENSE"
    if license_path.exists():
        (upstream_dir / license_path.name).write_bytes(license_path.read_bytes())

    loaded: list[tuple[Path, dict[str, Any], str, bytes]] = []
    event_inputs: dict[str, dict[str, Any]] = {}
    source_file_proofs: dict[int, dict[str, Any]] = {}
    for path in yaml_paths:
        raw = path.read_bytes()
        target = upstream_dir / path.name
        target.write_bytes(raw)
        doc = load_yaml(path)
        year = doc["year"]
        relative_upstream_path = f"src/sp500_ticker_history/{path.name}"
        source_file_proofs[year] = dataset_file_proof(relative_upstream_path, raw, source_sha, commit_time)
        loaded.append((path, doc, relative_upstream_path, raw))
        changes = doc.get("changes") or {}
        for raw_day, raw_event in changes.items():
            day = str(raw_day)[:10]
            try:
                parsed_day = date.fromisoformat(day)
            except ValueError:
                raise ValueError(f"Invalid event date {day} in {path.name}")
            if coverage_through and day > coverage_through:
                # This repository snapshot may contain events announced after its stated
                # data freeze (including formerly pending future changes). Do not apply
                # them to the reconstructed universe until the source freeze catches up.
                events_after_coverage.append(day)
                continue
            event = raw_event if isinstance(raw_event, dict) else {}
            url = str(event.get("source_url") or event.get("evidence_url") or "").strip()
            announcement_date = str(event.get("announcement_date") or "").strip() or None
            event_inputs[f"{year}:{day}"] = {
                "year": year,
                "day": day,
                "url": url,
                "announcement_date": announcement_date,
                "source_file": path.name,
                "source_relative_path": relative_upstream_path,
                "source_file_proof": source_file_proofs[year],
                "titles": [str(event.get("source_title") or event.get("evidence_note") or "")],
                "removed": [_normal_ticker(x) for x in (event.get("difference") or [])],
                "added": [_normal_ticker(x) for x in (event.get("union") or [])],
            }

    # Fetch official releases in parallel; each distinct URL is captured once by content hash.
    unique_urls: dict[str, dict[str, str | None]] = {}
    for event in event_inputs.values():
        if event["url"]:
            previous = unique_urls.get(event["url"])
            title = event["titles"][0] if event["titles"] else ""
            if previous and previous.get("title") and title and previous["title"] != title:
                previous["title"] = ""  # conflicting labels for one URL: skip title-claim verification
            else:
                unique_urls[event["url"]] = {
                    "date": event["announcement_date"],
                    "title": title or None,
                }
    fetched_sources: dict[str, dict[str, Any]] = {}
    source_fetch_errors: list[dict[str, str]] = []
    if fetch_sources:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = {
                pool.submit(
                    fetch_announcement, url, expected["date"], output_root, expected.get("title")
                ): url
                for url, expected in unique_urls.items()
            }
            for future in concurrent.futures.as_completed(futures):
                url = futures[future]
                try:
                    result = future.result()
                except Exception as exc:
                    result = {"verified": False, "reason": f"unexpected source parser error ({type(exc).__name__})", "source_url": url}
                fetched_sources[url] = result
                if not result.get("verified"):
                    source_fetch_errors.append({"source_url": url, "reason": str(result.get("reason") or "unverified")})

    proof_by_event: dict[str, dict[str, Any]] = {}
    for key, event in event_inputs.items():
        result = fetched_sources.get(event["url"], {}) if event["url"] else {}
        if result.get("verified") and event["announcement_date"] and result.get("published_date") == event["announcement_date"]:
            proof_by_event[key] = {
                "verified": True,
                "source_url": event["url"],
                "published_at": result["published_at"],
                "publication_time_precision": result.get("publication_time_precision"),
                "artifact_path": result["artifact_path"],
                "sha256": result["sha256"],
                "evidence_type": "archived_constituent_release",
                "evidence_id": f"sp500-release:{event['day']}:{result['sha256'][:16]}",
                "reason": None,
            }
        else:
            proof_by_event[key] = {
                **event["source_file_proof"],
                "evidence_id": f"sp500-dataset:{event['day']}:{event['source_file_proof']['sha256'][:16]}",
                "reason": (
                    "official announcement is missing or its publication date could not be independently verified"
                    if event["url"] else "event has no event-specific official source URL"
                ),
            }

    intervals: list[dict[str, Any]] = []
    continuity_errors: list[str] = []
    active: dict[str, dict[str, Any]] = {}
    all_events: list[tuple[date, str, dict[str, Any]]] = []
    for key, event in event_inputs.items():
        all_events.append((date.fromisoformat(event["day"]), key, event))
    event_lookup = {key: event for key, event in event_inputs.items()}

    def previous_day(day_text: str) -> str:
        return (date.fromisoformat(day_text) - timedelta(days=1)).isoformat()

    def open_interval(symbol: str, starts: str, entry_proof: dict[str, Any], *, baseline: bool = False) -> None:
        active[symbol] = {
            "effective_from": starts,
            "entry_proof": entry_proof,
            "end_proof": None,
            "baseline_start": baseline,
        }

    def close_interval(symbol: str, ends: str, exit_proof: dict[str, Any], *, baseline_end: bool = False) -> None:
        current = active.pop(symbol, None)
        if current is None:
            continuity_errors.append(f"{ends}: attempt to remove inactive ticker {symbol}")
            return
        start = current["effective_from"]
        entry = current["entry_proof"]
        chronologically_valid = True
        try:
            entry_time = datetime.fromisoformat(entry["published_at"].replace("Z", "+00:00"))
            start_time = datetime.fromisoformat(iso_midnight(start).replace("Z", "+00:00"))
            if entry_time > start_time:
                chronologically_valid = False
        except (KeyError, ValueError, TypeError):
            chronologically_valid = False
        exit_chronologically_valid = False
        try:
            exit_time = datetime.fromisoformat(str(exit_proof["published_at"]).replace("Z", "+00:00"))
            end_time = datetime.combine(date.fromisoformat(ends), time.max, timezone.utc)
            exit_chronologically_valid = exit_time <= end_time
        except (KeyError, ValueError, TypeError):
            exit_chronologically_valid = False
        verified = (
            bool(entry.get("verified"))
            and chronologically_valid
            and bool(exit_proof.get("verified"))
            and exit_chronologically_valid
            and not baseline_end
        )
        intervals.append(make_interval(
            symbol=symbol,
            starts=start,
            ends=ends,
            entry_proof=entry,
            exit_proof=exit_proof,
            verified=verified,
            baseline_start=current["baseline_start"],
        ))

    def make_interval(
        *, symbol: str, starts: str, ends: str | None,
        entry_proof: dict[str, Any], exit_proof: dict[str, Any] | None,
        verified: bool, baseline_start: bool,
    ) -> dict[str, Any]:
        source_url = str(entry_proof.get("source_url") or "")
        ev_url = source_url
        ev_path = str(entry_proof.get("artifact_path") or "")
        ev_hash = str(entry_proof.get("sha256") or "")
        ev_id = str(entry_proof.get("evidence_id") or f"sp500:{symbol}:{starts}:{ev_hash[:16]}")
        published_at = str(entry_proof.get("published_at") or commit_time)
        return {
            "symbol": symbol,
            "status": "verified" if verified else "insufficient",
            "effective_from": iso_midnight(starts),
            "effective_to": iso_midnight(ends) if ends else None,
            "as_of": iso_midnight(starts),
            "source": "S&P Global press release" if entry_proof.get("evidence_type") == "archived_constituent_release" else "community S&P 500 membership snapshot",
            "source_url": source_url,
            "membership_record_id": f"sp500:{symbol}:{starts}:{ends or 'open'}",
            "membership_evidence_id": ev_id,
            "membership_evidence_type": str(entry_proof.get("evidence_type") or "effective_dated_constituent_file"),
            "membership_evidence_url": ev_url,
            "membership_evidence_published_at": published_at,
            "membership_evidence_published_at_precision": entry_proof.get("publication_time_precision", "upstream commit timestamp; source row remains insufficient"),
            "membership_evidence_artifact_path": ev_path,
            "membership_evidence_sha256": ev_hash,
            "entry_evidence_verified": bool(entry_proof.get("verified")),
            "entry_evidence_reason": entry_proof.get("reason"),
            "end_evidence_verified": bool(exit_proof.get("verified")) if exit_proof else None,
            "end_evidence_url": exit_proof.get("source_url") if exit_proof else None,
            "end_evidence_published_at": exit_proof.get("published_at") if exit_proof else None,
            "end_evidence_artifact_path": exit_proof.get("artifact_path") if exit_proof else None,
            "end_evidence_sha256": exit_proof.get("sha256") if exit_proof else None,
            "baseline_start": baseline_start,
            "coverage_through": coverage_through,
            "dataset_commit_sha": source_sha,
        }

    for path, doc, relative_path, raw in loaded:
        year = int(doc["year"])
        year_start = f"{year:04d}-01-01"
        if coverage_through and year_start > coverage_through:
            # The declared freeze does not establish the next year's January baseline.
            continue
        baseline = {_normal_ticker(s) for s in doc["tickers_on_Jan_1"]}
        baseline_proof = source_file_proofs[year]
        if not active:
            for symbol in sorted(baseline):
                open_interval(symbol, year_start, baseline_proof, baseline=True)
        else:
            active_symbols = set(active)
            for symbol in sorted(active_symbols - baseline):
                close_interval(symbol, previous_day(year_start), baseline_proof, baseline_end=True)
            for symbol in sorted(baseline - active_symbols):
                open_interval(symbol, year_start, baseline_proof, baseline=True)
            if active_symbols != baseline:
                continuity_errors.append(
                    f"{year}: Jan-1 baseline differs from previous calculated state "
                    f"(missing={len(active_symbols - baseline)}, added={len(baseline - active_symbols)})"
                )
        year_events = [
            (day, key, event) for day, key, event in all_events
            if event["year"] == year
        ]
        for event_day, event_key, event in sorted(year_events, key=lambda item: item[0]):
            day_text = event_day.isoformat()
            proof = proof_by_event[event_key]
            for symbol in event["removed"]:
                close_interval(symbol, previous_day(day_text), proof, baseline_end=not proof.get("verified"))
            for symbol in event["added"]:
                if symbol in active:
                    continuity_errors.append(f"{day_text}: attempted duplicate addition for {symbol}")
                    continue
                open_interval(symbol, day_text, proof, baseline=not proof.get("verified"))

    # Active intervals are right-censored at the dataset's actual coverage date.
    # Never emit open-ended membership from a stale/frozen source snapshot.
    for symbol, current in sorted(active.items()):
        entry = current["entry_proof"]
        starts = current["effective_from"]
        if coverage_through and starts > coverage_through:
            continuity_errors.append(f"{starts}: active ticker {symbol} begins after dataset coverage")
            continue
        entry_time_ok = False
        try:
            entry_time_ok = datetime.fromisoformat(entry["published_at"].replace("Z", "+00:00")) <= datetime.fromisoformat(iso_midnight(starts).replace("Z", "+00:00"))
        except (KeyError, ValueError, TypeError):
            pass
        # No explicit exit source means interval boundaries after the freeze cannot
        # be assumed. The bounded interval is intentionally insufficient rather than PASS.
        intervals.append(make_interval(
            symbol=symbol, starts=starts, ends=coverage_through, entry_proof=entry,
            exit_proof=None, verified=False, baseline_start=current["baseline_start"],
        ))

    intervals.sort(key=lambda row: (row["symbol"], row["effective_from"], row["effective_to"] or "9999"))
    candidates = [row for row in intervals if row["status"] == "verified"]
    blocked = [row for row in intervals if row["status"] != "verified"]
    try:
        validator_path = Path(__file__).resolve().parents[2] / "tests" / "production_validation" / "historical_evidence.py"
        spec = importlib.util.spec_from_file_location("aiw_historical_evidence_validator", validator_path)
        if spec is None or spec.loader is None:
            raise RuntimeError("historical evidence validator module could not be loaded")
        validator_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(validator_module)
        validator = validator_module.validate_universe_membership(intervals, artifact_root=output_root)
    except Exception as exc:
        validator = {"status": "ERROR", "checked": len(intervals), "errors": [f"Validator invocation failed ({type(exc).__name__})"]}

    # Persist a machine-readable index of both accepted and rejected official-page evidence.
    official_fetch_rows = [
        {
            "source_url": item.get("source_url") or url,
            "final_url": item.get("final_url"),
            "verified": bool(item.get("verified")),
            "reason": item.get("reason"),
            "published_date": item.get("published_date"),
            "published_at": item.get("published_at"),
            "publication_time_precision": item.get("publication_time_precision"),
            "title_overlap": item.get("title_overlap"),
            "artifact_path": item.get("artifact_path"),
            "sha256": item.get("sha256"),
            "bytes": item.get("bytes"),
            "http_status": item.get("http_status"),
        }
        for url, item in sorted(fetched_sources.items())
    ]
    (output_root / "official_source_fetches.json").write_text(
        json.dumps({"sources": official_fetch_rows}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    # The open dataset itself reports a June 2026 freeze and outstanding conflicts.
    # Preserve the uncertainty instead of claiming that the universe is verified to today.
    caveats = notes.get("caveats") if isinstance(notes.get("caveats"), list) else []
    overall = "PASS" if intervals and not blocked and not continuity_errors and not source_fetch_errors and coverage_through == datetime.now(timezone.utc).date().isoformat() else "BLOCKED"
    report = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "upstream_repository": UPSTREAM_REPO,
        "upstream_commit_sha": source_sha,
        "upstream_commit_time": commit_time,
        "source_freeze_date": notes.get("data_freeze_date"),
        "coverage_through": coverage_through,
        "upstream_coverage": notes.get("yaml_coverage"),
        "total_intervals": len(intervals),
        "technically_verified_intervals": len(candidates),
        "insufficient_intervals": len(blocked),
        "unique_symbols": len({row["symbol"] for row in intervals}),
        "official_source_urls": len(unique_urls),
        "official_source_fetches_path": "official_source_fetches.json",
        "official_source_fetches": official_fetch_rows,
        "events_excluded_after_source_freeze": len(events_after_coverage),
        "latest_excluded_event_date": max(events_after_coverage) if events_after_coverage else None,
        "official_source_pages_archived": sum(1 for item in fetched_sources.values() if item.get("verified")),
        "official_source_failures": len(source_fetch_errors),
        "continuity_errors": continuity_errors[:100],
        "official_source_errors": source_fetch_errors[:100],
        "caveats": caveats,
        "strict_validator_status": validator.get("status"),
        "strict_validator_error_count": len(validator.get("errors", [])),
        "strict_validator_errors_sample": validator.get("errors", [])[:50],
        "historical_membership_gate": overall,
        "gate_reason": "The community dataset has legacy entries without per-event publication evidence. Events after the declared source freeze are excluded, surviving intervals are right-censored at the freeze, and dated public sources only qualify the specific intervals they support.",
    }
    (output_root / "membership_rows.json").write_text(json.dumps({"membership_rows": intervals}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output_root / "candidate_verified_membership_rows.json").write_text(json.dumps({"membership_rows": candidates}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output_root / "audit_report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output_root / "README.txt").write_text(
        "Private S&P 500 membership evidence bundle.\n"
        f"Upstream commit: {source_sha}\n"
        f"Coverage through: {coverage_through}\n"
        f"Technical membership gate: {overall}\n"
        "A row marked verified means its entry/exit evidence passed automated host/date/hash checks; it is not a human semantic audit. "
        "Use only rows supported for the intended as-of date. All unsupported intervals remain insufficient.\n",
        encoding="utf-8",
    )
    return report


def make_zip(source_dir: Path, output_path: Path) -> tuple[bytes, str]:
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_file() and path != output_path:
                archive.write(path, path.relative_to(source_dir).as_posix())
    content = output_path.read_bytes()
    if not content or len(content) > 50 * 1024 * 1024:
        raise ArchiveError("Membership bundle is empty or exceeds the private object-size limit")
    return content, sha256_bytes(content)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--upstream-sha", required=True)
    parser.add_argument("--upstream-commit-time", required=True)
    parser.add_argument("--skip-official-fetch", action="store_true", help="Test/rebuild mode; official events remain insufficient")
    parser.add_argument("--output-bundle", default="/tmp/sp500-membership-evidence.zip")
    args = parser.parse_args()
    source_root = Path(args.source_root).resolve()
    scratch = Path("/tmp/aiw-sp500-membership-evidence")
    if scratch.exists():
        shutil.rmtree(scratch)
    scratch.mkdir(parents=True)
    try:
        report = build_bundle(
            source_root, scratch, args.upstream_sha, args.upstream_commit_time,
            fetch_sources=not args.skip_official_fetch,
        )
        bundle_path = Path(args.output_bundle).resolve()
        bundle_path.parent.mkdir(parents=True, exist_ok=True)
        bundle, digest = make_zip(scratch, bundle_path)
        retrieved_at = utc_now()
        object_path = f"sp500-membership/{retrieved_at[:10]}/{digest}.zip"
        upload_object(object_path, bundle, "application/zip")
        upsert_metadata({
            "provider": "sp500-membership",
            "artifact_type": "membership-audit-bundle",
            "sha256": digest,
            "bucket_name": BUCKET,
            "object_path": object_path,
            "source_endpoint": f"{UPSTREAM_REPO}/commit/{args.upstream_sha}",
            "retrieved_at": retrieved_at,
            "source_as_of": None,
            "market_date": None,
            "row_count": report["total_intervals"],
            "symbol_count": report["unique_symbols"],
            "evidence_status": "insufficient" if report["historical_membership_gate"] != "PASS" else "candidate",
            "details": {
                "upstream_commit_sha": args.upstream_sha,
                "coverage_through": report["coverage_through"],
                "historical_membership_gate": report["historical_membership_gate"],
                "technically_verified_intervals": report["technically_verified_intervals"],
                "insufficient_intervals": report["insufficient_intervals"],
                "official_source_pages_archived": report["official_source_pages_archived"],
                "strict_validator_status": report["strict_validator_status"],
                "strict_validator_error_count": report["strict_validator_error_count"],
            },
        })
    except (ArchiveError, OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print("SP500_MEMBERSHIP status=BLOCKED " + json.dumps({
            "error_type": type(exc).__name__,
            "reason": str(exc)[:200],
        }, sort_keys=True))
        return 1
    print("SP500_MEMBERSHIP " + json.dumps({
        "bundle_sha256": digest,
        "bundle_bytes": len(bundle),
        "object_path": object_path,
        "upstream_commit_sha": args.upstream_sha,
        "coverage_through": report["coverage_through"],
        "total_intervals": report["total_intervals"],
        "technically_verified_intervals": report["technically_verified_intervals"],
        "insufficient_intervals": report["insufficient_intervals"],
        "official_source_pages_archived": report["official_source_pages_archived"],
        "continuity_errors": len(report["continuity_errors"]),
        "strict_validator_status": report["strict_validator_status"],
        "historical_membership_gate": report["historical_membership_gate"],
        "archive_status": "stored_privately",
    }, sort_keys=True))
    # A blocked evidence gate is a valid audit outcome; only infrastructure failures fail the job.
    return 0


if __name__ == "__main__":
    sys.exit(main())
