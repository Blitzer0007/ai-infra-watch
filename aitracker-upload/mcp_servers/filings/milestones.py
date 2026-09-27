"""Auto-maintained milestone timelines from SEC 8-K material-event filings.

The Progress Tracker page used to carry two HAND-WRITTEN milestone timelines
(NBIS, DGXX) badged "manually maintained". This module replaces that with a
timeline derived automatically, for ANY symbol, from the company's recent 8-K
filings on EDGAR — a company files an 8-K to disclose a material event
(entering a major agreement, completing an acquisition, an equity investment,
etc.), which is exactly the "milestone" the tracker wants to show.

Same shape as mcp_servers/stocks/earnings.py (Service + from_env, best-effort
batch): a symbol that errors is omitted, not fatal, and `get_many` fails as a
whole only on a total outage. It reads through the existing EdgarClient
(mcp_servers/filings/edgar.py) — fixture mode is offline/deterministic (tests,
CI), live mode hits real EDGAR — so no new network code lives here.

Each 8-K carries an `items[]` of section codes (e.g. "1.01", "2.01"); we map
the FIRST recognized code to a human `title` and join all recognized codes into
the `description`. Unknown codes fall back to "Material event", never dropped.
"""
from __future__ import annotations

from mcp_servers.filings.edgar import EdgarClient, from_env as edgar_from_env
from mcp_servers.filings.schemas import (
    EdgarError,
    FilingRef,
    MilestoneEvent,
    MilestoneTimeline,
)

# 8-K item section codes -> human titles. Covers the material-event items most
# relevant to build-out / contract milestones; anything else degrades to the
# generic fallback rather than being dropped.
ITEM_TITLES: dict[str, str] = {
    "1.01": "Entry into a Material Definitive Agreement",
    "1.02": "Termination of a Material Definitive Agreement",
    "1.03": "Bankruptcy or Receivership",
    "2.01": "Completion of Acquisition or Disposition of Assets",
    "2.02": "Results of Operations and Financial Condition",
    "2.03": "Creation of a Material Direct Financial Obligation",
    "2.05": "Costs Associated with Exit or Disposal Activities",
    "3.01": "Notice of Delisting or Failure to Satisfy a Listing Rule",
    "3.02": "Unregistered Sale of Equity Securities",
    "3.03": "Material Modification to Rights of Security Holders",
    "4.01": "Changes in Registrant's Certifying Accountant",
    "5.01": "Changes in Control of Registrant",
    "5.02": "Departure or Appointment of Directors or Officers",
    "5.03": "Amendments to Articles or Bylaws",
    "5.07": "Submission of Matters to a Vote of Security Holders",
    "7.01": "Regulation FD Disclosure",
    "8.01": "Other Events",
    "9.01": "Financial Statements and Exhibits",
}

FALLBACK_TITLE = "Material event"


def _title_for(items: list[str]) -> str:
    """Human title from the first recognized item code, else the fallback."""
    for code in items:
        if code in ITEM_TITLES:
            return ITEM_TITLES[code]
    return FALLBACK_TITLE


def _description_for(items: list[str]) -> str:
    """Join the titles of all recognized item codes; empty when none recognized
    (the UI then shows the title alone)."""
    titles = [ITEM_TITLES[c] for c in items if c in ITEM_TITLES]
    return " · ".join(titles)


def _event_from_ref(ref: FilingRef) -> MilestoneEvent:
    return MilestoneEvent(
        date=ref.filed_date,
        title=_title_for(ref.items),
        description=_description_for(ref.items),
        status="done",
        form=ref.form,
        accession=ref.accession,
        url=ref.url,
        items=list(ref.items),
    )


class MilestoneService:
    """Transport-independent milestone logic over an EdgarClient.

    Best-effort batch, mirroring EarningsService.get_many: a symbol that errors
    (unknown ticker, EDGAR outage, malformed payload) is omitted, and
    `get_many` raises as a whole ONLY when EVERY requested symbol fails.
    """

    def __init__(self, client: EdgarClient | None = None, limit: int = 12) -> None:
        self.client = client or edgar_from_env("fixture")
        self.limit = limit

    @classmethod
    def from_env(cls, mode: str = "fixture") -> "MilestoneService":
        return cls(client=edgar_from_env(mode))

    def get_timeline(self, symbol: str) -> MilestoneTimeline:
        """One symbol's milestone timeline, newest first. Raises EdgarError on
        an unresolvable symbol or an EDGAR failure."""
        sym = symbol.strip().upper()
        cik = self.client.resolve_cik(sym)
        if not cik:
            raise EdgarError("NO_DATA", f"no CIK for {sym}")
        refs = self.client.recent_events(cik, form="8-K", limit=self.limit)
        events = [_event_from_ref(r) for r in refs]
        return MilestoneTimeline(
            symbol=sym,
            source=getattr(self.client, "source", "live"),
            events=events,
        )

    def get_many(self, symbols: list[str]) -> dict[str, MilestoneTimeline]:
        """Best-effort {symbol: MilestoneTimeline}. Omits symbols that error;
        raises only when EVERY requested symbol fails (total outage). An empty
        list returns `{}` cleanly."""
        out: dict[str, MilestoneTimeline] = {}
        errors = 0
        for sym in symbols:
            try:
                timeline = self.get_timeline(sym)
                out[timeline.symbol] = timeline
            except EdgarError:
                errors += 1
        if symbols and errors == len(symbols):
            raise EdgarError("NO_DATA", f"all {len(symbols)} symbols failed")
        return out


def from_env(mode: str = "fixture") -> MilestoneService:
    """Module-level mirror of MilestoneService.from_env."""
    return MilestoneService.from_env(mode=mode)
