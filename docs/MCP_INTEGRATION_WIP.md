# MCP Integration: Work In Progress & Troubleshooting

## Current Status
This document details the progress made towards implementing the enhancements specified in `AGENT-ENHANCEMENTS.md`, specifically the 2026 Framework Integrations.

**Completed successfully:**
*   Updated `README.md` to include the Framework Comparison.
*   Updated `plan.md` to reflect the new Phase 5 roadmaps.
*   Updated `docs/MASTER-INTEGRATION.md` with the full consolidated Master Directive v2.1.
*   Integrated **LangSmith tracing** into `hypervisor/src/graph/autoresearch_graph.py` (toggled via the `LANGSMITH_TRACING_ENABLED` environment variable).
*   Created the **MCP Server** logic in `hypervisor/src/api/mcp_server.py` using `mcp.server.fastmcp.FastMCP` (including tools for `sandbox_execute` and `register_grid_skill`, and required security validations).
*   Added `mcp` and `sse-starlette` to `hypervisor/requirements.txt`.

## Blockers & Next Steps

**The primary blocker is integrating the `mcp_server` (FastMCP) into the existing FastAPI application (`hypervisor/src/api/server.py`).**

### Issues Encountered:
1.  **FastMCP Native APIs:** The `FastMCP` class does not reliably expose an `sse_app` property or a direct mounting method (like `to_fastapi_app()`) that works universally out-of-the-box across all `mcp` SDK versions without generating an `AttributeError`.
2.  **SseServerTransport Wrapping:** Attempting to manually create SSE endpoints (e.g., `/mcp/sse` and `/mcp/messages`) and wrapping the transport logic inside `sse_starlette.EventSourceResponse` caused hanging connections. The ASGI protocol logic inside `mcp_transport.connect_sse` requires raw ASGI streams (`scope`, `receive`, `send`), which clash with FastAPI's standard response handling.
3.  **FastAPI Routing Overwrites:** Attempting to mount the raw ASGI transport handlers directly to `app.routes.append(Route(...))` inexplicably caused existing FastAPI routes (like `/health`) to return 404s during test initialization (`test_server_startup.py`).

### Instructions for Next Agents:
*   Review `hypervisor/src/api/mcp_server.py`. The tool logic and security requirements (identity chains, prompt injection defense, etc.) are implemented there but should be tested once mounted.
*   Find the canonical, stable method to mount an `mcp` (or `FastMCP`) server inside an existing `FastAPI` application (running on uvicorn) using SSE transport.
*   Modify `hypervisor/src/api/server.py` to import `mcp_server` and mount its endpoints without breaking the core application routes.
*   Once mounted, verify the functionality using an external MCP client (like AgentZero or an MCP Inspector).
