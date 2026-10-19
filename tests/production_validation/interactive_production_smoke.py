"""Manual-login, read-only production smoke check for the dashboard and protected data.

Uses a fresh local browser context. The user signs in manually; credentials and session
state are never read by Python, printed, saved, or uploaded. The protected API probe runs
inside the page and returns only a status/schema summary, never portfolio rows. Non-read
requests are blocked except the app's explicit POST /api/auth login endpoint.
"""
from __future__ import annotations

import json
import os
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import expect, sync_playwright

BASE_URL = os.getenv(
    "PROD_BASE_URL", "https://ai-infra-watch-theta.vercel.app"
).rstrip("/")
# Verified against src/App.tsx VIEW_PATHS on main.
DEFAULT_ROUTES = (
    "/overview,/contracts,/tracker,/congress,/macro,/portfolio,/watchlist,"
    "/research,/jev-lab,/quality,/outlook,/health,/guide,/settings"
)
ROUTES = [
    route.strip()
    for route in os.getenv("PROD_READ_ONLY_ROUTES", DEFAULT_ROUTES).split(",")
    if route.strip()
]
AUTH_SHELL_MARKER = '[data-testid="nav-overview"]'
SESSION_TOKEN_KEY = "aiw_access_token_v1"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _protected_portfolio_summary(page) -> dict:
    """Return metadata only. No portfolio values or row contents leave the page."""
    return page.evaluate(
        """async () => {
          const token = window.sessionStorage.getItem("aiw_access_token_v1") || "";
          if (!token) return { tokenPresent: false };
          const response = await fetch("/api/portfolio", {
            method: "GET",
            headers: { "Authorization": "Bearer " + token, "Accept": "application/json" },
            cache: "no-store"
          });
          const body = await response.json().catch(() => null);
          const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
          return {
            tokenPresent: true,
            status: response.status,
            isJson: Boolean(body && typeof body === "object" && !Array.isArray(body)),
            sourceIsSupabase: body?.source === "supabase",
            persistent: body?.persistent === true,
            holdingsArray: Array.isArray(body?.holdings),
            hasHoldings: holdings.length > 0,
            holdingsShapeOk: holdings.every(row =>
              row && typeof row.symbol === "string" &&
              Number.isFinite(Number(row.quantity)) &&
              Number.isFinite(Number(row.averageCost))
            )
          };
        }"""
    )


def main() -> int:
    parsed = urlparse(BASE_URL)
    if parsed.scheme != "https" or not parsed.netloc:
        print("Refusing to run: PROD_BASE_URL must be a valid HTTPS URL.")
        return 2

    failures: list[str] = []
    blocked_mutations: set[str] = set()
    base_origin = f"{parsed.scheme}://{parsed.netloc}"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        # Fresh context; no personal browser profile or imported/exported storage state.
        context = browser.new_context()

        def read_only_route(route):
            request = route.request
            method = request.method.upper()
            target = urlparse(request.url)
            # Only allow the dashboard's login exchange. This script does not generate
            # login requests itself; the user performs any login manually in the browser.
            if method == "POST" and f"{target.scheme}://{target.netloc}" == base_origin and target.path == "/api/auth":
                route.continue_()
            elif method not in SAFE_METHODS:
                blocked_mutations.add(f"{method} {target.netloc}{target.path}")
                route.abort("blockedbyclient")
            else:
                route.continue_()

        # Installed before first navigation, so app startup effects cannot send
        # alert-config, scorecard, Telegram, purchase, or portfolio mutations.
        context.route("**/*", read_only_route)
        page = context.new_page()
        page.set_default_timeout(15_000)

        try:
            response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45_000)
            if response is not None and response.status >= 500:
                failures.append(f"Homepage returned HTTP {response.status}")
            else:
                print(f"Homepage navigation: HTTP {response.status if response else 'client-rendered'}")

            print("\nSign in manually in the opened browser if prompted.")
            print("Do not paste your access token into PowerShell or this chat.")
            print("After the authenticated dashboard shell is visible, return here and press Enter.")
            input()

            print(f"Current page after manual sign-in: {page.url}")
            try:
                expect(page.locator(AUTH_SHELL_MARKER)).to_be_visible(timeout=10_000)
                print("PASS dashboard shell is visible")
            except PlaywrightError:
                failures.append(
                    "Dashboard shell not detected; confirm sign-in completed and the app is showing its navigation."
                )

            if not failures:
                try:
                    summary = _protected_portfolio_summary(page)
                    assert summary.get("tokenPresent") is True, (
                        "No access token found in sessionStorage; manual login may not have completed."
                    )
                    assert summary.get("status") == 200, (
                        "Protected portfolio API did not accept the current session."
                    )
                    assert summary.get("isJson") is True, "Protected API did not return a JSON object."
                    assert summary.get("sourceIsSupabase") is True and summary.get("persistent") is True, (
                        "Protected API did not identify the expected persistent Supabase source."
                    )
                    assert summary.get("holdingsArray") is True and summary.get("hasHoldings") is True, (
                        "Protected API returned an empty or malformed holdings collection."
                    )
                    assert summary.get("holdingsShapeOk") is True, "Protected portfolio rows have an invalid shape."
                    print(
                        "PASS protected portfolio GET: HTTP 200; persistent Supabase source; "
                        "non-empty holdings response with expected row shape"
                    )
                except (AssertionError, PlaywrightError) as exc:
                    failures.append(f"Protected read-only API verification failed: {exc}")

            for route in ROUTES:
                if not route.startswith("/") or route.startswith("//") or "://" in route:
                    failures.append(f"Rejected unsafe route value: {route!r}")
                    continue
                try:
                    response = page.goto(BASE_URL + route, wait_until="domcontentloaded", timeout=45_000)
                    status = response.status if response is not None else None
                    if status is not None and status >= 500:
                        failures.append(f"{route}: HTTP {status}")
                        continue
                    expect(page.locator(AUTH_SHELL_MARKER)).to_be_visible(timeout=10_000)
                    body = page.locator("body").inner_text(timeout=10_000).strip()
                    if not body:
                        failures.append(f"{route}: page body is empty")
                    else:
                        print(
                            f"PASS {route}: HTTP {status if status is not None else 'client-rendered'}; "
                            "dashboard shell and body present"
                        )
                except PlaywrightError as exc:
                    failures.append(f"{route}: navigation/render check failed ({type(exc).__name__})")

            if blocked_mutations:
                print("\nRead-only guard blocked attempted requests:")
                for entry in sorted(blocked_mutations):
                    print(f"- {entry}")
            print(
                "\nSafety: only GET/HEAD/OPTIONS and the manual login endpoint were allowed; "
                "mutating requests were aborted before reaching the server."
            )
            if failures:
                print("\nFAILURES:")
                for failure in failures:
                    print(f"- {failure}")
                return 1
            print("\nAll configured read-only dashboard route and protected-data checks passed.")
            print("Limit: this verifies current access and response shape, not data accuracy or historical point-in-time validity.")
            return 0
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
