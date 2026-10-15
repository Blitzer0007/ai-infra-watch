"""Manual-login, read-only production smoke check.

Launches a local headed browser without loading or saving storage state.
The user signs in directly; checks are limited to HTTP navigation and page rendering.
No app controls are clicked and no API mutations are initiated.
"""
from __future__ import annotations

import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

BASE_URL = os.getenv(
    "PROD_BASE_URL", "https://ai-infra-watch-theta.vercel.app"
).rstrip("/")
ROUTES = [
    route.strip()
    for route in os.getenv("PROD_READ_ONLY_ROUTES", "/").split(",")
    if route.strip()
]


def main() -> int:
    parsed = urlparse(BASE_URL)
    if parsed.scheme != "https" or not parsed.netloc:
        print("Refusing to run: PROD_BASE_URL must be a valid HTTPS URL.")
        return 2

    failures: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        # Intentionally use a fresh context; no existing profile, cookies, or storage state.
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(15_000)

        try:
            response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45_000)
            if response is None:
                print("Initial navigation returned no main-document response (possibly a client redirect).")
            elif response.status >= 500:
                failures.append(f"Homepage returned HTTP {response.status}")
            else:
                print(f"Homepage navigation: HTTP {response.status}")

            print("\nSign in manually in the opened browser if prompted.")
            print("When the app is fully loaded, return here and press Enter.")
            input()

            print(f"Current page after manual sign-in: {page.url}")
            for route in ROUTES:
                if not route.startswith("/") or route.startswith("//"):
                    failures.append(f"Skipped unsafe route value: {route!r}")
                    continue
                target = BASE_URL + route
                try:
                    response = page.goto(target, wait_until="domcontentloaded", timeout=45_000)
                    status = response.status if response is not None else None
                    if status is not None and status >= 500:
                        failures.append(f"{route}: HTTP {status}")
                    elif not page.locator("body").inner_text(timeout=10_000).strip():
                        failures.append(f"{route}: page body is empty")
                    else:
                        print(f"PASS {route}: HTTP {status if status is not None else 'client-rendered'}; page body present")
                except PlaywrightError as exc:
                    failures.append(f"{route}: navigation/check error: {exc}")

            print("\nNo buttons, forms, scans, notifications, proposals, or trading actions were triggered.")
            if failures:
                print("\nFAILURES:")
                for failure in failures:
                    print(f"- {failure}")
                return 1
            print("\nRead-only navigation smoke checks passed for the configured routes.")
            print("Note: this is not proof of data correctness or historical point-in-time validity.")
            return 0
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
