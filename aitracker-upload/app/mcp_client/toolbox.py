"""MCPToolbox — synchronous bridge over MCPClient for use in sync LangGraph nodes.

Every agent graph in this repo is synchronous (graph.invoke), but MCPClient is
async. MCPToolbox runs one persistent event loop on a dedicated background
thread and keeps a connected MCPClient alive inside a single long-running
worker coroutine on it. It exposes call/read/tools synchronously so a sync
graph node can consume MCP tools exactly like the injected service objects it
already uses.

Usage:
    toolbox = MCPToolbox([stocks_cfg, filings_cfg])
    toolbox.connect()                          # blocks until all servers ready
    result = toolbox.call("get_quote", {"symbol": "NVDA"})
    text   = toolbox.read("stocks://quotes/live")
    toolbox.close()

Or as a context manager:
    with MCPToolbox([stocks_cfg]) as tb:
        result = tb.call("list_watchlist")

Why one worker coroutine (not run_coroutine_threadsafe per call)?
  The real stdio transport (anyio under ClientSession/stdio_client) opens
  cancel scopes bound to the *task* that entered them. Every coroutine handed
  to run_coroutine_threadsafe becomes its OWN task, so __aenter__ and __aexit__
  would land in different tasks and anyio raises "Attempted to exit cancel
  scope in a different task". Instead a single _serve() coroutine holds
  `async with client:` open and awaits each request in-line, so enter, every
  call, and exit all share ONE task.

The injected `session_factory` seam is forwarded to the underlying MCPClient,
so tests drive the toolbox over in-process FakeSessions — no subprocess, no
stdio.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import threading
from typing import Any, Awaitable, Callable

from app.mcp_client.client import (
    MCPClient,
    MCPClientError,
    ServerConfig,
    SessionFactory,
    ToolInfo,
    _stdio_session_factory,
)

# A request is a zero-arg factory returning the coroutine to await inside the
# worker task, paired with the concurrent.futures.Future that receives its
# result. Using a factory (not a bare coroutine) keeps coroutine creation on
# the loop thread.
_Request = tuple[Callable[[], Awaitable[Any]], "asyncio.Future[Any]"]


class MCPToolbox:
    """Synchronous facade over MCPClient, backed by one worker coroutine."""

    def __init__(
        self,
        servers: list[ServerConfig],
        session_factory: SessionFactory = _stdio_session_factory,
    ) -> None:
        self._servers = list(servers)
        self._session_factory = session_factory
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._client: MCPClient | None = None
        self._queue: asyncio.Queue[_Request | None] | None = None
        # The concurrent.futures.Future returned by run_coroutine_threadsafe;
        # it resolves only when _serve() (and thus client.__aexit__) completes,
        # so close() waits on THIS for real teardown — not on a thread join that
        # can't finish until the loop is stopped.
        self._serve_task: concurrent.futures.Future[Any] | None = None
        self._ready = threading.Event()
        self._connect_error: BaseException | None = None

    # -- lifecycle ---------------------------------------------------------

    def connect(self) -> "MCPToolbox":
        """Open connections to all configured servers (blocking)."""
        if self._client is not None:
            return self
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._loop.run_forever, name="mcp-toolbox-loop", daemon=True
        )
        self._thread.start()
        # Launch the worker coroutine on the loop and wait until it has either
        # connected (self._ready set) or failed (self._connect_error set). Keep
        # the future so close() can wait for teardown to actually finish.
        self._serve_task = asyncio.run_coroutine_threadsafe(self._serve(), self._loop)
        self._ready.wait()
        if self._connect_error is not None:
            err = self._connect_error
            self._shutdown_loop()
            raise err
        return self

    async def _serve(self) -> None:
        """Own the client's whole lifetime in one task; service requests inline."""
        try:
            self._queue = asyncio.Queue()
            client = MCPClient(self._servers, self._session_factory)
            await client.__aenter__()
        except BaseException as exc:  # ANY prelude failure — report and bail.
            # Set _ready in the except (not a finally) so a clean connect does
            # not double-set; connect() unblocks and re-raises _connect_error.
            self._connect_error = exc
            self._ready.set()
            return
        self._client = client
        self._ready.set()
        try:
            while True:
                request = await self._queue.get()
                if request is None:  # close sentinel
                    break
                factory, future = request
                try:
                    result = await factory()
                except BaseException as exc:  # noqa: BLE001 — marshal to caller
                    if not future.done():
                        future.set_exception(exc)
                else:
                    if not future.done():
                        future.set_result(result)
        finally:
            await client.__aexit__(None, None, None)

    def close(self) -> None:
        """Tear down all server connections and stop the loop thread."""
        if self._loop is not None and self._queue is not None and self._client is not None:
            # Signal the worker to exit its loop; __aexit__ then runs in-task.
            self._loop.call_soon_threadsafe(self._queue.put_nowait, None)
            # Wait on the SERVE FUTURE, not a thread join: the loop is still
            # running run_forever(), so the thread can't exit yet, but _serve()
            # resolves as soon as __aexit__ completes. This is the real
            # "teardown finished" signal (a bare thread.join here can never
            # succeed until the loop is stopped, so it always burned the full
            # timeout). Only after teardown do we stop the loop + join.
            if self._serve_task is not None:
                try:
                    self._serve_task.result(timeout=5.0)
                except BaseException:  # noqa: BLE001 — teardown must not wedge
                    # A hung (TimeoutError) or failed __aexit__ must not wedge
                    # close(); fall through to force the loop down regardless.
                    pass
        self._client = None
        self._queue = None
        self._serve_task = None
        self._shutdown_loop()

    def _shutdown_loop(self) -> None:
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None
        if self._loop is not None:
            self._loop.close()
            self._loop = None
        self._ready.clear()
        self._connect_error = None

    def __enter__(self) -> "MCPToolbox":
        return self.connect()

    def __exit__(self, *exc: Any) -> None:
        self.close()

    # -- introspection -----------------------------------------------------

    def tools(self) -> list[ToolInfo]:
        """All discovered tools across every connected server."""
        self._require_connected()
        return self._client.tools()  # type: ignore[union-attr]

    def tool_names(self) -> list[str]:
        """Qualified names ('<server>.<tool>') of every discovered tool."""
        self._require_connected()
        return self._client.tool_names()  # type: ignore[union-attr]

    def servers(self) -> list[str]:
        """Names of the connected servers."""
        self._require_connected()
        return self._client.servers()  # type: ignore[union-attr]

    # -- calls -------------------------------------------------------------

    def call(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        """Synchronously call a tool by bare or qualified name."""
        self._require_connected()
        return self._submit(lambda: self._client.call_tool(name, arguments))  # type: ignore[union-attr]

    def read(self, uri: str, server: str | None = None) -> str:
        """Synchronously read a resource by URI."""
        self._require_connected()
        return self._submit(lambda: self._client.read_resource(uri, server))  # type: ignore[union-attr]

    # -- internal ----------------------------------------------------------

    def _submit(self, factory: Callable[[], Awaitable[Any]]) -> Any:
        """Enqueue a request for the worker task and block for its result."""
        assert self._loop is not None and self._queue is not None
        future: asyncio.Future[Any] = self._loop.create_future()

        def _enqueue() -> None:
            self._queue.put_nowait((factory, future))  # type: ignore[union-attr]

        self._loop.call_soon_threadsafe(_enqueue)
        # Bridge the asyncio.Future (loop thread) to this calling thread.
        done = threading.Event()
        result_box: dict[str, Any] = {}

        def _on_done(fut: "asyncio.Future[Any]") -> None:
            try:
                result_box["value"] = fut.result()
            except BaseException as exc:  # noqa: BLE001
                result_box["error"] = exc
            finally:
                done.set()

        self._loop.call_soon_threadsafe(future.add_done_callback, _on_done)
        done.wait()
        if "error" in result_box:
            raise result_box["error"]
        return result_box["value"]

    def _require_connected(self) -> None:
        if self._client is None:
            raise MCPClientError("NOT_CONNECTED", "call MCPToolbox.connect() first")
