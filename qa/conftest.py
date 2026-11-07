from __future__ import annotations

import base64
import json
import os
import tempfile
from pathlib import Path
from typing import Generator, TYPE_CHECKING

import pytest
from safety import is_loopback_url, qa_base_url

if TYPE_CHECKING:
    from playwright.sync_api import Browser, Page, Playwright


def _headers() -> dict[str, str]:
    if os.getenv("QA_ALLOW_LIVE") != "true":
        return {}
    raw = os.getenv("QA_HEADERS_JSON", "").strip()
    if not raw:
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("QA_HEADERS_JSON must be a JSON object")
    return {str(k): str(v) for k, v in value.items()}

def _storage_state_path() -> str | None:
    if os.getenv("QA_ALLOW_LIVE") != "true":
        return None
    path = os.getenv("QA_STORAGE_STATE", "").strip()
    if path:
        return path
    encoded = os.getenv("QA_STORAGE_STATE_B64", "").strip()
    if not encoded:
        return None
    decoded = base64.b64decode(encoded).decode("utf-8")
    fd, path = tempfile.mkstemp(prefix="aiw-playwright-", suffix=".json")
    os.close(fd)
    Path(path).write_text(decoded, encoding="utf-8")
    return path

@pytest.fixture(scope="session")
def base_url() -> str:
    return qa_base_url()

@pytest.fixture(scope="session")
def storage_state() -> Generator[str | None, None, None]:
    path = _storage_state_path()
    yield path
    if path and path.startswith(tempfile.gettempdir()):
        Path(path).unlink(missing_ok=True)

@pytest.fixture(scope="session")
def browser_playwright() -> Generator[Playwright, None, None]:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        yield playwright

@pytest.fixture
def page(browser_playwright: Playwright, base_url: str, storage_state: str | None) -> Generator[Page, None, None]:
    if os.getenv("QA_ALLOW_LIVE") != "true" and os.getenv("QA_UI_MOCKS") != "true":
        raise ValueError("Offline UI tests require QA_UI_MOCKS=true")
    launch_options = {"headless": True, "args": ["--disable-dev-shm-usage"]}
    if os.getenv("QA_CHROMIUM_EXECUTABLE"):
        launch_options["executable_path"] = os.environ["QA_CHROMIUM_EXECUTABLE"]
    browser: Browser = browser_playwright.chromium.launch(**launch_options)
    context_kwargs = {
        "base_url": base_url,
        "service_workers": "block",
        "extra_http_headers": _headers(),
        "viewport": {"width": 1440, "height": 1000},
    }
    if storage_state:
        context_kwargs["storage_state"] = storage_state
    context = browser.new_context(**context_kwargs)
    if os.getenv("QA_ALLOW_LIVE") != "true":
        context.route("**/*", lambda route: route.fallback() if is_loopback_url(route.request.url) else route.abort())
        context.route_web_socket("**/*", lambda route: route.connect_to_server() if is_loopback_url(route.url) else route.close())
    page = context.new_page()
    yield page
    context.close()
    browser.close()
