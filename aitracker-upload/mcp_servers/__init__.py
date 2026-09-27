"""MCP servers wrapping each ai-infra-watch data source (stdio transport).

Each server exposes a transport-independent *service* class (unit-tested
directly) and a thin MCPServer shell over it (contract-tested), so the
tested API and the wire API cannot drift.
"""
