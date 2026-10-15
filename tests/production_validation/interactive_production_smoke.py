"""Manual-login, read-only production smoke check for the documented dashboard routes.

Uses a fresh local browser context. The user signs in manually; credentials and session
state are not read, printed, saved, or uploaded. Only page navigation/rendering is checked.
No dashboard controls are clicked and no scan/notification/trading actions are initiated.
"""
from __future__ import annotations

import os
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import expect, sync_playwright

BASE_URL = os.getenv(
    "PROD_BASE_URL", "https://ai-infra-watch-theta.vercel.app"
).rstrip("/")
# Verified against src/App.tsx VIEW_PATHS on the main branch.
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


def main() -> int:
    parsed = urlparse(BASE_URL)
    if parsed.scheme != "https" or not parsed.netloc:
        print("Refusing to run: PROD_BASE_URL must be a valid HTTPS URL.")
        return 2

    failures: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        # Fresh context; do not reuse a personal browser profile or storage state.
        context = browser.new_context()
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
            print("After the dashboard shell is visible, return here and press Enter.")
            input()

            print(f"Current page after manual sign-in: {page.url}")
            try:
                expect(page.locator(AUTH_SHELL_MARKER)).to_be_visible(timeout=10_000)
                print("PASS authenticated dashboard shell is visible")
            except PlaywrightError:
                failures.append(
                    "Authenticated dashboard shell not detected; confirm sign-in completed "
                    "and the app is showing its navigation."
                )

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
                        print(f"PASS {route}: HTTP {status if status is not None else 'client-rendered'}; dashboard shell and body present")
                except PlaywrightError as exc:
                    failures.append(f"{route}: navigation/render check failed ({type(exc).__name__})")

            print("\nSafety: no buttons or forms were clicked; no scans, alerts, proposals, writes, or trading actions were triggered.")
            if failures:
                print("\nFAILURES:")
                for failure in failures:
                    print(f"- {failure}")
                return 1
            print("\nAll configured read-only dashboard route checks passed.")
            print("Limit: route rendering is not proof of data correctness or historical point-in-time validity.")
            return 0
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
