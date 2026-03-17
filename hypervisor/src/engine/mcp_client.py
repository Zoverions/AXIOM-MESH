import os
import json
import asyncio
from typing import List, Dict, Any, Optional
from mcp.client.sse import sse_client
from mcp.client.session import ClientSession
from contextlib import AsyncExitStack

class MCPClient:
    """
    Client for interacting with Model Context Protocol (MCP) servers
    to expose available tools and prompts to the hypervisor context.
    """
    def __init__(self):
        # Allow multiple servers via comma-separated list of SSE URLs
        mcp_env = os.environ.get("MCP_SERVERS", "")
        self.servers = [s.strip() for s in mcp_env.split(",") if s.strip()]
        self.compatibility_matrix = self._load_compatibility_matrix()

    def _load_compatibility_matrix(self) -> dict:
        try:
            matrix_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "schemas", "mcp_compatibility_matrix.v1.json")
            with open(matrix_path, "r") as f:
                return json.load(f)
        except Exception as e:
            # Fallback if matrix is not found
            return {}

    def verify_peer_compatibility(self, server_url: str) -> bool:
        # In a real environment, the server_url would provide its peer_class and security_profile via a handshake.
        # Here we mock the behavior by checking if the server URL enforces a policy against our compatibility matrix.
        if not self.compatibility_matrix:
            return True # Allow all if no matrix is found

        peer_classes = self.compatibility_matrix.get("peer_classes", [])

        # Example validation: if a server is known as 'legacy', block it based on matrix
        # For demonstration purposes, we assume 'legacy' in url implies S0_LEGACY_LOCKED which might be denied
        if "legacy" in server_url.lower():
            for pc in peer_classes:
                if pc.get("min_security_profile") == "S0_LEGACY_LOCKED" and pc.get("policy") == "deny":
                    return False

        # We assume baseline allows connection
        return True

    async def fetch_context(self, intent_content: str) -> str:
        """
        Connects to all configured MCP servers via SSE, lists their tools and prompts,
        and aggregates them into a context string to make the LLM aware of available capabilities.
        """
        if not self.servers:
            return ""

        aggregated_context = []

        for server in self.servers:
            if not self.verify_peer_compatibility(server):
                aggregated_context.append(f"[MCP Server {server}]: Connection blocked by MCP Compatibility Matrix (Security Profile too low).")
                continue

            try:
                # We connect to each server using SSE transport
                async with AsyncExitStack() as stack:
                    # Establish SSE connection
                    streams = await stack.enter_async_context(sse_client(url=server))
                    read_stream, write_stream = streams

                    # Create and initialize session
                    session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
                    await session.initialize()

                    server_info = [f"[MCP Server {server}] connected successfully."]

                    # Try to list tools
                    try:
                        tools_response = await session.list_tools()
                        if tools_response.tools:
                            server_info.append("Available Tools:")
                            for tool in tools_response.tools:
                                desc = tool.description or "No description"
                                server_info.append(f"  - {tool.name}: {desc}")
                    except Exception as e:
                        server_info.append(f"Could not fetch tools: {e}")

                    # Try to list prompts
                    try:
                        prompts_response = await session.list_prompts()
                        if prompts_response.prompts:
                            server_info.append("Available Prompts:")
                            for prompt in prompts_response.prompts:
                                desc = prompt.description or "No description"
                                server_info.append(f"  - {prompt.name}: {desc}")
                    except Exception as e:
                        pass # Prompts might not be supported

                    aggregated_context.append("\n".join(server_info))

            except Exception as e:
                aggregated_context.append(f"[MCP Server {server}]: Offline or Unreachable ({str(e)})")

        if not aggregated_context:
            return ""

        return "\n\n".join(aggregated_context)
