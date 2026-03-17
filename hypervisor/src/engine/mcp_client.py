import os
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
    # Security Profile Taxonomy
    S0_LEGACY_LOCKED = "S0_LEGACY_LOCKED"
    S1_BASELINE = "S1_BASELINE"
    S2_HARDENED = "S2_HARDENED"
    S3_ZKML_FULL_NODE = "S3_ZKML_FULL_NODE"

    mcp_compatibility_matrix = {
        S0_LEGACY_LOCKED: [S0_LEGACY_LOCKED],
        S1_BASELINE: [S0_LEGACY_LOCKED, S1_BASELINE, S2_HARDENED, S3_ZKML_FULL_NODE],
        S2_HARDENED: [S2_HARDENED, S3_ZKML_FULL_NODE],
        S3_ZKML_FULL_NODE: [S3_ZKML_FULL_NODE]
    }

    def __init__(self, node_security_profile=S1_BASELINE):
        self.node_security_profile = node_security_profile
        # Allow multiple servers via comma-separated list of SSE URLs
        mcp_env = os.environ.get("MCP_SERVERS", "")
        self.servers = [s.strip() for s in mcp_env.split(",") if s.strip()]

    def check_compatibility(self, peer_profile: str) -> bool:
        """
        Checks if the given peer_profile matches the minimum required profile
        based on our node's security profile and the compatibility matrix.
        """
        allowed_profiles = self.mcp_compatibility_matrix.get(self.node_security_profile, [])
        return peer_profile in allowed_profiles

    async def fetch_context(self, intent_content: str) -> str:
        """
        Connects to all configured MCP servers via SSE, lists their tools and prompts,
        and aggregates them into a context string to make the LLM aware of available capabilities.
        """
        if not self.servers:
            return ""

        aggregated_context = []

        for server in self.servers:
            # We assume URLs might contain a #profile=S1_BASELINE hash to identify their profile for testing.
            # E.g. http://localhost:8000#profile=S2_HARDENED
            peer_profile = self.S1_BASELINE
            if "#profile=" in server:
                server_url, profile_str = server.split("#profile=", 1)
                peer_profile = profile_str
                server = server_url

            if not self.check_compatibility(peer_profile):
                aggregated_context.append(f"[MCP Server {server}]: Connection blocked by Security Compatibility Matrix (Peer Profile: {peer_profile})")
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
