# Milestone 2 — Calendar and Inbox research round trips

15 November 2026. Implemented on the existing feature branch for draft PR #168; not deployed. [Continuation draft](CODEX-CONTINUATION.md).

Calendar and Inbox previously lost their filters and reading context when opening another workspace. They now offer a company research destination with a fixed return route. Calendar ranges/certainty/timezone and Inbox window/evidence/read filters survive Back/Forward and return navigation through bounded URL enums. Search text is bounded local browser-entry state, never a generated link parameter.

## Behavior and boundaries

- Company links carry only an explicit valid symbol, the closed source workspace and allowed view options. They omit event/alert text, search text, positions, notes, provider message/episode references, destinations, cursors, credentials and arbitrary return URLs. The research destination still validates the company against configured context; unknown companies show an explicit gap without substituting a holding.
- App-session memory retains expanded record explanations, return focus/scroll and already loaded Inbox delivery rows. Search text can survive a same-entry reload via local browser history; loaded Calendar/Inbox source records and expanded record state are not persisted across a reload. No claim of source completeness, issuer authenticity, read receipt or correlated delivery is added.
- Returning within the app uses the retained Calendar snapshot and Inbox cache. Server reads/pagination stay explicit. A different Inbox window clears the prior server window; Back does not replay a GET. Leaving during a manual read aborts it and rejects late responses. Failed refresh explanations and local acknowledgements survive a company round trip.
- Research does not start the Portfolio-specific quote refresh loop. Selecting another Portfolio section restores that loop; cleanup stops its remaining symbol requests after leaving. The pre-existing app-wide bootstrap/quote/feed refresh behavior is unchanged. This increment adds no source acquisition, model request, sender, scheduler or polling activation.
- Event date precision, correction/cancellation explanations and uncertain/conflicting delivery evidence retain their original semantics. The dossier remains manually opened and source-unconnected.

## Verification

Cloud checks passed: **1,792 Node cases** (eight new routing/privacy tests), TypeScript, production build, tracked-source security, unchanged 32-file migration manifest and whitespace checks. **61 distinct browser cases** passed across Calendar, Inbox, company research, Portfolio navigation and holding detail, including the final eleven-case new-suite rerun after the hook updater review. The quote-resume case waits for its specific mocked response rather than assuming network-idle proves a serial refresh has reached that symbol. A further **37 valuation/accounting/scenario/table cases passed**, for **98 distinct browser cases** in this checkpoint.

The React review checked effect cleanup, pure state updaters, bounded local state, stable callbacks, keyboard links/return focus and 360/768/1440px layouts. The existing main-bundle warning remains (~1,767 kB); the dossier stays in a separate chunk. Saved-head CI is recorded on draft PR #168, not inferred from an earlier head.

## Remaining Milestone 2 work

Add a company research context panel for the exact Calendar/Inbox record opened in this app session, without putting record contents or identifiers in URLs. It must preserve original date/source/delivery ambiguity, show missing context after a reload, and never fetch or synthesize replacements. Broader Portfolio editing/context, source/conflict presentation and integrated keyboard/mobile acceptance remain pending. Auxiliary disclosures outside the record explanations are not retained by this increment. Production remains Milestone 1, **1/5** releases.
