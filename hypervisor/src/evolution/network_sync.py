import requests

GRID_URL = "http://localhost:5000/skills"
CACHE_URL = "http://localhost:5000/cache"

class NetworkSync:
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
            requests.post(CACHE_URL, json=state_data)
        except Exception as e:
            print(f"Error publishing to Grid cache: {e}")
