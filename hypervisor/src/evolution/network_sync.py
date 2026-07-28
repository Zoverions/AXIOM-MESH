import httpx
import asyncio
import requests
import os
import hashlib
from ecdsa import SigningKey, NIST256p


GRID_URL = "http://localhost:5000/skills"
CACHE_URL = "http://localhost:5000/cache"

class NetworkSync:
    def __init__(self):
        # Generate or load ECDSA keys for cryptographic identity
        key_path = "data/node_key.pem"
        os.makedirs("data", exist_ok=True)
        if os.path.exists(key_path):
            with open(key_path, "rb") as f:
                self.private_key = SigningKey.from_pem(f.read())
        else:
            self.private_key = SigningKey.generate(curve=NIST256p)
            with open(key_path, "wb") as f:
                f.write(self.private_key.to_pem())

        self.public_key_hex = self.private_key.get_verifying_key().to_string("uncompressed").hex()

    async def sync_skills(self):
        import asyncio
        import httpx
        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    res = await client.get(GRID_URL, timeout=5.0)
                    return res.json()
                except Exception as e:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(base_delay * (2 ** attempt))
                    else:
                        print(f"[Degraded Mode] Failed to sync skills after {max_retries} attempts: {e}")
                        return {"error": str(e)}

    async def publish_skill(self, skill_data):
        import asyncio
        import httpx
        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    await client.post(GRID_URL, json=skill_data, timeout=5.0)
                    return
                except Exception as e:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(base_delay * (2 ** attempt))
                    else:
                        print(f"[Degraded Mode] Failed to publish skill after {max_retries} attempts: {e}")

    async def fetch_web_cache(self, url: str):
        """Fetches a pre-compiled web state from the decentralized Grid cache."""
        import asyncio
        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    res = await client.get(CACHE_URL, params={"url": url}, timeout=5.0)
                    if res.status_code == 200:
                        return res.json()
                    return None
                except Exception as e:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(base_delay * (2 ** attempt))
                    else:
                        print(f"[Degraded Mode] Failed to fetch from Grid cache after {max_retries} attempts: {e}")
                        return None

    async def publish_web_state(self, state_data: dict):
        """Publishes a compiled web state to the decentralized Grid cache."""
        import asyncio
        import httpx
        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    # Sign the payload
                    url = state_data.get("url", "")
                    text_len = state_data.get("text_length", 0)
                    payload_str = f"{url}:{text_len}"

                    hash_val = hashlib.sha256(payload_str.encode()).digest()
                    sig = self.private_key.sign_digest(hash_val)

                    state_data["node_id"] = self.public_key_hex
                    state_data["signature"] = sig.hex()

                    await client.post(CACHE_URL + "?sync=true", json=state_data, timeout=5.0)
                    return
                except Exception as e:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(base_delay * (2 ** attempt))
                    else:
                        print(f"[Degraded Mode] Failed to publish to Grid cache after {max_retries} attempts: {e}")

    async def publish_capability_manifest(self, manifest: dict):
        """Publishes the local capability manifest to the Grid."""
        import asyncio
        import httpx
        url = "http://localhost:5000/peers/manifests"
        payload = {
            "nodeId": self.public_key_hex,
            "manifest": manifest
        }
        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    res = await client.post(url, json=payload, timeout=5.0)
                    res.raise_for_status()
                    return
                except Exception as e:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(base_delay * (2 ** attempt))
                    else:
                        print(f"[Degraded Mode] Failed to publish capability manifest after {max_retries} attempts: {e}")

    async def fetch_peer_manifests(self):
        """Fetches known peer capability manifests from the Grid."""
        import asyncio
        import httpx
        url = "http://localhost:5000/peers/manifests"
        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    res = await client.get(url, timeout=5.0)
                    res.raise_for_status()
                    return res.json()
                except Exception as e:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(base_delay * (2 ** attempt))
                    else:
                        print(f"[Degraded Mode] Failed to fetch peer manifests after {max_retries} attempts: {e}")
                        return {}
