import os
import httpx
from typing import List, Dict, Any

class NCPClient:
    """
    Client for interacting with Node Context Protocol (NCP) servers
    to fetch external intelligence, specialized LLM integrations, or external context.
    """
    def __init__(self):
        # Allow multiple servers via comma-separated list
        ncp_env = os.environ.get("NCP_SERVERS", "")
        self.servers = [s.strip() for s in ncp_env.split(",") if s.strip()]

    async def fetch_context(self, intent_content: str) -> str:
        """
        Queries all configured NCP servers for additional context related to the user's intent.
        Returns a formatted string of aggregated responses.
        """
        if not self.servers:
            return ""

        aggregated_context = []
        payload = {
            "query": intent_content,
            "metadata": {"source": "axiom_hypervisor"}
        }

        async with httpx.AsyncClient(timeout=2.0) as client:
            for server in self.servers:
                try:
                    # Assuming NCP servers expect a POST /context or standard generic query
                    endpoint = f"{server}/context" if not server.endswith("/context") else server
                    # Timeout kept low to prevent halting the main execution pipeline
                    res = await client.post(endpoint, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        # Expecting a standard 'context' or 'data' field
                        server_response = data.get("context", data.get("data", str(data)))
                        aggregated_context.append(f"[NCP Server {server}]: {server_response}")
                except Exception as e:
                    aggregated_context.append(f"[NCP Server {server}]: Offline or Unreachable ({str(e)})")

        if not aggregated_context:
            return ""

        return "\n".join(aggregated_context)
