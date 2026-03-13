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

    def sync_skills(self):
        try:
            res = requests.get(GRID_URL)
            return res.json()
        except Exception as e:
            return {"error": str(e)}

    def publish_skill(self, skill_data):
        try:
            requests.post(GRID_URL, json=skill_data)
        except Exception as e:
            print(f"Error publishing skill: {e}")

    def fetch_web_cache(self, url: str):
        """Fetches a pre-compiled web state from the decentralized Grid cache."""
        try:
            res = requests.get(CACHE_URL, params={"url": url})
            if res.status_code == 200:
                return res.json()
            return None
        except Exception as e:
            print(f"Error fetching from Grid cache: {e}")
            return None

    def publish_web_state(self, state_data: dict):
        """Publishes a compiled web state to the decentralized Grid cache."""
        try:
            # Sign the payload
            url = state_data.get("url", "")
            text_len = state_data.get("text_length", 0)
            payload_str = f"{url}:{text_len}"

            hash_val = hashlib.sha256(payload_str.encode()).digest()
            sig = self.private_key.sign_digest(hash_val)

            state_data["node_id"] = self.public_key_hex
            state_data["signature"] = sig.hex()

            requests.post(CACHE_URL + "?sync=true", json=state_data)
        except Exception as e:
            print(f"Error publishing to Grid cache: {e}")
