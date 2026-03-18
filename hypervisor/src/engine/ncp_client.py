import os
import httpx
import json
import jsonschema
import re
import time
from typing import Dict, Any

from src.cortex.dialectic import DialecticOrchestrator

def get_intent_schema():
    schema_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "schemas", "intent.schema.json")
    with open(schema_path, "r") as f:
        return json.load(f)

class NCPClient:
    """
    Client for interacting with Node Context Protocol (NCP) servers
    to fetch external intelligence, specialized LLM integrations, or external context.
    """
    def __init__(self, llm=None):
        # Allow multiple servers via comma-separated list
        ncp_env = os.environ.get("NCP_SERVERS", "")
        self.servers = [s.strip() for s in ncp_env.split(",") if s.strip()]
        self.schema = get_intent_schema()
        self._last_call_time = 0.0
        self._rate_limit_delay = 1.0 # 1 query per second max
        self.llm = llm

    async def fetch_context(self, intent_content: str) -> str:
        """
        Queries all configured NCP servers for additional context related to the user's intent.
        Returns a formatted string of aggregated responses.
        """
        if not self.servers:
            return ""

        now = time.time()
        if now - self._last_call_time < self._rate_limit_delay:
            return "" # Rate limited
        self._last_call_time = now

        aggregated_context = []
        payload = {
            "id": "req-" + str(int(now)),
            "session_id": "ncp-session",
            "channel": "ncp",
            "content": intent_content,
            "metadata": {"source": "axiom_hypervisor"},
            "timestamp": int(now * 1000)
        }

        try:
            jsonschema.validate(instance=payload, schema=self.schema)
        except jsonschema.exceptions.ValidationError as e:
            return f"[NCP Server Error]: Invalid payload format: {e.message}"

        def sanitize(text: str) -> str:
            text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.IGNORECASE)
            text = text.replace("<", "&lt;").replace(">", "&gt;")
            return text

        async with httpx.AsyncClient(timeout=2.0) as client:
            for server in self.servers:
                try:
                    # Assuming NCP servers expect a POST /context or standard generic query
                    endpoint = f"{server}/context" if not server.endswith("/context") else server
                    # Timeout kept low to prevent halting the main execution pipeline
                    res = await client.post(endpoint, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        # Strict Schema Validation: The response MUST conform to the schema.
                        try:
                            jsonschema.validate(instance=data, schema=self.schema)
                            server_response = data.get("content", "")
                            server_response = sanitize(server_response)
                            aggregated_context.append(f"[NCP Server {server}]: {server_response}")
                        except jsonschema.exceptions.ValidationError as e:
                            aggregated_context.append(f"[NCP Server {server} Error]: Invalid response payload format: {e.message}")
                except Exception as e:
                    aggregated_context.append(f"[NCP Server {server}]: Offline or Unreachable ({str(e)})")

        if not aggregated_context:
            return ""

        joined_context = "\n".join(aggregated_context)

        # Route through dialectic for noise reduction and first-principles structural truth
        if self.llm:
            orchestrator = DialecticOrchestrator(self.llm)
            try:
                # We prompt the dialectic orchestrator to synthesize the collected context
                synthesis_prompt = f"Analyze the following NCP aggregated context for the intent '{intent_content}'. Context: {joined_context}"
                joined_context = await orchestrator.synthesize(synthesis_prompt)
            except Exception as e:
                joined_context += f"\n[Dialectic Synthesis Error]: {str(e)}"

        return joined_context

def validate_schema(data: dict, schema: dict) -> bool:
    """Mock implementation of validate_schema"""
    return True
