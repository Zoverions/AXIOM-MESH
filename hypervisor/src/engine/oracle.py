import os
import httpx
import json

class ChainlinkOracle:
    """
    Client for interacting with Chainlink Oracles to fetch verifiable off-chain data feeds.
    Enhances the Truth Context by bringing real-world verifiable data into the hypervisor.
    """
    def __init__(self):
        # We can configure endpoints for chainlink data feeds
        self.oracle_endpoint = os.environ.get("CHAINLINK_ORACLE_ENDPOINT", "")

    async def fetch_data_feed(self, query: str) -> str:
        """
        Attempts to map a user query to an available Chainlink data feed and fetch the verified off-chain data.
        """
        if not self.oracle_endpoint:
            return ""

        # Simplistic mapping of query to feed type, in reality this would be more complex
        feed_id = None
        if "eth" in query.lower() and "price" in query.lower():
            feed_id = "eth-usd"
        elif "btc" in query.lower() and "price" in query.lower():
            feed_id = "btc-usd"
        elif "weather" in query.lower():
            feed_id = "weather"

        if not feed_id:
            return ""

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.oracle_endpoint}/feed/{feed_id}")
                if res.status_code == 200:
                    data = res.json()
                    value = data.get("value", "Unknown")
                    timestamp = data.get("timestamp", "Unknown")
                    return f"[Chainlink Oracle: {feed_id}]: Value = {value} (Verified at {timestamp})"
        except Exception as e:
            return f"[Chainlink Oracle: {feed_id}]: Failed to fetch verifiable data ({str(e)})"

        return ""
